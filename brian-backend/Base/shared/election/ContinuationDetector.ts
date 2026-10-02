/**
 * 续写请求识别器（R8 · chg-058，纯算法无 IO）
 * 用户请求为「继续/然后呢」等要求续写的内容时，选举流程第①步直接命中已有组件（复用）。
 */

/** 续写请求语式（整句即续写意图，允许结尾语气符号与语气词） */
const CONTINUATION_EXACT_PATTERNS: RegExp[] = [
  /^(继续|接着|然后|接下来)(呢|呀|啊|吧|嘞)?[!！。？?~，,、\s]*$/i,
  /^(继续说|接着说|继续讲|接着讲|说下去|往下说|还有呢|还有吗|再说说|再说下|请继续|请接着|继续完成|接着完成|然后嘞|然后呢)[!！。？?~，,、\s]*$/i,
  /^(继续|接着|接下来)(帮我|给我)?(写|画|说|讲|做|分析|回答|翻译|完成)/i,
  /^(go\s*on|continue|keep\s*going|and\s*then\??|what'?s\s*next\??|next\s*please)[!！.？?\s]*$/i,
];

/** 续写短问句（≤6 字的追问语式） */
const CONTINUATION_SHORT_PATTERNS: RegExp[] = [/^(然后呢|然后嘞|还有呢|还有吗|后来呢|再呢|呢\?|呢？)$/i];

/** 续写请求识别（algorithm）：整句匹配续写语式即命中；空文本与长文本不视为续写 */
export function isContinuationRequest(text: string): boolean {
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > 30) return false;
  return CONTINUATION_EXACT_PATTERNS.some((p) => p.test(raw)) || CONTINUATION_SHORT_PATTERNS.some((p) => p.test(raw));
}

/** 从任务文本中剥离续写前缀（如「继续上面的分析：xxx」），供复用后回填任务内容 */
export function stripContinuationPrefix(text: string): string {
  return String(text ?? '').trim().replace(/^(继续|接着|接下来)[^，。：:]{0,8}[，。：:]\s*/i, '');
}
