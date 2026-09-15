/**
 * @fileoverview Agent 层公共基座（AgentKit）。
 *
 * 收敛各 Agent 服务中逐字复制的私有辅助方法（改造前：renderPrompt ×5、
 * resolveLlm ×5、assertPrompt ×3、Soul 兜底 prompt ×5），统一为一处实现。
 *
 * 模式：Facade —— 对"模板渲染 + 内置兜底"与"Agent LLM 绑定解析"的高频组合提供单一入口。
 */

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

/**
 * 渲染 Prompt：经 DB（prompt_template 表）渲染配置模板（templateId），缺省按标题/用途动态查找 UUID 模板。
 *
 * 所有 Prompt 统一由 PromptProvider / DB prompt_template 承载。
 *
 * @param promptsAccess PromptsProvider 接入层
 * @param templateId 配置的模板 ID（可为空，空则按 fallbackTitle 动态解析）
 * @param fallbackTitle 缺省时的模板标题关键字
 * @param variables 模板变量
 * @returns 渲染后的 Prompt 文本（模板缺失/渲染为空抛 ValidationError）
 */
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
    } catch {
      /* ignore */
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

/**
 * 解析 Agent 绑定的 LLM（经 Core.matchLLM 查询 agent_llm 绑定）。
 *
 * @param llmCore LLMCore 接入层（可为空，空则直接返回 ''）
 * @param agentId Agent ID
 * @returns 匹配到的 LLM ID；未匹配或异常时返回空字符串
 */
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

/**
 * 断言 Prompt 模板存在，不存在时抛出 ValidationError。
 *
 * @param promptsAccess PromptsProvider 接入层
 * @param id 模板 ID
 * @throws ValidationError 当模板不存在
 */
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

/**
 * 获取 Soul 系统提示词内容：优先 soul_content，回退 soul_brief，均无则空串。
 *
 * @param soulAccess SoulProvider 接入层
 * @param soulId Soul ID（可为空）
 */
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

// ---------------------------------------------------------------------------
// Agent 绑定资源校验（LLM / Prompt / Skill / MCP / Soul，全部经 DB 校验）
// ---------------------------------------------------------------------------

/** Agent 绑定资源校验结果 */
export interface AgentResourceValidationResult {
  /** Soul / Prompt / 全部 Skill / 全部 MCP 是否全部有效 */
  valid: boolean;
  /** 绑定 Soul 是否存在且启用 */
  soul_ok: boolean;
  /** 绑定 Prompt 模板是否存在且启用 */
  prompt_ok: boolean;
  /** 校验通过的 Skill ID 列表 */
  valid_skill_ids: string[];
  /** 校验失败（不存在或已禁用）的 Skill ID 列表 */
  invalid_skill_ids: string[];
  /** 校验通过的 MCP ID 列表 */
  valid_mcp_ids: string[];
  /** 校验失败（不存在或已禁用）的 MCP ID 列表 */
  invalid_mcp_ids: string[];
  /** 全部问题清单（人可读） */
  issues: string[];
}

/**
 * 校验 Agent 绑定的 Soul（经 SoulProvider DB 校验：存在且启用）。
 */
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

/**
 * 校验 Agent 绑定的 Prompt 模板（经 PromptsProvider DB 校验：存在且启用）。
 */
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

/**
 * 批量校验 Agent 绑定的 Skill（经 SkillProvider DB 校验：存在且启用）。
 *
 * @returns { valid, invalid } 通过/失败 ID 列表
 */
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

/**
 * 批量校验 Agent 绑定的 MCP（经 MCPProvider DB 校验：存在且启用）。
 *
 * @returns { valid, invalid } 通过/失败 ID 列表
 */
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

/**
 * 校验执行用 LLM（经 LLMProvider DB 校验：存在且启用）。
 *
 * @param llmAccess LLMProvider 接入层
 * @param llmId 待校验的 LLM ID（来自 Core.matchLLM 解析结果）
 */
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

/**
 * 完整校验 Agent 的绑定资源（Soul / Prompt / Skill / MCP，全部经 DB 校验）。
 *
 * LLM 绑定校验单独使用 validateAgentLlm（LLM 绑定存于 LLMProvider 的 agent_llm，
 * 由 Core.matchLLM 解析后传入执行流程）。
 *
 * 校验失败不抛异常，返回问题清单，由调用方决定降级策略
 * （如剔除失效 Skill/MCP 后继续执行、记录告警等）。
 *
 * @param deps 校验依赖（Agent 绑定信息 + 各资源接入层）
 */
export async function validateAgentResources(deps: {
  /** Agent 业务 ID（用于问题清单描述） */
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
