"""
SystemConfig Discovery Service

Implements read-only discovery of Snowflake metadata to build a session-specific
SystemConfig. This config drives all query flows and wizards.

Rules:
- READ-ONLY: Only SELECT, SHOW, DESCRIBE, INFORMATION_SCHEMA queries
- NO HALLUCINATION: Only report what actually exists
- GRACEFUL DEGRADATION: Missing tables = feature disabled, not crash
"""

import logging
from typing import Dict, Any, Optional, List
from cachetools import TTLCache

logger = logging.getLogger(__name__)

# Cache config per session (5 minute TTL)
SYSTEM_CONFIG_CACHE: TTLCache = TTLCache(maxsize=100, ttl=300)

# Logical entity names we look for
KNOWN_ENTITIES = [
    "PROCESS_ENTITY",
    "TABLE_ENTITY",
    "VIEW_ENTITY",
    "COLUMN_ENTITY",
    "DATABASE_ENTITY",
    "SCHEMA_ENTITY",
    "SIGMADATAELEMENT_ENTITY",
    "ATLASGLOSSARY_ENTITY",
    "ATLASGLOSSARYTERM_ENTITY",
    "DBTMODEL_ENTITY",
    "DBTPROCESS_ENTITY",
    "POWERBIDASHBOARD_ENTITY",
    "TABLEAUDASHBOARD_ENTITY",
    "LOOKERQUERY_ENTITY",
]


def build_system_config(conn, session_id: str) -> Dict[str, Any]:
    """
    Build SystemConfig by discovering metadata tables.
    
    Args:
        conn: Active Snowflake connection
        session_id: Current session ID for caching
        
    Returns:
        SystemConfig dict with entities, features, catalog, etc.
    """
    # Check cache first
    cached = SYSTEM_CONFIG_CACHE.get(session_id)
    if cached:
        logger.info(f"Returning cached SystemConfig for session {session_id[:8]}...")
        return cached
    
    logger.info(f"Building SystemConfig for session {session_id[:8]}...")
    
    config = {
        "snowflake": {
            "entities": {},
        },
        "queryDefaults": {
            "metadataDb": "FIELD_METADATA",
            "metadataSchema": "PUBLIC",
            "defaultRowLimit": 10000,
            "defaultTimeoutSec": 60,
        },
        "features": {
            "lineage": False,
            "glossary": False,
            "queryHistory": False,
            "biUsage": False,
            "dbt": False,
            "governance": False,
        },
        "catalog": {
            "tables": [],
            "columns": [],
        },
        "discoveryStatus": {
            "success": False,
            "entitiesFound": 0,
            "tablesFound": 0,
            "errors": [],
        }
    }
    
    try:
        cursor = conn.cursor()
        
        # Step 1: Discover *_ENTITY tables
        entities = _discover_entities(cursor)
        config["snowflake"]["entities"] = entities
        config["discoveryStatus"]["entitiesFound"] = len(entities)
        
        # Step 2: Set metadata defaults based on discovered entities
        if "PROCESS_ENTITY" in entities:
            proc = entities["PROCESS_ENTITY"]
            config["queryDefaults"]["metadataDb"] = proc["database"]
            config["queryDefaults"]["metadataSchema"] = proc["schema"]
        
        # Step 3: Determine feature flags
        config["features"] = _determine_features(entities)
        
        # Step 4: Build table catalog
        catalog_tables = _discover_catalog_tables(cursor)
        config["catalog"]["tables"] = catalog_tables
        config["discoveryStatus"]["tablesFound"] = len(catalog_tables)
        
        config["discoveryStatus"]["success"] = True
        
        cursor.close()
        
    except Exception as e:
        logger.error(f"SystemConfig discovery error: {e}")
        config["discoveryStatus"]["errors"].append(str(e))
    
    # Cache the result
    SYSTEM_CONFIG_CACHE[session_id] = config
    
    logger.info(
        f"SystemConfig built: {len(config['snowflake']['entities'])} entities, "
        f"{len(config['catalog']['tables'])} catalog tables"
    )
    
    return config


