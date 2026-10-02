import { describe, it, expect } from 'vitest';
import {
  funnelBm25Ranking,
  funnelVectorRanking,
  funnelSemanticRouterRanking,
  funnelBm25Stage,
  funnelVectorStage,
  funnelSemanticRouterStage,
  type FunnelDoc,
} from '@brian-agent/base';

const DOCS: FunnelDoc[] = [
  { id: 'travel', name: '心绪漫游向导', brief: '城市出行散步休闲路线推荐' },
  { id: 'finance', name: '行情瞭望', brief: '股市行情走势分析' },
  { id: 'calendar', name: '日程管家', brief: '日历与待办事项管理' },
];

describe('funnelBm25Ranking (全量排序算法)', () => {
  it('返回全部 raw>0 候选并按绝对置信度降序', () => {
    const query = '周末帮我推荐几个适合出行的城市散步路线';
    const ranking = funnelBm25Ranking(query, DOCS);
    expect(ranking.length).toBeGreaterThanOrEqual(2);
    expect(ranking[0].doc.id).toBe('travel');
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1].score).toBeGreaterThanOrEqual(ranking[i].score);
    }
  });

  it('空 query 或空文档集返回空数组', () => {
    expect(funnelBm25Ranking('', DOCS)).toHaveLength(0);
    expect(funnelBm25Ranking('散步路线', [])).toHaveLength(0);
  });

  it('与 funnelBm25Stage 阈值语义一致（顶级候选即 stage 采纳结果）', () => {
    const query = '周末帮我推荐几个适合出行的城市散步路线';
    const ranking = funnelBm25Ranking(query, DOCS);
    const pick = funnelBm25Stage(query, DOCS);
    if ((ranking[0]?.score ?? 0) >= 90) {
      expect(pick?.doc.id).toBe(ranking[0].doc.id);
    } else {
      expect(pick).toBeNull();
    }
  });
});

describe('funnelVectorRanking (全量余弦排序算法)', () => {
  const queryEmb = [1, 0, 0];
  const embedDoc = async (d: FunnelDoc): Promise<number[]> => {
    const table: Record<string, number[]> = {
      travel: [0.9, 0.1, 0],
      finance: [0.2, 0.9, 0],
      calendar: [0, 0, 1],
    };
    return table[d.id] ?? [];
  };

  it('返回全部可计算候选并按相似度降序', async () => {
    const ranking = await funnelVectorRanking(queryEmb, DOCS, embedDoc);
    expect(ranking).toHaveLength(3);
    expect(ranking[0].doc.id).toBe('travel');
    expect(ranking[0].score).toBeGreaterThanOrEqual(ranking[1].score);
    expect(ranking[2].doc.id).toBe('calendar');
  });

  it('embed 失败候选被跳过且不参与排序', async () => {
    const ranking = await funnelVectorRanking(queryEmb, DOCS, async (d) => (d.id === 'finance' ? [] : embedDoc(d)));
    expect(ranking.map((e) => e.doc.id)).not.toContain('finance');
  });

  it('与 funnelVectorStage 阈值语义一致（顶级候选即 stage 采纳结果）', async () => {
    const ranking = await funnelVectorRanking(queryEmb, DOCS, embedDoc);
    const pick = await funnelVectorStage(queryEmb, DOCS, embedDoc);
    if ((ranking[0]?.score ?? 0) >= 90) {
      expect(pick?.doc.id).toBe(ranking[0].doc.id);
    } else {
      expect(pick).toBeNull();
    }
  });
});

