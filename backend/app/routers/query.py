"""Query execution endpoints with session support."""

import logging
import re
import time
import uuid
from datetime import datetime
from typing import Optional, List, Tuple
from contextlib import contextmanager
from fastapi import APIRouter, HTTPException, Query as QueryParam, Header
from fastapi.responses import JSONResponse
from snowflake.connector.errors import DatabaseError, OperationalError, ProgrammingError

from app.models.schemas import (
    QueryRequest, QuerySubmitResponse, QueryStatusResponse,
    QueryResultsResponse, QueryHistoryResponse, QueryHistoryItem,
    QueryStatus, CancelQueryResponse,
    PreflightRequest, PreflightResponse, TableCheckResult, TableSuggestion,
    QueryValidationRequest, QueryValidationResult,
    BatchValidationRequest, BatchValidationResponse,
    QueryExplanationRequest, QueryExplanationResponse, QueryExplanationStep
)
from app.services.session import session_manager
from app.database import query_history_db
from app.utils.logger import logger, generate_request_id, set_request_id

router = APIRouter(prefix="/api/query", tags=["query"])

# =============================================================================
# Constants and Pre-compiled Patterns
# =============================================================================

# Note: Query result storage limits are now in session.py (QueryResultStore)

# Pre-compiled regex patterns for performance (avoid recompiling on each call)
BLOCK_COMMENT_PATTERN = re.compile(r'/\*.*?\*/', re.DOTALL)
LINE_COMMENT_PATTERN = re.compile(r'--.*?$', re.MULTILINE)
FULL_TABLE_PATTERN = re.compile(
    r'(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)',
    re.IGNORECASE
)
PARTIAL_TABLE_PATTERN = re.compile(
    r'(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)(?!\.)',
    re.IGNORECASE
)
BARE_TABLE_PATTERN = re.compile(
    r'(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?!\.)',
    re.IGNORECASE
)
SQL_KEYWORDS = frozenset({
    'SELECT', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'AS', 'ON',
    'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS'
})


@contextmanager
def get_cursor(session):
    """Context manager for safe cursor handling - ensures cleanup."""
    cursor = session.conn.cursor()
    try:
        yield cursor
    finally:
        try:
            cursor.close()
        except Exception as e:
            logger.warning(f"Failed to close cursor: {e}")


def _split_sql_statements(sql: str) -> List[str]:
    """
    Split SQL into individual statements, handling:
    - Single-line comments (-- ...)
    - Block comments (/* ... */)
    - String literals ('...' and "...")
    - Semicolons as statement separators
    
    Returns list of non-empty statements.
    """
    # Remove block comments (using pre-compiled pattern)
    sql = BLOCK_COMMENT_PATTERN.sub('', sql)
    
    # Remove single-line comments (using pre-compiled pattern)
    sql = LINE_COMMENT_PATTERN.sub('', sql)
    
    # Split on semicolons (simple approach - works for most cases)
    # For production, consider a proper SQL parser
    statements = []
    current = []
    in_string = False
    string_char = None
    
    for char in sql:
        if char in ("'", '"') and not in_string:
            in_string = True
            string_char = char
            current.append(char)
        elif char == string_char and in_string:
            in_string = False
            string_char = None
            current.append(char)
        elif char == ';' and not in_string:
            stmt = ''.join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
        else:
            current.append(char)
    
    # Don't forget the last statement (may not end with ;)
    stmt = ''.join(current).strip()
    if stmt:
        statements.append(stmt)
    
    return statements


def _count_statements(sql: str) -> int:
    """Count the number of SQL statements."""
    return len(_split_sql_statements(sql))


def _extract_tables_from_sql(sql: str) -> List[Tuple[str, str, str]]:
    """
    Extract table references from SQL.
    Returns list of (database, schema, table) tuples.
    Uses pre-compiled patterns for better performance.
    """
    # Remove comments using pre-compiled patterns
    clean_sql = LINE_COMMENT_PATTERN.sub('', sql)
    clean_sql = BLOCK_COMMENT_PATTERN.sub('', clean_sql)
    
    tables = []
    
    # Pattern for fully qualified: database.schema.table
    for match in FULL_TABLE_PATTERN.finditer(clean_sql):
        tables.append((match.group(1), match.group(2), match.group(3)))
    
    # Pattern for schema.table (no database)
    for match in PARTIAL_TABLE_PATTERN.finditer(clean_sql):
        # Only add if not already captured as full reference
        schema, table = match.group(1), match.group(2)
        if not any(t[2].upper() == table.upper() for t in tables):
            tables.append((None, schema, table))
    
    # Pattern for bare table name
    for match in BARE_TABLE_PATTERN.finditer(clean_sql):
        table = match.group(1)
        if table.upper() not in SQL_KEYWORDS and not any(t[2].upper() == table.upper() for t in tables):
            tables.append((None, None, table))
    
    return tables


