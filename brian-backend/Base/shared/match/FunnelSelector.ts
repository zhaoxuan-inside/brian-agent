import { rankCandidatesByBM25, tokenizeForSearch, type BM25CandidateDoc } from './bm25';

export interface FunnelDoc {
  id: string;
  name: string;
  brief: string;
}

export interface FunnelPick<T extends FunnelDoc> {
  doc: T;
  score: number;
  source: 'bm25' | 'vector' | 'semantic_router';
}

/** 全量排序条目:score 为百分制展示分,raw 保留未取整原值(向量阶段阈值判定用) */
export interface FunnelRankingEntry<T extends FunnelDoc> {
  doc: T;
  score: number;
  raw: number;
  matchedBy?: 'desc' | 'example';
  rejected?: boolean;
  rejectionReason?: string;
  negativeSim?: number;
  /** BM25 稀疏通道:查询词项被负向范例覆盖的比例(0~1,逐条范例取最大) */
  negativeHit?: number;
  /** 语义路由通道:正范例 Max-Sim 原始值(0~100,未与描述向量取 max、未软惩罚) */
  exampleSim?: number;
}

export const FUNNEL_ADOPT_THRESHOLD = 90;

/** BM25 负向命中降权系数:score × (1 - 0.4 × coverage),coverage→1 时最大降权 60%,可靠阻断 ≥90 快速直通 */
export const FUNNEL_BM25_NEGATIVE_PENALTY = 0.4;

export interface FunnelBm25Options {
  /** 正向范例文本(按 doc.id):并入文档正文参与 BM25 词项匹配,查询词命中范例即自然加分 */
  positiveExamples?: Map<string, string[]>;
  /** 负向范例文本(按 doc.id):查询词项被排除范例覆盖时按比例降权,全覆盖判硬阻断 */
  negativeExamples?: Map<string, string[]>;
}

/** 把 ComponentExamplesText 映射(结构化兼容,避免 FunnelSelector 反向依赖 Helper)为 BM25 双向选项 */
export function toFunnelBm25Options(examples: Map<string, { positive: string[]; negative: string[] }>): FunnelBm25Options {
  const positiveExamples = new Map<string, string[]>();
  const negativeExamples = new Map<string, string[]>();
  for (const [id, ex] of examples) {
    if (ex.positive?.length) positiveExamples.set(id, ex.positive);
    if (ex.negative?.length) negativeExamples.set(id, ex.negative);
  }
  return { positiveExamples, negativeExamples };
}

/** 单条负向范例对查询词项的覆盖率(逐条取最大,对齐向量通道 Max-Sem 语义) */
function computeNegativeCoverage(queryTokens: Set<string>, negatives?: string[]): number {
  if (!queryTokens.size || !negatives?.length) return 0;
  let max = 0;
  for (const text of negatives) {
    const negTokens = new Set(tokenizeForSearch(text));
    if (negTokens.size === 0) continue;
    let hit = 0;
    for (const t of queryTokens) if (negTokens.has(t)) hit++;
    if (hit >= queryTokens.size) return 1;
    max = Math.max(max, hit / queryTokens.size);
  }
  return max;
}

export const FUNNEL_MIN_BRIEF_CHARS = 8;

export function buildFunnelDocText(name: string, brief: string): string {
  const n = String(name ?? '').trim();
  const b = String(brief ?? '').trim();
  return `${n} ${n} ${b}`;
}

export function findLowQualityBriefs(docs: FunnelDoc[]): string[] {
  return docs.filter((d) => String(d.brief ?? '').trim().length < FUNNEL_MIN_BRIEF_CHARS).map((d) => d.id);
}

function absoluteConfidence(rawScore: number, queryTokens: string[], docs: BM25CandidateDoc[]): number {
  const numDocs = Math.max(1, docs.length);
  const docTokenList = docs.map((d) => tokenizeForSearch(d.text));
  const dfMap = new Map<string, number>();
  for (const tokens of docTokenList) {
    for (const t of new Set(tokens)) dfMap.set(t, (dfMap.get(t) || 0) + 1);
  }
  const k1 = 1.2;
  const saturationWeight = (k1 + 1) / (1 + k1);
  let ideal = 0;
  for (const q of new Set(queryTokens)) {
    const df = dfMap.get(q) || 0;
    const idf = Math.log(1 + (numDocs - df + 0.5) / (df + 0.5));
    ideal += Math.max(0, idf) * saturationWeight;
  }
  if (ideal <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((rawScore / ideal) * 100)));
}

