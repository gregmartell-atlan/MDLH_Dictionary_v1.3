/**
 * SNOWFLAKE SQL COMPATIBILITY TESTS
 * 
 * This test suite validates that all queries in the application use
 * Snowflake-compatible SQL syntax and functions.
 * 
 * Reference: https://docs.snowflake.com/en/sql-reference
 * 
 * SUPPORTED SNOWFLAKE FUNCTIONS USED IN THIS APP:
 * - LATERAL FLATTEN: For array/object expansion
 * - ARRAY_CONTAINS: Check if array contains value
 * - JAROWINKLER_SIMILARITY: String similarity (95 = 95% similar)
 * - REGEXP_REPLACE: Regular expression replacement
 * - LISTAGG: String aggregation with delimiter
 * - TO_TIMESTAMP: Convert to timestamp
 * - OBJECT_CONSTRUCT: Create JSON objects
 * - ARRAY_AGG: Aggregate into arrays
 * - ARRAY_TO_STRING: Convert array to string
 * - Type casts: ::VARIANT, ::VARCHAR, ::ARRAY, ::STRING, ::TIMESTAMP_TZ
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// SNOWFLAKE-COMPATIBLE PATTERNS
// =============================================================================

/**
 * Valid Snowflake SQL patterns used in this application
 */
