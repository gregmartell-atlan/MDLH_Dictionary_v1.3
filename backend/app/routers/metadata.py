"""Metadata discovery endpoints for schema browser with session support."""

import re
from fastapi import APIRouter, HTTPException, Query, Header
from fastapi.responses import JSONResponse
from typing import List, Optional
import snowflake.connector.errors
from snowflake.connector.errors import OperationalError
from app.models.schemas import DatabaseInfo, SchemaInfo, TableInfo, ColumnInfo
from app.services.session import session_manager
from app.services import metadata_cache
from app.utils.logger import logger

router = APIRouter(prefix="/api/metadata", tags=["metadata"])


def _validate_identifier(name: str) -> str:
    """Validate and quote Snowflake identifier to prevent SQL injection."""
    if not name or not re.match(r'^[A-Za-z_][A-Za-z0-9_$]*$', name):
        if not re.match(r'^"[^"]*"$', name):  # Already quoted
            # Quote the identifier
            name = '"' + name.replace('"', '""') + '"'
    return name


def _get_session_or_none(session_id: Optional[str]):
    """Get session from header, returns None if invalid."""
    if not session_id:
        return None
    return session_manager.get_session(session_id)


def _handle_snowflake_error(e: Exception, context: str):
    """
    Handle Snowflake errors gracefully.
    
    Returns:
    - [] for permission/access issues
    - JSONResponse with 503 for network/timeout issues
    """
    error_msg = str(e)
    logger.warning(f"[Metadata] {context}: {error_msg}")
    
    # Network/timeout errors -> return 503 so frontend knows backend is unreachable
    if isinstance(e, (OperationalError, TimeoutError)):
        return JSONResponse(
            status_code=503,
            content={"error": "Snowflake unreachable", "detail": error_msg}
        )
    
    # Permission/access errors - return empty list instead of 500
    if isinstance(e, snowflake.connector.errors.ProgrammingError):
        error_code = getattr(e, 'errno', None)
        # Common permission-related error codes
        # 2003: Object does not exist or not authorized
        # 2043: Insufficient privileges
        # 90105: Cannot perform operation
        if error_code in (2003, 2043, 90105) or 'does not exist' in error_msg.lower() or 'not authorized' in error_msg.lower():
            return []
    
    # For other errors, still return empty list but log it
    # This prevents the UI from breaking on edge cases
    return []


def _get_database_priority(name: str) -> int:
    """
    Get priority score for a database (lower = higher priority).

    Priority order:
    0 - MDLH metadata databases (FIELD_METADATA, *_MDLH, METADATA_*, etc.)
    1 - Common analytics databases (ANALYTICS, PROD, WAREHOUSE)
    2 - Standard databases (everything else)
    3 - System databases (SNOWFLAKE, SNOWFLAKE_SAMPLE_DATA)
    """
    name_upper = name.upper()

    # System databases - lowest priority
    if name_upper in ('SNOWFLAKE', 'SNOWFLAKE_SAMPLE_DATA'):
        return 3

    # MDLH-related databases - highest priority
    mdlh_patterns = (
        'METADATA', 'MDLH', 'FIELD_METADATA', 'ATLAN',
        'CATALOG', 'GOVERNANCE', 'DATA_CATALOG'
    )
    for pattern in mdlh_patterns:
        if pattern in name_upper:
            return 0

    # Common analytics databases - second priority
    analytics_patterns = ('ANALYTICS', 'PROD', 'WAREHOUSE', 'DWH', 'MART', 'LAKEHOUSE')
    for pattern in analytics_patterns:
        if pattern in name_upper:
            return 1

    # Everything else
    return 2


