import { describe, it, expect } from 'vitest';
import {
  parseNeedRankingResult,
  parseRankingCandidates,
  filterByThreshold,
} from '../../shared/RankingParser';

describe('RankingParser.parseNeedRankingResult（判定合并契约）', () => {
  it('should parse object contract with need=true and candidates', () => {
    const text = '{"need": true, "keywords": ["weather", "forecast"], "candidates": [{"id": "s1", "score": 95}, {"id": "s2", "score": 40}]}';
    const result = parseNeedRankingResult(text);
    expect(result.need).toBe(true);
    expect(result.keywords).toEqual(['weather', 'forecast']);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toEqual({ id: 's1', score: 95 });
  });

  it('should parse object contract with need=false', () => {
    const text = '{"need": false, "keywords": [], "candidates": []}';
    const result = parseNeedRankingResult(text);
    expect(result.need).toBe(false);
    expect(result.candidates).toEqual([]);
  });

  it('should tolerate markdown code fence wrapping', () => {
    const text = '```json\n{"need": true, "keywords": [], "candidates": [{"id": "s1", "score": 90}]}\n```';
    const result = parseNeedRankingResult(text);
    expect(result.need).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('should default need=true when need field missing but candidates present', () => {
    const text = '{"candidates": [{"id": "s1", "score": 80}]}';
    const result = parseNeedRankingResult(text);
    expect(result.need).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('should drop invalid candidates (missing id or illegal score)', () => {
    const text = '{"need": true, "keywords": [], "candidates": [{"id": "", "score": 90}, {"id": "s2", "score": "abc"}, {"id": "s3", "score": 70}]}';
    const result = parseNeedRankingResult(text);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].id).toBe('s3');
  });

  it('should clamp score to 0-100', () => {
    const text = '{"need": true, "keywords": [], "candidates": [{"id": "s1", "score": 150}, {"id": "s2", "score": -5}]}';
    const result = parseNeedRankingResult(text);
    expect(result.candidates[0].score).toBe(100);
    expect(result.candidates[1].score).toBe(0);
  });

  it('should treat non-empty legacy array as need=true', () => {
    const text = '[{"id": "s1", "score": 95}]';
    const result = parseNeedRankingResult(text);
    expect(result.need).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('should treat empty legacy array as need=false', () => {
    const text = '[]';
    const result = parseNeedRankingResult(text);
    expect(result.need).toBe(false);
  });

  it('should degrade to need=false on parse failure (garbage text)', () => {
    const result = parseNeedRankingResult('我觉得不需要任何 Skill');
    expect(result.need).toBe(false);
    expect(result.candidates).toEqual([]);
  });

  it('should degrade to need=false on empty text', () => {
    const result = parseNeedRankingResult('');
    expect(result.need).toBe(false);
  });
});

describe('RankingParser.parseRankingCandidates（旧数组契约回归）', () => {
  it('should still parse legacy array format', () => {
    const items = parseRankingCandidates('[{"id": "a", "score": 80}]');
    expect(items).toEqual([{ id: 'a', score: 80 }]);
  });

  it('should return empty for object contract (no array in text)', () => {
    const items = parseRankingCandidates('{"need": true, "candidates": []}');
    expect(items).toEqual([]);
  });
});

describe('RankingParser.filterByThreshold', () => {
  it('should sort desc and drop below threshold', () => {
    const items = [
      { id: 'a', score: 50 },
      { id: 'b', score: 95 },
      { id: 'c', score: 89 },
    ];
    const result = filterByThreshold(items, 90);
    expect(result.map((r) => r.id)).toEqual(['b']);
  });
});
