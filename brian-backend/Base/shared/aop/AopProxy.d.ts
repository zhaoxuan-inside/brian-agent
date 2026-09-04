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
import type { Interceptor } from './Interceptor';
/**
 * 日志记录器接口，供调用方注入自定义 logger。
 *
 * 向后兼容：若未提供 interceptors 但提供了 logger，
 * AopProxy 会自动创建一个使用 logger 的内置拦截器。
 */
export interface Logger {
    /** 记录调试日志 */
    debug(message: string, meta?: Record<string, unknown>): void;
    /** 记录信息日志（可选） */
    info?(message: string, meta?: Record<string, unknown>): void;
    /** 记录警告日志（可选） */
    warn?(message: string, meta?: Record<string, unknown>): void;
    /** 记录错误日志 */
    error(message: string, meta?: Record<string, unknown>): void;
}
/**
 * 默认控制台日志记录器。
 */
export declare class ConsoleLogger implements Logger {
    debug(message: string, meta?: Record<string, unknown>): void;
    error(message: string, meta?: Record<string, unknown>): void;
}
/**
 * AOP 代理选项。
 */
export interface AopProxyOptions {
    /** 日志记录器（向后兼容，若提供 interceptors 则忽略） */
    logger?: Logger;
    /** 是否启用 AOP（默认 true） */
    enableAop?: boolean;
    /** 拦截器列表，按顺序执行 */
    interceptors?: Interceptor[];
}
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
export declare class AopProxy {
    /**
     * 包装目标对象，为所有方法注入四个切入点的切面能力。
     *
     * @param target 目标对象（通常是 Service 实例）
     * @param options 选项
     * @returns 与 target 同类型的代理对象
     */
    static wrap<T extends object>(target: T, options?: AopProxyOptions): T;
    /**
     * 执行所有拦截器的 beforeExecute 切入点。
     */
    private static runBeforeExecute;
    /**
     * 执行所有拦截器的 preExecute 切入点。
     */
    private static runPreExecute;
    /**
     * 执行所有拦截器的 postExecute 切入点。
     */
    private static runPostExecute;
    /**
     * 执行所有拦截器的 afterExecute 切入点。
     */
    private static runAfterExecute;
    /**
     * 将耗时写入 Output（新式第 2 参 / 旧式第 3 参）与新式 Metrics 的 elapsed_ms 字段。
     */
    private static fillElapsed;
    /**
     * 创建使用 Logger 的内置拦截器（向后兼容）。
     *
     * 方法进入（invoke）/完成（done）属于高频噪声日志，默认不再输出；
     * 仅在方法执行失败时输出 ERROR（保留故障定位能力）。
     */
    private static createLoggerInterceptor;
    /**
     * 提取有效 trace_id：优先 Context（AOP 已回填），其次 Input（显式传播），无则 undefined。
     */
    private static pickTraceId;
    /**
     * 从对象中提取指定字段值（用于日志记录，无则返回 undefined）。
     */
    private static pickField;
}
//# sourceMappingURL=AopProxy.d.ts.map