/**
 * PLACEHOLDER VALIDATION TESTS
 * 
 * This test suite ensures that ALL placeholders in queries can be resolved
 * when proper context is provided. It validates:
 * 
 * 1. Every query template has its placeholders documented
 * 2. fillTemplate handles all placeholder patterns
 * 3. No unresolved placeholders remain after filling with complete context
 */

import { describe, it, expect } from 'vitest';
import { fillTemplate, fillTemplateSafe } from '../data/queryTemplates';
import { exampleQueries, mergedExampleQueries } from '../data/exampleQueries';
import { USER_RESEARCH_QUERIES } from '../data/mdlhUserQueries';

/**
 * Extract required placeholders from SQL
 * (Local implementation for testing)
 */
function getRequiredPlaceholders(sql) {
  const requires = [];
  if (sql.includes('{{database}}') || sql.includes('{{DATABASE}}')) requires.push('database');
  if (sql.includes('{{schema}}') || sql.includes('{{SCHEMA}}')) requires.push('schema');
  if (sql.includes('{{table}}') || sql.includes('{{TABLE}}')) requires.push('table');
  if (sql.includes('{{column}}') || sql.includes('{{COLUMN}}')) requires.push('column');
  if (sql.includes('{{GUID}}') || sql.includes('{{guid}}')) requires.push('guid');
  if (sql.includes('{{term}}')) requires.push('term');
  if (sql.includes('{{source}}')) requires.push('source');
  if (sql.includes('{{domain}}')) requires.push('domain');
  if (sql.includes('{{filter}}')) requires.push('filter');
  if (sql.includes('{{START_GUID}}')) requires.push('guid');
  return requires;
}

// =============================================================================
// ALL KNOWN PLACEHOLDER PATTERNS
// =============================================================================

/**
 * Complete list of all placeholder patterns used in the application
 */
const ALL_PLACEHOLDER_PATTERNS = [
  // Uppercase curly brace placeholders
  /\{\{DATABASE\}\}/g,
  /\{\{SCHEMA\}\}/g,
  /\{\{TABLE\}\}/g,
  /\{\{COLUMN\}\}/g,
  /\{\{GUID\}\}/g,
  /\{\{QUALIFIED_NAME\}\}/g,
  /\{\{DAYS_BACK\}\}/g,
  /\{\{OWNER_USERNAME\}\}/g,
  /\{\{TERM_GUID\}\}/g,
  /\{\{GLOSSARY_GUID\}\}/g,
  /\{\{START_GUID\}\}/g,
  
  // Lowercase curly brace placeholders
  /\{\{database\}\}/g,
  /\{\{schema\}\}/g,
  /\{\{table\}\}/g,
  /\{\{column\}\}/g,
  /\{\{guid\}\}/g,
  /\{\{filter\}\}/g,
  /\{\{domain\}\}/g,
  /\{\{term\}\}/g,
  /\{\{source\}\}/g,
  /\{\{metadata_set\}\}/g,
  
  // Angle bracket placeholders
  /<YOUR_SOURCE_GUID>/g,
  /<YOUR_TARGET_GUID>/g,
  /<YOUR_GUID>/g,
  /<CORE_GLOSSARY_GUID>/g,
  /<COLUMN_GUID>/g,
  /<GLOSSARY_GUID>/g,
  /<DATABASE>/g,
  /<SCHEMA>/g,
  /<TABLE>/g,
  /<COLUMN>/g,
  /<GUID>/g,
  /<QUALIFIED_NAME>/g,
  /<OWNER>/g,
  /<TERM_GUID>/g,
  /<START_GUID>/g,
  /<filter>/g,
  /<domain>/g,
  /<term>/g,
  /<source>/g,
  /<database>/g,
  /<schema>/g,
  /<table>/g,
  /<column>/g,
  /<guid>/g,
];

/**
 * Complete context with all possible fields populated
 */
