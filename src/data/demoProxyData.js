/**
 * Demo Proxy Data - ACME Analytics
 *
 * Comprehensive sample data for running MDLH Dictionary in demo mode.
 * Uses realistic structure from real MDLH exports with anonymized/fictional values.
 *
 * Company: ACME Analytics (fictional e-commerce analytics company)
 * Data Model: Retail/E-commerce with:
 *   - Snowflake data warehouse (RAW, STAGING, MARTS layers)
 *   - dbt transformations
 *   - Tableau dashboards
 *   - Airflow orchestration
 *   - Business glossary with data mesh domains
 */

// =============================================================================
// DEMO COMPANY CONFIGURATION
// =============================================================================

export const DEMO_COMPANY = {
  name: 'ACME Analytics',
  domain: 'acme-demo.com',
  snowflakeAccount: 'acme_analytics.us-east-1',
};

export const DEMO_DATABASE = 'ACME_ANALYTICS_MDLH';
export const DEMO_SCHEMA = 'PUBLIC';

// Connection qualified name pattern
const CONN_QN = 'default/snowflake/1234567890';
const DB_QN = `${CONN_QN}/ACME_DW`;

// =============================================================================
// GUID GENERATOR (deterministic for consistency)
// =============================================================================

let guidCounter = 0;
const generateGuid = (prefix = 'demo') => {
  guidCounter++;
  return `${prefix}-${String(guidCounter).padStart(6, '0')}-acme`;
};

// Reset counter for consistent GUIDs across hot reloads
const resetGuidCounter = () => { guidCounter = 0; };
resetGuidCounter();

// =============================================================================
// TIMESTAMPS
// =============================================================================

const NOW = Date.now();
const DAY = 86400000;
const HOUR = 3600000;

const daysAgo = (days) => NOW - (days * DAY);
const hoursAgo = (hours) => NOW - (hours * HOUR);

// =============================================================================
// DEMO USERS & GROUPS
// =============================================================================

export const DEMO_USERS = [
  'alex.chen@acme-demo.com',
  'sarah.johnson@acme-demo.com',
  'mike.patel@acme-demo.com',
  'emma.wilson@acme-demo.com',
  'david.kim@acme-demo.com',
  'lisa.zhang@acme-demo.com',
];

export const DEMO_GROUPS = [
  'data-engineering',
  'analytics-team',
  'data-science',
  'business-intelligence',
  'data-governance',
];

// =============================================================================
// ENTITY TABLES (INFORMATION_SCHEMA simulation)
// =============================================================================

export const DEMO_ENTITY_TABLES = [
  { TABLE_NAME: 'TABLE_ENTITY', ROW_COUNT: 847, TABLE_TYPE: 'BASE TABLE', BYTES: 125000000 },
  { TABLE_NAME: 'COLUMN_ENTITY', ROW_COUNT: 12450, TABLE_TYPE: 'BASE TABLE', BYTES: 890000000 },
  { TABLE_NAME: 'PROCESS_ENTITY', ROW_COUNT: 324, TABLE_TYPE: 'BASE TABLE', BYTES: 45000000 },
  { TABLE_NAME: 'COLUMNPROCESS_ENTITY', ROW_COUNT: 2156, TABLE_TYPE: 'BASE TABLE', BYTES: 78000000 },
  { TABLE_NAME: 'DATABASE_ENTITY', ROW_COUNT: 12, TABLE_TYPE: 'BASE TABLE', BYTES: 2500000 },
  { TABLE_NAME: 'SCHEMA_ENTITY', ROW_COUNT: 45, TABLE_TYPE: 'BASE TABLE', BYTES: 8900000 },
  { TABLE_NAME: 'VIEW_ENTITY', ROW_COUNT: 156, TABLE_TYPE: 'BASE TABLE', BYTES: 23000000 },
  { TABLE_NAME: 'ATLASGLOSSARY_ENTITY', ROW_COUNT: 8, TABLE_TYPE: 'BASE TABLE', BYTES: 450000 },
  { TABLE_NAME: 'ATLASGLOSSARYTERM_ENTITY', ROW_COUNT: 234, TABLE_TYPE: 'BASE TABLE', BYTES: 12000000 },
  { TABLE_NAME: 'ATLASGLOSSARYCATEGORY_ENTITY', ROW_COUNT: 28, TABLE_TYPE: 'BASE TABLE', BYTES: 1200000 },
  { TABLE_NAME: 'DATADOMAIN_ENTITY', ROW_COUNT: 6, TABLE_TYPE: 'BASE TABLE', BYTES: 350000 },
  { TABLE_NAME: 'DATAPRODUCT_ENTITY', ROW_COUNT: 15, TABLE_TYPE: 'BASE TABLE', BYTES: 890000 },
  { TABLE_NAME: 'QUERY_ENTITY', ROW_COUNT: 3450, TABLE_TYPE: 'BASE TABLE', BYTES: 234000000 },
  { TABLE_NAME: 'CONNECTION_ENTITY', ROW_COUNT: 8, TABLE_TYPE: 'BASE TABLE', BYTES: 450000 },
  { TABLE_NAME: 'DBTMODEL_ENTITY', ROW_COUNT: 89, TABLE_TYPE: 'BASE TABLE', BYTES: 12000000 },
  { TABLE_NAME: 'DBTTEST_ENTITY', ROW_COUNT: 234, TABLE_TYPE: 'BASE TABLE', BYTES: 5600000 },
  { TABLE_NAME: 'TABLEAUWORKBOOK_ENTITY', ROW_COUNT: 23, TABLE_TYPE: 'BASE TABLE', BYTES: 3400000 },
  { TABLE_NAME: 'TABLEAUDASHBOARD_ENTITY', ROW_COUNT: 67, TABLE_TYPE: 'BASE TABLE', BYTES: 4500000 },
  { TABLE_NAME: 'AIRFLOWDAG_ENTITY', ROW_COUNT: 18, TABLE_TYPE: 'BASE TABLE', BYTES: 2300000 },
  { TABLE_NAME: 'AIRFLOWTASK_ENTITY', ROW_COUNT: 156, TABLE_TYPE: 'BASE TABLE', BYTES: 8900000 },
  { TABLE_NAME: 'BIPROCESS_ENTITY', ROW_COUNT: 234, TABLE_TYPE: 'BASE TABLE', BYTES: 12000000 },
  { TABLE_NAME: 'TAG_RELATIONSHIP', ROW_COUNT: 1890, TABLE_TYPE: 'BASE TABLE', BYTES: 23000000 },
  { TABLE_NAME: 'CUSTOMMETADATA_RELATIONSHIP', ROW_COUNT: 4560, TABLE_TYPE: 'BASE TABLE', BYTES: 56000000 },
];

// =============================================================================
// DATABASES
// =============================================================================

export const DEMO_DATABASES = [
  {
    GUID: generateGuid('db'),
    NAME: 'ACME_DW',
    TYPENAME: 'Database',
    QUALIFIEDNAME: `${CONN_QN}/ACME_DW`,
    CONNECTORNAME: 'snowflake',
    SCHEMACOUNT: 5,
    DESCRIPTION: 'Primary data warehouse for ACME Analytics',
    OWNERUSERS: ['alex.chen@acme-demo.com'],
    OWNERGROUPS: ['data-engineering'],
    CREATETIME: daysAgo(365),
    UPDATETIME: hoursAgo(2),
  },
  {
    GUID: generateGuid('db'),
    NAME: 'ACME_RAW',
    TYPENAME: 'Database',
    QUALIFIEDNAME: `${CONN_QN}/ACME_RAW`,
    CONNECTORNAME: 'snowflake',
    SCHEMACOUNT: 3,
    DESCRIPTION: 'Raw data landing zone from source systems',
    OWNERUSERS: ['mike.patel@acme-demo.com'],
    OWNERGROUPS: ['data-engineering'],
    CREATETIME: daysAgo(365),
    UPDATETIME: hoursAgo(1),
  },
];

// =============================================================================
// SCHEMAS
// =============================================================================

