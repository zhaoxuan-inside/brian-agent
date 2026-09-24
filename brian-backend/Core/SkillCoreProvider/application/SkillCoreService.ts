/**
 * @fileoverview SkillCoreProvider 应用服务层。
 *
 * 依赖 SkillAccess / LLMAccess / PromptsAccess / RelationDBAccess，
 * 实现 LLM-based Skill 匹配、自动绑定、使用记录与基于配置窗口的 Skill 老化。
 *
 * 实现所有用例：matchSkill / optSkill / ageSkill / soSkillRule / updateSkillRule / configSkillCore。
 */

import { Metrics, Report } from '@brian-agent/base';
import { SingleRowConfigStore } from '../../shared/SingleRowConfigStore';
import type { RelationDBAccess } from '@brian-agent/base';
import type { SkillAccess } from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import type { PromptsAccess } from '@brian-agent/base';
import { SkillContext, SoSkillOutput, Context, PromptContext, GetPromptInput, GetPromptOutput, ExecPromptOutput, LLMContext, ExecLLMInput, ExecLLMOutput, EmbedLLMInput, EmbedLLMOutput, Operator, OperationType, IdGenerator, JsonParser, ValidationError, PROMPT_TEMPLATE_TABLE, AddSkillOutput } from '@brian-agent/base';
import type { AddSkillInput, DataObject, FileEntry } from '@brian-agent/base';
import {
  SkillCoreContext,
  SkillCoreConfigRecord,
  SkillOptRuleRecord,
  MatchedSkillEntry,
  MatchSkillInput,
  MatchSkillOutput,
  OptSkillInput,
  OptSkillOutput,
  AgeSkillInput,
  AgeSkillOutput,
  SoSkillRuleInput,
  SoSkillRuleOutput,
  UpdateSkillRuleInput,
  UpdateSkillRuleOutput,
  ConfigSkillCoreInput,
  ConfigSkillCoreOutput,
  SKILL_CORE_CONFIG_TABLE,
  SKILL_OPT_RULE_TABLE,
  SKILL_USAGE_TABLE,
} from '../domain/types';
import { ProcessingError } from '../../shared/errors';
import { VectorMatchCache, buildCacheKey } from '../../shared/VectorMatchCache';
import { parseNeedRankingResult, filterByThreshold, type NeedRankingResult, type RankedCandidate } from '../../shared/RankingParser';
import { MatchCache, ScoreThreshold, VectorSimilarity } from '../../shared/MatchConstants';
import { GitHubSkillClient, type ParsedSkillMd } from '../infrastructure/GitHubSkillClient';

/** 完整自建（Layer-4）单次生成的 max_tokens 上限：需覆盖 skill_md + scripts + references JSON */
const GENERATE_MAX_TOKENS = 3000;
/** 自建文件清单上限（scripts 与 references 各自） */
const GENERATED_FILE_MAX_COUNT = 3;
/** 自建单文件内容长度上限（字符） */
const GENERATED_FILE_MAX_CHARS = 20000;

/**
 * SkillCoreProvider 应用服务。
 *
 * 作为 Skill 匹配、自动绑定与老化的业务入口，
 * 上层不可直接操作 agent_skill / skill_usage / skill_opt_rule 表。
 */
export class SkillCoreService {
  /**
   * @param relationDb RelationDBProvider 接入层
   * @param skillAccess SkillProvider 接入层
   * @param llmAccess LLMProvider 接入层
   * @param promptsAccess PromptsProvider 接入层
   */
  /** 单行配置仓 */
  private readonly configStore: SingleRowConfigStore<SkillCoreConfigRecord>;

