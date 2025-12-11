/**
 * Placeholder Value Suggestions
 * 
 * Provides intelligent autocomplete for query placeholders like {{domain}}, {{glossary}}, etc.
 * based on actual data discovered in the connected Snowflake schema.
 * 
 * Features:
 * - Pre-scans popular tables for common placeholder values
 * - Caches discovered values for fast suggestions
 * - Only suggests values where assets actually exist (NOT NULL)
 * - Supports domain, glossary, owner, typename, and custom entity lookups
 */

import { createLogger } from './logger';
import { escapeStringValue, buildSafeFQN } from './queryHelpers';
import { 
  buildGlossaryTermJoin,
  buildDataProductDomainJoin,
  buildSearchClause,
  ARRAY_COLUMNS
} from './snowflakeQueryHelpers';

const log = createLogger('PlaceholderValueSuggestions');

// =============================================================================
// Cache for discovered placeholder values
// =============================================================================

class PlaceholderValueCache {
  constructor() {
    this.cache = new Map();
    this.lastRefresh = null;
    this.ttl = 5 * 60 * 1000; // 5 minutes
  }

  set(key, values) {
    this.cache.set(key, {
      values,
      timestamp: Date.now()
    });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.values;
  }

  clear() {
    this.cache.clear();
    this.lastRefresh = null;
  }

  getAll() {
    const result = {};
    for (const [key, entry] of this.cache.entries()) {
      if (Date.now() - entry.timestamp <= this.ttl) {
        result[key] = entry.values;
      }
    }
    return result;
  }
}

const placeholderCache = new PlaceholderValueCache();

// =============================================================================
// Placeholder Type Definitions
// =============================================================================

/**
 * Configuration for each placeholder type
 * Maps placeholder names to the queries needed to fetch their values
 */
