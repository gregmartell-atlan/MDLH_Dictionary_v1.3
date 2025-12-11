/**
 * Result Formatters
 * 
 * Smart value formatting based on data types and column context.
 * Implements the MDLH Query Patterns spec for type-aware display.
 */

// =============================================================================
// Type Detection
// =============================================================================

/**
 * Check if a value looks like a GUID/UUID
 * Supports both hyphenated and non-hyphenated formats
 * 
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isGuid(value) {
  if (!value || typeof value !== 'string') return false;
  
  // UUID v4 format: 8-4-4-4-12 hex chars
  const uuidWithHyphens = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  // Without hyphens: 32 hex chars
  const uuidWithoutHyphens = /^[a-f0-9]{32}$/i;
  
  return uuidWithHyphens.test(value) || uuidWithoutHyphens.test(value);
}

/**
 * Check if a value looks like a timestamp
 * Supports ISO 8601, date-only, and Snowflake formats
 * 
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function looksLikeTimestamp(value) {
  if (!value || typeof value !== 'string') return false;
  
  // ISO 8601: 2024-12-06T10:30:00Z or 2024-12-06T10:30:00.000Z
  const iso8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
  // Date only: 2024-12-06
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  // Snowflake timestamp: 2024-12-06 10:30:00.000
  const snowflakeTs = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;
  
  return iso8601.test(value) || dateOnly.test(value) || snowflakeTs.test(value);
}

// =============================================================================
// Time Formatting
// =============================================================================

/**
 * Format a date as relative time (e.g., "2 hours ago")
 * 
 * @param {Date|string} date - Date to format
 * @returns {string} Human-readable relative time
 */
export function formatRelativeTime(date) {
  if (!date) return 'Invalid date';
  
  // Convert string to Date if needed
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Check for invalid date
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return 'Invalid date';
  }
  
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  
  if (diffSeconds < 60) {
    return 'just now';
  }
  
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  
  if (diffDays < 7) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
  
  if (diffWeeks < 4) {
    return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
  }
  
  return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
}

// =============================================================================
// Number Formatting
// =============================================================================

/**
 * Format a number with appropriate suffixes (K, M, B) or units
 * 
 * @param {number} value - Number to format
 * @param {string} columnName - Column name for context (e.g., 'bytes', 'row_count')
 * @returns {string} Formatted number
 */
export function formatNumber(value, columnName) {
  if (value === null || value === undefined) return '-';
  
  const num = Number(value);
  if (isNaN(num)) return String(value);
  
  // Handle bytes specially
  if (columnName === 'bytes' || columnName?.toLowerCase()?.includes('bytes') || columnName?.toLowerCase()?.includes('size')) {
    return formatBytes(num);
  }
  
  // Handle row counts
  const isRowCount = columnName === 'row_count' || columnName?.toLowerCase()?.includes('count');
  const suffix = isRowCount ? ' rows' : '';
  
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  
  if (absNum < 1000) {
    // For small numbers, show as-is (handle decimals)
    return Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, '');
  }
  
  if (absNum < 1000000) {
    const formatted = (absNum / 1000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${formatted}K${suffix}`;
  }
  
  if (absNum < 1000000000) {
    const formatted = (absNum / 1000000).toFixed(1).replace(/\.0$/, '');
    return `${sign}${formatted}M${suffix}`;
  }
  
  const formatted = (absNum / 1000000000).toFixed(1).replace(/\.0$/, '');
  return `${sign}${formatted}B${suffix}`;
}

/**
 * Format bytes with appropriate units
 * 
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  
  // Format with 1 decimal for non-bytes, but remove trailing .0
  const formatted = i === 0 ? value.toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${formatted} ${units[i]}`;
}

// =============================================================================
// Array/Object Formatting
// =============================================================================

/**
 * Format an array for preview display
 * 
 * @param {Array} arr - Array to format
 * @param {number} maxItems - Max items to show (default 5)
 * @returns {{count: number, preview: string, truncated: boolean}}
 */
export function formatArrayPreview(arr, maxItems = 5) {
  if (arr === null) {
    return { count: 0, preview: 'null', truncated: false };
  }
  
  if (!Array.isArray(arr)) {
    return { count: 0, preview: String(arr), truncated: false };
  }
  
  const count = arr.length;
  
  if (count === 0) {
    return { count: 0, preview: '[]', truncated: false };
  }
  
  const truncated = count > maxItems;
  const items = arr.slice(0, maxItems);
  
  const formatted = items.map(item => {
    if (typeof item === 'object' && item !== null) {
      return JSON.stringify(item);
    }
    return String(item);
  });
  
  const preview = truncated 
    ? `[${formatted.join(', ')}, ...]`
    : `[${formatted.join(', ')}]`;
  
  return { count, preview, truncated };
}

/**
 * Format a JSON object for preview display
 * 
 * @param {Object} obj - Object to format
 * @param {number} maxLength - Max string length (default 100)
 * @returns {string} Formatted JSON string
 */
export function formatJsonPreview(obj, maxLength = 100) {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  
  try {
    // Handle circular references by using a custom replacer
    const seen = new WeakSet();
    const json = JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular]';
        }
        seen.add(value);
      }
      return value;
    }, 2);
    
    if (json.length > maxLength) {
      return json.substring(0, maxLength) + '...';
    }
    
    return json;
  } catch (e) {
    return '[Object]';
  }
}

