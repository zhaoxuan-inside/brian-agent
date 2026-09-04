/**
 * @fileoverview execLLMEvents 降级语义测试（Runtime v2 修复②）。
 *
 * stub RelationDBAccess + mock fetch，验证：
 * - 候选已产出流事件后失败 → 禁止降级（fetch 仅一次，返回该候选错误）；
 * - 候选未产出任何事件失败 → 正常降级到下一候选（fetch 两次，第二次成功）。
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { LLMService } from '../LLMProvider/application/LLMService';
import { ExecLLMEventsInput, ExecLLMEventsOutput, LLMContext, Operator } from '@brian-agent/base';
import type { RelationDBAccess } from '@brian-agent/base';

const REQUEST = { url: 'https://example.com/v1/chat/completions', method: 'POST', headers: {}, body: '{}' };
const REAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  vi.restoreAllMocks();
});

/** stub RelationDBAccess：两条候选模型 + 一个 provider + usage 空 */
function makeRelationDbStub(): RelationDBAccess {
  return {
    selectOne: vi.fn(async (table: string, _conditions: unknown) => {
      if (table === 'llm_available') {
        return { id: 'stub-llm', llm_title: 'm1', enable: 1, llm_type: 'text', llm_provider_id: 'p1', max_tokens: 0 };
      }
      if (table === 'llm_provider') {
        return { id: 'p1', llm_provider_url: 'https://example.com', api_key: 'k', enable: 1 };
      }
      return null;
    }),
    select: vi.fn(async () => [
      { id: 'stub-llm', llm_title: 'm1', enable: 1, llm_type: 'text', llm_provider_id: 'p1' },
      { id: 'stub-llm-2', llm_title: 'm2', enable: 1, llm_type: 'text', llm_provider_id: 'p1' },
    ]),
    insert: vi.fn(async () => 1),
    update: vi.fn(async () => 1),
    executeRaw: vi.fn(() => 0),
  } as unknown as RelationDBAccess;
}

function sseResponse(frames: string[], mode: 'ok' | 'error'): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(frame));
      }
      // 注意：同步 error() 会按 streams 规范丢弃已入队 chunk；异步触发保证先读后错
      if (mode === 'error') {
        setTimeout(() => controller.error(new Error('stream reset')), 0);
      } else {
        controller.close();
      }
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

function makeInput(onEvent?: ExecLLMEventsInput['on_event']): ExecLLMEventsInput {
  const input = new ExecLLMEventsInput();
  input.id = 'stub-llm';
  input.prompt = '你好';
  input.on_event = onEvent;
  return input;
}

describe('execLLMEvents 降级语义（修复②）', () => {
  it('候选已产出流事件后失败应该禁止降级（fetch 仅一次）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse(
        ['data: {"choices":[{"delta":{"content":"部分"}}]}\n\n'],
        'error',
      ));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const service = new LLMService(makeRelationDbStub());
    const deltas: string[] = [];
    const input = makeInput((event) => {
      if (event.type === 'text_delta') {
        deltas.push(event.delta);
      }
    });
    const output = new ExecLLMEventsOutput();
    const ok = await service.execLLMEvents(input, output, new LLMContext());
    expect(ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 未降级
    expect(output.error).toContain('流式调用异常');
    expect(deltas).toEqual(['部分']); // 事件已透传
  });

  it('候选未产出任何事件失败应该正常降级到下一候选成功', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' }) // 首候选无事件失败
      .mockResolvedValueOnce(sseResponse([
        'data: {"choices":[{"delta":{"content":"OK"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ], 'ok'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const service = new LLMService(makeRelationDbStub());
    const input = makeInput();
    const output = new ExecLLMEventsOutput();
    const ok = await service.execLLMEvents(input, output, new LLMContext());
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 降级到第二候选
    expect(output.result).toBe('OK');
    expect(output.finish_reason).toBe('stop');
  });

  it('无 on_event 时降级行为不受 emitted 约束', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}\n\n'], 'error'))
      .mockResolvedValueOnce(sseResponse([
        'data: {"choices":[{"delta":{"content":"final"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
      ], 'ok'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const service = new LLMService(makeRelationDbStub());
    const input = makeInput(); // 无 on_event
    const output = new ExecLLMEventsOutput();
    const ok = await service.execLLMEvents(input, output, new LLMContext());
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(output.result).toBe('final');
    void Operator;
  });
});
