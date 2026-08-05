/**
 * @fileoverview SoulCoreProvider 应用服务层。
 *
 * 依赖 SoulAccess / LLMAccess / PromptsAccess / RelationDBAccess，
 * 实现 LLM-based Soul（persona）匹配、缓存、自动生成、比较优化与老化。
 *
 * 实现所有用例：matchSoul / optSoul / ageSoul / soSoulRule / updateSoulRule / configSoulCore。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import type { SoulAccess } from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import type { PromptsAccess } from '@brian-agent/base';
import {
  SoulContext,
  AddSoulInput,
  AddSoulOutput,
  GetSoulInput,
  GetSoulOutput,
  UpdateSoulInput,
  UpdateSoulOutput,
  SoSoulInput,
  SoSoulOutput,
  RecordSoulUsageInput,
  RecordSoulUsageOutput,
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
import type { Condition, DataObject, Operation, OrderBy, Page } from '@brian-agent/base';
import {
  SoulCoreContext,
  SoulCoreConfigRecord,
  AgentSoulRecord,
  SoulOptRuleRecord,
  SoulVerdict,
  MatchSoulInput,
  MatchSoulOutput,
  OptSoulInput,
  OptSoulOutput,
  AgeSoulInput,
  AgeSoulOutput,
  SoSoulRuleInput,
  SoSoulRuleOutput,
  UpdateSoulRuleInput,
  UpdateSoulRuleOutput,
  ConfigSoulCoreInput,
  ConfigSoulCoreOutput,
  SOUL_CORE_CONFIG_TABLE,
  AGENT_SOUL_TABLE,
  SOUL_OPT_RULE_TABLE,
  SOUL_CORE_USAGE_TABLE,
} from '../domain/types';
import { ProcessingError } from '../../shared/errors';
import { ensureDefaultConfig } from '../../shared/ConfigHelper';
import { AgingEngine } from '../../shared/AgingEngine';
import { checkMatchCache, clearMatchCache, persistMatchBinding } from '../../shared/MatchCacheHelper';

/** 默认 LLM 模型选择用表名 */
const LLM_AVAILABLE_TABLE = 'llm_available';

/**
 * SoulCoreProvider 应用服务。
 *
 * 作为 Soul 匹配、自动生成、比较优化与老化的业务入口，
 * 上层不可直接操作 agent_soul / soul_core_usage / soul_opt_rule 表。
 */
export class SoulCoreService {
  private configCache: SoulCoreConfigRecord | null = null;

  /**
   * @param relationDb RelationDBProvider 接入层
   * @param soulAccess SoulProvider 接入层
   * @param llmAccess LLMProvider 接入层
   * @param promptsAccess PromptsProvider 接入层
   */
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly soulAccess: SoulAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  /**
   * 初始化：确保默认配置存在。
   */
  async initialize(): Promise<void> {
    await ensureDefaultConfig(this.relationDb, SOUL_CORE_CONFIG_TABLE, [
      { field: 'regen_rate', value: 75 },
      { field: 'prompt_template_id', value: null },
    ]);
  }

  // ---------------------------------------------------------------------------
  // matchSoul
  // ---------------------------------------------------------------------------

