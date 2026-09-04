"use strict";
/**
 * @fileoverview AOP 代理工具。
 *
 * 遵循 `_00_DevStandardization.md` 第 4 条：所有方法都需要通过代理模式增加切面注入能力。
 *
 * 通过 JavaScript Proxy 拦截目标对象的方法调用，提供四个切入点（2 前 + 2 后）：
 * 1. beforeExecute（方法执行前 #1）：方法调用最开始的钩子
 * 2. preExecute（方法执行前 #2）：方法实际执行前的钩子
 * 3. postExecute（方法执行后 #1）：方法成功返回后的钩子
 * 4. afterExecute（方法执行后 #2）：方法执行完成后的钩子（无论成功或失败）
 *
 * 支持注入多个拦截器（Interceptor），每个拦截器可实现任意组合的切入点。
 * 日志切面功能通过 LogInterceptor 在 beforeExecute 和 afterExecute 中实现。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AopProxy = exports.ConsoleLogger = void 0;
const IdGenerator_1 = require("../../ToolProvider/IdGenerator");
const Metrics_1 = require("../base/Metrics");
const Report_1 = require("../base/Report");
/**
 * 默认控制台日志记录器。
 */
class ConsoleLogger {
    debug(message, meta) {
        const suffix = meta ? ' ' + JSON.stringify(meta) : '';
        console.log(`[DEBUG] ${message}${suffix}`);
    }
    error(message, meta) {
        const suffix = meta ? ' ' + JSON.stringify(meta) : '';
        console.error(`[ERROR] ${message}${suffix}`);
    }
}
exports.ConsoleLogger = ConsoleLogger;
/**
 * AOP 代理工厂。
 *
 * 使用方式（拦截器模式）：
 * ```typescript
 * const logInterceptor = new LogInterceptor(logAccess);
 * const service = AopProxy.wrap(rawService, {
 *   interceptors: [logInterceptor],
 * });
 * ```
 *
 * 使用方式（向后兼容，logger 模式）：
 * ```typescript
 * const service = AopProxy.wrap(rawService, { logger: new ConsoleLogger() });
 * ```
 */
