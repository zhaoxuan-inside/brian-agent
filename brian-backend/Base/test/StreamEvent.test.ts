import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess, Report } from '@brian-agent/base';
import { StreamAccess } from '../StreamProvider/access/StreamAccess';
import { RegisterStreamInput, RegisterStreamOutput, StreamContext } from '../StreamProvider/domain/types';
import { ObservabilityAccess } from '../ObservabilityProvider/access/ObservabilityAccess';

/** ADR-013：观测总线端到端 —— Report.emit → Dispatcher →(SSE 帧 / task_event_record / run_state) */
describe('Observability 事件总线（Report.emit 落库 + SSE 帧投递）', () => {
  let tempDir: string;
  let relationDb: RelationDBAccess;
  let streamAccess: StreamAccess;
  let frames: string[];
  let observability: ObservabilityAccess;

  beforeEach(async () => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-stream-event-'));
    relationDb = new RelationDBAccess({ dbPath: path.join(tempDir, 'test.db'), autoCreateConfigTable: true });
    await relationDb.initialize();
    frames = [];
    streamAccess = new StreamAccess(relationDb);
    observability = new ObservabilityAccess(relationDb);
    observability.setFrameWriter((sessionId, endpointId, ev) => streamAccess.pushFrame(sessionId, endpointId, ev));
    Report.setEventGateway({
      emit: (meta, type, payload) => {
        observability.emit(meta, type, payload);
      },
      flush: () => observability.flush(),
    });
  });

  afterEach(async () => {
    Report.setEventGateway(null);
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {  }
  });

  async function makeEndpoint(sessionId: string): Promise<string> {
    const out = new RegisterStreamOutput();
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), { session_id: sessionId, writer: (chunk: string) => { frames.push(chunk); return true; } }),
      out,
      new StreamContext(),
    );
    return out.endpoint_id;
  }

  it('report.emit 应落库事件并按端点 ID 投递 SSE 帧（data=完整 TaskEvent）', async () => {
    const sessionId = 'sess-stream';
    const endpointId = await makeEndpoint(sessionId);
    const report = new Report({ session_id: sessionId, run_id: 'run-1', stream_endpoint_id: endpointId });

    report.emit('run.accepted', { run_id: 'run-1' });
    report.emit('reply.delta', { delta: '你好' });
    await observability.flush();

    const rows = relationDb.queryRaw<{ event_type: string; seq: number }>(
      'SELECT "event_type", "seq" FROM "task_event_record" WHERE "run_id" = ? ORDER BY "seq" ASC',
      ['run-1'],
    );
    expect(rows.map((r) => r.event_type)).toEqual(['run.accepted', 'reply.delta']);
    expect(rows[1].seq).toBe(2);

    const deltaFrame = frames.find((f) => f.includes('"reply.delta"'));
    expect(deltaFrame).toBeTruthy();
    expect(deltaFrame).toContain('你好');
    const frameData = JSON.parse(deltaFrame!.replace(/^data: /, '').trim());
    expect(frameData.data.type).toBe('reply.delta');
    expect(frameData.data.seq).toBe(2);
    expect(frames.some((f) => f.includes('"run.accepted"'))).toBe(true);
  });

  it('flush 后读侧可见：run_state 随 lifecycle/llm 事件直更', async () => {
    const report = new Report({ session_id: 'sess-state', run_id: 'run-state' });
    report.emit('run.accepted', { run_id: 'run-state' });
    report.emit('llm.invoked', { llm_id: 'llm-1', input_tokens: 10, output_tokens: 5, duration_ms: 100, status: 'ok' });
    report.emit('run.finished', { stop_reason: 'stop' });
    await observability.flush();

    const state = relationDb.queryRaw<{ phase: string; tokens_in: number; tokens_out: number }>(
      'SELECT "phase", "tokens_in", "tokens_out" FROM "run_state_record" WHERE "id" = ?',
      ['run-state'],
    );
    expect(state[0].phase).toBe('settled');
    expect(state[0].tokens_in).toBe(10);
    expect(state[0].tokens_out).toBe(5);
  });

  it('未携带端点的 Report 保持 no-op；端点不存在时事件仅持久化', async () => {
    const bare = new Report({ session_id: 'sess-bare', run_id: 'run-bare' });
    expect(() => bare.emit('run.accepted', {})).not.toThrow();
    expect(frames).toHaveLength(0);

    const report = new Report({ session_id: 'sess-gone', run_id: 'run-gone', stream_endpoint_id: 'not-registered' });
    report.emit('run.accepted', { run_id: 'run-gone' });
    await observability.flush();
    const rows = relationDb.queryRaw<{ id: string }>(
      'SELECT "id" FROM "task_event_record" WHERE "run_id" = ?',
      ['run-gone'],
    );
    expect(rows.length).toBe(1);
  });

  it('事件载荷经 parsePayload 归一（缺省字段补默认，未知字段保留）', async () => {
    const report = new Report({ session_id: 'sess-parse', run_id: 'run-parse' });
    report.emit('llm.invoked', { llm_id: 'llm-x' });
    await observability.flush();
    const row = relationDb.queryRaw<{ payload_json: string }>(
      'SELECT "payload_json" FROM "task_event_record" WHERE "run_id" = ? AND "event_type" = ?',
      ['run-parse', 'llm.invoked'],
    );
    const payload = JSON.parse(row[0].payload_json) as Record<string, unknown>;
    expect(payload.input_tokens).toBe(0);
    expect(payload.status).toBe('ok');
  });
});
