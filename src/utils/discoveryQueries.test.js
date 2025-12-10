/**
 * Discovery Queries Test Suite
 * 
 * TDD: Tests for schema-agnostic query building.
 * Tests the discovery-first pattern for finding tables and columns.
 * 
 * Quality Gate: 85% coverage required
 */

import { describe, it, expect } from 'vitest';
import {
  buildTableDiscoveryQuery,
  buildColumnDiscoveryQuery,
  buildEntityTypeRegistry,
  selectBestTable,
  validateAndQuoteIdentifier,
  buildSafeTableReference,
} from './discoveryQueries';

describe('discoveryQueries', () => {
  // ==========================================================================
  // Table Discovery Query
  // ==========================================================================
  describe('buildTableDiscoveryQuery', () => {
    it('should build query to discover entity tables with row counts', () => {
      const query = buildTableDiscoveryQuery('FIELD_METADATA', 'PUBLIC');

      expect(query).toContain('information_schema.tables');
      expect(query).toContain('table_name');
      expect(query).toContain('row_count');
    });

    it('should filter by schema', () => {
      const query = buildTableDiscoveryQuery('FIELD_METADATA', 'PUBLIC');

      expect(query).toContain("table_schema = 'PUBLIC'");
    });

    it('should filter for entity tables', () => {
      const query = buildTableDiscoveryQuery('FIELD_METADATA', 'PUBLIC');

      expect(query).toContain("_ENTITY");
    });

    it('should order by row_count descending', () => {
      const query = buildTableDiscoveryQuery('FIELD_METADATA', 'PUBLIC');

      expect(query).toContain('ORDER BY');
      expect(query).toContain('row_count');
      expect(query).toContain('DESC');
    });

    it('should include bytes for size estimation', () => {
      const query = buildTableDiscoveryQuery('FIELD_METADATA', 'PUBLIC');

      expect(query).toContain('bytes');
    });

    it('should handle custom table pattern', () => {
      const query = buildTableDiscoveryQuery('FIELD_METADATA', 'PUBLIC', '%_VIEW');

      expect(query).toContain("_VIEW");
    });

    it('should escape special characters in schema name', () => {
      const query = buildTableDiscoveryQuery('DB', "O'REILLY");

      expect(query).toContain("O''REILLY"); // Escaped quote
    });
  });

  // ==========================================================================
  // Column Discovery Query
  // ==========================================================================
  describe('buildColumnDiscoveryQuery', () => {
    it('should build query to discover columns for a table', () => {
      const query = buildColumnDiscoveryQuery('FIELD_METADATA', 'PUBLIC', 'PROCESS_ENTITY');

      expect(query).toContain('information_schema.columns');
      expect(query).toContain('column_name');
      expect(query).toContain('data_type');
    });

    it('should filter by table name', () => {
      const query = buildColumnDiscoveryQuery('FIELD_METADATA', 'PUBLIC', 'PROCESS_ENTITY');

      expect(query).toContain("table_name = 'PROCESS_ENTITY'");
    });

    it('should include nullability info', () => {
      const query = buildColumnDiscoveryQuery('FIELD_METADATA', 'PUBLIC', 'TABLE_ENTITY');

      expect(query).toContain('is_nullable');
    });

    it('should order by ordinal position', () => {
      const query = buildColumnDiscoveryQuery('FIELD_METADATA', 'PUBLIC', 'TABLE_ENTITY');

      expect(query).toContain('ordinal_position');
    });

    it('should validate table name for SQL injection', () => {
      expect(() => {
        buildColumnDiscoveryQuery('DB', 'PUBLIC', 'TABLE; DROP TABLE users;--');
      }).toThrow();
    });
  });

  // ==========================================================================
  // Entity Type Registry
  // ==========================================================================
  describe('buildEntityTypeRegistry', () => {
    const discoveredTables = [
      'PROCESS_ENTITY',
      'BIPROCESS_ENTITY',
      'TABLE_ENTITY',
      'COLUMN_ENTITY',
      'GLOSSARY_ENTITY',
      'TERM_ENTITY',
      'CUSTOM_ENTITY',
    ];

    it('should categorize lineage tables', () => {
      const registry = buildEntityTypeRegistry(discoveredTables);

      expect(registry.lineage).toContain('PROCESS_ENTITY');
      expect(registry.lineage).toContain('BIPROCESS_ENTITY');
    });

    it('should categorize asset tables', () => {
      const registry = buildEntityTypeRegistry(discoveredTables);

      expect(registry.assets).toContain('TABLE_ENTITY');
      expect(registry.assets).toContain('COLUMN_ENTITY');
    });

    it('should categorize governance tables', () => {
      const registry = buildEntityTypeRegistry(discoveredTables);

      expect(registry.governance).toContain('GLOSSARY_ENTITY');
      expect(registry.governance).toContain('TERM_ENTITY');
    });

    it('should put unknown tables in other category', () => {
      const registry = buildEntityTypeRegistry(discoveredTables);

      expect(registry.other).toContain('CUSTOM_ENTITY');
    });

    it('should handle empty input', () => {
      const registry = buildEntityTypeRegistry([]);

      expect(registry.lineage).toEqual([]);
      expect(registry.assets).toEqual([]);
      expect(registry.governance).toEqual([]);
      expect(registry.other).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const registry = buildEntityTypeRegistry(['process_entity', 'TABLE_ENTITY']);

      expect(registry.lineage.length).toBe(1);
      expect(registry.assets.length).toBe(1);
    });
  });

  // ==========================================================================
  // Select Best Table
  // ==========================================================================
  describe('selectBestTable', () => {
    const tablesWithCounts = [
      { name: 'EMPTY_ENTITY', row_count: 0 },
      { name: 'SMALL_ENTITY', row_count: 100 },
      { name: 'LARGE_ENTITY', row_count: 50000 },
      { name: 'MEDIUM_ENTITY', row_count: 5000 },
    ];

    it('should select table with highest row count', () => {
      const best = selectBestTable(tablesWithCounts);

      expect(best.name).toBe('LARGE_ENTITY');
    });

    it('should skip tables with zero rows', () => {
      const tablesWithEmpty = [
        { name: 'EMPTY_1', row_count: 0 },
        { name: 'EMPTY_2', row_count: 0 },
        { name: 'HAS_DATA', row_count: 10 },
      ];

      const best = selectBestTable(tablesWithEmpty);

      expect(best.name).toBe('HAS_DATA');
    });

    it('should return null if all tables are empty', () => {
      const allEmpty = [
        { name: 'EMPTY_1', row_count: 0 },
        { name: 'EMPTY_2', row_count: 0 },
      ];

      const best = selectBestTable(allEmpty);

      expect(best).toBeNull();
    });

    it('should handle empty array', () => {
      const best = selectBestTable([]);

      expect(best).toBeNull();
    });

    it('should prefer tables matching a category hint', () => {
      const tables = [
        { name: 'TABLE_ENTITY', row_count: 1000 },
        { name: 'PROCESS_ENTITY', row_count: 500 },
      ];

      const best = selectBestTable(tables, { preferCategory: 'lineage' });

      expect(best.name).toBe('PROCESS_ENTITY');
    });
  });

  // ==========================================================================
  // Identifier Validation
  // ==========================================================================
  describe('validateAndQuoteIdentifier', () => {
    it('should return quoted identifier for simple names', () => {
      expect(validateAndQuoteIdentifier('PROCESS_ENTITY')).toBe('"PROCESS_ENTITY"');
    });

    it('should uppercase the identifier', () => {
      expect(validateAndQuoteIdentifier('process_entity')).toBe('"PROCESS_ENTITY"');
    });

    it('should throw for identifiers with SQL injection', () => {
      expect(() => validateAndQuoteIdentifier('TABLE; DROP TABLE x;--')).toThrow();
    });

    it('should throw for null bytes', () => {
      expect(() => validateAndQuoteIdentifier('TABLE\0NAME')).toThrow();
    });

    it('should throw for identifiers exceeding max length', () => {
      const longName = 'A'.repeat(256);
      expect(() => validateAndQuoteIdentifier(longName)).toThrow();
    });

    it('should handle names with numbers', () => {
      expect(validateAndQuoteIdentifier('TABLE_123')).toBe('"TABLE_123"');
    });

    it('should handle names starting with underscore', () => {
      expect(validateAndQuoteIdentifier('_PRIVATE_TABLE')).toBe('"_PRIVATE_TABLE"');
    });

    it('should escape internal double quotes', () => {
      expect(validateAndQuoteIdentifier('TABLE"NAME')).toBe('"TABLE""NAME"');
    });
  });

  // ==========================================================================
  // Safe Table Reference
  // ==========================================================================
  describe('buildSafeTableReference', () => {
    it('should build fully qualified name', () => {
      const ref = buildSafeTableReference('FIELD_METADATA', 'PUBLIC', 'PROCESS_ENTITY');

      expect(ref).toBe('"FIELD_METADATA"."PUBLIC"."PROCESS_ENTITY"');
    });

    it('should validate all parts', () => {
      expect(() => {
        buildSafeTableReference('DB; DROP TABLE x;--', 'PUBLIC', 'TABLE');
      }).toThrow();
    });

    it('should handle null database (use current)', () => {
      const ref = buildSafeTableReference(null, 'PUBLIC', 'PROCESS_ENTITY');

      expect(ref).toBe('"PUBLIC"."PROCESS_ENTITY"');
    });

    it('should handle null schema (use current)', () => {
      const ref = buildSafeTableReference('DB', null, 'PROCESS_ENTITY');

      expect(ref).toBe('"DB"."PROCESS_ENTITY"');
    });

    it('should require table name', () => {
      expect(() => {
        buildSafeTableReference('DB', 'PUBLIC', null);
      }).toThrow();
    });

    it('should validate against allowlist when provided', () => {
      const allowlist = new Set(['TABLE_ENTITY', 'COLUMN_ENTITY']);

      expect(() => {
        buildSafeTableReference('DB', 'PUBLIC', 'UNKNOWN_TABLE', allowlist);
      }).toThrow(/not found|not allowed/i);
    });

    it('should pass validation when in allowlist', () => {
      const allowlist = new Set(['TABLE_ENTITY', 'COLUMN_ENTITY']);

      const ref = buildSafeTableReference('DB', 'PUBLIC', 'TABLE_ENTITY', allowlist);

      expect(ref).toBe('"DB"."PUBLIC"."TABLE_ENTITY"');
    });
  });
});


