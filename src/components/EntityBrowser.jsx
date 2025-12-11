/**
 * EntityBrowser - Tree-based entity navigation (Browse tab)
 *
 * DBeaver-style tree browser for power users:
 * - Left panel: Entity type tree
 * - Right panel: Entity details/queries
 */

import React, { useState, useMemo } from 'react';
import {
  Table2, BookOpen, GitBranch, ShieldCheck, BarChart3, Plug,
  Code2, Play, Copy, Check, ChevronRight, Search, Database
} from 'lucide-react';
import TreeView from './TreeView';

// Entity tree structure - consolidates the 13 categories into 6
const ENTITY_TREE = [
  {
    id: 'tables',
    label: 'Tables & Columns',
    icon: Table2,
    description: 'Explore table and column metadata',
    queries: [
      { id: 'list-tables', label: 'List all tables', sql: 'SELECT NAME, SCHEMANAME, DATABASENAME, COLUMNCOUNT, POPULARITYSCORE FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY ORDER BY POPULARITYSCORE DESC NULLS LAST LIMIT 100;' },
      { id: 'table-details', label: 'Table details by name', sql: "SELECT NAME, TYPENAME, USERDESCRIPTION, COLUMNCOUNT, CREATETIME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE NAME ILIKE '%your_table%' LIMIT 20;" },
      { id: 'column-search', label: 'Search columns', sql: "SELECT NAME, TABLENAME, DATATYPE, ISNULLABLE FROM {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY WHERE NAME ILIKE '%search_term%' LIMIT 50;" },
      { id: 'columns-by-table', label: 'Columns in a table', sql: "SELECT NAME, DATATYPE, ISNULLABLE, ORDINALPOSITION FROM {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY WHERE TABLENAME = 'your_table' ORDER BY ORDINALPOSITION;" },
    ],
  },
  {
    id: 'glossary',
    label: 'Business Glossary',
    icon: BookOpen,
    description: 'Business terms and definitions',
    queries: [
      { id: 'glossary-terms', label: 'All glossary terms', sql: 'SELECT NAME, USERDESCRIPTION, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.GLOSSARY_ENTITY LIMIT 100;' },
      { id: 'term-search', label: 'Search terms', sql: "SELECT NAME, USERDESCRIPTION FROM {{DATABASE}}.{{SCHEMA}}.GLOSSARY_ENTITY WHERE NAME ILIKE '%search%' OR USERDESCRIPTION ILIKE '%search%' LIMIT 50;" },
      { id: 'linked-assets', label: 'Terms linked to assets', sql: 'SELECT g.NAME as TERM, COUNT(*) as LINKED_ASSETS FROM {{DATABASE}}.{{SCHEMA}}.GLOSSARY_ENTITY g GROUP BY g.NAME ORDER BY LINKED_ASSETS DESC LIMIT 20;' },
    ],
  },
  {
    id: 'lineage',
    label: 'Data Lineage',
    icon: GitBranch,
    description: 'Data flow and transformations',
    queries: [
      { id: 'all-processes', label: 'All ETL processes', sql: 'SELECT NAME, TYPENAME, INPUTS::STRING, OUTPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY LIMIT 50;' },
      { id: 'upstream', label: 'Upstream dependencies', sql: "SELECT NAME, INPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE OUTPUTS::STRING ILIKE '%your_table%' LIMIT 20;" },
      { id: 'downstream', label: 'Downstream dependencies', sql: "SELECT NAME, OUTPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE INPUTS::STRING ILIKE '%your_table%' LIMIT 20;" },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    icon: ShieldCheck,
    description: 'Ownership, certifications, and compliance',
    queries: [
      { id: 'owners', label: 'Asset owners', sql: "SELECT NAME, OWNERNAME, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE OWNERNAME IS NOT NULL LIMIT 50;" },
      { id: 'certifications', label: 'Certified assets', sql: "SELECT NAME, CERTIFICATESTATUS, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE CERTIFICATESTATUS IS NOT NULL LIMIT 50;" },
      { id: 'pii-tags', label: 'PII tagged columns', sql: "SELECT NAME, TABLENAME, CLASSIFICATIONNAMES FROM {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY WHERE CLASSIFICATIONNAMES::STRING ILIKE '%pii%' LIMIT 50;" },
    ],
  },
  {
    id: 'usage',
    label: 'Usage & Analytics',
    icon: BarChart3,
    description: 'Query patterns and popularity',
    queries: [
      { id: 'popular-tables', label: 'Most popular tables', sql: 'SELECT NAME, POPULARITYSCORE, QUERYCOUNT FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE POPULARITYSCORE IS NOT NULL ORDER BY POPULARITYSCORE DESC LIMIT 20;' },
      { id: 'recent-queries', label: 'Recently queried', sql: 'SELECT NAME, QUERYCOUNT, TO_TIMESTAMP(UPDATETIME/1000) as LAST_UPDATED FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE QUERYCOUNT > 0 ORDER BY UPDATETIME DESC LIMIT 20;' },
      { id: 'unused-tables', label: 'Unused tables', sql: 'SELECT NAME, SCHEMANAME, CREATETIME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE (QUERYCOUNT IS NULL OR QUERYCOUNT = 0) AND POPULARITYSCORE IS NULL LIMIT 50;' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Plug,
    description: 'BI tools, dbt, orchestration',
    queries: [
      { id: 'bi-assets', label: 'BI tool assets', sql: "SELECT NAME, TYPENAME, QUALIFIEDNAME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE TYPENAME ILIKE '%tableau%' OR TYPENAME ILIKE '%looker%' OR TYPENAME ILIKE '%powerbi%' LIMIT 50;" },
      { id: 'dbt-models', label: 'dbt models', sql: "SELECT NAME, TYPENAME, INPUTS::STRING, OUTPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE TYPENAME ILIKE '%dbt%' LIMIT 50;" },
      { id: 'airflow-tasks', label: 'Airflow tasks', sql: "SELECT NAME, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE TYPENAME ILIKE '%airflow%' LIMIT 50;" },
    ],
  },
];

// Query item in the detail panel
function QueryItem({ query, database, schema, onRun }) {
  const [copied, setCopied] = useState(false);

  const sql = query.sql
    .replace(/\{\{DATABASE\}\}/g, database)
    .replace(/\{\{SCHEMA\}\}/g, schema);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-800">{query.label}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
            title="Copy SQL"
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
          <button
            type="button"
            onClick={() => onRun(sql, query)}
            className="p-1.5 text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors"
            title="Run in Editor"
          >
            <Play size={14} />
          </button>
        </div>
      </div>
      <pre className="text-xs text-slate-600 bg-slate-50 p-2 rounded overflow-x-auto font-mono">
        {sql}
      </pre>
    </div>
  );
}

// Detail panel for selected entity category
function EntityDetail({ entity, database, schema, onOpenInEditor }) {
  if (!entity) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400">
        <div className="text-center">
          <Database size={48} strokeWidth={1} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm">Select a category to explore</p>
        </div>
      </div>
    );
  }

  const Icon = entity.icon;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-slate-100 rounded-lg">
          <Icon size={20} className="text-slate-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{entity.label}</h2>
          <p className="text-sm text-slate-600">{entity.description}</p>
        </div>
      </div>

      {/* Queries */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Available Queries ({entity.queries.length})
        </h3>
        {entity.queries.map((query) => (
          <QueryItem
            key={query.id}
            query={query}
            database={database}
            schema={schema}
            onRun={onOpenInEditor}
          />
        ))}
      </div>
    </div>
  );
}

