/**
 * @fileoverview SoulCoreProvider 应用服务层。
 *
 * 依赖 SoulAccess / LLMAccess / PromptsAccess / RelationDBAccess，
 * 实现 LLM-based Soul（persona）匹配、缓存、自动生成、比较优化与老化。
 *
 * 实现所有用例：matchSoul / optSoul / ageSoul / soSoulRule / updateSoulRule / configSoulCore。
 */

import { Metrics, Report } from '@brian-agent/base';
import { callLLMJson } from '@brian-agent/base';
import type { RelationDBAccess } from '@brian-agent/base';
import type { SoulAccess } from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import type { PromptsAccess } from '@brian-agent/base';
import { SoulContext, AddSoulInput, AddSoulOutput, GetSoulInput, GetSoulOutput, SoSoulOutput, RecordSoulUsageInput, RecordSoulUsageOutput, PromptContext, GetPromptInput, GetPromptOutput, ExecPromptInput, ExecPromptOutput, LLMContext, ExecLLMInput, ExecLLMOutput, EmbedLLMInput, EmbedLLMOutput, Operator, OperationType, IdGenerator, JsonParser, ValidationError, NotFoundError, PROMPT_TEMPLATE_TABLE } from '@brian-agent/base';
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
  SOUL_CORE_USAGE_TABLE,
} from '../domain/types';
import { ProcessingError } from '../../shared/errors';
import { SingleRowConfigStore } from '../../shared/SingleRowConfigStore';
import { ensureDefaultConfig } from '../../shared/ConfigHelper';
import { VectorMatchCache, buildCacheKey } from '../../shared/VectorMatchCache';
import { parseRankingCandidates, filterByThreshold } from '../../shared/RankingParser';
import { MatchCache, ScoreThreshold, VectorSimilarity } from '../../shared/MatchConstants';

/**
 * SoulCoreProvider 应用服务。
 *
 * 作为 Soul 匹配、自动生成、比较优化与老化的业务入口，
 * 上层不可直接操作 agent_soul / soul_core_usage / soul_opt_rule 表。
 */
export class SoulCoreService {
  /** 单行配置仓 */
  private readonly configStore: SingleRowConfigStore<SoulCoreConfigRecord>;

