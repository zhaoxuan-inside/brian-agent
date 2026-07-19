import { z } from 'zod';
import { DBWrapper } from '../../base/DBWrapper';
import { SlidingWindowScorer } from '../SlidingWindowScorer';
import { logger } from '../../infrastructure/logger';

export const PersonalityTraitSchema = z.object({
  trait: z.string(),
  value: z.string(),
  weight: z.number().min(0).max(1).default(0.5),
});

export type PersonalityTrait = z.infer<typeof PersonalityTraitSchema>;

export const SoulConfigSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  personality: z.array(PersonalityTraitSchema),
  tone: z.string(),
  knowledgeBase: z.array(z.string()),
  constraints: z.array(z.string()),
  exampleResponses: z.array(z.string()),
  effectivenessScore: z.number().default(0),
  usageCount: z.number().default(0),
  isTemporary: z.boolean().default(false),
  createdAt: z.number(),
  updatedAt: z.number(),
  expiresAt: z.number().optional(),
});

export type SoulConfig = z.infer<typeof SoulConfigSchema>;

export interface SoulUsageResult {
  success: boolean;
  qualityScore: number;
  durationMs: number;
  userFeedback?: 'positive' | 'negative' | 'neutral';
}

export class SoulManager {
  private souls: Map<string, SoulConfig> = new Map();
  private scorer: SlidingWindowScorer;
  private readonly TEMP_SOUL_THRESHOLD = 0.6;
  private readonly TEMP_SOUL_EXPIRY_MS = 24 * 60 * 60 * 1000;
  private readonly TEMP_SOUL_MIN_USES = 5;

  constructor(private db: DBWrapper) {
    this.scorer = new SlidingWindowScorer({
      windowSizeMs: 7 * 24 * 60 * 60 * 1000,
      minEntriesForEvaluation: this.TEMP_SOUL_MIN_USES,
      decayRate: 0.02,
    });
  }

  async init(): Promise<void> {
    await this.loadSouls();
    await this.loadSlidingWindowScores();
  }

  private async loadSouls(): Promise<void> {
    const souls = await this.db.query<SoulConfig>('SELECT * FROM souls');
    for (const soul of souls) {
      this.souls.set(soul.id, soul);
    }
    logger.info('SoulManager', 'Loaded souls', { count: this.souls.size });
  }

  private async loadSlidingWindowScores(): Promise<void> {
    const scores = await this.db.query<any>(`
      SELECT s.id, s.name, s.is_temporary, s.effectiveness_score, s.usage_count
      FROM souls s
    `);

    for (const soul of scores) {
      if (soul.usage_count > 0) {
        for (let i = 0; i < Math.min(soul.usage_count, 10); i++) {
          const baseScore = soul.effectiveness_score || 0.7;
          const variance = (Math.random() - 0.5) * 0.2;
          this.scorer.addScore(soul.id, Math.max(0, Math.min(1, baseScore + variance)), {
            historical: true,
            offset: i,
          });
        }
      }
    }

    logger.info('SoulManager', 'Loaded sliding window scores', { count: scores.length });
  }

  async listSouls(userId?: string): Promise<SoulConfig[]> {
    if (userId) {
      return this.db.query<SoulConfig>('SELECT * FROM souls WHERE user_id = ?', [userId]);
    }
    return this.db.query<SoulConfig>('SELECT * FROM souls');
  }

  async getSoul(id: string): Promise<SoulConfig | undefined> {
    return this.db.get<SoulConfig>('SELECT * FROM souls WHERE id = ?', [id]);
  }

