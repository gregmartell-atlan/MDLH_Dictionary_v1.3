/**
 * Query Suggestions Utility
 * 
 * Provides intelligent SQL query suggestions including:
 * - Fuzzy matching for table/column names
 * - Query rewriting with available schema
 * - Proactive autocomplete suggestions
 */

import { createLogger } from './logger';

const log = createLogger('QuerySuggestions');

// =============================================================================
// Fuzzy Matching Algorithms
// =============================================================================

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
export function levenshteinDistance(a, b) {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  
  const matrix = [];
  const aLen = a.length;
  const bLen = b.length;

  // Initialize matrix
  for (let i = 0; i <= bLen; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= aLen; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[bLen][aLen];
}

/**
 * Calculate similarity score (0-1) between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score (1 = identical)
 */
export function similarityScore(a, b) {
  if (!a || !b) return 0;
  const aUpper = a.toUpperCase();
  const bUpper = b.toUpperCase();
  
  if (aUpper === bUpper) return 1;
  
  const maxLen = Math.max(aUpper.length, bUpper.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(aUpper, bUpper);
  return 1 - (distance / maxLen);
}

/**
 * Parse entity name into meaningful parts
 * e.g., "DBTMODELCOLUMN_ENTITY" → { prefix: "DBT", parts: ["MODEL", "COLUMN"], suffix: "ENTITY" }
 */
function parseEntityName(name) {
  const upper = name.toUpperCase();
  const withoutSuffix = upper.replace(/_ENTITY$/, '');
  
  // Common prefixes in MDLH
  const prefixes = ['DBT', 'ATLAS', 'POWERBI', 'TABLEAU', 'LOOKER', 'PRESET', 'METABASE', 'SIGMA', 'MODE', 'AIRFLOW', 'FIVETRAN', 'MONTE', 'SODA', 'S3', 'GCS', 'ADLS', 'AZURE', 'AWS'];
  let prefix = '';
  let remainder = withoutSuffix;
  
  for (const p of prefixes) {
    if (withoutSuffix.startsWith(p)) {
      prefix = p;
      remainder = withoutSuffix.slice(p.length);
      break;
    }
  }
  
  // Split camelCase or remaining parts
  const parts = remainder.split(/(?=[A-Z])/).filter(p => p.length > 0);
  
  return { prefix, parts, suffix: upper.endsWith('_ENTITY') ? 'ENTITY' : '', original: upper };
}

/**
 * Calculate semantic similarity between two entity names
 */
function entitySimilarity(target, candidate) {
  const t = parseEntityName(target);
  const c = parseEntityName(candidate);
  
  let score = 0;
  const reasons = [];
  
  // Same prefix is a strong signal (e.g., both DBT*)
  if (t.prefix && t.prefix === c.prefix) {
    score += 0.4;
    reasons.push(`Same ${t.prefix} family`);
  }
  
  // Check for shared parts
  const sharedParts = t.parts.filter(p => c.parts.includes(p));
  if (sharedParts.length > 0) {
    const partScore = (sharedParts.length / Math.max(t.parts.length, c.parts.length)) * 0.5;
    score += partScore;
    reasons.push(`Shares: ${sharedParts.join(', ')}`);
  }
  
  // Bonus for similar length (same complexity)
  const lengthRatio = Math.min(t.parts.length, c.parts.length) / Math.max(t.parts.length, c.parts.length);
  score += lengthRatio * 0.1;
  
  return { score: Math.min(score, 1), reasons };
}

/**
 * Find similar items from a list based on fuzzy matching
 * @param {string} target - Target string to match
 * @param {string[]} candidates - List of candidate strings
 * @param {number} minScore - Minimum similarity score (0-1)
 * @param {number} maxResults - Maximum results to return
 * @returns {Array<{name: string, score: number, reason: string}>}
 */
export function findSimilar(target, candidates, minScore = 0.25, maxResults = 8) {
  if (!target || !candidates?.length) return [];
  
  const targetUpper = target.toUpperCase();
  const results = [];
  
  for (const candidate of candidates) {
    const candidateUpper = candidate.toUpperCase();
    
    // Skip exact match (that's the one that doesn't exist!)
    if (candidateUpper === targetUpper) {
      continue;
    }
    
    // Try semantic entity matching first
    const semantic = entitySimilarity(target, candidate);
    if (semantic.score > 0.3) {
      results.push({ 
        name: candidate, 
        score: semantic.score, 
        reason: semantic.reasons.join(' • ') || 'Related entity'
      });
      continue;
    }
    
    // Remove common suffixes/prefixes for comparison
    const cleanTarget = targetUpper.replace(/_ENTITY$/, '').replace(/^ATLAS/, '');
    const cleanCandidate = candidateUpper.replace(/_ENTITY$/, '').replace(/^ATLAS/, '');
    
    // Same base entity type
    if (cleanCandidate === cleanTarget) {
      results.push({ name: candidate, score: 0.95, reason: 'Same entity type' });
      continue;
    }
    
    // One contains the other (partial match)
    if (cleanCandidate.includes(cleanTarget)) {
      const ratio = cleanTarget.length / cleanCandidate.length;
      results.push({ name: candidate, score: 0.6 + ratio * 0.3, reason: `Contains "${cleanTarget}"` });
      continue;
    }
    
    if (cleanTarget.includes(cleanCandidate)) {
      const ratio = cleanCandidate.length / cleanTarget.length;
      results.push({ name: candidate, score: 0.5 + ratio * 0.3, reason: `Part of "${cleanTarget}"` });
      continue;
    }
    
    // Levenshtein similarity as fallback
    const score = similarityScore(cleanTarget, cleanCandidate);
    if (score >= minScore) {
      results.push({ name: candidate, score, reason: `${Math.round(score * 100)}% similar` });
    }
  }
  
  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  // Deduplicate and limit
  const seen = new Set();
  const unique = results.filter(r => {
    if (seen.has(r.name.toUpperCase())) return false;
    seen.add(r.name.toUpperCase());
    return true;
  });
  
  return unique.slice(0, maxResults);
}

// =============================================================================
// SQL Parsing Utilities
// =============================================================================

/**
 * Extract table references from SQL query
 * @param {string} sql - SQL query
 * @returns {Array<{table: string, alias: string|null, position: number}>}
 */
export function extractTableReferences(sql) {
  if (!sql) return [];
  
  const tables = [];
  
  // Remove comments
  let cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Pattern for FROM/JOIN table references
  const patterns = [
    // FROM database.schema.table AS alias
    /(?:FROM|JOIN)\s+(?:(\w+)\.)?(?:(\w+)\.)?(\w+)(?:\s+(?:AS\s+)?(\w+))?/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(cleanSql)) !== null) {
      const [fullMatch, db, schema, table, alias] = match;
      if (table && !['SELECT', 'WHERE', 'AND', 'OR', 'ON', 'AS'].includes(table.toUpperCase())) {
        tables.push({
          table: table.toUpperCase(),
          database: db?.toUpperCase() || null,
          schema: schema?.toUpperCase() || null,
          alias: alias || null,
          position: match.index,
          fullMatch
        });
      }
    }
  }
  
  return tables;
}

