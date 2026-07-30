import {
  RelationDBAccess, SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  Operator, DataObject, DBContext, IdGenerator,
  ValidationError, type Logger, type Condition,
} from '@brian-agent/base';
import type {
  AgentLibraryAccess, AgentExecutionAccess, AgentRecord,
} from '@brian-agent/agent';
import {
  AgentLibraryContext, GetAgentInput, GetAgentOutput,
} from '@brian-agent/agent';
import {
  AgentExecutionContext, GetTraceInput, GetTraceOutput,
} from '@brian-agent/agent';
import {
  OrchestrationVisualizationContext,
  VisualizeAgentDAGInput, VisualizeAgentDAGOutput,
  VisualizeWorkFlowInput, VisualizeWorkFlowOutput,
  GetAgentNodeDetailInput, GetAgentNodeDetailOutput,
  ConfigOrchestrationVisualizationInput, ConfigOrchestrationVisualizationOutput,
} from '../domain/types';

export class OrchestrationVisualizationService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly agentLibrary: AgentLibraryAccess,
    private readonly agentExecution: AgentExecutionAccess,
    private readonly logger?: Logger,
  ) {}

  async visualizeAgentDAG(
    input: VisualizeAgentDAGInput,
    context: OrchestrationVisualizationContext,
    output: VisualizeAgentDAGOutput,
  ): Promise<boolean> {
    const workId = input.work_id;

    const work = await this.queryOrchestrationWork(workId);
    if (!work) {
      output.agent_dag_structure = { work_id: workId, error: 'Work not found' };
      return false;
    }

    const strategy = (work.orchestration_strategy as string) ?? 'SIMPLE';
    const nodes: Record<string, unknown>[] = [];
    const edges: Record<string, unknown>[] = [];

    let agentIds: string[] = [];
    let taskAgentMap = new Map<string, string>(); // agent_id → task_id

    if (strategy === 'PLANNING') {
      const planId = await this.getPlanIdForWork(workId);
      if (planId) {
        const taskAgentRows = await this.queryTable('orchestration_task_agent', [
          { field: 'plan_id', operator: Operator.EQ, value: planId },
        ]);
        for (const row of taskAgentRows) {
          const aid = row.agent_id as string;
          const tid = row.task_id as string;
          if (aid) {
            agentIds.push(aid);
            taskAgentMap.set(aid, tid);
          }
        }

        const dagRows = await this.queryTable('orchestration_agent_dag', [
          { field: 'plan_id', operator: Operator.EQ, value: planId },
        ]);
        for (const row of dagRows) {
          edges.push({
            from_agent_id: row.from_agent_id as string,
            to_agent_id: row.to_agent_id as string,
            edge_type: 'DATA_DEPENDENCY',
            data_dependency: `${row.from_agent_id as string} → ${row.to_agent_id as string}`,
          });
        }
      }
    }

    if (agentIds.length === 0) {
      const execRows = await this.queryTable('orchestration_agent_execution', [
        { field: 'work_id', operator: Operator.EQ, value: workId },
      ]);
      for (const row of execRows) {
        const aid = row.agent_id as string;
        if (aid && !agentIds.includes(aid)) {
          agentIds.push(aid);
          taskAgentMap.set(aid, row.task_id as string);
        }
      }
    }

    const { agentLevels, agentUpstream, agentDownstream } = this.computeDependencyLevels(edges);

    for (const agentId of agentIds) {
      const node: Record<string, unknown> = {
        agent_id: agentId,
        agent_type: '',
        task_id: taskAgentMap.get(agentId) ?? '',
        task_complexity: 0,
        task_domain: '',
        dependency_level: agentLevels.get(agentId) ?? 0,
        status: 'UNKNOWN',
        upstream_agent_ids: agentUpstream.get(agentId) ?? [],
        downstream_agent_ids: agentDownstream.get(agentId) ?? [],
        runtime: {},
        component_refs: {},
        context_source_refs: {},
        result_refs: {},
      };

      const execRecord = await this.queryOneTable('orchestration_agent_execution', [
        { field: 'work_id', operator: Operator.EQ, value: workId },
        { field: 'agent_id', operator: Operator.EQ, value: agentId },
      ]);

      if (execRecord) {
        node.status = (execRecord.status as string) ?? 'UNKNOWN';
        node.runtime = {
          trace_id: (execRecord.trace_id as string) ?? null,
          iterations: (execRecord.iterations as number) ?? 0,
          elapsed_ms: (execRecord.elapsed_ms as number) ?? 0,
          error_info: (execRecord.error_info as string) ?? null,
        };

        const traceId = execRecord.trace_id as string;
        if (traceId) {
          node.context_source_refs = await this.getContextSourceRefs(traceId, agentId);
        }
      }

      node.component_refs = await this.getComponentRefs(agentId);

      node.result_refs = {
        task_id: node.task_id,
        info_ids: await this.getResultInfoIds(workId, agentId),
        eval_id: await this.getEvalId(agentId, workId),
      };

      if (taskAgentMap.has(agentId)) {
        const taskRow = await this.queryOneTable('orchestration_task_agent', [
          { field: 'agent_id', operator: Operator.EQ, value: agentId },
        ]);
        if (taskRow) {
          node.task_complexity = (taskRow.task_complexity as number) ?? 0;
          node.task_domain = (taskRow.task_domain as string) ?? '';
        }
      }

      nodes.push(node);
    }

    const maxDepth = nodes.length > 0 ? Math.max(...nodes.map((n) => n.dependency_level as number)) : 0;
    let parallelBranches = 0;
    const levelCounts = new Map<number, number>();
    for (const n of nodes) {
      const lvl = n.dependency_level as number;
      levelCounts.set(lvl, (levelCounts.get(lvl) ?? 0) + 1);
    }
    if (levelCounts.size > 0) {
      parallelBranches = Math.max(...levelCounts.values());
    }

    output.agent_dag_structure = {
      work_id: workId,
      session_id: (work.session_id as string) ?? '',
      orchestration_strategy: strategy,
      work_status: (work.status as string) ?? '',
      total_elapsed_ms: (work.elapsed_ms as number) ?? 0,
      graph: {
        nodes,
        edges,
        metadata: {
          total_nodes: nodes.length,
          total_edges: edges.length,
          max_dependency_depth: maxDepth,
          parallel_branches: parallelBranches,
        },
      },
    };
    return true;
  }

  async visualizeWorkFlow(
    input: VisualizeWorkFlowInput,
    _context: OrchestrationVisualizationContext,
    output: VisualizeWorkFlowOutput,
  ): Promise<boolean> {
    const workId = input.work_id;

    const work = await this.queryOrchestrationWork(workId);
    if (!work) {
      output.workflow_timeline = { work_id: workId, error: 'Work not found' };
      return false;
    }

    const strategy = (work.orchestration_strategy as string) ?? 'SIMPLE';
    const isPlanning = strategy === 'PLANNING';
    const workCreated = (work.created as number) ?? 0;
    const workUpdated = (work.updated as number) ?? 0;
    const totalElapsedMs = (work.elapsed_ms as number) ?? (workUpdated - workCreated);

    const execRows = await this.queryTable('orchestration_agent_execution', [
      { field: 'work_id', operator: Operator.EQ, value: workId },
    ]);

    const phases: Record<string, unknown>[] = [];

    const entryEndTime = execRows.length > 0
      ? Math.min(...execRows.map((r) => (r.created as number) ?? 0).filter((t) => t > 0))
      : workUpdated;

    phases.push({
      phase: 'ENTRY',
      status: 'COMPLETED',
      start_time: new Date(workCreated).toISOString(),
      end_time: new Date(entryEndTime).toISOString(),
      elapsed_ms: entryEndTime - workCreated,
      description: '接收用户请求，构建工作上下文',
    });

    const completedExecRows = execRows.filter((r) => r.status === 'COMPLETED');
    const completedTimes = completedExecRows
      .filter((r) => (r.updated as number) > 0)
      .map((r) => (r.updated as number) ?? (r.updated as number));
    const execStartTime = execRows.length > 0
      ? Math.min(...execRows.map((r) => (r.created as number) ?? 0).filter((t) => t > 0))
      : entryEndTime;
    const execEndTime = completedTimes.length > 0
      ? Math.max(...completedTimes)
      : workUpdated;

    if (isPlanning) {
      const planId = await this.getPlanIdForWork(workId);
      const planElapsed = execStartTime - entryEndTime;

      phases.push({
        phase: 'PLANNING',
        status: 'COMPLETED',
        start_time: new Date(entryEndTime).toISOString(),
        end_time: new Date(execStartTime).toISOString(),
        elapsed_ms: planElapsed,
        description: 'PlannerAgent 拆解任务 → 生成 Task DAG',
        refs: { plan_id: planId ?? null },
      });

      const dagRecRow = await this.queryOneTable('orchestration_agent_dag_record', [
        { field: 'plan_id', operator: Operator.EQ, value: planId ?? '' },
      ]);

      const agentIds = execRows.map((r) => r.agent_id as string).filter(Boolean);
      phases.push({
        phase: 'BUILD_AGENT_DAG',
        status: 'COMPLETED',
        start_time: new Date(execStartTime).toISOString(),
        end_time: new Date(execStartTime).toISOString(),
        elapsed_ms: 0,
        description: `Task DAG → Agent DAG 转换（${agentIds.length}个WorkAgent已构建）`,
        refs: {
          agent_ids: agentIds,
          agent_dag_record_id: dagRecRow ? (dagRecRow.id as string) : null,
        },
      });
    }

    const completedCount = execRows.filter((r) => r.status === 'COMPLETED').length;
    const failedCount = execRows.filter((r) => r.status === 'FAILED').length;
    const execIds = execRows.map((r) => r.id as string).filter(Boolean);

    const executingElapsed = execEndTime - execStartTime;
    phases.push({
      phase: 'EXECUTING',
      status: failedCount > 0 ? 'PARTIAL' : 'COMPLETED',
      start_time: new Date(execStartTime).toISOString(),
      end_time: new Date(execEndTime).toISOString(),
      elapsed_ms: Math.max(0, executingElapsed),
      description: `Agent DAG 执行（${completedCount}/${execRows.length} 完成，${failedCount} 失败）`,
      refs: { agent_execution_ids: execIds },
    });

    const writingElapsed = workUpdated - execEndTime;
    if (writingElapsed > 0) {
      phases.push({
        phase: 'WRITING',
        status: 'COMPLETED',
        start_time: new Date(execEndTime).toISOString(),
        end_time: new Date(workUpdated).toISOString(),
        elapsed_ms: writingElapsed,
        description: 'WriterAgent 汇总结果 → 生成人性化最终回复',
        refs: {},
      });
    }

    const totalPhaseMs = phases.reduce((sum, p) => sum + (p.elapsed_ms as number), 0);
    const denominator = totalPhaseMs > 0 ? totalPhaseMs : 1;
    let planningRatio = 0;
    let executingRatio = 0;
    let writingRatio = 0;
    let evaluatingRatio = 0;

    for (const p of phases) {
      const elapsed = p.elapsed_ms as number;
      switch (p.phase) {
        case 'PLANNING': planningRatio = elapsed / denominator; break;
        case 'EXECUTING': executingRatio = elapsed / denominator; break;
        case 'WRITING': writingRatio = elapsed / denominator; break;
        case 'EVALUATING': evaluatingRatio = elapsed / denominator; break;
      }
    }
    const overheadRatio = 1 - planningRatio - executingRatio - writingRatio - evaluatingRatio;

    output.workflow_timeline = {
      work_id: workId,
      session_id: (work.session_id as string) ?? '',
      interact_id: (work.interact_id as string) ?? '',
      orchestration_strategy: strategy,
      work_status: (work.status as string) ?? '',
      total_elapsed_ms: totalElapsedMs,
      phases,
      timeline_summary: {
        planning_ratio: Math.round(planningRatio * 100) / 100,
        executing_ratio: Math.round(executingRatio * 100) / 100,
        writing_ratio: Math.round(writingRatio * 100) / 100,
        evaluating_ratio: Math.round(evaluatingRatio * 100) / 100,
        overhead_ratio: Math.round(overheadRatio * 100) / 100,
      },
    };
    return true;
  }

  async getAgentNodeDetail(
    input: GetAgentNodeDetailInput,
    _context: OrchestrationVisualizationContext,
    output: GetAgentNodeDetailOutput,
  ): Promise<boolean> {
    const { work_id: workId, agent_id: agentId } = input;

    const taskAgentRow = await this.queryOneTable('orchestration_task_agent', [
      { field: 'agent_id', operator: Operator.EQ, value: agentId },
    ]);

    const execRow = await this.queryOneTable('orchestration_agent_execution', [
      { field: 'work_id', operator: Operator.EQ, value: workId },
      { field: 'agent_id', operator: Operator.EQ, value: agentId },
    ]);

    if (!taskAgentRow && !execRow) {
      return false;
    }

    const dagUpstream = await this.queryTable('orchestration_agent_dag', [
      { field: 'to_agent_id', operator: Operator.EQ, value: agentId },
    ]);
    const dagDownstream = await this.queryTable('orchestration_agent_dag', [
      { field: 'from_agent_id', operator: Operator.EQ, value: agentId },
    ]);

    const upstreamAgentIds = dagUpstream.map((r) => r.from_agent_id as string).filter(Boolean);
    const downstreamAgentIds = dagDownstream.map((r) => r.to_agent_id as string).filter(Boolean);

    const componentRefs = await this.getComponentRefs(agentId);

    let contextSourceRefs: Record<string, unknown> = {};
    const traceId = execRow?.trace_id as string | undefined;
    if (traceId) {
      contextSourceRefs = await this.getContextSourceRefs(traceId, agentId);
    }

    const resultRefs = {
      task_id: taskAgentRow ? (taskAgentRow.task_id as string) : '',
      info_ids: await this.getResultInfoIds(workId, agentId),
      info_roles: await this.getResultInfoRoles(workId, agentId),
      eval_id: await this.getEvalId(agentId, workId),
    };

    output.agent_node_detail = {
      agent_id: agentId,
      agent_type: componentRefs.agent_type ?? '',
      work_id: workId,
      task_id: taskAgentRow ? (taskAgentRow.task_id as string) : '',
      task_complexity: taskAgentRow ? ((taskAgentRow.task_complexity as number) ?? 0) : 0,
      task_domain: taskAgentRow ? ((taskAgentRow.task_domain as string) ?? '') : '',
      status: execRow ? ((execRow.status as string) ?? 'UNKNOWN') : 'UNKNOWN',
      elapsed_ms: execRow ? ((execRow.elapsed_ms as number) ?? 0) : 0,
      iterations: execRow ? ((execRow.iterations as number) ?? 0) : 0,
      dependency_chain: {
        upstream_agent_ids: upstreamAgentIds,
        downstream_agent_ids: downstreamAgentIds,
      },
      component_refs: componentRefs,
      context_source_refs: contextSourceRefs,
      result_refs: resultRefs,
    };
    return true;
  }

  async configOrchestrationVisualization(
    input: ConfigOrchestrationVisualizationInput,
    _context: OrchestrationVisualizationContext,
    output: ConfigOrchestrationVisualizationOutput,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'orchestration_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    const current = (selOutput.row ?? {}) as Record<string, unknown>;

    if (input.max_nodes_in_graph !== undefined) {
      if (input.max_nodes_in_graph <= 0) {
        throw new ValidationError('max_nodes_in_graph must be positive');
      }

      const id = (current.id as string) || 'orchestration_config_default';
      const data: DataObject[] = [
        { field: 'id', value: id },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'max_nodes_in_graph', value: input.max_nodes_in_graph },
      ];
      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_config',
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      current.max_nodes_in_graph = input.max_nodes_in_graph;
    }

    output.config = current;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async queryOrchestrationWork(workId: string): Promise<Record<string, unknown> | null> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_work',
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: workId },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
    return selOutput.row;
  }

  private async queryTable(
    table: string,
    conditions: Condition[],
  ): Promise<Record<string, unknown>[]> {
    try {
      const selInput = Object.assign(new SelectDBInput(), {
        query_param: { table, conditions },
      });
      const selOutput = Object.assign(new SelectDBOutput(), {});
      await this.relationDb.selectDB(selInput, new DBContext(), selOutput);
      return selOutput.rows;
    } catch (err: unknown) {
      this.logger?.error?.('queryTable failed', { table, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }

  private async queryOneTable(
    table: string,
    conditions: Condition[],
  ): Promise<Record<string, unknown> | null> {
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: { table, conditions },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
      return selOutput.row;
    } catch (err: unknown) {
      this.logger?.error?.('queryOneTable failed', { table, error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  private async getPlanIdForWork(workId: string): Promise<string | null> {
    const execRow = await this.queryOneTable('orchestration_agent_execution', [
      { field: 'work_id', operator: Operator.EQ, value: workId },
    ]);
    return execRow ? (execRow.plan_id as string) ?? null : null;
  }

  private computeDependencyLevels(edges: Record<string, unknown>[]): {
    agentLevels: Map<string, number>;
    agentUpstream: Map<string, string[]>;
    agentDownstream: Map<string, string[]>;
  } {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();
    const reverseAdj = new Map<string, string[]>();

    for (const edge of edges) {
      const from = edge.from_agent_id as string;
      const to = edge.to_agent_id as string;
      if (!from || !to) continue;

      if (!adjList.has(from)) adjList.set(from, []);
      adjList.get(from)!.push(to);
      if (!reverseAdj.has(to)) reverseAdj.set(to, []);
      reverseAdj.get(to)!.push(from);

      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
      if (!inDegree.has(from)) inDegree.set(from, 0);
    }

    const agentLevels = new Map<string, number>();
    const queue: string[] = [];

    for (const [node, degree] of inDegree) {
      if (degree === 0) {
        queue.push(node);
        agentLevels.set(node, 0);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentLevel = agentLevels.get(current) ?? 0;
      const neighbors = adjList.get(current) ?? [];

      for (const neighbor of neighbors) {
        const prevLevel = agentLevels.get(neighbor) ?? -1;
        const newLevel = Math.max(prevLevel, currentLevel + 1);
        agentLevels.set(neighbor, newLevel);

        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    const agentUpstream = new Map<string, string[]>();
    const agentDownstream = new Map<string, string[]>();

    for (const [node] of agentLevels) {
      agentUpstream.set(node, reverseAdj.get(node) ?? []);
      agentDownstream.set(node, adjList.get(node) ?? []);
    }

    return { agentLevels, agentUpstream, agentDownstream };
  }

  private async getComponentRefs(agentId: string): Promise<Record<string, unknown>> {
    const refs: Record<string, unknown> = {
      agent_id: agentId,
      strategy_id: null,
      llm_id: null,
      soul_id: null,
      skill_ids: [],
      mcp_ids: [],
      prompt_template_ids: {},
    };

    try {
      const getAgentInput = Object.assign(new GetAgentInput(), {
        agent_id: agentId,
      });
      const getAgentOutput = new GetAgentOutput();
      await this.agentLibrary.getAgent(getAgentInput, new AgentLibraryContext(), getAgentOutput);

      if (getAgentOutput.agents.length > 0) {
        const agent: AgentRecord = getAgentOutput.agents[0];
        refs.strategy_id = agent.strategy_id ?? null;
        refs.llm_id = agent.llm_id ?? null;
        refs.soul_id = agent.soul_id ?? null;
        refs.agent_name = agent.agent_name ?? '';
        refs.agent_type = agent.agent_type ?? '';
      }
    } catch (err: unknown) {
      this.logger?.error?.('getComponentRefs: agentLibrary.getAgent failed', { agentId, error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const skillRows = await this.queryTable('agent_skill', [
        { field: 'agent_id', operator: Operator.EQ, value: agentId },
      ]);
      refs.skill_ids = skillRows.map((r) => r.skill_id as string).filter(Boolean);
    } catch (err: unknown) {
      this.logger?.error?.('getComponentRefs: agent_skill failed', { agentId, error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const mcpRows = await this.queryTable('agent_mcp', [
        { field: 'agent_id', operator: Operator.EQ, value: agentId },
      ]);
      refs.mcp_ids = mcpRows.map((r) => r.mcp_id as string).filter(Boolean);
    } catch (err: unknown) {
      this.logger?.error?.('getComponentRefs: agent_mcp failed', { agentId, error: err instanceof Error ? err.message : String(err) });
    }

    try {
      const configRow = await this.queryOneTable('agent_execution_config', [
        { field: 'agent_id', operator: Operator.EQ, value: agentId },
      ]);
      if (configRow) {
        refs.prompt_template_ids = {
          think: (configRow.think_prompt_template_id as string) ?? null,
          reflect: (configRow.reflect_prompt_template_id as string) ?? null,
          answer: (configRow.answer_prompt_template_id as string) ?? null,
        };
      }
    } catch (err: unknown) {
      this.logger?.error?.('getComponentRefs: agent_execution_config failed', { agentId, error: err instanceof Error ? err.message : String(err) });
    }

    return refs;
  }

  private async getContextSourceRefs(
    traceId: string,
    _agentId: string,
  ): Promise<Record<string, unknown>> {
    const refs: Record<string, unknown> = {
      trace_id: traceId,
      pinned: { count: 0, info_ids: [] },
      timeline: { count: 0, info_ids: [] },
      tag_relative: { count: 0, info_ids: [] },
      similarity: { count: 0, info_ids: [] },
      keyword: { count: 0, info_ids: [] },
      random: { count: 0, info_ids: [] },
    };

    try {
      const getTraceInput = Object.assign(new GetTraceInput(), { trace_id: traceId });
      const getTraceOutput = new GetTraceOutput();
      await this.agentExecution.getTrace(getTraceInput, new AgentExecutionContext(), getTraceOutput);

      if (getTraceOutput.trace) {
        const traceData = getTraceOutput.trace as Record<string, unknown>;
        if (traceData.context_source_refs) {
          Object.assign(refs, traceData.context_source_refs);
        }
      }
    } catch (err: unknown) {
      this.logger?.error?.('getContextSourceRefs: getTrace failed', { traceId, error: err instanceof Error ? err.message : String(err) });
    }

    return refs;
  }

  private async getResultInfoIds(workId: string, agentId: string): Promise<string[]> {
    try {
      const rows = await this.queryTable('info_raw', [
        { field: 'work_id', operator: Operator.EQ, value: workId },
        { field: 'info_creator_id', operator: Operator.EQ, value: agentId },
      ]);
      return rows.map((r) => r.id as string).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async getResultInfoRoles(
    workId: string,
    agentId: string,
  ): Promise<Record<string, string>> {
    const roles: Record<string, string> = {};
    try {
      const rows = await this.queryTable('info_raw', [
        { field: 'work_id', operator: Operator.EQ, value: workId },
        { field: 'info_creator_id', operator: Operator.EQ, value: agentId },
      ]);
      for (const row of rows) {
        const id = row.id as string;
        if (id) roles[id] = (row.info_creator_role as string) ?? 'AGENT';
      }
    } catch { /* degrade gracefully */ }
    return roles;
  }

  private async getEvalId(agentId: string, workId: string): Promise<string | null> {
    try {
      const row = await this.queryOneTable('agent_evaluation', [
        { field: 'agent_id', operator: Operator.EQ, value: agentId },
        { field: 'work_id', operator: Operator.EQ, value: workId },
      ]);
      return row ? (row.id as string) ?? null : null;
    } catch {
      return null;
    }
  }
}
