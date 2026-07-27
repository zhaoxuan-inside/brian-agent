import { Input, Context, Output } from '../../shared/base';
import { logger } from '../../infrastructure/logger';
import { v4 as uuidv4 } from 'uuid';

export interface MQOperations {
  sendMQ(queue: string, payload: string, priority?: number): Promise<string>;
  consumeMQ(queue: string): Promise<{ msg_id: string; payload: string; priority: number } | null>;
  ackMQ(msg_id: string): Promise<void>;
  nackMQ(msg_id: string): Promise<void>;
  getQueueStats(queue?: string): Promise<Array<{ queue: string; pending: number; processing: number; completed: number; failed: number }>>;
}

export interface WorkerInfo {
  worker_id: string;
  queue: string;
  started_at: number;
  processed_count: number;
  interval: number;
  last_error?: string;
  status: 'RUNNING' | 'STOPPED';
}

export class StartWorkerInput extends Input {
  queue!: string;
  handler!: (payload: string) => Promise<void>;
  interval?: number;
  constructor(data?: Partial<StartWorkerInput>) {
    super(data);
    if (data) Object.assign(this, data);
  }
}

export class StartWorkerOutput extends Output {
  worker_id!: string;
}

export class StopWorkerInput extends Input {
  worker_id?: string;
  queue?: string;
  constructor(data?: Partial<StopWorkerInput>) {
    super(data);
    if (data) Object.assign(this, data);
  }
}

export class GetWorkerInput extends Input {
  queue?: string;
  constructor(data?: Partial<GetWorkerInput>) {
    super(data);
    if (data) Object.assign(this, data);
  }
}

export class GetWorkerOutput extends Output {
  workers: WorkerInfo[] = [];
}

export class MQCore {
  private workers: Map<string, { timer: NodeJS.Timeout; info: WorkerInfo }> = new Map();

  constructor(private mq: MQOperations) {}

  async startWorker(input: StartWorkerInput, context: Context, output: StartWorkerOutput): Promise<boolean> {
    try {
      if (typeof input.handler !== 'function') {
        output.success = false;
        output.error = 'Handler must be a function';
        return false;
      }

      const worker_id = uuidv4();
      const queue = input.queue;
      const interval = input.interval || 1000;

      const info: WorkerInfo = {
        worker_id,
        queue,
        started_at: Date.now(),
        processed_count: 0,
        interval,
        status: 'RUNNING',
      };

      const timer = setInterval(async () => {
        try {
          const msg = await this.mq.consumeMQ(queue);
          if (!msg) return;

          try {
            await input.handler(msg.payload);
            await this.mq.ackMQ(msg.msg_id);
            info.processed_count++;
          } catch (err) {
            info.last_error = err instanceof Error ? err.message : String(err);
            await this.mq.nackMQ(msg.msg_id);
            logger.error('MQCore', `Handler error for worker ${worker_id} on queue ${queue}`, { error: info.last_error });
          }
        } catch (err) {
          logger.error('MQCore', `Consume error for worker ${worker_id} on queue ${queue}`, { error: err instanceof Error ? err.message : String(err) });
        }
      }, interval);

      this.workers.set(worker_id, { timer, info });
      output.worker_id = worker_id;
      logger.info('MQCore', `Worker ${worker_id} started for queue ${queue}`, { interval });
      return true;
    } catch (err) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      logger.error('MQCore', 'Failed to start worker', { error: output.error });
      return false;
    }
  }

  async stopWorker(input: StopWorkerInput, context: Context, output: Output): Promise<boolean> {
    try {
      if (input.worker_id) {
        const entry = this.workers.get(input.worker_id);
        if (!entry) {
          output.success = false;
          output.error = `Worker ${input.worker_id} not found`;
          return false;
        }
        clearInterval(entry.timer);
        entry.info.status = 'STOPPED';
        this.workers.delete(input.worker_id);
        logger.info('MQCore', `Worker ${input.worker_id} stopped`);
      } else if (input.queue) {
        const stopped: string[] = [];
        for (const [id, entry] of this.workers) {
          if (entry.info.queue === input.queue) {
            clearInterval(entry.timer);
            entry.info.status = 'STOPPED';
            stopped.push(id);
          }
        }
        for (const id of stopped) {
          this.workers.delete(id);
        }
        logger.info('MQCore', `Stopped ${stopped.length} worker(s) for queue ${input.queue}`);
      } else {
        output.success = false;
        output.error = 'Either worker_id or queue must be provided';
        return false;
      }
      return true;
    } catch (err) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      logger.error('MQCore', 'Failed to stop worker', { error: output.error });
      return false;
    }
  }

  async getWorker(input: GetWorkerInput, context: Context, output: GetWorkerOutput): Promise<boolean> {
    try {
      const workers: WorkerInfo[] = [];
      for (const [, entry] of this.workers) {
        if (input.queue && entry.info.queue !== input.queue) continue;
        workers.push({ ...entry.info });
      }
      output.workers = workers;
      return true;
    } catch (err) {
      output.success = false;
      output.error = err instanceof Error ? err.message : String(err);
      logger.error('MQCore', 'Failed to get workers', { error: output.error });
      return false;
    }
  }
}
