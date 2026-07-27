/**
 * @fileoverview MQProvider 应用服务层。
 *
 * 依赖 RelationDBAccess（通过 IConfigStorage / executeRaw）操作关系数据库，
 * 依赖 ConfigService 管理 mq_config 配置表。
 *
 * 实现所有用例：sendMQ / consumeMQ / ackMQ / nackMQ / getQueueStats / enableMQ。
 *
 * MQ 基于 RelationDBProvider 实现，无需引入外部消息队列中间件，
 * 通过 Repository 接口封装底层消息队列操作。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import { ComponentDisabledError, ValidationError, NotFoundError } from '../../shared/errors';
import { IdGenerator } from '../../shared/id/IdGenerator';
import { Operator, Direction } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
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
  MQ_DEFAULT_CONFIGS,
} from '../domain/types';

/**
 * MQProvider 应用服务。
 *
 * MQProvider 是消息队列的唯一操作入口，上层不可直接操作消息队列。
 * 消息按优先级降序消费，同优先级按创建时间升序消费；
 * 消费失败的消息按最大重试次数自动重试。
 */
export class MQService {
  /** 运行时启用状态（内存维护，各操作快速校验） */
  private enabled = true;

  /** 是否已终态关闭（closeMQ 后不可恢复） */
  private closed = false;

  private readonly config: ConfigService;