export const DEMO_SCHEMAS = [
  {
    GUID: generateGuid('schema'),
    NAME: 'RAW_ECOMMERCE',
    TYPENAME: 'Schema',
    QUALIFIEDNAME: `${DB_QN}/RAW_ECOMMERCE`,
    DATABASEQUALIFIEDNAME: `${CONN_QN}/ACME_RAW`,
    TABLECOUNT: 12,
    VIEWCOUNT: 0,
    DESCRIPTION: 'Raw e-commerce data from Shopify and payment processors',
    OWNERUSERS: ['mike.patel@acme-demo.com'],
    CREATETIME: daysAgo(300),
    UPDATETIME: hoursAgo(1),
  },
  {
    GUID: generateGuid('schema'),
    NAME: 'STAGING',
    TYPENAME: 'Schema',
    QUALIFIEDNAME: `${DB_QN}/STAGING`,
    DATABASEQUALIFIEDNAME: DB_QN,
    TABLECOUNT: 24,
    VIEWCOUNT: 8,
    DESCRIPTION: 'Staged and cleaned data ready for transformation',
    OWNERUSERS: ['alex.chen@acme-demo.com'],
    CREATETIME: daysAgo(280),
    UPDATETIME: hoursAgo(3),
  },
  {
    GUID: generateGuid('schema'),
    NAME: 'MARTS',
    TYPENAME: 'Schema',
    QUALIFIEDNAME: `${DB_QN}/MARTS`,
    DATABASEQUALIFIEDNAME: DB_QN,
    TABLECOUNT: 18,
    VIEWCOUNT: 12,
    DESCRIPTION: 'Business-ready data marts for analytics and reporting',
    OWNERUSERS: ['sarah.johnson@acme-demo.com'],
    CREATETIME: daysAgo(250),
    UPDATETIME: hoursAgo(2),
  },
  {
    GUID: generateGuid('schema'),
    NAME: 'ANALYTICS',
    TYPENAME: 'Schema',
    QUALIFIEDNAME: `${DB_QN}/ANALYTICS`,
    DATABASEQUALIFIEDNAME: DB_QN,
    TABLECOUNT: 8,
    VIEWCOUNT: 15,
    DESCRIPTION: 'Aggregated metrics and KPIs for dashboards',
    OWNERUSERS: ['emma.wilson@acme-demo.com'],
    CREATETIME: daysAgo(200),
    UPDATETIME: hoursAgo(1),
  },
];

// =============================================================================
// TABLES (Core fact and dimension tables)
// =============================================================================

