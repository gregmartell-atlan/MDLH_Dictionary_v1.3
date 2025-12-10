/**
 * Query Flow Types
 * 
 * Core type definitions for the config-driven query flow system.
 * This enables any entity type to use any query type through a unified pattern.
 */

/**
 * @typedef {'TABLE' | 'VIEW' | 'COLUMN' | 'DATABASE' | 'SCHEMA' | 'DASHBOARD' | 'PIPELINE' | 'GLOSSARY_TERM' | 'METRIC' | 'PROCESS' | 'CONNECTION' | 'UNKNOWN'} EntityType
 */

/**
 * @typedef {'LINEAGE' | 'IMPACT' | 'USAGE' | 'SAMPLE_ROWS' | 'SCHEMA_BROWSE' | 'QUALITY_CHECKS' | 'GLOSSARY_LOOKUP' | 'FIND_BY_GUID' | 'COLUMN_PROFILE' | 'TOP_VALUES' | 'NULL_ANALYSIS'} QueryFlowType
 */

/**
 * Context about the entity the user is exploring
 * @typedef {Object} EntityContext
 * @property {EntityType} type - The type of entity
 * @property {string} [guid] - Metadata GUID (Atlas/MDLH)
 * @property {string} [name] - Human-readable name
 * @property {string} [qualifiedName] - Fully qualified asset name
 * @property {string} [database] - Database name
 * @property {string} [schema] - Schema name
 * @property {string} [table] - Table name (for columns)
 * @property {string} [column] - Column name
 * @property {string} [typename] - MDLH typename (e.g., 'Table', 'Column')
 * @property {Record<string, any>} [extra] - Additional context
 */

/**
 * Input parameters for query flows (wizard knobs)
 * @typedef {Object} QueryFlowInputs
 * @property {'UPSTREAM' | 'DOWNSTREAM' | 'BOTH'} [direction] - Lineage direction
 * @property {number} [maxHops] - Max recursion depth for lineage
 * @property {string[]} [assetTypes] - Filter to specific asset types
 * @property {number} [daysBack] - For usage queries, how far back to look
 * @property {number} [rowLimit] - Result row limit
 * @property {boolean} [includeDashboards] - Include BI dashboards in lineage
 * @property {boolean} [includeColumns] - Include column-level lineage
 * @property {boolean} [includeProcesses] - Include process entities
 * @property {string} [searchTerm] - For search/discovery queries
 * @property {Record<string, any>} [filters] - Additional filters
 */

/**
 * The built query ready for execution
 * @typedef {Object} BuiltQuery
 * @property {string} title - Display title for the query
 * @property {string} description - What this query does
 * @property {string} sql - The SQL to execute
 * @property {string} [database] - Recommended database context
 * @property {string} [schema] - Recommended schema context
 * @property {number} [timeoutSeconds] - Query timeout
 * @property {number} [limit] - Row limit
 * @property {QueryFlowType} flowType - Which flow generated this
 * @property {EntityContext} entity - The entity context used
 */

/**
 * Recipe for a query flow type
 * @typedef {Object} QueryFlowRecipe
 * @property {QueryFlowType} id - Unique identifier
 * @property {string} label - Human-readable label
 * @property {string} description - What this flow does
 * @property {string} icon - Lucide icon name
 * @property {EntityType[]} supportedEntityTypes - Which entity types can use this
 * @property {(entity: EntityContext) => QueryFlowInputs} buildDefaults - Generate default inputs
 * @property {(entity: EntityContext, inputs: QueryFlowInputs, availableTables?: string[]) => BuiltQuery} buildQuery - Build the SQL query
 */

// Entity type display names and icons
export const ENTITY_TYPE_CONFIG = {
  TABLE: { label: 'Table', icon: 'Table2', color: 'emerald' },
  VIEW: { label: 'View', icon: 'Eye', color: 'amber' },
  COLUMN: { label: 'Column', icon: 'Columns', color: 'blue' },
  DATABASE: { label: 'Database', icon: 'Database', color: 'purple' },
  SCHEMA: { label: 'Schema', icon: 'Layers', color: 'indigo' },
  DASHBOARD: { label: 'Dashboard', icon: 'BarChart3', color: 'pink' },
  PIPELINE: { label: 'Pipeline', icon: 'GitBranch', color: 'orange' },
  GLOSSARY_TERM: { label: 'Glossary Term', icon: 'BookOpen', color: 'teal' },
  METRIC: { label: 'Metric', icon: 'TrendingUp', color: 'red' },
  PROCESS: { label: 'Process', icon: 'Workflow', color: 'cyan' },
  CONNECTION: { label: 'Connection', icon: 'Plug', color: 'gray' },
  UNKNOWN: { label: 'Asset', icon: 'Box', color: 'gray' },
};

