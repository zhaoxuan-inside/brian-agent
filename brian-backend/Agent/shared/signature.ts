/**
 * task_signature 统一格式：`[domain] 任务前256字`
 * 对齐 docs/_01_TerminologyStandardization.md
 */
export function buildTaskSignature(taskContent: string, domain = ''): string {
  const body = (taskContent ?? '').slice(0, 256);
  const d = (domain ?? '').trim() || 'general';
  return `[${d}] ${body}`;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const direct = JSON.parse(text);
    if (direct && typeof direct === 'object') return direct as Record<string, unknown>;
  } catch {
    /* try extract */
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}