/**
 * Extract column references from SQL query
 * @param {string} sql - SQL query
 * @returns {Array<{column: string, table: string|null, position: number}>}
 */
export function extractColumnReferences(sql) {
  if (!sql) return [];
  
  const columns = [];
  
  // Remove comments
  let cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Find SELECT columns
  const selectMatch = cleanSql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
  if (selectMatch) {
    const selectPart = selectMatch[1];
    // Split by comma, handling functions
    const parts = selectPart.split(/,(?![^(]*\))/);
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed === '*') continue;
      
      // Handle table.column or just column
      const colMatch = trimmed.match(/^(?:(\w+)\.)?(\w+)(?:\s+AS\s+\w+)?$/i);
      if (colMatch) {
        columns.push({
          column: colMatch[2].toUpperCase(),
          table: colMatch[1]?.toUpperCase() || null,
          inSelect: true
        });
      }
    }
  }
  
  // Find WHERE columns
  const whereMatch = cleanSql.match(/WHERE\s+([\s\S]*?)(?:ORDER|GROUP|LIMIT|$)/i);
  if (whereMatch) {
    const wherePart = whereMatch[1];
    const colPattern = /(?:(\w+)\.)?(\w+)\s*(?:=|!=|<>|>|<|>=|<=|LIKE|IN|IS)/gi;
    let match;
    while ((match = colPattern.exec(wherePart)) !== null) {
      const col = match[2].toUpperCase();
      if (!['AND', 'OR', 'NOT', 'NULL', 'TRUE', 'FALSE'].includes(col)) {
        columns.push({
          column: col,
          table: match[1]?.toUpperCase() || null,
          inWhere: true
        });
      }
    }
  }
  
  return columns;
}

// =============================================================================
// Suggestion Generation
// =============================================================================

/**
 * @typedef {Object} QuerySuggestion
 * @property {'table'|'column'|'syntax'|'rewrite'} type - Suggestion type
 * @property {string} title - Short title for the chip
 * @property {string} description - Longer description
 * @property {string} fix - The fix to apply
 * @property {string} [preview] - Preview of fixed query
 * @property {number} confidence - Confidence score (0-1)
 */

/**
 * Generate table suggestions for a missing table
 * @param {string} missingTable - Table name that doesn't exist
 * @param {Set<string>|string[]} availableTables - Available tables
 * @param {Object} tableInfo - Optional info about tables (row counts, etc.)
 * @returns {QuerySuggestion[]}
 */
