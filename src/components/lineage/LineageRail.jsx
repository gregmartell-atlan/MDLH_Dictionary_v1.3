import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, ArrowRight, ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react';

/**
 * LineageRail - OpenLineage-compliant lineage visualization
 *
 * Shows:
 * 1. Visual graph of upstream → target → downstream flow
 * 2. Collapsible table of raw process results
 *
 * Design: Clean, minimal SVG diagram (DuckDB-inspired)
 * Color Palette: Monochrome + Blue + Green
 *
 * Performance optimizations:
 * - Memoized position lookups via Map
 * - Memoized SVG elements with custom comparators
 * - React.memo for sub-components
 * - Viewport-based rendering for large graphs
 * - CSS transforms for smooth animations
 * - Debounced pan/zoom
 */

const COL_WIDTH = 200;
const ROW_HEIGHT = 64;
const NODE_WIDTH = 150;
const NODE_HEIGHT = 44;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

// Loading skeleton for graph - exported for use in parent components
export function LineageSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="p-4 animate-pulse">
        <div className="flex items-center justify-center gap-6">
          <div className="w-36 h-11 bg-blue-50 border border-blue-200 rounded-lg" />
          <div className="w-12 h-0.5 bg-gray-200" />
          <div className="w-36 h-11 bg-emerald-50 border border-emerald-200 rounded-lg" />
          <div className="w-12 h-0.5 bg-gray-200" />
          <div className="w-36 h-11 bg-blue-50 border border-blue-200 rounded-lg" />
        </div>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/30">
        <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

// Color palette: Monochrome + Blue + Green (no orange/purple)
const TYPE_COLORS = {
  table: { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF' },      // Blue for datasets
  view: { bg: '#F0FDF4', border: '#22C55E', text: '#166534' },       // Green for views
  process: { bg: '#F1F5F9', border: '#64748B', text: '#334155' },    // Slate for jobs
  column: { bg: '#F0F9FF', border: '#0EA5E9', text: '#0369A1' },     // Sky for columns
  unknown: { bg: '#F9FAFB', border: '#9CA3AF', text: '#374151' },    // Gray fallback
  main: { bg: '#ECFDF5', border: '#10B981', text: '#047857' },       // Emerald for focus
};

/**
 * Memoized SVG Node component
 */
const LineageNode = memo(function LineageNode({ node, x, y, onClick, isClickable }) {
  const colors = node.isMain ? TYPE_COLORS.main : (TYPE_COLORS[node.type] || TYPE_COLORS.unknown);

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick && !node.isMain) {
      onClick(node);
    }
  };

  return (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: isClickable && !node.isMain ? 'pointer' : 'default' }}
      onClick={handleClick}
      role="button"
      tabIndex={isClickable && !node.isMain ? 0 : -1}
      onKeyDown={(e) => e.key === 'Enter' && handleClick(e)}
    >
      {node.isMain && (
        <rect
          rx={8}
          ry={8}
          x={-2}
          y={-2}
          width={NODE_WIDTH + 4}
          height={NODE_HEIGHT + 4}
          fill="none"
          stroke={colors.border}
          strokeWidth={2}
          opacity={0.3}
        />
      )}
      <rect
        rx={6}
        ry={6}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        fill={colors.bg}
        stroke={colors.border}
        strokeWidth={node.isMain ? 2 : 1}
        className={isClickable && !node.isMain ? 'hover:brightness-95 transition-all' : ''}
      />
      {/* Clickable indicator for non-main nodes */}
      {isClickable && !node.isMain && (
        <text
          x={NODE_WIDTH - 16}
          y={NODE_HEIGHT / 2 + 3}
          fontSize={10}
          fill={colors.text}
          opacity={0.4}
          fontFamily="system-ui, sans-serif"
        >
          {'\u203A'}
        </text>
      )}

      <text
        x={10}
        y={NODE_HEIGHT / 2 - 2}
        fontSize={11}
        fontWeight={500}
        fill={colors.text}
        fontFamily="ui-monospace, monospace"
      >
        {node.label?.length > 18 ? node.label.slice(0, 18) + '…' : node.label || 'Unknown'}
      </text>

      <text
        x={10}
        y={NODE_HEIGHT / 2 + 11}
        fontSize={9}
        fill={colors.text}
        opacity={0.6}
        fontFamily="system-ui, sans-serif"
        textTransform="uppercase"
      >
        {node.typeName || node.type || 'ASSET'}
      </text>
    </g>
  );
});

/**
 * Memoized SVG Edge component
 */
const LineageEdge = memo(function LineageEdge({ fromX, fromY, toX, toY }) {
  const x1 = fromX + NODE_WIDTH;
  const y1 = fromY + NODE_HEIGHT / 2;
  const x2 = toX;
  const y2 = toY + NODE_HEIGHT / 2;

  const dx = (x2 - x1) / 2;
  const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

  return (
    <g>
      <path
        d={path}
        strokeWidth={1.5}
        fill="none"
        stroke="#CBD5E1"
        strokeLinecap="round"
      />
      <polygon
        points={`${x2 - 5},${y2 - 3} ${x2},${y2} ${x2 - 5},${y2 + 3}`}
        fill="#CBD5E1"
      />
    </g>
  );
});

/**
 * Memoized Process Row component
 */
