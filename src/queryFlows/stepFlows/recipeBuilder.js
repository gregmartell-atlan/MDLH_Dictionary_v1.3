/**
 * Recipe Builder - Converts data-driven recipes into executable MultiStepFlows
 * 
 * This is the bridge between the declarative QUERY_RECIPES and the 
 * executable MultiStepFlow format that StepWizard consumes.
 * 
 * CONFIG-DRIVEN: All entity locations are resolved from SystemConfig when available.
 */

import { buildExtractorFromBindings } from './extractors';

/**
 * Resolve entity location from SystemConfig.
 * 
 * @param {string} entityName - Logical entity name (e.g., 'PROCESS_ENTITY')
 * @param {Object} systemConfig - SystemConfig from backend
 * @returns {{ database: string, schema: string, table: string } | null}
 */
function getEntityFromConfig(entityName, systemConfig) {
  if (!systemConfig?.snowflake?.entities) return null;
  return systemConfig.snowflake.entities[entityName] || null;
}

/**
 * Get the fully qualified table name from SystemConfig or defaults.
 * 
 * @param {string} entityName - Logical entity name
 * @param {Object} systemConfig - SystemConfig from backend
 * @param {string} defaultDb - Default database
 * @param {string} defaultSchema - Default schema
 * @returns {string} Fully qualified table name
 */
function getEntityFQN(entityName, systemConfig, defaultDb = 'FIELD_METADATA', defaultSchema = 'PUBLIC') {
  const entity = getEntityFromConfig(entityName, systemConfig);
  
  if (entity) {
    return `"${entity.database}"."${entity.schema}"."${entity.table}"`;
  }
  
  // Fallback to defaults
  return `"${defaultDb}"."${defaultSchema}"."${entityName}"`;
}

/**
 * Get metadata db/schema from SystemConfig or defaults.
 */
function getMetadataContext(systemConfig, fallbackDb = 'FIELD_METADATA', fallbackSchema = 'PUBLIC') {
  const defaults = systemConfig?.queryDefaults || {};
  return {
    db: defaults.metadataDb || fallbackDb,
    schema: defaults.metadataSchema || fallbackSchema,
  };
}

/**
 * SQL Query Templates - These are the actual SQL generators.
 * Each template is a function that takes params and returns SQL.
 * 
 * Add new templates here as you add queries to recipes.
 */
const SQL_TEMPLATES = {
  // ============================================
  // CORE - Process/Lineage Tables
  // ============================================
  
  core_show_process_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Discovery: Find lineage/process tables WITH row counts
-- Tables with more rows are more likely to have useful data

SELECT 
    table_name AS name,
    row_count,
    ROUND(bytes / 1024 / 1024, 2) AS size_mb,
    CASE 
        WHEN table_name LIKE '%PROCESS%' THEN 'lineage'
        WHEN table_name LIKE '%COLUMN%' THEN 'column-level'
        ELSE 'other'
    END AS category
FROM ${db}.information_schema.tables
WHERE table_schema = '${schema}'
  AND table_name LIKE '%PROCESS%'
  AND row_count > 0
ORDER BY row_count DESC
LIMIT 20;`;
  },

  core_describe_process_table: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const table = params.processTable || 'PROCESS_ENTITY';
    return `-- Discovery: Get columns with data types for ${table}
-- This helps us understand how to query and display the data

SELECT 
    column_name,
    data_type,
    is_nullable,
    CASE 
        WHEN data_type LIKE 'ARRAY%' THEN 'expandable'
        WHEN data_type LIKE 'OBJECT%' OR data_type = 'VARIANT' THEN 'json'
        WHEN column_name IN ('GUID', 'QUALIFIEDNAME') THEN 'identifier'
        WHEN data_type LIKE 'TIMESTAMP%' THEN 'datetime'
        ELSE 'text'
    END AS display_hint
FROM ${db}.information_schema.columns
WHERE table_schema = '${schema}'
  AND table_name = '${table}'
ORDER BY ordinal_position;

-- Key columns for lineage: INPUTS, OUTPUTS, GUID, NAME`;
  },

  core_sample_process_rows: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const table = params.processTable || 'PROCESS_ENTITY';
    const guid = params.entityGuid;
    
    if (guid) {
      return `-- Look for your asset in lineage data
-- Your asset GUID: ${guid}
-- Using FLATTEN to search within ARRAY<OBJECT> columns

SELECT DISTINCT
    p.guid AS process_guid,
    p.name AS process_name,
    ARRAY_SIZE(p.inputs) AS input_count,
    ARRAY_SIZE(p.outputs) AS output_count
FROM ${db}.${schema}.${table} p,
    LATERAL FLATTEN(input => ARRAY_CAT(
        COALESCE(p.inputs, ARRAY_CONSTRUCT()),
        COALESCE(p.outputs, ARRAY_CONSTRUCT())
    ), OUTER => TRUE) f
WHERE f.value:guid::STRING ILIKE '%${guid}%'
   OR f.value:qualifiedName::STRING ILIKE '%${guid}%'
LIMIT 10;`;
    }
    
    return `-- Sample lineage data to find assets
-- Shows processes that have inputs or outputs

SELECT 
    guid AS process_guid,
    name AS process_name,
    typename AS process_type,
    ARRAY_SIZE(inputs) AS input_count,
    ARRAY_SIZE(outputs) AS output_count
FROM ${db}.${schema}.${table}
WHERE ARRAY_SIZE(inputs) > 0 OR ARRAY_SIZE(outputs) > 0
LIMIT 10;`;
  },

  core_full_lineage_query: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const table = params.processTable || 'PROCESS_ENTITY';
    const direction = params.direction || 'DOWNSTREAM';
    const guid = params.guid || params.entityGuid;
    const entityName = params.entityName || guid || 'unknown';
    
    // For downstream: find processes where inputs contain our asset (our asset feeds INTO them)
    // For upstream: find processes where outputs contain our asset (they feed INTO our asset)
    const searchColumn = direction === 'UPSTREAM' ? 'outputs' : 'inputs';
    const directionLabel = direction === 'UPSTREAM' ? 'upstream sources' : 'downstream consumers';
    
    // If no GUID provided, show a sample of processes with lineage data
    if (!guid || guid === '<YOUR_ASSET_GUID>') {
      return `-- Lineage Query - Sample processes with ${directionLabel}
-- No specific GUID provided - showing sample data
-- TIP: Click a row above to use its GUID, or run Step 3 to find assets

SELECT 
    p.guid AS process_guid,
    p.name AS process_name,
    p.typename AS process_type,
    ARRAY_SIZE(p.inputs) AS input_count,
    ARRAY_SIZE(p.outputs) AS output_count
FROM ${db}.${schema}.${table} p
WHERE ARRAY_SIZE(p.${searchColumn}) > 0
ORDER BY p.name
LIMIT 20;`;
    }
    
    return `-- Full Lineage Query - ${direction} dependencies
-- Starting from: ${entityName}
-- Finding: ${directionLabel}
-- Search GUID: ${guid}

-- Step 1: Find processes connected to this asset
SELECT DISTINCT
    p.guid AS process_guid,
    p.name AS process_name,
    p.typename AS process_type,
    ARRAY_SIZE(p.inputs) AS input_count,
    ARRAY_SIZE(p.outputs) AS output_count
FROM ${db}.${schema}.${table} p,
    LATERAL FLATTEN(input => p.${searchColumn}, OUTER => TRUE) f
WHERE f.value:guid::STRING = '${guid}'
   OR f.value:qualifiedName::STRING ILIKE '%${guid}%'
LIMIT 20;

-- Step 2: See the actual linked assets (uncomment to run):
/*
SELECT 
    p.guid AS process_guid,
    p.name AS process_name,
    f.value:guid::VARCHAR AS linked_asset_guid,
    f.value:typeName::VARCHAR AS linked_asset_type,
    f.value:qualifiedName::VARCHAR AS linked_asset_name
FROM ${db}.${schema}.${table} p,
    LATERAL FLATTEN(input => p.${direction === 'UPSTREAM' ? 'inputs' : 'outputs'}) f
WHERE p.guid IN (
    SELECT DISTINCT p2.guid 
    FROM ${db}.${schema}.${table} p2,
        LATERAL FLATTEN(input => p2.${searchColumn}) f2
    WHERE f2.value:guid::VARCHAR = '${guid}'
)
LIMIT 50;
*/`;
  },

  // ============================================
  // CORE - Schema Discovery
  // ============================================
  
  core_show_all_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- List all tables in the schema
SHOW TABLES IN ${db}.${schema};`;
  },

  core_describe_table: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const table = params.table || params.selectedTable || 'TABLE_ENTITY';
    return `-- Describe table structure
DESCRIBE TABLE ${db}.${schema}.${table};`;
  },

  core_sample_table_rows: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const table = params.table || params.selectedTable || 'TABLE_ENTITY';
    return `-- Sample rows from table
SELECT * FROM ${db}.${schema}.${table} LIMIT 20;`;
  },

  // ============================================
  // GLOSSARY
  // ============================================
  
  glossary_show_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Find glossary-related tables
