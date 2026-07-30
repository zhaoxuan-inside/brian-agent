import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, setupTestMocks, resetTestMocks, createMockAgentBuilder, createMockAgentExecution, createMockAgentLibrary, createMockInfoCore, createMockMQAccess, createMockMQCore, createMockLogger } from './test-helpers';
import { RelationDBAccess, IdGenerator, Operator, DBContext, SelectOneDBInput, SelectOneDBOutput, SelectDBInput, SelectDBOutput, InsertDBInput, InsertDBOutput, DataObject } from '@brian-agent/base';
import { OrchestrationExecutionAccess } from '../OrchestrationExecution/access/OrchestrationExecutionAccess';
import {
  OrchestrationExecutionContext,
  BuildAgentDAGInput, BuildAgentDAGOutput,
  ExecSingleAgentInput, ExecSingleAgentOutput,
  ExecDAGInput, ExecDAGOutput,
  ExecDAGAsyncInput, ExecDAGAsyncOutput,
  GetDAGProgressInput, GetDAGProgressOutput,
  CancelExecutionInput, CancelExecutionOutput,
  GetOrchestrationExecQueueStatusInput, GetOrchestrationExecQueueStatusOutput,
  ConfigOrchestrationExecutionInput, ConfigOrchestrationExecutionOutput,
  TaskDAG, AgentDAG, AgentNode, AgentEdge,
} from '../OrchestrationExecution/domain/types';

