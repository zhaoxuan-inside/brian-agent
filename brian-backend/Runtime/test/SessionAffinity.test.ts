import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecuteEventProcessor } from '@brian-agent/base';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  ExecLLMInput,
  ExecLLMOutput,
  ExecLLMEventsInput,
  ExecLLMEventsOutput,
  EmbedLLMInput,
  EmbedLLMOutput,
  PromptsAccess,
  VectorDBAccess,
  GraphDBAccess,
  Report,
} from '@brian-agent/base';
import type { LLMAccess } from '@brian-agent/base';
import { InfoCoreAccess, InfoCoreContext } from '@brian-agent/core';
import { SoulSchemaInitializer } from '../../Base/SoulProvider/infrastructure/SoulSchemaInitializer';
import { SessionAccess } from '../Session/access/SessionAccess';
import { StreamAccess } from '../../Base/StreamProvider/access/StreamAccess';
import { ObservabilityAccess } from '../../Base/ObservabilityProvider';
import { RegisterStreamInput, RegisterStreamOutput, StreamContext } from '../../Base/StreamProvider/domain/types';
import { SkillRuntimeAccess } from '../SkillRuntime/access/SkillRuntimeAccess';
import { RegisterBuiltinSkillsInput, RegisterBuiltinSkillsOutput, SkillRuntimeContext } from '../SkillRuntime/domain/types';
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

const SESSION_KEY = 'sess-affinity';
const EMBED_LLM_ID = 'llm-embed-1';

