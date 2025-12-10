/**
 * MDLH + Snowflake Query Library
 * 
 * Dual-layer query system:
 * - MDLH Layer: Atlan metadata (lineage, tags, glossary, ownership)
 * - Snowflake Layer: Platform reality (usage, structure, policies, costs)
 * - User Research Layer: Real queries from Slack/Confluence user research
 * 
 * Use {{PLACEHOLDERS}} for dynamic values that get filled from EntityContext
 */

import { 
  USER_RESEARCH_QUERIES, 
  FREQUENCY_STYLES, 
  FREQUENCY_LEVELS,
  getQueriesByFrequency,
  getQueriesByCategory,
  searchQueries as searchUserQueries,
} from './mdlhUserQueries';

import { buildSafeFQN, escapeStringValue } from '../utils/queryHelpers';

// =============================================================================
// ENTITY CONTEXT TYPE
// =============================================================================

/**
 * @typedef {Object} EntityContext
 * @property {string} [database] - Snowflake database
 * @property {string} [schema] - Snowflake schema
 * @property {string} [table] - Table name
 * @property {string} [column] - Column name
 * @property {string} [guid] - Atlan GUID
 * @property {string} [qualifiedName] - Atlan qualified name
 * @property {string} [entityType] - TABLE | VIEW | COLUMN | PROCESS | TERM | DASHBOARD | MODEL | GLOSSARY
 * @property {string} [connectorName] - snowflake | databricks | tableau etc.
 * @property {number} [daysBack] - Time window for usage queries (default: 30)
 */

// =============================================================================
// TEMPLATE FILL HELPER
// =============================================================================

/**
 * @typedef {Object} SampleEntities
 * @property {Array<Object>} [tables] - Sample TABLE_ENTITY rows
 * @property {Array<Object>} [columns] - Sample COLUMN_ENTITY rows
 * @property {Array<Object>} [processes] - Sample PROCESS_ENTITY rows
 * @property {Array<Object>} [terms] - Sample ATLASGLOSSARYTERM rows
 * @property {Array<Object>} [glossaries] - Sample ATLASGLOSSARY rows
 */

/**
 * Extract a GUID from sample entity rows
 * @param {Array<Object>} rows - Sample rows
 * @returns {string|null} First GUID found
 */
function extractGuidFromSamples(rows) {
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const guidKey = Object.keys(row).find(k => k.toLowerCase() === 'guid');
  return guidKey ? row[guidKey] : null;
}

/**
 * Extract a name from sample entity rows
 * @param {Array<Object>} rows - Sample rows
 * @returns {string|null} First name found
 */
function extractNameFromSamples(rows) {
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const nameKey = Object.keys(row).find(k => k.toLowerCase() === 'name');
  return nameKey ? row[nameKey] : null;
}

/**
 * Fill placeholders in SQL template with context values
 * This is the basic version - for user-facing display and copy/paste.
 * 
 * SMART ENTITY TABLE SUBSTITUTION:
 * - Replaces hardcoded entity table names (TABLE_ENTITY, PROCESS_ENTITY, etc.)
 *   with the actual tables that exist in the user's database
 * - Uses samples.tablesTable, samples.processesTable, etc. for actual table names
 * 
 * @param {string} sqlTemplate - SQL with {{PLACEHOLDERS}}
 * @param {EntityContext} ctx - Entity context
 * @param {SampleEntities} [samples] - Optional sample entities to use for real GUIDs/names
 * @returns {string} Filled SQL
 */
export function fillTemplate(sqlTemplate, ctx, samples = null) {
  // If samples provided, use real GUIDs instead of placeholders
  let effectiveGuid = ctx.guid;
  let effectiveTermGuid = ctx.termGuid;
  let effectiveGlossaryGuid = ctx.glossaryGuid;
  let effectiveTable = ctx.table;
  let effectiveColumn = ctx.column;

  // Start with the template
  let result = sqlTemplate;

  if (samples) {
    // Use sample GUIDs when context doesn't have them
    if (!effectiveGuid || effectiveGuid === '<GUID>') {
      effectiveGuid = extractGuidFromSamples(samples.tables) || 
                      extractGuidFromSamples(samples.columns) ||
                      extractGuidFromSamples(samples.processes);
    }
    if (!effectiveTermGuid || effectiveTermGuid === '<TERM_GUID>') {
      effectiveTermGuid = extractGuidFromSamples(samples.terms);
    }
    if (!effectiveGlossaryGuid || effectiveGlossaryGuid === '<GLOSSARY_GUID>') {
      effectiveGlossaryGuid = extractGuidFromSamples(samples.glossaries);
    }
    if (!effectiveTable || effectiveTable === '<TABLE>') {
      effectiveTable = extractNameFromSamples(samples.tables);
    }
    if (!effectiveColumn || effectiveColumn === '<COLUMN>') {
      effectiveColumn = extractNameFromSamples(samples.columns);
    }

    // SMART: Replace hardcoded entity table names with actual discovered tables
    // This handles cases where TABLE_ENTITY doesn't exist but TABLEAU_ENTITY does
    if (samples.tablesTable) {
      result = result.replace(/\bTABLE_ENTITY\b/gi, samples.tablesTable);
    }
    if (samples.columnsTable) {
      result = result.replace(/\bCOLUMN_ENTITY\b/gi, samples.columnsTable);
    }
    if (samples.processesTable) {
      result = result.replace(/\bPROCESS_ENTITY\b/gi, samples.processesTable);
    }
    if (samples.termsTable) {
      result = result.replace(/\bATLASGLOSSARYTERM\b/gi, samples.termsTable);
    }
    if (samples.glossariesTable) {
      result = result.replace(/\bATLASGLOSSARY\b/gi, samples.glossariesTable);
    }
  }

  // Get effective values for additional context fields
  const effectiveFilter = ctx.filter || ctx.searchTerm || '';
  const effectiveDomain = ctx.domain || ctx.database || '';
  const effectiveTerm = ctx.term || ctx.searchTerm || '';
  const effectiveSource = ctx.source || ctx.connectionName || ctx.connectorName || '';
  const effectiveStartGuid = ctx.startGuid || effectiveGuid || '';

  return result
    // UPPERCASE placeholders (primary)
    .replace(/\{\{DATABASE\}\}/g, ctx.database || '<DATABASE>')
    .replace(/\{\{SCHEMA\}\}/g, ctx.schema || '<SCHEMA>')
    .replace(/\{\{TABLE\}\}/g, effectiveTable || '<TABLE>')
    .replace(/\{\{COLUMN\}\}/g, effectiveColumn || '<COLUMN>')
    .replace(/\{\{GUID\}\}/g, effectiveGuid || '<GUID>')
    .replace(/\{\{QUALIFIED_NAME\}\}/g, ctx.qualifiedName || '<QUALIFIED_NAME>')
    .replace(/\{\{DAYS_BACK\}\}/g, String(ctx.daysBack || 30))
    .replace(/\{\{OWNER_USERNAME\}\}/g, ctx.ownerUsername || '<OWNER>')
    .replace(/\{\{TERM_GUID\}\}/g, effectiveTermGuid || '<TERM_GUID>')
    .replace(/\{\{GLOSSARY_GUID\}\}/g, effectiveGlossaryGuid || '<GLOSSARY_GUID>')
    .replace(/\{\{START_GUID\}\}/g, effectiveStartGuid || '<START_GUID>')
    
    // lowercase placeholders (from user research queries)
    .replace(/\{\{database\}\}/g, ctx.database || '<database>')
    .replace(/\{\{schema\}\}/g, ctx.schema || '<schema>')
    .replace(/\{\{table\}\}/g, effectiveTable || '<table>')
    .replace(/\{\{column\}\}/g, effectiveColumn || '<column>')
    .replace(/\{\{guid\}\}/g, effectiveGuid || '<guid>')
    .replace(/\{\{filter\}\}/g, effectiveFilter || '<filter>')
    .replace(/\{\{domain\}\}/g, effectiveDomain || '<domain>')
    .replace(/\{\{term\}\}/g, effectiveTerm || '<term>')
    .replace(/\{\{source\}\}/g, effectiveSource || '<source>')
    .replace(/\{\{metadata_set\}\}/g, ctx.metadata_set || ctx.metadataSet || '<metadata_set>')
    
    // Angle bracket placeholders (legacy format) - replace with actual values when available
    .replace(/<YOUR_SOURCE_GUID>/g, effectiveStartGuid || '<YOUR_SOURCE_GUID>')
    .replace(/<YOUR_TARGET_GUID>/g, effectiveGuid || '<YOUR_TARGET_GUID>')
    .replace(/<YOUR_GUID>/g, effectiveGuid || '<YOUR_GUID>')
    .replace(/<CORE_GLOSSARY_GUID>/g, effectiveGlossaryGuid || '<CORE_GLOSSARY_GUID>')
    .replace(/<GLOSSARY_GUID>/g, effectiveGlossaryGuid || '<GLOSSARY_GUID>')
    .replace(/<COLUMN_GUID>/g, ctx.columnGuid || effectiveGuid || '<COLUMN_GUID>');
}

