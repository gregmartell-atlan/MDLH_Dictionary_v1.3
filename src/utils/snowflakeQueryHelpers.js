/**
 * Snowflake Query Helpers
 * 
 * Handles all the nuances of Snowflake querying:
 * - VARIANT vs VARCHAR column detection
 * - GUID vs FQN vs fuzzy matching
 * - Proper type casting
 * - Case sensitivity
 * 
 * CRITICAL RULES:
 * 1. MDLH columns are VARIANT types (JSON), NOT native Snowflake ARRAY types
 * 2. The only reliable pattern is: TO_VARCHAR(column) ILIKE '%value%'
 * 3. This casts the JSON to a string and does substring matching
 * 4. ARRAY_CONTAINS does NOT work on VARIANT - don't use it
 * 5. TO_JSON doesn't work on all VARIANT - don't use it
 */

import { createLogger } from './logger';

const log = createLogger('SnowflakeQueryHelpers');

// =============================================================================
// COLUMN TYPE REGISTRY
// Known column types from MDLH entity tables
// =============================================================================

/**
 * Registry of known ARRAY columns in MDLH entity tables
 * These MUST use ARRAY_CONTAINS or ARRAY_TO_STRING
 */
export const ARRAY_COLUMNS = new Set([
  // Process/Lineage
  'INPUTS',
  'OUTPUTS',
  
  // Classifications/Tags
  'CLASSIFICATIONS',
  'CLASSIFICATIONNAMES',
  'MEANINGS',        // Term GUIDs linked to assets
  
  // Glossary
  'ANCHOR',          // Glossary GUIDs (on terms)
  'CATEGORIES',      // Category GUIDs
  'TERMS',           // Term GUIDs
  
  // Owners/Users (some are arrays, some are comma-separated strings)
  'OWNERUSERS',      // Can be ARRAY or VARCHAR depending on entity
  'OWNERGROUPS',
  'ADMINUSERS',
  'ADMINGROUPS',
  'VIEWERUSERS',
  'VIEWERGROUPS',
  
  // Lineage connections
  'COLUMNS',         // Column GUIDs in process entities
  
  // Multi-value references
  'ASSIGNEDTERMS',
  'ASSIGNEDENTITIES',
]);

/**
 * Registry of VARCHAR columns that contain embedded GUIDs/lists
 * These use LIKE/ILIKE patterns, not ARRAY functions
 */
export const EMBEDDED_LIST_COLUMNS = new Set([
  // These are stored as comma-separated or JSON strings, NOT arrays
  'DOMAINGUIDS',           // May not exist in all schemas, but handle if present
  'DAAPOUTPUTPORTGUIDS',
  'DAAPINPUTPORTGUIDS',
  'SOURCEREADRECENTUSERLIST',
  'SOURCEREADTOPUSERLIST',
  'SOURCEQUERYCOMPUTECOSTLIST',
]);

/**
 * Columns that store qualified names (for FQN-based joins)
 */
export const QUALIFIED_NAME_COLUMNS = new Set([
  'QUALIFIEDNAME',
  'PARENTDOMAINQUALIFIEDNAME',
  'SUPERDOMAINQUALIFIEDNAME',
  'CONNECTIONQUALIFIEDNAME',
  'DBTQUALIFIEDNAME',
]);

// =============================================================================
// SEARCH VALUE CLASSIFICATION
// =============================================================================

/**
 * Detect what type of search value we're dealing with
 * @param {string} value - The search value
 * @returns {'guid' | 'fqn' | 'fuzzy'} The value type
 */
export function classifySearchValue(value) {
  if (!value) return 'fuzzy';
  
  const trimmed = value.trim();
  
  // GUID pattern: 8-4-4-4-12 hex characters
  const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (guidPattern.test(trimmed)) {
    return 'guid';
  }
  
  // FQN pattern: contains slashes or multiple dots (like default/snowflake/...)
  const fqnPattern = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_\/-]+$/;
  const dottedFqnPattern = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+/;
  if (fqnPattern.test(trimmed) || dottedFqnPattern.test(trimmed)) {
    return 'fqn';
  }
  
  return 'fuzzy';
}

