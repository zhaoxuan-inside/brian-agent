import { describe, it, expect } from 'vitest';
import {
  compositeScore, fullTierLadder, pickFromTier, standardTierLadder, applySignalScores,
} from '@brian-agent/base';
import { isContinuationRequest, stripContinuationPrefix } from '@brian-agent/base';
import { runComponentElection, DEFAULT_ELECTION_THRESHOLDS, type ComponentElectionAdapter, type ElectionCandidate, type ElectionSignals } from '@brian-agent/base';
import { analyzeTaskComplexity } from '@brian-agent/base';

function makeCandidate(id: string, overrides: Partial<ElectionCandidate<{ id: string }>> = {}): ElectionCandidate<{ id: string }> {
  return { id, label: id, doc: { id }, bm25Score: 0, vectorScore: 0, exampleSim: 0, negativeSim: 0, rejectedByNegative: false, ...overrides };
}

function makeSignals(candidates: ElectionCandidate<{ id: string }>[], structureIds: string[] = []): ElectionSignals<{ id: string }> {
  return { candidates, complexity: analyzeTaskComplexity({ text: '帮我写一个完整的商城系统' }), structureIds: new Set(structureIds), thresholds: { ...DEFAULT_ELECTION_THRESHOLDS } };
}

function makeAdapter<T extends { id: string }>(overrides: Partial<ComponentElectionAdapter<T>>): ComponentElectionAdapter<T> {
  return {
    component: 'llm', multiSelect: false, directAdoptSingle: true,
    findReusable: async () => null,
    extractSignals: async () => ({ candidates: [], complexity: analyzeTaskComplexity({ text: 'x' }), structureIds: new Set<string>(), thresholds: { ...DEFAULT_ELECTION_THRESHOLDS } }),
    tiers: () => standardTierLadder(),
    select: async () => true,
    exhaust: async () => true,
    ...overrides,
  } as ComponentElectionAdapter<T>;
}

describe('isContinuationRequest (续写请求识别)', () => {
  it('命中整句续写语式', () => {
    for (const t of ['继续', '然后呢', '接着说', '请继续', '接下来呢？', 'go on', 'continue...']) {
      expect(isContinuationRequest(t), t).toBe(true);
    }
  });
  it('普通请求与长文本不命中', () => {
    expect(isContinuationRequest('帮我查一下SF12345快递到哪了')).toBe(false);
    expect(isContinuationRequest('继续上面的思路，帮我重构这个模块的错误处理逻辑，注意并发场景')).toBe(false);
    expect(isContinuationRequest('')).toBe(false);
  });
  it('stripContinuationPrefix 剥离续写前缀', () => {
    expect(stripContinuationPrefix('继续：上面的分析')).toBe('上面的分析');
    expect(stripContinuationPrefix('帮我优化这段代码')).toBe('帮我优化这段代码');
  });
});

describe('compositeScore (综合得分)', () => {
  it('按权重加权向量分与 BM25 分', () => {
    const c = makeCandidate('a', { vectorScore: 80, bm25Score: 60 });
    expect(compositeScore(c, DEFAULT_ELECTION_THRESHOLDS)).toBeCloseTo(0.7 * 80 + 0.3 * 60);
  });
});

