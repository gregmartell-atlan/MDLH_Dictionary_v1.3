/**
 * Results Table - Display query results with pagination and export
 *
 * Performance optimizations:
 * - React.memo on main component and sub-components
 * - Memoized cell renderers
 * - Early return in detectMetadataResults
 */

import React, { useMemo, useState, useCallback, memo, useRef, useDeferredValue } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';
import { 
  ArrowUpDown, ArrowUp, ArrowDown, Download, Copy, Check,
  ChevronLeft, ChevronRight, Loader2, AlertCircle, Search, Wand2, Play,
  Table as TableIcon, Plus, GitBranch, ChevronDown, ArrowRight
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EntityRowActions, isEntityRow, buildEntityFromRow } from './EntityActions';
import { isLineageQueryResult, transformLineageResultsToGraph } from '../services/lineageService';
import { LineageRail } from './lineage/LineageRail';

/**
 * Detect if results are from a SHOW TABLES or similar metadata query
 * Optimized with early returns to avoid unnecessary checks
 * @param {Object} results - Query results
 * @returns {Object|null} - { type: 'tables'|'databases'|'schemas', nameColumn: string }
 */
function detectMetadataResults(results) {
  if (!results?.columns || !results?.rows?.length) return null;

  // Pre-compute column names once (avoid recomputing in each check)
  const colNames = results.columns.map(c =>
    (typeof c === 'string' ? c : c.name || '').toLowerCase()
  );

  const hasName = colNames.includes('name');
  const hasKind = colNames.includes('kind');
  const hasDbName = colNames.includes('database_name');
  const hasCreatedOn = colNames.includes('created_on');
  const hasTableName = colNames.includes('table_name');

  // SHOW TABLES results have "name" column and optionally "kind", "database_name", "schema_name"
  // Use early return for performance
  if (hasName && (hasKind || hasDbName)) {
    return { type: 'tables', nameColumn: 'name' };
  }

  // SHOW DATABASES results
  if (hasName && hasCreatedOn && !hasKind) {
    return { type: 'databases', nameColumn: 'name' };
  }

  // SHOW SCHEMAS results
  if (hasName && hasDbName && !hasKind) {
    return { type: 'schemas', nameColumn: 'name' };
  }

  // Generic results with a "name" column - could be entity tables
  if (hasName) {
    return { type: 'generic', nameColumn: 'name' };
  }

  // Results with TABLE_NAME column (common in information_schema)
  if (hasTableName) {
    return { type: 'tables', nameColumn: 'table_name' };
  }

  return null;
}

// Parse error message to extract the missing table name
function parseErrorForMissingTable(error) {
  if (!error) return null;
  
  // Pattern: Object 'TABLE_NAME' does not exist
  const match1 = error.match(/Object\s+'([^']+)'\s+does not exist/i);
  if (match1) return match1[1];
  
  // Pattern: Table 'TABLE_NAME' does not exist
  const match2 = error.match(/Table\s+'([^']+)'\s+does not exist/i);
  if (match2) return match2[1];
  
  // Pattern: invalid identifier 'COLUMN_NAME'
  const match3 = error.match(/invalid identifier\s+'([^']+)'/i);
  if (match3) return { type: 'column', name: match3[1] };
  
  // Pattern: Schema 'SCHEMA' does not exist
  const match4 = error.match(/Schema\s+'([^']+)'\s+does not exist/i);
  if (match4) return { type: 'schema', name: match4[1] };
  
  return null;
}