  async createSoul(soul: Omit<SoulConfig, 'id' | 'createdAt' | 'updatedAt' | 'expiresAt'> & { expiresAt?: number }): Promise<SoulConfig> {
    const id = require('uuid').v4();
    const now = Date.now();
    const config: SoulConfig = {
      ...soul,
      id,
      createdAt: now,
      updatedAt: now,
      expiresAt: soul.expiresAt,
    };

    await this.db.run(`
      INSERT INTO souls (id, user_id, name, personality, tone, knowledge_base, constraints, example_responses, effectiveness_score, usage_count, is_temporary, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      config.id,
      config.userId,
      config.name,
      JSON.stringify(config.personality),
      config.tone,
      JSON.stringify(config.knowledgeBase),
      JSON.stringify(config.constraints),
      JSON.stringify(config.exampleResponses),
      config.effectivenessScore,
      config.usageCount,
      config.isTemporary,
      config.createdAt,
      config.updatedAt,
      config.expiresAt || null,
    ]);

    this.souls.set(config.id, config);

    logger.info('SoulManager', 'Soul created', {
      soulId: id,
      name: config.name,
      isTemporary: config.isTemporary,
      expiresAt: config.expiresAt,
    });

    return config;
  }

  async createTemporarySoul(soul: Omit<SoulConfig, 'id' | 'createdAt' | 'updatedAt' | 'expiresAt' | 'isTemporary' | 'effectivenessScore' | 'usageCount'>): Promise<SoulConfig> {
    const now = Date.now();
    return this.createSoul({
      ...soul,
      isTemporary: true,
      effectivenessScore: 0,
      usageCount: 0,
      expiresAt: now + this.TEMP_SOUL_EXPIRY_MS,
    });
  }

  async updateSoul(id: string, updates: Partial<SoulConfig>): Promise<SoulConfig | undefined> {
    const existing = await this.getSoul(id);
    if (!existing) return undefined;

    const now = Date.now();
    const updated: SoulConfig = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.db.run(`
      UPDATE souls
      SET name = ?, personality = ?, tone = ?, knowledge_base = ?, constraints = ?, example_responses = ?, effectiveness_score = ?, is_temporary = ?, updated_at = ?, expires_at = ?
      WHERE id = ?
    `, [
      updated.name,
      JSON.stringify(updated.personality),
      updated.tone,
      JSON.stringify(updated.knowledgeBase),
      JSON.stringify(updated.constraints),
      JSON.stringify(updated.exampleResponses),
      updated.effectivenessScore,
      updated.isTemporary,
      updated.updatedAt,
      updated.expiresAt || null,
      id,
    ]);

    this.souls.set(id, updated);

    logger.info('SoulManager', 'Soul updated', { soulId: id, isTemporary: updated.isTemporary });

    return updated;
  }

  async resetSoul(id: string): Promise<void> {
    const now = Date.now();
    await this.db.run(`
      UPDATE souls
      SET personality = ?, tone = ?, knowledge_base = ?, constraints = ?, example_responses = ?, effectiveness_score = 0, usage_count = 0, updated_at = ?
      WHERE id = ?
    `, [
      JSON.stringify([]),
      'friendly',
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      now,
      id,
    ]);

    const soul = await this.getSoul(id);
    if (soul) {
      this.souls.set(id, soul);
    }

    this.scorer.clear(id);

    logger.info('SoulManager', 'Soul reset', { soulId: id });
  }

  async deleteSoul(id: string): Promise<void> {
    await this.db.run('DELETE FROM souls WHERE id = ?', [id]);
    this.souls.delete(id);
    this.scorer.clear(id);
    logger.info('SoulManager', 'Soul deleted', { soulId: id });
  }

  async useSoul(id: string, context?: Record<string, any>): Promise<SoulUsageResult> {
    const soul = this.souls.get(id);
    if (!soul) {
      throw new Error('Soul not found');
    }

    const startTime = Date.now();
    let success = true;
    let qualityScore = 0.75;

    try {
      qualityScore = this.evaluateSoulUsage(soul, context);
      
      this.scorer.addScore(id, qualityScore, {
        usage: true,
        contextKeys: context ? Object.keys(context).length : 0,
      });

      const scoreResult = this.scorer.getScore(id);
      await this.updateEffectivenessScore(id, scoreResult.weightedScore);

      if (soul.isTemporary) {
        await this.evaluateTemporarySoulRetention(id);
      }
    } catch (error) {
      success = false;
      qualityScore = 0;
      
      this.scorer.addScore(id, 0, {
        error: (error as Error).message,
      });

      const scoreResult = this.scorer.getScore(id);
      await this.updateEffectivenessScore(id, scoreResult.weightedScore);

      logger.warn('SoulManager', 'Soul usage failed', {
        soulId: id,
        error: (error as Error).message,
      });

      throw error;
    }

    await this.db.run('UPDATE souls SET usage_count = usage_count + 1 WHERE id = ?', [id]);

    const result: SoulUsageResult = {
      success,
      qualityScore,
      durationMs: Date.now() - startTime,
    };

    logger.info('SoulManager', 'Soul used', {
      soulId: id,
      name: soul.name,
      success,
      qualityScore: qualityScore.toFixed(4),
      durationMs: result.durationMs,
      isTemporary: soul.isTemporary,
    });

    return result;
  }

  recordSoulFeedback(id: string, feedback: 'positive' | 'negative' | 'neutral'): void {
    const scoreMap = {
      positive: 0.9,
      neutral: 0.6,
      negative: 0.2,
    };

    this.scorer.addScore(id, scoreMap[feedback], {
      feedback,
      source: 'user',
    });

    logger.info('SoulManager', 'Soul feedback recorded', {
      soulId: id,
      feedback,
      score: scoreMap[feedback],
    });
  }

  private evaluateSoulUsage(soul: SoulConfig, context?: Record<string, any>): number {
    let score = 0.7;

    if (soul.personality.length > 0) score += 0.1;
    if (soul.constraints.length > 0) score += 0.05;
    if (soul.exampleResponses.length > 0) score += 0.05;
    
    if (context) {
      const contextComplexity = JSON.stringify(context).length;
      if (contextComplexity > 200) score += 0.05;
    }

    return Math.min(1, Math.max(0, score));
  }

  private async updateEffectivenessScore(id: string, score: number): Promise<void> {
    await this.db.run('UPDATE souls SET effectiveness_score = ?, updated_at = ? WHERE id = ?', [
      score,
      Date.now(),
      id,
    ]);

    const soul = this.souls.get(id);
    if (soul) {
      soul.effectivenessScore = score;
    }
  }

  private async evaluateTemporarySoulRetention(id: string): Promise<void> {
    const soul = await this.getSoul(id);
    if (!soul || !soul.isTemporary) return;

    const now = Date.now();
    const scoreResult = this.scorer.getScore(id);

    logger.debug('SoulManager', 'Evaluating temporary soul retention', {
      soulId: id,
      name: soul.name,
      usageCount: soul.usageCount + 1,
      minUses: this.TEMP_SOUL_MIN_USES,
      currentScore: scoreResult.weightedScore.toFixed(4),
      threshold: this.TEMP_SOUL_THRESHOLD,
      expiresAt: soul.expiresAt,
      timeRemaining: soul.expiresAt ? soul.expiresAt - now : 'unlimited',
    });

    const isExpired = soul.expiresAt && now > soul.expiresAt;
    const hasEnoughUses = (soul.usageCount + 1) >= this.TEMP_SOUL_MIN_USES;
    const meetsThreshold = scoreResult.weightedScore >= this.TEMP_SOUL_THRESHOLD;

    if (isExpired) {
      logger.warn('SoulManager', 'Temporary soul expired, releasing', {
        soulId: id,
        name: soul.name,
        reason: 'expired',
        expiresAt: soul.expiresAt,
      });
      await this.releaseSoul(id, 'expired');
      return;
    }

    if (hasEnoughUses) {
      if (meetsThreshold) {
        await this.promoteTemporarySoul(id);
      } else {
        logger.warn('SoulManager', 'Temporary soul below threshold, releasing', {
          soulId: id,
          name: soul.name,
          reason: 'below_threshold',
          currentScore: scoreResult.weightedScore.toFixed(4),
          threshold: this.TEMP_SOUL_THRESHOLD,
          usageCount: soul.usageCount + 1,
        });
        await this.releaseSoul(id, 'below_threshold');
      }
    }
  }

  async promoteTemporarySoul(id: string): Promise<void> {
    await this.db.run('UPDATE souls SET is_temporary = false, expires_at = NULL WHERE id = ?', [id]);
    const soul = await this.getSoul(id);
    if (soul) {
      this.souls.set(id, { ...soul, isTemporary: false, expiresAt: undefined });
      logger.info('SoulManager', 'Temporary soul promoted to permanent', {
        soulId: id,
        name: soul.name,
        effectivenessScore: soul.effectivenessScore,
        usageCount: soul.usageCount,
      });
    }
  }

  private async releaseSoul(id: string, reason: string): Promise<void> {
    const soul = await this.getSoul(id);
    if (!soul) return;

    await this.db.run('DELETE FROM souls WHERE id = ?', [id]);
    this.souls.delete(id);
    this.scorer.clear(id);

    logger.warn('SoulManager', 'Temporary soul released', {
      soulId: id,
      name: soul.name,
      reason,
      effectivenessScore: soul.effectivenessScore,
      usageCount: soul.usageCount,
    });
  }

  getSlidingWindowScore(id: string) {
    return this.scorer.getScore(id);
  }

  async cleanupExpiredTemporarySouls(): Promise<number> {
    const now = Date.now();
    const expiredSouls = await this.db.query<SoulConfig>(
      'SELECT * FROM souls WHERE is_temporary = true AND expires_at IS NOT NULL AND expires_at < ?',
      [now]
    );

    for (const soul of expiredSouls) {
      await this.releaseSoul(soul.id, 'expired');
    }

    logger.info('SoulManager', 'Cleaned up expired temporary souls', {
      count: expiredSouls.length,
    });

    return expiredSouls.length;
  }
}
