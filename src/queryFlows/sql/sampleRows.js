/**
 * Sample Rows SQL Builder
 * 
 * Generates queries to preview data from tables and views.
 * SQL INJECTION PROTECTED: Uses safe identifier escaping.
 */

import { buildSafeFQN } from '../../utils/queryHelpers';

/**
 * Build a sample rows query for the given entity
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildSampleRowsQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const { rowLimit = 100 } = inputs;
  
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || '<DATABASE>';
  const schema = entity.schema || queryDefaults.metadataSchema || '<SCHEMA>';
  const table = entity.table || entity.name || '<TABLE>';
  
  // Build fully qualified name using safe helper
  const fqn = buildSafeFQN(db, schema, table);
  
  // Validate we have a proper FQN (not placeholder)
  const hasMissingParts = !db || db.includes('<') || !schema || schema.includes('<') || !table || table.includes('<');
  
  const sql = `
-- Sample rows from ${fqn}
-- Limit: ${rowLimit} rows

SELECT *
FROM ${fqn}
LIMIT ${rowLimit};
`.trim();

  return {
    title: `👀 Sample: ${table}`,
    description: `Preview ${rowLimit} rows from ${fqn}.`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    limit: rowLimit,
    flowType: 'SAMPLE_ROWS',
    entity,
    requiresContext: hasMissingParts,
  };
}

/**
 * Build a query to get row count and basic stats
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildTableStatsQuery(entity, inputs, systemConfig = null) {
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || '<DATABASE>';
  const schema = entity.schema || queryDefaults.metadataSchema || '<SCHEMA>';
  const table = entity.table || entity.name || '<TABLE>';
  
  // Build fully qualified name using safe helper
  const fqn = buildSafeFQN(db, schema, table);

  const sql = `
-- Table statistics for ${fqn}

SELECT
    COUNT(*) AS total_rows,
    COUNT(*) - COUNT(DISTINCT *) AS duplicate_rows,
    '${table.replace(/'/g, "''")}' AS table_name
FROM ${fqn};
`.trim();

  return {
    title: `📈 Stats: ${table}`,
    description: `Row count and basic statistics for ${fqn}.`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 60,
    flowType: 'SAMPLE_ROWS',
    entity,
  };
}

export default buildSampleRowsQuery;
