import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Play, ArrowRight } from 'lucide-react';

/**
 * QuerySelector - Dropdown for selecting query variants
 *
 * Features:
 * - Clean dropdown trigger with chevron
 * - White dropdown panel with clean list
 * - Checkmark for selected item
 * - Hover states
 */
export function QuerySelector({
  label = 'Select',
  options = [],
  value,
  onChange,
  placeholder = 'Choose a query...',
  showIcon = true,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);
  
  // Close on Escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen]);
  
  const selectedOption = options.find(o => o.id === value);
  
  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 transition-colors"
      >
        <span>{selectedOption?.label || label}</span>
        <ChevronDown 
          size={16} 
          className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>
      
      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 min-w-[220px] bg-white rounded-lg border border-slate-200 shadow-lg z-50 py-1 max-h-80 overflow-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">
              {placeholder}
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange?.(option.id, option);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50 transition-colors ${
                  value === option.id ? 'bg-slate-50' : ''
                }`}
              >
                <span className="w-4 flex-shrink-0">
                  {value === option.id && (
                    <Check size={14} className="text-blue-600" />
                  )}
                </span>
                <span className="text-sm text-slate-700 flex-1">
                  {option.label}
                </span>
                {option.badge && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                    {option.badge}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * QueryCategoryList - List of query categories
 *
 * Like the dropdown menu but as a persistent list
 */
export function QueryCategoryList({
  categories = [],
  selectedId,
  onSelect,
  onRun,
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {categories.map((category, idx) => (
        <button
          key={category.id}
          type="button"
          onClick={() => onSelect?.(category.id, category)}
          className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
            idx !== 0 ? 'border-t border-slate-100' : ''
          } ${
            selectedId === category.id 
              ? 'bg-blue-50' 
              : 'hover:bg-slate-50'
          }`}
        >
          {category.icon && (
            <category.icon size={16} className={
              selectedId === category.id ? 'text-blue-600' : 'text-slate-400'
            } />
          )}
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-medium ${
              selectedId === category.id ? 'text-blue-900' : 'text-slate-700'
            }`}>
              {category.label}
            </div>
            {category.description && (
              <div className="text-xs text-slate-500 truncate">
                {category.description}
              </div>
            )}
          </div>
          {category.count !== undefined && (
            <span className="text-xs text-slate-400">
              {category.count}
            </span>
          )}
          {onRun && selectedId === category.id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRun(category);
              }}
              className="p-1.5 text-blue-600 hover:bg-blue-100 rounded transition-colors"
            >
              <Play size={14} />
            </button>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * QueryListItem - Single query item component
 */
export function QueryListItem({
  label,
  description,
  icon: Icon,
  isSelected,
  isReady,
  onClick,
  onRun,
  onCopy,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-slate-100 last:border-b-0 ${
        isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
      }`}
    >
      {Icon && (
        <Icon size={16} className={isSelected ? 'text-blue-600' : 'text-slate-400'} />
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
          {label}
        </div>
        {description && (
          <div className="text-xs text-slate-500 truncate mt-0.5">
            {description}
          </div>
        )}
      </div>
      {isReady && (
        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-medium">
          Ready
        </span>
      )}
      <ArrowRight size={14} className="text-slate-300" />
    </button>
  );
}


