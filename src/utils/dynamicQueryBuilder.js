/**
 * Dynamic Query Builder
 * 
 * Generates queries based on ACTUAL discovered tables - no hardcoded table names.
 * Queries are built on-the-fly from the schema scan results.
 */

import { buildSafeFQN, escapeStringValue } from './queryHelpers';

// =============================================================================
// ENTITY TYPE DETECTION
// =============================================================================

/**
 * Analyze discovered tables and categorize them by entity type
 * @param {Set<string>|string[]} discoveredTables - Tables from schema scan
 * @param {Object} tableMetadata - Optional metadata map with popularity scores
 *        Format: { TABLE_NAME: { popularityScore, queryCount, rowCount, ... } }
 * @returns {Object} Categorized tables with metadata, sorted by popularity
 */
export function analyzeDiscoveredTables(discoveredTables, tableMetadata = {}) {
  const tables = [...discoveredTables].map(t => t.toUpperCase());

  // Helper to get popularity score for sorting
  const getPopularity = (tableName) => {
    const meta = tableMetadata[tableName.toUpperCase()];
    if (!meta) return 0;
    // Weighted score: popularity > query count > row count
    return (meta.popularityScore || 0) * 1000 +
           (meta.queryCount || 0) * 10 +
           Math.log10((meta.rowCount || 0) + 1);
  };

  // Sort helper for category arrays
  const sortByPopularity = (arr) => {
    return arr.sort((a, b) => getPopularity(b) - getPopularity(a));
  };

  const analysis = {
    // Core entity tables (contain GUIDs, lineage info, etc.)
    entityTables: [],

    // Specific entity type mappings
    tableEntities: [],      // Tables about tables (TABLE_ENTITY, SNOWFLAKETABLE, etc.)
    columnEntities: [],     // Tables about columns
    processEntities: [],    // Tables about processes/lineage
    glossaryEntities: [],   // Glossary and term tables
    dashboardEntities: [],  // BI dashboard entities
    userEntities: [],       // User/owner entities
    tagEntities: [],        // Tag/classification entities

    // All tables for reference (sorted by popularity)
    allTables: tables,

    // Quick lookup
    hasLineage: false,
    hasGlossary: false,
    hasTags: false,
    hasUsage: false,

    // Metadata reference
    tableMetadata,
  };

  for (const table of tables) {
    // Detect entity tables (end with _ENTITY or known patterns)
    if (table.endsWith('_ENTITY') || table.startsWith('ATLAS')) {
      analysis.entityTables.push(table);
    }

    // Categorize by type
    if (matchesPattern(table, ['TABLE', 'SNOWFLAKETABLE', 'DATABRICKSTABLE', 'BIGTABLE'])) {
      if (!table.includes('TABLEAU')) { // Exclude Tableau (it's a dashboard tool)
        analysis.tableEntities.push(table);
      }
    }

    if (matchesPattern(table, ['COLUMN', 'SNOWFLAKECOLUMN', 'DATABRICKSCOLUMN'])) {
      analysis.columnEntities.push(table);
    }

    if (matchesPattern(table, ['PROCESS', 'LINEAGE', 'SPARK', 'AIRFLOW', 'DBT'])) {
      analysis.processEntities.push(table);
      analysis.hasLineage = true;
    }

    if (matchesPattern(table, ['GLOSSARY', 'TERM', 'ATLAS'])) {
      analysis.glossaryEntities.push(table);
      analysis.hasGlossary = true;
    }

    if (matchesPattern(table, ['DASHBOARD', 'REPORT', 'TABLEAU', 'LOOKER', 'POWERBI', 'METABASE'])) {
      analysis.dashboardEntities.push(table);
    }

    if (matchesPattern(table, ['USER', 'OWNER', 'PERSONA'])) {
      analysis.userEntities.push(table);
    }

    if (matchesPattern(table, ['TAG', 'CLASSIFICATION', 'LABEL'])) {
      analysis.tagEntities.push(table);
      analysis.hasTags = true;
    }

    if (matchesPattern(table, ['USAGE', 'ACCESS', 'QUERY_HISTORY', 'POPULARITY'])) {
      analysis.hasUsage = true;
    }
  }

  // Sort all category arrays by popularity
  analysis.entityTables = sortByPopularity(analysis.entityTables);
  analysis.tableEntities = sortByPopularity(analysis.tableEntities);
  analysis.columnEntities = sortByPopularity(analysis.columnEntities);
  analysis.processEntities = sortByPopularity(analysis.processEntities);
  analysis.glossaryEntities = sortByPopularity(analysis.glossaryEntities);
  analysis.dashboardEntities = sortByPopularity(analysis.dashboardEntities);
  analysis.userEntities = sortByPopularity(analysis.userEntities);
  analysis.tagEntities = sortByPopularity(analysis.tagEntities);
  analysis.allTables = sortByPopularity(analysis.allTables);

  return analysis;
}

