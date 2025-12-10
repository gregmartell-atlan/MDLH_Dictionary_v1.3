/**
 * Query Flow Registry
 * 
 * Central registry of all query flow recipes.
 * Each recipe defines how to build SQL for a specific query type + entity type combination.
 * 
 * All recipes are validated at module load time to catch configuration errors early.
 */

import { buildLineageQuery, buildLineageExplorationQuery } from './sql/lineage';
import { buildUsageQuery, buildPopularityQuery } from './sql/usage';
import { buildSampleRowsQuery, buildTableStatsQuery } from './sql/sampleRows';
import { buildSchemaBrowseQuery, buildTableSearchQuery, buildColumnDetailsQuery } from './sql/schemaBrowse';
import { buildGlossaryQuery, buildTermLinkedAssetsQuery, buildListGlossariesQuery } from './sql/glossary';
import { buildFindByGuidQuery, buildGuidDetailsQuery } from './sql/findByGuid';
import { buildSafeFQN, escapeStringValue } from '../utils/queryHelpers';

// =============================================================================
// Flow Recipe Validation
// =============================================================================

/**
 * Required properties for a valid flow recipe
 */
const REQUIRED_RECIPE_PROPS = ['id', 'label', 'description', 'supportedEntityTypes', 'buildDefaults', 'buildQuery'];

/**
 * Valid entity types
 */
const VALID_ENTITY_TYPES = new Set([
  'TABLE', 'VIEW', 'COLUMN', 'DATABASE', 'SCHEMA', 
  'DASHBOARD', 'PIPELINE', 'PROCESS', 'GLOSSARY_TERM', 
  'UNKNOWN'
]);

/**
 * Validate a single flow recipe
 * @param {string} flowId 
 * @param {Object} recipe 
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateRecipe(flowId, recipe) {
  const errors = [];
  
  // Check required properties
  for (const prop of REQUIRED_RECIPE_PROPS) {
    if (!(prop in recipe)) {
      errors.push(`Missing required property: ${prop}`);
    }
  }
  
  // Validate id matches key
  if (recipe.id !== flowId) {
    errors.push(`Recipe id '${recipe.id}' doesn't match key '${flowId}'`);
  }
  
  // Validate supportedEntityTypes
  if (recipe.supportedEntityTypes) {
    if (!Array.isArray(recipe.supportedEntityTypes)) {
      errors.push('supportedEntityTypes must be an array');
    } else if (recipe.supportedEntityTypes.length === 0) {
      errors.push('supportedEntityTypes cannot be empty');
    } else {
      for (const entityType of recipe.supportedEntityTypes) {
        if (!VALID_ENTITY_TYPES.has(entityType)) {
          errors.push(`Unknown entity type: ${entityType}`);
        }
      }
    }
  }
  
  // Validate functions
  if (recipe.buildDefaults && typeof recipe.buildDefaults !== 'function') {
    errors.push('buildDefaults must be a function');
  }
  
  if (recipe.buildQuery && typeof recipe.buildQuery !== 'function') {
    errors.push('buildQuery must be a function');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate all registered recipes at module load time
 * Logs warnings for invalid recipes but doesn't throw (graceful degradation)
 */
function validateAllRecipes(recipes) {
  const issues = [];
  
  for (const [flowId, recipe] of Object.entries(recipes)) {
    const result = validateRecipe(flowId, recipe);
    if (!result.valid) {
      issues.push({
        flowId,
        errors: result.errors,
      });
    }
  }
  
  // Issues detected during validation - stored for debugging
  
  return issues;
}

/**
 * @type {Record<import('./types').QueryFlowType, import('./types').QueryFlowRecipe>}
 */
