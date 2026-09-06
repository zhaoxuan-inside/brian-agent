import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  IdGenerator, Operator, OperationType, ValidationError, NotFoundError, newPatch,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  SoLLMInput, SoLLMOutput,
  PROMPT_IDS, getBuiltinTemplate, renderTemplate,
  type DataObject, type Condition,
} from '@brian-agent/base';
import {
  AGENT_TABLE, AGENT_USAGE_TABLE, AGENT_USAGE_DAILY_TABLE, AGENT_OPT_RULE_TABLE, AGENT_LIBRARY_CONFIG_TABLE,
  VALID_AGENT_TYPES, SYSTEM_AGENT_TYPES,
  type AgentRecord, type AgentLibraryConfigRecord, type AgentOptRuleRecord,
  AgentLibraryContext,
  AddAgentInput, AddAgentOutput,
  MatchAgentInput, MatchAgentOutput,
  UpdateAgentInput, UpdateAgentOutput,
  DelAgentInput, DelAgentOutput,
  ToggleAgentInput, ToggleAgentOutput,
  RecordAgentUsageInput, RecordAgentUsageOutput,
  GetAgentInput, GetAgentOutput,
  AgeAgentInput, AgeAgentOutput,
  GetAgentRuleInput, GetAgentRuleOutput,
  UpdateAgentRuleInput, UpdateAgentRuleOutput,
  ConfigAgentLibraryInput, ConfigAgentLibraryOutput,
  BindAgentComponentInput,
  BindAgentComponentOutput,
  UnbindAgentComponentInput,
  UnbindAgentComponentOutput,
  ComponentKind,
} from '../domain/types';
import {
  simpleSimilarity,
  shouldReuseByRegenRate,
} from '@brian-agent/core';
import { parseJsonObject } from '../../shared/signature';

