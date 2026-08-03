/**
 * @fileoverview SkillCoreProvider 应用服务层。
 *
 * 依赖 SkillAccess / LLMAccess / PromptsAccess / RelationDBAccess，
 * 实现 LLM-based Skill 匹配、自动绑定、使用记录与基于配置窗口的 Skill 老化。
 *
 * 实现所有用例：matchSkill / optSkill / ageSkill / soSkillRule / updateSkillRule / configSkillCore。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import type { SkillAccess } from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import type { PromptsAccess } from '@brian-agent/base';
import {
  SkillContext,
  SoSkillInput,
  SoSkillOutput,
  UpdateSkillInput,
  UpdateSkillOutput,
  PromptContext,
  GetPromptInput,
  GetPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  LLMContext,
  ExecLLMInput,
  ExecLLMOutput,
  Operator,
  OperationType,
  IdGenerator,
  ValidationError,
  NotFoundError,
} from '@brian-agent/base';
import type { DataObject } from '@brian-agent/base';
import {
  SkillCoreContext,
  SkillCoreConfigRecord,
  AgentSkillRecord,
  SkillOptRuleRecord,
  MatchedSkillEntry,
  MatchSkillInput,
  MatchSkillOutput,
  OptSkillInput,
  OptSkillOutput,
  AgeSkillInput,
  AgeSkillOutput,
  SoSkillRuleInput,
  SoSkillRuleOutput,
  UpdateSkillRuleInput,
  UpdateSkillRuleOutput,
  ConfigSkillCoreInput,
  ConfigSkillCoreOutput,
  SKILL_CORE_CONFIG_TABLE,
  AGENT_SKILL_TABLE,
  SKILL_OPT_RULE_TABLE,
  SKILL_USAGE_TABLE,
} from '../domain/types';
import { ProcessingError } from '../../shared/errors';
import { AgingEngine } from '../../shared/AgingEngine';
import { checkMatchCache, clearMatchCache, persistMatchBinding } from '../../shared/MatchCacheHelper';

/** 默认 LLM 模型选择用表名 */
const LLM_ENABLE_TABLE = 'llm_enable';

/**
 * SkillCoreProvider 应用服务。
 *
 * 作为 Skill 匹配、自动绑定与老化的业务入口，
 * 上层不可直接操作 agent_skill / skill_usage / skill_opt_rule 表。
 */
export class SkillCoreService {
  /**
   * @param relationDb RelationDBProvider 接入层
   * @param skillAccess SkillProvider 接入层
   * @param llmAccess LLMProvider 接入层
   * @param promptsAccess PromptsProvider 接入层
   */
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly skillAccess: SkillAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  // ---------------------------------------------------------------------------
  // matchSkill
  // ---------------------------------------------------------------------------

  /**
   * 为 Agent 匹配 Skill（带缓存）。
   *
   * 流程：
   * 1. 检查 agent_skill 表中已缓存的绑定。若在 regen_rate 窗口内，直接返回；
   * 2. 否则：获取可用 Skill 列表 → 获取 Prompt 模板 → LLM 相关性排序；
   * 3. 持久化绑定到 agent_skill；
   * 4. 返回匹配结果。
   */
  async matchSkill(
    input: MatchSkillInput,
    _context: SkillCoreContext,
    output: MatchSkillOutput,
  ): Promise<boolean> {
    const { agent_id, context_id, interact_id } = input;
    if (!agent_id) {
      throw new ValidationError('agent_id 为必填');
    }

    const config = await this.getConfig();

    const cacheResult = await checkMatchCache(
      this.relationDb, AGENT_SKILL_TABLE, agent_id,
      config.regen_rate, 'random', 'skill_id',
    );
    if (cacheResult.hit && cacheResult.entries) {
      const cachedBindings = cacheResult.entries.map(e => ({ id: e.binding_id, created: 0, updated: e.updated, agent_id, skill_id: e.entity_id })) as AgentSkillRecord[];
      output.skills = await this.enrichMatchedSkills(cachedBindings);
      return true;
    }

    // 获取可用 Skill
    const skillOutput = new SoSkillOutput();
    await this.skillAccess.soSkill(
      { conditions: [{ field: 'enable', operator: Operator.EQ, value: 1 }] },
      new SkillContext(),
      skillOutput,
    );
    const availableSkills = skillOutput.list;
    if (availableSkills.length === 0) {
      output.skills = [];
      return true;
    }

    // 获取 Prompt 模板并渲染
    const promptText = await this.renderPrompt(
      config.prompt_template_id,
      { agent_id, context_id, interact_id, skills: availableSkills },
    );

    // 调用 LLM 排序
    const llmResult = await this.callLLM(promptText);
    const ranked = this.parseSkillRanking(llmResult, availableSkills);

    // 持久化绑定
    await clearMatchCache(this.relationDb, AGENT_SKILL_TABLE, agent_id);
    for (const entry of ranked) {
      await persistMatchBinding(this.relationDb, AGENT_SKILL_TABLE, agent_id, entry.skill_id, 'skill_id');
    }

    output.skills = ranked;
    return true;
  }

