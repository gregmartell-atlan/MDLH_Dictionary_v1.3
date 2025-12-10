/**
 * Table Discovery Utilities
 * 
 * Functions for discovering which MDLH entity tables exist in a Snowflake database,
 * finding alternative table names, and fixing queries to use available tables.
 */

import { LRUCache } from './LRUCache';
import { createLogger } from './logger';

const log = createLogger('tableDiscovery');

// API base URL for fetching metadata
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Cache for discovered tables (LRU with 15-minute TTL, larger capacity)
const tableCache = new LRUCache(50, 15 * 60 * 1000);

// Cache for column metadata (larger capacity, 30-minute TTL)
const columnCache = new LRUCache(500, 30 * 60 * 1000);

// Cache for table metadata with popularity scores
const tableMetadataCache = new LRUCache(50, 15 * 60 * 1000);

// Track last discovery timestamp for incremental updates
const lastDiscoveryTimestamp = new Map();

/**
 * Get session ID from sessionStorage
 * @returns {string|null}
 */
function getSessionId() {
  const stored = sessionStorage.getItem('snowflake_session');
  log.debug('getSessionId() - raw storage', { exists: !!stored });
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const sessionId = parsed.sessionId;
      log.debug('getSessionId() - parsed', {
        hasSessionId: !!sessionId,
        sessionIdPrefix: sessionId?.substring(0, 8),
        age: parsed.timestamp ? `${Math.round((Date.now() - parsed.timestamp) / 1000)}s` : 'unknown'
      });
      return sessionId;
    } catch (e) {
      log.error('getSessionId() - parse error', { error: e.message });
      return null;
    }
  }
  return null;
}

/**
 * Discover which MDLH entity tables exist in the connected database
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {Promise<Set<string>>} Set of table names (uppercase)
 */
export async function discoverMDLHTables(database, schema) {
  const cacheKey = `${database}.${schema}`;

  // Return cached if available
  const cached = tableCache.get(cacheKey);
  if (cached && cached.size > 0) {
    return cached;
  }

  try {
    const sessionId = getSessionId();

    if (!sessionId) {
      log.warn('discoverMDLHTables() - no session, cannot discover tables');
      return new Set();
    }

    // Force refresh if previous attempt returned empty
    const forceRefresh = !cached || cached.size === 0;

    // Fetch all tables in the schema (now includes popularity data)
    const response = await fetch(
      `${API_BASE_URL}/api/metadata/tables?database=${database}&schema=${schema}&refresh=${forceRefresh}&include_popularity=true`,
      { headers: { 'X-Session-ID': sessionId } }
    );

    if (response.ok) {
      const tables = await response.json();
      const tableNames = new Set(tables.map(t => t.name?.toUpperCase() || t.toUpperCase()));

      // Build metadata map with popularity scores
      const metadataMap = {};
      for (const t of tables) {
        const name = t.name?.toUpperCase() || t.toUpperCase();
        metadataMap[name] = {
          name: t.name,
          rowCount: t.row_count || 0,
          bytes: t.bytes || 0,
          queryCount: t.query_count || 0,
          uniqueUsers: t.unique_users || 0,
          popularityScore: t.popularity_score || 0,
          kind: t.kind || 'TABLE'
        };
      }

      // Update caches
      tableCache.set(cacheKey, tableNames);
      tableMetadataCache.set(cacheKey, metadataMap);

      // Track discovery timestamp for incremental updates
      lastDiscoveryTimestamp.set(cacheKey, new Date().toISOString());

      log.info('Discovered tables', {
        count: tableNames.size,
        database,
        schema,
        withPopularity: Object.values(metadataMap).some(m => m.popularityScore > 0)
      });
      return tableNames;
    }
  } catch (err) {
    log.error('Failed to discover tables', { error: err.message });
  }

  return new Set();
}

/**
 * Get table metadata including popularity scores
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {Object} Map of table name -> metadata
 */
