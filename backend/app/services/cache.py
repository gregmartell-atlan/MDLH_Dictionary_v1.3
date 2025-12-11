"""Caching service for metadata."""

from cachetools import TTLCache
from typing import Any, Optional, Callable
from functools import wraps
import hashlib
import json

from app.config import settings


class MetadataCache:
    """TTL-based cache for Snowflake metadata."""
    
    def __init__(self):
        # Separate caches for different data types with different TTLs
        self._databases = TTLCache(maxsize=100, ttl=settings.cache_ttl_databases)
        self._schemas = TTLCache(maxsize=1000, ttl=settings.cache_ttl_schemas)
        self._tables = TTLCache(maxsize=5000, ttl=settings.cache_ttl_tables)
        self._columns = TTLCache(maxsize=10000, ttl=settings.cache_ttl_columns)
    
    def _make_key(self, *args) -> str:
        """Create a cache key from arguments."""
        key_str = json.dumps(args, sort_keys=True, default=str)
        return hashlib.md5(key_str.encode()).hexdigest()
    
    # Database cache
    def get_databases(self) -> Optional[Any]:
        return self._databases.get("all")
    
    def set_databases(self, data: Any):
        self._databases["all"] = data
    
    def clear_databases(self):
        self._databases.clear()
    
    # Schema cache
    def get_schemas(self, database: str) -> Optional[Any]:
        return self._schemas.get(database)
    
    def set_schemas(self, database: str, data: Any):
        self._schemas[database] = data
    
    def clear_schemas(self, database: Optional[str] = None):
        if database:
            self._schemas.pop(database, None)
        else:
            self._schemas.clear()
    
    # Table cache
    def get_tables(self, database: str, schema: str) -> Optional[Any]:
        key = self._make_key(database, schema)
        return self._tables.get(key)
    
    def set_tables(self, database: str, schema: str, data: Any):
        key = self._make_key(database, schema)
        self._tables[key] = data
    
    def clear_tables(self, database: Optional[str] = None, schema: Optional[str] = None):
        if database and schema:
            key = self._make_key(database, schema)
            self._tables.pop(key, None)
        else:
            self._tables.clear()
    
    # Column cache
    def get_columns(self, database: str, schema: str, table: str) -> Optional[Any]:
        key = self._make_key(database, schema, table)
        return self._columns.get(key)
    
    def set_columns(self, database: str, schema: str, table: str, data: Any):
        key = self._make_key(database, schema, table)
        self._columns[key] = data
    
    def clear_columns(self, database: Optional[str] = None, schema: Optional[str] = None, table: Optional[str] = None):
        if database and schema and table:
            key = self._make_key(database, schema, table)
            self._columns.pop(key, None)
        else:
            self._columns.clear()
    
    def clear_all(self):
        """Clear all caches."""
        self._databases.clear()
        self._schemas.clear()
        self._tables.clear()
        self._columns.clear()


# Global cache instance
metadata_cache = MetadataCache()

