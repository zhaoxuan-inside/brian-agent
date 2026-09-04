/**
 * @fileoverview LLMEventsRunner 单元测试（Runtime v2 · 阶段 0）。
 *
 * mock 全局 fetch 返回 SSE ReadableStream，验证：
 * - 事件归一化与聚合（text/reasoning/tool_calls/finish）；
 * - 空闲看门狗（流停滞超时 → AbortedError('timeout')）；
 * - 外部 signal 真取消（→ AbortedError('user')）；
 * - HTTP 非 2xx → ProcessingError(REMOTE_ERROR)。
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { LLMEventsRunner, DEFAULT_IDLE_WATCHDOG_MS } from '../LLMProvider/application/llmevents/LLMEventsRunner';
import { AbortedError, ProviderError } from '../shared/errors';
import type { LLMEvent } from '../shared/llm/LLMEvent';

const REQUEST = {
  url: 'https://example.com/v1/chat/completions',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
};

/** 构造 SSE 字节流 */
function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
}

/** 组装 OpenAI 兼容 data 帧 */
function dataFrame(json: string): string {
  return `data: ${json}\n\n`;
}

const REAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  vi.restoreAllMocks();
});

describe('LLMEventsRunner', () => {
  it('应该把 SSE 流归一化为 text_delta 事件并产出 finish', async () => {
    const frames = [
      dataFrame('{"choices":[{"delta":{"content":"你好"},"finish_reason":null}]}'),
      dataFrame('{"choices":[{"delta":{"content":"！"},"finish_reason":null}]}'),
      dataFrame('{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}'),
      'data: [DONE]\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: sseStream(frames) });
    const events: LLMEvent[] = [];
    const runner = new LLMEventsRunner({ request: REQUEST, idle_watchdog_ms: 1000, on_event: (e) => events.push(e) });
    const result = await runner.run();
    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { delta: string }).delta)).toEqual(['你好', '！']);
    const finish = events[events.length - 1];
    expect(finish.type).toBe('finish');
    expect(result).toMatchObject({
      text: '你好！',
      finish_reason: 'stop',
      input_tokens: 3,
      output_tokens: 2,
    });
  });

  it('应该归一化 reasoning_content 与跨帧 tool_calls', async () => {
    const frames = [
      dataFrame('{"choices":[{"delta":{"reasoning_content":"想"}}],"usage":null}'),
      dataFrame('{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"t","arguments":"{\\"a\\""}}]}}],"usage":null}'),
      dataFrame('{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":1}"}}]}}],"usage":null}'),
      dataFrame('{"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":null}'),
      'data: [DONE]\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: sseStream(frames) });
    const runner = new LLMEventsRunner({ request: REQUEST, idle_watchdog_ms: 1000 });
    const result = await runner.run();
    expect(result.reasoning).toBe('想');
    expect(result.finish_reason).toBe('tool-calls');
    expect(result.tool_calls).toEqual([{ index: 0, id: 'c1', tool_id: 't', arguments: '{"a":1}' }]);
    expect(result.output_tokens).toBe(0);
  });

  it('空闲看门狗应该在流停滞时中止（AbortedError timeout）', async () => {
    const encoder = new TextEncoder();
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(dataFrame('{"choices":[{"delta":{"content":"x"}}]}')));
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: stalled });
    const runner = new LLMEventsRunner({ request: REQUEST, idle_watchdog_ms: 50 });
    await expect(runner.run()).rejects.toMatchObject({
      error_code: 'ABORTED',
      reason: 'timeout',
    } as Partial<AbortedError>);
  });

  it('外部 signal 取消应该真取消读循环（AbortedError user）', async () => {
    const never = new ReadableStream<Uint8Array>({ start() { /* 永不产出 */ } });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: never });
    const controller = new AbortController();
    const runner = new LLMEventsRunner({ request: REQUEST, signal: controller.signal, idle_watchdog_ms: 5000 });
    const pending = runner.run();
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      error_code: 'ABORTED',
      reason: 'user',
    } as Partial<AbortedError>);
  });

  it('流中途断开（无 finish_reason 帧即关闭）应该映射 finish_reason=error', async () => {
    const encoder = new TextEncoder();
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(dataFrame('{\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}')));
        controller.close(); // 无 finish_reason 帧、无 [DONE]，模拟断流
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: broken });
    const runner = new LLMEventsRunner({ request: REQUEST, idle_watchdog_ms: 1000 });
    const result = await runner.run();
    expect(result.finish_reason).toBe('error');
    expect(result.text).toBe('partial');
    expect(result.emitted_events).toBe(true);
  });

  it('HTTP 非 2xx 应该抛 ProcessingError(REMOTE_ERROR)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    const runner = new LLMEventsRunner({ request: REQUEST, idle_watchdog_ms: DEFAULT_IDLE_WATCHDOG_MS });
    await expect(runner.run()).rejects.toMatchObject({
      error_code: 'REMOTE_ERROR',
    } as Partial<ProcessingError>);
  });

  it('fetch 网络异常应该归类为连接错误', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const runner = new LLMEventsRunner({ request: REQUEST, idle_watchdog_ms: 1000 });
    await expect(runner.run()).rejects.toMatchObject({
      error_code: 'CONNECT_ERROR',
    } as Partial<ProviderError>);
  });
});
