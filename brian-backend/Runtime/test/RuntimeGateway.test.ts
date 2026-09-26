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
import { SkillRuntimeAccess } from '../SkillRuntime/access/SkillRuntimeAccess';
import { RegisterBuiltinSkillsInput, RegisterBuiltinSkillsOutput, SkillRuntimeContext } from '../SkillRuntime/domain/types';
import { PromptsAccess } from '@brian-agent/base';
import { LoopAccess } from '../Loop/access/LoopAccess';
import { AgentDefAccess } from '../Agents/access/AgentDefAccess';
import { RunGatewayAccess } from '../Runs/access/RunGatewayAccess';
import {
  SubmitRunInput,
  SubmitRunOutput,
  WaitRunInput,
  WaitRunOutput,
  WaitPermissionInput,
  WaitPermissionOutput,
  AnswerPermissionInput,
  AnswerPermissionOutput,
  ConfigRunsInput,
  ConfigRunsOutput,
  RunGatewayContext,
  LaneKind,
  QueueMode,
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
      soul_id TEXT, skill_ids_json TEXT, mcp_ids_json TEXT, prompt_template_id TEXT,
      task_signature TEXT, usage_count INTEGER DEFAULT 0,
      eval_score INTEGER DEFAULT 0, enable INTEGER DEFAULT 1, agent_purpose TEXT DEFAULT ''
    )`);
    sessionAccess = new SessionAccess(relationDb);
    await sessionAccess.initialize();
    streamAccess = new StreamAccess(relationDb);

    Report.setEventStreamGateway({
      pushToEndpoint: async (input) => {
        await streamAccess.publishEvent(
          Object.assign(new PushEventToEndpointInput(), input),
          new PushEventToEndpointOutput(),
          new StreamContext(),
        );
      },
    });
    const skillRuntimeAccess = new SkillRuntimeAccess(relationDb, {

      skillAccess: {
        soSkillById: vi.fn(async (input: { id: string }, output: { skill: unknown }) => {
          output.skill = input.id === '11111111-2222-3333-4444-555555555555'
            ? { id: input.id, name: '磁盘巡检', skill_brief: '查询磁盘可用空间并汇总', skill_md: '# 磁盘巡检\n\n当用户询问磁盘空间时使用', enable: true }
            : null;
          return true;
        }),
        execSkill: vi.fn(async (input: { id: string }, output: { result?: unknown }) => {
          output.result = `skill-exec:${input.id}`;
          return true;
        }),
      } as never,
    });
    await skillRuntimeAccess.initialize();
    await skillRuntimeAccess.registerBuiltinSkills(new RegisterBuiltinSkillsInput(), new RegisterBuiltinSkillsOutput(), new SkillRuntimeContext());

    const promptsAccessForSeed = new PromptsAccess(relationDb);
    await promptsAccessForSeed.initialize();
    const identityPromptId = '11111111-2222-3333-4444-555555555555';
    relationDb.executeRaw(`INSERT OR REPLACE INTO prompt_template (id, created, updated, prompt_template_title, prompt_template_brief, prompt_template, enable, is_system) VALUES (
      '${identityPromptId}', 1, 1, 'Brian 身份声明', '主代理身份声明',
      '# 身份\n\n你是 Brian，用户的智能个人助理。\n\n{{#if soul}}\n# 人格\n\n{{soul}}\n\n{{/if}}\n# 任务\n\n{{task_directive}}', 1, 1
    )`);
    relationDb.executeRaw(`INSERT OR REPLACE INTO prompt_template (id, created, updated, prompt_template_title, prompt_template_brief, prompt_template, enable, is_system) VALUES (
      '22222222-3333-4444-5555-666666666666', 1, 1, 'Agent 匹配评估', 'Agent 匹配评估提示词',
      '评估候选 Agent 与任务的匹配度，输出 JSON: {"score": 80, "reason": "匹配"}', 1, 1
    )`);

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

    buildAgentMock = vi.fn(async (_i: unknown, output: { agent_id: string }) => {
      output.agent_id = 'agent-1';
      return true;
    });

    matchSoulMock = vi.fn(async (_i: unknown, output: { soul_id: string; soul: Record<string, unknown> | null }) => {
      output.soul_id = 'soul-general';
      output.soul = { soul_content: '你是 Brian 的通用人格：友好、简洁、以用户为中心。' };
      return true;
    });
    relationDb.executeRaw(`INSERT INTO soul (id, created, updated, soul_content, soul_brief, soul_usage, enable) VALUES ('soul-general', 1, 1, '你是 Brian 的通用人格：友好、简洁、以用户为中心。', '通用人格', '', 1)`);

    const soSoulContentMock = vi.fn(async (i: { soul_id: string }, output: { content: string }) => {
      if (i.soul_id === 'soul-general') {
        output.content = '你是 Brian 的通用人格：友好、简洁、以用户为中心。';
      }
      return true;
    });

    agentDefAccess = new AgentDefAccess(relationDb, mockLlm, {
      agentBuilder: { buildAgent: buildAgentMock } as never,
      soulCore: { matchSoul: matchSoulMock, soSoulContent: soSoulContentMock } as never,
    });
    await agentDefAccess.initialize();

    let gatewayRef: RunGatewayAccess;
    const queueBridge = {
      drainSteering: (sessionKey: string) => gatewayRef.drainSteeringFor(sessionKey),
      takeFollowup: (sessionKey: string) => gatewayRef.takeFollowupFor(sessionKey),
    };
    loopAccess = new LoopAccess(relationDb, mockLlm, sessionAccess, skillRuntimeAccess, undefined, queueBridge);
    await loopAccess.initialize();
    gateway = new RunGatewayAccess(relationDb, sessionAccess, agentDefAccess, loopAccess);
    await gateway.initialize();
    gatewayRef = gateway;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {  }
  });

  async function submit(message: string, sessionKey = 'sess-a', queueMode?: 'steer' | 'followup' | 'interrupt'): Promise<{ runId: string; steered: boolean; queued: boolean }> {

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

    await new Promise((r) => setTimeout(r, 30));
    const second = await submit('你是谁？');
    const wait2 = new WaitRunInput();
    wait2.run_id = second.runId;
    const out2 = new WaitRunOutput();
    await gateway.waitRun(wait2, out2, new RunGatewayContext());
    expect(buildAgentMock).toHaveBeenCalledTimes(1);
    expect(second.runId).not.toBe(first.runId);
  });

  it('组件绑定收敛：def 无显式绑定则 system 无 Soul 段，且不走 Core 组件匹配', async () => {
    const first = await submit('你是谁？');
    const wait = new WaitRunInput();
    wait.run_id = first.runId;
    await gateway.waitRun(wait, new WaitRunOutput(), new RunGatewayContext());
    const llmInput = execLLMEventsMock.mock.calls[0][0] as ExecLLMEventsInput;
    expect(llmInput.system).toContain('# 身份');
    expect(llmInput.system).toContain('你是 Brian');

    expect(llmInput.system).not.toContain('通用人格');
    expect(matchSoulMock).not.toHaveBeenCalled();
  });

  it('Soul 注入：当构建出的 Agent 绑定了 Soul 时，Soul 正确同步到 def 并注入到 system prompt 中', async () => {
    relationDb.executeRaw(`INSERT OR REPLACE INTO agent (id, created, updated, agent_id, agent_name, agent_type, strategy_id, soul_id, skill_ids_json, mcp_ids_json, task_signature, usage_count, eval_score, enable, agent_purpose) VALUES (
      'agent-math-row', 1, 1, 'agent-math', '数学专家', 'WORKER', 'strat-1', 'soul-general', '[]', '[]', 'sig-math', 0, 0, 1, '数学专家'
    )`);
    buildAgentMock.mockImplementationOnce(async (_i: unknown, output: { agent_id: string }) => {
      output.agent_id = 'agent-math';
      return true;
    });
    const mathRun = await submit('求解微积分方程');
    const wait = new WaitRunInput();
    wait.run_id = mathRun.runId;
    await gateway.waitRun(wait, new WaitRunOutput(), new RunGatewayContext());
    const llmInput = execLLMEventsMock.mock.calls[execLLMEventsMock.mock.calls.length - 1][0] as ExecLLMEventsInput;
    expect(llmInput.system).toContain('# 身份');

    expect(llmInput.system).toContain('通用人格');
  });

  it('session lane：活动 run 未结算时第二次提交应该 steer 注入（同 run_id）', async () => {

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
    await new Promise((r) => setTimeout(r, 120));

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

    const rows = relationDb.queryRaw<{ id: string; status: string }>(
      'SELECT "id", "status" FROM "runtime_run" ORDER BY "created" ASC',
    );
    const queuedRow = rows.find((r) => r.id === queued.runId);
    expect(queuedRow).toBeTruthy();
    expect(queuedRow!.status).toBe('finished');
    expect(rows.filter((r) => r.status === 'queued')).toHaveLength(0);
  });

  it('interrupt 入队与结算竞态：入队后应立即排水，不留卡死队列', async () => {

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

  it('错误 Agent 立即杀死：LLM 异常 run 结算后 def 应 disable（后续同任务不再命中）', async () => {

    execLLMEventsMock.mockImplementationOnce(async () => {
      throw new Error('LLM 流断开');
    });
    const first = await submit('天气怎么样？');
    const wait = new WaitRunInput();
    wait.run_id = first.runId;
    const out = new WaitRunOutput();
    await gateway.waitRun(wait, out, new RunGatewayContext());
    expect(out.status).toBe('error');
    await new Promise((r) => setTimeout(r, 60));

    const defRows = relationDb.queryRaw<{ status: string }>(
      `SELECT "status" FROM "runtime_agent_def" WHERE "task_signature" LIKE '%天气怎么样%'`,
    );
    expect(defRows.length).toBeGreaterThan(0);
    expect(defRows.every((r) => r.status === 'disabled')).toBe(true);

    await new Promise((r) => setTimeout(r, 120));
    const events = relationDb.queryRaw<{ event_type: string; payload_json: string }>(
      'SELECT "event_type", "payload_json" FROM "stream_event" WHERE "session_key" = ? AND "event_type" = ?',
      ['sess-a', 'agent.disbanded'],
    );
    expect(events?.length).toBeGreaterThan(0);
    const payload = JSON.parse(String(events![0].payload_json)) as { reason?: string };
    expect(payload.reason).toBe('run_error');
  });

  it('信任工具表：remember 应答后同工具自动放行并持久化（永久批准）', async () => {

    const missIn = new AnswerPermissionInput();
    missIn.permission_id = 'perm-missing';
    missIn.approved = true;
    missIn.remember = true;
    const missOut = new AnswerPermissionOutput();
    await gateway.answerPermission(missIn, missOut, new RunGatewayContext());
    expect(missOut.answered).toBe(false);

    const waitIn = new WaitPermissionInput();
    waitIn.permission_id = 'perm-trust-1';
    waitIn.tool_id = 'cdt_browser';
    const waitOut = new WaitPermissionOutput();
    const pending = gateway.waitPermission(waitIn, waitOut, new RunGatewayContext());
    await new Promise((r) => setTimeout(r, 100));
    const ansIn = new AnswerPermissionInput();
    ansIn.permission_id = 'perm-trust-1';
    ansIn.approved = true;
    ansIn.remember = true;
    const ansOut = new AnswerPermissionOutput();
    await gateway.answerPermission(ansIn, ansOut, new RunGatewayContext());
    expect(ansOut.answered).toBe(true);
    await pending;
    expect(waitOut.approved).toBe(true);

    const autoIn = new WaitPermissionInput();
    autoIn.permission_id = 'perm-trust-2';
    autoIn.tool_id = 'cdt_browser';
    const autoOut = new WaitPermissionOutput();
    await gateway.waitPermission(autoIn, autoOut, new RunGatewayContext());
    expect(autoOut.approved).toBe(true);
    expect(autoOut.answered).toBe(true);
    expect(autoOut.auto_approved).toBe(true);

    const otherIn = new WaitPermissionInput();
    otherIn.permission_id = 'perm-other-1';
    otherIn.tool_id = 'mcp_exec';
    const otherOut = new WaitPermissionOutput();
    const otherPending = gateway.waitPermission(otherIn, otherOut, new RunGatewayContext());
    await new Promise((r) => setTimeout(r, 100));
    const denyIn = new AnswerPermissionInput();
    denyIn.permission_id = 'perm-other-1';
    denyIn.approved = false;
    await gateway.answerPermission(denyIn, new AnswerPermissionOutput(), new RunGatewayContext());
    await otherPending;
    expect(otherOut.approved).toBe(false);
    expect(otherOut.auto_approved).toBe(false);

    const cfgOut = new ConfigRunsOutput();
    await gateway.configRuns(new ConfigRunsInput(), cfgOut, new RunGatewayContext());
    expect(cfgOut.trusted_tools).toContain('cdt_browser');
    expect(cfgOut.trusted_tools).not.toContain('mcp_exec');

    const gateway2 = new RunGatewayAccess(relationDb, sessionAccess, agentDefAccess, loopAccess);
    await gateway2.initialize();
    const cfgOut2 = new ConfigRunsOutput();
    await gateway2.configRuns(new ConfigRunsInput(), cfgOut2, new RunGatewayContext());
    expect(cfgOut2.trusted_tools).toContain('cdt_browser');
  });

  it('信任工具表：configRuns 全量覆盖可撤销信任', async () => {
    const cfgIn = new ConfigRunsInput();
    cfgIn.trusted_tools = ['mcp_exec'];
    const cfgOut = new ConfigRunsOutput();
    await gateway.configRuns(cfgIn, cfgOut, new RunGatewayContext());
    expect(cfgOut.trusted_tools).toEqual(['mcp_exec']);

    const autoIn = new WaitPermissionInput();
    autoIn.permission_id = 'perm-revoke-1';
    autoIn.tool_id = 'mcp_exec';
    const autoOut = new WaitPermissionOutput();
    await gateway.waitPermission(autoIn, autoOut, new RunGatewayContext());
    expect(autoOut.auto_approved).toBe(true);

    const waitIn = new WaitPermissionInput();
    waitIn.permission_id = 'perm-revoke-2';
    waitIn.tool_id = 'cdt_browser';
    const waitOut = new WaitPermissionOutput();
    const pending = gateway.waitPermission(waitIn, waitOut, new RunGatewayContext());
    await new Promise((r) => setTimeout(r, 100));
    const ansIn = new AnswerPermissionInput();
    ansIn.permission_id = 'perm-revoke-2';
    ansIn.approved = true;
    await gateway.answerPermission(ansIn, new AnswerPermissionOutput(), new RunGatewayContext());
    await pending;
    expect(waitOut.approved).toBe(true);
    expect(waitOut.auto_approved).toBe(false);
  });

  it('完整五阶段链路：评估 Agent 打分 + 写作 Agent 美化排版后输出最终 reply.delta', async () => {
    let evalCalled = false;
    let writeCalled = false;
    const mockEvaluator = {
      evalWorkAgent: vi.fn(async () => {
        evalCalled = true;
        return true;
      }),
    };
    const mockWriter = {
      execWrite: vi.fn(async (_i: any, o: { response?: string; response_format?: string }) => {
        writeCalled = true;
        o.response = '## 美化标题\n\n```mermaid\ngraph TD\n  A-->B\n```\n\n这是排版后的内容。';
        o.response_format = 'MARKDOWN';
        return true;
      }),
    };

    const refinedGateway = new RunGatewayAccess(
      relationDb,
      sessionAccess,
      agentDefAccess,
      loopAccess,
      undefined,
      mockEvaluator,
      mockWriter,
    );
    await refinedGateway.initialize();

    await refinedGateway.configRuns(
      Object.assign(new ConfigRunsInput(), { eval_skip_low_risk: false, eval_async: false }),
      new ConfigRunsOutput(),
      new RunGatewayContext(),
    );

    execLLMEventsMock.mockImplementationOnce(async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
      output.finish_reason = 'stop';
      output.result = '原始粗糙文本输出';
      return true;
    });

    const regOut = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: 'sess-refine', writer: () => true }),
      regOut,
      new StreamContext(),
    );
    const submitIn = new SubmitRunInput();
    submitIn.session_key = 'sess-refine';
    submitIn.session_id = 'sess-row-1';
    submitIn.user_message = '请画一个流程图';
    const submitOut = new SubmitRunOutput();
    const report = new Report({ session_id: 'sess-refine', session_key: 'sess-refine', stream_endpoint_id: regOut.endpoint_id });
    await refinedGateway.submitRun(submitIn, submitOut, new RunGatewayContext(), undefined, report);

    const waitIn = new WaitRunInput();
    waitIn.run_id = submitOut.run_id;
    await refinedGateway.waitRun(waitIn, new WaitRunOutput(), new RunGatewayContext(), undefined, report);
    await new Promise((r) => setTimeout(r, 150));

    expect(evalCalled).toBe(true);
    expect(writeCalled).toBe(true);
    expect(mockWriter.execWrite).toHaveBeenCalled();
    expect(mockEvaluator.evalWorkAgent).toHaveBeenCalled();

    const rows = relationDb.queryRaw<{ event_type: string; payload_json: string }>(
      'SELECT "event_type", "payload_json" FROM "stream_event" WHERE "session_key" = ? ORDER BY "seq" ASC',
      ['sess-refine'],
    );
    const types = (rows ?? []).map((r) => r.event_type);
    expect(types).toContain('writer.completed');
    expect(types).toContain('reply.delta');
    const replyDelta = (rows ?? []).find((r) => r.event_type === 'reply.delta');
    expect(replyDelta?.payload_json).toContain('```mermaid');
  });

  it('Metrics Span 树自动记录切面调用并供事件耗时盖章（不再落库）', async () => {
    const { Metrics } = await import('@brian-agent/base');
    const qaMetrics = new Metrics(undefined, 'TestQA', 'trace-qa-123');

    execLLMEventsMock.mockImplementationOnce(async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
      output.finish_reason = 'stop';
      output.result = '回答完成';
      return true;
    });

    const submitIn = new SubmitRunInput();
    submitIn.session_key = 'sess-metrics-test';
    submitIn.user_message = '测试 Metrics 计时';
    const submitOut = new SubmitRunOutput();
    const report = new Report({ session_id: 'sess-metrics-test', session_key: 'sess-metrics-test' });

    await gateway.submitRun(submitIn, submitOut, new RunGatewayContext(), qaMetrics, report);
    const waitIn = new WaitRunInput();
    waitIn.run_id = submitOut.run_id;
    await gateway.waitRun(waitIn, new WaitRunOutput(), new RunGatewayContext(), qaMetrics, report);
    await new Promise((r) => setTimeout(r, 100));

    const spans = qaMetrics.spans;
    const keyOf = (k: string) => spans.filter((sp) => sp.key === k && sp.end !== undefined);
    expect(keyOf('Runtime.Runs.RunGatewayService.submitRun').length).toBeGreaterThan(0);
    expect(keyOf('Runtime.Agents.AgentDefService.matchAgentDef').length).toBeGreaterThan(0);
    expect(keyOf('Runtime.Loop.AgentLoopService.execAgentLoop').length).toBeGreaterThan(0);

    expect(qaMetrics.getTotalDuration()).toBeGreaterThan(0);
  });

  it('decideThoughtMode：空绑定但工具面含 exec（宿主原语）判 ReAct（ thought 与执行一致）', async () => {

    const sessionKey2 = 'sess-thought-mode';
    const regOut2 = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: sessionKey2, writer: () => true }),
      regOut2,
      new StreamContext(),
    );
    const submitIn2 = new SubmitRunInput();
    submitIn2.session_key = sessionKey2;
    submitIn2.user_message = '统计宿主机CPU使用率';
    const submitOut2 = new SubmitRunOutput();
    const report2 = new Report({ session_id: sessionKey2, session_key: sessionKey2, stream_endpoint_id: regOut2.endpoint_id });
    await gateway.submitRun(submitIn2, submitOut2, new RunGatewayContext(), undefined, report2);
    const wait2 = new WaitRunInput();
    wait2.run_id = submitOut2.run_id;
    await gateway.waitRun(wait2, new WaitRunOutput(), new RunGatewayContext(), undefined, report2);
    await new Promise((r) => setTimeout(r, 100));

    const row = relationDb.queryRaw<{ payload_json: string }>(
      `SELECT payload_json FROM stream_event WHERE session_key = ? AND event_type = 'thought.selected' ORDER BY seq DESC LIMIT 1`,
      [sessionKey2],
    );
    const thought = row?.[0]?.payload_json ?? '';
    expect(thought).toContain('"thought_mode":"ReAct"');
    expect(thought).toContain('可执行/可观察技能');
  });

  it('委派收口：delegate 子 run 落隔离子会话，主 run join 后写作 Agent 汇总子结果', async () => {
    let callSeq = 0;
    const mainLlm = vi.fn(async (input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
      callSeq += 1;
      if (callSeq === 1) {

        output.finish_reason = 'tool-calls';
        output.result = '我来委派子任务查询磁盘。';
        output.tool_calls = [{
          index: 0, id: 'call_del_1', tool_id: 'skill_builtin-delegate',
          arguments: JSON.stringify({ task_content: '子任务：查询磁盘可用空间' }),
        }];
      } else if (input.tools?.some((t) => t.tool_id === 'skill_builtin-delegate')) {

        output.finish_reason = 'stop';
        output.result = '子任务已委派，等待汇总。';
        output.tool_calls = [];
      } else {

        expect(input.tools?.some((t) => t.tool_id === 'skill_builtin-delegate')).toBe(false);
        output.finish_reason = 'stop';
        output.result = '磁盘可用 128GB。';
        output.tool_calls = [];
      }
      output.input_tokens = 5;
      output.output_tokens = 8;
      return true;
    });
    const subagentLlmAssert = mainLlm;
    void subagentLlmAssert;
    const mockLlmDelegating = { execLLMEvents: mainLlm, execLLM: vi.fn(async (_i: ExecLLMInput, o: ExecLLMOutput) => { o.result = '{}'; return true; }) } as unknown as LLMAccess;

    let writerAgentResults: Array<{ agent_id: string; task_content?: string; result?: string }> = [];
    const mockWriter = {
      execWrite: vi.fn(async (_i: { agent_results: Array<{ agent_id: string; task_content?: string; result?: string }> }, o: { response?: string; response_format?: string }) => {
        writerAgentResults = [..._i.agent_results];
        o.response = '磁盘可用 128GB（已汇总子任务结果）。';
        o.response_format = 'MARKDOWN';
        return true;
      }),
    };

    let delegatingGatewayRef: RunGatewayAccess;
    const skillRuntimeAccessDelegating = new SkillRuntimeAccess(relationDb, {
      runGateway: {
        submitRun: async (input: { session_key: string; lane_kind: string; queue_mode: string; user_message: string; agent_ref?: string; parent_run_id?: string }) => {
          const i = Object.assign(new SubmitRunInput(), input);
          const o = new SubmitRunOutput();
          await delegatingGatewayRef.submitRun(i, o, new RunGatewayContext());
          return { run_id: o.run_id };
        },
      },
    });
    await skillRuntimeAccessDelegating.initialize();
    await skillRuntimeAccessDelegating.registerBuiltinSkills(
      Object.assign(new RegisterBuiltinSkillsInput(), {}),
      new RegisterBuiltinSkillsOutput(),
      new SkillRuntimeContext(),
    );
    const loopAccessDelegating = new LoopAccess(relationDb, mockLlmDelegating, sessionAccess, skillRuntimeAccessDelegating, undefined, {
      drainSteering: (sessionKey: string) => delegatingGatewayRef.drainSteeringFor(sessionKey),
      takeFollowup: (sessionKey: string) => delegatingGatewayRef.takeFollowupFor(sessionKey),
    });
    await loopAccessDelegating.initialize();
    const delegatingGateway = new RunGatewayAccess(
      relationDb, sessionAccess, agentDefAccess, loopAccessDelegating,

      { error: (...args: unknown[]) => console.error('[gateway-error]', ...args), warn: (...args: unknown[]) => console.warn('[gateway-warn]', ...args) } as never,
      undefined, mockWriter,
    );
    await delegatingGateway.initialize();
    delegatingGatewayRef = delegatingGateway;

    const sessionKey = 'sess-delegate-converge';
    const regOut = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: sessionKey, writer: () => true }),
      regOut,
      new StreamContext(),
    );
    const submitIn = new SubmitRunInput();
    submitIn.session_key = sessionKey;
    submitIn.user_message = '帮我查磁盘空间';
    const submitOut = new SubmitRunOutput();
    const report = new Report({ session_id: sessionKey, session_key: sessionKey, stream_endpoint_id: regOut.endpoint_id });
    await delegatingGateway.submitRun(submitIn, submitOut, new RunGatewayContext(), undefined, report);

    const waitIn = new WaitRunInput();
    waitIn.run_id = submitOut.run_id;
    waitIn.timeout_ms = 30_000;
    const waitOut = new WaitRunOutput();
    await delegatingGateway.waitRun(waitIn, waitOut, new RunGatewayContext(), undefined, report);
    expect(waitOut.status).toBe('finished');
    await new Promise((r) => setTimeout(r, 100));

    const subRows = relationDb.queryRaw<{ id: string }>(
      `SELECT "id" FROM "runtime_run" WHERE "session_key" = ? AND "lane" = 'subagent'`,
      [sessionKey],
    );
    expect(subRows?.length).toBe(1);
    const subRunId = String(subRows![0].id);
    const receiptParts = relationDb.queryRaw<{ output_json: string }>(
      `SELECT "output_json" FROM "runtime_message_part" WHERE "run_id" = ? AND "tool_id" = 'skill_builtin-delegate'`,
      [submitOut.run_id],
    );
    expect(receiptParts?.length).toBe(1);
    expect(receiptParts![0].output_json).toContain(`run_id=${subRunId}`);

    expect(receiptParts![0].output_json).toContain('磁盘可用 128GB');

    const mainSessionRow = relationDb.queryRaw<{ id: string }>(
      `SELECT "id" FROM "runtime_session" WHERE "session_key" = ?`,
      [sessionKey],
    );
    const mainSessionId = String(mainSessionRow![0].id);
    const mainUserRows = relationDb.queryRaw<{ role: string }>(
      `SELECT "role" FROM "runtime_message" WHERE "session_id" = ? AND "role" = 'user'`,
      [mainSessionId],
    );
    expect(mainUserRows?.length).toBe(1);

    const subSessionRow = relationDb.queryRaw<{ id: string }>(
      `SELECT "id" FROM "runtime_session" WHERE "session_key" = ?`,
      [`${sessionKey}::sub:${subRunId}`],
    );
    expect(subSessionRow?.length).toBe(1);
    const subMessages = relationDb.queryRaw<{ role: string; content: string }>(
      `SELECT "role", "content" FROM "runtime_message" WHERE "session_id" = ? ORDER BY "seq"`,
      [String(subSessionRow![0].id)],
    );
    expect(subMessages?.filter((m) => m.role === 'user').length).toBe(1);
    expect(subMessages?.[0].content).toContain('子任务：查询磁盘可用空间');
    expect(subMessages?.some((m) => m.role === 'assistant' && m.content.includes('磁盘可用 128GB'))).toBe(true);

    expect(mockWriter.execWrite).toHaveBeenCalledTimes(1);
    expect(writerAgentResults.length).toBe(2);
    const childEntry = writerAgentResults.find((r) => r.task_content?.includes('子任务：查询磁盘可用空间'));
    expect(childEntry?.result).toContain('磁盘可用 128GB');
  });

  it('合并注入：绑定 Skill 的 run 工具清单含 skill_<id>（一等工具）且不再注入 skill_exec', async () => {

    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS skill (id TEXT PRIMARY KEY, created INTEGER, updated INTEGER, name TEXT, skill_brief TEXT, skill_md TEXT, scripts TEXT, enable INTEGER)`);
    relationDb.executeRaw(`INSERT OR REPLACE INTO skill (id, created, updated, name, skill_brief, skill_md, scripts, enable) VALUES
      ('11111111-2222-3333-4444-555555555555', 1, 1, '磁盘巡检', '查询磁盘可用空间并汇总', '# 磁盘巡检\n\n当用户询问磁盘空间时使用', '', 1)`);
    relationDb.executeRaw(`INSERT OR REPLACE INTO agent (id, created, updated, agent_id, agent_name, agent_type, strategy_id, soul_id, skill_ids_json, mcp_ids_json, task_signature, usage_count, eval_score, enable, agent_purpose) VALUES (
      'agent-disk-row', 1, 1, 'agent-disk', '磁盘巡检员', 'WORKER', 'strat-1', '', '["11111111-2222-3333-4444-555555555555"]', '[]', 'sig-disk', 0, 0, 1, '磁盘巡检'
    )`);
    relationDb.executeRaw(`INSERT OR REPLACE INTO runtime_agent_def (id, created, updated, name, mode, agent_ref, task_signature, prompt_template_id, model_id, soul_id, tools_json, temperature, budget_total, status, agent_purpose) VALUES
      ('def-disk', 1, 1, '磁盘巡检员', 'primary', 'agent-disk', '[general] 帮我巡检磁盘空间', '', '', '', '', NULL, 60, 'active', '磁盘巡检')`);

    execLLMEventsMock.mockImplementationOnce(async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
      output.finish_reason = 'tool-calls';
      output.result = '我先巡检磁盘。';
      output.tool_calls = [{
        index: 0, id: 'call_skill_1', tool_id: 'skill_11111111-2222-3333-4444-555555555555',
        arguments: '{"params":{}}',
      }];
      return true;
    });
    const merged = await submit('帮我巡检磁盘空间');
    const wait = new WaitRunInput();
    wait.run_id = merged.runId;
    await gateway.waitRun(wait, new WaitRunOutput(), new RunGatewayContext());

    const firstCall = execLLMEventsMock.mock.calls.find((c: unknown[]) =>
      (c[0] as ExecLLMEventsInput).tools?.some((t) => t.tool_id.startsWith('skill_')));
    expect(firstCall).toBeTruthy();
    const llmInput = firstCall![0] as ExecLLMEventsInput;
    const toolIds = (llmInput.tools ?? []).map((t) => t.tool_id);
    expect(toolIds).toContain('skill_11111111-2222-3333-4444-555555555555');
    expect(toolIds).toContain('skill_builtin-exec');
    expect(toolIds).not.toContain('mcp_exec');
    const skillSpec = (llmInput.tools ?? []).find((t) => t.tool_id === 'skill_11111111-2222-3333-4444-555555555555');
    expect(skillSpec?.description).toContain('磁盘巡检');

    const partRows = relationDb.queryRaw<{ tool_id: string; output_json: string; status: string }>(
      `SELECT "tool_id", "output_json", "status" FROM "runtime_message_part" WHERE "run_id" = ? AND "tool_id" LIKE 'skill_%'`,
      [merged.runId],
    );
    expect(partRows?.length).toBe(1);
    expect(partRows![0].status).toBe('completed');
    expect(partRows![0].output_json).toContain('skill-exec:11111111-2222-3333-4444-555555555555');
  });

  it('subagent run 不执行评估/写作（子 run 结算即收敛，收口在父 run 的写作 Agent）', async () => {
    let writeCalls = 0;
    const mockWriter = {
      execWrite: vi.fn(async (_i: unknown, o: { response?: string; response_format?: string }) => {
        writeCalls += 1;
        o.response = '汇总回复';
        o.response_format = 'MARKDOWN';
        return true;
      }),
    };
    const gateway2 = new RunGatewayAccess(relationDb, sessionAccess, agentDefAccess, loopAccess, undefined, undefined, mockWriter);
    await gateway2.initialize();

    const subIn = new SubmitRunInput();
    subIn.session_key = 'sess-subagent-no-writer';
    subIn.user_message = '子任务：整理桌面文件';
    subIn.lane_kind = LaneKind.Subagent;
    subIn.queue_mode = QueueMode.Followup;
    subIn.parent_run_id = 'parent-run-fake';
    const subOut = new SubmitRunOutput();
    await gateway2.submitRun(subIn, subOut, new RunGatewayContext());    const waitIn = new WaitRunInput();
    waitIn.run_id = subOut.run_id;
    waitIn.timeout_ms = 30_000;
    await gateway2.waitRun(waitIn, new WaitRunOutput(), new RunGatewayContext());
    await new Promise((r) => setTimeout(r, 100));

    expect(writeCalls).toBe(0);

    const mainRows = relationDb.queryRaw<{ n: number }>(
      `SELECT COUNT(*) AS n FROM "runtime_message" WHERE "run_id" = ? AND "session_id" IN (SELECT "id" FROM "runtime_session" WHERE "session_key" = 'sess-subagent-no-writer')`,
      [subOut.run_id],
    );
    expect(Number(mainRows![0].n)).toBe(0);
  });
});

