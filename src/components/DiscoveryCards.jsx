import React, { useState, useMemo } from 'react';
import { Search, Table2, GitBranch, FileText, Users, BarChart3, Database, Code2, ChevronRight, Sparkles, BookOpen, Filter, Tag, Clock, ShieldCheck, Zap, ArrowRight, AlertTriangle, Link2, Layers, Eye, MessageSquare, Lock, Activity, Workflow, Box } from 'lucide-react';

// Discovery question cards - organized by what users want to know
const DISCOVERY_QUESTIONS = [
  // ============ DATA DISCOVERY ============
  {
    id: 'find-tables',
    question: 'What tables exist in my data catalog?',
    icon: Table2,
    category: 'discovery',
    difficulty: 'beginner',
    queries: [
      { id: 'all-tables', label: 'List all tables', sql: 'SELECT NAME, SCHEMANAME, DATABASENAME, COLUMNCOUNT FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY LIMIT 100;' },
      { id: 'popular-tables', label: 'Most popular tables', sql: 'SELECT NAME, SCHEMANAME, POPULARITYSCORE, QUERYCOUNT FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY ORDER BY POPULARITYSCORE DESC NULLS LAST LIMIT 20;' },
      { id: 'recent-tables', label: 'Recently updated tables', sql: 'SELECT NAME, SCHEMANAME, TO_TIMESTAMP(UPDATETIME/1000) as UPDATED FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY ORDER BY UPDATETIME DESC LIMIT 20;' }
    ],
    tips: ['Tables are stored in TABLE_ENTITY', 'Use POPULARITYSCORE to find frequently-used tables']
  },
  {
    id: 'find-columns',
    question: 'What columns are in a specific table?',
    icon: FileText,
    category: 'discovery',
    difficulty: 'beginner',
    queries: [
      { id: 'columns-by-table', label: 'Columns in a table', sql: 'SELECT NAME, DATATYPE, ISNULLABLE, TABLENAME FROM {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY WHERE TABLENAME ILIKE \'%your_table%\' LIMIT 50;' },
      { id: 'columns-search', label: 'Search columns by name', sql: 'SELECT NAME, TABLENAME, DATATYPE FROM {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY WHERE NAME ILIKE \'%search_term%\' LIMIT 50;' }
    ],
    tips: ['Columns reference their parent TABLE via TABLENAME', 'Use ILIKE for case-insensitive search']
  },
  {
    id: 'find-databases',
    question: 'What databases and schemas exist?',
    icon: Database,
    category: 'discovery',
    difficulty: 'beginner',
    queries: [
      { id: 'all-databases', label: 'List all databases', sql: 'SELECT DISTINCT DATABASENAME, COUNT(*) as TABLE_COUNT FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY GROUP BY DATABASENAME ORDER BY TABLE_COUNT DESC;' },
      { id: 'all-schemas', label: 'List all schemas', sql: 'SELECT DISTINCT SCHEMANAME, DATABASENAME, COUNT(*) as TABLE_COUNT FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY GROUP BY SCHEMANAME, DATABASENAME ORDER BY TABLE_COUNT DESC;' },
      { id: 'schema-details', label: 'Schema with most tables', sql: 'SELECT SCHEMANAME, DATABASENAME, COUNT(*) as TABLE_COUNT, SUM(COLUMNCOUNT) as TOTAL_COLUMNS FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY GROUP BY SCHEMANAME, DATABASENAME ORDER BY TABLE_COUNT DESC LIMIT 20;' }
    ],
    tips: ['GROUP BY aggregates help understand your data landscape', 'Large schemas may indicate core data areas']
  },
  {
    id: 'search-assets',
    question: 'How do I search for specific assets?',
    icon: Search,
    category: 'discovery',
    difficulty: 'beginner',
    queries: [
      { id: 'search-by-name', label: 'Search tables by name', sql: 'SELECT NAME, TYPENAME, SCHEMANAME, DATABASENAME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE NAME ILIKE \'%customer%\' LIMIT 30;' },
      { id: 'search-by-description', label: 'Search by description', sql: 'SELECT NAME, USERDESCRIPTION, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE USERDESCRIPTION ILIKE \'%revenue%\' LIMIT 30;' },
      { id: 'search-qualified-name', label: 'Find by qualified name', sql: 'SELECT NAME, QUALIFIEDNAME, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE QUALIFIEDNAME ILIKE \'%sales%\' LIMIT 30;' }
    ],
    tips: ['ILIKE performs case-insensitive search', 'QUALIFIEDNAME contains the full path to the asset']
  },

  // ============ LINEAGE ============
  {
    id: 'data-lineage',
    question: 'Where does my data come from?',
    icon: GitBranch,
    category: 'lineage',
    difficulty: 'intermediate',
    queries: [
      { id: 'process-lineage', label: 'Process/ETL lineage', sql: 'SELECT NAME, TYPENAME, INPUTS::STRING as INPUTS, OUTPUTS::STRING as OUTPUTS FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY LIMIT 20;' },
      { id: 'lineage-by-table', label: 'Lineage for a table', sql: 'SELECT NAME, INPUTS::STRING, OUTPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE OUTPUTS::STRING ILIKE \'%your_table%\' LIMIT 20;' }
    ],
    tips: ['INPUTS and OUTPUTS are ARRAY columns - cast to STRING for searching', 'Process entities capture ETL and transformation lineage']
  },
  {
    id: 'downstream-impact',
    question: 'What would break if I change this table?',
    icon: AlertTriangle,
    category: 'lineage',
    difficulty: 'intermediate',
    queries: [
      { id: 'downstream-tables', label: 'Downstream dependencies', sql: 'SELECT NAME, TYPENAME, OUTPUTS::STRING as AFFECTED_TABLES FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE INPUTS::STRING ILIKE \'%your_table_guid%\' LIMIT 30;' },
      { id: 'count-downstream', label: 'Count downstream assets', sql: 'SELECT COUNT(DISTINCT p.NAME) as DOWNSTREAM_COUNT FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY p WHERE p.INPUTS::STRING ILIKE \'%your_table_guid%\';' },
      { id: 'impact-chain', label: 'Multi-hop impact analysis', sql: 'WITH downstream AS (SELECT NAME, OUTPUTS FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE INPUTS::STRING ILIKE \'%your_table%\') SELECT * FROM downstream LIMIT 20;' }
    ],
    tips: ['Impact analysis helps prevent breaking changes', 'Check OUTPUTS to see what depends on your source']
  },
  {
    id: 'etl-jobs',
    question: 'What ETL jobs transform my data?',
    icon: Workflow,
    category: 'lineage',
    difficulty: 'intermediate',
    queries: [
      { id: 'all-processes', label: 'All ETL processes', sql: 'SELECT NAME, TYPENAME, CREATETIME, INPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY ORDER BY CREATETIME DESC LIMIT 30;' },
      { id: 'dbt-models', label: 'dbt models', sql: 'SELECT NAME, TYPENAME, INPUTS::STRING, OUTPUTS::STRING FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE TYPENAME ILIKE \'%dbt%\' LIMIT 30;' },
      { id: 'airflow-tasks', label: 'Airflow tasks', sql: 'SELECT NAME, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.PROCESS_ENTITY WHERE TYPENAME ILIKE \'%airflow%\' LIMIT 30;' }
    ],
    tips: ['Process entities track ETL jobs, dbt models, and transformations', 'TYPENAME indicates the tool/platform']
  },

  // ============ GOVERNANCE ============
  {
    id: 'data-owners',
    question: 'Who owns this data?',
    icon: Users,
    category: 'governance',
    difficulty: 'beginner',
    queries: [
      { id: 'table-owners', label: 'Table owners', sql: 'SELECT NAME, OWNERUSERS, OWNERGROUPS, CERTIFICATESTATUSMESSAGE FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE OWNERUSERS IS NOT NULL LIMIT 30;' },
      { id: 'certified-assets', label: 'Certified assets', sql: 'SELECT NAME, TYPENAME, CERTIFICATESTATUSMESSAGE, OWNERUSERS FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE CERTIFICATESTATUSMESSAGE = \'VERIFIED\' LIMIT 30;' }
    ],
    tips: ['OWNERUSERS contains user identifiers', 'CERTIFICATESTATUSMESSAGE indicates certification status']
  },
  {
    id: 'data-domains',
    question: 'How is data organized by domain?',
    icon: Tag,
    category: 'governance',
    difficulty: 'intermediate',
    queries: [
      { id: 'all-domains', label: 'All data domains', sql: 'SELECT NAME, USERDESCRIPTION, PARENTDOMAINQUALIFIEDNAME FROM {{DATABASE}}.{{SCHEMA}}.DATADOMAIN_ENTITY LIMIT 50;' },
      { id: 'domain-products', label: 'Data products by domain', sql: 'SELECT NAME, DATAPRODUCTSTATUS, DATADOMAINQUALIFIEDNAMES FROM {{DATABASE}}.{{SCHEMA}}.DATAPRODUCT_ENTITY LIMIT 30;' }
    ],
    tips: ['Data domains organize assets by business area', 'Data products are publishable collections of assets']
  },
  {
    id: 'unowned-assets',
    question: 'What data has no owner assigned?',
    icon: AlertTriangle,
    category: 'governance',
    difficulty: 'beginner',
    queries: [
      { id: 'tables-no-owner', label: 'Tables without owners', sql: 'SELECT NAME, SCHEMANAME, DATABASENAME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE (OWNERUSERS IS NULL OR OWNERUSERS = \'[]\') AND (OWNERGROUPS IS NULL OR OWNERGROUPS = \'[]\') LIMIT 50;' },
      { id: 'high-usage-no-owner', label: 'Popular tables without owners', sql: 'SELECT NAME, POPULARITYSCORE, QUERYCOUNT FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE (OWNERUSERS IS NULL OR OWNERUSERS = \'[]\') AND POPULARITYSCORE > 0 ORDER BY POPULARITYSCORE DESC LIMIT 30;' }
    ],
    tips: ['Unowned high-traffic tables are governance risks', 'Prioritize assigning owners to popular assets']
  },
  {
    id: 'pii-sensitive',
    question: 'What data might contain PII/sensitive info?',
    icon: Lock,
    category: 'governance',
    difficulty: 'intermediate',
    queries: [
      { id: 'pii-columns', label: 'Columns with PII patterns', sql: 'SELECT NAME, TABLENAME, DATATYPE FROM {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY WHERE NAME ILIKE \'%email%\' OR NAME ILIKE \'%phone%\' OR NAME ILIKE \'%ssn%\' OR NAME ILIKE \'%address%\' LIMIT 50;' },
      { id: 'classified-assets', label: 'Assets with classifications', sql: 'SELECT NAME, TYPENAME, CLASSIFICATIONNAMES FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE CLASSIFICATIONNAMES IS NOT NULL AND CLASSIFICATIONNAMES != \'[]\' LIMIT 30;' },
      { id: 'personal-data-tables', label: 'Tables with personal data', sql: 'SELECT DISTINCT t.NAME, t.SCHEMANAME FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY t JOIN {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY c ON c.TABLENAME = t.NAME WHERE c.NAME ILIKE ANY (\'%email%\', \'%name%\', \'%phone%\') LIMIT 30;' }
    ],
    tips: ['Column naming patterns can indicate sensitive data', 'CLASSIFICATIONNAMES contains applied data classifications']
  },

  // ============ DATA QUALITY ============
  {
    id: 'data-quality',
    question: 'How fresh is my data?',
    icon: Clock,
    category: 'quality',
    difficulty: 'intermediate',
    queries: [
      { id: 'stale-tables', label: 'Stale tables (>30 days)', sql: 'SELECT NAME, TO_TIMESTAMP(UPDATETIME/1000) as LAST_UPDATE, DATEDIFF(\'day\', TO_TIMESTAMP(UPDATETIME/1000), CURRENT_TIMESTAMP()) as DAYS_STALE FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE UPDATETIME < DATEADD(\'day\', -30, CURRENT_TIMESTAMP()) * 1000 ORDER BY UPDATETIME ASC LIMIT 20;' },
      { id: 'recent-updates', label: 'Recently updated', sql: 'SELECT NAME, TO_TIMESTAMP(UPDATETIME/1000) as LAST_UPDATE FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY ORDER BY UPDATETIME DESC LIMIT 20;' }
    ],
    tips: ['UPDATETIME is in milliseconds - divide by 1000 for timestamp', 'Use DATEDIFF to calculate data freshness']
  },
  {
    id: 'documentation-gaps',
    question: 'What data is missing documentation?',
    icon: MessageSquare,
    category: 'quality',
    difficulty: 'beginner',
    queries: [
      { id: 'no-description-tables', label: 'Tables without descriptions', sql: 'SELECT NAME, SCHEMANAME, POPULARITYSCORE FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE (USERDESCRIPTION IS NULL OR USERDESCRIPTION = \'\') ORDER BY POPULARITYSCORE DESC NULLS LAST LIMIT 30;' },
      { id: 'no-description-columns', label: 'Columns without descriptions', sql: 'SELECT NAME, TABLENAME FROM {{DATABASE}}.{{SCHEMA}}.COLUMN_ENTITY WHERE (DESCRIPTION IS NULL OR DESCRIPTION = \'\') LIMIT 50;' },
      { id: 'documentation-coverage', label: 'Documentation coverage %', sql: 'SELECT COUNT(CASE WHEN USERDESCRIPTION IS NOT NULL AND USERDESCRIPTION != \'\' THEN 1 END) * 100.0 / COUNT(*) as DOCUMENTED_PCT, COUNT(*) as TOTAL FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY;' }
    ],
    tips: ['Prioritize documenting popular tables first', 'Good documentation improves data discoverability']
  },
  {
    id: 'empty-tables',
    question: 'Are there any empty or unused tables?',
    icon: Box,
    category: 'quality',
    difficulty: 'beginner',
    queries: [
      { id: 'zero-rows', label: 'Tables with 0 rows', sql: 'SELECT NAME, SCHEMANAME, ROWCOUNT FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE ROWCOUNT = 0 OR ROWCOUNT IS NULL LIMIT 30;' },
      { id: 'never-queried', label: 'Tables never queried', sql: 'SELECT NAME, SCHEMANAME, TO_TIMESTAMP(CREATETIME/1000) as CREATED FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE (QUERYCOUNT IS NULL OR QUERYCOUNT = 0) ORDER BY CREATETIME ASC LIMIT 30;' },
      { id: 'old-unused', label: 'Old tables never used', sql: 'SELECT NAME, SCHEMANAME, TO_TIMESTAMP(CREATETIME/1000) as CREATED FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE (QUERYCOUNT IS NULL OR QUERYCOUNT = 0) AND CREATETIME < DATEADD(\'month\', -6, CURRENT_TIMESTAMP()) * 1000 LIMIT 30;' }
    ],
    tips: ['Empty tables may be deprecated or misconfigured', 'Old unused tables are candidates for cleanup']
  },

  // ============ USAGE & ANALYTICS ============
  {
    id: 'usage-metrics',
    question: 'Which data is most used?',
    icon: BarChart3,
    category: 'usage',
    difficulty: 'beginner',
    queries: [
      { id: 'top-queried', label: 'Most queried tables', sql: 'SELECT NAME, QUERYCOUNT, POPULARITYSCORE FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY ORDER BY QUERYCOUNT DESC NULLS LAST LIMIT 20;' },
      { id: 'usage-over-time', label: 'Usage patterns', sql: 'SELECT NAME, QUERYCOUNT, POPULARITYSCORE, TO_TIMESTAMP(UPDATETIME/1000) as LAST_UPDATED FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE QUERYCOUNT > 0 ORDER BY POPULARITYSCORE DESC LIMIT 30;' }
    ],
    tips: ['QUERYCOUNT tracks how often tables are queried', 'POPULARITYSCORE is computed by Atlan based on usage']
  },
  {
    id: 'user-activity',
    question: 'Who is using the data most?',
    icon: Activity,
    category: 'usage',
    difficulty: 'intermediate',
    queries: [
      { id: 'active-users', label: 'Most active data users', sql: 'SELECT OWNERUSERS, COUNT(*) as OWNED_ASSETS FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE OWNERUSERS IS NOT NULL GROUP BY OWNERUSERS ORDER BY OWNED_ASSETS DESC LIMIT 20;' },
      { id: 'recent-modifications', label: 'Recent modifications by user', sql: 'SELECT NAME, UPDATEDBY, TO_TIMESTAMP(UPDATETIME/1000) as UPDATED FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE UPDATEDBY IS NOT NULL ORDER BY UPDATETIME DESC LIMIT 30;' }
    ],
    tips: ['Track ownership patterns across your org', 'UPDATEDBY shows who made recent changes']
  },
  {
    id: 'trending-data',
    question: 'What data is trending up in usage?',
    icon: Zap,
    category: 'usage',
    difficulty: 'intermediate',
    queries: [
      { id: 'high-growth', label: 'High growth tables', sql: 'SELECT NAME, POPULARITYSCORE, QUERYCOUNT, ROWCOUNT FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE POPULARITYSCORE > 50 ORDER BY POPULARITYSCORE DESC LIMIT 20;' },
      { id: 'newly-popular', label: 'Recently created & popular', sql: 'SELECT NAME, POPULARITYSCORE, TO_TIMESTAMP(CREATETIME/1000) as CREATED FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE CREATETIME > DATEADD(\'month\', -3, CURRENT_TIMESTAMP()) * 1000 AND POPULARITYSCORE > 0 ORDER BY POPULARITYSCORE DESC LIMIT 20;' }
    ],
    tips: ['New tables with high popularity indicate emerging use cases', 'Monitor trending data for capacity planning']
  },

  // ============ GLOSSARY ============
  {
    id: 'glossary-terms',
    question: 'What business terms are defined?',
    icon: BookOpen,
    category: 'glossary',
    difficulty: 'beginner',
    queries: [
      { id: 'all-terms', label: 'All glossary terms', sql: 'SELECT NAME, USERDESCRIPTION, ANCHOR FROM {{DATABASE}}.{{SCHEMA}}.ATLASGLOSSARYTERM_ENTITY LIMIT 50;' },
      { id: 'term-search', label: 'Search terms', sql: 'SELECT NAME, USERDESCRIPTION FROM {{DATABASE}}.{{SCHEMA}}.ATLASGLOSSARYTERM_ENTITY WHERE NAME ILIKE \'%search%\' OR USERDESCRIPTION ILIKE \'%search%\' LIMIT 30;' }
    ],
    tips: ['ANCHOR links terms to their glossary', 'Business terms help standardize data vocabulary']
  },
  {
    id: 'term-usage',
    question: 'Which business terms are linked to data?',
    icon: Link2,
    category: 'glossary',
    difficulty: 'intermediate',
    queries: [
      { id: 'linked-terms', label: 'Terms with linked assets', sql: 'SELECT NAME, USERDESCRIPTION, ASSIGNEDENTITIES FROM {{DATABASE}}.{{SCHEMA}}.ATLASGLOSSARYTERM_ENTITY WHERE ASSIGNEDENTITIES IS NOT NULL LIMIT 30;' },
      { id: 'unlinked-terms', label: 'Terms without linked assets', sql: 'SELECT NAME, USERDESCRIPTION FROM {{DATABASE}}.{{SCHEMA}}.ATLASGLOSSARYTERM_ENTITY WHERE ASSIGNEDENTITIES IS NULL OR ASSIGNEDENTITIES = \'[]\' LIMIT 30;' },
      { id: 'tables-with-terms', label: 'Tables linked to terms', sql: 'SELECT NAME, MEANINGS FROM {{DATABASE}}.{{SCHEMA}}.TABLE_ENTITY WHERE MEANINGS IS NOT NULL AND MEANINGS != \'[]\' LIMIT 30;' }
    ],
    tips: ['Linking terms to assets improves discoverability', 'MEANINGS on tables shows linked business terms']
  },
  {
    id: 'glossary-categories',
    question: 'How are glossary terms organized?',
    icon: Layers,
    category: 'glossary',
    difficulty: 'beginner',
    queries: [
      { id: 'glossaries', label: 'All glossaries', sql: 'SELECT NAME, USERDESCRIPTION FROM {{DATABASE}}.{{SCHEMA}}.ATLASGLOSSARY_ENTITY LIMIT 20;' },
      { id: 'categories', label: 'Glossary categories', sql: 'SELECT NAME, USERDESCRIPTION, ANCHOR FROM {{DATABASE}}.{{SCHEMA}}.ATLASGLOSSARYCATEGORY_ENTITY LIMIT 30;' },
      { id: 'terms-per-glossary', label: 'Terms count per glossary', sql: 'SELECT ANCHOR:displayText::STRING as GLOSSARY, COUNT(*) as TERM_COUNT FROM {{DATABASE}}.{{SCHEMA}}.ATLASGLOSSARYTERM_ENTITY GROUP BY ANCHOR:displayText::STRING ORDER BY TERM_COUNT DESC;' }
    ],
    tips: ['Glossaries contain terms and categories', 'Categories help organize related terms']
  },

  // ============ BI & REPORTING ============
  {
    id: 'bi-dashboards',
    question: 'What dashboards use my data?',
    icon: Eye,
    category: 'bi',
    difficulty: 'intermediate',
    queries: [
      { id: 'tableau-dashboards', label: 'Tableau dashboards', sql: 'SELECT NAME, TYPENAME, SITENAME FROM {{DATABASE}}.{{SCHEMA}}.TABLEAUDASHBOARD_ENTITY LIMIT 30;' },
      { id: 'looker-dashboards', label: 'Looker dashboards', sql: 'SELECT NAME, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.LOOKERDASHBOARD_ENTITY LIMIT 30;' },
      { id: 'powerbi-reports', label: 'Power BI reports', sql: 'SELECT NAME, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.POWERBIREPORT_ENTITY LIMIT 30;' }
    ],
    tips: ['BI assets track Tableau, Looker, Power BI connections', 'Check lineage to see which tables feed dashboards']
  },
  {
    id: 'dashboard-popularity',
    question: 'Which dashboards are most viewed?',
    icon: BarChart3,
    category: 'bi',
    difficulty: 'intermediate',
    queries: [
      { id: 'popular-dashboards', label: 'Most viewed dashboards', sql: 'SELECT NAME, TYPENAME, POPULARITYSCORE FROM {{DATABASE}}.{{SCHEMA}}.TABLEAUDASHBOARD_ENTITY ORDER BY POPULARITYSCORE DESC NULLS LAST LIMIT 20;' },
      { id: 'dashboard-owners', label: 'Dashboard owners', sql: 'SELECT NAME, OWNERUSERS, TYPENAME FROM {{DATABASE}}.{{SCHEMA}}.TABLEAUDASHBOARD_ENTITY WHERE OWNERUSERS IS NOT NULL LIMIT 30;' }
    ],
    tips: ['BI popularity helps identify critical reports', 'Coordinate changes with dashboard owners']
  }
];

