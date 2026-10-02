import { describe, it, expect } from 'vitest';
import {
  aggregateComponentFunnelMatches,
  createComponentFunnelTrace,
  clipFunnelText,
} from '@brian-agent/base';

const SELECTED = {
  llm: 'deepseek-v4-flash',
  prompt: '标准交互提示词模板',
  soul: '专业严谨的协作助手',
  skills: ['skill_builtin-delegate'],
  mcps: ['brian-local-fs'],
};

describe('aggregateComponentFunnelMatches (组件漏斗明细聚合)', () => {
  it('从 component.funnel 事件提取真实机制明细(LLM 机制含 prompt/output)', () => {
    const events = [
      {
        event_type: 'component.funnel',
        payload: {
          component: 'skill',
          agent_id: 'a1',
          detail: 'funnel_bm25',
          mechanisms: [
            {
              mechanism: 'bm25',
              label: 'BM25 检索',
              adopted: true,
              candidates: [
                { id: 's1', name: '委派技能', score: 95 },
                { id: 's2', name: '计算技能', score: 40 },
              ],
            },
          ],
        },
      },
    ];
    const result = aggregateComponentFunnelMatches(events, SELECTED);
    expect(result.skill).toHaveLength(1);
    expect(result.skill[0].mechanism).toBe('bm25');
    expect(result.skill[0].adopted).toBe(true);
    expect(result.skill[0].candidates[0].name).toBe('委派技能');
    expect(result.prompt[0].mechanism).toBe('direct');
  });

  it('无事件组件合成「绑定事实源」direct 条目(复用既有 Agent 场景)', () => {
    const result = aggregateComponentFunnelMatches([], SELECTED);
    for (const comp of ['llm', 'prompt', 'soul', 'skill', 'mcp'] as const) {
      expect(result[comp]).toHaveLength(1);
      expect(result[comp][0].mechanism).toBe('direct');
      expect(result[comp][0].adopted).toBe(true);
    }
    expect(result.skill[0].candidates[0].id).toBe('skill_builtin-delegate');
    expect(result.mcp[0].candidates[0].id).toBe('brian-local-fs');
    expect(result.llm[0].candidates[0].name).toBe('deepseek-v4-flash');
  });

  it('同一组件多条事件时取最近一条,畸形机制与候选被安全降级', () => {
    const events = [
      {
        event_type: 'component.funnel',
        payload: {
          component: 'soul',
          mechanisms: [{ mechanism: 'bm25', label: 'BM25 检索', adopted: false, candidates: [{ id: 'soul-1', name: '旧', score: 80 }] }],
        },
      },
      {
        event_type: 'component.funnel',
        payload: {
          component: 'soul',
          mechanisms: [
            { mechanism: '未知机制', label: '异常', adopted: true, candidates: [{ id: 'soul-9', name: '新', score: '99' }, '垃圾项', { name: '无id' }] },
          ],
        },
      },
    ];
    const result = aggregateComponentFunnelMatches(events, SELECTED);
    expect(result.soul).toHaveLength(1);
    expect(result.soul[0].mechanism).toBe('direct');
    expect(result.soul[0].candidates).toHaveLength(1);
    expect(result.soul[0].candidates[0].score).toBe(99);
  });
});

describe('ComponentFunnelTrace (漏斗明细采集器)', () => {
  it('addDirect/markAdopted 正确登记与回写采纳状态', () => {
    const trace = createComponentFunnelTrace('prompt', 'agent-1');
    trace.addMechanism({ mechanism: 'bm25', label: 'BM25 检索', adopted: false, candidates: [] });
    trace.addDirect('绑定事实源', [{ id: 'p1', name: '模板', score: 100 }]);
    trace.markAdopted('bm25');
    expect(trace.mechanisms[0].adopted).toBe(true);
    expect(trace.mechanisms[1].mechanism).toBe('direct');
    expect(trace.agent_id).toBe('agent-1');
  });

  it('clipFunnelText 裁剪超长文本且空文本返回 undefined', () => {
    expect(clipFunnelText('   ')).toBeUndefined();
    expect(clipFunnelText('短文本')).toBe('短文本');
    const long = 'x'.repeat(7000);
    const clipped = clipFunnelText(long);
    expect(clipped!.length).toBeLessThan(7000);
    expect(clipped).toContain('已截断');
  });
});
