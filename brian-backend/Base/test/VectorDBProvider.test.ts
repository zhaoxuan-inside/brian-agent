/**
 * @fileoverview VectorDBProvider / VectorDBComponent 阈值与搜索测试。
 *
 * 覆盖：
 * - normalizeMetricScore：不同度量下原始相似度到 0-100 的归一化映射
 * - normalizedThresholdToRaw：归一化阈值到原始阈值的逆映射（含 0/100 边界）
 * - search 原生 ANN 分支：原始阈值过滤是否生效（修复：raw vs raw 比较）
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { VectorDBComponent } from '../components/VectorDB/VectorDBComponent';
import { VectorDBAccess } from '../VectorDBProvider/access/VectorDBAccess';
import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';

describe('VectorDBComponent 阈值归一化', () => {
  it('normalizeMetricScore: cosine [-1,1] -> [0,100]', () => {
    expect(VectorDBComponent.normalizeMetricScore(1, 'cosine', 1536)).toBe(100);
    expect(VectorDBComponent.normalizeMetricScore(0, 'cosine', 1536)).toBe(50);
    expect(VectorDBComponent.normalizeMetricScore(-1, 'cosine', 1536)).toBe(0);
  });

  it('normalizeMetricScore: euclidean (0,1] -> (0,100]', () => {
    expect(VectorDBComponent.normalizeMetricScore(1, 'euclidean', 1536)).toBe(100);
    expect(VectorDBComponent.normalizeMetricScore(0.5, 'euclidean', 1536)).toBe(50);
    expect(VectorDBComponent.normalizeMetricScore(0, 'euclidean', 1536)).toBe(0);
  });

  it('normalizedThresholdToRaw: 0 表示不设阈值（返回全部）', () => {
    expect(VectorDBComponent.normalizedThresholdToRaw(0, 'cosine', 1536)).toBe(-Infinity);
    expect(VectorDBComponent.normalizedThresholdToRaw(0, 'euclidean', 1536)).toBe(-Infinity);
    expect(VectorDBComponent.normalizedThresholdToRaw(0, 'dot', 1536)).toBe(-Infinity);
  });

  it('normalizedThresholdToRaw: 100 表示仅完全匹配（修复后不再是 -Infinity）', () => {
    // cosine 完全匹配 raw=1.0
    expect(VectorDBComponent.normalizedThresholdToRaw(100, 'cosine', 1536)).toBe(1);
    // euclidean 完全匹配 raw=1.0
    expect(VectorDBComponent.normalizedThresholdToRaw(100, 'euclidean', 1536)).toBe(1);
    // dot 无界，完全匹配对应 +Infinity
    expect(VectorDBComponent.normalizedThresholdToRaw(100, 'dot', 1536)).toBe(Infinity);
  });

  it('normalizedThresholdToRaw: 中间值逆映射正确', () => {
    expect(VectorDBComponent.normalizedThresholdToRaw(75, 'cosine', 1536)).toBeCloseTo(0.5, 10);
    expect(VectorDBComponent.normalizedThresholdToRaw(50, 'euclidean', 1536)).toBeCloseTo(0.5, 10);
    expect(VectorDBComponent.normalizedThresholdToRaw(25, 'cosine', 1536)).toBeCloseTo(-0.5, 10);
  });

  it('normalize/normalizedThresholdToRaw 互逆（cosine 非边界）', () => {
    for (const t of [10, 30, 50, 70, 90]) {
      const raw = VectorDBComponent.normalizedThresholdToRaw(t, 'cosine', 1536);
      const back = VectorDBComponent.normalizeMetricScore(raw, 'cosine', 1536);
      expect(back).toBeCloseTo(t, 0);
    }
  });
});

describe('VectorDBComponent.search 原生分支阈值过滤', () => {
  let dir: string;
  let comp: VectorDBComponent;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'brian-vectordb-'));
    comp = new VectorDBComponent(dir);
    await comp.init(4, 'cosine');
    await comp.upsert({
      id: 'A',
      content: 'A',
      embedding: [1, 0, 0, 0],
      user_id: null,
      metadata: null,
      created: 1,
      updated: 1,
    });
    await comp.upsert({
      id: 'B',
      content: 'B',
      embedding: [0, 1, 0, 0],
      user_id: null,
      metadata: null,
      created: 1,
      updated: 1,
    });
  });

  afterAll(() => {
    try {
      comp.close();
    } catch { /* ignore */ }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('无阈值时返回全部（raw threshold = -Infinity）', async () => {
    const hits = await comp.search([1, 0, 0, 0], 10, -Infinity);
    expect(hits.map((h) => h.id).sort()).toEqual(['A', 'B']);
  });

  it('阈值 75（raw=0.5）时仅返回相似向量 A', async () => {
    const hits = await comp.search([1, 0, 0, 0], 10, 0.5);
    expect(hits.map((h) => h.id)).toEqual(['A']);
  });

  it('阈值 100（raw=1.0）时仅返回完全匹配 A', async () => {
    const raw = VectorDBComponent.normalizedThresholdToRaw(100, 'cosine', 4);
    expect(raw).toBe(1);
    const hits = await comp.search([1, 0, 0, 0], 10, raw);
    expect(hits.map((h) => h.id)).toEqual(['A']);
  });
});

