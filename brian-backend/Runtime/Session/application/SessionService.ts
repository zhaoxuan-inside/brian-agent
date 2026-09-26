import type { Condition } from '@brian-agent/base';
import type { RelationDBAccess, Logger, Metrics, Report } from '@brian-agent/base';
import {
  Operator,
  newRecord,
  newPatch,
  ConfigService,
  ValidationError,
  NotFoundError,
} from '@brian-agent/base';
import {
  SessionContext,
  AddSessionInput,
  AddSessionOutput,
  AddMessageInput,
  AddMessageOutput,
  AddPartInput,
  AddPartOutput,
  UpdatePartInput,
  UpdatePartOutput,
  SoMessagesInput,
  SoMessagesOutput,
  ConfigSessionInput,
  ConfigSessionOutput,
  MessageRole,
  SessionStatus,
  PartStatus,
  MessageWithParts,
  PartRecord,
  RUNTIME_SESSION_TABLE,
  RUNTIME_MESSAGE_TABLE,
  RUNTIME_MESSAGE_PART_TABLE,
  RUNTIME_SESSION_CONFIG_TABLE,
} from '../domain/types';

const DEFAULT_MESSAGE_LIMIT = 50;

export class SessionService {
  private enabled = true;
  private defaultLimit = DEFAULT_MESSAGE_LIMIT;
  private readonly config: ConfigService;

  
  private readonly sessionSeqCache = new Map<string, number>();

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly logger?: Logger,
  ) {
    this.config = new ConfigService(relationDb, RUNTIME_SESSION_CONFIG_TABLE);
  }

  
  async initialize(): Promise<void> {
    const enabledRow = await this.config.getString('enabled', 'true');
    this.enabled = enabledRow !== 'false';
    const limitRow = await this.config.getString('default_message_limit', '');
    if (limitRow) {
      this.defaultLimit = Number(limitRow) || DEFAULT_MESSAGE_LIMIT;
    }
    this.logger?.debug?.('SessionService 初始化完成');
  }

  
  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ValidationError('Session 组件未启用，请先通过 configSession 启用');
    }
  }

  
  
  

  
  async addSession(input: AddSessionInput, output: AddSessionOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.session_key) {
      throw new ValidationError('session_key 不能为空');
    }
    const existing = await this.soSessionRowByKey(input.session_key);
    if (existing) {
      output.session_id = String(existing.id);
      output.created = false;
      return true;
    }
    const record = newRecord({
      session_key: input.session_key,
      title: input.title ?? '',
      agent_def_id: input.agent_def_id ?? '',
      status: SessionStatus.Active,
      last_seq: 0,
    });
    await this.relationDb.insert(RUNTIME_SESSION_TABLE, record);
    output.session_id = String(record[0].value);
    output.created = true;
    return true;
  }

  
  private async soSessionRowByKey(sessionKey: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_SESSION_TABLE, [
      { field: 'session_key', operator: Operator.EQ, value: sessionKey },
    ]);
  }

  
  
  

  
  async addMessage(input: AddMessageInput, output: AddMessageOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const session = await this.soSessionRowById(input.session_id);
    if (!session) {
      throw new NotFoundError(RUNTIME_SESSION_TABLE, input.session_id);
    }
    const seq = await this.nextMessageSeq(input.session_id);
    const record = newRecord({
      session_id: input.session_id,
      run_id: input.run_id ?? '',
      role: input.role,
      content: input.content,
      seq,
      token_count: input.token_count ?? 0,
    });
    await this.relationDb.insert(RUNTIME_MESSAGE_TABLE, record);
    output.msg_id = String(record[0].value);
    output.seq = seq;
    return true;
  }

  
  private async soSessionRowById(sessionId: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_SESSION_TABLE, [
      { field: 'id', operator: Operator.EQ, value: sessionId },
    ]);
  }

  
  private async nextMessageSeq(sessionId: string): Promise<number> {
    const cached = this.sessionSeqCache.get(sessionId);
    const next = cached !== undefined ? cached + 1 : await this.soNextSeqFromDb(sessionId);
    this.sessionSeqCache.set(sessionId, next);
    await this.bumpSessionLastSeq(sessionId, next);
    return next;
  }

  
  private async soNextSeqFromDb(sessionId: string): Promise<number> {
    const session = await this.soSessionRowById(sessionId);
    return Number(session?.last_seq ?? 0) + 1;
  }

  
  private async bumpSessionLastSeq(sessionId: string, seq: number): Promise<void> {
    await this.relationDb.update(RUNTIME_SESSION_TABLE, newPatch({ last_seq: seq }), [
      { field: 'id', operator: Operator.EQ, value: sessionId },
    ]);
  }

  
  
  

  
  async addPart(input: AddPartInput, output: AddPartOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const partOrder = await this.soNextPartOrder(input.msg_id);
    const record = newRecord({
      msg_id: input.msg_id,
      run_id: input.run_id ?? '',
      part_type: input.part_type,
      part_order: partOrder,
      content: input.content ?? '',
      tool_id: input.tool_id ?? '',
      input_json: input.input_json ?? '',
      output_json: '',
      status: PartStatus.Pending,
      block_type: input.block_type ?? '',
      block_meta: input.block_meta ?? '',
      token_count: 0,
      elapsed_ms: 0,
    });
    await this.relationDb.insert(RUNTIME_MESSAGE_PART_TABLE, record);
    output.part_id = String(record[0].value);
    output.part_order = partOrder;
    return true;
  }

  
  private async soNextPartOrder(messageId: string): Promise<number> {
    const rows = await this.relationDb.select(RUNTIME_MESSAGE_PART_TABLE, {
      conditions: [{ field: 'msg_id', operator: Operator.EQ, value: messageId }],
      order_by: [{ field: 'part_order', direction: 'DESC' }],
      page: { current: 1, size: 1 },
    });
    return rows.length ? Number(rows[0].part_order) + 1 : 1;
  }

  
  async updatePart(input: UpdatePartInput, _output: UpdatePartOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const part = await this.soPartRow(input.part_id);
    if (!part) {
      throw new NotFoundError(RUNTIME_MESSAGE_PART_TABLE, input.part_id);
    }
    const patch = this.preparePartPatch(input);
    if (input.content_patch !== undefined) {
      patch.content = String(part.content ?? '') + input.content_patch;
    }
    await this.relationDb.update(RUNTIME_MESSAGE_PART_TABLE, newPatch(patch), [
      { field: 'id', operator: Operator.EQ, value: input.part_id },
    ]);
    return true;
  }

  
  private preparePartPatch(input: UpdatePartInput): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (input.status !== undefined) {
      patch.status = input.status;
    }
    if (input.output_json !== undefined) {
      patch.output_json = input.output_json;
    }
    if (input.token_count !== undefined) {
      patch.token_count = input.token_count;
    }
    if (input.elapsed_ms !== undefined) {
      patch.elapsed_ms = input.elapsed_ms;
    }
    return patch;
  }

  
  private async soPartRow(partId: string): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(RUNTIME_MESSAGE_PART_TABLE, [
      { field: 'id', operator: Operator.EQ, value: partId },
    ]);
  }

  
  
  

  
  async soMessages(input: SoMessagesInput, output: SoMessagesOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const limit = input.limit ?? this.defaultLimit;
    const rows = await this.soMessageRows(input.session_id, limit, input.before_seq);
    const partsByMessage = await this.soPartsByMessageIds(rows.map((row) => String(row.id)));
    output.messages = this.assembleMessagesWithParts(rows, partsByMessage);
    return true;
  }

  
  private async soMessageRows(sessionId: string, limit: number, beforeSeq?: number,
  ): Promise<Array<Record<string, unknown>>> {
    const conditions: Condition[] = [{ field: 'session_id', operator: Operator.EQ, value: sessionId }];
    if (beforeSeq !== undefined) {
      conditions.push({ field: 'seq', operator: Operator.LT, value: beforeSeq });
    }
    return this.relationDb.select(RUNTIME_MESSAGE_TABLE, {
      conditions,
      order_by: [{ field: 'seq', direction: 'DESC' }],
      page: { current: 1, size: limit },
    });
  }

  
  private async soPartsByMessageIds(messageIds: string[]): Promise<Map<string, PartRecord[]>> {
    const partsByMessage = new Map<string, PartRecord[]>();
    if (!messageIds.length) {
      return partsByMessage;
    }
    const partRows = await this.relationDb.select(RUNTIME_MESSAGE_PART_TABLE, {
      conditions: [{ field: 'msg_id', operator: Operator.IN, value: messageIds }],
      order_by: [{ field: 'part_order', direction: 'ASC' }],
    });
    for (const partRow of partRows) {
      const record = this.toPartRecord(partRow);
      const bucket = partsByMessage.get(record.msg_id);
      if (bucket) {
        bucket.push(record);
      } else {
        partsByMessage.set(record.msg_id, [record]);
      }
    }
    return partsByMessage;
  }

  
  private assembleMessagesWithParts(
    rows: Array<Record<string, unknown>>,
    partsByMessage: Map<string, PartRecord[]>,
  ): MessageWithParts[] {
    const messages: MessageWithParts[] = [];
    for (const row of rows) {
      const messageId = String(row.id);
      messages.push({
        id: messageId,
        role: String(row.role) as MessageRole,
        content: String(row.content ?? ''),
        seq: Number(row.seq),
        run_id: String(row.run_id ?? '') || undefined,
        created: Number(row.created),
        parts: partsByMessage.get(messageId) ?? [],
      });
    }
    return messages.reverse();
  }

  
  private toPartRecord(p: Record<string, unknown>): PartRecord {
    return {
      id: String(p.id),
      msg_id: String(p.msg_id),
      run_id: String(p.run_id ?? '') || undefined,
      part_type: String(p.part_type) as PartRecord['part_type'],
      part_order: Number(p.part_order),
      content: String(p.content ?? ''),
      tool_id: String(p.tool_id ?? '') || undefined,
      input_json: String(p.input_json ?? '') || undefined,
      output_json: String(p.output_json ?? '') || undefined,
      status: String(p.status) as PartRecord['status'],
      block_type: String(p.block_type ?? '') || undefined,
      block_meta: String(p.block_meta ?? '') || undefined,
      token_count: Number(p.token_count ?? 0),
      elapsed_ms: Number(p.elapsed_ms ?? 0),
      created: Number(p.created),
      updated: Number(p.updated),
    };
  }

  
  
  

  
  async configSession(input: ConfigSessionInput, _output: ConfigSessionOutput, _context: SessionContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (input.enabled !== undefined) {
      this.enabled = input.enabled;
      await this.config.set('enabled', input.enabled ? 'true' : 'false', 'BOOLEAN');
    }
    if (input.default_message_limit !== undefined) {
      this.defaultLimit = input.default_message_limit;
      await this.config.set('default_message_limit', input.default_message_limit, 'INT');
    }
    return true;
  }
}