function toBool(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

function mapAgent(row: Record<string, unknown>): AgentRecord {
  return {
    id: String(row.id),
    created: Number(row.created),
    updated: Number(row.updated),
    agent_id: String(row.agent_id),
    agent_name: String(row.agent_name),
    agent_purpose: String(row.agent_purpose ?? ''),
    agent_type: String(row.agent_type),
    strategy_id: String(row.strategy_id),
    soul_id: String(row.soul_id ?? ''),
    skill_ids: parseIdList(row.skill_ids_json),
    mcp_ids: parseIdList(row.mcp_ids_json),
    prompt_template_id: String(row.prompt_template_id ?? ''),
    task_signature: String(row.task_signature ?? ''),
    usage_count: Number(row.usage_count ?? 0),
    eval_score: Number(row.eval_score ?? 50),
    enable: toBool(row.enable),
  };
}

/** JSON id 列表列解析（数据处理；坏值回退空数组） */
function parseIdList(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export class AgentLibraryService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  async addAgent(input: AddAgentInput, output: AddAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) throw new ValidationError('agent_id 为必填');
    if (!VALID_AGENT_TYPES.includes(input.agent_type as typeof VALID_AGENT_TYPES[number])) {
      throw new ValidationError(`invalid agent_type: ${input.agent_type}`);
    }
    if (!input.strategy_id) throw new ValidationError('strategy_id 为必填');

    const now = IdGenerator.now();
    const insertFields: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'agent_id', value: input.agent_id },
      { field: 'agent_name', value: input.agent_name ?? `Agent-${input.agent_id.slice(0, 8)}` },
      { field: 'agent_type', value: input.agent_type },
      { field: 'strategy_id', value: input.strategy_id },
      { field: 'soul_id', value: input.soul_id ?? '' },
      { field: 'skill_ids_json', value: JSON.stringify(input.skill_ids ?? []) },
      { field: 'mcp_ids_json', value: JSON.stringify(input.mcp_ids ?? []) },
      { field: 'prompt_template_id', value: input.prompt_template_id ?? '' },
      { field: 'task_signature', value: input.task_signature ?? '' },
      { field: 'usage_count', value: 0 },
      { field: 'eval_score', value: 50 },
      { field: 'enable', value: 1 },
    ];
    if (input.agent_purpose !== undefined) {
      insertFields.push({ field: 'agent_purpose', value: input.agent_purpose });
    }

    try {
      await this.relationDb.insert(AGENT_TABLE, insertFields);
    } catch {
      // 容错降级：若内存表未包含 agent_purpose 列则去掉该字段重新插入
      const fallbackFields = insertFields.filter(f => f.field !== 'agent_purpose');
      await this.relationDb.insert(AGENT_TABLE, fallbackFields);
    }
    output.agent_id = input.agent_id;
    return true;
  }

  async matchAgent(input: MatchAgentInput, output: MatchAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const threshold = input.similarity_threshold ?? config?.similarity_threshold ?? 0.7;

    const conditions: Condition[] = [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ];
    if (input.agent_type) {
      conditions.push({ field: 'agent_type', operator: Operator.EQ, value: input.agent_type });
    }
    const rows = await this.relationDb.select(AGENT_TABLE, { conditions });
    const candidates = rows.map(mapAgent);
    if (candidates.length === 0) {
      output.agent_id = '';
      output.similarity_score = 0;
      output.matched_by = '';
      return true;
    }

    // ===== 1. 第一层匹配：简单算法匹配 (simpleSimilarity) + 概率复用判定 =====
    // 匹配面 = 任务签名 + agent_purpose（说明）：说明是为后续 matchAgent 沉淀的匹配依据
    const queryText = input.task_content || input.task_signature;
    let bestScore = 0;
    let bestId = '';
    for (const c of candidates) {
      const score = Math.max(
        simpleSimilarity(input.task_signature, c.task_signature),
        simpleSimilarity(queryText, c.agent_purpose ?? ''),
      );
      if (score > bestScore) {
        bestScore = score;
        bestId = c.agent_id;
      }
    }

    const regenRate = config?.regen_rate ?? 75;
    if (bestScore >= threshold && bestId) {
      if (shouldReuseByRegenRate(regenRate)) {
        output.agent_id = bestId;
        output.similarity_score = bestScore;
        output.matched_by = 'SIMILARITY';
        output.matched = true;
        return true;
      }
      // 命中但失效概率命中：不再尝试复用，交由调用方重构（Agent 重构会重新 match 四组件并生成新说明）
      output.matched = true;
      output.regenerate = true;
      output.similarity_score = bestScore;
      output.agent_id = '';
      return true;
    }

    // ===== 2. 第二层匹配：提交给大模型，由 LLM 基于 Agent 列表用途/名称与提问进行评估打分 =====
    const promptTemplateId = config?.prompt_template_id ?? '';
    const llmMatched = await this.llmMatchAgent(
      input.task_content || input.task_signature,
      candidates,
      promptTemplateId,
    );

    if (llmMatched && llmMatched.score >= threshold && llmMatched.agent_id) {
      const found = candidates.find((c) => c.agent_id === llmMatched.agent_id && toBool(c.enable));
      if (found) {
        output.agent_id = found.agent_id;
        output.similarity_score = llmMatched.score;
        output.matched_by = 'LLM';
        output.matched = true;
        return true;
      }
    }

    // ===== 3. 两层匹配均未命中，触发 Agent 重构 =====
    output.agent_id = '';
    output.similarity_score = Math.max(bestScore, llmMatched?.score ?? 0);
    output.matched_by = '';
    output.matched = false;
    return true;
  }

  // ===== 修改后：新增 agent_purpose 持久化（对应前端"描述"字段）=====
  async updateAgent(input: UpdateAgentInput, _output: UpdateAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const existing = await this.relationDb.selectOne(AGENT_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
    ]);
    if (!existing) throw new NotFoundError('Agent', input.agent_id);

    if (input.eval_score !== undefined) {
      if (input.eval_score < 0 || input.eval_score > 100) {
        throw new ValidationError('eval_score 必须在 0-100 之间');
      }
    }

    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    if (input.agent_name !== undefined) data.push({ field: 'agent_name', value: input.agent_name });
    if (input.agent_purpose !== undefined) data.push({ field: 'agent_purpose', value: input.agent_purpose });
    if (input.task_signature !== undefined) data.push({ field: 'task_signature', value: input.task_signature });
    if (input.eval_score !== undefined) data.push({ field: 'eval_score', value: input.eval_score });
    if (input.enable !== undefined) data.push({ field: 'enable', value: input.enable ? 1 : 0 });
    if (input.strategy_id !== undefined) data.push({ field: 'strategy_id', value: input.strategy_id });
    if (input.soul_id !== undefined) data.push({ field: 'soul_id', value: input.soul_id });

    if (data.length <= 1) return true;
    await this.relationDb.update(
      AGENT_TABLE,
      data,
      [{ field: 'agent_id', operator: Operator.EQ, value: input.agent_id }],
    );
    return true;
  }

  /**
   * 绑定组件到 Agent（绑定唯一事实源：agent 表；幂等 upsert，同 kind 全量替换）。
   *
   * soul/prompt 单值（取 component_ids 首个），skill/mcp 全量列表；由 Agent 模块评估链路调用。
   */
  async bindAgentComponent(input: BindAgentComponentInput, output: BindAgentComponentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const record = await this.soAgentRecordForBinding(input.agent_id);
    const ids = (input.component_ids ?? []).map((v) => String(v).trim()).filter(Boolean);
    const patch = this.prepareBindingPatch(input.component_kind, ids, record);
    await this.relationDb.update(AGENT_TABLE, newPatch(patch), [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
    ]);
    output.bound = ids;
    return true;
  }

  /**
   * 解绑 Agent 组件（幂等；component_ids 缺省解绑该类全部）。
   */
  async unbindAgentComponent(input: UnbindAgentComponentInput, output: UnbindAgentComponentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const record = await this.soAgentRecordForBinding(input.agent_id);
    const current = this.soCurrentBinding(record, input.component_kind);
    const removeSet = new Set((input.component_ids ?? current));
    const remaining = current.filter((id) => !removeSet.has(id));
    if (remaining.length === current.length) {
      output.unbound = false;
      return true;
    }
    const patch = this.prepareBindingPatch(input.component_kind, remaining, record);
    await this.relationDb.update(AGENT_TABLE, newPatch(patch), [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
    ]);
    output.unbound = true;
    return true;
  }

  /** 按 agent_id 查询 agent 行（逻辑控制；绑定 API 内部取数） */
  private async soAgentRecordForBinding(agentId: string): Promise<AgentRecord> {
    if (!agentId) {
      throw new ValidationError('agent_id 为必填');
    }
    const row = await this.relationDb.selectOne(AGENT_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: agentId },
    ]);
    if (!row) {
      throw new NotFoundError('agent', agentId);
    }
    return mapAgent(row);
  }

  /** 读取当前绑定列表（数据处理） */
  private soCurrentBinding(record: AgentRecord, kind: ComponentKind): string[] {
    if (kind === ComponentKind.Soul) return record.soul_id ? [record.soul_id] : [];
    if (kind === ComponentKind.Skill) return record.skill_ids;
    if (kind === ComponentKind.Mcp) return record.mcp_ids;
    return record.prompt_template_id ? [record.prompt_template_id] : [];
  }

  /** 绑定补丁组装（数据处理；soul/prompt 单值取首个，skill/mcp JSON 序列化） */
  private prepareBindingPatch(kind: ComponentKind, ids: string[], record: AgentRecord): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (kind === ComponentKind.Soul) {
      patch.soul_id = ids[0] ?? '';
      record.soul_id = ids[0] ?? '';
    } else if (kind === ComponentKind.Skill) {
      patch.skill_ids_json = JSON.stringify(ids);
      record.skill_ids = ids;
    } else if (kind === ComponentKind.Mcp) {
      patch.mcp_ids_json = JSON.stringify(ids);
      record.mcp_ids = ids;
    } else {
      patch.prompt_template_id = ids[0] ?? '';
      record.prompt_template_id = ids[0] ?? '';
    }
    return patch;
  }

  async delAgent(input: DelAgentInput, output: DelAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.ids || input.ids.length === 0) {
      output.deleted_count = 0;
      return true;
    }

    let deleted = 0;
    for (const id of input.ids) {
      if (!id) continue;
      const rows = await this.relationDb.select(AGENT_TABLE, {
        conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
      });
      if (rows.length === 0) continue;
      const agentId = String(rows[0].agent_id);

      // 删除使用统计（agent_usage）
      await this.relationDb.delete(AGENT_USAGE_TABLE, [
        { field: 'agent_id', operator: Operator.EQ, value: agentId },
      ]);

      // 删除关联数据：LLM 绑定（仍在 LLMProvider agent_llm）+ 组件 usage（评估依据，按 agent_id 键）
      try {
        this.relationDb.executeRaw(`DELETE FROM "agent_llm" WHERE "agent_id" = ?`, [agentId]);
      } catch { /* 表可能不存在 */ }
      for (const table of ['skill_usage', 'soul_core_usage', 'agent_mcp_usage']) {
        try {
          this.relationDb.executeRaw(`DELETE FROM "${table}" WHERE "agent_id" = ?`, [agentId]);
        } catch { /* 表可能不存在 */ }
      }

      // 删除主记录
      const n = await this.relationDb.delete(AGENT_TABLE, [
        { field: 'id', operator: Operator.EQ, value: id },
      ]);
      deleted += n;
    }
    output.deleted_count = deleted;
    return true;
  }

  async toggleAgent(input: ToggleAgentInput, output: ToggleAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.id) throw new ValidationError('id 为必填');
    const rows = await this.relationDb.select(AGENT_TABLE, {
      conditions: [{ field: 'id', operator: Operator.EQ, value: input.id }],
    });
    if (rows.length === 0) throw new NotFoundError('Agent', input.id);

    const agent = mapAgent(rows[0]);
    const newEnable = !agent.enable;
    await this.relationDb.update(
      AGENT_TABLE,
      [
        { field: 'enable', value: newEnable ? 1 : 0 },
        { field: 'updated', value: IdGenerator.now() },
      ],
      [{ field: 'id', operator: Operator.EQ, value: input.id }],
    );
    output.enable = newEnable;
    return true;
  }

  // ===== 修改后：新增按日统计 agent_usage_daily（upsert 当天计数）=====
  async recordAgentUsage(input: RecordAgentUsageInput, _output: RecordAgentUsageOutput, ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) throw new ValidationError('agent_id 为必填');
    const existing = await this.relationDb.selectOne(AGENT_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
    ]);
    if (!existing) throw new NotFoundError('Agent', input.agent_id);

    const now = IdGenerator.now();
    const workId = input.work_id || ctx.work_id || '';
    const interactId = input.interact_id || ctx.interact_id || '';

    await this.relationDb.insert(AGENT_USAGE_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'agent_id', value: input.agent_id },
      { field: 'work_id', value: workId },
      { field: 'interact_id', value: interactId },
      { field: 'usage_context', value: input.usage_context ?? '' },
    ]);

    // 按日统计 upsert：当天已有记录则 usage_count + 1，否则新增
    const usageDate = IdGenerator.today();
    const daily = await this.relationDb.selectOne(AGENT_USAGE_DAILY_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
      { field: 'usage_date', operator: Operator.EQ, value: usageDate },
    ]);
    if (daily) {
      await this.relationDb.update(
        AGENT_USAGE_DAILY_TABLE,
        [
          { field: 'usage_count', value: (Number(daily.usage_count) ?? 0) + 1 },
          { field: 'updated', value: now },
        ],
        [
          { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
          { field: 'usage_date', operator: Operator.EQ, value: usageDate },
        ],
      );
    } else {
      await this.relationDb.insert(AGENT_USAGE_DAILY_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'agent_id', value: input.agent_id },
        { field: 'usage_date', value: usageDate },
        { field: 'usage_count', value: 1 },
      ]);
    }

    const usageCount = Number(existing.usage_count ?? 0) + 1;
    await this.relationDb.update(
      AGENT_TABLE,
      [
        { field: 'usage_count', value: usageCount },
        { field: 'updated', value: now },
      ],
      [{ field: 'agent_id', operator: Operator.EQ, value: input.agent_id }],
    );
    return true;
  }

  async soAgent(input: GetAgentInput, output: GetAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.agent_id) {
      const row = await this.relationDb.selectOne(AGENT_TABLE, [
        { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
      ]);
      output.agents = row ? [mapAgent(row)] : [];
      return true;
    }

    const conditions: Condition[] = [...(input.conditions ?? [])];
    if (input.agent_type) {
      conditions.push({ field: 'agent_type', operator: Operator.EQ, value: input.agent_type });
    }
    const rows = await this.relationDb.select(AGENT_TABLE, {
      conditions,
      order_by: input.order_by,
      page: input.page,
    });
    output.agents = rows.map(mapAgent);
    return true;
  }

  /**
   * 老化：ALL rules must be satisfied。
   * 对每个非系统 Agent，当且仅当「每一条规则」都满足
   * (窗口内 usage < min_usage_count 且 eval_score < min_eval_score) 时才禁用。
   */
  // ===== 修改后：按日统计表 agent_usage_daily 按 usage_date 日期窗口统计 =====
  async ageAgent(_input: AgeAgentInput, output: AgeAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const ruleRows = await this.relationDb.select(AGENT_OPT_RULE_TABLE);
    const rules = ruleRows.map((r) => ({
      id: String(r.id),
      days: Number(r.days),
      min_usage_count: Number(r.min_usage_count),
      min_eval_score: Number(r.min_eval_score),
    })) as AgentOptRuleRecord[];
    if (rules.length === 0) {
      output.aged_count = 0;
      return true;
    }

    const agentRows = await this.relationDb.select(AGENT_TABLE, {
      conditions: [{ field: 'enable', operator: Operator.EQ, value: 1 }],
    });
    const agents = agentRows.map(mapAgent);
    const now = IdGenerator.now();
    const agedIds: string[] = [];

    for (const agent of agents) {
      if ((SYSTEM_AGENT_TYPES as readonly string[]).includes(agent.agent_type)) continue;

      let allRulesMet = true;
      for (const rule of rules) {
        // 按日期窗口统计：usage_date >= 截止日期（YYYY-MM-DD）
        const cutoffDate = IdGenerator.dateOf(now - rule.days * 24 * 60 * 60 * 1000);
        const dailyRows = await this.relationDb.queryRaw<{ total: number }>(
          `SELECT COALESCE(SUM("usage_count"), 0) AS "total" FROM "${AGENT_USAGE_DAILY_TABLE}" WHERE "agent_id" = ? AND "usage_date" >= ?`,
          [agent.agent_id, cutoffDate],
        );
        const usageCount = Number(dailyRows?.[0]?.total ?? 0);
        const lowUsage = usageCount < rule.min_usage_count;
        const lowEval = agent.eval_score < rule.min_eval_score;
        if (!(lowUsage && lowEval)) {
          allRulesMet = false;
          break;
        }
      }

      if (allRulesMet) agedIds.push(agent.agent_id);
    }

    for (const agentId of agedIds) {
      await this.relationDb.update(
        AGENT_TABLE,
        [
          { field: 'enable', value: 0 },
          { field: 'updated', value: now },
        ],
        [{ field: 'agent_id', operator: Operator.EQ, value: agentId }],
      );
    }
    output.aged_count = agedIds.length;
    return true;
  }

  async soAgentRule(input: GetAgentRuleInput, output: GetAgentRuleOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(AGENT_OPT_RULE_TABLE, {
      conditions: input.conditions,
      order_by: input.order_by,
      page: input.page,
    });
    output.rules = rows.map((r) => ({
      id: String(r.id),
      created: Number(r.created),
      updated: Number(r.updated),
      days: Number(r.days),
      min_usage_count: Number(r.min_usage_count),
      min_eval_score: Number(r.min_eval_score),
    }));
    return true;
  }

  async updateAgentRule(input: UpdateAgentRuleInput, _output: UpdateAgentRuleOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.operations?.length) throw new ValidationError('operations 为必填');

    for (const op of input.operations) {
      const type = String(op.type).toUpperCase();
      const dataMap = this.opDataToMap(op.data);

      if (type === OperationType.INSERT || type === 'INSERT') {
        const days = Number(dataMap.days);
        const minUsage = Number(dataMap.min_usage_count);
        const minEval = Number(dataMap.min_eval_score);
        if (!Number.isInteger(days) || days <= 0) throw new ValidationError('days 必须为正整数');
        if (minUsage < 0) throw new ValidationError('min_usage_count 必须 >= 0');
        if (minEval < 0 || minEval > 100) throw new ValidationError('min_eval_score 必须在 0-100');

        const now = IdGenerator.now();
        await this.relationDb.insert(AGENT_OPT_RULE_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'days', value: days },
          { field: 'min_usage_count', value: minUsage },
          { field: 'min_eval_score', value: minEval },
        ]);
      } else if (type === OperationType.UPDATE || type === 'UPDATE') {
        const id = String((op as { id?: string }).id ?? dataMap.id ?? '');
        if (!id) throw new ValidationError('UPDATE 需要 id');
        const existing = await this.relationDb.selectOne(AGENT_OPT_RULE_TABLE, [
          { field: 'id', operator: Operator.EQ, value: id },
        ]);
        if (!existing) throw new NotFoundError('AgentOptRule', id);

        const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
        if (dataMap.days !== undefined) data.push({ field: 'days', value: Number(dataMap.days) });
        if (dataMap.min_usage_count !== undefined) {
          data.push({ field: 'min_usage_count', value: Number(dataMap.min_usage_count) });
        }
        if (dataMap.min_eval_score !== undefined) {
          data.push({ field: 'min_eval_score', value: Number(dataMap.min_eval_score) });
        }
        await this.relationDb.update(
          AGENT_OPT_RULE_TABLE,
          data,
          [{ field: 'id', operator: Operator.EQ, value: id }],
        );
      } else if (type === OperationType.DELETE || type === 'DELETE') {
        const id = String((op as { id?: string }).id ?? dataMap.id ?? '');
        if (!id) throw new ValidationError('DELETE 需要 id');
        await this.relationDb.delete(AGENT_OPT_RULE_TABLE, [
          { field: 'id', operator: Operator.EQ, value: id },
        ]);
      } else {
        throw new ValidationError(`unsupported operation type: ${op.type}`);
      }
    }
    return true;
  }

  async configAgentLibrary(input: ConfigAgentLibraryInput, output: ConfigAgentLibraryOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    let config = await this.getConfig();
    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(AGENT_LIBRARY_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'prompt_template_id', value: '' },
        { field: 'similarity_threshold', value: 0.7 },
        { field: 'max_agent_count', value: 100 },
      ]);
      config = await this.getConfig();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: DataObject[] = [];
    if (input.prompt_template_id !== undefined) {
      if (input.prompt_template_id) {
        const soOut = new SoPromptOutput();
        await this.promptsAccess.soPrompt(
          Object.assign(new SoPromptInput(), {
            conditions: [{ field: 'id', operator: Operator.EQ, value: input.prompt_template_id }],
          }),
          soOut,
          new PromptContext(),
        );
        if (!soOut.list?.length) {
          throw new ValidationError(`prompt_template_id 不存在: ${input.prompt_template_id}`);
        }
      }
      data.push({ field: 'prompt_template_id', value: input.prompt_template_id });
    }
    if (input.similarity_threshold !== undefined) {
      if (input.similarity_threshold < 0 || input.similarity_threshold > 1) {
        throw new ValidationError('similarity_threshold 必须在 0-1');
      }
      data.push({ field: 'similarity_threshold', value: input.similarity_threshold });
    }
    if (input.regen_rate !== undefined) {
      if (input.regen_rate < 0 || input.regen_rate > 100) {
        throw new ValidationError('regen_rate 必须在 0-100');
      }
      data.push({ field: 'regen_rate', value: input.regen_rate });
    }
    if (input.max_agent_count !== undefined) {
      if (!Number.isInteger(input.max_agent_count) || input.max_agent_count <= 0) {
        throw new ValidationError('max_agent_count 必须为正整数');
      }
      data.push({ field: 'max_agent_count', value: input.max_agent_count });
    }

    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(
        AGENT_LIBRARY_CONFIG_TABLE,
        data,
        [{ field: 'id', operator: Operator.EQ, value: config.id }],
      );
    }

    const latest = await this.getConfig();
    output.prompt_template_id = latest?.prompt_template_id ?? '';
    output.similarity_threshold = latest?.similarity_threshold ?? 0.7;
    output.regen_rate = latest?.regen_rate ?? 75;
    output.max_agent_count = latest?.max_agent_count ?? 100;

    if (input.max_agent_count !== undefined && latest) {
      const count = await this.relationDb.count(AGENT_TABLE, [
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ]);
      if (count > input.max_agent_count) {
        void this.ageAgent(new AgeAgentInput(), new AgeAgentOutput(), new AgentLibraryContext());
      }
    }
    return true;
  }

  private async getConfig(): Promise<AgentLibraryConfigRecord | null> {
    const row = await this.relationDb.selectOne(AGENT_LIBRARY_CONFIG_TABLE, []);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      prompt_template_id: String(row.prompt_template_id ?? ''),
      similarity_threshold: Number(row.similarity_threshold ?? 0.7),
      regen_rate: Number(row.regen_rate ?? 75),
      max_agent_count: Number(row.max_agent_count ?? 100),
    };
  }

  /**
   * 解析用于 Agent 匹配排序的 LLM：优先默认启用的非 embedding 文本模型。
   * 仅作为"排序执行者"，与 Agent 绑定无关（绑定只存在于 LLMProvider 的 agent_llm）。
   */
  private async resolveRankerLlm(): Promise<string> {
    try {
      const so = new SoLLMOutput();
      await this.llmAccess.soLLM({} as SoLLMInput, so, new LLMContext());
      const list = (so.list || []).filter((l) => l.enable && l.llm_type !== 'embedding');
      const def = list.find((l) => l.is_default) ?? list[0];
      return def?.id ?? '';
    } catch {
      return '';
    }
  }

  /**
   * 第二层匹配：提交给大模型 (LLM)，依据 Agent 列表用途/名称与提问进行评估打分。
   */
  private async llmMatchAgent(
    taskContent: string,
    candidates: AgentRecord[],
    promptTemplateId?: string,
  ): Promise<{ agent_id: string; score: number } | null> {
    // 排序 LLM 从 llm_available 解析（默认文本模型优先），不再依赖 agent 表 llm_id
    const llmId = await this.resolveRankerLlm();
    if (!llmId) return null;

    const candidateList = candidates.map((c) => ({
      agent_id: c.agent_id,
      agent_name: c.agent_name,
      agent_purpose: c.agent_purpose || c.task_signature || '通用任务代理',
      agent_type: c.agent_type,
    }));

    const candidatesJson = JSON.stringify(candidateList, null, 2);
    let prompt = '';
    const id = promptTemplateId || PROMPT_IDS.agentMatch;
    try {
      const promptOut = new ExecPromptOutput();
      const okPrompt = await this.promptsAccess.execPrompt(
        Object.assign(new ExecPromptInput(), {
          id,
          variables: { task_content: taskContent, candidates: candidatesJson },
        }),
        promptOut,
        new PromptContext(),
      );
      if (okPrompt && promptOut.prompt) prompt = promptOut.prompt;
    } catch { /* ignore prompt failure */ }

    if (!prompt) {
      const tpl = getBuiltinTemplate(PROMPT_IDS.agentMatch);
      if (tpl) prompt = renderTemplate(tpl, { task_content: taskContent, candidates: candidatesJson });
    }

    const llmOut = new ExecLLMOutput();
    const okLlm = await this.llmAccess.execLLM(
      Object.assign(new ExecLLMInput(), { id: llmId, prompt }),
      llmOut,
      new LLMContext(),
    );
    if (!okLlm) return null;

    const result = parseJsonObject(llmOut.result);
    if (!result) return null;
    const agentId = String(result.agent_id ?? '');
    const score = Number(result.score ?? 0);
    if (!agentId) return null;
    return { agent_id: agentId, score };
  }

  private opDataToMap(data: unknown): Record<string, unknown> {
    if (!data) return {};
    if (Array.isArray(data)) {
      const map: Record<string, unknown> = {};
      for (const item of data as DataObject[]) {
        if (item && typeof item === 'object' && 'field' in item) {
          map[String(item.field)] = item.value;
        }
      }
      return map;
    }
    if (typeof data === 'object') return data as Record<string, unknown>;
    return {};
  }
}
