# MDLH Atlan UI - Detailed Setup Guide

## System Requirements

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Python**: 3.9 or higher
- **Snowflake Account**: With access to MDLH databases

## Step-by-Step Installation

### 1. Frontend Installation

```bash
# Navigate to project directory
cd MDLH_Dict

# Install all npm dependencies
npm install

# This installs:
# - React 18.3.1
# - Vite 5.4.10
# - Monaco Editor (@monaco-editor/react)
# - TanStack Table (@tanstack/react-table)
# - Lucide React icons
# - Tailwind CSS
# - Testing libraries (Vitest, Testing Library)
```

### 2. Backend Installation

```bash
# Navigate to backend directory
cd backend

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# This installs:
# - FastAPI
# - Uvicorn (ASGI server)
# - Snowflake Connector
# - Python-dotenv
# - Pydantic
```

### 3. Configuration

#### Backend Environment (Optional)

Create `backend/.env` file:

```env
# Snowflake credentials (optional - can configure via UI)
SNOWFLAKE_ACCOUNT=your_account.region
SNOWFLAKE_USER=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_DATABASE=FIELD_METADATA
SNOWFLAKE_SCHEMA=PUBLIC
SNOWFLAKE_ROLE=your_role

# Server settings
HOST=0.0.0.0
PORT=8000
DEBUG=true
```

#### Frontend Configuration

The frontend connects to `http://localhost:8000` by default. To change this, modify `src/hooks/useSnowflake.js`:

```javascript
const API_BASE_URL = 'http://localhost:8000';
```

### 4. Running the Application

#### Terminal 1: Start Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

#### Terminal 2: Start Frontend

```bash
npm run dev
```

You should see:
```
  VITE v5.4.21  ready in 500 ms

  ➜  Local:   http://localhost:5173/MDLH_Dictionary/
  ➜  Network: use --host to expose
```

### 5. Connecting to Snowflake

1. Open the app at `http://localhost:5173/MDLH_Dictionary/`
2. Click the **Connect** button in the top right
3. Enter your Snowflake credentials:
   - Account (e.g., `abc12345.us-east-1`)
   - Username
   - Password
   - Warehouse
   - Database (default: `FIELD_METADATA`)
   - Schema (default: `PUBLIC`)
4. Click **Connect**

The connection indicator will turn green when connected.

## Troubleshooting

### Common Issues

#### 1. "Address already in use" (Port 8000)

Another process is using port 8000. Either:
- Kill the existing process: `lsof -i :8000 | awk 'NR>1 {print $2}' | xargs kill`
- Use a different port: `uvicorn app.main:app --reload --port 8001`

#### 2. "Module not found" errors (Python)

Make sure the virtual environment is activated:
```bash
source venv/bin/activate  # Check prompt shows (venv)
pip install -r requirements.txt
```

#### 3. "Cannot find module" errors (Node)

Delete node_modules and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

#### 4. Snowflake Connection Fails

- Verify credentials are correct
- Check if your IP is whitelisted in Snowflake
- Ensure the warehouse is running
- Try using the full account identifier (e.g., `account.region.cloud`)

#### 5. CORS Errors

The backend includes CORS middleware. If you still see CORS errors:
1. Check backend is running on expected port
2. Clear browser cache
3. Check `backend/app/main.py` CORS settings

### Port Configuration

| Service | Default Port | Configuration |
|---------|--------------|---------------|
| Frontend (Vite) | 5173 | `vite.config.js` or `--port` flag |
| Backend (FastAPI) | 8000 | `--port` flag in uvicorn command |

### Logs and Debugging

#### Frontend Logs
Open browser DevTools (F12) → Console tab

#### Backend Logs
Logs appear in the terminal running uvicorn. For more verbose logging:
```bash
uvicorn app.main:app --reload --port 8000 --log-level debug
```

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

### Building for Production

```bash
# Build optimized frontend
npm run build

# Preview production build
npm run preview
```

### Code Quality

```bash
# Check for linting errors
npm run lint

# Format code (if configured)
npm run format
```

## File Watchers

Both Vite (frontend) and Uvicorn (backend) run with hot-reload enabled:

- **Frontend**: Changes to `.jsx`, `.js`, `.css` files auto-refresh
- **Backend**: Changes to `.py` files auto-restart the server

## Network Diagram

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │  HTTP   │                 │  SQL    │                 │
│   Browser       │────────▶│   FastAPI       │────────▶│   Snowflake     │
│   (React App)   │  :5173  │   Backend       │  TCP    │   MDLH DB       │
│                 │◀────────│   :8000         │◀────────│                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

## Next Steps

After setup:

1. **Explore the Dictionary**: Browse entity types by category
2. **Run Sample Queries**: Click "Query" buttons on entities
3. **Use the Query Editor**: Write custom SQL with autocomplete
4. **View Lineage**: Hover over table names to see data flow
5. **Export Data**: Use export buttons to download results




