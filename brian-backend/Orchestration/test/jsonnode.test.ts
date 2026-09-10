import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, setupTestMocks, resetTestMocks, createMockAgentBuilder, createMockWriterAgent, createMockPlannerAgent, createMockEvolutorAgent, createMockExecutionAccess, createMockInfoCore, createMockMQAccess, createMockMQCore, createMockLLMAccess, createMockPromptsAccess, createMockLogger, flushAllCallbacks } from './test-helpers';
import { RelationDBAccess, Operator, DBContext, SelectDBInput, SelectDBOutput } from '@brian-agent/base';
import { JSONNodeAccess } from '../JSONNode/access/JSONNodeAccess';
import {
  JSONNodeContext,
  ExecJSONNodeInput, ExecJSONNodeOutput,
  GetJSONNodeTraceInput, GetJSONNodeTraceOutput,
  RegisterNodeTypeInput, RegisterNodeTypeOutput,
  ValidateJSONNodeInput, ValidateJSONNodeOutput,
  ConfigJSONNodeInput, ConfigJSONNodeOutput,
  JSONNodeDefinition, NodeHandler, BUILTIN_NODE_TYPES,
} from '../JSONNode/domain/types';

describe('JSONNode', () => {
  let db: RelationDBAccess;
  let agentBuilder: ReturnType<typeof createMockAgentBuilder>;
  let writerAgent: ReturnType<typeof createMockWriterAgent>;
  let plannerAgent: ReturnType<typeof createMockPlannerAgent>;
  let evolutorAgent: ReturnType<typeof createMockEvolutorAgent>;
  let executionAccess: ReturnType<typeof createMockExecutionAccess>;
  let infoCore: ReturnType<typeof createMockInfoCore>;
  let mqAccess: ReturnType<typeof createMockMQAccess>;
  let mqCore: ReturnType<typeof createMockMQCore>;
  let llmAccess: ReturnType<typeof createMockLLMAccess>;
  let promptsAccess: ReturnType<typeof createMockPromptsAccess>;
  let logger: ReturnType<typeof createMockLogger>;
  let jsonNode: JSONNodeAccess;

  const simpleDef: JSONNodeDefinition = {
    version: '1.0', orchestration_id: 'test-simple', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
    nodes: [
      { node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'PROCESSING' }, next: 'bea3c048-aa35-4ab3-bda7-c2de0c6b2713', on_error: 'e3c444de-c3f9-4c87-83fc-eb112a36ce4f' },
      { node_id: 'bea3c048-aa35-4ab3-bda7-c2de0c6b2713', node_type: 'BUILD_WORK_CONTEXT', params: { max_recent_works: 5, include_user_profile: true }, next: 'd9e244cc-b48c-422d-af5d-c940bb8deca3', on_error: 'e3c444de-c3f9-4c87-83fc-eb112a36ce4f' },
      { node_id: 'd9e244cc-b48c-422d-af5d-c940bb8deca3', node_type: 'BUILD_WORK_AGENT', params: { force_new: false }, next: '9ef376a0-c465-49d1-b1ca-f89922c21246', on_error: 'e3c444de-c3f9-4c87-83fc-eb112a36ce4f' },
      { node_id: '9ef376a0-c465-49d1-b1ca-f89922c21246', node_type: 'EXEC_AGENT', params: { agent_id_key: 'current_agent_id', save_result_key: 'agent_answer' }, next: '3a6831ba-2b2d-4678-8eb5-be2336486eca', on_error: 'e3c444de-c3f9-4c87-83fc-eb112a36ce4f' },
      { node_id: '3a6831ba-2b2d-4678-8eb5-be2336486eca', node_type: 'WRITE_RESULT', params: { agent_results_key: 'agent_results', save_response_key: 'final_response' }, next: 'aafd4af1-9f9c-4ecb-913d-1616e99f4252', on_error: 'e3c444de-c3f9-4c87-83fc-eb112a36ce4f' },
      { node_id: 'aafd4af1-9f9c-4ecb-913d-1616e99f4252', node_type: 'EVAL_RESULT', params: { agent_results_key: 'agent_results', final_response_key: 'final_response', async: true }, next: '771099da-b73c-493b-bf64-15dd33f4bd27', on_error: 'e3c444de-c3f9-4c87-83fc-eb112a36ce4f' },
      { node_id: '771099da-b73c-493b-bf64-15dd33f4bd27', node_type: 'SAVE_RESPONSE', params: { response_key: 'final_response', update_work_status: 'COMPLETED' }, next: null, on_error: 'e3c444de-c3f9-4c87-83fc-eb112a36ce4f' },
      { node_id: 'e3c444de-c3f9-4c87-83fc-eb112a36ce4f', node_type: 'HANDLE_ERROR', params: { default_response: 'Error occurred', update_work_status: 'FAILED' }, next: null },
    ],
  };

  beforeAll(async () => {
    await setupTestMocks();
    db = await createTestDb();
    agentBuilder = createMockAgentBuilder();
    writerAgent = createMockWriterAgent();
    plannerAgent = createMockPlannerAgent();
    evolutorAgent = createMockEvolutorAgent();
    executionAccess = createMockExecutionAccess();
    infoCore = createMockInfoCore();
    mqAccess = createMockMQAccess();
    mqCore = createMockMQCore();
    llmAccess = createMockLLMAccess();
    promptsAccess = createMockPromptsAccess();
    logger = createMockLogger();
    jsonNode = new JSONNodeAccess(db, infoCore, agentBuilder, writerAgent, plannerAgent, evolutorAgent, executionAccess, llmAccess, promptsAccess, mqAccess, mqCore, logger);
    await jsonNode.initialize();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    writerAgent.execWrite.mockImplementation(async (_i: any, o: any, _c: any, ) => {
      o.response = 'This is a mock writer response.';
      o.response_format = 'MARKDOWN';
      o.token_usage = 50;
      return true;
    });
    executionAccess.execSingleAgent.mockImplementation(async (_i: any, o: any, _c: any, ) => {
      o.answer = 'Mock agent answer.';
      o.trace_id = 'mock-trace-id';
      o.iterations = 3;
      o.elapsed_ms = 150;
      return true;
    });
  });

  afterEach(() => {
    resetTestMocks();
  });

  // =========================================================================
  // 1. execJSONNode
  // =========================================================================
  describe('execJSONNode', () => {
    it('TC-EJN-001: 执行 Simple 策略 JSONNode 定义', async () => {
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-1',
        jsonnode_definition: simpleDef,
        initial_data: { session_id: 's1', work_id: 'w1', interact_id: 'i1', user_query: '你好', work_context: {} },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = await jsonNode.execJSONNode(input, output, ctx);
      expect(result).toBe(true);
      expect(output.shared_data.final_response).toBeTruthy();
      expect(output.execution_trace.length).toBeGreaterThan(0);
    });

    it('TC-EJN-002: Simple 策略节点执行顺序', async () => {
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-2',
        jsonnode_definition: simpleDef,
        initial_data: { session_id: 's2', work_id: 'w2', interact_id: 'i2', user_query: '你好', work_context: {} },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await jsonNode.execJSONNode(input, output, ctx);
      const traceIds = output.execution_trace.map(t => t.node_id);
      expect(traceIds[0]).toBe('de43b808-a9b7-48c1-8744-7602a483328f');
      expect(traceIds[1]).toBe('bea3c048-aa35-4ab3-bda7-c2de0c6b2713');
      expect(traceIds[traceIds.length - 1]).toBe('771099da-b73c-493b-bf64-15dd33f4bd27');
    });

    it('TC-EJN-003: Simple 策略 shared_data 传递', async () => {
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-3',
        jsonnode_definition: simpleDef,
        initial_data: { session_id: 's3', work_id: 'w3', interact_id: 'i3', user_query: '你好', work_context: {} },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await jsonNode.execJSONNode(input, output, ctx);
      await flushAllCallbacks();
      expect(output.shared_data.user_query).toBe('你好');
      expect(output.shared_data.final_response).toBeTruthy();
    });

    it('TC-EJN-007: 初始化 shared_data 包含 initial_data', async () => {
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-4',
        jsonnode_definition: simpleDef,
        initial_data: { session_id: 's4', work_id: 'w4', interact_id: 'i4', user_query: 'Test', work_context: {} },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await jsonNode.execJSONNode(input, output, ctx);
      expect(output.shared_data.session_id).toBe('s4');
      expect(output.shared_data.work_id).toBe('w4');
      expect(output.shared_data.user_query).toBe('Test');
    });

    it('TC-EJN-009: start_node 不存在于 nodes 中', async () => {
      const invalidDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'test', start_node: 'nonexistent',
        nodes: [{ node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: {}, next: null }],
      };
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-5',
        jsonnode_definition: invalidDef,
        initial_data: {},
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = await jsonNode.execJSONNode(input, output, ctx);
      expect(result).toBe(false);
    });

    it('TC-EJN-011: next 为 null 时流程结束', async () => {
      const singleNodeDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'single', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [{ node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'CREATED' }, next: null }],
      };
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-6',
        jsonnode_definition: singleNodeDef,
        initial_data: { session_id: 's6', work_id: 'w6', interact_id: 'i6', user_query: 'Test', work_context: {} },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = await jsonNode.execJSONNode(input, output, ctx);
      expect(result).toBe(true);
      expect(output.execution_trace.length).toBe(1);
    });

    it('SAVE_USER_INPUT 优先将 original_user_query 落为 REQUEST 原文', async () => {
      const singleNodeDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'orig-q', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [{ node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'CREATED' }, next: null }],
      };
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-orig-q',
        jsonnode_definition: singleNodeDef,
        initial_data: {
          session_id: 's-orig',
          work_id: 'w-orig-q',
          interact_id: 'i-orig',
          user_query: '理解后的可执行任务',
          original_user_query: '研究 Agent',
          work_context: {},
        },
      });
      const output = new ExecJSONNodeOutput();
      await jsonNode.execJSONNode(input, output, new JSONNodeContext());
      expect(infoCore.saveInfo).toHaveBeenCalled();
      expect((infoCore.saveInfo as any).mock.calls[0][0].info).toBe('研究 Agent');
    });

    it('TC-EJN-013: 节点执行成功记录 SUCCESS', async () => {
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-7',
        jsonnode_definition: simpleDef,
        initial_data: { session_id: 's7', work_id: 'w7', interact_id: 'i7', user_query: '你好', work_context: {} },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await jsonNode.execJSONNode(input, output, ctx);
      output.execution_trace.forEach(trace => {
        expect(trace.status).toBe('SUCCESS');
      });
    });

    it('TC-EJN-017: execution_trace 记录节点耗时', async () => {
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-8',
        jsonnode_definition: simpleDef,
        initial_data: { session_id: 's8', work_id: 'w8', interact_id: 'i8', user_query: '你好', work_context: {} },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await jsonNode.execJSONNode(input, output, ctx);
      output.execution_trace.forEach(trace => {
        expect(trace.elapsed_ms).toBeGreaterThanOrEqual(0);
      });
    });

    it('TC-EJN-018: nodes 为空数组', async () => {
      const emptyDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'empty', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [],
      };
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-9',
        jsonnode_definition: emptyDef,
        initial_data: {},
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = await jsonNode.execJSONNode(input, output, ctx);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 2. CONDITION 分支测试
  // =========================================================================
  describe('CONDITION branching', () => {
    it('TC-COND-001: EQ 操作符 true', async () => {
      const condDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'cond-test', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [
          { node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'CREATED' }, next: '113393f5-6c89-4cdb-a9df-8ddb3878c118', on_error: '53fc7947-7496-42e2-bb43-95384f68c643' },
          { node_id: '113393f5-6c89-4cdb-a9df-8ddb3878c118', node_type: 'CONDITION', params: { field: 'strategy', operator: 'EQ', value: 'PLANNING' }, true_next: '839f1f73-3902-4745-9a18-75c0b619ce61', false_next: 'df33276c-4a7c-4990-bb6c-0caf40179685', next: null, on_error: '53fc7947-7496-42e2-bb43-95384f68c643' },
          { node_id: '839f1f73-3902-4745-9a18-75c0b619ce61', node_type: 'SAVE_RESPONSE', params: { response_key: 'result', update_work_status: 'COMPLETED' }, next: null, on_error: '53fc7947-7496-42e2-bb43-95384f68c643' },
          { node_id: 'df33276c-4a7c-4990-bb6c-0caf40179685', node_type: 'HANDLE_ERROR', params: { default_response: 'Wrong branch', update_work_status: 'FAILED' }, next: null },
          { node_id: '53fc7947-7496-42e2-bb43-95384f68c643', node_type: 'HANDLE_ERROR', params: { default_response: 'Error', update_work_status: 'FAILED' }, next: null },
        ],
      };
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-cond-1',
        jsonnode_definition: condDef,
        initial_data: { session_id: 's1', work_id: 'w1', interact_id: 'i1', user_query: 'Test', work_context: {}, strategy: 'PLANNING' },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await jsonNode.execJSONNode(input, output, ctx);
      const traceIds = output.execution_trace.map(t => t.node_id);
      expect(traceIds).toContain('839f1f73-3902-4745-9a18-75c0b619ce61');
      expect(traceIds).not.toContain('df33276c-4a7c-4990-bb6c-0caf40179685');
    });

    it('TC-COND-002: EQ 操作符 false', async () => {
      const condDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'cond-test-2', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [
          { node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'CREATED' }, next: '113393f5-6c89-4cdb-a9df-8ddb3878c118', on_error: '53fc7947-7496-42e2-bb43-95384f68c643' },
          { node_id: '113393f5-6c89-4cdb-a9df-8ddb3878c118', node_type: 'CONDITION', params: { field: 'strategy', operator: 'EQ', value: 'PLANNING' }, true_next: '839f1f73-3902-4745-9a18-75c0b619ce61', false_next: 'df33276c-4a7c-4990-bb6c-0caf40179685', next: null, on_error: '53fc7947-7496-42e2-bb43-95384f68c643' },
          { node_id: '839f1f73-3902-4745-9a18-75c0b619ce61', node_type: 'HANDLE_ERROR', params: { default_response: 'Wrong branch', update_work_status: 'FAILED' }, next: null },
          { node_id: 'df33276c-4a7c-4990-bb6c-0caf40179685', node_type: 'SAVE_RESPONSE', params: { response_key: 'result', update_work_status: 'COMPLETED' }, next: null, on_error: '53fc7947-7496-42e2-bb43-95384f68c643' },
          { node_id: '53fc7947-7496-42e2-bb43-95384f68c643', node_type: 'HANDLE_ERROR', params: { default_response: 'Error', update_work_status: 'FAILED' }, next: null },
        ],
      };
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-cond-2',
        jsonnode_definition: condDef,
        initial_data: { session_id: 's2', work_id: 'w2', interact_id: 'i2', user_query: 'Test', work_context: {}, strategy: 'SIMPLE' },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await jsonNode.execJSONNode(input, output, ctx);
      const traceIds = output.execution_trace.map(t => t.node_id);
      expect(traceIds).toContain('df33276c-4a7c-4990-bb6c-0caf40179685');
      expect(traceIds).not.toContain('839f1f73-3902-4745-9a18-75c0b619ce61');
    });

    it('TC-COND-004: GT 操作符', async () => {
      const condDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'cond-gt', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [
          { node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: { info_creator_role: 'REQUEST', update_work_status: 'CREATED' }, next: '113393f5-6c89-4cdb-a9df-8ddb3878c118', on_error: '53fc7947-7496-42e2-bb43-95384f68c643' },
          { node_id: '113393f5-6c89-4cdb-a9df-8ddb3878c118', node_type: 'CONDITION', params: { field: 'complexity', operator: 'GT', value: '50' }, true_next: '839f1f73-3902-4745-9a18-75c0b619ce61', false_next: 'df33276c-4a7c-4990-bb6c-0caf40179685', next: null, on_error: '53fc7947-7496-42e2-bb43-95384f68c643' },
          { node_id: '839f1f73-3902-4745-9a18-75c0b619ce61', node_type: 'SAVE_RESPONSE', params: { response_key: 'result', update_work_status: 'COMPLETED' }, next: null, on_error: '53fc7947-7496-42e2-bb43-95384f68c643' },
          { node_id: 'df33276c-4a7c-4990-bb6c-0caf40179685', node_type: 'HANDLE_ERROR', params: { default_response: 'Not GT', update_work_status: 'FAILED' }, next: null },
          { node_id: '53fc7947-7496-42e2-bb43-95384f68c643', node_type: 'HANDLE_ERROR', params: { default_response: 'Error', update_work_status: 'FAILED' }, next: null },
        ],
      };
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-cond-gt',
        jsonnode_definition: condDef,
        initial_data: { session_id: 's', work_id: 'w', interact_id: 'i', user_query: 'Test', work_context: {}, complexity: 60 },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await jsonNode.execJSONNode(input, output, ctx);
      expect(output.execution_trace.map(t => t.node_id)).toContain('839f1f73-3902-4745-9a18-75c0b619ce61');
    });
  });

  // =========================================================================
  // 3. validate
  // =========================================================================
  describe('validate', () => {
    it('TC-VAL-001: 校验合法的 JSONNode 定义', () => {
      const input = Object.assign(new ValidateJSONNodeInput(), { jsonnode_definition: simpleDef });
      const output = new ValidateJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.validate(input, output, ctx);
      expect(result).toBe(true);
      expect(output.valid).toBe(true);
      expect(output.errors).toEqual([]);
    });

    it('TC-VAL-003: version 缺失', () => {
      const invalidDef = { orchestration_id: 'test', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f', nodes: [] } as JSONNodeDefinition;
      const input = Object.assign(new ValidateJSONNodeInput(), { jsonnode_definition: invalidDef });
      const output = new ValidateJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.validate(input, output, ctx);
      expect(result).toBe(true);
      expect(output.valid).toBe(false);
      expect(output.errors.some(e => e.includes('version'))).toBe(true);
    });

    it('TC-VAL-004: version 不为 "1.0"', () => {
      const invalidDef: JSONNodeDefinition = { version: '2.0', orchestration_id: 'test', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f', nodes: [] };
      const input = Object.assign(new ValidateJSONNodeInput(), { jsonnode_definition: invalidDef });
      const output = new ValidateJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.validate(input, output, ctx);
      expect(result).toBe(true);
      expect(output.valid).toBe(false);
    });

    it('TC-VAL-005: start_node 缺失', () => {
      const invalidDef = { version: '1.0', orchestration_id: 'test', nodes: [] } as JSONNodeDefinition;
      const input = Object.assign(new ValidateJSONNodeInput(), { jsonnode_definition: invalidDef });
      const output = new ValidateJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.validate(input, output, ctx);
      expect(result).toBe(true);
      expect(output.valid).toBe(false);
      expect(output.errors.some(e => e.includes('start_node'))).toBe(true);
    });

    it('TC-VAL-006: start_node 不在 nodes 中', () => {
      const invalidDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'test', start_node: 'nonexistent',
        nodes: [{ node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: {}, next: null }],
      };
      const input = Object.assign(new ValidateJSONNodeInput(), { jsonnode_definition: invalidDef });
      const output = new ValidateJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.validate(input, output, ctx);
      expect(result).toBe(true);
      expect(output.valid).toBe(false);
    });

    it('TC-VAL-007: node_id 不唯一', () => {
      const invalidDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'test', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [
          { node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: {}, next: null },
          { node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'HANDLE_ERROR', params: {}, next: null },
        ],
      };
      const input = Object.assign(new ValidateJSONNodeInput(), { jsonnode_definition: invalidDef });
      const output = new ValidateJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.validate(input, output, ctx);
      expect(result).toBe(true);
      expect(output.valid).toBe(false);
      expect(output.errors.some(e => e.toLowerCase().includes('duplicate') || e.includes('重复'))).toBe(true);
    });

    it('TC-VAL-008: node_type 未注册', () => {
      const invalidDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'test', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [{ node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'UNKNOWN_TYPE', params: {}, next: null }],
      };
      const input = Object.assign(new ValidateJSONNodeInput(), { jsonnode_definition: invalidDef });
      const output = new ValidateJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.validate(input, output, ctx);
      expect(result).toBe(true);
      expect(output.valid).toBe(false);
    });

    it('TC-VAL-009: next 引用不存在的节点', () => {
      const invalidDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'test', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [{ node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: {}, next: 'nonexistent' }],
      };
      const input = Object.assign(new ValidateJSONNodeInput(), { jsonnode_definition: invalidDef });
      const output = new ValidateJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.validate(input, output, ctx);
      expect(result).toBe(true);
      expect(output.valid).toBe(false);
    });

    it('TC-VAL-013: DAG 有环', () => {
      const cyclicDef: JSONNodeDefinition = {
        version: '1.0', orchestration_id: 'cyclic', start_node: 'de43b808-a9b7-48c1-8744-7602a483328f',
        nodes: [
          { node_id: 'de43b808-a9b7-48c1-8744-7602a483328f', node_type: 'SAVE_USER_INPUT', params: {}, next: 'bea3c048-aa35-4ab3-bda7-c2de0c6b2713' },
          { node_id: 'bea3c048-aa35-4ab3-bda7-c2de0c6b2713', node_type: 'BUILD_WORK_CONTEXT', params: {}, next: 'de43b808-a9b7-48c1-8744-7602a483328f' },
        ],
      };
      const input = Object.assign(new ValidateJSONNodeInput(), { jsonnode_definition: cyclicDef });
      const output = new ValidateJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.validate(input, output, ctx);
      expect(result).toBe(true);
      expect(output.valid).toBe(false);
      expect(output.errors.some(e => e.includes('环') || e.includes('cycle'))).toBe(true);
    });
  });

  // =========================================================================
  // 4. registerNodeType
  // =========================================================================
  describe('registerNodeType', () => {
    it('TC-RNT-001: 注册自定义节点类型', () => {
      const handler: NodeHandler = async (sharedData, _params, _context) => { sharedData.custom_done = true; };
      const input = Object.assign(new RegisterNodeTypeInput(), { node_type: 'custom_type', handler });
      const output = new RegisterNodeTypeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.registerNodeType(input, output, ctx);
      expect(result).toBe(true);
      expect(output.registered).toBe(true);
    });

    it('TC-RNT-003: node_type 为空', () => {
      const handler: NodeHandler = async () => {};
      const input = Object.assign(new RegisterNodeTypeInput(), { node_type: '', handler });
      const output = new RegisterNodeTypeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.registerNodeType(input, output, ctx);
      expect(result).toBe(false);
    });

    it('TC-RNT-004: node_type 与内置节点重名', () => {
      const handler: NodeHandler = async () => {};
      const input = Object.assign(new RegisterNodeTypeInput(), { node_type: 'SAVE_USER_INPUT', handler });
      const output = new RegisterNodeTypeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.registerNodeType(input, output, ctx);
      expect(result).toBe(false);
    });

    it('TC-RNT-005: handler 不是函数', () => {
      const input = Object.assign(new RegisterNodeTypeInput(), { node_type: 'test', handler: 'not_a_function' as any });
      const output = new RegisterNodeTypeOutput();
      const ctx = new JSONNodeContext();

      const result = jsonNode.registerNodeType(input, output, ctx);
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 5. configJSONNode
  // =========================================================================
  describe('configJSONNode', () => {
    it('TC-CJN-001: 更新 max_execution_depth', async () => {
      const input = Object.assign(new ConfigJSONNodeInput(), { max_execution_depth: 100 });
      const output = new ConfigJSONNodeOutput();
      const ctx = new JSONNodeContext();

      const result = await jsonNode.configJSONNode(input, output, ctx);
      expect(result).toBe(true);
    });

    it('TC-CJN-005: max_execution_depth 为负数', async () => {
      const input = Object.assign(new ConfigJSONNodeInput(), { max_execution_depth: -1 });
      const output = new ConfigJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await expect(jsonNode.configJSONNode(input, output, ctx)).rejects.toThrow();
    });

    it('TC-CJN-007: node_timeout_ms 为负数', async () => {
      const input = Object.assign(new ConfigJSONNodeInput(), { node_timeout_ms: -1 });
      const output = new ConfigJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await expect(jsonNode.configJSONNode(input, output, ctx)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 6. soJSONNodeTrace
  // =========================================================================
  describe('soJSONNodeTrace', () => {
    it('TC-GJT-001: 查询执行追踪', async () => {
      const input = Object.assign(new GetJSONNodeTraceInput(), { orchestration_id: 'orch-1' });
      const output = new GetJSONNodeTraceOutput();
      const ctx = new JSONNodeContext();

      const result = await jsonNode.soJSONNodeTrace(input, output, ctx);
      expect(result).toBe(true);
    });

    it('TC-GJT-002: 查询无记录的 orchestration_id', async () => {
      const input = Object.assign(new GetJSONNodeTraceInput(), { orchestration_id: 'nonexistent' });
      const output = new GetJSONNodeTraceOutput();
      const ctx = new JSONNodeContext();

      const result = await jsonNode.soJSONNodeTrace(input, output, ctx);
      expect(result).toBe(true);
      expect(output.trace).toEqual([]);
    });
  });

  // =========================================================================
  // 7. AOP 代理
  // =========================================================================
  describe('AOP proxy', () => {
    it('TC-AOP-001: 方法调用后 output.elapsed_ms 存在', async () => {
      const input = Object.assign(new ExecJSONNodeInput(), {
        orchestration_id: 'orch-aop',
        jsonnode_definition: simpleDef,
        initial_data: { session_id: 's', work_id: 'w', interact_id: 'i', user_query: 'Test', work_context: {} },
      });
      const output = new ExecJSONNodeOutput();
      const ctx = new JSONNodeContext();

      await jsonNode.execJSONNode(input, output, ctx);
      expect(output.elapsed_ms).toBeDefined();
      expect(output.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });
  });
});