/**
 * Check if a table name matches any of the patterns
 */
function matchesPattern(tableName, patterns) {
  const upper = tableName.toUpperCase();
  return patterns.some(p => upper.includes(p.toUpperCase()));
}

// =============================================================================
// DYNAMIC QUERY GENERATION
// =============================================================================

/**
 * Generate a simple SELECT query for any table
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {string} table - Table name
 * @param {number} limit - Row limit
 * @returns {Object} Query object
 */
export function buildPreviewQuery(database, schema, table, limit = 100) {
  const fqn = buildSafeFQN(database, schema, table);
  return {
    id: `preview_${table.toLowerCase()}`,
    label: `Preview ${table}`,
    description: `Sample rows from ${table}`,
    category: 'structure',
    layer: 'mdlh',
    sql: `-- Preview data from ${table}
SELECT *
FROM ${fqn}
LIMIT ${limit};`
  };
}

/**
 * Generate a row count query for any table
 */
export function buildCountQuery(database, schema, table) {
  const fqn = buildSafeFQN(database, schema, table);
  return {
    id: `count_${table.toLowerCase()}`,
    label: `Count ${table}`,
    description: `Total row count in ${table}`,
    category: 'structure',
    layer: 'mdlh',
    sql: `-- Row count for ${table}
SELECT COUNT(*) AS row_count
FROM ${fqn};`
  };
}

/**
 * Generate a column analysis query for any table
 */
export function buildColumnAnalysisQuery(database, schema, table) {
  const fqn = buildSafeFQN(database, schema, table);
  return {
    id: `columns_${table.toLowerCase()}`,
    label: `Columns in ${table}`,
    description: `Column structure of ${table}`,
    category: 'structure',
    layer: 'snowflake',
    sql: `-- Column structure for ${table}
DESCRIBE TABLE ${fqn};`
  };
}

/**
 * Generate a GUID lookup query if the table has a GUID column
 * @param {string} database 
 * @param {string} schema 
 * @param {string} table 
 * @param {string} sampleGuid - A real GUID from the table
 */
export function buildGuidLookupQuery(database, schema, table, sampleGuid) {
  const fqn = buildSafeFQN(database, schema, table);
  const safeGuid = sampleGuid ? escapeStringValue(sampleGuid) : "'<YOUR_GUID_HERE>'";
  
  return {
    id: `guid_lookup_${table.toLowerCase()}`,
    label: `Find by GUID in ${table}`,
    description: `Look up a specific entity by GUID`,
    category: 'structure',
    layer: 'mdlh',
    sql: `-- Find entity by GUID in ${table}
SELECT *
FROM ${fqn}
WHERE guid = ${safeGuid}
LIMIT 1;`
  };
}

/**
 * Generate upstream lineage query if process tables exist
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {string} processTable - Process table name
 * @param {string} sampleGuid - MUST be a real GUID from sample data (no placeholders!)
 */
