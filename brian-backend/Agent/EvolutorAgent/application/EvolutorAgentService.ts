import { Metrics, Report, BusinessEvent } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess, MQAccess } from '@brian-agent/base';
import { IdGenerator, Operator, ValidationError, NotFoundError, ExecLLMInput, ExecLLMOutput, LLMContext, PromptContext, SoPromptInput, SoPromptOutput, SendMQInput, SendMQOutput, MQContext, HandleResultType, type DataObject, type Direction } from '@brian-agent/base';
import type { InfoCoreAccess, MQCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import { StartWorkerInput, StartWorkerOutput, StopWorkerInput, StopWorkerOutput, MQCoreContext, DisbandThreshold } from '@brian-agent/core';
import { DelAgentInput, DelAgentOutput } from '@brian-agent/agent';
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
  RunEvalOnceInput, RunEvalOnceOutput,
  GetEvaluationInput, GetEvaluationOutput,
  GetEvolutionReportInput, GetEvolutionReportOutput,
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput,
  type EvalScores,
  type WriterEvalScores,
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
import {
  FeedbackContext,
  SubmitAgentFeedbackInput, SubmitAgentFeedbackOutput,
} from '@brian-agent/base';
import type { FeedbackAccess } from '@brian-agent/base';
import { TraceStore } from '../../AgentExecution/application/trace/TraceStore';
import { buildSingleAnswerTrace } from '../../AgentExecution/application/trace/TraceCodec';
import { parseJsonObject } from '../../shared/signature';
import { renderPromptWithFallback, resolveAgentLlm } from '../../shared/AgentKit';
import { parseWorkAgentScores, applyTraceEfficiency } from '../domain/services/EvalScoreDomainService';

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
    run_id: String(row.run_id),
    scores: String(row.scores),
    suggestions: String(row.suggestions),
    need_optimize: row.need_optimize === true || row.need_optimize === 1 || row.need_optimize === '1',
  };
}

interface EvalContext {
  config: EvolutorAgentConfigRecord | null;
  evolutorId: string;

  evolutor?: { agent_id?: string; agent_name?: string } | null;
  targetLlmId: string;
  threshold: number;
}