export function getTableMetadata(database, schema) {
  const cacheKey = `${database}.${schema}`;
  return tableMetadataCache.get(cacheKey) || {};
}

/**
 * Get tables sorted by popularity
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {number} limit - Max tables to return
 * @returns {Array} Tables sorted by popularity
 */
export function getPopularTables(database, schema, limit = 20) {
  const metadata = getTableMetadata(database, schema);
  return Object.values(metadata)
    .sort((a, b) => {
      // Sort by popularity score first, then query count, then row count
      if (b.popularityScore !== a.popularityScore) {
        return b.popularityScore - a.popularityScore;
      }
      if (b.queryCount !== a.queryCount) {
        return b.queryCount - a.queryCount;
      }
      return b.rowCount - a.rowCount;
    })
    .slice(0, limit);
}

/**
 * Find alternative table name if expected one doesn't exist
 * @param {string} expectedTable - Expected table name
 * @param {Set<string>} discoveredTables - Set of discovered table names
 * @returns {string|null} Alternative table name or null
 */
export function findAlternativeTable(expectedTable, discoveredTables) {
  if (!expectedTable || discoveredTables.size === 0) return null;
  
  const expected = expectedTable.toUpperCase();
  
  // If exact match exists, return it
  if (discoveredTables.has(expected)) return expected;
  
  // Try common variations
  const variations = [
    expected,
    expected.replace('_ENTITY', ''),  // TABLE_ENTITY -> TABLE
    expected + '_ENTITY',              // TABLE -> TABLE_ENTITY
    expected.replace('ATLAS', ''),     // ATLASGLOSSARY -> GLOSSARY
    'ATLAS' + expected,                // GLOSSARY -> ATLASGLOSSARY
  ];
  
  for (const variation of variations) {
    if (discoveredTables.has(variation)) return variation;
  }
  
  // Try fuzzy match - find tables containing the key part
  const keyPart = expected.replace('_ENTITY', '').replace('ATLAS', '');
  for (const table of discoveredTables) {
    if (table.includes(keyPart) && table.endsWith('_ENTITY')) {
      return table;
    }
  }
  
  return null;
}

/**
 * Fix a query to use available tables
 * @param {string} sql - SQL query
 * @param {Set<string>} discoveredTables - Set of discovered tables
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {{sql: string, fixed: boolean, changes: Array}} Fixed query info
 */
export function fixQueryForAvailableTables(sql, discoveredTables, database, schema) {
  if (!sql || discoveredTables.size === 0) return { sql, fixed: false, changes: [] };
  
  const changes = [];
  let fixedSql = sql;
  
  // Find all table references in the query (FROM/JOIN clauses)
  const tablePattern = /(?:FROM|JOIN)\s+(?:[\w.]+\.)?(\w+_ENTITY)/gi;
  let match;
  
  while ((match = tablePattern.exec(sql)) !== null) {
    const originalTable = match[1].toUpperCase();
    
    if (!discoveredTables.has(originalTable)) {
      const alternative = findAlternativeTable(originalTable, discoveredTables);
      
      if (alternative && alternative !== originalTable) {
        // Replace the table name in the query
        const fullRef = `${database}.${schema}.${alternative}`;
        fixedSql = fixedSql.replace(
          new RegExp(`(FROM|JOIN)\\s+(?:[\\w.]+\\.)?${match[1]}`, 'gi'),
          `$1 ${fullRef}`
        );
        changes.push({ from: originalTable, to: alternative });
      }
    }
  }
  
  return {
    sql: fixedSql,
    fixed: changes.length > 0,
    changes
  };
}

/**
 * Check if a table exists in the discovered tables
 * @param {string} tableName - Table name to check
 * @param {Set<string>} discoveredTables - Set of discovered tables
 * @returns {boolean}
 */