SHOW TABLES LIKE '%GLOSSARY%' IN ${db}.${schema};`;
  },

  glossary_list_all: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- List all glossaries
SELECT guid, name, displayname, qualifiedname
FROM ${db}.${schema}.ATLASGLOSSARY_ENTITY
ORDER BY name
LIMIT 100;`;
  },

  glossary_search_terms: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const searchTerm = params.searchTerm || '%';
    return `-- Search for glossary terms
SELECT guid, name, displayname, qualifiedname, description
FROM ${db}.${schema}.ATLASGLOSSARYTERM_ENTITY
WHERE name ILIKE '%${searchTerm}%' 
   OR displayname ILIKE '%${searchTerm}%'
ORDER BY name
LIMIT 50;`;
  },

  // ============================================
  // COLUMN PROFILING
  // ============================================
  
  profile_column_stats: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const table = params.table;
    const column = params.column;
    return `-- Column statistics
SELECT 
    COUNT(*) AS total_count,
    COUNT(${column}) AS non_null_count,
    COUNT(*) - COUNT(${column}) AS null_count,
    ROUND(100.0 * (COUNT(*) - COUNT(${column})) / NULLIF(COUNT(*), 0), 2) AS null_percent,
    COUNT(DISTINCT ${column}) AS distinct_count
FROM ${db}.${schema}.${table};`;
  },

  profile_top_values: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const table = params.table;
    const column = params.column;
    return `-- Top values by frequency
SELECT 
    ${column} AS value,
    COUNT(*) AS count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) AS percent
FROM ${db}.${schema}.${table}
WHERE ${column} IS NOT NULL
GROUP BY ${column}
ORDER BY count DESC
LIMIT 20;`;
  },

  profile_sample_values: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const table = params.table;
    const column = params.column;
    return `-- Sample values
SELECT DISTINCT ${column} AS value
FROM ${db}.${schema}.${table}
WHERE ${column} IS NOT NULL
LIMIT 50;`;
  },

  // ============================================
  // USAGE
  // ============================================
  
  usage_find_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Find usage/query history tables
SHOW TABLES LIKE '%QUERY%' IN ${db}.${schema};`;
  },

  usage_recent_queries: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const assetName = params.assetName || '';
    return `-- Recent queries referencing this asset
-- Note: This requires QUERY_HISTORY_ENTITY or Snowflake ACCOUNT_USAGE access
SELECT 
    guid,
    name,
    createtime,
    username
FROM ${db}.${schema}.QUERY_ENTITY
WHERE qualifiedname ILIKE '%${assetName}%'
ORDER BY createtime DESC
LIMIT 20;`;
  },

  usage_popularity: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const assetName = params.assetName || '';
    return `-- Asset popularity analysis
-- Requires usage data in your schema
SELECT 
    name,
    COUNT(*) AS query_count,
    COUNT(DISTINCT username) AS unique_users
FROM ${db}.${schema}.QUERY_ENTITY
WHERE qualifiedname ILIKE '%${assetName}%'
GROUP BY name
ORDER BY query_count DESC
LIMIT 20;`;
  },

  // ============================================
  // DBT
  // ============================================
  
  dbt_show_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Find dbt-related tables
SHOW TABLES LIKE '%DBT%' IN ${db}.${schema};`;
  },

  dbt_list_models: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- List dbt models
SELECT guid, name, displayname, qualifiedname
FROM ${db}.${schema}.DBTMODEL_ENTITY
ORDER BY name
LIMIT 100;`;
  },

  dbt_model_dependencies: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const modelGuid = params.modelGuid || params.selectedModelGuid || '<MODEL_GUID>';
    return `-- Find dbt model dependencies
-- INPUTS/OUTPUTS are ARRAY - use ::STRING for partial GUID match
SELECT 
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    p."INPUTS",
    p."OUTPUTS"
FROM ${db}.${schema}.PROCESS_ENTITY p
WHERE p."INPUTS"::STRING ILIKE '%${modelGuid}%'
   OR p."OUTPUTS"::STRING ILIKE '%${modelGuid}%'
LIMIT 20;`;
  },

  // ============================================
  // BI TOOLS
  // ============================================
  
  bi_show_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Find BI-related entity tables
SHOW TABLES LIKE '%DASHBOARD%' IN ${db}.${schema};`;
  },

  bi_list_dashboards: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- List dashboards (adjust table name for your BI tool)
SELECT guid, name, displayname, qualifiedname
FROM ${db}.${schema}.POWERBIDASHBOARD_ENTITY
ORDER BY name
LIMIT 50;`;
  },

  bi_dashboard_sources: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const dashboardGuid = params.dashboardGuid || params.selectedDashboardGuid || '<DASHBOARD_GUID>';
    return `-- Find data sources for dashboard
-- OUTPUTS is an ARRAY - use ::STRING for partial GUID match
SELECT 
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    p."INPUTS" AS data_sources
FROM ${db}.${schema}.BIPROCESS_ENTITY p
WHERE p."OUTPUTS"::STRING ILIKE '%${dashboardGuid}%'
LIMIT 20;`;
  },

  // ============================================
  // IMPACT ANALYSIS TEMPLATES
  // ============================================
  
  impact_find_asset: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const searchTerm = params.searchTerm || '';
    return `-- Find assets to analyze for impact
SELECT 
    "GUID" AS guid,
    "NAME" AS name,
    "TYPENAME" AS type,
    "QUALIFIEDNAME" AS qualified_name,
    "POPULARITYSCORE" AS popularity
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  ${searchTerm ? `AND ("NAME" ILIKE '%${searchTerm}%' OR "QUALIFIEDNAME" ILIKE '%${searchTerm}%')` : ''}
ORDER BY "POPULARITYSCORE" DESC NULLS LAST
LIMIT 50;`;
  },

  impact_direct_downstream: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const assetGuid = params.assetGuid || params.selectedAssetGuid;
    if (!assetGuid) {
      return `-- Select an asset in Step 1 first
SELECT 'Please run Step 1 to select an asset' AS message;`;
    }
    return `-- Find direct downstream consumers (1-hop)
SELECT DISTINCT
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    f.value:"guid"::STRING AS consumer_guid,
    f.value:"typeName"::STRING AS consumer_type,
    f.value:"qualifiedName"::STRING AS consumer_name
FROM ${db}.${schema}.PROCESS_ENTITY p,
    LATERAL FLATTEN(INPUT => p."OUTPUTS") f
WHERE p."INPUTS"::STRING ILIKE '%${assetGuid}%'
ORDER BY consumer_type, consumer_name
LIMIT 100;`;
  },

  impact_find_dashboards: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const assetGuid = params.assetGuid || params.selectedAssetGuid;
    if (!assetGuid) {
      return `-- Select an asset first
SELECT 'Please select an asset in Step 1' AS message;`;
    }
    return `-- Find impacted dashboards via lineage
