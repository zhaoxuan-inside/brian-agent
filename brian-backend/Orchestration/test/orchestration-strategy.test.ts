import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, setupTestMocks, resetTestMocks, createMockAgentBuilder, createMockPlannerAgent, createMockWriterAgent, createMockEvolutorAgent, createMockExecutionAccess, createMockMQCore, createMockLogger, initOrchestrationSchema, flushAllCallbacks } from './test-helpers';
import { RelationDBAccess, IdGenerator, Operator, DBContext, SelectOneDBInput, SelectOneDBOutput, SelectDBInput, SelectDBOutput, InsertDBInput, InsertDBOutput, DataObject } from '@brian-agent/base';
import { OrchestrationStrategyAccess } from '../OrchestrationStrategy/access/OrchestrationStrategyAccess';
import { JSONNodeAccess } from '../JSONNode/access/JSONNodeAccess';
import { OrchestrationExecutionAccess } from '../OrchestrationExecution/access/OrchestrationExecutionAccess';
import {
  OrchestrationStrategyContext,
  StartOrchestrationInput, StartOrchestrationOutput,
  ExecuteSimpleStrategyInput, ExecuteSimpleStrategyOutput,
  ExecutePlanningStrategyInput, ExecutePlanningStrategyOutput,
  ExecutePostProcessingInput, ExecutePostProcessingOutput,
  AddOrchestrationStrategyInput, AddOrchestrationStrategyOutput,
  HandleDAGFailureInput, HandleDAGFailureOutput,
  GetOrchestrationStrategyInput, GetOrchestrationStrategyOutput,
  UpdateOrchestrationStrategyInput, UpdateOrchestrationStrategyOutput,
  ConfigOrchestrationStrategyInput, ConfigOrchestrationStrategyOutput,
} from '../OrchestrationStrategy/domain/types';
import { createMockInfoCore, createMockMQAccess, createMockLLMAccess, createMockPromptsAccess } from './test-helpers';