export function suggestTableAlternatives(missingTable, availableTables, tableInfo = {}) {
  const tables = Array.isArray(availableTables) ? availableTables : [...availableTables];
  const suggestions = [];
  
  const similar = findSimilar(missingTable, tables, 0.25, 8);
  
  for (const match of similar) {
    const info = tableInfo[match.name?.toUpperCase()] || tableInfo[match.name];
    const rowCount = info?.rowCount;
    
    // Build a helpful description
    let description = match.reason;
    if (rowCount !== undefined) {
      description += rowCount > 0 
        ? ` • ${rowCount.toLocaleString()} rows` 
        : ' • Empty table';
    }
    
    suggestions.push({
      type: 'table',
      title: match.name,
      description,
      fix: match.name,
      confidence: match.score,
      rowCount,
      // Add badge for high-confidence matches
      badge: match.score > 0.7 ? '⭐ Best match' : null
    });
  }
  
  // Sort: prioritize tables with data, then by confidence
  suggestions.sort((a, b) => {
    // Tables with data first
    if (a.rowCount > 0 && (!b.rowCount || b.rowCount === 0)) return -1;
    if (b.rowCount > 0 && (!a.rowCount || a.rowCount === 0)) return 1;
    // Then by confidence
    return b.confidence - a.confidence;
  });
  
  return suggestions;
}

/**
 * Generate column suggestions for a missing column
 * @param {string} missingColumn - Column name that doesn't exist
 * @param {string[]} availableColumns - Available columns in the table
 * @param {string} tableName - Table name for context
 * @returns {QuerySuggestion[]}
 */
export function suggestColumnAlternatives(missingColumn, availableColumns, tableName) {
  const suggestions = [];
  
  const similar = findSimilar(missingColumn, availableColumns, 0.4, 5);
  
  for (const match of similar) {
    suggestions.push({
      type: 'column',
      title: match.name,
      description: `${match.reason} in ${tableName}`,
      fix: match.name,
      confidence: match.score
    });
  }
  
  return suggestions;
}

/**
 * Generate a rewritten query with fixes applied
 * @param {string} originalSql - Original SQL with errors
 * @param {Object} replacements - Map of original -> replacement
 * @returns {QuerySuggestion}
 */
export function generateQueryRewrite(originalSql, replacements) {
  let fixedSql = originalSql;
  const changes = [];
  
  for (const [original, replacement] of Object.entries(replacements)) {
    if (original !== replacement) {
      // Replace in a case-insensitive way but preserve structure
      const regex = new RegExp(`\\b${escapeRegex(original)}\\b`, 'gi');
      if (regex.test(fixedSql)) {
        fixedSql = fixedSql.replace(regex, replacement);
        changes.push({ from: original, to: replacement });
      }
    }
  }
  
  if (changes.length === 0) {
    return null;
  }
  
  return {
    type: 'rewrite',
    title: 'Apply all fixes',
    description: changes.map(c => `${c.from} → ${c.to}`).join(', '),
    fix: fixedSql,
    preview: fixedSql,
    confidence: 0.9,
    changes
  };
}

/**
 * Escape special regex characters
 * @param {string} str - String to escape
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// Proactive Suggestions (Autocomplete)
// =============================================================================

/**
 * Get proactive suggestions based on cursor position
 * @param {string} sql - Current SQL
 * @param {number} cursorPosition - Cursor position in the text
 * @param {Object} schema - Available schema info
 * @returns {QuerySuggestion[]}
 */
export function getProactiveSuggestions(sql, cursorPosition, schema) {
  if (!sql || !schema) return [];
  
  const suggestions = [];
  const textBeforeCursor = sql.substring(0, cursorPosition);
  const textAfterCursor = sql.substring(cursorPosition);
  
  // Check what context we're in
  const lastWord = textBeforeCursor.match(/(\w*)$/)?.[1] || '';
  const prevKeyword = textBeforeCursor.match(/\b(SELECT|FROM|JOIN|WHERE|AND|OR)\s+\w*$/i)?.[1]?.toUpperCase();
  
  // After FROM/JOIN - suggest tables
  if (prevKeyword === 'FROM' || prevKeyword === 'JOIN') {
    const tables = schema.tables || [];
    const filtered = lastWord 
      ? findSimilar(lastWord, tables, 0.2, 10)
      : tables.slice(0, 10).map(t => ({ name: t, score: 1, reason: 'Available table' }));
    
    for (const match of filtered) {
      suggestions.push({
        type: 'table',
        title: match.name,
        description: match.reason,
        fix: match.name,
        confidence: match.score,
        replaceFrom: cursorPosition - lastWord.length,
        replaceTo: cursorPosition
      });
    }
  }
  
  // After SELECT or in WHERE - suggest columns
  if (prevKeyword === 'SELECT' || prevKeyword === 'WHERE' || prevKeyword === 'AND' || prevKeyword === 'OR') {
    // Find which table we're querying
    const fromMatch = sql.match(/FROM\s+(?:\w+\.)?(?:\w+\.)?(\w+)/i);
    const tableName = fromMatch?.[1]?.toUpperCase();
    
    if (tableName && schema.columns?.[tableName]) {
      const columns = schema.columns[tableName];
      const filtered = lastWord
        ? findSimilar(lastWord, columns, 0.2, 10)
        : columns.slice(0, 10).map(c => ({ name: c, score: 1, reason: `Column in ${tableName}` }));
      
      for (const match of filtered) {
        suggestions.push({
          type: 'column',
          title: match.name,
          description: match.reason,
          fix: match.name,
          confidence: match.score,
          replaceFrom: cursorPosition - lastWord.length,
          replaceTo: cursorPosition
        });
      }
    }
  }
  
  return suggestions;
}

