import { describe, it, expect } from 'vitest';
import { buildTaskSignature, parseJsonObject } from '../shared/signature';

describe('buildTaskSignature', () => {
  it('formats as [domain] first 256 chars', () => {
    const sig = buildTaskSignature('hello world', 'coding');
    expect(sig).toBe('[coding] hello world');
  });

  it('defaults domain to general', () => {
    expect(buildTaskSignature('x')).toBe('[general] x');
  });

  it('truncates body to 256', () => {
    const body = 'a'.repeat(300);
    const sig = buildTaskSignature(body, 'd');
    expect(sig.length).toBe('[d] '.length + 256);
  });
});

describe('parseJsonObject', () => {
  it('parses pure json', () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('extracts embedded json', () => {
    expect(parseJsonObject('prefix {"b":2} suffix')).toEqual({ b: 2 });
  });
});
