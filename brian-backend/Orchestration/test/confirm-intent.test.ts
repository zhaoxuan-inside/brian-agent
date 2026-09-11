import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import {
  createTestDb, setupTestMocks,
  createMockStrategyAccess, createMockExecutionAccess, createMockInfoCore, createMockWriterAgent,
  createMockLLMAccess, createMockPromptsAccess, createMockMQAccess, createMockMQCore, createMockLogger,
} from './test-helpers';
import { RelationDBAccess, Operator, DBContext, SelectOneDBInput, SelectOneDBOutput, NotFoundError, ValidationError } from '@brian-agent/base';
import { OrchestrationEntryAccess } from '../OrchestrationEntry/access/OrchestrationEntryAccess';
import {
  OrchestrationEntryContext,
  ReceiveWorkInput, ReceiveWorkOutput,
  ConfirmIntentInput, ConfirmIntentOutput,
} from '../OrchestrationEntry/domain/types';

describe('OrchestrationEntry.confirmIntent', () => {
  let db: RelationDBAccess;
  let entry: OrchestrationEntryAccess;
  let intentAgent: any;
  let streamAccess: any;
  let strategyAccess: ReturnType<typeof createMockStrategyAccess>;

  beforeAll(async () => {
    await setupTestMocks();
    db = await createTestDb();
    strategyAccess = createMockStrategyAccess();
    const infoCore = createMockInfoCore();
    const writerAgent = createMockWriterAgent();
    const executionAccess = createMockExecutionAccess();
    const llmAccess = createMockLLMAccess();
    const promptsAccess = createMockPromptsAccess();
    const mqAccess = createMockMQAccess();
    const mqCore = createMockMQCore();
    const logger = createMockLogger();

    // 模拟需求理解 Agent：默认返回「主题部分重叠、低置信」结果，触发 ASK 暂停（人工确认路径）
    intentAgent = {
      understandRequirement: vi.fn().mockImplementation(async (_i: any, o: any, _c: any) => {
        o.understood_requirement = '请调研 AI 大模型的训练成本并给出采购建议';
        o.match_score = 25;
        o.threshold_score = 80;
        o.reasoning = '改写与原文可能不是同一件事';
        o.should_modify_query = true;
        o.has_context = false;
        return true;
      }),
    };
    streamAccess = {
      pushEvent: vi.fn().mockResolvedValue(true),
    };

    entry = new OrchestrationEntryAccess(
      db, infoCore, writerAgent, strategyAccess, executionAccess,
      llmAccess, promptsAccess, mqAccess, mqCore, logger,
      intentAgent, streamAccess,
    );
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ASK_QUERY = '研究 AI Agent 的安全问题';
  const ASK_UNDERSTOOD = '请调研 AI 大模型的训练成本并给出采购建议';

  async function pauseWork(sessionId: string, userQuery: string = ASK_QUERY): Promise<ReceiveWorkOutput> {
    const input = Object.assign(new ReceiveWorkInput(), { session_id: sessionId, user_query: userQuery });
    const output = new ReceiveWorkOutput();
    const ctx = new OrchestrationEntryContext();
    await entry.receiveWork(input, output, ctx);
    return output;
  }

  async function soWorkStatus(workId: string): Promise<string> {
    const selOut = new SelectOneDBOutput();
    await db.selectOneDB(
      Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'orchestration_work', conditions: [{ field: 'work_id', operator: Operator.EQ, value: workId }] },
      }),
      selOut,
      new DBContext(),
    );
    return String(selOut.row?.status ?? '');
  }

  it('TC-CI-001: APPROVE 确认后重入编排并完成', async () => {
    const rwOut = await pauseWork('ci-s1');
    expect(rwOut.paused).toBe(true);
    expect(rwOut.final_response).toBe('');
    expect(await soWorkStatus(rwOut.work_id)).toBe('PAUSED_WAITING_CONFIRMATION');

    const input = Object.assign(new ConfirmIntentInput(), {
      session_id: 'ci-s1',
      work_id: rwOut.work_id,
      action: 'APPROVE',
      understood_requirement: '理解后的需求',
    });
    const output = new ConfirmIntentOutput();
    const ctx = new OrchestrationEntryContext();
    const ok = await entry.confirmIntent(input, output, ctx);

    expect(ok).toBe(true);
    expect(output.success).toBe(true);
    expect(output.action_applied).toBe('APPROVE');
    expect(output.next_status).toBe('PROCESSING');
    expect(await soWorkStatus(rwOut.work_id)).toBe('COMPLETED');
  });

  it('TC-CI-002: KEEP 按原文执行仍能完成', async () => {
    const rwOut = await pauseWork('ci-s2');
    expect(rwOut.paused).toBe(true);

    const input = Object.assign(new ConfirmIntentInput(), {
      session_id: 'ci-s2',
      work_id: rwOut.work_id,
      action: 'KEEP',
    });
    const output = new ConfirmIntentOutput();
    const ctx = new OrchestrationEntryContext();
    const ok = await entry.confirmIntent(input, output, ctx);

    expect(ok).toBe(true);
    expect(output.success).toBe(true);
    expect(output.action_applied).toBe('KEEP');
    expect(await soWorkStatus(rwOut.work_id)).toBe('COMPLETED');
  });

  it('TC-CI-003: CANCEL 将 work 置为 CANCELLED 并推送 cancelled 事件', async () => {
    const rwOut = await pauseWork('ci-s3');
    expect(rwOut.paused).toBe(true);

    const input = Object.assign(new ConfirmIntentInput(), {
      session_id: 'ci-s3',
      work_id: rwOut.work_id,
      action: 'CANCEL',
    });
    const output = new ConfirmIntentOutput();
    const ctx = new OrchestrationEntryContext();
    const ok = await entry.confirmIntent(input, output, ctx);

    expect(ok).toBe(true);
    expect(output.success).toBe(true);
    expect(output.action_applied).toBe('CANCEL');
    expect(output.next_status).toBe('CANCELLED');
    expect(await soWorkStatus(rwOut.work_id)).toBe('CANCELLED');
    expect(streamAccess.pushEvent).toHaveBeenCalled();
  });

  it('TC-CI-004: 缺少 work_id 抛 ValidationError', async () => {
    const input = Object.assign(new ConfirmIntentInput(), {
      session_id: 'ci-s4',
      action: 'KEEP',
    });
    const output = new ConfirmIntentOutput();
    const ctx = new OrchestrationEntryContext();
    await expect(entry.confirmIntent(input, output, ctx)).rejects.toBeInstanceOf(ValidationError);
  });

  it('TC-CI-005: 不存在的 work_id 抛 NotFoundError', async () => {
    const input = Object.assign(new ConfirmIntentInput(), {
      session_id: 'ci-s5',
      work_id: 'non-existent-work-id',
      action: 'KEEP',
    });
    const output = new ConfirmIntentOutput();
    const ctx = new OrchestrationEntryContext();
    await expect(entry.confirmIntent(input, output, ctx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('TC-CI-006: APPROVE 重入不再触发 IntentAgent（skip_intent_check）', async () => {
    const rwOut = await pauseWork('ci-s6');
    expect(intentAgent.understandRequirement).toHaveBeenCalledTimes(1);

    const input = Object.assign(new ConfirmIntentInput(), {
      session_id: 'ci-s6',
      work_id: rwOut.work_id,
      action: 'APPROVE',
      understood_requirement: ASK_UNDERSTOOD,
    });
    const output = new ConfirmIntentOutput();
    const ctx = new OrchestrationEntryContext();
    await entry.confirmIntent(input, output, ctx);

    expect(intentAgent.understandRequirement).toHaveBeenCalledTimes(1);
  });

  it('TC-CI-007: 主题偏离时自动按原文执行，不暂停询问', async () => {
    intentAgent.understandRequirement.mockImplementationOnce(async (_i: any, o: any) => {
      o.understood_requirement = '理解后的需求';
      o.match_score = 30;
      o.threshold_score = 80;
      o.reasoning = '主题偏离';
      o.should_modify_query = true;
      o.has_context = false;
      return true;
    });

    const rwOut = await pauseWork('ci-s7', '原始提问');
    expect(rwOut.paused).toBe(false);
    expect(rwOut.final_response).toBeTruthy();
    expect(await soWorkStatus(rwOut.work_id)).toBe('COMPLETED');
    expect(strategyAccess.startOrchestration).toHaveBeenCalled();
    const startArg = (strategyAccess.startOrchestration as any).mock.calls[0][0];
    expect(startArg.user_query).toBe('原始提问');
    expect(startArg.original_user_query).toBe('原始提问');
    expect(streamAccess.pushEvent).not.toHaveBeenCalledWith(
      'ci-s7',
      'intent_confirmation_required',
      expect.anything(),
      expect.anything(),
    );
  });

  it('TC-CI-008: 同一主题扩写时自动按理解执行，对话仍保存原文', async () => {
    const understood = '请全面调研 AI Agent 的定义、核心架构、主流框架、应用场景与前沿挑战，输出一份结构化的技术研究报告';
    intentAgent.understandRequirement.mockImplementationOnce(async (_i: any, o: any) => {
      o.understood_requirement = understood;
      o.match_score = 40;
      o.threshold_score = 80;
      o.reasoning = '短输入可合理扩写';
      o.should_modify_query = true;
      o.has_context = false;
      return true;
    });

    const rwOut = await pauseWork('ci-s8', '研究 Agent');
    expect(rwOut.paused).toBe(false);
    expect(await soWorkStatus(rwOut.work_id)).toBe('COMPLETED');
    const startArg = (strategyAccess.startOrchestration as any).mock.calls[0][0];
    expect(startArg.user_query).toBe(understood);
    expect(startArg.original_user_query).toBe('研究 Agent');
  });
});
