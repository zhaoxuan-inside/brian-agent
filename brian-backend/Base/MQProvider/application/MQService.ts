import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import { ComponentDisabledError, ValidationError, NotFoundError } from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator } from '../../shared/query';
import type { Condition } from '../../shared/query';
import { newRecord } from '../../shared/query';
import { validateSendMessage, validatePriority } from '../domain/services/MQDomainService';
import {
  MQContext,
  MessageRecord,
  QueueStats,
  MESSAGE_STATUS_PENDING,
  MESSAGE_STATUS_PROCESSING,
  MESSAGE_STATUS_COMPLETED,
  MESSAGE_STATUS_FAILED,
  SendMQInput,
  SendMQOutput,
  ConsumeMQInput,
  ConsumeMQOutput,
  AckMQInput,
  AckMQOutput,
  NackMQInput,
  NackMQOutput,
  GetQueueStatsInput,
  GetQueueStatsOutput,
  EnableMQInput,
  EnableMQOutput,
  CloseMQInput,
  CloseMQOutput,
  QUEUE_MESSAGE_TABLE,
  MQ_CONFIG_TABLE,
} from '../domain/types';

export class MQService {
  
  private enabled = true;

  
  private closed = false;

  private readonly config: ConfigService;

  

  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, MQ_CONFIG_TABLE);
  }

  

  async initialize(): Promise<void> {
    await this.config.initDefaults([
      { config_key: 'enabled', config_value: 'true', value_type: 'BOOLEAN', description: 'MQ 组件是否启用（enableMQ 读写）' },
      { config_key: 'message_ttl', config_value: '86400', value_type: 'INT', description: '消息默认保留时间（秒，默认1天）' },
      { config_key: 'default_max_retries', config_value: '3', value_type: 'INT', description: '默认最大重试次数' },
      { config_key: 'default_priority', config_value: '5', value_type: 'INT', description: '默认消息优先级（0-10）' },
      { config_key: 'retry_base_delay', config_value: '1', value_type: 'INT', description: '重试基础延迟（秒），第 N 次重试延迟 = base × 2^(N-1)' },
      { config_key: 'processing_timeout', config_value: '300', value_type: 'INT', description: '处理超时（秒）' },
    ]);
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  

  async enableMQ(input: EnableMQInput, _output: EnableMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (this.closed) {
      throw new ComponentDisabledError('MQ');
    }
    this.enabled = input.enable;
    await this.config.set('enabled', input.enable, 'BOOLEAN');
    return true;
  }

  

  async closeMQ(_input: CloseMQInput, _output: CloseMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.closed = true;
    this.enabled = false;
    await this.config.set('enabled', false, 'BOOLEAN');
    return true;
  }

  

  private ensureEnabled(): void {
    if (this.closed) {
      throw new ComponentDisabledError('MQ');
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('MQ');
    }
  }

  

  private toMessageRecord(row: Record<string, unknown>): MessageRecord {
    const payloadRaw = row.payload as string;
    let payload: unknown;
    try {
      payload =
        payloadRaw !== null && payloadRaw !== undefined
          ? JSON.parse(payloadRaw)
          : null;
    } catch {
      
      payload = payloadRaw;
    }
    return {
      id: row.id as string,
      created: row.created as number,
      updated: row.updated as number,
      queue: row.queue as string,
      payload,
      priority: row.priority as number,
      status: row.status as string,
      retry_count: row.retry_count as number,
      max_retries: row.max_retries as number,
      processed_at:
        row.processed_at !== null && row.processed_at !== undefined
          ? (row.processed_at as number)
          : null,
    };
  }

  
  
  

  

  async sendMQ(input: SendMQInput, output: SendMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    validateSendMessage(data);

    const priority = await this.resolvePriority(data!.priority);
    const maxRetries = await this.config.getInt('default_max_retries', 3);
    const id = IdGenerator.generate();

    await this.relationDb.insert(
      QUEUE_MESSAGE_TABLE,
      newRecord({
        id,
        queue: data!.queue,
        payload: JSON.stringify(data!.payload),
        priority,
        status: MESSAGE_STATUS_PENDING,
        retry_count: 0,
        max_retries: maxRetries,
      }),
    );
    output.id = id;
    return true;
  }

  

  private async resolvePriority(priority: number | null | undefined): Promise<number> {
    const resolved = priority ?? await this.config.getInt('default_priority', 5);
    validatePriority(resolved);
    return resolved;
  }

  

  async consumeMQ(input: ConsumeMQInput, output: ConsumeMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    if (!input.queue || typeof input.queue !== 'string') {
      throw new ValidationError('queue 不能为空');
    }

    const now = IdGenerator.now();

    
    await this.recoverStuckMessages(input.queue);

    
    const rows = await this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT * FROM "${QUEUE_MESSAGE_TABLE}" WHERE "queue" = ? AND "status" = ? AND ("next_retry_at" IS NULL OR "next_retry_at" <= ?) ORDER BY "priority" DESC, "created" ASC LIMIT 1`,
      [input.queue, MESSAGE_STATUS_PENDING, now],
    );

    if (!rows || rows.length === 0) {
      output.message = null;
      return true;
    }

    const row = rows[0];

    
    const affected = await this.relationDb.update(
      QUEUE_MESSAGE_TABLE,
      [
        { field: 'status', value: MESSAGE_STATUS_PROCESSING },
        { field: 'updated', value: now },
      ],
      [
        { field: 'id', operator: Operator.EQ, value: row.id },
        { field: 'status', operator: Operator.EQ, value: MESSAGE_STATUS_PENDING },
      ],
    );

    if (affected === 0) {
      
      output.message = null;
      return true;
    }

    const message = this.toMessageRecord(row);
    message.status = MESSAGE_STATUS_PROCESSING;
    message.updated = now;
    output.message = message;
    return true;
  }

  

  async ackMQ(input: AckMQInput, output: AckMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    if (!input.message_id || typeof input.message_id !== 'string') {
      throw new ValidationError('message_id 不能为空');
    }

    const now = IdGenerator.now();
    const affected = await this.relationDb.update(
      QUEUE_MESSAGE_TABLE,
      [
        { field: 'status', value: MESSAGE_STATUS_COMPLETED },
        { field: 'processed_at', value: now },
        { field: 'updated', value: now },
      ],
      [{ field: 'id', operator: Operator.EQ, value: input.message_id }],
    );

    if (affected === 0) {
      throw new NotFoundError('消息', input.message_id);
    }

    output.affected_rows = affected;
    return true;
  }

  

  async nackMQ(input: NackMQInput, output: NackMQOutput, _context: MQContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    if (!input.message_id || typeof input.message_id !== 'string') {
      throw new ValidationError('message_id 不能为空');
    }

    
    const row = await this.relationDb.selectOne(QUEUE_MESSAGE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.message_id },
    ]);

    if (!row) {
      throw new NotFoundError('消息', input.message_id);
    }

    const retryCount = row.retry_count as number;
    let maxRetries = row.max_retries as number;

    
    if (maxRetries === undefined || maxRetries === null) {
      maxRetries = await this.config.getInt('default_max_retries', 3);
    }

    const now = IdGenerator.now();
    let newStatus: string;
    let newRetryCount: number;

    if (retryCount < maxRetries) {
      newRetryCount = retryCount + 1;
      newStatus = MESSAGE_STATUS_PENDING;

      
      const baseDelay = await this.config.getInt('retry_base_delay', 1);
      const delaySeconds = baseDelay * Math.pow(2, retryCount);
      const nextRetryAt = now + delaySeconds * 1000;

      await this.relationDb.update(
        QUEUE_MESSAGE_TABLE,
        [
          { field: 'status', value: newStatus },
          { field: 'retry_count', value: newRetryCount },
          { field: 'next_retry_at', value: nextRetryAt },
          { field: 'updated', value: now },
        ],
        [{ field: 'id', operator: Operator.EQ, value: input.message_id }],
      );
      output.status = newStatus;
      output.retry_count = newRetryCount;
      return true;
    }

    
    newRetryCount = retryCount;
    newStatus = MESSAGE_STATUS_FAILED;
    await this.relationDb.update(
      QUEUE_MESSAGE_TABLE,
      [
        { field: 'status', value: newStatus },
        { field: 'retry_count', value: newRetryCount },
        { field: 'next_retry_at', value: null },
        { field: 'updated', value: now },
      ],
      [{ field: 'id', operator: Operator.EQ, value: input.message_id }],
    );
    output.status = newStatus;
    output.retry_count = newRetryCount;
    return true;
  }

  
  
  

  

  async soQueueStats(input: GetQueueStatsInput, output: GetQueueStatsOutput, _context: MQContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    
    const baseConditions: Condition[] = [];
    if (input.queue) {
      baseConditions.push({
        field: 'queue',
        operator: Operator.EQ,
        value: input.queue,
      });
    }

    
    const pending = await this.relationDb.count(QUEUE_MESSAGE_TABLE, [
      ...baseConditions,
      { field: 'status', operator: Operator.EQ, value: MESSAGE_STATUS_PENDING },
    ]);
    const processing = await this.relationDb.count(QUEUE_MESSAGE_TABLE, [
      ...baseConditions,
      {
        field: 'status',
        operator: Operator.EQ,
        value: MESSAGE_STATUS_PROCESSING,
      },
    ]);
    const completed = await this.relationDb.count(QUEUE_MESSAGE_TABLE, [
      ...baseConditions,
      {
        field: 'status',
        operator: Operator.EQ,
        value: MESSAGE_STATUS_COMPLETED,
      },
    ]);
    const failed = await this.relationDb.count(QUEUE_MESSAGE_TABLE, [
      ...baseConditions,
      { field: 'status', operator: Operator.EQ, value: MESSAGE_STATUS_FAILED },
    ]);

    const stats: QueueStats = {
      pending,
      processing,
      completed,
      failed,
      total: pending + processing + completed + failed,
    };
    output.stats = stats;
    return true;
  }

  
  
  

  

  async cleanupExpiredMessages(): Promise<number> {
    if (this.closed) return 0;
    const ttl = await this.config.getInt('message_ttl', 86400);
    const cutoff = IdGenerator.now() - ttl * 1000;
    try {
      const countRow = this.relationDb.queryRaw<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM "${QUEUE_MESSAGE_TABLE}" WHERE ("status" = ? OR "status" = ?) AND "updated" < ?`,
        [MESSAGE_STATUS_COMPLETED, MESSAGE_STATUS_FAILED, cutoff],
      );
      const cnt = countRow?.[0]?.cnt ?? 0;
      if (cnt > 0) {
        this.relationDb.executeRaw(
          `DELETE FROM "${QUEUE_MESSAGE_TABLE}" WHERE ("status" = ? OR "status" = ?) AND "updated" < ?`,
          [MESSAGE_STATUS_COMPLETED, MESSAGE_STATUS_FAILED, cutoff],
        );
      }
      return cnt;
    } catch {
      return 0;
    }
  }

  

  async recoverStuckMessages(queue?: string): Promise<number> {
    if (this.closed) return 0;
    const timeout = await this.config.getInt('processing_timeout', 300);
    const cutoff = IdGenerator.now() - timeout * 1000;
    try {
      const conditions = `"status" = ? AND "updated" < ?${queue ? ' AND "queue" = ?' : ''}`;
      const params: unknown[] = [MESSAGE_STATUS_PROCESSING, cutoff];
      if (queue) params.push(queue);
      const countRow = this.relationDb.queryRaw<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM "${QUEUE_MESSAGE_TABLE}" WHERE ${conditions}`,
        params,
      );
      const cnt = countRow?.[0]?.cnt ?? 0;
      if (cnt > 0) {
        this.relationDb.executeRaw(
          `UPDATE "${QUEUE_MESSAGE_TABLE}" SET "status" = ?, "next_retry_at" = NULL, "updated" = ? WHERE ${conditions}`,
          [MESSAGE_STATUS_PENDING, IdGenerator.now(), ...params],
        );
      }
      return cnt;
    } catch {
      return 0;
    }
  }

  

  async replayMQ(messageId: string): Promise<boolean> {
    this.ensureEnabled();
    if (!messageId) throw new ValidationError('message_id 不能为空');

    const row = await this.relationDb.selectOne(QUEUE_MESSAGE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: messageId },
    ]);
    if (!row) throw new NotFoundError('消息', messageId);
    if (row.status !== MESSAGE_STATUS_FAILED) {
      throw new ValidationError('只能重新入队失败状态的消息');
    }

    await this.relationDb.update(
      QUEUE_MESSAGE_TABLE,
      [
        { field: 'status', value: MESSAGE_STATUS_PENDING },
        { field: 'retry_count', value: 0 },
        { field: 'next_retry_at', value: null },
        { field: 'updated', value: IdGenerator.now() },
      ],
      [{ field: 'id', operator: Operator.EQ, value: messageId }],
    );

    return true;
  }
}
