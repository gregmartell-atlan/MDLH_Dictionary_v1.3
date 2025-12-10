/**
 * Shared Constants for MDLH Dictionary
 * 
 * Contains tab definitions, database configurations, and column mappings.
 */

import { 
  Table, 
  BookOpen, 
  Boxes, 
  Database, 
  FolderTree, 
  BarChart3, 
  GitBranch, 
  Cloud, 
  Workflow, 
  Shield, 
  Bot, 
  Terminal,
  Network,
  TrendingUp
} from 'lucide-react';

/**
 * Tab definitions for the main navigation
 * Each tab includes a description for tooltips and context
 */
export const tabs = [
  { id: 'core', label: 'Core', icon: Table, description: 'Shared enterprise entities like Connection, Process, and Link' },
  { id: 'glossary', label: 'Glossary', icon: BookOpen, description: 'Business glossary terms, categories, and anchors' },
  { id: 'datamesh', label: 'Data Mesh', icon: Boxes, description: 'Data domains, products, and contracts' },
  { id: 'relational', label: 'Relational DB', icon: Database, description: 'Databases, schemas, tables, views, and columns' },
  { id: 'lineage', label: 'Lineage', icon: Network, description: 'Data lineage queries - upstream/downstream dependencies' },
  { id: 'usage', label: 'Usage', icon: TrendingUp, description: 'Usage analytics and popularity queries' },
  { id: 'queries', label: 'Query Org', icon: FolderTree, description: 'Saved queries, collections, and folders' },
  { id: 'bi', label: 'BI Tools', icon: BarChart3, description: 'Tableau, PowerBI, Looker, Sigma, and more' },
  { id: 'dbt', label: 'dbt', icon: GitBranch, description: 'dbt models, sources, tests, and metrics' },
  { id: 'storage', label: 'Object Storage', icon: Cloud, description: 'S3, GCS, ADLS buckets and objects' },
  { id: 'orchestration', label: 'Orchestration', icon: Workflow, description: 'Airflow, Fivetran, Matillion pipelines' },
  { id: 'governance', label: 'Governance', icon: Shield, description: 'Tags, personas, purposes, and policies' },
  { id: 'ai', label: 'AI/ML', icon: Bot, description: 'AI models, applications, and ML entities' },
  { id: 'editor', label: 'Query Editor', icon: Terminal, isEditor: true, description: 'Write and execute SQL queries' },
];

/**
 * Default MDLH databases users can query
 * Note: Not all databases have the same tables - users should verify access
 */
export const MDLH_DATABASES = [
  { name: 'FIELD_METADATA', label: 'Field Metadata (atlan.atlan.com)', schema: 'PUBLIC' },
  { name: 'ATLAN_MDLH', label: 'Atlan MDLH', schema: 'PUBLIC' },
  { name: 'MDLH_GOVERNANCE', label: 'MDLH Governance', schema: 'PUBLIC', warning: 'May have different tables' },
  { name: 'MDLH_ATLAN_HOME', label: 'MDLH Atlan Home', schema: 'PUBLIC', warning: 'May have different tables' },
];

/**
 * Schema options for the selected database
 */
export const MDLH_SCHEMAS = ['PUBLIC', 'INFORMATION_SCHEMA'];

/**
 * Column definitions for each entity category tab
 */
export const columns = {
  core: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'notes'],
  glossary: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'qualifiedNamePattern', 'exampleQuery'],
  datamesh: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'qualifiedNamePattern', 'exampleQuery'],
  relational: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'qualifiedNamePattern', 'hierarchy'],
  lineage: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'notes'],
  usage: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'notes'],
  queries: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'hierarchy', 'notes'],
  bi: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'connector', 'hierarchy'],
  dbt: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'qualifiedNamePattern', 'notes'],
  storage: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'connector', 'hierarchy'],
  orchestration: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'connector', 'hierarchy'],
  governance: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'notes'],
  ai: ['entity', 'table', 'description', 'keyAttributes', 'relationships', 'notes'],
};

/**
 * Human-readable column headers
 */
export const colHeaders = {
  entity: 'Entity Type',
  table: 'MDLH Table',
  description: 'Description',
  keyAttributes: 'Key Attributes',
  relationships: 'Relationships',
  qualifiedNamePattern: 'qualifiedName Pattern',
  hierarchy: 'Hierarchy',
  connector: 'Connector',
  notes: 'Notes',
  exampleQuery: 'Example Query',
};

/**
 * Inline select dropdown styles (for consistent appearance)
 */
export const selectDropdownStyles = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
  backgroundSize: '16px',
  paddingRight: '32px'
};

/**
 * Default values for session/state
 */
export const DEFAULT_DATABASE = 'FIELD_METADATA';
export const DEFAULT_SCHEMA = 'PUBLIC';

/**
 * Timeout configuration (centralized to avoid magic numbers)
 * All values in milliseconds unless otherwise noted
 * 
 * IMPORTANT: Frontend timeouts should always exceed backend timeouts by a safe margin
 * to account for network latency and Snowflake's timeout reporting delay.
 * 
 * Formula: Frontend timeout = (Backend timeout * 1000) + QUERY_EXECUTE_BUFFER_MS
 */
export const TIMEOUTS = {
  SESSION_STATUS_MS: 10000,      // Health check for session validity (increased from 5s)
  METADATA_DB_MS: 20000,         // Fetch databases (increased from 15s)
  METADATA_SCHEMAS_MS: 20000,    // Fetch schemas (increased from 15s)
  METADATA_TABLES_MS: 30000,     // Fetch tables (increased from 20s)
  QUERY_EXECUTE_BUFFER_MS: 10000, // Extra padding on top of Snowflake timeout (increased from 5s)
  QUERY_RESULTS_MS: 30000,       // Fetch query results
  QUERY_HISTORY_MS: 10000,       // Fetch query history
  DEBOUNCE_MS: 5000,             // Minimum time between repeated metadata calls
};

/**
 * Query timeout presets for different query types
 * These should be used when building queries to set appropriate timeouts
 */
export const QUERY_TIMEOUT_PRESETS = {
  QUICK: 30,        // Simple queries (SHOW, DESCRIBE, small SELECTs)
  STANDARD: 60,     // Normal queries (most SELECTs)
  EXTENDED: 120,    // Complex queries (JOINs, aggregations)
  LONG_RUNNING: 300, // Very large queries (full table scans, exports)
};

/**
 * Connection behavior thresholds
 */
export const CONNECTION_CONFIG = {
  TIMEOUT_THRESHOLD: 3,          // Consecutive timeouts before marking unreachable
  RETRY_DELAY_MS: 1000,          // Initial retry delay
  MAX_RETRIES: 3,                // Maximum retry attempts
};