-- Traces through BIPROCESS to find dashboards
WITH downstream_chain AS (
    SELECT DISTINCT f.value:"guid"::STRING AS asset_guid
    FROM ${db}.${schema}.PROCESS_ENTITY p,
        LATERAL FLATTEN(INPUT => p."OUTPUTS") f
    WHERE p."INPUTS"::STRING ILIKE '%${assetGuid}%'
)
SELECT 
    d."GUID" AS dashboard_guid,
    d."NAME" AS dashboard_name,
    d."TYPENAME" AS dashboard_type,
    d."CONNECTIONNAME" AS connection,
    d."STATUS" AS status
FROM ${db}.${schema}.TABLEAUDASHBOARD_ENTITY d
WHERE d."GUID" IN (SELECT asset_guid FROM downstream_chain)

UNION ALL

SELECT 
    d."GUID",
    d."NAME",
    d."TYPENAME",
    d."CONNECTIONNAME",
    d."STATUS"
FROM ${db}.${schema}.POWERBIDASHBOARD_ENTITY d
WHERE d."GUID" IN (SELECT asset_guid FROM downstream_chain)
LIMIT 50;`;
  },

  impact_find_data_products: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const assetGuid = params.assetGuid || params.selectedAssetGuid;
    if (!assetGuid) {
      return `-- Select an asset first
SELECT 'Please select an asset in Step 1' AS message;`;
    }
    return `-- Find data products that include this asset
SELECT 
    dp."GUID" AS product_guid,
    dp."NAME" AS product_name,
    dp."DATAPRODUCTSTATUS" AS status,
    dp."DATAPRODUCTCRITICALITY" AS criticality,
    dd."NAME" AS domain_name
FROM ${db}.${schema}.DATAPRODUCT_ENTITY dp
LEFT JOIN ${db}.${schema}.DATADOMAIN_ENTITY dd 
    ON dp."DOMAINGUIDS"::STRING ILIKE '%' || dd."GUID" || '%'
WHERE dp."DATAPRODUCTASSETSDSL"::STRING ILIKE '%${assetGuid}%'
   OR dp."QUALIFIEDNAME"::STRING ILIKE '%${assetGuid}%'
ORDER BY dp."DATAPRODUCTCRITICALITY" DESC NULLS LAST
LIMIT 30;`;
  },

  impact_full_analysis: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const assetGuid = params.assetGuid || params.selectedAssetGuid;
    const assetName = params.assetName || params.selectedAssetName || 'Unknown Asset';
    const maxHops = params.maxHops || 3;
    if (!assetGuid) {
      return `-- Complete the previous steps first
SELECT 'Please select an asset and run Steps 1-4' AS message;`;
    }
    return `-- FULL IMPACT ANALYSIS REPORT
-- Asset: ${assetName}
-- GUID: ${assetGuid}
-- Max Hops: ${maxHops}

WITH RECURSIVE lineage_chain AS (
    -- Base: direct downstream
    SELECT 
        f.value:"guid"::STRING AS asset_guid,
        f.value:"typeName"::STRING AS asset_type,
        1 AS hop_level
    FROM ${db}.${schema}.PROCESS_ENTITY p,
        LATERAL FLATTEN(INPUT => p."OUTPUTS") f
    WHERE p."INPUTS"::STRING ILIKE '%${assetGuid}%'
    
    UNION ALL
    
    -- Recursive: next hop
    SELECT 
        f.value:"guid"::STRING,
        f.value:"typeName"::STRING,
        lc.hop_level + 1
    FROM lineage_chain lc
    JOIN ${db}.${schema}.PROCESS_ENTITY p 
        ON p."INPUTS"::STRING ILIKE '%' || lc.asset_guid || '%'
    CROSS JOIN LATERAL FLATTEN(INPUT => p."OUTPUTS") f
    WHERE lc.hop_level < ${maxHops}
)
SELECT 
    asset_type,
    COUNT(DISTINCT asset_guid) AS affected_count,
    MIN(hop_level) AS closest_hop,
    MAX(hop_level) AS furthest_hop
FROM lineage_chain
GROUP BY asset_type
ORDER BY affected_count DESC;

-- Summary counts by hop level:
-- SELECT hop_level, COUNT(DISTINCT asset_guid) AS asset_count
-- FROM lineage_chain
-- GROUP BY hop_level
-- ORDER BY hop_level;`;
  },

  // ============================================
  // DATA QUALITY AUDIT TEMPLATES
  // ============================================
  
  quality_find_profiled_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Find tables with profiling data
SELECT 
    "GUID" AS guid,
    "NAME" AS name,
    "SCHEMANAME" AS schema_name,
    "DATABASENAME" AS database_name,
    "ISPROFILED" AS is_profiled,
    "ROWCOUNT" AS row_count,
    "COLUMNCOUNT" AS column_count
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND "ISPROFILED" = TRUE
ORDER BY "ROWCOUNT" DESC NULLS LAST
LIMIT 100;`;
  },

  quality_column_null_rates: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const tableGuid = params.tableGuid || params.selectedTableGuid;
    return `-- Column null rates from MDLH profiling
SELECT 
    c."NAME" AS column_name,
    c."DATATYPE" AS data_type,
    c."COLUMNDISTINCTVALUESCOUNT" AS distinct_count,
    c."COLUMNMISSINGVALUESCOUNT" AS null_count,
    CASE 
        WHEN c."COLUMNDISTINCTVALUESCOUNT" + COALESCE(c."COLUMNMISSINGVALUESCOUNT", 0) > 0
        THEN ROUND(100.0 * COALESCE(c."COLUMNMISSINGVALUESCOUNT", 0) / 
             (c."COLUMNDISTINCTVALUESCOUNT" + COALESCE(c."COLUMNMISSINGVALUESCOUNT", 0)), 2)
        ELSE 0
    END AS null_percent
FROM ${db}.${schema}.COLUMN_ENTITY c
WHERE c."STATUS" = 'ACTIVE'
  ${tableGuid ? `AND c."TABLEQUALIFIEDNAME"::STRING ILIKE '%${tableGuid}%'` : ''}
ORDER BY null_percent DESC NULLS LAST
LIMIT 100;`;
  },

  quality_freshness_analysis: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Data freshness analysis
SELECT 
    "NAME" AS name,
    "QUALIFIEDNAME" AS qualified_name,
    "SOURCEUPDATEDAT" AS last_updated,
    "SOURCELASTSYNCAT" AS last_synced,
    DATEDIFF('day', "SOURCEUPDATEDAT", CURRENT_TIMESTAMP()) AS days_stale,
    "STATUS" AS status
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND "SOURCEUPDATEDAT" IS NOT NULL
ORDER BY days_stale DESC NULLS LAST
LIMIT 100;`;
  },

  quality_documentation_gaps: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Documentation coverage analysis
WITH doc_stats AS (
    SELECT 
        COUNT(*) AS total_tables,
        SUM(CASE WHEN "USERDESCRIPTION" IS NOT NULL AND "USERDESCRIPTION" != '' THEN 1 ELSE 0 END) AS documented_tables
    FROM ${db}.${schema}.TABLE_ENTITY
    WHERE "STATUS" = 'ACTIVE'
)
SELECT 
    total_tables,
    documented_tables,
    total_tables - documented_tables AS undocumented_tables,
    ROUND(100.0 * documented_tables / NULLIF(total_tables, 0), 2) AS coverage_percent
FROM doc_stats;

-- Undocumented tables:
-- SELECT "NAME", "QUALIFIEDNAME", "CONNECTORNAME"
-- FROM ${db}.${schema}.TABLE_ENTITY
-- WHERE "STATUS" = 'ACTIVE'
--   AND ("USERDESCRIPTION" IS NULL OR "USERDESCRIPTION" = '')
-- LIMIT 50;`;
  },

  quality_full_scorecard: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- DATA QUALITY SCORECARD
