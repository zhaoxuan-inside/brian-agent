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

const GENERATE_MAX_TOKENS = 3000;

const GENERATED_FILE_MAX_COUNT = 3;

const GENERATED_FILE_MAX_CHARS = 20000;

export class SkillCoreService {

  private readonly configStore: SingleRowConfigStore<SkillCoreConfigRecord>;

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

  async matchSkill(input: MatchSkillInput, output: MatchSkillOutput, context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const { agent_id, context_id, run_id } = input;
    if (!agent_id) {
      throw new ValidationError('agent_id 为必填');
    }
    output.system_skills = await this.soSystemSkills();
    if (await this.tryMatchBoundSkills(input, output)) {
      return true;
    }
    const cacheState = await this.tryMatchFromCache(input, output, context, _metrics);
    if (cacheState.handled) {
      return true;
    }
    const config = await this.getConfig();
    const availableSkills = await this.soAvailableSkills();
    const judged = await this.judgeSkillsOrReportFailure(input, output, agent_id, context_id, run_id, availableSkills, config, _metrics);
    if (judged === null) {
      return true;
    }
    if (await this.tryMatchRankedSkills(input, output, judged, config, availableSkills, cacheState.query, context)) {
      return true;
    }
    if (!judged.need) {
      await this.handleJudgedUnneeded(input, output, judged, cacheState.query, context, _metrics);
      return true;
    }
    await this.matchFromExternalSources(input, output, agent_id, judged, config, context, _metrics);
    return true;
  }

  private async tryMatchBoundSkills(input: MatchSkillInput, output: MatchSkillOutput): Promise<boolean> {
    if (input.bound_skill_ids && input.bound_skill_ids.length > 0) {
      const precipitatedIds = input.bound_skill_ids.filter((id) => !id.startsWith('skill_builtin-'));
      if (precipitatedIds.length > 0) {
        output.skills = await this.enrichMatchedSkills(precipitatedIds);
        output.detail = 'local_hit';
        return true;
      }
    }
    return false;
  }

  private async tryMatchFromCache(
    input: MatchSkillInput,
    output: MatchSkillOutput,
    context: SkillCoreContext,
    metrics?: Metrics,
  ): Promise<{ handled: boolean; query: number[] | null }> {
    const cached = input.bypass_cache
      ? { record: null, query: await this.matchCache.embedOf(input.task_content ?? '', (t) => this.embedTask(t, context)) }
      : await this.matchCache.lookup(input.task_content ?? '', (t) => this.embedTask(t, context));
    const cachedIds = (cached.record?.result ?? []).map((r) => r.id);
    if (cached.record && cachedIds.length === 0 && await this.handleNegativeCache(input, output, metrics)) {
      return { handled: true, query: cached.query };
    }
    if (cachedIds.length > 0) {
      const hydrated = await this.hydrateSkillsOrNone(cachedIds);
      if (hydrated.length > 0) {
        output.skills = hydrated;
        output.detail = 'local_hit';
        return { handled: true, query: cached.query };
      }
      this.matchCache.clear();
    }
    return { handled: false, query: cached.query };
  }

  private async handleNegativeCache(
    input: MatchSkillInput,
    output: MatchSkillOutput,
    metrics?: Metrics,
  ): Promise<boolean> {
    if (this.matchCache.countNegativeMiss(input.task_content ?? '')) {
      metrics?.info?.('SkillCore 负缓存达到重复阈值：同任务二次出现，强制重判并触发扩容（重复即沉淀）', {
        agent_id: input.agent_id, run_id: input.run_id ?? '', task: String(input.task_content ?? '').slice(0, 80),
      });
      return false;
    }
    output.skills = [];
    output.detail = 'negative_cache_hit';
    return true;
  }

  private async soAvailableSkills(): Promise<Array<{ id: string; skill_brief: string; skill_md?: string; name?: string }>> {
    const skillOutput = new SoSkillOutput();
    await this.skillAccess.soSkill(
      { conditions: [
        { field: 'enable', operator: Operator.EQ, value: 1 },
        { field: 'system', operator: Operator.EQ, value: 0 },
      ] },
      skillOutput,
      new SkillContext(),
    );
    return skillOutput.list;
  }

