import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import type { InfoCoreAccess, MQCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentExecutionAccess } from '../../AgentExecution/access/AgentExecutionAccess';
import {
  AGENT_EVALUATION_TABLE, EVOLUTOR_AGENT_CONFIG_TABLE,
  type AgentEvaluationRecord, type EvolutorAgentConfigRecord,
  EvalWorkAgentInput, EvalWorkAgentOutput,
  EvalWriterAgentInput, EvalWriterAgentOutput,
  StartEvalScheduleInput, StartEvalScheduleOutput,
  StopEvalScheduleInput, StopEvalScheduleOutput,
  GetEvaluationInput, GetEvaluationOutput,
  GetEvolutionReportInput, GetEvolutionReportOutput,
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput,
} from '../domain/types';
import { BuildEvolutorAgentInput, BuildEvolutorAgentOutput } from '../../AgentBuilder/domain/types';
import { GetAgentInput, GetAgentOutput, UpdateAgentInput, UpdateAgentOutput } from '../../AgentLibrary/domain/types';
import { GetTraceInput, GetTraceOutput } from '../../AgentExecution/domain/types';
import { OptimizeAgentInput, OptimizeAgentOutput } from '../../AgentBuilder/domain/types';

export class EvolutorAgentService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly mqCore: MQCoreAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly agentExecution: AgentExecutionAccess,
  ) {}

  async evalWorkAgent(input: EvalWorkAgentInput, _ctx: unknown, output: EvalWorkAgentOutput): Promise<boolean> {
    const buildOut = new BuildEvolutorAgentOutput();
    await this.agentBuilder.buildEvolutorAgent(new BuildEvolutorAgentInput(), {}, buildOut);

    const config = this.getConfig();
    const threshold = config?.optimize_threshold ?? 60;

    const efficiencyScore = 50;
    const overall = Math.round((50 + 50 + efficiencyScore + 50) / 4);

    const suggestions: string[] = [];
    const needOptimize = overall < threshold;

    const evalId = IdGenerator.uuid();
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_EVALUATION_TABLE} (id, created, updated, eval_id, agent_id, eval_type, work_id, interact_id, scores, suggestions, need_optimize) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [IdGenerator.uuid(), now, now, evalId, input.agent_id, 'WORK_AGENT', input.work_id, input.interact_id, JSON.stringify({ correctness: 50, completeness: 50, efficiency: efficiencyScore, relevance: 50, overall }), JSON.stringify(suggestions), needOptimize ? 1 : 0],
    );

    await this.agentLibrary.updateAgent(
      Object.assign(new UpdateAgentInput(), { agent_id: input.agent_id, eval_score: overall }),
      {}, new UpdateAgentOutput(),
    );

    output.eval_id = evalId;
    output.scores = { correctness: 50, completeness: 50, efficiency: efficiencyScore, relevance: 50, overall };
    output.suggestions = suggestions;
    output.need_optimize = needOptimize;
    return true;
  }

  async evalWriterAgent(input: EvalWriterAgentInput, _ctx: unknown, output: EvalWriterAgentOutput): Promise<boolean> {
    const config = this.getConfig();
    const threshold = config?.optimize_threshold ?? 60;
    const overall = 60;
    const needOptimize = overall < threshold;

    const evalId = IdGenerator.uuid();
    const now = Math.floor(Date.now() / 1000);
    this.relationDb.executeRaw(
      `INSERT INTO ${AGENT_EVALUATION_TABLE} (id, created, updated, eval_id, agent_id, eval_type, work_id, interact_id, scores, suggestions, need_optimize) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [IdGenerator.uuid(), now, now, evalId, input.agent_id, 'WRITER_AGENT', input.work_id, input.interact_id, JSON.stringify({ clarity: 60, informativeness: 60, user_alignment: 60, conciseness: 60, overall }), '[]', needOptimize ? 1 : 0],
    );

    output.eval_id = evalId;
    output.scores = { clarity: 60, informativeness: 60, user_alignment: 60, conciseness: 60, overall };
    output.suggestions = [];
    output.need_optimize = needOptimize;
    return true;
  }

  async startEvalSchedule(input: StartEvalScheduleInput, _ctx: unknown, output: StartEvalScheduleOutput): Promise<boolean> {
    output.worker_id = IdGenerator.uuid();
    return true;
  }

  async stopEvalSchedule(_input: StopEvalScheduleInput, _ctx: unknown, output: StopEvalScheduleOutput): Promise<boolean> {
    return true;
  }

  async getEvaluation(input: GetEvaluationInput, _ctx: unknown, output: GetEvaluationOutput): Promise<boolean> {
    let sql = `SELECT * FROM ${AGENT_EVALUATION_TABLE} WHERE 1=1`;
    const params: unknown[] = [];
    if (input.agent_id) { sql += ` AND agent_id = ?`; params.push(input.agent_id); }
    if (input.eval_type) { sql += ` AND eval_type = ?`; params.push(input.eval_type); }
    if (input.conditions) { for (const c of input.conditions) { sql += ` AND ${c.field} ${c.operator} ?`; params.push(c.value); } }
    sql += ` ORDER BY created DESC`;
    if (input.page) sql += ` LIMIT ${input.page.page_size} OFFSET ${(input.page.page - 1) * input.page.page_size}`;
    output.evaluations = this.relationDb.queryRaw<AgentEvaluationRecord>(sql, params);
    return true;
  }

  async getEvolutionReport(input: GetEvolutionReportInput, _ctx: unknown, output: GetEvolutionReportOutput): Promise<boolean> {
    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(Object.assign(new GetAgentInput(), { agent_id: input.agent_id }), {}, getOut);
    if (getOut.agents.length === 0) { output.error = 'Agent not found'; return false; }
    const agent = getOut.agents[0];

    const days = input.time_range_days ?? 30;
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;

    const evals = this.relationDb.queryRaw<AgentEvaluationRecord>(
      `SELECT * FROM ${AGENT_EVALUATION_TABLE} WHERE agent_id = ? AND created >= ? ORDER BY created ASC`,
      [input.agent_id, cutoff],
    );

    const scoreTrend = evals.map((e) => {
      const s = JSON.parse(e.scores);
      return { date: e.created, overall: s.overall || 0, correctness: s.correctness || 0, completeness: s.completeness || 0 };
    });

    output.report = {
      agent_id: agent.agent_id, agent_name: agent.agent_name, agent_type: agent.agent_type,
      score_trend: scoreTrend,
      component_changes: [],
      usage_trend: [],
      current_score: agent.eval_score,
      evolution_summary: `Evolution report for ${agent.agent_name}`,
    };
    return true;
  }

  async configEvolutorAgent(input: ConfigEvolutorAgentInput, _ctx: unknown, output: ConfigEvolutorAgentOutput): Promise<boolean> {
    let config = this.getConfig();
    if (!config) {
      const now = Math.floor(Date.now() / 1000);
      this.relationDb.executeRaw(
        `INSERT INTO ${EVOLUTOR_AGENT_CONFIG_TABLE} (id, created, updated, eval_work_prompt_template_id, eval_write_prompt_template_id, optimize_threshold, eval_frequency_threshold, eval_schedule_interval_ms, eval_batch_size) VALUES (?, ?, ?, ?, ?, 60, 5, 3600000, 20)`,
        [IdGenerator.uuid(), now, now, '', ''],
      );
      config = this.getConfig();
    }
    if (!config) { output.error = 'config init failed'; return false; }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.eval_work_prompt_template_id !== undefined) { sets.push('eval_work_prompt_template_id = ?'); vals.push(input.eval_work_prompt_template_id); }
    if (input.eval_write_prompt_template_id !== undefined) { sets.push('eval_write_prompt_template_id = ?'); vals.push(input.eval_write_prompt_template_id); }
    if (input.optimize_threshold !== undefined) { sets.push('optimize_threshold = ?'); vals.push(input.optimize_threshold); }
    if (input.eval_frequency_threshold !== undefined) { sets.push('eval_frequency_threshold = ?'); vals.push(input.eval_frequency_threshold); }
    if (input.eval_schedule_interval_ms !== undefined) { sets.push('eval_schedule_interval_ms = ?'); vals.push(input.eval_schedule_interval_ms); }
    if (input.eval_batch_size !== undefined) { sets.push('eval_batch_size = ?'); vals.push(input.eval_batch_size); }
    if (sets.length > 0) {
      sets.push('updated = ?'); vals.push(Math.floor(Date.now() / 1000)); vals.push(config.id);
      this.relationDb.executeRaw(`UPDATE ${EVOLUTOR_AGENT_CONFIG_TABLE} SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    output.config = this.getConfig();
    return true;
  }

  private getConfig(): EvolutorAgentConfigRecord | null {
    const rows = this.relationDb.queryRaw<EvolutorAgentConfigRecord>(
      `SELECT * FROM ${EVOLUTOR_AGENT_CONFIG_TABLE} LIMIT 1`,
    );
    return rows[0] ?? null;
  }
}
