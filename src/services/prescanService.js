/**
 * Pre-scan Service - Options for faster initial load and materialization
 *
 * This service provides strategies for reducing initial load time:
 *
 * 1. LAZY LOADING (Default) - Load samples on-demand when needed
 * 2. BACKGROUND LOADING - Load samples in background after initial render
 * 3. LOCAL CACHE - Cache samples in localStorage with TTL
 * 4. SESSION CACHE - Cache samples in sessionStorage (cleared on tab close)
 * 5. MATERIALIZED VIEWS - Use pre-computed Snowflake views (requires DBA setup)
 *
 * Performance logging enabled - check console for [MDLH][Prescan] entries
 */

import { createLogger } from '../utils/logger';

const log = createLogger('Prescan');

// Cache keys
const CACHE_KEY_SAMPLES = 'mdlh_prescan_samples';
const CACHE_KEY_TABLES = 'mdlh_prescan_tables';
const CACHE_KEY_METADATA = 'mdlh_prescan_metadata';

// Default TTL: 15 minutes
const DEFAULT_TTL_MS = 15 * 60 * 1000;

/**
 * Pre-scan configuration options
 */
export const PRESCAN_STRATEGIES = {
  // Load samples only when a query needs them (default, slowest perceived but uses least resources)
  LAZY: 'lazy',

  // Load samples in background after UI renders (good balance)
  BACKGROUND: 'background',

  // Load samples immediately on connect (fastest subsequent queries, slower initial)
  EAGER: 'eager',

  // Use localStorage cache with TTL (fastest if cache hit, requires storage)
  LOCAL_CACHE: 'local_cache',

  // Use sessionStorage cache (faster, cleared on tab close)
  SESSION_CACHE: 'session_cache',
};

/**
 * Check if cached data is still valid
 */
function isCacheValid(cacheEntry, ttlMs = DEFAULT_TTL_MS) {
  if (!cacheEntry?.timestamp) return false;
  const age = Date.now() - cacheEntry.timestamp;
  return age < ttlMs;
}

/**
 * Get cached samples from storage
 * @param {string} storageType - 'local' or 'session'
 * @param {string} database - Database name for cache key
 * @param {string} schema - Schema name for cache key
 * @returns {Object|null} Cached samples or null
 */
export function getCachedSamples(storageType, database, schema) {
  const endTimer = log.time('getCachedSamples');
  try {
    const storage = storageType === 'local' ? localStorage : sessionStorage;
    const key = `${CACHE_KEY_SAMPLES}_${database}_${schema}`;
    const cached = storage.getItem(key);

    if (!cached) {
      endTimer({ hit: false, reason: 'no-cache' });
      return null;
    }

    const parsed = JSON.parse(cached);
    if (!isCacheValid(parsed)) {
      endTimer({ hit: false, reason: 'expired', ageMs: Date.now() - parsed.timestamp });
      storage.removeItem(key);
      return null;
    }

    endTimer({ hit: true, ageMs: Date.now() - parsed.timestamp, sampleCount: parsed.data?.tables?.length || 0 });
    log.info('✅ Cache HIT for samples', { database, schema, ageMs: Date.now() - parsed.timestamp });
    return parsed.data;
  } catch (err) {
    endTimer({ hit: false, reason: 'error', error: err.message });
    return null;
  }
}

/**
 * Save samples to storage cache
 * @param {string} storageType - 'local' or 'session'
 * @param {string} database - Database name for cache key
 * @param {string} schema - Schema name for cache key
 * @param {Object} samples - Sample data to cache
 */
export function cacheSamples(storageType, database, schema, samples) {
  const endTimer = log.time('cacheSamples');
  try {
    const storage = storageType === 'local' ? localStorage : sessionStorage;
    const key = `${CACHE_KEY_SAMPLES}_${database}_${schema}`;
    const entry = {
      timestamp: Date.now(),
      data: samples,
    };
    storage.setItem(key, JSON.stringify(entry));
    endTimer({ success: true, key });
    log.info('💾 Cached samples', { database, schema, storageType });
  } catch (err) {
    endTimer({ success: false, error: err.message });
    log.warn('Failed to cache samples', { error: err.message });
  }
}

/**
 * Clear all cached prescan data
 * @param {string} storageType - 'local', 'session', or 'all'
 */
