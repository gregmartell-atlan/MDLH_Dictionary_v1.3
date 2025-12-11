/**
 * EntityDetailPanel - Right sidebar showing entity details and related queries
 *
 * Shows:
 * - Selected entity metadata (name, table, description)
 * - Related queries for the entity type
 * - Quick actions (copy, run in editor)
 */

import React, { useState, useMemo } from 'react';
import {
  Table2, BookOpen, GitBranch, ShieldCheck, BarChart3, Plug,
  Play, Copy, Check, X, Database, FileText, Tag, Clock
} from 'lucide-react';

// Entity type to queries mapping
const ENTITY_QUERIES = {
  core: [
    { id: 'table-details', label: 'Table metadata', sql: "SELECT * FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE NAME = '{{ENTITY_NAME}}' LIMIT 1;" },
    { id: 'table-columns', label: 'Table columns', sql: "SELECT NAME, DATATYPE, ISNULLABLE, ORDINALPOSITION FROM {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY WHERE TABLENAME = '{{TABLE_NAME}}' ORDER BY ORDINALPOSITION;" },
    { id: 'table-lineage', label: 'Table lineage', sql: "SELECT NAME, INPUTS::STRING, OUTPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE OUTPUTS::STRING ILIKE '%{{TABLE_NAME}}%' OR INPUTS::STRING ILIKE '%{{TABLE_NAME}}%' LIMIT 20;" },
  ],
  glossary: [
    { id: 'term-details', label: 'Term details', sql: "SELECT * FROM {{DATABASE}}.{{SCHEMA}}.GLOSSARY_ENTITY WHERE NAME = '{{ENTITY_NAME}}' LIMIT 1;" },
    { id: 'linked-assets', label: 'Linked assets', sql: "SELECT NAME, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE USERDESCRIPTION ILIKE '%{{ENTITY_NAME}}%' LIMIT 20;" },
  ],
  lineage: [
    { id: 'process-details', label: 'Process details', sql: "SELECT * FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE NAME = '{{ENTITY_NAME}}' LIMIT 1;" },
    { id: 'upstream', label: 'Upstream sources', sql: "SELECT NAME, INPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE NAME = '{{ENTITY_NAME}}';" },
    { id: 'downstream', label: 'Downstream targets', sql: "SELECT NAME, OUTPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE NAME = '{{ENTITY_NAME}}';" },
  ],
  governance: [
    { id: 'owner-details', label: 'Ownership info', sql: "SELECT NAME, OWNERNAME, CERTIFICATESTATUS FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE NAME = '{{ENTITY_NAME}}' LIMIT 1;" },
    { id: 'classifications', label: 'Classifications', sql: "SELECT NAME, CLASSIFICATIONNAMES FROM {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY WHERE TABLENAME = '{{TABLE_NAME}}' AND CLASSIFICATIONNAMES IS NOT NULL;" },
  ],
  usage: [
    { id: 'usage-stats', label: 'Usage statistics', sql: "SELECT NAME, POPULARITYSCORE, QUERYCOUNT, TO_TIMESTAMP(UPDATETIME/1000) as LAST_UPDATED FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE NAME = '{{ENTITY_NAME}}';" },
  ],
  bi: [
    { id: 'bi-details', label: 'BI asset details', sql: "SELECT * FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE NAME = '{{ENTITY_NAME}}' LIMIT 1;" },
  ],
};

// Query item component
function QueryItem({ query, database, schema, entityName, tableName, onRun }) {
  const [copied, setCopied] = useState(false);

  const sql = query.sql
    .replace(/\{\{DATABASE\}\}/g, database)
    .replace(/\{\{SCHEMA\}\}/g, schema)
    .replace(/\{\{ENTITY_NAME\}\}/g, entityName || '')
    .replace(/\{\{TABLE_NAME\}\}/g, tableName || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group border border-slate-200 rounded-lg p-3 hover:border-slate-300 transition-colors bg-white">
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
      <pre className="text-xs text-slate-600 bg-slate-50 p-2 rounded overflow-x-auto font-mono whitespace-pre-wrap">
        {sql}
      </pre>
    </div>
  );
}

export default function EntityDetailPanel({
  selectedEntity,
  category = 'core',
  database = 'ACME_ANALYTICS',
  schema = 'MDLH',
  onOpenInEditor,
  onClose,
}) {
  const queries = useMemo(() => {
    return ENTITY_QUERIES[category] || ENTITY_QUERIES.core;
  }, [category]);

  if (!selectedEntity) {
    return (
      <div className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col flex-shrink-0">
        <div className="flex-1 flex items-center justify-center text-slate-400 p-4">
          <div className="text-center">
            <Database size={40} strokeWidth={1} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium">No entity selected</p>
            <p className="text-xs mt-1">Click a row in the table to view details</p>
          </div>
        </div>
      </div>
    );
  }

  const entityName = selectedEntity.entity || selectedEntity.name || 'Unknown';
  const tableName = selectedEntity.table || selectedEntity.tableName || '';
  const description = selectedEntity.description || '';
  const entityType = selectedEntity.entityType || 'Entity';

  return (
    <div className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate" title={entityName}>
              {entityName}
            </h3>
            {tableName && tableName !== '(abstract)' && (
              <div className="flex items-center gap-1.5 mt-1">
                <Table2 size={12} className="text-slate-400" />
                <span className="text-xs text-slate-600 font-mono truncate">{tableName}</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
            title="Close panel"
          >
            <X size={16} />
          </button>
        </div>

        {description && (
          <p className="text-xs text-slate-600 mt-2 line-clamp-3">{description}</p>
        )}

        {/* Entity metadata badges */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
            <Tag size={10} />
            {entityType}
          </span>
          {tableName && tableName !== '(abstract)' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-xs">
              <FileText size={10} />
              Has Table
            </span>
          )}
        </div>
      </div>

      {/* Queries section */}
      <div className="flex-1 overflow-y-auto p-4">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Related Queries ({queries.length})
        </h4>
        <div className="space-y-3">
          {queries.map((query) => (
            <QueryItem
              key={query.id}
              query={query}
              database={database}
              schema={schema}
              entityName={entityName}
              tableName={tableName}
              onRun={onOpenInEditor}
            />
          ))}
        </div>
      </div>

      {/* Footer with context */}
      <div className="p-3 border-t border-slate-200 bg-white">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Database size={12} className="text-slate-400" />
          <span className="font-mono truncate">{database}.{schema}</span>
        </div>
      </div>
    </div>
  );
}
