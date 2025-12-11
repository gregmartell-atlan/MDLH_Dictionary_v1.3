/**
 * Snowflake Array/VARIANT Column Helpers
 * 
 * Provides utilities for building WHERE clauses and JOIN conditions
 * for Snowflake VARIANT columns.
 * 
 * CRITICAL: MDLH columns like INPUTS, OUTPUTS, ANCHOR, MEANINGS are VARIANT types
 * (containing JSON arrays), NOT native Snowflake ARRAY types.
 * 
 * The reliable patterns for VARIANT columns are:
 * - For arrays: ARRAY_TO_STRING(column, ',') ILIKE '%value%'
 * - For JSON objects with known fields: column:fieldName::STRING
 * 
 * NOTE: ::STRING cast fails on VARIANT arrays. Use ARRAY_TO_STRING instead.
 */

import { createLogger } from './logger';

const log = createLogger('SnowflakeArrayHelpers');

// =============================================================================
// GUID Detection
// =============================================================================

/**
 * GUID regex pattern - matches standard UUID format
 * e.g., "550e8400-e29b-41d4-a716-446655440000"
 */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a value looks like a GUID/UUID
 * @param {string} value - Value to check
 * @returns {boolean} - True if value matches GUID pattern
 */
export function isGuid(value) {
  if (!value || typeof value !== 'string') return false;
  return GUID_PATTERN.test(value.trim());
}

/**
 * Check if a value looks like a partial GUID (for fuzzy matching)
 * At least 8 hex characters with optional dashes
 */
export function isPartialGuid(value) {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.replace(/-/g, '');
  return /^[0-9a-f]{8,}$/i.test(cleaned);
}

// =============================================================================
// SQL Value Escaping
// =============================================================================

/**
 * Escape a string value for use in SQL single quotes
 * @param {string} value - Value to escape
 * @returns {string} - Escaped value (without surrounding quotes)
 */
export function escapeStringValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
}

/**
 * Quote an identifier (column/table name) for Snowflake
 * @param {string} identifier - Identifier to quote
 * @returns {string} - Quoted identifier
 */
