import { Metrics, Report } from '@brian-agent/base';
import {
  MQAccess,
  MQContext,
  ConsumeMQInput,
  ConsumeMQOutput,
  AckMQInput,
  AckMQOutput,
  NackMQInput,
  NackMQOutput,
} from '@brian-agent/base';
import type { MessageRecord } from '@brian-agent/base';
import { v4 as uuidv4 } from 'uuid';
import {
  MQCoreContext,
  StartWorkerInput,
  StartWorkerOutput,
  StopWorkerInput,
  StopWorkerOutput,
  SoWorkerInput,
  SoWorkerOutput,
  WorkerInfo,
} from '../domain/types';

const MAX_CONCURRENCY = 5;

const MAX_RETRIES = 3;

interface WorkerState {
  worker_id: string;
  queue: string;
  handler: (msg: MessageRecord) => Promise<boolean>;
  interval_id: ReturnType<typeof setInterval>;
  interval: number;
  started_at: number;
  processed_count: number;
  error_count: number;
  
  active_count: number;
}

export class MQCoreService {
  
  private readonly workers = new Map<string, WorkerState>();

  
  private readonly retryMap = new Map<string, number>();

  

  constructor(private readonly mqAccess: MQAccess) {}

  

  async startWorker(input: StartWorkerInput, output: StartWorkerOutput, _context: MQCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const { queue, handler } = input;
    const interval = input.interval ?? 1000;

    
    
    
    
    
    for (const state of this.workers.values()) {
      if (state.queue === queue) {
        output.worker_id = state.worker_id;
        return true;
      }
    }

    const workerId = uuidv4();
    const state: WorkerState = {
      worker_id: workerId,
      queue,
      handler,
      
      interval_id: undefined as unknown as ReturnType<typeof setInterval>,
      interval,
      started_at: Date.now(),
      processed_count: 0,
      error_count: 0,
      active_count: 0,
    };

    const intervalId = setInterval(() => {
      void this.pollTick(state);
    }, interval);

    state.interval_id = intervalId;
    this.workers.set(workerId, state);

    output.worker_id = workerId;
    return true;
  }

  

  async stopWorker(input: StopWorkerInput, output: StopWorkerOutput, _context: MQCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const identifier = input.identifier;
    let stoppedCount = 0;

    
    const byId = this.workers.get(identifier);
    if (byId) {
      clearInterval(byId.interval_id);
      this.workers.delete(identifier);
      stoppedCount = 1;
    } else {
      
      const toStop: string[] = [];
      for (const [id, state] of this.workers) {
        if (state.queue === identifier) {
          clearInterval(state.interval_id);
          toStop.push(id);
        }
      }
      for (const id of toStop) {
        this.workers.delete(id);
      }
      stoppedCount = toStop.length;
    }

    output.stopped_count = stoppedCount;
    return true;
  }

  

  async soWorker(input: SoWorkerInput, output: SoWorkerOutput, _context: MQCoreContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const queueFilter = input.queue;
    const result: WorkerInfo[] = [];

    for (const state of this.workers.values()) {
      if (queueFilter && state.queue !== queueFilter) {
        continue;
      }
      result.push({
        worker_id: state.worker_id,
        queue: state.queue,
        started_at: state.started_at,
        processed_count: state.processed_count,
        error_count: state.error_count,
      });
    }

    output.workers = result;
    return true;
  }

  
  
  

  

  private async pollTick(state: WorkerState): Promise<void> {
    
    if (state.active_count >= MAX_CONCURRENCY) {
      return;
    }

    state.active_count++;

    try {
      const consumeOutput = new ConsumeMQOutput();
      const consumeInput = new ConsumeMQInput();
      consumeInput.queue = state.queue;
      await this.mqAccess.consumeMQ(consumeInput, consumeOutput, new MQContext());

      const msg = consumeOutput.message;
      if (!msg) {
        return;
      }

      try {
        const ok = await state.handler(msg);
        if (ok) {
          const ackInput = new AckMQInput();
          ackInput.message_id = msg.id;
          await this.mqAccess.ackMQ(ackInput, new AckMQOutput(), new MQContext());

          
          this.retryMap.delete(msg.id);
          state.processed_count++;
        } else {
          await this.handleFailure(state, msg);
        }
      } catch {
        await this.handleFailure(state, msg);
      }
    } catch (err) {
      
      
      
      
      
      
      void err;
    } finally {
      state.active_count--;
    }
  }

  

  private async handleFailure(
    state: WorkerState,
    msg: MessageRecord,
  ): Promise<void> {
    
    const attempts = this.retryMap.get(msg.id) ?? 0;
    const nextAttempt = attempts + 1;

    
    if (nextAttempt >= MAX_RETRIES) {
      this.retryMap.delete(msg.id);
    } else {
      this.retryMap.set(msg.id, nextAttempt);
    }

    const nackInput = new NackMQInput();
    nackInput.message_id = msg.id;
    nackInput.reason = `handler returned false or threw (attempt ${nextAttempt}/${MAX_RETRIES})`;
    await this.mqAccess.nackMQ(nackInput, new NackMQOutput(), new MQContext());

    state.error_count++;
  }
}
