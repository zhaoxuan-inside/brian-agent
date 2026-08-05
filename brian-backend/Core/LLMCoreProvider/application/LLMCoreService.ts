/**
 * @fileoverview LLMCoreProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（数据库操作）、LLMAccess（LLM 搜索/调用）、
 * PromptsAccess（Prompt 模板获取/渲染）。
 *
 * 实现所有用例：matchLLM / limitLLM / checkLLMQuota / configLLMCore / recordLLMUsage。
 */

import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator, Operator } from '@brian-agent/base';
import {
  ValidationError,
  NotFoundError,
} from '../../shared/errors';
import { ensureDefaultConfig } from '../../shared/ConfigHelper';
import {
  checkMatchCache,
  clearMatchCache,
  persistMatchBinding,
} from '../../shared/MatchCacheHelper';
import type { LLMProviderQuotaRecord, LLMCoreConfigRecord } from '../domain/types';
import {
  LLMCoreContext,
  MatchLLMInput,
  MatchLLMOutput,
  LimitLLMInput,
  LimitLLMOutput,
  CheckLLMQuotaInput,
  CheckLLMQuotaOutput,
  ConfigLLMCoreInput,
  ConfigLLMCoreOutput,
  RecordLLMUsageInput,
  RecordLLMUsageOutput,
  LLM_CORE_CONFIG_TABLE,
  AGENT_LLM_TABLE,
  LLM_PROVIDER_QUOTA_TABLE,
  LLM_CORE_USAGE_TABLE,
} from '../domain/types';
import {
  SoLLMInput,
  SoLLMOutput,
  GetLLMInput,
  GetLLMOutput,
  ExecLLMInput,
  ExecLLMOutput,
  LLMContext,
} from '@brian-agent/base';
import {
  GetPromptInput,
  GetPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  PromptContext,
} from '@brian-agent/base';

/**
 * LLMCoreProvider 应用服务。
 *
 * 提供 LLM 提供商选择（匹配 + 缓存）和配额/限额管理能力。
 */
export class LLMCoreService {
  private configCache: LLMCoreConfigRecord | null = null;

  /**
   * @param relationDb RelationDBProvider 接入层实例
   * @param llmAccess LLMProvider 接入层实例
   * @param promptsAccess PromptsProvider 接入层实例
   */
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  /**
   * 初始化：确保默认配置存在。
   */
  async initialize(): Promise<void> {
    await ensureDefaultConfig(this.relationDb, LLM_CORE_CONFIG_TABLE, [
      { field: 'regen_rate', value: 75 },
      { field: 'prompt_template_id', value: null },
    ]);
  }

  // ---------------------------------------------------------------------------
  // matchLLM — Agent LLM 匹配（含缓存与重新评估）
  // ---------------------------------------------------------------------------

