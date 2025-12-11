/**
 * Generic Extractors for Step Flow Results
 * 
 * These are reusable functions that extract data from Snowflake query results.
 * Used by the recipe builder to wire outputBindings without writing custom code.
 */

/**
 * Normalize Snowflake results to a consistent format.
 * Handles both array rows and object rows, uppercase and lowercase column names.
 */
export function normalizeResults(results) {
  if (!results || !Array.isArray(results.rows)) {
    return { columns: [], rows: [] };
  }

  // Extract column names, handling both string and object formats
  const colNames = (results.columns || []).map((c) =>
    typeof c === 'string' ? c : (c?.name || c?.NAME || String(c))
  );

  // If rows are arrays, convert to objects
  const rowsAsObjects = results.rows.map((row) => {
    if (Array.isArray(row)) {
      const obj = {};
      row.forEach((val, i) => {
        const k = colNames[i];
        if (k) obj[k] = val;
      });
      return obj;
    }
    return row;
  });

  return {
    ...results,
    columns: colNames,
    rows: rowsAsObjects,
  };
}

/**
 * Get a value from a row, trying multiple case variants
 */
export function getRowValue(row, columnName) {
  if (!row || !columnName) return undefined;
  return row[columnName] ?? 
         row[columnName.toUpperCase()] ?? 
         row[columnName.toLowerCase()] ??
         row[columnName.replace(/_/g, '')] ?? // try without underscores
         undefined;
}

/**
 * Collect all values from a single column into an array
 */
export function collectArrayFromColumn(columnName, limit = 100) {
  return (results) => {
    const normalized = normalizeResults(results);
    const items = [];
    
    for (const row of normalized.rows || []) {
      const val = getRowValue(row, columnName);
      if (val != null && val !== '') {
        items.push(val);
      }
      if (items.length >= limit) break;
    }
    
    return items;
  };
}

/**
 * Find the first row where a column matches a value (case-insensitive)
 */
export function findFirstMatch(columnName, matchValue) {
  return (results) => {
    const normalized = normalizeResults(results);
    
    for (const row of normalized.rows || []) {
      const val = getRowValue(row, columnName);
      if (val && String(val).toUpperCase().includes(matchValue.toUpperCase())) {
        return val;
      }
    }
    
    // Fallback: return first value if no match
    if (normalized.rows?.length > 0) {
      return getRowValue(normalized.rows[0], columnName);
    }
    
    return null;
  };
}

/**
 * Collect unique values from multiple candidate columns
 */
export function collectUniqueFromCandidates(columnNames, limit = 100) {
  return (results) => {
    const normalized = normalizeResults(results);
    const set = new Set();
    
    for (const row of normalized.rows || []) {
      for (const col of columnNames) {
        const val = getRowValue(row, col);
        if (val != null && val !== '') {
          set.add(val);
          if (set.size >= limit) break;
        }
      }
      if (set.size >= limit) break;
    }
    
    return Array.from(set);
  };
}

/**
 * Get the first value from a column
 */
export function firstValue(columnName) {
  return (results) => {
    const normalized = normalizeResults(results);
    if (normalized.rows?.length > 0) {
      return getRowValue(normalized.rows[0], columnName);
    }
    return null;
  };
}

/**
 * Check if any row has a specific value in a column
 */
export function hasValue(columnName, matchValue) {
  return (results) => {
    const normalized = normalizeResults(results);
    
    for (const row of normalized.rows || []) {
      const val = getRowValue(row, columnName);
      if (val && String(val).toUpperCase() === matchValue.toUpperCase()) {
        return true;
      }
    }
    
    return false;
  };
}

/**
 * Check if results have any rows
 */
export function hasRows() {
  return (results) => {
    const normalized = normalizeResults(results);
    return (normalized.rows?.length || 0) > 0;
  };
}

/**
 * Get the row count
 */
export function rowCount() {
  return (results) => {
    const normalized = normalizeResults(results);
    return normalized.rows?.length || 0;
  };
}

/**
 * Slice rows to a limit
 */
export function sliceRows(limit = 20) {
  return (results) => {
    const normalized = normalizeResults(results);
    return (normalized.rows || []).slice(0, limit);
  };
}

/**
 * Create an array of objects from multiple columns
 */
export function objectArrayFromColumns(columnNames) {
  return (results) => {
    const normalized = normalizeResults(results);
    
    return (normalized.rows || []).map(row => {
      const obj = {};
      for (const col of columnNames) {
        obj[col] = getRowValue(row, col);
      }
      return obj;
    });
  };
}

/**
 * Build an extractor function from a binding specification
 */
export function buildExtractor(spec) {
  if (!spec || !spec.mode) return () => null;
  
  switch (spec.mode) {
    case 'collectArray':
      return collectArrayFromColumn(spec.fromColumn, spec.limit);
      
    case 'findFirst':
      return findFirstMatch(spec.fromColumn, spec.match || '');
      
    case 'uniqueArray':
      return collectUniqueFromCandidates(spec.fromColumnCandidates || [spec.fromColumn], spec.limit);
      
    case 'firstValue':
      return firstValue(spec.fromColumn);
      
    case 'hasValue':
      return hasValue(spec.fromColumn, spec.match || '');
      
    case 'hasRows':
      return hasRows();
      
    case 'rowCount':
      return rowCount();
      
    case 'rowsSlice':
      return sliceRows(spec.limit);
      
    case 'objectArray':
      return objectArrayFromColumns(spec.fromColumns || []);
      
    default:
      return () => null;
  }
}

/**
 * Build a complete extractor function from all output bindings
 */
export function buildExtractorFromBindings(outputBindings) {
  if (!outputBindings || Object.keys(outputBindings).length === 0) {
    return () => ({});
  }

  return (results) => {
    const extracted = {};

    for (const [key, spec] of Object.entries(outputBindings)) {
      if (!spec) continue;
      
      const extractor = buildExtractor(spec);
      extracted[key] = extractor(results);
    }

    return extracted;
  };
}

export default {
  normalizeResults,
  getRowValue,
  collectArrayFromColumn,
  findFirstMatch,
  collectUniqueFromCandidates,
  firstValue,
  hasValue,
  hasRows,
  rowCount,
  sliceRows,
  objectArrayFromColumns,
  buildExtractor,
  buildExtractorFromBindings,
};

