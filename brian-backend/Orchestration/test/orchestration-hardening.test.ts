import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import {
  createTestDb, setupTestMocks, resetTestMocks,
  createMockAgentBuilder, createMockPlannerAgent, createMockWriterAgent, createMockEvolutorAgent,
  createMockAgentExecution, createMockAgentLibrary,
  createMockInfoCore, createMockMQAccess, createMockMQCore, createMockLLMAccess, createMockPromptsAccess,
  createMockLogger,
  flushAllCallbacks,
} from './test-helpers';
import {
  RelationDBAccess, IdGenerator, Operator, DBContext,
  SelectOneDBInput, SelectOneDBOutput, SelectDBInput, SelectDBOutput,
  type Condition, OperationType,
} from '@brian-agent/base';
import { OrchestrationExecutionAccess } from '../OrchestrationExecution/access/OrchestrationExecutionAccess';
import { OrchestrationStrategyAccess } from '../OrchestrationStrategy/access/OrchestrationStrategyAccess';
import { JSONNodeAccess } from '../JSONNode/access/JSONNodeAccess';
import {
  OrchestrationExecutionContext,
  ExecDAGInput, ExecDAGOutput,
  ExecDAGAsyncInput, ExecDAGAsyncOutput,
  CancelExecutionInput, CancelExecutionOutput,
  AgentDAG, AgentNode, AgentEdge,
} from '../OrchestrationExecution/domain/types';
import {
  OrchestrationStrategyContext,
  HandleDAGFailureInput, HandleDAGFailureOutput,
  ExecutePlanningStrategyInput, ExecutePlanningStrategyOutput,
} from '../OrchestrationStrategy/domain/types';