// =============================================================================
// Type Icons
// =============================================================================

/**
 * Get icon name for a column data type
 * Returns the Lucide icon name to use
 * 
 * @param {string} dataType - Snowflake data type
 * @returns {string} Icon name (Type, Hash, List, Braces, Clock, ToggleLeft, Circle)
 */
export function getTypeIcon(dataType) {
  if (!dataType) return 'Circle';
  
  const type = dataType.toUpperCase();
  
  // String types
  if (['VARCHAR', 'TEXT', 'STRING', 'CHAR', 'NCHAR', 'NVARCHAR'].some(t => type.includes(t))) {
    return 'Type';
  }
  
  // Number types
  if (['NUMBER', 'INTEGER', 'INT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL', 'BIGINT', 'SMALLINT', 'TINYINT'].some(t => type.includes(t))) {
    return 'Hash';
  }
  
  // Array type
  if (type.includes('ARRAY')) {
    return 'List';
  }
  
  // Object/Variant types
  if (['OBJECT', 'VARIANT', 'MAP'].some(t => type.includes(t))) {
    return 'Braces';
  }
  
  // Timestamp/Date types
  if (['TIMESTAMP', 'DATE', 'TIME', 'DATETIME'].some(t => type.includes(t))) {
    return 'Clock';
  }
  
  // Boolean type
  if (type.includes('BOOLEAN') || type === 'BOOL') {
    return 'ToggleLeft';
  }
  
  return 'Circle';
}

// =============================================================================
// Main Dispatcher
// =============================================================================

/**
 * Format a cell value based on its type and column context
 * Returns structured data for rendering
 * 
 * @param {*} value - The cell value
 * @param {string} columnName - Column name for context
 * @param {string} dataType - Snowflake data type
 * @returns {{type: string, display: string, raw: *, ...extras}}
 */
export function formatCellValue(value, columnName, dataType) {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return {
      type: 'null',
      display: 'null',
      raw: value,
    };
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    const preview = formatArrayPreview(value);
    return {
      type: 'array',
      display: preview.preview,
      count: preview.count,
      truncated: preview.truncated,
      raw: value,
    };
  }
  
  // Handle objects (non-null, non-array)
  if (typeof value === 'object' && value !== null) {
    return {
      type: 'object',
      display: formatJsonPreview(value),
      raw: value,
    };
  }
  
  // Check for GUID (by column name or content)
  if (isGuid(value)) {
    return {
      type: 'guid',
      display: value,
      raw: value,
    };
  }
  
  // Check for timestamp (by data type or content)
  const isTimestampType = dataType && /TIMESTAMP|DATE|TIME/i.test(dataType);
  if (isTimestampType || looksLikeTimestamp(value)) {
    const date = new Date(value);
    return {
      type: 'timestamp',
      display: value,
      relative: formatRelativeTime(date),
      date: date,
      raw: value,
    };
  }
  
  // Handle numbers
  if (typeof value === 'number' || (dataType && /NUMBER|INT|FLOAT|DECIMAL/i.test(dataType))) {
    const formatted = formatNumber(value, columnName);
    return {
      type: 'number',
      display: String(value),
      formatted: formatted,
      raw: value,
    };
  }
  
  // Default: treat as string
  return {
    type: 'string',
    display: String(value),
    raw: value,
  };
}

export default {
  isGuid,
  looksLikeTimestamp,
  formatRelativeTime,
  formatNumber,
  formatArrayPreview,
  formatJsonPreview,
  getTypeIcon,
  formatCellValue,
};

