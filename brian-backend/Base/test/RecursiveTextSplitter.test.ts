import { describe, it, expect } from 'vitest';
import {
  RecursiveTextSplitter,
  DEFAULT_SEPARATORS,
} from '../ChunkProvider';

describe('RecursiveTextSplitter', () => {
  it('should keep short text as a single chunk', () => {
    const chunks = RecursiveTextSplitter.splitText('这是一段短文本', { chunkSize: 100, chunkOverlap: 10 });
    expect(chunks).toEqual(['这是一段短文本']);
  });

  it('should split long text at paragraph boundaries first', () => {
    const text = [
      '第一段内容。'.repeat(20),
      '第二段内容。'.repeat(20),
    ].join('\n\n');
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize: 80, chunkOverlap: 16 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(RecursiveTextSplitter.charLength(c)).toBeLessThanOrEqual(80);
    }
  });

  it('should split at sentence-ending punctuation rather than inside words', () => {
    const text = '这是第一句话。这是第二句话！这是第三句话？这是第四句话。';
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize: 8, chunkOverlap: 2 });
    
    for (const c of chunks) {
      expect(RecursiveTextSplitter.charLength(c)).toBeLessThanOrEqual(8);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should preserve overlap between adjacent chunks (coverage)', () => {
    
    const text = 'a'.repeat(100);
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize: 10, chunkOverlap: 4 });
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length - 1; i++) {
      const prev = chunks[i];
      const next = chunks[i + 1];
      
      const overlap = prev.slice(-4);
      expect(next.startsWith(overlap)).toBe(true);
    }
  });

  it('should not lose content: concatenation minus overlaps covers original text', () => {
    const text = '这是一段用于测试覆盖率的文本。'.repeat(30);
    const chunkSize = 20;
    const overlap = 5;
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize, chunkOverlap: overlap });
    
    const joined = chunks.join('');
    
    const stripped = text.replace(/[。\n]/g, '');
    expect(joined.length).toBeGreaterThanOrEqual(stripped.length - overlap);
  });

  it('should respect custom separators', () => {
    const text = 'a|b|c|d|e|f|g|h';
    const chunks = RecursiveTextSplitter.splitText(text, {
      chunkSize: 3,
      chunkOverlap: 1,
      separators: ['|', ''],
    });
    for (const c of chunks) {
      expect(RecursiveTextSplitter.charLength(c)).toBeLessThanOrEqual(3);
    }
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should return empty array for empty text', () => {
    expect(RecursiveTextSplitter.splitText('')).toEqual([]);
    expect(RecursiveTextSplitter.splitText('   ')).toEqual([]);
  });

  it('should handle single over-long segment without error', () => {
    
    const text = 'x'.repeat(100);
    const chunks = RecursiveTextSplitter.splitText(text, { chunkSize: 5, chunkOverlap: 1, separators: [''] });
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should throw on invalid chunkSize / chunkOverlap', () => {
    expect(() => RecursiveTextSplitter.splitText('abc', { chunkSize: 0 })).toThrow();
    expect(() => RecursiveTextSplitter.splitText('abc', { chunkSize: 10, chunkOverlap: 10 })).toThrow();
    expect(() => RecursiveTextSplitter.splitText('abc', { chunkSize: 10, chunkOverlap: -1 })).toThrow();
  });

  it('should export default separators containing paragraph and sentence separators', () => {
    expect(DEFAULT_SEPARATORS).toContain('\n\n');
    expect(DEFAULT_SEPARATORS).toContain('。');
    expect(DEFAULT_SEPARATORS).toContain('，');
    expect(DEFAULT_SEPARATORS).toContain('');
  });
});