/**
 * Fill template with sample entities, returning both the SQL and what samples were used.
 * This is useful for showing users what real entities the query will operate on.
 * 
 * @param {string} sqlTemplate - SQL with {{PLACEHOLDERS}}
 * @param {EntityContext} ctx - Entity context
 * @param {SampleEntities} samples - Sample entities from discovery
 * @returns {{ sql: string, usedSamples: Object }} Filled SQL and info about samples used
 */
export function fillTemplateWithSampleInfo(sqlTemplate, ctx, samples) {
  const usedSamples = {
    guid: null,
    guidSource: null,
    termGuid: null,
    glossaryGuid: null,
    tableName: null,
    columnName: null
  };

  // Determine which samples to use
  if (!ctx.guid || ctx.guid === '<GUID>') {
    if (samples?.tables?.[0]) {
      usedSamples.guid = extractGuidFromSamples(samples.tables);
      usedSamples.guidSource = 'TABLE_ENTITY';
    } else if (samples?.columns?.[0]) {
      usedSamples.guid = extractGuidFromSamples(samples.columns);
      usedSamples.guidSource = 'COLUMN_ENTITY';
    } else if (samples?.processes?.[0]) {
      usedSamples.guid = extractGuidFromSamples(samples.processes);
      usedSamples.guidSource = 'PROCESS_ENTITY';
    }
  }

  if ((!ctx.termGuid || ctx.termGuid === '<TERM_GUID>') && samples?.terms?.[0]) {
    usedSamples.termGuid = extractGuidFromSamples(samples.terms);
  }

  if ((!ctx.glossaryGuid || ctx.glossaryGuid === '<GLOSSARY_GUID>') && samples?.glossaries?.[0]) {
    usedSamples.glossaryGuid = extractGuidFromSamples(samples.glossaries);
  }

  if ((!ctx.table || ctx.table === '<TABLE>') && samples?.tables?.[0]) {
    usedSamples.tableName = extractNameFromSamples(samples.tables);
  }

  if ((!ctx.column || ctx.column === '<COLUMN>') && samples?.columns?.[0]) {
    usedSamples.columnName = extractNameFromSamples(samples.columns);
  }

  const sql = fillTemplate(sqlTemplate, ctx, samples);
  
  return { sql, usedSamples };
}

/**
 * Fill placeholders in SQL template with SAFELY ESCAPED context values.
 * Use this when the SQL will be executed programmatically.
 * 
 * - Table references use buildSafeFQN for proper quoting
 * - String values (GUIDs, names) use escapeStringValue for SQL injection protection
 * 
 * @param {string} sqlTemplate - SQL with {{PLACEHOLDERS}}
 * @param {EntityContext} ctx - Entity context
 * @returns {string} Filled SQL with properly escaped values
 */
export function fillTemplateSafe(sqlTemplate, ctx) {
  // Build safe FQN for the table reference
  const safeFQN = ctx.database && ctx.schema && ctx.table 
    ? buildSafeFQN(ctx.database, ctx.schema, ctx.table)
    : null;
  
  // Effective values for additional fields
  const effectiveFilter = ctx.filter || ctx.searchTerm || '';
  const effectiveDomain = ctx.domain || ctx.database || '';
  const effectiveTerm = ctx.term || ctx.searchTerm || '';
  const effectiveSource = ctx.source || ctx.connectionName || ctx.connectorName || '';
  const effectiveStartGuid = ctx.startGuid || ctx.guid || '';
  
  return sqlTemplate
    // For FQN pattern {{DATABASE}}.{{SCHEMA}}.{{TABLE}}, replace entire pattern if we have all parts
    .replace(/\{\{DATABASE\}\}\.\{\{SCHEMA\}\}\.\{\{TABLE\}\}/g, 
      safeFQN || `${ctx.database || '<DATABASE>'}.${ctx.schema || '<SCHEMA>'}.${ctx.table || '<TABLE>'}`)
    
    // UPPERCASE placeholders
    .replace(/\{\{DATABASE\}\}/g, ctx.database || '<DATABASE>')
    .replace(/\{\{SCHEMA\}\}/g, ctx.schema || '<SCHEMA>')
    .replace(/\{\{TABLE\}\}/g, ctx.table || '<TABLE>')
    .replace(/\{\{COLUMN\}\}/g, ctx.column || '<COLUMN>')
    .replace(/\{\{GUID\}\}/g, ctx.guid || '<GUID>')
    .replace(/\{\{QUALIFIED_NAME\}\}/g, ctx.qualifiedName || '<QUALIFIED_NAME>')
    .replace(/\{\{DAYS_BACK\}\}/g, String(ctx.daysBack || 30))
    .replace(/\{\{OWNER_USERNAME\}\}/g, ctx.ownerUsername || '<OWNER>')
    .replace(/\{\{TERM_GUID\}\}/g, ctx.termGuid || '<TERM_GUID>')
    .replace(/\{\{GLOSSARY_GUID\}\}/g, ctx.glossaryGuid || '<GLOSSARY_GUID>')
    .replace(/\{\{START_GUID\}\}/g, effectiveStartGuid || '<START_GUID>')
    
    // lowercase placeholders
    .replace(/\{\{database\}\}/g, ctx.database || '<database>')
    .replace(/\{\{schema\}\}/g, ctx.schema || '<schema>')
    .replace(/\{\{table\}\}/g, ctx.table || '<table>')
    .replace(/\{\{column\}\}/g, ctx.column || '<column>')
    .replace(/\{\{guid\}\}/g, ctx.guid || '<guid>')
    .replace(/\{\{filter\}\}/g, effectiveFilter || '<filter>')
    .replace(/\{\{domain\}\}/g, effectiveDomain || '<domain>')
    .replace(/\{\{term\}\}/g, effectiveTerm || '<term>')
    .replace(/\{\{source\}\}/g, effectiveSource || '<source>')
    
    // Angle bracket placeholders
    .replace(/<YOUR_SOURCE_GUID>/g, effectiveStartGuid || '<YOUR_SOURCE_GUID>')
    .replace(/<YOUR_TARGET_GUID>/g, ctx.guid || '<YOUR_TARGET_GUID>')
    .replace(/<YOUR_GUID>/g, ctx.guid || '<YOUR_GUID>')
    .replace(/<CORE_GLOSSARY_GUID>/g, ctx.glossaryGuid || '<CORE_GLOSSARY_GUID>')
    .replace(/<COLUMN_GUID>/g, ctx.columnGuid || ctx.guid || '<COLUMN_GUID>');
}

/**
 * Build a fully qualified table name using safe escaping
 * Convenience wrapper for templates
 * 
 * @param {EntityContext} ctx - Entity context with database, schema, table
 * @returns {string} Safely built FQN
 */
