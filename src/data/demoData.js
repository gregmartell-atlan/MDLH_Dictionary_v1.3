/**
 * Demo Mode Data
 *
 * Re-exports comprehensive demo data from demoProxyData.js
 * for running the app without a backend connection.
 *
 * Used when deployed to GitHub Pages or when backend is unavailable.
 *
 * Demo Company: ACME Analytics (fictional e-commerce analytics company)
 */

// Import everything from the comprehensive proxy data
import demoProxyData, {
  // Company config
  DEMO_COMPANY,
  DEMO_DATABASE,
  DEMO_SCHEMA,

  // Users/Groups
  DEMO_USERS,
  DEMO_GROUPS,

  // Entity tables
  DEMO_ENTITY_TABLES,

  // Core entities
  DEMO_DATABASES,
  DEMO_SCHEMAS,
  DEMO_TABLES,
  DEMO_COLUMNS,
  DEMO_PROCESSES,

  // Glossary
  DEMO_GLOSSARIES,
  DEMO_GLOSSARY_CATEGORIES,
  DEMO_GLOSSARY_TERMS,

  // Data Mesh
  DEMO_DATA_DOMAINS,

  // Governance
  DEMO_TAGS,

  // Lineage
  DEMO_LINEAGE_DATA,

  // Connection
  DEMO_CONNECTION_STATUS,

  // Query results
  DEMO_QUERY_RESULTS,

  // Backward compatibility
  DEMO_SAMPLE_ENTITIES,

  // Utility
  isDemoMode,
  executeDemoQuery,
} from './demoProxyData';

// Re-export everything
export {
  // Company config
  DEMO_COMPANY,
  DEMO_DATABASE,
  DEMO_SCHEMA,

  // Users/Groups
  DEMO_USERS,
  DEMO_GROUPS,

  // Entity tables (replaces old DEMO_TABLES for table discovery)
  DEMO_ENTITY_TABLES,

  // Core entities
  DEMO_DATABASES,
  DEMO_SCHEMAS,
  DEMO_TABLES,
  DEMO_COLUMNS,
  DEMO_PROCESSES,

  // Glossary
  DEMO_GLOSSARIES,
  DEMO_GLOSSARY_CATEGORIES,
  DEMO_GLOSSARY_TERMS,

  // Data Mesh
  DEMO_DATA_DOMAINS,

  // Governance
  DEMO_TAGS,

  // Lineage
  DEMO_LINEAGE_DATA,

  // Connection
  DEMO_CONNECTION_STATUS,

  // Query results
  DEMO_QUERY_RESULTS,

  // Backward compatibility
  DEMO_SAMPLE_ENTITIES,

  // Utility
  isDemoMode,
  executeDemoQuery,
};

// Default export
export default demoProxyData;
