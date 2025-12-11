/**
 * Snowflake Error Analyzer
 * 
 * Intelligent error analysis for Snowflake SQL queries with:
 * - Syntax error detection and fix recommendations
 * - Data availability checking with alternative table suggestions
 * - "Run this instead?" action generation
 */

import { createLogger } from './logger';
import { findSimilar, extractTableReferences } from './querySuggestions';

const log = createLogger('SnowflakeErrorAnalyzer');

// =============================================================================
// Snowflake Error Code Patterns
// =============================================================================

/**
 * Known Snowflake error codes and their meanings
 */
const SNOWFLAKE_ERROR_CODES = {
  // Type/Function errors
  '001007': {
    type: 'type_mismatch',
    category: 'syntax',
    title: 'Invalid argument type',
    description: 'Function received an incompatible data type'
  },
  '000904': {
    type: 'invalid_identifier',
    category: 'syntax',
    title: 'Invalid identifier',
    description: 'Column or object name not found'
  },
  '090105': {
    type: 'parse_error',
    category: 'syntax', 
    title: 'Cannot parse value',
    description: 'String conversion failed'
  },
  '000604': {
    type: 'query_canceled',
    category: 'execution',
    title: 'Query canceled',
    description: 'Query was canceled or timed out'
  },
  '002003': {
    type: 'object_not_found',
    category: 'data_availability',
    title: 'Object does not exist',
    description: 'Table, view, or schema not found'
  },
  '090106': {
    type: 'empty_result',
    category: 'data_availability',
    title: 'No data found',
    description: 'Query returned zero rows'
  },
  '002043': {
    type: 'permission_denied',
    category: 'access',
    title: 'Permission denied',
    description: 'Insufficient privileges'
  }
};

// Common Snowflake function type fixes
const FUNCTION_TYPE_FIXES = {
  'TO_VARCHAR': {
    invalidTypes: ['VARIANT', 'ARRAY', 'OBJECT'],
    fixes: [
      { from: 'TO_VARCHAR(column)', to: 'column::STRING', when: 'VARIANT scalar' },
      { from: 'TO_VARCHAR(column)', to: 'TO_JSON(column)::STRING', when: 'VARIANT complex' },
      { from: 'TO_VARCHAR(column)', to: 'column:fieldName::STRING', when: 'JSON field extraction' }
    ],
    recommendation: 'For VARIANT columns, use ::STRING for scalar values or column:field::STRING for JSON fields'
  },
  'TO_JSON': {
    invalidTypes: ['VARCHAR', 'STRING', 'NUMBER'],
    fixes: [
      { from: 'TO_JSON(column)', to: 'column', when: 'Already string' },
      { from: 'TO_JSON(column)', to: 'PARSE_JSON(column)', when: 'Parse JSON string' }
    ],
    recommendation: 'TO_JSON only works on VARIANT types. For VARCHAR, use PARSE_JSON() first'
  },
  'ARRAY_CONTAINS': {
    invalidTypes: ['VARIANT', 'VARCHAR'],
    fixes: [
      { from: "ARRAY_CONTAINS('value'::VARIANT, col)", to: "col::STRING ILIKE '%value%'", when: 'VARIANT column' },
      { from: "ARRAY_CONTAINS('value'::VARIANT, col)", to: "ARRAY_CONTAINS('value'::VARIANT, PARSE_JSON(col))", when: 'JSON string' }
    ],
    recommendation: 'ARRAY_CONTAINS requires native ARRAY type. For VARIANT, use ::STRING ILIKE pattern matching'
  },
  'ARRAY_TO_STRING': {
    invalidTypes: ['VARIANT'],
    fixes: [
      { from: 'ARRAY_TO_STRING(col, sep)', to: 'col::STRING', when: 'VARIANT array' }
    ],
    recommendation: 'For VARIANT arrays, cast to ::STRING directly instead of using ARRAY_TO_STRING'
  }
};

// =============================================================================
// Error Parsing
// =============================================================================

/**
 * Parse a Snowflake error message into structured data
 * @param {string} error - Raw error message
 * @returns {Object} Parsed error info
 */
