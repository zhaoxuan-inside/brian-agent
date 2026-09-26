import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator, Operator } from '@brian-agent/base';
import {
  ValidationError,
  NotFoundError,
  ProcessingError,
} from '../../shared/errors';
import { parseRankingCandidates, filterByThreshold } from '../../shared/RankingParser';
import { ScoreThreshold } from '../../shared/MatchConstants';
import { ensureDefaultConfig } from '../../shared/ConfigHelper';
import { SingleRowConfigStore } from '../../shared/SingleRowConfigStore';
import { checkMatchCache, clearMatchCache, persistMatchBinding } from '../../shared';
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
import { SoLLMInput, SoLLMOutput, ExecLLMInput, ExecLLMOutput, LLMContext, PROMPT_TEMPLATE_TABLE } from '@brian-agent/base';
import {
  GetPromptInput,
  GetPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  PromptContext,
} from '@brian-agent/base';

export class LLMCoreService {
  
  private readonly configStore: SingleRowConfigStore<LLMCoreConfigRecord>;

  

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {
    this.configStore = new SingleRowConfigStore<LLMCoreConfigRecord>(relationDb, {
      table: LLM_CORE_CONFIG_TABLE,
      toRecord: (raw) => this.toCoreConfigRecord(raw),
      defaults: [],
    });
  }

  

  async initialize(): Promise<void> {
    await ensureDefaultConfig(this.relationDb, LLM_CORE_CONFIG_TABLE, [
      { field: 'regen_rate', value: 75 },
      { field: 'prompt_template_id', value: null },
      { field: 'score_threshold', value: ScoreThreshold.Default },
    ]);
  }

  
  
  

  

  async matchLLM(input: MatchLLMInput, output: MatchLLMOutput, context: LLMCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) {
      throw new ValidationError('matchLLM 需要提供 agent_id');
    }

    const config = await this.getCoreConfig();
    const regenRate = config?.regen_rate ?? 75;

    
    const soOutput = new SoLLMOutput();
    await this.llmAccess.soLLM({} as SoLLMInput, soOutput, new LLMContext());
    const availableLLMs = soOutput.list;

    
    const cacheResult = await checkMatchCache(
      this.relationDb, AGENT_LLM_TABLE, input.agent_id,
      regenRate, 'random', 'llm_id',
    );
    if (cacheResult.hit && cacheResult.entries?.[0]) {
      const boundId = cacheResult.entries[0].entity_id;
      
      const llmRecord = await this.getLLMById(boundId);
      if (llmRecord && llmRecord.enable) {
        output.llm_id = boundId;
        output.llm = llmRecord;
        output.from_cache = true;
        return true;
      }
      
      await clearMatchCache(this.relationDb, AGENT_LLM_TABLE, input.agent_id);
    }

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

    
    const selectionVariables = {
      agent_id: input.agent_id,
      context_id: input.context_id,
      run_id: input.run_id,
      available_llms: this.buildLlmList(availableLLMs),
    };
    const templateId = config?.prompt_template_id || await this.soMatchPromptTemplateId();
    const selectionPrompt = await this.renderMatchPrompt(
      templateId,
      selectionVariables,
    );
    const rankerLLM = availableLLMs.find((l) => l.is_default) ?? availableLLMs[0];
    const execLLMOutput = new ExecLLMOutput();
    const ok = await this.llmAccess.execLLM(
      {
        id: rankerLLM.id,
        prompt: selectionPrompt,
        temperature: 0.1,
        max_tokens: 256,
        session_id: context.session_id || '',
        run_id: input.run_id || context.run_id || '',
        work_id: context.work_id || input.work_id || '',
        caller: 'LLMCoreService.matchLLM',
      } as ExecLLMInput,
      execLLMOutput, new LLMContext(),
    );
    const threshold = config?.score_threshold ?? ScoreThreshold.Default;
    const ranked = ok
      ? filterByThreshold(parseRankingCandidates(execLLMOutput.result ?? ''), threshold)
      : [];
    const llmIds = new Set(availableLLMs.map((l) => l.id));
    let selectedLLMId = ranked
      .map((c) => c.id)
      .find((id) => llmIds.has(id)) ?? '';

    
    if (!selectedLLMId) {
      selectedLLMId = rankerLLM.id;
    }

    await clearMatchCache(this.relationDb, AGENT_LLM_TABLE, input.agent_id);
    await persistMatchBinding(this.relationDb, AGENT_LLM_TABLE, input.agent_id, selectedLLMId, 'llm_id');