// Category mapping from EntityBrowser categories to App.jsx tab IDs
const CATEGORY_TO_TAB = {
  'tables': 'core',
  'glossary': 'glossary',
  'lineage': 'lineage',
  'governance': 'governance',
  'usage': 'usage',
  'integrations': 'bi',
};

export default function EntityBrowser({
  database = 'ACME_ANALYTICS',
  schema = 'MDLH',
  onOpenInEditor,
  onCategoryChange,
  selectedCategory,
}) {
  const [searchQuery, setSearchQuery] = useState('');

  // Map selectedCategory back to tree ID
  const selectedId = useMemo(() => {
    const entry = Object.entries(CATEGORY_TO_TAB).find(([_, tab]) => tab === selectedCategory);
    return entry ? entry[0] : 'tables';
  }, [selectedCategory]);

  // Filter tree nodes by search
  const filteredTree = useMemo(() => {
    if (!searchQuery) return ENTITY_TREE;
    const lower = searchQuery.toLowerCase();
    return ENTITY_TREE.filter(
      (node) =>
        node.label.toLowerCase().includes(lower) ||
        node.description.toLowerCase().includes(lower) ||
        node.queries.some((q) => q.label.toLowerCase().includes(lower))
    );
  }, [searchQuery]);

  const selectedEntity = useMemo(() => {
    return ENTITY_TREE.find((e) => e.id === selectedId);
  }, [selectedId]);

  const handleSelect = (node) => {
    // Map tree category to App.jsx tab ID
    const tabId = CATEGORY_TO_TAB[node.id] || 'core';
    onCategoryChange?.(tabId);
  };

  return (
    <div className="w-64 border-r border-slate-200 flex flex-col bg-slate-50 flex-shrink-0">
      {/* Search */}
      <div className="p-3 border-b border-slate-200">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter categories..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        <TreeView
          nodes={filteredTree}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>

      {/* Quick Query Panel - shows queries for selected category */}
      {selectedEntity && (
        <div className="border-t border-slate-200 bg-white max-h-64 overflow-y-auto">
          <div className="p-3">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Quick Queries
            </h4>
            <div className="space-y-1">
              {selectedEntity.queries.slice(0, 3).map((query) => {
                const sql = query.sql
                  .replace(/\{\{DATABASE\}\}/g, database)
                  .replace(/\{\{SCHEMA\}\}/g, schema);
                return (
                  <button
                    key={query.id}
                    type="button"
                    onClick={() => onOpenInEditor?.(sql, query)}
                    className="w-full text-left px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded transition-colors truncate"
                    title={query.label}
                  >
                    {query.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Context footer */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Database size={12} className="text-slate-400" />
          <span className="font-mono truncate">{database}.{schema}</span>
        </div>
      </div>
    </div>
  );
}
