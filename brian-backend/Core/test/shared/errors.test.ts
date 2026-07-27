import { describe, it, expect } from 'vitest';
import {
  CoreError,
  ValidationError,
  NotFoundError,
  ProcessingError,
} from '../../shared/errors';

describe('CoreError', () => {
  it('should create CoreError with error_code', () => {
    const err = new CoreError('test message', 'TEST_CODE');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('CoreError');
    expect(err.message).toBe('test message');
    expect(err.error_code).toBe('TEST_CODE');
  });
});

describe('ValidationError', () => {
  it('should have CORE_VALIDATION_ERROR code', () => {
    const err = new ValidationError('invalid input');
    expect(err).toBeInstanceOf(CoreError);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.error_code).toBe('CORE_VALIDATION_ERROR');
    expect(err.message).toBe('invalid input');
  });
});

describe('NotFoundError', () => {
  it('should format resource and id in message', () => {
    const err = new NotFoundError('资源', 'test-id');
    expect(err).toBeInstanceOf(CoreError);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.error_code).toBe('CORE_NOT_FOUND');
    expect(err.message).toContain('资源');
    expect(err.message).toContain('test-id');
  });
});

describe('ProcessingError', () => {
  it('should have CORE_PROCESSING_ERROR code', () => {
    const err = new ProcessingError('processing failed');
    expect(err).toBeInstanceOf(CoreError);
    expect(err).toBeInstanceOf(ProcessingError);
    expect(err.error_code).toBe('CORE_PROCESSING_ERROR');
    expect(err.message).toBe('processing failed');
  });
});
