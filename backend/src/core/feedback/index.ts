import { StorageService } from '../storage';
import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../../infrastructure/config';
import fs from 'fs';
import path from 'path';


export class FeedbackService {
  private storage: StorageService;

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  // ============================================================
  // Collector
  // ============================================================

  submitFeedback(input: {
    messageId: string;
    conversationId: string;
    userId: string;
    rating: string;
    reason?: string;
    errorInfo?: any;
    includeContext?: boolean;
    logTraceId?: string;
  }): { id: string } {
    const id = uuidv4();

    // Collect context if requested
    let originalQuestion: string | undefined;
    let originalAnswer: string | undefined;
    let contextMessages: string | undefined;

    if (input.includeContext) {
      const ctx = this.collectContext(input.messageId, input.conversationId);
      originalQuestion = ctx.originalQuestion;
      originalAnswer = ctx.originalAnswer;
      contextMessages = JSON.stringify(ctx.contextMessages);
    }

    this.storage.sqlite.createFeedback({
      id,
      messageId: input.messageId,
      conversationId: input.conversationId,
      userId: input.userId,
      rating: input.rating,
      reason: input.reason,
      errorInfo: input.errorInfo ? JSON.stringify(input.errorInfo) : undefined,
      includeContext: input.includeContext ? 1 : 0,
      originalQuestion,
      originalAnswer,
      contextMessages,
      logTraceId: input.logTraceId,
    });

    return { id };
  }

  submitRating(
    messageId: string,
    conversationId: string,
    userId: string,
    rating: string,
    reason?: string
  ): string {
    const result = this.submitFeedback({
      messageId,
      conversationId,
      userId,
      rating,
      reason,
      includeContext: false,
    });
    return result.id;
  }

  submitErrorReport(
    messageId: string,
    conversationId: string,
    userId: string,
    errorInfo: any,
    description?: string
  ): string {
    const result = this.submitFeedback({
      messageId,
      conversationId,
      userId,
      rating: 'bad',
      reason: description,
      errorInfo,
      includeContext: true,
      logTraceId: errorInfo?.traceId || errorInfo?.logTraceId,
    });
    return result.id;
  }

  collectContext(
    messageId: string,
    conversationId: string
  ): { originalQuestion: string; originalAnswer: string; contextMessages: any[] } {
    const messages = this.storage.sqlite.getMessages(conversationId);
    const targetIdx = messages.findIndex((m: any) => m.id === messageId);

    let originalQuestion = '';
    let originalAnswer = '';
    const contextMessages: any[] = [];

    if (targetIdx >= 0) {
      const target = messages[targetIdx];
      if (target.role === 'assistant') {
        originalAnswer = target.content;
        // Find the preceding user message
        for (let i = targetIdx - 1; i >= 0; i--) {
          if (messages[i].role === 'user') {
            originalQuestion = messages[i].content;
            break;
          }
        }
      } else {
        originalQuestion = target.content;
        // Find the following assistant message
        for (let i = targetIdx + 1; i < messages.length; i++) {
          if (messages[i].role === 'assistant') {
            originalAnswer = messages[i].content;
            break;
          }
        }
      }

      // Collect surrounding context (last 5 messages before target)
      const startIdx = Math.max(0, targetIdx - 5);
      for (let i = startIdx; i < targetIdx; i++) {
        contextMessages.push({
          role: messages[i].role,
          content: messages[i].content,
          timestamp: messages[i].createdAt,
        });
      }
    }

    return { originalQuestion, originalAnswer, contextMessages };
  }

  getFeedback(feedbackId: string): any {
    return this.storage.sqlite.getFeedback(feedbackId);
  }

  listFeedback(filters?: { status?: string; rating?: string; start?: number; end?: number }): any[] {
    return this.storage.sqlite.listFeedback(filters);
  }

  updateStatus(feedbackId: string, status: string): void {
    this.storage.sqlite.updateFeedbackStatus(feedbackId, status);
  }

