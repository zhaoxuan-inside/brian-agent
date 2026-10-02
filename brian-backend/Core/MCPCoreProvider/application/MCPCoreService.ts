import { Metrics, Report, Context, TraceService, RecordUsageInput, RecordUsageOutput } from '@brian-agent/base';
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
  isContinuationRequest,
  DEFAULT_ELECTION_THRESHOLDS,
  type FunnelRankingEntry,
  type ComponentElectionAdapter,
  type ElectionCandidate,
  type ElectionReuseHit,
  type ElectionSignals,
  type ElectionThresholds,
  type ElectionTierExpr,
  MCP_EMBEDDING_TABLE,
  MCP_EXAMPLE_EMBEDDING_TABLE,
} from '@brian-agent/base';
import { createComponentFunnelTrace, pushComponentFunnel, FUNNEL_MECHANISM_LABELS, type ComponentFunnelTrace } from '@brian-agent/base';
import { VectorMatchCache, buildCacheKey } from '../../shared/VectorMatchCache';
import { MatchCache, ScoreThreshold, VectorSimilarity } from '../../shared/MatchConstants';
import { SingleRowConfigStore } from '../../shared/SingleRowConfigStore';
import { ProcessingError } from '../../shared/errors';
import { shouldReuseByRegenRate } from '../../shared/SimilarityHelper';
import type { RelationDBAccess, MCPAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  Operator,
  ValidationError,
  McpContext,
  SoMcpInput,
  SoMcpOutput,
  LLMContext,
  EmbedLLMInput,
  EmbedLLMOutput,
  PromptContext,
  GetPromptInput,
  GetPromptOutput,
  McpInstallRecord,
} from '@brian-agent/base';
import {
  McpCoreContext,
  McpCoreConfigRecord,
  MatchMcpInput,
  MatchMcpOutput,
  OptMcpInput,
  OptMcpOutput,
  ConfigMcpCoreInput,
  ConfigMcpCoreOutput,
  MCP_CORE_CONFIG_TABLE,
  DEFAULT_REGENERATE_RATE,
} from '../domain/types';

export class MCPCoreService {

  private readonly configStore: SingleRowConfigStore<McpCoreConfigRecord>;

  private readonly trace: TraceService;

  private readonly matchCache = new VectorMatchCache();

  private cacheConfigured = false;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly mcpAccess: MCPAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {
    this.trace = new TraceService(relationDb);
    this.configStore = new SingleRowConfigStore<McpCoreConfigRecord>(this.relationDb, {
      table: MCP_CORE_CONFIG_TABLE,
      toRecord: (raw) => ({
        id: String(raw.id),
        created: Number(raw.created),
        updated: Number(raw.updated),
        regen_rate: Number(raw.regen_rate),
        similarity_threshold: Number(raw.similarity_threshold ?? 0.7),
        prompt_template_id: String(raw.prompt_template_id ?? ''),
        score_threshold: Number(raw.score_threshold ?? ScoreThreshold.Default),
        vector_similarity_threshold: Number(raw.vector_similarity_threshold ?? VectorSimilarity.Default),
        match_cache_ttl_ms: Number(raw.match_cache_ttl_ms ?? MatchCache.TtlMs),
        match_cache_capacity: Number(raw.match_cache_capacity ?? MatchCache.Capacity),
        market_install_enabled: MCPCoreService.toConfigBoolean(raw.market_install_enabled, true),
      }),
      defaults: [
        { field: 'prompt_template_id', value: '' },
        { field: 'score_threshold', value: ScoreThreshold.Default },
        { field: 'vector_similarity_threshold', value: VectorSimilarity.Default },
        { field: 'match_cache_ttl_ms', value: MatchCache.TtlMs },
        { field: 'match_cache_capacity', value: MatchCache.Capacity },
        { field: 'market_install_enabled', value: 1 },
      ],
    });
  }