describe('VectorDBAccess.applyMetric 运行时切换度量', () => {
  let dir: string;
  let relationDb: RelationDBAccess;
  let access: VectorDBAccess;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'brian-vectordb-access-'));
    relationDb = new RelationDBAccess({ dbPath: join(dir, 'test.db') });
    await relationDb.initialize();
    access = new VectorDBAccess(relationDb, {
      lancePath: join(dir, 'vectordb'),
      dimension: 4,
      metric: 'cosine',
    });
    await access.initialize();
  });

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('默认度量为 cosine', () => {
    expect(access.getMetric()).toBe('cosine');
  });

  it('applyMetric 将 L2 / IP 映射为 euclidean / dot 并即时生效', async () => {
    await access.applyMetric('L2');
    expect(access.getMetric()).toBe('euclidean');
    await access.applyMetric('IP');
    expect(access.getMetric()).toBe('dot');
    await access.applyMetric('COSINE');
    expect(access.getMetric()).toBe('cosine');
  });

  it('已有向量数据时 applyMetric 抛错', async () => {
    const out: { ids: string[] } = { ids: [] };
    await access.addVector(
      Object.assign({}, { vectors: [{ content: 'x', embedding: [1, 0, 0, 0] }] }),
      Object.assign({}, {}),
      out,
    );
    await expect(access.applyMetric('L2')).rejects.toThrow(/向量数据/);
  });
});

describe('VectorDBAccess.applyDimension 运行时切换维度', () => {
  let dir: string;
  let relationDb: RelationDBAccess;
  let access: VectorDBAccess;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'brian-vectordb-dim-'));
    relationDb = new RelationDBAccess({ dbPath: join(dir, 'test.db') });
    await relationDb.initialize();
    access = new VectorDBAccess(relationDb, {
      lancePath: join(dir, 'vectordb'),
      metric: 'cosine',
    });
    await access.initialize(4);
  });

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('initialize(dimension) 以传入维度为准（覆盖构造器默认）', () => {
    expect(access.getDimension()).toBe(4);
  });

  it('applyDimension 修改维度并重建向量表，无数据时即时生效', async () => {
    await access.applyDimension(8);
    expect(access.getDimension()).toBe(8);
    // 新维度可正常写入向量
    const out: { ids: string[] } = { ids: [] };
    await access.addVector(
      Object.assign({}, { vectors: [{ content: 'x', embedding: new Array(8).fill(0) }] }),
      out,
      Object.assign({}, {}),
    );
    expect(out.ids.length).toBe(1);
  });

  it('applyDimension 非法值抛错', async () => {
    await expect(access.applyDimension(0)).rejects.toThrow(/正整数/);
    await expect(access.applyDimension(-1)).rejects.toThrow(/正整数/);
  });
});

describe('VectorDBService.initializeConfig 默认配置写入与 enabled 恢复', () => {
  let dir: string;
  let relationDb: RelationDBAccess;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'brian-vectordb-initcfg-'));
    relationDb = new RelationDBAccess({ dbPath: join(dir, 'test.db') });
    await relationDb.initialize();
  });

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('initialize 写入全部默认配置项（幂等，不覆盖已有值）', async () => {
    const access = new VectorDBAccess(relationDb, {
      lancePath: join(dir, 'vectordb-a'),
      dimension: 4,
      metric: 'cosine',
    });
    await access.initialize();
    const rows = relationDb.queryRaw<{ config_key: string; config_value: string }>(
      'SELECT "config_key", "config_value" FROM "vectordb_config" ORDER BY "config_key"',
      [],
    );
    const map = new Map(rows.map((r) => [r.config_key, r.config_value]));
    expect(map.get('enabled')).toBe('true');
    expect(map.get('default_top_k')).toBe('10');
    expect(map.get('default_similarity_threshold')).toBe('0');
    expect(map.get('default_distance_metric')).toBe('COSINE');

    // 幂等：修改一个已有值后重复 initialize，已有值不被覆盖、不产生重复行
    relationDb.executeRaw(
      "UPDATE \"vectordb_config\" SET \"config_value\" = '25' WHERE \"config_key\" = 'default_top_k'",
    );
    await access.initialize();
    const rows2 = relationDb.queryRaw<{ config_key: string; config_value: string }>(
      'SELECT "config_key", "config_value" FROM "vectordb_config"',
      [],
    );
    const map2 = new Map(rows2.map((r) => [r.config_key, r.config_value]));
    expect(map2.get('default_top_k')).toBe('25');
    expect(rows2.length).toBe(4);
  });

  it('禁用状态持久化：重启（重新 initialize）后 enabled=false 被恢复', async () => {
    const out: { ids: string[] } = { ids: [] };
    const access = new VectorDBAccess(relationDb, {
      lancePath: join(dir, 'vectordb-b'),
      dimension: 4,
      metric: 'cosine',
    });
    await access.initialize();
    await access.enableVectorDB(
      Object.assign({}, { enable: false }),
      Object.assign({}, {}),
      Object.assign({}, {}),
    );
    // 模拟重启：重新 initialize，禁用状态应从配置表恢复
    await access.initialize();
    await expect(access.addVector(
      Object.assign({}, { vectors: [{ content: 'x', embedding: [1, 0, 0, 0] }] }),
      out,
      Object.assign({}, {}),
    )).rejects.toThrow();
  });
});
