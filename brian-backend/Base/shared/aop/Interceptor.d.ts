/**
 * @fileoverview AOP 拦截器接口定义。
 *
 * 定义四个切入点：两个在方法执行前，两个在方法执行后。
 * 所有组件的方法都通过 AopProxy 代理，支持注入多个拦截器。
 *
 * 切入点执行顺序：
 * 1. beforeExecute（方法执行前 #1）：方法调用最开始的钩子
 * 2. preExecute（方法执行前 #2）：方法实际执行前的钩子
 * 3. [方法执行]
 * 4. postExecute（方法执行后 #1）：方法成功返回后的钩子
 * 5. afterExecute（方法执行后 #2）：方法执行完成后的钩子（无论成功或失败）
 */
/**
 * 拦截器上下文。
 *
 * 在四个切入点中传递，包含方法名、入参、出参、耗时等信息。
 */
export interface InterceptContext {
    /** 目标对象名（类名，如 "SoulService"） */
    targetName: string;
    /** 方法名 */
    methodName: string;
    /** 入参对象（Input） */
    input: unknown;
    /** 执行上下文（Context） */
    context: unknown;
    /** 出参对象（Output） */
    output: unknown;
    /** 衡量对象（Metrics，仅新式 5 参签名时存在） */
    metrics?: unknown;
    /** 上报对象（Report，仅新式 5 参签名时存在） */
    report?: unknown;
    /** 方法开始执行的时间戳（毫秒） */
    startedAt: number;
    /** 方法执行耗时（毫秒），afterExecute 时已填充 */
    elapsedMs: number;
}
/**
 * AOP 拦截器接口。
 *
 * 提供四个切入点，每个切入点为可选方法。拦截器可实现任意组合的切入点。
 *
 * 典型用途：
 * - beforeExecute：日志记录（记录方法调用开始）
 * - preExecute：参数校验、权限校验、缓存检查
 * - postExecute：结果转换、结果缓存
 * - afterExecute：耗时统计、资源清理、完成日志
 */
export interface Interceptor {
    /**
     * 切入点 1（方法执行前）：方法调用最开始的钩子。
     *
     * 在任何处理之前调用，适合记录方法调用开始。
     * 日志的切面功能在此切入点实现。
     */
    beforeExecute?(ctx: InterceptContext): void;
    /**
     * 切入点 2（方法执行前）：方法实际执行前的钩子。
     *
     * 在 beforeExecute 之后、方法执行之前调用。
     * 适合参数校验、权限校验、缓存检查。
     */
    preExecute?(ctx: InterceptContext): void;
    /**
     * 切入点 3（方法执行后）：方法成功返回后的钩子。
     *
     * 仅在方法成功执行后调用（不包含异常场景）。
     * 适合结果转换、结果缓存。
     */
    postExecute?(ctx: InterceptContext, result: unknown): void;
    /**
     * 切入点 4（方法执行后）：方法执行完成后的钩子。
     *
     * 无论方法成功或失败都会调用。
     * 适合耗时统计、资源清理、完成日志。
     */
    afterExecute?(ctx: InterceptContext, error?: Error): void;
}
//# sourceMappingURL=Interceptor.d.ts.map