/**
 * Structured Logger Utility
 * 
 * Creates namespaced, levelled loggers for consistent, searchable console output.
 * All logs are prefixed with timestamp and scope for easy filtering.
 * 
 * Usage:
 *   import { createLogger } from '../utils/logger';
 *   const log = createLogger('useConnection');
 *   log.info('testConnection() called', { sessionId: '...' });
 * 
 * Output:
 *   2025-12-05T18:30:00.123Z [MDLH][useConnection] testConnection() called { sessionId: '...' }
 */

const DEBUG_ENABLED =
  import.meta.env.MODE === 'development' ||
  import.meta.env.VITE_DEBUG_LOGS === 'true';

/**
 * Create a scoped logger instance
 * @param {string} scope - The namespace for this logger (e.g., 'useConnection', 'UI', 'App')
 * @returns {object} Logger with debug, info, warn, error, group, groupEnd methods
 */
export function createLogger(scope) {
  const prefix = `[MDLH][${scope}]`;

  const formatArgs = (args) => {
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try {
          // For objects, return as-is for console to format nicely
          return arg;
        } catch {
          return String(arg);
        }
      }
      return arg;
    });
  };

  const base = (level, ...args) => {
    if (!DEBUG_ENABLED) return;
    const ts = new Date().toISOString();
    const formatted = formatArgs(args);
    console[level](`${ts} ${prefix}`, ...formatted);
  };

  return {
    /**
     * Debug level - verbose details for tracing
     */
    debug: (...args) => base('debug', ...args),
    
    /**
     * Info level - significant events (connection established, query executed)
     */
    info: (...args) => base('info', ...args),
    
    /**
     * Warn level - recoverable issues (session timeout, retry)
     */
    warn: (...args) => base('warn', ...args),
    
    /**
     * Error level - failures that need attention
     */
    error: (...args) => base('error', ...args),
    
    /**
     * Start a collapsible group in console
     */
    group(label) {
      if (!DEBUG_ENABLED) return;
      console.group(`${prefix} ${label}`);
    },
    
    /**
     * End a collapsible group
     */
    groupEnd() {
      if (!DEBUG_ENABLED) return;
      console.groupEnd();
    },

    /**
     * Log with timing - useful for measuring async operations
     * @returns {function} Call this function when operation completes
     */
    time(label) {
      if (!DEBUG_ENABLED) return () => {};
      const start = performance.now();
      const ts = new Date().toISOString();
      console.debug(`${ts} ${prefix} ⏱ START: ${label}`);
      return (extra = {}) => {
        const duration = Math.round(performance.now() - start);
        const endTs = new Date().toISOString();
        console.debug(`${endTs} ${prefix} ⏱ END: ${label}`, { durationMs: duration, ...extra });
        return duration;
      };
    },
  };
}

/**
 * Check if debug logging is enabled
 * @returns {boolean}
 */
export function isDebugEnabled() {
  return DEBUG_ENABLED;
}

export default createLogger;

