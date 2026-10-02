import { Metrics, Report } from '@brian-agent/base';
import { callLLMJson } from '@brian-agent/base';
import {
  funnelBm25Ranking,
  funnelSemanticRouterRanking,
  buildFunnelDocText,
  toFunnelBm25Options,
  funnelNegativeReason,
  batchGetOrComputeEmbeddings,
  batchGetDualExampleEmbeddings,
  batchGetComponentExamples,
  analyzeTaskComplexity,
  runComponentElection,
  standardTierLadder,
  loadElectionThresholdOverrides,
  applySignalScores,
  DEFAULT_ELECTION_THRESHOLDS,
  type FunnelRankingEntry,
  type ComponentElectionAdapter,
  type ElectionSignals,
  type ElectionThresholds,
  SOUL_EMBEDDING_TABLE,
  SOUL_EXAMPLE_EMBEDDING_TABLE,
} from '@brian-agent/base';
import { createComponentFunnelTrace, pushComponentFunnel, clipFunnelText, FUNNEL_MECHANISM_LABELS, type ComponentFunnelTrace } from '@brian-agent/base';
import { TraceService, RecordUsageInput, RecordUsageOutput, USAGE_EVENT_TABLE } from '@brian-agent/base';
import type { RelationDBAccess } from '@brian-agent/base';
import type { SoulAccess } from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import type { PromptsAccess } from '@brian-agent/base';
import { SoulContext, AddSoulInput, Context, AddSoulOutput, GetSoulInput, GetSoulOutput, SoSoulOutput, RecordSoulUsageInput, RecordSoulUsageOutput, PromptContext, GetPromptInput, GetPromptOutput, LLMContext, ExecLLMOutput, EmbedLLMInput, EmbedLLMOutput, Operator, OperationType, IdGenerator, JsonParser, ValidationError, NotFoundError } from '@brian-agent/base';
import type { DataObject } from '@brian-agent/base';
import {
  SoulCoreContext,
  SoulCoreConfigRecord,
  SoulOptRuleRecord,
  SoulVerdict,
  MatchSoulInput,
  MatchSoulOutput,
  OptSoulInput,
  OptSoulOutput,
  AgeSoulInput,
  AgeSoulOutput,
  SoSoulContentInput,
  SoSoulContentOutput,
  SoSoulRuleInput,
  SoSoulRuleOutput,
  UpdateSoulRuleInput,
  UpdateSoulRuleOutput,
  ConfigSoulCoreInput,
  ConfigSoulCoreOutput,
  SOUL_CORE_CONFIG_TABLE,
  SOUL_OPT_RULE_TABLE,
} from '../domain/types';
import { ProcessingError } from '../../shared/errors';
import { SingleRowConfigStore } from '../../shared/SingleRowConfigStore';
import { ensureDefaultConfig } from '../../shared/ConfigHelper';
import { VectorMatchCache, buildCacheKey } from '../../shared/VectorMatchCache';
import { MatchCache, ScoreThreshold, VectorSimilarity } from '../../shared/MatchConstants';

export class SoulCoreService {
  
  private readonly configStore: SingleRowConfigStore<SoulCoreConfigRecord>;

  
  private readonly matchCache = new VectorMatchCache();

  private readonly trace: TraceService;

  

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly soulAccess: SoulAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {
    this.trace = new TraceService(this.relationDb);
    this.configStore = new SingleRowConfigStore<SoulCoreConfigRecord>(this.relationDb, {
      table: SOUL_CORE_CONFIG_TABLE,
      toRecord: (raw) => this.toSoulCoreConfigRecord(raw),
      defaults: [],
    });
  }

  

  async initialize(): Promise<void> {
    await ensureDefaultConfig(this.relationDb, SOUL_CORE_CONFIG_TABLE, [
      { field: 'regen_rate', value: 75 },
      { field: 'prompt_template_id', value: null },
      { field: 'score_threshold', value: ScoreThreshold.Default },
      { field: 'vector_similarity_threshold', value: VectorSimilarity.Default },
      { field: 'match_cache_ttl_ms', value: MatchCache.TtlMs },
      { field: 'match_cache_capacity', value: MatchCache.Capacity },
    ]);
  }

  
  
  

  

