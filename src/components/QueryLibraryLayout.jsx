/**
 * QueryLibraryLayout - Layout component for the Query Library mode in the flyout panel
 * 
 * Provides:
 * - Top header: "Query Library – {categoryLabel}" with close button
 * - Secondary context bar: database/schema info + optional filters
 * - Query cards list below
 */

import React, { useRef, useEffect, useMemo } from 'react';
import { 
  X, Code2, Check, Loader2, Snowflake, Play, Eye, FlaskConical, 
  Sparkles, Copy, Database, AlertTriangle, TrendingUp, MessageCircle, Info
} from 'lucide-react';
import { FREQUENCY_STYLES } from '../data/queryTemplates';
import { validateQueryTables, getSuggestedAlternatives } from '../utils/dynamicExampleQueries';
import { getTableFriendlyName, categorizeMissingTables } from '../utils/queryAvailability';

// ============================================================================
// QueryCard Component
// ============================================================================

// Frequency Badge Component
function FrequencyBadge({ frequency, detail }) {
  if (!frequency) return null;
  
  const styles = FREQUENCY_STYLES[frequency] || FREQUENCY_STYLES['Medium'];
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full ${styles.bg} ${styles.text} border ${styles.border}`}
      title={detail ? `Frequency: ${frequency} (${detail})` : `Frequency: ${frequency}`}
    >
      <TrendingUp size={10} />
      {frequency}
    </span>
  );
}

// Warning Banner Component
function WarningBanner({ warning }) {
  if (!warning) return null;
  
  return (
    <div className="flex items-start gap-2 p-3 mb-3 bg-gray-50 border border-gray-200 rounded-lg">
      <AlertTriangle size={16} className="text-gray-600 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-gray-700">
        <span className="font-medium">⚠️ Warning: </span>
        {warning}
      </div>
    </div>
  );
}

// User Intent Display
function UserIntentDisplay({ userIntent }) {
  if (!userIntent) return null;
  
  return (
    <div className="flex items-start gap-2 mb-3 p-2 bg-blue-50 border border-blue-100 rounded-lg">
      <MessageCircle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
      <div className="text-xs text-blue-700">
        <span className="font-medium">Users ask: </span>
        <span className="italic">"{userIntent}"</span>
      </div>
    </div>
  );
}

function QueryCard({ 
  title, 
  description, 
  query, 
  defaultExpanded = false, 
  onRunInEditor, 
  validated = null, 
  tableAvailable = null, 
  autoFixed = false,
  validationResult = null,
  onShowMyWork = null,
  onTestQuery = null,
  // New props for user research queries
  userIntent = null,
  frequency = null,
  frequencyDetail = null,
  source = null,
  warning = null,
  confidence = null
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [copied, setCopied] = React.useState(false);
  
  // Determine status for visual feedback
  const isValidated = validated === true || tableAvailable === true || validationResult?.status === 'success';
  const isUnavailable = tableAvailable === false || validationResult?.status === 'error';
  const isEmpty = validationResult?.status === 'empty';
  const isAutoFixed = autoFixed;
  const hasSuggestion = validationResult?.suggested_query;
  const rowCount = validationResult?.row_count;
  const sampleData = validationResult?.sample_data;
  
  const handleCopy = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // Get status label for badges - DuckDB style: subtle, clean
  const getStatusLabel = () => {
    if (isValidated && !isAutoFixed) return { 
      text: rowCount ? `${rowCount.toLocaleString()} rows` : 'Valid', 
      color: 'bg-emerald-100 text-emerald-700',
      tooltip: 'Query validated successfully and will return results.'
    };
    if (isAutoFixed) return { 
      text: 'Auto-fixed', 
      color: 'bg-blue-100 text-blue-700', 
      tooltip: 'We updated this query to point to a discovered MDLH table.'
    };
    if (isEmpty) return { 
      text: 'Empty', 
      color: 'bg-gray-100 text-gray-600',
      tooltip: 'The table exists but contains no rows.'
    };
    if (isUnavailable) return { 
      text: 'Needs fix', 
      color: 'bg-slate-100 text-slate-600',
      tooltip: 'Table not found in this database/schema. Click "Explain" for alternatives.'
    };
    return null;
  };
  
  const statusLabel = getStatusLabel();
  
  // DuckDB-style card: minimal chrome, clean borders
  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-all duration-150 ${
      expanded ? 'border-gray-300' : 'border-gray-200 hover:border-gray-300'
    }`}>
      {/* Card Header - DuckDB minimal style */}
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 text-sm truncate">{title}</h4>
            {/* Simple status indicator - just a dot */}
            {isValidated && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="Valid" />
            )}
            {(isUnavailable || isEmpty) && (
              <span className="w-2 h-2 rounded-full bg-gray-300" title="Needs attention" />
            )}
            {/* Frequency - subtle text only */}
            {frequency && (
              <span className="text-[11px] text-gray-400">
                {frequency}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-0.5 truncate">{description}</p>
        </div>
        
        {/* Actions - DuckDB minimal: text links + one primary button */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {/* Text actions */}
          <div className="hidden sm:flex items-center gap-3 text-xs">
            {onShowMyWork && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShowMyWork(query, validationResult);
                }}
                className="text-gray-500 hover:text-gray-900 transition-colors"
              >
                Explain
              </button>
            )}
            {onTestQuery && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const queryToTest = hasSuggestion && (isUnavailable || isEmpty) 
                    ? validationResult.suggested_query 
                    : query;
                  onTestQuery(queryToTest, title);
                }}
                className="text-gray-500 hover:text-gray-900 transition-colors"
              >
                Test
              </button>
            )}
            <button
              onClick={handleCopy}
              className={`transition-colors ${copied ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-900'}`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          
          {/* Primary action - Run button */}
          {onRunInEditor && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (hasSuggestion && (isUnavailable || isEmpty)) {
                  onRunInEditor(validationResult.suggested_query);
                } else {
                  onRunInEditor(query);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-gray-900 hover:bg-gray-800 text-white transition-colors"
            >
              <Play size={12} />
              <span>Run</span>
            </button>
          )}
          
          {/* Expand indicator */}
          <div className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}>
            ▶
          </div>
        </div>
      </div>
      
      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          {/* Warning Banner for queries with warnings */}
          <WarningBanner warning={warning} />
          
          {/* User Intent Display */}
          <UserIntentDisplay userIntent={userIntent} />
          
          {/* Sample data preview if available */}
          {isValidated && sampleData && sampleData.length > 0 && (
            <div className="mb-4">
              <h5 className="text-xs font-medium text-gray-600 mb-2">
                Sample Results ({rowCount?.toLocaleString()} total rows)
              </h5>
              <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                <table className="w-full text-[10px]">
                  <thead className="bg-gray-100">
                    <tr>
                      {Object.keys(sampleData[0]).slice(0, 6).map((col, i) => (
                        <th key={i} className="px-2 py-1 text-left font-medium text-gray-600 border-b">
                          {col}
                        </th>
                      ))}
                      {Object.keys(sampleData[0]).length > 6 && (
                        <th className="px-2 py-1 text-left text-gray-400 border-b">...</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleData.slice(0, 3).map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-blue-50">
                        {Object.values(row).slice(0, 6).map((val, colIdx) => (
                          <td key={colIdx} className="px-2 py-1 border-b border-gray-100 max-w-[150px] truncate">
                            {val !== null && val !== undefined ? String(val) : <span className="text-gray-300">null</span>}
                          </td>
                        ))}
                        {Object.keys(row).length > 6 && (
                          <td className="px-2 py-1 text-gray-300 border-b border-gray-100">...</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Suggested query if original fails */}
          {hasSuggestion && (isUnavailable || isEmpty) && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-blue-500" />
                <span className="text-xs font-medium text-blue-700">
                  Suggested alternative ({validationResult.suggested_query_result?.row_count?.toLocaleString() || '?'} rows):
                </span>
              </div>
              <pre className="text-[10px] text-blue-800 font-mono bg-white p-2 rounded overflow-x-auto">
                {validationResult.suggested_query}
              </pre>
            </div>
          )}
          
          {/* Original query */}
          <div>
            <h5 className="text-xs font-medium text-gray-600 mb-2">SQL Query</h5>
            <pre className="text-xs text-gray-800 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed p-4 bg-white rounded-lg border border-gray-200">
              {query}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// QueryLibraryLayout Component
// ============================================================================

export default function QueryLibraryLayout({
  categoryLabel,
  onClose,
  queries,
  highlightedQuery,
  onRunInEditor,
  isLoading,
  discoveredTables = new Set(),
  isConnected = false,
  batchValidationResults = new Map(),
  onShowMyWork = null,
  isBatchValidating = false,
  selectedDatabase = '',
  selectedSchema = '',
  queryValidationMap = new Map(),
  onValidateAll = null,
  onOpenConnectionModal = null,
  onTestQuery = null,
  extractTableFromQuery = null
}) {
  const highlightedRef = useRef(null);
  
  // Helper to check if ALL tables in a query are available
  // Uses the new comprehensive validation that checks all referenced tables
  const getQueryValidation = useMemo(() => {
    const cache = new Map();
    return (query) => {
      if (!isConnected || discoveredTables.size === 0) return { valid: null, missingTables: [] };
      if (!query) return { valid: null, missingTables: [] };
      
      // Use cached result if available
      if (cache.has(query)) return cache.get(query);
      
      // Validate all tables in the query
      const result = validateQueryTables(query, discoveredTables);
      cache.set(query, result);
      return result;
    };
  }, [isConnected, discoveredTables]);
  
  // Legacy helper for backwards compatibility
  const getTableAvailability = (query) => {
    const validation = getQueryValidation(query);
    return validation.valid;
  };
  
  // Frequency order for sorting (Very High → Low)
  const frequencyOrder = { 'Very High': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
  
  // Sort queries: by frequency first, then validated, then unavailable last
  const sortedQueries = useMemo(() => {
    return [...queries].sort((a, b) => {
      // First sort by frequency (if available)
      const aFreq = frequencyOrder[a.frequency] ?? 4;
      const bFreq = frequencyOrder[b.frequency] ?? 4;
      if (aFreq !== bFreq) return aFreq - bFreq;
      
      // Then by table availability (using full query validation)
      const aValidation = getQueryValidation(a.query || a.sql);
      const bValidation = getQueryValidation(b.query || b.sql);
      
      // Valid queries first, then unknown, then invalid
      if (aValidation.valid === true && bValidation.valid !== true) return -1;
      if (bValidation.valid === true && aValidation.valid !== true) return 1;
      if (aValidation.valid === false && bValidation.valid !== false) return 1;
      if (bValidation.valid === false && aValidation.valid !== false) return -1;
      return 0;
    });
  }, [queries, getQueryValidation]);

  // Scroll to highlighted query when panel opens
  useEffect(() => {
    if (highlightedQuery && highlightedRef.current) {
      setTimeout(() => {
        highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 350);
    }
  }, [highlightedQuery]);

  return (
    <>
      {/* Header - DuckDB style: clean, minimal */}
      <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Query Library
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {categoryLabel} • {queries.length} queries
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          title="Close (Esc)"
        >
          <X size={18} />
        </button>
      </header>

      {/* Context bar - DuckDB style */}
      <div className="px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between text-xs flex-shrink-0">
        <div className="flex items-center gap-2 text-slate-600">
          {isConnected ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>
                <span className="font-medium text-slate-700">{selectedDatabase || 'Default'}</span>
                <span className="text-slate-400 mx-1">.</span>
                <span className="font-mono text-slate-600">{selectedSchema || 'PUBLIC'}</span>
              </span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-300"></span>
              <span className="text-slate-500">Not connected</span>
            </>
          )}
        </div>
        
        {/* Validation stats - cleaner */}
        {isConnected && queryValidationMap.size > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-emerald-600">
              {[...queryValidationMap.values()].filter(v => v.valid === true).length} valid
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-500">
              {[...queryValidationMap.values()].filter(v => v.valid === false).length} need fix
            </span>
          </div>
        )}
      </div>

      {/* Query list - DuckDB style: clean white bg */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-white">
        {/* Connection status banner - subtle */}
        {isConnected && discoveredTables.size > 0 && (
          <div className="flex items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>
                <strong className="text-slate-700">{discoveredTables.size}</strong> tables in {selectedDatabase}.{selectedSchema}
              </span>
            </div>
            {onValidateAll && (
              <button
                onClick={onValidateAll}
                disabled={isBatchValidating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isBatchValidating ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Check size={12} />
                    Validate All
                  </>
                )}
              </button>
            )}
          </div>
        )}
        
        {!isConnected && (
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Snowflake size={14} className="text-slate-400" />
              <span>Connect to validate queries</span>
            </div>
            {onOpenConnectionModal && (
              <button
                onClick={onOpenConnectionModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors"
              >
                <Snowflake size={12} />
                Connect
              </button>
            )}
          </div>
        )}
        
        {/* Loading indicators - subtle */}
        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
            <Loader2 size={14} className="animate-spin text-slate-500" />
            <span className="text-sm text-slate-600">Fetching columns...</span>
          </div>
        )}
        
        {isBatchValidating && (
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 mb-4">
            <Loader2 size={14} className="animate-spin text-slate-500" />
            <span className="text-sm text-slate-600">Testing queries...</span>
          </div>
        )}
        
        {/* Highlighted inline query at top if not in main queries */}
        {highlightedQuery && !queries.some(q => q.query === highlightedQuery) && (
          <div ref={highlightedRef}>
            <div className="mb-4 pb-4 border-b border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">
                {highlightedQuery.includes('Connect to Snowflake') ? '⚠️ Not Connected' : '✨ Smart Query'}
              </p>
              <QueryCard 
                title="Entity Query" 
                description={highlightedQuery.includes('Connect to Snowflake') 
                  ? "Connect to Snowflake for intelligent column selection" 
                  : "Query generated with real column metadata"} 
                query={highlightedQuery}
                tableAvailable={getTableAvailability(highlightedQuery)} 
                defaultExpanded={true}
                onRunInEditor={onRunInEditor}
                onShowMyWork={onShowMyWork}
                onTestQuery={onTestQuery}
              />
            </div>
          </div>
        )}
        
        {/* Query cards */}
        {sortedQueries.length > 0 ? (
          <>
            {highlightedQuery && !queries.some(q => q.query === highlightedQuery) && (
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                More {categoryLabel} Queries
              </p>
            )}
            {sortedQueries.map((q, i) => {
              const isHighlighted = highlightedQuery && q.query === highlightedQuery;
              const queryValidation = getQueryValidation(q.query || q.sql);
              const tableAvailable = queryValidation.valid;
              const isAutoFixed = q.validation?.autoFixed;
              const batchResult = batchValidationResults.get(`core_${i}`);
              
              // Build enhanced description with missing tables info
              let enhancedDescription = q.description;
              let missingTablesInfo = null;
              if (queryValidation.missingTables && queryValidation.missingTables.length > 0) {
                const { category, message } = categorizeMissingTables(queryValidation.missingTables);
                const friendlyNames = queryValidation.missingTables.map(t => getTableFriendlyName(t));
                missingTablesInfo = { category, message, tables: queryValidation.missingTables, friendlyNames };
                enhancedDescription = `${q.description} • ${message}`;
              }
              
              return (
                <div key={q.queryId || q.id || i} ref={isHighlighted ? highlightedRef : null}>
                  <QueryCard 
                    title={isAutoFixed ? `${q.title || q.label} (Auto-Fixed)` : (q.title || q.label)}
                    description={isAutoFixed 
                      ? `${q.description} • Table changed: ${q.validation.changes.map(c => `${c.from} → ${c.to}`).join(', ')}`
                      : enhancedDescription
                    }
                    query={q.query || q.sql} 
                    defaultExpanded={isHighlighted}
                    onRunInEditor={onRunInEditor}
                    tableAvailable={tableAvailable}
                    validated={q.validation?.valid}
                    autoFixed={isAutoFixed}
                    validationResult={batchResult}
                    onShowMyWork={onShowMyWork}
                    onTestQuery={onTestQuery}
                    // New props for user research queries
                    userIntent={q.userIntent}
                    frequency={q.frequency}
                    frequencyDetail={q.frequencyDetail}
                    source={q.source}
                    warning={q.warning}
                    confidence={q.confidence}
                  />
                </div>
              );
            })}
          </>
        ) : !highlightedQuery ? (
          <div className="text-center py-16">
            <Code2 size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">No queries available</p>
            <p className="text-gray-400 text-sm mt-1">Queries for this category are coming soon</p>
          </div>
        ) : null}
      </div>
    </>
  );
}

