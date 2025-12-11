/**
 * Schema Explorer - Atlan-style tree browser for databases, schemas, tables, and columns
 * Matches the Atlan UI pattern with expandable hierarchy and data types
 *
 * Features:
 * - Tree navigation with expandable nodes
 * - Context menu with quick actions (Insert, Preview, View Details, Lineage)
 * - Search/filter functionality
 * - Type icons for different data types
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ChevronRight, ChevronDown, Database, Layers, Table2,
  Eye, Columns, RefreshCw, Loader2, Hash, Type, Calendar,
  ToggleLeft, Code2, List, Braces, Search, Filter, X,
  Plus, Play, Info, GitBranch, Copy, MoreVertical, FileText
} from 'lucide-react';
import { useMetadata } from '../hooks/useSnowflake';
import { buildSafeFQN } from '../utils/queryHelpers';

// Type icons for different data types
const TypeIcon = ({ dataType }) => {
  const type = (dataType || '').toUpperCase().split('(')[0];
  
  if (['VARCHAR', 'CHAR', 'STRING', 'TEXT'].includes(type)) {
    return <Type size={12} className="text-green-500" />;
  }
  if (['NUMBER', 'INTEGER', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE'].includes(type)) {
    return <Hash size={12} className="text-blue-500" />;
  }
  if (['BOOLEAN', 'BOOL'].includes(type)) {
    return <ToggleLeft size={12} className="text-purple-500" />;
  }
  if (['DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'TIMESTAMP_NTZ', 'TIMESTAMP_LTZ', 'TIMESTAMP_TZ'].includes(type)) {
    return <Calendar size={12} className="text-amber-500" />;
  }
  if (['VARIANT', 'OBJECT'].includes(type)) {
    return <Braces size={12} className="text-pink-500" />;
  }
  if (['ARRAY'].includes(type)) {
    return <List size={12} className="text-pink-500" />;
  }
  return <Code2 size={12} className="text-gray-400" />;
};

// Format data type for display
const formatDataType = (dataType) => {
  if (!dataType) return '';
  const type = dataType.toUpperCase();

  // Simplify common types
  if (type.startsWith('VARCHAR')) return 'string';
  if (type.startsWith('NUMBER')) return 'number';
  if (type === 'BOOLEAN') return 'boolean';
  if (type.startsWith('TIMESTAMP')) return 'timestamp';
  if (type === 'DATE') return 'date';
  if (type === 'VARIANT') return 'variant';
  if (type === 'ARRAY') return 'array';
  if (type === 'OBJECT') return 'object';
  if (type.startsWith('FLOAT') || type.startsWith('DOUBLE')) return 'double';
  if (type.startsWith('INT') || type === 'BIGINT') return 'bigint';

  return type.toLowerCase();
};

// =============================================================================
// Context Menu - Quick actions for tables/columns
// =============================================================================

function ContextMenu({ x, y, onClose, actions }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  const adjustedStyle = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - 300),
    zIndex: 9999,
  };

  return (
    <div
      ref={menuRef}
      style={adjustedStyle}
      className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px] animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {actions.map((action, idx) => (
        action.divider ? (
          <div key={idx} className="border-t border-gray-100 my-1" />
        ) : (
          <button
            key={action.id || idx}
            onClick={() => {
              action.onClick();
              onClose();
            }}
            disabled={action.disabled}
            className={`w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm transition-colors ${
              action.disabled
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-700 hover:bg-blue-50 hover:text-blue-700'
            }`}
          >
            {action.icon && <action.icon size={14} className={action.disabled ? 'text-gray-300' : 'text-gray-400'} />}
            <span className="flex-1">{action.label}</span>
            {action.shortcut && (
              <span className="text-[10px] text-gray-400 font-mono">{action.shortcut}</span>
            )}
          </button>
        )
      ))}
    </div>
  );
}

// =============================================================================
// Quick Action Bar - Inline actions for selected item
// =============================================================================

function QuickActionBar({ onInsert, onPreview, onViewDetails, onLineage, tableName }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100">
      <span className="text-xs text-blue-700 font-medium truncate flex-1 mr-2">
        {tableName}
      </span>
      <button
        onClick={onInsert}
        className="p-1.5 rounded hover:bg-blue-100 text-blue-600 transition-colors"
        title="Insert into query (Enter)"
      >
        <Plus size={14} />
      </button>
      <button
        onClick={onPreview}
        className="p-1.5 rounded hover:bg-blue-100 text-blue-600 transition-colors"
        title="Preview data (P)"
      >
        <Eye size={14} />
      </button>
      <button
        onClick={onViewDetails}
        className="p-1.5 rounded hover:bg-blue-100 text-blue-600 transition-colors"
        title="View details (D)"
      >
        <Info size={14} />
      </button>
      <button
        onClick={onLineage}
        className="p-1.5 rounded hover:bg-purple-100 text-purple-600 transition-colors"
        title="View lineage (L)"
      >
        <GitBranch size={14} />
      </button>
    </div>
  );
}

// Context Header - shows current connection/database/schema
function ContextHeader({ 
  connectionName, 
  database, 
  schema, 
  onDatabaseClick, 
  onSchemaClick 
}) {
  return (
    <div className="border-b border-gray-200 bg-white">
      {/* Connection */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <div className="p-1.5 bg-amber-100 rounded">
          <Database size={16} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500">Connection</div>
          <div className="text-sm font-medium text-gray-900 truncate">
            {connectionName || 'snowflake'}
          </div>
        </div>
        <ChevronRight size={16} className="text-gray-300" />
      </div>
      
      {/* Database */}
      <button 
        onClick={onDatabaseClick}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-gray-50 transition-colors"
      >
        <div className="p-1.5 bg-blue-100 rounded">
          <Database size={16} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs text-gray-500">Database</div>
          <div className="text-sm font-medium text-gray-900 truncate">
            {database || 'Select database'}
          </div>
        </div>
        <ChevronRight size={16} className="text-gray-300" />
      </button>
      
      {/* Schema */}
      <button 
        onClick={onSchemaClick}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
      >
        <div className="p-1.5 bg-purple-100 rounded">
          <Layers size={16} className="text-purple-600" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-xs text-gray-500">Schema</div>
          <div className="text-sm font-medium text-gray-900 truncate">
            {schema || 'Select schema'}
          </div>
        </div>
        <ChevronRight size={16} className="text-gray-300" />
      </button>
    </div>
  );
}

