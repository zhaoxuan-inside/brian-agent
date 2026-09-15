/**
 * @fileoverview contextFormatter 单元测试：静态记忆上下文功能化注入 + 动态执行上下文区分。
 */
import { describe, expect, it } from 'vitest';
import { formatContextCategories, formatDynamicContext, type ContextOutputLike } from '../PromptCatalog/contextFormatter';

describe('formatContextCategories（静态记忆上下文）', () => {
  it('空输入返回空串', () => {
    expect(formatContextCategories(undefined)).toBe('');
    expect(formatContextCategories({})).toBe('');
  });

  it('分区标题为模型可理解的功能标签，非来源直译', () => {
    const out = formatContextCategories({
      categories: {
        pinned: [{ info: '用户偏好喝冰美式' }],
        timeline: [{ info: '今天早上用户聊了跑步' }],
        keyword: [{ info: '历史消息：溜达' }],
      },
    });
    expect(out).toContain('<static-memory-context>');
    expect(out).toContain('<usage-note>');
    expect(out).toContain('<user-pinned-messages>');
    expect(out).toContain('<conversation-history>');
    expect(out).toContain('<keyword-memories>');
    // 旧直译标题不应再出现
    expect(out).not.toContain('<钉住的消息>');
    expect(out).not.toContain('<时间线消息>');
    expect(out).not.toContain('上下文信息>');
  });

  it('每个分区携带功能说明（what-this-is），声明静态记忆不可修改', () => {
    const out = formatContextCategories({
      categories: { similarity: [{ info: '类似问题的历史回答' }] },
    });
    expect(out).toContain('<what-this-is>');
    expect(out).toContain('不要续写');
    expect(out).toMatch(/<similar-experiences>\n<what-this-is>[^<]+<\/what-this-is>\n- 类似问题的历史回答\n<\/similar-experiences>/);
  });

  it('categories 为空但 list 有值时走兜底（时间线语义）', () => {
    const out: string = formatContextCategories({ list: [{ info: '历史消息 A' }] } as ContextOutputLike);
    expect(out).toContain('<static-memory-context>');
    expect(out).toContain('<conversation-history>');
    expect(out).toContain('历史消息 A');
  });

  it('超长条目被截断', () => {
    const long = 'x'.repeat(3000);
    const out = formatContextCategories({ categories: { pinned: [{ info: long }] } });
    expect(out).toContain('…(截断)');
    expect(out.length).toBeLessThan(3500);
  });
});

describe('formatDynamicContext（动态执行上下文）', () => {
  it('包装执行产物并区分于静态记忆', () => {
    const out = formatDynamicContext('本次任务执行过程中由执行 Agent 实时产出的工作结果', ['[w1] 天气查询: 晴']);
    expect(out).toContain('<dynamic-execution-context>');
    expect(out).toContain('<what-this-is>本次任务执行过程中由执行 Agent 实时产出的工作结果</what-this-is>');
    expect(out).toContain('- [w1] 天气查询: 晴');
    expect(out).toContain('dynamic-execution-context');
  });

  it('动态与静态块标签互不相同，无条目返回空串', () => {
    const staticOut = formatContextCategories({ categories: { pinned: [{ info: 'a' }] } });
    expect(staticOut).not.toContain('dynamic-execution-context');
    const dynamicOut = formatDynamicContext('任意说明', ['a']);
    expect(dynamicOut).not.toContain('static-memory-context');
    expect(formatDynamicContext('说明', [])).toBe('');
    expect(formatDynamicContext('说明', ['', '   '])).toBe('');
  });

  it('超长条目截断', () => {
    const out = formatDynamicContext('说明', ['y'.repeat(3000)]);
    expect(out).toContain('…(截断)');
  });
});
