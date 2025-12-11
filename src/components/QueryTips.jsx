import React, { useState, useEffect, useMemo } from 'react';
import { Lightbulb, X, ChevronRight, ChevronLeft, Sparkles, Code2, AlertTriangle, Check, Copy, ExternalLink } from 'lucide-react';

// Query tips organized by context
const QUERY_TIPS = [
  // ARRAY handling
  {
    id: 'array-search',
    category: 'arrays',
    title: 'Searching ARRAY columns',
    context: ['INPUTS', 'OUTPUTS', 'OWNERUSERS', 'OWNERGROUPS'],
    tip: 'Cast ARRAY columns to STRING for ILIKE searches',
    goodExample: "WHERE INPUTS::STRING ILIKE '%TABLE_NAME%'",
    badExample: "WHERE INPUTS LIKE '%TABLE_NAME%' -- Won't work!",
    explanation: 'ARRAY columns contain JSON arrays. Casting to STRING converts them to searchable text.',
    level: 'beginner'
  },
  {
    id: 'array-flatten',
    category: 'arrays',
    title: 'Iterating through ARRAYs',
    context: ['INPUTS', 'OUTPUTS'],
    tip: 'Use LATERAL FLATTEN to expand arrays into rows',
    goodExample: `SELECT p.NAME, f.value::STRING as INPUT
FROM PROCESS_ENTITY p,
LATERAL FLATTEN(input => p.INPUTS) f
LIMIT 20;`,
    badExample: "SELECT * FROM PROCESS_ENTITY WHERE INPUTS[0] = 'value'",
    explanation: 'LATERAL FLATTEN creates one row per array element, enabling joins and detailed analysis.',
    level: 'intermediate'
  },

  // OBJECT/VARIANT handling
  {
    id: 'object-access',
    category: 'objects',
    title: 'Accessing OBJECT fields',
    context: ['ANCHOR', 'MEANINGS', 'ATTRIBUTES'],
    tip: 'Use colon notation and cast to STRING',
    goodExample: "SELECT ANCHOR:guid::STRING as GLOSSARY_GUID FROM ATLASGLOSSARYTERM_ENTITY;",
    badExample: "SELECT ANCHOR['guid'] FROM ATLASGLOSSARYTERM_ENTITY;",
    explanation: 'Snowflake uses colon notation for nested field access. Always cast to STRING for comparisons.',
    level: 'beginner'
  },
  {
    id: 'object-nested',
    category: 'objects',
    title: 'Nested OBJECT fields',
    context: ['ATTRIBUTES', 'CUSTOMMETADATA'],
    tip: 'Chain colons for deeply nested access',
    goodExample: "SELECT ATTRIBUTES:level1:level2:field::STRING",
    explanation: 'Multiple colons access nested levels. Order matters: parent:child:grandchild',
    level: 'intermediate'
  },

  // Timestamp handling
  {
    id: 'timestamp-epoch',
    category: 'timestamps',
    title: 'Converting epoch timestamps',
    context: ['UPDATETIME', 'CREATETIME'],
    tip: 'MDLH stores timestamps in MILLISECONDS - divide by 1000',
    goodExample: "SELECT TO_TIMESTAMP(UPDATETIME/1000) as UPDATED_AT FROM TABLE_ENTITY;",
    badExample: "SELECT TO_TIMESTAMP(UPDATETIME) -- Wrong! Gives year 50000+",
    explanation: 'Unix timestamps in MDLH are milliseconds since 1970. Divide by 1000 for seconds.',
    level: 'beginner'
  },
  {
    id: 'timestamp-filter',
    category: 'timestamps',
    title: 'Filtering by time range',
    context: ['UPDATETIME', 'CREATETIME'],
    tip: 'Use DATEADD for relative time filters',
    goodExample: `SELECT * FROM TABLE_ENTITY
WHERE UPDATETIME > DATEADD('day', -30, CURRENT_TIMESTAMP()) * 1000;`,
    explanation: 'Multiply DATEADD result by 1000 to match millisecond epoch format.',
    level: 'intermediate'
  },

  // Sorting and NULLs
  {
    id: 'nulls-last',
    category: 'sorting',
    title: 'Handling NULL in ORDER BY',
    context: ['POPULARITYSCORE', 'QUERYCOUNT', 'ROWCOUNT'],
    tip: 'Use NULLS LAST to push empty values to the bottom',
    goodExample: "ORDER BY POPULARITYSCORE DESC NULLS LAST",
    badExample: "ORDER BY POPULARITYSCORE DESC -- NULLs appear first!",
    explanation: 'Many metrics have NULL values. NULLS LAST ensures meaningful results come first.',
    level: 'beginner'
  },

  // Search patterns
  {
    id: 'ilike-search',
    category: 'search',
    title: 'Case-insensitive searching',
    context: ['NAME', 'DESCRIPTION', 'QUALIFIEDNAME'],
    tip: 'Use ILIKE instead of LIKE for case-insensitive matches',
    goodExample: "WHERE NAME ILIKE '%customer%'",
    badExample: "WHERE LOWER(NAME) LIKE LOWER('%Customer%')",
    explanation: 'ILIKE is cleaner and often faster than LOWER() workarounds.',
    level: 'beginner'
  },
  {
    id: 'wildcard-placement',
    category: 'search',
    title: 'Wildcard placement matters',
    context: ['NAME', 'QUALIFIEDNAME'],
    tip: 'Leading wildcards are slow - avoid %term when possible',
    goodExample: "WHERE NAME ILIKE 'customer%' -- Fast: starts with",
    badExample: "WHERE NAME ILIKE '%customer%' -- Slower: full scan",
    explanation: 'Leading wildcards prevent index usage. Use trailing wildcards when possible.',
    level: 'intermediate'
  },

  // Joins and relationships
  {
    id: 'guid-joins',
    category: 'joins',
    title: 'Joining entity tables',
    context: ['GUID', 'QUALIFIEDNAME'],
    tip: 'Use GUID for reliable cross-entity joins',
    goodExample: `SELECT t.NAME, c.NAME as COLUMN_NAME
FROM TABLE_ENTITY t
JOIN COLUMN_ENTITY c ON t.GUID = c.TABLEGUIID
LIMIT 20;`,
    explanation: 'GUIDs are unique and stable. Some entities store parent GUIDs in columns like TABLEGUIID.',
    level: 'intermediate'
  },

  // Performance
  {
    id: 'always-limit',
    category: 'performance',
    title: 'Always use LIMIT',
    context: ['all'],
    tip: 'MDLH tables can have millions of rows - always add LIMIT',
    goodExample: "SELECT * FROM TABLE_ENTITY LIMIT 100;",
    badExample: "SELECT * FROM TABLE_ENTITY; -- May timeout!",
    explanation: 'Entity tables can be very large. Start with small limits and increase as needed.',
    level: 'beginner'
  },
  {
    id: 'select-columns',
    category: 'performance',
    title: 'Select specific columns',
    context: ['all'],
    tip: 'Avoid SELECT * - choose only columns you need',
    goodExample: "SELECT NAME, GUID, POPULARITYSCORE FROM TABLE_ENTITY;",
    badExample: "SELECT * FROM TABLE_ENTITY; -- Returns 100+ columns",
    explanation: 'Entity tables have many columns. Selecting specific ones is faster and clearer.',
    level: 'beginner'
  }
];

