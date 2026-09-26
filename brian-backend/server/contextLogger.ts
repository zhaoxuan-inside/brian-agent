import { LogAccess } from '../Base/LogProvider/access/LogAccess';
import { fileLogger } from './fileLog';

/** AOP 访问日志器工厂(自 dev-server.ts 平移,行为不变) */

export function createLogger(logAccess?: LogAccess): any {
  if (!logAccess) {
    return { debug: (..._a: any[]) => {}, info: (..._a: any[]) => {}, warn: (..._a: any[]) => {}, error: (..._a: any[]) => {} };
  }
  const rawService = logAccess.getRawService();
  const write = (level: string, message: string, meta?: unknown) => {
    let source = 'system';
    let metadata: Record<string, unknown> | undefined;
    let elapsed: number | undefined;
    let workId: string | undefined;
    let runId: string | undefined;
    let traceId: string | undefined;
    if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
      const m = meta as Record<string, unknown>;
      if (typeof m.source === 'string') source = m.source;
      if (typeof m.elapsed_ms === 'number') elapsed = m.elapsed_ms;
      if (typeof m.work_id === 'string') workId = m.work_id;
      if (typeof m.run_id === 'string') runId = m.run_id;
      if (typeof m.trace_id === 'string') traceId = m.trace_id;
      metadata = { ...m, log_source: 'AOP' };
    } else if (meta !== undefined && meta !== null) {
      metadata = { detail: meta, log_source: 'SYSTEM' };
    } else {
      metadata = { log_source: 'SYSTEM' };
    }
    try {
      rawService.addLog(
        { data: { level, source, message, metadata, elapsed_ms: elapsed, work_id: workId, run_id: runId, trace_id: traceId } },
        {} as any,
        {} as any,
      ).catch(() => {});
    } catch (err) {
      fileLogger.warn('[dev-server] createLogger.write 日志落库同步失败（容忍：丢弃该条日志）', err instanceof Error ? err.message : String(err));
    }
  };
  return {

    debug: (message: string, meta?: unknown) => write('DEBUG', message, meta),
    info: (message: string, meta?: unknown) => write('INFO', message, meta),
    warn: (message: string, meta?: unknown) => write('WARN', message, meta),
    error: (message: string, meta?: unknown) => write('ERROR', message, meta),

    log: (level: string, message: string, meta?: unknown) => write(level, message, meta),
  };
}
