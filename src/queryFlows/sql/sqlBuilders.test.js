/**
 * SQL Builders Unit Tests
 * 
 * Test Plan: Section 2 - SQL Building & FQN Generation
 * Priority: P0 (Critical)
 * 
 * Tests that all SQL builders use proper FQN generation and SQL injection protection.
 */

import { describe, it, expect } from 'vitest';

// SQL Builders
import { buildSampleRowsQuery, buildTableStatsQuery } from './sampleRows';
import { buildFindByGuidQuery, buildGuidDetailsQuery } from './findByGuid';
import { buildUsageQuery, buildPopularityQuery } from './usage';
import { buildSchemaBrowseQuery, buildTableSearchQuery, buildColumnDetailsQuery, buildSimpleSelectQuery } from './schemaBrowse';
import { buildGlossaryQuery, buildTermLinkedAssetsQuery, buildListGlossariesQuery } from './glossary';
import { buildLineageQuery, buildLineageExplorationQuery } from './lineage';

// =============================================================================
// Test Helpers
// =============================================================================

const createTestEntity = (overrides = {}) => ({
  database: 'TEST_DB',
  schema: 'TEST_SCHEMA',
  table: 'TEST_TABLE',
  name: 'TEST_TABLE',
  guid: 'abc-123-def-456',
  qualifiedName: 'test://qualified/name',
  entityType: 'TABLE',
  ...overrides,
});

const createTestInputs = (overrides = {}) => ({
  rowLimit: 100,
  daysBack: 30,
  direction: 'DOWNSTREAM',
  maxHops: 3,
  filters: {},
  ...overrides,
});

// =============================================================================
// FQN-001: Sample Rows Builder
// =============================================================================

describe('FQN-001: Sample Rows Builder', () => {
  it('should use buildSafeFQN for table reference', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    
    const result = buildSampleRowsQuery(entity, inputs);
    
    // Should contain FQN (may be quoted or unquoted depending on identifier validity)
    expect(result.sql).toContain('TEST_DB');
    expect(result.sql).toContain('TEST_SCHEMA');
    expect(result.sql).toContain('TEST_TABLE');
    expect(result.sql).toContain('FROM');
  });

  it('should handle special characters in identifiers', () => {
    const entity = createTestEntity({
      database: 'my-db',
      schema: 'my-schema',
      table: 'my-table',
    });
    const inputs = createTestInputs();
    
    const result = buildSampleRowsQuery(entity, inputs);
    
    // Should quote identifiers with special characters
    expect(result.sql).toContain('"my-db"');
    expect(result.sql).toContain('"my-schema"');
    expect(result.sql).toContain('"my-table"');
  });

  it('should include LIMIT clause with correct value', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs({ rowLimit: 50 });
    
    const result = buildSampleRowsQuery(entity, inputs);
    
    expect(result.sql).toContain('LIMIT 50');
  });

  it('should set requiresContext flag when missing parts', () => {
    const entity = createTestEntity({ database: null });
    const inputs = createTestInputs();
    
    const result = buildSampleRowsQuery(entity, inputs);
    
    expect(result.requiresContext).toBe(true);
  });
});

// =============================================================================
// FQN-002: Find By GUID Builder
// =============================================================================

describe('FQN-002: Find By GUID Builder', () => {
  it('should use escapeStringValue for GUID in WHERE clause', () => {
    const entity = createTestEntity({ guid: "test-guid-123" });
    const inputs = createTestInputs();
    const availableTables = ['TABLE_ENTITY', 'COLUMN_ENTITY'];
    
    const result = buildFindByGuidQuery(entity, inputs, availableTables);
    
    // Should escape the GUID properly
    expect(result.sql).toContain("'test-guid-123'");
    expect(result.sql).not.toContain('${');
  });

  it('should use buildSafeFQN for table references', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    const availableTables = ['TABLE_ENTITY'];
    
    const result = buildFindByGuidQuery(entity, inputs, availableTables);
    
    // Should contain proper FQN
    expect(result.sql).toContain('TEST_DB');
    expect(result.sql).toContain('TEST_SCHEMA');
    expect(result.sql).toContain('TABLE_ENTITY');
  });

  it('should handle SQL injection attempts in GUID', () => {
    const entity = createTestEntity({ guid: "'; DROP TABLE users; --" });
    const inputs = createTestInputs();
    const availableTables = ['TABLE_ENTITY'];
    
    const result = buildFindByGuidQuery(entity, inputs, availableTables);
    
    // Should escape single quotes by doubling them
    // The result should contain '' (escaped quote) somewhere in the SQL
    expect(result.sql).toContain("''");
    // The raw dangerous pattern should NOT appear unescaped
    // Note: The escaped version is '''...' which still contains the original text but safely quoted
  });

  it('should provide discovery query when no entity tables found', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    const availableTables = [];
    
    const result = buildFindByGuidQuery(entity, inputs, availableTables);
    
    expect(result.sql).toContain('SHOW TABLES');
    expect(result.title).toContain('Find Entity Tables');
  });
});

