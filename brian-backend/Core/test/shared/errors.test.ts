import { describe, it, expect } from 'vitest';
import {
  ProviderError,
  ValidationError,
  NotFoundError,
  ProcessingError,
} from '../../shared/errors';

describe('ValidationError', () => {
  it('should have VALIDATION_ERROR code and be a ProviderError', () => {
    const err = new ValidationError('invalid input');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.error_code).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('invalid input');
  });
});

describe('NotFoundError', () => {
  it('should format resource and id in message', () => {
    const err = new NotFoundError('资源', 'test-id');
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.error_code).toBe('NOT_FOUND');
    expect(err.message).toContain('资源');
    expect(err.message).toContain('test-id');
  });
});

describe('ProcessingError', () => {
  it('should have PROCESSING_ERROR code', () => {
    const err = new ProcessingError('processing failed');
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toBeInstanceOf(ProcessingError);
    expect(err.error_code).toBe('PROCESSING_ERROR');
    expect(err.message).toBe('processing failed');
  });
});
