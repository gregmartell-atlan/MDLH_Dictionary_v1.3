/**
 * useSystemConfig Hook
 * 
 * Fetches and manages the SystemConfig from the backend.
 * This is the SINGLE SOURCE OF TRUTH for what's available in this Snowflake environment.
 * 
 * The SystemConfig contains:
 * - snowflake.entities: Map of logical entity names to physical locations
 * - queryDefaults: Default metadata DB/schema, row limits, timeouts
 * - features: Feature flags (lineage, glossary, dbt, etc.)
 * - catalog: Table/column catalog for suggestions
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useConnection } from './useSnowflake';
import { createLogger } from '../utils/logger';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const log = createLogger('useSystemConfig');

/**
 * Hook to fetch and manage SystemConfig.
 * 
 * Usage:
 * ```jsx
 * const { config, loading, error, refresh } = useSystemConfig();
 * 
 * // Access entities
 * const processTable = config?.snowflake?.entities?.PROCESS_ENTITY;
 * 
 * // Check features
 * const hasLineage = config?.features?.lineage;
 * ```
 */
export function useSystemConfig() {
  const { status: connStatus, getSessionId } = useConnection();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Prevent duplicate fetches
  const fetchingRef = useRef(false);
  const lastSessionRef = useRef(null);

  /**
   * Fetch the config from the backend.
   */
  const fetchConfig = useCallback(async (sessionId) => {
    if (!sessionId) {
      log.debug('fetchConfig: No session ID, skipping');
      return null;
    }

    if (fetchingRef.current) {
      log.debug('fetchConfig: Already fetching, skipping');
      return null;
    }

    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    log.info('Fetching system config...');

    try {
      const response = await fetch(`${API_URL}/api/system/config?session_id=${sessionId}`, {
        headers: {
          'X-Session-ID': sessionId,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired');
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      log.info('System config loaded', {
        entities: Object.keys(data?.snowflake?.entities || {}).length,
        tables: data?.catalog?.tables?.length || 0,
        features: data?.features,
      });

      setConfig(data);
      return data;
    } catch (err) {
      const errorMsg = err.message || 'Failed to load system config';
      log.error('Config fetch failed', { error: errorMsg });
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  /**
   * Refresh the config (force re-discovery).
   */
  const refresh = useCallback(async () => {
    const sessionId = getSessionId?.() || connStatus?.sessionId;
    if (!sessionId) {
      log.warn('refresh: No session ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/system/config/refresh?session_id=${sessionId}`, {
        method: 'POST',
        headers: {
          'X-Session-ID': sessionId,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      log.info('System config refreshed', {
        entities: Object.keys(data?.snowflake?.entities || {}).length,
      });

      setConfig(data);
    } catch (err) {
      log.error('Config refresh failed', { error: err.message });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getSessionId, connStatus]);

  // Fetch config when connection becomes active
  useEffect(() => {
    const sessionId = getSessionId?.() || connStatus?.sessionId;
    const isConnected = connStatus?.connected;

    // Only fetch if connected and session changed
    if (isConnected && sessionId && sessionId !== lastSessionRef.current) {
      lastSessionRef.current = sessionId;
      fetchConfig(sessionId);
    }

    // Clear config if disconnected
    if (!isConnected && config) {
      log.debug('Connection lost, clearing config');
      setConfig(null);
      lastSessionRef.current = null;
    }
  }, [connStatus, getSessionId, fetchConfig, config]);

  return {
    config,
    loading,
    error,
    refresh,
    
    // Convenience accessors
    entities: config?.snowflake?.entities || {},
    features: config?.features || {},
    queryDefaults: config?.queryDefaults || {},
    catalog: config?.catalog || { tables: [], columns: [] },
    
    // Check if a specific entity exists
    hasEntity: (entityName) => !!config?.snowflake?.entities?.[entityName],
    
    // Get entity location
    getEntity: (entityName) => config?.snowflake?.entities?.[entityName] || null,
    
    // Get fully qualified table name
    getEntityFQN: (entityName) => {
      const entity = config?.snowflake?.entities?.[entityName];
      if (!entity) return null;
      return `"${entity.database}"."${entity.schema}"."${entity.table}"`;
    },
  };
}

export default useSystemConfig;

