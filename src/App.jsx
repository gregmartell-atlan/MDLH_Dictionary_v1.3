import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { Download, Copy, Check, Code2, X, Search, Command, Play, Loader2, Sparkles, ArrowLeft, Database, Snowflake, Wifi, WifiOff, ChevronDown, Zap, Layers } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
// Core components loaded immediately
import ConnectionModal from './components/ConnectionModal';
import QueryPanelShell from './components/QueryPanelShell';
import CategorySidebar from './components/CategorySidebar';
import { CommandPalette } from './components/search/CommandPalette';
import { Callout } from './components/ui/Callout';
import { TabbedCodeCard } from './components/ui/TabbedCodeCard';

// Lazy-loaded components - reduces initial bundle size
// These are loaded on-demand when first needed
const QueryEditor = lazy(() => import('./components/QueryEditor'));
const ShowMyWork = lazy(() => import('./components/ShowMyWork'));
const FlyoutQueryEditor = lazy(() => import('./components/FlyoutQueryEditor'));
const TestQueryLayout = lazy(() => import('./components/TestQueryLayout'));
const QueryLibraryLayout = lazy(() => import('./components/QueryLibraryLayout'));
const RecommendedQueries = lazy(() => import('./components/RecommendedQueries'));

// Lineage components - heavy with graph rendering, good candidates for lazy loading
const LineageRail = lazy(() => import('./components/lineage/LineageRail').then(m => ({ default: m.LineageRail })));
const LineagePanel = lazy(() => import('./components/lineage/LineagePanel').then(m => ({ default: m.LineagePanel })));

import { useConnection, useSampleEntities, useQuery } from './hooks/useSnowflake';
import { useLineageData } from './hooks/useLineageData';
import { createSnowflakeLineageService } from './services/lineageService';
import { createLogger } from './utils/logger';
import { buildSafeFQN, escapeStringValue } from './utils/queryHelpers';
import { SystemConfigProvider } from './context/SystemConfigContext';
import { useBackendInstanceGuard } from './hooks/useBackendInstanceGuard';

// Training/UX enhancement components
import OnboardingModal, { isFirstVisit, getUserRole } from './components/OnboardingModal';
import DiscoveryCards from './components/DiscoveryCards';
import LearningModeToggle from './components/LearningModeToggle';
import { LearningModeProvider, useLearningMode } from './context/LearningModeContext';
import MDLHGlossary from './components/MDLHGlossary';
import QueryTips, { ContextualTip } from './components/QueryTips';
import TroubleshootingPanel from './components/TroubleshootingPanel';
import { Book, GraduationCap, HelpCircle } from 'lucide-react';

// Loading fallback component for Suspense
const LoadingFallback = ({ message = 'Loading...' }) => (
  <div className="flex items-center justify-center p-8">
    <Loader2 className="w-6 h-6 text-blue-500 animate-spin mr-2" />
    <span className="text-gray-500">{message}</span>
  </div>
);

// Scoped loggers for App
const appLog = createLogger('App');
const uiLog = createLogger('UI');

// Import data and utilities from extracted modules
import { entities as data } from './data/entities';
import { exampleQueries as staticExampleQueries, mergedExampleQueries as staticMergedQueries } from './data/exampleQueries';
import { 
  transformExampleQueries, 
  filterQueriesByAvailability,
  validateQueryTables,
  getSuggestedAlternatives 
} from './utils/dynamicExampleQueries';
import { 
  tabs, 
  MDLH_DATABASES, 
  MDLH_SCHEMAS, 
  columns, 
  colHeaders,
  selectDropdownStyles,
  DEFAULT_DATABASE,
  DEFAULT_SCHEMA
} from './data/constants';
import {
  discoverMDLHTables,
  findAlternativeTable,
  fixQueryForAvailableTables,
  tableExists,
  extractTableFromQuery,
  getEntityTablesForCategory,
  fetchTableColumns
} from './utils/tableDiscovery';
import { preValidateAllQueries } from './utils/queryHelpers';
import { isDemoMode, DEMO_DATABASE, DEMO_SCHEMA, DEMO_TABLES } from './data/demoData';

// Check if we're in demo mode (GitHub Pages / no backend)
const IS_DEMO = isDemoMode();

// Build the 30-day recursive lineage query for a specific fully-qualified object
const buildLineagePreviewQuery = (targetFqn) => {
  const safeTarget = escapeStringValue(targetFqn);
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
    WHERE target_object = ${safeTarget}
    
    UNION ALL
    
    SELECT e.source_object, e.target_object, lt.depth + 1
    FROM lineage_edges e
    INNER JOIN lineage_tree lt ON e.target_object = lt.source_object
    WHERE lt.depth < 10
)
SELECT source_object, target_object, MIN(depth) AS depth
FROM lineage_tree
GROUP BY source_object, target_object
ORDER BY depth, target_object, source_object;
  `.trim();
};

// Normalize rows (arrays or objects) to objects keyed by column names
const normalizeResultRows = (rows, columns = []) => {
  if (!Array.isArray(rows)) return [];
  if (!Array.isArray(columns) || columns.length === 0) {
    return rows.map((r) => (Array.isArray(r) ? {} : r));
  }
  return rows.map((row) => {
    if (!Array.isArray(row)) return row;
    return columns.reduce((acc, col, idx) => ({ ...acc, [col]: row[idx] }), {});
  });
};

// Build a lightweight graph for LineageRail from the recursive lineage result set
const buildLineagePreviewGraph = (result, focusFqn) => {
  const rows = normalizeResultRows(result?.rows || [], result?.columns || []);
  if (rows.length === 0) {
    return { nodes: [], edges: [], metadata: { entityName: focusFqn } };
  }

  const maxDepth = Math.max(
    ...rows.map((r) => Number(r.DEPTH || r.depth || 1)),
    1
  );
  const maxColumns = 3; // compress wider trees into three rails
  const focusCol = Math.min(maxDepth, maxColumns - 1);
  const columnRows = {};
  const nodeIdMap = new Map();
  const nodes = [];
  const edges = [];

  const allocRow = (col) => {
    columnRows[col] = columnRows[col] || 0;
    return columnRows[col]++;
  };

  const addNode = (label, column, opts = {}) => {
    const key = label?.toUpperCase() || label || '';
    if (nodeIdMap.has(key)) return nodeIdMap.get(key);
    const id = `node_${nodeIdMap.size}`;
    const row = allocRow(column);
    nodes.push({
      id,
      label,
      column,
      row,
      type: opts.type || 'dataset',
      typeName: opts.typeName || 'Table',
      isMain: opts.isMain || false,
    });
    nodeIdMap.set(key, id);
    return id;
  };

  // Main/focus node
  addNode(focusFqn, focusCol, { isMain: true, typeName: 'Table' });

  rows.forEach((raw) => {
    const source = raw.SOURCE_OBJECT || raw.source_object;
    const target = raw.TARGET_OBJECT || raw.target_object;
    const depth = Number(raw.DEPTH || raw.depth || 1);

    if (!source || !target) return;

    const unclampedTargetCol = focusCol - (depth - 1);
    const targetCol = Math.max(0, unclampedTargetCol);
    const sourceCol = Math.max(0, targetCol - 1);

    const targetId = addNode(target, targetCol, { typeName: 'Asset' });
    const sourceId = addNode(source, sourceCol, { typeName: 'Asset' });

    edges.push({ from: sourceId, to: targetId });
  });

  return {
    nodes,
    edges,
    metadata: {
      entityName: focusFqn,
      upstreamCount: nodes.filter((n) => !n.isMain).length,
      downstreamCount: 0,
    },
  };
};

// API base URL for backend calls
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Note: tabs, data, exampleQueries, columns, colHeaders, MDLH_DATABASES, MDLH_SCHEMAS 
// are now imported from ./data/* modules

// Legacy local definitions removed - now using imports from data modules
// See: src/data/entities.js, src/data/exampleQueries.js, src/data/constants.js

// ---------------------------------------------------------------------------
// COMPONENT DEFINITIONS START HERE  
// ---------------------------------------------------------------------------

// Atlan Logo Icon
function AtlanIcon({ size = 24, className = "" }) {
  return (
    <svg 
      viewBox="0 0 32 32" 
      width={size} 
      height={size} 
      className={className}
    >
      {/* Atlan "A" logomark */}
      <defs>
        <linearGradient id="atlan-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3366FF" />
          <stop offset="100%" stopColor="#5B8DEF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="6" fill="url(#atlan-gradient)" />
      <path 
        d="M16 6L8 26h4l1.5-4h5l1.5 4h4L16 6zm0 6l2 6h-4l2-6z" 
        fill="white"
      />
    </svg>
  );
}

// Global connection status indicator - DuckDB style: clean, minimal
function ConnectionIndicator({ status, loading, onClick, database, schema }) {
  const isConnected = status?.connected;
  const isUnreachable = status?.unreachable;
  
  const getState = () => {
    if (isUnreachable) return 'unreachable';
    if (loading) return 'connecting';
    if (isConnected) return 'connected';
    return 'disconnected';
  };
  const state = getState();
  
  // DuckDB-style: simple dot indicator + text
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
      title={
        state === 'disconnected' ? 'Click to connect to Snowflake' :
        state === 'connecting' ? 'Establishing connection...' :
        state === 'connected' ? 'Connected – Click to manage' :
        'API Unreachable – Click to retry'
      }
    >
      {/* Status dot */}
      {state === 'connecting' ? (
        <Loader2 size={12} className="animate-spin text-gray-400" />
      ) : (
        <span className={`w-2 h-2 rounded-full ${
          state === 'connected' ? 'bg-emerald-500' :
          state === 'unreachable' ? 'bg-red-500' :
          'bg-gray-300'
        }`} />
      )}
      
      {/* Label */}
      <span className="hidden sm:inline">
        {state === 'disconnected' && 'Connect'}
        {state === 'connecting' && 'Connecting...'}
        {state === 'connected' && (
          <span className="font-mono text-xs">
            {database || status?.database || 'DB'}.{schema || status?.schema || 'PUBLIC'}
          </span>
        )}
        {state === 'unreachable' && 'Offline'}
      </span>
      
      <Snowflake size={14} className="text-gray-400" />
    </button>
  );
}

// Banner component for displaying unreachable API warning
function UnreachableBanner({ onRetry }) {
  return (
    <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between max-w-full">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <WifiOff size={18} className="text-gray-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-800 font-mono">
              MDLH API is not responding
            </div>
            <div className="text-xs text-gray-600">
              Your Snowflake session may still be valid, but the MDLH service cannot be reached.
            </div>
          </div>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-4 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors flex-shrink-0"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
        copied 
          ? 'bg-green-500 text-white' 
          : 'bg-white border border-gray-200 text-gray-600 hover:border-[#3366FF] hover:text-[#3366FF]'
      }`}
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <Check size={12} />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <Copy size={12} />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}


