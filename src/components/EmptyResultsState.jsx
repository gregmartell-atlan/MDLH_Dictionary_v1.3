/**
 * EmptyResultsState Component
 * 
 * Displays actionable empty states based on the reason for no results.
 * Follows UX best practices from Nielsen Norman Group and major design systems.
 * 
 * Three types of empty states:
 * 1. no_data - Table is truly empty (no data captured yet)
 * 2. filters_narrow - WHERE clause filtered out all results
 * 3. wrong_table - Auto-selected table has 0 rows
 * 4. success_zero_rows - Query succeeded but returned 0 rows
 */

import React from 'react';
import { AlertTriangle, RefreshCw, Database, Filter, Search, CheckCircle2 } from 'lucide-react';
import { formatNumber } from '../utils/resultFormatters';

/**
 * Format row count for display
 */
function formatRowCount(count) {
  if (count === 0) return '0 rows';
  if (count === null || count === undefined) return 'unknown';
  
  const formatted = formatNumber(count, 'row_count');
  return formatted;
}

/**
 * EmptyResultsState - Contextual empty state with actionable guidance
 */
export default function EmptyResultsState({
  emptyType = 'no_data',
  tableName,
  query,
  availableTables = [],
  currentTable,
  onTableChange,
  onRetry,
}) {
  // Render table selector for wrong_table type
  const renderTableSelector = () => {
    if (!availableTables || availableTables.length === 0) {
      return null;
    }

    return (
      <div className="mt-4">
        <label htmlFor="table-select" className="block text-sm font-medium text-gray-700 mb-2">
          Select a different table:
        </label>
        <select
          id="table-select"
          role="combobox"
          className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
          value={currentTable || ''}
          onChange={(e) => onTableChange?.(e.target.value)}
        >
          <option value="" disabled>Choose a table...</option>
          {availableTables.map((table) => {
            const hasData = table.row_count > 0;
            return (
              <option
                key={table.name}
                value={table.name}
                className={hasData ? 'text-gray-900' : 'text-gray-400'}
              >
                {table.name} ({formatRowCount(table.row_count)})
              </option>
            );
          })}
        </select>
      </div>
    );
  };

  // Render query preview for filters_narrow type
  const renderQueryPreview = () => {
    if (!query) return null;

    // Extract WHERE clause for highlighting
    const whereMatch = query.match(/WHERE\s+.*/i);
    const whereClause = whereMatch ? whereMatch[0] : null;

    return (
      <div className="mt-4 bg-gray-100 rounded-lg p-3 text-left">
        <p className="text-xs text-gray-500 mb-1">Query that returned no results:</p>
        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono overflow-x-auto">
          {whereClause || query.substring(0, 200)}
          {query.length > 200 && !whereClause && '...'}
        </pre>
      </div>
    );
  };

  // Content configuration by empty type
  const emptyStateConfig = {
    no_data: {
      icon: Database,
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      title: 'No results found',
      description: tableName
        ? `The table "${tableName}" exists but contains no data.`
        : 'This table exists but contains no data.',
      suggestion: 'Try selecting a different table with more data, or check if metadata sync is configured for this source.',
    },
    filters_narrow: {
      icon: Filter,
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      title: 'No matching results',
      description: 'Your query executed successfully but the filters returned no matches.',
      suggestion: 'Try adjusting your filter criteria or removing some conditions.',
    },
    wrong_table: {
      icon: Search,
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      title: 'Selected table is empty',
      description: currentTable
        ? `The auto-selected table "${currentTable}" has no data.`
        : 'The auto-selected table has no data.',
      suggestion: 'Select a table with data from the dropdown below.',
    },
    success_zero_rows: {
      icon: AlertTriangle,
      iconColor: 'text-amber-500',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      title: 'Query executed successfully',
      description: 'No rows returned. This might be expected if the data doesn\'t exist yet.',
      suggestion: 'This is not an error - the query ran correctly but found no matching data.',
    },
  };

  const config = emptyStateConfig[emptyType] || emptyStateConfig.no_data;
  const Icon = config.icon;

  return (
    <div
      role="alert"
      data-testid="empty-state"
      className={`${config.bgColor} ${config.borderColor} border rounded-lg p-6 text-center`}
    >
      <Icon className={`${config.iconColor} mx-auto mb-3`} size={32} />
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {config.title}
      </h3>
      
      <p className="text-gray-600 mb-2">
        {config.description}
      </p>
      
      <p className="text-sm text-gray-500">
        {config.suggestion}
      </p>

      {/* Type-specific content */}
      {emptyType === 'wrong_table' && renderTableSelector()}
      {emptyType === 'filters_narrow' && renderQueryPreview()}

      {/* Retry button */}
      {onRetry && (
        <div className="mt-4">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Determine the appropriate empty state type based on context
 * 
 * @param {Object} params
 * @param {Object} params.results - Query results
 * @param {string} params.query - Executed SQL query
 * @param {Object} params.selectedTable - Currently selected table
 * @param {Array} params.availableTables - List of available tables
 * @returns {string} Empty state type
 */
export function determineEmptyStateType({ results, query, selectedTable, availableTables }) {
  // Query succeeded with 0 rows
  if (results && results.rows && results.rows.length === 0) {
    // Check if the query has WHERE clause
    if (query && /WHERE/i.test(query)) {
      return 'filters_narrow';
    }
    
    // Check if selected table has 0 rows
    if (selectedTable && selectedTable.row_count === 0) {
      // Check if other tables have data
      const tablesWithData = availableTables?.filter(t => t.row_count > 0) || [];
      if (tablesWithData.length > 0) {
        return 'wrong_table';
      }
    }
    
    return 'success_zero_rows';
  }
  
  return 'no_data';
}


