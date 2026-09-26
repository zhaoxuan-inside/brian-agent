import type { PromptsAccess, SoulAccess, SkillAccess, MCPAccess, LLMAccess, Metrics } from '@brian-agent/base';
import {
  ExecPromptInput,
  ExecPromptOutput,
  PromptContext,
  SoPromptInput,
  SoPromptOutput,
  Operator,
  GetSoulInput,
  GetSoulOutput,
  SoulContext,
  ValidationError,
  GetLLMInput,
  GetLLMOutput,
  LLMContext,
  GetSkillInput,
  GetSkillOutput,
  SkillContext,
  GetMcpInput,
  GetMcpOutput,
  McpContext,
} from '@brian-agent/base';
import type { LLMCoreAccess } from '@brian-agent/core';
import { MatchLLMInput, MatchLLMOutput, LLMCoreContext } from '@brian-agent/core';

export async function renderPromptWithFallback(
  promptsAccess: PromptsAccess,
  templateId: string | undefined,
  fallbackTitle: string,
  variables: Record<string, unknown>,
  metrics?: Metrics,
): Promise<string> {
  let id = templateId;
  if (!id) {
    try {
      const soOut = new SoPromptOutput();
      await promptsAccess.soPrompt(
        Object.assign(new SoPromptInput(), { keyword: fallbackTitle }),
        soOut,
        new PromptContext(),
        metrics,
      );
      const hit = soOut.list?.find((p) => p.enable !== false && (p.prompt_template_title?.includes(fallbackTitle) || p.prompt_template_brief?.includes(fallbackTitle)));
      if (hit) {
        id = hit.id;
      } else {
        const anyHit = soOut.list?.find((p) => p.enable !== false);
        if (anyHit) id = anyHit.id;
      }
    } catch (err) {
      
      
      metrics?.warn('AgentKit.renderPromptWithFallback 动态解析模板失败，回退标题名兜底', {
        error: err instanceof Error ? err.message : String(err),
        fallback_title: fallbackTitle,
      });
    }
    if (!id) {
      id = fallbackTitle;
    }
  }
  const promptOut = new ExecPromptOutput();
  await promptsAccess.execPrompt(
    Object.assign(new ExecPromptInput(), { id, variables }),
    promptOut,
    new PromptContext(),
    metrics,
  );
  if (promptOut.prompt) return promptOut.prompt;
  throw new ValidationError(`Prompt 模板不可用或渲染为空: ${id}`);
}

export async function resolveAgentLlm(
  llmCore: LLMCoreAccess | undefined,
  agentId: string,
  metrics?: Metrics,
): Promise<string> {
  if (!llmCore) return '';
  try {
    const llmOut = new MatchLLMOutput();
    await llmCore.matchLLM(
      Object.assign(new MatchLLMInput(), { agent_id: agentId }),
      llmOut,
      new LLMCoreContext(),
      metrics,
    );
    return llmOut.llm_id || '';
  } catch {
    return '';
  }
}

export async function assertPromptExists(promptsAccess: PromptsAccess, id: string, metrics?: Metrics): Promise<void> {
  const out = new SoPromptOutput();
  await promptsAccess.soPrompt(
    Object.assign(new SoPromptInput(), {
      conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
    }),
    out,
    new PromptContext(),
    metrics,
  );
  if (!out.list?.length) throw new ValidationError(`prompt_template_id 不存在: ${id}`);
}

export async function getSoulSystemPrompt(soulAccess: SoulAccess, soulId: string, metrics?: Metrics): Promise<string> {
  if (!soulId) return '';
  try {
    const soulOut = new GetSoulOutput();
    await soulAccess.soSoulById(
      Object.assign(new GetSoulInput(), { id: soulId }),
      soulOut,
      new SoulContext(),
      metrics,
    );
    return soulOut.soul?.soul_content || soulOut.soul?.soul_brief || '';
  } catch {
    return '';
  }
}

export interface AgentResourceValidationResult {
  
  valid: boolean;
  
  soul_ok: boolean;
  
  prompt_ok: boolean;
  
  valid_skill_ids: string[];
  
  invalid_skill_ids: string[];
  
  valid_mcp_ids: string[];
  
  invalid_mcp_ids: string[];
  
  issues: string[];
}

