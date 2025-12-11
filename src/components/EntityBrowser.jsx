/**
 * EntityBrowser - Grouped category navigation sidebar (Browse tab)
 *
 * Matches the screenshot layout with grouped sections:
 * - EXPLORE: Core, Glossary, Data Mesh, Relational DB
 * - DATA FLOW: Lineage, Usage, Query Org
 * - INTEGRATIONS: BI Tools, dbt, Object Storage, Orchestration
 * - MANAGE: Governance
 */

import React, { useState, useMemo } from 'react';
import {
  Table2, BookOpen, GitBranch, ShieldCheck, BarChart3,
  LayoutGrid, Database, Workflow, BarChart2, FileCode,
  HardDrive, Clock, Search, PanelLeftClose, PanelLeft,
  Share2, Boxes, TableProperties
} from 'lucide-react';

// Category definitions matching the screenshot
const CATEGORIES = [
  // EXPLORE group
  { id: 'core', label: 'Core', icon: Table2, group: 'explore' },
  { id: 'glossary', label: 'Glossary', icon: BookOpen, group: 'explore' },
  { id: 'datamesh', label: 'Data Mesh', icon: Boxes, group: 'explore' },
  { id: 'relational', label: 'Relational DB', icon: TableProperties, group: 'explore' },

  // DATA FLOW group
  { id: 'lineage', label: 'Lineage', icon: GitBranch, group: 'dataflow' },
  { id: 'usage', label: 'Usage', icon: BarChart3, group: 'dataflow' },
  { id: 'queries', label: 'Query Org', icon: FileCode, group: 'dataflow' },

  // INTEGRATIONS group
  { id: 'bi', label: 'BI Tools', icon: BarChart2, group: 'integrations' },
  { id: 'dbt', label: 'dbt', icon: Workflow, group: 'integrations' },
  { id: 'storage', label: 'Object Storage', icon: HardDrive, group: 'integrations' },
  { id: 'orchestration', label: 'Orchestration', icon: Clock, group: 'integrations' },

  // MANAGE group
  { id: 'governance', label: 'Governance', icon: ShieldCheck, group: 'manage' },
];

const GROUPS = [
  { id: 'explore', label: 'EXPLORE' },
  { id: 'dataflow', label: 'DATA FLOW' },
  { id: 'integrations', label: 'INTEGRATIONS' },
  { id: 'manage', label: 'MANAGE' },
];

// Category item component
function CategoryItem({ category, isSelected, onClick }) {
  const Icon = category.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(category)}
      className={`
        w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all
        ${isSelected
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-slate-700 hover:bg-slate-100'
        }
      `}
    >
      <Icon size={18} className={isSelected ? 'text-blue-600' : 'text-slate-500'} />
      <span>{category.label}</span>
    </button>
  );
}

// Group section component
function CategoryGroup({ group, categories, selectedId, onSelect }) {
  const groupCategories = categories.filter(c => c.group === group.id);

  if (groupCategories.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="px-3 mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {group.label}
      </h3>
      <div className="space-y-0.5">
        {groupCategories.map(category => (
          <CategoryItem
            key={category.id}
            category={category}
            isSelected={selectedId === category.id}
            onClick={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export default function EntityBrowser({
  database = 'ACME_ANALYTICS',
  schema = 'MDLH',
  onOpenInEditor,
  onCategoryChange,
  selectedCategory = 'core',
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter categories by search
  const filteredCategories = useMemo(() => {
    if (!searchQuery) return CATEGORIES;
    const lower = searchQuery.toLowerCase();
    return CATEGORIES.filter(c => c.label.toLowerCase().includes(lower));
  }, [searchQuery]);

  const handleSelect = (category) => {
    onCategoryChange?.(category.id);
  };

  if (isCollapsed) {
    return (
      <div className="w-14 border-r border-slate-200 flex flex-col bg-white flex-shrink-0">
        <div className="p-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setIsCollapsed(false)}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="Expand sidebar"
          >
            <PanelLeft size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {CATEGORIES.map(category => {
            const Icon = category.icon;
            const isSelected = selectedCategory === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => handleSelect(category)}
                className={`
                  w-full p-2 flex justify-center transition-colors
                  ${isSelected
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                  }
                `}
                title={category.label}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-52 border-r border-slate-200 flex flex-col bg-white flex-shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">Categories</span>
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* Category groups */}
      <div className="flex-1 overflow-y-auto p-2">
        {GROUPS.map(group => (
          <CategoryGroup
            key={group.id}
            group={group}
            categories={filteredCategories}
            selectedId={selectedCategory}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}
