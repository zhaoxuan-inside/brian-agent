import type { RelationDBAccess, LLMAccess, PromptsAccess, MQAccess } from '@brian-agent/base';
import {
  IdGenerator, Operator, ValidationError, NotFoundError,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  SoPromptInput, SoPromptOutput,
  SendMQInput, SendMQOutput, MQContext,
  type DataObject, type Direction,
} from '@brian-agent/base';
import type { InfoCoreAccess, MQCoreAccess } from '@brian-agent/core';
import {
  StartWorkerInput, StartWorkerOutput, StopWorkerInput, StopWorkerOutput, MQCoreContext,
} from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import type { AgentExecutionAccess } from '../../AgentExecution/access/AgentExecutionAccess';
import {
  AGENT_EVALUATION_TABLE, EVOLUTOR_AGENT_CONFIG_TABLE,
  type AgentEvaluationRecord, type EvolutorAgentConfigRecord,
  EvolutorAgentContext,
  EvalWorkAgentInput, EvalWorkAgentOutput,
  EvalWriterAgentInput, EvalWriterAgentOutput,
  StartEvalScheduleInput, StartEvalScheduleOutput,
  StopEvalScheduleInput, StopEvalScheduleOutput,
  GetEvaluationInput, GetEvaluationOutput,
  GetEvolutionReportInput, GetEvolutionReportOutput,
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput,
} from '../domain/types';
import {
  BuildSystemAgentInput, BuildSystemAgentOutput,
  OptimizeAgentInput, OptimizeAgentOutput, AgentBuilderContext,
} from '../../AgentBuilder/domain/types';
import {
  GetAgentInput, GetAgentOutput, UpdateAgentInput, UpdateAgentOutput,
  AgeAgentInput, AgeAgentOutput, AgentLibraryContext,
  AGENT_USAGE_TABLE,
} from '../../AgentLibrary/domain/types';
import {
  GetTraceInput, GetTraceOutput, AgentExecutionContext,
} from '../../AgentExecution/domain/types';
import { parseJsonObject } from '../../shared/signature';

const OPTIMIZE_QUEUE = 'agent.optimize';
const EVAL_QUEUE = 'agent.eval';
const EVAL_SCHEDULE_QUEUE = 'agent.eval_schedule';

function mapEval(row: Record<string, unknown>): AgentEvaluationRecord {
  return {
    id: String(row.id),
    created: Number(row.created),
    updated: Number(row.updated),
    eval_id: String(row.eval_id),
    agent_id: String(row.agent_id),
    eval_type: String(row.eval_type),
    work_id: String(row.work_id),
    interact_id: String(row.interact_id),
    scores: String(row.scores),
    suggestions: String(row.suggestions),
    need_optimize: row.need_optimize === true || row.need_optimize === 1 || row.need_optimize === '1',
  };
}

