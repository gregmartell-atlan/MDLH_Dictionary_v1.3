"""
Session management for Snowflake connections.

Maintains persistent connections so users don't re-authenticate every query.
Sessions auto-expire after idle timeout and are cleaned up by background thread.

Memory Management:
- Query results are stored with TTL (default 5 minutes)
- Each session has a max query results limit (default 50)
- LRU eviction when limit is reached
- Background cleanup thread removes stale results
"""

import threading
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, OrderedDict
from collections import OrderedDict as OrderedDictType
from uuid import uuid4

import snowflake.connector

# Memory management constants
MAX_QUERY_RESULTS_PER_SESSION = 50  # Maximum stored query results per session
QUERY_RESULT_TTL_MINUTES = 5  # Query results expire after 5 minutes
MAX_RESULT_SIZE_BYTES = 10 * 1024 * 1024  # 10MB max per result (rough estimate)


class QueryResult:
    """Wrapper for query results with TTL tracking."""
    
    def __init__(self, data: Dict[str, Any], created_at: Optional[datetime] = None):
        self.data = data
        self.created_at = created_at or datetime.utcnow()
        self.last_accessed = self.created_at
        # Rough size estimate (for memory tracking)
        self._size_bytes = self._estimate_size(data)
    
    def _estimate_size(self, data: Dict) -> int:
        """Rough estimate of result size in bytes."""
        try:
            import sys
            return sys.getsizeof(str(data))
        except Exception:
            return 1000  # Default estimate
    
    def is_expired(self, ttl_minutes: int = QUERY_RESULT_TTL_MINUTES) -> bool:
        """Check if this result has expired."""
        return datetime.utcnow() - self.created_at > timedelta(minutes=ttl_minutes)
    
    def touch(self):
        """Update last accessed time."""
        self.last_accessed = datetime.utcnow()
    
    @property
    def size_bytes(self) -> int:
        return self._size_bytes


class QueryResultStore:
    """
    LRU cache for query results with TTL and size limits.
    Thread-safe with proper locking.
    """
    
    def __init__(
        self, 
        max_results: int = MAX_QUERY_RESULTS_PER_SESSION,
        ttl_minutes: int = QUERY_RESULT_TTL_MINUTES,
        max_size_bytes: int = MAX_RESULT_SIZE_BYTES
    ):
        self._results: OrderedDictType[str, QueryResult] = OrderedDictType()
        self._lock = threading.RLock()
        self._max_results = max_results
        self._ttl_minutes = ttl_minutes
        self._max_size_bytes = max_size_bytes
        self._total_size_bytes = 0
    
    def put(self, query_id: str, data: Dict[str, Any]) -> None:
        """Store a query result, evicting old ones if necessary."""
        with self._lock:
            result = QueryResult(data)
            
            # Evict expired results first
            self._evict_expired()
            
            # Evict oldest results if at capacity
            while len(self._results) >= self._max_results:
                self._evict_oldest()
            
            # Evict if adding would exceed size limit
            while self._total_size_bytes + result.size_bytes > self._max_size_bytes and self._results:
                self._evict_oldest()
            
            # Store the new result
            self._results[query_id] = result
            self._total_size_bytes += result.size_bytes
            
            # Move to end (most recently used)
            self._results.move_to_end(query_id)
    
    def get(self, query_id: str) -> Optional[Dict[str, Any]]:
        """Get a query result by ID, returns None if not found or expired."""
        with self._lock:
            result = self._results.get(query_id)
            if result is None:
                return None
            
            if result.is_expired(self._ttl_minutes):
                self._remove(query_id)
                return None
            
            # Touch and move to end (LRU update)
            result.touch()
            self._results.move_to_end(query_id)
            return result.data
    
    def __contains__(self, query_id: str) -> bool:
        with self._lock:
            return query_id in self._results and not self._results[query_id].is_expired(self._ttl_minutes)
    
    def __len__(self) -> int:
        with self._lock:
            return len(self._results)
    
    def _remove(self, query_id: str) -> None:
        """Remove a result (caller must hold lock)."""
        result = self._results.pop(query_id, None)
        if result:
            self._total_size_bytes -= result.size_bytes
    
    def _evict_oldest(self) -> None:
        """Evict the oldest (least recently used) result."""
        if self._results:
            oldest_id = next(iter(self._results))
            self._remove(oldest_id)
    
    def _evict_expired(self) -> None:
        """Remove all expired results."""
        expired = [qid for qid, r in self._results.items() if r.is_expired(self._ttl_minutes)]
        for qid in expired:
            self._remove(qid)
    
    def clear(self) -> None:
        """Clear all stored results."""
        with self._lock:
            self._results.clear()
            self._total_size_bytes = 0
    
    def stats(self) -> Dict[str, Any]:
        """Return statistics about the store."""
        with self._lock:
            return {
                "count": len(self._results),
                "max_results": self._max_results,
                "total_size_bytes": self._total_size_bytes,
                "max_size_bytes": self._max_size_bytes,
            }