// Category metadata
const CATEGORIES = [
  { id: 'all', label: 'All Tips' },
  { id: 'arrays', label: 'ARRAYs' },
  { id: 'objects', label: 'OBJECTs' },
  { id: 'timestamps', label: 'Timestamps' },
  { id: 'sorting', label: 'Sorting' },
  { id: 'search', label: 'Search' },
  { id: 'joins', label: 'Joins' },
  { id: 'performance', label: 'Performance' }
];

// Individual tip card component
function TipCard({ tip, expanded, onToggle }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (text) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={`bg-white rounded-xl border transition-all ${
        expanded ? 'border-blue-300 shadow-lg' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${expanded ? 'bg-blue-100' : 'bg-amber-50'}`}>
            <Lightbulb size={18} className={expanded ? 'text-blue-600' : 'text-amber-600'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-gray-900">{tip.title}</h4>
              <span className={`px-2 py-0.5 text-xs rounded-full ${
                tip.level === 'beginner'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {tip.level}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{tip.tip}</p>
          </div>
          <ChevronRight
            size={18}
            className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          {/* Good example */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Check size={14} className="text-emerald-500" />
              <span className="text-xs font-medium text-emerald-700">Correct</span>
            </div>
            <div className="relative">
              <pre className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm overflow-x-auto">
                <code className="text-emerald-900">{tip.goodExample}</code>
              </pre>
              <button
                onClick={() => handleCopy(tip.goodExample)}
                className="absolute top-2 right-2 p-1.5 bg-white rounded border border-emerald-200 hover:bg-emerald-50 transition-colors"
                title="Copy"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} className="text-gray-500" />}
              </button>
            </div>
          </div>

          {/* Bad example */}
          {tip.badExample && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-red-500" />
                <span className="text-xs font-medium text-red-700">Avoid</span>
              </div>
              <pre className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm overflow-x-auto">
                <code className="text-red-900">{tip.badExample}</code>
              </pre>
            </div>
          )}

          {/* Explanation */}
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <p className="text-sm text-blue-800">{tip.explanation}</p>
          </div>

          {/* Relevant columns */}
          {tip.context.length > 0 && !tip.context.includes('all') && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Applies to columns:</p>
              <div className="flex flex-wrap gap-1">
                {tip.context.map(col => (
                  <span key={col} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-mono">
                    {col}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Contextual tip that appears based on query content
export function ContextualTip({ query, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);

  // Find relevant tip based on query content
  const relevantTip = useMemo(() => {
    if (!query || dismissed) return null;

    const upperQuery = query.toUpperCase();

    // Check for common issues
    if (upperQuery.includes('INPUTS') && !upperQuery.includes('::STRING') && !upperQuery.includes('FLATTEN')) {
      return QUERY_TIPS.find(t => t.id === 'array-search');
    }
    if (upperQuery.includes('UPDATETIME') && !upperQuery.includes('/1000')) {
      return QUERY_TIPS.find(t => t.id === 'timestamp-epoch');
    }
    if (upperQuery.includes('ORDER BY') && upperQuery.includes('DESC') && !upperQuery.includes('NULLS LAST')) {
      return QUERY_TIPS.find(t => t.id === 'nulls-last');
    }
    if (upperQuery.includes('SELECT *') && !upperQuery.includes('LIMIT')) {
      return QUERY_TIPS.find(t => t.id === 'always-limit');
    }
    if (upperQuery.includes('ANCHOR') && !upperQuery.includes(':')) {
      return QUERY_TIPS.find(t => t.id === 'object-access');
    }

    return null;
  }, [query, dismissed]);

  if (!relevantTip) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
      <Lightbulb size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800">{relevantTip.title}</p>
        <p className="text-xs text-amber-700 mt-0.5">{relevantTip.tip}</p>
        <pre className="mt-2 text-xs bg-white rounded p-2 border border-amber-200 overflow-x-auto">
          <code className="text-amber-900">{relevantTip.goodExample}</code>
        </pre>
      </div>
      <button
        onClick={() => {
          setDismissed(true);
          onDismiss?.();
        }}
        className="p-1 rounded hover:bg-amber-100 text-amber-600"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Main tips panel component
export default function QueryTips({ isOpen, onClose }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedTip, setExpandedTip] = useState(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  // Filter tips by category
  const filteredTips = useMemo(() => {
    if (selectedCategory === 'all') return QUERY_TIPS;
    return QUERY_TIPS.filter(t => t.category === selectedCategory);
  }, [selectedCategory]);

  // Carousel navigation
  const nextTip = () => {
    setCurrentTipIndex(prev => (prev + 1) % filteredTips.length);
  };

  const prevTip = () => {
    setCurrentTipIndex(prev => (prev - 1 + filteredTips.length) % filteredTips.length);
  };

  if (!isOpen) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-amber-600" />
          <h3 className="font-semibold text-gray-900">MDLH Query Tips</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-amber-100 text-gray-500">
          <X size={18} />
        </button>
      </div>

      {/* Category filters */}
      <div className="px-4 py-2 border-b border-gray-100 flex gap-2 overflow-x-auto">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategory(cat.id);
              setCurrentTipIndex(0);
              setExpandedTip(null);
            }}
            className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Tips carousel or list */}
      <div className="p-4 max-h-96 overflow-y-auto space-y-3">
        {filteredTips.map(tip => (
          <TipCard
            key={tip.id}
            tip={tip}
            expanded={expandedTip === tip.id}
            onToggle={() => setExpandedTip(expandedTip === tip.id ? null : tip.id)}
          />
        ))}
      </div>

      {/* Footer with nav */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
        <span className="text-xs text-gray-500">
          {filteredTips.length} tips in {selectedCategory === 'all' ? 'all categories' : selectedCategory}
        </span>
        <a
          href="https://docs.atlan.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          Full Documentation
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

// Export tips data
export { QUERY_TIPS, CATEGORIES };
