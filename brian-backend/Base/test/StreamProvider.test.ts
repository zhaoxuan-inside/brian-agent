/**
 * @fileoverview StreamProvider 单元测试。
 *
 * 覆盖：
 * - registerStream / closeStream 生命周期管理
 * - 结构化 BrianSSEMessage 协议各字段检验
 * - 单会话序列号 (seq) 单调递增
 * - 打字机 chunking 分片 (2-5 字符) 及累加长度
 * - 多 Agent 并发通道隔离
 * - 配置查询与更新
 */

import { Metrics } from '../shared/base/Metrics';
import { Report } from '../shared/base/Report';
import { describe, it, expect, beforeEach } from 'vitest';
import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { StreamAccess } from '../StreamProvider/access/StreamAccess';
import {
  StreamContext,
  RegisterStreamInput,
  RegisterStreamOutput,
  PushStreamInput,
  PushStreamOutput,
  CloseStreamInput,
  CloseStreamOutput,
  ConfigStreamInput,
  ConfigStreamOutput,
  BrianSSEMessage,
} from '../StreamProvider/domain/types';

describe('StreamProvider', () => {
  let db: RelationDBAccess;
  let streamAccess: StreamAccess;

  beforeEach(async () => {
    db = new RelationDBAccess({ dbPath: ':memory:', wal: false });
    await db.initialize();
    streamAccess = new StreamAccess(db);
  });

  it('注册与关闭 SSE 连接', async () => {
    const received: string[] = [];
    const regIn = Object.assign(new RegisterStreamInput(), {
      session_id: 'session-1',
      writer: (chunk: string) => { received.push(chunk); },
    });
    const regOut = new RegisterStreamOutput();
    const ok = await streamAccess.registerStream(regIn, regOut, new StreamContext());

    expect(ok).toBe(true);
    expect(regOut.registered).toBe(true);
    expect(regOut.client_id).toBe('session-1');

    const closeIn = Object.assign(new CloseStreamInput(), { session_id: 'session-1' });
    const closeOut = new CloseStreamOutput();
    await streamAccess.closeStream(closeIn, closeOut, new StreamContext());
    expect(closeOut.closed).toBe(true);
  });

  it('推送结构化 BrianSSEMessage 消息', async () => {
    const frames: BrianSSEMessage[] = [];
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), {
        session_id: 's-100',
        writer: (chunk: string) => {
          if (chunk.startsWith('data: ')) {
            frames.push(JSON.parse(chunk.slice(6).trim()));
          }
        },
      }),
      new RegisterStreamOutput(), new StreamContext(),
    );

    // 推送结构化事件
    await streamAccess.pushEvent('s-100', 'context_build', 'CONTEXT', {
      recent_works_count: 3,
      user_profile_matched: true,
    }, {
      run_id: 'interact-1',
      work_id: 'work-1',
    });

    expect(frames.length).toBe(1);
    const msg = frames[0];
    expect(msg.session_id).toBe('s-100');
    expect(msg.run_id).toBe('interact-1');
    expect(msg.work_id).toBe('work-1');
    expect(msg.event).toBe('context_build');
    expect(msg.msg_type).toBe('CONTEXT');
    expect(msg.seq).toBe(0);
    expect(msg.data).toEqual({ recent_works_count: 3, user_profile_matched: true });
  });

  it('文本打字机 2-5 字符分片与 seq 严格递增', async () => {
    const frames: BrianSSEMessage<{ chunk: string; is_last_chunk: boolean }>[] = [];
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), {
        session_id: 's-200',
        writer: (chunk: string) => {
          if (chunk.startsWith('data: ')) {
            frames.push(JSON.parse(chunk.slice(6).trim()));
          }
        },
      }),
      new RegisterStreamOutput(), new StreamContext(),
    );

    const testText = '通用人工智能（AGI）是指具有与人类相当或超越人类智力水平的机器智能。';
    await streamAccess.pushText('s-200', 'text_chunk', testText, {
      run_id: 'i-200',
      work_id: 'w-200',
      agent_id: 'writer-1',
    });

    expect(frames.length).toBeGreaterThan(1);

    // 验证所有分片拼接还原完整文本
    const reconstructed = frames.map(f => f.data.chunk).join('');
    expect(reconstructed).toBe(testText);

    // 验证每个分片长度在 2-5 字符范围内（最后可能剩 1-5 字符）
    for (let i = 0; i < frames.length - 1; i++) {
      expect(frames[i].data.chunk.length).toBeGreaterThanOrEqual(2);
      expect(frames[i].data.chunk.length).toBeLessThanOrEqual(5);
    }

    // 验证 seq 严格连续自增
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i].seq).toBe(i);
      expect(frames[i].agent_id).toBe('writer-1');
    }

    // 最后一帧 is_last_chunk 必须为 true
    expect(frames[frames.length - 1].data.is_last_chunk).toBe(true);
  });

  it('多 Agent 并发推送时通道与标识隔离', async () => {
    const frames: BrianSSEMessage<{ chunk: string }>[] = [];
    await streamAccess.registerStream(
      Object.assign(new RegisterStreamInput(), {
        session_id: 's-multi',
        writer: (chunk: string) => {
          if (chunk.startsWith('data: ')) {
            frames.push(JSON.parse(chunk.slice(6).trim()));
          }
        },
      }),
      new RegisterStreamOutput(), new StreamContext(),
    );

    // 并发推送两个不同 Agent 的思考
    await Promise.all([
      streamAccess.pushText('s-multi', 'agent_thinking', 'AgentA正在分析代码结构', {
        work_id: 'w-dag',
        agent_id: 'agent-A',
      }),
      streamAccess.pushText('s-multi', 'agent_thinking', 'AgentB正在执行单元测试', {
        work_id: 'w-dag',
        agent_id: 'agent-B',
      }),
    ]);

    const agentAFrames = frames.filter(f => f.agent_id === 'agent-A');
    const agentBFrames = frames.filter(f => f.agent_id === 'agent-B');

    expect(agentAFrames.map(f => f.data.chunk).join('')).toBe('AgentA正在分析代码结构');
    expect(agentBFrames.map(f => f.data.chunk).join('')).toBe('AgentB正在执行单元测试');
  });

  it('配置 StreamProvider', async () => {
    const cfgIn = Object.assign(new ConfigStreamInput(), {
      sse_heartbeat_interval_ms: 20000,
      chunk_min_chars: 3,
      chunk_max_chars: 6,
    });
    const cfgOut = new ConfigStreamOutput();
    await streamAccess.configStream(cfgIn, cfgOut, new StreamContext());
    expect(cfgOut.updated).toBe(true);
  });
});