export function buildTableFQN(ctx) {
  if (!ctx.database || !ctx.schema || !ctx.table) {
    return `${ctx.database || '<DATABASE>'}.${ctx.schema || '<SCHEMA>'}.${ctx.table || '<TABLE>'}`;
  }
  return buildSafeFQN(ctx.database, ctx.schema, ctx.table);
}

// =============================================================================
// QUERY LAYERS
// =============================================================================

export const QUERY_LAYERS = {
  MDLH: 'mdlh',
  SNOWFLAKE: 'snowflake',
};

export const QUERY_CATEGORIES = {
  STRUCTURE: 'structure',
  LINEAGE: 'lineage',
  GOVERNANCE: 'governance',
  USAGE: 'usage',
  QUALITY: 'quality',
  GLOSSARY: 'glossary',
  COST: 'cost',
};

// =============================================================================
// PART 1: MDLH QUERIES (Atlan Metadata Layer)
// =============================================================================

export const MDLH_QUERIES = {
  // ---------------------------------------------------------------------------
  // Category A: Asset Discovery & Structure
  // ---------------------------------------------------------------------------
  
  entity_types_overview: {
    id: 'mdlh_entity_types_overview',
    label: 'Entity Types Overview',
    description: 'All MDLH entity types with row counts and sizes',
    category: QUERY_CATEGORIES.STRUCTURE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'Database',
    requires: [],
    sql: `-- All available MDLH entity types and their volume
SELECT 
  table_name AS entity_type,
  row_count,
  ROUND(bytes / 1024 / 1024, 2) AS size_mb
FROM INFORMATION_SCHEMA.TABLES
WHERE table_schema = 'PUBLIC'
  AND table_type = 'BASE TABLE'
ORDER BY row_count DESC;`,
  },

  table_asset_details: {
    id: 'mdlh_table_asset_details',
    label: 'Asset Details (Atlan)',
    description: 'Full Atlan metadata for this table',
    category: QUERY_CATEGORIES.STRUCTURE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'FileText',
    requires: ['database', 'schema', 'table'],
    sql: `-- Atlan metadata for table
SELECT * 
FROM TABLE_ENTITY 
WHERE QUALIFIEDNAME LIKE '%{{DATABASE}}.{{SCHEMA}}.{{TABLE}}%'
LIMIT 10;`,
  },

  column_metadata_comprehensive: {
    id: 'mdlh_column_metadata',
    label: 'Column Metadata + Tags',
    description: 'Columns with custom metadata and classification tags',
    category: QUERY_CATEGORIES.STRUCTURE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'Columns',
    requires: [],
    sql: `-- Column metadata with custom metadata and tags
WITH FILTERED_COLUMNS AS (
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
    COL.NAME, COL.QUALIFIEDNAME, COL.GUID, COL.DISPLAYNAME,
    COL.DESCRIPTION, COL.USERDESCRIPTION, COL.CONNECTORNAME,
    COL.CONNECTIONNAME, COL.DATABASENAME, COL.SCHEMANAME,
    COL.TABLENAME, COL.TYPENAME, COL.DATATYPE,
    TR_AGG.TAG_JSON,
    CM_AGG.CUSTOM_METADATA_JSON,
    COL.STATUS, COL.OWNERUSERS, COL.OWNERGROUPS,
    COL.ISPROFILED, COL.COLUMNDISTINCTVALUESCOUNT,
    COL.COLUMNMAX, COL.COLUMNMIN, COL.COLUMNMEAN
FROM COLUMN_ENTITY COL
LEFT JOIN CM_AGG ON COL.GUID = CM_AGG.ENTITYGUID
LEFT JOIN TR_AGG ON COL.GUID = TR_AGG.ENTITYGUID
WHERE COL.CONNECTORNAME IN ('glue', 'snowflake')
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Category B: Lineage Analysis
  // ---------------------------------------------------------------------------

  upstream_direct: {
    id: 'mdlh_upstream',
    label: 'Upstream Lineage (1 hop)',
    description: 'Direct upstream assets feeding this entity',
    category: QUERY_CATEGORIES.LINEAGE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'ArrowUpLeft',
    requires: ['guid'],
    sql: `-- Direct upstream assets (1 hop)
-- INPUTS/OUTPUTS are ARRAY - use ::STRING for display and WHERE
SELECT 
    P.GUID AS process_guid,
    P.NAME AS process_name,
    P.INPUTS::STRING AS upstream_assets,
    P.OUTPUTS::STRING AS downstream_assets
FROM PROCESS_ENTITY P
WHERE P.OUTPUTS::STRING ILIKE '%{{GUID}}%'
LIMIT 50;`,
  },

  downstream_direct: {
    id: 'mdlh_downstream',
    label: 'Downstream Lineage (1 hop)',
    description: 'Direct downstream assets consuming this entity',
    category: QUERY_CATEGORIES.LINEAGE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'ArrowDownRight',
    requires: ['guid'],
    sql: `-- Direct downstream assets (1 hop)
-- INPUTS/OUTPUTS are ARRAY - use ::STRING for display and WHERE
SELECT 
    P.GUID AS process_guid,
    P.NAME AS process_name,
    P.INPUTS::STRING AS upstream_assets,
    P.OUTPUTS::STRING AS downstream_assets
FROM PROCESS_ENTITY P
WHERE P.INPUTS::STRING ILIKE '%{{GUID}}%'
LIMIT 50;`,
  },

  lineage_chain_recursive: {
    id: 'mdlh_lineage_chain',
    label: 'Full Lineage Chain',
    description: 'Recursive upstream lineage up to 5 hops',
    category: QUERY_CATEGORIES.LINEAGE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'GitBranch',
    requires: ['guid'],
    sql: `-- Full lineage chain (recursive CTE, up to 5 hops)
-- INPUTS/OUTPUTS are ARRAY - use ::STRING ILIKE for exact GUID match
WITH RECURSIVE lineage_chain AS (
    -- Base: direct upstream
    SELECT 
        P.GUID AS process_guid,
        INPUT.VALUE::STRING AS asset_guid,
        1 AS hop_level,
        'UPSTREAM' AS direction
    FROM PROCESS_ENTITY P,
         LATERAL FLATTEN(P.INPUTS) INPUT
    WHERE P.OUTPUTS::STRING ILIKE '%{{GUID}}%'
    
    UNION ALL
    
    -- Recursive: follow upstream
    SELECT 
        P.GUID,
        INPUT.VALUE::STRING,
        lc.hop_level + 1,
        'UPSTREAM'
    FROM lineage_chain lc
    JOIN PROCESS_ENTITY P ON P.OUTPUTS::STRING ILIKE '%' || lc.asset_guid || '%'
    CROSS JOIN LATERAL FLATTEN(P.INPUTS) INPUT
    WHERE lc.hop_level < 5  -- depth limit
)
SELECT DISTINCT
    asset_guid,
    hop_level,
    direction,
    T.NAME AS asset_name,
    T.TYPENAME AS asset_type
FROM lineage_chain lc
LEFT JOIN TABLE_ENTITY T ON lc.asset_guid = T.GUID
ORDER BY hop_level, asset_name;`,
  },

  impact_dashboards: {
    id: 'mdlh_impact_dashboards',
    label: 'Impacted Dashboards',
    description: 'Downstream dashboards that depend on this asset',
    category: QUERY_CATEGORIES.LINEAGE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'LayoutDashboard',
    requires: ['guid'],
    sql: `-- Impact analysis - downstream dashboards
-- INPUTS/OUTPUTS are ARRAY - use ::STRING ILIKE for GUID lookup
WITH downstream AS (
    SELECT 
        OUTPUT.VALUE::STRING AS downstream_guid
    FROM PROCESS_ENTITY P,
         LATERAL FLATTEN(P.OUTPUTS) OUTPUT
    WHERE P.INPUTS::STRING ILIKE '%{{GUID}}%'
)
SELECT 
    D.GUID,
    D.NAME,
    D.TYPENAME,
    D.CONNECTIONNAME
FROM downstream ds
JOIN TABLEAUDASHBOARD_ENTITY D ON ds.downstream_guid = D.GUID

UNION ALL

SELECT 
    D.GUID,
    D.NAME,
    D.TYPENAME,
    D.CONNECTIONNAME
FROM downstream ds
JOIN POWERBIDASHBOARD_ENTITY D ON ds.downstream_guid = D.GUID;`,
  },

  // ---------------------------------------------------------------------------
  // Category C: Governance & Compliance
  // ---------------------------------------------------------------------------

  tags_for_asset: {
    id: 'mdlh_tags',
    label: 'Atlan Tags',
    description: 'Classification tags applied to this asset',
    category: QUERY_CATEGORIES.GOVERNANCE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'Tag',
    requires: ['guid'],
    sql: `-- Tags applied to asset
SELECT
    TR.ENTITYGUID,
    TR.ENTITYTYPENAME,
    TR.TAGNAME,
    TR.TAGVALUE,
    TR.PROPAGATE,
    TR.PROPAGATEFROMLINEAGE
FROM TAG_RELATIONSHIP TR
WHERE TR.ENTITYGUID = '{{GUID}}';`,
  },

  tables_without_tags: {
    id: 'mdlh_untagged_tables',
    label: 'Untagged Tables (Compliance Gap)',
    description: 'Tables missing classification tags',
    category: QUERY_CATEGORIES.GOVERNANCE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'AlertTriangle',
    requires: [],
    sql: `-- Tables WITHOUT tags (compliance gap)
SELECT DISTINCT
    TB.GUID,
    TB.NAME AS table_name,
    TB.CREATEDBY,
    TB.DATABASEQUALIFIEDNAME
FROM TABLE_ENTITY TB
LEFT JOIN TAG_RELATIONSHIP TG ON TB.GUID = TG.ENTITYGUID
WHERE TG.TAGNAME IS NULL
  AND TB.STATUS = 'ACTIVE'
LIMIT 100;`,
  },

  pii_sensitive_discovery: {
    id: 'mdlh_pii_discovery',
    label: 'PII/Sensitive Data',
    description: 'Assets tagged as PII, Confidential, or Sensitive',
    category: QUERY_CATEGORIES.GOVERNANCE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'Shield',
    requires: [],
    sql: `-- PII/Sensitive data discovery
SELECT
    TR.ENTITYGUID,
    TE.NAME AS entity_name,
    TE.QUALIFIEDNAME,
    TR.TAGNAME,
    TR.TAGVALUE
FROM TAG_RELATIONSHIP TR
JOIN TABLE_ENTITY TE ON TR.ENTITYGUID = TE.GUID
WHERE TR.TAGNAME IN ('PII', 'Confidential', 'Sensitive', 'PHI')
ORDER BY TR.TAGNAME, TE.NAME
LIMIT 100;`,
  },

  assets_by_owner: {
    id: 'mdlh_by_owner',
    label: 'Assets by Owner',
    description: 'All assets owned by a specific user',
    category: QUERY_CATEGORIES.GOVERNANCE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'User',
    requires: ['ownerUsername'],
    sql: `-- Assets by owner
-- OWNERUSERS is an ARRAY - use ::STRING ILIKE for fuzzy username match
SELECT
    NAME,
    TYPENAME,
    QUALIFIEDNAME,
    OWNERUSERS,
    OWNERGROUPS,
    STATUS
FROM TABLE_ENTITY
WHERE OWNERUSERS::STRING ILIKE '%{{OWNER_USERNAME}}%'
ORDER BY TYPENAME, NAME
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Category D: Glossary & Business Context
  // ---------------------------------------------------------------------------

  all_glossaries: {
    id: 'mdlh_glossaries',
    label: 'All Glossaries',
    description: 'List all business glossaries',
    category: QUERY_CATEGORIES.GLOSSARY,
    layer: QUERY_LAYERS.MDLH,
    icon: 'BookOpen',
    requires: [],
    sql: `-- All glossaries
SELECT
    NAME,
    GUID,
    CREATEDBY,
    USERDESCRIPTION
FROM ATLASGLOSSARY_ENTITY
ORDER BY NAME;`,
  },

  terms_in_glossary: {
    id: 'mdlh_glossary_terms',
    label: 'Terms in Glossary',
    description: 'All terms in a specific glossary',
    category: QUERY_CATEGORIES.GLOSSARY,
    layer: QUERY_LAYERS.MDLH,
    icon: 'List',
    requires: ['glossaryGuid'],
    sql: `-- Terms in a glossary
-- ANCHOR is an OBJECT - use :guid::STRING ILIKE for GUID match
SELECT
    GUID,
    NAME,
    USERDESCRIPTION,
    STATUS
FROM ATLASGLOSSARYTERM_ENTITY
WHERE ANCHOR:guid::STRING ILIKE '%{{GLOSSARY_GUID}}%'
ORDER BY NAME;`,
  },

  assets_linked_to_term: {
    id: 'mdlh_term_assets',
    label: 'Assets Linked to Term',
    description: 'Tables and columns linked to a glossary term',
    category: QUERY_CATEGORIES.GLOSSARY,
    layer: QUERY_LAYERS.MDLH,
    icon: 'Link',
    requires: ['termGuid'],
    sql: `-- Assets linked to a glossary term
-- MEANINGS is an ARRAY - use ::STRING ILIKE for GUID match
SELECT
    T.GUID,
    T.NAME,
    T.TYPENAME,
    T.QUALIFIEDNAME
FROM TABLE_ENTITY T
WHERE T.MEANINGS::STRING ILIKE '%{{TERM_GUID}}%'

UNION ALL

SELECT
    C.GUID,
    C.NAME,
    C.TYPENAME,
    C.QUALIFIEDNAME
FROM COLUMN_ENTITY C
WHERE C.MEANINGS::STRING ILIKE '%{{TERM_GUID}}%';`,
  },

  duplicate_terms: {
    id: 'mdlh_duplicate_terms',
    label: 'Duplicate Terms',
    description: 'Detect glossary terms with similar names',
    category: QUERY_CATEGORIES.GLOSSARY,
    layer: QUERY_LAYERS.MDLH,
    icon: 'Copy',
    requires: [],
    sql: `-- Duplicate glossary term detection
SELECT
    LOWER(NAME) AS normalized_name,
    COUNT(*) AS term_count,
    ARRAY_AGG(GUID) AS guids,
    ARRAY_AGG(NAME) AS original_names
FROM ATLASGLOSSARYTERM_ENTITY
GROUP BY LOWER(NAME)
HAVING COUNT(*) > 1
ORDER BY term_count DESC;`,
  },

  // ---------------------------------------------------------------------------
  // Category E: Usage & Popularity
  // ---------------------------------------------------------------------------

  most_active_users: {
    id: 'mdlh_active_users',
    label: 'Most Active Users',
    description: 'Users who updated the most assets',
    category: QUERY_CATEGORIES.USAGE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'Users',
    requires: [],
    sql: `-- Most active users (by updates)
SELECT
    UPDATEDBY,
    TO_TIMESTAMP(MAX(UPDATETIME)/1000) AS last_update,
    COUNT(*) AS update_count
FROM COLUMN_ENTITY
GROUP BY UPDATEDBY
ORDER BY update_count DESC
LIMIT 20;`,
  },

  most_popular_tables: {
    id: 'mdlh_popular_tables',
    label: 'Most Popular Tables',
    description: 'Tables ranked by Atlan popularity score',
    category: QUERY_CATEGORIES.USAGE,
    layer: QUERY_LAYERS.MDLH,
    icon: 'TrendingUp',
    requires: [],
    sql: `-- Most popular tables (by popularity score)
SELECT
    NAME,
    QUALIFIEDNAME,
    POPULARITYSCORE,
    ROWCOUNT,
    SIZEBYTES / 1024 / 1024 AS size_mb
FROM TABLE_ENTITY
WHERE POPULARITYSCORE IS NOT NULL
ORDER BY POPULARITYSCORE DESC
LIMIT 50;`,
  },

  large_unused_tables: {
    id: 'mdlh_unused_tables',
    label: 'Large Unused Tables',
    description: 'Big tables with low popularity (cost optimization)',
    category: QUERY_CATEGORIES.COST,
    layer: QUERY_LAYERS.MDLH,
    icon: 'Trash2',
    requires: [],
    sql: `-- Large unused tables (cost optimization)
SELECT
    NAME,
    QUALIFIEDNAME,
    ROWCOUNT,
    SIZEBYTES / 1024 / 1024 AS size_mb,
    POPULARITYSCORE
FROM TABLE_ENTITY
WHERE SIZEBYTES IS NOT NULL
  AND (POPULARITYSCORE IS NULL OR POPULARITYSCORE < 0.1)
ORDER BY SIZEBYTES DESC
LIMIT 50;`,
  },
};

// =============================================================================
// PART 2: SNOWFLAKE SYSTEM QUERIES (Platform Reality Layer)
// =============================================================================

export const SNOWFLAKE_QUERIES = {
  // ---------------------------------------------------------------------------
  // Bundle A: Structure & Stats
  // ---------------------------------------------------------------------------

  columns_live: {
    id: 'sf_columns',
    label: 'Column Structure (Live)',
    description: 'Real-time column structure from Snowflake',
    category: QUERY_CATEGORIES.STRUCTURE,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'Columns',
    requires: ['database', 'schema', 'table'],
    sql: `-- Live column structure from Snowflake
SELECT
    column_name,
    data_type,
    is_nullable,
    comment
FROM {{DATABASE}}.information_schema.columns
WHERE table_schema = '{{SCHEMA}}'
  AND table_name = '{{TABLE}}'
ORDER BY ordinal_position;`,
  },

  table_size_rows: {
    id: 'sf_table_size',
    label: 'Table Size & Rows',
    description: 'Storage size, row count, and last altered time',
    category: QUERY_CATEGORIES.STRUCTURE,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'HardDrive',
    requires: ['database', 'schema', 'table'],
    sql: `-- Table size, rows, and last altered
SELECT
    t.table_name,
    t.row_count,
    t.bytes / 1024 / 1024 AS size_mb,
    t.retention_time,
    t.last_altered
FROM {{DATABASE}}.information_schema.tables t
WHERE t.table_schema = '{{SCHEMA}}'
  AND t.table_name = '{{TABLE}}';`,
  },

  data_freshness: {
    id: 'sf_freshness',
    label: 'Data Freshness',
    description: 'Most recent timestamp in the table',
    category: QUERY_CATEGORIES.QUALITY,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'Clock',
    requires: ['database', 'schema', 'table'],
    sql: `-- Data freshness (replace UPDATED_AT with actual timestamp column)
-- SELECT MAX("UPDATED_AT") AS last_update_at
-- FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}};

-- Alternative: check table metadata
SELECT 
    table_name,
    last_altered,
    DATEDIFF('hour', last_altered, CURRENT_TIMESTAMP()) AS hours_since_update
FROM {{DATABASE}}.information_schema.tables
WHERE table_schema = '{{SCHEMA}}'
  AND table_name = '{{TABLE}}';`,
  },

  // ---------------------------------------------------------------------------
  // Bundle B: Usage & Query History
  // ---------------------------------------------------------------------------

  top_users: {
    id: 'sf_top_users',
    label: 'Top Users (30d)',
    description: 'Users who query this table most frequently',
    category: QUERY_CATEGORIES.USAGE,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'Users',
    requires: ['database', 'schema', 'table'],
    sql: `-- Top users hitting this table (last {{DAYS_BACK}} days)
WITH table_access AS (
    SELECT
        q.query_id,
        q.user_name,
        q.role_name,
        q.start_time,
        q.total_elapsed_time,
        q.rows_produced
    FROM snowflake.account_usage.query_history q
    WHERE q.start_time >= DATEADD(day, -{{DAYS_BACK}}, CURRENT_TIMESTAMP())
      AND POSITION('{{DATABASE}}.{{SCHEMA}}.{{TABLE}}' IN UPPER(q.query_text)) > 0
)
SELECT
    user_name,
    role_name,
    COUNT(*) AS query_count,
    SUM(total_elapsed_time) / 1000.0 AS total_seconds,
    SUM(rows_produced) AS total_rows_produced
FROM table_access
GROUP BY user_name, role_name
ORDER BY query_count DESC
LIMIT 20;`,
  },

  expensive_queries: {
    id: 'sf_expensive_queries',
    label: 'Expensive Queries',
    description: 'Most costly queries by bytes scanned',
    category: QUERY_CATEGORIES.COST,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'DollarSign',
    requires: ['database', 'schema', 'table'],
    sql: `-- Most expensive queries (by bytes scanned)
SELECT
    q.query_id,
    q.user_name,
    q.start_time,
    q.total_elapsed_time / 1000.0 AS duration_seconds,
    q.bytes_scanned / 1024 / 1024 / 1024 AS gb_scanned,
    LEFT(q.query_text, 200) AS query_preview
FROM snowflake.account_usage.query_history q
WHERE q.start_time >= DATEADD(day, -{{DAYS_BACK}}, CURRENT_TIMESTAMP())
  AND POSITION('{{DATABASE}}.{{SCHEMA}}.{{TABLE}}' IN UPPER(q.query_text)) > 0
ORDER BY q.bytes_scanned DESC
LIMIT 20;`,
  },

  access_history: {
    id: 'sf_access_history',
    label: 'Access History',
    description: 'Recent access events for this table',
    category: QUERY_CATEGORIES.USAGE,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'Activity',
    requires: ['database', 'schema', 'table'],
    sql: `-- Access history (downstream objects reading this table)
SELECT
    ah.query_id,
    ah.user_name,
    ah.query_start_time,
    boa.value:"objectName"::string AS accessed_object
FROM snowflake.account_usage.access_history ah,
     LATERAL FLATTEN(ah.base_objects_accessed) AS boa
WHERE boa.value:"objectDomain"::string = 'Table'
  AND UPPER(boa.value:"objectName"::string) = '{{DATABASE}}.{{SCHEMA}}.{{TABLE}}'
  AND ah.query_start_time >= DATEADD(day, -{{DAYS_BACK}}, CURRENT_TIMESTAMP())
ORDER BY ah.query_start_time DESC
LIMIT 100;`,
  },

  // ---------------------------------------------------------------------------
  // Bundle C: Tags & Policies
  // ---------------------------------------------------------------------------

  native_tags: {
    id: 'sf_native_tags',
    label: 'Snowflake Tags',
    description: 'Native Snowflake tags on table and columns',
    category: QUERY_CATEGORIES.GOVERNANCE,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'Tag',
    requires: ['database', 'schema', 'table'],
    sql: `-- Native Snowflake tags on table & columns
SELECT
    object_database,
    object_schema,
    object_name,
    column_name,
    tag_database,
    tag_schema,
    tag_name,
    tag_value
FROM {{DATABASE}}.information_schema.tag_references_all_columns
WHERE object_schema = '{{SCHEMA}}'
  AND object_name = '{{TABLE}}'
ORDER BY column_name, tag_name;`,
  },

  masking_policies: {
    id: 'sf_policies',
    label: 'Masking Policies',
    description: 'Data masking and row access policies',
    category: QUERY_CATEGORIES.GOVERNANCE,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'Eye',
    requires: ['database', 'schema', 'table'],
    sql: `-- Masking & row access policies
SELECT
    policy_name,
    policy_kind,
    policy_status,
    policy_body,
    ref_column_name
FROM {{DATABASE}}.information_schema.policy_references
WHERE ref_database = '{{DATABASE}}'
  AND ref_schema = '{{SCHEMA}}'
  AND ref_entity_name = '{{TABLE}}'
ORDER BY policy_name;`,
  },

  // ---------------------------------------------------------------------------
  // Bundle D: Data Quality & Profiling
  // ---------------------------------------------------------------------------

  null_stats: {
    id: 'sf_null_stats',
    label: 'Null Analysis',
    description: 'Null counts and distinct values for a column',
    category: QUERY_CATEGORIES.QUALITY,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'Circle',
    requires: ['database', 'schema', 'table', 'column'],
    sql: `-- Column null & distinct stats
SELECT
    COUNT(*) AS total_rows,
    COUNT(*) - COUNT({{COLUMN}}) AS null_count,
    ROUND((COUNT(*) - COUNT({{COLUMN}}))::FLOAT / NULLIF(COUNT(*), 0) * 100, 2) AS null_pct,
    COUNT(DISTINCT {{COLUMN}}) AS distinct_values
FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}};`,
  },

  top_values: {
    id: 'sf_top_values',
    label: 'Top Values',
    description: 'Most frequent values in a column',
    category: QUERY_CATEGORIES.QUALITY,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'BarChart2',
    requires: ['database', 'schema', 'table', 'column'],
    sql: `-- Top values for a column
SELECT
    {{COLUMN}} AS value,
    COUNT(*) AS freq,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS pct
FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}}
GROUP BY {{COLUMN}}
ORDER BY freq DESC
LIMIT 50;`,
  },

  numeric_stats: {
    id: 'sf_numeric_stats',
    label: 'Numeric Stats',
    description: 'Min, max, avg, median, stddev for numeric column',
    category: QUERY_CATEGORIES.QUALITY,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'Hash',
    requires: ['database', 'schema', 'table', 'column'],
    sql: `-- Numeric column statistics
SELECT
    MIN({{COLUMN}}) AS min_value,
    MAX({{COLUMN}}) AS max_value,
    AVG({{COLUMN}}) AS avg_value,
    MEDIAN({{COLUMN}}) AS median_value,
    STDDEV({{COLUMN}}) AS stddev_value
FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}};`,
  },

  // ---------------------------------------------------------------------------
  // Bundle E: Platform / Account-Level
  // ---------------------------------------------------------------------------

  warehouse_costs: {
    id: 'sf_warehouse_costs',
    label: 'Warehouse Costs (30d)',
    description: 'Credit usage by warehouse',
    category: QUERY_CATEGORIES.COST,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'DollarSign',
    requires: [],
    sql: `-- Top warehouses by cost (last {{DAYS_BACK}} days)
SELECT
    warehouse_name,
    COUNT(*) AS query_count,
    SUM(credits_used_cloud_services) AS credits_cloud,
    SUM(credits_used_compute) AS credits_compute,
    SUM(credits_used_cloud_services + credits_used_compute) AS total_credits
FROM snowflake.account_usage.warehouse_metering_history
WHERE start_time >= DATEADD(day, -{{DAYS_BACK}}, CURRENT_TIMESTAMP())
GROUP BY warehouse_name
ORDER BY total_credits DESC
LIMIT 20;`,
  },

  most_accessed_tables: {
    id: 'sf_most_accessed',
    label: 'Most Accessed Tables',
    description: 'Tables with highest access frequency account-wide',
    category: QUERY_CATEGORIES.USAGE,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'TrendingUp',
    requires: [],
    sql: `-- Most accessed tables account-wide
WITH accessed AS (
    SELECT
        boa.value:"objectName"::string AS table_name,
        ah.user_name,
        ah.query_start_time
    FROM snowflake.account_usage.access_history ah,
         LATERAL FLATTEN(ah.base_objects_accessed) boa
    WHERE boa.value:"objectDomain"::string = 'Table'
      AND ah.query_start_time >= DATEADD(day, -{{DAYS_BACK}}, CURRENT_TIMESTAMP())
)
SELECT
    table_name,
    COUNT(*) AS access_events,
    COUNT(DISTINCT user_name) AS distinct_users
FROM accessed
GROUP BY table_name
ORDER BY access_events DESC
LIMIT 100;`,
  },

  failed_queries: {
    id: 'sf_failed_queries',
    label: 'Failed Queries',
    description: 'Common query errors and affected users',
    category: QUERY_CATEGORIES.QUALITY,
    layer: QUERY_LAYERS.SNOWFLAKE,
    icon: 'XCircle',
    requires: [],
    sql: `-- Failed queries (error analysis)
SELECT
    error_code,
    error_message,
    COUNT(*) AS error_count,
    COUNT(DISTINCT user_name) AS affected_users
FROM snowflake.account_usage.query_history
WHERE start_time >= DATEADD(day, -{{DAYS_BACK}}, CURRENT_TIMESTAMP())
  AND error_code IS NOT NULL
GROUP BY error_code, error_message
ORDER BY error_count DESC
LIMIT 20;`,
  },
};

// =============================================================================
// COMBINED QUERY REGISTRY
// =============================================================================

export const ALL_QUERIES = {
  ...MDLH_QUERIES,
  ...SNOWFLAKE_QUERIES,
};

// =============================================================================
// QUERY RECOMMENDATION ENGINE
// =============================================================================

/**
 * Extract table names referenced in a SQL query template
 * Used to determine if a query can be executed against available tables.
 * 
 * IMPORTANT: This must catch ALL hardcoded entity table names to prevent
 * queries with non-existent tables from being shown to users.
 * 
 * @param {string} sql - SQL query template
 * @returns {string[]} Array of table names (uppercase)
 */
export function extractReferencedTables(sql) {
  if (!sql) return [];
  
  const tables = new Set();
  
  // Match FROM <table> patterns (handles _ENTITY and ATLAS tables)
  const fromPattern = /FROM\s+(?:[\w"]+\.)*(\w+_ENTITY|ATLAS\w+)/gi;
  let match;
  while ((match = fromPattern.exec(sql)) !== null) {
    const table = match[1].toUpperCase();
    // Skip placeholders and system tables
    if (!table.includes('{{') && 
        !table.includes('<') &&
        !table.startsWith('INFORMATION_SCHEMA') && 
        !table.startsWith('SNOWFLAKE.') &&
        table !== 'ENTITY') {
      tables.add(table);
    }
  }
  
  // Match JOIN <table> patterns
  const joinPattern = /JOIN\s+(?:[\w"]+\.)*(\w+_ENTITY|ATLAS\w+)/gi;
  while ((match = joinPattern.exec(sql)) !== null) {
    const table = match[1].toUpperCase();
    if (!table.includes('{{') && 
        !table.includes('<') &&
        !table.startsWith('INFORMATION_SCHEMA') &&
        table !== 'ENTITY') {
      tables.add(table);
    }
  }
  
  // Also match standalone entity table references (e.g., "TABLE_ENTITY T" or aliases)
  // This catches tables used with aliases that might not be caught by FROM/JOIN
  const entityPattern = /\b(\w+_ENTITY|ATLAS\w+_ENTITY|ATLAS\w+)\b/gi;
  while ((match = entityPattern.exec(sql)) !== null) {
    const table = match[1].toUpperCase();
    if (!table.includes('{{') && 
        !table.includes('<') &&
        table !== 'ENTITY' &&
        // Only include if it looks like a real entity table
        (table.endsWith('_ENTITY') || table.startsWith('ATLAS'))) {
      tables.add(table);
    }
  }
  
  return Array.from(tables);
}

/**
 * Check if a query can be executed with the available tables
 * 
 * CRITICAL: This function MUST return false if ANY referenced table doesn't exist.
 * This prevents showing queries with hardcoded entity names that don't exist in the database.
 * 
 * @param {object} query - Query definition with sql property
 * @param {Set<string>|string[]} availableTables - Set or array of available table names (uppercase)
 * @returns {boolean} True if all required tables exist
 */
export function canQueryRunWithTables(query, availableTables) {
  const sql = query?.sql || query?.query;
  if (!sql || !availableTables) return true; // No filtering if no tables provided
  
  const tableSet = availableTables instanceof Set 
    ? availableTables 
    : new Set((availableTables || []).map(t => t.toUpperCase()));
  
  // If no tables discovered yet, allow all queries (discovery mode)
  if (tableSet.size === 0) return true;
  
  const referencedTables = extractReferencedTables(sql);
  
  // Allow queries that don't reference specific entity tables (use INFORMATION_SCHEMA, etc.)
  if (referencedTables.length === 0) return true;
  
  // STRICT: Check if ALL referenced tables exist
  // If even one table is missing, the query cannot run
  const missingTables = referencedTables.filter(table => !tableSet.has(table));
  
  if (missingTables.length > 0) {
    // Log for debugging which tables are missing
    console.debug('[canQueryRunWithTables] Missing tables:', missingTables, 'from query referencing:', referencedTables);
    return false;
  }
  
  return true;
}

/**
 * Get recommended queries based on entity context
 * ONLY returns queries that can run against discovered/available tables.
 * 
 * @param {EntityContext} ctx - Entity context
 * @param {string[]} [availableTables] - List of discovered table names (uppercase)
 * @returns {Array<{query: object, priority: number, available: boolean}>} Sorted query recommendations
 */
export function getRecommendedQueries(ctx, availableTables = []) {
  const recommendations = [];
  const tableSet = new Set((availableTables || []).map(t => t.toUpperCase()));

  // Helper to add query only if its tables exist
  const addIfAvailable = (query, priority) => {
    if (!query) return;
    const available = canQueryRunWithTables(query, tableSet);
    // Only add if available (tables exist) OR if we haven't discovered tables yet
    if (available || tableSet.size === 0) {
      recommendations.push({ query, priority, available });
    }
  };

  // Table-level queries
  if (ctx.table && ['TABLE', 'VIEW', 'MATERIALIZED_VIEW'].includes(ctx.entityType)) {
    // MDLH layer - structure & lineage (only add if tables exist)
    addIfAvailable(MDLH_QUERIES.table_asset_details, 1);
    addIfAvailable(MDLH_QUERIES.upstream_direct, 2);
    addIfAvailable(MDLH_QUERIES.downstream_direct, 2);
    addIfAvailable(MDLH_QUERIES.tags_for_asset, 3);
    addIfAvailable(MDLH_QUERIES.impact_dashboards, 4);
    
    // Snowflake layer - live data (these use INFORMATION_SCHEMA, always available)
    addIfAvailable(SNOWFLAKE_QUERIES.columns_live, 1);
    addIfAvailable(SNOWFLAKE_QUERIES.table_size_rows, 1);
    addIfAvailable(SNOWFLAKE_QUERIES.top_users, 2);
    addIfAvailable(SNOWFLAKE_QUERIES.native_tags, 3);
    addIfAvailable(SNOWFLAKE_QUERIES.masking_policies, 3);
    addIfAvailable(SNOWFLAKE_QUERIES.expensive_queries, 4);
  }

  // Column-level queries (these use {{TABLE}} placeholder, check if table exists)
  if (ctx.column) {
    addIfAvailable(SNOWFLAKE_QUERIES.null_stats, 1);
    addIfAvailable(SNOWFLAKE_QUERIES.top_values, 1);
    addIfAvailable(SNOWFLAKE_QUERIES.numeric_stats, 2);
  }

  // Process/Lineage entities
  if (ctx.entityType === 'PROCESS') {
    addIfAvailable(MDLH_QUERIES.upstream_direct, 1);
    addIfAvailable(MDLH_QUERIES.downstream_direct, 1);
    addIfAvailable(MDLH_QUERIES.lineage_chain_recursive, 2);
  }

  // Glossary entities
  if (ctx.entityType === 'GLOSSARY') {
    addIfAvailable(MDLH_QUERIES.all_glossaries, 1);
    addIfAvailable(MDLH_QUERIES.terms_in_glossary, 2);
  }

  if (ctx.entityType === 'TERM') {
    addIfAvailable(MDLH_QUERIES.assets_linked_to_term, 1);
  }

  // Always available queries (no specific context needed)
  // These only show if the required tables exist
  if (!ctx.table && !ctx.column) {
    // entity_types_overview uses INFORMATION_SCHEMA, always available
    addIfAvailable(MDLH_QUERIES.entity_types_overview, 1);
    // These require TABLE_ENTITY to exist
    addIfAvailable(MDLH_QUERIES.most_popular_tables, 2);
    addIfAvailable(MDLH_QUERIES.large_unused_tables, 3);
    // Snowflake system queries (always available)
    addIfAvailable(SNOWFLAKE_QUERIES.warehouse_costs, 2);
    addIfAvailable(SNOWFLAKE_QUERIES.most_accessed_tables, 2);
  }

  // Sort by priority and remove duplicates
  return recommendations
    .sort((a, b) => a.priority - b.priority)
    .filter((item, index, self) => 
      index === self.findIndex(t => t.query.id === item.query.id)
    );
}

/**
 * Check if a query can be executed with the given context
 * @param {object} query - Query definition
 * @param {EntityContext} ctx - Entity context
 * @returns {boolean} True if all required context fields are available
 */
export function canExecuteQuery(query, ctx) {
  if (!query.requires || query.requires.length === 0) return true;
  return query.requires.every(field => ctx[field]);
}

/**
 * Get queries grouped by layer and category
 * @returns {object} Queries grouped by layer > category
 */
export function getQueriesByLayerAndCategory() {
  const grouped = {
    [QUERY_LAYERS.MDLH]: {},
    [QUERY_LAYERS.SNOWFLAKE]: {},
  };

  Object.values(ALL_QUERIES).forEach(query => {
    if (!grouped[query.layer][query.category]) {
      grouped[query.layer][query.category] = [];
    }
    grouped[query.layer][query.category].push(query);
  });

  return grouped;
}

// =============================================================================
// MERGED USER RESEARCH QUERIES
// =============================================================================

/**
 * Convert user research queries to the internal format
 * Adds new fields: userIntent, frequency, source, warning, confidence
 */
function convertUserResearchQuery(uq) {
  return {
    id: uq.id,
    label: uq.name,
    description: uq.description,
    category: mapUserCategory(uq.category),
    layer: QUERY_LAYERS.MDLH,
    icon: getCategoryIcon(uq.category),
    requires: extractRequires(uq.sql),
    sql: uq.sql,
    // New fields from user research
    userIntent: uq.userIntent,
    frequency: uq.frequency,
    frequencyDetail: uq.frequencyDetail,
    source: uq.source,
    warning: uq.warning,
    confidence: uq.confidence || 'high',
    researchCategory: uq.category, // Preserve original category
  };
}

/**
 * Map user research categories to internal categories
 */
function mapUserCategory(category) {
  const categoryMap = {
    'Asset Discovery': QUERY_CATEGORIES.STRUCTURE,
    'Count & Statistics': QUERY_CATEGORIES.STRUCTURE,
    'Usage & Popularity': QUERY_CATEGORIES.USAGE,
    'Data Lineage': QUERY_CATEGORIES.LINEAGE,
    'Glossary & Terms': QUERY_CATEGORIES.GLOSSARY,
    'Governance & Ownership': QUERY_CATEGORIES.GOVERNANCE,
    'Data Quality': QUERY_CATEGORIES.QUALITY,
    'Domain-Specific': QUERY_CATEGORIES.STRUCTURE,
    'Column Metadata': QUERY_CATEGORIES.STRUCTURE,
    'Duplicate Detection': QUERY_CATEGORIES.GOVERNANCE,
    'Storage Analysis': QUERY_CATEGORIES.COST,
    'Query Organization': QUERY_CATEGORIES.STRUCTURE,
    // New categories
    'BI Tools': QUERY_CATEGORIES.STRUCTURE,
    'dbt': QUERY_CATEGORIES.LINEAGE,
    'Orchestration': QUERY_CATEGORIES.LINEAGE,
    'Cloud Storage': QUERY_CATEGORIES.STRUCTURE,
    'AI/ML': QUERY_CATEGORIES.STRUCTURE,
    'Data Mesh': QUERY_CATEGORIES.GOVERNANCE,
    'Connections': QUERY_CATEGORIES.STRUCTURE,
    'Snowflake Features': QUERY_CATEGORIES.STRUCTURE,
    'Schema Exploration': QUERY_CATEGORIES.STRUCTURE,
    'Cross-Connector': QUERY_CATEGORIES.USAGE,
    'Data Freshness': QUERY_CATEGORIES.QUALITY,
    'Certification': QUERY_CATEGORIES.GOVERNANCE,
    'Custom Metadata': QUERY_CATEGORIES.GOVERNANCE,
    'Tag Analysis': QUERY_CATEGORIES.GOVERNANCE,
    'Views': QUERY_CATEGORIES.STRUCTURE,
  };
  return categoryMap[category] || QUERY_CATEGORIES.STRUCTURE;
}

/**
 * Get icon name for category
 */
function getCategoryIcon(category) {
  const iconMap = {
    'Asset Discovery': 'Search',
    'Count & Statistics': 'Hash',
    'Usage & Popularity': 'TrendingUp',
    'Data Lineage': 'GitBranch',
    'Glossary & Terms': 'BookOpen',
    'Governance & Ownership': 'Shield',
    'Data Quality': 'AlertTriangle',
    'Domain-Specific': 'Box',
    'Column Metadata': 'Columns',
    'Duplicate Detection': 'Copy',
    'Storage Analysis': 'HardDrive',
    'Query Organization': 'FolderOpen',
    // New categories
    'BI Tools': 'BarChart2',
    'dbt': 'Package',
    'Orchestration': 'PlayCircle',
    'Cloud Storage': 'Cloud',
    'AI/ML': 'Cpu',
    'Data Mesh': 'FileText',
    'Connections': 'Link',
    'Snowflake Features': 'Snowflake',
    'Schema Exploration': 'Database',
    'Cross-Connector': 'Layers',
    'Data Freshness': 'Clock',
    'Certification': 'CheckCircle',
    'Custom Metadata': 'Tag',
    'Tag Analysis': 'Tags',
    'Views': 'Eye',
  };
  return iconMap[category] || 'Code2';
}

/**
 * Extract required context fields from SQL placeholders
 */
function extractRequires(sql) {
  const requires = [];
  if (sql.includes('{{database}}') || sql.includes('{{DATABASE}}')) requires.push('database');
  if (sql.includes('{{schema}}') || sql.includes('{{SCHEMA}}')) requires.push('schema');
  if (sql.includes('{{table}}') || sql.includes('{{TABLE}}')) requires.push('table');
  if (sql.includes('{{column}}') || sql.includes('{{COLUMN}}')) requires.push('column');
  if (sql.includes('{{GUID}}') || sql.includes('{{guid}}')) requires.push('guid');
  if (sql.includes('{{term}}')) requires.push('term');
  if (sql.includes('{{source}}')) requires.push('source');
  if (sql.includes('{{domain}}')) requires.push('domain');
  if (sql.includes('{{filter}}')) requires.push('filter');
  if (sql.includes('{{START_GUID}}')) requires.push('guid');
  return requires;
}

/**
 * Normalize SQL for comparison (remove comments, whitespace, case)
 */
function normalizeSQL(sql) {
  return sql
    .replace(/--.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Check if two queries are duplicates based on SQL similarity
 */
function isSQLSimilar(sql1, sql2, threshold = 0.85) {
  const norm1 = normalizeSQL(sql1);
  const norm2 = normalizeSQL(sql2);
  
  // Quick check: exact match
  if (norm1 === norm2) return true;
  
  // Check for significant overlap in main query parts
  const parts1 = norm1.split(/\s+from\s+/i);
  const parts2 = norm2.split(/\s+from\s+/i);
  
  if (parts1.length > 1 && parts2.length > 1) {
    // Compare FROM clause onwards
    const from1 = parts1.slice(1).join(' from ');
    const from2 = parts2.slice(1).join(' from ');
    if (from1 === from2) return true;
  }
  
  return false;
}

/**
 * Deduplicate queries by SQL similarity or name
 */
function deduplicateQueries(existingQueries, newQueries) {
  const result = [...Object.values(existingQueries)];
  const existingIds = new Set(result.map(q => q.id));
  const existingNames = new Set(result.map(q => q.label?.toLowerCase()));
  
  for (const newQuery of newQueries) {
    // Skip if ID already exists
    if (existingIds.has(newQuery.id)) {
      continue;
    }
    
    // Check for name similarity
    if (existingNames.has(newQuery.label?.toLowerCase())) {
      continue;
    }
    
    // Check for SQL similarity
    const isDuplicate = result.some(existing => 
      isSQLSimilar(existing.sql, newQuery.sql)
    );
    
    if (!isDuplicate) {
      result.push(newQuery);
      existingIds.add(newQuery.id);
      existingNames.add(newQuery.label?.toLowerCase());
    }
  }
  
  return result;
}

// Convert all user research queries
const CONVERTED_USER_QUERIES = USER_RESEARCH_QUERIES.map(convertUserResearchQuery);

// Merge and deduplicate all queries
const MERGED_QUERIES_ARRAY = deduplicateQueries(
  { ...MDLH_QUERIES, ...SNOWFLAKE_QUERIES },
  CONVERTED_USER_QUERIES
);

// Create object for compatibility
export const MERGED_QUERIES = {};
MERGED_QUERIES_ARRAY.forEach(q => {
  MERGED_QUERIES[q.id] = q;
});

// Re-export user research utilities
export { 
  USER_RESEARCH_QUERIES,
  FREQUENCY_STYLES, 
  FREQUENCY_LEVELS,
  getQueriesByFrequency,
  getQueriesByCategory,
  searchUserQueries,
};

/**
 * Get all queries sorted by frequency (user research queries prioritized)
 */
export function getAllQueriesByFrequency() {
  const frequencyOrder = ['Very High', 'High', 'Medium', 'Low', undefined];
  return MERGED_QUERIES_ARRAY.sort((a, b) => {
    const aIdx = frequencyOrder.indexOf(a.frequency);
    const bIdx = frequencyOrder.indexOf(b.frequency);
    return aIdx - bIdx;
  });
}

/**
 * Get queries with warnings
 */
export function getQueriesWithWarnings() {
  return MERGED_QUERIES_ARRAY.filter(q => q.warning);
}

/**
 * Search all merged queries
 */
export function searchAllQueries(searchTerm) {
  const term = searchTerm.toLowerCase();
  return MERGED_QUERIES_ARRAY.filter(q => 
    q.label?.toLowerCase().includes(term) ||
    q.description?.toLowerCase().includes(term) ||
    q.userIntent?.toLowerCase().includes(term) ||
    q.sql?.toLowerCase().includes(term)
  );
}

export default {
  fillTemplate,
  fillTemplateSafe,
  fillTemplateWithSampleInfo,
  buildTableFQN,
  QUERY_LAYERS,
  QUERY_CATEGORIES,
  MDLH_QUERIES,
  SNOWFLAKE_QUERIES,
  ALL_QUERIES,
  MERGED_QUERIES,
  USER_RESEARCH_QUERIES,
  FREQUENCY_STYLES,
  FREQUENCY_LEVELS,
  getRecommendedQueries,
  canExecuteQuery,
  canQueryRunWithTables,
  extractReferencedTables,
  getQueriesByLayerAndCategory,
  getAllQueriesByFrequency,
  getQueriesWithWarnings,
  searchAllQueries,
  getQueriesByFrequency,
  getQueriesByCategory,
};

