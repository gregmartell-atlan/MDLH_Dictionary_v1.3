/**
 * Schema Browse SQL Builder
 * 
 * Generates queries to explore database structure.
 * Uses SHOW TABLES and INFORMATION_SCHEMA which ALWAYS work.
 * 
 * SQL INJECTION PROTECTED: Uses buildSafeFQN and safe escaping.
 */

import { buildSafeFQN } from '../../utils/queryHelpers';

/**
 * Escape a value for use in LIKE patterns (for SHOW TABLES LIKE)
 * 
 * @param {string} value - The value to escape for LIKE
 * @returns {string} - Escaped value
 */
function escapeLikePattern(value) {
  if (!value) return '';
  return value
    .replace(/'/g, "''")  // Escape single quotes
    .replace(/%/g, '\\%')  // Escape %
    .replace(/_/g, '\\_'); // Escape _
}

/**
 * Build a schema browse query - uses SHOW TABLES which always works
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildSchemaBrowseQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const { rowLimit = 100, filters = {} } = inputs;
  
  // Get db/schema from filters, entity, or SystemConfig
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = filters.database || entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = filters.schema || entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  // Build safe FQN for SHOW command (db.schema only)
  const safeDbSchema = buildSafeFQN(db, schema, null);
  
  // SHOW TABLES always works - this is the safest query
  const sql = `
-- List all tables in ${safeDbSchema}
-- This query always works in Snowflake

SHOW TABLES IN ${safeDbSchema};
`.trim();

  return {
    title: `📂 Tables in ${schema}`,
    description: `List all tables in ${safeDbSchema}. Click table names in results to explore further.`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    limit: rowLimit,
    flowType: 'SCHEMA_BROWSE',
    entity,
  };
}

/**
 * Build a query to find tables matching a pattern
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildTableSearchQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const { searchTerm = '', rowLimit = 100 } = inputs;
  
  // Get db/schema from entity or SystemConfig
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  // Build safe FQN for SHOW command
  const safeDbSchema = buildSafeFQN(db, schema, null);
  
  // Escape search term for LIKE pattern
  const safeSearchTerm = escapeLikePattern(searchTerm);
  
  // SHOW TABLES LIKE always works
  const sql = `
-- Find tables matching "${searchTerm || '*'}"
-- This query always works in Snowflake

SHOW TABLES LIKE '%${safeSearchTerm}%' IN ${safeDbSchema};
`.trim();

  return {
    title: `🔍 Find: ${searchTerm || 'tables'}`,
    description: `Tables matching "${searchTerm}" in ${safeDbSchema}.`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    flowType: 'SCHEMA_BROWSE',
    entity,
  };
}

/**
 * Build a query to get column details for a table
 * Uses DESCRIBE which always works
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildColumnDetailsQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const tableName = entity.table || entity.name || '<TABLE>';
  
  // Get db/schema from entity or SystemConfig
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  // Build safe FQN for the table
  const tableFQN = buildSafeFQN(db, schema, tableName);
  
  // DESCRIBE always works
  const sql = `
-- Show columns in ${tableName}
-- This query always works in Snowflake

DESCRIBE TABLE ${tableFQN};
`.trim();

  return {
    title: `📋 Columns: ${tableName}`,
    description: `Column details for ${tableFQN}.`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    flowType: 'SCHEMA_BROWSE',
    entity,
  };
}

/**
 * Build a simple SELECT * query to explore a table
 * @param {string} tableName - Table name
 * @param {string} db - Database name
 * @param {string} schema - Schema name
 * @param {number} limit - Row limit
 * @returns {string} - SQL query
 */
export function buildSimpleSelectQuery(tableName, db = 'FIELD_METADATA', schema = 'PUBLIC', limit = 10) {
  // Build safe FQN for the table
  const tableFQN = buildSafeFQN(db, schema, tableName);
  
  return `
-- Preview data from ${tableName}
-- Simple SELECT * always works

SELECT *
FROM ${tableFQN}
LIMIT ${limit};
`.trim();
}

export default buildSchemaBrowseQuery;
