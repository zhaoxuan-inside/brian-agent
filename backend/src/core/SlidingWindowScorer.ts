import { logger } from '../infrastructure/logger';

export interface SlidingWindowEntry {
  timestamp: number;
  score: number;
  metadata?: Record<string, any>;
}

export interface SlidingWindowResult {
  averageScore: number;
  weightedScore: number;
  entryCount: number;
  recentTrend: 'improving' | 'declining' | 'stable';
  entries: SlidingWindowEntry[];
}

export class SlidingWindowScorer {
  private entries: Map<string, SlidingWindowEntry[]> = new Map();
  private windowSizeMs: number;
  private minEntriesForEvaluation: number;
  private decayRate: number;

  constructor(options?: {
    windowSizeMs?: number;
    minEntriesForEvaluation?: number;
    decayRate?: number;
  }) {
    this.windowSizeMs = options?.windowSizeMs || 24 * 60 * 60 * 1000;
    this.minEntriesForEvaluation = options?.minEntriesForEvaluation || 3;
    this.decayRate = options?.decayRate || 0.05;
  }

  addScore(id: string, score: number, metadata?: Record<string, any>): void {
    const entry: SlidingWindowEntry = {
      timestamp: Date.now(),
      score,
      metadata,
    };

    const current = this.entries.get(id) || [];
    current.push(entry);
    this.entries.set(id, current);

    this.cleanupOldEntries(id);

    logger.debug('SlidingWindowScorer', 'Score added to sliding window', {
      id,
      score,
      totalEntries: current.length,
      windowSizeMs: this.windowSizeMs,
    });
  }

  getScore(id: string): SlidingWindowResult {
    const entries = this.getValidEntries(id);
    const entryCount = entries.length;

    if (entryCount === 0) {
      return {
        averageScore: 0,
        weightedScore: 0,
        entryCount: 0,
        recentTrend: 'stable',
        entries: [],
      };
    }

    const now = Date.now();
    let totalWeight = 0;
    let weightedSum = 0;
    let simpleSum = 0;

    for (const entry of entries) {
      const ageMs = now - entry.timestamp;
      const weight = Math.max(0.1, Math.exp(-this.decayRate * (ageMs / (60 * 60 * 1000))));
      weightedSum += entry.score * weight;
      totalWeight += weight;
      simpleSum += entry.score;
    }

    const averageScore = simpleSum / entryCount;
    const weightedScore = totalWeight > 0 ? weightedSum / totalWeight : averageScore;

    const recentTrend = this.calculateTrend(entries);

    const result: SlidingWindowResult = {
      averageScore,
      weightedScore,
      entryCount,
      recentTrend,
      entries,
    };

    logger.debug('SlidingWindowScorer', 'Score calculated', {
      id,
      entryCount,
      averageScore: averageScore.toFixed(4),
      weightedScore: weightedScore.toFixed(4),
      recentTrend,
    });

    return result;
  }

  shouldRetain(id: string, threshold: number): boolean {
    const score = this.getScore(id);
    
    if (score.entryCount < this.minEntriesForEvaluation) {
      logger.debug('SlidingWindowScorer', 'Not enough entries for retention evaluation, retaining', {
        id,
        entryCount: score.entryCount,
        minRequired: this.minEntriesForEvaluation,
      });
      return true;
    }

    const shouldRetain = score.weightedScore >= threshold;
    
    logger.info('SlidingWindowScorer', 'Retention evaluation', {
      id,
      weightedScore: score.weightedScore.toFixed(4),
      threshold,
      shouldRetain,
      entryCount: score.entryCount,
    });

    return shouldRetain;
  }

  clear(id: string): void {
    this.entries.delete(id);
    logger.debug('SlidingWindowScorer', 'Cleared sliding window', { id });
  }

  private getValidEntries(id: string): SlidingWindowEntry[] {
    this.cleanupOldEntries(id);
    return this.entries.get(id) || [];
  }

  private cleanupOldEntries(id: string): void {
    const now = Date.now();
    const entries = this.entries.get(id) || [];
    const validEntries = entries.filter(e => now - e.timestamp <= this.windowSizeMs);
    
    if (validEntries.length !== entries.length) {
      this.entries.set(id, validEntries);
      logger.debug('SlidingWindowScorer', 'Cleaned up old entries', {
        id,
        removed: entries.length - validEntries.length,
        remaining: validEntries.length,
      });
    }
  }

  private calculateTrend(entries: SlidingWindowEntry[]): 'improving' | 'declining' | 'stable' {
    if (entries.length < 4) return 'stable';

    const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    const midPoint = Math.floor(sorted.length / 2);
    
    const firstHalf = sorted.slice(0, midPoint);
    const secondHalf = sorted.slice(midPoint);
    
    const firstAvg = firstHalf.reduce((sum, e) => sum + e.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, e) => sum + e.score, 0) / secondHalf.length;
    
    const diff = secondAvg - firstAvg;
    const threshold = 0.05;

    if (diff > threshold) return 'improving';
    if (diff < -threshold) return 'declining';
    return 'stable';
  }
}
