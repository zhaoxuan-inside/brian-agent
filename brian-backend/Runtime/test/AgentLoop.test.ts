/**
 * @fileoverview AgentLoop 集成测试（Runtime v2 · 阶段2）。
 *
 * mock LLMAccess（脚本化事件流）+ 真 SQLite + 真 EventBus + 真 ToolService：
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
  Context,
  ExecLLMEventsInput,
  ExecLLMEventsOutput,
  AbortedError,
} from '@brian-agent/base';
import { SessionAccess } from '../Session/access/SessionAccess';
import { EventBusAccess } from '../Bus/access/EventBusAccess';
import { ToolAccess } from '../Tools/access/ToolAccess';
import { LoopAccess } from '../Loop/access/LoopAccess';
import {
  AddSessionInput,
  AddSessionOutput,
  SoMessagesInput,
  SoMessagesOutput,
  SessionContext,
} from '../Session/domain/types';
import {
  SoEventReplayInput,
  SoEventReplayOutput,
  EventBusContext,
} from '../Bus/domain/types';
import {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
} from '../Loop/domain/types';
import {
  RegisterBuiltinToolsInput,
  RegisterBuiltinToolsOutput,
  ToolContext,
} from '../Tools/domain/types';
import type { LLMAccess } from '@brian-agent/base';

describe('AgentLoop（DIRECT 场景端到端）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let sessionAccess: SessionAccess;
  let busAccess: EventBusAccess;
  let toolAccess: ToolAccess;
  let loopAccess: LoopAccess;
  let mockLlm: { execLLMEvents: ReturnType<typeof vi.fn> };
  let sessionId = '';

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-loop-test-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    sessionAccess = new SessionAccess(relationDb);
    await sessionAccess.initialize();
    busAccess = new EventBusAccess(relationDb);
    await busAccess.initialize();
    const mockSkill = {
      execSkill: vi.fn(async (_i: unknown, output: { result: unknown }) => {
        output.result = '北京天气：晴，22°C';
        return true;
      }),
    };
    toolAccess = new ToolAccess(relationDb, { skillAccess: mockSkill as never });
    await toolAccess.initialize();
    const regIn = new RegisterBuiltinToolsInput();
    regIn.enabled = ['skill_exec'];
    await toolAccess.registerBuiltinTools(regIn, new RegisterBuiltinToolsOutput(), new ToolContext());
    mockLlm = { execLLMEvents: vi.fn() };
    loopAccess = new LoopAccess(relationDb, mockLlm as unknown as LLMAccess, sessionAccess, busAccess, toolAccess);
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
    if (overrides) {
      Object.assign(input, overrides);
    }
    return input;
  }

  async function replayEvents(sessionKey: string): Promise<SoEventReplayOutput> {
    const so = new SoEventReplayInput();
    so.session_key = sessionKey;
    const out = new SoEventReplayOutput();
    await busAccess.soEventReplay(so, out, new EventBusContext());
    return out;
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
          index: 0, id: 'call_1', tool_id: 'skill_exec',
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
          function: { name: 'skill_exec' },
        });
        expect(input.messages![2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1', content: '北京天气：晴，22°C' });
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
    const ok = await loopAccess.execAgentLoop(input, output, new Context());
    expect(ok).toBe(true);
    expect(output.stop_reason).toBe('stop');
    expect(output.result).toBe('北京今天晴，22°C。');
    expect(output.iterations).toBe(2);
    expect(output.token_usage).toEqual({ input_tokens: 18, output_tokens: 17 });
    expect(output.message_id).toBeTruthy();

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
    expect(types[0]).toBe('run.status');
    expect(types).toContain('part.delta');
    expect(types).toContain('part.created');
    expect(types).toContain('tool.launch');
    expect(types).toContain('tool.result');
    expect(types[types.length - 1]).toBe('run.status');
    const toolResult = events.events.find((e) => e.type === 'tool.result');
    expect((toolResult!.payload as { status: string }).status).toBe('ok');
    const endStatus = events.events[events.events.length - 1];
    expect((endStatus.payload as { phase: string }).phase).toBe('end');
  });

  it('预算耗尽（无宽限）应该收敛 budget', async () => {
    mockLlm.execLLMEvents.mockImplementation(
      async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        output.finish_reason = 'tool-calls';
        output.result = '继续';
        output.tool_calls = [{
          index: 0, id: `call_${Math.random()}`, tool_id: 'skill_exec',
          arguments: '{"skill_id":"w","params":{}}',
        }];
        return true;
      },
    );
    const input = makeLoopInput({ budget: { total: 1, grace: false } });
    const output = new ExecAgentLoopOutput();
    await loopAccess.execAgentLoop(input, output, new Context());
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
    await loopAccess.execAgentLoop(input, output, new Context());
    expect(output.stop_reason).toBe('aborted');
    const events = await replayEvents(input.session_key);
    const last = events.events[events.events.length - 1];
    expect((last.payload as { phase: string }).phase).toBe('error');
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
    await loopAccess.execAgentLoop(input, output, new Context());
    expect(output.stop_reason).toBe('error');
    expect(output.error).toContain('所有可用模型均调用失败');
  });
});
