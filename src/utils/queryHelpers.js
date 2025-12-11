/**
 * Query Helper Utilities
 * 
 * Functions for query validation, pre-validation, smart query generation,
 * and SQL injection protection.
 */

import { extractTableFromQuery, fixQueryForAvailableTables } from './tableDiscovery';

// =============================================================================
// SQL Injection Protection
// =============================================================================

/**
 * Regex for valid SQL identifiers (tables, columns, databases, schemas)
 * Matches: alphanumeric, underscores, starts with letter or underscore
 */
const VALID_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Check if a string is a valid SQL identifier
 * @param {string} identifier - The identifier to validate
 * @returns {boolean}
 */
export function isValidIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') return false;
  return VALID_IDENTIFIER_REGEX.test(identifier);
}

/**
 * Escape a SQL identifier by double-quoting and escaping internal quotes
 * This prevents SQL injection in table/column names
 * 
 * @param {string} identifier - The identifier to escape
 * @returns {string} - Safely escaped identifier
 * @throws {Error} - If identifier contains null bytes or is too long
 */
export function escapeIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Identifier must be a non-empty string');
  }
  
  // Check for null bytes (injection attempt)
  if (identifier.includes('\0')) {
    throw new Error('Identifier cannot contain null bytes');
  }
  
  // Check length (Snowflake limit is 255)
  if (identifier.length > 255) {
    throw new Error('Identifier exceeds maximum length of 255 characters');
  }
  
  // Double any internal double quotes and wrap in double quotes
  const escaped = identifier.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Escape a SQL string value (for use in WHERE clauses, etc.)
 * Uses single quotes and escapes internal single quotes
 * 
 * @param {string} value - The value to escape
 * @returns {string} - Safely escaped string value
 */
export function escapeStringValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  
  if (typeof value !== 'string') {
    value = String(value);
  }
  
  // Check for null bytes
  if (value.includes('\0')) {
    throw new Error('String value cannot contain null bytes');
  }
  
  // Escape single quotes by doubling them
  const escaped = value.replace(/'/g, "''");
  return `'${escaped}'`;
}

/**
 * Safely build a fully qualified table name
 * 
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {string} table - Table name
 * @returns {string} - Safely escaped FQN
 */
export function buildSafeFQN(database, schema, table) {
  const parts = [];
  
  if (database) {
    parts.push(isValidIdentifier(database) ? database : escapeIdentifier(database));
  }
  if (schema) {
    parts.push(isValidIdentifier(schema) ? schema : escapeIdentifier(schema));
  }
  if (table) {
    parts.push(isValidIdentifier(table) ? table : escapeIdentifier(table));
  }
  
  return parts.join('.');
}

/**
 * Sanitize an identifier, removing or escaping dangerous characters
 * For use when you want to clean user input rather than reject it
 * 
 * @param {string} identifier - The identifier to sanitize
 * @returns {string} - Sanitized identifier (may be empty if all chars invalid)
 */
export function sanitizeIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') return '';
  
  // Remove null bytes
  let sanitized = identifier.replace(/\0/g, '');
  
  // Remove or replace dangerous characters
  sanitized = sanitized.replace(/[^\w]/g, '_');
  
  // Ensure starts with letter or underscore
  if (!/^[A-Za-z_]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  
  // Truncate to max length
  return sanitized.substring(0, 255);
}

/**
 * Validate that an entity object has safe identifiers
 * 
 * @param {Object} entity - Entity with database, schema, table, guid, etc.
 * @returns {{valid: boolean, issues: string[]}}
 */
