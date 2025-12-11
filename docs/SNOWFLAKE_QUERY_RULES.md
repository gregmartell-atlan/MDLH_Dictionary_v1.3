# Comprehensive Snowflake Query Instructions

*Everything you need to ensure queries in your tool handle all the nuances of Snowflake querying correctly.*

---

## Table of Contents

1. [Identifier Case Sensitivity & Quoting](#1-identifier-case-sensitivity--quoting)
2. [Data Type Conversion & Casting](#2-data-type-conversion--casting)
3. [Semi-Structured Data (VARIANT/JSON)](#3-semi-structured-data-variantjson)
4. [Timestamp & Timezone Handling](#4-timestamp--timezone-handling)
5. [NULL Handling](#5-null-handling)
6. [String Handling](#6-string-handling)
7. [Parameterized Queries & SQL Injection Prevention](#7-parameterized-queries--sql-injection-prevention)
8. [Session Context Management](#8-session-context-management)
9. [Result Handling by Statement Type](#9-result-handling-by-statement-type)
10. [Multi-Statement Handling](#10-multi-statement-handling)
11. [Snowflake-Only Syntax](#11-snowflake-only-syntax)
12. [Common Functions Reference](#12-common-functions-reference)
13. [Error Handling Patterns](#13-error-handling-patterns)
14. [Connection & Session Management](#14-connection--session-management)
15. [Performance Considerations](#15-performance-considerations)

---

## 1. Identifier Case Sensitivity & Quoting

This is the **#1 source of pain** when building Snowflake tools. Get this wrong and nothing works.

### The Rules

| How identifier was created | How it's stored | How to reference it |
|---------------------------|-----------------|---------------------|
| `CREATE TABLE MyTable` (unquoted) | `MYTABLE` (uppercase) | `mytable`, `MyTable`, `MYTABLE`, or `"MYTABLE"` |
| `CREATE TABLE "MyTable"` (quoted) | `MyTable` (exact case) | **Must use** `"MyTable"` |
| `CREATE TABLE "my table"` (quoted, spaces) | `my table` | **Must use** `"my table"` |

### Golden Rule

> **Unquoted identifiers are stored UPPERCASE and are case-insensitive when referenced.**
> **Quoted identifiers preserve exact case and MUST be referenced with quotes and exact case.**

### Implementation: Identifier Validation & Quoting

```python
import re

def validate_and_quote_identifier(name: str) -> str:
    """
    Safely validate and quote a Snowflake identifier.
    
    - Strips outer quotes if already present (handles pre-quoted input)
    - Handles qualified names (database.schema.table)
    - Always returns safely quoted identifiers
    """
    if not name:
        raise ValueError("Identifier cannot be empty")
    
    if len(name) > 255:
        raise ValueError("Identifier exceeds maximum length of 255 characters")
    
    # Handle already-quoted identifiers (avoid double-quoting)
    if name.startswith('"') and name.endswith('"') and len(name) > 2:
        # Unescape internal doubled quotes, then re-process
        name = name[1:-1].replace('""', '"')
    
    # Split qualified names (but not dots inside quotes)
    parts = _split_qualified_name(name)
    
    validated_parts = []
    for part in parts:
        # Escape internal double quotes by doubling them
        safe_part = part.replace('"', '""')
        validated_parts.append(f'"{safe_part}"')
    
    return '.'.join(validated_parts)

def _split_qualified_name(name: str) -> list:
    """Split database.schema.table respecting quoted sections."""
    parts = []
    current = ""
    in_quotes = False
    
    for char in name:
        if char == '"':
            in_quotes = not in_quotes
            current += char
        elif char == '.' and not in_quotes:
            if current:
                # Remove surrounding quotes for clean processing
                clean = current.strip('"').replace('""', '"')
                parts.append(clean)
            current = ""
        else:
            current += char
    
    if current:
        clean = current.strip('"').replace('""', '"')
        parts.append(clean)
    
    return parts
```

### Common Mistakes

```sql
-- ❌ WRONG: Object was created with quotes, referenced without
CREATE TABLE "CaseSensitive" (id INT);
SELECT * FROM CaseSensitive;  -- ERROR: does not exist (looks for CASESENSITIVE)

-- ✅ CORRECT
SELECT * FROM "CaseSensitive";

-- ❌ WRONG: Double-quoting an already-quoted identifier
-- If user passes "MYTABLE", don't output ""MYTABLE""
SELECT * FROM ""MYTABLE"";  -- ERROR

-- ✅ CORRECT: Strip outer quotes first, then re-quote safely
SELECT * FROM "MYTABLE";
```

### Atlan/MDLH-Specific Gotcha

Atlan's crawler may store qualified names with specific account identifiers that differ from what Snowsight URLs show:

- Atlan stores: `1698696666` (org-based identifier)
- Snowsight URL shows: `qia75894` (account locator)

**These are the same account but your tool won't know that.** You may need to map account identifiers if matching against catalog metadata.

---

## 2. Data Type Conversion & Casting

### Explicit Casting Methods

```sql
-- CAST function (ANSI standard)
CAST(column AS VARCHAR)
CAST('2024-01-01' AS DATE)
CAST('123.45' AS NUMBER(10,2))

-- :: operator (Snowflake/PostgreSQL syntax - shorter)
column::VARCHAR
'2024-01-01'::DATE
json_col:field::STRING

-- TRY_CAST (returns NULL instead of error on failure)
TRY_CAST('not a number' AS INTEGER)  -- Returns NULL, not error
TRY_CAST('2024-13-45' AS DATE)       -- Returns NULL (invalid date)
```

### Implicit Conversion Gotchas

```sql
-- ⚠️ Numeric to string in concatenation
SELECT 'Value: ' || 123;           -- Works (implicit conversion)
SELECT 'Value: ' || NULL;          -- Returns NULL (NULL propagates)
SELECT CONCAT('Value: ', 123);     -- Works

-- ⚠️ String to number comparisons
SELECT * FROM t WHERE num_col > '100';  -- Works but risky
SELECT * FROM t WHERE num_col > 100;    -- Prefer explicit types

-- ⚠️ VARIANT data always needs casting for typed operations
SELECT variant_col + 1;            -- May fail or give unexpected results
SELECT variant_col::NUMBER + 1;    -- Explicit and safe
```

### Numeric Precision

```sql
-- NUMBER(precision, scale)
NUMBER(10,2)    -- 10 digits total, 2 after decimal
NUMBER(38,0)    -- Maximum precision integer
NUMBER          -- Alias for NUMBER(38,0)

-- FLOAT vs NUMBER
FLOAT           -- 64-bit floating point (approximate)
NUMBER(38,10)   -- Exact decimal arithmetic

-- ⚠️ Division returns FLOAT, may lose precision
SELECT 10 / 3;              -- 3.333333... (FLOAT)
SELECT CAST(10 AS NUMBER(10,4)) / 3;  -- More controlled
```

---

## 3. Semi-Structured Data (VARIANT/JSON)

### Accessing JSON Data

```sql
-- Dot notation (preferred for known keys)
SELECT json_col:user_name FROM t;
SELECT json_col:address.city FROM t;        -- Nested
SELECT json_col:items[0] FROM t;            -- Array index
SELECT json_col:items[0].name FROM t;       -- Nested in array

-- Bracket notation (required for special characters, variables)
SELECT json_col['user-name'] FROM t;        -- Key has hyphen
SELECT json_col['address']['city'] FROM t;
SELECT json_col['123'] FROM t;              -- Numeric key

-- ⚠️ JSON keys are CASE-SENSITIVE (unlike table/column names)
SELECT json_col:UserName FROM t;   -- Different from json_col:username
```

### Type of JSON Access Results

```sql
-- JSON/VARIANT access always returns VARIANT
SELECT TYPEOF(json_col:name) FROM t;  -- Returns 'VARCHAR' (the type inside)

-- But the column type is still VARIANT - cast for typed operations
SELECT json_col:age + 1;              -- May work, may not
SELECT json_col:age::NUMBER + 1;      -- Guaranteed to work or error
SELECT json_col:name::STRING;         -- Explicit string extraction
```

### FLATTEN for Arrays

```sql
-- Explode array elements to rows
SELECT 
    t.id,
    f.value AS item,
    f.index AS position
FROM my_table t,
LATERAL FLATTEN(input => t.json_col:items) f;

-- Flatten nested paths
SELECT f.value:name::STRING AS product_name
FROM orders,
LATERAL FLATTEN(input => order_data:line_items) f;

-- Handle NULL/missing arrays safely
SELECT f.value
FROM my_table t,
LATERAL FLATTEN(input => t.json_col:items, OUTER => TRUE) f;
-- OUTER => TRUE keeps rows even if array is NULL/empty
```

### Building JSON

```sql
-- Construct objects
SELECT OBJECT_CONSTRUCT('name', name, 'age', age) FROM users;

-- Construct arrays
SELECT ARRAY_CONSTRUCT(1, 2, 3);
SELECT ARRAY_AGG(column_name) FROM table_name;

-- Parse JSON strings
SELECT PARSE_JSON('{"key": "value"}');
SELECT TRY_PARSE_JSON(maybe_json_col);  -- Returns NULL if invalid
```

### ARRAY_CONTAINS - Critical Syntax

```sql
-- ✅ CORRECT: First arg is value (cast to VARIANT), second is array
WHERE ARRAY_CONTAINS('guid-value'::VARIANT, array_column)

-- ❌ WRONG: Missing VARIANT cast
WHERE ARRAY_CONTAINS('guid-value', array_column)

-- ❌ WRONG: Arguments reversed
WHERE ARRAY_CONTAINS(array_column, 'guid-value'::VARIANT)
```

---

## 4. Timestamp & Timezone Handling

### Timestamp Types

| Type | Behavior |
|------|----------|
| `TIMESTAMP_NTZ` | No timezone - stored as-is, treated as "wall clock" time |
| `TIMESTAMP_LTZ` | Local timezone - stored in UTC, displayed in session TZ |
| `TIMESTAMP_TZ` | Stores timezone with value - includes TZ info |
| `TIMESTAMP` | Alias for session's `TIMESTAMP_TYPE_MAPPING` (default: `TIMESTAMP_NTZ`) |

### Critical Session Parameters

```sql
-- Check current settings
SHOW PARAMETERS LIKE 'TIMEZONE';
SHOW PARAMETERS LIKE 'TIMESTAMP%';

-- Set session timezone
ALTER SESSION SET TIMEZONE = 'America/Los_Angeles';
ALTER SESSION SET TIMEZONE = 'UTC';

-- Control default timestamp type
ALTER SESSION SET TIMESTAMP_TYPE_MAPPING = 'TIMESTAMP_NTZ';
```

### Conversion Functions

```sql
-- Parse strings to timestamps
TO_TIMESTAMP('2024-01-15 10:30:00')
TO_TIMESTAMP('2024-01-15', 'YYYY-MM-DD')
TO_TIMESTAMP_NTZ('2024-01-15 10:30:00')
TO_TIMESTAMP_TZ('2024-01-15 10:30:00 -0800')

-- Convert between types
CONVERT_TIMEZONE('UTC', 'America/New_York', ts_column)
ts_column::TIMESTAMP_NTZ  -- Strips timezone
ts_column::TIMESTAMP_LTZ  -- Interprets in session TZ

-- Extract components
EXTRACT(YEAR FROM ts_col)
DATE_PART('hour', ts_col)
YEAR(ts_col), MONTH(ts_col), DAY(ts_col)
```

### Date Arithmetic

```sql
-- Add/subtract intervals
DATEADD(day, 7, date_col)
DATEADD(hour, -2, timestamp_col)
TIMESTAMPADD(MINUTE, 30, ts_col)

-- Difference between dates
DATEDIFF(day, start_date, end_date)
TIMESTAMPDIFF(HOUR, ts1, ts2)

-- Truncate to period
DATE_TRUNC('month', date_col)   -- First of month
DATE_TRUNC('hour', ts_col)      -- Start of hour
```

### Common Pitfall

```sql
-- ⚠️ Comparing NTZ and LTZ timestamps can give unexpected results
-- if session timezone isn't what you expect

-- Always be explicit about timezone handling:
WHERE ts_col >= CONVERT_TIMEZONE('UTC', '2024-01-01 00:00:00'::TIMESTAMP_NTZ)
```

---

## 5. NULL Handling

### NULL Comparison Operators

```sql
-- ⚠️ NULL comparisons with = always return NULL (not TRUE/FALSE)
WHERE column = NULL     -- WRONG: Always returns no rows
WHERE column IS NULL    -- CORRECT
WHERE column IS NOT NULL

-- NULL-safe equality (returns TRUE if both NULL)
WHERE column IS NOT DISTINCT FROM other_column
WHERE EQUAL_NULL(col1, col2)  -- Snowflake function

-- Check for NULL in expressions
SELECT CASE WHEN col IS NULL THEN 'missing' ELSE col END
```

### NULL Handling Functions

```sql
-- Replace NULL with default
IFNULL(column, 'default')         -- Snowflake
NVL(column, 'default')            -- Oracle-compatible
COALESCE(col1, col2, 'default')   -- First non-NULL (ANSI)

-- Conditional NULL
NULLIF(col1, col2)        -- Returns NULL if col1 = col2
NVL2(col, val_not_null, val_if_null)  -- Different values for NULL vs not

-- Zero handling
ZEROIFNULL(column)        -- Returns 0 if NULL
NULLIFZERO(column)        -- Returns NULL if 0
```

### NULL in Aggregations

```sql
-- COUNT behavior
COUNT(*)        -- Counts all rows including NULL
COUNT(column)   -- Counts non-NULL values only

-- Other aggregates ignore NULL
SUM(column)     -- Ignores NULL
AVG(column)     -- Ignores NULL (doesn't treat as 0!)

-- ⚠️ Be careful with AVG if NULLs mean "zero"
AVG(column)                      -- Ignores NULLs
AVG(COALESCE(column, 0))         -- Treats NULL as 0
```

### NULL in Boolean Logic

```sql
-- NULL AND TRUE = NULL
-- NULL OR FALSE = NULL
-- NOT NULL = NULL

-- Safe boolean evaluation
WHERE COALESCE(boolean_col, FALSE) = TRUE
WHERE boolean_col IS TRUE         -- Only TRUE, not NULL
WHERE boolean_col IS NOT FALSE    -- TRUE or NULL
```

---

## 6. String Handling

### String Functions

```sql
-- Concatenation
SELECT col1 || ' ' || col2           -- Pipe operator (NULL propagates)
SELECT CONCAT(col1, ' ', col2)       -- Function (NULL becomes '')
SELECT CONCAT_WS(', ', col1, col2)   -- With separator

-- Case conversion
UPPER(string), LOWER(string), INITCAP(string)

-- Trimming
TRIM(string), LTRIM(string), RTRIM(string)
TRIM(BOTH 'x' FROM string)

-- Substring
SUBSTRING(string, start, length)
LEFT(string, n), RIGHT(string, n)

-- Search & Replace
REPLACE(string, 'find', 'replace')
REGEXP_REPLACE(string, pattern, replacement)
POSITION('find' IN string)           -- 1-based position
CHARINDEX('find', string)            -- Same thing
```

### Pattern Matching

```sql
-- LIKE (case-sensitive by default)
WHERE col LIKE 'prefix%'
WHERE col LIKE '%suffix'
WHERE col LIKE '%contains%'
WHERE col LIKE '_at'            -- Single character wildcard
WHERE col LIKE 'test\_%' ESCAPE '\'  -- Literal underscore

-- ILIKE (case-insensitive)
WHERE col ILIKE '%ABC%'         -- Matches 'abc', 'ABC', 'Abc'

-- RLIKE / REGEXP (regex)
WHERE col RLIKE '^[0-9]+$'      -- Starts/ends with digits
WHERE REGEXP_LIKE(col, pattern)

-- Pattern extraction
REGEXP_SUBSTR(col, '[0-9]+')              -- First match
REGEXP_SUBSTR(col, '[0-9]+', 1, 2)        -- Second match
```

### String Aggregation

```sql
-- Concatenate values from multiple rows
SELECT LISTAGG(name, ', ') WITHIN GROUP (ORDER BY name)
FROM employees
GROUP BY department;

-- With distinct
SELECT LISTAGG(DISTINCT category, ', ')
FROM products;

-- Array alternative
SELECT ARRAY_AGG(name) FROM employees GROUP BY dept;
SELECT ARRAY_TO_STRING(ARRAY_AGG(name), ', ') FROM ...;
```

### Converting Arrays to Strings

```sql
-- ✅ CORRECT: Cast array to VARCHAR for ILIKE search
WHERE array_column::VARCHAR ILIKE '%search_term%'

-- ❌ WRONG: TO_VARCHAR doesn't work on ARRAY types
WHERE TO_VARCHAR(array_column) ILIKE '%search_term%'  -- ERROR!

-- Alternative: Use ARRAY_TO_STRING
WHERE ARRAY_TO_STRING(array_column, ',') ILIKE '%search_term%'
```

---

## 7. Parameterized Queries & SQL Injection Prevention

### Using the Python Connector

```python
# ✅ CORRECT: Parameterized query
cursor.execute(
    "SELECT * FROM users WHERE id = %s AND status = %s",
    (user_id, status)
)

# ✅ CORRECT: Named parameters
cursor.execute(
    "SELECT * FROM users WHERE id = %(id)s",
    {"id": user_id}
)

# ❌ WRONG: String interpolation (SQL injection risk)
cursor.execute(f"SELECT * FROM users WHERE id = {user_id}")
cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")
```

### What Can Be Parameterized

| Can Parameterize | Cannot Parameterize |
|-----------------|---------------------|
| WHERE clause values | Table names |
| INSERT values | Column names |
| LIMIT values | Schema/database names |
| Function arguments | ORDER BY columns |
|  | Keywords (ASC/DESC) |

### Safe Dynamic Identifiers

For table/column names that must be dynamic, validate and quote:

```python
def safe_query_with_dynamic_table(table_name: str, filters: dict):
    # Validate identifier (see Section 1)
    safe_table = validate_and_quote_identifier(table_name)
    
    # Build query with validated identifier + parameterized values
    query = f"SELECT * FROM {safe_table} WHERE status = %s"
    cursor.execute(query, (filters['status'],))
```

### Additional Validation Layer

```python
# Allowlist approach for table names
ALLOWED_TABLES = {'users', 'orders', 'products'}

def execute_safe_query(table_name: str, where_value: str):
    if table_name.lower() not in ALLOWED_TABLES:
        raise ValueError(f"Invalid table: {table_name}")
    
    cursor.execute(
        f'SELECT * FROM "{table_name.upper()}" WHERE col = %s',
        (where_value,)
    )
```

---

## 8. Session Context Management

### Critical Session Settings

```sql
-- Current context
SELECT CURRENT_DATABASE(), CURRENT_SCHEMA(), CURRENT_WAREHOUSE();
SELECT CURRENT_USER(), CURRENT_ROLE();

-- Set context (persists for session)
USE DATABASE my_database;
USE SCHEMA my_schema;
USE WAREHOUSE my_warehouse;
USE ROLE my_role;

-- Or in single query
USE SECONDARY ROLES ALL;  -- Enable secondary roles
```

### Query-Level Context

```sql
-- Fully qualified names bypass session context
SELECT * FROM my_db.my_schema.my_table;

-- Warehouse for specific query (if permitted)
-- Can't change warehouse mid-query, but can in session before query
```

### Python: Session vs Query Context

```python
# Set context when connecting
conn = snowflake.connector.connect(
    account=account,
    user=user,
    password=password,
    database='MY_DB',      # Default database
    schema='MY_SCHEMA',    # Default schema
    warehouse='MY_WH',     # Default warehouse
    role='MY_ROLE'         # Role to use
)

# Or set after connecting
cursor.execute("USE DATABASE other_db")
cursor.execute("USE SCHEMA other_schema")

# Context persists for all queries on this connection
```

### Session Parameter Reference

```sql
-- Show all session parameters
SHOW PARAMETERS;

-- Important ones for query behavior
ALTER SESSION SET QUERY_TAG = 'my_app:feature:v1';  -- Tag for tracking
ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = 300;
ALTER SESSION SET ROWS_PER_RESULTSET = 10000;
ALTER SESSION SET TIMESTAMP_TYPE_MAPPING = 'TIMESTAMP_NTZ';
ALTER SESSION SET DATE_OUTPUT_FORMAT = 'YYYY-MM-DD';
ALTER SESSION SET QUOTED_IDENTIFIERS_IGNORE_CASE = FALSE;  -- Don't touch this!
```

---

## 9. Result Handling by Statement Type

Your tool needs to handle different statement types differently:

| Statement Type | Keywords | Expected Result |
|---------------|----------|-----------------|
| DQL (Query) | `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `DESC`, `EXPLAIN` | Tabular data with columns and rows |
| DML (Modify) | `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `TRUNCATE` | Row count affected |
| DDL (Define) | `CREATE`, `ALTER`, `DROP`, `RENAME` | Success message |
| Session | `USE`, `SET` | Success message |
| Procedure | `CALL`, `EXECUTE` | Varies (tabular or scalar) |
| Transaction | `BEGIN`, `COMMIT`, `ROLLBACK` | Success message |

### Detection Logic

```python
def get_statement_type(sql: str) -> str:
    """Determine statement type from first keyword(s)."""
    # Remove comments and normalize
    clean = re.sub(r'--.*$', '', sql, flags=re.MULTILINE)
    clean = re.sub(r'/\*.*?\*/', '', clean, flags=re.DOTALL)
    clean = clean.strip().upper()
    
    if clean.startswith(('SELECT', 'WITH', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN')):
        return 'QUERY'
    elif clean.startswith(('INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE')):
        return 'DML'
    elif clean.startswith(('CREATE', 'ALTER', 'DROP', 'RENAME')):
        return 'DDL'
    elif clean.startswith(('USE', 'SET')):
        return 'SESSION'
    elif clean.startswith(('CALL', 'EXECUTE')):
        return 'PROCEDURE'
    elif clean.startswith(('BEGIN', 'COMMIT', 'ROLLBACK')):
        return 'TRANSACTION'
    else:
        return 'UNKNOWN'
```

---

## 10. Multi-Statement Handling

### Statement Splitting

```python
def split_statements(sql: str) -> list:
    """
    Split SQL on semicolons, respecting:
    - Quoted strings ('...', "...")
    - Comments (-- and /* */)
    - Dollar-quoted blocks (Snowflake scripting)
    """
    statements = []
    current = []
    in_single_quote = False
    in_double_quote = False
    in_block_comment = False
    i = 0
    chars = list(sql)
    
    while i < len(chars):
        c = chars[i]
        
        # Handle block comments
        if not in_single_quote and not in_double_quote:
            if c == '/' and i + 1 < len(chars) and chars[i + 1] == '*':
                in_block_comment = True
                current.extend(['/', '*'])
                i += 2
                continue
            if in_block_comment and c == '*' and i + 1 < len(chars) and chars[i + 1] == '/':
                in_block_comment = False
                current.extend(['*', '/'])
                i += 2
                continue
        
        if in_block_comment:
            current.append(c)
            i += 1
            continue
        
        # Handle line comments
        if not in_single_quote and not in_double_quote:
            if c == '-' and i + 1 < len(chars) and chars[i + 1] == '-':
                # Find end of line
                end = sql.find('\n', i)
                if end == -1:
                    current.extend(chars[i:])
                    break
                current.extend(chars[i:end + 1])
                i = end + 1
                continue
        
        # Handle quotes
        if c == "'" and not in_double_quote:
            in_single_quote = not in_single_quote
        elif c == '"' and not in_single_quote:
            in_double_quote = not in_double_quote
        
        # Handle semicolon (statement delimiter)
        if c == ';' and not in_single_quote and not in_double_quote:
            stmt = ''.join(current).strip()
            if stmt:
                statements.append(stmt)
            current = []
        else:
            current.append(c)
        
        i += 1
    
    # Don't forget the last statement (may not end with ;)
    final = ''.join(current).strip()
    if final:
        statements.append(final)
    
    return statements
```

### Execution Strategy

```python
def execute_multi_statement(cursor, sql: str):
    """Execute multiple statements and collect all results."""
    statements = split_statements(sql)
    results = []
    
    for stmt in statements:
        stmt_type = get_statement_type(stmt)
        cursor.execute(stmt)
        
        if stmt_type == 'QUERY':
            results.append({
                'statement': stmt[:100] + '...' if len(stmt) > 100 else stmt,
                'type': stmt_type,
                'columns': [col[0] for col in cursor.description],
                'rows': cursor.fetchall()
            })
        else:
            results.append({
                'statement': stmt[:100] + '...' if len(stmt) > 100 else stmt,
                'type': stmt_type,
                'rowcount': cursor.rowcount,
                'message': f'{cursor.rowcount} rows affected'
            })
    
    return results
```

---

## 11. Snowflake-Only Syntax

These features work **only in Snowflake** - don't use them if you need cross-database compatibility:

### QUALIFY Clause

```sql
-- Filter on window function results (no subquery needed!)
SELECT *
FROM sales
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY sale_date DESC) = 1;

-- Equivalent in standard SQL (more verbose):
SELECT * FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY sale_date DESC) as rn
    FROM sales
) WHERE rn = 1;
```

### Time Travel

```sql
-- Query historical data
SELECT * FROM my_table AT(TIMESTAMP => '2024-01-01 00:00:00'::TIMESTAMP);
SELECT * FROM my_table AT(OFFSET => -3600);  -- 1 hour ago (in seconds)
SELECT * FROM my_table BEFORE(STATEMENT => 'query-id-here');

-- Restore dropped table
UNDROP TABLE my_table;
```

### Cloning

```sql
-- Zero-copy clone (instant, no storage cost until changes)
CREATE TABLE clone_table CLONE source_table;
CREATE SCHEMA clone_schema CLONE source_schema;
CREATE DATABASE clone_db CLONE source_db;

-- Clone at point in time
CREATE TABLE clone_table CLONE source_table AT(TIMESTAMP => '2024-01-01'::TIMESTAMP);
```

### Other Snowflake-Specific Features

```sql
-- RESULT_SCAN - query results of previous query
SELECT * FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));
SELECT * FROM TABLE(RESULT_SCAN('specific-query-id'));

-- SAMPLE / TABLESAMPLE
SELECT * FROM big_table SAMPLE (10);         -- 10% of rows
SELECT * FROM big_table SAMPLE (1000 ROWS);  -- 1000 rows
SELECT * FROM big_table TABLESAMPLE BERNOULLI (10);

-- GROUP BY ALL (auto-detect non-aggregated columns)
SELECT category, region, SUM(sales)
FROM sales_data
GROUP BY ALL;  -- Automatically groups by category, region

-- CREATE OR REPLACE (most object types)
CREATE OR REPLACE TABLE my_table (...);
CREATE OR REPLACE VIEW my_view AS ...;
```

---

## 12. Common Functions Reference

### Aggregate Functions

```sql
COUNT(*), COUNT(col), COUNT(DISTINCT col)
SUM(col), AVG(col), MIN(col), MAX(col)
MEDIAN(col)
PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY col)
PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY col)
STDDEV(col), VARIANCE(col)
LISTAGG(col, ', ') WITHIN GROUP (ORDER BY col)
ARRAY_AGG(col), OBJECT_AGG(key, value)
```

### String Functions

```sql
CONCAT(a, b, c), a || b || c
LENGTH(str), CHAR_LENGTH(str)
UPPER(str), LOWER(str), INITCAP(str)
TRIM(str), LTRIM(str), RTRIM(str)
SUBSTRING(str, start, len), LEFT(str, n), RIGHT(str, n)
REPLACE(str, find, replace)
SPLIT(str, delimiter), SPLIT_PART(str, delimiter, part)
REGEXP_REPLACE(str, pattern, replacement)
REGEXP_SUBSTR(str, pattern)
```

### Date/Time Functions

```sql
CURRENT_DATE, CURRENT_TIMESTAMP, CURRENT_TIME
DATEADD(part, amount, date), DATEDIFF(part, start, end)
DATE_TRUNC(part, date)
EXTRACT(part FROM date), DATE_PART(part, date)
TO_DATE(str), TO_TIMESTAMP(str)
YEAR(d), MONTH(d), DAY(d), HOUR(ts), MINUTE(ts), SECOND(ts)
DAYOFWEEK(d), DAYOFYEAR(d), WEEKOFYEAR(d)
LAST_DAY(date), NEXT_DAY(date, 'Monday')
```

### Conditional Functions

```sql
CASE WHEN cond THEN val ELSE other END
IFF(condition, true_val, false_val)  -- Snowflake ternary
IFNULL(col, default), NVL(col, default)
NVL2(col, val_if_not_null, val_if_null)
NULLIF(a, b), COALESCE(a, b, c, ...)
DECODE(col, val1, result1, val2, result2, ..., default)
ZEROIFNULL(col), NULLIFZERO(col)
```

### Type Conversion

```sql
CAST(expr AS type), expr::type
TRY_CAST(expr AS type)  -- Returns NULL on failure
TO_CHAR(val, format), TO_VARCHAR(val)
TO_NUMBER(str), TO_DECIMAL(str, precision, scale)
TO_DATE(str, format), TO_TIMESTAMP(str, format)
TO_VARIANT(val), TO_OBJECT(val), TO_ARRAY(val)
PARSE_JSON(str), TRY_PARSE_JSON(str)
```

---

## 13. Error Handling Patterns

### Common Error Codes

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| 000606 | Object does not exist | Bad table/schema name, wrong case |
| 001003 | SQL compilation error | Syntax error, invalid identifier |
| 001007 | Invalid type for parameter | Wrong data type (e.g., TO_VARCHAR on ARRAY) |
| 002003 | Invalid identifier | Reserved word used unquoted |
| 090105 | Cannot perform operation | Permission denied |
| 100132 | Numeric overflow | Value too large for column |
| 390114 | Authentication token expired | Session timeout |
| 250001 | Warehouse suspended | Need to resume or wait |

### Python Error Handling

```python
import snowflake.connector
from snowflake.connector.errors import (
    ProgrammingError,
    OperationalError,
    DatabaseError,
    InterfaceError
)

def execute_with_error_handling(cursor, sql):
    try:
        cursor.execute(sql)
        return cursor.fetchall()
    
    except ProgrammingError as e:
        # SQL syntax or semantic errors
        error_code = e.errno
        if error_code == 606:
            raise ObjectNotFoundError(f"Object not found: {e.msg}")
        elif error_code == 1003:
            raise SQLSyntaxError(f"Syntax error: {e.msg}")
        raise
    
    except OperationalError as e:
        # Connection, timeout, resource issues
        if e.errno == 250001:
            cursor.execute("ALTER WAREHOUSE my_wh RESUME")
            return execute_with_error_handling(cursor, sql)  # Retry
        raise
    
    except DatabaseError as e:
        # General database errors
        raise
    
    except InterfaceError as e:
        # Connection interface issues
        raise ConnectionError(f"Connection problem: {e}")
```

### Validation Before Execution

```python
def validate_query(sql: str) -> list:
    """Basic client-side validation before sending to Snowflake."""
    errors = []
    
    # Check balanced parentheses
    if sql.count('(') != sql.count(')'):
        errors.append("Unbalanced parentheses")
    
    # Check balanced quotes (basic check)
    single_quotes = sql.count("'") - sql.count("\\'") - sql.count("''")
    if single_quotes % 2 != 0:
        errors.append("Unbalanced single quotes")
    
    # Check for empty statement
    if not sql.strip() or sql.strip() == ';':
        errors.append("Empty statement")
    
    return errors
```

---

## 14. Connection & Session Management

### Connection Best Practices

```python
import snowflake.connector
from contextlib import contextmanager

@contextmanager
def get_snowflake_connection(config):
    """Context manager for safe connection handling."""
    conn = None
    try:
        conn = snowflake.connector.connect(
            account=config['account'],
            user=config['user'],
            password=config.get('password'),
            authenticator=config.get('authenticator', 'snowflake'),
            private_key=config.get('private_key'),
            database=config.get('database'),
            schema=config.get('schema'),
            warehouse=config.get('warehouse'),
            role=config.get('role'),
            # Performance settings
            client_session_keep_alive=True,
            client_session_keep_alive_heartbeat_frequency=900,  # 15 min
            # Timeout settings
            login_timeout=30,
            network_timeout=30,
        )
        yield conn
    finally:
        if conn:
            conn.close()

# Usage
with get_snowflake_connection(config) as conn:
    with conn.cursor() as cursor:
        cursor.execute("SELECT 1")
```

### Session Keepalive

For long-running applications:

```python
# Enable keepalive at connection time
conn = snowflake.connector.connect(
    ...,
    client_session_keep_alive=True,
    client_session_keep_alive_heartbeat_frequency=900  # seconds
)

# Or check connection health periodically
def is_connection_alive(conn):
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        return True
    except:
        return False
```

### SSO/OAuth Token Handling

```python
# For externalbrowser (SSO) authentication
conn = snowflake.connector.connect(
    account=account,
    user=user,
    authenticator='externalbrowser',
    # Token caching (reduces re-auth prompts)
    client_store_temporary_credential=True,
)

# Token expiration is typically 4 hours for SSO
# Handle 390114 error by prompting re-auth
```

---

## 15. Performance Considerations

### Query Optimization Tips

```sql
-- Use LIMIT during development
SELECT * FROM big_table LIMIT 100;

-- Project only needed columns
SELECT col1, col2 FROM t;  -- Not SELECT *

-- Filter early (predicate pushdown)
SELECT * FROM large_table WHERE date_col >= '2024-01-01';

-- Use EXPLAIN to understand query plan
EXPLAIN SELECT * FROM t WHERE col = 'value';
EXPLAIN USING TABULAR SELECT ...;
```

### Warehouse Sizing

```sql
-- Check warehouse size
SHOW WAREHOUSES;

-- Auto-suspend/resume
ALTER WAREHOUSE my_wh SET
    AUTO_SUSPEND = 60,          -- Suspend after 60s idle
    AUTO_RESUME = TRUE,
    MIN_CLUSTER_COUNT = 1,
    MAX_CLUSTER_COUNT = 3;      -- Multi-cluster for concurrency
```

### Result Pagination

```python
# For large result sets, use pagination
cursor = conn.cursor()
cursor.execute("SELECT * FROM big_table")

batch_size = 10000
while True:
    rows = cursor.fetchmany(batch_size)
    if not rows:
        break
    process_rows(rows)
```

### Async Queries

```python
# For long-running queries, use async mode
cursor.execute_async("SELECT * FROM huge_table")
query_id = cursor.sfqid

# Check status
status = conn.get_query_status(query_id)
while conn.is_still_running(status):
    time.sleep(5)
    status = conn.get_query_status(query_id)

# Get results
cursor.get_results_from_sfqid(query_id)
results = cursor.fetchall()
```

---

## Quick Reference Card

### Most Common Gotchas

1. **Case sensitivity**: Unquoted → UPPERCASE, quoted → exact case
2. **JSON keys ARE case-sensitive** (unlike table names)
3. **VARIANT needs casting** for typed operations
4. **NULL comparisons** use `IS NULL`, not `= NULL`
5. **Empty string ≠ NULL** in Snowflake
6. **TIMESTAMP_NTZ is the default** - be explicit about timezones
7. **Parameterize values, validate identifiers** - no string interpolation
8. **COUNT(*) vs COUNT(col)** - former counts all rows, latter excludes NULL
9. **FLOAT vs NUMBER** - use NUMBER for exact decimal arithmetic
10. **Session context persists** - always specify database.schema.table when unsure
11. **ARRAY_CONTAINS needs ::VARIANT** - first arg is value, second is array
12. **TO_VARCHAR doesn't work on ARRAY** - use `::VARCHAR` cast instead

### Statement Type → Result Type

| First Keyword | Result |
|--------------|--------|
| SELECT, WITH, SHOW, DESCRIBE | Rows + Columns |
| INSERT, UPDATE, DELETE, MERGE | Row count |
| CREATE, ALTER, DROP | Success/Failure |
| USE, SET | Success |

### Common Functions Cheat Sheet

| Need | Use |
|------|-----|
| Replace NULL | `COALESCE(col, default)` or `NVL(col, default)` |
| Safe cast | `TRY_CAST(col AS type)` |
| JSON field | `col:field::STRING` |
| Filter window | `QUALIFY ROW_NUMBER() OVER (...) = 1` |
| Case-insensitive search | `ILIKE '%pattern%'` |
| String list from rows | `LISTAGG(col, ', ')` |
| Current time in UTC | `CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())` |
| Check array contains | `ARRAY_CONTAINS(value::VARIANT, array_col)` |
| Array to string for search | `array_col::VARCHAR ILIKE '%term%'` |

---

*Last updated: December 2025*
*Compiled from production lessons learned building the MDLH Dictionary tool*


