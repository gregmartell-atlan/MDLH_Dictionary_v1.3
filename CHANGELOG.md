# MDLH Atlan UI - Changelog

## [Latest] - 2024-12-09

### Fixed
- **Critical Bug Fix**: Fixed JavaScript hoisting error that prevented the app from loading
  - `handleTableHover` was referencing `loadLineagePreview` before it was defined
  - Moved hover handlers after `loadLineagePreview` definition in `App.jsx`
  - Error: `Cannot access 'loadLineagePreview' before initialization`

### Features
- **Lineage Preview on Hover**: Hover over any table name in the MDLH TABLE column to see:
  - Lineage preview (last 30 days)
  - Fully qualified table name
  - SQL query used to fetch lineage
  - Upstream sources and downstream targets

- **Entity Dictionary**: Browse all MDLH entity types organized by category:
  - Core, Glossary, Data Mesh, Relational DB
  - Lineage, Usage, Query Org, BI Tools
  - dbt, Object Storage, Orchestration, Governance, AI/ML

- **Query Editor**: Monaco-based SQL editor with:
  - Syntax highlighting
  - Autocomplete for MDLH tables
  - Query validation against discovered schema
  - One-click execution

- **Recommended Queries**: Context-aware query suggestions using:
  - Real GUIDs from discovered tables (never placeholders)
  - Validated queries that can actually run
  - Category-specific templates

- **Connection Management**:
  - Snowflake SSO support
  - Session persistence across page reloads
  - Connection status indicator
  - Backend restart detection

### Architecture
- **Three-Panel Layout**:
  - Left sidebar: Schema browser
  - Center: SQL editor + results
  - Right sidebar: Column diagnostics + lineage

- **Tech Stack**:
  - React 18.3.1 + Vite 5.4
  - FastAPI backend
  - Monaco Editor
  - TanStack Table
  - Tailwind CSS

## Previous Changes

### Query System
- Added query flow system for multi-step queries
- Implemented query recipes for common patterns
- Added SQL generators for different entity types
- Created step-by-step wizards for complex queries

### Lineage System
- Implemented OpenLineage-compatible data model
- Added recursive lineage queries
- Created lineage visualization components
- Added lineage caching for performance

### Schema Discovery
- Auto-discover available tables on connection
- Validate queries against discovered schema
- Filter entity dictionary by available tables
- Show table availability indicators

### Export Features
- Export query results to CSV
- Export current tab entities
- Export all entities
- Copy individual cells/rows

### UI/UX Improvements
- Command palette (Cmd+K) for quick navigation
- Dark mode color palette option
- Responsive design adjustments
- Keyboard shortcuts for common actions

## Known Issues

1. **Schema Discovery Delay**: First query after connection may be slow while schema is being discovered
2. **Large Result Sets**: Results > 10,000 rows may cause performance issues
3. **Monaco Memory**: Extended editing sessions may increase memory usage

## Migration Notes

### From Previous Versions
1. Clear browser localStorage if experiencing connection issues
2. Ensure backend is updated to match frontend version
3. Check Snowflake permissions for new metadata tables

### Environment Changes
- Backend now requires `python-dotenv` for configuration
- Frontend requires Node.js 18+ (previously 16+)
- New environment variables for backend configuration

## Roadmap

### Planned Features
- [ ] Query history persistence
- [ ] Saved queries/favorites
- [ ] Team sharing of queries
- [ ] Advanced lineage visualization
- [ ] Query scheduling
- [ ] Alert/notification system

### Technical Debt
- [ ] Migrate remaining components to TypeScript
- [ ] Add comprehensive E2E tests
- [ ] Optimize bundle size
- [ ] Implement proper error boundaries




