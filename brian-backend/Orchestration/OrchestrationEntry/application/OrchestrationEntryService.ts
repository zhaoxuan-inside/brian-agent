import { Metrics, Report } from '@brian-agent/base';
import {
  RelationDBAccess, InsertDBInput, InsertDBOutput,
  SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  Operator, DataObject, DBContext, IdGenerator,
  ValidationError, NotFoundError,
  InfoType,
  HandleResultType,
  type PromptsAccess, type LLMAccess, type Logger, type Condition,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import { ContextInfoInput, ContextInfoOutput, InfoCoreContext, SaveInfoInput, SaveInfoOutput, UpdateInfoInput, UpdateInfoOutput, DelInfoByWorkInput, DelInfoByWorkOutput } from '@brian-agent/core';
import type { WriterAgentAccess, IntentAgentAccess } from '@brian-agent/agent';
import { GetUserProfileInput, GetUserProfileOutput, WriterAgentContext, UnderstandRequirementInput, UnderstandRequirementOutput, IntentAgentContext } from '@brian-agent/agent';
import type { OrchestrationStrategyAccess } from '../../OrchestrationStrategy/access/OrchestrationStrategyAccess';
import { StartOrchestrationInput, StartOrchestrationOutput } from '../../OrchestrationStrategy/domain/types';
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
  ConfirmIntentInput, ConfirmIntentOutput,
  SubmitClarificationInput, SubmitClarificationOutput,
  ConfigOrchestrationEntryInput, ConfigOrchestrationEntryOutput,
} from '../domain/types';
import { selectOrchestrationStrategy as sharedSelectStrategy } from '../../shared/strategySelector';
import { resolveIntentAction } from '../../shared/intentActionResolver';

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
    private readonly intentAgent?: IntentAgentAccess,
    private readonly streamAccess?: any,
  ) {}

  async receiveWork(input: ReceiveWorkInput, output: ReceiveWorkOutput, context: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    const workId = context.work_id || IdGenerator.generate();
    const interactId = context.interact_id || IdGenerator.generate();
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
      { field: 'metadata', value: JSON.stringify({ trace_id: input.trace_id ?? '' }) },
    ];

    const insInput = Object.assign(new InsertDBInput(), {
      table: 'orchestration_work',
      data: workData,
    });
    // 幂等：确认流程（confirmIntent）以相同 work_id 重入时，跳过重复插入（work_id 唯一约束），复用已有记录
    const existingWork = await this.relationDb.selectOne('orchestration_work', [
      { field: 'work_id', operator: Operator.EQ, value: workId },
    ]);
    if (!existingWork) {
      await this.relationDb.insertDB(insInput, Object.assign(new InsertDBOutput(), {}), new DBContext());
    }

    // --- 需求理解 Agent (IntentAgent) 前置执行 ---
    // 默认按上下文自动选择按理解执行 / 按原文执行，仅在主题部分重叠且置信极低时暂停询问。
    let executionQuery = input.user_query;
    if (this.intentAgent && !input.skip_intent_check) {
      const intentStartedAt = Date.now();
      const intentIn = Object.assign(new UnderstandRequirementInput(), {
        session_id: input.session_id,
        work_id: workId,
        user_query: input.user_query,
        citing_msg_ids: input.citing_msg_ids ?? [],
        selected_msg_ids: input.selected_msg_ids ?? [],
        interact_id: interactId,
        trace_id: input.trace_id ?? '',
      });
      const intentOut = new UnderstandRequirementOutput();
      try {
        await this.intentAgent.understandRequirement(intentIn, intentOut, new IntentAgentContext());

        const hasContext = Boolean(intentOut.has_context)
          || (input.citing_msg_ids?.length ?? 0) > 0
          || (input.selected_msg_ids?.length ?? 0) > 0;
        const decision = resolveIntentAction({
          originalQuery: input.user_query,
          understoodRequirement: intentOut.understood_requirement,
          matchScore: intentOut.match_score,
          threshold: intentOut.threshold_score,
          hasContext,
        });

        // 推送 IntentAgent 需求理解结果到前端（"思考过程"弹窗展示）
        if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function') {
          await this.streamAccess.pushEvent(input.session_id, 'intent_agent_result', 'AGENT_SPEC', {
            work_id: workId,
            interact_id: interactId,
            agent_type: 'INTENT',
            agent_name: '需求理解 Agent (Intent)',
            understood_requirement: intentOut.understood_requirement,
            match_score: intentOut.match_score,
            threshold_score: intentOut.threshold_score,
            reasoning: intentOut.reasoning,
            should_modify_query: intentOut.should_modify_query,
            auto_action: decision.action,
            auto_action_reason: decision.reason,
            prompt: intentOut.prompt,
            input_tokens: intentOut.input_tokens,
            output_tokens: intentOut.output_tokens,
            elapsed_ms: Date.now() - intentStartedAt,
          });
        }

        const intentAgentMeta = {
          understood_requirement: intentOut.understood_requirement,
          match_score: intentOut.match_score,
          threshold_score: intentOut.threshold_score,
          reasoning: intentOut.reasoning,
          should_modify_query: intentOut.should_modify_query,
          auto_action: decision.action,
          auto_action_reason: decision.reason,
          prompt: intentOut.prompt,
          input_tokens: intentOut.input_tokens,
          output_tokens: intentOut.output_tokens,
        };

        // 持久化 IntentAgent 结果到 orchestration_work.metadata 供历史查询
        const intentMeta = {
          trace_id: input.trace_id ?? '',
          understood_requirement: intentOut.understood_requirement,
          match_score: intentOut.match_score,
          threshold_score: intentOut.threshold_score,
          intent_agent: intentAgentMeta,
        };
        const intentMetaData: DataObject[] = [
          { field: 'metadata', value: JSON.stringify(intentMeta) },
          { field: 'updated', value: IdGenerator.now() },
        ];
        await this.relationDb.updateDB(
          Object.assign(new UpdateDBInput(), {
            table: 'orchestration_work',
            data: intentMetaData,
            conditions: [{ field: 'work_id', operator: Operator.EQ, value: workId }],
          }),
          new UpdateDBOutput(),
          new DBContext(),
        );

        if (decision.action === 'ASK') {
          if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function') {
            await this.streamAccess.pushEvent(input.session_id, 'intent_confirmation_required', 'CONTROL', {
              work_id: workId,
              interact_id: interactId,
              original_query: input.user_query,
              understood_requirement: intentOut.understood_requirement,
              match_score: intentOut.match_score,
              threshold_score: intentOut.threshold_score,
              reasoning: intentOut.reasoning,
            });
          }
          // 暂停等待确认时，仍补写用户 REQUEST 到 info_raw，保证对话区与 ChatMap 能展示本次提问
          try {
            const citingIds = Array.from(new Set([
              ...(input.citing_msg_ids ?? []),
              ...(input.selected_msg_ids ?? []),
            ]));
            const saveIn = Object.assign(new SaveInfoInput(), {
              session_id: input.session_id,
              work_id: workId,
              interact_id: interactId,
              info_type: input.info_type ?? InfoType.REQUEST,
              info_creator_role: input.info_creator_role ?? 'USER',
              info_creator_id: input.info_creator_id ?? '',
              info: input.user_query,
              parent_info_ids: citingIds,
              trace_id: input.trace_id ?? '',
            });
            await this.infoCore.saveInfo(saveIn, new SaveInfoOutput(), new InfoCoreContext());
          } catch (err) {
            this.logger?.error?.('receiveWork: saveInfo (paused) failed', { work_id: workId, error: String(err) });
          }
          const pauseData: DataObject[] = [
            { field: 'status', value: 'PAUSED_WAITING_CONFIRMATION' },
            { field: 'updated', value: IdGenerator.now() },
            { field: 'metadata', value: JSON.stringify({
              trace_id: input.trace_id ?? '',
              understood_requirement: intentOut.understood_requirement,
              match_score: intentOut.match_score,
              threshold_score: intentOut.threshold_score,
              intent_agent: intentAgentMeta,
            })},
          ];
          await this.relationDb.updateDB(
            Object.assign(new UpdateDBInput(), {
              table: 'orchestration_work',
              data: pauseData,
              conditions: [{ field: 'work_id', operator: Operator.EQ, value: workId }],
            }),
            new UpdateDBOutput(),
            new DBContext(),
          );
          output.work_id = workId;
          output.interact_id = interactId;
          output.final_response = '';
          output.paused = true;
          return true;
        }

        if (decision.action === 'APPROVE' && intentOut.understood_requirement?.trim()) {
          executionQuery = intentOut.understood_requirement.trim();
        }
      } catch (err) {
        this.logger?.error?.('receiveWork: IntentAgent failed, falling back to original user query', { error: String(err) });
      }
    }

    let strategy: string;
    if (input.force_orchestration_strategy) {
      strategy = input.force_orchestration_strategy;
    } else {
      const selInput = Object.assign(new SelectOrchestrationStrategyInput(), {
        user_query: executionQuery,
        trace_id: input.trace_id ?? '',
      });
      const selOutput = new SelectOrchestrationStrategyOutput();
      await this.selectOrchestrationStrategy(selInput, selOutput, context, metrics, report);
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
    await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());

    // 权威上下文由 JSONNode BUILD_WORK_CONTEXT 在 SAVE_USER_INPUT 之后构建并落盘快照。
    // 入口处不再预建一遍，避免重复 embedding / 画像 / 召回。
    const startCtx = { session_id: input.session_id, work_id: workId, interact_id: interactId };
    const startInput: StartOrchestrationInput = {
      work_id: workId,
      interact_id: interactId,
      session_id: input.session_id,
      user_query: executionQuery,
      original_user_query: input.user_query,
      strategy,
      work_context: {},
      trace_id: input.trace_id,
      citing_msg_ids: input.citing_msg_ids,
      selected_msg_ids: input.selected_msg_ids,
      info_type: input.info_type,
      info_creator_id: input.info_creator_id,
      info_creator_role: input.info_creator_role,
    };
    const startOutput = new StartOrchestrationOutput();

    try {
      await this.orchestrationStrategy.startOrchestration(startInput, startOutput, startCtx, metrics, report);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger?.error?.('receiveWork: orchestration failed', { work_id: workId, trace_id: input.trace_id ?? '', error: errMsg });
      await this.markWorkFailed(workId, errMsg);

      // 即使发生异常也保存错误 RESPONSE 消息到 info_raw 并引用用户请求，确保在 ChatMap 与历史中展示
      try {
        const reqRows = await this.relationDb.select('info_raw', {
          conditions: [
            { field: 'work_id', operator: Operator.EQ, value: workId },
            { field: 'info_type', operator: Operator.EQ, value: InfoType.REQUEST },
          ],
        });
        const reqId = reqRows.length > 0 ? (reqRows[0].info_id as string) : '';
        const parentInfoIds = reqId ? [reqId] : [];
        const errResponse = `[错误] ${errMsg}`;
        const saveIn = Object.assign(new SaveInfoInput(), {
          session_id: input.session_id,
          work_id: workId,
          interact_id: interactId,
          info_type: InfoType.RESPONSE,
          info_creator_role: 'AGENT',
          info_creator_id: workId,
          info: errResponse,
          parent_info_ids: parentInfoIds,
          handle_result_type: HandleResultType.INTERNAL_ERROR,
          trace_id: input.trace_id ?? '',
        });
        await this.infoCore.saveInfo(saveIn, new SaveInfoOutput(), new InfoCoreContext());
      } catch { /* best-effort */ }

      output.work_id = workId;
      output.interact_id = interactId;
      output.orchestration_strategy = strategy;
      output.final_response = `[错误] ${errMsg}`;
      output.error = errMsg;
      output.error_code = 'ORCHESTRATION_FAILED';
      return false;
    }

    // JSONNode 节点执行失败（经 HANDLE_ERROR 节点收敛），startOrchestration 正常返回但携带 error
    if (startOutput.error) {
      const errMsg = startOutput.error;
      await this.markWorkFailed(workId, errMsg);
      output.work_id = workId;
      output.interact_id = interactId;
      output.orchestration_strategy = strategy;
      output.final_response = startOutput.final_response || '抱歉，处理您的问题时出现了错误，请稍后重试。';
      output.error = errMsg;
      output.error_code = startOutput.error_code ?? 'ORCHESTRATION_NODE_FAILED';
      return false;
    }

    // Planner 识别出需用户补充参数的任务，编排暂停，等待前端收集参数后重入（submitClarification）
    if (startOutput.paused) {
      output.work_id = workId;
      output.interact_id = interactId;
      output.orchestration_strategy = strategy;
      output.final_response = '';
      output.paused = true;
      output.clarifications = startOutput.clarifications ?? [];
      return true;
    }

    const finalResponse = startOutput.final_response || '';

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
    await this.relationDb.updateDB(doneInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());

    output.work_id = workId;
    output.interact_id = interactId;
    output.orchestration_strategy = strategy;
    output.final_response = finalResponse;
    return true;
  }

  async selectOrchestrationStrategy(input: SelectOrchestrationStrategyInput, output: SelectOrchestrationStrategyOutput, _context: OrchestrationEntryContext, _metrics?: Metrics, _report?: Report,
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

  async receiveWorkAsync(input: ReceiveWorkAsyncInput, output: ReceiveWorkAsyncOutput, context: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
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
      { field: 'metadata', value: JSON.stringify({ job_id: jobId, async: true, callback_queue: input.callback_queue, session_type: input.session_type, info_type: input.info_type, info_creator_id: input.info_creator_id, info_creator_role: input.info_creator_role }) },
    ];

    const insInput = Object.assign(new InsertDBInput(), {
      table: 'orchestration_work',
      data: workData,
    });
    await this.relationDb.insertDB(insInput, Object.assign(new InsertDBOutput(), {}), new DBContext());

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
              session_type: input.session_type,
              info_type: input.info_type,
              info_creator_id: input.info_creator_id,
              info_creator_role: input.info_creator_role,
              user_query: input.user_query,
              force_orchestration_strategy: input.force_orchestration_strategy,
              callback_queue: input.callback_queue,
            },
          },
        });
        await this.mqAccess.sendMQ(sendInput, {}, {});

        if (this.mqCore) {
          // 查重：orchestration.work 常驻 worker 已存在则跳过。
          // 此前误调不存在的 getWorker，TypeError 直接跳到外层 catch，
          // 导致 worker 从未建立、每次都走 setImmediate 同步 fallback、队列消息滞留。
          const soWorkerOutput = Object.assign({}, { workers: [] as unknown[] });
          await this.mqCore.soWorker({ queue: 'orchestration.work' }, {}, soWorkerOutput);
          if ((soWorkerOutput.workers as unknown[]).length === 0) {
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
                    info_type: payload.info_type as string | undefined,
                    info_creator_id: payload.info_creator_id as string | undefined,
                    info_creator_role: payload.info_creator_role as string | undefined,
                  });
                  const rwOutput = new ReceiveWorkOutput();
                  await this.receiveWork(rwInput, rwOutput, context, metrics, report);

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
              info_type: input.info_type,
              info_creator_id: input.info_creator_id,
              info_creator_role: input.info_creator_role,
            });
            const rwOutput = new ReceiveWorkOutput();
            await this.receiveWork(rwInput, rwOutput, context, metrics, report);
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
            info_type: input.info_type,
            info_creator_id: input.info_creator_id,
            info_creator_role: input.info_creator_role,
          });
          const rwOutput = new ReceiveWorkOutput();
          await this.receiveWork(rwInput, rwOutput, context, metrics, report);
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

  // ===== 修改后的方法 =====
  async buildWorkContext(input: BuildWorkContextInput, output: BuildWorkContextOutput, _context: OrchestrationEntryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.session_id || !input.work_id) {
      return false;
    }
    let sessionContext: Record<string, unknown> = {};
    let contextCategories: unknown = undefined;
    let contextCategoryIds: unknown = undefined;
    let contextSourceIdsMap: unknown = undefined;
    let contextContentMap: unknown = undefined;
    let contextAttributeMap: unknown = undefined;
    try {
      // ===== 修改后的代码：传入 info: input.user_query 以支撑向量/关键词/标签召回 =====
      // 注：此处入口级构建在 SAVE_USER_INPUT 之前执行，当前 REQUEST 尚未落库，快照的 CURRENT 会误识别，
      //     故不落盘快照（persist_snapshot: false）；权威快照由 JSONNode BUILD_WORK_CONTEXT 在
      //     SAVE_USER_INPUT 之后按同一 work_id 落盘，保证快照与问答实际执行使用的上下文一致。
      const ctxInfoInput = Object.assign(new ContextInfoInput(), {
        session_id: input.session_id,
        work_id: input.work_id,
        selected_msg_ids: input.selected_msg_ids,
        info: input.user_query,
        persist_snapshot: false,
      });
      const ctxInfoOutput = new ContextInfoOutput();
      await this.infoCore.context(ctxInfoInput, ctxInfoOutput, Object.assign(new InfoCoreContext(), { session_id: input.session_id }) as InfoCoreContext);
      sessionContext = ctxInfoOutput.list as unknown as Record<string, unknown>;
      contextCategories = ctxInfoOutput.categories;
      contextCategoryIds = ctxInfoOutput.category_ids;
      contextSourceIdsMap = ctxInfoOutput.source_ids_map;
      contextContentMap = ctxInfoOutput.content_map;
      contextAttributeMap = ctxInfoOutput.attribute_map;
    } catch { /* degrade gracefully */ }

    let userProfile: Record<string, unknown> = {};
    try {
      const profileInput = Object.assign(new GetUserProfileInput(), {
        session_id: input.session_id,
      });
      const profileOutput = new GetUserProfileOutput();
      await this.writerAgent.soUserProfile(profileInput, profileOutput, Object.assign(new WriterAgentContext(), { session_id: input.session_id }) as WriterAgentContext);
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
    await this.relationDb.selectDB(recentSelInput, recentSelOutput, new DBContext());

    const recentWorks = recentSelOutput.rows.map((row) => ({
      user_query: row.user_query,
      response_summary: ((row.final_response as string) ?? '').slice(0, 200),
    }));

    output.work_context = {
      work_id: input.work_id,
      session_id: input.session_id,
      user_query: input.user_query,
      session_context: sessionContext,
      context_categories: contextCategories,
      context_category_ids: contextCategoryIds,
      context_source_ids_map: contextSourceIdsMap,
      context_content_map: contextContentMap,
      context_attribute_map: contextAttributeMap,
      user_profile: userProfile,
      recent_works: recentWorks,
      selected_msg_ids: input.selected_msg_ids ?? [],
      created_at: IdGenerator.now(),
      metadata: { orchestration_version: '1.0' },
    };
    return true;
  }

  async soWorkStatus(input: GetWorkStatusInput, output: GetWorkStatusOutput, _context: OrchestrationEntryContext, _metrics?: Metrics, _report?: Report,
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
    await this.relationDb.selectDB(selInput, selOutput, new DBContext());

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

  async cancelWork(input: CancelWorkInput, output: CancelWorkOutput, _context: OrchestrationEntryContext, _metrics?: Metrics, _report?: Report,
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
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

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
      cancelExecOutput,
      { session_id: ((work.session_id as string) ?? '') } as OrchestrationExecutionContext,
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
    await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());

    output.cancelled = true;
    return true;
  }

  async configOrchestrationEntry(input: ConfigOrchestrationEntryInput, output: ConfigOrchestrationEntryOutput, _context: OrchestrationEntryContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'orchestration_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

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
    if (input.enable_planner !== undefined) {
      data.push({ field: 'enable_planner', value: input.enable_planner ? 1 : 0 });
    }

    if (data.length > 2) {
      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_config',
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
    }

    output.config = current;
    return true;
  }

  async confirmIntent(input: ConfirmIntentInput, output: ConfirmIntentOutput, _context: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    if (!input.work_id) throw new ValidationError('work_id is required');
    if (!input.action) throw new ValidationError('action is required');

    const selectIn = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_work',
        conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }],
      },
    });
    const selectOut = new SelectOneDBOutput();
    await this.relationDb.selectOneDB(selectIn, selectOut, new DBContext());
    if (!selectOut.row) throw new NotFoundError('orchestration_work', input.work_id);

    const record = selectOut.row as Record<string, unknown>;
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(String(record.metadata ?? '{}'));
    } catch {}

    if (input.action === 'CANCEL') {
      const updData: DataObject[] = [
        { field: 'status', value: 'CANCELLED' },
        { field: 'cancel_reason', value: 'User cancelled intent confirmation' },
        { field: 'updated', value: IdGenerator.now() },
      ];
      await this.relationDb.updateDB(
        Object.assign(new UpdateDBInput(), {
          table: 'orchestration_work',
          data: updData,
          conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }],
        }),
        new UpdateDBOutput(),
        new DBContext(),
      );
      // 取消时丢弃本次提问已落库的 REQUEST 消息及其派生数据，
      // 避免刷新后历史 / ChatMap 重新展示已取消的提问。
      await this.infoCore.delInfoByWork(
        Object.assign(new DelInfoByWorkInput(), { work_id: input.work_id }),
        new DelInfoByWorkOutput(),
        new InfoCoreContext(),
      );
      if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function') {
        await this.streamAccess.pushEvent(String(record.session_id), 'cancelled', 'CONTROL', {
          work_id: input.work_id,
          reason: 'User cancelled intent confirmation',
        });
      }
      output.success = true;
      output.action_applied = 'CANCEL';
      output.next_status = 'CANCELLED';
      return true;
    }

    let finalQuery = String(record.user_query);
    if (input.action === 'APPROVE') {
      finalQuery = input.understood_requirement || String(metadata.understood_requirement || record.user_query);
    }

    // ===== 修改：保留原始需求 =====
    // APPROVE 仅将理解后的需求作为重入编排的执行 query，不再覆盖 info_raw 中已保存的
    // 原始 REQUEST 消息内容，保证对话历史 / ChatMap 始终展示用户原始输入（而非改写后的需求）。
    // （原始逻辑会调用 rewriteRequestInfo 改写 REQUEST，现已移除，避免历史消息失真。）

    // ===== 修改：透传原 work 的 trace_id，保证确认流程（APPROVE/KEEP）重入编排时
    //      写出的 RESPONSE 消息 trace_id 与首次提交一致（否则刷新后复制 TraceId 按钮无值）。 =====
    const rwInput = Object.assign(new ReceiveWorkInput(), {
      session_id: String(record.session_id),
      user_query: finalQuery,
      skip_intent_check: true,
      trace_id: String(metadata.trace_id ?? ''),
    });
    const rwOutput = new ReceiveWorkOutput();
    const rwCtx = Object.assign(new OrchestrationEntryContext(), {
      session_id: String(record.session_id),
      work_id: input.work_id,
      interact_id: String(record.interact_id),
    });

    const ok = await this.receiveWork(rwInput, rwOutput, rwCtx, metrics, report);
    output.success = ok;
    output.action_applied = input.action;
    output.next_status = 'PROCESSING';
    output.final_response = rwOutput.final_response || '';
    output.interact_id = rwOutput.interact_id || String(record.interact_id || '');
    return ok;
  }

  /**
   * 用户补充参数后重入编排：将澄清问题答案并入原始需求，重新执行完整编排流程。
   * 与 confirmIntent 类似，但以「原始需求 + 用户补充参数」作为重入的 user_query，
   * 并透传原 work_id / interact_id / trace_id 保证幂等与历史一致。
   */
  async submitClarification(input: SubmitClarificationInput, output: SubmitClarificationOutput, _context: OrchestrationEntryContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    if (!input.work_id) throw new ValidationError('work_id is required');
    if (!input.answers || !Array.isArray(input.answers) || input.answers.length === 0) {
      throw new ValidationError('answers is required');
    }

    const selectIn = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_work',
        conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }],
      },
    });
    const selectOut = new SelectOneDBOutput();
    await this.relationDb.selectOneDB(selectIn, selectOut, new DBContext());
    if (!selectOut.row) throw new NotFoundError('orchestration_work', input.work_id);

    const record = selectOut.row as Record<string, unknown>;
    let metadata: Record<string, unknown> = {};
    try {
      metadata = JSON.parse(String(record.metadata ?? '{}'));
    } catch {}

    // 保留原始需求：user_query 仍为原始输入，用户补充参数作为附加约束一并交给 Planner 重新拆解
    const answerLines = input.answers
      .filter((a) => a && typeof a.answer === 'string' && a.answer.trim())
      .map((a) => `- ${a.question ? `${a.question}：` : ''}${a.answer.trim()}`);
    const supplement = answerLines.length > 0 ? `\n\n[用户补充的参数]\n${answerLines.join('\n')}` : '';
    const finalQuery = `${String(record.user_query)}${supplement}`;

    const rwInput = Object.assign(new ReceiveWorkInput(), {
      session_id: String(record.session_id),
      user_query: finalQuery,
      skip_intent_check: true,
      trace_id: String(metadata.trace_id ?? ''),
    });
    const rwOutput = new ReceiveWorkOutput();
    const rwCtx = Object.assign(new OrchestrationEntryContext(), {
      session_id: String(record.session_id),
      work_id: input.work_id,
      interact_id: String(record.interact_id),
    });

    const ok = await this.receiveWork(rwInput, rwOutput, rwCtx, metrics, report);
    output.success = ok;
    output.final_response = rwOutput.final_response || '';
    output.interact_id = rwOutput.interact_id || String(record.interact_id || '');
    output.clarifications = rwOutput.clarifications ?? [];

    // 保存补充参数记录到 info_raw（USER ACT），用于对话历史与思考过程展示，
    // 避免「用户补充了哪些参数」在流程结束后丢失。
    try {
      await this.infoCore.saveInfo(
        Object.assign(new SaveInfoInput(), {
          session_id: String(record.session_id),
          work_id: input.work_id,
          interact_id: String(record.interact_id || ''),
          info_type: InfoType.ACT,
          info_creator_role: 'USER',
          info_creator_id: '',
          info: JSON.stringify({ clarifications: input.answers }),
          trace_id: String(metadata.trace_id ?? ''),
        }),
        new SaveInfoOutput(),
        new InfoCoreContext(),
      );
    } catch (err) {
      this.logger?.error?.('submitClarification: saveInfo (answers) failed', {
        work_id: input.work_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return ok;
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
    await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
  }

  /**
   * 需求确认 APPROVE 时，将 info_raw 中该 work 已落库的 REQUEST 消息内容改写为
   * 理解后的需求，保证对话历史 / ChatMap 与前端展示一致（前后端同步替换）。
   * best-effort：改写失败不影响后续编排。
   */
  private async rewriteRequestInfo(workId: string, newContent: string): Promise<void> {
    try {
      const updIn = Object.assign(new UpdateInfoInput(), {
        work_id: workId,
        info_type: InfoType.REQUEST,
        info: newContent,
      });
      await this.infoCore.updateInfo(updIn, new UpdateInfoOutput(), new InfoCoreContext());
    } catch (err) {
      this.logger?.error?.('rewriteRequestInfo: update REQUEST failed', {
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async getConfigValue(field: string, defaultValue: number): Promise<number> {
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_config' },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());
      const row = selOutput.row as Record<string, unknown> | null;
      return (row?.[field] as number) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }
}
