/**
 * SystemConfigContext
 * 
 * Provides the SystemConfig to all components via React context.
 * This is the SINGLE SOURCE OF TRUTH for what's available in this Snowflake environment.
 * 
 * Usage:
 * ```jsx
 * // In App.jsx
 * import { SystemConfigProvider } from './context/SystemConfigContext';
 * 
 * <SystemConfigProvider>
 *   <YourApp />
 * </SystemConfigProvider>
 * 
 * // In any component
 * import { useConfig } from '../context/SystemConfigContext';
 * 
 * function MyComponent() {
 *   const config = useConfig();
 *   const hasLineage = config?.features?.lineage;
 *   const processEntity = config?.snowflake?.entities?.PROCESS_ENTITY;
 * }
 * ```
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useSystemConfig } from '../hooks/useSystemConfig';

// Create context with null default
const SystemConfigContext = createContext(null);

/**
 * Provider component that wraps the app and provides SystemConfig.
 */
export function SystemConfigProvider({ children }) {
  const {
    config,
    loading,
    error,
    refresh,
    entities,
    features,
    queryDefaults,
    catalog,
    hasEntity,
    getEntity,
    getEntityFQN,
  } = useSystemConfig();

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // Raw config
    config,
    loading,
    error,
    refresh,
    
    // Convenient accessors
    entities,
    features,
    queryDefaults,
    catalog,
    
    // Helper functions
    hasEntity,
    getEntity,
    getEntityFQN,
    
    // Metadata shortcuts
    metadataDb: queryDefaults?.metadataDb || 'FIELD_METADATA',
    metadataSchema: queryDefaults?.metadataSchema || 'PUBLIC',
    
    // Feature checks
    hasLineage: features?.lineage ?? false,
    hasGlossary: features?.glossary ?? false,
    hasDbt: features?.dbt ?? false,
    hasBiUsage: features?.biUsage ?? false,
    hasQueryHistory: features?.queryHistory ?? false,
  }), [
    config,
    loading,
    error,
    refresh,
    entities,
    features,
    queryDefaults,
    catalog,
    hasEntity,
    getEntity,
    getEntityFQN,
  ]);

  return (
    <SystemConfigContext.Provider value={value}>
      {children}
    </SystemConfigContext.Provider>
  );
}

/**
 * Hook to access the SystemConfig from context.
 * 
 * @returns {Object} The config context value
 */
export function useConfig() {
  const context = useContext(SystemConfigContext);
  
  // Return empty object if not in provider (for backwards compatibility)
  if (context === null) {
    return {
      config: null,
      loading: false,
      error: null,
      entities: {},
      features: {},
      queryDefaults: {},
      catalog: { tables: [], columns: [] },
      hasEntity: () => false,
      getEntity: () => null,
      getEntityFQN: () => null,
      metadataDb: 'FIELD_METADATA',
      metadataSchema: 'PUBLIC',
      hasLineage: true,  // Default to true for backwards compatibility
      hasGlossary: true,
      hasDbt: false,
      hasBiUsage: false,
      hasQueryHistory: false,
    };
  }
  
  return context;
}

/**
 * Hook to get metadata query context (db/schema for metadata queries).
 * 
 * Use this instead of hardcoded 'FIELD_METADATA.PUBLIC'.
 */
export function useMetadataQueryContext() {
  const { metadataDb, metadataSchema, config } = useConfig();
  
  return {
    metadataDb,
    metadataSchema,
    config,
    
    // Get a fully qualified name with the metadata context
    fqn: (tableName) => `"${metadataDb}"."${metadataSchema}"."${tableName}"`,
    
    // Get the metadata prefix for queries
    prefix: `${metadataDb}.${metadataSchema}`,
  };
}

export default SystemConfigContext;

