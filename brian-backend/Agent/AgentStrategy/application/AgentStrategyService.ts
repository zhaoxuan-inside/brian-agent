import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError, NotFoundError,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  type DataObject,
} from '@brian-agent/base';
import {
  AGENT_STRATEGY_TABLE, AGENT_STRATEGY_CONFIG_TABLE,
  type AgentStrategyRecord, type AgentStrategyConfigRecord,
  AgentStrategyContext,
  MatchStrategyInput, MatchStrategyOutput,
  GetStrategyInput, GetStrategyOutput,
  SoStrategyInput, SoStrategyOutput,
  AddStrategyInput, AddStrategyOutput,
  UpdateStrategyInput, UpdateStrategyOutput,
  ConfigAgentStrategyInput, ConfigAgentStrategyOutput,
} from '../domain/types';
import { parseJsonObject } from '../../shared/signature';

function mapStrategy(row: Record<string, unknown>): AgentStrategyRecord {
  return {
    id: String(row.id),
    created: Number(row.created),
    updated: Number(row.updated),
    strategy_id: String(row.strategy_id),
    strategy_label: String(row.strategy_label),
    suitable_complexity_min: Number(row.suitable_complexity_min),
    suitable_complexity_max: Number(row.suitable_complexity_max),
    suitable_domains: String(row.suitable_domains),
    execution_rule: String(row.execution_rule),
    enable: row.enable === true || row.enable === 1 || row.enable === '1',
  };
}

function domainMatches(domainsJson: string, domain: string): boolean {
  try {
    const domains = JSON.parse(domainsJson) as string[];
    if (!Array.isArray(domains) || domains.includes('*')) return true;
    if (!domain) return true;
    return domains.some((d) => d.toLowerCase() === domain.toLowerCase());
  } catch {
    return true;
  }
}

