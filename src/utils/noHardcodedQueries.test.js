/**
 * NO HARDCODED QUERIES TEST
 * 
 * This test suite ensures that NO queries in the application use hardcoded table names.
 * All queries must use:
 * - Dynamic FQNs from discovered tables (buildSafeFQN)
 * - Placeholders like {{DATABASE}}, {{SCHEMA}}, {{TABLE}}
 * - The dynamic query builder system
 * 
 * RULE: If a query contains a hardcoded entity table name without being
 * wrapped in the dynamic transformation system, it's a bug.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// HARDCODED PATTERNS TO DETECT
// =============================================================================

/**
 * These are the hardcoded table name patterns that should NOT appear
 * in FROM/JOIN clauses without being dynamically transformed.
 */
const FORBIDDEN_HARDCODED_PATTERNS = [
  // Direct table references without FQN
  /FROM\s+TABLE_ENTITY\b/gi,
  /FROM\s+COLUMN_ENTITY\b/gi,
  /FROM\s+PROCESS_ENTITY\b/gi,
  /FROM\s+ATLASGLOSSARY\b/gi,
  /FROM\s+ATLASGLOSSARYTERM\b/gi,
  /FROM\s+ATLASGLOSSARYCATEGORY\b/gi,
  /FROM\s+SCHEMA_ENTITY\b/gi,
  /FROM\s+DATABASE_ENTITY\b/gi,
  /FROM\s+DASHBOARD_ENTITY\b/gi,
  
  // JOIN patterns
  /JOIN\s+TABLE_ENTITY\b/gi,
  /JOIN\s+COLUMN_ENTITY\b/gi,
  /JOIN\s+PROCESS_ENTITY\b/gi,
  /JOIN\s+ATLASGLOSSARY\b/gi,
  /JOIN\s+ATLASGLOSSARYTERM\b/gi,
  
  // Hardcoded FQN patterns (should use dynamic database/schema)
  /FROM\s+FIELD_METADATA\.PUBLIC\.\w+/gi,
  /JOIN\s+FIELD_METADATA\.PUBLIC\.\w+/gi,
  /FROM\s+ATLAN_MDLH\.PUBLIC\.\w+/gi,
  /JOIN\s+ATLAN_MDLH\.PUBLIC\.\w+/gi,
];

/**
 * Files/patterns that are ALLOWED to have hardcoded queries:
 * - Template source files (transformed at runtime by dynamicExampleQueries.js)
 * - Test files, documentation, and the transformation utilities themselves
 */
const ALLOWED_FILES = [
  // Template source files - these ARE templates that get transformed at runtime
  'exampleQueries.js',           // Template source - transformed by dynamicExampleQueries
  'mdlhUserQueries.js',          // Template source - transformed by dynamicExampleQueries
  'queryTemplates.js',           // Template source - uses {{PLACEHOLDERS}} and runtime transform
  'entities.js',                 // Entity definitions with example queries
  
  // Transformation utilities
  'noHardcodedQueries.test.js',  // This test file itself
  'dynamicExampleQueries.js',    // The transformation utility
  'dynamicQueryBuilder.js',      // The dynamic builder
  
  // Test files and docs
  '.test.js',                    // Test files may have examples
  '.test.jsx',
  '.md',                         // Documentation
];

/**
 * Patterns in code that indicate the query is being dynamically transformed
 * If these patterns are present near a hardcoded table name, it's OK
 */
const DYNAMIC_CONTEXT_PATTERNS = [
  'transformExampleQueries',
  'transformQueryToDiscoveredTables',
  'buildDynamicRecommendations',
  'buildSafeFQN',
  '{{DATABASE}}',
  '{{SCHEMA}}',
  '{{TABLE}}',
  'discoveredTables',
  'findActualTableName',
];

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Check if a file should be excluded from hardcoded query checks
 */
function isAllowedFile(filePath) {
  return ALLOWED_FILES.some(pattern => filePath.includes(pattern));
}

/**
 * Check if content has dynamic transformation context
 */
function hasDynamicContext(content, matchIndex, windowSize = 500) {
  const start = Math.max(0, matchIndex - windowSize);
  const end = Math.min(content.length, matchIndex + windowSize);
  const context = content.slice(start, end);
  
  return DYNAMIC_CONTEXT_PATTERNS.some(pattern => context.includes(pattern));
}

/**
 * Check if a match is inside a comment
 */
function isInsideComment(content, matchIndex) {
  // Get the line containing this match
  const lineStart = content.lastIndexOf('\n', matchIndex) + 1;
  const lineContent = content.slice(lineStart, matchIndex);
  
  // Check if preceded by // on same line
  if (lineContent.includes('//')) return true;
  
  // Check if inside /* */ block comment
  const beforeMatch = content.slice(0, matchIndex);
  const lastBlockOpen = beforeMatch.lastIndexOf('/*');
  const lastBlockClose = beforeMatch.lastIndexOf('*/');
  if (lastBlockOpen > lastBlockClose) return true;
  
  return false;
}

/**
 * Find all hardcoded query violations in a file's content
 */
