/**
 * QueryFlowMenu Component
 * 
 * A dropdown menu showing available query flows for the current entity context.
 * Can be used as a toolbar button or context menu.
 * 
 * Features:
 * - Responsive positioning (opens upward if near bottom of screen)
 * - Scrollable menu with max height
 * - Entity-aware flow filtering
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  GitBranch,
  AlertTriangle,
  Activity,
  Table,
  Layers,
  CheckCircle,
  BookOpen,
  Search,
  BarChart2,
  List,
  AlertCircle,
  Sparkles,
  Play,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Database,
  Columns,
} from 'lucide-react';
import { getAvailableFlows, openQueryFlow, buildFlowQuery } from '../queryFlows';
import { QUERY_FLOW_CONFIG } from '../queryFlows/types';
import { getAvailableWizardFlowsForEntity, getAvailableWizardFlowsForDomain } from '../queryFlows/stepFlows';
import { useConfig } from '../context/SystemConfigContext';

const ICON_MAP = {
  GitBranch,
  AlertTriangle,
  Activity,
  Table,
  Layers,
  CheckCircle,
  BookOpen,
  Search,
  BarChart2,
  List,
  AlertCircle,
  Database,
  Columns,
};

function FlowIcon({ name, size = 16, className = '' }) {
  const Icon = ICON_MAP[name] || Sparkles;
  return <Icon size={size} className={className} />;
}

/**
 * Hook to calculate dropdown position
 */
function useDropdownPosition(buttonRef, isOpen) {
  const [position, setPosition] = useState({ openUp: false, maxHeight: 320 });

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      // Menu needs ~320px, but we can adjust
      const menuHeight = Math.min(320, Math.max(spaceBelow, spaceAbove) - 20);
      const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;

      setPosition({ openUp, maxHeight: menuHeight });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, buttonRef]);

  return position;
}

/**
 * WizardSection - Shows all available wizards from QUERY_RECIPES
 */
function WizardSection({ entityType, onOpenWizard }) {
  const availableWizards = useMemo(() => {
    return getAvailableWizardFlowsForEntity(entityType || 'UNKNOWN');
  }, [entityType]);

  if (availableWizards.length === 0) return null;

  // Group wizards by intent
  const lineageWizards = availableWizards.filter(w => w.intent === 'LINEAGE');
  const discoveryWizards = availableWizards.filter(w => w.intent === 'DISCOVERY' || w.intent === 'SCHEMA');
  const profileWizards = availableWizards.filter(w => w.intent === 'PROFILE' || w.intent === 'QUALITY');
  const otherWizards = availableWizards.filter(w => 
    !['LINEAGE', 'DISCOVERY', 'SCHEMA', 'PROFILE', 'QUALITY'].includes(w.intent)
  );

  const renderWizardButton = (wizard) => (
    <button
      key={wizard.id}
      onClick={() => onOpenWizard(wizard.id)}
      className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-white hover:bg-indigo-50 
        border border-gray-200 hover:border-indigo-200 transition-all group"
    >
      <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-sm">
        <FlowIcon name={wizard.icon} size={14} />
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-medium text-gray-800 group-hover:text-indigo-700 truncate">
          {wizard.label}
        </div>
        <div className="text-[10px] text-gray-500 truncate">
          {wizard.description}
        </div>
      </div>
      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full font-medium shrink-0">
        Wizard
      </span>
    </button>
  );

  const renderWizardGroup = (title, wizards) => {
    if (wizards.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
          {title}
        </div>
        {wizards.map(renderWizardButton)}
      </div>
    );
  };

  return (
    <div className="p-2 border-b border-gray-100 space-y-3">
      <div className="flex items-center gap-2">
        <Zap size={14} className="text-indigo-600" />
        <span className="text-xs font-semibold text-gray-700">Step-by-Step Wizards</span>
        <span className="text-[9px] px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full">
          {availableWizards.length} available
        </span>
      </div>
      
      {lineageWizards.length > 0 && renderWizardGroup('Lineage', lineageWizards)}
      {discoveryWizards.length > 0 && renderWizardGroup('Discovery', discoveryWizards)}
      {profileWizards.length > 0 && renderWizardGroup('Profiling', profileWizards)}
      {otherWizards.length > 0 && renderWizardGroup('Other', otherWizards)}
    </div>
  );
}

/**
 * Full query flow menu dropdown with responsive positioning
 */
