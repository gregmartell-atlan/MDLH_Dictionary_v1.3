/**
 * ResultFlowSuggestions Component
 * 
 * Shows contextual query flow suggestions based on query results.
 * Detects entity data (GUIDs, table names, etc.) and suggests relevant flows.
 * 
 * This enables the "progressive query" workflow:
 * 1. User runs a discovery query (e.g., SHOW TABLES)
 * 2. Results show tables with GUIDs
 * 3. This component suggests flows for those entities
 * 4. User clicks to explore lineage, samples, etc.
 */

import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  GitBranch,
  Table,
  Activity,
  ChevronRight,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Layers,
  X,
  Lightbulb,
  Zap,
} from 'lucide-react';
import { buildFlowQuery, buildEntityContext } from '../queryFlows';

/**
 * Detect entity type from row data
 */
function detectEntityType(row, columns) {
  const colNames = columns.map(c => (c?.name || c)?.toUpperCase());
  
  // Check for explicit typename column
  if (row.TYPENAME || row.typename) {
    const type = String(row.TYPENAME || row.typename).toUpperCase();
    if (type.includes('TABLE')) return 'TABLE';
    if (type.includes('VIEW')) return 'VIEW';
    if (type.includes('COLUMN')) return 'COLUMN';
    if (type.includes('PROCESS')) return 'PROCESS';
    if (type.includes('DASHBOARD')) return 'DASHBOARD';
    if (type.includes('GLOSSARY')) return 'GLOSSARY_TERM';
    return type;
  }

  // Infer from columns present
  if (colNames.includes('COLUMN_NAME') || colNames.includes('COLUMNNAME')) return 'COLUMN';
  if (colNames.includes('TABLE_NAME') || colNames.includes('TABLENAME')) return 'TABLE';
  if (colNames.includes('VIEW_NAME') || colNames.includes('VIEWNAME')) return 'VIEW';
  if (colNames.includes('PROCESS_NAME') || colNames.includes('PROCESSNAME')) return 'PROCESS';
  
  // Check for GUID presence
  if (colNames.includes('GUID')) {
    // Try to infer from name patterns
    const name = row.NAME || row.name || '';
    if (name.toLowerCase().includes('process')) return 'PROCESS';
    return 'TABLE'; // Default assumption for entities with GUIDs
  }

  return 'UNKNOWN';
}

/**
 * Extract entities from query results
 */
function extractEntitiesFromResults(results, maxEntities = 5) {
  if (!results?.rows?.length || !results?.columns?.length) return [];

  const columns = results.columns;
  const colNames = columns.map(c => (c?.name || c)?.toUpperCase());
  
  // Check if this looks like entity data
  const hasGuid = colNames.includes('GUID');
  const hasName = colNames.includes('NAME') || colNames.includes('TABLE_NAME') || colNames.includes('QUALIFIED_NAME');
  
  if (!hasGuid && !hasName) return [];

  const entities = [];
  const seen = new Set();

  for (const row of results.rows.slice(0, maxEntities)) {
    const guid = row.GUID || row.guid;
    const name = row.NAME || row.name || row.TABLE_NAME || row.table_name;
    
    if (!guid && !name) continue;
    
    const key = guid || name;
    if (seen.has(key)) continue;
    seen.add(key);

    const entityType = detectEntityType(row, columns);
    
    entities.push({
      type: entityType,
      guid: guid,
      name: name,
      qualifiedName: row.QUALIFIEDNAME || row.qualified_name || row.QUALIFIED_NAME,
      database: row.DATABASE_NAME || row.database_name || row.DATABASE,
      schema: row.SCHEMA_NAME || row.schema_name || row.SCHEMA,
      table: row.TABLE_NAME || row.table_name,
      column: row.COLUMN_NAME || row.column_name,
      extra: row,
    });
  }

  return entities;
}

/**
 * Get suggested flows for an entity type
 */
function getSuggestedFlows(entityType) {
  const flows = [];

  if (['TABLE', 'VIEW', 'COLUMN', 'PROCESS'].includes(entityType)) {
    flows.push({
      id: 'LINEAGE_UP',
      flowId: 'LINEAGE',
      label: 'Upstream',
      description: 'Find source dependencies',
      icon: ArrowUpRight,
      color: 'blue',
      overrides: { direction: 'UPSTREAM' },
    });
    flows.push({
      id: 'LINEAGE_DOWN',
      flowId: 'LINEAGE',
      label: 'Downstream',
      description: 'Find impact',
      icon: ArrowDownRight,
      color: 'orange',
      overrides: { direction: 'DOWNSTREAM' },
    });
  }

  if (['TABLE', 'VIEW'].includes(entityType)) {
    flows.push({
      id: 'SAMPLE',
      flowId: 'SAMPLE_ROWS',
      label: 'Sample Rows',
      description: 'Preview data',
      icon: Table,
      color: 'emerald',
      overrides: {},
    });
  }

  if (entityType === 'COLUMN') {
    flows.push({
      id: 'PROFILE',
      flowId: 'COLUMN_PROFILE',
      label: 'Profile',
      description: 'Column statistics',
      icon: Activity,
      color: 'purple',
      overrides: {},
    });
  }

  flows.push({
    id: 'USAGE',
    flowId: 'USAGE',
    label: 'Usage',
    description: 'Recent queries',
    icon: Activity,
    color: 'gray',
    overrides: {},
  });

  return flows;
}