/**
 * Detect if a column is an ARRAY type
 * @param {string} columnName - Column name (case-insensitive)
 * @returns {boolean}
 */
export function isArrayColumn(columnName) {
  return ARRAY_COLUMNS.has(columnName.toUpperCase());
}

/**
 * Detect if a column contains embedded lists (VARCHAR with GUIDs/values)
 * @param {string} columnName - Column name (case-insensitive)
 * @returns {boolean}
 */
export function isEmbeddedListColumn(columnName) {
  return EMBEDDED_LIST_COLUMNS.has(columnName.toUpperCase());
}

/**
 * Detect if a column is a qualified name column
 * @param {string} columnName - Column name (case-insensitive)
 * @returns {boolean}
 */
export function isQualifiedNameColumn(columnName) {
  return QUALIFIED_NAME_COLUMNS.has(columnName.toUpperCase());
}

/**
 * Detect column type based on column name
 * @param {string} columnName 
 * @returns {'array' | 'embedded_list' | 'varchar'}
 */
export function detectColumnType(columnName) {
  const upper = columnName.toUpperCase();
  if (ARRAY_COLUMNS.has(upper)) return 'array';
  if (EMBEDDED_LIST_COLUMNS.has(upper)) return 'embedded_list';
  return 'varchar';
}

// =============================================================================
// STRING UTILITIES
// =============================================================================

/**
 * Escape a string value for use in SQL (returns the escaped value WITHOUT quotes)
 * @param {string} value - The value to escape
 * @returns {string} Escaped string (without surrounding quotes)
 */
export function escapeStringValueRaw(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/'/g, "''");
}

/**
 * Escape a string value for use in SQL (returns quoted string)
 * @param {string} value - The value to escape
 * @returns {string} Escaped and quoted string
 */
export function escapeStringValue(value) {
  if (value === null || value === undefined) return 'NULL';
  const escaped = escapeStringValueRaw(value);
  return `'${escaped}'`;
}

/**
 * Quote an identifier (column/table name) for Snowflake
 * Always quotes to handle case sensitivity safely
 * @param {string} identifier - The identifier to quote
 * @returns {string} Quoted identifier
 */
