/**
 * @fileoverview 组件匹配结果缓存（MD5 精确 + 向量相似度两级命中）。
 *
 * 逻辑控制（算法）：lookup 两级命中判定；
 * 数据处理（加工）：buildCacheKey (MD5) / commit / 淘汰由 FifoCache 承担。
 *
 * 命中流程：
 *   1) MD5(task) 精确命中 → 直接返回；
 *   2) 未命中 → 对 task 计算向量（由调用方注入 embed 回调），遍历缓存计算
 *      余弦相似度，最佳相似度 >= 阈值（默认 0.80）→ 返回该条目；
 *   3) 均未命中 → 返回 null，由调用方走 LLM 排序后 commit 写缓存。
 */
import { createHash } from 'crypto';
import { FifoCache } from './FifoCache';
import { MatchCache, VectorSimilarity } from './MatchConstants';

/** 缓存条目 */
export interface MatchCacheRecord {
  key: string;
  embedding: number[];
  result: Array<{ id: string; score: number }>;
  ts: number;
}

export class VectorMatchCache {
  private store: FifoCache<MatchCacheRecord>;
  private similarityThreshold = VectorSimilarity.Default;
  private capacity = MatchCache.Capacity;
  /** TTL（毫秒；可由 configure 调整，缺省枚举默认） */
  private ttlMs = MatchCache.TtlMs;

  constructor(
    maxEntries: number = MatchCache.Capacity,
    similarityThreshold: number = VectorSimilarity.Default,
  ) {
    this.store = new FifoCache<MatchCacheRecord>(maxEntries);
    this.capacity = maxEntries;
    this.similarityThreshold = similarityThreshold;
  }

  /** 动态重配置（逻辑控制）：容量变化时重建存储（清空），TTL 与相似度阈值立即生效 */
  configure(options?: { capacity?: number; similarityThreshold?: number; ttlMs?: number }): void {
    if (options?.ttlMs !== undefined && options.ttlMs > 0) {
      this.ttlMs = options.ttlMs;
    }
    if (options?.similarityThreshold !== undefined) {
      this.similarityThreshold = options.similarityThreshold;
    }
    if (options?.capacity !== undefined && options.capacity > 0 && options.capacity !== this.capacity) {
      this.capacity = options.capacity;
      const old = this.store;
      this.store = new FifoCache<MatchCacheRecord>(this.capacity);
      for (const [key, record] of old.entries()) {
        this.store.set(key, record);
      }
    }
  }

  /**
   * 两级查找（逻辑控制）。
   * @param task 当前任务内容
   * @param embed 向量化回调（调用方注入；失败时仅 MD5 一级命中参与判定）
   * @returns record 命中条目（可能为 null）；query 为本次任务的向量（供 commit 复用，可能为 null）
   */
  async lookup(
    task: string,
    embed: (text: string) => Promise<number[]>,
  ): Promise<{ record: MatchCacheRecord | null; query: number[] | null }> {
    const exact = this.store.get(buildCacheKey(task));
    if (exact && this.fresh(exact.ts)) {
      exact.ts = Date.now();
      return { record: exact, query: exact.embedding };
    }
    const query = await safeEmbed(task, embed);
    if (!query) {
      return { record: null, query: null };
    }
    return { record: this.bestBySimilarity(query), query };
  }

  /** 任务向量计算（数据处理；供 commit 前无缓存可复用时的补算） */
  async embedOf(task: string, embed: (text: string) => Promise<number[]>): Promise<number[]> {
    return (await safeEmbed(task, embed)) ?? [];
  }

  /** 写缓存（数据处理；embedding 可为空数组 —— 仅参与 MD5 一级命中，不参与相似度层） */
  commit(key: string, embedding: number[], result: Array<{ id: string; score: number }>): void {
    this.store.set(key, { key, embedding: embedding ?? [], result, ts: Date.now() });
  }

  /** 清空（配置变更时调用） */
  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  /** 相似度最佳条目（逻辑控制；全过期视为未命中） */
  private bestBySimilarity(query: number[]): MatchCacheRecord | null {
    let best: MatchCacheRecord | null = null;
    let bestScore = this.similarityThreshold;
    for (const [, record] of this.store.entries()) {
      if (!this.fresh(record.ts)) {
        this.store.delete(record.key);
        continue;
      }
      if (!record.embedding?.length) {
        continue;
      }
      const sim = cosineSimilarity(query, record.embedding);
      if (sim >= bestScore) {
        bestScore = sim;
        best = record;
      }
    }
    if (best) {
      best.ts = Date.now();
    }
    return best;
  }

  /** TTL 判定（数据处理） */
  private fresh(ts: number): boolean {
    return Date.now() - ts < this.ttlMs;
  }
}

/** 缓存键（数据处理）：MD5（任务前缀） */
export function buildCacheKey(task: string): string {
  return createHash('md5').update((task ?? '').slice(0, MatchCache.EmbedTaskChars)).digest('hex');
}

/** 计算向量（数据处理；失败返回 null，降级为纯 MD5 缓存） */
async function safeEmbed(task: string, embed: (text: string) => Promise<number[]>): Promise<number[] | null> {
  try {
    const embedding = await embed((task ?? '').slice(0, MatchCache.EmbedTaskChars));
    return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
  } catch {
    return null;
  }
}

/** 余弦相似度（放在本模块私有使用；公开版在 SimilarityHelper） */
function cosineSimilarity(a: number[], b: number[]): number {
  const dotAB = dotProduct(a, b);
  const normA = dotProduct(a, a);
  const normB = dotProduct(b, b);
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) {
    return 0;
  }
  return dotAB / denom;
}

/** 内积（数据处理；长度不一致时按最短截断） */
function dotProduct(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
