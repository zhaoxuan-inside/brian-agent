/**
 * @fileoverview MQProvider 领域层类型定义。
 *
 * 依据 `MQProvider-PRD.md` 定义 MQContext、MessageData 及各功能的 Input / Output 类型。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '../../shared/base';

/**
 * MQ 上下文（MQContext）。
 *
 * 继承 Context 基类，消息队列相关操作的执行上下文。
 */
export class MQContext extends Context {}

/**
 * 消息数据对象（MessageData）。
 *
 * 用于 sendMQ 时描述消息内容。id / created / updated 等系统字段由 Provider 维护，
 * 不通过 Data 对象传入。
 */
export interface MessageData {
  /** 队列名称 */
  queue: string;
  /** 消息内容（JSON 格式，可为任意 JSON 可序列化值） */
  payload: unknown;
  /** 消息优先级（0-10，数值越大优先级越高），未指定时取配置 default_priority（默认 5） */
  priority?: number;
}

/**
 * queue_message 表记录（含系统字段）。
 *
 * payload 字段在数据库中以 JSON 字符串存储，读取时已解析为原始值。
 */
export interface MessageRecord {
  /** 数据唯一标识（UUID） */
  id: string;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
  /** 队列名称 */
  queue: string;
  /** 消息内容（已从 JSON 字符串解析） */
  payload: unknown;
  /** 优先级（0-10） */
  priority: number;
  /** 消息状态：PENDING / PROCESSING / COMPLETED / FAILED */
  status: string;
  /** 重试次数 */
  retry_count: number;
  /** 最大重试次数 */
  max_retries: number;
  /** 处理完成时间（毫秒时间戳，未完成时为 null） */
  processed_at: number | null;
}

/**
 * 队列统计信息。
 *
 * 按 PENDING / PROCESSING / COMPLETED / FAILED 四种状态统计消息数量。
 */
export interface QueueStats {
  /** PENDING 状态消息数 */
  pending: number;
  /** PROCESSING 状态消息数 */
  processing: number;
  /** COMPLETED 状态消息数 */
  completed: number;
  /** FAILED 状态消息数 */
  failed: number;
  /** 总消息数 */
  total: number;
}

// ---------------------------------------------------------------------------
// 消息状态常量
// ---------------------------------------------------------------------------

/** 消息状态：待消费 */
export const MESSAGE_STATUS_PENDING = 'PENDING';
/** 消息状态：消费中 */
export const MESSAGE_STATUS_PROCESSING = 'PROCESSING';
/** 消息状态：已完成 */
export const MESSAGE_STATUS_COMPLETED = 'COMPLETED';
/** 消息状态：已失败 */
export const MESSAGE_STATUS_FAILED = 'FAILED';

// ---------------------------------------------------------------------------
// sendMQ
// ---------------------------------------------------------------------------

/** sendMQ 入参 */
export class SendMQInput extends Input {
  /** 消息数据 */
  data!: MessageData;
}

/** sendMQ 出参 */
export class SendMQOutput extends Output {
  /** 新增的消息 ID */
  id = '';
}

// ---------------------------------------------------------------------------
// consumeMQ
// ---------------------------------------------------------------------------

/** consumeMQ 入参 */
export class ConsumeMQInput extends Input {
  /** 队列名称 */
  queue!: string;
}

/** consumeMQ 出参 */
export class ConsumeMQOutput extends Output {
  /** 消费到的消息，无可用消息时为 null */
  message: MessageRecord | null = null;
}

// ---------------------------------------------------------------------------
// ackMQ
// ---------------------------------------------------------------------------

/** ackMQ 入参 */
export class AckMQInput extends Input {
  /** 消息 ID */
  message_id!: string;
}

/** ackMQ 出参 */
export class AckMQOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// nackMQ
// ---------------------------------------------------------------------------

/** nackMQ 入参 */
export class NackMQInput extends Input {
  /** 消息 ID */
  message_id!: string;
  /** 失败原因（可选） */
  reason?: string;
}

/** nackMQ 出参 */
export class NackMQOutput extends Output {
  /** 否认后的消息状态：PENDING（重新入队）或 FAILED（重试耗尽） */
  status = '';
  /** 否认后的重试次数 */
  retry_count = 0;
}

// ---------------------------------------------------------------------------
// getQueueStats
// ---------------------------------------------------------------------------

/** getQueueStats 入参 */
export class GetQueueStatsInput extends Input {
  /** 队列名称，不指定则返回所有队列统计 */
  queue?: string;
}

/** getQueueStats 出参 */
export class GetQueueStatsOutput extends Output {
  /** 队列统计信息 */
  stats: QueueStats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
  };
}

// ---------------------------------------------------------------------------
// enableMQ
// ---------------------------------------------------------------------------

/** enableMQ 入参 */
export class EnableMQInput extends Input {
  /** 是否启用 */
  enable!: boolean;
}

/** enableMQ 出参 */
export class EnableMQOutput extends Output {}

// ---------------------------------------------------------------------------
// closeMQ
// ---------------------------------------------------------------------------

/** closeMQ 入参（终态释放，不可恢复） */
export class CloseMQInput extends Input {}

/** closeMQ 出参 */
export class CloseMQOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

/** queue_message 表名（消息队列表） */
export const QUEUE_MESSAGE_TABLE = 'queue_message';

/** mq_config 表名（MQProvider 配置表） */
export const MQ_CONFIG_TABLE = 'mq_config';

/**
 * MQProvider 配置表默认配置项。
 *
 * PRD 4.2 节。
 */
export const MQ_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: 'MQ组件是否启用（enableMQ 读写）',
  },
  {
    config_key: 'message_ttl',
    config_value: '86400',
    value_type: 'INT',
    description: '消息默认保留时间（秒，默认1天）',
  },
  {
    config_key: 'default_max_retries',
    config_value: '3',
    value_type: 'INT',
    description: '默认最大重试次数',
  },
  {
    config_key: 'default_priority',
    config_value: '5',
    value_type: 'INT',
    description: '默认消息优先级（0-10）',
  },
] as const;
