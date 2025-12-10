/**
 * Snowflake hooks - React hooks for managing Snowflake operations
 * 
 * Updated to use session-based backend with X-Session-ID headers.
 * Includes fetch timeout support and improved error handling.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { createLogger } from '../utils/logger';
import { TIMEOUTS, CONNECTION_CONFIG } from '../data/constants';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SESSION_KEY = 'snowflake_session';
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds default timeout
const MAX_RETRIES = 3; // Max retries for 503 errors
const INITIAL_RETRY_DELAY_MS = 1000; // Start with 1 second backoff

// =============================================================================
// Scoped Loggers
// =============================================================================
const sessionLog = createLogger('Session');
const connectionLog = createLogger('useConnection');
const queryLog = createLogger('useQuery');
const metadataLog = createLogger('useMetadata');
const preflightLog = createLogger('usePreflight');
const historyLog = createLogger('useQueryHistory');
const explainLog = createLogger('useQueryExplanation');
const batchLog = createLogger('useBatchValidation');

// =============================================================================
// Shared Helpers (DRY)
// =============================================================================

/**
 * Get session ID from sessionStorage
 * @returns {string|null} Session ID or null
 */
function getSessionId() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      sessionLog.debug('getSessionId()', {
        hasSession: !!parsed.sessionId,
        sessionPrefix: parsed.sessionId?.substring(0, 8),
        database: parsed.database,
        schema: parsed.schema
      });
      return parsed.sessionId;
    } catch (e) {
      sessionLog.error('getSessionId() parse error', { error: e.message });
      return null;
    }
  }
  sessionLog.debug('getSessionId() - no session in storage');
  return null;
}

