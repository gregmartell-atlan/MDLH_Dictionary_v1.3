/**
 * MDLH User Research Queries
 * 
 * Consolidated metadata lakehouse queries from Slack user research, 
 * Confluence docs, and internal implementations.
 * 
 * Sources:
 * - Himanshu - Conversational Search Analysis (~600 user questions)
 * - Priyanjna - Medtronic Implementation
 * - Ben Hudson - Thursday Demos
 * - Shubham - Fox Workshop Notes
 * - Peter Ebert - Python NetworkX Approach
 * - Internal MDLH Documentation
 */

// =============================================================================
// QUERY FREQUENCY LEVELS
// =============================================================================

export const FREQUENCY_LEVELS = {
  VERY_HIGH: 'Very High',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

// Frequency badge styling
export const FREQUENCY_STYLES = {
  'Very High': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
  'High': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' },
  'Medium': { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
  'Low': { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' },
};

// =============================================================================
// CATEGORY DEFINITIONS
// =============================================================================

export const USER_QUERY_CATEGORIES = [
  // Original categories
  { name: 'Asset Discovery', percentage: '~25%', color: '#3b82f6' },
  { name: 'Count & Statistics', percentage: '~20%', color: '#a855f7' },
  { name: 'Usage & Popularity', percentage: '~15%', color: '#22c55e' },
  { name: 'Data Lineage', percentage: '~12%', color: '#f97316' },
  { name: 'Glossary & Terms', percentage: '~10%', color: '#ec4899' },
  { name: 'Governance & Ownership', percentage: '~8%', color: '#ef4444' },
  { name: 'Data Quality', percentage: '~3%', color: '#eab308' },
  { name: 'Domain-Specific', percentage: '~5%', color: '#14b8a6' },
  { name: 'Column Metadata', percentage: 'Export', color: '#6366f1' },
  { name: 'Duplicate Detection', percentage: 'Governance', color: '#f43f5e' },
  { name: 'Storage Analysis', percentage: 'Optimization', color: '#06b6d4' },
  { name: 'Query Organization', percentage: 'Fox Use Case', color: '#f59e0b' },
  // New categories
  { name: 'BI Tools', percentage: 'BI Coverage', color: '#8b5cf6' },
  { name: 'dbt', percentage: 'Transform', color: '#10b981' },
  { name: 'Orchestration', percentage: 'Pipelines', color: '#0ea5e9' },
  { name: 'Cloud Storage', percentage: 'S3/ADLS/GCS', color: '#f472b6' },
  { name: 'AI/ML', percentage: 'Models', color: '#84cc16' },
  { name: 'Data Mesh', percentage: 'Contracts', color: '#d946ef' },
  { name: 'Connections', percentage: 'Sources', color: '#64748b' },
  { name: 'Snowflake Features', percentage: 'Native', color: '#06b6d4' },
  { name: 'Schema Exploration', percentage: 'Browse', color: '#f59e0b' },
  { name: 'Cross-Connector', percentage: 'Analytics', color: '#6366f1' },
  { name: 'Data Freshness', percentage: 'Monitor', color: '#22c55e' },
  { name: 'Certification', percentage: 'Status', color: '#3b82f6' },
  { name: 'Custom Metadata', percentage: 'Attributes', color: '#ec4899' },
  { name: 'Tag Analysis', percentage: 'Tags', color: '#eab308' },
  { name: 'Views', percentage: 'Views/MVs', color: '#14b8a6' },
];

// =============================================================================
// USER RESEARCH QUERIES
// =============================================================================

export const USER_RESEARCH_QUERIES = [
  // ---------------------------------------------------------------------------
  // Asset Discovery (~25% of user questions)
  // ---------------------------------------------------------------------------
  {
    id: 'discovery-1',
    category: 'Asset Discovery',
    name: 'Show All Verified Tables',
    description: 'Find tables with verified certificate status - most common user query',
    userIntent: 'Show me all verified tables',
    frequency: 'Very High',
    frequencyDetail: '~25%',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    SCHEMANAME,
    DATABASENAME,
    CONNECTIONNAME,
    USERDESCRIPTION,
    OWNERUSERS,
    STATUSMESSAGE,
    UPDATETIME
FROM TABLE_ENTITY
WHERE STATUSMESSAGE IS NOT NULL
  AND STATUS = 'ACTIVE'
ORDER BY UPDATETIME DESC;`,
  },
  {
    id: 'discovery-2',
    category: 'Asset Discovery',
    name: 'Find Assets by Data Source',
    description: 'Search for assets from a specific connector or integration',
    userIntent: 'What assets for Zoominfo do we have?',
    frequency: 'High',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    TYPENAME,
    QUALIFIEDNAME,
    CONNECTORNAME,
    CONNECTIONNAME,
    STATUS
FROM TABLE_ENTITY
WHERE LOWER(CONNECTIONNAME) LIKE '%{{source}}%'
   OR LOWER(DATABASENAME) LIKE '%{{source}}%'
   OR LOWER(NAME) LIKE '%{{source}}%'
ORDER BY TYPENAME, NAME;`,
  },
  {
    id: 'discovery-3',
    category: 'Asset Discovery',
    name: 'Find Assets by Database',
    description: 'Get all Snowflake assets for a specific database',
    userIntent: 'Give Snowflake assets for database GPDP_PROD_DB',
    frequency: 'High',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    t.NAME AS table_name,
    t.SCHEMANAME,
    t.TYPENAME,
    COUNT(c.GUID) AS column_count,
    t.ROWCOUNT,
    t.STATUS
FROM TABLE_ENTITY t
LEFT JOIN COLUMN_ENTITY c ON c.TABLEQUALIFIEDNAME = t.QUALIFIEDNAME
WHERE t.DATABASENAME = '{{database}}'
  AND t.CONNECTORNAME = 'snowflake'
  AND t.STATUS = 'ACTIVE'
GROUP BY t.NAME, t.SCHEMANAME, t.TYPENAME, t.ROWCOUNT, t.STATUS
ORDER BY t.SCHEMANAME, t.NAME;`,
  },

  // ---------------------------------------------------------------------------
  // Count & Statistics (~20% of user questions)
  // ---------------------------------------------------------------------------
  {
    id: 'stats-1',
    category: 'Count & Statistics',
    name: 'Total Table Count',
    description: 'Simple count of all tables in the environment',
    userIntent: 'How many tables are there?',
    frequency: 'Very High',
    frequencyDetail: '~20%',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    COUNT(*) AS total_tables
FROM TABLE_ENTITY
WHERE STATUS = 'ACTIVE';`,
  },
  {
    id: 'stats-2',
    category: 'Count & Statistics',
    name: 'Asset Counts by Connector',
    description: 'Count of Snowflake assets grouped by database',
    userIntent: 'Give count of Snowflake assets for GPDP',
    frequency: 'High',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    CONNECTORNAME,
    DATABASENAME,
    COUNT(*) AS asset_count
FROM TABLE_ENTITY
WHERE CONNECTORNAME = 'snowflake'
  AND DATABASENAME LIKE '%{{filter}}%'
  AND STATUS = 'ACTIVE'
GROUP BY CONNECTORNAME, DATABASENAME
ORDER BY asset_count DESC;`,
  },
  {
    id: 'stats-3',
    category: 'Count & Statistics',
    name: 'Database Count in Environment',
    description: 'Count distinct databases across all connectors',
    userIntent: 'Database count in this environment',
    frequency: 'High',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    CONNECTORNAME,
    COUNT(DISTINCT DATABASENAME) AS database_count,
    COUNT(DISTINCT SCHEMANAME) AS schema_count,
    COUNT(*) AS total_tables
FROM TABLE_ENTITY
WHERE STATUS = 'ACTIVE'
GROUP BY CONNECTORNAME
ORDER BY total_tables DESC;`,
  },
  {
    id: 'stats-4',
    category: 'Count & Statistics',
    name: 'All MDLH Entity Types with Row Counts',
    description: 'List all available entity types and their volume',
    userIntent: 'What data is available in MDLH?',
    frequency: 'Medium',
    source: 'Internal - MDLH Documentation',
    confidence: 'high',
    sql: `SELECT 
    TABLE_NAME AS entity_type,
    ROW_COUNT,
    ROUND(BYTES / 1024 / 1024, 2) AS size_mb
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'PUBLIC'
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY ROW_COUNT DESC;`,
  },

  // ---------------------------------------------------------------------------
  // Usage & Popularity (~15% of user questions)
  // ---------------------------------------------------------------------------
  {
    id: 'usage-1',
    category: 'Usage & Popularity',
    name: 'Most Queried Tables Last Month',
    description: 'Tables ranked by query count over the past month',
    userIntent: 'What are the most queried tables last month?',
    frequency: 'High',
    frequencyDetail: '~15%',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    SCHEMANAME,
    DATABASENAME,
    QUERYCOUNT,
    QUERYUSERCOUNT,
    QUERYCOUNTUPDATEDAT,
    POPULARITYSCORE
FROM TABLE_ENTITY
WHERE QUERYCOUNT > 0
  AND QUERYCOUNTUPDATEDAT >= DATEADD(month, -1, CURRENT_DATE())
  AND STATUS = 'ACTIVE'
ORDER BY QUERYCOUNT DESC
LIMIT 50;`,
  },
  {
    id: 'usage-2',
    category: 'Usage & Popularity',
    name: 'Unused Assets (Low Query Count)',
    description: 'Find assets that are not frequently used',
    userIntent: 'Which assets are not frequently used?',
    frequency: 'Medium',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    CONNECTORNAME,
    DATABASENAME,
    SCHEMANAME,
    QUERYCOUNT,
    SOURCELASTREADAT,
    CREATETIME
FROM TABLE_ENTITY
WHERE (QUERYCOUNT IS NULL OR QUERYCOUNT = 0)
  AND STATUS = 'ACTIVE'
  AND CREATETIME < DATEADD(month, -3, CURRENT_DATE())
ORDER BY CREATETIME ASC
LIMIT 100;`,
  },
  {
    id: 'usage-3',
    category: 'Usage & Popularity',
    name: 'Most Queried Assets This Week',
    description: 'Recent high-activity assets',
    userIntent: 'What are the most queried assets this week?',
    frequency: 'Medium',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    TYPENAME,
    QUERYCOUNT,
    QUERYUSERCOUNT,
    POPULARITYSCORE,
    SOURCEREADCOUNT,
    SOURCELASTREADAT
FROM TABLE_ENTITY
WHERE SOURCELASTREADAT >= DATEADD(week, -1, CURRENT_DATE())
  AND STATUS = 'ACTIVE'
ORDER BY QUERYCOUNT DESC
LIMIT 25;`,
  },

  // ---------------------------------------------------------------------------
  // Data Lineage (~12% of user questions)
  // ---------------------------------------------------------------------------
  {
    id: 'lineage-1',
    category: 'Data Lineage',
    name: 'Direct Upstream Assets (1 Hop)',
    description: 'Find immediate upstream dependencies for a given asset',
    userIntent: 'Show lineage for [specific table]',
    frequency: 'High',
    frequencyDetail: '~12%',
    source: 'Internal - MDLH Documentation',
    confidence: 'high',
    sql: `-- Replace {{GUID}} with target asset GUID
-- INPUTS/OUTPUTS are ARRAY - cast to STRING for search
SELECT 
    P.GUID AS process_guid,
    P.NAME AS process_name,
    P.SQL AS transformation_sql,
    P.INPUTS::STRING AS upstream_assets,
    P.OUTPUTS::STRING AS downstream_assets
FROM PROCESS_ENTITY P
WHERE P.OUTPUTS::STRING ILIKE '%{{GUID}}%'
LIMIT 50;`,
  },
  {
    id: 'lineage-2',
    category: 'Data Lineage',
    name: 'Direct Downstream Assets (1 Hop)',
    description: 'Find immediate downstream impacts for a given asset',
    userIntent: 'Can you show downstream tables connected to billing_materialized_view?',
    frequency: 'High',
    source: 'Internal - MDLH Documentation',
    confidence: 'high',
    sql: `-- Replace {{GUID}} with target asset GUID
-- INPUTS/OUTPUTS are ARRAY - cast to STRING for search
SELECT 
    P.GUID AS process_guid,
    P.NAME AS process_name,
    P.INPUTS::STRING AS upstream_assets,
    P.OUTPUTS::STRING AS downstream_assets
FROM PROCESS_ENTITY P
WHERE P.INPUTS::STRING ILIKE '%{{GUID}}%'
LIMIT 50;`,
  },
  {
    id: 'lineage-3',
    category: 'Data Lineage',
    name: 'Multi-Hop Downstream Lineage (Recursive CTE)',
    description: 'Traverse multiple levels of downstream lineage - WARNING: Can be expensive',
    userIntent: 'Show all downstream assets for bronze_gco_clear_dtl_general',
    frequency: 'Medium',
    warning: 'Recursive lineage queries can be expensive. Engineering is working on a more scalable approach. Consider Python + NetworkX for complex traversals.',
    source: 'Ben Hudson - Thursday Demo + Peter Ebert Warning',
    confidence: 'medium',
    sql: `-- WARNING: Recursive CTEs can cause high compute costs
-- Consider using Python + NetworkX for complex lineage (see Peter Ebert's approach)
-- INPUTS/OUTPUTS are ARRAY - cast to STRING for search
WITH RECURSIVE lineage_cte AS (
    -- Base case: direct downstream
    SELECT 
        P.GUID AS process_guid,
        P.NAME AS process_name,
        f.value:guid::STRING AS asset_guid,
        1 AS hop_level
    FROM PROCESS_ENTITY P,
         LATERAL FLATTEN(P.OUTPUTS) f
    WHERE P.INPUTS::STRING ILIKE '%{{START_GUID}}%'
    
    UNION ALL
    
    -- Recursive case: next hop
    SELECT 
        P.GUID,
        P.NAME,
        f.value:guid::STRING,
        L.hop_level + 1
    FROM PROCESS_ENTITY P,
         LATERAL FLATTEN(P.OUTPUTS) f
    JOIN lineage_cte L ON P.INPUTS::STRING ILIKE '%' || L.asset_guid || '%'
    WHERE L.hop_level < 5  -- LIMIT RECURSION DEPTH!
)
SELECT DISTINCT asset_guid, hop_level
FROM lineage_cte
ORDER BY hop_level;`,
  },
  {
    id: 'lineage-4',
    category: 'Data Lineage',
    name: 'Assets with Lineage Flag',
    description: 'Find assets that have lineage information available',
    userIntent: 'Which tables have lineage?',
    frequency: 'Medium',
    source: 'Internal - MDLH Documentation',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    HASLINEAGE,
    TYPENAME,
    CONNECTORNAME
FROM TABLE_ENTITY
WHERE HASLINEAGE = TRUE
  AND STATUS = 'ACTIVE'
ORDER BY CONNECTORNAME, NAME;`,
  },

  // ---------------------------------------------------------------------------
  // Glossary & Terms (~10% of user questions)
  // ---------------------------------------------------------------------------
  {
    id: 'glossary-1',
    category: 'Glossary & Terms',
    name: 'Get Term Definition',
    description: 'Look up the definition of a business term',
    userIntent: 'What is Customer ID?',
    frequency: 'High',
    frequencyDetail: '~10%',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `-- ANCHOR is an OBJECT - extract guid field for join
SELECT 
    gt.NAME AS term_name,
    gt.USERDESCRIPTION AS definition,
    gt.STATUS,
    g.NAME AS glossary_name
FROM ATLASGLOSSARYTERM_ENTITY gt
LEFT JOIN ATLASGLOSSARY_ENTITY g ON gt.ANCHOR:guid::STRING = g.GUID
WHERE LOWER(gt.NAME) LIKE '%{{term}}%'
   OR LOWER(gt.DISPLAYNAME) LIKE '%{{term}}%';`,
  },
  {
    id: 'glossary-2',
    category: 'Glossary & Terms',
    name: 'Explain Business Term',
    description: 'Get comprehensive term details with examples',
    userIntent: 'Explain term Buy Channel',
    frequency: 'Medium',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `-- ANCHOR and CATEGORIES are OBJECT/ARRAY - extract guid field
SELECT 
    gt.NAME,
    gt.DISPLAYNAME,
    gt.USERDESCRIPTION AS definition,
    gt.EXAMPLES,
    gt.USAGE,
    gt.ABBREVIATION,
    gt.STATUS,
    gt.OWNERUSERS,
    g.NAME AS glossary_name,
    gc.NAME AS category_name
FROM ATLASGLOSSARYTERM_ENTITY gt
LEFT JOIN ATLASGLOSSARY_ENTITY g ON gt.ANCHOR:guid::STRING = g.GUID
LEFT JOIN ATLASGLOSSARYCATEGORY_ENTITY gc ON gt.CATEGORIES[0]:guid::STRING = gc.GUID
WHERE LOWER(gt.NAME) = '{{term}}';`,
  },
  {
    id: 'glossary-3',
    category: 'Glossary & Terms',
    name: 'Verified Terms with Definitions',
    description: 'Export all verified glossary terms for documentation',
    userIntent: 'Export all verified terms',
    frequency: 'Medium',
    source: 'Internal - Fox Use Case',
    confidence: 'high',
    sql: `-- ANCHOR is an OBJECT - extract guid field for join
SELECT 
    gt.NAME AS term_name,
    gt.USERDESCRIPTION AS definition,
    gt.ABBREVIATION,
    gt.EXAMPLES,
    gt.STATUS,
    g.NAME AS glossary_name,
    gt.OWNERUSERS
FROM ATLASGLOSSARYTERM_ENTITY gt
JOIN ATLASGLOSSARY_ENTITY g ON gt.ANCHOR:guid::STRING = g.GUID
WHERE gt.STATUS = 'ACTIVE'
ORDER BY g.NAME, gt.NAME;`,
  },

  // ---------------------------------------------------------------------------
  // Governance & Ownership (~8% of user questions)
  // ---------------------------------------------------------------------------
  {
    id: 'governance-1',
    category: 'Governance & Ownership',
    name: 'Find Data Owners',
    description: 'Find who owns assets in a specific domain',
    userIntent: 'Who owns finance data?',
    frequency: 'High',
    frequencyDetail: '~8%',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    OWNERUSERS,
    OWNERGROUPS,
    ADMINUSERS,
    DATABASENAME,
    SCHEMANAME,
    STATUS
FROM TABLE_ENTITY
WHERE LOWER(DATABASENAME) LIKE '%{{domain}}%'
   OR LOWER(SCHEMANAME) LIKE '%{{domain}}%'
   OR LOWER(NAME) LIKE '%{{domain}}%'
ORDER BY OWNERUSERS, NAME;`,
  },
  {
    id: 'governance-2',
    category: 'Governance & Ownership',
    name: 'Current Owner/Steward of Database',
    description: 'Find who is responsible for maintaining a database',
    userIntent: 'Who is the current owner or steward of the WIP_Sustainability database?',
    frequency: 'Medium',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    OWNERUSERS,
    OWNERGROUPS,
    ADMINUSERS,
    ADMINGROUPS,
    DESCRIPTION,
    USERDESCRIPTION
FROM DATABASE_ENTITY
WHERE NAME = '{{database}}';`,
  },
  {
    id: 'governance-3',
    category: 'Governance & Ownership',
    name: 'PII Tagged Assets',
    description: 'Find all assets tagged with PII classifications',
    userIntent: 'Which assets contain PII data?',
    frequency: 'Medium',
    source: 'Internal - Governance Use Cases',
    confidence: 'high',
    sql: `SELECT 
    t.NAME,
    t.QUALIFIEDNAME,
    t.SCHEMANAME,
    tr.TAGNAME,
    tr.TAGVALUE
FROM TABLE_ENTITY t
JOIN TAG_RELATIONSHIP tr ON t.GUID = tr.ENTITYGUID
WHERE tr.TAGNAME LIKE '%PII%'
   OR tr.TAGNAME LIKE '%Sensitive%'
   OR tr.TAGNAME LIKE '%Confidential%'
ORDER BY tr.TAGNAME, t.NAME;`,
  },

  // ---------------------------------------------------------------------------
  // Data Quality (~3% of user questions)
  // ---------------------------------------------------------------------------
  {
    id: 'quality-1',
    category: 'Data Quality',
    name: 'Assets Missing Descriptions',
    description: 'Find critical assets that lack documentation',
    userIntent: 'Which assets have missing descriptions?',
    frequency: 'Medium',
    frequencyDetail: '~3%',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    TYPENAME,
    CONNECTORNAME,
    OWNERUSERS,
    STATUS,
    CREATETIME
FROM TABLE_ENTITY
WHERE (USERDESCRIPTION IS NULL OR USERDESCRIPTION = '')
  AND (DESCRIPTION IS NULL OR DESCRIPTION = '')
  AND STATUS = 'ACTIVE'
ORDER BY CREATETIME DESC
LIMIT 100;`,
  },
  {
    id: 'quality-2',
    category: 'Data Quality',
    name: 'Critical Assets Missing Descriptions',
    description: 'Find verified/critical assets without documentation',
    userIntent: 'List critical assets with missing descriptions',
    frequency: 'Medium',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    STATUS,
    OWNERUSERS,
    CONNECTORNAME
FROM TABLE_ENTITY
WHERE STATUS IN ('VERIFIED', 'DRAFT')
  AND (USERDESCRIPTION IS NULL OR USERDESCRIPTION = '')
  AND STATUS = 'ACTIVE'
ORDER BY STATUS, NAME;`,
  },
  {
    id: 'quality-3',
    category: 'Data Quality',
    name: 'Governance Completeness Check',
    description: 'Find tables missing key governance metadata',
    userIntent: 'What tables lack proper governance?',
    frequency: 'Medium',
    source: 'Internal - Tag Compliance Checks',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    CASE WHEN USERDESCRIPTION IS NULL OR USERDESCRIPTION = '' THEN 'Missing' ELSE 'Has' END AS description_status,
    CASE WHEN OWNERUSERS IS NULL THEN 'Missing' ELSE 'Has' END AS owner_status,
    CASE WHEN STATUS IS NULL THEN 'Missing' ELSE STATUS END AS certificate_status
FROM TABLE_ENTITY
WHERE STATUS = 'ACTIVE'
  AND (
    USERDESCRIPTION IS NULL 
    OR USERDESCRIPTION = ''
    OR OWNERUSERS IS NULL
    OR STATUS IS NULL
  )
ORDER BY NAME;`,
  },

  // ---------------------------------------------------------------------------
  // Domain-Specific (~5% of user questions)
  // ---------------------------------------------------------------------------
  {
    id: 'domain-1',
    category: 'Domain-Specific',
    name: 'Data Products by Domain',
    description: 'Find data products in a specific business domain',
    userIntent: 'What merchant data products are there?',
    frequency: 'Medium',
    source: 'Himanshu - Conversational Search Analysis',
    confidence: 'high',
    sql: `SELECT 
    dp.NAME AS product_name,
    dp.USERDESCRIPTION,
    dp.STATUS,
    dp.STATUS,
    dd.NAME AS domain_name
FROM DATAPRODUCT_ENTITY dp
LEFT JOIN DATADOMAIN_ENTITY dd ON dp.DOMAINGUIDS LIKE '%' || dd.GUID || '%'
WHERE LOWER(dp.NAME) LIKE '%{{domain}}%'
   OR LOWER(dd.NAME) LIKE '%{{domain}}%'
ORDER BY dp.NAME;`,
  },

  // ---------------------------------------------------------------------------
  // Column Metadata (Export use cases)
  // ---------------------------------------------------------------------------
  {
    id: 'column-1',
    category: 'Column Metadata',
    name: 'Full Column Metadata with Custom Metadata & Tags',
    description: 'Comprehensive column-level extraction including all enrichment - THE BIG ONE',
    userIntent: 'Give me all column metadata for Snowflake/Glue',
    frequency: 'High',
    frequencyDetail: 'Customer Exports',
    source: 'Priyanjna - Medtronic Implementation',
    confidence: 'high',
    sql: `WITH FILTERED_COLUMNS AS (
    SELECT GUID
    FROM COLUMN_ENTITY
    WHERE CONNECTORNAME IN ('glue', 'snowflake')
),
CM_AGG AS (
    SELECT
        CM.ENTITYGUID,
        ARRAY_AGG(DISTINCT OBJECT_CONSTRUCT(
            'set_name', SETDISPLAYNAME,
            'field_name', ATTRIBUTEDISPLAYNAME,
            'field_value', ATTRIBUTEVALUE
        )) AS CUSTOM_METADATA_JSON
    FROM CUSTOMMETADATA_RELATIONSHIP CM
    JOIN FILTERED_COLUMNS FC ON CM.ENTITYGUID = FC.GUID
    GROUP BY CM.ENTITYGUID
),
TR_AGG AS (
    SELECT
        TR.ENTITYGUID,
        '[' || LISTAGG(
            OBJECT_CONSTRUCT('name', TR.TAGNAME, 'value', TR.TAGVALUE)::STRING, ','
        ) WITHIN GROUP (ORDER BY TR.TAGNAME) || ']' AS TAG_JSON
    FROM TAG_RELATIONSHIP TR
    JOIN FILTERED_COLUMNS FC ON TR.ENTITYGUID = FC.GUID
    GROUP BY TR.ENTITYGUID
)
SELECT
    COL.NAME AS col_name,
    COL.QUALIFIEDNAME,
    COL.GUID,
    COL.DISPLAYNAME,
    COL.DESCRIPTION,
    COL.USERDESCRIPTION,
    COL.CONNECTORNAME,
    COL.CONNECTIONNAME,
    COL.DATABASENAME,
    COL.SCHEMANAME,
    COL.TABLENAME,
    COL.DATATYPE,
    COL."ORDER" AS ordinal_position,
    TR_AGG.TAG_JSON,
    CM_AGG.CUSTOM_METADATA_JSON,
    COL.STATUS,
    COL.OWNERUSERS,
    COL.OWNERGROUPS,
    COL.ISPROFILED,
    COL.COLUMNDISTINCTVALUESCOUNT,
    COL.COLUMNMAX,
    COL.COLUMNMIN,
    COL.COLUMNMEAN
FROM COLUMN_ENTITY COL
LEFT JOIN CM_AGG ON COL.GUID = CM_AGG.ENTITYGUID
LEFT JOIN TR_AGG ON COL.GUID = TR_AGG.ENTITYGUID
WHERE COL.CONNECTORNAME IN ('glue', 'snowflake')
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Duplicate Detection (Governance)
  // ---------------------------------------------------------------------------
  {
    id: 'duplicate-1',
    category: 'Duplicate Detection',
    name: 'Duplicate Glossary Terms',
    description: 'Find glossary terms with similar names across glossaries',
    userIntent: 'Are there duplicate term definitions?',
    frequency: 'Medium',
    source: 'Internal - Duplicate Detection',
    confidence: 'high',
    sql: `-- ANCHOR is an OBJECT - extract guid field for join
SELECT 
    gt1.NAME AS term_name,
    gt1.GUID AS term1_guid,
    g1.NAME AS glossary1,
    gt2.GUID AS term2_guid,
    g2.NAME AS glossary2
FROM ATLASGLOSSARYTERM_ENTITY gt1
JOIN ATLASGLOSSARYTERM_ENTITY gt2 ON LOWER(gt1.NAME) = LOWER(gt2.NAME) AND gt1.GUID < gt2.GUID
LEFT JOIN ATLASGLOSSARY_ENTITY g1 ON gt1.ANCHOR:guid::STRING = g1.GUID
LEFT JOIN ATLASGLOSSARY_ENTITY g2 ON gt2.ANCHOR:guid::STRING = g2.GUID
ORDER BY gt1.NAME;`,
  },
  {
    id: 'duplicate-2',
    category: 'Duplicate Detection',
    name: 'Duplicate BI Metrics',
    description: 'Find metrics with similar names that may be duplicates',
    userIntent: 'Are there duplicate metrics defined?',
    frequency: 'Low',
    source: 'Internal - Duplicate Detection',
    confidence: 'medium',
    sql: `SELECT 
    m1.NAME AS metric_name,
    m1.QUALIFIEDNAME AS metric1_qn,
    m2.QUALIFIEDNAME AS metric2_qn,
    m1.CONNECTORNAME
FROM METRIC_ENTITY m1
JOIN METRIC_ENTITY m2 ON LOWER(m1.NAME) = LOWER(m2.NAME) AND m1.GUID < m2.GUID
ORDER BY m1.NAME;`,
  },

  // ---------------------------------------------------------------------------
  // Storage Analysis (Optimization)
  // ---------------------------------------------------------------------------
  {
    id: 'storage-1',
    category: 'Storage Analysis',
    name: 'Large Unused Tables',
    description: 'Find tables with high row counts but no recent usage',
    userIntent: 'What large tables are not being used?',
    frequency: 'Medium',
    source: 'Internal - Storage Optimization',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    ROWCOUNT,
    SIZEBYTES,
    ROUND(SIZEBYTES / 1024 / 1024 / 1024, 2) AS size_gb,
    QUERYCOUNT,
    SOURCELASTREADAT,
    OWNERUSERS
FROM TABLE_ENTITY
WHERE ROWCOUNT > 1000000
  AND (QUERYCOUNT IS NULL OR QUERYCOUNT < 10)
  AND STATUS = 'ACTIVE'
ORDER BY ROWCOUNT DESC
LIMIT 50;`,
  },

  // ---------------------------------------------------------------------------
  // Query Organization (Fox Use Case)
  // ---------------------------------------------------------------------------
  {
    id: 'query-org-1',
    category: 'Query Organization',
    name: 'Export Verified Queries for AI Context',
    description: 'Get all verified queries for powering conversational AI',
    userIntent: 'Export verified queries for our AI chatbot',
    frequency: 'Medium',
    frequencyDetail: 'Fox Use Case',
    source: 'Shubham - Fox Workshop Notes',
    confidence: 'high',
    sql: `SELECT 
    q.NAME AS query_name,
    q.RAWQUERY AS sql_text,
    q.USERDESCRIPTION AS description,
    q.STATUS,
    c.NAME AS collection_name,
    f.NAME AS folder_name
FROM QUERY_ENTITY q
JOIN COLLECTION_ENTITY c ON q.COLLECTIONQUALIFIEDNAME = c.QUALIFIEDNAME
LEFT JOIN FOLDER_ENTITY f ON q.PARENTQUALIFIEDNAME = f.QUALIFIEDNAME
WHERE q.STATUS = 'VERIFIED'
ORDER BY c.NAME, f.NAME, q.NAME;`,
  },
  {
    id: 'query-org-2',
    category: 'Query Organization',
    name: 'Collection Query Counts',
    description: 'Get all collections with their query counts',
    userIntent: 'How many queries do we have per collection?',
    frequency: 'Low',
    source: 'Internal - Query Management',
    confidence: 'high',
    sql: `SELECT 
    c.NAME AS collection_name,
    c.USERDESCRIPTION,
    COUNT(q.GUID) AS query_count,
    SUM(CASE WHEN q.STATUS = 'VERIFIED' THEN 1 ELSE 0 END) AS verified_count
FROM COLLECTION_ENTITY c
LEFT JOIN QUERY_ENTITY q ON q.COLLECTIONQUALIFIEDNAME = c.QUALIFIEDNAME
GROUP BY c.NAME, c.USERDESCRIPTION
ORDER BY query_count DESC;`,
  },

  // ---------------------------------------------------------------------------
  // BI Tools - Tableau (New Category)
  // ---------------------------------------------------------------------------
  {
    id: 'bi-tableau-1',
    category: 'BI Tools',
    name: 'Tableau Dashboards Overview',
    description: 'List all Tableau dashboards with their workbooks',
    userIntent: 'Show me all Tableau dashboards',
    frequency: 'High',
    source: 'New - BI Tool Coverage',
    confidence: 'high',
    sql: `SELECT 
    d.NAME AS dashboard_name,
    d.GUID,
    w.NAME AS workbook_name,
    p.NAME AS project_name,
    d.STATUS,
    d.OWNERUSERS,
    d.POPULARITYSCORE
FROM TABLEAUDASHBOARD_ENTITY d
LEFT JOIN TABLEAUWORKBOOK_ENTITY w ON d.WORKBOOKQUALIFIEDNAME = w.QUALIFIEDNAME
LEFT JOIN TABLEAUPROJECT_ENTITY p ON w.PROJECTQUALIFIEDNAME = p.QUALIFIEDNAME
WHERE d.STATUS = 'ACTIVE'
ORDER BY d.POPULARITYSCORE DESC NULLS LAST
LIMIT 100;`,
  },
  {
    id: 'bi-tableau-2',
    category: 'BI Tools',
    name: 'Tableau Datasources with Upstream Tables',
    description: 'Find Tableau data sources and their SQL table dependencies',
    userIntent: 'What tables feed into our Tableau reports?',
    frequency: 'High',
    source: 'New - BI Tool Coverage',
    confidence: 'high',
    sql: `-- Find Tableau datasources and trace to upstream SQL tables
SELECT 
    ds.NAME AS datasource_name,
    ds.GUID AS datasource_guid,
    ds.HASEXTRACTS,
    ds.STATUS,
    p.OUTPUTS::STRING AS linked_to
FROM TABLEAUDATASOURCE_ENTITY ds
LEFT JOIN PROCESS_ENTITY p ON p.INPUTS::STRING ILIKE '%' || ds.GUID || '%'
WHERE ds.STATUS = 'ACTIVE'
ORDER BY ds.POPULARITYSCORE DESC NULLS LAST
LIMIT 50;`,
  },

  // ---------------------------------------------------------------------------
  // BI Tools - Power BI
  // ---------------------------------------------------------------------------
  {
    id: 'bi-powerbi-1',
    category: 'BI Tools',
    name: 'Power BI Reports by Workspace',
    description: 'List Power BI reports grouped by workspace',
    userIntent: 'Show all Power BI reports',
    frequency: 'High',
    source: 'New - BI Tool Coverage',
    confidence: 'high',
    sql: `SELECT 
    w.NAME AS workspace_name,
    r.NAME AS report_name,
    r.GUID,
    r.WEBURL,
    r.STATUS,
    r.OWNERUSERS,
    r.POPULARITYSCORE
FROM POWERBIREPORT_ENTITY r
LEFT JOIN POWERBIWORKSPACE_ENTITY w ON r.WORKSPACEQUALIFIEDNAME = w.QUALIFIEDNAME
WHERE r.STATUS = 'ACTIVE'
ORDER BY w.NAME, r.POPULARITYSCORE DESC NULLS LAST
LIMIT 100;`,
  },
  {
    id: 'bi-powerbi-2',
    category: 'BI Tools',
    name: 'Power BI Measures and Calculations',
    description: 'List all Power BI measures with their expressions',
    userIntent: 'What Power BI measures do we have?',
    frequency: 'Medium',
    source: 'New - BI Tool Coverage',
    confidence: 'high',
    sql: `SELECT 
    m.NAME AS measure_name,
    m.POWERBIMEASUREEXPRESSION AS expression,
    d.NAME AS dataset_name,
    w.NAME AS workspace_name,
    m.STATUS
FROM POWERBIMEASURE_ENTITY m
LEFT JOIN POWERBIDATASET_ENTITY d ON m.DATASETQUALIFIEDNAME = d.QUALIFIEDNAME
LEFT JOIN POWERBIWORKSPACE_ENTITY w ON d.WORKSPACEQUALIFIEDNAME = w.QUALIFIEDNAME
WHERE m.STATUS = 'ACTIVE'
ORDER BY m.NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // BI Tools - Looker
  // ---------------------------------------------------------------------------
  {
    id: 'bi-looker-1',
    category: 'BI Tools',
    name: 'Looker Explores and Models',
    description: 'List Looker explores with their parent models',
    userIntent: 'Show all Looker explores',
    frequency: 'Medium',
    source: 'New - BI Tool Coverage',
    confidence: 'high',
    sql: `SELECT 
    e.NAME AS explore_name,
    m.NAME AS model_name,
    p.NAME AS project_name,
    e.CONNECTIONNAME,
    e.STATUS,
    e.OWNERUSERS
FROM LOOKEREXPLORE_ENTITY e
LEFT JOIN LOOKERMODEL_ENTITY m ON e.MODELQUALIFIEDNAME = m.QUALIFIEDNAME
LEFT JOIN LOOKERPROJECT_ENTITY p ON m.PROJECTQUALIFIEDNAME = p.QUALIFIEDNAME
WHERE e.STATUS = 'ACTIVE'
ORDER BY p.NAME, m.NAME, e.NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // dbt - Data Build Tool
  // ---------------------------------------------------------------------------
  {
    id: 'dbt-1',
    category: 'dbt',
    name: 'dbt Models Overview',
    description: 'List all dbt models with their materialization type',
    userIntent: 'Show all dbt models',
    frequency: 'High',
    source: 'New - dbt Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    DBTALIAS,
    DBTMATERIALIZATION,
    STATUS,
    OWNERUSERS,
    QUALIFIEDNAME
FROM DBTMODEL_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY DBTMATERIALIZATION, NAME
LIMIT 100;`,
  },
  {
    id: 'dbt-2',
    category: 'dbt',
    name: 'dbt Test Results',
    description: 'View dbt test status and failures',
    userIntent: 'Which dbt tests are failing?',
    frequency: 'High',
    source: 'New - dbt Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    DBTTESTSTATUS,
    DBTTESTSTATE,
    DBTTESTCOMPILEDSQL,
    QUALIFIEDNAME
FROM DBTTEST_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY 
    CASE DBTTESTSTATUS 
        WHEN 'fail' THEN 1 
        WHEN 'warn' THEN 2 
        ELSE 3 
    END,
    NAME
LIMIT 100;`,
  },
  {
    id: 'dbt-3',
    category: 'dbt',
    name: 'dbt Sources and Freshness',
    description: 'List dbt sources with freshness criteria',
    userIntent: 'Are our dbt sources fresh?',
    frequency: 'Medium',
    source: 'New - dbt Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    DBTSOURCEFRESHNESSCRITERIA,
    QUALIFIEDNAME,
    STATUS
FROM DBTSOURCE_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY NAME
LIMIT 100;`,
  },
  {
    id: 'dbt-4',
    category: 'dbt',
    name: 'dbt Metrics (Semantic Layer)',
    description: 'List dbt metrics for the semantic layer',
    userIntent: 'What dbt metrics are defined?',
    frequency: 'Medium',
    source: 'New - dbt Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    DBTMETRICTYPE,
    DBTMETRICFILTERS,
    STATUS,
    USERDESCRIPTION
FROM DBTMETRIC_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY DBTMETRICTYPE, NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Orchestration - Airflow
  // ---------------------------------------------------------------------------
  {
    id: 'orchestration-1',
    category: 'Orchestration',
    name: 'Airflow DAGs Overview',
    description: 'List all Airflow DAGs with their schedules',
    userIntent: 'Show all Airflow DAGs',
    frequency: 'High',
    source: 'New - Orchestration Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    AIRFLOWDAGSCHEDULE,
    AIRFLOWDAGSCHEDULEINTERVAL,
    STATUS,
    OWNERUSERS,
    QUALIFIEDNAME
FROM AIRFLOWDAG_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY NAME
LIMIT 100;`,
  },
  {
    id: 'orchestration-2',
    category: 'Orchestration',
    name: 'Airflow Tasks with SQL',
    description: 'Find Airflow tasks that execute SQL queries',
    userIntent: 'What SQL does Airflow run?',
    frequency: 'Medium',
    source: 'New - Orchestration Coverage',
    confidence: 'high',
    sql: `SELECT 
    t.NAME AS task_name,
    d.NAME AS dag_name,
    t.AIRFLOWTASKOPERATORCLASS,
    t.AIRFLOWTASKSQL,
    t.QUALIFIEDNAME
FROM AIRFLOWTASK_ENTITY t
LEFT JOIN AIRFLOWDAG_ENTITY d ON t.AIRFLOWDAGQUALIFIEDNAME = d.QUALIFIEDNAME
WHERE t.STATUS = 'ACTIVE'
  AND t.AIRFLOWTASKSQL IS NOT NULL
ORDER BY d.NAME, t.NAME
LIMIT 100;`,
  },
  {
    id: 'orchestration-3',
    category: 'Orchestration',
    name: 'Fivetran Connectors Status',
    description: 'List Fivetran connectors and their sync status',
    userIntent: 'Are our Fivetran syncs running?',
    frequency: 'High',
    source: 'New - Orchestration Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    FIVETRANCONNECTORSYNCFREQUENCY,
    FIVETRANCONNECTORSYNCPAUSED,
    STATUS,
    QUALIFIEDNAME
FROM FIVETRANCONNECTOR_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY FIVETRANCONNECTORSYNCPAUSED DESC, NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Cloud Storage - S3, ADLS, GCS
  // ---------------------------------------------------------------------------
  {
    id: 'storage-s3-1',
    category: 'Cloud Storage',
    name: 'S3 Buckets Overview',
    description: 'List all S3 buckets with object counts',
    userIntent: 'Show all S3 buckets',
    frequency: 'Medium',
    source: 'New - Cloud Storage Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    S3BUCKETARN,
    AWSREGION,
    S3OBJECTCOUNT,
    STATUS,
    OWNERUSERS
FROM S3BUCKET_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY S3OBJECTCOUNT DESC NULLS LAST
LIMIT 100;`,
  },
  {
    id: 'storage-adls-1',
    category: 'Cloud Storage',
    name: 'ADLS Containers Overview',
    description: 'List Azure Data Lake containers',
    userIntent: 'Show all ADLS containers',
    frequency: 'Medium',
    source: 'New - Cloud Storage Coverage',
    confidence: 'high',
    sql: `SELECT 
    c.NAME AS container_name,
    a.NAME AS account_name,
    c.ADLSCONTAINERURL,
    c.STATUS
FROM ADLSCONTAINER_ENTITY c
LEFT JOIN ADLSACCOUNT_ENTITY a ON c.ADLSACCOUNTQUALIFIEDNAME = a.QUALIFIEDNAME
WHERE c.STATUS = 'ACTIVE'
ORDER BY a.NAME, c.NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // AI/ML Models
  // ---------------------------------------------------------------------------
  {
    id: 'ai-1',
    category: 'AI/ML',
    name: 'AI Models Inventory',
    description: 'List all AI/ML models with their status',
    userIntent: 'What AI models do we have?',
    frequency: 'Medium',
    source: 'New - AI/ML Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    AIMODELSTATUS,
    AIMODELVERSION,
    AIMODELTYPE,
    STATUS,
    OWNERUSERS,
    USERDESCRIPTION
FROM AIMODEL_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY AIMODELSTATUS, NAME
LIMIT 100;`,
  },
  {
    id: 'ai-2',
    category: 'AI/ML',
    name: 'AI Applications',
    description: 'List AI applications and their development stage',
    userIntent: 'What AI applications are deployed?',
    frequency: 'Medium',
    source: 'New - AI/ML Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    AIAPPLICATIONVERSION,
    AIAPPLICATIONDEVELOPMENTSTAGE,
    STATUS,
    OWNERUSERS,
    USERDESCRIPTION
FROM AIAPPLICATION_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY AIAPPLICATIONDEVELOPMENTSTAGE, NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Governance - Personas & Policies
  // ---------------------------------------------------------------------------
  {
    id: 'governance-persona-1',
    category: 'Governance & Ownership',
    name: 'Access Control Personas',
    description: 'List all Atlan personas and their members',
    userIntent: 'What personas are defined for access control?',
    frequency: 'Medium',
    source: 'New - Governance Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    PERSONAUSERS::STRING AS users,
    PERSONAGROUPS::STRING AS groups,
    USERDESCRIPTION
FROM PERSONA_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY NAME
LIMIT 100;`,
  },
  {
    id: 'governance-policy-1',
    category: 'Governance & Ownership',
    name: 'Business Policies',
    description: 'List business governance policies',
    userIntent: 'What governance policies are in place?',
    frequency: 'Medium',
    source: 'New - Governance Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    BUSINESSPOLICYTYPE,
    STATUS,
    USERDESCRIPTION,
    OWNERUSERS
FROM BUSINESSPOLICY_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY BUSINESSPOLICYTYPE, NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Data Mesh - Data Contracts
  // ---------------------------------------------------------------------------
  {
    id: 'datamesh-contract-1',
    category: 'Data Mesh',
    name: 'Data Contracts Overview',
    description: 'List data contracts and their versions',
    userIntent: 'What data contracts do we have?',
    frequency: 'Medium',
    source: 'New - Data Mesh Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    DATACONTRACTVERSION,
    STATUS,
    DATACONTRACTASSETGUID,
    USERDESCRIPTION
FROM DATACONTRACT_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY NAME, DATACONTRACTVERSION DESC
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Connections & Sources
  // ---------------------------------------------------------------------------
  {
    id: 'connection-1',
    category: 'Connections',
    name: 'All Data Connections',
    description: 'List all configured data source connections',
    userIntent: 'What data sources are connected?',
    frequency: 'High',
    source: 'New - Connection Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    CONNECTORNAME,
    CATEGORY,
    HOST,
    STATUS,
    ADMINUSERS::STRING AS admins
FROM CONNECTION_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY CONNECTORNAME, NAME
LIMIT 100;`,
  },
  {
    id: 'connection-2',
    category: 'Connections',
    name: 'Connections by Connector Type',
    description: 'Group connections by connector type with counts',
    userIntent: 'How many connections per connector?',
    frequency: 'Medium',
    source: 'New - Connection Coverage',
    confidence: 'high',
    sql: `SELECT 
    CONNECTORNAME,
    CATEGORY,
    COUNT(*) AS connection_count,
    COUNT(CASE WHEN STATUS = 'VERIFIED' THEN 1 END) AS verified_count
FROM CONNECTION_ENTITY
WHERE STATUS = 'ACTIVE'
GROUP BY CONNECTORNAME, CATEGORY
ORDER BY connection_count DESC;`,
  },

  // ---------------------------------------------------------------------------
  // Snowflake-Specific Features
  // ---------------------------------------------------------------------------
  {
    id: 'snowflake-stream-1',
    category: 'Snowflake Features',
    name: 'Snowflake Streams',
    description: 'List Snowflake CDC streams',
    userIntent: 'What Snowflake streams do we have?',
    frequency: 'Medium',
    source: 'New - Snowflake Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    SNOWFLAKESTREAMTYPE,
    SNOWFLAKESTREAMSOURCETYPE,
    QUALIFIEDNAME,
    STATUS
FROM SNOWFLAKESTREAM_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY SNOWFLAKESTREAMTYPE, NAME
LIMIT 100;`,
  },
  {
    id: 'snowflake-pipe-1',
    category: 'Snowflake Features',
    name: 'Snowflake Pipes',
    description: 'List Snowpipe ingestion configurations',
    userIntent: 'What Snowpipes are configured?',
    frequency: 'Medium',
    source: 'New - Snowflake Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    DEFINITION,
    SNOWFLAKEPIPENOTIFICATIONCHANNELNAME,
    QUALIFIEDNAME,
    STATUS
FROM SNOWFLAKEPIPE_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY NAME
LIMIT 100;`,
  },
  {
    id: 'snowflake-dynamic-1',
    category: 'Snowflake Features',
    name: 'Snowflake Dynamic Tables',
    description: 'List Snowflake dynamic tables with refresh mode',
    userIntent: 'What dynamic tables do we have?',
    frequency: 'Medium',
    source: 'New - Snowflake Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    DEFINITION,
    REFRESHMODE,
    QUALIFIEDNAME,
    STATUS
FROM SNOWFLAKEDYNAMICTABLE_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY NAME
LIMIT 100;`,
  },
  {
    id: 'snowflake-tag-1',
    category: 'Snowflake Features',
    name: 'Native Snowflake Tags',
    description: 'List native Snowflake tags (synced from Snowflake)',
    userIntent: 'What Snowflake native tags exist?',
    frequency: 'Medium',
    source: 'New - Snowflake Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    TAGALLOWEDVALUES,
    QUALIFIEDNAME,
    STATUS
FROM SNOWFLAKETAG_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Schema & Database Exploration
  // ---------------------------------------------------------------------------
  {
    id: 'schema-explore-1',
    category: 'Schema Exploration',
    name: 'Databases with Schema Counts',
    description: 'List all databases with their schema counts',
    userIntent: 'How many schemas per database?',
    frequency: 'High',
    source: 'New - Schema Exploration',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    SCHEMACOUNT,
    CONNECTIONQUALIFIEDNAME,
    STATUS,
    OWNERUSERS
FROM DATABASE_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY SCHEMACOUNT DESC NULLS LAST
LIMIT 100;`,
  },
  {
    id: 'schema-explore-2',
    category: 'Schema Exploration',
    name: 'Schemas with Table/View Counts',
    description: 'List schemas with their table and view counts',
    userIntent: 'How many tables per schema?',
    frequency: 'High',
    source: 'New - Schema Exploration',
    confidence: 'high',
    sql: `SELECT 
    s.NAME AS schema_name,
    d.NAME AS database_name,
    s.TABLECOUNT,
    s.VIEWCOUNT,
    s.STATUS
FROM SCHEMA_ENTITY s
LEFT JOIN DATABASE_ENTITY d ON s.DATABASEQUALIFIEDNAME = d.QUALIFIEDNAME
WHERE s.STATUS = 'ACTIVE'
ORDER BY s.TABLECOUNT DESC NULLS LAST
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Advanced Lineage Queries
  // ---------------------------------------------------------------------------
  {
    id: 'lineage-5',
    category: 'Data Lineage',
    name: 'Column-Level Lineage',
    description: 'Trace column-level data flow',
    userIntent: 'Show column lineage for a table',
    frequency: 'Medium',
    source: 'New - Advanced Lineage',
    confidence: 'high',
    sql: `-- Column-level lineage processes
SELECT 
    cp.GUID AS process_guid,
    cp.NAME AS process_name,
    cp.INPUTS::STRING AS input_columns,
    cp.OUTPUTS::STRING AS output_columns
FROM COLUMNPROCESS_ENTITY cp
WHERE cp.STATUS = 'ACTIVE'
ORDER BY cp.NAME
LIMIT 50;`,
  },
  {
    id: 'lineage-6',
    category: 'Data Lineage',
    name: 'dbt Model Lineage',
    description: 'View dbt transformation lineage',
    userIntent: 'Show dbt model dependencies',
    frequency: 'Medium',
    source: 'New - Advanced Lineage',
    confidence: 'high',
    sql: `-- dbt lineage via DBTPROCESS_ENTITY
SELECT 
    p.NAME AS process_name,
    p.DBTPROCESSJOBSTATUS,
    p.INPUTS::STRING AS source_models,
    p.OUTPUTS::STRING AS target_models
FROM DBTPROCESS_ENTITY p
WHERE p.STATUS = 'ACTIVE'
ORDER BY p.NAME
LIMIT 50;`,
  },

  // ---------------------------------------------------------------------------
  // Cross-Connector Analytics
  // ---------------------------------------------------------------------------
  {
    id: 'cross-connector-1',
    category: 'Cross-Connector',
    name: 'Assets by Connector Type',
    description: 'Count assets across all connector types',
    userIntent: 'How many assets per connector?',
    frequency: 'High',
    source: 'New - Cross-Connector Analytics',
    confidence: 'high',
    sql: `SELECT 
    CONNECTORNAME,
    COUNT(*) AS asset_count,
    COUNT(CASE WHEN STATUS = 'VERIFIED' THEN 1 END) AS verified_count,
    COUNT(CASE WHEN USERDESCRIPTION IS NOT NULL AND USERDESCRIPTION != '' THEN 1 END) AS documented_count
FROM TABLE_ENTITY
WHERE STATUS = 'ACTIVE'
GROUP BY CONNECTORNAME
ORDER BY asset_count DESC;`,
  },
  {
    id: 'cross-connector-2',
    category: 'Cross-Connector',
    name: 'Top Tables Across All Sources',
    description: 'Most popular tables across all data sources',
    userIntent: 'What are our most used tables everywhere?',
    frequency: 'High',
    source: 'New - Cross-Connector Analytics',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    CONNECTORNAME,
    DATABASENAME,
    SCHEMANAME,
    POPULARITYSCORE,
    QUERYCOUNT,
    ROWCOUNT
FROM TABLE_ENTITY
WHERE STATUS = 'ACTIVE'
  AND POPULARITYSCORE IS NOT NULL
ORDER BY POPULARITYSCORE DESC
LIMIT 50;`,
  },

  // ---------------------------------------------------------------------------
  // Freshness & Monitoring
  // ---------------------------------------------------------------------------
  {
    id: 'freshness-1',
    category: 'Data Freshness',
    name: 'Stale Tables (No Recent Updates)',
    description: 'Find tables that havent been updated recently',
    userIntent: 'Which tables are stale?',
    frequency: 'High',
    source: 'New - Freshness Monitoring',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    CONNECTORNAME,
    SOURCELASTSYNCAT,
    SOURCEUPDATEDAT,
    ROWCOUNT,
    OWNERUSERS
FROM TABLE_ENTITY
WHERE STATUS = 'ACTIVE'
  AND (
    SOURCELASTSYNCAT < DATEADD(day, -7, CURRENT_DATE())
    OR SOURCELASTSYNCAT IS NULL
  )
ORDER BY SOURCELASTSYNCAT ASC NULLS FIRST
LIMIT 100;`,
  },
  {
    id: 'freshness-2',
    category: 'Data Freshness',
    name: 'Recently Updated Tables',
    description: 'Tables updated in the last 24 hours',
    userIntent: 'What was updated recently?',
    frequency: 'Medium',
    source: 'New - Freshness Monitoring',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    CONNECTORNAME,
    SOURCEUPDATEDAT,
    ROWCOUNT
FROM TABLE_ENTITY
WHERE STATUS = 'ACTIVE'
  AND SOURCEUPDATEDAT >= DATEADD(day, -1, CURRENT_DATE())
ORDER BY SOURCEUPDATEDAT DESC
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Certificate Status Tracking
  // ---------------------------------------------------------------------------
  {
    id: 'certificate-1',
    category: 'Certification',
    name: 'Certification Status Summary',
    description: 'Count of assets by certificate status',
    userIntent: 'How many assets are verified?',
    frequency: 'High',
    source: 'New - Certification Tracking',
    confidence: 'high',
    sql: `SELECT 
    STATUS,
    COUNT(*) AS asset_count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS percentage
FROM TABLE_ENTITY
WHERE STATUS = 'ACTIVE'
GROUP BY STATUS
ORDER BY asset_count DESC;`,
  },
  {
    id: 'certificate-2',
    category: 'Certification',
    name: 'Recently Certified Assets',
    description: 'Assets that were recently certified',
    userIntent: 'What was recently verified?',
    frequency: 'Medium',
    source: 'New - Certification Tracking',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    TYPENAME,
    QUALIFIEDNAME,
    STATUS,
    CERTIFICATEUPDATEDBY,
    CERTIFICATEUPDATEDAT
FROM TABLE_ENTITY
WHERE STATUS = 'ACTIVE'
  AND STATUS = 'VERIFIED'
  AND CERTIFICATEUPDATEDAT >= DATEADD(day, -30, CURRENT_DATE())
ORDER BY CERTIFICATEUPDATEDAT DESC
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Custom Metadata Analysis
  // ---------------------------------------------------------------------------
  {
    id: 'custom-metadata-1',
    category: 'Custom Metadata',
    name: 'Custom Metadata Usage',
    description: 'Most commonly used custom metadata attributes',
    userIntent: 'What custom metadata is being used?',
    frequency: 'Medium',
    source: 'New - Custom Metadata Analysis',
    confidence: 'high',
    sql: `SELECT 
    SETDISPLAYNAME AS metadata_set,
    ATTRIBUTEDISPLAYNAME AS attribute_name,
    COUNT(DISTINCT ENTITYGUID) AS asset_count
FROM CUSTOMMETADATA_RELATIONSHIP
GROUP BY SETDISPLAYNAME, ATTRIBUTEDISPLAYNAME
ORDER BY asset_count DESC
LIMIT 100;`,
  },
  {
    id: 'custom-metadata-2',
    category: 'Custom Metadata',
    name: 'Assets with Specific Custom Metadata',
    description: 'Find assets with a specific custom metadata value',
    userIntent: 'Which assets have this custom metadata?',
    frequency: 'Medium',
    source: 'New - Custom Metadata Analysis',
    confidence: 'high',
    sql: `SELECT 
    cm.ENTITYGUID,
    t.NAME AS asset_name,
    t.TYPENAME,
    cm.SETDISPLAYNAME,
    cm.ATTRIBUTEDISPLAYNAME,
    cm.ATTRIBUTEVALUE
FROM CUSTOMMETADATA_RELATIONSHIP cm
JOIN TABLE_ENTITY t ON cm.ENTITYGUID = t.GUID
WHERE cm.SETDISPLAYNAME LIKE '%{{metadata_set}}%'
ORDER BY t.NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Tag Analysis
  // ---------------------------------------------------------------------------
  {
    id: 'tag-analysis-1',
    category: 'Tag Analysis',
    name: 'Most Used Tags',
    description: 'Tags ranked by how many assets they are applied to',
    userIntent: 'What tags are most commonly used?',
    frequency: 'High',
    source: 'New - Tag Analysis',
    confidence: 'high',
    sql: `SELECT 
    TAGNAME,
    COUNT(DISTINCT ENTITYGUID) AS asset_count,
    COUNT(CASE WHEN PROPAGATE = TRUE THEN 1 END) AS propagated_count
FROM TAG_RELATIONSHIP
GROUP BY TAGNAME
ORDER BY asset_count DESC
LIMIT 50;`,
  },
  {
    id: 'tag-analysis-2',
    category: 'Tag Analysis',
    name: 'Tag Propagation Status',
    description: 'Show tags and their propagation settings',
    userIntent: 'Which tags propagate through lineage?',
    frequency: 'Medium',
    source: 'New - Tag Analysis',
    confidence: 'high',
    sql: `SELECT 
    TAGNAME,
    PROPAGATE,
    PROPAGATEFROMLINEAGE,
    COUNT(*) AS usage_count
FROM TAG_RELATIONSHIP
GROUP BY TAGNAME, PROPAGATE, PROPAGATEFROMLINEAGE
ORDER BY TAGNAME, usage_count DESC;`,
  },

  // ---------------------------------------------------------------------------
  // Views & Materialized Views
  // ---------------------------------------------------------------------------
  {
    id: 'views-1',
    category: 'Views',
    name: 'All Views Overview',
    description: 'List all database views',
    userIntent: 'Show all views',
    frequency: 'Medium',
    source: 'New - View Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    DATABASENAME,
    SCHEMANAME,
    COLUMNCOUNT,
    STATUS,
    DEFINITION
FROM VIEW_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY DATABASENAME, SCHEMANAME, NAME
LIMIT 100;`,
  },
  {
    id: 'views-2',
    category: 'Views',
    name: 'Materialized Views',
    description: 'List materialized views with refresh info',
    userIntent: 'What materialized views exist?',
    frequency: 'Medium',
    source: 'New - View Coverage',
    confidence: 'high',
    sql: `SELECT 
    NAME,
    QUALIFIEDNAME,
    DATABASENAME,
    SCHEMANAME,
    REFRESHMODE,
    STALENESS,
    DEFINITION,
    STATUS
FROM MATERIALISEDVIEW_ENTITY
WHERE STATUS = 'ACTIVE'
ORDER BY DATABASENAME, SCHEMANAME, NAME
LIMIT 100;`,
  },
];

// =============================================================================
// METADATA
// =============================================================================

export const USER_QUERIES_METADATA = {
  title: 'MDLH Query Dictionary',
  description: 'Consolidated metadata lakehouse queries from Slack user research, Confluence docs, and internal implementations',
  totalQueries: USER_RESEARCH_QUERIES.length,
  sources: [
    'Himanshu - Conversational Search Analysis (~600 user questions)',
    'Priyanjna - Medtronic Implementation',
    'Ben Hudson - Thursday Demos',
    'Shubham - Fox Workshop Notes',
    'Peter Ebert - Python NetworkX Approach',
    'Internal MDLH Documentation',
  ],
  lastUpdated: '2025-12-06',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get queries sorted by frequency (Very High → Low)
 */
export function getQueriesByFrequency() {
  const order = ['Very High', 'High', 'Medium', 'Low'];
  return [...USER_RESEARCH_QUERIES].sort((a, b) => {
    return order.indexOf(a.frequency) - order.indexOf(b.frequency);
  });
}

/**
 * Get queries grouped by category
 */
export function getQueriesByCategory() {
  const grouped = {};
  USER_RESEARCH_QUERIES.forEach(q => {
    if (!grouped[q.category]) {
      grouped[q.category] = [];
    }
    grouped[q.category].push(q);
  });
  return grouped;
}

/**
 * Find a query by ID
 */
export function findQueryById(id) {
  return USER_RESEARCH_QUERIES.find(q => q.id === id);
}

/**
 * Search queries by userIntent or name
 */
export function searchQueries(searchTerm) {
  const term = searchTerm.toLowerCase();
  return USER_RESEARCH_QUERIES.filter(q => 
    q.userIntent.toLowerCase().includes(term) ||
    q.name.toLowerCase().includes(term) ||
    q.description.toLowerCase().includes(term)
  );
}

export default {
  USER_RESEARCH_QUERIES,
  USER_QUERY_CATEGORIES,
  USER_QUERIES_METADATA,
  FREQUENCY_LEVELS,
  FREQUENCY_STYLES,
  getQueriesByFrequency,
  getQueriesByCategory,
  findQueryById,
  searchQueries,
};

