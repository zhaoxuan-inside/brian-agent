/**
 * @fileoverview Context 基类定义。所有 Provider 的 Context 对象都必须继承此基类。
 *
 * 遵循 `_00_DevStandardization.md` 规范：所有 Context 都继承 Context 基类。
 * Context 表示方法执行时的运行环境上下文，与 Input（输入参数）和 Output（返回内容）分离。
 */
/**
 * Context 基类。
 *
 * 承载方法执行所需的运行环境信息，例如调用方身份、是否启用切面等。
 * 子类可在继承基础上扩展自身特有的上下文字段。
 *
 * 用法示例：
 * ```typescript
 * class SkillContext extends Context {
 *   sandbox_id?: string;
 * }
 * ```
 */
export declare class Context {
    /** 调用方标识，用于权限校验与日志追踪 */
    caller?: string;
    /** 是否启用 AOP 切面（日志记录、耗时统计），默认 true */
    enable_aop?: boolean;
    /** 请求开始时间戳（毫秒），由 AOP 层自动填充 */
    request_started_at?: number;
    /** 请求追踪 ID（traceId，独立于 work_id / interact_id / info_id），由 AOP 层在缺失时自动生成并回填 */
    trace_id?: string;
}
//# sourceMappingURL=Context.d.ts.map