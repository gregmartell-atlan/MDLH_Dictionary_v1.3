# MDLH Atlan UI - Architecture Guide

## Overview

The MDLH Atlan UI is a React-based web application with a Python FastAPI backend. It provides an interactive interface for exploring Atlan's Metadata Lakehouse (MDLH) stored in Snowflake.

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React + Vite)                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                   │
│  │   App.jsx    │   │  Contexts    │   │   Hooks      │                   │
│  │  (Main App)  │◀──│  (State)     │◀──│  (Logic)     │                   │
│  └──────┬───────┘   └──────────────┘   └──────────────┘                   │
│         │                                                                  │
│  ┌──────▼───────────────────────────────────────────────────────┐         │
│  │                        Components                             │         │
│  ├───────────────┬────────────────┬───────────────┬─────────────┤         │
│  │ QueryEditor   │ ResultsTable   │ SchemaExplorer│ Lineage     │         │
│  │ (Monaco)      │ (TanStack)     │ (Tree View)   │ (Preview)   │         │
│  └───────────────┴────────────────┴───────────────┴─────────────┘         │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────┐         │
│  │                      Utilities                                │         │
│  ├────────────────┬─────────────────┬───────────────────────────┤         │
│  │ queryHelpers   │ discoveryQueries│ resultFormatters          │         │
│  └────────────────┴─────────────────┴───────────────────────────┘         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP/REST API
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (FastAPI)                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐                   │
│  │   Routers    │   │  Services    │   │   Models     │                   │
│  │  (Endpoints) │──▶│  (Logic)     │──▶│  (Pydantic)  │                   │
│  └──────────────┘   └──────────────┘   └──────────────┘                   │
│         │                   │                                              │
│         │                   ▼                                              │
│  ┌──────┴───────────────────────────────────────────────────────┐         │
│  │                    Snowflake Connector                        │         │
│  │                    (snowflake-connector-python)               │         │
│  └──────────────────────────────────────────────────────────────┘         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ SQL/TCP
                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                           SNOWFLAKE (MDLH)                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────┐         │
│  │  FIELD_METADATA / ATLAN_MDLH / MDLH_GOVERNANCE               │         │
│  ├──────────────────────────────────────────────────────────────┤         │
│  │  • TABLE_ENTITY        • COLUMN_ENTITY                       │         │
│  │  • DATABASE_ENTITY     • SCHEMA_ENTITY                       │         │
│  │  • PROCESS_ENTITY      • GLOSSARY_TERM                       │         │
│  │  • LINK_ENTITY         • ...and more                         │         │
│  └──────────────────────────────────────────────────────────────┘         │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

### Component Hierarchy

```
App.jsx
├── Navigation
│   ├── SearchBox
│   └── ConnectionStatus
├── HeroSection
│   ├── DatabaseSelector
│   └── SchemaSelector
├── TabBar
│   └── CategoryTabs (Core, Glossary, Relational DB, etc.)
├── EntityDictionary
│   └── EntityTable (with hover → lineage preview)
├── QueryEditorPanel
│   ├── SchemaExplorer (left sidebar)
│   ├── QueryEditor (Monaco editor)
│   ├── ResultsTable (TanStack table)
│   └── ColumnDiagnostics (right sidebar)
└── Modals/Flyouts
    ├── ConnectionModal
    ├── LineageFlyout
    └── QueryHistoryPanel
```

### State Management

The app uses React's built-in state management with Context API for global state:

```javascript
// Global contexts
SystemConfigContext    // System configuration (backend URL, etc.)
ConnectionContext      // Snowflake connection state

// Local state (useState/useReducer)
- selectedDatabase     // Current MDLH database
- selectedSchema       // Current schema
- editorQuery         // SQL in editor
- queryResults        // Execution results
- discoveredTables    // Schema scan results
- lineagePreviewCache // Cached lineage previews
```

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useSnowflake` | Connection management, status tracking |
| `useSnowflakeSession` | Session persistence across page reloads |
| `useQuery` | Query execution and result handling |
| `useLineageData` | Lineage fetching for current query |
| `useSampleEntities` | Load real GUIDs from discovered tables |
| `useSystemConfig` | Backend configuration |
| `useBackendInstanceGuard` | Detect backend restarts |

### Key Components

#### QueryEditor.jsx
- Monaco editor integration
- SQL syntax highlighting
- Autocomplete with table/column names
- Query validation indicators
- Line numbers, minimap, folding

#### ResultsTable.jsx
- TanStack Table for virtual scrolling
- Column sorting and filtering
- Copy cell/row functionality
- Export to CSV/JSON

#### SchemaExplorer.jsx
- Tree view of databases/schemas/tables
- Click to insert table FQN
- Table search/filter
- Column preview on expand

### Data Flow

```
User Action
    │
    ▼
Component Event Handler
    │
    ▼