// Inline copy button for table cells
function CellCopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async (e) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  
  return (
    <button
      onClick={handleCopy}
      className={`ml-1.5 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-5 h-5 rounded transition-all duration-150 ${
        copied 
          ? 'bg-green-500 text-white' 
          : 'bg-gray-200 hover:bg-[#3366FF] text-gray-500 hover:text-white'
      }`}
      title="Copy"
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
    </button>
  );
}

// Slide-out Query Panel - Now uses extracted shell + layout components
function QueryPanel({ 
  isOpen, 
  onClose, 
  queries, 
  categoryLabel, 
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
  onOpenConnectionModal = null
}) {
  // State for test query mode - shows embedded editor
  const [testQueryMode, setTestQueryMode] = useState(null); // { query, title }
  
  // Track if there are unsaved changes in the flyout editor
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Reset test mode and unsaved changes when panel closes
  useEffect(() => {
    if (!isOpen) {
      setTestQueryMode(null);
      setHasUnsavedChanges(false);
    }
  }, [isOpen]);
  
  // Handler for test query action
  const handleTestQuery = useCallback((query, title) => {
    uiLog.info('Enter Test Query mode', { title, queryPreview: query.substring(0, 50) });
    setTestQueryMode({ query, title });
    setHasUnsavedChanges(false);
  }, []);
  
  // Handler to open in full editor
  const handleOpenFullEditor = useCallback((sql) => {
    uiLog.info('Open Full Editor from flyout', { sqlPreview: sql.substring(0, 50) });
    onRunInEditor(sql);
    onClose();
  }, [onRunInEditor, onClose]);
  
  // Handler for back button in test mode
  const handleBackFromTest = useCallback(() => {
    uiLog.info('Back from Test Query mode');
    setTestQueryMode(null);
    setHasUnsavedChanges(false);
  }, []);
  
  // Handler for close - check for unsaved changes
  const handleBeforeClose = useCallback(() => {
    // Only block if in test mode with unsaved changes
    if (testQueryMode && hasUnsavedChanges) {
      return true; // Block close, show confirmation
    }
    return false;
  }, [testQueryMode, hasUnsavedChanges]);
  
  // Handle SQL changes from the flyout editor
  const handleSqlChange = useCallback((sql, initialQuery) => {
    setHasUnsavedChanges(sql !== initialQuery);
  }, []);

  return (
    <QueryPanelShell 
      isOpen={isOpen} 
      onClose={onClose}
      onBeforeClose={handleBeforeClose}
    >
      {testQueryMode ? (
        <TestQueryLayout
          testQueryMode={testQueryMode}
          onBack={handleBackFromTest}
          onClose={onClose}
          onOpenFullEditor={handleOpenFullEditor}
          selectedDatabase={selectedDatabase}
          selectedSchema={selectedSchema}
          onSqlChange={handleSqlChange}
          availableTables={[...discoveredTables]}
        />
      ) : (
        <QueryLibraryLayout
          categoryLabel={categoryLabel}
          onClose={onClose}
          queries={queries}
          highlightedQuery={highlightedQuery}
          onRunInEditor={onRunInEditor}
          isLoading={isLoading}
          discoveredTables={discoveredTables}
          isConnected={isConnected}
          batchValidationResults={batchValidationResults}
          onShowMyWork={onShowMyWork}
          isBatchValidating={isBatchValidating}
          selectedDatabase={selectedDatabase}
          selectedSchema={selectedSchema}
          queryValidationMap={queryValidationMap}
          onValidateAll={onValidateAll}
          onOpenConnectionModal={onOpenConnectionModal}
          onTestQuery={handleTestQuery}
          extractTableFromQuery={extractTableFromQuery}
        />
      )}
    </QueryPanelShell>
  );
}

// Play button for running a query
function PlayQueryButton({ onClick, hasQuery, tableAvailable, isConnected }) {
  if (!hasQuery) return null;
  
  // Determine button state based on table availability
  const isValidated = isConnected && tableAvailable === true;
  const isUnavailable = isConnected && tableAvailable === false;
  const isUnknown = !isConnected || tableAvailable === null;
  
  if (isUnavailable) {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all duration-200 border border-gray-200"
        title="Table not found - query may fail"
      >
        <Code2 size={12} />
        <span>Query</span>
      </button>
    );
  }
  
  if (isValidated) {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500 hover:bg-green-600 text-white transition-all duration-200 shadow-sm hover:shadow-md"
        title="✓ Table verified - click to run query"
      >
        <Check size={12} />
        <span>Query</span>
      </button>
    );
  }
  
  // Unknown state (not connected)
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#3366FF] hover:bg-blue-600 text-white transition-all duration-200 shadow-sm hover:shadow-md"
      title="View query"
    >
      <Code2 size={12} />
      <span>Query</span>
    </button>
  );
}

// Note: MDLH_DATABASES, MDLH_SCHEMAS, and fetchTableColumns are imported from data/constants.js and utils/tableDiscovery.js

// Local columnCache for table column caching
const columnCache = new Map();

// Local fetchTableColumns - keeping for backward compat until full migration
async function localFetchTableColumns(database, schema, table) {
  const cacheKey = `${database}.${schema}.${table}`;
  
  // Return cached columns if available
  if (columnCache.has(cacheKey)) {
    return columnCache.get(cacheKey);
  }
  
  try {
    // Get session ID from sessionStorage
    const sessionData = sessionStorage.getItem('snowflake_session');
    const sessionId = sessionData ? JSON.parse(sessionData).sessionId : null;
    
    if (!sessionId) {
      appLog.warn('fetchColumnsForTable() - no session, cannot fetch columns');
      return null;
    }
    
    const response = await fetch(
      `${API_BASE_URL}/api/metadata/columns?database=${database}&schema=${schema}&table=${table}&refresh=false`,
      { headers: { 'X-Session-ID': sessionId } }
    );
    
    if (response.ok) {
      const columns = await response.json();
      // Cache the result
      columnCache.set(cacheKey, columns);
      return columns;
    }
  } catch (err) {
    appLog.error('fetchColumnsForTable() - failed', { error: err.message });
  }
  
  return null;
}

// Pick best columns for a query based on available columns and entity type
function selectQueryColumns(columns, entityName, maxColumns = 8) {
  if (!columns || columns.length === 0) return null;
  
  const colNames = columns.map(c => (typeof c === 'string' ? c : c.name).toUpperCase());
  const entityLower = entityName.toLowerCase();
  
  // Priority columns by category
  const priorityColumns = {
    identity: ['NAME', 'GUID', 'QUALIFIEDNAME', 'DISPLAYNAME'],
    hierarchy: ['DATABASENAME', 'SCHEMANAME', 'TABLENAME', 'CONNECTIONNAME', 'CONNECTORNAME'],
    description: ['DESCRIPTION', 'USERDESCRIPTION', 'SHORTDESCRIPTION'],
    metadata: ['TYPENAME', 'DATATYPE', 'STATUS'],
    governance: ['CERTIFICATESTATUSMESSAGE', 'OWNERUSERS', 'OWNERGROUPS'],
    metrics: ['QUERYCOUNT', 'POPULARITYSCORE', 'ROWCOUNT', 'COLUMNCOUNT'],
    timestamps: ['CREATETIME', 'UPDATETIME'],
    // Entity-specific priority columns
    process: ['INPUTS', 'OUTPUTS', 'SQL', 'CODE'],
    glossary: ['ANCHOR', 'CATEGORIES', 'TERMS'],
    column: ['ISPRIMARYKEY', 'ISFOREIGNKEY', 'ISNULLABLE', 'ORDER'],
    dbt: ['DBTPACKAGENAME', 'DBTSTATUS', 'DBTMATERIALIZEDTYPE'],
    bi: ['PROJECTQUALIFIEDNAME', 'WORKBOOKQUALIFIEDNAME', 'DASHBOARDQUALIFIEDNAME'],
  };
  
  // Determine which category columns to prioritize
  let categoryPriority = [];
  if (entityLower.includes('process') || entityLower.includes('lineage')) {
    categoryPriority = priorityColumns.process;
  } else if (entityLower.includes('glossary') || entityLower.includes('term') || entityLower.includes('category')) {
    categoryPriority = priorityColumns.glossary;
  } else if (entityLower === 'column') {
    categoryPriority = priorityColumns.column;
  } else if (entityLower.includes('dbt')) {
    categoryPriority = priorityColumns.dbt;
  } else if (['tableau', 'powerbi', 'looker', 'sigma', 'mode', 'preset', 'superset', 'domo', 'qlik', 'metabase'].some(bi => entityLower.includes(bi))) {
    categoryPriority = priorityColumns.bi;
  }
  
  // Build ordered list of columns to select
  const orderedPriority = [
    ...priorityColumns.identity,
    ...categoryPriority,
    ...priorityColumns.hierarchy,
    ...priorityColumns.description,
    ...priorityColumns.metadata,
    ...priorityColumns.governance,
    ...priorityColumns.metrics,
    ...priorityColumns.timestamps,
  ];
  
  // Select columns that exist
  const selected = [];
  for (const col of orderedPriority) {
    if (colNames.includes(col) && !selected.includes(col)) {
      selected.push(col);
      if (selected.length >= maxColumns) break;
    }
  }
  
  // If we didn't find enough priority columns, add others
  if (selected.length < maxColumns) {
    for (const col of colNames) {
      if (!selected.includes(col)) {
        selected.push(col);
        if (selected.length >= maxColumns) break;
      }
    }
  }
  
  return selected;
}