// =============================================================================
// Error-based Suggestions
// =============================================================================

/**
 * Detect placeholders in SQL that need to be replaced
 * @param {string} sql - SQL query
 * @returns {Array<{placeholder: string, type: string, suggestion: string}>}
 */
export function detectPlaceholders(sql) {
  const placeholders = [];
  
  // Common placeholder patterns
  const patterns = [
    // <PLACEHOLDER> style
    { 
      regex: /<([A-Z_]+)>/gi, 
      type: 'angle_bracket',
      getType: (match) => {
        const name = match[1].toUpperCase();
        if (name.includes('GUID')) return 'guid';
        if (name.includes('TABLE')) return 'table';
        if (name.includes('COLUMN')) return 'column';
        if (name.includes('DATABASE') || name.includes('DB')) return 'database';
        if (name.includes('SCHEMA')) return 'schema';
        if (name.includes('DATE')) return 'date';
        if (name.includes('VALUE')) return 'value';
        return 'generic';
      }
    },
    // YOUR_* style
    { 
      regex: /'YOUR_([A-Z_]+)'/gi, 
      type: 'your_prefix',
      getType: (match) => {
        const name = match[1].toUpperCase();
        if (name.includes('GUID')) return 'guid';
        if (name.includes('TABLE')) return 'table';
        return 'generic';
      }
    },
    // ${VARIABLE} style
    { 
      regex: /\$\{([A-Z_]+)\}/gi, 
      type: 'template',
      getType: () => 'generic'
    },
    // :variable style (bind parameters)
    { 
      regex: /:([a-zA-Z_][a-zA-Z0-9_]*)/g, 
      type: 'bind',
      getType: (match) => {
        const name = match[1].toLowerCase();
        if (name.includes('guid')) return 'guid';
        if (name.includes('id')) return 'id';
        return 'generic';
      }
    }
  ];
  
  for (const { regex, type, getType } of patterns) {
    let match;
    while ((match = regex.exec(sql)) !== null) {
      const placeholderType = getType(match);
      placeholders.push({
        placeholder: match[0],
        name: match[1],
        type: placeholderType,
        position: match.index
      });
    }
  }
  
  return placeholders;
}

/**
 * Find the best table in schema for querying GUIDs
 * ONLY returns tables that actually exist in the schema
 * @param {Object} schema - Available schema
 * @returns {string|null}
 */
function findBestGuidTable(schema) {
  const tables = schema.tables || [];
  if (tables.length === 0) return null;
  
  // Create a Set for O(1) lookup
  const tablesSet = new Set(tables.map(t => t.toUpperCase()));
  
  log.debug('findBestGuidTable - checking against tables', { 
    tableCount: tables.length,
    sampleTables: tables.slice(0, 10)
  });
  
  // Priority order for finding GUIDs (most likely to have useful data)
  const preferredTables = [
    'COLUMN_ENTITY',       // Usually has lots of data
    'TABLE_ENTITY',
    'VIEW_ENTITY', 
    'DATABASE_ENTITY',
    'SCHEMA_ENTITY',
    'PROCESS_ENTITY',      // Lineage - might not exist
    'ASSET_ENTITY',
    'CONNECTION_ENTITY'
  ];
  
  for (const preferred of preferredTables) {
    if (tablesSet.has(preferred)) {
      log.debug('findBestGuidTable - found preferred table', { table: preferred });
      return preferred;
    }
  }
  
  // Fall back to any _ENTITY table that actually exists
  const entityTable = tables.find(t => t.toUpperCase().endsWith('_ENTITY'));
  if (entityTable) {
    const result = entityTable.toUpperCase();
    log.debug('findBestGuidTable - using fallback entity table', { table: result });
    return result;
  }
  
  // Last resort: use first available table
  if (tables.length > 0) {
    const result = tables[0].toUpperCase();
    log.debug('findBestGuidTable - using first available table', { table: result });
    return result;
  }
  
  return null;
}

