"use strict";
/**
 * @fileoverview 共享错误类型定义。
 *
 * 提供统一的错误类层次，便于各 Provider 抛出结构化错误，
 * AOP 层与 access 层可据此填充 Output 的 error / error_code 字段。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbortedError = exports.ProcessingError = exports.DatabaseError = exports.NotFoundError = exports.ValidationError = exports.ComponentDisabledError = exports.ProviderError = void 0;
/**
 * Provider 错误基类。
 *
 * 所有自定义错误继承此类，携带错误码与错误信息。
 */
class ProviderError extends Error {
    /** 错误码 */
    error_code;
    constructor(message, error_code) {
        super(message);
        this.name = this.constructor.name;
        this.error_code = error_code;
    }
}
exports.ProviderError = ProviderError;
/**
 * 组件未启用错误。
 *
 * 当 Provider 处于 disabled 状态时执行任何操作将抛出此错误。
 */
class ComponentDisabledError extends ProviderError {
    constructor(component) {
        super(`${component} 组件未启用，请先通过 enable${component} 启用`, 'COMPONENT_DISABLED');
    }
}
exports.ComponentDisabledError = ComponentDisabledError;
/**
 * 参数校验错误。
 */
class ValidationError extends ProviderError {
    constructor(message) {
        super(message, 'VALIDATION_ERROR');
    }
}
exports.ValidationError = ValidationError;
/**
 * 资源不存在错误。
 */
class NotFoundError extends ProviderError {
    constructor(resource, id) {
        super(`${resource} 不存在: ${id}`, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
/**
 * 数据库操作错误。
 */
class DatabaseError extends ProviderError {
    constructor(message) {
        super(message, 'DATABASE_ERROR');
    }
}
exports.DatabaseError = DatabaseError;
/**
 * 处理过程错误。
 *
 * 业务规则执行失败（解析失败、生成失败等）时抛出，区别于参数校验与资源不存在。
 */
class ProcessingError extends ProviderError {
    constructor(message) {
        super(message, 'PROCESSING_ERROR');
    }
}
exports.ProcessingError = ProcessingError;
/**
 * 中止错误。
 *
 * AbortSignal 贯穿异步全链路时抛出（真取消，取代 Promise.race 假取消），
 * 携带类型化原因供上层写规范化失败消息（OpenClaw canonical failure message）。
 */
class AbortedError extends ProviderError {
    /** 取消原因 */
    reason;
    constructor(reason, message) {
        super(message ?? `执行已中止: ${reason}`, 'ABORTED');
        this.reason = reason;
    }
}
exports.AbortedError = AbortedError;
//# sourceMappingURL=index.js.map