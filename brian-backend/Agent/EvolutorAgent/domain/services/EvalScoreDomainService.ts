import { parseJsonObject } from '../../../shared/signature';
import type { EvalScores } from '../types';

const DEFAULT_WORK_SCORES: EvalScores = {
  correctness: 50, completeness: 50, efficiency: 50, relevance: 50, overall: 50,
};

export interface WorkScoreParseResult {
  scores: EvalScores;
  suggestions: string[];
}

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