  // ---------------------------------------------------------------------------
  // optSkill
  // ---------------------------------------------------------------------------

  /**
   * 自动绑定 Skill 到 Agent 并记录使用。
   *
   * 若 agent_id + skill_id 在 agent_skill 中不存在则新增；
   * 无论新增或已有，均在 skill_usage 中记录本次使用。
   */
  async optSkill(
    input: OptSkillInput,
    _context: SkillCoreContext,
    output: OptSkillOutput,
  ): Promise<boolean> {
    const { agent_id, skill_id } = input;
    if (!agent_id) {
      throw new ValidationError('agent_id 为必填');
    }
    if (!skill_id) {
      throw new ValidationError('skill_id 为必填');
    }

    let binding = await this.getAgentSkillBinding(agent_id, skill_id);
    if (!binding) {
      binding = await this.insertAgentSkill(agent_id, skill_id);
    }

    await this.recordSkillUsage(binding.id);

    output.binding = binding;
    return true;
  }

  // ---------------------------------------------------------------------------
  // ageSkill
  // ---------------------------------------------------------------------------

  /**
   * 依据 skill_opt_rule 规则老化不活跃的 Skill。
   *
   * 对每条规则，统计在最近 days 天内 usage 次数不足 min_usage_count 的 skill，
   * 调用 SkillAccess.updateSkill 将其置为禁用（enable=false）。
   */
  async ageSkill(
    _input: AgeSkillInput,
    _context: SkillCoreContext,
    output: AgeSkillOutput,
  ): Promise<boolean> {
    const engine = new AgingEngine(this.relationDb);
    const count = await engine.age({
      ruleTable: SKILL_OPT_RULE_TABLE,
      bindingTable: AGENT_SKILL_TABLE,
      bindingEntityIdColumn: 'skill_id',
      usageBindingIdColumn: 'agent_skill_id',
      usageTable: SKILL_USAGE_TABLE,
      disabler: async (entityId) => {
        const updateOutput = new UpdateSkillOutput();
        await this.skillAccess.updateSkill(
          { id: entityId, data: { enable: false } },
          new SkillContext(),
          updateOutput,
        );
      },
    });
    output.aged_count = count;
    return true;
  }

  // ---------------------------------------------------------------------------
  // soSkillRule
  // ---------------------------------------------------------------------------