export const PLACEHOLDER_CONFIGS = {
  // Domain placeholders
  domain: {
    patterns: ['{{domain}}', '{{DOMAIN}}', '<DOMAIN>', '<domain>'],
    sourceTable: 'DATADOMAIN_ENTITY',
    // Primary query: try to get domains with product counts
    query: (db, schema) => `
      SELECT DISTINCT 
        dd."NAME" AS value,
        dd."GUID" AS guid,
        COALESCE(COUNT(DISTINCT dp."GUID"), 0) AS asset_count
      FROM ${db}.${schema}.DATADOMAIN_ENTITY dd
      LEFT JOIN ${db}.${schema}.DATAPRODUCT_ENTITY dp 
        ON dd."QUALIFIEDNAME" = dp."PARENTDOMAINQUALIFIEDNAME"
      WHERE dd."NAME" IS NOT NULL
      GROUP BY dd."NAME", dd."GUID"
      ORDER BY asset_count DESC NULLS LAST, dd."NAME"
      LIMIT 50
    `,
    // Fallback: just list domains without the product count join
    fallbackQuery: (db, schema) => `
      SELECT DISTINCT 
        "NAME" AS value,
        "GUID" AS guid,
        0 AS asset_count
      FROM ${db}.${schema}.DATADOMAIN_ENTITY
      WHERE "NAME" IS NOT NULL
      ORDER BY "NAME"
      LIMIT 50
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      guid: row.GUID || row.guid,
      label: row.VALUE || row.value,
      detail: (row.ASSET_COUNT || row.asset_count) > 0 ? `${row.ASSET_COUNT || row.asset_count} products` : 'Domain',
      insertValue: row.VALUE || row.value
    })
  },

  // Glossary placeholders
  glossary: {
    patterns: ['{{glossary}}', '{{GLOSSARY}}', '<GLOSSARY_GUID>', '<glossary>'],
    sourceTable: 'ATLASGLOSSARY_ENTITY',
    // ANCHOR is an OBJECT with guid field - extract it directly
    query: (db, schema) => `
      SELECT DISTINCT 
        g."NAME" AS value,
        g."GUID" AS guid,
        COUNT(DISTINCT t."GUID") AS term_count
      FROM ${db}.${schema}.ATLASGLOSSARY_ENTITY g
      LEFT JOIN ${db}.${schema}.ATLASGLOSSARYTERM_ENTITY t 
        ON t."ANCHOR":guid::STRING = g."GUID"
      WHERE g."NAME" IS NOT NULL
      GROUP BY g."NAME", g."GUID"
      ORDER BY term_count DESC, g."NAME"
      LIMIT 50
    `,
    fallbackQuery: (db, schema) => `
      SELECT DISTINCT 
        "NAME" AS value,
        "GUID" AS guid,
        0 AS term_count
      FROM ${db}.${schema}.ATLASGLOSSARY_ENTITY
      WHERE "NAME" IS NOT NULL
      ORDER BY "NAME"
      LIMIT 50
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      guid: row.GUID || row.guid,
      label: row.VALUE || row.value,
      detail: row.TERM_COUNT > 0 ? `${row.TERM_COUNT} terms` : 'Glossary',
      insertValue: row.GUID || row.guid // For glossary, we often want the GUID
    })
  },

  // Owner placeholders
  owner: {
    patterns: ['{{owner}}', '{{OWNER}}', '{{OWNER_USERNAME}}', '<OWNER>'],
    sourceTable: 'TABLE_ENTITY',
    query: (db, schema) => `
      SELECT DISTINCT 
        f.value::STRING AS value,
        COUNT(*) AS asset_count
      FROM ${db}.${schema}.TABLE_ENTITY t,
      LATERAL FLATTEN(INPUT => t."OWNERUSERS", OUTER => FALSE) f
      WHERE f.value IS NOT NULL
      GROUP BY f.value::STRING
      HAVING COUNT(*) > 0
      ORDER BY asset_count DESC
      LIMIT 50
    `,
    fallbackQuery: (db, schema) => `
      SELECT DISTINCT 
        "CREATEDBY" AS value,
        COUNT(*) AS asset_count
      FROM ${db}.${schema}.TABLE_ENTITY
      WHERE "CREATEDBY" IS NOT NULL
      GROUP BY "CREATEDBY"
      ORDER BY asset_count DESC
      LIMIT 50
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      label: row.VALUE || row.value,
      detail: row.ASSET_COUNT > 0 ? `${row.ASSET_COUNT} assets` : 'Owner',
      insertValue: row.VALUE || row.value
    })
  },

  // TypeName placeholders
  typename: {
    patterns: ['{{typename}}', '{{TYPENAME}}', '{{type}}', '<TYPE>'],
    sourceTable: null, // Will query multiple tables
    query: (db, schema) => `
      SELECT DISTINCT 
        "TYPENAME" AS value,
        COUNT(*) AS asset_count
      FROM ${db}.${schema}.TABLE_ENTITY
      WHERE "TYPENAME" IS NOT NULL
      GROUP BY "TYPENAME"
      UNION ALL
      SELECT DISTINCT 
        "TYPENAME" AS value,
        COUNT(*) AS asset_count
      FROM ${db}.${schema}.COLUMN_ENTITY
      WHERE "TYPENAME" IS NOT NULL
      GROUP BY "TYPENAME"
      ORDER BY asset_count DESC
      LIMIT 50
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      label: row.VALUE || row.value,
      detail: row.ASSET_COUNT > 0 ? `${row.ASSET_COUNT} assets` : 'Type',
      insertValue: row.VALUE || row.value
    })
  },

  // Database placeholders
  database: {
    patterns: ['{{database}}', '{{DATABASE}}', '{{db}}', '<DATABASE>'],
    sourceTable: 'DATABASE_ENTITY',
    query: (db, schema) => `
      SELECT DISTINCT 
        "NAME" AS value,
        "GUID" AS guid
      FROM ${db}.${schema}.DATABASE_ENTITY
      WHERE "NAME" IS NOT NULL
      ORDER BY "NAME"
      LIMIT 50
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      guid: row.GUID || row.guid,
      label: row.VALUE || row.value,
      detail: 'Database',
      insertValue: row.VALUE || row.value
    })
  },

  // Schema placeholders
  schema: {
    patterns: ['{{schema}}', '{{SCHEMA}}', '<SCHEMA>'],
    sourceTable: 'SCHEMA_ENTITY',
    query: (db, schema) => `
      SELECT DISTINCT 
        s."NAME" AS value,
        s."GUID" AS guid,
        d."NAME" AS database_name
      FROM ${db}.${schema}.SCHEMA_ENTITY s
      LEFT JOIN ${db}.${schema}.DATABASE_ENTITY d ON s."DATABASEGUID" = d."GUID"
      WHERE s."NAME" IS NOT NULL
      ORDER BY d."NAME", s."NAME"
      LIMIT 100
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      guid: row.GUID || row.guid,
      label: row.VALUE || row.value,
      detail: row.DATABASE_NAME ? `in ${row.DATABASE_NAME}` : 'Schema',
      insertValue: row.VALUE || row.value
    })
  },

  // Connection placeholders
  connection: {
    patterns: ['{{connection}}', '{{CONNECTION}}', '<CONNECTION>'],
    sourceTable: 'CONNECTION_ENTITY',
    query: (db, schema) => `
      SELECT DISTINCT 
        "NAME" AS value,
        "GUID" AS guid,
        "TYPENAME" AS connection_type
      FROM ${db}.${schema}.CONNECTION_ENTITY
      WHERE "NAME" IS NOT NULL
      ORDER BY "TYPENAME", "NAME"
      LIMIT 50
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      guid: row.GUID || row.guid,
      label: row.VALUE || row.value,
      detail: row.CONNECTION_TYPE || 'Connection',
      insertValue: row.VALUE || row.value
    })
  },

  // Table name placeholders
  table: {
    patterns: ['{{table}}', '{{TABLE}}', '{{table_name}}', '<TABLE>'],
    sourceTable: 'TABLE_ENTITY',
    query: (db, schema) => `
      SELECT DISTINCT 
        t."NAME" AS value,
        t."GUID" AS guid,
        t."TYPENAME" AS table_type,
        t."ROWCOUNT" AS row_count
      FROM ${db}.${schema}.TABLE_ENTITY t
      WHERE t."NAME" IS NOT NULL
        AND t."ROWCOUNT" > 0
      ORDER BY t."ROWCOUNT" DESC NULLS LAST
      LIMIT 100
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      guid: row.GUID || row.guid,
      label: row.VALUE || row.value,
      detail: row.ROW_COUNT > 0 ? `${Number(row.ROW_COUNT).toLocaleString()} rows` : (row.TABLE_TYPE || 'Table'),
      insertValue: row.VALUE || row.value
    })
  },

  // GUID placeholders - special handling
  guid: {
    patterns: ['{{GUID}}', '{{guid}}', '<GUID>', '<YOUR_GUID>', '<YOUR_ASSET_GUID>'],
    sourceTable: 'TABLE_ENTITY',
    query: (db, schema) => `
      SELECT 
        "GUID" AS value,
        "NAME" AS name,
        "TYPENAME" AS asset_type
      FROM ${db}.${schema}.TABLE_ENTITY
      WHERE "GUID" IS NOT NULL AND "NAME" IS NOT NULL
      ORDER BY "NAME"
      LIMIT 50
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      label: row.NAME || row.name || (row.VALUE || row.value).substring(0, 8) + '...',
      detail: row.ASSET_TYPE || row.asset_type || 'Asset',
      insertValue: row.VALUE || row.value
    })
  },

  // Term placeholders
  term: {
    patterns: ['{{term}}', '{{TERM}}', '<TERM>', '{{TERM_GUID}}'],
    sourceTable: 'ATLASGLOSSARYTERM_ENTITY',
    // ANCHOR is an OBJECT with guid field - extract it directly
    query: (db, schema) => `
      SELECT DISTINCT 
        t."NAME" AS value,
        t."GUID" AS guid,
        g."NAME" AS glossary_name
      FROM ${db}.${schema}.ATLASGLOSSARYTERM_ENTITY t
      LEFT JOIN ${db}.${schema}.ATLASGLOSSARY_ENTITY g 
        ON t."ANCHOR":guid::STRING = g."GUID"
      WHERE t."NAME" IS NOT NULL
      ORDER BY g."NAME", t."NAME"
      LIMIT 100
    `,
    displayFormat: (row) => ({
      value: row.VALUE || row.value,
      guid: row.GUID || row.guid,
      label: row.VALUE || row.value,
      detail: row.GLOSSARY_NAME ? `in ${row.GLOSSARY_NAME}` : 'Term',
      insertValue: row.VALUE || row.value
    })
  }
};

// =============================================================================
// Placeholder Detection
// =============================================================================

/**
 * Detect placeholders in SQL and determine their types
 * @param {string} sql - SQL query
 * @returns {Array<{placeholder: string, type: string, position: number}>}
 */
export function detectPlaceholdersWithTypes(sql) {
  if (!sql) return [];
  
  const detected = [];
  
  // Match {{...}} and <...> patterns
  const patterns = [
    /\{\{([a-zA-Z_]+)\}\}/gi,  // {{placeholder}}
    /<([A-Z_]+)>/gi,           // <PLACEHOLDER>
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      const placeholder = match[0];
      const name = match[1].toLowerCase();
      
      // Determine type from placeholder name
      let type = 'unknown';
      for (const [configType, config] of Object.entries(PLACEHOLDER_CONFIGS)) {
        if (config.patterns.some(p => p.toLowerCase().includes(name))) {
          type = configType;
          break;
        }
      }
      
      detected.push({
        placeholder,
        name: match[1],
        type,
        position: match.index,
        length: placeholder.length
      });
    }
  }
  
  return detected;
}

// =============================================================================
// Value Fetching
// =============================================================================

/**
 * Fetch values for a specific placeholder type
 * @param {string} type - Placeholder type (domain, glossary, etc.)
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {Set<string>} availableTables - Tables available in schema
 * @param {Function} executeQuery - Function to execute SQL
 * @returns {Promise<Array>} - Array of suggestion values
 */
export async function fetchPlaceholderValues(type, database, schema, availableTables, executeQuery) {
  const config = PLACEHOLDER_CONFIGS[type];
  if (!config) {
    log.warn(`No config for placeholder type: ${type}`);
    return [];
  }
  
  // Check cache first
  const cacheKey = `${type}:${database}.${schema}`;
  const cached = placeholderCache.get(cacheKey);
  if (cached) {
    log.debug(`Cache hit for ${cacheKey}`, { count: cached.length });
    return cached;
  }
  
  // Check if source table exists
  const tablesSet = new Set([...availableTables].map(t => t.toUpperCase()));
  log.debug(`Checking source table for ${type}`, { 
    sourceTable: config.sourceTable,
    tableCount: tablesSet.size,
    hasTable: config.sourceTable ? tablesSet.has(config.sourceTable.toUpperCase()) : 'N/A'
  });
  
  if (config.sourceTable && !tablesSet.has(config.sourceTable.toUpperCase())) {
    log.warn(`Source table ${config.sourceTable} not found for ${type}`, {
      availableCount: tablesSet.size,
      sampleTables: [...tablesSet].slice(0, 5)
    });
    return [];
  }
  
  try {
    // Try primary query
    let sql = config.query(database, schema);
    log.debug(`Fetching ${type} values`, { sql: sql.substring(0, 100) });
    
    let result;
    try {
      result = await executeQuery(sql);
      
      // If primary query returns empty AND we have a fallback, try it
      if ((!result?.rows?.length || result.rows.length === 0) && config.fallbackQuery) {
        log.debug(`Primary query returned empty, trying fallback for ${type}`);
        sql = config.fallbackQuery(database, schema);
        result = await executeQuery(sql);
      }
    } catch (primaryError) {
      // Try fallback query if primary fails with error
      if (config.fallbackQuery) {
        log.debug(`Primary query failed, trying fallback for ${type}`, { error: primaryError.message });
        sql = config.fallbackQuery(database, schema);
        result = await executeQuery(sql);
      } else {
        throw primaryError;
      }
    }
    
    if (!result?.rows?.length) {
      log.debug(`No values found for ${type} (even with fallback)`);
      return [];
    }
    
    // Log raw results for debugging
    log.info(`Raw results for ${type}`, { 
      rowCount: result.rows.length, 
      firstRow: result.rows[0],
      firstRowIsArray: Array.isArray(result.rows[0]),
      columns: result.columns || Object.keys(result.rows[0] || {})
    });
    
    // Format results
    const values = result.rows.map((row, idx) => {
      // Normalize row to handle both uppercase and lowercase column names
      const normalizedRow = {};
      
      // Handle BOTH array and object row formats!
      // Snowflake connector sometimes returns arrays, sometimes objects
      if (Array.isArray(row)) {
        // Row is an array - map by column position
        const columns = result.columns || ['VALUE', 'GUID', 'TERM_COUNT', 'ASSET_COUNT'];
        row.forEach((val, colIdx) => {
          const colName = columns[colIdx] || `COL_${colIdx}`;
          normalizedRow[colName.toUpperCase()] = val;
          normalizedRow[colName.toLowerCase()] = val;
        });
      } else if (row && typeof row === 'object') {
        // Row is an object - use keys directly
        for (const [key, val] of Object.entries(row)) {
          normalizedRow[key.toUpperCase()] = val;
          normalizedRow[key.toLowerCase()] = val;
        }
      }
      
      const formatted = config.displayFormat(normalizedRow);
      
      // Debug first few rows
      if (idx < 3) {
        log.debug(`Formatted row ${idx}`, { 
          rawRow: row, 
          normalizedRow, 
          formatted,
          hasValue: !!formatted?.value 
        });
      }
      
      return formatted;
    }).filter(v => v && v.value); // Filter out null/undefined values
    
    // Cache results
    placeholderCache.set(cacheKey, values);
    
    log.info(`Fetched ${values.length} values for ${type} (from ${result.rows.length} rows)`);
    return values;
    
  } catch (error) {
    log.error(`Error fetching ${type} values`, { error: error.message });
    return [];
  }
}

/**
 * Pre-fetch all placeholder values for a schema
 * Call this when user connects to prime the cache
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {Set<string>} availableTables - Tables available in schema
 * @param {Function} executeQuery - Function to execute SQL
 * @returns {Promise<Object>} - Map of type -> values
 */
export async function prefetchAllPlaceholderValues(database, schema, availableTables, executeQuery) {
  const results = {};
  const tablesSet = new Set([...availableTables].map(t => t.toUpperCase()));
  
  // Determine which types we can fetch based on available tables
  const typesToFetch = [];
  for (const [type, config] of Object.entries(PLACEHOLDER_CONFIGS)) {
    if (!config.sourceTable || tablesSet.has(config.sourceTable.toUpperCase())) {
      typesToFetch.push(type);
    }
  }
  
  log.info(`Prefetching placeholder values for ${typesToFetch.length} types`);
  
  // Fetch in parallel with concurrency limit
  const BATCH_SIZE = 3;
  for (let i = 0; i < typesToFetch.length; i += BATCH_SIZE) {
    const batch = typesToFetch.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(type => fetchPlaceholderValues(type, database, schema, availableTables, executeQuery))
    );
    
    batch.forEach((type, idx) => {
      results[type] = batchResults[idx];
    });
  }
  
  return results;
}

// =============================================================================
// Suggestion Helpers
// =============================================================================

/**
 * Get suggestions for a placeholder in the query
 * @param {string} placeholder - The placeholder string (e.g., "{{domain}}")
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {Array} - Cached suggestions for this placeholder type
 */
export function getSuggestionsForPlaceholder(placeholder, database, schema) {
  const placeholderLower = placeholder.toLowerCase();
  
  // Find matching config
  for (const [type, config] of Object.entries(PLACEHOLDER_CONFIGS)) {
    if (config.patterns.some(p => p.toLowerCase() === placeholderLower || 
                                  placeholderLower.includes(type))) {
      const cacheKey = `${type}:${database}.${schema}`;
      const cached = placeholderCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }
  }
  
  return [];
}

/**
 * Get all cached placeholder values
 * @returns {Object} - Map of cacheKey -> values
 */
export function getAllCachedValues() {
  return placeholderCache.getAll();
}

/**
 * Clear the placeholder value cache
 */
export function clearPlaceholderCache() {
  placeholderCache.clear();
}

/**
 * Build a SQL query to insert a selected value
 * @param {string} originalSql - Original SQL with placeholder
 * @param {string} placeholder - The placeholder to replace
 * @param {string} value - The value to insert
 * @returns {string} - SQL with placeholder replaced
 */
export function replacePlaceholder(originalSql, placeholder, value) {
  // Escape the value for SQL safety
  const safeValue = value.replace(/'/g, "''");
  
  // Replace all instances of the placeholder
  const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  
  return originalSql.replace(regex, safeValue);
}

// =============================================================================
// Export
// =============================================================================

export default {
  PLACEHOLDER_CONFIGS,
  detectPlaceholdersWithTypes,
  fetchPlaceholderValues,
  prefetchAllPlaceholderValues,
  getSuggestionsForPlaceholder,
  getAllCachedValues,
  clearPlaceholderCache,
  replacePlaceholder
};