// Generate a context-aware example query for an entity
function generateEntityQuery(entityName, tableName, database, schema, columns = null, options = {}) {
  const db = database || 'FIELD_METADATA';
  const sch = schema || 'PUBLIC';
  const table = tableName || `${entityName.toUpperCase()}_ENTITY`;
  const limit = options.limit || 10;
  const fullTableRef = `${db}.${sch}.${table}`;
  const entityLower = entityName.toLowerCase();
  
  // Select best columns if we have column metadata
  const selectedCols = selectQueryColumns(columns, entityName);
  const colList = selectedCols ? selectedCols.join(',\n    ') : '*';
  const hasColumns = selectedCols && selectedCols.length > 0;
  
  // Header comment for all queries
  const header = `-- Query ${entityName} entities
-- Database: ${db} | Schema: ${sch}
-- Columns: ${hasColumns ? `${selectedCols.length} selected from ${columns.length} available` : 'Using SELECT * (connect to see available columns)'}

`;

  // ============================================
  // SMART QUERY GENERATION (uses real columns when available)
  // ============================================
  
  // If we have column metadata, use smart column selection
  if (hasColumns) {
    // Determine ORDER BY clause based on available columns
    let orderBy = '';
    if (selectedCols.includes('CREATETIME')) orderBy = 'ORDER BY CREATETIME DESC';
    else if (selectedCols.includes('UPDATETIME')) orderBy = 'ORDER BY UPDATETIME DESC';
    else if (selectedCols.includes('POPULARITYSCORE')) orderBy = 'ORDER BY POPULARITYSCORE DESC NULLS LAST';
    else if (selectedCols.includes('NAME')) orderBy = 'ORDER BY NAME';
    
    // Determine WHERE clause based on available columns and entity type
    let whereClause = '';
    if (selectedCols.includes('STATUS')) {
      whereClause = "WHERE STATUS = 'ACTIVE'";
    }
    
    return header + `SELECT 
    ${colList}
FROM ${fullTableRef}
${whereClause}
${orderBy}
LIMIT ${limit};`.replace(/\n\n+/g, '\n');
  }
  
  // ============================================
  // FALLBACK QUERIES (when no column metadata)
  // ============================================
  
  if (entityLower === 'connection') {
    return header + `SELECT *
FROM ${fullTableRef}
LIMIT ${limit};

-- Common columns: NAME, CONNECTORNAME, CATEGORY, HOST, CREATETIME`;
  }
  
  if (entityLower.includes('process') && !entityLower.includes('dbt')) {
    return header + `SELECT *
FROM ${fullTableRef}
LIMIT ${limit};

-- Common columns: NAME, TYPENAME, INPUTS, OUTPUTS, SQL, CREATETIME`;
  }

  // ============================================
  // GLOSSARY ENTITIES - Fallback (when not connected)
  // ============================================
  
  if (entityLower === 'atlasglossary') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, SHORTDESCRIPTION, LANGUAGE, CREATETIME, CREATEDBY`;
  }
  
  if (entityLower === 'atlasglossaryterm') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, USERDESCRIPTION, ANCHOR, UPDATETIME`;
  }
  
  if (entityLower === 'atlasglossarycategory') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, SHORTDESCRIPTION, ANCHOR, PARENTCATEGORY`;
  }

  // ============================================
  // DATA MESH ENTITIES
  // ============================================
  
  if (entityLower === 'datadomain') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, USERDESCRIPTION, PARENTDOMAINQUALIFIEDNAME, OWNERUSERS`;
  }
  
  if (entityLower === 'dataproduct') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, DATAPRODUCTSTATUS, DATAPRODUCTCRITICALITY, DATAPRODUCTSCORE`;
  }
  
  if (entityLower === 'datacontract') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, DATACONTRACTVERSION, DATACONTRACTASSETGUID, CREATETIME`;
  }

  // ============================================
  // RELATIONAL DB ENTITIES
  // ============================================
  
  if (entityLower === 'database') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, CONNECTORNAME, SCHEMACOUNT, POPULARITYSCORE`;
  }
  
  if (entityLower === 'schema' && !entityLower.includes('registry')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, DATABASENAME, TABLECOUNT, VIEWCOUNT`;
  }
  
  if (entityLower === 'table') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, SCHEMANAME, COLUMNCOUNT, POPULARITYSCORE`;
  }
  
  if (entityLower === 'view' || entityLower === 'materialisedview') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, SCHEMANAME, DEFINITION`;
  }
  
  if (entityLower === 'column') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, TABLENAME, DATATYPE, ISNULLABLE`;
  }
  
  if (entityLower === 'tablepartition') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }
  
  if (entityLower === 'procedure' || entityLower === 'function') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }
  
  // Snowflake-specific
  if (entityLower.includes('snowflake')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }

  // ============================================
  // QUERY ORG ENTITIES
  // ============================================
  
  if (entityLower === 'collection') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }
  
  if (entityLower === 'folder') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }
  
  if (entityLower === 'query') {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};
-- Hint: NAME, RAWQUERY, CREATEDBY, CREATETIME`;
  }

  // ============================================
  // BI TOOLS (Tableau, PowerBI, Looker, Sigma, etc.)
  // ============================================
  
  if (entityLower.includes('dashboard') || entityLower.includes('report')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }
  
  if (entityLower.includes('workbook') || entityLower.includes('project') || entityLower.includes('workspace')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }
  
  if (entityLower.includes('dataset') || entityLower.includes('datasource')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }
  
  if (entityLower.includes('chart') || entityLower.includes('tile') || entityLower.includes('visual')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }
  
  if (entityLower.includes('field') || entityLower.includes('measure') || entityLower.includes('dimension')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }

  // ============================================
  // DBT ENTITIES
  // ============================================
  
  if (entityLower.includes('dbt')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }

  // ============================================
  // OBJECT STORAGE (S3, GCS, ADLS)
  // ============================================
  
  if (entityLower.includes('bucket') || entityLower.includes('container') || 
      entityLower.includes('object') || entityLower.includes('file')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }

  // ============================================
  // ORCHESTRATION (Airflow, Fivetran, Matillion)
  // ============================================
  
  if (entityLower.includes('dag') || entityLower.includes('pipeline') || 
      entityLower.includes('job') || entityLower.includes('task') ||
      entityLower.includes('connector')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }

  // ============================================
  // GOVERNANCE, AI/ML, STREAMING ENTITIES
  // ============================================
  
  if (entityLower.includes('tag') || entityLower === 'persona' || 
      entityLower === 'purpose' || entityLower.includes('policy') ||
      entityLower.includes('aimodel') || entityLower.includes('aiapplication') ||
      entityLower.includes('topic') || entityLower.includes('consumer') ||
      entityLower.includes('custommetadata')) {
    return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};`;
  }

  // ============================================
  // DEFAULT FALLBACK - Use SELECT * for safety
  // ============================================
  
  return header + `SELECT * FROM ${fullTableRef} LIMIT ${limit};

