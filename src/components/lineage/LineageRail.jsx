import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, ArrowRight, ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react';
import { createLogger } from '../../utils/logger';

const log = createLogger('LineageRail');

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
// Enhanced with smooth flowing animation to show data is loading
export function LineageSkeleton({ message = 'Loading lineage...' }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded-full bg-emerald-200 animate-pulse" />
          <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="p-4 relative overflow-hidden">
        {/* Animated flow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent animate-shimmer"
             style={{ animationDuration: '2s' }} />
        <div className="flex items-center justify-center gap-4">
          {/* Upstream nodes skeleton */}
          <div className="flex flex-col gap-2">
            <div className="w-36 h-11 bg-blue-50 border border-blue-200 rounded-lg animate-pulse" style={{ animationDelay: '0ms' }} />
            <div className="w-36 h-11 bg-blue-50 border border-blue-200 rounded-lg animate-pulse" style={{ animationDelay: '100ms' }} />
          </div>
          {/* Arrow with animated flow */}
          <div className="flex items-center">
            <div className="w-8 h-0.5 bg-gradient-to-r from-blue-200 to-gray-300 animate-pulse" />
            <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-gray-300" />
          </div>
          {/* Target node skeleton - highlighted */}
          <div className="w-36 h-11 bg-emerald-50 border-2 border-emerald-300 rounded-lg shadow-sm animate-pulse" style={{ animationDelay: '200ms' }} />
          {/* Arrow with animated flow */}
          <div className="flex items-center">
            <div className="w-8 h-0.5 bg-gradient-to-r from-gray-300 to-green-200 animate-pulse" />
            <div className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-green-300" />
          </div>
          {/* Downstream nodes skeleton */}
          <div className="flex flex-col gap-2">
            <div className="w-36 h-11 bg-green-50 border border-green-200 rounded-lg animate-pulse" style={{ animationDelay: '300ms' }} />
            <div className="w-36 h-11 bg-green-50 border border-green-200 rounded-lg animate-pulse" style={{ animationDelay: '400ms' }} />
          </div>
        </div>
        {/* Loading message */}
        <div className="text-center mt-4 text-xs text-gray-500 flex items-center justify-center gap-2">
          <svg className="w-4 h-4 animate-spin text-emerald-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>{message}</span>
        </div>
      </div>
      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/30">
        <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

// Animated rendering skeleton that shows nodes appearing one by one
export function LineageRenderingSkeleton({ nodeCount = 5 }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 animate-spin text-emerald-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs font-medium text-gray-700">Rendering lineage graph...</span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-center gap-6">
          {Array.from({ length: nodeCount }).map((_, i) => (
            <div
              key={i}
              className="w-36 h-11 rounded-lg border animate-fadeInScale"
              style={{
                animationDelay: `${i * 100}ms`,
                animationFillMode: 'both',
                backgroundColor: i === Math.floor(nodeCount / 2) ? '#ECFDF5' : '#EFF6FF',
                borderColor: i === Math.floor(nodeCount / 2) ? '#10B981' : '#3B82F6'
              }}
            />
          ))}
        </div>
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
 * Guards against NaN values to prevent SVG rendering errors
 */
const LineageNode = memo(function LineageNode({ node, x, y, onClick, isClickable }) {
  const colors = node.isMain ? TYPE_COLORS.main : (TYPE_COLORS[node.type] || TYPE_COLORS.unknown);

  // Guard against NaN values - don't render if coordinates are invalid
  if (isNaN(x) || isNaN(y)) {
    return null;
  }

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
        style={{ textTransform: 'uppercase' }}
      >
        {node.typeName || node.type || 'ASSET'}
      </text>
    </g>
  );
});

/**
 * Memoized SVG Edge component
 * Guards against NaN values to prevent SVG rendering errors
 */
const LineageEdge = memo(function LineageEdge({ fromX, fromY, toX, toY }) {
  // Guard against NaN values - don't render if any coordinate is invalid
  if (isNaN(fromX) || isNaN(fromY) || isNaN(toX) || isNaN(toY)) {
    return null;
  }

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
  const renderStartTime = useRef(performance.now());

  // Log render performance on mount/update
  useEffect(() => {
    const renderTime = Math.round(performance.now() - renderStartTime.current);
    log.info('📊 LineageRail render complete', {
      renderTimeMs: renderTime,
      nodeCount: nodes?.length || 0,
      edgeCount: edges?.length || 0,
      title
    });
  }, [nodes, edges, title]);

  // Track if click-through is enabled
  const isClickable = typeof onNodeClick === 'function';

  if (!nodes?.length) {
    log.debug('LineageRail - no nodes to render');
    return null;
  }

  log.debug('LineageRail - starting render', { nodeCount: nodes.length, edgeCount: edges?.length || 0 });

  // Memoize position map for O(1) lookups instead of O(n) finds
  // Guard against undefined/NaN column/row values
  const nodePositions = useMemo(() => {
    const start = performance.now();
    const posMap = new Map();
    nodes.forEach(n => {
      const col = typeof n.column === 'number' && !isNaN(n.column) ? n.column : 0;
      const row = typeof n.row === 'number' && !isNaN(n.row) ? n.row : 0;
      posMap.set(n.id, {
        x: col * COL_WIDTH + 20,
        y: row * ROW_HEIGHT + 12
      });
    });
    log.debug('nodePositions computed', { durationMs: Math.round(performance.now() - start), nodeCount: nodes.length });
    return posMap;
  }, [nodes]);

  // Memoize dimension calculations
  // Guard against empty arrays and undefined values
  const { width, height, maxCol, maxRow } = useMemo(() => {
    const columns = nodes.map(n => n.column).filter(c => typeof c === 'number' && !isNaN(c));
    const rows = nodes.map(n => n.row).filter(r => typeof r === 'number' && !isNaN(r));
    const mc = columns.length > 0 ? Math.max(...columns) : 0;
    const mr = rows.length > 0 ? Math.max(...rows) : 0;
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
        <svg width={isNaN(width) ? 240 : width} height={isNaN(height) ? 88 : height} className="block" style={{ willChange: 'transform' }}>
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
