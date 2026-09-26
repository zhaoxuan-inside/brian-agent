export class ProviderError extends Error {
  
  readonly error_code: string;

  constructor(message: string, error_code: string) {
    super(message);
    this.name = this.constructor.name;
    this.error_code = error_code;
  }
}

export class ComponentDisabledError extends ProviderError {
  constructor(component: string) {
    super(
      `${component} 组件未启用，请先通过 enable${component} 启用`,
      'COMPONENT_DISABLED',
    );
  }
}

export class ValidationError extends ProviderError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends ProviderError {
  constructor(resource: string, id: string) {
    super(`${resource} 不存在: ${id}`, 'NOT_FOUND');
  }
}

export class DatabaseError extends ProviderError {
  constructor(message: string) {
    super(message, 'DATABASE_ERROR');
  }
}

export class ProcessingError extends ProviderError {
  constructor(message: string) {
    super(message, 'PROCESSING_ERROR');
  }
}

export type AbortReasonKind = 'user' | 'timeout' | 'budget' | 'superseded';

export class AbortedError extends ProviderError {
  
  readonly reason: AbortReasonKind;

  constructor(reason: AbortReasonKind, message?: string) {
    super(message ?? `执行已中止: ${reason}`, 'ABORTED');
    this.reason = reason;
  }
}