describe('pickFromTier (阶梯候选集求解)', () => {
  it('并集信号集并剔除反例候选（multiSelect 整集校验集合成员）', () => {
    const signals = makeSignals([
      makeCandidate('a', { vectorScore: 90, bm25Score: 10 }),
      makeCandidate('b', { bm25Score: 95 }),
      makeCandidate('n', { vectorScore: 99, rejectedByNegative: true }),
    ], ['b']);
    const picked = pickFromTier(signals, standardTierLadder()[0], true);
    expect(picked.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });
  it('multiSelect=false 择优返回综合得分最高的单候选', () => {
    const signals = makeSignals([
      makeCandidate('a', { vectorScore: 70, bm25Score: 100 }),
      makeCandidate('b', { vectorScore: 100, bm25Score: 0 }),
    ]);
    const picked = pickFromTier(signals, standardTierLadder()[0], false);
    expect(picked).toHaveLength(1);
    expect(picked[0].id).toBe('b');
  });
  it('multiSelect=true 整集返回（Skill/MCP）', () => {
    const signals = makeSignals([
      makeCandidate('a', { vectorScore: 90 }),
      makeCandidate('b', { vectorScore: 85 }),
    ]);
    const picked = pickFromTier(signals, standardTierLadder()[0], true);
    expect(picked.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });
  it('阶梯无命中返回空数组', () => {
    const signals = makeSignals([makeCandidate('a', { vectorScore: 10, bm25Score: 5 })], []);
    expect(pickFromTier(signals, standardTierLadder()[0], false)).toHaveLength(0);
  });
});

describe('applySignalScores (双通道得分回填)', () => {
  it('BM25 与语义路由得分写入候选', () => {
    const candidates = [makeCandidate('a'), makeCandidate('b')];
    applySignalScores(
      candidates,
      [{ doc: { id: 'a', name: '', brief: '' }, score: 88, raw: 8.8 }],
      [
        { doc: { id: 'a', name: '', brief: '' }, score: 92, raw: 0.92, exampleSim: 95, negativeSim: 0.4 },
        { doc: { id: 'b', name: '', brief: '' }, score: 0, raw: 0, rejected: true, negativeSim: 0.9 },
      ],
    );
    expect(candidates[0].bm25Score).toBe(88);
    expect(candidates[0].vectorScore).toBe(92);
    expect(candidates[0].exampleSim).toBe(95);
    expect(candidates[1].rejectedByNegative).toBe(true);
    expect(candidates[1].negativeSim).toBe(90);
  });
});

describe('runComponentElection (统一选举模板)', () => {
  it('复用判定命中直接采纳，不走信号提取', async () => {
    const calls: string[] = [];
    const adapter = makeAdapter<{ id: string }>({
      findReusable: async () => ({ label: '续写复用', items: [makeCandidate('kept', { vectorScore: 100 })] }),
      extractSignals: async () => { calls.push('signals'); return makeSignals([]); },
      select: async (_i, _o, picked, tier) => { calls.push(`select:${tier.id}:${picked[0].id}`); return true; },
      exhaust: async () => { calls.push('exhaust'); return true; },
    });
    await runComponentElection(adapter, {}, {});
    expect(calls).toEqual(['select:reuse:kept']);
  });
  it('唯一合法候选直采', async () => {
    const calls: string[] = [];
    const adapter = makeAdapter<{ id: string }>({
      extractSignals: async () => makeSignals([makeCandidate('only', { vectorScore: 30 })]),
      select: async (_i, _o, picked, tier) => { calls.push(`select:${tier.id}:${picked[0].id}`); return true; },
      exhaust: async () => { calls.push('exhaust'); return true; },
    });
    await runComponentElection(adapter, {}, {});
    expect(calls).toEqual(['select:single:only']);
  });
  it('directAdoptSingle=false 时唯一候选仍走阶梯阈值裁决', async () => {
    const calls: string[] = [];
    const adapter = makeAdapter<{ id: string }>({
      directAdoptSingle: false,
      extractSignals: async () => makeSignals([makeCandidate('only', { vectorScore: 30 })]),
      select: async (_i, _o, picked, tier) => { calls.push(`select:${tier.id}:${picked[0].id}`); return true; },
      exhaust: async () => { calls.push('exhaust'); return true; },
    });
    await runComponentElection(adapter, {}, {});
    expect(calls).toEqual(['exhaust']);
  });
  it('T1 空时降级 T2，阶梯耗尽走终端', async () => {
    const calls: string[] = [];
    const adapter = makeAdapter<{ id: string }>({
      extractSignals: async () => makeSignals([
        makeCandidate('x', { vectorScore: 10, bm25Score: 5 }),
        makeCandidate('y', { vectorScore: 0, bm25Score: 0 }),
      ]),
      select: async (_i, _o, picked, tier) => { calls.push(`select:${tier.id}:${picked.map((p) => p.id).join(',')}`); return true; },
      exhaust: async () => { calls.push('exhaust'); return true; },
    });
    await runComponentElection(adapter, {}, {});
    expect(calls).toEqual(['exhaust']);
  });
  it('T1 命中按综合得分择优', async () => {
    const calls: string[] = [];
    const adapter = makeAdapter<{ id: string }>({
      extractSignals: async () => makeSignals([
        makeCandidate('vec', { vectorScore: 95, bm25Score: 0 }),
        makeCandidate('bm25only', { vectorScore: 20, bm25Score: 100 }),
      ], ['vec']),
      select: async (_i, _o, picked, tier) => { calls.push(`select:${tier.id}:${picked[0].id}`); return true; },
      exhaust: async () => { calls.push('exhaust'); return true; },
    });
    await runComponentElection(adapter, {}, {});
    expect(calls).toEqual(['select:t1:vec']);
  });
  it('LLM 全量阶梯 T6(BM25−反例) 可命中', async () => {
    const calls: string[] = [];
    const adapter = makeAdapter<{ id: string }>({
      tiers: () => fullTierLadder(),
      extractSignals: async () => makeSignals([
        makeCandidate('kw', { bm25Score: 92 }),
        makeCandidate('noise', { vectorScore: 5, bm25Score: 0 }),
      ]),
      select: async (_i, _o, picked, tier) => { calls.push(`select:${tier.id}:${picked[0].id}`); return true; },
      exhaust: async () => { calls.push('exhaust'); return true; },
    });
    await runComponentElection(adapter, {}, {});
    expect(calls).toEqual(['select:t6:kw']);
  });
  it('multiSelect 整集采纳（MCP/Skill）', async () => {
    const calls: string[] = [];
    const adapter = makeAdapter<{ id: string }>({
      multiSelect: true,
      extractSignals: async () => makeSignals([
        makeCandidate('m1', { vectorScore: 90 }),
        makeCandidate('m2', { vectorScore: 82 }),
      ]),
      select: async (_i, _o, picked, tier) => { calls.push(`select:${tier.id}:${picked.length}`); return true; },
      exhaust: async () => { calls.push('exhaust'); return true; },
    });
    await runComponentElection(adapter, {}, {});
    expect(calls).toEqual(['select:t1:2']);
  });
});