describe('会话话题连续性与轮次向量（chg-059）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let sessionAccess: SessionAccess;
  let streamAccess: StreamAccess;
  let agentDefAccess: AgentDefAccess;
  let gateway: RunGatewayAccess;
  let infoCore: InfoCoreAccess;
  let buildAgentMock: ReturnType<typeof vi.fn>;
  let matchAgentDefSpy: ReturnType<typeof vi.fn>;
  let embedLLMMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-affinity-test-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    Report.setExecuteEventSink(new ExecuteEventProcessor(relationDb));
    new SoulSchemaInitializer(relationDb).init();
    relationDb.executeRaw(`CREATE TABLE IF NOT EXISTS agent_record (
      id TEXT PRIMARY KEY, created INTEGER, updated INTEGER,
      title TEXT, type TEXT, strategy_id TEXT,
      soul_id TEXT, skill_ids_json TEXT, mcp_ids_json TEXT, prompt_template_id TEXT, llm_id TEXT DEFAULT '',
      task_signature TEXT,
      eval_score INTEGER DEFAULT 0, enable INTEGER DEFAULT 1, brief TEXT DEFAULT ''
    )`);
    sessionAccess = new SessionAccess(relationDb);
    await sessionAccess.initialize();
    streamAccess = new StreamAccess(relationDb);

    const observability = new ObservabilityAccess(relationDb);
    observability.setFrameWriter(() => true);
    Report.setEventGateway({
      emit: (meta, type, payload) => {
        observability.emit(meta, type, payload);
      },
      flush: () => observability.flush(),
    });

    const skillRuntimeAccess = new SkillRuntimeAccess(relationDb, {
      skillAccess: {
        soSkillById: vi.fn(async () => null),
        execSkill: vi.fn(async (_input: { id: string }, output: { result?: unknown }) => {
          output.result = 'skill-exec:stub';
          return true;
        }),
      } as never,
    });
    await skillRuntimeAccess.initialize();
    await skillRuntimeAccess.registerBuiltinSkills(new RegisterBuiltinSkillsInput(), new RegisterBuiltinSkillsOutput(), new SkillRuntimeContext());

    const promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    relationDb.executeRaw(`INSERT OR REPLACE INTO prompt_template_record (id, created, updated, title, brief, content, enable, is_system) VALUES (
      '11111111-2222-3333-4444-555555555555', 1, 1, 'Brian 身份声明', '主代理身份声明',
      '# 身份\n\n你是 Brian，用户的智能个人助理。\n\n{{#if soul}}\n# 人格\n\n{{soul}}\n\n{{/if}}\n# 任务\n\n{{task_directive}}', 1, 1
    )`);
    relationDb.executeRaw(`INSERT OR REPLACE INTO prompt_template_record (id, created, updated, title, brief, content, enable, is_system) VALUES (
      '22222222-3333-4444-5555-666666666666', 1, 1, 'Agent 匹配评估', 'Agent 匹配评估提示词',
      '评估候选 Agent 与任务的匹配度，输出 JSON: {"score": 80, "reason": "匹配"}', 1, 1
    )`);

    const mockLlm = {
      execLLMEvents: vi.fn(async (_input: ExecLLMEventsInput, output: ExecLLMEventsOutput) => {
        output.finish_reason = 'stop';
        output.result = '我是 Brian，你的智能个人助理。';
        output.tool_calls = [];
        output.input_tokens = 5;
        output.output_tokens = 8;
        return true;
      }),
      execLLM: vi.fn(async (_i: ExecLLMInput, o: ExecLLMOutput) => {
        o.result = '{"title": "出行向导", "brief": "城市出行路线推荐"}';
        return true;
      }),
      soLLMById: vi.fn(async (_i: unknown, o: { llm?: unknown }) => {
        o.llm = { id: EMBED_LLM_ID, llm_type: 'embedding' };
        return true;
      }),
      embedLLM: embedLLMMock = vi.fn(async (input: EmbedLLMInput, output: EmbedLLMOutput) => {
        const text = String(input.input ?? '');
        output.embedding = text.includes('出行') ? [1, 0, 0]
          : text.includes('量子') || text.includes('计算机') ? [0, 1, 0]
          : [0, 0, 1];
        return true;
      }),
    } as unknown as LLMAccess;

    let builtAgentSeq = 0;
    buildAgentMock = vi.fn(async (_i: unknown, output: { agent_id: string }) => {
      builtAgentSeq += 1;
      output.agent_id = `agent-${builtAgentSeq}`;
      return true;
    });

    const vectorDb = new VectorDBAccess(relationDb, { lancePath: path.join(tempDir, 'vectordb') });
    await vectorDb.initialize(8);
    const graphDb = new GraphDBAccess(relationDb, { dbPath: path.join(tempDir, 'graph.db') });
    await graphDb.initialize();
    infoCore = new InfoCoreAccess(relationDb, mockLlm, promptsAccess, vectorDb, graphDb);
    await infoCore.initialize();
    await infoCore.updateInfoVectorConfig(
      { llm_id: EMBED_LLM_ID, enable: 1 } as never,
      { } as never, new InfoCoreContext(),
    );

    agentDefAccess = new AgentDefAccess(relationDb, mockLlm, {
      agentBuilder: { buildAgent: buildAgentMock } as never,
    });
    await agentDefAccess.initialize();
    matchAgentDefSpy = vi.spyOn(agentDefAccess, 'matchAgentDef');

    let gatewayRef: RunGatewayAccess;
    const queueBridge = {
      drainSteering: (sessionKey: string) => gatewayRef.drainSteeringFor(sessionKey),
      takeFollowup: (sessionKey: string) => gatewayRef.takeFollowupFor(sessionKey),
    };
    const loopAccess = new LoopAccess(relationDb, mockLlm, sessionAccess, skillRuntimeAccess, undefined, queueBridge);
    await loopAccess.initialize();
    gateway = new RunGatewayAccess(relationDb, sessionAccess, agentDefAccess, loopAccess, undefined, undefined, undefined, infoCore);
    await gateway.initialize();
    gatewayRef = gateway;
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {  }
  });

  async function submitAndWait(message: string): Promise<string> {
    const regOut = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: SESSION_KEY, writer: () => true }),
      regOut,
      new StreamContext(),
    );
    const input = new SubmitRunInput();
    input.session_key = SESSION_KEY;
    input.session_id = 'sess-row-1';
    input.user_message = message;
    const output = new SubmitRunOutput();
    const report = new Report({ session_id: SESSION_KEY, session_key: SESSION_KEY, stream_endpoint_id: regOut.endpoint_id });
    await gateway.submitRun(input, output, new RunGatewayContext(), undefined, report);
    const wait = new WaitRunInput();
    wait.run_id = output.run_id;
    const waitOut = new WaitRunOutput();
    await gateway.waitRun(wait, waitOut, new RunGatewayContext());
    expect(waitOut.status).toBe('finished');
    return output.run_id;
  }

  async function waitFor(cond: () => boolean, timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (cond()) return;
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  function sessionActiveDefId(): string {
    const rows = relationDb.queryRaw<{ agent_def_id: string }>(
      'SELECT "agent_def_id" FROM "runtime_session_record" WHERE "session_key" = ?',
      [SESSION_KEY],
    ) ?? [];
    return String(rows[0]?.agent_def_id ?? '');
  }

  function dialogEmbeddingCount(): number {
    const rows = relationDb.queryRaw<{ n: number }>(
      'SELECT COUNT(*) AS n FROM "dialog_embedding_record" WHERE "session_id" = ?',
      [SESSION_KEY],
    ) ?? [];
    return Number(rows[0]?.n ?? 0);
  }

  it('三段裁决：强信号续写沿用会话专家（零选举），话题漂移触发重选举，向量模型不可用回退沿用', async () => {
    const run1 = await submitAndWait('周末帮我推荐几个适合出行的城市散步路线');
    await waitFor(() => dialogEmbeddingCount() >= 1);
    const def1 = sessionActiveDefId();
    expect(def1).not.toBe('');
    expect(dialogEmbeddingCount()).toBe(1);
    expect(matchAgentDefSpy).toHaveBeenCalled();

    const round1Elections = matchAgentDefSpy.mock.calls.length;
    const run2 = await submitAndWait('继续');
    await waitFor(() => dialogEmbeddingCount() >= 2);
    expect(sessionActiveDefId()).toBe(def1);
    expect(matchAgentDefSpy.mock.calls.length).toBe(round1Elections);
    expect(buildAgentMock).toHaveBeenCalledTimes(1);

    const run3 = await submitAndWait('量子计算机纠错编码基本原理');
    expect(run3).not.toBe(run2);
    expect(buildAgentMock).toHaveBeenCalledTimes(2);
    expect(matchAgentDefSpy.mock.calls.length).toBeGreaterThan(round1Elections);
    const def3 = sessionActiveDefId();
    expect(def3).not.toBe(def1);
    await waitFor(() => dialogEmbeddingCount() >= 3);
    expect(dialogEmbeddingCount()).toBe(3);

    await infoCore.updateInfoVectorConfig(
      { enable: 0 } as never,
      { } as never, new InfoCoreContext(),
    );
    const round3Elections = matchAgentDefSpy.mock.calls.length;
    await submitAndWait('量子计算机纠错编码的实际工程应用');
    expect(sessionActiveDefId()).toBe(def3);
    expect(matchAgentDefSpy.mock.calls.length).toBe(round3Elections);
    expect(buildAgentMock).toHaveBeenCalledTimes(2);
    expect(dialogEmbeddingCount()).toBe(3);
  });

  it('显式切换 Agent：命中切换语式直接跳过会话亲和并重新选举', async () => {
    await submitAndWait('周末帮我推荐几个适合出行的城市散步路线');
    const def1 = sessionActiveDefId();
    expect(def1).not.toBe('');

    const electionsBefore = matchAgentDefSpy.mock.calls.length;
    await submitAndWait('切换到行情分析专家agent');
    expect(matchAgentDefSpy.mock.calls.length).toBeGreaterThan(electionsBefore);
  });
});