/**
 * BM25 全量排序:对全部候选计算绝对置信度(raw/ideal)并降序返回(纯计算)。
 * 双向范例增强(纯词项层面,不含 IO):
 * 1. 正向匹配加分——范例文本并入候选正文,查询词命中范例即按 BM25 词频自然提分;
 * 2. 负向命中降权——查询词项被某条负向范例覆盖时按 coverage 比例降权,
 *    全覆盖(coverage=1)判硬阻断 score=0,与向量通道 hard_reject 语义对齐。
 */
export function funnelBm25Ranking<T extends FunnelDoc>(
  query: string,
  docs: T[],
  options?: FunnelBm25Options,
): FunnelRankingEntry<T>[] {
  if (!query || docs.length === 0) return [];
  const queryTokens = new Set(tokenizeForSearch(query));
  const bm25Docs: BM25CandidateDoc[] = docs.map((d) => {
    const pos = options?.positiveExamples?.get(d.id) ?? [];
    return { id: d.id, text: `${buildFunnelDocText(d.name, d.brief)} ${pos.join(' ')}`.trim() };
  });
  const nameOf = new Map(docs.map((d) => [d.id, d]));
  return rankCandidatesByBM25(query, bm25Docs, 1)
    .map((r): FunnelRankingEntry<T> | null => {
      const doc = nameOf.get(r.id);
      if (!doc) return null;
      const negativeHit = computeNegativeCoverage(queryTokens, options?.negativeExamples?.get(doc.id));
      if (negativeHit >= 1) {
        return { doc, score: 0, raw: 0, rejected: true, rejectionReason: 'negative_example_hard_reject', negativeHit };
      }
      const base = absoluteConfidence(r.rawScore, [...queryTokens], bm25Docs);
      const score = negativeHit > 0 ? Math.max(0, Math.round(base * (1 - FUNNEL_BM25_NEGATIVE_PENALTY * negativeHit))) : base;
      return { doc, score, raw: r.rawScore, negativeHit: negativeHit > 0 ? negativeHit : undefined };
    })
    .filter((e): e is FunnelRankingEntry<T> => e !== null)
    .sort((a, b) => b.score - a.score);
}

/** 向量全量排序:对全部候选计算余弦相似度百分制并降序返回(支持预存向量直接匹配 + 缺失懒加载回退) */
export async function funnelVectorRanking<T extends FunnelDoc>(
  queryEmbedding: number[],
  docs: T[],
  embedDoc: (doc: T) => Promise<number[]>,
  precomputed?: Map<string, number[]>,
): Promise<FunnelRankingEntry<T>[]> {
  if (!queryEmbedding || queryEmbedding.length === 0 || docs.length === 0) return [];
  const embeddings = await Promise.all(
    docs.map(async (d) => {
      let vec = precomputed?.get(d.id);
      if (!vec || vec.length !== queryEmbedding.length) {
        vec = await embedDoc(d).catch(() => [] as number[]);
      }
      return { doc: d, vec };
    }),
  );
  return embeddings
    .map(({ doc, vec }) => {
      const similarity = cosineSimilarity(queryEmbedding, vec);
      if (similarity === null) return null;
      return { doc, score: Math.round(similarity * 100), raw: similarity };
    })
    .filter((e): e is FunnelRankingEntry<T> => e !== null)
    .sort((a, b) => b.score - a.score);
}

export function funnelBm25Stage<T extends FunnelDoc>(
  query: string,
  docs: T[],
  threshold: number = FUNNEL_ADOPT_THRESHOLD,
  options?: FunnelBm25Options,
): FunnelPick<T> | null {
  const top = funnelBm25Ranking(query, docs, options)[0];
  if (!top || top.rejected || top.score < threshold) return null;
  return { doc: top.doc, score: top.score, source: 'bm25' };
}

export async function funnelVectorStage<T extends FunnelDoc>(
  queryEmbedding: number[],
  docs: T[],
  embedDoc: (doc: T) => Promise<number[]>,
  threshold: number = FUNNEL_ADOPT_THRESHOLD,
  precomputed?: Map<string, number[]>,
): Promise<FunnelPick<T> | null> {
  const top = (await funnelVectorRanking(queryEmbedding, docs, embedDoc, precomputed))[0];
  if (!top || top.raw * 100 < threshold) return null;
  return { doc: top.doc, score: top.score, source: 'vector' };
}

