/**
 * Planner 澄清题后置过滤：会话或当前任务已经给出的主题/选项，不再打断用户。
 *
 * 规则与 Agent/PlannerAgent/application/clarificationFilter.ts 保持一致。
 * Orchestration 包不能依赖 Agent 源码路径（tsc rootDir），故在此保留一份实现。
 */

export interface ClarificationLike {
  question: string;
  domain?: string;
}

const PLATFORM_GROUPS: string[][] = [
  ['youtube', 'youtu.be', '油管'],
  ['bilibili', 'b站', '哔哩哔哩', '哔哩'],
  ['抖音', 'douyin', 'tiktok'],
  ['twitter', 'x.com', '推特'],
  ['instagram'],
  ['微博', 'weibo'],
  ['facebook'],
];

const ASKS_PLATFORM_RE = /平台|网站|站点|视频网|哪个站|哪家|youtube|bilibili|b站|油管|抖音|tiktok/i;
const CHOICE_SPLIT_RE = /\s*(?:还是|或者|或是|还是选|\bor\b|vs\.?|[／/])\s*/i;
const CHOICE_PREFIX_RE = /^(?:请问|请告诉我|请选择|想问一下|麻烦)?(?:您|你)?(?:是|在|从|要)?/;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function detectPlatforms(text: string): Set<string> {
  const lowered = normalize(text);
  const found = new Set<string>();
  for (const group of PLATFORM_GROUPS) {
    if (group.some((alias) => lowered.includes(alias.toLowerCase()))) {
      found.add(group[0]);
    }
  }
  return found;
}

function isMeaningfulChoice(choice: string): boolean {
  const t = choice.trim();
  if (t.length < 2) return false;
  if (t.length > 40) return false;
  const hasCjk = /[\u4e00-\u9fff]/.test(t);
  if (!hasCjk && t.length < 3) return false;
  return true;
}

export function extractClarificationChoices(question: string): string[] {
  const body = question
    .replace(/[？?！!。.\s]+$/g, '')
    .replace(CHOICE_PREFIX_RE, '')
    .trim();
  const parts = body.split(CHOICE_SPLIT_RE).map((p) => p.replace(/[，,、]/g, '').trim());
  if (parts.length < 2) return [];
  return parts.filter(isMeaningfulChoice);
}

function choiceAppearsInGrounded(choice: string, grounded: string): boolean {
  const needle = normalize(choice);
  if (!needle) return false;
  return grounded.includes(needle);
}

export function isClarificationAlreadyGrounded(question: string, groundedText: string): boolean {
  const grounded = normalize(groundedText);
  if (!grounded) return false;
  const q = question.trim();
  if (!q) return false;

  const groundedPlatforms = detectPlatforms(grounded);
  const choices = extractClarificationChoices(q);

  if (choices.length >= 2) {
    if (choices.some((c) => choiceAppearsInGrounded(c, grounded))) return true;
    const choicePlatforms = new Set<string>();
    for (const c of choices) {
      for (const p of detectPlatforms(c)) choicePlatforms.add(p);
    }
    for (const p of choicePlatforms) {
      if (groundedPlatforms.has(p)) return true;
    }
  }

  if (ASKS_PLATFORM_RE.test(q) && groundedPlatforms.size > 0) return true;

  return false;
}

export function filterGroundedClarifications<T extends ClarificationLike>(
  clarifications: T[],
  groundedText: string,
): T[] {
  if (!clarifications.length) return [];
  return clarifications.filter((item) => !isClarificationAlreadyGrounded(item.question, groundedText));
}