export function quoteIdentifier(identifier) {
  if (!identifier) throw new Error('Identifier cannot be empty');
  
  // Remove existing quotes if present
  let clean = identifier;
  if (clean.startsWith('"') && clean.endsWith('"')) {
    clean = clean.slice(1, -1).replace(/""/g, '"');
  }
  
  // Escape internal double quotes
  const escaped = clean.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Build a fully qualified table name
 * @param {string} database 
 * @param {string} schema 
 * @param {string} table 
 * @returns {string} Quoted FQN like "DB"."SCHEMA"."TABLE"
 */
export function buildSafeFQN(database, schema, table) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

// =============================================================================
// QUERY CLAUSE BUILDERS
// =============================================================================

/**
 * Build a WHERE clause for searching within a column
 * Automatically selects the right strategy based on column type and value type
 * 
 * @param {string} columnName - The column to search (with optional table alias like "t.ANCHOR")
 * @param {string} searchValue - The value to search for
 * @param {Object} options - Additional options
 * @param {boolean} options.caseSensitive - Use case-sensitive matching (default: false)
 * @param {string} options.columnType - Override auto-detection: 'array' | 'varchar' | 'embedded_list'
 * @param {boolean} options.quoteColumn - Whether to quote the column name (default: true)
 * @returns {string} SQL WHERE clause fragment (without WHERE keyword)
 */
export function buildSearchClause(columnName, searchValue, options = {}) {
  const { caseSensitive = false, columnType = null, quoteColumn = true } = options;
  
  if (!columnName || !searchValue) {
    log.warn('buildSearchClause called with empty column or value', { columnName, searchValue });
    return 'FALSE';
  }
  
  // Escape the value (raw, without quotes - we'll add quotes as needed)
  const escapedValue = escapeStringValueRaw(searchValue);
  const valueType = classifySearchValue(searchValue);
  
  // Parse column name to extract base name (handle "t.ANCHOR" format)
  const columnParts = columnName.split('.');
  const baseColumnName = columnParts[columnParts.length - 1].replace(/"/g, '');
  
  // Build the full column reference
  let columnRef = columnName;
  if (quoteColumn && !columnName.includes('"')) {
    // If there's a table alias, quote just the column part
    if (columnParts.length > 1) {
      const alias = columnParts.slice(0, -1).join('.');
      columnRef = `${alias}.${quoteIdentifier(baseColumnName)}`;
    } else {
      columnRef = quoteIdentifier(baseColumnName);
    }
  }
  
  // Determine column type
  const colType = columnType || detectColumnType(baseColumnName);
  
  log.debug('buildSearchClause', { columnName, baseColumnName, colType, valueType, escapedValue });
  
  // VARIANT columns (MDLH "array" columns are actually VARIANT containing JSON)
  if (colType === 'array') {
    // Use TO_VARCHAR() to convert VARIANT to string for matching
    const like = caseSensitive ? 'LIKE' : 'ILIKE';
    return `${columnRef}::STRING ${like} '%${escapedValue}%'`;
  }
  
  // Embedded list columns (VARCHAR with comma-separated values)
  if (colType === 'embedded_list') {
    const like = caseSensitive ? 'LIKE' : 'ILIKE';
    return `${columnRef} ${like} '%${escapedValue}%'`;
  }
  
  // Regular VARCHAR columns
  if (valueType === 'guid') {
    // Exact match for GUIDs
    return `${columnRef} = '${escapedValue}'`;
  } else {
    // Fuzzy match
    const like = caseSensitive ? 'LIKE' : 'ILIKE';
    return `${columnRef} ${like} '%${escapedValue}%'`;
  }
}

/**
 * Build a JOIN clause for linking entities
 * 
 * @param {string} leftTable - Left table alias
 * @param {string} leftColumn - Left column name
 * @param {string} rightTable - Right table alias  
 * @param {string} rightColumn - Right column name
 * @param {Object} options - Additional options
 * @returns {string} SQL JOIN ON clause fragment (without ON keyword)
 */
export function buildJoinClause(leftTable, leftColumn, rightTable, rightColumn, options = {}) {
  const leftColType = detectColumnType(leftColumn);
  const rightColType = detectColumnType(rightColumn);
  
  const leftRef = `${leftTable}.${quoteIdentifier(leftColumn)}`;
  const rightRef = `${rightTable}.${quoteIdentifier(rightColumn)}`;
  
  log.debug('buildJoinClause', { leftColumn, leftColType, rightColumn, rightColType });
  
  // Both are simple VARCHAR - direct equality
  if (leftColType === 'varchar' && rightColType === 'varchar') {
    return `${leftRef} = ${rightRef}`;
  }
  
  // Left is VARIANT, right is scalar (GUID) - cast and use ILIKE
  if (leftColType === 'array' && rightColType === 'varchar') {
    return `${leftRef}::STRING ILIKE '%' || ${rightRef} || '%'`;
  }
  
  // Right is VARIANT, left is scalar (GUID) - cast and use ILIKE
  if (leftColType === 'varchar' && rightColType === 'array') {
    return `${rightRef}::STRING ILIKE '%' || ${leftRef} || '%'`;
  }
  
  // Both VARIANT - cast both and do substring match (rare case)
  if (leftColType === 'array' && rightColType === 'array') {
    return `${leftRef}::STRING ILIKE '%' || ${rightRef}::VARCHAR || '%'`;
  }
  
  // Embedded list (VARCHAR with GUIDs) - use ILIKE
  if (leftColType === 'embedded_list' || rightColType === 'embedded_list') {
    return `${leftRef} ILIKE '%' || ${rightRef} || '%'`;
  }
  
  // Default to equality
  return `${leftRef} = ${rightRef}`;
}

// =============================================================================
// QUERY TRANSFORMATIONS
// =============================================================================

/**
 * Transform a query that uses incorrect patterns for VARIANT columns
 * Fixes ARRAY_CONTAINS, TO_JSON, and ARRAY_TO_STRING to use TO_VARCHAR() ILIKE
 * 
 * @param {string} sql - The SQL query to transform
 * @returns {string} Transformed SQL
 */
export function fixArrayPatterns(sql) {
  let fixed = sql;
  
  // Fix TO_JSON - replace with TO_VARCHAR() (proper Snowflake function for VARIANT)
  // Pattern: TO_JSON(column) ILIKE '%value%'
  fixed = fixed.replace(
    /TO_JSON\(([^)]+)\)\s+(I?LIKE)\s+'%([^']+)%'/gi,
    (match, column, like, value) => {
      return `${column}::STRING ${like} '%${value}%'`;
    }
  );
  
  // Fix ARRAY_TO_STRING - replace with TO_VARCHAR()
  // Pattern: ARRAY_TO_STRING(column, '||') ILIKE '%value%'
  fixed = fixed.replace(
    /ARRAY_TO_STRING\(([^,]+),\s*'[^']*'\)\s+(I?LIKE)\s+'%([^']+)%'/gi,
    (match, column, like, value) => {
      return `${column}::STRING ${like} '%${value}%'`;
    }
  );
  
  // Fix ARRAY_CONTAINS - replace with TO_VARCHAR() ILIKE
  // Pattern: ARRAY_CONTAINS('value'::VARIANT, column)
  fixed = fixed.replace(
    /ARRAY_CONTAINS\('([^']+)'::VARIANT,\s*([^)]+)\)/gi,
    (match, value, column) => {
      return `${column}::STRING ILIKE '%${value}%'`;
    }
  );
  
  // Fix ::VARCHAR cast - replace with TO_VARCHAR()
  // Pattern: column::VARCHAR ILIKE '%value%'
  fixed = fixed.replace(
    /(\w+(?:\.\w+)?(?:\."?\w+"?)?)::VARCHAR\s+(I?LIKE)\s+'%([^']+)%'/gi,
    (match, column, like, value) => {
      return `${column}::STRING ${like} '%${value}%'`;
    }
  );
  
  return fixed;
}