export function tableExists(tableName, discoveredTables) {
  if (!tableName || tableName === '(abstract)') return false;
  return discoveredTables.has(tableName.toUpperCase());
}

/**
 * Extract table name from a SQL query
 * @param {string} sql - SQL query
 * @returns {string|null} Table name or null
 */
export function extractTableFromQuery(sql) {
  if (!sql) return null;
  const match = sql.match(/FROM\s+(?:[\w.]+\.)?(\w+_ENTITY)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Get all entity tables referenced in a category's queries and data
 * @param {Array} dataForCategory - Entity data
 * @param {Array} queriesForCategory - Query examples
 * @returns {Set<string>}
 */
export function getEntityTablesForCategory(dataForCategory, queriesForCategory) {
  const tables = new Set();
  
  // From entity data
  if (dataForCategory) {
    dataForCategory.forEach(row => {
      if (row.table && row.table !== '(abstract)') {
        tables.add(row.table.toUpperCase());
      }
    });
  }
  
  // From queries
  if (queriesForCategory) {
    queriesForCategory.forEach(q => {
      const match = q.query?.match(/FROM\s+(?:[\w.]+\.)?(\w+_ENTITY)/i);
      if (match) tables.add(match[1].toUpperCase());
    });
  }
  
  return tables;
}

/**
 * Validate a query by running it with LIMIT 0 (fast check)
 * @param {string} sql - SQL query
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {Promise<{valid: boolean, error?: string, columns?: Array}>}
 */
export async function validateQuery(sql, database, schema) {
  try {
    const sessionId = getSessionId();
    
    if (!sessionId) return { valid: false, error: 'Not connected' };
    
    // Modify query to add LIMIT 0 for fast validation (no data transfer)
    let testSql = sql.trim();
    // Remove existing LIMIT clause and add LIMIT 0
    testSql = testSql.replace(/LIMIT\s+\d+\s*;?\s*$/i, '');
    testSql = testSql.replace(/;?\s*$/, '') + ' LIMIT 0;';
    
    const response = await fetch(`${API_BASE_URL}/api/query/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      },
      body: JSON.stringify({
        sql: testSql,
        database,
        schema,
        timeout: 10,
      }),
    });
    
    const result = await response.json();
    
    if (result.status === 'COMPLETED' || result.status === 'completed') {
      return { valid: true, columns: result.columns };
    } else {
      return { valid: false, error: result.error_message || result.error || 'Query failed' };
    }
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Fetch columns for a table from the backend
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {string} table - Table name
 * @returns {Promise<Array>} Column definitions
 */
export async function fetchTableColumns(database, schema, table) {
  const cacheKey = `${database}.${schema}.${table}`;
  
  // Return cached columns if available
  const cached = columnCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const sessionId = getSessionId();
    
    if (!sessionId) {
      log.warn('fetchTableColumns() - no session, cannot fetch columns');
      return [];
    }
    
    const response = await fetch(
      `${API_BASE_URL}/api/metadata/columns?database=${database}&schema=${schema}&table=${table}`,
      { headers: { 'X-Session-ID': sessionId } }
    );
    
    if (response.ok) {
      const columns = await response.json();
      columnCache.set(cacheKey, columns);
      return columns;
    }
  } catch (err) {
    log.error('Failed to fetch columns', { table, error: err.message });
  }
  
  return [];
}

/**
 * Clear all discovery caches
 */
export function clearDiscoveryCache() {
  tableCache.clear();
  columnCache.clear();
  tableMetadataCache.clear();
  lastDiscoveryTimestamp.clear();
}

/**
 * Check for tables that have changed since last discovery
 * Updates the cache incrementally instead of re-fetching everything
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {Promise<Array>} List of changed tables
 */
export async function checkForChangedTables(database, schema) {
  const cacheKey = `${database}.${schema}`;
  const lastTimestamp = lastDiscoveryTimestamp.get(cacheKey);

  if (!lastTimestamp) {
    // No previous discovery - do a full fetch instead
    log.debug('No previous discovery timestamp, skipping incremental check');
    return [];
  }

  try {
    const sessionId = getSessionId();
    if (!sessionId) {
      return [];
    }

    const response = await fetch(
      `${API_BASE_URL}/api/metadata/tables/changes?database=${database}&schema=${schema}&since=${lastTimestamp}`,
      { headers: { 'X-Session-ID': sessionId } }
    );

    if (response.ok) {
      const changedTables = await response.json();

      if (changedTables.length > 0) {
        // Update the metadata cache with changed tables
        const currentMetadata = tableMetadataCache.get(cacheKey) || {};
        const currentTables = tableCache.get(cacheKey) || new Set();

        for (const t of changedTables) {
          const name = t.name?.toUpperCase();
          if (name) {
            currentTables.add(name);
            currentMetadata[name] = {
              name: t.name,
              rowCount: t.row_count || 0,
              bytes: t.bytes || 0,
              queryCount: t.query_count || 0,
              uniqueUsers: t.unique_users || 0,
              popularityScore: t.popularity_score || 0,
              kind: t.kind || 'TABLE',
              lastAltered: t.last_altered
            };
          }
        }

        tableCache.set(cacheKey, currentTables);
        tableMetadataCache.set(cacheKey, currentMetadata);

        log.info('Incremental discovery updated', {
          database,
          schema,
          changedCount: changedTables.length
        });
      }

      // Update timestamp
      lastDiscoveryTimestamp.set(cacheKey, new Date().toISOString());

      return changedTables;
    }
  } catch (err) {
    log.error('Failed to check for changed tables', { error: err.message });
  }

  return [];
}

/**
 * Fetch popular tables directly (faster than full discovery)
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {number} limit - Max tables to return
 * @returns {Promise<Array>} Popular tables sorted by usage
 */
export async function fetchPopularTables(database, schema, limit = 20) {
  try {
    const sessionId = getSessionId();
    if (!sessionId) {
      return [];
    }

    const response = await fetch(
      `${API_BASE_URL}/api/metadata/tables/popular?database=${database}&schema=${schema}&limit=${limit}`,
      { headers: { 'X-Session-ID': sessionId } }
    );

    if (response.ok) {
      const tables = await response.json();
      log.info('Fetched popular tables', {
        database,
        schema,
        count: tables.length
      });
      return tables;
    }
  } catch (err) {
    log.error('Failed to fetch popular tables', { error: err.message });
  }

  return [];
}

/**
 * Prefetch metadata for popular tables on connection
 * Call this after successful connection to warm the cache
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {number} prefetchCount - Number of popular tables to prefetch columns for
 */
export async function prefetchPopularTableMetadata(database, schema, prefetchCount = 5) {
  try {
    // First discover all tables (this populates the metadata cache)
    await discoverMDLHTables(database, schema);

    // Get the most popular tables
    const popularTables = getPopularTables(database, schema, prefetchCount);

    // Prefetch columns for popular tables in parallel
    const columnPromises = popularTables.map(t =>
      fetchTableColumns(database, schema, t.name)
    );

    await Promise.all(columnPromises);

    log.info('Prefetched metadata for popular tables', {
      database,
      schema,
      tableCount: popularTables.length,
      tables: popularTables.map(t => t.name)
    });

    return popularTables;
  } catch (err) {
    log.error('Failed to prefetch popular table metadata', { error: err.message });
    return [];
  }
}

export default {
  discoverMDLHTables,
  findAlternativeTable,
  fixQueryForAvailableTables,
  tableExists,
  extractTableFromQuery,
  getEntityTablesForCategory,
  validateQuery,
  fetchTableColumns,
  clearDiscoveryCache,
  getTableMetadata,
  getPopularTables,
  prefetchPopularTableMetadata,
  checkForChangedTables,
  fetchPopularTables,
};