WITH metrics AS (
    SELECT
        -- Documentation
        SUM(CASE WHEN "USERDESCRIPTION" IS NOT NULL AND "USERDESCRIPTION" != '' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) AS doc_score,
        -- Ownership
        SUM(CASE WHEN "OWNERUSERS" IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) AS ownership_score,
        -- Certification
        SUM(CASE WHEN "STATUS" = 'VERIFIED' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) AS cert_score,
        -- Profiling
        SUM(CASE WHEN "ISPROFILED" = TRUE THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) AS profile_score,
        -- Total
        COUNT(*) AS total_assets
    FROM ${db}.${schema}.TABLE_ENTITY
    WHERE "STATUS" = 'ACTIVE'
)
SELECT
    ROUND(doc_score, 1) AS documentation_pct,
    ROUND(ownership_score, 1) AS ownership_pct,
    ROUND(cert_score, 1) AS certification_pct,
    ROUND(profile_score, 1) AS profiling_pct,
    ROUND((doc_score + ownership_score + cert_score + profile_score) / 4, 1) AS overall_quality_score,
    total_assets
FROM metrics;`;
  },

  // ============================================
  // GOVERNANCE COMPLIANCE TEMPLATES
  // ============================================
  
  governance_ownership_gaps: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Ownership audit - assets without owners
WITH ownership_stats AS (
    SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN "OWNERUSERS" IS NOT NULL OR "OWNERGROUPS" IS NOT NULL THEN 1 ELSE 0 END) AS with_owner
    FROM ${db}.${schema}.TABLE_ENTITY
    WHERE "STATUS" = 'ACTIVE'
)
SELECT 
    total AS total_assets,
    with_owner AS owned_assets,
    total - with_owner AS unowned_assets,
    ROUND(100.0 * with_owner / NULLIF(total, 0), 2) AS ownership_percent
FROM ownership_stats;

-- Unowned assets:
-- SELECT "NAME", "QUALIFIEDNAME", "CONNECTORNAME", "STATUS"
-- FROM ${db}.${schema}.TABLE_ENTITY
-- WHERE "STATUS" = 'ACTIVE'
--   AND "OWNERUSERS" IS NULL
--   AND "OWNERGROUPS" IS NULL
-- LIMIT 50;`;
  },

  governance_classification_gaps: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Classification audit - assets without tags
WITH classification_stats AS (
    SELECT COUNT(DISTINCT t."GUID") AS classified_count
    FROM ${db}.${schema}.TABLE_ENTITY t
    JOIN ${db}.${schema}.TAG_RELATIONSHIP tr ON t."GUID" = tr."ENTITYGUID"
    WHERE t."STATUS" = 'ACTIVE'
),
total_stats AS (
    SELECT COUNT(*) AS total_count
    FROM ${db}.${schema}.TABLE_ENTITY
    WHERE "STATUS" = 'ACTIVE'
)
SELECT 
    ts.total_count AS total_assets,
    cs.classified_count AS classified_assets,
    ts.total_count - cs.classified_count AS unclassified_assets,
    ROUND(100.0 * cs.classified_count / NULLIF(ts.total_count, 0), 2) AS classified_percent
FROM total_stats ts, classification_stats cs;`;
  },

  governance_pii_exposure: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- PII exposure risk - columns tagged PII without masking
SELECT 
    c."NAME" AS column_name,
    c."TABLENAME" AS table_name,
    tr."TAGNAME" AS pii_tag,
    c."STATUS" AS status,
    c."OWNERUSERS"::STRING AS owners
FROM ${db}.${schema}.COLUMN_ENTITY c
JOIN ${db}.${schema}.TAG_RELATIONSHIP tr ON c."GUID" = tr."ENTITYGUID"
WHERE c."STATUS" = 'ACTIVE'
  AND (tr."TAGNAME" ILIKE '%PII%' 
       OR tr."TAGNAME" ILIKE '%Sensitive%' 
       OR tr."TAGNAME" ILIKE '%Personal%')
ORDER BY c."TABLENAME", c."NAME"
LIMIT 100;`;
  },

  governance_certification_status: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Certification status summary
SELECT 
    COALESCE("STATUS", 'NOT SET') AS status,
    COUNT(*) AS asset_count,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) AS percent
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
GROUP BY "STATUS"
ORDER BY asset_count DESC;`;
  },

  governance_full_report: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- GOVERNANCE COMPLIANCE REPORT
SELECT 
    'Documentation' AS metric,
    SUM(CASE WHEN "USERDESCRIPTION" IS NOT NULL AND "USERDESCRIPTION" != '' THEN 1 ELSE 0 END) AS compliant,
    COUNT(*) AS total,
    ROUND(100.0 * SUM(CASE WHEN "USERDESCRIPTION" IS NOT NULL AND "USERDESCRIPTION" != '' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS compliance_pct
FROM ${db}.${schema}.TABLE_ENTITY WHERE "STATUS" = 'ACTIVE'

UNION ALL

SELECT 
    'Ownership',
    SUM(CASE WHEN "OWNERUSERS" IS NOT NULL OR "OWNERGROUPS" IS NOT NULL THEN 1 ELSE 0 END),
    COUNT(*),
    ROUND(100.0 * SUM(CASE WHEN "OWNERUSERS" IS NOT NULL OR "OWNERGROUPS" IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)
FROM ${db}.${schema}.TABLE_ENTITY WHERE "STATUS" = 'ACTIVE'

UNION ALL

SELECT 
    'Verification',
    SUM(CASE WHEN "STATUS" IN ('VERIFIED', 'DRAFT') THEN 1 ELSE 0 END),
    COUNT(*),
    ROUND(100.0 * SUM(CASE WHEN "STATUS" IN ('VERIFIED', 'DRAFT') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1)
FROM ${db}.${schema}.TABLE_ENTITY WHERE "STATUS" = 'ACTIVE';`;
  },

  // ============================================
  // DATA MESH TEMPLATES
  // ============================================
  
  datamesh_list_domains: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- List all data domains
SELECT 
    "GUID" AS guid,
    "NAME" AS name,
    "USERDESCRIPTION" AS description,
    "PARENTDOMAINQUALIFIEDNAME" AS parent_domain,
    "STATUS" AS status
FROM ${db}.${schema}.DATADOMAIN_ENTITY
WHERE "STATUS" = 'ACTIVE'
ORDER BY "NAME"
LIMIT 100;`;
  },

  datamesh_list_products: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const domainGuid = params.domainGuid || params.selectedDomainGuid;
    return `-- List data products
SELECT 
    dp."GUID" AS guid,
    dp."NAME" AS name,
    dp."DATAPRODUCTSTATUS" AS status,
    dp."DATAPRODUCTCRITICALITY" AS criticality,
    dp."DATAPRODUCTSENSITIVITY" AS sensitivity,
    dp."DATAPRODUCTVISIBILITY" AS visibility,
    dd."NAME" AS domain_name
FROM ${db}.${schema}.DATAPRODUCT_ENTITY dp
LEFT JOIN ${db}.${schema}.DATADOMAIN_ENTITY dd 
    ON dp."DOMAINGUIDS"::STRING ILIKE '%' || dd."GUID" || '%'
WHERE dp."STATUS" = 'ACTIVE'
  ${domainGuid ? `AND dp."DOMAINGUIDS"::STRING ILIKE '%${domainGuid}%'` : ''}
ORDER BY dp."DATAPRODUCTCRITICALITY" DESC NULLS LAST, dp."NAME"
LIMIT 100;`;
  },

  datamesh_product_contracts: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const productGuid = params.productGuid || params.selectedProductGuid;
    return `-- Data contracts for product
SELECT 
    "GUID" AS guid,
    "NAME" AS name,
    "DATACONTRACTVERSION" AS version,
    "STATUS" AS status,
    "DATACONTRACTASSETGUID" AS asset_guid
FROM ${db}.${schema}.DATACONTRACT_ENTITY
WHERE "STATUS" = 'ACTIVE'
  ${productGuid ? `AND "QUALIFIEDNAME"::STRING ILIKE '%${productGuid}%'` : ''}
ORDER BY "DATACONTRACTVERSION" DESC
LIMIT 50;`;
  },

  datamesh_product_consumers: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const productGuid = params.productGuid || params.selectedProductGuid;
    if (!productGuid) {
      return `-- Select a data product first
SELECT 'Select a data product in Step 2' AS message;`;
    }
    return `-- Find consumers of this data product
