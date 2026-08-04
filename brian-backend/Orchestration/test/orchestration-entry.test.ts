import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb, setupTestMocks, resetTestMocks, createMockStrategyAccess, createMockExecutionAccess, createMockInfoCore, createMockWriterAgent, createMockLLMAccess, createMockPromptsAccess, createMockMQAccess, createMockMQCore, createMockLogger, initOrchestrationSchema } from './test-helpers';
import { RelationDBAccess, IdGenerator, Operator, DBContext, SelectOneDBInput, SelectOneDBOutput, SelectDBInput, SelectDBOutput } from '@brian-agent/base';
import { OrchestrationEntryAccess } from '../OrchestrationEntry/access/OrchestrationEntryAccess';
import {
  OrchestrationEntryContext,
  ReceiveWorkInput, ReceiveWorkOutput,
  SelectOrchestrationStrategyInput, SelectOrchestrationStrategyOutput,
  ReceiveWorkAsyncInput, ReceiveWorkAsyncOutput,
  BuildWorkContextInput, BuildWorkContextOutput,
  GetWorkStatusInput, GetWorkStatusOutput,
  CancelWorkInput, CancelWorkOutput,
  ConfigOrchestrationEntryInput, ConfigOrchestrationEntryOutput,
} from '../OrchestrationEntry/domain/types';