export function validateEntityIdentifiers(entity) {
  const issues = [];
  
  if (!entity || typeof entity !== 'object') {
    return { valid: false, issues: ['Entity must be an object'] };
  }
  
  const fieldsToCheck = ['database', 'schema', 'table', 'name', 'column'];
  
  for (const field of fieldsToCheck) {
    const value = entity[field];
    if (value && typeof value === 'string') {
      if (value.includes('\0')) {
        issues.push(`${field} contains null byte (possible injection)`);
      } else if (value.length > 255) {
        issues.push(`${field} exceeds 255 character limit`);
      }
    }
  }
  
  // GUIDs should be alphanumeric with hyphens
  if (entity.guid && typeof entity.guid === 'string') {
    if (!/^[a-fA-F0-9-]+$/.test(entity.guid)) {
      issues.push('guid contains invalid characters');
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Pre-validate all queries and return a validation map
 * @param {Object} allQueries - Object with category keys and query arrays
 * @param {Set<string>} discoveredTables - Set of discovered table names
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {Map} Map of queryId -> validation result
 */
export function preValidateAllQueries(allQueries, discoveredTables, database, schema) {
  const validationMap = new Map();
  
  Object.entries(allQueries).forEach(([category, queries]) => {
    queries.forEach((q, index) => {
      const queryId = `${category}-${index}`;
      const tableName = extractTableFromQuery(q.query);
      
      if (!tableName) {
        validationMap.set(queryId, { valid: null, tableName: null });
        return;
      }
      
      const tableExists = discoveredTables.has(tableName.toUpperCase());
      
      if (tableExists) {
        validationMap.set(queryId, { 
          valid: true, 
          tableName,
          originalQuery: q.query
        });
      } else {
        // Try to fix the query
        const fixed = fixQueryForAvailableTables(q.query, discoveredTables, database, schema);
        
        if (fixed.fixed) {
          validationMap.set(queryId, {
            valid: true,
            tableName: fixed.changes[0]?.to,
            originalQuery: q.query,
            fixedQuery: fixed.sql,
            changes: fixed.changes,
            autoFixed: true
          });
        } else {
          validationMap.set(queryId, {
            valid: false,
            tableName,
            originalQuery: q.query,
            error: `Table ${tableName} not found in ${database}.${schema}`
          });
        }
      }
    });
  });
  
  return validationMap;
}

/**
 * Sort queries with validated ones first, unavailable last
 * @param {Array} queries - Array of query objects
 * @param {Function} getAvailability - Function to check table availability
 * @returns {Array} Sorted queries
 */
export function sortQueriesByAvailability(queries, getAvailability) {
  return [...queries].sort((a, b) => {
    const availA = getAvailability(a.query);
    const availB = getAvailability(b.query);
    
    // Validated first (true), then unknown (null), then unavailable (false)
    if (availA === true && availB !== true) return -1;
    if (availB === true && availA !== true) return 1;
    if (availA === false && availB !== false) return 1;
    if (availB === false && availA !== false) return -1;
    return 0;
  });
}

/**
 * Generate query suggestions based on entity data and available tables
 * @param {string} entityType - Entity type name
 * @param {string} tableName - Table name
 * @param {Set<string>} discoveredTables - Available tables
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @returns {Array<{title: string, query: string}>}
 */
export function generateQuerySuggestions(entityType, tableName, discoveredTables, database, schema) {
  const suggestions = [];
  
  if (!tableName || tableName === '(abstract)' || !discoveredTables.has(tableName.toUpperCase())) {
    return suggestions;
  }
  
  const fullTableRef = `${database}.${schema}.${tableName}`;
  
  // Basic count query
  suggestions.push({
    title: `Count ${entityType} records`,
    query: `SELECT COUNT(*) AS total_count FROM ${fullTableRef};`
  });
  
  // Sample rows
  suggestions.push({
    title: `Sample ${entityType} data`,
    query: `SELECT * FROM ${fullTableRef} LIMIT 10;`
  });
  
  // Recent records (if table has timestamp columns)
  suggestions.push({
    title: `Recently updated ${entityType}`,
    query: `SELECT NAME, GUID, TO_TIMESTAMP(UPDATETIME/1000) AS updated_at
FROM ${fullTableRef}
WHERE UPDATETIME IS NOT NULL
ORDER BY UPDATETIME DESC
LIMIT 20;`
  });
  
  return suggestions;
}

/**
 * Parse SQL to extract all table references
 * @param {string} sql - SQL query
 * @returns {Array<string>} Array of table names
 */
export function extractAllTablesFromQuery(sql) {
  if (!sql) return [];
  
  const tables = [];
  const patterns = [
    /FROM\s+(?:[\w.]+\.)?(\w+)/gi,
    /JOIN\s+(?:[\w.]+\.)?(\w+)/gi,
    /INTO\s+(?:[\w.]+\.)?(\w+)/gi,
    /UPDATE\s+(?:[\w.]+\.)?(\w+)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      const tableName = match[1].toUpperCase();
      if (!tables.includes(tableName)) {
        tables.push(tableName);
      }
    }
  }
  
  return tables;
}

/**
 * Check if a query is read-only (SELECT/SHOW/DESCRIBE)
 * @param {string} sql - SQL query
 * @returns {boolean}
 */
export function isReadOnlyQuery(sql) {
  if (!sql) return true;
  
  const trimmed = sql.trim().toUpperCase();
  const readOnlyPrefixes = ['SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'WITH'];
  
  return readOnlyPrefixes.some(prefix => trimmed.startsWith(prefix));
}

/**
 * Add LIMIT clause if not present (for safety)
 * @param {string} sql - SQL query
 * @param {number} limit - Default limit (default: 1000)
 * @returns {string}
 */
export function ensureQueryLimit(sql, limit = 1000) {
  if (!sql) return sql;
  
  const trimmed = sql.trim();
  
  // Only add limit to SELECT statements without existing LIMIT
  if (!trimmed.toUpperCase().startsWith('SELECT')) return sql;
  if (/LIMIT\s+\d+/i.test(trimmed)) return sql;
  
  // Remove trailing semicolon, add LIMIT, add semicolon back
  const withoutSemicolon = trimmed.replace(/;\s*$/, '');
  return `${withoutSemicolon} LIMIT ${limit};`;
}

/**
 * Format SQL for display (basic formatting)
 * @param {string} sql - SQL query
 * @returns {string}
 */
export function formatSQL(sql) {
  if (!sql) return '';
  
  // Basic keyword capitalization
  const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 
    'ON', 'AND', 'OR', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'HAVING', 'UNION', 'ALL',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP',
    'TABLE', 'VIEW', 'INDEX', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];
  
  let formatted = sql;
  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    formatted = formatted.replace(regex, keyword);
  });
  
  return formatted;
}

export default {
  // Query validation
  preValidateAllQueries,
  sortQueriesByAvailability,
  generateQuerySuggestions,
  extractAllTablesFromQuery,
  isReadOnlyQuery,
  ensureQueryLimit,
  formatSQL,
  // SQL injection protection
  isValidIdentifier,
  escapeIdentifier,
  escapeStringValue,
  buildSafeFQN,
  sanitizeIdentifier,
  validateEntityIdentifiers,
};

