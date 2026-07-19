import { describe, it, expect } from 'vitest';

// Import the logger module - it will use the default config (./data/logs)
// The logger already creates the log directory in its constructor
import { logger, getTraceId, runWithTraceId } from '../../src/infrastructure/logger';

describe('Logger', () => {
  it('should write info log without throwing', () => {
    expect(() => logger.info('TEST', 'test info message')).not.toThrow();
  });

  it('should write warn log without throwing', () => {
    expect(() => logger.warn('TEST', 'test warn message')).not.toThrow();
  });

  it('should write error log without throwing', () => {
    expect(() => logger.error('TEST', 'test error message')).not.toThrow();
  });

  it('should write debug log without throwing', () => {
    expect(() => logger.debug('TEST', 'test debug message')).not.toThrow();
  });

  it('should create request log without throwing', () => {
    expect(() => logger.request('HTTP', 'GET', '/api/test')).not.toThrow();
  });

  it('should create response log without throwing', () => {
    expect(() => logger.response('HTTP', 'GET', '/api/test', 200, 50)).not.toThrow();
  });

  it('should create agent log without throwing', () => {
    expect(() => logger.agent('TestAgent', 'task_completed', { result: 'ok' })).not.toThrow();
  });

  it('should log data objects without throwing', () => {
    expect(() => logger.info('TEST', 'data test', { key: 'value', count: 42 })).not.toThrow();
  });

  it('should handle Chinese characters', () => {
    expect(() => logger.info('TEST', '中文日志测试')).not.toThrow();
  });

  it('should handle special characters', () => {
    expect(() => logger.info('TEST', 'special chars: !@#$%^&*()')).not.toThrow();
  });

  it('should get undefined traceId when not set', () => {
    expect(getTraceId()).toBeUndefined();
  });

  it('should get traceId from context', () => {
    const traceId = 'trace-from-context';
    let captured: string | undefined;
    runWithTraceId(traceId, () => {
      captured = getTraceId();
    });
    expect(captured).toBe(traceId);
  });

  it('should restore traceId after context', () => {
    const traceId = 'trace-context';
    runWithTraceId(traceId, () => {
      // inside context
    });
    expect(getTraceId()).toBeUndefined();
  });
});