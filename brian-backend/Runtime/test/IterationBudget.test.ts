/**
 * @fileoverview IterationBudget 单元测试（Runtime v2 · 阶段 0）。
 */

import { describe, it, expect } from 'vitest';
import { IterationBudget, BUDGET_GRACE_MARKER } from '../shared/IterationBudget';

describe('IterationBudget', () => {
  it('应该按 total 顺序消费并在耗尽时返回 false', () => {
    const budget = new IterationBudget({ total: 3 });
    expect(budget.consume()).toBe(true);
    expect(budget.consume()).toBe(true);
    expect(budget.consume()).toBe(true);
    expect(budget.used).toBe(3);
    expect(budget.remaining).toBe(0);
    expect(budget.exhausted).toBe(true);
  });

  it('预算耗尽后宽限期应该允许一次收尾消费且不可再用', () => {
    const budget = new IterationBudget({ total: 2, grace: true });
    budget.consume();
    budget.consume();
    expect(budget.consume()).toBe(true); // 宽限收尾
    expect(budget.consume()).toBe(false); // 宽限已用
    expect(budget.graceAvailable).toBe(false);
  });

  it('grace=false 时耗尽立即拒绝', () => {
    const budget = new IterationBudget({ total: 1, grace: false });
    expect(budget.consume()).toBe(true);
    expect(budget.consume()).toBe(false);
  });

  it('refund 应该退还未消耗迭代（宽限标记不可退还）', () => {
    const budget = new IterationBudget({ total: 2, grace: true });
    budget.consume();
    budget.consume();
    budget.consume(); // 宽限
    budget.refund(1); // 退还 1 次正常消费
    expect(budget.used).toBe(2);
    expect(budget.remaining).toBe(0);
    expect(budget.graceAvailable).toBe(false); // 宽限仍已标记
  });

  it('单轮工具调用上限校验应该生效', () => {
    const budget = new IterationBudget({ total: 5, tool_call_limit: 2 });
    expect(budget.withinToolCallLimit(2)).toBe(true);
    expect(budget.withinToolCallLimit(3)).toBe(false);
    expect(budget.toolCallLimit).toBe(2);
  });

  it('宽限标记常量应该导出', () => {
    expect(BUDGET_GRACE_MARKER).toBe('budget_grace');
  });
});