/**
 * Build a universal GUID search query across multiple entity tables
 * @param {string} guid - The GUID to search for
 * @param {Object} schema - Available schema
 * @returns {string|null} SQL query to find the GUID
 */
export function buildGuidSearchQuery(guid, schema) {
  const tables = schema.tables || [];
  const tablesSet = new Set(tables.map(t => t.toUpperCase()));
  
  // Common entity tables that have guid column
  const searchTables = [
    'TABLE_ENTITY',
    'VIEW_ENTITY',
    'COLUMN_ENTITY',
    'DATABASE_ENTITY',
    'SCHEMA_ENTITY',
    'CONNECTION_ENTITY',
    'GLOSSARYTERM_ENTITY',
    'ATLASGLOSSARYTERM_ENTITY',
    'PROCESS_ENTITY',
    'DBTMODEL_ENTITY',
    'POWERBIWORKSPACE_ENTITY'
  ].filter(t => tablesSet.has(t));
  
  if (searchTables.length === 0) {
    // Fall back to any _ENTITY tables
    const entityTables = tables.filter(t => t.toUpperCase().endsWith('_ENTITY')).slice(0, 5);
    if (entityTables.length === 0) return null;
    searchTables.push(...entityTables.map(t => t.toUpperCase()));
  }
  
  // Build UNION ALL query
  const unionParts = searchTables.map(table => 
    `SELECT '${table}' as source_table, guid, name, typename FROM ${table} WHERE guid = '${guid}'`
  );
  
  return `-- Search for GUID across multiple entity tables
${unionParts.join('\nUNION ALL\n')}
LIMIT 1;`;
}

/**
 * Generate suggestions for placeholder values
 * @param {Object} placeholder - Detected placeholder
 * @param {Object} schema - Available schema
 * @returns {QuerySuggestion[]}
 */
function suggestPlaceholderValues(placeholder, schema) {
  const suggestions = [];
  const tables = schema.tables || [];
  
  switch (placeholder.type) {
    case 'guid':
      // Find an actual table to suggest for GUID lookup
      const guidTable = findBestGuidTable(schema);
      
      // Double-check this table exists
      const tablesSetCheck = new Set(tables.map(t => t.toUpperCase()));
      const tableExists = guidTable && tablesSetCheck.has(guidTable);
      
      if (tableExists) {
        log.debug('suggestPlaceholderValues - using verified table for GUID lookup', { guidTable });
        
        suggestions.push({
          type: 'info',
          title: `Replace with a real GUID`,
          description: `Replace ${placeholder.placeholder} with an actual asset GUID`,
          fix: null,
          confidence: 1,
          helpText: `To find a GUID:\n1. Search by name in ${guidTable}\n2. Or use the universal GUID search below`,
          isGuidance: true
        });
        
        // Suggest a query to find GUIDs using an actual table
        suggestions.push({
          type: 'rewrite',
          title: `Search by name in ${guidTable}`,
          description: `Find GUIDs by asset name`,
          fix: `-- Find GUIDs by asset name\nSELECT guid, name, typename\nFROM ${guidTable}\nWHERE name ILIKE '%your_search_term%'\nORDER BY name\nLIMIT 10;`,
          confidence: 0.9,
          isHelper: true
        });
        
        // Also suggest a universal GUID search
        const searchTables = tables.filter(t => t.toUpperCase().endsWith('_ENTITY')).slice(0, 5);
        if (searchTables.length > 1) {
          suggestions.push({
            type: 'rewrite',
            title: `Search GUID across all tables`,
            description: `Search multiple entity tables for a specific GUID`,
            fix: `-- Search for a GUID across multiple tables\n-- Replace 'your-guid-here' with the actual GUID\n${searchTables.slice(0, 3).map(t => 
              `SELECT '${t}' as source, guid, name FROM ${t} WHERE guid = 'your-guid-here'`
            ).join('\nUNION ALL\n')}\nLIMIT 1;`,
            confidence: 0.85,
            isHelper: true
          });
        }
      } else {
        // No suitable entity tables found - suggest SHOW TABLES
        log.debug('suggestPlaceholderValues - no suitable GUID table found', { 
          guidTable, 
          tableExists,
          availableTables: tables.slice(0, 5)
        });
        
        suggestions.push({
          type: 'info',
          title: `Find available tables first`,
          description: `Run SHOW TABLES to see what's available in your schema`,
          fix: null,
          confidence: 0.8,
          helpText: `SHOW TABLES;\n\nThen query one of the *_ENTITY tables to find GUIDs.`,
          isGuidance: true
        });
      }
      break;
      
    case 'table':
      if (tables.length > 0) {
        // Show actual tables from their schema
        const entityTables = tables.filter(t => t.toUpperCase().endsWith('_ENTITY')).slice(0, 5);
        const displayTables = entityTables.length > 0 ? entityTables : tables.slice(0, 5);
        
        suggestions.push({
          type: 'info',
          title: 'Available tables',
          description: `${tables.length} tables in your schema`,
          fix: null,
          confidence: 0.8,
          helpText: `Available tables:\n${displayTables.map(t => `• ${t}`).join('\n')}${tables.length > 5 ? `\n... and ${tables.length - 5} more` : ''}`,
          isGuidance: true
        });
      }
      break;
      
    case 'date':
      suggestions.push({
        type: 'syntax',
        title: 'Use current date',
        description: 'Replace with CURRENT_DATE()',
        fix: 'CURRENT_DATE()',
        confidence: 0.7
      });
      break;
  }
  
  return suggestions;
}