def _discover_entities(cursor) -> Dict[str, Dict[str, str]]:
    """
    Discover metadata entity tables using INFORMATION_SCHEMA.
    
    Returns:
        Dict mapping logical entity names to {database, schema, table}
    """
    entities = {}
    
    try:
        # Query for *_ENTITY tables
        query = """
            SELECT table_catalog, table_schema, table_name
            FROM information_schema.tables
            WHERE (
                table_name LIKE '%_ENTITY'
                OR table_name IN ('ATLASGLOSSARY', 'ATLASGLOSSARYTERM')
            )
            AND table_schema NOT IN ('INFORMATION_SCHEMA')
            ORDER BY table_name
            LIMIT 500
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        for row in rows:
            db, schema, table = row[0], row[1], row[2]
            table_upper = table.upper()
            
            # Match against known logical entities
            for known in KNOWN_ENTITIES:
                if table_upper == known or table_upper == known.replace("_ENTITY", ""):
                    if known not in entities:
                        entities[known] = {
                            "database": db,
                            "schema": schema,
                            "table": table,
                        }
                        logger.debug(f"Matched entity: {known} -> {db}.{schema}.{table}")
                    else:
                        logger.warning(
                            f"Multiple matches for {known}: keeping first, ignoring {db}.{schema}.{table}"
                        )
                    break
        
    except Exception as e:
        logger.error(f"Entity discovery failed: {e}")
    
    return entities


def _determine_features(entities: Dict[str, Dict[str, str]]) -> Dict[str, bool]:
    """
    Determine which features are available based on discovered entities.
    
    Args:
        entities: Dict of discovered entity tables
        
    Returns:
        Dict of feature flags
    """
    return {
        # Lineage requires PROCESS_ENTITY + at least one of TABLE_ENTITY/VIEW_ENTITY
        "lineage": (
            "PROCESS_ENTITY" in entities 
            and ("TABLE_ENTITY" in entities or "VIEW_ENTITY" in entities)
        ),
        
        # Glossary requires either ATLASGLOSSARY or ATLASGLOSSARYTERM
        "glossary": (
            "ATLASGLOSSARY_ENTITY" in entities 
            or "ATLASGLOSSARYTERM_ENTITY" in entities
        ),
        
        # Query history - disabled by default, would need QUERY_ENTITY
        "queryHistory": False,
        
        # BI usage - check for dashboard entities
        "biUsage": (
            "POWERBIDASHBOARD_ENTITY" in entities
            or "TABLEAUDASHBOARD_ENTITY" in entities
            or "LOOKERQUERY_ENTITY" in entities
        ),
        
        # dbt - check for dbt entities
        "dbt": (
            "DBTMODEL_ENTITY" in entities
            or "DBTPROCESS_ENTITY" in entities
        ),
        
        # Governance - conservative, require TABLE_ENTITY at minimum
        "governance": "TABLE_ENTITY" in entities,
    }


def _discover_catalog_tables(cursor, limit: int = 1000) -> List[Dict[str, str]]:
    """
    Discover available tables for suggestions.
    
    Args:
        cursor: Snowflake cursor
        limit: Max tables to return
        
    Returns:
        List of {db, schema, name} dicts
    """
    tables = []
    
    try:
        query = f"""
            SELECT table_catalog, table_schema, table_name
            FROM information_schema.tables
            WHERE table_type IN ('BASE TABLE', 'VIEW')
            AND table_schema NOT IN ('INFORMATION_SCHEMA')
            ORDER BY table_catalog, table_schema, table_name
            LIMIT {limit}
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        for row in rows:
            tables.append({
                "db": row[0],
                "schema": row[1],
                "name": row[2],
            })
            
    except Exception as e:
        logger.error(f"Catalog discovery failed: {e}")
    
    return tables


def get_cached_config(session_id: str) -> Optional[Dict[str, Any]]:
    """Get cached config for a session, or None if not cached."""
    return SYSTEM_CONFIG_CACHE.get(session_id)


def invalidate_config(session_id: str):
    """Invalidate cached config for a session."""
    if session_id in SYSTEM_CONFIG_CACHE:
        del SYSTEM_CONFIG_CACHE[session_id]
        logger.info(f"Invalidated SystemConfig cache for session {session_id[:8]}...")


def refresh_config(conn, session_id: str) -> Dict[str, Any]:
    """Force refresh of SystemConfig for a session."""
    invalidate_config(session_id)
    return build_system_config(conn, session_id)