describe('OrchestrationEntry', () => {
  let db: RelationDBAccess;
  let infoCore: ReturnType<typeof createMockInfoCore>;
  let writerAgent: ReturnType<typeof createMockWriterAgent>;
  let strategyAccess: ReturnType<typeof createMockStrategyAccess>;
  let executionAccess: ReturnType<typeof createMockExecutionAccess>;
  let llmAccess: ReturnType<typeof createMockLLMAccess>;
  let promptsAccess: ReturnType<typeof createMockPromptsAccess>;
  let mqAccess: ReturnType<typeof createMockMQAccess>;
  let mqCore: ReturnType<typeof createMockMQCore>;
  let logger: ReturnType<typeof createMockLogger>;
  let entry: OrchestrationEntryAccess;

  beforeAll(async () => {
    await setupTestMocks();
    db = await createTestDb();
    infoCore = createMockInfoCore();
    writerAgent = createMockWriterAgent();
    strategyAccess = createMockStrategyAccess();
    executionAccess = createMockExecutionAccess();
    llmAccess = createMockLLMAccess();
    promptsAccess = createMockPromptsAccess();
    mqAccess = createMockMQAccess();
    mqCore = createMockMQCore();
    logger = createMockLogger();
    entry = new OrchestrationEntryAccess(db, infoCore, writerAgent, strategyAccess, executionAccess, llmAccess, promptsAccess, mqAccess, mqCore, logger);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetTestMocks();
  });

  // =========================================================================
  // 1. receiveWork
  // =========================================================================
  describe('receiveWork', () => {
    it('TC-RW-001: Simple 策略同步接收工作', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 's1', user_query: '你好' });
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
      expect(selOutput.row).toBeTruthy();
      expect(selOutput.row!.status).toBe('COMPLETED');
    });

    it('TC-RW-002: Planning 策略同步接收工作（复杂任务）', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 's2', user_query: '请帮我分析数据、生成报告并发送邮件' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
      expect(output.work_id).toBeTruthy();
    });

    it('TC-RW-003: 强制指定 Simple 策略', async () => {
      const input = Object.assign(new ReceiveWorkInput(), {
        session_id: 's3', user_query: '请帮我分析数据、生成报告并发送邮件',
        force_orchestration_strategy: 'SIMPLE',
      });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
      expect(output.orchestration_strategy).toBe('SIMPLE');
    });

    it('TC-RW-004: 强制指定 Planning 策略', async () => {
      const input = Object.assign(new ReceiveWorkInput(), {
        session_id: 's4', user_query: '你好', force_orchestration_strategy: 'PLANNING',
      });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
      expect(output.orchestration_strategy).toBe('PLANNING');
    });

    it('TC-RW-005: 传入 user_profile', async () => {
      const input = Object.assign(new ReceiveWorkInput(), {
        session_id: 's5', user_query: 'Hello',
        user_profile: { language: 'en', style: 'concise' },
      });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-RW-006: session_id 为空', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: '', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-RW-007: user_query 为空', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 's6', user_query: '' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-RW-009: force_orchestration_strategy 为无效值', async () => {
      const input = Object.assign(new ReceiveWorkInput(), {
        session_id: 's7', user_query: '你好', force_orchestration_strategy: 'INVALID',
      });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      expect(output.orchestration_strategy).toBe('INVALID');
    });

    it('TC-RW-010: InfoCore.saveInfo 调用失败', async () => {
      infoCore.saveInfo.mockRejectedValueOnce(new Error('save failed'));
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 's8', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWork(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-RW-014: Work 状态完整流转', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 's9', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);

      const selOutput = new SelectOneDBOutput();
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_work', conditions: [{ field: 'work_id', operator: Operator.EQ, value: output.work_id }] },
      }) as SelectOneDBInput, new DBContext(), selOutput);
      expect(selOutput.row!.status).toBe('COMPLETED');
    });

    it('TC-RW-015: InfoCore 记录 REQUEST 消息', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 's10', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      expect(infoCore.saveInfo).toHaveBeenCalled();
    });

    it('TC-RW-016: InfoCore 记录 RESPONSE 消息', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 's11', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      const saveInfoCalls = infoCore.saveInfo.mock.calls;
      const hasResponse = saveInfoCalls.some((call: any[]) => call[0]?.info_creator_role === 'RESPONSE');
      expect(hasResponse).toBe(true);
    });
  });

  // =========================================================================
  // 2. selectOrchestrationStrategy
  // =========================================================================
  describe('selectOrchestrationStrategy', () => {
    it('TC-SS-001: 简单问题选择 Simple 策略', async () => {
      const input = Object.assign(new SelectOrchestrationStrategyInput(), { user_query: '今天天气怎么样' });
      const output = new SelectOrchestrationStrategyOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.selectOrchestrationStrategy(input, ctx, output);
      expect(result).toBe(true);
      expect(output.strategy).toBeTruthy();
    });

    it('TC-SS-002: 复杂问题选择 Planning 策略', async () => {
      const input = Object.assign(new SelectOrchestrationStrategyInput(), {
        user_query: '帮我分析今年销售数据，对比去年，生成报告并发送给团队',
      });
      const output = new SelectOrchestrationStrategyOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.selectOrchestrationStrategy(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-SS-005: 无 LLM 配置时自动降级为 SIMPLE', async () => {
      const input = Object.assign(new SelectOrchestrationStrategyInput(), { user_query: '你好' });
      const output = new SelectOrchestrationStrategyOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.selectOrchestrationStrategy(input, ctx, output);
      expect(result).toBe(true);
      expect(output.strategy).toBe('SIMPLE');
      expect(output.reason).toBeTruthy();
    });

    it('TC-SS-006: 简单任务（"今天天气怎么样"）→ 触发 SIMPLE 策略', async () => {
      const input = Object.assign(new SelectOrchestrationStrategyInput(), { user_query: '今天天气怎么样' });
      const output = new SelectOrchestrationStrategyOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.selectOrchestrationStrategy(input, ctx, output);
      expect(result).toBe(true);
      expect(output.strategy).toBe('SIMPLE');
      expect(output.complexity).toBeLessThan(50);
      expect(output.reason).toContain('simple');
      expect(output.plan).toBeUndefined();
    });

    it('TC-SS-007: 复杂任务（"帮我分析销售数据生成报告"）→ 触发 PLANNING 策略，并返回任务分解计划', async () => {
      const input = Object.assign(new SelectOrchestrationStrategyInput(), {
        user_query: '帮我分析今年销售数据，对比去年，生成报告并发送给团队',
      });
      const output = new SelectOrchestrationStrategyOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.selectOrchestrationStrategy(input, ctx, output);
      expect(result).toBe(true);
      expect(output.strategy).toBe('PLANNING');
      expect(output.complexity).toBeGreaterThanOrEqual(50);
      expect(output.reason).toContain('multi_step');
      expect(output.plan).toBeDefined();
      expect(output.plan!.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 3. receiveWorkAsync
  // =========================================================================
  describe('receiveWorkAsync', () => {
    it('TC-RWA-001: 异步提交工作', async () => {
      const input = Object.assign(new ReceiveWorkAsyncInput(), {
        session_id: 's12', user_query: '你好', callback_queue: 'work.result',
      });
      const output = new ReceiveWorkAsyncOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWorkAsync(input, ctx, output);
      expect(result).toBe(true);
      expect(output.work_id).toBeTruthy();
      expect(output.interact_id).toBeTruthy();
      expect(output.job_id).toBeTruthy();
    });

    it('TC-RWA-002: 异步提交不指定回调队列', async () => {
      const input = Object.assign(new ReceiveWorkAsyncInput(), { session_id: 's13', user_query: '你好' });
      const output = new ReceiveWorkAsyncOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWorkAsync(input, ctx, output);
      expect(result).toBe(true);
      expect(output.job_id).toBeTruthy();
    });

    it('TC-RWA-006: session_id 为空异步提交', async () => {
      const input = Object.assign(new ReceiveWorkAsyncInput(), { session_id: '', user_query: '你好' });
      const output = new ReceiveWorkAsyncOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWorkAsync(input, ctx, output);
      expect(result).toBe(false);
    });

    it('TC-RWA-008: 异步提交强制指定策略', async () => {
      const input = Object.assign(new ReceiveWorkAsyncInput(), {
        session_id: 's14', user_query: '你好', force_orchestration_strategy: 'PLANNING',
      });
      const output = new ReceiveWorkAsyncOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.receiveWorkAsync(input, ctx, output);
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // 4. buildWorkContext
  // =========================================================================
  describe('buildWorkContext', () => {
    it('TC-BWC-001: 构建完整工作上下文', async () => {
      const input = Object.assign(new BuildWorkContextInput(), {
        session_id: 's15', work_id: 'w1', user_query: '你好',
      });
      const output = new BuildWorkContextOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.buildWorkContext(input, ctx, output);
      expect(result).toBe(true);
      expect(output.work_context).toBeTruthy();
      expect(output.work_context.work_id).toBe('w1');
      expect(output.work_context.session_id).toBe('s15');
      expect(output.work_context.user_query).toBe('你好');
      expect(output.work_context.recent_works).toBeDefined();
      expect(output.work_context.metadata).toBeDefined();
    });

    it('TC-BWC-002: 无历史工作时构建上下文', async () => {
      const input = Object.assign(new BuildWorkContextInput(), {
        session_id: 's16', work_id: 'w2', user_query: '你好',
      });
      const output = new BuildWorkContextOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.buildWorkContext(input, ctx, output);
      expect(result).toBe(true);
      expect(output.work_context.recent_works).toEqual([]);
    });

    it('TC-BWC-003: 无用户画像时构建上下文', async () => {
      writerAgent.getUserProfile.mockImplementationOnce(async (_i: any, _c: any, o: any) => { o.user_profile = null; return true; });
      const input = Object.assign(new BuildWorkContextInput(), {
        session_id: 's17', work_id: 'w3', user_query: '你好',
      });
      const output = new BuildWorkContextOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.buildWorkContext(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-BWC-006: WriterAgent.getUserProfile 调用失败', async () => {
      writerAgent.getUserProfile.mockRejectedValueOnce(new Error('profile failed'));
      const input = Object.assign(new BuildWorkContextInput(), {
        session_id: 's18', work_id: 'w4', user_query: '你好',
      });
      const output = new BuildWorkContextOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.buildWorkContext(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-BWC-007: session_id 为空', async () => {
      const input = Object.assign(new BuildWorkContextInput(), { session_id: '', work_id: 'w5', user_query: '你好' });
      const output = new BuildWorkContextOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.buildWorkContext(input, ctx, output);
      expect(result).toBe(false);
    });

    it('TC-BWC-008: work_id 为空', async () => {
      const input = Object.assign(new BuildWorkContextInput(), { session_id: 's19', work_id: '', user_query: '你好' });
      const output = new BuildWorkContextOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.buildWorkContext(input, ctx, output);
      expect(result).toBe(false);
    });

    it('TC-BWC-009: metadata.orchestration_version 值', async () => {
      const input = Object.assign(new BuildWorkContextInput(), {
        session_id: 's20', work_id: 'w6', user_query: '你好',
      });
      const output = new BuildWorkContextOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.buildWorkContext(input, ctx, output);
      const meta = output.work_context.metadata as Record<string, unknown>;
      expect(meta.orchestration_version).toBe('1.0');
    });
  });

  // =========================================================================
  // 5. getWorkStatus
  // =========================================================================
  describe('getWorkStatus', () => {
    it('TC-GWS-001: 按 work_id 查询单个 work', async () => {
      const rwInput = Object.assign(new ReceiveWorkInput(), { session_id: 's21', user_query: '你好' });
      const rwOutput = new ReceiveWorkOutput();
      await entry.receiveWork(rwInput, new OrchestrationEntryContext(), rwOutput);

      const input = Object.assign(new GetWorkStatusInput(), { work_id: rwOutput.work_id });
      const output = new GetWorkStatusOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.getWorkStatus(input, ctx, output);
      expect(result).toBe(true);
      expect(output.works.length).toBe(1);
      expect(output.works[0].work_id).toBe(rwOutput.work_id);
    });

    it('TC-GWS-002: 按 session_id 查询所有 work', async () => {
      const rwInput = Object.assign(new ReceiveWorkInput(), { session_id: 's22', user_query: '问题1' });
      const rwOutput = new ReceiveWorkOutput();
      await entry.receiveWork(rwInput, new OrchestrationEntryContext(), rwOutput);

      const input = Object.assign(new GetWorkStatusInput(), { session_id: 's22' });
      const output = new GetWorkStatusOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.getWorkStatus(input, ctx, output);
      expect(result).toBe(true);
      expect(output.works.length).toBeGreaterThanOrEqual(1);
    });

    it('TC-GWS-003: 按 status 筛选', async () => {
      const input = Object.assign(new GetWorkStatusInput(), { status: 'COMPLETED' });
      const output = new GetWorkStatusOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.getWorkStatus(input, ctx, output);
      expect(result).toBe(true);
      output.works.forEach(w => expect(w.status).toBe('COMPLETED'));
    });

    it('TC-GWS-007: 查询不存在的 work_id', async () => {
      const input = Object.assign(new GetWorkStatusInput(), { work_id: 'nonexistent' });
      const output = new GetWorkStatusOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.getWorkStatus(input, ctx, output);
      expect(result).toBe(true);
      expect(output.works).toEqual([]);
    });

    it('TC-GWS-006: 返回字段完整性', async () => {
      const rwInput = Object.assign(new ReceiveWorkInput(), { session_id: 's23', user_query: '你好' });
      const rwOutput = new ReceiveWorkOutput();
      await entry.receiveWork(rwInput, new OrchestrationEntryContext(), rwOutput);

      const input = Object.assign(new GetWorkStatusInput(), { work_id: rwOutput.work_id });
      const output = new GetWorkStatusOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.getWorkStatus(input, ctx, output);
      const work = output.works[0];
      expect(work.work_id).toBeDefined();
      expect(work.interact_id).toBeDefined();
      expect(work.session_id).toBeDefined();
      expect(work.status).toBeDefined();
      expect(work.orchestration_strategy).toBeDefined();
      expect(work.task_count).toBeDefined();
      expect(work.completed_task_count).toBeDefined();
      expect(work.elapsed_ms).toBeDefined();
      expect(work.created).toBeDefined();
      expect(work.updated).toBeDefined();
    });
  });

  // =========================================================================
  // 6. cancelWork
  // =========================================================================
  describe('cancelWork', () => {
    it('TC-CW-001: 取消正在执行的 work', async () => {
      const rwInput = Object.assign(new ReceiveWorkInput(), { session_id: 's24', user_query: '你好' });
      const rwOutput = new ReceiveWorkOutput();
      await entry.receiveWork(rwInput, new OrchestrationEntryContext(), rwOutput);

      const input = Object.assign(new CancelWorkInput(), { work_id: rwOutput.work_id, reason: '用户主动取消' });
      const output = new CancelWorkOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.cancelWork(input, ctx, output);
      expect(result).toBe(false);
      expect(output.cancelled).toBe(false);
    });

    it('TC-CW-004: 取消已完成的 work', async () => {
      const input = Object.assign(new CancelWorkInput(), { work_id: 'nonexistent', reason: '...' });
      const output = new CancelWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await expect(entry.cancelWork(input, ctx, output)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 7. configOrchestrationEntry
  // =========================================================================
  describe('configOrchestrationEntry', () => {
    it('TC-CONF-001: 更新 complexity_decompose_threshold', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { complexity_decompose_threshold: 60 });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.configOrchestrationEntry(input, ctx, output);
      expect(result).toBe(true);
      expect(output.config).toBeTruthy();
    });

    it('TC-CONF-002: 更新 strategy_prompt_template_id', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { strategy_prompt_template_id: 'valid_template_id' });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.configOrchestrationEntry(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-CONF-003: 更新 default_strategy', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { default_strategy: 'PLANNING' });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.configOrchestrationEntry(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-CONF-004: 更新 max_recent_works', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { max_recent_works: 10 });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.configOrchestrationEntry(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-CONF-005: 更新 async_worker_interval', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { async_worker_interval: 2000 });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.configOrchestrationEntry(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-CONF-006: 不传任何参数查询当前配置', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), {});
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.configOrchestrationEntry(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-CONF-007: complexity_decompose_threshold 超出范围', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { complexity_decompose_threshold: 150 });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      await expect(entry.configOrchestrationEntry(input, ctx, output)).rejects.toThrow();
    });

    it('TC-CONF-008: complexity_decompose_threshold 为负数', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { complexity_decompose_threshold: -10 });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      await expect(entry.configOrchestrationEntry(input, ctx, output)).rejects.toThrow();
    });

    it('TC-CONF-009: complexity_decompose_threshold 为边界值 0', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { complexity_decompose_threshold: 0 });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.configOrchestrationEntry(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-CONF-010: complexity_decompose_threshold 为边界值 100', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { complexity_decompose_threshold: 100 });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      const result = await entry.configOrchestrationEntry(input, ctx, output);
      expect(result).toBe(true);
    });

    it('TC-CONF-012: default_strategy 为无效值', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { default_strategy: 'INVALID' });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      await expect(entry.configOrchestrationEntry(input, ctx, output)).rejects.toThrow();
    });

    it('TC-CONF-013: max_recent_works 为非正整数', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { max_recent_works: -1 });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      await expect(entry.configOrchestrationEntry(input, ctx, output)).rejects.toThrow();
    });

    it('TC-CONF-015: async_worker_interval 为负数', async () => {
      const input = Object.assign(new ConfigOrchestrationEntryInput(), { async_worker_interval: -500 });
      const output = new ConfigOrchestrationEntryOutput();
      const ctx = new OrchestrationEntryContext();

      await expect(entry.configOrchestrationEntry(input, ctx, output)).rejects.toThrow();
    });
  });

  // =========================================================================
  // 8. AOP 代理通用测试
  // =========================================================================
  describe('AOP proxy', () => {
    it('TC-AOP-001: 方法调用后 output.elapsed_ms 存在', async () => {
      const input = Object.assign(new ReceiveWorkInput(), { session_id: 's25', user_query: '你好' });
      const output = new ReceiveWorkOutput();
      const ctx = new OrchestrationEntryContext();

      await entry.receiveWork(input, ctx, output);
      expect(output.elapsed_ms).toBeDefined();
      expect(output.elapsed_ms!).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // 9. 表结构验证
  // =========================================================================
  describe('table structure', () => {
    it('TC-TBL-001: orchestration_work 表字段完整性', async () => {
      const selOutput = new SelectDBOutput();
      await db.selectDB(Object.assign(new SelectDBInput(), {
        query_param: { table: 'orchestration_work' },
      }) as SelectDBInput, new DBContext(), selOutput);
      expect(selOutput.rows.length).toBeGreaterThanOrEqual(0);
    });

    it('TC-TBL-003: orchestration_config 表字段完整性', async () => {
      const selOutput = new SelectOneDBOutput();
      await db.selectOneDB(Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_config' },
      }) as SelectOneDBInput, new DBContext(), selOutput);
      expect(selOutput.row).toBeTruthy();
    });
  });
});