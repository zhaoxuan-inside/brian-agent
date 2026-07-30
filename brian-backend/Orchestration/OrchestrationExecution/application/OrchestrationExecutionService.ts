import {
  RelationDBAccess, InsertDBInput, InsertDBOutput,
  SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  DataObject, DBContext,
  IdGenerator, ValidationError, Operator,
  OperationType,
  type Logger, type Condition, type Operation,
} from '@brian-agent/base';
import type { AgentBuilderAccess, AgentExecutionAccess, AgentLibraryAccess } from '@brian-agent/agent';
import {
  BuildAgentInput, BuildAgentOutput,
  AgentBuilderContext,
  ExecAgentInput, ExecAgentOutput,
  AgentExecutionContext,
  RecordAgentUsageInput, RecordAgentUsageOutput,
  AgentLibraryContext,
} from '@brian-agent/agent';
import type { InfoCoreAccess } from '@brian-agent/core';
import { SaveInfoInput, SaveInfoOutput, InfoCoreContext } from '@brian-agent/core';
import {
  OrchestrationExecutionContext,
  OrchestrationExecutionConfig,
  BuildAgentDAGInput,
  BuildAgentDAGOutput,
  ExecSingleAgentInput,
  ExecSingleAgentOutput,
  ExecDAGInput,
  ExecDAGOutput,
  ExecDAGAsyncInput,
  ExecDAGAsyncOutput,
  GetDAGProgressInput,
  GetDAGProgressOutput,
  CancelExecutionInput,
  CancelExecutionOutput,
  GetOrchestrationExecQueueStatusInput,
  GetOrchestrationExecQueueStatusOutput,
  ConfigOrchestrationExecutionInput,
  ConfigOrchestrationExecutionOutput,
  AgentDAG,
  AgentNode,
  AgentEdge,
  AgentResult,
  AgentNodeDetail,
  TaskNode,
  ORCHESTRATION_TASK_AGENT_TABLE,
  ORCHESTRATION_AGENT_DAG_TABLE,
  ORCHESTRATION_AGENT_DAG_RECORD_TABLE,
  ORCHESTRATION_AGENT_EXECUTION_TABLE,
  ORCHESTRATION_CONFIG_TABLE,
} from '../domain/types';

