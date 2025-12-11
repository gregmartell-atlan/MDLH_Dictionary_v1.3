/**
 * Example SQL Queries for MDLH
 * 
 * Organized by category, these queries provide templates and examples
 * for common data exploration and analysis patterns.
 * 
 * Now includes user research queries from Slack/Confluence analysis.
 */

import { USER_RESEARCH_QUERIES, FREQUENCY_STYLES } from './mdlhUserQueries';

// Re-export for convenience
export { FREQUENCY_STYLES };

/**
 * Convert user research query to exampleQueries format
 */
function convertToExampleFormat(userQuery) {
  return {
    title: userQuery.name,
    description: userQuery.description,
    query: userQuery.sql,
    // New fields from user research
    userIntent: userQuery.userIntent,
    frequency: userQuery.frequency,
    frequencyDetail: userQuery.frequencyDetail,
    source: userQuery.source,
    warning: userQuery.warning,
    confidence: userQuery.confidence,
    id: userQuery.id,
    category: userQuery.category,
  };
}

// Group user research queries by their category for merging
const userQueryGroups = USER_RESEARCH_QUERIES.reduce((acc, q) => {
  const category = q.category;
  if (!acc[category]) acc[category] = [];
  acc[category].push(convertToExampleFormat(q));
  return acc;
}, {});

