/**
 * task_signature 统一格式：`[domain] 任务前256字`
 * 对齐 docs/_01_TerminologyStandardization.md
 */
import { JsonParser } from '@brian-agent/base';

export function buildTaskSignature(taskContent: string, domain = ''): string {
  const body = (taskContent ?? '').slice(0, 256);
  const d = (domain ?? '').trim() || 'general';
  return `[${d}] ${body}`;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const value = JsonParser.parse(text);
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return null;
}

export function parseTaskContentAndContext(rawTaskContent: string): {
  cleanTaskContent: string;
  extractedWorkContext?: Record<string, unknown>;
} {
  if (!rawTaskContent) return { cleanTaskContent: '' };

  const str = String(rawTaskContent).trim();
  if (str.includes('\n---\n')) {
    const idx = str.indexOf('\n---\n');
    const firstPart = str.slice(0, idx).trim();
    const restPart = str.slice(idx + 5).trim();

    if (firstPart.startsWith('{') && firstPart.endsWith('}')) {
      try {
        const parsed = JSON.parse(firstPart);
        if (parsed && typeof parsed === 'object' && ('work_id' in parsed || 'session_id' in parsed || 'session_context' in parsed || 'context_categories' in parsed)) {
          return {
            cleanTaskContent: restPart,
            extractedWorkContext: parsed as Record<string, unknown>,
          };
        }
      } catch (err) {
        /* ignore：首段非 work_context JSON（协议头缺失/截断），按纯文本透传，属预期输入形态 */
        void err;
      }
    }
  }

  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object') {
        let clean = '';
        if (parsed.user_query) clean = String(parsed.user_query);
        else if (parsed.task_content) clean = String(parsed.task_content);
        if (clean) {
          return {
            cleanTaskContent: clean,
            extractedWorkContext: parsed as Record<string, unknown>,
          };
        }
      }
    } catch (err) {
      /* ignore：整段非 JSON（普通任务文本），按原文透传，属预期输入形态 */
      void err;
    }
  }

  return { cleanTaskContent: str };
}