const VALID_SNOWFLAKE_PATTERNS = {
  // Array/Semi-structured data functions
  LATERAL_FLATTEN: /LATERAL\s+FLATTEN\s*\(\s*INPUT\s*=>/gi,
  ARRAY_CONTAINS: /ARRAY_CONTAINS\s*\(/gi,
  ARRAY_AGG: /ARRAY_AGG\s*\(/gi,
  ARRAY_TO_STRING: /ARRAY_TO_STRING\s*\(/gi,
  OBJECT_CONSTRUCT: /OBJECT_CONSTRUCT\s*\(/gi,
  
  // String functions
  JAROWINKLER_SIMILARITY: /JAROWINKLER_SIMILARITY\s*\(/gi,
  REGEXP_REPLACE: /REGEXP_REPLACE\s*\(/gi,
  LISTAGG: /LISTAGG\s*\(.*\)\s*WITHIN\s+GROUP\s*\(/gi,
  
  // Type casts (Snowflake-specific syntax)
  VARIANT_CAST: /::VARIANT/gi,
  VARCHAR_CAST: /::VARCHAR/gi,
  ARRAY_CAST: /::ARRAY/gi,
  STRING_CAST: /::STRING/gi,
  TIMESTAMP_CAST: /::TIMESTAMP(_TZ|_LTZ|_NTZ)?/gi,
  
  // Time/date functions
  TO_TIMESTAMP: /TO_TIMESTAMP\s*\(/gi,
  
  // Snowflake-specific keywords
  SHOW_TABLES: /SHOW\s+TABLES/gi,
  SHOW_DATABASES: /SHOW\s+DATABASES/gi,
  DESCRIBE_TABLE: /DESCRIBE\s+TABLE/gi,
  USE_DATABASE: /USE\s+\w+/gi,
};

/**
 * Potentially problematic patterns that need review
 */
const POTENTIALLY_PROBLEMATIC_PATTERNS = {
  // These work in Snowflake but syntax varies
  RECURSIVE_CTE: /WITH\s+RECURSIVE/gi,
  
  // Array access patterns
  ARRAY_INDEX: /\[\d+\]/g,  // e.g., column[0]
  
  // JSON path access  
  COLON_PATH: /:\w+/g,      // e.g., column:field
  
  // Division that might cause errors
  DIVIDE_BY_ZERO: /\s+\/\s+0\b/gi,
};

/**
 * Known incompatible patterns (from other SQL dialects)
 * 
 * NOTE: Be careful with patterns - some valid Snowflake syntax can look similar.
 * For example, ::ARRAY[0] is valid Snowflake array indexing.
 */
const INCOMPATIBLE_PATTERNS = {
  // MySQL-specific
  MYSQL_CONCAT: /CONCAT_WS\s*\(/gi,  // Use LISTAGG or || instead
  MYSQL_IFNULL: /IFNULL\s*\(/gi,     // Use COALESCE in Snowflake
  MYSQL_LIMIT_OFFSET: /LIMIT\s+\d+\s*,\s*\d+/gi,  // Use LIMIT x OFFSET y
  
  // PostgreSQL-specific that differ
  // Note: ::ARRAY[0] is valid Snowflake (array index), so we only flag standalone ARRAY[
  PG_ARRAY_LITERAL: /(?<!::)\bARRAY\s*\[/gi,  // Use ARRAY_CONSTRUCT in Snowflake (but not ::ARRAY[n])
  
  // Oracle-specific
  ORACLE_ROWNUM: /\bROWNUM\b/gi,     // Use ROW_NUMBER() OVER()
  ORACLE_NVL: /\bNVL\s*\(/gi,        // Use COALESCE or IFNULL
  
  // SQL Server-specific
  SQLSERVER_TOP: /\bTOP\s+\d+\b/gi,  // Use LIMIT instead
  SQLSERVER_ISNULL: /\bISNULL\s*\(/gi, // Use COALESCE
};

// =============================================================================
// TEST UTILITIES
// =============================================================================

/**
 * Extract all SQL strings from a JavaScript/JSX file
 */
function extractSQLStrings(content) {
  const sqlStrings = [];
  
  // Match template literals with SQL-like content
  const templateLiteralRegex = /`([^`]*(?:SELECT|INSERT|UPDATE|DELETE|SHOW|DESCRIBE|WITH|FROM)[^`]*)`/gis;
  let match;
  while ((match = templateLiteralRegex.exec(content)) !== null) {
    sqlStrings.push(match[1]);
  }
  
  // Match single/double quoted strings with SQL-like content
  const quotedRegex = /['"]([^'"]*(?:SELECT|INSERT|UPDATE|DELETE|SHOW|DESCRIBE|WITH|FROM)[^'"]*)['"]/gis;
  while ((match = quotedRegex.exec(content)) !== null) {
    sqlStrings.push(match[1]);
  }
  
  return sqlStrings;
}

/**
 * Check a SQL string for compatibility issues
 */
function checkSQLCompatibility(sql) {
  const issues = [];
  const warnings = [];
  const validPatterns = [];
  
  // Check for valid Snowflake patterns (for reference)
  for (const [name, pattern] of Object.entries(VALID_SNOWFLAKE_PATTERNS)) {
    pattern.lastIndex = 0;
    if (pattern.test(sql)) {
      validPatterns.push(name);
    }
  }
  
  // Check for potentially problematic patterns
  for (const [name, pattern] of Object.entries(POTENTIALLY_PROBLEMATIC_PATTERNS)) {
    pattern.lastIndex = 0;
    if (pattern.test(sql)) {
      warnings.push({
        pattern: name,
        message: `Pattern "${name}" found - verify it works as expected in Snowflake`
      });
    }
  }
  
  // Check for incompatible patterns
  for (const [name, pattern] of Object.entries(INCOMPATIBLE_PATTERNS)) {
    pattern.lastIndex = 0;
    if (pattern.test(sql)) {
      issues.push({
        pattern: name,
        message: `Incompatible pattern "${name}" found - this syntax is not supported in Snowflake`
      });
    }
  }
  
  return { issues, warnings, validPatterns };
}

/**
 * Get all source files recursively
 */
function getAllSourceFiles(dir, files = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'build', 'coverage', '.git'].includes(entry.name)) {
          getAllSourceFiles(fullPath, files);
        }
      } else if (entry.isFile() && /\.(js|jsx|ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Directory doesn't exist or can't be read
  }
  
  return files;
}

// =============================================================================
// TESTS
// =============================================================================

// =============================================================================
// MULTI-STATEMENT DETECTION
// =============================================================================

/**
 * Check if SQL contains multiple executable statements
 * Snowflake by default only allows single statement execution
 */
function hasMultipleStatements(sql) {
  // Remove comments
  const withoutComments = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Split by semicolons and filter to actual SQL statements
  const statements = withoutComments.split(';').filter(s => {
    const trimmed = s.trim();
    return trimmed.length > 10 && 
           /\b(SELECT|SHOW|DESCRIBE|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|USE)\b/i.test(trimmed);
  });
  
  return statements.length > 1;
}

describe('Snowflake SQL Compatibility', () => {
  
  describe('Valid Snowflake Patterns', () => {
    
    it('LATERAL FLATTEN syntax should be correct', () => {
      const validSQL = `SELECT * FROM table, LATERAL FLATTEN(INPUT => column) AS f`;
      const { issues } = checkSQLCompatibility(validSQL);
      expect(issues).toHaveLength(0);
    });
    
    it('ARRAY_CONTAINS should use Snowflake syntax', () => {
      const validSQL = `SELECT * FROM table WHERE ARRAY_CONTAINS('value'::VARIANT, column)`;
      const { issues, validPatterns } = checkSQLCompatibility(validSQL);
      expect(issues).toHaveLength(0);
      expect(validPatterns).toContain('ARRAY_CONTAINS');
    });
    
    it('JAROWINKLER_SIMILARITY should be available', () => {
      const validSQL = `SELECT JAROWINKLER_SIMILARITY(col1, col2) AS similarity FROM table`;
      const { issues, validPatterns } = checkSQLCompatibility(validSQL);
      expect(issues).toHaveLength(0);
      expect(validPatterns).toContain('JAROWINKLER_SIMILARITY');
    });
    
    it('LISTAGG with WITHIN GROUP should work', () => {
      const validSQL = `SELECT LISTAGG(name, ', ') WITHIN GROUP (ORDER BY name) FROM table`;
      const { issues, validPatterns } = checkSQLCompatibility(validSQL);
      expect(issues).toHaveLength(0);
      expect(validPatterns).toContain('LISTAGG');
    });
    
    it('Type casts with :: should work', () => {
      const validSQL = `SELECT col::VARCHAR, arr::ARRAY, val::VARIANT FROM table`;
      const { issues, validPatterns } = checkSQLCompatibility(validSQL);
      expect(issues).toHaveLength(0);
      expect(validPatterns).toContain('VARCHAR_CAST');
      expect(validPatterns).toContain('ARRAY_CAST');
      expect(validPatterns).toContain('VARIANT_CAST');
    });
    
  });
  
  describe('Incompatible Patterns Detection', () => {
    
    it('should detect MySQL IFNULL (use COALESCE instead)', () => {
      const invalidSQL = `SELECT IFNULL(column, 'default') FROM table`;
      const { issues } = checkSQLCompatibility(invalidSQL);
      expect(issues.some(i => i.pattern === 'MYSQL_IFNULL')).toBe(true);
    });
    
    it('should detect MySQL LIMIT offset syntax', () => {
      const invalidSQL = `SELECT * FROM table LIMIT 10, 20`;
      const { issues } = checkSQLCompatibility(invalidSQL);
      expect(issues.some(i => i.pattern === 'MYSQL_LIMIT_OFFSET')).toBe(true);
    });
    
    it('should detect Oracle ROWNUM', () => {
      const invalidSQL = `SELECT * FROM table WHERE ROWNUM < 10`;
      const { issues } = checkSQLCompatibility(invalidSQL);
      expect(issues.some(i => i.pattern === 'ORACLE_ROWNUM')).toBe(true);
    });
    
    it('should detect SQL Server TOP', () => {
      const invalidSQL = `SELECT TOP 10 * FROM table`;
      const { issues } = checkSQLCompatibility(invalidSQL);
      expect(issues.some(i => i.pattern === 'SQLSERVER_TOP')).toBe(true);
    });
    
  });
  
  describe('Application Query Files', () => {
    
    it('exampleQueries.js should use Snowflake-compatible syntax', () => {
      const filePath = path.resolve(__dirname, '../data/exampleQueries.js');
      
      if (!fs.existsSync(filePath)) {
        console.log('Skipping - file not found:', filePath);
        return;
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const sqlStrings = extractSQLStrings(content);
      
      const allIssues = [];
      
      for (const sql of sqlStrings) {
        const { issues } = checkSQLCompatibility(sql);
        if (issues.length > 0) {
          allIssues.push({ sql: sql.slice(0, 100) + '...', issues });
        }
      }
      
      if (allIssues.length > 0) {
        const report = allIssues.map(i => 
          `  SQL: "${i.sql}"\n  Issues: ${i.issues.map(x => x.message).join(', ')}`
        ).join('\n\n');
        
        expect.fail(`Found Snowflake compatibility issues:\n${report}`);
      }
    });
    
    it('queryTemplates.js should use Snowflake-compatible syntax', () => {
      const filePath = path.resolve(__dirname, '../data/queryTemplates.js');
      
      if (!fs.existsSync(filePath)) {
        console.log('Skipping - file not found:', filePath);
        return;
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const sqlStrings = extractSQLStrings(content);
      
      const allIssues = [];
      
      for (const sql of sqlStrings) {
        const { issues } = checkSQLCompatibility(sql);
        if (issues.length > 0) {
          allIssues.push({ sql: sql.slice(0, 100) + '...', issues });
        }
      }
      
      if (allIssues.length > 0) {
        const report = allIssues.map(i => 
          `  SQL: "${i.sql}"\n  Issues: ${i.issues.map(x => x.message).join(', ')}`
        ).join('\n\n');
        
        expect.fail(`Found Snowflake compatibility issues:\n${report}`);
      }
    });
    
    it('mdlhUserQueries.js should use Snowflake-compatible syntax', () => {
      const filePath = path.resolve(__dirname, '../data/mdlhUserQueries.js');
      
      if (!fs.existsSync(filePath)) {
        console.log('Skipping - file not found:', filePath);
        return;
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const sqlStrings = extractSQLStrings(content);
      
      const allIssues = [];
      
      for (const sql of sqlStrings) {
        const { issues } = checkSQLCompatibility(sql);
        if (issues.length > 0) {
          allIssues.push({ sql: sql.slice(0, 100) + '...', issues });
        }
      }
      
      if (allIssues.length > 0) {
        const report = allIssues.map(i => 
          `  SQL: "${i.sql}"\n  Issues: ${i.issues.map(x => x.message).join(', ')}`
        ).join('\n\n');
        
        expect.fail(`Found Snowflake compatibility issues:\n${report}`);
      }
    });
    
  });
  
  describe('Single Statement Requirement', () => {
    
    it('should detect multi-statement queries', () => {
      const multiSQL = `SELECT * FROM table1; SELECT * FROM table2;`;
      expect(hasMultipleStatements(multiSQL)).toBe(true);
      
      const singleSQL = `SELECT * FROM table1 LIMIT 10`;
      expect(hasMultipleStatements(singleSQL)).toBe(false);
      
      const withComments = `-- First query
SELECT * FROM table1
-- This is just a comment; not a statement
LIMIT 10`;
      expect(hasMultipleStatements(withComments)).toBe(false);
    });
    
    it('exampleQueries.js should have no multi-statement queries', () => {
      const filePath = path.resolve(__dirname, '../data/exampleQueries.js');
      if (!fs.existsSync(filePath)) return;
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const sqlStrings = extractSQLStrings(content);
      const violations = [];
      
      for (const sql of sqlStrings) {
        if (hasMultipleStatements(sql)) {
          violations.push(sql.slice(0, 80).replace(/\n/g, ' ') + '...');
        }
      }
      
      if (violations.length > 0) {
        expect.fail(
          `Found ${violations.length} multi-statement queries (Snowflake requires single statements):\n` +
          violations.map(v => `  - ${v}`).join('\n')
        );
      }
    });
    
    it('mdlhUserQueries.js should have no multi-statement queries', () => {
      const filePath = path.resolve(__dirname, '../data/mdlhUserQueries.js');
      if (!fs.existsSync(filePath)) return;
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const sqlStrings = extractSQLStrings(content);
      const violations = [];
      
      for (const sql of sqlStrings) {
        if (hasMultipleStatements(sql)) {
          violations.push(sql.slice(0, 80).replace(/\n/g, ' ') + '...');
        }
      }
      
      if (violations.length > 0) {
        expect.fail(
          `Found ${violations.length} multi-statement queries (Snowflake requires single statements):\n` +
          violations.map(v => `  - ${v}`).join('\n')
        );
      }
    });
    
  });
  
  describe('SQL Builder Functions', () => {
    
    it('all SQL builders in queryFlows/sql/ should use Snowflake syntax', () => {
      const sqlDir = path.resolve(__dirname, '../queryFlows/sql');
      
      if (!fs.existsSync(sqlDir)) {
        console.log('Skipping - directory not found:', sqlDir);
        return;
      }
      
      const files = getAllSourceFiles(sqlDir);
      const allIssues = [];
      
      for (const file of files) {
        // Skip test files
        if (file.includes('.test.')) continue;
        
        const content = fs.readFileSync(file, 'utf-8');
        const sqlStrings = extractSQLStrings(content);
        
        for (const sql of sqlStrings) {
          const { issues } = checkSQLCompatibility(sql);
          if (issues.length > 0) {
            allIssues.push({ 
              file: path.basename(file),
              sql: sql.slice(0, 80) + '...', 
              issues 
            });
          }
        }
      }
      
      if (allIssues.length > 0) {
        const report = allIssues.map(i => 
          `  File: ${i.file}\n  SQL: "${i.sql}"\n  Issues: ${i.issues.map(x => x.message).join(', ')}`
        ).join('\n\n');
        
        expect.fail(`Found Snowflake compatibility issues in SQL builders:\n${report}`);
      }
    });
    
  });
  
});

// =============================================================================
// SNOWFLAKE FUNCTION REFERENCE (for developers)
// =============================================================================

/**
 * SNOWFLAKE FUNCTION QUICK REFERENCE
 * 
 * ARRAY FUNCTIONS:
 * - ARRAY_CONTAINS(value, array) - Check if array contains value
 * - ARRAY_SIZE(array) - Get array length
 * - ARRAY_AGG(expr) - Aggregate values into array
 * - ARRAY_TO_STRING(array, delimiter) - Join array elements
 * - FLATTEN(INPUT => array) - Expand array to rows (use with LATERAL)
 * 
 * STRING FUNCTIONS:
 * - LISTAGG(col, delim) WITHIN GROUP (ORDER BY ...) - Aggregate strings
 * - JAROWINKLER_SIMILARITY(s1, s2) - String similarity (0-100)
 * - REGEXP_REPLACE(str, pattern, replacement) - Regex replace
 * 
 * TYPE CASTS:
 * - value::VARCHAR - Cast to string
 * - value::VARIANT - Cast to variant (semi-structured)
 * - value::ARRAY - Cast to array
 * - value::TIMESTAMP_TZ - Cast to timestamp with timezone
 * 
 * JSON/OBJECT:
 * - OBJECT_CONSTRUCT('key1', val1, 'key2', val2) - Create JSON object
 * - column:field - Access JSON field
 * - column[0] - Access array element
 * 
 * COMMON GOTCHAS:
 * - Use COALESCE instead of IFNULL/NVL for portability
 * - Use LIMIT x OFFSET y, not LIMIT y, x
 * - Use ROW_NUMBER() OVER() instead of ROWNUM
 * - LATERAL FLATTEN requires INPUT => syntax
 */