// Category metadata
const CATEGORIES = [
  { id: 'all', label: 'All Questions', icon: Sparkles },
  { id: 'discovery', label: 'Data Discovery', icon: Search },
  { id: 'lineage', label: 'Lineage', icon: GitBranch },
  { id: 'governance', label: 'Governance', icon: ShieldCheck },
  { id: 'quality', label: 'Data Quality', icon: Clock },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
  { id: 'glossary', label: 'Glossary', icon: BookOpen },
  { id: 'bi', label: 'BI & Dashboards', icon: Eye }
];

// Map sidebar categories to discovery card categories
// Sidebar categories may map to multiple discovery categories
const SIDEBAR_TO_DISCOVERY_MAP = {
  core: ['discovery'],
  glossary: ['glossary'],
  datamesh: ['governance'],
  relational: ['discovery'],
  lineage: ['lineage'],
  usage: ['usage'],
  queries: ['usage', 'discovery'],
  bi: ['bi'],
  dbt: ['lineage'],
  storage: ['discovery'],
  orchestration: ['lineage'],
  governance: ['governance', 'quality'],
  ai: ['discovery', 'usage']
};

// Category info for landing pages
const CATEGORY_INFO = {
  core: {
    title: 'Core Metadata',
    description: 'Explore tables, columns, schemas, and database structure in your MDLH.',
    icon: Database
  },
  glossary: {
    title: 'Business Glossary',
    description: 'Terms, definitions, and semantic context for your data assets.',
    icon: BookOpen
  },
  datamesh: {
    title: 'Data Mesh',
    description: 'Data domains, products, and organizational data ownership.',
    icon: Tag
  },
  relational: {
    title: 'Relational Data',
    description: 'Tables, views, and their relationships in your data warehouse.',
    icon: Table2
  },
  lineage: {
    title: 'Data Lineage',
    description: 'Trace data flow from sources through transformations to destinations.',
    icon: GitBranch
  },
  usage: {
    title: 'Usage Analytics',
    description: 'Query patterns, popularity metrics, and data consumption trends.',
    icon: BarChart3
  },
  queries: {
    title: 'Query Patterns',
    description: 'Historical queries, execution patterns, and query optimization.',
    icon: Code2
  },
  bi: {
    title: 'BI & Dashboards',
    description: 'Tableau, Looker, and Power BI assets connected to your data.',
    icon: Eye
  },
  dbt: {
    title: 'dbt Models',
    description: 'dbt transformations, tests, and documentation.',
    icon: Workflow
  },
  storage: {
    title: 'Storage',
    description: 'S3, GCS, and other storage assets in your catalog.',
    icon: Database
  },
  orchestration: {
    title: 'Orchestration',
    description: 'Airflow DAGs, scheduled jobs, and workflow automation.',
    icon: Workflow
  },
  governance: {
    title: 'Governance',
    description: 'Data ownership, classifications, and compliance tracking.',
    icon: ShieldCheck
  },
  ai: {
    title: 'AI & ML',
    description: 'ML models, feature stores, and AI-related assets.',
    icon: Sparkles
  }
};

