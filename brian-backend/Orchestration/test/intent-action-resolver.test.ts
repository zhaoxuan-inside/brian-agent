import { describe, it, expect } from 'vitest';
import { resolveIntentAction, originalTokenCoverage } from '../shared/intentActionResolver';

describe('resolveIntentAction', () => {
  it('原文与理解文相同或理解文为空时按原文执行', () => {
    expect(resolveIntentAction({
      originalQuery: '研究 Agent',
      understoodRequirement: '研究 Agent',
      matchScore: 40,
      threshold: 80,
      hasContext: false,
    }).action).toBe('KEEP');

    expect(resolveIntentAction({
      originalQuery: '研究 Agent',
      understoodRequirement: '',
      matchScore: 20,
      threshold: 80,
      hasContext: false,
    }).action).toBe('KEEP');
  });

  it('短输入被扩写成同一主题的可执行任务时按理解执行', () => {
    const decision = resolveIntentAction({
      originalQuery: '研究 Agent',
      understoodRequirement: '请全面调研 AI Agent 的定义、核心架构、主流框架、应用场景与前沿挑战，输出一份结构化的技术研究报告',
      matchScore: 40,
      threshold: 80,
      hasContext: false,
    });
    expect(decision.action).toBe('APPROVE');
    expect(decision.coverage).toBeGreaterThanOrEqual(0.35);
  });

  it('匹配分不低于阈值时按理解执行', () => {
    expect(resolveIntentAction({
      originalQuery: '帮我看看',
      understoodRequirement: '请根据当前会话上下文继续分析并给出下一步建议',
      matchScore: 85,
      threshold: 80,
      hasContext: true,
    }).action).toBe('APPROVE');
  });

  it('主题明显偏离时按原文执行，不自动取消', () => {
    const decision = resolveIntentAction({
      originalQuery: '原始提问',
      understoodRequirement: '理解后的需求',
      matchScore: 30,
      threshold: 80,
      hasContext: false,
    });
    expect(decision.action).toBe('KEEP');
    expect(decision.reason).toBe('topic_drift');
  });

  it('有上下文且覆盖度中等时按理解执行', () => {
    expect(resolveIntentAction({
      originalQuery: '继续按这个方向写',
      understoodRequirement: '请继续按这个方向撰写下一章节，保持现有结构与术语',
      matchScore: 45,
      threshold: 80,
      hasContext: true,
    }).action).toBe('APPROVE');
  });

  it('主题部分重叠且置信极低、无上下文时才询问用户', () => {
    const original = '研究 AI Agent 的安全问题';
    const understood = '请调研 AI 大模型的训练成本并给出采购建议';
    expect(originalTokenCoverage(original, understood)).toBeGreaterThanOrEqual(0.15);
    expect(originalTokenCoverage(original, understood)).toBeLessThan(0.35);

    const decision = resolveIntentAction({
      originalQuery: original,
      understoodRequirement: understood,
      matchScore: 25,
      threshold: 80,
      hasContext: false,
    });
    expect(decision.action).toBe('ASK');
    expect(decision.reason).toBe('ambiguous_rewrite');
  });

  it('从不返回 CANCEL', () => {
    const samples = [
      { originalQuery: '', understoodRequirement: 'x', matchScore: 0, threshold: 80, hasContext: false },
      { originalQuery: 'a', understoodRequirement: 'b', matchScore: 0, threshold: 80, hasContext: false },
      { originalQuery: '研究 Agent', understoodRequirement: '请全面调研 AI Agent', matchScore: 10, threshold: 80, hasContext: true },
    ];
    for (const params of samples) {
      expect(resolveIntentAction(params).action).not.toBe('CANCEL');
    }
  });
});
