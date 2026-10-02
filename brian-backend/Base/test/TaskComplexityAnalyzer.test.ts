import { describe, it, expect } from 'vitest';
import { analyzeTaskComplexity, computeLengthScore, computeStructureScore, computeKeywordScore } from '../shared/nlp/TaskComplexityAnalyzer';

describe('TaskComplexityAnalyzer (Base 层 NLP 模块)', () => {
  it('应准确识别简短日常闲聊为简单任务并关闭 Thinking', () => {
    const greetings = ['你好', '您好！', '在吗', '早安', '谢谢你', '你是谁'];
    for (const text of greetings) {
      const result = analyzeTaskComplexity({ text });
      expect(result.isComplex).toBe(false);
      expect(result.enableThinking).toBe(false);
      expect(result.level).toBe('simple');
      expect(result.complexity).toBeLessThan(40);
    }
  });

  it('应准确识别直接简单指令为简单任务并关闭 Thinking', () => {
    const directQueries = [
      '今天北京天气怎么样？',
      '把这段文字翻译成英文：Hello world',
      '提取下面文本中的邮箱地址',
      '什么是二叉树？',
    ];
    for (const text of directQueries) {
      const result = analyzeTaskComplexity({ text });
      expect(result.isComplex).toBe(false);
      expect(result.enableThinking).toBe(false);
    }
  });

  it('应识别复杂代码编写、架构设计与性能调优为复杂任务并启用 Thinking', () => {
    const complexTasks = [
      '请详细对比 React 与 Vue3 的响应式原理与架构差异，并深度分析并发渲染下的性能优化策略与 trade-off',
      '帮我排查这个分布式死锁和内存泄露问题：在高并发场景下出现 OOM，请给出完整的排错步骤与重构方案',
      '实现一个基于红黑树的排序算法，推导其时间复杂度与空间复杂度，并给出证明过程',
    ];
    for (const text of complexTasks) {
      const result = analyzeTaskComplexity({ text });
      expect(result.isComplex).toBe(true);
      expect(result.enableThinking).toBe(true);
      expect(result.complexity).toBeGreaterThanOrEqual(50);
      expect(result.reason).toContain('复杂');
    }
  });

  it('应识别多分号、结构化列表与条件分支的复合任务', () => {
    const structuredText = `
1. 首先获取当前用户配置；
2. 如果用户类型为VIP，则调用打折接口；否则保持原价；
3. 并且将订单持久化到数据库中。
    `;
    const result = analyzeTaskComplexity({ text: structuredText });
    expect(result.factors.structureScore).toBeGreaterThan(0);
    expect(result.isComplex).toBe(true);
    expect(result.enableThinking).toBe(true);
  });

  it('包含代码块的任务应显著提升结构复杂度分值', () => {
    const codeTask = '请 review 以下代码并给出优化建议：\n```ts\nfunction test() { return 1; }\n```';
    const result = analyzeTaskComplexity({ text: codeTask });
    expect(result.factors.structureScore).toBeGreaterThanOrEqual(30);
  });
});
