/**
 * useLineageIndicators - Efficiently fetch lineage availability for tables
 *
 * This hook batch-fetches which tables have lineage data to show indicator pills
 * in the database tree. Uses caching to minimize queries.
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { buildSafeFQN } from '../utils/queryHelpers';

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Hook to efficiently check lineage availability for tables
 *
 * @param {Function} executeQuery - Query execution function
 * @param {boolean} isConnected - Connection status
 * @param {string} mdlhDatabase - MDLH database name (e.g., 'FIELD_METADATA')
 * @param {string} mdlhSchema - MDLH schema name (e.g., 'PUBLIC')
 * @returns {Object} Lineage indicators and fetch functions
 */
export function useLineageIndicators(executeQuery, isConnected, mdlhDatabase = 'FIELD_METADATA', mdlhSchema = 'PUBLIC') {
  // Cache: { 'DB.SCHEMA': { tables: Map<tableName, {hasLineage, guid}>, timestamp } }
  const [lineageCache, setLineageCache] = useState({});
  const [loading, setLoading] = useState({});
  const pendingRequests = useRef(new Map());

  /**
   * Check if a specific table has lineage
   * @param {string} database - Database name
   * @param {string} schema - Schema name
   * @param {string} tableName - Table name
   * @returns {{ hasLineage: boolean, guid: string | null, loading: boolean }}
   */
  const getLineageStatus = useCallback((database, schema, tableName) => {
    const cacheKey = `${database}.${schema}`;
    const cached = lineageCache[cacheKey];

    if (!cached) {
      return { hasLineage: false, guid: null, loading: loading[cacheKey] || false };
    }

    // Check if cache is stale
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      return { hasLineage: false, guid: null, loading: loading[cacheKey] || false };
    }

    const tableInfo = cached.tables.get(tableName.toUpperCase());
    return {
      hasLineage: tableInfo?.hasLineage || false,
      guid: tableInfo?.guid || null,
      loading: false
    };
  }, [lineageCache, loading]);

  /**
   * Batch fetch lineage status for all tables in a schema
   * @param {string} database - Target database
   * @param {string} schema - Target schema
   */
  const fetchLineageForSchema = useCallback(async (database, schema) => {
    if (!isConnected || !executeQuery || !database || !schema) {
      return;
    }

    const cacheKey = `${database}.${schema}`;

    // Check if already cached and fresh
    const cached = lineageCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return;
    }

    // Check if already loading
    if (pendingRequests.current.has(cacheKey)) {
      return pendingRequests.current.get(cacheKey);
    }

    setLoading(prev => ({ ...prev, [cacheKey]: true }));

    // Build query to find tables with lineage in this database/schema
    // We look for tables whose qualifiedName contains the database/schema pattern
    const tableFQN = buildSafeFQN(mdlhDatabase, mdlhSchema, 'TABLE_ENTITY');

    const sql = `
      SELECT
        t.name,
        t.guid,
        t.haslineage,
        t.qualifiedname
      FROM ${tableFQN} t
      WHERE t.qualifiedname ILIKE '%/${database}/${schema}/%'
        AND t.haslineage = TRUE
      LIMIT 500
    `;

    const promise = (async () => {
      try {
        const result = await executeQuery(sql);
        const tables = new Map();

        if (result?.rows) {
          result.rows.forEach(row => {
            // Handle both array and object row formats
            const name = Array.isArray(row) ? row[0] : (row.NAME || row.name);
            const guid = Array.isArray(row) ? row[1] : (row.GUID || row.guid);
            const hasLineage = Array.isArray(row) ? row[2] : (row.HASLINEAGE || row.haslineage);

            if (name) {
              tables.set(name.toUpperCase(), {
                hasLineage: Boolean(hasLineage),
                guid: guid
              });
            }
          });
        }

        setLineageCache(prev => ({
          ...prev,
          [cacheKey]: {
            tables,
            timestamp: Date.now()
          }
        }));

        // Tables cached successfully
      } catch (err) {
        // Error fetching lineage indicators - continue silently
      } finally {
        setLoading(prev => ({ ...prev, [cacheKey]: false }));
        pendingRequests.current.delete(cacheKey);
      }
    })();

    pendingRequests.current.set(cacheKey, promise);
    return promise;
  }, [isConnected, executeQuery, mdlhDatabase, mdlhSchema, lineageCache]);

  /**
   * Get all tables with lineage for a schema (for bulk operations)
   */
  const getTablesWithLineage = useCallback((database, schema) => {
    const cacheKey = `${database}.${schema}`;
    const cached = lineageCache[cacheKey];

    if (!cached || Date.now() - cached.timestamp > CACHE_TTL) {
      return [];
    }

    return Array.from(cached.tables.entries())
      .filter(([_, info]) => info.hasLineage)
      .map(([name, info]) => ({ name, guid: info.guid }));
  }, [lineageCache]);

  /**
   * Invalidate cache for a schema
   */
  const invalidateSchema = useCallback((database, schema) => {
    const cacheKey = `${database}.${schema}`;
    setLineageCache(prev => {
      const next = { ...prev };
      delete next[cacheKey];
      return next;
    });
  }, []);

  /**
   * Clear all cache
   */
  const clearCache = useCallback(() => {
    setLineageCache({});
  }, []);

  // Memoized summary stats
  const stats = useMemo(() => {
    let totalCached = 0;
    let totalWithLineage = 0;

    Object.values(lineageCache).forEach(schema => {
      schema.tables.forEach(info => {
        totalCached++;
        if (info.hasLineage) totalWithLineage++;
      });
    });

    return { totalCached, totalWithLineage };
  }, [lineageCache]);

  return {
    getLineageStatus,
    fetchLineageForSchema,
    getTablesWithLineage,
    invalidateSchema,
    clearCache,
    loading,
    stats
  };
}

export default useLineageIndicators;
