/**
 * Intelligent Lineage Service
 *
 * OpenLineage-compliant implementation for MDLH metadata
 *
 * OpenLineage Concepts:
 * - Dataset: A data asset with namespace + name (tables, views, dashboards, reports)
 * - Job: A process that transforms data (ETL, queries, pipelines)
 * - Lineage: Jobs with input[] → output[] Datasets
 *
 * This service provides:
 * 1. Entity-agnostic lineage fetching (works with any asset type)
 * 2. Intelligent graph building from PROCESS_ENTITY relationships
 * 3. Interactive exploration support
 * 4. Query-aware lineage detection
 *
 * Performance logging enabled - check console for [MDLH][Lineage] entries
 *
 * @see https://openlineage.io/docs/spec/
 */

import { createLogger } from '../utils/logger';

const log = createLogger('Lineage');

// Entity tables in MDLH
const ENTITY_TABLES = [
  'TABLE_ENTITY',
  'BI_DASHBOARD_ENTITY', 
  'BI_REPORT_ENTITY',
  'COLUMN_ENTITY',
  'SCHEMA_ENTITY',
  'DATABASE_ENTITY',
  'VIEW_ENTITY',
];

/**
 * Extract table/entity names from a SQL query
 * @param {string} sql - The SQL query
 * @returns {string[]} Array of potential entity names
 */
export function extractEntitiesFromSQL(sql) {
  if (!sql) return [];
  
  const entities = new Set();
  
  // Remove comments
  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Match FROM and JOIN clauses: FROM [db.][schema.]table_name [alias]
  const fromJoinPattern = /(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){0,2})/gi;
  
  let match;
  while ((match = fromJoinPattern.exec(cleanSql)) !== null) {
    const tableName = match[1];
    const parts = tableName.split('.');
    const justTable = parts[parts.length - 1].toUpperCase();
    
    // Skip common keywords
    if (!['SELECT', 'WHERE', 'AND', 'OR', 'ON', 'AS', 'SET', 'VALUES'].includes(justTable)) {
      entities.add(justTable);
    }
  }
  
  // Also extract from WHERE clause patterns like WHERE "NAME" = 'X'
  const whereNamePattern = /WHERE[^;]*?"NAME"\s*=\s*'([^']+)'/gi;
  while ((match = whereNamePattern.exec(cleanSql)) !== null) {
    entities.add(match[1].toUpperCase());
  }
  
  return Array.from(entities);
}

/**
 * Build FQN for a table
 */
export function buildFQN(database, schema, table) {
  return `${database}.${schema}.${table}`;
}

/**
 * Parse JSON array from string or return as-is
 */
