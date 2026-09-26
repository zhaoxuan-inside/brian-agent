import { Metrics, Report, Context } from '@brian-agent/base';
import { VectorMatchCache, buildCacheKey } from '../../shared/VectorMatchCache';
import { parseNeedRankingResult, parseRankingCandidates, filterByThreshold, type NeedRankingResult } from '../../shared/RankingParser';
import { MatchCache, ScoreThreshold, VectorSimilarity } from '../../shared/MatchConstants';
import { SingleRowConfigStore } from '../../shared/SingleRowConfigStore';
import { ProcessingError } from '../../shared/errors';
import type { RelationDBAccess, MCPAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  Operator,
  IdGenerator,
  ValidationError,
  McpContext,
  SoMcpInput,
  SoMcpOutput,
  LLMContext,
  ExecLLMInput,
  ExecLLMOutput,
  EmbedLLMInput,
  EmbedLLMOutput,
  PromptContext,
  GetPromptInput,
  GetPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  McpInstallRecord,
  PROMPT_TEMPLATE_TABLE,
  SoMcpProviderInput,
  SoMcpProviderOutput,
  ListMcpInput,
  ListMcpOutput,
  InstallMcpInput,
  InstallMcpOutput,
  StartMcpInput,
  StartMcpOutput,
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
  AGENT_MCP_USAGE_TABLE,
  DEFAULT_REGENERATE_RATE,
} from '../domain/types';

export class MCPCoreService {

  private readonly configStore: SingleRowConfigStore<McpCoreConfigRecord>;

