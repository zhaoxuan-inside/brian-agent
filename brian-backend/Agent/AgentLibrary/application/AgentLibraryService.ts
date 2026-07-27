import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  AGENT_TABLE, AGENT_USAGE_TABLE, AGENT_OPT_RULE_TABLE, AGENT_LIBRARY_CONFIG_TABLE,
  type AgentRecord, type AgentLibraryConfigRecord, type AgentOptRuleRecord,
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

const VALID_AGENT_TYPES = ['WORKER', 'PLANNER', 'WRITER', 'EVOLUTOR'];
const SYSTEM_TYPES = ['PLANNER', 'WRITER', 'EVOLUTOR'];

export class AgentLibraryService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  async addAgent(input: AddAgentInput, _ctx: unknown, output: AddAgentOutput): Promise<boolean> {
    if (!input.agent_id) { output.error = 'agent_id required'; return false; }
    if (!VALID_AGENT_TYPES.includes(input.agent_type)) { output.error = 'invalid agent_type'; return false; }
    if (!input.strategy_id) { output.error = 'strategy_id required'; return false; }

    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_TABLE} (id, created, updated, agent_id, agent_name, agent_type, strategy_id, llm_id, soul_id, task_signature, usage_count, eval_score, enable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 50, 1)`,
      [IdGenerator.uuid(), now, now, input.agent_id, input.agent_name, input.agent_type, input.strategy_id, input.llm_id, input.soul_id, input.task_signature],
    );
    output.agent_id = input.agent_id;
    return true;
  }

  async matchAgent(input: MatchAgentInput, _ctx: unknown, output: MatchAgentOutput): Promise<boolean> {
    const config = this.getConfig();
    const threshold = input.similarity_threshold ?? config?.similarity_threshold ?? 0.7;

    const rows = this.relationDb.queryRaw<AgentRecord>(
      `SELECT * FROM ${AGENT_TABLE} WHERE enable = 1`,
    );
    let candidates = rows;
    if (input.agent_type) {
      candidates = candidates.filter((r) => r.agent_type === input.agent_type);
    }
    if (candidates.length === 0) { output.agent_id = ''; return true; }

    const promptTemplateId = config?.prompt_template_id;
    if (promptTemplateId) {
      try {
        const best = await this.llmMatchAgent(input.task_signature, candidates);
        if (best && best.score >= threshold) {
          const found = this.relationDb.queryRaw<AgentRecord>(
            `SELECT * FROM ${AGENT_TABLE} WHERE agent_id = ? AND enable = 1`, [best.agent_id],
          );
          if (found.length > 0) {
            output.agent_id = best.agent_id;
            output.similarity_score = best.score;
            return true;
          }
        }
      } catch { /* fall through to empty match */ }
    }

    let bestScore = 0;
    let bestId = '';
    for (const c of candidates) {
      const score = this.simpleSimilarity(input.task_signature, c.task_signature);
      if (score > bestScore) { bestScore = score; bestId = c.agent_id; }
    }
    if (bestScore >= threshold) {
      output.agent_id = bestId;
      output.similarity_score = bestScore;
    }
    return true;
  }

  async updateAgent(input: UpdateAgentInput, _ctx: unknown, output: UpdateAgentOutput): Promise<boolean> {
    const rows = this.relationDb.queryRaw<AgentRecord>(
      `SELECT * FROM ${AGENT_TABLE} WHERE agent_id = ?`, [input.agent_id],
    );
    if (rows.length === 0) { output.error = `agent not found: ${input.agent_id}`; return false; }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.agent_name !== undefined) { sets.push('agent_name = ?'); vals.push(input.agent_name); }
    if (input.task_signature !== undefined) { sets.push('task_signature = ?'); vals.push(input.task_signature); }
    if (input.eval_score !== undefined) { sets.push('eval_score = ?'); vals.push(input.eval_score); }
    if (input.enable !== undefined) { sets.push('enable = ?'); vals.push(input.enable ? 1 : 0); }
    if (input.strategy_id !== undefined) { sets.push('strategy_id = ?'); vals.push(input.strategy_id); }
    if (sets.length === 0) return true;
    sets.push('updated = ?'); vals.push(Math.floor(Date.now() / 1000)); vals.push(input.agent_id);
    this.relationDb.executeRaw(`UPDATE ${AGENT_TABLE} SET ${sets.join(', ')} WHERE agent_id = ?`, vals);
    return true;
  }

  async recordAgentUsage(input: RecordAgentUsageInput, _ctx: unknown, output: RecordAgentUsageOutput): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_USAGE_TABLE} (id, created, updated, agent_id, work_id, interact_id, usage_context)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [IdGenerator.uuid(), now, now, input.agent_id, input.work_id, input.interact_id, input.usage_context ?? ''],
    );
    this.relationDb.executeRaw(
      `UPDATE ${AGENT_TABLE} SET usage_count = usage_count + 1, updated = ? WHERE agent_id = ?`,
      [now, input.agent_id],
    );
    return true;
  }

  async getAgent(input: GetAgentInput, _ctx: unknown, output: GetAgentOutput): Promise<boolean> {
    if (input.agent_id) {
      const rows = this.relationDb.queryRaw<AgentRecord>(
        `SELECT * FROM ${AGENT_TABLE} WHERE agent_id = ?`, [input.agent_id],
      );
      output.agents = rows;
      return true;
    }

    let sql = `SELECT * FROM ${AGENT_TABLE} WHERE 1=1`;
    const params: unknown[] = [];
    if (input.agent_type) { sql += ` AND agent_type = ?`; params.push(input.agent_type); }
    if (input.conditions) {
      for (const c of input.conditions) { sql += ` AND ${c.field} ${c.operator} ?`; params.push(c.value); }
    }
    if (input.order_by) {
      sql += ` ORDER BY ${input.order_by.map((o) => `${o.field} ${o.direction}`).join(', ')}`;
    }
    if (input.page) {
      sql += ` LIMIT ${input.page.page_size} OFFSET ${(input.page.page - 1) * input.page.page_size}`;
    }
    output.agents = this.relationDb.queryRaw<AgentRecord>(sql, params);
    return true;
  }

  async ageAgent(_input: AgeAgentInput, _ctx: unknown, output: AgeAgentOutput): Promise<boolean> {
    const rules = this.relationDb.queryRaw<AgentOptRuleRecord>(
      `SELECT * FROM ${AGENT_OPT_RULE_TABLE}`,
    );
    if (rules.length === 0) return true;

    const allAgents = this.relationDb.queryRaw<AgentRecord>(
      `SELECT * FROM ${AGENT_TABLE} WHERE enable = 1`,
    );

    const agedSet = new Set<string>();
    for (const rule of rules) {
      const cutoff = Math.floor(Date.now() / 1000) - rule.days * 86400;

      for (const agent of allAgents) {
        if (SYSTEM_TYPES.includes(agent.agent_type)) continue;
        const usageCount = this.relationDb.queryRaw<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${AGENT_USAGE_TABLE} WHERE agent_id = ? AND created >= ?`,
          [agent.agent_id, cutoff],
        );
        const count = usageCount[0]?.count ?? 0;
        if (count < rule.min_usage_count && agent.eval_score < rule.min_eval_score) {
          agedSet.add(agent.agent_id);
        }
      }
    }

    if (agedSet.size > 0) {
      const now = Math.floor(Date.now() / 1000);
      for (const id of agedSet) {
        this.relationDb.executeRaw(
          `UPDATE ${AGENT_TABLE} SET enable = 0, updated = ? WHERE agent_id = ?`, [now, id],
        );
      }
    }
    output.aged_count = agedSet.size;
    return true;
  }

  async getAgentRule(input: GetAgentRuleInput, _ctx: unknown, output: GetAgentRuleOutput): Promise<boolean> {
    let sql = `SELECT * FROM ${AGENT_OPT_RULE_TABLE}`;
    const params: unknown[] = [];
    if (input.conditions) {
      const clauses = input.conditions.map((c) => `${c.field} ${c.operator} ?`);
      sql += ` WHERE ${clauses.join(' AND ')}`;
      for (const c of input.conditions) params.push(c.value);
    }
    if (input.order_by) sql += ` ORDER BY ${input.order_by.map((o) => `${o.field} ${o.direction}`).join(', ')}`;
    if (input.page) sql += ` LIMIT ${input.page.page_size} OFFSET ${(input.page.page - 1) * input.page.page_size}`;
    output.rules = this.relationDb.queryRaw<AgentOptRuleRecord>(sql, params);
    return true;
  }

  async updateAgentRule(input: UpdateAgentRuleInput, _ctx: unknown, output: UpdateAgentRuleOutput): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    for (const op of input.operations) {
      if (op.type === 'INSERT') {
        this.relationDb.executeRaw(
          `INSERT INTO ${AGENT_OPT_RULE_TABLE} (id, created, updated, days, min_usage_count, min_eval_score) VALUES (?, ?, ?, ?, ?, ?)`,
          [IdGenerator.uuid(), now, now, op.data.days, op.data.min_usage_count, op.data.min_eval_score],
        );
      } else if (op.type === 'UPDATE') {
        this.relationDb.executeRaw(
          `UPDATE ${AGENT_OPT_RULE_TABLE} SET days = ?, min_usage_count = ?, min_eval_score = ?, updated = ? WHERE id = ?`,
          [op.data.days, op.data.min_usage_count, op.data.min_eval_score, now, op.id],
        );
      } else if (op.type === 'DELETE') {
        this.relationDb.executeRaw(`DELETE FROM ${AGENT_OPT_RULE_TABLE} WHERE id = ?`, [op.id]);
      }
    }
    return true;
  }

  async configAgentLibrary(input: ConfigAgentLibraryInput, _ctx: unknown, output: ConfigAgentLibraryOutput): Promise<boolean> {
    let config = this.getConfig();
    if (!config) {
      const now = Math.floor(Date.now() / 1000);
      this.relationDb.executeRaw(
        `INSERT INTO ${AGENT_LIBRARY_CONFIG_TABLE} (id, created, updated, prompt_template_id, similarity_threshold, max_agent_count) VALUES (?, ?, ?, ?, 0.7, 100)`,
        [IdGenerator.uuid(), now, now, ''],
      );
      config = this.getConfig();
    }
    if (!config) { output.error = 'config init failed'; return false; }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.prompt_template_id !== undefined) { sets.push('prompt_template_id = ?'); vals.push(input.prompt_template_id); }
    if (input.similarity_threshold !== undefined) { sets.push('similarity_threshold = ?'); vals.push(input.similarity_threshold); }
    if (input.max_agent_count !== undefined) { sets.push('max_agent_count = ?'); vals.push(input.max_agent_count); }

    if (sets.length > 0) {
      sets.push('updated = ?'); vals.push(Math.floor(Date.now() / 1000)); vals.push(config.id);
      this.relationDb.executeRaw(`UPDATE ${AGENT_LIBRARY_CONFIG_TABLE} SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    output.config = this.getConfig();

    if (input.max_agent_count !== undefined && output.config) {
      const count = this.relationDb.queryRaw<{ count: number }>(
        `SELECT COUNT(*) as count FROM ${AGENT_TABLE} WHERE enable = 1`,
      );
      if (count[0]?.count > input.max_agent_count) {
        const ageOutput = new AgeAgentOutput();
        await this.ageAgent(new AgeAgentInput(), _ctx, ageOutput);
      }
    }
    return true;
  }

  private getConfig(): AgentLibraryConfigRecord | null {
    const rows = this.relationDb.queryRaw<AgentLibraryConfigRecord>(
      `SELECT * FROM ${AGENT_LIBRARY_CONFIG_TABLE} LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  private async llmMatchAgent(
    taskSig: string, candidates: AgentRecord[],
  ): Promise<{ agent_id: string; score: number } | null> {
    const candidateList = candidates.map((c) => ({ agent_id: c.agent_id, signature: c.task_signature }));
    const prompt = `Task signature: "${taskSig}"\nCandidates: ${JSON.stringify(candidateList)}\nReturn JSON: {"agent_id": "...", "score": 0.0-1.0}`;
    try {
      const response = prompt;
      const result = JSON.parse(response);
      if (result.agent_id && typeof result.score === 'number') return result;
    } catch { /* ignore */ }
    return null;
  }

  private simpleSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
    const union = new Set([...wordsA, ...wordsB]);
    return intersection / union.size;
  }
}
