import {
  RelationDBAccess, InsertDBInput, SelectDBInput,
  SelectOneDBInput, UpdateDBInput, Operator, DataObject,
  InsertDBOutput, SelectDBOutput, SelectOneDBOutput,
  UpdateDBOutput, DBContext, IdGenerator, ValidationError, type Logger, type Condition,
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
} from '@brian-agent/agent';
import {
  BuildAgentInput, BuildAgentOutput,
  AgentBuilderContext,
  WriteInput, WriteOutput,
  WriterAgentContext,
  PlanInput, PlanOutput,
  PlannerAgentContext,
  EvalWriterAgentInput, EvalWriterAgentOutput,
  EvalWorkAgentInput, EvalWorkAgentOutput,
  StartEvalScheduleInput, StartEvalScheduleOutput,
  EvolutorAgentContext,
  GetUserProfileInput, GetUserProfileOutput,
} from '@brian-agent/agent';
import type { OrchestrationExecutionAccess } from '../../OrchestrationExecution/access/OrchestrationExecutionAccess';
import {
  OrchestrationExecutionContext,
  ExecSingleAgentInput, ExecSingleAgentOutput,
  BuildAgentDAGInput, BuildAgentDAGOutput,
  ExecDAGInput, ExecDAGOutput,
  type AgentDAG, type TaskDAG,
} from '../../OrchestrationExecution/domain/types';
import {
  JSONNodeContext, JSONNodeConfig, NodeHandler,
  JSONNodeDefinition, NodeExecutionTrace,
  ExecJSONNodeInput, ExecJSONNodeOutput,
  GetJSONNodeTraceInput, GetJSONNodeTraceOutput,
  RegisterNodeTypeInput, RegisterNodeTypeOutput,
  ValidateJSONNodeInput, ValidateJSONNodeOutput,
  ConfigJSONNodeInput, ConfigJSONNodeOutput,
  BUILTIN_NODE_TYPES,
} from '../domain/types';
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

  async execJSONNode(
    input: ExecJSONNodeInput,
    context: JSONNodeContext,
    output: ExecJSONNodeOutput,
  ): Promise<boolean> {
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

      try {
        const timeoutMs = this.config.node_timeout_ms;
        if (timeoutMs > 0) {
          await Promise.race([
            handler(sharedData, node.params, context),
            new Promise<void>((_, reject) => {
              setTimeout(() => reject(new Error(`Node execution timeout after ${timeoutMs}ms`)), timeoutMs);
            }),
          ]);
        } else {
          await handler(sharedData, node.params, context);
        }
        traceEntry.status = 'SUCCESS';
        traceEntry.elapsed_ms = Date.now() - startedAt;
        trace.push(traceEntry);

        if (this.config.trace_enabled) {
          await this.saveTrace(input.orchestration_id, traceEntry);
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

        if (this.config.trace_enabled) {
          await this.saveTrace(input.orchestration_id, traceEntry);
        }

        sharedData._error = errorMsg;
        this.logger?.error?.('JSONNode: node execution failed', {
          node_id: node.node_id,
          node_type: node.node_type,
          error: errorMsg,
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

  async getJSONNodeTrace(
    input: GetJSONNodeTraceInput,
    _context: JSONNodeContext,
    output: GetJSONNodeTraceOutput,
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
    await this.relationDb.selectDB(selInput, new DBContext(), selOutput);
    output.trace = (selOutput.rows as unknown as NodeExecutionTrace[]) ?? [];
    return true;
  }

  registerNodeType(
    input: RegisterNodeTypeInput,
    _context: JSONNodeContext,
    output: RegisterNodeTypeOutput,
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

  validate(
    input: ValidateJSONNodeInput,
    _context: JSONNodeContext,
    output: ValidateJSONNodeOutput,
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
    for (const node of def.nodes) {
      if (nodeIds.has(node.node_id)) {
        errors.push(`Duplicate node_id: ${node.node_id}`);
      }
      nodeIds.add(node.node_id);

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

  async configJSONNode(
    input: ConfigJSONNodeInput,
    _context: JSONNodeContext,
    output: ConfigJSONNodeOutput,
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
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    const current = (selOutput.row ?? {}) as Record<string, unknown>;
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
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
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
    const sessionId = (sharedData.session_id as string) ?? context.session_id ?? '';
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';

    const saveInput = Object.assign(new SaveInfoInput(), {
      session_id: sessionId,
      work_id: workId,
      interact_id: interactId,
      info_creator_id: 'USER',
      info_creator_role: params.info_creator_role ?? 'REQUEST',
      info: userQuery,
    });
    await this.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());

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
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
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

    let sessionContext: Record<string, unknown> = {};
    try {
      const ctxInfoInput = Object.assign(new ContextInfoInput(), { session_id: sessionId });
      const ctxInfoOutput = new ContextInfoOutput();
      await this.infoCore.context(ctxInfoInput, new InfoCoreContext(), ctxInfoOutput);
      sessionContext = ctxInfoOutput.list as unknown as Record<string, unknown>;
    } catch { /* degrade gracefully */ }

    let userProfile: Record<string, unknown> = {};
    if (includeProfile) {
      try {
        const profileInput = Object.assign(new GetUserProfileInput(), { session_id: sessionId });
        const profileOutput = new GetUserProfileOutput();
        await this.writerAgent.getUserProfile(profileInput, new WriterAgentContext(), profileOutput);
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
    await this.relationDb.selectDB(recentSelInput, new DBContext(), recentSelOutput);
    const recentWorks = recentSelOutput.rows.map((row) => ({
      user_query: row.user_query,
      response_summary: ((row.final_response as string) ?? '').slice(0, 200),
    }));

    sharedData.work_context = {
      work_id: workId,
      session_id: sessionId,
      user_query: userQuery,
      session_context: sessionContext,
      user_profile: userProfile,
      recent_works: recentWorks,
      created_at: IdGenerator.now(),
      metadata: { orchestration_version: '1.0' },
    };
  }

  private async handleSelectStrategy(
    sharedData: Record<string, unknown>,
    _params: Record<string, unknown>,
    _context: JSONNodeContext,
  ): Promise<void> {
    const userQuery = (sharedData.user_query as string) ?? '';
    const result = await selectOrchestrationStrategy(
      this.relationDb,
      userQuery,
      sharedData.work_context as Record<string, unknown> | undefined,
      this.llmAccess,
      this.promptsAccess,
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
    const interactId = (sharedData.interact_id as string) ?? context.interact_id ?? '';
    const forceNew = (params.force_new as boolean) ?? false;

    const buildInput = Object.assign(new BuildAgentInput(), {
      interact_id: interactId,
      task_content: userQuery,
      force_new: forceNew,
    });
    const buildOutput = new BuildAgentOutput();
    await this.agentBuilder.buildAgent(buildInput, new AgentBuilderContext(), buildOutput);
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
        new DBContext(),
        Object.assign(new UpdateDBOutput(), {}),
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
    });
    const execOutput = new ExecSingleAgentOutput();
    await this.orchestrationExecution.execSingleAgent(
      execInput,
      { session_id: context.session_id, work_id: workId, interact_id: interactId } as OrchestrationExecutionContext,
      execOutput,
    );

    sharedData[saveResultKey] = execOutput.answer;
    const results = (sharedData.agent_results as Record<string, unknown>[]) ?? [];
    results.push({
      agent_id: agentId,
      task_content: (sharedData.user_query as string) ?? '',
      answer: execOutput.answer,
      trace_id: execOutput.trace_id,
    });
    sharedData.agent_results = results;
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

    const planInput = Object.assign(new PlanInput(), {
      work_id: workId,
      interact_id: interactId,
      task_content: userQuery,
    });
    const planOutput = new PlanOutput();
    await this.plannerAgent.plan(planInput, new PlannerAgentContext(), planOutput);

    sharedData[savePlanKey] = {
      plan_id: planOutput.plan_id,
      task_dag: planOutput.task_dag,
    };
    sharedData.task_count = (planOutput.task_dag as unknown as TaskDAG)?.nodes?.length ?? 0;

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
    await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
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
    });
    const buildOutput = new BuildAgentDAGOutput();
    await this.orchestrationExecution.buildAgentDAG(
      buildInput,
      { session_id: context.session_id } as OrchestrationExecutionContext,
      buildOutput,
    );

    sharedData[saveKey] = buildOutput.agent_dag;
    sharedData.task_agent_map = buildOutput.task_agent_map;
  }

  private async handleExecDAG(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const dagKey = (params.agent_dag_key as string) ?? 'agent_dag';
    const maxConcurrent = (params.max_concurrent as number) ?? 1;
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
        new DBContext(),
        Object.assign(new UpdateDBOutput(), {}),
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
    });
    const execOutput = new ExecDAGOutput();
    await this.orchestrationExecution.execDAG(
      execInput,
      { session_id: context.session_id, work_id: workId, interact_id: context.interact_id } as OrchestrationExecutionContext,
      execOutput,
    );

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

    const writeInput = Object.assign(new WriteInput(), {
      work_id: workId,
      interact_id: interactId,
      user_query: userQuery,
      agent_results: agentResults,
    });
    const writeOutput = new WriteOutput();
    await this.writerAgent.write(writeInput, new WriterAgentContext(), writeOutput);

    sharedData[saveKey] = writeOutput.response;

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
    await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
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

    const evalFn = async () => {
      try {
        const evalWriterInput = Object.assign(new EvalWriterAgentInput(), {
          agent_id: '',
          work_id: workId,
          interact_id: interactId,
          user_query: userQuery,
          final_response: finalResponse,
          agent_results: agentResults,
        });
        await this.evolutorAgent.evalWriterAgent(evalWriterInput, new EvolutorAgentContext(), new EvalWriterAgentOutput());

        for (const ar of agentResults) {
          const evalWorkInput = Object.assign(new EvalWorkAgentInput(), {
            agent_id: (ar.agent_id as string) ?? '',
            work_id: workId,
            interact_id: interactId,
            task_content: (ar.task_content as string) ?? '',
            agent_output: (ar.answer ?? ar.result) as string,
            trace_id: (ar.trace_id as string) ?? '',
          });
          await this.evolutorAgent.evalWorkAgent(evalWorkInput, new EvolutorAgentContext(), new EvalWorkAgentOutput());
        }

        const startEvalInput = Object.assign(new StartEvalScheduleInput(), {});
        await this.evolutorAgent.startEvalSchedule(startEvalInput, new EvolutorAgentContext(), new StartEvalScheduleOutput());
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
          };
          const sendInput = Object.assign({}, {
            data: {
              queue: 'orchestration.eval',
              payload: evalPayload,
            },
          });
          await this.mqAccess.sendMQ(sendInput, {}, {});

          if (this.mqCore) {
            const getWorkerInput = Object.assign({}, { identifier: 'orchestration.eval' });
            const getWorkerOutput = Object.assign({}, { worker: null });
            await this.mqCore.getWorker(getWorkerInput, {}, getWorkerOutput);
            if (!getWorkerOutput.worker) {
              const startWorkerInput = Object.assign({}, {
                queue: 'orchestration.eval',
                handler: async (msg: Record<string, unknown>) => {
                  try {
                    const payload = (msg.payload as Record<string, unknown>) ?? {};
                    const pw = payload.work_id as string ?? '';
                    const pi = payload.interact_id as string ?? '';
                    const pq = payload.user_query as string ?? '';
                    const pr = payload.final_response as string ?? '';
                    const pa = (payload.agent_results as Record<string, unknown>[]) ?? [];

                    const evalWriterInput = Object.assign(new EvalWriterAgentInput(), {
                      agent_id: '',
                      work_id: pw,
                      interact_id: pi,
                      user_query: pq,
                      final_response: pr,
                      agent_results: pa,
                    });
                    await this.evolutorAgent.evalWriterAgent(evalWriterInput, new EvolutorAgentContext(), new EvalWriterAgentOutput());

                    for (const ar of pa) {
                      const evalWorkInput = Object.assign(new EvalWorkAgentInput(), {
                        agent_id: (ar.agent_id as string) ?? '',
                        work_id: pw,
                        interact_id: pi,
                        task_content: (ar.task_content as string) ?? '',
                        agent_output: (ar.answer ?? ar.result) as string,
                        trace_id: (ar.trace_id as string) ?? '',
                      });
                      await this.evolutorAgent.evalWorkAgent(evalWorkInput, new EvolutorAgentContext(), new EvalWorkAgentOutput());
                    }

                    const startEvalInput = Object.assign(new StartEvalScheduleInput(), {});
                    await this.evolutorAgent.startEvalSchedule(startEvalInput, new EvolutorAgentContext(), new StartEvalScheduleOutput());
                    return true;
                  } catch (err: unknown) {
                    this.logger?.error?.('MQ eval worker: evaluation failed', {
                      error: err instanceof Error ? err.message : String(err),
                    });
                    return false;
                  }
                },
              });
              await this.mqCore.startWorker(startWorkerInput, {}, {});
            }
          }
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

    const saveInput = Object.assign(new SaveInfoInput(), {
      session_id: sessionId,
      work_id: workId,
      interact_id: interactId,
      info_creator_id: workId,
      info_creator_role: 'RESPONSE',
      info: finalResponse,
    });
    await this.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());

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
    await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
  }

  private async handleError(
    sharedData: Record<string, unknown>,
    params: Record<string, unknown>,
    context: JSONNodeContext,
  ): Promise<void> {
    const workId = (sharedData.work_id as string) ?? context.work_id ?? '';
    const defaultResponse = (params.default_response as string) ?? '抱歉，处理您的问题时出现了错误。';
    const errorMsg = (sharedData._error as string) ?? 'Unknown error';

    sharedData.final_response = defaultResponse;

    this.logger?.error?.('JSONNode: HANDLE_ERROR triggered', {
      work_id: workId,
      error: errorMsg,
    });

    if (workId) {
      const newStatus = (params.update_work_status as string) ?? 'FAILED';
      const updData: DataObject[] = [
        { field: 'status', value: newStatus },
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
    await this.relationDb.insertDB(insInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));
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
