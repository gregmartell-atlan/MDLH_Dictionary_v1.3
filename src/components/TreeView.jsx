/**
 * TreeView - Collapsible tree navigation component
 *
 * Used by EntityBrowser for tree-style navigation.
 */

import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

function TreeNode({ node, level = 0, selectedId, onSelect }) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;
  const Icon = node.icon;

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleSelect = () => {
    onSelect(node);
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleSelect}
        className={`
          w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-md transition-colors
          ${isSelected
            ? 'bg-slate-900 text-white'
            : 'text-slate-700 hover:bg-slate-100'
          }
        `}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            type="button"
            onClick={handleToggle}
            className={`p-0.5 rounded hover:bg-slate-200/50 ${isSelected ? 'hover:bg-white/20' : ''}`}
          >
            {isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* Icon */}
        {Icon && (
          <Icon
            size={14}
            className={isSelected ? 'text-white' : 'text-slate-500'}
          />
        )}

        {/* Label */}
        <span className="text-sm font-medium truncate flex-1">
          {node.label}
        </span>

        {/* Count badge */}
        {node.count !== undefined && (
          <span
            className={`
              text-xs px-1.5 py-0.5 rounded
              ${isSelected
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 text-slate-600'
              }
            `}
          >
            {node.count.toLocaleString()}
          </span>
        )}
      </button>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TreeView({ nodes, selectedId, onSelect }) {
  return (
    <div className="py-1">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
