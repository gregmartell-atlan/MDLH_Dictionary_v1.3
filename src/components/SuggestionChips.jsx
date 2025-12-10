/**
 * SuggestionChips - Clickable suggestion chips for query fixes
 * 
 * Displays query suggestions as interactive chips that can be clicked
 * to auto-apply fixes. Supports table, column, syntax, and full rewrite suggestions.
 */

import React, { useState } from 'react';
import { 
  Table, Columns, Wrench, Sparkles, Check, Copy, Eye, 
  ChevronRight, Database, Zap, Info, HelpCircle, Lightbulb,
  Search, AlertTriangle
} from 'lucide-react';

/**
 * Single suggestion chip component
 */
function SuggestionChip({ 
  suggestion, 
  onApply, 
  showPreview = true,
  compact = false 
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [applied, setApplied] = useState(false);
  
  const handleApply = () => {
    setApplied(true);
    onApply(suggestion);
    // Reset after animation
    setTimeout(() => setApplied(false), 1500);
  };
  
  // Icon based on suggestion type
  const getIcon = () => {
    switch (suggestion.type) {
      case 'table':
        return <Table size={14} />;
      case 'column':
        return <Columns size={14} />;
      case 'syntax':
        return <Wrench size={14} />;
      case 'rewrite':
        return <Sparkles size={14} />;
      case 'info':
        return suggestion.isGuidance ? <Lightbulb size={14} /> : <Info size={14} />;
      default:
        return <Zap size={14} />;
    }
  };
  
  // Style based on suggestion type
  const getStyles = () => {
    if (applied) {
      return 'bg-green-100 text-green-700 border-green-300';
    }
    
    // Guidance items have a different style - not clickable to apply
    if (suggestion.isGuidance) {
      return 'bg-indigo-50 text-indigo-700 border-indigo-200 cursor-default';
    }
    
    // Helper queries (like "find GUIDs") have a distinct style
    if (suggestion.isHelper) {
      return 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 hover:border-violet-300';
    }
    
    switch (suggestion.type) {
      case 'table':
        return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300';
      case 'column':
        return 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300';
      case 'syntax':
        return 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:border-amber-300';
      case 'rewrite':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300';
      case 'info':
        return 'bg-slate-50 text-slate-700 border-slate-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300';
    }
  };
  
  // Confidence indicator
  const confidencePercent = Math.round((suggestion.confidence || 0.5) * 100);
  const confidenceColor = confidencePercent >= 80 ? 'bg-green-400' : 
                          confidencePercent >= 60 ? 'bg-yellow-400' : 'bg-gray-400';
  
  // For guidance items without a fix, show as info card
  if (suggestion.isGuidance) {
    return (
      <div
        className={`relative rounded-lg border p-3 ${getStyles()}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex-shrink-0">
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{suggestion.title}</div>
            <p className="text-xs opacity-80 mt-0.5">{suggestion.description}</p>
            
            {/* Show help text if available */}
            {suggestion.helpText && (
              <div className="mt-2 p-2 bg-white bg-opacity-50 rounded text-xs font-mono whitespace-pre-wrap">
                {suggestion.helpText}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  if (compact) {
    return (
      <button
        onClick={handleApply}
        disabled={!suggestion.fix}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all ${getStyles()} ${!suggestion.fix ? 'opacity-60 cursor-not-allowed' : ''}`}
        title={suggestion.description}
      >
        {applied ? <Check size={12} /> : getIcon()}
        <span>{suggestion.title}</span>
        {suggestion.badge && (
          <span className="text-[10px] px-1 bg-amber-200 text-amber-800 rounded">
            {suggestion.badge}
          </span>
        )}
      </button>
    );
  }
  
  return (
    <div
      className={`relative group rounded-lg border transition-all ${getStyles()} ${isHovered ? 'shadow-md' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={handleApply}
        disabled={!suggestion.fix}
        className={`w-full text-left p-3 ${!suggestion.fix ? 'cursor-not-allowed' : ''}`}
      >
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex-shrink-0">
            {applied ? <Check size={16} className="text-green-600" /> : getIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{suggestion.title}</span>
              {suggestion.badge && (
                <span className="text-[10px] px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded-full font-medium">
                  {suggestion.badge}
                </span>
              )}
              {suggestion.rowCount !== undefined && (
                <span className="text-xs opacity-70">
                  ({suggestion.rowCount.toLocaleString()} rows)
                </span>
              )}
            </div>
            
            <p className="text-xs opacity-70 mt-0.5 line-clamp-2">
              {suggestion.description}
            </p>
            
            {/* Help text for helper queries */}
            {suggestion.isHelper && suggestion.helpText && (
              <p className="text-xs opacity-60 mt-1 italic">
                {suggestion.helpText}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Confidence indicator */}
            {!suggestion.isHelper && (
              <div className="flex items-center gap-1" title={`${confidencePercent}% confidence`}>
                <div className="w-8 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${confidenceColor} transition-all`}
                    style={{ width: `${confidencePercent}%` }}
                  />
                </div>
              </div>
            )}
            
            {suggestion.fix && (
              <ChevronRight size={16} className="opacity-50 group-hover:opacity-100 transition-opacity" />
            )}
          </div>
        </div>
        
        {/* Preview on hover */}
        {showPreview && suggestion.preview && isHovered && (
          <div className="mt-2 pt-2 border-t border-current border-opacity-20">
            <div className="flex items-center gap-1 text-xs opacity-70 mb-1">
              <Eye size={12} />
              <span>Preview</span>
            </div>
            <pre className="text-xs bg-black bg-opacity-5 rounded p-2 overflow-x-auto whitespace-pre-wrap font-mono">
              {suggestion.preview.length > 200 
                ? suggestion.preview.substring(0, 200) + '...' 
                : suggestion.preview}
            </pre>
          </div>
        )}
      </button>
    </div>
  );
}

