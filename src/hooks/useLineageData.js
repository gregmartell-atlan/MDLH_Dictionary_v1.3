/**
 * useLineageData - Intelligent lineage hook
 * 
 * OpenLineage-compliant implementation that:
 * - Works with any entity type (tables, dashboards, reports, etc.)
 * - Parses SQL queries to detect referenced entities
 * - Builds proper graph visualization data
 * - Provides interactive exploration support
 * 
 * @see https://openlineage.io/docs/spec/
 */

import { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
import {
  LineageService,
  extractEntitiesFromSQL,
  parseProcessName,
  createLineageService,
  isLineageQueryResult,
  transformLineageResultsToGraph,
  autoDetectLineage,
} from '../services/lineageService';
import { isDemoMode, DEMO_LINEAGE_DATA } from '../data/demoData';

const IS_DEMO = isDemoMode();

// Lineage cache with TTL to avoid redundant queries
const LINEAGE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const lineageCache = new Map();

function getCachedLineage(entityId) {
  const cached = lineageCache.get(entityId?.toUpperCase());
  if (!cached) return null;

  if (Date.now() - cached.timestamp > LINEAGE_CACHE_TTL) {
    lineageCache.delete(entityId?.toUpperCase());
    return null;
  }

  return cached.data;
}

function setCachedLineage(entityId, data) {
  if (!entityId || !data) return;

  // Limit cache size to 20 entries
  if (lineageCache.size >= 20) {
    const oldestKey = lineageCache.keys().next().value;
    lineageCache.delete(oldestKey);
  }

  lineageCache.set(entityId.toUpperCase(), {
    data,
    timestamp: Date.now(),
  });
}

// Re-export utilities for external use
export { 
  extractEntitiesFromSQL, 
  parseProcessName,
  isLineageQueryResult,
  transformLineageResultsToGraph,
  autoDetectLineage,
};

/**
 * Main lineage data hook
 * 
 * @param {Function} executeQuery - Query execution function
 * @param {boolean} isConnected - Whether connected to Snowflake
 * @param {string} database - Current database
 * @param {string} schema - Current schema  
 * @param {string} currentQuery - Current SQL in editor (for auto-detection)
 * @returns {Object} Lineage data and controls
 */
export function useLineageData(executeQuery, isConnected, database, schema, currentQuery = '') {
  // Demo mode: Return mock lineage data
  if (IS_DEMO) {
    return {
      lineageData: DEMO_LINEAGE_DATA,
      loading: false,
      error: null,
      currentTable: 'FACT_ORDERS',
      currentEntity: 'FACT_ORDERS',
      isPending: false,
      refetch: () => {},
      fetchForEntity: async () => DEMO_LINEAGE_DATA,
      fetchFromQuery: async () => DEMO_LINEAGE_DATA,
    };
  }

  const [lineageData, setLineageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentEntity, setCurrentEntity] = useState(null);

  // React 18 useTransition for non-blocking UI updates
  // isPending indicates if there's a pending non-blocking update
  const [isPending, startTransition] = useTransition();

  // Debounce query changes
  const debounceRef = useRef(null);
  const lastQueryRef = useRef('');
  
  // Create memoized service instance
  const lineageService = useMemo(() => {
    if (!executeQuery || !database || !schema) return null;
    return createLineageService(executeQuery, database, schema);
  }, [executeQuery, database, schema]);

  /**
   * Fetch lineage for a specific entity
   * Uses cache to avoid redundant queries
   */
  const fetchLineageForEntity = useCallback(async (entityNameOrGuid, forceRefresh = false) => {
    if (!isConnected || !lineageService || !entityNameOrGuid) {
      return;
    }

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = getCachedLineage(entityNameOrGuid);
      if (cached) {
        // Use startTransition for non-blocking cache updates
        startTransition(() => {
          setCurrentEntity(entityNameOrGuid);
          setLineageData(cached);
          setError(null);
        });
        return;
      }
    }
    setLoading(true);
    setError(null);
    setCurrentEntity(entityNameOrGuid);

    try {
      const result = await lineageService.getLineage(entityNameOrGuid);

      // Use startTransition for non-blocking state updates
      // This prevents UI freezing during complex graph rendering
      startTransition(() => {
        if (result.error) {
          setError(result.error);
          setLineageData(null);
        } else {
          // Cache the result for future use
          setCachedLineage(entityNameOrGuid, result);

          // Set error if no lineage found but entity exists
          if (result.nodes?.length === 1 && result.rawProcesses?.length === 0) {
            setError(`No lineage data found for "${entityNameOrGuid}". This asset may not have recorded lineage.`);
          }

          setLineageData(result);
        }
      });
    } catch (err) {
      setError(err.message || 'Failed to fetch lineage');
      setLineageData(null);
    } finally {
      setLoading(false);
    }
  }, [isConnected, lineageService, startTransition]);

  /**
   * Fetch lineage based on SQL query (auto-detect entities)
   */
  const fetchLineageFromQuery = useCallback(async (sql) => {
    if (!isConnected || !lineageService || !sql?.trim()) {
      return;
    }

    const entities = extractEntitiesFromSQL(sql);
    if (entities.length === 0) {
      return;
    }

    // Fetch lineage for the primary entity (first one detected)
    await fetchLineageForEntity(entities[0]);
  }, [isConnected, lineageService, fetchLineageForEntity]);

  /**
   * Fetch sample lineage (for initial view when no query)
   */
  const fetchSampleLineage = useCallback(async () => {
    if (!isConnected || !lineageService) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Find a popular entity with lineage
      const sql = `
        SELECT t.name
        FROM ${database}.${schema}.TABLE_ENTITY t
        WHERE t.haslineage = TRUE
        ORDER BY t.popularityscore DESC NULLS LAST
        LIMIT 1
      `;
      
      const result = await executeQuery(sql);
      
      if (result?.rows?.length) {
        const row = Array.isArray(result.rows[0]) 
          ? { NAME: result.rows[0][0] }
          : result.rows[0];
        const tableName = row?.NAME || row?.name;
        
        if (tableName) {
          setCurrentEntity(tableName);
          await fetchLineageForEntity(tableName);
          return;
        }
      }
      
      // Fallback: any table
      const fallbackSql = `
        SELECT t.name
        FROM ${database}.${schema}.TABLE_ENTITY t
        ORDER BY t.popularityscore DESC NULLS LAST
        LIMIT 1
      `;
      
      const fallbackResult = await executeQuery(fallbackSql);
      if (fallbackResult?.rows?.length) {
        const row = Array.isArray(fallbackResult.rows[0]) 
          ? { NAME: fallbackResult.rows[0][0] }
          : fallbackResult.rows[0];
        const tableName = row?.NAME || row?.name;
        
        if (tableName) {
          setCurrentEntity(tableName);
          await fetchLineageForEntity(tableName);
        }
      }
    } catch (err) {
      setError('Failed to fetch sample lineage');
    } finally {
      setLoading(false);
    }
  }, [isConnected, lineageService, database, schema, executeQuery, fetchLineageForEntity]);

  // Watch for query changes and extract entities
  useEffect(() => {
    if (!isConnected || !lineageService) return;
    
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // Debounce query parsing
    debounceRef.current = setTimeout(() => {
      const entities = extractEntitiesFromSQL(currentQuery);
      
      if (entities.length > 0) {
        const primaryEntity = entities[0];
        if (primaryEntity !== lastQueryRef.current) {
          lastQueryRef.current = primaryEntity;
          fetchLineageForEntity(primaryEntity);
        }
      } else if (!currentQuery || currentQuery.trim() === '') {
        // No query - fetch sample lineage
        if (lastQueryRef.current !== '__sample__') {
          lastQueryRef.current = '__sample__';
          fetchSampleLineage();
        }
      }
    }, 500);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [currentQuery, isConnected, lineageService, fetchLineageForEntity, fetchSampleLineage]);

  // Initial fetch when connected
  useEffect(() => {
    if (isConnected && !lineageData && !loading && lineageService) {
      fetchSampleLineage();
    }
  }, [isConnected, lineageService]);

  return {
    lineageData,
    loading,
    error,
    currentTable: currentEntity,
    currentEntity,
    // React 18 concurrent feature: isPending indicates non-blocking update in progress
    // When true, show skeleton/placeholder while graph is being prepared
    isPending,
    // Methods
    refetch: () => {
      // Force refresh bypasses cache
      if (currentEntity) {
        fetchLineageForEntity(currentEntity, true);
      } else {
        const entities = extractEntitiesFromSQL(currentQuery);
        if (entities.length > 0) {
          fetchLineageForEntity(entities[0], true);
        } else {
          fetchSampleLineage();
        }
      }
    },
    fetchForEntity: fetchLineageForEntity,
    fetchFromQuery: fetchLineageFromQuery,
  };
}

/**
 * Hook to fetch lineage for a specific asset by GUID
 */
export function useAssetLineage(executeQuery, isConnected, database, schema, assetGuid) {
  const [lineageData, setLineageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lineageService = useMemo(() => {
    if (!executeQuery || !database || !schema) return null;
    return createLineageService(executeQuery, database, schema);
  }, [executeQuery, database, schema]);

  const fetchLineage = useCallback(async () => {
    if (!isConnected || !lineageService || !assetGuid) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await lineageService.getLineage(assetGuid);
      
      if (result.error) {
        setError(result.error);
      }
      
      setLineageData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isConnected, lineageService, assetGuid]);

  useEffect(() => {
    fetchLineage();
  }, [fetchLineage]);

  return {
    lineageData,
    loading,
    error,
    refetch: fetchLineage,
  };
}

export default useLineageData;
