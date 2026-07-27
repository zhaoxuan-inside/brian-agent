/**
 * @fileoverview Core 层共享错误类型定义。
 */
export { ProviderError } from '@brian-agent/base';

export class CoreError extends Error {
  readonly error_code: string;
  constructor(message: string, error_code: string) {
    super(message);
    this.name = this.constructor.name;
    this.error_code = error_code;
  }
}

export class ValidationError extends CoreError {
  constructor(message: string) {
    super(message, 'CORE_VALIDATION_ERROR');
  }
}

export class NotFoundError extends CoreError {
  constructor(resource: string, id: string) {
    super(`${resource} 不存在: ${id}`, 'CORE_NOT_FOUND');
  }
}

export class ProcessingError extends CoreError {
  constructor(message: string) {
    super(message, 'CORE_PROCESSING_ERROR');
  }
}