export function clearPrescanCache(storageType = 'all') {
  log.info('🗑️ Clearing prescan cache', { storageType });

  const clearStorage = (storage) => {
    const keysToRemove = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith('mdlh_prescan_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => storage.removeItem(key));
    return keysToRemove.length;
  };

  let cleared = 0;
  if (storageType === 'local' || storageType === 'all') {
    cleared += clearStorage(localStorage);
  }
  if (storageType === 'session' || storageType === 'all') {
    cleared += clearStorage(sessionStorage);
  }

  log.info('✅ Cleared prescan cache', { keysRemoved: cleared });
  return cleared;
}

/**
 * Get cached table list
 */
export function getCachedTables(storageType, database, schema) {
  try {
    const storage = storageType === 'local' ? localStorage : sessionStorage;
    const key = `${CACHE_KEY_TABLES}_${database}_${schema}`;
    const cached = storage.getItem(key);

    if (!cached) return null;

    const parsed = JSON.parse(cached);
    if (!isCacheValid(parsed)) {
      storage.removeItem(key);
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Cache table list
 */
export function cacheTables(storageType, database, schema, tables) {
  try {
    const storage = storageType === 'local' ? localStorage : sessionStorage;
    const key = `${CACHE_KEY_TABLES}_${database}_${schema}`;
    storage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      data: tables,
    }));
  } catch (err) {
    log.warn('Failed to cache tables', { error: err.message });
  }
}

/**
 * Materialized View SQL generators
 *
 * These can be run by a DBA to create pre-computed views that dramatically
 * speed up common queries. Share these with your Snowflake admin.
 */
export const MATERIALIZED_VIEW_SQL = {
  // Popular tables with row counts - avoids INFORMATION_SCHEMA scan
  POPULAR_TABLES: (database, schema) => `
-- Create a materialized view of popular entity tables (run daily)
CREATE OR REPLACE VIEW ${database}.${schema}.MV_POPULAR_TABLES AS
SELECT
  TABLE_NAME,
  ROW_COUNT,
  BYTES,
  LAST_ALTERED
FROM ${database}.INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = '${schema}'
  AND TABLE_NAME LIKE '%_ENTITY'
  AND ROW_COUNT > 0
ORDER BY ROW_COUNT DESC;

-- Grant access
GRANT SELECT ON ${database}.${schema}.MV_POPULAR_TABLES TO ROLE PUBLIC;
  `.trim(),

  // Sample entities for each type - pre-computed top 10 by popularity
  SAMPLE_ENTITIES: (database, schema) => `
-- Create a materialized view of sample entities (run daily)
CREATE OR REPLACE VIEW ${database}.${schema}.MV_SAMPLE_ENTITIES AS
WITH ranked AS (
  SELECT
    'TABLE' AS entity_type,
    GUID,
    NAME,
    TYPENAME,
    POPULARITYSCORE,
    ROW_NUMBER() OVER (ORDER BY POPULARITYSCORE DESC NULLS LAST) AS rn
  FROM ${database}.${schema}.TABLE_ENTITY
  WHERE GUID IS NOT NULL

  UNION ALL

  SELECT
    'COLUMN' AS entity_type,
    GUID,
    NAME,
    TYPENAME,
    POPULARITYSCORE,
    ROW_NUMBER() OVER (ORDER BY POPULARITYSCORE DESC NULLS LAST) AS rn
  FROM ${database}.${schema}.COLUMN_ENTITY
  WHERE GUID IS NOT NULL

  UNION ALL

  SELECT
    'PROCESS' AS entity_type,
    GUID,
    NAME,
    TYPENAME,
    POPULARITYSCORE,
    ROW_NUMBER() OVER (ORDER BY POPULARITYSCORE DESC NULLS LAST) AS rn
  FROM ${database}.${schema}.PROCESS_ENTITY
  WHERE GUID IS NOT NULL

  UNION ALL

  SELECT
    'GLOSSARY_TERM' AS entity_type,
    GUID,
    NAME,
    TYPENAME,
    POPULARITYSCORE,
    ROW_NUMBER() OVER (ORDER BY POPULARITYSCORE DESC NULLS LAST) AS rn
  FROM ${database}.${schema}.ATLASGLOSSARYTERM_ENTITY
  WHERE GUID IS NOT NULL
)
SELECT * FROM ranked WHERE rn <= 10;

-- Grant access
GRANT SELECT ON ${database}.${schema}.MV_SAMPLE_ENTITIES TO ROLE PUBLIC;
  `.trim(),

  // Lineage summary - pre-computed upstream/downstream counts
  LINEAGE_SUMMARY: (database, schema) => `
-- Create a materialized view of lineage summaries (run daily)
CREATE OR REPLACE VIEW ${database}.${schema}.MV_LINEAGE_SUMMARY AS
SELECT
  t.GUID AS table_guid,
  t.NAME AS table_name,
  COUNT(DISTINCT CASE WHEN p.OUTPUTS::STRING ILIKE '%' || t.GUID || '%' THEN p.GUID END) AS upstream_count,
  COUNT(DISTINCT CASE WHEN p.INPUTS::STRING ILIKE '%' || t.GUID || '%' THEN p.GUID END) AS downstream_count
FROM ${database}.${schema}.TABLE_ENTITY t
LEFT JOIN ${database}.${schema}.PROCESS_ENTITY p
  ON p.OUTPUTS::STRING ILIKE '%' || t.GUID || '%'
  OR p.INPUTS::STRING ILIKE '%' || t.GUID || '%'
GROUP BY t.GUID, t.NAME
HAVING upstream_count > 0 OR downstream_count > 0;

-- Grant access
GRANT SELECT ON ${database}.${schema}.MV_LINEAGE_SUMMARY TO ROLE PUBLIC;
  `.trim(),
};

/**
 * Generate all materialized view SQL for a database/schema
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {string} Combined SQL to create all materialized views
 */
export function generateMaterializedViewsSQL(database, schema) {
  return [
    '-- MDLH Dictionary Materialized Views',
    '-- Run these as a DBA to dramatically improve query performance',
    '-- Recommended: Schedule to run daily via Snowflake Task',
    '',
    '-- 1. Popular Tables View',
    MATERIALIZED_VIEW_SQL.POPULAR_TABLES(database, schema),
    '',
    '-- 2. Sample Entities View',
    MATERIALIZED_VIEW_SQL.SAMPLE_ENTITIES(database, schema),
    '',
    '-- 3. Lineage Summary View',
    MATERIALIZED_VIEW_SQL.LINEAGE_SUMMARY(database, schema),
  ].join('\n');
}

/**
 * Check if materialized views exist
 * @param {Function} executeQuery - Query execution function
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {Promise<Object>} Status of each materialized view
 */
export async function checkMaterializedViews(executeQuery, database, schema) {
  const endTimer = log.time('checkMaterializedViews');

  const views = ['MV_POPULAR_TABLES', 'MV_SAMPLE_ENTITIES', 'MV_LINEAGE_SUMMARY'];
  const status = {};

  try {
    const sql = `
      SELECT TABLE_NAME
      FROM ${database}.INFORMATION_SCHEMA.VIEWS
      WHERE TABLE_SCHEMA = '${schema}'
        AND TABLE_NAME IN (${views.map(v => `'${v}'`).join(', ')})
    `;

    const result = await executeQuery(sql);
    const existingViews = new Set(
      (result?.rows || []).map(r => (Array.isArray(r) ? r[0] : r.TABLE_NAME)?.toUpperCase())
    );

    views.forEach(v => {
      status[v] = existingViews.has(v.toUpperCase());
    });

    endTimer({ status });
    log.info('Materialized view status', status);
    return status;
  } catch (err) {
    endTimer({ error: err.message });
    log.warn('Failed to check materialized views', { error: err.message });
    return views.reduce((acc, v) => ({ ...acc, [v]: false }), {});
  }
}

/**
 * Load samples using materialized view if available
 * Falls back to regular query if view doesn't exist
 */
export async function loadSamplesOptimized(executeQuery, database, schema, useMaterializedView = true) {
  const endTimer = log.time('loadSamplesOptimized');

  if (useMaterializedView) {
    try {
      // Try materialized view first
      const sql = `SELECT * FROM ${database}.${schema}.MV_SAMPLE_ENTITIES LIMIT 50`;
      const result = await executeQuery(sql);

      if (result?.rows?.length) {
        // Group by entity_type
        const samples = {
          tables: [],
          columns: [],
          processes: [],
          terms: [],
        };

        result.rows.forEach(row => {
          const normalized = Array.isArray(row)
            ? { entity_type: row[0], GUID: row[1], NAME: row[2], TYPENAME: row[3] }
            : row;

          const type = (normalized.ENTITY_TYPE || normalized.entity_type || '').toUpperCase();
          if (type === 'TABLE') samples.tables.push(normalized);
          else if (type === 'COLUMN') samples.columns.push(normalized);
          else if (type === 'PROCESS') samples.processes.push(normalized);
          else if (type === 'GLOSSARY_TERM') samples.terms.push(normalized);
        });

        endTimer({ source: 'materialized_view', totalSamples: result.rows.length });
        log.info('✅ Loaded samples from materialized view', { totalSamples: result.rows.length });
        return samples;
      }
    } catch (err) {
      log.debug('Materialized view not available, falling back', { error: err.message });
    }
  }

  // Fallback: return null to indicate caller should use regular loading
  endTimer({ source: 'fallback' });
  return null;
}

export default {
  PRESCAN_STRATEGIES,
  getCachedSamples,
  cacheSamples,
  clearPrescanCache,
  getCachedTables,
  cacheTables,
  generateMaterializedViewsSQL,
  checkMaterializedViews,
  loadSamplesOptimized,
};