  // ===== 修改后（2026-09-11）：MD5+向量两级匹配缓存（按任务内容；重复任务零 LLM） =====
  private readonly matchCache = new VectorMatchCache();

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
  ) {
    this.configStore = new SingleRowConfigStore<SoulCoreConfigRecord>(this.relationDb, {
      table: SOUL_CORE_CONFIG_TABLE,
      toRecord: (raw) => this.toSoulCoreConfigRecord(raw),
      defaults: [],
    });
  }

  /**
   * 初始化：确保默认配置存在。
   */
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

  // ---------------------------------------------------------------------------
  // matchSoul
  // ---------------------------------------------------------------------------

  /**
   * 为 Agent 匹配 Soul（persona，三层统一匹配/选择逻辑）。
   */
  async matchSoul(input: MatchSoulInput, output: MatchSoulOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const { agent_id, context_id, interact_id, task_content, task_domain } = input;
    if (!agent_id) {
      throw new ValidationError('matchSoul 需要提供 agent_id');
    }

    // ===== 第 1 层：调用方传入的既有绑定（agent 表为唯一绑定事实源）→ 确定性水合 =====
    if (input.bound_soul_id) {
      const soulRecord = await this.getSoulById(input.bound_soul_id);
      output.soul_id = input.bound_soul_id;
      output.soul = soulRecord;
      output.from_cache = true;
      return true;
    }

    // ===== 缓存命中水合（MD5 精确 → 余弦 >= vector_similarity_threshold；重复任务零 LLM；bypass_cache 强制全量） =====
    const cached = input.bypass_cache
      ? { record: null, query: await this.matchCache.embedOf(task_content ?? '', (t) => this.embedTask(t)) }
      : await this.matchCache.lookup(task_content ?? '', (t) => this.embedTask(t));
    const cachedSoulId = cached.record?.result[0]?.id ?? '';
    if (cachedSoulId) {
      const soulRecord = await this.hydrateSoulOrClear(cachedSoulId);
      if (soulRecord) {
        output.soul_id = cachedSoulId;
        output.soul = soulRecord;
        output.from_cache = true;
        return true;
      }
      this.matchCache.clear();
    }

    const config = await this.getCoreConfig();
    // 获取可用 Soul 列表
    const soOutput = new SoSoulOutput();
    await this.soulAccess.soSoul(
      { conditions: [{ field: 'enable', operator: Operator.EQ, value: 1 }] },
      soOutput, new SoulContext(),
    );
    const availableSouls = soOutput.list;

    // ===== 第 2 层：LLM 打分推荐 =====
    // 当现有 Soul 均不符合当前任务特质（低于采纳阈值）或 Soul 库为空时，自动生成专属 Soul
    let selectedSoulId = '';
    if (availableSouls.length > 0) {
      selectedSoulId = await this.rankSoulsByLLM(
        agent_id, context_id, interact_id, task_content, task_domain, availableSouls, config,
      );
    }
    if (!selectedSoulId) {
      selectedSoulId = await this.generateAndAddSoul(agent_id, context_id, interact_id, task_content, task_domain);
    }

    const soulRecord = await this.getSoulById(selectedSoulId);
    // ===== 匹配结果入缓存（MD5 + 任务向量；commit 复用 lookup 期向量；空结果不入缓存） =====
    if (selectedSoulId) {
      await this.commitMatchCache(task_content ?? '', cached.query, selectedSoulId);
    }
    output.soul_id = selectedSoulId;
    output.soul = soulRecord;
    output.from_cache = false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // optSoul
  // ---------------------------------------------------------------------------

  /**
   * Soul 比较裁决 + 使用记录（评估依据；重绑由 Agent 模块按裁决执行）。
   *
   * 1. current_soul_id 缺省时仅记录 usage；
   * 2. 传入时获取当前/候选 Soul，调用 LLM 做 A vs B 比较裁决；
   * 3. 输出 verdict 与裁决后生效的 soul_id（不落任何绑定——绑定事实源为 Agent 表）。
   */
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

    // 记录使用到 Soul Provider（Base 层）与 soul_core_usage（评估依据，与绑定解耦）
    await this.soulAccess.recordSoulUsage(
      { soul_id } as RecordSoulUsageInput,
      new RecordSoulUsageOutput(), new SoulContext(),
    );
    await this.recordSoulCoreUsage(agent_id, effectiveSoulId);

    output.current_soul_id = effectiveSoulId;
    return true;
  }

  // ---------------------------------------------------------------------------
  // ageSoul
  // ---------------------------------------------------------------------------

  /**
   * 按 soul_opt_rule 规则评估解绑候选（不删除；解绑由 Agent 模块评估后执行）。
   */
  async ageSoul(_input: AgeSoulInput, output: AgeSoulOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.stale_souls = await this.soStaleSoulUsages();
    output.aged_count = output.stale_souls.length;
    return true;
  }

  /** 统计解绑候选（数据处理；按规则窗口内 (agent_id, soul_id) 使用计数） */
  private async soStaleSoulUsages(): Promise<Array<{ agent_id: string; soul_id: string; usage_count: number }>> {
    const rules = await this.relationDb.select(SOUL_OPT_RULE_TABLE, {});
    if (rules.length === 0) {
      return [];
    }
    const stale: Array<{ agent_id: string; soul_id: string; usage_count: number }> = [];
    for (const rule of rules) {
      const since = IdGenerator.now() - Number(rule.days) * 24 * 60 * 60 * 1000;
      const minUsage = Number(rule.min_usage_count);
      const rows = this.relationDb.queryRaw<{ agent_id: string; soul_id: string; total: number }>(
        `SELECT "agent_id", "soul_id", SUM("usage_count") AS total FROM "${SOUL_CORE_USAGE_TABLE}"
         WHERE "created" >= ? GROUP BY "agent_id", "soul_id" HAVING SUM("usage_count") < ?`,
        [since, minUsage],
      );
      for (const row of rows ?? []) {
        stale.push({ agent_id: String(row.agent_id), soul_id: String(row.soul_id), usage_count: Number(row.total ?? 0) });
      }
    }
    return stale;
  }

  // ---------------------------------------------------------------------------
  // soSoulRule
  // ---------------------------------------------------------------------------

  /**
   * 查询 Soul 优化规则。
   */
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

  // ---------------------------------------------------------------------------
  // updateSoulRule
  // ---------------------------------------------------------------------------

  /**
   * 批量更新 Soul 优化规则（事务）。
   */
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

  // ---------------------------------------------------------------------------
  // soSoulContent
  // ---------------------------------------------------------------------------

  /**
   * 按 id 读取 Soul 内容（数据处理；不存在返回空串，不抛错）。
   */
  async soSoulContent(input: SoSoulContentInput, output: SoSoulContentOutput, _context: SoulCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.soul_id) {
      throw new ValidationError('soSoulContent 需要提供 soul_id');
    }
    const soul = await this.getSoulById(input.soul_id);
    output.content = String(soul?.soul_content ?? '');
    return true;
  }

  // configSoulCore
  // ---------------------------------------------------------------------------

  /**
   * 获取或更新 soul_core_config 配置（SET 语义）。
   */
  // ===== 修改后的方法 =====
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
      // ===== 2026-09-11：排序采纳阈值与任务向量命中阈值（均可在配置中心调整） =====
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

    // ===== 新增（2026-09-11）：配置变更即清缓存 + 应用缓存参数 =====
    await this.applyMatchCacheConfig();
    output.config = await this.getCoreConfig();
    return true;
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — 配置
  // ---------------------------------------------------------------------------

  /** 获取配置（单行配置仓：进程内缓存 + 空表回退默认值） */
  private async getCoreConfig(): Promise<SoulCoreConfigRecord | null> {
    return this.configStore.load();
  }

  // ===== 新增（2026-09-11）：匹配缓存参数应用（容量/相似度阈值/TTL 读配置表） =====
  private async applyMatchCacheConfig(): Promise<void> {
    const serviceConfig = await this.getCoreConfig();
    this.matchCache.configure({
      capacity: serviceConfig?.match_cache_capacity ?? MatchCache.Capacity,
      similarityThreshold: serviceConfig?.vector_similarity_threshold ?? VectorSimilarity.Default,
      ttlMs: serviceConfig?.match_cache_ttl_ms ?? MatchCache.TtlMs,
    });
    this.matchCache.clear();
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — agent_soul 绑定
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // 内部辅助 — Soul 查询
  // ---------------------------------------------------------------------------

  /** 通过 SoulAccess.soSoulById 获取 Soul 详情 */
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
    taskContent?: string,
    taskDomain?: string,
  ): Promise<string> {
    const config = await this.getCoreConfig();
    const llmId = config?.llm_id || '';

    const generationPrompt = [
      '你是一个 Persona 生成器。请为该 AI Agent 生成一个合适的 Soul（角色设定）。',
      '',
      `Agent ID: ${agentId}`,
      `Context ID: ${contextId}`,
      `Interaction ID: ${interactId}`,
      `任务领域: ${taskDomain || '未指定'}`,
      `当前任务内容: ${taskContent || '未指定'}`,
      '',
      '请依据任务领域与内容，生成与该任务高度契合的角色设定（例如旅游规划任务应生成旅游顾问角色，而非通用编码助手）。',
      '请以 JSON 格式返回，包含以下字段：',
      '  - soul_brief: 简短的 Soul 名称/标题（一行）',
      '  - soul_content: 完整的 Soul 角色设定内容',
      '  - soul_usage: Soul 适用场景描述',
      '',
      '仅输出 JSON，不要包含其他内容。',
    ].join('\n');

    // 最多重试 3 次，容忍 LLM 偶发失败 / 返回格式异常（callLLMJson 公共封装）
    const parsed = await callLLMJson<Record<string, unknown>>(this.llmAccess, {
      llmId,
      prompt: generationPrompt,
      retries: 2,
      /// ===== 2026-09-11：生成加 max_tokens 上限；执行 disabled thinking（CallLLMJson 内部统一） =====
      extra: { max_tokens: 800 },
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
          soul_brief: this.asTrimmedString(parsed.soul_brief) || '自动生成的 Soul',
          soul_content: this.asTrimmedString(parsed.soul_content) || '乐于助人的 AI 助手。',
          soul_usage: this.asTrimmedString(parsed.soul_usage) || '通用对话、信息查询、任务辅助',
        },
      } as AddSoulInput,
      addOutput, new SoulContext(),
    );

    return addOutput.id;
  }

  /** 将任意 LLM 字段安全转为去空白字符串，非字符串返回空串 */
  private asTrimmedString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  // ---------------------------------------------------------------------------
  // 内部辅助 — LLM 排名
  // ---------------------------------------------------------------------------

  /**
   * 调用 LLM 对可用 Soul 进行相关性排序，返回最匹配的 Soul ID。
   *
   * 2026-09-11：统一 `[{"id","score"}]` 百分制输出（RankingParser）+ score_threshold 截断；
   * prompt 仅从 prompt_template 表渲染（无硬编码回退，缺模板 fail-loud）。
   */
  private async rankSoulsByLLM(
    agentId: string,
    contextId: string,
    interactId: string,
    taskContent: string | undefined,
    taskDomain: string | undefined,
    availableSouls: Array<{ id: string; soul_brief: string; soul_usage?: string }>,
    config: SoulCoreConfigRecord | null,
  ): Promise<string> {
    const selectionVariables = {
      agent_id: agentId,
      context_id: contextId,
      interact_id: interactId,
      task_content: taskContent || '',
      task_domain: taskDomain || '',
      available_souls: JSON.stringify(availableSouls.map((s) => ({
        id: s.id,
        soul_brief: s.soul_brief,
        soul_usage: s.soul_usage ?? '',
      }))),
    };
    const templateId = config?.prompt_template_id || await this.soMatchPromptTemplateId();
    const selectionPrompt = await this.renderMatchPrompt(
      templateId,
      selectionVariables,
    );
    const llmId = config?.llm_id || '';
    const result = await this.soRankLLM({
      id: llmId,
      prompt: selectionPrompt,
      temperature: 0.1,
      max_tokens: 256,
    });
    const threshold = config?.score_threshold ?? ScoreThreshold.Default;
    const candidates = parseRankingCandidates(result);
    const filtered = filterByThreshold(candidates, threshold);
    return filtered[0]?.id ?? '';
  }

  /** 获取 Soul 匹配模板 ID（逻辑控制） */
  private async soMatchPromptTemplateId(): Promise<string> {
    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.LIKE, value: '%Soul 匹配%' },
    ]);
    if (row && row.id) return String(row.id);
    const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (anyRow && anyRow.id) return String(anyRow.id);
    throw new ProcessingError('未找到 Soul 匹配提示词模板');
  }

  /**
   * 渲染匹配 Prompt（逻辑控制）：DB 渲染 builtin/自定义模板；删除硬编码内存回退，
   * 模板缺失/渲染失败 fail-loud（配置中心可见可修）。渲染空结果时回保 builtin ID 重试一次。
   */
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

  /**
   * 排序 LLM 调用（逻辑控制；失败返回空串 → 调用方走 threshold 兜底语义）。
   */
    private async soRankLLM(input: ExecLLMInput): Promise<string> {
    // ===== 2026-09-11：排序调用统一禁用深度思考（provider 对 max_tokens 不约束思考输出是延迟尾部主因） =====
    input.extra = { ...(input.extra ?? {}), thinking: { type: 'disabled' } };
    const execLLMOutput = new ExecLLMOutput();
    try {
      const ok = await this.llmAccess.execLLM(input, execLLMOutput, new LLMContext());
      return ok ? (execLLMOutput.result ?? '') : '';
    } catch {
      return '';
    }
  }

  /** 匹配缓存提交（数据处理；向量缺失时以空向量入库 —— 仅参与 MD5 一级命中） */
  private async commitMatchCache(taskContent: string, embedding: number[] | null, soulId: string): Promise<void> {
    if (!soulId) {
      return;
    }
    const query = embedding?.length ? embedding : await this.matchCache.embedOf(taskContent, (t) => this.embedTask(t).catch(() => [] as number[]));
    this.matchCache.commit(
      buildCacheKey(taskContent),
      query ?? [],
      [{ id: soulId, score: ScoreThreshold.Max }],
    );
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

  /** 缓存命中的 Soul 水合（数据处理；目标已失效返回 null，由调用方清缓存） */
  private async hydrateSoulOrClear(soulId: string): Promise<Record<string, unknown> | null> {
    return this.getSoulById(soulId);
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
      { id: llmId, prompt, temperature: 0.1, max_tokens: 256 },
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

  // ---------------------------------------------------------------------------
  // 内部辅助 — soul_core_usage
  // ---------------------------------------------------------------------------

  /** 记录一次 Soul 核心层使用（评估依据；键为 (agent_id, soul_id)，与绑定解耦） */
  private async recordSoulCoreUsage(agentId: string, soulId: string): Promise<void> {
    const now = IdGenerator.now();
    await this.relationDb.insert(SOUL_CORE_USAGE_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'agent_id', value: agentId },
      { field: 'soul_id', value: soulId },
      { field: 'usage_date', value: new Date().toISOString().slice(0, 10) },
      { field: 'usage_count', value: 1 },
    ]);
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