  async matchMCP(input: MatchMcpInput, output: MatchMcpOutput, context: McpCoreContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    await this.ensureCacheConfigured();
    const funnel = createComponentFunnelTrace('mcp', input.agent_id ?? '');
    const detail = await this.soMatchMcpRoute(input, output, context, metrics, funnel);
    pushComponentFunnel(report, funnel, detail);
    return true;
  }

  private async soMatchMcpRoute(
    input: MatchMcpInput, output: MatchMcpOutput, context: McpCoreContext,
    metrics?: Metrics, funnel?: ComponentFunnelTrace,
  ): Promise<string> {
    const availableMcps = await this.getAvailableMcps();
    const adapter = this.mcpElectionAdapter(input, output, availableMcps, context, metrics, funnel);
    await runComponentElection(adapter, input, output);
    return output.detail || 'election_mcp_done';
  }

  /** MCP 选举适配器（multiSelect：阶梯命中整集采纳；终端=空集+负缓存，零 LLM 调用） */
  private mcpElectionAdapter(
    input: MatchMcpInput, output: MatchMcpOutput, availableMcps: McpInstallRecord[],
    context: McpCoreContext, metrics?: Metrics, funnel?: ComponentFunnelTrace,
  ): ComponentElectionAdapter<McpInstallRecord> {
    return {
      component: 'mcp',
      multiSelect: true,
      directAdoptSingle: false,
      funnel,
      findReusable: () => this.mcpFindReusable(input, availableMcps, context),
      extractSignals: () => this.mcpExtractSignals(input, availableMcps, context, funnel, metrics),
      tiers: () => standardTierLadder(),
      select: (_i, _o, picked, tier) => this.mcpSelect(input, output, picked, availableMcps, context, tier, metrics, funnel),
      exhaust: () => this.mcpExhaust(input, output, context),
    };
  }

  /** 复用判定：续写请求/绑定事实源直命中；匹配缓存按 regen_rate 复用；负缓存直接耗尽 */
  private async mcpFindReusable(input: MatchMcpInput, availableMcps: McpInstallRecord[], context: McpCoreContext): Promise<ElectionReuseHit<McpInstallRecord> | null> {
    const boundIds = (input.bound_mcp_ids ?? []).filter((id) => availableMcps.some((m) => String(m.id ?? '') === id));
    if (boundIds.length > 0) {
      const label = isContinuationRequest(input.task_content ?? '') ? '续写复用（绑定事实源）' : '绑定事实源';
      return { label, items: boundIds.map((id) => this.toMcpCandidate(id, availableMcps)) };
    }
    if (input.bypass_cache) return null;
    const config = await this.getConfig();
    const cached = await this.matchCache.lookup(input.task_content ?? '', (t) => this.embedTask(t, context));
    if (!cached.record) return null;
    const ids = cached.record.result.map((r) => r.id);
    if (ids.length === 0) return { label: '负缓存命中', items: [] };
    if (!shouldReuseByRegenRate(config.regen_rate)) return null;
    return { label: '匹配缓存命中', items: ids.map((id) => this.toMcpCandidate(id, availableMcps)) };
  }

  private toMcpCandidate(id: string, availableMcps: McpInstallRecord[]): ElectionCandidate<McpInstallRecord> {
    const mcp = availableMcps.find((m) => String(m.id ?? '') === id);
    return {
      id, label: String(mcp?.mcp_title ?? id), doc: (mcp ?? { id } as McpInstallRecord),
      bm25Score: 100, vectorScore: 100, exampleSim: 0, negativeSim: 0, rejectedByNegative: false,
    };
  }