/**
 * Fetch with timeout wrapper - prevents hanging requests
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  // If caller provided their own signal, use a combined approach
  const externalSignal = options.signal;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  // If external signal aborts, abort our controller too
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  
  try {
    const response = await fetch(url, { 
      ...options, 
      signal: controller.signal 
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetch with timeout and retry for 503 errors (exponential backoff)
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = MAX_RETRIES) {
  let lastError;
  let delay = INITIAL_RETRY_DELAY_MS;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      
      // Only retry on 503 (Service Unavailable)
      if (response.status === 503 && attempt < maxRetries) {
        sessionLog.warn(`503 response on attempt ${attempt + 1}, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      
      return response;
    } catch (err) {
      lastError = err;
      
      // Don't retry on abort (timeout or intentional cancel)
      if (err.name === 'AbortError') {
        throw err;
      }
      
      // Retry on network errors
      if (attempt < maxRetries) {
        sessionLog.warn(`Network error on attempt ${attempt + 1}, retrying in ${delay}ms: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
    }
  }
  
  throw lastError;
}

// =============================================================================
// Session Management Hook
// =============================================================================

export function useConnection() {
  const [status, setStatus] = useState({ connected: false, unreachable: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const testConnectionRef = useRef(null);
  const pendingTestRef = useRef(null); // Promise mutex - prevents race conditions
  const consecutiveStatusTimeoutsRef = useRef(0); // Track consecutive timeouts
  const abortControllerRef = useRef(null); // For cancelling stale requests

  // Get session from storage
  const getStoredSession = useCallback(() => {
    const storedRaw = sessionStorage.getItem(SESSION_KEY);
    connectionLog.debug('getStoredSession()', { 
      hasValue: !!storedRaw,
      preview: storedRaw ? `${storedRaw.substring(0, 50)}...` : 'NULL'
    });
    
    if (storedRaw) {
      try {
        const parsed = JSON.parse(storedRaw);
        connectionLog.debug('getStoredSession() - parsed', {
          hasSessionId: !!parsed.sessionId,
          sessionIdPrefix: parsed.sessionId?.substring(0, 8) || 'N/A',
          database: parsed.database || 'N/A',
          keys: Object.keys(parsed)
        });
        return parsed;
      } catch (e) {
        connectionLog.error('getStoredSession() - parse error, clearing key', { error: e.message });
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
    return null;
  }, []);

  // Check if session is valid
  // FIX: Uses promise mutex pattern to prevent race conditions
  // FIX: Don't delete session on network errors - only on explicit 401/404
  // FIX: After N consecutive timeouts, mark as unreachable
  const testConnection = useCallback(async () => {
    // Promise mutex pattern: if a test is already in flight, return that promise
    if (pendingTestRef.current) {
      connectionLog.debug('testConnection() already in progress - returning pending promise');
      return pendingTestRef.current;
    }

    // Cancel any previous stale request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Create and cache the promise
    pendingTestRef.current = (async () => {
      connectionLog.info('testConnection() called');
      setLoading(true);
      setError(null);

      const stored = getStoredSession();
      
      if (!stored?.sessionId) {
        connectionLog.warn('testConnection() - no stored session, setting connected=false');
        consecutiveStatusTimeoutsRef.current = 0;
        const noSessionStatus = { connected: false, unreachable: false };
        setStatus(noSessionStatus);
        setLoading(false);
        return noSessionStatus;
      }

      connectionLog.info('testConnection() - checking session with backend', {
        sessionIdPrefix: stored.sessionId.substring(0, 8),
        database: stored.database,
        schema: stored.schema
      });

      const endTimer = connectionLog.time('Backend session check');

      try {
        const res = await fetchWithTimeout(
          `${API_URL}/api/session/status`,
          { 
            headers: { 'X-Session-ID': stored.sessionId },
            signal: abortControllerRef.current.signal
          },
          TIMEOUTS.SESSION_STATUS_MS
        );
        
        const durationMs = endTimer({ status: res.status, ok: res.ok });

        // Check for explicit "session invalid" responses
        if (res.status === 401 || res.status === 404) {
          // Parse response to check reason
          let reason = 'unknown';
          try {
            const errorData = await res.json();
            reason = errorData.reason || 'unknown';
          } catch { /* ignore parse errors */ }
          
          connectionLog.warn('Session explicitly invalid (401/404)', { status: res.status, reason });
          sessionStorage.removeItem(SESSION_KEY);
          consecutiveStatusTimeoutsRef.current = 0;
          const invalidStatus = { connected: false, unreachable: false, reason };
          setStatus(invalidStatus);
          setLoading(false);
          return invalidStatus;
        }

        // Check for 503 (backend/Snowflake unreachable)
        if (res.status === 503) {
          consecutiveStatusTimeoutsRef.current += 1;
          connectionLog.warn('Backend returned 503 (Snowflake unreachable)', {
            consecutiveTimeouts: consecutiveStatusTimeoutsRef.current
          });
          
          // Fall through to timeout threshold check below
          throw new Error('Backend returned 503');
        }

        const data = await res.json();
        connectionLog.debug('Session status response', {
          valid: data.valid,
          user: data.user,
          database: data.database,
          durationMs
        });
        
        if (data.valid) {
          const sessionStatus = {
            connected: true,
            unreachable: false,
            sessionId: stored.sessionId,
            user: data.user,
            warehouse: data.warehouse,
            database: data.database,
            schema: data.schema_name,
            role: data.role
          };
          consecutiveStatusTimeoutsRef.current = 0; // Reset on success
          setStatus(sessionStatus);
          setLoading(false);
          connectionLog.info('Session VALID - connected', { database: data.database, user: data.user });
          return sessionStatus;
        } else {
          connectionLog.warn('Backend says session INVALID - removing from storage', { data });
          sessionStorage.removeItem(SESSION_KEY);
          consecutiveStatusTimeoutsRef.current = 0;
          const invalidStatus = { connected: false, unreachable: false };
          setStatus(invalidStatus);
          setLoading(false);
          return invalidStatus;
        }
      } catch (err) {
        // Ignore aborted requests (we cancelled them intentionally)
        if (err.name === 'AbortError' && abortControllerRef.current?.signal?.aborted) {
          connectionLog.debug('Request was intentionally aborted');
          return status || { connected: false, unreachable: false };
        }
        
        const isTimeout = err.name === 'AbortError';

        if (isTimeout) {
          consecutiveStatusTimeoutsRef.current += 1;
          connectionLog.warn('Session check TIMED OUT', { 
            sessionIdPrefix: stored.sessionId.substring(0, 8),
            consecutiveTimeouts: consecutiveStatusTimeoutsRef.current
          });
        } else {
          consecutiveStatusTimeoutsRef.current += 1;
          connectionLog.warn('Session check NETWORK ERROR', {
            message: err.message,
            sessionIdPrefix: stored.sessionId.substring(0, 8),
            consecutiveTimeouts: consecutiveStatusTimeoutsRef.current
          });
        }

        // After N timeouts -> mark backend unreachable
        if (consecutiveStatusTimeoutsRef.current >= CONNECTION_CONFIG.TIMEOUT_THRESHOLD) {
          connectionLog.warn('Too many session check timeouts - marking disconnected & unreachable');
          const unreachableStatus = {
            connected: false,
            unreachable: true
          };
          setStatus(unreachableStatus);
          setError('MDLH API is unreachable. Please check your connection or restart the app.');
          setLoading(false);
          return unreachableStatus;
        }

        // Below threshold → optimistic mode: trust stored session
        const assumedSessionStatus = {
          connected: true,
          unreachable: false,
          sessionId: stored.sessionId,
          user: stored.user || 'unknown',
          warehouse: stored.warehouse,
          database: stored.database,
          schema: stored.schema,
          role: stored.role
        };
        setStatus(assumedSessionStatus);
        setLoading(false);
        connectionLog.info('Keeping session valid despite backend unreachable (below threshold)', { 
          database: stored.database,
          consecutiveTimeouts: consecutiveStatusTimeoutsRef.current
        });
        return assumedSessionStatus;
      }
    })();

    // Clear the pending promise when done (success or failure)
    try {
      return await pendingTestRef.current;
    } finally {
      pendingTestRef.current = null;
    }
  }, [getStoredSession, status]);

  // Store ref for useEffect
  testConnectionRef.current = testConnection;

  // Listen for session change events (dispatched by ConnectionModal)
  // This ensures all useConnection() instances stay in sync
  useEffect(() => {
    const handleSessionChange = (event) => {
      connectionLog.debug('Session change event received in hook', { 
        connected: event.detail?.connected,
        hasSessionId: !!event.detail?.sessionId
      });
      
      // Re-check connection status when session changes
      testConnectionRef.current?.();
    };
    
    window.addEventListener('snowflake-session-changed', handleSessionChange);
    
    return () => {
      window.removeEventListener('snowflake-session-changed', handleSessionChange);
    };
  }, []);

  // Disconnect
  const disconnect = useCallback(async () => {
    connectionLog.info('disconnect() called');
    const stored = getStoredSession();
    if (stored?.sessionId) {
      try {
        const endTimer = connectionLog.time('Backend disconnect');
        await fetchWithTimeout(
          `${API_URL}/api/disconnect`,
          {
            method: 'POST',
            headers: { 'X-Session-ID': stored.sessionId }
          },
          TIMEOUTS.SESSION_STATUS_MS
        );
        endTimer();
        connectionLog.info('Disconnected from backend');
      } catch (err) {
        if (err.name !== 'AbortError') {
          connectionLog.warn('Disconnect request failed', { message: err.message });
        }
      }
    }
    sessionStorage.removeItem(SESSION_KEY);
    consecutiveStatusTimeoutsRef.current = 0;
    setStatus({ connected: false, unreachable: false });
    setError(null);
    connectionLog.info('Session cleared');
  }, [getStoredSession]);

  // Load session on mount
  useEffect(() => {
    connectionLog.debug('useConnection mounted - checking existing session');
    testConnectionRef.current?.();
  }, []);

  // Listen for session cleared events (e.g., from backend restart detection)
  useEffect(() => {
    function handleSessionCleared(event) {
      connectionLog.info('Session cleared by external event', { reason: event.detail?.reason });
      consecutiveStatusTimeoutsRef.current = 0;
      setStatus({ connected: false, unreachable: false });
      setError(null);
    }

    window.addEventListener('snowflake-session-cleared', handleSessionCleared);
    return () => {
      window.removeEventListener('snowflake-session-cleared', handleSessionCleared);
    };
  }, []);

  return { status, testConnection, disconnect, loading, error, getSessionId: () => getSessionId() };
}