/**
 * Single entity card with flow buttons
 */
function EntityFlowCard({ entity, availableTables, onSelectFlow, onDismiss }) {
  const flows = useMemo(() => getSuggestedFlows(entity.type), [entity.type]);

  const handleFlow = (flow) => {
    const builtQuery = buildFlowQuery(flow.flowId, entity, flow.overrides, availableTables);
    onSelectFlow(builtQuery, flow.flowId);
  };

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200',
    orange: 'bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200',
    emerald: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200',
    purple: 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200',
    gray: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded bg-indigo-100">
            {entity.type === 'COLUMN' ? <Layers size={14} className="text-indigo-600" /> :
             entity.type === 'PROCESS' ? <GitBranch size={14} className="text-indigo-600" /> :
             <Table size={14} className="text-indigo-600" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate" title={entity.name}>
              {entity.name || entity.guid?.substring(0, 8) + '...'}
            </div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">
              {entity.type}
            </div>
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={() => onDismiss(entity)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {flows.slice(0, 4).map((flow) => {
          const Icon = flow.icon;
          return (
            <button
              key={flow.id}
              onClick={() => handleFlow(flow)}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${colorClasses[flow.color]}`}
              title={flow.description}
            >
              <Icon size={12} />
              {flow.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Main component - shows flow suggestions based on query results
 */
export default function ResultFlowSuggestions({
  results,
  availableTables = [],
  onSelectFlow,
  className = '',
}) {
  const [dismissed, setDismissed] = useState(new Set());
  const [isExpanded, setIsExpanded] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);

  const entities = useMemo(() => {
    const all = extractEntitiesFromResults(results, 10);
    return all.filter(e => !dismissed.has(e.guid || e.name));
  }, [results, dismissed]);

  const handleDismiss = (entity) => {
    setDismissed(prev => new Set([...prev, entity.guid || entity.name]));
  };

  const handleDismissAll = () => {
    setIsMinimized(true);
  };

  if (entities.length === 0) return null;

  if (isMinimized) {
    return (
      <button
        onClick={() => setIsMinimized(false)}
        className={`flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:text-indigo-700 
          bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors ${className}`}
      >
        <Sparkles size={16} />
        <span>Show Query Flows ({entities.length} entities)</span>
      </button>
    );
  }

  return (
    <div className={`bg-gradient-to-r from-indigo-50/50 to-purple-50/50 rounded-xl border border-indigo-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-indigo-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500">
            <Lightbulb size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-800">
              Continue Exploring
            </div>
            <div className="text-[11px] text-gray-500">
              {entities.length} entities detected in results
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
            <ChevronRight size={14} className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
          <button
            onClick={handleDismissAll}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
            title="Minimize"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {entities.slice(0, isExpanded ? 6 : 2).map((entity, idx) => (
              <EntityFlowCard
                key={entity.guid || entity.name || idx}
                entity={entity}
                availableTables={availableTables}
                onSelectFlow={onSelectFlow}
                onDismiss={handleDismiss}
              />
            ))}
          </div>

          {entities.length > 6 && (
            <div className="mt-3 text-center">
              <span className="text-xs text-gray-500">
                +{entities.length - 6} more entities in results
              </span>
            </div>
          )}

          {/* Quick tip */}
          <div className="mt-4 flex items-start gap-2 text-xs text-gray-500 bg-white/50 rounded-lg p-2">
            <Zap size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Tip:</strong> Click any entity's flow buttons to generate a query. 
              Use Upstream/Downstream for lineage, Sample for data preview.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline version for result rows
 */
export function InlineEntityFlows({ row, columns, availableTables, onSelectFlow }) {
  const entity = useMemo(() => {
    const entityType = detectEntityType(row, columns);
    return {
      type: entityType,
      guid: row.GUID || row.guid,
      name: row.NAME || row.name || row.TABLE_NAME,
      qualifiedName: row.QUALIFIEDNAME || row.qualified_name,
      database: row.DATABASE_NAME || row.database_name,
      schema: row.SCHEMA_NAME || row.schema_name,
      table: row.TABLE_NAME || row.table_name,
      column: row.COLUMN_NAME || row.column_name,
      extra: row,
    };
  }, [row, columns]);

  const flows = useMemo(() => getSuggestedFlows(entity.type).slice(0, 3), [entity.type]);

  const handleFlow = (flow) => {
    const builtQuery = buildFlowQuery(flow.flowId, entity, flow.overrides, availableTables);
    onSelectFlow(builtQuery, flow.flowId);
  };

  if (!entity.guid && !entity.name) return null;

  return (
    <div className="flex items-center gap-1">
      {flows.map((flow) => {
        const Icon = flow.icon;
        return (
          <button
            key={flow.id}
            onClick={(e) => {
              e.stopPropagation();
              handleFlow(flow);
            }}
            className="p-1 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50 transition-colors"
            title={`${flow.label}: ${flow.description}`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