/**
 * Suggest fixes for common MDLH lineage query patterns
 * Only suggests tables that actually exist in the schema
 * @param {string} sql - SQL query
 * @param {Object} schema - Available schema
 * @returns {QuerySuggestion[]}
 */
function suggestLineageQueryFixes(sql, schema) {
  const suggestions = [];
  const sqlUpper = sql.toUpperCase();
  const tables = schema.tables || [];
  const tablesUpper = new Set(tables.map(t => t.toUpperCase()));
  
  // Detect lineage query patterns
  const isLineageQuery = sqlUpper.includes('LINEAGE') || 
                         sqlUpper.includes('INPUTS') || 
                         sqlUpper.includes('OUTPUTS') ||
                         sqlUpper.includes('UPSTREAM') ||
                         sqlUpper.includes('DOWNSTREAM');
  
  if (!isLineageQuery) return suggestions;
  
  // Check for PROCESSEXECUTION_ENTITY (common mistake - should be PROCESS_ENTITY)
  if (sqlUpper.includes('PROCESSEXECUTION_ENTITY')) {
    if (tablesUpper.has('PROCESS_ENTITY')) {
      suggestions.push({
        type: 'table',
        title: 'PROCESS_ENTITY',
        description: '⭐ Correct table for lineage • Exists in your schema',
        fix: 'PROCESS_ENTITY',
        confidence: 0.95,
        badge: 'Recommended'
      });
    }
  }
  
  // Suggest COLUMNPROCESS_ENTITY for column-level lineage (only if it exists)
  if (sqlUpper.includes('COLUMN') && sqlUpper.includes('LINEAGE')) {
    if (tablesUpper.has('COLUMNPROCESS_ENTITY')) {
      suggestions.push({
        type: 'table',
        title: 'COLUMNPROCESS_ENTITY',
        description: 'For column-level lineage • Exists in your schema',
        fix: 'COLUMNPROCESS_ENTITY',
        confidence: 0.8
      });
    }
  }
  
  // Build dynamic lineage tips based on what tables actually exist
  const lineageTables = [];
  if (tablesUpper.has('PROCESS_ENTITY')) {
    lineageTables.push('• PROCESS_ENTITY - Table/view level lineage');
  }
  if (tablesUpper.has('COLUMNPROCESS_ENTITY')) {
    lineageTables.push('• COLUMNPROCESS_ENTITY - Column level lineage');
  }
  if (tablesUpper.has('ASSET_ENTITY')) {
    lineageTables.push('• ASSET_ENTITY - Base asset with inputs/outputs');
  }
  // Check for DBT-specific lineage tables
  if (tablesUpper.has('DBTPROCESS_ENTITY')) {
    lineageTables.push('• DBTPROCESS_ENTITY - dbt model lineage');
  }
  if (tablesUpper.has('DBTCOLUMNPROCESS_ENTITY')) {
    lineageTables.push('• DBTCOLUMNPROCESS_ENTITY - dbt column lineage');
  }
  
  if (lineageTables.length > 0) {
    suggestions.push({
      type: 'info',
      title: 'Lineage Tables in Your Schema',
      description: `${lineageTables.length} lineage-related tables available`,
      fix: null,
      confidence: 0.6,
      isGuidance: true,
      helpText: `Available lineage tables:\n${lineageTables.join('\n')}`
    });
  } else {
    // No lineage tables found - suggest checking available tables
    suggestions.push({
      type: 'info',
      title: 'No lineage tables found',
      description: 'Your schema may not have standard lineage tables',
      fix: null,
      confidence: 0.5,
      isGuidance: true,
      helpText: `Run SHOW TABLES to see available tables.\nLineage data may be in different tables in your MDLH setup.`
    });
  }
  
  return suggestions;
}

/**
 * Generate suggestions based on a query error
 * @param {string} sql - The SQL that failed
 * @param {string} error - Error message
 * @param {Object} schema - Available schema info
 * @returns {QuerySuggestion[]}
 */
