/**
 * Query Recipes - Global Registry for All Multi-Step Wizard Flows
 * 
 * This is the SINGLE SOURCE OF TRUTH for all wizard flows across domains.
 * Each "wizard" is a recipe, not hardcoded JS.
 * 
 * To add a new wizard:
 * 1. Add an entry to QUERY_RECIPES
 * 2. Point steps to existing query templates
 * 3. Define inputBindings and outputBindings
 * 
 * That's it. No new wizard components needed.
 */

/**
 * High-level intent types for categorization and reuse
 */
export const QUERY_INTENTS = {
  LINEAGE: 'LINEAGE',
  PROFILE: 'PROFILE',
  DISCOVERY: 'DISCOVERY',
  QUALITY: 'QUALITY',
  USAGE: 'USAGE',
  GLOSSARY: 'GLOSSARY',
  SCHEMA: 'SCHEMA',
  SAMPLE: 'SAMPLE',
};

/**
 * Generic step kinds – lets the UI adapt copy/hints
 */
export const STEP_KINDS = {
  DISCOVER: 'DISCOVER',
  INSPECT: 'INSPECT',
  SAMPLE: 'SAMPLE',
  BUILD_FINAL: 'BUILD_FINAL',
  SEARCH: 'SEARCH',
  VALIDATE: 'VALIDATE',
};

/**
 * All wizard recipes across all domains.
 * 
 * Each recipe defines:
 * - id: unique identifier
 * - intent: categorization
 * - label: display name
 * - description: what this wizard does
 * - icon: lucide icon name
 * - domains: which tabs/categories this appears in
 * - supportedEntityTypes: which entity types can use this
 * - steps: array of step definitions
 */
