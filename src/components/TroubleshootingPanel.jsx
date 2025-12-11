import React, { useState, useMemo } from 'react';
import { AlertCircle, ChevronRight, Copy, Check, Lightbulb, Code2, X, HelpCircle, ExternalLink, Search, Wrench, RefreshCw } from 'lucide-react';

// Common error patterns and solutions
const ERROR_PATTERNS = [
  {
    id: 'table-not-found',
    pattern: /table .* does not exist|object .* does not exist|invalid identifier/i,
    title: 'Table Not Found',
    category: 'schema',
    description: 'The table or object referenced in your query does not exist in the current database/schema.',
    causes: [
      'Table name is misspelled',
      'Table is in a different schema',
      'Table name needs to be uppercase',
      'Entity type does not have an _ENTITY table'
    ],
    solutions: [
      {
        title: 'Check the table name',
        description: 'MDLH tables are uppercase: TABLE_ENTITY, not table_entity',
        code: 'SELECT * FROM TABLE_ENTITY LIMIT 10;'
      },
      {
        title: 'Use fully qualified name',
        description: 'Include database and schema in your query',
        code: 'SELECT * FROM FIELD_METADATA.PUBLIC.TABLE_ENTITY LIMIT 10;'
      },
      {
        title: 'Discover available tables',
        description: 'List all _ENTITY tables in your schema',
        code: `SELECT table_name FROM information_schema.tables
WHERE table_schema = 'PUBLIC'
AND table_name LIKE '%_ENTITY'
ORDER BY table_name;`
      }
    ]
  },
  {
    id: 'column-not-found',
    pattern: /invalid identifier|column .* not found|unknown column/i,
    title: 'Column Not Found',
    category: 'schema',
    description: 'The column name referenced does not exist in the table.',
    causes: [
      'Column name is misspelled',
      'Column name should be uppercase',
      'Column does not exist for this entity type'
    ],
    solutions: [
      {
        title: 'Describe the table',
        description: 'See all available columns',
        code: 'DESCRIBE TABLE TABLE_ENTITY;'
      },
      {
        title: 'Use uppercase',
        description: 'MDLH columns are typically uppercase',
        code: 'SELECT NAME, GUID FROM TABLE_ENTITY LIMIT 10;'
      }
    ]
  },
  {
    id: 'syntax-error',
    pattern: /syntax error|unexpected|parse error/i,
    title: 'SQL Syntax Error',
    category: 'syntax',
    description: 'Your query has a syntax error that prevents it from being parsed.',
    causes: [
      'Missing comma between columns',
      'Missing closing quote or parenthesis',
      'Keyword used as identifier without quotes',
      'Invalid operator or expression'
    ],
    solutions: [
      {
        title: 'Check for missing commas',
        description: 'Each column should be separated by a comma',
        code: 'SELECT NAME, GUID, TYPENAME FROM TABLE_ENTITY;'
      },
      {
        title: 'Quote reserved words',
        description: 'If using reserved words as identifiers, quote them',
        code: 'SELECT "NAME", "ORDER" FROM TABLE_ENTITY;'
      }
    ]
  },
  {
    id: 'array-comparison',
    pattern: /cannot compare|invalid type|ARRAY.*comparison/i,
    title: 'Invalid ARRAY Comparison',
    category: 'data-types',
    description: 'You are trying to compare an ARRAY column directly, which is not supported.',
    causes: [
      'Using = or LIKE directly on ARRAY columns',
      'INPUTS, OUTPUTS, OWNERUSERS are ARRAY types'
    ],
    solutions: [
      {
        title: 'Cast ARRAY to STRING',
        description: 'Convert array to string for ILIKE searches',
        code: "WHERE INPUTS::STRING ILIKE '%TABLE_NAME%'"
      },
      {
        title: 'Use LATERAL FLATTEN',
        description: 'Expand array into rows for precise matching',
        code: `SELECT p.NAME, f.value::STRING as INPUT
FROM PROCESS_ENTITY p,
LATERAL FLATTEN(input => p.INPUTS) f
WHERE f.value::STRING ILIKE '%match%';`
      }
    ]
  },
  {
    id: 'object-access',
    pattern: /cannot access|invalid object|OBJECT.*access/i,
    title: 'Invalid OBJECT Access',
    category: 'data-types',
    description: 'You are accessing an OBJECT/VARIANT column incorrectly.',
    causes: [
      'Using bracket notation instead of colon',
      'Not casting to STRING for comparison',
      'Field path is incorrect'
    ],
    solutions: [
      {
        title: 'Use colon notation',
        description: 'Access nested fields with colons',
        code: "SELECT ANCHOR:guid::STRING FROM ATLASGLOSSARYTERM_ENTITY;"
      },
      {
        title: 'Cast to STRING for WHERE',
        description: 'Always cast when comparing',
        code: "WHERE ANCHOR:guid::STRING = 'your-guid-here'"
      }
    ]
  },
  {
    id: 'timestamp-overflow',
    pattern: /numeric value .* out of range|timestamp.*overflow|year.*out of range/i,
    title: 'Timestamp Overflow',
    category: 'data-types',
    description: 'The timestamp conversion resulted in an invalid date, likely due to milliseconds vs seconds.',
    causes: [
      'UPDATETIME/CREATETIME are in milliseconds',
      'Forgot to divide by 1000'
    ],
    solutions: [
      {
        title: 'Divide by 1000',
        description: 'MDLH timestamps are milliseconds since epoch',
        code: 'SELECT TO_TIMESTAMP(UPDATETIME/1000) as UPDATED FROM TABLE_ENTITY;'
      }
    ]
  },
  {
    id: 'timeout',
    pattern: /timeout|execution.*exceed|query.*took too long/i,
    title: 'Query Timeout',
    category: 'performance',
    description: 'Your query took too long to execute.',
    causes: [
      'No LIMIT clause on large table',
      'SELECT * returning too many columns',
      'Complex joins without filters'
    ],
    solutions: [
      {
        title: 'Add LIMIT clause',
        description: 'Always limit result size',
        code: 'SELECT * FROM TABLE_ENTITY LIMIT 100;'
      },
      {
        title: 'Select specific columns',
        description: 'Reduce data transfer',
        code: 'SELECT NAME, GUID, TYPENAME FROM TABLE_ENTITY LIMIT 100;'
      },
      {
        title: 'Add WHERE filters',
        description: 'Filter before selecting',
        code: "SELECT * FROM TABLE_ENTITY WHERE SCHEMANAME = 'SALES' LIMIT 100;"
      }
    ]
  },
  {
    id: 'permission-denied',
    pattern: /permission denied|access denied|insufficient privileges/i,
    title: 'Permission Denied',
    category: 'access',
    description: 'You do not have permission to access the requested resource.',
    causes: [
      'Missing role grants for database/schema',
      'Table-level permissions not granted',
      'Session expired'
    ],
    solutions: [
      {
        title: 'Check your current role',
        description: 'Verify you have the right role active',
        code: 'SELECT CURRENT_ROLE(), CURRENT_DATABASE(), CURRENT_SCHEMA();'
      },
      {
        title: 'Re-connect to Snowflake',
        description: 'Your session may have expired',
        action: 'reconnect'
      }
    ]
  },
  {
    id: 'null-handling',
    pattern: /null|empty result|no rows/i,
    title: 'Empty or NULL Results',
    category: 'results',
    description: 'Your query returned no results or unexpected NULLs.',
    causes: [
      'Filter is too restrictive',
      'NULL values being filtered out',
      'Data does not exist for this entity type'
    ],
    solutions: [
      {
        title: 'Check NULL handling',
        description: 'NULLs may not match your conditions',
        code: 'WHERE POPULARITYSCORE IS NULL OR POPULARITYSCORE > 50'
      },
      {
        title: 'Use COALESCE for defaults',
        description: 'Replace NULLs with default values',
        code: 'SELECT COALESCE(POPULARITYSCORE, 0) as SCORE FROM TABLE_ENTITY;'
      },
      {
        title: 'Verify data exists',
        description: 'Count rows before filtering',
        code: 'SELECT COUNT(*) FROM TABLE_ENTITY;'
      }
    ]
  }
];

