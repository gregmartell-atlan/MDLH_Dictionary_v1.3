# MDLH Dictionary - Comprehensive Test Plan

**Scope:** All query flows, backend services, frontend UI, and performance benchmarks  
**Version:** 1.0  
**Last Updated:** December 2025

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Backend Tests](#2-backend-tests)
3. [Frontend Tests](#3-frontend-tests)
4. [Query Flow Tests (End-to-End)](#4-query-flow-tests-end-to-end)
5. [Performance & Load Tests](#5-performance--load-tests)
6. [Security Tests](#6-security-tests)
7. [Error Handling Tests](#7-error-handling-tests)
8. [Test Data Requirements](#8-test-data-requirements)
9. [Acceptance Criteria](#9-acceptance-criteria)

---

## 1. Test Environment Setup

### 1.1 Prerequisites

| Component | Requirement | Verification Command |
|-----------|-------------|---------------------|
| Node.js | v18+ | `node --version` |
| Python | 3.9+ | `python --version` |
| Snowflake CLI | Latest | `snow --version` |
| React DevTools | Installed | Browser extension check |
| Network access | Snowflake endpoint | `ping <account>.snowflakecomputing.com` |

### 1.2 Environment Variables

```bash
# .env.test
SNOWFLAKE_ACCOUNT=<test_account>
SNOWFLAKE_USER=<test_user>
SNOWFLAKE_PASSWORD=<test_password>
SNOWFLAKE_WAREHOUSE=<test_warehouse>
SNOWFLAKE_ROLE=<test_role>
METADATA_DATABASE=<metadata_db>
METADATA_SCHEMA=<metadata_schema>

# Performance thresholds
MAX_DISCOVERY_TIME_MS=5000
MAX_SIMPLE_QUERY_TIME_MS=3000
MAX_LINEAGE_QUERY_TIME_MS=10000
MAX_UI_RENDER_TIME_MS=500
```

### 1.3 Test Data Setup

```sql
-- Run once to create test fixtures
-- See Section 8 for full test data requirements

-- Verify metadata tables exist
SELECT table_name, row_count 
FROM information_schema.tables 
WHERE table_schema = '<METADATA_SCHEMA>'
ORDER BY row_count DESC;

-- Verify ACCOUNT_USAGE access
SELECT 1 FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY LIMIT 1;
```

---

## 2. Backend Tests

### 2.1 Discovery Service Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| BE-D-001 | Table discovery | Discover all tables in metadata schema | Returns list with row_count, bytes, last_altered | P0 |
| BE-D-002 | Column discovery | Discover columns for each table | Returns column_name, data_type, ordinal_position | P0 |
| BE-D-003 | Empty schema handling | Discovery on empty schema | Returns empty list, no error | P1 |
| BE-D-004 | Permission denied | Discovery without SELECT grant | Returns clear permission error | P1 |
| BE-D-005 | ACCOUNT_USAGE check | Verify ACCOUNT_USAGE access | Returns boolean success/fail | P0 |
| BE-D-006 | Discovery caching | Second discovery within TTL | Returns cached result, no query | P2 |
| BE-D-007 | Discovery timeout | Very large schema (1000+ tables) | Completes within MAX_DISCOVERY_TIME_MS | P1 |

### 2.2 Table Categorization Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| BE-C-001 | ASSETS categorization | TABLE_ENTITY → ASSETS_TABLE | Correct semantic key mapping | P0 |
| BE-C-002 | LINEAGE categorization | PROCESS_ENTITY → LINEAGE_PROCESS | Correct semantic key mapping | P0 |
| BE-C-003 | GLOSSARY categorization | ATLASGLOSSARYTERM_ENTITY → GLOSSARY_TERM | Correct semantic key mapping | P0 |
| BE-C-004 | DBT categorization | DBTMODEL_ENTITY → DBT_MODEL | Correct semantic key mapping | P1 |
| BE-C-005 | Multiple matches | Two tables match same pattern | Pick one with higher row_count | P0 |
| BE-C-006 | No matches | Table doesn't match any pattern | Not included in tableMap | P1 |
| BE-C-007 | Case insensitivity | table_entity vs TABLE_ENTITY | Both match ASSETS_TABLE | P1 |

### 2.3 Validation Service Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| BE-V-001 | Valid identifier | CUSTOMER_DIM | Passes validation | P0 |
| BE-V-002 | SQL injection attempt | CUSTOMER; DROP TABLE | Throws error | P0 |
| BE-V-003 | Invalid characters | TABLE@NAME | Throws error | P0 |
| BE-V-004 | Too long identifier | 256+ character string | Throws error | P1 |
| BE-V-005 | Empty identifier | Empty string | Throws error | P0 |
| BE-V-006 | Unknown table | Valid format but not in allowlist | Throws error | P0 |
| BE-V-007 | Case handling | customer_dim vs CUSTOMER_DIM | Both pass (case-insensitive) | P1 |

### 2.4 Query Builder Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| BE-Q-001 | CORE.BROWSE build | Build table browse query | Valid SQL, correct table ref | P0 |
| BE-Q-002 | CORE.LINEAGE build | Build downstream lineage query | Valid recursive CTE | P0 |
| BE-Q-003 | GLOSSARY.BROWSE build | Build glossary terms query | Valid SQL, handles missing columns | P0 |
| BE-Q-004 | REL_DB.USAGE build | Build usage history query | Valid SQL, uses ACCOUNT_USAGE | P1 |
| BE-Q-005 | DBT.BROWSE build | Build dbt models query | Valid SQL or null if no DBT tables | P1 |
| BE-Q-006 | Missing required table | Build query when table missing | Returns null, not error | P0 |
| BE-Q-007 | Missing optional column | Build query when column missing | Uses fallback or NULL | P0 |
| BE-Q-008 | Limit enforcement | ctx.limit = 1000000 | Capped at safe maximum | P1 |
| BE-Q-009 | Depth enforcement | ctx.maxDepth = 100 | Capped at safe maximum | P1 |

### 2.5 Query Execution Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| BE-E-001 | Successful execution | Run valid query | Returns columns + rows | P0 |
| BE-E-002 | Empty results | Query returns 0 rows | Returns empty array, no error | P0 |
| BE-E-003 | Query timeout | Query exceeds timeout | Returns timeout error | P1 |
| BE-E-004 | Syntax error | Malformed SQL | Returns syntax error message | P0 |
| BE-E-005 | Permission denied | Query on forbidden table | Returns permission error | P1 |
| BE-E-006 | Result transformation | VARIANT/ARRAY columns | Properly parsed to JS objects | P0 |
| BE-E-007 | Large result set | 10,000+ rows | Handles without memory issues | P2 |

---

## 3. Frontend Tests

### 3.1 Discovery UI Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| FE-D-001 | Discovery trigger | Page load triggers discovery | Loading state → results | P0 |
| FE-D-002 | Discovery loading | During discovery | Shows spinner + "Discovering..." | P0 |
| FE-D-003 | Discovery success | Discovery completes | Shows table list with row counts | P0 |
| FE-D-004 | Discovery error | Discovery fails | Shows error message + retry button | P0 |
| FE-D-005 | Empty discovery | No tables found | Shows empty state message | P1 |

### 3.2 Wizard Flow Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| FE-W-001 | Domain selection | Click domain card | Advances to intent step | P0 |
| FE-W-002 | Intent selection | Click intent option | Advances to input step | P0 |
| FE-W-003 | Table dropdown | Open table selector | Shows tables sorted by row_count | P0 |
| FE-W-004 | Empty table warning | Select table with 0 rows | Shows amber warning | P0 |
| FE-W-005 | Input validation | Enter invalid input | Shows validation error | P0 |
| FE-W-006 | Back navigation | Click back button | Returns to previous step | P1 |
| FE-W-007 | Reset wizard | Click reset/start over | Returns to domain selection | P1 |
| FE-W-008 | Disabled intent | Intent missing required tables | Shows disabled with reason | P0 |

### 3.3 Query Input Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| FE-I-001 | Text input | Enter table name | Updates state, enables submit | P0 |
| FE-I-002 | GUID input | Enter valid GUID | Validates format, enables submit | P0 |
| FE-I-003 | Invalid GUID | Enter malformed GUID | Shows format error | P1 |
| FE-I-004 | Depth slider | Adjust lineage depth | Updates value, shows preview | P0 |
| FE-I-005 | Limit input | Enter result limit | Validates range (1-1000) | P1 |
| FE-I-006 | Search filter | Enter search term | Filters available options | P1 |
| FE-I-007 | Autocomplete | Type partial name | Shows matching suggestions | P2 |

### 3.4 Results Display Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| FE-R-001 | Results grid | Query returns data | Shows sortable data grid | P0 |
| FE-R-002 | Column headers | Grid renders | Shows column names with types | P0 |
| FE-R-003 | Empty results | Query returns 0 rows | Shows empty state with explanation | P0 |
| FE-R-004 | ARRAY rendering | Column contains array | Shows "[N items]" with expand | P0 |
| FE-R-005 | OBJECT rendering | Column contains JSON | Shows "{...}" with expand | P0 |
| FE-R-006 | NULL rendering | Column is null | Shows "—" or styled null | P1 |
| FE-R-007 | GUID formatting | Column is identifier | Monospace font, copy button | P1 |
| FE-R-008 | Timestamp formatting | Column is timestamp | Human-readable date | P1 |
| FE-R-009 | Result pagination | 100+ rows | Shows pagination controls | P1 |
| FE-R-010 | Column sorting | Click column header | Sorts by that column | P2 |
| FE-R-011 | Copy results | Click copy button | Copies as CSV/JSON | P2 |

### 3.5 SQL Preview Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| FE-S-001 | SQL display | Before execution | Shows formatted SQL | P0 |
| FE-S-002 | SQL copy | Click copy button | Copies SQL to clipboard | P1 |
| FE-S-003 | SQL syntax highlighting | SQL renders | Keywords highlighted | P2 |
| FE-S-004 | SQL toggle | Click show/hide | Expands/collapses SQL panel | P2 |

### 3.6 Warning/Error Display Tests

| Test ID | Test Name | Description | Expected Result | Priority |
|---------|-----------|-------------|-----------------|----------|
| FE-E-001 | API error | Backend returns error | Shows error banner | P0 |
| FE-E-002 | Network error | Request fails | Shows retry option | P0 |
| FE-E-003 | Warning display | Query has warnings | Shows amber warning banner | P0 |
| FE-E-004 | Multiple warnings | 2+ warnings | Shows all warnings | P1 |
| FE-E-005 | Error recovery | After error, retry works | Clears error, shows results | P1 |

---

## 4. Query Flow Tests (End-to-End)

### 4.1 CORE Domain Flows

| Test ID | Flow | Steps | Expected Result | Priority |
|---------|------|-------|-----------------|----------|
| E2E-C-001 | Browse Tables | Domain → CORE → Browse → Run | Grid with table names, row counts | P0 |
| E2E-C-002 | Browse Columns | Domain → CORE → Browse Columns → Enter table → Run | Grid with column names, types | P1 |
| E2E-C-003 | Downstream Lineage | Domain → CORE → Lineage → Downstream → Enter GUID → Depth 2 → Run | Grid with process GUIDs, depths | P0 |
| E2E-C-004 | Upstream Lineage | Domain → CORE → Lineage → Upstream → Enter GUID → Run | Grid with upstream processes | P0 |
| E2E-C-005 | Search Assets | Domain → CORE → Search → Enter term → Run | Grid with matching assets | P1 |

### 4.2 GLOSSARY Domain Flows

| Test ID | Flow | Steps | Expected Result | Priority |
|---------|------|-------|-----------------|----------|
| E2E-G-001 | Browse Terms | Domain → Glossary → Browse → Run | Grid with term names, descriptions | P0 |
| E2E-G-002 | Search Terms | Domain → Glossary → Search → Enter term → Run | Grid with matching terms | P1 |
| E2E-G-003 | Term Impact | Domain → Glossary → Impact → Enter term → Run | Grid with linked assets | P2 |

### 4.3 REL_DB Domain Flows

| Test ID | Flow | Steps | Expected Result | Priority |
|---------|------|-------|-----------------|----------|
| E2E-R-001 | Table Usage | Domain → REL_DB → Usage → Enter table name → Run | Grid with users, query counts | P1 |
| E2E-R-002 | Popular Tables | Domain → REL_DB → Usage → Top Tables → Run | Grid sorted by query count | P2 |

### 4.4 DBT Domain Flows

| Test ID | Flow | Steps | Expected Result | Priority |
|---------|------|-------|-----------------|----------|
| E2E-D-001 | Browse Models | Domain → dbt → Browse → Run | Grid with model names, status | P1 |
| E2E-D-002 | Model Lineage | Domain → dbt → Lineage → Enter model → Run | Grid with upstream/downstream | P2 |
| E2E-D-003 | No dbt Tables | Domain → dbt (when no dbt tables) | Shows "dbt not configured" message | P1 |

### 4.5 Edge Case Flows

| Test ID | Flow | Steps | Expected Result | Priority |
|---------|------|-------|-----------------|----------|
| E2E-E-001 | Empty lineage | Query asset with no lineage | Empty state with explanation | P0 |
| E2E-E-002 | Very deep lineage | Depth = 5 on complex graph | Results (may be slow), warning shown | P1 |
| E2E-E-003 | Non-existent GUID | Enter GUID that doesn't exist | Empty results, not error | P1 |
| E2E-E-004 | Special characters | Search for table_name$v2 | Handles correctly, no SQL error | P1 |
| E2E-E-005 | Large search results | Search returns 500+ rows | Pagination works, no crash | P2 |

---

## 5. Performance & Load Tests

### 5.1 Query Performance Benchmarks

| Test ID | Query Type | Threshold | Measurement | Priority |
|---------|------------|-----------|-------------|----------|
| PERF-001 | Discovery (full schema) | < 5s | End-to-end time | P0 |
| PERF-002 | Simple browse (100 rows) | < 2s | Query + render time | P0 |
| PERF-003 | Lineage depth=1 | < 3s | Query + render time | P0 |
| PERF-004 | Lineage depth=3 | < 10s | Query + render time | P1 |
| PERF-005 | Glossary browse | < 2s | Query + render time | P1 |
| PERF-006 | Usage history (30 days) | < 5s | Query + render time | P1 |
| PERF-007 | Search (broad term) | < 3s | Query + render time | P1 |

### 5.2 UI Performance Tests

| Test ID | Scenario | Threshold | Measurement | Priority |
|---------|----------|-----------|-------------|----------|
| PERF-U-001 | Initial page load | < 2s | Time to interactive | P0 |
| PERF-U-002 | Wizard step transition | < 200ms | Step change render | P1 |
| PERF-U-003 | Results grid render (100 rows) | < 500ms | Grid mount time | P0 |
| PERF-U-004 | Results grid render (1000 rows) | < 2s | Grid mount time | P1 |
| PERF-U-005 | Dropdown with 100 options | < 300ms | Open to visible | P1 |
| PERF-U-006 | ARRAY cell expansion | < 100ms | Click to expanded | P2 |

### 5.3 Load Tests

| Test ID | Scenario | Load | Success Criteria | Priority |
|---------|----------|------|------------------|----------|
| LOAD-001 | Concurrent discoveries | 10 simultaneous | All complete < 10s | P2 |
| LOAD-002 | Concurrent queries | 20 simultaneous | All complete < 15s | P2 |
| LOAD-003 | Rapid query succession | 10 queries in 5s | No failures, no memory leak | P2 |
| LOAD-004 | Long session | 100 queries over 10min | Memory stable, no degradation | P2 |

### 5.4 Memory & Resource Tests

| Test ID | Scenario | Limit | Measurement | Priority |
|---------|----------|-------|-------------|----------|
| MEM-001 | Initial page load | < 100MB | Heap snapshot | P2 |
| MEM-002 | After 10 queries | < 150MB | Heap snapshot | P2 |
| MEM-003 | Large result set (10k rows) | < 200MB | Heap during render | P2 |
| MEM-004 | Memory leak check | Stable after 50 queries | Heap comparison | P2 |

---

## 6. Security Tests

### 6.1 Input Validation

| Test ID | Test Name | Input | Expected Result | Priority |
|---------|-----------|-------|-----------------|----------|
| SEC-001 | SQL injection - basic | `'; DROP TABLE --` | Rejected, no execution | P0 |
| SEC-002 | SQL injection - UNION | `' UNION SELECT * FROM` | Rejected | P0 |
| SEC-003 | SQL injection - comments | `/**/UNION/**/SELECT` | Rejected | P0 |
| SEC-004 | XSS in input | `<script>alert(1)</script>` | Escaped in display | P0 |
| SEC-005 | Path traversal | `../../../etc/passwd` | Rejected | P1 |
| SEC-006 | Oversized input | 1MB string | Rejected with size error | P1 |

### 6.2 Authorization

| Test ID | Test Name | Scenario | Expected Result | Priority |
|---------|-----------|----------|-----------------|----------|
| SEC-A-001 | Role enforcement | Query without role access | Permission denied error | P0 |
| SEC-A-002 | Table allowlist | Query table not in allowlist | Rejected | P0 |
| SEC-A-003 | Cross-schema access | Try to query other schema | Rejected | P1 |

---

## 7. Error Handling Tests

### 7.1 Backend Error Scenarios

| Test ID | Scenario | Trigger | Expected Response | Priority |
|---------|----------|---------|-------------------|----------|
| ERR-B-001 | Snowflake connection lost | Kill connection | Retry logic, clear error | P0 |
| ERR-B-002 | Query timeout | Very slow query | Timeout error message | P0 |
| ERR-B-003 | Invalid SQL generated | Bug in template | Syntax error caught, logged | P0 |
| ERR-B-004 | Missing table | Table dropped mid-session | Clear error, suggest re-discovery | P1 |
| ERR-B-005 | Warehouse suspended | WH auto-suspend | Clear error, suggest WH resume | P1 |

### 7.2 Frontend Error Scenarios

| Test ID | Scenario | Trigger | Expected UI | Priority |
|---------|----------|---------|-------------|----------|
| ERR-F-001 | API 500 error | Backend crash | Error banner + retry | P0 |
| ERR-F-002 | Network timeout | Slow network | Timeout message + retry | P0 |
| ERR-F-003 | API 401 | Token expired | Re-auth prompt | P1 |
| ERR-F-004 | Malformed response | API returns garbage | Graceful error, log to console | P1 |

---

## 8. Test Data Requirements

### 8.1 Minimum Test Data

```sql
-- Required tables in metadata schema
-- At minimum, these should exist with sample data:

-- Asset tables
TABLE_ENTITY             -- >= 100 rows
COLUMN_ENTITY            -- >= 500 rows  
SCHEMA_ENTITY            -- >= 10 rows

-- Lineage tables (at least one)
PROCESS_ENTITY           -- >= 50 rows with inputs/outputs arrays

-- Glossary tables
ATLASGLOSSARYTERM_ENTITY -- >= 20 rows
```

### 8.2 Test Fixtures

```typescript
// fixtures/test-data.ts

export const TEST_GUIDS = {
  tableWithLineage: 'guid-table-with-downstream-12345',
  tableWithoutLineage: 'guid-table-no-lineage-67890',
  glossaryTerm: 'guid-glossary-term-abcde',
  nonExistentGuid: 'guid-does-not-exist-00000',
};

export const TEST_TABLE_NAMES = {
  popular: 'CUSTOMER_DIM',           // Frequently queried
  unpopular: 'LEGACY_TABLE_UNUSED',  // Never queried
  specialChars: 'TABLE_V2$TEST',     // Has special chars
};

export const TEST_SEARCH_TERMS = {
  broad: 'customer',      // Many matches
  narrow: 'xyzzy12345',   // No matches
  partial: 'cust*',       // Wildcard
};
```

### 8.3 Seeding Script

```sql
-- seed-test-data.sql
-- Run in test environment to create minimum required data

-- Create test assets
INSERT INTO TABLE_ENTITY (guid, name, qualified_name, type_name, owner)
SELECT 
  UUID_STRING() AS guid,
  'TEST_TABLE_' || SEQ4() AS name,
  'DB.SCHEMA.TEST_TABLE_' || SEQ4() AS qualified_name,
  'Table' AS type_name,
  'test@example.com' AS owner
FROM TABLE(GENERATOR(ROWCOUNT => 100));

-- Create test lineage
INSERT INTO PROCESS_ENTITY (guid, name, inputs, outputs)
SELECT
  UUID_STRING() AS guid,
  'PROCESS_' || SEQ4() AS name,
  ARRAY_CONSTRUCT((SELECT guid FROM TABLE_ENTITY LIMIT 1)) AS inputs,
  ARRAY_CONSTRUCT((SELECT guid FROM TABLE_ENTITY LIMIT 1 OFFSET 1)) AS outputs
FROM TABLE(GENERATOR(ROWCOUNT => 50));

-- Create test glossary terms
INSERT INTO ATLASGLOSSARYTERM_ENTITY (guid, name, short_description, anchor)
VALUES
  ('guid-term-1', 'Active Customer', 'A customer with activity in last 90 days', NULL),
  ('guid-term-2', 'Revenue', 'Total recognized revenue', NULL),
  ('guid-term-3', 'Churn Rate', 'Percentage of customers lost', NULL);
```

---

## 9. Acceptance Criteria

### 9.1 Release Criteria

| Category | Criteria | Threshold |
|----------|----------|-----------|
| Functionality | All P0 tests pass | 100% |
| Functionality | All P1 tests pass | 100% |
| Functionality | P2 tests pass | >= 90% |
| Performance | All PERF tests within threshold | 100% |
| Security | All SEC tests pass | 100% |
| Error Handling | All ERR tests pass | 100% |

### 9.2 Test Execution Checklist

```markdown
## Pre-Release Test Checklist

### Environment
- [ ] Test environment matches production config
- [ ] Test data seeded and verified
- [ ] All environment variables set

### Backend Tests
- [ ] BE-D-* Discovery tests: __/7 passed
- [ ] BE-C-* Categorization tests: __/7 passed
- [ ] BE-V-* Validation tests: __/7 passed
- [ ] BE-Q-* Query builder tests: __/9 passed
- [ ] BE-E-* Execution tests: __/7 passed

### Frontend Tests
- [ ] FE-D-* Discovery UI tests: __/5 passed
- [ ] FE-W-* Wizard flow tests: __/8 passed
- [ ] FE-I-* Input tests: __/7 passed
- [ ] FE-R-* Results display tests: __/11 passed
- [ ] FE-S-* SQL preview tests: __/4 passed
- [ ] FE-E-* Error display tests: __/5 passed

### End-to-End Tests
- [ ] E2E-C-* CORE flows: __/5 passed
- [ ] E2E-G-* GLOSSARY flows: __/3 passed
- [ ] E2E-R-* REL_DB flows: __/2 passed
- [ ] E2E-D-* DBT flows: __/3 passed
- [ ] E2E-E-* Edge cases: __/5 passed

### Performance Tests
- [ ] PERF-* Query benchmarks: __/7 within threshold
- [ ] PERF-U-* UI benchmarks: __/6 within threshold
- [ ] LOAD-* Load tests: __/4 passed

### Security Tests
- [ ] SEC-* Input validation: __/6 passed
- [ ] SEC-A-* Authorization: __/3 passed

### Sign-off
- [ ] QA Lead: _____________ Date: _______
- [ ] Dev Lead: _____________ Date: _______
- [ ] Product: _____________ Date: _______
```

---

## Appendix A: Test Commands

```bash
# Run all backend tests
npm run test:backend

# Run all frontend tests
npm run test:frontend

# Run E2E tests
npm run test:e2e

# Run performance tests
npm run test:perf

# Run security tests
npm run test:security

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test -- --grep "BE-D-001"

# Run load tests (k6)
k6 run load-test.js

# Generate test report
npm run test:report
```

---

## Appendix B: Bug Report Template

```markdown
## Bug Report

**Test ID:** [e.g., E2E-C-003]
**Severity:** [P0/P1/P2]
**Environment:** [Test/Staging/Prod]

### Steps to Reproduce
1. 
2. 
3. 

### Expected Result


### Actual Result


### Screenshots/Logs


### Additional Context

```