class AopProxy {
    /**
     * 包装目标对象，为所有方法注入四个切入点的切面能力。
     *
     * @param target 目标对象（通常是 Service 实例）
     * @param options 选项
     * @returns 与 target 同类型的代理对象
     */
    static wrap(target, options) {
        const enableAop = options?.enableAop ?? true;
        // 构建拦截器列表
        let interceptors = [];
        if (options?.interceptors && options.interceptors.length > 0) {
            interceptors = options.interceptors;
        }
        else if (options?.logger) {
            // 向后兼容：将 logger 转为内置拦截器
            interceptors = [AopProxy.createLoggerInterceptor(options.logger)];
        }
        else {
            // 默认使用 ConsoleLogger
            interceptors = [AopProxy.createLoggerInterceptor(new ConsoleLogger())];
        }
        return new Proxy(target, {
            get(obj, prop) {
                const value = Reflect.get(obj, prop);
                if (typeof value !== 'function') {
                    return value;
                }
                const methodName = String(prop);
                const targetName = obj.constructor.name;
                const fn = value;
                return function wrapped(...args) {
                    if (!enableAop) {
                        return fn.apply(obj, args);
                    }
                    // 双模式参数识别：
                    // 新式 5 参 (Input, Output, Context, Metrics, Report)：args.length >= 4
                    // 旧式 3 参 (Input, Context, Output)：args.length <= 3
                    const isNewStyle = args.length >= 4;
                    const contextArg = isNewStyle ? args[2] : args[1];
                    const outputArg = isNewStyle ? args[1] : args[2];
                    // trace_id 自动生成：traceId 独立于 work_id / interact_id / info_id 等业务 ID。
                    // 有效 trace_id 优先级：入参 Input.trace_id（显式传播）→ Context.trace_id → 新生成。
                    // 生成结果回填到 Context（供日志与后续读取），不回填 Input（避免污染查询类入参的 trace_id 过滤字段）。
                    let effectiveTraceId = AopProxy.pickField(args[0], 'trace_id');
                    if (!effectiveTraceId)
                        effectiveTraceId = AopProxy.pickField(contextArg, 'trace_id');
                    if (!effectiveTraceId)
                        effectiveTraceId = IdGenerator_1.IdGenerator.generate();
                    if (contextArg && typeof contextArg === 'object' && !Array.isArray(contextArg)) {
                        contextArg.trace_id = effectiveTraceId;
                    }
                    // 新式调用：Metrics / Report 未传时自动创建默认实例（调用方无需手工构造）。
                    if (isNewStyle) {
                        if (!args[3]) {
                            args[3] = new Metrics_1.Metrics(options?.logger, `${targetName}.${methodName}`, effectiveTraceId);
                        }
                        else if (args[3] instanceof Metrics_1.Metrics) {
                            const metrics = args[3];
                            if (!metrics.trace_id)
                                metrics.trace_id = effectiveTraceId;
                            if (!metrics.category)
                                metrics.category = `${targetName}.${methodName}`;
                        }
                        if (!args[4]) {
                            args[4] = new Report_1.Report({
                                trace_id: effectiveTraceId,
                                session_id: AopProxy.pickField(args[0], 'session_id'),
                                interact_id: AopProxy.pickField(args[0], 'interact_id'),
                                work_id: AopProxy.pickField(args[0], 'work_id'),
                            });
                        }
                    }
                    const startedAt = Date.now();
                    const metricsArg = isNewStyle ? args[3] : undefined;
                    if (metricsArg)
                        metricsArg.started_at = startedAt;
                    const ctx = {
                        targetName,
                        methodName,
                        input: args[0],
                        context: contextArg,
                        output: outputArg,
                        metrics: metricsArg,
                        report: isNewStyle ? args[4] : undefined,
                        startedAt,
                        elapsedMs: 0,
                    };
                    // 切入点 1：beforeExecute（方法执行前 #1）
                    AopProxy.runBeforeExecute(interceptors, ctx);
                    // 切入点 2：preExecute（方法执行前 #2）
                    AopProxy.runPreExecute(interceptors, ctx);
                    try {
                        const result = fn.apply(obj, args);
                        // 处理异步方法（返回 Promise）
                        if (result instanceof Promise) {
                            return result
                                .then((res) => {
                                ctx.elapsedMs = Date.now() - startedAt;
                                AopProxy.fillElapsed(args, ctx.elapsedMs);
                                // 切入点 3：postExecute（方法执行后 #1，仅成功）
                                AopProxy.runPostExecute(interceptors, ctx, res);
                                // 切入点 4：afterExecute（方法执行后 #2，始终）
                                AopProxy.runAfterExecute(interceptors, ctx);
                                return res;
                            })
                                .catch((err) => {
                                ctx.elapsedMs = Date.now() - startedAt;
                                AopProxy.fillElapsed(args, ctx.elapsedMs);
                                const error = err instanceof Error ? err : new Error(String(err));
                                // 切入点 4：afterExecute（方法执行后 #2，始终）
                                AopProxy.runAfterExecute(interceptors, ctx, error);
                                throw err;
                            });
                        }
                        // 同步方法
                        ctx.elapsedMs = Date.now() - startedAt;
                        AopProxy.fillElapsed(args, ctx.elapsedMs);
                        // 切入点 3：postExecute（方法执行后 #1，仅成功）
                        AopProxy.runPostExecute(interceptors, ctx, result);
                        // 切入点 4：afterExecute（方法执行后 #2，始终）
                        AopProxy.runAfterExecute(interceptors, ctx);
                        return result;
                    }
                    catch (err) {
                        ctx.elapsedMs = Date.now() - startedAt;
                        AopProxy.fillElapsed(args, ctx.elapsedMs);
                        const error = err instanceof Error ? err : new Error(String(err));
                        // 切入点 4：afterExecute（方法执行后 #2，始终）
                        AopProxy.runAfterExecute(interceptors, ctx, error);
                        throw err;
                    }
                };
            },
        });
    }
    // -------------------------------------------------------------------------
    // 切入点执行器
    // -------------------------------------------------------------------------
    /**
     * 执行所有拦截器的 beforeExecute 切入点。
     */
    static runBeforeExecute(interceptors, ctx) {
        for (const interceptor of interceptors) {
            try {
                interceptor.beforeExecute?.(ctx);
            }
            catch {
                // 拦截器异常不影响业务方法执行
            }
        }
    }
    /**
     * 执行所有拦截器的 preExecute 切入点。
     */
    static runPreExecute(interceptors, ctx) {
        for (const interceptor of interceptors) {
            try {
                interceptor.preExecute?.(ctx);
            }
            catch {
                // 拦截器异常不影响业务方法执行
            }
        }
    }
    /**
     * 执行所有拦截器的 postExecute 切入点。
     */
    static runPostExecute(interceptors, ctx, result) {
        for (const interceptor of interceptors) {
            try {
                interceptor.postExecute?.(ctx, result);
            }
            catch {
                // 拦截器异常不影响业务方法执行
            }
        }
    }
    /**
     * 执行所有拦截器的 afterExecute 切入点。
     */
    static runAfterExecute(interceptors, ctx, error) {
        for (const interceptor of interceptors) {
            try {
                interceptor.afterExecute?.(ctx, error);
            }
            catch {
                // 拦截器异常不影响业务方法执行
            }
        }
    }
    // -------------------------------------------------------------------------
    // 内置工具
    // -------------------------------------------------------------------------
    /**
     * 将耗时写入 Output（新式第 2 参 / 旧式第 3 参）与新式 Metrics 的 elapsed_ms 字段。
     */
    static fillElapsed(args, elapsed) {
        const isNewStyle = args.length >= 4;
        const output = isNewStyle ? args[1] : args[2];
        if (output !== null &&
            typeof output === 'object' &&
            !Array.isArray(output)) {
            output.elapsed_ms = elapsed;
        }
        if (isNewStyle && args[3] instanceof Metrics_1.Metrics) {
            args[3].elapsed_ms = elapsed;
        }
    }
    /**
     * 创建使用 Logger 的内置拦截器（向后兼容）。
     *
     * 方法进入（invoke）/完成（done）属于高频噪声日志，默认不再输出；
     * 仅在方法执行失败时输出 ERROR（保留故障定位能力）。
     */
    static createLoggerInterceptor(logger) {
        return {
            afterExecute(ctx, error) {
                if (error) {
                    logger.error(`${ctx.methodName} failed`, {
                        source: ctx.targetName,
                        elapsed_ms: ctx.elapsedMs,
                        trace_id: AopProxy.pickTraceId(ctx),
                        error: error.message,
                    });
                }
            },
        };
    }
    /**
     * 提取有效 trace_id：优先 Context（AOP 已回填），其次 Input（显式传播），无则 undefined。
     */
    static pickTraceId(ctx) {
        return AopProxy.pickField(ctx.context, 'trace_id') ?? AopProxy.pickField(ctx.input, 'trace_id');
    }
    /**
     * 从对象中提取指定字段值（用于日志记录，无则返回 undefined）。
     */
    static pickField(input, field) {
        if (input && typeof input === 'object' && !Array.isArray(input)) {
            const value = input[field];
            if (typeof value === 'string' && value)
                return value;
        }
        return undefined;
    }
}
exports.AopProxy = AopProxy;
//# sourceMappingURL=AopProxy.js.map