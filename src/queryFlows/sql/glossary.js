/**
 * Glossary SQL Builder
 * 
 * Generates queries for glossary term lookups and relationships.
 * 
 * SQL INJECTION PROTECTED: Uses buildSafeFQN and escapeStringValue.
 */

import { buildSafeFQN, escapeStringValue } from '../../utils/queryHelpers';

/**
 * Escape a value for use in LIKE/ILIKE patterns
 * 
 * @param {string} value - The value to escape for LIKE
 * @returns {string} - Escaped value (without surrounding quotes)
 */
function escapeLikePattern(value) {
  if (!value) return '';
  return value
    .replace(/'/g, "''")  // Escape single quotes
    .replace(/%/g, '\\%')  // Escape %
    .replace(/_/g, '\\_'); // Escape _
}

/**
 * Build a glossary lookup query
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildGlossaryQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const { rowLimit = 200, filters = {} } = inputs;
  const rawTermName = filters.termName || entity.name || '<TERM>';
  
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  // Escape term name for LIKE patterns
  const safeTermPattern = escapeLikePattern(rawTermName);
  
  // Check available glossary tables
  const tables = (availableTables || []).map(t => t.toUpperCase());
  
  const termTable = tables.includes('ATLASGLOSSARYTERM_ENTITY')
    ? 'ATLASGLOSSARYTERM_ENTITY'
    : tables.includes('GLOSSARYTERM_ENTITY')
    ? 'GLOSSARYTERM_ENTITY'
    : tables.find(t => t.includes('GLOSSARY') && t.includes('TERM'));
  
  if (!termTable) {
    // Build safe FQN for SHOW command
    const safeDbSchema = buildSafeFQN(db, schema, null);
    
    return {
      title: `📖 Glossary: ${rawTermName}`,
      description: 'No glossary tables found in schema.',
      sql: `-- No GLOSSARYTERM_ENTITY found\n-- Run this to find glossary tables:\nSHOW TABLES LIKE '%GLOSSARY%' IN ${safeDbSchema};`,
      flowType: 'GLOSSARY_LOOKUP',
      entity,
    };
  }

  // Build safe FQN for the term table
  const termTableFQN = buildSafeFQN(db, schema, termTable);

  const sql = `
-- Glossary: terms matching "${rawTermName}"
-- Using ${termTable}

SELECT
    name AS term_name,
    guid,
    userdescription AS description,
    certificatestatus AS status,
    createdby AS created_by,
    anchor AS glossary_guids,
    categories AS category_guids
FROM ${termTableFQN}
WHERE name ILIKE '%${safeTermPattern}%'
   OR userdescription ILIKE '%${safeTermPattern}%'
ORDER BY name
LIMIT ${rowLimit};
`.trim();

  return {
    title: `📖 Glossary: ${rawTermName}`,
    description: `Glossary terms matching "${rawTermName}".`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    limit: rowLimit,
    flowType: 'GLOSSARY_LOOKUP',
    entity,
  };
}

/**
 * Build a query to find assets linked to a glossary term
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildTermLinkedAssetsQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const { rowLimit = 200 } = inputs;
  const rawTermGuid = entity.guid || '<TERM_GUID>';
  const termName = entity.name || '<TERM>';
  
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  // Safely escape the GUID for SQL
  const safeTermGuid = escapeStringValue(rawTermGuid);
  
  // Check for table entity
  const tables = (availableTables || []).map(t => t.toUpperCase());
  const hasTableEntity = tables.includes('TABLE_ENTITY');
  const hasColumnEntity = tables.includes('COLUMN_ENTITY');
  
  if (!hasTableEntity) {
    // Build safe FQN for SHOW command
    const safeDbSchema = buildSafeFQN(db, schema, null);
    
    return {
      title: `🔗 Assets for: ${termName}`,
      description: 'TABLE_ENTITY not found.',
      sql: `-- TABLE_ENTITY not available\nSHOW TABLES IN ${safeDbSchema};`,
      flowType: 'GLOSSARY_LOOKUP',
      entity,
    };
  }

  // Build safe FQNs for the tables
  const tableEntityFQN = buildSafeFQN(db, schema, 'TABLE_ENTITY');
  const columnEntityFQN = buildSafeFQN(db, schema, 'COLUMN_ENTITY');

  // MDLH stores term links in the MEANINGS column on assets
  // MEANINGS is a VARIANT column - use ::STRING ILIKE for GUID matching
  const sql = `
-- Assets linked to glossary term: ${termName}
-- Term GUID: ${rawTermGuid}
-- MEANINGS is an ARRAY - use ::STRING ILIKE

SELECT
    'TABLE' AS asset_type,
    t.name AS asset_name,
    t.guid AS asset_guid,
    t.databasename,
    t.schemaname,
    t.meanings
FROM ${tableEntityFQN} t
WHERE t.meanings::STRING ILIKE '%' || ${safeTermGuid} || '%'
${hasColumnEntity ? `
UNION ALL

SELECT
    'COLUMN' AS asset_type,
    c.name AS asset_name,
    c.guid AS asset_guid,
    c.databasename,
    c.schemaname,
    c.meanings
FROM ${columnEntityFQN} c
WHERE c.meanings::STRING ILIKE '%' || ${safeTermGuid} || '%'
` : ''}
ORDER BY asset_type, asset_name
LIMIT ${rowLimit};
`.trim();

  return {
    title: `🔗 Assets linked to: ${termName}`,
    description: `Tables and columns linked to glossary term "${termName}".`,
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    flowType: 'GLOSSARY_LOOKUP',
    entity,
  };
}

/**
 * Build a query to list all glossaries
 * @param {import('../types').EntityContext} entity 
 * @param {import('../types').QueryFlowInputs} inputs 
 * @param {string[]} [availableTables]
 * @param {Object} [systemConfig] - SystemConfig for config-driven entity resolution
 * @returns {import('../types').BuiltQuery}
 */
export function buildListGlossariesQuery(entity, inputs, availableTables = [], systemConfig = null) {
  const { rowLimit = 100 } = inputs;
  
  // Get db/schema from SystemConfig or entity
  const queryDefaults = systemConfig?.queryDefaults || {};
  const db = entity.database || queryDefaults.metadataDb || 'FIELD_METADATA';
  const schema = entity.schema || queryDefaults.metadataSchema || 'PUBLIC';
  
  const tables = (availableTables || []).map(t => t.toUpperCase());
  const glossaryTable = tables.includes('ATLASGLOSSARY_ENTITY')
    ? 'ATLASGLOSSARY_ENTITY'
    : tables.find(t => t.includes('GLOSSARY') && !t.includes('TERM') && !t.includes('CATEGORY'));
  
  if (!glossaryTable) {
    // Build safe FQN for SHOW command
    const safeDbSchema = buildSafeFQN(db, schema, null);
    
    return {
      title: '📚 All Glossaries',
      description: 'No glossary table found.',
      sql: `-- No ATLASGLOSSARY_ENTITY found\nSHOW TABLES LIKE '%GLOSSARY%' IN ${safeDbSchema};`,
      flowType: 'GLOSSARY_LOOKUP',
      entity,
    };
  }

  // Build safe FQN for the glossary table
  const glossaryTableFQN = buildSafeFQN(db, schema, glossaryTable);

  const sql = `
-- List all glossaries

SELECT
    name AS glossary_name,
    guid,
    userdescription AS description,
    createdby AS created_by,
    TO_TIMESTAMP(createtime/1000) AS created_at
FROM ${glossaryTableFQN}
ORDER BY name
LIMIT ${rowLimit};
`.trim();

  return {
    title: '📚 All Glossaries',
    description: 'List of all business glossaries.',
    sql,
    database: db,
    schema,
    timeoutSeconds: 30,
    flowType: 'GLOSSARY_LOOKUP',
    entity,
  };
}

export default buildGlossaryQuery;
