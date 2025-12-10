# MDLH Atlan UI - Project Context

## What is MDLH?

**Metadata Lakehouse (MDLH)** is Atlan's core data storage system that contains all metadata about an organization's data assets. It stores information about:

- **Data Assets**: Tables, columns, databases, schemas, views
- **Business Context**: Glossary terms, categories, domains
- **Data Lineage**: Process runs, input/output relationships
- **Governance**: Policies, classifications, tags
- **Usage**: Query patterns, popularity scores, user interactions

MDLH is stored in **Snowflake** and organized into multiple databases:
- `FIELD_METADATA` - Primary metadata storage
- `ATLAN_MDLH` - Additional MDLH tables
- `MDLH_GOVERNANCE` - Governance-related entities
- `MDLH_ATLAN_HOME` - Atlan home configuration

## Purpose of This Application

This application serves as an **interactive dictionary and exploration tool** for MDLH. It allows users to:

1. **Browse Entity Types** - Understand what types of metadata exist
2. **Explore Tables** - See which Snowflake tables store which entities
3. **Run Queries** - Execute SQL directly against MDLH
4. **View Lineage** - Understand data flow relationships
5. **Learn MDLH** - Educational tool for new team members

## Design Philosophy

### DuckDB-Inspired UI

The UI is heavily inspired by [DuckDB's web interface](https://shell.duckdb.org/), featuring:
- Clean, dense data presentation
- Monaco-based SQL editor
- Efficient three-panel layout
- Minimal visual noise

### Three-Panel Layout

```
┌───────────┬──────────────────────────────┬───────────────┐
│           │                              │               │
│  Schema   │     SQL Editor               │   Column      │
│  Browser  │     ─────────────            │   Diagnostics │
│           │     Query Results            │   & Lineage   │
│           │                              │               │
└───────────┴──────────────────────────────┴───────────────┘
```

### Key Design Decisions

1. **Always Show Context**
   - Current database/schema always visible
   - Connection status prominently displayed
   - Entity types organized by category

2. **No Placeholders**
   - All example queries use real values
   - GUIDs fetched from actual discovered tables
   - Queries are immediately executable

3. **Dense but Readable**
   - 13px default font size
   - Minimal padding and margins
   - No heavy shadows or rounded corners
   - Professional data tool aesthetic

## Technical Decisions

### Why React + Vite?

- **Vite**: Fast HMR, efficient builds, modern tooling
- **React 18**: Concurrent features, hooks ecosystem
- **No framework bloat**: Simple component structure

### Why Monaco Editor?

- Industry-standard code editor (VS Code engine)
- SQL syntax highlighting out of the box
- Extensible autocomplete
- Excellent performance with large content

### Why TanStack Table?

- Headless UI - full styling control
- Virtual scrolling for large datasets
- Built-in sorting, filtering, pagination
- React 18 compatible

### Why FastAPI?

- Async-first design
- Automatic API documentation
- Type hints with Pydantic
- Easy Snowflake integration

### Why Snowflake Connector?

- Official Snowflake Python connector
- Supports SSO, MFA, key-pair auth
- Connection pooling built-in
- Well-maintained and documented

## Critical Rules for Development

### 1. Fully Qualified Names (FQN)

**ALWAYS** use database.schema.table format:

```sql
-- ✅ CORRECT
SELECT * FROM FIELD_METADATA.PUBLIC.TABLE_ENTITY;

-- ❌ WRONG
SELECT * FROM TABLE_ENTITY;
```

### 2. No Placeholder Values

**NEVER** use placeholder GUIDs or values:

```sql
-- ❌ WRONG
WHERE GUID = '<YOUR_GUID_HERE>'
WHERE GUID = '{{GUID}}'
WHERE GUID = 'example-guid'

-- ✅ CORRECT - Use real values from discovered tables
WHERE GUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
```

### 3. Use Helper Functions

```javascript
// Always use these for SQL building
import { buildSafeFQN, escapeStringValue } from './utils/queryHelpers';

const fqn = buildSafeFQN(database, schema, table);
const safe = escapeStringValue(userInput);
```

### 4. Validate Before Showing

Only show queries that can actually run:

```javascript
import { canQueryRunWithTables } from './data/queryTemplates';

if (canQueryRunWithTables(query, availableTables)) {
  showQuery(query);
}
```

## Entity Categories

### Core
Base entities that everything inherits from:
- **Referenceable**: Root of all entity types (guid, qualifiedName)
- **Asset**: Named assets with descriptions
- **Process**: Data transformation processes
- **Link**: Relationships between entities

### Glossary
Business terminology:
- **Glossary**: Container for terms
- **GlossaryTerm**: Business definitions
- **GlossaryCategory**: Term groupings

### Relational DB
Database structures:
- **Database**: Top-level container
- **Schema**: Namespace within database
- **Table**: Data tables
- **Column**: Table columns
- **View**: Database views

### Data Mesh
Domain-driven organization:
- **DataDomain**: Business domain
- **DataProduct**: Data products

### Lineage
Data flow tracking:
- **Process**: Transformation jobs
- **ProcessRun**: Individual executions
- **LineageMapping**: Source-to-target mappings

### And More...
- Usage (queries, popularity)
- BI Tools (dashboards, reports)
- dbt (models, tests)
- Object Storage (S3, GCS)
- AI/ML (models, features)
- Governance (policies, tags)

## File Naming Conventions

### Components
- PascalCase: `QueryEditor.jsx`, `ResultsTable.jsx`
- One component per file
- Co-locate tests: `Component.test.jsx`

### Utilities
- camelCase: `queryHelpers.js`, `resultFormatters.js`
- Pure functions when possible
- Export named functions

### Data
- camelCase: `entities.js`, `queryTemplates.js`
- Export objects or arrays
- Include JSDoc comments

## Color Palette Reference

```css
/* Primary - Atlan Blue */
--primary: #3366FF;
--primary-light: #EBF0FF;
--primary-dark: #254EDB;

/* Neutrals */
--background: #FFFFFF;
--sidebar: #F8FAFC;        /* slate-50 */
--border: #E2E8F0;         /* slate-200 */
--text: #1E293B;           /* slate-800 */
--text-muted: #64748B;     /* slate-500 */

/* Status Colors */
--success: #10B981;        /* emerald-500 */
--warning: #F59E0B;        /* amber-500 */
--error: #EF4444;          /* red-500 */
--info: #3B82F6;           /* blue-500 */
```

## Common MDLH Query Patterns

### List All Entities of a Type
```sql
SELECT NAME, GUID, TYPENAME, STATUS, POPULARITYSCORE
FROM FIELD_METADATA.PUBLIC.TABLE_ENTITY
WHERE NAME IS NOT NULL
ORDER BY POPULARITYSCORE DESC NULLS LAST
LIMIT 100;
```

### Find Entity by GUID
```sql
SELECT *
FROM FIELD_METADATA.PUBLIC.TABLE_ENTITY
WHERE GUID = 'specific-guid-here';
```

### Get Upstream Lineage
```sql
WITH RECURSIVE lineage AS (
  SELECT GUID, NAME, 1 as depth
  FROM FIELD_METADATA.PUBLIC.TABLE_ENTITY
  WHERE GUID = 'starting-guid'
  
  UNION ALL
  
  SELECT p.GUID, p.NAME, l.depth + 1
  FROM FIELD_METADATA.PUBLIC.PROCESS_INPUT pi
  JOIN lineage l ON pi.OUTPUT_GUID = l.GUID
  JOIN FIELD_METADATA.PUBLIC.TABLE_ENTITY p ON p.GUID = pi.INPUT_GUID
  WHERE l.depth < 5
)
SELECT * FROM lineage;
```

### Get Table Columns
```sql
SELECT 
  c.NAME as column_name,
  c.DATATYPE,
  c.ISPRIMARYKEY,
  c.ISNULLABLE
FROM FIELD_METADATA.PUBLIC.COLUMN_ENTITY c
WHERE c.TABLEQUAIFIEDNAME = 'database/schema/table';
```

## Resources

- [Atlan Documentation](https://docs.atlan.com/)
- [Snowflake SQL Reference](https://docs.snowflake.com/en/sql-reference)
- [React Documentation](https://react.dev/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [TanStack Table](https://tanstack.com/table)