// =============================================================================
// Query Execution Hook
// =============================================================================

export function useQuery(connectionStatus = null) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if backend is unreachable (passed from parent component's useConnection)
  const backendUnreachable = connectionStatus?.unreachable === true;

  const executeQuery = useCallback(async (sql, options = {}) => {
    // Early exit if backend is known to be unreachable
    if (backendUnreachable) {
      queryLog.warn('executeQuery() - backend unreachable, aborting');
      setError('MDLH API is unreachable. Queries cannot be run right now.');
      return null;
    }

    const sessionId = getSessionId();
    
    queryLog.info('executeQuery() called', {
      hasSession: !!sessionId,
      sqlPreview: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
      database: options.database,
      schema: options.schema
    });

    if (!sessionId) {
      queryLog.warn('executeQuery() - no active session, aborting');
      setError('Not connected. Please connect to Snowflake first.');
      return null;
    }

    setLoading(true);
    setError(null);

    const endTimer = queryLog.time('Query execution');

    try {
      const timeoutSeconds = options.timeout || 60;
      const timeoutMs = timeoutSeconds * 1000 + TIMEOUTS.QUERY_EXECUTE_BUFFER_MS;
      
      const response = await fetchWithTimeout(
        `${API_URL}/api/query/execute`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId
          },
          body: JSON.stringify({
            sql,
            database: options.database,
            schema_name: options.schema,
            warehouse: options.warehouse,
            timeout: timeoutSeconds,
            limit: options.limit || 10000
          })
        },
        timeoutMs
      );

      queryLog.debug('executeQuery() - response meta', {
        status: response.status,
        ok: response.ok
      });

      // Handle session expiration - check reason for better error messages
      if (response.status === 401) {
        let reason = 'unknown';
        let message = 'Session expired. Please reconnect.';
        try {
          const errorData = await response.clone().json();
          reason = errorData.reason || 'unknown';
          if (reason === 'SESSION_NOT_FOUND') {
            message = 'Session not found. The backend may have restarted. Please reconnect.';
          } else if (reason === 'TOKEN_EXPIRED') {
            message = 'Your authentication token has expired. Please reconnect.';
          } else if (reason === 'AUTH_FAILED') {
            message = 'Authentication failed. Please check your credentials and reconnect.';
          }
        } catch { /* ignore parse errors */ }
        
        queryLog.warn('Session invalid (401)', { reason });
        sessionStorage.removeItem(SESSION_KEY);
        setError(message);
        setResults(null);
        endTimer({ status: 'session-expired', reason });
        return null;
      }

      const data = await response.json();
      queryLog.debug('executeQuery() - response body', {
        status: data.status,
        queryId: data.query_id,
        rowCount: data.row_count
      });

      if (data.status === 'SUCCESS') {
        // Fetch results
        const resultsRes = await fetchWithTimeout(
          `${API_URL}/api/query/${data.query_id}/results`,
          { headers: { 'X-Session-ID': sessionId } },
          TIMEOUTS.QUERY_RESULTS_MS
        );
        
        if (!resultsRes.ok) {
          queryLog.warn('Results fetch failed, using execute response', { status: resultsRes.status });
          const result = {
            columns: [],
            rows: [],
            rowCount: data.row_count || 0,
            executionTime: data.execution_time_ms,
            warning: `Results fetch failed: ${resultsRes.status}`
          };
          setResults(result);
          endTimer({ rowCount: result.rowCount, status: 'partial' });
          return result;
        }
        
        const resultsData = await resultsRes.json();

        const result = {
          columns: resultsData.columns || [],
          rows: resultsData.rows || [],
          rowCount: resultsData.total_rows ?? resultsData.rows?.length ?? data.row_count ?? 0,
          executionTime: data.execution_time_ms
        };
        setResults(result);
        
        const durationMs = endTimer({ rowCount: result.rowCount, status: 'success' });
        queryLog.info('executeQuery() - success', {
          rowCount: result.rowCount,
          columnCount: result.columns.length,
          executionTimeMs: result.executionTime,
          totalDurationMs: durationMs
        });
        
        return result;
      } else {
        queryLog.error('executeQuery() - backend returned error', { message: data.message });
        setError(data.message || 'Query failed');
        endTimer({ status: 'error' });
        return { success: false, error: data.message };
      }
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      const errorMsg = isTimeout 
        ? 'Query timed out. Try a shorter query, narrower filter, or increase the timeout.'
        : (err.message || 'Query failed');
      queryLog.error('executeQuery() - exception', {
        message: err.message,
        isTimeout
      });
      setError(errorMsg);
      endTimer({ status: isTimeout ? 'timeout' : 'exception' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [backendUnreachable]);

  const clearResults = useCallback(() => {
    queryLog.debug('clearResults() called');
    setResults(null);
    setError(null);
  }, []);

  return { results, loading, error, executeQuery, clearResults };
}

// =============================================================================
// Preflight Check Hook
// =============================================================================

export function usePreflight() {
  const [preflightResult, setPreflightResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runPreflight = useCallback(async (sql, options = {}) => {
    const sessionId = getSessionId();
    
    preflightLog.info('runPreflight() called', {
      hasSession: !!sessionId,
      sqlPreview: sql.substring(0, 80) + (sql.length > 80 ? '...' : '')
    });

    if (!sessionId) {
      preflightLog.warn('runPreflight() - no session');
      return { valid: false, message: 'Not connected' };
    }

    setLoading(true);
    setPreflightResult(null);

    const endTimer = preflightLog.time('Preflight check');

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/query/preflight`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId
          },
          body: JSON.stringify({
            sql,
            database: options.database,
            schema_name: options.schema
          })
        },
        15000
      );

      if (response.status === 401) {
        preflightLog.warn('Session expired during preflight');
        sessionStorage.removeItem(SESSION_KEY);
        return { valid: false, message: 'Session expired' };
      }

      const data = await response.json();
      setPreflightResult(data);
      
      endTimer({ valid: data.valid, issueCount: data.issues?.length || 0 });
      preflightLog.info('runPreflight() - complete', { valid: data.valid });
      
      return data;
    } catch (err) {
      const errorMsg = err.name === 'AbortError' 
        ? 'Preflight check timed out' 
        : err.message;
      preflightLog.error('runPreflight() - failed', { message: errorMsg });
      const error = { valid: false, message: errorMsg, issues: [errorMsg] };
      setPreflightResult(error);
      endTimer({ valid: false, error: true });
      return error;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearPreflight = useCallback(() => {
    preflightLog.debug('clearPreflight() called');
    setPreflightResult(null);
  }, []);

  return { preflightResult, loading, runPreflight, clearPreflight };
}

// =============================================================================
// Query History Hook
// =============================================================================

export function useQueryHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    const sessionId = getSessionId();
    if (!sessionId) {
      historyLog.warn('fetchHistory() - no session ID');
      return;
    }

    historyLog.info('fetchHistory() called');
    setLoading(true);
    
    const endTimer = historyLog.time('Fetch history');
    
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/query/history?limit=50`,
        { headers: { 'X-Session-ID': sessionId } },
        10000
      );
      const data = await res.json();
      setHistory(data.items || []);
      endTimer({ itemCount: data.items?.length || 0 });
      historyLog.info('fetchHistory() - success', { itemCount: data.items?.length || 0 });
    } catch (err) {
      if (err.name !== 'AbortError') {
        historyLog.error('fetchHistory() - failed', { message: err.message });
      }
      endTimer({ error: true });
    } finally {
      setLoading(false);
    }
  }, []);

  return { history, fetchHistory, loading };
}

// =============================================================================
// Metadata Hook
// =============================================================================

export function useMetadata(connectionStatus = null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check if backend is unreachable (passed from parent component's useConnection)
  const backendUnreachable = connectionStatus?.unreachable === true;

  // Debouncing refs to prevent hammering the backend
  const lastDbRequestRef = useRef({ ts: 0, inFlight: false });
  const lastSchemaRequestRef = useRef({ ts: 0, inFlight: false, database: null });
  const lastTablesRequestRef = useRef({ ts: 0, inFlight: false, database: null, schema: null });

  const fetchDatabases = useCallback(async (refresh = false) => {
    const sessionId = getSessionId();
    if (!sessionId) {
      metadataLog.warn('fetchDatabases() - no session');
      return [];
    }

    // Early exit if backend is unreachable (unless explicitly refreshing)
    if (backendUnreachable && !refresh) {
      metadataLog.warn('fetchDatabases() - backend unreachable, aborting');
      setError('MDLH API is unreachable. Metadata cannot be refreshed right now.');
      return [];
    }

    const now = Date.now();

    // Debounce: skip if already in-flight or last attempt was <5s ago (unless refresh)
    if (!refresh) {
      if (lastDbRequestRef.current.inFlight) {
        metadataLog.debug('fetchDatabases() - skipped (already in flight)');
        return [];
      }
      if (now - lastDbRequestRef.current.ts < TIMEOUTS.DEBOUNCE_MS) {
        metadataLog.debug('fetchDatabases() - skipped (debounced)');
        return [];
      }
    }

    lastDbRequestRef.current = { ts: now, inFlight: true };

    metadataLog.info('fetchDatabases() called', { refresh });
    setLoading(true);
    
    const endTimer = metadataLog.time('Fetch databases');
    
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/metadata/databases?refresh=${refresh}`,
        { headers: { 'X-Session-ID': sessionId } },
        TIMEOUTS.METADATA_DB_MS
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        metadataLog.error('fetchDatabases() - non-OK response', {
          status: res.status,
          bodyPreview: text.substring(0, 200)
        });
        setError(`Failed to fetch databases: ${res.status}`);
        endTimer({ error: true, status: res.status });
        return [];
      }

      const data = await res.json();
      endTimer({ count: Array.isArray(data) ? data.length : 0 });
      metadataLog.debug('fetchDatabases() - success', { count: Array.isArray(data) ? data.length : 0 });
      return data;
    } catch (err) {
      const errorMsg = err.name === 'AbortError' ? 'Request timed out' : err.message;
      metadataLog.error('fetchDatabases() - failed', { message: errorMsg });
      setError(errorMsg);
      endTimer({ error: true });
      return [];
    } finally {
      lastDbRequestRef.current.inFlight = false;
      setLoading(false);
    }
  }, [backendUnreachable]);

  const fetchSchemas = useCallback(async (database, refresh = false) => {
    const sessionId = getSessionId();
    if (!sessionId) {
      metadataLog.warn('fetchSchemas() - no session');
      return [];
    }

    // Early exit if backend is unreachable (unless explicitly refreshing)
    if (backendUnreachable && !refresh) {
      metadataLog.warn('fetchSchemas() - backend unreachable, aborting');
      return [];
    }

    const now = Date.now();

    // Debounce: skip if already in-flight for same database, or last attempt was <5s ago
    if (!refresh) {
      if (lastSchemaRequestRef.current.inFlight && lastSchemaRequestRef.current.database === database) {
        metadataLog.debug('fetchSchemas() - skipped (already in flight for this database)');
        return [];
      }
      if (lastSchemaRequestRef.current.database === database && 
          now - lastSchemaRequestRef.current.ts < TIMEOUTS.DEBOUNCE_MS) {
        metadataLog.debug('fetchSchemas() - skipped (debounced)');
        return [];
      }
    }

    lastSchemaRequestRef.current = { ts: now, inFlight: true, database };

    metadataLog.info('fetchSchemas() called', { database, refresh });
    setLoading(true);
    
    const endTimer = metadataLog.time(`Fetch schemas for ${database}`);
    
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/metadata/schemas?database=${encodeURIComponent(database)}&refresh=${refresh}`,
        { headers: { 'X-Session-ID': sessionId } },
        TIMEOUTS.METADATA_SCHEMAS_MS
      );
      const data = await res.json();
      endTimer({ count: Array.isArray(data) ? data.length : 0 });
      return data;
    } catch (err) {
      const errorMsg = err.name === 'AbortError' ? 'Request timed out' : err.message;
      metadataLog.error('fetchSchemas() - failed', { database, message: errorMsg });
      setError(errorMsg);
      endTimer({ error: true });
      return [];
    } finally {
      lastSchemaRequestRef.current.inFlight = false;
      setLoading(false);
    }
  }, [backendUnreachable]);

  const fetchTables = useCallback(async (database, schema, refresh = false) => {
    const sessionId = getSessionId();
    if (!sessionId) {
      metadataLog.warn('fetchTables() - no session');
      return [];
    }

    // Early exit if backend is unreachable (unless explicitly refreshing)
    if (backendUnreachable && !refresh) {
      metadataLog.warn('fetchTables() - backend unreachable, aborting');
      return [];
    }

    const now = Date.now();

    // Debounce: skip if already in-flight for same db.schema, or last attempt was <5s ago
    if (!refresh) {
      if (lastTablesRequestRef.current.inFlight && 
          lastTablesRequestRef.current.database === database &&
          lastTablesRequestRef.current.schema === schema) {
        metadataLog.debug('fetchTables() - skipped (already in flight for this db.schema)');
        return [];
      }
      if (lastTablesRequestRef.current.database === database && 
          lastTablesRequestRef.current.schema === schema &&
          now - lastTablesRequestRef.current.ts < TIMEOUTS.DEBOUNCE_MS) {
        metadataLog.debug('fetchTables() - skipped (debounced)');
        return [];
      }
    }

    lastTablesRequestRef.current = { ts: now, inFlight: true, database, schema };

    metadataLog.info('fetchTables() called', { database, schema, refresh });
    setLoading(true);
    
    const endTimer = metadataLog.time(`Fetch tables for ${database}.${schema}`);
    
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/metadata/tables?database=${encodeURIComponent(database)}&schema=${encodeURIComponent(schema)}&refresh=${refresh}`,
        { headers: { 'X-Session-ID': sessionId } },
        TIMEOUTS.METADATA_TABLES_MS
      );
      const data = await res.json();
      endTimer({ count: Array.isArray(data) ? data.length : 0 });
      metadataLog.debug('fetchTables() - success', { count: Array.isArray(data) ? data.length : 0 });
      return data;
    } catch (err) {
      const errorMsg = err.name === 'AbortError' ? 'Request timed out' : err.message;
      metadataLog.error('fetchTables() - failed', { database, schema, message: errorMsg });
      setError(errorMsg);
      endTimer({ error: true });
      return [];
    } finally {
      lastTablesRequestRef.current.inFlight = false;
      setLoading(false);
    }
  }, [backendUnreachable]);

  const fetchColumns = useCallback(async (database, schema, table, refresh = false) => {
    const sessionId = getSessionId();
    if (!sessionId) {
      metadataLog.warn('fetchColumns() - no session');
      return [];
    }

    // Early exit if backend is unreachable (unless explicitly refreshing)
    if (backendUnreachable && !refresh) {
      metadataLog.warn('fetchColumns() - backend unreachable, aborting');
      return [];
    }

    metadataLog.debug('fetchColumns() called', { database, schema, table, refresh });
    setLoading(true);
    
    const endTimer = metadataLog.time(`Fetch columns for ${database}.${schema}.${table}`);
    
    try {
      const res = await fetchWithTimeout(
        `${API_URL}/api/metadata/columns?database=${encodeURIComponent(database)}&schema=${encodeURIComponent(schema)}&table=${encodeURIComponent(table)}&refresh=${refresh}`,
        { headers: { 'X-Session-ID': sessionId } },
        TIMEOUTS.METADATA_SCHEMAS_MS
      );
      const data = await res.json();
      endTimer({ count: Array.isArray(data) ? data.length : 0 });
      return data;
    } catch (err) {
      const errorMsg = err.name === 'AbortError' ? 'Request timed out' : err.message;
      metadataLog.error('fetchColumns() - failed', { table, message: errorMsg });
      setError(errorMsg);
      endTimer({ error: true });
      return [];
    } finally {
      setLoading(false);
    }
  }, [backendUnreachable]);

  const refreshCache = useCallback(async () => {
    metadataLog.info('refreshCache() called');
    setLoading(true);
    try {
      await fetchDatabases(true);
      metadataLog.info('refreshCache() - complete');
    } finally {
      setLoading(false);
    }
  }, [fetchDatabases]);

  return {
    loading,
    error,
    fetchDatabases,
    fetchSchemas,
    fetchTables,
    fetchColumns,
    refreshCache
  };
}

// =============================================================================
// Batch Validation Hook
// =============================================================================

export function useBatchValidation() {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const validateBatch = useCallback(async (queries, options = {}) => {
    const sessionId = getSessionId();
    
    batchLog.info('validateBatch() called', {
      hasSession: !!sessionId,
      queryCount: queries.length,
      database: options.database
    });

    if (!sessionId) {
      batchLog.warn('validateBatch() - no session');
      setError('Not connected');
      return null;
    }

    setLoading(true);
    setError(null);

    const endTimer = batchLog.time('Batch validation');

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/query/validate-batch`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId
          },
          body: JSON.stringify({
            queries,
            database: options.database,
            schema_name: options.schema,
            include_samples: options.includeSamples ?? true,
            sample_limit: options.sampleLimit ?? 3
          })
        },
        60000
      );

      if (response.status === 401) {
        batchLog.warn('Session expired during batch validation');
        sessionStorage.removeItem(SESSION_KEY);
        setError('Session expired');
        endTimer({ error: 'session_expired' });
        return null;
      }

      const data = await response.json();
      setResults(data);
      
      const validCount = data.results?.filter(r => r.valid).length || 0;
      endTimer({ validCount, totalCount: queries.length });
      batchLog.info('validateBatch() - complete', { validCount, totalCount: queries.length });
      
      return data;
    } catch (err) {
      const errorMsg = err.name === 'AbortError' 
        ? 'Batch validation timed out' 
        : err.message;
      batchLog.error('validateBatch() - failed', { message: errorMsg });
      setError(errorMsg);
      endTimer({ error: true });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    batchLog.debug('clearResults() called');
    setResults(null);
    setError(null);
  }, []);

  return { results, loading, error, validateBatch, clearResults };
}