export const QUERY_RECIPES = {
  // ============================================
  // CORE DOMAIN - Lineage & Process
  // ============================================
  
  lineage_downstream: {
    id: 'lineage_downstream',
    intent: QUERY_INTENTS.LINEAGE,
    label: 'Trace Downstream Lineage',
    description: 'Step-by-step guide to discover process tables, sample rows, and build a lineage query.',
    icon: 'GitBranch',
    domains: ['Core'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN', 'PROCESS', 'UNKNOWN'],
    defaultInputs: {
      direction: 'DOWNSTREAM',
    },
    
    steps: [
      {
        id: 'discover_process_tables',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'core_show_process_tables',
        title: 'Step 1: Discover Lineage Tables',
        description: 'Find lineage/process tables (PROCESS_*) in this schema.',
        inputBindings: {
          database: 'database',
          schema: 'schema',
        },
        outputBindings: {
          discoveredTables: {
            fromColumn: 'name',
            mode: 'collectArray',
          },
          processTable: {
            fromColumn: 'name',
            mode: 'findFirst',
            match: 'PROCESS_ENTITY',
          },
          hasProcessTable: {
            mode: 'hasRows',
          },
        },
        optional: false,
      },
      
      {
        id: 'examine_structure',
        kind: STEP_KINDS.INSPECT,
        queryId: 'core_describe_process_table',
        title: 'Step 2: Examine Table Structure',
        description: 'See what columns are available in the process table.',
        inputBindings: {
          database: 'database',
          schema: 'schema',
          processTable: 'processTable',
        },
        outputBindings: {
          processColumns: {
            fromColumn: 'column_name',
            mode: 'collectArray',
          },
          hasInputsColumn: {
            fromColumn: 'column_name',
            mode: 'hasValue',
            match: 'INPUTS',
          },
          hasOutputsColumn: {
            fromColumn: 'column_name',
            mode: 'hasValue',
            match: 'OUTPUTS',
          },
        },
        shouldSkip: (inputs) => !inputs.processTable,
        skipMessage: 'No process table found. Check your schema configuration.',
        optional: false,
      },
      
      {
        id: 'sample_data',
        kind: STEP_KINDS.SAMPLE,
        queryId: 'core_sample_process_rows',
        title: 'Step 3: Find Assets to Trace',
        description: 'Sample lineage data and find an asset GUID to trace.',
        inputBindings: {
          database: 'database',
          schema: 'schema',
          processTable: 'processTable',
          entityGuid: 'entityGuid',
        },
        outputBindings: {
          sampleGuids: {
            fromColumnCandidates: ['guid', 'process_guid', 'GUID'],
            mode: 'uniqueArray',
            limit: 20,
          },
          sampleRows: {
            mode: 'rowsSlice',
            limit: 10,
          },
          hasLineageData: {
            mode: 'hasRows',
          },
        },
        optional: true,
      },
      
      {
        id: 'build_lineage_query',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'core_full_lineage_query',
        title: 'Step 4: Trace Lineage',
        description: 'Build the full lineage query to trace dependencies.',
        inputBindings: {
          database: 'database',
          schema: 'schema',
          processTable: 'processTable',
          guid: 'selectedGuid',
          direction: 'direction',
          entityGuid: 'entityGuid',
          entityName: 'entityName',
        },
        outputBindings: {},
        optional: false,
      },
    ],
  },
  
  lineage_upstream: {
    id: 'lineage_upstream',
    intent: QUERY_INTENTS.LINEAGE,
    label: 'Trace Upstream Lineage',
    description: 'Find all upstream sources that feed into an asset.',
    icon: 'ArrowUpRight',
    domains: ['Core'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN', 'PROCESS', 'UNKNOWN'],
    defaultInputs: {
      direction: 'UPSTREAM',
    },
    // Reuse the same steps as downstream, just with different default direction
    steps: [
      {
        id: 'discover_process_tables',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'core_show_process_tables',
        title: 'Step 1: Discover Lineage Tables',
        description: 'Find lineage/process tables (PROCESS_*) in this schema.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          discoveredTables: { fromColumn: 'name', mode: 'collectArray' },
          processTable: { fromColumn: 'name', mode: 'findFirst', match: 'PROCESS_ENTITY' },
          hasProcessTable: { mode: 'hasRows' },
        },
      },
      {
        id: 'sample_data',
        kind: STEP_KINDS.SAMPLE,
        queryId: 'core_sample_process_rows',
        title: 'Step 2: Find Assets to Trace',
        description: 'Sample lineage data and find an asset GUID.',
        inputBindings: { database: 'database', schema: 'schema', processTable: 'processTable' },
        outputBindings: {
          sampleGuids: { fromColumnCandidates: ['guid', 'process_guid'], mode: 'uniqueArray', limit: 20 },
          hasLineageData: { mode: 'hasRows' },
        },
        optional: true,
      },
      {
        id: 'build_lineage_query',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'core_full_lineage_query',
        title: 'Step 3: Trace Upstream',
        description: 'Build the upstream lineage query.',
        inputBindings: { database: 'database', schema: 'schema', processTable: 'processTable', guid: 'selectedGuid', direction: 'direction' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // CORE DOMAIN - Schema Discovery
  // ============================================
  
  schema_discovery: {
    id: 'schema_discovery',
    intent: QUERY_INTENTS.DISCOVERY,
    label: 'Schema Discovery Wizard',
    description: 'Explore available tables, columns, and data types in your schema.',
    icon: 'Database',
    domains: ['Core', 'Relational DB'],
    supportedEntityTypes: ['DATABASE', 'SCHEMA', 'UNKNOWN'],
    
    steps: [
      {
        id: 'list_tables',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'core_show_all_tables',
        title: 'Step 1: List All Tables',
        description: 'Find all tables in the current schema.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          availableTables: { fromColumn: 'name', mode: 'collectArray' },
          tableCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'pick_table',
        kind: STEP_KINDS.INSPECT,
        queryId: 'core_describe_table',
        title: 'Step 2: Examine Table',
        description: 'View columns and data types for a selected table.',
        inputBindings: { database: 'database', schema: 'schema', table: 'selectedTable' },
        outputBindings: {
          columns: { fromColumn: 'column_name', mode: 'collectArray' },
          columnTypes: { fromColumns: ['column_name', 'data_type'], mode: 'objectArray' },
        },
      },
      {
        id: 'sample_table',
        kind: STEP_KINDS.SAMPLE,
        queryId: 'core_sample_table_rows',
        title: 'Step 3: Preview Data',
        description: 'Sample rows from the selected table.',
        inputBindings: { database: 'database', schema: 'schema', table: 'selectedTable' },
        outputBindings: {
          sampleRows: { mode: 'rowsSlice', limit: 20 },
        },
      },
    ],
  },

  // ============================================
  // GLOSSARY DOMAIN
  // ============================================
  
  glossary_search: {
    id: 'glossary_search',
    intent: QUERY_INTENTS.GLOSSARY,
    label: 'Glossary Term Explorer',
    description: 'Search for glossary terms and find linked assets.',
    icon: 'BookOpen',
    domains: ['Glossary'],
    supportedEntityTypes: ['GLOSSARY_TERM', 'UNKNOWN'],
    
    steps: [
      {
        id: 'find_glossary_tables',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'glossary_show_tables',
        title: 'Step 1: Find Glossary Tables',
        description: 'Discover glossary-related tables in your schema.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          glossaryTables: { fromColumn: 'name', mode: 'collectArray' },
          hasGlossary: { mode: 'hasRows' },
        },
      },
      {
        id: 'list_glossaries',
        kind: STEP_KINDS.INSPECT,
        queryId: 'glossary_list_all',
        title: 'Step 2: List Glossaries',
        description: 'View all available glossaries.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          glossaries: { fromColumnCandidates: ['name', 'displayname'], mode: 'uniqueArray' },
          glossaryGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
      {
        id: 'search_terms',
        kind: STEP_KINDS.SEARCH,
        queryId: 'glossary_search_terms',
        title: 'Step 3: Search Terms',
        description: 'Find terms matching your search criteria.',
        inputBindings: { database: 'database', schema: 'schema', searchTerm: 'searchTerm' },
        outputBindings: {
          matchingTerms: { mode: 'rowsSlice', limit: 50 },
          termGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
    ],
  },

  // ============================================
  // DATA QUALITY DOMAIN
  // ============================================
  
  column_profile: {
    id: 'column_profile',
    intent: QUERY_INTENTS.PROFILE,
    label: 'Column Profile Wizard',
    description: 'Analyze column statistics, null rates, and value distributions.',
    icon: 'BarChart2',
    domains: ['Core', 'Data Mesh', 'Governance'],
    supportedEntityTypes: ['COLUMN'],
    
    steps: [
      {
        id: 'basic_stats',
        kind: STEP_KINDS.INSPECT,
        queryId: 'profile_column_stats',
        title: 'Step 1: Basic Statistics',
        description: 'Get count, null rate, distinct values, min/max.',
        inputBindings: { database: 'database', schema: 'schema', table: 'table', column: 'column' },
        outputBindings: {
          totalCount: { fromColumn: 'total_count', mode: 'firstValue' },
          nullCount: { fromColumn: 'null_count', mode: 'firstValue' },
          distinctCount: { fromColumn: 'distinct_count', mode: 'firstValue' },
        },
      },
      {
        id: 'top_values',
        kind: STEP_KINDS.SAMPLE,
        queryId: 'profile_top_values',
        title: 'Step 2: Top Values',
        description: 'See the most common values in this column.',
        inputBindings: { database: 'database', schema: 'schema', table: 'table', column: 'column' },
        outputBindings: {
          topValues: { mode: 'rowsSlice', limit: 20 },
        },
      },
      {
        id: 'sample_values',
        kind: STEP_KINDS.SAMPLE,
        queryId: 'profile_sample_values',
        title: 'Step 3: Sample Values',
        description: 'Preview actual values from the column.',
        inputBindings: { database: 'database', schema: 'schema', table: 'table', column: 'column' },
        outputBindings: {
          sampleValues: { mode: 'rowsSlice', limit: 50 },
        },
      },
    ],
  },

  // ============================================
  // USAGE & POPULARITY
  // ============================================
  
  usage_analysis: {
    id: 'usage_analysis',
    intent: QUERY_INTENTS.USAGE,
    label: 'Usage Analysis Wizard',
    description: 'Analyze query patterns and popularity of assets.',
    icon: 'Activity',
    domains: ['Core', 'Query Org'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'UNKNOWN'],
    
    steps: [
      {
        id: 'find_usage_tables',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'usage_find_tables',
        title: 'Step 1: Find Usage Data',
        description: 'Locate query history and usage tables.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          usageTables: { fromColumn: 'name', mode: 'collectArray' },
          hasUsageData: { mode: 'hasRows' },
        },
      },
      {
        id: 'recent_queries',
        kind: STEP_KINDS.SAMPLE,
        queryId: 'usage_recent_queries',
        title: 'Step 2: Recent Queries',
        description: 'View recent queries that accessed this asset.',
        inputBindings: { database: 'database', schema: 'schema', assetName: 'entityName' },
        outputBindings: {
          recentQueries: { mode: 'rowsSlice', limit: 20 },
          queryCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'popularity_stats',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'usage_popularity',
        title: 'Step 3: Popularity Analysis',
        description: 'Analyze usage patterns and popularity metrics.',
        inputBindings: { database: 'database', schema: 'schema', assetName: 'entityName' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // DBT DOMAIN
  // ============================================
  
  dbt_model_lineage: {
    id: 'dbt_model_lineage',
    intent: QUERY_INTENTS.LINEAGE,
    label: 'dbt Model Lineage',
    description: 'Trace lineage through dbt models and sources.',
    icon: 'Layers',
    domains: ['dbt'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'UNKNOWN'],
    
    steps: [
      {
        id: 'find_dbt_tables',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'dbt_show_tables',
        title: 'Step 1: Find dbt Tables',
        description: 'Discover dbt model and source tables.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          dbtTables: { fromColumn: 'name', mode: 'collectArray' },
          hasDbtData: { mode: 'hasRows' },
        },
      },
      {
        id: 'list_models',
        kind: STEP_KINDS.INSPECT,
        queryId: 'dbt_list_models',
        title: 'Step 2: List Models',
        description: 'View all dbt models in the schema.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          models: { mode: 'rowsSlice', limit: 100 },
          modelGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
      {
        id: 'model_lineage',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'dbt_model_dependencies',
        title: 'Step 3: Model Dependencies',
        description: 'Trace dependencies between dbt models.',
        inputBindings: { database: 'database', schema: 'schema', modelGuid: 'selectedModelGuid' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // BI TOOLS DOMAIN
  // ============================================
  
  bi_dashboard_lineage: {
    id: 'bi_dashboard_lineage',
    intent: QUERY_INTENTS.LINEAGE,
    label: 'Dashboard Lineage',
    description: 'Trace data sources for BI dashboards and reports.',
    icon: 'LayoutDashboard',
    domains: ['BI Tools'],
    supportedEntityTypes: ['DASHBOARD', 'UNKNOWN'],
    
    steps: [
      {
        id: 'find_bi_tables',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'bi_show_tables',
        title: 'Step 1: Find BI Entity Tables',
        description: 'Discover dashboard and report entity tables.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          biTables: { fromColumn: 'name', mode: 'collectArray' },
          hasBiData: { mode: 'hasRows' },
        },
      },
      {
        id: 'list_dashboards',
        kind: STEP_KINDS.INSPECT,
        queryId: 'bi_list_dashboards',
        title: 'Step 2: List Dashboards',
        description: 'View all dashboards in the catalog.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          dashboards: { mode: 'rowsSlice', limit: 50 },
          dashboardGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
      {
        id: 'dashboard_sources',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'bi_dashboard_sources',
        title: 'Step 3: Find Data Sources',
        description: 'Trace which tables feed into this dashboard.',
        inputBindings: { database: 'database', schema: 'schema', dashboardGuid: 'selectedDashboardGuid' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Impact Analysis (Multi-Hop)
  // ============================================
  
  impact_analysis: {
    id: 'impact_analysis',
    intent: QUERY_INTENTS.LINEAGE,
    label: 'Impact Analysis Wizard',
    description: 'Comprehensive multi-hop impact analysis: discover all downstream consumers, dashboards, and data products affected by a change.',
    icon: 'AlertTriangle',
    domains: ['Core', 'Governance', 'Data Mesh'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN', 'UNKNOWN'],
    defaultInputs: {
      maxHops: 3,
    },
    
    steps: [
      {
        id: 'identify_asset',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'impact_find_asset',
        title: 'Step 1: Identify Source Asset',
        description: 'Find the asset you want to analyze for downstream impact.',
        inputBindings: { database: 'database', schema: 'schema', searchTerm: 'searchTerm' },
        outputBindings: {
          matchingAssets: { mode: 'rowsSlice', limit: 20 },
          selectedAssetGuid: { fromColumn: 'guid', mode: 'firstValue' },
          selectedAssetName: { fromColumn: 'name', mode: 'firstValue' },
        },
      },
      {
        id: 'direct_consumers',
        kind: STEP_KINDS.INSPECT,
        queryId: 'impact_direct_downstream',
        title: 'Step 2: Direct Consumers (1-Hop)',
        description: 'Find processes and assets that directly consume this asset.',
        inputBindings: { database: 'database', schema: 'schema', assetGuid: 'selectedAssetGuid' },
        outputBindings: {
          directConsumers: { mode: 'rowsSlice', limit: 50 },
          consumerGuids: { fromColumn: 'consumer_guid', mode: 'collectArray' },
          consumerCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'impacted_dashboards',
        kind: STEP_KINDS.INSPECT,
        queryId: 'impact_find_dashboards',
        title: 'Step 3: Impacted Dashboards',
        description: 'Find BI dashboards and reports that would be affected.',
        inputBindings: { database: 'database', schema: 'schema', assetGuid: 'selectedAssetGuid' },
        outputBindings: {
          impactedDashboards: { mode: 'rowsSlice', limit: 30 },
          dashboardCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'impacted_products',
        kind: STEP_KINDS.INSPECT,
        queryId: 'impact_find_data_products',
        title: 'Step 4: Impacted Data Products',
        description: 'Find data products that include this asset in their contract.',
        inputBindings: { database: 'database', schema: 'schema', assetGuid: 'selectedAssetGuid' },
        outputBindings: {
          impactedProducts: { mode: 'rowsSlice', limit: 20 },
          productCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'full_impact_report',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'impact_full_analysis',
        title: 'Step 5: Full Impact Report',
        description: 'Generate comprehensive impact report with all affected entities.',
        inputBindings: { 
          database: 'database', 
          schema: 'schema', 
          assetGuid: 'selectedAssetGuid',
          assetName: 'selectedAssetName',
          maxHops: 'maxHops'
        },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Data Quality Audit
  // ============================================
  
  data_quality_audit: {
    id: 'data_quality_audit',
    intent: QUERY_INTENTS.QUALITY,
    label: 'Data Quality Audit Wizard',
    description: 'Comprehensive data quality assessment: null rates, freshness, profiling stats, and quality score across tables.',
    icon: 'CheckCircle',
    domains: ['Core', 'Governance', 'Data Mesh'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'SCHEMA', 'UNKNOWN'],
    
    steps: [
      {
        id: 'discover_profiled_tables',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'quality_find_profiled_tables',
        title: 'Step 1: Find Profiled Tables',
        description: 'Discover tables with profiling data available in MDLH.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          profiledTables: { mode: 'rowsSlice', limit: 50 },
          tableGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
      {
        id: 'column_quality_stats',
        kind: STEP_KINDS.INSPECT,
        queryId: 'quality_column_null_rates',
        title: 'Step 2: Column Null Rates',
        description: 'Analyze null percentages across all columns.',
        inputBindings: { database: 'database', schema: 'schema', tableGuid: 'selectedTableGuid' },
        outputBindings: {
          columnStats: { mode: 'rowsSlice', limit: 100 },
          highNullColumns: { fromColumn: 'column_name', mode: 'collectArray', filter: { column: 'null_percent', op: '>', value: 50 } },
        },
      },
      {
        id: 'freshness_check',
        kind: STEP_KINDS.INSPECT,
        queryId: 'quality_freshness_analysis',
        title: 'Step 3: Freshness Analysis',
        description: 'Check data freshness and last update times.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          freshnessData: { mode: 'rowsSlice', limit: 50 },
          staleTables: { fromColumn: 'name', mode: 'collectArray', filter: { column: 'days_stale', op: '>', value: 7 } },
        },
      },
      {
        id: 'documentation_coverage',
        kind: STEP_KINDS.INSPECT,
        queryId: 'quality_documentation_gaps',
        title: 'Step 4: Documentation Gaps',
        description: 'Find tables and columns missing descriptions.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          undocumentedAssets: { mode: 'rowsSlice', limit: 50 },
          docCoveragePercent: { fromColumn: 'coverage_percent', mode: 'firstValue' },
        },
      },
      {
        id: 'quality_scorecard',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'quality_full_scorecard',
        title: 'Step 5: Quality Scorecard',
        description: 'Generate overall data quality scorecard.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Cross-Domain Lineage (Source to BI)
  // ============================================
  
  cross_domain_lineage: {
    id: 'cross_domain_lineage',
    intent: QUERY_INTENTS.LINEAGE,
    label: 'End-to-End Lineage Wizard',
    description: 'Trace data flow from raw source through transformations to final BI consumption.',
    icon: 'Workflow',
    domains: ['Core', 'BI Tools', 'dbt'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'DASHBOARD', 'UNKNOWN'],
    defaultInputs: {
      includeColumnLineage: true,
    },
    
    steps: [
      {
        id: 'find_endpoints',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'crossdomain_find_endpoints',
        title: 'Step 1: Identify Lineage Endpoints',
        description: 'Find your source tables and BI endpoints.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          sourceTables: { mode: 'rowsSlice', limit: 30 },
          biEndpoints: { mode: 'rowsSlice', limit: 30 },
        },
      },
      {
        id: 'trace_through_dbt',
        kind: STEP_KINDS.INSPECT,
        queryId: 'crossdomain_dbt_layer',
        title: 'Step 2: dbt Transformation Layer',
        description: 'Trace lineage through dbt models.',
        inputBindings: { database: 'database', schema: 'schema', sourceGuid: 'selectedSourceGuid' },
        outputBindings: {
          dbtModels: { mode: 'rowsSlice', limit: 50 },
          transformedGuids: { fromColumn: 'output_guid', mode: 'collectArray' },
        },
      },
      {
        id: 'trace_to_bi',
        kind: STEP_KINDS.INSPECT,
        queryId: 'crossdomain_bi_layer',
        title: 'Step 3: BI Consumption Layer',
        description: 'Find dashboards and reports consuming transformed data.',
        inputBindings: { database: 'database', schema: 'schema', transformedGuids: 'transformedGuids' },
        outputBindings: {
          biAssets: { mode: 'rowsSlice', limit: 50 },
          dashboardGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
      {
        id: 'column_level_trace',
        kind: STEP_KINDS.INSPECT,
        queryId: 'crossdomain_column_lineage',
        title: 'Step 4: Column-Level Lineage',
        description: 'Trace specific column flows through the pipeline.',
        inputBindings: { database: 'database', schema: 'schema', sourceGuid: 'selectedSourceGuid' },
        outputBindings: {
          columnFlows: { mode: 'rowsSlice', limit: 100 },
        },
        optional: true,
      },
      {
        id: 'full_lineage_graph',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'crossdomain_full_graph',
        title: 'Step 5: Complete Lineage Graph',
        description: 'Generate full end-to-end lineage visualization data.',
        inputBindings: { 
          database: 'database', 
          schema: 'schema', 
          sourceGuid: 'selectedSourceGuid',
          includeColumnLineage: 'includeColumnLineage'
        },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Governance Compliance Audit
  // ============================================
  
  governance_compliance: {
    id: 'governance_compliance',
    intent: QUERY_INTENTS.QUALITY,
    label: 'Governance Compliance Wizard',
    description: 'Audit assets for governance compliance: ownership, tagging, classification, and policy adherence.',
    icon: 'Shield',
    domains: ['Governance', 'Data Mesh'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'SCHEMA', 'DATABASE', 'UNKNOWN'],
    
    steps: [
      {
        id: 'ownership_audit',
        kind: STEP_KINDS.INSPECT,
        queryId: 'governance_ownership_gaps',
        title: 'Step 1: Ownership Audit',
        description: 'Find assets missing owners or stewards.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          unownedAssets: { mode: 'rowsSlice', limit: 50 },
          ownershipPercent: { fromColumn: 'ownership_percent', mode: 'firstValue' },
        },
      },
      {
        id: 'classification_audit',
        kind: STEP_KINDS.INSPECT,
        queryId: 'governance_classification_gaps',
        title: 'Step 2: Classification Audit',
        description: 'Find assets missing required classifications (PII, Sensitive, etc.).',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          unclassifiedAssets: { mode: 'rowsSlice', limit: 50 },
          classificationPercent: { fromColumn: 'classified_percent', mode: 'firstValue' },
        },
      },
      {
        id: 'pii_exposure_check',
        kind: STEP_KINDS.INSPECT,
        queryId: 'governance_pii_exposure',
        title: 'Step 3: PII Exposure Risk',
        description: 'Identify PII columns exposed without masking policies.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          exposedPii: { mode: 'rowsSlice', limit: 50 },
          piiRiskCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'certification_status',
        kind: STEP_KINDS.INSPECT,
        queryId: 'governance_certification_status',
        title: 'Step 4: Certification Status',
        description: 'Review verification and certification status of critical assets.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          certificationStats: { mode: 'rowsSlice', limit: 20 },
          verifiedPercent: { fromColumn: 'verified_percent', mode: 'firstValue' },
        },
      },
      {
        id: 'compliance_report',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'governance_full_report',
        title: 'Step 5: Compliance Report',
        description: 'Generate full governance compliance report.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Data Product Discovery
  // ============================================
  
  data_product_explorer: {
    id: 'data_product_explorer',
    intent: QUERY_INTENTS.DISCOVERY,
    label: 'Data Product Explorer',
    description: 'Explore data mesh: discover data products, their domains, contracts, and consumers.',
    icon: 'Package',
    domains: ['Data Mesh'],
    supportedEntityTypes: ['DATA_PRODUCT', 'DATA_DOMAIN', 'UNKNOWN'],
    
    steps: [
      {
        id: 'list_domains',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'datamesh_list_domains',
        title: 'Step 1: Discover Domains',
        description: 'List all data domains in your organization.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          domains: { mode: 'rowsSlice', limit: 50 },
          domainGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
      {
        id: 'list_products',
        kind: STEP_KINDS.INSPECT,
        queryId: 'datamesh_list_products',
        title: 'Step 2: Data Products',
        description: 'List data products within selected domain.',
        inputBindings: { database: 'database', schema: 'schema', domainGuid: 'selectedDomainGuid' },
        outputBindings: {
          products: { mode: 'rowsSlice', limit: 50 },
          productGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
      {
        id: 'product_contracts',
        kind: STEP_KINDS.INSPECT,
        queryId: 'datamesh_product_contracts',
        title: 'Step 3: Data Contracts',
        description: 'View data contracts and SLAs for products.',
        inputBindings: { database: 'database', schema: 'schema', productGuid: 'selectedProductGuid' },
        outputBindings: {
          contracts: { mode: 'rowsSlice', limit: 20 },
          contractGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
      {
        id: 'product_consumers',
        kind: STEP_KINDS.INSPECT,
        queryId: 'datamesh_product_consumers',
        title: 'Step 4: Product Consumers',
        description: 'Find who is consuming each data product.',
        inputBindings: { database: 'database', schema: 'schema', productGuid: 'selectedProductGuid' },
        outputBindings: {
          consumers: { mode: 'rowsSlice', limit: 50 },
          consumerCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'product_health',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'datamesh_product_health',
        title: 'Step 5: Product Health Dashboard',
        description: 'View overall health metrics for the data product.',
        inputBindings: { database: 'database', schema: 'schema', productGuid: 'selectedProductGuid' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Orphan Asset Discovery
  // ============================================
  
  orphan_asset_discovery: {
    id: 'orphan_asset_discovery',
    intent: QUERY_INTENTS.QUALITY,
    label: 'Orphan Asset Discovery',
    description: 'Find abandoned assets: no lineage, no owners, no recent usage, no documentation.',
    icon: 'Trash2',
    domains: ['Core', 'Governance'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'SCHEMA', 'UNKNOWN'],
    
    steps: [
      {
        id: 'find_no_lineage',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'orphan_no_lineage',
        title: 'Step 1: Assets Without Lineage',
        description: 'Find tables with no upstream or downstream connections.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          noLineageAssets: { mode: 'rowsSlice', limit: 100 },
          noLineageCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'find_no_usage',
        kind: STEP_KINDS.INSPECT,
        queryId: 'orphan_no_usage',
        title: 'Step 2: Assets Without Recent Usage',
        description: 'Find tables not queried in the last 90 days.',
        inputBindings: { database: 'database', schema: 'schema', daysThreshold: 'daysThreshold' },
        outputBindings: {
          noUsageAssets: { mode: 'rowsSlice', limit: 100 },
          noUsageCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'find_no_owner',
        kind: STEP_KINDS.INSPECT,
        queryId: 'orphan_no_owner',
        title: 'Step 3: Assets Without Owners',
        description: 'Find tables without assigned owners.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          noOwnerAssets: { mode: 'rowsSlice', limit: 100 },
          noOwnerCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'find_no_docs',
        kind: STEP_KINDS.INSPECT,
        queryId: 'orphan_no_documentation',
        title: 'Step 4: Assets Without Documentation',
        description: 'Find tables without descriptions.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          noDocsAssets: { mode: 'rowsSlice', limit: 100 },
          noDocsCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'orphan_candidates',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'orphan_full_report',
        title: 'Step 5: Orphan Candidates Report',
        description: 'Generate report of assets that may be candidates for deprecation.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Tag Propagation Audit
  // ============================================
  
  tag_propagation_audit: {
    id: 'tag_propagation_audit',
    intent: QUERY_INTENTS.QUALITY,
    label: 'Tag Propagation Audit',
    description: 'Trace how classification tags propagate through lineage and identify gaps.',
    icon: 'Tags',
    domains: ['Governance'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN', 'UNKNOWN'],
    
    steps: [
      {
        id: 'list_propagating_tags',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'tagaudit_list_tags',
        title: 'Step 1: List Propagating Tags',
        description: 'Find tags configured to propagate through lineage.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          propagatingTags: { mode: 'rowsSlice', limit: 50 },
          tagNames: { fromColumn: 'tag_name', mode: 'collectArray' },
        },
      },
      {
        id: 'trace_tag_spread',
        kind: STEP_KINDS.INSPECT,
        queryId: 'tagaudit_trace_propagation',
        title: 'Step 2: Trace Tag Propagation',
        description: 'See how a specific tag has spread through lineage.',
        inputBindings: { database: 'database', schema: 'schema', tagName: 'selectedTagName' },
        outputBindings: {
          taggedAssets: { mode: 'rowsSlice', limit: 100 },
          propagationDepth: { fromColumn: 'max_depth', mode: 'firstValue' },
        },
      },
      {
        id: 'find_gaps',
        kind: STEP_KINDS.INSPECT,
        queryId: 'tagaudit_find_gaps',
        title: 'Step 3: Find Propagation Gaps',
        description: 'Find assets in lineage that should have inherited a tag but didn\'t.',
        inputBindings: { database: 'database', schema: 'schema', tagName: 'selectedTagName' },
        outputBindings: {
          missingTagAssets: { mode: 'rowsSlice', limit: 50 },
          gapCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'propagation_report',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'tagaudit_full_report',
        title: 'Step 4: Propagation Report',
        description: 'Generate full tag propagation audit report.',
        inputBindings: { database: 'database', schema: 'schema', tagName: 'selectedTagName' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Cost Attribution Analysis
  // ============================================
  
  cost_attribution: {
    id: 'cost_attribution',
    intent: QUERY_INTENTS.USAGE,
    label: 'Cost Attribution Wizard',
    description: 'Analyze query costs and attribute them to teams, users, and data products.',
    icon: 'DollarSign',
    domains: ['Core', 'Query Org'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'WAREHOUSE', 'UNKNOWN'],
    defaultInputs: {
      daysBack: 30,
    },
    
    steps: [
      {
        id: 'top_cost_tables',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'cost_top_tables',
        title: 'Step 1: Highest Cost Tables',
        description: 'Find tables with highest query costs.',
        inputBindings: { database: 'database', schema: 'schema', daysBack: 'daysBack' },
        outputBindings: {
          costlyTables: { mode: 'rowsSlice', limit: 30 },
          totalCost: { fromColumn: 'total_cost', mode: 'sum' },
        },
      },
      {
        id: 'cost_by_user',
        kind: STEP_KINDS.INSPECT,
        queryId: 'cost_by_user',
        title: 'Step 2: Cost by User',
        description: 'Attribute query costs to individual users.',
        inputBindings: { database: 'database', schema: 'schema', daysBack: 'daysBack' },
        outputBindings: {
          userCosts: { mode: 'rowsSlice', limit: 50 },
          topUsers: { fromColumn: 'username', mode: 'collectArray', limit: 10 },
        },
      },
      {
        id: 'cost_by_team',
        kind: STEP_KINDS.INSPECT,
        queryId: 'cost_by_team',
        title: 'Step 3: Cost by Team/Domain',
        description: 'Attribute costs to teams based on ownership.',
        inputBindings: { database: 'database', schema: 'schema', daysBack: 'daysBack' },
        outputBindings: {
          teamCosts: { mode: 'rowsSlice', limit: 30 },
        },
      },
      {
        id: 'expensive_queries',
        kind: STEP_KINDS.INSPECT,
        queryId: 'cost_expensive_queries',
        title: 'Step 4: Most Expensive Queries',
        description: 'Identify individual queries with highest cost.',
        inputBindings: { database: 'database', schema: 'schema', daysBack: 'daysBack' },
        outputBindings: {
          expensiveQueries: { mode: 'rowsSlice', limit: 20 },
        },
      },
      {
        id: 'cost_attribution_report',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'cost_full_report',
        title: 'Step 5: Cost Attribution Report',
        description: 'Generate comprehensive cost attribution report.',
        inputBindings: { database: 'database', schema: 'schema', daysBack: 'daysBack' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Pipeline Freshness Monitor
  // ============================================
  
  pipeline_freshness: {
    id: 'pipeline_freshness',
    intent: QUERY_INTENTS.QUALITY,
    label: 'Pipeline Freshness Monitor',
    description: 'Monitor data freshness across your entire pipeline from sources to consumption.',
    icon: 'Clock',
    domains: ['Core', 'Orchestration'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'UNKNOWN'],
    defaultInputs: {
      freshnessThresholdHours: 24,
    },
    
    steps: [
      {
        id: 'check_sources',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'freshness_source_tables',
        title: 'Step 1: Source Table Freshness',
        description: 'Check freshness of source/landing tables.',
        inputBindings: { database: 'database', schema: 'schema', thresholdHours: 'freshnessThresholdHours' },
        outputBindings: {
          staleSources: { mode: 'rowsSlice', limit: 50 },
          staleSourceCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'check_transforms',
        kind: STEP_KINDS.INSPECT,
        queryId: 'freshness_transform_tables',
        title: 'Step 2: Transform Layer Freshness',
        description: 'Check freshness of staging/transform tables.',
        inputBindings: { database: 'database', schema: 'schema', thresholdHours: 'freshnessThresholdHours' },
        outputBindings: {
          staleTransforms: { mode: 'rowsSlice', limit: 50 },
          staleTransformCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'check_marts',
        kind: STEP_KINDS.INSPECT,
        queryId: 'freshness_mart_tables',
        title: 'Step 3: Data Mart Freshness',
        description: 'Check freshness of analytics/mart tables.',
        inputBindings: { database: 'database', schema: 'schema', thresholdHours: 'freshnessThresholdHours' },
        outputBindings: {
          staleMarts: { mode: 'rowsSlice', limit: 50 },
          staleMartCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'trace_stale_pipeline',
        kind: STEP_KINDS.INSPECT,
        queryId: 'freshness_trace_stale',
        title: 'Step 4: Trace Stale Pipelines',
        description: 'Find root cause of stale data by tracing lineage.',
        inputBindings: { database: 'database', schema: 'schema' },
        outputBindings: {
          stalePipelines: { mode: 'rowsSlice', limit: 30 },
        },
      },
      {
        id: 'freshness_dashboard',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'freshness_full_dashboard',
        title: 'Step 5: Freshness Dashboard',
        description: 'Generate pipeline freshness monitoring dashboard.',
        inputBindings: { database: 'database', schema: 'schema', thresholdHours: 'freshnessThresholdHours' },
        outputBindings: {},
      },
    ],
  },

  // ============================================
  // ADVANCED: Schema Change Impact
  // ============================================
  
  schema_change_impact: {
    id: 'schema_change_impact',
    intent: QUERY_INTENTS.LINEAGE,
    label: 'Schema Change Impact',
    description: 'Assess impact of schema changes: find all downstream dependencies that would break.',
    icon: 'GitMerge',
    domains: ['Core', 'Governance'],
    supportedEntityTypes: ['TABLE', 'VIEW', 'COLUMN', 'UNKNOWN'],
    
    steps: [
      {
        id: 'select_table',
        kind: STEP_KINDS.DISCOVER,
        queryId: 'schemachange_list_tables',
        title: 'Step 1: Select Table to Modify',
        description: 'Choose the table you plan to change.',
        inputBindings: { database: 'database', schema: 'schema', searchTerm: 'searchTerm' },
        outputBindings: {
          tables: { mode: 'rowsSlice', limit: 50 },
          selectedTableGuid: { fromColumn: 'guid', mode: 'firstValue' },
        },
      },
      {
        id: 'list_columns',
        kind: STEP_KINDS.INSPECT,
        queryId: 'schemachange_list_columns',
        title: 'Step 2: Select Columns to Change',
        description: 'Choose specific columns you plan to modify or remove.',
        inputBindings: { database: 'database', schema: 'schema', tableGuid: 'selectedTableGuid' },
        outputBindings: {
          columns: { mode: 'rowsSlice', limit: 100 },
          columnGuids: { fromColumn: 'guid', mode: 'collectArray' },
        },
      },
      {
        id: 'find_column_consumers',
        kind: STEP_KINDS.INSPECT,
        queryId: 'schemachange_column_consumers',
        title: 'Step 3: Find Column Consumers',
        description: 'Find all processes and assets that use these columns.',
        inputBindings: { database: 'database', schema: 'schema', columnGuids: 'selectedColumnGuids' },
        outputBindings: {
          columnConsumers: { mode: 'rowsSlice', limit: 100 },
          consumerCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'find_bi_impact',
        kind: STEP_KINDS.INSPECT,
        queryId: 'schemachange_bi_impact',
        title: 'Step 4: BI Report Impact',
        description: 'Find dashboards and reports that would break.',
        inputBindings: { database: 'database', schema: 'schema', columnGuids: 'selectedColumnGuids' },
        outputBindings: {
          impactedReports: { mode: 'rowsSlice', limit: 50 },
          reportCount: { mode: 'rowCount' },
        },
      },
      {
        id: 'impact_summary',
        kind: STEP_KINDS.BUILD_FINAL,
        queryId: 'schemachange_impact_summary',
        title: 'Step 5: Impact Summary',
        description: 'Generate full schema change impact report.',
        inputBindings: { database: 'database', schema: 'schema', tableGuid: 'selectedTableGuid', columnGuids: 'selectedColumnGuids' },
        outputBindings: {},
      },
    ],
  },
};

/**
 * Get recipes for a specific domain
 */
export function getRecipesForDomain(domain) {
  return Object.values(QUERY_RECIPES).filter(r => 
    r.domains?.includes(domain)
  );
}

/**
 * Get recipes for a specific entity type
 */
export function getRecipesForEntityType(entityType) {
  return Object.values(QUERY_RECIPES).filter(r =>
    !r.supportedEntityTypes ||
    r.supportedEntityTypes.includes(entityType) ||
    r.supportedEntityTypes.includes('UNKNOWN')
  );
}

/**
 * Get a recipe by ID
 */
export function getRecipe(recipeId) {
  return QUERY_RECIPES[recipeId] || null;
}

export default QUERY_RECIPES;

