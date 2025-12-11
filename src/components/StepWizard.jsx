/**
 * StepWizard Component - Guided query builder
 *
 * Clean, minimal design with:
 * - White background throughout
 * - Simple step indicators
 * - Clean code preview with syntax highlighting
 * - Minimal chrome buttons
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  Play,
  Check,
  AlertCircle,
  Loader2,
  GitBranch,
  Table,
  Search,
  Code,
  ArrowRight,
  SkipForward,
  Copy,
  Sparkles,
  CheckCircle2,
  XCircle,
  Info,
  BookOpen,
  Layers,
  LayoutDashboard,
  BarChart2,
  Database,
  Activity,
  Type,
  Hash,
  List,
  Braces,
  Clock,
  ToggleLeft,
  Circle,
} from 'lucide-react';
import { createWizardState, advanceWizard, WIZARD_STATUS } from '../queryFlows/stepFlows/types';
import { getWizardFlow, getAllWizardFlows } from '../queryFlows/stepFlows';
import { useQuery } from '../hooks/useSnowflake';
import { useConfig } from '../context/SystemConfigContext';
import { formatCellValue, getTypeIcon } from '../utils/resultFormatters';
import EmptyResultsState, { determineEmptyStateType } from './EmptyResultsState';
import {
  normalizeRows,
  extractColumnNames,
  getRowCount,
  isEmptyResult,
  hasNoResult,
} from '../utils/queryResultAdapter';

// Step icons
const STEP_ICONS = {
  discover_tables: Search,
  examine_structure: Table,
  sample_data: Sparkles,
  build_lineage_query: GitBranch,
  DISCOVER: Search,
  INSPECT: Table,
  SAMPLE: Sparkles,
  BUILD_FINAL: Code,
  SEARCH: Search,
  VALIDATE: Check,
  find_glossary_tables: BookOpen,
  list_glossaries: BookOpen,
  search_terms: Search,
  find_dbt_tables: Layers,
  list_models: Layers,
  find_bi_tables: LayoutDashboard,
  list_dashboards: LayoutDashboard,
  basic_stats: BarChart2,
  top_values: BarChart2,
  sample_values: Sparkles,
  list_tables: Database,
  pick_table: Table,
  sample_table: Sparkles,
  find_usage_tables: Activity,
  recent_queries: Activity,
  popularity_stats: Activity,
};

// Session Storage
const WIZARD_STATE_KEY = 'MDLH_WIZARD_STATE';

function persistWizardState(flowId, state) {
  try {
    sessionStorage.setItem(WIZARD_STATE_KEY, JSON.stringify({
      flowId,
      currentStepIndex: state.currentStepIndex,
      inputs: state.inputs,
      stepResults: state.stepResults,
      savedAt: Date.now(),
    }));
  } catch (e) {
    // Session storage may be unavailable
  }
}

function loadWizardState(flowId) {
  try {
    const saved = sessionStorage.getItem(WIZARD_STATE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed.flowId !== flowId) return null;
    if (Date.now() - parsed.savedAt > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearWizardState() {
  try {
    sessionStorage.removeItem(WIZARD_STATE_KEY);
  } catch {}
}

/**
 * Step Progress - Pill-style like language tabs
 */