export function buildUpstreamLineageQuery(database, schema, processTable, sampleGuid) {
  const fqn = buildSafeFQN(database, schema, processTable);
  
  // CRITICAL: Only use real GUIDs - never placeholders
  if (!sampleGuid || sampleGuid.includes('<') || sampleGuid.includes('>')) {
    return null;
  }
  
  const safeGuid = escapeStringValue(sampleGuid);
  
  return {
    id: `upstream_${processTable.toLowerCase()}`,
    label: `Upstream Lineage`,
    description: `Find what feeds into this asset`,
    category: 'lineage',
    layer: 'mdlh',
    sql: `-- Upstream lineage (what feeds into this asset)
-- Process table: ${processTable}
-- INPUTS/OUTPUTS are ARRAY - use ::STRING ILIKE for matching
SELECT 
    "GUID" AS process_guid,
    "NAME" AS process_name,
    "INPUTS"::STRING AS upstream_assets,
    "OUTPUTS"::STRING AS downstream_assets
FROM ${fqn}
WHERE "OUTPUTS"::STRING ILIKE '%' || ${safeGuid} || '%'
LIMIT 50;`
  };
}

/**
 * Generate downstream lineage query if process tables exist
 * @param {string} database - Database name
 * @param {string} schema - Schema name
 * @param {string} processTable - Process table name
 * @param {string} sampleGuid - MUST be a real GUID from sample data (no placeholders!)
 */
export function buildDownstreamLineageQuery(database, schema, processTable, sampleGuid) {
  const fqn = buildSafeFQN(database, schema, processTable);
  
  // CRITICAL: Only use real GUIDs - never placeholders
  if (!sampleGuid || sampleGuid.includes('<') || sampleGuid.includes('>')) {
    return null;
  }
  
  const safeGuid = escapeStringValue(sampleGuid);
  
  return {
    id: `downstream_${processTable.toLowerCase()}`,
    label: `Downstream Lineage`,
    description: `Find what this asset feeds into`,
    category: 'lineage',
    layer: 'mdlh',
    sql: `-- Downstream lineage (what this asset feeds into)
-- Process table: ${processTable}
-- INPUTS/OUTPUTS are ARRAY - use ::STRING ILIKE for matching
SELECT 
    "GUID" AS process_guid,
    "NAME" AS process_name,
    "INPUTS"::STRING AS upstream_assets,
    "OUTPUTS"::STRING AS downstream_assets
FROM ${fqn}
WHERE "INPUTS"::STRING ILIKE '%' || ${safeGuid} || '%'
LIMIT 50;`
  };
}

/**
 * Generate glossary term search query
 */
export function buildGlossarySearchQuery(database, schema, glossaryTable, searchTerm = '') {
  const fqn = buildSafeFQN(database, schema, glossaryTable);
  
  return {
    id: `glossary_search_${glossaryTable.toLowerCase()}`,
    label: `Search Glossary Terms`,
    description: `Find glossary terms by name`,
    category: 'glossary',
    layer: 'mdlh',
    sql: `-- Search glossary terms in ${glossaryTable}
SELECT 
    "NAME",
    "GUID",
    ${glossaryTable.includes('TERM') ? '"USERDESCRIPTION" AS description,' : ''}
    "CREATETIME",
    "CREATEDBY"
FROM ${fqn}
${searchTerm ? `WHERE "NAME" ILIKE '%${searchTerm}%'` : ''}
ORDER BY "NAME"
LIMIT 100;`
  };
}

/**
 * Generate a query to find popular/most-used tables
 */
export function buildPopularTablesQuery(database, schema, tableEntity) {
  const fqn = buildSafeFQN(database, schema, tableEntity);
  
  return {
    id: `popular_tables_${tableEntity.toLowerCase()}`,
    label: `Most Popular Tables`,
    description: `Tables ranked by usage/query count`,
    category: 'usage',
    layer: 'mdlh',
    sql: `-- Most popular tables by query count
SELECT 
    name,
    guid,
    databasename,
    schemaname,
    querycount,
    queryusercount AS unique_users,
    popularityscore
FROM ${fqn}
WHERE querycount > 0
ORDER BY popularityscore DESC NULLS LAST, querycount DESC
LIMIT 50;`
  };
}