// =============================================================================
// Query Explanation Hook
// =============================================================================

export function useQueryExplanation() {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const explainQuery = useCallback(async (sql, options = {}) => {
    const sessionId = getSessionId();
    
    explainLog.info('explainQuery() called', {
      hasSession: !!sessionId,
      sqlPreview: sql.substring(0, 80) + (sql.length > 80 ? '...' : '')
    });
    
    setLoading(true);
    setError(null);

    const endTimer = explainLog.time('Query explanation');

    try {
      const response = await fetchWithTimeout(
        `${API_URL}/api/query/explain`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(sessionId && { 'X-Session-ID': sessionId })
          },
          body: JSON.stringify({
            sql,
            include_execution: options.includeExecution ?? !!sessionId
          })
        },
        30000
      );

      if (response.status === 401) {
        explainLog.warn('Session expired during explain');
        sessionStorage.removeItem(SESSION_KEY);
      }

      const data = await response.json();
      setExplanation(data);
      
      endTimer({ hasExplanation: !!data.explanation });
      explainLog.info('explainQuery() - complete');
      
      return data;
    } catch (err) {
      const errorMsg = err.name === 'AbortError' 
        ? 'Query explanation timed out' 
        : err.message;
      explainLog.error('explainQuery() - failed', { message: errorMsg });
      setError(errorMsg);
      endTimer({ error: true });
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearExplanation = useCallback(() => {
    explainLog.debug('clearExplanation() called');
    setExplanation(null);
    setError(null);
  }, []);

  return { explanation, loading, error, explainQuery, clearExplanation };
}

// =============================================================================
// Sample Entities Hook - Fetches real GUIDs/identifiers from discovered tables
// =============================================================================

const sampleLog = createLogger('useSampleEntities');

/**
 * Hook to fetch sample entities (GUIDs, names, etc.) from discovered tables.
 * These samples are used to populate recommended queries with real, existing values
 * instead of placeholders like <GUID>.
 */
export function useSampleEntities() {
  const [samples, setSamples] = useState({
    tables: [],      // Sample TABLE_ENTITY rows with guids
    columns: [],     // Sample COLUMN_ENTITY rows with guids
    processes: [],   // Sample PROCESS_ENTITY rows with guids (lineage)
    terms: [],       // Sample ATLASGLOSSARYTERM rows with guids
    glossaries: [],  // Sample ATLASGLOSSARY rows with guids
    loaded: false,
    loading: false
  });

  /**
   * Fetch sample rows from an entity table
   * @param {string} database - Database name
   * @param {string} schema - Schema name  
   * @param {string} tableName - Table to sample from
   * @param {number} limit - Max rows to fetch
   * @returns {Promise<Array>} Sample rows
   */
  const fetchSampleRows = useCallback(async (database, schema, tableName, limit = 5) => {
    const sessionId = getSessionId();
    if (!sessionId) return [];

    try {
      // ALWAYS order by POPULARITYSCORE to get the most relevant/popular entities first
      // This ensures we populate queries with real, high-quality GUIDs
      const sql = `SELECT * FROM "${database}"."${schema}"."${tableName}" 
                   WHERE GUID IS NOT NULL 
                   ORDER BY POPULARITYSCORE DESC NULLS LAST 
                   LIMIT ${limit}`;
      
      const response = await fetchWithTimeout(
        `${API_URL}/api/query/execute`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId
          },
          body: JSON.stringify({
            sql,
            database,
            schema_name: schema,
            timeout: 15,
            limit
          })
        },
        20000
      );

      if (!response.ok) return [];
      
      const data = await response.json();
      if (data.status !== 'SUCCESS') return [];

      // Fetch results
      const resultsRes = await fetchWithTimeout(
        `${API_URL}/api/query/${data.query_id}/results`,
        { headers: { 'X-Session-ID': sessionId } },
        10000
      );
      
      if (!resultsRes.ok) return [];
      
      const resultsData = await resultsRes.json();
      return resultsData.rows || [];
    } catch (err) {
      sampleLog.debug(`Failed to sample ${tableName}`, { error: err.message });
      return [];
    }
  }, []);

  /**
   * Find the best matching table from discovered tables
   * @param {Set<string>} tableSet - Set of discovered table names (uppercase)
   * @param {string[]} candidates - Candidate table names to look for
   * @returns {string|null} Best matching table name or null
   */
  const findMatchingTable = useCallback((tableSet, candidates) => {
    // First, try exact matches
    for (const candidate of candidates) {
      if (tableSet.has(candidate.toUpperCase())) {
        return candidate.toUpperCase();
      }
    }
    
    // Then try partial matches - find tables containing the key part
    const tableArray = [...tableSet];
    for (const candidate of candidates) {
      // Extract key part (e.g., "TABLE" from "TABLE_ENTITY")
      const keyPart = candidate.replace('_ENTITY', '').toUpperCase();
      const match = tableArray.find(t => 
        t.includes(keyPart) && t.includes('ENTITY')
      );
      if (match) return match;
    }
    
    return null;
  }, []);

  /**
   * Load sample entities from all discovered entity tables
   * SMART: Uses actual discovered tables, not hardcoded names
   * @param {string} database - Database name (e.g., FIELD_METADATA)
   * @param {string} schema - Schema name (e.g., PUBLIC)
   * @param {Set<string>} discoveredTables - Set of discovered table names
   */
  const loadSamples = useCallback(async (database, schema, discoveredTables) => {
    if (!database || !schema || !discoveredTables || discoveredTables.size === 0) {
      sampleLog.debug('loadSamples() - no tables to sample');
      return;
    }

    sampleLog.info('loadSamples() - fetching sample entities', { 
      database, 
      schema, 
      tableCount: discoveredTables.size 
    });

    setSamples(prev => ({ ...prev, loading: true }));

    const tableSet = new Set([...discoveredTables].map(t => t.toUpperCase()));
    
    // Define which entity tables to sample - with fallback candidates
    // We look for the actual tables that exist, not hardcoded names
    const tablesToSample = [
      { 
        key: 'tables', 
        candidates: ['TABLE_ENTITY', 'SNOWFLAKETABLE', 'TABLEPARTITION_ENTITY'],
        // Also accept any table with "TABLE" and "ENTITY" in the name
        pattern: /TABLE.*ENTITY/i
      },
      { 
        key: 'columns', 
        candidates: ['COLUMN_ENTITY', 'SNOWFLAKECOLUMN'],
        pattern: /COLUMN.*ENTITY/i
      },
      { 
        key: 'processes', 
        candidates: ['PROCESS_ENTITY', 'LINEAGEPROCESS_ENTITY'],
        pattern: /PROCESS.*ENTITY/i
      },
      { 
        key: 'terms', 
        candidates: ['ATLASGLOSSARYTERM_ENTITY', 'ATLASGLOSSARYTERM', 'GLOSSARYTERM_ENTITY', 'TERM_ENTITY'],
        pattern: /GLOSSARYTERM/i  // Be specific - must have TERM
      },
      { 
        key: 'glossaries', 
        // ATLASGLOSSARY_ENTITY is the main glossary table (not terms, not categories)
        candidates: ['ATLASGLOSSARY_ENTITY', 'ATLASGLOSSARY', 'GLOSSARY_ENTITY'],
        // Pattern excludes TERM and CATEGORY to get the main glossary table
        pattern: /GLOSSARY/i,
        exclude: /TERM|CATEGORY/i  // Exclude term and category tables
      },
    ];

    const results = {};
    const tableArray = [...tableSet];

    // Fetch samples in parallel - use actual discovered tables
    await Promise.all(
      tablesToSample.map(async ({ key, candidates, pattern, exclude }) => {
        // Find the actual table that matches
        let actualTable = findMatchingTable(tableSet, candidates);
        
        // If no exact/partial match, try pattern match (with optional exclude)
        if (!actualTable && pattern) {
          actualTable = tableArray.find(t => {
            if (!pattern.test(t)) return false;
            if (exclude && exclude.test(t)) return false; // Skip if matches exclude pattern
            return true;
          });
        }
        
        if (actualTable) {
          const rows = await fetchSampleRows(database, schema, actualTable, 10);
          results[key] = rows;
          results[`${key}Table`] = actualTable; // Store which table we actually used
          sampleLog.debug(`Sampled ${actualTable} for ${key}`, { rowCount: rows.length });
        } else {
          sampleLog.debug(`No matching table found for ${key}`, { candidates });
        }
      })
    );

    setSamples({
      tables: results.tables || [],
      tablesTable: results.tablesTable || null,
      columns: results.columns || [],
      columnsTable: results.columnsTable || null,
      processes: results.processes || [],
      processesTable: results.processesTable || null,
      terms: results.terms || [],
      termsTable: results.termsTable || null,
      glossaries: results.glossaries || [],
      glossariesTable: results.glossariesTable || null,
      loaded: true,
      loading: false
    });

    sampleLog.info('loadSamples() - complete', {
      tables: results.tables?.length || 0,
      tablesTable: results.tablesTable,
      columns: results.columns?.length || 0,
      columnsTable: results.columnsTable,
      processes: results.processes?.length || 0,
      processesTable: results.processesTable,
      terms: results.terms?.length || 0,
      glossaries: results.glossaries?.length || 0
    });

  }, [fetchSampleRows, findMatchingTable]);

  /**
   * Get a sample GUID from a specific entity type
   * @param {string} entityType - 'table', 'column', 'process', 'term', 'glossary'
   * @returns {string|null} A real GUID or null
   */
  const getSampleGuid = useCallback((entityType = 'table') => {
    const entityMap = {
      table: samples.tables,
      column: samples.columns,
      process: samples.processes,
      term: samples.terms,
      glossary: samples.glossaries
    };

    const rows = entityMap[entityType] || samples.tables;
    if (!rows || rows.length === 0) return null;

    // Find the GUID column (case-insensitive)
    const firstRow = rows[0];
    if (!firstRow) return null;

    // Look for guid in the row (it's an object with column names as keys)
    const guidKey = Object.keys(firstRow).find(k => k.toLowerCase() === 'guid');
    return guidKey ? firstRow[guidKey] : null;
  }, [samples]);

  /**
   * Get a sample entity name from a specific entity type
   * @param {string} entityType - 'table', 'column', 'process', 'term', 'glossary'
   * @returns {string|null} A real entity name or null
   */
  const getSampleName = useCallback((entityType = 'table') => {
    const entityMap = {
      table: samples.tables,
      column: samples.columns,
      process: samples.processes,
      term: samples.terms,
      glossary: samples.glossaries
    };

    const rows = entityMap[entityType] || samples.tables;
    if (!rows || rows.length === 0) return null;

    const firstRow = rows[0];
    if (!firstRow) return null;

    const nameKey = Object.keys(firstRow).find(k => k.toLowerCase() === 'name');
    return nameKey ? firstRow[nameKey] : null;
  }, [samples]);

  /**
   * Get all sample GUIDs for a given entity type
   * @param {string} entityType - 'table', 'column', 'process', 'term', 'glossary'
   * @returns {string[]} Array of GUIDs
   */
  const getAllSampleGuids = useCallback((entityType = 'table') => {
    const entityMap = {
      table: samples.tables,
      column: samples.columns,
      process: samples.processes,
      term: samples.terms,
      glossary: samples.glossaries
    };

    const rows = entityMap[entityType] || [];
    return rows
      .map(row => {
        const guidKey = Object.keys(row).find(k => k.toLowerCase() === 'guid');
        return guidKey ? row[guidKey] : null;
      })
      .filter(Boolean);
  }, [samples]);

  /**
   * Get a random sample entity with both GUID and name
   * @param {string} entityType - 'table', 'column', 'process', 'term', 'glossary'
   * @returns {{ guid: string, name: string } | null}
   */
  const getRandomSample = useCallback((entityType = 'table') => {
    const entityMap = {
      table: samples.tables,
      column: samples.columns,
      process: samples.processes,
      term: samples.terms,
      glossary: samples.glossaries
    };

    const rows = entityMap[entityType] || [];
    if (rows.length === 0) return null;

    const randomRow = rows[Math.floor(Math.random() * rows.length)];
    if (!randomRow) return null;

    const guidKey = Object.keys(randomRow).find(k => k.toLowerCase() === 'guid');
    const nameKey = Object.keys(randomRow).find(k => k.toLowerCase() === 'name');

    return {
      guid: guidKey ? randomRow[guidKey] : null,
      name: nameKey ? randomRow[nameKey] : null,
      ...randomRow // Include all other fields
    };
  }, [samples]);

  const clearSamples = useCallback(() => {
    setSamples({
      tables: [],
      columns: [],
      processes: [],
      terms: [],
      glossaries: [],
      loaded: false,
      loading: false
    });
  }, []);

  return {
    samples,
    loadSamples,
    getSampleGuid,
    getSampleName,
    getAllSampleGuids,
    getRandomSample,
    clearSamples
  };
}

export default { useConnection, useQuery, useQueryHistory, useMetadata, usePreflight, useBatchValidation, useQueryExplanation, useSampleEntities };
