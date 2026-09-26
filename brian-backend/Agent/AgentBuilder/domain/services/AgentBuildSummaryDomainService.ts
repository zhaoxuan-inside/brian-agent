export interface AgentBuildAnalysis {
  complexity: number;
  domain: string;
  signature: string;
}

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
