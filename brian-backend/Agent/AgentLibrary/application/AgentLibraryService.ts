import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  IdGenerator, Operator, OperationType, ValidationError, NotFoundError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  type DataObject, type Condition,
} from '@brian-agent/base';
import {
  AGENT_TABLE, AGENT_USAGE_TABLE, AGENT_OPT_RULE_TABLE, AGENT_LIBRARY_CONFIG_TABLE,
  VALID_AGENT_TYPES, SYSTEM_AGENT_TYPES,
  type AgentRecord, type AgentLibraryConfigRecord, type AgentOptRuleRecord,
  AgentLibraryContext,
  AddAgentInput, AddAgentOutput,
  MatchAgentInput, MatchAgentOutput,
  UpdateAgentInput, UpdateAgentOutput,
  RecordAgentUsageInput, RecordAgentUsageOutput,
  GetAgentInput, GetAgentOutput,
  AgeAgentInput, AgeAgentOutput,
  GetAgentRuleInput, GetAgentRuleOutput,
  UpdateAgentRuleInput, UpdateAgentRuleOutput,
  ConfigAgentLibraryInput, ConfigAgentLibraryOutput,
} from '../domain/types';
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
    agent_type: String(row.agent_type),
    strategy_id: String(row.strategy_id),
    llm_id: String(row.llm_id ?? ''),
    soul_id: String(row.soul_id ?? ''),
    task_signature: String(row.task_signature ?? ''),
    usage_count: Number(row.usage_count ?? 0),
    eval_score: Number(row.eval_score ?? 50),
    enable: toBool(row.enable),
  };
}

