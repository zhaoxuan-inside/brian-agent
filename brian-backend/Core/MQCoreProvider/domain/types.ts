import { Input, Context, Output } from '@brian-agent/base';
import type { MessageRecord } from '@brian-agent/base';

export class MQCoreContext extends Context {}

export interface WorkerInfo {
  
  worker_id: string;
  
  queue: string;
  
  started_at: number;
  
  processed_count: number;
  
  error_count: number;
}

export type WorkerHandler = (msg: MessageRecord) => Promise<boolean>;

export class StartWorkerInput extends Input {
  
  queue!: string;
  
  handler!: WorkerHandler;
  
  interval?: number;
}

export class StartWorkerOutput extends Output {
  
  worker_id = '';
}

export class StopWorkerInput extends Input {
  
  identifier!: string;
}

export class StopWorkerOutput extends Output {
  
  stopped_count = 0;
}

export class SoWorkerInput extends Input {
  
  queue?: string;
}

export class SoWorkerOutput extends Output {
  
  workers: WorkerInfo[] = [];
}
