/**
 * TestQueryLayout - DuckDB-style test query layout
 * 
 * Clean white header, minimal controls, no gradients
 */

import React from 'react';
import { ArrowLeft, FlaskConical, X } from 'lucide-react';
import FlyoutQueryEditor from './FlyoutQueryEditor';

export default function TestQueryLayout({
  testQueryMode,
  onBack,
  onClose,
  onOpenFullEditor,
  selectedDatabase,
  selectedSchema,
  onSqlChange = null,
  availableTables = [],
  tableColumns = {}
}) {
  return (
    <>
      {/* Test Mode Header - DuckDB clean white style */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
            title="Back to queries"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <FlaskConical size={16} className="text-gray-500" />
              Test Query
            </h2>
            <p className="text-sm text-gray-500">
              {testQueryMode.title || 'Run query against your connection'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          title="Close (Esc)"
        >
          <X size={18} />
        </button>
      </header>

      {/* Editor + results */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <FlyoutQueryEditor
          title={testQueryMode.title}
          initialQuery={testQueryMode.query}
          database={selectedDatabase}
          schema={selectedSchema}
          onOpenFullEditor={onOpenFullEditor}
          onClose={onBack}
          hideHeader={true}
          onSqlChange={onSqlChange}
          availableTables={availableTables}
          tableColumns={tableColumns}
        />
      </div>
    </>
  );
}