export const QUERY_FLOW_RECIPES = {
  LINEAGE: {
    id: 'LINEAGE',
    label: 'Lineage',
    description: 'Trace upstream or downstream data dependencies.',
    icon: 'GitBranch',
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN', 'DASHBOARD', 'PIPELINE', 'PROCESS'],
    buildDefaults: (entity) => ({
      direction: 'DOWNSTREAM',
      maxHops: 3,
      assetTypes: ['TABLE', 'VIEW', 'DASHBOARD'],
      includeDashboards: true,
      includeColumns: entity.type === 'COLUMN',
      includeProcesses: true,
    }),
    buildQuery: (entity, inputs, availableTables) => 
      buildLineageQuery(entity, inputs, availableTables),
  },

  IMPACT: {
    id: 'IMPACT',
    label: 'Impact Analysis',
    description: 'See which downstream assets are affected if this changes.',
    icon: 'AlertTriangle',
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN'],
    buildDefaults: () => ({
      direction: 'DOWNSTREAM',
      maxHops: 4,
      assetTypes: ['TABLE', 'VIEW', 'DASHBOARD'],
      includeDashboards: true,
    }),
    buildQuery: (entity, inputs, availableTables) =>
      buildLineageQuery(entity, { ...inputs, direction: 'DOWNSTREAM' }, availableTables),
  },

  USAGE: {
    id: 'USAGE',
    label: 'Usage',
    description: 'See who queries this asset and when.',
    icon: 'Activity',
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN', 'DASHBOARD'],
    buildDefaults: () => ({
      daysBack: 30,
      rowLimit: 500,
    }),
    buildQuery: (entity, inputs, availableTables) => 
      buildUsageQuery(entity, inputs, availableTables),
  },

  SAMPLE_ROWS: {
    id: 'SAMPLE_ROWS',
    label: 'Sample Rows',
    description: 'Preview actual data from this table or view.',
    icon: 'Table',
    supportedEntityTypes: ['TABLE', 'VIEW'],
    buildDefaults: () => ({
      rowLimit: 100,
    }),
    buildQuery: (entity, inputs) => 
      buildSampleRowsQuery(entity, inputs),
  },

  SCHEMA_BROWSE: {
    id: 'SCHEMA_BROWSE',
    label: 'Schema Browser',
    description: 'Explore tables, columns, and data types.',
    icon: 'Layers',
    supportedEntityTypes: ['DATABASE', 'SCHEMA', 'TABLE', 'VIEW', 'UNKNOWN'],
    buildDefaults: (entity) => ({
      rowLimit: 1000,
      filters: {
        database: entity.database,
        schema: entity.schema,
      },
    }),
    buildQuery: (entity, inputs, availableTables) => 
      buildSchemaBrowseQuery(entity, inputs, availableTables),
  },

  QUALITY_CHECKS: {
    id: 'QUALITY_CHECKS',
    label: 'Quality Checks',
    description: 'Check data quality metrics and anomalies.',
    icon: 'CheckCircle',
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN'],
    buildDefaults: () => ({
      rowLimit: 100,
    }),
    buildQuery: (entity, inputs) => {
      // Build basic quality check query
      const table = entity.table || entity.name || '<TABLE>';
      const db = entity.database || '<DATABASE>';
      const schema = entity.schema || '<SCHEMA>';
      const fqn = `"${db}"."${schema}"."${table}"`;
      
      return {
        title: `✅ Quality: ${table}`,
        description: `Basic quality checks for ${fqn}.`,
        sql: `
-- Quality checks for ${fqn}

SELECT
    COUNT(*) AS total_rows,
    COUNT(*) - COUNT(DISTINCT *) AS duplicate_rows,
    SUM(CASE WHEN * IS NULL THEN 1 ELSE 0 END) AS null_rows
FROM ${fqn};
`.trim(),
        database: db,
        schema,
        timeoutSeconds: 60,
        flowType: 'QUALITY_CHECKS',
        entity,
      };
    },
  },

  GLOSSARY_LOOKUP: {
    id: 'GLOSSARY_LOOKUP',
    label: 'Glossary',
    description: 'Find glossary terms and linked assets.',
    icon: 'BookOpen',
    supportedEntityTypes: ['GLOSSARY_TERM', 'TABLE', 'COLUMN', 'UNKNOWN'],
    buildDefaults: (entity) => ({
      rowLimit: 200,
      filters: {
        termName: entity.name,
      },
    }),
    buildQuery: (entity, inputs, availableTables) => 
      buildGlossaryQuery(entity, inputs, availableTables),
  },

  FIND_BY_GUID: {
    id: 'FIND_BY_GUID',
    label: 'Find by GUID',
    description: 'Search for an asset by its metadata GUID.',
    icon: 'Search',
    supportedEntityTypes: ['UNKNOWN', 'TABLE', 'VIEW', 'COLUMN', 'PROCESS'],
    buildDefaults: (entity) => ({
      filters: {
        guid: entity.guid,
      },
    }),
    buildQuery: (entity, inputs, availableTables) => 
      buildFindByGuidQuery(entity, inputs, availableTables),
  },

  COLUMN_PROFILE: {
    id: 'COLUMN_PROFILE',
    label: 'Column Profile',
    description: 'Statistical profile of column values.',
    icon: 'BarChart2',
    supportedEntityTypes: ['COLUMN'],
    buildDefaults: () => ({
      rowLimit: 1000,
    }),
    buildQuery: (entity, inputs) => {
      const column = entity.column || entity.name || '<COLUMN>';
      const table = entity.table || '<TABLE>';
      const db = entity.database || '<DATABASE>';
      const schema = entity.schema || '<SCHEMA>';
      const fqn = `"${db}"."${schema}"."${table}"`;
      
      return {
        title: `📊 Profile: ${column}`,
        description: `Statistical profile for ${column} in ${table}.`,
        sql: `
-- Column profile for ${column} in ${fqn}

SELECT
    '${column}' AS column_name,
    COUNT(*) AS total_rows,
    COUNT("${column}") AS non_null_count,
    COUNT(*) - COUNT("${column}") AS null_count,
    ROUND((COUNT(*) - COUNT("${column}")) * 100.0 / NULLIF(COUNT(*), 0), 2) AS null_pct,
    COUNT(DISTINCT "${column}") AS distinct_count,
    MIN("${column}") AS min_value,
    MAX("${column}") AS max_value
FROM ${fqn};
`.trim(),
        database: db,
        schema,
        timeoutSeconds: 60,
        flowType: 'COLUMN_PROFILE',
        entity,
      };
    },
  },

  TOP_VALUES: {
    id: 'TOP_VALUES',
    label: 'Top Values',
    description: 'Most common values in this column.',
    icon: 'List',
    supportedEntityTypes: ['COLUMN'],
    buildDefaults: () => ({
      rowLimit: 20,
    }),
    buildQuery: (entity, inputs) => {
      const { rowLimit = 20 } = inputs;
      const column = entity.column || entity.name || '<COLUMN>';
      const table = entity.table || '<TABLE>';
      const db = entity.database || '<DATABASE>';
      const schema = entity.schema || '<SCHEMA>';
      const fqn = `"${db}"."${schema}"."${table}"`;
      
      return {
        title: `🏆 Top Values: ${column}`,
        description: `Most common values in ${column}.`,
        sql: `
-- Top ${rowLimit} values for ${column} in ${fqn}

SELECT
    "${column}" AS value,
    COUNT(*) AS frequency,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS percentage
FROM ${fqn}
GROUP BY "${column}"
ORDER BY frequency DESC
LIMIT ${rowLimit};
`.trim(),
        database: db,
        schema,
        timeoutSeconds: 60,
        flowType: 'TOP_VALUES',
        entity,
      };
    },
  },

  NULL_ANALYSIS: {
    id: 'NULL_ANALYSIS',
    label: 'Null Analysis',
    description: 'Find and analyze null values.',
    icon: 'AlertCircle',
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN'],
    buildDefaults: () => ({
      rowLimit: 100,
    }),
    buildQuery: (entity, inputs, availableTables) => {
      const table = entity.table || entity.name || '<TABLE>';
      const db = entity.database || '<DATABASE>';
      const schema = entity.schema || '<SCHEMA>';
      const fqn = `"${db}"."${schema}"."${table}"`;
      
      // Check if we have column entity for richer info
      const tables = (availableTables || []).map(t => t.toUpperCase());
      const hasColumnEntity = tables.includes('COLUMN_ENTITY');
      
      let sql;
      
      if (hasColumnEntity && entity.type !== 'COLUMN') {
        // Use FQN for COLUMN_ENTITY table reference
        const columnEntityFQN = buildSafeFQN(db, schema, 'COLUMN_ENTITY');
        sql = `
-- Null analysis for ${fqn}
-- Using MDLH column metadata

SELECT
    c.name AS column_name,
    c.datatype AS data_type,
    c.isnullable AS is_nullable
FROM ${columnEntityFQN} c
WHERE c.tablename = ${escapeStringValue(table)}
  AND c.databasename = ${escapeStringValue(db)}
  AND c.schemaname = ${escapeStringValue(schema)}
ORDER BY c."ORDER";
`.trim();
      } else {
        sql = `
-- Null analysis for ${fqn}
-- Counting nulls per column (sample query - adjust columns)

SELECT 
    COUNT(*) AS total_rows,
    -- Add specific columns to check, e.g.:
    -- COUNT(*) - COUNT(column_name) AS column_name_nulls
    'Run DESCRIBE to see columns' AS note
FROM ${fqn};
`.trim();
      }
      
      return {
        title: `🔍 Nulls: ${table}`,
        description: `Null value analysis for ${fqn}.`,
        sql,
        database: db,
        schema,
        timeoutSeconds: 60,
        flowType: 'NULL_ANALYSIS',
        entity,
      };
    },
  },
};

