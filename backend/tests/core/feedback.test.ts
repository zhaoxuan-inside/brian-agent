import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedbackService } from '../../src/core/feedback';
import { StorageService } from '../../src/core/storage';
import { initDatabase, closeDatabase } from '../../src/infrastructure/database';

import fs from 'fs';
import path from 'path';
import os from 'os';

describe('FeedbackService', () => {
  let feedback: FeedbackService;
  let storage: StorageService;
  let tempDir: string;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-feedback-'));
    originalEnv = { ...process.env };
    process.env.BRIAN_DATA_DIR = tempDir;
    process.env.BRIAN_DB_PATH = path.join(tempDir, 'brian.db');
    process.env.BRIAN_LOG_DIR = path.join(tempDir, 'logs');
    process.env.BRIAN_LOG_LEVEL = 'error';
    process.env.BRIAN_GRAPH_DB_PATH = path.join(tempDir, 'graph');
    process.env.BRIAN_VECTOR_DB_PATH = path.join(tempDir, 'vectors');
    process.env.BRIAN_USE_SQLITE_GRAPH = 'true';
    vi.resetModules();
    initDatabase();
    storage = new StorageService();
    feedback = new FeedbackService(storage);
  });

  afterEach(() => {
    closeDatabase();
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('BRIAN_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // --- Submit Feedback ---
  it('should submitFeedback with all fields', () => {
    const result = feedback.submitFeedback({
      messageId: 'msg-1',
      conversationId: 'conv-1',
      userId: 'user-1',
      rating: 'good',
      reason: 'Great answer',
      includeContext: false,
    });
    expect(result.id).toBeTruthy();

    const fb = feedback.getFeedback(result.id);
    expect(fb).toBeDefined();
    expect(fb.rating).toBe('good');
    expect(fb.reason).toBe('Great answer');
    expect(fb.userId).toBe('user-1');
  });

  it('should submitFeedback with error info', () => {
    const result = feedback.submitFeedback({
      messageId: 'msg-1',
      conversationId: 'conv-1',
      userId: 'user-1',
      rating: 'bad',
      errorInfo: { errorType: 'timeout', errorMessage: 'Request timed out' },
    });
    const fb = feedback.getFeedback(result.id);
    expect(fb.errorInfo).toBeDefined();
    expect(fb.errorInfo.errorType).toBe('timeout');
  });

  it('should submitFeedback with context', () => {
    storage.sqlite.createConversation('conv-1', 'user-1');
    storage.sqlite.createMessage({ id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'What is React?' });
    storage.sqlite.createMessage({ id: 'msg-2', conversationId: 'conv-1', role: 'assistant', content: 'React is a library' });

    const result = feedback.submitFeedback({
      messageId: 'msg-2',
      conversationId: 'conv-1',
      userId: 'user-1',
      rating: 'good',
      includeContext: true,
    });
    const fb = feedback.getFeedback(result.id);
    expect(fb.originalQuestion).toBe('What is React?');
    expect(fb.originalAnswer).toBe('React is a library');
    expect(fb.contextMessages).toBeDefined();
  });

  it('should submitRating', () => {
    const id = feedback.submitRating('msg-1', 'conv-1', 'user-1', 'good', 'Nice');
    const fb = feedback.getFeedback(id);
    expect(fb.rating).toBe('good');
    expect(fb.reason).toBe('Nice');
  });

  it('should submitErrorReport', () => {
    const id = feedback.submitErrorReport('msg-1', 'conv-1', 'user-1', { errorType: 'timeout', errorMessage: 'Timed out' }, 'Too slow');
    const fb = feedback.getFeedback(id);
    expect(fb.rating).toBe('bad');
    expect(fb.errorInfo).toBeDefined();
    expect(fb.reason).toBe('Too slow');
  });

  it('should collectContext', () => {
    storage.sqlite.createConversation('conv-1', 'user-1');
    storage.sqlite.createMessage({ id: 'msg-1', conversationId: 'conv-1', role: 'user', content: 'Hello' });
    storage.sqlite.createMessage({ id: 'msg-2', conversationId: 'conv-1', role: 'assistant', content: 'Hi there' });

    const ctx = feedback.collectContext('msg-2', 'conv-1');
    expect(ctx.originalQuestion).toBe('Hello');
    expect(ctx.originalAnswer).toBe('Hi there');
  });

  // --- List Feedback ---
  it('should listFeedback with status filter', () => {
    feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    feedback.submitFeedback({ messageId: 'm2', conversationId: 'c2', userId: 'u1', rating: 'bad' });

    const all = feedback.listFeedback();
    expect(all.length).toBe(2);

    const good = feedback.listFeedback({ rating: 'good' });
    expect(good.length).toBe(1);
  });

  it('should listFeedback with time filter', () => {
    const now = Date.now();
    feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });

    const results = feedback.listFeedback({ start: now - 1000, end: now + 1000 });
    expect(results.length).toBe(1);
  });

  it('should updateStatus', () => {
    const result = feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    feedback.updateStatus(result.id, 'reviewed');
    const fb = feedback.getFeedback(result.id);
    expect(fb.status).toBe('reviewed');
  });

  it('should deleteFeedback soft-delete', () => {
    const result = feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    feedback.deleteFeedback(result.id);
    const fb = feedback.getFeedback(result.id);
    expect(fb.status).toBe('dismissed');
  });

  // --- Rating Distribution ---
  it('should getRatingDistribution', () => {
    feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    feedback.submitFeedback({ messageId: 'm2', conversationId: 'c2', userId: 'u1', rating: 'good' });
    feedback.submitFeedback({ messageId: 'm3', conversationId: 'c3', userId: 'u1', rating: 'bad' });

    const dist = feedback.getRatingDistribution();
    expect(dist.good).toBe(2);
    expect(dist.bad).toBe(1);
    expect(dist.neutral).toBe(0);
  });

  it('should getPositiveCount', () => {
    feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    feedback.submitFeedback({ messageId: 'm2', conversationId: 'c2', userId: 'u1', rating: 'bad' });

    const count = feedback.getPositiveCount();
    expect(count).toBe(1);
  });

  it('should getNegativeCount', () => {
    feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'bad' });
    feedback.submitFeedback({ messageId: 'm2', conversationId: 'c2', userId: 'u1', rating: 'bad' });

    const count = feedback.getNegativeCount();
    expect(count).toBe(2);
  });

  it('should getTrend', () => {
    feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    feedback.submitFeedback({ messageId: 'm2', conversationId: 'c2', userId: 'u1', rating: 'bad' });

    const trend = feedback.getTrend();
    expect(trend.period).toBeDefined();
    expect(trend.ratingTrend).toBeDefined();
    expect(trend.errorTrend).toBeDefined();
  });

  // --- Analysis ---
  it('should analyze feedback', () => {
    feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    feedback.submitFeedback({ messageId: 'm2', conversationId: 'c2', userId: 'u1', rating: 'bad', reason: 'wrong answer' });

    const analysis = feedback.analyze();
    expect(analysis.totalCount).toBe(2);
    expect(analysis.ratingDistribution.good).toBe(1);
    expect(analysis.ratingDistribution.bad).toBe(1);
  });

  it('should classifyIssues', () => {
    const issues = feedback.classifyIssues([
      { errorInfo: { errorType: 'timeout', errorMessage: 'timeout' } },
      { errorInfo: { errorType: 'timeout', errorMessage: 'timeout again' } },
      { errorInfo: { errorMessage: 'network error' } },
    ]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].type).toBe('timeout');
    expect(issues[0].count).toBe(2);
  });

  it('should getCommonIssues', () => {
    feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'bad', reason: 'too slow' });
    feedback.submitFeedback({ messageId: 'm2', conversationId: 'c2', userId: 'u1', rating: 'bad', reason: 'too slow' });
    feedback.submitFeedback({ messageId: 'm3', conversationId: 'c3', userId: 'u1', rating: 'bad', reason: 'too slow' });

    const issues = feedback.getCommonIssues(2);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues).toContain('too slow');
  });

  it('should generateSuggestions', () => {
    const suggestions = feedback.generateSuggestions({
      ratingDistribution: { good: 1, neutral: 0, bad: 5 },
      errorStats: { commonErrors: [{ type: 'timeout', count: 3 }] },
      commonIssues: ['too slow'],
    });
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should generateSuggestions for no feedback', () => {
    const suggestions = feedback.generateSuggestions({
      ratingDistribution: { good: 0, neutral: 0, bad: 0 },
      errorStats: { commonErrors: [] },
      commonIssues: [],
    });
    expect(suggestions).toContain('No feedback collected yet');
  });

  // --- Log Correlation ---
  it('should correlateByTraceId return empty when no logs', () => {
    const logs = feedback.correlateByTraceId('nonexistent-trace');
    expect(logs).toEqual([]);
  });

  it('should extractKeyLogs filter by level', () => {
    const logs = [
      { level: 'error', module: 'test', message: 'error msg', timestamp: Date.now() },
      { level: 'info', module: 'test', message: 'info msg', timestamp: Date.now() },
    ];
    const result = feedback.extractKeyLogs(logs, { level: 'error' });
    expect(result.length).toBe(1);
    expect(result[0].level).toBe('error');
  });

  it('should extractKeyLogs filter by module', () => {
    const logs = [
      { level: 'info', module: 'llm', message: 'llm msg', timestamp: Date.now() },
      { level: 'info', module: 'api', message: 'api msg', timestamp: Date.now() },
    ];
    const result = feedback.extractKeyLogs(logs, { module: 'llm' });
    expect(result.length).toBe(1);
  });

  it('should extractErrorLogs', () => {
    const logs = [
      { level: 'error', module: 'test', message: 'err', timestamp: Date.now() },
      { level: 'info', module: 'test', message: 'info', timestamp: Date.now() },
      { level: 'warn', module: 'test', message: 'warn', timestamp: Date.now() },
    ];
    const result = feedback.extractErrorLogs(logs);
    expect(result.length).toBe(1);
  });

  it('should extractLLMLogs', () => {
    const logs = [
      { level: 'info', module: 'llm', message: 'llm call', timestamp: Date.now() },
      { level: 'info', module: 'api', message: 'api call', timestamp: Date.now() },
      { level: 'info', module: 'test', message: 'Using openai for completion', timestamp: Date.now() },
    ];
    const result = feedback.extractLLMLogs(logs);
    expect(result.length).toBe(2);
  });

  it('should attachToFeedback', () => {
    const result = feedback.submitFeedback({ messageId: 'm1', conversationId: 'c1', userId: 'u1', rating: 'good' });
    feedback.attachToFeedback(result.id, [
      { level: 'info', module: 'llm', message: 'test log', timestamp: Date.now() },
    ]);
    const fb = feedback.getFeedback(result.id);
    expect(fb.relatedLogs).toBeDefined();
    expect(fb.relatedLogs.length).toBe(1);
  });
});