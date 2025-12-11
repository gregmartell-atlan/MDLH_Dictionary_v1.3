"""SQLite database for query history storage."""

import sqlite3
import os
from datetime import datetime
from typing import List, Tuple, Optional, Dict, Any
from contextlib import contextmanager

from app.models.schemas import QueryStatus


class QueryHistoryDB:
    """SQLite database for storing query history."""
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            db_path = os.path.join(os.path.dirname(__file__), "..", "query_history.db")
        self.db_path = db_path
        self._init_db()
    
    def _init_db(self):
        """Initialize the database schema."""
        with self._get_connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS query_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    query_id TEXT UNIQUE NOT NULL,
                    sql TEXT NOT NULL,
                    database_name TEXT,
                    schema_name TEXT,
                    warehouse TEXT,
                    status TEXT NOT NULL,
                    row_count INTEGER,
                    error_message TEXT,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    duration_ms INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_query_history_started
                ON query_history(started_at DESC)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_query_history_status
                ON query_history(status)
            """)
            conn.commit()
    
    @contextmanager
    def _get_connection(self):
        """Get a database connection with row factory."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
    
    def add_query(
        self,
        query_id: str,
        sql: str,
        database: Optional[str] = None,
        schema: Optional[str] = None,
        warehouse: Optional[str] = None,
        status: QueryStatus = QueryStatus.PENDING,
        row_count: Optional[int] = None,
        error_message: Optional[str] = None,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
        duration_ms: Optional[int] = None
    ):
        """Add a query to history."""
        with self._get_connection() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO query_history 
                (query_id, sql, database_name, schema_name, warehouse, status, 
                 row_count, error_message, started_at, completed_at, duration_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                query_id, sql, database, schema, warehouse,
                status.value if isinstance(status, QueryStatus) else status,
                row_count, error_message, started_at, completed_at, duration_ms
            ))
            conn.commit()
    
    def update_query(
        self,
        query_id: str,
        status: Optional[QueryStatus] = None,
        row_count: Optional[int] = None,
        error_message: Optional[str] = None,
        completed_at: Optional[datetime] = None,
        duration_ms: Optional[int] = None
    ):
        """Update a query in history."""
        updates = []
        values = []
        
        if status is not None:
            updates.append("status = ?")
            values.append(status.value if isinstance(status, QueryStatus) else status)
        if row_count is not None:
            updates.append("row_count = ?")
            values.append(row_count)
        if error_message is not None:
            updates.append("error_message = ?")
            values.append(error_message)
        if completed_at is not None:
            updates.append("completed_at = ?")
            values.append(completed_at)
        if duration_ms is not None:
            updates.append("duration_ms = ?")
            values.append(duration_ms)
        
        if not updates:
            return
        
        values.append(query_id)
        
        with self._get_connection() as conn:
            conn.execute(
                f"UPDATE query_history SET {', '.join(updates)} WHERE query_id = ?",
                values
            )
            conn.commit()
    
    def get_history(
        self,
        limit: int = 50,
        offset: int = 0,
        status_filter: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get query history with pagination."""
        with self._get_connection() as conn:
            # Build query
            where_clause = ""
            params = []
            
            if status_filter:
                where_clause = "WHERE status = ?"
                params.append(status_filter)
            
            # Get total count
            count_query = f"SELECT COUNT(*) FROM query_history {where_clause}"
            total = conn.execute(count_query, params).fetchone()[0]
            
            # Get paginated results
            query = f"""
                SELECT query_id, sql, database_name, schema_name, warehouse,
                       status, row_count, error_message, started_at, completed_at, duration_ms
                FROM query_history
                {where_clause}
                ORDER BY started_at DESC
                LIMIT ? OFFSET ?
            """
            params.extend([limit, offset])
            
            rows = conn.execute(query, params).fetchall()
            
            items = []
            for row in rows:
                items.append({
                    "query_id": row["query_id"],
                    "sql": row["sql"],
                    "database": row["database_name"],
                    "schema_name": row["schema_name"],
                    "warehouse": row["warehouse"],
                    "status": row["status"],
                    "row_count": row["row_count"],
                    "error_message": row["error_message"],
                    "started_at": row["started_at"],
                    "completed_at": row["completed_at"],
                    "duration_ms": row["duration_ms"]
                })
            
            return items, total
    
    def clear_history(self):
        """Clear all query history."""
        with self._get_connection() as conn:
            conn.execute("DELETE FROM query_history")
            conn.commit()


# Global instance
query_history_db = QueryHistoryDB()

