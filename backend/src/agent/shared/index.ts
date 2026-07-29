export function buildTaskSignature(taskContent: string, domain?: string): string {
  const d = (domain && domain.trim()) || 'general';
  const body = (taskContent || '').substring(0, 256);
  return `[${d}] ${body}`;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text || typeof text !== 'string') return null;
  try {
    const result = JSON.parse(text);
    if (result === null || Array.isArray(result)) return null;
    return result as Record<string, unknown>;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const result = JSON.parse(match[0]);
      if (result === null || Array.isArray(result)) return null;
      return result as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