interface WriterEvalLlmResult {
  inputTokens: number;
  outputTokens: number;
  rawResponse: string;
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
    private readonly feedbackAccess?: FeedbackAccess,
  ) {
    this.traceStore = new TraceStore(relationDb);
  }

  async evalWorkAgent(input: EvalWorkAgentInput, output: EvalWorkAgentOutput, ctx: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {

    if (input.handle_result_type === HandleResultType.CALL_ERROR || input.handle_result_type === HandleResultType.INTERNAL_ERROR) return true;
    const evalCtx = await this.resolveEvalContext(ctx, input, metrics);
    const traceData = await this.loadTraceContext(input, ctx, metrics);
    const prompt = await this.renderPrompt(evalCtx.config?.eval_work_prompt_template_id, 'WorkAgent 质量评估', {
      task_content: input.task_content, agent_output: input.agent_output,
      trace: traceData ? JSON.stringify(traceData) : '',
    }, metrics);
    const raw = await this.execEvalLlm(ctx, input, evalCtx.targetLlmId, prompt, metrics, report);
    const { scores, suggestions } = parseWorkAgentScores(raw);
    applyTraceEfficiency(scores, traceData);

    const needOptimize = scores.overall < evalCtx.threshold;
    const evalId = await this.saveWorkEvaluation(input, scores, suggestions, needOptimize);
    await this.refreshEvalScore(input.agent_id, scores.overall);
    if (needOptimize) await this.dispatchOptimizeMessage(input, suggestions);
    if (this.feedbackAccess && suggestions.length > 0) await this.submitEvalFeedback(input, scores, suggestions);

    const evolutorConfig = await this.getConfig();
    const criticalDisbandScore = evolutorConfig?.critical_disband_score ?? DisbandThreshold.Critical;
    if (scores.overall < criticalDisbandScore) {
      output.disbanded = await this.disbandBadAgent(input.agent_id, report, metrics);
    }

    this.writeEvalOutput(output, input, evalCtx.evolutorId, evalId, scores, suggestions, needOptimize, report);
    return true;
  }

  private async resolveEvalContext(ctx: EvolutorAgentContext, input: { work_id: string; run_id: string }, metrics?: Metrics): Promise<EvalContext> {
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: ctx.session_id,
      work_id: input.work_id || ctx.work_id,
      run_id: input.run_id || ctx.run_id,
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

    let targetLlmId = config?.llm_id || '';
    if (!targetLlmId && evolutor?.agent_id && this.llmCore) {
      targetLlmId = await this.resolveLlm(evolutor.agent_id, metrics);
    }
    return { config, evolutorId: buildOut.agent_id, evolutor, targetLlmId, threshold: config?.optimize_threshold ?? 60 };
  }

  private async loadTraceContext(input: EvalWorkAgentInput, ctx: EvolutorAgentContext, metrics?: Metrics): Promise<unknown> {
    if (!input.trace_id) return null;
    try {
      const traceOut = new GetTraceOutput();
      await this.agentExecution.soTrace(
        Object.assign(new GetTraceInput(), { trace_id: input.trace_id }),
        traceOut,
        Object.assign(new AgentExecutionContext(), ctx),
      );
      return traceOut.trace;
    } catch (err) {

      metrics?.warn('EvolutorAgentService.evalWorkAgent 读取执行 trace 失败，跳过 trace 上下文', {
        error: err instanceof Error ? err.message : String(err), trace_id: input.trace_id, agent_id: input.agent_id,
      });
      return null;
    }
  }

  private async execEvalLlm(ctx: EvolutorAgentContext, input: EvalWorkAgentInput, targetLlmId: string, prompt: string, metrics?: Metrics, report?: Report): Promise<string> {
    try {
      const llmOut = new ExecLLMOutput();
      const ok = await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: targetLlmId,
          prompt,

          session_id: ctx.session_id || '',
          run_id: input.run_id || ctx.run_id || '',
          work_id: input.work_id || ctx.work_id || '',
          caller: 'EvolutorAgent.evalWorkAgent',
        }),
        llmOut,
        new LLMContext(),
        metrics,
        report,
      );
      return ok && llmOut.result ? llmOut.result : '';
    } catch {  }
    return '';
  }

  private async saveWorkEvaluation(input: EvalWorkAgentInput, scores: EvalScores, suggestions: string[], needOptimize: boolean): Promise<string> {
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
      { field: 'run_id', value: input.run_id },
      { field: 'scores', value: JSON.stringify(scores) },
      { field: 'suggestions', value: JSON.stringify(suggestions) },
      { field: 'need_optimize', value: needOptimize ? 1 : 0 },
    ]);
    return evalId;
  }

  private async dispatchOptimizeMessage(input: EvalWorkAgentInput, suggestions: string[]): Promise<void> {
    await this.mqAccess.sendMQ(
      Object.assign(new SendMQInput(), {
        data: {
          queue: OPTIMIZE_QUEUE,
          payload: {
            agent_id: input.agent_id,
            run_id: input.run_id,
            usage_feedback: suggestions.join('; '),
          },
        },
      }),
      new SendMQOutput(),
      new MQContext(),
    );
  }

  private async submitEvalFeedback(input: EvalWorkAgentInput, scores: EvalScores, suggestions: string[]): Promise<void> {
    if (!this.feedbackAccess) return;
    await this.feedbackAccess.submitAgentFeedback(
      Object.assign(new SubmitAgentFeedbackInput(), {
        agent_id: input.agent_id,
        work_id: input.work_id,
        run_id: input.run_id,
        rating: scores.overall,
        suggestions,
        category: 'WORK_AGENT_EVAL',
      }),
      new SubmitAgentFeedbackOutput(),
      new FeedbackContext(),
    );
  }

  private writeEvalOutput(
    output: EvalWorkAgentOutput, input: EvalWorkAgentInput, evolutorId: string, evalId: string,
    scores: EvalScores, suggestions: string[], needOptimize: boolean, report?: Report,
  ): void {
    output.agent_id = evolutorId;
    output.eval_id = evalId;
    output.scores = scores;
    output.suggestions = suggestions;
    output.need_optimize = needOptimize;

    report?.pushBusinessEvent(BusinessEvent.EvaluationCompleted, {
      eval_type: 'WORK_AGENT',
      eval_id: evalId,
      agent_id: input.agent_id,
      work_id: input.work_id,
      run_id: input.run_id,
      scores,
      suggestions,
      need_optimize: needOptimize,
      disbanded: output.disbanded === true,
    });
  }

  private async disbandBadAgent(agentBizId: string, report?: Report, metrics?: Metrics): Promise<boolean> {
    const rows = this.relationDb.queryRaw<{ id: string; created_by: string }>(
      `SELECT "id", "created_by" FROM "agent" WHERE "agent_id" = ? LIMIT 1`,
      [agentBizId],
    );
    const row = rows?.[0];
    if (!row || String(row.created_by ?? 'user') !== 'system') {
      return false;
    }
    const delIn = new DelAgentInput();
    delIn.ids = [String(row.id)];
    const delOut = new DelAgentOutput();
    await this.agentLibrary.delAgent(delIn, delOut, new AgentLibraryContext());
    await this.disableRuntimeDefs(agentBizId, metrics);
    report?.pushBusinessEvent(BusinessEvent.AgentDisbanded, { agent_id: agentBizId, reason: 'low_eval_score' });
    return true;
  }

  private async disableRuntimeDefs(agentBizId: string, metrics?: Metrics): Promise<void> {
    try {
      await this.relationDb.update('runtime_agent_def', [
        { field: 'status', value: 'disabled' },
        { field: 'updated', value: IdGenerator.now() },
      ], [{ field: 'agent_ref', operator: Operator.EQ, value: agentBizId }]);
    } catch (err) {

      metrics?.warn('EvolutorAgentService.disableRuntimeDefs 禁用 runtime_agent_def 失败已容忍', {
        error: err instanceof Error ? err.message : String(err),
        agent_id: agentBizId,
      });
    }
  }

  async evalWriterAgent(input: EvalWriterAgentInput, output: EvalWriterAgentOutput, ctx: EvolutorAgentContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {

    if (input.handle_result_type === HandleResultType.CALL_ERROR || input.handle_result_type === HandleResultType.INTERNAL_ERROR) {
      return true;
    }
    const startedAt = IdGenerator.now();
    const evalCtx = await this.resolveEvalContext(ctx, input, metrics);
    const config = evalCtx.config;
    let scores: WriterEvalScores = { clarity: 60, informativeness: 60, user_alignment: 60, conciseness: 60, overall: 60 };
    let suggestions: string[] = [];
    const prompt = await this.renderPrompt(
      config?.eval_write_prompt_template_id,
      'WriterAgent 质量评估',
      {
        task_content: input.user_query,
        final_response: input.final_response,
        agent_results: JSON.stringify(input.agent_results),
      },
      metrics,
    );
    const llmResult = await this.execWriterEvalLlm(input, ctx, evalCtx.targetLlmId, prompt, metrics, report);
    const parsedScores = this.parseWriterEvalScores(llmResult.rawResponse);
    if (parsedScores) {
      scores = parsedScores.scores;
      suggestions = parsedScores.suggestions;
    }
    const needOptimize = scores.overall < evalCtx.threshold;
    const evalId = await this.saveWriterEvaluation(input, scores, suggestions, needOptimize);
    if (needOptimize) {
      await this.dispatchWriterOptimize(input);
    }
    await this.writeWriterEvalOutput(output, input, evalCtx, evalId, scores, suggestions, needOptimize, startedAt, llmResult, metrics, report);
    return true;
  }

  private async execWriterEvalLlm(
    input: EvalWriterAgentInput,
    ctx: EvolutorAgentContext,
    targetLlmId: string,
    prompt: string,
    metrics?: Metrics,
    report?: Report,
  ): Promise<WriterEvalLlmResult> {
    try {

      const llmOut = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: targetLlmId,
          prompt,

          session_id: ctx.session_id || '',
          run_id: input.run_id || ctx.run_id || '',
          work_id: input.work_id || ctx.work_id || '',
          caller: 'EvolutorAgent.evalWriterAgent',
        }),
        llmOut,
        new LLMContext(),
        metrics,
        report,
      );
      return {
        inputTokens: Number(llmOut.input_tokens ?? 0),
        outputTokens: Number(llmOut.output_tokens ?? 0),
        rawResponse: String(llmOut.raw_response ?? llmOut.result ?? ''),
      };
    } catch {  }
    return { inputTokens: 0, outputTokens: 0, rawResponse: '' };
  }

  private parseWriterEvalScores(rawResponse: string): { scores: WriterEvalScores; suggestions: string[] } | null {
    const parsed = parseJsonObject(rawResponse);
    if (!parsed) {
      return null;
    }
    const clarity = Number(parsed.clarity ?? 60);
    const info = Number(parsed.informativeness ?? 60);
    const align = Number(parsed.user_alignment ?? 60);
    const conc = Number(parsed.conciseness ?? 60);
    return {
      scores: {
        clarity,
        informativeness: info,
        user_alignment: align,
        conciseness: conc,
        overall: Number(parsed.overall ?? Math.round((clarity + info + align + conc) / 4)),
      },
      suggestions: Array.isArray(parsed.suggestions) ? (parsed.suggestions as unknown[]).map(String) : [],
    };
  }

  private async saveWriterEvaluation(input: EvalWriterAgentInput, scores: WriterEvalScores, suggestions: string[], needOptimize: boolean): Promise<string> {
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
      { field: 'run_id', value: input.run_id },
      { field: 'scores', value: JSON.stringify(scores) },
      { field: 'suggestions', value: JSON.stringify(suggestions) },
      { field: 'need_optimize', value: needOptimize ? 1 : 0 },
    ]);
    return evalId;
  }

  private async dispatchWriterOptimize(input: EvalWriterAgentInput): Promise<void> {
    await this.mqAccess.sendMQ(
      Object.assign(new SendMQInput(), {
        data: {
          queue: OPTIMIZE_QUEUE,
          payload: { agent_id: input.agent_id, run_id: input.run_id },
        },
      }),
      new SendMQOutput(),
      new MQContext(),
    );
  }

  private async writeWriterEvalOutput(
    output: EvalWriterAgentOutput,
    input: EvalWriterAgentInput,
    evalCtx: EvalContext,
    evalId: string,
    scores: WriterEvalScores,
    suggestions: string[],
    needOptimize: boolean,
    startedAt: number,
    llmResult: WriterEvalLlmResult,
    _metrics?: Metrics,
    report?: Report,
  ): Promise<void> {
    output.agent_id = evalCtx.evolutorId;
    output.eval_id = evalId;
    output.scores = scores;
    output.suggestions = suggestions;
    output.need_optimize = needOptimize;

    report?.pushBusinessEvent(BusinessEvent.EvaluationCompleted, {
      eval_type: 'WRITER_AGENT',
      eval_id: evalId,
      agent_id: input.agent_id,
      work_id: input.work_id,
      run_id: input.run_id,
      scores,
      suggestions,
      need_optimize: needOptimize,
    });
    await this.recordTrace(output, {
      agentId: evalCtx.evolutorId,
      agentName: evalCtx.evolutor?.agent_name ?? evalCtx.evolutorId,
      taskContent: input.user_query,
      scores,
      suggestions,
      inputTokens: llmResult.inputTokens,
      outputTokens: llmResult.outputTokens,
      rawResponse: llmResult.rawResponse,
      elapsedMs: IdGenerator.now() - startedAt,
      templateId: evalCtx.config?.eval_write_prompt_template_id,
    }, _metrics);
  }

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
    metrics?: Metrics,
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
      }, metrics);
      output.trace_id = traceId;
    } catch (err) {

      metrics?.warn('EvolutorAgentService.recordTrace 评估轨迹落盘失败已容忍', {
        error: err instanceof Error ? err.message : String(err),
        agent_id: params.agentId,
      });
    }
  }

  async startEvalSchedule(input: StartEvalScheduleInput, output: StartEvalScheduleOutput, ctx: EvolutorAgentContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const interval = input.interval_ms ?? config?.eval_schedule_interval_ms ?? 3600000;

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
                run_id: payload.run_id ?? '',
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
    } catch {  }

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
                  run_id: payload.run_id,
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
    } catch {  }

    const startOut = new StartWorkerOutput();
    await this.mqCore.startWorker(
      Object.assign(new StartWorkerInput(), {
        queue: EVAL_SCHEDULE_QUEUE,
        interval,

        handler: async () => {
          await this.runEvaluationCycle(ctx, { dispatchViaMq: true }, metrics);
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

  async runEvalOnce(input: RunEvalOnceInput, output: RunEvalOnceOutput, ctx: EvolutorAgentContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const result = await this.runEvaluationCycle(ctx, {
      dispatchViaMq: false,
      cutoffMs: input.cutoff_ms,
      threshold: input.eval_frequency_threshold,
      batchSize: input.eval_batch_size,
    }, metrics);
    output.scanned_agents = result.scannedAgents;
    output.evaluated_count = result.evaluatedCount;
    output.skipped_count = result.skippedCount;
    return true;
  }

  private async runEvaluationCycle(
    ctx: EvolutorAgentContext,
    opts: { dispatchViaMq: boolean; cutoffMs?: number; threshold?: number; batchSize?: number },
    metrics?: Metrics,
  ): Promise<{ scannedAgents: number; evaluatedCount: number; skippedCount: number }> {
    const config = await this.getConfig();
    const cutoff = IdGenerator.now() - (opts.cutoffMs ?? 7 * 24 * 60 * 60 * 1000);
    const threshold = opts.threshold ?? config?.eval_frequency_threshold ?? 5;
    const batchSize = opts.batchSize ?? config?.eval_batch_size ?? 20;
    const counters = { scannedAgents: 0, evaluatedCount: 0, skippedCount: 0 };
    try {
      await this.scanAndDispatchEvals(ctx, opts, cutoff, threshold, batchSize, counters);
    } catch (err) {
      metrics?.warn('EvolutorAgentService.runEvaluationCycle 评估扫描闭环失败已容忍', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      await this.agentLibrary.ageAgent(new AgeAgentInput(), new AgeAgentOutput(), new AgentLibraryContext());
    } catch {  }
    return counters;
  }

  private async scanAndDispatchEvals(
    ctx: EvolutorAgentContext,
    opts: { dispatchViaMq: boolean },
    cutoff: number,
    threshold: number,
    batchSize: number,
    counters: { scannedAgents: number; evaluatedCount: number; skippedCount: number },
  ): Promise<void> {
    const agg = this.relationDb.queryRaw<{ agent_id: string; cnt: number }>(
      `SELECT u.agent_id AS agent_id, COUNT(*) AS cnt
         FROM ${AGENT_USAGE_TABLE} u
         LEFT JOIN ${AGENT_EVALUATION_TABLE} e
           ON e.agent_id = u.agent_id AND e.work_id = u.work_id
         WHERE u.created >= ? AND e.id IS NULL AND COALESCE(u.usage_context, '') != ''
         GROUP BY u.agent_id`,
      [cutoff],
    );
    for (const a of agg ?? []) {
      if (Number(a.cnt) < threshold) continue;
      counters.scannedAgents++;
      await this.evalAgentUsages(ctx, opts, a.agent_id, cutoff, batchSize, counters);
    }
  }

  private async evalAgentUsages(
    ctx: EvolutorAgentContext,
    opts: { dispatchViaMq: boolean },
    agentId: string,
    cutoff: number,
    batchSize: number,
    counters: { scannedAgents: number; evaluatedCount: number; skippedCount: number },
  ): Promise<void> {
    let cursorCreated = 0;
    let cursorId = '';
    let agentEvaluated = 0;
    for (;;) {
      if (agentEvaluated >= batchSize) break;
      const usages = this.fetchPendingUsages(agentId, cutoff, cursorCreated, cursorId, batchSize);
      if (!usages || usages.length === 0) break;
      for (const u of usages) {
        cursorCreated = Number(u.created) || 0;
        cursorId = String(u.id ?? '');
        if (await this.dispatchUsageRecord(ctx, opts, u, counters)) {
          agentEvaluated++;
          if (agentEvaluated >= batchSize) break;
        }
      }
    }
  }

  private fetchPendingUsages(agentId: string, cutoff: number, cursorCreated: number, cursorId: string, batchSize: number) {
    return this.relationDb.queryRaw<{ agent_id: string; work_id: string; run_id: string; usage_context: string; created: number; id: string }>(
      `SELECT u.agent_id, u.work_id, u.run_id, u.usage_context, u.created, u.id
             FROM ${AGENT_USAGE_TABLE} u
             LEFT JOIN ${AGENT_EVALUATION_TABLE} e
               ON e.agent_id = u.agent_id AND e.work_id = u.work_id
             WHERE u.agent_id = ? AND u.created >= ? AND e.id IS NULL
               AND (u.created > ? OR (u.created = ? AND u.id > ?))
             ORDER BY u.created ASC, u.id ASC
             LIMIT ?`,
      [agentId, cutoff, cursorCreated, cursorCreated, cursorId, batchSize],
    );
  }

  private async dispatchUsageRecord(
    ctx: EvolutorAgentContext,
    opts: { dispatchViaMq: boolean },
    u: { agent_id: string; work_id: string; run_id: string; usage_context: string; created: number; id: string },
    counters: { evaluatedCount: number; skippedCount: number },
  ): Promise<boolean> {
    const ctxRaw = typeof u.usage_context === 'string' ? u.usage_context : '';
    const parsed = ctxRaw ? parseJsonObject(ctxRaw) : null;
    const traceId = parsed ? String(parsed.trace_id ?? '') : '';
    const taskContent = parsed ? String(parsed.task_content ?? '') : '';
    const agentOutput = parsed ? String(parsed.agent_output ?? '') : '';
    if (!traceId && !taskContent && !agentOutput) {
      counters.skippedCount++;
      return false;
    }
    if (opts.dispatchViaMq) {
      await this.sendEvalViaMq(u, taskContent, agentOutput, traceId);
    } else {
      await this.evalWorkAgent(
        Object.assign(new EvalWorkAgentInput(), {
          agent_id: u.agent_id, work_id: u.work_id, run_id: u.run_id, task_content: taskContent, agent_output: agentOutput, trace_id: traceId,
        }),
        new EvalWorkAgentOutput(),
        ctx,
      );
    }
    counters.evaluatedCount++;
    return true;
  }

  private async sendEvalViaMq(
    u: { agent_id: string; work_id: string; run_id: string },
    taskContent: string,
    agentOutput: string,
    traceId: string,
  ): Promise<void> {
    await this.mqAccess.sendMQ(
      Object.assign(new SendMQInput(), {
        data: {
          queue: EVAL_QUEUE,
          payload: {
            type: 'eval_work_agent',
            agent_id: u.agent_id,
            work_id: u.work_id,
            run_id: u.run_id,
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
      try { s = JSON.parse(String(e.scores)); } catch {  }
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
      try {
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
          { field: 'critical_disband_score', value: 30 },
        ]);
      } catch {

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
      }
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

    if (input.critical_disband_score !== undefined) {
      if (input.critical_disband_score < 0 || input.critical_disband_score > 100) {
        throw new ValidationError('critical_disband_score 必须在 0-100');
      }
      data.push({ field: 'critical_disband_score', value: input.critical_disband_score });
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

  private async resolveLlm(agentId: string, metrics?: Metrics): Promise<string> {
    return resolveAgentLlm(this.llmCore, agentId, metrics);
  }

  private async renderPrompt(
    templateId: string | undefined,
    builtinId: string,
    variables: Record<string, unknown>,
    metrics?: Metrics,
  ): Promise<string> {
    return renderPromptWithFallback(this.promptsAccess, templateId, builtinId, variables, metrics);
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
      critical_disband_score: Number(row.critical_disband_score ?? 30),
    };
  }

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
