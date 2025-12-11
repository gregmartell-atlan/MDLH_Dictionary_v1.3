/**
 * FlyoutQueryEditor - DuckDB-style embedded SQL editor
 * 
 * Clean, minimal design with:
 * - White code background
 * - Simple line numbers
 * - Minimal chrome buttons
 * - Clean results table
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Play, X, Loader2, Check, AlertCircle, ChevronDown, ChevronRight,
  Copy, Database, Clock, RotateCcw, Maximize2, WifiOff, Snowflake, Trash2,
  Sparkles, Zap, GitBranch, ArrowRight
} from 'lucide-react';
import { useQuery, useConnection, useMetadata } from '../hooks/useSnowflake';
import { createLogger } from '../utils/logger';
import { 
  getSuggestionsFromError, 
  buildSchemaCache,
  getProactiveSuggestions 
} from '../utils/querySuggestions';
import { analyzeQueryError, parseSnowflakeError } from '../utils/snowflakeErrorAnalyzer';
import {
  normalizeRows,
  extractColumnNames,
  getRowCount,
  getColumnCount,
  isEmptyResult,
  hasNoResult
} from '../utils/queryResultAdapter';
import { SuggestionList, QuickFixChip } from './SuggestionChips';
import { QueryFlowMenu, QuickFlowButtons } from './QueryFlowMenu';
import { buildEntityContext } from '../queryFlows';
import ResultFlowSuggestions from './ResultFlowSuggestions';
import StepWizard from './StepWizard';
import PlaceholderSuggestions from './PlaceholderSuggestions';

const log = createLogger('FlyoutQueryEditor');

// Parse SQL errors into friendly messages
function parseSqlError(error) {
  const errorStr = String(error);
  const lineMatch = errorStr.match(/line\s+(\d+)/i);
  const line = lineMatch ? parseInt(lineMatch[1], 10) : null;
  
  let missingTable = null;
  const objectPatterns = [
    /Object\s+'([^']+)'\s+does not exist/i,
    /Table\s+'([^']+)'\s+does not exist/i,
    /relation\s+"([^"]+)"\s+does not exist/i,
  ];
  
  for (const pattern of objectPatterns) {
    const match = errorStr.match(pattern);
    if (match) {
      missingTable = match[1];
      break;
    }
  }
  
  let errorType = 'generic';
  let suggestion = null;
  
  if (missingTable) {
    errorType = 'missing_table';
    suggestion = `Table "${missingTable}" doesn't exist.`;
  }
  
  const shortError = errorStr.length > 200 ? errorStr.substring(0, 200) + '...' : errorStr;
  
  return { line, suggestion, shortError, fullError: errorStr, missingTable, errorType };
}

/**
 * CompactResultsTable - DuckDB-style results display
 * White background, clean borders, minimal styling
 * Enhanced with intelligent error analysis and "Run this instead?" actions
 */
