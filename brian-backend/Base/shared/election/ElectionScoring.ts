/**
 * 统一选举评分与阶梯（R8 · chg-058，纯计算无 IO）
 * 信号标记填充、综合得分、阶梯候选集求解与默认阶梯定义。
 * 阶梯是数据驱动的表达式数组：纠正/扩展选举语义只需改阶梯，不动引擎。
 */
import type { FunnelRankingEntry, FunnelDoc } from '../match/FunnelSelector';
import type {
  ElectionCandidate, ElectionSignals, ElectionThresholds, ElectionTierExpr,
} from './ElectionTypes';

/** 阶梯标记 → 候选集合的映射键（all=全量合法候选） */
export type TierSetKey = 'structure' | 'vectorOverall' | 'vectorExample' | 'bm25' | 'all';

/**
 * 组件标准阶梯（Agent/Prompt/Soul/Skill/MCP，chg-058 规格 3.2~3.4）：
 * T1=(结构∪向量正例)−反例 → T2=(结构∪正例范例)−反例 → 终端（创建新的组件）。
 * 正例范例集与综合向量集口径不同（范例 Max-Sim 原始值 vs 综合分），T2 可在 T1 空时非空。
 */
export function standardTierLadder(): ElectionTierExpr[] {
  return [
    { id: 't1', label: '结构∪向量正例(去反例)', union: ['structure', 'vectorOverall'], subtractNegative: true },
    { id: 't2', label: '结构∪正例范例(去反例)', union: ['structure', 'vectorExample'], subtractNegative: true },
  ];
}

/** LLM 全量阶梯（规格 3.1.2~3.1.9）：标准两级后继续放宽至 BM25/全量，最终默认模型兜底 */
export function fullTierLadder(): ElectionTierExpr[] {
  return [
    ...standardTierLadder(),
    { id: 't3', label: '结构(去反例)', union: ['structure'], subtractNegative: true },
    { id: 't4', label: '结构', union: ['structure'], subtractNegative: false },
    { id: 't5', label: '正例范例', union: ['vectorExample'], subtractNegative: false },
    { id: 't6', label: 'BM25(去反例)', union: ['bm25'], subtractNegative: true },
    { id: 't7', label: '全量(去反例)', union: ['all'], subtractNegative: true },
  ];
}

/** 综合得分（algorithm）：vectorWeight×向量分 + bm25Weight×BM25 分，权重可配 */
export function compositeScore<T>(candidate: ElectionCandidate<T>, thresholds: ElectionThresholds): number {
  return thresholds.vectorWeight * candidate.vectorScore + thresholds.bm25Weight * candidate.bm25Score;
}

function tierSetIds<T>(signals: ElectionSignals<T>, key: TierSetKey): Set<string> {
  if (key === 'all') return new Set(signals.candidates.map((c) => c.id));
  if (key === 'structure') return signals.structureIds;
  const flagged = signals.candidates.filter((c) => {
    if (key === 'bm25') return c.bm25Score >= signals.thresholds.bm25;
    if (key === 'vectorOverall') return c.vectorScore >= signals.thresholds.vectorOverall;
    return c.exampleSim >= signals.thresholds.vectorExample;
  });
  return new Set(flagged.map((c) => c.id));
}

/**
 * 阶梯候选集求解（algorithm）：并集若干信号集、可选剔除反例集；
 * multiSelect=true 返回集合内全部候选（Skill/MCP 整集采纳），
 * false 按综合得分择优返回最佳单候选；阶梯为空返回 []。
 */
export function pickFromTier<T>(
  signals: ElectionSignals<T>,
  tier: ElectionTierExpr,
  multiSelect: boolean,
): ElectionCandidate<T>[] {
  const byId = new Map(signals.candidates.map((c) => [c.id, c]));
  const unionIds = new Set<string>();
  for (const key of tier.union) for (const id of tierSetIds(signals, key)) unionIds.add(id);
  const negativeIds = new Set(signals.candidates.filter((c) => c.rejectedByNegative).map((c) => c.id));
  const picked = [...unionIds]
    .filter((id) => !tier.subtractNegative || !negativeIds.has(id))
    .map((id) => byId.get(id))
    .filter((c): c is ElectionCandidate<T> => c !== undefined);
  if (picked.length === 0 || multiSelect) return picked;
  const thresholds = signals.thresholds;
  return [picked.reduce((best, c) => (compositeScore(c, thresholds) > compositeScore(best, thresholds) ? c : best))];
}

/**
 * BM25 + 语义路由双通道得分回填（data）：把 FunnelSelector 全量排序结果
 * 写入候选的 bm25Score/vectorScore/exampleSim/negativeSim/rejectedByNegative。
 */
export function applySignalScores<T extends { id: string }>(
  candidates: ElectionCandidate<T>[],
  bm25Ranking: FunnelRankingEntry<FunnelDoc>[],
  vectorRanking: FunnelRankingEntry<FunnelDoc>[],
): void {
  const bm25Of = new Map(bm25Ranking.map((e) => [e.doc.id, e]));
  const vectorOf = new Map(vectorRanking.map((e) => [e.doc.id, e]));
  for (const c of candidates) {
    c.bm25Score = bm25Of.get(c.id)?.score ?? 0;
    const vec = vectorOf.get(c.id);
    c.vectorScore = vec?.score ?? 0;
    c.exampleSim = vec?.exampleSim ?? 0;
    c.negativeSim = Math.round((vec?.negativeSim ?? 0) * 100);
    c.rejectedByNegative = vec?.rejected === true || c.negativeSim >= 100;
  }
}
