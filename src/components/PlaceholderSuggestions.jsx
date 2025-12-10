/**
 * PlaceholderSuggestions - Smart autocomplete for query placeholders
 * 
 * Shows a dropdown of real values from the database when the user
 * clicks on or hovers over a placeholder like {{domain}} or {{glossary}}.
 * 
 * Features:
 * - Fetches actual data from discovered tables
 * - Shows count of related assets (e.g., "Sales Domain - 12 products")
 * - Filters by search term
 * - Keyboard navigation
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Database, Search, Loader2, Check, X, ChevronDown,
  Building2, BookOpen, User, Hash, Table2, Key, Tag, Link2
} from 'lucide-react';
import { createLogger } from '../utils/logger';
import {
  PLACEHOLDER_CONFIGS,
  detectPlaceholdersWithTypes,
  fetchPlaceholderValues,
  getSuggestionsForPlaceholder,
  replacePlaceholder
} from '../utils/placeholderValueSuggestions';

const log = createLogger('PlaceholderSuggestions');

// =============================================================================
// Icon mapping for placeholder types
// =============================================================================

const PLACEHOLDER_ICONS = {
  domain: Building2,
  glossary: BookOpen,
  owner: User,
  typename: Hash,
  database: Database,
  schema: Table2,
  table: Table2,
  guid: Key,
  term: Tag,
  connection: Link2,
  unknown: Hash
};

// =============================================================================
// Placeholder Chip Component
// =============================================================================

/**
 * Clickable chip that appears inline in the query for placeholders
 */