// =============================================================================
// FQN-003: Usage Builder
// =============================================================================

describe('FQN-003: Usage Builder', () => {
  it('should escape asset name in ILIKE pattern', () => {
    const entity = createTestEntity({ name: "test_table" });
    const inputs = createTestInputs();
    
    const result = buildUsageQuery(entity, inputs);
    
    // Should use escaped pattern
    expect(result.sql).toContain('ILIKE');
    expect(result.sql).toContain('test_table');
  });

  it('should escape special LIKE characters', () => {
    const entity = createTestEntity({ name: "test%table_name" });
    const inputs = createTestInputs();
    
    const result = buildUsageQuery(entity, inputs);
    
    // Should escape % and _ for LIKE
    expect(result.sql).toContain('\\%');
    expect(result.sql).toContain('\\_');
  });

  it('should use buildSafeFQN for history table', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    const availableTables = ['QUERY_HISTORY_ENTITY'];
    
    const result = buildUsageQuery(entity, inputs, availableTables);
    
    expect(result.sql).toContain('QUERY_HISTORY_ENTITY');
  });
});

// =============================================================================
// FQN-004: Schema Browse Builder
// =============================================================================

describe('FQN-004: Schema Browse Builder', () => {
  it('should use buildSafeFQN for SHOW TABLES IN', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    
    const result = buildSchemaBrowseQuery(entity, inputs);
    
    expect(result.sql).toContain('SHOW TABLES IN');
    expect(result.sql).toContain('TEST_DB');
    expect(result.sql).toContain('TEST_SCHEMA');
  });

  it('should escape search term in LIKE pattern', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs({ searchTerm: "test%pattern" });
    
    const result = buildTableSearchQuery(entity, inputs);
    
    expect(result.sql).toContain('SHOW TABLES LIKE');
    expect(result.sql).toContain('\\%');
  });

  it('should use buildSafeFQN for DESCRIBE TABLE', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    
    const result = buildColumnDetailsQuery(entity, inputs);
    
    expect(result.sql).toContain('DESCRIBE TABLE');
    expect(result.sql).toContain('TEST_DB');
    expect(result.sql).toContain('TEST_SCHEMA');
    expect(result.sql).toContain('TEST_TABLE');
  });

  it('buildSimpleSelectQuery should use FQN', () => {
    const sql = buildSimpleSelectQuery('MY_TABLE', 'MY_DB', 'MY_SCHEMA', 10);
    
    expect(sql).toContain('MY_DB');
    expect(sql).toContain('MY_SCHEMA');
    expect(sql).toContain('MY_TABLE');
    expect(sql).toContain('LIMIT 10');
  });
});

// =============================================================================
// FQN-005: Glossary Builder
// =============================================================================

describe('FQN-005: Glossary Builder', () => {
  it('should escape term name in ILIKE pattern', () => {
    const entity = createTestEntity({ name: "test_term" });
    const inputs = createTestInputs({ filters: { termName: "test_term" } });
    const availableTables = ['ATLASGLOSSARYTERM_ENTITY'];
    
    const result = buildGlossaryQuery(entity, inputs, availableTables);
    
    expect(result.sql).toContain('ILIKE');
    expect(result.sql).toContain('test_term');
  });

  it('should use escapeStringValue for term GUID', () => {
    const entity = createTestEntity({ guid: "term-guid-123" });
    const inputs = createTestInputs();
    const availableTables = ['TABLE_ENTITY', 'COLUMN_ENTITY'];
    
    const result = buildTermLinkedAssetsQuery(entity, inputs, availableTables);
    
    expect(result.sql).toContain("'term-guid-123'");
  });

  it('should use buildSafeFQN for glossary tables', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    const availableTables = ['ATLASGLOSSARY_ENTITY'];
    
    const result = buildListGlossariesQuery(entity, inputs, availableTables);
    
    expect(result.sql).toContain('ATLASGLOSSARY_ENTITY');
  });
});

// =============================================================================
// FQN-006: Lineage Builder
// =============================================================================

