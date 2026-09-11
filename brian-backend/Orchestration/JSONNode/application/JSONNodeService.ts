import { Metrics, Report } from '@brian-agent/base';
import {
  RelationDBAccess, InsertDBInput, SelectDBInput,
  SelectOneDBInput, UpdateDBInput, Operator, DataObject,
  InsertDBOutput, SelectDBOutput, SelectOneDBOutput,
  UpdateDBOutput, DBContext, IdGenerator, ValidationError,
  InfoType,
  HandleResultType,
  type Logger, type Condition,
  type StreamAccess,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  SaveInfoInput, SaveInfoOutput,
  ContextInfoInput, ContextInfoOutput,
  InfoCoreContext,
} from '@brian-agent/core';
import type {
  AgentBuilderAccess, WriterAgentAccess,
  PlannerAgentAccess, EvolutorAgentAccess,
  SummaryAgentAccess,
} from '@brian-agent/agent';
import {
  BuildAgentInput, BuildAgentOutput,
  AgentBuilderContext,
  WriteInput, WriteOutput,
  WriterAgentContext,
  PlanHierarchicalInput, PlanHierarchicalOutput,
  PlannerAgentContext,
  EvalWriterAgentInput, EvalWriterAgentOutput,
  EvalWorkAgentInput, EvalWorkAgentOutput,
  StartEvalScheduleInput, StartEvalScheduleOutput,
  EvolutorAgentContext,
  GetUserProfileInput, GetUserProfileOutput,
  GenerateSummaryInput, GenerateSummaryOutput,
  SummaryAgentContext,
} from '@brian-agent/agent';
import type { OrchestrationExecutionAccess } from '../../OrchestrationExecution/access/OrchestrationExecutionAccess';
import {
  OrchestrationExecutionContext,
  ExecSingleAgentInput, ExecSingleAgentOutput,
  BuildAgentDAGInput, BuildAgentDAGOutput,
  ExecDAGInput, ExecDAGOutput,
  RecordSystemAgentExecutionInput, RecordSystemAgentExecutionOutput,
  type AgentDAG, type TaskDAG,
} from '../../OrchestrationExecution/domain/types';
import { JSONNodeContext, JSONNodeConfig, NodeHandler, NodeExecutionTrace, ExecJSONNodeInput, ExecJSONNodeOutput, GetJSONNodeTraceInput, GetJSONNodeTraceOutput, RegisterNodeTypeInput, RegisterNodeTypeOutput, ValidateJSONNodeInput, ValidateJSONNodeOutput, ConfigJSONNodeInput, ConfigJSONNodeOutput, BUILTIN_NODE_TYPES } from '../domain/types';
import { selectOrchestrationStrategy } from '../../shared/strategySelector';