  /** BM25 信号（并行支路）：正/负范例双向增强后全量排序，登记漏斗明细 */
  private async mcpBm25Signal(taskContent: string, docs: Array<{ id: string; name: string; brief: string }>, funnel?: ComponentFunnelTrace): Promise<FunnelRankingEntry<{ id: string; name: string; brief: string }>[]> {
    const examples = await batchGetComponentExamples({
      relationDb: this.relationDb, table: MCP_EXAMPLE_EMBEDDING_TABLE,
      targetIdField: 'mcp_id', targetIds: docs.map((d) => d.id),
    });
    const ranking = funnelBm25Ranking(taskContent, docs, toFunnelBm25Options(examples));
    funnel?.addMechanism({
      mechanism: 'bm25', label: FUNNEL_MECHANISM_LABELS.bm25, adopted: ranking.some((e) => e.score >= 90 && !e.rejected),
      candidates: ranking.map((e) => ({ id: e.doc.id, name: e.doc.name || e.doc.brief.slice(0, 40), score: e.score, reason: funnelNegativeReason(e) })),
    });
    return ranking;
  }

  /** 向量信号（并行支路）：语义路由器（描述向量+正/负范例向量）全量排序，登记漏斗明细 */
  private async mcpVectorSignal(queryEmbedding: number[], docs: Array<{ id: string; name: string; brief: string }>, context: McpCoreContext, funnel?: ComponentFunnelTrace): Promise<FunnelRankingEntry<{ id: string; name: string; brief: string }>[]> {
    if (!queryEmbedding || queryEmbedding.length === 0) return [];
    const items = docs.map((d) => ({ id: d.id, text: buildFunnelDocText(d.name, d.brief) }));
    const [precomputed, dualExamples] = await Promise.all([
      batchGetOrComputeEmbeddings({
        relationDb: this.relationDb, table: MCP_EMBEDDING_TABLE, targetIdField: 'mcp_id',
        items, embedFn: (t, ctx) => this.embedTask(t, ctx), context,
      }),
      batchGetDualExampleEmbeddings({
        relationDb: this.relationDb, table: MCP_EXAMPLE_EMBEDDING_TABLE, targetIdField: 'mcp_id',
        targetIds: docs.map((d) => d.id),
      }),
    ]);
    const ranking = await funnelSemanticRouterRanking(
      queryEmbedding, docs, (d) => this.embedTask(buildFunnelDocText(d.name, d.brief), context),
      precomputed, dualExamples.positiveMap, dualExamples.negativeMap,
    );
    funnel?.addMechanism({
      mechanism: 'vector', label: FUNNEL_MECHANISM_LABELS.vector, adopted: ranking.some((e) => !e.rejected && e.score >= 80),
      candidates: ranking.map((e) => ({ id: e.doc.id, name: e.doc.name || e.doc.brief.slice(0, 40), score: e.score, reason: funnelNegativeReason(e) })),
    });
    return ranking;
  }

  /** 信号提取（并行）：合法集 + BM25/向量双通道；结构信号弃权（MCP 无复杂度适配元数据） */
  private async mcpExtractSignals(input: MatchMcpInput, availableMcps: McpInstallRecord[], context: McpCoreContext, funnel?: ComponentFunnelTrace, metrics?: Metrics): Promise<ElectionSignals<McpInstallRecord>> {
    const config = await this.getConfig();
    const overrides = await loadElectionThresholdOverrides(this.relationDb, 'mcp');
    const thresholds: ElectionThresholds = {
      ...DEFAULT_ELECTION_THRESHOLDS,
      bm25: config.score_threshold ?? DEFAULT_ELECTION_THRESHOLDS.bm25,
      vectorOverall: Math.round((config.vector_similarity_threshold ?? DEFAULT_ELECTION_THRESHOLDS.vectorOverall / 100) * 100),
      ...overrides,
    };
    const docs = availableMcps.map((m) => ({ id: String(m.id ?? ''), name: String(m.mcp_title ?? ''), brief: String(m.mcp_brief ?? '') }));
    const queryEmbedding = await this.matchCache.embedOf(input.task_content ?? '', (t) => this.embedTask(t, context));
    const docOf = new Map(availableMcps.map((m) => [String(m.id ?? ''), m]));
    const [bm25Ranking, vectorRanking] = await Promise.all([
      this.mcpBm25Signal(input.task_content ?? '', docs, funnel),
      this.mcpVectorSignal(queryEmbedding, docs, context, funnel),
    ]);
    const candidates: ElectionCandidate<McpInstallRecord>[] = docs.map((d) => ({
      id: d.id, label: d.name || d.id, doc: docOf.get(d.id) as McpInstallRecord,
      bm25Score: 0, vectorScore: 0, exampleSim: 0, negativeSim: 0, rejectedByNegative: false,
    }));
    applySignalScores(candidates, bm25Ranking, vectorRanking);
    metrics?.info('MCP 选举信号提取完成', { candidateCount: candidates.length, vectorPass: candidates.filter((c) => c.vectorScore >= thresholds.vectorOverall).length });
    return { candidates, complexity: analyzeTaskComplexity({ text: input.task_content ?? '' }), structureIds: new Set<string>(), thresholds };
  }