export function quoteIdentifier(identifier) {
  if (!identifier) return '""';
  // Escape internal double quotes by doubling them
  const escaped = String(identifier).replace(/"/g, '""');
  return `"${escaped}"`;
}

// =============================================================================
// Array Search Clause Builders
// =============================================================================

/**
 * Build a WHERE clause for searching within a VARIANT/ARRAY column
 * 
 * Uses ::STRING cast with ILIKE for substring matching on VARIANT columns.
 * 
 * NOTE: MDLH columns are VARIANT types, not true ARRAY types.
 * The ::STRING cast works reliably on all VARIANT types.
 * 
 * @param {string} column - Column name (e.g., '"INPUTS"' or 'p."OUTPUTS"')
 * @param {string} searchValue - Value to search for
 * @param {Object} options - Options
 * @param {boolean} options.forceExact - Force exact match pattern (still uses ILIKE)
 * @param {boolean} options.forceFuzzy - Force fuzzy match (default behavior)
 * @returns {string} - SQL WHERE clause fragment
 * 
 * @example
 * // GUID search
 * buildArraySearchClause('"INPUTS"', '550e8400-e29b-41d4-a716-446655440000')
 * // => "\"INPUTS\"::STRING ILIKE '%550e8400-e29b-41d4-a716-446655440000%'"
 * 
 * @example
 * // Name - fuzzy match
 * buildArraySearchClause('"OWNERUSERS"', 'john.doe')
 * // => "\"OWNERUSERS\"::STRING ILIKE '%john.doe%'"
 */
export function buildArraySearchClause(column, searchValue, options = {}) {
  if (!column || !searchValue) {
    log.warn('buildArraySearchClause called with empty column or value', { column, searchValue });
    return 'FALSE';
  }
  
  const escaped = escapeStringValue(searchValue);
  
  // NOTE: For ARRAY/VARIANT columns, use LATERAL FLATTEN in the FROM clause
  // This function returns a simple ILIKE pattern for use with LATERAL FLATTEN
  // Example: FROM table t, LATERAL FLATTEN(INPUT => t.column) f WHERE f.value::VARCHAR ILIKE '%value%'
  return `f.value::VARCHAR ILIKE '%${escaped}%'`;
}

/**
 * Build a JOIN condition for matching a GUID in a VARIANT column
 * Useful for LEFT JOINs where you're matching GUIDs across tables
 * 
 * Uses ::STRING cast with ILIKE since MDLH columns are VARIANT, not native ARRAY
 * 
 * @param {string} variantColumn - VARIANT column (e.g., 't."ANCHOR"')
 * @param {string} guidColumn - GUID column to match against (e.g., 'g."GUID"')
 * @returns {string} - SQL JOIN condition
 * 
 * @example
 * buildArrayJoinCondition('t."ANCHOR"', 'g."GUID"')
 * // => "t.\"ANCHOR\"::STRING ILIKE '%' || g.\"GUID\" || '%'"
 */
export function buildArrayJoinCondition(variantColumn, guidColumn) {
  if (!variantColumn || !guidColumn) {
    log.warn('buildArrayJoinCondition called with empty columns', { variantColumn, guidColumn });
    return 'FALSE';
  }
  
  // VARIANT arrays can't be cast directly to STRING
  // Use ARRAY_TO_STRING for proper Snowflake compatibility
  return `ARRAY_TO_STRING(${variantColumn}, ',') ILIKE '%' || ${guidColumn} || '%'`;
}

/**
 * Build a WHERE clause for checking if a VARIANT column contains any of multiple values
 * 
 * @param {string} column - VARIANT column name
 * @param {string[]} values - Values to search for
 * @param {Object} options - Options
 * @param {string} options.operator - 'OR' or 'AND' (default: 'OR')
 * @returns {string} - SQL WHERE clause fragment
 * 
 * @example
 * buildArrayContainsAny('"INPUTS"', ['guid1', 'guid2', 'guid3'])
 * // => "(\"INPUTS\"::STRING ILIKE '%guid1%' OR \"INPUTS\"::STRING ILIKE '%guid2%' OR ...)"
 */
export function buildArrayContainsAny(column, values, options = {}) {
  const { operator = 'OR' } = options;
  
  if (!column || !values || values.length === 0) {
    return 'FALSE';
  }
  
  const clauses = values
    .filter(v => v != null && v !== '')
    .map(value => buildArraySearchClause(column, value, { forceExact: true }));
  
  if (clauses.length === 0) return 'FALSE';
  if (clauses.length === 1) return clauses[0];
  
  return `(${clauses.join(` ${operator} `)})`;
}

// =============================================================================
// Specialized Query Builders
// =============================================================================

/**
 * Build a lineage search clause for INPUTS/OUTPUTS columns
 * 
 * Uses ::STRING ILIKE for GUID match (INPUTS/OUTPUTS are VARIANT types).
 * 
 * @param {string} guid - Asset GUID to search for
 * @param {string} direction - 'UPSTREAM' or 'DOWNSTREAM'
 * @param {string} tableAlias - Optional table alias (e.g., 'p')
 * @returns {string} - SQL WHERE clause
 */
export function buildLineageSearchClause(guid, direction, tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  
  // For upstream: asset appears in OUTPUTS (it's produced by the process)
  // For downstream: asset appears in INPUTS (it's consumed by the process)
  const column = direction === 'UPSTREAM' 
    ? `${prefix}"OUTPUTS"` 
    : `${prefix}"INPUTS"`;
  
  // INPUTS/OUTPUTS are ARRAY columns
  return buildArraySearchClause(column, guid);
}

/**
 * Build a glossary term lookup clause
 * 
 * @param {string} termGuid - Term GUID
 * @param {string} column - Column containing term references (e.g., '"MEANINGS"')
 * @param {string} tableAlias - Optional table alias
 * @returns {string} - SQL WHERE clause
 */
export function buildTermLookupClause(termGuid, column = '"MEANINGS"', tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const fullColumn = `${prefix}${column}`;
  return buildArraySearchClause(fullColumn, termGuid);
}

/**
 * Build an anchor (glossary parent) join condition
 * 
 * @param {string} termTableAlias - Alias for term table (e.g., 't')
 * @param {string} glossaryTableAlias - Alias for glossary table (e.g., 'g')
 * @returns {string} - SQL JOIN condition
 */
export function buildAnchorJoinCondition(termTableAlias = 't', glossaryTableAlias = 'g') {
  return buildArrayJoinCondition(
    `${termTableAlias}."ANCHOR"`,
    `${glossaryTableAlias}."GUID"`
  );
}

/**
 * Build an owner lookup clause
 * 
 * @param {string} ownerUsername - Owner username to search for
 * @param {string} column - Column containing owner references
 * @param {string} tableAlias - Optional table alias
 * @returns {string} - SQL WHERE clause (always fuzzy for usernames)
 */
export function buildOwnerLookupClause(ownerUsername, column = '"OWNERUSERS"', tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const fullColumn = `${prefix}${column}`;
  // Always use fuzzy matching for usernames
  return buildArraySearchClause(fullColumn, ownerUsername, { forceFuzzy: true });
}

// =============================================================================
// Query Template Helpers
// =============================================================================

/**
 * Replace placeholder patterns in SQL with proper array search clauses
 * 
 * @param {string} sql - SQL template with placeholders
 * @param {Object} replacements - Map of placeholder to value
 * @returns {string} - SQL with replaced values
 * 
 * @example
 * replaceArrayPlaceholders(
 *   'WHERE {{INPUTS_CONTAINS:guid}} OR {{OUTPUTS_CONTAINS:guid}}',
 *   { guid: '550e8400-e29b-41d4-a716-446655440000' }
 * )
 */
export function replaceArrayPlaceholders(sql, replacements) {
  if (!sql || !replacements) return sql;
  
  let result = sql;
  
  // Pattern: {{ARRAY_COLUMN_CONTAINS:placeholder}}
  const containsPattern = /\{\{(\w+)_CONTAINS:(\w+)\}\}/g;
  result = result.replace(containsPattern, (match, column, placeholder) => {
    const value = replacements[placeholder];
    if (!value) return 'FALSE';
    return buildArraySearchClause(`"${column}"`, value);
  });
  
  return result;
}

// =============================================================================
// Export all helpers
// =============================================================================

export default {
  // Detection
  isGuid,
  isPartialGuid,
  
  // Escaping
  escapeStringValue,
  quoteIdentifier,
  
  // Core builders
  buildArraySearchClause,
  buildArrayJoinCondition,
  buildArrayContainsAny,
  
  // Specialized builders
  buildLineageSearchClause,
  buildTermLookupClause,
  buildAnchorJoinCondition,
  buildOwnerLookupClause,
  
  // Template helpers
  replaceArrayPlaceholders
};

