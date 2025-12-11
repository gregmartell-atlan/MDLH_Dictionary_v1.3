/**
 * Query Result Adapter
 * 
 * Transforms raw Snowflake query results from transport shape to render shape.
 * 
 * Transport shape (what backend gives us):
 *   { columns: string[], rows: any[][] }
 * 
 * Render shape (what UI components want):
 *   Record<string, any>[]
 * 
 * This is the standard adapter pattern for tabular data in React.
 */

/**
 * @typedef {Object} RawQueryResult
 * @property {(string | {name: string, type?: string})[]} columns - Column names or column objects
 * @property {any[][]} rows - Array of row arrays (positional values)
 * @property {number} [rowCount] - Total row count
 * @property {number} [total_rows] - Alternative row count field
 * @property {number} [executionTime] - Query execution time in ms
 */

/**
 * @typedef {Record<string, any>} NormalizedRow
 */

/**
 * Extract column name from column definition
 * Handles both string columns and object columns {name, type}
 * 
 * @param {string | {name: string, type?: string}} col - Column definition
 * @param {number} index - Column index (fallback for unnamed columns)
 * @returns {string} Column name
 */
export function getColumnName(col, index = 0) {
  if (typeof col === 'string') return col;
  if (col && typeof col === 'object' && col.name) return col.name;
  return `col_${index}`;
}

/**
 * Normalize a single row from array format to object format
 * 
 * @param {any[]} row - Row as array of values
 * @param {(string | {name: string})[]} columns - Column definitions
 * @returns {NormalizedRow} Row as object with column keys
 */
export function normalizeRow(row, columns) {
  const obj = {};
  columns.forEach((col, i) => {
    const colName = getColumnName(col, i);
    obj[colName] = row[i] ?? null;
  });
  return obj;
}

/**
 * Normalize all rows from raw query result
 * 
 * This is the main adapter function that transforms transport shape → render shape.
 * 
 * @param {RawQueryResult | null | undefined} raw - Raw query result from backend
 * @returns {NormalizedRow[]} Array of row objects ready for rendering
 * 
 * @example
 * const raw = {
 *   columns: ['NAME', 'ROW_COUNT', 'TYPENAME'],
 *   rows: [
 *     ['PROCESS_ENTITY', 2849, 'Table'],
 *     ['COLUMN_ENTITY', 15420, 'Table']
 *   ]
 * };
 * 
 * const normalized = normalizeRows(raw);
 * // [
 * //   { NAME: 'PROCESS_ENTITY', ROW_COUNT: 2849, TYPENAME: 'Table' },
 * //   { NAME: 'COLUMN_ENTITY', ROW_COUNT: 15420, TYPENAME: 'Table' }
 * // ]
 */
export function normalizeRows(raw) {
  if (!raw?.rows || !raw?.columns) return [];
  
  return raw.rows.map(row => normalizeRow(row, raw.columns));
}

/**
 * Extract column names from raw result
 * 
 * @param {RawQueryResult | null | undefined} raw - Raw query result
 * @returns {string[]} Array of column names
 */
export function extractColumnNames(raw) {
  if (!raw?.columns) return [];
  return raw.columns.map((col, i) => getColumnName(col, i));
}

/**
 * Get row count from raw result (handles various field names)
 * 
 * @param {RawQueryResult | null | undefined} raw - Raw query result
 * @returns {number} Row count
 */
export function getRowCount(raw) {
  if (!raw) return 0;
  return raw.rowCount ?? raw.total_rows ?? raw.rows?.length ?? 0;
}

/**
 * Get column count from raw result
 * 
 * @param {RawQueryResult | null | undefined} raw - Raw query result
 * @returns {number} Column count
 */
export function getColumnCount(raw) {
  return raw?.columns?.length ?? 0;
}

/**
 * Check if result is empty (has columns but no rows)
 * 
 * @param {RawQueryResult | null | undefined} raw - Raw query result
 * @returns {boolean} True if query returned 0 rows
 */
export function isEmptyResult(raw) {
  return getRowCount(raw) === 0 && getColumnCount(raw) > 0;
}

/**
 * Check if result is null/undefined (no result yet)
 * 
 * @param {RawQueryResult | null | undefined} raw - Raw query result
 * @returns {boolean} True if no result data
 */
export function hasNoResult(raw) {
  return !raw || (!raw.columns && !raw.rows);
}

export default {
  normalizeRows,
  normalizeRow,
  extractColumnNames,
  getColumnName,
  getRowCount,
  getColumnCount,
  isEmptyResult,
  hasNoResult
};


