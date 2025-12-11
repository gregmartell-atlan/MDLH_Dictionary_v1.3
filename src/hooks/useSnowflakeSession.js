/**
 * useSnowflakeSession - React hook for managing Snowflake session state
 * 
 * Handles connection, disconnection, query execution, and session persistence.
 * The session ID is stored in sessionStorage (cleared on tab close) or 
 * localStorage (persists across sessions) based on your preference.
 */

import { useState, useCallback, useEffect } from 'react';
import { createLogger } from '../utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SESSION_STORAGE_KEY = 'snowflake_session';
const CONFIG_STORAGE_KEY = 'snowflake_config';

const log = createLogger('useSnowflakeSession');

export function useSnowflakeSession() {
  const [session, setSession] = useState(null);  // { sessionId, user, warehouse, database, role }
  const [isConnecting, setIsConnecting] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);
  const [error, setError] = useState(null);

  // ==========================================================================
  // Session Persistence
  // ==========================================================================
  
  // Load session from storage on mount
  useEffect(() => {
    log.debug('Hook mounted - checking for stored session');
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        log.debug('Found stored session', {
          sessionIdPrefix: parsed.sessionId?.substring(0, 8),
          database: parsed.database
        });
        
        // Validate session is still alive
        validateSession(parsed.sessionId).then(isValid => {
          if (isValid) {
            log.info('Stored session validated - restoring', { database: parsed.database });
            setSession(parsed);
          } else {
            log.warn('Stored session invalid - clearing');
            sessionStorage.removeItem(SESSION_STORAGE_KEY);
          }
        });
      } catch (e) {
        log.error('Failed to parse stored session - clearing', { error: e.message });
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } else {
      log.debug('No stored session found');
    }
  }, []);

  // Save session to storage when it changes
  useEffect(() => {
    if (session) {
      log.debug('Persisting session to storage', {
        sessionIdPrefix: session.sessionId?.substring(0, 8),
        database: session.database
      });
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      log.debug('Clearing session from storage');
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, [session]);

  // ==========================================================================
  // API Helpers
  // ==========================================================================

  const validateSession = async (sessionId) => {
    log.debug('validateSession() called', { sessionIdPrefix: sessionId?.substring(0, 8) });
    try {
      const response = await fetch(`${API_BASE_URL}/api/session/status`, {
        headers: { 'X-Session-ID': sessionId }
      });
      const data = await response.json();
      log.debug('validateSession() response', { valid: data.valid });
      return data.valid === true;
    } catch (err) {
      log.warn('validateSession() failed', { message: err.message });
      return false;
    }
  };

  // ==========================================================================
  // Connection Management
  // ==========================================================================

  const connect = useCallback(async (config) => {
    log.info('connect() called', {
      account: config.account,
      user: config.user,
      authType: config.authMethod || 'token',
      database: config.database,
      schema: config.schema,
      warehouse: config.warehouse,
      role: config.role
    });

    setIsConnecting(true);
    setError(null);

    const endTimer = log.time('Connection attempt');

    try {
      const response = await fetch(`${API_BASE_URL}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: config.account,
          user: config.user,
          token: config.token,
          warehouse: config.warehouse,
          database: config.database,
          schema_name: config.schema,
          role: config.role || undefined,
          auth_type: config.authMethod || 'token'
        })
      });

      log.debug('connect() - response meta', {
        status: response.status,
        ok: response.ok
      });

      const result = await response.json();
      log.debug('connect() - response body', {
        connected: result.connected,
        hasSessionId: !!result.session_id,
        user: result.user,
        database: result.database
      });

      if (result.connected && result.session_id) {
        const newSession = {
          sessionId: result.session_id,
          user: result.user,
          warehouse: result.warehouse,
          database: result.database,
          role: result.role
        };
        setSession(newSession);

        // Save config (without sensitive data) for reconnection UI
        const { token, ...safeConfig } = config;
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(safeConfig));

        endTimer({ success: true, database: result.database });
        log.info('connect() - session established', {
          sessionIdPrefix: result.session_id.substring(0, 8),
          database: result.database,
          user: result.user
        });

        return { success: true, ...result };
      } else {
        endTimer({ success: false, error: result.error });
        log.error('connect() - backend returned error', { error: result.error });
        setError(result.error || 'Connection failed');
        return { success: false, error: result.error };
      }
    } catch (err) {
      const errorMsg = err.message || 'Failed to connect';
      endTimer({ success: false, error: errorMsg });
      log.error('connect() - exception', { message: err.message, stack: err.stack });
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    log.info('disconnect() called', { hasSession: !!session?.sessionId });
    
    if (!session?.sessionId) {
      log.debug('disconnect() - no session to disconnect');
      return;
    }

    const endTimer = log.time('Disconnect');

    try {
      await fetch(`${API_BASE_URL}/api/disconnect`, {
        method: 'POST',
        headers: { 'X-Session-ID': session.sessionId }
      });
      endTimer({ success: true });
      log.info('disconnect() - disconnected from backend');
    } catch (err) {
      endTimer({ success: false });
      log.warn('disconnect() - request failed', { message: err.message });
    } finally {
      setSession(null);
      setError(null);
      log.info('disconnect() - session cleared');
    }
  }, [session]);

  // ==========================================================================
  // Query Execution
  // ==========================================================================

  const executeQuery = useCallback(async (sql, options = {}) => {
    log.info('executeQuery() called', {
      hasSession: !!session?.sessionId,
      sqlPreview: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
      timeout: options.timeout,
      limit: options.limit
    });

    if (!session?.sessionId) {
      log.warn('executeQuery() - no active session, aborting');
      return { 
        success: false, 
        error: 'Not connected. Please connect to Snowflake first.' 
      };
    }

    setIsQuerying(true);
    setError(null);

    const endTimer = log.time('Query execution');

    try {
      const response = await fetch(`${API_BASE_URL}/api/query/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-ID': session.sessionId
        },
        body: JSON.stringify({
          sql,
          timeout: options.timeout || 60,
          limit: options.limit || 10000
        })
      });

      log.debug('executeQuery() - response meta', {
        status: response.status,
        ok: response.ok
      });

      // Handle session expiration
      if (response.status === 401) {
        endTimer({ success: false, error: 'session_expired' });
        log.warn('executeQuery() - session expired (401)');
        setSession(null);
        return { 
          success: false, 
          error: 'Session expired. Please reconnect.',
          sessionExpired: true 
        };
      }

      const result = await response.json();
      log.debug('executeQuery() - response body', {
        status: result.status,
        queryId: result.query_id,
        executionTimeMs: result.execution_time_ms
      });

      if (result.status === 'SUCCESS') {
        // Fetch the results
        const resultsResponse = await fetch(
          `${API_BASE_URL}/api/query/${result.query_id}/results`,
          { headers: { 'X-Session-ID': session.sessionId } }
        );
        const resultsData = await resultsResponse.json();
        
        const finalResult = {
          success: true,
          queryId: result.query_id,
          columns: resultsData.columns,
          rows: resultsData.rows,
          rowCount: resultsData.total_rows,
          executionTime: result.execution_time_ms
        };

        endTimer({ 
          success: true, 
          rowCount: finalResult.rowCount,
          columnCount: finalResult.columns?.length 
        });
        log.info('executeQuery() - success', {
          rowCount: finalResult.rowCount,
          columnCount: finalResult.columns?.length,
          executionTimeMs: finalResult.executionTime
        });

        return finalResult;
      } else {
        const errorMsg = result.message || result.error || 'Query failed';
        endTimer({ success: false, error: errorMsg });
        log.error('executeQuery() - query failed', { error: errorMsg });
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMsg = err.message || 'Query failed';
      endTimer({ success: false, error: errorMsg });
      log.error('executeQuery() - exception', { message: err.message });
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsQuerying(false);
    }
  }, [session]);

  // ==========================================================================
  // Convenience Methods
  // ==========================================================================

  const getSessionStatus = useCallback(async () => {
    log.debug('getSessionStatus() called');
    if (!session?.sessionId) {
      log.debug('getSessionStatus() - no session');
      return null;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/session/status`, {
        headers: { 'X-Session-ID': session.sessionId }
      });
      const data = await response.json();
      log.debug('getSessionStatus() - response', { valid: data.valid });
      return data;
    } catch (err) {
      log.warn('getSessionStatus() - failed', { message: err.message });
      return null;
    }
  }, [session]);

  const getSavedConfig = useCallback(() => {
    try {
      const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
      const config = saved ? JSON.parse(saved) : null;
      log.debug('getSavedConfig()', { hasConfig: !!config });
      return config;
    } catch {
      log.warn('getSavedConfig() - failed to parse');
      return null;
    }
  }, []);

  // ==========================================================================
  // Return Hook Interface
  // ==========================================================================

  return {
    // State
    session,
    isConnected: !!session,
    isConnecting,
    isQuerying,
    error,
    
    // Connection
    connect,
    disconnect,
    
    // Queries
    executeQuery,
    
    // Utilities
    getSessionStatus,
    getSavedConfig,
    clearError: () => {
      log.debug('clearError() called');
      setError(null);
    }
  };
}

export default useSnowflakeSession;
