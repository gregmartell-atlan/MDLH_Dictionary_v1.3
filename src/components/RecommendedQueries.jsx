import React, { useMemo, useState } from 'react';
import {
  X, Database, Snowflake, Code2, Play, Copy, Check,
  ArrowRight, Tag, BookOpen, BarChart3,
  Layers, Shield, FileText, Sparkles, AlertCircle, ChevronDown
} from 'lucide-react';
import { buildDynamicRecommendations, getAvailableQueryCategories } from '../utils/dynamicQueryBuilder';
import { getTableMetadata } from '../utils/tableDiscovery';

/**
 * RecommendedQueries - Query recommendations panel
 *
 * Features:
 * - Clean white modal with subtle borders
 * - Category selector dropdown
 * - Clean query list items
 */

// Icon mapping for query categories
const categoryIcons = {
  structure: Database,
  lineage: Layers,
  governance: Shield,
  usage: BarChart3,
  quality: FileText,
  glossary: BookOpen,
  default: Code2
};

// Query item component
function QueryItem({ query, onRun, onCopy }) {
  const [copied, setCopied] = useState(false);
  const Icon = categoryIcons[query.category] || categoryIcons.default;
  
  const sql = query.sql;
  
  // Check if query uses real sample data
  const usesRealData = useMemo(() => {
    return !sql.includes('<YOUR_GUID_HERE>') && 
           !sql.includes("'<") &&
           !sql.includes('<TABLE>');
  }, [sql]);
  
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.(query);
  };
  
  const handleRun = (e) => {
    e.stopPropagation();
    onRun?.(sql, query);
  };
  
  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0">
      <Icon size={16} className="text-slate-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-700 truncate">
          {query.label}
        </div>
        {query.description && (
          <div className="text-xs text-slate-500 truncate mt-0.5">
            {query.description}
          </div>
        )}
      </div>
      {usesRealData && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded">
          <Sparkles size={10} />
          Ready
        </span>
      )}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          title="Copy SQL"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
        <button
          onClick={handleRun}
          className="p-1.5 text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
          title="Run in Editor"
        >
          <Play size={14} />
        </button>
      </div>
    </div>
  );
}