function CompactResultsTable({ results, loading, error, suggestions = [], onApplySuggestion, onRunQuery }) {
  const normalizedRows = useMemo(
    () => results ? normalizeRows(results) : [],
    [results]
  );
  
  const columnNames = useMemo(
    () => results ? extractColumnNames(results) : [],
    [results]
  );
  
  const rowCount = getRowCount(results);
  const columnCount = getColumnCount(results);
  
  // Loading State
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <Loader2 size={20} className="animate-spin mr-3" />
        <span className="text-sm">Executing...</span>
      </div>
    );
  }

  // Error State - Enhanced with better recommendations
  if (error) {
    const parsed = parseSnowflakeError(error);
    const { errorCode, category, title, shortMessage, details } = parsed;
    
    // Determine error icon and color based on category
    const getErrorStyle = () => {
      switch (category) {
        case 'syntax':
          return { icon: 'code', color: 'amber', label: 'Syntax Error' };
        case 'data_availability':
          return { icon: 'database', color: 'blue', label: 'Data Not Found' };
        case 'access':
          return { icon: 'lock', color: 'red', label: 'Access Denied' };
        default:
          return { icon: 'alert', color: 'red', label: 'Query Error' };
      }
    };
    
    const errorStyle = getErrorStyle();
    
    // Separate actionable suggestions from guidance
    const actionableFixes = suggestions.filter(s => s.fix && s.canRun !== false);
    const guidanceTips = suggestions.filter(s => s.isGuidance || s.type === 'info');
    const topRecommendation = actionableFixes[0];
    
    return (
      <div className="space-y-3">
        {/* Main Error Card */}
        <div className={`p-4 bg-white border rounded-xl ${
          category === 'syntax' ? 'border-amber-200' : 
          category === 'data_availability' ? 'border-blue-200' : 
          'border-red-200'
        }`}>
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className={`mt-0.5 shrink-0 ${
              category === 'syntax' ? 'text-amber-500' : 
              category === 'data_availability' ? 'text-blue-500' : 
              'text-red-500'
            }`} />
            <div className="flex-1 min-w-0">
              {/* Error Header */}
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-gray-900 text-sm">{title}</p>
                {errorCode && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">
                    {errorCode}
                  </span>
                )}
              </div>
              
              {/* Error Category Badge */}
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full mb-2 ${
                category === 'syntax' ? 'bg-amber-50 text-amber-700' : 
                category === 'data_availability' ? 'bg-blue-50 text-blue-700' : 
                'bg-red-50 text-red-700'
              }`}>
                {errorStyle.label}
              </span>
              
              {/* Specific Issue */}
              {details.functionName && (
                <p className="text-sm text-gray-600 mt-1">
                  <span className="font-medium">{details.functionName}</span> received invalid type: <code className="bg-gray-100 px-1 rounded">{details.invalidType}</code>
                </p>
              )}
              {details.missingObject && (
                <p className="text-sm text-gray-600 mt-1">
                  Object <code className="bg-gray-100 px-1 rounded">{details.missingObject}</code> does not exist
                </p>
              )}
              
              {/* Collapsible Full Error */}
              <details className="mt-2">
                <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                  Show full error
                </summary>
                <pre className="text-xs text-gray-500 mt-2 font-mono bg-gray-50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {shortMessage}
                </pre>
              </details>
            </div>
          </div>
        </div>
        
        {/* Top Recommendation - "Run this instead?" */}
        {topRecommendation && (
          <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Zap size={14} className="text-emerald-600" />
                  <p className="font-medium text-emerald-900 text-sm">Recommended Fix</p>
                  {topRecommendation.badge && (
                    <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">
                      {topRecommendation.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-emerald-700">{topRecommendation.description}</p>
                {topRecommendation.preview && (
                  <pre className="text-xs font-mono bg-white/60 p-2 rounded mt-2 overflow-x-auto text-gray-700 border border-emerald-100">
                    {topRecommendation.preview.substring(0, 150)}{topRecommendation.preview.length > 150 ? '...' : ''}
                  </pre>
                )}
              </div>
              <button
                onClick={() => {
                  onApplySuggestion(topRecommendation);
                  // Auto-run if onRunQuery is available
                  if (onRunQuery && topRecommendation.fix) {
                    setTimeout(() => onRunQuery(topRecommendation.fix), 100);
                  }
                }}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
              >
                <Play size={14} />
                Run this instead
              </button>
            </div>
          </div>
        )}
        
        {/* Other Actionable Suggestions */}
        {actionableFixes.length > 1 && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-500 mb-2">Other alternatives:</p>
            <div className="flex flex-wrap gap-2">
              {actionableFixes.slice(1, 4).map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => onApplySuggestion(s)}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg text-gray-700 transition-colors"
                >
                  {s.hasData === false && <span className="text-amber-500">⚠</span>}
                  {s.title}
                  {s.rowCount !== null && s.rowCount > 0 && (
                    <span className="text-gray-400">({s.rowCount.toLocaleString()})</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Guidance Tips */}
        {guidanceTips.length > 0 && (
          <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg">
            <p className="text-xs font-medium text-blue-700 mb-1 flex items-center gap-1">
              <GitBranch size={12} />
              Snowflake Guidance
            </p>
            {guidanceTips.map((tip, idx) => (
              <div key={idx} className="text-xs text-blue-600 mt-1">
                {tip.description || tip.recommendation}
                {tip.helpText && (
                  <pre className="mt-1 p-2 bg-white/60 rounded text-gray-600 font-mono overflow-x-auto">
                    {tip.helpText}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // No Results Yet
  if (hasNoResult(results)) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Database size={24} className="mb-2 opacity-50" />
        <p className="text-sm">Run query to see results</p>
        <p className="text-xs mt-1 text-gray-300">⌘+Enter</p>
      </div>
    );
  }

  // Empty Results
  if (isEmptyResult(results)) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        <p className="font-medium">No rows returned</p>
        <p className="text-xs text-gray-400 mt-1">Query succeeded but returned 0 rows</p>
      </div>
    );
  }

  // Data Table - DuckDB style
  const { executionTime } = results;
  const displayColumns = columnNames.slice(0, 8);
  const hasMoreColumns = columnNames.length > 8;

  return (
    <div>
      {/* Results header - minimal */}
      <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Check size={12} className="text-emerald-500" />
            <span className="font-medium text-gray-700">{rowCount.toLocaleString()}</span> rows
          </span>
          {executionTime && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {(executionTime / 1000).toFixed(2)}s
            </span>
          )}
        </div>
        <span>{columnCount} columns</span>
      </div>

      {/* Results table - clean white */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
        <table className="w-full text-[13px]">
          <thead className="bg-gray-50">
            <tr>
              {displayColumns.map((col, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap">
                  {col}
                </th>
              ))}
              {hasMoreColumns && (
                <th className="px-3 py-2 text-left text-gray-400 border-b border-gray-200">
                  +{columnNames.length - 8}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {normalizedRows.slice(0, 50).map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-gray-50 border-b border-gray-100 last:border-0">
                {displayColumns.map((colName, colIdx) => {
                  const value = row[colName];
                  return (
                    <td key={colIdx} className="px-3 py-2 max-w-[200px] truncate">
                      {value !== null && value !== undefined 
                        ? String(value).substring(0, 100)
                        : <span className="text-gray-300 italic">null</span>
                      }
                    </td>
                  );
                })}
                {hasMoreColumns && (
                  <td className="px-3 py-2 text-gray-300">...</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {normalizedRows.length > 50 && (
          <div className="px-3 py-2 bg-gray-50 text-xs text-gray-500 text-center border-t border-gray-200">
            Showing 50 of {normalizedRows.length}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * FlyoutQueryEditorHeader - DuckDB minimal header
 */
function FlyoutQueryEditorHeader({
  title,
  hasUnsavedChanges,
  onRun,
  running,
  database,
  schema,
  isConnected,
  onOpenFullEditor,
  onClearResults,
  hasResults,
  sql
}) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3 flex-shrink-0">
      {/* Row 1: Title + Run */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate">{title}</h3>
          {hasUnsavedChanges && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Modified" />
          )}
        </div>
        <button
          onClick={onRun}
          disabled={running || !isConnected}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          <span>{running ? 'Running...' : 'Run'}</span>
        </button>
      </div>

      {/* Row 2: Context + Actions */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="font-mono">{database}.{schema}</span>
            </>
          ) : (
            <>
              <WifiOff size={12} className="text-gray-400" />
              <span>Not connected</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleCopy} className={`transition-colors ${copied ? 'text-emerald-600' : 'hover:text-gray-700'}`}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {hasResults && onClearResults && (
            <button onClick={onClearResults} className="hover:text-gray-700 transition-colors">
              Clear
            </button>
          )}
          {onOpenFullEditor && (
            <button onClick={onOpenFullEditor} className="hover:text-gray-700 transition-colors flex items-center gap-1">
              Full editor
              <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Main FlyoutQueryEditor Component - DuckDB style
 */
export default function FlyoutQueryEditor({ 
  initialQuery = '', 
  title = 'Test Query',
  onClose,
  onOpenFullEditor,
  database,
  schema,
  hideHeader = false,
  onSqlChange = null,
  availableTables = [],
  tableColumns = {},
  entityContext = null,
  showFlowControls = true,
}) {
  const editorRef = useRef(null);
  const [sql, setSql] = useState(initialQuery);
  const [isExpanded, setIsExpanded] = useState(true);
  const [suggestions, setSuggestions] = useState([]);
  const [wizardMode, setWizardMode] = useState(null);
  
  const { status: connStatus } = useConnection();
  const { executeQuery, results, loading, error, clearResults } = useQuery();
  const { fetchTables, fetchColumns } = useMetadata();
  
  const [localTables, setLocalTables] = useState([]);
  const [localColumns, setLocalColumns] = useState({});
  
  // Fetch tables if not provided
  useEffect(() => {
    if (availableTables.length === 0 && connStatus?.connected) {
      const db = database || connStatus?.database;
      const sch = schema || connStatus?.schema;
      if (db && sch) {
        fetchTables(db, sch).then(tables => {
          if (Array.isArray(tables)) {
            setLocalTables(tables.map(t => typeof t === 'string' ? t : t.name));
          }
        });
      }
    }
  }, [availableTables, connStatus, database, schema, fetchTables]);
  
  // Build schema cache
  const schemaCache = useMemo(() => {
    const allTables = availableTables.length > 0 ? availableTables : localTables;
    const allColumns = Object.keys(tableColumns).length > 0 ? tableColumns : localColumns;
    return buildSchemaCache(allTables, allColumns);
  }, [availableTables, localTables, tableColumns, localColumns]);
  
  // Generate suggestions on error - enhanced with Snowflake error analyzer
  useEffect(() => {
    if (error) {
      // Get basic suggestions (may be empty if schema cache not loaded)
      const basicSuggestions = schemaCache.tables.length > 0 
        ? getSuggestionsFromError(sql, error, schemaCache) 
        : [];
      
      // Enhance with Snowflake-specific analysis - works even without schema
      analyzeQueryError(sql, error, schemaCache, executeQuery)
        .then(analysis => {
          // Merge recommendations, prioritizing analyzer results
          const analyzerRecs = analysis.recommendations || [];
          const merged = [...analyzerRecs];
          
          // Add basic suggestions that aren't duplicates
          for (const basic of basicSuggestions) {
            if (!merged.some(m => m.title === basic.title || m.fix === basic.fix)) {
              merged.push(basic);
            }
          }
          
          setSuggestions(merged);
          log.info('Generated error suggestions', { 
            errorType: analysis.errorType,
            suggestionCount: merged.length 
          });
        })
        .catch(e => {
          // Fall back to basic suggestions
          log.debug('Analyzer failed, using basic suggestions', { error: e.message });
          setSuggestions(basicSuggestions);
        });
    } else {
      setSuggestions([]);
    }
  }, [error, sql, schemaCache, executeQuery]);
  
  const handleApplySuggestion = useCallback((suggestion) => {
    if (suggestion.type === 'rewrite' || suggestion.type === 'syntax') {
      setSql(suggestion.fix);
    } else if (suggestion.type === 'table') {
      const newSql = sql.replace(
        new RegExp(`\\b${suggestion.title.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi'),
        suggestion.fix
      );
      setSql(newSql === sql ? suggestion.fix : newSql);
    }
    clearResults();
  }, [sql, clearResults]);
  
  useEffect(() => {
    if (initialQuery) {
      setSql(initialQuery);
      clearResults();
    }
  }, [initialQuery, clearResults]);
  
  useEffect(() => {
    if (onSqlChange) {
      onSqlChange(sql, initialQuery);
    }
  }, [sql, initialQuery, onSqlChange]);

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    setTimeout(() => editor.focus(), 100);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleExecute();
    });
  };

  const handleExecute = useCallback(async () => {
    const queryText = sql.trim();
    if (!queryText) return;
    
    await executeQuery(queryText, {
      database: database || connStatus?.database,
      schema: schema || connStatus?.schema,
      warehouse: connStatus?.warehouse
    });
  }, [sql, database, schema, connStatus, executeQuery]);

  const handleReset = useCallback(() => {
    setSql(initialQuery);
    clearResults();
  }, [initialQuery, clearResults]);
  
  const handleClearResults = useCallback(() => {
    clearResults();
  }, [clearResults]);
  
  const handleOpenFullEditor = useCallback(() => {
    if (onOpenFullEditor) {
      onOpenFullEditor(sql);
    }
  }, [onOpenFullEditor, sql]);

  const isConnected = connStatus?.connected;
  const hasUnsavedChanges = sql !== initialQuery;

  const effectiveEntityContext = useMemo(() => {
    if (entityContext) return entityContext;
    return {
      type: 'UNKNOWN',
      database: database || connStatus?.database,
      schema: schema || connStatus?.schema,
    };
  }, [entityContext, database, schema, connStatus]);

  const handleFlowSelect = useCallback((builtQuery) => {
    setSql(builtQuery.sql);
    clearResults();
  }, [clearResults]);

  const handleOpenWizard = useCallback((flowId, entity) => {
    setWizardMode({ flowId, entity: entity || effectiveEntityContext });
    clearResults();
  }, [effectiveEntityContext, clearResults]);

  const handleWizardComplete = useCallback(({ sql: finalSql }) => {
    setSql(finalSql);
    setWizardMode(null);
  }, []);

  const handleWizardUseSql = useCallback((wizardSql) => {
    setSql(wizardSql);
    setWizardMode(null);
  }, []);

  return (
    <div className="flex flex-col h-full bg-white" role="region" aria-label="SQL Query Editor">
      {/* Header */}
      {!hideHeader && (
        <FlyoutQueryEditorHeader
          title={title}
          hasUnsavedChanges={hasUnsavedChanges}
          onRun={handleExecute}
          running={loading}
          database={database || connStatus?.database}
          schema={schema || connStatus?.schema}
          isConnected={isConnected}
          onOpenFullEditor={handleOpenFullEditor}
          onClearResults={handleClearResults}
          hasResults={!!results}
          sql={sql}
        />
      )}

      {/* Not connected warning - minimal */}
      {!isConnected && !wizardMode && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 flex items-center gap-2">
          <WifiOff size={12} />
          Connect to Snowflake to run queries
        </div>
      )}

      {/* Wizard Mode */}
      {wizardMode && (
        <div className="flex-1 overflow-hidden">
          <StepWizard
            flowId={wizardMode.flowId}
            entity={wizardMode.entity}
            availableTables={schemaCache.tables || []}
            database={database || connStatus?.database}
            schema={schema || connStatus?.schema}
            onComplete={handleWizardComplete}
            onCancel={() => setWizardMode(null)}
            onUseSql={handleWizardUseSql}
          />
        </div>
      )}

      {/* Main Content */}
      {!wizardMode && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* SQL Editor - TabbedCodeCard style */}
          <div className="border-b border-gray-200">
            {/* Pill tabs header with Query Flows */}
            <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
              {/* Left: Language tabs */}
              <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
                <button
                  className="px-4 py-1.5 text-sm font-medium rounded-full bg-gray-900 text-white"
                >
                  SQL
                </button>
                <button
                  className="px-4 py-1.5 text-sm font-medium rounded-full text-gray-600 hover:text-gray-900"
                  title="Python client coming soon"
                >
                  Python
                </button>
              </div>
              
              {/* Center: Query Flows - prominently placed */}
              {showFlowControls && effectiveEntityContext && isConnected && (
                <QueryFlowMenu
                  entity={effectiveEntityContext}
                  availableTables={schemaCache.tables}
                  onSelectFlow={handleFlowSelect}
                  onOpenWizard={handleOpenWizard}
                  disabled={!isConnected}
                  buttonClassName="text-xs px-3 py-1.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-full shadow-sm"
                />
              )}
              
              {/* Right: Status */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                {hasUnsavedChanges && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Modified
                  </span>
                )}
                <span>{sql.split('\n').length} lines</span>
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>
            </div>
            
            {/* Editor area */}
            {isExpanded && (
              <div className="h-[180px] flex flex-col">
                <PlaceholderSuggestions
                  sql={sql}
                  database={database || connStatus?.database}
                  schema={schema || connStatus?.schema}
                  availableTables={new Set(schemaCache.tables || [])}
                  executeQuery={async (querySql) => {
                    try {
                      return await executeQuery(querySql);
                    } catch {
                      return { rows: [] };
                    }
                  }}
                  onSqlChange={(newSql) => setSql(newSql)}
                />
                
                <div className="flex-1 border-t border-gray-100">
                  <Editor
                    height="100%"
                    defaultLanguage="sql"
                    value={sql}
                    onChange={(value) => setSql(value || '')}
                    onMount={handleEditorMount}
                    theme="vs"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      automaticLayout: true,
                      tabSize: 2,
                      padding: { top: 8 },
                      lineNumbersMinChars: 3,
                      folding: false,
                      renderLineHighlight: 'none',
                      lineDecorationsWidth: 0,
                      scrollbar: {
                        vertical: 'auto',
                        horizontal: 'auto',
                        verticalScrollbarSize: 8,
                        horizontalScrollbarSize: 8,
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="flex-1 overflow-auto p-4">
            <CompactResultsTable 
              results={results} 
              loading={loading} 
              error={error}
              suggestions={suggestions}
              onApplySuggestion={handleApplySuggestion}
              onRunQuery={(querySql) => executeQuery(querySql, {
                database: database || connStatus?.database,
                schema: schema || connStatus?.schema,
                warehouse: connStatus?.warehouse
              })}
            />
            
            {results?.rows?.length > 0 && !loading && !error && (
              <ResultFlowSuggestions
                results={results}
                availableTables={schemaCache.tables}
                onSelectFlow={handleFlowSelect}
              />
            )}
          </div>
        </div>
      )}

      {/* Quick Flow Buttons - context-specific actions */}
      {!wizardMode && showFlowControls && effectiveEntityContext?.type !== 'UNKNOWN' && isConnected && (
        <div className="flex-shrink-0 px-4 py-2 border-t border-gray-100 bg-gray-50/50">
          <QuickFlowButtons
            entity={effectiveEntityContext}
            availableTables={schemaCache.tables}
            onSelectFlow={handleFlowSelect}
          />
        </div>
      )}

      {/* Footer - TabbedCodeCard style with dropdown and actions */}
      {!wizardMode && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-white">
          {/* Left: Run dropdown */}
          <button
            onClick={handleExecute}
            disabled={loading || !sql.trim() || !isConnected}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-full hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            <span>{loading ? 'Running...' : 'Run query'}</span>
            <ChevronDown size={14} className="text-gray-400" />
          </button>
          
          {/* Right: Actions */}
          <div className="flex items-center gap-4">
            {hasUnsavedChanges && (
              <button onClick={handleReset} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Reset
              </button>
            )}
            {onOpenFullEditor && (
              <button
                onClick={handleOpenFullEditor}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1"
              >
                Full Editor
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