export const DEMO_TABLES = [
  // RAW Layer
  {
    GUID: generateGuid('tbl'),
    NAME: 'RAW_ORDERS',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/RAW_ECOMMERCE/RAW_ORDERS`,
    DATABASENAME: 'ACME_RAW',
    SCHEMANAME: 'RAW_ECOMMERCE',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 2450000,
    COLUMNCOUNT: 18,
    SIZEBYTES: 890000000,
    QUERYCOUNT: 1250,
    QUERYUSERCOUNT: 8,
    POPULARITYSCORE: 72,
    DESCRIPTION: 'Raw order data from Shopify webhook',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['mike.patel@acme-demo.com'],
    OWNERGROUPS: ['data-engineering'],
    CREATETIME: daysAgo(300),
    UPDATETIME: hoursAgo(1),
    HASLINEAGE: true,
  },
  {
    GUID: generateGuid('tbl'),
    NAME: 'RAW_CUSTOMERS',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/RAW_ECOMMERCE/RAW_CUSTOMERS`,
    DATABASENAME: 'ACME_RAW',
    SCHEMANAME: 'RAW_ECOMMERCE',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 523000,
    COLUMNCOUNT: 24,
    SIZEBYTES: 234000000,
    QUERYCOUNT: 890,
    QUERYUSERCOUNT: 6,
    POPULARITYSCORE: 65,
    DESCRIPTION: 'Raw customer data including PII fields',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['mike.patel@acme-demo.com'],
    OWNERGROUPS: ['data-engineering'],
    CREATETIME: daysAgo(300),
    UPDATETIME: hoursAgo(1),
    HASLINEAGE: true,
  },
  {
    GUID: generateGuid('tbl'),
    NAME: 'RAW_PRODUCTS',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/RAW_ECOMMERCE/RAW_PRODUCTS`,
    DATABASENAME: 'ACME_RAW',
    SCHEMANAME: 'RAW_ECOMMERCE',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 8500,
    COLUMNCOUNT: 32,
    SIZEBYTES: 12000000,
    QUERYCOUNT: 456,
    QUERYUSERCOUNT: 5,
    POPULARITYSCORE: 48,
    DESCRIPTION: 'Product catalog from inventory management system',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['mike.patel@acme-demo.com'],
    CREATETIME: daysAgo(300),
    UPDATETIME: daysAgo(1),
    HASLINEAGE: true,
  },
  // STAGING Layer
  {
    GUID: generateGuid('tbl'),
    NAME: 'STG_ORDERS',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/STAGING/STG_ORDERS`,
    DATABASENAME: 'ACME_DW',
    SCHEMANAME: 'STAGING',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 2450000,
    COLUMNCOUNT: 22,
    SIZEBYTES: 780000000,
    QUERYCOUNT: 2340,
    QUERYUSERCOUNT: 12,
    POPULARITYSCORE: 85,
    DESCRIPTION: 'Cleaned and validated order data with standardized fields',
    STATUS: 'ACTIVE',
    CERTIFICATESTATUS: 'VERIFIED',
    STATUSMESSAGE: 'Verified by data-governance on 2025-01-15',
    OWNERUSERS: ['alex.chen@acme-demo.com'],
    OWNERGROUPS: ['data-engineering'],
    CREATETIME: daysAgo(280),
    UPDATETIME: hoursAgo(2),
    HASLINEAGE: true,
  },
  {
    GUID: generateGuid('tbl'),
    NAME: 'STG_CUSTOMERS',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/STAGING/STG_CUSTOMERS`,
    DATABASENAME: 'ACME_DW',
    SCHEMANAME: 'STAGING',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 523000,
    COLUMNCOUNT: 28,
    SIZEBYTES: 256000000,
    QUERYCOUNT: 1890,
    QUERYUSERCOUNT: 10,
    POPULARITYSCORE: 82,
    DESCRIPTION: 'Cleaned customer data with PII fields masked',
    STATUS: 'ACTIVE',
    CERTIFICATESTATUS: 'VERIFIED',
    OWNERUSERS: ['alex.chen@acme-demo.com'],
    OWNERGROUPS: ['data-engineering', 'data-governance'],
    CREATETIME: daysAgo(280),
    UPDATETIME: hoursAgo(2),
    HASLINEAGE: true,
  },
  // MARTS Layer - Facts
  {
    GUID: generateGuid('tbl'),
    NAME: 'FACT_ORDERS',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`,
    DATABASENAME: 'ACME_DW',
    SCHEMANAME: 'MARTS',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 2450000,
    COLUMNCOUNT: 15,
    SIZEBYTES: 560000000,
    QUERYCOUNT: 8900,
    QUERYUSERCOUNT: 24,
    POPULARITYSCORE: 98,
    DESCRIPTION: 'Order fact table - grain is one row per order line item',
    STATUS: 'ACTIVE',
    CERTIFICATESTATUS: 'VERIFIED',
    STATUSMESSAGE: 'Gold-tier certified table for executive reporting',
    OWNERUSERS: ['sarah.johnson@acme-demo.com'],
    OWNERGROUPS: ['analytics-team', 'data-governance'],
    CREATETIME: daysAgo(250),
    UPDATETIME: hoursAgo(1),
    HASLINEAGE: true,
  },
  {
    GUID: generateGuid('tbl'),
    NAME: 'FACT_DAILY_SALES',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/MARTS/FACT_DAILY_SALES`,
    DATABASENAME: 'ACME_DW',
    SCHEMANAME: 'MARTS',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 1825,
    COLUMNCOUNT: 12,
    SIZEBYTES: 45000000,
    QUERYCOUNT: 5600,
    QUERYUSERCOUNT: 18,
    POPULARITYSCORE: 95,
    DESCRIPTION: 'Daily aggregated sales metrics by date and category',
    STATUS: 'ACTIVE',
    CERTIFICATESTATUS: 'VERIFIED',
    OWNERUSERS: ['emma.wilson@acme-demo.com'],
    OWNERGROUPS: ['analytics-team'],
    CREATETIME: daysAgo(200),
    UPDATETIME: hoursAgo(1),
    HASLINEAGE: true,
  },
  // MARTS Layer - Dimensions
  {
    GUID: generateGuid('tbl'),
    NAME: 'DIM_CUSTOMERS',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`,
    DATABASENAME: 'ACME_DW',
    SCHEMANAME: 'MARTS',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 523000,
    COLUMNCOUNT: 18,
    SIZEBYTES: 189000000,
    QUERYCOUNT: 4500,
    QUERYUSERCOUNT: 20,
    POPULARITYSCORE: 92,
    DESCRIPTION: 'Customer dimension with SCD Type 2 history',
    STATUS: 'ACTIVE',
    CERTIFICATESTATUS: 'VERIFIED',
    OWNERUSERS: ['sarah.johnson@acme-demo.com'],
    OWNERGROUPS: ['analytics-team'],
    CREATETIME: daysAgo(250),
    UPDATETIME: hoursAgo(2),
    HASLINEAGE: true,
  },
  {
    GUID: generateGuid('tbl'),
    NAME: 'DIM_PRODUCTS',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`,
    DATABASENAME: 'ACME_DW',
    SCHEMANAME: 'MARTS',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 8500,
    COLUMNCOUNT: 22,
    SIZEBYTES: 23000000,
    QUERYCOUNT: 3200,
    QUERYUSERCOUNT: 15,
    POPULARITYSCORE: 88,
    DESCRIPTION: 'Product dimension with category hierarchy',
    STATUS: 'ACTIVE',
    CERTIFICATESTATUS: 'VERIFIED',
    OWNERUSERS: ['sarah.johnson@acme-demo.com'],
    CREATETIME: daysAgo(250),
    UPDATETIME: daysAgo(1),
    HASLINEAGE: true,
  },
  {
    GUID: generateGuid('tbl'),
    NAME: 'DIM_DATE',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/MARTS/DIM_DATE`,
    DATABASENAME: 'ACME_DW',
    SCHEMANAME: 'MARTS',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 3650,
    COLUMNCOUNT: 28,
    SIZEBYTES: 8900000,
    QUERYCOUNT: 12000,
    QUERYUSERCOUNT: 28,
    POPULARITYSCORE: 99,
    DESCRIPTION: 'Date dimension with fiscal calendar attributes',
    STATUS: 'ACTIVE',
    CERTIFICATESTATUS: 'VERIFIED',
    OWNERUSERS: ['alex.chen@acme-demo.com'],
    CREATETIME: daysAgo(365),
    UPDATETIME: daysAgo(30),
    HASLINEAGE: false,
  },
  // Analytics Layer
  {
    GUID: generateGuid('tbl'),
    NAME: 'AGG_WEEKLY_REVENUE',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/ANALYTICS/AGG_WEEKLY_REVENUE`,
    DATABASENAME: 'ACME_DW',
    SCHEMANAME: 'ANALYTICS',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 260,
    COLUMNCOUNT: 8,
    SIZEBYTES: 2300000,
    QUERYCOUNT: 2800,
    QUERYUSERCOUNT: 12,
    POPULARITYSCORE: 78,
    DESCRIPTION: 'Weekly revenue aggregations for trend analysis',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['emma.wilson@acme-demo.com'],
    CREATETIME: daysAgo(150),
    UPDATETIME: hoursAgo(1),
    HASLINEAGE: true,
  },
  {
    GUID: generateGuid('tbl'),
    NAME: 'CUSTOMER_LIFETIME_VALUE',
    TYPENAME: 'Table',
    QUALIFIEDNAME: `${DB_QN}/ANALYTICS/CUSTOMER_LIFETIME_VALUE`,
    DATABASENAME: 'ACME_DW',
    SCHEMANAME: 'ANALYTICS',
    CONNECTORNAME: 'snowflake',
    ROWCOUNT: 523000,
    COLUMNCOUNT: 12,
    SIZEBYTES: 89000000,
    QUERYCOUNT: 1200,
    QUERYUSERCOUNT: 8,
    POPULARITYSCORE: 72,
    DESCRIPTION: 'Predicted customer lifetime value using ML model',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['david.kim@acme-demo.com'],
    OWNERGROUPS: ['data-science'],
    CREATETIME: daysAgo(90),
    UPDATETIME: daysAgo(1),
    HASLINEAGE: true,
  },
];

// =============================================================================
// COLUMNS (Sample columns for key tables)
// =============================================================================

export const DEMO_COLUMNS = [
  // FACT_ORDERS columns
  { GUID: generateGuid('col'), NAME: 'ORDER_ID', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'VARCHAR(36)', ORDER: 1, ISPRIMARYKEY: true, ISNULLABLE: false, DESCRIPTION: 'Unique order identifier (UUID)' },
  { GUID: generateGuid('col'), NAME: 'CUSTOMER_KEY', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'NUMBER(38,0)', ORDER: 2, ISFOREIGNKEY: true, ISNULLABLE: false, DESCRIPTION: 'Foreign key to DIM_CUSTOMERS' },
  { GUID: generateGuid('col'), NAME: 'PRODUCT_KEY', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'NUMBER(38,0)', ORDER: 3, ISFOREIGNKEY: true, ISNULLABLE: false, DESCRIPTION: 'Foreign key to DIM_PRODUCTS' },
  { GUID: generateGuid('col'), NAME: 'ORDER_DATE_KEY', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'NUMBER(8,0)', ORDER: 4, ISFOREIGNKEY: true, ISNULLABLE: false, DESCRIPTION: 'Foreign key to DIM_DATE (YYYYMMDD format)' },
  { GUID: generateGuid('col'), NAME: 'ORDER_AMOUNT', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'NUMBER(18,2)', ORDER: 5, ISNULLABLE: false, DESCRIPTION: 'Total order amount in USD' },
  { GUID: generateGuid('col'), NAME: 'QUANTITY', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'NUMBER(10,0)', ORDER: 6, ISNULLABLE: false, DESCRIPTION: 'Number of items ordered' },
  { GUID: generateGuid('col'), NAME: 'DISCOUNT_AMOUNT', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'NUMBER(18,2)', ORDER: 7, ISNULLABLE: true, DESCRIPTION: 'Discount applied to order' },
  { GUID: generateGuid('col'), NAME: 'TAX_AMOUNT', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'NUMBER(18,2)', ORDER: 8, ISNULLABLE: true, DESCRIPTION: 'Tax amount' },
  { GUID: generateGuid('col'), NAME: 'SHIPPING_AMOUNT', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'NUMBER(18,2)', ORDER: 9, ISNULLABLE: true, DESCRIPTION: 'Shipping cost' },
  { GUID: generateGuid('col'), NAME: 'ORDER_STATUS', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'VARCHAR(20)', ORDER: 10, ISNULLABLE: false, DESCRIPTION: 'Order status: PENDING, SHIPPED, DELIVERED, CANCELLED' },
  { GUID: generateGuid('col'), NAME: 'PAYMENT_METHOD', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'VARCHAR(30)', ORDER: 11, ISNULLABLE: true, DESCRIPTION: 'Payment method used' },
  { GUID: generateGuid('col'), NAME: 'CHANNEL', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'VARCHAR(20)', ORDER: 12, ISNULLABLE: true, DESCRIPTION: 'Sales channel: WEB, MOBILE, STORE' },
  { GUID: generateGuid('col'), NAME: 'CREATED_AT', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'TIMESTAMP_NTZ', ORDER: 13, ISNULLABLE: false, DESCRIPTION: 'Order creation timestamp' },
  { GUID: generateGuid('col'), NAME: 'UPDATED_AT', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'TIMESTAMP_NTZ', ORDER: 14, ISNULLABLE: false, DESCRIPTION: 'Last update timestamp' },
  { GUID: generateGuid('col'), NAME: 'ETL_LOADED_AT', TYPENAME: 'Column', TABLENAME: 'FACT_ORDERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/FACT_ORDERS`, DATATYPE: 'TIMESTAMP_NTZ', ORDER: 15, ISNULLABLE: false, DESCRIPTION: 'ETL load timestamp' },

  // DIM_CUSTOMERS columns
  { GUID: generateGuid('col'), NAME: 'CUSTOMER_KEY', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'NUMBER(38,0)', ORDER: 1, ISPRIMARYKEY: true, ISNULLABLE: false, DESCRIPTION: 'Surrogate key for customer dimension' },
  { GUID: generateGuid('col'), NAME: 'CUSTOMER_ID', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'VARCHAR(36)', ORDER: 2, ISNULLABLE: false, DESCRIPTION: 'Natural key from source system' },
  { GUID: generateGuid('col'), NAME: 'EMAIL_HASH', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'VARCHAR(64)', ORDER: 3, ISNULLABLE: true, DESCRIPTION: 'Hashed email for privacy (SHA-256)' },
  { GUID: generateGuid('col'), NAME: 'FIRST_NAME', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'VARCHAR(100)', ORDER: 4, ISNULLABLE: true, DESCRIPTION: 'Customer first name' },
  { GUID: generateGuid('col'), NAME: 'LAST_NAME', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'VARCHAR(100)', ORDER: 5, ISNULLABLE: true, DESCRIPTION: 'Customer last name' },
  { GUID: generateGuid('col'), NAME: 'CUSTOMER_SEGMENT', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'VARCHAR(30)', ORDER: 6, ISNULLABLE: true, DESCRIPTION: 'Customer segment: PREMIUM, STANDARD, NEW' },
  { GUID: generateGuid('col'), NAME: 'CITY', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'VARCHAR(100)', ORDER: 7, ISNULLABLE: true, DESCRIPTION: 'City' },
  { GUID: generateGuid('col'), NAME: 'STATE', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'VARCHAR(50)', ORDER: 8, ISNULLABLE: true, DESCRIPTION: 'State/Province' },
  { GUID: generateGuid('col'), NAME: 'COUNTRY', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'VARCHAR(50)', ORDER: 9, ISNULLABLE: true, DESCRIPTION: 'Country code (ISO 3166-1 alpha-2)' },
  { GUID: generateGuid('col'), NAME: 'SIGNUP_DATE', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'DATE', ORDER: 10, ISNULLABLE: true, DESCRIPTION: 'Customer signup date' },
  { GUID: generateGuid('col'), NAME: 'LIFETIME_VALUE', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'NUMBER(18,2)', ORDER: 11, ISNULLABLE: true, DESCRIPTION: 'Calculated lifetime value' },
  { GUID: generateGuid('col'), NAME: 'IS_ACTIVE', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'BOOLEAN', ORDER: 12, ISNULLABLE: false, DESCRIPTION: 'Whether customer account is active' },
  { GUID: generateGuid('col'), NAME: 'VALID_FROM', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'TIMESTAMP_NTZ', ORDER: 17, ISNULLABLE: false, DESCRIPTION: 'SCD Type 2 valid from timestamp' },
  { GUID: generateGuid('col'), NAME: 'VALID_TO', TYPENAME: 'Column', TABLENAME: 'DIM_CUSTOMERS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_CUSTOMERS`, DATATYPE: 'TIMESTAMP_NTZ', ORDER: 18, ISNULLABLE: true, DESCRIPTION: 'SCD Type 2 valid to timestamp (null = current)' },

  // DIM_PRODUCTS columns
  { GUID: generateGuid('col'), NAME: 'PRODUCT_KEY', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'NUMBER(38,0)', ORDER: 1, ISPRIMARYKEY: true, ISNULLABLE: false, DESCRIPTION: 'Surrogate key for product dimension' },
  { GUID: generateGuid('col'), NAME: 'PRODUCT_ID', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'VARCHAR(36)', ORDER: 2, ISNULLABLE: false, DESCRIPTION: 'Natural key from inventory system' },
  { GUID: generateGuid('col'), NAME: 'PRODUCT_NAME', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'VARCHAR(500)', ORDER: 3, ISNULLABLE: false, DESCRIPTION: 'Product display name' },
  { GUID: generateGuid('col'), NAME: 'SKU', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'VARCHAR(50)', ORDER: 4, ISNULLABLE: false, DESCRIPTION: 'Stock keeping unit' },
  { GUID: generateGuid('col'), NAME: 'CATEGORY_L1', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'VARCHAR(100)', ORDER: 5, ISNULLABLE: true, DESCRIPTION: 'Top-level product category' },
  { GUID: generateGuid('col'), NAME: 'CATEGORY_L2', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'VARCHAR(100)', ORDER: 6, ISNULLABLE: true, DESCRIPTION: 'Second-level product category' },
  { GUID: generateGuid('col'), NAME: 'BRAND', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'VARCHAR(100)', ORDER: 7, ISNULLABLE: true, DESCRIPTION: 'Product brand' },
  { GUID: generateGuid('col'), NAME: 'UNIT_PRICE', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'NUMBER(18,2)', ORDER: 8, ISNULLABLE: false, DESCRIPTION: 'Current unit price in USD' },
  { GUID: generateGuid('col'), NAME: 'UNIT_COST', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'NUMBER(18,2)', ORDER: 9, ISNULLABLE: true, DESCRIPTION: 'Unit cost (COGS)' },
  { GUID: generateGuid('col'), NAME: 'IS_ACTIVE', TYPENAME: 'Column', TABLENAME: 'DIM_PRODUCTS', TABLEQUALIFIEDNAME: `${DB_QN}/MARTS/DIM_PRODUCTS`, DATATYPE: 'BOOLEAN', ORDER: 10, ISNULLABLE: false, DESCRIPTION: 'Whether product is currently active' },
];

// =============================================================================
// PROCESSES (Lineage)
// =============================================================================

export const DEMO_PROCESSES = [
  {
    GUID: generateGuid('proc'),
    NAME: 'Load_STG_ORDERS',
    TYPENAME: 'Process',
    QUALIFIEDNAME: `${DB_QN}/process/Load_STG_ORDERS`,
    INPUTS: [{ guid: DEMO_TABLES[0].GUID, qualifiedName: DEMO_TABLES[0].QUALIFIEDNAME, typeName: 'Table' }],
    OUTPUTS: [{ guid: DEMO_TABLES[3].GUID, qualifiedName: DEMO_TABLES[3].QUALIFIEDNAME, typeName: 'Table' }],
    SQL: 'INSERT INTO STAGING.STG_ORDERS SELECT * FROM RAW_ECOMMERCE.RAW_ORDERS WHERE ...',
    DESCRIPTION: 'Load and clean raw orders into staging',
    CREATETIME: daysAgo(280),
    UPDATETIME: hoursAgo(2),
  },
  {
    GUID: generateGuid('proc'),
    NAME: 'Load_STG_CUSTOMERS',
    TYPENAME: 'Process',
    QUALIFIEDNAME: `${DB_QN}/process/Load_STG_CUSTOMERS`,
    INPUTS: [{ guid: DEMO_TABLES[1].GUID, qualifiedName: DEMO_TABLES[1].QUALIFIEDNAME, typeName: 'Table' }],
    OUTPUTS: [{ guid: DEMO_TABLES[4].GUID, qualifiedName: DEMO_TABLES[4].QUALIFIEDNAME, typeName: 'Table' }],
    SQL: 'INSERT INTO STAGING.STG_CUSTOMERS SELECT ..., SHA2(email) as EMAIL_HASH FROM RAW_ECOMMERCE.RAW_CUSTOMERS',
    DESCRIPTION: 'Load customers with PII masking',
    CREATETIME: daysAgo(280),
    UPDATETIME: hoursAgo(2),
  },
  {
    GUID: generateGuid('proc'),
    NAME: 'Build_FACT_ORDERS',
    TYPENAME: 'Process',
    QUALIFIEDNAME: `${DB_QN}/process/Build_FACT_ORDERS`,
    INPUTS: [
      { guid: DEMO_TABLES[3].GUID, qualifiedName: DEMO_TABLES[3].QUALIFIEDNAME, typeName: 'Table' },
      { guid: DEMO_TABLES[4].GUID, qualifiedName: DEMO_TABLES[4].QUALIFIEDNAME, typeName: 'Table' },
    ],
    OUTPUTS: [{ guid: DEMO_TABLES[5].GUID, qualifiedName: DEMO_TABLES[5].QUALIFIEDNAME, typeName: 'Table' }],
    SQL: 'CREATE OR REPLACE TABLE MARTS.FACT_ORDERS AS SELECT o.*, c.customer_key, p.product_key FROM STG_ORDERS o JOIN ...',
    DESCRIPTION: 'Build fact table joining staging tables',
    CREATETIME: daysAgo(250),
    UPDATETIME: hoursAgo(1),
  },
  {
    GUID: generateGuid('proc'),
    NAME: 'Build_DIM_CUSTOMERS',
    TYPENAME: 'Process',
    QUALIFIEDNAME: `${DB_QN}/process/Build_DIM_CUSTOMERS`,
    INPUTS: [{ guid: DEMO_TABLES[4].GUID, qualifiedName: DEMO_TABLES[4].QUALIFIEDNAME, typeName: 'Table' }],
    OUTPUTS: [{ guid: DEMO_TABLES[7].GUID, qualifiedName: DEMO_TABLES[7].QUALIFIEDNAME, typeName: 'Table' }],
    SQL: 'MERGE INTO MARTS.DIM_CUSTOMERS target USING STG_CUSTOMERS source ON ...',
    DESCRIPTION: 'Build customer dimension with SCD Type 2',
    CREATETIME: daysAgo(250),
    UPDATETIME: hoursAgo(2),
  },
  {
    GUID: generateGuid('proc'),
    NAME: 'Aggregate_Daily_Sales',
    TYPENAME: 'Process',
    QUALIFIEDNAME: `${DB_QN}/process/Aggregate_Daily_Sales`,
    INPUTS: [{ guid: DEMO_TABLES[5].GUID, qualifiedName: DEMO_TABLES[5].QUALIFIEDNAME, typeName: 'Table' }],
    OUTPUTS: [{ guid: DEMO_TABLES[6].GUID, qualifiedName: DEMO_TABLES[6].QUALIFIEDNAME, typeName: 'Table' }],
    SQL: 'CREATE OR REPLACE TABLE MARTS.FACT_DAILY_SALES AS SELECT order_date_key, SUM(order_amount) as total_revenue, COUNT(*) as order_count FROM FACT_ORDERS GROUP BY ...',
    DESCRIPTION: 'Daily aggregation of sales metrics',
    CREATETIME: daysAgo(200),
    UPDATETIME: hoursAgo(1),
  },
  {
    GUID: generateGuid('proc'),
    NAME: 'Weekly_Revenue_Rollup',
    TYPENAME: 'Process',
    QUALIFIEDNAME: `${DB_QN}/process/Weekly_Revenue_Rollup`,
    INPUTS: [{ guid: DEMO_TABLES[6].GUID, qualifiedName: DEMO_TABLES[6].QUALIFIEDNAME, typeName: 'Table' }],
    OUTPUTS: [{ guid: DEMO_TABLES[10].GUID, qualifiedName: DEMO_TABLES[10].QUALIFIEDNAME, typeName: 'Table' }],
    SQL: 'CREATE OR REPLACE TABLE ANALYTICS.AGG_WEEKLY_REVENUE AS SELECT DATE_TRUNC(\'WEEK\', order_date) as week_start, SUM(total_revenue) FROM FACT_DAILY_SALES ...',
    DESCRIPTION: 'Weekly revenue rollup for trend analysis',
    CREATETIME: daysAgo(150),
    UPDATETIME: hoursAgo(1),
  },
];

// =============================================================================
// GLOSSARY
// =============================================================================

export const DEMO_GLOSSARIES = [
  {
    GUID: generateGuid('gloss'),
    NAME: 'ACME Business Glossary',
    TYPENAME: 'AtlasGlossary',
    QUALIFIEDNAME: 'acme-business-glossary',
    SHORTDESCRIPTION: 'Official business terminology for ACME Analytics',
    LONGDESCRIPTION: 'This glossary contains standardized definitions for business metrics, dimensions, and key performance indicators used across the organization.',
    LANGUAGE: 'en',
    OWNERUSERS: ['lisa.zhang@acme-demo.com'],
    OWNERGROUPS: ['data-governance'],
    CREATETIME: daysAgo(365),
    UPDATETIME: daysAgo(7),
  },
];

export const DEMO_GLOSSARY_CATEGORIES = [
  {
    GUID: generateGuid('cat'),
    NAME: 'Financial Metrics',
    TYPENAME: 'AtlasGlossaryCategory',
    QUALIFIEDNAME: 'acme-business-glossary/Financial_Metrics',
    ANCHOR: { guid: DEMO_GLOSSARIES[0].GUID, typeName: 'AtlasGlossary' },
    SHORTDESCRIPTION: 'Revenue, cost, and profitability metrics',
    OWNERUSERS: ['emma.wilson@acme-demo.com'],
    CREATETIME: daysAgo(300),
    UPDATETIME: daysAgo(14),
  },
  {
    GUID: generateGuid('cat'),
    NAME: 'Customer Metrics',
    TYPENAME: 'AtlasGlossaryCategory',
    QUALIFIEDNAME: 'acme-business-glossary/Customer_Metrics',
    ANCHOR: { guid: DEMO_GLOSSARIES[0].GUID, typeName: 'AtlasGlossary' },
    SHORTDESCRIPTION: 'Customer-related KPIs and dimensions',
    OWNERUSERS: ['sarah.johnson@acme-demo.com'],
    CREATETIME: daysAgo(300),
    UPDATETIME: daysAgo(14),
  },
  {
    GUID: generateGuid('cat'),
    NAME: 'Product Metrics',
    TYPENAME: 'AtlasGlossaryCategory',
    QUALIFIEDNAME: 'acme-business-glossary/Product_Metrics',
    ANCHOR: { guid: DEMO_GLOSSARIES[0].GUID, typeName: 'AtlasGlossary' },
    SHORTDESCRIPTION: 'Product performance and inventory metrics',
    OWNERUSERS: ['david.kim@acme-demo.com'],
    CREATETIME: daysAgo(280),
    UPDATETIME: daysAgo(21),
  },
];

export const DEMO_GLOSSARY_TERMS = [
  {
    GUID: generateGuid('term'),
    NAME: 'Revenue',
    TYPENAME: 'AtlasGlossaryTerm',
    QUALIFIEDNAME: 'acme-business-glossary/Revenue',
    ANCHOR: { guid: DEMO_GLOSSARIES[0].GUID, typeName: 'AtlasGlossary' },
    CATEGORIES: [DEMO_GLOSSARY_CATEGORIES[0].GUID],
    SHORTDESCRIPTION: 'Total revenue from sales transactions',
    LONGDESCRIPTION: 'Revenue is calculated as the sum of all order amounts before returns and refunds. It includes product sales, shipping fees, and any service charges. Revenue does not include taxes collected.',
    EXAMPLES: 'Daily Revenue = SUM(FACT_ORDERS.ORDER_AMOUNT) for a given date',
    USAGE: 'Use for all financial reporting and executive dashboards',
    ABBREVIATION: 'REV',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['emma.wilson@acme-demo.com'],
    ASSIGNEDENTITIES: [DEMO_COLUMNS[4].GUID], // ORDER_AMOUNT column
    CREATETIME: daysAgo(300),
    UPDATETIME: daysAgo(7),
  },
  {
    GUID: generateGuid('term'),
    NAME: 'Gross Margin',
    TYPENAME: 'AtlasGlossaryTerm',
    QUALIFIEDNAME: 'acme-business-glossary/Gross_Margin',
    ANCHOR: { guid: DEMO_GLOSSARIES[0].GUID, typeName: 'AtlasGlossary' },
    CATEGORIES: [DEMO_GLOSSARY_CATEGORIES[0].GUID],
    SHORTDESCRIPTION: 'Revenue minus cost of goods sold',
    LONGDESCRIPTION: 'Gross Margin = Revenue - COGS. Expressed as a percentage: Gross Margin % = (Revenue - COGS) / Revenue * 100',
    EXAMPLES: 'If Revenue = $100 and COGS = $60, Gross Margin = $40 (40%)',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['emma.wilson@acme-demo.com'],
    CREATETIME: daysAgo(290),
    UPDATETIME: daysAgo(14),
  },
  {
    GUID: generateGuid('term'),
    NAME: 'Customer Lifetime Value',
    TYPENAME: 'AtlasGlossaryTerm',
    QUALIFIEDNAME: 'acme-business-glossary/CLV',
    ANCHOR: { guid: DEMO_GLOSSARIES[0].GUID, typeName: 'AtlasGlossary' },
    CATEGORIES: [DEMO_GLOSSARY_CATEGORIES[1].GUID],
    SHORTDESCRIPTION: 'Predicted total revenue from a customer relationship',
    LONGDESCRIPTION: 'CLV is a predictive metric estimating the total revenue a business can expect from a single customer account throughout the business relationship. Calculated using historical purchase data and ML prediction model.',
    EXAMPLES: 'A customer with CLV of $5,000 is expected to generate $5,000 in total revenue over their lifetime',
    ABBREVIATION: 'CLV',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['david.kim@acme-demo.com'],
    ASSIGNEDENTITIES: [DEMO_COLUMNS[26].GUID], // LIFETIME_VALUE column
    CREATETIME: daysAgo(200),
    UPDATETIME: daysAgo(30),
  },
  {
    GUID: generateGuid('term'),
    NAME: 'Customer Segment',
    TYPENAME: 'AtlasGlossaryTerm',
    QUALIFIEDNAME: 'acme-business-glossary/Customer_Segment',
    ANCHOR: { guid: DEMO_GLOSSARIES[0].GUID, typeName: 'AtlasGlossary' },
    CATEGORIES: [DEMO_GLOSSARY_CATEGORIES[1].GUID],
    SHORTDESCRIPTION: 'Customer categorization based on behavior and value',
    LONGDESCRIPTION: 'Customers are segmented into: PREMIUM (top 10% by CLV), STANDARD (middle 60%), NEW (< 90 days since signup)',
    EXAMPLES: 'PREMIUM customers get priority support and exclusive offers',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['sarah.johnson@acme-demo.com'],
    ASSIGNEDENTITIES: [DEMO_COLUMNS[20].GUID], // CUSTOMER_SEGMENT column
    CREATETIME: daysAgo(250),
    UPDATETIME: daysAgo(14),
  },
  {
    GUID: generateGuid('term'),
    NAME: 'Average Order Value',
    TYPENAME: 'AtlasGlossaryTerm',
    QUALIFIEDNAME: 'acme-business-glossary/AOV',
    ANCHOR: { guid: DEMO_GLOSSARIES[0].GUID, typeName: 'AtlasGlossary' },
    CATEGORIES: [DEMO_GLOSSARY_CATEGORIES[0].GUID],
    SHORTDESCRIPTION: 'Average revenue per order',
    LONGDESCRIPTION: 'AOV = Total Revenue / Number of Orders. A key metric for measuring purchasing behavior and marketing effectiveness.',
    EXAMPLES: 'If total revenue is $100,000 from 1,000 orders, AOV = $100',
    ABBREVIATION: 'AOV',
    STATUS: 'ACTIVE',
    OWNERUSERS: ['emma.wilson@acme-demo.com'],
    CREATETIME: daysAgo(280),
    UPDATETIME: daysAgo(7),
  },
];

// =============================================================================
// DATA DOMAINS (Data Mesh)
// =============================================================================

export const DEMO_DATA_DOMAINS = [
  {
    GUID: generateGuid('domain'),
    NAME: 'Sales',
    TYPENAME: 'DataDomain',
    QUALIFIEDNAME: 'default/domain/sales',
    DESCRIPTION: 'Sales and order management domain',
    OWNERUSERS: ['sarah.johnson@acme-demo.com'],
    OWNERGROUPS: ['analytics-team'],
    CREATETIME: daysAgo(180),
    UPDATETIME: daysAgo(7),
  },
  {
    GUID: generateGuid('domain'),
    NAME: 'Customer',
    TYPENAME: 'DataDomain',
    QUALIFIEDNAME: 'default/domain/customer',
    DESCRIPTION: 'Customer data and analytics domain',
    OWNERUSERS: ['david.kim@acme-demo.com'],
    OWNERGROUPS: ['data-science'],
    CREATETIME: daysAgo(180),
    UPDATETIME: daysAgo(14),
  },
  {
    GUID: generateGuid('domain'),
    NAME: 'Product',
    TYPENAME: 'DataDomain',
    QUALIFIEDNAME: 'default/domain/product',
    DESCRIPTION: 'Product catalog and inventory domain',
    OWNERUSERS: ['mike.patel@acme-demo.com'],
    OWNERGROUPS: ['data-engineering'],
    CREATETIME: daysAgo(150),
    UPDATETIME: daysAgo(21),
  },
];

// =============================================================================
// TAGS (Classifications)
// =============================================================================

export const DEMO_TAGS = [
  { ENTITYGUID: DEMO_COLUMNS[17].GUID, TAGNAME: 'PII', PROPAGATE: true }, // EMAIL_HASH
  { ENTITYGUID: DEMO_COLUMNS[18].GUID, TAGNAME: 'PII', PROPAGATE: true }, // FIRST_NAME
  { ENTITYGUID: DEMO_COLUMNS[19].GUID, TAGNAME: 'PII', PROPAGATE: true }, // LAST_NAME
  { ENTITYGUID: DEMO_TABLES[5].GUID, TAGNAME: 'Gold', PROPAGATE: false }, // FACT_ORDERS
  { ENTITYGUID: DEMO_TABLES[6].GUID, TAGNAME: 'Gold', PROPAGATE: false }, // FACT_DAILY_SALES
  { ENTITYGUID: DEMO_TABLES[7].GUID, TAGNAME: 'Gold', PROPAGATE: false }, // DIM_CUSTOMERS
  { ENTITYGUID: DEMO_TABLES[3].GUID, TAGNAME: 'Silver', PROPAGATE: false }, // STG_ORDERS
  { ENTITYGUID: DEMO_TABLES[0].GUID, TAGNAME: 'Bronze', PROPAGATE: false }, // RAW_ORDERS
  { ENTITYGUID: DEMO_COLUMNS[4].GUID, TAGNAME: 'Sensitive', PROPAGATE: true }, // ORDER_AMOUNT
];

// =============================================================================
// LINEAGE VISUALIZATION DATA
// =============================================================================

export const DEMO_LINEAGE_DATA = {
  nodes: [
    { id: DEMO_TABLES[0].GUID, label: 'RAW_ORDERS', type: 'table', schema: 'RAW_ECOMMERCE' },
    { id: DEMO_TABLES[1].GUID, label: 'RAW_CUSTOMERS', type: 'table', schema: 'RAW_ECOMMERCE' },
    { id: DEMO_TABLES[2].GUID, label: 'RAW_PRODUCTS', type: 'table', schema: 'RAW_ECOMMERCE' },
    { id: DEMO_PROCESSES[0].GUID, label: 'Load_STG_ORDERS', type: 'process' },
    { id: DEMO_PROCESSES[1].GUID, label: 'Load_STG_CUSTOMERS', type: 'process' },
    { id: DEMO_TABLES[3].GUID, label: 'STG_ORDERS', type: 'table', schema: 'STAGING' },
    { id: DEMO_TABLES[4].GUID, label: 'STG_CUSTOMERS', type: 'table', schema: 'STAGING' },
    { id: DEMO_PROCESSES[2].GUID, label: 'Build_FACT_ORDERS', type: 'process' },
    { id: DEMO_PROCESSES[3].GUID, label: 'Build_DIM_CUSTOMERS', type: 'process' },
    { id: DEMO_TABLES[5].GUID, label: 'FACT_ORDERS', type: 'table', schema: 'MARTS' },
    { id: DEMO_TABLES[7].GUID, label: 'DIM_CUSTOMERS', type: 'table', schema: 'MARTS' },
    { id: DEMO_PROCESSES[4].GUID, label: 'Aggregate_Daily_Sales', type: 'process' },
    { id: DEMO_TABLES[6].GUID, label: 'FACT_DAILY_SALES', type: 'table', schema: 'MARTS' },
    { id: DEMO_PROCESSES[5].GUID, label: 'Weekly_Revenue_Rollup', type: 'process' },
    { id: DEMO_TABLES[10].GUID, label: 'AGG_WEEKLY_REVENUE', type: 'table', schema: 'ANALYTICS' },
  ],
  edges: [
    { from: DEMO_TABLES[0].GUID, to: DEMO_PROCESSES[0].GUID },
    { from: DEMO_PROCESSES[0].GUID, to: DEMO_TABLES[3].GUID },
    { from: DEMO_TABLES[1].GUID, to: DEMO_PROCESSES[1].GUID },
    { from: DEMO_PROCESSES[1].GUID, to: DEMO_TABLES[4].GUID },
    { from: DEMO_TABLES[3].GUID, to: DEMO_PROCESSES[2].GUID },
    { from: DEMO_TABLES[4].GUID, to: DEMO_PROCESSES[2].GUID },
    { from: DEMO_PROCESSES[2].GUID, to: DEMO_TABLES[5].GUID },
    { from: DEMO_TABLES[4].GUID, to: DEMO_PROCESSES[3].GUID },
    { from: DEMO_PROCESSES[3].GUID, to: DEMO_TABLES[7].GUID },
    { from: DEMO_TABLES[5].GUID, to: DEMO_PROCESSES[4].GUID },
    { from: DEMO_PROCESSES[4].GUID, to: DEMO_TABLES[6].GUID },
    { from: DEMO_TABLES[6].GUID, to: DEMO_PROCESSES[5].GUID },
    { from: DEMO_PROCESSES[5].GUID, to: DEMO_TABLES[10].GUID },
  ],
  metadata: {
    tableName: 'FACT_ORDERS',
    tableGuid: DEMO_TABLES[5].GUID,
    upstreamCount: 4,
    downstreamCount: 3,
    processCount: 6,
  },
};

// =============================================================================
// CONNECTION STATUS
// =============================================================================

export const DEMO_CONNECTION_STATUS = {
  isConnected: true,
  database: DEMO_DATABASE,
  schema: DEMO_SCHEMA,
  user: 'demo_user@acme-demo.com',
  role: 'ANALYST',
  warehouse: 'ACME_ANALYTICS_WH',
  account: DEMO_COMPANY.snowflakeAccount,
  isDemoMode: true,
};

// =============================================================================
// QUERY RESULTS SIMULATION
// =============================================================================

export const DEMO_QUERY_RESULTS = {
  'SHOW TABLES': {
    columns: ['name', 'database_name', 'schema_name', 'kind', 'row_count'],
    rows: DEMO_ENTITY_TABLES.map(t => [t.TABLE_NAME, DEMO_DATABASE, DEMO_SCHEMA, t.TABLE_TYPE, t.ROW_COUNT]),
    rowCount: DEMO_ENTITY_TABLES.length,
  },
  'SELECT * FROM TABLE_ENTITY': {
    columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'DATABASENAME', 'SCHEMANAME', 'ROWCOUNT', 'COLUMNCOUNT', 'QUERYCOUNT', 'POPULARITYSCORE', 'DESCRIPTION', 'STATUS', 'CREATETIME', 'UPDATETIME'],
    rows: DEMO_TABLES.map(t => [
      t.GUID, t.NAME, t.TYPENAME, t.QUALIFIEDNAME, t.DATABASENAME, t.SCHEMANAME,
      t.ROWCOUNT, t.COLUMNCOUNT, t.QUERYCOUNT, t.POPULARITYSCORE, t.DESCRIPTION,
      t.STATUS, t.CREATETIME, t.UPDATETIME
    ]),
    rowCount: DEMO_TABLES.length,
  },
  'SELECT * FROM COLUMN_ENTITY': {
    columns: ['GUID', 'NAME', 'TYPENAME', 'TABLENAME', 'TABLEQUALIFIEDNAME', 'DATATYPE', 'ORDER', 'ISPRIMARYKEY', 'ISFOREIGNKEY', 'ISNULLABLE', 'DESCRIPTION'],
    rows: DEMO_COLUMNS.map(c => [
      c.GUID, c.NAME, c.TYPENAME, c.TABLENAME, c.TABLEQUALIFIEDNAME, c.DATATYPE,
      c.ORDER, c.ISPRIMARYKEY || false, c.ISFOREIGNKEY || false, c.ISNULLABLE, c.DESCRIPTION
    ]),
    rowCount: DEMO_COLUMNS.length,
  },
  'SELECT * FROM PROCESS_ENTITY': {
    columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'INPUTS', 'OUTPUTS', 'SQL', 'DESCRIPTION', 'CREATETIME', 'UPDATETIME'],
    rows: DEMO_PROCESSES.map(p => [
      p.GUID, p.NAME, p.TYPENAME, p.QUALIFIEDNAME,
      JSON.stringify(p.INPUTS), JSON.stringify(p.OUTPUTS),
      p.SQL, p.DESCRIPTION, p.CREATETIME, p.UPDATETIME
    ]),
    rowCount: DEMO_PROCESSES.length,
  },
  'SELECT * FROM ATLASGLOSSARYTERM_ENTITY': {
    columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'SHORTDESCRIPTION', 'LONGDESCRIPTION', 'EXAMPLES', 'ABBREVIATION', 'STATUS', 'ANCHOR', 'CATEGORIES'],
    rows: DEMO_GLOSSARY_TERMS.map(t => [
      t.GUID, t.NAME, t.TYPENAME, t.QUALIFIEDNAME, t.SHORTDESCRIPTION, t.LONGDESCRIPTION,
      t.EXAMPLES, t.ABBREVIATION, t.STATUS, JSON.stringify(t.ANCHOR), JSON.stringify(t.CATEGORIES)
    ]),
    rowCount: DEMO_GLOSSARY_TERMS.length,
  },
};

