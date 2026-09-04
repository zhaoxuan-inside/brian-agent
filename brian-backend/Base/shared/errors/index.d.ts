/**
 * @fileoverview 共享错误类型定义。
 *
 * 提供统一的错误类层次，便于各 Provider 抛出结构化错误，
 * AOP 层与 access 层可据此填充 Output 的 error / error_code 字段。
 */
/**
 * Provider 错误基类。
 *
 * 所有自定义错误继承此类，携带错误码与错误信息。
 */
export declare class ProviderError extends Error {
    /** 错误码 */
    readonly error_code: string;
    constructor(message: string, error_code: string);
}
/**
 * 组件未启用错误。
 *
 * 当 Provider 处于 disabled 状态时执行任何操作将抛出此错误。
 */
export declare class ComponentDisabledError extends ProviderError {
    constructor(component: string);
}
/**
 * 参数校验错误。
 */
export declare class ValidationError extends ProviderError {
    constructor(message: string);
}
/**
 * 资源不存在错误。
 */
export declare class NotFoundError extends ProviderError {
    constructor(resource: string, id: string);
}
/**
 * 数据库操作错误。
 */
export declare class DatabaseError extends ProviderError {
    constructor(message: string);
}
/**
 * 处理过程错误。
 *
 * 业务规则执行失败（解析失败、生成失败等）时抛出，区别于参数校验与资源不存在。
 */
export declare class ProcessingError extends ProviderError {
    constructor(message: string);
}
/**
 * 类型化取消原因（Runtime v2 · OpenClaw turn-interruption 范式）。
 */
export type AbortReasonKind = 'user' | 'timeout' | 'budget' | 'superseded';
/**
 * 中止错误。
 *
 * AbortSignal 贯穿异步全链路时抛出（真取消，取代 Promise.race 假取消），
 * 携带类型化原因供上层写规范化失败消息（OpenClaw canonical failure message）。
 */
export declare class AbortedError extends ProviderError {
    /** 取消原因 */
    readonly reason: AbortReasonKind;
    constructor(reason: AbortReasonKind, message?: string);
}
//# sourceMappingURL=index.d.ts.map