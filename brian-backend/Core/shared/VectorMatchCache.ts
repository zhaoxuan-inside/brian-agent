import { createHash } from 'crypto';
import { FifoCache } from './FifoCache';
import { MatchCache, VectorSimilarity } from './MatchConstants';

export interface MatchCacheRecord {
  key: string;
  embedding: number[];
  result: Array<{ id: string; score: number }>;
  ts: number;
  
  negativeMiss?: number;
}

export class VectorMatchCache {
  private store: FifoCache<MatchCacheRecord>;
  private similarityThreshold = VectorSimilarity.Default;
  private capacity = MatchCache.Capacity;
  
  private ttlMs = MatchCache.TtlMs;

  constructor(
    maxEntries: number = MatchCache.Capacity,
    similarityThreshold: number = VectorSimilarity.Default,
  ) {
    this.store = new FifoCache<MatchCacheRecord>(maxEntries);
    this.capacity = maxEntries;
    this.similarityThreshold = similarityThreshold;
  }

  
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

  
  async embedOf(task: string, embed: (text: string) => Promise<number[]>): Promise<number[]> {
    return (await safeEmbed(task, embed)) ?? [];
  }

  
  commit(key: string, embedding: number[], result: Array<{ id: string; score: number }>): void {
    this.store.set(key, { key, embedding: embedding ?? [], result, ts: Date.now() });
  }

  

  countNegativeMiss(task: string, forceRefetchAfter = 0): boolean {
    const key = buildCacheKey(task);
    const record = this.store.get(key);
    if (!record || record.result.length > 0) {
      return false;
    }
    const miss = (record.negativeMiss ?? 0) + 1;
    if (miss > forceRefetchAfter) {
      this.store.delete(key);
      return true;
    }
    record.negativeMiss = miss;
    record.ts = Date.now();
    return false;
  }

  
  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  
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

  
  private fresh(ts: number): boolean {
    return Date.now() - ts < this.ttlMs;
  }
}

export function buildCacheKey(task: string): string {
  return createHash('md5').update((task ?? '').slice(0, MatchCache.EmbedTaskChars)).digest('hex');
}

async function safeEmbed(task: string, embed: (text: string) => Promise<number[]>): Promise<number[] | null> {
  try {
    const embedding = await embed((task ?? '').slice(0, MatchCache.EmbedTaskChars));
    return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
  } catch {
    return null;
  }
}

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

function dotProduct(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}