export class JSONNodeService {
  private readonly nodeTypeRegistry = new Map<string, NodeHandler>();
  private config = new JSONNodeConfig();
  private readonly invokeRegistry = new Map<string, NodeHandler>();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly writerAgent: WriterAgentAccess,
    private readonly plannerAgent: PlannerAgentAccess,
    private readonly evolutorAgent: EvolutorAgentAccess,
    private readonly orchestrationExecution: OrchestrationExecutionAccess,
    private readonly llmAccess?: any,
    private readonly promptsAccess?: any,
    private readonly mqAccess?: any,
    private readonly mqCore?: any,
    private readonly logger?: Logger,
    private readonly streamAccess?: StreamAccess,
    private readonly summaryAgent?: SummaryAgentAccess,
  ) {}

  getNodeTypeRegistry(): Map<string, NodeHandler> {
    return this.nodeTypeRegistry;
  }

  getInvokeRegistry(): Map<string, NodeHandler> {
    return this.invokeRegistry;
  }

  getConfig(): JSONNodeConfig {
    return this.config;
  }

  registerBuiltinHandlers(): void {
    this.nodeTypeRegistry.set('SAVE_USER_INPUT', (sd, p, c) => this.handleSaveUserInput(sd, p, c));
    this.nodeTypeRegistry.set('BUILD_WORK_CONTEXT', (sd, p, c) => this.handleBuildWorkContext(sd, p, c));
    this.nodeTypeRegistry.set('SELECT_STRATEGY', (sd, p, c) => this.handleSelectStrategy(sd, p, c));
    this.nodeTypeRegistry.set('CONDITION', (sd, p, c) => this.handleCondition(sd, p, c));
    this.nodeTypeRegistry.set('BUILD_WORK_AGENT', (sd, p, c) => this.handleBuildWorkAgent(sd, p, c));
    this.nodeTypeRegistry.set('EXEC_AGENT', (sd, p, c) => this.handleExecAgent(sd, p, c));
    this.nodeTypeRegistry.set('PLAN_WORK', (sd, p, c) => this.handlePlanWork(sd, p, c));
    this.nodeTypeRegistry.set('BUILD_AGENT_DAG', (sd, p, c) => this.handleBuildAgentDAG(sd, p, c));
    this.nodeTypeRegistry.set('EXEC_DAG', (sd, p, c) => this.handleExecDAG(sd, p, c));
    this.nodeTypeRegistry.set('WRITE_RESULT', (sd, p, c) => this.handleWriteResult(sd, p, c));
    this.nodeTypeRegistry.set('EVAL_RESULT', (sd, p, c) => this.handleEvalResult(sd, p, c));
    this.nodeTypeRegistry.set('SAVE_RESPONSE', (sd, p, c) => this.handleSaveResponse(sd, p, c));
    this.nodeTypeRegistry.set('HANDLE_ERROR', (sd, p, c) => this.handleError(sd, p, c));
    this.nodeTypeRegistry.set('INVOKE', (sd, p, c) => this.handleInvoke(sd, p, c));
  }

  private async ensureConfigLoaded(): Promise<void> {
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_config' },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());
      const current = (selOutput.row ?? {}) as Record<string, unknown>;
      if (current.max_execution_depth !== undefined && current.max_execution_depth !== null) {
        this.config.max_execution_depth = Number(current.max_execution_depth);
      }
      if (current.node_timeout_ms !== undefined && current.node_timeout_ms !== null) {
        this.config.node_timeout_ms = Number(current.node_timeout_ms);
      }
      if (current.trace_enabled !== undefined && current.trace_enabled !== null) {
        this.config.trace_enabled = Boolean(current.trace_enabled);
      }
    } catch {
      /* ignore if table not ready or query fails */
    }
  }

  // ===== 修改后的方法 =====
  async execJSONNode(input: ExecJSONNodeInput, output: ExecJSONNodeOutput, context: JSONNodeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    await this.ensureConfigLoaded();
    const def = input.jsonnode_definition;
    const sharedData: Record<string, unknown> = {
      ...(input.initial_data ?? {}),
    };
    context.work_id = context.work_id ?? (sharedData.work_id as string);
    context.interact_id = context.interact_id ?? (sharedData.interact_id as string);
    context.session_id = context.session_id ?? (sharedData.session_id as string);
    const trace: NodeExecutionTrace[] = [];

    const nodeMap = new Map(def.nodes.map((n) => [n.node_id, n]));
    if (!nodeMap.has(def.start_node)) {
      output.error = `start_node "${def.start_node}" not found in nodes`;
      return false;
    }

    for (const node of def.nodes) {
      const nextIds: string[] = [];
      if (node.on_error) nextIds.push(node.on_error);
      if (node.next) nextIds.push(node.next);
      if (node.true_next) nextIds.push(node.true_next);
      if (node.false_next) nextIds.push(node.false_next);
      for (const nid of nextIds) {
        if (!nodeMap.has(nid)) {
          output.error = `node "${node.node_id}" references unknown node_id "${nid}"`;
          return false;
        }
      }
    }

    let currentNode = nodeMap.get(def.start_node) ?? null;
    let depth = 0;
    const maxDepth = this.config.max_execution_depth;

    while (currentNode && depth < maxDepth) {
      const node = currentNode;
      depth++;
      const handler = this.nodeTypeRegistry.get(node.node_type);
      if (!handler) {
        this.logger?.error?.('JSONNode: unknown node_type', { node_type: node.node_type });
        currentNode = node.on_error ? (nodeMap.get(node.on_error) ?? null) : null;
        continue;
      }

      const startedAt = Date.now();
      const traceEntry: NodeExecutionTrace = {
        node_id: node.node_id,
        node_type: node.node_type,
        status: 'RUNNING',
        elapsed_ms: 0,
      };

      const sId = (sharedData.session_id as string) ?? context.session_id ?? '';
      const wId = (sharedData.work_id as string) ?? context.work_id ?? '';
      const iId = (sharedData.interact_id as string) ?? context.interact_id ?? '';

      if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sId) {
        await this.streamAccess.pushEvent(sId, 'dag_node_start', 'DAG', {
          node_id: node.node_id,
          node_type: node.node_type,
          params: node.params,
        }, { work_id: wId, interact_id: iId, node_id: node.node_id });
      }

      try {
        const timeoutMs = this.config.node_timeout_ms;
        if (timeoutMs > 0) {
          let timer: NodeJS.Timeout | null = null;
          try {
            await Promise.race([
              handler(sharedData, node.params, context),
              new Promise<void>((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Node execution timeout after ${timeoutMs}ms`)), timeoutMs);
              }),
            ]);
          } finally {
            if (timer) {
              clearTimeout(timer);
            }
          }
        } else {
          await handler(sharedData, node.params, context);
        }
        traceEntry.status = 'SUCCESS';
        traceEntry.elapsed_ms = Date.now() - startedAt;
        trace.push(traceEntry);

        if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sId) {
          await this.streamAccess.pushEvent(sId, 'dag_node_end', 'DAG', {
            node_id: node.node_id,
            node_type: node.node_type,
            status: 'SUCCESS',
            elapsed_ms: traceEntry.elapsed_ms,
          }, { work_id: wId, interact_id: iId, node_id: node.node_id });
        }

        if (this.config.trace_enabled) {
          await this.saveTrace(input.orchestration_id, traceEntry);
        }

        // 需求澄清短路：节点将 sharedData._paused 置位（如 PLAN_WORK 识别到需用户补充参数），
        // 终止后续节点执行，等待前端收集参数后重入编排。
        if (sharedData._paused) {
          currentNode = null;
          continue;
        }

        if (node.node_type === 'CONDITION') {
          const condResult = sharedData._condition_result as boolean;
          const nextId = condResult ? node.true_next : node.false_next;
          currentNode = nextId ? (nodeMap.get(nextId) ?? null) : null;
        } else {
          currentNode = node.next ? (nodeMap.get(node.next) ?? null) : null;
        }
      } catch (err: unknown) {
        traceEntry.status = 'ERROR';
        traceEntry.elapsed_ms = Date.now() - startedAt;
        const errorMsg = err instanceof Error ? err.message : String(err);
        traceEntry.error = errorMsg;
        trace.push(traceEntry);

        if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sId) {
          await this.streamAccess.pushEvent(sId, 'dag_node_end', 'DAG', {
            node_id: node.node_id,
            node_type: node.node_type,
            status: 'ERROR',
            error: errorMsg,
            elapsed_ms: traceEntry.elapsed_ms,
          }, { work_id: wId, interact_id: iId, node_id: node.node_id });
        }

        if (this.config.trace_enabled) {
          await this.saveTrace(input.orchestration_id, traceEntry);
        }

        sharedData._error = errorMsg;
        this.logger?.error?.('JSONNode: node execution failed', {
          node_id: node.node_id,
          node_type: node.node_type,
          error: errorMsg,
          trace_id: (sharedData.trace_id as string) ?? '',
          work_id: (sharedData.work_id as string) ?? '',
          interact_id: (sharedData.interact_id as string) ?? '',
        });
        if (node.on_error && node.on_error !== node.node_id) {
          currentNode = nodeMap.get(node.on_error) ?? null;
        } else {
          if (node.on_error === node.node_id) {
            this.logger?.error?.('JSONNode: on_error self-loop detected, terminating', { node_id: node.node_id });
          }
          currentNode = null;
        }
      }
    }

    output.shared_data = sharedData;
    output.execution_trace = trace;
    return true;
  }

  async soJSONNodeTrace(input: GetJSONNodeTraceInput, output: GetJSONNodeTraceOutput, _context: JSONNodeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'orchestration_jsonnode_trace',
        conditions: [
          { field: 'orchestration_id', operator: Operator.EQ, value: input.orchestration_id },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, selOutput, new DBContext());
    output.trace = (selOutput.rows as unknown as NodeExecutionTrace[]) ?? [];
    return true;
  }

  registerNodeType(input: RegisterNodeTypeInput, output: RegisterNodeTypeOutput, _context: JSONNodeContext, _metrics?: Metrics, _report?: Report,
  ): boolean {
    output.registered = false;
    if (!input.node_type) {
      return false;
    }
    if (typeof input.handler !== 'function') {
      return false;
    }
    if (BUILTIN_NODE_TYPES.includes(input.node_type as typeof BUILTIN_NODE_TYPES[number])) {
      return false;
    }
    this.nodeTypeRegistry.set(input.node_type, input.handler);
    output.registered = true;
    return true;
  }

  validate(input: ValidateJSONNodeInput, output: ValidateJSONNodeOutput, _context: JSONNodeContext, _metrics?: Metrics, _report?: Report,
  ): boolean {
    const errors: string[] = [];
    const def = input.jsonnode_definition;

    if (!def.version || def.version !== '1.0') {
      errors.push('version must be "1.0"');
    }

    const nodeMap = new Map(def.nodes.map((n) => [n.node_id, n]));

    if (!def.start_node || !nodeMap.has(def.start_node)) {
      errors.push('start_node must exist in nodes');
    }

    const nodeIds = new Set<string>();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const node of def.nodes) {
      if (nodeIds.has(node.node_id)) {
        errors.push(`Duplicate node_id: ${node.node_id}`);
      }
      nodeIds.add(node.node_id);

      if (!uuidRegex.test(node.node_id)) {
        errors.push(`node_id must be UUID format: ${node.node_id}`);
      }

      if (!this.nodeTypeRegistry.has(node.node_type)) {
        errors.push(`Unknown node_type: ${node.node_type}`);
      }

      if (!node.params) {
        errors.push(`Missing params for node: ${node.node_id}`);
      }

      const nextIds: string[] = [];
      if (node.on_error) nextIds.push(node.on_error);
      if (node.next) nextIds.push(node.next);
      if (node.true_next) nextIds.push(node.true_next);
      if (node.false_next) nextIds.push(node.false_next);
      for (const nid of nextIds) {
        if (!nodeMap.has(nid)) {
          errors.push(`Node "${node.node_id}" references unknown node_id "${nid}"`);
        }
      }
    }

    const visited = new Set<string>();
    const inStack = new Set<string>();
    const hasCycle = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      inStack.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (node) {
        const nextIds: string[] = [];
        if (node.next) nextIds.push(node.next);
        if (node.true_next) nextIds.push(node.true_next);
        if (node.false_next) nextIds.push(node.false_next);
        for (const nid of nextIds) {
          if (hasCycle(nid)) return true;
        }
      }
      inStack.delete(nodeId);
      return false;
    };

    if (hasCycle(def.start_node)) {
      errors.push('Graph contains a cycle');
    }

    output.valid = errors.length === 0;
    output.errors = errors;
    return true;
  }

  async configJSONNode(input: ConfigJSONNodeInput, output: ConfigJSONNodeOutput, _context: JSONNodeContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (input.max_execution_depth !== undefined && input.max_execution_depth <= 0) {
      throw new ValidationError('max_execution_depth must be positive');
    }
    if (input.node_timeout_ms !== undefined && input.node_timeout_ms <= 0) {
      throw new ValidationError('node_timeout_ms must be positive');
    }

    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'orchestration_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

    const current = (selOutput.row ?? {}) as Record<string, unknown>;

    this.config.max_execution_depth = (current.max_execution_depth as number) ?? this.config.max_execution_depth;
    this.config.node_timeout_ms = (current.node_timeout_ms as number) ?? this.config.node_timeout_ms;
    this.config.trace_enabled = ((current.trace_enabled as number) ?? this.config.trace_enabled ? 1 : 0) ? true : false;

    const data: DataObject[] = [];

    if (input.max_execution_depth !== undefined) {
      this.config.max_execution_depth = input.max_execution_depth;
      data.push({ field: 'max_execution_depth', value: input.max_execution_depth });
    }
    if (input.node_timeout_ms !== undefined) {
      this.config.node_timeout_ms = input.node_timeout_ms;
      data.push({ field: 'node_timeout_ms', value: input.node_timeout_ms });
    }
    if (input.trace_enabled !== undefined) {
      this.config.trace_enabled = input.trace_enabled;
      data.push({ field: 'trace_enabled', value: input.trace_enabled ? 1 : 0 });
    }

    if (data.length > 0) {
      const id = (current.id as string) || IdGenerator.generate();
      data.push({ field: 'id', value: id });
      data.push({ field: 'created', value: (current.created as number) || IdGenerator.now() });
      data.push({ field: 'updated', value: IdGenerator.now() });

      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_config',
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
    }

    output.config = { ...this.config };
    return true;
  }

  // ---------------------------------------------------------------------------
  // Builtin node handlers
  // ---------------------------------------------------------------------------

  private async handleSaveUserInput(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const userQuery = (sharedData.user_query as string) ?? '';
    const displayQuery = String(sharedData.original_user_query ?? '').trim() || userQuery;
    const sessionId = (sharedData.session_id as string) ?? context.session_id ?? '';
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';

    const citingIds = Array.from(new Set([
      ...((sharedData.citing_msg_ids as string[]) ?? []),
      ...((sharedData.selected_msg_ids as string[]) ?? []),
    ]));

    // 幂等：确认流程（confirmIntent）重新执行时 work_id 相同，若已存在该 work 的 REQUEST 则复用，避免重复落库
    let existingInfoId = '';
    try {
      const existingRows = await this.relationDb.select('info_raw', {
        fields: ['info_id'],
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: workId },
          { field: 'info_type', operator: Operator.EQ, value: InfoType.REQUEST },
        ],
        page: { current: 1, size: 1 },
      });
      if (existingRows.length > 0 && existingRows[0].info_id) {
        existingInfoId = String(existingRows[0].info_id);
      }
    } catch { /* best-effort */ }

    if (existingInfoId) {
      sharedData.user_input_info_id = existingInfoId;
      return;
    }

    const saveInput = Object.assign(new SaveInfoInput(), {
      session_id: sessionId,
      work_id: workId,
      interact_id: interactId,
      info_type: (sharedData.info_type as string) ?? (params.info_type as string) ?? InfoType.REQUEST,
      info_creator_role: (sharedData.info_creator_role as string) ?? 'USER',
      info_creator_id: (sharedData.info_creator_id as string) ?? '',
      info: displayQuery,
      parent_info_ids: citingIds,
      trace_id: (sharedData.trace_id as string) ?? '',
    });
    const saveOut = new SaveInfoOutput();
    try {
      await this.infoCore.saveInfo(saveInput, saveOut, new InfoCoreContext());
      sharedData.user_input_info_id = saveOut.info_id;
    } catch (err: unknown) {
      this.logger?.error?.('handleSaveUserInput: saveInfo failed', {
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const newStatus = (params.update_work_status as string) ?? 'CREATED';
    if (workId) {
      const updData: DataObject[] = [
        { field: 'status', value: newStatus },
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
  }

  private async handleBuildWorkContext(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const sessionId = (sharedData.session_id as string) ?? context.session_id ?? '';
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const userQuery = (sharedData.user_query as string) ?? '';
    const maxRecent = (params.max_recent_works as number) ?? 5;
    const includeProfile = (params.include_user_profile as boolean) ?? true;
    const contextStartedAt = Date.now();

    let sessionContext: Record<string, unknown> = {};
    let contextCategories: unknown = undefined;
    let contextCategoryIds: unknown = undefined;
    let contextSourceIdsMap: unknown = undefined;
    let contextContentMap: unknown = undefined;
    let contextAttributeMap: unknown = undefined;
    try {
      const selectedMsgIds = Array.isArray(sharedData.selected_msg_ids) ? sharedData.selected_msg_ids as string[] : undefined;
      // ===== 修改后的代码：传入 user_query 以支撑向量/关键词/标签召回 =====
      const userQuery = typeof sharedData.user_query === 'string' ? sharedData.user_query : undefined;
      const ctxInfoInput = Object.assign(new ContextInfoInput(), {
        session_id: sessionId,
        work_id: workId,
        selected_msg_ids: selectedMsgIds,
        info: userQuery,
        // 权威快照落盘点：此节点在 SAVE_USER_INPUT 之后执行，当前 REQUEST 已落库，
        // 按 work_id 生成并落盘本次问答的上下文快照（仅 source → info_id）。
        persist_snapshot: true,
      });
      const ctxInfoOutput = new ContextInfoOutput();
      await this.infoCore.context(ctxInfoInput, ctxInfoOutput, new InfoCoreContext());
      sessionContext = ctxInfoOutput.list as unknown as Record<string, unknown>;
      contextCategories = ctxInfoOutput.categories;
      contextCategoryIds = ctxInfoOutput.category_ids;
      contextSourceIdsMap = ctxInfoOutput.source_ids_map;
      contextContentMap = ctxInfoOutput.content_map;
      contextAttributeMap = ctxInfoOutput.attribute_map;
    } catch { /* degrade gracefully */ }

    let userProfile: Record<string, unknown> = {};
    if (includeProfile) {
      try {
        const profileInput = Object.assign(new GetUserProfileInput(), { session_id: sessionId });
        const profileOutput = new GetUserProfileOutput();
        await this.writerAgent.soUserProfile(profileInput, profileOutput, new WriterAgentContext());
        userProfile = profileOutput.user_profile as unknown as Record<string, unknown>;
      } catch { /* degrade gracefully */ }
    }

    const recentSelInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'orchestration_work',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: sessionId },
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

    sharedData.work_context = {
      work_id: workId,
      session_id: sessionId,
      user_query: userQuery,
      session_context: sessionContext,
      context_categories: contextCategories,
      context_category_ids: contextCategoryIds,
      context_source_ids_map: contextSourceIdsMap,
      context_content_map: contextContentMap,
      context_attribute_map: contextAttributeMap,
      user_profile: userProfile,
      recent_works: recentWorks,
      created_at: IdGenerator.now(),
      metadata: { orchestration_version: '1.0' },
    };

    // 上下文构建过程与结果：流式推送给前端，但不存入消息表 info_raw（避免内容膨胀）
    // ===== 修改后的代码：将完整上下文分类与 ID 映射表通过 context_built 事件透传给前端 =====
    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
      await this.streamAccess.pushEvent(sessionId, 'context_built', 'CONTEXT', {
        user_profile: userProfile,
        session_context: sessionContext,
        context_categories: contextCategories,
        context_category_ids: contextCategoryIds,
        recent_works: recentWorks,
        recent_works_count: recentWorks.length,
        user_profile_present: Boolean(userProfile && Object.keys(userProfile).length > 0),
        session_context_count: Array.isArray(sessionContext) ? sessionContext.length : 0,
        created_at: IdGenerator.now(),
        elapsed_ms: Date.now() - contextStartedAt,
      }, {
        work_id: workId,
        interact_id: (sharedData.interact_id as string) ?? context.interact_id ?? '',
        node_id: 'BUILD_WORK_CONTEXT',
      });
    }
  }

  private async handleSelectStrategy(
    sharedData: Record<string, unknown>,
    _params: Record<string, unknown>,
    _context: JSONNodeContext,
  ): Promise<void> {
    const userQuery = (sharedData.user_query as string) ?? '';
    const result = await selectOrchestrationStrategy(
      this.relationDb,
      this.promptsAccess,
      this.llmAccess,
      userQuery,
      sharedData.work_context as Record<string, unknown> | undefined,
      this.logger,
    );
    sharedData.strategy = result.strategy;
    sharedData.complexity = result.complexity;
    sharedData.reason = result.reason;
  }

  private async handleCondition(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    _context: JSONNodeContext,
  ): Promise<void> {
    const field = params.field as string;
    const operator = params.operator as string;
    const value = params.value;
    const fieldValue = sharedData[field];
    sharedData._condition_result = this.evaluateCondition(fieldValue, operator, value);
  }

  private async handleBuildWorkAgent(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const userQuery = (sharedData.user_query as string) ?? '';
    const sessionId = (sharedData.session_id as string) ?? context.session_id ?? '';
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';
    const forceNew = (params.force_new as boolean) ?? false;

    const buildInput = Object.assign(new BuildAgentInput(), {
      interact_id: interactId,
      task_content: userQuery,
      force_new: forceNew,
    });
    const buildOutput = new BuildAgentOutput();
    const builderCtx = Object.assign(new AgentBuilderContext(), {
      session_id: sessionId,
      work_id: workId,
      interact_id: interactId,
    });
    await this.agentBuilder.buildAgent(buildInput, buildOutput, builderCtx);
    const agentId = buildOutput.agent_id;

    sharedData.current_agent_id = agentId;
    const existingIds = (sharedData.agent_ids as string[]) ?? [];
    existingIds.push(agentId);
    sharedData.agent_ids = existingIds;
  }

  private async handleExecAgent(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';
    const agentIdKey = (params.agent_id_key as string) ?? 'current_agent_id';
    const saveResultKey = (params.save_result_key as string) ?? 'agent_answer';
    const agentId = (sharedData[agentIdKey] as string) ?? '';
    const workContext = sharedData.work_context ? JSON.stringify(sharedData.work_context) : undefined;

    const updExecData: DataObject[] = [
      { field: 'status', value: 'EXECUTING' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    try {
      await this.relationDb.updateDB(
        Object.assign(new UpdateDBInput(), {
          table: 'orchestration_work',
          data: updExecData,
          conditions: [
            { field: 'work_id', operator: Operator.EQ, value: workId },
          ] as Condition[],
        }),
        Object.assign(new UpdateDBOutput(), {}),
        new DBContext(),
      );
    } catch (err: unknown) {
      this.logger?.error?.('handleExecAgent: failed to update work status', {
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const execInput = Object.assign(new ExecSingleAgentInput(), {
      work_id: workId,
      interact_id: interactId,
      agent_id: agentId,
      task_content: (sharedData.user_query as string) ?? '',
      work_context: workContext,
      trace_id: (sharedData.trace_id as string) ?? '',
    });
    const execOutput = new ExecSingleAgentOutput();
    const execSuccess = await this.orchestrationExecution.execSingleAgent(
      execInput,
      execOutput,
      { session_id: context.session_id, work_id: workId, interact_id: interactId } as OrchestrationExecutionContext,
    );

    const answer = execOutput.answer;
    const results = (sharedData.agent_results as Record<string, unknown>[]) ?? [];
    results.push({
      agent_id: agentId,
      task_content: (sharedData.user_query as string) ?? '',
      answer,
      trace_id: execOutput.trace_id,
    });

    if (!execSuccess) {
      throw new Error(`Work Agent ${agentId} 执行失败：${(execOutput as unknown as { error?: string }).error ?? 'execSingleAgent 返回失败'}`);
    }
    // 短路保护：Work Agent 无有效输出时不进入 WRITE_RESULT / EVAL_RESULT 阶段
    this.ensureWorkAgentOutput(results);

    sharedData[saveResultKey] = answer;
    sharedData.agent_results = results;
  }

  /**
   * 校验 Work Agent 是否产出有效（非空）输出。
   *
   * 空输出时抛错，由 JSONNode 引擎按节点 on_error 路由到 HANDLE_ERROR，
   * 短路 WRITE_RESULT / EVAL_RESULT 阶段，避免基于空结果继续汇总与评估
   * （并误在前端展示 Writer / Evolutor Agent）。
   */
  private ensureWorkAgentOutput(
    results: Array<{ agent_id?: string; answer?: string } | undefined>,
  ): void {
    const hasOutput = results.some((r) => Boolean(r?.answer && String(r.answer).trim()));
    if (!hasOutput) {
      throw new Error('Work Agent 未产生有效输出，短路汇总与评估阶段');
    }
  }

  private async handlePlanWork(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';
    const userQuery = (sharedData.user_query as string) ?? '';
    const savePlanKey = (params.save_plan_key as string) ?? 'plan_result';

    const planInput = Object.assign(new PlanHierarchicalInput(), {
      work_id: workId,
      interact_id: interactId,
      task_content: userQuery,
      trace_id: (sharedData.trace_id as string) ?? '',
    });
    const planOutput = new PlanHierarchicalOutput();
    await this.plannerAgent.planHierarchical(
      planInput,
      planOutput,
      Object.assign(new PlannerAgentContext(), { trace_id: (sharedData.trace_id as string) ?? '' }),
    );

    // ===== 需求澄清：Planner 识别出需用户补充参数才能执行的任务（不进入 DAG）=====
    const clarifications = (planOutput.clarifications ?? []).filter(
      (c) => c && typeof c.question === 'string' && c.question.trim(),
    );
    if (clarifications.length > 0) {
      const sessionId = (sharedData.session_id as string) ?? context.session_id ?? '';
      const metadata = {
        trace_id: (sharedData.trace_id as string) ?? '',
        clarifications,
      };
      // 持久化澄清问题到 orchestration_work.metadata，供前端历史展示与重入编排读取
      const updData: DataObject[] = [
        { field: 'status', value: 'PAUSED_WAITING_INPUT' },
        { field: 'task_count', value: 0 },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'metadata', value: JSON.stringify(metadata) },
      ];
      await this.relationDb.updateDB(
        Object.assign(new UpdateDBInput(), {
          table: 'orchestration_work',
          data: updData,
          conditions: [
            { field: 'work_id', operator: Operator.EQ, value: workId },
          ] as Condition[],
        }),
        Object.assign(new UpdateDBOutput(), {}),
        new DBContext(),
      );

      if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
        await this.streamAccess.pushEvent(sessionId, 'clarification_required', 'CONTROL', {
          work_id: workId,
          interact_id: interactId,
          original_query: userQuery,
          clarifications,
        }, { work_id: workId, interact_id: interactId, node_id: 'PLAN_WORK' });
      }

      // 标记暂停，供 JSONNode 执行循环短路（不再进入 CONDITION / 后续执行节点）
      sharedData._paused = true;
      sharedData._clarifications = clarifications;
      return;
    }

    sharedData[savePlanKey] = {
      plan_id: planOutput.plan_id,
      task_dag: planOutput.task_dag,
    };
    sharedData.task_count = (planOutput.task_dag as unknown as TaskDAG)?.nodes?.length ?? 0;

    const sessionId = (sharedData.session_id as string) ?? context.session_id ?? '';
    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
      await this.streamAccess.pushEvent(sessionId, 'plan_created', 'DAG', {
        plan_id: planOutput.plan_id,
        task_dag: planOutput.task_dag,
      }, { work_id: workId, interact_id: interactId, node_id: 'PLAN_WORK' });
    }

    const updData: DataObject[] = [
      { field: 'status', value: 'PLANNING' },
      { field: 'task_count', value: sharedData.task_count },
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

  private async handleBuildAgentDAG(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const planKey = (params.plan_key as string) ?? 'plan_result';
    const saveKey = (params.save_agent_dag_key as string) ?? 'agent_dag';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';
    const planResult = sharedData[planKey] as { plan_id: string; task_dag: TaskDAG } | undefined;
    if (!planResult) {
      throw new Error('PlanResult not found in shared_data');
    }

    const buildInput = Object.assign(new BuildAgentDAGInput(), {
      plan_id: planResult.plan_id,
      task_dag: planResult.task_dag,
      interact_id: interactId,
      trace_id: (sharedData.trace_id as string) ?? '',
    });
    const buildOutput = new BuildAgentDAGOutput();
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const sessionId = (sharedData.session_id as string) ?? context.session_id ?? '';
    await this.orchestrationExecution.buildAgentDAG(
      buildInput,
      buildOutput,
      { session_id: sessionId, work_id: workId, interact_id: interactId, trace_id: (sharedData.trace_id as string) ?? '' } as OrchestrationExecutionContext,
    );

    sharedData[saveKey] = buildOutput.agent_dag;
    sharedData.task_agent_map = buildOutput.task_agent_map;

    if (this.streamAccess && typeof this.streamAccess.pushEvent === 'function' && sessionId) {
      const agentDagForSSE = {
        ...buildOutput.agent_dag,
        agent_nodes: (buildOutput.agent_dag?.agent_nodes ?? []).map((n) => ({
          ...n,
          task_id: n.task_id,
        })),
      };
      await this.streamAccess.pushEvent(sessionId, 'agent_dag_created', 'DAG', {
        agent_dag: agentDagForSSE,
        task_agent_map: buildOutput.task_agent_map,
      }, { work_id: workId, interact_id: interactId, node_id: 'BUILD_AGENT_DAG' });
    }
  }

  private async handleExecDAG(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const dagKey = (params.agent_dag_key as string) ?? 'agent_dag';
    const maxConcurrent = params.max_concurrent !== undefined ? (params.max_concurrent as number) : undefined;
    const saveResultsKey = (params.save_results_key as string) ?? 'agent_results';
    const agentDag = sharedData[dagKey] as AgentDAG;
    if (!agentDag) {
      throw new Error('AgentDAG not found in shared_data');
    }

    const updExecData: DataObject[] = [
      { field: 'status', value: 'EXECUTING' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    try {
      await this.relationDb.updateDB(
        Object.assign(new UpdateDBInput(), {
          table: 'orchestration_work',
          data: updExecData,
          conditions: [
            { field: 'work_id', operator: Operator.EQ, value: workId },
          ] as Condition[],
        }),
        Object.assign(new UpdateDBOutput(), {}),
        new DBContext(),
      );
    } catch (err: unknown) {
      this.logger?.error?.('handleExecDAG: failed to update work status', {
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const execInput = Object.assign(new ExecDAGInput(), {
      work_id: workId,
      agent_dag: agentDag,
      work_context: sharedData.work_context ? JSON.stringify(sharedData.work_context) : undefined,
      max_concurrent: maxConcurrent,
      trace_id: (sharedData.trace_id as string) ?? '',
    });
    const execOutput = new ExecDAGOutput();
    await this.orchestrationExecution.execDAG(
      execInput,
      execOutput,
      { session_id: context.session_id, work_id: workId, interact_id: context.interact_id } as OrchestrationExecutionContext,
    );

    // 短路保护：DAG 全部 Work Agent 无有效输出时不进入 WRITE_RESULT / EVAL_RESULT 阶段
    this.ensureWorkAgentOutput(execOutput.agent_results);

    sharedData[saveResultsKey] = execOutput.agent_results;
  }

  private async handleWriteResult(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';
    const userQuery = (sharedData.user_query as string) ?? '';
    const resultsKey = (params.agent_results_key as string) ?? 'agent_results';
    const saveKey = (params.save_response_key as string) ?? 'final_response';
    const agentResults = (sharedData[resultsKey] as Record<string, unknown>[]) ?? [];

    const answers = agentResults
      .map((r) => String((r as { answer?: unknown; result?: unknown })?.answer ?? (r as { result?: unknown })?.result ?? '').trim())
      .filter(Boolean);
    if (answers.length === 1) {
      sharedData[saveKey] = answers[0];
      sharedData.final_response_handle_result_type = '';
      const updData: DataObject[] = [
        { field: 'status', value: 'WRITING' },
        { field: 'updated', value: IdGenerator.now() },
      ];
      await this.relationDb.updateDB(
        Object.assign(new UpdateDBInput(), {
          table: 'orchestration_work',
          data: updData,
          conditions: [{ field: 'work_id', operator: Operator.EQ, value: workId }],
        }),
        new UpdateDBOutput(),
        new DBContext(),
      );
      return;
    }

    const writeInput = Object.assign(new WriteInput(), {
      work_id: workId,
      interact_id: interactId,
      user_query: userQuery,
      agent_results: agentResults,
    });
    const writeOutput = new WriteOutput();
    const writeStartedAt = Date.now();
    await this.writerAgent.execWrite(writeInput, writeOutput, new WriterAgentContext());
    const writeElapsed = Date.now() - writeStartedAt;

    sharedData[saveKey] = writeOutput.response;
    // 记录最终回复的处理结果类型，供评估阶段跳过错误回复
    sharedData.final_response_handle_result_type = writeOutput.handle_result_type || '';

    // 与其他 Agent 采集方式保持一致：Writer 执行结果写入 orchestration_agent_execution，
    // 供 buildThinkingBlocksAndDag 在「思考过程 / 执行过程」中统一采集展示。
    await this.recordSystemAgentExecution(
      workId,
      interactId,
      writeOutput.agent_id,
      '汇总执行结果并生成最终回复',
      writeOutput.response,
      writeElapsed,
      writeOutput.trace_id,
    );

    const updData: DataObject[] = [
      { field: 'status', value: 'WRITING' },
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

  // 与其他 Agent 采集方式保持一致：系统 Agent 执行结果统一写入 orchestration_agent_execution 表，
  // 供 buildThinkingBlocksAndDag 在「思考过程 / 执行过程」中采集展示。
  private async recordSystemAgentExecution(
    workId: string,
    interactId: string,
    agentId: string,
    taskContent: string,
    answer: string,
    elapsedMs: number,
    traceId?: string,
  ): Promise<void> {
    if (!agentId) return;
    try {
      await this.orchestrationExecution.recordSystemAgentExecution(
        Object.assign(new RecordSystemAgentExecutionInput(), {
          work_id: workId,
          interact_id: interactId,
          agent_id: agentId,
          task_content: taskContent,
          answer,
          elapsed_ms: elapsedMs,
          trace_id: traceId ?? '',
        }),
        new RecordSystemAgentExecutionOutput(),
        new OrchestrationExecutionContext(),
      );
    } catch {
      /* best-effort */
    }
  }

  // 执行评估序列：evalWriterAgent（评估最终回复）→ 逐 Work Agent evalWorkAgent → 启动后台评估调度。
  // 抽取为共享方法供同步 / setImmediate / MQ worker 三处复用，避免重复代码。
  private async runEval(payload: {
    work_id: string;
    interact_id: string;
    user_query: string;
    final_response: string;
    agent_results: Record<string, unknown>[];
    final_response_handle_result_type?: string;
  }): Promise<void> {
    const { work_id, interact_id, user_query, final_response, agent_results, final_response_handle_result_type } = payload;

    const evalWriterInput = Object.assign(new EvalWriterAgentInput(), {
      agent_id: '',
      work_id,
      interact_id,
      user_query,
      final_response,
      agent_results,
      handle_result_type: final_response_handle_result_type,
    });
    const evalWriterOutput = new EvalWriterAgentOutput();
    const evalWriterStartedAt = Date.now();
    await this.evolutorAgent.evalWriterAgent(evalWriterInput, evalWriterOutput, new EvolutorAgentContext());
    const evalWriterElapsed = Date.now() - evalWriterStartedAt;

    await this.recordSystemAgentExecution(
      work_id,
      interact_id,
      evalWriterOutput.agent_id,
      '评估最终回复质量',
      JSON.stringify({
        scores: evalWriterOutput.scores,
        suggestions: evalWriterOutput.suggestions,
        need_optimize: evalWriterOutput.need_optimize,
      }),
      evalWriterElapsed,
      evalWriterOutput.trace_id,
    );

    for (const ar of agent_results) {
      const evalWorkInput = Object.assign(new EvalWorkAgentInput(), {
        agent_id: (ar.agent_id as string) ?? '',
        work_id,
        interact_id,
        task_content: (ar.task_content as string) ?? '',
        agent_output: (ar.answer ?? ar.result) as string,
        trace_id: (ar.trace_id as string) ?? '',
        handle_result_type: (ar.handle_result_type as string) ?? '',
      });
      await this.evolutorAgent.evalWorkAgent(evalWorkInput, new EvalWorkAgentOutput(), new EvolutorAgentContext());
    }

    const startEvalInput = Object.assign(new StartEvalScheduleInput(), {});
    await this.evolutorAgent.startEvalSchedule(startEvalInput, new StartEvalScheduleOutput(), new EvolutorAgentContext());
  }

  private async handleEvalResult(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';
    const userQuery = (sharedData.user_query as string) ?? '';
    const resultsKey = (params.agent_results_key as string) ?? 'agent_results';
    const responseKey = (params.final_response_key as string) ?? 'final_response';
    const isAsync = (params.async as boolean) ?? true;
    const agentResults = (sharedData[resultsKey] as Record<string, unknown>[]) ?? [];
    const finalResponse = (sharedData[responseKey] as string) ?? '';
    const finalResponseType = (sharedData.final_response_handle_result_type as string) ?? '';

    const evalFn = async () => {
      try {
        await this.runEval({
          work_id: workId,
          interact_id: interactId,
          user_query: userQuery,
          final_response: finalResponse,
          agent_results: agentResults,
          final_response_handle_result_type: finalResponseType,
        });
      } catch (err: unknown) {
        this.logger?.error?.('handleEvalResult: evaluation failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    if (isAsync) {
      if (this.mqAccess) {
        try {
          const evalPayload = {
            work_id: workId,
            interact_id: interactId,
            user_query: userQuery,
            final_response: finalResponse,
            agent_results: agentResults,
            final_response_handle_result_type: finalResponseType,
          };
          const sendInput = Object.assign({}, {
            data: {
              queue: 'orchestration.eval',
              payload: evalPayload,
            },
          });
          await this.mqAccess.sendMQ(sendInput, {}, {});
          await this.ensureEvalWorker();
        } catch (mqErr: unknown) {
          this.logger?.error?.('handleEvalResult: MQ enqueue failed, falling back to setImmediate', {
            error: mqErr instanceof Error ? mqErr.message : String(mqErr),
          });
          setImmediate(() => { evalFn().catch(() => {}); });
        }
      } else {
        setImmediate(() => { evalFn().catch(() => {}); });
      }
    } else {
      await evalFn();
    }
  }

  /** 确保 orchestration.eval 队列存在常驻消费 Worker（幂等，供启动期与按需调用）。 */
  async ensureEvalWorker(): Promise<void> {
    if (!this.mqAccess || !this.mqCore) return;
    const soOutput = Object.assign({}, { workers: [] as unknown[] });
    await this.mqCore.soWorker({ queue: 'orchestration.eval' }, {}, soOutput);
    if ((soOutput.workers as unknown[]).length > 0) return;
    await this.mqCore.startWorker({
      queue: 'orchestration.eval',
      handler: async (msg: Record<string, unknown>) => {
        try {
          const payload = (msg.payload as Record<string, unknown>) ?? {};
          await this.runEval({
            work_id: payload.work_id as string ?? '',
            interact_id: payload.interact_id as string ?? '',
            user_query: payload.user_query as string ?? '',
            final_response: payload.final_response as string ?? '',
            agent_results: (payload.agent_results as Record<string, unknown>[]) ?? [],
            final_response_handle_result_type: payload.final_response_handle_result_type as string ?? '',
          });
          return true;
        } catch (err: unknown) {
          this.logger?.error?.('MQ eval worker: evaluation failed', {
            error: err instanceof Error ? err.message : String(err),
          });
          return false;
        }
      },
    }, {}, {});
  }

  private async handleSaveResponse(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const sessionId = (sharedData.session_id as string) ?? context.session_id ?? '';
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';
    const responseKey = (params.response_key as string) ?? 'final_response';
    const finalResponse = (sharedData[responseKey] as string) ?? '';

    // 一次问答也是一次引用和被引用关系：RESPONSE 引用对应的 REQUEST 消息
    const parentInfoIds: string[] = [];
    if (sharedData.user_input_info_id) {
      parentInfoIds.push(String(sharedData.user_input_info_id));
    }

    const saveInput = Object.assign(new SaveInfoInput(), {
      session_id: sessionId,
      work_id: workId,
      interact_id: interactId,
      info_type: InfoType.RESPONSE,
      info_creator_role: 'AGENT',
      info_creator_id: workId,
      info: finalResponse,
      parent_info_ids: parentInfoIds,
      summary: await this.generateResponseSummary(InfoType.RESPONSE, finalResponse, sessionId, workId, interactId),
      trace_id: (sharedData.trace_id as string) ?? '',
    });
    try {
      await this.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());
    } catch (err: unknown) {
      this.logger?.error?.('handleSaveResponse: saveInfo failed', {
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const newStatus = (params.update_work_status as string) ?? 'COMPLETED';
    const updData: DataObject[] = [
      { field: 'status', value: newStatus },
      { field: 'final_response', value: finalResponse },
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

  private async handleError(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const sessionId = (sharedData.session_id as string) ?? context.session_id ?? '';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const defaultResponse = (params.default_response as string) ?? '抱歉，处理您的问题时出现了错误。';
    const errorMsg = (sharedData._error as string) ?? 'Unknown error';
    const responseText = errorMsg && errorMsg !== 'Unknown error' ? `[错误] ${errorMsg}` : defaultResponse;

    sharedData.final_response = responseText;

    this.logger?.error?.('JSONNode: HANDLE_ERROR triggered', {
      work_id: workId,
      error: errorMsg,
    });

    // 即使报错也将错误回复保存到 info_raw 并关联用户请求，确保在 ChatMap 与对话历史中正常展示
    const parentInfoIds: string[] = [];
    if (sharedData.user_input_info_id) {
      parentInfoIds.push(String(sharedData.user_input_info_id));
    }
    const saveInput = Object.assign(new SaveInfoInput(), {
      session_id: sessionId,
      work_id: workId,
      interact_id: interactId,
      info_type: InfoType.RESPONSE,
      info_creator_role: 'AGENT',
      info_creator_id: workId,
      info: responseText,
      parent_info_ids: parentInfoIds,
      handle_result_type: HandleResultType.INTERNAL_ERROR,
      trace_id: (sharedData.trace_id as string) ?? '',
    });
    try {
      await this.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());
    } catch (err: unknown) {
      this.logger?.error?.('handleError: saveInfo failed', {
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (workId) {
      const newStatus = (params.update_work_status as string) ?? 'FAILED';
      const updData: DataObject[] = [
        { field: 'status', value: newStatus },
        { field: 'error_message', value: errorMsg },
        { field: 'final_response', value: responseText },
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
  }

  private async generateResponseSummary(
    infoType: string,
    info: string,
    sessionId: string,
    workId: string,
    interactId: string,
  ): Promise<string | undefined> {
    if (!this.summaryAgent) return undefined;
    try {
      const out = new GenerateSummaryOutput();
      await this.summaryAgent.generateSummary(
        Object.assign(new GenerateSummaryInput(), { info_type: infoType, info }),
        out,
        Object.assign(new SummaryAgentContext(), { session_id: sessionId, work_id: workId, interact_id: interactId }),
      );
      return out.summary || undefined;
    } catch {
      return undefined;
    }
  }

  private async handleInvoke(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    _context: JSONNodeContext,
  ): Promise<void> {
    const target = (params.target as string) ?? '';
    if (!target) {
      throw new Error('INVOKE: target is required');
    }

    const handler = this.invokeRegistry.get(target);
    if (!handler) {
      throw new Error(`INVOKE: target "${target}" not found in invoke registry`);
    }

    const invokeParams = (params.params as Record<string, unknown>) ?? {};
    await handler(sharedData, invokeParams, _context);

    const saveKey = (params.save_result_key as string) ?? 'invoke_result';
    if (saveKey) {
      sharedData[saveKey] = sharedData._invoke_result;
      delete sharedData._invoke_result;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async saveTrace(
    orchestrationId: string,
    trace: NodeExecutionTrace,
  ): Promise<void> {
    const data: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: IdGenerator.now() },
      { field: 'updated', value: IdGenerator.now() },
      { field: 'orchestration_id', value: orchestrationId },
      { field: 'node_id', value: trace.node_id },
      { field: 'node_type', value: trace.node_type },
      { field: 'status', value: trace.status },
      { field: 'elapsed_ms', value: trace.elapsed_ms },
      { field: 'error_info', value: trace.error ?? '' },
    ];
    const insInput = Object.assign(new InsertDBInput(), {
      table: 'orchestration_jsonnode_trace',
      data,
    });
    await this.relationDb.insertDB(insInput, Object.assign(new InsertDBOutput(), {}), new DBContext());
  }

  private evaluateCondition(
    fieldValue: unknown,
    operator: string,
    value: unknown,
  ): boolean {
    switch (operator) {
      case 'EQ': return String(fieldValue) === String(value);
      case 'NE': return String(fieldValue) !== String(value);
      case 'GT': return Number(fieldValue) > Number(value);
      case 'LT': return Number(fieldValue) < Number(value);
      case 'GE': return Number(fieldValue) >= Number(value);
      case 'LE': return Number(fieldValue) <= Number(value);
      case 'IN': return String(value).includes(String(fieldValue ?? ''));
      default: return false;
    }
  }
}
