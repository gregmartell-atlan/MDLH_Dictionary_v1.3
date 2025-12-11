/**
 * Discovery Queries
 * 
 * Schema-agnostic query builders for discovering tables and columns.
 * Implements the discovery-first pattern from the MDLH Query Patterns spec.
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Entity type patterns for categorization
 */
const ENTITY_TYPE_PATTERNS = {
  lineage: ['PROCESS', 'BIPROCESS', 'DBTPROCESS', 'COLUMNPROCESS', 'PROCESSEXECUTION', 'AIRFLOWDAG', 'SPARKJOB'],
  assets: ['TABLE', 'VIEW', 'COLUMN', 'SCHEMA', 'DATABASE', 'MATERIALIZED_VIEW', 'EXTERNAL_TABLE'],
  quality: ['METRIC', 'QUALITYRULE', 'DATAQUALITY', 'DQ'],
  governance: ['GLOSSARY', 'TERM', 'POLICY', 'PURPOSE', 'CLASSIFICATION', 'TAG'],
  bi: ['DASHBOARD', 'REPORT', 'CHART', 'LOOKER', 'TABLEAU', 'POWERBI', 'METABASE'],
};

/**
 * Regex for valid SQL identifiers
 */
const VALID_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Max identifier length (Snowflake limit)
 */
const MAX_IDENTIFIER_LENGTH = 255;

// =============================================================================
// Table Discovery
// =============================================================================

/**
 * Build a query to discover entity tables with row counts
 * 
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {string} tablePattern - Pattern for LIKE clause (default: '%_ENTITY')
 * @returns {string} SQL query
 */
export function buildTableDiscoveryQuery(database, schema, tablePattern = '%_ENTITY') {
  const safeSchema = escapeStringLiteral(schema);
  const safePattern = escapeStringLiteral(tablePattern);
  
  return `
SELECT 
  table_name,
  row_count,
  bytes,
  created,
  last_altered
FROM ${database}.information_schema.tables
WHERE table_schema = ${safeSchema}
  AND table_name LIKE ${safePattern}
  AND table_type = 'BASE TABLE'
ORDER BY row_count DESC NULLS LAST;
`.trim();
}

/**
 * Build a query to discover columns for a specific table
 * 
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {string} tableName - Table name (must be validated)
 * @returns {string} SQL query
 * @throws {Error} If table name is invalid
 */
export function buildColumnDiscoveryQuery(database, schema, tableName) {
  // Validate table name for SQL injection
  if (!isValidIdentifier(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  
  const safeSchema = escapeStringLiteral(schema);
  const safeTable = escapeStringLiteral(tableName.toUpperCase());
  
  return `
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default,
  ordinal_position,
  character_maximum_length,
  numeric_precision,
  numeric_scale
FROM ${database}.information_schema.columns
WHERE table_schema = ${safeSchema}
  AND table_name = ${safeTable}
ORDER BY ordinal_position;
`.trim();
}

// =============================================================================
// Entity Type Registry
// =============================================================================

/**
 * Build an entity type registry from discovered tables
 * Categorizes tables by their entity type (lineage, assets, governance, etc.)
 * 
 * @param {string[]} discoveredTables - Array of table names
 * @returns {Object} Registry with categories as keys and table arrays as values
 */
export function buildEntityTypeRegistry(discoveredTables) {
  const registry = {
    lineage: [],
    assets: [],
    quality: [],
    governance: [],
    bi: [],
    other: [],
  };
  
  if (!discoveredTables || discoveredTables.length === 0) {
    return registry;
  }
  
  for (const table of discoveredTables) {
    const upperTable = table.toUpperCase();
    const baseName = upperTable.replace('_ENTITY', '');
    let categorized = false;
    
    for (const [category, patterns] of Object.entries(ENTITY_TYPE_PATTERNS)) {
      if (patterns.some(pattern => baseName.includes(pattern))) {
        registry[category].push(table);
        categorized = true;
        break;
      }
    }
    
    if (!categorized) {
      registry.other.push(table);
    }
  }
  
  return registry;
}

// =============================================================================
// Table Selection
// =============================================================================

/**
 * Select the best table from a list based on row count and optional category preference
 * 
 * @param {Array<{name: string, row_count: number}>} tables - Tables with row counts
 * @param {Object} options - Selection options
 * @param {string} options.preferCategory - Preferred category (lineage, assets, etc.)
 * @returns {{name: string, row_count: number}|null} Best table or null if none available
 */
export function selectBestTable(tables, options = {}) {
  if (!tables || tables.length === 0) {
    return null;
  }
  
  // Filter out empty tables
  const nonEmptyTables = tables.filter(t => t.row_count > 0);
  
  if (nonEmptyTables.length === 0) {
    return null;
  }
  
  // If we have a category preference, try to find a table in that category
  if (options.preferCategory) {
    const patterns = ENTITY_TYPE_PATTERNS[options.preferCategory] || [];
    const categoryTables = nonEmptyTables.filter(t => {
      const baseName = t.name.toUpperCase().replace('_ENTITY', '');
      return patterns.some(p => baseName.includes(p));
    });
    
    if (categoryTables.length > 0) {
      // Return the one with highest row count in the preferred category
      return categoryTables.reduce((best, current) => 
        current.row_count > best.row_count ? current : best
      );
    }
  }
  
  // Default: return table with highest row count
  return nonEmptyTables.reduce((best, current) => 
    current.row_count > best.row_count ? current : best
  );
}

// =============================================================================
// Identifier Validation & Quoting
// =============================================================================

/**
 * Check if a string is a valid SQL identifier
 * 
 * @param {string} identifier - The identifier to check
 * @returns {boolean}
 */
function isValidIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return false;
  }
  
  // Check for null bytes
  if (identifier.includes('\0')) {
    return false;
  }
  
  // Check length
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    return false;
  }
  
  return VALID_IDENTIFIER_REGEX.test(identifier);
}

