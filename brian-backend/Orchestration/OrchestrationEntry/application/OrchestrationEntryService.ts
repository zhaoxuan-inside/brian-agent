import {
  RelationDBAccess, InsertDBInput, InsertDBOutput,
  SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  Operator, DataObject, DBContext, IdGenerator,
  ValidationError, NotFoundError,
  type PromptsAccess, type LLMAccess, type Logger, type Condition,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import { SaveInfoInput, SaveInfoOutput, ContextInfoInput, ContextInfoOutput, InfoCoreContext } from '@brian-agent/core';
import type { WriterAgentAccess } from '@brian-agent/agent';
import { GetUserProfileInput, GetUserProfileOutput, WriterAgentContext } from '@brian-agent/agent';
import type { OrchestrationStrategyAccess } from '../../OrchestrationStrategy/access/OrchestrationStrategyAccess';
import type { StartOrchestrationInput, StartOrchestrationOutput } from '../../OrchestrationStrategy/domain/types';
import type { OrchestrationExecutionAccess } from '../../OrchestrationExecution/access/OrchestrationExecutionAccess';
import {
  OrchestrationExecutionContext,
  CancelExecutionInput, CancelExecutionOutput,
} from '../../OrchestrationExecution/domain/types';
import {
  OrchestrationEntryContext,
  ReceiveWorkInput, ReceiveWorkOutput,
  SelectOrchestrationStrategyInput, SelectOrchestrationStrategyOutput,
  ReceiveWorkAsyncInput, ReceiveWorkAsyncOutput,
  BuildWorkContextInput, BuildWorkContextOutput,
  GetWorkStatusInput, GetWorkStatusOutput,
  CancelWorkInput, CancelWorkOutput,
  ConfigOrchestrationEntryInput, ConfigOrchestrationEntryOutput,
} from '../domain/types';
import { selectOrchestrationStrategy as sharedSelectStrategy } from '../../shared/strategySelector';

export class OrchestrationEntryService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly writerAgent: WriterAgentAccess,
    private readonly orchestrationStrategy: OrchestrationStrategyAccess,
    private readonly orchestrationExecution: OrchestrationExecutionAccess,
    private readonly llmAccess?: LLMAccess,
    private readonly promptsAccess?: PromptsAccess,
    private readonly mqAccess?: any,
    private readonly mqCore?: any,
    private readonly logger?: Logger,
  ) {}

  async receiveWork(
    input: ReceiveWorkInput,
    context: OrchestrationEntryContext,
    output: ReceiveWorkOutput,
  ): Promise<boolean> {
    const workId = IdGenerator.generate();
    const interactId = IdGenerator.generate();
    const now = IdGenerator.now();

    const workData: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'work_id', value: workId },
      { field: 'interact_id', value: interactId },
      { field: 'session_id', value: input.session_id },
      { field: 'user_query', value: input.user_query },
      { field: 'status', value: 'CREATED' },
      { field: 'orchestration_strategy', value: '' },
      { field: 'task_count', value: 0 },
      { field: 'completed_task_count', value: 0 },
      { field: 'elapsed_ms', value: 0 },
      { field: 'cancel_reason', value: '' },
      { field: 'error_message', value: '' },
      { field: 'final_response', value: '' },
      { field: 'metadata', value: '{}' },
    ];

    const insInput = Object.assign(new InsertDBInput(), {
      table: 'orchestration_work',
      data: workData,
    });
    await this.relationDb.insertDB(insInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

    const saveInfoInput = Object.assign(new SaveInfoInput(), {
      session_id: input.session_id,
      work_id: workId,
      interact_id: interactId,
      info_creator_id: 'USER',
      info_creator_role: 'REQUEST',
      info: input.user_query,
    });
    try {
      await this.infoCore.saveInfo(saveInfoInput, Object.assign(new InfoCoreContext(), { session_id: input.session_id }) as InfoCoreContext, new SaveInfoOutput());
    } catch { /* degrade gracefully */ }

    let strategy: string;
    if (input.force_orchestration_strategy) {
      strategy = input.force_orchestration_strategy;
    } else {
      const selInput = Object.assign(new SelectOrchestrationStrategyInput(), {
        user_query: input.user_query,
      });
      const selOutput = new SelectOrchestrationStrategyOutput();
      await this.selectOrchestrationStrategy(selInput, context, selOutput);
      strategy = selOutput.strategy || 'SIMPLE';
    }

    const updData: DataObject[] = [
      { field: 'orchestration_strategy', value: strategy },
      { field: 'status', value: 'PROCESSING' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: workId },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    const buildCtxInput = Object.assign(new BuildWorkContextInput(), {
      session_id: input.session_id,
      work_id: workId,
      user_query: input.user_query,
    });
    const buildCtxOutput = new BuildWorkContextOutput();
    await this.buildWorkContext(buildCtxInput, context, buildCtxOutput);

    const startCtx = { session_id: input.session_id, work_id: workId, interact_id: interactId };
    const startInput: StartOrchestrationInput = {
      work_id: workId,
      interact_id: interactId,
      session_id: input.session_id,
      user_query: input.user_query,
      strategy,
      work_context: buildCtxOutput.work_context,
    };
    const startOutput: StartOrchestrationOutput = { final_response: '' };

    try {
      await this.orchestrationStrategy.startOrchestration(startInput, startCtx, startOutput);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger?.error?.('receiveWork: orchestration failed', { work_id: workId, error: errMsg });
      await this.markWorkFailed(workId, errMsg);
      output.work_id = workId;
      output.interact_id = interactId;
      output.orchestration_strategy = strategy;
      output.final_response = '抱歉，处理您的问题时出现了错误，请稍后重试。';
      output.error = errMsg;
      return false;
    }

    const finalResponse = startOutput.final_response || '';

    try {
      const saveRespInput = Object.assign(new SaveInfoInput(), {
        session_id: input.session_id,
        work_id: workId,
        interact_id: interactId,
        info_creator_id: workId,
        info_creator_role: 'RESPONSE',
        info: finalResponse,
      });
      await this.infoCore.saveInfo(saveRespInput, Object.assign(new InfoCoreContext(), { session_id: input.session_id }) as InfoCoreContext, new SaveInfoOutput());
    } catch { /* degrade gracefully */ }

    const doneData: DataObject[] = [
      { field: 'status', value: 'COMPLETED' },
      { field: 'elapsed_ms', value: IdGenerator.now() - now },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const doneInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: doneData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: workId },
      ] as Condition[],
    });
    await this.relationDb.updateDB(doneInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    output.work_id = workId;
    output.interact_id = interactId;
    output.orchestration_strategy = strategy;
    output.final_response = finalResponse;
    return true;
  }

  async selectOrchestrationStrategy(
    input: SelectOrchestrationStrategyInput,
    _context: OrchestrationEntryContext,
    output: SelectOrchestrationStrategyOutput,
  ): Promise<boolean> {
    if (!this.llmAccess || !this.promptsAccess) {
      output.strategy = 'SIMPLE';
      output.complexity = 0;
      output.reason = 'no_llm_or_prompts';
      return true;
    }
    const result = await sharedSelectStrategy(
      this.relationDb,
      this.promptsAccess,
      this.llmAccess,
      input.user_query,
      input.work_context,
      this.logger,
    );
    output.strategy = result.strategy;
    output.complexity = result.complexity;
    output.reason = result.reason;
    output.plan = result.plan;
    return true;
  }

  async receiveWorkAsync(
    input: ReceiveWorkAsyncInput,
    context: OrchestrationEntryContext,
    output: ReceiveWorkAsyncOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      return false;
    }
    const workId = IdGenerator.generate();
    const interactId = IdGenerator.generate();
    const jobId = IdGenerator.generate();
    const now = IdGenerator.now();

    const workData: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'work_id', value: workId },
      { field: 'interact_id', value: interactId },
      { field: 'session_id', value: input.session_id },
      { field: 'user_query', value: input.user_query },
      { field: 'status', value: 'CREATED' },
      { field: 'orchestration_strategy', value: '' },
      { field: 'task_count', value: 0 },
      { field: 'completed_task_count', value: 0 },
      { field: 'elapsed_ms', value: 0 },
      { field: 'cancel_reason', value: '' },
      { field: 'error_message', value: '' },
      { field: 'final_response', value: '' },
      { field: 'metadata', value: JSON.stringify({ job_id: jobId, async: true, callback_queue: input.callback_queue }) },
    ];

    const insInput = Object.assign(new InsertDBInput(), {
      table: 'orchestration_work',
      data: workData,
    });
    await this.relationDb.insertDB(insInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

    output.work_id = workId;
    output.interact_id = interactId;
    output.job_id = jobId;

    if (this.mqAccess) {
      try {
        const sendInput = Object.assign({}, {
          data: {
            queue: 'orchestration.work',
            payload: {
              job_id: jobId,
              work_id: workId,
              interact_id: interactId,
              session_id: input.session_id,
              user_query: input.user_query,
              force_orchestration_strategy: input.force_orchestration_strategy,
              callback_queue: input.callback_queue,
            },
          },
        });
        await this.mqAccess.sendMQ(sendInput, {}, {});

        if (this.mqCore) {
          const getWorkerInput = Object.assign({}, { identifier: 'orchestration.work' });
          const getWorkerOutput = Object.assign({}, { worker: null });
          await this.mqCore.getWorker(getWorkerInput, {}, getWorkerOutput);
          if (!getWorkerOutput.worker) {
            const startWorkerInput = Object.assign({}, {
              queue: 'orchestration.work',
              handler: async (msg: Record<string, unknown>) => {
                let payload: Record<string, unknown> = {};
                try {
                  payload = (msg.payload as Record<string, unknown>) ?? {};
                  const rwInput = Object.assign(new ReceiveWorkInput(), {
                    session_id: payload.session_id as string,
                    user_query: payload.user_query as string,
                    force_orchestration_strategy: payload.force_orchestration_strategy as string | undefined,
                  });
                  const rwOutput = new ReceiveWorkOutput();
                  await this.receiveWork(rwInput, context, rwOutput);

                  if (payload.callback_queue && this.mqAccess) {
                    const cbInput = Object.assign({}, {
                      data: { queue: payload.callback_queue as string, payload: rwOutput },
                    });
                    await this.mqAccess.sendMQ(cbInput, {}, {});
                  }
                  return true;
                } catch (err: unknown) {
                  this.logger?.error?.('receiveWorkAsync: worker handler failed', {
                    work_id: payload?.work_id as string,
                    error: err instanceof Error ? err.message : String(err),
                  });
                  return false;
                }
              },
              interval: input.callback_queue ? (await this.getConfigValue('async_worker_interval', 1000)) : 1000,
            });
            await this.mqCore.startWorker(startWorkerInput, {}, {});
          }
        }
      } catch (err: unknown) {
        this.logger?.error?.('receiveWorkAsync: MQ enqueue failed, falling back to setImmediate', {
          error: err instanceof Error ? err.message : String(err),
        });
        setImmediate(async () => {
          try {
            const rwInput = Object.assign(new ReceiveWorkInput(), {
              session_id: input.session_id,
              user_query: input.user_query,
              force_orchestration_strategy: input.force_orchestration_strategy,
            });
            const rwOutput = new ReceiveWorkOutput();
            await this.receiveWork(rwInput, context, rwOutput);
          } catch (err2: unknown) {
            this.logger?.error?.('receiveWorkAsync: async processing failed', {
              work_id: workId,
              error: err2 instanceof Error ? err2.message : String(err2),
            });
          }
        });
      }
    } else {
      setImmediate(async () => {
        try {
          const rwInput = Object.assign(new ReceiveWorkInput(), {
            session_id: input.session_id,
            user_query: input.user_query,
            force_orchestration_strategy: input.force_orchestration_strategy,
          });
          const rwOutput = new ReceiveWorkOutput();
          await this.receiveWork(rwInput, context, rwOutput);
        } catch (err: unknown) {
          this.logger?.error?.('receiveWorkAsync: async processing failed', {
            work_id: workId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    return true;
  }

  async buildWorkContext(
    input: BuildWorkContextInput,
    _context: OrchestrationEntryContext,
    output: BuildWorkContextOutput,
  ): Promise<boolean> {
    if (!input.session_id || !input.work_id) {
      return false;
    }
    let sessionContext: Record<string, unknown> = {};
    try {
      const ctxInfoInput = Object.assign(new ContextInfoInput(), {
        session_id: input.session_id,
      });
      const ctxInfoOutput = new ContextInfoOutput();
      await this.infoCore.context(ctxInfoInput, Object.assign(new InfoCoreContext(), { session_id: input.session_id }) as InfoCoreContext, ctxInfoOutput);
      sessionContext = ctxInfoOutput.list as unknown as Record<string, unknown>;
    } catch { /* degrade gracefully */ }

    let userProfile: Record<string, unknown> = {};
    try {
      const profileInput = Object.assign(new GetUserProfileInput(), {
        session_id: input.session_id,
      });
      const profileOutput = new GetUserProfileOutput();
      await this.writerAgent.getUserProfile(profileInput, Object.assign(new WriterAgentContext(), { session_id: input.session_id }) as WriterAgentContext, profileOutput);
      userProfile = profileOutput.user_profile as unknown as Record<string, unknown>;
    } catch { /* degrade gracefully */ }

    const maxRecent = input.max_recent_works ?? await this.getConfigValue('max_recent_works', 5);
    const recentSelInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'orchestration_work',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
          { field: 'status', operator: Operator.EQ, value: 'COMPLETED' },
        ] as Condition[],
        page: { current: 1, size: maxRecent },
      },
    });
    const recentSelOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(recentSelInput, new DBContext(), recentSelOutput);

    const recentWorks = recentSelOutput.rows.map((row) => ({
      user_query: row.user_query,
      response_summary: ((row.final_response as string) ?? '').slice(0, 200),
    }));

    output.work_context = {
      work_id: input.work_id,
      session_id: input.session_id,
      user_query: input.user_query,
      session_context: sessionContext,
      user_profile: userProfile,
      recent_works: recentWorks,
      created_at: IdGenerator.now(),
      metadata: { orchestration_version: '1.0' },
    };
    return true;
  }

  async getWorkStatus(
    input: GetWorkStatusInput,
    _context: OrchestrationEntryContext,
    output: GetWorkStatusOutput,
  ): Promise<boolean> {
    const conditions: Condition[] = [];
    if (input.work_id) conditions.push({ field: 'work_id', operator: Operator.EQ, value: input.work_id });
    if (input.session_id) conditions.push({ field: 'session_id', operator: Operator.EQ, value: input.session_id });
    if (input.status) conditions.push({ field: 'status', operator: Operator.EQ, value: input.status });

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'orchestration_work',
        conditions,
        page: input.page,
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, new DBContext(), selOutput);

    output.works = selOutput.rows.map((row) => ({
      work_id: row.work_id as string ?? '',
      interact_id: row.interact_id as string ?? '',
      session_id: row.session_id as string ?? '',
      user_query: ((row.user_query as string) ?? '').slice(0, 100),
      status: row.status as string ?? '',
      orchestration_strategy: row.orchestration_strategy as string ?? '',
      task_count: row.task_count as number ?? 0,
      completed_task_count: row.completed_task_count as number ?? 0,
      elapsed_ms: row.elapsed_ms as number ?? 0,
      error_message: row.error_message as string ?? '',
      created: row.created as number ?? 0,
      updated: row.updated as number ?? 0,
    }));
    return true;
  }

  async cancelWork(
    input: CancelWorkInput,
    _context: OrchestrationEntryContext,
    output: CancelWorkOutput,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_work',
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    const work = selOutput.row;
    if (!work) {
      throw new NotFoundError('Work', input.work_id);
    }

    const status = work.status as string;
    if (status === 'COMPLETED' || status === 'FAILED') {
      output.cancelled = false;
      return false;
    }

    const cancelExecInput = Object.assign(new CancelExecutionInput(), {
      work_id: input.work_id,
    });
    const cancelExecOutput = new CancelExecutionOutput();
    await this.orchestrationExecution.cancelExecution(
      cancelExecInput,
      { session_id: ((work.session_id as string) ?? '') } as OrchestrationExecutionContext,
      cancelExecOutput,
    );

    const updData: DataObject[] = [
      { field: 'status', value: 'FAILED' },
      { field: 'cancel_reason', value: input.reason ?? '' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    output.cancelled = true;
    return true;
  }

  async configOrchestrationEntry(
    input: ConfigOrchestrationEntryInput,
    _context: OrchestrationEntryContext,
    output: ConfigOrchestrationEntryOutput,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'orchestration_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    const current = (selOutput.row ?? {}) as Record<string, unknown>;
    const id = (current.id as string) || 'orchestration_config_default';
    const data: DataObject[] = [{ field: 'id', value: id }, { field: 'updated', value: IdGenerator.now() }];

    if (input.complexity_decompose_threshold !== undefined) {
      if (input.complexity_decompose_threshold < 0 || input.complexity_decompose_threshold > 100) {
        throw new ValidationError('complexity_decompose_threshold must be 0-100');
      }
      data.push({ field: 'complexity_decompose_threshold', value: input.complexity_decompose_threshold });
    }
    if (input.strategy_prompt_template_id !== undefined) {
      data.push({ field: 'strategy_prompt_template_id', value: input.strategy_prompt_template_id });
    }
    if (input.default_strategy !== undefined) {
      if (!['SIMPLE', 'PLANNING'].includes(input.default_strategy)) {
        throw new ValidationError('default_strategy must be SIMPLE or PLANNING');
      }
      data.push({ field: 'default_strategy', value: input.default_strategy });
    }
    if (input.max_recent_works !== undefined) {
      if (input.max_recent_works <= 0) throw new ValidationError('max_recent_works must be positive');
      data.push({ field: 'max_recent_works', value: input.max_recent_works });
    }
    if (input.async_worker_interval !== undefined) {
      if (input.async_worker_interval <= 0) throw new ValidationError('async_worker_interval must be positive');
      data.push({ field: 'async_worker_interval', value: input.async_worker_interval });
    }

    if (data.length > 2) {
      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_config',
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
    }

    output.config = current;
    return true;
  }

  private async markWorkFailed(workId: string, errorMsg: string): Promise<void> {
    const updData: DataObject[] = [
      { field: 'status', value: 'FAILED' },
      { field: 'error_message', value: errorMsg },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: workId },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
  }

  private async getConfigValue(field: string, defaultValue: number): Promise<number> {
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_config' },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
      const row = selOutput.row as Record<string, unknown> | null;
      return (row?.[field] as number) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }
}