// Component to show alternative suggestions
function AlternativeSuggestions({ 
  missingObject, 
  alternatives, 
  loading, 
  onSearch, 
  onSelectAlternative 
}) {
  if (!missingObject) return null;
  
  const objectName = typeof missingObject === 'string' ? missingObject : missingObject.name;
  const objectType = typeof missingObject === 'object' ? missingObject.type : 'table';
  
  // Extract suggestions array from alternatives object (new format) or use directly (old format)
  const suggestions = alternatives?.suggestions || (Array.isArray(alternatives) ? alternatives : null);
  const context = alternatives?.context;
  const hasSuggestions = suggestions && suggestions.length > 0;
  const hasSearched = alternatives !== null;
  
  return (
    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
      <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
        <Wand2 size={16} />
        <span>Can't find: <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">{objectName}</code></span>
      </div>
      
      {!hasSearched && !loading && (
        <button
          onClick={() => onSearch(objectName, objectType)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Search size={14} />
          Find similar {objectType}s in warehouse
        </button>
      )}
      
      {loading && (
        <div className="flex items-center gap-2 text-blue-600 text-sm">
          <Loader2 size={14} className="animate-spin" />
          Searching for alternatives...
        </div>
      )}
      
      {hasSuggestions && (
        <div className="space-y-2">
          {context && (
            <p className="text-xs text-blue-500 mb-2">
              Searching in: <code className="bg-blue-100 px-1 rounded">{context.database}.{context.schema}</code>
            </p>
          )}
          <p className="text-sm text-blue-600">Found {suggestions.length} similar {objectType}(s):</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 15).map((alt, i) => (
              <button
                key={i}
                onClick={() => onSelectAlternative(alt, objectName)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-sm font-mono text-blue-700 hover:bg-blue-100 hover:border-blue-400 transition-colors"
              >
                <Play size={12} />
                {alt}
              </button>
            ))}
          </div>
          <p className="text-xs text-blue-500 mt-2">Click to run query with this {objectType} instead</p>
        </div>
      )}
      
      {hasSearched && !hasSuggestions && (
        <div className="space-y-2">
          {context && (
            <p className="text-xs text-blue-500 mb-1">
              Searched in: <code className="bg-blue-100 px-1 rounded">{context.database}.{context.schema}</code>
            </p>
          )}
          <p className="text-sm text-blue-600">No similar {objectType}s found. Try a different database/schema.</p>
          {alternatives?.error && (
            <p className="text-xs text-red-500 mt-1">Error: {alternatives.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// Memoized CopyButton to prevent unnecessary re-renders
const CopyButton = memo(function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
});

// Memoized table row component for better performance
const TableRow = memo(function TableRow({ row, rowIndex, isSelected, onRowSelect }) {
  return (
    <tr
      onClick={() => onRowSelect?.(rowIndex, row.original)}
      className={`border-b border-gray-100 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-blue-100 hover:bg-blue-100'
          : 'hover:bg-blue-50/50'
      }`}
    >
      {row.getVisibleCells().map(cell => (
        <td key={cell.id} className="px-4 py-2 max-w-xs truncate">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
});

// Row height constant for virtualization
const ROW_HEIGHT = 35;

function ResultsTableInner({
  results,
  loading,
  error,
  onPageChange,
  onExport,
  // New props for error recovery
  onSearchAlternatives,
  onSelectAlternative,
  alternatives,
  alternativesLoading,
  // New prop for inserting values into editor
  onInsertIntoEditor,
  // New props for query flows
  onOpenQueryFlow,
  availableTables = [],
  // Row selection for exploration panel
  selectedRowIndex = null,
  onRowSelect = null,
}) {
  const [sorting, setSorting] = useState([]);
  const [copiedValue, setCopiedValue] = useState(null);

  // Ref for virtual scroll container
  const tableContainerRef = useRef(null);

  // Use useDeferredValue for large datasets - keeps UI responsive during updates
  // This defers updates to result data so typing/interactions remain snappy
  const deferredResults = useDeferredValue(results);
  const isStale = results !== deferredResults;
  
  // Parse error to find missing object
  const missingObject = useMemo(() => parseErrorForMissingTable(error), [error]);
  
  // Detect if this is a metadata query result (SHOW TABLES, etc.)
  const metadataInfo = useMemo(() => detectMetadataResults(results), [results]);
  
  // Detect if results contain entity data (has GUID, name, typename)
  const isEntityData = useMemo(() => {
    if (!results?.columns || !results?.rows?.length) return false;
    const colNames = results.columns.map(c => 
      (typeof c === 'string' ? c : c.name || '').toLowerCase()
    );
    return colNames.includes('guid') && colNames.includes('name');
  }, [results]);
  
  // Detect if results are lineage data (PROCESS_NAME, INPUTS, OUTPUTS)
  const [showLineageGraph, setShowLineageGraph] = useState(true);
  const lineageGraphData = useMemo(() => {
    if (!results?.columns || !results?.rows?.length) return null;
    
    // Check if this looks like lineage data
    if (!isLineageQueryResult(results)) return null;
    
    // Transform to graph visualization
    return transformLineageResultsToGraph(results);
  }, [results]);
  
  // Handle inserting a value into the editor
  const handleInsert = useCallback((value) => {
    if (onInsertIntoEditor) {
      onInsertIntoEditor(value);
      setCopiedValue(value);
      setTimeout(() => setCopiedValue(null), 1500);
    }
  }, [onInsertIntoEditor]);
  
  // Build columns from result metadata
  // Handles both string columns ["col1", "col2"] and object columns [{name: "col1"}, {name: "col2"}]
  const columns = useMemo(() => {
    if (!results?.columns) return [];
    
    const cols = results.columns.map((col, index) => {
      // Handle both string and object column formats
      const colName = typeof col === 'string' ? col : (col.name || `col_${index}`);
      const colType = typeof col === 'object' ? col.type : undefined;
      const colNameLower = colName.toLowerCase();
      
      // Check if this column should have clickable cells (for inserting into editor)
      const isClickableColumn = onInsertIntoEditor && metadataInfo && (
        colNameLower === metadataInfo.nameColumn ||
        colNameLower === 'name' ||
        colNameLower === 'table_name' ||
        colNameLower === 'schema_name' ||
        colNameLower === 'database_name'
      );
      
      return {
        id: colName || `col_${index}`,
        accessorKey: colName,
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-semibold text-gray-700 hover:text-gray-900"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            <span>{colName}</span>
            {isClickableColumn && <Plus size={12} className="text-emerald-500" />}
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={14} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={14} />
            ) : (
              <ArrowUpDown size={14} className="opacity-50" />
            )}
          </button>
        ),
        cell: ({ getValue }) => {
          const value = getValue();
          if (value === null) return <span className="text-gray-400 italic">NULL</span>;
          if (typeof value === 'object') return JSON.stringify(value);
          
          const strValue = String(value);
          
          // Make clickable if this is an insertable column
          if (isClickableColumn && strValue) {
            const isInserted = copiedValue === strValue;
            return (
              <button
                onClick={() => handleInsert(strValue)}
                className={`group flex items-center gap-1.5 px-2 py-0.5 -mx-2 rounded transition-colors ${
                  isInserted 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'hover:bg-emerald-50 text-gray-900 hover:text-emerald-700'
                }`}
                title={`Click to insert "${strValue}" into your query`}
              >
                {isInserted ? (
                  <Check size={12} className="text-emerald-600" />
                ) : (
                  <Plus size={12} className="opacity-0 group-hover:opacity-100 text-emerald-500" />
                )}
                <span className="font-mono text-sm">{strValue}</span>
                {!isInserted && (
                  <span className="text-xs text-emerald-500 opacity-0 group-hover:opacity-100 ml-1">
                    Insert
                  </span>
                )}
              </button>
            );
          }
          
          return strValue;
        },
        meta: { type: colType }
      };
    });
    
    // Add entity actions column if this looks like entity data and we have a flow handler
    if (isEntityData && onOpenQueryFlow) {
      const columnNames = results.columns.map(c => 
        typeof c === 'string' ? c : c.name
      );
      
      cols.push({
        id: '__entity_actions',
        header: () => (
          <div className="flex items-center gap-1 text-indigo-600">
            <GitBranch size={14} />
            <span>Flows</span>
          </div>
        ),
        cell: ({ row }) => (
          <EntityRowActions
            row={row.original}
            columns={columnNames}
            availableTables={availableTables}
            onSelectFlow={onOpenQueryFlow}
            variant="quick"
          />
        ),
        meta: { type: 'actions' }
      });
    }
    
    return cols;
  }, [results?.columns, metadataInfo, onInsertIntoEditor, copiedValue, handleInsert, isEntityData, onOpenQueryFlow, availableTables]);
  
  // Build data from rows
  // Handles both string and object column formats
  const data = useMemo(() => {
    if (!results?.rows || !results?.columns) return [];
    
    return results.rows.map(row => {
      const obj = {};
      results.columns.forEach((col, i) => {
        const colName = typeof col === 'string' ? col : col.name;
        obj[colName] = row[i];
      });
      return obj;
    });
  }, [results?.rows, results?.columns]);
  
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Get all rows for virtualization
  const { rows: tableRows } = table.getRowModel();

  // TanStack Virtual - only render visible rows for performance
  // Critical for 1000+ row datasets - renders only visible rows + overscan buffer
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10, // Render 10 extra rows above/below viewport
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const exportToCSV = () => {
    if (!results?.columns || !results?.rows) return;
    
    const headers = results.columns.map(c => c.name).join(',');
    const rows = results.rows.map(row => 
      row.map(cell => {
        if (cell === null) return '';
        if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return String(cell);
      }).join(',')
    ).join('\n');
    
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <div className="text-center">
          <Loader2 size={32} className="mx-auto text-blue-500 animate-spin mb-2" />
          <p className="text-gray-500">Executing query...</p>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-white p-4">
        <div className="text-center max-w-lg">
          <AlertCircle size={32} className="mx-auto text-red-500 mb-2" />
          <p className="text-red-600 font-medium">Query Failed</p>
          <p className="text-gray-500 text-sm mt-1 font-mono bg-gray-100 p-2 rounded">{error}</p>
          
          {/* Alternative suggestions for missing objects */}
          {onSearchAlternatives && (
            <AlternativeSuggestions
              missingObject={missingObject}
              alternatives={alternatives}
              loading={alternativesLoading}
              onSearch={onSearchAlternatives}
              onSelectAlternative={onSelectAlternative}
            />
          )}
        </div>
      </div>
    );
  }
  
  // Empty state
  if (!results) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center text-gray-400">
          <p className="text-lg">No results yet</p>
          <p className="text-sm">Execute a query to see results here</p>
        </div>
      </div>
    );
  }
  
  const rowCount = results.rowCount ?? results.total_rows ?? results.rows?.length ?? 0;
  const columnCount = results.columns?.length ?? 0;
  
  // Show empty table message when 0 rows but columns exist
  if (rowCount === 0 && columnCount > 0) {
    return (
      <div className="flex flex-col h-full bg-white">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span><strong>0</strong> rows</span>
            <span><strong>{columnCount}</strong> columns</span>
          </div>
        </div>
        
        {/* Empty results message */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-lg font-medium text-gray-700 mb-2">Query Returned No Rows</h3>
            <p className="text-sm text-gray-500 mb-4">
              The query executed successfully and found <strong>{columnCount} columns</strong>, but the table is empty or no rows matched your query conditions.
            </p>
            <div className="text-xs text-gray-400 bg-gray-50 rounded p-2 font-mono">
              Columns: {results.columns?.slice(0, 5).map(c => typeof c === 'string' ? c : c.name).join(', ')}
              {columnCount > 5 && ` ... +${columnCount - 5} more`}
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Lineage Data Detected Banner & Visualization */}
      {lineageGraphData && (
        <div className="border-b border-gray-200">
          {/* Banner */}
          <button
            onClick={() => setShowLineageGraph(!showLineageGraph)}
            className="w-full flex items-center justify-between px-4 py-2 bg-emerald-50 hover:bg-emerald-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <GitBranch size={16} className="text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">
                Lineage Data Detected
              </span>
              <span className="text-xs text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">
                {lineageGraphData.rawProcesses?.length || 0} processes
              </span>
              <span className="text-xs text-emerald-600">
                {lineageGraphData.metadata?.sourceCount || 0} sources → {lineageGraphData.metadata?.targetCount || 0} targets
              </span>
            </div>
            <ChevronDown 
              size={16} 
              className={`text-emerald-600 transition-transform ${showLineageGraph ? '' : '-rotate-90'}`} 
            />
          </button>
          
          {/* Lineage Graph */}
          {showLineageGraph && lineageGraphData.nodes?.length > 0 && (
            <div className="p-4 bg-white border-t border-emerald-100">
              <LineageRail
                nodes={lineageGraphData.nodes}
                edges={lineageGraphData.edges}
                title={`Query Results Lineage (${lineageGraphData.rawProcesses?.length || 0} processes)`}
                metadata={lineageGraphData.metadata}
                rawProcesses={lineageGraphData.rawProcesses}
              />
            </div>
          )}
        </div>
      )}
    
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>
            <strong>{rowCount.toLocaleString()}</strong> rows
          </span>
          <span>
            <strong>{columnCount}</strong> columns
          </span>
          {lineageGraphData && (
            <span className="flex items-center gap-1 text-emerald-600">
              <GitBranch size={12} />
              Lineage
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>
      
      {/* Metadata hint banner */}
      {metadataInfo && onInsertIntoEditor && (
        <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center gap-2 text-sm text-emerald-700">
          <TableIcon size={14} />
          <span>
            <strong>Tip:</strong> Click any table name below to insert it into your query
          </span>
          <span className="ml-auto text-emerald-500 text-xs">
            {metadataInfo.type === 'tables' ? 'Tables' : metadataInfo.type === 'databases' ? 'Databases' : 'Results'}
          </span>
        </div>
      )}
      
      {/* Table with virtualization */}
      <div
        ref={tableContainerRef}
        className={`flex-1 overflow-auto ${isStale ? 'opacity-70' : ''}`}
        style={{ contain: 'strict' }}
      >
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    className="px-4 py-2 text-left border-b border-gray-200 bg-gray-50"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody
            style={{
              height: `${totalSize}px`,
              position: 'relative',
            }}
          >
            {/* Spacer for rows before viewport */}
            {virtualRows.length > 0 && virtualRows[0].start > 0 && (
              <tr style={{ height: `${virtualRows[0].start}px` }} />
            )}
            {/* Render only visible rows */}
            {virtualRows.map(virtualRow => {
              const row = tableRows[virtualRow.index];
              return (
                <TableRow
                  key={row.id}
                  row={row}
                  rowIndex={virtualRow.index}
                  isSelected={selectedRowIndex === virtualRow.index}
                  onRowSelect={onRowSelect}
                />
              );
            })}
            {/* Spacer for rows after viewport */}
            {virtualRows.length > 0 && (
              <tr
                style={{
                  height: `${totalSize - (virtualRows[virtualRows.length - 1]?.end || 0)}px`,
                }}
              />
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination - only show if pagination info is available */}
      {results.has_more !== undefined && results.page !== undefined && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-gray-50">
          <span className="text-sm text-gray-600">
            Page {results.page} of {Math.ceil((results.total_rows ?? results.rowCount ?? 0) / (results.page_size ?? 100))}
          </span>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange?.(results.page - 1)}
              disabled={results.page <= 1}
              className="p-1 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => onPageChange?.(results.page + 1)}
              disabled={!results.has_more}
              className="p-1 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom comparison function for React.memo
function arePropsEqual(prevProps, nextProps) {
  // Only re-render if these key props change
  return (
    prevProps.results === nextProps.results &&
    prevProps.loading === nextProps.loading &&
    prevProps.error === nextProps.error &&
    prevProps.selectedRowIndex === nextProps.selectedRowIndex &&
    prevProps.alternatives === nextProps.alternatives &&
    prevProps.alternativesLoading === nextProps.alternativesLoading
  );
}

// Export memoized component for better performance
const ResultsTable = memo(ResultsTableInner, arePropsEqual);
export default ResultsTable;
