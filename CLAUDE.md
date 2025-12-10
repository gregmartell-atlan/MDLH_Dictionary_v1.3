# CLAUDE.md - MDLH Dictionary Project

## Project Overview

**MDLH Dictionary** is a React frontend + FastAPI backend that provides a SQL query interface for exploring Snowflake metadata from Atlan's Metadata Lakehouse. It enables users to discover tables, run recommended queries, and understand their data catalog.

## Quick Start Commands

```bash
# Frontend (React + Vite)
npm install                  # Install dependencies
npm run dev                  # Start dev server (port 5173)
npm run build               # Production build
npm run test                # Run Vitest tests
npm run test:coverage       # Run with coverage report

# Backend (FastAPI + Python)
cd backend
source venv/bin/activate    # Activate virtual environment
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Run both (separate terminals)
# Terminal 1: npm run dev
# Terminal 2: cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8000
```

## Architecture

```
/
├── src/                     # React frontend
│   ├── components/          # UI components
│   │   └── RecommendedQueries.jsx   # Query recommendation panel
│   ├── data/               # Static query definitions
│   │   ├── queryTemplates.js        # MDLH + Snowflake queries (~35)
│   │   ├── exampleQueries.js        # Example queries by category (~45)
│   │   └── mdlhUserQueries.js       # User research queries (~80)
│   ├── utils/              # Utility functions
│   │   ├── queryHelpers.js          # SQL safety utilities (IMPORTANT)
│   │   ├── tableDiscovery.js        # Table discovery + caching
│   │   └── dynamicQueryBuilder.js   # Dynamic query generation
│   └── hooks/              # React hooks
│       └── useSnowflake.js          # Snowflake connection management
│
├── backend/                # FastAPI backend
│   └── app/
│       ├── main.py         # FastAPI app entry
│       ├── routers/        # API endpoints
│       │   ├── metadata.py          # Schema browser endpoints
│       │   ├── query.py             # Query execution endpoints
│       │   └── connection.py        # Connection management
│       ├── services/       # Business logic
│       │   └── session.py           # Session management
│       └── models/         # Pydantic schemas
│           └── schemas.py           # Request/response models
│
└── docs/                   # Documentation
    └── SNOWFLAKE_QUERY_RULES.md    # Snowflake SQL patterns
```

## Code Style Guidelines

### JavaScript/React
- Use ES modules syntax (`import/export`), not CommonJS
- Use functional components with hooks
- Prefer `useMemo` for expensive computations
- Use Tailwind CSS for styling
- Icons from `lucide-react`
- No emojis in code/comments unless explicitly requested

### Python/FastAPI
- Use Pydantic models for all API schemas
- Use type hints for all function parameters
- Use async/await for endpoint handlers
- Handle Snowflake errors gracefully (return empty list vs 500)

### SQL Templates
- Use `{{PLACEHOLDER}}` syntax for dynamic values
- Always include `LIMIT` clauses
- Document ARRAY/OBJECT handling in comments:
  ```sql
  -- INPUTS/OUTPUTS are ARRAY - use ::STRING ILIKE for GUID search
  WHERE P.OUTPUTS::STRING ILIKE '%{{GUID}}%'

  -- ANCHOR is an OBJECT - use :guid::STRING for field access
  WHERE gt.ANCHOR:guid::STRING = g.GUID
  ```

## IMPORTANT: SQL Injection Protection

**YOU MUST** use safety utilities from `queryHelpers.js` for any dynamic SQL:

```javascript
import { buildSafeFQN, escapeStringValue, escapeIdentifier } from '../utils/queryHelpers';

// For table references
const fqn = buildSafeFQN(database, schema, table);

// For string values in WHERE clauses
const safeValue = escapeStringValue(userInput);

// For dynamic identifiers
const safeColumn = escapeIdentifier(columnName);
```

Backend uses `_validate_identifier()` in `metadata.py` for the same purpose.

## Snowflake-Specific Patterns

### Querying ARRAY columns
```sql
-- Cast to STRING for ILIKE search
WHERE INPUTS::STRING ILIKE '%search_term%'

-- Use LATERAL FLATTEN for iteration
SELECT f.value::STRING FROM table, LATERAL FLATTEN(INPUTS) f
```

### Querying OBJECT columns
```sql
-- Access nested fields
WHERE column:fieldName::STRING = 'value'

-- Multiple levels
WHERE column:level1:level2::STRING = 'value'
```

### Safe Timestamp Handling
```sql
-- Use TRY_TO_TIMESTAMP for safe parsing
WHERE last_altered > TRY_TO_TIMESTAMP_NTZ('2025-01-01 00:00:00')

-- Convert epoch milliseconds
TO_TIMESTAMP(UPDATETIME/1000) AS updated_at
```

### Identifier Quoting
```sql
-- Quote identifiers with special chars or mixed case
SELECT "NAME", "GUID" FROM "DATABASE"."SCHEMA"."TABLE_ENTITY"
```

