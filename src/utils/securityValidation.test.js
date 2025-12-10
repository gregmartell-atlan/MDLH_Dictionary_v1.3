/**
 * Security Validation Tests
 * 
 * Test Plan: Section 6 - Security Tests
 * Priority: P0 (Critical)
 * 
 * Tests SQL injection prevention and input validation.
 */

import { describe, it, expect } from 'vitest';
import {
  isValidIdentifier,
  escapeIdentifier,
  escapeStringValue,
  buildSafeFQN,
  sanitizeIdentifier,
  validateEntityIdentifiers,
} from './queryHelpers';

describe('Security Validation (SEC-*)', () => {
  // ==========================================================================
  // SEC-001: SQL Injection - Basic
  // ==========================================================================
  describe('SEC-001: SQL injection - basic', () => {
    const basicInjections = [
      "'; DROP TABLE users;--",
      "TABLE; DROP TABLE users;--",
      "'; DELETE FROM assets; --",
      "1; DROP TABLE users--",
      "'; TRUNCATE TABLE data;--",
    ];

    it.each(basicInjections)('should reject: %s', (input) => {
      expect(isValidIdentifier(input)).toBe(false);
    });

    it('should throw when escaping dangerous input', () => {
      expect(() => escapeIdentifier("TABLE\0NAME")).toThrow();
    });
  });

  // ==========================================================================
  // SEC-002: SQL Injection - UNION
  // ==========================================================================
  describe('SEC-002: SQL injection - UNION', () => {
    const unionInjections = [
      "' UNION SELECT * FROM",
      "TABLE UNION SELECT password FROM users",
      "1 UNION ALL SELECT * FROM secrets",
      "id UNION SELECT credit_card FROM payments",
    ];

    it.each(unionInjections)('should reject: %s', (input) => {
      expect(isValidIdentifier(input)).toBe(false);
    });
  });

  // ==========================================================================
  // SEC-003: SQL Injection - Comments
  // ==========================================================================
  describe('SEC-003: SQL injection - comments', () => {
    const commentInjections = [
      "/**/UNION/**/SELECT",
      "TABLE/*comment*/NAME",
      "SELECT--comment",
      "TABLE/* */DROP",
    ];

    it.each(commentInjections)('should reject: %s', (input) => {
      expect(isValidIdentifier(input)).toBe(false);
    });
  });

  // ==========================================================================
  // SEC-005: Path Traversal
  // ==========================================================================
  describe('SEC-005: Path traversal', () => {
    const pathTraversals = [
      "../../../etc/passwd",
      "..\\..\\windows\\system32",
      "/etc/shadow",
      "file:///etc/passwd",
    ];

    it.each(pathTraversals)('should reject: %s', (input) => {
      expect(isValidIdentifier(input)).toBe(false);
    });
  });

  // ==========================================================================
  // SEC-006: Oversized Input
  // ==========================================================================
  describe('SEC-006: Oversized input', () => {
    it('should reject identifiers over 255 characters', () => {
      const longIdentifier = 'A'.repeat(256);
      expect(() => escapeIdentifier(longIdentifier)).toThrow(/exceeds maximum length/);
    });

    it('should accept identifiers at exactly 255 characters', () => {
      const maxIdentifier = 'A'.repeat(255);
      expect(() => escapeIdentifier(maxIdentifier)).not.toThrow();
    });
  });

  // ==========================================================================
  // BE-V-001: Valid Identifier
  // ==========================================================================
  describe('BE-V-001: Valid identifier', () => {
    const validIdentifiers = [
      'CUSTOMER_DIM',
      'TABLE_ENTITY',
      'my_table_123',
      '_PRIVATE_TABLE',
      'Table123',
    ];

    it.each(validIdentifiers)('should accept: %s', (input) => {
      expect(isValidIdentifier(input)).toBe(true);
    });
  });

  // ==========================================================================
  // BE-V-003: Invalid Characters
  // ==========================================================================
  describe('BE-V-003: Invalid characters', () => {
    const invalidChars = [
      'TABLE@NAME',
      'TABLE#NAME',
      'TABLE$NAME', // Note: $ may be valid in some DBs
      'TABLE!NAME',
      'TABLE NAME', // Space
      'TABLE\tNAME', // Tab
      'TABLE\nNAME', // Newline
    ];

    it.each(invalidChars)('should reject: %s', (input) => {
      expect(isValidIdentifier(input)).toBe(false);
    });
  });

  // ==========================================================================
  // BE-V-005: Empty Identifier
  // ==========================================================================
  describe('BE-V-005: Empty identifier', () => {
    it('should reject empty string', () => {
      expect(isValidIdentifier('')).toBe(false);
    });

    it('should reject null', () => {
      expect(isValidIdentifier(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidIdentifier(undefined)).toBe(false);
    });

    it('should throw when escaping empty string', () => {
      expect(() => escapeIdentifier('')).toThrow();
    });
  });

  // ==========================================================================
  // BE-V-007: Case Handling
  // ==========================================================================
  describe('BE-V-007: Case handling', () => {
    it('should accept lowercase identifiers', () => {
      expect(isValidIdentifier('customer_dim')).toBe(true);
    });

    it('should accept uppercase identifiers', () => {
      expect(isValidIdentifier('CUSTOMER_DIM')).toBe(true);
    });

    it('should accept mixed case identifiers', () => {
      expect(isValidIdentifier('Customer_Dim')).toBe(true);
    });
  });

  // ==========================================================================
  // String Value Escaping
  // ==========================================================================
  describe('String value escaping', () => {
    it('should escape single quotes', () => {
      const result = escapeStringValue("O'Reilly");
      expect(result).toBe("'O''Reilly'");
    });

    it('should handle null', () => {
      expect(escapeStringValue(null)).toBe('NULL');
    });

    it('should handle undefined', () => {
      expect(escapeStringValue(undefined)).toBe('NULL');
    });

    it('should convert numbers to strings', () => {
      expect(escapeStringValue(123)).toBe("'123'");
    });

    it('should reject null bytes', () => {
      expect(() => escapeStringValue("test\0value")).toThrow();
    });
  });

  // ==========================================================================
  // Safe FQN Building
  // ==========================================================================
  describe('Safe FQN building', () => {
    it('should build fully qualified name', () => {
      const fqn = buildSafeFQN('DATABASE', 'SCHEMA', 'TABLE');
      expect(fqn).toBe('DATABASE.SCHEMA.TABLE');
    });

    it('should quote identifiers when needed', () => {
      const fqn = buildSafeFQN('my-db', 'my-schema', 'my-table');
      expect(fqn).toContain('"');
    });

    it('should handle missing database', () => {
      const fqn = buildSafeFQN(null, 'SCHEMA', 'TABLE');
      expect(fqn).toBe('SCHEMA.TABLE');
    });

    it('should handle missing schema', () => {
      const fqn = buildSafeFQN('DATABASE', null, 'TABLE');
      expect(fqn).toBe('DATABASE.TABLE');
    });
  });

  // ==========================================================================
  // Identifier Sanitization
  // ==========================================================================
  describe('Identifier sanitization', () => {
    it('should remove dangerous characters', () => {
      const result = sanitizeIdentifier('TABLE@NAME#123');
      expect(result).not.toContain('@');
      expect(result).not.toContain('#');
    });

    it('should remove null bytes', () => {
      const result = sanitizeIdentifier('TABLE\0NAME');
      expect(result).not.toContain('\0');
    });

    it('should add underscore prefix if starts with number', () => {
      const result = sanitizeIdentifier('123TABLE');
      expect(result.charAt(0)).toBe('_');
    });

    it('should truncate to max length', () => {
      const longName = 'A'.repeat(300);
      const result = sanitizeIdentifier(longName);
      expect(result.length).toBeLessThanOrEqual(255);
    });
  });

  // ==========================================================================
  // Entity Validation
  // ==========================================================================
  describe('Entity identifier validation', () => {
    it('should validate clean entity', () => {
      const entity = {
        database: 'PROD',
        schema: 'PUBLIC',
        table: 'CUSTOMERS',
        guid: 'abc-123-def-456',
      };
      const result = validateEntityIdentifiers(entity);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect null bytes in fields', () => {
      const entity = {
        database: 'PROD\0',
        schema: 'PUBLIC',
        table: 'CUSTOMERS',
      };
      const result = validateEntityIdentifiers(entity);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('null byte'))).toBe(true);
    });

    it('should detect oversized fields', () => {
      const entity = {
        table: 'A'.repeat(300),
      };
      const result = validateEntityIdentifiers(entity);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('255'))).toBe(true);
    });

    it('should validate GUID format', () => {
      const entity = {
        guid: 'not-a-valid-guid!@#$',
      };
      const result = validateEntityIdentifiers(entity);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('guid'))).toBe(true);
    });

    it('should reject non-object input', () => {
      const result = validateEntityIdentifiers(null);
      expect(result.valid).toBe(false);
    });
  });
});


