import React, { useState, useMemo } from 'react';
import { Search, Book, X, ChevronRight, Database, Table2, FileText, GitBranch, Tag, Users, Clock, Code2, Zap, ArrowUpRight } from 'lucide-react';

// MDLH terminology glossary
const GLOSSARY_TERMS = [
  // Core Concepts
  {
    id: 'mdlh',
    term: 'MDLH',
    fullName: 'Metadata Lakehouse',
    category: 'core',
    definition: 'A Snowflake database containing all Atlan metadata as queryable tables. Each entity type (tables, columns, glossary terms, etc.) has its own _ENTITY table.',
    example: 'SELECT * FROM FIELD_METADATA.PUBLIC.TABLE_ENTITY LIMIT 10;',
    relatedTerms: ['Entity Table', 'FQN']
  },
  {
    id: 'entity-table',
    term: 'Entity Table',
    fullName: 'Entity Table',
    category: 'core',
    definition: 'A table in MDLH that stores metadata for a specific asset type. Entity tables always end in _ENTITY (e.g., TABLE_ENTITY, COLUMN_ENTITY).',
    example: 'TABLE_ENTITY, COLUMN_ENTITY, ATLASGLOSSARYTERM_ENTITY',
    relatedTerms: ['MDLH', 'GUID']
  },
  {
    id: 'fqn',
    term: 'FQN',
    fullName: 'Fully Qualified Name',
    category: 'core',
    definition: 'A unique identifier that includes the full path to an asset. For tables: DATABASE.SCHEMA.TABLE. Used in QUALIFIEDNAME columns.',
    example: 'ACME_ANALYTICS.SALES.CUSTOMERS',
    relatedTerms: ['QUALIFIEDNAME', 'GUID']
  },
  {
    id: 'guid',
    term: 'GUID',
    fullName: 'Globally Unique Identifier',
    category: 'core',
    definition: 'A unique UUID assigned to every asset in Atlan. Stored in the GUID column of entity tables. Used for joins and relationships.',
    example: 'a1b2c3d4-5678-90ab-cdef-1234567890ab',
    relatedTerms: ['Entity Table', 'FQN']
  },

  // Columns
  {
    id: 'typename',
    term: 'TYPENAME',
    fullName: 'Type Name Column',
    category: 'columns',
    definition: 'Column indicating the specific Atlan entity type. Useful for filtering when multiple types share a table.',
    example: "WHERE TYPENAME = 'Table' -- vs 'View' or 'MaterializedView'",
    relatedTerms: ['Entity Table']
  },
  {
    id: 'qualifiedname',
    term: 'QUALIFIEDNAME',
    fullName: 'Qualified Name Column',
    category: 'columns',
    definition: 'The FQN stored as a string. Used to identify assets uniquely. Format varies by asset type.',
    example: 'default/snowflake/1234567/ACME/PUBLIC/CUSTOMERS',
    relatedTerms: ['FQN', 'GUID']
  },
  {
    id: 'inputs-outputs',
    term: 'INPUTS/OUTPUTS',
    fullName: 'Lineage Input/Output Arrays',
    category: 'columns',
    definition: 'ARRAY columns in PROCESS_ENTITY that store lineage relationships. INPUTS are source assets, OUTPUTS are target assets.',
    example: "WHERE OUTPUTS::STRING ILIKE '%CUSTOMERS%'",
    relatedTerms: ['Process Entity', 'Lineage']
  },
  {
    id: 'anchor',
    term: 'ANCHOR',
    fullName: 'Glossary Anchor',
    category: 'columns',
    definition: 'OBJECT column in glossary entities that links terms/categories to their parent glossary.',
    example: "WHERE ANCHOR:guid::STRING = 'glossary-guid-here'",
    relatedTerms: ['Glossary Term', 'OBJECT column']
  },
  {
    id: 'popularityscore',
    term: 'POPULARITYSCORE',
    fullName: 'Popularity Score',
    category: 'columns',
    definition: 'Atlan-computed metric (0-100) based on query frequency, views, and usage patterns. Higher = more popular.',
    example: 'ORDER BY POPULARITYSCORE DESC NULLS LAST',
    relatedTerms: ['QUERYCOUNT', 'Usage Metrics']
  },
  {
    id: 'updatetime',
    term: 'UPDATETIME',
    fullName: 'Update Timestamp',
    category: 'columns',
    definition: 'Epoch timestamp in MILLISECONDS when the asset was last modified. Divide by 1000 for seconds.',
    example: 'TO_TIMESTAMP(UPDATETIME/1000) AS last_updated',
    relatedTerms: ['CREATETIME', 'Data Freshness']
  },

  // Data Types
  {
    id: 'array-columns',
    term: 'ARRAY Columns',
    fullName: 'Array Data Type',
    category: 'data-types',
    definition: 'Columns storing lists of values (e.g., INPUTS, OUTPUTS, OWNERUSERS). Use ::STRING for ILIKE searches or LATERAL FLATTEN to iterate.',
    example: "WHERE OWNERUSERS::STRING ILIKE '%john%'",
    relatedTerms: ['LATERAL FLATTEN', 'INPUTS/OUTPUTS']
  },
  {
    id: 'object-columns',
    term: 'OBJECT Columns',
    fullName: 'Object/Variant Data Type',
    category: 'data-types',
    definition: 'Columns storing nested JSON-like data. Access fields with colon notation: column:field::STRING',
    example: "ANCHOR:guid::STRING, MEANINGS:termGuid::STRING",
    relatedTerms: ['ANCHOR', 'MEANINGS']
  },
  {
    id: 'lateral-flatten',
    term: 'LATERAL FLATTEN',
    fullName: 'Lateral Flatten',
    category: 'data-types',
    definition: 'Snowflake function to expand ARRAY columns into rows. Essential for searching within arrays.',
    example: "SELECT f.value::STRING FROM table, LATERAL FLATTEN(INPUTS) f",
    relatedTerms: ['ARRAY Columns']
  },

  // Entity Types
  {
    id: 'process-entity',
    term: 'Process Entity',
    fullName: 'Process/Lineage Entity',
    category: 'entities',
    definition: 'Represents ETL jobs, queries, or transformations. Stores lineage via INPUTS and OUTPUTS arrays.',
    example: 'PROCESS_ENTITY, AIRFLOWDAGRUN_ENTITY, DBTPROCESS_ENTITY',
    relatedTerms: ['INPUTS/OUTPUTS', 'Lineage']
  },
  {
    id: 'glossary-entities',
    term: 'Glossary Entities',
    fullName: 'Business Glossary Entities',
    category: 'entities',
    definition: 'Three entity types: ATLASGLOSSARY (glossaries), ATLASGLOSSARYTERM (terms), ATLASGLOSSARYCATEGORY (categories).',
    example: 'ATLASGLOSSARYTERM_ENTITY, ATLASGLOSSARYCATEGORY_ENTITY',
    relatedTerms: ['ANCHOR', 'Business Terms']
  },
  {
    id: 'data-product',
    term: 'Data Product',
    fullName: 'Data Product Entity',
    category: 'entities',
    definition: 'A curated collection of data assets with defined quality, ownership, and access controls. Part of Data Mesh architecture.',
    example: 'DATAPRODUCT_ENTITY - fields: DATAPRODUCTSTATUS, DATAPRODUCTCRITICALITY',
    relatedTerms: ['Data Domain', 'Data Mesh']
  },

  // Query Patterns
  {
    id: 'ilike',
    term: 'ILIKE',
    fullName: 'Case-Insensitive Like',
    category: 'patterns',
    definition: 'Case-insensitive pattern matching. Use % for wildcards. More flexible than = for searches.',
    example: "WHERE NAME ILIKE '%customer%'",
    relatedTerms: ['Search Patterns']
  },
  {
    id: 'nulls-last',
    term: 'NULLS LAST',
    fullName: 'Null Sorting',
    category: 'patterns',
    definition: 'Forces NULL values to sort at the end when using ORDER BY DESC. Critical for POPULARITYSCORE.',
    example: 'ORDER BY POPULARITYSCORE DESC NULLS LAST',
    relatedTerms: ['POPULARITYSCORE', 'Sorting']
  },
  {
    id: 'try-to-timestamp',
    term: 'TRY_TO_TIMESTAMP',
    fullName: 'Safe Timestamp Conversion',
    category: 'patterns',
    definition: 'Converts strings to timestamps safely - returns NULL instead of error on invalid data.',
    example: "TRY_TO_TIMESTAMP_NTZ('2025-01-01 00:00:00')",
    relatedTerms: ['UPDATETIME', 'CREATETIME']
  }
];

