import React, { useState } from 'react';
import { GraduationCap, ChevronDown, Check, BookOpen, Lightbulb, AlertCircle, Eye, Settings2 } from 'lucide-react';
import { useLearningMode } from '../context/LearningModeContext';

// Difficulty filter options
const DIFFICULTY_OPTIONS = [
  { id: 'all', label: 'All Levels' },
  { id: 'beginner', label: 'Beginner Only' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' }
];

// Settings panel component
function SettingsPanel({ isOpen, onClose }) {
  const {
    autoShowWork,
    showTips,
    highlightKeyColumns,
    explainErrors,
    difficultyFilter,
    updateSetting
  } = useLearningMode();

  if (!isOpen) return null;

  return (
    <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
      <div className="p-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Settings2 size={16} />
          Learning Mode Settings
        </h3>
        <p className="text-xs text-gray-500 mt-1">Customize your learning experience</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Auto Show Work */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={autoShowWork}
            onChange={(e) => updateSetting('autoShowWork', e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <Eye size={14} className="text-gray-500" />
              <span className="font-medium text-gray-700 group-hover:text-gray-900">Auto "Show My Work"</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Automatically explain query results</p>
          </div>
        </label>

        {/* Show Tips */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={showTips}
            onChange={(e) => updateSetting('showTips', e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <Lightbulb size={14} className="text-gray-500" />
              <span className="font-medium text-gray-700 group-hover:text-gray-900">Show Tips</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Display contextual hints and tips</p>
          </div>
        </label>

        {/* Highlight Key Columns */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={highlightKeyColumns}
            onChange={(e) => updateSetting('highlightKeyColumns', e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <BookOpen size={14} className="text-gray-500" />
              <span className="font-medium text-gray-700 group-hover:text-gray-900">Highlight Key Columns</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Emphasize important columns in results</p>
          </div>
        </label>

        {/* Explain Errors */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={explainErrors}
            onChange={(e) => updateSetting('explainErrors', e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <AlertCircle size={14} className="text-gray-500" />
              <span className="font-medium text-gray-700 group-hover:text-gray-900">Explain Errors</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Show detailed error explanations</p>
          </div>
        </label>

        {/* Difficulty filter */}
        <div className="pt-2 border-t border-gray-100">
          <label className="block text-sm font-medium text-gray-700 mb-2">Query Difficulty</label>
          <select
            value={difficultyFilter}
            onChange={(e) => updateSetting('difficultyFilter', e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {DIFFICULTY_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 bg-gray-50 border-t border-gray-100 rounded-b-xl">
        <button
          onClick={onClose}
          className="w-full px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// Main toggle component
export default function LearningModeToggle({ variant = 'default' }) {
  const { isLearningMode, toggleLearningMode } = useLearningMode();
  const [showSettings, setShowSettings] = useState(false);

  if (variant === 'compact') {
    // Compact version for nav bar
    return (
      <div className="relative">
        <button
          onClick={toggleLearningMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            isLearningMode
              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          title={isLearningMode ? 'Learning Mode ON' : 'Learning Mode OFF'}
        >
          <GraduationCap size={16} />
          <span className="hidden sm:inline">{isLearningMode ? 'Learning' : 'Learn'}</span>
          {isLearningMode && <Check size={12} />}
        </button>
      </div>
    );
  }

  // Default version with settings dropdown
  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {/* Main toggle */}
        <button
          onClick={toggleLearningMode}
          className={`flex items-center gap-2 px-4 py-2 rounded-l-lg text-sm font-medium transition-all border ${
            isLearningMode
              ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <GraduationCap size={18} />
          <span>Learning Mode</span>
          <span className={`w-2 h-2 rounded-full ${isLearningMode ? 'bg-purple-500' : 'bg-gray-300'}`} />
        </button>

        {/* Settings button */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-2 rounded-r-lg border border-l-0 transition-all ${
            isLearningMode
              ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          } ${showSettings ? 'bg-purple-100' : ''}`}
          title="Learning mode settings"
        >
          <ChevronDown size={16} className={`transition-transform ${showSettings ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Settings panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Click outside to close */}
      {showSettings && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// Export settings panel for standalone use
export { SettingsPanel };
