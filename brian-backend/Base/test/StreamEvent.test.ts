/**
 * @fileoverview StreamProvider 事件流单测（Report 携带端点 ID 的上报语义）。
 *
 * 验证（2026-09-05 职责划分）：Report 只接收业务的消息并携带 SSE 端点 ID；
 * 保存（stream_event 持久化/审计）、断线恢复重放、按端点 ID 定位 SSE 连接投递
 * 全部由 StreamProvider 承载。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess, Report } from '@brian-agent/base';
import { StreamAccess } from '../StreamProvider/access/StreamAccess';
import {
  RegisterStreamInput,
  RegisterStreamOutput,
  PushEventToEndpointInput,
  PushEventToEndpointOutput,
  ReplayEndpointEventsInput,
  ReplayEndpointEventsOutput,
  StreamContext,
} from '../StreamProvider/domain/types';

describe('StreamProvider 事件流（Report 携带端点 ID）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let streamAccess: StreamAccess;
  let frames: string[];

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-stream-event-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    frames = [];
    streamAccess = new StreamAccess(relationDb);
    // 组合根语义：Report 事件流网关指向 StreamProvider
    Report.setEventStreamGateway({
      pushToEndpoint: async (input) => {
        await streamAccess.publishEvent(
          Object.assign(new PushEventToEndpointInput(), input),
          new PushEventToEndpointOutput(),
          new StreamContext(),
        );
      },
    });
  });

  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 30));
    Report.setEventStreamGateway(null);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 清理失败忽略 */ }
  });

  async function makeEndpoint(sessionKey: string): Promise<string> {
    const out = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: sessionKey, writer: (chunk: string) => { frames.push(chunk); return true; } }),
      out,
      new StreamContext(),
    );
    return out.endpoint_id;
  }

  it('report.pushBusinessEvent 应持久化事件并按端点 ID 投递 SSE 帧（v2 原生帧）', async () => {
    const sessionKey = 'sess-stream';
    const endpointId = await makeEndpoint(sessionKey);
    const report = new Report({ session_id: sessionKey, session_key: sessionKey, stream_endpoint_id: endpointId });

    report.pushBusinessEvent('run.accepted' as never, { run_id: 'run-1' });
    report.pushBusinessEvent('reply.delta' as never, { delta: '你好' });
    await new Promise((r) => setTimeout(r, 80));

    // 持久化（审计事实源）
    const rows = relationDb.queryRaw<{ event_type: string; seq: number }>(
      'SELECT "event_type", "seq" FROM "stream_event" WHERE "session_key" = ? ORDER BY "seq" ASC',
      [sessionKey],
    );
    expect(rows.map((r) => r.event_type)).toEqual(['run.accepted', 'reply.delta']);

    // 在线投递：v2 原生帧（event = BusinessEvent 协议名，全事件产帧）
    const deltaFrame = frames.find((f) => f.includes('"reply.delta"'));
    expect(deltaFrame).toBeTruthy();
    expect(deltaFrame).toContain('你好');
    expect(frames.some((f) => f.includes('"run.accepted"'))).toBe(true);
  });

  it('replayEvents 应按 seq 升序重放事件到端点（断线恢复）', async () => {
    const sessionKey = 'sess-replay';
    // 预置历史事件（经网关落库；端点未注册 → 仅持久化）
    const report = new Report({ session_id: sessionKey, session_key: sessionKey, stream_endpoint_id: 'gone-endpoint' });
    report.pushBusinessEvent('run.accepted' as never, { run_id: 'r1' });
    report.pushBusinessEvent('reply.delta' as never, { delta: '历史' });
    await new Promise((r) => setTimeout(r, 80));

    // 新端点接入（模拟重连）：重放全部历史
    const endpointId = await makeEndpoint(sessionKey);
    const out = new ReplayEndpointEventsOutput();
    await streamAccess.replayEvents(
      Object.assign(new ReplayEndpointEventsInput(), { endpoint_id: endpointId, session_key: sessionKey, after_seq: 0 }),
      out,
      new StreamContext(),
    );
    expect(out.replayed).toBe(2);
    expect(out.last_seq).toBe(2);
    // v2 原生帧：全部事件按协议名投递
    expect(frames.some((f) => f.includes('"run.accepted"'))).toBe(true);
    expect(frames.some((f) => f.includes('历史'))).toBe(true);
  });

  it('未携带端点 ID 的 Report 保持 no-op；端点不存在时事件仅持久化', async () => {
    const bare = new Report({ session_id: 'sess-bare' });
    expect(() => bare.pushBusinessEvent('run.accepted' as never, {})).not.toThrow();
    expect(frames).toHaveLength(0);

    const report = new Report({ session_id: 'sess-gone', session_key: 'sess-gone', stream_endpoint_id: 'not-registered' });
    report.pushBusinessEvent('run.accepted' as never, { run_id: 'r2' });
    await new Promise((r) => setTimeout(r, 60));
    const rows = relationDb.queryRaw<{ id: string }>(
      'SELECT "id" FROM "stream_event" WHERE "session_key" = ?',
      ['sess-gone'],
    );
    expect(rows.length).toBe(1); // 仅持久化（审计），无端点投递
  });
});