// Match error to pattern
function matchError(errorMessage) {
  if (!errorMessage) return null;
  return ERROR_PATTERNS.find(pattern => pattern.pattern.test(errorMessage));
}

// Solution card component
function SolutionCard({ solution, onApply }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (solution.code) {
      await navigator.clipboard.writeText(solution.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h5 className="font-medium text-gray-900">{solution.title}</h5>
          <p className="text-sm text-gray-600 mt-1">{solution.description}</p>
        </div>
        {solution.action === 'reconnect' ? (
          <button
            onClick={onApply}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={14} />
            Reconnect
          </button>
        ) : solution.code ? (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        ) : null}
      </div>
      {solution.code && (
        <pre className="mt-3 bg-gray-900 rounded-lg p-3 text-sm overflow-x-auto">
          <code className="text-emerald-400">{solution.code}</code>
        </pre>
      )}
    </div>
  );
}

// Main troubleshooting panel
export default function TroubleshootingPanel({
  error,
  query,
  onClose,
  onApplySolution,
  onReconnect
}) {
  const [showAllSolutions, setShowAllSolutions] = useState(false);

  // Match error to known pattern
  const matchedError = useMemo(() => {
    if (typeof error === 'string') {
      return matchError(error);
    }
    if (error?.message) {
      return matchError(error.message);
    }
    return null;
  }, [error]);

  // Get error message string
  const errorMessage = typeof error === 'string' ? error : error?.message || 'Unknown error';

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-red-100 border-b border-red-200 flex items-start justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-800">
              {matchedError ? matchedError.title : 'Query Error'}
            </h4>
            <p className="text-sm text-red-700 mt-0.5 font-mono">{errorMessage}</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-red-200 text-red-600"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {matchedError ? (
          <>
            {/* Description */}
            <div className="bg-white rounded-lg p-4 border border-red-100">
              <h5 className="font-medium text-gray-900 flex items-center gap-2">
                <HelpCircle size={16} className="text-red-500" />
                What happened?
              </h5>
              <p className="text-sm text-gray-600 mt-2">{matchedError.description}</p>

              {/* Possible causes */}
              <div className="mt-4">
                <h6 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                  Possible Causes
                </h6>
                <ul className="space-y-1">
                  {matchedError.causes.map((cause, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-red-400 mt-0.5">-</span>
                      {cause}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Solutions */}
            <div>
              <h5 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                <Wrench size={16} className="text-blue-500" />
                Solutions
              </h5>
              <div className="space-y-3">
                {matchedError.solutions.slice(0, showAllSolutions ? undefined : 2).map((solution, i) => (
                  <SolutionCard
                    key={i}
                    solution={solution}
                    onApply={() => {
                      if (solution.action === 'reconnect') {
                        onReconnect?.();
                      } else if (solution.code) {
                        onApplySolution?.(solution.code);
                      }
                    }}
                  />
                ))}
              </div>
              {matchedError.solutions.length > 2 && !showAllSolutions && (
                <button
                  onClick={() => setShowAllSolutions(true)}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  Show {matchedError.solutions.length - 2} more solutions
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </>
        ) : (
          // Generic error guidance
          <div className="bg-white rounded-lg p-4 border border-red-100">
            <h5 className="font-medium text-gray-900 flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-500" />
              Troubleshooting Tips
            </h5>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">1.</span>
                Check your SQL syntax for typos or missing keywords
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">2.</span>
                Verify table and column names are uppercase
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">3.</span>
                Add LIMIT clause if querying large tables
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">4.</span>
                Try reconnecting if session may have expired
              </li>
            </ul>
          </div>
        )}

        {/* Original query */}
        {query && (
          <details className="group">
            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ChevronRight size={14} className="group-open:rotate-90 transition-transform" />
              View original query
            </summary>
            <pre className="mt-2 bg-gray-900 rounded-lg p-3 text-sm overflow-x-auto">
              <code className="text-gray-300">{query}</code>
            </pre>
          </details>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-red-100/50 border-t border-red-200 flex items-center justify-between">
        <a
          href="https://docs.atlan.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-red-700 hover:text-red-800 flex items-center gap-1"
        >
          View Documentation
          <ExternalLink size={12} />
        </a>
        <span className="text-xs text-red-600">
          Category: {matchedError?.category || 'unknown'}
        </span>
      </div>
    </div>
  );
}

// Export utilities
export { matchError, ERROR_PATTERNS };
