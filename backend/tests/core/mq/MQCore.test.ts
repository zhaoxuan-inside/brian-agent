import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MQCore,
  StartWorkerInput,
  StartWorkerOutput,
  StopWorkerInput,
  GetWorkerInput,
  GetWorkerOutput,
} from '../../../src/core/mq/MQCore';
import { Context, Output } from '../../../src/shared/base';

describe('MQCore', () => {
  let mqCore: MQCore;
  let mockMQ: {
    sendMQ: ReturnType<typeof vi.fn>;
    consumeMQ: ReturnType<typeof vi.fn>;
    ackMQ: ReturnType<typeof vi.fn>;
    nackMQ: ReturnType<typeof vi.fn>;
    getQueueStats: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    mockMQ = {
      sendMQ: vi.fn().mockResolvedValue('msg-1'),
      consumeMQ: vi.fn().mockResolvedValue(null),
      ackMQ: vi.fn().mockResolvedValue(undefined),
      nackMQ: vi.fn().mockResolvedValue(undefined),
      getQueueStats: vi.fn().mockResolvedValue([{ queue: 'default', pending: 0, processing: 0, completed: 0, failed: 0 }]),
    };

    mqCore = new MQCore(mockMQ);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('startWorker', () => {
    it('should start a worker and return worker_id', async () => {
      const input = new StartWorkerInput({ queue: 'test-queue', handler: async () => {} });
      const context = new Context();
      const output = new StartWorkerOutput();

      const result = await mqCore.startWorker(input, context, output);

      expect(result).toBe(true);
      expect(output.worker_id).toBeTruthy();
      expect(typeof output.worker_id).toBe('string');
      expect(output.worker_id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should start polling at specified interval', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const input = new StartWorkerInput({ queue: 'test-queue', handler, interval: 500 });
      const context = new Context();
      const output = new StartWorkerOutput();

      await mqCore.startWorker(input, context, output);

      expect(mockMQ.consumeMQ).not.toHaveBeenCalled();

      vi.advanceTimersByTime(400);
      expect(mockMQ.consumeMQ).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(200);
      expect(mockMQ.consumeMQ).toHaveBeenCalledTimes(1);
      expect(mockMQ.consumeMQ).toHaveBeenCalledWith('test-queue');

      await vi.advanceTimersByTimeAsync(500);
      expect(mockMQ.consumeMQ).toHaveBeenCalledTimes(2);
    });

    it('should process messages via handler when available', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const msg = { msg_id: 'test-msg', payload: 'hello-world', priority: 1 };
      mockMQ.consumeMQ.mockResolvedValueOnce(msg).mockResolvedValue(null);

      const input = new StartWorkerInput({ queue: 'test-queue', handler, interval: 100 });
      const context = new Context();
      const output = new StartWorkerOutput();

      await mqCore.startWorker(input, context, output);

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledWith('hello-world');
      expect(mockMQ.ackMQ).toHaveBeenCalledWith('test-msg');
      expect(mockMQ.nackMQ).not.toHaveBeenCalled();
    });

    it('should nack when handler throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('handler error'));
      const msg = { msg_id: 'test-msg', payload: 'bad-payload', priority: 1 };
      mockMQ.consumeMQ.mockResolvedValueOnce(msg).mockResolvedValue(null);

      const input = new StartWorkerInput({ queue: 'test-queue', handler, interval: 100 });
      const context = new Context();
      const output = new StartWorkerOutput();

      await mqCore.startWorker(input, context, output);

      await vi.advanceTimersByTimeAsync(100);

      expect(handler).toHaveBeenCalledWith('bad-payload');
      expect(mockMQ.nackMQ).toHaveBeenCalledWith('test-msg');
      expect(mockMQ.ackMQ).not.toHaveBeenCalled();
    });

    it('should increment processed_count on success', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const msg = { msg_id: 'msg-1', payload: 'hello', priority: 1 };
      mockMQ.consumeMQ.mockResolvedValueOnce(msg).mockResolvedValue(null);

      const input = new StartWorkerInput({ queue: 'test-queue', handler, interval: 100 });
      const context = new Context();
      const output = new StartWorkerOutput();

      await mqCore.startWorker(input, context, output);
      const workerId = output.worker_id;

      await vi.advanceTimersByTimeAsync(100);

      const getOutput = new GetWorkerOutput();
      await mqCore.getWorker(new GetWorkerInput({ queue: 'test-queue' }), context, getOutput);

      expect(getOutput.workers).toHaveLength(1);
      expect(getOutput.workers[0].processed_count).toBe(1);
      expect(getOutput.workers[0].worker_id).toBe(workerId);
    });

    it('should reject when handler is not a function', async () => {
      const input = new StartWorkerInput({ queue: 'test-queue', handler: 'not-a-function' as any });
      const context = new Context();
      const output = new StartWorkerOutput();

      const result = await mqCore.startWorker(input, context, output);

      expect(result).toBe(false);
      expect(output.success).toBe(false);
      expect(output.error).toBe('Handler must be a function');
      expect(output.worker_id).toBeUndefined();
    });
  });

  describe('stopWorker', () => {
    it('should stop a worker by worker_id', async () => {
      const input = new StartWorkerInput({ queue: 'test-queue', handler: async () => {}, interval: 100 });
      const context = new Context();
      const output = new StartWorkerOutput();
      await mqCore.startWorker(input, context, output);
      const workerId = output.worker_id;

      const stopInput = new StopWorkerInput({ worker_id: workerId });
      const stopOutput = new Output();
      const result = await mqCore.stopWorker(stopInput, context, stopOutput);

      expect(result).toBe(true);

      const getOutput = new GetWorkerOutput();
      await mqCore.getWorker(new GetWorkerInput({ queue: 'test-queue' }), context, getOutput);
      expect(getOutput.workers).toHaveLength(0);
    });

    it('should stop all workers by queue name', async () => {
      const context = new Context();
      const handler = async () => {};

      const out1 = new StartWorkerOutput();
      await mqCore.startWorker(new StartWorkerInput({ queue: 'q1', handler, interval: 100 }), context, out1);
      const out2 = new StartWorkerOutput();
      await mqCore.startWorker(new StartWorkerInput({ queue: 'q1', handler, interval: 100 }), context, out2);
      const out3 = new StartWorkerOutput();
      await mqCore.startWorker(new StartWorkerInput({ queue: 'q2', handler, interval: 100 }), context, out3);

      const stopOutput = new Output();
      const result = await mqCore.stopWorker(new StopWorkerInput({ queue: 'q1' }), context, stopOutput);

      expect(result).toBe(true);

      const getQ1 = new GetWorkerOutput();
      await mqCore.getWorker(new GetWorkerInput({ queue: 'q1' }), context, getQ1);
      expect(getQ1.workers).toHaveLength(0);

      const getQ2 = new GetWorkerOutput();
      await mqCore.getWorker(new GetWorkerInput({ queue: 'q2' }), context, getQ2);
      expect(getQ2.workers).toHaveLength(1);
    });

    it('should return error when neither worker_id nor queue provided', async () => {
      const context = new Context();
      const output = new Output();
      const result = await mqCore.stopWorker(new StopWorkerInput({}), context, output);

      expect(result).toBe(false);
      expect(output.success).toBe(false);
      expect(output.error).toBe('Either worker_id or queue must be provided');
    });

    it('should handle non-existent worker_id', async () => {
      const context = new Context();
      const output = new Output();
      const result = await mqCore.stopWorker(new StopWorkerInput({ worker_id: 'nonexistent' }), context, output);

      expect(result).toBe(false);
      expect(output.success).toBe(false);
      expect(output.error).toBe('Worker nonexistent not found');
    });

    it('should be idempotent when stopping already stopped worker', async () => {
      const startOutput = new StartWorkerOutput();
      await mqCore.startWorker(
        new StartWorkerInput({ queue: 'test', handler: async () => {}, interval: 100 }),
        new Context(),
        startOutput,
      );
      const workerId = startOutput.worker_id;

      await mqCore.stopWorker(new StopWorkerInput({ worker_id: workerId }), new Context(), new Output());

      const output2 = new Output();
      const result = await mqCore.stopWorker(new StopWorkerInput({ worker_id: workerId }), new Context(), output2);

      expect(result).toBe(false);
      expect(output2.success).toBe(false);
    });
  });

  describe('getWorker', () => {
    it('should return empty list when no workers', async () => {
      const context = new Context();
      const output = new GetWorkerOutput();
      const result = await mqCore.getWorker(new GetWorkerInput({}), context, output);

      expect(result).toBe(true);
      expect(output.workers).toEqual([]);
    });

    it('should return all workers when no queue specified', async () => {
      const context = new Context();
      const handler = async () => {};

      const out1 = new StartWorkerOutput();
      await mqCore.startWorker(new StartWorkerInput({ queue: 'q1', handler, interval: 100 }), context, out1);
      const out2 = new StartWorkerOutput();
      await mqCore.startWorker(new StartWorkerInput({ queue: 'q2', handler, interval: 100 }), context, out2);

      const output = new GetWorkerOutput();
      await mqCore.getWorker(new GetWorkerInput({}), context, output);

      expect(output.workers).toHaveLength(2);
    });

    it('should filter workers by queue', async () => {
      const context = new Context();
      const handler = async () => {};

      const out1 = new StartWorkerOutput();
      await mqCore.startWorker(new StartWorkerInput({ queue: 'q1', handler, interval: 100 }), context, out1);
      const out2 = new StartWorkerOutput();
      await mqCore.startWorker(new StartWorkerInput({ queue: 'q2', handler, interval: 100 }), context, out2);

      const output = new GetWorkerOutput();
      await mqCore.getWorker(new GetWorkerInput({ queue: 'q1' }), context, output);

      expect(output.workers).toHaveLength(1);
      expect(output.workers[0].queue).toBe('q1');
    });

    it('should return correct worker info', async () => {
      const context = new Context();
      const handler = async () => {};

      const startOutput = new StartWorkerOutput();
      await mqCore.startWorker(
        new StartWorkerInput({ queue: 'my-queue', handler, interval: 250 }),
        context,
        startOutput,
      );
      const workerId = startOutput.worker_id;

      const output = new GetWorkerOutput();
      await mqCore.getWorker(new GetWorkerInput({}), context, output);

      expect(output.workers).toHaveLength(1);
      const worker = output.workers[0];
      expect(worker.worker_id).toBe(workerId);
      expect(worker.queue).toBe('my-queue');
      expect(worker.status).toBe('RUNNING');
      expect(worker.processed_count).toBe(0);
      expect(worker.interval).toBe(250);
      expect(typeof worker.started_at).toBe('number');
    });
  });
});
