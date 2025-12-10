/**
 * EntityActions Component
 * 
 * Row-level actions for entity data in result tables.
 * Provides quick access to query flows for any entity row.
 */

import React, { useState, useMemo } from 'react';
import {
  MoreHorizontal,
  GitBranch,
  Activity,
  Table,
  Search,
  ChevronRight,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
} from 'lucide-react';
import { buildEntityContext, getAvailableFlows, buildFlowQuery } from '../queryFlows';

/**
 * Detect if a row looks like entity data (has GUID, name, typename, etc.)
 * @param {Object} row - Row data object
 * @param {string[]} columns - Column names
 * @returns {boolean}
 */
export function isEntityRow(row, columns) {
  const colLower = columns.map(c => c.toLowerCase());
  
  // Must have GUID or qualifiedname to be considered an entity
  const hasIdentifier = colLower.includes('guid') || colLower.includes('qualifiedname');
  // Should have a name
  const hasName = colLower.includes('name');
  
  return hasIdentifier && hasName;
}

/**
 * Build entity context from a result row
 * @param {Object} row - Row data object (keyed by column name)
 * @returns {import('../queryFlows/types').EntityContext}
 */
export function buildEntityFromRow(row) {
  return buildEntityContext(row);
}

/**
 * Inline action button for a single flow
 */
export function FlowActionButton({ 
  icon: Icon, 
  label, 
  onClick, 
  color = 'gray',
  size = 'sm',
}) {
  const colorClasses = {
    gray: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
    blue: 'text-blue-500 hover:text-blue-700 hover:bg-blue-50',
    orange: 'text-orange-500 hover:text-orange-700 hover:bg-orange-50',
    emerald: 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50',
    purple: 'text-purple-500 hover:text-purple-700 hover:bg-purple-50',
  };
  
  const sizeClasses = {
    xs: 'p-1',
    sm: 'p-1.5',
    md: 'px-2 py-1.5',
  };

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded transition-colors ${colorClasses[color]} ${sizeClasses[size]}`}
      title={label}
    >
      <Icon size={14} />
      {size === 'md' && <span className="text-xs font-medium">{label}</span>}
    </button>
  );
}

/**
 * Quick action buttons for common entity flows
 */
export function EntityQuickActions({
  entity,
  availableTables = [],
  onSelectFlow,
  compact = false,
}) {
  const showLineage = ['TABLE', 'VIEW', 'COLUMN', 'PROCESS'].includes(entity?.type);
  const showSample = ['TABLE', 'VIEW'].includes(entity?.type);

  const handleFlow = (flowId, overrides = {}) => {
    if (onSelectFlow) {
      const builtQuery = buildFlowQuery(flowId, entity, overrides, availableTables);
      onSelectFlow(builtQuery, flowId);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {showLineage && (
          <>
            <FlowActionButton
              icon={ArrowUpRight}
              label="Upstream lineage"
              onClick={() => handleFlow('LINEAGE', { direction: 'UPSTREAM' })}
              color="blue"
              size="xs"
            />
            <FlowActionButton
              icon={ArrowDownRight}
              label="Downstream lineage"
              onClick={() => handleFlow('LINEAGE', { direction: 'DOWNSTREAM' })}
              color="orange"
              size="xs"
            />
          </>
        )}
        <FlowActionButton
          icon={Search}
          label="Find by GUID"
          onClick={() => handleFlow('FIND_BY_GUID')}
          color="gray"
          size="xs"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {showLineage && (
        <>
          <FlowActionButton
            icon={ArrowUpRight}
            label="Upstream"
            onClick={() => handleFlow('LINEAGE', { direction: 'UPSTREAM' })}
            color="blue"
            size="md"
          />
          <FlowActionButton
            icon={ArrowDownRight}
            label="Downstream"
            onClick={() => handleFlow('LINEAGE', { direction: 'DOWNSTREAM' })}
            color="orange"
            size="md"
          />
        </>
      )}
      {showSample && (
        <FlowActionButton
          icon={Table}
          label="Sample"
          onClick={() => handleFlow('SAMPLE_ROWS')}
          color="emerald"
          size="md"
        />
      )}
    </div>
  );
}

/**
 * Full dropdown menu for all available flows
 */
export function EntityActionsMenu({
  row,
  columns,
  availableTables = [],
  onSelectFlow,
  position = 'bottom-end',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Build entity context from row
  const entity = useMemo(() => {
    return buildEntityFromRow(row);
  }, [row]);

  // Get available flows for this entity type
  const flows = useMemo(() => {
    if (!entity?.type) return [];
    return getAvailableFlows(entity);
  }, [entity]);

  // Handle flow selection
  const handleSelect = (flowId, overrides = {}) => {
    setIsOpen(false);
    if (onSelectFlow) {
      const builtQuery = buildFlowQuery(flowId, entity, overrides, availableTables);
      onSelectFlow(builtQuery, flowId);
    }
  };

  // Copy GUID
  const handleCopyGuid = async () => {
    if (entity.guid) {
      await navigator.clipboard.writeText(entity.guid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (flows.length === 0 && !entity.guid) {
    return null;
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        title="Entity actions"
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          
          {/* Menu */}
          <div className={`absolute z-50 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 ${
            position === 'bottom-end' ? 'right-0 top-full mt-1' : 'left-0 top-full mt-1'
          }`}>
            {/* Entity header */}
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="text-xs text-gray-500 uppercase tracking-wide">
                {entity.type || 'Entity'}
              </div>
              <div className="text-sm font-medium text-gray-900 truncate">
                {entity.name || entity.qualifiedName || 'Unknown'}
              </div>
            </div>

            {/* Copy GUID */}
            {entity.guid && (
              <button
                onClick={handleCopyGuid}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copied ? 'Copied!' : 'Copy GUID'}</span>
                <span className="ml-auto text-xs text-gray-400 font-mono">
                  {entity.guid.substring(0, 8)}...
                </span>
              </button>
            )}

            {/* Divider */}
            {entity.guid && flows.length > 0 && (
              <div className="border-t border-gray-100 my-1" />
            )}

            {/* Query flows */}
            {flows.slice(0, 6).map((flow) => (
              <button
                key={flow.id}
                onClick={() => handleSelect(flow.id)}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <span className="flex-1 text-left">{flow.label}</span>
                <ChevronRight size={14} className="text-gray-400" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Add this to a results table row to enable entity actions
 */
export function EntityRowActions({
  row,
  columns,
  availableTables = [],
  onSelectFlow,
  variant = 'quick', // 'quick' | 'menu' | 'both'
}) {
  // Check if this row looks like entity data
  if (!isEntityRow(row, columns)) {
    return null;
  }

  const entity = buildEntityFromRow(row);

  if (variant === 'quick') {
    return (
      <EntityQuickActions
        entity={entity}
        availableTables={availableTables}
        onSelectFlow={onSelectFlow}
        compact
      />
    );
  }

  if (variant === 'menu') {
    return (
      <EntityActionsMenu
        row={row}
        columns={columns}
        availableTables={availableTables}
        onSelectFlow={onSelectFlow}
      />
    );
  }

  // Both
  return (
    <div className="flex items-center gap-1">
      <EntityQuickActions
        entity={entity}
        availableTables={availableTables}
        onSelectFlow={onSelectFlow}
        compact
      />
      <EntityActionsMenu
        row={row}
        columns={columns}
        availableTables={availableTables}
        onSelectFlow={onSelectFlow}
      />
    </div>
  );
}

export default EntityActionsMenu;

