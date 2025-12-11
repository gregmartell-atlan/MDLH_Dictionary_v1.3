/**
 * Result Formatters Test Suite
 * 
 * TDD: These tests are written BEFORE the implementation.
 * The implementation should make all tests pass.
 * 
 * Quality Gate: 85% coverage required
 */

import { describe, it, expect } from 'vitest';
import {
  formatCellValue,
  formatRelativeTime,
  formatNumber,
  isGuid,
  looksLikeTimestamp,
  getTypeIcon,
  formatArrayPreview,
  formatJsonPreview,
} from './resultFormatters';

describe('resultFormatters', () => {
  // ==========================================================================
  // isGuid - GUID Detection
  // ==========================================================================
  describe('isGuid', () => {
    it('should detect valid UUID v4 format', () => {
      expect(isGuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should detect valid UUID without hyphens', () => {
      expect(isGuid('550e8400e29b41d4a716446655440000')).toBe(true);
    });

    it('should detect uppercase GUIDs', () => {
      expect(isGuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('should reject non-GUID strings', () => {
      expect(isGuid('hello-world')).toBe(false);
      expect(isGuid('12345')).toBe(false);
      expect(isGuid('')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isGuid(null)).toBe(false);
      expect(isGuid(undefined)).toBe(false);
    });

    it('should reject strings that are too short or too long', () => {
      expect(isGuid('550e8400-e29b')).toBe(false);
      expect(isGuid('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false);
    });
  });

  // ==========================================================================
  // looksLikeTimestamp - Timestamp Detection
  // ==========================================================================
  describe('looksLikeTimestamp', () => {
    it('should detect ISO 8601 format', () => {
      expect(looksLikeTimestamp('2024-12-06T10:30:00Z')).toBe(true);
      expect(looksLikeTimestamp('2024-12-06T10:30:00.000Z')).toBe(true);
    });

    it('should detect ISO format with timezone offset', () => {
      expect(looksLikeTimestamp('2024-12-06T10:30:00+05:30')).toBe(true);
      expect(looksLikeTimestamp('2024-12-06T10:30:00-08:00')).toBe(true);
    });

    it('should detect date-only format', () => {
      expect(looksLikeTimestamp('2024-12-06')).toBe(true);
    });

    it('should detect Snowflake timestamp format', () => {
      expect(looksLikeTimestamp('2024-12-06 10:30:00.000')).toBe(true);
    });

    it('should reject non-timestamp strings', () => {
      expect(looksLikeTimestamp('hello world')).toBe(false);
      expect(looksLikeTimestamp('12345')).toBe(false);
      expect(looksLikeTimestamp('')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(looksLikeTimestamp(null)).toBe(false);
      expect(looksLikeTimestamp(undefined)).toBe(false);
    });
  });

  // ==========================================================================
  // formatRelativeTime - Human-Readable Time
  // ==========================================================================
  describe('formatRelativeTime', () => {
    it('should format seconds ago', () => {
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
      expect(formatRelativeTime(thirtySecondsAgo)).toBe('just now');
    });

    it('should format minutes ago', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago');
    });

    it('should format single minute', () => {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 1 * 60 * 1000);
      expect(formatRelativeTime(oneMinuteAgo)).toBe('1 minute ago');
    });

    it('should format hours ago', () => {
      const now = new Date();
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeHoursAgo)).toBe('3 hours ago');
    });

    it('should format days ago', () => {
      const now = new Date();
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoDaysAgo)).toBe('2 days ago');
    });

    it('should format weeks for older dates', () => {
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoWeeksAgo)).toBe('2 weeks ago');
    });

    it('should format months for very old dates', () => {
      const now = new Date();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoMonthsAgo)).toBe('2 months ago');
    });

    it('should handle invalid dates', () => {
      expect(formatRelativeTime(new Date('invalid'))).toBe('Invalid date');
      expect(formatRelativeTime(null)).toBe('Invalid date');
    });

    it('should handle string dates', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe('5 minutes ago');
    });
  });

  // ==========================================================================
  // formatNumber - Human-Readable Numbers
  // ==========================================================================
  describe('formatNumber', () => {
    it('should format small numbers as-is', () => {
      expect(formatNumber(42)).toBe('42');
      expect(formatNumber(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(formatNumber(1000)).toBe('1K');
      expect(formatNumber(1500)).toBe('1.5K');
      expect(formatNumber(12345)).toBe('12.3K');
    });

    it('should format millions with M suffix', () => {
      expect(formatNumber(1000000)).toBe('1M');
      expect(formatNumber(1500000)).toBe('1.5M');
      expect(formatNumber(12345678)).toBe('12.3M');
    });

    it('should format billions with B suffix', () => {
      expect(formatNumber(1000000000)).toBe('1B');
      expect(formatNumber(2500000000)).toBe('2.5B');
    });

    it('should format bytes with appropriate units', () => {
      expect(formatNumber(1024, 'bytes')).toBe('1 KB');
      expect(formatNumber(1048576, 'bytes')).toBe('1 MB');
      expect(formatNumber(1073741824, 'bytes')).toBe('1 GB');
    });

    it('should add "rows" suffix for row_count columns', () => {
      expect(formatNumber(1500000, 'row_count')).toBe('1.5M rows');
    });

    it('should handle zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('should handle negative numbers', () => {
      expect(formatNumber(-1500)).toBe('-1.5K');
    });

    it('should handle decimals', () => {
      expect(formatNumber(1.5)).toBe('1.5');
      expect(formatNumber(0.5)).toBe('0.5');
    });

    it('should handle null/undefined', () => {
      expect(formatNumber(null)).toBe('-');
      expect(formatNumber(undefined)).toBe('-');
    });
  });

  // ==========================================================================
  // formatArrayPreview - Array Display
  // ==========================================================================
  describe('formatArrayPreview', () => {
    it('should show count for non-empty arrays', () => {
      expect(formatArrayPreview([1, 2, 3])).toEqual({
        count: 3,
        preview: '[1, 2, 3]',
        truncated: false,
      });
    });

    it('should truncate long arrays', () => {
      const longArray = Array.from({ length: 10 }, (_, i) => i);
      const result = formatArrayPreview(longArray, 5);
      expect(result.count).toBe(10);
      expect(result.truncated).toBe(true);
      expect(result.preview).toContain('...');
    });

    it('should handle empty arrays', () => {
      expect(formatArrayPreview([])).toEqual({
        count: 0,
        preview: '[]',
        truncated: false,
      });
    });

    it('should handle arrays of objects', () => {
      const arr = [{ id: 1 }, { id: 2 }];
      const result = formatArrayPreview(arr);
      expect(result.count).toBe(2);
      expect(result.preview).toContain('id');
    });

    it('should handle null', () => {
      expect(formatArrayPreview(null)).toEqual({
        count: 0,
        preview: 'null',
        truncated: false,
      });
    });
  });

  // ==========================================================================
  // formatJsonPreview - JSON/Object Display
  // ==========================================================================
  describe('formatJsonPreview', () => {
    it('should format simple objects', () => {
      const obj = { name: 'test', value: 42 };
      const result = formatJsonPreview(obj);
      expect(result).toContain('name');
      expect(result).toContain('test');
    });

    it('should truncate long JSON strings', () => {
      const obj = { data: 'x'.repeat(200) };
      const result = formatJsonPreview(obj, 100);
      expect(result.length).toBeLessThanOrEqual(103); // 100 + '...'
    });

    it('should handle nested objects', () => {
      const obj = { outer: { inner: { deep: 'value' } } };
      const result = formatJsonPreview(obj);
      expect(result).toContain('outer');
      expect(result).toContain('inner');
    });

    it('should handle null', () => {
      expect(formatJsonPreview(null)).toBe('null');
    });

    it('should handle circular references gracefully', () => {
      const obj = { name: 'test' };
      obj.self = obj;
      expect(() => formatJsonPreview(obj)).not.toThrow();
    });
  });

  // ==========================================================================
  // getTypeIcon - Column Type Icons
  // ==========================================================================
  describe('getTypeIcon', () => {
    it('should return correct icon name for VARCHAR', () => {
      expect(getTypeIcon('VARCHAR')).toBe('Type');
      expect(getTypeIcon('TEXT')).toBe('Type');
      expect(getTypeIcon('STRING')).toBe('Type');
    });

    it('should return correct icon name for NUMBER', () => {
      expect(getTypeIcon('NUMBER')).toBe('Hash');
      expect(getTypeIcon('INTEGER')).toBe('Hash');
      expect(getTypeIcon('FLOAT')).toBe('Hash');
      expect(getTypeIcon('DECIMAL')).toBe('Hash');
    });

    it('should return correct icon name for ARRAY', () => {
      expect(getTypeIcon('ARRAY')).toBe('List');
    });

    it('should return correct icon name for OBJECT/VARIANT', () => {
      expect(getTypeIcon('OBJECT')).toBe('Braces');
      expect(getTypeIcon('VARIANT')).toBe('Braces');
    });

    it('should return correct icon name for TIMESTAMP', () => {
      expect(getTypeIcon('TIMESTAMP')).toBe('Clock');
      expect(getTypeIcon('TIMESTAMP_NTZ')).toBe('Clock');
      expect(getTypeIcon('TIMESTAMP_LTZ')).toBe('Clock');
      expect(getTypeIcon('DATE')).toBe('Clock');
    });

    it('should return correct icon name for BOOLEAN', () => {
      expect(getTypeIcon('BOOLEAN')).toBe('ToggleLeft');
    });

    it('should return default icon for unknown types', () => {
      expect(getTypeIcon('UNKNOWN')).toBe('Circle');
      expect(getTypeIcon('')).toBe('Circle');
      expect(getTypeIcon(null)).toBe('Circle');
    });
  });

  // ==========================================================================
  // formatCellValue - Main Dispatcher
  // ==========================================================================
  describe('formatCellValue', () => {
    it('should return null indicator for null values', () => {
      const result = formatCellValue(null, 'name', 'VARCHAR');
      expect(result.type).toBe('null');
      expect(result.display).toBe('null');
    });

    it('should return null indicator for undefined values', () => {
      const result = formatCellValue(undefined, 'name', 'VARCHAR');
      expect(result.type).toBe('null');
    });

    it('should format arrays', () => {
      const result = formatCellValue([1, 2, 3], 'items', 'ARRAY');
      expect(result.type).toBe('array');
      expect(result.count).toBe(3);
    });

    it('should format objects', () => {
      const result = formatCellValue({ key: 'value' }, 'data', 'OBJECT');
      expect(result.type).toBe('object');
    });

    it('should format timestamps', () => {
      const result = formatCellValue('2024-12-06T10:30:00Z', 'createdAt', 'TIMESTAMP');
      expect(result.type).toBe('timestamp');
      expect(result.relative).toBeDefined();
    });

    it('should format GUIDs', () => {
      const result = formatCellValue('550e8400-e29b-41d4-a716-446655440000', 'guid', 'VARCHAR');
      expect(result.type).toBe('guid');
    });

    it('should format numbers with column context', () => {
      const result = formatCellValue(1500000, 'row_count', 'NUMBER');
      expect(result.type).toBe('number');
      expect(result.formatted).toContain('M');
    });

    it('should format bytes specially', () => {
      const result = formatCellValue(1048576, 'bytes', 'NUMBER');
      expect(result.type).toBe('number');
      expect(result.formatted).toContain('MB');
    });

    it('should format plain strings', () => {
      const result = formatCellValue('hello world', 'name', 'VARCHAR');
      expect(result.type).toBe('string');
      expect(result.display).toBe('hello world');
    });

    it('should detect GUIDs in VARCHAR columns by content', () => {
      const result = formatCellValue('550e8400-e29b-41d4-a716-446655440000', 'some_id', 'VARCHAR');
      expect(result.type).toBe('guid');
    });

    it('should detect timestamps in VARCHAR by content', () => {
      const result = formatCellValue('2024-12-06T10:30:00Z', 'some_date', 'VARCHAR');
      expect(result.type).toBe('timestamp');
    });
  });
});