// =============================================================================
// SAMPLE ENTITIES EXPORT (for backward compatibility)
// =============================================================================

export const DEMO_SAMPLE_ENTITIES = {
  tables: DEMO_TABLES,
  columns: DEMO_COLUMNS,
  processes: DEMO_PROCESSES,
  terms: DEMO_GLOSSARY_TERMS,
  glossaries: DEMO_GLOSSARIES,
  categories: DEMO_GLOSSARY_CATEGORIES,
  domains: DEMO_DATA_DOMAINS,
  tags: DEMO_TAGS,
  loaded: true,
  loading: false,
};

// =============================================================================
// DEMO QUERY ENGINE - Simulates SQL queries against demo data
// =============================================================================

// Demo query logger - only warn for unrecognized patterns
const demoLog = {
  info: () => {},
  warn: (msg, data) => {
    // Only log unrecognized queries to help debug
    if (msg === 'Unrecognized query pattern') {
      console.warn(`🎭 [DemoQuery] ⚠️ ${msg}`, data || '');
    }
  },
  error: (msg, data) => console.error(`🎭 [DemoQuery] ❌ ${msg}`, data || ''),
  debug: () => {},
};

/**
 * Execute a SQL query against demo data
 * This provides a mock backend for demo mode that returns realistic results
 *
 * @param {string} sql - The SQL query to execute
 * @returns {Object} Query results with columns, rows, and rowCount
 */