export function PlaceholderChip({ 
  placeholder, 
  type, 
  onClick, 
  isActive,
  hasValues 
}) {
  const Icon = PLACEHOLDER_ICONS[type] || PLACEHOLDER_ICONS.unknown;
  
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
        transition-all duration-150 cursor-pointer
        ${isActive 
          ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400' 
          : hasValues
            ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
        }
      `}
      title={hasValues ? `Click to select a ${type}` : `No ${type} values available`}
    >
      <Icon size={12} />
      <span>{placeholder}</span>
      {hasValues && <ChevronDown size={10} className={isActive ? 'rotate-180' : ''} />}
    </button>
  );
}

// =============================================================================
// Suggestion Dropdown Component
// =============================================================================

/**
 * Dropdown showing available values for a placeholder
 */
export function PlaceholderDropdown({
  placeholder,
  type,
  values,
  isLoading,
  onSelect,
  onClose,
  position
}) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  
  const Icon = PLACEHOLDER_ICONS[type] || PLACEHOLDER_ICONS.unknown;
  
  // Filter values by search
  const filteredValues = useMemo(() => {
    if (!search.trim()) return values;
    const searchLower = search.toLowerCase();
    return values.filter(v => 
      v.label?.toLowerCase().includes(searchLower) ||
      v.value?.toLowerCase().includes(searchLower) ||
      v.detail?.toLowerCase().includes(searchLower)
    );
  }, [values, search]);
  
  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  // Reset selection when filtered values change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredValues.length]);
  
  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const item = listRef.current.children[selectedIndex];
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);
  
  // Keyboard navigation
  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredValues.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredValues[selectedIndex]) {
          onSelect(filteredValues[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };
  
  return (
    <div 
      className="absolute z-50 bg-white rounded-lg shadow-xl border border-slate-200 w-80 max-h-96 overflow-hidden"
      style={position}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Icon size={14} className="text-slate-500" />
            <span>Select {type}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded"
          >
            <X size={14} className="text-slate-400" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Replace <code className="bg-slate-100 px-1 rounded">{placeholder}</code>
        </p>
      </div>
      
      {/* Search */}
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${type}s...`}
            className="w-full pl-7 pr-3 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>
      
      {/* Loading state */}
      {isLoading && (
        <div className="px-3 py-8 text-center text-slate-500">
          <Loader2 size={20} className="animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading {type}s...</p>
        </div>
      )}
      
      {/* Empty state */}
      {!isLoading && filteredValues.length === 0 && (
        <div className="px-3 py-8 text-center text-slate-500">
          <Icon size={24} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm font-medium">No {type}s found</p>
          <p className="text-xs mt-1">
            {search ? 'Try a different search term' : `No ${type} data in this schema`}
          </p>
        </div>
      )}
      
      {/* Value list */}
      {!isLoading && filteredValues.length > 0 && (
        <div 
          ref={listRef}
          className="max-h-64 overflow-y-auto"
        >
          {filteredValues.map((item, index) => (
            <button
              key={item.value + index}
              onClick={() => onSelect(item)}
              className={`
                w-full px-3 py-2 text-left flex items-start gap-3 
                transition-colors border-b border-slate-50 last:border-0
                ${index === selectedIndex 
                  ? 'bg-blue-50' 
                  : 'hover:bg-slate-50'
                }
              `}
            >
              <Icon size={14} className="mt-0.5 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">
                  {item.label}
                </div>
                {item.detail && (
                  <div className="text-xs text-slate-500 truncate">
                    {item.detail}
                  </div>
                )}
              </div>
              {index === selectedIndex && (
                <Check size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
      
      {/* Footer with count */}
      {!isLoading && values.length > 0 && (
        <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50">
          <p className="text-xs text-slate-500">
            {filteredValues.length === values.length 
              ? `${values.length} ${type}${values.length !== 1 ? 's' : ''} available`
              : `${filteredValues.length} of ${values.length} shown`
            }
          </p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main PlaceholderSuggestions Component
// =============================================================================

/**
 * Main component that detects placeholders in SQL and provides suggestions
 */
export default function PlaceholderSuggestions({
  sql,
  database,
  schema,
  availableTables,
  executeQuery,
  onSqlChange,
  className
}) {
  const [placeholders, setPlaceholders] = useState([]);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState({});
  
  // Detect placeholders in SQL
  useEffect(() => {
    const detected = detectPlaceholdersWithTypes(sql);
    setPlaceholders(detected);
    log.debug('Detected placeholders', { count: detected.length, types: detected.map(p => p.type) });
  }, [sql]);
  
  // Fetch values when dropdown opens
  const handlePlaceholderClick = async (placeholder) => {
    const key = `${placeholder.type}:${placeholder.placeholder}`;
    
    if (activeDropdown === key) {
      setActiveDropdown(null);
      return;
    }
    
    setActiveDropdown(key);
    
    // Check if we already have values
    if (values[placeholder.type]?.length > 0) {
      return;
    }
    
    // Fetch values
    setLoading(prev => ({ ...prev, [placeholder.type]: true }));
    
    try {
      const fetchedValues = await fetchPlaceholderValues(
        placeholder.type,
        database,
        schema,
        availableTables,
        executeQuery
      );
      
      setValues(prev => ({
        ...prev,
        [placeholder.type]: fetchedValues
      }));
    } catch (error) {
      log.error('Error fetching placeholder values', { error });
    } finally {
      setLoading(prev => ({ ...prev, [placeholder.type]: false }));
    }
  };
  
  // Handle value selection
  const handleSelect = (placeholder, value) => {
    const newSql = replacePlaceholder(sql, placeholder.placeholder, value.insertValue);
    onSqlChange(newSql);
    setActiveDropdown(null);
  };
  
  // Close dropdown
  const handleClose = () => {
    setActiveDropdown(null);
  };
  
  // Don't render if no placeholders
  if (placeholders.length === 0) {
    return null;
  }
  
  // Group unique placeholders
  const uniquePlaceholders = placeholders.reduce((acc, p) => {
    if (!acc.find(x => x.placeholder === p.placeholder)) {
      acc.push(p);
    }
    return acc;
  }, []);
  
  return (
    <div className={`relative ${className}`}>
      {/* Placeholder chips bar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-amber-50/50 border-b border-amber-100">
        <span className="text-xs font-medium text-amber-700">
          Fill placeholders:
        </span>
        
        {uniquePlaceholders.map((p, idx) => {
          const key = `${p.type}:${p.placeholder}`;
          const hasValues = values[p.type]?.length > 0 || loading[p.type];
          
          return (
            <div key={key + idx} className="relative">
              <PlaceholderChip
                placeholder={p.placeholder}
                type={p.type}
                onClick={() => handlePlaceholderClick(p)}
                isActive={activeDropdown === key}
                hasValues={hasValues || p.type !== 'unknown'}
              />
              
              {/* Dropdown */}
              {activeDropdown === key && (
                <PlaceholderDropdown
                  placeholder={p.placeholder}
                  type={p.type}
                  values={values[p.type] || []}
                  isLoading={loading[p.type]}
                  onSelect={(value) => handleSelect(p, value)}
                  onClose={handleClose}
                  position={{ top: '100%', left: 0, marginTop: 4 }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Inline Placeholder Highlighter (for Monaco editor decorations)
// =============================================================================

/**
 * Get Monaco editor decorations for placeholders
 * @param {string} sql - SQL text
 * @returns {Array} - Monaco decoration definitions
 */
export function getPlaceholderDecorations(sql) {
  const placeholders = detectPlaceholdersWithTypes(sql);
  const decorations = [];
  
  // Calculate line and column from position
  const lines = sql.split('\n');
  
  for (const p of placeholders) {
    let currentPos = 0;
    let lineNumber = 1;
    let column = 1;
    
    for (const line of lines) {
      if (currentPos + line.length >= p.position) {
        column = p.position - currentPos + 1;
        break;
      }
      currentPos += line.length + 1; // +1 for newline
      lineNumber++;
    }
    
    decorations.push({
      range: {
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column + p.length
      },
      options: {
        inlineClassName: 'placeholder-highlight',
        hoverMessage: { value: `Click to select a ${p.type}` }
      }
    });
  }
  
  return decorations;
}


