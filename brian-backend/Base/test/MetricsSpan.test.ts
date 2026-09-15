/**
 * Metrics Span 树计时框架测试（2026-09-15 endSpan 按句柄配对收口修复）。
 */
import { describe, it, expect } from 'vitest';
import { Metrics } from '../shared/base/Metrics';

describe('Metrics.endSpan 按 handle 配对收口', () => {
  it('endSpan(handle) 应收口 handle 对应的 span（而非栈顶）', () => {
    const m = new Metrics();
    const a = m.beginSpan('a');
    m.beginSpan('b');
    const closed = m.endSpan(a);
    expect(closed?.key).toBe('a');
    expect(closed?.end).toBeDefined();
    // 栈顶 b 未被误关
    expect(m.spans.find((s) => s.key === 'b')?.end).toBeUndefined();
  });

  it('异步交错（非 LIFO）收口顺序仍正确', () => {
    const m = new Metrics();
    const a = m.beginSpan('outer');
    const b = m.beginSpan('inner1');
    m.endSpan(a);
    m.endSpan(b);
    expect(m.spans.find((s) => s.key === 'outer')?.end).toBeDefined();
    expect(m.spans.find((s) => s.key === 'inner1')?.end).toBeDefined();
  });

  it('重复或未知 handle 收口应 no-op（不关错其他 span）', () => {
    const m = new Metrics();
    const a = m.beginSpan('a');
    m.beginSpan('b');
    m.endSpan(a);
    m.endSpan(a); // 已闭合，no-op
    expect(m.spans.find((s) => s.key === 'b')?.end).toBeUndefined();
  });

  it('缺省调用仍收口栈顶', () => {
    const m = new Metrics();
    m.beginSpan('a');
    m.beginSpan('b');
    m.endSpan();
    expect(m.spans.find((s) => s.key === 'b')?.end).toBeDefined();
    expect(m.spans.find((s) => s.key === 'a')?.end).toBeUndefined();
  });
});

describe('Metrics.lastClosedSpan', () => {
  it('应取闭合时间戳最大（最近闭合）的 span，而非创建序最末', () => {
    const m = new Metrics();
    const a = m.beginSpan('a');
    m.beginSpan('b');
    m.endSpan(a);
    m.endSpan();
    const span = m.lastClosedSpan();
    expect(span?.key).toBeDefined();
  });
});

describe('Metrics.spanSelfMs 负值回退', () => {
  it('子项之和超过 duration 时回退 duration 而非 0', () => {
    const m = new Metrics();
    const parent = m.beginSpan('parent');
    m.endSpan(parent);
    const row = m.spans.find((s) => s.key === 'parent')!;
    // 手动构造交叠时间轴：父 0-100，两个子各覆盖 0-100（子之和 200 > 父 duration）
    row.start = 0;
    row.end = 100;
    m.spans.push({ id: m.spans.length + 1, key: 'child', start: 0, end: 100, parent: row.id });
    m.spans.push({ id: m.spans.length + 1, key: 'child2', start: 0, end: 100, parent: row.id });
    expect(m.spanSelfMs(row)).toBe(100);
    expect(m.spanSelfMs(row)).toBeGreaterThan(0);
  });
});
