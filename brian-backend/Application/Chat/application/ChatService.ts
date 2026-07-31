import {
  RelationDBAccess, InsertDBInput, InsertDBOutput,
  SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  DeleteDBInput, DeleteDBOutput,
  CountDBInput, CountDBOutput,
  DataObject, DBContext,
  IdGenerator, ValidationError, NotFoundError, Operator,
  type Logger, type Condition,
} from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import {
  SaveInfoInput, SaveInfoOutput,
  LastNInfoInput, LastNInfoOutput,
  GraphInfoInput, GraphInfoOutput,
  KeywordKInfoInput, KeywordKInfoOutput,
  PinInfoInput, PinInfoOutput,
  InfoCoreContext,
} from '@brian-agent/core';
import type { WriterAgentAccess } from '@brian-agent/agent';
import { SaveUserProfileInput, SaveUserProfileOutput, WriterAgentContext } from '@brian-agent/agent';
import type { EvolutorAgentAccess } from '@brian-agent/agent';
import { GetEvaluationInput, GetEvaluationOutput, EvolutorAgentContext } from '@brian-agent/agent';
import type { OrchestrationEntryAccess } from '@brian-agent/orchestration';
import { OrchestrationEntryContext, ReceiveWorkInput, ReceiveWorkOutput, CancelWorkInput as OrchCancelWorkInput, CancelWorkOutput as OrchCancelWorkOutput } from '@brian-agent/orchestration';
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
} from '../domain/types';

