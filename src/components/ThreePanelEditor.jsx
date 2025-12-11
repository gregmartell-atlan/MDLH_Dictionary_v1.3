/**
 * Three Panel Query Editor
 *
 * 3-panel layout:
 * - Left: Schema browser (collapsible to icons)
 * - Center: Editor (dominant)
 * - Bottom: Results/Logs (tabbed, with peek bar)
 *
 * Design principles:
 * - Editor is visually dominant
 * - Fast animations (150-200ms)
 * - Keyboard-first (Cmd+Enter to run)
 * - Consistent iconography
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play, Square, ChevronDown, ChevronRight, ChevronUp,
  Database, Table2, Columns, Search, Clock, Check, X,
  Loader2, AlertTriangle, GripVertical, PanelLeft, PanelLeftClose,
  FileCode, Terminal, BarChart3, Info, Copy, ExternalLink,
  Layers, Sparkles, Hash, Settings, Keyboard
} from 'lucide-react';
import { buildSafeFQN } from '../utils/queryHelpers';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const tokens = {
  // Colors
  bg: {
    primary: '#ffffff',
    secondary: '#f8fafc',  // slate-50
    tertiary: '#f1f5f9',   // slate-100
    accent: '#7c3aed',     // violet-600
    accentLight: '#ede9fe', // violet-100
  },
  border: {
    light: '#e2e8f0',      // slate-200
    medium: '#cbd5e1',     // slate-300
  },
  text: {
    primary: '#1e293b',    // slate-800
    secondary: '#64748b',  // slate-500
    muted: '#94a3b8',      // slate-400
  },
  // Spacing
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  // Animation
  transition: {
    fast: '150ms ease',
    normal: '200ms ease',
  },
};

// =============================================================================
// ICON-ONLY SIDEBAR (collapsible)
// =============================================================================

function CollapsibleSidebar({ 
  isExpanded, 
  onToggle, 
  database, 
  schema, 
  tables = [],
  onSelectTable,
  onSearch 
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDbs, setExpandedDbs] = useState(new Set([database]));

  const filteredTables = useMemo(() => {
    if (!searchQuery) return tables;
    return tables.filter(t => 
      t.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tables, searchQuery]);

  // Collapsed state - just icons
  if (!isExpanded) {
    return (
      <div className="w-12 bg-slate-50 border-r border-slate-200 flex flex-col items-center py-3 gap-2">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
          title="Expand sidebar"
        >
          <PanelLeft size={18} />
        </button>
        <div className="w-8 h-px bg-slate-200 my-1" />
        <button
          className="p-2 rounded-lg hover:bg-slate-200 text-slate-500"
          title={`${database}.${schema}`}
        >
          <Database size={16} />
        </button>
        <button
          className="p-2 rounded-lg hover:bg-slate-200 text-slate-500"
          title={`${tables.length} tables`}
        >
          <Table2 size={16} />
        </button>
      </div>
    );
  }

  // Expanded state - full tree
  return (
    <div 
      className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col"
      style={{ transition: `width ${tokens.transition.fast}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Schema
        </span>
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-slate-200 text-slate-500"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter tables..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Database/Schema Context */}
      <div className="px-3 py-2 bg-slate-100/50 border-b border-slate-100">
        <div className="flex items-center gap-2 text-xs">
          <Database size={12} className="text-violet-500" />
          <span className="font-medium text-slate-700">{database}</span>
          <span className="text-slate-400">.</span>
          <span className="text-slate-600">{schema}</span>
        </div>
      </div>

      {/* Table List */}
      <div className="flex-1 overflow-auto py-1">
        {filteredTables.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-slate-400">
            {searchQuery ? 'No matching tables' : 'No tables found'}
          </div>
        ) : (
          filteredTables.map((table) => {
            const isEntity = table.endsWith('_ENTITY') || table.startsWith('ATLAS');
            return (
              <button
                key={table}
                onClick={() => onSelectTable(table)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-violet-50 transition-colors group"
              >
                <Table2 size={12} className={`flex-shrink-0 ${isEntity ? 'text-violet-500' : 'text-slate-400'}`} />
                <span className="text-xs text-slate-700 truncate flex-1 group-hover:text-violet-700">
                  {table}
                </span>
                {isEntity && (
                  <span className="px-1.5 py-0.5 text-[9px] font-medium bg-violet-100 text-violet-600 rounded">
                    ENTITY
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-slate-200 text-[10px] text-slate-500">
        {filteredTables.length} tables • Click to insert FQN
      </div>
    </div>
  );
}

// =============================================================================
// RESULTS PANEL with tabs and peek bar
// =============================================================================

function ResultsPanel({
  isExpanded,
  onToggle,
  queryResult,
  queryLoading,
  queryError,
  columns,
  rows,
  executionTime,
  onColumnSelect
}) {
  const [activeTab, setActiveTab] = useState('results');

  // Collapsed "peek" bar
  if (!isExpanded) {
    return (
      <button
        onClick={onToggle}
        className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 text-xs">
          {queryLoading ? (
            <>
              <Loader2 size={12} className="animate-spin text-blue-500" />
              <span className="text-slate-600">Running query...</span>
            </>
          ) : queryError ? (
            <>
              <X size={12} className="text-red-500" />
              <span className="text-red-600">Query failed</span>
            </>
          ) : rows?.length > 0 ? (
            <>
              <Check size={12} className="text-emerald-500" />
              <span className="text-slate-700 font-medium">
                {rows.length.toLocaleString()} rows
              </span>
              {executionTime && (
                <span className="text-slate-500">• {executionTime}</span>
              )}
            </>
          ) : (
            <span className="text-slate-500">Run a query to see results</span>
          )}
        </div>
        <ChevronUp size={14} className="text-slate-400" />
      </button>
    );
  }

  // Expanded panel with tabs
  return (
    <div className="flex flex-col border-t border-slate-200 bg-white" style={{ height: '40%', minHeight: '200px' }}>
      {/* Tab bar */}
      <div className="flex items-center justify-between px-2 py-1 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1">
          {[
            { id: 'results', label: 'Results', icon: Table2, count: rows?.length },
            { id: 'schema', label: 'Schema', icon: Columns, count: columns?.length },
            { id: 'logs', label: 'Logs', icon: Terminal },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <tab.icon size={12} />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  activeTab === tab.id ? 'bg-violet-100 text-violet-600' : 'bg-slate-200 text-slate-600'
                }`}>
                  {tab.count.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          {executionTime && (
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Clock size={10} />
              {executionTime}
            </span>
          )}
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-slate-200 text-slate-500"
            title="Collapse results"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'results' && (
          <ResultsTable 
            columns={columns} 
            rows={rows} 
            loading={queryLoading}
            error={queryError}
            onColumnSelect={onColumnSelect}
          />
        )}
        {activeTab === 'schema' && (
          <SchemaTab columns={columns} />
        )}
        {activeTab === 'logs' && (
          <LogsTab error={queryError} executionTime={executionTime} />
        )}
      </div>
    </div>
  );
}

// Simple results table
function ResultsTable({ columns, rows, loading, error, onColumnSelect }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <Loader2 size={20} className="animate-spin mr-2" />
        <span className="text-sm">Executing query...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-red-800">Query Error</div>
            <div className="text-xs text-red-600 mt-1 font-mono whitespace-pre-wrap">
              {error}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400">
        <Table2 size={32} strokeWidth={1} />
        <span className="text-sm mt-2">No results yet</span>
        <span className="text-xs mt-1">Press ⌘+Enter to run query</span>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            {columns?.map((col, i) => (
              <th 
                key={i}
                onClick={() => onColumnSelect?.(col)}
                className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200 cursor-pointer hover:bg-slate-100 whitespace-nowrap"
              >
                {col.name || col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, i) => (
            <tr key={i} className="hover:bg-violet-50/50 border-b border-slate-100">
              {columns?.map((col, j) => (
                <td key={j} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                  {row[col.name || col] ?? <span className="text-slate-400 italic">null</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 100 && (
        <div className="px-3 py-2 text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
          Showing 100 of {rows.length.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

function SchemaTab({ columns }) {
  if (!columns || columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Run a query to see schema
      </div>
    );
  }

  return (
    <div className="p-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="pb-2 font-medium">Column</th>
            <th className="pb-2 font-medium">Type</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="py-1.5 font-medium text-slate-700">{col.name || col}</td>
              <td className="py-1.5 text-slate-500 font-mono">{col.type || 'unknown'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsTab({ error, executionTime }) {
  return (
    <div className="p-3 font-mono text-xs">
      {error ? (
        <div className="text-red-600 whitespace-pre-wrap">{error}</div>
      ) : (
        <div className="text-slate-600">
          {executionTime ? `Query completed in ${executionTime}` : 'No logs available'}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// LANGUAGE TABS
// =============================================================================

function LanguageTabs({ activeLanguage = 'sql', onChange }) {
  const languages = [
    { id: 'sql', label: 'SQL' },
    { id: 'python', label: 'Python', disabled: true },
    { id: 'r', label: 'R', disabled: true },
    { id: 'java', label: 'Java', disabled: true },
    { id: 'nodejs', label: 'Node.js', disabled: true },
  ];

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 rounded-xl">
      {languages.map((lang) => (
        <button
          key={lang.id}
          onClick={() => !lang.disabled && onChange?.(lang.id)}
          disabled={lang.disabled}
          className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
            activeLanguage === lang.id
              ? 'bg-white text-slate-800 shadow-sm'
              : lang.disabled
              ? 'text-slate-400 cursor-not-allowed'
              : 'text-slate-600 hover:text-slate-800 hover:bg-white/50'
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// QUERY TYPE BADGE (like "Aggregation query")
// =============================================================================

function QueryTypeBadge({ sql }) {
  const queryType = useMemo(() => {
    if (!sql) return null;
    const upper = sql.toUpperCase();
    if (upper.includes('GROUP BY') || upper.includes('COUNT(') || upper.includes('SUM(')) {
      return { label: 'Aggregation query', icon: BarChart3 };
    }
    if (upper.includes('JOIN')) {
      return { label: 'Join query', icon: Layers };
    }
    if (upper.includes('ORDER BY') && upper.includes('LIMIT')) {
      return { label: 'Top-N query', icon: Hash };
    }
    if (upper.includes('SELECT')) {
      return { label: 'Select query', icon: Table2 };
    }
    return null;
  }, [sql]);

  if (!queryType) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-full text-xs text-slate-600">
      <queryType.icon size={12} />
      <span>{queryType.label}</span>
      <Check size={12} className="text-emerald-500" />
    </div>
  );
}

// =============================================================================
// MAIN EDITOR COMPONENT
// =============================================================================

export default function ThreePanelEditor({
  initialQuery = '',
  database = 'FIELD_METADATA',
  schema = 'PUBLIC',
  tables = [],
  onExecute,
  connectionStatus,
  queryResult,
  queryLoading,
  queryError
}) {
  const [sql, setSql] = useState(initialQuery || getDefaultQuery(database, schema, tables));
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [resultsExpanded, setResultsExpanded] = useState(true);
  const [activeLanguage, setActiveLanguage] = useState('sql');
  const editorRef = useRef(null);

  // Generate default query
  function getDefaultQuery(db, sch, tbls) {
    const targetTable = tbls.find(t => t.includes('TABLE_ENTITY')) || tbls[0] || 'TABLE_ENTITY';
    return `-- 🔍 Explore your data
SELECT 
    NAME,
    GUID,
    TYPENAME,
    POPULARITYSCORE
FROM ${db}.${sch}.${targetTable}
WHERE NAME IS NOT NULL
ORDER BY POPULARITYSCORE DESC NULLS LAST
LIMIT 25;`;
  }

  // Keyboard shortcut: Cmd+Enter to run
  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: handleRun
    });
  };

  const handleRun = useCallback(() => {
    if (sql.trim() && onExecute) {
      onExecute(sql);
    }
  }, [sql, onExecute]);

  const handleInsertTable = (tableName) => {
    const fqn = buildSafeFQN(database, schema, tableName);
    if (editorRef.current) {
      const editor = editorRef.current;
      const position = editor.getPosition();
      editor.executeEdits('insertTable', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: fqn
      }]);
      editor.focus();
    }
  };

  return (
    <div className="flex h-full bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
      {/* Left: Schema Browser (collapsible) */}
      <CollapsibleSidebar
        isExpanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
        database={database}
        schema={schema}
        tables={tables}
        onSelectTable={handleInsertTable}
      />

      {/* Center: Editor (dominant) */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar with language tabs */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <LanguageTabs 
            activeLanguage={activeLanguage} 
            onChange={setActiveLanguage}
          />
          
          <div className="flex items-center gap-3">
            <QueryTypeBadge sql={sql} />
            
            {/* Run button - BIG and obvious */}
            <button
              onClick={handleRun}
              disabled={queryLoading || !sql.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {queryLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
              Run
              <span className="text-emerald-200 text-xs">⌘↵</span>
            </button>
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 relative" style={{ minHeight: resultsExpanded ? '200px' : '400px' }}>
          {/* Line numbers background */}
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-slate-50 border-r border-slate-100" />
          
          <Editor
            height="100%"
            defaultLanguage="sql"
            value={sql}
            onChange={setSql}
            onMount={handleEditorMount}
            theme="vs"
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'SF Mono', 'Monaco', monospace",
              lineNumbers: 'on',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 16, bottom: 16 },
              lineHeight: 22,
              renderLineHighlight: 'all',
              lineNumbersMinChars: 3,
              folding: true,
              glyphMargin: false,
              lineDecorationsWidth: 8,
              automaticLayout: true,
              tabSize: 4,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
            }}
          />
        </div>

        {/* Bottom: Results Panel */}
        <ResultsPanel
          isExpanded={resultsExpanded}
          onToggle={() => setResultsExpanded(!resultsExpanded)}
          queryResult={queryResult}
          queryLoading={queryLoading}
          queryError={queryError}
          columns={queryResult?.columns || []}
          rows={queryResult?.rows || []}
          executionTime={queryResult?.executionTime}
        />
      </div>
    </div>
  );
}


