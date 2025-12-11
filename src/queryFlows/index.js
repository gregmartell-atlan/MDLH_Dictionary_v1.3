/**
 * Query Flows Module
 * 
 * Config-driven query flow system for all entity types and query types.
 * 
 * Usage:
 * ```js
 * import { openQueryFlow, getAvailableFlows, buildEntityContext } from './queryFlows';
 * 
 * // From MDLH entity data
 * const entity = buildEntityContext(mdlhRow);
 * 
 * // Get available flows for this entity type
 * const flows = getAvailableFlows(entity);
 * 
 * // Open a specific flow
 * openQueryFlow({
 *   flow: 'LINEAGE',
 *   entity,
 *   availableTables: discoveredTables,
 *   onOpen: (builtQuery) => {
 *     // Open in editor
 *     setSql(builtQuery.sql);
 *     setTitle(builtQuery.title);
 *   }
 * });
 * ```
 */

// Types
export { 
  ENTITY_TYPE_CONFIG, 
  QUERY_FLOW_CONFIG,
  mapTypenameToEntityType,
  buildEntityContext,
} from './types';

// Registry
export { 
  QUERY_FLOW_RECIPES,
  getFlowsForEntityType,
  buildFlowQuery,
  isFlowSupported,
} from './registry';

// Entry point helpers
export {
  openQueryFlow,
  getAvailableFlows,
  openLineageFlow,
  openSampleRowsFlow,
  openUsageFlow,
  openFindByGuidFlow,
  openSchemaBrowseFlow,
  openGlossaryFlow,
} from './openFlow';

// SQL Builders (for direct use if needed)
export { buildLineageQuery, buildLineageExplorationQuery } from './sql/lineage';
export { buildUsageQuery, buildPopularityQuery } from './sql/usage';
export { buildSampleRowsQuery, buildTableStatsQuery } from './sql/sampleRows';
export { buildSchemaBrowseQuery, buildTableSearchQuery, buildColumnDetailsQuery } from './sql/schemaBrowse';
export { buildGlossaryQuery, buildTermLinkedAssetsQuery, buildListGlossariesQuery } from './sql/glossary';
export { buildFindByGuidQuery, buildGuidDetailsQuery } from './sql/findByGuid';

