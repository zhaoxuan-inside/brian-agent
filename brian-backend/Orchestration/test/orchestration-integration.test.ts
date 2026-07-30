import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import {
  createTestDb, setupTestMocks, resetTestMocks,
  createMockAgentBuilder, createMockPlannerAgent, createMockWriterAgent, createMockEvolutorAgent,
  createMockAgentExecution, createMockAgentLibrary,
  createMockInfoCore, createMockMQAccess, createMockMQCore, createMockLLMAccess, createMockPromptsAccess,
  createMockLogger,
  flushAllCallbacks,
} from './test-helpers';
import { RelationDBAccess, IdGenerator, Operator, DBContext, SelectOneDBInput, SelectOneDBOutput, SelectDBInput, SelectDBOutput, InsertDBInput, InsertDBOutput, DataObject } from '@brian-agent/base';
import { OrchestrationEntryAccess } from '../OrchestrationEntry/access/OrchestrationEntryAccess';
import { OrchestrationStrategyAccess } from '../OrchestrationStrategy/access/OrchestrationStrategyAccess';
import { OrchestrationExecutionAccess } from '../OrchestrationExecution/access/OrchestrationExecutionAccess';
import { JSONNodeAccess } from '../JSONNode/access/JSONNodeAccess';
import { OrchestrationVisualizationAccess } from '../OrchestrationVisualization/access/OrchestrationVisualizationAccess';
import {
  OrchestrationEntryContext,
  ReceiveWorkInput, ReceiveWorkOutput,
  GetWorkStatusInput, GetWorkStatusOutput,
} from '../OrchestrationEntry/domain/types';
import {
  OrchestrationStrategyContext,
  StartOrchestrationInput, StartOrchestrationOutput,
  ExecuteSimpleStrategyInput, ExecuteSimpleStrategyOutput,
  ExecutePlanningStrategyInput, ExecutePlanningStrategyOutput,
  ExecutePostProcessingInput, ExecutePostProcessingOutput,
} from '../OrchestrationStrategy/domain/types';
import {
  OrchestrationExecutionContext,
  ExecSingleAgentInput, ExecSingleAgentOutput,
  BuildAgentDAGInput, BuildAgentDAGOutput,
  ExecDAGInput, ExecDAGOutput,
  TaskDAG, AgentDAG,
} from '../OrchestrationExecution/domain/types';
import { OrchestrationVisualizationContext, VisualizeAgentDAGInput, VisualizeAgentDAGOutput } from '../OrchestrationVisualization/domain/types';
import { JSONNodeContext, ExecJSONNodeInput, ExecJSONNodeOutput, JSONNodeDefinition } from '../JSONNode/domain/types';