export function parseSnowflakeError(error) {
  const errorStr = String(error);
  
  // Extract error code (e.g., "001007 (22023)")
  const codeMatch = errorStr.match(/(\d{6})\s*\((\d{5})\)/);
  const errorCode = codeMatch ? codeMatch[1] : null;
  const sqlState = codeMatch ? codeMatch[2] : null;
  
  // Get known error info
  const knownError = errorCode ? SNOWFLAKE_ERROR_CODES[errorCode] : null;
  
  // Extract specific details based on error type
  let details = {};
  
  // Function type mismatch - handle truncated error messages
  const funcMatch = errorStr.match(/invalid type\s*\[([^\]]+)\]\s*for (?:parameter|function)\s*'([^']*)/i);
  if (funcMatch) {
    details.invalidType = funcMatch[1];
    // Handle truncated function names like 'TO_VA...'
    let funcName = funcMatch[2];
    if (funcName.startsWith('TO_VA')) funcName = 'TO_VARCHAR';
    if (funcName.startsWith('TO_JS')) funcName = 'TO_JSON';
    if (funcName.startsWith('ARRAY_C')) funcName = 'ARRAY_CONTAINS';
    if (funcName.startsWith('ARRAY_T')) funcName = 'ARRAY_TO_STRING';
    details.functionName = funcName;
    details.isFunctionError = true;
  }
  
  // Object not found
  const objMatch = errorStr.match(/Object\s+'([^']+)'\s+does not exist/i) ||
                   errorStr.match(/Table\s+'([^']+)'\s+does not exist/i) ||
                   errorStr.match(/relation\s+"([^"]+)"\s+does not exist/i);
  if (objMatch) {
    details.missingObject = objMatch[1];
    details.isObjectError = true;
  }
  
  // Column not found
  const colMatch = errorStr.match(/invalid identifier\s+'([^']+)'/i) ||
                   errorStr.match(/column\s+'([^']+)'\s+not found/i);
  if (colMatch) {
    details.missingColumn = colMatch[1];
    details.isColumnError = true;
  }
  
  // Syntax error location
  const lineMatch = errorStr.match(/line\s+(\d+)/i);
  const posMatch = errorStr.match(/position\s+(\d+)/i);
  if (lineMatch) details.line = parseInt(lineMatch[1], 10);
  if (posMatch) details.position = parseInt(posMatch[1], 10);
  
  return {
    raw: errorStr,
    errorCode,
    sqlState,
    knownError,
    details,
    category: knownError?.category || (details.isFunctionError ? 'syntax' : details.isObjectError ? 'data_availability' : 'unknown'),
    title: knownError?.title || (details.isFunctionError ? 'Type mismatch' : details.isObjectError ? 'Object not found' : 'Query error'),
    shortMessage: errorStr.length > 150 ? errorStr.substring(0, 150) + '...' : errorStr
  };
}

// =============================================================================
// Fix Generation
// =============================================================================

/**
 * Generate syntax fix recommendations for a function type error
 * @param {string} sql - Original SQL
 * @param {Object} errorDetails - Parsed error details
 * @returns {Array} Array of fix recommendations
 */
export function generateFunctionTypeFixes(sql, errorDetails) {
  const fixes = [];
  const { functionName, invalidType } = errorDetails;
  
  if (!functionName) return fixes;
  
  const funcFixes = FUNCTION_TYPE_FIXES[functionName.toUpperCase()];
  
  // Always try to apply the fix directly first
  const fixedSql = applyFunctionFix(sql, functionName, null, invalidType);
  if (fixedSql && fixedSql !== sql) {
    fixes.push({
      type: 'syntax',
      title: `Use ::STRING instead`,
      description: `Convert ${functionName} to string cast for VARIANT columns`,
      fix: fixedSql,
      preview: fixedSql.substring(0, 200) + (fixedSql.length > 200 ? '...' : ''),
      confidence: 0.9,
      canRun: true,
      badge: 'Auto-fix'
    });
  }
  
  if (!funcFixes) {
    // Generic recommendation
    fixes.push({
      type: 'syntax',
      title: `Check ${functionName} argument types`,
      description: `The function received type ${invalidType} which may not be supported`,
      recommendation: `Review Snowflake documentation for ${functionName} supported types`,
      confidence: 0.5
    });
    return fixes;
  }
  
  // Add specific fixes from mapping (if different from main fix)
  for (const fix of funcFixes.fixes) {
    const specificFix = applyFunctionFix(sql, functionName, fix, invalidType);
    if (specificFix && specificFix !== sql && !fixes.some(f => f.fix === specificFix)) {
      fixes.push({
        type: 'syntax',
        title: `Fix: ${fix.from.split('(')[0]}`,
        description: fix.when,
        fix: specificFix,
        preview: specificFix.substring(0, 200) + (specificFix.length > 200 ? '...' : ''),
        confidence: 0.85,
        canRun: true
      });
    }
  }
  
  // Add general recommendation
  fixes.push({
    type: 'info',
    title: 'Snowflake type guidance',
    description: funcFixes.recommendation,
    isGuidance: true,
    confidence: 0.7
  });
  
  return fixes;
}

/**
 * Apply a function fix pattern to SQL
 * @param {string} sql - Original SQL
 * @param {string} funcName - Function name
 * @param {Object} fix - Fix pattern
 * @param {string} invalidType - The invalid type that was detected
 * @returns {string|null} Fixed SQL or null
 */
