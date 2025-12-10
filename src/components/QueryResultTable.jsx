/**
 * QueryResultTable - Pure, dumb table component for query results
 * 
 * This component:
 * - Takes raw { columns, rows } in transport shape
 * - Normalizes internally via useMemo (no recomputation on every render)
 * - Handles loading, error, empty, and data states consistently
 * - Knows NOTHING about Snowflake, wizards, or business logic
 * 
 * Usage:
 *   <QueryResultTable
 *     results={{ columns: ['A', 'B'], rows: [[1, 2], [3, 4]] }}
 *     loading={false}
 *     error={null}
 *   />
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  ArrowUpDown, ArrowUp, ArrowDown, Download, Copy, Check,
  Loader2, AlertCircle, Table as TableIcon, GitBranch
} from 'lucide-react';
import { 
  normalizeRows, 
  extractColumnNames, 
  getRowCount, 
  getColumnCount,
  isEmptyResult,
  hasNoResult,
  getColumnName
} from '../utils/queryResultAdapter';

/**
 * @typedef {Object} QueryResultTableProps
 * @property {Object} [results] - Raw query results { columns, rows }
 * @property {boolean} [loading] - Whether query is executing
 * @property {string} [error] - Error message if query failed
 * @property {Function} [onExport] - Optional callback for export action
 * @property {string} [emptyMessage] - Custom message for empty results
 * @property {string} [emptyIcon] - Emoji for empty state (default: 📭)
 * @property {boolean} [compact] - Use compact row height
 * @property {number} [maxHeight] - Max height in pixels (enables scroll)
 * @property {Function} [onOpenLineage] - Callback to open lineage panel for a row
 */

// ============================================================================
// Sub-components
// ============================================================================

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <button
      onClick={handleCopy}
      className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-700"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

// ============================================================================
// Loading State
// ============================================================================