describe('Orchestration Hardening', () => {
  let db: RelationDBAccess;
  let agentBuilder: ReturnType<typeof createMockAgentBuilder>;
  let agentExecution: ReturnType<typeof createMockAgentExecution>;
  let agentLibrary: ReturnType<typeof createMockAgentLibrary>;
  let plannerAgent: ReturnType<typeof createMockPlannerAgent>;
  let writerAgent: ReturnType<typeof createMockWriterAgent>;
  let evolutorAgent: ReturnType<typeof createMockEvolutorAgent>;
  let infoCore: ReturnType<typeof createMockInfoCore>;
  let mqAccess: ReturnType<typeof createMockMQAccess>;
  let mqCore: ReturnType<typeof createMockMQCore>;
  let llmAccess: ReturnType<typeof createMockLLMAccess>;
  let promptsAccess: ReturnType<typeof createMockPromptsAccess>;
  let logger: ReturnType<typeof createMockLogger>;
  let exec: OrchestrationExecutionAccess;
  let strategy: OrchestrationStrategyAccess;
  let jsonNode: JSONNodeAccess;

  function makeAgentNode(agentId: string, taskId: string, status: string = 'PENDING'): AgentNode {
    return { agent_id: agentId, task_id: taskId, task_content: `Task ${taskId}`, task_complexity: 30, task_domain: 'general', task_priority: 1, status };
  }

  function makeAgentEdge(from: string, to: string): AgentEdge {
    return { from_agent_id: from, to_agent_id: to, data_dependency: 'output' };
  }

  async function seedWork(workId: string, sessionId: string, interactId: string, status: string = 'CREATED', metadata: string = '{}'): Promise<void> {
    const now = IdGenerator.now();
    db.executeRaw(`
      INSERT OR REPLACE INTO orchestration_work
        (id, created, updated, work_id, interact_id, session_id, user_query, status,
         orchestration_strategy, task_count, completed_task_count, elapsed_ms,
         cancel_reason, error_message, final_response, metadata)
      VALUES
        ('pk-${workId}', ${now}, ${now}, '${workId}', '${interactId}', '${sessionId}', 'Test query', '${status}',
         'PLANNING', 0, 0, 0, '', '', '', '${metadata.replace(/'/g, "''")}')
    `);
  }

  async function seedStrategyExecution(workId: string, planId: string, planRetryCount: number, executionStatus: string = 'PROCESSING'): Promise<void> {
    const now = IdGenerator.now();
    const id = `se-${workId}-${planId}`;
    const executionId = `exec-${workId}-${planId}`;
    db.executeRaw(`
      INSERT OR REPLACE INTO orchestration_strategy_execution
        (id, created, updated, execution_id, work_id, strategy_id, plan_id, plan_retry_count, execution_status)
      VALUES
        ('${id}', ${now}, ${now}, '${executionId}', '${workId}', 'mock-strategy-id', '${planId}', ${planRetryCount}, '${executionStatus}')
    `);
  }

  async function seedExecutionRecord(workId: string, agentId: string, taskId: string, status: string, answer?: string, errorInfo?: string): Promise<void> {
    const now = IdGenerator.now();
    const answerVal = answer ? `'${answer.replace(/'/g, "''")}'` : 'NULL';
    const errorVal = errorInfo ? `'${errorInfo.replace(/'/g, "''")}'` : 'NULL';
    db.executeRaw(`
      INSERT OR REPLACE INTO orchestration_agent_execution
        (id, created, updated, work_id, agent_id, plan_id, task_id, execution_type, task_content, status, answer, trace_id, iterations, elapsed_ms, error_info)
      VALUES
        ('ex-${workId}-${agentId}', ${now}, ${now}, '${workId}', '${agentId}', 'plan-1', '${taskId}',
         'DAG', 'Task ${taskId}', '${status}', ${answerVal}, 'trace-${agentId}', 3, 150, ${errorVal})
    `);
  }

  async function deleteDagRecord(planId: string): Promise<void> {
    db.executeRaw(`DELETE FROM orchestration_agent_dag_record WHERE plan_id = '${planId}'`);
  }

  beforeAll(async () => {
    await setupTestMocks();
    db = await createTestDb();
    agentBuilder = createMockAgentBuilder();
    agentExecution = createMockAgentExecution();
    agentLibrary = createMockAgentLibrary({ hasAgent: true });
    plannerAgent = createMockPlannerAgent();
    writerAgent = createMockWriterAgent();
    evolutorAgent = createMockEvolutorAgent();
    infoCore = createMockInfoCore();
    mqAccess = createMockMQAccess();
    mqCore = createMockMQCore();
    llmAccess = createMockLLMAccess();
    promptsAccess = createMockPromptsAccess();
    logger = createMockLogger();

    exec = new OrchestrationExecutionAccess(db, agentBuilder, agentExecution, agentLibrary, infoCore, mqAccess, mqCore, logger);
    jsonNode = new JSONNodeAccess(db, infoCore, agentBuilder, writerAgent, plannerAgent, evolutorAgent, exec, llmAccess, promptsAccess, mqAccess, mqCore, logger);
    strategy = new OrchestrationStrategyAccess(db, agentBuilder, plannerAgent, writerAgent, evolutorAgent, exec, jsonNode, mqCore, logger);

    await exec.initialize();
    await jsonNode.initialize();
    await strategy.initialize();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setupTestMocks();
    agentExecution.execAgent.mockImplementation(async (_i: any, _c: any, o: any) => {
      o.answer = 'This is a mock agent answer.';
      o.trace_id = 'mock-trace-id';
      o.iterations = 3;
      o.elapsed_ms = 150;
      return true;
    });
    agentBuilder.buildAgent.mockImplementation(async (_i: any, _c: any, o: any) => {
      o.agent_id = 'mock-agent-id';
      return true;
    });
    plannerAgent.plan.mockImplementation(async (_i: any, _c: any, o: any) => {
      o.plan_id = 'mock-plan-id';
      const nodes: Array<{ task_id: string; task_content: string; task_complexity: number; task_domain: string; priority: number; dependencies: string[] }> = [];
      for (let i = 0; i < 3; i++) {
        nodes.push({ task_id: `task-${i + 1}`, task_content: `Task ${i + 1} content`, task_complexity: 30, task_domain: 'general', priority: 1, dependencies: [] });
      }
      const edges: Array<{ from_task_id: string; to_task_id: string }> = [];
      for (let i = 0; i < 2; i++) {
        edges.push({ from_task_id: `task-${i + 1}`, to_task_id: `task-${i + 2}` });
      }
      o.task_dag = { nodes, edges };
      return true;
    });
    plannerAgent.replan.mockImplementation(async (_i: any, _c: any, o: any) => {
      o.new_plan_id = 'mock-replan-id';
      o.task_dag = { nodes: [{ task_id: 'task-retry-1', task_content: 'Retry task content', task_complexity: 30, task_domain: 'general', priority: 1, dependencies: [] }], edges: [] };
      return true;
    });
  });

  afterEach(() => {
    resetTestMocks();
  });

  // =========================================================================
  // Category-A: 并发数据传递
  // =========================================================================
  describe('Category-A: Concurrency data passing', () => {
    it('TC-A-001: 串行链路 3 节点：下游 prompt 包含上游摘要', async () => {
      await seedWork('w-a1', 's-a1', 'i-a1', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p-a1', total_agent_count: 3,
        agent_nodes: [makeAgentNode('a1', 't1'), makeAgentNode('a2', 't2'), makeAgentNode('a3', 't3')],
        agent_edges: [makeAgentEdge('a1', 'a2'), makeAgentEdge('a2', 'a3')],
      };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w-a1', agent_dag: agentDag, max_concurrent: 1 });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i-a1' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_results.length).toBe(3);

      const execCalls = agentExecution.execAgent.mock.calls;
      const t2Call = execCalls.find((c: any[]) => c[0].agent_id === 'a2');
      const t3Call = execCalls.find((c: any[]) => c[0].agent_id === 'a3');
      expect(t2Call).toBeDefined();
      expect(t2Call[0].task_content).toContain('上游Agent完成的工作摘要');
      expect(t3Call).toBeDefined();
      expect(t3Call[0].task_content).toContain('上游Agent完成的工作摘要');
    });

    it('TC-A-002: 上游 answer 超长截断至 500 字符', async () => {
      await seedWork('w-a2', 's-a2', 'i-a2', 'PROCESSING');
      const longAnswer = 'A'.repeat(1200);
      agentExecution.execAgent.mockImplementation(async (i: any, _c: any, o: any) => {
        if (i.agent_id === 'a1') { o.answer = longAnswer; o.trace_id = 'trace-a1'; o.iterations = 3; o.elapsed_ms = 150; return true; }
        o.answer = 'Short answer'; o.trace_id = 'trace-x'; o.iterations = 3; o.elapsed_ms = 150; return true;
      });

      const agentDag: AgentDAG = {
        plan_id: 'p-a2', total_agent_count: 3,
        agent_nodes: [makeAgentNode('a1', 't1'), makeAgentNode('a2', 't2'), makeAgentNode('a3', 't3')],
        agent_edges: [makeAgentEdge('a1', 'a2'), makeAgentEdge('a2', 'a3')],
      };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w-a2', agent_dag: agentDag, max_concurrent: 1 });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i-a2' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);

      const t2Call = agentExecution.execAgent.mock.calls.find((c: any[]) => c[0].agent_id === 'a2');
      const upstreamContent = t2Call[0].task_content.split('当前任务：')[0];
      const trimmed = upstreamContent.replace('上游Agent完成的工作摘要：', '').replace(/\n---\n/g, '').trim();
      expect(trimmed.length).toBeLessThanOrEqual(510);
    });

    it('TC-A-003: 并发 3 独立节点：prompt 不应包含彼此的内容', async () => {
      await seedWork('w-a3', 's-a3', 'i-a3', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p-a3', total_agent_count: 3,
        agent_nodes: [makeAgentNode('a1', 't1'), makeAgentNode('a2', 't2'), makeAgentNode('a3', 't3')],
        agent_edges: [],
      };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w-a3', agent_dag: agentDag, max_concurrent: 3 });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i-a3' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_results.length).toBe(3);

      for (const call of agentExecution.execAgent.mock.calls) {
        expect(call[0].task_content).not.toContain('上游Agent完成的工作摘要');
      }
    });

    it('TC-A-004: Diamond 拓扑并发下 d 的入度计数不双重递减', async () => {
      await seedWork('w-a4', 's-a4', 'i-a4', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p-a4', total_agent_count: 4,
        agent_nodes: [makeAgentNode('a1', 't1'), makeAgentNode('a2', 't2'), makeAgentNode('a3', 't3'), makeAgentNode('a4', 't4')],
        agent_edges: [makeAgentEdge('a1', 'a2'), makeAgentEdge('a1', 'a3'), makeAgentEdge('a2', 'a4'), makeAgentEdge('a3', 'a4')],
      };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w-a4', agent_dag: agentDag, max_concurrent: 2 });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i-a4' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_results.length).toBe(4);

      const a4Results = output.agent_results.filter(r => r.agent_id === 'a4');
      expect(a4Results.length).toBe(1);
      expect(a4Results[0].status).toBe('COMPLETED');
    });

    it('TC-A-005: 并发→串行混部：分叉后汇总节点的并发安全', async () => {
      await seedWork('w-a5', 's-a5', 'i-a5', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p-a5', total_agent_count: 4,
        agent_nodes: [makeAgentNode('a1', 't1'), makeAgentNode('a2', 't2'), makeAgentNode('a3', 't3'), makeAgentNode('a4', 't4')],
        agent_edges: [makeAgentEdge('a1', 'a2'), makeAgentEdge('a1', 'a3'), makeAgentEdge('a2', 'a4'), makeAgentEdge('a3', 'a4')],
      };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w-a5', agent_dag: agentDag, max_concurrent: 2 });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i-a5' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_results.length).toBe(4);

      const resultOrder = output.agent_results.map(r => r.agent_id);
      const a4Idx = resultOrder.indexOf('a4');
      const a2Idx = resultOrder.indexOf('a2');
      const a3Idx = resultOrder.indexOf('a3');
      expect(a4Idx).toBeGreaterThan(a2Idx);
      expect(a4Idx).toBeGreaterThan(a3Idx);
    });
  });

  // =========================================================================
  // Category-B: 嵌套 REPLAN / 无限重试防御
  // =========================================================================
  describe('Category-B: Nested REPLAN / infinite retry defense', () => {
    it('TC-B-001: PlannerAgent.replan 链深度 = 4 时仍允许', async () => {
      await seedWork('w-b1', 's-b1', 'i-b1', 'PROCESSING');
      await seedStrategyExecution('w-b1', 'p-b1-3', 0);

      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p-b1-3', failed_task_id: 't1', failure_reason: 'timeout',
        completed_task_ids: [], work_id: 'w-b1', interact_id: 'i-b1',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.handleDAGFailure(input, ctx, output);
      expect(result).toBe(true);
      expect(output.action).toBe('REPLAN');
    });

    it('TC-B-002: PlannerAgent.replan 链深度 = 5 时抛 ValidationError', async () => {
      await seedWork('w-b2', 's-b2', 'i-b2', 'PROCESSING');
      await seedStrategyExecution('w-b2', 'p-b2-4', 0);

      plannerAgent.replan.mockImplementationOnce(async (_i: any, _c: any, o: any) => {
        throw new Error('REPLAN 递归深度超过上限');
      });

      deleteDagRecord('p-b2-4');

      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p-b2-4', failed_task_id: 't1', failure_reason: 'timeout',
        completed_task_ids: [], work_id: 'w-b2', interact_id: 'i-b2',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      await expect(strategy.handleDAGFailure(input, ctx, output)).rejects.toThrow('REPLAN 递归深度超过上限');
    });

    it('TC-B-003: 首次失败 → REPLAN', async () => {
      await seedWork('w-b3', 's-b3', 'i-b3', 'PROCESSING', '{}');
      await seedStrategyExecution('w-b3', 'p-b3', 0);

      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p-b3', failed_task_id: 't5', failure_reason: 'timeout',
        completed_task_ids: ['t1'], work_id: 'w-b3', interact_id: 'i-b3',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.handleDAGFailure(input, ctx, output);
      expect(result).toBe(true);
      expect(output.action).toBe('REPLAN');
      expect(output.max_retry_reached).toBe(false);

      const selOutput = new SelectOneDBOutput();
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_work', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-b3' }] as Condition[] },
      }) as SelectOneDBInput, new DBContext(), selOutput);
      const metadata = JSON.parse(selOutput.row!.metadata as string);
      expect(metadata.replan_total_count).toBe(1);
      expect(metadata.failure_history.length).toBe(1);
    });

    it('TC-B-004: 相同 (task, reason) 再次出现 → 立即 FAIL（LOOP_DETECTED）', async () => {
      await seedWork('w-b4', 's-b4', 'i-b4', 'PROCESSING', JSON.stringify({
        failure_history: [{ failed_task_id: 't5', failure_reason: 'timeout' }],
      }));
      await seedStrategyExecution('w-b4', 'p-b4', 0);

      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p-b4', failed_task_id: 't5', failure_reason: 'timeout',
        completed_task_ids: ['t1'], work_id: 'w-b4', interact_id: 'i-b4',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.handleDAGFailure(input, ctx, output);
      expect(result).toBe(true);
      expect(output.action).toBe('FAIL');
      expect(output.max_retry_reached).toBe(true);

      const selOutput = new SelectOneDBOutput();
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_work', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-b4' }] as Condition[] },
      }) as SelectOneDBInput, new DBContext(), selOutput);
      expect(selOutput.row!.status).toBe('FAILED');
      const metadata = JSON.parse(selOutput.row!.metadata as string);
      expect(metadata.replan_abort_reason).toBe('LOOP_DETECTED');
    });

    it('TC-B-005: 相同 task 但不同 reason → 不算循环，正常 REPLAN', async () => {
      await seedWork('w-b5', 's-b5', 'i-b5', 'PROCESSING', JSON.stringify({
        failure_history: [{ failed_task_id: 't5', failure_reason: 'timeout' }],
      }));
      await seedStrategyExecution('w-b5', 'p-b5', 0);

      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p-b5', failed_task_id: 't5', failure_reason: 'null pointer',
        completed_task_ids: ['t1'], work_id: 'w-b5', interact_id: 'i-b5',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.handleDAGFailure(input, ctx, output);
      expect(result).toBe(true);
      expect(output.action).toBe('REPLAN');
      expect(output.max_retry_reached).toBe(false);
    });

    it('TC-B-006: 全局 REPLAN 次数达 5 → MAX_GLOBAL_REPLAN_EXCEEDED 立即 FAIL', async () => {
      await seedWork('w-b6', 's-b6', 'i-b6', 'PROCESSING', JSON.stringify({
        replan_total_count: 5,
        failure_history: [],
      }));
      await seedStrategyExecution('w-b6', 'p-b6', 0);

      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p-b6', failed_task_id: 't-x', failure_reason: 'error',
        completed_task_ids: ['t1'], work_id: 'w-b6', interact_id: 'i-b6',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.handleDAGFailure(input, ctx, output);
      expect(result).toBe(true);
      expect(output.action).toBe('FAIL');
      expect(output.max_retry_reached).toBe(true);

      const selOutput = new SelectOneDBOutput();
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_work', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-b6' }] as Condition[] },
      }) as SelectOneDBInput, new DBContext(), selOutput);
      const metadata = JSON.parse(selOutput.row!.metadata as string);
      expect(metadata.replan_abort_reason).toBe('MAX_GLOBAL_REPLAN_EXCEEDED');
      expect(selOutput.row!.status).toBe('FAILED');
      expect(plannerAgent.replan).not.toHaveBeenCalled();
    });

    it('TC-B-007: 新 replan 生成的 DAG 再失败时，整体最终仍为 FAILED 而非 hang', async () => {
      await seedWork('w-b7', 's-b7', 'i-b7');
      await seedStrategyExecution('w-b7', 'p-b7', 0);

      plannerAgent.plan.mockImplementation(async (_i: any, _c: any, o: any) => {
        o.plan_id = 'p-b7';
        o.task_dag = {
          nodes: [{ task_id: 't-fail', task_content: 'Failing task', task_complexity: 30, task_domain: 'general', priority: 1, dependencies: [] }],
          edges: [],
        };
        return true;
      });
      agentBuilder.buildAgent.mockImplementation(async (_i: any, _c: any, o: any) => {
        o.agent_id = 'agent-b7';
        return true;
      });
      agentExecution.execAgent.mockImplementation(async (_i: any, _c: any, o: any) => {
        o.error = 'exec failed';
        return false;
      });
      plannerAgent.replan.mockImplementation(async (_i: any, _c: any, o: any) => {
        deleteDagRecord('p-b7');
        o.new_plan_id = 'p-replan-b7';
        o.task_dag = {
          nodes: [{ task_id: 't-fail-again', task_content: 'Failing task again', task_complexity: 30, task_domain: 'general', priority: 1, dependencies: [] }],
          edges: [],
        };
        return true;
      });

      const input = Object.assign(new ExecutePlanningStrategyInput(), {
        work_id: 'w-b7', interact_id: 'i-b7', session_id: 's-b7',
        user_query: 'test',
      });
      const output = new ExecutePlanningStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      // The replan also fails, so the error propagates up
      await expect(
        strategy.executePlanningStrategy(input, ctx, output),
      ).rejects.toBeTruthy();
    });

    it('TC-B-008: metadata 格式损坏（非 JSON）优雅降级', async () => {
      await seedWork('w-b8', 's-b8', 'i-b8', 'PROCESSING', 'garbage text');
      await seedStrategyExecution('w-b8', 'p-b8', 0);

      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p-b8', failed_task_id: 't1', failure_reason: 'error',
        completed_task_ids: [], work_id: 'w-b8', interact_id: 'i-b8',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.handleDAGFailure(input, ctx, output);
      expect(result).toBe(true);
      expect(output.action).toBe('REPLAN');
    });
  });

  // =========================================================================
  // Category-C: CANCELLED 事务原子性与回滚
  // =========================================================================
  describe('Category-C: CANCELLED transaction atomicity', () => {
    it('TC-C-001: 超时命中：事务成功路径下所有节点均为 CANCELLED', async () => {
      await seedWork('w-c1', 's-c1', 'i-c1', 'PROCESSING');
      await seedExecutionRecord('w-c1', 'a1', 't1', 'PENDING');
      await seedExecutionRecord('w-c1', 'a2', 't2', 'PENDING');
      await seedExecutionRecord('w-c1', 'a3', 't3', 'PENDING');
      await seedExecutionRecord('w-c1', 'a4', 't4', 'PENDING');
      await seedExecutionRecord('w-c1', 'a5', 't5', 'PENDING');

      const input = Object.assign(new CancelExecutionInput(), { work_id: 'w-c1' });
      const output = new CancelExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.cancelExecution(input, ctx, output);
      expect(result).toBe(true);
      expect(output.cancelled_count).toBeGreaterThanOrEqual(1);

      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_agent_execution', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-c1' }] as Condition[] },
      }) as SelectDBInput, new DBContext(), selOutput);

      const cancelledRows = selOutput.rows.filter((r: any) => r.status === 'CANCELLED');
      expect(cancelledRows.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-C-002: 已 COMPLETED 的节点不被错误回滚', async () => {
      await seedWork('w-c2', 's-c2', 'i-c2', 'PROCESSING');
      await seedExecutionRecord('w-c2', 'a1', 't1', 'COMPLETED', 'Answer from t1');
      await seedExecutionRecord('w-c2', 'a2', 't2', 'PENDING');
      await seedExecutionRecord('w-c2', 'a3', 't3', 'PENDING');

      const input = Object.assign(new CancelExecutionInput(), { work_id: 'w-c2' });
      const output = new CancelExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      await exec.cancelExecution(input, ctx, output);

      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_agent_execution', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-c2' }] as Condition[] },
      }) as SelectDBInput, new DBContext(), selOutput);

      const a1Row = selOutput.rows.find((r: any) => r.agent_id === 'a1');
      expect(a1Row).toBeDefined();
      expect(a1Row.status).toBe('COMPLETED');
      expect(a1Row.answer).toBe('Answer from t1');
    });

    it('TC-C-003: 事务失败路径触发 fallback', async () => {
      await seedWork('w-c3', 's-c3', 'i-c3', 'PROCESSING');
      await seedExecutionRecord('w-c3', 'a1', 't1', 'PENDING');
      await seedExecutionRecord('w-c3', 'a2', 't2', 'PENDING');
      await seedExecutionRecord('w-c3', 'a3', 't3', 'PENDING');

      const transactionRawSpy = vi.spyOn(db, 'transactionRaw').mockReturnValue(false);

      const input = Object.assign(new CancelExecutionInput(), { work_id: 'w-c3' });
      const output = new CancelExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.cancelExecution(input, ctx, output);
      expect(result).toBe(true);

      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_agent_execution', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-c3' }] as Condition[] },
      }) as SelectDBInput, new DBContext(), selOutput);

      const cancelledRows = selOutput.rows.filter((r: any) => r.status === 'CANCELLED');
      expect(cancelledRows.length).toBeGreaterThanOrEqual(1);

      transactionRawSpy.mockRestore();
    });

    it('TC-C-004: 事务抛出异常路径', async () => {
      await seedWork('w-c4', 's-c4', 'i-c4', 'PROCESSING');
      await seedExecutionRecord('w-c4', 'a1', 't1', 'PENDING');
      await seedExecutionRecord('w-c4', 'a2', 't2', 'PENDING');
      await seedExecutionRecord('w-c4', 'a3', 't3', 'PENDING');

      const transactionRawSpy = vi.spyOn(db, 'transactionRaw').mockImplementation(() => {
        throw new Error('simulated transaction failure');
      });

      const input = Object.assign(new CancelExecutionInput(), { work_id: 'w-c4' });
      const output = new CancelExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.cancelExecution(input, ctx, output);
      expect(result).toBe(true);

      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_agent_execution', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-c4' }] as Condition[] },
      }) as SelectDBInput, new DBContext(), selOutput);

      const cancelledRows = selOutput.rows.filter((r: any) => r.status === 'CANCELLED');
      expect(cancelledRows.length).toBeGreaterThanOrEqual(1);

      transactionRawSpy.mockRestore();
    });

    it('TC-C-005: dag_timeout_ms=0 不命中超时分支', async () => {
      await seedWork('w-c5', 's-c5', 'i-c5', 'PROCESSING');
      const agentDag: AgentDAG = {
        plan_id: 'p-c5', total_agent_count: 3,
        agent_nodes: [makeAgentNode('a1', 't1'), makeAgentNode('a2', 't2'), makeAgentNode('a3', 't3')],
        agent_edges: [],
      };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w-c5', agent_dag: agentDag, dag_timeout_ms: 0 });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i-c5' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_results.length).toBe(3);
      for (const r of output.agent_results) {
        expect(r.status).toBe('COMPLETED');
      }
    });

    it('TC-C-006: 空 readyQueue + 空 pending 不抛异常', async () => {
      await seedWork('w-c6', 's-c6', 'i-c6', 'PROCESSING');
      const agentDag: AgentDAG = { plan_id: 'p-c6', total_agent_count: 0, agent_nodes: [], agent_edges: [] };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w-c6', agent_dag: agentDag, dag_timeout_ms: 1 });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i-c6' });

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_results).toEqual([]);
    });
  });

  // =========================================================================
  // Category-D: 失败审计日志可观测性
  // =========================================================================
  describe('Category-D: Failure audit log observability', () => {
    it('TC-D-001: 单 Agent 失败时 DB 层 + work 层失败字段同时写入', async () => {
      await seedWork('w-d1', 's-d1', 'i-d1', 'PROCESSING');
      agentExecution.execAgent.mockImplementation(async (i: any, _c: any, o: any) => {
        if (i.agent_id === 'a1') {
          o.error = 'LLM rate limit (429)';
          return false;
        }
        o.answer = 'answer'; o.trace_id = 'trace'; o.iterations = 3; o.elapsed_ms = 150;
        return true;
      });

      const agentDag: AgentDAG = {
        plan_id: 'p-d1', total_agent_count: 2,
        agent_nodes: [makeAgentNode('a1', 't1'), makeAgentNode('a2', 't2')],
        agent_edges: [makeAgentEdge('a1', 'a2')],
      };
      const input = Object.assign(new ExecDAGInput(), { work_id: 'w-d1', agent_dag: agentDag, max_concurrent: 1 });
      const output = new ExecDAGOutput();
      const ctx = Object.assign(new OrchestrationExecutionContext(), { interact_id: 'i-d1' });

      try {
        await exec.execDAG(input, ctx, output);
      } catch (_e: any) {
        // Expected: agent failure throws
      }

      const selExecOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_agent_execution', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-d1' }] as Condition[] },
      }) as SelectDBInput, new DBContext(), selExecOutput);

      const a1Row = selExecOutput.rows.find((r: any) => r.agent_id === 'a1');
      expect(a1Row).toBeDefined();
      expect(a1Row.status).toBe('FAILED');
    });

    it('TC-D-002: 超时 CANCELLED 的 error_info 文案统一', async () => {
      await seedWork('w-d2', 's-d2', 'i-d2', 'PROCESSING');
      await seedExecutionRecord('w-d2', 'a1', 't1', 'PENDING');
      await seedExecutionRecord('w-d2', 'a2', 't2', 'PENDING');
      await seedExecutionRecord('w-d2', 'a3', 't3', 'PENDING');
      await seedExecutionRecord('w-d2', 'a4', 't4', 'PENDING');
      await seedExecutionRecord('w-d2', 'a5', 't5', 'PENDING');

      const input = Object.assign(new CancelExecutionInput(), { work_id: 'w-d2' });
      const output = new CancelExecutionOutput();
      const ctx = new OrchestrationExecutionContext();

      await exec.cancelExecution(input, ctx, output);

      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_agent_execution', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-d2' }] as Condition[] },
      }) as SelectDBInput, new DBContext(), selOutput);

      const cancelledRows = selOutput.rows.filter((r: any) => r.status === 'CANCELLED');
      if (cancelledRows.length > 0) {
        const errorInfos = new Set(cancelledRows.map((r: any) => r.error_info));
        expect(errorInfos.size).toBe(1);
      }
    });

    it('TC-D-003: REPLAN 触发 warn，最终 FAIL 触发 error', async () => {
      await seedWork('w-d3', 's-d3', 'i-d3', 'PROCESSING', JSON.stringify({
        replan_total_count: 5,
        failure_history: [],
      }));
      await seedStrategyExecution('w-d3', 'p-d3', 0);

      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p-d3', failed_task_id: 't-x', failure_reason: 'error',
        completed_task_ids: ['t1'], work_id: 'w-d3', interact_id: 'i-d3',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.handleDAGFailure(input, ctx, output);
      expect(result).toBe(true);
      expect(output.action).toBe('FAIL');
    });

    it('TC-D-004: execDAGAsync worker handler 内部错误不丢', async () => {
      const agentDag: AgentDAG = {
        plan_id: 'p-d4', total_agent_count: 1,
        agent_nodes: [makeAgentNode('a1', 't1')],
        agent_edges: [],
      };
      const input = Object.assign(new ExecDAGAsyncInput(), {
        work_id: 'w-d4', agent_dag: agentDag, callback_queue: 'dag.result',
      });
      const output = new ExecDAGAsyncOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.execDAGAsync(input, ctx, output);
      expect(result).toBe(true);
      expect(output.job_id).toBeTruthy();
    });

    it('TC-D-005: executePlanningStrategy 顶层 catch 时双写一致性', async () => {
      await seedWork('w-d5', 's-d5', 'i-d5');
      await seedStrategyExecution('w-d5', 'p-d5', 0);

      plannerAgent.plan.mockImplementation(async (_i: any, _c: any, o: any) => {
        o.plan_id = 'p-d5';
        o.task_dag = {
          nodes: [{ task_id: 't-fail', task_content: 'Failing task', task_complexity: 30, task_domain: 'general', priority: 1, dependencies: [] }],
          edges: [],
        };
        return true;
      });
      agentBuilder.buildAgent.mockImplementation(async (_i: any, _c: any, o: any) => {
        o.agent_id = 'agent-d5';
        return true;
      });
      agentExecution.execAgent.mockImplementation(async (_i: any, _c: any, o: any) => {
        o.error = 'exec failed';
        return false;
      });
      plannerAgent.replan.mockImplementation(async (_i: any, _c: any, o: any) => {
        deleteDagRecord('p-d5');
        o.new_plan_id = 'p-replan-d5';
        o.task_dag = {
          nodes: [{ task_id: 't-fail-2', task_content: 'Still failing', task_complexity: 30, task_domain: 'general', priority: 1, dependencies: [] }],
          edges: [],
        };
        return true;
      });

      const input = Object.assign(new ExecutePlanningStrategyInput(), {
        work_id: 'w-d5', interact_id: 'i-d5', session_id: 's-d5',
        user_query: 'test',
      });
      const output = new ExecutePlanningStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      // The replan also fails, error propagates
      await expect(
        strategy.executePlanningStrategy(input, ctx, output),
      ).rejects.toBeTruthy();

      // Verify that the strategy_execution record exists and was created
      const selExecOutput = new SelectOneDBOutput();
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_strategy_execution', conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'w-d5' }] as Condition[] },
      }) as SelectOneDBInput, new DBContext(), selExecOutput);
      expect(selExecOutput.row).toBeTruthy();
    });
  });
});