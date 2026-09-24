/**
 * @fileoverview AgentLoop 集成测试（Runtime v2 · 阶段2）。
 *
 * mock LLMAccess（脚本化事件流）+ 真 SQLite + 真 StreamProvider + 真 ToolService：
 * 验证「DIRECT 场景端到端」（替代 SIMPLE workflow 的等价路径）：
 * - 多轮 tool_calls → 配对回流 → stop；
 * - 消息中心：第 2 轮 wire 消息从持久化 Part 派生（assistant tool_calls + tool 结果）；
 * - 事件投影：part.delta/part.created/tool.launch/tool.result/run.status；
 * - 预算超支收敛 budget；外部取消收敛 aborted。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  Report,
  Context,
  ExecLLMEventsInput,
  ExecLLMEventsOutput,
  AbortedError,
} from '@brian-agent/base';
import { RegisterStreamInput, RegisterStreamOutput, StreamContext } from '../../Base/StreamProvider/domain/types';
import { SessionAccess } from '../Session/access/SessionAccess';
import { SkillRuntimeAccess } from '../SkillRuntime/access/SkillRuntimeAccess';
import { LoopAccess } from '../Loop/access/LoopAccess';
import {
  AddSessionInput,
  AddSessionOutput,
  SoMessagesInput,
  SoMessagesOutput,
  SessionContext,
} from '../Session/domain/types';
import {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
} from '../Loop/domain/types';
import {
  RegisterBuiltinSkillsInput,
  RegisterBuiltinSkillsOutput,
  SkillRuntimeContext,
} from '../SkillRuntime/domain/types';
import type { LLMAccess } from '@brian-agent/base';

describe('AgentLoop（DIRECT 场景端到端）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let sessionAccess: SessionAccess;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let streamAccess: any;
  let skillRuntimeAccess: SkillRuntimeAccess;
  let loopAccess: LoopAccess;
  let mockSkill: { execSkill: ReturnType<typeof vi.fn> };
  let mockLlm: { execLLMEvents: ReturnType<typeof vi.fn> };
  let sessionId = '';

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-loop-test-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    sessionAccess = new SessionAccess(relationDb);
    await sessionAccess.initialize();
    const streamMod = await import('../../Base/StreamProvider/access/StreamAccess');
    streamAccess = new streamMod.StreamAccess(relationDb);
    Report.setEventStreamGateway({
      pushToEndpoint: async (input: { endpoint_id: string; session_key?: string; run_id?: string; type: string; payload: unknown }) => {
        const mod = await import('../../Base/StreamProvider/access/StreamAccess');
        const modTypes = await import('../../Base/StreamProvider/domain/types');
        await streamAccess.publishEvent(
          Object.assign(new modTypes.PushEventToEndpointInput(), input),
          new modTypes.PushEventToEndpointOutput(),
          new modTypes.StreamContext(),
        );
      },
    });
    mockSkill = {
      soSkillById: vi.fn(async (input: { id: string }, output: { skill: unknown }) => {
        output.skill = input.id === 'weather'
          ? { id: 'weather', name: '天气查询', skill_brief: '查询城市天气并汇总', skill_md: '# weather\n\n天气任务时使用', enable: true }
          : null;
        return true;
      }),
      execSkill: vi.fn(async (_i: unknown, output: { result: unknown }) => {
        output.result = '北京天气：晴，22°C';
        return true;
      }),
    };
    skillRuntimeAccess = new SkillRuntimeAccess(relationDb, { skillAccess: mockSkill as never });
    await skillRuntimeAccess.initialize();
    const regIn = new RegisterBuiltinSkillsInput();
    regIn.enabled = ['mcp_exec'];
    await skillRuntimeAccess.registerBuiltinSkills(regIn, new RegisterBuiltinSkillsOutput(), new SkillRuntimeContext());
    mockLlm = { execLLMEvents: vi.fn() };
    loopAccess = new LoopAccess(relationDb, mockLlm as unknown as LLMAccess, sessionAccess, skillRuntimeAccess);
    await loopAccess.initialize();
    const add = new AddSessionInput();
    add.session_key = `sess-${Date.now()}`;
    const addOut = new AddSessionOutput();
    await sessionAccess.addSession(add, addOut, new SessionContext());
    sessionId = addOut.session_id;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 清理失败忽略 */ }
  });

  function makeLoopInput(overrides?: Partial<ExecAgentLoopInput>): ExecAgentLoopInput {
    const input = new ExecAgentLoopInput();
    input.run_id = `run-${Date.now()}`;
    input.session_key = 'sess-loop';
    input.session_id = sessionId;
    input.user_message = '北京今天天气怎么样？';
    input.system = '你是任务执行代理，可用工具完成查询。';
    input.llm_id = '';
    input.skills = ['skill_weather'];
    input.component_scope = { skills: ['weather'], mcps: [] };
    if (overrides) {
      Object.assign(input, overrides);
    }
    return input;
  }

  /** 事件流审计查询（stream_event 表；保存/审计/重放事实源已迁 StreamProvider） */

  /** 注册 SSE 端点并构造携带端点 ID 的 Report（Report→StreamProvider 上报链路） */
  async function makeStreamReport(sessionKey: string): Promise<Report> {
    const regOut = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: sessionKey, writer: () => true }),
      regOut,
      new StreamContext(),
    );
    return new Report({ session_id: sessionKey, session_key: sessionKey, stream_endpoint_id: regOut.endpoint_id });
  }

  async function replayEvents(sessionKey: string): Promise<{ events: Array<{ type: string; payload: unknown }> }> {
    await new Promise((r) => setTimeout(r, 120)); // fire-and-forget 事件链落库
    const rows = relationDb.queryRaw<{ event_type: string; payload_json: string }>(
      'SELECT "event_type", "payload_json" FROM "stream_event" WHERE "session_key" = ? ORDER BY "seq" ASC',
      [sessionKey],
    );
    return {
      events: (rows ?? []).map((r) => {
        let payload: unknown = {};
        try { payload = JSON.parse(String(r.payload_json ?? '{}')); } catch { payload = {}; }
        if (payload === null) payload = {};
        return { type: String(r.event_type), payload };
      }),
    };
  }

  it('多轮 tool_calls 应该配对回流并收敛 stop（消息中心派生第 2 轮 wire 消息）', async () => {
    mockLlm.execLLMEvents.mockImplementationOnce(
      async (input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        expect(input.tools?.length).toBe(1);
        expect(input.messages?.map((m) => m.role)).toEqual(['user']);
        input.on_event?.({ type: 'text_delta', delta: '我查一下天气' });
        output.finish_reason = 'tool-calls';
        output.result = '我查一下天气';
        output.tool_calls = [{
          index: 0, id: 'call_1', tool_id: 'skill_weather',
          arguments: '{"skill_id":"weather","params":{"city":"北京"}}',
        }];
        output.input_tokens = 10;
        output.output_tokens = 5;
        return true;
      },
    );
    mockLlm.execLLMEvents.mockImplementationOnce(
      async (input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        // 消息中心：第 2 轮 wire 消息由持久化 Part 派生
        expect(input.messages?.map((m) => m.role)).toEqual(['user', 'assistant', 'tool']);
        const assistant = input.messages![1];
        expect(assistant.tool_calls?.[0]).toMatchObject({
          id: 'call_1',
          function: { name: 'skill_weather' },
        });
        expect(input.messages![2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1', content: '北京天气：晴，22°C' });
        // 最终轮直播增量（轮中合帧保守进 think，轮末全文进 reply，见下断言）
        input.on_event?.({ type: 'text_delta', delta: '北京今天' });
        output.finish_reason = 'stop';
        output.result = '北京今天晴，22°C。';
        output.tool_calls = [];
        output.input_tokens = 8;
        output.output_tokens = 12;
        return true;
      },
    );
    const input = makeLoopInput();
    const output = new ExecAgentLoopOutput();
    const report = await makeStreamReport(input.session_key);
    const ok = await loopAccess.execAgentLoop(input, output, new Context(), undefined, report);
    expect(ok).toBe(true);
    expect(output.stop_reason).toBe('stop');
    expect(output.result).toBe('北京今天晴，22°C。');
    expect(output.iterations).toBe(2);
    expect(output.token_usage).toEqual({ input_tokens: 18, output_tokens: 17 });
    expect(output.msg_id).toBeTruthy();

    // 会话持久化：user + 2 assistant；tool Part 配对完成
    const so = new SoMessagesInput();
    so.session_id = sessionId;
    const soOut = new SoMessagesOutput();
    await sessionAccess.soMessages(so, soOut, new SessionContext());
    expect(soOut.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'assistant']);
    const firstAssistant = soOut.messages[1];
    const toolPart = firstAssistant.parts.find((p) => p.part_type === 'tool');
    expect(toolPart).toBeDefined();
    expect(toolPart!.status).toBe('completed');
    expect(toolPart!.output_json).toBe('北京天气：晴，22°C');
    expect(JSON.parse(toolPart!.input_json!)).toEqual({
      tool_call_id: 'call_1',
      arguments: '{"skill_id":"weather","params":{"city":"北京"}}',
    });

    // 事件投影
    const events = await replayEvents(input.session_key);
    const types = events.events.map((e) => e.type);
    expect(types[0]).toBe('run.started');
    // ===== 修改后（2026-09-12）：中间轮文本只进 think.delta，最终轮全文进 reply.delta =====
    // 原断言仅要求含 reply.delta；现精确断言分流——中间轮叙述"我查一下天气"不出对话框，
    // 对话框仅见最终全文；轮中直播增量"北京今天"保守进 thinking。
    const replyDeltas = events.events
      .filter((e) => e.type === 'reply.delta')
      .map((e) => (e.payload as { delta: string }).delta);
    const thinkText = events.events
      .filter((e) => e.type === 'think.delta')
      .map((e) => (e.payload as { delta: string }).delta)
      .join('');
    expect(thinkText).toContain('我查一下天气');
    expect(thinkText).toContain('北京今天');
    expect(replyDeltas).toEqual(['北京今天晴，22°C。']);
    expect(types).toContain('reply.created');
    expect(types).toContain('tool.started');
    expect(types).toContain('tool.result');
    expect(types[types.length - 1]).toBe('run.finished');
    const toolResult = events.events.find((e) => e.type === 'tool.result');
    expect((toolResult!.payload as { status: string }).status).toBe('ok');
    const endStatus = events.events[events.events.length - 1];
    expect((endStatus.payload as { stop_reason: string }).stop_reason).toBe('stop');
  });

  it('预算耗尽（无宽限）应该收敛 budget', async () => {
    mockLlm.execLLMEvents.mockImplementation(
      async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        output.finish_reason = 'tool-calls';
        output.result = '继续';
        output.tool_calls = [{
          index: 0, id: `call_${Math.random()}`, tool_id: 'skill_weather',
          arguments: '{"skill_id":"w","params":{}}',
        }];
        return true;
      },
    );
    const input = makeLoopInput({ budget: { total: 1, grace: false } });
    const output = new ExecAgentLoopOutput();
    await loopAccess.execAgentLoop(input, output, new Context(), undefined, await makeStreamReport(input.session_key));
    expect(output.stop_reason).toBe('budget');
    expect(output.iterations).toBe(1);
  });

  it('外部取消应该真取消并收敛 aborted', async () => {
    mockLlm.execLLMEvents.mockImplementationOnce(
      async (input: ExecLLMEventsInput) => {
        input.on_event?.({ type: 'text_delta', delta: '部分输出' });
        throw new AbortedError('user', '外部信号取消');
      },
    );
    const controller = new AbortController();
    const input = makeLoopInput({ signal: controller.signal });
    const output = new ExecAgentLoopOutput();
    await loopAccess.execAgentLoop(input, output, new Context(), undefined, await makeStreamReport(input.session_key));
    expect(output.stop_reason).toBe('aborted');
    const events = await replayEvents(input.session_key);
    const last = events.events[events.events.length - 1];
    expect(last.type).toBe('run.failed');
  });

  it('权限门：拒绝时工具配对拒绝回流且不实际执行', async () => {
    mockSkill.execSkill.mockClear();
    let asked: Array<Record<string, unknown>> = [];
    const gated = new LoopAccess(
      relationDb, mockLlm as unknown as LLMAccess, sessionAccess, skillRuntimeAccess,
      undefined, undefined,
      { wait: async (i) => { asked.push({ permission_id: i.permission_id }); return { approved: false }; } },
    );
    await gated.initialize();
    mockLlm.execLLMEvents
      .mockImplementationOnce(async (input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        input.on_event?.({ type: 'text_delta', delta: '需要调用工具' });
        output.finish_reason = 'tool-calls';
        output.result = '需要调用工具';
        output.tool_calls = [{ index: 0, id: 'call_perm', tool_id: 'skill_weather', arguments: '{"skill_id":"weather","params":{"city":"北京"}}' }];
        return true;
      })
      .mockImplementationOnce(async (input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        output.finish_reason = 'stop';
        output.result = '好的，不查了';
        return true;
      });
    const input = makeLoopInput();
    const output = new ExecAgentLoopOutput();
    const report = await makeStreamReport(input.session_key);
    await gated.execAgentLoop(input, output, new Context(), undefined, report);

    expect(asked.length).toBe(1);
    expect(mockSkill.execSkill).not.toHaveBeenCalled();
    const events = await replayEvents(input.session_key);
    const denied = events.events.find((e) => e.type === 'tool.result');
    expect((denied!.payload as { output: string }).output).toContain('permission denied');
    // ===== 新增（2026-09-12）：应答后必下发 permission.answered（卡片翻态依据）=====
    const answered = events.events.find((e) => e.type === 'permission.answered');
    expect((answered!.payload as { approved: boolean }).approved).toBe(false);
  });

  it('权限门：批准时工具正常执行', async () => {
    mockSkill.execSkill.mockClear();
    const gated = new LoopAccess(
      relationDb, mockLlm as unknown as LLMAccess, sessionAccess, skillRuntimeAccess,
      undefined, undefined,
      { wait: async () => ({ approved: true }) },
    );
    await gated.initialize();
    mockLlm.execLLMEvents
      .mockImplementationOnce(async (input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        output.finish_reason = 'tool-calls';
        output.result = '需要调用工具';
        output.tool_calls = [{ index: 0, id: 'call_perm', tool_id: 'skill_weather', arguments: '{"skill_id":"weather","params":{"city":"北京"}}' }];
        return true;
      })
      .mockImplementationOnce(async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        output.finish_reason = 'stop';
        output.result = 'done';
        return true;
      });
    const input = makeLoopInput();
    const output = new ExecAgentLoopOutput();
    const report = await makeStreamReport(input.session_key);
    await gated.execAgentLoop(input, output, new Context(), undefined, report);

    console.log('DEBUG stop_reason:', output.stop_reason, 'result:', output.result);
    console.log('DEBUG events:', JSON.stringify((await replayEvents(input.session_key)).events.map((e) => ({ t: e.type, p: e.payload }))));
    expect(mockSkill.execSkill).toHaveBeenCalledTimes(1);
    const events = await replayEvents(input.session_key);
    const toolResult = events.events.find((e) => e.type === 'tool.result');
    expect((toolResult!.payload as { status: string }).status).toBe('ok');
    // ===== 新增（2026-09-12）：批准同样下发 permission.answered（approved=true）=====
    const answered = events.events.find((e) => e.type === 'permission.answered');
    expect((answered!.payload as { approved: boolean }).approved).toBe(true);
  });
  

  it('LLM 全候选失败应该收敛 error', async () => {
    mockLlm.execLLMEvents.mockImplementationOnce(
      async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        output.error = '所有可用模型均调用失败';
        output.error_code = 'ALL_MODELS_FAILED';
        return false;
      },
    );
    const input = makeLoopInput();
    const output = new ExecAgentLoopOutput();
    await loopAccess.execAgentLoop(input, output, new Context(), undefined, await makeStreamReport(input.session_key));
    expect(output.stop_reason).toBe('error');
    expect(output.error).toContain('所有可用模型均调用失败');
  });
});