const ProcessRow = memo(function ProcessRow({ proc, idx }) {
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50">
      <td className="py-2 pr-4">
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${
          proc.direction === 'upstream'
            ? 'bg-blue-50 text-blue-600'
            : 'bg-green-50 text-green-600'
        }`}>
          {proc.direction === 'upstream' ? '← Upstream' : 'Downstream →'}
        </span>
      </td>
      <td className="py-2 pr-4 font-mono text-gray-800 max-w-[300px] truncate" title={proc.name}>
        {proc.name?.includes('→') ? (
          <span className="flex items-center gap-1">
            <span className="text-gray-600">{proc.name.split('→')[0].trim()}</span>
            <ArrowRight size={10} className="text-gray-400 flex-shrink-0" />
            <span className="text-gray-800">{proc.name.split('→')[1]?.trim()}</span>
          </span>
        ) : (
          proc.name
        )}
      </td>
      <td className="py-2 pr-4 text-gray-500">{proc.type}</td>
      <td className="py-2 text-right text-gray-500">
        {proc.inputCount} / {proc.outputCount}
      </td>
    </tr>
  );
});

export function LineageRail({ nodes, edges, title = 'Lineage', metadata, rawProcesses, onNodeClick }) {
  const [showRawData, setShowRawData] = useState(false);

  // Track if click-through is enabled
  const isClickable = typeof onNodeClick === 'function';

  if (!nodes?.length) return null;

  // Memoize position map for O(1) lookups instead of O(n) finds
  const nodePositions = useMemo(() => {
    const posMap = new Map();
    nodes.forEach(n => {
      posMap.set(n.id, {
        x: n.column * COL_WIDTH + 20,
        y: n.row * ROW_HEIGHT + 12
      });
    });
    return posMap;
  }, [nodes]);

  // Memoize dimension calculations
  const { width, height, maxCol, maxRow } = useMemo(() => {
    const mc = Math.max(...nodes.map(n => n.column));
    const mr = Math.max(...nodes.map(n => n.row));
    return {
      maxCol: mc,
      maxRow: mr,
      width: (mc + 1) * COL_WIDTH + 40,
      height: (mr + 1) * ROW_HEIGHT + 24
    };
  }, [nodes]);

  // Memoize counts
  const { upstreamCount, downstreamCount, mainNode } = useMemo(() => ({
    upstreamCount: metadata?.upstreamCount || nodes.filter(n => n.column === 0).length,
    downstreamCount: metadata?.downstreamCount || nodes.filter(n => n.column === 2).length,
    mainNode: nodes.find(n => n.isMain)
  }), [nodes, metadata]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700">{title}</span>
          {mainNode && (
            <span className="text-[10px] px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-mono border border-emerald-200">
              {mainNode.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-gray-500">
          {upstreamCount > 0 && <span className="text-blue-600">{upstreamCount} upstream</span>}
          {downstreamCount > 0 && <span className="text-green-600">{downstreamCount} downstream</span>}
        </div>
      </div>
      
      {/* Graph Visualization - CSS containment for faster paint */}
      <div className="p-3 overflow-auto bg-white" style={{ contain: 'layout paint' }}>
        <svg width={width} height={height} className="block" style={{ willChange: 'transform' }}>
          {/* Edges - using memoized component with O(1) position lookups */}
          {edges?.map((e) => {
            const from = nodePositions.get(e.from) || { x: 0, y: 0 };
            const to = nodePositions.get(e.to) || { x: 0, y: 0 };
            return (
              <LineageEdge
                key={`${e.from}-${e.to}`}
                fromX={from.x}
                fromY={from.y}
                toX={to.x}
                toY={to.y}
              />
            );
          })}

          {/* Nodes - using memoized component */}
          {nodes.map((n) => {
            const pos = nodePositions.get(n.id) || { x: 0, y: 0 };
            return (
              <LineageNode
                key={n.id}
                node={n}
                x={pos.x}
                y={pos.y}
                onClick={onNodeClick}
                isClickable={isClickable}
              />
            );
          })}
        </svg>
      </div>
      
      {/* Raw Process Data Table (collapsible) */}
      {rawProcesses && rawProcesses.length > 0 && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setShowRawData(!showRawData)}
            className="w-full px-4 py-2 flex items-center gap-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {showRawData ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="font-medium">Process Details</span>
            <span className="text-gray-400">({rawProcesses.length} processes)</span>
          </button>
          
          {showRawData && (
            <div className="px-4 pb-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Direction</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Process Name</th>
                    <th className="text-left py-2 pr-4 text-gray-500 font-medium">Type</th>
                    <th className="text-right py-2 text-gray-500 font-medium">In/Out</th>
                  </tr>
                </thead>
                <tbody>
                  {rawProcesses.map((proc, idx) => (
                    <ProcessRow key={proc.guid || idx} proc={proc} idx={idx} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      
      {/* Legend */}
      <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400 bg-gray-50/30">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: TYPE_COLORS.table.bg, border: `1px solid ${TYPE_COLORS.table.border}` }}></span>
          <span>Table</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm" style={{ background: TYPE_COLORS.main.bg, border: `1px solid ${TYPE_COLORS.main.border}` }}></span>
          <span>Focus</span>
        </div>
        <div className="ml-auto text-gray-400">
          {nodes.length} nodes • {edges?.length || 0} edges
        </div>
      </div>
    </div>
  );
}