export function executeDemoQuery(sql) {
  const upperSql = sql.toUpperCase().trim();
  demoLog.info('Executing query', { sqlPreview: sql.substring(0, 100), sqlLength: sql.length });

  // Helper to log and return results
  const returnResult = (matchType, result) => {
    demoLog.info(`✅ Matched: ${matchType}`, { rowCount: result.rowCount, columns: result.columns.length });
    return result;
  };

  // INFORMATION_SCHEMA queries
  if (upperSql.includes('INFORMATION_SCHEMA.TABLES')) {
    return returnResult('INFORMATION_SCHEMA.TABLES', {
      columns: ['TABLE_NAME', 'TABLE_TYPE', 'ROW_COUNT', 'BYTES'],
      rows: DEMO_ENTITY_TABLES.map(t => [t.TABLE_NAME, t.TABLE_TYPE, t.ROW_COUNT, t.BYTES]),
      rowCount: DEMO_ENTITY_TABLES.length,
    });
  }

  if (upperSql.includes('SHOW TABLES')) {
    return returnResult('SHOW TABLES', DEMO_QUERY_RESULTS['SHOW TABLES']);
  }

  // DATABASE_ENTITY queries
  if (upperSql.includes('DATABASE_ENTITY')) {
    return returnResult('DATABASE_ENTITY', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'CONNECTORNAME', 'SCHEMACOUNT', 'DESCRIPTION', 'OWNERUSERS', 'CREATETIME', 'UPDATETIME'],
      rows: DEMO_DATABASES.map(d => [
        d.GUID, d.NAME, d.TYPENAME, d.QUALIFIEDNAME, d.CONNECTORNAME, d.SCHEMACOUNT,
        d.DESCRIPTION, JSON.stringify(d.OWNERUSERS), d.CREATETIME, d.UPDATETIME
      ]),
      rowCount: DEMO_DATABASES.length,
    });
  }

  // SCHEMA_ENTITY queries
  if (upperSql.includes('SCHEMA_ENTITY')) {
    return returnResult('SCHEMA_ENTITY', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'DATABASEQUALIFIEDNAME', 'TABLECOUNT', 'VIEWCOUNT', 'DESCRIPTION', 'OWNERUSERS', 'CREATETIME', 'UPDATETIME'],
      rows: DEMO_SCHEMAS.map(s => [
        s.GUID, s.NAME, s.TYPENAME, s.QUALIFIEDNAME, s.DATABASEQUALIFIEDNAME, s.TABLECOUNT,
        s.VIEWCOUNT, s.DESCRIPTION, JSON.stringify(s.OWNERUSERS), s.CREATETIME, s.UPDATETIME
      ]),
      rowCount: DEMO_SCHEMAS.length,
    });
  }

  // TABLE_ENTITY queries
  if (upperSql.includes('TABLE_ENTITY')) {
    let data = DEMO_TABLES;
    demoLog.debug('TABLE_ENTITY query', { originalCount: DEMO_TABLES.length });

    // Handle LIMIT
    const limitMatch = upperSql.match(/LIMIT\s+(\d+)/);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1]);
      data = data.slice(0, limit);
      demoLog.debug('Applied LIMIT', { limit, newCount: data.length });
    }

    // Handle ORDER BY POPULARITYSCORE
    if (upperSql.includes('POPULARITYSCORE')) {
      data = [...data].sort((a, b) => (b.POPULARITYSCORE || 0) - (a.POPULARITYSCORE || 0));
      demoLog.debug('Applied ORDER BY POPULARITYSCORE');
    }

    // Handle WHERE HASLINEAGE
    if (upperSql.includes('HASLINEAGE')) {
      data = data.filter(t => t.HASLINEAGE === true);
      demoLog.debug('Applied WHERE HASLINEAGE', { filteredCount: data.length });
    }

    return returnResult('TABLE_ENTITY', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'DATABASENAME', 'SCHEMANAME', 'CONNECTORNAME', 'ROWCOUNT', 'COLUMNCOUNT', 'SIZEBYTES', 'QUERYCOUNT', 'QUERYUSERCOUNT', 'POPULARITYSCORE', 'DESCRIPTION', 'STATUS', 'CERTIFICATESTATUS', 'OWNERUSERS', 'OWNERGROUPS', 'CREATETIME', 'UPDATETIME', 'HASLINEAGE'],
      rows: data.map(t => [
        t.GUID, t.NAME, t.TYPENAME, t.QUALIFIEDNAME, t.DATABASENAME, t.SCHEMANAME, t.CONNECTORNAME,
        t.ROWCOUNT, t.COLUMNCOUNT, t.SIZEBYTES, t.QUERYCOUNT, t.QUERYUSERCOUNT, t.POPULARITYSCORE,
        t.DESCRIPTION, t.STATUS, t.CERTIFICATESTATUS, JSON.stringify(t.OWNERUSERS),
        JSON.stringify(t.OWNERGROUPS), t.CREATETIME, t.UPDATETIME, t.HASLINEAGE
      ]),
      rowCount: data.length,
    });
  }

  // COLUMN_ENTITY queries
  if (upperSql.includes('COLUMN_ENTITY')) {
    let data = DEMO_COLUMNS;
    demoLog.debug('COLUMN_ENTITY query', { originalCount: DEMO_COLUMNS.length });

    // Handle WHERE TABLENAME
    const tableMatch = upperSql.match(/TABLENAME\s*=\s*'([^']+)'/i);
    if (tableMatch) {
      const tableName = tableMatch[1];
      data = data.filter(c => c.TABLENAME.toUpperCase() === tableName.toUpperCase());
      demoLog.debug('Applied WHERE TABLENAME', { tableName, filteredCount: data.length });
    }

    return returnResult('COLUMN_ENTITY', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'TABLENAME', 'TABLEQUALIFIEDNAME', 'DATATYPE', 'ORDER', 'ISPRIMARYKEY', 'ISFOREIGNKEY', 'ISNULLABLE', 'DESCRIPTION'],
      rows: data.map(c => [
        c.GUID, c.NAME, c.TYPENAME, c.TABLENAME, c.TABLEQUALIFIEDNAME, c.DATATYPE,
        c.ORDER, c.ISPRIMARYKEY || false, c.ISFOREIGNKEY || false, c.ISNULLABLE, c.DESCRIPTION
      ]),
      rowCount: data.length,
    });
  }

  // PROCESS_ENTITY queries
  if (upperSql.includes('PROCESS_ENTITY')) {
    let data = DEMO_PROCESSES;
    demoLog.debug('PROCESS_ENTITY query', { originalCount: DEMO_PROCESSES.length });

    // Handle WHERE searching for specific GUID in INPUTS/OUTPUTS
    const guidMatch = upperSql.match(/GUID[^']*'([^']+)'/i) || upperSql.match(/LIKE\s*'%([^%]+)%'/i);
    if (guidMatch) {
      const searchGuid = guidMatch[1].toLowerCase();
      data = data.filter(p =>
        JSON.stringify(p.INPUTS).toLowerCase().includes(searchGuid) ||
        JSON.stringify(p.OUTPUTS).toLowerCase().includes(searchGuid)
      );
      demoLog.debug('Applied GUID search filter', { searchGuid, filteredCount: data.length });
    }

    return returnResult('PROCESS_ENTITY', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'INPUTS', 'OUTPUTS', 'SQL', 'DESCRIPTION', 'CREATETIME', 'UPDATETIME'],
      rows: data.map(p => [
        p.GUID, p.NAME, p.TYPENAME, p.QUALIFIEDNAME,
        JSON.stringify(p.INPUTS), JSON.stringify(p.OUTPUTS),
        p.SQL, p.DESCRIPTION, p.CREATETIME, p.UPDATETIME
      ]),
      rowCount: data.length,
    });
  }

  // ATLASGLOSSARY_ENTITY queries (not TERM or CATEGORY)
  if (upperSql.includes('ATLASGLOSSARY') && !upperSql.includes('ATLASGLOSSARYTERM') && !upperSql.includes('ATLASGLOSSARYCATEGORY')) {
    return returnResult('ATLASGLOSSARY', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'SHORTDESCRIPTION', 'LONGDESCRIPTION', 'LANGUAGE', 'OWNERUSERS', 'CREATETIME', 'UPDATETIME'],
      rows: DEMO_GLOSSARIES.map(g => [
        g.GUID, g.NAME, g.TYPENAME, g.QUALIFIEDNAME, g.SHORTDESCRIPTION, g.LONGDESCRIPTION,
        g.LANGUAGE, JSON.stringify(g.OWNERUSERS), g.CREATETIME, g.UPDATETIME
      ]),
      rowCount: DEMO_GLOSSARIES.length,
    });
  }

  // ATLASGLOSSARYTERM queries
  if (upperSql.includes('ATLASGLOSSARYTERM') || (upperSql.includes('GLOSSARY') && upperSql.includes('TERM'))) {
    return returnResult('ATLASGLOSSARYTERM', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'SHORTDESCRIPTION', 'LONGDESCRIPTION', 'EXAMPLES', 'ABBREVIATION', 'STATUS', 'ANCHOR', 'CATEGORIES', 'ASSIGNEDENTITIES', 'OWNERUSERS', 'CREATETIME', 'UPDATETIME'],
      rows: DEMO_GLOSSARY_TERMS.map(t => [
        t.GUID, t.NAME, t.TYPENAME, t.QUALIFIEDNAME, t.SHORTDESCRIPTION, t.LONGDESCRIPTION,
        t.EXAMPLES, t.ABBREVIATION, t.STATUS, JSON.stringify(t.ANCHOR), JSON.stringify(t.CATEGORIES),
        JSON.stringify(t.ASSIGNEDENTITIES), JSON.stringify(t.OWNERUSERS), t.CREATETIME, t.UPDATETIME
      ]),
      rowCount: DEMO_GLOSSARY_TERMS.length,
    });
  }

  // ATLASGLOSSARYCATEGORY queries
  if (upperSql.includes('ATLASGLOSSARYCATEGORY') || upperSql.includes('GLOSSARY_CATEGORY')) {
    return returnResult('ATLASGLOSSARYCATEGORY', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'SHORTDESCRIPTION', 'ANCHOR', 'OWNERUSERS', 'CREATETIME', 'UPDATETIME'],
      rows: DEMO_GLOSSARY_CATEGORIES.map(c => [
        c.GUID, c.NAME, c.TYPENAME, c.QUALIFIEDNAME, c.SHORTDESCRIPTION,
        JSON.stringify(c.ANCHOR), JSON.stringify(c.OWNERUSERS), c.CREATETIME, c.UPDATETIME
      ]),
      rowCount: DEMO_GLOSSARY_CATEGORIES.length,
    });
  }

  // DATADOMAIN_ENTITY queries
  if (upperSql.includes('DATADOMAIN')) {
    return returnResult('DATADOMAIN', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME', 'DESCRIPTION', 'PARENTDOMAINGUID', 'OWNERUSERS', 'OWNERGROUPS', 'CREATETIME', 'UPDATETIME'],
      rows: DEMO_DATA_DOMAINS.map(d => [
        d.GUID, d.NAME, d.TYPENAME, d.QUALIFIEDNAME, d.DESCRIPTION,
        d.PARENTDOMAINGUID, JSON.stringify(d.OWNERUSERS), JSON.stringify(d.OWNERGROUPS),
        d.CREATETIME, d.UPDATETIME
      ]),
      rowCount: DEMO_DATA_DOMAINS.length,
    });
  }

  // VIEW_ENTITY queries
  if (upperSql.includes('VIEW_ENTITY')) {
    demoLog.warn('VIEW_ENTITY not implemented - returning empty result');
    return returnResult('VIEW_ENTITY (empty)', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'QUALIFIEDNAME'],
      rows: [],
      rowCount: 0,
    });
  }

  // COLUMNPROCESS_ENTITY queries (column-level lineage)
  if (upperSql.includes('COLUMNPROCESS')) {
    demoLog.warn('COLUMNPROCESS_ENTITY not implemented - returning empty result');
    return returnResult('COLUMNPROCESS (empty)', {
      columns: ['GUID', 'NAME', 'TYPENAME', 'INPUTS', 'OUTPUTS'],
      rows: [],
      rowCount: 0,
    });
  }

  // QUERY_ENTITY queries
  if (upperSql.includes('QUERY_ENTITY')) {
    demoLog.warn('QUERY_ENTITY not implemented - returning empty result');
    return returnResult('QUERY_ENTITY (empty)', {
      columns: ['GUID', 'NAME', 'SQL', 'CREATETIME'],
      rows: [],
      rowCount: 0,
    });
  }

  // DBT queries
  if (upperSql.includes('DBTMODEL') || upperSql.includes('DBTTEST')) {
    demoLog.warn('DBT entities not implemented - returning empty result');
    return returnResult('DBT (empty)', {
      columns: ['GUID', 'NAME', 'TYPENAME'],
      rows: [],
      rowCount: 0,
    });
  }

  // Tableau queries
  if (upperSql.includes('TABLEAU')) {
    demoLog.warn('Tableau entities not implemented - returning empty result');
    return returnResult('Tableau (empty)', {
      columns: ['GUID', 'NAME', 'TYPENAME'],
      rows: [],
      rowCount: 0,
    });
  }

  // Airflow queries
  if (upperSql.includes('AIRFLOW')) {
    demoLog.warn('Airflow entities not implemented - returning empty result');
    return returnResult('Airflow (empty)', {
      columns: ['GUID', 'NAME', 'TYPENAME'],
      rows: [],
      rowCount: 0,
    });
  }

  // COUNT queries
  if (upperSql.includes('COUNT(')) {
    demoLog.debug('COUNT query detected');
    if (upperSql.includes('TABLE_ENTITY')) {
      return returnResult('COUNT(TABLE_ENTITY)', { columns: ['COUNT'], rows: [[DEMO_TABLES.length]], rowCount: 1 });
    }
    if (upperSql.includes('COLUMN_ENTITY')) {
      return returnResult('COUNT(COLUMN_ENTITY)', { columns: ['COUNT'], rows: [[DEMO_COLUMNS.length]], rowCount: 1 });
    }
    if (upperSql.includes('PROCESS_ENTITY')) {
      return returnResult('COUNT(PROCESS_ENTITY)', { columns: ['COUNT'], rows: [[DEMO_PROCESSES.length]], rowCount: 1 });
    }
    return returnResult('COUNT (generic)', { columns: ['COUNT'], rows: [[100]], rowCount: 1 });
  }

  // Default: return a helpful message with the unrecognized query
  demoLog.warn('Unrecognized query pattern', { sql: sql.substring(0, 200) });
  return {
    columns: ['MESSAGE', 'QUERY_PREVIEW'],
    rows: [[
      'Demo mode: Query pattern not recognized. Supported entities: TABLE_ENTITY, COLUMN_ENTITY, PROCESS_ENTITY, ATLASGLOSSARY, ATLASGLOSSARYTERM, ATLASGLOSSARYCATEGORY, DATABASE_ENTITY, SCHEMA_ENTITY, DATADOMAIN',
      sql.substring(0, 100)
    ]],
    rowCount: 1,
  };
}

// =============================================================================
// DEMO MODE CHECK
// =============================================================================

export function isDemoMode() {
  // v2.0_demo_only: Demo mode is ALWAYS ON in this branch
  // This is the demo-only version - no backend required
  return true;
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  // Company info
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
};
