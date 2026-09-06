/**
 * @fileoverview Metrics 日志网关单测。
 *
 * 验证 DevStandards §3/§7 语义：
 * - Metrics 封装 LogProvider 调用接口，方法内与 AOP 切面的日志都经 Metrics 保存；
 * - 日志以 JSON 格式保存（saveInvocation 序列化全部参数内容，函数/循环引用安全）；
 * - AopProxy 内置日志切面在方法**返回或抛异常**时采集方法调用的全部参数及参数内容。
 */

import { describe, it, expect, vi } from 'vitest';
import { Metrics, Report } from '../shared/base';
import { AopProxy } from '../shared/aop/AopProxy';
import type { Logger } from '../shared/aop/AopProxy';
import { Input, Output, Context } from '../shared/base';

interface LogCall {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

function makeLogger(): { logger: Logger; calls: LogCall[] } {
  const calls: LogCall[] = [];
  const push = (level: LogCall['level']) => (message: string, meta?: Record<string, unknown>) => {
    calls.push({ level, message, meta });
  };
  return {
    logger: {
      debug: push('debug'),
      info: push('info'),
      warn: push('warn'),
      error: push('error'),
    },
    calls,
  };
}

describe('Metrics 日志网关（DevStandards §3/§7）', () => {
  it('saveInvocation 应以 JSON 采集全部参数内容（函数/循环引用安全）', () => {
    const { logger, calls } = makeLogger();
    const metrics = new Metrics(logger, 'DemoService.demo');

    const circular: Record<string, unknown> = { name: 'ctx' };
    circular.self = circular;
    metrics.elapsed_ms = 12;
    metrics.saveInvocation({
      targetName: 'DemoService',
      methodName: 'demo',
      status: 'ok',
      args: {
        input: { query: 'hello' },
        output: { result: 'world' },
        context: circular,
        report: new Report({ session_id: 's1' }),
      },
    });

    // 无 log(level,…) 实现的 logger 回退到 debug 级别方法（AOP 调用记录 = DEBUG）
    const info = calls.find((c) => c.level === 'debug');
    expect(info).toBeTruthy();
    const json = info!.meta?.invocation_json as string;
    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json) as {
      method: string; status: string; elapsed_ms: number;
      args: { input: { query: string }; output: { result: string }; context: Record<string, unknown>; report: Record<string, unknown> };
    };
    expect(parsed.method).toBe('DemoService.demo');
    expect(parsed.status).toBe('ok');
    expect(parsed.elapsed_ms).toBe(12);
    expect(parsed.args.input.query).toBe('hello');
    expect(parsed.args.output.result).toBe('world');
    expect(parsed.args.context.name).toBe('ctx');
    expect(parsed.args.context.self).toBe('[circular]');
    // Report.channel（函数）应被安全替换，不破坏 JSON
    expect(JSON.stringify(parsed)).toContain('report');
  });

  it('logger 实现 log(level,…) 时应显式携带级别参数调用（DEBUG）', () => {
    const logCalls: Array<{ level: string; message: string }> = [];
    const metrics = new Metrics({
      debug: () => undefined,
      error: () => undefined,
      log: (level: string, message: string) => {
        logCalls.push({ level, message });
      },
    }, 'DemoService.demo');
    metrics.saveInvocation({
      targetName: 'DemoService', methodName: 'demo', status: 'ok',
      args: { input: { q: 1 } },
    });
    expect(logCalls).toHaveLength(1);
    expect(logCalls[0].level.toUpperCase()).toBe('DEBUG');
  });

  it('AopProxy 内置切面应在方法返回与抛异常时经 Metrics 采集全部参数内容', async () => {
    const { logger, calls } = makeLogger();
    class DemoService {
      async ok(input: Input, output: Output, _context: Context, _metrics?: Metrics, _report?: Report): Promise<boolean> {
        output.error = undefined;
        (input as { seen?: string }).seen = 'captured';
        return true;
      }
      async boom(_input: Input, _output: Output, _context: Context, _metrics?: Metrics, _report?: Report): Promise<boolean> {
        throw new Error('boom-message');
      }
    }
    const proxy = AopProxy.wrap(new DemoService(), { logger }) as DemoService;

    const input = new Input();
    const output = new Output();
    // 5 参调用（metrics/report 缺省由 AopProxy 自动创建）——命中新式签名分支
    await proxy.ok(input, output, new Context(), undefined, undefined);

    // AOP 切面的调用记录为 DEBUG 级别
    const okLog = calls.find((c) => c.level === 'debug' && (c.meta?.invocation_json as string)?.includes('"status":"ok"'));
    expect(okLog).toBeTruthy();
    const okParsed = JSON.parse(okLog!.meta!.invocation_json as string) as { args: { input: { seen?: string } } };
    expect(okParsed.args.input.seen).toBe('captured');

    calls.length = 0;
    await expect(proxy.boom(new Input(), new Output(), new Context(), undefined, undefined)).rejects.toThrow('boom-message');
    const errLog = calls.find((c) => (c.meta?.invocation_json as string)?.includes('"status":"error"'));
    expect(errLog).toBeTruthy();
    const errParsed = JSON.parse(errLog!.meta!.invocation_json as string) as { error?: string };
    expect(errParsed.error).toBe('boom-message');
  });
});