def _check_table_exists(cursor, database: str, schema: str, table: str) -> dict:
    """Check if a table exists and get its row count."""
    result = {
        "exists": False,
        "row_count": None,
        "columns": [],
        "error": None
    }
    
    try:
        # Try to get table info
        fqn = f'"{database}"."{schema}"."{table}"'
        cursor.execute(f"DESCRIBE TABLE {fqn}")
        columns = [row[0] for row in cursor.fetchall()]
        result["columns"] = columns
        result["exists"] = True
        
        # Get approximate row count (fast)
        cursor.execute(f"SELECT COUNT(*) FROM {fqn} LIMIT 1")
        row = cursor.fetchone()
        result["row_count"] = row[0] if row else 0
        
    except Exception as e:
        error_msg = str(e)
        if "does not exist" in error_msg.lower() or "not authorized" in error_msg.lower():
            result["exists"] = False
            result["error"] = "Table does not exist or not authorized"
        else:
            result["error"] = error_msg
    
    return result


def _find_similar_tables(cursor, database: str, schema: str, target_table: str, limit: int = 10) -> List[dict]:
    """Find similar tables that have data."""
    similar = []
    
    try:
        # Get all tables in the schema
        cursor.execute(f'SHOW TABLES IN "{database}"."{schema}"')
        tables = cursor.fetchall()
        
        target_upper = target_table.upper().replace('_ENTITY', '').replace('_', '')
        
        for row in tables:
            table_name = row[1]  # name column
            row_count = row[6] if len(row) > 6 and row[6] else 0  # row_count column
            
            # Skip empty tables
            try:
                row_count = int(row_count) if row_count else 0
            except (ValueError, TypeError):
                row_count = 0
            
            if row_count == 0:
                continue
            
            # Calculate similarity
            table_upper = table_name.upper().replace('_ENTITY', '').replace('_', '')
            
            # Exact match scores highest
            if table_upper == target_upper:
                score = 1.0
                reason = "Exact match with data"
            # Contains target
            elif target_upper in table_upper or table_upper in target_upper:
                score = 0.8
                reason = f"Similar name, has {row_count:,} rows"
            # Shared prefix (at least 4 chars)
            elif len(target_upper) >= 4 and table_upper.startswith(target_upper[:4]):
                score = 0.6
                reason = f"Same category, has {row_count:,} rows"
            # Entity table with data
            elif table_name.upper().endswith('_ENTITY') and row_count > 0:
                score = 0.3
                reason = f"Entity table with {row_count:,} rows"
            else:
                continue
            
            similar.append({
                "table_name": table_name,
                "fully_qualified": f"{database}.{schema}.{table_name}",
                "row_count": row_count,
                "relevance_score": score,
                "reason": reason
            })
        
        # Sort by score descending, then by row_count
        similar.sort(key=lambda x: (-x["relevance_score"], -x["row_count"]))
        return similar[:limit]
        
    except Exception as e:
        logger.warning(f"Failed to find similar tables: {e}")
        return []


def _generate_suggested_query(original_sql: str, replacements: dict) -> str:
    """Generate a suggested query with table replacements."""
    suggested = original_sql
    
    for original, replacement in replacements.items():
        # Try different patterns
        patterns = [
            (rf'(FROM|JOIN)\s+{re.escape(original)}\b', rf'\1 {replacement}'),
            (rf'(FROM|JOIN)\s+[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*\.{re.escape(original.split(".")[-1])}\b', rf'\1 {replacement}'),
        ]
        
        for pattern, repl in patterns:
            suggested = re.sub(pattern, repl, suggested, flags=re.IGNORECASE)
    
    return suggested


VALID_STATUSES = {s.value for s in QueryStatus}


class QueryExecutionError(Exception):
    """Base exception for query execution issues."""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class SessionNotFoundError(QueryExecutionError):
    def __init__(self):
        super().__init__(
            "Session not found or expired. Please reconnect.",
            status_code=401
        )


def _get_session_or_401(session_id: Optional[str]):
    """Get session from header or raise 401."""
    if not session_id:
        raise HTTPException(
            status_code=401, 
            detail="X-Session-ID header required. Please connect first."
        )
    
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Session not found or expired. Please reconnect."
        )
    
    return session