/**
 * Get all flows available for an entity type
 * @param {import('./types').EntityType} entityType 
 * @returns {import('./types').QueryFlowRecipe[]}
 */
export function getFlowsForEntityType(entityType) {
  return Object.values(QUERY_FLOW_RECIPES).filter(
    recipe => recipe.supportedEntityTypes.includes(entityType) || 
              recipe.supportedEntityTypes.includes('UNKNOWN')
  );
}

/**
 * Build a query using a specific flow
 * 
 * @param {import('./types').QueryFlowType} flowType 
 * @param {import('./types').EntityContext} entity 
 * @param {Partial<import('./types').QueryFlowInputs>} [overrides] 
 * @param {string[]} [availableTables] 
 * @param {Object} [systemConfig] - The SystemConfig from the backend (optional)
 * @returns {import('./types').BuiltQuery}
 */
export function buildFlowQuery(flowType, entity, overrides = {}, availableTables = [], systemConfig = null) {
  const recipe = QUERY_FLOW_RECIPES[flowType];
  
  if (!recipe) {
    throw new Error(`Unknown query flow: ${flowType}`);
  }
  
  const defaults = recipe.buildDefaults(entity);
  const inputs = { ...defaults, ...overrides };
  
  // If systemConfig is provided, resolve entity locations from it
  const resolvedEntity = resolveEntityFromConfig(entity, systemConfig);
  
  // Pass systemConfig to the query builder (for recipes that support it)
  return recipe.buildQuery(resolvedEntity, inputs, availableTables, systemConfig);
}