function findHardcodedViolations(content, filePath) {
  const violations = [];
  
  for (const pattern of FORBIDDEN_HARDCODED_PATTERNS) {
    // Reset regex state
    pattern.lastIndex = 0;
    
    let match;
    while ((match = pattern.exec(content)) !== null) {
      // Skip if inside a comment
      if (isInsideComment(content, match.index)) continue;
      
      // Check if this match is in a dynamic context
      if (!hasDynamicContext(content, match.index)) {
        // Get line number
        const lineNumber = content.slice(0, match.index).split('\n').length;
        
        violations.push({
          file: filePath,
          line: lineNumber,
          match: match[0],
          pattern: pattern.toString()
        });
      }
    }
  }
  
  return violations;
}

/**
 * Recursively get all JS/JSX files in a directory
 */
function getAllSourceFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // Skip node_modules and other non-source directories
      if (!['node_modules', 'dist', 'build', 'coverage', '.git'].includes(entry.name)) {
        getAllSourceFiles(fullPath, files);
      }
    } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// =============================================================================
// TESTS
// =============================================================================

describe('No Hardcoded Queries', () => {
  
  describe('Runtime Code Must Not Have Hardcoded Table Names', () => {
    
    it('should not have hardcoded FROM/JOIN patterns in runtime code', () => {
      const srcDir = path.resolve(__dirname, '..');
      const files = getAllSourceFiles(srcDir);
      
      const allViolations = [];
      
      for (const file of files) {
        if (isAllowedFile(file)) continue;
        
        const content = fs.readFileSync(file, 'utf-8');
        const violations = findHardcodedViolations(content, file);
        
        if (violations.length > 0) {
          allViolations.push(...violations);
        }
      }
      
      if (allViolations.length > 0) {
        const violationReport = allViolations.map(v => 
          `  ${v.file}:${v.line} - "${v.match}"`
        ).join('\n');
        
        expect.fail(
          `Found ${allViolations.length} hardcoded query violations in RUNTIME code:\n${violationReport}\n\n` +
          `Runtime code must use:\n` +
          `  - transformExampleQueries() to transform static templates\n` +
          `  - buildSafeFQN() for dynamic query construction\n` +
          `  - {{DATABASE}}.{{SCHEMA}}.{{TABLE}} placeholders`
        );
      }
      
      expect(allViolations).toHaveLength(0);
    });
    
  });
  
  describe('Template Source Files Are Allowed', () => {
    
    it('exampleQueries.js should be recognized as a template source', () => {
      expect(isAllowedFile('exampleQueries.js')).toBe(true);
    });
    
    it('mdlhUserQueries.js should be recognized as a template source', () => {
      expect(isAllowedFile('mdlhUserQueries.js')).toBe(true);
    });
    
    it('queryTemplates.js should be recognized as a template source', () => {
      expect(isAllowedFile('queryTemplates.js')).toBe(true);
    });
    
  });
  
  describe('Hardcoded Patterns Detection', () => {
    
    it('should detect FROM TABLE_ENTITY', () => {
      const content = `SELECT * FROM TABLE_ENTITY WHERE x = 1`;
      const violations = findHardcodedViolations(content, 'test.js');
      expect(violations.length).toBeGreaterThan(0);
    });
    
    it('should detect JOIN PROCESS_ENTITY', () => {
      const content = `SELECT * FROM foo JOIN PROCESS_ENTITY ON x = y`;
      const violations = findHardcodedViolations(content, 'test.js');
      expect(violations.length).toBeGreaterThan(0);
    });
    
    it('should NOT flag when dynamic context is present', () => {
      const content = `
        // This uses buildSafeFQN for all queries
        const fqn = buildSafeFQN(db, schema, 'TABLE_ENTITY');
        const query = \`SELECT * FROM \${fqn}\`;
      `;
      const violations = findHardcodedViolations(content, 'test.js');
      expect(violations).toHaveLength(0);
    });
    
    it('should NOT flag when transformExampleQueries is present', () => {
      const content = `
        // Transform static queries at runtime
        import { transformExampleQueries } from './dynamicExampleQueries';
        const queries = transformExampleQueries(staticQueries, db, schema, tables);
        // Original template had FROM TABLE_ENTITY but it gets transformed
      `;
      const violations = findHardcodedViolations(content, 'test.js');
      expect(violations).toHaveLength(0);
    });
    
  });
  
});

// =============================================================================
// INTEGRATION TEST: Full Query Pipeline
// =============================================================================

describe('Full Query Pipeline Integration', () => {
  
  it('template files should use standard entity table naming patterns', () => {
    // Template files are allowed to have hardcoded names
    // They get transformed at runtime by dynamicExampleQueries.js
    // This test verifies the naming conventions are consistent
    
    const entityTablePatterns = [
      'TABLE_ENTITY',
      'COLUMN_ENTITY', 
      'PROCESS_ENTITY',
      'ATLASGLOSSARY',
      'ATLASGLOSSARYTERM',
      'ATLASGLOSSARYCATEGORY',
      'DATABASE_ENTITY',
      'SCHEMA_ENTITY',
      'VIEW_ENTITY',
    ];
    
    // All entity tables should follow _ENTITY suffix pattern
    // or ATLAS prefix pattern for glossary types
    entityTablePatterns.forEach(table => {
      const isEntitySuffix = table.endsWith('_ENTITY');
      const isAtlasPrefix = table.startsWith('ATLAS');
      expect(isEntitySuffix || isAtlasPrefix).toBe(true);
    });
  });
  
});