// Difficulty badge component
function DifficultyBadge({ level }) {
  const styles = {
    beginner: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    intermediate: 'bg-amber-100 text-amber-700 border-amber-200',
    advanced: 'bg-red-100 text-red-700 border-red-200'
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${styles[level]}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}

export default function DiscoveryCards({
  database = 'ACME_ANALYTICS',
  schema = 'MDLH',
  onSelectQuery,
  onViewAllQueries,
  onExploreMore,
  compact = false,
  sidebarCategory = null,
  maxCards = null
}) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedCard, setExpandedCard] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Get mapped discovery categories from sidebar category
  const mappedCategories = sidebarCategory
    ? SIDEBAR_TO_DISCOVERY_MAP[sidebarCategory] || []
    : [];

  // Filter questions by category and search
  const filteredQuestions = useMemo(() => {
    let questions = DISCOVERY_QUESTIONS.filter(q => {
      // If we have a sidebar category filter, use mapped categories
      if (sidebarCategory && mappedCategories.length > 0) {
        if (!mappedCategories.includes(q.category)) {
          return false;
        }
      } else {
        // Normal category filter behavior
        const matchesCategory = selectedCategory === 'all' || q.category === selectedCategory;
        if (!matchesCategory) return false;
      }

      const matchesSearch = !searchTerm ||
        q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
        q.tips?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesSearch;
    });

    // Apply max cards limit if specified
    if (maxCards && maxCards > 0) {
      questions = questions.slice(0, maxCards);
    }

    return questions;
  }, [selectedCategory, searchTerm, sidebarCategory, mappedCategories, maxCards]);

  // Replace placeholders in SQL
  const prepareSql = (sql) => {
    return sql
      .replace(/\{\{DATABASE\}\}/g, database)
      .replace(/\{\{SCHEMA\}\}/g, schema);
  };

  const handleQueryClick = (query) => {
    const preparedSql = prepareSql(query.sql);
    onSelectQuery?.(preparedSql, query);
  };

  // Get category info for context-aware headers
  const categoryInfo = sidebarCategory ? CATEGORY_INFO[sidebarCategory] : null;
  const CategoryIcon = categoryInfo?.icon;

  // Cards to display in compact mode - use filtered if category provided
  const compactCards = sidebarCategory
    ? filteredQuestions.slice(0, maxCards || 6)
    : DISCOVERY_QUESTIONS.slice(0, 6);

  // Check if there are more cards to explore
  const hasMoreCards = sidebarCategory
    ? DISCOVERY_QUESTIONS.filter(q => mappedCategories.includes(q.category)).length > compactCards.length
    : DISCOVERY_QUESTIONS.length > compactCards.length;

  if (compact) {
    // Compact mode - horizontal scroll of cards
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {CategoryIcon && (
              <div className="p-1 bg-blue-100 rounded">
                <CategoryIcon size={14} className="text-blue-600" />
              </div>
            )}
            <h3 className="text-sm font-semibold text-gray-700">
              {categoryInfo ? `${categoryInfo.title}: What do you want to know?` : 'What do you want to know?'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {hasMoreCards && onExploreMore && (
              <button
                onClick={onExploreMore}
                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                Explore more
                <ChevronRight size={14} />
              </button>
            )}
            {onViewAllQueries && (
              <button
                onClick={onViewAllQueries}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                All queries
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-thin">
          {compactCards.map(question => {
            const Icon = question.icon;
            return (
              <button
                key={question.id}
                onClick={() => handleQueryClick(question.queries[0])}
                className="flex-shrink-0 w-56 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-start gap-2">
                  <div className="p-1.5 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                    <Icon size={16} className="text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 line-clamp-2">{question.question}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <DifficultyBadge level={question.difficulty} />
                      <span className="text-xs text-gray-400">{question.queries.length} queries</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Full mode - grid with filtering
  return (
    <div className="space-y-4">
      {/* Header - context-aware based on sidebarCategory */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {CategoryIcon && (
            <div className="p-2 bg-blue-100 rounded-lg">
              <CategoryIcon size={20} className="text-blue-600" />
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {categoryInfo ? categoryInfo.title : 'What do you want to know?'}
            </h2>
            <p className="text-sm text-gray-500">
              {categoryInfo ? categoryInfo.description : 'Click a question to see relevant queries'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sidebarCategory && onExploreMore && (
            <button
              onClick={onExploreMore}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <Sparkles size={14} />
              All Discovery Cards
            </button>
          )}
          {onViewAllQueries && (
            <button
              onClick={onViewAllQueries}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <BookOpen size={14} />
              Query Library
            </button>
          )}
        </div>
      </div>

      {/* Search and filters - hide category pills when filtered by sidebarCategory */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={sidebarCategory ? `Search ${categoryInfo?.title || 'category'} questions...` : 'Search questions...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 border-0 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        {!sidebarCategory && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon size={14} />
                  {cat.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Question cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredQuestions.map(question => {
          const Icon = question.icon;
          const isExpanded = expandedCard === question.id;

          return (
            <div
              key={question.id}
              className={`bg-white rounded-xl border transition-all ${
                isExpanded ? 'border-blue-300 shadow-lg' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
              }`}
            >
              {/* Card header */}
              <button
                onClick={() => setExpandedCard(isExpanded ? null : question.id)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${isExpanded ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <Icon size={20} className={isExpanded ? 'text-blue-600' : 'text-gray-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-gray-900">{question.question}</h3>
                      <ChevronRight
                        size={18}
                        className={`text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <DifficultyBadge level={question.difficulty} />
                      <span className="text-xs text-gray-400">{question.queries.length} queries</span>
                    </div>
                  </div>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 space-y-3">
                  {/* Tips */}
                  {question.tips && question.tips.length > 0 && (
                    <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                      <div className="flex items-start gap-2">
                        <Zap size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          {question.tips.map((tip, i) => (
                            <p key={i} className="text-xs text-amber-800">{tip}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Query list */}
                  <div className="space-y-2">
                    {question.queries.map(query => (
                      <button
                        key={query.id}
                        onClick={() => handleQueryClick(query)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors group"
                      >
                        <div className="flex items-center gap-2">
                          <Code2 size={14} className="text-gray-400 group-hover:text-blue-600" />
                          <span className="text-sm font-medium text-gray-700 group-hover:text-blue-700">
                            {query.label}
                          </span>
                        </div>
                        <ArrowRight size={14} className="text-gray-400 group-hover:text-blue-600" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {filteredQuestions.length === 0 && (
        <div className="text-center py-12">
          <Search size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">No matching questions</p>
          <p className="text-sm text-gray-400 mt-1">Try adjusting your search or category filter</p>
        </div>
      )}
    </div>
  );
}

// Export discovery questions and metadata for use in other components
export { DISCOVERY_QUESTIONS, CATEGORIES, CATEGORY_INFO, SIDEBAR_TO_DISCOVERY_MAP, DifficultyBadge };