-- 💡 Connect to Snowflake for smart column selection
-- Or run: DESCRIBE TABLE ${fullTableRef};`;
}

export default function App() {
  // =========================================================================
  // Backend Restart Detection
  // =========================================================================
  // This MUST be first - it clears stale sessions before any other hooks run
  useBackendInstanceGuard();
  
  const [activeTab, setActiveTab] = useState('core');
  const [search, setSearch] = useState('');
  const [showQueries, setShowQueries] = useState(false);
  const [highlightedQuery, setHighlightedQuery] = useState(null);
  const [editorQuery, setEditorQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [selectedMDLHDatabase, setSelectedMDLHDatabase] = useState(IS_DEMO ? DEMO_DATABASE : 'FIELD_METADATA');
  const [selectedMDLHSchema, setSelectedMDLHSchema] = useState(IS_DEMO ? DEMO_SCHEMA : 'PUBLIC');
  const searchRef = useRef(null);
  
  // State for table discovery and validation
  // Demo mode: Pre-populate with demo tables
  const [discoveredTables, setDiscoveredTables] = useState(() =>
    IS_DEMO ? new Set(DEMO_TABLES.map(t => t.NAME)) : new Set()
  );
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [validatedQueries, setValidatedQueries] = useState(new Map()); // queryId -> { valid, error, columns }
  const [isValidating, setIsValidating] = useState(false);
  // Demo mode: Always connected
  const [isConnected, setIsConnected] = useState(IS_DEMO);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true); // Filter to show only queryable entities
  const [queryValidationMap, setQueryValidationMap] = useState(new Map()); // Pre-validated queries
  
  // Dynamic queries - transformed to use actual discovered table names with FQNs
  const [exampleQueries, setExampleQueries] = useState(staticExampleQueries);
  const [mergedExampleQueries, setMergedExampleQueries] = useState(staticMergedQueries);
  
  // State for batch validation results (with suggestions)
  const [batchValidationResults, setBatchValidationResults] = useState(new Map()); // queryId -> full validation result
  const [isBatchValidating, setIsBatchValidating] = useState(false);
  
  // State for Show My Work modal
  const [showMyWorkQuery, setShowMyWorkQuery] = useState(null);
  const [showMyWorkValidation, setShowMyWorkValidation] = useState(null);
  
  // Global connection modal state
  const [showConnectionModal, setShowConnectionModal] = useState(false);

  // Training/UX enhancement state
  const [showOnboarding, setShowOnboarding] = useState(() => IS_DEMO && isFirstVisit());
  const [showGlossary, setShowGlossary] = useState(false);
  const [showQueryTips, setShowQueryTips] = useState(false);
  const [userRole, setUserRole] = useState(() => getUserRole());

  // Category context for editor - tracks which category user was in before opening editor
  const [lastCategory, setLastCategory] = useState(null);

  // Lineage flyout state
  const [showLineageFlyout, setShowLineageFlyout] = useState(false);
  const [selectedLineageEntity, setSelectedLineageEntity] = useState(null);
  const [lineagePreviewCache, setLineagePreviewCache] = useState({});
  const [hoveredTable, setHoveredTable] = useState(null);
  const [lineageSource, setLineageSource] = useState('mdlh'); // 'mdlh' or 'snowflake'
  const [snowflakeLineageData, setSnowflakeLineageData] = useState(null);
  const [snowflakeLineageLoading, setSnowflakeLineageLoading] = useState(false);
  const [snowflakeLineageError, setSnowflakeLineageError] = useState(null);
  
  // Handler to open lineage flyout with a specific entity
  const handleOpenLineagePanel = useCallback((entityData = null) => {
    setSelectedLineageEntity(entityData);
    setShowLineageFlyout(true);
  }, []);

  // Command palette state
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  
  // Use global connection hook
  const { 
    status: globalConnectionStatus, 
    testConnection: globalTestConnection, 
    loading: globalConnectionLoading 
  } = useConnection();
  
  // Use sample entities hook - loads real GUIDs from discovered tables
  const {
    samples: sampleEntities,
    loadSamples: loadSampleEntities,
    clearSamples: clearSampleEntities
  } = useSampleEntities();
  
  // Use query hook for executing SQL
  const { executeQuery: lineageExecuteQuery } = useQuery(globalConnectionStatus);
  
  // Use dynamic lineage data hook - fetches lineage for tables in the current query
  // Following OpenLineage standard: Job (process) with input/output Datasets
  const {
    lineageData: dynamicLineage,
    loading: lineageLoading,
    error: lineageError,
    currentTable: lineageCurrentTable,
    refetch: refetchLineage,
    fetchForEntity: fetchLineageForEntity
  } = useLineageData(
    lineageExecuteQuery,
    isConnected,
    selectedMDLHDatabase || DEFAULT_DATABASE,
    selectedMDLHSchema || DEFAULT_SCHEMA,
    editorQuery // Pass current query to show contextual lineage
  );

  // Watch for selected lineage entity changes and fetch lineage
  useEffect(() => {
    if (selectedLineageEntity && fetchLineageForEntity) {
      const entityId = selectedLineageEntity.GUID || selectedLineageEntity.guid ||
                       selectedLineageEntity.NAME || selectedLineageEntity.name ||
                       selectedLineageEntity.qualifiedName;
      if (entityId) {
        fetchLineageForEntity(entityId);
      }
    }
  }, [selectedLineageEntity, fetchLineageForEntity]);

  // Handler for clicking a node in the lineage graph to drill into its lineage
  const handleLineageNodeClick = useCallback((node) => {
    if (!node) return;

    // Use GUID if available, otherwise use label (name)
    const entityId = node.guid || node.label;
    if (entityId && fetchLineageForEntity) {
      fetchLineageForEntity(entityId);
    }
  }, [fetchLineageForEntity]);

  // Handler for fetching Snowflake native lineage (ACCESS_HISTORY)
  const fetchSnowflakeLineage = useCallback(async (tableFqn) => {
    if (!isConnected || !tableFqn || !lineageExecuteQuery) {
      return;
    }

    setSnowflakeLineageLoading(true);
    setSnowflakeLineageError(null);

    try {
      const service = createSnowflakeLineageService(lineageExecuteQuery);
      const result = await service.getLineage(tableFqn);

      if (result.error) {
        setSnowflakeLineageError(result.error);
        setSnowflakeLineageData(null);
      } else {
        setSnowflakeLineageData(result);
      }
    } catch (err) {
      setSnowflakeLineageError(err.message);
      setSnowflakeLineageData(null);
    } finally {
      setSnowflakeLineageLoading(false);
    }
  }, [isConnected, lineageExecuteQuery]);

  // Handler for changing lineage source
  const handleLineageSourceChange = useCallback((newSource) => {
    setLineageSource(newSource);

    // If switching to Snowflake, fetch Snowflake lineage
    if (newSource === 'snowflake' && selectedLineageEntity) {
      const tableName = selectedLineageEntity.NAME || selectedLineageEntity.name || lineageCurrentTable;
      if (tableName) {
        const fqn = `${selectedMDLHDatabase || DEFAULT_DATABASE}.${selectedMDLHSchema || DEFAULT_SCHEMA}.${tableName}`;
        fetchSnowflakeLineage(fqn);
      }
    }
  }, [selectedLineageEntity, lineageCurrentTable, selectedMDLHDatabase, selectedMDLHSchema, fetchSnowflakeLineage]);

  // Prefetch and cache lineage previews for popular assets (used on hover)
  const loadLineagePreview = useCallback(async (tableFqn) => {
    if (!isConnected || !tableFqn) return;

    // Skip if already loading or ready
    const existing = lineagePreviewCache[tableFqn];
    if (existing?.status === 'ready' || existing?.status === 'loading') {
      return;
    }

    const query = buildLineagePreviewQuery(tableFqn);
    setLineagePreviewCache((prev) => ({
      ...prev,
      [tableFqn]: { status: 'loading', query },
    }));

    try {
      const result = await lineageExecuteQuery(query, {
        database: selectedMDLHDatabase,
        schema: selectedMDLHSchema,
        timeout: 30,
      });

      if (result?.rows?.length) {
        const graph = buildLineagePreviewGraph(result, tableFqn);
        setLineagePreviewCache((prev) => ({
          ...prev,
          [tableFqn]: {
            status: 'ready',
            query,
            graph,
            result,
          },
        }));
      } else {
        setLineagePreviewCache((prev) => ({
          ...prev,
          [tableFqn]: {
            status: 'error',
            query,
            error: 'No lineage activity found in last 30 days',
          },
        }));
      }
    } catch (err) {
      setLineagePreviewCache((prev) => ({
        ...prev,
        [tableFqn]: {
          status: 'error',
          query,
          error: err?.message || 'Failed to fetch lineage preview',
        },
      }));
    }
  }, [isConnected, lineageExecuteQuery, selectedMDLHDatabase, selectedMDLHSchema, lineagePreviewCache]);

  // Hover handlers for table lineage previews
  const handleTableHover = useCallback((tableName) => {
    if (!tableName || tableName === '(abstract)') return;
    const fqn = buildSafeFQN(selectedMDLHDatabase, selectedMDLHSchema, tableName);
    setHoveredTable(tableName);
    loadLineagePreview(fqn);
  }, [selectedMDLHDatabase, selectedMDLHSchema, loadLineagePreview]);

  const clearTableHover = useCallback(() => {
    setHoveredTable(null);
  }, []);

  // Auto-load lineage previews for the most popular sampled tables
  useEffect(() => {
    if (!isConnected || !sampleEntities?.loaded || !sampleEntities.tables?.length) return;

    const sortedTables = [...sampleEntities.tables].sort(
      (a, b) => (b.POPULARITYSCORE || 0) - (a.POPULARITYSCORE || 0)
    );

    sortedTables.slice(0, 3).forEach((row) => {
      const tableName = row.NAME || row.name;
      if (!tableName) return;
      const fqn = buildSafeFQN(selectedMDLHDatabase, selectedMDLHSchema, tableName);
      loadLineagePreview(fqn);
    });
  }, [isConnected, sampleEntities, selectedMDLHDatabase, selectedMDLHSchema, loadLineagePreview]);
  
  // Handle successful connection from global modal
  const handleGlobalConnectionSuccess = useCallback((status) => {
    uiLog.info('Connection success from modal', { database: status?.database });
    setShowConnectionModal(false);
    setIsConnected(true);
    // Table discovery will be triggered by the useEffect watching isConnected
  }, []);
  
  // Check connection status on mount and when session changes
  // FIX: Sync local isConnected state with globalConnectionStatus from useConnection hook
  // DEMO: Skip all connection polling in demo mode - we're always "connected"
  useEffect(() => {
    if (IS_DEMO) {
      return; // No-op in demo mode
    }
    let lastStatus = null; // Track last status to avoid spammy logs
    
    // Helper function with timeout to prevent hanging
    const fetchWithTimeout = async (url, options, timeoutMs = 5000) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
      } finally {
        clearTimeout(id);
      }
    };
    
    const checkConnection = async (source = 'poll') => {
      const sessionData = sessionStorage.getItem('snowflake_session');
      if (!sessionData) {
        if (lastStatus !== 'disconnected') {
          lastStatus = 'disconnected';
          if (source !== 'poll') {
            appLog.info('Connection status: Not connected (no session)');
          }
        }
        setIsConnected(false);
        return;
      }
      
      // Validate session with backend (with timeout!)
      try {
        const { sessionId, database, schema } = JSON.parse(sessionData);
        const response = await fetchWithTimeout(
          `${API_BASE_URL}/api/session/status`,
          { headers: { 'X-Session-ID': sessionId } },
          5000 // 5-second timeout to match useConnection hook
        );
        const status = await response.json();
        
        if (status.valid) {
          if (lastStatus !== 'connected') {
            lastStatus = 'connected';
            appLog.info('Connection status: Connected (session valid)', { database: status.database });
          }
          setIsConnected(true);
        } else {
          // Session expired or invalid - clear it
          sessionStorage.removeItem('snowflake_session');
          if (lastStatus !== 'expired') {
            lastStatus = 'expired';
            appLog.warn('Connection status: Session expired, cleared');
          }
          setIsConnected(false);
        }
      } catch (err) {
        // FIX: On timeout or network error, assume session is still valid (like useConnection does)
        if (err.name === 'AbortError') {
          appLog.warn('Session check timed out - assuming still valid');
          setIsConnected(true);
        } else {
          // For other errors, also assume valid if we have a session
          appLog.warn('Session check error - assuming still valid', { error: err.message });
          setIsConnected(true);
        }
      }
    };
    checkConnection('mount');
    
    // Listen for custom session change event (dispatched by ConnectionModal)
    const handleSessionChange = (event) => {
      appLog.info('Session change event received', { 
          hasSession: !!event.detail?.sessionId,
          database: event.detail?.database
        });
      lastStatus = null; // Reset so we log the new status
      
      // FIX: Immediately set connected if event indicates connected
      if (event.detail?.connected || event.detail?.sessionId) {
        setIsConnected(true);
      }
      
      checkConnection('event');
    };
    window.addEventListener('snowflake-session-changed', handleSessionChange);
    
    // Also listen for storage changes (in case session is modified from another tab)
    const handleStorageChange = () => checkConnection('storage');
    window.addEventListener('storage', handleStorageChange);
    
    // Periodic check as fallback (less frequent - 30 seconds)
    const interval = setInterval(() => checkConnection('poll'), 30000);
    
    return () => {
      window.removeEventListener('snowflake-session-changed', handleSessionChange);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);
  
  // Discover tables and pre-validate queries when database/schema changes or connection is made
  // DEMO: Skip network discovery - we already have demo tables
  useEffect(() => {
    if (IS_DEMO) {
      // Transform queries using demo tables for demo mode
      const demoTableSet = new Set(DEMO_TABLES.map(t => t.NAME));
      const transformedQueries = transformExampleQueries(
        staticExampleQueries,
        DEMO_DATABASE,
        DEMO_SCHEMA,
        demoTableSet
      );
      setExampleQueries(transformedQueries);
      setMergedExampleQueries(transformExampleQueries(
        staticMergedQueries,
        DEMO_DATABASE,
        DEMO_SCHEMA,
        demoTableSet
      ));
      return;
    }
    if (isConnected && selectedMDLHDatabase && selectedMDLHSchema) {
      setIsDiscovering(true);
      discoverMDLHTables(selectedMDLHDatabase, selectedMDLHSchema)
        .then(tables => {
          setDiscoveredTables(tables);
          appLog.info('Discovered tables', { count: tables.size, database: selectedMDLHDatabase, schema: selectedMDLHSchema });
          
          // Load sample entities for real GUIDs in recommended queries
          if (tables.size > 0) {
            loadSampleEntities(selectedMDLHDatabase, selectedMDLHSchema, tables);
            appLog.info('Loading sample entities for recommended queries');
          }
          
          // DYNAMIC QUERIES: Transform static queries to use actual discovered table names with FQNs
          if (tables.size > 0) {
            const transformedQueries = transformExampleQueries(
              staticExampleQueries,
              selectedMDLHDatabase,
              selectedMDLHSchema,
              tables
            );
            setExampleQueries(transformedQueries);
            
            const transformedMerged = transformExampleQueries(
              staticMergedQueries,
              selectedMDLHDatabase,
              selectedMDLHSchema,
              tables
            );
            setMergedExampleQueries(transformedMerged);
            
            appLog.info('Transformed queries to use discovered tables with FQNs');
            
            // Pre-validate all transformed queries
            const validationMap = preValidateAllQueries(
              transformedQueries, 
              tables, 
              selectedMDLHDatabase, 
              selectedMDLHSchema
            );
            setQueryValidationMap(validationMap);
            
            // Log validation summary
            const valid = [...validationMap.values()].filter(v => v.valid === true).length;
            const invalid = [...validationMap.values()].filter(v => v.valid === false).length;
            const autoFixed = [...validationMap.values()].filter(v => v.autoFixed).length;
            appLog.info('Query validation complete', { valid, invalid, autoFixed });
          }
        })
        .finally(() => setIsDiscovering(false));
    }
  }, [isConnected, selectedMDLHDatabase, selectedMDLHSchema, loadSampleEntities]);
  
  // Run batch validation on entity example queries to get sample data and suggestions
  const runBatchValidation = useCallback(async () => {
    if (!isConnected) return;
    
    const sessionData = sessionStorage.getItem('snowflake_session');
    if (!sessionData) return;
    
    const { sessionId } = JSON.parse(sessionData);
    
    // Collect entity queries to validate
    const queriesToValidate = [];
    Object.entries(exampleQueries).forEach(([category, queries]) => {
      if (category === 'core') {
        queries.forEach((q, i) => {
          queriesToValidate.push({
            query_id: `core_${i}`,
            sql: q.query,
            entity_type: 'core',
            description: q.title
          });
        });
      }
    });
    
    // Also add entity-specific queries from data
    Object.values(data).flat().filter(e => e.exampleQuery).forEach(entity => {
      queriesToValidate.push({
        query_id: `entity_${entity.table || entity.name}`,
        sql: entity.exampleQuery,
        entity_type: entity.name,
        description: `Example query for ${entity.name}`
      });
    });
    
    if (queriesToValidate.length === 0) return;
    
    setIsBatchValidating(true);
    appLog.info('Running batch validation', { queryCount: queriesToValidate.length });
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/query/validate-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': sessionId
        },
        body: JSON.stringify({
          queries: queriesToValidate,
          database: selectedMDLHDatabase,
          schema_name: selectedMDLHSchema,
          include_samples: true,
          sample_limit: 3
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Build results map
        const resultsMap = new Map();
        data.results.forEach(result => {
          resultsMap.set(result.query_id, result);
        });
        
        setBatchValidationResults(resultsMap);
        
        appLog.info('Batch validation complete', data.summary);
      } else {
        appLog.error('Batch validation failed', { status: response.status });
      }
    } catch (err) {
      appLog.error('Batch validation error', { error: err.message });
    } finally {
      setIsBatchValidating(false);
    }
  }, [isConnected, selectedMDLHDatabase, selectedMDLHSchema]);
  
  // Trigger batch validation after table discovery completes
  useEffect(() => {
    if (isConnected && discoveredTables.size > 0 && !isDiscovering) {
      runBatchValidation();
    }
  }, [isConnected, discoveredTables, isDiscovering, runBatchValidation]);
  
  // Handler for "Show My Work" button
  const handleShowMyWork = useCallback((query, validationResult) => {
    uiLog.info('Show My Work clicked', { 
      queryPreview: query.substring(0, 50),
      valid: validationResult?.valid 
    });
    setShowMyWorkQuery(query);
    setShowMyWorkValidation(validationResult);
  }, []);
  
  // Get warning for selected database
  const selectedDbConfig = MDLH_DATABASES.find(db => db.name === selectedMDLHDatabase);
  const dbWarning = selectedDbConfig?.warning;
  
  // Check if a table exists in the discovered tables
  const isTableAvailable = useCallback((tableName) => {
    if (!tableName || tableName === '(abstract)') return null; // Abstract tables
    if (!isConnected || discoveredTables.size === 0) return null; // Unknown
    return discoveredTables.has(tableName.toUpperCase());
  }, [isConnected, discoveredTables]);

  // Keyboard shortcut: Cmd/Ctrl + K to toggle command palette
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Function to open Query Editor with a specific query
  const openInEditor = (query) => {
    // Save current category before switching to editor
    if (activeTab !== 'editor') {
      setLastCategory(activeTab);
    }
    setEditorQuery(query);
    setActiveTab('editor');
    setShowQueries(false);
  };

  // Handler to navigate back to the previous category from editor
  const handleBackToCategory = useCallback((category) => {
    setActiveTab(category);
    setLastCategory(null);
  }, []);

  // Skip filtering for editor tab
  // Filter entities - optionally only show those with available tables
  // Memoized to prevent expensive re-computation on every render
  const filteredData = useMemo(() => {
    if (activeTab === 'editor') return [];
    return (data[activeTab] || []).filter(row => {
      // Search filter
      const matchesSearch = Object.values(row).some(val =>
        val?.toString().toLowerCase().includes(search.toLowerCase())
      );
      if (!matchesSearch) return false;

      // Availability filter (only when connected and filter is enabled)
      if (showOnlyAvailable && isConnected && discoveredTables.size > 0) {
        // Abstract tables are always shown
        if (row.table === '(abstract)') return true;
        // Check if table exists
        return discoveredTables.has(row.table?.toUpperCase());
      }

      return true;
    });
  }, [activeTab, search, showOnlyAvailable, isConnected, discoveredTables]);

  // Filter and enhance queries with validation status
  // Use merged queries which include user research queries
  // CRITICAL: Filter out queries that reference non-existent tables!
  // Memoized to prevent expensive re-computation on every render
  const filteredQueries = useMemo(() => {
    return (mergedExampleQueries[activeTab] || exampleQueries[activeTab] || []).map((q, index) => {
      const queryId = `${activeTab}-${index}`;
      const validation = queryValidationMap.get(queryId);

      // If no pre-computed validation, do inline validation against discovered tables
      // This catches any queries with hardcoded entity names that don't exist
      let inlineValidation = null;
      if (!validation && isConnected && discoveredTables.size > 0) {
        inlineValidation = validateQueryTables(q.query, discoveredTables);
      }

      return {
        ...q,
        // Use fixed query if available
        query: validation?.fixedQuery || q.query,
        validation: validation || inlineValidation,
        queryId
      };
    }).filter(q => {
      // Search filter
      const matchesSearch =
        q.title.toLowerCase().includes(search.toLowerCase()) ||
        q.description.toLowerCase().includes(search.toLowerCase()) ||
        q.query.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      // Availability filter - ALWAYS filter when connected with discovered tables
      // This is the KEY fix: filter out queries that reference non-existent tables
      if (isConnected && discoveredTables.size > 0) {
        // Use pre-computed validation or inline validation
        const isValid = q.validation?.valid !== false;

        // If showOnlyAvailable is off, show everything but mark unavailable ones
        // If showOnlyAvailable is on, only show valid queries
        if (showOnlyAvailable) {
          return isValid;
        }
      }

      return true;
    });
  }, [activeTab, search, showOnlyAvailable, isConnected, discoveredTables, mergedExampleQueries, exampleQueries, queryValidationMap]);
  
  // Count available vs total for display
  const totalEntities = (data[activeTab] || []).length;
  const availableEntities = (data[activeTab] || []).filter(row => {
    if (row.table === '(abstract)') return true;
    return discoveredTables.has(row.table?.toUpperCase());
  }).length;

  // Find a query related to an entity by searching for table name in query SQL
  // CRITICAL: Only return queries whose referenced tables exist!
  const findQueryForEntity = (entityName, tableName) => {
    const allQueries = exampleQueries[activeTab] || [];
    
    if (!tableName || tableName === '(abstract)') return null;
    
    const tableNameLower = tableName.toLowerCase();
    const entityNameLower = entityName.toLowerCase();
    
    // Helper to check if a query's tables are valid
    const isQueryValid = (q) => {
      if (!isConnected || discoveredTables.size === 0) return true; // No validation without discovery
      const validation = validateQueryTables(q.query, discoveredTables);
      return validation.valid;
    };
    
    // Priority 1: Exact table name match in query SQL (e.g., "FROM TABLE_ENTITY" or "TABLE_ENTITY")
    let matchedQuery = allQueries.find(q => {
      const queryLower = q.query.toLowerCase();
      const hasMatch = (
        queryLower.includes(`from ${tableNameLower}`) ||
        queryLower.includes(`from\n    ${tableNameLower}`) ||
        queryLower.includes(`from\n${tableNameLower}`) ||
        queryLower.includes(`join ${tableNameLower}`) ||
        // Also check for the table name as a standalone reference
        new RegExp(`\\b${tableNameLower.replace(/_/g, '_')}\\b`).test(queryLower)
      );
      return hasMatch && isQueryValid(q);
    });
    
    // Priority 2: Entity name explicitly in title (e.g., "Table" in title for TABLE_ENTITY)
    if (!matchedQuery) {
      matchedQuery = allQueries.find(q => {
        const titleLower = q.title.toLowerCase();
        // Match singular entity name (e.g., "Column" for Column entity, "Table" for Table)
        const hasMatch = (
          titleLower.includes(entityNameLower) ||
          titleLower.includes(entityNameLower + 's') || // plural
          titleLower.includes(entityNameLower + ' ')
        );
        return hasMatch && isQueryValid(q);
      });
    }
    
    return matchedQuery || null;
  };

  // Open panel with highlighted query
  // State for loading columns
  const [loadingColumns, setLoadingColumns] = useState(false);

  const openQueryForEntity = async (entityName, tableName, exampleQuery) => {
    setShowQueries(true);
    
    // Priority 1: Generate a context-aware query using selected database and schema
    if (tableName && tableName !== '(abstract)') {
      setLoadingColumns(true);
      
      try {
        // Fetch real columns from Snowflake if connected
        const columns = await fetchTableColumns(
          selectedMDLHDatabase, 
          selectedMDLHSchema, 
          tableName
        );
        
        const dynamicQuery = generateEntityQuery(
          entityName, 
          tableName, 
          selectedMDLHDatabase, 
          selectedMDLHSchema,
          columns  // Pass fetched columns for smart selection
        );
        setHighlightedQuery(dynamicQuery);
      } catch (err) {
        appLog.error('Error fetching columns', { table: tableName, error: err.message });
        // Fallback to basic query
        const dynamicQuery = generateEntityQuery(
          entityName, 
          tableName, 
          selectedMDLHDatabase, 
          selectedMDLHSchema,
          null
        );
        setHighlightedQuery(dynamicQuery);
      } finally {
        setLoadingColumns(false);
      }
    } 
    // Priority 2: Use inline exampleQuery if no table
    else if (exampleQuery) {
      setHighlightedQuery(exampleQuery);
    } 
    // Priority 3: Find related query from exampleQueries
    else {
      const matchedQuery = findQueryForEntity(entityName, tableName);
      setHighlightedQuery(matchedQuery?.query || null);
    }
  };

  // Check if entity has a related query
  const hasQueryForEntity = (entityName, tableName, exampleQuery) => {
    if (exampleQuery) return true;
    if (!tableName || tableName === '(abstract)') return false;
    return findQueryForEntity(entityName, tableName) !== null;
  };

  const downloadCSV = () => {
    const cols = columns[activeTab];
    const header = cols.map(c => colHeaders[c]).join(',');
    const rows = filteredData.map(row => 
      cols.map(c => `"${(row[c] || '').toString().replace(/"/g, '""')}"`).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mdlh_${activeTab}_entities.csv`;
    a.click();
  };

  const downloadAllCSV = () => {
    Object.keys(data).forEach(tabId => {
      const cols = columns[tabId];
      const header = cols.map(c => colHeaders[c]).join(',');
      const rows = data[tabId].map(row => 
        cols.map(c => `"${(row[c] || '').toString().replace(/"/g, '""')}"`).join(',')
      );
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mdlh_${tabId}_entities.csv`;
      a.click();
    });
  };

  return (
    <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
    <LearningModeProvider>
    <SystemConfigProvider>
    <div className="min-h-screen bg-white text-gray-900">
      {/* Demo Mode Banner */}
      {IS_DEMO && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 text-center text-sm font-medium">
          <span className="inline-flex items-center gap-2">
            <Sparkles size={16} />
            <span>Demo Mode - Explore the MDLH Dictionary interface with sample data</span>
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded text-xs">No backend required</span>
          </span>
        </div>
      )}

      {/* Navigation Bar - DuckDB style: clean white, minimal */}
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-30">
        <div className="max-w-full mx-auto px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <AtlanIcon size={28} />
            <span className="font-semibold text-lg text-gray-900">MDLH</span>
          </div>
          
          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Search - DuckDB style: simple input with icon */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-48 pl-9 pr-14 py-2 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all placeholder-gray-500"
              />
              <button
                type="button"
                onClick={() => setIsCmdOpen(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-[10px] text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono hover:border-gray-300 transition-colors"
              >
                <Command size={10} />
                <span>K</span>
              </button>
            </div>
            
            {/* Connection Indicator - hidden in demo mode */}
            {!IS_DEMO && (
              <ConnectionIndicator
                status={globalConnectionStatus}
                loading={globalConnectionLoading}
                onClick={() => setShowConnectionModal(true)}
                database={selectedMDLHDatabase}
                schema={selectedMDLHSchema}
              />
            )}
            {IS_DEMO && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs text-amber-700">
                <span className="font-medium">Demo Mode</span>
                <span className="text-amber-500">|</span>
                <span>ACME Analytics</span>
              </div>
            )}

            {/* Learning/Training buttons - shown in demo mode */}
            {IS_DEMO && (
              <div className="flex items-center gap-1 ml-2">
                <LearningModeToggle variant="compact" />
                <button
                  onClick={() => setShowGlossary(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                  title="MDLH Glossary"
                >
                  <Book size={16} />
                </button>
                <button
                  onClick={() => setShowQueryTips(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Query Tips"
                >
                  <HelpCircle size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Unreachable Banner - shown when backend is down (hidden in demo mode) */}
      {!IS_DEMO && globalConnectionStatus?.unreachable && (
        <UnreachableBanner onRetry={globalTestConnection} />
      )}

      {/* Hero Section - DuckDB style: white bg, bold headlines, blue highlights */}
      <div className="mx-6 mt-8 mb-6">
        <div className="max-w-4xl">
          {/* Headline with highlighted keyword */}
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight">
            MDLH is a{' '}
            <span className="bg-[#3366FF] text-white px-2 rounded">metadata</span>{' '}
            dictionary
          </h1>
          <p className="text-lg text-slate-600 mt-4 max-w-2xl">
            Explore MDLH entity types, tables, attributes, and example queries using DuckDB's feature-rich SQL dialect
          </p>
          
          {/* Action buttons - DuckDB style: dark primary, white secondary, text tertiary */}
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              onClick={() => {
                setHighlightedQuery(null);
                setShowQueries(true);
              }}
              className="px-5 py-2.5 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <Code2 size={14} />
              View All Queries
            </button>
            <button
              onClick={downloadCSV}
              className="px-5 py-2.5 bg-white text-gray-700 border border-gray-300 rounded-full text-sm font-medium hover:border-gray-400 transition-colors flex items-center gap-2"
            >
              <Download size={14} />
              Export Tab
            </button>
            <button
              onClick={downloadAllCSV}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-2"
            >
              <Download size={14} />
              Export All
            </button>
          </div>
          
          {/* Database & Schema Selector - cleaner DuckDB style */}
          <div className="flex flex-wrap items-center gap-3 mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-slate-400" />
              <span className="text-sm text-slate-500">Context:</span>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                <select
                  value={selectedMDLHDatabase}
                  onChange={(e) => setSelectedMDLHDatabase(e.target.value)}
                  className="px-2.5 py-1 bg-white text-slate-800 border-0 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer shadow-sm"
                >
                  {MDLH_DATABASES.map(db => (
                    <option key={db.name} value={db.name}>
                      {db.name}
                    </option>
                  ))}
                </select>
                <span className="text-slate-400 px-0.5">.</span>
                <select
                  value={selectedMDLHSchema}
                  onChange={(e) => setSelectedMDLHSchema(e.target.value)}
                  className="px-2.5 py-1 bg-white text-slate-800 border-0 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-300 cursor-pointer shadow-sm"
                >
                  {MDLH_SCHEMAS.map(sch => (
                    <option key={sch} value={sch}>
                      {sch}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Connection status - cleaner pills */}
            {isConnected && discoveredTables.size > 0 ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-full font-medium">
                  <Check size={12} />
                  <span>{discoveredTables.size} tables · {availableEntities}/{totalEntities} queryable</span>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyAvailable}
                    onChange={(e) => setShowOnlyAvailable(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Only queryable</span>
                </label>
              </div>
            ) : isConnected ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                {isDiscovering ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span>Discovering tables in {selectedMDLHDatabase}.{selectedMDLHSchema}…</span>
                  </>
                ) : (
                  <>
                    <Database size={12} />
                    <span>No tables in {selectedMDLHDatabase}.{selectedMDLHSchema}</span>
                  </>
                )}
              </div>
            ) : (
              <button 
                onClick={() => setShowConnectionModal(true)}
                className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors cursor-pointer font-medium"
              >
                <Snowflake size={12} />
                <span>Connect to Snowflake</span>
              </button>
            )}
          </div>
          
          {/* DB warning as Callout */}
          {dbWarning && (
            <div className="mt-4">
              <Callout type="warning">
                {dbWarning} – verify the table exists before running this query.
              </Callout>
            </div>
          )}
        </div>
      </div>

      {/* Discovery Cards - "What do you want to know?" - shown in demo mode */}
      {/* Now context-aware: filters cards based on active sidebar category */}
      {IS_DEMO && (
        <div className="mx-6 mb-6">
          <DiscoveryCards
            database={selectedMDLHDatabase}
            schema={selectedMDLHSchema}
            compact={true}
            sidebarCategory={activeTab !== 'editor' ? activeTab : null}
            maxCards={4}
            onSelectQuery={(sql) => {
              // Save current category before switching to editor
              if (activeTab !== 'editor') {
                setLastCategory(activeTab);
              }
              setEditorQuery(sql);
              setActiveTab('editor');
            }}
            onViewAllQueries={() => setShowQueries(true)}
            onExploreMore={() => {
              // Clear category filter to show all cards
              setActiveTab('core');
              setShowQueries(true);
            }}
          />
        </div>
      )}

      {/* Lineage is now available in the flyout panel - click the lineage icon in Query Editor toolbar */}

      {/* Main Layout with Left Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Category Navigation */}
        <CategorySidebar
          tabs={tabs}
          selectedId={activeTab}
          onSelect={setActiveTab}
          defaultCollapsed={false}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Not Connected Banner */}
          {!isConnected && !globalConnectionLoading && (
            <div className="mx-6 mt-4 mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Snowflake size={18} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Connect to Snowflake to unlock full features</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    See which MDLH tables exist, validate queries, and execute SQL directly
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowConnectionModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Snowflake size={14} />
                Connect
              </button>
            </div>
          )}

          {/* Main Content */}
          <div className={`flex-1 overflow-auto ${activeTab === 'editor' ? 'px-4 py-3' : 'px-6 py-6'}`}>
            {/* Editor Mode Header */}
            {activeTab === 'editor' && (
              <div className="flex items-center gap-3 mb-3">
                {/* Language tabs like DuckDB */}
                <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-100 rounded-xl">
                  <button className="px-3 py-1 text-xs font-medium bg-white text-slate-800 rounded-lg shadow-sm">
                    SQL
                  </button>
                  <button className="px-3 py-1 text-xs font-medium text-slate-400 rounded-lg cursor-not-allowed" disabled>
                    Python
                  </button>
                  <button className="px-3 py-1 text-xs font-medium text-slate-400 rounded-lg cursor-not-allowed" disabled>
                    R
                  </button>
                </div>

                <div className="h-5 w-px bg-slate-200" />

                {/* Quick switch back to dictionary */}
                <button
                  onClick={() => setActiveTab('core')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <Layers size={12} />
                  Dictionary
                </button>
              </div>
            )}
        
        {/* MDLH Context Header */}
        {activeTab !== 'editor' && (
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {tabs.find(t => t.id === activeTab)?.label}
              </h2>
              <span className="text-sm text-gray-500">
                {tabs.find(t => t.id === activeTab)?.description}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Database size={14} className="text-gray-400" />
              <span>MDLH context:</span>
              <span className="font-mono px-2 py-0.5 bg-gray-100 rounded text-gray-800">
                {selectedMDLHDatabase}.{selectedMDLHSchema}
              </span>
            </div>
          </div>
        )}

        {/* Conditional Content: Query Editor or Data Table */}
        {activeTab === 'editor' ? (
          <Suspense fallback={<LoadingFallback message="Loading query editor..." />}>
            <QueryEditor
              initialQuery={editorQuery}
              onOpenConnectionModal={() => setShowConnectionModal(true)}
              globalDatabase={selectedMDLHDatabase}
              globalSchema={selectedMDLHSchema}
              onDatabaseChange={setSelectedMDLHDatabase}
              onSchemaChange={setSelectedMDLHSchema}
              discoveredTables={discoveredTables}
              sampleEntities={sampleEntities}
              onOpenLineagePanel={handleOpenLineagePanel}
              lastCategory={lastCategory}
              onBackToCategory={handleBackToCategory}
            />
          </Suspense>
        ) : (
          <>
            {/* Filter bar - availability toggle */}
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-3">
                {/* Availability filter toggle */}
                <button
                  onClick={() => setShowOnlyAvailable(!showOnlyAvailable)}
                  disabled={!isConnected || discoveredTables.size === 0}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    showOnlyAvailable && isConnected && discoveredTables.size > 0
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                      : 'bg-gray-100 text-gray-600 border border-gray-200'
                  } ${!isConnected || discoveredTables.size === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:border-emerald-400'}`}
                  title={!isConnected ? 'Connect to Snowflake to filter by availability' : showOnlyAvailable ? 'Showing only queryable tables' : 'Show all tables'}
                >
                  {showOnlyAvailable && isConnected ? <Check size={14} /> : <Database size={14} />}
                  <span>{showOnlyAvailable ? 'Showing queryable only' : 'Show only queryable'}</span>
                </button>
                
                {/* Stats badges */}
                {isConnected && discoveredTables.size > 0 && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="px-2 py-1 bg-green-50 text-green-700 rounded-full">
                      {availableEntities} queryable
                    </span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
                      {totalEntities} total
                    </span>
                  </div>
                )}
              </div>
              
              {/* Discovery status */}
              {isDiscovering && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Discovering tables...</span>
                </div>
              )}
            </div>
            
            <div className="overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    {columns[activeTab]?.map(col => (
                      <th key={col} className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200 text-xs uppercase tracking-wider">
                        {colHeaders[col]}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 border-b border-gray-200 text-xs uppercase tracking-wider w-32">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.length > 0 ? (
                    filteredData.map((row, i) => (
                      <tr key={i} className="group hover:bg-blue-50/50 transition-colors duration-150">
                        {columns[activeTab]?.map(col => {
                          const cellValue = row[col];
                          const tableFqn = col === 'table' && cellValue && cellValue !== '(abstract)'
                            ? buildSafeFQN(selectedMDLHDatabase, selectedMDLHSchema, cellValue)
                            : null;
                          const preview = tableFqn ? lineagePreviewCache[tableFqn] : null;

                          return (
                            <td key={col} className="px-4 py-3 align-top">
                              {col === 'entity' ? (
                                <span className="inline-flex items-center">
                                  <span className="font-semibold text-[#3366FF]">{cellValue}</span>
                                  <CellCopyButton text={cellValue} />
                                </span>
                              ) : col === 'table' ? (
                                <div 
                                  className="relative inline-flex items-center gap-1.5"
                                  onMouseEnter={() => handleTableHover(cellValue)}
                                  onMouseLeave={clearTableHover}
                                >
                                  {/* Table availability indicator */}
                                  {cellValue === '(abstract)' ? (
                                    <span 
                                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs"
                                      title="This is an abstract concept with no direct table representation"
                                    >
                                      <span className="text-gray-400">⚬</span>
                                      Abstract
                                    </span>
                                  ) : (
                                    <>
                                      {isConnected && discoveredTables.size > 0 && (
                                        isTableAvailable(cellValue) ? (
                                          <span title="Table exists in MDLH" className="text-green-500">
                                            <Check size={14} />
                                          </span>
                                        ) : (
                                          <span title="Table not found in this database/schema" className="text-gray-400">
                                            <X size={14} />
                                          </span>
                                        )
                                      )}
                                      {isDiscovering && (
                                        <Loader2 size={14} className="animate-spin text-gray-400" />
                                      )}
                                      <span className={`font-mono px-2 py-0.5 rounded text-xs ${
                                        isTableAvailable(cellValue) === false
                                          ? 'text-gray-500 bg-gray-50'
                                          : 'text-emerald-600 bg-emerald-50'
                                      }`}>{cellValue}</span>
                                      <CellCopyButton text={cellValue} />
                                    </>
                                  )}

                                  {/* Hover lineage preview */}
                                  {hoveredTable === cellValue && (
                                    <div className="absolute left-0 top-full mt-2 z-30 w-[440px]">
                                      <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                          <div>
                                            <p className="text-xs font-semibold text-gray-800">
                                              Lineage preview (last 30 days)
                                            </p>
                                            <p className="text-[11px] text-gray-500 font-mono break-all">
                                              {tableFqn}
                                            </p>
                                          </div>
                                          {preview?.status === 'loading' && (
                                            <Loader2 size={14} className="text-blue-500 animate-spin" />
                                          )}
                                          {preview?.status === 'ready' && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                                              Ready
                                            </span>
                                          )}
                                        </div>

                                        {preview?.status === 'error' && (
                                          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                                            {preview.error}
                                          </div>
                                        )}

                                        {preview?.status === 'ready' && preview.graph?.nodes?.length > 0 && (
                                          <div className="border border-gray-100 rounded-lg overflow-hidden">
                                            <Suspense fallback={<LoadingFallback message="Loading lineage..." />}>
                                              <LineageRail
                                                nodes={preview.graph.nodes}
                                                edges={preview.graph.edges}
                                                metadata={preview.graph.metadata}
                                                title="Lineage"
                                              />
                                            </Suspense>
                                          </div>
                                        )}

                                        {preview?.status === 'ready' && (!preview.graph?.nodes?.length) && (
                                          <p className="text-xs text-gray-500">
                                            No lineage edges found for this asset.
                                          </p>
                                        )}

                                        {!preview && (
                                          <p className="text-xs text-gray-500">Preparing lineage preview…</p>
                                        )}

                                        <div className="bg-gray-50 border border-gray-100 rounded p-2">
                                          <p className="text-[10px] text-gray-500 mb-1 font-medium">SQL used</p>
                                          <pre className="text-[10px] text-gray-800 font-mono whitespace-pre-wrap">
                                            {(preview && preview.query) || (tableFqn ? buildLineagePreviewQuery(tableFqn) : '')}
                                          </pre>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : col === 'exampleQuery' ? (
                                <span className="inline-flex items-center">
                                  <code className="text-gray-600 bg-gray-100 px-2 py-0.5 rounded text-xs break-all">{cellValue}</code>
                                  {cellValue && <CellCopyButton text={cellValue} />}
                                </span>
                              ) : (
                                <span className="text-gray-600">{cellValue}</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center gap-1">
                            {/* View/Test Query button */}
                            <PlayQueryButton 
                              hasQuery={hasQueryForEntity(row.entity, row.table, row.exampleQuery)}
                              onClick={() => openQueryForEntity(row.entity, row.table, row.exampleQuery)}
                              tableAvailable={isTableAvailable(row.table)}
                              isConnected={isConnected}
                            />
                            {/* Recommended Queries button */}
                            {row.table && row.table !== '(abstract)' && (
                              <button
                                onClick={() => {
                                  setSelectedEntity({
                                    entity: row.entity,
                                    table: row.table,
                                    entityType: row.entityType || 'TABLE',
                                    description: row.description
                                  });
                                  setShowRecommendations(true);
                                }}
                                className="opacity-0 group-hover:opacity-100 px-2 py-1 rounded text-xs font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 transition-all flex items-center gap-1"
                                title="Show recommended queries for this entity"
                              >
                                <Zap size={12} />
                                <span className="hidden lg:inline">Recommend</span>
                              </button>
                            )}
                            {/* Copy table name - only for non-abstract */}
                            {row.table && row.table !== '(abstract)' && (
                              <button
                                onClick={() => navigator.clipboard.writeText(row.table)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                                title="Copy table name"
                              >
                                <Copy size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={(columns[activeTab]?.length || 0) + 1} className="px-4 py-12 text-center">
                        {isConnected && showOnlyAvailable && discoveredTables.size > 0 ? (
                          <>
                            <Database size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-gray-600 font-medium">No queryable tables found</p>
                            <p className="text-gray-400 text-sm mt-1">
                              No tables for this category exist in {selectedMDLHDatabase}.{selectedMDLHSchema}
                            </p>
                            <button
                              onClick={() => setShowOnlyAvailable(false)}
                              className="mt-3 text-sm text-blue-600 hover:text-blue-700"
                            >
                              Show all entities
                            </button>
                          </>
                        ) : (
                          <>
                            <Search size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-gray-600 font-medium">No results found</p>
                            <p className="text-gray-400 text-xs mt-1">Try adjusting your search terms</p>
                          </>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing <span className="text-gray-900 font-medium">{filteredData.length}</span> of <span className="text-gray-900 font-medium">{data[activeTab]?.length || 0}</span> entities in <span className="text-[#3366FF] font-medium">{tabs.find(t => t.id === activeTab)?.label}</span>
              </p>
              <p className="text-sm text-gray-400">
                Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-gray-600 font-mono text-xs">⌘K</kbd> to search • Click <span className="text-[#3366FF]">Query</span> buttons for SQL examples
              </p>
            </div>
          </>
        )}
        </div>
      </div>
    </div>

      {/* Query Side Panel */}
      <QueryPanel 
        isOpen={showQueries} 
        onClose={() => {
          setShowQueries(false);
          setHighlightedQuery(null);
        }} 
        queries={filteredQueries}
        categoryLabel={tabs.find(t => t.id === activeTab)?.label}
        highlightedQuery={highlightedQuery}
        onRunInEditor={openInEditor}
        isLoading={loadingColumns}
        discoveredTables={discoveredTables}
        isConnected={isConnected}
        batchValidationResults={batchValidationResults}
        onShowMyWork={handleShowMyWork}
        isBatchValidating={isBatchValidating}
        selectedDatabase={selectedMDLHDatabase}
        selectedSchema={selectedMDLHSchema}
        queryValidationMap={queryValidationMap}
        onValidateAll={runBatchValidation}
        onOpenConnectionModal={() => setShowConnectionModal(true)}
      />
      
      {/* Lineage Flyout Panel */}
      <QueryPanelShell
        isOpen={showLineageFlyout}
        onClose={() => setShowLineageFlyout(false)}
        maxWidth="max-w-4xl"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-white flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {selectedLineageEntity?.NAME || selectedLineageEntity?.name 
                ? `Lineage for ${selectedLineageEntity.NAME || selectedLineageEntity.name}`
                : 'Lineage'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {selectedLineageEntity?.GUID || selectedLineageEntity?.guid 
                ? `GUID: ${(selectedLineageEntity.GUID || selectedLineageEntity.guid).slice(0, 20)}...`
                : 'Select an entity from query results to view its lineage'}
            </p>
          </div>
          <button
            onClick={() => {
              setShowLineageFlyout(false);
              setSelectedLineageEntity(null);
            }}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={<LoadingFallback message="Loading lineage panel..." />}>
            <LineagePanel
              isConnected={isConnected}
              database={selectedMDLHDatabase || DEFAULT_DATABASE}
              schema={selectedMDLHSchema || DEFAULT_SCHEMA}
              editorQuery={editorQuery}
              lineageData={dynamicLineage}
              loading={lineageLoading}
              error={lineageError}
              currentTable={selectedLineageEntity?.NAME || selectedLineageEntity?.name || lineageCurrentTable}
              selectedEntity={selectedLineageEntity}
              onRefresh={refetchLineage}
              onNodeClick={handleLineageNodeClick}
              lineageSource={lineageSource}
              onSourceChange={handleLineageSourceChange}
              snowflakeLineageData={snowflakeLineageData}
              snowflakeLoading={snowflakeLineageLoading}
              snowflakeError={snowflakeLineageError}
            />
          </Suspense>
        </div>
      </QueryPanelShell>

      {/* Global Connection Modal - hidden in demo mode */}
      {!IS_DEMO && (
        <ConnectionModal
          isOpen={showConnectionModal}
          onClose={() => setShowConnectionModal(false)}
          onConnect={handleGlobalConnectionSuccess}
          currentStatus={globalConnectionStatus}
        />
      )}
      
      {/* Show My Work Modal */}
      <Suspense fallback={null}>
        <ShowMyWork
          isOpen={!!showMyWorkQuery}
          onClose={() => {
            setShowMyWorkQuery(null);
            setShowMyWorkValidation(null);
          }}
          query={showMyWorkQuery}
          validationResult={showMyWorkValidation}
          onRunQuery={(sql) => {
            openInEditor(sql);
            setShowMyWorkQuery(null);
            setShowMyWorkValidation(null);
          }}
          onRunSuggestedQuery={(sql) => {
            openInEditor(sql);
            setShowMyWorkQuery(null);
            setShowMyWorkValidation(null);
          }}
        />
      </Suspense>

      {/* Recommended Queries Panel */}
      <Suspense fallback={null}>
        <RecommendedQueries
        entity={selectedEntity}
        entityContext={{
          database: selectedMDLHDatabase,
          schema: selectedMDLHSchema,
          table: selectedEntity?.table,
          entityType: selectedEntity?.entityType
        }}
        isOpen={showRecommendations}
        onClose={() => {
          setShowRecommendations(false);
          setSelectedEntity(null);
        }}
        onRunQuery={(sql, query) => {
          openInEditor(sql);
          setShowRecommendations(false);
          setSelectedEntity(null);
        }}
        database={selectedMDLHDatabase}
        schema={selectedMDLHSchema}
        availableTables={[...discoveredTables]}
        sampleEntities={sampleEntities}
      />
      </Suspense>

      {/* Command Palette (⌘K / Ctrl+K) */}
      <CommandPalette open={isCmdOpen} onOpenChange={setIsCmdOpen} />

      {/* Training/UX Enhancement Modals - Demo Mode */}
      {IS_DEMO && (
        <>
          {/* First-visit Onboarding Modal */}
          <OnboardingModal
            isOpen={showOnboarding}
            onClose={() => setShowOnboarding(false)}
            onComplete={(role) => {
              setUserRole(role);
              setShowOnboarding(false);
            }}
          />

          {/* MDLH Glossary Modal */}
          <MDLHGlossary
            isOpen={showGlossary}
            onClose={() => setShowGlossary(false)}
          />

          {/* Query Tips Panel */}
          {showQueryTips && (
            <div className="fixed bottom-6 right-6 z-40 w-96 max-h-[70vh] overflow-hidden">
              <QueryTips
                isOpen={showQueryTips}
                onClose={() => setShowQueryTips(false)}
              />
            </div>
          )}
        </>
      )}
    </div>
    </SystemConfigProvider>
    </LearningModeProvider>
    </ErrorBoundary>
  );
}
