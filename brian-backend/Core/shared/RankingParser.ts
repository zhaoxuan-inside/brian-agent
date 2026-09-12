/**
 * @fileoverview 组件排序结果统一解析（数据处理）+ 阈值截断（逻辑控制）。
 *
 * 统一格式：`[{"id": "...", "score": 78}]`（百分制 score 0-100）。
 * 解析宽容：兼容 Markdown 代码围栏包裹、宽松 JSON 数组。
 */
import { ScoreThreshold } from './MatchConstants';

/** 单个排序候选 */
export interface RankedCandidate {
  id: string;
  score: number;
}

/** 从 LLM 返回文本抽取 `{id, score}` 数组（数据处理；失败返回空数组） */
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

/** 阈值截断（逻辑控制）：score 降序，仅保留 >= threshold 的候选 */
export function filterByThreshold(items: RankedCandidate[], threshold: number): RankedCandidate[] {
  const safeThreshold = clampScore(threshold);
  return [...items]
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score >= safeThreshold);
}

/** 原始元素 → 候选（数据处理；缺 id 或 score 非法则丢弃） */
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

/** 分数夹取到 0-100（数据处理） */
function clampScore(score: number): number {
  return Math.min(ScoreThreshold.Max, Math.max(ScoreThreshold.Min, score));
}

/** 从回复文本中抽取第一段 JSON 数组（数据处理；容忍 ```json 围栏） */
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