function applyFunctionFix(sql, funcName, fix, invalidType) {
  const funcUpper = funcName.toUpperCase();
  
  // Pattern to match function calls
  const patterns = [
    // TO_VARCHAR(column)
    new RegExp(`${funcUpper}\\s*\\(\\s*([^)]+)\\s*\\)`, 'gi'),
    // column::VARCHAR
    new RegExp(`([\\w."]+)\\s*::\\s*VARCHAR`, 'gi')
  ];
  
  let fixedSql = sql;
  
  if (funcUpper === 'TO_VARCHAR' || funcUpper === 'TO_JSON') {
    // Replace TO_VARCHAR(col) with col::STRING for VARIANT
    fixedSql = fixedSql.replace(
      new RegExp(`TO_VARCHAR\\s*\\(\\s*([^)]+)\\s*\\)`, 'gi'),
      (match, column) => {
        // If the column contains a path (like col:field), use ::STRING
        if (column.includes(':')) {
          return `${column}::STRING`;
        }
        // For simple columns, use ::STRING
        return `${column.trim()}::STRING`;
      }
    );
    
    // Also replace ::VARCHAR with ::STRING for VARIANT
    fixedSql = fixedSql.replace(
      /::VARCHAR(?:\(\d+\))?/gi,
      '::STRING'
    );
  }
  
  if (funcUpper === 'ARRAY_CONTAINS') {
    // Replace ARRAY_CONTAINS('value'::VARIANT, col) with col::STRING ILIKE '%value%'
    fixedSql = fixedSql.replace(
      /ARRAY_CONTAINS\s*\(\s*'([^']+)'::VARIANT\s*,\s*([^)]+)\s*\)/gi,
      (match, value, column) => `${column.trim()}::STRING ILIKE '%${value}%'`
    );
  }
  
  if (funcUpper === 'ARRAY_TO_STRING') {
    // Replace ARRAY_TO_STRING(col, sep) with col::STRING
    fixedSql = fixedSql.replace(
      /ARRAY_TO_STRING\s*\(\s*([^,]+)\s*,\s*'[^']*'\s*\)/gi,
      (match, column) => `${column.trim()}::STRING`
    );
  }
  
  return fixedSql !== sql ? fixedSql : null;
}

/**
 * Generate data availability recommendations
 * @param {string} sql - Original SQL
 * @param {Object} errorDetails - Parsed error details
 * @param {Object} schema - Available schema
 * @param {Function} executeQuery - Function to execute queries
 * @returns {Promise<Array>} Array of recommendations
 */
export async function generateDataAvailabilityFixes(sql, errorDetails, schema, executeQuery) {
  const fixes = [];
  const { missingObject } = errorDetails;
  const tables = schema?.tables || [];
  
  if (!missingObject) return fixes;
  
  // Find similar tables that DO exist
  const similar = findSimilar(missingObject, tables, 0.3, 5);
  
  // For each similar table, check if it has data
  for (const match of similar) {
    let hasData = true;
    let rowCount = null;
    
    // Try to get row count
    if (executeQuery) {
      try {
        const countResult = await executeQuery(`SELECT COUNT(*) as cnt FROM ${match.name} LIMIT 1`);
        if (countResult?.rows?.length > 0) {
          const row = countResult.rows[0];
          rowCount = row.CNT || row.cnt || row[0] || 0;
          hasData = rowCount > 0;
        }
      } catch (e) {
        log.debug('Could not check row count', { table: match.name, error: e.message });
      }
    }
    
    // Generate replacement SQL
    const fixedSql = sql.replace(
      new RegExp(`\\b${escapeRegex(missingObject)}\\b`, 'gi'),
      match.name
    );
    
    fixes.push({
      type: 'table_alternative',
      title: match.name,
      description: `${match.reason}${rowCount !== null ? ` • ${rowCount.toLocaleString()} rows` : ''}`,
      fix: fixedSql,
      hasData,
      rowCount,
      confidence: match.score,
      canRun: hasData,
      badge: hasData && match.score > 0.7 ? '✓ Has data' : (hasData ? 'Has data' : '⚠ Empty')
    });
  }
  
  // Sort: tables with data first, then by confidence
  fixes.sort((a, b) => {
    if (a.hasData && !b.hasData) return -1;
    if (b.hasData && !a.hasData) return 1;
    return b.confidence - a.confidence;
  });
  
  // Add guidance if no good alternatives
  if (fixes.filter(f => f.hasData).length === 0) {
    fixes.push({
      type: 'info',
      title: 'Check available schemas',
      description: 'The table might exist in a different schema or database',
      isGuidance: true,
      helpQuery: `-- List all schemas in current database
SHOW SCHEMAS;

-- List tables in a specific schema  
SHOW TABLES IN SCHEMA your_schema;`,
      canRun: true,
      confidence: 0.5
    });
  }
  
  return fixes;
}

