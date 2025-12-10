import React, { useEffect, useMemo, useState } from 'react';
import { Search, Database, Columns, LayoutDashboard, ArrowRight } from 'lucide-react';

/**
 * CommandPalette - DuckDB-style global search overlay
 * 
 * Design reference: duckdb.org search
 * - Clean white modal
 * - Simple search input
 * - Minimal result items
 * - Keyboard navigation hints
 */
export function CommandPalette({ open, onOpenChange }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  // Mock results - filter based on query
  const results = useMemo(() => {
    if (!query.trim()) return [];
    
    const q = query.toLowerCase();
    
    const allResults = [
      { id: 'entity:FACT_ORDERS', type: 'table', title: 'FACT_ORDERS', subtitle: 'FIELD_METADATA.PUBLIC' },
      { id: 'entity:DIM_CUSTOMERS', type: 'table', title: 'DIM_CUSTOMERS', subtitle: 'FIELD_METADATA.PUBLIC' },
      { id: 'column:customer_id', type: 'column', title: 'customer_id', subtitle: 'FACT_ORDERS' },
      { id: 'column:order_amount', type: 'column', title: 'order_amount', subtitle: 'FACT_ORDERS' },
      { id: 'dashboard:exec_rev', type: 'dashboard', title: 'Executive Revenue', subtitle: 'Sigma Analytics' },
    ];
    
    return allResults.filter(
      r => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
    );
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
      if (!results.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % results.length);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const active = results[activeIndex];
        if (active) {
          onOpenChange(false);
        }
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, results, activeIndex, onOpenChange]);

  if (!open) return null;

  const getIcon = (type) => {
    switch (type) {
      case 'table': return Database;
      case 'column': return Columns;
      case 'dashboard': return LayoutDashboard;
      default: return Database;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20"
      onClick={(e) => e.target === e.currentTarget && onOpenChange(false)}
    >
      <div className="mt-[12vh] w-full max-w-lg mx-4 rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        {/* Search input */}
        <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100">
          <Search className="text-gray-400 shrink-0" size={16} />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder-gray-400"
            placeholder="Search entities, columns, dashboards..."
          />
          <kbd className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
            esc
          </kbd>
        </div>
        
        {/* Results */}
        <div className="max-h-[50vh] overflow-auto">
          {query.trim() === '' ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Start typing to search...
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No results for "{query}"
            </div>
          ) : (
            <div className="py-1">
              {results.map((r, idx) => {
                const Icon = getIcon(r.type);
                const isActive = idx === activeIndex;
                
                return (
                  <button
                    key={r.id}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                      isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                    }`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => onOpenChange(false)}
                  >
                    <Icon size={16} className="text-gray-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {r.title}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {r.subtitle}
                      </div>
                    </div>
                    {isActive && (
                      <ArrowRight size={14} className="text-gray-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer hints */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center gap-4 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-white border border-gray-200 rounded">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded">↵</kbd>
              select
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