/**
 * Validate a placeholder value based on expected type
 * @param {string} placeholder - The placeholder name (e.g., 'GUID', 'domain')
 * @param {string} value - The value to validate
 * @returns {{ valid: boolean, error?: string, suggestion?: string }}
 */
export function validatePlaceholderValue(placeholder, value) {
  const upper = placeholder.toUpperCase();
  
  if (upper.includes('GUID')) {
    const type = classifySearchValue(value);
    if (type !== 'guid') {
      return {
        valid: false,
        error: `Expected a GUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)`,
        suggestion: 'Use a valid UUID format'
      };
    }
  }
  
  if (upper.includes('FQN') || upper.includes('QUALIFIEDNAME')) {
    if (!value.includes('/') && !value.includes('.')) {
      return {
        valid: false,
        error: `Expected a qualified name (e.g., default/snowflake/db/schema/table)`,
        suggestion: 'Include the full path with / or . separators'
      };
    }
  }
  
  return { valid: true };
}

// =============================================================================
// DATA PRODUCT / DOMAIN SPECIFIC HELPERS
// =============================================================================

/**
 * Build correct join between DATAPRODUCT_ENTITY and DATADOMAIN_ENTITY
 * Note: DOMAINGUIDS column may not exist - use PARENTDOMAINQUALIFIEDNAME if available
 * 
 * @param {string} productAlias - Alias for DATAPRODUCT_ENTITY (e.g., 'dp')
 * @param {string} domainAlias - Alias for DATADOMAIN_ENTITY (e.g., 'dd')
 * @param {Object} options - Options
 * @param {boolean} options.useQualifiedName - Use QUALIFIEDNAME join instead of GUID (default: true)
 * @returns {string} SQL JOIN ON clause
 */
