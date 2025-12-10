/**
 * Query Flow Entry Point
 * 
 * Helper function to open a query flow from any entity context.
 * This bridges the registry to the UI (FlyoutQueryEditor / TestQueryLayout).
 */

import { buildFlowQuery, getFlowsForEntityType, isFlowSupported } from './registry';
import { QUERY_FLOW_CONFIG, buildEntityContext } from './types';
import { createLogger } from '../utils/logger';

const flowLog = createLogger('QueryFlow');

/**
 * @typedef {Object} FlowOpenOptions
 * @property {import('./types').QueryFlowType} flow - The query flow to run
 * @property {import('./types').EntityContext} entity - Entity context
 * @property {Partial<import('./types').QueryFlowInputs>} [inputs] - Override inputs
 * @property {string[]} [availableTables] - Available tables for validation
 * @property {(query: import('./types').BuiltQuery) => void} onOpen - Callback when flow opens
 */

/**
 * Open a query flow for an entity
 * @param {FlowOpenOptions} options 
 * @returns {import('./types').BuiltQuery | null}
 */
export function openQueryFlow({ flow, entity, inputs = {}, availableTables = [], onOpen }) {
  flowLog.info('Opening query flow', {
    flow,
    entityType: entity.type,
    entityName: entity.name,
    entityGuid: entity.guid?.substring(0, 8),
  });

  // Check if flow is supported for this entity type
  if (!isFlowSupported(flow, entity.type)) {
    flowLog.warn('Flow not supported for entity type', { flow, entityType: entity.type });
    return null;
  }

  try {
    const builtQuery = buildFlowQuery(flow, entity, inputs, availableTables);
    
    flowLog.debug('Built query', {
      title: builtQuery.title,
      sqlLength: builtQuery.sql.length,
    });

    if (onOpen) {
      onOpen(builtQuery);
    }

    return builtQuery;
  } catch (err) {
    flowLog.error('Failed to build query', { error: err.message, flow, entity });
    return null;
  }
}

/**
 * Get available flows for an entity
 * @param {import('./types').EntityContext} entity 
 * @returns {Array<{id: string, label: string, description: string, icon: string}>}
 */
export function getAvailableFlows(entity) {
  const flows = getFlowsForEntityType(entity.type);
  
  return flows.map(recipe => ({
    id: recipe.id,
    label: recipe.label,
    description: recipe.description,
    icon: recipe.icon,
  }));
}

/**
 * Quick action: Open lineage flow
 * @param {import('./types').EntityContext} entity 
 * @param {'UPSTREAM' | 'DOWNSTREAM'} direction 
 * @param {string[]} availableTables 
 * @param {(query: import('./types').BuiltQuery) => void} onOpen 
 */
export function openLineageFlow(entity, direction, availableTables, onOpen) {
  return openQueryFlow({
    flow: 'LINEAGE',
    entity,
    inputs: { direction },
    availableTables,
    onOpen,
  });
}

/**
 * Quick action: Open sample rows flow
 * @param {import('./types').EntityContext} entity 
 * @param {(query: import('./types').BuiltQuery) => void} onOpen 
 */
export function openSampleRowsFlow(entity, onOpen) {
  return openQueryFlow({
    flow: 'SAMPLE_ROWS',
    entity,
    onOpen,
  });
}

/**
 * Quick action: Open usage flow
 * @param {import('./types').EntityContext} entity 
 * @param {string[]} availableTables 
 * @param {(query: import('./types').BuiltQuery) => void} onOpen 
 */
export function openUsageFlow(entity, availableTables, onOpen) {
  return openQueryFlow({
    flow: 'USAGE',
    entity,
    availableTables,
    onOpen,
  });
}

/**
 * Quick action: Find by GUID
 * @param {string} guid 
 * @param {string[]} availableTables 
 * @param {(query: import('./types').BuiltQuery) => void} onOpen 
 */
export function openFindByGuidFlow(guid, availableTables, onOpen) {
  const entity = {
    type: 'UNKNOWN',
    guid,
  };
  
  return openQueryFlow({
    flow: 'FIND_BY_GUID',
    entity,
    availableTables,
    onOpen,
  });
}

/**
 * Quick action: Schema browser
 * @param {string} database 
 * @param {string} schema 
 * @param {string[]} availableTables 
 * @param {(query: import('./types').BuiltQuery) => void} onOpen 
 */
export function openSchemaBrowseFlow(database, schema, availableTables, onOpen) {
  const entity = {
    type: 'SCHEMA',
    database,
    schema,
  };
  
  return openQueryFlow({
    flow: 'SCHEMA_BROWSE',
    entity,
    availableTables,
    onOpen,
  });
}

/**
 * Quick action: Glossary lookup
 * @param {string} term 
 * @param {string[]} availableTables 
 * @param {(query: import('./types').BuiltQuery) => void} onOpen 
 */
export function openGlossaryFlow(term, availableTables, onOpen) {
  const entity = {
    type: 'GLOSSARY_TERM',
    name: term,
  };
  
  return openQueryFlow({
    flow: 'GLOSSARY_LOOKUP',
    entity,
    inputs: { filters: { termName: term } },
    availableTables,
    onOpen,
  });
}

export default {
  openQueryFlow,
  getAvailableFlows,
  openLineageFlow,
  openSampleRowsFlow,
  openUsageFlow,
  openFindByGuidFlow,
  openSchemaBrowseFlow,
  openGlossaryFlow,
  buildEntityContext,
};