export function getSuggestionsFromError(sql, error, schema) {
  const suggestions = [];
  const errorUpper = error.toUpperCase();
  
  // Extract the table that caused the error (if any)
  // We'll exclude this from suggestions since it clearly doesn't work
  let failedTable = null;
  const failedTableMatch = error.match(/Object\s+'([^']+)'\s+does not exist/i) ||
                           error.match(/Table\s+'([^']+)'\s+does not exist/i) ||
                           error.match(/'([A-Z_]+_ENTITY)'\s+does not exist/i);
  if (failedTableMatch) {
    failedTable = failedTableMatch[1].toUpperCase();
    log.debug('Table that caused error', { failedTable });
  }
  
  // Create a filtered schema that excludes the failed table
  const filteredSchema = {
    ...schema,
    tables: (schema.tables || []).filter(t => t.toUpperCase() !== failedTable)
  };
  
  // First, check for placeholders that need to be replaced
  const placeholders = detectPlaceholders(sql);
  if (placeholders.length > 0) {
    for (const ph of placeholders) {
      // Use filtered schema so we don't suggest the failed table
      const phSuggestions = suggestPlaceholderValues(ph, filteredSchema);
      suggestions.push(...phSuggestions);
    }
  }
  
  // Check for lineage query patterns and suggest fixes
  const lineageSuggestions = suggestLineageQueryFixes(sql, filteredSchema);
  suggestions.push(...lineageSuggestions);
  
  // Missing table - use the already extracted failedTable
  if (failedTable) {
    // Use filtered schema tables (excluding the failed table)
    const tables = filteredSchema.tables || [];
    
    // Don't add duplicate suggestions from lineage fixes
    const alreadySuggested = suggestions.some(s => s.type === 'table');
    if (!alreadySuggested) {
      const tableSuggestions = suggestTableAlternatives(failedTable, tables, schema.tableInfo);
      suggestions.push(...tableSuggestions);
    }
    
    // Also generate a full rewrite if we have a good match
    const bestTableMatch = suggestions.find(s => s.type === 'table' && s.confidence > 0.6);
    if (bestTableMatch) {
      const rewrite = generateQueryRewrite(sql, { [failedTable]: bestTableMatch.fix });
      if (rewrite) {
        suggestions.push(rewrite);
      }
    }
  }
  
  // Invalid column
  const columnMatch = error.match(/invalid identifier\s+'([^']+)'/i) ||
                      error.match(/column\s+'([^']+)'\s+not found/i);
  
  if (columnMatch) {
    const missingColumn = columnMatch[1].toUpperCase();
    
    // Find which table the column was supposed to be in
    const tableRefs = extractTableReferences(sql);
    for (const ref of tableRefs) {
      const columns = schema.columns?.[ref.table];
      if (columns) {
        const colSuggestions = suggestColumnAlternatives(missingColumn, columns, ref.table);
        suggestions.push(...colSuggestions);
      }
    }
  }
  
  // Syntax errors - common typos
  const syntaxSuggestions = [
    { pattern: /SELEC\s/i, fix: 'SELECT ', title: 'SELECT', reason: 'Fix typo: SELEC → SELECT' },
    { pattern: /FORM\s/i, fix: 'FROM ', title: 'FROM', reason: 'Fix typo: FORM → FROM' },
    { pattern: /WEHERE\s/i, fix: 'WHERE ', title: 'WHERE', reason: 'Fix typo: WEHERE → WHERE' },
    { pattern: /GRUOP\s/i, fix: 'GROUP ', title: 'GROUP', reason: 'Fix typo: GRUOP → GROUP' },
    { pattern: /ODER\s/i, fix: 'ORDER ', title: 'ORDER', reason: 'Fix typo: ODER → ORDER' },
    { pattern: /LIMT\s/i, fix: 'LIMIT ', title: 'LIMIT', reason: 'Fix typo: LIMT → LIMIT' },
  ];
  
  for (const { pattern, fix, title, reason } of syntaxSuggestions) {
    if (pattern.test(sql)) {
      const fixedSql = sql.replace(pattern, fix);
      suggestions.push({
        type: 'syntax',
        title,
        description: reason,
        fix: fixedSql,
        preview: fixedSql,
        confidence: 0.95
      });
    }
  }
  
  // Trailing comma before FROM
  if (errorUpper.includes('UNEXPECTED') && errorUpper.includes(',')) {
    const trailingCommaFix = sql.replace(/,(\s*FROM)/gi, '$1');
    if (trailingCommaFix !== sql) {
      suggestions.push({
        type: 'syntax',
        title: 'Remove trailing comma',
        description: 'Remove comma before FROM clause',
        fix: trailingCommaFix,
        preview: trailingCommaFix,
        confidence: 0.9
      });
    }
  }
  
  // Validate that ALL suggestions reference existing AND working tables
  // Use filteredSchema which excludes the table that just failed
  const tablesSet = new Set((filteredSchema.tables || []).map(t => t.toUpperCase()));
  
  // Helper to extract table names from SQL/text
  const extractTableRefs = (text) => {
    if (!text) return [];
    const matches = text.match(/\b([A-Z_]+_ENTITY)\b/gi) || [];
    return matches.map(m => m.toUpperCase());
  };
  
  const validatedSuggestions = suggestions.filter(s => {
    // For table-type suggestions, verify the table exists AND isn't the failed table
    if (s.type === 'table') {
      const tableName = s.fix?.toUpperCase();
      if (tableName === failedTable) {
        log.debug('Filtering out suggestion for the failed table', { table: s.fix });
        return false;
      }
      if (tableName && tablesSet.has(tableName)) return true;
      log.debug('Filtering out table suggestion for non-existent table', { table: s.fix });
      return false;
    }
    
    // For helper/rewrite suggestions that contain SQL, validate table references
    if (s.isHelper || s.type === 'rewrite') {
      const referencedTables = extractTableRefs(s.fix);
      for (const table of referencedTables) {
        // Skip if it references the failed table or a non-existent table
        if (table === failedTable || !tablesSet.has(table)) {
          log.debug('Filtering out suggestion with problematic table in SQL', { 
            type: s.type, 
            title: s.title,
            problematicTable: table,
            isFailedTable: table === failedTable
          });
          return false;
        }
      }
    }
    
    // For guidance with helpText, validate and fix references
    if (s.isGuidance && s.helpText) {
      const referencedTables = extractTableRefs(s.helpText);
      for (const table of referencedTables) {
        if (table === failedTable || !tablesSet.has(table)) {
          log.debug('Guidance references problematic table, finding replacement', { 
            title: s.title,
            problematicTable: table
          });
          // Update the helpText to use an actual working table
          const actualTable = findBestGuidTable(filteredSchema);
          if (actualTable && actualTable !== failedTable) {
            s.helpText = s.helpText.replace(new RegExp(table, 'gi'), actualTable);
          } else {
            // Can't find a good replacement, suggest SHOW TABLES instead
            s.helpText = `Run SHOW TABLES; to see available tables.`;
          }
        }
      }
    }
    
    return true;
  });
  
  // Sort suggestions: actionable fixes first, then guidance
  validatedSuggestions.sort((a, b) => {
    // Guidance/info items go last
    if (a.isGuidance && !b.isGuidance) return 1;
    if (b.isGuidance && !a.isGuidance) return -1;
    // High confidence first
    return (b.confidence || 0) - (a.confidence || 0);
  });
  
  log.debug('Generated suggestions from error', { 
    errorPreview: error.substring(0, 100),
    suggestionCount: validatedSuggestions.length,
    filteredCount: suggestions.length - validatedSuggestions.length,
    hasPlaceholders: placeholders.length > 0
  });
  
  return validatedSuggestions;
}

