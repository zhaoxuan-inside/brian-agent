import { describe, it, expect } from 'vitest';
import { rankCandidatesByBM25, tokenizeForSearch } from '../Agents/application/bm25';

describe('BM25 Algorithm (Agent candidate pre-filtering)', () => {
  it('分词函数应正确解析中文、英文与二元字组', () => {
    const tokens = tokenizeForSearch('我的猫叫大耳贼');
    expect(tokens).toContain('猫');
    expect(tokens).toContain('猫叫');
    expect(tokens).toContain('大耳');
    expect(tokens).toContain('耳贼');
  });

  it('无词项重合时应返回空数组（短路拦截）', () => {
    const query = '我的猫叫大耳贼是一只小暹罗猫';
    const docs = [
      { id: 'travel', text: '心绪漫游向导 城市出行散步休闲路线推荐' },
      { id: 'finance', text: '行情瞭望 股市行情走势分析' },
      { id: 'calendar', text: '日程管家 负责日历与待办事项管理' },
    ];
    const results = rankCandidatesByBM25(query, docs, 50);
    expect(results).toHaveLength(0);
  });

  it('存在高重合度文档时应正确召回并打分 >= 50', () => {
    const query = '周末帮我推荐几个适合出行的城市散步路线';
    const docs = [
      { id: 'travel', text: '心绪漫游向导 城市出行散步休闲路线推荐' },
      { id: 'finance', text: '行情瞭望 股市行情走势分析' },
    ];
    const results = rankCandidatesByBM25(query, docs, 50);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('travel');
    expect(results[0].score).toBeGreaterThanOrEqual(50);
  });
});