  async matchSoul(input: MatchSoulInput, output: MatchSoulOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) {
      throw new ValidationError('matchSoul 需要提供 agent_id');
    }
    const funnel = createComponentFunnelTrace('soul', input.agent_id);
    const detail = await this.soMatchSoulRoute(input, output, context, metrics, funnel);
    pushComponentFunnel(report, funnel, detail);
    return true;
  }

  private async checkBoundSoul(input: MatchSoulInput, output: MatchSoulOutput, funnel: ComponentFunnelTrace): Promise<boolean> {
    if (!input.bound_soul_id) return false;
    const soulRecord = await this.getSoulById(input.bound_soul_id);
    output.soul_id = input.bound_soul_id;
    output.soul = soulRecord;
    output.from_cache = true;
    funnel.addDirect('绑定事实源', [{ id: input.bound_soul_id, name: String(soulRecord?.soul_brief ?? input.bound_soul_id), score: 100 }]);
    return true;
  }

  private async checkCachedSoul(output: MatchSoulOutput, cachedSoulId: string, funnel: ComponentFunnelTrace): Promise<boolean> {
    if (!cachedSoulId) return false;
    const soulRecord = await this.hydrateSoulOrClear(cachedSoulId);
    if (soulRecord) {
      output.soul_id = cachedSoulId;
      output.soul = soulRecord;
      output.from_cache = true;
      funnel.addDirect('匹配缓存命中', [{ id: cachedSoulId, name: String(soulRecord.soul_brief ?? cachedSoulId), score: 100 }]);
      return true;
    }
    this.matchCache.clear();
    return false;
  }

  private async soMatchSoulRoute(
    input: MatchSoulInput,
    output: MatchSoulOutput,
    context: SoulCoreContext,
    metrics: Metrics | undefined,
    funnel: ComponentFunnelTrace,
  ): Promise<string> {

    if (await this.checkBoundSoul(input, output, funnel)) {
      return 'bound';
    }

    const cached = input.bypass_cache
      ? { record: null, query: await this.matchCache.embedOf(input.task_content ?? '', (t) => this.embedTask(t, context)) }
      : await this.matchCache.lookup(input.task_content ?? '', (t) => this.embedTask(t, context));
    const cachedSoulId = cached.record?.result[0]?.id ?? '';
    if (await this.checkCachedSoul(output, cachedSoulId, funnel)) {
      return 'cache_hit';
    }

    const soOutput = new SoSoulOutput();
    await this.soulAccess.soSoul(
      { conditions: [{ field: 'enable', operator: Operator.EQ, value: 1 }] },
      soOutput, new SoulContext(),
    );
    const availableSouls = soOutput.list;

    if (input.bypass_cache) {
      await this.soulExhaustTerminal(input, output, availableSouls, cached.query ?? [], context, funnel);
      return output.detail || 'soul_exhausted';
    }
    const adapter = this.soulElectionAdapter(input, output, availableSouls, cached.query ?? [], context, funnel);
    await runComponentElection(adapter, input, output);
    return output.detail || 'election_soul_done';
  }

  /** Soul 选举适配器（单选择优；终端=大模型动态生成全新 Soul） */
  private soulElectionAdapter(
    input: MatchSoulInput, output: MatchSoulOutput,
    availableSouls: Array<{ id: string; soul_brief: string; soul_usage?: string }>,
    queryEmbedding: number[], context: Context, funnel?: ComponentFunnelTrace,
  ): ComponentElectionAdapter<{ id: string; soul_brief: string; soul_usage?: string }> {
    return {
      component: 'soul',
      multiSelect: false,
      directAdoptSingle: false,
      funnel,
      findReusable: async () => null,
      extractSignals: () => this.soulExtractSignals(input, availableSouls, queryEmbedding, context, funnel),
      tiers: () => standardTierLadder(),
      select: async (_i, _o, picked, tier) => {
        await this.adoptFunnelSoul(output, input.task_content ?? '', queryEmbedding, picked[0].id, context, `election_soul_${tier.id}`, Math.round(picked[0].vectorScore));
        return true;
      },
      exhaust: async () => this.soulExhaustTerminal(input, output, availableSouls, queryEmbedding, context, funnel),
    };
  }

  /** 信号提取（并行）：合法集 + BM25/向量双通道；结构信号弃权（Soul 无复杂度适配元数据） */
  private async soulExtractSignals(
    input: MatchSoulInput,
    availableSouls: Array<{ id: string; soul_brief: string; soul_usage?: string }>,
    queryEmbedding: number[], context: Context, funnel?: ComponentFunnelTrace,
  ): Promise<ElectionSignals<{ id: string; soul_brief: string; soul_usage?: string }>> {
    const overrides = await loadElectionThresholdOverrides(this.relationDb, 'soul');
    const thresholds: ElectionThresholds = { ...DEFAULT_ELECTION_THRESHOLDS, ...overrides };
    const docs = availableSouls.map((s) => ({
      id: String(s.id ?? ''), name: '',
      brief: [s.soul_brief, s.soul_usage].filter(Boolean).join(' '),
    }));
    const docOf = new Map(docs.map((d) => [d.id, availableSouls.find((s) => String(s.id ?? '') === d.id)]));
    const embedding = queryEmbedding.length > 0 ? queryEmbedding : await this.embedTask(input.task_content ?? '', context).catch(() => []);
    const [bm25Ranking, vectorRanking] = await Promise.all([
      this.soulBm25Signal(input.task_content ?? '', docs, funnel),
      this.soulVectorSignal(embedding, docs, context, funnel),
    ]);
    const candidates = docs.map((d) => ({
      id: d.id, label: d.brief.slice(0, 40) || d.id,
      doc: docOf.get(d.id) as { id: string; soul_brief: string; soul_usage?: string },
      bm25Score: 0, vectorScore: 0, exampleSim: 0, negativeSim: 0, rejectedByNegative: false,
    }));
    applySignalScores(candidates, bm25Ranking, vectorRanking);
    return { candidates, complexity: analyzeTaskComplexity({ text: input.task_content ?? '' }), structureIds: new Set<string>(), thresholds };
  }

  /** BM25 信号（并行支路）：正/负范例双向增强后全量排序，登记漏斗明细 */
  private async soulBm25Signal(taskContent: string, docs: Array<{ id: string; name: string; brief: string }>, funnel?: ComponentFunnelTrace): Promise<FunnelRankingEntry<{ id: string; name: string; brief: string }>[]> {
    const examples = await batchGetComponentExamples({
      relationDb: this.relationDb, table: SOUL_EXAMPLE_EMBEDDING_TABLE,
      targetIdField: 'soul_id', targetIds: docs.map((d) => d.id),
    });
    const ranking = funnelBm25Ranking(taskContent, docs, toFunnelBm25Options(examples));
    funnel?.addMechanism({
      mechanism: 'bm25', label: FUNNEL_MECHANISM_LABELS.bm25, adopted: ranking.some((e) => e.score >= 90 && !e.rejected),
      candidates: ranking.map((e) => ({ id: e.doc.id, name: e.doc.brief.slice(0, 40) || e.doc.id, score: e.score, reason: funnelNegativeReason(e) })),
    });
    return ranking;
  }

  /** 向量信号（并行支路）：语义路由器（描述向量+正/负范例向量）全量排序，登记漏斗明细 */
  private async soulVectorSignal(queryEmbedding: number[], docs: Array<{ id: string; name: string; brief: string }>, context: Context, funnel?: ComponentFunnelTrace): Promise<FunnelRankingEntry<{ id: string; name: string; brief: string }>[]> {
    if (!queryEmbedding || queryEmbedding.length === 0) return [];
    const items = docs.map((d) => ({ id: d.id, text: buildFunnelDocText(d.name, d.brief) }));
    const [precomputed, dualExamples] = await Promise.all([
      batchGetOrComputeEmbeddings({
        relationDb: this.relationDb, table: SOUL_EMBEDDING_TABLE, targetIdField: 'soul_id',
        items, embedFn: (t, ctx) => this.embedTask(t, ctx), context,
      }),
      batchGetDualExampleEmbeddings({
        relationDb: this.relationDb, table: SOUL_EXAMPLE_EMBEDDING_TABLE, targetIdField: 'soul_id',
        targetIds: docs.map((d) => d.id),
      }),
    ]);
    const ranking = await funnelSemanticRouterRanking(
      queryEmbedding, docs, (d) => this.embedTask(buildFunnelDocText(d.name, d.brief), context),
      precomputed, dualExamples.positiveMap, dualExamples.negativeMap,
    );
    funnel?.addMechanism({
      mechanism: 'vector', label: FUNNEL_MECHANISM_LABELS.vector, adopted: ranking.some((e) => !e.rejected && e.score >= 80),
      candidates: ranking.map((e) => ({ id: e.doc.id, name: e.doc.brief.slice(0, 40) || e.doc.id, score: e.score, reason: funnelNegativeReason(e) })),
    });
    return ranking;
  }

  /** 阶梯耗尽终端：知识库无合适人格，跳过 LLM 排序打分，直接大模型动态生成全新 Soul（规格 3.4.3） */
  private async soulExhaustTerminal(
    input: MatchSoulInput, output: MatchSoulOutput,
    _availableSouls: Array<{ id: string; soul_brief: string; soul_usage?: string }>,
    cachedQuery: number[], context: Context, funnel?: ComponentFunnelTrace,
  ): Promise<boolean> {
    const { agent_id, context_id, run_id, task_content, task_domain } = input;
    const selectedSoulId = await this.generateAndAddSoul(agent_id, context_id, run_id, task_content, task_domain, context, funnel);
    const soulRecord = await this.getSoulById(selectedSoulId);
    if (selectedSoulId) {
      await this.commitMatchCache(task_content ?? '', cachedQuery, selectedSoulId, context);
    }
    output.soul_id = selectedSoulId;
    output.soul = soulRecord;
    output.from_cache = false;
    output.detail = selectedSoulId ? 'generated' : 'empty';
    return true;
  }

  
  
  

  

  async optSoul(input: OptSoulInput, output: OptSoulOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const { agent_id, soul_id } = input;
    if (!agent_id) {
      throw new ValidationError('optSoul 需要提供 agent_id');
    }
    if (!soul_id) {
      throw new ValidationError('optSoul 需要提供 soul_id');
    }

    let effectiveSoulId = soul_id;
    if (input.current_soul_id && input.current_soul_id !== soul_id) {
      const currentSoul = await this.getSoulById(input.current_soul_id);
      const candidateSoul = await this.getSoulById(soul_id);
      if (!currentSoul) {
        throw new NotFoundError('Soul', input.current_soul_id);
      }
      if (!candidateSoul) {
        throw new NotFoundError('Soul', soul_id);
      }
      const verdict = await this.compareSoulsByLLM(currentSoul, candidateSoul);
      effectiveSoulId = verdict.better ? soul_id : input.current_soul_id;
      output.verdict = verdict;
    }

    
    await this.soulAccess.recordSoulUsage(
      { soul_id } as RecordSoulUsageInput,
      new RecordSoulUsageOutput(), new SoulContext(),
    );
    await this.recordSoulCoreUsage(agent_id, effectiveSoulId);

    output.current_soul_id = effectiveSoulId;
    return true;
  }

  
  
  

  

  async ageSoul(_input: AgeSoulInput, output: AgeSoulOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.stale_souls = await this.soStaleSoulUsages();
    output.aged_count = output.stale_souls.length;
    return true;
  }

  
  private async soStaleSoulUsages(): Promise<Array<{ agent_id: string; soul_id: string; usage_count: number }>> {
    const rules = await this.relationDb.select(SOUL_OPT_RULE_TABLE, {});
    if (rules.length === 0) {
      return [];
    }
    const stale: Array<{ agent_id: string; soul_id: string; usage_count: number }> = [];
    for (const rule of rules) {
      const since = IdGenerator.now() - Number(rule.days) * 24 * 60 * 60 * 1000;
      const minUsage = Number(rule.min_usage_count);
      // ADR-012: stale 检测改查 usage_event_record 事件流水，原 SUM(usage_count) 语义等价于 COUNT(*)
      const rows = this.relationDb.queryRaw<{ agent_id: string; soul_id: string; total: number }>(
        `SELECT "agent_id", "entity_id" AS "soul_id", COUNT(*) AS "total" FROM "${USAGE_EVENT_TABLE}"
         WHERE "entity_type" = 'soul' AND "created" >= ? GROUP BY "agent_id", "entity_id" HAVING COUNT(*) < ?`,
        [since, minUsage],
      );
      for (const row of rows ?? []) {
        stale.push({ agent_id: String(row.agent_id), soul_id: String(row.soul_id), usage_count: Number(row.total ?? 0) });
      }
    }
    return stale;
  }

  
  
  

  

  async soSoulRule(input: SoSoulRuleInput, output: SoSoulRuleOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report,
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

  
  
  

  

  async updateSoulRule(input: UpdateSoulRuleInput, _output: UpdateSoulRuleOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report,
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

  
  
  

  

  async soSoulContent(input: SoSoulContentInput, output: SoSoulContentOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.soul_id) {
      throw new ValidationError('soSoulContent 需要提供 soul_id');
    }
    const soul = await this.getSoulById(input.soul_id);
    output.content = String(soul?.soul_content ?? '');
    return true;
  }

  
  

  

  
  async configSoulCore(input: ConfigSoulCoreInput, output: ConfigSoulCoreOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.regen_rate !== undefined || input.similarity_threshold !== undefined || input.prompt_template_id !== undefined || input.llm_id !== undefined || input.score_threshold !== undefined || input.vector_similarity_threshold !== undefined) {
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
      if (input.llm_id !== undefined) {
        updateData.push({ field: 'llm_id', value: input.llm_id || null });
      }
      
      if (input.score_threshold !== undefined) {
        if (input.score_threshold < 0 || input.score_threshold > 100) {
          throw new ValidationError('score_threshold 必须在 0-100 之间');
        }
        updateData.push({ field: 'score_threshold', value: input.score_threshold });
      }
      if (input.vector_similarity_threshold !== undefined) {
        if (input.vector_similarity_threshold < 0 || input.vector_similarity_threshold > 1) {
          throw new ValidationError('vector_similarity_threshold 必须在 0.0-1.0 之间');
        }
        updateData.push({ field: 'vector_similarity_threshold', value: input.vector_similarity_threshold });
      }
      if (input.match_cache_ttl_ms !== undefined) {
        if (input.match_cache_ttl_ms < 0) {
          throw new ValidationError('match_cache_ttl_ms 不能为负');
        }
        updateData.push({ field: 'match_cache_ttl_ms', value: input.match_cache_ttl_ms });
      }
      if (input.match_cache_capacity !== undefined) {
        if (input.match_cache_capacity <= 0) {
          throw new ValidationError('match_cache_capacity 必须为正整数');
        }
        updateData.push({ field: 'match_cache_capacity', value: input.match_cache_capacity });
      }
      await this.configStore.upsert(updateData);
    }

    
    await this.applyMatchCacheConfig();
    output.config = await this.getCoreConfig();
    return true;
  }

  
  
  

  
  private async getCoreConfig(): Promise<SoulCoreConfigRecord | null> {
    return this.configStore.load();
  }

  
  private async applyMatchCacheConfig(): Promise<void> {
    const serviceConfig = await this.getCoreConfig();
    this.matchCache.configure({
      capacity: serviceConfig?.match_cache_capacity ?? MatchCache.Capacity,
      similarityThreshold: serviceConfig?.vector_similarity_threshold ?? VectorSimilarity.Default,
      ttlMs: serviceConfig?.match_cache_ttl_ms ?? MatchCache.TtlMs,
    });
    this.matchCache.clear();
  }

  
  
  

  
  
  

  
  private async getSoulById(soulId: string): Promise<Record<string, unknown> | null> {
    const getOutput = new GetSoulOutput();
    await this.soulAccess.soSoulById(
      { id: soulId } as GetSoulInput,
      getOutput, new SoulContext(),
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

  
  
  

  

  private async adoptFunnelSoul(
    output: MatchSoulOutput,
    taskContent: string,
    queryEmbedding: number[],
    soulId: string,
    context: Context,
    detail: string,
    score: number,
    metrics?: Metrics,
  ): Promise<void> {
    const soulRecord = await this.hydrateSoulOrClear(soulId);
    if (!soulRecord) return;
    await this.commitMatchCache(taskContent, queryEmbedding, soulId, context);
    output.soul_id = soulId;
    output.soul = soulRecord;
    output.from_cache = false;
    output.detail = detail;
    metrics?.info('Soul 漏斗命中（免 LLM）', { soul_id: soulId, detail, score });
  }

  private async generateAndAddSoul(
    agentId: string,
    contextId: string,
    runId: string,
    taskContent?: string,
    taskDomain?: string,
    matchCtx?: Context,
    funnel?: ComponentFunnelTrace,
  ): Promise<string> {
    const config = await this.getCoreConfig();
    const llmId = config?.llm_id || '';

    const generationPrompt = [
      '你是一个 Persona 生成器。请为该 AI Agent 生成一个合适的 Soul（角色设定）。',
      '',
      `Agent ID: ${agentId}`,
      `Context ID: ${contextId}`,
      `Interaction ID: ${runId}`,
      `任务领域: ${taskDomain || '未指定'}`,
      `当前任务内容: ${taskContent || '未指定'}`,
      '',
      '请依据任务领域与内容，生成与该任务高度契合的角色设定（例如旅游规划任务应生成旅游顾问角色，而非通用编码助手）。',
      '请以 JSON 格式返回，包含以下字段：',
      '  - soul_brief: Soul 检索摘要（30~80 字，用于组件匹配召回）：格式为「角色定位｜核心能力｜优势方向｜适用场景」。必须具体、与角色贴切、包含该角色最擅长处理的任务类型关键词；禁止只写角色名或泛化称呼（如"编码助手"不合格，"专精 Vue3 与 Node.js 全栈的一线架构师，擅长排查构建卡点与性能瓶颈，适用于前端工程化任务"合格）',
      '  - soul_title: Soul 名称/标题（一行）',
      '  - soul_content: 完整的 Soul 角色设定内容',
      '  - soul_usage: Soul 适用场景描述',
      '',
      '仅输出 JSON，不要包含其他内容。',
    ].join('\n');

    
    
    const parsed = await callLLMJson<Record<string, unknown>>(this.llmAccess, {
      llmId,
      prompt: generationPrompt,
      retries: 2,
      extra: {
        max_tokens: 800,
        session_id: matchCtx?.session_id || '',
        run_id: matchCtx?.run_id || runId || '',
        caller: 'SoulCoreService.generateAndAddSoul',
      },
      
      parse: (text) => JsonParser.parseObject(text),
    }).then((res) => {
      if (res === null) {
        throw new ProcessingError('Soul 生成失败: LLM 输出 JSON 解析失败');
      }
      return res;
    })
    .catch((err: unknown) => {
      if (err instanceof ProcessingError) throw err;
      throw new ProcessingError(`Soul 生成失败: ${err instanceof Error ? err.message : String(err)}`);
    });

    const addOutput = new AddSoulOutput();
    await this.soulAccess.addSoul(
      {
        data: {
          soul_brief: this.asTrimmedString(parsed.soul_brief) || this.asTrimmedString(parsed.soul_title) || '自动生成的 Soul',
          soul_content: this.asTrimmedString(parsed.soul_content) || '乐于助人的 AI 助手。',
          soul_usage: this.asTrimmedString(parsed.soul_usage) || '通用对话、信息查询、任务辅助',
        },
      } as AddSoulInput,
      addOutput, new SoulContext(),
    );

    funnel?.addMechanism({
      mechanism: 'llm',
      label: '大模型生成 (无匹配命中)',
      adopted: true,
      prompt: clipFunnelText(generationPrompt),
      output: clipFunnelText(JSON.stringify(parsed, null, 2)),
      candidates: [{ id: addOutput.id, name: this.asTrimmedString(parsed.soul_brief) || addOutput.id, score: 100 }],
    });
    return addOutput.id;
  }

  
  private asTrimmedString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  
  
  

  

  private async commitMatchCache(taskContent: string, embedding: number[] | null, soulId: string, matchCtx?: Context): Promise<void> {
    if (!soulId) {
      return;
    }
    const query = embedding?.length ? embedding : await this.matchCache.embedOf(taskContent, (t) => this.embedTask(t, matchCtx).catch(() => [] as number[]));
    this.matchCache.commit(
      buildCacheKey(taskContent),
      query ?? [],
      [{ id: soulId, score: ScoreThreshold.Max }],
    );
  }

  
  private async embedTask(task: string, context?: Context): Promise<number[]> {
    const output = new EmbedLLMOutput();
    const input = Object.assign(new EmbedLLMInput(), { id: '', input: task });
    const ok = await this.llmAccess.embedLLM(input, output, context ?? new LLMContext());
    if (!ok || !output.embedding?.length) {
      throw new ProcessingError('任务向量化失败（embedLLM 无返回）');
    }
    return output.embedding;
  }

  
  private async hydrateSoulOrClear(soulId: string): Promise<Record<string, unknown> | null> {
    return this.getSoulById(soulId);
  }

  
  
  

  

  private async compareSoulsByLLM(
    currentSoul: Record<string, unknown>,
    candidateSoul: Record<string, unknown>,
  ): Promise<SoulVerdict> {
    const config = await this.getCoreConfig();
    const llmId = config?.llm_id || '';

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
      { id: llmId, prompt, temperature: 0.1, max_tokens: 256, caller: 'SoulCoreService.compareSouls' },
      llmOutput, new LLMContext(),
    );
    if (!ok) {
      throw new ProcessingError(
        `Soul 比较 LLM 调用失败: ${llmOutput.error ?? '未知错误'}`,
      );
    }

    const parsed = JsonParser.parseObject(llmOutput.result);
    if (!parsed) {
      throw new ProcessingError('LLM Soul 比较结果 JSON 解析失败');
    }
    return {
      better: parsed.better === true,
      reason: this.asTrimmedString(parsed.reason),
    };
  }

  
  
  

  
  /** ADR-012: 统一经 TraceService 记录 Soul 使用事件（事件流水 + soul_usage_org 日聚合） */
  private async recordSoulCoreUsage(agentId: string, soulId: string): Promise<void> {
    const usageInput = new RecordUsageInput();
    usageInput.entity_type = 'soul';
    usageInput.entity_id = soulId;
    usageInput.agent_id = agentId;
    await this.trace.recordUsage(usageInput, new RecordUsageOutput(), new SoulCoreContext());
  }

  
  
  

  private toSoulCoreConfigRecord(raw: Record<string, unknown>): SoulCoreConfigRecord {
    return {
      id: raw['id'] as string,
      created: raw['created'] as number,
      updated: raw['updated'] as number,
      regen_rate: (raw['regen_rate'] as number) ?? 75,
      similarity_threshold: Number(raw['similarity_threshold'] ?? 0.7),
      prompt_template_id: (raw['prompt_template_id'] as string) || null,
      llm_id: (raw['llm_id'] as string) || null,
      score_threshold: Number(raw['score_threshold'] ?? ScoreThreshold.Default),
      vector_similarity_threshold: Number(raw['vector_similarity_threshold'] ?? VectorSimilarity.Default),
      match_cache_ttl_ms: Number(raw['match_cache_ttl_ms'] ?? MatchCache.TtlMs),
      match_cache_capacity: Number(raw['match_cache_capacity'] ?? MatchCache.Capacity),
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