## Testing

- **Framework**: Vitest + React Testing Library
- **Coverage threshold**: 85% (lines, branches, functions)
- **Test location**: `*.test.js` files alongside source

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Test Categories
1. Unit tests: Formatters, validators, helpers
2. Component tests: EmptyResultsState, ResultsTable
3. Integration tests: StepWizard flow

## API Endpoints

### Metadata Browser
- `GET /api/metadata/databases` - List accessible databases
- `GET /api/metadata/schemas?database=X` - List schemas
- `GET /api/metadata/tables?database=X&schema=Y` - List tables (sorted by popularity)
- `GET /api/metadata/columns?database=X&schema=Y&table=Z` - Column details
- `GET /api/metadata/tables/popular?database=X&schema=Y` - Top tables by usage
- `GET /api/metadata/tables/changes?database=X&schema=Y&since=TIMESTAMP` - Incremental updates

### Query Execution
- `POST /api/query/execute` - Execute SQL query
- `GET /api/query/{id}/results` - Get paginated results
- `POST /api/query/preflight` - Validate query before execution
- `POST /api/query/validate-batch` - Validate multiple queries
- `POST /api/query/explain` - Get plain-English query explanation

### Connection
- `POST /api/connect` - Establish Snowflake connection
- `GET /api/connection/status` - Check connection status

## Key Files for Common Tasks

| Task | Files |
|------|-------|
| Add new query template | `src/data/queryTemplates.js`, `src/data/mdlhUserQueries.js` |
| Modify table discovery | `src/utils/tableDiscovery.js` |
| Change SQL safety rules | `src/utils/queryHelpers.js` |
| Add API endpoint | `backend/app/routers/`, `backend/app/models/schemas.py` |
| Modify query recommendations | `src/utils/dynamicQueryBuilder.js`, `src/components/RecommendedQueries.jsx` |

## Caching Architecture

### Frontend Caches (LRU)
- **Table cache**: 50 entries, 15 min TTL
- **Column cache**: 500 entries, 30 min TTL
- **Metadata cache**: Stores popularity scores for sorting

### Backend Caches
- **Session store**: Snowflake connections with auto-cleanup
- **Query results**: Per-session result storage with eviction
- **Metadata cache**: Schema/table lists with refresh capability

## Environment Setup

### Prerequisites
- Node.js 18+
- Python 3.9+
- Access to Snowflake with MDLH database

### Snowflake Connection
The app uses Snowflake OAuth or username/password authentication. Connection is established via the frontend and maintained via session tokens.

## Common Gotchas

1. **Empty query results**: Check if the entity table exists. Use `/api/query/preflight` to validate.

2. **MDLH table names vary by tenant**: TABLE_ENTITY might be TABLEAU_ENTITY in some environments. The app auto-discovers available tables.

3. **Popularity data**: Requires TABLE_ENTITY to have `QUERYCOUNT`, `POPULARITYSCORE` columns. Falls back to `row_count` if unavailable.

4. **Backend port conflicts**: Kill existing processes: `lsof -ti:8000 | xargs kill -9`

5. **Case sensitivity**: Snowflake identifiers are case-insensitive unless quoted. Use `.toUpperCase()` for comparisons.

## Workflow Recommendations