/**
 * Generate a query to find tables with specific tags/classifications
 */
export function buildTaggedAssetsQuery(database, schema, entityTable) {
  const fqn = buildSafeFQN(database, schema, entityTable);
  
  return {
    id: `tagged_assets_${entityTable.toLowerCase()}`,
    label: `Assets with Tags`,
    description: `Find assets that have classification tags`,
    category: 'governance',
    layer: 'mdlh',
    sql: `-- Assets with classification tags in ${entityTable}
SELECT 
    name,
    guid,
    classificationnames AS tags,
    certificatestatus AS certification
FROM ${fqn}
WHERE classificationnames IS NOT NULL 
  AND ARRAY_SIZE(classificationnames) > 0
ORDER BY name
LIMIT 100;`
  };
}

// =============================================================================
// MAIN: BUILD DYNAMIC RECOMMENDATIONS
// =============================================================================

/**
 * Build recommended queries dynamically based on discovered tables
 * NO HARDCODED TABLE NAMES - everything comes from the scan
 *
 * @param {Object} options
 * @param {string} options.database - Database name
 * @param {string} options.schema - Schema name
 * @param {Set<string>|string[]} options.discoveredTables - Tables from schema scan
 * @param {Object} options.tableMetadata - Metadata map with popularity scores
 * @param {Object} options.samples - Sample entities with GUIDs
 * @param {Object} options.context - Current entity context (selected table, guid, etc.)
 * @returns {Array<Object>} Array of query objects ready to run
 */
export function buildDynamicRecommendations({
  database,
  schema,
  discoveredTables,
  tableMetadata = {},
  samples = {},
  context = {}
}) {
  if (!discoveredTables || discoveredTables.size === 0) {
    return [];
  }

  const analysis = analyzeDiscoveredTables(discoveredTables, tableMetadata);
  const recommendations = [];

  // Helper to get sample GUID from a table's samples
  // ALWAYS tries multiple sources to get a real GUID
  const getSampleGuid = (tableKey) => {
    const rows = samples[tableKey];
    if (!rows || rows.length === 0) return null;
    
    // Find the GUID column (case-insensitive)
    const firstRow = rows[0];
    const guidKey = Object.keys(firstRow).find(k => k.toUpperCase() === 'GUID');
    if (guidKey && firstRow[guidKey]) {
      return firstRow[guidKey];
    }
    return null;
  };

  // Get the BEST available GUID from all sample sources
  // Priority: tables > processes > columns (most useful for lineage queries)
  const getBestAvailableGuid = () => {
    return getSampleGuid('tables') || 
           getSampleGuid('processes') || 
           getSampleGuid('columns') ||
           context.guid ||
           null;
  };
  
  // Cache the best GUID to use consistently
  const bestGuid = getBestAvailableGuid();

  // 1. STRUCTURE QUERIES - For each entity table type found
  
  // Table entities (if any exist)
  if (analysis.tableEntities.length > 0) {
    const primaryTable = analysis.tableEntities[0];
    
    recommendations.push({
      ...buildPreviewQuery(database, schema, primaryTable, 100),
      priority: 1
    });
    
    recommendations.push({
      ...buildCountQuery(database, schema, primaryTable),
      priority: 2
    });
    
    // Only show GUID lookup if we have a real GUID
    if (bestGuid) {
      recommendations.push({
        ...buildGuidLookupQuery(database, schema, primaryTable, bestGuid),
        priority: 2
      });
    }
    
    // Popular tables query
    recommendations.push({
      ...buildPopularTablesQuery(database, schema, primaryTable),
      priority: 3
    });
    
    // Tagged assets
    recommendations.push({
      ...buildTaggedAssetsQuery(database, schema, primaryTable),
      priority: 4
    });
  }

  // Column entities
  if (analysis.columnEntities.length > 0) {
    const primaryColumn = analysis.columnEntities[0];
    const columnGuid = getSampleGuid('columns') || bestGuid;
    
    recommendations.push({
      ...buildPreviewQuery(database, schema, primaryColumn, 50),
      priority: 2
    });
    
    // Only show GUID lookup if we have a real GUID
    if (columnGuid) {
      recommendations.push({
        ...buildGuidLookupQuery(database, schema, primaryColumn, columnGuid),
        priority: 3
      });
    }
  }

  // 2. LINEAGE QUERIES - If process tables exist AND we have a real GUID
  if (analysis.processEntities.length > 0) {
    const processTable = analysis.processEntities[0];
    
    // ALWAYS use bestGuid - never show placeholder queries
    if (bestGuid) {
      const upstreamQuery = buildUpstreamLineageQuery(database, schema, processTable, bestGuid);
      if (upstreamQuery) {
        recommendations.push({ ...upstreamQuery, priority: 2 });
      }
      
      const downstreamQuery = buildDownstreamLineageQuery(database, schema, processTable, bestGuid);
      if (downstreamQuery) {
        recommendations.push({ ...downstreamQuery, priority: 2 });
      }
    }
    
    // Always show preview of the process table
    recommendations.push({
      ...buildPreviewQuery(database, schema, processTable, 50),
      priority: 3
    });
  }

  // 3. GLOSSARY QUERIES - If glossary tables exist
  if (analysis.glossaryEntities.length > 0) {
    for (const glossaryTable of analysis.glossaryEntities.slice(0, 2)) {
      recommendations.push({
        ...buildGlossarySearchQuery(database, schema, glossaryTable),
        priority: 3
      });
    }
  }

  // 4. DASHBOARD QUERIES - If dashboard entities exist
  if (analysis.dashboardEntities.length > 0) {
    const dashTable = analysis.dashboardEntities[0];
    recommendations.push({
      ...buildPreviewQuery(database, schema, dashTable, 50),
      priority: 4
    });
  }

  // 5. ADD COLUMN DESCRIBE for any table in context
  if (context.table) {
    recommendations.push({
      ...buildColumnAnalysisQuery(database, schema, context.table),
      priority: 1
    });
  }

  // Sort by priority and deduplicate
  return recommendations
    .sort((a, b) => (a.priority || 99) - (b.priority || 99))
    .filter((item, index, self) => 
      index === self.findIndex(t => t.id === item.id)
    );
}