/**
 * Container for multiple suggestion chips
 */
export function SuggestionList({ 
  suggestions = [], 
  onApply, 
  title = 'Suggestions',
  maxVisible = 5,
  layout = 'list', // 'list' | 'inline' | 'grid'
  emptyMessage = null
}) {
  const [showAll, setShowAll] = useState(false);
  
  if (!suggestions.length) {
    if (emptyMessage) {
      return (
        <div className="text-sm text-gray-500 italic py-2">
          {emptyMessage}
        </div>
      );
    }
    return null;
  }
  
  const visibleSuggestions = showAll ? suggestions : suggestions.slice(0, maxVisible);
  const hasMore = suggestions.length > maxVisible;
  
  // Group by type for better organization
  const groupedByType = layout === 'list' ? null : suggestions.reduce((acc, s) => {
    const type = s.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(s);
    return acc;
  }, {});
  
  const layoutClasses = {
    list: 'flex flex-col gap-2',
    inline: 'flex flex-wrap gap-2',
    grid: 'grid grid-cols-2 gap-2'
  };
  
  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Sparkles size={14} className="text-amber-500" />
          <span>{title}</span>
          <span className="text-xs text-gray-400">({suggestions.length})</span>
        </div>
      )}
      
      <div className={layoutClasses[layout] || layoutClasses.list}>
        {layout === 'inline' ? (
          // Inline chips (compact)
          visibleSuggestions.map((suggestion, idx) => (
            <SuggestionChip
              key={`${suggestion.type}-${suggestion.title}-${idx}`}
              suggestion={suggestion}
              onApply={onApply}
              compact={true}
            />
          ))
        ) : (
          // List or grid (full cards)
          visibleSuggestions.map((suggestion, idx) => (
            <SuggestionChip
              key={`${suggestion.type}-${suggestion.title}-${idx}`}
              suggestion={suggestion}
              onApply={onApply}
              showPreview={layout !== 'grid'}
            />
          ))
        )}
      </div>
      
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
        >
          {showAll 
            ? 'Show less' 
            : `Show ${suggestions.length - maxVisible} more suggestions`}
        </button>
      )}
    </div>
  );
}

/**
 * Quick fix inline chip for error messages
 */
export function QuickFixChip({ suggestion, onApply }) {
  const [applied, setApplied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  const handleClick = () => {
    setApplied(true);
    onApply(suggestion);
    setTimeout(() => setApplied(false), 1500);
  };
  
  // Style based on confidence
  const isHighConfidence = suggestion.confidence > 0.7;
  const hasData = suggestion.rowCount > 0;
  
  const baseStyle = applied 
    ? 'bg-green-100 text-green-700 border-green-300'
    : isHighConfidence
      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400'
      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:border-blue-300';
  
  return (
    <div className="relative inline-block">
      <button
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-all ${baseStyle}`}
        title={suggestion.description}
      >
        {applied ? (
          <Check size={12} className="text-green-600" />
        ) : isHighConfidence ? (
          <Sparkles size={12} />
        ) : (
          <Zap size={12} />
        )}
        <span>{suggestion.title}</span>
        {hasData && !applied && (
          <span className="text-[10px] opacity-60">
            ({suggestion.rowCount.toLocaleString()})
          </span>
        )}
      </button>
      
      {/* Tooltip on hover */}
      {isHovered && suggestion.description && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg whitespace-nowrap max-w-xs truncate">
          {suggestion.description}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

/**
 * Autocomplete dropdown for proactive suggestions
 */
export function AutocompleteDropdown({ 
  suggestions = [], 
  onSelect, 
  position = { top: 0, left: 0 },
  visible = false 
}) {
  if (!visible || !suggestions.length) return null;
  
  return (
    <div 
      className="absolute z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-48 max-w-80 max-h-64 overflow-y-auto"
      style={{ top: position.top, left: position.left }}
    >
      {suggestions.map((suggestion, idx) => (
        <button
          key={`${suggestion.type}-${suggestion.title}-${idx}`}
          onClick={() => onSelect(suggestion)}
          className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 text-sm"
        >
          {suggestion.type === 'table' && <Table size={14} className="text-blue-500" />}
          {suggestion.type === 'column' && <Columns size={14} className="text-purple-500" />}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{suggestion.title}</div>
            <div className="text-xs text-gray-500 truncate">{suggestion.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default SuggestionChip;