  /**
   * 为 Agent 匹配 Soul（persona）。
   *
   * 流程：
   * 1. 查询 agent_soul 是否存在缓存绑定，若在 regen_rate 窗口内则返回缓存；
   * 2. 否则获取可用 Soul 列表 → Prompt 模板 → LLM 相关性排序；
   * 3. 若无任何 Soul 则 LLM 自生成一个，通过 SoulAccess.addSoul 添加并绑定；
   * 4. 持久化到 agent_soul（Upsert）；
   * 5. 返回匹配的 Soul ID 及详情。
   */
  async matchSoul(
    input: MatchSoulInput,
    _context: SoulCoreContext,
    output: MatchSoulOutput,
  ): Promise<boolean> {
    const { agent_id, context_id, interact_id } = input;
    if (!agent_id) {
      throw new ValidationError('matchSoul 需要提供 agent_id');
    }

    const config = await this.getCoreConfig();
    const regenRate = config?.regen_rate ?? 75;

    // 1. 检查 agent_soul 缓存
    const cacheResult = await checkMatchCache(
      this.relationDb, AGENT_SOUL_TABLE, agent_id,
      regenRate, 'random', 'soul_id',
    );
    if (cacheResult.hit && cacheResult.entries?.[0]) {
      const soulRecord = await this.getSoulById(cacheResult.entries[0].entity_id);
      output.soul_id = cacheResult.entries[0].entity_id;
      output.soul = soulRecord;
      output.from_cache = true;
      return true;
    }

    // 2. 获取可用 Soul 列表
    const soOutput = new SoSoulOutput();
    await this.soulAccess.soSoul(
      { conditions: [{ field: 'enable', operator: Operator.EQ, value: 1 }] },
      new SoulContext(),
      soOutput,
    );
    const availableSouls = soOutput.list;

    // 3. 无 Soul：自生成
    if (availableSouls.length === 0) {
      const generatedId = await this.generateAndAddSoul(agent_id, context_id, interact_id);
      await clearMatchCache(this.relationDb, AGENT_SOUL_TABLE, agent_id);
      await persistMatchBinding(this.relationDb, AGENT_SOUL_TABLE, agent_id, generatedId, 'soul_id');
      const soulRecord = await this.getSoulById(generatedId);
      output.soul_id = generatedId;
      output.soul = soulRecord;
      output.from_cache = false;
      return true;
    }

    // 4. LLM 排名
    const selectedSoulId = await this.rankSoulsByLLM(
      agent_id, context_id, interact_id, availableSouls, config,
    );

    // 5. 持久化
    await clearMatchCache(this.relationDb, AGENT_SOUL_TABLE, agent_id);
    await persistMatchBinding(this.relationDb, AGENT_SOUL_TABLE, agent_id, selectedSoulId, 'soul_id');

    // 6. 返回详情
    const soulRecord = await this.getSoulById(selectedSoulId);
    output.soul_id = selectedSoulId;
    output.soul = soulRecord;
    output.from_cache = false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // optSoul
  // ---------------------------------------------------------------------------

  /**
   * 比较优化：候选 Soul vs 当前 Agent 绑定的 Soul。
   *
   * 1. 获取 Agent 当前 Soul；
   * 2. 获取候选 Soul；
   * 3. 调用 LLM 进行 A vs B 比较裁决；
   * 4. 若候选更好则更新 agent_soul；
   * 5. 记录使用到 soul_core_usage。
   */
  async optSoul(
    input: OptSoulInput,
    _context: SoulCoreContext,
    output: OptSoulOutput,
  ): Promise<boolean> {
    const { agent_id, soul_id } = input;
    if (!agent_id) {
      throw new ValidationError('optSoul 需要提供 agent_id');
    }
    if (!soul_id) {
      throw new ValidationError('optSoul 需要提供 soul_id');
    }

    // 1. 获取当前绑定
    const currentBinding = await this.getAgentSoulBinding(agent_id);
    if (!currentBinding) {
      throw new NotFoundError('Agent Soul 绑定', agent_id);
    }

    // 2. 获取当前 Soul 和候选 Soul
    const currentSoul = await this.getSoulById(currentBinding.soul_id);
    const candidateSoul = await this.getSoulById(soul_id);
    if (!currentSoul) {
      throw new NotFoundError('Soul', currentBinding.soul_id);
    }
    if (!candidateSoul) {
      throw new NotFoundError('Soul', soul_id);
    }

    // 3. LLM 比较
    const verdict = await this.compareSoulsByLLM(
      currentSoul, candidateSoul,
    );

    // 4. 若候选更好则更新绑定
    if (verdict.better) {
      const now = IdGenerator.now();
      await this.relationDb.update(
        AGENT_SOUL_TABLE,
        [
          { field: 'soul_id', value: soul_id },
          { field: 'updated', value: now },
        ],
        [{ field: 'id', operator: Operator.EQ, value: currentBinding.id }],
      );
      output.current_soul_id = soul_id;
    } else {
      output.current_soul_id = currentBinding.soul_id;
    }

    // 5. 记录使用到 Soul Provider（Base 层）
    await this.soulAccess.recordSoulUsage(
      { soul_id } as RecordSoulUsageInput,
      new SoulContext(),
      new RecordSoulUsageOutput(),
    );

    // 6. 记录使用到 soul_core_usage
    await this.recordSoulCoreUsage(currentBinding.id);

    output.verdict = verdict;
    return true;
  }

  // ---------------------------------------------------------------------------
  // ageSoul
  // ---------------------------------------------------------------------------

  /**
   * 依据 soul_opt_rule 规则老化不活跃的 Soul。
   */
  async ageSoul(
    _input: AgeSoulInput,
    _context: SoulCoreContext,
    output: AgeSoulOutput,
  ): Promise<boolean> {
    const engine = new AgingEngine(this.relationDb);
    const count = await engine.age({
      ruleTable: SOUL_OPT_RULE_TABLE,
      bindingTable: AGENT_SOUL_TABLE,
      bindingEntityIdColumn: 'soul_id',
      usageBindingIdColumn: 'agent_soul_id',
      usageTable: SOUL_CORE_USAGE_TABLE,
      disabler: async (entityId) => {
        const updateOutput = new UpdateSoulOutput();
        await this.soulAccess.updateSoul(
          { conditions: [{ field: 'id', operator: Operator.EQ, value: entityId }], data: { enable: false } },
          new SoulContext(),
          updateOutput,
        );
      },
    });
    output.aged_count = count;
    return true;
  }

  // ---------------------------------------------------------------------------
  // soSoulRule
  // ---------------------------------------------------------------------------

  /**
   * 查询 Soul 优化规则。
   */
  async soSoulRule(
    input: SoSoulRuleInput,
    _context: SoulCoreContext,
    output: SoSoulRuleOutput,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(SOUL_OPT_RULE_TABLE, {
      conditions: input.conditions,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      SOUL_OPT_RULE_TABLE,
      input.conditions,
    );
    output.list = rows.map((r: Record<string, unknown>) => this.toSoulOptRuleRecord(r));
    output.total = total;
    return true;
  }

  // ---------------------------------------------------------------------------
  // updateSoulRule
  // ---------------------------------------------------------------------------

  /**
   * 批量更新 Soul 优化规则（事务）。
   */
  async updateSoulRule(
    input: UpdateSoulRuleInput,
    _context: SoulCoreContext,
    _output: UpdateSoulRuleOutput,
  ): Promise<boolean> {
    if (!input.operations || input.operations.length === 0) {
      throw new ValidationError('updateSoulRule 需要提供 operations');
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
  // configSoulCore
  // ---------------------------------------------------------------------------

  /**
   * 获取或更新 soul_core_config 配置（SET 语义）。
   */
  async configSoulCore(
    input: ConfigSoulCoreInput,
    _context: SoulCoreContext,
    output: ConfigSoulCoreOutput,
  ): Promise<boolean> {
    const existing = await this.getCoreConfig();
    const now = IdGenerator.now();

    if (input.regen_rate !== undefined || input.prompt_template_id !== undefined) {
      const updateData: Array<{ field: string; value: unknown }> = [];
      if (input.regen_rate !== undefined) {
        if (input.regen_rate < 0 || input.regen_rate > 100) {
          throw new ValidationError('regen_rate 必须在 0-100 之间');
        }
        updateData.push({ field: 'regen_rate', value: input.regen_rate });
      }
      if (input.prompt_template_id !== undefined) {
        updateData.push({ field: 'prompt_template_id', value: input.prompt_template_id || null });
      }
      updateData.push({ field: 'updated', value: now });

      if (existing?.id) {
        await this.relationDb.update(
          SOUL_CORE_CONFIG_TABLE,
          updateData,
          [{ field: 'id', operator: Operator.EQ, value: existing.id }],
        );
      } else {
        await this.relationDb.insert(SOUL_CORE_CONFIG_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          ...updateData,
        ]);
      }
      this.configCache = null;
    }

    output.config = await this.getCoreConfig();
    return true;
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — 配置
  // ---------------------------------------------------------------------------

  /** 加载第一行配置记录，写入缓存 */
  private async loadCoreConfigRecord(): Promise<Record<string, unknown> | null> {
    this.configCache = null;
    const rows = await this.relationDb.select(SOUL_CORE_CONFIG_TABLE, {
      page: { current: 1, size: 1 },
    });
    const raw = rows.length > 0 ? rows[0] : null;
    this.configCache = raw
      ? this.toSoulCoreConfigRecord(raw)
      : null;
    return raw;
  }

  /** 获取配置（优先缓存） */
  private async getCoreConfig(): Promise<SoulCoreConfigRecord | null> {
    if (this.configCache !== null) {
      return this.configCache;
    }
    await this.loadCoreConfigRecord();
    return this.configCache;
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — agent_soul 绑定
  // ---------------------------------------------------------------------------

  /** 按 agent_id 获取唯一绑定 */
  private async getAgentSoulBinding(
    agentId: string,
  ): Promise<AgentSoulRecord | null> {
    const rows = await this.relationDb.select(AGENT_SOUL_TABLE, {
      conditions: [{ field: 'agent_id', operator: Operator.EQ, value: agentId }],
    });
    if (rows.length === 0) return null;
    return this.toAgentSoulRecord(rows[0]);
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — Soul 查询
  // ---------------------------------------------------------------------------

  /** 通过 SoulAccess.getSoul 获取 Soul 详情 */
  private async getSoulById(soulId: string): Promise<Record<string, unknown> | null> {
    const getOutput = new GetSoulOutput();
    await this.soulAccess.getSoul(
      { id: soulId } as GetSoulInput,
      new SoulContext(),
      getOutput,
    );
    if (!getOutput.soul) return null;
    return {
      id: getOutput.soul.id,
      soul_content: getOutput.soul.soul_content,
      soul_brief: getOutput.soul.soul_brief,
      soul_usage: getOutput.soul.soul_usage,
      enable: getOutput.soul.enable,
    };
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — Soul 自生成
  // ---------------------------------------------------------------------------

  /**
   * 通过 LLM 自动生成 Soul 并通过 SoulAccess.addSoul 持久化。
   *
   * 当 Base 层无任何 Soul 时触发。
   */
  private async generateAndAddSoul(
    agentId: string,
    contextId: string,
    interactId: string,
  ): Promise<string> {
    const llmId = await this.selectFirstEnabledLLM();
    if (!llmId) {
      throw new ProcessingError('无法生成 Soul：未找到可用 LLM');
    }

    const generationPrompt = [
      '你是一个 Persona 生成器。请为该 AI Agent 生成一个合适的 Soul（角色设定）。',
      '',
      `Agent ID: ${agentId}`,
      `Context ID: ${contextId}`,
      `Interaction ID: ${interactId}`,
      '',
      '请以 JSON 格式返回，包含以下字段：',
      '  - soul_brief: 简短的 Soul 名称/标题（一行）',
      '  - soul_content: 完整的 Soul 角色设定内容',
      '  - soul_usage: Soul 适用场景描述',
      '',
      '仅输出 JSON，不要包含其他内容。',
    ].join('\n');

    const llmOutput = new ExecLLMOutput();
    const ok = await this.llmAccess.execLLM(
      { id: llmId, params: { prompt: generationPrompt } },
      new LLMContext(),
      llmOutput,
    );
    if (!ok) {
      throw new ProcessingError(
        `Soul 生成 LLM 调用失败: ${llmOutput.error ?? '未知错误'}`,
      );
    }

    let parsed: { soul_brief: string; soul_content: string; soul_usage: string };
    try {
      const trimmed = llmOutput.result.trim();
      const jsonStr = trimmed.startsWith('```')
        ? trimmed.replace(/```(?:json)?\n?/g, '').trim()
        : trimmed;
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new ProcessingError('LLM 生成的 Soul JSON 解析失败');
    }

    const addOutput = new AddSoulOutput();
    await this.soulAccess.addSoul(
      {
        data: {
          soul_brief: parsed.soul_brief || 'Auto-generated Soul',
          soul_content: parsed.soul_content || 'A helpful AI assistant.',
          soul_usage: parsed.soul_usage || 'General purpose',
        },
      } as AddSoulInput,
      new SoulContext(),
      addOutput,
    );

    return addOutput.id;
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — LLM 排名
  // ---------------------------------------------------------------------------

  /**
   * 调用 LLM 对可用 Soul 进行相关性排序，返回最匹配的 Soul ID。
   */
  private async rankSoulsByLLM(
    agentId: string,
    contextId: string,
    interactId: string,
    availableSouls: Array<{ id: string; soul_brief: string; soul_usage?: string }>,
    config: SoulCoreConfigRecord | null,
  ): Promise<string> {
    let selectionPrompt: string;

    if (config?.prompt_template_id) {
      const getPromptOutput = new GetPromptOutput();
      await this.promptsAccess.getPrompt(
        { id: config.prompt_template_id } as GetPromptInput,
        new PromptContext(),
        getPromptOutput,
      );

      if (getPromptOutput.prompt) {
        const execPromptOutput = new ExecPromptOutput();
        await this.promptsAccess.execPrompt(
          {
            id: config.prompt_template_id,
            variables: {
              agent_id: agentId,
              context_id: contextId,
              interact_id: interactId,
              available_souls: JSON.stringify(
                availableSouls.map((s) => ({
                  id: s.id,
                  soul_brief: s.soul_brief,
                  soul_usage: s.soul_usage,
                })),
              ),
            },
          } as ExecPromptInput,
          new PromptContext(),
          execPromptOutput,
        );
        selectionPrompt = execPromptOutput.prompt;
      } else {
        selectionPrompt = this.buildDefaultMatchPrompt(
          agentId, contextId, interactId, availableSouls,
        );
      }
    } else {
      selectionPrompt = this.buildDefaultMatchPrompt(
        agentId, contextId, interactId, availableSouls,
      );
    }

    const llmId = await this.selectFirstEnabledLLM();
    if (!llmId) {
      throw new ProcessingError('Soul 排名失败：未找到可用 LLM');
    }

    const execLLMOutput = new ExecLLMOutput();
    await this.llmAccess.execLLM(
      {
        id: llmId,
        prompt: selectionPrompt,
        params: { temperature: 0.1, max_tokens: 256 },
      } as ExecLLMInput,
      new LLMContext(),
      execLLMOutput,
    );

    return this.parseSoulSelectionResult(execLLMOutput.result, availableSouls);
  }

  /** 构建默认 Soul 匹配 Prompt */
  private buildDefaultMatchPrompt(
    agentId: string,
    contextId: string,
    interactId: string,
    souls: Array<{ id: string; soul_brief: string; soul_usage?: string }>,
  ): string {
    const soulList = souls.map((s) => {
      const usage = s.soul_usage ?? '';
      return `- id: ${s.id}, brief: ${s.soul_brief}, usage: ${usage}`;
    }).join('\n');

    return [
      'You are selecting the best Soul (persona) for an AI agent. Given the available Souls below, select the most suitable one.',
      '',
      `Agent ID: ${agentId}`,
      `Context ID: ${contextId}`,
      `Interaction ID: ${interactId}`,
      '',
      'Available Souls:',
      soulList,
      '',
      'Respond with ONLY the id of the selected Soul. Do not include any other text.',
    ].join('\n');
  }

  /** 从 LLM 排名回复中解析出选中的 Soul ID */
  private parseSoulSelectionResult(
    resultText: string,
    availableSouls: Array<{ id: string; soul_brief: string }>,
  ): string {
    const trimmed = resultText.trim().replace(/^['"]+|['"]+$/g, '');

    for (const soul of availableSouls) {
      if (trimmed === soul.id) {
        return trimmed;
      }
    }

    for (const soul of availableSouls) {
      if (soul.id && trimmed.includes(soul.id)) {
        return soul.id;
      }
    }

    for (const soul of availableSouls) {
      const brief = soul.soul_brief;
      if (brief && trimmed.toLowerCase().includes(brief.toLowerCase())) {
        return soul.id;
      }
    }

    return availableSouls[0]?.id ?? '';
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — 比较优化
  // ---------------------------------------------------------------------------

  /**
   * 调用 LLM 对当前 Soul 与候选 Soul 进行 A vs B 比较。
   */
  private async compareSoulsByLLM(
    currentSoul: Record<string, unknown>,
    candidateSoul: Record<string, unknown>,
  ): Promise<SoulVerdict> {
    const llmId = await this.selectFirstEnabledLLM();
    if (!llmId) {
      throw new ProcessingError('Soul 比较失败：未找到可用 LLM');
    }

    const prompt = [
      'You are a Soul (persona) evaluator. Compare two Souls and decide which one is better for an AI agent.',
      '',
      'Soul A (current):',
      `  brief: ${currentSoul.soul_brief}`,
      `  usage: ${currentSoul.soul_usage}`,
      `  content: ${(currentSoul.soul_content as string)?.substring(0, 500)}`,
      '',
      'Soul B (candidate):',
      `  brief: ${candidateSoul.soul_brief}`,
      `  usage: ${candidateSoul.soul_usage}`,
      `  content: ${(candidateSoul.soul_content as string)?.substring(0, 500)}`,
      '',
      'Respond with a JSON object:',
      '  - better: true if Soul B is better than Soul A, false otherwise',
      '  - reason: brief explanation of your judgment',
      '',
      'Only output the JSON, no other text.',
    ].join('\n');

    const llmOutput = new ExecLLMOutput();
    const ok = await this.llmAccess.execLLM(
      { id: llmId, prompt, params: { temperature: 0.1, max_tokens: 256 } },
      new LLMContext(),
      llmOutput,
    );
    if (!ok) {
      throw new ProcessingError(
        `Soul 比较 LLM 调用失败: ${llmOutput.error ?? '未知错误'}`,
      );
    }

    try {
      const trimmed = llmOutput.result.trim();
      const jsonStr = trimmed.startsWith('```')
        ? trimmed.replace(/```(?:json)?\n?/g, '').trim()
        : trimmed;
      const parsed = JSON.parse(jsonStr);
      return {
        better: parsed.better === true,
        reason: parsed.reason || '',
      };
    } catch {
      throw new ProcessingError('LLM Soul 比较结果 JSON 解析失败');
    }
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — soul_core_usage
  // ---------------------------------------------------------------------------

  /** 记录一次 Soul 核心层使用 */
  private async recordSoulCoreUsage(agentSoulId: string): Promise<void> {
    await this.relationDb.insert(SOUL_CORE_USAGE_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: IdGenerator.now() },
      { field: 'agent_soul_id', value: agentSoulId },
      { field: 'timestamp', value: IdGenerator.now() },
    ]);
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — LLM 选择
  // ---------------------------------------------------------------------------

  /** 选择第一个启用的 LLM */
  private async selectFirstEnabledLLM(): Promise<string | null> {
    const row = await this.relationDb.selectOne(LLM_AVAILABLE_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (!row) {
      return null;
    }
    return String(row.id);
  }

  // ---------------------------------------------------------------------------
  // 记录转换
  // ---------------------------------------------------------------------------

  private toSoulCoreConfigRecord(raw: Record<string, unknown>): SoulCoreConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      regen_rate: (raw['regen_rate'] as number) ?? 75,
      prompt_template_id: (raw['prompt_template_id'] as string) || null,
    };
  }

  private toAgentSoulRecord(raw: Record<string, unknown>): AgentSoulRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      agent_id: raw['agent_id'] as string,
      soul_id: raw['soul_id'] as string,
    };
  }

  private toSoulOptRuleRecord(raw: Record<string, unknown>): SoulOptRuleRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      days: Number(raw['days']),
      min_usage_count: Number(raw['min_usage_count']),
    };
  }
}
