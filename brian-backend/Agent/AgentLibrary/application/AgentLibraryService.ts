import { Metrics, Report, TraceService, RecordUsageInput, RecordUsageOutput } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, Context } from '@brian-agent/base';
import {
  IdGenerator, Operator, OperationType, ValidationError, NotFoundError, newPatch,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  SoLLMInput, SoLLMOutput,
  PROMPT_TEMPLATE_TABLE,
  USAGE_EVENT_TABLE, AGENT_USAGE_ORG_TABLE,
  syncComponentEmbedding,
  deleteComponentEmbedding,
  syncComponentExamples,
  batchGetOrComputeEmbeddings,
  batchGetDualExampleEmbeddings,
  createEmbedTaskFn,
  createSemanticsTaskFn,
  resolveComponentSemantics,
  funnelSemanticRouterRanking,
  buildFunnelDocText,
  AGENT_EMBEDDING_TABLE,
  AGENT_EXAMPLE_EMBEDDING_TABLE,
  type DataObject, type Condition,
} from '@brian-agent/base';
import {
  AGENT_TABLE, AGENT_OPT_RULE_TABLE, AGENT_LIBRARY_CONFIG_TABLE,
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
    // ADR-012:agent_id 业务键由主键 id 统一承接;列规范化 title/brief/type;用量唯一归 TraceBase
    agent_id: String(row.id),
    agent_name: String(row.title ?? ''),
    agent_purpose: String(row.brief ?? ''),
    agent_type: String(row.type),
    strategy_id: String(row.strategy_id),
    soul_id: String(row.soul_id ?? ''),
    skill_ids: parseIdList(row.skill_ids_json),
    mcp_ids: parseIdList(row.mcp_ids_json),
    prompt_template_id: String(row.prompt_template_id ?? ''),
    task_signature: String(row.task_signature ?? ''),
    eval_score: Number(row.eval_score ?? 50),
    enable: toBool(row.enable),
    created_by: String(row.created_by ?? 'user'),
  };
}

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
  private readonly trace: TraceService;
  private embedFn?: (text: string, context?: Context) => Promise<number[]>;
  private readonly semanticsFn;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {
    this.trace = new TraceService(relationDb);
    this.embedFn = createEmbedTaskFn(llmAccess);
    this.semanticsFn = createSemanticsTaskFn(llmAccess);
  }

  setEmbedFn(fn: (text: string, context?: Context) => Promise<number[]>): void {
    this.embedFn = fn;
  }

  async addAgent(input: AddAgentInput, output: AddAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) throw new ValidationError('agent_id 为必填');
    if (!VALID_AGENT_TYPES.includes(input.agent_type as typeof VALID_AGENT_TYPES[number])) {
      throw new ValidationError(`invalid agent_type: ${input.agent_type}`);
    }
    if (!input.strategy_id) throw new ValidationError('strategy_id 为必填');

    const sem = await resolveComponentSemantics({
      kind: 'agent',
      source: { kind: 'agent', title: input.agent_name, brief: input.agent_purpose, extra: input.task_signature },
      provided: {
        title: input.agent_name, brief: input.agent_purpose,
        positive_examples: input.positive_examples, negative_examples: input.negative_examples,
      },
      semanticsFn: this.semanticsFn,
      metrics: _metrics,
    });

    const insertFields = this.buildAgentInsertFields(input, sem);
    try {
      await this.relationDb.insert(AGENT_TABLE, insertFields);
    } catch {
      const fallbackFields = insertFields.filter((f) => f.field !== 'created_by');
      await this.relationDb.insert(AGENT_TABLE, fallbackFields);
    }
    output.agent_id = input.agent_id;

    await this.syncAgentVector(input.agent_id, sem, input.task_signature, _metrics);
    if (sem.positive_examples.length > 0 || sem.negative_examples.length > 0) {
      await this.syncAgentExamples(input.agent_id, sem, _metrics);
    }
    return true;
  }

  private buildAgentInsertFields(input: AddAgentInput, sem: { title: string; brief: string }): DataObject[] {
    const now = IdGenerator.now();
    const fields: DataObject[] = [
      { field: 'id', value: input.agent_id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'title', value: sem.title || input.agent_name || `Agent-${input.agent_id.slice(0, 8)}` },
      { field: 'type', value: input.agent_type },
      { field: 'strategy_id', value: input.strategy_id },
      { field: 'soul_id', value: input.soul_id ?? '' },
      { field: 'skill_ids_json', value: JSON.stringify(input.skill_ids ?? []) },
      { field: 'mcp_ids_json', value: JSON.stringify(input.mcp_ids ?? []) },
      { field: 'prompt_template_id', value: input.prompt_template_id ?? '' },
      { field: 'task_signature', value: input.task_signature ?? '' },
      { field: 'eval_score', value: 50 },
      { field: 'created_by', value: input.created_by || 'user' },
      { field: 'enable', value: 1 },
    ];
    if (sem.brief || input.agent_purpose !== undefined) {
      fields.push({ field: 'brief', value: sem.brief || input.agent_purpose || '' });
    }
    return fields;
  }

  private async syncAgentVector(agentId: string, sem: { title: string; brief: string }, taskSignature: string | undefined, metrics?: Metrics): Promise<void> {
    const docText = buildFunnelDocText(sem.title, sem.brief || taskSignature || '');
    await syncComponentEmbedding({
      relationDb: this.relationDb,
      table: AGENT_EMBEDDING_TABLE,
      targetIdField: 'agent_id',
      targetId: agentId,
      text: docText,
      embedFn: this.embedFn,
      metrics,
    });
  }

  private async syncAgentExamples(agentId: string, sem: { positive_examples?: string[]; negative_examples?: string[] }, metrics?: Metrics): Promise<void> {
    await syncComponentExamples({
      relationDb: this.relationDb,
      table: AGENT_EXAMPLE_EMBEDDING_TABLE,
      targetIdField: 'agent_id',
      targetId: agentId,
      positiveExamples: sem.positive_examples,
      negativeExamples: sem.negative_examples,
      embedFn: this.embedFn,
      metrics,
    });
  }

  async matchAgent(input: MatchAgentInput, output: MatchAgentOutput, ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const rawThreshold = input.similarity_threshold ?? config?.similarity_threshold ?? 70;
    const threshold = rawThreshold > 0 && rawThreshold <= 1 ? Math.round(rawThreshold * 100) : Math.round(rawThreshold);

    const candidates = await this.fetchActiveCandidates(input.agent_type);
    if (candidates.length === 0) {
      this.fillMatchOutput(output, '', 0, '', false);
      return true;
    }

    const queryText = (input.task_content || input.task_signature || '').trim();
    let { bestScore, bestId } = this.matchCandidatesByRule(candidates, input.task_signature, queryText);

    if (bestScore < threshold && this.embedFn && queryText) {
      const vecMatch = await this.matchCandidatesByVector(candidates, queryText, ctx, _metrics);
      if (vecMatch.score > bestScore) {
        bestScore = vecMatch.score;
        bestId = vecMatch.agent_id;
      }
    }

    if (bestScore >= threshold && bestId) {
      return this.handleSimilarityMatchResult(bestScore, bestId, config?.regen_rate ?? 75, output);
    }

    return this.handleLlmMatchFallback(input, ctx, candidates, threshold, bestScore, config?.prompt_template_id, output);
  }

  private async fetchActiveCandidates(agentType?: string): Promise<AgentRecord[]> {
    const conditions: Condition[] = [{ field: 'enable', operator: Operator.EQ, value: 1 }];
    if (agentType) {
      conditions.push({ field: 'type', operator: Operator.EQ, value: agentType });
    }
    const rows = await this.relationDb.select(AGENT_TABLE, { conditions });
    return rows.map(mapAgent);
  }

  private fillMatchOutput(
    output: MatchAgentOutput,
    agentId: string,
    score: number,
    matchedBy: '' | 'SIMILARITY' | 'LLM',
    matched: boolean,
    regen = false,
  ): void {
    output.agent_id = agentId;
    output.similarity_score = score;
    output.matched_by = matchedBy;
    output.matched = matched;
    output.regenerate = regen;
  }

  private matchCandidatesByRule(candidates: AgentRecord[], taskSignature: string, queryText: string): { bestScore: number; bestId: string } {
    const domainA = taskSignature.match(/^\[(.*?)\]/)?.[1] || '';
    let bestScore = 0;
    let bestId = '';
    for (const c of candidates) {
      const domainB = c.task_signature.match(/^\[(.*?)\]/)?.[1] || '';
      if (domainA && domainB && domainA.trim() !== domainB.trim()) continue;
      if (c.task_signature === taskSignature) {
        return { bestScore: 100, bestId: c.agent_id };
      }
      const cleanA = taskSignature.replace(/^\[.*?\]/, '').trim();
      const cleanB = c.task_signature.replace(/^\[.*?\]/, '').trim();
      if (cleanA && cleanB && (cleanA.includes(cleanB) || cleanB.includes(cleanA))) {
        return { bestScore: 100, bestId: c.agent_id };
      }
      if (c.agent_purpose && queryText && (queryText.includes(c.agent_purpose) || c.agent_purpose.includes(queryText))) {
        bestScore = 90;
        bestId = c.agent_id;
      }
    }
    return { bestScore, bestId };
  }

  private async matchCandidatesByVector(
    candidates: AgentRecord[],
    queryText: string,
    _ctx: AgentLibraryContext,
    metrics?: Metrics,
  ): Promise<{ score: number; agent_id: string }> {
    let score = 0;
    let agent_id = '';
    try {
      const queryVec = await this.embedFn!(queryText, _ctx as Context);
      if (queryVec && queryVec.length > 0) {
        const ranking = await this.rankCandidatesBySemantics(candidates, queryVec, metrics);
        for (const entry of ranking) {
          if (entry.rejected) continue;
          if (entry.score > score) {
            score = entry.score;
            agent_id = entry.doc.doc.agent_id;
          }
        }
      }
    } catch (err) {
      metrics?.warn('AgentLibraryService.matchAgent 向量匹配降级', { error: String(err) });
    }
    return { score, agent_id };
  }

  /** R7 语义路由裁决:描述向量 + 正向范例 Max-Sim 提升 + 负向范例硬阻断/软惩罚 */
  private async rankCandidatesBySemantics(candidates: AgentRecord[], queryVec: number[], metrics?: Metrics) {
    const funnelDocs = candidates.map((c) => ({
      doc: c,
      id: c.agent_id,
      name: c.agent_name,
      brief: String(c.agent_purpose || c.task_signature || ''),
    }));
    const vectorMap = await batchGetOrComputeEmbeddings({
      relationDb: this.relationDb,
      table: AGENT_EMBEDDING_TABLE,
      targetIdField: 'agent_id',
      items: funnelDocs.map((d) => ({ id: d.id, text: buildFunnelDocText(d.name, d.brief) })),
      embedFn: this.embedFn,
      metrics,
    });
    const dual = await batchGetDualExampleEmbeddings({
      relationDb: this.relationDb,
      table: AGENT_EXAMPLE_EMBEDDING_TABLE,
      targetIdField: 'agent_id',
      targetIds: funnelDocs.map((d) => d.id),
    });
    return funnelSemanticRouterRanking(queryVec, funnelDocs, async () => [], vectorMap, dual.positiveMap, dual.negativeMap);
  }

  private handleSimilarityMatchResult(bestScore: number, bestId: string, regenRate: number, output: MatchAgentOutput): boolean {
    if (shouldReuseByRegenRate(regenRate)) {
      this.fillMatchOutput(output, bestId, bestScore, 'SIMILARITY', true);
      return true;
    }
    this.fillMatchOutput(output, '', bestScore, '', true, true);
    return true;
  }

  private async handleLlmMatchFallback(
    input: MatchAgentInput,
    ctx: AgentLibraryContext,
    candidates: AgentRecord[],
    threshold: number,
    bestScore: number,
    promptTemplateId: string | undefined,
    output: MatchAgentOutput,
  ): Promise<boolean> {
    const llmMatched = await this.llmMatchAgent(
      input.task_content || input.task_signature,
      candidates,
      promptTemplateId ?? '',
      { session_id: ctx.session_id, run_id: input.run_id || ctx.run_id || '', work_id: input.work_id || ctx.work_id || '' },
    );
    const parsedScore = Number(llmMatched?.score ?? 0);
    const normalizedLlmScore = parsedScore > 0 && parsedScore <= 1 ? Math.round(parsedScore * 100) : Math.round(parsedScore);

    if (llmMatched && normalizedLlmScore >= threshold && llmMatched.agent_id) {
      const found = candidates.find((c) => c.agent_id === llmMatched.agent_id && toBool(c.enable));
      if (found) {
        this.fillMatchOutput(output, found.agent_id, normalizedLlmScore, 'LLM', true);
        return true;
      }
    }
    this.fillMatchOutput(output, '', Math.max(bestScore, normalizedLlmScore), '', false);
    return true;
  }

  async updateAgent(input: UpdateAgentInput, _output: UpdateAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const existing = await this.relationDb.selectOne(AGENT_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.agent_id },
    ]);
    if (!existing) throw new NotFoundError('Agent', input.agent_id);

    if (input.eval_score !== undefined && (input.eval_score < 0 || input.eval_score > 100)) {
      throw new ValidationError('eval_score 必须在 0-100 之间');
    }

    const data = this.buildAgentUpdateFields(input);
    if (data.length > 1) {
      await this.relationDb.update(AGENT_TABLE, data, [{ field: 'id', operator: Operator.EQ, value: input.agent_id }]);
    }

    if (input.agent_name !== undefined || input.agent_purpose !== undefined || input.task_signature !== undefined) {
      await this.syncAgentEmbeddingOnUpdate(input.agent_id, _metrics);
    }
    if (input.positive_examples !== undefined || input.negative_examples !== undefined) {
      await this.syncAgentExamples(input.agent_id, {
        positive_examples: input.positive_examples,
        negative_examples: input.negative_examples,
      }, _metrics);
    }
    return true;
  }

  private buildAgentUpdateFields(input: UpdateAgentInput): DataObject[] {
    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    if (input.agent_name !== undefined) data.push({ field: 'title', value: input.agent_name });
    if (input.agent_purpose !== undefined) data.push({ field: 'brief', value: input.agent_purpose });
    if (input.task_signature !== undefined) data.push({ field: 'task_signature', value: input.task_signature });
    if (input.eval_score !== undefined) data.push({ field: 'eval_score', value: input.eval_score });
    if (input.enable !== undefined) data.push({ field: 'enable', value: input.enable ? 1 : 0 });
    if (input.strategy_id !== undefined) data.push({ field: 'strategy_id', value: input.strategy_id });
    if (input.soul_id !== undefined) data.push({ field: 'soul_id', value: input.soul_id });
    return data;
  }

  private async syncAgentEmbeddingOnUpdate(agentId: string, metrics?: Metrics): Promise<void> {
    const row = await this.relationDb.selectOne(AGENT_TABLE, [
      { field: 'id', operator: Operator.EQ, value: agentId },
    ]);
    if (row) {
      const docText = buildFunnelDocText(String(row.title ?? ''), String(row.brief || row.task_signature || ''));
      await syncComponentEmbedding({
        relationDb: this.relationDb,
        table: AGENT_EMBEDDING_TABLE,
        targetIdField: 'agent_id',
        targetId: agentId,
        text: docText,
        embedFn: this.embedFn,
        metrics,
      });
    }
  }

  async bindAgentComponent(input: BindAgentComponentInput, output: BindAgentComponentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const record = await this.soAgentRecordForBinding(input.agent_id);
    const ids = (input.component_ids ?? []).map((v) => String(v).trim()).filter(Boolean);
    const patch = this.prepareBindingPatch(input.component_kind, ids, record);
    await this.relationDb.update(AGENT_TABLE, newPatch(patch), [
      { field: 'id', operator: Operator.EQ, value: input.agent_id },
    ]);
    output.bound = ids;
    return true;
  }

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
      { field: 'id', operator: Operator.EQ, value: input.agent_id },
    ]);
    output.unbound = true;
    return true;
  }

  private async soAgentRecordForBinding(agentId: string): Promise<AgentRecord> {
    if (!agentId) {
      throw new ValidationError('agent_id 为必填');
    }
    const row = await this.relationDb.selectOne(AGENT_TABLE, [
      { field: 'id', operator: Operator.EQ, value: agentId },
    ]);
    if (!row) {
      throw new NotFoundError('agent', agentId);
    }
    return mapAgent(row);
  }

  private soCurrentBinding(record: AgentRecord, kind: ComponentKind): string[] {
    if (kind === ComponentKind.Soul) return record.soul_id ? [record.soul_id] : [];
    if (kind === ComponentKind.Skill) return record.skill_ids;
    if (kind === ComponentKind.Mcp) return record.mcp_ids;
    return record.prompt_template_id ? [record.prompt_template_id] : [];
  }

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

    await this.assertNotUserOwned(input.ids);
    let deleted = 0;
    for (const id of input.ids) {
      if (!id) continue;
      deleted += await this.deleteSingleAgent(id);
    }
    output.deleted_count = deleted;
    return true;
  }

  private async deleteSingleAgent(id: string): Promise<number> {
    const rows = await this.relationDb.select(AGENT_TABLE, {
      conditions: [{ field: 'id', operator: Operator.EQ, value: id }],
    });
    if (rows.length === 0) return 0;
    const agentId = String(rows[0].id ?? rows[0].agent_id);

    await this.relationDb.delete(USAGE_EVENT_TABLE, [
      { field: 'entity_type', operator: Operator.EQ, value: 'agent' },
      { field: 'entity_id', operator: Operator.EQ, value: agentId },
    ]);
    await this.relationDb.delete(AGENT_USAGE_ORG_TABLE, [
      { field: 'id', operator: Operator.EQ, value: agentId },
    ]);

    const n = await this.relationDb.delete(AGENT_TABLE, [
      { field: 'id', operator: Operator.EQ, value: id },
    ]);
    // ADR-012：级联清理 runtime def（Runtime 域表 runtime_agent_def_record；源 Agent 已删，残留 def 是孤儿脏数据，
    // 会被会话亲和持续复用并回退内置身份模板）。Agent 工作区不反向依赖 Runtime，此处按表名字面量操作。
    await this.relationDb.delete('runtime_agent_def_record', [
      { field: 'agent_ref', operator: Operator.EQ, value: agentId },
    ]);
    await deleteComponentEmbedding({
      relationDb: this.relationDb,
      table: AGENT_EMBEDDING_TABLE,
      targetIdField: 'agent_id',
      targetId: id,
    });
    await deleteComponentEmbedding({
      relationDb: this.relationDb,
      table: AGENT_EXAMPLE_EMBEDDING_TABLE,
      targetIdField: 'agent_id',
      targetId: id,
    });
    return n;
  }

  private async assertNotUserOwned(internalIds: string[]): Promise<void> {
    const targets = internalIds.filter(Boolean);
    if (targets.length === 0) {
      return;
    }
    const rows = await this.relationDb.select(AGENT_TABLE, {
      conditions: [{ field: 'id', operator: Operator.IN, value: targets }],
    });
    const userOwned = (rows ?? []).some((row) => String(row.created_by ?? 'user') === 'user');
    if (userOwned) {
      throw new ValidationError('用户创建的 Agent 不允许系统自动删除');
    }
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

  async recordAgentUsage(input: RecordAgentUsageInput, _output: RecordAgentUsageOutput, ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.agent_id) throw new ValidationError('agent_id 为必填');
    const existing = await this.relationDb.selectOne(AGENT_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.agent_id },
    ]);
    if (!existing) throw new NotFoundError('Agent', input.agent_id);

    const usageInput = new RecordUsageInput();
    usageInput.entity_type = 'agent';
    usageInput.entity_id = input.agent_id;
    usageInput.agent_id = input.agent_id;
    usageInput.work_id = input.work_id || ctx.work_id || '';
    usageInput.run_id = input.run_id || ctx.run_id || '';
    usageInput.usage_context = input.usage_context ?? '';
    await this.trace.recordUsage(usageInput, new RecordUsageOutput(), new AgentLibraryContext() as never);
    return true;
  }

  async soAgent(input: GetAgentInput, output: GetAgentOutput, _ctx: AgentLibraryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.agent_id) {
      const row = await this.relationDb.selectOne(AGENT_TABLE, [
        { field: 'id', operator: Operator.EQ, value: input.agent_id },
      ]);
      output.agents = row ? [mapAgent(row)] : [];
      return true;
    }

    const conditions: Condition[] = [...(input.conditions ?? [])];
    if (input.agent_type) {
      conditions.push({ field: 'type', operator: Operator.EQ, value: input.agent_type });
    }
    const rows = await this.relationDb.select(AGENT_TABLE, {
      conditions,
      order_by: input.order_by,
      page: input.page,
    });
    output.agents = rows.map(mapAgent);
    return true;
  }

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

        const cutoffDate = IdGenerator.dateOf(now - rule.days * 24 * 60 * 60 * 1000);
        const dailyRows = await this.relationDb.queryRaw<{ total: number }>(
          `SELECT COALESCE(SUM("usage_count"), 0) AS "total" FROM "${AGENT_USAGE_ORG_TABLE}" WHERE "agent_id" = ? AND "usage_date" >= ?`,
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
        [{ field: 'id', operator: Operator.EQ, value: agentId }],
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
      try {
        await this.relationDb.insert(AGENT_LIBRARY_CONFIG_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'prompt_template_id', value: '' },
          { field: 'similarity_threshold', value: 0.7 },
          { field: 'max_agent_count', value: 100 },
          { field: 'match_score_threshold', value: 70 },
        ]);
      } catch {

        await this.relationDb.insert(AGENT_LIBRARY_CONFIG_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'prompt_template_id', value: '' },
          { field: 'similarity_threshold', value: 0.7 },
          { field: 'max_agent_count', value: 100 },
        ]);
      }
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

    if (input.match_score_threshold !== undefined) {
      if (input.match_score_threshold < 0 || input.match_score_threshold > 100) {
        throw new ValidationError('match_score_threshold 必须在 0-100');
      }
      data.push({ field: 'match_score_threshold', value: input.match_score_threshold });
    }
    if (input.match_bm25_threshold !== undefined) {
      if (input.match_bm25_threshold < 0 || input.match_bm25_threshold > 100) {
        throw new ValidationError('match_bm25_threshold 必须在 0-100');
      }
      data.push({ field: 'match_bm25_threshold', value: input.match_bm25_threshold });
    }
    if (input.match_vector_threshold !== undefined) {
      if (input.match_vector_threshold < 0 || input.match_vector_threshold > 100) {
        throw new ValidationError('match_vector_threshold 必须在 0-100');
      }
      data.push({ field: 'match_vector_threshold', value: input.match_vector_threshold });
    }
    if (input.match_max_tokens !== undefined) {
      if (!Number.isInteger(input.match_max_tokens) || input.match_max_tokens <= 0) {
        throw new ValidationError('match_max_tokens 必须为正整数');
      }
      data.push({ field: 'match_max_tokens', value: input.match_max_tokens });
    }
    if (input.match_enable_thinking !== undefined) {
      data.push({ field: 'match_enable_thinking', value: input.match_enable_thinking ? 1 : 0 });
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
    output.match_score_threshold = latest?.match_score_threshold ?? 70;
    output.match_bm25_threshold = latest?.match_bm25_threshold ?? 50;
    output.match_vector_threshold = latest?.match_vector_threshold ?? 50;
    output.match_max_tokens = latest?.match_max_tokens ?? 512;
    output.match_enable_thinking = latest?.match_enable_thinking ?? false;

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
      match_score_threshold: Number(row.match_score_threshold ?? 70),
      match_bm25_threshold: Number(row.match_bm25_threshold ?? 50),
      match_vector_threshold: Number(row.match_vector_threshold ?? 50),
      match_max_tokens: Number(row.match_max_tokens ?? 512),
      match_enable_thinking: row.match_enable_thinking === 1 || row.match_enable_thinking === true,
    };
  }

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

  private async llmMatchAgent(
    taskContent: string,
    candidates: AgentRecord[],
    promptTemplateId?: string,
    biz?: { session_id?: string; run_id?: string; work_id?: string },
  ): Promise<{ agent_id: string; score: number } | null> {

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
    const id = promptTemplateId || await this.soMatchPromptTemplateId();
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
    if (!prompt) {
      throw new ValidationError(`Prompt 模板不可用或渲染为空: ${id}`);
    }

    const llmOut = new ExecLLMOutput();
    const okLlm = await this.llmAccess.execLLM(
      Object.assign(new ExecLLMInput(), {
        id: llmId,
        prompt,
        session_id: biz?.session_id || '',
        run_id: biz?.run_id || '',
        work_id: biz?.work_id || '',
        caller: 'AgentLibraryService.matchAgent.llmMatch',
      }),
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

  private async soMatchPromptTemplateId(): Promise<string> {
    const row = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'title', operator: Operator.LIKE, value: '%Agent 匹配%' },
    ]);
    if (row && row.id) return String(row.id);
    const anyRow = await this.relationDb.selectOne(PROMPT_TEMPLATE_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ]);
    if (anyRow && anyRow.id) return String(anyRow.id);
    throw new ValidationError('未找到 Agent 匹配提示词模板');
  }
}
