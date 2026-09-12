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
import { SkillContext, SoSkillOutput, PromptContext, GetPromptInput, GetPromptOutput, ExecPromptOutput, LLMContext, ExecLLMInput, ExecLLMOutput, EmbedLLMInput, EmbedLLMOutput, Operator, OperationType, IdGenerator, JsonParser, ValidationError, PROMPT_IDS } from '@brian-agent/base';
import type { DataObject } from '@brian-agent/base';
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
import { parseRankingCandidates, filterByThreshold, type RankedCandidate } from '../../shared/RankingParser';
import { MatchCache, ScoreThreshold, VectorSimilarity } from '../../shared/MatchConstants';

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
   * 为 Agent 匹配 Skill（三层统一匹配/选择/自生成逻辑）。
   */
  async matchSkill(input: MatchSkillInput, output: MatchSkillOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const { agent_id, context_id, interact_id } = input;
    if (!agent_id) {
      throw new ValidationError('agent_id 为必填');
    }

    // ===== 第 1 层：调用方传入的既有绑定（agent 表为唯一绑定事实源）→ 确定性水合 =====
    if (input.bound_skill_ids && input.bound_skill_ids.length > 0) {
      output.skills = await this.enrichMatchedSkills(input.bound_skill_ids);
      return true;
    }

    // ===== 缓存命中水合（重复任务零 LLM；bypass_cache 强制全量重排） =====
    const cached = input.bypass_cache
      ? { record: null, query: await this.matchCache.embedOf(input.task_content ?? '', (t) => this.embedTask(t)) }
      : await this.matchCache.lookup(input.task_content ?? '', (t) => this.embedTask(t));
    const cachedIds = (cached.record?.result ?? []).map((r) => r.id);
    if (cachedIds.length > 0) {
      const hydrated = await this.hydrateSkillsOrNone(cachedIds);
      if (hydrated.length > 0) {
        output.skills = hydrated;
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

    // ===== 第 1.5 层：simpleSimilarity 匹配历史/关联特征（纯打分，不落库） =====
    // ===== 第 2 层：LLM 打分推荐 =====
    // ===== 修改后（2026-09-11）：score_threshold 淘汰后的空结果 = "无合格组件"，不再逐题自生成（防生成风暴）；
    // Layer-3 自生成仅在库内无可启用 Skill 时进行 =====
    let ranked: Array<{ skill_id: string; skill_brief: string; relevance: number }> = [];
    if (availableSkills.length === 0) {
      ranked = await this.generateSkill(agent_id);
    } else {
      ranked = await this.rankSkillsByLLM(agent_id, context_id, interact_id, availableSkills, config, input.task_content ?? '');
    }

    // ===== 匹配结果入缓存（MD5 + 任务向量；复用 lookup 阶段向量） =====
    if (availableSkills.length > 0 && ranked.length > 0) {
      await this.commitMatchCache(input.task_content ?? '', cached.query, ranked);
    }
    output.skills = ranked;
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
    // ===== 2026-09-11：配置变更即清缓存 + 应用缓存参数 =====
    await this.applyMatchCacheConfig();
    const config = await this.getConfig();
    output.regen_rate = config.regen_rate;
    output.prompt_template_id = config.prompt_template_id;
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
    const id = templateId || PROMPT_IDS.skillMatch;
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

  // ===== 修改后的方法（2026-09-11）：统一 LLM 排序调用（shutdown 快、max_tokens 上限、返回文本给 RankingParser） =====
  /** 排序 LLM 调用（逻辑控制；失败返回空串 → 调用方走 threshold 兜底语义） */
    private async soRankLLM(input: ExecLLMInput): Promise<string> {
    // ===== 2026-09-11：排序调用统一禁用深度思考（provider 对 max_tokens 不约束思考输出是延迟尾部主因） =====
    input.extra = { ...(input.extra ?? {}), thinking: { type: 'disabled' } };
    const llmOutput = new ExecLLMOutput();
    try {
      const ok = await this.llmAccess.execLLM(input, llmOutput, new LLMContext());
      return ok ? (llmOutput.result ?? '') : '';
    } catch {
      return '';
    }
  }

  /**
   * LLM 排序（逻辑控制）：统一 `[{"id","score"}]` 百分制输出 + score_threshold 截断。
   */
  private async rankSkillsByLLM(
    agentId: string,
    contextId: string,
    interactId: string,
    availableSkills: Array<{ id: string; skill_brief: string; skill_md?: string; name?: string }>,
    config: SkillCoreConfigRecord,
    taskContent: string,
  ): Promise<MatchedSkillEntry[]> {
    const skillsJson = JSON.stringify(
      availableSkills.map((s) => ({ id: s.id, name: s.name ?? '', skill_brief: s.skill_brief })),
    );
    const promptText = await this.renderPrompt(config.prompt_template_id, {
      agent_id: agentId,
      context_id: contextId,
      interact_id: interactId,
      task_content: taskContent,
      skills: skillsJson,
    });
    const result = await this.soRankLLM({
      id: '',
      prompt: promptText,
      temperature: 0.1,
      max_tokens: 300,
    } as ExecLLMInput);
    const threshold = config.score_threshold ?? ScoreThreshold.Default;
    return filterByThreshold(parseRankingCandidates(result), threshold)
      .map((c) => this.toSkillEntry(c, availableSkills))
      .filter((e): e is MatchedSkillEntry => e != null);
  }

  /** 候选 → MatchedSkillEntry（数据处理；未知 id 丢弃） */
  private toSkillEntry(candidate: RankedCandidate, skills: Array<{ id: string; skill_brief: string }>): MatchedSkillEntry | null {
    const skill = skills.find((s) => s.id === candidate.id);
    if (!skill) {
      return null;
    }
    return { skill_id: skill.id, skill_brief: skill.skill_brief, relevance: candidate.score / 100 };
  }

  /** 第 3 层 Skill 自生成（逻辑控制；原 matchSkill 内联生成逻辑抽出复用） */
  private async generateSkill(agentId: string): Promise<MatchedSkillEntry[]> {
    const genPrompt = `Based on agent_id: ${agentId}, please generate a new skill name, brief description, and markdown code block for this task. Return JSON: {"name": "...", "skill_brief": "...", "skill_md": "..."}`;
    const genRes = await this.soRankLLM({ id: '', prompt: genPrompt, max_tokens: 600 } as ExecLLMInput);
    const parsed = JsonParser.parseObject(genRes);
    if (!parsed || !parsed.name) {
      return [];
    }
    const addOut = new SoSkillOutput();
    await this.skillAccess.addSkill(
      {
        data: {
          name: String(parsed.name),
          skill_brief: String(parsed.skill_brief || ''),
          skill_md: String(parsed.skill_md || ''),
          enable: true,
        },
      } as any,
      addOut as any, new SkillContext(),
    );
    const newSkillId = (addOut as any).id;
    if (!newSkillId) {
      return [];
    }
    return [{ skill_id: String(newSkillId), skill_brief: String(parsed.skill_brief || ''), relevance: 1.0 }];
  }

  /** 匹配缓存提交（数据处理；向量缺失时以空向量入库 —— 仅参与 MD5 一级命中） */
  private async commitMatchCache(taskContent: string, embedding: number[] | null, ranked: MatchedSkillEntry[]): Promise<void> {
    if (!taskContent || ranked.length === 0) {
      return;
    }
    const query = embedding?.length ? embedding : await this.matchCache.embedOf(taskContent, (t) => this.embedTask(t).catch(() => [] as number[]));
    this.matchCache.commit(
      buildCacheKey(taskContent),
      query ?? [],
      ranked.map((r) => ({ id: r.skill_id, score: Math.round(r.relevance * 100) })),
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
    };
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
