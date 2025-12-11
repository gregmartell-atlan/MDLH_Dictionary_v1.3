/**
 * DiscoveryHome - Landing page with Discovery Cards
 *
 * The Home tab content showing guided discovery questions.
 * Users click cards to see query suggestions, then open in Editor.
 */

import React from 'react';
import { Database, Code2, AlertCircle } from 'lucide-react';
import DiscoveryCards from './DiscoveryCards';

export default function DiscoveryHome({
  database,
  schema,
  isConnected,
  onSelectQuery,
  onOpenInEditor,
  onSwitchToEditor,
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            MDLH Dictionary
          </h1>
          <p className="text-slate-600">
            Explore your metadata lakehouse with guided discovery
          </p>
        </div>

        {/* Connection context */}
        {database && schema && (
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-sm text-slate-700">
              <Database size={14} className="text-slate-500" />
              <span className="font-mono">{database}.{schema}</span>
            </div>
            {isConnected && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                Connected
              </span>
            )}
          </div>
        )}

        {/* Not connected warning */}
        {!isConnected && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Not connected to Snowflake
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  Connect to run queries. You can still browse query templates.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Discovery Cards */}
        <DiscoveryCards
          database={database}
          schema={schema}
          onSelectQuery={(sql, query) => {
            // When user selects a query, open it in the editor
            if (onOpenInEditor) {
              onOpenInEditor(sql, query);
            }
          }}
          onViewAllQueries={onSwitchToEditor}
          onExploreMore={onSwitchToEditor}
        />

        {/* Quick action footer */}
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={onSwitchToEditor}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <Code2 size={16} />
            Open SQL Editor
          </button>
        </div>
      </div>
    </div>
  );
}