Custom Hook (useQuery, useSnowflake, etc.)
    │
    ▼
API Call to Backend (fetch/axios)
    │
    ▼
Backend Router → Service → Snowflake
    │
    ▼
Response Processing
    │
    ▼
State Update (setState, context update)
    │
    ▼
React Re-render
```

## Backend Architecture

### Directory Structure

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py           # FastAPI app, CORS, middleware
│   ├── config.py         # Environment configuration
│   ├── database.py       # Snowflake connection pool
│   ├── routers/
│   │   ├── connection.py # /api/connect, /api/disconnect
│   │   ├── query.py      # /api/query, /api/query/history
│   │   ├── metadata.py   # /api/metadata/*
│   │   └── system.py     # /api/system/config
│   ├── services/
│   │   ├── connection.py # Connection logic
│   │   ├── query.py      # Query execution
│   │   ├── metadata.py   # Schema discovery
│   │   └── session.py    # Session management
│   ├── models/
│   │   ├── connection.py # Pydantic models
│   │   └── query.py      # Request/response models
│   └── utils/
│       ├── snowflake.py  # Snowflake helpers
│       └── query.py      # SQL utilities
└── requirements.txt
```

### API Endpoints

```
POST   /api/connect              # Connect to Snowflake
GET    /api/connection/status    # Check connection status
POST   /api/disconnect           # Disconnect
POST   /api/query                # Execute SQL query
GET    /api/query/history        # Get query history
GET    /api/metadata/databases   # List databases
GET    /api/metadata/schemas     # List schemas in database
GET    /api/metadata/tables      # List tables in schema
GET    /api/metadata/columns     # List columns in table
GET    /api/system/config        # Get system configuration
POST   /api/system/instance-id   # Get/verify backend instance
```

### Connection Management

```python
# Connection flow
1. User submits credentials via /api/connect
2. Backend creates Snowflake connection
3. Connection stored in session (by session ID)
4. Subsequent requests include session ID header
5. Backend retrieves connection from session
6. Connection used for query execution
7. Connection released back to pool
```

### Query Execution Pipeline

```python
# Query execution flow
1. Frontend sends SQL to /api/query
2. Backend validates SQL (basic checks)
3. Connection retrieved from session
4. SQL executed via cursor
5. Results fetched with timeout
6. Results transformed to JSON
7. Response sent to frontend
8. Frontend displays in ResultsTable
```

## Security Considerations

### Frontend
- No credentials stored in localStorage (session only)
- All user input escaped before SQL interpolation
- CSP headers configured in production

### Backend
- CORS restricted to known origins
- Parameterized queries where possible
- Connection credentials encrypted in memory
- Session timeout enforcement
- Rate limiting on query endpoint

### SQL Injection Prevention

```javascript
// Frontend: Use helper functions
import { escapeStringValue, buildSafeFQN } from './utils/queryHelpers';

const safeFQN = buildSafeFQN(database, schema, table);
const safeValue = escapeStringValue(userInput);

// Backend: Use parameterized queries
cursor.execute(
    "SELECT * FROM table WHERE id = %s",
    (user_id,)
)
```

## Performance Optimizations

### Frontend
- Virtual scrolling for large result sets (TanStack Virtual)
- Debounced search input
- Memoized component renders (useMemo, useCallback)
- Lazy loading of Monaco editor
- Lineage preview caching

### Backend
- Connection pooling
- Query result streaming for large datasets
- Response caching for metadata queries
- Async endpoint handlers

## Testing Strategy

### Frontend Tests
```
src/
├── components/
│   └── ComponentName.test.jsx  # Unit tests
├── hooks/
│   └── useHook.test.js         # Hook tests
├── utils/
│   └── helper.test.js          # Utility tests
└── test/
    └── setup.js                # Test configuration
```

### Backend Tests
```
backend/
├── tests/
│   ├── test_connection.py      # Connection tests
│   ├── test_query.py           # Query tests
│   └── conftest.py             # Fixtures
```

## Deployment Considerations

### Frontend
- Build with `npm run build`
- Serve `dist/` from CDN or static host
- Configure base URL in `vite.config.js`

### Backend
- Run with gunicorn + uvicorn workers
- Use environment variables for all secrets
- Configure proper logging for production
- Set up health check endpoint

### Docker (Optional)

```dockerfile
# Frontend Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html

# Backend Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## Extension Points

### Adding New Entity Types
1. Add to `src/data/entities.js`
2. Create query templates in `src/data/queryTemplates.js`
3. Add category tab if needed

### Adding New Query Flows
1. Create flow in `src/queryFlows/stepFlows/`
2. Register in `src/queryFlows/registry.js`
3. Add SQL generators in `src/queryFlows/sql/`

### Adding New API Endpoints
1. Create router in `backend/app/routers/`
2. Add service logic in `backend/app/services/`
3. Register router in `backend/app/main.py`



