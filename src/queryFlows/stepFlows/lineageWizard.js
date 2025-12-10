/**
 * Lineage Discovery Wizard
 * 
 * A multi-step flow that guides users through:
 * 1. Discovering available lineage/process tables
 * 2. Examining the table structure
 * 3. Finding an asset to trace
 * 4. Building and running the final lineage query
 */

/**
 * @type {import('./types').MultiStepFlow}
 */
export const LINEAGE_WIZARD = {
  id: 'LINEAGE_WIZARD',
  label: 'Lineage Discovery Wizard',
  description: 'Step-by-step guide to trace asset lineage',
  icon: 'GitBranch',
  supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN', 'PROCESS', 'UNKNOWN'],
  
  buildInitialInputs: (entity, availableTables = []) => ({
    entityGuid: entity?.guid,
    entityName: entity?.name,
    entityType: entity?.type,
    database: entity?.database || 'FIELD_METADATA',
    schema: entity?.schema || 'PUBLIC',
    direction: 'DOWNSTREAM',
    availableTables,
  }),
  
  steps: [
    // Step 1: Discover process/lineage tables
    {
      id: 'discover_tables',
      title: 'Step 1: Discover Lineage Tables',
      description: 'First, let\'s find tables that contain lineage data (PROCESS tables store lineage relationships).',
      buildQuery: (entity, inputs) => {
        const db = inputs.database || 'FIELD_METADATA';
        const schema = inputs.schema || 'PUBLIC';
        return `-- Step 1: Find lineage/process tables in your schema
SHOW TABLES LIKE '%PROCESS%' IN ${db}.${schema};

-- Alternative: Show all entity tables
-- SHOW TABLES LIKE '%_ENTITY' IN ${db}.${schema};`;
      },
      extractDataForNext: (results) => {
        // Look for PROCESS_ENTITY or similar
        // SHOW TABLES returns lowercase column names
        const rows = results?.rows || [];
        const getName = (r) => r.name || r.NAME || r['name'] || r['NAME'];
        
        const processTable = rows.find(r => {
          const name = getName(r);
          return name?.toUpperCase()?.includes('PROCESS_ENTITY') ||
                 name?.toUpperCase() === 'PROCESS_ENTITY';
        });
        const processTableName = processTable ? getName(processTable) : rows[0] ? getName(rows[0]) : null;
        
        return {
          processTable: processTableName,
          discoveredTables: rows.map(r => getName(r)).filter(Boolean),
          hasProcessTable: !!processTableName,
        };
      },
      nextStep: 'examine_structure',
    },
    
    // Step 2: Examine table structure
    {
      id: 'examine_structure',
      title: 'Step 2: Examine Table Structure',
      description: 'Now let\'s see what columns are available in the process table to understand the lineage data model.',
      shouldSkip: (inputs) => !inputs.processTable,
      skipMessage: 'No process table found. You may need to check your schema configuration.',
      buildQuery: (entity, inputs) => {
        const table = inputs.processTable || 'PROCESS_ENTITY';
        const db = inputs.database || 'FIELD_METADATA';
        const schema = inputs.schema || 'PUBLIC';
        return `-- Step 2: Examine the structure of ${table}
DESCRIBE TABLE ${db}.${schema}.${table};

-- This shows you the column names and types
-- Look for columns like: INPUTS, OUTPUTS, GUID, NAME, QUALIFIEDNAME`;
      },
      extractDataForNext: (results) => {
        const columns = results?.rows?.map(r => r.column_name || r.COLUMN_NAME) || [];
        const hasInputs = columns.some(c => c?.toUpperCase() === 'INPUTS');
        const hasOutputs = columns.some(c => c?.toUpperCase() === 'OUTPUTS');
        const hasGuid = columns.some(c => c?.toUpperCase() === 'GUID');
        
        return {
          processColumns: columns,
          hasInputsColumn: hasInputs,
          hasOutputsColumn: hasOutputs,
          hasGuidColumn: hasGuid,
          lineageModel: hasInputs && hasOutputs ? 'inputs_outputs' : 'unknown',
        };
      },
      nextStep: 'sample_data',
    },
    
    // Step 3: Sample some data to find GUIDs
    {
      id: 'sample_data',
      title: 'Step 3: Find Assets to Trace',
      description: 'Let\'s look at some actual lineage data and find an asset GUID you can trace.',
      buildQuery: (entity, inputs) => {
        const table = inputs.processTable || 'PROCESS_ENTITY';
        const db = inputs.database || 'FIELD_METADATA';
        const schema = inputs.schema || 'PUBLIC';
        
        // If we have an entity GUID, search for it
        if (entity?.guid) {
          // Escape single quotes for SQL safety
          const safeGuid = entity.guid.replace(/'/g, "''");
          return `-- Step 3: Look for your asset in lineage data
-- Your asset GUID: ${entity.guid}
-- INPUTS/OUTPUTS are ARRAY - use ::STRING for partial GUID match

SELECT 
    "GUID" AS process_guid,
    "NAME" AS process_name,
    ARRAY_SIZE("INPUTS") AS input_count,
    ARRAY_SIZE("OUTPUTS") AS output_count
FROM ${db}.${schema}.${table}
WHERE 
    "INPUTS"::STRING ILIKE '%${safeGuid}%'
    OR "OUTPUTS"::STRING ILIKE '%${safeGuid}%'
LIMIT 10;`;
        }
        
        // Otherwise just sample
        return `-- Step 3: Sample some lineage data to find assets
-- Note: INPUTS/OUTPUTS are ARRAY<OBJECT> types

SELECT 
    "GUID" AS process_guid,
    "NAME" AS process_name,
    ARRAY_SIZE("INPUTS") AS input_count,
    ARRAY_SIZE("OUTPUTS") AS output_count
FROM ${db}.${schema}.${table}
WHERE ARRAY_SIZE("INPUTS") > 0 OR ARRAY_SIZE("OUTPUTS") > 0
LIMIT 10;

-- Tip: Click on a row to explore its lineage`;
      },
      extractDataForNext: (results) => {
        const rows = results?.rows || [];
        // Extract GUIDs from inputs/outputs (they're often JSON arrays)
        const allGuids = new Set();
        
        rows.forEach(row => {
          // Try to parse inputs/outputs as JSON
          try {
            const inputs = JSON.parse(row.inputs || row.INPUTS || '[]');
            const outputs = JSON.parse(row.outputs || row.OUTPUTS || '[]');
            inputs.forEach(i => {
              if (i.guid) allGuids.add(i.guid);
              if (i.uniqueAttributes?.qualifiedName) allGuids.add(i.uniqueAttributes.qualifiedName);
            });
            outputs.forEach(o => {
              if (o.guid) allGuids.add(o.guid);
              if (o.uniqueAttributes?.qualifiedName) allGuids.add(o.uniqueAttributes.qualifiedName);
            });
          } catch (e) {
            // Not JSON, might be string format
          }
          
          // Also capture the process GUID itself
          if (row.guid || row.GUID || row.process_guid) {
            allGuids.add(row.guid || row.GUID || row.process_guid);
          }
        });
        
        return {
          sampleGuids: Array.from(allGuids).slice(0, 10),
          sampleRows: rows.slice(0, 5),
          hasLineageData: rows.length > 0,
        };
      },
      nextStep: 'build_lineage_query',
    },
    
    // Step 4: Build the final lineage query
    {
      id: 'build_lineage_query',
      title: 'Step 4: Trace Lineage',
      description: 'Now let\'s build the full lineage query! This recursive CTE will trace dependencies.',
      buildQuery: (entity, inputs) => {
        const table = inputs.processTable || 'PROCESS_ENTITY';
        const db = inputs.database || 'FIELD_METADATA';
        const schema = inputs.schema || 'PUBLIC';
        const direction = inputs.direction || 'DOWNSTREAM';
        
        // CRITICAL: Only build query if we have a real GUID - never use placeholders
        const guid = entity?.guid || inputs.sampleGuids?.[0] || inputs.selectedGuid;
        
        if (!guid || guid.includes('<') || guid.includes('>')) {
          // No valid GUID - return helpful guidance instead of broken query
          return `-- ⚠️ No Asset GUID Available
-- 
-- To trace lineage, you need a valid asset GUID.
-- 
-- Option 1: Go back to Step 3 and select an asset from the results
-- Option 2: Run this query to find assets with lineage:
SELECT 
    "GUID",
    "NAME",
    ARRAY_SIZE("INPUTS") AS input_count,
    ARRAY_SIZE("OUTPUTS") AS output_count
FROM ${db}.${schema}.${table}
WHERE ARRAY_SIZE("INPUTS") > 0 OR ARRAY_SIZE("OUTPUTS") > 0
LIMIT 20;

-- Then copy a GUID and use it in the lineage query`;
        }
        
        const directionColumn = direction === 'UPSTREAM' ? '"INPUTS"' : '"OUTPUTS"';
        const oppositeColumn = direction === 'UPSTREAM' ? '"OUTPUTS"' : '"INPUTS"';
        const directionLabel = direction === 'UPSTREAM' ? 'upstream' : 'downstream';
        
        // Escape single quotes in GUID for SQL safety
        const safeGuid = guid.replace(/'/g, "''");
        
        // Build the actual lineage query with QUOTED column names
        // INPUTS/OUTPUTS are VARIANT columns - use ::STRING ILIKE for matching
        return `-- Step 4: Full Lineage Query - ${direction} dependencies
-- Starting from: ${entity?.name || guid}
-- Direction: ${directionLabel}

-- Find processes where your asset appears
-- INPUTS/OUTPUTS are ARRAY - use ::STRING ILIKE
SELECT 
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    p."TYPENAME" AS process_type,
    ARRAY_SIZE(p."INPUTS") AS input_count,
    ARRAY_SIZE(p."OUTPUTS") AS output_count
FROM ${db}.${schema}.${table} p
WHERE p.${oppositeColumn}::STRING ILIKE '%${safeGuid}%'
LIMIT 20;

-- To see the actual linked assets, use LATERAL FLATTEN:
-- SELECT 
--     p."GUID" AS process_guid,
--     p."NAME" AS process_name,
--     f.value:"guid"::VARCHAR AS linked_asset_guid,
--     f.value:"typeName"::VARCHAR AS linked_asset_type
-- FROM ${db}.${schema}.${table} p,
-- LATERAL FLATTEN(INPUT => p.${directionColumn}) f
-- WHERE p.${oppositeColumn}::STRING ILIKE '%${safeGuid}%'
-- LIMIT 50;`;
      },
      extractDataForNext: null, // Final step
      nextStep: null,
    },
  ],
};

/**
 * Get the current step from wizard state
 * @param {import('./types').WizardState} state 
 * @returns {import('./types').FlowStep | null}
 */
export function getCurrentStep(state) {
  return LINEAGE_WIZARD.steps[state.currentStepIndex] || null;
}

/**
 * Check if wizard can proceed to next step
 * @param {import('./types').WizardState} state 
 * @returns {boolean}
 */
export function canProceed(state) {
  const currentStep = getCurrentStep(state);
  if (!currentStep) return false;
  
  const lastResult = state.stepResults[state.stepResults.length - 1];
  return lastResult?.success && currentStep.nextStep !== null;
}

export default LINEAGE_WIZARD;

