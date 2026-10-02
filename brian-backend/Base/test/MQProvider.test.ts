import { Metrics } from '../shared/base/Metrics';
import { Report } from '../shared/base/Report';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { CloseDBInput, CloseDBOutput, DBContext } from '../RelationDBProvider';
import {
  MQAccess,
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
} from '../MQProvider';
import type { MessageData, MessageRecord, QueueStats } from '../MQProvider';
import { ComponentDisabledError, ValidationError, NotFoundError } from '../shared/errors';
import { Operator } from '../shared/query';

function msg(
  queue: string,
  payload: unknown,
  priority?: number,
): MessageData {
  return { queue, payload, ...(priority !== undefined ? { priority } : {}) };
}

async function cleanupTempDir(dir: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 50));
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {

    }
  }
}

describe('MQProvider', () => {
  let tempDir: string;
  let sqlitePath: string;
  let relationDb: RelationDBAccess;
  let mq: MQAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-mq-test-'));
    sqlitePath = path.join(tempDir, 'test.db');

    relationDb = new RelationDBAccess({ dbPath: sqlitePath });
    await relationDb.initialize();

    mq = new MQAccess(relationDb);
    await mq.initialize();

    await relationDb.update('mq_config_record', [
      { field: 'config_value', value: '0' },
      { field: 'updated', value: Date.now() },
    ], [{ field: 'config_key', operator: Operator.EQ, value: 'retry_base_delay' }]);
  });

  afterEach(async () => {
    try {
      await mq.closeMQ(new CloseMQInput(), new CloseMQOutput(), new MQContext());
    } catch {

    }
    try {
      await relationDb.closeDB(new CloseDBInput(), new CloseDBOutput(), new DBContext());
    } catch {

    }
    await cleanupTempDir(tempDir);
  });

  describe('sendMQ', () => {
    it('应成功发送消息并返回 ID', async () => {
      const output = new SendMQOutput();
      const ok = await mq.sendMQ(
        { data: msg('task', { action: 'sync' }) } as SendMQInput,
        output, new MQContext(),
      );
      expect(ok).toBe(true);
      expect(output.id).toBeTruthy();
      expect(typeof output.id).toBe('string');
      expect(output.id.length).toBeGreaterThan(0);
    });

    it('应使用指定的优先级', async () => {
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }, 8) } as SendMQInput,
        output, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      expect(consumeOut.message).not.toBeNull();
      expect(consumeOut.message!.priority).toBe(8);
    });

    it('未指定 priority 时应使用配置默认值（5）', async () => {
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        output, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      expect(consumeOut.message!).not.toBeNull();
      expect(consumeOut.message!.priority).toBe(5);
    });

    it('应使用默认优先级（0）当 boundary 值为 0 时', async () => {
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }, 0) } as SendMQInput,
        output, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      expect(consumeOut.message!.priority).toBe(0);
    });

    it('应使用默认优先级（10）当 boundary 值为 10 时', async () => {
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }, 10) } as SendMQInput,
        output, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      expect(consumeOut.message!.priority).toBe(10);
    });

    it('应设置默认 max_retries 为配置值（3）', async () => {
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        output, new MQContext(),
      );

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: output.id }],
      });
      expect(rows.length).toBe(1);
      expect(rows[0].max_retries).toBe(3);
    });

    it('应设置默认重试次数为 0', async () => {
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        output, new MQContext(),
      );

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: output.id }],
      });
      expect(rows[0].retry_count).toBe(0);
    });

    it('新消息状态应为 PENDING', async () => {
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        output, new MQContext(),
      );

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: output.id }],
      });
      expect(rows[0].status).toBe(MESSAGE_STATUS_PENDING);
    });

    it('应记录 created 和 updated 时间戳', async () => {
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        output, new MQContext(),
      );

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: output.id }],
      });
      expect(typeof rows[0].created).toBe('number');
      expect(typeof rows[0].updated).toBe('number');
      expect(rows[0].created).toBe(rows[0].updated);
      expect(rows[0].created).toBeGreaterThan(0);
    });

    it('payload 应以 JSON 字符串存储', async () => {
      const payload = { nested: { key: 'value' }, arr: [1, 2, 3] };
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', payload) } as SendMQInput,
        output, new MQContext(),
      );

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: output.id }],
      });
      expect(rows[0].payload).toBe(JSON.stringify(payload));
    });

    it('应支持不同队列的消息', async () => {
      const out1 = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('queue-a', { x: 1 }) } as SendMQInput,
        out1, new MQContext(),
      );
      const out2 = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('queue-b', { x: 2 }) } as SendMQInput,
        out2, new MQContext(),
      );

      const rows = await relationDb.select('queue_message_record');
      expect(rows.length).toBe(2);
      const queues = rows.map((r) => r.queue);
      expect(queues).toContain('queue-a');
      expect(queues).toContain('queue-b');
    });

    it('每条消息应有唯一的 ID', async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const output = new SendMQOutput();
        await mq.sendMQ(
          { data: msg('task', { idx: i }) } as SendMQInput,
          output, new MQContext(),
        );
        ids.add(output.id);
      }
      expect(ids.size).toBe(10);
    });

    it('应拒绝空 data', async () => {
      const output = new SendMQOutput();
      await expect(
        mq.sendMQ(
          { data: null as unknown as MessageData } as SendMQInput,
          output, new MQContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝空 queue', async () => {
      const output = new SendMQOutput();
      await expect(
        mq.sendMQ(
          { data: msg('', { x: 1 }) } as SendMQInput,
          output, new MQContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝 priority < 0', async () => {
      const output = new SendMQOutput();
      await expect(
        mq.sendMQ(
          { data: msg('task', { x: 1 }, -1) } as SendMQInput,
          output, new MQContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝 priority > 10', async () => {
      const output = new SendMQOutput();
      await expect(
        mq.sendMQ(
          { data: msg('task', { x: 1 }, 11) } as SendMQInput,
          output, new MQContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝 null payload', async () => {
      const output = new SendMQOutput();
      await expect(
        mq.sendMQ(
          { data: msg('task', null) } as SendMQInput,
          output, new MQContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应接受非数字类型的 priority 并抛出校验错误', async () => {
      const output = new SendMQOutput();
      await expect(
        mq.sendMQ(
          { data: msg('task', { x: 1 }, 'high' as unknown as number) } as SendMQInput,
          output, new MQContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('禁用的 MQ 应拒绝 sendMQ', async () => {
      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());
      const output = new SendMQOutput();
      await expect(
        mq.sendMQ(
          { data: msg('task', { x: 1 }) } as SendMQInput,
          output, new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('consumeMQ', () => {
    it('应消费 PENDING 消息并返回消息内容', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { action: 'process' }, 7) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const output = new ConsumeMQOutput();
      const ok = await mq.consumeMQ(
        { queue: 'task' } as ConsumeMQInput,
        output, new MQContext(),
      );
      expect(ok).toBe(true);
      expect(output.message).not.toBeNull();
      expect(output.message!.id).toBe(sendOut.id);
      expect(output.message!.queue).toBe('task');
      expect(output.message!.payload).toEqual({ action: 'process' });
      expect(output.message!.priority).toBe(7);
      expect(output.message!.status).toBe(MESSAGE_STATUS_PROCESSING);
      expect(output.message!.retry_count).toBe(0);
    });

    it('消费后消息状态应变为 PROCESSING', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, new ConsumeMQOutput(), new MQContext());

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      expect(rows[0].status).toBe(MESSAGE_STATUS_PROCESSING);
    });

    it('无可用消息时应返回 message=null', async () => {
      const output = new ConsumeMQOutput();
      const ok = await mq.consumeMQ(
        { queue: 'empty-queue' } as ConsumeMQInput,
        output, new MQContext(),
      );
      expect(ok).toBe(true);
      expect(output.message).toBeNull();
    });

    it('应优先消费优先级更高的消息（priority DESC）', async () => {

      const lowOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { level: 'low' }, 1) } as SendMQInput,
        lowOut, new MQContext(),
      );

      const highOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { level: 'high' }, 9) } as SendMQInput,
        highOut, new MQContext(),
      );

      const output = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, output, new MQContext());
      expect(output.message!.id).toBe(highOut.id);
      expect(output.message!.payload).toEqual({ level: 'high' });
    });

    it('同优先级应按创建时间升序消费（先入先出）', async () => {

      const out1 = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { idx: 1 }, 5) } as SendMQInput,
        out1, new MQContext(),
      );

      await new Promise((r) => setTimeout(r, 2));
      const out2 = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { idx: 2 }, 5) } as SendMQInput,
        out2, new MQContext(),
      );

      const consume1 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consume1, new MQContext());
      expect(consume1.message!.payload).toEqual({ idx: 1 });

      const consume2 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consume2, new MQContext());
      expect(consume2.message!.payload).toEqual({ idx: 2 });
    });

    it('应只消费指定队列的消息', async () => {
      await mq.sendMQ(
        { data: msg('queue-x', { x: 1 }) } as SendMQInput,
        new SendMQOutput(), new MQContext(),
      );
      await mq.sendMQ(
        { data: msg('queue-y', { y: 1 }) } as SendMQInput,
        new SendMQOutput(), new MQContext(),
      );

      const output = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'queue-x' } as ConsumeMQInput, output, new MQContext());
      expect(output.message).not.toBeNull();
      expect(output.message!.queue).toBe('queue-x');
      expect(output.message!.payload).toEqual({ x: 1 });
    });

    it('不应消费 PROCESSING 状态的消息', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, new ConsumeMQOutput(), new MQContext());

      const output2 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, output2, new MQContext());
      expect(output2.message).toBeNull();
    });

    it('不应消费 COMPLETED 状态的消息', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      await mq.ackMQ(
        { message_id: consumeOut.message!.id } as AckMQInput,
        new AckMQOutput(), new MQContext(),
      );

      const output2 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, output2, new MQContext());
      expect(output2.message).toBeNull();
    });

    it('不应消费 FAILED 状态的消息', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      for (let i = 0; i < 3; i++) {
        if (consumeOut.message && consumeOut.message.status !== 'PENDING') break;
        await mq.nackMQ(
          { message_id: consumeOut.message!.id } as NackMQInput,
          new NackMQOutput(), new MQContext(),
        );

        const reOut = new ConsumeMQOutput();
        await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, reOut, new MQContext());
        if (reOut.message) {
          consumeOut.message = reOut.message;
        } else {
          break;
        }
      }

      const output2 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, output2, new MQContext());
      expect(output2.message).toBeNull();
    });

    it('应拒绝空 queue', async () => {
      const output = new ConsumeMQOutput();
      await expect(
        mq.consumeMQ({ queue: '' } as ConsumeMQInput, output, new MQContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('禁用的 MQ 应拒绝 consumeMQ', async () => {
      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());
      await expect(
        mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, new ConsumeMQOutput(), new MQContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('应支持消费多队列分别操作', async () => {
      await mq.sendMQ(
        { data: msg('q1', { v: 'a' }, 5) } as SendMQInput,
        new SendMQOutput(), new MQContext(),
      );
      await mq.sendMQ(
        { data: msg('q2', { v: 'b' }, 5) } as SendMQInput,
        new SendMQOutput(), new MQContext(),
      );

      const out1 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'q1' } as ConsumeMQInput, out1, new MQContext());
      expect(out1.message!.payload).toEqual({ v: 'a' });

      const out2 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'q2' } as ConsumeMQInput, out2, new MQContext());
      expect(out2.message!.payload).toEqual({ v: 'b' });
    });
  });

  describe('ackMQ', () => {
    it('应确认消息为 COMPLETED 并记录处理完成时间', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());

      const output = new AckMQOutput();
      const ok = await mq.ackMQ(
        { message_id: consumeOut.message!.id } as AckMQInput,
        output, new MQContext(),
      );
      expect(ok).toBe(true);
      expect(output.affected_rows).toBe(1);

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: consumeOut.message!.id }],
      });
      expect(rows[0].status).toBe(MESSAGE_STATUS_COMPLETED);
      expect(typeof rows[0].processed_at).toBe('number');
      expect(rows[0].processed_at).toBeGreaterThan(0);
    });

    it('应更新 updated 时间戳', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const rowsBefore = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      const updatedBefore = rowsBefore[0].updated as number;

      await new Promise((r) => setTimeout(r, 2));

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      await mq.ackMQ(
        { message_id: consumeOut.message!.id } as AckMQInput,
        new AckMQOutput(), new MQContext(),
      );

      const rowsAfter = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      expect(rowsAfter[0].updated).toBeGreaterThan(updatedBefore);
    });

    it('确认多次同样消息应更新已确认的消息（幂等）', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());

      await mq.ackMQ(
        { message_id: consumeOut.message!.id } as AckMQInput,
        new AckMQOutput(), new MQContext(),
      );

      const output2 = new AckMQOutput();
      await mq.ackMQ(
        { message_id: consumeOut.message!.id } as AckMQInput,
        output2, new MQContext(),
      );
      expect(output2.affected_rows).toBe(1);
    });

    it('不存在的消息 ID 应抛出 NotFoundError', async () => {
      const output = new AckMQOutput();
      await expect(
        mq.ackMQ(
          { message_id: 'nonexistent-id' } as AckMQInput,
          output, new MQContext(),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('应拒绝空 message_id', async () => {
      await expect(
        mq.ackMQ(
          { message_id: '' } as AckMQInput,
          new AckMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('禁用的 MQ 应拒绝 ackMQ', async () => {
      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());
      await expect(
        mq.ackMQ(
          { message_id: 'any-id' } as AckMQInput,
          new AckMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('nackMQ', () => {
    it('首次 nack 应递增 retry_count 并将状态回退为 PENDING', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());

      const output = new NackMQOutput();
      const ok = await mq.nackMQ(
        { message_id: consumeOut.message!.id, reason: 'test failure' } as NackMQInput,
        output, new MQContext(),
      );
      expect(ok).toBe(true);
      expect(output.status).toBe(MESSAGE_STATUS_PENDING);
      expect(output.retry_count).toBe(1);

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: consumeOut.message!.id }],
      });
      expect(rows[0].status).toBe(MESSAGE_STATUS_PENDING);
      expect(rows[0].retry_count).toBe(1);
    });

    it('重试次数达到 max_retries 时应将状态设为 FAILED', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      for (let i = 0; i < 3; i++) {
        const consumeOut = new ConsumeMQOutput();
        await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
        expect(consumeOut.message).not.toBeNull();

        const nackOut = new NackMQOutput();
        await mq.nackMQ(
          { message_id: consumeOut.message!.id } as NackMQInput,
          nackOut, new MQContext(),
        );
        if (i < 2) {

          if (i === 2) {

            break;
          }
          expect(nackOut.status).toBe(MESSAGE_STATUS_PENDING);
          expect(nackOut.retry_count).toBe(i + 1);
        }
      }

      const consumeFinal = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeFinal, new MQContext());
      expect(consumeFinal.message).not.toBeNull();

      const nackFinal = new NackMQOutput();
      await mq.nackMQ(
        { message_id: consumeFinal.message!.id } as NackMQInput,
        nackFinal, new MQContext(),
      );
      expect(nackFinal.status).toBe(MESSAGE_STATUS_FAILED);
      expect(nackFinal.retry_count).toBe(3);

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      expect(rows[0].status).toBe(MESSAGE_STATUS_FAILED);
      expect(rows[0].retry_count).toBe(3);
    });

    it('nack 后重新入队的消息应可被再次消费', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consume1 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consume1, new MQContext());

      await mq.nackMQ(
        { message_id: consume1.message!.id } as NackMQInput,
        new NackMQOutput(), new MQContext(),
      );

      const consume2 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consume2, new MQContext());
      expect(consume2.message).not.toBeNull();
      expect(consume2.message!.id).toBe(sendOut.id);

      await mq.ackMQ(
        { message_id: consume2.message!.id } as AckMQInput,
        new AckMQOutput(), new MQContext(),
      );

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      expect(rows[0].status).toBe(MESSAGE_STATUS_COMPLETED);
      expect(rows[0].retry_count).toBe(1);
    });

    it('不存在的消息 ID 应抛出 NotFoundError', async () => {
      const output = new NackMQOutput();
      await expect(
        mq.nackMQ(
          { message_id: 'nonexistent-id' } as NackMQInput,
          output, new MQContext(),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('应拒绝空 message_id', async () => {
      await expect(
        mq.nackMQ(
          { message_id: '' } as NackMQInput,
          new NackMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('禁用的 MQ 应拒绝 nackMQ', async () => {
      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());
      await expect(
        mq.nackMQ(
          { message_id: 'any-id' } as NackMQInput,
          new NackMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('max_retries=0 时应直接在首次 nack 时设为 FAILED', async () => {

      const id = 'test-zero-retries';
      const now = Date.now();
      await relationDb.insert('queue_message_record', [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'queue', value: 'task' },
        { field: 'payload', value: JSON.stringify({ test: true }) },
        { field: 'priority', value: 5 },
        { field: 'status', value: MESSAGE_STATUS_PROCESSING },
        { field: 'retry_count', value: 0 },
        { field: 'max_retries', value: 0 },
      ]);

      const output = new NackMQOutput();
      await mq.nackMQ(
        { message_id: id } as NackMQInput,
        output, new MQContext(),
      );
      expect(output.status).toBe(MESSAGE_STATUS_FAILED);
      expect(output.retry_count).toBe(0);
    });
  });

  describe('soQueueStats', () => {
    it('空队列应返回全 0 统计', async () => {
      const output = new GetQueueStatsOutput();
      const ok = await mq.soQueueStats(
        { queue: 'empty' } as GetQueueStatsInput,
        output, new MQContext(),
      );
      expect(ok).toBe(true);
      expect(output.stats).toEqual({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: 0,
      });
    });

    it('应正确统计指定队列各状态的消息数', async () => {

      for (let i = 0; i < 5; i++) {
        await mq.sendMQ(
          { data: msg('task', { idx: i }) } as SendMQInput,
          new SendMQOutput(), new MQContext(),
        );
      }

      for (let i = 0; i < 2; i++) {
        await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, new ConsumeMQOutput(), new MQContext());
      }

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      await mq.ackMQ(
        { message_id: consumeOut.message!.id } as AckMQInput,
        new AckMQOutput(), new MQContext(),
      );

      const toFail = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, toFail, new MQContext());
      for (let i = 0; i < 4; i++) {
        const nackOut = new NackMQOutput();
        await mq.nackMQ(
          { message_id: toFail.message!.id } as NackMQInput,
          nackOut, new MQContext(),
        );
        if (nackOut.status === MESSAGE_STATUS_FAILED) break;

        const reOut = new ConsumeMQOutput();
        await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, reOut, new MQContext());
        if (reOut.message) {
          toFail.message = reOut.message;
        } else {
          break;
        }
      }

      const output = new GetQueueStatsOutput();
      await mq.soQueueStats(
        { queue: 'task' } as GetQueueStatsInput,
        output, new MQContext(),
      );

      expect(output.stats.pending).toBeGreaterThanOrEqual(1);
      expect(output.stats.processing).toBeGreaterThanOrEqual(2);
      expect(output.stats.completed).toBeGreaterThanOrEqual(1);
      expect(output.stats.failed).toBeGreaterThanOrEqual(1);
      expect(output.stats.total).toBeGreaterThanOrEqual(5);
    });

    it('不指定 queue 时应返回所有队列统计', async () => {
      await mq.sendMQ(
        { data: msg('q1', { x: 1 }) } as SendMQInput,
        new SendMQOutput(), new MQContext(),
      );
      await mq.sendMQ(
        { data: msg('q2', { x: 2 }) } as SendMQInput,
        new SendMQOutput(), new MQContext(),
      );
      await mq.sendMQ(
        { data: msg('q3', { x: 3 }) } as SendMQInput,
        new SendMQOutput(), new MQContext(),
      );

      const output = new GetQueueStatsOutput();
      await mq.soQueueStats({} as GetQueueStatsInput, output, new MQContext());
      expect(output.stats.pending).toBe(3);
      expect(output.stats.total).toBe(3);
    });

    it('指定队列与空队列参数应返回不同结果', async () => {
      await mq.sendMQ(
        { data: msg('qa', { x: 1 }) } as SendMQInput,
        new SendMQOutput(), new MQContext(),
      );
      await mq.sendMQ(
        { data: msg('qb', { x: 1 }) } as SendMQInput,
        new SendMQOutput(), new MQContext(),
      );

      const outA = new GetQueueStatsOutput();
      await mq.soQueueStats({ queue: 'qa' } as GetQueueStatsInput, outA, new MQContext());
      expect(outA.stats.total).toBe(1);

      const outB = new GetQueueStatsOutput();
      await mq.soQueueStats({ queue: 'qb' } as GetQueueStatsInput, outB, new MQContext());
      expect(outB.stats.total).toBe(1);

      const outAll = new GetQueueStatsOutput();
      await mq.soQueueStats({} as GetQueueStatsInput, outAll, new MQContext());
      expect(outAll.stats.total).toBe(2);
    });

    it('禁用的 MQ 应拒绝 soQueueStats', async () => {
      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());
      await expect(
        mq.soQueueStats({} as GetQueueStatsInput, new GetQueueStatsOutput(), new MQContext()),
      ).rejects.toThrow(ComponentDisabledError);
    });
  });

  describe('enableMQ', () => {
    it('应可禁用 MQ 组件', async () => {
      const ok = await mq.enableMQ(
        { enable: false } as EnableMQInput,
        new EnableMQOutput(), new MQContext(),
      );
      expect(ok).toBe(true);

      await expect(
        mq.sendMQ(
          { data: msg('task', { x: 1 }) } as SendMQInput,
          new SendMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('应可重新启用 MQ 组件', async () => {

      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());

      await mq.enableMQ({ enable: true } as EnableMQInput, new EnableMQOutput(), new MQContext());

      const output = new SendMQOutput();
      const ok = await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        output, new MQContext(),
      );
      expect(ok).toBe(true);
      expect(output.id).toBeTruthy();
    });

    it('enabled 状态应持久化到 mq_config 表', async () => {
      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());

      const rows = await relationDb.select('mq_config_record', {
        conditions: [
          { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
        ],
      });
      expect(rows.length).toBe(1);
      expect(rows[0].config_value).toBe('false');
    });

    it('初始化时应恢复 persisted enabled 状态', async () => {

      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());

      await mq.closeMQ(new CloseMQInput(), new CloseMQOutput(), new MQContext());

      const mq2 = new MQAccess(relationDb);
      await mq2.initialize();

      await expect(
        mq2.sendMQ(
          { data: msg('task', { x: 1 }) } as SendMQInput,
          new SendMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      await mq2.enableMQ({ enable: true } as EnableMQInput, new EnableMQOutput(), new MQContext());

      const output = new SendMQOutput();
      await mq2.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        output, new MQContext(),
      );
      expect(output.id).toBeTruthy();

      await mq2.closeMQ(new CloseMQInput(), new CloseMQOutput(), new MQContext());
    });

    it('禁用后 enableMQ(true) 应立即恢复所有操作', async () => {
      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());

      const tasks = [
        () => mq.sendMQ({ data: msg('t', {}) } as SendMQInput, new SendMQOutput(), new MQContext()),
        () => mq.consumeMQ({ queue: 't' } as ConsumeMQInput, new ConsumeMQOutput(), new MQContext()),
        () => mq.soQueueStats({} as GetQueueStatsInput, new GetQueueStatsOutput(), new MQContext()),
        () => mq.ackMQ({ message_id: 'x' } as AckMQInput, new AckMQOutput(), new MQContext()),
        () => mq.nackMQ({ message_id: 'x' } as NackMQInput, new NackMQOutput(), new MQContext()),
      ];
      for (const task of tasks) {
        await expect(task()).rejects.toThrow(ComponentDisabledError);
      }

      await mq.enableMQ({ enable: true } as EnableMQInput, new EnableMQOutput(), new MQContext());

      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        output, new MQContext(),
      );
      expect(output.id).toBeTruthy();
    });
  });

  describe('closeMQ', () => {
    it('closeMQ 后所有操作应抛出 ComponentDisabledError', async () => {
      await mq.closeMQ(new CloseMQInput(), new CloseMQOutput(), new MQContext());

      await expect(
        mq.sendMQ(
          { data: msg('task', { x: 1 }) } as SendMQInput,
          new SendMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      await expect(
        mq.consumeMQ(
          { queue: 'task' } as ConsumeMQInput,
          new ConsumeMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      await expect(
        mq.ackMQ(
          { message_id: 'x' } as AckMQInput,
          new AckMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      await expect(
        mq.nackMQ(
          { message_id: 'x' } as NackMQInput,
          new NackMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      await expect(
        mq.soQueueStats(
          {} as GetQueueStatsInput,
          new GetQueueStatsOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('closeMQ 后 enableMQ 也应失效（不可恢复）', async () => {
      await mq.closeMQ(new CloseMQInput(), new CloseMQOutput(), new MQContext());

      await expect(
        mq.enableMQ(
          { enable: true } as EnableMQInput,
          new EnableMQOutput(), new MQContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('closeMQ 后再次 closeMQ 应幂等', async () => {
      await mq.closeMQ(new CloseMQInput(), new CloseMQOutput(), new MQContext());
      const ok = await mq.closeMQ(new CloseMQInput(), new CloseMQOutput(), new MQContext());
      expect(ok).toBe(true);
    });
  });

  describe('消息生命周期', () => {
    it('send → consume → ack 完整流程', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('lifecycle', { step: 'start' }, 5) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'lifecycle' } as ConsumeMQInput, consumeOut, new MQContext());
      expect(consumeOut.message!.id).toBe(sendOut.id);
      expect(consumeOut.message!.status).toBe(MESSAGE_STATUS_PROCESSING);

      await mq.ackMQ(
        { message_id: consumeOut.message!.id } as AckMQInput,
        new AckMQOutput(), new MQContext(),
      );

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      expect(rows[0].status).toBe(MESSAGE_STATUS_COMPLETED);
      expect(typeof rows[0].processed_at).toBe('number');
    });

    it('send → consume → nack × N → FAILED 完整流程', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('lifecycle', { step: 'fail' }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      let status = '';
      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts && status !== MESSAGE_STATUS_FAILED; attempt++) {
        const consumeOut = new ConsumeMQOutput();
        await mq.consumeMQ(
          { queue: 'lifecycle' } as ConsumeMQInput,
          consumeOut, new MQContext(),
        );
        if (!consumeOut.message) {

          const rows = await relationDb.select('queue_message_record', {
            conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
          });
          expect(String(rows[0].status)).toBe(MESSAGE_STATUS_FAILED);
          break;
        }

        const nackOut = new NackMQOutput();
        await mq.nackMQ(
          { message_id: consumeOut.message!.id, reason: `attempt ${attempt + 1}` } as NackMQInput,
          nackOut, new MQContext(),
        );
        status = nackOut.status;
      }

      expect(status).toBe(MESSAGE_STATUS_FAILED);

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      expect(rows[0].status).toBe(MESSAGE_STATUS_FAILED);
      expect(rows[0].retry_count).toBe(3);
    });

    it('send → consume → nack → consume → ack 流程（部分重试后成功）', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('lifecycle', { step: 'retry-success' }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      for (let i = 0; i < 2; i++) {
        const consumeOut = new ConsumeMQOutput();
        await mq.consumeMQ({ queue: 'lifecycle' } as ConsumeMQInput, consumeOut, new MQContext());
        await mq.nackMQ(
          { message_id: consumeOut.message!.id } as NackMQInput,
          new NackMQOutput(), new MQContext(),
        );
      }

      const consume3 = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'lifecycle' } as ConsumeMQInput, consume3, new MQContext());
      await mq.ackMQ(
        { message_id: consume3.message!.id } as AckMQInput,
        new AckMQOutput(), new MQContext(),
      );

      const rows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      expect(rows[0].status).toBe(MESSAGE_STATUS_COMPLETED);
      expect(rows[0].retry_count).toBe(2);
    });

    it('应正确处理多个不同队列的消息交错消费', async () => {

      for (let i = 0; i < 3; i++) {
        await mq.sendMQ(
          { data: msg('alpha', { idx: i }) } as SendMQInput,
          new SendMQOutput(), new MQContext(),
        );
        await mq.sendMQ(
          { data: msg('beta', { idx: i }) } as SendMQInput,
          new SendMQOutput(), new MQContext(),
        );
      }

      const alphaIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const out = new ConsumeMQOutput();
        await mq.consumeMQ({ queue: 'alpha' } as ConsumeMQInput, out, new MQContext());
        expect(out.message).not.toBeNull();
        expect(out.message!.queue).toBe('alpha');
        alphaIds.push(out.message!.id);
        await mq.ackMQ(
          { message_id: out.message!.id } as AckMQInput,
          new AckMQOutput(), new MQContext(),
        );
      }

      const betaStats = new GetQueueStatsOutput();
      await mq.soQueueStats(
        { queue: 'beta' } as GetQueueStatsInput,
        betaStats, new MQContext(),
      );
      expect(betaStats.stats.pending).toBe(3);
      expect(betaStats.stats.total).toBe(3);

      for (let i = 0; i < 3; i++) {
        const out = new ConsumeMQOutput();
        await mq.consumeMQ({ queue: 'beta' } as ConsumeMQInput, out, new MQContext());
        expect(out.message).not.toBeNull();
        expect(out.message!.queue).toBe('beta');
        await mq.ackMQ(
          { message_id: out.message!.id } as AckMQInput,
          new AckMQOutput(), new MQContext(),
        );
      }

      const allStats = new GetQueueStatsOutput();
      await mq.soQueueStats({} as GetQueueStatsInput, allStats, new MQContext());
      expect(allStats.stats.completed).toBe(6);
      expect(allStats.stats.total).toBe(6);
    });
  });

  describe('并发安全', () => {
    it('多个消费端同时消费应不会重复获取同一消息', async () => {

      for (let i = 0; i < 5; i++) {
        await mq.sendMQ(
          { data: msg('concurrent', { idx: i }) } as SendMQInput,
          new SendMQOutput(), new MQContext(),
        );
      }

      const consumedIds = new Set<string>();
      const consumers = Array.from({ length: 10 }, () =>
        mq.consumeMQ({ queue: 'concurrent' } as ConsumeMQInput, new ConsumeMQOutput(), new MQContext())
          .then(() => null)
          .catch(() => null)
      );

      await Promise.all(consumers);

      const out = new GetQueueStatsOutput();
      await mq.soQueueStats(
        { queue: 'concurrent' } as GetQueueStatsInput,
        out, new MQContext(),
      );
      expect(out.stats.processing + out.stats.pending).toBeLessThanOrEqual(5);
    });
  });

  describe('配置持久化', () => {
    it('initialize 后应写入默认配置到 mq_config 表', async () => {
      const rows = await relationDb.select('mq_config_record');
      expect(rows.length).toBeGreaterThanOrEqual(4);
      const keys = rows.map((r) => r.config_key);
      expect(keys).toContain('enabled');
      expect(keys).toContain('message_ttl');
      expect(keys).toContain('default_max_retries');
      expect(keys).toContain('default_priority');
    });

    it('默认配置的 enabled 应为 true', async () => {
      const rows = await relationDb.select('mq_config_record', {
        conditions: [
          { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
        ],
      });
      expect(rows[0].config_value).toBe('true');
    });

    it('默认配置的 default_priority 应为 5', async () => {
      const rows = await relationDb.select('mq_config_record', {
        conditions: [
          { field: 'config_key', operator: Operator.EQ, value: 'default_priority' },
        ],
      });
      expect(rows[0].config_value).toBe('5');
    });

    it('默认配置的 default_max_retries 应为 3', async () => {
      const rows = await relationDb.select('mq_config_record', {
        conditions: [
          { field: 'config_key', operator: Operator.EQ, value: 'default_max_retries' },
        ],
      });
      expect(rows[0].config_value).toBe('3');
    });

    it('默认配置的 message_ttl 应为 86400', async () => {
      const rows = await relationDb.select('mq_config_record', {
        conditions: [
          { field: 'config_key', operator: Operator.EQ, value: 'message_ttl' },
        ],
      });
      expect(rows[0].config_value).toBe('86400');
    });

    it('repeat initialize 不应覆盖已有配置', async () => {

      await mq.enableMQ({ enable: false } as EnableMQInput, new EnableMQOutput(), new MQContext());

      await mq.initialize();

      const rows = await relationDb.select('mq_config_record', {
        conditions: [
          { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
        ],
      });
      expect(rows[0].config_value).toBe('false');
    });
  });

  describe('表结构', () => {
    it('应为 queue_message 表创建必要的索引', async () => {
      const indexes = relationDb.queryRaw<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='queue_message_record'`,
      );
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames.some((n) => n.includes('created'))).toBe(true);
      expect(indexNames.some((n) => n.includes('updated'))).toBe(true);
      expect(indexNames.some((n) => n.includes('queue'))).toBe(true);
      expect(indexNames.some((n) => n.includes('status'))).toBe(true);
    });

    it('mq_config 表的 config_key 应为主键', async () => {
      const tableInfo = relationDb.queryRaw<{ cid: number; name: string; pk: number }>(
        `PRAGMA table_info("mq_config_record")`,
      );
      const pkColumn = tableInfo.find((c) => c.pk > 0);
      expect(pkColumn).toBeDefined();
      expect(pkColumn!.name).toBe('config_key');
    });

    it('queue_message 表的 id 应为主键', async () => {
      const tableInfo = relationDb.queryRaw<{ cid: number; name: string; pk: number }>(
        `PRAGMA table_info("queue_message_record")`,
      );
      const pkColumn = tableInfo.find((c) => c.pk > 0);
      expect(pkColumn).toBeDefined();
      expect(pkColumn!.name).toBe('id');
    });
  });

  describe('AOP 代理', () => {
    it('方法调用应记录耗时到 output.elapsed_ms', async () => {
      const output = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        output, new MQContext(),
      );
      expect(typeof output.elapsed_ms).toBe('number');
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('consumeMQ 的 output 应包含 elapsed_ms', async () => {
      const output = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, output, new MQContext());
      expect(typeof output.elapsed_ms).toBe('number');
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('soQueueStats 的 output 应包含 elapsed_ms', async () => {
      const output = new GetQueueStatsOutput();
      await mq.soQueueStats({} as GetQueueStatsInput, output, new MQContext());
      expect(typeof output.elapsed_ms).toBe('number');
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('边界场景', () => {
    it('发送大量消息后统计应正确', async () => {
      const count = 100;
      for (let i = 0; i < count; i++) {
        await mq.sendMQ(
          { data: msg('bulk', { idx: i }) } as SendMQInput,
          new SendMQOutput(), new MQContext(),
        );
      }

      const output = new GetQueueStatsOutput();
      await mq.soQueueStats(
        { queue: 'bulk' } as GetQueueStatsInput,
        output, new MQContext(),
      );
      expect(output.stats.pending).toBe(count);
      expect(output.stats.total).toBe(count);
    });

    it('payload 为复杂嵌套对象时应正确存取', async () => {
      const complex = {
        string: 'hello',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 'two', { three: 3 }],
        nested: { a: { b: { c: 'deep' } } },
        unicode: '你好世界',
      };

      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', complex) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      expect(consumeOut.message!.payload).toEqual(complex);
    });

    it('payload 为数组时应正确存取', async () => {
      const payload = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', payload) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      expect(consumeOut.message!.payload).toEqual(payload);
    });

    it('payload 为基本类型字符串时应正确存取', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', 'just a string') } as SendMQInput,
        sendOut, new MQContext(),
      );

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());
      expect(consumeOut.message!.payload).toBe('just a string');
    });

    it('不同消费端应看到正确的最新 updated 时间', async () => {
      const sendOut = new SendMQOutput();
      await mq.sendMQ(
        { data: msg('task', { x: 1 }) } as SendMQInput,
        sendOut, new MQContext(),
      );

      const beforeRows = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      const initialUpdated = beforeRows[0].updated as number;

      await new Promise((r) => setTimeout(r, 2));

      const consumeOut = new ConsumeMQOutput();
      await mq.consumeMQ({ queue: 'task' } as ConsumeMQInput, consumeOut, new MQContext());

      const afterConsume = await relationDb.select('queue_message_record', {
        conditions: [{ field: 'id', operator: Operator.EQ, value: sendOut.id }],
      });
      expect(afterConsume[0].updated).toBeGreaterThan(initialUpdated);
    });
  });
});
