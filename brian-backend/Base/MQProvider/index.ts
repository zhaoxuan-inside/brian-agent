/**
 * @fileoverview MQProvider 模块统一导出。
 */

// access 层
export { MQAccess } from './access/MQAccess';

// domain 层类型
export {
  MQContext,
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
  MESSAGE_STATUS_PENDING,
  MESSAGE_STATUS_PROCESSING,
  MESSAGE_STATUS_COMPLETED,
  MESSAGE_STATUS_FAILED,
  QUEUE_MESSAGE_TABLE,
  MQ_CONFIG_TABLE,
  MQ_DEFAULT_CONFIGS,
} from './domain/types';

export type { MessageData, MessageRecord, QueueStats } from './domain/types';