  private async judgeSkillsOrReportFailure(
    input: MatchSkillInput,
    output: MatchSkillOutput,
    agentId: string,
    contextId: string,
    runId: string,
    availableSkills: Array<{ id: string; skill_brief: string; skill_md?: string; name?: string }>,
    config: SkillCoreConfigRecord,
    metrics?: Metrics,
  ): Promise<NeedRankingResult | null> {
    const judgeCtx = Object.assign(new SkillCoreContext(), {
      run_id: input.run_id ?? '',
      session_id: input.context_id ?? '',
      work_id: input.run_id ?? '',
    });
    const judged = await this.rankSkillsByLLM(agentId, contextId, runId, availableSkills, config, input.task_content ?? '', judgeCtx);
    if (judged !== null) {
      return judged;
    }
    output.skills = [];
    output.detail = 'judge_failed';
    metrics?.warn?.('SkillCore 任务判定失败（模板/LLM 异常，保守空返回，不落负缓存）', { agent_id: agentId, run_id: input.run_id ?? '' });
    return null;
  }

  private async tryMatchRankedSkills(
    input: MatchSkillInput,
    output: MatchSkillOutput,
    judged: NeedRankingResult,
    config: SkillCoreConfigRecord,
    availableSkills: Array<{ id: string; skill_brief: string }>,
    cachedQuery: number[] | null,
    context: SkillCoreContext,
  ): Promise<boolean> {
    const ranked = filterByThreshold(judged.candidates, config.score_threshold ?? ScoreThreshold.Default)
      .map((c) => this.toSkillEntry(c, availableSkills))
      .filter((e): e is MatchedSkillEntry => e != null);
    if (ranked.length > 0) {
      await this.commitMatchCache(input.task_content ?? '', cachedQuery, ranked, context);
      output.skills = ranked;
      output.detail = 'local_hit';
      return true;
    }
    return false;
  }

  private async handleJudgedUnneeded(
    input: MatchSkillInput,
    output: MatchSkillOutput,
    judged: NeedRankingResult,
    cachedQuery: number[] | null,
    context: SkillCoreContext,
    metrics?: Metrics,
  ): Promise<void> {
    output.skills = [];
    if (judged.confirmed) {
      output.detail = 'judged_unneeded';
      await this.commitMatchCache(input.task_content ?? '', cachedQuery, [], context);
    } else {
      output.detail = 'parse_failed';
      metrics?.warn?.('SkillCore 判定输出解析失败（不写负缓存，避免固化错误结论）', { agent_id: input.agent_id, run_id: input.run_id });
    }
  }

  private async matchFromExternalSources(
    input: MatchSkillInput,
    output: MatchSkillOutput,
    agentId: string,
    judged: NeedRankingResult,
    config: SkillCoreConfigRecord,
    context: SkillCoreContext,
    metrics?: Metrics,
  ): Promise<void> {
    const searchWords = judged.keywords.length > 0 ? judged.keywords : [String(input.task_content ?? '').slice(0, 64)];
    const imported = await this.importSkillFromGitHub(searchWords, config, context);
    if (imported) {
      output.skills = [imported];
      output.detail = 'github_imported';
      return;
    }
    if (!config.auto_generate_enabled) {
      output.skills = [];
      output.detail = 'github_miss_generate_disabled';
      metrics?.warn?.('SkillCore 本地与 GitHub 均无合格命中，且自动生成已关闭', { agent_id: agentId, keywords: searchWords });
      return;
    }
    const generated = await this.generateSkill(agentId, input.task_content ?? '', context);
    output.skills = generated;
    output.detail = generated.length > 0 ? 'generated' : 'generate_failed';
    if (generated.length === 0) {
      metrics?.warn?.('SkillCore 自生成未产出可用技能（LLM 输出解析或落库失败）', { agent_id: input.agent_id, run_id: input.run_id });
    }
  }

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

