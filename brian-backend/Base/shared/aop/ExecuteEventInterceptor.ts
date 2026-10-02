import type { Interceptor, InterceptContext } from './Interceptor';
import { Report } from '../base/Report';
import type { ExecuteEvent } from '../base/ExecuteEvent';
import { isExecuteEventObservable, resolveComponentType } from '../base/ExecuteEvent';

export class ExecuteEventInterceptor implements Interceptor {
  afterExecute(ctx: InterceptContext, error?: Error): void {
    if (!ctx.report) return;
    if (!isExecuteEventObservable(ctx.targetName, ctx.methodName)) return;
    const event: ExecuteEvent = {
      component_id: `${ctx.targetName}.${ctx.methodName}`,
      component_type: resolveComponentType(ctx.targetName),
      start: ctx.startedAt,
      end: ctx.startedAt + ctx.elapsedMs,
      gap: ctx.elapsedMs,
      input: ctx.input,
      output: ctx.output,
      status: error ? 'error' : 'ok',
      error: error?.message,
    };
    Report.emitExecuteEvent(event, ctx.report as Report);
  }
}
