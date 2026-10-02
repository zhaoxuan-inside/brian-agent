/**
 * Agent 实例命名与匹配层标签（观测事件展示用）。
 * 事件 payload 以 agent_id 为唯一关联锚点，名称仅作展示冗余；历史数据 title 可能
 * 存有「名称|描述」长串，展示名一律经 soAgentDisplayName 截短。
 */

/** AgentMatchLayer → 中文标签 */
export const MATCH_LAYER_LABELS: Record<string, string> = {
  exact: '精准直连',
  signature: '签名匹配',
  vector: '向量选举',
  llm: 'LLM 裁决',
  built: '动态构建',
  session: '会话亲和',
};

export function matchLayerLabel(layer: string | undefined | null): string {
  const key = String(layer ?? '').trim();
  return MATCH_LAYER_LABELS[key] ?? key;
}

/** 取「名称|描述」长串中的名称段；无分隔符时原样返回 */
export function soAgentDisplayName(name: string | undefined | null): string {
  const raw = String(name ?? '').trim();
  const cut = raw.split(/[|｜]/)[0].trim();
  return cut || raw;
}