/**
 * Escape regex special characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// Main Analysis Function
// =============================================================================

/**
 * Analyze a query error and generate intelligent recommendations
 * @param {string} sql - Original SQL that failed
 * @param {string} error - Error message
 * @param {Object} schema - Available schema info
 * @param {Function} executeQuery - Optional function to run test queries
 * @returns {Promise<Object>} Analysis result with recommendations
 */
export async function analyzeQueryError(sql, error, schema, executeQuery = null) {
  const parsed = parseSnowflakeError(error);
  
  log.info('Analyzing query error', {
    category: parsed.category,
    errorCode: parsed.errorCode,
    details: parsed.details
  });
  
  const result = {
    errorType: parsed.category,
    errorCode: parsed.errorCode,
    title: parsed.title,
    shortMessage: parsed.shortMessage,
    recommendations: []
  };
  
  // Generate fixes based on error category
  switch (parsed.category) {
    case 'syntax':
      if (parsed.details.isFunctionError) {
        const syntaxFixes = generateFunctionTypeFixes(sql, parsed.details);
        result.recommendations.push(...syntaxFixes);
      }
      if (parsed.details.isColumnError) {
        // Suggest removing the invalid column
        const { missingColumn } = parsed.details;
        const fixedSql = sql.replace(new RegExp(`\\b${missingColumn}\\b,?\\s*`, 'gi'), '');
        if (fixedSql !== sql) {
          result.recommendations.push({
            type: 'syntax',
            title: `Remove invalid column`,
            description: `Column "${missingColumn}" doesn't exist - remove it from the query`,
            fix: fixedSql.replace(/,\s*FROM/gi, ' FROM'), // Clean up trailing comma
            preview: fixedSql.substring(0, 200),
            confidence: 0.7,
            canRun: true,
            badge: 'Auto-fix'
          });
        }
        // Also suggest checking available columns
        result.recommendations.push({
          type: 'info',
          title: 'Check column names',
          description: `Column "${missingColumn}" not found. Check the table schema for available columns.`,
          isGuidance: true
        });
      }
      break;
      
    case 'data_availability':
      if (parsed.details.isObjectError) {
        const dataFixes = await generateDataAvailabilityFixes(
          sql, 
          parsed.details, 
          schema, 
          executeQuery
        );
        result.recommendations.push(...dataFixes);
      }
      break;
  }
  
  // Add "Run recommended query?" action for top fix
  const topFix = result.recommendations.find(r => r.canRun && r.fix);
  if (topFix) {
    result.suggestedAction = {
      title: `Run ${topFix.title} instead?`,
      sql: topFix.fix,
      confidence: topFix.confidence
    };
  }
  
  return result;
}

/**
 * Quick check if a table has data
 * @param {string} tableName - Table to check
 * @param {Function} executeQuery - Query function
 * @returns {Promise<{hasData: boolean, rowCount: number|null}>}
 */
export async function checkTableHasData(tableName, executeQuery) {
  if (!executeQuery) return { hasData: true, rowCount: null };
  
  try {
    const result = await executeQuery(
      `SELECT COUNT(*) as cnt FROM ${tableName} WHERE 1=1 LIMIT 1`
    );
    if (result?.rows?.length > 0) {
      const row = result.rows[0];
      const count = row.CNT || row.cnt || row[0] || 0;
      return { hasData: count > 0, rowCount: count };
    }
  } catch (e) {
    log.debug('checkTableHasData failed', { table: tableName, error: e.message });
  }
  
  return { hasData: true, rowCount: null };
}

/**
 * Find tables in a schema that have data
 * @param {string[]} tables - List of table names
 * @param {Function} executeQuery - Query function
 * @param {number} sampleSize - Max tables to check
 * @returns {Promise<Array>} Tables with data info
 */
export async function findTablesWithData(tables, executeQuery, sampleSize = 10) {
  const results = [];
  const toCheck = tables.slice(0, sampleSize);
  
  for (const table of toCheck) {
    const { hasData, rowCount } = await checkTableHasData(table, executeQuery);
    results.push({ name: table, hasData, rowCount });
  }
  
  return results.filter(t => t.hasData).sort((a, b) => (b.rowCount || 0) - (a.rowCount || 0));
}

export default {
  parseSnowflakeError,
  generateFunctionTypeFixes,
  generateDataAvailabilityFixes,
  analyzeQueryError,
  checkTableHasData,
  findTablesWithData,
  SNOWFLAKE_ERROR_CODES,
  FUNCTION_TYPE_FIXES
};