export const exampleQueries = {
  core: [
    {
      title: '✓ Verify Database Access',
      description: 'Check which MDLH databases you have access to before querying',
      query: `-- List all databases you can access
SHOW DATABASES`
    },
    {
      title: 'List All MDLH Tables',
      description: 'Discover available entity tables in the current database',
      query: `-- List all tables in the current schema
SHOW TABLES;

-- Or specify a database.schema:
-- SHOW TABLES IN FIELD_METADATA.PUBLIC;`
    },
    {
      title: 'Explore Catalog Integrations',
      description: 'View configured catalog integrations',
      query: `-- List all catalog integrations
SHOW CATALOG INTEGRATIONS`
    },
    {
      title: 'Switch MDLH Environment',
      description: 'Select which MDLH database to query',
      query: `-- Choose your MDLH environment
USE FIELD_METADATA;      -- For atlan.atlan.com
USE MDLH_GOVERNANCE;     -- For demo-governance.atlan.com
USE MDLH_ATLAN_HOME;     -- For home tenant`
    },
    {
      title: 'Time Travel Query',
      description: 'Query historical data using Iceberg time travel',
      query: `-- Query data from a specific timestamp
SELECT *
FROM ATLASGLOSSARY_ENTITY
AT(TIMESTAMP => '2025-07-22 12:00:00'::timestamp_tz)
LIMIT 10`
    },
    {
      title: 'Downstream Lineage (No Limit)',
      description: 'Find ALL downstream assets from a source - no recursion limit',
      query: `-- GET DOWNSTREAM ASSETS - NO DISTANCE, NO RECURSION LIMIT
-- Warning: May be slow for assets with extensive lineage
WITH RECURSIVE lineage_cte (guid) AS (
    -- Anchor: Start with your source GUID
    SELECT '<YOUR_SOURCE_GUID>'::VARCHAR AS guid

    UNION ALL
    
    -- Recursive: Find all downstream dependencies
    SELECT outputs_flat.value::STRING
    FROM lineage_cte AS L
    JOIN PROCESS_ENTITY AS P ON P."INPUTS"::STRING ILIKE '%' || L.guid || '%'
    , LATERAL FLATTEN(INPUT => P."OUTPUTS") AS outputs_flat
)
SELECT DISTINCT
    COALESCE(T.name, V.name, SGELEM.name) AS entity_name,
    L.guid AS entity_guid,
    CASE
        WHEN T.name IS NOT NULL THEN 'TABLE'
        WHEN V.name IS NOT NULL THEN 'VIEW'
        WHEN SGELEM.name IS NOT NULL THEN 'SIGMA DATA ELEMENT'
        ELSE 'UNKNOWN'
    END AS entity_type
FROM lineage_cte AS L
LEFT JOIN TABLE_ENTITY AS T ON T.guid = L.guid
LEFT JOIN VIEW_ENTITY AS V ON V.guid = L.guid
LEFT JOIN SIGMADATAELEMENT_ENTITY AS SGELEM ON SGELEM.guid = L.guid
ORDER BY entity_name ASC;`
    },
    {
      title: 'Downstream Lineage (With Limit)',
      description: 'Find downstream assets with recursion depth limit and distance tracking',
      query: `-- GET DOWNSTREAM ASSETS - WITH DISTANCE AND RECURSION LIMIT
WITH RECURSIVE lineage_cte (guid, level) AS (
    -- Anchor: Start with your source GUID
    SELECT '<YOUR_SOURCE_GUID>'::VARCHAR AS guid, 0 AS level

    UNION ALL
    
    -- Recursive: Find downstream, increment level each step
    SELECT outputs_flat.value::STRING, L.level + 1
    FROM lineage_cte AS L
    JOIN PROCESS_ENTITY AS P ON P."INPUTS"::STRING ILIKE '%' || L.guid || '%'
    , LATERAL FLATTEN(INPUT => P."OUTPUTS") AS outputs_flat
    WHERE L.level < 5  -- Stop at 5 hops
)
SELECT DISTINCT
    COALESCE(T.name, V.name, SF.name, SGELEM.name) AS entity_name,
    L.guid AS entity_guid,
    CASE
        WHEN T.name IS NOT NULL THEN 'TABLE'
        WHEN V.name IS NOT NULL THEN 'VIEW'
        WHEN SF.name IS NOT NULL THEN 'SALESFORCE OBJECT'
        WHEN SGELEM.name IS NOT NULL THEN 'SIGMA DATA ELEMENT'
        ELSE 'UNKNOWN'
    END AS entity_type,
    L.level AS distance
FROM lineage_cte AS L
LEFT JOIN TABLE_ENTITY AS T ON T.guid = L.guid
LEFT JOIN VIEW_ENTITY AS V ON V.guid = L.guid
LEFT JOIN SALESFORCEOBJECT_ENTITY AS SF ON SF.guid = L.guid
LEFT JOIN SIGMADATAELEMENT_ENTITY AS SGELEM ON SGELEM.guid = L.guid
WHERE L.level > 0  -- Exclude the starting asset
ORDER BY distance ASC;`
    },
    {
      title: 'Upstream Lineage (With Distance)',
      description: 'Find all upstream sources with distance tracking',
      query: `-- GET UPSTREAM ASSETS - WITH DISTANCE AND RECURSION LIMIT
WITH RECURSIVE lineage_cte (guid, level) AS (
    -- Anchor: Start with your target GUID
    SELECT '<YOUR_TARGET_GUID>'::VARCHAR AS guid, 0 AS level

    UNION ALL
    
    -- Recursive: Find upstream by joining on OUTPUTS
    SELECT inputs_flat.value::STRING, L.level + 1
    FROM lineage_cte AS L
    -- Note: Join on OUTPUTS to go upstream
    JOIN PROCESS_ENTITY AS P ON P."OUTPUTS"::STRING ILIKE '%' || L.guid || '%'
    , LATERAL FLATTEN(INPUT => P."INPUTS") AS inputs_flat
    WHERE L.level < 5  -- Stop at 5 hops
)
SELECT DISTINCT
    COALESCE(T.name, V.name, SF.name) AS entity_name,
    L.guid AS entity_guid,
    CASE
        WHEN T.name IS NOT NULL THEN 'TABLE'
        WHEN V.name IS NOT NULL THEN 'VIEW'
        WHEN SF.name IS NOT NULL THEN 'SALESFORCE OBJECT'
        ELSE 'UNKNOWN'
    END AS entity_type,
    L.level AS distance
FROM lineage_cte AS L
LEFT JOIN TABLE_ENTITY AS T ON T.guid = L.guid
LEFT JOIN VIEW_ENTITY AS V ON V.guid = L.guid
LEFT JOIN SALESFORCEOBJECT_ENTITY AS SF ON SF.guid = L.guid
WHERE L.level > 0  -- Exclude starting asset
ORDER BY distance ASC;`
    },
    {
      title: 'Bidirectional Lineage',
      description: 'Get both upstream and downstream lineage with positive/negative distance',
      query: `-- BIDIRECTIONAL LINEAGE - Both upstream and downstream
-- Positive distance = downstream, Negative = upstream
WITH RECURSIVE downstream_cte (guid, level) AS (
    SELECT '<YOUR_GUID>'::VARCHAR AS guid, 0 AS level
    UNION ALL
    SELECT outputs_flat.value::STRING, L.level + 1
    FROM downstream_cte AS L
    JOIN PROCESS_ENTITY AS P ON P."INPUTS"::STRING ILIKE '%' || L.guid || '%'
    , LATERAL FLATTEN(INPUT => P."OUTPUTS") AS outputs_flat
    WHERE L.level < 5
),
upstream_cte (guid, level) AS (
    SELECT '<YOUR_GUID>'::VARCHAR AS guid, 0 AS level
    UNION ALL
    SELECT inputs_flat.value::STRING, L.level - 1  -- Negative for upstream
    FROM upstream_cte AS L
    JOIN PROCESS_ENTITY AS P ON P."OUTPUTS"::STRING ILIKE '%' || L.guid || '%'
    , LATERAL FLATTEN(INPUT => P."INPUTS") AS inputs_flat
    WHERE L.level > -5
),
combined_lineage AS (
    SELECT * FROM downstream_cte
    UNION ALL
    SELECT * FROM upstream_cte
)
SELECT DISTINCT
    COALESCE(T.name, V.name, SF.name, SGELEM.name) AS entity_name,
    L.guid AS entity_guid,
    CASE
        WHEN T.name IS NOT NULL THEN 'TABLE'
        WHEN V.name IS NOT NULL THEN 'VIEW'
        WHEN SF.name IS NOT NULL THEN 'SALESFORCE OBJECT'
        WHEN SGELEM.name IS NOT NULL THEN 'SIGMA DATA ELEMENT'
        ELSE 'UNKNOWN'
    END AS entity_type,
    L.level AS distance  -- Negative = upstream, Positive = downstream
FROM combined_lineage AS L
LEFT JOIN TABLE_ENTITY AS T ON T.guid = L.guid
LEFT JOIN VIEW_ENTITY AS V ON V.guid = L.guid
LEFT JOIN SALESFORCEOBJECT_ENTITY AS SF ON SF.guid = L.guid
LEFT JOIN SIGMADATAELEMENT_ENTITY AS SGELEM ON SGELEM.guid = L.guid
WHERE L.level != 0  -- Exclude starting asset
ORDER BY distance ASC;`
    },
  ],
  glossary: [
    {
      title: 'List All Glossaries',
      description: 'View all business glossaries in your tenant with creator info',
      query: `-- First, see all Glossaries in your Atlan tenant
SELECT
  NAME,
  GUID,
  CREATEDBY
FROM ATLASGLOSSARY_ENTITY;

-- Note the GUID of the glossary you want to explore
-- Use it in joins like: WHERE column::STRING ILIKE '%' || guid || '%'`
    },
    {
      title: 'Terms with Categories (Full Detail)',
      description: 'List glossary terms with their parent glossaries and categories resolved to names',
      query: `-- Comprehensive query to resolve term relationships
WITH glossary_lookup AS (
    SELECT GUID AS glossary_guid, NAME AS glossary_name
    FROM GLOSSARY_ENTITY
),
category_lookup AS (
    SELECT GUID AS category_guid, NAME AS category_name
    FROM GLOSSARYCATEGORY_ENTITY
),
term_anchors AS (
    SELECT TERM.GUID AS term_guid,
           anchor_elem.value::STRING AS glossary_guid
    FROM GLOSSARYTERM_ENTITY TERM,
         LATERAL FLATTEN(input => TERM.ANCHOR) AS anchor_elem
),
term_categories AS (
    SELECT TERM.GUID AS term_guid,
           category_elem.value::STRING AS category_guid
    FROM GLOSSARYTERM_ENTITY TERM,
         LATERAL FLATTEN(input => TERM.CATEGORIES) AS category_elem
),
term_glossary_names AS (
    SELECT TA.term_guid,
           LISTAGG(GL.glossary_name, ', ') WITHIN GROUP (ORDER BY GL.glossary_name) AS glossaries
    FROM term_anchors TA
    LEFT JOIN glossary_lookup GL ON TA.glossary_guid = GL.glossary_guid
    GROUP BY TA.term_guid
),
term_category_names AS (
    SELECT TC.term_guid,
           LISTAGG(CL.category_name, ', ') WITHIN GROUP (ORDER BY CL.category_name) AS categories
    FROM term_categories TC
    LEFT JOIN category_lookup CL ON TC.category_guid = CL.category_guid
    GROUP BY TC.term_guid
)
SELECT
    T.NAME,
    T.USERDESCRIPTION,
    TG.glossaries AS GLOSSARIES,
    TC.categories AS CATEGORIES,
    T.GUID
FROM GLOSSARYTERM_ENTITY T
LEFT JOIN term_glossary_names TG ON T.GUID = TG.term_guid
LEFT JOIN term_category_names TC ON T.GUID = TC.term_guid
LIMIT 100;`
    },
    {
      title: 'Terms by Glossary GUID',
      description: 'Get all terms belonging to a specific glossary',
      query: `-- ANCHOR is an OBJECT - use :guid::STRING ILIKE for GUID match
SELECT GUID, NAME, USERDESCRIPTION
FROM ATLASGLOSSARYTERM_ENTITY
WHERE ANCHOR:guid::STRING ILIKE '%<GLOSSARY_GUID>%';`
    },
    {
      title: 'Terms by Creator',
      description: 'Find all terms created by a specific user',
      query: `SELECT GUID, NAME
FROM ATLASGLOSSARYTERM_ENTITY
WHERE CREATEDBY = '<username>';`
    },
    {
      title: 'Asset Status Distribution',
      description: 'Count terms by status',
      query: `SELECT STATUS, COUNT(GUID) as term_count
FROM ATLASGLOSSARYTERM_ENTITY
GROUP BY STATUS;`
    },
    {
      title: 'Find Duplicate Terms (Jaro-Winkler)',
      description: 'Identify similar terms across glossaries using fuzzy matching',
      query: `-- ANCHOR is an OBJECT - use :guid::STRING ILIKE for exact GUID match
WITH core_terms AS (
  SELECT NAME AS core_name, GUID AS core_guid,
         USERDESCRIPTION AS core_description
  FROM ATLASGLOSSARYTERM_ENTITY
  WHERE ANCHOR:guid::STRING ILIKE '%<CORE_GLOSSARY_GUID>%'
),
non_core_terms AS (
  SELECT NAME AS non_core_name, GUID AS non_core_guid,
         USERDESCRIPTION AS non_core_description,
         ANCHOR AS non_core_anchor_guid
  FROM ATLASGLOSSARYTERM_ENTITY
  WHERE NOT ANCHOR:guid::STRING ILIKE '%<CORE_GLOSSARY_GUID>%'
),
glossary_lookup AS (
  SELECT GUID AS glossary_guid, NAME AS glossary_name
  FROM ATLASGLOSSARY_ENTITY
)
SELECT DISTINCT
  T1.core_name AS source_of_truth_name,
  T2.non_core_name AS potential_duplicate_name,
  T3.glossary_name AS duplicate_glossary,
  JAROWINKLER_SIMILARITY(T1.core_name, T2.non_core_name) AS similarity_score
FROM core_terms T1
JOIN non_core_terms T2
  ON JAROWINKLER_SIMILARITY(T1.core_name, T2.non_core_name) >= 95
  AND T1.core_guid != T2.non_core_guid
JOIN glossary_lookup T3
  ON T2.non_core_anchor_guid::STRING ILIKE '%' || T3.glossary_guid || '%'
ORDER BY similarity_score DESC;`
    },
    {
      title: 'Find Substring Duplicates',
      description: 'Find terms where one name contains another',
      query: `WITH standardized_terms AS (
  SELECT NAME AS original_term_name, GUID AS term_guid,
         USERDESCRIPTION AS term_description,
         LOWER(REGEXP_REPLACE(NAME, '[ _-]', '', 1, 0)) AS standardized_name
  FROM ATLASGLOSSARYTERM_ENTITY
)
SELECT DISTINCT
  t1.original_term_name AS potential_duplicate_1_name,
  t2.original_term_name AS potential_duplicate_2_name,
  t1.term_guid AS potential_duplicate_1_guid,
  t2.term_guid AS potential_duplicate_2_guid
FROM standardized_terms t1
JOIN standardized_terms t2
  ON t1.standardized_name LIKE '%' || t2.standardized_name || '%'
  AND LENGTH(t1.standardized_name) > LENGTH(t2.standardized_name)
  AND t1.term_guid != t2.term_guid
ORDER BY potential_duplicate_1_name;`
    },
  ],
  datamesh: [
    {
      title: 'List Data Domains',
      description: 'View all data domains and their hierarchy',
      query: `SELECT NAME, USERDESCRIPTION, PARENTDOMAINQUALIFIEDNAME
FROM DATADOMAIN_ENTITY
ORDER BY NAME;`
    },
    {
      title: 'Active Data Products',
      description: 'Find all active data products with their status',
      query: `SELECT NAME, DATAPRODUCTSTATUS, DATAPRODUCTCRITICALITY
FROM DATAPRODUCT_ENTITY
WHERE DATAPRODUCTSTATUS = 'Active'
ORDER BY DATAPRODUCTCRITICALITY DESC;`
    },
    {
      title: 'Data Contracts Overview',
      description: 'View data contract versions and status',
      query: `SELECT DATACONTRACTVERSION, STATUS, DATACONTRACTASSETGUID
FROM DATACONTRACT_ENTITY
ORDER BY DATACONTRACTVERSION DESC;`
    },
  ],
  relational: [
    {
      title: 'Basic Table Exploration',
      description: 'View table metadata with row counts and sizes',
      query: `SELECT NAME, ROWCOUNT, COLUMNCOUNT, SIZEBYTES, POPULARITYSCORE
FROM TABLE_ENTITY
WHERE SIZEBYTES IS NOT NULL
ORDER BY SIZEBYTES DESC
LIMIT 100;`
    },
    {
      title: 'Full Column Metadata Export',
      description: 'Comprehensive column-level metadata with tags and custom metadata as JSON arrays',
      query: `-- Column-Level Metadata Query with Aggregated Custom Metadata and Tags
WITH FILTERED_COLUMNS AS (
    SELECT GUID
    FROM COLUMN_ENTITY
    WHERE CONNECTORNAME IN ('glue', 'snowflake')
),
-- Aggregate Custom Metadata for each column as JSON
CM_AGG AS (
    SELECT
        CM.ENTITYGUID,
        ARRAY_AGG(
            DISTINCT OBJECT_CONSTRUCT(
                'set_name', SETDISPLAYNAME,
                'field_name', ATTRIBUTEDISPLAYNAME,
                'field_value', ATTRIBUTEVALUE
            )
        ) AS CUSTOM_METADATA_JSON
    FROM CUSTOMMETADATA_RELATIONSHIP CM
    JOIN FILTERED_COLUMNS FC ON CM.ENTITYGUID = FC.GUID
    GROUP BY CM.ENTITYGUID
),
-- Aggregate Tags for each column as JSON
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
    -- Asset Identifiers
    COL.NAME AS COL_NAME,
    COL.QUALIFIEDNAME AS COL_QUALIFIEDNAME,
    COL.GUID AS COL_GUID,
    COL.DESCRIPTION AS COL_DESCRIPTION,
    COL.USERDESCRIPTION AS COL_USERDESCRIPTION,
    COL.CONNECTORNAME, COL.CONNECTIONNAME,
    COL.DATABASENAME, COL.SCHEMANAME, COL.TABLENAME,
    -- Source Attributes
    COL.DATATYPE, COL.SUBDATATYPE,
    COL."ORDER" AS COL_ORDER,
    COL.ISPARTITION, COL.ISPRIMARY, COL.ISNULLABLE,
    COL.PRECISION, COL.MAXLENGTH,
    -- Atlan Metrics
    COL.STATUS, COL.HASLINEAGE, COL.POPULARITYSCORE,
    COL.QUERYCOUNT, COL.QUERYUSERCOUNT,
    -- Tags & Custom Metadata
    TR_AGG.TAG_JSON AS COL_TAGS,
    CM_AGG.CUSTOM_METADATA_JSON AS COL_CUSTOM_METADATA,
    -- Enrichment
    COL.STATUS, COL.MEANINGS,
    COL.OWNERUSERS, COL.OWNERGROUPS
FROM COLUMN_ENTITY COL
LEFT JOIN CM_AGG ON COL.GUID = CM_AGG.ENTITYGUID
LEFT JOIN TR_AGG ON COL.GUID = TR_AGG.ENTITYGUID
WHERE COL.CONNECTORNAME IN ('glue', 'snowflake')
LIMIT 100;`
    },
    {
      title: 'Tables Without Descriptions',
      description: 'Find tables missing documentation',
      query: `SELECT
  SUM(CASE WHEN DESCRIPTION IS NOT NULL THEN 1 ELSE 0 END) "WITH DESCRIPTIONS",
  SUM(CASE WHEN DESCRIPTION IS NULL THEN 1 ELSE 0 END) "WITHOUT DESCRIPTIONS"
FROM TABLE_ENTITY;`
    },
    {
      title: 'Storage Reclamation Analysis',
      description: 'Find large tables by size and popularity for storage optimization',
      query: `-- STORAGE RECLAMATION ANALYSIS
-- Show the largest tables and their popularity scores
-- Use this to identify large, unused tables for cleanup
SELECT
  NAME,
  ROWCOUNT,
  COLUMNCOUNT,
  SIZEBYTES,
  POPULARITYSCORE
FROM TABLE_ENTITY
WHERE SIZEBYTES IS NOT NULL
ORDER BY SIZEBYTES DESC
LIMIT 100`
    },
    {
      title: 'Most Popular Tables',
      description: 'Find tables with highest query counts',
      query: `SELECT NAME, QUERYCOUNT, POPULARITYSCORE, COLUMNCOUNT
FROM TABLE_ENTITY
ORDER BY QUERYCOUNT DESC
LIMIT 20;`
    },
    {
      title: 'Frequent Column Updaters',
      description: 'Find users who update columns most frequently - useful for identifying power users',
      query: `-- POPULARITY ANALYSIS
-- Shows users who update Columns most frequently in Atlan
-- Useful for identifying power users and data stewards
SELECT
  UPDATEDBY,
  TO_TIMESTAMP(MAX(UPDATETIME)/1000) AS LASTUPDATE,
  COUNT(*) AS UPDATECOUNT
FROM COLUMN_ENTITY
GROUP BY UPDATEDBY
ORDER BY UPDATECOUNT DESC;`
    },
    {
      title: 'Table-Column Join',
      description: 'Get column details with parent table information',
      query: `SELECT tbl.name AS table_name,
       col.name AS column_name,
       col.datatype,
       TO_TIMESTAMP(col.updatetime/1000) AS column_updated,
       tbl.rowcount
FROM COLUMN_ENTITY col
JOIN TABLE_ENTITY tbl ON col."TABLE"[0] = tbl.guid
LIMIT 50;`
    },
    {
      title: 'Find Column by GUID',
      description: 'Get parent table for a specific column',
      query: `-- COLUMNS is an ARRAY - use ::STRING ILIKE for GUID match
SELECT name AS table_name, rowcount
FROM TABLE_ENTITY
WHERE columns::STRING ILIKE '%<COLUMN_GUID>%';`
    },
    {
      title: 'Untagged Tables',
      description: 'Find tables without any classification tags',
      query: `SELECT GUID, QUALIFIEDNAME, COLUMNCOUNT, ROWCOUNT
FROM TABLE_ENTITY
WHERE ASSETTAGS = '[]';`
    },
    {
      title: 'Inactive Tables',
      description: 'Find tables with inactive status',
      query: `SELECT GUID, QUALIFIEDNAME, COLUMNCOUNT, ROWCOUNT, QUERYCOUNT
FROM TABLE_ENTITY
WHERE STATUS = 'INACTIVE'
LIMIT 100`
    },
  ],
  queries: [
    {
      title: 'List Collections',
      description: 'View all Insights collections',
      query: `SELECT * FROM COLLECTION_ENTITY;`
    },
    {
      title: 'Collection Hierarchy',
      description: 'See folders within collections',
      query: `SELECT c.NAME as collection_name, f.NAME as folder_name
FROM COLLECTION_ENTITY c
LEFT JOIN FOLDER_ENTITY f ON f.COLLECTIONQUALIFIEDNAME = c.QUALIFIEDNAME;`
    },
  ],
  bi: [
    {
      title: 'Tableau Calculated Field Duplicates',
      description: 'Find potential duplicate calculated fields by name',
      query: `WITH standardized_metrics AS (
  SELECT NAME AS original_metric_name, GUID AS metric_guid,
         FORMULA AS original_formula,
         LOWER(REGEXP_REPLACE(NAME, '[ _-]', '', 1, 0)) AS standardized_name
  FROM TABLEAUCALCULATEDFIELD_ENTITY
)
SELECT DISTINCT
  t1.original_metric_name AS duplicate_1_name,
  t1.metric_guid AS duplicate_1_guid,
  t1.original_formula AS duplicate_1_formula,
  t2.original_metric_name AS duplicate_2_name,
  t2.metric_guid AS duplicate_2_guid,
  t2.original_formula AS duplicate_2_formula
FROM standardized_metrics t1
JOIN standardized_metrics t2
  ON t1.standardized_name LIKE '%' || t2.standardized_name || '%'
  AND LENGTH(t1.standardized_name) > LENGTH(t2.standardized_name)
  AND t1.metric_guid != t2.metric_guid
ORDER BY duplicate_1_name;`
    },
    {
      title: 'Tableau Formula Duplicates',
      description: 'Find calculated fields with identical formulas',
      query: `WITH standardized_metrics AS (
  SELECT NAME AS metric_name, GUID AS metric_guid, FORMULA AS original_formula,
         LOWER(REGEXP_REPLACE(FORMULA, '[ _\\[\\]]', '', 1, 0)) AS standardized_formula
  FROM TABLEAUCALCULATEDFIELD_ENTITY
)
SELECT standardized_formula,
       COUNT(*) AS number_of_metrics,
       LISTAGG(metric_guid, ', ') WITHIN GROUP (ORDER BY metric_guid) AS all_guids,
       LISTAGG(metric_name, ', ') WITHIN GROUP (ORDER BY metric_name) AS all_names
FROM standardized_metrics
GROUP BY standardized_formula
HAVING COUNT(*) > 1
ORDER BY number_of_metrics DESC;`
    },
    {
      title: 'Power BI Measure Duplicates',
      description: 'Find measures with same name across tables',
      query: `SELECT
  t1.NAME "MEASURE 1 NAME",
  t1.GUID "MEASURE 1 GUID",
  t1.POWERBIMEASUREEXPRESSION "MEASURE 1 EXPRESSION",
  t2.NAME "MEASURE 2 NAME",
  t2.GUID "MEASURE 2 GUID",
  t2.POWERBIMEASUREEXPRESSION "MEASURE 2 EXPRESSION",
  t1."TABLE" "COMMON TABLE"
FROM POWERBIMEASURE_ENTITY t1
JOIN POWERBIMEASURE_ENTITY t2
  ON t1.NAME = t2.NAME
  AND GET(t1."TABLE", 0) = GET(t2."TABLE", 0)
WHERE t1.GUID < t2.GUID
ORDER BY "MEASURE 1 NAME";`
    },
    {
      title: 'Power BI Measures by Popularity',
      description: 'Find most popular Power BI measures',
      query: `SELECT NAME, POPULARITYSCORE, POWERBIMEASUREEXPRESSION
FROM POWERBIMEASURE_ENTITY
ORDER BY POPULARITYSCORE DESC
LIMIT 20;`
    },
    {
      title: 'Tables with Measures',
      description: 'Find Power BI tables that have measures',
      query: `SELECT * FROM POWERBITABLE_ENTITY
WHERE POWERBITABLEMEASURECOUNT > 0;`
    },
  ],
  dbt: [
    {
      title: 'dbt Job Status Summary',
      description: 'Count models by job status',
      query: `SELECT dbtJobStatus, COUNT(*) as count
FROM DBTMODELCOLUMN_ENTITY
GROUP BY dbtJobStatus
ORDER BY count DESC`
    },
    {
      title: 'dbt Models Overview',
      description: 'View dbt models with materialization type',
      query: `SELECT NAME, DBTALIAS, DBTMATERIALIZATION, DBTRAWSQL
FROM DBTMODEL_ENTITY
LIMIT 50;`
    },
  ],
  storage: [
    {
      title: 'S3 Bucket Overview',
      description: 'List S3 buckets with object counts',
      query: `SELECT NAME, S3BUCKETARN, AWSREGION, S3OBJECTCOUNT
FROM S3BUCKET_ENTITY
ORDER BY S3OBJECTCOUNT DESC;`
    },
  ],
  orchestration: [
    {
      title: 'Airflow DAGs',
      description: 'List all Airflow DAGs with schedules',
      query: `SELECT NAME, AIRFLOWDAGSCHEDULE, AIRFLOWDAGSCHEDULEINTERVAL
FROM AIRFLOWDAG_ENTITY;`
    },
    {
      title: 'Workflow Entities',
      description: 'View all workflow definitions',
      query: `SELECT * FROM WORKFLOW_ENTITY;`
    },
  ],
  governance: [
    {
      title: 'Most Popular Tags',
      description: 'Find most frequently used classification tags',
      query: `SELECT TAGNAME, COUNT(TAGNAME) as usage_count
FROM TAG_RELATIONSHIP
GROUP BY TAGNAME
ORDER BY usage_count DESC;`
    },
    {
      title: 'Tagged Tables',
      description: 'List all tables with their assigned tags',
      query: `-- Get all tables that have tags and their tag names
-- Useful for auditing tag coverage
SELECT
  TB.GUID,
  TB.NAME AS TABLENAME,
  TG.TAGNAME
FROM TABLE_ENTITY TB
JOIN TAG_RELATIONSHIP TG ON TB.GUID = TG.ENTITYGUID
WHERE TB.NAME IS NOT NULL;`
    },
    {
      title: 'Untagged Tables (Compliance)',
      description: 'Find tables without tags for compliance - includes creator and database for notification',
      query: `-- TAG COMPLIANCE USE CASE
-- Some companies require all tables to have a tag
-- (e.g., specifying data retention period).
-- Tables without tags may be flagged for deletion.

-- Find all untagged tables with creator info for follow-up:
SELECT DISTINCT
  TB.GUID,
  TB.NAME AS TABLENAME,
  TB.CREATEDBY,
  TB.DATABASEQUALIFIEDNAME
FROM TABLE_ENTITY TB
LEFT JOIN TAG_RELATIONSHIP TG ON TB.GUID = TG.ENTITYGUID
WHERE TG.TAGNAME IS NULL;

-- Use this to notify creators to add required tags`
    },
    {
      title: 'Custom Metadata Query',
      description: 'Find assets with specific custom metadata values',
      query: `SELECT col.guid, col.name AS column_name,
       cm.attributedisplayname, cm.attributevalue
FROM COLUMN_ENTITY col
JOIN CUSTOMMETADATA_RELATIONSHIP cm ON col.guid = cm.entityguid
WHERE attributedisplayname = 'Cost Center Attribution'
  AND attributevalue = 'COGS';`
    },
    {
      title: 'Custom Metadata Overview',
      description: 'Explore all custom metadata attributes',
      query: `SELECT DISTINCT attributedisplayname, attributevalue, COUNT(*)
FROM CUSTOMMETADATA_RELATIONSHIP
GROUP BY attributedisplayname, attributevalue
ORDER BY COUNT(*) DESC;`
    },
    {
      title: 'Assets with Tags (Join Pattern)',
      description: 'List assets with their tags using JOIN pattern',
      query: `-- Pattern for listing any asset type with tags
SELECT
  TB.GUID,
  TB.NAME AS TABLENAME,
  TG.TAGNAME
FROM TABLE_ENTITY TB
JOIN TAG_RELATIONSHIP TG ON TB.GUID = TG.ENTITYGUID
WHERE TB.NAME IS NOT NULL;

-- Same pattern works for columns, views, etc.
-- Just replace TABLE_ENTITY with the entity type you need`
    },
  ],
  ai: [
    {
      title: 'AI Models Overview',
      description: 'List all AI/ML models with status',
      query: `SELECT NAME, AIMODELSTATUS, AIMODELVERSION, AIMODELTYPE
FROM AIMODEL_ENTITY
ORDER BY AIMODELVERSION DESC;`
    },
  ],
};