export class ChatService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly writerAgent: WriterAgentAccess,
    private readonly evolutorAgent: EvolutorAgentAccess,
    private readonly orchestrationEntry: OrchestrationEntryAccess,
    private readonly logger?: Logger,
  ) {}

  async submitWork(
    input: SubmitWorkInput,
    context: ChatContext,
    output: SubmitWorkOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }
    if (!input.msg_content || input.msg_content.trim() === '') {
      throw new ValidationError('msg_content cannot be empty');
    }

    const overflowInput = Object.assign(new CheckSessionOverflowInput(), {
      session_id: input.session_id,
    });
    const overflowOutput = new CheckSessionOverflowOutput();
    await this.checkSessionOverflow(overflowInput, context, overflowOutput);
    if (overflowOutput.is_overflowed) {
      throw new ValidationError(`Session ${input.session_id} has exceeded message limit`);
    }

    const workId = IdGenerator.generate();
    const interactId = IdGenerator.generate();

    try {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: input.session_id,
        work_id: workId,
        interact_id: interactId,
        info_creator_id: 'USER',
        info_creator_role: 'REQUEST',
        info: input.msg_content,
        parent_info_ids: input.citing_msg_ids ?? [],
      });
      await this.infoCore.saveInfo(
        saveInput,
        Object.assign(new InfoCoreContext(), { session_id: input.session_id }) as InfoCoreContext,
        new SaveInfoOutput(),
      );
    } catch (err: unknown) {
      this.logger?.error?.('submitWork: failed to save user info', {
        session_id: input.session_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let userProfile: Record<string, unknown> | undefined;
    try {
      const profileOut = Object.assign(new (await this.getWriterProfileOutputClass())(), {});
      await this.writerAgent.getUserProfile(
        Object.assign(new (await this.getWriterProfileInputClass())(), {
          session_id: input.session_id,
        }),
        new (await this.getWriterAgentContextClass())(),
        profileOut,
      );
      userProfile = profileOut.user_profile;
    } catch {
      /* best-effort */
    }

    const rwInput = Object.assign(new ReceiveWorkInput(), {
      session_id: input.session_id,
      user_query: input.msg_content,
      force_orchestration_strategy: input.force_orchestration_strategy,
      user_profile: userProfile,
    });
    const rwOutput = new ReceiveWorkOutput();
    const rwContext = Object.assign(new OrchestrationEntryContext(), {
      session_id: input.session_id,
      work_id: workId,
      interact_id: interactId,
    });

    let workOk = false;
    try {
      workOk = await this.orchestrationEntry.receiveWork(rwInput, rwContext, rwOutput);
    } catch (err: unknown) {
      this.logger?.error?.('submitWork: orchestration failed', {
        session_id: input.session_id,
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
      output.work_id = workId;
      output.interact_id = interactId;
      return false;
    }

    const finalResponse = rwOutput.final_response || '';

    try {
      const saveRespInput = Object.assign(new SaveInfoInput(), {
        session_id: input.session_id,
        work_id: workId,
        interact_id: interactId,
        info_creator_id: workId,
        info_creator_role: 'RESPONSE',
        info: finalResponse,
      });
      await this.infoCore.saveInfo(
        saveRespInput,
        Object.assign(new InfoCoreContext(), { session_id: input.session_id }) as InfoCoreContext,
        new SaveInfoOutput(),
      );
    } catch (err: unknown) {
      this.logger?.error?.('submitWork: failed to save response info', {
        session_id: input.session_id,
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const evalOut = Object.assign(new (await this.getEvalOutputClass())(), {});
      await this.evolutorAgent.getEvaluation(
        Object.assign(new (await this.getEvalInputClass())(), {
          conditions: [{ field: 'work_id', operator: 'EQ', value: workId }],
        }),
        new (await this.getEvolutorAgentContextClass())(),
        evalOut,
      );
    } catch {
      /* best-effort */
    }

    output.work_id = workId;
    output.interact_id = interactId;
    return workOk;
  }

  async openChatStream(
    input: OpenChatStreamInput,
    context: ChatContext,
    output: OpenChatStreamOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }
    if (!input.msg_content || input.msg_content.trim() === '') {
      throw new ValidationError('msg_content cannot be empty');
    }

    const sessionExists = await this.checkSessionExists(input.session_id);
    if (!sessionExists) {
      throw new NotFoundError('Session', input.session_id);
    }

    const overflowInput = Object.assign(new CheckSessionOverflowInput(), {
      session_id: input.session_id,
    });
    const overflowOutput = new CheckSessionOverflowOutput();
    await this.checkSessionOverflow(overflowInput, context, overflowOutput);
    if (overflowOutput.is_overflowed) {
      const errEvent: SSEEvent = {
        event: 'error',
        data: { error_message: `Session ${input.session_id} has exceeded message limit`, error_code: 'OVERFLOW' },
      };
      output.events = [errEvent];
      return true;
    }

    const events: SSEEvent[] = [];
    const emit = (event: string, data: Record<string, unknown>) => {
      events.push({ event, data });
    };

    emit('connected', { session_id: input.session_id });

    const workId = IdGenerator.generate();
    const interactId = IdGenerator.generate();

    try {
      const saveInput = Object.assign(new SaveInfoInput(), {
        session_id: input.session_id,
        work_id: workId,
        interact_id: interactId,
        info_creator_id: 'USER',
        info_creator_role: 'REQUEST',
        info: input.msg_content,
        parent_info_ids: input.citing_msg_ids ?? [],
      });
      await this.infoCore.saveInfo(
        saveInput,
        Object.assign(new InfoCoreContext(), { session_id: input.session_id }) as InfoCoreContext,
        new SaveInfoOutput(),
      );
    } catch (err: unknown) {
      this.logger?.error?.('openChatStream: failed to save user info', {
        session_id: input.session_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    let userProfile: Record<string, unknown> | undefined;
    try {
      const profileOut = Object.assign(new (await this.getWriterProfileOutputClass())(), {});
      await this.writerAgent.getUserProfile(
        Object.assign(new (await this.getWriterProfileInputClass())(), {
          session_id: input.session_id,
        }),
        new (await this.getWriterAgentContextClass())(),
        profileOut,
      );
      userProfile = profileOut.user_profile;
    } catch {
      /* best-effort */
    }

    emit('loading', { work_id: workId });

    const rwInput = Object.assign(new ReceiveWorkInput(), {
      session_id: input.session_id,
      user_query: input.msg_content,
      force_orchestration_strategy: input.force_orchestration_strategy,
      user_profile: userProfile,
    });
    const rwOutput = new ReceiveWorkOutput();
    const rwContext = Object.assign(new OrchestrationEntryContext(), {
      session_id: input.session_id,
      work_id: workId,
      interact_id: interactId,
    });

    const startedAt = Date.now();
    let tokenUsage: Record<string, unknown> = {};
    try {
      await this.orchestrationEntry.receiveWork(rwInput, rwContext, rwOutput);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger?.error?.('openChatStream: orchestration failed', {
        session_id: input.session_id,
        work_id: workId,
        error: errorMsg,
      });
      emit('error', { work_id: workId, error_message: errorMsg, error_code: 'ORCHESTRATION_FAILED' });
      output.events = events;
      return true;
    }

    const elapsedMs = Date.now() - startedAt;
    const finalResponse = rwOutput.final_response || '';

    for (let i = 0; i < finalResponse.length; ) {
      const chunkSize = Math.floor(Math.random() * 4) + 2;
      emit('text', { work_id: workId, chunk: finalResponse.substring(i, i + chunkSize) });
      i += chunkSize;
    }

    try {
      const saveRespInput = Object.assign(new SaveInfoInput(), {
        session_id: input.session_id,
        work_id: workId,
        interact_id: interactId,
        info_creator_id: workId,
        info_creator_role: 'RESPONSE',
        info: finalResponse,
      });
      await this.infoCore.saveInfo(
        saveRespInput,
        Object.assign(new InfoCoreContext(), { session_id: input.session_id }) as InfoCoreContext,
        new SaveInfoOutput(),
      );
    } catch (err: unknown) {
      this.logger?.error?.('openChatStream: failed to save response info', {
        session_id: input.session_id,
        work_id: workId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    emit('done', { work_id: workId, interact_id: interactId, final_response: finalResponse, elapsed_ms: elapsedMs, token_usage: tokenUsage });

    output.events = events;
    return true;
  }

  async createSession(
    input: CreateSessionInput,
    _context: ChatContext,
    output: CreateSessionOutput,
  ): Promise<boolean> {
    const sessionId = IdGenerator.generate();
    const now = IdGenerator.now();
    const title = input.session_title || '新会话';

    const data: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'session_id', value: sessionId },
      { field: 'session_title', value: title },
    ];

    const insInput = Object.assign(new InsertDBInput(), {
      table: 'chat_session',
      data,
    });
    await this.relationDb.insertDB(insInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

    output.session_id = sessionId;
    output.session_title = title;
    output.created = now;
    return true;
  }

  async deleteSession(
    input: DeleteSessionInput,
    _context: ChatContext,
    output: DeleteSessionOutput,
  ): Promise<boolean> {
    if (!input.session_ids || input.session_ids.length === 0) {
      throw new ValidationError('session_ids must be a non-empty array');
    }

    let deletedCount = 0;

    for (const sessionId of input.session_ids) {
      const delSessionInput = Object.assign(new DeleteDBInput(), {
        table: 'chat_session',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: sessionId },
        ] as Condition[],
      });
      const delSessionOutput = Object.assign(new DeleteDBOutput(), {});
      await this.relationDb.deleteDB(delSessionInput, new DBContext(), delSessionOutput);
      deletedCount += delSessionOutput.affected_rows;

      try {
        const delInfoInput = Object.assign(new DeleteDBInput(), {
          table: 'info_raw',
          conditions: [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ] as Condition[],
        });
        await this.relationDb.deleteDB(delInfoInput, new DBContext(), Object.assign(new DeleteDBOutput(), {}));
      } catch (err: unknown) {
        this.logger?.error?.('deleteSession: failed to delete info_raw', {
          session_id: sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      try {
        const delGraphInput = Object.assign(new DeleteDBInput(), {
          table: 'info_graph',
          conditions: [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ] as Condition[],
        });
        await this.relationDb.deleteDB(delGraphInput, new DBContext(), Object.assign(new DeleteDBOutput(), {}));
      } catch (err: unknown) {
        this.logger?.error?.('deleteSession: failed to delete info_graph', {
          session_id: sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    output.deleted_count = deletedCount;
    return true;
  }

  async searchSession(
    input: SearchSessionInput,
    _context: ChatContext,
    output: SearchSessionOutput,
  ): Promise<boolean> {
    const conditions: Condition[] = [];

    if (input.keyword) {
      conditions.push({
        field: 'session_title',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
      });
    }

    if (input.start_time !== undefined) {
      conditions.push({
        field: 'created',
        operator: Operator.GE,
        value: input.start_time,
      });
    }

    if (input.end_time !== undefined) {
      conditions.push({
        field: 'created',
        operator: Operator.LE,
        value: input.end_time,
      });
    }

    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'chat_session',
        conditions,
        order_by: input.order_by ? [
          { field: input.order_by.replace(/^-/, ''), direction: input.order_by.startsWith('-') ? 'DESC' : 'ASC' },
        ] : [{ field: 'updated', direction: 'DESC' }],
        page: { current: pageCurrent, size: pageSize },
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, new DBContext(), selOutput);

    const sessions: SearchSessionOutput['sessions'] = [];

    for (const row of selOutput.rows) {
      const sessionId = row.session_id as string;

      let messageCount = 0;
      let lastMessageTime = 0;

      try {
        const cntInput = Object.assign(new CountDBInput(), {
          table: 'info_raw',
          conditions: [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ] as Condition[],
        });
        const cntOutput = Object.assign(new CountDBOutput(), {});
        await this.relationDb.countDB(cntInput, new DBContext(), cntOutput);
        messageCount = cntOutput.count;
      } catch {
        /* degrade gracefully */
      }

      try {
        const lastSelInput = Object.assign(new SelectDBInput(), {
          query_param: {
            table: 'info_raw',
            conditions: [
              { field: 'session_id', operator: Operator.EQ, value: sessionId },
            ] as Condition[],
            order_by: [{ field: 'created', direction: 'DESC' }],
            page: { current: 1, size: 1 },
          },
        });
        const lastSelOutput = Object.assign(new SelectDBOutput(), {});
        await this.relationDb.selectDB(lastSelInput, new DBContext(), lastSelOutput);
        if (lastSelOutput.rows.length > 0) {
          lastMessageTime = lastSelOutput.rows[0].created as number;
        }
      } catch {
        /* degrade gracefully */
      }

      sessions.push({
        session_id: sessionId,
        session_title: (row.session_title as string) ?? '',
        message_count: messageCount,
        last_message_time: lastMessageTime,
        created: (row.created as number) ?? 0,
        updated: (row.updated as number) ?? 0,
      });
    }

    let total = 0;
    try {
      const totalInput = Object.assign(new CountDBInput(), {
        table: 'chat_session',
        conditions,
      });
      const totalOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(totalInput, new DBContext(), totalOutput);
      total = totalOutput.count;
    } catch {
      /* degrade gracefully */
    }

    output.sessions = sessions;
    output.total = total;
    return true;
  }

  async getSessionDetail(
    input: GetSessionDetailInput,
    _context: ChatContext,
    output: GetSessionDetailOutput,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'chat_session',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    if (!selOutput.row) {
      throw new NotFoundError('Session', input.session_id);
    }

    let messageCount = 0;
    try {
      const cntInput = Object.assign(new CountDBInput(), {
        table: 'info_raw',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ] as Condition[],
      });
      const cntOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(cntInput, new DBContext(), cntOutput);
      messageCount = cntOutput.count;
    } catch {
      /* degrade gracefully */
    }

    output.session = {
      ...selOutput.row,
      message_count: messageCount,
    };
    return true;
  }

  async updateSessionTitle(
    input: UpdateSessionTitleInput,
    _context: ChatContext,
    output: UpdateSessionTitleOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }
    if (!input.session_title || input.session_title.trim() === '') {
      throw new ValidationError('session_title cannot be empty');
    }

    const data: DataObject[] = [
      { field: 'session_title', value: input.session_title.trim() },
      { field: 'updated', value: IdGenerator.now() },
    ];

    const updInput = Object.assign(new UpdateDBInput(), {
      table: 'chat_session',
      data,
      conditions: [
        { field: 'session_id', operator: Operator.EQ, value: input.session_id },
      ] as Condition[],
    });
    const updOutput = Object.assign(new UpdateDBOutput(), {});
    await this.relationDb.updateDB(updInput, new DBContext(), updOutput);

    if (updOutput.affected_rows === 0) {
      throw new NotFoundError('Session', input.session_id);
    }

    return true;
  }

  async checkSessionOverflow(
    input: CheckSessionOverflowInput,
    _context: ChatContext,
    output: CheckSessionOverflowOutput,
  ): Promise<boolean> {
    let maxMessages = 1000;
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: { table: 'chat_config' },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
      if (selOutput.row) {
        maxMessages = (selOutput.row.max_messages_per_session as number) ?? 1000;
      }
    } catch {
      /* use default */
    }

    let messageCount = 0;
    try {
      const cntInput = Object.assign(new CountDBInput(), {
        table: 'info_raw',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: input.session_id },
        ] as Condition[],
      });
      const cntOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(cntInput, new DBContext(), cntOutput);
      messageCount = cntOutput.count;
    } catch {
      /* degrade gracefully */
    }

    output.is_overflowed = messageCount >= maxMessages;
    output.message_count = messageCount;
    output.max_messages = maxMessages;
    return true;
  }

  async getChatHistory(
    input: GetChatHistoryInput,
    _context: ChatContext,
    output: GetChatHistoryOutput,
  ): Promise<boolean> {
    let lastN = input.lastN;
    if (lastN === undefined) {
      lastN = 50;
      try {
        const selInput = Object.assign(new SelectOneDBInput(), {
          query_param: { table: 'chat_config' },
        });
        const selOutput = Object.assign(new SelectOneDBOutput(), {});
        await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
        if (selOutput.row) {
          lastN = (selOutput.row.default_history_lastN as number) ?? 50;
        }
      } catch {
        /* use default */
      }
    }

    const lastNInput = Object.assign(new LastNInfoInput(), {
      session_id: input.session_id,
      work_id: input.work_id,
      interact_id: input.interact_id,
      lastN,
    });
    const lastNOutput = new LastNInfoOutput();
    await this.infoCore.lastNInfo(
      lastNInput,
      new InfoCoreContext(),
      lastNOutput,
    );

    const messages: GetChatHistoryOutput['messages'] = [];
    const allRows = lastNOutput.list;

    let start = 0;
    let end = allRows.length;

    if (input.page_current !== undefined && input.page_size !== undefined) {
      start = (input.page_current - 1) * input.page_size;
      end = start + input.page_size;
      if (start < 0) start = 0;
      if (end > allRows.length) end = allRows.length;
    }

    const pageRows = allRows.slice(start, end);

    for (const row of pageRows) {
      let citingCount = 0;
      try {
        const cntInput = Object.assign(new CountDBInput(), {
          table: 'info_graph',
          conditions: [
            { field: 'cited_info_id', operator: Operator.EQ, value: row.info_id },
          ] as Condition[],
        });
        const cntOutput = Object.assign(new CountDBOutput(), {});
        await this.relationDb.countDB(cntInput, new DBContext(), cntOutput);
        citingCount = cntOutput.count;
      } catch {
        /* degrade gracefully */
      }

      messages.push({
        info_id: row.info_id,
        info_creator_role: row.info_creator_role,
        info: row.info,
        created: row.created,
        pin: row.pin === 1,
        citing_count: citingCount,
      });
    }

    output.messages = messages;
    output.total = allRows.length;
    return true;
  }

  async searchMessage(
    input: SearchMessageInput,
    _context: ChatContext,
    output: SearchMessageOutput,
  ): Promise<boolean> {
    if (!input.keyword || input.keyword.trim() === '') {
      throw new ValidationError('keyword cannot be empty');
    }

    const kwInput = Object.assign(new KeywordKInfoInput(), {
      info: input.keyword,
    });
    const kwOutput = new KeywordKInfoOutput();
    await this.infoCore.keywordKInfo(
      kwInput,
      new InfoCoreContext(),
      kwOutput,
    );

    let filteredList = kwOutput.list;
    if (input.session_id) {
      filteredList = filteredList.filter((r) => r.session_id === input.session_id);
    }

    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;
    const start = (pageCurrent - 1) * pageSize;
    const pageList = filteredList.slice(start, start + pageSize);

    const messages: SearchMessageOutput['messages'] = [];

    for (const row of pageList) {
      let summary = '';
      try {
        const selInput = Object.assign(new SelectOneDBInput(), {
          query_param: {
            table: 'info_summary',
            conditions: [
              { field: 'info_id', operator: Operator.EQ, value: row.info_id },
            ] as Condition[],
          },
        });
        const selOutput = Object.assign(new SelectOneDBOutput(), {});
        await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
        if (selOutput.row) {
          summary = (selOutput.row.summary as string) ?? '';
        }
      } catch {
        /* degrade gracefully */
      }

      messages.push({
        info_id: row.info_id,
        info_creator_role: row.info_creator_role,
        info: row.info,
        summary,
        created: row.created,
        session_id: row.session_id,
      });
    }

    output.messages = messages;
    output.total = filteredList.length;
    return true;
  }

  async pinMessage(
    input: PinMessageInput,
    _context: ChatContext,
    output: PinMessageOutput,
  ): Promise<boolean> {
    if (!input.info_id) {
      throw new ValidationError('info_id is required');
    }

    let currentPin = false;
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'info_raw',
          conditions: [
            { field: 'info_id', operator: Operator.EQ, value: input.info_id },
          ] as Condition[],
        },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
      if (selOutput.row) {
        currentPin = (selOutput.row.pin as number) === 1;
      }
    } catch {
      /* degrade gracefully */
    }

    try {
      const pinInput = Object.assign(new PinInfoInput(), {
        info_id: input.info_id,
      });
      await this.infoCore.pinInfo(
        pinInput,
        new InfoCoreContext(),
        new PinInfoOutput(),
      );
      output.pin = !currentPin;
    } catch (err: unknown) {
      this.logger?.error?.('pinMessage: failed to pin info', {
        info_id: input.info_id,
        error: err instanceof Error ? err.message : String(err),
      });
      output.pin = currentPin;
      return false;
    }

    return true;
  }

  async getMessageGraph(
    input: GetMessageGraphInput,
    _context: ChatContext,
    output: GetMessageGraphOutput,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }

    const graphInput = Object.assign(new GraphInfoInput(), {
      session_id: input.session_id,
    });
    const graphOutput = new GraphInfoOutput();
    await this.infoCore.graphInfo(
      graphInput,
      new InfoCoreContext(),
      graphOutput,
    );

    output.graph_structure = {
      nodes: graphOutput.graph.nodes,
      edges: graphOutput.graph.edges,
    };

    return true;
  }

  async cancelWork(
    input: CancelWorkInput,
    _context: ChatContext,
    output: CancelWorkOutput,
  ): Promise<boolean> {
    if (!input.work_id) {
      throw new ValidationError('work_id is required');
    }

    const cancelInput = Object.assign(new OrchCancelWorkInput(), {
      work_id: input.work_id,
      reason: input.reason,
    });
    const cancelOutput = new OrchCancelWorkOutput();
    const cancelContext = new OrchestrationEntryContext();

    try {
      const ok = await this.orchestrationEntry.cancelWork(cancelInput, cancelContext, cancelOutput);
      output.cancelled = cancelOutput.cancelled;
      return ok;
    } catch (err: unknown) {
      this.logger?.error?.('cancelWork: failed to cancel work', {
        work_id: input.work_id,
        error: err instanceof Error ? err.message : String(err),
      });
      output.cancelled = false;
      return false;
    }
  }

  async configChat(
    input: ConfigChatInput,
    _context: ChatContext,
    output: ConfigChatOutput,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'chat_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    const current = (selOutput.row ?? {}) as Record<string, unknown>;
    const id = (current.id as string) || 'chat_config_default';
    const data: DataObject[] = [
      { field: 'id', value: id },
      { field: 'updated', value: IdGenerator.now() },
    ];

    if (input.max_messages_per_session !== undefined) {
      if (input.max_messages_per_session <= 0) {
        throw new ValidationError('max_messages_per_session must be positive');
      }
      data.push({ field: 'max_messages_per_session', value: input.max_messages_per_session });
    }

    if (input.sse_heartbeat_interval_ms !== undefined) {
      if (input.sse_heartbeat_interval_ms <= 0) {
        throw new ValidationError('sse_heartbeat_interval_ms must be positive');
      }
      data.push({ field: 'sse_heartbeat_interval_ms', value: input.sse_heartbeat_interval_ms });
    }

    if (input.default_history_lastN !== undefined) {
      if (input.default_history_lastN <= 0) {
        throw new ValidationError('default_history_lastN must be positive');
      }
      data.push({ field: 'default_history_lastN', value: input.default_history_lastN });
    }

    if (data.length > 2) {
      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'chat_config',
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
    }

    const outConfig: Record<string, unknown> = {};
    for (const key of Object.keys(current)) {
      outConfig[key] = current[key];
    }
    if (input.max_messages_per_session !== undefined) {
      outConfig.max_messages_per_session = input.max_messages_per_session;
    }
    if (input.sse_heartbeat_interval_ms !== undefined) {
      outConfig.sse_heartbeat_interval_ms = input.sse_heartbeat_interval_ms;
    }
    if (input.default_history_lastN !== undefined) {
      outConfig.default_history_lastN = input.default_history_lastN;
    }

    output.config = outConfig;
    return true;
  }

  private async checkSessionExists(sessionId: string): Promise<boolean> {
    try {
      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'chat_session',
          conditions: [
            { field: 'session_id', operator: Operator.EQ, value: sessionId },
          ] as Condition[],
        },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
      return selOutput.row != null;
    } catch {
      return false;
    }
  }

  private async getWriterProfileOutputClass(): Promise<new () => any> {
    const { GetUserProfileOutput } = await import('@brian-agent/agent');
    return GetUserProfileOutput;
  }

  private async getWriterProfileInputClass(): Promise<new () => any> {
    const { GetUserProfileInput } = await import('@brian-agent/agent');
    return GetUserProfileInput;
  }

  private async getWriterAgentContextClass(): Promise<new () => any> {
    const { WriterAgentContext } = await import('@brian-agent/agent');
    return WriterAgentContext;
  }

  private async getEvalOutputClass(): Promise<new () => any> {
    const { GetEvaluationOutput } = await import('@brian-agent/agent');
    return GetEvaluationOutput;
  }

  private async getEvalInputClass(): Promise<new () => any> {
    const { GetEvaluationInput } = await import('@brian-agent/agent');
    return GetEvaluationInput;
  }

  private async getEvolutorAgentContextClass(): Promise<new () => any> {
    const { EvolutorAgentContext } = await import('@brian-agent/agent');
    return EvolutorAgentContext;
  }
}
