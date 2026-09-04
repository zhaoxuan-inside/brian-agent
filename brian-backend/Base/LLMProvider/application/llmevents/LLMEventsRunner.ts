/**
 * @fileoverview LLMEventsRunner —— execLLMEvents 流执行器（Runtime v2 · 阶段 0）。
 *
 * 职责（Loop-PRD §4/§7）：
 * 1. 按 strategy 构造的请求发起 SSE fetch；
 * 2. 读循环逐帧解析（LLMEventsParser）并经 on_event 回调产出归一化事件；
 * 3. **真取消**：外部 AbortSignal + 空闲看门狗合并为同一 controller；任意一者
 *    触发即终止读循环并抛 AbortedError(类型化原因)。
 *    —— 修复旧 execLLM 流式路径缺陷：计时器在 fetch 响应头返回后即被
 *    clearTimeout，读循环阶段流停滞可永久悬挂（LLMService.ts 旧实现）。
 * 4. 流结束产出 finish 事件（聚合 tool_calls + usage）。
 *
 * 错误语义（fail-loud）：HTTP 非 2xx 抛 ProcessingError('REMOTE_ERROR')；
 * 网络/解析异常抛 ProviderError('CONNECT_ERROR')；取消抛 AbortedError。
 * 每个方法 ≤40 行（Runtime-PRD §7）。
 */

import type { HttpRequestOptions } from '../strategies/ILLMProviderStrategy';
import type {
  LLMEvent,
  ParsedToolCall,
} from '../../../shared/llm/LLMEvent';
import type { Logger } from '../../../shared/aop/AopProxy';
import {
  AbortedError,
  ProviderError,
  type AbortReasonKind,
} from '../../../shared/errors';
import { LLMEventsParser } from './LLMEventsParser';

/** 单次流执行结果 */
export interface LLMEventsRunResult {
  /** 聚合回复文本 */
  text: string;
  /** 聚合思考文本 */
  reasoning: string;
  /** 结束原因 */
  finish_reason: 'tool-calls' | 'stop' | 'aborted' | 'error';
  /** 聚合完成的完整工具调用 */
  tool_calls: ParsedToolCall[];
  /** 输入 Token 数 */
  input_tokens: number;
  /** 输出 Token 数 */
  output_tokens: number;
  /** [DONE] 前最后一帧（可携带 usage，供 finish 事件构建） */
  last_frame: unknown;
  /** 是否已向 on_event 产出过事件（服务层据此禁止降级，避免跨候选混合流） */
  emitted_events: boolean;
}

/** 流执行器配置 */
export interface LLMEventsRunnerOptions {
  /** 策略构造的请求（含 url/method/headers/body） */
  request: HttpRequestOptions;
  /** 外部取消信号（贯穿请求与流读取全程） */
  signal?: AbortSignal;
  /** 空闲看门狗毫秒数（连续无 chunk 超时中止） */
  idle_watchdog_ms: number;
  /** 归一化事件回调 */
  on_event?: (event: LLMEvent) => void;
  /** 可选日志 */
  logger?: Logger;
}

/** 空闲看门狗默认值 */
export const DEFAULT_IDLE_WATCHDOG_MS = 30000;

/**
 * LLMEventsRunner。
 */
export class LLMEventsRunner {
  private readonly parser = new LLMEventsParser();
  private readonly opts: LLMEventsRunnerOptions;
  private readonly controller = new AbortController();
  private readonly aborted: Promise<never>;
  private emittedCount = 0;

  constructor(options: LLMEventsRunnerOptions) {
    this.opts = options;
    this.aborted = new Promise<never>((_, reject) => {
      this.controller.signal.addEventListener('abort', () => {
        const reason = this.resolveLocalAbortReason();
        reject(new AbortedError(reason, `执行已中止: ${reason}`));
      }, { once: true });
    });
  }

  /**
   * 解析本地取消原因（数据处理）：外部 signal 已取消 → 外部原因；否则超时。
   */
  private resolveLocalAbortReason(): AbortReasonKind {
    if (this.opts.signal?.aborted) {
      return this.resolveExternalReason(this.opts.signal);
    }
    return 'timeout';
  }

  /**
   * 执行流（逻辑控制）：fetch → 读循环 → finish 事件 → 结果。
   */
  async run(): Promise<LLMEventsRunResult> {
    const cleanup = this.setupAbortWiring();
    try {
      const res = await this.launchRequest();
      const reader = res.body?.getReader();
      if (!reader) {
        throw new ProviderError('LLM 流式响应无 body', 'CONNECT_ERROR');
      }
      return await this.readLoop(reader);
    } finally {
      cleanup();
    }
  }

