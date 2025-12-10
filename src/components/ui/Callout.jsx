import React from 'react';
import { Info, AlertTriangle, Lightbulb, AlertCircle } from 'lucide-react';

/**
 * Callout - DuckDB-style callout/admonition component
 * 
 * Design reference: DuckDB documentation callouts
 * - Clean border-left accent
 * - Subtle background
 * - Icon + label header
 */

const TYPE_CONFIG = {
  note: {
    label: 'Note',
    outer: 'border-l-4 border-l-blue-500 bg-blue-50/50',
    header: 'text-blue-700',
    body: 'text-slate-700',
    Icon: Info,
  },
  warning: {
    label: 'Warning',
    outer: 'border-l-4 border-l-amber-500 bg-amber-50/50',
    header: 'text-amber-700',
    body: 'text-slate-700',
    Icon: AlertTriangle,
  },
  tip: {
    label: 'Tip',
    outer: 'border-l-4 border-l-emerald-500 bg-emerald-50/50',
    header: 'text-emerald-700',
    body: 'text-slate-700',
    Icon: Lightbulb,
  },
  danger: {
    label: 'Important',
    outer: 'border-l-4 border-l-red-500 bg-red-50/50',
    header: 'text-red-700',
    body: 'text-slate-700',
    Icon: AlertCircle,
  },
};

export function Callout({ type = 'note', title, children }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.note;
  const Icon = cfg.Icon;

  return (
    <div className={`rounded-r-lg px-4 py-3 text-sm ${cfg.outer}`}>
      <div className={`font-medium flex items-center gap-2 ${cfg.header}`}>
        <Icon size={16} className="shrink-0" />
        <span>{title || cfg.label}</span>
      </div>
      {children && (
        <div className={`mt-1.5 text-sm leading-relaxed ${cfg.body}`}>
          {children}
        </div>
      )}
    </div>
  );
}