/**
 * Resolve entity locations from SystemConfig.
 * 
 * If systemConfig is provided, use it to get the correct database/schema/table names.
 * This ensures we use the discovered locations instead of hardcoded defaults.
 * 
 * @param {import('./types').EntityContext} entity 
 * @param {Object} [systemConfig] 
 * @returns {import('./types').EntityContext}
 */
function resolveEntityFromConfig(entity, systemConfig) {
  if (!systemConfig?.snowflake?.entities) {
    return entity;
  }
  
  // Use queryDefaults from systemConfig if entity doesn't have db/schema
  const queryDefaults = systemConfig.queryDefaults || {};
  
  return {
    ...entity,
    database: entity.database || queryDefaults.metadataDb || 'FIELD_METADATA',
    schema: entity.schema || queryDefaults.metadataSchema || 'PUBLIC',
  };
}

/**
 * Check if a flow is supported for an entity type
 * @param {import('./types').QueryFlowType} flowType 
 * @param {import('./types').EntityType} entityType 
 * @returns {boolean}
 */
export function isFlowSupported(flowType, entityType) {
  const recipe = QUERY_FLOW_RECIPES[flowType];
  if (!recipe) return false;
  return recipe.supportedEntityTypes.includes(entityType) || 
         recipe.supportedEntityTypes.includes('UNKNOWN');
}

// =============================================================================
// Module Initialization - Validate all recipes at load time
// =============================================================================

// Validate recipes when module loads (development/debugging aid)
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  validateAllRecipes(QUERY_FLOW_RECIPES);
}

export default {
  QUERY_FLOW_RECIPES,
  getFlowsForEntityType,
  buildFlowQuery,
  isFlowSupported,
  // Export validation for testing
  validateRecipe,
  validateAllRecipes,
};

