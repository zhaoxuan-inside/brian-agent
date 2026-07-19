export class AppError extends Error {
  constructor(public statusCode: number, message: string, public code?: string) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) { super(404, `${resource} not found`, 'NOT_FOUND'); }
}

export class ValidationError extends AppError {
  constructor(message: string) { super(400, message, 'VALIDATION_ERROR'); }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(401, message, 'UNAUTHORIZED'); }
}

export class LLMError extends AppError {
  constructor(message: string, public providerId?: string) { super(502, message, 'LLM_ERROR'); }
}