const COMPLETE_CONTEXT = {
  database: 'FIELD_METADATA',
  schema: 'PUBLIC',
  table: 'TABLE_ENTITY',
  column: 'NAME',
  guid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  qualifiedName: 'default/snowflake/1234567890/FIELD_METADATA/PUBLIC/TABLE_ENTITY',
  daysBack: 30,
  ownerUsername: 'admin@example.com',
  termGuid: 't1a2b3c4-d5e6-7890-abcd-ef1234567890',
  glossaryGuid: 'g1a2b3c4-d5e6-7890-abcd-ef1234567890',
  startGuid: 's1a2b3c4-d5e6-7890-abcd-ef1234567890',
  columnGuid: 'c1a2b3c4-d5e6-7890-abcd-ef1234567890',
  filter: 'test_filter',
  domain: 'ANALYTICS',
  term: 'revenue',
  source: 'snowflake',
  searchTerm: 'search_value',
  connectionName: 'prod_warehouse',
  connectorName: 'snowflake',
  metadata_set: 'Data Governance',
};

/**
 * Sample entities with actual discovered tables
 */
const COMPLETE_SAMPLES = {
  tables: [{ GUID: 'sample-table-guid-123', NAME: 'CUSTOMERS' }],
  columns: [{ GUID: 'sample-column-guid-456', NAME: 'customer_id' }],
  processes: [{ GUID: 'sample-process-guid-789', NAME: 'ETL_JOB' }],
  terms: [{ GUID: 'sample-term-guid-abc', NAME: 'Customer' }],
  glossaries: [{ GUID: 'sample-glossary-guid-def', NAME: 'Business Glossary' }],
  tablesTable: 'FIELD_METADATA.PUBLIC.TABLE_ENTITY',
  columnsTable: 'FIELD_METADATA.PUBLIC.COLUMN_ENTITY',
  processesTable: 'FIELD_METADATA.PUBLIC.PROCESS_ENTITY',
  termsTable: 'FIELD_METADATA.PUBLIC.ATLASGLOSSARYTERM_ENTITY',
  glossariesTable: 'FIELD_METADATA.PUBLIC.ATLASGLOSSARY_ENTITY',
};

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Find all unresolved placeholders in a string
 */
function findUnresolvedPlaceholders(sql) {
  const unresolved = [];
  
  // Check for curly brace placeholders that weren't replaced
  const curlyPattern = /\{\{[^}]+\}\}/g;
  let match;
  while ((match = curlyPattern.exec(sql)) !== null) {
    unresolved.push(match[0]);
  }
  
  // Check for angle bracket placeholders that weren't replaced
  // (only if they look like placeholders, not SQL operators)
  const anglePattern = /<[A-Z_]+>/g;
  while ((match = anglePattern.exec(sql)) !== null) {
    // Skip legitimate SQL/XML patterns
    if (!['<>', '<=', '>='].some(op => sql.includes(op + match[0]))) {
      unresolved.push(match[0]);
    }
  }
  
  return [...new Set(unresolved)]; // Return unique placeholders
}

/**
 * Extract all SQL from a query object
 */
function extractSQL(queryObj) {
  if (typeof queryObj === 'string') return queryObj;
  if (queryObj?.query) return queryObj.query;
  if (queryObj?.sql) return queryObj.sql;
  return '';
}

/**
 * Get all queries from the application
 */
