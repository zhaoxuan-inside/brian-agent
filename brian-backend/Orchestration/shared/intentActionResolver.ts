/**
 * 需求理解确认的自动决策：在 IntentAgent 给出改写后，按原文与理解文的关系
 * 选择 APPROVE（按理解执行）或 KEEP（按原文执行），仅在主题部分重叠且置信极低时 ASK。
 * 从不自动 CANCEL（取消会删除用户本次提问）。
 */

export type IntentAutoAction = 'APPROVE' | 'KEEP' | 'ASK';

export interface IntentActionParams {
  originalQuery: string;
  understoodRequirement: string;
  matchScore: number;
  threshold: number;
  hasContext: boolean;
}

export interface IntentActionDecision {
  action: IntentAutoAction;
  reason: string;
  coverage: number;
}

const CJK_STOP = new Set(
  [...'的了吗呢吧啊哦呀嘛着过和与或在把被让给从到是就都也还要请帮我'],
);

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, '');
}

function tokenize(text: string): Set<string> {
  const lowered = text.toLowerCase();
  const words = lowered.match(/[a-z0-9_]+/g) ?? [];
  const cjk = [...lowered].filter((ch) => /[\u4e00-\u9fff]/.test(ch) && !CJK_STOP.has(ch));
  return new Set([...words, ...cjk]);
}

/** 原文词元被理解文覆盖的比例（主题是否仍是同一件事） */
export function originalTokenCoverage(original: string, understood: string): number {
  const source = tokenize(original);
  const target = tokenize(understood);
  if (source.size === 0) return 1;
  let overlap = 0;
  for (const token of source) {
    if (target.has(token)) overlap += 1;
  }
  return overlap / source.size;
}

export function resolveIntentAction(params: IntentActionParams): IntentActionDecision {
  const original = (params.originalQuery ?? '').trim();
  const understood = (params.understoodRequirement ?? '').trim();
  const score = Number.isFinite(params.matchScore) ? params.matchScore : 0;
  const threshold = Number.isFinite(params.threshold) ? params.threshold : 80;

  if (!understood || normalize(understood) === normalize(original)) {
    return { action: 'KEEP', reason: 'same_or_empty', coverage: 1 };
  }

  const coverage = originalTokenCoverage(original, understood);

  if (score >= threshold) {
    return { action: 'APPROVE', reason: 'high_score', coverage };
  }
  if (coverage >= 0.35) {
    return { action: 'APPROVE', reason: 'topic_expansion', coverage };
  }
  if (params.hasContext && coverage >= 0.2) {
    return { action: 'APPROVE', reason: 'contextual_expansion', coverage };
  }
  if (score >= 55 && coverage >= 0.15) {
    return { action: 'APPROVE', reason: 'moderate_confidence', coverage };
  }
  if (coverage < 0.15) {
    return { action: 'KEEP', reason: 'topic_drift', coverage };
  }
  if (score < 30 && original.length >= 10 && !params.hasContext) {
    return { action: 'ASK', reason: 'ambiguous_rewrite', coverage };
  }
  if (score >= 50) {
    return { action: 'APPROVE', reason: 'moderate_confidence', coverage };
  }
  return { action: 'KEEP', reason: 'low_confidence_keep', coverage };
}
