# MDLH Atlan UI - Export Manifest

**Export Date**: December 9, 2024
**Export Size**: ~2.0 MB
**Total Files**: 119

## Documentation Files (New)

| File | Purpose |
|------|---------|
| `README.md` | Main project overview and quick start guide |
| `SETUP.md` | Detailed installation and setup instructions |
| `ARCHITECTURE.md` | Technical architecture and design documentation |
| `CONTEXT.md` | Project context, MDLH explanation, design decisions |
| `CHANGELOG.md` | Version history and recent changes |
| `MANIFEST.md` | This file - complete file listing |

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | npm dependencies and scripts |
| `package-lock.json` | Locked dependency versions |
| `vite.config.js` | Vite bundler configuration |
| `tailwind.config.js` | Tailwind CSS configuration |
| `postcss.config.js` | PostCSS configuration |
| `vitest.config.js` | Vitest testing configuration |
| `index.html` | HTML entry point |

## Frontend Source (`src/`)

### Main Application
| File | Purpose |
|------|---------|
| `App.jsx` | Main React component with all state and layout |
| `main.jsx` | React entry point, renders App |
| `index.css` | Global styles, Tailwind imports |

### Components (`src/components/`)
| File | Purpose |
|------|---------|
| `QueryEditor.jsx` | Monaco-based SQL editor |
| `ResultsTable.jsx` | Query results display with TanStack Table |
| `SchemaExplorer.jsx` | Database/schema/table tree browser |
| `ConnectionModal.jsx` | Snowflake connection dialog |
| `RecommendedQueries.jsx` | Context-aware query suggestions |
| `EmptyResultsState.jsx` | Empty state UI |
| `SuggestionChips.jsx` | Query suggestion chips |
| `PlaceholderSuggestions.jsx` | Placeholder value helpers |
| `StepWizard.jsx` | Multi-step query wizard |
| `QueryFlowMenu.jsx` | Query flow selection menu |
| `QueryLibraryLayout.jsx` | Query library browser |
| `QueryPanelShell.jsx` | Query panel container |
| `QueryResultTable.jsx` | Alternative results table |
| `ResultFlowSuggestions.jsx` | Post-query suggestions |
| `EntityActions.jsx` | Entity action buttons |
| `DuckDBStyleEditor.jsx` | DuckDB-inspired editor variant |
| `FlyoutQueryEditor.jsx` | Flyout panel editor |
| `TestQueryLayout.jsx` | Test layout component |

### Components - Lineage (`src/components/lineage/`)
| File | Purpose |
|------|---------|
| `LineageFlyout.jsx` | Lineage visualization flyout |
| `LineageGraph.jsx` | Lineage graph renderer |
| `LineageNode.jsx` | Individual lineage node |

### Components - Search (`src/components/search/`)
| File | Purpose |
|------|---------|
| `CommandPalette.jsx` | Cmd+K command palette |
| `SearchResults.jsx` | Search results display |

### Components - UI (`src/components/ui/`)
| File | Purpose |
|------|---------|
| `Button.jsx` | Reusable button component |
| `Input.jsx` | Reusable input component |
| `Modal.jsx` | Reusable modal component |
| `Spinner.jsx` | Loading spinner |

### Hooks (`src/hooks/`)
| File | Purpose |
|------|---------|
| `useSnowflake.js` | Snowflake connection management |
| `useSnowflakeSession.js` | Session persistence |
| `useLineageData.js` | Lineage data fetching |
| `useSystemConfig.js` | System configuration |
| `useBackendInstanceGuard.js` | Backend restart detection |

### Data (`src/data/`)
| File | Purpose |
|------|---------|
| `entities.js` | MDLH entity type definitions |
| `queryTemplates.js` | SQL query template library |
| `exampleQueries.js` | Example query collection |
| `mdlhUserQueries.js` | User-facing query helpers |
| `constants.js` | Application constants |

### Utilities (`src/utils/`)
| File | Purpose |
|------|---------|
| `queryHelpers.js` | SQL building utilities (buildSafeFQN, escapeStringValue) |
| `discoveryQueries.js` | Schema discovery SQL |
| `resultFormatters.js` | Data formatting utilities |
| `snowflakeArrayHelpers.js` | Array handling for Snowflake |
| `logger.js` | Logging utilities |
| `glossary.js` | Glossary query helpers |
| `lineage.js` | Lineage query builders |
| `dynamicQueryBuilder.js` | Dynamic SQL generation |
| `placeholderValueSuggestions.js` | Placeholder helpers |

### Query Flows (`src/queryFlows/`)
| File | Purpose |
|------|---------|
| `index.js` | Query flow exports |
| `registry.js` | Flow registration |
| `types.js` | TypeScript-like type definitions |
| `queryRecipes.js` | Common query recipes |
| `openFlow.js` | Flow opening logic |

### Query Flows - SQL (`src/queryFlows/sql/`)
| File | Purpose |
|------|---------|
| `sampleRows.js` | Sample row queries |
| `columnStats.js` | Column statistics queries |
| `distinctValues.js` | Distinct value queries |
| `dateRange.js` | Date range queries |
| `nullAnalysis.js` | Null analysis queries |

### Query Flows - Step Flows (`src/queryFlows/stepFlows/`)
| File | Purpose |
|------|---------|
| `index.js` | Step flow exports |
| `types.js` | Step flow types |
| `lineageWizard.js` | Lineage exploration wizard |
| `recipeBuilder.js` | Query recipe builder |
| `extractors.js` | Data extraction utilities |

### Context (`src/context/`)
| File | Purpose |
|------|---------|
| `SystemConfigContext.jsx` | System configuration provider |

### Tests (`src/test/`)
| File | Purpose |
|------|---------|
| `setup.js` | Test configuration and mocks |

## Backend (`backend/`)

### Main Application
| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI application entry point |
| `app/config.py` | Environment configuration |
| `app/database.py` | Database connection management |
| `requirements.txt` | Python dependencies |
| `README.md` | Backend documentation |

### Routers (`backend/app/routers/`)
| File | Purpose |
|------|---------|
| `connection.py` | Connection endpoints (/api/connect, etc.) |
| `query.py` | Query execution endpoints |
| `metadata.py` | Metadata discovery endpoints |
| `system.py` | System configuration endpoints |

### Services (`backend/app/services/`)
| File | Purpose |
|------|---------|
| `snowflake.py` | Snowflake connector service |
| `session.py` | Session management |
| `cache.py` | Response caching |
| `system_config.py` | System configuration service |

### Models (`backend/app/models/`)
| File | Purpose |
|------|---------|
| `schemas.py` | Pydantic request/response models |

### Utilities (`backend/app/utils/`)
| File | Purpose |
|------|---------|
| `logger.py` | Logging configuration |

## Documentation (`docs/`)

| File | Purpose |
|------|---------|
| `mdlh-atlan-ui-spec.md` | Complete UI specification |
| `MDLH_QUERY_GUIDE.md` | Query writing guide |
| `SNOWFLAKE_QUERY_RULES.md` | SQL rules and best practices |
| `TEST_PLAN.md` | Testing strategy and plan |

## Static Assets (`public/`)

| File | Purpose |
|------|---------|
| `favicon.svg` | Application favicon |

## Quick Start Commands

```bash
# Frontend
npm install
npm run dev

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Key Entry Points

- **Frontend**: `http://localhost:5173/MDLH_Dictionary/`
- **Backend API**: `http://localhost:8000`
- **API Docs**: `http://localhost:8000/docs`