export async function validateAgentSoul(soulAccess: SoulAccess, soulId: string, metrics?: Metrics): Promise<boolean> {
  if (!soulId) return false;
  try {
    const out = new GetSoulOutput();
    await soulAccess.soSoulById(
      Object.assign(new GetSoulInput(), { id: soulId }),
      out,
      new SoulContext(),
      metrics,
    );
    return Boolean(out.soul?.enable);
  } catch {
    return false;
  }
}

export async function validateAgentPrompt(promptsAccess: PromptsAccess, promptId: string, metrics?: Metrics): Promise<boolean> {
  if (!promptId) return false;
  try {
    const out = new SoPromptOutput();
    await promptsAccess.soPrompt(
      Object.assign(new SoPromptInput(), {
        conditions: [{ field: 'id', operator: Operator.EQ, value: promptId }],
      }),
      out,
      new PromptContext(),
      metrics,
    );
    const row = out.list?.[0];
    return Boolean(row && row.enable);
  } catch {
    return false;
  }
}

export async function validateAgentSkills(
  skillAccess: SkillAccess,
  skillIds: string[],
  metrics?: Metrics,
): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const id of skillIds) {
    try {
      const out = new GetSkillOutput();
      await skillAccess.soSkillById(
        Object.assign(new GetSkillInput(), { id }),
        out,
        new SkillContext(),
        metrics,
      );
      if (out.skill?.enable) valid.push(id);
      else invalid.push(id);
    } catch {
      invalid.push(id);
    }
  }
  return { valid, invalid };
}

export async function validateAgentMcps(
  mcpAccess: MCPAccess,
  mcpIds: string[],
  metrics?: Metrics,
): Promise<{ valid: string[]; invalid: string[] }> {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const id of mcpIds) {
    try {
      const out = new GetMcpOutput();
      await mcpAccess.soMcpById(
        Object.assign(new GetMcpInput(), { id }),
        out,
        new McpContext(),
        metrics,
      );
      if (out.mcp?.enable) valid.push(id);
      else invalid.push(id);
    } catch {
      invalid.push(id);
    }
  }
  return { valid, invalid };
}

export async function validateAgentLlm(llmAccess: LLMAccess, llmId: string, metrics?: Metrics): Promise<boolean> {
  if (!llmId) return false;
  try {
    const out = new GetLLMOutput();
    await llmAccess.soLLMById(
      Object.assign(new GetLLMInput(), { id: llmId }),
      out,
      new LLMContext(),
      metrics,
    );
    return Boolean(out.llm?.enable);
  } catch {
    return false;
  }
}

export async function validateAgentResources(deps: {
  
  agentId: string;
  soulId?: string;
  promptId?: string;
  skillIds?: string[];
  mcpIds?: string[];
  soulAccess: SoulAccess;
  promptsAccess: PromptsAccess;
  skillAccess: SkillAccess;
  mcpAccess: MCPAccess;
  metrics?: Metrics;
}): Promise<AgentResourceValidationResult> {
  const issues: string[] = [];
  const { agentId, soulAccess, promptsAccess, skillAccess, mcpAccess, metrics } = deps;

  const soulOk = await validateAgentSoul(soulAccess, deps.soulId || '', metrics);
  if (!soulOk && deps.soulId) {
    issues.push(`Agent ${agentId} 绑定的 Soul 不存在或已禁用: ${deps.soulId}`);
  }

  const promptOk = await validateAgentPrompt(promptsAccess, deps.promptId || '', metrics);
  if (!promptOk && deps.promptId) {
    issues.push(`Agent ${agentId} 绑定的 Prompt 模板不存在或已禁用: ${deps.promptId}`);
  }

  const skills = await validateAgentSkills(skillAccess, deps.skillIds ?? [], metrics);
  for (const id of skills.invalid) {
    issues.push(`Agent ${agentId} 绑定的 Skill 不存在或已禁用: ${id}`);
  }

  const mcps = await validateAgentMcps(mcpAccess, deps.mcpIds ?? [], metrics);
  for (const id of mcps.invalid) {
    issues.push(`Agent ${agentId} 绑定的 MCP 不存在或已禁用: ${id}`);
  }

  const result: AgentResourceValidationResult = {
    valid: soulOk && promptOk && skills.invalid.length === 0 && mcps.invalid.length === 0,
    soul_ok: soulOk,
    prompt_ok: promptOk,
    valid_skill_ids: skills.valid,
    invalid_skill_ids: skills.invalid,
    valid_mcp_ids: mcps.valid,
    invalid_mcp_ids: mcps.invalid,
    issues,
  };
  return result;
}
