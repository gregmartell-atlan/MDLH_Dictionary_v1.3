/**
 * Query Templates Unit Tests
 * 
 * Test Plan: Section 2 - Query Template Processing
 * Priority: P0 (Critical)
 * 
 * Tests template filling with FQN generation and SQL safety.
 */

import { describe, it, expect } from 'vitest';
import { 
  fillTemplate, 
  fillTemplateSafe, 
  buildTableFQN,
  getRecommendedQueries,
  canExecuteQuery,
  MDLH_QUERIES,
  SNOWFLAKE_QUERIES,
} from './queryTemplates';

// =============================================================================
// fillTemplate Tests
// =============================================================================

describe('fillTemplate', () => {
  it('should replace all placeholders with context values', () => {
    const template = 'SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}} LIMIT 100;';
    const ctx = {
      database: 'PROD_DB',
      schema: 'PUBLIC',
      table: 'CUSTOMERS',
    };
    
    const result = fillTemplate(template, ctx);
    
    expect(result).toBe('SELECT * FROM PROD_DB.PUBLIC.CUSTOMERS LIMIT 100;');
  });

  it('should use placeholder markers when values missing', () => {
    const template = 'SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}};';
    const ctx = {};
    
    const result = fillTemplate(template, ctx);
    
    expect(result).toBe('SELECT * FROM <DATABASE>.<SCHEMA>.<TABLE>;');
  });

  it('should handle GUID placeholder', () => {
    const template = "WHERE guid = '{{GUID}}'";
    const ctx = { guid: 'abc-123' };
    
    const result = fillTemplate(template, ctx);
    
    expect(result).toBe("WHERE guid = 'abc-123'");
  });

  it('should handle DAYS_BACK with default', () => {
    const template = "DATEADD('day', -{{DAYS_BACK}}, CURRENT_TIMESTAMP())";
    const ctx = {};
    
    const result = fillTemplate(template, ctx);
    
    expect(result).toContain('-30');
  });

  it('should handle custom DAYS_BACK value', () => {
    const template = "DATEADD('day', -{{DAYS_BACK}}, CURRENT_TIMESTAMP())";
    const ctx = { daysBack: 7 };
    
    const result = fillTemplate(template, ctx);
    
    expect(result).toContain('-7');
  });

  it('should handle all placeholder types', () => {
    const template = `
      {{DATABASE}}.{{SCHEMA}}.{{TABLE}}
      {{COLUMN}} {{GUID}} {{QUALIFIED_NAME}}
      {{DAYS_BACK}} {{OWNER_USERNAME}}
      {{TERM_GUID}} {{GLOSSARY_GUID}}
    `;
    const ctx = {
      database: 'db',
      schema: 'schema',
      table: 'table',
      column: 'col',
      guid: 'guid1',
      qualifiedName: 'qn',
      daysBack: 14,
      ownerUsername: 'user1',
      termGuid: 'term1',
      glossaryGuid: 'gloss1',
    };
    
    const result = fillTemplate(template, ctx);
    
    expect(result).toContain('db.schema.table');
    expect(result).toContain('col');
    expect(result).toContain('guid1');
    expect(result).toContain('qn');
    expect(result).toContain('14');
    expect(result).toContain('user1');
    expect(result).toContain('term1');
    expect(result).toContain('gloss1');
  });
});

// =============================================================================
// fillTemplateSafe Tests
// =============================================================================

describe('fillTemplateSafe', () => {
  it('should build safe FQN when all parts available', () => {
    const template = 'SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}} LIMIT 100;';
    const ctx = {
      database: 'PROD_DB',
      schema: 'PUBLIC',
      table: 'CUSTOMERS',
    };
    
    const result = fillTemplateSafe(template, ctx);
    
    expect(result).toBe('SELECT * FROM PROD_DB.PUBLIC.CUSTOMERS LIMIT 100;');
  });

  it('should quote identifiers with special characters', () => {
    const template = 'SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}};';
    const ctx = {
      database: 'my-database',
      schema: 'my-schema',
      table: 'my-table',
    };
    
    const result = fillTemplateSafe(template, ctx);
    
    // buildSafeFQN should quote these
    expect(result).toContain('"my-database"');
    expect(result).toContain('"my-schema"');
    expect(result).toContain('"my-table"');
  });

  it('should handle missing context gracefully', () => {
    const template = 'SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}};';
    const ctx = { database: 'DB' }; // missing schema and table
    
    const result = fillTemplateSafe(template, ctx);
    
    // Should fall back to placeholder pattern
    expect(result).toContain('DB');
    expect(result).toContain('<SCHEMA>');
    expect(result).toContain('<TABLE>');
  });
});

// =============================================================================
// buildTableFQN Tests
// =============================================================================

describe('buildTableFQN', () => {
  it('should build FQN from context', () => {
    const ctx = {
      database: 'DB',
      schema: 'SCHEMA',
      table: 'TABLE',
    };
    
    const result = buildTableFQN(ctx);
    
    expect(result).toBe('DB.SCHEMA.TABLE');
  });

  it('should quote special characters', () => {
    const ctx = {
      database: 'my-db',
      schema: 'my-schema',
      table: 'my-table',
    };
    
    const result = buildTableFQN(ctx);
    
    expect(result).toContain('"my-db"');
    expect(result).toContain('"my-schema"');
    expect(result).toContain('"my-table"');
  });

  it('should return placeholder pattern when parts missing', () => {
    const ctx = { database: null };
    
    const result = buildTableFQN(ctx);
    
    expect(result).toContain('<DATABASE>');
    expect(result).toContain('<SCHEMA>');
    expect(result).toContain('<TABLE>');
  });
});

