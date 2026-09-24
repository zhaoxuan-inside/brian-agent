/**
 * @fileoverview ask_user 编排原语工具 + Runs 挂起/应答 + curator LaneSemaphore 单元测试（阶段3 收尾）。
 *
 * 覆盖（Tools-PRD §8 验收）：
 * - ask_user 挂起-恢复：permission.asked/answered 事件、答复=下一条 user 消息（answerUserAsk 落库）；
 * - 超时归一为未应答（错误结果回流 / waitUserAnswer answered=false）；
 * - 重复应答幂等（第二次 answered=false）；
 * - LaneSemaphore 并发上限（background=2）。
 */

import { describe, it, expect } from 'vitest';
import { RelationDBAccess } from '@brian-agent/base';
import { askUserSkill } from '../SkillRuntime/application/askUserSkill';
import type { SkillExecutionContext } from '../SkillRuntime/domain/types';
import { RunGatewayService } from '../Runs/application/RunGatewayService';
import { SessionAccess } from '../Session/access/SessionAccess';
import { RunsSchemaInitializer } from '../Runs/infrastructure/RunsSchemaInitializer';
import { LaneSemaphore } from '../Runs/infrastructure/LaneSemaphore';
import {
  WaitUserAnswerInput,
  WaitUserAnswerOutput,
  AnswerUserAskInput,
  AnswerUserAskOutput,
  ConfigRunsInput,
  ConfigRunsOutput,
  RunGatewayContext,
} from '../Runs/domain/types';
import { SoMessagesInput, SoMessagesOutput, SessionContext } from '../Session/domain/types';

describe('askUserSkill（系统技能）', () => {
  const baseCtx = { run_id: 'run-1', session_key: 's-1' } as SkillExecutionContext;

  it('应该发出 permission.asked 并在应答后返回 ok 结果', async () => {
    const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
    let release: ((r: { answer: string; answered: boolean }) => void) | undefined;
    const tool = askUserSkill({
      waitAnswer: () => new Promise((resolve) => { release = resolve; }),
    });
    const pending = tool.execute({ question: '用哪个数据库？', kind: 'clarify' }, {
      ...baseCtx,
      emitEvent: (type, payload) => emitted.push({ type, payload: payload as Record<string, unknown> }),
    });
    const askPayload = emitted[0]?.payload as { permission_id?: string };
    expect(emitted[0].type).toBe('permission.asked');
    expect(askPayload.permission_id).toBeTruthy();
    release?.({ answer: '用 SQLite', answered: true });
    const result = await pending;
    expect(result.status).toBe('ok');
    expect(emitted[1].type).toBe('permission.answered');
  });

  it('超时未应答应该返回 error 结果（模型可自行收尾）', async () => {
    const tool = askUserSkill({
      waitAnswer: async () => ({ answer: '', answered: false }),
    });
    const result = await tool.execute({ question: '确认执行？' }, baseCtx);
    expect(result.status).toBe('error');
    expect(result.output).toContain('未及时答复');
  });

  it('缺 run 上下文时应该 fail-loud', async () => {
    const tool = askUserSkill({ waitAnswer: async () => ({ answer: 'x', answered: true }) });
    await expect(tool.execute({ question: 'q' }, {} as SkillExecutionContext)).rejects.toThrow('run 上下文');
  });
});

describe('RunGatewayService waitUserAnswer/answerUserAsk（答复=下一条 user 消息）', () => {
  it('answerUserAsk 应该唤醒挂起并把答复落库为 user 消息；重复应答幂等', async () => {
    const relationDb = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
    await relationDb.initialize();
    new RunsSchemaInitializer(relationDb).init();
    const session = new SessionAccess(relationDb);
    await session.initialize();
    const gateway = new RunGatewayService(relationDb, session, {} as never, {} as never);

    const waitIn = new WaitUserAnswerInput();
    waitIn.ask_id = 'ask-1';
    waitIn.run_id = 'run-1';
    waitIn.session_key = 'sess-1';
    const waitOut = new WaitUserAnswerOutput();
    const pending = gateway.waitUserAnswer(waitIn, waitOut, new RunGatewayContext());
    // 让出微任务：waitUserAnswer 注册 waiter 前有一次异步超时配置读取（生产中应答远晚于此窗口）
    await new Promise((resolve) => setTimeout(resolve, 5));

    const ansIn = new AnswerUserAskInput();
    ansIn.ask_id = 'ask-1';
    ansIn.answer = '  用 SQLite  ';
    const ansOut = new AnswerUserAskOutput();
    await gateway.answerUserAsk(ansIn, ansOut, new RunGatewayContext());
    expect(ansOut.answered).toBe(true);

    await pending;
    expect(waitOut.answer).toBe('用 SQLite');
    expect(waitOut.answered).toBe(true);

    // 消息挂内部 runtime_session.id（addSession 幂等解析），非外部 session_key
    const { AddSessionInput, AddSessionOutput } = await import('../Session/domain/types');
    const sessIn = new AddSessionInput();
    sessIn.session_key = 'sess-1';
    const sessOut = new AddSessionOutput();
    await session.addSession(sessIn, sessOut, new SessionContext());
    const soIn = new SoMessagesInput();
    soIn.session_id = sessOut.session_id;
    const soOut = new SoMessagesOutput();
    await session.soMessages(soIn, soOut, new SessionContext());
    const lastUser = [...soOut.messages].reverse().find((m) => m.role === 'user');
    expect(lastUser?.content).toBe('用 SQLite');

    const ansOut2 = new AnswerUserAskOutput();
    await gateway.answerUserAsk(ansIn, ansOut2, new RunGatewayContext());
    expect(ansOut2.answered).toBe(false);
  });
  it('超时应该归一为未应答（answer 为空）', async () => {
    const relationDb = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
    await relationDb.initialize();
    new RunsSchemaInitializer(relationDb).init();
    const session = new SessionAccess(relationDb);
    await session.initialize();
    const gateway = new RunGatewayService(relationDb, session, {} as never, {} as never);
    const cfgIn = new ConfigRunsInput();
    cfgIn.permission_wait_timeout_ms = 50;
    await gateway.configRuns(cfgIn, new ConfigRunsOutput(), new RunGatewayContext());

    const waitIn = new WaitUserAnswerInput();
    waitIn.ask_id = 'ask-2';
    waitIn.run_id = 'run-2';
    waitIn.session_key = 'sess-2';
    const waitOut = new WaitUserAnswerOutput();
    await gateway.waitUserAnswer(waitIn, waitOut, new RunGatewayContext());
    expect(waitOut.answered).toBe(false);
    expect(waitOut.answer).toBe('');
  });
});

describe('LaneSemaphore（background lane 并发上限）', () => {
  it('并发不超过上限；释放后按序唤醒等待者', async () => {
    const semaphore = new LaneSemaphore(2);
    let maxInFlight = 0;
    const task = async () => {
      await semaphore.acquire();
      maxInFlight = Math.max(maxInFlight, semaphore.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      semaphore.release();
    };
    await Promise.all(Array.from({ length: 5 }, () => task()));
    expect(maxInFlight).toBe(2);
    expect(semaphore.inFlight).toBe(0);
  });
});