describe('OrchestrationStrategy', () => {
  let db: RelationDBAccess;
  let agentBuilder: ReturnType<typeof createMockAgentBuilder>;
  let plannerAgent: ReturnType<typeof createMockPlannerAgent>;
  let writerAgent: ReturnType<typeof createMockWriterAgent>;
  let evolutorAgent: ReturnType<typeof createMockEvolutorAgent>;
  let executionAccess: ReturnType<typeof createMockExecutionAccess>;
  let jsonNode: JSONNodeAccess;
  let mqCore: ReturnType<typeof createMockMQCore>;
  let logger: ReturnType<typeof createMockLogger>;
  let strategy: OrchestrationStrategyAccess;

  beforeAll(async () => {
    await setupTestMocks();
    db = await createTestDb();
    agentBuilder = createMockAgentBuilder();
    plannerAgent = createMockPlannerAgent();
    writerAgent = createMockWriterAgent();
    evolutorAgent = createMockEvolutorAgent();
    executionAccess = createMockExecutionAccess();
    const infoCore = createMockInfoCore();
    const mqAccess = createMockMQAccess();
    const llmAccess = createMockLLMAccess();
    const promptsAccess = createMockPromptsAccess();
    mqCore = createMockMQCore();
    logger = createMockLogger();

    jsonNode = new JSONNodeAccess(db, infoCore, agentBuilder, writerAgent, plannerAgent, evolutorAgent, executionAccess, llmAccess, promptsAccess, mqAccess, mqCore, logger);
    strategy = new OrchestrationStrategyAccess(db, agentBuilder, plannerAgent, writerAgent, evolutorAgent, executionAccess, jsonNode, mqCore, logger);
    await strategy.initialize();
    await jsonNode.initialize();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTestMocks();
  });

  function insertWorkRecord(work_id: string, session_id: string, interact_id: string, user_query: string, status: string = 'CREATED') {
    const now = Date.now();
    const id = `pk-${work_id}`;
    db.executeRaw(`
      INSERT OR REPLACE INTO orchestration_work
        (id, created, updated, work_id, interact_id, session_id, user_query, status)
      VALUES
        ('${id}', ${now}, ${now}, '${work_id}', '${interact_id}', '${session_id}', '${user_query.replace(/'/g, "''")}', '${status}')
    `);
  }

  function insertStrategyExecution(work_id: string, plan_id: string, plan_retry_count: number) {
    const now = Date.now();
    const id = `pk-se-${work_id}-${plan_id}`;
    const executionId = `exec-${work_id}-${plan_id}`;
    const strategyId = 'mock-strategy-id';
    db.executeRaw(`
      INSERT OR REPLACE INTO orchestration_strategy_execution
        (id, created, updated, execution_id, work_id, strategy_id, plan_id, plan_retry_count, execution_status)
      VALUES
        ('${id}', ${now}, ${now}, '${executionId}', '${work_id}', '${strategyId}', '${plan_id}', ${plan_retry_count}, 'PROCESSING')
    `);
  }

  // =========================================================================
  // 1. startOrchestration
  // =========================================================================
  describe('startOrchestration', () => {
    it('TC-SO-001: Simple 策略启动编排', async () => {
      const input = Object.assign(new StartOrchestrationInput(), {
        work_id: 'w1', interact_id: 'i1', session_id: 's1',
        user_query: '你好', strategy: 'SIMPLE',
      });
      const output = new StartOrchestrationOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.startOrchestration(input, ctx, output);
      expect(result).toBe(true);
      expect(output.final_response).toBeTruthy();
    });

    it('TC-SO-002: Planning 策略启动编排', async () => {
      insertWorkRecord('w2', 's2', 'i2', '请帮我分析数据、生成报告并发送邮件');
      vi.spyOn(jsonNode, 'execJSONNode').mockRejectedValueOnce(new Error('force fallback'));
      const input = Object.assign(new StartOrchestrationInput(), {
        work_id: 'w2', interact_id: 'i2', session_id: 's2',
        user_query: '请帮我分析数据、生成报告并发送邮件', strategy: 'PLANNING',
      });
      const output = new StartOrchestrationOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.startOrchestration(input, ctx, output);
      expect(result).toBe(true);
      expect(output.final_response).toBeTruthy();
    });

    it('TC-SO-003: work_context 包含完整上下文数据', async () => {
      insertWorkRecord('w3', 's3', 'i3', '你好');
      const input = Object.assign(new StartOrchestrationInput(), {
        work_id: 'w3', interact_id: 'i3', session_id: 's3',
        user_query: '你好', strategy: 'SIMPLE',
        work_context: { session_context: {}, user_profile: {}, recent_works: [] },
      });
      const output = new StartOrchestrationOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.startOrchestration(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-SO-004: strategy 为无效值', async () => {
      const input = Object.assign(new StartOrchestrationInput(), {
        work_id: 'w4', interact_id: 'i4', session_id: 's4',
        user_query: '你好', strategy: 'UNKNOWN',
      });
      const output = new StartOrchestrationOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.startOrchestration(input, ctx, output);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 2. executeSimpleStrategy
  // =========================================================================
  describe('executeSimpleStrategy', () => {
    it('TC-ESS-001: 构建并执行单个 WorkAgent', async () => {
      insertWorkRecord('w5', 's5', 'i5', '请帮我做某事');
      const input = Object.assign(new ExecuteSimpleStrategyInput(), {
        work_id: 'w5', interact_id: 'i5', session_id: 's5', user_query: '请帮我做某事',
      });
      const output = new ExecuteSimpleStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.executeSimpleStrategy(input, ctx, output);
      expect(result).toBe(true);
      expect(output.agent_results.length).toBe(1);
      expect(output.agent_results[0].agent_id).toBeTruthy();
      expect(output.agent_results[0].trace_id).toBeTruthy();
    });

    it('TC-ESS-002: force_new=false 允许复用 Agent', async () => {
      const input = Object.assign(new ExecuteSimpleStrategyInput(), {
        work_id: 'w6', interact_id: 'i6', session_id: 's6', user_query: '你好',
      });
      const output = new ExecuteSimpleStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      await strategy.executeSimpleStrategy(input, ctx, output);
      expect(agentBuilder.buildAgent).toHaveBeenCalled();
      const buildCall = agentBuilder.buildAgent.mock.calls[0];
      const buildInput = buildCall[0];
      expect(buildInput.force_new).toBe(false);
    });

    it('TC-ESS-005: AgentBuilder.buildAgent 失败', async () => {
      agentBuilder.buildAgent.mockImplementationOnce(async (_i: any, _c: any, o: any) => { o.error = 'build failed'; return false; });
      const input = Object.assign(new ExecuteSimpleStrategyInput(), {
        work_id: 'w7', interact_id: 'i7', session_id: 's7', user_query: '你好',
      });
      const output = new ExecuteSimpleStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.executeSimpleStrategy(input, ctx, output);
      expect(result).toBe(false);
    });

    it('TC-ESS-006: OrchestrationExecution.execSingleAgent 失败', async () => {
      const mockExec = createMockExecutionAccess({ failExec: true });
      const infoCore = createMockInfoCore();
      const mqAccess = createMockMQAccess();
      const llmAccess = createMockLLMAccess();
      const promptsAccess = createMockPromptsAccess();
      const fallbackJsonNode = new JSONNodeAccess(db, infoCore, agentBuilder, writerAgent, plannerAgent, evolutorAgent, mockExec, llmAccess, promptsAccess, mqAccess, mqCore, logger);
      const fallbackStrategy = new OrchestrationStrategyAccess(db, agentBuilder, plannerAgent, writerAgent, evolutorAgent, mockExec, fallbackJsonNode, mqCore, logger);
      await fallbackStrategy.initialize();
      await fallbackJsonNode.initialize();

      const input = Object.assign(new ExecuteSimpleStrategyInput(), {
        work_id: 'w8', interact_id: 'i8', session_id: 's8', user_query: '你好',
      });
      const output = new ExecuteSimpleStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await fallbackStrategy.executeSimpleStrategy(input, ctx, output);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 3. executePlanningStrategy
  // =========================================================================
  describe('executePlanningStrategy', () => {
    it('TC-EPS-001: 任务拆解成功', async () => {
      insertWorkRecord('w9', 's9', 'i9', '请帮我分析数据、生成报告并发送邮件');
      const input = Object.assign(new ExecutePlanningStrategyInput(), {
        work_id: 'w9', interact_id: 'i9', session_id: 's9',
        user_query: '请帮我分析数据、生成报告并发送邮件',
      });
      const output = new ExecutePlanningStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.executePlanningStrategy(input, ctx, output);
      expect(result).toBe(true);
      expect(output.plan_id).toBeTruthy();
    });

    it('TC-EPS-007: PlannerAgent.plan 返回空 task_dag', async () => {
      plannerAgent.plan.mockImplementationOnce(async (_i: any, _c: any, o: any) => {
        o.plan_id = 'empty-plan';
        o.task_dag = { nodes: [], edges: [] };
        return true;
      });

      const input = Object.assign(new ExecutePlanningStrategyInput(), {
        work_id: 'w10', interact_id: 'i10', session_id: 's10',
        user_query: '请帮我分析数据',
      });
      const output = new ExecutePlanningStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.executePlanningStrategy(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-EPS-008: PlannerAgent.plan 执行失败', async () => {
      plannerAgent.plan.mockImplementationOnce(async (_i: any, _c: any, o: any) => { o.error = 'plan failed'; return false; });
      const input = Object.assign(new ExecutePlanningStrategyInput(), {
        work_id: 'w11', interact_id: 'i11', session_id: 's11',
        user_query: '请帮我分析数据',
      });
      const output = new ExecutePlanningStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.executePlanningStrategy(input, ctx, output);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 4. executePostProcessing
  // =========================================================================
  describe('executePostProcessing', () => {
    it('TC-EPP-001: WriterAgent 写作成功', async () => {
      insertWorkRecord('w12', 's12', 'i12', '你好');
      const input = Object.assign(new ExecutePostProcessingInput(), {
        work_id: 'w12', interact_id: 'i12', session_id: 's12',
        user_query: '你好',
        agent_results: [{ agent_id: 'a1', task_content: 'test', result: 'mock result', trace_id: 'trace-1' }],
      });
      const output = new ExecutePostProcessingOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.executePostProcessing(input, ctx, output);
      expect(result).toBe(true);
      expect(output.final_response).toBeTruthy();
    });

    it('TC-EPP-002: EvolutorAgent 评估 WriterAgent', async () => {
      insertWorkRecord('w13', 's13', 'i13', '你好');
      const input = Object.assign(new ExecutePostProcessingInput(), {
        work_id: 'w13', interact_id: 'i13', session_id: 's13',
        user_query: '你好',
        agent_results: [{ agent_id: 'a1', task_content: 'test', result: 'mock result', trace_id: 'trace-1' }],
      });
      const output = new ExecutePostProcessingOutput();
      const ctx = new OrchestrationStrategyContext();

      await strategy.executePostProcessing(input, ctx, output);
      await flushAllCallbacks();
      expect(evolutorAgent.evalWriterAgent).toHaveBeenCalled();
    });

    it('TC-EPP-003: EvolutorAgent 评估所有 WorkAgent', async () => {
      insertWorkRecord('w14', 's14', 'i14', '你好');
      const input = Object.assign(new ExecutePostProcessingInput(), {
        work_id: 'w14', interact_id: 'i14', session_id: 's14',
        user_query: '你好',
        agent_results: [
          { agent_id: 'a1', task_content: 'task1', result: 'result1', trace_id: 'trace-1' },
          { agent_id: 'a2', task_content: 'task2', result: 'result2', trace_id: 'trace-2' },
          { agent_id: 'a3', task_content: 'task3', result: 'result3', trace_id: 'trace-3' },
        ],
      });
      const output = new ExecutePostProcessingOutput();
      const ctx = new OrchestrationStrategyContext();

      await strategy.executePostProcessing(input, ctx, output);
      await flushAllCallbacks();
      expect(evolutorAgent.evalWorkAgent).toHaveBeenCalledTimes(3);
    });

    it('TC-EPP-007: WriterAgent.write 失败', async () => {
      insertWorkRecord('w15', 's15', 'i15', '你好');
      writerAgent.write.mockImplementationOnce(async (_i: any, _c: any, o: any) => { o.error = 'write failed'; return false; });
      const input = Object.assign(new ExecutePostProcessingInput(), {
        work_id: 'w15', interact_id: 'i15', session_id: 's15',
        user_query: '你好',
        agent_results: [{ agent_id: 'a1', task_content: 'test', result: 'mock result', trace_id: 'trace-1' }],
      });
      const output = new ExecutePostProcessingOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.executePostProcessing(input, ctx, output);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 5. addStrategy
  // =========================================================================
  describe('addStrategy', () => {
    it('TC-AS-001: 注册新策略', async () => {
      const jsonNodeDef = JSON.stringify({
        version: '1.0', orchestration_id: 'custom', start_node: 'node_1',
        nodes: [
          { node_id: 'node_1', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'PROCESSING' }, next: 'node_2', on_error: 'node_3' },
          { node_id: 'node_2', node_type: 'SAVE_RESPONSE', params: { response_key: 'final_response', update_work_status: 'COMPLETED' }, next: null, on_error: 'node_3' },
          { node_id: 'node_3', node_type: 'HANDLE_ERROR', params: { default_response: 'Error', update_work_status: 'FAILED' }, next: null },
        ],
      });
      const input = Object.assign(new AddOrchestrationStrategyInput(), {
        strategy_label: 'custom_strategy', strategy_description: '自定义策略', jsonnode_definition: jsonNodeDef, enable: true,
      });
      const output = new AddOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.addStrategy(input, ctx, output);
      expect(result).toBe(true);
      expect(output.strategy_id).toBeTruthy();
    });

    it('TC-AS-002: 注册策略 enable=false', async () => {
      const jsonNodeDef = JSON.stringify({
        version: '1.0', orchestration_id: 'disabled', start_node: 'node_1',
        nodes: [
          { node_id: 'node_1', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'PROCESSING' }, next: 'node_2', on_error: 'node_3' },
          { node_id: 'node_2', node_type: 'SAVE_RESPONSE', params: { response_key: 'final_response', update_work_status: 'COMPLETED' }, next: null, on_error: 'node_3' },
          { node_id: 'node_3', node_type: 'HANDLE_ERROR', params: { default_response: 'Error', update_work_status: 'FAILED' }, next: null },
        ],
      });
      const input = Object.assign(new AddOrchestrationStrategyInput(), {
        strategy_label: 'disabled_strategy', strategy_description: 'Disabled strategy', jsonnode_definition: jsonNodeDef, enable: false,
      });
      const output = new AddOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.addStrategy(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-AS-004: strategy_label 重复', async () => {
      const jsonNodeDef = JSON.stringify({
        version: '1.0', orchestration_id: 'dup', start_node: 'node_1',
        nodes: [
          { node_id: 'node_1', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'PROCESSING' }, next: 'node_2', on_error: 'node_3' },
          { node_id: 'node_2', node_type: 'SAVE_RESPONSE', params: { response_key: 'final_response', update_work_status: 'COMPLETED' }, next: null, on_error: 'node_3' },
          { node_id: 'node_3', node_type: 'HANDLE_ERROR', params: { default_response: 'Error', update_work_status: 'FAILED' }, next: null },
        ],
      });
      const input = Object.assign(new AddOrchestrationStrategyInput(), {
        strategy_label: 'SIMPLE', strategy_description: 'Duplicate', jsonnode_definition: jsonNodeDef,
      });
      const output = new AddOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      await expect(strategy.addStrategy(input, ctx, output)).rejects.toThrow();
    });

    it('TC-AS-005: strategy_label 为空', async () => {
      const input = Object.assign(new AddOrchestrationStrategyInput(), {
        strategy_label: '', strategy_description: 'Empty', jsonnode_definition: '{}',
      });
      const output = new AddOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      await expect(strategy.addStrategy(input, ctx, output)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 6. handleDAGFailure
  // =========================================================================
  describe('handleDAGFailure', () => {
    it('TC-HDF-001: 首次失败触发 REPLAN', async () => {
      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p1', failed_task_id: 'task-2', failure_reason: 'exec failed',
        completed_task_ids: ['task-1'], work_id: 'w16', interact_id: 'i16',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.handleDAGFailure(input, ctx, output);
      expect(result).toBe(true);
      expect(output.action).toBe('REPLAN');
      expect(output.max_retry_reached).toBe(false);
    });

    it('TC-HDF-002: 重试次数达到上限返回 FAIL', async () => {
      insertWorkRecord('w17', 's17', 'i17', '测试任务');
      insertStrategyExecution('w17', 'p2', 2);
      const input = Object.assign(new HandleDAGFailureInput(), {
        plan_id: 'p2', failed_task_id: 'task-2', failure_reason: 'exec failed again',
        completed_task_ids: ['task-1'], work_id: 'w17', interact_id: 'i17',
      });
      const output = new HandleDAGFailureOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.handleDAGFailure(input, ctx, output);
      expect(result).toBe(true);
      expect(output.max_retry_reached).toBe(true);
    });
  });

  // =========================================================================
  // 7. getStrategy
  // =========================================================================
  describe('getStrategy', () => {
    it('TC-SS-001: 按 strategy_label 查询', async () => {
      const input = Object.assign(new GetOrchestrationStrategyInput(), { strategy_label: 'SIMPLE' });
      const output = new GetOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.getStrategy(input, ctx, output);
      expect(result).toBe(true);
      expect(output.strategies.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-SS-006: 查询不存在的 strategy_id', async () => {
      const input = Object.assign(new GetOrchestrationStrategyInput(), { strategy_id: 'nonexistent' });
      const output = new GetOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.getStrategy(input, ctx, output);
      expect(result).toBe(true);
      expect(output.strategies).toEqual([]);
    });
  });

  // =========================================================================
  // 8. updateStrategy
  // =========================================================================
  describe('updateStrategy', () => {
    it('TC-US-005: 更新不存在的策略', async () => {
      const input = Object.assign(new UpdateOrchestrationStrategyInput(), { strategy_id: 'nonexistent', strategy_description: 'New desc' });
      const output = new UpdateOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      await expect(strategy.updateStrategy(input, ctx, output)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 9. configOrchestrationStrategy
  // =========================================================================
  describe('configOrchestrationStrategy', () => {
    it('TC-COS-001: 不传参数查询当前配置', async () => {
      const input = Object.assign(new ConfigOrchestrationStrategyInput(), {});
      const output = new ConfigOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.configOrchestrationStrategy(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-COS-007: max_plan_retries 为负数', async () => {
      const input = Object.assign(new ConfigOrchestrationStrategyInput(), { max_plan_retries: -1 });
      const output = new ConfigOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      await expect(strategy.configOrchestrationStrategy(input, ctx, output)).rejects.toThrow();
    });

    it('TC-COS-008: max_plan_retries 为 0', async () => {
      const input = Object.assign(new ConfigOrchestrationStrategyInput(), { max_plan_retries: 0 });
      const output = new ConfigOrchestrationStrategyOutput();
      const ctx = new OrchestrationStrategyContext();

      const result = await strategy.configOrchestrationStrategy(input, ctx, output);
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // 10. 后处理链不可跳过测试
  // =========================================================================
  describe('post-processing chain', () => {
    it('TC-PP-001: Simple 策略必须经过后处理', async () => {
      insertWorkRecord('w18', 's18', 'i18', '你好');
      vi.spyOn(jsonNode, 'execJSONNode').mockRejectedValueOnce(new Error('force fallback'));
      const input = Object.assign(new StartOrchestrationInput(), {
        work_id: 'w18', interact_id: 'i18', session_id: 's18',
        user_query: '你好', strategy: 'SIMPLE',
      });
      const output = new StartOrchestrationOutput();
      const ctx = new OrchestrationStrategyContext();

      await strategy.startOrchestration(input, ctx, output);
      await flushAllCallbacks();
      expect(writerAgent.write).toHaveBeenCalled();
      expect(evolutorAgent.evalWriterAgent).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 11. AOP 代理通用测试
  // =========================================================================
  describe('AOP proxy', () => {
    it('TC-AOP-001: 方法调用后 output.elapsed_ms 存在', async () => {
      const input = Object.assign(new StartOrchestrationInput(), {
        work_id: 'w19', interact_id: 'i19', session_id: 's19',
        user_query: '你好', strategy: 'SIMPLE',
      });
      const output = new StartOrchestrationOutput();
      const ctx = new OrchestrationStrategyContext();

      await strategy.startOrchestration(input, ctx, output);
      expect(output.elapsed_ms).toBeDefined();
      expect(output.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 12. 表结构验证
  // =========================================================================
  describe('table structure', () => {
    it('TC-TBL-001: orchestration_strategy 表字段完整性', async () => {
      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_strategy' },
      }) as SelectDBInput, new DBContext(), selOutput);
      expect(selOutput.rows.length).toBeGreaterThanOrEqual(2);
    });

    it('TC-TBL-004: 内置策略 SIMPLE 和 PLANNING 存在', async () => {
      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_strategy', conditions: [{ field: 'strategy_label', operator: Operator.EQ, value: 'SIMPLE' }] },
      }) as SelectDBInput, new DBContext(), selOutput);
      expect(selOutput.rows.length).toBe(1);
      expect(selOutput.rows[0].enable).toBe(1);
    });
  });
});