/**
 * Find by GUID SQL Builder
 * 
 * Generates queries to find assets by their GUID.
 * Uses safe approaches that work across different schemas.
 * 
 * SQL INJECTION PROTECTED: Uses buildSafeFQN and escapeStringValue.
 */

import { buildSafeFQN, escapeStringValue } from '../../utils/queryHelpers';

/**
 * Build a query to find an asset by GUID
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildFindByGuidQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const rawGuid = entity.guid || inputs.filters?.guid || '<YOUR_GUID_HERE>';
  
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  // Build safe FQN for SHOW command (db.schema only)
  const safeDbSchema = buildSafeFQN(db, schema, null);
  
  // Safely escape the GUID for SQL
  const isPlaceholder = rawGuid.includes('<');
  const safeGuid = isPlaceholder ? rawGuid : escapeStringValue(rawGuid);
  
  // Find tables that likely contain GUIDs (end with _ENTITY)
  const tables = (availableTables || []).map(t => t.toUpperCase());
  const entityTables = tables.filter(t => t.endsWith('_ENTITY'));
  
  // If no entity tables, provide discovery query
  if (entityTables.length === 0) {
    const sql = `
-- No entity tables found in your schema
-- Let's discover what tables are available

SHOW TABLES LIKE '%_ENTITY%' IN ${safeDbSchema};

-- Or search all tables:
-- SHOW TABLES IN ${safeDbSchema};
`.trim();

    return {
      title: `🔍 Find Entity Tables`,
      description: `Discover tables that contain asset metadata.`,
      sql,
      database: db,
      schema,
      timeoutSeconds: 30,
      flowType: 'FIND_BY_GUID',
      entity,
    };
  }
  
  // Pick first few entity tables to search (don't try too many at once)
  const tablesToSearch = entityTables.slice(0, 5);
  
  // Build safe FQN for each table and search query
  const searchQueries = tablesToSearch.map(table => {
    const tableFQN = buildSafeFQN(db, schema, table);
    return `-- Search in ${table}\nSELECT * FROM ${tableFQN} WHERE guid = ${safeGuid} LIMIT 1;`;
  }).join('\n\n');
  
  const sql = `
-- Find asset by GUID: ${rawGuid}
-- Searching ${tablesToSearch.length} entity tables

-- Run each query separately (Snowflake doesn't support multiple statements)
-- Or use UNION ALL below

${searchQueries}

-- Alternative: UNION ALL approach (may fail if column schemas differ)
/*
${tablesToSearch.map(table => {
  const tableFQN = buildSafeFQN(db, schema, table);
  return `SELECT '${table.replace(/'/g, "''")}' as source_table, * FROM ${tableFQN} WHERE guid = ${safeGuid}`;
}).join('\nUNION ALL\n')}
LIMIT 1;
*/
`.trim();

  return {
    title: `🔍 Find: ${rawGuid.substring(0, 12)}...`,
    description: `Search for GUID in ${tablesToSearch.length} entity tables.`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    flowType: 'FIND_BY_GUID',
    entity,
  };
}

/**
 * Build a simple query to get full details from a specific table
 * This always works - just SELECT * WHERE guid = X
 * 
 * @param {string} guid - The GUID to search for
 * @param {string} entityTable - The entity table name
 * @param {Object} entity - Entity context
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildGuidDetailsQuery(guid, entityTable, entity, systemConfig = null) {
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity?.database || queryDefaults?.metadataDb || 'FIELD_METADATA';
  const schema = entity?.schema || queryDefaults?.metadataSchema || 'PUBLIC';
  
  // Build safe FQN for the table
  const tableFQN = buildSafeFQN(db, schema, entityTable);
  
  // Safely escape the GUID
  const safeGuid = escapeStringValue(guid);
  
  const sql = `
-- Get full details for GUID: ${guid}
-- Table: ${entityTable}

SELECT *
FROM ${tableFQN}
WHERE guid = ${safeGuid}
LIMIT 1;
`.trim();

  return {
    title: `📄 Details: ${guid.substring(0, 12)}...`,
    description: `Full metadata from ${entityTable}.`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    flowType: 'FIND_BY_GUID',
    entity,
  };
}

export default buildFindByGuidQuery;
