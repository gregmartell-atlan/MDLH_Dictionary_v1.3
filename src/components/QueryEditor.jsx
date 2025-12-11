/**
 * Query Editor - Three-panel SQL workspace
 * Clean, dense UI for metadata exploration
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play, Square, Trash2, History, Settings,
  Check, X, Loader2, Database, Clock, Copy,
  Wifi, WifiOff, PanelLeft, PanelLeftClose,
  ChevronDown, ChevronRight, Layers, AlertTriangle,
  Lightbulb, Sparkles, Table2, Columns, Hash,
  Calendar, Type, ToggleLeft, GripVertical,
  Search, Filter, BarChart3, PieChart, Zap,
  GitBranch, BookOpen, Shield, TrendingUp, ExternalLink,
  ArrowUpRight, ArrowDownRight, MoreHorizontal, Eye, PanelRightOpen,
  Tag, FileText, User, Users, LayoutDashboard, ArrowLeft
} from 'lucide-react';
import ResultsTable from './ResultsTable';
import { CATEGORY_INFO } from './DiscoveryCards';
import { useConnection, useQuery, useQueryHistory, useMetadata, usePreflight } from '../hooks/useSnowflake';
import { createLogger } from '../utils/logger';
import { buildSafeFQN, escapeStringValue } from '../utils/queryHelpers';

const log = createLogger('QueryEditor');

// =============================================================================
// ROW ACTION BAR - Enhanced hover actions for entity rows
// =============================================================================

function RowActionBar({ rowGuid, rowName, rowData, database, schema, onOpenLineage, onRunQuery, onExplore }) {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(rowGuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Build lineage queries for this specific entity
  const upstreamQuery = `-- Upstream lineage: What feeds into ${rowName || 'this asset'}
SELECT DISTINCT
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    p."TYPENAME" AS process_type
FROM ${database}.${schema}.PROCESS_ENTITY p,
LATERAL FLATTEN(INPUT => p."OUTPUTS", OUTER => FALSE) f
WHERE f.value::VARCHAR ILIKE '%${rowGuid}%'
LIMIT 50;`;

  const downstreamQuery = `-- Downstream lineage: What ${rowName || 'this asset'} feeds into
SELECT DISTINCT
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    p."TYPENAME" AS process_type
FROM ${database}.${schema}.PROCESS_ENTITY p,
LATERAL FLATTEN(INPUT => p."INPUTS", OUTER => FALSE) f
WHERE f.value::VARCHAR ILIKE '%${rowGuid}%'
LIMIT 50;`;

  const columnsQuery = `-- Columns for ${rowName || 'this table'}
SELECT
    c."NAME" AS column_name,
    c."DATATYPE" AS data_type,
    c."DESCRIPTION",
    c."ISPRIMARYKEY",
    c."ORDER"
FROM ${database}.${schema}.COLUMN_ENTITY c
WHERE c."TABLEQUN" ILIKE '%${rowGuid}%'
   OR c."TABLEQUN" ILIKE '%${rowName || ''}%'
ORDER BY c."ORDER"
LIMIT 100;`;

  return (
    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-150 pointer-events-none group-hover:pointer-events-auto z-20">
      <div className="flex items-center gap-0.5 px-1.5 py-1 bg-white rounded-lg shadow-lg border border-gray-200">
        {/* Primary action: View Lineage Graph */}
        <button
          onClick={(e) => { e.stopPropagation(); onOpenLineage(); }}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50 rounded transition-colors"
          title="View lineage graph"
        >
          <GitBranch size={14} />
          <span>Lineage</span>
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-200" />

        {/* Quick lineage queries */}
        <button
          onClick={(e) => { e.stopPropagation(); onRunQuery(upstreamQuery); }}
          className="flex items-center gap-1 px-1.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title="Query upstream assets"
        >
          <ArrowDownRight size={12} className="rotate-180" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onRunQuery(downstreamQuery); }}
          className="flex items-center gap-1 px-1.5 py-1 text-xs text-green-600 hover:bg-green-50 rounded transition-colors"
          title="Query downstream assets"
        >
          <ArrowDownRight size={12} />
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-gray-200" />

        {/* Explore in side panel */}
        <button
          onClick={(e) => { e.stopPropagation(); onExplore(); }}
          className="flex items-center gap-1 px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="Explore in side panel"
        >
          <PanelRightOpen size={12} />
        </button>

        {/* Copy GUID */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded transition-colors"
          title="Copy GUID"
        >
          {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
        </button>

        {/* More menu */}
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            className="flex items-center px-1 py-1 text-xs text-gray-400 hover:bg-gray-100 rounded transition-colors"
            title="More actions"
          >
            <MoreHorizontal size={12} />
          </button>

          {showMenu && (
            <div
              className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-30"
              onMouseLeave={() => setShowMenu(false)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); onRunQuery(columnsQuery); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                <Columns size={12} />
                <span>View Columns</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const fullQuery = `-- Full details for ${rowName}\nSELECT * FROM ${database}.${schema}.TABLE_ENTITY WHERE "GUID" = '${rowGuid}' LIMIT 1;`;
                  onRunQuery(fullQuery);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                <Eye size={12} />
                <span>View Full Record</span>
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(rowName || '');
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                <Copy size={12} />
                <span>Copy Name</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`https://atlan.com/asset/${rowGuid}`, '_blank');
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink size={12} />
                <span>Open in Atlan</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// QUERY SUGGESTIONS - Dropdown with ready-to-run queries
// =============================================================================

/**
 * Builds suggested queries with REAL values (no placeholders!)
 * Uses sample entities to populate GUIDs, table names, etc.
 */
function buildSuggestedQueries(database, schema, discoveredTables, sampleEntities) {
  if (!database || !schema || !discoveredTables?.size || !sampleEntities?.loaded) {
    return [];
  }

  const queries = [];
  const tables = [...discoveredTables];
  
  // Helper to get a real GUID from samples
  const getGuid = (type) => {
    const rows = sampleEntities[type];
    if (!rows || rows.length === 0) return null;
    const guidKey = Object.keys(rows[0]).find(k => k.toUpperCase() === 'GUID');
    return guidKey ? rows[0][guidKey] : null;
  };

  // Helper to get a real name from samples  
  const getName = (type) => {
    const rows = sampleEntities[type];
    if (!rows || rows.length === 0) return null;
    const nameKey = Object.keys(rows[0]).find(k => k.toUpperCase() === 'NAME');
    return nameKey ? rows[0][nameKey] : null;
  };

  // Find entity tables
  const tableEntity = tables.find(t => t.includes('TABLE') && t.includes('ENTITY') && !t.includes('TABLEAU'));
  const columnEntity = tables.find(t => t.includes('COLUMN') && t.includes('ENTITY'));
  const processEntity = tables.find(t => t.includes('PROCESS') && t.includes('ENTITY'));
  const glossaryTermEntity = tables.find(t => t.includes('GLOSSARYTERM'));
  const glossaryEntity = tables.find(t => t.includes('GLOSSARY') && !t.includes('TERM') && !t.includes('CATEGORY') && t.includes('ENTITY'));

  // Get real sample values
  const tableGuid = getGuid('tables');
  const tableName = getName('tables');
  const columnGuid = getGuid('columns');
  const processGuid = getGuid('processes');
  const glossaryGuid = getGuid('glossaries');
  const termGuid = getGuid('terms');

  // 1. Popular Tables Query (always available if we have TABLE_ENTITY)
  if (tableEntity) {
    const fqn = buildSafeFQN(database, schema, tableEntity);
    queries.push({
      id: 'popular_tables',
      label: 'Popular Tables',
      description: 'Tables ranked by usage',
      icon: TrendingUp,
      category: 'structure',
      sql: `-- Most popular tables in your environment
SELECT 
    NAME,
    TYPENAME,
    POPULARITYSCORE,
    QUERYCOUNT,
    STATUS
FROM ${fqn}
WHERE POPULARITYSCORE > 0
ORDER BY POPULARITYSCORE DESC
LIMIT 25;`
    });
  }

  // 2. Find by GUID (only if we have a real GUID)
  if (tableEntity && tableGuid) {
    const fqn = buildSafeFQN(database, schema, tableEntity);
    queries.push({
      id: 'find_by_guid',
      label: 'Find by GUID',
      description: `Lookup: ${tableName || 'entity'}`,
      icon: Search,
      category: 'lookup',
      sql: `-- Find asset by GUID
SELECT *
FROM ${fqn}
WHERE GUID = ${escapeStringValue(tableGuid)}
LIMIT 1;`
    });
  }

  // 3. Upstream Lineage (only if we have process table AND a real GUID)
  if (processEntity && tableGuid) {
    const fqn = buildSafeFQN(database, schema, processEntity);
    queries.push({
      id: 'upstream_lineage',
      label: 'Upstream Lineage',
      description: 'What feeds into this asset',
      icon: GitBranch,
      category: 'lineage',
      sql: `-- Upstream lineage (what feeds into this asset)
SELECT DISTINCT
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    p."INPUTS" AS upstream_assets,
    p."OUTPUTS" AS downstream_assets
FROM ${fqn} p,
LATERAL FLATTEN(INPUT => p."OUTPUTS", OUTER => FALSE) f
WHERE f.value::VARCHAR ILIKE '%' || ${escapeStringValue(tableGuid)} || '%'
LIMIT 50;`
    });
  }

  // 4. Downstream Lineage
  if (processEntity && tableGuid) {
    const fqn = buildSafeFQN(database, schema, processEntity);
    queries.push({
      id: 'downstream_lineage',
      label: 'Downstream Lineage', 
      description: 'What this asset feeds',
      icon: GitBranch,
      category: 'lineage',
      sql: `-- Downstream lineage (what this asset feeds into)
SELECT DISTINCT
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    p."INPUTS" AS upstream_assets,
    p."OUTPUTS" AS downstream_assets
FROM ${fqn} p,
LATERAL FLATTEN(INPUT => p."INPUTS", OUTER => FALSE) f
WHERE f.value::VARCHAR ILIKE '%' || ${escapeStringValue(tableGuid)} || '%'
LIMIT 50;`
    });
  }

  // 5. Glossary Terms (only if we have glossary entity AND a real glossary GUID)
  if (glossaryTermEntity && glossaryGuid) {
    const fqn = buildSafeFQN(database, schema, glossaryTermEntity);
    queries.push({
      id: 'glossary_terms',
      label: 'Glossary Terms',
      description: 'Terms in glossary',
      icon: BookOpen,
      category: 'glossary',
      sql: `-- Terms in a specific glossary
-- ANCHOR is an OBJECT - use :guid::STRING ILIKE for matching
SELECT 
    "GUID",
    "NAME",
    "USERDESCRIPTION",
    "STATUS"
FROM ${fqn}
WHERE "ANCHOR":guid::STRING ILIKE '%' || ${escapeStringValue(glossaryGuid)} || '%'
ORDER BY "NAME"
LIMIT 100;`
    });
  }

  // 6. Certified Assets
  if (tableEntity) {
    const fqn = buildSafeFQN(database, schema, tableEntity);
    queries.push({
      id: 'certified_assets',
      label: 'Certified Assets',
      description: 'Verified tables',
      icon: Shield,
      category: 'governance',
      sql: `-- Certified assets with certificate message
SELECT 
    NAME,
    TYPENAME,
    CERTIFICATESTATUSMESSAGE,
    CERTIFICATEUPDATEDBY,
    CERTIFICATEUPDATEDAT
FROM ${fqn}
WHERE CERTIFICATESTATUSMESSAGE IS NOT NULL
ORDER BY CERTIFICATEUPDATEDAT DESC
LIMIT 50;`
    });
  }

  // 7. Row Count
  if (tableEntity) {
    const fqn = buildSafeFQN(database, schema, tableEntity);
    queries.push({
      id: 'row_count',
      label: 'Table Count',
      description: 'Total tables',
      icon: Hash,
      category: 'structure',
      sql: `-- Count of all tables
SELECT COUNT(*) AS total_tables
FROM ${fqn};`
    });
  }

  // 8. Column Analysis (if we have column entity)
  if (columnEntity) {
    const fqn = buildSafeFQN(database, schema, columnEntity);
    queries.push({
      id: 'column_types',
      label: 'Column Types',
      description: 'Data type distribution',
      icon: Columns,
      category: 'structure',
      sql: `-- Column data type distribution
SELECT 
    DATATYPE,
    COUNT(*) AS column_count
FROM ${fqn}
GROUP BY DATATYPE
ORDER BY column_count DESC
LIMIT 20;`
    });
  }

  return queries;
}

/**
 * Query Suggestions Dropdown
 * Shows ready-to-run queries with REAL values (no placeholders!)
 */
function QuerySuggestionsDropdown({
  database,
  schema,
  discoveredTables,
  sampleEntities,
  onSelectQuery,
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const queries = useMemo(() => 
    buildSuggestedQueries(database, schema, discoveredTables, sampleEntities),
    [database, schema, discoveredTables, sampleEntities]
  );

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (query) => {
    onSelectQuery?.(query.sql);
    setIsOpen(false);
  };

  // Group queries by category
  const groupedQueries = useMemo(() => {
    const groups = {};
    queries.forEach(q => {
      if (!groups[q.category]) groups[q.category] = [];
      groups[q.category].push(q);
    });
    return groups;
  }, [queries]);

  const categoryLabels = {
    structure: 'Structure',
    lookup: 'Lookup',
    lineage: 'Lineage',
    glossary: 'Glossary',
    governance: 'Governance'
  };

  if (queries.length === 0) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
        title="Loading sample data..."
      >
        <Loader2 size={12} className="animate-spin" />
        <span>Loading queries...</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        title="Suggested queries with real data"
      >
        <Zap size={12} className="text-gray-500" />
        <span>SQL query</span>
        <ChevronDown size={12} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
              <Sparkles size={12} className="text-gray-500" />
              Ready-to-Run Queries
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Pre-populated with real data from your scan
            </div>
          </div>

          {/* Query List */}
          <div className="max-h-80 overflow-y-auto">
            {Object.entries(groupedQueries).map(([category, categoryQueries]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  {categoryLabels[category] || category}
                </div>
                {categoryQueries.map((query) => {
                  const Icon = query.icon;
                  return (
                    <button
                      key={query.id}
                      onClick={() => handleSelect(query)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors group"
                    >
                      <Icon size={14} className="text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 group-hover:text-gray-900">
                          {query.label}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {query.description}
                        </div>
                      </div>
                      <Check size={12} className="text-emerald-500 opacity-0 group-hover:opacity-100" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 flex items-center gap-1">
            <Check size={10} className="text-emerald-500" />
            All queries use real GUIDs from your database
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// TABLE SELECTOR - Smart filters and quick actions
// =============================================================================

// Table category detection for smart filtering
const TABLE_CATEGORIES = {
  ENTITY: { pattern: /_ENTITY$/, label: 'Entity', color: 'violet' },
  RELATIONSHIP: { pattern: /RELATIONSHIP|_REL$/, label: 'Rel', color: 'blue' },
  GLOSSARY: { pattern: /GLOSSARY|TERM|CATEGORY/, label: 'Glossary', color: 'emerald' },
  LINEAGE: { pattern: /PROCESS|LINEAGE/, label: 'Lineage', color: 'amber' },
  BI: { pattern: /TABLEAU|POWERBI|LOOKER|SIGMA/, label: 'BI', color: 'pink' },
  DATA: { pattern: /TABLE|COLUMN|SCHEMA|DATABASE/, label: 'Data', color: 'cyan' },
};

function getTableCategory(tableName) {
  for (const [key, config] of Object.entries(TABLE_CATEGORIES)) {
    if (config.pattern.test(tableName)) {
      return { key, ...config };
    }
  }
  return { key: 'OTHER', label: 'Other', color: 'gray' };
}

function TableSelector({
  database,
  schema,
  discoveredTables,
  onInsertTable,
  onPreviewTable,
  onViewLineage,
  onGenerateSelect,
  onDescribeTable,
  disabled = false,
  tableMetadata = {} // Optional: { TABLE_NAME: { rowCount, queryCount, popularity } }
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all, popular, recent, entity
  const [sortBy, setSortBy] = useState('alpha'); // alpha, popular, rows
  const [contextMenu, setContextMenu] = useState(null); // { x, y, table }
  const dropdownRef = useRef(null);
  const contextMenuRef = useRef(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  // Context menu handlers
  const handleContextMenu = (e, table) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, table });
  };

  const handleCopyName = (name, asFqn = false) => {
    const text = asFqn ? `${database}.${schema}.${name}` : name;
    navigator.clipboard.writeText(text);
    setContextMenu(null);
  };
  
  // Convert Set to array with metadata
  const tables = useMemo(() => {
    if (!discoveredTables || discoveredTables.size === 0) return [];
    return [...discoveredTables]
      .map(name => ({
        name,
        fqn: `${database}.${schema}.${name}`,
        category: getTableCategory(name),
        meta: tableMetadata[name] || {},
        // Infer popularity from table name patterns
        isPopular: /^(TABLE_ENTITY|COLUMN_ENTITY|PROCESS_ENTITY|ATLASGLOSSARY)/.test(name),
        isCore: /_ENTITY$/.test(name) && !/RELATIONSHIP/.test(name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [discoveredTables, database, schema, tableMetadata]);
  
  // Filter and sort tables
  const filteredTables = useMemo(() => {
    let result = tables;
    
    // Search filter
    if (search) {
      const term = search.toLowerCase();
      result = result.filter(t => 
        t.name.toLowerCase().includes(term) ||
        t.category.label.toLowerCase().includes(term)
      );
    }
    
    // Category filter
    switch (activeFilter) {
      case 'popular':
        result = result.filter(t => t.isPopular || (t.meta.queryCount > 0));
        break;
      case 'entity':
        result = result.filter(t => t.isCore);
        break;
      case 'bi':
        result = result.filter(t => t.category.key === 'BI');
        break;
      case 'glossary':
        result = result.filter(t => t.category.key === 'GLOSSARY');
        break;
    }
    
    // Sort
    switch (sortBy) {
      case 'popular':
        result = [...result].sort((a, b) => (b.meta.queryCount || 0) - (a.meta.queryCount || 0));
        break;
      case 'rows':
        result = [...result].sort((a, b) => (b.meta.rowCount || 0) - (a.meta.rowCount || 0));
        break;
      default:
        // Keep alphabetical
        break;
    }
    
    return result;
  }, [tables, search, activeFilter, sortBy]);
  
  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleSelect = (table) => {
    onInsertTable?.(table.fqn, table.name);
    setIsOpen(false);
    setSearch('');
  };
  
  // Category badge colors
  const badgeColors = {
    violet: 'bg-gray-100 text-gray-700 border-gray-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    amber: 'bg-gray-100 text-gray-600 border-gray-200',
    pink: 'bg-gray-100 text-gray-600 border-gray-200',
    cyan: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  
  if (tables.length === 0) {
    return (
      <button
        disabled
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed"
        title="No tables discovered"
      >
        <Table2 size={14} />
        <span>No tables</span>
      </button>
    );
  }
  
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        title="Insert table name (FQN)"
      >
        <Table2 size={14} className="text-gray-500" />
        <span>Tables</span>
        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded-md text-xs font-semibold">
          {tables.length}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-96 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header with Search */}
          <div className="p-3 bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search tables..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-gray-400 bg-white"
                autoFocus
              />
            </div>
            
            {/* Filter Pills */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {[
                { id: 'all', label: 'All', icon: Layers },
                { id: 'popular', label: 'Popular', icon: BarChart3 },
                { id: 'entity', label: 'Core Entities', icon: Database },
                { id: 'glossary', label: 'Glossary', icon: Type },
                { id: 'bi', label: 'BI Tools', icon: PieChart },
              ].map(filter => (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-all ${
                    activeFilter === filter.id
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <filter.icon size={12} />
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Table List */}
          <div className="max-h-80 overflow-y-auto">
            {filteredTables.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No tables match your filters
              </div>
            ) : (
              <div className="p-1.5">
                {filteredTables.map((table) => (
                  <div
                    key={table.name}
                    onClick={() => handleSelect(table)}
                    onContextMenu={(e) => handleContextMenu(e, table)}
                    onMouseEnter={() => {}}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-100 rounded-lg transition-colors group cursor-pointer"
                  >
                    <Table2 size={14} className="text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm truncate">
                          {table.name}
                        </span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${badgeColors[table.category.color]}`}>
                          {table.category.label}
                        </span>
                        {table.isPopular && (
                          <Sparkles size={12} className="text-emerald-500" title="Popular table" />
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate font-mono mt-0.5">
                        {table.fqn}
                      </div>
                      {/* Metadata row if available */}
                      {(table.meta.rowCount || table.meta.queryCount) && (
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                          {table.meta.rowCount && (
                            <span className="flex items-center gap-0.5">
                              <Hash size={10} />
                              {table.meta.rowCount.toLocaleString()} rows
                            </span>
                          )}
                          {table.meta.queryCount && (
                            <span className="flex items-center gap-0.5">
                              <BarChart3 size={10} />
                              {table.meta.queryCount} queries
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Quick action buttons - visible on hover */}
                    <div className="flex items-center gap-1 ml-auto opacity-50 group-hover:opacity-100 transition-opacity bg-white/80 rounded-lg px-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPreviewTable?.(table.fqn, table.name);
                        }}
                        className="p-1.5 rounded hover:bg-blue-100 text-blue-500 hover:text-blue-700 transition-colors"
                        title="Preview data (SELECT * LIMIT 100)"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewLineage?.(table.fqn, table.name);
                        }}
                        className="p-1.5 rounded hover:bg-purple-100 text-purple-500 hover:text-purple-700 transition-colors"
                        title="View lineage"
                      >
                        <GitBranch size={16} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContextMenu(e, table);
                        }}
                        className="p-1.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
                        title="More actions"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Context Menu */}
          {contextMenu && (
            <div
              ref={contextMenuRef}
              style={{
                position: 'fixed',
                left: Math.min(contextMenu.x, window.innerWidth - 200),
                top: Math.min(contextMenu.y, window.innerHeight - 280),
                zIndex: 9999,
              }}
              className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
            >
              <button
                onClick={() => { handleSelect(contextMenu.table); setContextMenu(null); }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              >
                <Table2 size={14} className="text-gray-400" />
                <span className="flex-1">Insert FQN</span>
                <span className="text-[10px] text-gray-400 font-mono">Enter</span>
              </button>
              <button
                onClick={() => { onGenerateSelect?.(contextMenu.table.fqn, contextMenu.table.name); setContextMenu(null); }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              >
                <FileText size={14} className="text-gray-400" />
                <span>Generate SELECT *</span>
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { onPreviewTable?.(contextMenu.table.fqn, contextMenu.table.name); setContextMenu(null); }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              >
                <Eye size={14} className="text-gray-400" />
                <span className="flex-1">Preview Data</span>
                <span className="text-[10px] text-gray-400 font-mono">P</span>
              </button>
              <button
                onClick={() => { onDescribeTable?.(contextMenu.table.fqn, contextMenu.table.name); setContextMenu(null); }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              >
                <Columns size={14} className="text-gray-400" />
                <span>Describe Table</span>
              </button>
              <button
                onClick={() => { onViewLineage?.(contextMenu.table.fqn, contextMenu.table.name); setContextMenu(null); }}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700"
              >
                <GitBranch size={14} className="text-gray-400" />
                <span className="flex-1">View Lineage</span>
                <span className="text-[10px] text-gray-400 font-mono">L</span>
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => handleCopyName(contextMenu.table.name, false)}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              >
                <Copy size={14} className="text-gray-400" />
                <span>Copy Name</span>
              </button>
              <button
                onClick={() => handleCopyName(contextMenu.table.name, true)}
                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              >
                <Copy size={14} className="text-gray-400" />
                <span>Copy Full Path</span>
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
            <span className="font-medium">{filteredTables.length}</span> of {tables.length} tables
            <span className="mx-2">•</span>
            Click to insert • Right-click for more
          </div>
        </div>
      )}
    </div>
  );
}


// =============================================================================
// RESIZABLE PANEL COMPONENT
// =============================================================================

function ResizablePanel({ 
  direction = 'horizontal', 
  initialSize = 256, 
  minSize = 100, 
  maxSize = 500,
  children,
  className = '',
  onResize
}) {
  const [size, setSize] = useState(initialSize);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef(null);
  
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [direction]);
  
  useEffect(() => {
    if (!isResizing) return;
    
    const handleMouseMove = (e) => {
      if (direction === 'horizontal') {
        const newSize = e.clientX - panelRef.current.getBoundingClientRect().left;
        setSize(Math.min(maxSize, Math.max(minSize, newSize)));
      } else {
        const newSize = e.clientY - panelRef.current.getBoundingClientRect().top;
        setSize(Math.min(maxSize, Math.max(minSize, newSize)));
      }
      onResize?.(size);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, direction, minSize, maxSize, onResize, size]);
  
  return (
    <div 
      ref={panelRef}
      className={`relative flex-shrink-0 ${className}`}
      style={{ [direction === 'horizontal' ? 'width' : 'height']: size }}
    >
      {children}
      {/* Resize handle */}
      <div
        className={`absolute group ${
          direction === 'horizontal' 
            ? 'right-0 top-0 bottom-0 w-1 cursor-col-resize'
            : 'bottom-0 left-0 right-0 h-1 cursor-row-resize'
        } ${isResizing ? 'bg-gray-400' : 'bg-transparent hover:bg-gray-300'} transition-colors z-10`}
        onMouseDown={handleMouseDown}
      >
        {/* Visual grip indicator */}
        <div className={`absolute opacity-0 group-hover:opacity-100 transition-opacity ${
          direction === 'horizontal'
            ? 'left-0 top-1/2 -translate-y-1/2 w-1 h-8 flex flex-col items-center justify-center gap-0.5'
            : 'top-0 left-1/2 -translate-x-1/2 h-1 w-8 flex items-center justify-center gap-0.5'
        }`}>
          {[0, 1, 2].map(i => (
            <div key={i} className={`bg-gray-400 rounded-full ${
              direction === 'horizontal' ? 'w-0.5 h-0.5' : 'w-0.5 h-0.5'
            }`} />
          ))}
        </div>
      </div>
    </div>
  );
}
  
// =============================================================================
// SCHEMA TREE COMPONENT - Database Explorer
// =============================================================================

function SchemaTree({
  database,
  schema,
  onSelectTable,
  onDatabaseChange,
  onSchemaChange,
  connectionStatus,
  // New props for lineage integration
  executeQuery,
  mdlhDatabase = 'FIELD_METADATA',
  mdlhSchema = 'PUBLIC',
  onOpenLineage
}) {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [databases, setDatabases] = useState([]);
  const [schemasMap, setSchemasMap] = useState({}); // { dbName: schemas[] }
  const [tablesMap, setTablesMap] = useState({}); // { "db.schema": tables[] }
  const [loading, setLoading] = useState(false);
  const [loadingSchemas, setLoadingSchemas] = useState({});
  const [loadingTables, setLoadingTables] = useState({});
  const [searchQuery, setSearchQuery] = useState('');

  // Lineage indicators state
  const [lineageCache, setLineageCache] = useState({}); // { 'DB.SCHEMA': Map<tableName, guid> }
  const [loadingLineage, setLoadingLineage] = useState({});

  const { fetchDatabases, fetchSchemas, fetchTables } = useMetadata();
  
  // Load databases on mount
  useEffect(() => {
    if (connectionStatus?.connected) {
      setLoading(true);
      fetchDatabases()
        .then(dbs => {
          const dbList = dbs || [];
          setDatabases(dbList);
          // Auto-expand current database
          if (database) {
            setExpandedNodes(prev => new Set([...prev, database]));
          }
        })
        .catch(() => setDatabases([]))
        .finally(() => setLoading(false));

      // Debug: Log what tables have lineage in MDLH and show available columns
      if (executeQuery) {
        // Initial lineage data fetch - errors silently handled
        executeQuery(`
          SELECT name, databasename, schemaname, qualifiedname, haslineage, guid
          FROM ${mdlhDatabase}.${mdlhSchema}.TABLE_ENTITY
          WHERE haslineage = TRUE
          LIMIT 10
        `).catch(() => {});
      }
    }
  }, [connectionStatus?.connected, fetchDatabases]);
  
  // Auto-expand and load schemas for current database
  useEffect(() => {
    if (database && connectionStatus?.connected && !schemasMap[database]) {
      loadSchemasForDb(database);
    }
  }, [database, connectionStatus?.connected]);
  
  // Auto-expand and load tables for current schema
  useEffect(() => {
    const key = `${database}.${schema}`;
    if (database && schema && connectionStatus?.connected && !tablesMap[key]) {
      loadTablesForSchema(database, schema);
      setExpandedNodes(prev => new Set([...prev, database, key]));
    }
  }, [database, schema, connectionStatus?.connected]);
  
  const loadSchemasForDb = async (dbName) => {
    if (schemasMap[dbName]) return;
    setLoadingSchemas(prev => ({ ...prev, [dbName]: true }));
    try {
      const schemas = await fetchSchemas(dbName);
      setSchemasMap(prev => ({ ...prev, [dbName]: schemas || [] }));
    } catch (e) {
      // Schema loading failed - leave empty
    } finally {
      setLoadingSchemas(prev => ({ ...prev, [dbName]: false }));
    }
  };
  
  const loadTablesForSchema = async (dbName, schemaName) => {
    const key = `${dbName}.${schemaName}`;
    if (tablesMap[key]) return;
    setLoadingTables(prev => ({ ...prev, [key]: true }));
    try {
      const tables = await fetchTables(dbName, schemaName);
      setTablesMap(prev => ({ ...prev, [key]: tables || [] }));
      // Also fetch lineage indicators for this schema
      loadLineageIndicators(dbName, schemaName);
    } catch (e) {
      // Table loading failed - leave empty
    } finally {
      setLoadingTables(prev => ({ ...prev, [key]: false }));
    }
  };

  // Fetch lineage indicators for tables in a schema
  // Uses PROCESS_ENTITY with LATERAL FLATTEN to detect actual lineage relationships
  // (haslineage column is unreliable - often NULL even for tables with lineage)
  const loadLineageIndicators = async (dbName, schemaName) => {
    if (!executeQuery || !connectionStatus?.connected) return;

    const key = `${dbName}.${schemaName}`;
    if (lineageCache[key]) return; // Already cached

    setLoadingLineage(prev => ({ ...prev, [key]: true }));

    try {
      const isMdlhDatabase = dbName.toUpperCase() === mdlhDatabase.toUpperCase();

      // Find all table GUIDs that appear in PROCESS_ENTITY inputs or outputs
      // Uses LATERAL FLATTEN for accurate ARRAY searching (same approach as lineageService)
      // Also returns databasename/schemaname so we can match to specific schemas
      const sql = `
        WITH process_refs AS (
          SELECT DISTINCT f.value::STRING AS ref_guid
          FROM ${mdlhDatabase}.${mdlhSchema}.PROCESS_ENTITY p,
          LATERAL FLATTEN(input => p.inputs) f
          UNION
          SELECT DISTINCT f.value::STRING AS ref_guid
          FROM ${mdlhDatabase}.${mdlhSchema}.PROCESS_ENTITY p,
          LATERAL FLATTEN(input => p.outputs) f
        )
        SELECT DISTINCT t.name, t.guid, t.databasename, t.schemaname
        FROM ${mdlhDatabase}.${mdlhSchema}.TABLE_ENTITY t
        INNER JOIN process_refs pr ON t.guid = pr.ref_guid
        LIMIT 500
      `;

      const result = await executeQuery(sql);

      // For MDLH database, store globally by name for easy access
      // For other databases, filter by databasename/schemaname
      const tablesWithLineage = new Map();
      const globalTablesWithLineage = new Map();

      if (result?.rows) {
        result.rows.forEach(row => {
          const name = Array.isArray(row) ? row[0] : (row.NAME || row.name);
          const guid = Array.isArray(row) ? row[1] : (row.GUID || row.guid);
          const tableDb = Array.isArray(row) ? row[2] : (row.DATABASENAME || row.databasename);
          const tableSchema = Array.isArray(row) ? row[3] : (row.SCHEMANAME || row.schemaname);

          if (name && guid) {
            // Always add to global cache (keyed by name)
            globalTablesWithLineage.set(name.toUpperCase(), guid);

            // Also match by database/schema if provided
            if (tableDb && tableSchema) {
              const tableKey = `${tableDb.toUpperCase()}.${tableSchema.toUpperCase()}`;
              if (tableKey === key.toUpperCase()) {
                tablesWithLineage.set(name.toUpperCase(), guid);
              }
            }
          }
        });
      }

      // Store both the schema-specific cache and a global MDLH cache
      setLineageCache(prev => ({
        ...prev,
        [key]: tablesWithLineage,
        '_GLOBAL_': globalTablesWithLineage  // Global cache for MDLH browsing
      }));
    } catch (e) {
      setLineageCache(prev => ({ ...prev, [key]: new Map() }));
    } finally {
      setLoadingLineage(prev => ({ ...prev, [key]: false }));
    }
  };

  // Check if a table has lineage
  // For MDLH database, also check the global cache since tracked tables
  // are stored BY NAME (not as physical schema tables)
  const getTableLineageGuid = (dbName, schemaName, tableName) => {
    const key = `${dbName}.${schemaName}`;
    const cache = lineageCache[key];

    // First check schema-specific cache
    if (cache) {
      const guid = cache.get(tableName.toUpperCase());
      if (guid) return guid;
    }

    // For MDLH database, also check global cache (tracked tables from other DBs)
    const isMdlhDatabase = dbName.toUpperCase() === mdlhDatabase.toUpperCase();
    if (isMdlhDatabase) {
      const globalCache = lineageCache['_GLOBAL_'];
      if (globalCache) {
        return globalCache.get(tableName.toUpperCase()) || null;
      }
    }

    return null;
  };

  const toggleNode = async (nodeId, type, dbName, schemaName) => {
    const isCurrentlyExpanded = expandedNodes.has(nodeId);
    
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
    
    // Load data if expanding
    if (!isCurrentlyExpanded) {
      if (type === 'database') {
        await loadSchemasForDb(dbName);
      } else if (type === 'schema') {
        await loadTablesForSchema(dbName, schemaName);
      }
    }
  };
  
  const isExpanded = (nodeId) => expandedNodes.has(nodeId);
  
  // Filter tables by search
  const filterTables = (tables) => {
    if (!searchQuery) return tables;
    return tables.filter(t => {
      const name = typeof t === 'string' ? t : t.name;
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  };
  
  // Get icon for database type
  const getDatabaseIcon = (dbName) => {
    if (dbName === 'memory' || dbName.includes('MEMORY')) {
      return <Settings size={14} className="text-slate-500" />;
    }
    return <Database size={14} className="text-blue-500" />;
  };
  
  return (
    <div className="flex flex-col h-full text-[13px] bg-slate-50">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between">
          <span className="font-medium text-slate-700 text-sm">Attached databases</span>
          <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600">
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      
      {/* Search */}
      {connectionStatus?.connected && databases.length > 0 && (
        <div className="px-2 py-2 border-b border-slate-200">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filter tables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-slate-100 border-0 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder-slate-400"
            />
          </div>
        </div>
      )}
          
      {/* Tree */}
      <div className="flex-1 overflow-auto py-1">
        {!connectionStatus?.connected ? (
          <div className="px-3 py-8 text-center text-slate-400 text-xs">
            <WifiOff size={24} className="mx-auto mb-3 opacity-50" />
            <p className="font-medium">Connect to see schema</p>
          </div>
        ) : loading ? (
          <div className="px-3 py-8 text-center text-slate-400">
            <Loader2 size={20} className="mx-auto animate-spin" />
          </div>
        ) : databases.length === 0 ? (
          <div className="px-3 py-8 text-center text-slate-400 text-xs">
            No databases found
          </div>
        ) : (
          <div className="space-y-0">
            {databases.map(db => {
              const dbName = typeof db === 'string' ? db : db.name;
              const isCurrentDb = dbName === database;
              const dbSchemas = schemasMap[dbName] || [];
              
              return (
                <div key={dbName}>
                  {/* Database node */}
                  <div
                    className={`flex items-center gap-1 px-2 py-1.5 cursor-pointer transition-colors group ${
                      isCurrentDb ? 'bg-blue-50' : 'hover:bg-slate-100'
                    }`}
                    onClick={() => toggleNode(dbName, 'database', dbName)}
                  >
                    <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      {isExpanded(dbName) ? (
                        <ChevronDown size={12} className="text-slate-500" />
                      ) : (
                        <ChevronRight size={12} className="text-slate-400" />
                      )}
                    </span>
                    {getDatabaseIcon(dbName)}
                    <span className={`font-medium truncate ${isCurrentDb ? 'text-blue-700' : 'text-slate-800'}`}>
                      {dbName}
                    </span>
                    {/* Remote indicator or action icons */}
                    <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      {db.is_remote && (
                        <span className="text-slate-400" title={db.url}>
                          <Wifi size={12} />
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Schemas under database */}
                  {isExpanded(dbName) && (
                    <div className="ml-3">
                      {loadingSchemas[dbName] ? (
                        <div className="flex items-center gap-2 px-4 py-1.5 text-slate-400">
                          <Loader2 size={12} className="animate-spin" />
                          <span className="text-xs">Loading schemas...</span>
                        </div>
                      ) : dbSchemas.length === 0 ? (
                        <div className="px-6 py-1.5 text-xs text-slate-400">No schemas</div>
                      ) : (
                        dbSchemas.map(s => {
                          const schemaName = typeof s === 'string' ? s : s.name;
                          const schemaKey = `${dbName}.${schemaName}`;
                          const isCurrentSchema = dbName === database && schemaName === schema;
                          const schemaTables = tablesMap[schemaKey] || [];
                          const filteredTables = filterTables(schemaTables);
                          
                          return (
                            <div key={schemaKey}>
                              {/* Schema node */}
                              <div
                                className={`flex items-center gap-1 px-2 py-1 cursor-pointer transition-colors ${
                                  isCurrentSchema ? 'bg-blue-50/50' : 'hover:bg-slate-100'
                                }`}
                                onClick={() => toggleNode(schemaKey, 'schema', dbName, schemaName)}
                              >
                                <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                  {isExpanded(schemaKey) ? (
                                    <ChevronDown size={11} className="text-slate-500" />
                                  ) : (
                                    <ChevronRight size={11} className="text-slate-400" />
                                  )}
                                </span>
                                <Layers size={13} className="text-blue-500 flex-shrink-0" />
                                <span className={`truncate ${isCurrentSchema ? 'text-blue-600 font-medium' : 'text-slate-700'}`}>
                                  {schemaName}
                                </span>
                                {schemaTables.length > 0 && (
                                  <span className="ml-auto text-[10px] text-slate-400 tabular-nums">
                                    {schemaTables.length}
                                  </span>
                                )}
                              </div>
                              
                              {/* Tables under schema */}
                              {isExpanded(schemaKey) && (
                                <div className="ml-4">
                                  {loadingTables[schemaKey] ? (
                                    <div className="flex items-center gap-2 px-4 py-1.5 text-slate-400">
                                      <Loader2 size={10} className="animate-spin" />
                                      <span className="text-xs">Loading tables...</span>
                                    </div>
                                  ) : filteredTables.length === 0 ? (
                                    <div className="px-6 py-1.5 text-xs text-slate-400">
                                      {searchQuery ? 'No matching tables' : 'No tables'}
                                    </div>
                                  ) : (
                                    <>
                                      {/* For MDLH database, show tracked tables with lineage first */}
                                      {dbName.toUpperCase() === mdlhDatabase.toUpperCase() && lineageCache['_GLOBAL_']?.size > 0 && (
                                        <div className="mb-2">
                                          <div className="px-2 py-1 text-[10px] font-medium text-purple-600 bg-purple-50/50 rounded flex items-center gap-1">
                                            <GitBranch size={10} />
                                            <span>Tracked Tables with Lineage ({lineageCache['_GLOBAL_'].size})</span>
                                          </div>
                                          <div className="max-h-48 overflow-y-auto">
                                            {Array.from(lineageCache['_GLOBAL_'].entries())
                                              .filter(([name]) => !searchQuery || name.toLowerCase().includes(searchQuery.toLowerCase()))
                                              .slice(0, 50)
                                              .map(([name, guid]) => (
                                                <div
                                                  key={guid}
                                                  className="flex items-center gap-1 px-2 py-1 hover:bg-purple-50 cursor-pointer rounded group"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpenLineage?.({
                                                      guid: guid,
                                                      name: name,
                                                      database: dbName,
                                                      schema: schemaName,
                                                      typename: 'Table'
                                                    });
                                                  }}
                                                >
                                                  <GitBranch size={10} className="text-purple-500 flex-shrink-0" />
                                                  <span className="text-purple-700 truncate text-[11px]">{name}</span>
                                                </div>
                                              ))
                                            }
                                          </div>
                                          <div className="border-b border-slate-100 my-2" />
                                        </div>
                                      )}
                                      {/* Regular schema tables */}
                                      {filteredTables.map(table => {
                                        const tableName = typeof table === 'string' ? table : table.name;
                                        const lineageGuid = getTableLineageGuid(dbName, schemaName, tableName);
                                        const hasLineage = Boolean(lineageGuid);

                                        return (
                                          <div
                                            key={tableName}
                                            className="flex items-center justify-between gap-1 px-2 py-1 hover:bg-blue-50 cursor-pointer rounded group"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              // Set the database/schema context first
                                              if (dbName !== database) onDatabaseChange?.(dbName);
                                              if (schemaName !== schema) onSchemaChange?.(schemaName);
                                              onSelectTable?.(tableName);
                                            }}
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <Table2 size={11} className="text-slate-400 flex-shrink-0" />
                                              <span className="text-slate-600 truncate text-[12px]">{tableName}</span>
                                              {/* Lineage indicator pill */}
                                              {hasLineage && (
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpenLineage?.({
                                                      guid: lineageGuid,
                                                      name: tableName,
                                                      database: dbName,
                                                      schema: schemaName,
                                                      typename: 'Table'
                                                    });
                                                  }}
                                                  className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors"
                                                  title="View lineage"
                                                >
                                                  <GitBranch size={9} />
                                                  <span>Lineage</span>
                                                </button>
                                              )}
                                            </div>
                                            {/* Hover action buttons */}
                                            <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                              {/* Preview button */}
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const fqn = `"${dbName}"."${schemaName}"."${tableName}"`;
                                                  if (executeQuery) {
                                                    executeQuery(`SELECT * FROM ${fqn} LIMIT 100`);
                                                  }
                                                }}
                                                className="p-1 rounded hover:bg-blue-100 text-blue-500 hover:text-blue-700 transition-colors"
                                                title="Preview data (SELECT * LIMIT 100)"
                                              >
                                                <Eye size={12} />
                                              </button>
                                              {/* Lineage button */}
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (hasLineage && onOpenLineage) {
                                                    onOpenLineage({
                                                      guid: lineageGuid,
                                                      name: tableName,
                                                      database: dbName,
                                                      schema: schemaName,
                                                      typename: 'Table'
                                                    });
                                                  }
                                                }}
                                                className={`p-1 rounded transition-colors ${
                                                  hasLineage
                                                    ? 'hover:bg-purple-100 text-purple-500 hover:text-purple-700'
                                                    : 'text-gray-300 cursor-not-allowed'
                                                }`}
                                                title={hasLineage ? "View lineage" : "No lineage data available"}
                                                disabled={!hasLineage}
                                              >
                                                <GitBranch size={12} />
                                              </button>
                                              {/* More actions button */}
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  // More actions - placeholder
                                                }}
                                                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                                                title="More actions"
                                              >
                                                <MoreHorizontal size={12} />
                                              </button>
                                              {/* Row count */}
                                              {table.row_count && (
                                                <span className="text-[10px] text-slate-400 tabular-nums ml-1">
                                                  {typeof table.row_count === 'number'
                                                    ? table.row_count.toLocaleString()
                                                    : table.row_count}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// EXPLORATION PANEL - Tabbed view for Current Cell + Lineage
// =============================================================================

function ExplorationPanel({
  results,
  selectedColumn,
  onSelectColumn,
  selectedRowData,
  activeTab = 'cell',
  onTabChange,
  onOpenLineagePanel,
  database,
  schema,
  onRunQuery,
  onCollapse
}) {
  const [searchTerm, setSearchTerm] = useState('');

  // Determine if we have entity data (has GUID)
  const hasEntityData = selectedRowData && (selectedRowData.GUID || selectedRowData.guid);
  const entityGuid = selectedRowData?.GUID || selectedRowData?.guid;
  const entityName = selectedRowData?.NAME || selectedRowData?.name || 'Selected Entity';
  const entityType = selectedRowData?.TYPENAME || selectedRowData?.typename || 'Unknown';

  // Tab buttons
  const tabs = [
    { id: 'cell', label: 'Current Cell', icon: Columns },
    { id: 'lineage', label: 'Lineage', icon: GitBranch, disabled: !hasEntityData }
  ];

  return (
    <div className="flex flex-col h-full text-[13px] bg-white">
      {/* Tab Header with collapse button */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/50">
        <div className="flex items-center">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && onTabChange?.(tab.id)}
                disabled={tab.disabled}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : tab.disabled
                      ? 'border-transparent text-gray-300 cursor-not-allowed'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-1.5 mr-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Collapse panel"
          >
            <PanelLeftClose size={14} />
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'lineage' && hasEntityData ? (
        <LineageTabContent
          entityGuid={entityGuid}
          entityName={entityName}
          entityType={entityType}
          rowData={selectedRowData}
          database={database}
          schema={schema}
          onOpenFullLineage={onOpenLineagePanel}
          onRunQuery={onRunQuery}
        />
      ) : (
        <ColumnDiagnosticsContent
          results={results}
          selectedColumn={selectedColumn}
          onSelectColumn={onSelectColumn}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
      )}
    </div>
  );
}

// Lineage tab content - shows lineage for selected entity
function LineageTabContent({ entityGuid, entityName, entityType, rowData, database, schema, onOpenFullLineage, onRunQuery }) {
  const [expandedSection, setExpandedSection] = useState('queries');

  // Build recommended queries based on entity type AND available metadata
  const recommendedQueries = useMemo(() => {
    const queries = [];
    const safeGuid = entityGuid?.replace(/'/g, "''") || '';
    const safeName = entityName?.replace(/'/g, "''") || '';

    // Extract useful metadata from rowData for context-aware queries
    const qualifiedName = rowData?.QUALIFIEDNAME || rowData?.qualifiedName || '';
    const databaseName = rowData?.DATABASENAME || rowData?.databaseName || '';
    const schemaName = rowData?.SCHEMANAME || rowData?.schemaName || '';
    const connectorName = rowData?.CONNECTORNAME || rowData?.connectorName || '';
    const ownerUsers = rowData?.OWNERUSERS || rowData?.ownerUsers;
    const hasLineage = rowData?.HASLINEAGE || rowData?.hasLineage;
    const hasMeanings = rowData?.MEANINGS && rowData.MEANINGS !== '[]';

    // =========================================================================
    // LINEAGE QUERIES (always available for entities with GUID)
    // =========================================================================
    queries.push({
      id: 'upstream',
      category: 'Lineage',
      label: 'Upstream Assets (1 hop)',
      description: 'Direct sources feeding this asset',
      icon: ArrowDownRight,
      iconClass: 'text-blue-600 rotate-180',
      sql: `-- Upstream lineage: What feeds into ${entityName}
SELECT DISTINCT
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    p."TYPENAME" AS process_type,
    p."SQL" AS transformation_sql
FROM ${database}.${schema}.PROCESS_ENTITY p,
LATERAL FLATTEN(INPUT => p."OUTPUTS", OUTER => FALSE) f
WHERE f.value::VARCHAR ILIKE '%${safeGuid}%'
LIMIT 50;`
    });

    queries.push({
      id: 'downstream',
      category: 'Lineage',
      label: 'Downstream Assets (1 hop)',
      description: 'Direct consumers of this asset',
      icon: ArrowDownRight,
      iconClass: 'text-green-600',
      sql: `-- Downstream lineage: What ${entityName} feeds into
SELECT DISTINCT
    p."GUID" AS process_guid,
    p."NAME" AS process_name,
    p."TYPENAME" AS process_type,
    p."SQL" AS transformation_sql
FROM ${database}.${schema}.PROCESS_ENTITY p,
LATERAL FLATTEN(INPUT => p."INPUTS", OUTER => FALSE) f
WHERE f.value::VARCHAR ILIKE '%${safeGuid}%'
LIMIT 50;`
    });

    // Multi-hop lineage (if entity has lineage)
    if (hasLineage) {
      queries.push({
        id: 'lineage_chain',
        category: 'Lineage',
        label: 'Full Lineage Chain (5 hops)',
        description: 'Recursive upstream traversal',
        icon: GitBranch,
        iconClass: 'text-purple-600',
        sql: `-- Full upstream lineage chain for ${entityName} (up to 5 hops)
WITH RECURSIVE lineage_cte (guid, level) AS (
    SELECT '${safeGuid}'::VARCHAR AS guid, 0 AS level
    UNION ALL
    SELECT inputs_flat.value::STRING, L.level + 1
    FROM lineage_cte AS L
    JOIN ${database}.${schema}.PROCESS_ENTITY AS P
      ON P."OUTPUTS"::STRING ILIKE '%' || L.guid || '%'
    , LATERAL FLATTEN(INPUT => P."INPUTS") AS inputs_flat
    WHERE L.level < 5
)
SELECT DISTINCT
    COALESCE(T."NAME", V."NAME") AS entity_name,
    L.guid AS entity_guid,
    CASE WHEN T."NAME" IS NOT NULL THEN 'TABLE' WHEN V."NAME" IS NOT NULL THEN 'VIEW' ELSE 'UNKNOWN' END AS entity_type,
    L.level AS distance
FROM lineage_cte AS L
LEFT JOIN ${database}.${schema}.TABLE_ENTITY AS T ON T."GUID" = L.guid
LEFT JOIN ${database}.${schema}.VIEW_ENTITY AS V ON V."GUID" = L.guid
WHERE L.level > 0
ORDER BY distance ASC;`
      });
    }

    // =========================================================================
    // STRUCTURE QUERIES (Table-specific)
    // =========================================================================
    if (entityType?.toLowerCase() === 'table' || !entityType) {
      queries.push({
        id: 'columns',
        category: 'Structure',
        label: 'View Columns',
        description: 'All columns with data types',
        icon: Columns,
        iconClass: 'text-purple-600',
        sql: `-- Columns for ${entityName}
SELECT
    c."NAME" AS column_name,
    c."DATATYPE" AS data_type,
    c."ORDER" AS position,
    c."DESCRIPTION",
    c."USERDESCRIPTION",
    c."ISPRIMARYKEY",
    c."ISNULLABLE",
    c."ISPROFILED"
FROM ${database}.${schema}.COLUMN_ENTITY c
WHERE c."TABLEQUALIFIEDNAME" ILIKE '%${safeName}%'
   OR c."TABLE"::STRING ILIKE '%${safeGuid}%'
ORDER BY c."ORDER"
LIMIT 100;`
      });

      queries.push({
        id: 'column_stats',
        category: 'Structure',
        label: 'Column Profiling Stats',
        description: 'Data quality metrics per column',
        icon: BarChart3,
        iconClass: 'text-indigo-600',
        sql: `-- Column profiling stats for ${entityName}
SELECT
    c."NAME" AS column_name,
    c."DATATYPE",
    c."COLUMNDISTINCTVALUESCOUNT" AS distinct_count,
    c."COLUMNMAX",
    c."COLUMNMIN",
    c."COLUMNMEAN",
    c."COLUMNNULLCOUNT" AS null_count,
    c."COLUMNUNIQUENESSPERCENTAGE" AS uniqueness_pct
FROM ${database}.${schema}.COLUMN_ENTITY c
WHERE c."TABLEQUALIFIEDNAME" ILIKE '%${safeName}%'
  AND c."ISPROFILED" = TRUE
ORDER BY c."ORDER"
LIMIT 100;`
      });
    }

    // =========================================================================
    // GOVERNANCE QUERIES
    // =========================================================================
    queries.push({
      id: 'tags',
      category: 'Governance',
      label: 'Classification Tags',
      description: 'View applied tags and propagation',
      icon: Tag,
      iconClass: 'text-red-600',
      sql: `-- Tags applied to ${entityName}
SELECT
    tr."TAGNAME",
    tr."TAGVALUE",
    tr."PROPAGATE",
    tr."PROPAGATEFROMLINEAGE",
    tr."ENTITYTYPENAME"
FROM ${database}.${schema}.TAG_RELATIONSHIP tr
WHERE tr."ENTITYGUID" = '${safeGuid}'
ORDER BY tr."TAGNAME";`
    });

    queries.push({
      id: 'custom_metadata',
      category: 'Governance',
      label: 'Custom Metadata',
      description: 'View custom attribute values',
      icon: FileText,
      iconClass: 'text-teal-600',
      sql: `-- Custom metadata for ${entityName}
SELECT
    cm."SETDISPLAYNAME" AS metadata_set,
    cm."ATTRIBUTEDISPLAYNAME" AS attribute_name,
    cm."ATTRIBUTEVALUE" AS value
FROM ${database}.${schema}.CUSTOMMETADATA_RELATIONSHIP cm
WHERE cm."ENTITYGUID" = '${safeGuid}'
ORDER BY cm."SETDISPLAYNAME", cm."ATTRIBUTEDISPLAYNAME";`
    });

    // Owner-based queries (if owner exists)
    if (ownerUsers) {
      const ownerName = Array.isArray(ownerUsers) ? ownerUsers[0] : String(ownerUsers).replace(/[\[\]"]/g, '').split(',')[0];
      queries.push({
        id: 'owner_assets',
        category: 'Governance',
        label: 'Other Assets by Owner',
        description: `Other assets owned by ${ownerName}`,
        icon: User,
        iconClass: 'text-blue-600',
        sql: `-- Other tables owned by same owner as ${entityName}
SELECT
    "NAME",
    "TYPENAME",
    "QUALIFIEDNAME",
    "POPULARITYSCORE",
    "STATUS"
FROM ${database}.${schema}.TABLE_ENTITY
WHERE "OWNERUSERS"::STRING ILIKE '%${ownerName?.replace(/'/g, "''")}%'
  AND "GUID" != '${safeGuid}'
  AND "STATUS" = 'ACTIVE'
ORDER BY "POPULARITYSCORE" DESC NULLS LAST
LIMIT 20;`
      });
    }

    // =========================================================================
    // GLOSSARY QUERIES (if entity has meanings/terms linked)
    // =========================================================================
    if (hasMeanings) {
      queries.push({
        id: 'linked_terms',
        category: 'Glossary',
        label: 'Linked Glossary Terms',
        description: 'Business terms assigned to this asset',
        icon: BookOpen,
        iconClass: 'text-pink-600',
        sql: `-- Glossary terms linked to ${entityName}
-- MEANINGS is an ARRAY of term references
SELECT
    gt."NAME" AS term_name,
    gt."USERDESCRIPTION" AS definition,
    g."NAME" AS glossary_name,
    gt."STATUS"
FROM ${database}.${schema}.ATLASGLOSSARYTERM_ENTITY gt
JOIN ${database}.${schema}.ATLASGLOSSARY_ENTITY g
  ON gt."ANCHOR":guid::STRING = g."GUID"
WHERE gt."GUID" IN (
    SELECT f.value:guid::STRING
    FROM ${database}.${schema}.TABLE_ENTITY t,
    LATERAL FLATTEN(INPUT => t."MEANINGS") f
    WHERE t."GUID" = '${safeGuid}'
)
ORDER BY gt."NAME";`
      });
    }

    queries.push({
      id: 'find_terms',
      category: 'Glossary',
      label: 'Find Related Terms',
      description: 'Search terms matching this table name',
      icon: BookOpen,
      iconClass: 'text-pink-500',
      sql: `-- Glossary terms that might relate to ${entityName}
SELECT
    gt."NAME" AS term_name,
    gt."USERDESCRIPTION" AS definition,
    g."NAME" AS glossary_name,
    JAROWINKLER_SIMILARITY(gt."NAME", '${safeName}') AS similarity
FROM ${database}.${schema}.ATLASGLOSSARYTERM_ENTITY gt
LEFT JOIN ${database}.${schema}.ATLASGLOSSARY_ENTITY g
  ON gt."ANCHOR":guid::STRING = g."GUID"
WHERE gt."STATUS" = 'ACTIVE'
  AND (
    LOWER(gt."NAME") LIKE '%${safeName?.toLowerCase().split('_')[0] || ''}%'
    OR JAROWINKLER_SIMILARITY(gt."NAME", '${safeName}') > 70
  )
ORDER BY similarity DESC NULLS LAST
LIMIT 20;`
    });

    // =========================================================================
    // USAGE & POPULARITY QUERIES
    // =========================================================================
    queries.push({
      id: 'usage_stats',
      category: 'Usage',
      label: 'Usage Statistics',
      description: 'Query counts, popularity, users',
      icon: TrendingUp,
      iconClass: 'text-orange-600',
      sql: `-- Usage statistics for ${entityName}
SELECT
    "NAME",
    "QUERYCOUNT",
    "QUERYUSERCOUNT",
    "POPULARITYSCORE",
    "SOURCEREADCOUNT",
    "SOURCELASTREADAT",
    "SOURCEREADRECENTUSERLIST"::STRING AS recent_users
FROM ${database}.${schema}.TABLE_ENTITY
WHERE "GUID" = '${safeGuid}'
LIMIT 1;`
    });

    queries.push({
      id: 'top_users',
      category: 'Usage',
      label: 'Top Users of This Table',
      description: 'Who queries this table most',
      icon: Users,
      iconClass: 'text-blue-500',
      sql: `-- Top users querying tables in same schema as ${entityName}
-- (Requires Snowflake query history access)
SELECT
    t."NAME",
    t."QUERYCOUNT",
    t."QUERYUSERCOUNT",
    t."SOURCEREADRECENTUSERLIST"::STRING AS recent_users,
    t."SOURCEREADUSERCOUNT"
FROM ${database}.${schema}.TABLE_ENTITY t
WHERE t."SCHEMANAME" = '${schemaName}'
  AND t."DATABASENAME" = '${databaseName}'
  AND t."QUERYCOUNT" > 0
ORDER BY t."QUERYCOUNT" DESC
LIMIT 20;`
    });

    // =========================================================================
    // IMPACT ANALYSIS QUERIES
    // =========================================================================
    queries.push({
      id: 'impacted_dashboards',
      category: 'Impact',
      label: 'Impacted Dashboards',
      description: 'BI dashboards using this data',
      icon: LayoutDashboard,
      iconClass: 'text-violet-600',
      sql: `-- Dashboards potentially impacted by changes to ${entityName}
WITH downstream AS (
    SELECT f.value::STRING AS downstream_guid
    FROM ${database}.${schema}.PROCESS_ENTITY p,
    LATERAL FLATTEN(INPUT => p."OUTPUTS") f
    WHERE p."INPUTS"::STRING ILIKE '%${safeGuid}%'
)
SELECT
    d."GUID",
    d."NAME" AS dashboard_name,
    d."TYPENAME",
    d."CONNECTIONNAME",
    d."POPULARITYSCORE"
FROM downstream ds
LEFT JOIN ${database}.${schema}.TABLEAUDASHBOARD_ENTITY d ON ds.downstream_guid = d."GUID"
WHERE d."NAME" IS NOT NULL

UNION ALL

SELECT
    d."GUID",
    d."NAME" AS dashboard_name,
    d."TYPENAME",
    d."CONNECTIONNAME",
    d."POPULARITYSCORE"
FROM downstream ds
LEFT JOIN ${database}.${schema}.POWERBIDASHBOARD_ENTITY d ON ds.downstream_guid = d."GUID"
WHERE d."NAME" IS NOT NULL
LIMIT 50;`
    });

    // =========================================================================
    // DISCOVERY QUERIES
    // =========================================================================
    queries.push({
      id: 'similar_tables',
      category: 'Discovery',
      label: 'Similar Tables',
      description: 'Tables with similar names',
      icon: Search,
      iconClass: 'text-cyan-600',
      sql: `-- Tables with similar names to ${entityName}
SELECT
    "NAME",
    "GUID",
    "TYPENAME",
    "DATABASENAME",
    "SCHEMANAME",
    "ROWCOUNT",
    "POPULARITYSCORE",
    JAROWINKLER_SIMILARITY("NAME", '${safeName}') AS similarity
FROM ${database}.${schema}.TABLE_ENTITY
WHERE "GUID" != '${safeGuid}'
  AND "STATUS" = 'ACTIVE'
  AND (
    "NAME" ILIKE '%${safeName?.split('_')[0] || safeName}%'
    OR JAROWINKLER_SIMILARITY("NAME", '${safeName}') > 75
  )
ORDER BY similarity DESC NULLS LAST
LIMIT 20;`
    });

    queries.push({
      id: 'same_schema',
      category: 'Discovery',
      label: 'Tables in Same Schema',
      description: `Other tables in ${schemaName}`,
      icon: Database,
      iconClass: 'text-slate-600',
      sql: `-- Other tables in the same schema as ${entityName}
SELECT
    "NAME",
    "GUID",
    "TYPENAME",
    "ROWCOUNT",
    "COLUMNCOUNT",
    "POPULARITYSCORE",
    "STATUS"
FROM ${database}.${schema}.TABLE_ENTITY
WHERE "SCHEMANAME" = '${schemaName}'
  AND "DATABASENAME" = '${databaseName}'
  AND "GUID" != '${safeGuid}'
  AND "STATUS" = 'ACTIVE'
ORDER BY "POPULARITYSCORE" DESC NULLS LAST
LIMIT 30;`
    });

    // =========================================================================
    // DETAILS QUERY (always last)
    // =========================================================================
    queries.push({
      id: 'full_record',
      category: 'Details',
      label: 'Full Entity Record',
      description: 'All metadata fields',
      icon: Eye,
      iconClass: 'text-gray-600',
      sql: `-- Full details for ${entityName}
SELECT *
FROM ${database}.${schema}.TABLE_ENTITY
WHERE "GUID" = '${safeGuid}'
LIMIT 1;`
    });

    return queries;
  }, [entityGuid, entityName, entityType, rowData, database, schema]);

  // Group queries by category
  const queryCategories = useMemo(() => {
    const categories = {};
    recommendedQueries.forEach(q => {
      if (!categories[q.category]) categories[q.category] = [];
      categories[q.category].push(q);
    });
    return categories;
  }, [recommendedQueries]);

  return (
    <div className="flex-1 overflow-auto">
      {/* Entity header - compact */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-3 py-2 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Table2 size={14} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-gray-900 truncate">{entityName}</div>
            <div className="text-[10px] text-gray-500 flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{entityType}</span>
              <span className="font-mono truncate">{entityGuid?.slice(0, 12)}...</span>
            </div>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(entityGuid)}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
            title="Copy GUID"
          >
            <Copy size={12} />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Primary action: View Full Lineage */}
        <button
          onClick={() => onOpenFullLineage?.(rowData)}
          className="w-full flex items-center gap-3 p-3 bg-gradient-to-r from-purple-50 to-amber-50 border border-purple-200 rounded-lg hover:border-purple-300 hover:shadow-sm transition-all group"
        >
          <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center">
            <GitBranch size={16} className="text-purple-600" />
          </div>
          <div className="text-left flex-1">
            <div className="text-sm font-medium text-gray-800 group-hover:text-purple-700">View Lineage Graph</div>
            <div className="text-xs text-gray-500">Visualize upstream and downstream dependencies</div>
          </div>
          <ChevronRight size={16} className="text-gray-400 group-hover:text-purple-500" />
        </button>

        {/* Recommended Queries Section */}
        <div className="space-y-2">
          <button
            onClick={() => setExpandedSection(expandedSection === 'queries' ? null : 'queries')}
            className="w-full flex items-center justify-between text-xs font-medium text-gray-700 hover:text-gray-900"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-amber-500" />
              Recommended Queries
            </span>
            {expandedSection === 'queries' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {expandedSection === 'queries' && (
            <div className="space-y-2">
              {Object.entries(queryCategories).map(([category, queries]) => (
                <div key={category} className="space-y-1">
                  <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider px-1">{category}</div>
                  {queries.map(query => {
                    const Icon = query.icon;
                    return (
                      <button
                        key={query.id}
                        onClick={() => onRunQuery?.(query.sql)}
                        className="w-full flex items-center gap-2 p-2 bg-white border border-gray-100 rounded-lg hover:border-blue-200 hover:bg-blue-50/50 transition-all group text-left"
                      >
                        <Icon size={14} className={query.iconClass} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-gray-700 group-hover:text-blue-700">{query.label}</div>
                          <div className="text-[10px] text-gray-400 truncate">{query.description}</div>
                        </div>
                        <Play size={10} className="text-gray-300 group-hover:text-blue-500" />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Entity Details Section */}
        <div className="space-y-2">
          <button
            onClick={() => setExpandedSection(expandedSection === 'details' ? null : 'details')}
            className="w-full flex items-center justify-between text-xs font-medium text-gray-700 hover:text-gray-900"
          >
            <span className="flex items-center gap-1.5">
              <Layers size={12} className="text-blue-500" />
              Entity Details
            </span>
            {expandedSection === 'details' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {expandedSection === 'details' && (
            <div className="bg-gray-50 rounded-lg p-2 space-y-1 text-xs">
              {Object.entries(rowData || {}).slice(0, 10).map(([key, value]) => (
                <div key={key} className="flex justify-between py-1 border-b border-gray-100 last:border-0">
                  <span className="text-gray-500 truncate flex-shrink-0 mr-2">{key}</span>
                  <span className="text-gray-700 truncate text-right font-mono" title={String(value)}>
                    {value === null ? <span className="text-gray-300 italic">null</span> : String(value).slice(0, 25)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Column diagnostics content (original functionality)
function ColumnDiagnosticsContent({ results, selectedColumn, onSelectColumn, searchTerm, onSearchChange }) {
  
  const columns = useMemo(() => {
    if (!results?.columns) return [];
    return results.columns.map((name, idx) => ({
      name,
      type: results.columnTypes?.[idx] || 'unknown',
      index: idx
    }));
  }, [results]);
  
  const filteredColumns = useMemo(() => {
    if (!searchTerm) return columns;
    const term = searchTerm.toLowerCase();
    return columns.filter(col => col.name.toLowerCase().includes(term));
  }, [columns, searchTerm]);
  
  // Calculate basic stats for each column
  const columnStats = useMemo(() => {
    if (!results?.rows || results.rows.length === 0) return {};
    
    const stats = {};
    columns.forEach((col, idx) => {
      const values = results.rows.map(row => row[idx]);
      const nullCount = values.filter(v => v === null || v === undefined).length;
      const nonNullValues = values.filter(v => v !== null && v !== undefined);
      const distinctCount = new Set(nonNullValues.map(String)).size;
      
      stats[col.name] = {
        nullCount,
        nullPct: Math.round((nullCount / values.length) * 100),
        distinctCount,
        total: values.length
      };
    });
    return stats;
  }, [results, columns]);
  
  const getTypeIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('int') || t.includes('number') || t.includes('float') || t.includes('decimal')) {
      return <Hash size={12} className="text-blue-500" />;
    }
    if (t.includes('date') || t.includes('time')) {
      return <Calendar size={12} className="text-purple-500" />;
    }
    if (t.includes('bool')) {
      return <ToggleLeft size={12} className="text-green-500" />;
    }
    return <Type size={12} className="text-gray-500" />;
  };
  
  // Simple sparkline for numeric columns
  const Sparkline = ({ values, type }) => {
    if (!values || values.length === 0) return null;
    
    const numericValues = values
      .filter(v => v !== null && !isNaN(Number(v)))
      .map(Number)
      .slice(0, 50);
    
    if (numericValues.length < 3) {
      return <span className="text-[10px] text-gray-400">{values.length} values</span>;
    }
    
    const min = Math.min(...numericValues);
    const max = Math.max(...numericValues);
    const range = max - min || 1;
    
    // Create histogram buckets
    const bucketCount = 20;
    const buckets = new Array(bucketCount).fill(0);
    numericValues.forEach(v => {
      const idx = Math.min(bucketCount - 1, Math.floor(((v - min) / range) * bucketCount));
      buckets[idx]++;
    });
    const maxBucket = Math.max(...buckets);
    
    return (
      <svg viewBox={`0 0 ${bucketCount * 4} 16`} className="w-20 h-4">
        {buckets.map((count, i) => (
          <rect
            key={i}
            x={i * 4}
            y={16 - (count / maxBucket) * 14}
            width={3}
            height={(count / maxBucket) * 14}
            fill="#94a3b8"
            rx={0.5}
          />
        ))}
      </svg>
    );
  };
  
  if (!results) {
    return (
      <div className="flex flex-col h-full text-[13px]">
        <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
          Run a query to see column diagnostics
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full text-[13px]">
      {/* Row count header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-slate-50/50">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{results.rows?.length?.toLocaleString() || 0} Rows</span>
          <span>•</span>
          <span>{columns.length} Columns</span>
        </div>
      </div>
      
      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search columns..."
            value={searchTerm}
            onChange={(e) => onSearchChange?.(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>
      
      {/* Column list */}
      <div className="flex-1 overflow-auto">
        {filteredColumns.map(col => {
          const stats = columnStats[col.name] || {};
          const isSelected = selectedColumn === col.name;
          const values = results.rows?.map(row => row[col.index]) || [];
          
          return (
            <div
              key={col.name}
              onClick={() => onSelectColumn?.(col.name)}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer border-b border-gray-50 ${
                isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {getTypeIcon(col.type)}
                <span className={`truncate ${isSelected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>
                  {col.name}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Sparkline values={values} type={col.type} />
                {stats.nullPct > 0 && (
                  <span className="text-[10px] text-teal-600 font-medium tabular-nums">
                    {stats.nullPct}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Selected column details */}
      {selectedColumn && (
        <div className="border-t border-gray-200 p-3 bg-slate-50">
          <div className="flex items-center gap-2 mb-2">
            {getTypeIcon(columns.find(c => c.name === selectedColumn)?.type)}
            <span className="font-medium text-gray-800">{selectedColumn}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Rows</span>
              <span className="text-gray-700 tabular-nums">{columnStats[selectedColumn]?.total?.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Null %</span>
              <span className="text-gray-700 tabular-nums">{columnStats[selectedColumn]?.nullPct || 0}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Distinct</span>
              <span className="text-gray-700 tabular-nums">{columnStats[selectedColumn]?.distinctCount?.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DATABASE/SCHEMA SELECTOR COMPONENT
// =============================================================================

function ContextSelector({ 
  connectionStatus,
  selectedDatabase,
  selectedSchema,
  onDatabaseChange,
  onSchemaChange
}) {
  const [databases, setDatabases] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [showDbDropdown, setShowDbDropdown] = useState(false);
  const [showSchemaDropdown, setShowSchemaDropdown] = useState(false);
  const [loadingDbs, setLoadingDbs] = useState(false);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  
  const { fetchDatabases, fetchSchemas } = useMetadata();
  const dbDropdownRef = useRef(null);
  const schemaDropdownRef = useRef(null);
  
  // Load databases when dropdown opens
  const handleOpenDbDropdown = useCallback(async () => {
    if (!connectionStatus?.connected) return;
    
    setShowDbDropdown(true);
    setShowSchemaDropdown(false);
    
    if (databases.length === 0) {
      setLoadingDbs(true);
      try {
        const dbs = await fetchDatabases();
        setDatabases(dbs || []);
      } catch (e) {
        // Database fetch failed - leave empty
      } finally {
        setLoadingDbs(false);
      }
    }
  }, [connectionStatus?.connected, databases.length, fetchDatabases]);
  
  // Load schemas when dropdown opens or database changes
  const handleOpenSchemaDropdown = useCallback(async () => {
    if (!connectionStatus?.connected || !selectedDatabase) return;
    
    setShowSchemaDropdown(true);
    setShowDbDropdown(false);
    
    setLoadingSchemas(true);
    try {
      const schemaList = await fetchSchemas(selectedDatabase);
      setSchemas(schemaList || []);
    } catch (e) {
      // Schema fetch failed - leave empty
    } finally {
      setLoadingSchemas(false);
    }
  }, [connectionStatus?.connected, selectedDatabase, fetchSchemas]);
  
  // Handle database selection
  const handleSelectDatabase = useCallback((dbName) => {
    onDatabaseChange?.(dbName);
    setShowDbDropdown(false);
    // Clear schemas when database changes
    setSchemas([]);
  }, [onDatabaseChange]);
  
  // Handle schema selection
  const handleSelectSchema = useCallback((schemaName) => {
    onSchemaChange?.(schemaName);
    setShowSchemaDropdown(false);
  }, [onSchemaChange]);
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dbDropdownRef.current && !dbDropdownRef.current.contains(e.target)) {
        setShowDbDropdown(false);
      }
      if (schemaDropdownRef.current && !schemaDropdownRef.current.contains(e.target)) {
        setShowSchemaDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const isConnected = connectionStatus?.connected;
  
  return (
    <div className="flex items-center gap-1">
      {/* Database Selector */}
      <div className="relative" ref={dbDropdownRef}>
        <button
          onClick={handleOpenDbDropdown}
          disabled={!isConnected}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm ${
            isConnected 
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer' 
              : 'bg-slate-50 text-slate-400 cursor-not-allowed'
          } ${showDbDropdown ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}`}
        >
          <Database size={12} className="text-blue-500" />
          <span className="font-mono max-w-[120px] truncate">{selectedDatabase}</span>
          <ChevronDown size={12} className={`transition-transform ${showDbDropdown ? 'rotate-180' : ''}`} />
        </button>
        
        {showDbDropdown && (
          <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-2 max-h-64 overflow-auto">
            <div className="px-2 py-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider border-b border-slate-100">
              Databases
            </div>
            {loadingDbs ? (
              <div className="px-3 py-4 text-center">
                <Loader2 size={16} className="animate-spin text-slate-400 mx-auto" />
              </div>
            ) : databases.length > 0 ? (
              databases.map((db) => (
                <button
                  key={db.name}
                  onClick={() => handleSelectDatabase(db.name)}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 ${
                    selectedDatabase === db.name ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                  }`}
                >
                  <Database size={12} className={selectedDatabase === db.name ? 'text-blue-500' : 'text-slate-400'} />
                  <span className="truncate">{db.name}</span>
                  {selectedDatabase === db.name && <Check size={12} className="ml-auto text-blue-500" />}
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-sm text-slate-400 text-center">
                No databases found
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Schema Selector */}
      <div className="relative" ref={schemaDropdownRef}>
        <button
          onClick={handleOpenSchemaDropdown}
          disabled={!isConnected || !selectedDatabase}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-sm ${
            isConnected && selectedDatabase
              ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer' 
              : 'bg-slate-50 text-slate-400 cursor-not-allowed'
          } ${showSchemaDropdown ? 'ring-2 ring-blue-400 ring-opacity-50' : ''}`}
        >
          <Layers size={12} className="text-blue-500" />
          <span className="font-mono max-w-[100px] truncate">{selectedSchema}</span>
          <ChevronDown size={12} className={`transition-transform ${showSchemaDropdown ? 'rotate-180' : ''}`} />
        </button>
        
        {showSchemaDropdown && (
          <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-2 max-h-64 overflow-auto">
            <div className="px-2 py-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider border-b border-slate-100">
              Schemas in {selectedDatabase}
            </div>
            {loadingSchemas ? (
              <div className="px-3 py-4 text-center">
                <Loader2 size={16} className="animate-spin text-slate-400 mx-auto" />
              </div>
            ) : schemas.length > 0 ? (
              schemas.map((schema) => (
                <button
                  key={schema.name}
                  onClick={() => handleSelectSchema(schema.name)}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 flex items-center gap-2 ${
                    selectedSchema === schema.name ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                  }`}
                >
                  <Layers size={12} className={selectedSchema === schema.name ? 'text-blue-500' : 'text-slate-400'} />
                  <span className="truncate">{schema.name}</span>
                  {selectedSchema === schema.name && <Check size={12} className="ml-auto text-blue-500" />}
                </button>
              ))
            ) : (
              <div className="px-3 py-3 text-sm text-slate-400 text-center">
                No schemas found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN QUERY EDITOR COMPONENT
// =============================================================================

export default function QueryEditor({
  initialQuery,
  onOpenConnectionModal,
  onOpenLineagePanel,
  globalDatabase,
  globalSchema,
  onDatabaseChange,
  onSchemaChange,
  discoveredTables = new Set(), // Tables discovered from schema scan
  sampleEntities = null, // Sample entities with GUIDs
}) {
  // Connection & query hooks
  const { 
    status: connectionStatus, 
    connect, 
    disconnect, 
    loading: connectionLoading 
  } = useConnection();
  
  const connStatus = connectionStatus;
  
  const {
    executeQuery,
    results,
    loading: queryLoading,
    error: queryError,
    clearResults
  } = useQuery();
  
  const { fetchHistory, history } = useQueryHistory();
  const { fetchTables } = useMetadata();
  
  // Local state for database/schema if not controlled externally
  const [localDatabase, setLocalDatabase] = useState(null);
  const [localSchema, setLocalSchema] = useState(null);
  
  // Generate default query based on discovered tables
  const getDefaultQuery = useCallback(() => {
    const db = globalDatabase || 'FIELD_METADATA';
    const schema = globalSchema || 'PUBLIC';
    
    // Find the best entity table to query
    const priorityTables = ['TABLE_ENTITY', 'PROCESS_ENTITY', 'COLUMN_ENTITY'];
    let targetTable = 'TABLE_ENTITY';
    
    if (discoveredTables?.size > 0) {
      for (const t of priorityTables) {
        if (discoveredTables.has(t)) {
          targetTable = t;
          break;
        }
      }
      // If no priority table found, use first discovered table
      if (!discoveredTables.has(targetTable)) {
        targetTable = [...discoveredTables][0];
      }
    }
    
    return `-- 🔍 Explore your most popular ${targetTable.replace('_ENTITY', '').toLowerCase()}s
-- Click "Tables" above to browse all discovered tables

SELECT 
    NAME,
    GUID,
    TYPENAME,
    STATUS,
    POPULARITYSCORE
FROM ${db}.${schema}.${targetTable}
WHERE NAME IS NOT NULL
ORDER BY POPULARITYSCORE DESC NULLS LAST
LIMIT 25;`;
  }, [globalDatabase, globalSchema, discoveredTables]);
  
  const [sql, setSql] = useState(initialQuery || getDefaultQuery());
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [editorHeight, setEditorHeight] = useState(250);
  const [showHistory, setShowHistory] = useState(false);
  
  // Row selection for exploration panel
  const [selectedRowIndex, setSelectedRowIndex] = useState(null);
  const [selectedRowData, setSelectedRowData] = useState(null);
  const [explorationTab, setExplorationTab] = useState('cell'); // 'cell' or 'lineage'
  
  const editorRef = useRef(null);
  const containerRef = useRef(null);
  
  // Use global db/schema, then local state, then connection defaults
  const selectedDatabase = globalDatabase || localDatabase || connStatus?.database || 'FIELD_METADATA';
  const selectedSchema = globalSchema || localSchema || connStatus?.schema || 'PUBLIC';
  
  // Handlers for database/schema changes
  const handleDatabaseChange = useCallback((db) => {
    if (onDatabaseChange) {
      onDatabaseChange(db);
    } else {
      setLocalDatabase(db);
      // Reset schema when database changes (if not externally controlled)
      if (!onSchemaChange) {
        setLocalSchema('PUBLIC');
      }
    }
  }, [onDatabaseChange, onSchemaChange]);
  
  const handleSchemaChange = useCallback((schema) => {
    if (onSchemaChange) {
      onSchemaChange(schema);
    } else {
      setLocalSchema(schema);
    }
  }, [onSchemaChange]);
  
  // Update SQL when initial query changes
  useEffect(() => {
    if (initialQuery && initialQuery !== sql) {
      setSql(initialQuery);
    }
  }, [initialQuery]);
  
  // Update default query when discovered tables change (only if using default)
  useEffect(() => {
    if (!initialQuery && discoveredTables?.size > 0) {
      const defaultQuery = getDefaultQuery();
      // Only update if current SQL still has placeholders or is the old default
      if (sql.includes('{{TABLE}}') || sql.includes('{{DATABASE}}') || sql.includes('TABLE_ENTITY')) {
        setSql(defaultQuery);
      }
    }
  }, [discoveredTables, initialQuery, getDefaultQuery]);
  
  // Handle editor mount
  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    
    // Add keyboard shortcut
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => handleExecute()
    });
  };
  
  // Execute query
  const handleExecute = useCallback(() => {
    if (!sql.trim() || !connectionStatus?.connected) return;
    
    executeQuery(sql, {
      database: selectedDatabase,
      schema: selectedSchema,
        warehouse: connStatus?.warehouse
      });
    
      fetchHistory();
    setSelectedColumn(null);
    // Clear row selection when executing new query
    setSelectedRowIndex(null);
    setSelectedRowData(null);
  }, [sql, connectionStatus, selectedDatabase, selectedSchema, connStatus, executeQuery, fetchHistory]);
  
  // Handle row selection in results table
  const handleRowSelect = useCallback((rowIndex, rowData) => {
    setSelectedRowIndex(rowIndex);
    setSelectedRowData(rowData);
    // Auto-switch to lineage tab if the row has a GUID (entity data)
    if (rowData?.GUID || rowData?.guid) {
      setExplorationTab('lineage');
    }
  }, []);
  
  // Insert table into editor using safe FQN builder
  const handleSelectTable = (tableName) => {
    // Use buildSafeFQN to create a properly escaped fully-qualified name
    const fullName = buildSafeFQN(selectedDatabase, selectedSchema, tableName);
    if (editorRef.current && fullName) {
      const editor = editorRef.current;
      const position = editor.getPosition();
      editor.executeEdits('insertTable', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        },
        text: fullName
      }]);
      editor.focus();
    }
  };
  
  // Load query from history
  const handleSelectHistoryQuery = (query) => {
    setSql(query);
    setShowHistory(false);
    editorRef.current?.focus();
  };
  
  return (
    <div 
      ref={containerRef}
      className="flex h-[calc(100vh-200px)] min-h-[600px] bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-lg"
    >
      {/* Left Panel - Schema Explorer */}
      {showLeftPanel && (
        <ResizablePanel
          direction="horizontal"
          initialSize={240}
          minSize={180}
          maxSize={400}
          className="border-r border-gray-200 bg-slate-50"
        >
          <SchemaTree
            database={selectedDatabase}
            schema={selectedSchema}
            onSelectTable={handleSelectTable}
            onDatabaseChange={handleDatabaseChange}
            onSchemaChange={handleSchemaChange}
            connectionStatus={connectionStatus}
            executeQuery={executeQuery}
            mdlhDatabase={globalDatabase || 'FIELD_METADATA'}
            mdlhSchema={globalSchema || 'PUBLIC'}
            onOpenLineage={(entity) => {
              // Open lineage panel with the selected entity
              onOpenLineagePanel?.({
                GUID: entity.guid,
                NAME: entity.name,
                TYPENAME: entity.typename,
                database: entity.database,
                schema: entity.schema
              });
            }}
          />
        </ResizablePanel>
      )}
      
      {/* Center Panel - Editor + Results */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
          <button
            onClick={handleExecute}
            disabled={queryLoading || !sql.trim() || !connectionStatus?.connected}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {queryLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
                <Play size={14} />
            )}
              Run
          </button>
          
            <div className="h-5 w-px bg-gray-200 mx-1" />
            
            <ContextSelector
              connectionStatus={connectionStatus}
              selectedDatabase={selectedDatabase}
              selectedSchema={selectedSchema}
              onDatabaseChange={handleDatabaseChange}
              onSchemaChange={handleSchemaChange}
            />
            
            <div className="h-5 w-px bg-slate-200 mx-1" />
            
            {/* Query Suggestions */}
            <QuerySuggestionsDropdown
              database={selectedDatabase}
              schema={selectedSchema}
              discoveredTables={discoveredTables}
              sampleEntities={sampleEntities}
              onSelectQuery={(sql) => {
                setSql(sql);
                editorRef.current?.focus();
              }}
              disabled={!connectionStatus?.connected}
            />
            
            {/* Table Selector - Quick insert FQN with quick actions */}
            <TableSelector
              database={selectedDatabase}
              schema={selectedSchema}
              discoveredTables={discoveredTables}
              onInsertTable={(fqn, tableName) => {
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
              }}
              onPreviewTable={(fqn, tableName) => {
                const query = `SELECT * FROM ${fqn} LIMIT 100;`;
                setSql(query);
                setTimeout(() => executeQuery(query), 100);
              }}
              onViewLineage={(fqn, tableName) => {
                onOpenLineagePanel?.();
              }}
              onGenerateSelect={(fqn, tableName) => {
                const query = `SELECT *\nFROM ${fqn}\nLIMIT 100;`;
                setSql(query);
                if (editorRef.current) {
                  editorRef.current.focus();
                }
              }}
              onDescribeTable={(fqn, tableName) => {
                const query = `DESCRIBE TABLE ${fqn};`;
                setSql(query);
                setTimeout(() => executeQuery(query), 100);
              }}
              disabled={!connectionStatus?.connected}
            />
          </div>
          
          <div className="flex items-center gap-1">
          <button
              onClick={() => setShowLeftPanel(!showLeftPanel)}
              className={`p-1.5 rounded hover:bg-gray-100 ${showLeftPanel ? 'text-blue-600' : 'text-gray-400'}`}
              title="Toggle schema browser"
          >
              <PanelLeft size={16} />
          </button>
            <button
              onClick={() => setShowRightPanel(!showRightPanel)}
              className={`p-1.5 rounded hover:bg-gray-100 ${showRightPanel ? 'text-blue-600' : 'text-gray-400'}`}
              title="Toggle column diagnostics"
            >
              <Columns size={16} />
            </button>
            {onOpenLineagePanel && (
              <button
                onClick={onOpenLineagePanel}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-amber-600"
                title="View lineage panel"
              >
                <GitBranch size={16} />
              </button>
            )}
            <button
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) fetchHistory();
              }}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title="Query history"
            >
              <History size={16} />
            </button>
          </div>
        </div>
        
        {/* Editor */}
        <ResizablePanel
          direction="vertical"
          initialSize={editorHeight}
          minSize={100}
          maxSize={500}
          onResize={setEditorHeight}
          className="border-b border-gray-200"
        >
            <Editor
              height="100%"
              defaultLanguage="sql"
              value={sql}
            onChange={setSql}
            onMount={handleEditorDidMount}
              theme="vs"
              options={{
                fontSize: 13,
              fontFamily: "'SF Mono', 'Monaco', 'Consolas', monospace",
                lineNumbers: 'on',
              minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
              padding: { top: 8, bottom: 8 },
              lineHeight: 20,
              renderLineHighlight: 'line',
              folding: false,
              glyphMargin: false,
              lineDecorationsWidth: 8,
              lineNumbersMinChars: 3,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              scrollbar: {
                vertical: 'auto',
                horizontal: 'auto',
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8
              }
            }}
          />
        </ResizablePanel>
          
          {/* Results */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Results header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-gray-100 text-xs text-gray-500">
            <span>Query results</span>
            {results?.rows && (
              <div className="flex items-center gap-3">
                <span className="tabular-nums">{results.rows.length.toLocaleString()} Rows</span>
                <button className="p-1 hover:bg-gray-200 rounded" title="Filter">
                  <Filter size={12} />
                </button>
                <button className="p-1 hover:bg-gray-200 rounded" title="Copy">
                  <Copy size={12} />
                </button>
              </div>
            )}
          </div>
          
          {/* Results table */}
          <div className="flex-1 overflow-auto">
            {queryLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : queryError ? (
              <div className="p-4 text-red-600 text-sm">
                <AlertTriangle size={16} className="inline mr-2" />
                {queryError}
              </div>
            ) : results?.rows ? (
              <table className="w-full text-[13px]">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {results.columns?.map((col, i) => (
                      <th
                        key={col}
                        onClick={() => setSelectedColumn(col)}
                        className={`px-3 py-2 text-left font-medium border-b border-r border-gray-200 cursor-pointer hover:bg-slate-100 ${
                          selectedColumn === col ? 'bg-blue-50 text-blue-700' : 'text-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400 font-mono">
                            {results.columnTypes?.[i]?.includes('INT') || results.columnTypes?.[i]?.includes('NUMBER') ? '123' : 'T'}
                          </span>
                          <span className="truncate">{col}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Detect if results have lineage-capable columns (GUID + NAME)
                    const upperCols = results.columns?.map(c => c?.toUpperCase()) || [];
                    const guidIdx = upperCols.indexOf('GUID');
                    const nameIdx = upperCols.indexOf('NAME');
                    const hasLineageColumns = guidIdx >= 0 && nameIdx >= 0 && onOpenLineagePanel;

                    return results.rows.slice(0, 1000).map((row, rowIdx) => {
                      // Build row data object for selection
                      const rowData = {};
                      results.columns?.forEach((col, i) => {
                        rowData[col] = row[i];
                      });
                      const isRowSelected = selectedRowIndex === rowIdx;
                      const rowGuid = hasLineageColumns ? row[guidIdx] : null;
                      const rowName = hasLineageColumns ? row[nameIdx] : null;

                      return (
                        <tr
                          key={rowIdx}
                          onClick={() => handleRowSelect(rowIdx, rowData)}
                          className={`cursor-pointer transition-colors group relative ${
                            isRowSelected
                              ? 'bg-blue-100 hover:bg-blue-100'
                              : rowIdx % 2 === 0
                                ? 'bg-white hover:bg-blue-50/50'
                                : 'bg-slate-50/50 hover:bg-blue-50/50'
                          }`}
                        >
                          {row.map((cell, cellIdx) => (
                            <td
                              key={cellIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedColumn(results.columns[cellIdx]);
                                handleRowSelect(rowIdx, rowData);
                              }}
                              className={`px-3 py-1.5 border-b border-r border-gray-100 truncate max-w-[300px] ${
                                selectedColumn === results.columns[cellIdx] ? 'bg-blue-50/50' : ''
                              }`}
                            >
                              {cell === null ? (
                                <span className="text-gray-300 italic">null</span>
                              ) : (
                                String(cell)
                              )}
                            </td>
                          ))}
                          {/* Enhanced floating hover action bar - wrapped in td for valid DOM nesting */}
                          {hasLineageColumns && rowGuid && (
                            <td className="relative p-0 border-0 w-0">
                              <RowActionBar
                                rowGuid={rowGuid}
                                rowName={rowName}
                                rowData={rowData}
                                database={selectedDatabase}
                                schema={selectedSchema}
                                onOpenLineage={() => {
                                  onOpenLineagePanel?.({
                                    GUID: rowGuid,
                                    NAME: rowName,
                                    TYPENAME: rowData.TYPENAME || 'Table'
                                  });
                                }}
                                onRunQuery={(query) => {
                                  setSql(query);
                                  setTimeout(() => executeQuery(query), 100);
                                }}
                                onExplore={() => {
                                  handleRowSelect(rowIdx, rowData);
                                  setShowRightPanel(true);
                                  setExplorationTab('lineage');
                                }}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Run a query to see results
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Right Panel - Column Diagnostics */}
      {showRightPanel && (
        <ResizablePanel
          direction="horizontal"
          initialSize={280}
          minSize={200}
          maxSize={400}
          className="border-l border-gray-200"
        >
          <ExplorationPanel
            results={results}
            selectedColumn={selectedColumn}
            onSelectColumn={setSelectedColumn}
            selectedRowData={selectedRowData}
            activeTab={explorationTab}
            onTabChange={setExplorationTab}
            onOpenLineagePanel={onOpenLineagePanel}
            database={selectedDatabase}
            schema={selectedSchema}
            onRunQuery={(query) => {
              setSql(query);
              setTimeout(() => executeQuery(query), 100);
            }}
            onCollapse={() => setShowRightPanel(false)}
          />
        </ResizablePanel>
      )}

      {/* History dropdown */}
      {showHistory && (
        <div className="absolute top-12 right-4 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-auto">
          <div className="px-3 py-2 border-b border-gray-100 font-medium text-sm text-gray-700">
            Query History
            </div>
          {history?.length > 0 ? (
            history.slice(0, 20).map((item, i) => (
              <div
                key={i}
                onClick={() => handleSelectHistoryQuery(item.query || item)}
                className="px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50"
              >
                <div className="text-xs text-gray-500 mb-1">
                  {item.timestamp ? new Date(item.timestamp).toLocaleString() : `Query ${i + 1}`}
          </div>
                <div className="text-sm text-gray-700 font-mono truncate">
                  {(item.query || item).substring(0, 100)}...
        </div>
      </div>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-gray-400 text-sm">
              No history yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
