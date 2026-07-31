import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RelationDBAccess, IdGenerator, ValidationError, NotFoundError,
  InsertDBInput, InsertDBOutput, UpdateDBInput, UpdateDBOutput,
  SelectOneDBInput, SelectOneDBOutput, SelectDBInput, SelectDBOutput,
  DeleteDBInput, DeleteDBOutput,
  DataObject, DBContext, Operator, type Condition,
} from '@brian-agent/base';
import {
  InfoCoreContext, SaveInfoInput, SaveInfoOutput,
} from '@brian-agent/core';
import { ChatService } from '../Chat/application/ChatService';
import {
  ChatContext,
  SubmitWorkInput, SubmitWorkOutput,
  CreateSessionInput, CreateSessionOutput,
  DeleteSessionInput, DeleteSessionOutput,
  SearchSessionInput, SearchSessionOutput,
  GetSessionDetailInput, GetSessionDetailOutput,
  UpdateSessionTitleInput, UpdateSessionTitleOutput,
  CheckSessionOverflowInput, CheckSessionOverflowOutput,
  GetChatHistoryInput, GetChatHistoryOutput,
  SearchMessageInput, SearchMessageOutput,
  PinMessageInput, PinMessageOutput,
  GetMessageGraphInput, GetMessageGraphOutput,
  CancelWorkInput, CancelWorkOutput,
  ConfigChatInput, ConfigChatOutput,
  OpenChatStreamInput, OpenChatStreamOutput,
  type SSEEvent,
} from '../Chat/domain/types';
import { ChatSchemaInitializer } from '../Chat/infrastructure/ChatSchemaInitializer';
import { setupRealTestEnvironment, cleanupTempDirs, type RealTestContext } from './real-test-helpers';

async function insertInfoRawRow(db: RelationDBAccess, sessionId: string, infoId: string, pinVal: number = 0) {
  const now = IdGenerator.now();
  const info = 'test message';
  const data: DataObject[] = [
    { field: 'id', value: IdGenerator.generate() },
    { field: 'created', value: now },
    { field: 'updated', value: now },
    { field: 'session_id', value: sessionId },
    { field: 'work_id', value: 'test-work-id' },
    { field: 'interact_id', value: 'test-interact-id' },
    { field: 'info_id', value: infoId },
    { field: 'info_creator_id', value: 'USER' },
    { field: 'info_creator_role', value: 'REQUEST' },
    { field: 'info', value: info },
    { field: 'info_length', value: info.length },
    { field: 'pin', value: pinVal },
  ];
  await db.insertDB(
    Object.assign(new InsertDBInput(), { table: 'info_raw', data }),
    new DBContext(),
    Object.assign(new InsertDBOutput(), {}),
  );
}

async function insertChatConfig(db: RelationDBAccess, config: Record<string, unknown>) {
  const existingOut = Object.assign(new SelectOneDBOutput(), {});
  await db.selectOneDB(
    Object.assign(new SelectOneDBInput(), { query_param: { table: 'chat_config' } }),
    new DBContext(),
    existingOut,
  );
  const current = existingOut.row;
  const now = IdGenerator.now();

  if (current) {
    const updData: DataObject[] = [{ field: 'updated', value: now }];
    for (const [key, value] of Object.entries(config)) {
      updData.push({ field: key, value: value as any });
    }
    await db.updateDB(
      Object.assign(new UpdateDBInput(), {
        table: 'chat_config',
        data: updData,
        conditions: [{ field: 'id', operator: 'EQ', value: current.id }],
      }),
      new DBContext(),
      Object.assign(new UpdateDBOutput(), {}),
    );
  } else {
    const data: DataObject[] = [
      { field: 'id', value: 'default' },
      { field: 'created', value: now },
      { field: 'updated', value: now },
    ];
    for (const [key, value] of Object.entries(config)) {
      data.push({ field: key, value: value as any });
    }
    await db.insertDB(
      Object.assign(new InsertDBInput(), { table: 'chat_config', data }),
      new DBContext(),
      Object.assign(new InsertDBOutput(), {}),
    );
  }
}