  /** 阶梯命中采纳：整集写回输出并提交匹配缓存 */
  private async mcpSelect(input: MatchMcpInput, output: MatchMcpOutput, picked: ElectionCandidate<McpInstallRecord>[], availableMcps: McpInstallRecord[], context: McpCoreContext, tier: ElectionTierExpr, metrics?: Metrics, funnel?: ComponentFunnelTrace): Promise<boolean> {
    const ids = picked.map((p) => p.id);
    output.mcp_ids = ids;
    output.mcp_details = this.toMcpDetails(ids, availableMcps);
    output.detail = `election_mcp_${tier.id}`;
    funnel?.markAdopted('vector');
    metrics?.info('MCP 选举命中', { tier: tier.label, matchedIds: ids });
    await this.commitMatchCache(input.task_content ?? '', null, ids, context);
    return true;
  }

  /** 阶梯耗尽终端：空集 + 负缓存（MCP 来源是市场安装，不在选举中自动安装，零 LLM 调用） */
  private async mcpExhaust(input: MatchMcpInput, output: MatchMcpOutput, context: McpCoreContext): Promise<boolean> {
    await this.handleEmptyMcpResult(input.task_content ?? '', output, 'mcp_exhausted', context);
    return true;
  }

  private async handleEmptyMcpResult(taskContent: string, output: MatchMcpOutput, detail: string, context: McpCoreContext): Promise<string> {
    output.mcp_ids = [];
    output.mcp_details = [];
    output.detail = detail;
    await this.commitMatchCache(taskContent, [], [], context);
    return detail;
  }

  private async ensureCacheConfigured(): Promise<void> {
    if (!this.cacheConfigured) {
      await this.applyMatchCacheConfig();
      this.cacheConfigured = true;
    }
  }


