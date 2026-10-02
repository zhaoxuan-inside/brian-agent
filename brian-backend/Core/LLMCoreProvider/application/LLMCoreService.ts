import { Metrics, Report } from '@brian-agent/base';
import {
  funnelBm25Ranking,
  funnelSemanticRouterRanking,
  buildFunnelDocText,
  analyzeTaskComplexity,
  runComponentElection,
  fullTierLadder,
  applySignalScores,
  DEFAULT_ELECTION_THRESHOLDS,
  type FunnelRankingEntry,
  type ComponentElectionAdapter,
  type ElectionCandidate,
  type ElectionSignals,
  type ElectionThresholds,
  type ElectionTierExpr,
} from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator, Operator } from '@brian-agent/base';
import {
  ValidationError,
  ProcessingError,
} from '../../shared/errors';
import { ScoreThreshold } from '../../shared/MatchConstants';
import { ensureDefaultConfig } from '../../shared/ConfigHelper';
import { SingleRowConfigStore } from '../../shared/SingleRowConfigStore';
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
  AGENT_RECORD_TABLE,
  LLM_PROVIDER_QUOTA_TABLE,
} from '../domain/types';
import { SoLLMInput, SoLLMOutput, EmbedLLMInput, EmbedLLMOutput, LLMContext, PROMPT_TEMPLATE_TABLE, TraceService, RecordUsageInput, RecordUsageOutput, USAGE_EVENT_TABLE } from '@brian-agent/base';
import { createComponentFunnelTrace, pushComponentFunnel, FUNNEL_MECHANISM_LABELS, type ComponentFunnelTrace } from '@brian-agent/base';
import {
  GetPromptInput,
  GetPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  PromptContext,
} from '@brian-agent/base';

export class LLMCoreService {
  
  private readonly configStore: SingleRowConfigStore<LLMCoreConfigRecord>;

