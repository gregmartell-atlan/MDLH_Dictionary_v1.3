"""
System Configuration Router

Provides the /api/system/config endpoint that returns a SystemConfig
describing the available metadata tables, features, and catalog for the session.

This is the SINGLE SOURCE OF TRUTH for what's available in this Snowflake environment.
All query flows and wizards use this config to adapt per environment.
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging
import time
import threading

from ..utils.logger import get_logger

router = APIRouter(prefix="/api/system", tags=["system"])
logger = get_logger("system")

# =============================================================================
# SystemConfig Cache with TTL
# =============================================================================

CONFIG_CACHE_TTL_SECONDS = 900  # 15 minutes TTL


class CachedConfig:
    """Wrapper for cached config with timestamp."""
    
    def __init__(self, config: dict):
        self.config = config
        self.cached_at = time.time()
    
    def is_expired(self, ttl_seconds: int = CONFIG_CACHE_TTL_SECONDS) -> bool:
        """Check if this cache entry has expired."""
        return time.time() - self.cached_at > ttl_seconds
    
    @property
    def age_seconds(self) -> float:
        return time.time() - self.cached_at


class SystemConfigCache:
    """
    Thread-safe cache for SystemConfig with TTL support.
    Each session has its own config, cached for 15 minutes.
    """
    
    def __init__(self, ttl_seconds: int = CONFIG_CACHE_TTL_SECONDS):
        self._cache: Dict[str, CachedConfig] = {}
        self._lock = threading.RLock()
        self._ttl_seconds = ttl_seconds
    
    def get(self, session_id: str) -> Optional[dict]:
        """Get cached config if valid, None otherwise."""
        with self._lock:
            entry = self._cache.get(session_id)
            if entry is None:
                return None
            
            if entry.is_expired(self._ttl_seconds):
                del self._cache[session_id]
                logger.debug(f"[{session_id}] Config cache expired after {entry.age_seconds:.0f}s")
                return None
            
            return entry.config
    
    def put(self, session_id: str, config: dict) -> None:
        """Store config in cache."""
        with self._lock:
            self._cache[session_id] = CachedConfig(config)
            logger.debug(f"[{session_id}] Config cached (TTL: {self._ttl_seconds}s)")
    
    def invalidate(self, session_id: str) -> bool:
        """Remove config from cache. Returns True if it existed."""
        with self._lock:
            if session_id in self._cache:
                del self._cache[session_id]
                return True
            return False
    
    def clear_expired(self) -> int:
        """Remove all expired entries. Returns count removed."""
        with self._lock:
            expired = [sid for sid, entry in self._cache.items() if entry.is_expired(self._ttl_seconds)]
            for sid in expired:
                del self._cache[sid]
            return len(expired)
    
    def stats(self) -> Dict[str, Any]:
        """Return cache statistics."""
        with self._lock:
            return {
                "entries": len(self._cache),
                "ttl_seconds": self._ttl_seconds,
                "sessions": list(self._cache.keys())[:10]  # First 10 for privacy
            }


# Global config cache instance
SYSTEM_CONFIG_CACHE = SystemConfigCache()


# ============================================
# Models
# ============================================

class EntityLocation(BaseModel):
    """Physical location of a metadata entity table."""
    database: str
    schema_name: str  # 'schema' is reserved in Pydantic
    table: str


class CatalogTable(BaseModel):
    """A table in the catalog."""
    db: str
    schema_name: str
    name: str


class Features(BaseModel):
    """Feature flags based on available metadata."""
    lineage: bool = False
    glossary: bool = False
    queryHistory: bool = False
    biUsage: bool = False
    dbt: bool = False
    governance: bool = False


class QueryDefaults(BaseModel):
    """Default query settings."""
    metadataDb: str = "FIELD_METADATA"
    metadataSchema: str = "PUBLIC"
    defaultRowLimit: int = 10000
    defaultTimeoutSec: int = 60


class SystemConfig(BaseModel):
    """
    Full system configuration for a session.
    
    This is built by running read-only discovery queries against Snowflake
    and determines what features are available and how to query metadata.
    """
    snowflake: Dict[str, Any]  # entities map
    queryDefaults: QueryDefaults
    features: Features
    catalog: Dict[str, List[Any]]


# ============================================
# Known Logical Entities
# ============================================

# These are the logical entity names we look for.
# The discovery process tries to find tables matching these names.
KNOWN_ENTITIES = [
    "PROCESS_ENTITY",
    "COLUMNPROCESS_ENTITY",
    "BIPROCESS_ENTITY",
    "DBTPROCESS_ENTITY",
    "TABLE_ENTITY",
    "VIEW_ENTITY",
    "COLUMN_ENTITY",
    "DATABASE_ENTITY",
    "SCHEMA_ENTITY",
    "ATLASGLOSSARY_ENTITY",
    "ATLASGLOSSARYTERM_ENTITY",
    "ATLASGLOSSARYCATEGORY_ENTITY",
    "SIGMADATAELEMENT_ENTITY",
    "DBTMODEL_ENTITY",
    "DBTSOURCE_ENTITY",
    "POWERBIWORKSPACE_ENTITY",
    "POWERBIDASHBOARD_ENTITY",
    "POWERBIREPORT_ENTITY",
    "TABLEAUDASHBOARD_ENTITY",
    "LOOKEREXPLORE_ENTITY",
    "QUERY_ENTITY",
]


# ============================================
# Discovery Logic (READ-ONLY)
# ============================================

def build_system_config(conn, session_id: str) -> dict:
    """
    Build the SystemConfig by running read-only discovery queries.
    
    This function:
    1. Discovers metadata tables (*_ENTITY, glossary tables)
    2. Builds a mapping of logical entity names to physical locations
    3. Determines which features are available
    4. Builds a lightweight table catalog for suggestions
    
    Args:
        conn: Snowflake connection
        session_id: Session ID for logging
        
    Returns:
        SystemConfig as a dict
    """
    logger.info(f"[{session_id}] Building system config via read-only discovery")
    
    entities: Dict[str, dict] = {}
    catalog_tables: List[dict] = []
    
    # Default metadata location (will be updated if we find PROCESS_ENTITY)
    metadata_db = "FIELD_METADATA"
    metadata_schema = "PUBLIC"
    
    try:
        cursor = conn.cursor()
        
        # Step 1: Discover *_ENTITY tables
        logger.info(f"[{session_id}] Discovering metadata tables...")
        
        try:
            cursor.execute("""
                SELECT table_catalog, table_schema, table_name
                FROM information_schema.tables
                WHERE table_name LIKE '%_ENTITY'
                  AND table_schema NOT IN ('INFORMATION_SCHEMA')
                ORDER BY table_name
                LIMIT 500
            """)
            
            entity_rows = cursor.fetchall()
            logger.info(f"[{session_id}] Found {len(entity_rows)} *_ENTITY tables")
            
            # Build a lookup: table_name.upper() -> (db, schema, table)
            found_entities: Dict[str, tuple] = {}
            for row in entity_rows:
                db, schema, table = row
                key = table.upper()
                if key not in found_entities:
                    found_entities[key] = (db, schema, table)
            
            # Match known logical entities
            for logical_name in KNOWN_ENTITIES:
                key = logical_name.upper()
                if key in found_entities:
                    db, schema, table = found_entities[key]
                    entities[logical_name] = {
                        "database": db,
                        "schema": schema,
                        "table": table
                    }
                    logger.debug(f"[{session_id}] Matched {logical_name} -> {db}.{schema}.{table}")
            
            # Also add any other *_ENTITY tables we found
            for table_name, (db, schema, table) in found_entities.items():
                if table_name not in [k.upper() for k in entities.keys()]:
                    entities[table] = {
                        "database": db,
                        "schema": schema,
                        "table": table
                    }
            
            # Update metadata location based on PROCESS_ENTITY
            if "PROCESS_ENTITY" in entities:
                proc = entities["PROCESS_ENTITY"]
                metadata_db = proc["database"]
                metadata_schema = proc["schema"]
                logger.info(f"[{session_id}] Using metadata location from PROCESS_ENTITY: {metadata_db}.{metadata_schema}")
            else:
                logger.warning(f"[{session_id}] PROCESS_ENTITY not found, using default: {metadata_db}.{metadata_schema}")
                
        except Exception as e:
            logger.warning(f"[{session_id}] Entity discovery failed: {e}")
        
        # Step 2: Discover glossary tables (legacy names)
        try:
            cursor.execute("""
                SELECT table_catalog, table_schema, table_name
                FROM information_schema.tables
                WHERE table_name IN ('ATLASGLOSSARY', 'ATLASGLOSSARYTERM', 'ATLASGLOSSARYCATEGORY')
                  AND table_schema NOT IN ('INFORMATION_SCHEMA')
                LIMIT 10
            """)
            
            glossary_rows = cursor.fetchall()
            for row in glossary_rows:
                db, schema, table = row
                # Use the table name as the logical name
                entities[table] = {
                    "database": db,
                    "schema": schema,
                    "table": table
                }
                logger.debug(f"[{session_id}] Found glossary table: {db}.{schema}.{table}")
                
        except Exception as e:
            logger.warning(f"[{session_id}] Glossary discovery failed: {e}")
        
        # Step 3: Build table catalog
        logger.info(f"[{session_id}] Building table catalog...")
        
        try:
            cursor.execute("""
                SELECT table_catalog, table_schema, table_name
                FROM information_schema.tables
                WHERE table_type = 'BASE TABLE'
                  AND table_schema NOT IN ('INFORMATION_SCHEMA')
                ORDER BY table_catalog, table_schema, table_name
                LIMIT 1000
            """)
            
            table_rows = cursor.fetchall()
            for row in table_rows:
                db, schema, table = row
                catalog_tables.append({
                    "db": db,
                    "schema": schema,
                    "name": table
                })
            
            logger.info(f"[{session_id}] Catalog contains {len(catalog_tables)} tables")
            
        except Exception as e:
            logger.warning(f"[{session_id}] Table catalog discovery failed: {e}")
        
        cursor.close()
        
    except Exception as e:
        logger.error(f"[{session_id}] Discovery error: {e}")
    
    # Step 4: Determine feature flags
    features = determine_features(entities)
    logger.info(f"[{session_id}] Features: lineage={features.lineage}, glossary={features.glossary}, dbt={features.dbt}")
    
    # Build the config
    config = {
        "snowflake": {
            "entities": entities
        },
        "queryDefaults": {
            "metadataDb": metadata_db,
            "metadataSchema": metadata_schema,
            "defaultRowLimit": 10000,
            "defaultTimeoutSec": 60
        },
        "features": {
            "lineage": features.lineage,
            "glossary": features.glossary,
            "queryHistory": features.queryHistory,
            "biUsage": features.biUsage,
            "dbt": features.dbt,
            "governance": features.governance
        },
        "catalog": {
            "tables": catalog_tables,
            "columns": []  # Can be populated later if needed
        }
    }
    
    logger.info(f"[{session_id}] System config built: {len(entities)} entities, {len(catalog_tables)} tables")
    
    return config


def determine_features(entities: Dict[str, dict]) -> Features:
    """
    Determine which features are available based on discovered entities.
    
    Rules:
    - lineage: PROCESS_ENTITY and (TABLE_ENTITY or VIEW_ENTITY) must exist
    - glossary: ATLASGLOSSARY* or ATLASGLOSSARYTERM* must exist
    - dbt: DBTMODEL_ENTITY or DBTSOURCE_ENTITY must exist
    - biUsage: Any BI entity (POWERBI*, TABLEAU*, LOOKER*) must exist
    - queryHistory: QUERY_ENTITY must exist
    - governance: Always true (basic governance is always available)
    """
    entity_names = set(k.upper() for k in entities.keys())
    
    # Lineage requires process + table/view entities
    has_process = any(name in entity_names for name in [
        "PROCESS_ENTITY", "COLUMNPROCESS_ENTITY", "BIPROCESS_ENTITY", "DBTPROCESS_ENTITY"
    ])
    has_table_or_view = "TABLE_ENTITY" in entity_names or "VIEW_ENTITY" in entity_names
    lineage = has_process and has_table_or_view
    
    # Glossary
    glossary = any(name for name in entity_names if "GLOSSARY" in name)
    
    # dbt
    dbt = any(name for name in entity_names if name.startswith("DBT"))
    
    # BI Usage
    bi_prefixes = ["POWERBI", "TABLEAU", "LOOKER", "SIGMA"]
    biUsage = any(any(name.startswith(prefix) for prefix in bi_prefixes) for name in entity_names)
    
    # Query History
    queryHistory = "QUERY_ENTITY" in entity_names
    
    return Features(
        lineage=lineage,
        glossary=glossary,
        queryHistory=queryHistory,
        biUsage=biUsage,
        dbt=dbt,
        governance=True  # Always available
    )


# ============================================
# Endpoints
# ============================================

@router.get("/config")
async def get_system_config(
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Get the SystemConfig for the current session.
    
    This endpoint returns the discovered configuration that describes:
    - Which metadata entities are available
    - Which features are enabled
    - The table catalog for suggestions
    
    If the config isn't cached or has expired (15 min TTL), it will be rebuilt.
    
    Response includes cache metadata:
    - cached: bool - whether this was from cache
    - cache_age_seconds: float - age of cache entry
    """
    from ..services.session import session_manager
    
    # Get session from header
    if not x_session_id:
        raise HTTPException(
            status_code=401, 
            detail={"error": "No session ID provided", "reason": "NO_SESSION_ID"}
        )
    
    # Check cache first
    cached_config = SYSTEM_CONFIG_CACHE.get(x_session_id)
    if cached_config:
        logger.debug(f"[{x_session_id[:8]}...] Returning cached system config")
        return {**cached_config, "_cached": True}
    
    # Need to build config - get the Snowflake session
    session = session_manager.get_session(x_session_id)
    if not session:
        raise HTTPException(
            status_code=401, 
            detail={"error": "Session not found", "reason": "SESSION_NOT_FOUND"}
        )
    
    # Build and cache config
    config = build_system_config(session.conn, x_session_id[:8])
    SYSTEM_CONFIG_CACHE.put(x_session_id, config)
    
    return {**config, "_cached": False}