class SnowflakeSession:
    """Wrapper around a Snowflake connection with metadata."""
    
    def __init__(
        self,
        conn: snowflake.connector.SnowflakeConnection,
        user: str,
        account: str,
        warehouse: str,
        database: str,
        schema: str,
        role: Optional[str] = None
    ):
        self.conn = conn
        self.user = user
        self.account = account
        self.warehouse = warehouse
        self.database = database
        self.schema = schema
        self.role = role
        self.created_at = datetime.utcnow()
        self.last_used = datetime.utcnow()
        self.query_count = 0
        # Use the new QueryResultStore for memory-safe result storage
        self.query_results = QueryResultStore()
    
    def touch(self):
        """Update last used timestamp."""
        self.last_used = datetime.utcnow()
        self.query_count += 1
    
    def is_expired(self, max_idle_minutes: int = 30) -> bool:
        """Check if session has been idle too long."""
        return datetime.utcnow() - self.last_used > timedelta(minutes=max_idle_minutes)
    
    def is_alive(self) -> bool:
        """Check if the underlying connection is still valid."""
        try:
            cursor = self.conn.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
            return True
        except Exception:
            return False
    
    def close(self):
        """Close the underlying connection and cleanup."""
        try:
            self.query_results.clear()
            self.conn.close()
        except Exception:
            pass
    
    def to_dict(self) -> Dict[str, Any]:
        """Return session info as dictionary."""
        return {
            "user": self.user,
            "account": self.account,
            "warehouse": self.warehouse,
            "database": self.database,
            "schema": self.schema,
            "role": self.role,
            "query_count": self.query_count,
            "created_at": self.created_at.isoformat(),
            "last_used": self.last_used.isoformat(),
            "idle_seconds": (datetime.utcnow() - self.last_used).total_seconds(),
            "query_results": self.query_results.stats()
        }


class SessionManager:
    """Manages active Snowflake sessions with automatic cleanup."""
    
    def __init__(self, max_idle_minutes: int = 30, cleanup_interval_seconds: int = 60):
        self._sessions: Dict[str, SnowflakeSession] = {}
        self._lock = threading.RLock()
        self._max_idle_minutes = max_idle_minutes
        self._cleanup_interval = cleanup_interval_seconds
        self._running = True
        
        # Start background cleanup thread
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleanup_thread.start()
    
    def create_session(
        self,
        conn: snowflake.connector.SnowflakeConnection,
        user: str,
        account: str,
        warehouse: str,
        database: str,
        schema: str,
        role: Optional[str] = None
    ) -> str:
        """Create a new session and return its ID."""
        session_id = str(uuid4())
        session = SnowflakeSession(conn, user, account, warehouse, database, schema, role)
        
        with self._lock:
            self._sessions[session_id] = session
        
        return session_id
    
    def get_session(self, session_id: str) -> Optional[SnowflakeSession]:
        """Get a session by ID, returns None if not found or expired."""
        with self._lock:
            session = self._sessions.get(session_id)
            
            if session is None:
                return None
            
            # Check if expired
            if session.is_expired(self._max_idle_minutes):
                self._remove_session_unsafe(session_id)
                return None
            
            # Check if connection is still alive
            if not session.is_alive():
                self._remove_session_unsafe(session_id)
                return None
            
            session.touch()
            return session
    
    def remove_session(self, session_id: str) -> bool:
        """Explicitly remove a session (logout)."""
        with self._lock:
            return self._remove_session_unsafe(session_id)
    
    def _remove_session_unsafe(self, session_id: str) -> bool:
        """Internal: remove session without lock (caller must hold lock)."""
        session = self._sessions.pop(session_id, None)
        if session:
            session.close()
            return True
        return False
    
    def _cleanup_loop(self):
        """Background thread that cleans up expired sessions."""
        while self._running:
            time.sleep(self._cleanup_interval)
            self._cleanup_expired()
    
    def _cleanup_expired(self):
        """Remove all expired sessions."""
        with self._lock:
            expired = [
                sid for sid, session in self._sessions.items()
                if session.is_expired(self._max_idle_minutes)
            ]
            for sid in expired:
                self._remove_session_unsafe(sid)
            
            # Expired sessions cleaned up silently
    
    def get_stats(self) -> Dict[str, Any]:
        """Get session manager statistics."""
        with self._lock:
            return {
                "active_sessions": len(self._sessions),
                "max_idle_minutes": self._max_idle_minutes,
                "sessions": [
                    {
                        "session_id": sid[:8] + "...",
                        "user": s.user,
                        "warehouse": s.warehouse,
                        "idle_seconds": (datetime.utcnow() - s.last_used).total_seconds(),
                        "query_count": s.query_count
                    }
                    for sid, s in self._sessions.items()
                ]
            }
    
    def shutdown(self):
        """Shutdown the session manager and close all connections."""
        self._running = False
        with self._lock:
            for session_id in list(self._sessions.keys()):
                self._remove_session_unsafe(session_id)


# Global session manager instance
session_manager = SessionManager(max_idle_minutes=30)

