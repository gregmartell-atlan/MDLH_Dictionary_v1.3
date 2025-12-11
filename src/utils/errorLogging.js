/**
 * Global Error Logging
 * 
 * Captures uncaught errors and unhandled promise rejections.
 * Call initGlobalErrorLogging() in your app bootstrap (main.jsx).
 */

import { createLogger } from './logger';

const log = createLogger('Global');

/**
 * Initialize global error handlers
 * Captures window errors and unhandled promise rejections
 */
export function initGlobalErrorLogging() {
  // Catch synchronous errors
  window.addEventListener('error', (event) => {
    log.error('Uncaught error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error?.stack || String(event.error),
    });
  });

  // Catch async errors (unhandled promise rejections)
  window.addEventListener('unhandledrejection', (event) => {
    log.error('Unhandled promise rejection', {
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
    });
  });

  log.info('Global error logging initialized');
}

export default initGlobalErrorLogging;

