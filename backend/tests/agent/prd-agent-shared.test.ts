import { describe, it, expect } from 'vitest';
import { buildTaskSignature, parseJsonObject } from '../../src/agent/shared';

describe('buildTaskSignature', () => {
  it('TC-SH-001: should format [domain] + body', () => {
    expect(buildTaskSignature('hello world', 'coding')).toBe('[coding] hello world');
  });

  it('TC-SH-002: should default domain to general when omitted', () => {
    expect(buildTaskSignature('x')).toBe('[general] x');
  });

  it('TC-SH-003: should default domain to general when whitespace only', () => {
    expect(buildTaskSignature('test', '   ')).toBe('[general] test');
  });

  it('TC-SH-004: should truncate taskContent longer than 256 chars', () => {
    const body = 'x'.repeat(300);
    const result = buildTaskSignature(body, 'd');
    expect(result.length).toBe('[d] '.length + 256);
    expect(result.startsWith('[d] ')).toBe(true);
    expect(result.endsWith('x')).toBe(true);
  });

  it('TC-SH-005: should not truncate taskContent exactly 256 chars', () => {
    const body = 'x'.repeat(256);
    const result = buildTaskSignature(body, 'd');
    expect(result.length).toBe('[d] '.length + 256);
    expect(result.startsWith('[d] ')).toBe(true);
    expect(result).toBe('[d] ' + body);
  });

  it('TC-SH-006: should handle null/undefined taskContent without throwing', () => {
    expect(() => buildTaskSignature(null as unknown as string, 'd')).not.toThrow();
    expect(buildTaskSignature(null as unknown as string, 'd')).toBe('[d] ');
    expect(buildTaskSignature(undefined as unknown as string, 'd')).toBe('[d] ');
  });

  it('TC-SH-007: should handle domain with special characters', () => {
    expect(buildTaskSignature('test', 'ai-ml')).toBe('[ai-ml] test');
  });
});

describe('parseJsonObject', () => {
  it('TC-SH-008: should parse a pure JSON object', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('TC-SH-009: should extract embedded JSON from surrounding text', () => {
    expect(parseJsonObject('prefix {"b":2} suffix')).toEqual({ b: 2 });
  });

  it('TC-SH-010: should parse nested JSON objects', () => {
    expect(parseJsonObject('{"a":{"b":1},"c":[1,2]}')).toEqual({ a: { b: 1 }, c: [1, 2] });
  });

  it('TC-SH-011: multiple JSON blocks in text (greedy regex cannot extract first)', () => {
    expect(parseJsonObject('start {"a":1} middle {"b":2} end')).toBeNull();
  });

  it('TC-SH-012: should return null for empty string', () => {
    expect(parseJsonObject('')).toBeNull();
  });

  it('TC-SH-013: should return null for plain text without JSON', () => {
    expect(parseJsonObject('this is just text')).toBeNull();
  });

  it('TC-SH-014: should return null for malformed JSON', () => {
    expect(parseJsonObject('{"a":1,}')).toBeNull();
  });

  it('TC-SH-015: should return null for JSON array (non-object)', () => {
    expect(parseJsonObject('[1,2,3]')).toBeNull();
  });

  it('TC-SH-016: should extract cross-line embedded JSON', () => {
    expect(parseJsonObject('prefix\n{"key":\n"value"}\nsuffix')).toEqual({ key: 'value' });
  });
});
