/**
 * Query Availability Utility
 * 
 * Validates which queries can run based on available tables in the user's
 * MDLH instance. Many tenants only have a subset of entity tables.
 */

import { createLogger } from './logger';

const log = createLogger('QueryAvailability');

// =============================================================================
// Table Extraction from SQL
// =============================================================================

/**
 * Extract table names referenced in a SQL query
 * @param {string} sql - SQL query string
 * @returns {string[]} Array of table names (uppercase)
 */
export function extractTablesFromQuery(sql) {
  if (!sql) return [];
  
  const tables = new Set();
  
  // Pattern to match table references in FROM and JOIN clauses
  // Handles: FROM TABLE_NAME, FROM schema.TABLE_NAME, FROM db.schema.TABLE_NAME
  const fromJoinPattern = /(?:FROM|JOIN)\s+(?:[\w.]+\.)?(\w+_ENTITY)\b/gi;
  
  let match;
  while ((match = fromJoinPattern.exec(sql)) !== null) {
    tables.add(match[1].toUpperCase());
  }
  
  return Array.from(tables);
}

/**
 * Extract required tables from a query definition
 * Uses explicit requiredTables if provided, otherwise extracts from SQL
 * @param {Object} query - Query object with sql and optional requiredTables
 * @returns {string[]} Array of required table names
 */
export function getRequiredTables(query) {
  // Use explicit requiredTables if provided
  if (query.requiredTables && Array.isArray(query.requiredTables)) {
    return query.requiredTables.map(t => t.toUpperCase());
  }
  
  // Otherwise extract from SQL
  return extractTablesFromQuery(query.sql || query.query);
}

// =============================================================================
// Availability Checking
// =============================================================================

/**
 * Check if a query can run given available tables
 * @param {Object} query - Query definition
 * @param {string[]} availableTables - Tables available in the user's instance
 * @returns {{available: boolean, missingTables: string[]}}
 */
export function checkQueryAvailability(query, availableTables) {
  const required = getRequiredTables(query);
  const availableSet = new Set(availableTables.map(t => t.toUpperCase()));
  
  const missingTables = required.filter(t => !availableSet.has(t));
  
  return {
    available: missingTables.length === 0,
    missingTables,
    requiredTables: required
  };
}

/**
 * Filter queries to only those that can run
 * @param {Object[]} queries - Array of query definitions
 * @param {string[]} availableTables - Tables available in the user's instance
 * @returns {Object[]} Queries that can run
 */
export function filterAvailableQueries(queries, availableTables) {
  return queries.filter(q => {
    const { available } = checkQueryAvailability(q, availableTables);
    return available;
  });
}

/**
 * Annotate queries with availability information
 * @param {Object[]} queries - Array of query definitions
 * @param {string[]} availableTables - Tables available in the user's instance
 * @returns {Object[]} Queries with added availability info
 */
export function annotateQueryAvailability(queries, availableTables) {
  return queries.map(q => {
    const { available, missingTables, requiredTables } = checkQueryAvailability(q, availableTables);
    return {
      ...q,
      _availability: {
        available,
        missingTables,
        requiredTables
      }
    };
  });
}

// =============================================================================
// Common Entity Tables by Category
// =============================================================================

/**
 * Core tables that should exist in all MDLH instances
 */
export const CORE_TABLES = [
  'TABLE_ENTITY',
  'COLUMN_ENTITY',
  'SCHEMA_ENTITY',
  'DATABASE_ENTITY',
  'CONNECTION_ENTITY',
  'VIEW_ENTITY',
  'PROCESS_ENTITY',
  'ATLASGLOSSARY_ENTITY',
  'ATLASGLOSSARYTERM_ENTITY',
  'ATLASGLOSSARYCATEGORY_ENTITY',
];

/**
 * Optional tables that may not exist in all instances
 */
