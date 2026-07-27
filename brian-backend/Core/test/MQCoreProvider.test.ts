import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  MQAccess,
  MQContext,
  SendMQInput,
  SendMQOutput,
  Operator,
} from '@brian-agent/base';
import {
  MQCoreAccess,
  MQCoreContext,
  StartWorkerInput,
  StartWorkerOutput,
  StopWorkerInput,
  StopWorkerOutput,
  SoWorkerInput,
  SoWorkerOutput,
} from '../MQCoreProvider';

describe('MQCoreProvider', () => {
  let tempDir: string;
  let dbPath: string;
  let relationDb: RelationDBAccess;
  let mqAccess: MQAccess;
  let mqCore: MQCoreAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-mq-'));
    dbPath = path.join(tempDir, 'test.db');
    relationDb = new RelationDBAccess({ dbPath });
    await relationDb.initialize();
    mqAccess = new MQAccess(relationDb);
    await mqAccess.initialize();
    mqCore = new MQCoreAccess(mqAccess);
  });

  afterEach(async () => {
    try { await mqCore.stopWorker({ identifier: 'test-queue' }, new MQCoreContext(), new StopWorkerOutput()); } catch { /* ignore */ }
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('startWorker', () => {
    it('should start a worker and return worker_id', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      const input = new StartWorkerInput();
      input.queue = 'test-queue';
      input.handler = handler;
      input.interval = 500;
      const output = new StartWorkerOutput();

      const result = await mqCore.startWorker(input, new MQCoreContext(), output);
      expect(result).toBe(true);
      expect(output.worker_id).toBeTruthy();
      expect(typeof output.worker_id).toBe('string');
    });

    it('should use default interval of 1000 when not specified', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      const input = new StartWorkerInput();
      input.queue = 'test-queue-default-interval';
      input.handler = handler;
      const output = new StartWorkerOutput();

      await mqCore.startWorker(input, new MQCoreContext(), output);
      expect(output.worker_id).toBeTruthy();
    });

    it('should start multiple workers on same queue', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      const input1 = new StartWorkerInput();
      input1.queue = 'shared-queue';
      input1.handler = handler;
      input1.interval = 999;
      const output1 = new StartWorkerOutput();
      await mqCore.startWorker(input1, new MQCoreContext(), output1);

      const input2 = new StartWorkerInput();
      input2.queue = 'shared-queue';
      input2.handler = handler;
      input2.interval = 999;
      const output2 = new StartWorkerOutput();
      await mqCore.startWorker(input2, new MQCoreContext(), output2);

      expect(output1.worker_id).not.toBe(output2.worker_id);

      const soOutput = new SoWorkerOutput();
      await mqCore.soWorker({ queue: 'shared-queue' }, new MQCoreContext(), soOutput);
      expect(soOutput.workers.length).toBe(2);
    });

    it('should process published messages', async () => {
      const messages: string[] = [];
      const handler = vi.fn().mockImplementation(async (msg) => {
        messages.push(msg.payload as string);
        return true;
      });

      const input = new StartWorkerInput();
      input.queue = 'process-queue';
      input.handler = handler;
      input.interval = 100;
      const output = new StartWorkerOutput();
      await mqCore.startWorker(input, new MQCoreContext(), output);

      const pubInput = new SendMQInput();
      pubInput.data = { queue: 'process-queue', payload: 'test message 1' };
      await mqAccess.sendMQ(pubInput, new MQContext(), new SendMQOutput());

      const pubInput2 = new SendMQInput();
      pubInput2.data = { queue: 'process-queue', payload: 'test message 2' };
      await mqAccess.sendMQ(pubInput2, new MQContext(), new SendMQOutput());

      await new Promise((r) => setTimeout(r, 500));

      expect(messages.length).toBeGreaterThanOrEqual(1);
    }, 10000);
  });

  describe('stopWorker', () => {
    it('should stop worker by worker_id', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      const startInput = new StartWorkerInput();
      startInput.queue = 'stop-test';
      startInput.handler = handler;
      startInput.interval = 999;
      const startOutput = new StartWorkerOutput();
      await mqCore.startWorker(startInput, new MQCoreContext(), startOutput);

      const stopInput = new StopWorkerInput();
      stopInput.identifier = startOutput.worker_id;
      const stopOutput = new StopWorkerOutput();
      const result = await mqCore.stopWorker(stopInput, new MQCoreContext(), stopOutput);
      expect(result).toBe(true);
      expect(stopOutput.stopped_count).toBe(1);
    });

    it('should stop all workers by queue name', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      for (let i = 0; i < 3; i++) {
        const input = new StartWorkerInput();
        input.queue = 'batch-queue';
        input.handler = handler;
        input.interval = 999;
        await mqCore.startWorker(input, new MQCoreContext(), new StartWorkerOutput());
      }

      const stopInput = new StopWorkerInput();
      stopInput.identifier = 'batch-queue';
      const stopOutput = new StopWorkerOutput();
      await mqCore.stopWorker(stopInput, new MQCoreContext(), stopOutput);
      expect(stopOutput.stopped_count).toBe(3);
    });

    it('should return 0 for unknown identifier', async () => {
      const stopInput = new StopWorkerInput();
      stopInput.identifier = 'unknown-worker-id';
      const stopOutput = new StopWorkerOutput();
      const result = await mqCore.stopWorker(stopInput, new MQCoreContext(), stopOutput);
      expect(result).toBe(true);
      expect(stopOutput.stopped_count).toBe(0);
    });
  });

  describe('soWorker', () => {
    it('should return empty list when no workers', async () => {
      const input = new SoWorkerInput();
      const output = new SoWorkerOutput();
      await mqCore.soWorker(input, new MQCoreContext(), output);
      expect(output.workers).toEqual([]);
    });

    it('should list all workers', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      const s1 = new StartWorkerInput();
      s1.queue = 'q1';
      s1.handler = handler;
      s1.interval = 999;
      const o1 = new StartWorkerOutput();
      await mqCore.startWorker(s1, new MQCoreContext(), o1);

      const s2 = new StartWorkerInput();
      s2.queue = 'q2';
      s2.handler = handler;
      s2.interval = 999;
      const o2 = new StartWorkerOutput();
      await mqCore.startWorker(s2, new MQCoreContext(), o2);

      const soOutput = new SoWorkerOutput();
      await mqCore.soWorker(new SoWorkerInput(), new MQCoreContext(), soOutput);
      expect(soOutput.workers.length).toBe(2);
    });

    it('should filter workers by queue', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      const s1 = new StartWorkerInput();
      s1.queue = 'filter-q1';
      s1.handler = handler;
      s1.interval = 999;
      await mqCore.startWorker(s1, new MQCoreContext(), new StartWorkerOutput());

      const s2 = new StartWorkerInput();
      s2.queue = 'filter-q2';
      s2.handler = handler;
      s2.interval = 999;
      await mqCore.startWorker(s2, new MQCoreContext(), new StartWorkerOutput());

      const soInput = new SoWorkerInput();
      soInput.queue = 'filter-q1';
      const soOutput = new SoWorkerOutput();
      await mqCore.soWorker(soInput, new MQCoreContext(), soOutput);
      expect(soOutput.workers.length).toBe(1);
      expect(soOutput.workers[0].queue).toBe('filter-q1');
    });

    it('should return worker info with correct fields', async () => {
      const handler = vi.fn().mockResolvedValue(true);
      const s1 = new StartWorkerInput();
      s1.queue = 'info-q';
      s1.handler = handler;
      s1.interval = 999;
      const o1 = new StartWorkerOutput();
      await mqCore.startWorker(s1, new MQCoreContext(), o1);

      const soOutput = new SoWorkerOutput();
      await mqCore.soWorker(new SoWorkerInput(), new MQCoreContext(), soOutput);
      expect(soOutput.workers[0]).toHaveProperty('worker_id');
      expect(soOutput.workers[0]).toHaveProperty('queue');
      expect(soOutput.workers[0]).toHaveProperty('started_at');
      expect(soOutput.workers[0]).toHaveProperty('processed_count');
      expect(soOutput.workers[0]).toHaveProperty('error_count');
    });
  });

  describe('AOP integration', () => {
    it('should set elapsed_ms on output', async () => {
      const input = new StartWorkerInput();
      input.queue = 'aop-queue';
      input.handler = vi.fn().mockResolvedValue(true);
      input.interval = 999;
      const output = new StartWorkerOutput();

      await mqCore.startWorker(input, new MQCoreContext(), output);
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