  /**
   * 查询 Skill 优化规则。
   */
  async soSkillRule(
    input: SoSkillRuleInput,
    _context: SkillCoreContext,
    output: SoSkillRuleOutput,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(SKILL_OPT_RULE_TABLE, {
      conditions: input.conditions,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      SKILL_OPT_RULE_TABLE,
      input.conditions,
    );
    output.list = rows.map((r: Record<string, unknown>) => this.toSkillOptRuleRecord(r));
    output.total = total;
    return true;
  }

  // ---------------------------------------------------------------------------
  // updateSkillRule
  // ---------------------------------------------------------------------------

  /**
   * 批量更新 Skill 优化规则（事务）。
   */
  async updateSkillRule(
    input: UpdateSkillRuleInput,
    _context: SkillCoreContext,
    _output: UpdateSkillRuleOutput,
  ): Promise<boolean> {
    if (!input.operations || input.operations.length === 0) {
      throw new ValidationError('operations 为必填');
    }

    const now = IdGenerator.now();

    for (const op of input.operations) {
      if (op.type === OperationType.INSERT) {
        const data: DataObject[] = op.data ?? [];
        const hasId = data.some((d: DataObject) => d.field === 'id');
        if (!hasId) {
          data.push({ field: 'id', value: IdGenerator.generate() });
        }
        const hasCreated = data.some((d: DataObject) => d.field === 'created');
        if (!hasCreated) {
          data.push({ field: 'created', value: now });
        }
        const hasUpdated = data.some((d: DataObject) => d.field === 'updated');
        if (!hasUpdated) {
          data.push({ field: 'updated', value: now });
        }
        await this.relationDb.insert(op.table, data);
      } else if (op.type === OperationType.UPDATE) {
        const data: DataObject[] = op.data ?? [];
        const hasUpdated = data.some((d: DataObject) => d.field === 'updated');
        if (!hasUpdated) {
          data.push({ field: 'updated', value: now });
        }
        await this.relationDb.update(
          op.table,
          data,
          op.conditions ?? [],
        );
      } else if (op.type === OperationType.DELETE) {
        await this.relationDb.delete(op.table, op.conditions);
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // configSkillCore
  // ---------------------------------------------------------------------------

  /**
   * 获取或更新 skill_core_config 配置（SET 语义）。
   */
  async configSkillCore(
    input: ConfigSkillCoreInput,
    _context: SkillCoreContext,
    output: ConfigSkillCoreOutput,
  ): Promise<boolean> {
    const existing = await this.getConfig();
    const now = IdGenerator.now();

    if (input.regen_rate !== undefined || input.prompt_template_id !== undefined) {
      const updateData: Array<{ field: string; value: unknown }> = [];
      if (input.regen_rate !== undefined) {
        updateData.push({ field: 'regen_rate', value: input.regen_rate });
      }
      if (input.prompt_template_id !== undefined) {
        updateData.push({ field: 'prompt_template_id', value: input.prompt_template_id || '' });
      }
      updateData.push({ field: 'updated', value: now });

      if (existing.id) {
        await this.relationDb.update(
          SKILL_CORE_CONFIG_TABLE,
          updateData,
          [{ field: 'id', operator: Operator.EQ, value: existing.id }],
        );
      } else {
        await this.relationDb.insert(SKILL_CORE_CONFIG_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          ...updateData,
        ]);
      }
    }

    const config = await this.getConfig();
    output.regen_rate = config.regen_rate;
    output.prompt_template_id = config.prompt_template_id;
    return true;
  }

  // ---------------------------------------------------------------------------
  // 内部辅助方法
  // ---------------------------------------------------------------------------

  /** 获取 skill_core_config 记录（不存在则返回默认值） */
  private async getConfig(): Promise<SkillCoreConfigRecord> {
    const row = await this.relationDb.selectOne(
      SKILL_CORE_CONFIG_TABLE,
      [],
    );
    if (row) {
      return this.toSkillCoreConfigRecord(row);
    }
    return {
      id: '',
      created: 0,
      updated: 0,
      regen_rate: 75,
      prompt_template_id: '',
    };
  }

  /** 获取单条 agent_skill 绑定 */
  private async getAgentSkillBinding(
    agentId: string,
    skillId: string,
  ): Promise<AgentSkillRecord | null> {
    const row = await this.relationDb.selectOne(AGENT_SKILL_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: agentId },
      { field: 'skill_id', operator: Operator.EQ, value: skillId },
    ]);
    return row ? this.toAgentSkillRecord(row) : null;
  }

  /** 新增 agent_skill 绑定 */
  private async insertAgentSkill(
    agentId: string,
    skillId: string,
  ): Promise<AgentSkillRecord> {
    const id = IdGenerator.generate();
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_SKILL_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'agent_id', value: agentId },
      { field: 'skill_id', value: skillId },
    ]);
    return { id, created: now, updated: now, agent_id: agentId, skill_id: skillId };
  }

  /** 记录 skill_usage */
  private async recordSkillUsage(agentSkillId: string): Promise<void> {
    const now = IdGenerator.now();
    const rows = this.relationDb.queryRaw<{ skill_id: string }>(
      'SELECT "skill_id" FROM "agent_skill" WHERE "id" = ?', [agentSkillId],
    );
    await this.relationDb.insert(SKILL_USAGE_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'skill_id', value: rows?.[0]?.skill_id || '' },
      { field: 'agent_skill_id', value: agentSkillId },
      { field: 'usage_date', value: new Date().toISOString().slice(0, 10) },
      { field: 'usage_count', value: 1 },
    ]);
  }

  /** 渲染 Prompt 模板 */
  private async renderPrompt(
    templateId: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    if (!templateId) {
      const skills = variables.skills as Array<{ skill_brief: string; skill_md: string }> | undefined;
      const skillDescriptions = skills
        ? skills.map((s) => `- ${s.skill_brief}\n${s.skill_md}`).join('\n\n')
        : '(无可用 Skill)';
      return [
        '你是一个 Skill 匹配助手。请根据以下可用 Skill 列表，按照相关性从高到低排序，',
        '输出 Skill 的 skill_brief 和 relevance（0~1 小数）。以 JSON 数组格式输出：',
        '[{"skill_brief": "...", "relevance": 0.95}]',
        '',
        '可用 Skill:',
        skillDescriptions,
        '',
        `Agent ID: ${variables.agent_id}`,
      ].join('\n');
    }

    const promptOutput = new ExecPromptOutput();
    await this.promptsAccess.execPrompt(
      { id: templateId, variables },
      new PromptContext(),
      promptOutput,
    );
    return promptOutput.prompt;
  }

  /** 调用 LLM */
  private async callLLM(prompt: string): Promise<string> {
    const llmId = await this.selectFirstEnabledLLM();
    if (!llmId) {
      throw new ProcessingError('未找到可用的 LLM 模型');
    }
    const llmOutput = new ExecLLMOutput();
    const ok = await this.llmAccess.execLLM(
      { id: llmId, prompt },
      new LLMContext(),
      llmOutput,
    );
    if (!ok) {
      throw new ProcessingError(
        `LLM 调用失败: ${llmOutput.error ?? '未知错误'}`,
      );
    }
    return llmOutput.result;
  }

  /** 选择第一个启用的 LLM */
  private async selectFirstEnabledLLM(): Promise<string | null> {
    const row = await this.relationDb.selectOne(LLM_ENABLE_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (!row) {
      return null;
    }
    return String(row.id);
  }

  /** 解析 LLM 返回的 Skill 排序结果 */
  private parseSkillRanking(
    llmResult: string,
    availableSkills: Array<{ id: string; skill_brief: string }>,
  ): MatchedSkillEntry[] {
    let parsed: Array<{ skill_brief?: string; relevance?: number }>;
    try {
      const trimmed = llmResult.trim();
      const jsonStr = trimmed.startsWith('```')
        ? trimmed.replace(/```(?:json)?\n?/g, '').trim()
        : trimmed;
      parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        throw new Error('expected array');
      }
    } catch {
      throw new ProcessingError('LLM 返回格式无效，期望 JSON 数组');
    }

    const skillByBrief = new Map(
      availableSkills.map((s) => [s.skill_brief, s]),
    );

    const result: MatchedSkillEntry[] = [];
    for (const item of parsed) {
      if (!item.skill_brief) {
        continue;
      }
      const skill = skillByBrief.get(item.skill_brief);
      if (skill) {
        result.push({
          skill_id: skill.id,
          skill_brief: skill.skill_brief,
          relevance: typeof item.relevance === 'number' ? item.relevance : 0,
        });
        skillByBrief.delete(item.skill_brief);
      }
    }

    // 附加 LLM 未返回的剩余 Skill（赋零优先级）
    for (const remaining of skillByBrief.values()) {
      result.push({
        skill_id: remaining.id,
        skill_brief: remaining.skill_brief,
        relevance: 0,
      });
    }

    return result;
  }

  /** 将缓存的绑定扩展为 MatchedSkillEntry 列表（从 Skill 表补充 skill_brief） */
  private async enrichMatchedSkills(
    bindings: AgentSkillRecord[],
  ): Promise<MatchedSkillEntry[]> {
    const result: MatchedSkillEntry[] = [];
    for (const b of bindings) {
      const skillOutput = new SoSkillOutput();
      await this.skillAccess.soSkill(
        {
          conditions: [
            { field: 'id', operator: Operator.EQ, value: b.skill_id },
          ],
        },
        new SkillContext(),
        skillOutput,
      );
      if (skillOutput.list.length > 0) {
        result.push({
          skill_id: b.skill_id,
          skill_brief: skillOutput.list[0].skill_brief,
          relevance: 1,
        });
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 记录转换
  // ---------------------------------------------------------------------------

  private toSkillCoreConfigRecord(row: Record<string, unknown>): SkillCoreConfigRecord {
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      regen_rate: Number(row.regen_rate),
      prompt_template_id: String(row.prompt_template_id),
    };
  }

  private toAgentSkillRecord(row: Record<string, unknown>): AgentSkillRecord {
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      agent_id: String(row.agent_id),
      skill_id: String(row.skill_id),
    };
  }

  private toSkillOptRuleRecord(row: Record<string, unknown>): SkillOptRuleRecord {
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      days: Number(row.days),
      min_usage_count: Number(row.min_usage_count),
    };
  }
}
