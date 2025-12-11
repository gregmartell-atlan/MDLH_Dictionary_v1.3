import React from 'react';
import {
  Database,
  BookOpen,
  Tag,
  Table2,
  GitBranch,
  BarChart3,
  Code2,
  Eye,
  Workflow,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Clock,
  TrendingUp
} from 'lucide-react';
import DiscoveryCards, { CATEGORY_INFO } from './DiscoveryCards';

/**
 * CategoryLanding - Landing page for each sidebar category
 *
 * Shows category description, relevant Discovery Cards, quick stats,
 * and recent queries for the selected category.
 */
export default function CategoryLanding({
  category,
  database,
  schema,
  isConnected = false,
  onSelectQuery,
  onViewAllQueries,
  onExploreMore,
  recentQueries = [],
  stats = null
}) {
  const categoryInfo = CATEGORY_INFO[category];

  if (!categoryInfo) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>Category not found: {category}</p>
      </div>
    );
  }

  const CategoryIcon = categoryInfo.icon;

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      {/* Category Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 bg-blue-100 rounded-xl">
          <CategoryIcon size={28} className="text-blue-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{categoryInfo.title}</h1>
          <p className="text-gray-600 mt-1">{categoryInfo.description}</p>
        </div>
      </div>

      {/* Quick Stats (if connected and stats provided) */}
      {isConnected && stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                {stat.icon && <stat.icon size={14} />}
                {stat.label}
              </div>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              {stat.trend && (
                <div className={`text-xs flex items-center gap-1 mt-1 ${
                  stat.trend > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  <TrendingUp size={12} className={stat.trend < 0 ? 'rotate-180' : ''} />
                  {Math.abs(stat.trend)}% from last week
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Discovery Cards - filtered by category */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <DiscoveryCards
          database={database}
          schema={schema}
          sidebarCategory={category}
          maxCards={6}
          onSelectQuery={onSelectQuery}
          onViewAllQueries={onViewAllQueries}
          onExploreMore={onExploreMore}
        />
      </div>

      {/* Recent Queries in this Category */}
      {recentQueries.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Clock size={16} className="text-gray-400" />
              Recent Queries
            </h3>
            <button className="text-sm text-blue-600 hover:text-blue-700">
              View all
            </button>
          </div>
          <div className="space-y-2">
            {recentQueries.slice(0, 5).map((query, i) => (
              <button
                key={i}
                onClick={() => onSelectQuery?.(query.sql, query)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors group text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Code2 size={14} className="text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 group-hover:text-blue-700 truncate">
                      {query.title || query.label || 'Untitled Query'}
                    </p>
                    {query.timestamp && (
                      <p className="text-xs text-gray-400">
                        {formatRelativeTime(query.timestamp)}
                      </p>
                    )}
                  </div>
                </div>
                <ArrowRight size={14} className="text-gray-400 group-hover:text-blue-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Getting Started Tips (if not connected) */}
      {!isConnected && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="font-semibold text-amber-900 mb-2">Getting Started</h3>
          <ul className="text-sm text-amber-800 space-y-1">
            <li className="flex items-start gap-2">
              <span className="text-amber-600">1.</span>
              Connect to Snowflake to execute queries
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600">2.</span>
              Click any Discovery Card to preview the SQL
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600">3.</span>
              Use "Open in Editor" for more complex modifications
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

// Helper to format relative time
function formatRelativeTime(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}

// Default stats by category (for demo mode)
export const DEFAULT_CATEGORY_STATS = {
  core: [
    { label: 'Tables', value: '1,234', icon: Table2 },
    { label: 'Columns', value: '45,678', icon: Database },
    { label: 'Schemas', value: '12', icon: Database },
    { label: 'Views', value: '89', icon: Eye }
  ],
  glossary: [
    { label: 'Terms', value: '567', icon: BookOpen },
    { label: 'Linked Assets', value: '1,890', icon: Tag },
    { label: 'Glossaries', value: '8', icon: BookOpen },
    { label: 'Categories', value: '34', icon: Tag }
  ],
  lineage: [
    { label: 'Processes', value: '234', icon: Workflow },
    { label: 'Upstream', value: '456', icon: GitBranch },
    { label: 'Downstream', value: '789', icon: GitBranch },
    { label: 'ETL Jobs', value: '23', icon: Code2 }
  ],
  governance: [
    { label: 'Owned Assets', value: '890', icon: ShieldCheck },
    { label: 'Unowned', value: '123', icon: ShieldCheck },
    { label: 'Certified', value: '456', icon: ShieldCheck },
    { label: 'PII Flagged', value: '78', icon: ShieldCheck }
  ],
  usage: [
    { label: 'Queries Today', value: '1.2K', icon: BarChart3 },
    { label: 'Active Users', value: '45', icon: BarChart3 },
    { label: 'Popular Tables', value: '20', icon: TrendingUp },
    { label: 'Trending', value: '8', icon: TrendingUp, trend: 15 }
  ],
  bi: [
    { label: 'Dashboards', value: '156', icon: Eye },
    { label: 'Reports', value: '234', icon: Eye },
    { label: 'Data Sources', value: '45', icon: Database },
    { label: 'Views', value: '890', icon: Eye }
  ]
};
