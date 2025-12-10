import React, { useMemo, useState } from 'react';
import { Loader2, AlertTriangle, ChevronDown, ChevronRight, Code2, Database, Snowflake } from 'lucide-react';
import { LineageRail, LineageSkeleton } from './LineageRail';
import { TabbedCodeCard } from '../ui/TabbedCodeCard';
import { buildSnowflakeLineageQuery } from '../../services/lineageService';

/**
 * LineagePanel - Clean, stacked lineage viewer with source toggle
 *
 * Layout:
 * - Header with entity name + source toggle
 * - Lineage graph (main focus)
 * - Collapsible SQL section (secondary)
 */
export function LineagePanel({
  isConnected,
  database,
  schema,
  lineageData,
  loading,
  error,
  currentTable,
  selectedEntity,
  onRefresh,
  onNodeClick,
  // Props for source switching
  lineageSource = 'mdlh',
  onSourceChange,
  snowflakeLineageData,
  snowflakeLoading,
  snowflakeError,
}) {
  const [showSql, setShowSql] = useState(false);

  // Entity info
  const entityGuid = selectedEntity?.GUID || selectedEntity?.guid || lineageData?.metadata?.tableGuid || null;
  const entityName = selectedEntity?.NAME || selectedEntity?.name || lineageData?.metadata?.tableName || currentTable || null;
  const tableGuid = entityGuid;
  const tableName = entityName;

  // Build FQN for Snowflake lineage
  const tableFqn = useMemo(() => {
    if (!database || !schema || !tableName) return null;
    return `${database}.${schema}.${tableName}`;
  }, [database, schema, tableName]);

  // Select data based on source
  const activeData = lineageSource === 'snowflake' ? snowflakeLineageData : lineageData;
  const activeLoading = lineageSource === 'snowflake' ? snowflakeLoading : loading;
  const activeError = lineageSource === 'snowflake' ? snowflakeError : error;

  const hasGraph = activeData?.nodes?.length > 0 && activeData?.edges?.length > 0;

  // Fallback static graph
  const fallbackNodes = useMemo(() => [
    { id: 'src', label: 'SRC_ORDERS', type: 'table', column: 0, row: 0 },
    { id: 'proc', label: 'Load_FACT_ORDERS', type: 'process', column: 1, row: 0 },
    { id: 'fact', label: 'FACT_ORDERS', type: 'table', column: 2, row: 0 },
  ], []);

  const fallbackEdges = useMemo(() => [
    { from: 'src', to: 'proc' },
    { from: 'proc', to: 'fact' },
  ], []);

  // Build SQL snippets based on source
  const { upstreamSql, downstreamSql, snowflakeSql } = useMemo(() => {
    const snowflake = tableFqn ? buildSnowflakeLineageQuery(tableFqn) : '-- Select a table to see lineage query';

    if (!tableGuid || !database || !schema) {
      return {
        upstreamSql: '-- Connect to Snowflake and select a table to see lineage SQL.',
        downstreamSql: '-- Connect to Snowflake and select a table to see lineage SQL.',
        snowflakeSql: snowflake,
      };
    }

    const procFQN = `${database}.${schema}.PROCESS_ENTITY`;

    const upstream = `-- MDLH: Upstream sources for ${tableName}
SELECT DISTINCT
    p.name AS process_name,
    p.typename AS process_type,
    p.inputs AS source_assets,
    p.outputs AS target_assets
FROM ${procFQN} p,
LATERAL FLATTEN(input => p.outputs) f
WHERE f.value::STRING = '${tableGuid}'
LIMIT 10;`;

    const downstream = `-- MDLH: Downstream targets for ${tableName}
SELECT DISTINCT
    p.name AS process_name,
    p.typename AS process_type,
    p.inputs AS source_assets,
    p.outputs AS target_assets
FROM ${procFQN} p,
LATERAL FLATTEN(input => p.inputs) f
WHERE f.value::STRING = '${tableGuid}'
LIMIT 10;`;

    return { upstreamSql: upstream, downstreamSql: downstream, snowflakeSql: snowflake };
  }, [tableGuid, tableName, database, schema, tableFqn]);

  return (
    <section className="p-4 space-y-4" aria-label="Lineage">
      {/* Header with source toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tableName ? (
            <span className="text-sm font-medium text-slate-800 font-mono">
              {tableName}
            </span>
          ) : (
            <span className="text-sm text-slate-500">No table selected</span>
          )}
          {isConnected && (
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded border border-emerald-200">
              Live
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Source toggle */}
          {isConnected && onSourceChange && (
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-[10px]">
              <button
                onClick={() => onSourceChange('mdlh')}
                className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                  lineageSource === 'mdlh'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Catalog lineage from MDLH PROCESS_ENTITY"
              >
                <Database size={10} />
                <span>Catalog</span>
              </button>
              <button
                onClick={() => onSourceChange('snowflake')}
                className={`flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                  lineageSource === 'snowflake'
                    ? 'bg-white text-cyan-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                title="Runtime lineage from Snowflake ACCESS_HISTORY (last 30 days)"
              >
                <Snowflake size={10} />
                <span>Runtime</span>
              </button>
            </div>
          )}

          {isConnected && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={activeLoading}
              className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {activeLoading ? (
                <span className="flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                </span>
              ) : (
                'Refresh'
              )}
            </button>
          )}
        </div>
      </div>

      {/* Source description */}
      {isConnected && (
        <p className="text-[10px] text-gray-500">
          {lineageSource === 'mdlh' ? (
            <>Showing <strong>catalog lineage</strong> from MDLH (designed data flows)</>
          ) : (
            <>Showing <strong>runtime lineage</strong> from ACCESS_HISTORY (actual queries, last 30 days)</>
          )}
        </p>
      )}

      {/* Error */}
      {activeError && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{activeError}</span>
        </div>
      )}

      {/* Graph - Main focus */}
      {activeLoading && !hasGraph ? (
        <LineageSkeleton />
      ) : (
        <LineageRail
          nodes={hasGraph ? activeData.nodes : fallbackNodes}
          edges={hasGraph ? activeData.edges : fallbackEdges}
          title={lineageSource === 'snowflake' && tableFqn ? tableFqn : (tableName ? `${tableName}` : 'Example lineage')}
          metadata={activeData?.metadata}
          rawProcesses={activeData?.rawProcesses}
          onNodeClick={onNodeClick}
        />
      )}

      {/* Collapsible SQL Section */}
      {(tableGuid || tableFqn) && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowSql(!showSql)}
            className="w-full px-3 py-2 flex items-center gap-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors bg-gray-50/50"
          >
            {showSql ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Code2 size={12} />
            <span className="font-medium">View SQL</span>
          </button>

          {showSql && (
            <div className="p-3 border-t border-gray-100">
              {lineageSource === 'snowflake' ? (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-500">
                    Snowflake ACCESS_HISTORY query (requires ACCOUNTADMIN or GOVERNANCE_VIEWER role)
                  </p>
                  <pre className="text-[10px] font-mono bg-gray-50 p-3 rounded overflow-x-auto text-gray-700 whitespace-pre-wrap">
                    {snowflakeSql}
                  </pre>
                </div>
              ) : (
                <TabbedCodeCard
                  languages={[{ id: 'sql', label: 'SQL' }]}
                  variants={[
                    { id: 'upstream', label: 'Upstream' },
                    { id: 'downstream', label: 'Downstream' },
                  ]}
                  snippets={[
                    { language: 'sql', variantId: 'upstream', code: upstreamSql },
                    { language: 'sql', variantId: 'downstream', code: downstreamSql },
                  ]}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default LineagePanel;