  deleteFeedback(feedbackId: string): void {
    // Soft delete by setting status to 'dismissed'
    this.storage.sqlite.updateFeedbackStatus(feedbackId, 'dismissed');
  }

  // ============================================================
  // Analyzer
  // ============================================================

  analyze(feedbacks?: any[]): {
    totalCount: number;
    ratingDistribution: { good: number; neutral: number; bad: number };
    errorStats: { totalErrors: number; commonErrors: { type: string; count: number }[] };
    commonIssues: string[];
    suggestions: string[];
    trend: { period: string; ratingTrend: number[]; errorTrend: number[] };
  } {
    const data = feedbacks || this.listFeedback();

    const totalCount = data.length;
    const ratingDistribution = { good: 0, neutral: 0, bad: 0 };
    const errors: any[] = [];

    for (const fb of data) {
      if (fb.rating === 'good') ratingDistribution.good++;
      else if (fb.rating === 'neutral') ratingDistribution.neutral++;
      else if (fb.rating === 'bad') ratingDistribution.bad++;

      if (fb.errorInfo) {
        errors.push(fb.errorInfo);
      }
    }

    const errorStats = {
      totalErrors: errors.length,
      commonErrors: this.classifyIssues(errors.map(e => ({ errorInfo: e }))),
    };

    const commonIssues = this.getCommonIssues(2);
    const suggestions = this.generateSuggestions({
      ratingDistribution,
      errorStats,
      commonIssues,
    });

    const trend = this.getTrend();

    return {
      totalCount,
      ratingDistribution,
      errorStats,
      commonIssues,
      suggestions,
      trend,
    };
  }

  getPositiveCount(timeRange?: { start: number; end: number }): number {
    const filters: any = { rating: 'good' };
    if (timeRange) {
      filters.start = timeRange.start;
      filters.end = timeRange.end;
    }
    return this.listFeedback(filters).length;
  }

  getNegativeCount(timeRange?: { start: number; end: number }): number {
    const filters: any = { rating: 'bad' };
    if (timeRange) {
      filters.start = timeRange.start;
      filters.end = timeRange.end;
    }
    return this.listFeedback(filters).length;
  }

  getRatingDistribution(timeRange?: { start: number; end: number }): { good: number; neutral: number; bad: number } {
    const filters: any = {};
    if (timeRange) {
      filters.start = timeRange.start;
      filters.end = timeRange.end;
    }

    const data = this.listFeedback(filters);
    const distribution = { good: 0, neutral: 0, bad: 0 };

    for (const fb of data) {
      if (fb.rating === 'good') distribution.good++;
      else if (fb.rating === 'neutral') distribution.neutral++;
      else if (fb.rating === 'bad') distribution.bad++;
    }

    return distribution;
  }

  getTrend(timeRange?: { start: number; end: number }): { period: string; ratingTrend: number[]; errorTrend: number[] } {
    const now = Date.now();
    const start = timeRange?.start || (now - 7 * 24 * 60 * 60 * 1000); // Default: last 7 days
    const end = timeRange?.end || now;

    const data = this.listFeedback({ start, end });

    // Group by day
    const dayBuckets: Map<string, { ratings: { good: number; neutral: number; bad: number }; errors: number }> = new Map();

    for (const fb of data) {
      const day = new Date(fb.createdAt).toISOString().slice(0, 10);
      if (!dayBuckets.has(day)) {
        dayBuckets.set(day, { ratings: { good: 0, neutral: 0, bad: 0 }, errors: 0 });
      }
      const bucket = dayBuckets.get(day)!;
      if (fb.rating === 'good') bucket.ratings.good++;
      else if (fb.rating === 'neutral') bucket.ratings.neutral++;
      else if (fb.rating === 'bad') bucket.ratings.bad++;
      if (fb.errorInfo) bucket.errors++;
    }

    const sortedDays = Array.from(dayBuckets.keys()).sort();
    const ratingTrend: number[] = [];
    const errorTrend: number[] = [];

    for (const day of sortedDays) {
      const bucket = dayBuckets.get(day)!;
      const total = bucket.ratings.good + bucket.ratings.neutral + bucket.ratings.bad;
      // Score: good=1, neutral=0, bad=-1, normalized
      const score = total > 0
        ? (bucket.ratings.good - bucket.ratings.bad) / total
        : 0;
      ratingTrend.push(Math.round(score * 100) / 100);
      errorTrend.push(bucket.errors);
    }

    const period = `${new Date(start).toISOString().slice(0, 10)} to ${new Date(end).toISOString().slice(0, 10)}`;

    return { period, ratingTrend, errorTrend };
  }

