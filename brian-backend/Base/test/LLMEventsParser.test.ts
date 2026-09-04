/**
 * @fileoverview LLMEventsParser 单元测试（Runtime v2 · 阶段 0）。
 */

import { describe, it, expect } from 'vitest';
import { LLMEventsParser } from '../LLMProvider/application/llmevents/LLMEventsParser';

describe('LLMEventsParser', () => {
  it('应该把 delta.content 解析为 text_delta 并累计 text', () => {
    const parser = new LLMEventsParser();
    const events = parser.parseChunk({
      choices: [{ delta: { content: '你好' }, finish_reason: null }],
    });
    expect(events).toEqual([{ type: 'text_delta', delta: '你好' }]);
    expect(parser.text).toBe('你好');
  });

  it('应该把 delta.reasoning_content 解析为 reasoning_delta 并累计 reasoning', () => {
    const parser = new LLMEventsParser();
    const events = parser.parseChunk({
      choices: [{ delta: { reasoning_content: '思考中' }, finish_reason: null }],
    });
    expect(events).toEqual([{ type: 'reasoning_delta', delta: '思考中' }]);
    expect(parser.reasoning).toBe('思考中');
  });

  it('应该按 index 聚合跨帧 tool_calls delta', () => {
    const parser = new LLMEventsParser();
    parser.parseChunk({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'skill_exec', arguments: '{"ski' },
          }],
        },
        finish_reason: null,
      }],
    });
    const events = parser.parseChunk({
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: { arguments: 'll_id":"s1"}' },
          }],
        },
        finish_reason: null,
      }],
    });
    expect(events[0]).toEqual({
      type: 'tool_call_delta',
      index: 0,
      id: undefined,
      name: undefined,
      args_delta: 'll_id":"s1"}',
    });
    expect(parser.toolCalls).toEqual([{
      index: 0,
      id: 'call_1',
      tool_id: 'skill_exec',
      arguments: '{"skill_id":"s1"}',
    }]);
  });

  it('应该聚合多工具调用并保持流内顺序', () => {
    const parser = new LLMEventsParser();
    parser.parseChunk({
      choices: [{
        delta: {
          tool_calls: [
            { index: 0, id: 'call_a', function: { name: 'a', arguments: '{}' } },
            { index: 1, id: 'call_b', function: { name: 'b', arguments: '{}' } },
          ],
        },
        finish_reason: null,
      }],
    });
    expect(parser.toolCalls.map((t) => t.tool_id)).toEqual(['a', 'b']);
  });

  it('finish 事件应该映射 finish_reason=tool_calls 并携带聚合结果', () => {
    const parser = new LLMEventsParser();
    parser.parseChunk({
      choices: [{
        delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'a', arguments: '{}' } }] },
        finish_reason: null,
      }],
    });
    const finish = parser.buildFinishEvent({
      choices: [{ delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }) as Extract<ReturnType<typeof parser.buildFinishEvent>, { type: 'finish' }>;
    expect(finish.finish_reason).toBe('tool-calls');
    expect(finish.tool_calls).toHaveLength(1);
    expect(finish.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
  });

  it('usage 帧缺失时应该按 4 字符/Token 粗估输出侧', () => {
    const parser = new LLMEventsParser();
    parser.parseChunk({ choices: [{ delta: { content: '12345678' }, finish_reason: null }] });
    const finish = parser.buildFinishEvent(null) as Extract<
      ReturnType<typeof parser.buildFinishEvent>,
      { type: 'finish' }
    >;
    expect(finish.usage.input_tokens).toBe(0);
    expect(finish.usage.output_tokens).toBe(2);
  });

  it('半包/心跳帧（非 JSON）应该解析为空事件数组', () => {
    const parser = new LLMEventsParser();
    expect(parser.parseChunk(null)).toEqual([]);
    expect(parser.parseChunk('keep-alive')).toEqual([]);
  });

  it('sawFinishReason 应该区分显式结束帧与流中断', () => {
    const parser = new LLMEventsParser();
    expect(parser.sawFinishReason).toBe(false);
    parser.parseChunk({ choices: [{ delta: { content: 'x' }, finish_reason: null }] });
    expect(parser.sawFinishReason).toBe(false);
    parser.parseChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] });
    expect(parser.sawFinishReason).toBe(true);
  });

  it('非 OpenAI 原因（function_call）应该映射为 tool-calls', () => {
    const parser = new LLMEventsParser();
    const finish = parser.buildFinishEvent({
      choices: [{ delta: {}, finish_reason: 'function_call' }],
    }) as Extract<ReturnType<typeof parser.buildFinishEvent>, { type: 'finish' }>;
    expect(finish.finish_reason).toBe('tool-calls');
  });
});
