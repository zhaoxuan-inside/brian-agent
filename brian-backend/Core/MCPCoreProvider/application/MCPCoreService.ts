import { Metrics, Report } from '@brian-agent/base';
import { VectorMatchCache, buildCacheKey } from '../../shared/VectorMatchCache';
import { parseRankingCandidates, filterByThreshold } from '../../shared/RankingParser';
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
      }),
      defaults: [
        { field: 'prompt_template_id', value: '' },
        { field: 'score_threshold', value: ScoreThreshold.Default },
        { field: 'vector_similarity_threshold', value: VectorSimilarity.Default },
        { field: 'match_cache_ttl_ms', value: MatchCache.TtlMs },
        { field: 'match_cache_capacity', value: MatchCache.Capacity },
      ],
    });
  }

  /**
   * 为 Agent 匹配 MCP（三层统一匹配/选择逻辑，第3层除外：MCP 没有匹配不可用 MCP）。
   */
  async matchMCP(input: MatchMcpInput, output: MatchMcpOutput, _context: McpCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();

    const availableMcps = await this.getAvailableMcps();

    // ===== 第 1 层：调用方传入的既有绑定（agent 表为唯一绑定事实源）→ 确定性水合 =====
    // 绑定的写入/解除由 Agent 模块评估后执行（AgentLibrary.bindAgentComponent），Core 只做选择与水合
    if (input.bound_mcp_ids && input.bound_mcp_ids.length > 0) {
      output.mcp_ids = input.bound_mcp_ids;
      output.mcp_details = availableMcps.length > 0 ? await this.getMcpDetails(input.bound_mcp_ids) : [];
      return true;
    }

    // ===== 缓存命中水合（重复任务零 LLM；bypass_cache 强制全量重排） =====
    const cached = input.bypass_cache
      ? { record: null, query: await this.matchCache.embedOf(input.task_content ?? '', (t) => this.embedTask(t)) }
      : await this.matchCache.lookup(input.task_content ?? '', (t) => this.embedTask(t));
    if (cached.record) {
      const ids = cached.record.result.map((r) => r.id);
      output.mcp_ids = ids;
      output.mcp_details = this.toMcpDetails(ids, availableMcps);
      return true;
    }

    // ===== 第 2 层：LLM 打分推荐（纯选择，不落库） =====
    let rankedIds: string[] = [];
    if (availableMcps.length > 0) {
      rankedIds = await this.rankMcpsWithLLM(
        availableMcps,
        input,
        config.prompt_template_id,
        config.score_threshold,
      );
    }

    // ===== 匹配结果入缓存（MD5 + 任务向量；复用 lookup 阶段向量） =====
    if (availableMcps.length > 0) {
      await this.commitMatchCache(input.task_content ?? '', cached.query, rankedIds);
    }
    output.mcp_ids = rankedIds;
    output.mcp_details = this.toMcpDetails(rankedIds, availableMcps);
    return true;
  }

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
    if (input.regen_rate !== undefined || input.similarity_threshold !== undefined || input.prompt_template_id !== undefined || input.score_threshold !== undefined || input.vector_similarity_threshold !== undefined) {
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
    };
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

  private async rankMcpsWithLLM(
    mcps: McpInstallRecord[],
    input: MatchMcpInput,
    promptTemplateId: string,
    scoreThreshold: number,
  ): Promise<string[]> {
    const variables = {
      agent_id: input.agent_id,
      context_id: input.context_id,
      interact_id: input.interact_id,
      task_content: input.task_content ?? '',
      available_mcps: JSON.stringify(mcps.map((m) => ({ id: m.id, title: m.mcp_title, brief: m.mcp_brief ?? '' }))),
    };
    const templateId = promptTemplateId || await this.soMatchPromptTemplateId();
    const prompt = await this.renderMatchPrompt(templateId, variables);
    const text = await this.soRankLLM({ id: '', prompt, temperature: 0.1, max_tokens: 300 } as ExecLLMInput);
    const threshold = Number.isFinite(scoreThreshold) ? scoreThreshold : ScoreThreshold.Default;
    const mcpIds = new Set(mcps.map((m) => m.id));
    return filterByThreshold(parseRankingCandidates(text), threshold)
      .map((c) => c.id)
      .filter((id) => mcpIds.has(id));
  }

  /** 获取 MCP 匹配模板 ID（逻辑控制） */
  private async soMatchPromptTemplateId(): Promise<string> {
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
    private async soRankLLM(input: ExecLLMInput): Promise<string> {
    // ===== 2026-09-11：排序调用统一禁用深度思考（provider 对 max_tokens 不约束思考输出是延迟尾部主因） =====
    input.extra = { ...(input.extra ?? {}), thinking: { type: 'disabled' } };
    const execOutput = new ExecLLMOutput();
    try {
      const ok = await this.llmAccess.execLLM(input, execOutput, new LLMContext());
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

  /** 匹配缓存提交（数据处理；复用 lookup 阶段的任务向量，缺失时补算） */
  private async commitMatchCache(taskContent: string, embedding: number[] | null, rankedIds: string[]): Promise<void> {
    if (!taskContent || rankedIds.length === 0) {
      return;
    }
    const key = buildCacheKey(taskContent);
    const query = embedding?.length ? embedding : await this.matchCache.embedOf(taskContent, (t) => this.embedTask(t).catch(() => [] as number[]));
    this.matchCache.commit(key, query ?? [], rankedIds.map((id) => ({ id, score: ScoreThreshold.Max })));
  }

  /** 任务向量化（数据处理；走系统默认 embedding 模型） */
  private async embedTask(task: string): Promise<number[]> {
    const output = new EmbedLLMOutput();
    const input = Object.assign(new EmbedLLMInput(), { id: '', input: task });
    const ok = await this.llmAccess.embedLLM(input, output, new LLMContext());
    if (!ok || !output.embedding?.length) {
      throw new ProcessingError('任务向量化失败（embedLLM 无返回）');
    }
    return output.embedding;
  }
}
