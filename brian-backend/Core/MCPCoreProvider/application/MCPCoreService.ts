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
  /** 单行配置仓 */
  private readonly configStore: SingleRowConfigStore<McpCoreConfigRecord>;

  // ===== 修改后（2026-09-11）：MD5+向量两级匹配缓存（按任务内容；重复任务零 LLM） =====
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

  /**
   * 为 Agent 匹配 MCP（四层瀑布：需求判定合并排序 → 本地 → 提供商市场获取；无自建层）。
   */
  async matchMCP(input: MatchMcpInput, output: MatchMcpOutput, context: McpCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();

    const availableMcps = await this.getAvailableMcps();

    // ===== 第 1 层：调用方传入的既有绑定（agent 表为唯一绑定事实源）→ 确定性水合 =====
    // 绑定的写入/解除由 Agent 模块评估后执行（AgentLibrary.bindAgentComponent），Core 只做选择与水合
    if (input.bound_mcp_ids && input.bound_mcp_ids.length > 0) {
      output.mcp_ids = input.bound_mcp_ids;
      output.mcp_details = availableMcps.length > 0 ? await this.getMcpDetails(input.bound_mcp_ids) : [];
      output.detail = 'local_hit';
      return true;
    }

    // ===== 缓存命中水合（重复任务零 LLM；bypass_cache 强制全量重排；含负缓存命中） =====
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

    // ===== 第 2 层：LLM 需求判定与排序合并（空库也判定，防闲聊任务触发市场安装） =====
    let rankedIds: string[] = [];
    // token 维度传播：判定上下文装入 run_id/work_id/session（llm_call_log 可按 run 归因）
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
      // 模板/LLM 失败：保守返回空（不写负缓存、不触发市场获取，可重试）
      output.mcp_ids = [];
      output.mcp_details = [];
      output.detail = 'judge_failed';
      return true;
    }
    if (!judged.need) {
      // 任务不需要 MCP：仅 LLM 显式判定（confirmed）才落负缓存；
      // 解析失败/空数组兜底（confirmed=false）视为判定不可靠，不得固化
      //（2026-09-24 修复：原实现 need=false 一律负缓存，解析失败永久短路市场获取层）
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

    // ===== 本地命中 → 入缓存返回 =====
    if (rankedIds.length > 0) {
      await this.commitMatchCache(input.task_content ?? '', cached.query, rankedIds, context);
      output.mcp_ids = rankedIds;
      output.mcp_details = this.toMcpDetails(rankedIds, availableMcps);
      output.detail = 'local_hit';
      return true;
    }

    // ===== 第 3 层：提供商市场获取（need=true 且本地无命中；market_install_enabled 可关） =====
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

  /**
   * 提供商市场获取（逻辑控制）：遍历启用提供商 → listMcp 拉市场清单 →
   * LLM 对市场候选按任务排序 → installMcp 安装 + startMcp 启动 → 返回新 mcp_install id。
   * 任一环节失败返回 null（不阻断，匹配结果为空）。
   */
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
    // 安装即启动（stdio 拉起进程 / http 远程注册），保证本次任务即可用
    try {
      await this.mcpAccess.startMcp(
        Object.assign(new StartMcpInput(), { id: installOut.id }),
        new StartMcpOutput(), new McpContext(),
      );
    } catch { /* 启动失败不回滚安装：MCP 已落库，可手动启动 */ }
    return installOut.id;
  }

  /** 启用中的提供商清单（数据处理） */
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

  /** 市场候选汇总（数据处理）：逐提供商 listMcp（mcp_cache，TTL 内零 API 调用） */
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
      } catch { /* 单个提供商失败跳过，不影响其他提供商 */ }
      for (const row of out.list) {
        const cacheId = String(row.id ?? '');
        const title = String(row.mcp_title ?? '');
        if (!cacheId || !title) continue;
        candidates.push({ provider_id: providerId, cache_id: cacheId, title, brief: String(row.mcp_brief ?? '') });
      }
    }
    return candidates;
  }

  /** 市场候选 LLM 排序（逻辑控制；复用 MCP 匹配模板的旧数组契约；无合格者返回 null） */
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

  // ===== 原始方法（保留作为参考；2026-09-23 被下方修改后版本替代：LIKE 命中不区分 is_system，
  // 用户自建同标题模板会劫持隐式回退，旧契约输出导致 need=false 误降级）=====
  // private async soMarketPromptTemplateId(): Promise<string> {
  //   const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
  //     { field: 'prompt_template_title', operator: Operator.LIKE, value: '%MCP 市场%' },
  //   ]);
  //   if (row && row.id) return String(row.id);
  //   const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
  //     { field: 'enable', operator: Operator.EQ, value: 1 },
  //   ]);
  //   if (anyRow && anyRow.id) return String(anyRow.id);
  //   throw new ProcessingError('未找到 MCP 市场匹配提示词模板');
  // }

  // ===== 修改后（2026-09-23）：隐式回退优先 is_system=1 的 builtin 契约模板（同 SkillCore 修复）=====
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

  // ===== 原始方法（保留作为参考；2026-09-22 升级为四层瀑布，见上方 matchMCP）=====
  // /**
  //  * 为 Agent 匹配 MCP（三层统一匹配/选择逻辑，第3层除外：MCP 没有匹配不可用 MCP）。
  //  */
  // async matchMCP(input: MatchMcpInput, output: MatchMcpOutput, context: McpCoreContext, _metrics?: Metrics, _report?: Report,
  // ): Promise<boolean> {
  //   const config = await this.getConfig();
  //
  //   const availableMcps = await this.getAvailableMcps();
  //
  //   // ===== 第 1 层：调用方传入的既有绑定（agent 表为唯一绑定事实源）→ 确定性水合 =====
  //   if (input.bound_mcp_ids && input.bound_mcp_ids.length > 0) {
  //     output.mcp_ids = input.bound_mcp_ids;
  //     output.mcp_details = availableMcps.length > 0 ? await this.getMcpDetails(input.bound_mcp_ids) : [];
  //     return true;
  //   }
  //
  //   // ===== 缓存命中水合（重复任务零 LLM；bypass_cache 强制全量重排） =====
  //   const cached = input.bypass_cache
  //     ? { record: null, query: await this.matchCache.embedOf(input.task_content ?? '', (t) => this.embedTask(t, context)) }
  //     : await this.matchCache.lookup(input.task_content ?? '', (t) => this.embedTask(t, context));
  //   if (cached.record) {
  //     const ids = cached.record.result.map((r) => r.id);
  //     output.mcp_ids = ids;
  //     output.mcp_details = this.toMcpDetails(ids, availableMcps);
  //     return true;
  //   }
  //
  //   // ===== 第 2 层：LLM 打分推荐（纯选择，不落库） =====
  //   let rankedIds: string[] = [];
  //   if (availableMcps.length > 0) {
  //     rankedIds = await this.rankMcpsWithLLM(
  //       availableMcps,
  //       input,
  //       config.prompt_template_id,
  //       config.score_threshold,
  //       context,
  //     );
  //   }
  //
  //   // ===== 匹配结果入缓存（MD5 + 任务向量；复用 lookup 阶段向量） =====
  //   if (availableMcps.length > 0) {
  //     await this.commitMatchCache(input.task_content ?? '', cached.query, rankedIds, context);
  //   }
  //   output.mcp_ids = rankedIds;
  //   output.mcp_details = this.toMcpDetails(rankedIds, availableMcps);
  //   return true;
  // }

  /** 记录 MCP 使用（usage 是评估依据，非绑定；绑定由 Agent 模块评估后经 bindAgentComponent 写入） */
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
      // ===== 2026-09-22：提供商市场获取层开关 =====
      if (input.market_install_enabled !== undefined) {
        updateData.push({ field: 'market_install_enabled', value: input.market_install_enabled ? 1 : 0 });
      }
      await this.configStore.upsert(updateData);
    }

    output.config = await this.getConfig();
    return true;
  }

  // ===== 新增（2026-09-11）：匹配缓存参数应用（容量/相似度阈值/TTL 读配置表） =====
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

  /** 配置布尔解析（数据处理；SQLite INTEGER 0/1，未定义回退默认值） */
  private static toConfigBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === '') return defaultValue;
    return value === 1 || value === '1' || value === true || value === 'true';
  }

  private async getAvailableMcps(): Promise<McpInstallRecord[]> {
    const soInput = new SoMcpInput();
    // 仅按启用状态过滤；运行状态由 soMcp 返回的实时进程状态再过滤
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

  // ===== 修改后（2026-09-22）：需求判定与排序合并（need/keywords/candidates 契约） =====
  private async rankMcpsWithLLM(
    mcps: McpInstallRecord[],
    input: MatchMcpInput,
    promptTemplateId: string,
    matchCtx?: Context,
  ): Promise<NeedRankingResult | null> {
    // 模板渲染/LLM 失败统一降级 null（调用方保守返回空，不触发市场获取、不写负缓存）
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

  /** 获取 MCP 匹配模板 ID（逻辑控制） */
  // ===== 原始方法（保留作为参考；2026-09-23 被下方修改后版本替代：LIKE 命中不区分 is_system，
  // 用户自建同标题模板会劫持隐式回退，旧契约输出导致 need=false 误降级）=====
  // private async soMatchPromptTemplateId(): Promise<string> {
  //   const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
  //     { field: 'prompt_template_title', operator: Operator.LIKE, value: '%MCP%匹配%' },
  //   ]);
  //   if (row && row.id) return String(row.id);
  //   const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
  //     { field: 'enable', operator: Operator.EQ, value: 1 },
  //   ]);
  //   if (anyRow && anyRow.id) return String(anyRow.id);
  //   throw new ProcessingError('未找到 MCP 匹配提示词模板');
  // }

  // ===== 修改后（2026-09-23）：隐式回退优先 is_system=1 的 builtin 契约模板（同 SkillCore 修复）=====
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

  /**
   * 渲染匹配 Prompt（逻辑控制）：DB 渲染 builtin/自定义模板；无硬编码内存回退，缺失 fail-loud。
   */
  private async renderMatchPrompt(templateId: string, variables: Record<string, unknown>): Promise<string> {
    try {
      const execPromptOutput = new ExecPromptOutput();
      await this.promptsAccess.execPrompt(
        { id: templateId, variables } as ExecPromptInput,
        execPromptOutput, new PromptContext(),
      );
      if (execPromptOutput.prompt) return execPromptOutput.prompt;
    } catch { /* 下沉 fail-loud */ }
    throw new ProcessingError(`Prompt 模板不可用或渲染为空: ${templateId}`);
  }

  /** 排序 LLM 调用（逻辑控制；失败返回空串 → threshold 过滤取空语义） */
    private async soRankLLM(input: ExecLLMInput, matchCtx?: Context): Promise<string> {
    // Token 归因维度：MCP 选择 LLM 打分入账（业务维度随 Context 传播，caller 供分来源统计）
    input.session_id = input.session_id || matchCtx?.session_id || '';
    input.run_id = input.run_id || matchCtx?.run_id || '';
    input.work_id = input.work_id || matchCtx?.work_id || '';
    input.caller = 'MCPCoreService.rankMcps';
    // ===== 2026-09-11：排序调用统一禁用深度思考（provider 对 max_tokens 不约束思考输出是延迟尾部主因） =====
    input.extra = { ...(input.extra ?? {}), thinking: { type: 'disabled' } };
    const execOutput = new ExecLLMOutput();
    try {
      const ok = await this.llmAccess.execLLM(input, execOutput, matchCtx ?? new LLMContext());
      return ok ? (execOutput.result ?? '') : '';
    } catch {
      return '';
    }
  }

  /** 候选 → MCP 明细水合（数据处理；未知 id 过滤） */
  private toMcpDetails(ids: string[], mcps: McpInstallRecord[]): McpInstallRecord[] {
    return ids
      .map((id) => mcps.find((r) => r.id === id))
      .filter((r): r is McpInstallRecord => r != null);
  }

  // ===== 修改后（2026-09-22）：负缓存支持 —— need=false 时空结果也入缓存（重复任务零 LLM） =====
  /** 匹配缓存提交（数据处理；rankedIds 为空即负缓存条目，命中直接返回空） */
  private async commitMatchCache(taskContent: string, embedding: number[] | null, rankedIds: string[], matchCtx?: Context): Promise<void> {
    if (!taskContent) {
      return;
    }
    const key = buildCacheKey(taskContent);
    const query = embedding?.length ? embedding : await this.matchCache.embedOf(taskContent, (t) => this.embedTask(t, matchCtx).catch(() => [] as number[]));
    this.matchCache.commit(key, query ?? [], rankedIds.map((id) => ({ id, score: ScoreThreshold.Max })));
  }

  /** 任务向量化（数据处理；走系统默认 embedding 模型） */
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