/**
 * Validate and quote an identifier for safe use in SQL
 * 
 * @param {string} identifier - The identifier to validate and quote
 * @returns {string} Quoted identifier
 * @throws {Error} If identifier is invalid or dangerous
 */
export function validateAndQuoteIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error('Identifier must be a non-empty string');
  }
  
  // Check for null bytes (injection attempt)
  if (identifier.includes('\0')) {
    throw new Error('Identifier cannot contain null bytes');
  }
  
  // Check length
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    throw new Error(`Identifier exceeds maximum length of ${MAX_IDENTIFIER_LENGTH} characters`);
  }
  
  // Check for SQL injection patterns
  const dangerousPatterns = [';', '--', '/*', '*/', 'DROP', 'DELETE', 'TRUNCATE', 'INSERT', 'UPDATE'];
  const upperIdentifier = identifier.toUpperCase();
  
  for (const pattern of dangerousPatterns) {
    if (upperIdentifier.includes(pattern)) {
      throw new Error(`Identifier contains dangerous pattern: ${pattern}`);
    }
  }
  
  // Escape internal double quotes and wrap in double quotes
  const escaped = identifier.toUpperCase().replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Build a safe fully-qualified table reference
 * 
 * @param {string|null} database - Database name (optional)
 * @param {string|null} schema - Schema name (optional)
 * @param {string} table - Table name (required)
 * @param {Set<string>} allowlist - Optional allowlist of valid table names
 * @returns {string} Safely quoted FQN
 * @throws {Error} If table is missing or not in allowlist
 */
export function buildSafeTableReference(database, schema, table, allowlist = null) {
  if (!table) {
    throw new Error('Table name is required');
  }
  
  // Validate against allowlist if provided
  if (allowlist && !allowlist.has(table.toUpperCase())) {
    throw new Error(`Table '${table}' not found in allowlist`);
  }
  
  const parts = [];
  
  if (database) {
    parts.push(validateAndQuoteIdentifier(database));
  }
  
  if (schema) {
    parts.push(validateAndQuoteIdentifier(schema));
  }
  
  parts.push(validateAndQuoteIdentifier(table));
  
  return parts.join('.');
}

// =============================================================================
// String Escaping
// =============================================================================

/**
 * Escape a string literal for SQL (single quotes)
 * 
 * @param {string} value - The value to escape
 * @returns {string} Escaped string with surrounding quotes
 */
function escapeStringLiteral(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  
  const str = String(value);
  
  // Check for null bytes
  if (str.includes('\0')) {
    throw new Error('String literal cannot contain null bytes');
  }
  
  // Escape single quotes by doubling them
  const escaped = str.replace(/'/g, "''");
  return `'${escaped}'`;
}

// =============================================================================
// Exports
// =============================================================================

export default {
  buildTableDiscoveryQuery,
  buildColumnDiscoveryQuery,
  buildEntityTypeRegistry,
  selectBestTable,
  validateAndQuoteIdentifier,
  buildSafeTableReference,
};


