import { Input, Context, Output } from '../../shared/base';

export class MQContext extends Context {}

export interface MessageData {
  
  queue: string;
  
  payload: unknown;
  
  priority?: number;
}

export interface MessageRecord {
  
  id: string;
  
  created: number;
  
  updated: number;
  
  queue: string;
  
  payload: unknown;
  
  priority: number;
  
  status: string;
  
  retry_count: number;
  
  max_retries: number;
  
  processed_at: number | null;
}

export interface QueueStats {
  
  pending: number;
  
  processing: number;
  
  completed: number;
  
  failed: number;
  
  total: number;
}

export const MESSAGE_STATUS_PENDING = 'PENDING';

export const MESSAGE_STATUS_PROCESSING = 'PROCESSING';

export const MESSAGE_STATUS_COMPLETED = 'COMPLETED';

export const MESSAGE_STATUS_FAILED = 'FAILED';

export class SendMQInput extends Input {
  
  data!: MessageData;
}

export class SendMQOutput extends Output {
  
  id = '';
}

export class ConsumeMQInput extends Input {
  
  queue!: string;
}

export class ConsumeMQOutput extends Output {
  
  message: MessageRecord | null = null;
}

export class AckMQInput extends Input {
  
  message_id!: string;
}

export class AckMQOutput extends Output {
  
  affected_rows = 0;
}

export class NackMQInput extends Input {
  
  message_id!: string;
  
  reason?: string;
}

export class NackMQOutput extends Output {
  
  status = '';
  
  retry_count = 0;
}

export class GetQueueStatsInput extends Input {
  
  queue?: string;
}

export class GetQueueStatsOutput extends Output {
  
  stats: QueueStats = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    total: 0,
  };
}

export class EnableMQInput extends Input {
  
  enable!: boolean;
}

export class EnableMQOutput extends Output {}

export class CloseMQInput extends Input {}

export class CloseMQOutput extends Output {}

export const QUEUE_MESSAGE_TABLE = 'queue_message';

export const MQ_CONFIG_TABLE = 'mq_config';