  classifyIssues(negativeFeedbacks: any[]): { type: string; count: number }[] {
    const issueMap: Map<string, number> = new Map();

    for (const fb of negativeFeedbacks) {
      const errorInfo = fb.errorInfo || fb;
      let type = 'unknown';

      if (errorInfo.errorType) {
        type = errorInfo.errorType;
      } else if (errorInfo.errorMessage) {
        const msg = errorInfo.errorMessage.toLowerCase();
        if (msg.includes('timeout')) type = 'timeout';
        else if (msg.includes('rate limit') || msg.includes('429')) type = 'rate_limit';
        else if (msg.includes('token') || msg.includes('context length')) type = 'token_limit';
        else if (msg.includes('connection') || msg.includes('network')) type = 'network';
        else if (msg.includes('permission') || msg.includes('unauthorized')) type = 'permission';
        else if (msg.includes('not found') || msg.includes('404')) type = 'not_found';
        else if (msg.includes('validation') || msg.includes('invalid')) type = 'validation';
        else if (msg.includes('memory') || msg.includes('heap')) type = 'memory';
        else type = 'general_error';
      }

      issueMap.set(type, (issueMap.get(type) || 0) + 1);
    }

    return Array.from(issueMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  getCommonIssues(threshold: number = 3): string[] {
    const allFeedback = this.listFeedback();
    const negativeWithReasons = allFeedback.filter(
      (f: any) => f.rating === 'bad' && f.reason
    );

    const reasonCount: Map<string, number> = new Map();
    for (const fb of negativeWithReasons) {
      const reason = fb.reason.toLowerCase().trim();
      reasonCount.set(reason, (reasonCount.get(reason) || 0) + 1);
    }

    return Array.from(reasonCount.entries())
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([reason]) => reason);
  }

  generateSuggestions(analysis: any): string[] {
    const suggestions: string[] = [];

    const { ratingDistribution, errorStats } = analysis;

    // High error rate suggestion
    if (ratingDistribution.bad > 0) {
      const total = ratingDistribution.good + ratingDistribution.neutral + ratingDistribution.bad;
      const badRate = total > 0 ? ratingDistribution.bad / total : 0;

      if (badRate > 0.3) {
        suggestions.push('High error rate detected. Consider reviewing recent changes and monitoring system health.');
        suggestions.push('Enable more detailed logging to identify root causes of errors.');
      }

      if (badRate > 0.1) {
        suggestions.push('Consider implementing a response quality validation step before sending answers to users.');
      }
    }

    // Specific error suggestions
    if (errorStats?.commonErrors) {
      for (const err of errorStats.commonErrors) {
        switch (err.type) {
          case 'timeout':
            suggestions.push('Timeout errors detected. Consider increasing timeout limits or optimizing long-running operations.');
            break;
          case 'rate_limit':
            suggestions.push('Rate limit errors detected. Implement exponential backoff and request queuing.');
            break;
          case 'token_limit':
            suggestions.push('Token limit errors detected. Consider truncating context or using a model with larger context window.');
            break;
          case 'network':
            suggestions.push('Network errors detected. Check connectivity and consider implementing retry with backoff.');
            break;
          case 'permission':
            suggestions.push('Permission errors detected. Review access control configuration and API key validity.');
            break;
          case 'validation':
            suggestions.push('Validation errors detected. Review input validation rules and error messages for clarity.');
            break;
          case 'memory':
            suggestions.push('Memory errors detected. Consider increasing memory limits or optimizing memory usage.');
            break;
        }
      }
    }

    // Low positive rate
    if (ratingDistribution.good === 0 && ratingDistribution.neutral === 0 && ratingDistribution.bad === 0) {
      suggestions.push('No feedback collected yet');
    } else {
      const total = ratingDistribution.good + ratingDistribution.neutral + ratingDistribution.bad;
      const goodRate = total > 0 ? ratingDistribution.good / total : 0;
      if (goodRate < 0.5 && total > 5) {
        suggestions.push('Positive feedback rate is below 50%. Review response quality and accuracy.');
        suggestions.push('Consider A/B testing different response strategies to improve user satisfaction.');
      }
    }

    if (suggestions.length === 0) {
      suggestions.push('System is performing well. Continue monitoring feedback trends.');
    }

    return suggestions;
  }

  // ============================================================
  // Log Correlator
  // ============================================================

  correlateByTraceId(traceId: string): { level: string; module: string; message: string; timestamp: number }[] {
    const config = getConfig();
    const logDir = path.resolve(config.logDir);

    if (!fs.existsSync(logDir)) {
      return [];
    }

    const results: { level: string; module: string; message: string; timestamp: number }[] = [];

    try {
      const files = fs.readdirSync(logDir)
        .filter(f => f.startsWith('brian-agent-') && f.endsWith('.log'))
        .sort()
        .reverse(); // Most recent first

      for (const file of files) {
        const filePath = path.join(logDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          // Match the log format: [timestamp] [traceId] [LEVEL] [module] message
          if (line.includes(traceId)) {
            const parsed = this.parseLogLine(line);
            if (parsed) {
              results.push(parsed);
            }
          }
        }
      }
    } catch {
      // Log directory may not exist
    }

    return results;
  }

  extractKeyLogs(
    logs: any[],
    filters?: { level?: string; module?: string }
  ): any[] {
    let filtered = logs;

    if (filters?.level) {
      filtered = filtered.filter(l => l.level === filters.level);
    }
    if (filters?.module) {
      filtered = filtered.filter(l => l.module === filters.module);
    }

    return filtered;
  }

  extractErrorLogs(logs: any[]): any[] {
    return logs.filter(l => l.level === 'error');
  }

  extractLLMLogs(logs: any[]): any[] {
    return logs.filter(l =>
      l.module === 'llm' ||
      l.module === 'LLMService' ||
      (l.message && (
        l.message.includes('openai') ||
        l.message.includes('anthropic') ||
        l.message.includes('gemini') ||
        l.message.includes('llm') ||
        l.message.includes('LLM')
      ))
    );
  }

  attachToFeedback(feedbackId: string, logs: any[]): void {
    const feedback = this.storage.sqlite.getFeedback(feedbackId);
    if (!feedback) return;

    const existingLogs = feedback.related_logs ? JSON.parse(feedback.related_logs) : [];
    const merged = [...existingLogs, ...logs];

    this.storage.sqlite.updateFeedback(feedbackId, {
      relatedLogs: JSON.stringify(merged),
    });
  }

  // ============================================================
  // Helpers
  // ============================================================

  private parseLogLine(line: string): { level: string; module: string; message: string; timestamp: number } | null {
    // Format: [2024-01-01T00:00:00.000Z] [traceId] [LEVEL] [module] message
    const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]*)\]\s+\[(\w+)\]\s+\[([^\]]*)\]\s+(.+)/);
    if (!match) return null;

    const timestamp = new Date(match[1]).getTime();
    if (isNaN(timestamp)) return null;

    return {
      timestamp,
      level: match[3].toLowerCase(),
      module: match[4],
      message: match[5],
    };
  }
}