// Category metadata
const CATEGORIES = [
  { id: 'all', label: 'All Terms', icon: Book },
  { id: 'core', label: 'Core Concepts', icon: Database },
  { id: 'columns', label: 'Common Columns', icon: FileText },
  { id: 'data-types', label: 'Data Types', icon: Table2 },
  { id: 'entities', label: 'Entity Types', icon: Tag },
  { id: 'patterns', label: 'Query Patterns', icon: Code2 }
];

// Term detail component
function TermDetail({ term, onClose }) {
  if (!term) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{term.term}</h3>
          {term.fullName !== term.term && (
            <p className="text-sm text-gray-500">{term.fullName}</p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <p className="text-gray-700">{term.definition}</p>

      {term.example && (
        <div className="bg-gray-900 rounded-lg p-3">
          <code className="text-sm text-emerald-400 font-mono whitespace-pre-wrap">
            {term.example}
          </code>
        </div>
      )}

      {term.relatedTerms && term.relatedTerms.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Related Terms</p>
          <div className="flex flex-wrap gap-2">
            {term.relatedTerms.map(related => (
              <span
                key={related}
                className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
              >
                {related}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Main glossary component
export default function MDLHGlossary({ isOpen, onClose, compact = false }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTerm, setSelectedTerm] = useState(null);

  // Filter terms
  const filteredTerms = useMemo(() => {
    return GLOSSARY_TERMS.filter(term => {
      const matchesCategory = selectedCategory === 'all' || term.category === selectedCategory;
      const matchesSearch = !searchTerm ||
        term.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
        term.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        term.definition.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchTerm]);

  // Compact inline glossary
  if (compact) {
    return (
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-gray-800 flex items-center gap-2">
            <Book size={16} className="text-blue-600" />
            MDLH Quick Reference
          </h4>
          <button
            onClick={onClose}
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            View All
            <ArrowUpRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {GLOSSARY_TERMS.slice(0, 6).map(term => (
            <button
              key={term.id}
              onClick={() => setSelectedTerm(term)}
              className="text-left p-2 bg-white rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
            >
              <span className="font-medium text-sm text-gray-800">{term.term}</span>
              <p className="text-xs text-gray-500 line-clamp-1">{term.definition}</p>
            </button>
          ))}
        </div>
        {selectedTerm && (
          <TermDetail term={selectedTerm} onClose={() => setSelectedTerm(null)} />
        )}
      </div>
    );
  }

  // Full modal/panel glossary
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Book size={22} className="text-blue-600" />
              MDLH Glossary
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Quick reference for MDLH terminology and patterns</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search and filters */}
        <div className="px-6 py-4 border-b border-gray-100 space-y-3 flex-shrink-0">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search terms..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon size={14} />
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {selectedTerm ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelectedTerm(null)}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <ChevronRight size={14} className="rotate-180" />
                Back to list
              </button>
              <TermDetail term={selectedTerm} />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTerms.map(term => (
                <button
                  key={term.id}
                  onClick={() => setSelectedTerm(term)}
                  className="w-full text-left p-4 bg-gray-50 rounded-xl hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 group-hover:text-blue-700">
                          {term.term}
                        </span>
                        {term.fullName !== term.term && (
                          <span className="text-xs text-gray-400">({term.fullName})</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{term.definition}</p>
                    </div>
                    <ChevronRight size={18} className="text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                  </div>
                </button>
              ))}

              {filteredTerms.length === 0 && (
                <div className="text-center py-12">
                  <Search size={32} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-600 font-medium">No matching terms</p>
                  <p className="text-sm text-gray-400 mt-1">Try adjusting your search</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Export glossary data for use elsewhere
export { GLOSSARY_TERMS, CATEGORIES };