  /**
   * 中止接线（逻辑控制）：外部 signal → controller；空闲看门狗逐帧重置。
   */
  private setupAbortWiring(): () => void {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const resetIdle = (): void => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => this.abortLocal('timeout'),
        this.opts.idle_watchdog_ms || DEFAULT_IDLE_WATCHDOG_MS,
      );
    };
    resetIdle();
    const external = this.opts.signal;
    const forwardExternal = (): void =>
      this.abortLocal(this.resolveExternalReason(external));
    if (external) {
      if (external.aborted) {
        forwardExternal();
      } else {
        external.addEventListener('abort', forwardExternal, { once: true });
      }
    }
    return () => clearTimeout(idleTimer);
  }

  /**
   * 本地取消（逻辑控制）。
   */
  private abortLocal(reason: AbortReasonKind): void {
    if (!this.controller.signal.aborted) {
      this.controller.abort(reason);
    }
  }

  /**
   * 解析外部取消原因（数据处理）：signal.reason 为字符串时直接映射。
   */
  private resolveExternalReason(signal?: AbortSignal): AbortReasonKind {
    const reason = signal?.reason;
    if (typeof reason === 'string' && reason) {
      return reason as AbortReasonKind;
    }
    return 'user';
  }

  /**
   * 发起 SSE 请求（逻辑控制）。
   */
  private async launchRequest(): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(this.opts.request.url, {
        method: this.opts.request.method || 'POST',
        headers: this.opts.request.headers,
        body: this.opts.request.body,
        signal: this.controller.signal,
      });
    } catch (err) {
      throw this.toAbortOrConnectError(err);
    }
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new ProviderError(
        `LLM 流式调用失败: HTTP ${res.status} ${errorText}`,
        'REMOTE_ERROR',
      );
    }
    return res;
  }

  /**
   * SSE 读循环（逻辑控制）：逐行派发，[DONE] 或连接关闭结束。
   *
   * 每次 read 与 aborted promise 竞速 —— 保证外部 signal / 看门狗取消
   * 对任何流实现（含未接线 signal 的流）都能真取消。
   */
  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<LLMEventsRunResult> {
    const decoder = new TextDecoder();
    let buffer = '';
    let lastFrame: unknown = null;
    try {
      while (true) { // eslint-disable-line no-constant-condition
        const read = reader.read();
        const { done, value } = await Promise.race([read, this.aborted]);
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        lastFrame = this.dispatchLines(lines, lastFrame);
      }
      this.dispatchLines(buffer.split('\n'), lastFrame);
      return this.buildResult(lastFrame, undefined);
    } catch (err) {
      throw this.toAbortOrConnectError(err);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 派发 SSE 行（逻辑控制）：data 行 → 解析帧 → 事件回调；返回最后有效帧。
   */
  private dispatchLines(lines: string[], lastFrame: unknown): unknown {
    let frame = lastFrame;
    for (const line of lines) {
      if (!line.startsWith('data: ')) {
        continue;
      }
      const data = line.slice(6).trim();
      if (data === '[DONE]' || !data) {
        continue;
      }
      let chunk: unknown = null;
      try {
        chunk = JSON.parse(data);
      } catch {
        this.opts.logger?.debug('LLMEventsRunner 忽略半包/心跳帧');
        continue;
      }
      frame = chunk;
      for (const event of this.parser.parseChunk(chunk)) {
        this.emitToSubscriber(event);
      }
    }
    return frame;
  }

  /** 事件投递计数（逻辑控制） */
  private emitToSubscriber(event: LLMEvent): void {
    this.emittedCount += 1;
    this.opts.on_event?.(event);
  }

  /**
   * 构建最终结果并产出 finish 事件（数据处理）。
   *
   * 修复①：流内未出现显式 finish_reason 帧即结束（中途断流）→ finish_reason='error'，
   * 与正常完成（stop）可区分，消费方可按规范化失败处理。
   */
  private buildResult(
    lastFrame: unknown,
    finishReason: 'tool-calls' | 'stop' | 'aborted' | 'error' | undefined,
  ): LLMEventsRunResult {
    const reason = finishReason ?? (this.parser.sawFinishReason ? undefined : 'error');
    const finish = this.parser.buildFinishEvent(lastFrame, reason) as Extract<
      LLMEvent,
      { type: 'finish' }
    >;
    this.emitToSubscriber(finish);
    return {
      text: this.parser.text,
      reasoning: this.parser.reasoning,
      finish_reason: finish.finish_reason,
      tool_calls: finish.tool_calls,
      input_tokens: finish.usage.input_tokens,
      output_tokens: finish.usage.output_tokens,
      last_frame: lastFrame,
      emitted_events: this.emittedCount > 0,
    };
  }

  /**
   * 取消/网络异常归类（数据处理）：controller 已取消 → AbortedError，否则连接错误。
   */
  private toAbortOrConnectError(err: unknown): ProviderError {
    if (this.controller.signal.aborted) {
      const reason = this.resolveExternalReason(this.opts.signal);
      if (this.opts.signal?.aborted) {
        return new AbortedError(reason, '外部信号取消');
      }
      return new AbortedError('timeout', '空闲看门狗超时中止');
    }
    if (err instanceof ProviderError) {
      return err;
    }
    return new ProviderError(
      `LLM 流式调用异常: ${err instanceof Error ? err.message : String(err)}`,
      'CONNECT_ERROR',
    );
  }
}
