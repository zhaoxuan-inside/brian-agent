/**
 * @fileoverview EventBus 模块单元测试（Runtime v2 · 阶段1）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess } from '@brian-agent/base';
import { EventBusAccess } from '../Bus/access/EventBusAccess';
import {
  EventBusContext,
  PublishEventInput,
  PublishEventOutput,
  SoEventReplayInput,
  SoEventReplayOutput,
  RegisterProjectionInput,
  RegisterProjectionOutput,
  UnregisterProjectionInput,
  UnregisterProjectionOutput,
} from '../Bus/domain/types';

describe('EventBus', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let eventBus: EventBusAccess;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-bus-test-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    eventBus = new EventBusAccess(relationDb);
    await eventBus.initialize();
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 50));
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 清理失败忽略 */ }
  });

  async function publish(sessionKey: string, type: PublishEventInput['type'], payload: unknown, runId?: string): Promise<number> {
    const input = new PublishEventInput();
    input.session_key = sessionKey;
    input.type = type;
    input.payload = payload;
    input.run_id = runId;
    const output = new PublishEventOutput();
    await eventBus.publishEvent(input, output, new EventBusContext());
    return output.seq;
  }

  it('publishEvent 应该保证 seq 单调并持久化', async () => {
    const seqs: number[] = [];
    for (let i = 0; i < 3; i++) {
      seqs.push(await publish('sess-a', 'part.delta', { delta: String(i) }, 'run-1'));
    }
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('soEventReplay 应该按 seq 升序重放并支持 after_seq 游标与类型过滤', async () => {
    await publish('sess-a', 'part.delta', { d: 1 });
    await publish('sess-a', 'tool.launch', { t: 1 });
    await publish('sess-a', 'part.delta', { d: 2 });
    const replay = new SoEventReplayInput();
    replay.session_key = 'sess-a';
    replay.after_seq = 0;
    replay.types = ['part.delta'];
    const out = new SoEventReplayOutput();
    await eventBus.soEventReplay(replay, out, new EventBusContext());
    expect(out.events.map((e) => e.seq)).toEqual([1, 3]);
    expect(out.last_seq).toBe(3);
    expect(out.events.map((e) => (e.payload as { d: number }).d)).toEqual([1, 2]);
  });

  it('registerProjection 应该先重放再尾随（durable 无缝拼接）', async () => {
    await publish('sess-a', 'run.accepted', { run: 1 });
    await publish('sess-a', 'run.status', { phase: 'start' });
    const received: Array<{ seq: number; type: string }> = [];
    const register = new RegisterProjectionInput();
    register.session_key = 'sess-a';
    register.deliver = (event) => received.push({ seq: event.seq, type: event.type });
    const regOut = new RegisterProjectionOutput();
    await eventBus.registerProjection(register, regOut, new EventBusContext());
    expect(regOut.last_seq).toBe(2);
    // 重放已完成历史
    expect(received.map((r) => r.type)).toEqual(['run.accepted', 'run.status']);
    // 直播续推新事件
    await publish('sess-a', 'run.status', { phase: 'end' });
    expect(received.map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it('断线重连应该以 last_seq 为起点重放且不丢不重', async () => {
    await publish('sess-a', 'run.accepted', { run: 1 });
    await publish('sess-a', 'run.status', { phase: 'start' });
    const received: number[] = [];
    const register = new RegisterProjectionInput();
    register.session_key = 'sess-a';
    register.after_seq = 1;
    register.deliver = (event) => received.push(event.seq);
    const regOut = new RegisterProjectionOutput();
    await eventBus.registerProjection(register, regOut, new EventBusContext());
    expect(received).toEqual([2]);
    expect(regOut.last_seq).toBe(2);
  });

  it('订阅端投递失败应该不中断发布方（写库保底）', async () => {
    const register = new RegisterProjectionInput();
    register.session_key = 'sess-b';
    register.deliver = () => {
      throw new Error('client gone');
    };
    const regOut = new RegisterProjectionOutput();
    await eventBus.registerProjection(register, regOut, new EventBusContext());
    const seq = await publish('sess-b', 'part.delta', { d: 1 });
    expect(seq).toBe(1);
    // 修复后重连仍可完整重放
    const fixedReceived: number[] = [];
    const reRegister = new RegisterProjectionInput();
    reRegister.session_key = 'sess-b';
    reRegister.deliver = (event) => fixedReceived.push(event.seq);
    const reOut = new RegisterProjectionOutput();
    await eventBus.registerProjection(reRegister, reOut, new EventBusContext());
    expect(fixedReceived).toEqual([1]);
  });

  it('unregisterProjection 应该幂等释放并停止投递', async () => {
    const received: number[] = [];
    const register = new RegisterProjectionInput();
    register.session_key = 'sess-c';
    register.deliver = (event) => received.push(event.seq);
    const regOut = new RegisterProjectionOutput();
    await eventBus.registerProjection(register, regOut, new EventBusContext());
    const un = new UnregisterProjectionInput();
    un.subscription_id = regOut.subscription_id;
    const unOut = new UnregisterProjectionOutput();
    await eventBus.unregisterProjection(un, unOut, new EventBusContext());
    expect(unOut.released).toBe(true);
    await eventBus.unregisterProjection(un, unOut, new EventBusContext());
    expect(unOut.released).toBe(false);
    await publish('sess-c', 'run.accepted', { run: 1 });
    expect(received).toEqual([]);
  });
});
