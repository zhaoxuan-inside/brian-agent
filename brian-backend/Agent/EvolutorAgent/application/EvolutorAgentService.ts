import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, MQAccess } from '@brian-agent/base';
import { IdGenerator, Operator, ValidationError, NotFoundError, ExecLLMInput, ExecLLMOutput, LLMContext, PromptContext, SoPromptInput, SoPromptOutput, SendMQInput, SendMQOutput, MQContext, HandleResultType, PROMPT_IDS, type DataObject, type Direction } from '@brian-agent/base';
import type { InfoCoreAccess, MQCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import { StartWorkerInput, StartWorkerOutput, StopWorkerInput, StopWorkerOutput, MQCoreContext } from '@brian-agent/core';
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
  AGENT_USAGE_TABLE, AGENT_TABLE,
} from '../../AgentLibrary/domain/types';
import {
  GetTraceInput, GetTraceOutput, AgentExecutionContext,
} from '../../AgentExecution/domain/types';
import { TraceStore } from '../../AgentExecution/application/trace/TraceStore';
import { buildSingleAnswerTrace } from '../../AgentExecution/application/trace/TraceCodec';
import { parseJsonObject } from '../../shared/signature';
import { renderPromptWithFallback, resolveAgentLlm } from '../../shared/AgentKit';

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
  private readonly traceStore: TraceStore;

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
    private readonly llmCore?: LLMCoreAccess,
  ) {
    this.traceStore = new TraceStore(relationDb);
  }

  async evalWorkAgent(input: EvalWorkAgentInput, output: EvalWorkAgentOutput, ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // 错误信息（call_error / internal_error）不参与评估：直接跳过评分与优化触发
    if (input.handle_result_type === HandleResultType.CALL_ERROR || input.handle_result_type === HandleResultType.INTERNAL_ERROR) {
      return true;
    }
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      interact_id: input.interact_id || ctx.interact_id,
    });
    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(Object.assign(new BuildSystemAgentInput(), { agent_type: 'EVOLUTOR' }), buildOut, builderCtx);

    const libCtx = Object.assign(new AgentLibraryContext(), builderCtx);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      getOut,
      libCtx,
    );
    const evolutor = getOut.agents[0];
    const config = await this.getConfig();
    // LLM 绑定只存在于 LLMProvider 的 agent_llm：配置未指定时经 Core.matchLLM 解析
    let targetLlmId = config?.llm_id || '';
    if (!targetLlmId && evolutor?.agent_id && this.llmCore) {
      targetLlmId = await this.resolveLlm(evolutor.agent_id);
    }
    const threshold = config?.optimize_threshold ?? 60;

    let traceData: unknown = null;
    if (input.trace_id) {
      try {
        const traceOut = new GetTraceOutput();
        await this.agentExecution.soTrace(
          Object.assign(new GetTraceInput(), { trace_id: input.trace_id }),
          traceOut,
          Object.assign(new AgentExecutionContext(), ctx),
        );
        traceData = traceOut.trace;
      } catch { /* best-effort */ }
    }

    let scores = {
      correctness: 50, completeness: 50, efficiency: 50, relevance: 50, overall: 50,
    };
    let suggestions: string[] = [];

    let userFeedbackText = '';
    if (input.work_id) {
      try {
        const fbRows = this.relationDb.queryRaw<{ type: string; score: number }>(
          'SELECT "type", "score" FROM "user_feedback" WHERE "work_id" = ? ORDER BY "updated" DESC LIMIT 5',
          [input.work_id],
        );
        if (fbRows.length > 0) {
          userFeedbackText = fbRows.map((r) => `${r.type}:${r.score}`).join('; ');
        }
      } catch { /* feedback table may not exist on legacy DB */ }
    }

    const prompt = await this.renderPrompt(
      config?.eval_work_prompt_template_id,
      PROMPT_IDS.evalWork,
      {
        task_content: input.task_content,
        agent_output: input.agent_output,
        trace: traceData ? JSON.stringify(traceData) : '',
        user_feedback: userFeedbackText,
      },
    );

    try {
      const llmOut = new ExecLLMOutput();
      const ok = await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), { id: targetLlmId, prompt }),
        llmOut,
        new LLMContext(),
      );
      if (ok && llmOut.result) {
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

    // 不直接覆盖 eval_score，改用 usage_count 加权平均（旧评分权重=使用次数，新评估权重=1）
    await this.refreshEvalScore(input.agent_id, scores.overall);

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
        new SendMQOutput(),
        new MQContext(),
      );
    }

    output.agent_id = buildOut.agent_id;
    output.eval_id = evalId;
    output.scores = scores;
    output.suggestions = suggestions;
    output.need_optimize = needOptimize;
    return true;
  }

  async evalWriterAgent(input: EvalWriterAgentInput, output: EvalWriterAgentOutput, ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // 错误信息（call_error / internal_error）不参与评估：直接跳过评分与优化触发
    if (input.handle_result_type === HandleResultType.CALL_ERROR || input.handle_result_type === HandleResultType.INTERNAL_ERROR) {
      return true;
    }
    const startedAt = IdGenerator.now();
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      interact_id: input.interact_id || ctx.interact_id,
    });
    const buildOut = new BuildSystemAgentOutput();
    await this.agentBuilder.buildSystemAgent(Object.assign(new BuildSystemAgentInput(), { agent_type: 'EVOLUTOR' }), buildOut, builderCtx);
    const libCtx = Object.assign(new AgentLibraryContext(), builderCtx);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }),
      getOut,
      libCtx,
    );
    const evolutor = getOut.agents[0];
    const config = await this.getConfig();
    // LLM 绑定只存在于 LLMProvider 的 agent_llm：配置未指定时经 Core.matchLLM 解析
    let targetLlmId = config?.llm_id || '';
    if (!targetLlmId && evolutor?.agent_id && this.llmCore) {
      targetLlmId = await this.resolveLlm(evolutor.agent_id);
    }
    const threshold = config?.optimize_threshold ?? 60;

    let scores = {
      clarity: 60, informativeness: 60, user_alignment: 60, conciseness: 60, overall: 60,
    };
    let suggestions: string[] = [];

    const prompt = await this.renderPrompt(
      config?.eval_write_prompt_template_id,
      PROMPT_IDS.evalWrite,
      {
        task_content: input.user_query,
        final_response: input.final_response,
        agent_results: JSON.stringify(input.agent_results),
      },
    );

    let inputTokens = 0;
    let outputTokens = 0;
    let rawResponse = '';

    try {
      const llmOut = new ExecLLMOutput();
      const ok = await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), { id: targetLlmId, prompt }),
        llmOut,
        new LLMContext(),
      );
      inputTokens = Number(llmOut.input_tokens ?? 0);
      outputTokens = Number(llmOut.output_tokens ?? 0);
      rawResponse = String(llmOut.raw_response ?? llmOut.result ?? '');
      if (ok && llmOut.result) {
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
        new SendMQOutput(),
        new MQContext(),
      );
    }

    output.agent_id = buildOut.agent_id;
    output.eval_id = evalId;
    output.scores = scores;
    output.suggestions = suggestions;
    output.need_optimize = needOptimize;
    await this.recordTrace(output, {
      agentId: buildOut.agent_id,
      agentName: evolutor?.agent_name ?? buildOut.agent_id,
      taskContent: input.user_query,
      scores,
      suggestions,
      inputTokens,
      outputTokens,
      rawResponse,
      elapsedMs: IdGenerator.now() - startedAt,
      templateId: config?.eval_write_prompt_template_id,
    });
    return true;
  }

  /**
   * 记录 Evolutor（evalWriterAgent）单次 LLM 调用的执行轨迹（与 Work Agent 的 trace 存储逻辑保持一致），
   * 供「思考过程 / 执行过程」采集 Evolutor 的 token 消耗与评估输出。
   * best-effort：轨迹落库失败不影响评估结果。
   */
  private async recordTrace(
    output: EvalWriterAgentOutput,
    params: {
      agentId: string;
      agentName: string;
      taskContent: string;
      scores: unknown;
      suggestions: string[];
      inputTokens: number;
      outputTokens: number;
      rawResponse: string;
      elapsedMs: number;
      templateId: string | undefined;
    },
  ): Promise<void> {
    try {
      const traceId = IdGenerator.generate();
      const now = IdGenerator.now();
      const answer = JSON.stringify({
        scores: params.scores,
        suggestions: params.suggestions,
      });
      await this.traceStore.save({
        trace_id: traceId,
        agent_id: params.agentId,
        start_time: now,
        end_time: now + params.elapsedMs,
        iterations: buildSingleAnswerTrace({
          answer,
          raw_response: params.rawResponse,
          input_tokens: params.inputTokens,
          output_tokens: params.outputTokens,
          elapsed_ms: params.elapsedMs,
          template_id: params.templateId,
          builtin_id: PROMPT_IDS.evalWrite,
          variables: {
            task_content: params.taskContent,
            agent_name: params.agentName,
            domain: 'eval_write',
            tools_json: '{}',
            soul_id: '',
          },
        }),
        total_token_usage: params.inputTokens + params.outputTokens,
        answer,
      });
      output.trace_id = traceId;
    } catch {
      /* best-effort：轨迹记录失败不影响评估结果 */
    }
  }

  async startEvalSchedule(input: StartEvalScheduleInput, output: StartEvalScheduleOutput, ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report,
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
              new OptimizeAgentOutput(),
              Object.assign(new AgentBuilderContext(), ctx),
            );
            return true;
          },
        }),
        new StartWorkerOutput(),
        new MQCoreContext(),
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
                new EvalWorkAgentOutput(),
                ctx,
              );
            }
            return true;
          },
        }),
        new StartWorkerOutput(),
        new MQCoreContext(),
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
          const threshold = config?.eval_frequency_threshold ?? 5;
          const batchSize = input.eval_batch_size ?? config?.eval_batch_size ?? 20;
          try {
            // 统计各 Agent 近期「未评估」的 usage 数（LEFT JOIN agent_evaluation，无对应评估记录的视为未评估）
            const agg = this.relationDb.queryRaw<{ agent_id: string; cnt: number }>(
              `SELECT u.agent_id AS agent_id, COUNT(*) AS cnt
               FROM ${AGENT_USAGE_TABLE} u
               LEFT JOIN ${AGENT_EVALUATION_TABLE} e
                 ON e.agent_id = u.agent_id AND e.work_id = u.work_id
               WHERE u.created >= ? AND e.id IS NULL
               GROUP BY u.agent_id`,
              [cutoff],
            );

            // 2. 仅对累计未评估次数达到 eval_frequency_threshold 的 Agent 触发评估
            for (const a of agg ?? []) {
              if (Number(a.cnt) < threshold) continue;
              const usages = this.relationDb.queryRaw<{ agent_id: string; work_id: string; interact_id: string; usage_context: string }>(
                `SELECT u.agent_id, u.work_id, u.interact_id, u.usage_context
                 FROM ${AGENT_USAGE_TABLE} u
                 LEFT JOIN ${AGENT_EVALUATION_TABLE} e
                   ON e.agent_id = u.agent_id AND e.work_id = u.work_id
                 WHERE u.agent_id = ? AND u.created >= ? AND e.id IS NULL
                 ORDER BY u.created ASC LIMIT ?`,
                [a.agent_id, cutoff, batchSize],
              );
              for (const u of usages ?? []) {
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
                  new SendMQOutput(),
                  new MQContext(),
                );
              }
            }
          } catch { /* best-effort */ }

          // 2. 评估闭环末尾触发老化：依据 agent_opt_rule 规则表对低活跃/低评分 Agent 老化淘汰。
          //    agent_opt_rule 表通过 RelationDBProvider 读取（在 AgentLibraryService.ageAgent 内完成）。
          try {
            await this.agentLibrary.ageAgent(
              new AgeAgentInput(),
              new AgeAgentOutput(),
              new AgentLibraryContext(),
            );
          } catch { /* best-effort */ }
          return true;
        },
      }),
      startOut,
      new MQCoreContext(),
    );

    this.scheduleWorkerId = startOut.worker_id;
    output.worker_id = startOut.worker_id;
    return true;
  }

  async stopEvalSchedule(input: StopEvalScheduleInput, _output: StopEvalScheduleOutput, _ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const id = (input as { worker_id?: string }).worker_id || this.scheduleWorkerId || EVAL_SCHEDULE_QUEUE;
    const stopOut = new StopWorkerOutput();
    await this.mqCore.stopWorker(
      Object.assign(new StopWorkerInput(), { identifier: id }),
      stopOut,
      new MQCoreContext(),
    );
    return true;
  }

  async soEvaluation(input: GetEvaluationInput, output: GetEvaluationOutput, _ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report,
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

  async soEvolutionReport(input: GetEvolutionReportInput, output: GetEvolutionReportOutput, _ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const getOut = new GetAgentOutput();
    await this.agentLibrary.soAgent(
      Object.assign(new GetAgentInput(), { agent_id: input.agent_id }),
      getOut,
      new AgentLibraryContext(),
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

  async configEvolutorAgent(input: ConfigEvolutorAgentInput, output: ConfigEvolutorAgentOutput, _ctx: EvolutorAgentContext, _metrics?: Metrics, _report?: Report,
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
            so,
            new PromptContext(),
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
      if (input.eval_frequency_threshold <= 0 || !Number.isInteger(input.eval_frequency_threshold)) {
        throw new ValidationError('eval_frequency_threshold 必须为正整数');
      }
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
    if (input.llm_id !== undefined) {
      data.push({ field: 'llm_id', value: input.llm_id || null });
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

  /**
   * 通过 Core.matchLLM 解析 EvolutorAgent 绑定的 LLM（agent_llm）。
   */
  private async resolveLlm(agentId: string): Promise<string> {
    return resolveAgentLlm(this.llmCore, agentId);
  }

  /**
   * 渲染 Prompt：配置模板 → 内置模板 → 内存兜底。
   */
  private async renderPrompt(
    templateId: string | undefined,
    builtinId: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    return renderPromptWithFallback(this.promptsAccess, templateId, builtinId, variables);
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
      llm_id: (row.llm_id as string) || null,
    };
  }

  /**
   * 以 usage_count 加权平均刷新 eval_score：
   *   new = (old_eval_score * usage_count + overall) / (usage_count + 1)
   * 旧评分权重随使用次数增长，评分随历史逐步平滑收敛（对应 TC-EA-006）。
   */
  private async refreshEvalScore(agentId: string, overall: number): Promise<void> {
    const row = await this.relationDb.selectOne(AGENT_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: agentId },
    ]);
    if (!row) return;
    const oldScore = Number(row.eval_score ?? 50);
    const usageCount = Number(row.usage_count ?? 0);
    const weightedScore = Math.round((oldScore * usageCount + overall) / (usageCount + 1));

    await this.agentLibrary.updateAgent(
      Object.assign(new UpdateAgentInput(), { agent_id: agentId, eval_score: weightedScore }),
      new UpdateAgentOutput(),
      new AgentLibraryContext(),
    );
  }
}