export class EvolutorAgentService {
  private scheduleWorkerId = '';

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly mqAccess: MQAccess,
    private readonly mqCore: MQCoreAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly agentExecution: AgentExecutionAccess,
  ) {}

  async evalWorkAgent(
    input: EvalWorkAgentInput,
    ctx: EvolutorAgentContext,
    output: EvalWorkAgentOutput,
  ): Promise<boolean> {
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      interact_id: input.interact_id || ctx.interact_id,
    });
    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(Object.assign(new BuildSystemAgentInput(), { agent_type: 'EVOLUTOR' }), builderCtx, buildOut);

    const libCtx = Object.assign(new AgentLibraryContext(), builderCtx);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      libCtx,
      getOut,
    );
    const evolutor = getOut.agents[0];
    const llmId = evolutor?.llm_id || '';

    const config = await this.getConfig();
    const threshold = config?.optimize_threshold ?? 60;

    let traceData: unknown = null;
    if (input.trace_id) {
      try {
        const traceOut = new GetTraceOutput();
        await this.agentExecution.getTrace(
          Object.assign(new GetTraceInput(), { trace_id: input.trace_id }),
          Object.assign(new AgentExecutionContext(), ctx),
          traceOut,
        );
        traceData = traceOut.trace;
      } catch { /* best-effort */ }
    }

    let scores = {
      correctness: 50, completeness: 50, efficiency: 50, relevance: 50, overall: 50,
    };
    let suggestions: string[] = [];

    if (llmId && config?.eval_work_prompt_template_id) {
      try {
        const promptOut = new ExecPromptOutput();
        await this.promptsAccess.execPrompt(
          Object.assign(new ExecPromptInput(), {
            id: config.eval_work_prompt_template_id,
            variables: {
              task_content: input.task_content,
              agent_output: input.agent_output,
              trace: traceData,
            },
          }),
          new PromptContext(),
          promptOut,
        );
        if (promptOut.prompt) {
          const llmOut = new ExecLLMOutput();
          await this.llmAccess.execLLM(
            Object.assign(new ExecLLMInput(), { id: llmId, params: { prompt: promptOut.prompt } }),
            new LLMContext(),
            llmOut,
          );
          const parsed = parseJsonObject(llmOut.result);
          if (parsed) {
            const c = Number(parsed.correctness ?? 50);
            const comp = Number(parsed.completeness ?? 50);
            const eff = Number(parsed.efficiency ?? 50);
            const rel = Number(parsed.relevance ?? 50);
            scores = {
              correctness: c,
              completeness: comp,
              efficiency: eff,
              relevance: rel,
              overall: Number(parsed.overall ?? Math.round((c + comp + eff + rel) / 4)),
            };
            suggestions = Array.isArray(parsed.suggestions)
              ? (parsed.suggestions as unknown[]).map(String)
              : [];
          }
        }
      } catch { /* defaults */ }
    }

    // 从 trace 估算 efficiency（迭代越少越高）
    if (traceData && typeof traceData === 'object') {
      const iters = Number((traceData as { iterations?: unknown[] }).iterations?.length ?? 0);
      if (iters > 0) {
        scores.efficiency = Math.max(0, Math.min(100, 100 - iters * 5));
        scores.overall = Math.round(
          (scores.correctness + scores.completeness + scores.efficiency + scores.relevance) / 4,
        );
      }
    }

    const needOptimize = scores.overall < threshold;
    const evalId = IdGenerator.generate();
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_EVALUATION_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'eval_id', value: evalId },
      { field: 'agent_id', value: input.agent_id },
      { field: 'eval_type', value: 'WORK_AGENT' },
      { field: 'work_id', value: input.work_id },
      { field: 'interact_id', value: input.interact_id },
      { field: 'scores', value: JSON.stringify(scores) },
      { field: 'suggestions', value: JSON.stringify(suggestions) },
      { field: 'need_optimize', value: needOptimize ? 1 : 0 },
    ]);

    await this.agentLibrary.updateAgent(
      Object.assign(new UpdateAgentInput(), {
        agent_id: input.agent_id,
        eval_score: scores.overall,
      }),
      libCtx,
      new UpdateAgentOutput(),
    );

    if (needOptimize) {
      await this.mqAccess.sendMQ(
        Object.assign(new SendMQInput(), {
          data: {
            queue: OPTIMIZE_QUEUE,
            payload: {
              agent_id: input.agent_id,
              interact_id: input.interact_id,
              usage_feedback: suggestions.join('; '),
            },
          },
        }),
        new MQContext(),
        new SendMQOutput(),
      );
    }

    output.eval_id = evalId;
    output.scores = scores;
    output.suggestions = suggestions;
    output.need_optimize = needOptimize;
    return true;
  }

  async evalWriterAgent(
    input: EvalWriterAgentInput,
    ctx: EvolutorAgentContext,
    output: EvalWriterAgentOutput,
  ): Promise<boolean> {
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      interact_id: input.interact_id || ctx.interact_id,
    });
    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(Object.assign(new BuildSystemAgentInput(), { agent_type: 'EVOLUTOR' }), builderCtx, buildOut);
    const libCtx = Object.assign(new AgentLibraryContext(), builderCtx);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      libCtx,
      getOut,
    );
    const llmId = getOut.agents[0]?.llm_id || '';
    const config = await this.getConfig();
    const threshold = config?.optimize_threshold ?? 60;

    let scores = {
      clarity: 60, informativeness: 60, user_alignment: 60, conciseness: 60, overall: 60,
    };
    let suggestions: string[] = [];

    if (llmId && config?.eval_write_prompt_template_id) {
      try {
        const promptOut = new ExecPromptOutput();
        await this.promptsAccess.execPrompt(
          Object.assign(new ExecPromptInput(), {
            id: config.eval_write_prompt_template_id,
            variables: {
              user_query: input.user_query,
              final_response: input.final_response,
              agent_results: input.agent_results,
            },
          }),
          new PromptContext(),
          promptOut,
        );
        if (promptOut.prompt) {
          const llmOut = new ExecLLMOutput();
          await this.llmAccess.execLLM(
            Object.assign(new ExecLLMInput(), { id: llmId, params: { prompt: promptOut.prompt } }),
            new LLMContext(),
            llmOut,
          );
          const parsed = parseJsonObject(llmOut.result);
          if (parsed) {
            const clarity = Number(parsed.clarity ?? 60);
            const info = Number(parsed.informativeness ?? 60);
            const align = Number(parsed.user_alignment ?? 60);
            const conc = Number(parsed.conciseness ?? 60);
            scores = {
              clarity,
              informativeness: info,
              user_alignment: align,
              conciseness: conc,
              overall: Number(parsed.overall ?? Math.round((clarity + info + align + conc) / 4)),
            };
            suggestions = Array.isArray(parsed.suggestions)
              ? (parsed.suggestions as unknown[]).map(String)
              : [];
          }
        }
      } catch { /* defaults */ }
    }

    const needOptimize = scores.overall < threshold;
    const evalId = IdGenerator.generate();
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_EVALUATION_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'eval_id', value: evalId },
      { field: 'agent_id', value: input.agent_id },
      { field: 'eval_type', value: 'WRITER_AGENT' },
      { field: 'work_id', value: input.work_id },
      { field: 'interact_id', value: input.interact_id },
      { field: 'scores', value: JSON.stringify(scores) },
      { field: 'suggestions', value: JSON.stringify(suggestions) },
      { field: 'need_optimize', value: needOptimize ? 1 : 0 },
    ]);

    if (needOptimize) {
      await this.mqAccess.sendMQ(
        Object.assign(new SendMQInput(), {
          data: {
            queue: OPTIMIZE_QUEUE,
            payload: { agent_id: input.agent_id, interact_id: input.interact_id },
          },
        }),
        new MQContext(),
        new SendMQOutput(),
      );
    }

    output.eval_id = evalId;
    output.scores = scores;
    output.suggestions = suggestions;
    output.need_optimize = needOptimize;
    return true;
  }

  async startEvalSchedule(
    input: StartEvalScheduleInput,
    ctx: EvolutorAgentContext,
    output: StartEvalScheduleOutput,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const interval = input.interval_ms ?? config?.eval_schedule_interval_ms ?? 3600000;

    // optimize worker
    try {
      await this.mqCore.startWorker(
        Object.assign(new StartWorkerInput(), {
          queue: OPTIMIZE_QUEUE,
          interval: 1000,
          handler: async (msg: { payload?: unknown }) => {
            const payload = (msg.payload ?? msg) as Record<string, unknown>;
            await this.agentBuilder.optimizeAgent(
              Object.assign(new OptimizeAgentInput(), {
                agent_id: payload.agent_id,
                interact_id: payload.interact_id ?? '',
                usage_feedback: payload.usage_feedback,
              }),
              Object.assign(new AgentBuilderContext(), ctx),
              new OptimizeAgentOutput(),
            );
            return true;
          },
        }),
        new MQCoreContext(),
        new StartWorkerOutput(),
      );
    } catch { /* may exist */ }

    // eval worker (from execution)
    try {
      await this.mqCore.startWorker(
        Object.assign(new StartWorkerInput(), {
          queue: EVAL_QUEUE,
          interval: 1000,
          handler: async (msg: { payload?: unknown }) => {
            const payload = (msg.payload ?? msg) as Record<string, unknown>;
            if (payload.type === 'eval_work_agent' || payload.agent_output) {
              await this.evalWorkAgent(
                Object.assign(new EvalWorkAgentInput(), {
                  agent_id: payload.agent_id,
                  work_id: payload.work_id,
                  interact_id: payload.interact_id,
                  task_content: payload.task_content,
                  agent_output: payload.agent_output,
                  trace_id: payload.trace_id,
                }),
                ctx,
                new EvalWorkAgentOutput(),
              );
            }
            return true;
          },
        }),
        new MQCoreContext(),
        new StartWorkerOutput(),
      );
    } catch { /* may exist */ }

    const startOut = new StartWorkerOutput();
    await this.mqCore.startWorker(
      Object.assign(new StartWorkerInput(), {
        queue: EVAL_SCHEDULE_QUEUE,
        interval,
        handler: async () => {
          // 1. 扫描近期 usage，从 usage_context 还原 eval 输入（trace_id / task_content / agent_output）
          //    该 JSON 由 AgentExecution 在 recordAgentUsage 时写入，使评估闭环自描述。
          const cutoff = IdGenerator.now() - 7 * 24 * 60 * 60 * 1000;
          try {
            const usages = await this.relationDb.select(AGENT_USAGE_TABLE, {
              conditions: [{ field: 'created', operator: Operator.GE, value: cutoff }],
              page: { current: 1, size: input.eval_batch_size ?? config?.eval_batch_size ?? 20 },
            });
            for (const u of usages) {
              const ctxRaw = typeof u.usage_context === 'string' ? u.usage_context : '';
              const ctx = ctxRaw ? parseJsonObject(ctxRaw) : null;
              const traceId = ctx ? String(ctx.trace_id ?? '') : '';
              const taskContent = ctx ? String(ctx.task_content ?? '') : '';
              const agentOutput = ctx ? String(ctx.agent_output ?? '') : '';
              // 旧记录（无 usage_context 或缺少关键字段）跳过，避免发出空评估消息
              if (!traceId && !taskContent && !agentOutput) continue;
              await this.mqAccess.sendMQ(
                Object.assign(new SendMQInput(), {
                  data: {
                    queue: EVAL_QUEUE,
                    payload: {
                      type: 'eval_work_agent',
                      agent_id: u.agent_id,
                      work_id: u.work_id,
                      interact_id: u.interact_id,
                      task_content: taskContent,
                      agent_output: agentOutput,
                      trace_id: traceId,
                    },
                  },
                }),
                new MQContext(),
                new SendMQOutput(),
              );
            }
          } catch { /* best-effort */ }

          // 2. 评估闭环末尾触发老化：依据 agent_opt_rule 规则表对低活跃/低评分 Agent 老化淘汰。
          //    agent_opt_rule 表通过 RelationDBProvider 读取（在 AgentLibraryService.ageAgent 内完成）。
          try {
            await this.agentLibrary.ageAgent(
              new AgeAgentInput(),
              new AgentLibraryContext(),
              new AgeAgentOutput(),
            );
          } catch { /* best-effort */ }
          return true;
        },
      }),
      new MQCoreContext(),
      startOut,
    );

    this.scheduleWorkerId = startOut.worker_id;
    output.worker_id = startOut.worker_id;
    return true;
  }

  async stopEvalSchedule(
    input: StopEvalScheduleInput,
    _ctx: EvolutorAgentContext,
    _output: StopEvalScheduleOutput,
  ): Promise<boolean> {
    const id = (input as { worker_id?: string }).worker_id || this.scheduleWorkerId || EVAL_SCHEDULE_QUEUE;
    const stopOut = new StopWorkerOutput();
    await this.mqCore.stopWorker(
      Object.assign(new StopWorkerInput(), { identifier: id }),
      new MQCoreContext(),
      stopOut,
    );
    return true;
  }

  async getEvaluation(
    input: GetEvaluationInput,
    _ctx: EvolutorAgentContext,
    output: GetEvaluationOutput,
  ): Promise<boolean> {
    const conditions = [...(input.conditions ?? [])];
    if (input.agent_id) {
      conditions.push({ field: 'agent_id', operator: Operator.EQ, value: input.agent_id });
    }
    if (input.eval_type) {
      conditions.push({ field: 'eval_type', operator: Operator.EQ, value: input.eval_type });
    }
    const rows = await this.relationDb.select(AGENT_EVALUATION_TABLE, {
      conditions,
      order_by: input.order_by ?? [{ field: 'created', direction: 'DESC' as Direction }],
      page: input.page,
    });
    output.evaluations = rows.map(mapEval);
    return true;
  }

  async getEvolutionReport(
    input: GetEvolutionReportInput,
    _ctx: EvolutorAgentContext,
    output: GetEvolutionReportOutput,
  ): Promise<boolean> {
    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(
      Object.assign(new GetAgentInput(), { agent_id: input.agent_id }),
      new AgentLibraryContext(),
      getOut,
    );
    if (getOut.agents.length === 0) throw new NotFoundError('Agent', input.agent_id);
    const agent = getOut.agents[0];

    const days = input.time_range_days ?? 30;
    const cutoff = IdGenerator.now() - days * 24 * 60 * 60 * 1000;

    const evals = await this.relationDb.select(AGENT_EVALUATION_TABLE, {
      conditions: [
        { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
        { field: 'created', operator: Operator.GE, value: cutoff },
      ],
      order_by: [{ field: 'created', direction: 'ASC' as Direction }],
    });

    const scoreTrend = evals.map((e) => {
      let s: Record<string, number> = {};
      try { s = JSON.parse(String(e.scores)); } catch { /* */ }
      return {
        date: Number(e.created),
        overall: s.overall || 0,
        correctness: s.correctness || 0,
        completeness: s.completeness || 0,
      };
    });

    const usages = await this.relationDb.select(AGENT_USAGE_TABLE, {
      conditions: [
        { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
        { field: 'created', operator: Operator.GE, value: cutoff },
      ],
    });
    const byDay = new Map<string, number>();
    for (const u of usages) {
      const d = new Date(Number(u.created));
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const usageTrend = [...byDay.entries()].map(([date, count]) => ({ date, count }));

    const avg = scoreTrend.length
      ? Math.round(scoreTrend.reduce((a, b) => a + b.overall, 0) / scoreTrend.length)
      : agent.eval_score;

    output.report = {
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      agent_type: agent.agent_type,
      score_trend: scoreTrend,
      component_changes: [],
      usage_trend: usageTrend,
      current_score: agent.eval_score,
      evolution_summary:
        `Agent ${agent.agent_name} avg score ${avg} over ${days}d, ` +
        `${usages.length} usages, ${evals.length} evaluations.`,
    };
    return true;
  }

  async configEvolutorAgent(
    input: ConfigEvolutorAgentInput,
    _ctx: EvolutorAgentContext,
    output: ConfigEvolutorAgentOutput,
  ): Promise<boolean> {
    let config = await this.getConfig();
    if (!config) {
      const now = IdGenerator.now();
      await this.relationDb.insert(EVOLUTOR_AGENT_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'eval_work_prompt_template_id', value: '' },
        { field: 'eval_write_prompt_template_id', value: '' },
        { field: 'optimize_threshold', value: 60 },
        { field: 'eval_frequency_threshold', value: 5 },
        { field: 'eval_schedule_interval_ms', value: 3600000 },
        { field: 'eval_batch_size', value: 20 },
      ]);
      config = await this.getConfig();
    }
    if (!config) throw new ValidationError('config init failed');

    const data: DataObject[] = [];
    for (const key of ['eval_work_prompt_template_id', 'eval_write_prompt_template_id'] as const) {
      const val = input[key];
      if (val !== undefined) {
        if (val) {
          const so = new SoPromptOutput();
          await this.promptsAccess.soPrompt(
            Object.assign(new SoPromptInput(), {
              conditions: [{ field: 'id', operator: Operator.EQ, value: val }],
            }),
            new PromptContext(),
            so,
          );
          if (!so.list?.length) throw new ValidationError(`prompt 不存在: ${val}`);
        }
        data.push({ field: key, value: val });
      }
    }
    if (input.optimize_threshold !== undefined) {
      if (input.optimize_threshold < 0 || input.optimize_threshold > 100) {
        throw new ValidationError('optimize_threshold 必须在 0-100');
      }
      data.push({ field: 'optimize_threshold', value: input.optimize_threshold });
    }
    if (input.eval_frequency_threshold !== undefined) {
      data.push({ field: 'eval_frequency_threshold', value: input.eval_frequency_threshold });
    }
    if (input.eval_schedule_interval_ms !== undefined) {
      if (input.eval_schedule_interval_ms <= 0) throw new ValidationError('eval_schedule_interval_ms 必须 > 0');
      data.push({ field: 'eval_schedule_interval_ms', value: input.eval_schedule_interval_ms });
    }
    if (input.eval_batch_size !== undefined) {
      if (input.eval_batch_size <= 0) throw new ValidationError('eval_batch_size 必须 > 0');
      data.push({ field: 'eval_batch_size', value: input.eval_batch_size });
    }
    if (data.length > 0) {
      data.push({ field: 'updated', value: IdGenerator.now() });
      await this.relationDb.update(
        EVOLUTOR_AGENT_CONFIG_TABLE,
        data,
        [{ field: 'id', operator: Operator.EQ, value: config.id }],
      );
    }
    output.config = await this.getConfig();
    return true;
  }

  private async getConfig(): Promise<EvolutorAgentConfigRecord | null> {
    const row = await this.relationDb.selectOne(EVOLUTOR_AGENT_CONFIG_TABLE, []);
    if (!row) return null;
    return {
      id: String(row.id),
      created: Number(row.created),
      updated: Number(row.updated),
      eval_work_prompt_template_id: String(row.eval_work_prompt_template_id ?? ''),
      eval_write_prompt_template_id: String(row.eval_write_prompt_template_id ?? ''),
      optimize_threshold: Number(row.optimize_threshold ?? 60),
      eval_frequency_threshold: Number(row.eval_frequency_threshold ?? 5),
      eval_schedule_interval_ms: Number(row.eval_schedule_interval_ms ?? 3600000),
      eval_batch_size: Number(row.eval_batch_size ?? 20),
    };
  }
}