SELECT DISTINCT
    p."GUID" AS process_guid,
    p."NAME" AS consumer_name,
    p."TYPENAME" AS consumer_type,
    f.value:"typeName"::STRING AS output_type
FROM ${db}.${schema}.PROCESS_ENTITY p,
    LATERAL FLATTEN(INPUT => p."OUTPUTS") f
WHERE p."INPUTS"::STRING ILIKE '%${productGuid}%'
ORDER BY consumer_name
LIMIT 100;`;
  },

  datamesh_product_health: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const productGuid = params.productGuid || params.selectedProductGuid;
    return `-- Data product health metrics
SELECT 
    dp."NAME" AS product_name,
    dp."DATAPRODUCTSTATUS" AS status,
    dp."DATAPRODUCTCRITICALITY" AS criticality,
    dp."DATAPRODUCTSCORE" AS health_score,
    dp."STATUS" AS certification,
    dp."OWNERUSERS"::STRING AS owners,
    dd."NAME" AS domain
FROM ${db}.${schema}.DATAPRODUCT_ENTITY dp
LEFT JOIN ${db}.${schema}.DATADOMAIN_ENTITY dd 
    ON dp."DOMAINGUIDS"::STRING ILIKE '%' || dd."GUID" || '%'
WHERE dp."STATUS" = 'ACTIVE'
  ${productGuid ? `AND dp."GUID" = '${productGuid}'` : ''}
LIMIT 1;`;
  },

  // ============================================
  // ORPHAN ASSET TEMPLATES
  // ============================================
  
  orphan_no_lineage: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Assets without lineage
SELECT 
    t."GUID" AS guid,
    t."NAME" AS name,
    t."QUALIFIEDNAME" AS qualified_name,
    t."CONNECTORNAME" AS connector,
    t."HASLINEAGE" AS has_lineage
FROM ${db}.${schema}.TABLE_ENTITY t
WHERE t."STATUS" = 'ACTIVE'
  AND (t."HASLINEAGE" = FALSE OR t."HASLINEAGE" IS NULL)
ORDER BY t."CREATETIME" ASC
LIMIT 100;`;
  },

  orphan_no_usage: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const daysThreshold = params.daysThreshold || 90;
    return `-- Assets without recent usage
SELECT 
    "GUID" AS guid,
    "NAME" AS name,
    "QUALIFIEDNAME" AS qualified_name,
    "QUERYCOUNT" AS query_count,
    "SOURCELASTREADAT" AS last_read,
    DATEDIFF('day', "SOURCELASTREADAT", CURRENT_TIMESTAMP()) AS days_since_read
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND ("QUERYCOUNT" IS NULL OR "QUERYCOUNT" = 0)
  AND "CREATETIME" < DATEADD('day', -${daysThreshold}, CURRENT_TIMESTAMP())
ORDER BY "CREATETIME" ASC
LIMIT 100;`;
  },

  orphan_no_owner: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Assets without owners
SELECT 
    "GUID" AS guid,
    "NAME" AS name,
    "QUALIFIEDNAME" AS qualified_name,
    "CONNECTORNAME" AS connector,
    "CREATETIME" AS created
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND "OWNERUSERS" IS NULL
  AND "OWNERGROUPS" IS NULL
ORDER BY "CREATETIME" ASC
LIMIT 100;`;
  },

  orphan_no_documentation: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Assets without documentation
SELECT 
    "GUID" AS guid,
    "NAME" AS name,
    "QUALIFIEDNAME" AS qualified_name,
    "CONNECTORNAME" AS connector,
    "STATUS" AS status
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND ("USERDESCRIPTION" IS NULL OR "USERDESCRIPTION" = '')
  AND ("DESCRIPTION" IS NULL OR "DESCRIPTION" = '')
ORDER BY "POPULARITYSCORE" DESC NULLS LAST
LIMIT 100;`;
  },

  orphan_full_report: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- ORPHAN CANDIDATES REPORT
-- Assets matching multiple orphan criteria
SELECT 
    "GUID" AS guid,
    "NAME" AS name,
    "CONNECTORNAME" AS connector,
    CASE WHEN "HASLINEAGE" = FALSE OR "HASLINEAGE" IS NULL THEN 1 ELSE 0 END AS no_lineage,
    CASE WHEN "QUERYCOUNT" IS NULL OR "QUERYCOUNT" = 0 THEN 1 ELSE 0 END AS no_usage,
    CASE WHEN "OWNERUSERS" IS NULL AND "OWNERGROUPS" IS NULL THEN 1 ELSE 0 END AS no_owner,
    CASE WHEN "USERDESCRIPTION" IS NULL OR "USERDESCRIPTION" = '' THEN 1 ELSE 0 END AS no_docs,
    (CASE WHEN "HASLINEAGE" = FALSE OR "HASLINEAGE" IS NULL THEN 1 ELSE 0 END +
     CASE WHEN "QUERYCOUNT" IS NULL OR "QUERYCOUNT" = 0 THEN 1 ELSE 0 END +
     CASE WHEN "OWNERUSERS" IS NULL AND "OWNERGROUPS" IS NULL THEN 1 ELSE 0 END +
     CASE WHEN "USERDESCRIPTION" IS NULL OR "USERDESCRIPTION" = '' THEN 1 ELSE 0 END) AS orphan_score
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
ORDER BY orphan_score DESC, "CREATETIME" ASC
LIMIT 100;`;
  },

  // ============================================
  // CROSS-DOMAIN LINEAGE TEMPLATES
  // ============================================
  
  crossdomain_find_endpoints: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Find lineage endpoints (sources and BI)
-- Source tables (landing/raw)
SELECT 'SOURCE' AS endpoint_type, "GUID", "NAME", "TYPENAME", "CONNECTORNAME"
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND ("NAME" ILIKE '%raw%' OR "NAME" ILIKE '%landing%' OR "NAME" ILIKE '%source%')
LIMIT 30;`;
  },

  crossdomain_dbt_layer: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const sourceGuid = params.sourceGuid || params.selectedSourceGuid;
    if (!sourceGuid) {
      return `-- Select a source table first
SELECT 'Select a source table in Step 1' AS message;`;
    }
    return `-- Trace through dbt transformation layer
SELECT 
    m."GUID" AS model_guid,
    m."NAME" AS model_name,
    m."DBTMATERIALIZATION" AS materialization,
    p.f.value:"guid"::STRING AS output_guid
FROM ${db}.${schema}.DBTMODEL_ENTITY m
JOIN ${db}.${schema}.DBTPROCESS_ENTITY dp 
    ON dp."INPUTS"::STRING ILIKE '%${sourceGuid}%'
    AND dp."OUTPUTS"::STRING ILIKE '%' || m."GUID" || '%',
    LATERAL FLATTEN(INPUT => dp."OUTPUTS") f AS p
WHERE m."STATUS" = 'ACTIVE'
LIMIT 50;`;
  },

  crossdomain_bi_layer: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Find BI assets consuming transformed data
SELECT 
    'Tableau' AS bi_tool,
    d."GUID" AS guid,
    d."NAME" AS name,
    d."TYPENAME" AS type
FROM ${db}.${schema}.TABLEAUDASHBOARD_ENTITY d
WHERE d."STATUS" = 'ACTIVE'

UNION ALL

SELECT 
    'PowerBI',
    r."GUID",
    r."NAME",
    r."TYPENAME"
FROM ${db}.${schema}.POWERBIREPORT_ENTITY r
WHERE r."STATUS" = 'ACTIVE'

UNION ALL

SELECT 
    'Looker',
    d."GUID",
    d."NAME",
    d."TYPENAME"
FROM ${db}.${schema}.LOOKERDASHBOARD_ENTITY d
WHERE d."STATUS" = 'ACTIVE'
LIMIT 50;`;
  },

  crossdomain_column_lineage: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const sourceGuid = params.sourceGuid || params.selectedSourceGuid;
    if (!sourceGuid) {
      return `-- Select a source in Step 1
SELECT 'Select a source table first' AS message;`;
    }
    return `-- Column-level lineage trace