  private readonly trace: TraceService;

  

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
    this.trace = new TraceService(relationDb);
  }

  

  async initialize(): Promise<void> {
    await ensureDefaultConfig(this.relationDb, LLM_CORE_CONFIG_TABLE, [
      { field: 'regen_rate', value: 75 },
      { field: 'prompt_template_id', value: null },
      { field: 'score_threshold', value: ScoreThreshold.Default },
    ]);
  }

  
  
  

  

  async matchLLM(input: MatchLLMInput, output: MatchLLMOutput, context: LLMCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) {
      output.error = 'matchLLM 需要提供 agent_id';
      output.error_code = 'VALIDATION_ERROR';
      return false;
    }
    const funnel = createComponentFunnelTrace('llm', input.agent_id);
    const route = await this.soMatchLlmRoute(input, output, context, metrics, funnel);
    pushComponentFunnel(report, funnel, route.detail);
    return route.ok;
  }

  private async soMatchLlmRoute(
    input: MatchLLMInput, output: MatchLLMOutput, context: LLMCoreContext,
    metrics: Metrics | undefined, funnel: ComponentFunnelTrace,
  ): Promise<{ ok: boolean; detail: string }> {
    const config = await this.getCoreConfig();
    const targetType = (input.llm_type || 'text').toLowerCase();
    const hit = await this.checkCachedLLM(input.agent_id, targetType, config?.regen_rate ?? 75, output);
    if (hit) {
      funnel.addDirect('缓存绑定复用', [{ id: output.llm_id, name: this.soLlmTitle(output.llm, output.llm_id), score: 100 }]);
      return { ok: true, detail: 'cache_hit' };
    }

    const availableLLMs = await this.soAvailableLLMsByType(targetType);
    if (availableLLMs.length === 0) {
      output.error = `未找到可用的 ${targetType} 模型`;
      output.error_code = 'NOT_FOUND';
      return { ok: false, detail: 'empty' };
    }
    const adapter = this.llmElectionAdapter(input, output, availableLLMs, config, context, funnel);
    await runComponentElection(adapter, input, output);
    return { ok: true, detail: output.detail || 'election_llm_done' };
  }

  /** LLM 选举适配器（规格 3.1：唯一候选直采 + 全量阶梯 + 默认模型终端） */
  private llmElectionAdapter(
    input: MatchLLMInput, output: MatchLLMOutput, availableLLMs: SoLLMOutput['list'],
    config: LLMCoreConfigRecord | null, context: LLMCoreContext, funnel?: ComponentFunnelTrace,
  ): ComponentElectionAdapter<SoLLMOutput['list'][number]> {
    return {
      component: 'llm',
      multiSelect: false,
      directAdoptSingle: true,
      funnel,
      findReusable: async () => null,
      extractSignals: () => this.llmExtractSignals(input, availableLLMs, config, context, funnel),
      tiers: () => fullTierLadder(),
      select: (_i, _o, picked, tier) => this.llmSelect(input, output, picked[0], config, tier, funnel),
      exhaust: () => this.llmDefaultTerminal(input, output, availableLLMs, funnel),
    };
  }

  /** 信号提取（并行）：合法集（类型过滤）+ BM25（title+brief）+ 语义路由（描述向量，LLM 无范例表）；结构弃权 */
  private async llmExtractSignals(
    input: MatchLLMInput, availableLLMs: SoLLMOutput['list'],
    config: LLMCoreConfigRecord | null, context: LLMCoreContext, funnel?: ComponentFunnelTrace,
  ): Promise<ElectionSignals<SoLLMOutput['list'][number]>> {
    const thresholds: ElectionThresholds = {
      ...DEFAULT_ELECTION_THRESHOLDS,
      bm25: config?.score_threshold ?? DEFAULT_ELECTION_THRESHOLDS.bm25,
    };
    const docs = availableLLMs.map((l) => ({ id: String(l.id ?? ''), name: String(l.llm_title ?? ''), brief: String(l.llm_brief ?? '') }));
    const docOf = new Map(availableLLMs.map((l) => [String(l.id ?? ''), l]));
    const taskText = input.task_content ?? '';
    const queryEmbedding = taskText ? await this.embedTask(taskText, context).catch(() => []) : [];
    const [bm25Ranking, vectorRanking] = await Promise.all([
      Promise.resolve(funnelBm25Ranking(taskText, docs)),
      this.llmVectorSignal(queryEmbedding, docs, context, funnel),
    ]);
    const candidates = docs.map((d) => ({
      id: d.id, label: d.name || d.id, doc: docOf.get(d.id) as SoLLMOutput['list'][number],
      bm25Score: 0, vectorScore: 0, exampleSim: 0, negativeSim: 0, rejectedByNegative: false,
    }));
    applySignalScores(candidates, bm25Ranking, vectorRanking);
    return { candidates, complexity: analyzeTaskComplexity({ text: taskText }), structureIds: new Set<string>(), thresholds };
  }

  /** 向量信号（并行支路）：描述向量语义路由（LLM 无正/负范例表，S_pos=S_desc） */
  private async llmVectorSignal(queryEmbedding: number[], docs: Array<{ id: string; name: string; brief: string }>, context: LLMCoreContext, funnel?: ComponentFunnelTrace): Promise<FunnelRankingEntry<{ id: string; name: string; brief: string }>[]> {
    if (!queryEmbedding || queryEmbedding.length === 0) return [];
    const ranking = await funnelSemanticRouterRanking(
      queryEmbedding, docs, (d) => this.embedTask(buildFunnelDocText(d.name, d.brief), context),
      new Map(), new Map(), new Map(),
    );
    funnel?.addMechanism({
      mechanism: 'vector', label: FUNNEL_MECHANISM_LABELS.vector, adopted: ranking.some((e) => !e.rejected && e.score >= 80),
      candidates: ranking.map((e) => ({ id: e.doc.id, name: e.doc.name || e.doc.brief.slice(0, 40), score: e.score })),
    });
    return ranking;
  }

  /** 阶梯命中采纳：写 agent_record.llm_id 绑定并填充输出（ADR-012） */
  private async llmSelect(input: MatchLLMInput, output: MatchLLMOutput, picked: ElectionCandidate<SoLLMOutput['list'][number]>, config: LLMCoreConfigRecord | null, tier: ElectionTierExpr, funnel?: ComponentFunnelTrace): Promise<boolean> {
    const selectedLLMId = picked.id;
    try {
      await this.relationDb.update(AGENT_RECORD_TABLE, [
        { field: 'llm_id', value: selectedLLMId },
        { field: 'updated', value: IdGenerator.now() },
      ], [{ field: 'id', operator: Operator.EQ, value: input.agent_id }]);
    } catch {  }
    await this.fillSingleLLM(selectedLLMId, output);
    output.detail = `election_llm_${tier.id}`;
    funnel?.markAdopted(tier.id === 't6' ? 'bm25' : 'vector');
    return true;
  }

  /** 阶梯耗尽终端：使用默认模型（规格 3.1.9） */
  private async llmDefaultTerminal(input: MatchLLMInput, output: MatchLLMOutput, availableLLMs: SoLLMOutput['list'], funnel?: ComponentFunnelTrace): Promise<boolean> {
    const fallback = availableLLMs.find((l) => l.is_default) ?? availableLLMs[0];
    if (!fallback) {
      output.error = '未找到可用的模型';
      output.error_code = 'NOT_FOUND';
      return false;
    }
    funnel?.addDirect('默认模型兜底', [{ id: String(fallback.id ?? ''), name: String(fallback.llm_title ?? fallback.id ?? ''), score: 0 }]);
    await this.llmSelect(input, output, {
      id: String(fallback.id ?? ''), label: String(fallback.llm_title ?? ''), doc: fallback,
      bm25Score: 0, vectorScore: 0, exampleSim: 0, negativeSim: 0, rejectedByNegative: false,
    }, null, { id: 'default', label: '默认模型', union: ['all'], subtractNegative: false }, funnel);
    output.detail = 'election_llm_default';
    return true;
  }

  private async embedTask(task: string, context?: LLMCoreContext): Promise<number[]> {
    const output = new EmbedLLMOutput();
    const input = Object.assign(new EmbedLLMInput(), { id: '', input: task });
    const ok = await this.llmAccess.embedLLM(input, output, context ?? new LLMContext());
    return ok ? output.embedding ?? [] : [];
  }

  private soLlmTitle(record: Record<string, unknown> | null, fallbackId: string): string {
    return String(record?.llm_title ?? fallbackId);
  }

  private async soAvailableLLMsByType(targetType: string): Promise<SoLLMOutput['list']> {
    const soOutput = new SoLLMOutput();
    await this.llmAccess.soLLM({} as SoLLMInput, soOutput, new LLMContext());
    return (soOutput.list ?? []).filter((l) => {
      const t = (l.llm_type || 'text').toLowerCase();
      return targetType === 'embedding' ? t === 'embedding' : t !== 'embedding';
    });
  }

  private async checkCachedLLM(agentId: string, targetType: string, _regenRate: number, output: MatchLLMOutput): Promise<boolean> {
    // ADR-012:agent_llm 退役,绑定唯一归 agent_record.llm_id
    const boundId = await this.soAgentBoundLlmId(agentId);
    if (!boundId) return false;
    const llmRecord = await this.getLLMById(boundId);
    if (llmRecord && llmRecord.enable) {
      const cachedType = ((llmRecord.llm_type as string) || 'text').toLowerCase();
      const match = targetType === 'embedding' ? cachedType === 'embedding' : cachedType !== 'embedding';
      if (match) {
        output.llm_id = boundId;
        output.llm = llmRecord;
        output.from_cache = true;
        return true;
      }
    }
    await this.clearAgentLlmBinding(agentId);
    return false;
  }

  private async soAgentBoundLlmId(agentId: string): Promise<string> {
    try {
      const row = await this.relationDb.selectOne(AGENT_RECORD_TABLE, [
        { field: 'id', operator: Operator.EQ, value: agentId },
      ]);
      return String((row as Record<string, unknown> | null)?.['llm_id'] ?? '');
    } catch {
      return '';
    }
  }

  private async clearAgentLlmBinding(agentId: string): Promise<void> {
    try {
      await this.relationDb.update(AGENT_RECORD_TABLE, [
        { field: 'llm_id', value: '' },
        { field: 'updated', value: IdGenerator.now() },
      ], [{ field: 'id', operator: Operator.EQ, value: agentId }]);
    } catch {  }
  }

  private async fillSingleLLM(llmId: string, output: MatchLLMOutput): Promise<boolean> {
    output.llm_id = llmId;
    output.llm = await this.getLLMById(llmId);
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

    // ADR-012: 统一经 TraceService 记录供应商使用事件（usage_event_record + org 聚合）
    const usageInput = new RecordUsageInput();
    usageInput.entity_type = 'llm_provider';
    usageInput.entity_id = input.llm_provider_id;
    usageInput.input_tokens = input.tokens_used ?? 0;
    usageInput.usage_context = `call_count=${input.call_count ?? 1}`;
    const usageOut = new RecordUsageOutput();
    await this.trace.recordUsage(usageInput, usageOut, new LLMCoreContext());
    output.id = usageOut.event_id;
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
    const rows = await this.relationDb.select(USAGE_EVENT_TABLE, {
      conditions: [
        { field: 'entity_type', operator: Operator.EQ, value: 'llm_provider' },
        { field: 'entity_id', operator: Operator.EQ, value: llmProviderId },
        { field: 'created', operator: 'GE', value: rangeStart },
        { field: 'created', operator: 'LE', value: rangeEnd },
      ],
    });

    let tokensUsed = 0;
    let callCount = 0;
    for (const row of rows) {
      tokensUsed += (row['input_tokens'] as number) || 0;
      callCount += 1;
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
      { field: 'title', operator: Operator.LIKE, value: '%LLM%匹配%' },
    ]);
    if (row && row.id) return String(row.id);
    const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (anyRow && anyRow.id) return String(anyRow.id);
    throw new ProcessingError('未找到 LLM 匹配提示词模板');
  }

}
