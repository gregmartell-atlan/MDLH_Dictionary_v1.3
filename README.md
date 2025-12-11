# MDLH Atlan UI - Metadata Dictionary Explorer

A SQL exploration UI for Atlan's Metadata Lakehouse (MDLH), heavily inspired by DuckDB's UI.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Python 3.9+ (for backend)
- Snowflake account with MDLH access

### Frontend Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173/MDLH_Dictionary/`

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

## 📁 Project Structure

```
MDLH_Dict/
├── src/                      # Frontend source code
│   ├── App.jsx               # Main application component
│   ├── main.jsx              # Entry point
│   ├── index.css             # Global styles (Tailwind)
│   ├── components/           # React components
│   │   ├── QueryEditor.jsx   # Monaco-based SQL editor
│   │   ├── ResultsTable.jsx  # Query results display
│   │   ├── SchemaExplorer.jsx # Database schema browser
│   │   ├── ConnectionModal.jsx # Snowflake connection UI
│   │   ├── RecommendedQueries.jsx # Context-aware query suggestions
│   │   ├── lineage/          # Lineage visualization components
│   │   ├── search/           # Search and command palette
│   │   └── ui/               # Reusable UI components
│   ├── data/                 # Static data and query templates
│   │   ├── entities.js       # MDLH entity definitions
│   │   ├── queryTemplates.js # SQL query library
│   │   └── constants.js      # App constants
│   ├── hooks/                # Custom React hooks
│   │   ├── useSnowflake.js   # Snowflake connection hook
│   │   ├── useSnowflakeSession.js # Session management
│   │   ├── useLineageData.js # Lineage data fetching
│   │   └── useSystemConfig.js # System configuration
│   ├── utils/                # Utility functions
│   │   ├── queryHelpers.js   # SQL building utilities
│   │   ├── resultFormatters.js # Data formatting
│   │   └── discoveryQueries.js # Schema discovery
│   ├── queryFlows/           # Query flow system
│   │   ├── sql/              # SQL generators
│   │   └── stepFlows/        # Multi-step query wizards
│   └── context/              # React context providers
├── backend/                  # FastAPI backend
│   └── app/
│       ├── main.py           # FastAPI app entry
│       ├── config.py         # Configuration
│       ├── database.py       # Database connections
│       ├── routers/          # API route handlers
│       │   ├── connection.py # Connection management
│       │   ├── query.py      # Query execution
│       │   └── metadata.py   # Metadata endpoints
│       └── services/         # Business logic
├── docs/                     # Documentation
│   ├── mdlh-atlan-ui-spec.md # UI specification
│   ├── MDLH_QUERY_GUIDE.md   # Query writing guide
│   └── SNOWFLAKE_QUERY_RULES.md # SQL rules
├── public/                   # Static assets
├── package.json              # npm dependencies
├── vite.config.js            # Vite configuration
├── tailwind.config.js        # Tailwind CSS config
└── vitest.config.js          # Test configuration
```

## 🎨 UI Layout

The app follows a **three-panel layout**:

1. **Left Sidebar** - Database/schema browser with table list
2. **Center Panel** - SQL editor (Monaco) + query results
3. **Right Sidebar** - Column diagnostics and lineage preview

## 🔑 Key Features

### 1. Entity Dictionary
Browse all MDLH entity types organized by category:
- Core (Referenceable, Asset, Process, Link)
- Glossary (Terms, Categories)
- Data Mesh (Domains, Products)
- Relational DB (Database, Schema, Table, Column)
- Lineage (Process runs, Input/Output)
- And more...

### 2. Query Editor
- Monaco-based SQL editor with syntax highlighting
- Auto-completion for MDLH tables and columns
- Query validation against discovered schema
- One-click query execution

### 3. Lineage Preview
- Hover over any table name to see lineage preview
- Shows upstream sources and downstream targets
- SQL query used for lineage discovery

### 4. Recommended Queries
- Context-aware query suggestions
- Uses real GUIDs from discovered tables
- No placeholder values - always executable

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the backend directory:

```env
# Snowflake connection (optional - can be provided via UI)
SNOWFLAKE_ACCOUNT=your_account
SNOWFLAKE_USER=your_user
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_WAREHOUSE=your_warehouse
SNOWFLAKE_DATABASE=FIELD_METADATA
SNOWFLAKE_SCHEMA=PUBLIC
```

### Color Palette

The app uses Atlan's brand colors:

```css
--primary: #3366FF        /* Atlan blue */
--primary-light: #EBF0FF
--primary-dark: #254EDB
--background: #FFFFFF
--sidebar: #F8FAFC        /* slate-50 */
--border: #E2E8F0         /* slate-200 */
--text: #1E293B           /* slate-800 */
--text-muted: #64748B     /* slate-500 */
```

## 📝 Query Rules

### CRITICAL: Always use fully-qualified names

```sql
-- ✅ CORRECT
SELECT * FROM FIELD_METADATA.PUBLIC.TABLE_ENTITY LIMIT 10;

-- ❌ WRONG (missing database/schema)
SELECT * FROM TABLE_ENTITY LIMIT 10;
```

### Use helper functions for building queries

```javascript
import { buildSafeFQN, escapeStringValue } from './utils/queryHelpers';

// Build table reference
const tableFQN = buildSafeFQN('FIELD_METADATA', 'PUBLIC', 'TABLE_ENTITY');
// → "FIELD_METADATA"."PUBLIC"."TABLE_ENTITY"

// Escape string values
const safeGuid = escapeStringValue(userInput);
// → Properly escaped for SQL injection prevention
```

### Never use placeholder values

```sql
-- ❌ WRONG - placeholders not allowed
SELECT * FROM TABLE_ENTITY WHERE GUID = '<YOUR_GUID_HERE>';

-- ✅ CORRECT - use real values from discovered tables
SELECT * FROM TABLE_ENTITY WHERE GUID = 'actual-guid-from-db';
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## 🚢 Building for Production

```bash
# Build frontend
npm run build

# Output will be in dist/ folder
```

## 📚 API Endpoints

### Connection Management
- `POST /api/connect` - Connect to Snowflake
- `GET /api/connection/status` - Check connection status
- `POST /api/disconnect` - Disconnect from Snowflake

### Query Execution
- `POST /api/query` - Execute SQL query
- `GET /api/query/history` - Get query history

### Metadata
- `GET /api/metadata/databases` - List databases
- `GET /api/metadata/schemas` - List schemas
- `GET /api/metadata/tables` - List tables

## 🔒 Security Notes

1. **Never commit credentials** - Use environment variables or the UI
2. **Validate all user input** - Use `escapeStringValue()` for SQL values
3. **Use prepared statements** - The backend uses parameterized queries

## 📖 Additional Documentation

- [UI Specification](docs/mdlh-atlan-ui-spec.md)
- [Query Writing Guide](docs/MDLH_QUERY_GUIDE.md)
- [Snowflake Query Rules](docs/SNOWFLAKE_QUERY_RULES.md)

## 🤝 Contributing

1. Follow the three-panel layout structure
2. Use the existing color palette
3. Reuse existing components where possible
4. Write tests for new features
5. Follow the query rules for any SQL generation

---

Built with ❤️ for the Atlan Metadata Lakehouse