  /**
   * 为指定 Agent 匹配合适的 LLM 提供商。
   *
   * 流程：
   * 1. 查询 agent_llm 表是否存在缓存绑定
   * 2. 若命中缓存，根据 regen_rate 概率决定是否重用
   * 3. 否则搜索可用 LLM、构建 Prompt、调用 LLM 排名，结果写入 agent_llm
   */
  async matchLLM(
    input: MatchLLMInput,
    _context: LLMCoreContext,
    output: MatchLLMOutput,
  ): Promise<boolean> {
    if (!input.agent_id) {
      throw new ValidationError('matchLLM 需要提供 agent_id');
    }

    // 1. 检查 agent_llm 缓存
    const config = await this.getCoreConfig();
    const cacheResult = await checkMatchCache(
      this.relationDb, AGENT_LLM_TABLE, input.agent_id,
      config?.regen_rate ?? 75, 'random', 'llm_id',
    );
    if (cacheResult.hit && cacheResult.entries?.[0]) {
      const llmRecord = await this.getLLMById(cacheResult.entries[0].entity_id);
      output.llm_id = cacheResult.entries[0].entity_id;
      output.llm = llmRecord;
      output.from_cache = true;
      return true;
    }

    // 2. 搜索可用 LLM
    const soOutput = new SoLLMOutput();
    await this.llmAccess.soLLM({} as SoLLMInput, new LLMContext(), soOutput);
    const availableLLMs = soOutput.list;

    if (availableLLMs.length === 0) {
      throw new NotFoundError('可用 LLM', 'any');
    }

    if (availableLLMs.length === 1) {
      const llmRecord = await this.getLLMById(availableLLMs[0].id);
      output.llm_id = availableLLMs[0].id;
      output.llm = llmRecord;
      output.from_cache = false;
      return true;
    }

    // 3. 获取 Prompt 模板并渲染
    let selectionPrompt: string;

    if (config?.prompt_template_id) {
      // 使用配置的 Prompt 模板
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
              agent_id: input.agent_id,
              context_id: input.context_id,
              interact_id: input.interact_id,
              available_llms: JSON.stringify(
                availableLLMs.map((l) => ({ id: l.id, llm_title: l.llm_title, llm_brief: l.llm_brief })),
              ),
            },
          } as ExecPromptInput,
          new PromptContext(),
          execPromptOutput,
        );
        selectionPrompt = execPromptOutput.prompt;
      } else {
        selectionPrompt = this.buildDefaultSelectionPrompt(
          input, availableLLMs,
        );
      }
    } else {
      selectionPrompt = this.buildDefaultSelectionPrompt(
        input, availableLLMs,
      );
    }

    // 4. 调用 LLM 进行排名：优先使用默认模型，否则使用第一个可用 LLM
    const rankerLLM = availableLLMs.find((l) => l.is_default) ?? availableLLMs[0];
    const execLLMOutput = new ExecLLMOutput();
    await this.llmAccess.execLLM(
      {
        id: rankerLLM.id,
        params: { prompt: selectionPrompt, temperature: 0.1, max_tokens: 256 },
      } as ExecLLMInput,
      new LLMContext(),
      execLLMOutput,
    );

    // 5. 解析排名结果
    const selectedLLMId = this.parseSelectionResult(
      execLLMOutput.result,
      availableLLMs,
    );

    // 6. 持久化到 agent_llm
    await clearMatchCache(this.relationDb, AGENT_LLM_TABLE, input.agent_id);
    await persistMatchBinding(this.relationDb, AGENT_LLM_TABLE, input.agent_id, selectedLLMId, 'llm_id');

    // 7. 获取 LLM 详情返回
    const llmRecord = await this.getLLMById(selectedLLMId);
    output.llm_id = selectedLLMId;
    output.llm = llmRecord;
    output.from_cache = false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // limitLLM — 设置 LLM 提供商配额
  // ---------------------------------------------------------------------------

  /**
   * 为指定 LLM 提供商设置配额限制。
   *
   * 采用 upsert 语义：若提供商已存在配额记录则更新，否则新建。
   */
  async limitLLM(
    input: LimitLLMInput,
    _context: LLMCoreContext,
    output: LimitLLMOutput,
  ): Promise<boolean> {
    if (!input.llm_provider_id) {
      throw new ValidationError('limitLLM 需要提供 llm_provider_id');
    }

    const now = IdGenerator.now();
    const existing = await this.getProviderQuota(input.llm_provider_id);

    if (existing) {
      // 更新
      const updateData: Array<{ field: string; value: unknown }> = [];
      const quotaFields: Array<keyof LimitLLMInput> = [
        'quota_tokens_per_day', 'quota_tokens_per_week', 'quota_tokens_per_month',
        'quota_calls_per_day', 'quota_calls_per_week', 'quota_calls_per_month',
      ];
      for (const field of quotaFields) {
        if (input[field] !== undefined && input[field] !== null) {
          updateData.push({ field, value: input[field] });
        }
      }
      if (updateData.length > 0) {
        updateData.push({ field: 'updated', value: now });
        await this.relationDb.update(
          LLM_PROVIDER_QUOTA_TABLE,
          updateData,
          [{ field: 'id', operator: Operator.EQ, value: existing.id }],
        );
      }
      output.id = existing.id;
    } else {
      // 新建
      const id = IdGenerator.generate();
      const insertData = [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'llm_provider_id', value: input.llm_provider_id },
        { field: 'quota_tokens_per_day', value: input.quota_tokens_per_day ?? 0 },
        { field: 'quota_tokens_per_week', value: input.quota_tokens_per_week ?? 0 },
        { field: 'quota_tokens_per_month', value: input.quota_tokens_per_month ?? 0 },
        { field: 'quota_calls_per_day', value: input.quota_calls_per_day ?? 0 },
        { field: 'quota_calls_per_week', value: input.quota_calls_per_week ?? 0 },
        { field: 'quota_calls_per_month', value: input.quota_calls_per_month ?? 0 },
      ];
      await this.relationDb.insert(LLM_PROVIDER_QUOTA_TABLE, insertData);
      output.id = id;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // checkLLMQuota — 检查 LLM 提供商配额
  // ---------------------------------------------------------------------------

  /**
   * 检查指定提供商的配额使用情况。
   *
   * 读取配额限制与实际用量，返回每个周期（日/周/月）的配额状态。
   */
  async checkLLMQuota(
    input: CheckLLMQuotaInput,
    _context: LLMCoreContext,
    output: CheckLLMQuotaOutput,
  ): Promise<boolean> {
    if (!input.llm_provider_id) {
      throw new ValidationError('checkLLMQuota 需要提供 llm_provider_id');
    }

    const quota = await this.getProviderQuota(input.llm_provider_id);

    const now = IdGenerator.now();
    const dayStart = this.getDayStart(now);
    const weekStart = this.getWeekStart(now);
    const monthStart = this.getMonthStart(now);

    // 查询各周期用量
    const dailyUsage = await this.getUsageInRange(
      input.llm_provider_id, dayStart, now,
    );
    const weeklyUsage = await this.getUsageInRange(
      input.llm_provider_id, weekStart, now,
    );
    const monthlyUsage = await this.getUsageInRange(
      input.llm_provider_id, monthStart, now,
    );

    output.quota = {
      daily: this.buildQuotaStatus(
        quota, 'quota_tokens_per_day', 'quota_calls_per_day', dailyUsage,
      ),
      weekly: this.buildQuotaStatus(
        quota, 'quota_tokens_per_week', 'quota_calls_per_week', weeklyUsage,
      ),
      monthly: this.buildQuotaStatus(
        quota, 'quota_tokens_per_month', 'quota_calls_per_month', monthlyUsage,
      ),
    };
    return true;
  }

  // ---------------------------------------------------------------------------
  // configLLMCore — 获取当前配置
  // ---------------------------------------------------------------------------

  /**
   * 获取或更新 LLMCore 配置（SET 语义）。
   *
   * 支持配置 regen_rate 和 prompt_template_id。
   */
  async configLLMCore(
    input: ConfigLLMCoreInput,
    _context: LLMCoreContext,
    output: ConfigLLMCoreOutput,
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
        if (input.prompt_template_id) {
          const getPromptOutput = new GetPromptOutput();
          await this.promptsAccess.getPrompt(
            { id: input.prompt_template_id } as GetPromptInput,
            new PromptContext(),
            getPromptOutput,
          );
          if (!getPromptOutput.prompt) {
            throw new ValidationError(`prompt_template_id ${input.prompt_template_id} 不存在`);
          }
        }
        updateData.push({ field: 'prompt_template_id', value: input.prompt_template_id || null });
      }
      updateData.push({ field: 'updated', value: now });

      if (existing?.id) {
        await this.relationDb.update(
          LLM_CORE_CONFIG_TABLE,
          updateData,
          [{ field: 'id', operator: Operator.EQ, value: existing.id }],
        );
      } else {
        await this.relationDb.insert(LLM_CORE_CONFIG_TABLE, [
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
  // recordLLMUsage — 记录 LLM 用量（供外部上报）
  // ---------------------------------------------------------------------------

  /**
   * 记录一次 LLM 调用的用量，用于配额统计。
   */
  async recordLLMUsage(
    input: RecordLLMUsageInput,
    _context: LLMCoreContext,
    output: RecordLLMUsageOutput,
  ): Promise<boolean> {
    if (!input.llm_provider_id) {
      throw new ValidationError('recordLLMUsage 需要提供 llm_provider_id');
    }

    const now = IdGenerator.now();
    const id = IdGenerator.generate();
    const count = input.call_count ?? 1;

    await this.relationDb.insert(LLM_CORE_USAGE_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'llm_provider_id', value: input.llm_provider_id },
      { field: 'timestamp', value: now },
      { field: 'tokens_used', value: input.tokens_used },
      { field: 'call_count', value: count },
    ]);

    output.id = id;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Private helpers — 配置
  // ---------------------------------------------------------------------------

  /** 加载第一行配置记录，写入缓存 */
  private async loadCoreConfigRecord(): Promise<Record<string, unknown> | null> {
    this.configCache = null;
    const rows = await this.relationDb.select(LLM_CORE_CONFIG_TABLE, {
      page: { current: 1, size: 1 },
    });
    const raw = rows.length > 0 ? rows[0] : null;
    this.configCache = raw
      ? this.toCoreConfigRecord(raw)
      : null;
    return raw;
  }

  /** 获取配置（优先缓存） */
  private async getCoreConfig(): Promise<LLMCoreConfigRecord | null> {
    if (this.configCache !== null) {
      return this.configCache;
    }
    await this.loadCoreConfigRecord();
    return this.configCache;
  }

  /** 将原始 DB 行转为 LLMCoreConfigRecord */
  private toCoreConfigRecord(raw: Record<string, unknown>): LLMCoreConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      regen_rate: (raw['regen_rate'] as number) ?? 75,
      prompt_template_id: (raw['prompt_template_id'] as string) || null,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — LLM 查询
  // ---------------------------------------------------------------------------

  /** 通过 soLLM 获取 LLM 详情 */
  private async getLLMById(llmId: string): Promise<Record<string, unknown> | null> {
    const soOutput = new SoLLMOutput();
    await this.llmAccess.soLLM(
      { conditions: [{ field: 'id', operator: Operator.EQ, value: llmId }] } as SoLLMInput,
      new LLMContext(),
      soOutput,
    );
    const llm = soOutput.list[0];
    if (!llm) return null;
    return {
      id: llm.id,
      llm_provider_id: llm.llm_provider_id,
      llm_title: llm.llm_title,
      llm_brief: llm.llm_brief,
      llm_type: llm.llm_type,
      enable: llm.enable,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — 配额
  // ---------------------------------------------------------------------------

  /** 获取提供商配额记录 */
  private async getProviderQuota(
    llmProviderId: string,
  ): Promise<LLMProviderQuotaRecord | null> {
    const rows = await this.relationDb.select(LLM_PROVIDER_QUOTA_TABLE, {
      conditions: [
        { field: 'llm_provider_id', operator: Operator.EQ, value: llmProviderId },
      ],
    });
    if (rows.length === 0) return null;
    return this.toQuotaRecord(rows[0]);
  }

  private toQuotaRecord(raw: Record<string, unknown>): LLMProviderQuotaRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      llm_provider_id: raw['llm_provider_id'] as string,
      quota_tokens_per_day: (raw['quota_tokens_per_day'] as number) ?? 0,
      quota_tokens_per_week: (raw['quota_tokens_per_week'] as number) ?? 0,
      quota_tokens_per_month: (raw['quota_tokens_per_month'] as number) ?? 0,
      quota_calls_per_day: (raw['quota_calls_per_day'] as number) ?? 0,
      quota_calls_per_week: (raw['quota_calls_per_week'] as number) ?? 0,
      quota_calls_per_month: (raw['quota_calls_per_month'] as number) ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — 用量统计
  // ---------------------------------------------------------------------------

  /**
   * 查询指定提供商在时间范围内的用量总和。
   *
   * @returns { tokens_used, call_count } 合计值
   */
  private async getUsageInRange(
    llmProviderId: string,
    rangeStart: number,
    rangeEnd: number,
  ): Promise<{ tokens_used: number; call_count: number }> {
    const rows = await this.relationDb.select(LLM_CORE_USAGE_TABLE, {
      conditions: [
        { field: 'llm_provider_id', operator: Operator.EQ, value: llmProviderId },
        { field: 'timestamp', operator: 'GE', value: rangeStart },
        { field: 'timestamp', operator: 'LE', value: rangeEnd },
      ],
    });

    let tokensUsed = 0;
    let callCount = 0;
    for (const row of rows) {
      tokensUsed += (row['tokens_used'] as number) || 0;
      callCount += (row['call_count'] as number) || 0;
    }
    return { tokens_used: tokensUsed, call_count: callCount };
  }

  /** 构建单周期配额状态 */
  private buildQuotaStatus(
    quota: LLMProviderQuotaRecord | null,
    tokenField: keyof LLMProviderQuotaRecord,
    callField: keyof LLMProviderQuotaRecord,
    usage: { tokens_used: number; call_count: number },
  ): { limit: number; used: number; available: number } {
    const tokenLimit = (quota?.[tokenField] as number) || 0;
    const callLimit = (quota?.[callField] as number) || 0;

    // 取 Token 维度与调用次数维度的限制中更严格的
    const maxLimit =
      tokenLimit > 0 && callLimit > 0
        ? Math.min(tokenLimit, callLimit)
        : tokenLimit > 0
          ? tokenLimit
          : callLimit > 0
            ? callLimit
            : 0;

    const maxUsed = Math.max(usage.tokens_used, usage.call_count);
    const available = maxLimit > 0 ? Math.max(0, maxLimit - maxUsed) : -1; // -1 表示无限制

    return {
      limit: maxLimit,
      used: maxUsed,
      available,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers — 时间计算
  // ---------------------------------------------------------------------------

  /** 获取当天 0 点的时间戳（毫秒） */
  private getDayStart(timestamp: number): number {
    const d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** 获取本周一 0 点的时间戳（毫秒） */
  private getWeekStart(timestamp: number): number {
    const d = new Date(timestamp);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 周一为第一天
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  /** 获取当月 1 日 0 点的时间戳（毫秒） */
  private getMonthStart(timestamp: number): number {
    const d = new Date(timestamp);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  // ---------------------------------------------------------------------------
  // Private helpers — Prompt 构建与结果解析
  // ---------------------------------------------------------------------------

  /** 构建默认的 LLM 选择排名 Prompt */
  private buildDefaultSelectionPrompt(
    input: MatchLLMInput,
    availableLLMs: Array<{ id: string; llm_title?: string; llm_brief?: string | null; llm_usage?: string }>,
  ): string {
    const llmList = availableLLMs.map((l) => {
      const title = l.llm_title ?? 'Unknown';
      const brief = l.llm_brief ?? '';
      const usage = l.llm_usage ?? '';
      return `- id: ${l.id}, name: ${title}, brief: ${brief}, usage: ${usage}`;
    }).join('\n');

    return `You are selecting the best LLM for an AI agent. Given the available LLMs below, select the most suitable one.

Agent ID: ${input.agent_id}
Context ID: ${input.context_id}
Interaction ID: ${input.interact_id}

Available LLMs:
${llmList}

Respond with ONLY the id of the selected LLM. Do not include any other text.`;
  }

  /** 从 LLM 排名回复中解析出选中的 LLM ID */
  private parseSelectionResult(
    resultText: string,
    availableLLMs: Array<{ id: string; llm_title?: string }>,
  ): string {
    const trimmed = resultText.trim().replace(/^['"]+|['"]+$/g, '');

    for (const llm of availableLLMs) {
      if (trimmed === llm.id) {
        return trimmed;
      }
    }

    for (const llm of availableLLMs) {
      if (llm.id && trimmed.includes(llm.id)) {
        return llm.id;
      }
    }

    for (const llm of availableLLMs) {
      const title = llm.llm_title;
      if (title && trimmed.toLowerCase().includes(title.toLowerCase())) {
        return llm.id;
      }
    }

    return availableLLMs[0]?.id ?? '';
  }
}