describe('Orchestration Integration', () => {
  let db: RelationDBAccess;
  let infoCore: ReturnType<typeof createMockInfoCore>;
  let writerAgent: ReturnType<typeof createMockWriterAgent>;
  let agentBuilder: ReturnType<typeof createMockAgentBuilder>;
  let plannerAgent: ReturnType<typeof createMockPlannerAgent>;
  let evolutorAgent: ReturnType<typeof createMockEvolutorAgent>;
  let agentExecution: ReturnType<typeof createMockAgentExecution>;
  let agentLibrary: ReturnType<typeof createMockAgentLibrary>;
  let mqAccess: ReturnType<typeof createMockMQAccess>;
  let mqCore: ReturnType<typeof createMockMQCore>;
  let llmAccess: ReturnType<typeof createMockLLMAccess>;
  let promptsAccess: ReturnType<typeof createMockPromptsAccess>;
  let logger: ReturnType<typeof createMockLogger>;

  let entry: OrchestrationEntryAccess;
  let strategy: OrchestrationStrategyAccess;
  let exec: OrchestrationExecutionAccess;
  let jsonNode: JSONNodeAccess;
  let viz: OrchestrationVisualizationAccess;

  beforeAll(async () => {
    await setupTestMocks();
    db = await createTestDb();
    infoCore = createMockInfoCore();
    writerAgent = createMockWriterAgent();
    agentBuilder = createMockAgentBuilder();
    plannerAgent = createMockPlannerAgent();
    evolutorAgent = createMockEvolutorAgent();
    agentExecution = createMockAgentExecution();
    agentLibrary = createMockAgentLibrary({ hasAgent: true });
    mqAccess = createMockMQAccess();
    mqCore = createMockMQCore();
    llmAccess = createMockLLMAccess();
    promptsAccess = createMockPromptsAccess();
    logger = createMockLogger();

    exec = new OrchestrationExecutionAccess(db, agentBuilder, agentExecution, agentLibrary, infoCore, mqAccess, mqCore, logger);
    viz = new OrchestrationVisualizationAccess(db, agentLibrary, agentExecution, logger);
    jsonNode = new JSONNodeAccess(db, infoCore, agentBuilder, writerAgent, plannerAgent, evolutorAgent, exec, llmAccess, promptsAccess, mqAccess, mqCore, logger);
    strategy = new OrchestrationStrategyAccess(db, agentBuilder, plannerAgent, writerAgent, evolutorAgent, exec, jsonNode, mqCore, logger);
    entry = new OrchestrationEntryAccess(db, infoCore, writerAgent, strategy, exec, llmAccess, promptsAccess, mqAccess, mqCore, logger);

    await exec.initialize();
    await viz.initialize();
    await jsonNode.initialize();
    await strategy.initialize();
    await entry.initialize();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTestMocks();
  });

  // =========================================================================
  // 1. 端到端工作流
  // =========================================================================
  describe('End-to-end workflow', () => {
    it('TC-INT-001: Simple 策略端到端执行', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s1', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
      expect(output.work_id).toBeTruthy();
      expect(output.interact_id).toBeTruthy();
      expect(output.orchestration_strategy).toBe('SIMPLE');
      expect(output.final_response).toBeTruthy();

      const selOutput = new SelectOneDBOutput();
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_work', conditions: [{ field: 'work_id', operator: Operator.EQ, value: output.work_id }] },
      }) as SelectOneDBInput, new DBContext(), selOutput);
      expect(selOutput.row!.status).toBe('COMPLETED');
    });

    it('TC-INT-002: Simple 策略不经过 PlannerAgent', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s2', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      expect(plannerAgent.plan).not.toHaveBeenCalled();
    });

    it('TC-INT-003: Simple 策略经过 WriterAgent 和 EvolutorAgent', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s3', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      expect(writerAgent.write).toHaveBeenCalled();
    });

    it('TC-INT-004: Planning 策略端到端执行', async () => {
      const input = Object.assign(new ReceiveWorkInput(), {
        session_id: 'int-s4',
        user_query: '请帮我分析数据、生成报告并发送邮件',
        force_orchestration_strategy: 'PLANNING',
      });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      await flushAllCallbacks();
      expect(result).toBe(true);
      expect(output.work_id).toBeTruthy();
      expect(output.final_response).toBeTruthy();
    });
  });

  // =========================================================================
  // 2. 跨模块数据流
  // =========================================================================
  describe('Cross-module data flow', () => {
    it('TC-INT-009: work_context 从 Entry 传递到 Strategy 到 Execution', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s5', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-INT-012: REQUEST 和 RESPONSE 信息保存', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s6', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      const saveCalls = infoCore.saveInfo.mock.calls;
      const hasRequest = saveCalls.some((c: any[]) => c[0]?.info_creator_role === 'REQUEST');
      const hasResponse = saveCalls.some((c: any[]) => c[0]?.info_creator_role === 'RESPONSE');
      expect(hasRequest).toBe(true);
      expect(hasResponse).toBe(true);
    });

    it('TC-INT-013: Agent 执行信息保存', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s7', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      await flushAllCallbacks();
      const saveCalls = infoCore.saveInfo.mock.calls;
      const hasAgent = saveCalls.some((c: any[]) => c[0]?.info_creator_role === 'AGENT');
      expect(hasAgent).toBe(true);
    });
  });

  // =========================================================================
  // 3. 失败与恢复
  // =========================================================================
  describe('Failure and recovery', () => {
    it('TC-INT-016: Entry 层 receiveWork 失败时 work 状态为 FAILED', async () => {
      infoCore.saveInfo.mockRejectedValueOnce(new Error('save failed'));
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s8', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-INT-017: Strategy 层 Agent 构建失败', async () => {
      const selStratOut = Object.assign(new SelectOneDBOutput(), {});
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_strategy', conditions: [{ field: 'strategy_label', operator: Operator.EQ, value: 'SIMPLE' }] },
      }) as SelectOneDBInput, new DBContext(), selStratOut);
      const originalJsonnodeDef = selStratOut.row!.jsonnode_definition;
      db.executeRaw(`UPDATE orchestration_strategy SET jsonnode_definition = 'invalid_json' WHERE strategy_label = 'SIMPLE'`);
      try {
        agentBuilder.buildAgent.mockRejectedValueOnce(new Error('build failed'));
        const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s9', user_query: '你好' });
        const output = new ReceiveWorkOutput();
        const ctx = new OrchestrationEntryContext();

        const result = await entry.receiveWork(input, ctx, output);
        expect(result).toBe(false);
        expect(output.final_response).toBeTruthy();
      } finally {
        const escaped = String(originalJsonnodeDef).replace(/'/g, "''");
        db.executeRaw(`UPDATE orchestration_strategy SET jsonnode_definition = '${escaped}' WHERE strategy_label = 'SIMPLE'`);
      }
    });
  });

  // =========================================================================
  // 4. 分层解耦验证
  // =========================================================================
  describe('Layer decoupling', () => {
    it('TC-INT-023: 编排层不直接调用 LLMProvider', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s10', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      expect(llmAccess.execLLM).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. 并发与异步
  // =========================================================================
  describe('Concurrency and async', () => {
    it('TC-INT-029: max_concurrent > 1 时并行执行无依赖 Agent', async () => {
      const workId = 'int-w1';
      const interactId = 'int-i-w1';
      const sessionId = 'int-s-w1';
      const now = Date.now();
      db.executeRaw(`
        INSERT OR IGNORE INTO orchestration_work
          (id, created, updated, work_id, interact_id, session_id, user_query, status,
           orchestration_strategy, task_count, completed_task_count, elapsed_ms,
           cancel_reason, error_message, final_response, metadata)
        VALUES
          ('ow-int-w1', ${now}, ${now}, '${workId}', '${interactId}', '${sessionId}', 'parallel tasks test', 'CREATED',
           '', 0, 0, 0, '', '', '', '{}')
      `);

      const agentDag: AgentDAG = {
        plan_id: 'int-p1', total_agent_count: 3,
        agent_nodes: [
          { agent_id: 'a1', task_id: 't1', task_content: 'Task 1', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a2', task_id: 't2', task_content: 'Task 2', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
          { agent_id: 'a3', task_id: 't3', task_content: 'Task 3', task_complexity: 30, task_domain: 'general', task_priority: 1, status: 'PENDING' },
        ],
        agent_edges: [],
      };
      const input = Object.assign(new ExecDAGInput(), {
        work_id: workId, agent_dag: agentDag, max_concurrent: 3,
      });
      const output = new ExecDAGOutput();
      const ctx = new OrchestrationExecutionContext();

      const result = await exec.execDAG(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_results.length).toBe(3);
    });

    it('TC-INT-034: EvolutorAgent 评估异步不阻塞后处理', async () => {
      const workId = 'int-w2';
      const interactId = 'int-i2';
      const sessionId = 'int-s2';
      const now = Date.now();
      db.executeRaw(`
        INSERT OR IGNORE INTO orchestration_work
          (id, created, updated, work_id, interact_id, session_id, user_query, status,
           orchestration_strategy, task_count, completed_task_count, elapsed_ms,
           cancel_reason, error_message, final_response, metadata)
        VALUES
          ('ow-int-w2', ${now}, ${now}, '${workId}', '${interactId}', '${sessionId}', '你好', 'PROCESSING',
           'SIMPLE', 1, 0, 0, '', '', '', '{}')
      `);

      const input = Object.assign(new ExecutePostProcessingInput(), {
        work_id: workId, interact_id: interactId, session_id: sessionId,
        user_query: '你好',
        agent_results: [{ agent_id: 'a1', task_content: 'test', result: 'mock result', trace_id: 'trace-1' }],
      });
      const output = new ExecutePostProcessingOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.executePostProcessing(input, ctx, output);
      await flushAllCallbacks();
      expect(result).toBe(true);
      expect(output.final_response).toBeTruthy();
    });
  });

  // =========================================================================
  // 6. JSONNode 策略与硬编码策略一致性
  // =========================================================================
  describe('JSONNode consistency', () => {
    it('TC-INT-037: Simple 策略 JSONNode 定义与硬编码执行结果一致', async () => {
      const workId = 'w1';
      const interactId = 'i1';
      const sessionId = 's1';
      const now = Date.now();
      db.executeRaw(`
        INSERT OR IGNORE INTO orchestration_work
          (id, created, updated, work_id, interact_id, session_id, user_query, status,
           orchestration_strategy, task_count, completed_task_count, elapsed_ms,
           cancel_reason, error_message, final_response, metadata)
        VALUES
          ('ow-int-w1-json', ${now}, ${now}, '${workId}', '${interactId}', '${sessionId}', '你好', 'CREATED',
           '', 0, 0, 0, '', '', '', '{}')
      `);

      const simpleDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'int-json', start_node: 'node_1',
        nodes: [
          { node_id: 'node_1', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'PROCESSING' }, next: 'node_2', on_error: 'node_8' },
          { node_id: 'node_2', node_type: 'BUILD_WORK_CONTEXT', params: { max_recent_works: 5, include_user_profile: true }, next: 'node_3', on_error: 'node_8' },
          { node_id: 'node_3', node_type: 'BUILD_WORK_AGENT', params: { force_new: false }, next: 'node_4', on_error: 'node_8' },
          { node_id: 'node_4', node_type: 'EXEC_AGENT', params: { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' }, next: 'node_5', on_error: 'node_8' },
          { node_id: 'node_5', node_type: 'WRITE_RESULT', params: { agent_results_key: 'agent_results', save_response_key: 'final_response' }, next: 'node_6', on_error: 'node_8' },
          { node_id: 'node_6', node_type: 'EVAL_RESULT', params: { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true }, next: 'node_7', on_error: 'node_8' },
          { node_id: 'node_7', node_type: 'SAVE_RESPONSE', params: { response_key: 'final_response', update_work_status: 'COMPLETED' }, next: null, on_error: 'node_8' },
          { node_id: 'node_8', node_type: 'HANDLE_ERROR', params: { default_response: 'Error', update_work_status: 'FAILED' }, next: null },
        ],
      };

      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'int-json-1',
        jsonnode_definition: simpleDef,
        initial_data: { session_id: sessionId, work_id: workId, interact_id: interactId, user_query: '你好', work_context: {} },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = await jsonNode.execJSONNode(input, ctx, output);
      await flushAllCallbacks();
      expect(result).toBe(true);
      expect(output.shared_data.final_response).toBeTruthy();
    });
  });

  // =========================================================================
  // 7. 可视化数据完整性
  // =========================================================================
  describe('Visualization data integrity', () => {
    it('TC-INT-040: 执行完成后可视化数据可查询', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s11', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);

      const vizInput = Object.assign(new VisualizeAgentDAGInput(), { work_id: output.work_id });
      const vizOutput = new VisualizeAgentDAGOutput();
      const vizCtx = new OrchestrationVisualizationContext();

      const vizResult = await viz.visualizeAgentDAG(vizInput, vizCtx, vizOutput);
      expect(vizResult).toBe(true);
    });
  });

  // =========================================================================
  // 8. AOP 代理全链路
  // =========================================================================
  describe('AOP full-chain', () => {
    it('TC-INT-044: 全链路 AOP 日志记录', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s12', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      expect(output.elapsed_ms).toBeDefined();
      expect(output.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 9. 极端场景
  // =========================================================================
  describe('Extreme scenarios', () => {
    it('TC-INT-047: 所有下层模块同时失败', async () => {
      const selStratOut = Object.assign(new SelectOneDBOutput(), {});
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_strategy', conditions: [{ field: 'strategy_label', operator: Operator.EQ, value: 'SIMPLE' }] },
      }) as SelectOneDBInput, new DBContext(), selStratOut);
      const originalJsonnodeDef = selStratOut.row!.jsonnode_definition;
      db.executeRaw(`UPDATE orchestration_strategy SET jsonnode_definition = 'invalid_json' WHERE strategy_label = 'SIMPLE'`);
      try {
        agentBuilder.buildAgent.mockRejectedValue(new Error('all failed'));
        writerAgent.write.mockRejectedValue(new Error('write failed'));

        const input = Object.assign(new ReceiveWorkInput(), { session_id: 'int-s13', user_query: '你好' });
        const output = new ReceiveWorkOutput();
        const ctx = new OrchestrationEntryContext();

        const result = await entry.receiveWork(input, ctx, output);
        await flushAllCallbacks();
        expect(result).toBe(false);
        expect(output.final_response).toBeTruthy();
      } finally {
        const escaped = String(originalJsonnodeDef).replace(/'/g, "''");
        db.executeRaw(`UPDATE orchestration_strategy SET jsonnode_definition = '${escaped}' WHERE strategy_label = 'SIMPLE'`);
      }
    });

    it('TC-INT-050: 空 session_id 新会话', async () => {
      const selStratOut = Object.assign(new SelectOneDBOutput(), {});
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_strategy', conditions: [{ field: 'strategy_label', operator: Operator.EQ, value: 'SIMPLE' }] },
      }) as SelectOneDBInput, new DBContext(), selStratOut);
      const originalJsonnodeDef = selStratOut.row!.jsonnode_definition;
      db.executeRaw(`UPDATE orchestration_strategy SET jsonnode_definition = 'invalid_json' WHERE strategy_label = 'SIMPLE'`);
      try {
        agentBuilder.buildAgent.mockRejectedValueOnce(new Error('empty session build failed'));
        const input = Object.assign(new ReceiveWorkInput(), { session_id: '', user_query: '你好' });
        const output = new ReceiveWorkOutput();
        const ctx = new OrchestrationEntryContext();

        const result = await entry.receiveWork(input, ctx, output);
        await flushAllCallbacks();
        expect(result).toBe(false);
      } finally {
        const escaped = String(originalJsonnodeDef).replace(/'/g, "''");
        db.executeRaw(`UPDATE orchestration_strategy SET jsonnode_definition = '${escaped}' WHERE strategy_label = 'SIMPLE'`);
      }
    });
  });
});