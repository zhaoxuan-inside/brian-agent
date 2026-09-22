/**
 * Work Agent 评估打分领域服务（纯函数，零 I/O）：
 * 解析评估 LLM 输出为四维评分，并依 trace 迭代数修正 efficiency。
 */
import { parseJsonObject } from '../../../shared/signature';
import type { EvalScores } from '../types';

/** Work Agent 评估默认分（LLM 不可用或解析失败时的兜底，50 分中性值） */
const DEFAULT_WORK_SCORES: EvalScores = {
  correctness: 50, completeness: 50, efficiency: 50, relevance: 50, overall: 50,
};

/** 评分解析结果：四维评分与改进建议 */
export interface WorkScoreParseResult {
  scores: EvalScores;
  suggestions: string[];
}

/**
 * 解析评估 LLM 输出为评分与建议（纯函数）：输入为空或解析失败时返回默认分兜底。
 */
export function parseWorkAgentScores(raw: string): WorkScoreParseResult {
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return { scores: { ...DEFAULT_WORK_SCORES }, suggestions: [] };
  }
  const c = Number(parsed.correctness ?? 50);
  const comp = Number(parsed.completeness ?? 50);
  const eff = Number(parsed.efficiency ?? 50);
  const rel = Number(parsed.relevance ?? 50);
  return {
    scores: {
      correctness: c,
      completeness: comp,
      efficiency: eff,
      relevance: rel,
      overall: Number(parsed.overall ?? Math.round((c + comp + eff + rel) / 4)),
    },
    suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions as unknown[]).map(String) : [],
  };
}

/**
 * 依 trace 迭代数修正 efficiency（纯函数，原地修改并返回）：迭代越少越高（100 - iters*5），并重算 overall。
 */
export function applyTraceEfficiency(scores: EvalScores, traceData: unknown): EvalScores {
  if (!traceData || typeof traceData !== 'object') return scores;
  const iters = Number((traceData as { iterations?: unknown[] }).iterations?.length ?? 0);
  if (iters > 0) {
    scores.efficiency = Math.max(0, Math.min(100, 100 - iters * 5));
    scores.overall = Math.round(
      (scores.correctness + scores.completeness + scores.efficiency + scores.relevance) / 4,
    );
  }
  return scores;
}
