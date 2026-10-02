import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess } from '@brian-agent/base';
import { StreamAccess } from '../StreamProvider/access/StreamAccess';
import {
  RegisterStreamInput,
  RegisterStreamOutput,
  CloseStreamInput,
  CloseStreamOutput,
  StreamContext,
} from '../StreamProvider/domain/types';
import { makeTaskEvent, type TaskEvent } from '@brian-agent/shared';

/** ADR-013：StreamProvider 瘦身为纯传输 —— 注册/写帧/心跳/关闭 */
describe('StreamProvider', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let streamAccess: StreamAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-stream-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    streamAccess = new StreamAccess(relationDb);
  });

  afterEach(async () => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {  }
  });

  function frameOf(type: string, seq: number, payload: Record<string, unknown>): TaskEvent {
    return makeTaskEvent({ seq, ts: Date.now(), session_id: 's-1', run_id: 'run-1', type, payload });
  }

  it('pushFrame 按端点定位会话并直写 TaskEvent 帧', async () => {
    const frames: string[] = [];
    const out = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), {
        session_id: 's-1',
        writer: (chunk: string) => { frames.push(chunk); return true; },
      }),
      out,
      new StreamContext(),
    );

    const delivered = streamAccess.pushFrame('s-1', out.endpoint_id, frameOf('run.accepted', 1, { run_id: 'run-1' }));
    expect(delivered).toBe(true);
    expect(frames).toHaveLength(1);
    const parsed = JSON.parse(frames[0].replace(/^data: /, '').trim());
    expect(parsed.event).toBe('run.accepted');
    expect(parsed.data.seq).toBe(1);
  });

  it('端点不存在或会话关闭时投递失败（不抛错）', async () => {
    expect(streamAccess.pushFrame('s-x', 'no-endpoint', frameOf('run.accepted', 1, {}))).toBe(false);

    const frames: string[] = [];
    const out = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), {
        session_id: 's-closed',
        writer: (chunk: string) => { frames.push(chunk); return true; },
      }),
      out,
      new StreamContext(),
    );
    await streamAccess.closeStream(
      Object.assign(new CloseStreamInput(), { session_id: 's-closed', reason: 'test' }),
      new CloseStreamOutput(),
      new StreamContext(),
    );
    expect(streamAccess.pushFrame('s-closed', out.endpoint_id, frameOf('run.accepted', 2, {}))).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it('writer 返回 false 触发会话关闭', async () => {
    const out = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: 's-fail', writer: () => false }),
      out,
      new StreamContext(),
    );
    streamAccess.pushFrame('s-fail', out.endpoint_id, frameOf('run.accepted', 1, {}));
    const stats = { active_sessions_count: 0, active_sessions: [] as string[] };
    const statsOut = Object.assign(Object.create(Object.getPrototypeOf(stats)), stats);
    await streamAccess.soStreamStats(statsOut as never, statsOut as never, new StreamContext());
    expect(statsOut.active_sessions).toHaveLength(0);
  });

  it('重复注册同会话会替换旧连接', async () => {
    const out1 = new RegisterStreamOutput();
    const out2 = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: 's-replace', writer: () => true }),
      out1,
      new StreamContext(),
    );
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: 's-replace', writer: () => true }),
      out2,
      new StreamContext(),
    );
    expect(streamAccess.pushFrame('s-replace', out1.endpoint_id, frameOf('run.accepted', 1, {}))).toBe(false);
    expect(streamAccess.pushFrame('s-replace', out2.endpoint_id, frameOf('run.accepted', 1, {}))).toBe(true);
  });
});
