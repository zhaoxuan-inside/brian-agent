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

export interface LLMEventsRunResult {

  text: string;

  reasoning: string;

  finish_reason: 'tool-calls' | 'stop' | 'aborted' | 'error';

  tool_calls: ParsedToolCall[];

  input_tokens: number;

  output_tokens: number;

  last_frame: unknown;

  emitted_events: boolean;
}

export interface LLMEventsRunnerOptions {

  request: HttpRequestOptions;

  signal?: AbortSignal;

  idle_watchdog_ms: number;

  on_event?: (event: LLMEvent) => void;

  logger?: Logger;
}

export const DEFAULT_IDLE_WATCHDOG_MS = 120000;

export class LLMEventsRunner {
  private readonly parser = new LLMEventsParser();
  private readonly opts: LLMEventsRunnerOptions;
  private readonly controller = new AbortController();
  private readonly aborted: Promise<never>;
  private emittedCount = 0;
  private resetIdle: () => void = () => {};

  constructor(options: LLMEventsRunnerOptions) {
    this.opts = options;
    this.aborted = new Promise<never>((_, reject) => {
      this.controller.signal.addEventListener('abort', () => {
        const reason = this.resolveLocalAbortReason();
        reject(new AbortedError(reason, `执行已中止: ${reason}`));
      }, { once: true });
    });
  }

  private resolveLocalAbortReason(): AbortReasonKind {
    if (this.opts.signal?.aborted) {
      return this.resolveExternalReason(this.opts.signal);
    }
    return 'timeout';
  }

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

  private setupAbortWiring(): () => void {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    this.resetIdle = (): void => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => this.abortLocal('timeout'),
        this.opts.idle_watchdog_ms || DEFAULT_IDLE_WATCHDOG_MS,
      );
    };
    this.resetIdle();
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

  private abortLocal(reason: AbortReasonKind): void {
    if (!this.controller.signal.aborted) {
      this.controller.abort(reason);
    }
  }

  private resolveExternalReason(signal?: AbortSignal): AbortReasonKind {
    const reason = signal?.reason;
    if (typeof reason === 'string' && reason) {
      return reason as AbortReasonKind;
    }
    return 'user';
  }

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
        this.resetIdle();
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

  private emitToSubscriber(event: LLMEvent): void {
    this.emittedCount += 1;
    this.opts.on_event?.(event);
  }

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