### Before Making Changes
1. Read relevant files first (don't jump to coding)
2. Check if there's a test file for the component
3. Understand the data flow (frontend -> backend -> Snowflake)

### For New Query Templates
1. Add to appropriate file (`queryTemplates.js` or `mdlhUserQueries.js`)
2. Follow the existing structure with `id`, `label`, `description`, `sql`, `requires`
3. Use `{{PLACEHOLDER}}` syntax for dynamic values
4. Add comments explaining ARRAY/OBJECT patterns
5. Include `LIMIT` clause

### For API Changes
1. Update Pydantic model in `schemas.py`
2. Add endpoint in appropriate router
3. Update frontend API calls in `useSnowflake.js`

## Project-Specific Terminology

- **MDLH**: Metadata Lakehouse - Atlan's metadata storage in Snowflake
- **Entity tables**: Tables ending in `_ENTITY` (TABLE_ENTITY, COLUMN_ENTITY, etc.)
- **Popularity score**: Atlan-computed metric based on query frequency
- **FQN**: Fully Qualified Name (database.schema.table)
- **Discovery**: Process of finding available tables in the schema

---

## UI Architecture

### Main Layout Structure (App.jsx)
```
<SystemConfigProvider>
  <div className="min-h-screen">
    <nav>...</nav>                    <!-- Top navigation bar -->
    <div>Hero Section</div>           <!-- Welcome banner + context selector -->

    <div className="flex">            <!-- Main layout wrapper -->
      <CategorySidebar />             <!-- Left sidebar navigation -->
      <div>                           <!-- Main content area -->
        <div>Banner (if not connected)</div>
        <div>Main Content (QueryEditor or DataTable)</div>
      </div>
    </div>

    <QueryPanel />                    <!-- Right slide-out panel -->
    <QueryPanelShell>LineagePanel</QueryPanelShell>  <!-- Lineage flyout -->
    <ConnectionModal />               <!-- Modal dialogs -->
    <CommandPalette />                <!-- Cmd+K search -->
  </div>
</SystemConfigProvider>
```

### Key Component Relationships
| Component | Purpose | Location |
|-----------|---------|----------|
| `App.jsx` | Main layout, state management, routing | `src/App.jsx` |
| `CategorySidebar.jsx` | Left navigation with grouped categories | `src/components/CategorySidebar.jsx` |
| `QueryEditor.jsx` | SQL editor with table browser | `src/components/QueryEditor.jsx` |
| `LineageRail.jsx` | SVG lineage graph visualization | `src/components/lineage/LineageRail.jsx` |
| `RecommendedQueries.jsx` | Context-aware query suggestions | `src/components/RecommendedQueries.jsx` |

### Category Groups (CategorySidebar)
```javascript
const CATEGORY_GROUPS = [
  { id: 'explore', label: 'Explore', categories: ['core', 'glossary', 'datamesh', 'relational'] },
  { id: 'data', label: 'Data Flow', categories: ['lineage', 'usage', 'queries'] },
  { id: 'integrations', label: 'Integrations', categories: ['bi', 'dbt', 'storage', 'orchestration'] },
  { id: 'manage', label: 'Manage', categories: ['governance', 'ai'] },
];
```

---

## UI Patterns

### Hover Actions Pattern
Use Tailwind's `group` and `group-hover` for reveal-on-hover buttons:

```jsx
{/* Parent element needs 'group' class */}
<div className="... group">
  <span>Content</span>

  {/* Child buttons hidden until hover */}
  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
    <button onClick={handlePreview}><Eye size={14} /></button>
    <button onClick={handleLineage}><GitBranch size={14} /></button>
  </div>
</div>
```

### Collapsible Sidebar Pattern
```jsx
const [isCollapsed, setIsCollapsed] = useState(false);

<div className={`transition-all duration-200 ${isCollapsed ? 'w-14' : 'w-56'}`}>
  {!isCollapsed && <span>Full Label</span>}
  {isCollapsed && <Tooltip text="Label"><Icon /></Tooltip>}
</div>
```

### Flyout Panel Pattern (QueryPanelShell)
```jsx
<QueryPanelShell isOpen={showPanel} onClose={() => setShowPanel(false)} maxWidth="max-w-4xl">
  <header>...</header>
  <div className="flex-1 overflow-y-auto">Content</div>
</QueryPanelShell>
```

---

## Recent Design Decisions

1. **Left Sidebar Navigation**: Categories moved from horizontal tabs to vertical collapsible sidebar (DuckDB-inspired)

2. **Hover Actions over Right-Click**: Quick actions (Preview, Lineage, More) appear on hover rather than requiring right-click context menu

3. **Lineage Visualization**: Uses SVG with memoized components (LineageNode, LineageEdge) for performance. Color palette: Blue (tables), Green (views), Slate (processes)

4. **Query Recommendations**: Context-aware suggestions based on selected entity type, available tables, and recent queries

---

## Common Development Pitfalls

### JSX Div Balance
When restructuring layouts, carefully track opening/closing divs. The error "Unterminated JSX contents" typically means unbalanced tags:
```jsx
// Count opens and closes when editing layout structure
<div> {/* 1 */}
  <div> {/* 2 */}
  </div> {/* closes 2 */}
</div> {/* closes 1 */}
```

### Tailwind Group-Hover Not Working
If `group-hover:opacity-100` doesn't work, check:
1. Parent element has `group` class
2. No intermediate elements breaking the group context
3. The hover area is large enough to trigger

### Large File Edits
For files >2000 lines (like App.jsx), use offset/limit when reading:
```bash
Read file_path offset=1500 limit=100
```

---

## Test Summary

| Suite | Tests | What it covers |
|-------|-------|----------------|
| discoveryQueries | 38 | Query generation, table discovery |
| resultFormatters | 59 | Value formatting, type detection |
| securityValidation | 57 | SQL injection prevention |
| EmptyResultsState | 18 | Empty state UI component |
| placeholderValidation | 211 | Query placeholder handling |
| sqlBuilders | 40 | SQL query construction |

**Total: 472 tests passing**

---

## Performance Considerations

### Lineage Graph (LineageRail.jsx)
- Uses `useMemo` for position calculations
- Memoized components with `React.memo`
- Position lookups via Map for O(1) access
- Consider viewport-based rendering for large graphs

### Table Discovery
- LRU cache with 50 entries, 15 min TTL
- Avoid re-discovery on every render
- Use `discoveredTables` Set for O(1) lookups