export function buildDataProductDomainJoin(productAlias = 'dp', domainAlias = 'dd', options = {}) {
  const { useQualifiedName = true } = options;
  
  if (useQualifiedName) {
    // Join on qualified name - domains have QUALIFIEDNAME, products have PARENTDOMAINQUALIFIEDNAME
    return `${domainAlias}."QUALIFIEDNAME" = ${productAlias}."PARENTDOMAINQUALIFIEDNAME"`;
  }
  
  // Fallback: Try DOMAINGUIDS if it exists (it's a VARCHAR, use ILIKE)
  return `${productAlias}."DOMAINGUIDS" ILIKE '%' || ${domainAlias}."GUID" || '%'`;
}

/**
 * Build correct join between ATLASGLOSSARYTERM_ENTITY and ATLASGLOSSARY_ENTITY
 * Uses TO_VARCHAR() ILIKE since ANCHOR is a VARIANT
 * 
 * @param {string} termAlias - Alias for term entity (e.g., 'gt')
 * @param {string} glossaryAlias - Alias for glossary entity (e.g., 'g')
 * @returns {string} SQL JOIN ON clause
 */
export function buildGlossaryTermJoin(termAlias = 'gt', glossaryAlias = 'g') {
  return `${termAlias}."ANCHOR":guid::STRING ILIKE '%' || ${glossaryAlias}."GUID" || '%'`;
}

/**
 * Build correct join between entity and PROCESS_ENTITY for lineage
 * 
 * @param {string} entityAlias - Alias for the entity table
 * @param {string} processAlias - Alias for PROCESS_ENTITY
 * @param {'upstream' | 'downstream'} direction - Lineage direction
 * @returns {string} SQL JOIN ON clause
 */
export function buildLineageJoin(entityAlias, processAlias, direction) {
  if (direction === 'upstream') {
    // Entity is in OUTPUTS of the process (process feeds into entity)
    return `${processAlias}."OUTPUTS"::STRING ILIKE '%' || ${entityAlias}."GUID" || '%'`;
  } else {
    // Entity is in INPUTS of the process (entity feeds into process)
    return `${processAlias}."INPUTS"::STRING ILIKE '%' || ${entityAlias}."GUID" || '%'`;
  }
}

/**
 * Build a search clause for finding assets by term (MEANINGS column)
 * 
 * @param {string} termGuid - The term GUID to search for
 * @param {string} tableAlias - Table alias (e.g., 't')
 * @returns {string} SQL WHERE clause
 */
export function buildTermSearchClause(termGuid, tableAlias = '') {
  const columnRef = tableAlias ? `${tableAlias}."MEANINGS"` : '"MEANINGS"';
  return `${columnRef}::STRING ILIKE '%${escapeStringValueRaw(termGuid)}%'`;
}

/**
 * Build a search clause for finding assets by owner
 * OWNERUSERS is a VARIANT column
 * 
 * @param {string} username - The username to search for
 * @param {string} tableAlias - Table alias (e.g., 't')
 * @returns {string} SQL WHERE clause
 */
export function buildOwnerSearchClause(username, tableAlias = '') {
  const columnRef = tableAlias ? `${tableAlias}."OWNERUSERS"` : '"OWNERUSERS"';
  const escaped = escapeStringValueRaw(username);
  return `${columnRef}::STRING ILIKE '%${escaped}%'`;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Classification
  classifySearchValue,
  isArrayColumn,
  isEmbeddedListColumn,
  isQualifiedNameColumn,
  detectColumnType,
  
  // Clause builders
  buildSearchClause,
  buildJoinClause,
  
  // String utilities
  escapeStringValue,
  escapeStringValueRaw,
  quoteIdentifier,
  buildSafeFQN,
  
  // Transformations
  fixArrayPatterns,
  validatePlaceholderValue,
  
  // Entity-specific helpers
  buildDataProductDomainJoin,
  buildGlossaryTermJoin,
  buildLineageJoin,
  buildTermSearchClause,
  buildOwnerSearchClause,
  
  // Registries (for external use)
  ARRAY_COLUMNS,
  EMBEDDED_LIST_COLUMNS,
  QUALIFIED_NAME_COLUMNS,
};