  async ageSkill(_input: AgeSkillInput, output: AgeSkillOutput, _context: SkillCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    output.stale_skills = await this.soStaleSkillUsages();
    output.aged_count = output.stale_skills.length;
    return true;
  }

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

    await this.applyMatchCacheConfig();
    const config = await this.getConfig();
    output.regen_rate = config.regen_rate;
    output.prompt_template_id = config.prompt_template_id;
    output.github_token = config.github_token;
    output.github_search_enabled = config.github_search_enabled;
    output.auto_generate_enabled = config.auto_generate_enabled;
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
    } catch {  }
    throw new ProcessingError(`Prompt 模板不可用或渲染为空: ${id}`);
  }

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

    private async soRankLLM(input: ExecLLMInput, matchCtx?: Context): Promise<string> {

    input.session_id = input.session_id || matchCtx?.session_id || '';
    input.run_id = input.run_id || matchCtx?.run_id || '';
    input.work_id = input.work_id || matchCtx?.work_id || '';
    input.caller = 'SkillCoreService.rankSkills';

    input.extra = { ...(input.extra ?? {}), thinking: { type: 'disabled' } };
    const llmOutput = new ExecLLMOutput();
    try {
      const ok = await this.llmAccess.execLLM(input, llmOutput, matchCtx ?? new LLMContext());
      return ok ? (llmOutput.result ?? '') : '';
    } catch {
      return '';
    }
  }

  private async rankSkillsByLLM(
    agentId: string,
    contextId: string,
    runId: string,
    availableSkills: Array<{ id: string; skill_brief: string; skill_md?: string; name?: string }>,
    config: SkillCoreConfigRecord,
    taskContent: string,
    matchCtx?: Context,
  ): Promise<NeedRankingResult | null> {

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

  private toSkillEntry(candidate: RankedCandidate, skills: Array<{ id: string; skill_brief: string }>): MatchedSkillEntry | null {
    const skill = skills.find((s) => s.id === candidate.id);
    if (!skill) {
      return null;
    }
    return { skill_id: skill.id, skill_brief: skill.skill_brief, relevance: candidate.score / 100 };
  }

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

  private async generateSkill(agentId: string, taskContent: string, matchCtx?: Context): Promise<MatchedSkillEntry[]> {
    const genPrompt = [
      'Based on the task below, generate a complete reusable skill.',
      'Return JSON only: {"name": "...", "skill_brief": "...", "skill_md": "full SKILL.md content in markdown",',
      ' "scripts": [{"name": "main.js or main.py or main.sh", "content": "..."}], "references": [{"name": "notes.md", "content": "..."}]}.',
      'Rules: "name" MUST be Chinese, 5-15 Chinese characters, reflecting what the skill does (e.g. "互联网信息搜索").',
      '"skill_brief" MUST be Chinese: one concise sentence describing the skill purpose.',
      'skill_md contains trigger conditions, usage instructions and workflow (markdown).',
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

  private async embedTask(task: string, context?: Context): Promise<number[]> {
    const output = new EmbedLLMOutput();
    const input = Object.assign(new EmbedLLMInput(), { id: '', input: task });
    const ok = await this.llmAccess.embedLLM(input, output, context ?? new LLMContext());
    if (!ok || !output.embedding?.length) {
      throw new ProcessingError('任务向量化失败（embedLLM 无返回）');
    }
    return output.embedding;
  }

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

  private async soSystemSkills(): Promise<MatchedSkillEntry[]> {
    try {
      const skillOutput = new SoSkillOutput();
      await this.skillAccess.soSkill(
        { conditions: [{ field: 'system', operator: Operator.EQ, value: 1 }] },
        skillOutput, new SkillContext(),
      );
      return skillOutput.list.map((s) => ({
        skill_id: s.id,
        skill_brief: s.skill_brief,
        relevance: 1,
      }));
    } catch {

      return [];
    }
  }

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
