import { ScoreThreshold } from './MatchConstants';

export interface RankedCandidate {
  id: string;
  score: number;
}

export interface NeedRankingResult {
  need: boolean;
  
  keywords: string[];
  candidates: RankedCandidate[];
  

  confirmed: boolean;
}

export function parseNeedRankingResult(text: string): NeedRankingResult {
  const objectResult = parseObjectContract(text);
  if (objectResult) return objectResult;
  const legacy = parseRankingCandidates(text);
  if (legacy.length > 0) {
    return { need: true, keywords: [], candidates: legacy, confirmed: true };
  }
  return { need: false, keywords: [], candidates: [], confirmed: false };
}

function parseObjectContract(text: string): NeedRankingResult | null {
  const stripped = stripCodeFence(text);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const item = parsed as Record<string, unknown>;
  if (item.need === undefined && item.candidates === undefined) {
    return null;
  }
  const need = item.need === undefined ? true : item.need === true;
  const keywords = Array.isArray(item.keywords)
    ? item.keywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  const candidates = Array.isArray(item.candidates)
    ? item.candidates.map(toCandidate).filter((c): c is RankedCandidate => c != null)
    : [];
  return { need, keywords, candidates, confirmed: true };
}

function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
}

export function parseRankingCandidates(text: string): RankedCandidate[] {
  const json = extractJsonArray(text);
  if (!Array.isArray(json)) {
    return [];
  }
  const items: RankedCandidate[] = [];
  for (const raw of json) {
    const candidate = toCandidate(raw);
    if (candidate) {
      items.push(candidate);
    }
  }
  return items;
}

export function filterByThreshold(items: RankedCandidate[], threshold: number): RankedCandidate[] {
  const safeThreshold = clampScore(threshold);
  return [...items]
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score >= safeThreshold);
}

function toCandidate(raw: unknown): RankedCandidate | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const id = String(item.id ?? '').trim();
  const score = Number(item.score ?? ScoreThreshold.Min);
  if (!id || !Number.isFinite(score)) {
    return null;
  }
  return { id, score: clampScore(score) };
}

function clampScore(score: number): number {
  return Math.min(ScoreThreshold.Max, Math.max(ScoreThreshold.Min, score));
}

function extractJsonArray(text: string): unknown {
  const stripped = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = stripped.indexOf('[');
  const end = stripped.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}
