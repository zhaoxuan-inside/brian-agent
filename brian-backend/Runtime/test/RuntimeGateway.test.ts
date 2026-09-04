/**
 * @fileoverview RunGateway + AgentDef 集成测试（Runtime v2 · 阶段3/4 前置）。
 *
 * 覆盖本次线上问题修复的关键语义：
 * - 确定性匹配：同任务两次 submitRun → 同一 def（exact/signature 命中），**不再重复构建**（无随机）；
 * - 组件按任务重解析：快照 soul 经 matchSoul 动态解析（不沿用 agent_soul 历史绑定）；
 * - 身份段：system 以 builtin.identity 开头（"你是谁"由身份声明回答，而非 WorkAgent 人设）；
 * - session lane：活动 run 未结算时第二次 submitRun → steer 注入（steered=true，同 run_id）；
 * - steering 消息经边界抽干成为会话第二条 user 消息。
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
import { EventBusAccess } from '../Bus/access/EventBusAccess';
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
import {
  SoEventReplayInput,
  SoEventReplayOutput,
  EventBusContext,
} from '../Bus/domain/types';

describe('RunGateway + AgentDef（线上问题修复语义）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let sessionAccess: SessionAccess;
  let busAccess: EventBusAccess;
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
    busAccess = new EventBusAccess(relationDb);
    await busAccess.initialize();
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
    // mock SoulCore：按任务动态返回通用 soul
    matchSoulMock = vi.fn(async (_i: unknown, output: { soul_id: string }) => {
      output.soul_id = 'soul-general';
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
    loopAccess = new LoopAccess(relationDb, mockLlm, sessionAccess, busAccess, toolAccess, undefined, queueBridge);
    await loopAccess.initialize();
    gateway = new RunGatewayAccess(relationDb, sessionAccess, busAccess, agentDefAccess, loopAccess);
    await gateway.initialize();
    gatewayRef = gateway;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 清理失败忽略 */ }
  });

  async function submit(message: string, sessionKey = 'sess-a'): Promise<{ runId: string; steered: boolean; queued: boolean }> {
    const input = new SubmitRunInput();
    input.session_key = sessionKey;
    input.session_id = 'sess-row-1';
    input.user_message = message;
    const output = new SubmitRunOutput();
    await gateway.submitRun(input, output, new RunGatewayContext());
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
    const so = new SoEventReplayInput();
    so.session_key = 'sess-a';
    const out = new SoEventReplayOutput();
    await busAccess.soEventReplay(so, out, new EventBusContext());
    const types = out.events.map((e) => e.type);
    expect(types).toContain('run.status');
    expect(types).toContain('part.delta');
    expect(types).toContain('part.created');
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