// =============================================================================
// MERGED QUERIES WITH USER RESEARCH
// =============================================================================

/**
 * Merged example queries including user research queries
 * User research queries are added to their respective categories
 */
export const mergedExampleQueries = {
  // Core queries - add Asset Discovery and Count & Statistics
  core: [
    ...(userQueryGroups['Asset Discovery'] || []),
    ...(userQueryGroups['Count & Statistics'] || []),
    ...exampleQueries.core,
  ],
  
  // Glossary - add Glossary & Terms
  glossary: [
    ...(userQueryGroups['Glossary & Terms'] || []),
    ...exampleQueries.glossary,
  ],
  
  // Data Mesh
  datamesh: [
    ...(userQueryGroups['Domain-Specific'] || []),
    ...exampleQueries.datamesh,
  ],
  
  // Relational - add Column Metadata and Storage Analysis
  relational: [
    ...(userQueryGroups['Column Metadata'] || []),
    ...(userQueryGroups['Storage Analysis'] || []),
    ...exampleQueries.relational,
  ],
  
  // Queries - add Query Organization
  queries: [
    ...(userQueryGroups['Query Organization'] || []),
    ...exampleQueries.queries,
  ],
  
  // BI
  bi: [
    ...(userQueryGroups['Duplicate Detection'] || []),
    ...exampleQueries.bi,
  ],
  
  // dbt
  dbt: exampleQueries.dbt,
  
  // Storage
  storage: exampleQueries.storage,
  
  // Orchestration
  orchestration: exampleQueries.orchestration,
  
  // Governance - add Governance & Ownership and Data Quality
  governance: [
    ...(userQueryGroups['Governance & Ownership'] || []),
    ...(userQueryGroups['Data Quality'] || []),
    ...exampleQueries.governance,
  ],
  
  // AI
  ai: exampleQueries.ai,
  
  // New: Lineage category from user research
  lineage: [
    ...(userQueryGroups['Data Lineage'] || []),
  ],
  
  // New: Usage & Popularity category
  usage: [
    ...(userQueryGroups['Usage & Popularity'] || []),
  ],
};

// Helper function to get all user research queries flat
export function getAllUserResearchQueries() {
  return USER_RESEARCH_QUERIES.map(convertToExampleFormat);
}

// Helper function to search queries by user intent
export function searchByUserIntent(searchTerm) {
  const term = searchTerm.toLowerCase();
  return getAllUserResearchQueries().filter(q => 
    q.userIntent?.toLowerCase().includes(term) ||
    q.title?.toLowerCase().includes(term) ||
    q.description?.toLowerCase().includes(term)
  );
}

// Helper function to get queries sorted by frequency
export function getQueriesSortedByFrequency() {
  const frequencyOrder = { 'Very High': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
  return getAllUserResearchQueries().sort((a, b) => {
    const aOrder = frequencyOrder[a.frequency] ?? 4;
    const bOrder = frequencyOrder[b.frequency] ?? 4;
    return aOrder - bOrder;
  });
}

export default exampleQueries;