describe('OrchestrationExecution', () => {
  let db: RelationDBAccess;
  let agentBuilder: ReturnType<typeof createMockAgentBuilder>;
  let agentExecution: ReturnType<typeof createMockAgentExecution>;
  let agentLibrary: ReturnType<typeof createMockAgentLibrary>;
  let infoCore: ReturnType<typeof createMockInfoCore>;
  let mqAccess: ReturnType<typeof createMockMQAccess>;
  let mqCore: ReturnType<typeof createMockMQCore>;
  let logger: ReturnType<typeof createMockLogger>;
  let exec: OrchestrationExecutionAccess;

  async function seedOrchestrationWork(
    workId: string, sessionId: string, interactId: string, status: string = 'CREATED',
  ): Promise<void> {
    const now = (IdGenerator as any).now ? (IdGenerator as any).now() : Date.now();
    const id = (IdGenerator as any).generate ? (IdGenerator as any).generate() : `work-seed-${workId}`;
    const insInput = Object.assign(new InsertDBInput(), {
      table: 'orchestration_work',
      data: [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'work_id', value: workId },
        { field: 'interact_id', value: interactId },
        { field: 'session_id', value: sessionId },
        { field: 'user_query', value: 'Test query' },
        { field: 'status', value: status },
        { field: 'orchestration_strategy', value: 'SIMPLE' },
        { field: 'task_count', value: 0 },
        { field: 'completed_task_count', value: 0 },
        { field: 'elapsed_ms', value: 0 },
        { field: 'cancel_reason', value: '' },
        { field: 'error_message', value: '' },
        { field: 'final_response', value: '' },
        { field: 'metadata', value: '{}' },
      ] as DataObject[],
    });
    await db.insertDB(insInput as InsertDBInput, new DBContext(), new InsertDBOutput());
  }

  beforeAll(async () => {
    await setupTestMocks();
    db = await createTestDb();
    agentBuilder = createMockAgentBuilder();
    agentExecution = createMockAgentExecution();
    agentLibrary = createMockAgentLibrary();
    infoCore = createMockInfoCore();
    mqAccess = createMockMQAccess();
    mqCore = createMockMQCore();
    logger = createMockLogger();
    exec = new OrchestrationExecutionAccess(db, agentBuilder, agentExecution, agentLibrary, infoCore, mqAccess, mqCore, logger);
    await exec.initialize();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTestMocks();
  });

  // =========================================================================
  // 1. buildAgentDAG
  // =========================================================================
  describe('buildAgentDAG', () => {
    it('TC-BAD-001: 正常构建 Agent DAG（3 个 task）', async () => {
      const taskDag: TaskDAG = {
        nodes: [
          { task_id: 'task-1', task_content: 'Task 1', task_complexity: 30, task_domain: 'general', priority: 1 },
          { task_id: 'task-2', task_content: 'Task 2', task_complexity: 40, task_domain: 'general', priority: 1 },
          { task_id: 'task-3', task_content: 'Task 3', task_complexity: 50, task_domain: 'general', priority: 1 },
        ],
        edges: [
          { from_task_id: 'task-1', to_task_id: 'task-2' },
          { from_task_id: 'task-2', to_task_id: 'task-3' },
        ],
      };
      const input = Object.assign(new BuildAgentDAGInput(), {
        plan_id: 'p1', task_dag: taskDag, interact_id: 'i1',
      });
      const output = new BuildAgentDAGOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.buildAgentDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_dag.total_agent_count).toBe(3);
      expect(output.agent_dag.agent_nodes.length).toBe(3);
      expect(output.agent_dag.agent_edges.length).toBe(2);
      expect(Object.keys(output.task_agent_map).length).toBe(3);
    });

    it('TC-BAD-002: 单个 task 构建', async () => {
      const taskDag: TaskDAG = {
        nodes: [{ task_id: 'task-1', task_content: 'Task 1', task_complexity: 30, task_domain: 'general', priority: 1 }],
        edges: [],
      };
      const input = Object.assign(new BuildAgentDAGInput(), {
        plan_id: 'p2', task_dag: taskDag, interact_id: 'i2',
      });
      const output = new BuildAgentDAGOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.buildAgentDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_dag.total_agent_count).toBe(1);
      expect(output.agent_dag.agent_nodes.length).toBe(1);
      expect(output.agent_dag.agent_edges).toEqual([]);
    });

    it('TC-BAD-003: agent_dag 节点包含完整字段', async () => {
      const taskDag: TaskDAG = {
        nodes: [{ task_id: 'task-1', task_content: 'Task 1', task_complexity: 30, task_domain: 'general', priority: 1 }],
        edges: [],
      };
      const input = Object.assign(new BuildAgentDAGInput(), {
        plan_id: 'p3', task_dag: taskDag, interact_id: 'i3',
      });
      const output = new BuildAgentDAGOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.buildAgentDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(agentBuilder.buildAgent).toHaveBeenCalled();
      expect(output.agent_dag.agent_nodes.length).toBe(1);
      const node = output.agent_dag.agent_nodes[0];
      expect(typeof node.agent_id).toBe('string');
      expect(node.agent_id.length).toBeGreaterThan(0);
      expect(node.task_id).toBe('task-1');
      expect(node.task_content).toBe('Task 1');
      expect(node.status).toBe('PENDING');
    });

    it('TC-BAD-005: force_new=true 强制新建 Agent', async () => {
      const taskDag: TaskDAG = {
        nodes: [{ task_id: 'task-1', task_content: 'Task 1', task_complexity: 30, task_domain: 'general', priority: 1 }],
        edges: [],
      };
      const input = Object.assign(new BuildAgentDAGInput(), {
        plan_id: 'p4', task_dag: taskDag, interact_id: 'i4', force_new: true,
      });
      const output = new BuildAgentDAGOutput();
      const ctx = new OrchestrationExecutionContext();

      await exec.buildAgentDAG(input, ctx, output);
      expect(agentBuilder.buildAgent).toHaveBeenCalled();
      const buildCall = agentBuilder.buildAgent.mock.calls[0];
      expect(buildCall[0].force_new).toBe(true);
    });

    it('TC-BAD-009: task_dag.nodes 为空', async () => {
      const taskDag: TaskDAG = { nodes: [], edges: [] };
      const input = Object.assign(new BuildAgentDAGInput(), {
        plan_id: 'p5', task_dag: taskDag, interact_id: 'i5',
      });
      const output = new BuildAgentDAGOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.buildAgentDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_dag.total_agent_count).toBe(0);
    });

    it('TC-BAD-010: task_dag 中 edge 引用不存在的 node', async () => {
      const taskDag: TaskDAG = {
        nodes: [{ task_id: 'task-1', task_content: 'Task 1', task_complexity: 30, task_domain: 'general', priority: 1 }],
        edges: [{ from_task_id: 'task-1', to_task_id: 'task-nonexistent' }],
      };
      const input = Object.assign(new BuildAgentDAGInput(), {
        plan_id: 'p6', task_dag: taskDag, interact_id: 'i6',
      });
      const output = new BuildAgentDAGOutput();
      const ctx = new OrchestrationExecutionContext();

      await expect(exec.buildAgentDAG(input, ctx, output)).rejects.toThrow();
    });

    it('TC-BAD-011: 某 Agent 构建失败', async () => {
      agentBuilder.buildAgent.mockImplementationOnce(async (_i: any, _c: any, o: any) => { o.error = 'build failed'; return false; });
      const taskDag: TaskDAG = {
        nodes: [{ task_id: 'task-1', task_content: 'Task 1', task_complexity: 30, task_domain: 'general', priority: 1 }],
        edges: [],
      };
      const input = Object.assign(new BuildAgentDAGInput(), {
        plan_id: 'p7', task_dag: taskDag, interact_id: 'i7',
      });
      const output = new BuildAgentDAGOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.buildAgentDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_dag.agent_nodes[0].status).toBe('BUILD_FAILED');
    });
  });

  // =========================================================================
  // 2. execSingleAgent
  // =========================================================================
  describe('execSingleAgent', () => {
    it('TC-ESA-001: 正常执行单个 Agent', async () => {
      const input = Object.assign(new ExecSingleAgentInput(), {
        work_id: 'w1', interact_id: 'i1', agent_id: 'a1', task_content: 'Test task',
      });
      const output = new ExecSingleAgentOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.execSingleAgent(input, ctx, output);
      expect(result).toBe(true);
      expect(agentExecution.execAgent).toHaveBeenCalled();
      expect(typeof output.answer).toBe('string');
      expect(output.answer.length).toBeGreaterThan(0);
      expect(typeof output.trace_id).toBe('string');
      expect(output.trace_id.length).toBeGreaterThan(0);
      expect(output.iterations).toBeGreaterThanOrEqual(0);
    });

    it('TC-ESA-004: 执行记录写入 orchestration_agent_execution 表', async () => {
      const input = Object.assign(new ExecSingleAgentInput(), {
        work_id: 'w2', interact_id: 'i2', agent_id: 'a2', task_content: 'Test task',
      });
      const output = new ExecSingleAgentOutput();
      const ctx = new OrchestrationExecutionContext();

      await exec.execSingleAgent(input, ctx, output);

      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_agent_execution', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w2' }] },
      }) as SelectDBInput, new DBContext(), selOutput);
      expect(selOutput.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-ESA-006: AgentLibrary.recordAgentUsage 被调用', async () => {
      const input = Object.assign(new ExecSingleAgentInput(), {
        work_id: 'w3', interact_id: 'i3', agent_id: 'a3', task_content: 'Test task',
      });
      const output = new ExecSingleAgentOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.execSingleAgent(input, ctx, output);
      expect(result).toBe(true);
      expect(agentLibrary.recordAgentUsage).toHaveBeenCalledTimes(1);
    });

    it('TC-ESA-008: AgentExecution.execAgent 执行失败', async () => {
      agentExecution.execAgent.mockImplementationOnce(async (_i: any, _c: any, o: any) => { o.error = 'exec failed'; return false; });
      const input = Object.assign(new ExecSingleAgentInput(), {
        work_id: 'w4', interact_id: 'i4', agent_id: 'a4', task_content: 'Test task',
      });
      const output = new ExecSingleAgentOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.execSingleAgent(input, ctx, output);
      expect(result).toBe(false);
    });

    it('TC-ESA-011: task_content 为空', async () => {
      const input = Object.assign(new ExecSingleAgentInput(), {
        work_id: 'w5', interact_id: 'i5', agent_id: 'a5', task_content: '',
      });
      const output = new ExecSingleAgentOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.execSingleAgent(input, ctx, output);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 3. execDAG
  // =========================================================================
  describe('execDAG', () => {
    it('TC-ED-001: 串行执行链式 DAG（3 个节点）', async () => {
      await seedOrchestrationWork('w6', 's6', 'i6-ed001', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p1', total_agent_count: 3,
        agent_nodes: [
          { agent_id: 'a1', task_id: 't1', task_content: 'Task 1', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a2', task_id: 't2', task_content: 'Task 2', task_complexity: 40, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a3', task_id: 't3', task_content: 'Task 3', task_complexity: 50, task_domain: 'general', task_priority: 1, status: 'PENDING' },
        ],
        agent_edges: [
          { from_agent_id: 'a1', to_agent_id: 'a2', data_dependency: 'output' },
          { from_agent_id: 'a2', to_agent_id: 'a3', data_dependency: 'output' },
        ],
      };
      const input = Object.assign(new ExecDAGInput(), {
        work_id: 'w6', agent_dag: agentDag, max_concurrent: 1,
      });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i6-ed001' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(Array.isArray(output.agent_results)).toBe(true);
      expect(output.agent_results.length).toBe(3);
      expect(output.failed_count).toBe(0);
      for (const r of output.agent_results) {
        expect(r.status).toBe('COMPLETED');
        expect(typeof r.answer).toBe('string');
        expect(r.answer.length).toBeGreaterThan(0);
      }
    });

    it('TC-ED-003: 串行执行独立节点', async () => {
      await seedOrchestrationWork('w7', 's7', 'i7-ed003', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p2', total_agent_count: 3,
        agent_nodes: [
          { agent_id: 'a4', task_id: 't4', task_content: 'Task 4', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a5', task_id: 't5', task_content: 'Task 5', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a6', task_id: 't6', task_content: 'Task 6', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
        ],
        agent_edges: [],
      };
      const input = Object.assign(new ExecDAGInput(), {
        work_id: 'w7', agent_dag: agentDag, max_concurrent: 1,
      });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i7-ed003' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(Array.isArray(output.agent_results)).toBe(true);
      expect(output.agent_results.length).toBe(3);
      for (const r of output.agent_results) {
        expect(r.status).toBe('COMPLETED');
      }
    });

    it('TC-ED-007: 并发执行独立节点', async () => {
      await seedOrchestrationWork('w8', 's8', 'i8-ed007', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p3', total_agent_count: 3,
        agent_nodes: [
          { agent_id: 'a7', task_id: 't7', task_content: 'Task 7', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a8', task_id: 't8', task_content: 'Task 8', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a9', task_id: 't9', task_content: 'Task 9', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
        ],
        agent_edges: [],
      };
      const input = Object.assign(new ExecDAGInput(), {
        work_id: 'w8', agent_dag: agentDag, max_concurrent: 3,
      });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i8-ed007' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(Array.isArray(output.agent_results)).toBe(true);
      expect(output.agent_results.length).toBe(3);
    });

    it('TC-ED-010: 链式依赖拓扑排序', async () => {
      await seedOrchestrationWork('w9', 's9', 'i9-ed010', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p4', total_agent_count: 3,
        agent_nodes: [
          { agent_id: 'a10', task_id: 't10', task_content: 'Task 10', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a11', task_id: 't11', task_content: 'Task 11', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a12', task_id: 't12', task_content: 'Task 12', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
        ],
        agent_edges: [
          { from_agent_id: 'a10', to_agent_id: 'a11', data_dependency: 'output' },
          { from_agent_id: 'a11', to_agent_id: 'a12', data_dependency: 'output' },
        ],
      };
      const input = Object.assign(new ExecDAGInput(), {
        work_id: 'w9', agent_dag: agentDag, max_concurrent: 1,
      });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i9-ed010' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(Array.isArray(output.agent_results)).toBe(true);
      expect(output.agent_results.length).toBe(3);
      const ids = output.agent_results.map(r => r.agent_id);
      expect(ids.indexOf('a10')).toBeLessThan(ids.indexOf('a11'));
      expect(ids.indexOf('a11')).toBeLessThan(ids.indexOf('a12'));
    });

    it('TC-ED-019: agent_dag 为空', async () => {
      await seedOrchestrationWork('w10', 's10', 'i10-ed019', 'PROCESSING');
      const agentDag: AgentDAG = { plan_id: 'p5', total_agent_count: 0, agent_nodes: [], agent_edges: [] };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w10', agent_dag: agentDag });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i10-ed019' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(Array.isArray(output.agent_results)).toBe(true);
      expect(output.agent_results).toEqual([]);
    });

    it('TC-ED-020: agent_dag 只有一个节点', async () => {
      await seedOrchestrationWork('w11', 's11', 'i11-ed020', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p6', total_agent_count: 1,
        agent_nodes: [{ agent_id: 'a13', task_id: 't13', task_content: 'Single task', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' }],
        agent_edges: [],
      };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w11', agent_dag: agentDag });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i11-ed020' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(Array.isArray(output.agent_results)).toBe(true);
      expect(output.agent_results.length).toBe(1);
      expect(output.agent_results[0].status).toBe('COMPLETED');
    });
  });

  // =========================================================================
  // 4. execDAGAsync
  // =========================================================================
  describe('execDAGAsync', () => {
    it('TC-EDA-001: 异步提交 DAG 执行', async () => {
      const agentDag: AgentDAG = {
        plan_id: 'p7', total_agent_count: 1,
        agent_nodes: [{ agent_id: 'a14', task_id: 't14', task_content: 'Task', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' }],
        agent_edges: [],
      };
      const input = Object.assign(new ExecDAGAsyncInput(), {
        work_id: 'w12', agent_dag: agentDag, callback_queue: 'dag.result',
      });
      const output = new ExecDAGAsyncOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.execDAGAsync(input, ctx, output);
      expect(result).toBe(true);
      expect(output.job_id).toBeTruthy();
    });
  });

  // =========================================================================
  // 5. getDAGProgress
  // =========================================================================
  describe('getDAGProgress', () => {
    it('TC-GDP-001: 查询执行中 DAG 的进度', async () => {
      const input = Object.assign(new GetDAGProgressInput(), { work_id: 'w6' });
      const output = new GetDAGProgressOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.getDAGProgress(input, ctx, output);
      expect(result).toBe(true);
      expect(output.progress).toBeTruthy();
    });

    it('TC-GDP-007: 无执行记录', async () => {
      const input = Object.assign(new GetDAGProgressInput(), { work_id: 'nonexistent' });
      const output = new GetDAGProgressOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.getDAGProgress(input, ctx, output);
      expect(result).toBe(true);
      expect(output.progress!.total_tasks).toBe(0);
    });
  });

  // =========================================================================
  // 6. cancelExecution
  // =========================================================================
  describe('cancelExecution', () => {
    it('TC-CE-001: 取消有 PENDING 和 RUNNING 记录的 work', async () => {
      const input = Object.assign(new CancelExecutionInput(), { work_id: 'w6' });
      const output = new CancelExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.cancelExecution(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-CE-006: 无任何执行记录', async () => {
      const input = Object.assign(new CancelExecutionInput(), { work_id: 'nonexistent' });
      const output = new CancelExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.cancelExecution(input, ctx, output);
      expect(result).toBe(true);
      expect(output.cancelled_count).toBe(0);
    });
  });

  // =========================================================================
  // 7. getExecQueueStatus
  // =========================================================================
  describe('getExecQueueStatus', () => {
    it('TC-GQS-001: 查询队列统计信息', async () => {
      const input = new GetOrchestrationExecQueueStatusInput();
      const output = new GetOrchestrationExecQueueStatusOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.getExecQueueStatus(input, ctx, output);
      expect(result).toBe(true);
      expect(output.queue_stats).toBeTruthy();
    });
  });

  // =========================================================================
  // 8. configOrchestrationExecution
  // =========================================================================
  describe('configOrchestrationExecution', () => {
    it('TC-COE-001: 更新 max_concurrent', async () => {
      const input = Object.assign(new ConfigOrchestrationExecutionInput(), { max_concurrent: 3 });
      const output = new ConfigOrchestrationExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.configOrchestrationExecution(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-COE-007: max_concurrent 为负数', async () => {
      const input = Object.assign(new ConfigOrchestrationExecutionInput(), { max_concurrent: -1 });
      const output = new ConfigOrchestrationExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      await expect(exec.configOrchestrationExecution(input, ctx, output)).rejects.toThrow();
    });

    it('TC-COE-008: default_max_iterations 为负数', async () => {
      const input = Object.assign(new ConfigOrchestrationExecutionInput(), { default_max_iterations: -5 });
      const output = new ConfigOrchestrationExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      await expect(exec.configOrchestrationExecution(input, ctx, output)).rejects.toThrow();
    });

    it('TC-COE-010: dag_timeout_ms 为负数', async () => {
      const input = Object.assign(new ConfigOrchestrationExecutionInput(), { dag_timeout_ms: -1 });
      const output = new ConfigOrchestrationExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      await expect(exec.configOrchestrationExecution(input, ctx, output)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 9. AOP 代理通用测试
  // =========================================================================
  describe('AOP proxy', () => {
    it('TC-AOP-001: 方法调用后 output.elapsed_ms 存在', async () => {
      const input = Object.assign(new ExecSingleAgentInput(), {
        work_id: 'w13', interact_id: 'i13', agent_id: 'a13', task_content: 'Test',
      });
      const output = new ExecSingleAgentOutput();
      const ctx = new OrchestrationExecutionContext();

      await exec.execSingleAgent(input, ctx, output);
      expect(output.elapsed_ms).toBeDefined();
      expect(output.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 10. 表结构验证
  // =========================================================================
  describe('table structure', () => {
    it('TC-TBL-001: orchestration_task_agent 表存在', async () => {
      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_task_agent' },
      }) as SelectDBInput, new DBContext(), selOutput);
      expect(selOutput.rows).toBeDefined();
    });

    it('TC-TBL-003: orchestration_agent_dag 表存在', async () => {
      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_agent_dag' },
      }) as SelectDBInput, new DBContext(), selOutput);
      expect(selOutput.rows).toBeDefined();
    });

    it('TC-TBL-006: orchestration_agent_execution 表存在', async () => {
      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_agent_execution' },
      }) as SelectDBInput, new DBContext(), selOutput);
      expect(selOutput.rows).toBeDefined();
    });
  });
});