import React, { useState } from 'react';
import {
  X,
  Play,
  Code2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  Check
} from 'lucide-react';

/**
 * InlineQueryPanel - Lightweight query execution panel for Discovery Cards
 *
 * Shows a collapsible SQL preview with Run button, displays results in a compact table,
 * and provides "Open in Editor" escape hatch for complex modifications.
 */
export default function InlineQueryPanel({
  query,           // SQL string
  title,           // Query title/label
  queryMeta = {},  // Additional query metadata (tips, etc.)
  onOpenInEditor,  // Escape hatch to full editor
  onClose,         // Close panel callback
  onExecute,       // Execute query callback - should return { rows, columns, error }
  isConnected = false,
  maxRows = 10
}) {
  const [showSql, setShowSql] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleRun = async () => {
    if (!isConnected || !onExecute) {
      setError('Not connected to Snowflake');
      return;
    }

    setIsRunning(true);
    setError(null);
    setResults(null);

    try {
      const result = await onExecute(query);
      if (result.error) {
        setError(result.error);
      } else {
        setResults({
          rows: result.rows?.slice(0, maxRows) || [],
          columns: result.columns || [],
          totalRows: result.rows?.length || 0
        });
      }
    } catch (err) {
      setError(err.message || 'Query execution failed');
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(query);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleOpenInEditor = () => {
    onOpenInEditor?.(query, title);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Code2 size={16} className="text-blue-600" />
          <h3 className="font-medium text-gray-900">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenInEditor}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Open in Query Editor"
          >
            <ExternalLink size={12} />
            Open in Editor
          </button>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200 transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* SQL Preview (collapsible) */}
      <div className="border-b border-gray-100">
        <button
          onClick={() => setShowSql(!showSql)}
          className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            {showSql ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showSql ? 'Hide SQL' : 'Show SQL'}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Copy SQL"
          >
            {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </button>
        {showSql && (
          <div className="px-4 pb-3">
            <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto max-h-40">
              <code>{query}</code>
            </pre>
          </div>
        )}
      </div>

      {/* Tips (if available) */}
      {queryMeta.tips && queryMeta.tips.length > 0 && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
          <ul className="text-xs text-amber-800 space-y-0.5">
            {queryMeta.tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-1">
                <span className="text-amber-600">-</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Bar */}
      <div className="px-4 py-3 flex items-center justify-between bg-gray-50 border-b border-gray-100">
        <div className="text-xs text-gray-500">
          {isConnected ? (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle size={12} />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-gray-400">
              <AlertCircle size={12} />
              Not connected
            </span>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={!isConnected || isRunning}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            isConnected && !isRunning
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play size={14} />
              Run Query
            </>
          )}
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-100">
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Results Table */}
      {results && results.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {results.columns.map((col, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider"
                  >
                    {col.name || col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-gray-50">
                  {results.columns.map((col, colIdx) => {
                    const colName = col.name || col;
                    const value = row[colName];
                    return (
                      <td
                        key={colIdx}
                        className="px-3 py-2 text-gray-700 truncate max-w-xs"
                        title={String(value)}
                      >
                        {formatCellValue(value)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {results.totalRows > maxRows && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 text-center">
              Showing {maxRows} of {results.totalRows} rows.{' '}
              <button
                onClick={handleOpenInEditor}
                className="text-blue-600 hover:underline"
              >
                Open in Editor to see all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty Results */}
      {results && results.rows.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-sm text-gray-500">No results found</p>
          <p className="text-xs text-gray-400 mt-1">
            Try adjusting the query parameters or search criteria
          </p>
        </div>
      )}
    </div>
  );
}

// Helper to format cell values for display
function formatCellValue(value) {
  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic">null</span>;
  }
  if (typeof value === 'object') {
    try {
      const str = JSON.stringify(value);
      return str.length > 50 ? str.substring(0, 50) + '...' : str;
    } catch {
      return '[Object]';
    }
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  const str = String(value);
  return str.length > 100 ? str.substring(0, 100) + '...' : str;
}