  /**
   * @param relationDb RelationDBProvider 接入层
   */
  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, MQ_CONFIG_TABLE);
  }

  /**
   * 初始化：写入默认配置并恢复 enabled 状态。
   *
   * PRD 5.5 条：组件初始化时从 mq_config 读取 enabled 状态以恢复上次的可用状态。
   */
  async initialize(): Promise<void> {
    await this.config.initDefaults([...MQ_DEFAULT_CONFIGS]);
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  /**
   * 校验组件是否启用，未启用时抛出 ComponentDisabledError。
   * 已终态关闭时抛出 ComponentDisabledError。
   */
  private ensureEnabled(): void {
    if (this.closed) {
      throw new ComponentDisabledError('MQ');
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('MQ');
    }
  }

  /**
   * 将数据库行转换为 MessageRecord，解析 payload JSON 字符串。
   */
  private toMessageRecord(row: Record<string, unknown>): MessageRecord {
    const payloadRaw = row.payload as string;
    let payload: unknown;
    try {
      payload =
        payloadRaw !== null && payloadRaw !== undefined
          ? JSON.parse(payloadRaw)
          : null;
    } catch {
      // payload 不是合法 JSON 时保留原始字符串
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

  // -------------------------------------------------------------------------
  // 消息操作
  // -------------------------------------------------------------------------

  /**
   * 发送消息（sendMQ）。
   *
   * PRD 3.1.1 条：向消息队列发送一条消息。
   * priority 未指定时从 mq_config 读取 default_priority（默认 5）；
   * max_retries 从 mq_config 读取 default_max_retries（默认 3）。
   */
  async sendMQ(
    input: SendMQInput,
    _context: MQContext,
    output: SendMQOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    const data = input.data;
    if (!data) {
      throw new ValidationError('data 不能为空');
    }
    if (!data.queue || typeof data.queue !== 'string') {
      throw new ValidationError('queue 不能为空');
    }
    if (data.payload === undefined || data.payload === null) {
      throw new ValidationError('payload 不能为空');
    }

    // 优先级：未指定时取配置默认值
    let priority = data.priority;
    if (priority === undefined || priority === null) {
      priority = await this.config.getInt('default_priority', 5);
    }
    if (typeof priority !== 'number' || priority < 0 || priority > 10) {
      throw new ValidationError('priority 必须为 0-10 之间的整数');
    }

    // 最大重试次数：从配置读取
    const maxRetries = await this.config.getInt('default_max_retries', 3);

    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    const dataObjects: DataObject[] = [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'queue', value: data.queue },
      { field: 'payload', value: JSON.stringify(data.payload) },
      { field: 'priority', value: priority },
      { field: 'status', value: MESSAGE_STATUS_PENDING },
      { field: 'retry_count', value: 0 },
      { field: 'max_retries', value: maxRetries },
    ];

    await this.relationDb.insert(QUEUE_MESSAGE_TABLE, dataObjects);
    output.id = id;
    return true;
  }

  /**
   * 消费消息（consumeMQ）。
   *
   * PRD 3.1.2 条：从消息队列消费一条消息。
   * 按优先级降序、创建时间升序获取一条 PENDING 状态的消息，
   * 将状态更新为 PROCESSING，返回消息内容。
   */
  async consumeMQ(
    input: ConsumeMQInput,
    _context: MQContext,
    output: ConsumeMQOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    if (!input.queue || typeof input.queue !== 'string') {
      throw new ValidationError('queue 不能为空');
    }

    // 按优先级降序、创建时间升序获取一条 PENDING 消息
    const rows = await this.relationDb.select(QUEUE_MESSAGE_TABLE, {
      conditions: [
        { field: 'queue', operator: Operator.EQ, value: input.queue },
        { field: 'status', operator: Operator.EQ, value: MESSAGE_STATUS_PENDING },
      ],
      order_by: [
        { field: 'priority', direction: Direction.DESC },
        { field: 'created', direction: Direction.ASC },
      ],
      page: { current: 1, size: 1 },
    });

    if (!rows || rows.length === 0) {
      output.message = null;
      return true;
    }

    const row = rows[0];
    const now = IdGenerator.now();

    // 将状态更新为 PROCESSING（附加 status=PENDING 条件，避免并发消费）
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
      // 消息已被其他消费者获取，返回 null
      output.message = null;
      return true;
    }

    const message = this.toMessageRecord(row);
    message.status = MESSAGE_STATUS_PROCESSING;
    message.updated = now;
    output.message = message;
    return true;
  }

  /**
   * 确认消息（ackMQ）。
   *
   * PRD 3.1.3 条：确认消息已处理完成，将状态更新为 COMPLETED 并记录处理完成时间。
   */
  async ackMQ(
    input: AckMQInput,
    _context: MQContext,
    output: AckMQOutput,
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

  /**
   * 否认消息（nackMQ）。
   *
   * PRD 3.1.4 条：否认消息处理完成，消息将重新入队或进入重试。
   * 若 retry_count < max_retries，递增 retry_count 并将状态回退为 PENDING；
   * 否则将状态更新为 FAILED。
   */
  async nackMQ(
    input: NackMQInput,
    _context: MQContext,
    output: NackMQOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    if (!input.message_id || typeof input.message_id !== 'string') {
      throw new ValidationError('message_id 不能为空');
    }

    // 查询消息的 retry_count 和 max_retries
    const row = await this.relationDb.selectOne(QUEUE_MESSAGE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.message_id },
    ]);

    if (!row) {
      throw new NotFoundError('消息', input.message_id);
    }

    const retryCount = row.retry_count as number;
    let maxRetries = row.max_retries as number;

    // 若 max_retries 未指定，从配置表读取；0 是有效值，表示不允许重试
    if (maxRetries === undefined || maxRetries === null) {
      maxRetries = await this.config.getInt('default_max_retries', 3);
    }

    const now = IdGenerator.now();
    let newStatus: string;
    let newRetryCount: number;

    if (retryCount < maxRetries) {
      // 重试次数未达上限，递增 retry_count，状态回退为 PENDING
      newRetryCount = retryCount + 1;
      newStatus = MESSAGE_STATUS_PENDING;
    } else {
      // 重试次数已达上限，状态更新为 FAILED
      newRetryCount = retryCount;
      newStatus = MESSAGE_STATUS_FAILED;
    }

    await this.relationDb.update(
      QUEUE_MESSAGE_TABLE,
      [
        { field: 'status', value: newStatus },
        { field: 'retry_count', value: newRetryCount },
        { field: 'updated', value: now },
      ],
      [{ field: 'id', operator: Operator.EQ, value: input.message_id }],
    );

    output.status = newStatus;
    output.retry_count = newRetryCount;
    return true;
  }

  // -------------------------------------------------------------------------
  // 队列统计
  // -------------------------------------------------------------------------

  /**
   * 获取队列统计（getQueueStats）。
   *
   * PRD 3.2.1 条：统计 queue_message 表中各状态（PENDING/PROCESSING/COMPLETED/FAILED）
   * 的消息数量。queue 不指定则返回所有队列统计。
   */
  async getQueueStats(
    input: GetQueueStatsInput,
    _context: MQContext,
    output: GetQueueStatsOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    // 构建基础条件（可选的队列过滤）
    const baseConditions: Condition[] = [];
    if (input.queue) {
      baseConditions.push({
        field: 'queue',
        operator: Operator.EQ,
        value: input.queue,
      });
    }

    // 按状态统计
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

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /**
   * 启用/禁用 MQ 组件（enableMQ）。
   *
   * PRD 3.3.2 条：运行时控制 MQ 组件的可用状态。
   * 状态持久化到 mq_config，组件初始化时恢复，避免状态丢失。
   * 禁用时所有消息队列操作将返回失败（MQ 组件未启用）。
   */
  async enableMQ(
    input: EnableMQInput,
    _context: MQContext,
    _output: EnableMQOutput,
  ): Promise<boolean> {
    if (this.closed) {
      throw new ComponentDisabledError('MQ');
    }
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      'MQ组件是否启用（enableMQ 读写）',
    );
    return true;
  }

  /**
   * 关闭 MQ 组件（终态释放，不可恢复）。
   *
   * PRD 5.7 条：closeMQ 为系统关闭时的终态释放，不可恢复，需重新初始化组件。
   * 关闭后所有操作（含 enableMQ）将抛出 ComponentDisabledError。
   */
  async closeMQ(
    _input: CloseMQInput,
    _context: MQContext,
    _output: CloseMQOutput,
  ): Promise<boolean> {
    this.closed = true;
    this.enabled = false;
    return true;
  }
}