// Category tab button
function CategoryTab({ label, icon: Icon, isActive, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
        isActive 
          ? 'bg-slate-900 text-white' 
          : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {Icon && <Icon size={14} />}
      <span>{label}</span>
      {count !== undefined && (
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          isActive ? 'bg-white/20' : 'bg-slate-200'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

// Main component
export default function RecommendedQueries({ 
  entity,
  entityContext,
  isOpen, 
  onClose,
  onRunQuery,
  database,
  schema,
  availableTables = [],
  sampleEntities = null,
}) {
  const [activeTab, setActiveTab] = useState('mdlh');
  
  // Build context from entity and props
  const ctx = useMemo(() => ({
    database: database || entityContext?.database,
    schema: schema || entityContext?.schema,
    table: entity?.table || entityContext?.table,
    column: entityContext?.column,
    guid: entity?.guid || entityContext?.guid,
    qualifiedName: entityContext?.qualifiedName,
    entityType: entity?.entityType || entityContext?.entityType || 'TABLE',
    daysBack: 30
  }), [entity, entityContext, database, schema]);
  
  // Get table metadata with popularity scores
  const tableMetadata = useMemo(() => {
    if (!ctx.database || !ctx.schema) return {};
    return getTableMetadata(ctx.database, ctx.schema);
  }, [ctx.database, ctx.schema]);

  // Get dynamic recommendations based on discovered tables + popularity
  const recommendations = useMemo(() => {
    if (!availableTables || availableTables.length === 0) {
      return [];
    }

    return buildDynamicRecommendations({
      database: ctx.database,
      schema: ctx.schema,
      discoveredTables: new Set(availableTables),
      tableMetadata,  // Now passing popularity data!
      samples: sampleEntities || {},
      context: ctx
    });
  }, [ctx, availableTables, tableMetadata, sampleEntities]);
  
  // Get category info (also uses popularity for sorting)
  const availableCategories = useMemo(() => {
    if (!availableTables || availableTables.length === 0) {
      return null;
    }
    return getAvailableQueryCategories(new Set(availableTables), tableMetadata);
  }, [availableTables, tableMetadata]);
  
  // Check for sample data
  const hasSamples = sampleEntities && (
    sampleEntities.tables?.length > 0 || 
    sampleEntities.columns?.length > 0 ||
    sampleEntities.processes?.length > 0
  );
  
  // Split into MDLH and Snowflake queries
  const { mdlhQueries, snowflakeQueries } = useMemo(() => {
    const mdlh = [];
    const sf = [];
    
    recommendations.forEach((item) => {
      const query = item.query || item;
      if (query.layer === 'mdlh') {
        mdlh.push(query);
      } else if (query.layer === 'snowflake') {
        sf.push(query);
      }
    });
    
    return { mdlhQueries: mdlh, snowflakeQueries: sf };
  }, [recommendations]);
  
  const handleRunQuery = (sql, query) => {
    onRunQuery?.(sql, query);
  };
  
  if (!isOpen) return null;
  
  const entityName = entity?.entity || entity?.name || ctx.table || 'Entity';
  const activeQueries = activeTab === 'mdlh' ? mdlhQueries : snowflakeQueries;
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Recommended Queries
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                for <code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-xs">{entityName}</code>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          {/* Context badges - subtle */}
          <div className="flex flex-wrap gap-2 mt-3">
            {ctx.database && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 font-mono">
                <Database size={12} />
                {ctx.database}
              </span>
            )}
            {ctx.schema && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 font-mono">
                {ctx.schema}
              </span>
            )}
            {ctx.entityType && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 rounded text-xs text-blue-700">
                {ctx.entityType}
              </span>
            )}
          </div>
        </div>
        
        {/* Tab bar */}
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-200/50 rounded-lg p-1">
              <CategoryTab
                label="Atlan Metadata"
                icon={Database}
                isActive={activeTab === 'mdlh'}
                count={mdlhQueries.length}
                onClick={() => setActiveTab('mdlh')}
              />
              <CategoryTab
                label="Snowflake"
                icon={Snowflake}
                isActive={activeTab === 'snowflake'}
                count={snowflakeQueries.length}
                onClick={() => setActiveTab('snowflake')}
              />
            </div>
            
            {hasSamples && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 ml-auto">
                <Sparkles size={12} />
                Queries have real data
              </span>
            )}
          </div>
        </div>
        
        {/* Query list */}
        <div className="max-h-[50vh] overflow-y-auto">
          {activeQueries.length > 0 ? (
            <div>
              {activeQueries.map((query, i) => (
                <QueryItem 
                  key={query.id || i} 
                  query={query} 
                  onRun={handleRunQuery}
                />
              ))}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <Database size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">
                No {activeTab === 'mdlh' ? 'metadata' : 'Snowflake'} queries available
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {availableTables.length === 0 
                  ? 'Connect to Snowflake to discover tables'
                  : 'Try selecting a different entity'}
              </p>
            </div>
          )}
        </div>
        
        {/* Info banner */}
        {availableCategories && (
          <div className="px-5 py-3 bg-blue-50 border-t border-blue-100">
            <div className="flex items-start gap-2">
              <Sparkles size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-700">
                <span className="font-medium">Built from your schema:</span>{' '}
                {availableCategories.tableCount} tables
                {availableCategories.processCount > 0 && `, ${availableCategories.processCount} processes`}
                {availableCategories.glossaryCount > 0 && `, ${availableCategories.glossaryCount} glossary tables`}
              </div>
            </div>
          </div>
        )}
        
        {/* No tables warning */}
        {(!availableTables || availableTables.length === 0) && (
          <div className="px-5 py-3 bg-amber-50 border-t border-amber-100">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-700">
                <span className="font-medium">No tables discovered.</span>{' '}
                Connect to Snowflake to see recommendations.
              </div>
            </div>
          </div>
        )}
        
        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {recommendations.length} queries available
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