  async optMCP(input: OptMcpInput, output: OptMcpOutput, _context: McpCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) {
      throw new ValidationError('agent_id 为必填');
    }
    if (!input.mcp_id) {
      throw new ValidationError('mcp_id 为必填');
    }
    await this.recordMcpUsage(input.agent_id, input.mcp_id);
    output.id = '';
    return true;
  }

  /** ADR-012: 统一经 TraceService 记录 MCP 使用事件（事件流水 + mcp_usage_org 日聚合） */
  private async recordMcpUsage(agentId: string, mcpId: string): Promise<void> {
    const usageInput = new RecordUsageInput();
    usageInput.entity_type = 'mcp';
    usageInput.entity_id = mcpId;
    usageInput.agent_id = agentId;
    await this.trace.recordUsage(usageInput, new RecordUsageOutput(), new McpCoreContext());
  }

  async configMCPCore(input: ConfigMcpCoreInput, output: ConfigMcpCoreOutput, _context: McpCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.score_threshold !== undefined && (input.score_threshold < 0 || input.score_threshold > 100)) {
      throw new ValidationError('score_threshold 必须在 0-100 之间');
    }
    if (input.vector_similarity_threshold !== undefined && (input.vector_similarity_threshold < 0 || input.vector_similarity_threshold > 1)) {
      throw new ValidationError('vector_similarity_threshold 必须在 0.0-1.0 之间');
    }
    if (input.match_cache_capacity !== undefined && input.match_cache_capacity <= 0) {
      throw new ValidationError('match_cache_capacity 必须大于 0');
    }
    if (input.regen_rate !== undefined || input.similarity_threshold !== undefined || input.prompt_template_id !== undefined || input.score_threshold !== undefined || input.vector_similarity_threshold !== undefined || input.market_install_enabled !== undefined) {
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
        updateData.push({ field: 'prompt_template_id', value: input.prompt_template_id || '' });
      }
      if (input.score_threshold !== undefined) {
        updateData.push({ field: 'score_threshold', value: input.score_threshold });
      }
      if (input.vector_similarity_threshold !== undefined) {
        updateData.push({ field: 'vector_similarity_threshold', value: input.vector_similarity_threshold });
      }
      if (input.match_cache_ttl_ms !== undefined) {
        updateData.push({ field: 'match_cache_ttl_ms', value: input.match_cache_ttl_ms });
      }
      if (input.match_cache_capacity !== undefined) {
        updateData.push({ field: 'match_cache_capacity', value: input.match_cache_capacity });
      }

      if (input.market_install_enabled !== undefined) {
        updateData.push({ field: 'market_install_enabled', value: input.market_install_enabled ? 1 : 0 });
      }
      await this.configStore.upsert(updateData);
    }

    output.config = await this.getConfig();
    return true;
  }

  private async applyMatchCacheConfig(): Promise<void> {
    const serviceConfig = await this.getConfig();
    this.matchCache.configure({
      capacity: serviceConfig?.match_cache_capacity ?? MatchCache.Capacity,
      similarityThreshold: serviceConfig?.vector_similarity_threshold ?? VectorSimilarity.Default,
      ttlMs: serviceConfig?.match_cache_ttl_ms ?? MatchCache.TtlMs,
    });
    this.matchCache.clear();
  }

  private async getConfig(): Promise<McpCoreConfigRecord> {
    return (await this.configStore.load()) ?? {
      id: '',
      created: 0,
      updated: 0,
      regen_rate: DEFAULT_REGENERATE_RATE,
      similarity_threshold: 0.7,
      prompt_template_id: '',
      score_threshold: ScoreThreshold.Default,
      vector_similarity_threshold: VectorSimilarity.Default,
      match_cache_ttl_ms: MatchCache.TtlMs,
      match_cache_capacity: MatchCache.Capacity,
      market_install_enabled: true,
    };
  }

  private static toConfigBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === '') return defaultValue;
    return value === 1 || value === '1' || value === true || value === 'true';
  }

  private async getAvailableMcps(): Promise<McpInstallRecord[]> {
    const soInput = new SoMcpInput();

    soInput.conditions = [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ];
    const soOutput = new SoMcpOutput();
    await this.mcpAccess.soMcp(soInput, soOutput, new McpContext());
    return soOutput.list;
  }

  private async getMcpDetails(ids: string[]): Promise<McpInstallRecord[]> {
    const soInput = new SoMcpInput();
    if (ids.length > 0) {
      soInput.conditions = [
        { field: 'id', operator: Operator.IN, value: ids },
      ];
    }
    const soOutput = new SoMcpOutput();
    await this.mcpAccess.soMcp(soInput, soOutput, new McpContext());
    return soOutput.list;
  }


  private toMcpDetails(ids: string[], mcps: McpInstallRecord[]): McpInstallRecord[] {
    return ids
      .map((id) => mcps.find((r) => r.id === id))
      .filter((r): r is McpInstallRecord => r != null);
  }

  private async commitMatchCache(taskContent: string, embedding: number[] | null, rankedIds: string[], matchCtx?: Context): Promise<void> {
    if (!taskContent) {
      return;
    }
    const key = buildCacheKey(taskContent);
    const query = embedding?.length ? embedding : await this.matchCache.embedOf(taskContent, (t) => this.embedTask(t, matchCtx).catch(() => [] as number[]));
    this.matchCache.commit(key, query ?? [], rankedIds.map((id) => ({ id, score: ScoreThreshold.Max })));
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
}