  private readonly matchCache = new VectorMatchCache();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly mcpAccess: MCPAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {
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

  async matchMCP(input: MatchMcpInput, output: MatchMcpOutput, context: McpCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();

    const availableMcps = await this.getAvailableMcps();

    if (input.bound_mcp_ids && input.bound_mcp_ids.length > 0) {
      output.mcp_ids = input.bound_mcp_ids;
      output.mcp_details = availableMcps.length > 0 ? await this.getMcpDetails(input.bound_mcp_ids) : [];
      output.detail = 'local_hit';
      return true;
    }

    const cached = input.bypass_cache
      ? { record: null, query: await this.matchCache.embedOf(input.task_content ?? '', (t) => this.embedTask(t, context)) }
      : await this.matchCache.lookup(input.task_content ?? '', (t) => this.embedTask(t, context));
    if (cached.record) {
      const ids = cached.record.result.map((r) => r.id);
      output.mcp_ids = ids;
      output.mcp_details = this.toMcpDetails(ids, availableMcps);
      output.detail = ids.length > 0 ? 'local_hit' : 'negative_cache_hit';
      return true;
    }

    let rankedIds: string[] = [];

    const judged = await this.rankMcpsWithLLM(
      availableMcps,
      input,
      config.prompt_template_id,
      Object.assign(new McpCoreContext(), {
        run_id: input.run_id ?? '',
        session_id: input.context_id ?? '',
        work_id: input.run_id ?? '',
      }),
    );
    if (judged === null) {

      output.mcp_ids = [];
      output.mcp_details = [];
      output.detail = 'judge_failed';
      return true;
    }
    if (!judged.need) {

      output.mcp_ids = [];
      output.mcp_details = [];
      if (judged.confirmed) {
        output.detail = 'judged_unneeded';
        await this.commitMatchCache(input.task_content ?? '', cached.query, [], context);
      } else {
        output.detail = 'parse_failed';
      }
      return true;
    }
    const threshold = config.score_threshold ?? ScoreThreshold.Default;
    const validIds = new Set(availableMcps.map((m) => m.id));
    rankedIds = filterByThreshold(judged.candidates, threshold)
      .map((c) => c.id)
      .filter((id) => validIds.has(id));

    if (rankedIds.length > 0) {
      await this.commitMatchCache(input.task_content ?? '', cached.query, rankedIds, context);
      output.mcp_ids = rankedIds;
      output.mcp_details = this.toMcpDetails(rankedIds, availableMcps);
      output.detail = 'local_hit';
      return true;
    }

    if (!config.market_install_enabled) {
      output.mcp_ids = [];
      output.mcp_details = [];
      output.detail = 'local_miss_market_disabled';
      return true;
    }
    const marketId = await this.installMcpFromMarket(input.task_content ?? '', context);
    if (!marketId) {
      output.mcp_ids = [];
      output.mcp_details = [];
      output.detail = 'market_miss';
      return true;
    }
    output.mcp_ids = [marketId];
    output.mcp_details = await this.getMcpDetails([marketId]);
    output.detail = 'market_installed';
    return true;
  }

  private async installMcpFromMarket(taskContent: string, matchCtx?: Context): Promise<string | null> {
    const providers = await this.soEnabledProviders();
    const marketCandidates = await this.soMarketCandidates(providers);
    if (marketCandidates.length === 0) {
      return null;
    }
    const best = await this.rankMarketCandidates(marketCandidates, taskContent, matchCtx);
    if (!best) {
      return null;
    }
    const installOut = new InstallMcpOutput();
    await this.mcpAccess.installMcp(
      Object.assign(new InstallMcpInput(), { mcp_provider_id: best.provider_id, mcp_id: best.cache_id }),
      installOut, new McpContext(),
    );
    if (!installOut.id) {
      return null;
    }

    try {
      await this.mcpAccess.startMcp(
        Object.assign(new StartMcpInput(), { id: installOut.id }),
        new StartMcpOutput(), new McpContext(),
      );
    } catch {  }
    return installOut.id;
  }

  private async soEnabledProviders(): Promise<Array<Record<string, unknown>>> {
    const out = new SoMcpProviderOutput();
    await this.mcpAccess.soMcpProvider(
      Object.assign(new SoMcpProviderInput(), {
        conditions: [{ field: 'enable', operator: Operator.EQ, value: 1 }],
      }),
      out, new McpContext(),
    );
    return out.list as unknown as Array<Record<string, unknown>>;
  }

  private async soMarketCandidates(providers: Array<Record<string, unknown>>): Promise<Array<{ provider_id: string; cache_id: string; title: string; brief: string }>> {
    const candidates: Array<{ provider_id: string; cache_id: string; title: string; brief: string }> = [];
    for (const provider of providers) {
      const providerId = String(provider.id ?? '');
      if (!providerId) continue;
      const out = new ListMcpOutput();
      try {
        await this.mcpAccess.listMcp(
          Object.assign(new ListMcpInput(), { mcp_provider_id: providerId }),
          out, new McpContext(),
        );
      } catch {  }
      for (const row of out.list) {
        const cacheId = String(row.id ?? '');
        const title = String(row.mcp_title ?? '');
        if (!cacheId || !title) continue;
        candidates.push({ provider_id: providerId, cache_id: cacheId, title, brief: String(row.mcp_brief ?? '') });
      }
    }
    return candidates;
  }

  private async rankMarketCandidates(
    candidates: Array<{ provider_id: string; cache_id: string; title: string; brief: string }>,
    taskContent: string,
    matchCtx?: Context,
  ): Promise<{ provider_id: string; cache_id: string } | null> {
    const templateId = await this.soMarketPromptTemplateId();
    const prompt = await this.renderMatchPrompt(templateId, {
      task_content: taskContent,
      available_mcps: JSON.stringify(candidates.map((c) => ({ id: c.cache_id, title: c.title, brief: c.brief }))),
    });
    const text = await this.soRankLLM({ id: '', prompt, temperature: 0.1, max_tokens: 300 } as ExecLLMInput, matchCtx);
    const validIds = new Map(candidates.map((c) => [c.cache_id, c.provider_id]));
    const best = parseRankingCandidates(text)
      .filter((c) => validIds.has(c.id))
      .sort((a, b) => b.score - a.score)[0];
    return best ? { cache_id: best.id, provider_id: validIds.get(best.id)! } : null;
  }

  private async soMarketPromptTemplateId(): Promise<string> {
    const builtin = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.LIKE, value: '%MCP 市场%' },
      { field: 'is_system', operator: Operator.EQ, value: 1 },
    ]);
    if (builtin && builtin.id) return String(builtin.id);
    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.LIKE, value: '%MCP 市场%' },
    ]);
    if (row && row.id) return String(row.id);
    const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (anyRow && anyRow.id) return String(anyRow.id);
    throw new ProcessingError('未找到 MCP 市场匹配提示词模板');
  }

  async optMCP(input: OptMcpInput, output: OptMcpOutput, _context: McpCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) {
      throw new ValidationError('agent_id 为必填');
    }
    if (!input.mcp_id) {
      throw new ValidationError('mcp_id 为必填');
    }
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_MCP_USAGE_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'agent_id', value: input.agent_id },
      { field: 'mcp_id', value: input.mcp_id },
      { field: 'usage_date', value: new Date().toISOString().slice(0, 10) },
      { field: 'usage_count', value: 1 },
    ]);

    output.id = '';
    return true;
  }

  async configMCPCore(input: ConfigMcpCoreInput, output: ConfigMcpCoreOutput, _context: McpCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.score_threshold !== undefined && (input.score_threshold < 0 || input.score_threshold > 100)) {
      throw new ValidationError('score_threshold 必须在 0-100 之间');
    }
    if (input.vector_similarity_threshold !== undefined && (input.vector_similarity_threshold < 0 || input.vector_similarity_threshold > 1)) {
      throw new ValidationError('vector_similarity_threshold 必须在 0.0-1.0 之间');
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
    return soOutput.list.filter((r) => String(r.status) === 'running');
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

  private async rankMcpsWithLLM(
    mcps: McpInstallRecord[],
    input: MatchMcpInput,
    promptTemplateId: string,
    matchCtx?: Context,
  ): Promise<NeedRankingResult | null> {

    try {
      const variables = {
        agent_id: input.agent_id,
        context_id: input.context_id,
        run_id: input.run_id,
        task_content: input.task_content ?? '',
        available_mcps: JSON.stringify(mcps.map((m) => ({ id: m.id, title: m.mcp_title, brief: m.mcp_brief ?? '' }))),
      };
      const templateId = promptTemplateId || await this.soMatchPromptTemplateId();
      const prompt = await this.renderMatchPrompt(templateId, variables);
      const text = await this.soRankLLM({ id: '', prompt, temperature: 0.1, max_tokens: 300 } as ExecLLMInput, matchCtx);
      if (!text) {
        return null;
      }
      return parseNeedRankingResult(text);
    } catch {
      return null;
    }
  }

  private async soMatchPromptTemplateId(): Promise<string> {
    const builtin = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.LIKE, value: '%MCP%匹配%' },
      { field: 'is_system', operator: Operator.EQ, value: 1 },
    ]);
    if (builtin && builtin.id) return String(builtin.id);
    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.LIKE, value: '%MCP%匹配%' },
    ]);
    if (row && row.id) return String(row.id);
    const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (anyRow && anyRow.id) return String(anyRow.id);
    throw new ProcessingError('未找到 MCP 匹配提示词模板');
  }

  private async renderMatchPrompt(templateId: string, variables: Record<string, unknown>): Promise<string> {
    try {
      const execPromptOutput = new ExecPromptOutput();
      await this.promptsAccess.execPrompt(
        { id: templateId, variables } as ExecPromptInput,
        execPromptOutput, new PromptContext(),
      );
      if (execPromptOutput.prompt) return execPromptOutput.prompt;
    } catch {  }
    throw new ProcessingError(`Prompt 模板不可用或渲染为空: ${templateId}`);
  }

    private async soRankLLM(input: ExecLLMInput, matchCtx?: Context): Promise<string> {

    input.session_id = input.session_id || matchCtx?.session_id || '';
    input.run_id = input.run_id || matchCtx?.run_id || '';
    input.work_id = input.work_id || matchCtx?.work_id || '';
    input.caller = 'MCPCoreService.rankMcps';

    input.extra = { ...(input.extra ?? {}), thinking: { type: 'disabled' } };
    const execOutput = new ExecLLMOutput();
    try {
      const ok = await this.llmAccess.execLLM(input, execOutput, matchCtx ?? new LLMContext());
      return ok ? (execOutput.result ?? '') : '';
    } catch {
      return '';
    }
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
