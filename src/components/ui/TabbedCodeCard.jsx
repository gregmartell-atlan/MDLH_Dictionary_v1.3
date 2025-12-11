import React, { useMemo, useState } from 'react';
import { Copy, Check, ArrowRight, ChevronUp } from 'lucide-react';

/**
 * TabbedCodeCard - DuckDB-style code card
 * 
 * Design reference: duckdb.org homepage
 * - White code background (not dark)
 * - Pill-shaped language tabs (dark when active)
 * - Line numbers right-aligned in gray
 * - Syntax highlighting: cyan keywords, magenta numbers
 * - Simple "Select ▼" dropdown with text items
 * - Text CTA with arrow "Live demo →"
 */
export function TabbedCodeCard({
  title,
  description,
  languages,
  variants,
  snippets,
  defaultLanguage,
  defaultVariantId,
  cta,
}) {
  const [language, setLanguage] = useState(defaultLanguage || languages?.[0]?.id);
  const [variantId, setVariantId] = useState(defaultVariantId || variants?.[0]?.id);
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const activeSnippet = useMemo(() => {
    if (!snippets?.length) return null;
    const candidates = snippets.filter((s) => s.language === language);
    if (!candidates.length) return snippets[0];
    if (!variantId) return candidates[0];
    return candidates.find((s) => s.variantId === variantId) || candidates[0];
  }, [snippets, language, variantId]);

  const activeVariant = variants?.find(v => v.id === variantId);

  const handleCopy = async () => {
    if (!activeSnippet?.code) return;
    try {
      await navigator.clipboard.writeText(activeSnippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard can fail; we ignore it
    }
  };

  // DuckDB-style syntax highlighting - SAFE version without problematic regexes
  const highlightCode = (code) => {
    if (!code) return null;
    
    const lines = code.split('\n');
    
    return lines.map((line, idx) => {
      // Escape HTML first
      let highlighted = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // Check if this is a comment line
      if (highlighted.trim().startsWith('--')) {
        highlighted = `<span style="color:#6b7280;font-style:italic">${highlighted}</span>`;
      } else {
        // Tokenize and highlight - avoids regex conflicts
        // Use inline styles to avoid class name number conflicts
        
        // 1. String literals (green) - do first to protect contents
        highlighted = highlighted.replace(
          /'([^']*)'/g, 
          `<span style="color:#059669">'$1'</span>`
        );
        
        // 2. SQL keywords (cyan) - word boundaries only
        const keywords = [
          'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
          'ON', 'AND', 'OR', 'NOT', 'IN', 'AS', 'ORDER', 'BY', 'GROUP', 'HAVING',
          'LIMIT', 'OFFSET', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER',
          'TABLE', 'INDEX', 'VIEW', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
          'DESC', 'ASC', 'NULLS', 'LAST', 'FIRST', 'UNION', 'ALL', 'CASE', 'WHEN',
          'THEN', 'ELSE', 'END', 'WITH', 'LIKE', 'ILIKE', 'BETWEEN', 'EXISTS',
          'INTO', 'VALUES', 'SET', 'TRUE', 'FALSE', 'NULL', 'IS', 'LATERAL',
          'FLATTEN', 'INPUT', 'OUTER', 'VARCHAR', 'SHOW', 'TABLES', 'DESCRIBE'
        ];
        
        keywords.forEach(kw => {
          // Case-insensitive word boundary match
          const regex = new RegExp(`\\b(${kw})\\b`, 'gi');
          highlighted = highlighted.replace(regex, '<span style="color:#0891b2;font-weight:500">$1</span>');
        });
        
        // 3. Numbers - ONLY match standalone numbers at start of string or after whitespace/operators
        // This avoids matching numbers inside HTML attributes
        highlighted = highlighted.replace(
          /(^|[\s,=(])(\d+)(?=[\s,;)&]|$)/g, 
          '$1<span style="color:#3b82f6">$2</span>'
        );
      }
      
      return (
        <div key={idx} className="flex">
          <span className="w-8 text-right pr-4 select-none shrink-0 text-[13px]" style={{color:'#9ca3af'}}>
            {idx + 1}
          </span>
          <span 
            className="flex-1"
            dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }}
          />
        </div>
      );
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Language tabs - DuckDB style: pill in gray container */}
      <div className="px-4 pt-4 pb-3">
        <div className="inline-flex items-center gap-1 bg-gray-100 rounded-full p-1">
          {languages.map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => setLanguage(lang.id)}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                language === lang.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>

      {/* Code block - DuckDB style: WHITE background, line numbers */}
      <div className="px-4 py-4 bg-white text-gray-800 text-[13px] font-mono leading-relaxed border-t border-gray-100">
        {highlightCode(activeSnippet?.code) || (
          <span className="text-gray-400">-- no snippet available</span>
        )}
      </div>

      {/* Footer - DuckDB style: simple dropdown + text CTA */}
      {(variants?.length || cta) && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          {/* Dropdown - DuckDB style: "Select ▼" */}
          {variants?.length ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-full hover:border-gray-300 transition-colors"
              >
                <span>{activeVariant?.label || 'Select'}</span>
                <ChevronUp 
                  size={14} 
                  className={`text-gray-400 transition-transform ${dropdownOpen ? '' : 'rotate-180'}`} 
                />
              </button>
              
              {/* Dropdown menu - DuckDB style: clean, no icons */}
              {dropdownOpen && (
                <div className="absolute bottom-full left-0 mb-1 min-w-[200px] bg-white rounded-lg border border-gray-200 shadow-lg z-10 py-1">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVariantId(v.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        variantId === v.id 
                          ? 'text-gray-900 bg-gray-50' 
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            {/* Copy button - subtle */}
            <button
              type="button"
              onClick={handleCopy}
              className={`text-sm transition-colors ${
                copied ? 'text-emerald-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>

            {/* CTA - DuckDB style: text with arrow */}
            {cta && (
              <button
                type="button"
                onClick={cta.onClick}
                className="inline-flex items-center gap-1 text-sm font-medium text-gray-900 hover:text-gray-600 transition-colors"
              >
                {cta.label}
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
