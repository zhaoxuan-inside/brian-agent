/**
 * @fileoverview 组件排序结果统一解析（数据处理）+ 阈值截断（逻辑控制）。
 *
 * 两种契约：
 * - 判定合并契约（2026-09-22）：`{"need": true, "keywords": [...], "candidates": [{"id": "...", "score": 78}]}`
 *   —— Skill/MCP 匹配用（需求判定与排序合并，供四层瀑布：本地 → 外部获取 → 自建）；
 * - 旧数组契约：`[{"id": "...", "score": 78}]`（百分制 score 0-100）—— Soul/LLM 匹配用。
 * 解析宽容：兼容 Markdown 代码围栏包裹、宽松 JSON。
 */
import { ScoreThreshold } from './MatchConstants';

/** 单个排序候选 */
export interface RankedCandidate {
  id: string;
  score: number;
}

/**
 * 需求判定 + 排序合并结果（2026-09-22 组件匹配四层瀑布契约）。
 *
 * - need=true 且 candidates 过阈值 → 本地命中
 * - need=true 但 candidates 空/全被阈值淘汰 → 任务需要组件但本地无合格者，触发外部获取层
 * - need=false → 任务不需要组件，负缓存空结果
 */
export interface NeedRankingResult {
  need: boolean;
  /** LLM 从任务提炼的英文检索关键词（供 GitHub / 提供商市场搜索；need=true 时输出） */
  keywords: string[];
  candidates: RankedCandidate[];
}

/**
 * 解析「判定与排序合并」契约（数据处理）。
 *
 * 新契约：`{"need": true, "keywords": ["weather"], "candidates": [{"id": "...", "score": 78}]}`
 * 兼容旧数组契约：`[{"id": "...", "score": 78}]`（非空即 need=true，空按 need=false 处理，
 * 解析失败一律 need=false —— 保守语义，LLM 输出异常时不触发外部获取，防生成风暴）。
 */
export function parseNeedRankingResult(text: string): NeedRankingResult {
  const objectResult = parseObjectContract(text);
  if (objectResult) return objectResult;
  const legacy = parseRankingCandidates(text);
  if (legacy.length > 0) {
    return { need: true, keywords: [], candidates: legacy };
  }
  return { need: false, keywords: [], candidates: [] };
}

/** 对象契约解析（数据处理）：{need, keywords, candidates}；字段缺失时按保守语义回退 */
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
  return { need, keywords, candidates };
}

/** 去除 Markdown 代码围栏（数据处理） */
function stripCodeFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
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