export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (!a?.length || !b?.length || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na <= 0 || nb <= 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 语义路由器全量排序（Semantic Router）：
 * 综合「能力职责向量相似度 S_desc」与「正向工作范例集 Max-Sim 相似度 S_examples_pos」
 * 结合「负向排除范例集 Max-Sim 相似度 S_examples_neg」：
 * 1. S_pos = max(S_desc, max_{p in Pos} cos(v_q, v_p))
 * 2. 若 S_neg >= 0.85: 触发硬阻断 (Hard Reject, score=0)
 * 3. 若 0.70 <= S_neg < 0.85: 触发软惩罚 (S_pos * (1 - S_neg))
 * 4. 降序返回各候选评分。
 */
export async function funnelSemanticRouterRanking<T extends FunnelDoc>(
  queryEmbedding: number[],
  docs: T[],
  embedDoc: (doc: T) => Promise<number[]>,
  precomputedDesc?: Map<string, number[]>,
  positiveExampleEmbeddings?: Map<string, number[][]>,
  negativeExampleEmbeddings?: Map<string, number[][]>,
): Promise<FunnelRankingEntry<T>[]> {
  if (!queryEmbedding || queryEmbedding.length === 0 || docs.length === 0) return [];
  const entries: FunnelRankingEntry<T>[] = [];

  for (const doc of docs) {
    const descVec = await resolveDescVector(doc, queryEmbedding.length, embedDoc, precomputedDesc);
    const descSim = descVec ? cosineSimilarity(queryEmbedding, descVec) : null;

    const posExamples = positiveExampleEmbeddings?.get(doc.id) || [];
    const maxPosSim = computeMaxExampleSimilarity(queryEmbedding, posExamples);

    let bestPosSim: number | null = null;
    if (descSim !== null && maxPosSim !== null) {
      bestPosSim = Math.max(descSim, maxPosSim);
    } else if (descSim !== null) {
      bestPosSim = descSim;
    } else if (maxPosSim !== null) {
      bestPosSim = maxPosSim;
    }

    if (bestPosSim === null) continue;

    const negExamples = negativeExampleEmbeddings?.get(doc.id) || [];
    const maxNegSim = computeMaxExampleSimilarity(queryEmbedding, negExamples);

    const matchedBy = (maxPosSim !== null && (descSim === null || maxPosSim > descSim)) ? 'example' : 'desc';

    if (maxNegSim !== null && maxNegSim >= 0.85) {
      entries.push({
        doc,
        score: 0,
        raw: 0,
        matchedBy,
        rejected: true,
        rejectionReason: 'negative_example_hard_reject',
        negativeSim: maxNegSim,
      });
      continue;
    }

    let finalSim = bestPosSim;
    if (maxNegSim !== null && maxNegSim >= 0.70) {
      finalSim = bestPosSim * (1 - maxNegSim);
    }

    entries.push({
      doc,
      score: Math.max(0, Math.round(finalSim * 100)),
      raw: finalSim,
      matchedBy,
      negativeSim: maxNegSim ?? undefined,
      exampleSim: maxPosSim !== null ? Math.round(maxPosSim * 100) : undefined,
    });
  }

  return entries.sort((a, b) => b.score - a.score);
}

function computeMaxExampleSimilarity(queryEmbedding: number[], examples: number[][]): number | null {
  if (!examples || examples.length === 0) return null;
  let maxSim: number | null = null;
  for (const exVec of examples) {
    if (exVec && exVec.length === queryEmbedding.length) {
      const sim = cosineSimilarity(queryEmbedding, exVec);
      if (sim !== null) {
        maxSim = maxSim === null ? sim : Math.max(maxSim, sim);
      }
    }
  }
  return maxSim;
}

async function resolveDescVector<T extends FunnelDoc>(
  doc: T,
  expectedDim: number,
  embedDoc: (doc: T) => Promise<number[]>,
  precomputedDesc?: Map<string, number[]>,
): Promise<number[] | null> {
  let vec = precomputedDesc?.get(doc.id);
  if (!vec || vec.length !== expectedDim) {
    vec = await embedDoc(doc).catch(() => [] as number[]);
  }
  return vec && vec.length === expectedDim ? vec : null;
}

export async function funnelSemanticRouterStage<T extends FunnelDoc>(
  queryEmbedding: number[],
  docs: T[],
  embedDoc: (doc: T) => Promise<number[]>,
  threshold: number = FUNNEL_ADOPT_THRESHOLD,
  precomputedDesc?: Map<string, number[]>,
  positiveExampleEmbeddings?: Map<string, number[][]>,
  negativeExampleEmbeddings?: Map<string, number[][]>,
): Promise<FunnelPick<T> | null> {
  const top = (await funnelSemanticRouterRanking(
    queryEmbedding,
    docs,
    embedDoc,
    precomputedDesc,
    positiveExampleEmbeddings,
    negativeExampleEmbeddings,
  ))[0];
  if (!top || top.rejected || top.raw * 100 < threshold) return null;
  return { doc: top.doc, score: top.score, source: 'semantic_router' };
}