// Table row in the tree
function TableRow({
  table,
  isExpanded,
  isLoading,
  isSelected,
  onToggle,
  onSelect,
  onInsert,
  onPreview,
  onViewDetails,
  onLineage,
  onContextMenu,
  columnCount
}) {
  const isView = table.kind === 'VIEW';

  const handleContextMenu = (e) => {
    e.preventDefault();
    onContextMenu?.(e, table);
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer group border-b border-gray-50 transition-colors ${
        isSelected
          ? 'bg-blue-50 border-l-2 border-l-blue-500'
          : 'hover:bg-gray-50 border-l-2 border-l-transparent'
      }`}
      onClick={() => onSelect?.(table)}
      onContextMenu={handleContextMenu}
    >
      <button
        className="p-0.5 hover:bg-gray-200 rounded"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {isLoading ? (
          <Loader2 size={14} className="text-gray-400 animate-spin" />
        ) : isExpanded ? (
          <ChevronDown size={14} className="text-gray-500" />
        ) : (
          <ChevronRight size={14} className="text-gray-400" />
        )}
      </button>

      {isView ? (
        <Eye size={14} className="text-amber-500 flex-shrink-0" />
      ) : (
        <Table2 size={14} className="text-emerald-500 flex-shrink-0" />
      )}

      <span className={`text-sm truncate flex-1 font-medium ${isSelected ? 'text-blue-800' : 'text-gray-800'}`}>
        {table.name}
      </span>

      {/* Column count badge */}
      {columnCount !== undefined && (
        <span className="text-xs text-gray-400 tabular-nums bg-gray-100 px-1.5 py-0.5 rounded">
          {columnCount}
        </span>
      )}

      {/* Quick action buttons on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 rounded hover:bg-blue-100 text-blue-500"
          onClick={(e) => {
            e.stopPropagation();
            onInsert();
          }}
          title="Insert into query"
        >
          <Plus size={12} />
        </button>
        <button
          className="p-1 rounded hover:bg-blue-100 text-blue-500"
          onClick={(e) => {
            e.stopPropagation();
            onPreview?.();
          }}
          title="Preview data"
        >
          <Eye size={12} />
        </button>
        <button
          className="p-1 rounded hover:bg-purple-100 text-purple-500"
          onClick={(e) => {
            e.stopPropagation();
            onLineage?.();
          }}
          title="View lineage"
        >
          <GitBranch size={12} />
        </button>
        <button
          className="p-1 rounded hover:bg-gray-200 text-gray-400"
          onClick={(e) => {
            e.stopPropagation();
            handleContextMenu(e);
          }}
          title="More actions"
        >
          <MoreVertical size={12} />
        </button>
      </div>
    </div>
  );
}

// Column row in the tree
function ColumnRow({ column, onInsert }) {
  const dataType = column.data_type || column.type || 'UNKNOWN';
  const formattedType = formatDataType(dataType);
  
  return (
    <div 
      className="flex items-center gap-2 pl-10 pr-3 py-1 hover:bg-gray-50 cursor-pointer group"
      onClick={() => onInsert(column.name)}
    >
      <TypeIcon dataType={dataType} />
      
      <span className="text-sm text-gray-700 truncate flex-1">
        {column.name}
      </span>
      
      <span className="text-xs text-gray-400 font-mono">
        {formattedType}
      </span>
    </div>
  );
}

// Search/Filter bar
function SearchBar({ value, onChange, placeholder }) {
  return (
    <div className="px-3 py-2 border-b border-gray-200">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {value && (
          <button 
            onClick={() => onChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function SchemaExplorer({
  onInsertText,
  onPreviewTable,
  onViewTableDetails,
  onOpenLineage,
  onRunQuery,
  defaultDatabase,
  defaultSchema,
  isConnected,
  connectionName = 'snowflake'
}) {
  const { fetchDatabases, fetchSchemas, fetchTables, fetchColumns, refreshCache, loading } = useMetadata();

  const [selectedDatabase, setSelectedDatabase] = useState(defaultDatabase || '');
  const [selectedSchema, setSelectedSchema] = useState(defaultSchema || '');
  const [databases, setDatabases] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [tables, setTables] = useState([]);
  const [columns, setColumns] = useState({});
  const [expanded, setExpanded] = useState({});
  const [loadingNodes, setLoadingNodes] = useState({});
  const [searchFilter, setSearchFilter] = useState('');
  const [showDatabasePicker, setShowDatabasePicker] = useState(false);
  const [showSchemaPicker, setShowSchemaPicker] = useState(false);

  // Selection and context menu state
  const [selectedTable, setSelectedTable] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, table }
  
  // Load databases on mount
  useEffect(() => {
    if (isConnected) {
      loadDatabases();
    }
  }, [isConnected]);
  
  // Update from props
  useEffect(() => {
    if (defaultDatabase && defaultDatabase !== selectedDatabase) {
      setSelectedDatabase(defaultDatabase);
    }
  }, [defaultDatabase]);
  
  useEffect(() => {
    if (defaultSchema && defaultSchema !== selectedSchema) {
      setSelectedSchema(defaultSchema);
    }
  }, [defaultSchema]);
  
  // Load schemas when database changes
  useEffect(() => {
    if (selectedDatabase) {
      loadSchemas(selectedDatabase);
    }
  }, [selectedDatabase]);
  
  // Load tables when schema changes
  useEffect(() => {
    if (selectedDatabase && selectedSchema) {
      loadTables(selectedDatabase, selectedSchema);
    }
  }, [selectedDatabase, selectedSchema]);
  
  const loadDatabases = async () => {
    const data = await fetchDatabases();
    setDatabases(data || []);
  };
  
  const loadSchemas = async (db) => {
    const data = await fetchSchemas(db);
    setSchemas(data || []);
  };
  
  const loadTables = async (db, schema) => {
    const data = await fetchTables(db, schema);
    setTables(data || []);
  };
  
  const toggleTable = async (tableName) => {
    const key = `table:${tableName}`;
    
    if (expanded[key]) {
      setExpanded(prev => ({ ...prev, [key]: false }));
      return;
    }
    
    // Load columns if not already loaded
    if (!columns[tableName]) {
      setLoadingNodes(prev => ({ ...prev, [key]: true }));
      const columnList = await fetchColumns(selectedDatabase, selectedSchema, tableName);
      setColumns(prev => ({ ...prev, [tableName]: columnList || [] }));
      setLoadingNodes(prev => ({ ...prev, [key]: false }));
    }
    
    setExpanded(prev => ({ ...prev, [key]: true }));
  };
  
  const handleRefresh = async () => {
    await refreshCache();
    setColumns({});
    setExpanded({});
    if (selectedDatabase && selectedSchema) {
      await loadTables(selectedDatabase, selectedSchema);
    }
  };
  
  /**
   * Insert text into the editor
   * For tables, we build a fully qualified name (FQN) using buildSafeFQN
   * For columns, we just insert the column name
   */
  const insertText = (text, isTable = false) => {
    if (isTable && selectedDatabase && selectedSchema) {
      // Build FQN for tables using the safe helper
      const fqn = buildSafeFQN(selectedDatabase, selectedSchema, text);
      onInsertText?.(fqn || text);
    } else {
      // For columns, just insert the name
      onInsertText?.(text);
    }
  };

  // Context menu handlers
  const handleContextMenu = useCallback((e, table) => {
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      table: table
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handlePreviewTable = useCallback((tableName) => {
    const fqn = buildSafeFQN(selectedDatabase, selectedSchema, tableName);
    const query = `SELECT * FROM ${fqn} LIMIT 100`;
    onPreviewTable?.(query, tableName);
    onRunQuery?.(query);
  }, [selectedDatabase, selectedSchema, onPreviewTable, onRunQuery]);

  const handleViewDetails = useCallback((tableName) => {
    const fqn = buildSafeFQN(selectedDatabase, selectedSchema, tableName);
    onViewTableDetails?.(tableName, fqn, selectedDatabase, selectedSchema);
  }, [selectedDatabase, selectedSchema, onViewTableDetails]);

  const handleOpenLineage = useCallback((tableName) => {
    const fqn = buildSafeFQN(selectedDatabase, selectedSchema, tableName);
    onOpenLineage?.({ name: tableName, qualifiedName: fqn });
  }, [selectedDatabase, selectedSchema, onOpenLineage]);

  const handleCopyName = useCallback((tableName, asFqn = false) => {
    const text = asFqn ? buildSafeFQN(selectedDatabase, selectedSchema, tableName) : tableName;
    navigator.clipboard.writeText(text);
  }, [selectedDatabase, selectedSchema]);

  const handleGenerateSelect = useCallback((tableName) => {
    const fqn = buildSafeFQN(selectedDatabase, selectedSchema, tableName);
    const query = `SELECT *\nFROM ${fqn}\nLIMIT 100;`;
    onInsertText?.(query);
  }, [selectedDatabase, selectedSchema, onInsertText]);

  const handleDescribeTable = useCallback((tableName) => {
    const fqn = buildSafeFQN(selectedDatabase, selectedSchema, tableName);
    const query = `DESCRIBE TABLE ${fqn};`;
    onRunQuery?.(query);
  }, [selectedDatabase, selectedSchema, onRunQuery]);

  // Build context menu actions for a table
  const getTableContextActions = useCallback((table) => [
    { id: 'insert', label: 'Insert into Query', icon: Plus, onClick: () => insertText(table.name, true), shortcut: 'Enter' },
    { id: 'select', label: 'Generate SELECT *', icon: FileText, onClick: () => handleGenerateSelect(table.name) },
    { divider: true },
    { id: 'preview', label: 'Preview Data', icon: Eye, onClick: () => handlePreviewTable(table.name), shortcut: 'P' },
    { id: 'describe', label: 'Describe Table', icon: Info, onClick: () => handleDescribeTable(table.name) },
    { id: 'lineage', label: 'View Lineage', icon: GitBranch, onClick: () => handleOpenLineage(table.name), shortcut: 'L' },
    { divider: true },
    { id: 'copy-name', label: 'Copy Name', icon: Copy, onClick: () => handleCopyName(table.name, false) },
    { id: 'copy-fqn', label: 'Copy Full Path', icon: Copy, onClick: () => handleCopyName(table.name, true) },
  ], [insertText, handleGenerateSelect, handlePreviewTable, handleDescribeTable, handleOpenLineage, handleCopyName]);

  // Filter tables based on search
  const filteredTables = useMemo(() => {
    if (!searchFilter) return tables;
    const filter = searchFilter.toLowerCase();
    return tables.filter(t => t.name.toLowerCase().includes(filter));
  }, [tables, searchFilter]);
  
  // Group tables by type (tables vs views)
  const { regularTables, views } = useMemo(() => {
    const regular = filteredTables.filter(t => t.kind !== 'VIEW');
    const v = filteredTables.filter(t => t.kind === 'VIEW');
    return { regularTables: regular, views: v };
  }, [filteredTables]);
  
  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      {/* Context Header */}
      <ContextHeader
        connectionName={connectionName}
        database={selectedDatabase}
        schema={selectedSchema}
        onDatabaseClick={() => setShowDatabasePicker(!showDatabasePicker)}
        onSchemaClick={() => setShowSchemaPicker(!showSchemaPicker)}
      />
      
      {/* Database Picker Dropdown */}
      {showDatabasePicker && (
        <div className="border-b border-gray-200 bg-gray-50 max-h-48 overflow-y-auto">
          {databases.map(db => (
            <button
              key={db.name}
              onClick={() => {
                setSelectedDatabase(db.name);
                setSelectedSchema('');
                setTables([]);
                setShowDatabasePicker(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 ${
                selectedDatabase === db.name ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
              }`}
            >
              {db.name}
            </button>
          ))}
        </div>
      )}
      
      {/* Schema Picker Dropdown */}
      {showSchemaPicker && selectedDatabase && (
        <div className="border-b border-gray-200 bg-gray-50 max-h-48 overflow-y-auto">
          {schemas.map(schema => (
            <button
              key={schema.name}
              onClick={() => {
                setSelectedSchema(schema.name);
                setShowSchemaPicker(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 ${
                selectedSchema === schema.name ? 'bg-blue-100 text-blue-700' : 'text-gray-700'
              }`}
            >
              {schema.name}
            </button>
          ))}
        </div>
      )}
      
      {/* Search Filter */}
      {tables.length > 0 && (
        <SearchBar
          value={searchFilter}
          onChange={setSearchFilter}
          placeholder="Filter tables..."
        />
      )}
      
      {/* Refresh Button & Stats */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-xs text-gray-500">
          {tables.length} tables {searchFilter && `(${filteredTables.length} shown)`}
        </span>
        <button 
          onClick={handleRefresh}
          className="p-1.5 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
          title="Refresh metadata"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      
      {/* Tables & Columns Tree */}
      <div className="flex-1 overflow-y-auto">
        {!selectedDatabase || !selectedSchema ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <Database size={32} className="mx-auto mb-2 opacity-50" />
            <p>Select a database and schema</p>
            <p className="text-xs mt-1">to browse tables and columns</p>
          </div>
        ) : tables.length === 0 && !loading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            <Table2 size={32} className="mx-auto mb-2 opacity-50" />
            <p>No tables found</p>
            <p className="text-xs mt-1">in {selectedDatabase}.{selectedSchema}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* Selected table action bar */}
            {selectedTable && (
              <QuickActionBar
                tableName={selectedTable.name}
                onInsert={() => insertText(selectedTable.name, true)}
                onPreview={() => handlePreviewTable(selectedTable.name)}
                onViewDetails={() => handleViewDetails(selectedTable.name)}
                onLineage={() => handleOpenLineage(selectedTable.name)}
              />
            )}

            {/* Regular Tables */}
            {regularTables.map(table => (
              <div key={table.name}>
                <TableRow
                  table={table}
                  isExpanded={expanded[`table:${table.name}`]}
                  isLoading={loadingNodes[`table:${table.name}`]}
                  isSelected={selectedTable?.name === table.name}
                  onToggle={() => toggleTable(table.name)}
                  onSelect={(t) => setSelectedTable(t)}
                  onInsert={() => insertText(table.name, true)}
                  onPreview={() => handlePreviewTable(table.name)}
                  onViewDetails={() => handleViewDetails(table.name)}
                  onLineage={() => handleOpenLineage(table.name)}
                  onContextMenu={handleContextMenu}
                  columnCount={columns[table.name]?.length}
                />

                {/* Columns */}
                {expanded[`table:${table.name}`] && columns[table.name] && (
                  <div className="bg-gray-50/50">
                    {columns[table.name].map(col => (
                      <ColumnRow
                        key={col.name}
                        column={col}
                        onInsert={insertText}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            
            {/* Views section */}
            {views.length > 0 && (
              <>
                <div className="px-3 py-1.5 bg-gray-100 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Views ({views.length})
                </div>
                {views.map(view => (
                  <div key={view.name}>
                    <TableRow
                      table={view}
                      isExpanded={expanded[`table:${view.name}`]}
                      isLoading={loadingNodes[`table:${view.name}`]}
                      isSelected={selectedTable?.name === view.name}
                      onToggle={() => toggleTable(view.name)}
                      onSelect={(t) => setSelectedTable(t)}
                      onInsert={() => insertText(view.name, true)}
                      onPreview={() => handlePreviewTable(view.name)}
                      onViewDetails={() => handleViewDetails(view.name)}
                      onLineage={() => handleOpenLineage(view.name)}
                      onContextMenu={handleContextMenu}
                      columnCount={columns[view.name]?.length}
                    />

                    {expanded[`table:${view.name}`] && columns[view.name] && (
                      <div className="bg-gray-50/50">
                        {columns[view.name].map(col => (
                          <ColumnRow
                            key={col.name}
                            column={col}
                            onInsert={insertText}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          actions={getTableContextActions(contextMenu.table)}
        />
      )}
    </div>
  );
}