  // ===== 新增（2026-09-11）：匹配结果内存缓存（agent_id + 任务前缀；TTL 命中直接水合，重复任务零 LLM） =====
  private readonly matchCache = new VectorMatchCache();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly skillAccess: SkillAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly githubClient?: GitHubSkillClient,
  ) {
    this.configStore = new SingleRowConfigStore<SkillCoreConfigRecord>(relationDb, {
      table: SKILL_CORE_CONFIG_TABLE,
      toRecord: (raw) => this.toSkillCoreConfigRecord(raw),
      defaults: [{ field: 'prompt_template_id', value: '' }],
    });
  }

  // ---------------------------------------------------------------------------
  // matchSkill
  // ---------------------------------------------------------------------------

  /**
   * 为 Agent 匹配 Skill（四层瀑布：需求判定合并排序 → 本地 → GitHub → 自建）。
   * 原始方法（保留作为参考）：
   *  - need=false 一律负缓存短路（解析失败也会被判 false → 永久短路扩容层，事故 trace 95b8e237）；
   *  - GitHub 检索 keywords 为空直接 return —— 判定端忘给 words 时扩容层再次静默跳过。
   */
  // async matchSkill(input: MatchSkillInput, output: MatchSkillOutput, context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  // ): Promise<boolean> {
  //   ...（原文见 git 历史，逻辑同下但 :140-145 need=false 未验 confirmed 落负缓存、:159 keywords 空即 return）
  // }

  /**
   * 为 Agent 匹配 Skill（四层瀑布：需求判定合并排序 → 本地 → GitHub → 自建）。
   * 2026-09-24 三处修复（事故 trace 95b8e237 根因闭环）：
   *  ① need=false 仅在 confirmed（LLM 显式判定）时写负缓存 —— 解析失败/空数组兜底不得
   *    固化为业务结论（原实现 need=false 一律负缓存，见上方注释保留）；
   *  ② GitHub 检索 keywords 空时以任务文本兜底 —— 扩容层不再因 LLM 忘给 words 静默跳过；
   *  ③ output.detail 记录判定终态（judged_unneeded / negative_cache_hit / no_inventory /
   *    threshold_filtered / github_miss / generated / local_hit），供事件层分维度可观测。
   */
  async matchSkill(input: MatchSkillInput, output: MatchSkillOutput, context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const { agent_id, context_id, run_id } = input;
    if (!agent_id) {
      throw new ValidationError('agent_id 为必填');
    }

    // ===== 第 1 层：调用方传入的既有绑定（agent 表为唯一绑定事实源）→ 确定性水合 =====
    if (input.bound_skill_ids && input.bound_skill_ids.length > 0) {
      output.skills = await this.enrichMatchedSkills(input.bound_skill_ids);
      output.detail = 'local_hit';
      return true;
    }

    // ===== 缓存命中水合（重复任务零 LLM；bypass_cache 强制全量重排；含负缓存命中） =====
    const cached = input.bypass_cache
      ? { record: null, query: await this.matchCache.embedOf(input.task_content ?? '', (t) => this.embedTask(t, context)) }
      : await this.matchCache.lookup(input.task_content ?? '', (t) => this.embedTask(t, context));
    const cachedIds = (cached.record?.result ?? []).map((r) => r.id);
    if (cached.record && cachedIds.length === 0) {
      // ===== 修改后（2026-09-24 trace 3eea3bea 根治）：重复即沉淀 ——
      // 负缓存（LLM 曾判"不沉淀"）命中即计数；同任务第二次出现时清除负缓存走全链
      // （行为信号替代 LLM 语义猜想：重复提问 = 沉淀价值的可靠实证）。
      // 原实现（负缓存命中直接返回空，TTL 内同任务永久短路扩容）见下方注释保留：
      //   output.skills = []; output.detail = 'negative_cache_hit'; return true;
      if (this.matchCache.countNegativeMiss(input.task_content ?? '')) {
        // 第二次出现：负缓存已清除，fallthrough 走全链（重判 + GitHub/自建扩容）
        _metrics?.info?.('SkillCore 负缓存达到重复阈值：同任务二次出现，强制重判并触发扩容（重复即沉淀）', {
          agent_id, run_id: run_id ?? '', task: String(input.task_content ?? '').slice(0, 80),
        });
      } else {
        output.skills = [];
        output.detail = 'negative_cache_hit';
        return true;
      }
    }
    if (cachedIds.length > 0) {
      const hydrated = await this.hydrateSkillsOrNone(cachedIds);
      if (hydrated.length > 0) {
        output.skills = hydrated;
        output.detail = 'local_hit';
        return true;
      }
      this.matchCache.clear();
    }

    const config = await this.getConfig();
    // 获取可用 Skill 列表
    const skillOutput = new SoSkillOutput();
    await this.skillAccess.soSkill(
      { conditions: [{ field: 'enable', operator: Operator.EQ, value: 1 }] },
      skillOutput, new SkillContext(),
    );
    const availableSkills = skillOutput.list;

    // ===== 第 2 层：LLM 需求判定与排序合并 =====
    // 判定语义（由匹配模板承载）：need 只回答"任务是否需要外部能力/事实/执行"，不看本地库存；
    // 库存匹配由 candidates 单独回答。库存无货 ≠ 任务不需要（否则扩容层死锁）。
    // token 维度传播：判定上下文装入 run_id/work_id/session（llm_call_log 可按 run 归因）
    const judgeCtx = Object.assign(new SkillCoreContext(), {
      run_id: input.run_id ?? '',
      session_id: input.context_id ?? '',
      work_id: input.run_id ?? '',
    });
    const judged = await this.rankSkillsByLLM(agent_id, context_id, run_id, availableSkills, config, input.task_content ?? '', judgeCtx);
    if (judged === null) {
      // 模板/LLM 失败：保守返回空（不写负缓存、不触发外部获取，可重试）
      output.skills = [];
      output.detail = 'judge_failed';
      _metrics?.warn?.('SkillCore 任务判定失败（模板/LLM 异常，保守空返回，不落负缓存）', { agent_id, run_id: input.run_id ?? '' });
      return true;
    }
    // ===== 修改后（2026-09-24 trace 3eea3bea 复盘）：绑定与 need 解耦 =====
    // need 从"绑定门禁"降级为"扩容门禁"——有合格候选即绑定（原实现 need=false 连本地命中也短路）；
    // need=false 仅在"本地无合格候选"时拦住外部扩容（沉淀价值判定：纯对话/一次性问答不沉淀）。
    const ranked = filterByThreshold(judged.candidates, config.score_threshold ?? ScoreThreshold.Default)
      .map((c) => this.toSkillEntry(c, availableSkills))
      .filter((e): e is MatchedSkillEntry => e != null);

    // ===== 本地命中 → 入缓存返回（need 无关：有匹配就绑） =====
    if (ranked.length > 0) {
      await this.commitMatchCache(input.task_content ?? '', cached.query, ranked, context);
      output.skills = ranked;
      output.detail = 'local_hit';
      return true;
    }

    if (!judged.need) {
      // 本地无匹配 + 判定不值得沉淀：仅 LLM 显式判定（confirmed）才落负缓存；
      // 解析失败/空数组兜底（confirmed=false）视为判定不可靠，不得固化
      output.skills = [];
      if (judged.confirmed) {
        output.detail = 'judged_unneeded';
        await this.commitMatchCache(input.task_content ?? '', cached.query, [], context);
      } else {
        output.detail = 'parse_failed';
        _metrics?.warn?.('SkillCore 判定输出解析失败（不写负缓存，避免固化错误结论）', { agent_id, run_id: input.run_id });
      }
      return true;
    }

    // ===== 第 3 层：GitHub 外部检索（need=true 且本地无合格者；keywords 空时以任务文本兜底） =====
    const searchWords = judged.keywords.length > 0
      ? judged.keywords
      : [String(input.task_content ?? '').slice(0, 64)];
    const imported = await this.importSkillFromGitHub(searchWords, config, context);
    if (imported) {
      output.skills = [imported];
      output.detail = 'github_imported';
      return true;
    }

    // ===== 第 4 层：完整自建（GitHub 也无果；auto_generate_enabled 可关） =====
    if (!config.auto_generate_enabled) {
      output.skills = [];
      output.detail = 'github_miss_generate_disabled';
      _metrics?.warn?.('SkillCore 本地与 GitHub 均无合格命中，且自动生成已关闭', { agent_id, keywords: searchWords });
      return true;
    }
    const generated = await this.generateSkill(agent_id, input.task_content ?? '', context);
    output.skills = generated;
    output.detail = generated.length > 0 ? 'generated' : 'generate_failed';
    if (generated.length === 0) {
      _metrics?.warn?.('SkillCore 自生成未产出可用技能（LLM 输出解析或落库失败）', { agent_id, run_id: input.run_id });
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // optSkill
  // ---------------------------------------------------------------------------

  /**
   * 记录 Skill 使用（usage 是评估依据，非绑定；绑定由 Agent 模块评估后经 bindAgentComponent 写入）。
   *
   * 以 (agent_id, skill_id) 为键写入 skill_usage；output.binding 兼容保留（id 恒为空串）。
   */
  async optSkill(input: OptSkillInput, output: OptSkillOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const { agent_id, skill_id } = input;
    if (!agent_id) {
      throw new ValidationError('agent_id 为必填');
    }
    if (!skill_id) {
      throw new ValidationError('skill_id 为必填');
    }

    await this.recordSkillUsage(agent_id, skill_id);

    const now = IdGenerator.now();
    output.binding = { id: '', created: now, updated: now, agent_id, skill_id };
    return true;
  }

  // ---------------------------------------------------------------------------
  // ageSkill
  // ---------------------------------------------------------------------------

  /**
   * 按 skill_opt_rule 规则评估解绑候选（不删除；解绑由 Agent 模块评估后执行）。
   *
   * 对每条规则（days/min_usage_count），统计最近 days 天内使用不足 min_usage_count 的
   * (agent_id, skill_id) 对，输出 stale_skills 供 Agent 模块 unbindAgentComponent 消费。
   */
  async ageSkill(_input: AgeSkillInput, output: AgeSkillOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.stale_skills = await this.soStaleSkillUsages();
    output.aged_count = output.stale_skills.length;
    return true;
  }

  /** 统计解绑候选（数据处理；按规则窗口内 (agent_id, skill_id) 使用计数） */
  private async soStaleSkillUsages(): Promise<Array<{ agent_id: string; skill_id: string; usage_count: number }>> {
    const rules = await this.relationDb.select(SKILL_OPT_RULE_TABLE, {});
    if (rules.length === 0) {
      return [];
    }
    const stale: Array<{ agent_id: string; skill_id: string; usage_count: number }> = [];
    for (const rule of rules) {
      const days = Number(rule.days);
      const minUsage = Number(rule.min_usage_count);
      const since = IdGenerator.now() - days * 24 * 60 * 60 * 1000;
      const rows = this.relationDb.queryRaw<{ agent_id: string; skill_id: string; total: number }>(
        `SELECT "agent_id", "skill_id", SUM("usage_count") AS total FROM "${SKILL_USAGE_TABLE}"
         WHERE "created" >= ? GROUP BY "agent_id", "skill_id" HAVING SUM("usage_count") < ?`,
        [since, minUsage],
      );
      for (const row of rows ?? []) {
        stale.push({ agent_id: String(row.agent_id), skill_id: String(row.skill_id), usage_count: Number(row.total ?? 0) });
      }
    }
    return stale;
  }

  // ---------------------------------------------------------------------------
  // soSkillRule
  // ---------------------------------------------------------------------------

  /**
   * 查询 Skill 优化规则。
   */
  async soSkillRule(input: SoSkillRuleInput, output: SoSkillRuleOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(SKILL_OPT_RULE_TABLE, {
      conditions: input.conditions,
      order_by: input.order_by,
      page: input.page,
    });
    const total = await this.relationDb.count(
      SKILL_OPT_RULE_TABLE,
      input.conditions,
    );
    output.list = rows.map((r: Record<string, unknown>) => this.toSkillOptRuleRecord(r));
    output.total = total;
    return true;
  }

  // ---------------------------------------------------------------------------
  // updateSkillRule
  // ---------------------------------------------------------------------------

  /**
   * 批量更新 Skill 优化规则（事务）。
   */
  async updateSkillRule(input: UpdateSkillRuleInput, _output: UpdateSkillRuleOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.operations || input.operations.length === 0) {
      throw new ValidationError('operations 为必填');
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
  // configSkillCore
  // ---------------------------------------------------------------------------

  /**
   * 获取或更新 skill_core_config 配置（SET 语义）。
   */
  async configSkillCore(input: ConfigSkillCoreInput, output: ConfigSkillCoreOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.regen_rate !== undefined || input.similarity_threshold !== undefined || input.prompt_template_id !== undefined || input.score_threshold !== undefined || input.vector_similarity_threshold !== undefined || input.github_token !== undefined || input.github_search_enabled !== undefined || input.auto_generate_enabled !== undefined) {
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
      // ===== 2026-09-22：四层瀑布配置（GitHub 检索 / 完整自建） =====
      if (input.github_token !== undefined) {
        updateData.push({ field: 'github_token', value: input.github_token });
      }
      if (input.github_search_enabled !== undefined) {
        updateData.push({ field: 'github_search_enabled', value: input.github_search_enabled ? 1 : 0 });
      }
      if (input.auto_generate_enabled !== undefined) {
        updateData.push({ field: 'auto_generate_enabled', value: input.auto_generate_enabled ? 1 : 0 });
      }
      await this.configStore.upsert(updateData);
    }
    // ===== 2026-09-11：配置变更即清缓存 + 应用缓存参数 =====
    await this.applyMatchCacheConfig();
    const config = await this.getConfig();
    output.regen_rate = config.regen_rate;
    output.prompt_template_id = config.prompt_template_id;
    output.github_token = config.github_token;
    output.github_search_enabled = config.github_search_enabled;
    output.auto_generate_enabled = config.auto_generate_enabled;
    return true;
  }

  // ---------------------------------------------------------------------------
  // 内部辅助方法
  // ---------------------------------------------------------------------------

  /** 获取 skill_core_config 记录（不存在则返回默认值） */
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

  private async getConfig(): Promise<SkillCoreConfigRecord> {
    return (await this.configStore.load()) ?? {
      id: '',
      created: 0,
      updated: 0,
      regen_rate: 75,
      similarity_threshold: 0.7,
      prompt_template_id: '',
      score_threshold: ScoreThreshold.Default,
      vector_similarity_threshold: VectorSimilarity.Default,
      match_cache_ttl_ms: MatchCache.TtlMs,
      match_cache_capacity: MatchCache.Capacity,
      github_token: '',
      github_search_enabled: true,
      auto_generate_enabled: true,
    };
  }

  /** 记录 skill_usage（评估依据；键为 (agent_id, skill_id)，与绑定解耦） */
  private async recordSkillUsage(agentId: string, skillId: string): Promise<void> {
    const now = IdGenerator.now();
    await this.relationDb.insert(SKILL_USAGE_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'agent_id', value: agentId },
      { field: 'skill_id', value: skillId },
      { field: 'usage_date', value: new Date().toISOString().slice(0, 10) },
      { field: 'usage_count', value: 1 },
    ]);
  }

  /**
   * 渲染匹配 Prompt（逻辑控制）：DB 渲染 builtin/自定义模板（无硬编码内存回退）。
   * 模板缺失/渲染失败 fail-loud（配置中心可见可修）。
   */
  private async renderPrompt(
    templateId: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    const id = templateId || await this.soMatchPromptTemplateId();
    try {
      const promptOutput = new ExecPromptOutput();
      await this.promptsAccess.execPrompt(
        { id, variables },
        promptOutput, new PromptContext(),
      );
      if (promptOutput.prompt) return promptOutput.prompt;
    } catch { /* 下沉 fail-loud */ }
    throw new ProcessingError(`Prompt 模板不可用或渲染为空: ${id}`);
  }

  /** 获取 Skill 匹配模板 ID（逻辑控制） */
  // ===== 原始方法（保留作为参考；2026-09-23 被上方修改后版本替代：原版 LIKE 命中不区分 is_system，
  // 用户自建同标题模板会劫持隐式回退，旧契约输出导致 need=false 误降级——真机取证见 [2026-09-22r]）=====
  // private async soMatchPromptTemplateId(): Promise<string> {
  //   const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
  //     { field: 'prompt_template_title', operator: Operator.LIKE, value: '%Skill 匹配%' },
  //   ]);
  //   if (row && row.id) return String(row.id);
  //   const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
  //     { field: 'enable', operator: Operator.EQ, value: 1 },
  //   ]);
  //   if (anyRow && anyRow.id) return String(anyRow.id);
  //   throw new ProcessingError('未找到 Skill 匹配提示词模板');
  // }

  // ===== 修改后（2026-09-23）：隐式回退优先 is_system=1 的 builtin 契约模板；
  // 用户自定义模板应通过 config.prompt_template_id 显式指定，不再被同标题用户行劫持 =====
  private async soMatchPromptTemplateId(): Promise<string> {
    const builtin = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.LIKE, value: '%Skill 匹配%' },
      { field: 'is_system', operator: Operator.EQ, value: 1 },
    ]);
    if (builtin && builtin.id) return String(builtin.id);
    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'prompt_template_title', operator: Operator.LIKE, value: '%Skill 匹配%' },
    ]);
    if (row && row.id) return String(row.id);
    const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (anyRow && anyRow.id) return String(anyRow.id);
    throw new ProcessingError('未找到 Skill 匹配提示词模板');
  }

  // ===== 修改后的方法（2026-09-11）：统一 LLM 排序调用（shutdown 快、max_tokens 上限、返回文本给 RankingParser） =====
  /** 排序 LLM 调用（逻辑控制；失败返回空串 → 调用方走 threshold 兜底语义） */
    private async soRankLLM(input: ExecLLMInput, matchCtx?: Context): Promise<string> {
    // Token 归因维度：Skill 选择 LLM 打分入账（业务维度随 Context 传播，caller 供分来源统计）
    input.session_id = input.session_id || matchCtx?.session_id || '';
    input.run_id = input.run_id || matchCtx?.run_id || '';
    input.work_id = input.work_id || matchCtx?.work_id || '';
    input.caller = 'SkillCoreService.rankSkills';
    // ===== 2026-09-11：排序调用统一禁用深度思考（provider 对 max_tokens 不约束思考输出是延迟尾部主因） =====
    input.extra = { ...(input.extra ?? {}), thinking: { type: 'disabled' } };
    const llmOutput = new ExecLLMOutput();
    try {
      const ok = await this.llmAccess.execLLM(input, llmOutput, matchCtx ?? new LLMContext());
      return ok ? (llmOutput.result ?? '') : '';
    } catch {
      return '';
    }
  }

  // ===== 修改后（2026-09-22）：需求判定与排序合并（need/keywords/candidates 契约） =====
  /**
   * LLM 需求判定与排序（逻辑控制）：统一 need/keywords/candidates 契约输出。
   * need=true 无合格候选时由调用方触发外部获取层。
   */
  private async rankSkillsByLLM(
    agentId: string,
    contextId: string,
    runId: string,
    availableSkills: Array<{ id: string; skill_brief: string; skill_md?: string; name?: string }>,
    config: SkillCoreConfigRecord,
    taskContent: string,
    matchCtx?: Context,
  ): Promise<NeedRankingResult | null> {
    // 模板渲染失败/LLM 失败统一降级 null（调用方保守返回空，不触发外部获取、不写负缓存）
    try {
      const skillsJson = JSON.stringify(
        availableSkills.map((s) => ({ id: s.id, name: s.name ?? '', skill_brief: s.skill_brief })),
      );
      const promptText = await this.renderPrompt(config.prompt_template_id, {
        agent_id: agentId,
        context_id: contextId,
        run_id: runId,
        task_content: taskContent,
        skills: skillsJson,
      });
      const result = await this.soRankLLM({
        id: '',
        prompt: promptText,
        temperature: 0.1,
        max_tokens: 300,
      } as ExecLLMInput, matchCtx);
      if (!result) {
        return null;
      }
      return parseNeedRankingResult(result);
    } catch {
      return null;
    }
  }

  /** 候选 → MatchedSkillEntry（数据处理；未知 id 丢弃） */
  private toSkillEntry(candidate: RankedCandidate, skills: Array<{ id: string; skill_brief: string }>): MatchedSkillEntry | null {
    const skill = skills.find((s) => s.id === candidate.id);
    if (!skill) {
      return null;
    }
    return { skill_id: skill.id, skill_brief: skill.skill_brief, relevance: candidate.score / 100 };
  }

  // ===== 原始方法（保留作为参考；2026-09-22 升级为完整自建 generateSkill + 新增 importSkillFromGitHub）=====
  // /** 第 3 层 Skill 自生成（逻辑控制；原 matchSkill 内联生成逻辑抽出复用） */
  // private async generateSkill(agentId: string, matchCtx?: Context): Promise<MatchedSkillEntry[]> {
  //   const genPrompt = `Based on agent_id: ${agentId}, please generate a new skill name, brief description, and markdown code block for this task. Return JSON: {"name": "...", "skill_brief": "...", "skill_md": "..."}`;
  //   const genRes = await this.soRankLLM({ id: '', prompt: genPrompt, max_tokens: 600 } as ExecLLMInput, matchCtx);
  //   const parsed = JsonParser.parseObject(genRes);
  //   if (!parsed || !parsed.name) {
  //     return [];
  //   }
  //   const addOut = new SoSkillOutput();
  //   await this.skillAccess.addSkill(
  //     {
  //       data: {
  //         name: String(parsed.name),
  //         skill_brief: String(parsed.skill_brief || ''),
  //         skill_md: String(parsed.skill_md || ''),
  //         enable: true,
  //       },
  //     } as AddSkillInput,
  //     addOut as unknown as AddSkillOutput, new SkillContext(),
  //   );
  //   const newSkillId = (addOut as unknown as { id?: string }).id;
  //   if (!newSkillId) {
  //     return [];
  //   }
  //   return [{ skill_id: String(newSkillId), skill_brief: String(parsed.skill_brief || ''), relevance: 1.0 }];
  // }

  /**
   * 第 3 层 GitHub 外部检索导入（逻辑控制；github_search_enabled 可关，未注入客户端时跳过）。
   * 命中 → addSkill 落库（enable=true，流程闭环）→ 返回 MatchedSkillEntry；未命中/失败返回 null。
   */
  private async importSkillFromGitHub(
    keywords: string[],
    config: SkillCoreConfigRecord,
    _matchCtx?: Context,
  ): Promise<MatchedSkillEntry | null> {
    if (!config.github_search_enabled || !this.githubClient || keywords.length === 0) {
      return null;
    }
    const hits = await this.githubClient.searchSkills(keywords, config.github_token ?? '');
    for (const hit of hits) {
      const parsed = await this.githubClient.fetchSkillMd(hit, config.github_token ?? '');
      if (!parsed) continue;
      const entry = await this.addImportedSkill(parsed);
      if (entry) return entry;
    }
    return null;
  }

  /** GitHub 命中内容落库（数据处理；失败返回 null） */
  private async addImportedSkill(parsed: ParsedSkillMd): Promise<MatchedSkillEntry | null> {
    const addOut = new AddSkillOutput();
    await this.skillAccess.addSkill(
      {
        data: {
          name: parsed.name,
          skill_brief: parsed.skill_brief,
          skill_md: parsed.skill_md,
          enable: true,
        },
      } as AddSkillInput,
      addOut, new SkillContext(),
    );
    if (!addOut.id) {
      return null;
    }
    return { skill_id: addOut.id, skill_brief: parsed.skill_brief, relevance: 1.0 };
  }

  // ===== 修改后（2026-09-22）：第 4 层完整自建 —— skill_md + scripts + references（原来仅纯 skill_md）=====
  // ===== 修改后（2026-09-23）：系统级任务允许生成 main.py / main.sh（LocalSandbox 有真实 IO）；
  // 原提示词硬编码 main.js（IsolatedVMSandbox 无 IO），自建 Skill 永远无法做本机观测类任务（原始文案见 git 历史）=====
  /** 第 4 层 Skill 完整自建（逻辑控制；落库 enable=true，下次任务本地可命中） */
  private async generateSkill(agentId: string, taskContent: string, matchCtx?: Context): Promise<MatchedSkillEntry[]> {
    const genPrompt = [
      'Based on the task below, generate a complete reusable skill.',
      'Return JSON only: {"name": "...", "skill_brief": "...", "skill_md": "full SKILL.md content in markdown",',
      ' "scripts": [{"name": "main.js or main.py or main.sh", "content": "..."}], "references": [{"name": "notes.md", "content": "..."}]}.',
      'Rules: skill_md contains trigger conditions, usage instructions and workflow (markdown).',
      'scripts: only when executable logic helps.',
      'For pure computation use JavaScript ("main.js", sandboxed, no IO, entry function executed against params).',
      'For system-level tasks (hardware / disk / memory / network / environment inspection) use Python ("main.py", stdlib only) or Bash ("main.sh"): read the local machine and print exactly ONE JSON object to stdout (keep stderr silent).',
      'references: optional supporting documents. Keep each file under 20000 chars, at most 3 files per directory.',
      '',
      `agent_id: ${agentId}`,
      `task: ${taskContent}`,
    ].join('\n');
    const genRes = await this.soRankLLM({ id: '', prompt: genPrompt, max_tokens: GENERATE_MAX_TOKENS } as ExecLLMInput, matchCtx);
    const parsed = JsonParser.parseObject(genRes);
    if (!parsed || !parsed.name) {
      return [];
    }
    const addOut = new AddSkillOutput();
    await this.skillAccess.addSkill(
      {
        data: {
          name: String(parsed.name),
          skill_brief: String(parsed.skill_brief || ''),
          skill_md: String(parsed.skill_md || ''),
          scripts: this.toFileEntries(parsed.scripts),
          references: this.toFileEntries(parsed.references),
          enable: true,
        },
      } as AddSkillInput,
      addOut, new SkillContext(),
    );
    if (!addOut.id) {
      return [];
    }
    return [{ skill_id: addOut.id, skill_brief: String(parsed.skill_brief || ''), relevance: 1.0 }];
  }

  /** LLM 生成的文件清单 → FileEntry[]（数据处理；截断超限文件，防提示词注入撑爆存储） */
  private toFileEntries(raw: unknown): FileEntry[] | undefined {
    if (!Array.isArray(raw)) return undefined;
    const entries: FileEntry[] = [];
    for (const item of raw.slice(0, GENERATED_FILE_MAX_COUNT)) {
      const name = String((item as Record<string, unknown>)?.name ?? '').trim();
      const content = String((item as Record<string, unknown>)?.content ?? '').slice(0, GENERATED_FILE_MAX_CHARS);
      if (name && content) entries.push({ name, content });
    }
    return entries.length > 0 ? entries : undefined;
  }

  // ===== 修改后（2026-09-22）：负缓存支持 —— need=false 时空结果也入缓存（重复任务零 LLM） =====
  /** 匹配缓存提交（数据处理；ranked 为空即负缓存条目，仅参与 MD5/向量命中直接返回空） */
  private async commitMatchCache(taskContent: string, embedding: number[] | null, ranked: MatchedSkillEntry[], matchCtx?: Context): Promise<void> {
    if (!taskContent) {
      return;
    }
    const query = embedding?.length ? embedding : await this.matchCache.embedOf(taskContent, (t) => this.embedTask(t, matchCtx).catch(() => [] as number[]));
    this.matchCache.commit(
      buildCacheKey(taskContent),
      query ?? [],
      ranked.map((r) => ({ id: r.skill_id, score: Math.round(r.relevance * 100) })),
    );
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

  /** 缓存命中的 Skill 水合（数据处理；全部失效时返回空数组由调用方清缓存） */
  private async hydrateSkillsOrNone(skillIds: string[]): Promise<MatchedSkillEntry[]> {
    const ranked: MatchedSkillEntry[] = [];
    for (const id of skillIds) {
      const hydrated = await this.hydrateSkillOrNone(id);
      if (hydrated) {
        ranked.push(hydrated);
      }
    }
    return ranked;
  }

  /** 单 Skill 水合（数据处理；失效返回 null） */
  private async hydrateSkillOrNone(skillId: string): Promise<MatchedSkillEntry | null> {
    const skillOutput = new SoSkillOutput();
    await this.skillAccess.soSkill(
      { conditions: [{ field: 'id', operator: Operator.EQ, value: skillId }] },
      skillOutput, new SkillContext(),
    );
    if (!skillOutput.list.length) {
      return null;
    }
    return { skill_id: skillId, skill_brief: skillOutput.list[0].skill_brief, relevance: 1 };
  }

  /** 将既有绑定（agent 表 skill_ids_json）水合为 MatchedSkillEntry 列表（从 Skill 表补充 brief；失效 id 过滤） */
  private async enrichMatchedSkills(
    skillIds: string[],
  ): Promise<MatchedSkillEntry[]> {
    const result: MatchedSkillEntry[] = [];
    for (const skillId of skillIds) {
      const skillOutput = new SoSkillOutput();
      await this.skillAccess.soSkill(
        {
          conditions: [
            { field: 'id', operator: Operator.EQ, value: skillId },
          ],
        },
        skillOutput, new SkillContext(),
      );
      if (skillOutput.list.length > 0) {
        result.push({
          skill_id: skillId,
          skill_brief: skillOutput.list[0].skill_brief,
          relevance: 1,
        });
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 记录转换
  // ---------------------------------------------------------------------------

  private toSkillCoreConfigRecord(row: Record<string, unknown>): SkillCoreConfigRecord {
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      regen_rate: Number(row.regen_rate),
      similarity_threshold: Number(row.similarity_threshold ?? 0.7),
      prompt_template_id: String(row.prompt_template_id ?? ''),
      score_threshold: Number(row.score_threshold ?? ScoreThreshold.Default),
      vector_similarity_threshold: Number(row.vector_similarity_threshold ?? VectorSimilarity.Default),
      match_cache_ttl_ms: Number(row.match_cache_ttl_ms ?? MatchCache.TtlMs),
      match_cache_capacity: Number(row.match_cache_capacity ?? MatchCache.Capacity),
      github_token: String(row.github_token ?? ''),
      github_search_enabled: this.toConfigBoolean(row.github_search_enabled, true),
      auto_generate_enabled: this.toConfigBoolean(row.auto_generate_enabled, true),
    };
  }

  /** 配置布尔解析（数据处理；SQLite INTEGER 0/1，未定义回退默认值） */
  private toConfigBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null || value === '') return defaultValue;
    return value === 1 || value === '1' || value === true || value === 'true';
  }

  private toSkillOptRuleRecord(row: Record<string, unknown>): SkillOptRuleRecord {
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      days: Number(row.days),
      min_usage_count: Number(row.min_usage_count),
    };
  }
}