export class AgentLibraryService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  async addAgent(
    input: AddAgentInput,
    _ctx: AgentLibraryContext,
    output: AddAgentOutput,
  ): Promise<boolean> {
    if (!input.agent_id) throw new ValidationError('agent_id 为必填');
    if (!VALID_AGENT_TYPES.includes(input.agent_type as typeof VALID_AGENT_TYPES[number])) {
      throw new ValidationError(`invalid agent_type: ${input.agent_type}`);
    }
    if (!input.strategy_id) throw new ValidationError('strategy_id 为必填');

    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'agent_id', value: input.agent_id },
      { field: 'agent_name', value: input.agent_name ?? `Agent-${input.agent_id.slice(0, 8)}` },
      { field: 'agent_type', value: input.agent_type },
      { field: 'strategy_id', value: input.strategy_id },
      { field: 'llm_id', value: input.llm_id ?? '' },
      { field: 'soul_id', value: input.soul_id ?? '' },
      { field: 'task_signature', value: input.task_signature ?? '' },
      { field: 'usage_count', value: 0 },
      { field: 'eval_score', value: 50 },
      { field: 'enable', value: 1 },
    ]);
    output.agent_id = input.agent_id;
    return true;
  }

  async matchAgent(
    input: MatchAgentInput,
    _ctx: AgentLibraryContext,
    output: MatchAgentOutput,
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
      return true;
    }

    const promptTemplateId = config?.prompt_template_id ?? '';
    if (promptTemplateId) {
      const llmMatched = await this.llmMatchAgent(input.task_signature, candidates, promptTemplateId);
      if (llmMatched && llmMatched.score >= threshold) {
        const found = candidates.find((c) => c.agent_id === llmMatched.agent_id && toBool(c.enable));
        if (found) {
          output.agent_id = found.agent_id;
          output.similarity_score = llmMatched.score;
          return true;
        }
      }
    }

    let bestScore = 0;
    let bestId = '';
    for (const c of candidates) {
      const score = this.simpleSimilarity(input.task_signature, c.task_signature);
      if (score > bestScore) {
        bestScore = score;
        bestId = c.agent_id;
      }
    }
    if (bestScore >= threshold && bestId) {
      output.agent_id = bestId;
      output.similarity_score = bestScore;
    } else {
      output.agent_id = '';
      output.similarity_score = bestScore;
    }
    return true;
  }

  async updateAgent(
    input: UpdateAgentInput,
    _ctx: AgentLibraryContext,
    _output: UpdateAgentOutput,
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
    if (input.task_signature !== undefined) data.push({ field: 'task_signature', value: input.task_signature });
    if (input.eval_score !== undefined) data.push({ field: 'eval_score', value: input.eval_score });
    if (input.enable !== undefined) data.push({ field: 'enable', value: input.enable ? 1 : 0 });
    if (input.strategy_id !== undefined) data.push({ field: 'strategy_id', value: input.strategy_id });
    if (input.llm_id !== undefined) data.push({ field: 'llm_id', value: input.llm_id });
    if (input.soul_id !== undefined) data.push({ field: 'soul_id', value: input.soul_id });

    if (data.length <= 1) return true;
    await this.relationDb.update(
      AGENT_TABLE,
      data,
      [{ field: 'agent_id', operator: Operator.EQ, value: input.agent_id }],
    );
    return true;
  }

  async recordAgentUsage(
    input: RecordAgentUsageInput,
    ctx: AgentLibraryContext,
    _output: RecordAgentUsageOutput,
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

  async getAgent(
    input: GetAgentInput,
    _ctx: AgentLibraryContext,
    output: GetAgentOutput,
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
  async ageAgent(
    _input: AgeAgentInput,
    _ctx: AgentLibraryContext,
    output: AgeAgentOutput,
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
        const threshold = now - rule.days * 24 * 60 * 60 * 1000;
        const usageCount = await this.relationDb.count(AGENT_USAGE_TABLE, [
          { field: 'agent_id', operator: Operator.EQ, value: agent.agent_id },
          { field: 'created', operator: Operator.GE, value: threshold },
        ]);
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

  async getAgentRule(
    input: GetAgentRuleInput,
    _ctx: AgentLibraryContext,
    output: GetAgentRuleOutput,
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

  async updateAgentRule(
    input: UpdateAgentRuleInput,
    _ctx: AgentLibraryContext,
    _output: UpdateAgentRuleOutput,
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

  async configAgentLibrary(
    input: ConfigAgentLibraryInput,
    _ctx: AgentLibraryContext,
    output: ConfigAgentLibraryOutput,
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
          new PromptContext(),
          soOut,
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
    output.max_agent_count = latest?.max_agent_count ?? 100;

    if (input.max_agent_count !== undefined && latest) {
      const count = await this.relationDb.count(AGENT_TABLE, [
        { field: 'enable', operator: Operator.EQ, value: 1 },
      ]);
      if (count > input.max_agent_count) {
        void this.ageAgent(new AgeAgentInput(), new AgentLibraryContext(), new AgeAgentOutput());
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
      max_agent_count: Number(row.max_agent_count ?? 100),
    };
  }

  /**
   * 使用候选 Agent 已绑定的 llm_id 调用 LLM 做匹配排序。
   * Agent 层不自行挑选 llm_model；仅使用候选上已有的 llm_id（来自 Core matchLLM）。
   */
  private async llmMatchAgent(
    taskSig: string,
    candidates: AgentRecord[],
    promptTemplateId: string,
  ): Promise<{ agent_id: string; score: number } | null> {
    const llmId = candidates.find((c) => c.llm_id)?.llm_id;
    if (!llmId) return null;

    const candidateList = candidates.map((c) => ({
      agent_id: c.agent_id,
      signature: c.task_signature,
    }));
    const promptOut = new ExecPromptOutput();
    const okPrompt = await this.promptsAccess.execPrompt(
      Object.assign(new ExecPromptInput(), {
        id: promptTemplateId,
        variables: { task_signature: taskSig, candidates: candidateList },
      }),
      new PromptContext(),
      promptOut,
    );
    if (!okPrompt || !promptOut.prompt) return null;

    const llmOut = new ExecLLMOutput();
    const okLlm = await this.llmAccess.execLLM(
      Object.assign(new ExecLLMInput(), { id: llmId, prompt: promptOut.prompt }),
      new LLMContext(),
      llmOut,
    );
    if (!okLlm) return null;

    const result = parseJsonObject(llmOut.result);
    if (!result) return null;
    const agentId = String(result.agent_id ?? '');
    const score = Number(result.score ?? 0);
    if (!agentId) return null;
    return { agent_id: agentId, score };
  }

  private simpleSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    return intersection / new Set([...wordsA, ...wordsB]).size;
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