function parseJsonArray(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

/**
 * Normalize a row from query results (handles array or object format)
 */
function normalizeRow(rawRow, columns) {
  if (!rawRow) return null;
  if (Array.isArray(rawRow) && columns?.length) {
    return columns.reduce((acc, col, idx) => ({ ...acc, [col]: rawRow[idx] }), {});
  }
  return rawRow;
}

/**
 * Parse PROCESS_NAME to extract source and target information
 * Format: "SOURCE_PATH and N more → TARGET_PATH"
 */
export function parseProcessName(processName) {
  if (!processName) return { sources: [], targets: [], raw: processName };
  
  // Split on arrow (→ or ->)
  const arrowMatch = processName.match(/(.+?)\s*(?:→|->)\s*(.+)/);
  if (!arrowMatch) {
    return { sources: [processName], targets: [], raw: processName };
  }
  
  const [, leftSide, rightSide] = arrowMatch;
  
  // Extract table name from path like "DB/SCHEMA/TABLE"
  const extractName = (path) => {
    const parts = path.trim().split('/');
    return parts[parts.length - 1] || path.trim();
  };
  
  // Parse "TABLE and N more" pattern
  const parseWithMore = (side) => {
    const moreMatch = side.match(/(.+?)(?:\s+and\s+(\d+)\s+more)?$/i);
    const primary = extractName(moreMatch?.[1] || side);
    const additionalCount = parseInt(moreMatch?.[2] || '0', 10);
    return { primary, additionalCount, full: moreMatch?.[1]?.trim() || side.trim() };
  };
  
  const sourceInfo = parseWithMore(leftSide);
  const targetInfo = parseWithMore(rightSide);
  
  return {
    primarySource: sourceInfo.primary,
    primaryTarget: targetInfo.primary,
    sourceCount: 1 + sourceInfo.additionalCount,
    targetCount: 1 + targetInfo.additionalCount,
    fullSource: sourceInfo.full,
    fullTarget: targetInfo.full,
    raw: processName,
  };
}

/**
 * LineageService class - Intelligent lineage fetching and graph building
 */
export class LineageService {
  constructor(executeQuery, database, schema) {
    this.executeQuery = executeQuery;
    this.database = database;
    this.schema = schema;
  }
  
  /**
   * Find an entity by name across all entity tables
   * Runs queries in PARALLEL for better performance
   * @param {string} entityName - Name of the entity to find
   * @returns {Promise<Object|null>} Entity info or null
   */
  async findEntity(entityName) {
    if (!entityName) return null;

    const endTimer = log.time(`findEntity("${entityName}")`);

    // Run all entity table queries in PARALLEL
    const queries = ENTITY_TABLES.map(async (entityTable) => {
      const tableTimer = log.time(`findEntity query: ${entityTable}`);
      try {
        const sql = `
          SELECT guid, name, qualifiedname, typename
          FROM ${buildFQN(this.database, this.schema, entityTable)}
          WHERE UPPER(name) = '${entityName.toUpperCase()}'
          LIMIT 1
        `;

        const result = await this.executeQuery(sql);
        tableTimer({ found: result?.rows?.length > 0, table: entityTable });

        if (result?.rows?.length) {
          const row = normalizeRow(result.rows[0], result.columns);
          return {
            guid: row?.GUID || row?.guid,
            name: row?.NAME || row?.name,
            qualifiedName: row?.QUALIFIEDNAME || row?.qualifiedName,
            typeName: row?.TYPENAME || row?.typename,
            sourceTable: entityTable,
          };
        }
        return null;
      } catch (err) {
        tableTimer({ error: err.message, table: entityTable });
        // Table might not exist, continue to next
        return null;
      }
    });

    // Wait for all queries and return first non-null result
    const results = await Promise.all(queries);
    const found = results.find(r => r !== null) || null;
    endTimer({ found: !!found, checkedTables: ENTITY_TABLES.length });
    return found;
  }
  
  /**
   * Find an entity by GUID
   * Runs queries in PARALLEL for better performance
   * @param {string} guid - GUID of the entity
   * @returns {Promise<Object|null>} Entity info or null
   */
  async findEntityByGuid(guid) {
    if (!guid) return null;

    // Run all entity table queries in PARALLEL
    const queries = ENTITY_TABLES.map(async (entityTable) => {
      try {
        const sql = `
          SELECT guid, name, qualifiedname, typename
          FROM ${buildFQN(this.database, this.schema, entityTable)}
          WHERE guid = '${guid}'
          LIMIT 1
        `;

        const result = await this.executeQuery(sql);
        if (result?.rows?.length) {
          const row = normalizeRow(result.rows[0], result.columns);
          return {
            guid: row?.GUID || row?.guid,
            name: row?.NAME || row?.name,
            qualifiedName: row?.QUALIFIEDNAME || row?.qualifiedName,
            typeName: row?.TYPENAME || row?.typename,
            sourceTable: entityTable,
          };
        }
        return null;
      } catch (err) {
        // GUID lookup failed for this table
        return null;
      }
    });

    // Wait for all queries and return first non-null result
    const results = await Promise.all(queries);
    return results.find(r => r !== null) || null;
  }
  
  /**
   * Get lineage for an entity (by name or GUID)
   * @param {string} entityNameOrGuid - Entity name or GUID
   * @returns {Promise<Object>} Lineage graph data
   */
  async getLineage(entityNameOrGuid) {
    const endTimer = log.time(`getLineage("${entityNameOrGuid}")`);
    log.info('Starting lineage fetch', { entityNameOrGuid });

    // First, find the entity
    const findEntityTimer = log.time('getLineage: find entity');
    let entity = await this.findEntity(entityNameOrGuid);
    if (!entity) {
      // Try as GUID
      entity = await this.findEntityByGuid(entityNameOrGuid);
    }
    findEntityTimer({ found: !!entity });

    if (!entity) {
      endTimer({ error: 'Entity not found' });
      return {
        error: `Entity "${entityNameOrGuid}" not found in MDLH metadata`,
        nodes: [],
        edges: [],
        rawProcesses: [],
      };
    }

    log.info('Entity found', { name: entity.name, guid: entity.guid, type: entity.typeName });

    // Fetch upstream and downstream processes in PARALLEL for better performance
    // Upstream: where this entity is in OUTPUTS (something produced this entity)
    // Downstream: where this entity is in INPUTS (something consumes this entity)
    const processTimer = log.time('getLineage: fetch processes (parallel)');
    const [upstreamProcesses, downstreamProcesses] = await Promise.all([
      this.getProcesses(entity.guid, 'OUTPUTS'),
      this.getProcesses(entity.guid, 'INPUTS'),
    ]);
    processTimer({ upstream: upstreamProcesses.length, downstream: downstreamProcesses.length });

    // Build the graph
    const graphTimer = log.time('getLineage: build graph');
    const result = this.buildGraph(entity, upstreamProcesses, downstreamProcesses);
    graphTimer({ nodes: result.nodes.length, edges: result.edges.length });

    endTimer({ nodes: result.nodes.length, edges: result.edges.length, processes: result.rawProcesses.length });
    return result;
  }
  
  /**
   * Get processes where entity GUID appears in specified field
   * @param {string} entityGuid - Entity GUID to search for
   * @param {string} field - 'INPUTS' or 'OUTPUTS'
   * @returns {Promise<Array>} Array of process records
   */
  async getProcesses(entityGuid, field) {
    // field is 'INPUTS' or 'OUTPUTS' - convert to lowercase for column access
    const columnName = field.toLowerCase();
    // inputs/outputs are ARRAY(VARCHAR) - use LATERAL FLATTEN with JOIN
    const sql = `
      SELECT DISTINCT
        p.guid AS process_guid,
        p.name AS process_name,
        p.typename AS process_type,
        p.inputs AS inputs,
        p.outputs AS outputs,
        p.popularityscore AS popularity
      FROM ${buildFQN(this.database, this.schema, 'PROCESS_ENTITY')} p,
      LATERAL FLATTEN(input => p.${columnName}) f
      WHERE f.value::STRING = '${entityGuid}'
      ORDER BY p.popularityscore DESC NULLS LAST
      LIMIT 10
    `;
    
    try {
      const result = await this.executeQuery(sql);
      return (result?.rows || []).map(row => normalizeRow(row, result?.columns));
    } catch (err) {
      // Error fetching processes - return empty array
      return [];
    }
  }
  
  /**
   * Build graph data from entity and processes
   */
  buildGraph(entity, upstreamProcesses, downstreamProcesses) {
    const nodes = [];
    const edges = [];
    const rawProcesses = [];
    let nodeId = 0;
    
    const seenUpstream = new Set();
    const seenDownstream = new Set();
    
    // Process upstream (sources that feed into this entity)
    upstreamProcesses.forEach(proc => {
      const processName = proc?.PROCESS_NAME || proc?.process_name || '';
      const parsed = parseProcessName(processName);
      
      rawProcesses.push({
        direction: 'upstream',
        guid: proc?.PROCESS_GUID || proc?.process_guid,
        name: processName,
        type: proc?.PROCESS_TYPE || proc?.process_type || 'Process',
        inputCount: parseJsonArray(proc?.INPUTS || proc?.inputs).length,
        outputCount: parseJsonArray(proc?.OUTPUTS || proc?.outputs).length,
        parsed,
      });
      
      // Add source node from parsed process name
      if (parsed.primarySource && !seenUpstream.has(parsed.primarySource)) {
        seenUpstream.add(parsed.primarySource);
        nodes.push({
          id: `upstream_${nodeId++}`,
          label: parsed.primarySource,
          type: 'dataset',
          typeName: 'Table',
          fullPath: parsed.fullSource,
          column: 0,
          row: nodes.filter(n => n.column === 0).length,
          additionalCount: parsed.sourceCount - 1,
        });
      }
    });
    
    // Add main entity node (center)
    const mainNode = {
      id: 'main',
      label: entity.name,
      type: 'dataset',
      typeName: entity.typeName || 'Asset',
      guid: entity.guid,
      qualifiedName: entity.qualifiedName,
      column: 1,
      row: 0,
      isMain: true,
    };
    nodes.push(mainNode);
    
    // Add edges from upstream to main
    nodes.filter(n => n.column === 0).forEach(n => {
      edges.push({ from: n.id, to: 'main' });
    });
    
    // Process downstream (targets that this entity feeds)
    downstreamProcesses.forEach(proc => {
      const processName = proc?.PROCESS_NAME || proc?.process_name || '';
      const parsed = parseProcessName(processName);
      
      rawProcesses.push({
        direction: 'downstream',
        guid: proc?.PROCESS_GUID || proc?.process_guid,
        name: processName,
        type: proc?.PROCESS_TYPE || proc?.process_type || 'Process',
        inputCount: parseJsonArray(proc?.INPUTS || proc?.inputs).length,
        outputCount: parseJsonArray(proc?.OUTPUTS || proc?.outputs).length,
        parsed,
      });
      
      // Add target node from parsed process name
      if (parsed.primaryTarget && !seenDownstream.has(parsed.primaryTarget)) {
        seenDownstream.add(parsed.primaryTarget);
        const id = `downstream_${nodeId++}`;
        nodes.push({
          id,
          label: parsed.primaryTarget,
          type: 'dataset',
          typeName: 'Table',
          fullPath: parsed.fullTarget,
          column: 2,
          row: nodes.filter(n => n.column === 2).length,
          additionalCount: parsed.targetCount - 1,
        });
        edges.push({ from: 'main', to: id });
      }
    });
    
    return {
      nodes,
      edges,
      rawProcesses,
      metadata: {
        entityName: entity.name,
        entityGuid: entity.guid,
        entityType: entity.typeName,
        upstreamCount: seenUpstream.size,
        downstreamCount: seenDownstream.size,
        totalProcesses: rawProcesses.length,
      },
    };
  }
  
  /**
   * Get lineage for entities detected in a SQL query
   * @param {string} sql - SQL query to analyze
   * @returns {Promise<Object>} Combined lineage for all detected entities
   */
  async getLineageFromQuery(sql) {
    const entities = extractEntitiesFromSQL(sql);

    if (entities.length === 0) {
      return {
        nodes: [],
        edges: [],
        rawProcesses: [],
        metadata: { detectedEntities: [] },
      };
    }
    
    // Get lineage for the first detected entity (primary table)
    const primaryEntity = entities[0];
    const lineage = await this.getLineage(primaryEntity);
    
    return {
      ...lineage,
      metadata: {
        ...lineage.metadata,
        detectedEntities: entities,
        primaryEntity,
      },
    };
  }
}

/**
 * Create a lineage service instance
 */
export function createLineageService(executeQuery, database, schema) {
  return new LineageService(executeQuery, database, schema);
}

/**
 * Detect if query results are lineage data
 * @param {Object} queryResult - Query result with columns and rows
 * @returns {boolean} True if this looks like lineage data
 */
export function isLineageQueryResult(queryResult) {
  if (!queryResult?.columns) return false;
  
  const cols = queryResult.columns.map(c => c.toUpperCase());
  
  // Check for process entity columns
  const hasProcessName = cols.some(c => c.includes('PROCESS_NAME') || c.includes('NAME'));
  const hasInputs = cols.some(c => c.includes('INPUTS') || c.includes('INPUT'));
  const hasOutputs = cols.some(c => c.includes('OUTPUTS') || c.includes('OUTPUT'));
  
  // Must have at least process name and one of inputs/outputs
  return hasProcessName && (hasInputs || hasOutputs);
}

/**
 * Transform lineage query results into graph visualization data
 * 
 * This allows ANY query that returns lineage data to be visualized,
 * not just the pre-built lineage queries.
 * 
 * @param {Object} queryResult - Query result with columns and rows
 * @param {string} focusEntity - Optional entity to highlight as "main"
 * @returns {Object} Lineage graph data { nodes, edges, rawProcesses, metadata }
 */
export function transformLineageResultsToGraph(queryResult, focusEntity = null) {
  if (!queryResult?.rows?.length) {
    return { nodes: [], edges: [], rawProcesses: [], metadata: {} };
  }
  
  const cols = queryResult.columns.map(c => c.toUpperCase());
  
  // Find column indices
  const findCol = (patterns) => {
    for (const pattern of patterns) {
      const idx = cols.findIndex(c => c.includes(pattern));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  
  const nameIdx = findCol(['PROCESS_NAME', 'NAME']);
  const guidIdx = findCol(['PROCESS_GUID', 'GUID']);
  const typeIdx = findCol(['PROCESS_TYPE', 'TYPE', 'TYPENAME']);
  const inputsIdx = findCol(['INPUTS', 'INPUT']);
  const outputsIdx = findCol(['OUTPUTS', 'OUTPUT']);
  
  const nodes = [];
  const edges = [];
  const rawProcesses = [];
  const seenSources = new Set();
  const seenTargets = new Set();
  let nodeId = 0;
  
  // Process each row
  queryResult.rows.forEach((row, rowIdx) => {
    const getValue = (idx) => {
      if (idx < 0) return null;
      return Array.isArray(row) ? row[idx] : row[cols[idx]];
    };
    
    const processName = getValue(nameIdx) || `Process ${rowIdx + 1}`;
    const processGuid = getValue(guidIdx) || `proc_${rowIdx}`;
    const processType = getValue(typeIdx) || 'Process';
    const inputs = parseJsonArray(getValue(inputsIdx));
    const outputs = parseJsonArray(getValue(outputsIdx));
    
    // Parse process name to extract source/target
    const parsed = parseProcessName(processName);
    
    rawProcesses.push({
      guid: processGuid,
      name: processName,
      type: processType,
      inputCount: inputs.length,
      outputCount: outputs.length,
      parsed,
    });
    
    // Add source node if not seen
    if (parsed.primarySource && !seenSources.has(parsed.primarySource)) {
      seenSources.add(parsed.primarySource);
      nodes.push({
        id: `source_${nodeId++}`,
        label: parsed.primarySource,
        type: 'dataset',
        typeName: 'Source',
        fullPath: parsed.fullSource,
        column: 0,
        row: nodes.filter(n => n.column === 0).length,
        additionalCount: parsed.sourceCount - 1,
      });
    }
    
    // Add target node if not seen
    if (parsed.primaryTarget && !seenTargets.has(parsed.primaryTarget)) {
      seenTargets.add(parsed.primaryTarget);
      nodes.push({
        id: `target_${nodeId++}`,
        label: parsed.primaryTarget,
        type: 'dataset',
        typeName: 'Target',
        fullPath: parsed.fullTarget,
        column: 2,
        row: nodes.filter(n => n.column === 2).length,
        additionalCount: parsed.targetCount - 1,
      });
    }
  });
  
  // Add process nodes in the middle (column 1)
  const processNode = {
    id: 'processes',
    label: `${rawProcesses.length} Process${rawProcesses.length !== 1 ? 'es' : ''}`,
    type: 'process',
    typeName: 'Process',
    column: 1,
    row: 0,
    isMain: !focusEntity,
  };
  nodes.push(processNode);
  
  // Add edges: sources → processes → targets
  nodes.filter(n => n.column === 0).forEach(n => {
    edges.push({ from: n.id, to: 'processes' });
  });
  nodes.filter(n => n.column === 2).forEach(n => {
    edges.push({ from: 'processes', to: n.id });
  });
  
  // If focusEntity specified, try to find and mark it
  if (focusEntity) {
    const focusNode = nodes.find(n => 
      n.label?.toUpperCase() === focusEntity.toUpperCase()
    );
    if (focusNode) {
      focusNode.isMain = true;
      processNode.isMain = false;
    }
  }
  
  return {
    nodes,
    edges,
    rawProcesses,
    metadata: {
      sourceCount: seenSources.size,
      targetCount: seenTargets.size,
      processCount: rawProcesses.length,
      sources: [...seenSources],
      targets: [...seenTargets],
    },
  };
}

/**
 * Auto-detect lineage in query results and transform if applicable
 * @param {Object} queryResult - Query result
 * @param {string} focusEntity - Optional focus entity
 * @returns {Object|null} Lineage graph data if detected, null otherwise
 */
export function autoDetectLineage(queryResult, focusEntity = null) {
  if (!isLineageQueryResult(queryResult)) {
    return null;
  }
  return transformLineageResultsToGraph(queryResult, focusEntity);
}

/**
 * Build Snowflake native lineage query using ACCESS_HISTORY
 * This shows actual runtime lineage from query execution (last 30 days)
 * @param {string} targetFqn - Fully qualified table name (DB.SCHEMA.TABLE)
 * @returns {string} SQL query
 */
export function buildSnowflakeLineageQuery(targetFqn) {
  return `
WITH RECURSIVE lineage_edges AS (
    SELECT DISTINCT
        src.value:objectName::STRING AS source_object,
        tgt.value:objectName::STRING AS target_object
    FROM SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY,
        LATERAL FLATTEN(input => direct_objects_accessed) src,
        LATERAL FLATTEN(input => objects_modified) tgt
    WHERE src.value:objectName::STRING != tgt.value:objectName::STRING
      AND query_start_time >= DATEADD('day', -30, CURRENT_TIMESTAMP())
),
lineage_tree AS (
    SELECT source_object, target_object, 1 AS depth
    FROM lineage_edges
    WHERE UPPER(target_object) = UPPER('${targetFqn}')

    UNION ALL

    SELECT e.source_object, e.target_object, lt.depth + 1
    FROM lineage_edges e
    INNER JOIN lineage_tree lt ON e.target_object = lt.source_object
    WHERE lt.depth < 5
)
SELECT source_object, target_object, MIN(depth) AS depth
FROM lineage_tree
GROUP BY source_object, target_object
ORDER BY depth, target_object, source_object
LIMIT 50;
  `.trim();
}

/**
 * Transform Snowflake ACCESS_HISTORY lineage results to graph format
 * @param {Object} result - Query result from ACCESS_HISTORY
 * @param {string} focusFqn - The target FQN that was queried
 * @returns {Object} Graph data with nodes and edges
 */
export function transformSnowflakeLineageToGraph(result, focusFqn) {
  const rows = result?.rows || [];
  const columns = result?.columns || [];

  if (rows.length === 0) {
    // Return just the focus node with no lineage
    const tableName = focusFqn?.split('.').pop() || focusFqn;
    return {
      nodes: [{
        id: 'main',
        label: tableName,
        type: 'table',
        typeName: 'Table',
        column: 1,
        row: 0,
        isMain: true,
        fqn: focusFqn,
      }],
      edges: [],
      metadata: { tableName, tableFqn: focusFqn, source: 'snowflake' },
      rawProcesses: [],
    };
  }

  const nodeMap = new Map();
  const edges = [];
  const columnRows = { 0: 0, 1: 0, 2: 0 };

  const getOrCreateNode = (fqn, column, isMain = false) => {
    const key = fqn.toUpperCase();
    if (nodeMap.has(key)) return nodeMap.get(key);

    const tableName = fqn.split('.').pop();
    const row = columnRows[column]++;
    const node = {
      id: `node_${nodeMap.size}`,
      label: tableName,
      type: 'table',
      typeName: 'Table',
      column,
      row,
      isMain,
      fqn,
    };
    nodeMap.set(key, node);
    return node;
  };

  // Create focus node in center
  const focusNode = getOrCreateNode(focusFqn, 1, true);

  // Process lineage rows
  rows.forEach(rawRow => {
    const row = Array.isArray(rawRow) && columns.length
      ? columns.reduce((acc, col, idx) => ({ ...acc, [col.toUpperCase()]: rawRow[idx] }), {})
      : rawRow;

    const source = row.SOURCE_OBJECT || row.source_object;
    const target = row.TARGET_OBJECT || row.target_object;
    const depth = Number(row.DEPTH || row.depth || 1);

    if (!source || !target) return;

    // Determine column based on relationship to focus
    // If target is focus -> source is upstream (column 0)
    // If source is focus -> target is downstream (column 2)
    const targetUpper = target.toUpperCase();
    const focusUpper = focusFqn.toUpperCase();

    if (targetUpper === focusUpper) {
      // Source is upstream
      const sourceNode = getOrCreateNode(source, 0);
      edges.push({ from: sourceNode.id, to: focusNode.id });
    } else {
      // Target is downstream of focus chain
      const sourceNode = nodeMap.get(source.toUpperCase()) || getOrCreateNode(source, 0);
      const targetNode = getOrCreateNode(target, sourceNode.column + 1);
      edges.push({ from: sourceNode.id, to: targetNode.id });
    }
  });

  const nodes = Array.from(nodeMap.values());
  const tableName = focusFqn?.split('.').pop() || focusFqn;

  return {
    nodes,
    edges,
    metadata: {
      tableName,
      tableFqn: focusFqn,
      source: 'snowflake',
      upstreamCount: nodes.filter(n => n.column === 0).length,
      downstreamCount: nodes.filter(n => n.column === 2).length,
    },
    rawProcesses: rows.map(r => ({
      name: `${r.SOURCE_OBJECT || r.source_object} → ${r.TARGET_OBJECT || r.target_object}`,
      type: 'Query',
      direction: 'upstream',
      inputCount: 1,
      outputCount: 1,
    })),
  };
}

/**
 * Create a Snowflake native lineage service
 * @param {Function} executeQuery - Query execution function
 * @returns {Object} Service with getLineage method
 */
export function createSnowflakeLineageService(executeQuery) {
  return {
    async getLineage(tableFqn) {
      if (!tableFqn) return { nodes: [], edges: [], error: 'No table specified' };

      try {
        const sql = buildSnowflakeLineageQuery(tableFqn);
        const result = await executeQuery(sql);

        if (!result || result.error) {
          return {
            nodes: [],
            edges: [],
            error: result?.error || 'Failed to query ACCESS_HISTORY. You may need ACCOUNTADMIN or GOVERNANCE_VIEWER role.',
          };
        }

        return transformSnowflakeLineageToGraph(result, tableFqn);
      } catch (err) {
        return {
          nodes: [],
          edges: [],
          error: `ACCESS_HISTORY query failed: ${err.message}. Requires ACCOUNTADMIN or GOVERNANCE_VIEWER role.`,
        };
      }
    },
  };
}

export default LineageService;