export const OPTIONAL_TABLES = {
  // BI Tools
  tableau: ['TABLEAUSITE_ENTITY', 'TABLEAUPROJECT_ENTITY', 'TABLEAUWORKBOOK_ENTITY', 'TABLEAUDASHBOARD_ENTITY', 'TABLEAUDATASOURCE_ENTITY'],
  powerbi: ['POWERBIWORKSPACE_ENTITY', 'POWERBIREPORT_ENTITY', 'POWERBIDATASET_ENTITY', 'POWERBIMEASURE_ENTITY', 'POWERBIPAGE_ENTITY'],
  looker: ['LOOKERPROJECT_ENTITY', 'LOOKERMODEL_ENTITY', 'LOOKEREXPLORE_ENTITY', 'LOOKERDASHBOARD_ENTITY'],
  metabase: ['METABASEDASHBOARD_ENTITY', 'METABASEQUESTION_ENTITY'],
  sigma: ['SIGMADATAELEMENT_ENTITY', 'SIGMAWORKBOOK_ENTITY', 'SIGMAPAGE_ENTITY'],
  
  // dbt
  dbt: ['DBTMODEL_ENTITY', 'DBTMODELCOLUMN_ENTITY', 'DBTSOURCE_ENTITY', 'DBTTEST_ENTITY', 'DBTMETRIC_ENTITY'],
  
  // Cloud Storage
  s3: ['S3BUCKET_ENTITY', 'S3OBJECT_ENTITY'],
  adls: ['ADLSACCOUNT_ENTITY', 'ADLSCONTAINER_ENTITY', 'ADLSOBJECT_ENTITY'],
  gcs: ['GCSBUCKET_ENTITY', 'GCSOBJECT_ENTITY'],
  
  // Orchestration
  airflow: ['AIRFLOWDAG_ENTITY', 'AIRFLOWTASK_ENTITY'],
  adf: ['ADFPIPELINE_ENTITY', 'ADFACTIVITY_ENTITY', 'ADFDATAFLOW_ENTITY'],
  fivetran: ['FIVETRANCONNECTOR_ENTITY'],
  matillion: ['MATILLIONGROUP_ENTITY', 'MATILLIONPROJECT_ENTITY', 'MATILLIONJOB_ENTITY'],
  
  // Snowflake-specific
  snowflake: ['SNOWFLAKEPIPE_ENTITY', 'SNOWFLAKESTREAM_ENTITY', 'SNOWFLAKEDYNAMICTABLE_ENTITY', 'SNOWFLAKETAG_ENTITY'],
  
  // Data Mesh
  datamesh: ['DATADOMAIN_ENTITY', 'DATAPRODUCT_ENTITY', 'DATACONTRACT_ENTITY'],
  
  // AI/ML
  ai: ['AIMODEL_ENTITY', 'AIAPPLICATION_ENTITY'],
  
  // Governance
  governance: ['BUSINESSPOLICY_ENTITY', 'BUSINESSPOLICYLOG_ENTITY', 'PERSONA_ENTITY', 'PURPOSE_ENTITY'],
  
  // Queries
  queries: ['COLLECTION_ENTITY', 'FOLDER_ENTITY', 'QUERY_ENTITY'],
};

/**
 * Get a friendly name for a missing table
 * @param {string} tableName - Table name like SIGMAPAGE_ENTITY
 * @returns {string} Friendly name like "Sigma Pages"
 */
export function getTableFriendlyName(tableName) {
  const nameMap = {
    // BI
    'SIGMAPAGE_ENTITY': 'Sigma Pages',
    'SIGMADATAELEMENT_ENTITY': 'Sigma Data Elements',
    'POWERBIPAGE_ENTITY': 'Power BI Pages',
    'POWERBIREPORT_ENTITY': 'Power BI Reports',
    'TABLEAUDASHBOARD_ENTITY': 'Tableau Dashboards',
    'LOOKERDASHBOARD_ENTITY': 'Looker Dashboards',
    
    // Snowflake
    'SNOWFLAKEPIPE_ENTITY': 'Snowflake Pipes',
    'SNOWFLAKESTREAM_ENTITY': 'Snowflake Streams',
    'SNOWFLAKEDYNAMICTABLE_ENTITY': 'Snowflake Dynamic Tables',
    
    // dbt
    'DBTMODEL_ENTITY': 'dbt Models',
    'DBTTEST_ENTITY': 'dbt Tests',
    
    // Data Mesh
    'DATADOMAIN_ENTITY': 'Data Domains',
    'DATAPRODUCT_ENTITY': 'Data Products',
    
    // Governance
    'BUSINESSPOLICY_ENTITY': 'Business Policies',
    'AIMODEL_ENTITY': 'AI Models',
  };
  
  if (nameMap[tableName]) {
    return nameMap[tableName];
  }
  
  // Generate from table name: TABLEAUWORKBOOK_ENTITY -> Tableau Workbooks
  const baseName = tableName.replace('_ENTITY', '');
  return baseName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^ /, '')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Categorize why a query is unavailable
 * @param {string[]} missingTables - List of missing tables
 * @returns {{category: string, message: string}}
 */
export function categorizeMissingTables(missingTables) {
  if (missingTables.length === 0) {
    return { category: 'available', message: 'All required tables available' };
  }
  
  // Check which category the missing tables belong to
  for (const [category, tables] of Object.entries(OPTIONAL_TABLES)) {
    const missingInCategory = missingTables.filter(t => tables.includes(t));
    if (missingInCategory.length > 0) {
      const friendlyNames = missingInCategory.map(getTableFriendlyName);
      return {
        category,
        message: `Requires ${category} connector: ${friendlyNames.join(', ')}`
      };
    }
  }
  
  return {
    category: 'unknown',
    message: `Missing tables: ${missingTables.join(', ')}`
  };
}

export default {
  extractTablesFromQuery,
  getRequiredTables,
  checkQueryAvailability,
  filterAvailableQueries,
  annotateQueryAvailability,
  getTableFriendlyName,
  categorizeMissingTables,
  CORE_TABLES,
  OPTIONAL_TABLES,
};