SELECT 
    cp."GUID" AS process_guid,
    cp."NAME" AS process_name,
    inp.value:"guid"::STRING AS input_column_guid,
    outp.value:"guid"::STRING AS output_column_guid
FROM ${db}.${schema}.COLUMNPROCESS_ENTITY cp,
    LATERAL FLATTEN(INPUT => cp."INPUTS") inp,
    LATERAL FLATTEN(INPUT => cp."OUTPUTS") outp
WHERE cp."STATUS" = 'ACTIVE'
  AND cp."INPUTS"::STRING ILIKE '%${sourceGuid}%'
LIMIT 100;`;
  },

  crossdomain_full_graph: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const sourceGuid = params.sourceGuid || params.selectedSourceGuid;
    const includeColumnLineage = params.includeColumnLineage;
    if (!sourceGuid) {
      return `-- Complete previous steps first
SELECT 'Complete Steps 1-4 first' AS message;`;
    }
    return `-- FULL END-TO-END LINEAGE GRAPH
-- Source: ${sourceGuid}

WITH RECURSIVE full_lineage AS (
    -- Start from source
    SELECT 
        '${sourceGuid}' AS asset_guid,
        'SOURCE' AS layer,
        0 AS depth
    
    UNION ALL
    
    -- Traverse downstream
    SELECT DISTINCT
        f.value:"guid"::STRING,
        CASE 
            WHEN f.value:"typeName"::STRING ILIKE '%dbt%' THEN 'TRANSFORM'
            WHEN f.value:"typeName"::STRING ILIKE '%dashboard%' THEN 'BI'
            WHEN f.value:"typeName"::STRING ILIKE '%report%' THEN 'BI'
            ELSE 'OTHER'
        END,
        fl.depth + 1
    FROM full_lineage fl
    JOIN ${db}.${schema}.PROCESS_ENTITY p 
        ON p."INPUTS"::STRING ILIKE '%' || fl.asset_guid || '%'
    CROSS JOIN LATERAL FLATTEN(INPUT => p."OUTPUTS") f
    WHERE fl.depth < 5
)
SELECT 
    layer,
    COUNT(DISTINCT asset_guid) AS asset_count
FROM full_lineage
GROUP BY layer
ORDER BY MIN(depth);`;
  },

  // ============================================
  // COST ATTRIBUTION TEMPLATES
  // ============================================
  
  cost_top_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Top tables by query activity (proxy for cost)
SELECT 
    "NAME" AS table_name,
    "QUERYCOUNT" AS query_count,
    "QUERYUSERCOUNT" AS unique_users,
    "SIZEBYTES" / 1024 / 1024 AS size_mb,
    "POPULARITYSCORE" AS popularity,
    "OWNERUSERS"::STRING AS owners
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND "QUERYCOUNT" IS NOT NULL
  AND "QUERYCOUNT" > 0
ORDER BY "QUERYCOUNT" DESC
LIMIT 50;`;
  },

  cost_by_user: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Query activity by user
-- Note: Requires query history data
SELECT 
    "CREATEDBY" AS username,
    COUNT(*) AS query_count,
    MIN("CREATETIME") AS first_query,
    MAX("CREATETIME") AS last_query
FROM ${db}.${schema}.QUERY_ENTITY
WHERE "STATUS" = 'ACTIVE'
GROUP BY "CREATEDBY"
ORDER BY query_count DESC
LIMIT 50;`;
  },

  cost_by_team: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Cost attribution by team/domain
SELECT 
    COALESCE(dd."NAME", 'Unassigned') AS domain_name,
    COUNT(DISTINCT t."GUID") AS table_count,
    SUM(t."QUERYCOUNT") AS total_queries,
    SUM(t."SIZEBYTES") / 1024 / 1024 / 1024 AS total_size_gb
FROM ${db}.${schema}.TABLE_ENTITY t
LEFT JOIN ${db}.${schema}.DATAPRODUCT_ENTITY dp 
    ON dp."DATAPRODUCTASSETSDSL"::STRING ILIKE '%' || t."GUID" || '%'
LEFT JOIN ${db}.${schema}.DATADOMAIN_ENTITY dd 
    ON dp."DOMAINGUIDS"::STRING ILIKE '%' || dd."GUID" || '%'
WHERE t."STATUS" = 'ACTIVE'
GROUP BY dd."NAME"
ORDER BY total_queries DESC NULLS LAST;`;
  },

  cost_expensive_queries: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Most active query patterns
-- Based on saved queries in Atlan
SELECT 
    q."NAME" AS query_name,
    q."CREATEDBY" AS author,
    LEFT(q."RAWQUERY", 200) AS query_preview,
    c."NAME" AS collection
FROM ${db}.${schema}.QUERY_ENTITY q
LEFT JOIN ${db}.${schema}.COLLECTION_ENTITY c 
    ON q."COLLECTIONQUALIFIEDNAME" = c."QUALIFIEDNAME"
WHERE q."STATUS" = 'ACTIVE'
ORDER BY q."CREATETIME" DESC
LIMIT 30;`;
  },

  cost_full_report: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- COST ATTRIBUTION SUMMARY
SELECT 
    'Total Tables' AS metric,
    COUNT(*)::VARCHAR AS value
FROM ${db}.${schema}.TABLE_ENTITY WHERE "STATUS" = 'ACTIVE'

UNION ALL

SELECT 
    'Total Queries',
    SUM("QUERYCOUNT")::VARCHAR
FROM ${db}.${schema}.TABLE_ENTITY WHERE "STATUS" = 'ACTIVE'

UNION ALL

SELECT 
    'Total Size (GB)',
    ROUND(SUM("SIZEBYTES") / 1024 / 1024 / 1024, 2)::VARCHAR
FROM ${db}.${schema}.TABLE_ENTITY WHERE "STATUS" = 'ACTIVE'

UNION ALL

SELECT 
    'Unique Query Users',
    COUNT(DISTINCT "CREATEDBY")::VARCHAR
FROM ${db}.${schema}.QUERY_ENTITY WHERE "STATUS" = 'ACTIVE';`;
  },

  // ============================================
  // FRESHNESS MONITORING TEMPLATES
  // ============================================
  
  freshness_source_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const thresholdHours = params.thresholdHours || 24;
    return `-- Source/landing table freshness
SELECT 
    "NAME" AS name,
    "QUALIFIEDNAME" AS qualified_name,
    "SOURCEUPDATEDAT" AS last_updated,
    DATEDIFF('hour', "SOURCEUPDATEDAT", CURRENT_TIMESTAMP()) AS hours_stale
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND ("NAME" ILIKE '%raw%' OR "NAME" ILIKE '%landing%' OR "NAME" ILIKE '%source%' OR "NAME" ILIKE '%stg%')
  AND "SOURCEUPDATEDAT" < DATEADD('hour', -${thresholdHours}, CURRENT_TIMESTAMP())
ORDER BY hours_stale DESC
LIMIT 50;`;
  },

  freshness_transform_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const thresholdHours = params.thresholdHours || 24;
    return `-- Transform/staging table freshness
SELECT 
    "NAME" AS name,
    "SOURCEUPDATEDAT" AS last_updated,
    DATEDIFF('hour', "SOURCEUPDATEDAT", CURRENT_TIMESTAMP()) AS hours_stale
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND ("NAME" ILIKE '%staging%' OR "NAME" ILIKE '%transform%' OR "NAME" ILIKE '%int_%')
  AND "SOURCEUPDATEDAT" < DATEADD('hour', -${thresholdHours}, CURRENT_TIMESTAMP())
ORDER BY hours_stale DESC
LIMIT 50;`;
  },

  freshness_mart_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const thresholdHours = params.thresholdHours || 24;
    return `-- Analytics/mart table freshness
SELECT 
    "NAME" AS name,
    "SOURCEUPDATEDAT" AS last_updated,
    DATEDIFF('hour', "SOURCEUPDATEDAT", CURRENT_TIMESTAMP()) AS hours_stale,
    "QUERYCOUNT" AS queries_last_30d
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  AND ("NAME" ILIKE '%mart%' OR "NAME" ILIKE '%dim_%' OR "NAME" ILIKE '%fact_%' OR "NAME" ILIKE '%agg_%')
  AND "SOURCEUPDATEDAT" < DATEADD('hour', -${thresholdHours}, CURRENT_TIMESTAMP())
ORDER BY "QUERYCOUNT" DESC NULLS LAST
LIMIT 50;`;
  },

  freshness_trace_stale: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Trace root cause of stale data
