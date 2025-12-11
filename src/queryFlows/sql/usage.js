/**
 * Usage SQL Builder
 * 
 * Generates queries to find how assets are being used.
 * 
 * SQL INJECTION PROTECTED: Uses buildSafeFQN and escapeStringValue.
 */

import { buildSafeFQN, escapeStringValue, sanitizeIdentifier } from '../../utils/queryHelpers';

/**
 * Escape a value for use in LIKE/ILIKE patterns
 * This is different from escapeStringValue because LIKE has special chars (%, _)
 * 
 * @param {string} value - The value to escape for LIKE
 * @returns {string} - Escaped value (without surrounding quotes)
 */
function escapeLikePattern(value) {
  if (!value) return '';
  // Escape special LIKE characters and SQL single quotes
  return value
    .replace(/'/g, "''")  // Escape single quotes for SQL
    .replace(/%/g, '\\%')  // Escape % for LIKE
    .replace(/_/g, '\\_'); // Escape _ for LIKE
}

/**
 * Build a usage query for the given entity
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildUsageQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const { daysBack = 30, rowLimit = 500 } = inputs;
  const rawAssetName = entity.name || entity.qualifiedName || entity.guid || '<ASSET_NAME>';
  
  // Escape asset name for use in LIKE patterns
  const safeAssetPattern = escapeLikePattern(rawAssetName);
  
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  // Build safe FQN for the history table
  const historyTableFQN = buildSafeFQN(db, schema, 'QUERY_HISTORY_ENTITY');
  
  // Check if we have usage-related tables
  const tables = (availableTables || []).map(t => t.toUpperCase());
  const hasQueryHistory = tables.some(t => t.includes('QUERY') && t.includes('HISTORY'));
  
  let sql;
  
  if (hasQueryHistory) {
    // Use MDLH query history if available
    sql = `
-- Usage: queries referencing "${rawAssetName}" in last ${daysBack} days

SELECT
    query_id,
    start_time,
    user_name,
    LEFT(query_text, 500) AS query_preview,
    rows_scanned,
    rows_returned,
    execution_time_ms
FROM ${historyTableFQN}
WHERE start_time >= DATEADD('day', -${daysBack}, CURRENT_TIMESTAMP())
  AND query_text ILIKE '%${safeAssetPattern}%'
ORDER BY start_time DESC
LIMIT ${rowLimit};
`.trim();
  } else {
    // Fallback: use Snowflake's ACCOUNT_USAGE if accessible
    sql = `
-- Usage: queries referencing "${rawAssetName}" in last ${daysBack} days
-- Note: Requires access to SNOWFLAKE.ACCOUNT_USAGE

SELECT
    query_id,
    start_time,
    user_name,
    LEFT(query_text, 500) AS query_preview,
    rows_produced,
    total_elapsed_time / 1000 AS execution_time_ms
FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
WHERE start_time >= DATEADD('day', -${daysBack}, CURRENT_TIMESTAMP())
  AND query_text ILIKE '%${safeAssetPattern}%'
ORDER BY start_time DESC
LIMIT ${rowLimit};
`.trim();
  }

  return {
    title: `📊 Usage: ${rawAssetName}`,
    description: `Queries that reference ${rawAssetName} in the last ${daysBack} days.`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 60,
    limit: rowLimit,
    flowType: 'USAGE',
    entity,
  };
}

/**
 * Build a query to find popular assets
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildPopularityQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const { rowLimit = 100 } = inputs;
  
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  // Build safe FQN for the table
  const tableEntityFQN = buildSafeFQN(db, schema, 'TABLE_ENTITY');
  
  const tables = (availableTables || []).map(t => t.toUpperCase());
  const hasTableEntity = tables.includes('TABLE_ENTITY');
  
  if (!hasTableEntity) {
    // Build safe FQN for SHOW command
    const safeDbSchema = buildSafeFQN(db, schema, null);
    
    return {
      title: '🔥 Popular Assets',
      description: 'TABLE_ENTITY not found in schema.',
      sql: `-- TABLE_ENTITY not available\nSHOW TABLES IN ${safeDbSchema};`,
      flowType: 'USAGE',
      entity,
    };
  }

  const sql = `
-- Popular tables by query count and popularity score

SELECT
    name,
    typename,
    guid,
    querycount AS query_count,
    queryusercount AS unique_users,
    popularityscore AS popularity_score,
    databasename,
    schemaname
FROM ${tableEntityFQN}
WHERE querycount > 0
ORDER BY popularityscore DESC, querycount DESC
LIMIT ${rowLimit};
`.trim();

  return {
    title: '🔥 Most Popular Tables',
    description: `Tables ranked by usage and popularity in ${db}.${schema}.`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    flowType: 'USAGE',
    entity,
  };
}

export default buildUsageQuery;
