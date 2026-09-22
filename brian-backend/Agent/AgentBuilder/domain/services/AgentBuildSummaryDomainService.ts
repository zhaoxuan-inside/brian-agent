/**
 * Agent 构建产物摘要领域服务（纯函数，零 I/O）：
 * 组装构建结果的结构化明细，供 info_raw 存档与 agent_built 流事件共用。
 */

/** 任务分析结果（与 AgentBuilderService.analyzeTask 返回结构一致） */
export interface AgentBuildAnalysis {
  complexity: number;
  domain: string;
  signature: string;
}

/**
 * 组装构建产物摘要（纯函数）：含任务签名/复杂度/领域与策略、LLM、人格、技能、MCP 装配明细。
 * 注意：不含 soul_id 字段（存档记录由调用方补充，流事件 payload 与此结构一致）。
 */
export function buildAgentBuildSummary(parts: {
  agentId: string;
  agentName: string;
  analysis: AgentBuildAnalysis;
  strategyId: string;
  llmId: string;
  soul: Record<string, unknown> | null;
  skills: Array<{ skill_id: string; skill_brief: string }>;
  mcpIds: string[];
}): Record<string, unknown> {
  return {
    agent_id: parts.agentId,
    agent_name: parts.agentName,
    task_signature: parts.analysis.signature,
    complexity: parts.analysis.complexity,
    domain: parts.analysis.domain,
    strategy_id: parts.strategyId,
    llm_id: parts.llmId,
    soul: parts.soul,
    skills: (parts.skills || []).map((s) => s.skill_brief || s.skill_id),
    mcps: parts.mcpIds || [],
  };
}