function LoadingState({ message = 'Executing query...' }) {
  return (
    <div className="flex items-center justify-center h-full bg-white min-h-[200px]">
      <div className="text-center">
        <Loader2 size={32} className="mx-auto text-blue-500 animate-spin mb-2" />
        <p className="text-gray-500">{message}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Error State
// ============================================================================

function ErrorState({ error }) {
  return (
    <div className="flex items-center justify-center h-full bg-white p-4 min-h-[200px]">
      <div className="text-center max-w-lg">
        <AlertCircle size={32} className="mx-auto text-red-500 mb-2" />
        <p className="text-red-600 font-medium">Query Failed</p>
        <p className="text-gray-500 text-sm mt-1 font-mono bg-gray-100 p-2 rounded break-all">
          {error}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Empty States
// ============================================================================

function NoResultState() {
  return (
    <div className="flex items-center justify-center h-full bg-gray-50 min-h-[200px]">
      <div className="text-center text-gray-400">
        <TableIcon size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-lg">No results yet</p>
        <p className="text-sm">Execute a query to see results here</p>
      </div>
    </div>
  );
}

function EmptyResultState({ columnCount, columns, icon = '📭', message }) {
  const columnPreview = columns?.slice(0, 5).join(', ');
  const hasMore = columns?.length > 5;
  
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span><strong>0</strong> rows</span>
          <span><strong>{columnCount}</strong> columns</span>
        </div>
      </div>
      
      {/* Empty message */}
      <div className="flex-1 flex items-center justify-center p-8 min-h-[200px]">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">{icon}</div>
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            {message || 'Query Returned No Rows'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            The query executed successfully and found <strong>{columnCount} columns</strong>, 
            but the table is empty or no rows matched your query conditions.
          </p>
          {columns && (
            <div className="text-xs text-gray-400 bg-gray-50 rounded p-2 font-mono">
              Columns: {columnPreview}
              {hasMore && ` ... +${columnCount - 5} more`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function QueryResultTable({
  results,
  loading = false,
  error = null,
  onExport,
  emptyMessage,
  emptyIcon = '📭',
  compact = false,
  maxHeight,
  onOpenLineage,
}) {
  const [sorting, setSorting] = useState([]);
  const [hoveredRowId, setHoveredRowId] = useState(null);
  
  // =========================================================================
  // ADAPTER LAYER: Normalize once, not on every render
  // =========================================================================
  
  const normalizedRows = useMemo(
    () => results ? normalizeRows(results) : [],
    [results]
  );
  
  const columnNames = useMemo(
    () => results ? extractColumnNames(results) : [],
    [results]
  );
  
  const rowCount = useMemo(() => getRowCount(results), [results]);
  const columnCount = useMemo(() => getColumnCount(results), [results]);

  // Detect if results have lineage-capable columns (GUID + NAME)
  const lineageColumnInfo = useMemo(() => {
    const upperColumns = columnNames.map(c => c?.toUpperCase());
    const guidIndex = upperColumns.indexOf('GUID');
    const nameIndex = upperColumns.indexOf('NAME');
    const hasLineageColumns = guidIndex >= 0 && nameIndex >= 0 && onOpenLineage;
    return { hasLineageColumns, guidIndex, nameIndex };
  }, [columnNames, onOpenLineage]);
  
  // =========================================================================
  // Build TanStack Table columns from column names
  // =========================================================================
  
  const tableColumns = useMemo(() => {
    return columnNames.map((colName, index) => ({
      id: colName || `col_${index}`,
      accessorKey: colName,
      header: ({ column }) => (
        <button
          className="flex items-center gap-1 font-semibold text-gray-700 hover:text-gray-900"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          <span>{colName}</span>
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
        if (value === null || value === undefined) {
          return <span className="text-gray-400 italic">NULL</span>;
        }
        if (typeof value === 'object') {
          return (
            <span className="font-mono text-xs text-gray-600 bg-gray-50 px-1 py-0.5 rounded">
              {JSON.stringify(value)}
            </span>
          );
        }
        return String(value);
      },
    }));
  }, [columnNames]);
  
  // =========================================================================
  // TanStack Table instance
  // =========================================================================
  
  const table = useReactTable({
    data: normalizedRows,
    columns: tableColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  
  // =========================================================================
  // Export to CSV
  // =========================================================================
  
  const exportToCSV = useCallback(() => {
    if (!results?.columns || !results?.rows) return;
    
    const headers = columnNames.join(',');
    const rows = results.rows.map(row => 
      row.map(cell => {
        if (cell === null || cell === undefined) return '';
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
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
    
    onExport?.();
  }, [results, columnNames, onExport]);
  
  // =========================================================================
  // Render States
  // =========================================================================
  
  // Loading
  if (loading) {
    return <LoadingState />;
  }
  
  // Error
  if (error) {
    return <ErrorState error={error} />;
  }
  
  // No result yet
  if (hasNoResult(results)) {
    return <NoResultState />;
  }
  
  // Empty result (0 rows, but columns exist)
  if (isEmptyResult(results)) {
    return (
      <EmptyResultState 
        columnCount={columnCount} 
        columns={columnNames}
        icon={emptyIcon}
        message={emptyMessage}
      />
    );
  }
  
  // =========================================================================
  // Data Table
  // =========================================================================
  
  const rowHeight = compact ? 'py-1.5' : 'py-2';
  
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <span>
            <strong>{rowCount.toLocaleString()}</strong> rows
          </span>
          <span>
            <strong>{columnCount}</strong> columns
          </span>
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
      
      {/* Table with optional max height */}
      <div 
        className="flex-1 overflow-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
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
          <tbody>
            {table.getRowModel().rows.map(row => {
              const isHovered = hoveredRowId === row.id;
              const rowData = row.original;
              const guid = lineageColumnInfo.hasLineageColumns ? rowData[columnNames[lineageColumnInfo.guidIndex]] : null;
              const name = lineageColumnInfo.hasLineageColumns ? rowData[columnNames[lineageColumnInfo.nameIndex]] : null;

              return (
                <tr
                  key={row.id}
                  className="hover:bg-blue-50/50 border-b border-gray-100 relative group"
                  onMouseEnter={() => setHoveredRowId(row.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                >
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className={`px-4 ${rowHeight} max-w-xs truncate`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  {/* Lineage action button on hover */}
                  {lineageColumnInfo.hasLineageColumns && guid && (
                    <td className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenLineage({ guid, name, typename: 'Table' });
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md shadow-sm transition-colors"
                        title={`View lineage for ${name || guid}`}
                      >
                        <GitBranch size={12} />
                        <span>View Lineage</span>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Named exports for flexible usage
// ============================================================================

export { LoadingState, ErrorState, NoResultState, EmptyResultState };


