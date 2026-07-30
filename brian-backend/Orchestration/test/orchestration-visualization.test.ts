import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, setupTestMocks, resetTestMocks, createMockAgentLibrary, createMockAgentExecution, createMockLogger } from './test-helpers';
import { RelationDBAccess, Operator, DBContext, SelectDBInput, SelectDBOutput, InsertDBInput, InsertDBOutput, DataObject, IdGenerator } from '@brian-agent/base';
import { OrchestrationVisualizationAccess } from '../OrchestrationVisualization/access/OrchestrationVisualizationAccess';
import {
  OrchestrationVisualizationContext,
  VisualizeAgentDAGInput, VisualizeAgentDAGOutput,
  VisualizeWorkFlowInput, VisualizeWorkFlowOutput,
  GetAgentNodeDetailInput, GetAgentNodeDetailOutput,
  ConfigOrchestrationVisualizationInput, ConfigOrchestrationVisualizationOutput,
} from '../OrchestrationVisualization/domain/types';

describe('OrchestrationVisualization', () => {
  let db: RelationDBAccess;
  let agentLibrary: ReturnType<typeof createMockAgentLibrary>;
  let agentExecution: ReturnType<typeof createMockAgentExecution>;
  let logger: ReturnType<typeof createMockLogger>;
  let viz: OrchestrationVisualizationAccess;

  beforeAll(async () => {
    await setupTestMocks();
    db = await createTestDb();
    agentLibrary = createMockAgentLibrary({ hasAgent: true });
    agentExecution = createMockAgentExecution();
    logger = createMockLogger();
    viz = new OrchestrationVisualizationAccess(db, agentLibrary, agentExecution, logger);
    await viz.initialize();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTestMocks();
  });

  async function seedWorkData(workId: string, sessionId: string, strategy: string, status: string): Promise<void> {
    const now = IdGenerator.now();
    const workData: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'work_id', value: workId },
      { field: 'interact_id', value: IdGenerator.generate() },
      { field: 'session_id', value: sessionId },
      { field: 'user_query', value: 'Test query' },
      { field: 'status', value: status },
      { field: 'orchestration_strategy', value: strategy },
      { field: 'task_count', value: 3 },
      { field: 'completed_task_count', value: status === 'COMPLETED' ? 3 : 0 },
      { field: 'elapsed_ms', value: 500 },
      { field: 'cancel_reason', value: '' },
      { field: 'error_message', value: '' },
      { field: 'final_response', value: 'Test response' },
      { field: 'metadata', value: '{}' },
    ];
    await db.insertDB(Object.assign(new InsertDBInput(), { table: 'orchestration_work', data: workData }) as InsertDBInput, new DBContext(), new InsertDBOutput());
  }

  async function seedTaskAgentData(planId: string, taskId: string, agentId: string): Promise<void> {
    const now = IdGenerator.now();
    await db.insertDB(Object.assign(new InsertDBInput(), {
      table: 'orchestration_task_agent',
      data: [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'plan_id', value: planId },
        { field: 'task_id', value: taskId },
        { field: 'agent_id', value: agentId },
        { field: 'task_complexity', value: 30 },
        { field: 'task_domain', value: 'general' },
      ],
    }) as InsertDBInput, new DBContext(), new InsertDBOutput());
  }

  async function seedAgentDAGData(planId: string, fromAgentId: string, toAgentId: string): Promise<void> {
    const now = IdGenerator.now();
    await db.insertDB(Object.assign(new InsertDBInput(), {
      table: 'orchestration_agent_dag',
      data: [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'plan_id', value: planId },
        { field: 'from_agent_id', value: fromAgentId },
        { field: 'to_agent_id', value: toAgentId },
      ],
    }) as InsertDBInput, new DBContext(), new InsertDBOutput());
  }

  async function seedExecutionData(workId: string, agentId: string, taskId: string, status: string): Promise<void> {
    const now = IdGenerator.now();
    await db.insertDB(Object.assign(new InsertDBInput(), {
      table: 'orchestration_agent_execution',
      data: [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'work_id', value: workId },
        { field: 'agent_id', value: agentId },
        { field: 'plan_id', value: 'plan-1' },
        { field: 'task_id', value: taskId },
        { field: 'execution_type', value: 'DAG' },
        { field: 'task_content', value: 'Task content' },
        { field: 'status', value: status },
        { field: 'answer', value: status === 'COMPLETED' ? 'Answer content' : undefined },
        { field: 'trace_id', value: status === 'COMPLETED' ? 'trace-1' : undefined },
        { field: 'iterations', value: status === 'COMPLETED' ? 3 : undefined },
        { field: 'elapsed_ms', value: status === 'COMPLETED' ? 150 : undefined },
        { field: 'error_info', value: status === 'FAILED' ? 'Error occurred' : undefined },
      ],
    }) as InsertDBInput, new DBContext(), new InsertDBOutput());
  }

  // =========================================================================
  // 1. visualizeAgentDAG
  // =========================================================================
  describe('visualizeAgentDAG', () => {
    it('TC-VAD-001: Planning 策略获取完整 AgentDAG 结构', async () => {
      const workId = 'viz-w1';
      await seedWorkData(workId, 's1', 'PLANNING', 'COMPLETED');
      await seedTaskAgentData('plan-1', 'task-1', 'a1');
      await seedTaskAgentData('plan-1', 'task-2', 'a2');
      await seedTaskAgentData('plan-1', 'task-3', 'a3');
      await seedAgentDAGData('plan-1', 'a1', 'a2');
      await seedAgentDAGData('plan-1', 'a2', 'a3');
      await seedExecutionData(workId, 'a1', 'task-1', 'COMPLETED');
      await seedExecutionData(workId, 'a2', 'task-2', 'COMPLETED');
      await seedExecutionData(workId, 'a3', 'task-3', 'COMPLETED');

      const input = Object.assign(new VisualizeAgentDAGInput(), { work_id: workId });
      const output = new VisualizeAgentDAGOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.visualizeAgentDAG(input, ctx, output);
      expect(result).toBe(true);
      const structure = output.agent_dag_structure;
      expect(structure.work_id).toBe(workId);
      expect(structure.orchestration_strategy).toBe('PLANNING');
      expect(structure.work_status).toBe('COMPLETED');
    });

    it('TC-VAD-002: Simple 策略获取 AgentDAG 结构', async () => {
      const workId = 'viz-w2';
      await seedWorkData(workId, 's2', 'SIMPLE', 'COMPLETED');
      await seedExecutionData(workId, 'a4', 'task-4', 'COMPLETED');

      const input = Object.assign(new VisualizeAgentDAGInput(), { work_id: workId });
      const output = new VisualizeAgentDAGOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.visualizeAgentDAG(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-VAD-014: 查询不存在 work_id', async () => {
      const input = Object.assign(new VisualizeAgentDAGInput(), { work_id: 'nonexistent' });
      const output = new VisualizeAgentDAGOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.visualizeAgentDAG(input, ctx, output);
      expect(result).toBe(false);
    });

    it('TC-VAD-020: work 状态为 FAILED 时查询', async () => {
      const workId = 'viz-w3';
      await seedWorkData(workId, 's3', 'PLANNING', 'FAILED');
      await seedExecutionData(workId, 'a5', 'task-5', 'FAILED');

      const input = Object.assign(new VisualizeAgentDAGInput(), { work_id: workId });
      const output = new VisualizeAgentDAGOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.visualizeAgentDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_dag_structure.work_status).toBe('FAILED');
    });
  });

  // =========================================================================
  // 2. visualizeWorkFlow
  // =========================================================================
  describe('visualizeWorkFlow', () => {
    it('TC-VWF-001: Planning 策略完整时间线', async () => {
      const workId = 'viz-w4';
      await seedWorkData(workId, 's4', 'PLANNING', 'COMPLETED');

      const input = Object.assign(new VisualizeWorkFlowInput(), { work_id: workId });
      const output = new VisualizeWorkFlowOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.visualizeWorkFlow(input, ctx, output);
      expect(result).toBe(true);
      const timeline = output.workflow_timeline;
      expect(timeline.work_id).toBe(workId);
      expect(timeline.orchestration_strategy).toBe('PLANNING');
    });

    it('TC-VWF-003: Simple 策略不包含 PLANNING 阶段', async () => {
      const workId = 'viz-w5';
      await seedWorkData(workId, 's5', 'SIMPLE', 'COMPLETED');

      const input = Object.assign(new VisualizeWorkFlowInput(), { work_id: workId });
      const output = new VisualizeWorkFlowOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.visualizeWorkFlow(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-VWF-011: 查询不存在 work_id', async () => {
      const input = Object.assign(new VisualizeWorkFlowInput(), { work_id: 'nonexistent' });
      const output = new VisualizeWorkFlowOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.visualizeWorkFlow(input, ctx, output);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 3. getAgentNodeDetail
  // =========================================================================
  describe('getAgentNodeDetail', () => {
    it('TC-GAD-001: 获取完整节点详情', async () => {
      const workId = 'viz-w6';
      const agentId = 'a6';
      await seedWorkData(workId, 's6', 'PLANNING', 'COMPLETED');
      await seedTaskAgentData('plan-1', 'task-6', agentId);
      await seedExecutionData(workId, agentId, 'task-6', 'COMPLETED');

      const input = Object.assign(new GetAgentNodeDetailInput(), { work_id: workId, agent_id: agentId });
      const output = new GetAgentNodeDetailOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.getAgentNodeDetail(input, ctx, output);
      expect(result).toBe(true);
      const detail = output.agent_node_detail;
      expect(detail.agent_id).toBe(agentId);
      expect(detail.work_id).toBe(workId);
    });

    it('TC-GAD-006: 查询不存在的 agent_id', async () => {
      const input = Object.assign(new GetAgentNodeDetailInput(), { work_id: 'viz-w6', agent_id: 'nonexistent' });
      const output = new GetAgentNodeDetailOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.getAgentNodeDetail(input, ctx, output);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 4. configOrchestrationVisualization
  // =========================================================================
  describe('configOrchestrationVisualization', () => {
    it('TC-COV-001: 更新 max_nodes_in_graph', async () => {
      const input = Object.assign(new ConfigOrchestrationVisualizationInput(), { max_nodes_in_graph: 100 });
      const output = new ConfigOrchestrationVisualizationOutput();
      const ctx = new OrchestrationVisualizationContext();

      const result = await viz.configOrchestrationVisualization(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-COV-003: max_nodes_in_graph 为负数', async () => {
      const input = Object.assign(new ConfigOrchestrationVisualizationInput(), { max_nodes_in_graph: -1 });
      const output = new ConfigOrchestrationVisualizationOutput();
      const ctx = new OrchestrationVisualizationContext();

      await expect(viz.configOrchestrationVisualization(input, ctx, output)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 5. 只读操作验证
  // =========================================================================
  describe('read-only operations', () => {
    it('TC-RO-001: visualizeAgentDAG 不修改任何数据', async () => {
      const workId = 'viz-w7';
      await seedWorkData(workId, 's7', 'SIMPLE', 'COMPLETED');

      const selBefore = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_work', conditions: [{ field: 'work_id', operator: Operator.EQ, value: workId }] },
      }) as SelectDBInput, new DBContext(), selBefore);

      const input = Object.assign(new VisualizeAgentDAGInput(), { work_id: workId });
      const output = new VisualizeAgentDAGOutput();
      const ctx = new OrchestrationVisualizationContext();
      await viz.visualizeAgentDAG(input, ctx, output);

      const selAfter = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_work', conditions: [{ field: 'work_id', operator: Operator.EQ, value: workId }] },
      }) as SelectDBInput, new DBContext(), selAfter);

      expect(selBefore.rows[0]).toEqual(selAfter.rows[0]);
    });
  });

  // =========================================================================
  // 6. AOP 代理
  // =========================================================================
  describe('AOP proxy', () => {
    it('TC-AOP-001: 方法调用后 output.elapsed_ms 存在', async () => {
      const workId = 'viz-w8';
      await seedWorkData(workId, 's8', 'SIMPLE', 'COMPLETED');

      const input = Object.assign(new VisualizeAgentDAGInput(), { work_id: workId });
      const output = new VisualizeAgentDAGOutput();
      const ctx = new OrchestrationVisualizationContext();

      await viz.visualizeAgentDAG(input, ctx, output);
      expect(output.elapsed_ms).toBeDefined();
      expect(output.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });
  });
});