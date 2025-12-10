/**
 * ShowMyWork - Educational SQL query explanation component
 * 
 * Helps SQL beginners understand queries step-by-step with:
 * - Plain English explanations
 * - Visual breakdown of SQL clauses
 * - Sample results preview
 * - Tips for writing SQL
 */

import React, { useState, useEffect } from 'react';
import { 
  X, BookOpen, Code2, Play, Lightbulb, CheckCircle, 
  AlertCircle, Database, Table, Columns, Loader2,
  ChevronDown, ChevronRight, Copy, Check, Sparkles
} from 'lucide-react';
import { useQueryExplanation } from '../hooks/useSnowflake';

// Copy button component
function CopyButton({ text, size = 14 }) {
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
      {copied ? <Check size={size} className="text-green-500" /> : <Copy size={size} />}
    </button>
  );
}

// Step card component
function StepCard({ step, isExpanded, onToggle }) {
  const clauseColors = {
    SELECT: 'bg-blue-100 text-blue-700 border-blue-200',
    FROM: 'bg-green-100 text-green-700 border-green-200',
    WHERE: 'bg-amber-100 text-amber-700 border-amber-200',
    JOIN: 'bg-purple-100 text-purple-700 border-purple-200',
    'ORDER BY': 'bg-pink-100 text-pink-700 border-pink-200',
    'GROUP BY': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    LIMIT: 'bg-gray-100 text-gray-700 border-gray-200',
    WITH: 'bg-teal-100 text-teal-700 border-teal-200',
  };
  
  const colorClass = clauseColors[step.clause] || 'bg-gray-100 text-gray-700 border-gray-200';
  
  return (
    <div className={`rounded-lg border ${colorClass} overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${colorClass}`}>
            {step.step_number}
          </span>
          <span className="font-mono font-medium">{step.clause}</span>
        </div>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      
      {isExpanded && (
        <div className="px-3 pb-3 pt-0">
          <div className="bg-white/50 rounded p-2 mb-2 font-mono text-xs overflow-x-auto">
            {step.sql_snippet}
          </div>
          <p className="text-sm" dangerouslySetInnerHTML={{ __html: step.explanation.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
          {step.tip && (
            <div className="flex items-start gap-2 mt-2 p-2 bg-white/50 rounded text-xs">
              <Lightbulb size={14} className="flex-shrink-0 mt-0.5" />
              <span>{step.tip}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sample data preview
function SampleDataPreview({ columns, data, rowCount }) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Table size={32} className="mx-auto mb-2 opacity-50" />
        <p>No sample data available</p>
      </div>
    );
  }
  
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-600">
          Showing {data.length} of {rowCount?.toLocaleString() || '?'} rows
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {columns.map((col, i) => (
                <th key={i} className="px-2 py-1 text-left border border-gray-200 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-blue-50">
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="px-2 py-1 border border-gray-200 max-w-xs truncate">
                    {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-gray-400 italic">null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Main ShowMyWork modal
export default function ShowMyWork({ 
  isOpen, 
  onClose, 
  query,
  validationResult,
  onRunQuery,
  onRunSuggestedQuery 
}) {
  const { explanation, loading, explainQuery, clearExplanation } = useQueryExplanation();
  const [expandedSteps, setExpandedSteps] = useState(new Set([1, 2])); // Expand first two steps by default
  const [activeTab, setActiveTab] = useState('explanation');
  
  useEffect(() => {
    if (isOpen && query) {
      explainQuery(query, { includeExecution: true });
    }
    return () => clearExplanation();
  }, [isOpen, query]);
  
  if (!isOpen) return null;
  
  const toggleStep = (stepNum) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepNum)) {
        next.delete(stepNum);
      } else {
        next.add(stepNum);
      }
      return next;
    });
  };
  
  const expandAll = () => {
    if (explanation?.steps) {
      setExpandedSteps(new Set(explanation.steps.map(s => s.step_number)));
    }
  };
  
  const collapseAll = () => {
    setExpandedSteps(new Set());
  };

  // Determine if we have a suggested alternative
  const hasSuggestion = validationResult?.suggested_query && validationResult?.suggested_query !== query;
  const isQueryWorking = validationResult?.status === 'success' || (explanation?.executed && !explanation?.error_message && explanation?.row_count > 0);
  const isQueryEmpty = validationResult?.status === 'empty' || (explanation?.executed && !explanation?.error_message && explanation?.row_count === 0);
  const isQueryFailed = validationResult?.status === 'error' || (explanation?.executed && explanation?.error_message);
  
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BookOpen size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">Show My Work</h2>
              <p className="text-sm text-gray-500">Understanding this SQL query step-by-step</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg text-gray-500">
            <X size={20} />
          </button>
        </div>
        
        {/* Status Badge */}
        {!loading && (
          <div className="px-6 pt-4">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              isQueryWorking ? 'bg-green-100 text-green-700' :
              isQueryEmpty ? 'bg-amber-100 text-amber-700' :
              isQueryFailed ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {isQueryWorking && <><CheckCircle size={16} /> Query works! Returns {explanation?.row_count?.toLocaleString() || validationResult?.row_count?.toLocaleString()} rows</>}
              {isQueryEmpty && <><AlertCircle size={16} /> Query runs but returns 0 rows</>}
              {isQueryFailed && <><AlertCircle size={16} /> Query has errors</>}
            </div>
          </div>
        )}
        
        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          <button
            onClick={() => setActiveTab('explanation')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
              activeTab === 'explanation' ? 'bg-white border border-b-0 border-gray-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            📖 Step-by-Step
          </button>
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
              activeTab === 'sql' ? 'bg-white border border-b-0 border-gray-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Code2 size={14} className="inline mr-1" /> SQL Code
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
              activeTab === 'results' ? 'bg-white border border-b-0 border-gray-200' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Table size={14} className="inline mr-1" /> Results
          </button>
          {hasSuggestion && (
            <button
              onClick={() => setActiveTab('suggestion')}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
                activeTab === 'suggestion' ? 'bg-white border border-b-0 border-gray-200' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Sparkles size={14} className="inline mr-1" /> Suggested Query
            </button>
          )}
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-white border-t border-gray-200">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <span className="ml-3 text-gray-600">Analyzing query...</span>
            </div>
          ) : (
            <>
              {activeTab === 'explanation' && explanation && (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <h3 className="font-medium text-blue-800 mb-1">What this query does:</h3>
                    <p className="text-blue-700">{explanation.summary}</p>
                    
                    <div className="flex flex-wrap gap-4 mt-3 text-sm">
                      {explanation.tables_used?.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Database size={14} className="text-blue-500" />
                          <span className="text-blue-700">Tables: {explanation.tables_used.join(', ')}</span>
                        </div>
                      )}
                      {explanation.columns_selected?.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Columns size={14} className="text-blue-500" />
                          <span className="text-blue-700">
                            Columns: {explanation.columns_selected[0] === '*' ? 'All' : explanation.columns_selected.length}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Steps */}
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-700">Query Breakdown</h3>
                    <div className="flex gap-2 text-xs">
                      <button onClick={expandAll} className="text-blue-600 hover:text-blue-800">Expand all</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={collapseAll} className="text-blue-600 hover:text-blue-800">Collapse all</button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {explanation.steps?.map(step => (
                      <StepCard
                        key={step.step_number}
                        step={step}
                        isExpanded={expandedSteps.has(step.step_number)}
                        onToggle={() => toggleStep(step.step_number)}
                      />
                    ))}
                  </div>
                </div>
              )}
              
              {activeTab === 'sql' && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-700">Formatted SQL</h3>
                    <CopyButton text={query} />
                  </div>
                  <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                    {explanation?.formatted_sql || query}
                  </pre>
                </div>
              )}
              
              {activeTab === 'results' && (
                <div>
                  <h3 className="font-medium text-gray-700 mb-3">Query Results</h3>
                  
                  {explanation?.error_message ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle size={20} className="text-red-500 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-red-700">Query Failed</p>
                          <p className="text-sm text-red-600 mt-1 font-mono">{explanation.error_message}</p>
                        </div>
                      </div>
                    </div>
                  ) : explanation?.sample_data ? (
                    <SampleDataPreview 
                      columns={explanation.columns_selected?.[0] === '*' ? Object.keys(explanation.sample_data[0] || {}) : explanation.columns_selected}
                      data={explanation.sample_data}
                      rowCount={explanation.row_count}
                    />
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No results to display</p>
                    </div>
                  )}
                </div>
              )}
              
              {activeTab === 'suggestion' && hasSuggestion && (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Sparkles size={20} className="text-green-500 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-green-700">We found a similar query that returns results!</p>
                        <p className="text-sm text-green-600 mt-1">
                          The original query targets a table that's empty or doesn't exist. 
                          Here's an alternative that works:
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium text-gray-700">Suggested Query</h3>
                      <CopyButton text={validationResult.suggested_query} />
                    </div>
                    <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                      {validationResult.suggested_query}
                    </pre>
                  </div>
                  
                  {validationResult.suggested_query_result && (
                    <div>
                      <h3 className="font-medium text-gray-700 mb-2">
                        ✅ Verified: Returns {validationResult.suggested_query_result.row_count?.toLocaleString()} rows
                      </h3>
                      <SampleDataPreview 
                        columns={validationResult.suggested_query_result.columns}
                        data={validationResult.suggested_query_result.sample_data}
                        rowCount={validationResult.suggested_query_result.row_count}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            {explanation?.execution_time_ms && (
              <span>Query executed in {explanation.execution_time_ms}ms</span>
            )}
          </div>
          <div className="flex gap-2">
            {hasSuggestion && onRunSuggestedQuery && (
              <button
                onClick={() => {
                  onRunSuggestedQuery(validationResult.suggested_query);
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
              >
                <Sparkles size={16} />
                Run Suggested Query
              </button>
            )}
            {onRunQuery && (
              <button
                onClick={() => {
                  onRunQuery(query);
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
              >
                <Play size={16} />
                Run This Query
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