    const llmRecord = await this.getLLMById(selectedLLMId);
    output.llm_id = selectedLLMId;
    output.llm = llmRecord;
    output.from_cache = false;
    return true;
  }

  
  
  

  

  async limitLLM(input: LimitLLMInput, output: LimitLLMOutput, _context: LLMCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.llm_provider_id) {
      throw new ValidationError('limitLLM 需要提供 llm_provider_id');
    }

    const now = IdGenerator.now();
    const existing = await this.getProviderQuota(input.llm_provider_id);

    if (existing) {
      
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

  
  
  

  

  async checkLLMQuota(input: CheckLLMQuotaInput, output: CheckLLMQuotaOutput, _context: LLMCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.llm_provider_id) {
      throw new ValidationError('checkLLMQuota 需要提供 llm_provider_id');
    }

    const quota = await this.getProviderQuota(input.llm_provider_id);

    const now = IdGenerator.now();
    const dayStart = this.getDayStart(now);
    const weekStart = this.getWeekStart(now);
    const monthStart = this.getMonthStart(now);

    
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

  
  
  

  

  async configLLMCore(input: ConfigLLMCoreInput, output: ConfigLLMCoreOutput, _context: LLMCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.regen_rate !== undefined || input.similarity_threshold !== undefined || input.prompt_template_id !== undefined || input.score_threshold !== undefined) {
      const updateData: Array<{ field: string; value: unknown }> = [];
      if (input.regen_rate !== undefined) {
        if (input.regen_rate < 0 || input.regen_rate > 100) {
          throw new ValidationError('regen_rate 必须在 0-100 之间');
        }
        updateData.push({ field: 'regen_rate', value: input.regen_rate });
      }
      if (input.similarity_threshold !== undefined) {
        if (input.similarity_threshold < 0 || input.similarity_threshold > 1) {
          throw new ValidationError('similarity_threshold 必须在 0.0-1.0 之间');
        }
        updateData.push({ field: 'similarity_threshold', value: input.similarity_threshold });
      }
      if (input.prompt_template_id !== undefined) {
        if (input.prompt_template_id) {
          const getPromptOutput = new GetPromptOutput();
          await this.promptsAccess.soPromptById(
            { id: input.prompt_template_id } as GetPromptInput,
            getPromptOutput, new PromptContext(),
          );
          if (!getPromptOutput.prompt) {
            throw new ValidationError(`prompt_template_id ${input.prompt_template_id} 不存在`);
          }
        }
        updateData.push({ field: 'prompt_template_id', value: input.prompt_template_id || null });
      }
      if (input.score_threshold !== undefined) {
        if (input.score_threshold < 0 || input.score_threshold > 100) {
          throw new ValidationError('score_threshold 必须在 0-100 之间');
        }
        updateData.push({ field: 'score_threshold', value: input.score_threshold });
      }
      await this.configStore.upsert(updateData);
    }

    output.config = await this.getCoreConfig();
    return true;
  }

  
  
  

  

  async recordLLMUsage(input: RecordLLMUsageInput, output: RecordLLMUsageOutput, _context: LLMCoreContext, _metrics?: Metrics, _report?: Report,
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

  
  
  

  
  private async getCoreConfig(): Promise<LLMCoreConfigRecord | null> {
    return this.configStore.load();
  }

  
  private toCoreConfigRecord(raw: Record<string, unknown>): LLMCoreConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      regen_rate: (raw['regen_rate'] as number) ?? 75,
      similarity_threshold: Number(raw['similarity_threshold'] ?? 0.7),
      prompt_template_id: (raw['prompt_template_id'] as string) || null,
      score_threshold: Number(raw['score_threshold'] ?? ScoreThreshold.Default),
    };
  }

  
  
  

  
  private async getLLMById(llmId: string): Promise<Record<string, unknown> | null> {
    const soOutput = new SoLLMOutput();
    await this.llmAccess.soLLM(
      { conditions: [{ field: 'id', operator: Operator.EQ, value: llmId }] } as SoLLMInput,
      soOutput, new LLMContext(),
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

  
  private buildQuotaStatus(
    quota: LLMProviderQuotaRecord | null,
    tokenField: keyof LLMProviderQuotaRecord,
    callField: keyof LLMProviderQuotaRecord,
    usage: { tokens_used: number; call_count: number },
  ): { limit: number; used: number; available: number } {
    const tokenLimit = (quota?.[tokenField] as number) || 0;
    const callLimit = (quota?.[callField] as number) || 0;

    
    const maxLimit =
      tokenLimit > 0 && callLimit > 0
        ? Math.min(tokenLimit, callLimit)
        : tokenLimit > 0
          ? tokenLimit
          : callLimit > 0
            ? callLimit
            : 0;

    const maxUsed = Math.max(usage.tokens_used, usage.call_count);
    const available = maxLimit > 0 ? Math.max(0, maxLimit - maxUsed) : -1;

    return {
      limit: maxLimit,
      used: maxUsed,
      available,
    };
  }

  
  
  

  
  private getDayStart(timestamp: number): number {
    const d = new Date(timestamp);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  
  private getWeekStart(timestamp: number): number {
    const d = new Date(timestamp);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  
  private getMonthStart(timestamp: number): number {
    const d = new Date(timestamp);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  
  
  

  
  private buildLlmList(
    availableLLMs: Array<{ id: string; llm_title?: string; llm_brief?: string | null; model_usage?: string }>,
  ): string {
    return availableLLMs.map((l) => {
      const title = l.llm_title ?? 'Unknown';
      const brief = l.llm_brief ?? '';
      const usage = l.model_usage ?? '';
      return `- id: ${l.id}, name: ${title}, brief: ${brief}, usage: ${usage}`;
    }).join('\n');
  }

  

  private async renderMatchPrompt(templateId: string, variables: Record<string, unknown>): Promise<string> {
    const execPromptOutput = new ExecPromptOutput();
    await this.promptsAccess.execPrompt(
      { id: templateId, variables } as ExecPromptInput,
      execPromptOutput, new PromptContext(),
    );
    if (execPromptOutput.prompt) {
      return execPromptOutput.prompt;
    }
    throw new ProcessingError(`Prompt 模板不可用或渲染为空: ${templateId}`);
  }

  
  private async soMatchPromptTemplateId(): Promise<string> {
    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.LIKE, value: '%LLM%匹配%' },
    ]);
    if (row && row.id) return String(row.id);
    const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (anyRow && anyRow.id) return String(anyRow.id);
    throw new ProcessingError('未找到 LLM 匹配提示词模板');
  }

}