@router.post("/config/refresh")
async def refresh_system_config(
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID")
):
    """
    Force refresh the SystemConfig by re-running discovery.
    
    Useful when the database layout has changed after the initial connection.
    """
    from ..services.session import session_manager
    
    if not x_session_id:
        raise HTTPException(
            status_code=401, 
            detail={"error": "No session ID provided", "reason": "NO_SESSION_ID"}
        )
    
    # Invalidate cache
    SYSTEM_CONFIG_CACHE.invalidate(x_session_id)
    
    # Get session and rebuild
    session = session_manager.get_session(x_session_id)
    if not session:
        raise HTTPException(
            status_code=401, 
            detail={"error": "Session not found", "reason": "SESSION_NOT_FOUND"}
        )
    
    config = build_system_config(session.conn, x_session_id[:8])
    SYSTEM_CONFIG_CACHE.put(x_session_id, config)
    
    logger.info(f"[{x_session_id[:8]}...] System config refreshed")
    
    return {**config, "_cached": False, "_refreshed": True}


@router.get("/config/stats")
async def get_config_cache_stats():
    """Get cache statistics (for debugging)."""
    return SYSTEM_CONFIG_CACHE.stats()


def cache_config_for_session(session_id: str, config: dict):
    """Helper to cache a config for a session."""
    SYSTEM_CONFIG_CACHE.put(session_id, config)


def clear_config_for_session(session_id: str):
    """Helper to clear config when session ends."""
    if SYSTEM_CONFIG_CACHE.invalidate(session_id):
        logger.debug(f"[{session_id[:8]}...] Cleared system config cache")