SELECT 
    t."NAME" AS table_name,
    t."SOURCEUPDATEDAT" AS last_updated,
    DATEDIFF('hour', t."SOURCEUPDATEDAT", CURRENT_TIMESTAMP()) AS hours_stale,
    t."HASLINEAGE" AS has_lineage,
    CASE 
        WHEN t."NAME" ILIKE '%raw%' OR t."NAME" ILIKE '%source%' THEN 'SOURCE'
        WHEN t."NAME" ILIKE '%staging%' OR t."NAME" ILIKE '%stg%' THEN 'STAGING'
        WHEN t."NAME" ILIKE '%mart%' OR t."NAME" ILIKE '%dim%' OR t."NAME" ILIKE '%fact%' THEN 'MART'
        ELSE 'OTHER'
    END AS pipeline_layer
FROM ${db}.${schema}.TABLE_ENTITY t
WHERE t."STATUS" = 'ACTIVE'
  AND t."SOURCEUPDATEDAT" IS NOT NULL
ORDER BY hours_stale DESC
LIMIT 50;`;
  },

  freshness_full_dashboard: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const thresholdHours = params.thresholdHours || 24;
    return `-- PIPELINE FRESHNESS DASHBOARD
WITH freshness_stats AS (
    SELECT 
        CASE 
            WHEN "NAME" ILIKE '%raw%' OR "NAME" ILIKE '%source%' OR "NAME" ILIKE '%landing%' THEN 'SOURCE'
            WHEN "NAME" ILIKE '%staging%' OR "NAME" ILIKE '%stg%' OR "NAME" ILIKE '%int_%' THEN 'STAGING'
            WHEN "NAME" ILIKE '%mart%' OR "NAME" ILIKE '%dim%' OR "NAME" ILIKE '%fact%' OR "NAME" ILIKE '%agg%' THEN 'MART'
            ELSE 'OTHER'
        END AS pipeline_layer,
        CASE 
            WHEN "SOURCEUPDATEDAT" >= DATEADD('hour', -${thresholdHours}, CURRENT_TIMESTAMP()) THEN 'FRESH'
            WHEN "SOURCEUPDATEDAT" >= DATEADD('hour', -${thresholdHours * 2}, CURRENT_TIMESTAMP()) THEN 'STALE'
            ELSE 'CRITICAL'
        END AS freshness_status
    FROM ${db}.${schema}.TABLE_ENTITY
    WHERE "STATUS" = 'ACTIVE'
      AND "SOURCEUPDATEDAT" IS NOT NULL
)
SELECT 
    pipeline_layer,
    freshness_status,
    COUNT(*) AS table_count
FROM freshness_stats
GROUP BY pipeline_layer, freshness_status
ORDER BY 
    CASE pipeline_layer WHEN 'SOURCE' THEN 1 WHEN 'STAGING' THEN 2 WHEN 'MART' THEN 3 ELSE 4 END,
    CASE freshness_status WHEN 'CRITICAL' THEN 1 WHEN 'STALE' THEN 2 ELSE 3 END;`;
  },

  // ============================================
  // TAG AUDIT TEMPLATES
  // ============================================
  
  tagaudit_list_tags: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- List propagating tags
SELECT 
    "TAGNAME" AS tag_name,
    "PROPAGATE" AS propagates,
    "PROPAGATEFROMLINEAGE" AS propagates_from_lineage,
    COUNT(DISTINCT "ENTITYGUID") AS asset_count
FROM ${db}.${schema}.TAG_RELATIONSHIP
GROUP BY "TAGNAME", "PROPAGATE", "PROPAGATEFROMLINEAGE"
ORDER BY asset_count DESC
LIMIT 50;`;
  },

  tagaudit_trace_propagation: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const tagName = params.tagName || params.selectedTagName;
    if (!tagName) {
      return `-- Select a tag in Step 1
SELECT 'Select a tag first' AS message;`;
    }
    return `-- Trace tag propagation through lineage
SELECT 
    tr."ENTITYGUID" AS asset_guid,
    t."NAME" AS asset_name,
    t."TYPENAME" AS asset_type,
    tr."TAGNAME" AS tag,
    tr."PROPAGATEFROMLINEAGE" AS inherited
FROM ${db}.${schema}.TAG_RELATIONSHIP tr
JOIN ${db}.${schema}.TABLE_ENTITY t ON tr."ENTITYGUID" = t."GUID"
WHERE tr."TAGNAME" = '${tagName}'
ORDER BY tr."PROPAGATEFROMLINEAGE" DESC, t."NAME"
LIMIT 100;`;
  },

  tagaudit_find_gaps: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const tagName = params.tagName || params.selectedTagName;
    if (!tagName) {
      return `-- Select a tag first
SELECT 'Select a tag in Step 1' AS message;`;
    }
    return `-- Find assets that should have inherited tag but didn't
-- (Assets downstream of tagged assets without the tag)
WITH tagged_assets AS (
    SELECT tr."ENTITYGUID" AS guid
    FROM ${db}.${schema}.TAG_RELATIONSHIP tr
    WHERE tr."TAGNAME" = '${tagName}'
),
downstream_assets AS (
    SELECT DISTINCT f.value:"guid"::STRING AS guid
    FROM ${db}.${schema}.PROCESS_ENTITY p,
        LATERAL FLATTEN(INPUT => p."OUTPUTS") f
    WHERE p."INPUTS"::STRING ILIKE ANY (SELECT '%' || guid || '%' FROM tagged_assets)
)
SELECT 
    t."GUID" AS guid,
    t."NAME" AS name,
    t."TYPENAME" AS type,
    'Missing: ${tagName}' AS gap
FROM downstream_assets da
JOIN ${db}.${schema}.TABLE_ENTITY t ON da.guid = t."GUID"
WHERE da.guid NOT IN (SELECT guid FROM tagged_assets)
  AND t."STATUS" = 'ACTIVE'
LIMIT 50;`;
  },

  tagaudit_full_report: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const tagName = params.tagName || params.selectedTagName || 'ALL';
    return `-- TAG PROPAGATION AUDIT REPORT
SELECT 
    "TAGNAME" AS tag,
    COUNT(DISTINCT "ENTITYGUID") AS total_tagged,
    SUM(CASE WHEN "PROPAGATEFROMLINEAGE" = TRUE THEN 1 ELSE 0 END) AS inherited_count,
    SUM(CASE WHEN "PROPAGATE" = TRUE THEN 1 ELSE 0 END) AS propagating_count
FROM ${db}.${schema}.TAG_RELATIONSHIP
${tagName !== 'ALL' ? `WHERE "TAGNAME" = '${tagName}'` : ''}
GROUP BY "TAGNAME"
ORDER BY total_tagged DESC
LIMIT 30;`;
  },

  // ============================================
  // SCHEMA CHANGE IMPACT TEMPLATES
  // ============================================
  
  schemachange_list_tables: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const searchTerm = params.searchTerm || '';
    return `-- Select table to analyze for schema change impact
SELECT 
    "GUID" AS guid,
    "NAME" AS name,
    "SCHEMANAME" AS schema_name,
    "DATABASENAME" AS database_name,
    "COLUMNCOUNT" AS column_count,
    "HASLINEAGE" AS has_lineage
FROM ${db}.${schema}.TABLE_ENTITY
WHERE "STATUS" = 'ACTIVE'
  ${searchTerm ? `AND "NAME" ILIKE '%${searchTerm}%'` : ''}
ORDER BY "HASLINEAGE" DESC, "COLUMNCOUNT" DESC
LIMIT 50;`;
  },

  schemachange_list_columns: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const tableGuid = params.tableGuid || params.selectedTableGuid;
    if (!tableGuid) {
      return `-- Select a table in Step 1
SELECT 'Select a table first' AS message;`;
    }
    return `-- List columns for selected table
SELECT 
    c."GUID" AS guid,
    c."NAME" AS name,
    c."DATATYPE" AS data_type,
    c."ISPRIMARYKEY" AS is_pk,
    c."ISFOREIGNKEY" AS is_fk,
    c."ORDER" AS position
FROM ${db}.${schema}.COLUMN_ENTITY c
JOIN ${db}.${schema}.TABLE_ENTITY t ON c."TABLEQUALIFIEDNAME" = t."QUALIFIEDNAME"
WHERE c."STATUS" = 'ACTIVE'
  AND t."GUID" = '${tableGuid}'
ORDER BY c."ORDER"
LIMIT 100;`;
  },

  schemachange_column_consumers: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const columnGuids = params.columnGuids || params.selectedColumnGuids || [];
    if (!columnGuids || columnGuids.length === 0) {
      return `-- Select columns in Step 2
SELECT 'Select columns to analyze' AS message;`;
    }
    const guidList = Array.isArray(columnGuids) ? columnGuids.join("','") : columnGuids;
    return `-- Find consumers of selected columns
SELECT 
    cp."GUID" AS process_guid,
    cp."NAME" AS process_name,
    outp.value:"guid"::STRING AS output_column,
    outp.value:"typeName"::STRING AS output_type
FROM ${db}.${schema}.COLUMNPROCESS_ENTITY cp,
    LATERAL FLATTEN(INPUT => cp."OUTPUTS") outp
WHERE cp."STATUS" = 'ACTIVE'
  AND cp."INPUTS"::STRING ILIKE ANY (SELECT '%' || value || '%' FROM TABLE(FLATTEN(INPUT => PARSE_JSON('["${guidList}"]'))))
LIMIT 100;`;
  },

  schemachange_bi_impact: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    return `-- Find BI reports that might break from schema changes
-- Based on column-level lineage to BI assets
SELECT 
    d."GUID" AS report_guid,
    d."NAME" AS report_name,
    d."TYPENAME" AS report_type,
    d."CONNECTIONNAME" AS bi_tool
FROM ${db}.${schema}.TABLEAUDASHBOARD_ENTITY d
WHERE d."STATUS" = 'ACTIVE'

UNION ALL

SELECT 
    r."GUID",
    r."NAME",
    r."TYPENAME",
    r."CONNECTIONNAME"
FROM ${db}.${schema}.POWERBIREPORT_ENTITY r
WHERE r."STATUS" = 'ACTIVE'
LIMIT 50;`;
  },

  schemachange_impact_summary: (params) => {
    const db = params.database || 'FIELD_METADATA';
    const schema = params.schema || 'PUBLIC';
    const tableGuid = params.tableGuid || params.selectedTableGuid;
    return `-- SCHEMA CHANGE IMPACT SUMMARY
-- Table: ${tableGuid || 'Not selected'}

SELECT 
    'Direct Downstream Processes' AS impact_category,
    COUNT(DISTINCT p."GUID") AS count
FROM ${db}.${schema}.PROCESS_ENTITY p
WHERE p."INPUTS"::STRING ILIKE '%${tableGuid || ''}%'

UNION ALL

SELECT 
    'Downstream Tables',
    COUNT(DISTINCT f.value:"guid"::STRING)
FROM ${db}.${schema}.PROCESS_ENTITY p,
    LATERAL FLATTEN(INPUT => p."OUTPUTS") f
WHERE p."INPUTS"::STRING ILIKE '%${tableGuid || ''}%'
  AND f.value:"typeName"::STRING ILIKE '%Table%'

UNION ALL

SELECT 
    'Downstream Columns',
    COUNT(DISTINCT f.value:"guid"::STRING)
FROM ${db}.${schema}.COLUMNPROCESS_ENTITY cp,
    LATERAL FLATTEN(INPUT => cp."OUTPUTS") f
WHERE cp."INPUTS"::STRING ILIKE '%${tableGuid || ''}%';`;
  },
};

