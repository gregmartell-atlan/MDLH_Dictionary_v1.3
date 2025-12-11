"""Snowflake connection and query service."""

import snowflake.connector
from snowflake.connector import DictCursor
from typing import Optional, List, Dict, Any, Tuple
from contextlib import contextmanager
import os
import re
from datetime import datetime, timedelta
import uuid
import threading
from collections import OrderedDict

from app.config import settings
from app.models.schemas import QueryStatus

# Max results to keep in memory (LRU cleanup)
MAX_QUERY_RESULTS = 100
RESULT_TTL_HOURS = 1


# Custom exceptions for better error handling
class SnowflakeError(Exception):
    """Base exception for Snowflake operations."""
    pass


class SnowflakeConnectionError(SnowflakeError):
    """Raised when connection to Snowflake fails or is lost."""
    pass


class SnowflakeSyntaxError(SnowflakeError):
    """Raised when SQL syntax is invalid."""
    pass


class SnowflakeTimeoutError(SnowflakeError):
    """Raised when a query times out."""
    pass


class SnowflakeService:
    """Manages Snowflake connections and query execution."""
    
    def __init__(self):
        self._connection: Optional[snowflake.connector.SnowflakeConnection] = None
        self._query_results: OrderedDict[str, Dict] = OrderedDict()  # LRU-style ordering
        self._results_lock = threading.RLock()  # Reentrant lock for nested calls
        self._connection_lock = threading.Lock()  # Separate lock for connection state
        self._last_connection_check: Optional[datetime] = None
        self._connection_check_cache_seconds = 5  # Cache connection status briefly
    
    @staticmethod
    def _validate_identifier(name: str) -> str:
        """Validate and quote a Snowflake identifier to prevent SQL injection.
        
        Snowflake identifiers:
        - Unquoted: start with letter or underscore, contain letters/digits/underscores/$
        - Quoted: can contain almost anything, double quotes escaped as ""
        
        We validate strictly and always return a safely quoted identifier.
        """
        if not name:
            raise ValueError("Identifier cannot be empty")
        
        if len(name) > 255:
            raise ValueError("Identifier exceeds maximum length of 255 characters")
        
        # Remove surrounding quotes if present (user may have pre-quoted)
        original_name = name
        if name.startswith('"') and name.endswith('"') and len(name) > 2:
            name = name[1:-1].replace('""', '"')  # Unescape internal quotes
        
        # Split by dots for qualified names (database.schema.table)
        # But be careful - dots inside quotes are literal
        parts = []
        current_part = ""
        in_quotes = False
        
        for char in name:
            if char == '"':
                in_quotes = not in_quotes
                current_part += char
            elif char == '.' and not in_quotes:
                if current_part:
                    parts.append(current_part)
                current_part = ""
            else:
                current_part += char
        
        if current_part:
            parts.append(current_part)
        
        if not parts:
            raise ValueError(f"Invalid identifier: '{original_name}'")
        
        validated_parts = []
        for part in parts:
            # Remove quotes from part for validation
            clean_part = part
            if part.startswith('"') and part.endswith('"'):
                clean_part = part[1:-1].replace('""', '"')
            
            # Strict allowlist: alphanumeric, underscore, dollar sign
            # This is MORE restrictive than Snowflake allows, which is intentional for security
            if not re.match(r'^[A-Za-z_][A-Za-z0-9_$]*$', clean_part):
                # Check if it's at least printable ASCII without dangerous chars
                if not clean_part or any(ord(c) < 32 or ord(c) > 126 for c in clean_part):
                    raise ValueError(f"Invalid identifier: '{clean_part}' contains invalid characters")
                # Additional check for SQL-like patterns (defense in depth)
                lower_part = clean_part.lower()
                if any(pattern in lower_part for pattern in [';', '--', '/*', '*/', 'union ', ' or ', ' and ']):
                    raise ValueError(f"Invalid identifier: '{clean_part}' contains suspicious patterns")
            
            # Escape any internal double quotes and wrap in quotes
            safe_part = clean_part.replace('"', '""')
            validated_parts.append(f'"{safe_part}"')
        
        return '.'.join(validated_parts)
    
    @staticmethod
    def _validate_snowflake_query_id(query_id: str) -> str:
        """Validate a Snowflake query ID format.
        
        Snowflake query IDs are UUIDs in format: 01234567-89ab-cdef-0123-456789abcdef
        """
        if not query_id:
            raise ValueError("Query ID cannot be empty")
        
        # Snowflake query IDs are UUID format
        uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        if not re.match(uuid_pattern, query_id.lower()):
            raise ValueError(f"Invalid Snowflake query ID format: {query_id}")
        
        return query_id
    
    def _cleanup_old_results(self):
        """Remove old query results to prevent memory leak. Must be called with lock held."""
        # Note: Caller must hold _results_lock
        if len(self._query_results) <= MAX_QUERY_RESULTS:
            return
        
        cutoff = datetime.utcnow() - timedelta(hours=RESULT_TTL_HOURS)
        to_remove = []
        
        for qid, result in self._query_results.items():
            completed = result.get("completed_at")
            if completed and completed < cutoff and result.get("status") != QueryStatus.RUNNING:
                to_remove.append(qid)
        
        for qid in to_remove:
            del self._query_results[qid]
        
        # If still over limit, remove oldest completed (LRU via OrderedDict order)
        while len(self._query_results) > MAX_QUERY_RESULTS:
            # Find first non-running query to remove
            for qid in list(self._query_results.keys()):
                if self._query_results[qid].get("status") != QueryStatus.RUNNING:
                    del self._query_results[qid]
                    break
            else:
                # All queries are running, can't remove any
                break
    
    def _get_private_key(self) -> Optional[bytes]:
        """Load private key from file if configured."""
        if not settings.snowflake_private_key_path:
            return None
        
        key_path = settings.snowflake_private_key_path
        if not os.path.isabs(key_path):
            key_path = os.path.join(os.path.dirname(__file__), "..", "..", key_path)
        
        if not os.path.exists(key_path):
            return None
        
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.backends import default_backend
        
        with open(key_path, "rb") as key_file:
            private_key = serialization.load_pem_private_key(
                key_file.read(),
                password=None,
                backend=default_backend()
            )
        
        return private_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
    
    def connect(
        self,
        warehouse: Optional[str] = None,
        database: Optional[str] = None,
        schema: Optional[str] = None
    ) -> snowflake.connector.SnowflakeConnection:
        """Establish connection to Snowflake."""
        with self._connection_lock:
            connect_params = {
                "account": settings.snowflake_account,
                "user": settings.snowflake_user,
                "warehouse": warehouse or settings.snowflake_warehouse,
                "database": database or settings.snowflake_database,
                "schema": schema or settings.snowflake_schema,
            }
            
            if settings.snowflake_role:
                connect_params["role"] = settings.snowflake_role
            
            # Try key-pair auth first, fall back to password
            private_key = self._get_private_key()
            if private_key:
                connect_params["private_key"] = private_key
            elif settings.snowflake_password:
                connect_params["password"] = settings.snowflake_password
            else:
                raise ValueError("No authentication method configured. Set SNOWFLAKE_PRIVATE_KEY_PATH or SNOWFLAKE_PASSWORD")
            
            self._connection = snowflake.connector.connect(**connect_params)
            self._last_connection_check = datetime.utcnow()
            return self._connection
    
    def is_connected(self) -> bool:
        """Check if there's an active connection. Caches result briefly to avoid round-trips."""
        with self._connection_lock:
            if self._connection is None:
                return False
            
            # Use cached result if recent enough
            if (self._last_connection_check and 
                (datetime.utcnow() - self._last_connection_check).total_seconds() < self._connection_check_cache_seconds):
                return True
            
            try:
                # Check is_closed attribute/method
                is_closed = getattr(self._connection, 'is_closed', None)
                if callable(is_closed):
                    if is_closed():
                        self._connection = None
                        return False
                elif is_closed is not None and is_closed:
                    self._connection = None
                    return False
                
                # Verify with a simple query
                cursor = self._connection.cursor()
                try:
                    cursor.execute("SELECT 1")
                    self._last_connection_check = datetime.utcnow()
                    return True
                finally:
                    cursor.close()
            except Exception:
                self._connection = None
                self._last_connection_check = None
                return False
    
    @contextmanager
    def get_cursor(self, dict_cursor: bool = True):
        """Get a database cursor with automatic cleanup."""
        if not self._connection:
            raise ValueError("No active Snowflake connection. Please connect first using the Configure Connection button.")
        
        cursor_method = getattr(self._connection, 'cursor', None)
        if cursor_method is None or not callable(cursor_method):
            with self._connection_lock:
                self._connection = None
            raise ValueError("Connection is invalid. Please reconnect using the Configure Connection button.")
        
        try:
            cursor_class = DictCursor if dict_cursor else None
            cursor = cursor_method(cursor_class)
            if cursor is None:
                raise ValueError("Failed to create cursor - connection may be closed")
        except TypeError as e:
            with self._connection_lock:
                self._connection = None
            raise ValueError(f"Connection lost. Please reconnect. Error: {str(e)}")
        except Exception as e:
            raise ValueError(f"Failed to create cursor: {str(e)}")
        
        try:
            yield cursor
        finally:
            try:
                cursor.close()
            except Exception:
                pass
    
    def test_connection(self) -> Dict[str, Any]:
        """Test connection and return connection info."""
        try:
            self.connect()
            with self.get_cursor() as cursor:
                cursor.execute("SELECT CURRENT_USER(), CURRENT_ACCOUNT(), CURRENT_WAREHOUSE(), CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_ROLE()")
                row = cursor.fetchone()
                return {
                    "connected": True,
                    "user": row["CURRENT_USER()"],
                    "account": row["CURRENT_ACCOUNT()"],
                    "warehouse": row["CURRENT_WAREHOUSE()"],
                    "database": row["CURRENT_DATABASE()"],
                    "schema": row["CURRENT_SCHEMA()"],
                    "role": row["CURRENT_ROLE()"],
                }
        except Exception as e:
            return {
                "connected": False,
                "error": str(e)
            }
    
    def connect_with_credentials(
        self,
        account: str,
        user: str,
        password: str,
        warehouse: Optional[str] = None,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        role: Optional[str] = None
    ) -> Dict[str, Any]:
        """Connect with explicitly provided credentials (from UI)."""
        try:
            with self._connection_lock:
                connect_params = {
                    "account": account,
                    "user": user,
                    "password": password,
                    "warehouse": warehouse or "COMPUTE_WH",
                    "database": database or "ATLAN_MDLH",
                    "schema": schema or "PUBLIC",
                }
                
                if role:
                    connect_params["role"] = role
                
                self._connection = snowflake.connector.connect(**connect_params)
                self._last_connection_check = datetime.utcnow()
            
            with self.get_cursor() as cursor:
                cursor.execute("SELECT CURRENT_USER(), CURRENT_ACCOUNT(), CURRENT_WAREHOUSE(), CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_ROLE()")
                row = cursor.fetchone()
                return {
                    "connected": True,
                    "user": row["CURRENT_USER()"],
                    "account": row["CURRENT_ACCOUNT()"],
                    "warehouse": row["CURRENT_WAREHOUSE()"],
                    "database": row["CURRENT_DATABASE()"],
                    "schema": row["CURRENT_SCHEMA()"],
                    "role": row["CURRENT_ROLE()"],
                }
        except Exception as e:
            return {
                "connected": False,
                "error": str(e)
            }
    
    def connect_with_token(
        self,
        account: str,
        user: str,
        token: str,
        warehouse: Optional[str] = None,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        role: Optional[str] = None
    ) -> Dict[str, Any]:
        """Connect using a Personal Access Token (PAT) or programmatic token."""
        
        base_params = {
            "account": account,
            "user": user,
            "warehouse": warehouse or "COMPUTE_WH",
            "database": database or "ATLAN_MDLH", 
            "schema": schema or "PUBLIC",
        }
        if role:
            base_params["role"] = role
        
        auth_attempts = [
            {"token": token, "authenticator": "programmatic_access_token"},
            {"token": token, "authenticator": "oauth"},
            {"password": token},
        ]
        
        errors = []
        
        for auth_params in auth_attempts:
            try:
                connect_params = {**base_params, **auth_params}
                with self._connection_lock:
                    self._connection = snowflake.connector.connect(**connect_params)
                    self._last_connection_check = datetime.utcnow()
                
                with self.get_cursor() as cursor:
                    cursor.execute("SELECT CURRENT_USER(), CURRENT_ACCOUNT(), CURRENT_WAREHOUSE(), CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_ROLE()")
                    row = cursor.fetchone()
                    return {
                        "connected": True,
                        "user": row["CURRENT_USER()"],
                        "account": row["CURRENT_ACCOUNT()"],
                        "warehouse": row["CURRENT_WAREHOUSE()"],
                        "database": row["CURRENT_DATABASE()"],
                        "schema": row["CURRENT_SCHEMA()"],
                        "role": row["CURRENT_ROLE()"],
                    }
            except Exception as e:
                error_msg = str(e)
                if error_msg not in errors:
                    errors.append(error_msg)
                continue
        
        error_summary = errors[0] if errors else "Unknown error"
        return {
            "connected": False,
            "error": f"Token authentication failed. Your PAT may have expired or lacks permissions. Error: {error_summary}"
        }
    
    def connect_with_sso(
        self,
        account: str,
        user: str,
        warehouse: Optional[str] = None,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        role: Optional[str] = None
    ) -> Dict[str, Any]:
        """Connect using external browser (SSO/Okta) authentication."""
        try:
            with self._connection_lock:
                connect_params = {
                    "account": account,
                    "user": user,
                    "authenticator": "externalbrowser",
                    "warehouse": warehouse or "COMPUTE_WH",
                    "database": database or "ATLAN_MDLH",
                    "schema": schema or "PUBLIC",
                }
                
                if role:
                    connect_params["role"] = role
                
                self._connection = snowflake.connector.connect(**connect_params)
                self._last_connection_check = datetime.utcnow()
            
            with self.get_cursor() as cursor:
                cursor.execute("SELECT CURRENT_USER(), CURRENT_ACCOUNT(), CURRENT_WAREHOUSE(), CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_ROLE()")
                row = cursor.fetchone()
                return {
                    "connected": True,
                    "user": row["CURRENT_USER()"],
                    "account": row["CURRENT_ACCOUNT()"],
                    "warehouse": row["CURRENT_WAREHOUSE()"],
                    "database": row["CURRENT_DATABASE()"],
                    "schema": row["CURRENT_SCHEMA()"],
                    "role": row["CURRENT_ROLE()"],
                }
        except Exception as e:
            return {
                "connected": False,
                "error": f"SSO authentication failed. Make sure you complete the login in the browser window. Error: {str(e)}"
            }
    
    def disconnect(self):
        """Close the connection."""
        with self._connection_lock:
            if self._connection:
                try:
                    self._connection.close()
                except Exception:
                    pass
                self._connection = None
                self._last_connection_check = None
    
    # ============ Metadata Methods ============
    
    def get_databases(self) -> List[Dict[str, Any]]:
        """Get list of all databases."""
        with self.get_cursor() as cursor:
            cursor.execute("SHOW DATABASES")
            results = cursor.fetchall()
            return [
                {
                    "name": row["name"],
                    "created_on": row.get("created_on"),
                    "owner": row.get("owner")
                }
                for row in results
            ]
    
    def get_schemas(self, database: str) -> List[Dict[str, Any]]:
        """Get list of schemas in a database."""
        safe_db = self._validate_identifier(database)
        with self.get_cursor() as cursor:
            cursor.execute(f"SHOW SCHEMAS IN DATABASE {safe_db}")
            results = cursor.fetchall()
            return [
                {
                    "name": row["name"],
                    "database_name": database,
                    "created_on": row.get("created_on"),
                    "owner": row.get("owner")
                }
                for row in results
            ]
    
    def get_tables(self, database: str, schema: str) -> List[Dict[str, Any]]:
        """Get list of tables and views in a schema."""
        safe_db = self._validate_identifier(database)
        safe_schema = self._validate_identifier(schema)
        tables = []
        with self.get_cursor() as cursor:
            cursor.execute(f"SHOW TABLES IN SCHEMA {safe_db}.{safe_schema}")
            for row in cursor.fetchall():
                tables.append({
                    "name": row["name"],
                    "database_name": database,
                    "schema_name": schema,
                    "kind": "TABLE",
                    "rows": row.get("rows"),
                    "created_on": row.get("created_on"),
                    "owner": row.get("owner")
                })
            
            cursor.execute(f"SHOW VIEWS IN SCHEMA {safe_db}.{safe_schema}")
            for row in cursor.fetchall():
                tables.append({
                    "name": row["name"],
                    "database_name": database,
                    "schema_name": schema,
                    "kind": "VIEW",
                    "rows": None,
                    "created_on": row.get("created_on"),
                    "owner": row.get("owner")
                })
        
        return sorted(tables, key=lambda x: x["name"])
    
    def get_columns(self, database: str, schema: str, table: str) -> List[Dict[str, Any]]:
        """Get column metadata for a table."""
        safe_db = self._validate_identifier(database)
        safe_schema = self._validate_identifier(schema)
        safe_table = self._validate_identifier(table)
        with self.get_cursor() as cursor:
            cursor.execute(f"DESCRIBE TABLE {safe_db}.{safe_schema}.{safe_table}")
            results = cursor.fetchall()
            return [
                {
                    "name": row["name"],
                    "data_type": row["type"],
                    "nullable": row.get("null?", "Y") == "Y",
                    "default": row.get("default"),
                    "primary_key": row.get("primary key", "N") == "Y",
                    "comment": row.get("comment")
                }
                for row in results
            ]
    
    # ============ Query Execution Methods ============
    
    def execute_query(
        self,
        sql: str,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        warehouse: Optional[str] = None,
        timeout: int = 60,
        limit: Optional[int] = None
    ) -> str:
        """Execute a query and return query_id."""
        query_id = str(uuid.uuid4())
        
        # Initialize with lock held, cleanup, then release before execution
        with self._results_lock:
            self._cleanup_old_results()
            self._query_results[query_id] = {
                "status": QueryStatus.RUNNING,
                "sql": sql,
                "database": database,
                "schema": schema,
                "warehouse": warehouse,
                "started_at": datetime.utcnow(),
                "completed_at": None,
                "row_count": None,
                "columns": [],
                "rows": [],
                "error_message": None,
                "snowflake_query_id": None
            }
            # Move to end for LRU ordering
            self._query_results.move_to_end(query_id)
        
        # Check connection (outside lock)
        if not self._connection:
            with self._results_lock:
                self._query_results[query_id].update({
                    "status": QueryStatus.FAILED,
                    "completed_at": datetime.utcnow(),
                    "error_message": "No active Snowflake connection. Please connect first."
                })
            return query_id
        
        try:
            with self.get_cursor(dict_cursor=False) as cursor:
                if warehouse:
                    safe_warehouse = self._validate_identifier(warehouse)
                    cursor.execute(f"USE WAREHOUSE {safe_warehouse}")
                if database:
                    safe_database = self._validate_identifier(database)
                    cursor.execute(f"USE DATABASE {safe_database}")
                if schema:
                    safe_schema = self._validate_identifier(schema)
                    cursor.execute(f"USE SCHEMA {safe_schema}")
                
                cursor.execute(sql)
                
                sf_query_id = cursor.sfqid
                with self._results_lock:
                    if query_id in self._query_results:
                        self._query_results[query_id]["snowflake_query_id"] = sf_query_id
                
                columns = []
                if cursor.description:
                    columns = [
                        {"name": col[0], "type": str(col[1]) if col[1] else "unknown"}
                        for col in cursor.description
                    ]
                
                # Use explicit None check to allow limit=0 (though it would return nothing)
                effective_limit = limit if limit is not None else 10000
                rows = cursor.fetchmany(effective_limit) if effective_limit > 0 else []
                
                processed_rows = []
                for row in rows:
                    processed_row = []
                    for val in row:
                        if val is None:
                            processed_row.append(None)
                        elif isinstance(val, datetime):
                            processed_row.append(val.isoformat())
                        elif isinstance(val, bytes):
                            processed_row.append(val.decode('utf-8', errors='replace'))
                        else:
                            processed_row.append(val)
                    processed_rows.append(processed_row)
                
                with self._results_lock:
                    if query_id in self._query_results:
                        self._query_results[query_id].update({
                            "status": QueryStatus.SUCCESS,
                            "completed_at": datetime.utcnow(),
                            "row_count": len(processed_rows),
                            "columns": columns,
                            "rows": processed_rows
                        })
                
        except Exception as e:
            with self._results_lock:
                if query_id in self._query_results:
                    self._query_results[query_id].update({
                        "status": QueryStatus.FAILED,
                        "completed_at": datetime.utcnow(),
                        "error_message": str(e)
                    })
        
        return query_id
    
    def get_query_status(self, query_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a query."""
        with self._results_lock:
            result = self._query_results.get(query_id)
            if not result:
                return None
            
            # Return a copy to avoid race conditions
            duration_ms = None
            if result["started_at"] and result["completed_at"]:
                duration_ms = int((result["completed_at"] - result["started_at"]).total_seconds() * 1000)
            
            return {
                "query_id": query_id,
                "status": result["status"],
                "row_count": result["row_count"],
                "execution_time_ms": duration_ms,
                "error_message": result["error_message"],
                "started_at": result["started_at"],
                "completed_at": result["completed_at"]
            }
    
    def get_query_results(
        self,
        query_id: str,
        page: int = 1,
        page_size: int = 100
    ) -> Optional[Dict[str, Any]]:
        """Get paginated results for a query."""
        with self._results_lock:
            result = self._query_results.get(query_id)
            if not result or result["status"] != QueryStatus.SUCCESS:
                return None
            
            total_rows = len(result["rows"])
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            
            # Return copies of data
            return {
                "query_id": query_id,
                "columns": list(result["columns"]),
                "rows": list(result["rows"][start_idx:end_idx]),
                "total_rows": total_rows,
                "page": page,
                "page_size": page_size,
                "has_more": end_idx < total_rows
            }
    
    def cancel_query(self, query_id: str) -> bool:
        """Cancel a running query. Returns True if cancelled, False otherwise.
        
        Note: For more detailed error info, use cancel_query_with_reason().
        """
        success, _ = self.cancel_query_with_reason(query_id)
        return success
    
    def cancel_query_with_reason(self, query_id: str) -> Tuple[bool, Optional[str]]:
        """Cancel a running query. Returns (success, error_message)."""
        with self._results_lock:
            result = self._query_results.get(query_id)
            
            if not result:
                return False, "Query not found"
            
            if result["status"] != QueryStatus.RUNNING:
                return False, f"Query is not running (status: {result['status']})"
            
            sf_query_id = result.get("snowflake_query_id")
            
            # Mark as cancelled immediately
            result["status"] = QueryStatus.CANCELLED
            result["completed_at"] = datetime.utcnow()
        
        # Try to cancel on Snowflake (outside lock to avoid blocking)
        if sf_query_id and self._connection:
            try:
                validated_sf_qid = self._validate_snowflake_query_id(sf_query_id)
                with self.get_cursor() as cursor:
                    # Use parameterized query to prevent SQL injection
                    cursor.execute("SELECT SYSTEM$CANCEL_QUERY(%s)", (validated_sf_qid,))
            except ValueError as e:
                # Invalid query ID format - log but don't fail
                pass
            except Exception as e:
                # Snowflake cancel failed - query is still marked cancelled locally
                pass
        
        return True, None


# Global service instance
snowflake_service = SnowflakeService()