export class OrchestrationExecutionService {
  private config = new OrchestrationExecutionConfig();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentExecution: AgentExecutionAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly mqAccess?: any,
    private readonly mqCore?: any,
    private readonly logger?: Logger,
  ) {}

  getConfig(): OrchestrationExecutionConfig {
    return this.config;
  }

  // -------------------------------------------------------------------------
  // buildAgentDAG
  // -------------------------------------------------------------------------

  async buildAgentDAG(
    input: BuildAgentDAGInput,
    context: OrchestrationExecutionContext,
    output: BuildAgentDAGOutput,
  ): Promise<boolean> {
    const { plan_id, task_dag, interact_id, force_new } = input;

    if (!task_dag.nodes || task_dag.nodes.length === 0) {
      output.agent_dag = { plan_id, total_agent_count: 0, agent_nodes: [], agent_edges: [] };
      return true;
    }

    const taskIdSet = new Set(task_dag.nodes.map((n) => n.task_id));
    const edges = task_dag.edges ?? [];
    for (const edge of edges) {
      if (!taskIdSet.has(edge.from_task_id)) {
        throw new ValidationError(`Edge from_task_id "${edge.from_task_id}" not found in nodes`);
      }
      if (!taskIdSet.has(edge.to_task_id)) {
        throw new ValidationError(`Edge to_task_id "${edge.to_task_id}" not found in nodes`);
      }
    }

    const agentNodes: AgentNode[] = [];
    const taskAgentMap: Record<string, string> = {};

    for (const taskNode of task_dag.nodes) {
      const taskAgentRecordId = IdGenerator.generate();
      const now = IdGenerator.now();

      const insInput = Object.assign(new InsertDBInput(), {
        table: ORCHESTRATION_TASK_AGENT_TABLE,
        data: [
          { field: 'id', value: taskAgentRecordId },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'plan_id', value: plan_id },
          { field: 'task_id', value: taskNode.task_id },
          { field: 'agent_id', value: '' },
          { field: 'task_complexity', value: taskNode.task_complexity ?? null },
          { field: 'task_domain', value: taskNode.task_domain ?? null },
        ] as DataObject[],
      });
      await this.relationDb.insertDB(insInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

      let agentId = '';
      let status = 'PENDING';

      try {
        const buildInput = Object.assign(new BuildAgentInput(), {
          interact_id,
          task_content: taskNode.task_content,
          task_complexity: taskNode.task_complexity,
          task_domain: taskNode.task_domain,
          force_new,
        });
        const buildOutput = new BuildAgentOutput();
        const buildSuccess = await this.agentBuilder.buildAgent(buildInput, new AgentBuilderContext(), buildOutput);
        if (!buildSuccess) {
          status = 'BUILD_FAILED';
        } else {
          agentId = buildOutput.agent_id;
          if (!agentId) status = 'BUILD_FAILED';
        }
      } catch (err: unknown) {
        status = 'BUILD_FAILED';
        this.logger?.error?.('buildAgentDAG: agent build failed', {
          task_id: taskNode.task_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (agentId) {
        const updInput = Object.assign(new UpdateDBInput(), {
          table: ORCHESTRATION_TASK_AGENT_TABLE,
          data: [
            { field: 'agent_id', value: agentId },
            { field: 'updated', value: IdGenerator.now() },
          ] as DataObject[],
          conditions: [
            { field: 'id', operator: Operator.EQ, value: taskAgentRecordId },
          ] as Condition[],
        });
        await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      }

      agentNodes.push({
        agent_id: agentId,
        task_id: taskNode.task_id,
        task_content: taskNode.task_content,
        task_complexity: taskNode.task_complexity,
        task_domain: taskNode.task_domain,
        task_priority: taskNode.priority,
        status,
      });

      if (agentId) {
        taskAgentMap[taskNode.task_id] = agentId;
      }
    }

    const agentEdges: AgentEdge[] = [];
    for (const edge of edges) {
      const fromAgentId = taskAgentMap[edge.from_task_id];
      const toAgentId = taskAgentMap[edge.to_task_id];
      if (fromAgentId && toAgentId) {
        const edgeId = IdGenerator.generate();
        const edgeNow = IdGenerator.now();

        const insInput = Object.assign(new InsertDBInput(), {
          table: ORCHESTRATION_AGENT_DAG_TABLE,
          data: [
            { field: 'id', value: edgeId },
            { field: 'created', value: edgeNow },
            { field: 'updated', value: edgeNow },
            { field: 'plan_id', value: plan_id },
            { field: 'from_agent_id', value: fromAgentId },
            { field: 'to_agent_id', value: toAgentId },
          ] as DataObject[],
        });
        await this.relationDb.insertDB(insInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

        agentEdges.push({
          from_agent_id: fromAgentId,
          to_agent_id: toAgentId,
          data_dependency: `task_${edge.from_task_id} → task_${edge.to_task_id}`,
        });
      }
    }

    const agentDag: AgentDAG = {
      plan_id,
      total_agent_count: agentNodes.length,
      agent_nodes: agentNodes,
      agent_edges: agentEdges,
    };

    const dagRecordId = IdGenerator.generate();
    const dagNow = IdGenerator.now();
    const insDagInput = Object.assign(new InsertDBInput(), {
      table: ORCHESTRATION_AGENT_DAG_RECORD_TABLE,
      data: [
        { field: 'id', value: dagRecordId },
        { field: 'created', value: dagNow },
        { field: 'updated', value: dagNow },
        { field: 'plan_id', value: plan_id },
        { field: 'total_agent_count', value: agentNodes.length },
        { field: 'agent_dag_json', value: JSON.stringify(agentDag) },
      ] as DataObject[],
    });
    await this.relationDb.insertDB(insDagInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

    output.agent_dag = agentDag;
    output.task_agent_map = taskAgentMap;
    return true;
  }

  // -------------------------------------------------------------------------
  // execSingleAgent
  // -------------------------------------------------------------------------

  async execSingleAgent(
    input: ExecSingleAgentInput,
    context: OrchestrationExecutionContext,
    output: ExecSingleAgentOutput,
  ): Promise<boolean> {
    const { work_id, interact_id, agent_id, task_content, plan_id, task_id, work_context } = input;

    if (!task_content) {
      return false;
    }

    const execRecordId = IdGenerator.generate();
    const now = IdGenerator.now();

    const enhancedContent = work_context
      ? `${work_context}\n---\n${task_content}`
      : task_content;

    const insInput = Object.assign(new InsertDBInput(), {
      table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
      data: [
        { field: 'id', value: execRecordId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'work_id', value: work_id },
        { field: 'agent_id', value: agent_id },
        { field: 'plan_id', value: plan_id ?? '' },
        { field: 'task_id', value: task_id ?? '' },
        { field: 'execution_type', value: 'SINGLE' },
        { field: 'task_content', value: enhancedContent },
        { field: 'status', value: 'RUNNING' },
        { field: 'answer', value: '' },
        { field: 'trace_id', value: '' },
        { field: 'iterations', value: 0 },
        { field: 'elapsed_ms', value: 0 },
        { field: 'error_info', value: '' },
      ] as DataObject[],
    });
    await this.relationDb.insertDB(insInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

    const startedAt = Date.now();

    try {
      const execInput = Object.assign(new ExecAgentInput(), {
        agent_id,
        work_id,
        interact_id,
        task_content: enhancedContent,
      });
      const execOutput = new ExecAgentOutput();
      const execSuccess = await this.agentExecution.execAgent(execInput, new AgentExecutionContext(), execOutput);
      if (!execSuccess) {
        const elapsed = Date.now() - startedAt;
        const errorMsg = (execOutput as unknown as Record<string, unknown>).error as string ?? 'execAgent returned false';
        const updFailInput = Object.assign(new UpdateDBInput(), {
          table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
          data: [
            { field: 'status', value: 'FAILED' },
            { field: 'elapsed_ms', value: elapsed },
            { field: 'error_info', value: errorMsg },
            { field: 'updated', value: IdGenerator.now() },
          ] as DataObject[],
          conditions: [
            { field: 'id', operator: Operator.EQ, value: execRecordId },
          ] as Condition[],
        });
        await this.relationDb.updateDB(updFailInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
        output.error = errorMsg;
        return false;
      }

      const elapsed = Date.now() - startedAt;

      const updInput = Object.assign(new UpdateDBInput(), {
        table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
        data: [
          { field: 'status', value: 'COMPLETED' },
          { field: 'answer', value: execOutput.answer },
          { field: 'trace_id', value: execOutput.trace_id },
          { field: 'iterations', value: execOutput.iterations },
          { field: 'elapsed_ms', value: elapsed },
          { field: 'updated', value: IdGenerator.now() },
        ] as DataObject[],
        conditions: [
          { field: 'id', operator: Operator.EQ, value: execRecordId },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

      const usageInput = Object.assign(new RecordAgentUsageInput(), {
        agent_id,
        work_id,
        interact_id,
        usage_context: task_content.slice(0, 256),
      });
      await this.agentLibrary.recordAgentUsage(usageInput, new AgentLibraryContext(), new RecordAgentUsageOutput());

      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: context.session_id ?? '',
        work_id,
        interact_id,
        info_creator_id: agent_id,
        info_creator_role: 'AGENT',
        info: `${task_content} → ${execOutput.answer}`,
      });
      await this.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());

      output.answer = execOutput.answer;
      output.trace_id = execOutput.trace_id;
      output.iterations = execOutput.iterations;
      output.elapsed_ms = elapsed;
      return true;
    } catch (err: unknown) {
      const elapsed = Date.now() - startedAt;
      const errorMsg = err instanceof Error ? err.message : String(err);

      const updInput = Object.assign(new UpdateDBInput(), {
        table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
        data: [
          { field: 'status', value: 'FAILED' },
          { field: 'elapsed_ms', value: elapsed },
          { field: 'error_info', value: errorMsg },
          { field: 'updated', value: IdGenerator.now() },
        ] as DataObject[],
        conditions: [
          { field: 'id', operator: Operator.EQ, value: execRecordId },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

      this.logger?.error?.('execSingleAgent: execution failed', {
        agent_id,
        work_id,
        error: errorMsg,
      });

      return false;
    }
  }

  // -------------------------------------------------------------------------
  // execDAG
  // -------------------------------------------------------------------------

  async execDAG(
    input: ExecDAGInput,
    context: OrchestrationExecutionContext,
    output: ExecDAGOutput,
  ): Promise<boolean> {
    const { work_id, agent_dag, work_context, max_concurrent, dag_timeout_ms } = input;
    const concurrency = max_concurrent ?? this.config.max_concurrent;
    const timeoutMs = dag_timeout_ms ?? this.config.dag_timeout_ms;

    const nodes = agent_dag.agent_nodes;
    const edges = agent_dag.agent_edges;

    const adjList = new Map<string, string[]>();
    const indegree = new Map<string, number>();

    for (const node of nodes) {
      adjList.set(node.agent_id, []);
      indegree.set(node.agent_id, 0);
    }

    for (const edge of edges) {
      const neighbors = adjList.get(edge.from_agent_id);
      if (neighbors) {
        neighbors.push(edge.to_agent_id);
      }
      indegree.set(edge.to_agent_id, (indegree.get(edge.to_agent_id) ?? 0) + 1);
    }

    const incomingMap = new Map<string, string[]>();
    for (const node of nodes) {
      incomingMap.set(node.agent_id, []);
    }
    for (const edge of edges) {
      const parents = incomingMap.get(edge.to_agent_id);
      if (parents) {
        parents.push(edge.from_agent_id);
      }
    }

    const readyQueue: AgentNode[] = nodes.filter((n) => indegree.get(n.agent_id) === 0);

    const agentOutputs: Record<string, string> = {};
    const results: AgentResult[] = [];
    const nodeMap = new Map(nodes.map((n) => [n.agent_id, n]));

    const dagStartedAt = Date.now();
    let failedCount = 0;

    const execOne = async (agentNode: AgentNode): Promise<AgentResult> => {
      let enhancedContent = agentNode.task_content;

      if (concurrency === 1) {
        const upstreamAgentIds = incomingMap.get(agentNode.agent_id) ?? [];
        const upstreamOutputs: string[] = [];
        for (const upId of upstreamAgentIds) {
          const upOutput = agentOutputs[upId];
          if (upOutput) {
            const summary = upOutput.slice(0, 500);
            upstreamOutputs.push(summary);
          }
        }
        if (upstreamOutputs.length > 0) {
          const upstreamSummary = upstreamOutputs.join('\n');
          enhancedContent = `上游Agent完成的工作摘要：\n${upstreamSummary}\n---\n当前任务：${agentNode.task_content}`;
        }
      }

      const singleInput = Object.assign(new ExecSingleAgentInput(), {
        work_id,
        interact_id: context.interact_id ?? '',
        agent_id: agentNode.agent_id,
        task_content: enhancedContent,
        plan_id: agent_dag.plan_id,
        task_id: agentNode.task_id,
        work_context: work_context,
      });
      const singleOutput = new ExecSingleAgentOutput();
      const ok = await this.execSingleAgent(singleInput, context, singleOutput);

      if (!ok) {
        failedCount++;

        const updExecInput = Object.assign(new UpdateDBInput(), {
          table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
          data: [
            { field: 'status', value: 'EXEC_FAILED' },
            { field: 'updated', value: IdGenerator.now() },
          ] as DataObject[],
          conditions: [
            { field: 'work_id', operator: Operator.EQ, value: work_id },
            { field: 'agent_id', operator: Operator.EQ, value: agentNode.agent_id },
            { field: 'status', operator: Operator.EQ, value: 'RUNNING' },
          ] as Condition[],
        });
        await this.relationDb.updateDB(updExecInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

        throw {
          failed: true,
          agent_id: agentNode.agent_id,
          task_id: agentNode.task_id,
          reason: 'Agent execution failed',
          failed_count: failedCount,
          completed_results: results.slice(),
        };
      }

      agentOutputs[agentNode.agent_id] = singleOutput.answer;

      return {
        agent_id: agentNode.agent_id,
        task_id: agentNode.task_id,
        answer: singleOutput.answer,
        trace_id: singleOutput.trace_id,
        iterations: singleOutput.iterations,
        elapsed_ms: singleOutput.elapsed_ms,
        status: 'COMPLETED',
      };
    };

    while (readyQueue.length > 0) {
      const elapsed = Date.now() - dagStartedAt;
      if (timeoutMs > 0 && elapsed >= timeoutMs) {
        // ===== 原子化 DAG CANCELLED：使用事务一次性批量更新 readyQueue + pending 节点 =====
        // 1) 构造事务 Operation 列表
        const cancelOps: Operation[] = [];
        const now = IdGenerator.now();
        const readyAgentIds: string[] = [];
        for (const node of readyQueue) {
          readyAgentIds.push(node.agent_id);
          cancelOps.push({
            type: OperationType.UPDATE,
            table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
            data: [
              { field: 'status', value: 'CANCELLED' },
              { field: 'error_info', value: 'DAG timeout exceeded' },
              { field: 'updated', value: now },
            ] as DataObject[],
            conditions: [
              { field: 'work_id', operator: Operator.EQ, value: work_id },
              { field: 'agent_id', operator: Operator.EQ, value: node.agent_id },
            ] as Condition[],
          });
        }
        const pendingAgents: typeof nodes = [];
        for (const node of nodes) {
          const isPending = indegree.get(node.agent_id)! > 0 && !agentOutputs[node.agent_id];
          if (isPending) {
            pendingAgents.push(node);
            cancelOps.push({
              type: OperationType.UPDATE,
              table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
              data: [
                { field: 'status', value: 'CANCELLED' },
                { field: 'error_info', value: 'DAG timeout exceeded' },
                { field: 'updated', value: now },
              ] as DataObject[],
              conditions: [
                { field: 'work_id', operator: Operator.EQ, value: work_id },
                { field: 'agent_id', operator: Operator.EQ, value: node.agent_id },
              ] as Condition[],
            });
          }
        }

        // 2) 优先事务执行；事务失败 fallback 回原有逐行更新路径，保证不丢失状态
        let transactionOk = false;
        try {
          if (cancelOps.length > 0) {
            transactionOk = this.relationDb.transactionRaw(cancelOps);
          } else {
            transactionOk = true;
          }
        } catch {
          transactionOk = false;
        }
        if (!transactionOk) {
          for (const node of readyQueue) {
            const updExecInput = Object.assign(new UpdateDBInput(), {
              table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
              data: [
                { field: 'status', value: 'CANCELLED' },
                { field: 'error_info', value: 'DAG timeout exceeded' },
                { field: 'updated', value: IdGenerator.now() },
              ] as DataObject[],
              conditions: [
                { field: 'work_id', operator: Operator.EQ, value: work_id },
                { field: 'agent_id', operator: Operator.EQ, value: node.agent_id },
              ] as Condition[],
            });
            await this.relationDb.updateDB(updExecInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
          }
          for (const node of pendingAgents) {
            const updExecInput = Object.assign(new UpdateDBInput(), {
              table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
              data: [
                { field: 'status', value: 'CANCELLED' },
                { field: 'error_info', value: 'DAG timeout exceeded' },
                { field: 'updated', value: IdGenerator.now() },
              ] as DataObject[],
              conditions: [
                { field: 'work_id', operator: Operator.EQ, value: work_id },
                { field: 'agent_id', operator: Operator.EQ, value: node.agent_id },
              ] as Condition[],
            });
            await this.relationDb.updateDB(updExecInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
            failedCount++;
          }
          break;
        }

        failedCount += pendingAgents.length;
        break;
      }

      const batch = readyQueue.splice(0, Math.max(1, concurrency));

      if (batch.length === 1) {
        try {
          const result = await execOne(batch[0]);
          results.push(result);
          const downstreamIds = adjList.get(batch[0].agent_id) ?? [];
          for (const downId of downstreamIds) {
            const deg = (indegree.get(downId) ?? 1) - 1;
            indegree.set(downId, deg);
            if (deg === 0) {
              const downNode = nodeMap.get(downId);
              if (downNode) {
                readyQueue.push(downNode);
              }
            }
          }
        } catch (err: unknown) {
          throw err;
        }
      } else {
        const settled = await Promise.allSettled(batch.map((n) => execOne(n)));
        let batchFailure: unknown = null;

        for (let i = 0; i < settled.length; i++) {
          const s = settled[i];
          if (s.status === 'fulfilled') {
            results.push(s.value);
            const downstreamIds = adjList.get(batch[i].agent_id) ?? [];
            for (const downId of downstreamIds) {
              const deg = (indegree.get(downId) ?? 1) - 1;
              indegree.set(downId, deg);
              if (deg === 0) {
                const downNode = nodeMap.get(downId);
                if (downNode) {
                  readyQueue.push(downNode);
                }
              }
            }
          } else {
            batchFailure = s.reason;
          }
        }

        if (batchFailure) {
          const err = batchFailure as Record<string, unknown>;
          throw {
            failed: true,
            agent_id: (err.agent_id as string) ?? '',
            task_id: (err.task_id as string) ?? '',
            reason: (err.reason as string) ?? 'Agent execution failed',
            failed_count: failedCount,
            completed_results: results.slice(),
          };
        }

        continue;
      }
    }

    output.agent_results = results;
    output.total_elapsed_ms = Date.now() - dagStartedAt;
    output.failed_count = failedCount;
    return true;
  }

  // -------------------------------------------------------------------------
  // execDAGAsync
  // -------------------------------------------------------------------------

  async execDAGAsync(
    input: ExecDAGAsyncInput,
    context: OrchestrationExecutionContext,
    output: ExecDAGAsyncOutput,
  ): Promise<boolean> {
    const jobId = IdGenerator.generate();
    output.job_id = jobId;

    if (this.mqAccess) {
      try {
        const sendInput = Object.assign({}, {
          data: {
            queue: 'orchestration.dag_execution',
            payload: {
              job_id: jobId,
              work_id: input.work_id,
              agent_dag: input.agent_dag,
              work_context: input.work_context,
              max_concurrent: input.max_concurrent,
              callback_queue: input.callback_queue,
            },
          },
        });
        await this.mqAccess.sendMQ(sendInput, {}, {});

        if (this.mqCore) {
          const getWorkerInput = Object.assign({}, { identifier: 'orchestration.dag_execution' });
          const getWorkerOutput = Object.assign({}, { worker: null });
          await this.mqCore.getWorker(getWorkerInput, {}, getWorkerOutput);
          if (!getWorkerOutput.worker) {
            const startWorkerInput = Object.assign({}, {
              queue: 'orchestration.dag_execution',
              handler: async (msg: Record<string, unknown>) => {
                try {
                  const payload = msg.payload as Record<string, unknown>;
                  const dagInput = Object.assign(new ExecDAGInput(), {
                    work_id: payload.work_id as string,
                    agent_dag: payload.agent_dag,
                    work_context: payload.work_context as string | undefined,
                    max_concurrent: payload.max_concurrent as number | undefined,
                  });
                  const dagOutput = new ExecDAGOutput();
                  await this.execDAG(dagInput, context, dagOutput);

                  if (payload.callback_queue && this.mqAccess) {
                    const cbInput = Object.assign({}, {
                      data: { queue: payload.callback_queue as string, payload: dagOutput },
                    });
                    await this.mqAccess.sendMQ(cbInput, {}, {});
                  }
                  return true;
                } catch (err: unknown) {
                  this.logger?.error?.('execDAGAsync: worker handler failed', {
                    job_id: jobId,
                    error: err instanceof Error ? err.message : String(err),
                  });
                  return false;
                }
              },
            });
            await this.mqCore.startWorker(startWorkerInput, {}, {});
          }
        }
      } catch (err: unknown) {
        this.logger?.error?.('execDAGAsync: MQ enqueue failed, falling back to setImmediate', {
          error: err instanceof Error ? err.message : String(err),
        });
        setImmediate(async () => {
          try {
            const dagInput = Object.assign(new ExecDAGInput(), {
              work_id: input.work_id,
              agent_dag: input.agent_dag,
              work_context: input.work_context,
              max_concurrent: input.max_concurrent,
            });
            const dagOutput = new ExecDAGOutput();
            await this.execDAG(dagInput, context, dagOutput);
            this.logger?.debug?.('execDAGAsync: DAG execution completed', {
              job_id: jobId, work_id: input.work_id, failed_count: dagOutput.failed_count,
            });
          } catch (err2: unknown) {
            this.logger?.error?.('execDAGAsync: DAG execution failed', {
              job_id: jobId, work_id: input.work_id,
              error: err2 instanceof Error ? err2.message : String(err2),
            });
          }
        });
      }
    } else {
      setImmediate(async () => {
        try {
          const dagInput = Object.assign(new ExecDAGInput(), {
            work_id: input.work_id,
            agent_dag: input.agent_dag,
            work_context: input.work_context,
            max_concurrent: input.max_concurrent,
          });
          const dagOutput = new ExecDAGOutput();
          await this.execDAG(dagInput, context, dagOutput);
          this.logger?.debug?.('execDAGAsync: DAG execution completed', {
            job_id: jobId, work_id: input.work_id, failed_count: dagOutput.failed_count,
          });
        } catch (err: unknown) {
          this.logger?.error?.('execDAGAsync: DAG execution failed', {
            job_id: jobId, work_id: input.work_id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // getDAGProgress
  // -------------------------------------------------------------------------

  async getDAGProgress(
    input: GetDAGProgressInput,
    _context: OrchestrationExecutionContext,
    output: GetDAGProgressOutput,
  ): Promise<boolean> {
    const selExecInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      },
    });
    const selExecOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selExecInput, new DBContext(), selExecOutput);

    const records = selExecOutput.rows;
    const totalTasks = records.length;

    let completedTasks = 0;
    let runningTasks = 0;
    let failedTasks = 0;
    let pendingTasks = 0;

    const nodeDetails: AgentNodeDetail[] = [];

    for (const rec of records) {
      const status = (rec.status as string) ?? 'PENDING';
      switch (status) {
        case 'COMPLETED':
          completedTasks++;
          break;
        case 'RUNNING':
          runningTasks++;
          break;
        case 'FAILED':
        case 'EXEC_FAILED':
        case 'BUILD_FAILED':
          failedTasks++;
          break;
        case 'CANCELLED':
          break;
        default:
          pendingTasks++;
          break;
      }

      nodeDetails.push({
        agent_id: (rec.agent_id as string) ?? '',
        task_content: ((rec.task_content as string) ?? '').slice(0, 100),
        status,
        answer: status === 'COMPLETED' ? ((rec.answer as string) ?? '') : '',
        trace_id: (rec.trace_id as string) ?? '',
        elapsed_ms: (rec.elapsed_ms as number) ?? 0,
      });
    }

    const totalElapsed = records.reduce((sum, r) => sum + ((r.elapsed_ms as number) ?? 0), 0);

    output.progress = {
      work_id: input.work_id,
      plan_id: input.plan_id ?? '',
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      running_tasks: runningTasks,
      failed_tasks: failedTasks,
      pending_tasks: pendingTasks,
      node_details: nodeDetails,
      total_elapsed_ms: totalElapsed,
    };

    return true;
  }

  // -------------------------------------------------------------------------
  // cancelExecution
  // -------------------------------------------------------------------------

  async cancelExecution(
    input: CancelExecutionInput,
    _context: OrchestrationExecutionContext,
    output: CancelExecutionOutput,
  ): Promise<boolean> {
    if (this.mqCore) {
      try {
        const stopInput = Object.assign({}, { identifier: input.work_id });
        await this.mqCore.stopWorker(stopInput, {}, {});
      } catch (err: unknown) {
        this.logger?.error?.('cancelExecution: stopWorker failed', {
          work_id: input.work_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, new DBContext(), selOutput);

    const records = selOutput.rows;
    let cancelledCount = 0;

    for (const rec of records) {
      const status = rec.status as string;
      if (status === 'PENDING' || status === 'RUNNING') {
        const updInput = Object.assign(new UpdateDBInput(), {
          table: ORCHESTRATION_AGENT_EXECUTION_TABLE,
          data: [
            { field: 'status', value: 'CANCELLED' },
            { field: 'updated', value: IdGenerator.now() },
          ] as DataObject[],
          conditions: [
            { field: 'id', operator: Operator.EQ, value: rec.id },
          ] as Condition[],
        });
        await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
        cancelledCount++;
      }
    }

    output.cancelled_count = cancelledCount;
    return true;
  }

  // -------------------------------------------------------------------------
  // getExecQueueStatus
  // -------------------------------------------------------------------------

  async getExecQueueStatus(
    _input: GetOrchestrationExecQueueStatusInput,
    _context: OrchestrationExecutionContext,
    output: GetOrchestrationExecQueueStatusOutput,
  ): Promise<boolean> {
    try {
      const execSelInput = Object.assign(new SelectDBInput(), {
        query_param: { table: ORCHESTRATION_AGENT_EXECUTION_TABLE },
      });
      const execSelOutput = Object.assign(new SelectDBOutput(), {});
      await this.relationDb.selectDB(execSelInput, new DBContext(), execSelOutput);

      let pending = 0;
      let processing = 0;
      let completed = 0;
      let failed = 0;

      for (const row of execSelOutput.rows) {
        const status = (row.status as string) ?? '';
        switch (status) {
          case 'PENDING': pending++; break;
          case 'RUNNING': processing++; break;
          case 'COMPLETED': completed++; break;
          case 'FAILED': case 'EXEC_FAILED': case 'BUILD_FAILED': failed++; break;
        }
      }

      output.queue_stats = { pending, processing, completed, failed };
    } catch {
      output.queue_stats = { pending: 0, processing: 0, completed: 0, failed: 0 };
    }

    try {
      const stratSelInput = Object.assign(new SelectDBInput(), {
        query_param: {
          table: 'orchestration_strategy_execution',
          conditions: [
            { field: 'execution_status', operator: Operator.EQ, value: 'RUNNING' },
          ] as Condition[],
        },
      });
      const stratSelOutput = Object.assign(new SelectDBOutput(), {});
      await this.relationDb.selectDB(stratSelInput, new DBContext(), stratSelOutput);
      output.workers = stratSelOutput.rows.map((row) => ({
        work_id: (row.work_id as string) ?? '',
        execution_id: (row.execution_id as string) ?? '',
        strategy_id: (row.strategy_id as string) ?? '',
        plan_id: (row.plan_id as string) ?? '',
        retry_count: (row.plan_retry_count as number) ?? 0,
      }));
    } catch {
      output.workers = [];
    }

    output.mq_queue_status = null;
    if (this.mqCore) {
      try {
        const getWorkerInput = Object.assign({}, { identifier: 'orchestration.dag_execution' });
        const getWorkerOutput = Object.assign({}, { worker: null });
        await this.mqCore.getWorker(getWorkerInput, {}, getWorkerOutput);
        output.mq_queue_status = {
          queue: 'orchestration.dag_execution',
          worker_active: getWorkerOutput.worker !== null,
          worker_info: getWorkerOutput.worker ?? null,
        };
      } catch (err: unknown) {
        this.logger?.error?.('getExecQueueStatus: MQ queue query failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // configOrchestrationExecution
  // -------------------------------------------------------------------------

  async configOrchestrationExecution(
    input: ConfigOrchestrationExecutionInput,
    _context: OrchestrationExecutionContext,
    output: ConfigOrchestrationExecutionOutput,
  ): Promise<boolean> {
    if (input.max_concurrent !== undefined && input.max_concurrent <= 0) {
      throw new ValidationError('max_concurrent must be positive');
    }
    if (input.default_max_iterations !== undefined && input.default_max_iterations <= 0) {
      throw new ValidationError('default_max_iterations must be positive');
    }
    if (input.async_worker_interval !== undefined && input.async_worker_interval <= 0) {
      throw new ValidationError('async_worker_interval must be positive');
    }
    if (input.dag_timeout_ms !== undefined && input.dag_timeout_ms <= 0) {
      throw new ValidationError('dag_timeout_ms must be positive');
    }

    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: ORCHESTRATION_CONFIG_TABLE },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    const current = (selOutput.row ?? {}) as Record<string, unknown>;
    const data: DataObject[] = [];

    if (input.max_concurrent !== undefined) {
      this.config.max_concurrent = input.max_concurrent;
      data.push({ field: 'max_concurrent', value: input.max_concurrent });
    }
    if (input.default_max_iterations !== undefined) {
      this.config.default_max_iterations = input.default_max_iterations;
      data.push({ field: 'default_max_iterations', value: input.default_max_iterations });
    }
    if (input.async_worker_interval !== undefined) {
      this.config.async_worker_interval = input.async_worker_interval;
      data.push({ field: 'async_worker_interval', value: input.async_worker_interval });
    }
    if (input.dag_timeout_ms !== undefined) {
      this.config.dag_timeout_ms = input.dag_timeout_ms;
      data.push({ field: 'dag_timeout_ms', value: input.dag_timeout_ms });
    }

    if (data.length > 0) {
      const id = (current.id as string) || IdGenerator.generate();
      data.push({ field: 'id', value: id });
      data.push({ field: 'created', value: (current.created as number) || IdGenerator.now() });
      data.push({ field: 'updated', value: IdGenerator.now() });

      const updInput = Object.assign(new UpdateDBInput(), {
        table: ORCHESTRATION_CONFIG_TABLE,
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
}