export function QueryFlowMenu({ 
  entity, 
  availableTables = [], 
  onSelectFlow,
  onOpenWizard, // NEW: handler for wizard mode
  buttonClassName = '',
  disabled = false,
  compact = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef(null);
  const { openUp, maxHeight } = useDropdownPosition(buttonRef, isOpen);
  
  // Get SystemConfig for config-driven flows
  const systemConfig = useConfig();
  
  const flows = useMemo(() => {
    if (!entity?.type) return [];
    
    // Filter flows based on feature flags from SystemConfig
    const allFlows = getAvailableFlows(entity);
    
    // If we have feature flags, filter flows
    if (systemConfig?.features) {
      return allFlows.filter(flow => {
        // Lineage flows require lineage feature
        if (['LINEAGE', 'IMPACT'].includes(flow.id)) {
          return systemConfig.features.lineage !== false;
        }
        // Glossary flows require glossary feature
        if (['GLOSSARY_LOOKUP'].includes(flow.id)) {
          return systemConfig.features.glossary !== false;
        }
        // Usage flows require queryHistory feature (but allow by default)
        if (['USAGE'].includes(flow.id)) {
          return systemConfig.features.queryHistory !== false;
        }
        return true;
      });
    }
    
    return allFlows;
  }, [entity, systemConfig]);

  const handleSelect = (flowId, overrides = {}) => {
    setIsOpen(false);
    if (onSelectFlow) {
      // Pass systemConfig to buildFlowQuery for config-driven SQL generation
      const builtQuery = buildFlowQuery(flowId, entity, overrides, availableTables, systemConfig?.config);
      onSelectFlow(builtQuery, flowId);
    }
  };

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  if (flows.length === 0) {
    return null;
  }

  // Group flows by category
  const lineageFlows = flows.filter(f => ['LINEAGE', 'IMPACT'].includes(f.id));
  const dataFlows = flows.filter(f => ['SAMPLE_ROWS', 'COLUMN_PROFILE', 'TOP_VALUES', 'NULL_ANALYSIS'].includes(f.id));
  const discoveryFlows = flows.filter(f => ['SCHEMA_BROWSE', 'GLOSSARY_LOOKUP', 'FIND_BY_GUID', 'USAGE'].includes(f.id));
  const otherFlows = flows.filter(f => 
    !lineageFlows.includes(f) && !dataFlows.includes(f) && !discoveryFlows.includes(f)
  );

  const renderFlowGroup = (title, flowList, icon) => {
    if (flowList.length === 0) return null;
    return (
      <div key={title}>
        <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 bg-gray-50/50">
          {icon}
          {title}
        </div>
        {flowList.map((flow) => (
          <button
            key={flow.id}
            onClick={() => handleSelect(flow.id)}
            className="w-full px-3 py-2 flex items-start gap-2.5 hover:bg-indigo-50 transition-colors text-left group"
          >
            <div className="mt-0.5 p-1 rounded bg-gray-100 group-hover:bg-indigo-100 transition-colors">
              <FlowIcon name={flow.icon} size={14} className="text-gray-500 group-hover:text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 group-hover:text-indigo-700">{flow.label}</div>
              <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">{flow.description}</div>
            </div>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg
          bg-gradient-to-r from-indigo-500 to-purple-500 text-white
          hover:from-indigo-600 hover:to-purple-600
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all shadow-sm ${buttonClassName}`}
      >
        <Sparkles size={16} />
        {!compact && <span>Query Flows</span>}
        {openUp ? (
          <ChevronUp size={14} className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        ) : (
          <ChevronDown size={14} className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Menu - positioned above or below based on available space */}
          <div 
            className={`absolute z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden
              ${openUp ? 'bottom-full mb-1' : 'top-full mt-1'}
              right-0`}
            style={{ maxHeight: `${maxHeight}px` }}
          >
            {/* Header */}
            <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">
                    Query Flows
                  </div>
                  <div className="text-sm font-medium text-gray-800 mt-0.5">
                    {entity?.name || entity?.type || 'Current Context'}
                  </div>
                </div>
                {entity?.type && (
                  <span className="text-[10px] px-2 py-0.5 bg-white/80 rounded-full text-gray-500 border">
                    {entity.type}
                  </span>
                )}
              </div>
            </div>
            
            {/* Scrollable content */}
            <div className="overflow-y-auto" style={{ maxHeight: `${maxHeight - 60}px` }}>
              {/* Guided Wizards - show all available wizards from recipes */}
              {onOpenWizard && (
                <WizardSection 
                  entityType={entity?.type} 
                  onOpenWizard={(flowId) => {
                    setIsOpen(false);
                    onOpenWizard(flowId, entity);
                  }}
                />
              )}

              {/* Quick Lineage Buttons for supported entities */}
              {lineageFlows.length > 0 && (
                <div className="p-2 border-b border-gray-100 bg-gray-50/30">
                  <div className="text-[10px] font-medium text-gray-500 mb-1.5 px-1">Quick Lineage (single query)</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelect('LINEAGE', { direction: 'UPSTREAM' })}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg
                        bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                    >
                      <ArrowUpRight size={14} />
                      Upstream
                    </button>
                    <button
                      onClick={() => handleSelect('LINEAGE', { direction: 'DOWNSTREAM' })}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg
                        bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 transition-colors"
                    >
                      <ArrowDownRight size={14} />
                      Downstream
                    </button>
                  </div>
                </div>
              )}

              {/* Grouped Flows */}
              {renderFlowGroup('Data Exploration', dataFlows, <Table size={10} />)}
              {renderFlowGroup('Discovery', discoveryFlows, <Search size={10} />)}
              {renderFlowGroup('Analysis', otherFlows, <BarChart2 size={10} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Quick action buttons for common flows
 */
export function QuickFlowButtons({
  entity,
  availableTables = [],
  onSelectFlow,
  className = '',
}) {
  // Get SystemConfig for config-driven flows
  const systemConfig = useConfig();
  
  const handleFlow = (flowId, overrides = {}) => {
    if (onSelectFlow) {
      // Pass systemConfig to buildFlowQuery for config-driven SQL generation
      const builtQuery = buildFlowQuery(flowId, entity, overrides, availableTables, systemConfig?.config);
      onSelectFlow(builtQuery, flowId);
    }
  };

  // Show different buttons based on entity type
  const showLineage = ['TABLE', 'VIEW', 'COLUMN', 'PROCESS'].includes(entity?.type);
  const showSample = ['TABLE', 'VIEW'].includes(entity?.type);
  const showProfile = entity?.type === 'COLUMN';

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {showLineage && (
        <>
          <button
            onClick={() => handleFlow('LINEAGE', { direction: 'UPSTREAM' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full
              bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
            title="Find upstream dependencies"
          >
            <ArrowUpRight size={14} />
            Upstream
          </button>
          <button
            onClick={() => handleFlow('LINEAGE', { direction: 'DOWNSTREAM' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full
              bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
            title="Find downstream dependencies"
          >
            <ArrowDownRight size={14} />
            Downstream
          </button>
        </>
      )}
      
      {showSample && (
        <button
          onClick={() => handleFlow('SAMPLE_ROWS')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full
            bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          title="Preview sample data"
        >
          <Table size={14} />
          Sample
        </button>
      )}
      
      {showProfile && (
        <button
          onClick={() => handleFlow('COLUMN_PROFILE')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full
            bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
          title="Column statistics"
        >
          <BarChart2 size={14} />
          Profile
        </button>
      )}
      
      <button
        onClick={() => handleFlow('USAGE')}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full
          bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        title="See usage"
      >
        <Activity size={14} />
        Usage
      </button>
    </div>
  );
}

/**
 * Compact flow selector for toolbar
 */
export function FlowSelector({
  entity,
  availableTables = [],
  onSelectFlow,
  selectedFlow,
}) {
  // Get SystemConfig for config-driven flows
  const systemConfig = useConfig();
  
  const flows = useMemo(() => {
    if (!entity?.type) return [];
    return getAvailableFlows(entity);
  }, [entity]);

  if (flows.length === 0) return null;

  return (
    <select
      value={selectedFlow || ''}
      onChange={(e) => {
        if (e.target.value && onSelectFlow) {
          // Pass systemConfig to buildFlowQuery for config-driven SQL generation
          const builtQuery = buildFlowQuery(e.target.value, entity, {}, availableTables, systemConfig?.config);
          onSelectFlow(builtQuery, e.target.value);
        }
      }}
      className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
    >
      <option value="">Select a query flow...</option>
      {flows.map((flow) => (
        <option key={flow.id} value={flow.id}>
          {flow.label} - {flow.description}
        </option>
      ))}
    </select>
  );
}

export default QueryFlowMenu;