/**
 * Get a summary of what queries are available based on discovered tables
 * @param {Set<string>|string[]} discoveredTables - Tables from schema scan
 * @param {Object} tableMetadata - Optional metadata map with popularity scores
 */
export function getAvailableQueryCategories(discoveredTables, tableMetadata = {}) {
  const analysis = analyzeDiscoveredTables(discoveredTables, tableMetadata);
  
  return {
    structure: analysis.tableEntities.length > 0 || analysis.columnEntities.length > 0,
    lineage: analysis.hasLineage,
    glossary: analysis.hasGlossary,
    governance: analysis.hasTags,
    usage: analysis.hasUsage,
    dashboards: analysis.dashboardEntities.length > 0,
    
    // Details
    tableCount: analysis.tableEntities.length,
    columnCount: analysis.columnEntities.length,
    processCount: analysis.processEntities.length,
    glossaryCount: analysis.glossaryEntities.length,
    dashboardCount: analysis.dashboardEntities.length,
    
    // First tables of each type (for display)
    primaryTableEntity: analysis.tableEntities[0] || null,
    primaryColumnEntity: analysis.columnEntities[0] || null,
    primaryProcessEntity: analysis.processEntities[0] || null,
  };
}

export default {
  analyzeDiscoveredTables,
  buildDynamicRecommendations,
  getAvailableQueryCategories,
  buildPreviewQuery,
  buildCountQuery,
  buildColumnAnalysisQuery,
  buildGuidLookupQuery,
  buildUpstreamLineageQuery,
  buildDownstreamLineageQuery,
  buildGlossarySearchQuery,
  buildPopularTablesQuery,
  buildTaggedAssetsQuery,
};

