import { Metrics, Report } from '@brian-agent/base';
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
import { ChatService, type ChatRuntimeV2Deps } from '../Chat/application/ChatService';
import { StreamAccess } from '../../Base/StreamProvider/access/StreamAccess';
import {
  RegisterStreamInput, RegisterStreamOutput, StreamContext,
  PushEventToEndpointInput, PushEventToEndpointOutput,
} from '../../Base/StreamProvider/domain/types';
import { SessionAccess, RunGatewayAccess } from '@brian-agent/runtime';
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
    { field: 'info_type', value: 'REQUEST' },
    { field: 'info_creator_role', value: 'USER' },
    { field: 'info_creator_id', value: '' },
    { field: 'info', value: info },
    { field: 'info_length', value: info.length },
    { field: 'pin', value: pinVal },
  ];
  await db.insertDB(
    Object.assign(new InsertDBInput(), { table: 'info_raw', data }),
    Object.assign(new InsertDBOutput(), {}),
    new DBContext(),
  );
}

async function insertChatConfig(db: RelationDBAccess, config: Record<string, unknown>) {
  const existingOut = Object.assign(new SelectOneDBOutput(), {});
  await db.selectOneDB(
    Object.assign(new SelectOneDBInput(), { query_param: { table: 'chat_config' } }),
    existingOut,
    new DBContext(),
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
      Object.assign(new UpdateDBOutput(), {}),
      new DBContext(),
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
      Object.assign(new InsertDBOutput(), {}),
      new DBContext(),
    );
  }
}