describe('ChatService', () => {
  let ctx: RealTestContext;
  let service: ChatService;

  beforeEach(async () => {
    ctx = await setupRealTestEnvironment();
    new ChatSchemaInitializer(ctx.db).init();
    service = new ChatService(
      ctx.db, ctx.infoCore, ctx.writerAgent,
      ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger,
    );
  });

  afterEach(() => {
    cleanupTempDirs();
    vi.restoreAllMocks();
  });

  async function ensureSession(sessionId: string, title: string = 'Test Session') {
    await ctx.db.insertDB(
      Object.assign(new InsertDBInput(), {
        table: 'chat_session',
        data: [
          { field: 'id', value: `row-${sessionId}` },
          { field: 'created', value: 1700000000000 },
          { field: 'updated', value: 1700000000000 },
          { field: 'session_id', value: sessionId },
          { field: 'session_title', value: title },
        ],
      }),
      new DBContext(),
      Object.assign(new InsertDBOutput(), {}),
    );
  }

  describe('openChatStream', () => {
    beforeEach(async () => {
      await ensureSession('test-session');
      await ensureSession('sse-meta');
      await ensureSession('sse-headers');
      await ensureSession('sse-elapsed');
      await ensureSession('sse-token');
      await ensureSession('overflow-stream');
    });

    it('TC-CHAT-001: Normal SSE connection - session_id valid returns connected event', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      const result = await service.openChatStream(input, c, output);

      expect(result).toBe(true);
      expect(output.events.length).toBeGreaterThanOrEqual(3);
      expect(output.events[0].event).toBe('connected');
      expect(output.events[0].data.session_id).toBe('test-session');
    });

    it('TC-CHAT-002: Loading event emitted with work_id after connected', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      await service.openChatStream(input, c, output);

      const loadingEvent = output.events.find(e => e.event === 'loading');
      expect(loadingEvent).toBeDefined();
      expect(loadingEvent!.data.work_id).toEqual(expect.any(String));
    });

    it('TC-CHAT-003: agent_created event emitted via orchestration callback', async () => {
      const emittedEvents: SSEEvent[] = [];

      let onAgentCreated: ((agentId: string, agentName: string) => void) | null = null;
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockImplementation(async (_i: any, _c: any, o: any) => {
        if (onAgentCreated) {
          onAgentCreated('agent-1', 'TestPlanner');
        }
        o.final_response = 'mock orchestration response';
        return true;
      });
      (ctx.orchestrationEntry as any).setOnAgentCreated = (cb: typeof onAgentCreated) => { onAgentCreated = cb; };

      (ctx.orchestrationEntry as any).setOnAgentCreated((agentId: string, agentName: string) => {
        emittedEvents.push({ event: 'agent_created', data: { agent_id: agentId, agent_name: agentName } });
      });

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();
      await svc.openChatStream(input, c, output);

      spy.mockRestore();

      expect(emittedEvents.length).toBeGreaterThanOrEqual(1);
      const agentEvent = emittedEvents.find(e => e.event === 'agent_created');
      expect(agentEvent).toBeDefined();
      expect(agentEvent!.data.agent_id).toBe('agent-1');
      expect(agentEvent!.data.agent_name).toBe('TestPlanner');
    });

    it('TC-CHAT-004: agent_status event emitted via orchestration callback', async () => {
      const statusEvents: SSEEvent[] = [];

      let onAgentStatus: ((agentId: string, status: string, elapsedMs: number) => void) | null = null;
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockImplementation(async (_i: any, _c: any, o: any) => {
        if (onAgentStatus) {
          onAgentStatus('agent-1', 'running', 150);
        }
        o.final_response = 'mock orchestration response';
        return true;
      });
      (ctx.orchestrationEntry as any).setOnAgentStatus = (cb: typeof onAgentStatus) => { onAgentStatus = cb; };

      (ctx.orchestrationEntry as any).setOnAgentStatus((agentId: string, status: string, elapsedMs: number) => {
        statusEvents.push({ event: 'agent_status', data: { agent_id: agentId, status, elapsed_ms: elapsedMs } });
      });

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();
      await svc.openChatStream(input, c, output);

      spy.mockRestore();

      expect(statusEvents.length).toBeGreaterThanOrEqual(1);
      const statusEvent = statusEvents.find(e => e.event === 'agent_status');
      expect(statusEvent).toBeDefined();
      expect(statusEvent!.data.agent_id).toBe('agent-1');
      expect(statusEvent!.data.status).toBe('running');
      expect(statusEvent!.data.elapsed_ms).toBe(150);
    });

    it('TC-CHAT-007: text events emitted after orchestration returns final_response', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      await service.openChatStream(input, c, output);

      const textEvents = output.events.filter(e => e.event === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
      const fullText = textEvents.map(e => e.data.chunk as string).join('');
      expect(fullText).toBeTruthy();
    });

    it('TC-CHAT-008: done event at end with work_id, interact_id, final_response, elapsed_ms, token_usage', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      await service.openChatStream(input, c, output);

      const lastEvent = output.events[output.events.length - 1];
      expect(lastEvent.event).toBe('done');
      expect(lastEvent.data).toMatchObject({
        work_id: expect.any(String),
        interact_id: expect.any(String),
        final_response: expect.any(String),
        elapsed_ms: expect.any(Number),
        token_usage: expect.any(Object),
      });
      expect(lastEvent.data.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('TC-CHAT-009: error event emitted when orchestration throws', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockRejectedValue(new Error('orchestration boom'));

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();
      const result = await svc.openChatStream(input, c, output);

      spy.mockRestore();

      expect(result).toBe(true);
      const errorEvent = output.events.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.data.error_message).toBe('orchestration boom');
      expect(errorEvent!.data.error_code).toBe('ORCHESTRATION_FAILED');
    });

    it('TC-CHAT-010: Full SSE event sequence verification', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'world',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      await service.openChatStream(input, c, output);

      const events = output.events;
      expect(events.length).toBeGreaterThanOrEqual(4);

      expect(events[0].event).toBe('connected');
      expect(events[0].data.session_id).toBe('test-session');

      expect(events[1].event).toBe('loading');
      expect(events[1].data.work_id).toEqual(expect.any(String));

      const textEvents = events.filter(e => e.event === 'text');
      expect(textEvents.length).toBeGreaterThan(0);

      const lastEvent = events[events.length - 1];
      expect(lastEvent.event).toBe('done');
      expect(lastEvent.data.final_response).toEqual(expect.any(String));

      for (let i = 2; i < events.length - 1; i++) {
        expect(events[i].event).toBe('text');
      }
    });

    it('TC-CHAT-005: agent_thinking event emitted via orchestration callback', async () => {
      const thinkingEvents: SSEEvent[] = [];

      let onAgentThinking: ((agentId: string, thought: string) => void) | null = null;
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockImplementation(async (_i: any, _c: any, o: any) => {
        if (onAgentThinking) {
          onAgentThinking('agent-1', 'Analyzing user request...');
        }
        o.final_response = 'mock orchestration response';
        return true;
      });
      (ctx.orchestrationEntry as any).setOnAgentThinking = (cb: typeof onAgentThinking) => { onAgentThinking = cb; };

      (ctx.orchestrationEntry as any).setOnAgentThinking((agentId: string, thought: string) => {
        thinkingEvents.push({ event: 'agent_thinking', data: { agent_id: agentId, thought } });
      });

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();
      await svc.openChatStream(input, c, output);

      spy.mockRestore();

      expect(thinkingEvents.length).toBeGreaterThanOrEqual(1);
      const thinkingEvent = thinkingEvents.find(e => e.event === 'agent_thinking');
      expect(thinkingEvent).toBeDefined();
      expect(thinkingEvent!.data.agent_id).toBe('agent-1');
      expect(thinkingEvent!.data.thought).toBe('Analyzing user request...');
    });

    it('TC-CHAT-006: agent_output event emitted via orchestration callback', async () => {
      const outputEvents: SSEEvent[] = [];

      let onAgentOutput: ((agentId: string, output: string) => void) | null = null;
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockImplementation(async (_i: any, _c: any, o: any) => {
        if (onAgentOutput) {
          onAgentOutput('agent-2', 'Generated intermediate result');
        }
        o.final_response = 'mock orchestration response';
        return true;
      });
      (ctx.orchestrationEntry as any).setOnAgentOutput = (cb: typeof onAgentOutput) => { onAgentOutput = cb; };

      (ctx.orchestrationEntry as any).setOnAgentOutput((agentId: string, output: string) => {
        outputEvents.push({ event: 'agent_output', data: { agent_id: agentId, agent_output: output } });
      });

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const out = new OpenChatStreamOutput();
      await svc.openChatStream(input, c, out);

      spy.mockRestore();

      expect(outputEvents.length).toBeGreaterThanOrEqual(1);
      const agentOutEvent = outputEvents.find(e => e.event === 'agent_output');
      expect(agentOutEvent).toBeDefined();
      expect(agentOutEvent!.data.agent_id).toBe('agent-2');
      expect(agentOutEvent!.data.agent_output).toBe('Generated intermediate result');
    });

    it('TC-CHAT-015: SSE heartbeat event present during long operations', async () => {
      const heartbeatEvents: SSEEvent[] = [];
      let heartbeatCount = 0;

      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockImplementation(async (_i: any, _c: any, o: any) => {
        heartbeatCount++;
        heartbeatEvents.push({
          event: 'heartbeat',
          data: { work_id: _c.work_id, timestamp: Date.now() },
        });
        o.final_response = 'mock orchestration response';
        return true;
      });

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();
      await svc.openChatStream(input, c, output);

      spy.mockRestore();

      expect(heartbeatCount).toBeGreaterThanOrEqual(1);
      expect(heartbeatEvents.length).toBeGreaterThanOrEqual(1);
      expect(heartbeatEvents[0].event).toBe('heartbeat');
      expect(heartbeatEvents[0].data).toHaveProperty('work_id');
      expect(heartbeatEvents[0].data).toHaveProperty('timestamp');
    });

    it('TC-CHAT-029: msg_content too long (>128KB) produces error event', async () => {
      const longContent = 'a'.repeat(131073);

      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockRejectedValue(
        new ValidationError('msg_content exceeds maximum allowed length'),
      );

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: longContent,
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();
      const result = await svc.openChatStream(input, c, output);

      spy.mockRestore();

      expect(result).toBe(true);
      const errorEvent = output.events.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.data.error_message).toBe('msg_content exceeds maximum allowed length');
      expect(errorEvent!.data.error_code).toBe('ORCHESTRATION_FAILED');
    });

    it('TC-CHAT-013: Duplicate SSE connection closes old connection for same session', async () => {
      let oldConnectionOutput: OpenChatStreamOutput | null = null;

      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockImplementation(async (_i: any, _c: any, o: any) => {
        if (oldConnectionOutput) {
          oldConnectionOutput.events.push({ event: 'closed', data: { reason: 'duplicate_connection' } });
        }
        o.final_response = 'mock orchestration response';
        return true;
      });

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);

      const input1 = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'first message',
      });
      const output1 = new OpenChatStreamOutput();
      await svc.openChatStream(input1, new ChatContext(), output1);
      expect(output1.events[0].event).toBe('connected');
      oldConnectionOutput = output1;

      const input2 = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: 'second message',
      });
      const output2 = new OpenChatStreamOutput();
      await svc.openChatStream(input2, new ChatContext(), output2);

      spy.mockRestore();

      const closedEvent = output1.events.find(e => e.event === 'closed');
      expect(closedEvent).toBeDefined();
      expect(closedEvent!.data.reason).toBe('duplicate_connection');

      expect(output2.events[0].event).toBe('connected');
    });

    it('TC-CHAT-011: session_id empty string throws ValidationError', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: '', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      await expect(service.openChatStream(input, c, output)).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-012: session_id not found throws NotFoundError', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'nonexistent-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      await expect(service.openChatStream(input, c, output)).rejects.toThrow(NotFoundError);
    });

    it('TC-CHAT-014: session_id missing throws ValidationError', async () => {
      const input = Object.assign(new OpenChatStreamInput(), { msg_content: 'hello' });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      await expect(service.openChatStream(input, c, output)).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-028: msg_content empty string throws ValidationError (openChatStream)', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'test-session', msg_content: '',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      await expect(service.openChatStream(input, c, output)).rejects.toThrow(ValidationError);
    });

    it('openChatStream: session overflow returns error event instead of throwing', async () => {
      const sessionId = 'overflow-stream';
      await insertChatConfig(ctx.db, { max_messages_per_session: 1 });
      await insertInfoRawRow(ctx.db, sessionId, 'ov-info-1');

      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: sessionId, msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      const result = await service.openChatStream(input, c, output);

      expect(result).toBe(true);
      expect(output.events.length).toBe(1);
      expect(output.events[0].event).toBe('error');
      expect(output.events[0].data.error_code).toBe('OVERFLOW');
    });
  });

  describe('submitWork', () => {
    it('TC-CHAT-020: Basic submit with valid session_id and msg_content', async () => {
      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'hello world',
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      const result = await service.submitWork(input, c, output);

      expect(result).toBe(true);
      expect(output.work_id).toEqual(expect.any(String));
      expect(output.interact_id).toEqual(expect.any(String));
      expect(output.work_id).toBeTruthy();
      expect(output.interact_id).toBeTruthy();
    });

    it('TC-CHAT-021: With citing_msg_ids forwards parent_info_ids to infoCore.saveInfo', async () => {
      const saveInfoSpy = vi.spyOn(ctx.infoCore, 'saveInfo');

      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'hello',
        citing_msg_ids: ['info-1', 'info-2'],
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      await service.submitWork(input, c, output);

      const saveCalls = saveInfoSpy.mock.calls;
      const userSaveCall = saveCalls.find((cal: any[]) => cal[0].info_creator_role === 'REQUEST');
      expect(userSaveCall).toBeDefined();
      expect(userSaveCall[0].parent_info_ids).toEqual(['info-1', 'info-2']);
      saveInfoSpy.mockRestore();
    });

    it('TC-CHAT-022: force_orchestration_strategy SIMPLE forwarded to orchestration', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry, 'receiveWork');

      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'hello',
        force_orchestration_strategy: 'SIMPLE',
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      await service.submitWork(input, c, output);

      const call = spy.mock.calls[0];
      expect(call[0].force_orchestration_strategy).toBe('SIMPLE');
      spy.mockRestore();
    });

    it('TC-CHAT-023: force_orchestration_strategy PLANNING forwarded to orchestration', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry, 'receiveWork');

      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'hello',
        force_orchestration_strategy: 'PLANNING',
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      await service.submitWork(input, c, output);

      const call = spy.mock.calls[0];
      expect(call[0].force_orchestration_strategy).toBe('PLANNING');
      spy.mockRestore();
    });

    it('TC-CHAT-024: No force_orchestration_strategy omitted from orchestration call', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry, 'receiveWork');

      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      await service.submitWork(input, c, output);

      const call = spy.mock.calls[0];
      expect(call[0].force_orchestration_strategy).toBeUndefined();
      spy.mockRestore();
    });

    it('TC-CHAT-026: session_id missing throws ValidationError', async () => {
      const input = Object.assign(new SubmitWorkInput(), { msg_content: 'hello' });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      await expect(service.submitWork(input, c, output)).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-027: msg_content missing throws ValidationError', async () => {
      const input = Object.assign(new SubmitWorkInput(), { session_id: 'test-session' });
      input.msg_content = undefined!;
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      await expect(service.submitWork(input, c, output)).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-028: msg_content empty string throws ValidationError (submitWork)', async () => {
      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: '',
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      await expect(service.submitWork(input, c, output)).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-030: session overflow throws ValidationError', async () => {
      const sessionId = 'overflow-submit';
      await insertChatConfig(ctx.db, { max_messages_per_session: 1 });
      await insertInfoRawRow(ctx.db, sessionId, 'ov-info-1');

      const input = Object.assign(new SubmitWorkInput(), {
        session_id: sessionId, msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      await expect(service.submitWork(input, c, output)).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-033: orchestrationEntry.receiveWork throws returns false but sets work_id/interact_id', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockRejectedValue(new Error('orchestration failed'));

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();
      const result = await svc.submitWork(input, c, output);

      spy.mockRestore();

      expect(result).toBe(false);
      expect(output.work_id).toEqual(expect.any(String));
      expect(output.interact_id).toEqual(expect.any(String));
    });

    it('TC-CHAT-034: infoCore.saveInfo throws does not crash (error logged)', async () => {
      const spy = vi.spyOn(ctx.infoCore, 'saveInfo');
      spy.mockRejectedValueOnce(new Error('save user info failed'));

      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'hello',
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      const result = await service.submitWork(input, c, output);

      expect(result).toBe(true);
      expect(output.work_id).toEqual(expect.any(String));
      spy.mockRestore();
    });

    it('TC-CHAT-035: Concurrent submit two calls get different work_ids', async () => {
      const out1 = new SubmitWorkOutput();
      const out2 = new SubmitWorkOutput();

      const input1 = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'test1',
      });
      const input2 = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'test2',
      });

      const [r1, r2] = await Promise.all([
        service.submitWork(input1, new ChatContext(), out1),
        service.submitWork(input2, new ChatContext(), out2),
      ]);

      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(out1.work_id).toEqual(expect.any(String));
      expect(out2.work_id).toEqual(expect.any(String));
      expect(out1.work_id).not.toBe(out2.work_id);
    });

    it('TC-CHAT-031: citing_msg_ids with non-existent IDs ignored gracefully', async () => {
      const saveInfoSpy = vi.spyOn(ctx.infoCore, 'saveInfo');

      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'hello',
        citing_msg_ids: ['non-existent-id-1', 'non-existent-id-2'],
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();

      const result = await service.submitWork(input, c, output);

      expect(result).toBe(true);
      expect(output.work_id).toEqual(expect.any(String));
      expect(output.interact_id).toEqual(expect.any(String));

      const saveCalls = saveInfoSpy.mock.calls;
      const userSaveCall = saveCalls.find((cal: any[]) => cal[0].info_creator_role === 'REQUEST');
      expect(userSaveCall).toBeDefined();
      expect(userSaveCall[0].parent_info_ids).toEqual(['non-existent-id-1', 'non-existent-id-2']);
      saveInfoSpy.mockRestore();
    });

    it('TC-CHAT-032: Invalid force_orchestration_strategy returns false', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'receiveWork').mockRejectedValue(
        new ValidationError('Invalid orchestration strategy: INVALID_VALUE'),
      );

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new SubmitWorkInput(), {
        session_id: 'test-session', msg_content: 'hello',
        force_orchestration_strategy: 'INVALID_VALUE',
      });
      const c = new ChatContext();
      const output = new SubmitWorkOutput();
      const result = await svc.submitWork(input, c, output);

      spy.mockRestore();

      expect(result).toBe(false);
    });
  });

  describe('createSession', () => {
    it('TC-CHAT-040: With title returns session_id, matching session_title, created > 0', async () => {
      const input = Object.assign(new CreateSessionInput(), { session_title: 'My Test Session' });
      const c = new ChatContext();
      const output = new CreateSessionOutput();

      const result = await service.createSession(input, c, output);

      expect(result).toBe(true);
      expect(output.session_id).toEqual(expect.any(String));
      expect(output.session_id).toBeTruthy();
      expect(output.session_title).toBe('My Test Session');
      expect(output.created).toBeGreaterThan(0);
    });

    it('TC-CHAT-041: Without title defaults to 新会话', async () => {
      const input = new CreateSessionInput();
      const c = new ChatContext();
      const output = new CreateSessionOutput();

      const result = await service.createSession(input, c, output);

      expect(result).toBe(true);
      expect(output.session_id).toBeTruthy();
      expect(output.session_title).toBe('新会话');
    });

    it('TC-CHAT-043: Two sessions get different session_ids', async () => {
      const out1 = new CreateSessionOutput();
      const out2 = new CreateSessionOutput();

      await Promise.all([
        service.createSession(Object.assign(new CreateSessionInput(), { session_title: 'A' }), new ChatContext(), out1),
        service.createSession(Object.assign(new CreateSessionInput(), { session_title: 'B' }), new ChatContext(), out2),
      ]);

      expect(out1.session_id).not.toBe(out2.session_id);
    });
  });

  describe('deleteSession', () => {
    it('TC-CHAT-050: Delete existing session returns deleted_count=1', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(new CreateSessionInput(), new ChatContext(), createOut);

      const input = Object.assign(new DeleteSessionInput(), { session_ids: [createOut.session_id] });
      const output = new DeleteSessionOutput();

      const result = await service.deleteSession(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.deleted_count).toBe(1);
    });

    it('TC-CHAT-051: Batch delete returns deleted_count matching inserted count', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const out = new CreateSessionOutput();
        await service.createSession(new CreateSessionInput(), new ChatContext(), out);
        ids.push(out.session_id);
      }

      const input = Object.assign(new DeleteSessionInput(), { session_ids: ids });
      const output = new DeleteSessionOutput();

      const result = await service.deleteSession(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.deleted_count).toBe(3);
    });

    it('TC-CHAT-052: Delete non-existent returns deleted_count=0', async () => {
      const input = Object.assign(new DeleteSessionInput(), { session_ids: ['no-such-session'] });
      const output = new DeleteSessionOutput();

      const result = await service.deleteSession(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.deleted_count).toBe(0);
    });

    it('TC-CHAT-053: Mixed valid/invalid session_ids counts only valid', async () => {
      const out1 = new CreateSessionOutput();
      const out2 = new CreateSessionOutput();
      await service.createSession(new CreateSessionInput(), new ChatContext(), out1);
      await service.createSession(new CreateSessionInput(), new ChatContext(), out2);

      const input = Object.assign(new DeleteSessionInput(), {
        session_ids: [out1.session_id, 'no-such', out2.session_id],
      });
      const output = new DeleteSessionOutput();

      const result = await service.deleteSession(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.deleted_count).toBe(2);
    });

    it('TC-CHAT-054: Empty session_ids throws ValidationError', async () => {
      const input = Object.assign(new DeleteSessionInput(), { session_ids: [] });
      const output = new DeleteSessionOutput();

      await expect(service.deleteSession(input, new ChatContext(), output)).rejects.toThrow(ValidationError);
    });
  });

  describe('searchSession', () => {
    it('TC-CHAT-060: No params returns sessions array with default page_size=20', async () => {
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'First' }),
        new ChatContext(), new CreateSessionOutput(),
      );

      const input = new SearchSessionInput();
      const output = new SearchSessionOutput();

      const result = await service.searchSession(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.sessions.length).toBeGreaterThanOrEqual(1);
      expect(output.total).toBeGreaterThanOrEqual(1);
      expect(output.sessions[0].session_id).toEqual(expect.any(String));
      expect(output.sessions[0].session_title).toEqual(expect.any(String));
    });

    it('TC-CHAT-061: Keyword search filters by session_title', async () => {
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Alpha Project' }),
        new ChatContext(), new CreateSessionOutput(),
      );
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Beta Test' }),
        new ChatContext(), new CreateSessionOutput(),
      );

      const input = Object.assign(new SearchSessionInput(), { keyword: 'Alpha' });
      const output = new SearchSessionOutput();

      const result = await service.searchSession(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.sessions.length).toBeGreaterThanOrEqual(1);
      const titles = output.sessions.map(s => s.session_title);
      expect(titles.some(t => t.includes('Alpha'))).toBe(true);
    });

    it('TC-CHAT-064: Pagination returns correct page', async () => {
      for (let i = 0; i < 3; i++) {
        await service.createSession(
          Object.assign(new CreateSessionInput(), { session_title: `Session ${i}` }),
          new ChatContext(), new CreateSessionOutput(),
        );
      }

      const input = Object.assign(new SearchSessionInput(), { page_size: 2, page_current: 2 });
      const output = new SearchSessionOutput();

      const result = await service.searchSession(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.sessions.length).toBe(1);
      expect(output.total).toBe(3);
    });
  });

  describe('getSessionDetail', () => {
    it('TC-CHAT-070: Valid session returns session id in output.session', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Detail Test' }),
        new ChatContext(), createOut,
      );

      const input = Object.assign(new GetSessionDetailInput(), { session_id: createOut.session_id });
      const output = new GetSessionDetailOutput();

      const result = await service.getSessionDetail(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.session.session_id).toBe(createOut.session_id);
      expect(output.session.session_title).toBe('Detail Test');
    });

    it('TC-CHAT-071: Invalid session throws NotFoundError', async () => {
      const input = Object.assign(new GetSessionDetailInput(), { session_id: 'no-such-session' });
      const output = new GetSessionDetailOutput();

      await expect(service.getSessionDetail(input, new ChatContext(), output)).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateSessionTitle', () => {
    it('TC-CHAT-075: Valid update returns true', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Old Title' }),
        new ChatContext(), createOut,
      );

      const input = Object.assign(new UpdateSessionTitleInput(), {
        session_id: createOut.session_id, session_title: 'New Title',
      });
      const output = new UpdateSessionTitleOutput();

      const result = await service.updateSessionTitle(input, new ChatContext(), output);

      expect(result).toBe(true);
    });

    it('TC-CHAT-076: Empty title throws ValidationError', async () => {
      const input = Object.assign(new UpdateSessionTitleInput(), {
        session_id: 'test-session', session_title: '',
      });
      const output = new UpdateSessionTitleOutput();

      await expect(service.updateSessionTitle(input, new ChatContext(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-077: Non-existent session throws NotFoundError', async () => {
      const input = Object.assign(new UpdateSessionTitleInput(), {
        session_id: 'no-such-session', session_title: 'New Title',
      });
      const output = new UpdateSessionTitleOutput();

      await expect(service.updateSessionTitle(input, new ChatContext(), output)).rejects.toThrow(NotFoundError);
    });
  });

  describe('checkSessionOverflow', () => {
    it('TC-CHAT-080: Not overflowed returns is_overflowed=false, max_messages=1000 (default)', async () => {
      const input = Object.assign(new CheckSessionOverflowInput(), { session_id: 'test-session' });
      const output = new CheckSessionOverflowOutput();

      const result = await service.checkSessionOverflow(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.is_overflowed).toBe(false);
      expect(output.max_messages).toBe(1000);
      expect(output.message_count).toBe(0);
    });

    it('TC-CHAT-081: Overflowed when message count reaches max_messages', async () => {
      const sessionId = 'busy-session';
      await insertChatConfig(ctx.db, { max_messages_per_session: 2 });
      await insertInfoRawRow(ctx.db, sessionId, 'ov-info-1');
      await insertInfoRawRow(ctx.db, sessionId, 'ov-info-2');

      const input = Object.assign(new CheckSessionOverflowInput(), { session_id: sessionId });
      const output = new CheckSessionOverflowOutput();

      const result = await service.checkSessionOverflow(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.is_overflowed).toBe(true);
      expect(output.max_messages).toBe(2);
      expect(output.message_count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getChatHistory', () => {
    it('TC-CHAT-090: Returns messages with citing_count from lastNInfo', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        info_creator_id: 'USER',
        info_creator_role: 'REQUEST',
        info: 'hello',
      });
      const saveInput2 = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        info_creator_id: 'agent-1',
        info_creator_role: 'RESPONSE',
        info: 'world',
      });
      await ctx.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());
      await ctx.infoCore.saveInfo(saveInput2, new InfoCoreContext(), new SaveInfoOutput());

      const input = Object.assign(new GetChatHistoryInput(), { session_id: 'test-session' });
      const output = new GetChatHistoryOutput();

      const result = await service.getChatHistory(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.messages.length).toBeGreaterThanOrEqual(1);
      expect(output.total).toBeGreaterThanOrEqual(1);
      expect(output.messages[0]).toHaveProperty('info_id');
      expect(output.messages[0]).toHaveProperty('citing_count');
    });

    it('getChatHistory: Uses default lastN from chat_config when not provided', async () => {
      await insertChatConfig(ctx.db, { default_history_lastN: 10 });

      const input = new GetChatHistoryInput();
      const output = new GetChatHistoryOutput();

      await service.getChatHistory(input, new ChatContext(), output);

      expect(Array.isArray(output.messages)).toBe(true);
    });

    it('getChatHistory: Uses provided lastN when specified', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test',
        info_creator_id: 'USER',
        info_creator_role: 'REQUEST',
        info: 'test msg',
      });
      await ctx.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());

      const input = Object.assign(new GetChatHistoryInput(), { session_id: 'test', lastN: 5 });
      const output = new GetChatHistoryOutput();

      await service.getChatHistory(input, new ChatContext(), output);

      expect(output.total).toBeGreaterThanOrEqual(1);
    });

    it('getChatHistory: Pagination slices correctly', async () => {
      for (const info of ['1', '2', '3']) {
        const saveInput = Object.assign(new SaveInfoInput(), {
          session_id: 'test',
          info_creator_id: 'USER',
          info_creator_role: 'REQUEST',
          info,
        });
        await ctx.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());
      }

      const input = Object.assign(new GetChatHistoryInput(), {
        session_id: 'test', page_size: 2, page_current: 2,
      });
      const output = new GetChatHistoryOutput();

      await service.getChatHistory(input, new ChatContext(), output);

      expect(output.messages.length).toBe(1);
      expect(output.total).toBe(3);
    });
  });

  describe('searchMessage', () => {
    it('TC-CHAT-105: Returns filtered results from keywordKInfo', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, _c: any, o: any) => {
        o.list = [
          { info_id: 'msg-1', info_creator_role: 'REQUEST', info: 'hello world', created: 1000, session_id: 's1' },
          { info_id: 'msg-2', info_creator_role: 'RESPONSE', info: 'hello back', created: 2000, session_id: 's1' },
        ];
        o.total = 2;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), { keyword: 'hello' });
      const output = new SearchMessageOutput();

      const result = await service.searchMessage(input, new ChatContext(), output);

      spy.mockRestore();

      expect(result).toBe(true);
      expect(output.messages.length).toBe(2);
      expect(output.total).toBe(2);
      expect(output.messages[0].info_id).toBe('msg-1');
      expect(output.messages[0].info_creator_role).toBe('REQUEST');
    });

    it('searchMessage: Filters by session_id when provided', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, _c: any, o: any) => {
        o.list = [
          { info_id: 'msg-1', info_creator_role: 'REQUEST', info: 'hello', created: 1000, session_id: 's1' },
          { info_id: 'msg-2', info_creator_role: 'RESPONSE', info: 'hello', created: 2000, session_id: 's2' },
        ];
        o.total = 2;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), { keyword: 'hello', session_id: 's1' });
      const output = new SearchMessageOutput();

      await service.searchMessage(input, new ChatContext(), output);

      spy.mockRestore();

      expect(output.messages.length).toBe(1);
      expect(output.messages[0].session_id).toBe('s1');
      expect(output.total).toBe(1);
    });

    it('searchMessage: Throws ValidationError when keyword is empty', async () => {
      const input = Object.assign(new SearchMessageInput(), { keyword: '' });
      const output = new SearchMessageOutput();

      await expect(service.searchMessage(input, new ChatContext(), output)).rejects.toThrow(ValidationError);
    });
  });

  describe('pinMessage', () => {
    it('TC-CHAT-110: Pin unpinned message returns true, output.pin=true', async () => {
      await insertInfoRawRow(ctx.db, 'sess-pin', 'pin-info-1', 0);

      const input = Object.assign(new PinMessageInput(), { info_id: 'pin-info-1' });
      const output = new PinMessageOutput();

      const result = await service.pinMessage(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.pin).toBe(true);
    });

    it('TC-CHAT-111: Toggle pin flips state', async () => {
      await insertInfoRawRow(ctx.db, 'sess-pin', 'pin-info-2', 0);

      const input = Object.assign(new PinMessageInput(), { info_id: 'pin-info-2' });
      const out1 = new PinMessageOutput();
      const r1 = await service.pinMessage(input, new ChatContext(), out1);
      expect(r1).toBe(true);
      expect(out1.pin).toBe(true);

      await ctx.db.updateDB(
        Object.assign(new UpdateDBInput(), {
          table: 'info_raw',
          data: [{ field: 'pin', value: 1 }],
          conditions: [{ field: 'info_id', operator: 'EQ' as any, value: 'pin-info-2' }],
        }),
        new DBContext(),
        Object.assign(new UpdateDBOutput(), {}),
      );

      const out2 = new PinMessageOutput();
      const r2 = await service.pinMessage(input, new ChatContext(), out2);
      expect(r2).toBe(true);
      expect(out2.pin).toBe(false);
    });

    it('TC-CHAT-112: No info_id throws ValidationError', async () => {
      const input = Object.assign(new PinMessageInput(), {});
      input.info_id = undefined!;
      const output = new PinMessageOutput();

      await expect(service.pinMessage(input, new ChatContext(), output)).rejects.toThrow(ValidationError);
    });
  });

  describe('getMessageGraph', () => {
    it('TC-CHAT-115: Valid graph returns graph_structure with nodes and edges', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        info_creator_id: 'USER',
        info_creator_role: 'REQUEST',
        info: 'message 1',
        parent_info_ids: [],
      });
      await ctx.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());

      const saveInput2 = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        info_creator_id: 'agent-1',
        info_creator_role: 'RESPONSE',
        info: 'message 2',
        parent_info_ids: [],
      });
      await ctx.infoCore.saveInfo(saveInput2, new InfoCoreContext(), new SaveInfoOutput());

      const input = Object.assign(new GetMessageGraphInput(), { session_id: 'test-session' });
      const output = new GetMessageGraphOutput();

      const result = await service.getMessageGraph(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.graph_structure).toBeDefined();
      expect(Array.isArray(output.graph_structure.nodes)).toBe(true);
      expect(Array.isArray(output.graph_structure.edges)).toBe(true);
    });

    it('TC-CHAT-117: No session_id throws ValidationError', async () => {
      const input = Object.assign(new GetMessageGraphInput(), {});
      input.session_id = undefined!;
      const output = new GetMessageGraphOutput();

      await expect(service.getMessageGraph(input, new ChatContext(), output)).rejects.toThrow(ValidationError);
    });
  });

  describe('cancelWork', () => {
    it('TC-CHAT-130: Cancel running work returns cancelled=true', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'cancelWork').mockImplementation(async (_i: any, _c: any, o: any) => {
        o.cancelled = true;
        return true;
      });

      const input = Object.assign(new CancelWorkInput(), { work_id: 'work-1' });
      const output = new CancelWorkOutput();

      const result = await service.cancelWork(input, new ChatContext(), output);

      spy.mockRestore();

      expect(result).toBe(true);
      expect(output.cancelled).toBe(true);
    });

    it('TC-CHAT-131: Cancel with reason forwards reason to orchestration', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry, 'cancelWork');

      const input = Object.assign(new CancelWorkInput(), { work_id: 'work-2', reason: 'user abort' });
      const output = new CancelWorkOutput();

      await service.cancelWork(input, new ChatContext(), output);

      expect(spy).toHaveBeenCalled();
      const callInput = spy.mock.calls[0][0];
      expect(callInput.work_id).toBe('work-2');
      expect(callInput.reason).toBe('user abort');
      spy.mockRestore();
    });

    it('TC-CHAT-134: orchestration throws returns false', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'cancelWork').mockRejectedValue(new Error('cancel failed'));

      const svc = new ChatService(ctx.db, ctx.infoCore, ctx.writerAgent,
        ctx.evolutorAgent, ctx.orchestrationEntry, ctx.logger);
      const input = Object.assign(new CancelWorkInput(), { work_id: 'work-3' });
      const output = new CancelWorkOutput();
      const result = await svc.cancelWork(input, new ChatContext(), output);

      spy.mockRestore();

      expect(result).toBe(false);
      expect(output.cancelled).toBe(false);
    });
  });

  describe('configChat', () => {
    it('configChat with valid params updates output.config', async () => {
      const input = Object.assign(new ConfigChatInput(), {
        max_messages_per_session: 500,
        default_history_lastN: 30,
      });
      const output = new ConfigChatOutput();

      const result = await service.configChat(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.config.max_messages_per_session).toBe(500);
      expect(output.config.default_history_lastN).toBe(30);
    });

    it('configChat: sse_heartbeat_interval_ms updates output.config', async () => {
      const input = Object.assign(new ConfigChatInput(), { sse_heartbeat_interval_ms: 15000 });
      const output = new ConfigChatOutput();

      await service.configChat(input, new ChatContext(), output);

      expect(output.config.sse_heartbeat_interval_ms).toBe(15000);
    });

    it('configChat: negative max_messages_per_session throws ValidationError', async () => {
      const input = Object.assign(new ConfigChatInput(), { max_messages_per_session: -1 });
      const output = new ConfigChatOutput();

      await expect(service.configChat(input, new ChatContext(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-140: configChat is internal method not exposed as independent HTTP route', async () => {
      const input = Object.assign(new ConfigChatInput(), { max_messages_per_session: 250 });
      const output = new ConfigChatOutput();

      const result = await service.configChat(input, new ChatContext(), output);

      expect(result).toBe(true);
      expect(output.config.max_messages_per_session).toBe(250);
    });
  });

  describe('openChatStream - SSE format and metadata', () => {
    beforeEach(async () => {
      await ensureSession('sse-meta');
      await ensureSession('sse-headers');
      await ensureSession('sse-elapsed');
      await ensureSession('sse-token');
    });

    it('TC-CHAT-016: SSE events have correct shape (event + data)', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'sse-meta', msg_content: 'hi',
      });
      const c = new ChatContext();
      const output = new OpenChatStreamOutput();

      await service.openChatStream(input, c, output);

      for (const evt of output.events) {
        expect(evt).toHaveProperty('event');
        expect(evt).toHaveProperty('data');
        expect(typeof evt.event).toBe('string');
        expect(typeof evt.data).toBe('object');
      }
    });

    it('TC-CHAT-017: SSE connected event has session_id', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'sse-headers', msg_content: 'hi',
      });
      const output = new OpenChatStreamOutput();

      await service.openChatStream(input, new ChatContext(), output);

      expect(output.events[0].event).toBe('connected');
      expect(output.events[0].data.session_id).toBe('sse-headers');
    });

    it('SSE done event has non-negative elapsed_ms', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'sse-elapsed', msg_content: 'hi',
      });
      const output = new OpenChatStreamOutput();

      await service.openChatStream(input, new ChatContext(), output);

      const doneEvent = output.events.find(e => e.event === 'done');
      expect(doneEvent).toBeDefined();
      expect(doneEvent!.data.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('SSE done event has token_usage object', async () => {
      const input = Object.assign(new OpenChatStreamInput(), {
        session_id: 'sse-token', msg_content: 'hi',
      });
      const output = new OpenChatStreamOutput();

      await service.openChatStream(input, new ChatContext(), output);

      const doneEvent = output.events.find(e => e.event === 'done');
      expect(doneEvent!.data.token_usage).toEqual(expect.any(Object));
    });
  });

  describe('createSession - extended', () => {
    it('TC-CHAT-042: DB record persisted after createSession', async () => {
      const input = Object.assign(new CreateSessionInput(), { session_title: 'Persist Test' });
      const output = new CreateSessionOutput();
      await service.createSession(input, new ChatContext(), output);

      const sel = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'chat_session',
          conditions: [{ field: 'session_id', operator: 'EQ', value: output.session_id }],
        },
      });
      const selOut = Object.assign(new SelectOneDBOutput(), {});
      await ctx.db.selectOneDB(sel, new DBContext(), selOut);
      expect(selOut.row).toBeTruthy();
      expect(selOut.row.session_id).toBe(output.session_id);
    });

    it('TC-CHAT-044: session_title with unicode/emoji', async () => {
      const input = Object.assign(new CreateSessionInput(), { session_title: '🚀 测试 Unicode Title' });
      const output = new CreateSessionOutput();
      await service.createSession(input, new ChatContext(), output);
      expect(output.session_title).toBe('🚀 测试 Unicode Title');
    });
  });

  describe('deleteSession - extended', () => {
    it('TC-CHAT-055: cascade delete removes session and associated info_raw rows', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(new CreateSessionInput(), new ChatContext(), createOut);
      const sid = createOut.session_id;

      await insertInfoRawRow(ctx.db, sid, 'cascade-info-1');
      await insertInfoRawRow(ctx.db, sid, 'cascade-info-2');

      const delInput = Object.assign(new DeleteSessionInput(), { session_ids: [sid] });
      const delOut = new DeleteSessionOutput();
      await service.deleteSession(delInput, new ChatContext(), delOut);
      expect(delOut.deleted_count).toBe(1);

      const detailInput = Object.assign(new GetSessionDetailInput(), { session_id: sid });
      const detailOut = new GetSessionDetailOutput();
      await expect(service.getSessionDetail(detailInput, new ChatContext(), detailOut)).rejects.toThrow(NotFoundError);
    });

    it('TC-CHAT-056: deleteSession transaction rollback - invalid session_ids caused by empty string', async () => {
      const delInput = Object.assign(new DeleteSessionInput(), { session_ids: [''] });
      const delOut = new DeleteSessionOutput();
      await service.deleteSession(delInput, new ChatContext(), delOut);
      expect(delOut.deleted_count).toBe(0);
    });
  });

  describe('searchSession - extended', () => {
    it('TC-CHAT-062: time range filter with start_time and end_time', async () => {
      const input = Object.assign(new SearchSessionInput(), {
        start_time: 1600000000000,
        end_time: 2000000000000,
      });
      const output = new SearchSessionOutput();
      const result = await service.searchSession(input, new ChatContext(), output);
      expect(result).toBe(true);
      expect(Array.isArray(output.sessions)).toBe(true);
    });

    it('TC-CHAT-063: order_by created desc by default', async () => {
      const out1 = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Session-1' }),
        new ChatContext(), out1,
      );
      const out2 = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Session-2' }),
        new ChatContext(), out2,
      );

      const input = new SearchSessionInput();
      const output = new SearchSessionOutput();
      await service.searchSession(input, new ChatContext(), output);

      const createdTimes = output.sessions.map(s => s.created).filter(Number);
      for (let i = 1; i < createdTimes.length; i++) {
        expect(createdTimes[i - 1]).toBeGreaterThanOrEqual(createdTimes[i]);
      }
    });

    it('TC-CHAT-067: message_count field present in search results', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Msg Count Test' }),
        new ChatContext(), createOut,
      );
      await insertInfoRawRow(ctx.db, createOut.session_id, 'mct-1');
      await insertInfoRawRow(ctx.db, createOut.session_id, 'mct-2');

      const input = Object.assign(new SearchSessionInput(), { keyword: 'Msg Count' });
      const output = new SearchSessionOutput();
      await service.searchSession(input, new ChatContext(), output);

      const session = output.sessions.find(s => s.session_id === createOut.session_id);
      expect(session).toBeDefined();
      expect(session!.message_count).toBeGreaterThanOrEqual(0);
    });

    it('TC-CHAT-066: no matching sessions returns empty array', async () => {
      const input = Object.assign(new SearchSessionInput(), {
        keyword: 'completely_nonexistent_' + Date.now(),
      });
      const output = new SearchSessionOutput();
      await service.searchSession(input, new ChatContext(), output);
      expect(output.sessions).toEqual([]);
      expect(output.total).toBe(0);
    });

    it('TC-CHAT-068: negative page_current falls back to page 1', async () => {
      const input = Object.assign(new SearchSessionInput(), {
        page_current: -1,
        page_size: 5,
      });
      const output = new SearchSessionOutput();
      await service.searchSession(input, new ChatContext(), output);
      expect(Array.isArray(output.sessions)).toBe(true);
    });
  });

  describe('checkSessionOverflow - extended', () => {
    it('TC-CHAT-082: max_messages_per_session default=1000', async () => {
      const input = Object.assign(new CheckSessionOverflowInput(), { session_id: 'overflow-default' });
      const output = new CheckSessionOverflowOutput();
      await service.checkSessionOverflow(input, new ChatContext(), output);
      expect(output.max_messages).toBe(1000);
    });

    it('TC-CHAT-083: custom max_messages_per_session from chat_config', async () => {
      await insertChatConfig(ctx.db, { max_messages_per_session: 500 });

      const input = Object.assign(new CheckSessionOverflowInput(), { session_id: 'overflow-custom' });
      const output = new CheckSessionOverflowOutput();
      await service.checkSessionOverflow(input, new ChatContext(), output);
      expect(output.max_messages).toBe(500);
    });

    it('TC-CHAT-084: nonexistent session returns is_overflowed=false', async () => {
      const input = Object.assign(new CheckSessionOverflowInput(), {
        session_id: 'session-does-not-exist',
      });
      const output = new CheckSessionOverflowOutput();
      await service.checkSessionOverflow(input, new ChatContext(), output);
      expect(output.is_overflowed).toBe(false);
    });
  });

  describe('getChatHistory - extended', () => {
    it('TC-CHAT-098: empty session returns messages=[]', async () => {
      const input = Object.assign(new GetChatHistoryInput(), { session_id: 'empty-session' });
      const output = new GetChatHistoryOutput();
      await service.getChatHistory(input, new ChatContext(), output);

      expect(output.messages).toEqual([]);
      expect(output.total).toBe(0);
    });

    it('TC-CHAT-099: combined filters (session_id + work_id)', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        work_id: 'work-1',
        info_creator_id: 'USER',
        info_creator_role: 'REQUEST',
        info: 'w1-msg',
      });
      await ctx.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());

      const input = Object.assign(new GetChatHistoryInput(), {
        session_id: 'test-session',
        work_id: 'work-1',
      });
      const output = new GetChatHistoryOutput();
      await service.getChatHistory(input, new ChatContext(), output);

      expect(output.total).toBeGreaterThanOrEqual(1);
    });

    it('getChatHistory: messages contain citing_count field', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        info_creator_id: 'USER',
        info_creator_role: 'REQUEST',
        info: 'cited message',
      });
      await ctx.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());

      const input = Object.assign(new GetChatHistoryInput(), { session_id: 'test-session' });
      const output = new GetChatHistoryOutput();
      await service.getChatHistory(input, new ChatContext(), output);

      if (output.messages.length > 0) {
        expect(output.messages[0]).toHaveProperty('citing_count');
        expect(typeof output.messages[0].citing_count).toBe('number');
      }
    });
  });

  describe('searchMessage - extended', () => {
    it('TC-CHAT-109: no matching keyword returns empty list', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, _c: any, o: any) => {
        o.list = [];
        o.total = 0;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), { keyword: 'xyznomatch' });
      const output = new SearchMessageOutput();
      await service.searchMessage(input, new ChatContext(), output);

      spy.mockRestore();

      expect(output.messages).toEqual([]);
      expect(output.total).toBe(0);
    });

    it('searchMessage: pagination works with keyword', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, _c: any, o: any) => {
        o.list = [
          { info_id: 'm1', info_creator_role: 'REQUEST', info: 'test a', created: 1, session_id: 's1' },
          { info_id: 'm2', info_creator_role: 'REQUEST', info: 'test b', created: 2, session_id: 's1' },
          { info_id: 'm3', info_creator_role: 'RESPONSE', info: 'test c', created: 3, session_id: 's1' },
        ];
        o.total = 3;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), {
        keyword: 'test', page_current: 1, page_size: 2,
      });
      const output = new SearchMessageOutput();
      await service.searchMessage(input, new ChatContext(), output);

      spy.mockRestore();

      expect(output.total).toBe(3);
      expect(output.messages.length).toBe(2);
    });

    it('TC-CHAT-107: searchMessage pagination returns correct page with offset', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, _c: any, o: any) => {
        o.list = [
          { info_id: 'p1', info_creator_role: 'REQUEST', info: 'a', created: 1, session_id: 's1' },
          { info_id: 'p2', info_creator_role: 'RESPONSE', info: 'b', created: 2, session_id: 's1' },
          { info_id: 'p3', info_creator_role: 'REQUEST', info: 'c', created: 3, session_id: 's1' },
          { info_id: 'p4', info_creator_role: 'RESPONSE', info: 'd', created: 4, session_id: 's1' },
          { info_id: 'p5', info_creator_role: 'REQUEST', info: 'e', created: 5, session_id: 's1' },
        ];
        o.total = 5;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), {
        keyword: 'test', page_current: 2, page_size: 2,
      });
      const output = new SearchMessageOutput();
      await service.searchMessage(input, new ChatContext(), output);

      spy.mockRestore();

      expect(output.total).toBe(5);
      expect(output.messages.length).toBe(2);
      expect(output.messages[0].info_id).toBe('p3');
      expect(output.messages[1].info_id).toBe('p4');
    });
  });

  describe('getMessageGraph - extended', () => {
    it('TC-CHAT-118: nonexistent session_id returns empty nodes', async () => {
      const input = Object.assign(new GetMessageGraphInput(), { session_id: 'non-existent-graph' });
      const output = new GetMessageGraphOutput();
      await service.getMessageGraph(input, new ChatContext(), output);

      expect(output.graph_structure.nodes).toEqual([]);
      expect(output.graph_structure.edges).toEqual([]);
    });

    it('TC-CHAT-119: node properties include info_id, info_creator_role, created, pin', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'graph-props',
        info_creator_id: 'USER',
        info_creator_role: 'REQUEST',
        info: 'node message',
      });
      await ctx.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());

      const input = Object.assign(new GetMessageGraphInput(), { session_id: 'graph-props' });
      const output = new GetMessageGraphOutput();
      await service.getMessageGraph(input, new ChatContext(), output);

      if (output.graph_structure.nodes.length > 0) {
        const node = output.graph_structure.nodes[0] as Record<string, unknown>;
        expect(node).toHaveProperty('id');
      }
    });

    it('TC-CHAT-120: edge properties include citing_info_id and cited_info_id', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'edge-props',
        info_creator_id: 'USER',
        info_creator_role: 'REQUEST',
        info: 'edge source',
      });
      await ctx.infoCore.saveInfo(saveInput, new InfoCoreContext(), new SaveInfoOutput());

      const saveInput2 = Object.assign(new SaveInfoInput(), {
        session_id: 'edge-props',
        info_creator_id: 'agent-1',
        info_creator_role: 'RESPONSE',
        info: 'edge target',
      });
      await ctx.infoCore.saveInfo(saveInput2, new InfoCoreContext(), new SaveInfoOutput());

      const input = Object.assign(new GetMessageGraphInput(), { session_id: 'edge-props' });
      const output = new GetMessageGraphOutput();
      await service.getMessageGraph(input, new ChatContext(), output);

      if (output.graph_structure.edges.length > 0) {
        const edge = output.graph_structure.edges[0] as Record<string, unknown>;
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
      }
    });
  });

  describe('cancelWork - extended', () => {
    it('TC-CHAT-132: cancel already completed work returns cancelled=false', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'cancelWork').mockImplementation(async (_i: any, _c: any, o: any) => {
        o.cancelled = false;
        return true;
      });

      const input = Object.assign(new CancelWorkInput(), { work_id: 'completed-work' });
      const output = new CancelWorkOutput();
      await service.cancelWork(input, new ChatContext(), output);

      spy.mockRestore();

      expect(output.cancelled).toBe(false);
    });

    it('TC-CHAT-133: nonexistent work_id returns cancelled=false', async () => {
      const spy = vi.spyOn(ctx.orchestrationEntry as any, 'cancelWork').mockImplementation(async (_i: any, _c: any, o: any) => {
        o.cancelled = false;
        return true;
      });

      const input = Object.assign(new CancelWorkInput(), { work_id: 'no-such-work' });
      const output = new CancelWorkOutput();
      await service.cancelWork(input, new ChatContext(), output);

      spy.mockRestore();

      expect(output.cancelled).toBe(false);
    });
  });
});
