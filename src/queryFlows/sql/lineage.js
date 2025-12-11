/**
 * Lineage SQL Builder
 * 
 * Generates lineage queries for any entity type with GUID.
 * Includes robust fallbacks when expected tables don't exist.
 * 
 * CONFIG-DRIVEN: Uses SystemConfig when available for entity resolution.
 * SQL INJECTION PROTECTED: Uses safe identifier escaping.
 */

import { escapeIdentifier, escapeStringValue, isValidIdentifier, buildSafeFQN } from '../../utils/queryHelpers';

/**
 * Find the best process table from SystemConfig or available tables
 * 
 * @param {string[]} availableTables - List of discovered tables
 * @param {Object} [systemConfig] - SystemConfig from backend
 * @returns {{ table: string, database: string, schema: string } | null}
 */
function findProcessTable(availableTables = [], systemConfig = null) {
  // First, check SystemConfig for known process entities
  const entities = systemConfig?.snowflake?.entities || {};
  
  // Priority order for process/lineage tables from SystemConfig
  const configCandidates = [
    'PROCESS_ENTITY',
    'COLUMNPROCESS_ENTITY', 
    'DBTPROCESS_ENTITY',
    'BIPROCESS_ENTITY',
  ];
  
  for (const candidate of configCandidates) {
    if (entities[candidate]) {
      const loc = entities[candidate];
      return {
        table: loc.table,
        database: loc.database,
        schema: loc.schema,
      };
    }
  }
  
  // Fallback to discovering from availableTables
  const tables = availableTables.map(t => t.toUpperCase());
  
  const discoveryPriority = [
    'PROCESS_ENTITY',
    'COLUMNPROCESS_ENTITY', 
    'DBTPROCESS_ENTITY',
    'BIPROCESS_ENTITY',
    'AIRFLOWTASK_ENTITY',
    'ADFPIPELINE_ENTITY',
    'ADFACTIVITY_ENTITY',
  ];
  
  for (const candidate of discoveryPriority) {
    if (tables.includes(candidate)) {
      // Use queryDefaults from SystemConfig if available
      const defaults = systemConfig?.queryDefaults || {};
      return {
        table: candidate,
        database: defaults.metadataDb || 'FIELD_METADATA',
        schema: defaults.metadataSchema || 'PUBLIC',
      };
    }
  }
  
  // Fallback: any table with PROCESS in name
  const processTable = availableTables.find(t => t.toUpperCase().includes('PROCESS'));
  if (processTable) {
    const defaults = systemConfig?.queryDefaults || {};
    return {
      table: processTable,
      database: defaults.metadataDb || 'FIELD_METADATA',
      schema: defaults.metadataSchema || 'PUBLIC',
    };
  }
  
  return null;
}