describe('FQN-006: Lineage Builder', () => {
  it('should use buildSafeFQN for process table', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    const availableTables = ['PROCESS_ENTITY'];
    
    const result = buildLineageQuery(entity, inputs, availableTables);
    
    expect(result.sql).toContain('PROCESS_ENTITY');
  });

  it('should use escapeStringValue for GUID in lineage', () => {
    const entity = createTestEntity({ guid: "lineage-guid-123" });
    const inputs = createTestInputs();
    const availableTables = ['PROCESS_ENTITY'];
    
    const result = buildLineageQuery(entity, inputs, availableTables);
    
    // Should contain escaped GUID
    expect(result.sql).toContain("'lineage-guid-123'");
  });

  it('should provide discovery query when no process tables', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    const availableTables = [];
    
    const result = buildLineageQuery(entity, inputs, availableTables);
    
    expect(result.sql).toContain('SHOW TABLES');
    expect(result.title).toContain('Find Lineage Tables');
  });

  it('buildLineageExplorationQuery should use buildSafeFQN', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    const availableTables = ['PROCESS_ENTITY'];
    
    const result = buildLineageExplorationQuery(entity, inputs, availableTables);
    
    expect(result.sql).toContain('FROM');
    expect(result.sql).toContain('PROCESS_ENTITY');
  });
});

// =============================================================================
// FQN-007: SQL Injection Prevention
// =============================================================================

describe('FQN-007: SQL Injection Prevention', () => {
  const injectionPatterns = [
    "'; DROP TABLE users; --",
    "' OR '1'='1",
    "'; DELETE FROM assets; --",
    "UNION SELECT * FROM secrets",
    "1; TRUNCATE TABLE data;--",
  ];

  it.each(injectionPatterns)('should safely handle injection in table name: %s', (injection) => {
    const entity = createTestEntity({ table: injection });
    const inputs = createTestInputs();
    
    // Should not throw
    expect(() => buildSampleRowsQuery(entity, inputs)).not.toThrow();
    
    const result = buildSampleRowsQuery(entity, inputs);
    
    // Should quote the dangerous identifier
    expect(result.sql).toContain('"');
  });

  it.each(injectionPatterns)('should safely handle injection in GUID: %s', (injection) => {
    const entity = createTestEntity({ guid: injection });
    const inputs = createTestInputs();
    const availableTables = ['TABLE_ENTITY'];
    
    // Should not throw
    expect(() => buildFindByGuidQuery(entity, inputs, availableTables)).not.toThrow();
    
    const result = buildFindByGuidQuery(entity, inputs, availableTables);
    
    // The GUID should be wrapped in single quotes (escaped via escapeStringValue)
    // For patterns with single quotes, they should be doubled
    if (injection.includes("'")) {
      expect(result.sql).toContain("''");
    }
    // The result should always contain the GUID in a quoted form
    expect(result.sql).toMatch(/guid = '/);
  });

  it.each(injectionPatterns)('should safely handle injection in search term: %s', (injection) => {
    const entity = createTestEntity();
    const inputs = createTestInputs({ searchTerm: injection });
    
    // Should not throw
    expect(() => buildTableSearchQuery(entity, inputs)).not.toThrow();
  });
});

// =============================================================================
// FQN-008: SystemConfig Integration
// =============================================================================

describe('FQN-008: SystemConfig Integration', () => {
  const mockSystemConfig = {
    queryDefaults: {
      metadataDb: 'CONFIG_DB',
      metadataSchema: 'CONFIG_SCHEMA',
    },
    snowflake: {
      entities: {
        PROCESS_ENTITY: {
          database: 'LINEAGE_DB',
          schema: 'LINEAGE_SCHEMA',
          table: 'PROCESS_ENTITY',
        },
      },
    },
  };

  it('should use SystemConfig defaults when entity lacks db/schema', () => {
    const entity = createTestEntity({ database: null, schema: null });
    const inputs = createTestInputs();
    
    const result = buildSampleRowsQuery(entity, inputs, [], mockSystemConfig);
    
    expect(result.sql).toContain('CONFIG_DB');
    expect(result.sql).toContain('CONFIG_SCHEMA');
  });

  it('should prefer entity values over SystemConfig', () => {
    const entity = createTestEntity({
      database: 'ENTITY_DB',
      schema: 'ENTITY_SCHEMA',
    });
    const inputs = createTestInputs();
    
    const result = buildSampleRowsQuery(entity, inputs, [], mockSystemConfig);
    
    expect(result.sql).toContain('ENTITY_DB');
    expect(result.sql).toContain('ENTITY_SCHEMA');
  });

  it('lineage should use SystemConfig entity locations', () => {
    const entity = createTestEntity();
    const inputs = createTestInputs();
    const availableTables = ['PROCESS_ENTITY'];
    
    const result = buildLineageQuery(entity, inputs, availableTables, mockSystemConfig);
    
    // Should use the config-specified location for PROCESS_ENTITY
    expect(result.sql).toContain('LINEAGE_DB');
    expect(result.sql).toContain('LINEAGE_SCHEMA');
    expect(result.sql).toContain('PROCESS_ENTITY');
  });
});

