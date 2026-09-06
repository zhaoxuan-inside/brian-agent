/**
 * @fileoverview RunGateway + AgentDef 集成测试（Runtime v2 · 阶段3/4 前置）。
 *
 * 覆盖本次线上问题修复的关键语义：
 * - 确定性匹配：同任务两次 submitRun → 同一 def（exact/signature 命中），**不再重复构建**（无随机）；
 * - 组件按任务重解析：快照 soul 经 matchSoul 动态解析（不沿用 agent_soul 历史绑定）；
 * - 身份段：system 以 builtin.identity 开头（"你是谁"由身份声明回答，而非 WorkAgent 人设）；
 * - session lane：活动 run 未结算时第二次 submitRun → steer 注入（steered=true，同 run_id）；
 * - steering 消息经边界抽干成为会话第二条 user 消息；
 * - 排水语义：followup/interrupt 排队 run 结算后复用同一 run_id（queued→running 同一记录，
 *   不产生双记录孤儿行，Runs-PRD §4.1）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  Context,
  LLMContext,
  ExecLLMEventsInput,
  ExecLLMEventsOutput,
  ExecLLMInput,
  ExecLLMOutput,
} from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import { SoulSchemaInitializer } from '../../Base/SoulProvider/infrastructure/SoulSchemaInitializer';
import { SessionAccess } from '../Session/access/SessionAccess';
import { StreamAccess } from '../../Base/StreamProvider/access/StreamAccess';
import { RegisterStreamInput, RegisterStreamOutput, PushEventToEndpointInput, PushEventToEndpointOutput } from '../../Base/StreamProvider/domain/types';
import { StreamContext } from '../../Base/StreamProvider/domain/types';
import { Report } from '@brian-agent/base';
import { ToolAccess } from '../Tools/access/ToolAccess';
import { LoopAccess } from '../Loop/access/LoopAccess';
import { AgentDefAccess } from '../Agents/access/AgentDefAccess';
import { RunGatewayAccess } from '../Runs/access/RunGatewayAccess';
import {
  SubmitRunInput,
  SubmitRunOutput,
  WaitRunInput,
  WaitRunOutput,
  RunGatewayContext,
} from '../Runs/domain/types';
import {
  SoMessagesInput,
  SoMessagesOutput,
  SessionContext,
} from '../Session/domain/types';


describe('RunGateway + AgentDef（线上问题修复语义）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let sessionAccess: SessionAccess;
  let streamAccess: StreamAccess;
  let agentDefAccess: AgentDefAccess;
  let loopAccess: LoopAccess;
  let gateway: RunGatewayAccess;
  let execLLMEventsMock: ReturnType<typeof vi.fn>;
  let buildAgentMock: ReturnType<typeof vi.fn>;
  let matchSoulMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-gateway-test-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    new SoulSchemaInitializer(relationDb).init();
    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS agent (
      id TEXT PRIMARY KEY, created INTEGER, updated INTEGER,
      agent_id TEXT, agent_name TEXT, agent_type TEXT, strategy_id TEXT,
      soul_id TEXT, task_signature TEXT, usage_count INTEGER DEFAULT 0,
      eval_score INTEGER DEFAULT 0, enable INTEGER DEFAULT 1, agent_purpose TEXT DEFAULT ''
    )`);
    sessionAccess = new SessionAccess(relationDb);
    await sessionAccess.initialize();
    streamAccess = new StreamAccess(relationDb);
    // Report 事件流网关（组合根语义）：业务事件经 Report→StreamProvider 保存/投递
    Report.setEventStreamGateway({
      pushToEndpoint: async (input) => {
        await streamAccess.publishEvent(
          Object.assign(new PushEventToEndpointInput(), input),
          new PushEventToEndpointOutput(),
          new StreamContext(),
        );
      },
    });
    const toolAccess = new ToolAccess(relationDb, {});
    await toolAccess.initialize();

    // mock LLM：收到 system 后直接给出 stop（捕获入参供断言）
    execLLMEventsMock = vi.fn(async (input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
      void input;
      output.finish_reason = 'stop';
      output.result = '我是 Brian，你的智能个人助理。';
      output.tool_calls = [];
      output.input_tokens = 5;
      output.output_tokens = 8;
      return true;
    });
    const mockLlm = { execLLMEvents: execLLMEventsMock, execLLM: vi.fn(async (_i: ExecLLMInput, o: ExecLLMOutput) => { o.result = '{}'; return true; }) } as unknown as LLMAccess;

    // mock AgentBuilder：构建返回固定 agent 资产
    buildAgentMock = vi.fn(async (_i: unknown, output: { agent_id: string }) => {
      output.agent_id = 'agent-1';
      return true;
    });
    // mock SoulCore：按任务动态返回通用 soul（含内容，快照直接取 matchOutput.soul）
    matchSoulMock = vi.fn(async (_i: unknown, output: { soul_id: string; soul: Record<string, unknown> | null }) => {
      output.soul_id = 'soul-general';
      output.soul = { soul_content: '你是 Brian 的通用人格：友好、简洁、以用户为中心。' };
      return true;
    });
    relationDb.executeRaw(`INSERT INTO soul (id, created, updated, soul_content, soul_brief, soul_usage, enable) VALUES ('soul-general', 1, 1, '你是 Brian 的通用人格：友好、简洁、以用户为中心。', '通用人格', '', 1)`);

    agentDefAccess = new AgentDefAccess(relationDb, mockLlm, {
      agentBuilder: { buildAgent: buildAgentMock } as never,
      soulCore: { matchSoul: matchSoulMock } as never,
    });
    await agentDefAccess.initialize();

    // queue bridge 后绑定（与 dev-server 组合根一致：Loop ←鸭子接口← Gateway）
    let gatewayRef: RunGatewayAccess;
    const queueBridge = {
      drainSteering: (sessionKey: string) => gatewayRef.drainSteeringFor(sessionKey),
      takeFollowup: (sessionKey: string) => gatewayRef.takeFollowupFor(sessionKey),
    };
    loopAccess = new LoopAccess(relationDb, mockLlm, sessionAccess, toolAccess, undefined, queueBridge);
    await loopAccess.initialize();
    gateway = new RunGatewayAccess(relationDb, sessionAccess, agentDefAccess, loopAccess);
    await gateway.initialize();
    gatewayRef = gateway;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 清理失败忽略 */ }
  });

  async function submit(message: string, sessionKey = 'sess-a', queueMode?: 'steer' | 'followup' | 'interrupt'): Promise<{ runId: string; steered: boolean; queued: boolean }> {
    // 注册 SSE 端点（生成端点 ID）→ Report 携带端点 ID → 业务事件经 Report→StreamProvider
    const regOut = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: sessionKey, writer: () => true }),
      regOut,
      new StreamContext(),
    );
    const input = new SubmitRunInput();
    input.session_key = sessionKey;
    input.session_id = 'sess-row-1';
    input.user_message = message;
    if (queueMode) {
      input.queue_mode = queueMode;
    }
    const output = new SubmitRunOutput();
    const report = new Report({ session_id: sessionKey, session_key: sessionKey, stream_endpoint_id: regOut.endpoint_id });
    await gateway.submitRun(input, output, new RunGatewayContext(), undefined, report);
    return { runId: output.run_id, steered: output.steered, queued: output.queued };
  }

  it('确定性匹配：同任务两次提交应该复用同一 def（不重复构建，无随机）', async () => {
    const first = await submit('你是谁？');
    const wait1 = new WaitRunInput();
    wait1.run_id = first.runId;
    const out1 = new WaitRunOutput();
    await gateway.waitRun(wait1, out1, new RunGatewayContext());
    expect(out1.status).toBe('finished');
    expect(buildAgentMock).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 30)); // 等 lane 完全释放
    const second = await submit('你是谁？');
    const wait2 = new WaitRunInput();
    wait2.run_id = second.runId;
    const out2 = new WaitRunOutput();
    await gateway.waitRun(wait2, out2, new RunGatewayContext());
    expect(buildAgentMock).toHaveBeenCalledTimes(1); // 第二次命中签名，未再构建
    expect(second.runId).not.toBe(first.runId);
  });

  it('组件按任务重解析：system 应包含 identity 段与动态匹配的 Soul（而非历史绑定）', async () => {
    const first = await submit('你是谁？');
    const wait = new WaitRunInput();
    wait.run_id = first.runId;
    await gateway.waitRun(wait, new WaitRunOutput(), new RunGatewayContext());
    const llmInput = execLLMEventsMock.mock.calls[0][0] as ExecLLMEventsInput;
    expect(llmInput.system).toContain('# 身份');
    expect(llmInput.system).toContain('你是 Brian');
    expect(llmInput.system).toContain('通用人格'); // matchSoul 动态解析内容
    expect(matchSoulMock).toHaveBeenCalled();
  });

  it('session lane：活动 run 未结算时第二次提交应该 steer 注入（同 run_id）', async () => {
    // 挂起 LLM，制造活动 run
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    execLLMEventsMock.mockImplementationOnce(async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
      await gate;
      output.finish_reason = 'stop';
      output.result = 'done';
      return true;
    });
    const first = await submit('第一个问题');
    const second = await submit('补充说明');
    expect(second.steered).toBe(true);
    expect(second.runId).toBe(first.runId);
    release();
    const wait = new WaitRunInput();
    wait.run_id = first.runId;
    const out = new WaitRunOutput();
    await gateway.waitRun(wait, out, new RunGatewayContext());
    expect(out.status).toBe('finished');
    // steering 消息经边界抽干成为第二条 user 消息（gateway 已把 session_key 映射为 runtime 会话）
    const runtimeSessionId = String(relationDb.queryRaw("SELECT id FROM runtime_session WHERE session_key='sess-a'")[0].id);
    const so = new SoMessagesInput();
    so.session_id = runtimeSessionId;
    const soOut = new SoMessagesOutput();
    await sessionAccess.soMessages(so, soOut, new SessionContext());
    const userMsgs = soOut.messages.filter((m) => m.role === 'user').map((m) => m.content);
    expect(userMsgs).toEqual(['第一个问题', '补充说明']);
  });

  it('事件投影：run 全程应产出 run.status / part.delta / part.created 事件', async () => {
    execLLMEventsMock.mockImplementationOnce(async (input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
      input.on_event?.({ type: 'text_delta', delta: '你好，' });
      output.finish_reason = 'stop';
      output.result = '你好，我是 Brian。';
      return true;
    });
    const first = await submit('你好');
    const wait = new WaitRunInput();
    wait.run_id = first.runId;
    await gateway.waitRun(wait, new WaitRunOutput(), new RunGatewayContext());
    await new Promise((r) => setTimeout(r, 120)); // fire-and-forget 事件链落库
    // 事件流已由 StreamProvider 持久化（stream_event 表；保存/审计/重放事实源）
    const rows = relationDb.queryRaw<{ event_type: string }>(
      'SELECT "event_type" FROM "stream_event" WHERE "session_key" = ? ORDER BY "seq" ASC',
      ['sess-a'],
    );
    const types = (rows ?? []).map((r) => r.event_type);
    expect(types).toContain('run.started');
    expect(types).toContain('reply.delta');
    expect(types).toContain('reply.created');
  });

  it('followup 排队：结算后应复用同一 run_id 且 queued 行转 running 再 finished（无双记录）', async () => {
    // 挂起 LLM，制造活动 run
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    execLLMEventsMock.mockImplementationOnce(async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
      await gate;
      output.finish_reason = 'stop';
      output.result = 'done';
      return true;
    });
    await submit('活动消息');
    const queued = await submit('排队消息', 'sess-a', 'followup');
    expect(queued.queued).toBe(true);
    expect(queued.runId).not.toBe('');

    release();
    const wait = new WaitRunInput();
    wait.run_id = queued.runId;
    const out = new WaitRunOutput();
    await gateway.waitRun(wait, out, new RunGatewayContext());
    expect(out.status).toBe('finished');

    // 同一 run_id 的记录状态机完整：queued → running → finished，无孤儿 queued 行
    const rows = relationDb.queryRaw<{ id: string; status: string }>(
      'SELECT "id", "status" FROM "runtime_run" ORDER BY "created" ASC',
    );
    const queuedRow = rows.find((r) => r.id === queued.runId);
    expect(queuedRow).toBeTruthy();
    expect(queuedRow!.status).toBe('finished');
    expect(rows.filter((r) => r.status === 'queued')).toHaveLength(0);
  });

  it('interrupt 入队与结算竞态：入队后应立即排水，不留卡死队列', async () => {
    // 活动 run 正常快速结束；interrupt 提交在结算窗口边缘入队，maybeDrainLane 兜底排水
    execLLMEventsMock.mockImplementationOnce(async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
      output.finish_reason = 'stop';
      output.result = 'done';
      return true;
    });
    await submit('将被打断的消息');
    const interrupted = await submit('最新消息', 'sess-a', 'interrupt');
    expect(interrupted.queued).toBe(true);
    const wait = new WaitRunInput();
    wait.run_id = interrupted.runId;
    const out = new WaitRunOutput();
    await gateway.waitRun(wait, out, new RunGatewayContext());
    expect(out.status).toBe('finished');
  });

  it('无 on_event 事件签名校验：waitRun 未存在 run 应该返回 running（兜底）', async () => {
    const wait = new WaitRunInput();
    wait.run_id = 'not-exist';
    const out = new WaitRunOutput();
    await gateway.waitRun(wait, out, new Context());
    expect(out.status).toBe('running');
    void LLMContext;
  });
});