/**
 * Build a lineage query for the given entity
 * 
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildLineageQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const { 
    direction = 'DOWNSTREAM', 
    maxHops = 3, 
  } = inputs;
  
  // Safely handle GUID - escape if needed
  const rawGuid = entity.guid || '<YOUR_ASSET_GUID>';
  const startGuid = rawGuid.includes('<') ? rawGuid : escapeStringValue(rawGuid).slice(1, -1); // Remove quotes for display
  const safeGuidForSQL = escapeStringValue(rawGuid);
  
  const startLabel = entity.name || entity.qualifiedName || rawGuid;
  const isUpstream = direction === 'UPSTREAM';
  
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  // Build safe FQN for SHOW command
  const safeDbSchema = buildSafeFQN(db, schema, null);
  
  // Find a process table (uses SystemConfig first, then discovery)
  const processLocation = findProcessTable(availableTables, systemConfig);
  
  // If no process table found, return a helpful discovery query instead
  if (!processLocation) {
    const sql = `
-- ⚠️ No lineage/process tables found in your schema
-- Let's discover what tables ARE available for lineage

-- Step 1: Find tables that might contain lineage data
SHOW TABLES LIKE '%PROCESS%' IN ${safeDbSchema};

-- If no results, try these alternatives:
-- SHOW TABLES LIKE '%LINEAGE%' IN ${safeDbSchema};
-- SHOW TABLES LIKE '%TASK%' IN ${safeDbSchema};
-- SHOW TABLES LIKE '%PIPELINE%' IN ${safeDbSchema};
`.trim();

    return {
      title: `🔍 Find Lineage Tables`,
      description: `No lineage tables found. Run this to discover available tables.`,
      sql,
      database: db,
      schema,
      timeoutSeconds: 30,
      flowType: 'LINEAGE',
      entity,
    };
  }
  
  const procDb = processLocation.database;
  const procSchema = processLocation.schema;
  const processTable = processLocation.table;
  
  // Build safe FQN for the process table
  const procFQN = buildSafeFQN(procDb, procSchema, processTable);
  
  // First, let's check what columns the process table has
  // This is a safer approach than assuming column names
  const exploratorySQL = `
-- Lineage Exploration: ${direction} from ${startLabel}
-- Process table: ${procFQN}

-- Step 1: Explore the structure of ${processTable}
DESCRIBE TABLE ${procFQN};

-- Step 2: Preview the data (uncomment to run)
-- SELECT * FROM ${procFQN} LIMIT 10;

-- Step 3: If ${processTable} has 'inputs' and 'outputs' columns:
-- Find ${isUpstream ? 'upstream sources' : 'downstream targets'} for GUID: ${rawGuid.substring(0, 16)}...
-- inputs/outputs are VARIANT columns - use ::STRING ILIKE
/*
SELECT
    p.guid AS process_guid,
    p.name AS process_name,
    p.typename AS process_type,
    ${isUpstream ? 'p.inputs' : 'p.outputs'} AS related_assets
FROM ${procFQN} p
WHERE ${isUpstream ? 'p.outputs' : 'p.inputs'}::STRING ILIKE '%' || ${safeGuidForSQL} || '%'
LIMIT 50;
*/
`.trim();

  return {
    title: `${isUpstream ? '⬆️ Upstream' : '⬇️ Downstream'} Lineage: ${startLabel}`,
    description: `Explore lineage using ${processTable}. GUID: ${rawGuid.substring(0, 8)}...`,
    sql: exploratorySQL,
    database: procDb,
    schema: procSchema,
    timeoutSeconds: 60,
    limit: 1000,
    flowType: 'LINEAGE',
    entity,
  };
}

/**
 * Build a simple lineage exploration query
 * This just shows what's in the process table - always works if the table exists
 * 
 * @param {Object} entity - Entity context
 * @param {Object} inputs - Query inputs
 * @param {string[]} [availableTables] - Discovered tables
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 */
export function buildLineageExplorationQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  const processLocation = findProcessTable(availableTables, systemConfig);
  
  // Build safe FQN for SHOW command
  const safeDbSchema = buildSafeFQN(db, schema, null);
  
  if (!processLocation) {
    return {
      title: `🔍 Find Lineage Tables`,
      description: `Search for tables containing lineage data.`,
      sql: `SHOW TABLES LIKE '%PROCESS%' IN ${safeDbSchema};`,
      database: db,
      schema,
      timeoutSeconds: 30,
      flowType: 'LINEAGE',
      entity,
    };
  }
  
  const procFQN = buildSafeFQN(processLocation.database, processLocation.schema, processLocation.table);
  
  const sql = `
-- Explore lineage data in ${processLocation.table}
-- This shows a sample of process/pipeline entities

SELECT *
FROM ${procFQN}
LIMIT 20;
`.trim();

  return {
    title: `📊 Lineage Data: ${processLocation.table}`,
    description: `Preview lineage/process entities in ${processLocation.table}.`,
    sql,
    database: processLocation.database,
    schema: processLocation.schema,
    timeoutSeconds: 30,
    flowType: 'LINEAGE',
    entity,
  };
}

export default buildLineageQuery;
