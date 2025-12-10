/**
 * CategorySidebar - Modern collapsible left navigation sidebar
 *
 * Features:
 * - Collapsible to icon-only mode
 * - Grouped categories with visual hierarchy
 * - Keyboard navigation support
 * - Smooth transitions
 * - Tooltips in collapsed mode
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

// Category groups for visual organization - matches tabs from constants.js
const CATEGORY_GROUPS = [
  {
    id: 'explore',
    label: 'Explore',
    categories: ['core', 'glossary', 'datamesh', 'relational'],
  },
  {
    id: 'data',
    label: 'Data Flow',
    categories: ['lineage', 'usage', 'queries'],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    categories: ['bi', 'dbt', 'storage', 'orchestration'],
  },
  {
    id: 'manage',
    label: 'Manage',
    categories: ['governance', 'ai'],
  },
];

// Export for use in App.jsx
export { CATEGORY_GROUPS };

// Tooltip component for collapsed mode
function Tooltip({ children, text, visible }) {
  if (!visible) return children;

  return (
    <div className="relative group">
      {children}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 pointer-events-none">
        {text}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
      </div>
    </div>
  );
}

// Single category item
function CategoryItem({
  tab,
  isSelected,
  isCollapsed,
  onClick,
  queryCount,
}) {
  const Icon = tab.icon;

  return (
    <Tooltip text={tab.label} visible={isCollapsed}>
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ${
          isSelected
            ? 'bg-blue-50 text-blue-700 font-medium shadow-sm'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        } ${isCollapsed ? 'justify-center px-2' : ''}`}
        title={isCollapsed ? tab.label : undefined}
      >
        <Icon
          size={18}
          className={`flex-shrink-0 ${
            isSelected ? 'text-blue-600' : 'text-gray-400'
          }`}
        />
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left text-sm truncate">
              {tab.label}
            </span>
            {queryCount !== undefined && queryCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isSelected
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {queryCount}
              </span>
            )}
          </>
        )}
      </button>
    </Tooltip>
  );
}

// Category group section
function CategoryGroup({
  group,
  tabs,
  selectedId,
  isCollapsed,
  onSelect,
  queryCounts,
}) {
  const groupTabs = useMemo(
    () => tabs.filter((t) => group.categories.includes(t.id)),
    [tabs, group.categories]
  );

  if (groupTabs.length === 0) return null;

  return (
    <div className="mb-4">
      {!isCollapsed && (
        <div className="px-3 mb-1.5">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {group.label}
          </span>
        </div>
      )}
      {isCollapsed && <div className="border-t border-gray-200 my-2" />}
      <div className="space-y-0.5">
        {groupTabs.map((tab) => (
          <CategoryItem
            key={tab.id}
            tab={tab}
            isSelected={selectedId === tab.id}
            isCollapsed={isCollapsed}
            onClick={() => onSelect(tab.id)}
            queryCount={queryCounts?.[tab.id]}
          />
        ))}
      </div>
    </div>
  );
}

export default function CategorySidebar({
  tabs = [],
  selectedId,
  onSelect,
  queryCounts = {},
  defaultCollapsed = false,
}) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  // Filter out editor tab - it's handled separately
  const categoryTabs = useMemo(
    () => tabs.filter((t) => !t.isEditor),
    [tabs]
  );

  const editorTab = useMemo(
    () => tabs.find((t) => t.isEditor),
    [tabs]
  );

  return (
    <div
      className={`flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-200 ${
        isCollapsed ? 'w-14' : 'w-56'
      }`}
    >
      {/* Header with collapse toggle */}
      <div
        className={`flex items-center h-14 px-3 border-b border-gray-100 ${
          isCollapsed ? 'justify-center' : 'justify-between'
        }`}
      >
        {!isCollapsed && (
          <span className="text-sm font-semibold text-gray-800">
            Categories
          </span>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <PanelLeft size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      </div>

      {/* Category groups */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        {CATEGORY_GROUPS.map((group) => (
          <CategoryGroup
            key={group.id}
            group={group}
            tabs={categoryTabs}
            selectedId={selectedId}
            isCollapsed={isCollapsed}
            onSelect={onSelect}
            queryCounts={queryCounts}
          />
        ))}
      </div>

      {/* Editor button at bottom */}
      {editorTab && (
        <div className="border-t border-gray-200 p-2">
          <Tooltip text={editorTab.label} visible={isCollapsed}>
            <button
              onClick={() => onSelect(editorTab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                selectedId === editorTab.id
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              } ${isCollapsed ? 'justify-center px-2' : ''}`}
            >
              <editorTab.icon
                size={18}
                className={
                  selectedId === editorTab.id ? 'text-white' : 'text-gray-500'
                }
              />
              {!isCollapsed && (
                <span className="text-sm font-medium">{editorTab.label}</span>
              )}
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