/**
 * Get a SQL template by ID
 */
export function getSqlTemplate(queryId) {
  return SQL_TEMPLATES[queryId] || null;
}

/**
 * Build a FlowStep from a recipe step definition
 * 
 * @param {Object} step - Step definition from recipe
 * @param {number} stepIndex - Index of this step
 * @param {string|null} nextStepId - ID of the next step
 * @param {Object} [systemConfig] - SystemConfig for entity resolution
 */
function buildFlowStep(step, stepIndex, nextStepId, systemConfig = null) {
  const template = getSqlTemplate(step.queryId);
  
  // Template may be missing - handled gracefully in buildQuery
  
  return {
    id: step.id,
    title: step.title || `Step ${stepIndex + 1}`,
    description: step.description || '',
    optional: !!step.optional,
    
    /**
     * Build SQL from template + inputs
     * 
     * Uses SystemConfig when available to resolve entity locations.
     */
    buildQuery: (entity, inputs) => {
      if (!template) {
        return `-- Missing SQL template for: ${step.queryId}
-- Add this template to SQL_TEMPLATES in recipeBuilder.js`;
      }
      
      // Get metadata context from SystemConfig
      const meta = getMetadataContext(inputs.systemConfig || systemConfig);
      
      // Build params from entity + inputs + inputBindings
      const params = {
        entity,
        entityGuid: entity?.guid,
        entityName: entity?.name,
        entityType: entity?.type,
        database: entity?.database || inputs.database || meta.db,
        schema: entity?.schema || inputs.schema || meta.schema,
        systemConfig: inputs.systemConfig || systemConfig,
        ...inputs,
      };
      
      // Apply input bindings (map wizard inputs to template params)
      if (step.inputBindings) {
        for (const [paramKey, inputKey] of Object.entries(step.inputBindings)) {
          if (inputs[inputKey] !== undefined) {
            params[paramKey] = inputs[inputKey];
          }
        }
      }
      
      return template(params);
    },
    
    /**
     * Extract data for next step using generic extractors
     */
    extractDataForNext: buildExtractorFromBindings(step.outputBindings),
    
    nextStep: nextStepId,
    shouldSkip: step.shouldSkip || null,
    skipMessage: step.skipMessage || '',
  };
}

/**
 * Build a complete MultiStepFlow from a recipe
 * 
 * @param {Object} recipe - The recipe definition
 * @param {Object} [systemConfig] - Optional SystemConfig for config-driven entity resolution
 */
export function buildFlowFromRecipe(recipe, systemConfig = null) {
  if (!recipe || !recipe.steps) {
    return null;
  }
  
  // Build steps with proper next step linking
  const steps = recipe.steps.map((step, index) => {
    const nextStepId = recipe.steps[index + 1]?.id || null;
    return buildFlowStep(step, index, nextStepId, systemConfig);
  });
  
  /** @type {import('./types').MultiStepFlow} */
  const flow = {
    id: recipe.id,
    label: recipe.label,
    description: recipe.description,
    icon: recipe.icon,
    supportedEntityTypes: recipe.supportedEntityTypes || ['UNKNOWN'],
    domains: recipe.domains || [],
    intent: recipe.intent,
    steps,
    
    buildInitialInputs: (entity, availableTables = [], config = null) => {
      // Use SystemConfig to determine default db/schema
      const meta = getMetadataContext(config || systemConfig);
      
      return {
        // Standard entity context
        entityGuid: entity?.guid,
        entityName: entity?.name,
        entityType: entity?.type,
        database: entity?.database || meta.db,
        schema: entity?.schema || meta.schema,
        availableTables,
        
        // Pass systemConfig through for step builders
        systemConfig: config || systemConfig,
        
        // Recipe-specific defaults
        ...(recipe.defaultInputs || {}),
      };
    },
  };
  
  return flow;
}

/**
 * Register a custom SQL template
 */
export function registerSqlTemplate(queryId, templateFn) {
  SQL_TEMPLATES[queryId] = templateFn;
}

export default {
  buildFlowFromRecipe,
  getSqlTemplate,
  registerSqlTemplate,
};