// =============================================================================
// getRecommendedQueries Tests
// =============================================================================

describe('getRecommendedQueries', () => {
  it('should return table-level queries for TABLE entity type', () => {
    const ctx = {
      database: 'DB',
      schema: 'SCHEMA',
      table: 'TABLE',
      entityType: 'TABLE',
    };
    
    const result = getRecommendedQueries(ctx);
    
    expect(result.length).toBeGreaterThan(0);
    // Should include structure and lineage queries
    const queryIds = result.map(r => r.query.id);
    expect(queryIds.some(id => id?.includes('asset') || id?.includes('column') || id?.includes('upstream'))).toBe(true);
  });

  it('should return column-level queries when column specified', () => {
    const ctx = {
      database: 'DB',
      schema: 'SCHEMA',
      table: 'TABLE',
      column: 'COL',
      entityType: 'COLUMN',
    };
    
    const result = getRecommendedQueries(ctx);
    
    expect(result.length).toBeGreaterThan(0);
    // Should include null stats and top values
    const queryIds = result.map(r => r.query.id);
    expect(queryIds.some(id => id?.includes('null') || id?.includes('values') || id?.includes('numeric'))).toBe(true);
  });

  it('should return general queries when no specific context', () => {
    const ctx = {};
    
    const result = getRecommendedQueries(ctx);
    
    expect(result.length).toBeGreaterThan(0);
    // Should include overview and popular tables
    const queryIds = result.map(r => r.query.id);
    expect(queryIds.some(id => id?.includes('overview') || id?.includes('popular'))).toBe(true);
  });

  it('should sort by priority', () => {
    const ctx = {
      database: 'DB',
      schema: 'SCHEMA',
      table: 'TABLE',
      entityType: 'TABLE',
    };
    
    const result = getRecommendedQueries(ctx);
    
    // First items should have lower priority numbers
    for (let i = 1; i < result.length; i++) {
      expect(result[i].priority).toBeGreaterThanOrEqual(result[i - 1].priority);
    }
  });
});

// =============================================================================
// canExecuteQuery Tests
// =============================================================================

describe('canExecuteQuery', () => {
  it('should return true when no requires specified', () => {
    const query = { sql: 'SELECT 1', requires: [] };
    const ctx = {};
    
    expect(canExecuteQuery(query, ctx)).toBe(true);
  });

  it('should return true when all required fields present', () => {
    const query = { sql: 'SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}}', requires: ['database', 'schema', 'table'] };
    const ctx = { database: 'DB', schema: 'SCHEMA', table: 'TABLE' };
    
    expect(canExecuteQuery(query, ctx)).toBe(true);
  });

  it('should return false when required field missing', () => {
    const query = { sql: 'SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}}', requires: ['database', 'schema', 'table'] };
    const ctx = { database: 'DB', schema: 'SCHEMA' }; // missing table
    
    expect(canExecuteQuery(query, ctx)).toBe(false);
  });

  it('should return true when requires is undefined', () => {
    const query = { sql: 'SELECT 1' };
    const ctx = {};
    
    expect(canExecuteQuery(query, ctx)).toBe(true);
  });
});

// =============================================================================
// Query Template Structure Tests
// =============================================================================

describe('Query Template Structure', () => {
  it('MDLH_QUERIES should have required properties', () => {
    Object.values(MDLH_QUERIES).forEach(query => {
      expect(query).toHaveProperty('id');
      expect(query).toHaveProperty('label');
      expect(query).toHaveProperty('sql');
      expect(query).toHaveProperty('category');
      expect(query).toHaveProperty('layer');
    });
  });

  it('SNOWFLAKE_QUERIES should have required properties', () => {
    Object.values(SNOWFLAKE_QUERIES).forEach(query => {
      expect(query).toHaveProperty('id');
      expect(query).toHaveProperty('label');
      expect(query).toHaveProperty('sql');
      expect(query).toHaveProperty('category');
      expect(query).toHaveProperty('layer');
    });
  });

  it('queries with table references should use {{DATABASE}}.{{SCHEMA}}.{{TABLE}} pattern', () => {
    const allQueries = { ...MDLH_QUERIES, ...SNOWFLAKE_QUERIES };
    
    Object.values(allQueries).forEach(query => {
      if (query.requires?.includes('table')) {
        // If it requires table, the SQL should have the FQN pattern
        const hasFQNPattern = 
          query.sql.includes('{{DATABASE}}') || 
          query.sql.includes('{{SCHEMA}}') ||
          query.sql.includes('{{TABLE}}') ||
          query.sql.includes('QUALIFIEDNAME'); // Some use QUALIFIEDNAME instead
        
        expect(hasFQNPattern).toBe(true);
      }
    });
  });

  it('queries should not have raw string concatenation patterns', () => {
    const allQueries = { ...MDLH_QUERIES, ...SNOWFLAKE_QUERIES };
    
    Object.values(allQueries).forEach(query => {
      // Should not contain ${...} interpolation (that would be a bug)
      expect(query.sql).not.toContain('${');
    });
  });
});


