import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  AGENT_STRATEGY_TABLE,
  AGENT_STRATEGY_CONFIG_TABLE,
  type AgentStrategyRecord,
  type AgentStrategyConfigRecord,
  MatchStrategyInput,
  MatchStrategyOutput,
  GetStrategyInput,
  GetStrategyOutput,
  SoStrategyInput,
  SoStrategyOutput,
  AddStrategyInput,
  AddStrategyOutput,
  UpdateStrategyInput,
  UpdateStrategyOutput,
  ConfigAgentStrategyInput,
  ConfigAgentStrategyOutput,
} from '../domain/types';

export class AgentStrategyService {
  private readonly relationDb: RelationDBAccess;
  private readonly llmAccess: LLMAccess;
  private readonly promptsAccess: PromptsAccess;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
  ) {
    this.relationDb = relationDb;
    this.llmAccess = llmAccess;
    this.promptsAccess = promptsAccess;
  }

  async matchStrategy(
    input: MatchStrategyInput,
    _context: unknown,
    output: MatchStrategyOutput,
  ): Promise<boolean> {
    const rows = this.relationDb.queryRaw<AgentStrategyRecord>(
      `SELECT * FROM ${AGENT_STRATEGY_TABLE} WHERE enable = 1`,
    );
    if (rows.length === 0) {
      output.strategy_id = this.getDefaultStrategyId();
      return true;
    }

    const candidates = rows.filter(
      (r) =>
        input.task_complexity >= r.suitable_complexity_min &&
        input.task_complexity <= r.suitable_complexity_max,
    );
    if (candidates.length === 0) {
      output.strategy_id = this.getDefaultStrategyId();
      return true;
    }
    if (candidates.length === 1) {
      output.strategy_id = candidates[0].strategy_id;
      return true;
    }

    const config = this.getConfig();
    if (!config || !config.match_prompt_template_id) {
      output.strategy_id = candidates[0].strategy_id;
      return true;
    }

    try {
      const candidateList = candidates.map((c) => ({
        strategy_id: c.strategy_id,
        label: c.strategy_label,
      }));
      const prompt = `Task: ${input.task_content}\nComplexity: ${input.task_complexity}\nDomain: ${input.task_domain}\nCandidates: ${JSON.stringify(candidateList)}\nSelect best strategy_id:`;
      const result = await this.callLLMForDecision(prompt);
      const matched = JSON.parse(result);
      output.strategy_id = matched.strategy_id ?? candidates[0].strategy_id;
    } catch {
      output.strategy_id = candidates[0].strategy_id;
    }
    return true;
  }

  async getStrategy(
    input: GetStrategyInput,
    _context: unknown,
    output: GetStrategyOutput,
  ): Promise<boolean> {
    const rows = this.relationDb.queryRaw<AgentStrategyRecord>(
      `SELECT * FROM ${AGENT_STRATEGY_TABLE} WHERE strategy_id = ?`,
      [input.strategy_id],
    );
    if (rows.length === 0) {
      output.error = `Strategy not found: ${input.strategy_id}`;
      return false;
    }
    output.strategy_id = rows[0].strategy_id;
    output.strategy_label = rows[0].strategy_label;
    output.execution_rule = rows[0].execution_rule;
    return true;
  }

  async soStrategy(
    input: SoStrategyInput,
    _context: unknown,
    output: SoStrategyOutput,
  ): Promise<boolean> {
    let sql = `SELECT * FROM ${AGENT_STRATEGY_TABLE}`;
    const params: unknown[] = [];
    if (input.conditions && input.conditions.length > 0) {
      const clauses = input.conditions.map((c) => `${c.field} ${c.operator} ?`);
      sql += ` WHERE ${clauses.join(' AND ')}`;
      for (const c of input.conditions) params.push(c.value);
    }
    if (input.order_by && input.order_by.length > 0) {
      sql += ` ORDER BY ${input.order_by.map((o) => `${o.field} ${o.direction}`).join(', ')}`;
    }
    if (input.page) {
      sql += ` LIMIT ${input.page.page_size} OFFSET ${(input.page.page - 1) * input.page.page_size}`;
    }
    output.strategies = this.relationDb.queryRaw<AgentStrategyRecord>(sql, params);
    return true;
  }

  async addStrategy(
    input: AddStrategyInput,
    _context: unknown,
    output: AddStrategyOutput,
  ): Promise<boolean> {
    if (!input.strategy_label) { output.error = 'strategy_label required'; return false; }
    if (input.suitable_complexity_min > input.suitable_complexity_max) {
      output.error = 'suitable_complexity_min <= suitable_complexity_max required';
      return false;
    }

    const dup = this.relationDb.queryRaw<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${AGENT_STRATEGY_TABLE} WHERE strategy_label = ?`,
      [input.strategy_label],
    );
    if (dup[0]?.count > 0) { output.error = `label exists: ${input.strategy_label}`; return false; }

    const strategyId = IdGenerator.uuid();
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_STRATEGY_TABLE} (id, created, updated, strategy_id, strategy_label, suitable_complexity_min, suitable_complexity_max, suitable_domains, execution_rule, enable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [IdGenerator.uuid(), now, now, strategyId, input.strategy_label, input.suitable_complexity_min, input.suitable_complexity_max, input.suitable_domains, input.execution_rule],
    );
    output.strategy_id = strategyId;
    return true;
  }

  async updateStrategy(
    input: UpdateStrategyInput,
    _context: unknown,
    output: UpdateStrategyOutput,
  ): Promise<boolean> {
    const rows = this.relationDb.queryRaw<AgentStrategyRecord>(
      `SELECT * FROM ${AGENT_STRATEGY_TABLE} WHERE strategy_id = ?`, [input.strategy_id],
    );
    if (rows.length === 0) { output.error = `not found: ${input.strategy_id}`; return false; }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.strategy_label !== undefined) { sets.push('strategy_label = ?'); vals.push(input.strategy_label); }
    if (input.suitable_complexity_min !== undefined) { sets.push('suitable_complexity_min = ?'); vals.push(input.suitable_complexity_min); }
    if (input.suitable_complexity_max !== undefined) { sets.push('suitable_complexity_max = ?'); vals.push(input.suitable_complexity_max); }
    if (input.suitable_domains !== undefined) { sets.push('suitable_domains = ?'); vals.push(input.suitable_domains); }
    if (input.execution_rule !== undefined) { sets.push('execution_rule = ?'); vals.push(input.execution_rule); }
    if (input.enable !== undefined) { sets.push('enable = ?'); vals.push(input.enable ? 1 : 0); }
    if (sets.length === 0) return true;

    sets.push('updated = ?');
    vals.push(Math.floor(Date.now() / 1000));
    vals.push(input.strategy_id);
    this.relationDb.executeRaw(`UPDATE ${AGENT_STRATEGY_TABLE} SET ${sets.join(', ')} WHERE strategy_id = ?`, vals);
    return true;
  }

  async configAgentStrategy(
    input: ConfigAgentStrategyInput,
    _context: unknown,
    output: ConfigAgentStrategyOutput,
  ): Promise<boolean> {
    let config = this.getConfig();
    if (!config) {
      const now = Math.floor(Date.now() / 1000);
      this.relationDb.executeRaw(
        `INSERT INTO ${AGENT_STRATEGY_CONFIG_TABLE} (id, created, updated, default_strategy_id, match_prompt_template_id) VALUES (?, ?, ?, ?, ?)`,
        [IdGenerator.uuid(), now, now, '', ''],
      );
      config = this.getConfig();
    }
    if (!config) { output.error = 'config init failed'; return false; }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.default_strategy_id !== undefined) {
      const ex = this.relationDb.queryRaw<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${AGENT_STRATEGY_TABLE} WHERE strategy_id = ? AND enable = 1`,
        [input.default_strategy_id],
      );
      if (ex[0]?.count === 0) { output.error = `strategy not found: ${input.default_strategy_id}`; return false; }
      sets.push('default_strategy_id = ?'); vals.push(input.default_strategy_id);
    }
    if (input.match_prompt_template_id !== undefined) {
      sets.push('match_prompt_template_id = ?'); vals.push(input.match_prompt_template_id);
    }
    if (sets.length > 0) {
      sets.push('updated = ?'); vals.push(Math.floor(Date.now() / 1000)); vals.push(config.id);
      this.relationDb.executeRaw(`UPDATE ${AGENT_STRATEGY_CONFIG_TABLE} SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    output.config = this.getConfig();
    return true;
  }

  private getDefaultStrategyId(): string {
    const config = this.getConfig();
    return config?.default_strategy_id ?? '';
  }

  private getConfig(): AgentStrategyConfigRecord | null {
    const rows = this.relationDb.queryRaw<AgentStrategyConfigRecord>(
      `SELECT * FROM ${AGENT_STRATEGY_CONFIG_TABLE} LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  private async callLLMForDecision(prompt: string): Promise<string> {
    return prompt;
  }
}