function StepProgress({ steps, currentIndex, stepResults }) {
  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
        {steps.map((step, idx) => {
          const isComplete = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const result = stepResults[idx];
          const hasError = result && !result.success;
          const Icon = STEP_ICONS[step.id] || Code;
          
          return (
            <div
              key={step.id}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors
                ${isCurrent ? 'bg-gray-900 text-white' : ''}
                ${isComplete && !hasError ? 'bg-gray-700 text-white' : ''}
                ${hasError ? 'bg-red-100 text-red-700' : ''}
                ${!isCurrent && !isComplete && !hasError ? 'text-gray-500' : ''}
              `}
            >
              {isComplete && !hasError ? <Check size={12} /> : <Icon size={12} />}
              <span className="hidden sm:inline">Step {idx + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * SQL Preview - TabbedCodeCard style with pill tabs and line numbers
 */
function SqlPreview({ sql, onCopy, onOpenInEditor }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('sql');
  
  const handleCopy = () => {
    if (!sql) return;
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  };
  
  if (!sql || typeof sql !== 'string' || sql.trim() === '') {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 text-sm">
        <AlertCircle className="inline mr-2" size={14} />
        No SQL generated
      </div>
    );
  }
  
  // Syntax highlighting with line numbers - SAFE version using inline styles
  const highlightSql = (code) => {
    return code.split('\n').map((line, i) => {
      let highlighted = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // Comments (entire line gray italic)
      if (line.trim().startsWith('--')) {
        highlighted = `<span style="color:#6b7280;font-style:italic">${highlighted}</span>`;
      } else {
        // 1. Strings - green (do first to protect contents)
        highlighted = highlighted.replace(
          /'([^']*)'/g, 
          `<span style="color:#059669">'$1'</span>`
        );
        
        // 2. Keywords - cyan with inline styles to avoid class conflicts
        const keywords = [
          'SELECT', 'FROM', 'WHERE', 'JOIN', 'ON', 'AND', 'OR', 'ORDER', 'BY', 
          'LIMIT', 'WITH', 'AS', 'UNION', 'ALL', 'INNER', 'LEFT', 'RIGHT',
          'SHOW', 'TABLES', 'LIKE', 'ILIKE', 'IN', 'DESCRIBE', 'TABLE', 'IS', 'NOT',
          'DISTINCT', 'GROUP', 'HAVING', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DESC', 'ASC',
          'BETWEEN', 'EXISTS', 'INTO', 'VALUES', 'CREATE', 'DROP', 'ALTER', 'INDEX', 'VIEW',
          'SET', 'NULL', 'TRUE', 'FALSE', 'LATERAL', 'FLATTEN', 'INPUT', 'OUTER', 'VARCHAR'
        ];
        keywords.forEach(kw => {
          const regex = new RegExp(`\\b(${kw})\\b`, 'gi');
          highlighted = highlighted.replace(regex, '<span style="color:#0891b2;font-weight:500">$1</span>');
        });
        
        // 3. Numbers - ONLY after whitespace/operators to avoid matching in HTML
        highlighted = highlighted.replace(
          /(^|[\s,=(])(\d+)(?=[\s,;)&]|$)/g, 
          '$1<span style="color:#3b82f6">$2</span>'
        );
      }
      
      return (
        <div key={i} className="flex">
          <span className="w-8 text-right pr-4 select-none shrink-0 text-[13px]" style={{color:'#9ca3af'}}>
            {i + 1}
          </span>
          <span className="flex-1" dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }} />
        </div>
      );
    });
  };
  
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Header with pill tabs */}
      <div className="px-4 pt-4 pb-3">
        <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
          <button
            onClick={() => setActiveTab('sql')}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'sql' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            SQL
          </button>
          <button
            onClick={() => setActiveTab('python')}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
              activeTab === 'python' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Python
          </button>
        </div>
      </div>
      
      {/* Code block with line numbers */}
      <div className="px-4 py-4 bg-white text-gray-800 text-[13px] font-mono leading-relaxed border-t border-gray-100 max-h-48 overflow-auto">
        {activeTab === 'sql' ? (
          highlightSql(sql)
        ) : (
          <div className="text-gray-400 italic">
            # Python client coming soon
            <br />
            # from mdlh_client import client
          </div>
        )}
      </div>
      
      {/* Footer with dropdown and copy */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={onOpenInEditor}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-full hover:border-gray-300 transition-colors"
        >
          <span>Open in Editor</span>
          <ChevronRight size={14} className="text-gray-400" />
        </button>
        
        <button
          onClick={handleCopy}
          className={`text-sm transition-colors ${copied ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// Type icon mapping
const TYPE_ICONS = { Type, Hash, List, Braces, Clock, ToggleLeft, Circle };

/**
 * Formatted cell value
 */
function FormattedCell({ value, columnName, dataType }) {
  const formatted = formatCellValue(value, columnName, dataType);
  
  if (formatted.type === 'null') {
    return <span className="text-gray-400 italic">null</span>;
  }
  if (formatted.type === 'guid') {
    return (
      <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded" title={formatted.raw}>
        {formatted.display.substring(0, 8)}...
      </span>
    );
  }
  const display = formatted.display.length > 50 
    ? formatted.display.substring(0, 50) + '...' 
    : formatted.display;
  return <span title={formatted.display}>{display}</span>;
}

/**
 * Column header
 */
function ColumnHeader({ column }) {
  const colName = typeof column === 'object' ? column.name : column;
  return (
    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">
      {colName}
    </th>
  );
}

/**
 * Results Preview - clean table
 */
function ResultsPreview({ results, maxRows = 5, query, availableTables, onTableChange }) {
  const normalizedRows = useMemo(() => results ? normalizeRows(results) : [], [results]);
  const columnNames = useMemo(() => results ? extractColumnNames(results) : [], [results]);
  const rowCount = getRowCount(results);
  
  if (hasNoResult(results)) {
    return (
      <EmptyResultsState
        emptyType="no_data"
        availableTables={availableTables}
        onTableChange={onTableChange}
      />
    );
  }
  
  if (isEmptyResult(results)) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        Query returned 0 rows
      </div>
    );
  }
  
  const columns = results.columns || [];
  const displayRows = normalizedRows.slice(0, maxRows);
  
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <ColumnHeader key={i} column={col} />
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {displayRows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {columns.map((col, j) => {
                const colName = typeof col === 'object' ? col.name : col;
                const dataType = typeof col === 'object' ? col.type : null;
                const value = row[colName];
                return (
                  <td key={j} className="px-3 py-2 text-gray-700 max-w-xs">
                    <FormattedCell value={value} columnName={colName} dataType={dataType} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rowCount > maxRows && (
        <p className="text-xs text-gray-500 p-2 text-center bg-gray-50 border-t border-gray-200">
          Showing {maxRows} of {rowCount} rows
        </p>
      )}
    </div>
  );
}

/**
 * Extracted Data Display
 */
function ExtractedData({ data, title = "Extracted data" }) {
  if (!data || Object.keys(data).length === 0) return null;
  
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-3">
      <div className="flex items-center gap-2 text-gray-700 text-sm font-medium mb-2">
        <Sparkles size={14} className="text-gray-500" />
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {Object.entries(data).map(([key, value]) => {
          if (['discoveredTables', 'processColumns', 'sampleGuids', 'sampleRows'].includes(key)) {
            const arr = Array.isArray(value) ? value : [];
            return (
              <div key={key} className="col-span-2">
                <span className="text-gray-500">{key}:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {arr.slice(0, 5).map((item, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white border border-gray-200 rounded text-xs text-gray-700">
                      {typeof item === 'object' ? JSON.stringify(item).substring(0, 30) : String(item)}
                    </span>
                  ))}
                  {arr.length > 5 && <span className="text-xs text-gray-400">+{arr.length - 5}</span>}
                </div>
              </div>
            );
          }
          return (
            <div key={key}>
              <span className="text-gray-500">{key}:</span>{' '}
              <span className="text-gray-700 font-medium">
                {typeof value === 'boolean' ? (value ? '✓' : '✗') : String(value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Main StepWizard component
 */
export default function StepWizard({
  flowId = 'lineage_downstream',
  entity,
  availableTables = [],
  database,
  schema,
  onComplete,
  onCancel,
  onUseSql,
}) {
  const systemConfig = useConfig();
  const flow = getWizardFlow(flowId);
  
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const savedStateRef = useRef(null);
  const stepResultCacheRef = useRef({});
  
  const [wizardState, setWizardState] = useState(() => {
    const saved = loadWizardState(flowId);
    if (saved && saved.currentStepIndex > 0) {
      savedStateRef.current = saved;
    }
    
    const queryDefaults = systemConfig?.queryDefaults || {};
    const defaultDb = database || queryDefaults.metadataDb || 'FIELD_METADATA';
    const defaultSchema = schema || queryDefaults.metadataSchema || 'PUBLIC';
    
    const initialInputs = flow?.buildInitialInputs?.(entity, availableTables, systemConfig?.config) || {};
    return createWizardState(flowId, {
      ...initialInputs,
      database: defaultDb,
      schema: defaultSchema,
      systemConfig: systemConfig?.config,
    });
  });
  
  const [isRunning, setIsRunning] = useState(false);
  const [currentResults, setCurrentResults] = useState(null);
  const [currentError, setCurrentError] = useState(null);
  
  const { executeQuery } = useQuery();
  
  useEffect(() => {
    if (savedStateRef.current && savedStateRef.current.currentStepIndex > 0) {
      setShowResumePrompt(true);
    }
  }, []);
  
  useEffect(() => {
    if (wizardState.currentStepIndex > 0 || wizardState.stepResults.length > 0) {
      persistWizardState(flowId, wizardState);
    }
  }, [flowId, wizardState]);
  
  const handleResume = useCallback(() => {
    if (savedStateRef.current) {
      setWizardState(prev => ({
        ...prev,
        currentStepIndex: savedStateRef.current.currentStepIndex,
        inputs: { ...prev.inputs, ...savedStateRef.current.inputs },
        stepResults: savedStateRef.current.stepResults || [],
      }));
      savedStateRef.current = null;
    }
    setShowResumePrompt(false);
  }, []);
  
  const handleStartFresh = useCallback(() => {
    clearWizardState();
    savedStateRef.current = null;
    setShowResumePrompt(false);
  }, []);
  
  const currentStep = useMemo(() => {
    return flow?.steps?.[wizardState.currentStepIndex] || null;
  }, [flow, wizardState.currentStepIndex]);
  
  const currentSql = useMemo(() => {
    if (!currentStep?.buildQuery) return '';
    return currentStep.buildQuery(entity, wizardState.inputs);
  }, [currentStep, entity, wizardState.inputs]);
  
  useEffect(() => {
    if (currentStep?.shouldSkip?.(wizardState.inputs)) {
      handleSkip();
    }
  }, [currentStep, wizardState.inputs]);
  
  const handleRunStep = useCallback(async () => {
    if (!currentSql || isRunning) return;
    
    setIsRunning(true);
    setCurrentError(null);
    setCurrentResults(null);
    
    try {
      const results = await executeQuery(currentSql, {
        database: wizardState.inputs.database,
        schema: wizardState.inputs.schema,
        timeout: 30,
      });
      
      if (!results) {
        setCurrentError('Query failed. Check connection.');
        setCurrentResults(null);
      } else if (results.error) {
        setCurrentError(results.error);
        setCurrentResults(null);
      } else if (results.rows && results.rows.length >= 0) {
        setCurrentResults(results);
        setCurrentError(null);
      } else {
        setCurrentError('Unexpected response format');
        setCurrentResults(null);
      }
    } catch (err) {
      setCurrentError(err.message || 'Query failed');
      setCurrentResults(null);
    } finally {
      setIsRunning(false);
    }
  }, [currentSql, executeQuery, wizardState.inputs, isRunning]);
  
  const handleCancel = useCallback(() => {
    clearWizardState();
    onCancel?.();
  }, [onCancel]);
  
  const handleComplete = useCallback((result) => {
    clearWizardState();
    onComplete?.(result);
  }, [onComplete]);
  
  const handleContinue = useCallback(() => {
    if (!currentResults) return;
    
    let extractedData = {};
    try {
      extractedData = currentStep?.extractDataForNext?.(currentResults) || {};
    } catch (err) {
      // extractDataForNext failed - continue with empty data
      extractedData = {};
    }
    
    const cacheKey = `step-${wizardState.currentStepIndex}`;
    stepResultCacheRef.current[cacheKey] = { results: currentResults, extractedData };
    
    const stepResult = { success: true, results: currentResults, extractedData };
    const newState = advanceWizard(wizardState, stepResult, flow);
    setWizardState(newState);
    setCurrentResults(null);
    setCurrentError(null);
    
    if (newState.isComplete) {
      const finalStep = flow.steps[flow.steps.length - 1];
      const finalSql = finalStep?.buildQuery?.(entity, newState.inputs) || '';
      handleComplete({ sql: finalSql, inputs: newState.inputs });
    }
  }, [currentResults, currentStep, wizardState, flow, entity, handleComplete]);
  
  const handleSkip = useCallback(() => {
    const stepResult = { success: true, results: null, extractedData: {}, skipped: true };
    const newState = advanceWizard(wizardState, stepResult, flow);
    setWizardState(newState);
    setCurrentResults(null);
    setCurrentError(null);
  }, [wizardState, flow]);
  
  const handleBack = useCallback(() => {
    if (wizardState.currentStepIndex === 0) return;
    
    const prevIndex = wizardState.currentStepIndex - 1;
    
    if (currentResults) {
      const cacheKey = `step-${wizardState.currentStepIndex}`;
      stepResultCacheRef.current[cacheKey] = {
        results: currentResults,
        extractedData: currentStep?.extractDataForNext?.(currentResults) || {},
      };
    }
    
    setWizardState(prev => ({ ...prev, currentStepIndex: prevIndex }));
    
    const prevCacheKey = `step-${prevIndex}`;
    const cachedPrev = stepResultCacheRef.current[prevCacheKey];
    if (cachedPrev) {
      setCurrentResults(cachedPrev.results);
    } else {
      setCurrentResults(null);
    }
    setCurrentError(null);
  }, [wizardState.currentStepIndex, currentResults, currentStep]);
  
  const handleUseSql = useCallback(() => {
    onUseSql?.(currentSql);
  }, [currentSql, onUseSql]);

  if (!flow) {
    return (
      <div className="p-4 text-center text-red-600">
        Unknown flow: {flowId}
      </div>
    );
  }
  
  // Resume prompt - clean style
  if (showResumePrompt && savedStateRef.current) {
    const savedStep = savedStateRef.current.currentStepIndex + 1;
    const totalSteps = flow.steps.length;
    
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white p-8">
        <div className="text-center max-w-md">
          <div className="p-3 bg-gray-100 rounded-full w-fit mx-auto mb-4">
            <Info className="text-gray-600" size={24} />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Resume Previous Session?
          </h3>
          <p className="text-gray-600 mb-6 text-sm">
            You have a saved session at step {savedStep} of {totalSteps}.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleStartFresh}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              Start Fresh
            </button>
            <button
              onClick={handleResume}
              className="px-4 py-2 text-white bg-gray-900 rounded-lg hover:bg-gray-800 text-sm font-medium"
            >
              Resume
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  const isLastStep = wizardState.currentStepIndex === flow.steps.length - 1;
  const canGoBack = wizardState.currentStepIndex > 0;
  const canContinue = currentResults && !currentError && !isLastStep;
  const canFinish = currentResults && !currentError && isLastStep;
  
  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <GitBranch size={18} className="text-gray-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{flow.label}</h3>
            <p className="text-sm text-gray-500">{flow.description}</p>
          </div>
        </div>
      </div>
      
      {/* Progress */}
      <StepProgress 
        steps={flow.steps} 
        currentIndex={wizardState.currentStepIndex}
        stepResults={wizardState.stepResults}
      />
      
      {/* Current step content */}
      <div className="flex-1 overflow-y-auto p-4">
        {currentStep && (
          <>
            {/* Step header */}
            <div className="mb-4">
              <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                {(() => {
                  const Icon = STEP_ICONS[currentStep.id] || Code;
                  return <Icon size={18} className="text-gray-500" />;
                })()}
                {currentStep.title}
              </h4>
              <p className="text-sm text-gray-500 mt-1">{currentStep.description}</p>
            </div>
            
            {/* SQL Preview - TabbedCodeCard style */}
            <div className="mb-4">
              <SqlPreview sql={currentSql} onOpenInEditor={handleUseSql} />
            </div>
            
            {/* Run button */}
            {!currentResults && !currentError && (
              <div className="flex justify-center mb-4">
                <button
                  onClick={handleRunStep}
                  disabled={isRunning}
                  className={`
                    flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-white transition-all
                    ${isRunning ? 'bg-gray-400 cursor-not-allowed' : 'bg-gray-900 hover:bg-gray-800'}
                  `}
                >
                  {isRunning ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Run Step
                    </>
                  )}
                </button>
              </div>
            )}
            
            {/* Error */}
            {currentError && (
              <div className="bg-white border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <XCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                  <div>
                    <h5 className="font-medium text-gray-900">Query Failed</h5>
                    <p className="text-sm text-gray-600 mt-1">{currentError}</p>
                    <button
                      onClick={() => setCurrentError(null)}
                      className="text-sm text-gray-500 hover:text-gray-700 mt-2"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Results */}
            {currentResults && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="text-emerald-500" size={16} />
                  <span className="text-sm font-medium text-gray-700">
                    {currentResults.rows?.length || 0} rows
                  </span>
                </div>
                
                <ResultsPreview results={currentResults} />
                
                {currentStep.extractDataForNext && (
                  <ExtractedData data={currentStep.extractDataForNext(currentResults)} />
                )}
              </div>
            )}
          </>
        )}
      </div>
      
      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
        <div>
          {canGoBack && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <ChevronLeft size={16} />
              Back
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {currentStep?.optional && !currentResults && (
            <button
              onClick={handleSkip}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              <SkipForward size={14} />
              Skip
            </button>
          )}
          
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          
          {canContinue && (
            <button
              onClick={handleContinue}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
            >
              Continue
              <ChevronRight size={16} />
            </button>
          )}
          
          {canFinish && (
            <button
              onClick={() => {
                onUseSql?.(currentSql);
                handleComplete({ sql: currentSql, inputs: wizardState.inputs });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium"
            >
              <Check size={16} />
              Use Query
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
