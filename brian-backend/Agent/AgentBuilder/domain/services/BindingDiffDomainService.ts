/**
 * Agent 绑定差异领域服务（纯函数，零 I/O）：计算匹配结果相对现有绑定的增/删集合。
 * 供 AgentBuilderService 优化阶段 Skill / MCP 整组重绑共用。
 */

/** 绑定差异计算结果：added 为待新增绑定 ID，removed 为待移除绑定 ID */
export interface BindingDiff {
  added: string[];
  removed: string[];
}

/**
 * 计算组件绑定差异（纯函数）：matched 相对 bound 的新增与移除集合（保持输入顺序）。
 */
export function computeBindingDiff(boundIds: string[], matchedIds: string[]): BindingDiff {
  return {
    added: matchedIds.filter((id) => !boundIds.includes(id)),
    removed: boundIds.filter((id) => !matchedIds.includes(id)),
  };
}