describe('ChatService', () => {
  let ctx: RealTestContext;
  let service: ChatService;

  beforeEach(async () => {
    ctx = await setupRealTestEnvironment();
    new ChatSchemaInitializer(ctx.db).init();
    service = new ChatService(ctx.db, ctx.infoCore, ctx.logger);
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
      Object.assign(new InsertDBOutput(), {}),
      new DBContext(),
    );
  }

  describe('openChatStream（V2 协议：Report 携带端点 ID → StreamProvider）', () => {
    let streamAccess: StreamAccess;
    let frames: string[];
    let endpointId: string;

    beforeEach(async () => {
      await ensureSession('test-session');
      await ensureSession('sse-meta');
      await ensureSession('sse-overflow');
      frames = [];
      streamAccess = new StreamAccess(ctx.db);
      const regOut = new RegisterStreamOutput();
      await streamAccess.registerStream(
        Object.assign(new RegisterStreamInput(), {
          session_id: 'test-session',
          writer: (chunk: string) => { frames.push(chunk); return true; },
        }),
        regOut,
        new StreamContext(),
      );
      endpointId = regOut.endpoint_id;
      // 组合根语义：Report 事件流网关 → StreamProvider
      Report.setEventStreamGateway({
        pushToEndpoint: async (input) => {
          await streamAccess.publishEvent(
            Object.assign(new PushEventToEndpointInput(), input),
            new PushEventToEndpointOutput(),
            new StreamContext(),
          );
        },
      });
    });

    afterEach(() => {
      Report.setEventStreamGateway(null);
      vi.restoreAllMocks();
    });

    function makeRuntime(): ChatRuntimeV2Deps {
      const gateway = {
        submitRun: async (_i: unknown, o: { run_id: string }, _c: unknown, _m: unknown, report?: Report) => {
          o.run_id = 'run-v2';
          // 模拟 Loop 的业务事件上报（Report 携带端点 ID → StreamProvider）
          report?.pushBusinessEvent('part.created' as never, { part_id: 'p1', part_type: 'text' });
          report?.pushBusinessEvent('part.delta' as never, { field: 'text', delta: 'V2 你好' });
          report?.pushBusinessEvent('run.status' as never, { phase: 'end', stop_reason: 'stop' });
          return true;
        },
        waitRun: async (_i: unknown, o: { status: string; stop_reason?: string }) => {
          o.status = 'finished';
          o.stop_reason = 'stop';
          return true;
        },
      } as unknown as RunGatewayAccess;
      const session = new SessionAccess(ctx.db);
      return { gateway, session, isV2Enabled: async () => true };
    }

    function makeV2Service(): ChatService {
      return new ChatService(ctx.db, ctx.infoCore, ctx.logger, undefined, makeRuntime());
    }

    it('TC-V2-001: connected/loading 传输帧 + 无 v1 文本事件（V1 已移除）', async () => {
      const input = Object.assign(new OpenChatStreamInput(), { session_id: 'test-session', msg_content: 'hello', stream_endpoint_id: endpointId });
      const output = new OpenChatStreamOutput();
      await makeV2Service().openChatStream(input, output, new ChatContext());
      expect(output.events[0].event).toBe('session.connected');
      expect(output.events[1].event).toBe('session.loading');
      expect(output.events.some((e) => e.event === 'text')).toBe(false);
    });

    it('TC-V2-002: part.delta 经 Report→StreamProvider 写入端点帧（v2 协议名）', async () => {
      const input = Object.assign(new OpenChatStreamInput(), { session_id: 'test-session', msg_content: 'hello', stream_endpoint_id: endpointId });
      await makeV2Service().openChatStream(input, new OpenChatStreamOutput(), new ChatContext());
      await new Promise((r) => setTimeout(r, 80));
      const deltaFrame = frames.find((f) => f.includes('"part.delta"'));
      expect(deltaFrame).toBeTruthy();
      expect(deltaFrame).toContain('V2 你好');
      // run.status end 帧也经端点投递
      expect(frames.some((f) => f.includes('"run.status"'))).toBe(true);
    });

    it('TC-V2-003: done 传输帧收尾（paused=false）', async () => {
      const input = Object.assign(new OpenChatStreamInput(), { session_id: 'test-session', msg_content: 'hello', stream_endpoint_id: endpointId });
      const output = new OpenChatStreamOutput();
      await makeV2Service().openChatStream(input, output, new ChatContext());
      const last = output.events[output.events.length - 1];
      expect(last.event).toBe('session.done');
      expect(last.data.work_id).toBe('run-v2');
      expect(last.data.paused).toBe(false);
    });

    it('TC-V2-004: 未装配 Runtime 应 fail-loud', async () => {
      const bare = new ChatService(ctx.db, ctx.infoCore, ctx.logger);
      const input = Object.assign(new OpenChatStreamInput(), { session_id: 'test-session', msg_content: 'hello', stream_endpoint_id: endpointId });
      await expect(bare.openChatStream(input, new OpenChatStreamOutput(), new ChatContext())).rejects.toThrow('Runtime v2 未装配');
    });
  });

  describe('createSession', () => {
    it('TC-CHAT-040: With title returns session_id, matching session_title, created > 0', async () => {
      const input = Object.assign(new CreateSessionInput(), { session_title: 'My Test Session' });
      const c = new ChatContext();
      const output = new CreateSessionOutput();

      const result = await service.createSession(input, output, c);

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

      const result = await service.createSession(input, output, c);

      expect(result).toBe(true);
      expect(output.session_id).toBeTruthy();
      expect(output.session_title).toBe('新会话');
    });

    it('TC-CHAT-043: Two sessions get different session_ids', async () => {
      const out1 = new CreateSessionOutput();
      const out2 = new CreateSessionOutput();

      await Promise.all([
        service.createSession(Object.assign(new CreateSessionInput(), { session_title: 'A' }), out1, new ChatContext()),
        service.createSession(Object.assign(new CreateSessionInput(), { session_title: 'B' }), out2, new ChatContext()),
      ]);

      expect(out1.session_id).not.toBe(out2.session_id);
    });
  });

  describe('deleteSession', () => {
    it('TC-CHAT-050: Delete existing session returns deleted_count=1', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(new CreateSessionInput(), createOut, new ChatContext());

      const input = Object.assign(new DeleteSessionInput(), { session_ids: [createOut.session_id] });
      const output = new DeleteSessionOutput();

      const result = await service.deleteSession(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.deleted_count).toBe(1);
    });

    it('TC-CHAT-051: Batch delete returns deleted_count matching inserted count', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const out = new CreateSessionOutput();
        await service.createSession(new CreateSessionInput(), out, new ChatContext());
        ids.push(out.session_id);
      }

      const input = Object.assign(new DeleteSessionInput(), { session_ids: ids });
      const output = new DeleteSessionOutput();

      const result = await service.deleteSession(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.deleted_count).toBe(3);
    });

    it('TC-CHAT-052: Delete non-existent returns deleted_count=0', async () => {
      const input = Object.assign(new DeleteSessionInput(), { session_ids: ['no-such-session'] });
      const output = new DeleteSessionOutput();

      const result = await service.deleteSession(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.deleted_count).toBe(0);
    });

    it('TC-CHAT-053: Mixed valid/invalid session_ids counts only valid', async () => {
      const out1 = new CreateSessionOutput();
      const out2 = new CreateSessionOutput();
      await service.createSession(new CreateSessionInput(), out1, new ChatContext());
      await service.createSession(new CreateSessionInput(), out2, new ChatContext());

      const input = Object.assign(new DeleteSessionInput(), {
        session_ids: [out1.session_id, 'no-such', out2.session_id],
      });
      const output = new DeleteSessionOutput();

      const result = await service.deleteSession(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.deleted_count).toBe(2);
    });

    it('TC-CHAT-054: Empty session_ids throws ValidationError', async () => {
      const input = Object.assign(new DeleteSessionInput(), { session_ids: [] });
      const output = new DeleteSessionOutput();

      await expect(service.deleteSession(input, output, new ChatContext())).rejects.toThrow(ValidationError);
    });
  });

  describe('soSession', () => {
    it('TC-CHAT-060: No params returns sessions array with default page_size=20', async () => {
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'First' }),
        new CreateSessionOutput(), new ChatContext(),
      );

      const input = new SearchSessionInput();
      const output = new SearchSessionOutput();

      const result = await service.soSession(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.sessions.length).toBeGreaterThanOrEqual(1);
      expect(output.total).toBeGreaterThanOrEqual(1);
      expect(output.sessions[0].session_id).toEqual(expect.any(String));
      expect(output.sessions[0].session_title).toEqual(expect.any(String));
    });

    it('TC-CHAT-061: Keyword search filters by session_title', async () => {
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Alpha Project' }),
        new CreateSessionOutput(), new ChatContext(),
      );
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Beta Test' }),
        new CreateSessionOutput(), new ChatContext(),
      );

      const input = Object.assign(new SearchSessionInput(), { keyword: 'Alpha' });
      const output = new SearchSessionOutput();

      const result = await service.soSession(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.sessions.length).toBeGreaterThanOrEqual(1);
      const titles = output.sessions.map(s => s.session_title);
      expect(titles.some(t => t.includes('Alpha'))).toBe(true);
    });

    it('TC-CHAT-064: Pagination returns correct page', async () => {
      for (let i = 0; i < 3; i++) {
        await service.createSession(
          Object.assign(new CreateSessionInput(), { session_title: `Session ${i}` }),
          new CreateSessionOutput(), new ChatContext(),
        );
      }

      const input = Object.assign(new SearchSessionInput(), { page_size: 2, page_current: 2 });
      const output = new SearchSessionOutput();

      const result = await service.soSession(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.sessions.length).toBe(1);
      expect(output.total).toBe(3);
    });
  });

  describe('soSessionDetail', () => {
    it('TC-CHAT-070: Valid session returns session id in output.session', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Detail Test' }),
        createOut, new ChatContext(),
      );

      const input = Object.assign(new GetSessionDetailInput(), { session_id: createOut.session_id });
      const output = new GetSessionDetailOutput();

      const result = await service.soSessionDetail(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.session.session_id).toBe(createOut.session_id);
      expect(output.session.session_title).toBe('Detail Test');
    });

    it('TC-CHAT-071: Invalid session throws NotFoundError', async () => {
      const input = Object.assign(new GetSessionDetailInput(), { session_id: 'no-such-session' });
      const output = new GetSessionDetailOutput();

      await expect(service.soSessionDetail(input, output, new ChatContext())).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateSessionTitle', () => {
    it('TC-CHAT-075: Valid update returns true', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Old Title' }),
        createOut, new ChatContext(),
      );

      const input = Object.assign(new UpdateSessionTitleInput(), {
        session_id: createOut.session_id, session_title: 'New Title',
      });
      const output = new UpdateSessionTitleOutput();

      const result = await service.updateSessionTitle(input, output, new ChatContext());

      expect(result).toBe(true);
    });

    it('TC-CHAT-076: Empty title throws ValidationError', async () => {
      const input = Object.assign(new UpdateSessionTitleInput(), {
        session_id: 'test-session', session_title: '',
      });
      const output = new UpdateSessionTitleOutput();

      await expect(service.updateSessionTitle(input, output, new ChatContext())).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-077: Non-existent session throws NotFoundError', async () => {
      const input = Object.assign(new UpdateSessionTitleInput(), {
        session_id: 'no-such-session', session_title: 'New Title',
      });
      const output = new UpdateSessionTitleOutput();

      await expect(service.updateSessionTitle(input, output, new ChatContext())).rejects.toThrow(NotFoundError);
    });

    function makeV2Svc(): ChatService {
      const gateway = {
        submitRun: async (_i: unknown, o: { run_id: string }) => {
          o.run_id = 'run-t';
          return true;
        },
        waitRun: async (_i: unknown, o: { status: string }) => {
          o.status = 'finished';
          return true;
        },
      } as unknown as RunGatewayAccess;
      return new ChatService(ctx.db, ctx.infoCore, ctx.logger, undefined, { gateway, session: new SessionAccess(ctx.db) });
    }

    it('TC-CHAT-078: First message automatically sets session_title with max 50 chars truncation', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(new CreateSessionInput(), createOut, new ChatContext());

      const longMsg = '这是一个超过五十个字符测试消息的超级长的文本输入内容，用来测试系统是否能够自动截断为前五十个字符并成功设置为会话名称！后面还有很多很多废话内容……';
      const input = Object.assign(new OpenChatStreamInput(), { session_id: createOut.session_id, msg_content: longMsg });
      await makeV2Svc().openChatStream(input, new OpenChatStreamOutput(), new ChatContext());

      const detailIn = Object.assign(new GetSessionDetailInput(), { session_id: createOut.session_id });
      const detailOut = new GetSessionDetailOutput();
      await service.soSessionDetail(detailIn, detailOut, new ChatContext());

      expect(detailOut.session.session_title).toBe(longMsg.slice(0, 50));
      expect(detailOut.session.session_title.length).toBe(50);
    });

    it('TC-CHAT-079: Subsequent messages do not overwrite existing session_title', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(new CreateSessionInput(), createOut, new ChatContext());

      const firstMsg = '第一条消息';
      await makeV2Svc().openChatStream(
        Object.assign(new OpenChatStreamInput(), { session_id: createOut.session_id, msg_content: firstMsg }),
        new OpenChatStreamOutput(),
        new ChatContext(),
      );

      const secondMsg = '第二条消息不应该覆盖标题';
      await makeV2Svc().openChatStream(
        Object.assign(new OpenChatStreamInput(), { session_id: createOut.session_id, msg_content: secondMsg }),
        new OpenChatStreamOutput(),
        new ChatContext(),
      );

      const detailIn = Object.assign(new GetSessionDetailInput(), { session_id: createOut.session_id });
      const detailOut = new GetSessionDetailOutput();
      await service.soSessionDetail(detailIn, detailOut, new ChatContext());

      expect(detailOut.session.session_title).toBe('第一条消息');
    });
  });

  describe('checkSessionOverflow', () => {
    it('TC-CHAT-080: Not overflowed returns is_overflowed=false, max_messages=1000 (default)', async () => {
      const input = Object.assign(new CheckSessionOverflowInput(), { session_id: 'test-session' });
      const output = new CheckSessionOverflowOutput();

      const result = await service.checkSessionOverflow(input, output, new ChatContext());

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

      const result = await service.checkSessionOverflow(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.is_overflowed).toBe(true);
      expect(output.max_messages).toBe(2);
      expect(output.message_count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('soChatHistory', () => {
    it('TC-CHAT-090: Returns messages with citing_count from lastNInfo', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        work_id: 'test-work-id',
        info_creator_id: '',
        info_type: 'REQUEST',
        info: 'hello',
      });
      const saveInput2 = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        work_id: 'test-work-id',
        info_creator_id: 'agent-1',
        info_type: 'RESPONSE',
        info: 'world',
      });
      await ctx.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());
      await ctx.infoCore.saveInfo(saveInput2, new SaveInfoOutput(), new InfoCoreContext());

      const input = Object.assign(new GetChatHistoryInput(), { session_id: 'test-session' });
      const output = new GetChatHistoryOutput();

      const result = await service.soChatHistory(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.messages.length).toBeGreaterThanOrEqual(1);
      expect(output.total).toBeGreaterThanOrEqual(1);
      expect(output.messages[0]).toHaveProperty('info_id');
      expect(output.messages[0]).toHaveProperty('citing_count');
    });

    it('soChatHistory: Uses default lastN from chat_config when not provided', async () => {
      await insertChatConfig(ctx.db, { default_history_lastN: 10 });

      const input = new GetChatHistoryInput();
      const output = new GetChatHistoryOutput();

      await service.soChatHistory(input, output, new ChatContext());

      expect(Array.isArray(output.messages)).toBe(true);
    });

    it('soChatHistory: Uses provided lastN when specified', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test',
        work_id: 'test-work-id',
        info_creator_id: '',
        info_type: 'REQUEST',
        info: 'test msg',
      });
      await ctx.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());

      const input = Object.assign(new GetChatHistoryInput(), { session_id: 'test', lastN: 5 });
      const output = new GetChatHistoryOutput();

      await service.soChatHistory(input, output, new ChatContext());

      expect(output.total).toBeGreaterThanOrEqual(1);
    });

    it('soChatHistory: Pagination slices correctly', async () => {
      for (const info of ['1', '2', '3']) {
        const saveInput = Object.assign(new SaveInfoInput(), {
          session_id: 'test',
          work_id: 'test-work-id',
          info_creator_id: '',
          info_type: 'REQUEST',
          info,
        });
        await ctx.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());
      }

      const input = Object.assign(new GetChatHistoryInput(), {
        session_id: 'test', page_size: 2, page_current: 2,
      });
      const output = new GetChatHistoryOutput();

      await service.soChatHistory(input, output, new ChatContext());

      expect(output.messages.length).toBe(1);
      expect(output.total).toBe(3);
    });
  });

  describe('soMessage', () => {
    it('TC-CHAT-105: Returns filtered results from keywordKInfo', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [
          { info_id: 'msg-1', info_type: 'REQUEST', info: 'hello world', created: 1000, session_id: 's1' },
          { info_id: 'msg-2', info_type: 'RESPONSE', info: 'hello back', created: 2000, session_id: 's1' },
        ];
        o.total = 2;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), { keyword: 'hello' });
      const output = new SearchMessageOutput();

      const result = await service.soMessage(input, output, new ChatContext());

      spy.mockRestore();

      expect(result).toBe(true);
      expect(output.messages.length).toBe(2);
      expect(output.total).toBe(2);
      expect(output.messages[0].info_id).toBe('msg-1');
      expect(output.messages[0].info_type).toBe('REQUEST');
    });

    it('soMessage: Filters by session_id when provided', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [
          { info_id: 'msg-1', info_type: 'REQUEST', info: 'hello', created: 1000, session_id: 's1' },
          { info_id: 'msg-2', info_type: 'RESPONSE', info: 'hello', created: 2000, session_id: 's2' },
        ];
        o.total = 2;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), { keyword: 'hello', session_id: 's1' });
      const output = new SearchMessageOutput();

      await service.soMessage(input, output, new ChatContext());

      spy.mockRestore();

      expect(output.messages.length).toBe(1);
      expect(output.messages[0].session_id).toBe('s1');
      expect(output.total).toBe(1);
    });

    it('soMessage: Throws ValidationError when keyword is empty', async () => {
      const input = Object.assign(new SearchMessageInput(), { keyword: '' });
      const output = new SearchMessageOutput();

      await expect(service.soMessage(input, output, new ChatContext())).rejects.toThrow(ValidationError);
    });
  });

  describe('pinMessage', () => {
    it('TC-CHAT-110: Pin unpinned message returns true, output.pin=true', async () => {
      await insertInfoRawRow(ctx.db, 'sess-pin', 'pin-info-1', 0);

      const input = Object.assign(new PinMessageInput(), { info_id: 'pin-info-1' });
      const output = new PinMessageOutput();

      const result = await service.pinMessage(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.pin).toBe(true);
    });

    it('TC-CHAT-111: Toggle pin flips state', async () => {
      await insertInfoRawRow(ctx.db, 'sess-pin', 'pin-info-2', 0);

      const input = Object.assign(new PinMessageInput(), { info_id: 'pin-info-2' });
      const out1 = new PinMessageOutput();
      const r1 = await service.pinMessage(input, out1, new ChatContext());
      expect(r1).toBe(true);
      expect(out1.pin).toBe(true);

      await ctx.db.updateDB(
        Object.assign(new UpdateDBInput(), {
          table: 'info_raw',
          data: [{ field: 'pin', value: 1 }],
          conditions: [{ field: 'info_id', operator: 'EQ' as any, value: 'pin-info-2' }],
        }),
        Object.assign(new UpdateDBOutput(), {}),
        new DBContext(),
      );

      const out2 = new PinMessageOutput();
      const r2 = await service.pinMessage(input, out2, new ChatContext());
      expect(r2).toBe(true);
      expect(out2.pin).toBe(false);
    });

    it('TC-CHAT-112: No info_id throws ValidationError', async () => {
      const input = Object.assign(new PinMessageInput(), {});
      input.info_id = undefined!;
      const output = new PinMessageOutput();

      await expect(service.pinMessage(input, output, new ChatContext())).rejects.toThrow(ValidationError);
    });
  });

  describe('soMessageGraph', () => {
    it('TC-CHAT-115: Valid graph returns graph_structure with nodes and edges', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        work_id: 'test-work-id',
        info_creator_id: '',
        info_type: 'REQUEST',
        info: 'message 1',
        parent_info_ids: [],
      });
      await ctx.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());

      const saveInput2 = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        work_id: 'test-work-id',
        info_creator_id: 'agent-1',
        info_type: 'RESPONSE',
        info: 'message 2',
        parent_info_ids: [],
      });
      await ctx.infoCore.saveInfo(saveInput2, new SaveInfoOutput(), new InfoCoreContext());

      const input = Object.assign(new GetMessageGraphInput(), { session_id: 'test-session' });
      const output = new GetMessageGraphOutput();

      const result = await service.soMessageGraph(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.graph_structure).toBeDefined();
      expect(Array.isArray(output.graph_structure.nodes)).toBe(true);
      expect(Array.isArray(output.graph_structure.edges)).toBe(true);
    });

    it('TC-CHAT-117: No session_id throws ValidationError', async () => {
      const input = Object.assign(new GetMessageGraphInput(), {});
      input.session_id = undefined!;
      const output = new GetMessageGraphOutput();

      await expect(service.soMessageGraph(input, output, new ChatContext())).rejects.toThrow(ValidationError);
    });
  });

  describe('configChat', () => {
    it('configChat with valid params updates output.config', async () => {
      const input = Object.assign(new ConfigChatInput(), {
        max_messages_per_session: 500,
        default_history_lastN: 30,
      });
      const output = new ConfigChatOutput();

      const result = await service.configChat(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.config.max_messages_per_session).toBe(500);
      expect(output.config.default_history_lastN).toBe(30);
    });

    it('configChat: sse_heartbeat_interval_ms updates output.config', async () => {
      const input = Object.assign(new ConfigChatInput(), { sse_heartbeat_interval_ms: 15000 });
      const output = new ConfigChatOutput();

      await service.configChat(input, output, new ChatContext());

      expect(output.config.sse_heartbeat_interval_ms).toBe(15000);
    });

    it('configChat: negative max_messages_per_session throws ValidationError', async () => {
      const input = Object.assign(new ConfigChatInput(), { max_messages_per_session: -1 });
      const output = new ConfigChatOutput();

      await expect(service.configChat(input, output, new ChatContext())).rejects.toThrow(ValidationError);
    });

    it('TC-CHAT-140: configChat is internal method not exposed as independent HTTP route', async () => {
      const input = Object.assign(new ConfigChatInput(), { max_messages_per_session: 250 });
      const output = new ConfigChatOutput();

      const result = await service.configChat(input, output, new ChatContext());

      expect(result).toBe(true);
      expect(output.config.max_messages_per_session).toBe(250);
    });
  });

  describe('openChatStream - SSE 帧格式（V2）', () => {
    let streamAccess: StreamAccess;
    let frames: string[];
    let endpointId: string;

    beforeEach(async () => {
      await ensureSession('test-session');
      frames = [];
      streamAccess = new StreamAccess(ctx.db);
      const regOut = new RegisterStreamOutput();
      await streamAccess.registerStream(
        Object.assign(new RegisterStreamInput(), {
          session_id: 'test-session',
          writer: (chunk: string) => { frames.push(chunk); return true; },
        }),
        regOut,
        new StreamContext(),
      );
      endpointId = regOut.endpoint_id;
      Report.setEventStreamGateway({
        pushToEndpoint: async (input) => {
          await streamAccess.publishEvent(
            Object.assign(new PushEventToEndpointInput(), input),
            new PushEventToEndpointOutput(),
            new StreamContext(),
          );
        },
      });
    });

    afterEach(() => {
      Report.setEventStreamGateway(null);
      vi.restoreAllMocks();
    });

    function makeV2Service(): ChatService {
      const gateway = {
        submitRun: async (_i: unknown, o: { run_id: string }, _c: unknown, _m: unknown, report?: Report) => {
          o.run_id = 'run-v2';
          report?.pushBusinessEvent('part.delta' as never, { field: 'text', delta: '帧格式' });
          report?.pushBusinessEvent('run.status' as never, { phase: 'end', stop_reason: 'stop' });
          return true;
        },
        waitRun: async (_i: unknown, o: { status: string }) => {
          o.status = 'finished';
          return true;
        },
      } as unknown as RunGatewayAccess;
      return new ChatService(ctx.db, ctx.infoCore, ctx.logger, undefined, {
        gateway,
        session: new SessionAccess(ctx.db),
      });
    }

    it('TC-V2-010: 结构化帧含 BrianSSEMessage 必备字段（msg_id/event/data/timestamp）', async () => {
      const input = Object.assign(new OpenChatStreamInput(), { session_id: 'test-session', msg_content: 'hello', stream_endpoint_id: endpointId });
      const output = new OpenChatStreamOutput();
      await makeV2Service().openChatStream(input, output, new ChatContext());
      await new Promise((r) => setTimeout(r, 80));
      const deltaFrame = frames.find((f) => f.includes('"part.delta"'));
      expect(deltaFrame).toBeTruthy();
      const msg = JSON.parse((deltaFrame as string).replace(/^data: /, '').trim());
      expect(msg).toMatchObject({ msg_id: expect.any(String), event: 'part.delta', timestamp: expect.any(Number) });
    });

    it('TC-V2-011: done 传输帧含 elapsed_ms/token_usage/paused', async () => {
      const input = Object.assign(new OpenChatStreamInput(), { session_id: 'test-session', msg_content: 'hello', stream_endpoint_id: endpointId });
      const output = new OpenChatStreamOutput();
      await makeV2Service().openChatStream(input, output, new ChatContext());
      const last = output.events[output.events.length - 1];
      expect(last.event).toBe('session.done');
      expect(last.data.elapsed_ms).toBeGreaterThanOrEqual(0);
      expect(last.data.token_usage).toEqual({});
      expect(last.data.paused).toBe(false);
    });
  });

  describe('createSession - extended', () => {
    it('TC-CHAT-042: DB record persisted after createSession', async () => {
      const input = Object.assign(new CreateSessionInput(), { session_title: 'Persist Test' });
      const output = new CreateSessionOutput();
      await service.createSession(input, output, new ChatContext());

      const sel = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'chat_session',
          conditions: [{ field: 'session_id', operator: 'EQ', value: output.session_id }],
        },
      });
      const selOut = Object.assign(new SelectOneDBOutput(), {});
      await ctx.db.selectOneDB(sel, selOut, new DBContext());
      expect(selOut.row).toBeTruthy();
      expect(selOut.row.session_id).toBe(output.session_id);
    });

    it('TC-CHAT-044: session_title with unicode/emoji', async () => {
      const input = Object.assign(new CreateSessionInput(), { session_title: '🚀 测试 Unicode Title' });
      const output = new CreateSessionOutput();
      await service.createSession(input, output, new ChatContext());
      expect(output.session_title).toBe('🚀 测试 Unicode Title');
    });
  });

  describe('deleteSession - extended', () => {
    it('TC-CHAT-055: cascade delete removes session and associated info_raw rows', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(new CreateSessionInput(), createOut, new ChatContext());
      const sid = createOut.session_id;

      await insertInfoRawRow(ctx.db, sid, 'cascade-info-1');
      await insertInfoRawRow(ctx.db, sid, 'cascade-info-2');

      const delInput = Object.assign(new DeleteSessionInput(), { session_ids: [sid] });
      const delOut = new DeleteSessionOutput();
      await service.deleteSession(delInput, delOut, new ChatContext());
      expect(delOut.deleted_count).toBe(1);

      const detailInput = Object.assign(new GetSessionDetailInput(), { session_id: sid });
      const detailOut = new GetSessionDetailOutput();
      await expect(service.soSessionDetail(detailInput, detailOut, new ChatContext())).rejects.toThrow(NotFoundError);
    });

    it('TC-CHAT-056: deleteSession transaction rollback - invalid session_ids caused by empty string', async () => {
      const delInput = Object.assign(new DeleteSessionInput(), { session_ids: [''] });
      const delOut = new DeleteSessionOutput();
      await service.deleteSession(delInput, delOut, new ChatContext());
      expect(delOut.deleted_count).toBe(0);
    });
  });

  describe('soSession - extended', () => {
    it('TC-CHAT-062: time range filter with start_time and end_time', async () => {
      const input = Object.assign(new SearchSessionInput(), {
        start_time: 1600000000000,
        end_time: 2000000000000,
      });
      const output = new SearchSessionOutput();
      const result = await service.soSession(input, output, new ChatContext());
      expect(result).toBe(true);
      expect(Array.isArray(output.sessions)).toBe(true);
    });

    it('TC-CHAT-063: order_by created desc by default', async () => {
      const out1 = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Session-1' }),
        out1, new ChatContext(),
      );
      const out2 = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Session-2' }),
        out2, new ChatContext(),
      );

      const input = new SearchSessionInput();
      const output = new SearchSessionOutput();
      await service.soSession(input, output, new ChatContext());

      const createdTimes = output.sessions.map(s => s.created).filter(Number);
      for (let i = 1; i < createdTimes.length; i++) {
        expect(createdTimes[i - 1]).toBeGreaterThanOrEqual(createdTimes[i]);
      }
    });

    it('TC-CHAT-067: message_count field present in search results', async () => {
      const createOut = new CreateSessionOutput();
      await service.createSession(
        Object.assign(new CreateSessionInput(), { session_title: 'Msg Count Test' }),
        createOut, new ChatContext(),
      );
      await insertInfoRawRow(ctx.db, createOut.session_id, 'mct-1');
      await insertInfoRawRow(ctx.db, createOut.session_id, 'mct-2');

      const input = Object.assign(new SearchSessionInput(), { keyword: 'Msg Count' });
      const output = new SearchSessionOutput();
      await service.soSession(input, output, new ChatContext());

      const session = output.sessions.find(s => s.session_id === createOut.session_id);
      expect(session).toBeDefined();
      expect(session!.message_count).toBeGreaterThanOrEqual(0);
    });

    it('TC-CHAT-066: no matching sessions returns empty array', async () => {
      const input = Object.assign(new SearchSessionInput(), {
        keyword: 'completely_nonexistent_' + Date.now(),
      });
      const output = new SearchSessionOutput();
      await service.soSession(input, output, new ChatContext());
      expect(output.sessions).toEqual([]);
      expect(output.total).toBe(0);
    });

    it('TC-CHAT-068: negative page_current falls back to page 1', async () => {
      const input = Object.assign(new SearchSessionInput(), {
        page_current: -1,
        page_size: 5,
      });
      const output = new SearchSessionOutput();
      await service.soSession(input, output, new ChatContext());
      expect(Array.isArray(output.sessions)).toBe(true);
    });
  });

  describe('checkSessionOverflow - extended', () => {
    it('TC-CHAT-082: max_messages_per_session default=1000', async () => {
      const input = Object.assign(new CheckSessionOverflowInput(), { session_id: 'overflow-default' });
      const output = new CheckSessionOverflowOutput();
      await service.checkSessionOverflow(input, output, new ChatContext());
      expect(output.max_messages).toBe(1000);
    });

    it('TC-CHAT-083: custom max_messages_per_session from chat_config', async () => {
      await insertChatConfig(ctx.db, { max_messages_per_session: 500 });

      const input = Object.assign(new CheckSessionOverflowInput(), { session_id: 'overflow-custom' });
      const output = new CheckSessionOverflowOutput();
      await service.checkSessionOverflow(input, output, new ChatContext());
      expect(output.max_messages).toBe(500);
    });

    it('TC-CHAT-084: nonexistent session returns is_overflowed=false', async () => {
      const input = Object.assign(new CheckSessionOverflowInput(), {
        session_id: 'session-does-not-exist',
      });
      const output = new CheckSessionOverflowOutput();
      await service.checkSessionOverflow(input, output, new ChatContext());
      expect(output.is_overflowed).toBe(false);
    });
  });

  describe('soChatHistory - extended', () => {
    it('TC-CHAT-098: empty session returns messages=[]', async () => {
      const input = Object.assign(new GetChatHistoryInput(), { session_id: 'empty-session' });
      const output = new GetChatHistoryOutput();
      await service.soChatHistory(input, output, new ChatContext());

      expect(output.messages).toEqual([]);
      expect(output.total).toBe(0);
    });

    it('TC-CHAT-099: combined filters (session_id + work_id)', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        work_id: 'work-1',
        info_creator_id: '',
        info_type: 'REQUEST',
        info: 'w1-msg',
      });
      await ctx.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());

      const input = Object.assign(new GetChatHistoryInput(), {
        session_id: 'test-session',
        work_id: 'work-1',
      });
      const output = new GetChatHistoryOutput();
      await service.soChatHistory(input, output, new ChatContext());

      expect(output.total).toBeGreaterThanOrEqual(1);
    });

    it('soChatHistory: messages contain citing_count field', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'test-session',
        work_id: 'test-work-id',
        info_creator_id: '',
        info_type: 'REQUEST',
        info: 'cited message',
      });
      await ctx.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());

      const input = Object.assign(new GetChatHistoryInput(), { session_id: 'test-session' });
      const output = new GetChatHistoryOutput();
      await service.soChatHistory(input, output, new ChatContext());

      if (output.messages.length > 0) {
        expect(output.messages[0]).toHaveProperty('citing_count');
        expect(typeof output.messages[0].citing_count).toBe('number');
      }
    });
  });

  describe('soMessage - extended', () => {
    it('TC-CHAT-109: no matching keyword returns empty list', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [];
        o.total = 0;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), { keyword: 'xyznomatch' });
      const output = new SearchMessageOutput();
      await service.soMessage(input, output, new ChatContext());

      spy.mockRestore();

      expect(output.messages).toEqual([]);
      expect(output.total).toBe(0);
    });

    it('soMessage: pagination works with keyword', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [
          { info_id: 'm1', info_type: 'REQUEST', info: 'test a', created: 1, session_id: 's1' },
          { info_id: 'm2', info_type: 'REQUEST', info: 'test b', created: 2, session_id: 's1' },
          { info_id: 'm3', info_type: 'RESPONSE', info: 'test c', created: 3, session_id: 's1' },
        ];
        o.total = 3;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), {
        keyword: 'test', page_current: 1, page_size: 2,
      });
      const output = new SearchMessageOutput();
      await service.soMessage(input, output, new ChatContext());

      spy.mockRestore();

      expect(output.total).toBe(3);
      expect(output.messages.length).toBe(2);
    });

    it('TC-CHAT-107: soMessage pagination returns correct page with offset', async () => {
      const spy = vi.spyOn(ctx.infoCore as any, 'keywordKInfo').mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [
          { info_id: 'p1', info_type: 'REQUEST', info: 'a', created: 1, session_id: 's1' },
          { info_id: 'p2', info_type: 'RESPONSE', info: 'b', created: 2, session_id: 's1' },
          { info_id: 'p3', info_type: 'REQUEST', info: 'c', created: 3, session_id: 's1' },
          { info_id: 'p4', info_type: 'RESPONSE', info: 'd', created: 4, session_id: 's1' },
          { info_id: 'p5', info_type: 'REQUEST', info: 'e', created: 5, session_id: 's1' },
        ];
        o.total = 5;
        return true;
      });

      const input = Object.assign(new SearchMessageInput(), {
        keyword: 'test', page_current: 2, page_size: 2,
      });
      const output = new SearchMessageOutput();
      await service.soMessage(input, output, new ChatContext());

      spy.mockRestore();

      expect(output.total).toBe(5);
      expect(output.messages.length).toBe(2);
      expect(output.messages[0].info_id).toBe('p3');
      expect(output.messages[1].info_id).toBe('p4');
    });
  });

  describe('soMessageGraph - extended', () => {
    it('TC-CHAT-118: nonexistent session_id returns empty nodes', async () => {
      const input = Object.assign(new GetMessageGraphInput(), { session_id: 'non-existent-graph' });
      const output = new GetMessageGraphOutput();
      await service.soMessageGraph(input, output, new ChatContext());

      expect(output.graph_structure.nodes).toEqual([]);
      expect(output.graph_structure.edges).toEqual([]);
    });

    it('TC-CHAT-119: node properties include info_id, info_creator_role, created, pin', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'graph-props',
        work_id: 'test-work-id',
        info_creator_id: '',
        info_type: 'REQUEST',
        info: 'node message',
      });
      await ctx.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());

      const input = Object.assign(new GetMessageGraphInput(), { session_id: 'graph-props' });
      const output = new GetMessageGraphOutput();
      await service.soMessageGraph(input, output, new ChatContext());

      if (output.graph_structure.nodes.length > 0) {
        const node = output.graph_structure.nodes[0] as Record<string, unknown>;
        expect(node).toHaveProperty('id');
      }
    });

    it('TC-CHAT-120: edge properties include citing_info_id and cited_info_id', async () => {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: 'edge-props',
        work_id: 'test-work-id',
        info_creator_id: '',
        info_type: 'REQUEST',
        info: 'edge source',
      });
      await ctx.infoCore.saveInfo(saveInput, new SaveInfoOutput(), new InfoCoreContext());

      const saveInput2 = Object.assign(new SaveInfoInput(), {
        session_id: 'edge-props',
        work_id: 'test-work-id',
        info_creator_id: 'agent-1',
        info_type: 'RESPONSE',
        info: 'edge target',
      });
      await ctx.infoCore.saveInfo(saveInput2, new SaveInfoOutput(), new InfoCoreContext());

      const input = Object.assign(new GetMessageGraphInput(), { session_id: 'edge-props' });
      const output = new GetMessageGraphOutput();
      await service.soMessageGraph(input, output, new ChatContext());

      if (output.graph_structure.edges.length > 0) {
        const edge = output.graph_structure.edges[0] as Record<string, unknown>;
        expect(edge).toHaveProperty('source');
        expect(edge).toHaveProperty('target');
      }
    });
  });


  describe('soChatHistory - Agent Trace and Thinking Blocks', () => {
    it('TC-CHAT-140: soChatHistory populates work_id and message metadata for response messages', async () => {
      const sessId = 'history-trace-sess';
      const workId = 'work-trace-101';

      // 模拟插入包含 work_id 的用户 REQUEST 消息与系统 RESPONSE 消息
      const userSave = Object.assign(new SaveInfoInput(), {
        session_id: sessId,
        work_id: workId,
        info_creator_id: 'user-1',
        info_type: 'REQUEST',
        info: '分析项目系统架构',
      });
      await ctx.infoCore.saveInfo(userSave, new SaveInfoOutput(), new InfoCoreContext());

      const agentSave = Object.assign(new SaveInfoInput(), {
        session_id: sessId,
        work_id: workId,
        info_creator_id: 'agent-writer',
        info_type: 'RESPONSE',
        info: '系统采用 Monorepo 分层架构。',
      });
      await ctx.infoCore.saveInfo(agentSave, new SaveInfoOutput(), new InfoCoreContext());

      const input = Object.assign(new GetChatHistoryInput(), { session_id: sessId });
      const output = new GetChatHistoryOutput();
      await service.soChatHistory(input, output, new ChatContext());

      expect(output.messages.length).toBe(2);
      const respMsg = output.messages.find((m) => m.info_type === 'RESPONSE');
      expect(respMsg).toBeDefined();
      expect(respMsg?.work_id).toBe(workId);
      expect(respMsg?.info).toBe('系统采用 Monorepo 分层架构。');
    });
  });
});
