# Snowflake Query API Backend

FastAPI backend for the MDLH Dictionary Snowflake query execution.

## Setup

### 1. Create Virtual Environment

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

Copy `.env.example` to `.env` and configure your Snowflake credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Snowflake settings:

```env
SNOWFLAKE_ACCOUNT=your_account.region
SNOWFLAKE_USER=your_user
SNOWFLAKE_PRIVATE_KEY_PATH=./private_key.pem
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_DATABASE=ATLAN_MDLH
SNOWFLAKE_ROLE=ACCOUNTADMIN
```

### 4. Set Up Key-Pair Authentication (Recommended)

Generate an RSA key pair:

```bash
# Generate private key
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out private_key.pem -nocrypt

# Generate public key
openssl rsa -in private_key.pem -pubout -out public_key.pem
```

Register the public key in Snowflake:

```sql
ALTER USER your_user SET RSA_PUBLIC_KEY='MIIBIjANBg...';
```

### 5. Run the Server

```bash
# Development mode with auto-reload
uvicorn app.main:app --reload --port 8000

# Or using the built-in start function
python -m app.main
```

## API Endpoints

### Connection
- `POST /api/connect` - Test connection
- `GET /api/session/status` - Check session health
- `POST /api/disconnect` - Close connection

### Metadata
- `GET /api/metadata/databases` - List databases
- `GET /api/metadata/schemas?database=X` - List schemas
- `GET /api/metadata/tables?database=X&schema=Y` - List tables/views
- `GET /api/metadata/columns?database=X&schema=Y&table=Z` - Get columns
- `POST /api/metadata/refresh` - Clear metadata cache

### Query Execution
- `POST /api/query/execute` - Execute SQL query
- `GET /api/query/{id}/status` - Get query status
- `GET /api/query/{id}/results` - Get paginated results
- `POST /api/query/{id}/cancel` - Cancel running query
- `GET /api/query/history` - List query history

## API Documentation

Once running, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

