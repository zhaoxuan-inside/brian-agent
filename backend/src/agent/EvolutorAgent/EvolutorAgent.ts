import type { AgentDatabase } from '../infra/dbTypes';
import { Input, Context, Output } from '../../shared/base';
import { logger } from '../../infrastructure/logger';
import { AopProxy } from '../infra/aopProxy';
import { generateId } from '../AgentLibrary/agentTypes';
import type { LLMService } from '../../core/llm/LLMService';
import type { ChatCompletionRequest } from '../../base/LLMWrapper';

const MODULE = 'EvolutorAgent';

function ensureTable(db: AgentDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_evaluation (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    eval_id TEXT NOT NULL UNIQUE, agent_id TEXT NOT NULL,
    eval_type TEXT NOT NULL, work_id TEXT NOT NULL DEFAULT '',
    interact_id TEXT NOT NULL DEFAULT '', scores TEXT NOT NULL DEFAULT '{}',
    suggestions TEXT, need_optimize INTEGER NOT NULL DEFAULT 0
  )`);
  db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_eval_agent_id ON agent_evaluation(agent_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_eval_eval_type ON agent_evaluation(eval_type)').run();

  db.exec(`CREATE TABLE IF NOT EXISTS evolutor_agent_config (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    eval_work_prompt_template_id TEXT NOT NULL DEFAULT '',
    eval_write_prompt_template_id TEXT NOT NULL DEFAULT '',
    optimize_threshold INTEGER NOT NULL DEFAULT 60,
    eval_frequency_threshold INTEGER NOT NULL DEFAULT 5,
    eval_schedule_interval_ms INTEGER NOT NULL DEFAULT 3600000,
    eval_batch_size INTEGER NOT NULL DEFAULT 20
  )`);
  const econf = db.prepare('SELECT * FROM evolutor_agent_config LIMIT 1').get() as Record<string, unknown> | undefined;
  if (!econf) {
    const now = Date.now();
    db.prepare('INSERT INTO evolutor_agent_config (id,created,updated) VALUES (?,?,?)').run(generateId(), now, now);
  }
}

class EvalWorkAgentInput extends Input {
  agent_id!: string; work_id!: string; interact_id!: string;
  task_content!: string; agent_output!: string; trace_id!: string;
  constructor(d: Partial<EvalWorkAgentInput>) { super(d); Object.assign(this, d); }
}
class EvalWorkAgentContext extends Context { }
class EvalWorkAgentOutput extends Output { eval_id?: string; scores?: Record<string, number>; suggestions?: string[]; need_optimize?: boolean; }

class EvalWriterAgentInput extends Input {
  agent_id!: string; work_id!: string; interact_id!: string;
  user_query!: string; final_response!: string;
  agent_results!: { agent_id: string; task_content: string; result: string }[];
  constructor(d: Partial<EvalWriterAgentInput>) { super(d); Object.assign(this, d); }
}
class EvalWriterAgentContext extends Context { }
class EvalWriterAgentOutput extends Output { eval_id?: string; scores?: Record<string, number>; suggestions?: string[]; need_optimize?: boolean; }

class StartEvalScheduleInput extends Input {
  interval_ms?: number; eval_batch_size?: number;
  constructor(d: Partial<StartEvalScheduleInput>) { super(d); Object.assign(this, d); }
}
class StartEvalScheduleContext extends Context { }
class StartEvalScheduleOutput extends Output { worker_id?: string; }

class StopEvalScheduleInput extends Input { worker_id?: string; constructor(d: Partial<StopEvalScheduleInput>) { super(d); Object.assign(this, d); } }
class StopEvalScheduleContext extends Context { }
class StopEvalScheduleOutput extends Output { }

class GetEvaluationInput extends Input {
  agent_id?: string; eval_type?: string;
  conditions?: string; order_by?: string; page_num?: number; page_size?: number;
  constructor(d: Partial<GetEvaluationInput>) { super(d); Object.assign(this, d); }
}
class GetEvaluationContext extends Context { }
class GetEvaluationOutput extends Output { evaluations?: Record<string, unknown>[]; }

class GetEvolutionReportInput extends Input {
  agent_id!: string; time_range_days?: number;
  constructor(d: Partial<GetEvolutionReportInput>) { super(d); Object.assign(this, d); }
}
class GetEvolutionReportContext extends Context { }
class GetEvolutionReportOutput extends Output { report?: Record<string, unknown>; }

class ConfigEvolutorAgentInput extends Input {
  eval_work_prompt_template_id?: string; eval_write_prompt_template_id?: string;
  optimize_threshold?: number; eval_frequency_threshold?: number;
  eval_schedule_interval_ms?: number; eval_batch_size?: number;
  constructor(d: Partial<ConfigEvolutorAgentInput>) { super(d); Object.assign(this, d); }
}
class ConfigEvolutorAgentContext extends Context { }
class ConfigEvolutorAgentOutput extends Output {
  eval_work_prompt_template_id?: string; eval_write_prompt_template_id?: string;
  optimize_threshold?: number; eval_frequency_threshold?: number;
  eval_schedule_interval_ms?: number; eval_batch_size?: number;
}

export { EvalWorkAgentInput, EvalWriterAgentInput, StartEvalScheduleInput, StopEvalScheduleInput, GetEvaluationInput, GetEvolutionReportInput, ConfigEvolutorAgentInput };
export { EvalWorkAgentContext, EvalWriterAgentContext, StartEvalScheduleContext, StopEvalScheduleContext, GetEvaluationContext, GetEvolutionReportContext, ConfigEvolutorAgentContext };
export { EvalWorkAgentOutput, EvalWriterAgentOutput, StartEvalScheduleOutput, StopEvalScheduleOutput, GetEvaluationOutput, GetEvolutionReportOutput, ConfigEvolutorAgentOutput };

export class EvolutorAgentService {
  private db: AgentDatabase;
  private activeIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(db: AgentDatabase, private llmService?: LLMService) {
    this.db = db;
    ensureTable(db);
  }

  async evalWorkAgent(input: EvalWorkAgentInput, _context: EvalWorkAgentContext, output: EvalWorkAgentOutput): Promise<boolean> {
    logger.info(MODULE, '[evalWorkAgent] start', { agent_id: input.agent_id });

    const agent = this.db.prepare('SELECT * FROM agent WHERE agent_id = ?').get(input.agent_id) as Record<string, unknown> | undefined;
    if (!agent) return false;

    let scores: Record<string, number>;

    if (this.llmService) {
      try {
        const request: ChatCompletionRequest = {
          model: '',
          messages: [
            { role: 'system', content: 'You are an evaluation agent. Score a worker agent\'s output on 4 dimensions (0-100): correctness (accuracy), completeness (thoroughness), efficiency (token/iteration efficiency), relevance (task alignment). Output JSON: {"correctness":N,"completeness":N,"efficiency":N,"relevance":N,"overall":N}.' },
            { role: 'user', content: `Task: ${input.task_content}\n\nAgent Output: ${input.agent_output}\n\nEvaluate and output JSON only.` },
          ],
          temperature: 0.1,
          maxTokens: 512,
        };
        const resp = await this.llmService.chatCompletion(request);
        const content = resp.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          scores = JSON.parse(jsonMatch[0]);
        } else {
          scores = this.heuristicEvalWork(input);
        }
      } catch {
        scores = this.heuristicEvalWork(input);
      }
    } else {
      scores = this.heuristicEvalWork(input);
    }

    const overall = scores.overall || Math.round((Object.values(scores).reduce((a, b) => a + b, 0)) / Math.max(Object.keys(scores).length, 1));
    scores.overall = overall;

    const evalId = generateId();
    const config = this.db.prepare('SELECT * FROM evolutor_agent_config LIMIT 1').get() as Record<string, unknown>;
    const optimizeThreshold = Number(config?.optimize_threshold) || 60;
    const needOptimize = overall < optimizeThreshold;

    const now = Date.now();
    this.db.prepare(`INSERT INTO agent_evaluation (id,created,updated,eval_id,agent_id,eval_type,work_id,interact_id,scores,suggestions,need_optimize)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      generateId(), now, now, evalId, input.agent_id, 'WORK_AGENT',
      input.work_id || '', input.interact_id || '', JSON.stringify(scores),
      needOptimize ? JSON.stringify(['Consider task content detail', 'Review agent configuration']) : null,
      needOptimize ? 1 : 0
    );
    this.db.prepare('UPDATE agent SET eval_score = ?, updated = ? WHERE agent_id = ?').run(overall, now, input.agent_id);

    output.eval_id = evalId;
    output.scores = scores;
    output.suggestions = needOptimize ? ['Consider task content detail', 'Review agent configuration'] : [];
    output.need_optimize = needOptimize;
    logger.info(MODULE, '[evalWorkAgent] done', { overall, need_optimize: needOptimize });
    return true;
  }

  async evalWriterAgent(input: EvalWriterAgentInput, _context: EvalWriterAgentContext, output: EvalWriterAgentOutput): Promise<boolean> {
    logger.info(MODULE, '[evalWriterAgent] start', { agent_id: input.agent_id });

    let scores: Record<string, number>;

    if (this.llmService) {
      try {
        const request: ChatCompletionRequest = {
          model: '',
          messages: [
            { role: 'system', content: 'You are an evaluation agent. Score a writer agent\'s response on 4 dimensions (0-100): clarity (readability), informativeness (content quality), user_alignment (matches user intent), conciseness (no fluff). Output JSON: {"clarity":N,"informativeness":N,"user_alignment":N,"conciseness":N,"overall":N}.' },
            { role: 'user', content: `User query: ${input.user_query}\n\nResponse: ${input.final_response}\n\nEvaluate and output JSON only.` },
          ],
          temperature: 0.1,
          maxTokens: 512,
        };
        const resp = await this.llmService.chatCompletion(request);
        const content = resp.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          scores = JSON.parse(jsonMatch[0]);
        } else {
          scores = this.heuristicEvalWriter(input);
        }
      } catch {
        scores = this.heuristicEvalWriter(input);
      }
    } else {
      scores = this.heuristicEvalWriter(input);
    }

    const overall = scores.overall || Math.round((Object.values(scores).reduce((a, b) => a + b, 0)) / Math.max(Object.keys(scores).length, 1));
    scores.overall = overall;

    const evalId = generateId();
    const config = this.db.prepare('SELECT * FROM evolutor_agent_config LIMIT 1').get() as Record<string, unknown>;
    const optimizeThreshold = Number(config?.optimize_threshold) || 60;
    const needOptimize = overall < optimizeThreshold;

    const now = Date.now();
    this.db.prepare(`INSERT INTO agent_evaluation (id,created,updated,eval_id,agent_id,eval_type,work_id,interact_id,scores,suggestions,need_optimize)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
      generateId(), now, now, evalId, input.agent_id, 'WRITER_AGENT',
      input.work_id || '', input.interact_id || '', JSON.stringify(scores),
      needOptimize ? JSON.stringify(['Consider restructuring the response', 'Review user profile alignment']) : null,
      needOptimize ? 1 : 0
    );
    this.db.prepare('UPDATE agent SET eval_score = ?, updated = ? WHERE agent_id = ?').run(overall, now, input.agent_id);

    output.eval_id = evalId;
    output.scores = scores;
    output.suggestions = needOptimize ? ['Consider restructuring the response', 'Review user profile alignment'] : [];
    output.need_optimize = needOptimize;
    logger.info(MODULE, '[evalWriterAgent] done', { overall, need_optimize: needOptimize });
    return true;
  }

  startEvalSchedule(input: StartEvalScheduleInput, _context: StartEvalScheduleContext, output: StartEvalScheduleOutput): boolean {
    logger.info(MODULE, '[startEvalSchedule] start');
    const workerId = generateId();
    const intervalMs = input.interval_ms || 3600000;
    const batchSize = input.eval_batch_size || 20;

    if (this.activeIntervals.has(workerId)) {
      clearInterval(this.activeIntervals.get(workerId));
    }
    const handle = setInterval(() => {
      this.processBatchEvaluation(batchSize);
    }, intervalMs);
    this.activeIntervals.set(workerId, handle);

    output.worker_id = workerId;
    logger.info(MODULE, '[startEvalSchedule] started', { worker_id: workerId, interval_ms: intervalMs });
    return true;
  }

  stopEvalSchedule(input: StopEvalScheduleInput, _context: StopEvalScheduleContext, _output: StopEvalScheduleOutput): boolean {
    logger.info(MODULE, '[stopEvalSchedule] start', { worker_id: input.worker_id });
    if (input.worker_id) {
      const handle = this.activeIntervals.get(input.worker_id);
      if (handle) {
        clearInterval(handle);
        this.activeIntervals.delete(input.worker_id);
      }
    } else {
      for (const [id, handle] of this.activeIntervals) {
        clearInterval(handle);
        this.activeIntervals.delete(id);
      }
    }
    logger.info(MODULE, '[stopEvalSchedule] done');
    return true;
  }

  getEvaluation(input: GetEvaluationInput, _context: GetEvaluationContext, output: GetEvaluationOutput): boolean {
    let sql = 'SELECT * FROM agent_evaluation WHERE 1=1';
    const params: unknown[] = [];
    if (input.agent_id) { sql += ' AND agent_id = ?'; params.push(input.agent_id); }
    if (input.eval_type) { sql += ' AND eval_type = ?'; params.push(input.eval_type); }
    sql += ' ORDER BY created DESC';
    if (input.page_num && input.page_size) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(input.page_size, (input.page_num - 1) * input.page_size);
    }
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    output.evaluations = rows.map((r: Record<string, unknown>) => ({
      ...r,
      scores: JSON.parse((r.scores as string) || '{}'),
      suggestions: r.suggestions ? JSON.parse(r.suggestions as string) : [],
      need_optimize: Boolean(r.need_optimize),
    }));
    return true;
  }

  getEvolutionReport(input: GetEvolutionReportInput, _context: GetEvolutionReportContext, output: GetEvolutionReportOutput): boolean {
    const agent = this.db.prepare('SELECT * FROM agent WHERE agent_id = ?').get(input.agent_id) as Record<string, unknown> | undefined;
    const days = input.time_range_days || 30;
    const cutoff = Date.now() - days * 86400 * 1000;
    const evaluations = this.db.prepare('SELECT * FROM agent_evaluation WHERE agent_id = ? AND created >= ? ORDER BY created ASC').all(input.agent_id, cutoff) as Record<string, unknown>[];

    const scoreTrend = evaluations.map(e => {
      const scores = JSON.parse((e.scores as string) || '{}');
      const date = new Date(e.created as number).toISOString().split('T')[0];
      return { date, ...scores as Record<string, unknown> };
    });

    output.report = {
      agent_id: input.agent_id,
      agent_name: agent?.agent_name || 'Unknown',
      agent_type: agent?.agent_type || 'Unknown',
      score_trend: scoreTrend,
      component_changes: [],
      usage_trend: [],
      current_score: agent?.eval_score || 50,
      evolution_summary: `Agent ${input.agent_id} has ${evaluations.length} evaluations in the last ${days} days. Current overall score: ${agent?.eval_score || 50}.`,
    };
    return true;
  }

  configEvolutorAgent(input: ConfigEvolutorAgentInput, _context: ConfigEvolutorAgentContext, output: ConfigEvolutorAgentOutput): boolean {
    logger.info(MODULE, '[configEvolutorAgent] start');
    const now = Date.now();
    const sets: string[] = ['updated = ?'];
    const params: unknown[] = [now];
    if (input.eval_work_prompt_template_id !== undefined) { sets.push('eval_work_prompt_template_id = ?'); params.push(input.eval_work_prompt_template_id); }
    if (input.eval_write_prompt_template_id !== undefined) { sets.push('eval_write_prompt_template_id = ?'); params.push(input.eval_write_prompt_template_id); }
    if (input.optimize_threshold !== undefined) { sets.push('optimize_threshold = ?'); params.push(input.optimize_threshold); }
    if (input.eval_frequency_threshold !== undefined) { sets.push('eval_frequency_threshold = ?'); params.push(input.eval_frequency_threshold); }
    if (input.eval_schedule_interval_ms !== undefined) { sets.push('eval_schedule_interval_ms = ?'); params.push(input.eval_schedule_interval_ms); }
    if (input.eval_batch_size !== undefined) { sets.push('eval_batch_size = ?'); params.push(input.eval_batch_size); }
    this.db.prepare(`UPDATE evolutor_agent_config SET ${sets.join(',')}`).run(...params);
    const config = this.db.prepare('SELECT * FROM evolutor_agent_config LIMIT 1').get() as Record<string, unknown>;
    output.eval_work_prompt_template_id = config.eval_work_prompt_template_id as string;
    output.eval_write_prompt_template_id = config.eval_write_prompt_template_id as string;
    output.optimize_threshold = Number(config.optimize_threshold) || 60;
    output.eval_frequency_threshold = Number(config.eval_frequency_threshold) || 5;
    output.eval_schedule_interval_ms = Number(config.eval_schedule_interval_ms) || 3600000;
    output.eval_batch_size = Number(config.eval_batch_size) || 20;
    logger.info(MODULE, '[configEvolutorAgent] done');
    return true;
  }

  private heuristicEvalWork(input: EvalWorkAgentInput): Record<string, number> {
    const contentLen = (input.task_content || '').length;
    const outputLen = (input.agent_output || '').length;
    const ratio = contentLen > 0 ? outputLen / contentLen : 1;
    const correctness = ratio > 0.8 && ratio < 5 ? 85 : ratio > 0.3 ? 65 : 40;
    const completeness = Math.min(100, Math.max(40, outputLen > 0 ? 60 + contentLen / 10 : 40));
    const efficiency = Math.min(100, Math.max(30, outputLen > 0 ? 80 : 30));
    const relevance = Math.min(100, Math.max(50, correctness > 60 ? 75 : 50));
    return { correctness, completeness, efficiency, relevance, overall: Math.round((correctness + completeness + efficiency + relevance) / 4) };
  }

  private heuristicEvalWriter(input: EvalWriterAgentInput): Record<string, number> {
    const respLen = (input.final_response || '').length;
    const queryLen = (input.user_query || '').length;
    const clarity = Math.min(100, Math.max(50, respLen > 0 ? 70 + queryLen / 20 : 50));
    const informativeness = Math.min(100, Math.max(40, respLen > 0 ? 60 + queryLen / 10 : 40));
    const userAlignment = Math.min(100, Math.max(50, respLen > 0 ? 65 : 50));
    const conciseness = Math.min(100, Math.max(50, respLen < 2000 ? 80 : 50));
    return { clarity, informativeness, user_alignment: userAlignment, conciseness, overall: Math.round((clarity + informativeness + userAlignment + conciseness) / 4) };
  }

  private processBatchEvaluation(batchSize: number): void {
    try {
      const rows = this.db.prepare('SELECT * FROM agent WHERE enable=1 AND agent_type=? ORDER BY updated DESC LIMIT ?').all('WORKER', batchSize) as Record<string, unknown>[];
      for (const row of rows) {
        const evalInput = new EvalWorkAgentInput({
          agent_id: row.agent_id as string, work_id: '', interact_id: '',
          task_content: (row.task_signature as string) || 'unknown',
          agent_output: 'periodic evaluation', trace_id: '',
        });
        const evalOut = new EvalWorkAgentOutput();
        this.evalWorkAgent(evalInput, new EvalWorkAgentContext(), evalOut);
      }
    } catch (e) {
      logger.warn(MODULE, '[processBatchEvaluation] error', { error: (e as Error).message });
    }
  }
}

export function createEvolutorAgentService(db: AgentDatabase, llmService?: LLMService): EvolutorAgentService {
  return AopProxy(new EvolutorAgentService(db, llmService));
}