function getAllQueries() {
  const queries = [];
  
  // From exampleQueries
  for (const [category, categoryQueries] of Object.entries(exampleQueries)) {
    if (Array.isArray(categoryQueries)) {
      categoryQueries.forEach((q, i) => {
        queries.push({
          source: `exampleQueries.${category}[${i}]`,
          title: q.title,
          sql: extractSQL(q),
        });
      });
    }
  }
  
  // From mergedExampleQueries
  for (const [category, categoryQueries] of Object.entries(mergedExampleQueries)) {
    if (Array.isArray(categoryQueries)) {
      categoryQueries.forEach((q, i) => {
        queries.push({
          source: `mergedExampleQueries.${category}[${i}]`,
          title: q.title,
          sql: extractSQL(q),
        });
      });
    }
  }
  
  // From USER_RESEARCH_QUERIES
  USER_RESEARCH_QUERIES.forEach((q, i) => {
    queries.push({
      source: `USER_RESEARCH_QUERIES[${i}]`,
      title: q.name,
      sql: q.sql,
    });
  });
  
  return queries;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Placeholder Validation', () => {
  
  describe('fillTemplate handles all placeholder patterns', () => {
    
    it('should replace all UPPERCASE curly brace placeholders', () => {
      const template = `
        SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}}
        WHERE guid = '{{GUID}}'
        AND qualified_name = '{{QUALIFIED_NAME}}'
        AND updated > DATEADD(day, -{{DAYS_BACK}}, CURRENT_TIMESTAMP())
        AND owner = '{{OWNER_USERNAME}}'
      `;
      
      const result = fillTemplate(template, COMPLETE_CONTEXT);
      
      expect(result).toContain('FIELD_METADATA');
      expect(result).toContain('PUBLIC');
      expect(result).toContain('TABLE_ENTITY');
      expect(result).toContain('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result).toContain('30');
      expect(result).not.toContain('{{');
    });
    
    it('should replace all lowercase curly brace placeholders', () => {
      const template = `
        SELECT * FROM {{database}}.{{schema}}.{{table}}
        WHERE column = '{{column}}'
        AND filter LIKE '%{{filter}}%'
        AND domain = '{{domain}}'
        AND term = '{{term}}'
        AND source = '{{source}}'
      `;
      
      const result = fillTemplate(template, COMPLETE_CONTEXT);
      
      expect(result).toContain('FIELD_METADATA');
      expect(result).toContain('PUBLIC');
      expect(result).toContain('TABLE_ENTITY');
      expect(result).toContain('test_filter');
      expect(result).toContain('ANALYTICS');
      expect(result).toContain('revenue');
      expect(result).toContain('snowflake');
      expect(result).not.toContain('{{');
    });
    
    it('should replace angle bracket placeholders', () => {
      const template = `
        SELECT * FROM table
        WHERE guid = '<YOUR_SOURCE_GUID>'
        OR guid = '<YOUR_TARGET_GUID>'
        OR guid = '<YOUR_GUID>'
        OR glossary = '<CORE_GLOSSARY_GUID>'
        OR column_guid = '<COLUMN_GUID>'
      `;
      
      const result = fillTemplate(template, COMPLETE_CONTEXT);
      
      // Should be replaced with actual GUIDs
      expect(result).not.toContain('<YOUR_SOURCE_GUID>');
      expect(result).not.toContain('<YOUR_TARGET_GUID>');
      expect(result).not.toContain('<YOUR_GUID>');
      expect(result).not.toContain('<CORE_GLOSSARY_GUID>');
      expect(result).not.toContain('<COLUMN_GUID>');
    });
    
    it('should handle mixed case placeholders', () => {
      const template = `
        SELECT * FROM {{DATABASE}}.{{schema}}.{{TABLE}}
        WHERE guid = '{{GUID}}'
        AND domain LIKE '%{{domain}}%'
      `;
      
      const result = fillTemplate(template, COMPLETE_CONTEXT);
      
      expect(result).not.toContain('{{');
    });
    
  });
  
  describe('All queries can be fully populated', () => {
    
    const allQueries = getAllQueries();
    
    it(`should have ${allQueries.length} queries to validate`, () => {
      expect(allQueries.length).toBeGreaterThan(0);
      console.log(`Validating ${allQueries.length} total queries`);
    });
    
    // Test each query individually
    allQueries.forEach(({ source, title, sql }) => {
      if (!sql) return; // Skip empty queries
      
      it(`${source}: "${title?.slice(0, 50) || 'Untitled'}" should have no unresolved placeholders`, () => {
        // Fill with complete context and samples
        const filled = fillTemplate(sql, COMPLETE_CONTEXT, COMPLETE_SAMPLES);
        const unresolved = findUnresolvedPlaceholders(filled);
        
        if (unresolved.length > 0) {
          console.log(`\nQuery: ${title}`);
          console.log(`Unresolved: ${unresolved.join(', ')}`);
          console.log(`SQL snippet: ${filled.slice(0, 200)}...`);
        }
        
        expect(unresolved, `Unresolved placeholders: ${unresolved.join(', ')}`).toHaveLength(0);
      });
    });
    
  });
  
  describe('getRequiredPlaceholders detection', () => {
    
    it('should detect all placeholder types', () => {
      const sql = `
        SELECT * FROM {{database}}.{{schema}}.{{table}}
        WHERE guid = '{{GUID}}'
        AND filter = '{{filter}}'
        AND domain = '{{domain}}'
        AND term = '{{term}}'
        AND source = '{{source}}'
      `;
      
      const required = getRequiredPlaceholders(sql);
      
      expect(required).toContain('database');
      expect(required).toContain('schema');
      expect(required).toContain('table');
      expect(required).toContain('guid');
      expect(required).toContain('filter');
      expect(required).toContain('domain');
      expect(required).toContain('term');
      expect(required).toContain('source');
    });
    
  });
  
  describe('Edge cases', () => {
    
    it('should handle empty context gracefully', () => {
      const template = `SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}}`;
      const result = fillTemplate(template, {});
      
      // Should fall back to angle bracket placeholders
      expect(result).toContain('<DATABASE>');
      expect(result).toContain('<SCHEMA>');
      expect(result).toContain('<TABLE>');
    });
    
    it('should handle null context gracefully', () => {
      const template = `SELECT * FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}}`;
      const result = fillTemplate(template, { database: null, schema: null, table: null });
      
      expect(result).toContain('<DATABASE>');
      expect(result).toContain('<SCHEMA>');
      expect(result).toContain('<TABLE>');
    });
    
    it('should not corrupt SQL syntax', () => {
      const template = `
        SELECT 
          CASE WHEN a > b THEN 1 ELSE 0 END,
          ARRAY_CONTAINS('{{GUID}}'::VARIANT, column)
        FROM {{DATABASE}}.{{SCHEMA}}.{{TABLE}}
        WHERE x <> y
        AND z >= 10
        AND w <= 20
      `;
      
      const result = fillTemplate(template, COMPLETE_CONTEXT);
      
      // SQL operators should remain intact
      expect(result).toContain('CASE WHEN');
      expect(result).toContain('<>');
      expect(result).toContain('>=');
      expect(result).toContain('<=');
      expect(result).toContain('::VARIANT');
    });
    
  });
  
});

// =============================================================================
// SUMMARY REPORT
// =============================================================================

describe('Placeholder Coverage Summary', () => {
  
  it('should report all unique placeholders found in queries', () => {
    const allQueries = getAllQueries();
    const allPlaceholders = new Set();
    
    allQueries.forEach(({ sql }) => {
      if (!sql) return;
      
      // Find curly brace placeholders
      const curlyMatches = sql.match(/\{\{[^}]+\}\}/g) || [];
      curlyMatches.forEach(p => allPlaceholders.add(p));
      
      // Find angle bracket placeholders
      const angleMatches = sql.match(/<[A-Z_]+>/g) || [];
      angleMatches.forEach(p => allPlaceholders.add(p));
    });
    
    console.log('\n=== PLACEHOLDER COVERAGE REPORT ===');
    console.log('Unique placeholders found in queries:');
    [...allPlaceholders].sort().forEach(p => console.log(`  - ${p}`));
    console.log(`Total: ${allPlaceholders.size} unique placeholders`);
    
    expect(allPlaceholders.size).toBeGreaterThan(0);
  });
  
});