// Query flow type display names and icons
export const QUERY_FLOW_CONFIG = {
  LINEAGE: { label: 'Lineage', icon: 'GitBranch', description: 'Trace data dependencies' },
  IMPACT: { label: 'Impact Analysis', icon: 'AlertTriangle', description: 'See what breaks if this changes' },
  USAGE: { label: 'Usage', icon: 'Activity', description: 'Who queries this and when' },
  SAMPLE_ROWS: { label: 'Sample Rows', icon: 'Table', description: 'Preview actual data' },
  SCHEMA_BROWSE: { label: 'Schema Browser', icon: 'Layers', description: 'Explore tables and columns' },
  QUALITY_CHECKS: { label: 'Quality Checks', icon: 'CheckCircle', description: 'Data quality metrics' },
  GLOSSARY_LOOKUP: { label: 'Glossary', icon: 'BookOpen', description: 'Find related terms' },
  FIND_BY_GUID: { label: 'Find by GUID', icon: 'Search', description: 'Look up asset by GUID' },
  COLUMN_PROFILE: { label: 'Column Profile', icon: 'BarChart2', description: 'Column statistics' },
  TOP_VALUES: { label: 'Top Values', icon: 'List', description: 'Most common values' },
  NULL_ANALYSIS: { label: 'Null Analysis', icon: 'AlertCircle', description: 'Find null/empty values' },
};

/**
 * Map MDLH typenames to our EntityType
 * @param {string} typename - MDLH typename (e.g., 'Table', 'AtlasGlossaryTerm')
 * @returns {EntityType}
 */
export function mapTypenameToEntityType(typename) {
  if (!typename) return 'UNKNOWN';
  
  const normalized = typename.toUpperCase().replace(/[^A-Z]/g, '');
  
  // Tables and views
  if (normalized.includes('TABLE')) return 'TABLE';
  if (normalized.includes('VIEW')) return 'VIEW';
  if (normalized.includes('COLUMN')) return 'COLUMN';
  
  // Infrastructure
  if (normalized.includes('DATABASE')) return 'DATABASE';
  if (normalized.includes('SCHEMA')) return 'SCHEMA';
  if (normalized.includes('CONNECTION')) return 'CONNECTION';
  
  // BI
  if (normalized.includes('DASHBOARD')) return 'DASHBOARD';
  if (normalized.includes('REPORT')) return 'DASHBOARD';
  if (normalized.includes('CHART')) return 'DASHBOARD';
  
  // Pipelines/ETL
  if (normalized.includes('PIPELINE')) return 'PIPELINE';
  if (normalized.includes('DAG')) return 'PIPELINE';
  if (normalized.includes('WORKFLOW')) return 'PIPELINE';
  if (normalized.includes('PROCESS')) return 'PROCESS';
  
  // Glossary
  if (normalized.includes('GLOSSARY') && normalized.includes('TERM')) return 'GLOSSARY_TERM';
  if (normalized.includes('GLOSSARY')) return 'GLOSSARY_TERM';
  
  // Metrics
  if (normalized.includes('METRIC')) return 'METRIC';
  if (normalized.includes('MEASURE')) return 'METRIC';
  
  return 'UNKNOWN';
}

/**
 * Build an EntityContext from MDLH entity data
 * @param {Object} mdlhEntity - Entity from MDLH query results
 * @returns {EntityContext}
 */
export function buildEntityContext(mdlhEntity) {
  const typename = mdlhEntity.typename || mdlhEntity.TYPENAME || '';
  const type = mapTypenameToEntityType(typename);
  
  return {
    type,
    guid: mdlhEntity.guid || mdlhEntity.GUID,
    name: mdlhEntity.name || mdlhEntity.NAME,
    qualifiedName: mdlhEntity.qualifiedname || mdlhEntity.QUALIFIEDNAME || mdlhEntity.qualifiedName,
    database: mdlhEntity.databasename || mdlhEntity.DATABASENAME || mdlhEntity.database,
    schema: mdlhEntity.schemaname || mdlhEntity.SCHEMANAME || mdlhEntity.schema,
    table: mdlhEntity.tablename || mdlhEntity.TABLENAME || mdlhEntity.table,
    column: mdlhEntity.columnname || mdlhEntity.COLUMNNAME || mdlhEntity.column,
    typename,
    extra: {
      connectorName: mdlhEntity.connectorname || mdlhEntity.CONNECTORNAME,
      connectionName: mdlhEntity.connectionname || mdlhEntity.CONNECTIONNAME,
      ownerUsers: mdlhEntity.ownerusers || mdlhEntity.OWNERUSERS,
      status: mdlhEntity.status || mdlhEntity.STATUS,
    }
  };
}

export default {
  ENTITY_TYPE_CONFIG,
  QUERY_FLOW_CONFIG,
  mapTypenameToEntityType,
  buildEntityContext,
};