@router.get("/databases", response_model=List[DatabaseInfo])
async def list_databases(
    refresh: bool = False,
    prioritize: bool = Query(True, description="Sort databases by MDLH/popularity priority"),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """List all accessible databases, prioritized by MDLH relevance.

    Databases are sorted by priority:
    1. MDLH/metadata databases (FIELD_METADATA, *_MDLH, etc.)
    2. Common analytics databases (ANALYTICS, PROD, etc.)
    3. Standard databases
    4. System databases (SNOWFLAKE)

    Within each priority level, databases are sorted alphabetically.
    """
    session = _get_session_or_none(x_session_id)
    if not session:
        return []

    # Check cache first
    if not refresh:
        cached = metadata_cache.get_databases()
        if cached:
            return cached

    try:
        cursor = session.conn.cursor()
        cursor.execute("SHOW DATABASES")

        databases = []
        for row in cursor.fetchall():
            db_name = row[1]  # name is typically second column
            databases.append({
                "name": db_name,
                "owner": row[4] if len(row) > 4 else None,
                "created": str(row[9]) if len(row) > 9 else None,
                "comment": row[8] if len(row) > 8 else None,
                "priority": _get_database_priority(db_name) if prioritize else 2
            })
        cursor.close()

        # Sort by priority first, then alphabetically
        if prioritize:
            databases.sort(key=lambda d: (d.get("priority", 2), d["name"].lower()))

        # Remove priority from response (it's internal)
        for db in databases:
            db.pop("priority", None)

        metadata_cache.set_databases(databases)
        logger.info(f"[Metadata] list_databases(): Found {len(databases)} databases (prioritized={prioritize})")
        return [DatabaseInfo(**db) for db in databases]
    except Exception as e:
        return _handle_snowflake_error(e, "list_databases")


@router.get("/schemas", response_model=List[SchemaInfo])
async def list_schemas(
    database: str = Query(..., description="Database name"),
    refresh: bool = False,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """List all schemas in a database."""
    session = _get_session_or_none(x_session_id)
    if not session:
        return []
    
    # Check cache first
    if not refresh:
        cached = metadata_cache.get_schemas(database)
        if cached:
            return cached
    
    try:
        safe_db = _validate_identifier(database)
        cursor = session.conn.cursor()
        cursor.execute(f"SHOW SCHEMAS IN DATABASE {safe_db}")
        
        schemas = []
        for row in cursor.fetchall():
            schemas.append({
                "name": row[1],
                "database": database,
                "owner": row[4] if len(row) > 4 else None,
                "comment": row[7] if len(row) > 7 else None
            })
        cursor.close()
        
        metadata_cache.set_schemas(database, schemas)
        return [SchemaInfo(**s) for s in schemas]
    except Exception as e:
        return _handle_snowflake_error(e, f"list_schemas({database})")


@router.get("/tables", response_model=List[TableInfo])
async def list_tables(
    database: str = Query(..., description="Database name"),
    schema: str = Query(..., description="Schema name"),
    refresh: bool = False,
    include_popularity: bool = Query(True, description="Join with TABLE_ENTITY for popularity scores"),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """List all tables and views in a schema with accurate row counts and popularity.

    Uses INFORMATION_SCHEMA.TABLES for accurate row counts, and optionally joins with
    TABLE_ENTITY to get actual usage-based popularity scores (querycount, popularityscore).
    Results are sorted by popularity first, then row_count as fallback.
    """
    session = _get_session_or_none(x_session_id)
    if not session:
        return []

    # Check cache first
    if not refresh:
        cached = metadata_cache.get_tables(database, schema)
        if cached:
            return cached

    try:
        safe_db = _validate_identifier(database)
        # Use single-quoted string literal for schema name in WHERE clause
        safe_schema_literal = schema.replace("'", "''")

        cursor = session.conn.cursor()

        # First, try to get popularity data from TABLE_ENTITY if it exists
        popularity_data = {}
        if include_popularity:
            try:
                cursor.execute(f"""
                    SELECT
                        UPPER(name) AS table_name,
                        COALESCE(querycount, 0) AS query_count,
                        COALESCE(queryusercount, 0) AS unique_users,
                        COALESCE(popularityscore, 0) AS popularity_score
                    FROM {safe_db}.{_validate_identifier(schema)}.TABLE_ENTITY
                    WHERE name IS NOT NULL
                """)
                for row in cursor.fetchall():
                    popularity_data[row[0]] = {
                        "query_count": row[1],
                        "unique_users": row[2],
                        "popularity_score": row[3]
                    }
                logger.info(f"[Metadata] Loaded popularity data for {len(popularity_data)} tables")
            except Exception as pop_err:
                # TABLE_ENTITY might not exist or have different columns - that's OK
                logger.debug(f"[Metadata] Could not fetch popularity data: {pop_err}")

        # Query INFORMATION_SCHEMA for accurate row counts
        # This is more reliable than SHOW TABLES which can have stale row_count
        cursor.execute(f"""
            SELECT
                table_name,
                table_type,
                row_count,
                bytes,
                table_owner,
                comment
            FROM {safe_db}.INFORMATION_SCHEMA.TABLES
            WHERE table_schema = '{safe_schema_literal}'
            AND table_type IN ('BASE TABLE', 'VIEW')
            ORDER BY row_count DESC NULLS LAST
        """)
        
        tables = []
        for row in cursor.fetchall():
            table_name_upper = row[0].upper() if row[0] else ""
            pop_info = popularity_data.get(table_name_upper, {})

            tables.append({
                "name": row[0],
                "database": database,
                "schema": schema,
                "kind": "VIEW" if row[1] == 'VIEW' else "TABLE",
                "owner": row[4],
                "row_count": row[2],
                "bytes": row[3],
                "comment": row[5],
                "query_count": pop_info.get("query_count", 0),
                "unique_users": pop_info.get("unique_users", 0),
                "popularity_score": pop_info.get("popularity_score", 0)
            })
        cursor.close()

        # Sort by popularity_score first, then query_count, then row_count as fallback
        tables.sort(key=lambda t: (
            -(t.get("popularity_score") or 0),
            -(t.get("query_count") or 0),
            -(t.get("row_count") or 0)
        ))

        metadata_cache.set_tables(database, schema, tables)
        logger.info(f"[Metadata] list_tables({database}.{schema}): Found {len(tables)} tables/views (sorted by popularity)")
        
        # Create TableInfo models - wrap in try/except to see validation errors
        result = []
        for t in tables:
            try:
                result.append(TableInfo(**t))
            except Exception as ve:
                logger.warning(f"[Metadata] Validation error for table {t.get('name')}: {ve}")
        
        return result
    except Exception as e:
        return _handle_snowflake_error(e, f"list_tables({database}.{schema})")


@router.get("/columns", response_model=List[ColumnInfo])
async def list_columns(
    database: str = Query(..., description="Database name"),
    schema: str = Query(..., description="Schema name"),
    table: str = Query(..., description="Table name"),
    refresh: bool = False,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """Get column metadata for a table."""
    session = _get_session_or_none(x_session_id)
    if not session:
        return []
    
    # Check cache first
    if not refresh:
        cached = metadata_cache.get_columns(database, schema, table)
        if cached:
            return cached
    
    try:
        safe_db = _validate_identifier(database)
        safe_schema = _validate_identifier(schema)
        safe_table = _validate_identifier(table)
        
        cursor = session.conn.cursor()
        cursor.execute(f"DESCRIBE TABLE {safe_db}.{safe_schema}.{safe_table}")
        
        columns = []
        for row in cursor.fetchall():
            columns.append({
                "name": row[0],
                "type": row[1],
                "kind": "COLUMN",
                "nullable": row[3] == 'Y' if len(row) > 3 else True,
                "default": row[4] if len(row) > 4 else None,
                "primary_key": row[5] == 'Y' if len(row) > 5 else False,
                "unique_key": row[6] == 'Y' if len(row) > 6 else False,
                "comment": row[8] if len(row) > 8 else None
            })
        cursor.close()
        
        metadata_cache.set_columns(database, schema, table, columns)
        return [ColumnInfo(**c) for c in columns]
    except Exception as e:
        return _handle_snowflake_error(e, f"list_columns({database}.{schema}.{table})")


@router.post("/refresh")
async def refresh_cache(
    database: str = None,
    schema: str = None,
    table: str = None
):
    """Manually refresh cached metadata."""
    if table and schema and database:
        metadata_cache.clear_columns(database, schema, table)
    elif schema and database:
        metadata_cache.clear_tables(database, schema)
    elif database:
        metadata_cache.clear_schemas(database)
    else:
        metadata_cache.clear_all()

    return {"message": "Cache cleared", "scope": {
        "database": database,
        "schema": schema,
        "table": table
    }}


@router.get("/tables/changes")
async def list_changed_tables(
    database: str = Query(..., description="Database name"),
    schema: str = Query(..., description="Schema name"),
    since: str = Query(..., description="ISO timestamp - only return tables modified after this time"),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """Get tables that have been modified since a given timestamp.

    This endpoint enables incremental discovery - instead of re-fetching all tables,
    clients can check for changes since their last fetch.

    Returns tables with last_altered > since timestamp, sorted by popularity.
    """
    session = _get_session_or_none(x_session_id)
    if not session:
        return []

    try:
        safe_db = _validate_identifier(database)
        safe_schema_literal = schema.replace("'", "''")

        # Validate timestamp format (ISO 8601)
        # Basic validation: must look like a timestamp, no SQL injection characters
        import re
        if not re.match(r'^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}', since):
            logger.warning(f"[Metadata] Invalid timestamp format: {since}")
            return []

        # Escape single quotes (though valid timestamps shouldn't have them)
        safe_since = since.replace("'", "''")

        cursor = session.conn.cursor()

        # Query for tables modified since the given timestamp
        # Use TRY_TO_TIMESTAMP for safer parsing
        cursor.execute(f"""
            SELECT
                table_name,
                table_type,
                row_count,
                bytes,
                table_owner,
                comment,
                last_altered
            FROM {safe_db}.INFORMATION_SCHEMA.TABLES
            WHERE table_schema = '{safe_schema_literal}'
            AND table_type IN ('BASE TABLE', 'VIEW')
            AND last_altered > TRY_TO_TIMESTAMP_NTZ('{safe_since}')
            ORDER BY last_altered DESC
        """)

        changed_tables = []
        for row in cursor.fetchall():
            changed_tables.append({
                "name": row[0],
                "database": database,
                "schema": schema,
                "kind": "VIEW" if row[1] == 'VIEW' else "TABLE",
                "row_count": row[2],
                "bytes": row[3],
                "owner": row[4],
                "comment": row[5],
                "last_altered": str(row[6]) if row[6] else None
            })
        cursor.close()

        logger.info(f"[Metadata] list_changed_tables({database}.{schema}): Found {len(changed_tables)} tables changed since {since}")

        return changed_tables
    except Exception as e:
        return _handle_snowflake_error(e, f"list_changed_tables({database}.{schema}, since={since})")


@router.get("/tables/popular")
async def list_popular_tables(
    database: str = Query(..., description="Database name"),
    schema: str = Query(..., description="Schema name"),
    limit: int = Query(20, ge=1, le=500, description="Maximum number of tables to return"),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """Get the most popular tables based on usage metrics.

    Returns tables sorted by popularity_score, query_count, and row_count.
    This is useful for prefetching metadata for frequently-accessed tables.
    """
    session = _get_session_or_none(x_session_id)
    if not session:
        return []

    try:
        safe_db = _validate_identifier(database)
        safe_schema = _validate_identifier(schema)
        # Ensure limit is a safe integer (FastAPI validates, but be defensive)
        safe_limit = max(1, min(500, int(limit)))

        cursor = session.conn.cursor()

        # Try to get popularity from TABLE_ENTITY first
        # Column names are lowercase in MDLH entity tables
        try:
            cursor.execute(f"""
                SELECT
                    "NAME",
                    "GUID",
                    "DATABASENAME",
                    "SCHEMANAME",
                    COALESCE("QUERYCOUNT", 0) AS query_count,
                    COALESCE("QUERYUSERCOUNT", 0) AS unique_users,
                    COALESCE("POPULARITYSCORE", 0) AS popularity_score
                FROM {safe_db}.{safe_schema}."TABLE_ENTITY"
                WHERE "NAME" IS NOT NULL
                AND (COALESCE("QUERYCOUNT", 0) > 0 OR COALESCE("POPULARITYSCORE", 0) > 0)
                ORDER BY popularity_score DESC NULLS LAST,
                         query_count DESC NULLS LAST
                LIMIT {safe_limit}
            """)

            popular_tables = []
            for row in cursor.fetchall():
                popular_tables.append({
                    "name": row[0],
                    "guid": row[1],
                    "database": row[2],
                    "schema": row[3],
                    "query_count": row[4],
                    "unique_users": row[5],
                    "popularity_score": row[6]
                })
            cursor.close()

            logger.info(f"[Metadata] list_popular_tables({database}.{schema}): Found {len(popular_tables)} popular tables")
            return popular_tables

        except Exception as entity_err:
            # TABLE_ENTITY doesn't exist or has different schema - fall back to row_count
            logger.debug(f"[Metadata] Could not query TABLE_ENTITY: {entity_err}, falling back to row_count")

            safe_schema_literal = schema.replace("'", "''")
            cursor.execute(f"""
                SELECT
                    table_name,
                    row_count,
                    bytes
                FROM {safe_db}.INFORMATION_SCHEMA.TABLES
                WHERE table_schema = '{safe_schema_literal}'
                AND table_type = 'BASE TABLE'
                AND row_count > 0
                ORDER BY row_count DESC NULLS LAST
                LIMIT {safe_limit}
            """)

            popular_tables = []
            for row in cursor.fetchall():
                popular_tables.append({
                    "name": row[0],
                    "database": database,
                    "schema": schema,
                    "row_count": row[1],
                    "bytes": row[2],
                    "query_count": 0,
                    "unique_users": 0,
                    "popularity_score": 0
                })
            cursor.close()

            return popular_tables

    except Exception as e:
        return _handle_snowflake_error(e, f"list_popular_tables({database}.{schema})")