def _record_query_history(
    query_id: str,
    sql: str,
    request: QueryRequest,
    status: str,
    row_count: Optional[int] = None,
    error_message: Optional[str] = None,
    execution_time_ms: Optional[int] = None
) -> None:
    """Record query to history, logging failures without raising."""
    try:
        query_history_db.add_query(
            query_id=query_id,
            sql=sql,
            database=request.database,
            schema=request.schema_name,
            warehouse=request.warehouse,
            status=status,
            row_count=row_count,
            error_message=error_message,
            started_at=datetime.utcnow().isoformat(),
            completed_at=datetime.utcnow().isoformat(),
            duration_ms=execution_time_ms
        )
    except Exception as e:
        logger.error(f"Failed to record query history for {query_id}: {e}")


@router.post("/preflight", response_model=PreflightResponse)
async def preflight_check(
    request: PreflightRequest,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Check a query before execution.
    
    Validates tables exist, checks row counts, and suggests alternatives
    if tables are empty or don't exist.
    """
    session = _get_session_or_401(x_session_id)
    
    # Default database/schema from request or session
    default_db = request.database or session.database or "FIELD_METADATA"
    default_schema = request.schema_name or session.schema or "PUBLIC"
    
    # Extract tables from SQL
    tables = _extract_tables_from_sql(request.sql)
    
    if not tables:
        return PreflightResponse(
            valid=True,
            message="No tables detected in query (might be a SHOW/DESCRIBE command)",
            tables_checked=[],
            suggestions=[],
            issues=[]
        )
    
    tables_checked = []
    issues = []
    suggestions = []
    replacements = {}
    
    # Use context manager for safe cursor cleanup
    with get_cursor(session) as cursor:
        try:
            for db, schema, table in tables:
                # Resolve defaults
                resolved_db = db or default_db
                resolved_schema = schema or default_schema
                fqn = f"{resolved_db}.{resolved_schema}.{table}"
                
                # Check table
                check_result = _check_table_exists(cursor, resolved_db, resolved_schema, table)
                
                table_check = TableCheckResult(
                    table_name=table,
                    fully_qualified=fqn,
                    exists=check_result["exists"],
                    row_count=check_result["row_count"],
                    columns=check_result["columns"],
                    error=check_result["error"]
                )
                tables_checked.append(table_check)
                
                # Collect issues
                if not check_result["exists"]:
                    issues.append(f"Table '{fqn}' does not exist or you don't have access")
                    
                    # Find alternatives
                    similar = _find_similar_tables(cursor, resolved_db, resolved_schema, table)
                    for s in similar:
                        suggestions.append(TableSuggestion(**s))
                        # Use first high-scoring suggestion for replacement
                        if s["relevance_score"] >= 0.6 and fqn not in replacements:
                            replacements[fqn] = s["fully_qualified"]
                            
                elif check_result["row_count"] == 0:
                    issues.append(f"Table '{fqn}' exists but is empty (0 rows)")
                    
                    # Find alternatives with data
                    similar = _find_similar_tables(cursor, resolved_db, resolved_schema, table)
                    for s in similar:
                        suggestions.append(TableSuggestion(**s))
                        # Suggest replacement for empty tables too
                        if s["relevance_score"] >= 0.5 and fqn not in replacements:
                            replacements[fqn] = s["fully_qualified"]
            
            # Generate suggested query if we have replacements
            suggested_query = None
            if replacements:
                suggested_query = _generate_suggested_query(request.sql, replacements)
            
            # Build response message
            if not issues:
                message = f"All {len(tables_checked)} table(s) exist and have data"
                valid = True
            else:
                message = f"Found {len(issues)} issue(s) with query"
                valid = False
            
            return PreflightResponse(
                valid=valid,
                tables_checked=tables_checked,
                issues=issues,
                suggestions=suggestions,
                suggested_query=suggested_query,
                message=message
            )
            
        except Exception as e:
            logger.error(f"Preflight check failed: {e}")
            return PreflightResponse(
                valid=False,
                message=f"Preflight check failed: {str(e)}",
                issues=[str(e)]
            )


# Note: Query result eviction is now handled by QueryResultStore in session.py


@router.post("/execute", response_model=QuerySubmitResponse)
async def execute_query(
    request: QueryRequest,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Submit a SQL query for execution.
    
    Requires X-Session-ID header from successful /api/connect.
    
    Response codes:
    - 200 { status: 'SUCCESS', ... } -> query executed successfully
    - 200 { status: 'FAILED', ... } -> SQL error (syntax, permissions, etc.)
    - 401 { reason: 'SESSION_NOT_FOUND' | 'AUTH_FAILED' | 'TOKEN_EXPIRED' } -> session invalid
    - 503 -> Snowflake unreachable / network error
    - 504 -> Query timed out
    """
    # Generate request ID for correlation
    req_id = generate_request_id()
    set_request_id(req_id)
    
    if not request.sql or not request.sql.strip():
        raise HTTPException(status_code=400, detail="SQL query cannot be empty")
    
    session = _get_session_or_401(x_session_id)
    query_id = str(uuid.uuid4())
    start_time = time.time()
    timeout_seconds = request.timeout or 60  # Define early for error handlers
    
    # Use context manager for safe cursor cleanup
    with get_cursor(session) as cursor:
        try:
            # Set statement timeout from request (default 60s)
            cursor.execute(f"ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = {timeout_seconds}")
            
            # Set query tag for correlation in Snowflake query history
            query_tag = f"MDLH:{req_id}"
            cursor.execute(f"ALTER SESSION SET QUERY_TAG = '{query_tag}'")
            
            logger.info(f"[{req_id}] Executing query with {timeout_seconds}s timeout")
            
            # Count statements (properly handles comments and strings)
            statement_count = _count_statements(request.sql)
            
            # Execute query (enable multi-statement if needed)
            columns = []
            rows = []
            
            if statement_count > 1:
                logger.info(f"[{req_id}] Executing {statement_count} statements")
                cursor.execute(request.sql, num_statements=statement_count)
                
                # FIX: Wrap multi-statement loop in try/except to handle cursor.nextset() failures
                try:
                    # For multi-statement, collect results from each statement
                    # Keep the last non-empty result set (usually the SELECT/SHOW)
                    while True:
                        try:
                            if cursor.description:
                                current_columns = [desc[0] for desc in cursor.description]
                                current_rows = cursor.fetchall()
                                # Keep results if this statement returned rows
                                if current_rows or not rows:
                                    columns = current_columns
                                    rows = [list(row) for row in current_rows]
                                    logger.info(f"[{req_id}] Statement returned {len(rows)} rows, {len(columns)} columns")
                        except Exception as stmt_err:
                            logger.warning(f"[{req_id}] Error processing statement result: {stmt_err}")
                        
                        # Move to next result set, break if none left
                        try:
                            if not cursor.nextset():
                                break
                        except Exception as next_err:
                            logger.warning(f"[{req_id}] Error in nextset(): {next_err}")
                            break
                except Exception as multi_err:
                    logger.warning(f"[{req_id}] Multi-statement processing error: {multi_err}")
                    # Continue with whatever results we have
            else:
                cursor.execute(request.sql)
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                rows = cursor.fetchall()
                rows = [list(row) for row in rows]
            
            execution_time_ms = int((time.time() - start_time) * 1000)
            
            # Store results using the new QueryResultStore
            session.query_results.put(query_id, {
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "status": QueryStatus.SUCCESS,
                "execution_time_ms": execution_time_ms,
                "started_at": datetime.utcnow().isoformat(),
                "completed_at": datetime.utcnow().isoformat()
            })
            
            _record_query_history(
                query_id, request.sql, request,
                QueryStatus.SUCCESS, len(rows), None, execution_time_ms
            )
            
            logger.info(f"[{req_id}] Query SUCCESS: {len(rows)} rows in {execution_time_ms}ms")
            
            return QuerySubmitResponse(
                query_id=query_id,
                status=QueryStatus.SUCCESS,
                message="Query executed successfully",
                execution_time_ms=execution_time_ms,
                row_count=len(rows)
            )
            
        except (OperationalError, TimeoutError) as e:
            # Network errors or timeouts -> 503 or 504
            execution_time_ms = int((time.time() - start_time) * 1000)
            error_msg = str(e).lower()
            
            # Check if it's a statement timeout
            if "timeout" in error_msg or "statement canceled" in error_msg:
                logger.warning(f"[{req_id}] Query TIMEOUT after {execution_time_ms}ms: {e}")
                return JSONResponse(
                    status_code=504,
                    content={
                        "query_id": query_id,
                        "status": "TIMEOUT",
                        "reason": "QUERY_TIMEOUT",
                        "message": f"Query exceeded {timeout_seconds}s timeout",
                        "execution_time_ms": execution_time_ms
                    }
                )
            
            # Network/connection error -> 503
            logger.error(f"[{req_id}] Snowflake UNREACHABLE: {e}")
            return JSONResponse(
                status_code=503,
                content={
                    "query_id": query_id,
                    "status": "FAILED",
                    "reason": "SNOWFLAKE_UNREACHABLE",
                    "message": "Snowflake unreachable",
                    "error": str(e),
                    "execution_time_ms": execution_time_ms
                }
            )
            
        except (DatabaseError, ProgrammingError) as e:
            # SQL errors (syntax, permissions, etc.) -> normal failure response
            execution_time_ms = int((time.time() - start_time) * 1000)
            error_msg = str(e)
            
            # Store failure info using new interface
            session.query_results.put(query_id, {
                "status": QueryStatus.FAILED,
                "error_message": error_msg,
                "execution_time_ms": execution_time_ms,
                "started_at": datetime.utcnow().isoformat(),
                "completed_at": datetime.utcnow().isoformat()
            })
            
            _record_query_history(
                query_id, request.sql, request,
                QueryStatus.FAILED, None, error_msg, execution_time_ms
            )
            
            logger.warning(f"[{req_id}] Query FAILED: {error_msg[:100]}")
            
            return QuerySubmitResponse(
                query_id=query_id,
                status=QueryStatus.FAILED,
                message=error_msg,
                execution_time_ms=execution_time_ms
            )
            
        except Exception as e:
            execution_time_ms = int((time.time() - start_time) * 1000)
            error_msg = str(e)
            
            # Store failure info using new interface
            session.query_results.put(query_id, {
                "status": QueryStatus.FAILED,
                "error_message": error_msg,
                "execution_time_ms": execution_time_ms,
                "started_at": datetime.utcnow().isoformat(),
                "completed_at": datetime.utcnow().isoformat()
            })
            
            _record_query_history(
                query_id, request.sql, request,
                QueryStatus.FAILED, None, error_msg, execution_time_ms
            )
            
            logger.error(f"[{req_id}] Unexpected error: {e}")
            
            return QuerySubmitResponse(
                query_id=query_id,
                status=QueryStatus.FAILED,
                message=error_msg,
                execution_time_ms=execution_time_ms
            )


@router.get("/{query_id}/status", response_model=QueryStatusResponse)
async def get_query_status(
    query_id: str,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """Get the status of a query."""
    session = _get_session_or_401(x_session_id)
    
    result = session.query_results.get(query_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Query '{query_id}' not found or expired")
    
    return QueryStatusResponse(
        query_id=query_id,
        status=result["status"],
        row_count=result.get("row_count"),
        execution_time_ms=result.get("execution_time_ms"),
        error_message=result.get("error_message"),
        started_at=result.get("started_at"),
        completed_at=result.get("completed_at")
    )


@router.get("/{query_id}/results", response_model=QueryResultsResponse)
async def get_query_results(
    query_id: str,
    page: int = QueryParam(1, ge=1, description="Page number"),
    page_size: int = QueryParam(100, ge=1, le=1000, description="Results per page"),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """Get paginated results for a completed query."""
    session = _get_session_or_401(x_session_id)
    
    result = session.query_results.get(query_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Query '{query_id}' not found or expired")
    
    if result["status"] == QueryStatus.FAILED:
        raise HTTPException(
            status_code=400,
            detail=f"Query failed: {result.get('error_message', 'Unknown error')}"
        )
    
    if result["status"] == QueryStatus.RUNNING:
        raise HTTPException(status_code=202, detail="Query is still running")
    
    rows = result.get("rows", [])
    columns = result.get("columns", [])
    
    # Paginate
    start = (page - 1) * page_size
    end = start + page_size
    paginated_rows = rows[start:end]
    
    return QueryResultsResponse(
        columns=columns,
        rows=paginated_rows,
        total_rows=len(rows),
        page=page,
        page_size=page_size,
        has_more=end < len(rows)
    )


@router.post("/{query_id}/cancel", response_model=CancelQueryResponse)
async def cancel_query(
    query_id: str,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """Cancel a running query."""
    session = _get_session_or_401(x_session_id)
    
    result = session.query_results.get(query_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Query '{query_id}' not found or expired")
    
    if result["status"] != QueryStatus.RUNNING:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel query with status '{result['status']}'"
        )
    
    # Mark as cancelled - update in store
    result["status"] = QueryStatus.CANCELLED
    result["completed_at"] = datetime.utcnow().isoformat()
    session.query_results.put(query_id, result)
    
    return CancelQueryResponse(message="Query cancelled", query_id=query_id)


@router.get("/history", response_model=QueryHistoryResponse)
async def get_query_history(
    limit: int = QueryParam(50, ge=1, le=200, description="Number of queries to return"),
    offset: int = QueryParam(0, ge=0, description="Offset for pagination"),
    status: Optional[str] = QueryParam(None, description="Filter by status")
):
    """Get query execution history."""
    if status is not None and status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status filter '{status}'. Valid: {', '.join(sorted(VALID_STATUSES))}"
        )
    
    items, total = query_history_db.get_history(limit, offset, status)
    return QueryHistoryResponse(
        items=[QueryHistoryItem(**item) for item in items],
        total=total,
        limit=limit,
        offset=offset
    )


@router.delete("/history", response_model=dict)
async def clear_query_history():
    """Clear all query history."""
    query_history_db.clear_history()
    return {"message": "Query history cleared"}


# =============================================================================
# Batch Validation Endpoints
# =============================================================================

def _explain_sql_clause(clause_type: str, sql_snippet: str) -> Tuple[str, Optional[str]]:
    """Generate plain English explanation for a SQL clause."""
    explanations = {
        "SELECT": (
            f"**Choosing columns to display**: This tells the database which columns (fields) to include in the results.",
            "Tip: Use SELECT * to get all columns, or list specific ones like SELECT name, email"
        ),
        "FROM": (
            f"**Specifying the data source**: This tells the database which table to query.",
            "Tip: Tables in MDLH end with _ENTITY (e.g., TABLE_ENTITY stores info about tables)"
        ),
        "WHERE": (
            f"**Filtering rows**: Only rows matching these conditions will be included.",
            "Tip: Use AND to combine conditions, OR for alternatives"
        ),
        "ORDER BY": (
            f"**Sorting results**: Arranges rows in a specific order.",
            "Tip: Add DESC for descending order (newest/highest first)"
        ),
        "LIMIT": (
            f"**Restricting row count**: Only returns this many rows maximum.",
            "Tip: Start with LIMIT 10 to preview data before running large queries"
        ),
        "GROUP BY": (
            f"**Grouping data**: Combines rows with the same values for aggregation.",
            "Tip: Use with COUNT(), SUM(), AVG() to get statistics"
        ),
        "JOIN": (
            f"**Combining tables**: Connects data from multiple tables.",
            "Tip: JOIN connects tables using a common column (usually GUID)"
        ),
        "WITH": (
            f"**Creating a temporary result set**: Defines a named subquery for reuse.",
            "Tip: CTEs (WITH clauses) make complex queries more readable"
        ),
    }
    
    return explanations.get(clause_type, (f"SQL clause: {clause_type}", None))


def _parse_sql_for_explanation(sql: str) -> List[QueryExplanationStep]:
    """Parse SQL and generate step-by-step explanation."""
    steps = []
    step_num = 1
    
    # Clean up SQL
    clean_sql = re.sub(r'--[^\n]*', '', sql)  # Remove single-line comments
    clean_sql = re.sub(r'/\*.*?\*/', '', clean_sql, flags=re.DOTALL)  # Remove block comments
    clean_sql = ' '.join(clean_sql.split())  # Normalize whitespace
    
    # Pattern to find main clauses
    clause_patterns = [
        (r'\bWITH\s+(\w+)\s+AS\s*\(', 'WITH'),
        (r'\bSELECT\s+(.*?)(?=\bFROM\b|$)', 'SELECT'),
        (r'\bFROM\s+([\w."]+(?:\s*,\s*[\w."]+)*)', 'FROM'),
        (r'\b(LEFT|RIGHT|INNER|OUTER|CROSS)?\s*JOIN\s+([\w."]+)', 'JOIN'),
        (r'\bWHERE\s+(.*?)(?=\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|\bHAVING\b|$)', 'WHERE'),
        (r'\bGROUP BY\s+(.*?)(?=\bHAVING\b|\bORDER BY\b|\bLIMIT\b|$)', 'GROUP BY'),
        (r'\bHAVING\s+(.*?)(?=\bORDER BY\b|\bLIMIT\b|$)', 'HAVING'),
        (r'\bORDER BY\s+(.*?)(?=\bLIMIT\b|$)', 'ORDER BY'),
        (r'\bLIMIT\s+(\d+)', 'LIMIT'),
    ]
    
    for pattern, clause_type in clause_patterns:
        match = re.search(pattern, clean_sql, re.IGNORECASE | re.DOTALL)
        if match:
            snippet = match.group(0)[:100] + ('...' if len(match.group(0)) > 100 else '')
            explanation, tip = _explain_sql_clause(clause_type, snippet)
            
            steps.append(QueryExplanationStep(
                step_number=step_num,
                clause=clause_type,
                sql_snippet=snippet.strip(),
                explanation=explanation,
                tip=tip
            ))
            step_num += 1
    
    return steps


def _generate_query_summary(sql: str, tables: List[str], columns: List[str]) -> str:
    """Generate a one-line summary of what the query does."""
    table_str = tables[0] if len(tables) == 1 else f"{len(tables)} tables"
    
    if 'COUNT(*)' in sql.upper() or 'COUNT(' in sql.upper():
        return f"Counts records in {table_str}"
    elif 'SUM(' in sql.upper() or 'AVG(' in sql.upper():
        return f"Calculates statistics from {table_str}"
    elif 'GROUP BY' in sql.upper():
        return f"Groups and summarizes data from {table_str}"
    elif 'JOIN' in sql.upper():
        return f"Combines data from {table_str} based on matching values"
    elif len(columns) == 1 and columns[0] == '*':
        return f"Retrieves all columns from {table_str}"
    else:
        return f"Retrieves {len(columns)} columns from {table_str}"


def _execute_and_sample(cursor, sql: str, sample_limit: int = 3) -> dict:
    """Execute a query and return sample results."""
    result = {
        "success": False,
        "row_count": 0,
        "columns": [],
        "sample_data": [],
        "execution_time_ms": 0,
        "error_message": None
    }
    
    try:
        start = time.time()
        cursor.execute(sql)
        
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = cursor.fetchall()
        
        result["success"] = True
        result["row_count"] = len(rows)
        result["columns"] = columns
        result["execution_time_ms"] = int((time.time() - start) * 1000)
        
        # Convert sample rows to dicts
        for row in rows[:sample_limit]:
            row_dict = {}
            for i, col in enumerate(columns):
                val = row[i]
                # Convert non-JSON-serializable types
                if isinstance(val, (datetime,)):
                    val = val.isoformat()
                elif isinstance(val, bytes):
                    val = val.decode('utf-8', errors='replace')
                row_dict[col] = val
            result["sample_data"].append(row_dict)
            
    except Exception as e:
        result["error_message"] = str(e)
        result["success"] = False
    
    return result


import asyncio
from concurrent.futures import ThreadPoolExecutor

# Thread pool for parallel query execution (batch validation)
_batch_executor = ThreadPoolExecutor(max_workers=5)


def _validate_single_query(session, query_req, default_db, default_schema, include_samples, sample_limit):
    """
    Validate a single query (runs in thread pool).
    Returns tuple of (validation_result, status) for summary aggregation.
    """
    sql = query_req.sql.strip()
    
    with get_cursor(session) as cursor:
        # Execute the query
        exec_result = _execute_and_sample(
            cursor, sql, 
            sample_limit if include_samples else 0
        )
        
        # Determine status
        if exec_result["error_message"]:
            status = "error"
        elif exec_result["row_count"] == 0:
            status = "empty"
        else:
            status = "success"
        
        # Build result
        validation_result = QueryValidationResult(
            query_id=query_req.query_id,
            status=status,
            row_count=exec_result["row_count"],
            sample_data=exec_result["sample_data"] if include_samples else None,
            columns=exec_result["columns"],
            execution_time_ms=exec_result["execution_time_ms"],
            error_message=exec_result["error_message"]
        )
        
        # If failed or empty, try to find alternative
        if status in ("error", "empty"):
            tables = _extract_tables_from_sql(sql)
            if tables:
                db, schema, table = tables[0]
                resolved_db = db or default_db
                resolved_schema = schema or default_schema
                
                similar = _find_similar_tables(
                    cursor, resolved_db, resolved_schema, table, limit=5
                )
                
                if similar:
                    best = similar[0]
                    suggested_sql = re.sub(
                        rf'(FROM|JOIN)\s+[\w."]*{re.escape(table)}\b',
                        rf'\1 {best["fully_qualified"]}',
                        sql,
                        flags=re.IGNORECASE
                    )
                    
                    suggested_result = _execute_and_sample(cursor, suggested_sql, 3)
                    
                    if suggested_result["success"] and suggested_result["row_count"] > 0:
                        validation_result.suggested_query = suggested_sql
                        validation_result.suggested_query_result = {
                            "row_count": suggested_result["row_count"],
                            "sample_data": suggested_result["sample_data"],
                            "columns": suggested_result["columns"]
                        }
        
        return validation_result, status


@router.post("/validate-batch", response_model=BatchValidationResponse)
async def validate_batch(
    request: BatchValidationRequest,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Validate multiple queries at once.
    
    For each query:
    - Executes it to check if it works
    - Returns row count and sample data
    - If empty/failed, suggests a working alternative
    
    Queries are executed in parallel (up to 5 concurrent) for performance.
    """
    session = _get_session_or_401(x_session_id)
    
    default_db = request.database or session.database or "FIELD_METADATA"
    default_schema = request.schema_name or session.schema or "PUBLIC"
    
    # For small batches, run sequentially (overhead of parallelism not worth it)
    if len(request.queries) <= 2:
        results = []
        summary = {"success": 0, "empty": 0, "error": 0}
        
        for query_req in request.queries:
            try:
                result, status = _validate_single_query(
                    session, query_req, default_db, default_schema,
                    request.include_samples, request.sample_limit
                )
                results.append(result)
                summary[status] += 1
            except Exception as e:
                logger.error(f"Query validation failed: {e}")
                results.append(QueryValidationResult(
                    query_id=query_req.query_id,
                    status="error",
                    error_message=str(e)
                ))
                summary["error"] += 1
        
        return BatchValidationResponse(
            results=results,
            summary=summary,
            validated_at=datetime.utcnow().isoformat()
        )
    
    # For larger batches, run in parallel with semaphore for concurrency control
    loop = asyncio.get_event_loop()
    
    async def validate_with_semaphore(query_req, semaphore):
        async with semaphore:
            return await loop.run_in_executor(
                _batch_executor,
                _validate_single_query,
                session, query_req, default_db, default_schema,
                request.include_samples, request.sample_limit
            )
    
    try:
        # Limit concurrent queries to prevent overwhelming Snowflake
        semaphore = asyncio.Semaphore(5)
        
        tasks = [
            validate_with_semaphore(query_req, semaphore)
            for query_req in request.queries
        ]
        
        task_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        results = []
        summary = {"success": 0, "empty": 0, "error": 0}
        
        for i, task_result in enumerate(task_results):
            if isinstance(task_result, Exception):
                logger.error(f"Parallel validation failed for query {i}: {task_result}")
                results.append(QueryValidationResult(
                    query_id=request.queries[i].query_id,
                    status="error",
                    error_message=str(task_result)
                ))
                summary["error"] += 1
            else:
                validation_result, status = task_result
                results.append(validation_result)
                summary[status] += 1
        
        return BatchValidationResponse(
            results=results,
            summary=summary,
            validated_at=datetime.utcnow().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Batch validation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/explain", response_model=QueryExplanationResponse)
async def explain_query(
    request: QueryExplanationRequest,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Explain a SQL query in plain English.
    
    Breaks down the query into steps with explanations suitable for SQL beginners.
    Optionally executes the query and shows sample results.
    """
    session = _get_session_or_401(x_session_id) if request.include_execution else None
    
    sql = request.sql.strip()
    
    # Parse SQL structure
    steps = _parse_sql_for_explanation(sql)
    
    # Extract tables and columns
    tables = _extract_tables_from_sql(sql)
    table_names = [f"{t[0] or ''}.{t[1] or ''}.{t[2]}".strip('.') for t in tables]
    
    # Extract selected columns
    select_match = re.search(r'SELECT\s+(.*?)\s+FROM', sql, re.IGNORECASE | re.DOTALL)
    if select_match:
        cols_str = select_match.group(1)
        if cols_str.strip() == '*':
            columns = ['*']
        else:
            columns = [c.strip().split()[-1] for c in cols_str.split(',')]
    else:
        columns = []
    
    # Generate summary
    summary = _generate_query_summary(sql, table_names, columns)
    
    # Format SQL nicely
    formatted = sql
    for keyword in ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIMIT', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN']:
        formatted = re.sub(rf'\b({keyword})\b', rf'\n\1', formatted, flags=re.IGNORECASE)
    formatted = formatted.strip()
    
    response = QueryExplanationResponse(
        original_sql=sql,
        formatted_sql=formatted,
        steps=steps,
        summary=summary,
        tables_used=table_names,
        columns_selected=columns
    )
    
    # Execute if requested
    if request.include_execution and session:
        with get_cursor(session) as cursor:
            exec_result = _execute_and_sample(cursor, sql, 5)
            
            response.executed = True
            response.row_count = exec_result["row_count"]
            response.sample_data = exec_result["sample_data"]
            response.execution_time_ms = exec_result["execution_time_ms"]
            response.error_message = exec_result["error_message"]
    
    return response