export class AgentStrategyService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly _llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  /**
   * 按复杂度 + 领域筛选策略。
   * 多候选时优先用 prompt 模板做决策；无可用 LLM 绑定时回退第一候选。
   * Agent 层不自选 llm_model。
   */
  async matchStrategy(
    input: MatchStrategyInput,
    _ctx: AgentStrategyContext,
    output: MatchStrategyOutput,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(AGENT_STRATEGY_TABLE, {
      conditions: [{ field: 'enable', operator: Operator.EQ, value: 1 }],
    });
    const all = rows.map(mapStrategy);
    if (all.length === 0) {
      output.strategy_id = (await this.getDefaultStrategyId()) || '';
      return true;
    }

    let candidates = all.filter(
      (r) =>
        input.task_complexity >= r.suitable_complexity_min
        && input.task_complexity <= r.suitable_complexity_max
        && domainMatches(r.suitable_domains, input.task_domain || ''),
    );
    if (candidates.length === 0) {
      candidates = all.filter(
        (r) =>
          input.task_complexity >= r.suitable_complexity_min
          && input.task_complexity <= r.suitable_complexity_max,
      );
    }
    if (candidates.length === 0) {
      output.strategy_id = (await this.getDefaultStrategyId()) || all[0].strategy_id;
      return true;
    }
    if (candidates.length === 1) {
      output.strategy_id = candidates[0].strategy_id;
      return true;
    }

    const config = await this.getConfig();
    if (config?.match_prompt_template_id) {
      try {
        const promptOut = new ExecPromptOutput();
        await this.promptsAccess.execPrompt(
          Object.assign(new ExecPromptInput(), {
            id: config.match_prompt_template_id,
            variables: {
              task_content: input.task_content,
              task_complexity: input.task_complexity,
              task_domain: input.task_domain,
              candidates: candidates.map((c) => ({
                strategy_id: c.strategy_id,
                label: c.strategy_label,
              })),
            },
          }),
          new PromptContext(),
          promptOut,
        );
        // 无 agent llm 时不做模型调用，仅用模板渲染结果尝试解析（通常需 LLM）
        // 回退：选复杂度区间中位最接近的
        const parsed = parseJsonObject(promptOut.prompt);
        if (parsed?.strategy_id) {
          const id = String(parsed.strategy_id);
          if (candidates.some((c) => c.strategy_id === id)) {
            output.strategy_id = id;
            return true;
          }
        }
      } catch {
        /* fall through */
      }
    }

    // 回退：区间中心最接近
    candidates.sort((a, b) => {
      const midA = (a.suitable_complexity_min + a.suitable_complexity_max) / 2;
      const midB = (b.suitable_complexity_min + b.suitable_complexity_max) / 2;
      return Math.abs(midA - input.task_complexity) - Math.abs(midB - input.task_complexity);
    });
    output.strategy_id = candidates[0].strategy_id;
    return true;
  }

  async getStrategy(
    input: GetStrategyInput,
    _ctx: AgentStrategyContext,
    output: GetStrategyOutput,
  ): Promise<boolean> {
    const row = await this.relationDb.selectOne(AGENT_STRATEGY_TABLE, [
      { field: 'strategy_id', operator: Operator.EQ, value: input.strategy_id },
    ]);
    if (!row) throw new NotFoundError('Strategy', input.strategy_id);
    const s = mapStrategy(row);
    output.strategy_id = s.strategy_id;
    output.strategy_label = s.strategy_label;
    output.execution_rule = s.execution_rule;
    return true;
  }

  async soStrategy(
    input: SoStrategyInput,
    _ctx: AgentStrategyContext,
    output: SoStrategyOutput,
  ): Promise<boolean> {
    const rows = await this.relationDb.select(AGENT_STRATEGY_TABLE, {
      conditions: input.conditions,
      order_by: input.order_by,
      page: input.page,
    });
    output.strategies = rows.map(mapStrategy);
    return true;
  }

  async addStrategy(
    input: AddStrategyInput,
    _ctx: AgentStrategyContext,
    output: AddStrategyOutput,
  ): Promise<boolean> {
    if (!input.strategy_label) throw new ValidationError('strategy_label 为必填');
    if (input.suitable_complexity_min > input.suitable_complexity_max) {
      throw new ValidationError('suitable_complexity_min <= suitable_complexity_max');
    }
    this.assertExecutionRule(input.execution_rule);

    const dup = await this.relationDb.count(AGENT_STRATEGY_TABLE, [
      { field: 'strategy_label', operator: Operator.EQ, value: input.strategy_label },
    ]);
    if (dup > 0) throw new ValidationError(`label exists: ${input.strategy_label}`);

    const strategyId = IdGenerator.generate();
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_STRATEGY_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'strategy_id', value: strategyId },
      { field: 'strategy_label', value: input.strategy_label },
      { field: 'suitable_complexity_min', value: input.suitable_complexity_min },
      { field: 'suitable_complexity_max', value: input.suitable_complexity_max },
      { field: 'suitable_domains', value: input.suitable_domains },
      { field: 'execution_rule', value: input.execution_rule },
      { field: 'enable', value: 1 },
    ]);
    output.strategy_id = strategyId;
    return true;
  }

  async updateStrategy(
    input: UpdateStrategyInput,
    _ctx: AgentStrategyContext,
    _output: UpdateStrategyOutput,
  ): Promise<boolean> {
    const row = await this.relationDb.selectOne(AGENT_STRATEGY_TABLE, [
      { field: 'strategy_id', operator: Operator.EQ, value: input.strategy_id },
    ]);
    if (!row) throw new NotFoundError('Strategy', input.strategy_id);
    const current = mapStrategy(row);

    const min = input.suitable_complexity_min ?? current.suitable_complexity_min;
    const max = input.suitable_complexity_max ?? current.suitable_complexity_max;
    if (min > max) throw new ValidationError('suitable_complexity_min <= suitable_complexity_max');
    if (input.execution_rule !== undefined) this.assertExecutionRule(input.execution_rule);

    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    if (input.strategy_label !== undefined) data.push({ field: 'strategy_label', value: input.strategy_label });
    if (input.suitable_complexity_min !== undefined) data.push({ field: 'suitable_complexity_min', value: input.suitable_complexity_min });
    if (input.suitable_complexity_max !== undefined) data.push({ field: 'suitable_complexity_max', value: input.suitable_complexity_max });
    if (input.suitable_domains !== undefined) data.push({ field: 'suitable_domains', value: input.suitable_domains });
    if (input.execution_rule !== undefined) data.push({ field: 'execution_rule', value: input.execution_rule });
    if (input.enable !== undefined) data.push({ field: 'enable', value: input.enable ? 1 : 0 });

    await this.relationDb.update(
      AGENT_STRATEGY_TABLE,
      data,
      [{ field: 'strategy_id', operator: Operator.EQ, value: input.strategy_id }],
    );
    return true;
  }

  async configAgentStrategy(
    input: ConfigAgentStrategyInput,
    _ctx: AgentStrategyContext,
    output: ConfigAgentStrategyOutput,
  ): Promise<boolean> {
    let config = await this.getConfig();
    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(AGENT_STRATEGY_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'default_strategy_id', value: '' },
        { field: 'match_prompt_template_id', value: '' },
      ]);
      config = await this.getConfig();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: DataObject[] = [];
    if (input.default_strategy_id !== undefined) {
      if (input.default_strategy_id) {
        const n = await this.relationDb.count(AGENT_STRATEGY_TABLE, [
          { field: 'strategy_id', operator: Operator.EQ, value: input.default_strategy_id },
          { field: 'enable', operator: Operator.EQ, value: 1 },
        ]);
        if (n === 0) throw new ValidationError(`strategy not found: ${input.default_strategy_id}`);
      }
      data.push({ field: 'default_strategy_id', value: input.default_strategy_id });
    }
    if (input.match_prompt_template_id !== undefined) {
      if (input.match_prompt_template_id) {
        const so = new SoPromptOutput();
        await this.promptsAccess.soPrompt(
          Object.assign(new SoPromptInput(), {
            conditions: [{ field: 'id', operator: Operator.EQ, value: input.match_prompt_template_id }],
          }),
          new PromptContext(),
          so,
        );
        if (!so.list?.length) {
          throw new ValidationError(`prompt_template_id 不存在: ${input.match_prompt_template_id}`);
        }
      }
      data.push({ field: 'match_prompt_template_id', value: input.match_prompt_template_id });
    }
    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(
        AGENT_STRATEGY_CONFIG_TABLE,
        data,
        [{ field: 'id', operator: Operator.EQ, value: config.id }],
      );
    }
    output.config = await this.getConfig();
    return true;
  }

  private assertExecutionRule(rule: string): void {
    try {
      const parsed = JSON.parse(rule);
      if (!parsed || typeof parsed !== 'object') throw new Error('not object');
      if (!parsed.steps && !parsed.phases) {
        throw new ValidationError('execution_rule 需包含 steps 或 phases');
      }
    } catch (e) {
      if (e instanceof ValidationError) throw e;
      throw new ValidationError('execution_rule 必须是合法 JSON');
    }
  }

  private async getDefaultStrategyId(): Promise<string> {
    const config = await this.getConfig();
    return config?.default_strategy_id ?? '';
  }

  private async getConfig(): Promise<AgentStrategyConfigRecord | null> {
    const row = await this.relationDb.selectOne(AGENT_STRATEGY_CONFIG_TABLE, []);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      default_strategy_id: String(row.default_strategy_id ?? ''),
      match_prompt_template_id: String(row.match_prompt_template_id ?? ''),
    };
  }
}