// =============================================================================
// Schema Cache
// =============================================================================

/**
 * @typedef {Object} SchemaCache
 * @property {string[]} tables - List of table names
 * @property {Object<string, string[]>} columns - Map of table -> columns
 * @property {Object<string, {rowCount: number}>} tableInfo - Table metadata
 */

/**
 * Build schema cache from metadata
 * @param {Array} tables - Tables from metadata API
 * @param {Object<string, Array>} columnsMap - Map of table -> columns
 * @returns {SchemaCache}
 */
export function buildSchemaCache(tables, columnsMap = {}) {
  const schema = {
    tables: [],
    columns: {},
    tableInfo: {}
  };
  
  for (const table of tables) {
    const name = typeof table === 'string' ? table : table.name;
    const upperName = name.toUpperCase();
    
    schema.tables.push(upperName);
    
    if (typeof table === 'object') {
      schema.tableInfo[upperName] = {
        rowCount: table.row_count || table.rowCount || 0
      };
    }
  }
  
  for (const [tableName, columns] of Object.entries(columnsMap)) {
    schema.columns[tableName.toUpperCase()] = columns.map(c => 
      typeof c === 'string' ? c.toUpperCase() : c.name?.toUpperCase()
    ).filter(Boolean);
  }
  
  log.info('Built schema cache', { 
    tableCount: schema.tables.length,
    tablesWithColumns: Object.keys(schema.columns).length
  });
  
  return schema;
}

export default {
  // Fuzzy matching
  levenshteinDistance,
  similarityScore,
  findSimilar,
  
  // SQL parsing
  extractTableReferences,
  extractColumnReferences,
  detectPlaceholders,
  
  // Suggestion generation
  suggestTableAlternatives,
  suggestColumnAlternatives,
  generateQueryRewrite,
  getProactiveSuggestions,
  getSuggestionsFromError,
  
  // Schema cache
  buildSchemaCache
};