describe('funnelSemanticRouterRanking (语义路由器：能力职责+范例集 Max-Sim)', () => {
  const queryEmb = [1, 0, 0];
  const embedDoc = async (d: FunnelDoc): Promise<number[]> => {
    // 假设描述向量只有中等相似度
    const table: Record<string, number[]> = {
      travel: [0.6, 0.4, 0],
      finance: [0.2, 0.8, 0],
      calendar: [0, 0, 1],
    };
    return table[d.id] ?? [];
  };

  it('当工作范例具有高相似度时，Max-Sim 命中并提升候选排序得分', async () => {
    // 为 travel 组件配置典型 Few-shot 范例向量 [0.98, 0.02, 0]
    const exampleEmbeddings = new Map<string, number[][]>([
      ['travel', [[0.98, 0.02, 0], [0.5, 0.5, 0]]],
      ['calendar', [[0, 0.1, 0.9]]],
    ]);

    const ranking = await funnelSemanticRouterRanking(queryEmb, DOCS, embedDoc, undefined, exampleEmbeddings);
    expect(ranking.length).toBe(3);
    expect(ranking[0].doc.id).toBe('travel');
    expect(ranking[0].score).toBeGreaterThanOrEqual(95);
    expect(ranking[0].matchedBy).toBe('example');
  });

  it('当范例不存在或相似度低于描述时，平滑回退描述向量', async () => {
    const ranking = await funnelSemanticRouterRanking(queryEmb, DOCS, embedDoc);
    expect(ranking.length).toBe(3);
    expect(ranking[0].doc.id).toBe('travel');
    expect(ranking[0].matchedBy).toBe('desc');
  });

  it('与 funnelSemanticRouterStage 阈值判定一致', async () => {
    const exampleEmbeddings = new Map<string, number[][]>([
      ['travel', [[1, 0, 0]]],
    ]);
    const pick = await funnelSemanticRouterStage(queryEmb, DOCS, embedDoc, 90, undefined, exampleEmbeddings);
    expect(pick).not.toBeNull();
    expect(pick?.doc.id).toBe('travel');
    expect(pick?.source).toBe('semantic_router');
    expect(pick?.score).toBe(100);
  });
});

describe('funnelBm25Ranking 正负范例双向 (BM25 词项增强)', () => {
  const QUERY = '帮我查一下快递到哪了';
  const DUAL_DOCS: FunnelDoc[] = [
    { id: 'logistics', name: '快递物流追踪', brief: '查询快递包裹物流轨迹与签收状态' },
    { id: 'shopping', name: '网购售后维权', brief: '处理退换货申请与运费说明' },
  ];

  it('正向范例并入正文:查询词命中范例即获得 BM25 加分', () => {
    const base = funnelBm25Ranking(QUERY, DUAL_DOCS);
    const boosted = funnelBm25Ranking(QUERY, DUAL_DOCS, {
      positiveExamples: new Map([['shopping', ['查询快递包裹物流']]]),
    });
    const baseScore = base.find((e) => e.doc.id === 'shopping')?.score ?? 0;
    const boostedScore = boosted.find((e) => e.doc.id === 'shopping')?.score ?? 0;
    expect(boostedScore).toBeGreaterThan(baseScore);
  });

  it('负向部分命中降权:得分低于基线且记录 negativeHit', () => {
    const base = funnelBm25Ranking(QUERY, DUAL_DOCS);
    const demoted = funnelBm25Ranking(QUERY, DUAL_DOCS, {
      negativeExamples: new Map([['logistics', ['帮我改一下收货地址']]]),
    });
    const baseEntry = base.find((e) => e.doc.id === 'logistics');
    const demotedEntry = demoted.find((e) => e.doc.id === 'logistics');
    expect(baseEntry).toBeDefined();
    expect(demotedEntry?.negativeHit).toBeGreaterThan(0);
    expect(demotedEntry!.score).toBeLessThan(baseEntry!.score);
    expect(demotedEntry?.rejected).toBeFalsy();
  });

  it('负向全覆盖硬阻断:score=0 且 rejected=true,stage 拒绝采纳', () => {
    const options = { negativeExamples: new Map([['logistics', [QUERY]]]) };
    const ranking = funnelBm25Ranking(QUERY, DUAL_DOCS, options);
    const rejected = ranking.find((e) => e.doc.id === 'logistics');
    expect(rejected?.rejected).toBe(true);
    expect(rejected?.score).toBe(0);
    expect(rejected?.rejectionReason).toBe('negative_example_hard_reject');
    expect(funnelBm25Stage(QUERY, DUAL_DOCS, 1, options)).toBeNull();
  });

  it('无范例选项时行为与旧版完全一致(向后兼容)', () => {
    const legacy = funnelBm25Ranking(QUERY, DUAL_DOCS);
    const withEmptyOptions = funnelBm25Ranking(QUERY, DUAL_DOCS, {
      positiveExamples: new Map(), negativeExamples: new Map(),
    });
    expect(withEmptyOptions.map((e) => [e.doc.id, e.score])).toEqual(legacy.map((e) => [e.doc.id, e.score]));
  });
});
