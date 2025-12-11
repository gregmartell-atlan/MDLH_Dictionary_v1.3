/**
 * HeaderTabs - 3-tab header navigation for MDLH Dictionary
 *
 * Tabs: Home | Browse | Editor
 * - Home: Discovery Cards landing page
 * - Browse: Entity Browser tree (left) + Data Table (right)
 * - Editor: Full SQL workspace
 */

import React from 'react';
import { Sparkles, FolderTree, Code2 } from 'lucide-react';

const TABS = [
  { id: 'home', label: 'Home', icon: Sparkles },
  { id: 'browse', label: 'Browse', icon: FolderTree },
  { id: 'editor', label: 'Editor', icon: Code2 },
];

function TabButton({ tab, isActive, onClick }) {
  const Icon = tab.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(tab.id)}
      className={`
        flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
        ${isActive
          ? 'bg-slate-900 text-white shadow-sm'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }
      `}
    >
      <Icon size={16} />
      <span>{tab.label}</span>
    </button>
  );
}

export default function HeaderTabs({ activeTab, onTabChange }) {
  return (
    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
      {TABS.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          isActive={activeTab === tab.id}
          onClick={onTabChange}
        />
      ))}
    </div>
  );
}
