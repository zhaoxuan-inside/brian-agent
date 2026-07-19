import { z } from 'zod';
import { DBWrapper } from '../../base/DBWrapper';
import { SlidingWindowScorer } from '../SlidingWindowScorer';
import { logger } from '../../infrastructure/logger';

export const SchemaFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string(),
  required: z.boolean(),
});

export type SchemaField = z.infer<typeof SchemaFieldSchema>;

export const SkillConfigSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  icon: z.string(),
  inputSchema: z.array(SchemaFieldSchema),
  outputSchema: z.array(SchemaFieldSchema),
  promptTemplate: z.string(),
  tools: z.array(z.string()),
  isInstalled: z.boolean().default(false),
  isTemporary: z.boolean().default(false),
  enabled: z.boolean().default(true),
  effectivenessScore: z.number().default(0),
  usageCount: z.number().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
  expiresAt: z.number().optional(),
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;

export interface SkillExecutionResult {
  success: boolean;
  output: Record<string, any>;
  qualityScore: number;
  durationMs: number;
}

export class SkillManager {
  private installedSkills: Map<string, SkillConfig> = new Map();
  private scorer: SlidingWindowScorer;
  private readonly TEMP_SKILL_THRESHOLD = 0.6;
  private readonly TEMP_SKILL_EXPIRY_MS = 24 * 60 * 60 * 1000;
  private readonly TEMP_SKILL_MIN_USES = 5;

  constructor(private db: DBWrapper) {
    this.scorer = new SlidingWindowScorer({
      windowSizeMs: 7 * 24 * 60 * 60 * 1000,
      minEntriesForEvaluation: this.TEMP_SKILL_MIN_USES,
      decayRate: 0.02,
    });
  }

  async init(): Promise<void> {
    await this.loadInstalledSkills();
    await this.loadSlidingWindowScores();
  }

  private async loadInstalledSkills(): Promise<void> {
    const skills = await this.db.query<SkillConfig>('SELECT * FROM skills WHERE is_installed = true');
    for (const skill of skills) {
      this.installedSkills.set(skill.id, skill);
    }
    logger.info('SkillManager', 'Loaded installed skills', { count: this.installedSkills.size });
  }

  private async loadSlidingWindowScores(): Promise<void> {
    const scores = await this.db.query<any>(`
      SELECT s.id, s.name, s.is_temporary, s.effectiveness_score, s.usage_count
      FROM skills s
      WHERE s.is_installed = true
    `);

    for (const skill of scores) {
      if (skill.usage_count > 0) {
        for (let i = 0; i < Math.min(skill.usage_count, 10); i++) {
          const baseScore = skill.effectiveness_score || 0.7;
          const variance = (Math.random() - 0.5) * 0.2;
          this.scorer.addScore(skill.id, Math.max(0, Math.min(1, baseScore + variance)), {
            historical: true,
            offset: i,
          });
        }
      }
    }

    logger.info('SkillManager', 'Loaded sliding window scores', { count: scores.length });
  }

  async listSkills(userId?: string): Promise<SkillConfig[]> {
    if (userId) {
      return this.db.query<SkillConfig>('SELECT * FROM skills WHERE user_id = ?', [userId]);
    }
    return this.db.query<SkillConfig>('SELECT * FROM skills');
  }

  async getSkill(id: string): Promise<SkillConfig | undefined> {
    return this.db.get<SkillConfig>('SELECT * FROM skills WHERE id = ?', [id]);
  }

  async createSkill(skill: Omit<SkillConfig, 'id' | 'createdAt' | 'updatedAt' | 'expiresAt'> & { expiresAt?: number }): Promise<SkillConfig> {
    const id = require('uuid').v4();
    const now = Date.now();
    const config: SkillConfig = {
      ...skill,
      id,
      createdAt: now,
      updatedAt: now,
      expiresAt: skill.expiresAt,
    };

    await this.db.run(`
      INSERT INTO skills (id, user_id, name, description, category, icon, input_schema, output_schema, prompt_template, tools, is_installed, is_temporary, enabled, effectiveness_score, usage_count, created_at, updated_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      config.id,
      config.userId,
      config.name,
      config.description,
      config.category,
      config.icon,
      JSON.stringify(config.inputSchema),
      JSON.stringify(config.outputSchema),
      config.promptTemplate,
      JSON.stringify(config.tools),
      config.isInstalled ? 1 : 0,
      config.isTemporary ? 1 : 0,
      config.enabled ? 1 : 0,
      config.effectivenessScore,
      config.usageCount,
      config.createdAt,
      config.updatedAt,
      config.expiresAt || null,
    ]);

    if (config.isInstalled) {
      this.installedSkills.set(config.id, config);
    }

    logger.info('SkillManager', 'Skill created', {
      skillId: id,
      name: config.name,
      isTemporary: config.isTemporary,
      expiresAt: config.expiresAt,
    });

    return config;
  }

  async createTemporarySkill(skill: Omit<SkillConfig, 'id' | 'createdAt' | 'updatedAt' | 'expiresAt' | 'isTemporary' | 'isInstalled'>): Promise<SkillConfig> {
    const now = Date.now();
    return this.createSkill({
      ...skill,
      isTemporary: true,
      isInstalled: true,
      effectivenessScore: 0,
      usageCount: 0,
      expiresAt: now + this.TEMP_SKILL_EXPIRY_MS,
    });
  }

  async updateSkill(id: string, updates: Partial<SkillConfig>): Promise<SkillConfig | undefined> {
    const existing = await this.getSkill(id);
    if (!existing) return undefined;

    const now = Date.now();
    const updated: SkillConfig = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.db.run(`
      UPDATE skills
      SET name = ?, description = ?, category = ?, icon = ?, input_schema = ?, output_schema = ?, prompt_template = ?, tools = ?, is_installed = ?, is_temporary = ?, enabled = ?, effectiveness_score = ?, updated_at = ?, expires_at = ?
      WHERE id = ?
    `, [
      updated.name,
      updated.description,
      updated.category,
      updated.icon,
      JSON.stringify(updated.inputSchema),
      JSON.stringify(updated.outputSchema),
      updated.promptTemplate,
      JSON.stringify(updated.tools),
      updated.isInstalled ? 1 : 0,
      updated.isTemporary ? 1 : 0,
      updated.enabled ? 1 : 0,
      updated.effectivenessScore,
      updated.updatedAt,
      updated.expiresAt || null,
      id,
    ]);

    if (updated.isInstalled) {
      this.installedSkills.set(id, updated);
    } else {
      this.installedSkills.delete(id);
    }

    logger.info('SkillManager', 'Skill updated', { skillId: id, isTemporary: updated.isTemporary });

    return updated;
  }

  async deleteSkill(id: string): Promise<void> {
    await this.db.run('DELETE FROM skills WHERE id = ?', [id]);
    this.installedSkills.delete(id);
    this.scorer.clear(id);
    logger.info('SkillManager', 'Skill deleted', { skillId: id });
  }

  async installSkill(id: string): Promise<void> {
    await this.db.run('UPDATE skills SET is_installed = true WHERE id = ?', [id]);
    const skill = await this.getSkill(id);
    if (skill) {
      this.installedSkills.set(id, skill);
      logger.info('SkillManager', 'Skill installed', { skillId: id, name: skill.name });
    }
  }

  async uninstallSkill(id: string): Promise<void> {
    await this.db.run('UPDATE skills SET is_installed = false WHERE id = ?', [id]);
    this.installedSkills.delete(id);
    logger.info('SkillManager', 'Skill uninstalled', { skillId: id });
  }

  async executeSkill(id: string, inputs: Record<string, any>): Promise<SkillExecutionResult> {
    const skill = this.installedSkills.get(id);
    if (!skill) {
      throw new Error('Skill not installed');
    }

    const startTime = Date.now();
    let success = true;
    let qualityScore = 0.8;
    let output: Record<string, any> = {};

    try {
      output = await this.runSkillLogic(skill, inputs);
      qualityScore = this.evaluateSkillExecution(skill, inputs, output);
      
      this.scorer.addScore(id, qualityScore, {
        execution: true,
        inputSize: JSON.stringify(inputs).length,
      });

      const scoreResult = this.scorer.getScore(id);
      await this.updateEffectivenessScore(id, scoreResult.weightedScore);

      if (skill.isTemporary) {
        await this.evaluateTemporarySkillRetention(id);
      }
    } catch (error) {
      success = false;
      qualityScore = 0;
      
      this.scorer.addScore(id, 0, {
        error: (error as Error).message,
      });

      const scoreResult = this.scorer.getScore(id);
      await this.updateEffectivenessScore(id, scoreResult.weightedScore);

      logger.warn('SkillManager', 'Skill execution failed', {
        skillId: id,
        error: (error as Error).message,
      });

      throw error;
    }

    await this.db.run('UPDATE skills SET usage_count = usage_count + 1 WHERE id = ?', [id]);

    const result: SkillExecutionResult = {
      success,
      output,
      qualityScore,
      durationMs: Date.now() - startTime,
    };

    logger.info('SkillManager', 'Skill executed', {
      skillId: id,
      name: skill.name,
      success,
      qualityScore: qualityScore.toFixed(4),
      durationMs: result.durationMs,
      isTemporary: skill.isTemporary,
    });

    return result;
  }

  private async runSkillLogic(skill: SkillConfig, inputs: Record<string, any>): Promise<Record<string, any>> {
    return {
      result: `Executed ${skill.name}`,
      inputs,
      timestamp: Date.now(),
    };
  }

  private evaluateSkillExecution(skill: SkillConfig, inputs: Record<string, any>, output: Record<string, any>): number {
    let score = 0.7;

    const outputKeys = Object.keys(output);
    if (outputKeys.length > 0) score += 0.1;
    if (output.result) score += 0.1;
    
    const inputComplexity = JSON.stringify(inputs).length;
    if (inputComplexity > 100) score += 0.05;

    return Math.min(1, Math.max(0, score));
  }

  private async updateEffectivenessScore(id: string, score: number): Promise<void> {
    await this.db.run('UPDATE skills SET effectiveness_score = ?, updated_at = ? WHERE id = ?', [
      score,
      Date.now(),
      id,
    ]);

    const skill = this.installedSkills.get(id);
    if (skill) {
      skill.effectivenessScore = score;
    }
  }

  private async evaluateTemporarySkillRetention(id: string): Promise<void> {
    const skill = await this.getSkill(id);
    if (!skill || !skill.isTemporary) return;

    const now = Date.now();
    const scoreResult = this.scorer.getScore(id);

    logger.debug('SkillManager', 'Evaluating temporary skill retention', {
      skillId: id,
      name: skill.name,
      usageCount: skill.usageCount + 1,
      minUses: this.TEMP_SKILL_MIN_USES,
      currentScore: scoreResult.weightedScore.toFixed(4),
      threshold: this.TEMP_SKILL_THRESHOLD,
      expiresAt: skill.expiresAt,
      timeRemaining: skill.expiresAt ? skill.expiresAt - now : 'unlimited',
    });

    const isExpired = skill.expiresAt && now > skill.expiresAt;
    const hasEnoughUses = (skill.usageCount + 1) >= this.TEMP_SKILL_MIN_USES;
    const meetsThreshold = scoreResult.weightedScore >= this.TEMP_SKILL_THRESHOLD;

    if (isExpired) {
      logger.warn('SkillManager', 'Temporary skill expired, uninstalling', {
        skillId: id,
        name: skill.name,
        reason: 'expired',
        expiresAt: skill.expiresAt,
      });
      await this.uninstallSkill(id);
      return;
    }

    if (hasEnoughUses) {
      if (meetsThreshold) {
        await this.promoteTemporarySkill(id);
      } else {
        logger.warn('SkillManager', 'Temporary skill below threshold, releasing', {
          skillId: id,
          name: skill.name,
          reason: 'below_threshold',
          currentScore: scoreResult.weightedScore.toFixed(4),
          threshold: this.TEMP_SKILL_THRESHOLD,
          usageCount: skill.usageCount + 1,
        });
        await this.uninstallSkill(id);
      }
    }
  }

  async promoteTemporarySkill(id: string): Promise<void> {
    await this.db.run('UPDATE skills SET is_temporary = false, expires_at = NULL WHERE id = ?', [id]);
    const skill = await this.getSkill(id);
    if (skill) {
      this.installedSkills.set(id, { ...skill, isTemporary: false, expiresAt: undefined });
      logger.info('SkillManager', 'Temporary skill promoted to permanent', {
        skillId: id,
        name: skill.name,
        effectivenessScore: skill.effectivenessScore,
        usageCount: skill.usageCount,
      });
    }
  }

  getSlidingWindowScore(id: string) {
    return this.scorer.getScore(id);
  }

  async cleanupExpiredTemporarySkills(): Promise<number> {
    const now = Date.now();
    const expiredSkills = await this.db.query<SkillConfig>(
      'SELECT * FROM skills WHERE is_temporary = true AND is_installed = true AND expires_at IS NOT NULL AND expires_at < ?',
      [now]
    );

    for (const skill of expiredSkills) {
      await this.uninstallSkill(skill.id);
    }

    logger.info('SkillManager', 'Cleaned up expired temporary skills', {
      count: expiredSkills.length,
    });

    return expiredSkills.length;
  }

  // ============================================================
  // 路由兼容方法
  // ============================================================

  async registerSkill(config: Omit<SkillConfig, 'id' | 'createdAt' | 'updatedAt' | 'expiresAt'> & { expiresAt?: number }): Promise<SkillConfig> {
    return this.createSkill(config);
  }

  async unregisterSkill(name: string): Promise<void> {
    const skills = await this.listSkills();
    const skill = skills.find(s => s.name === name);
    if (skill) {
      await this.deleteSkill(skill.id);
      logger.info('SkillManager', 'Skill unregistered by name', { name, skillId: skill.id });
    } else {
      logger.warn('SkillManager', 'Skill not found for unregistration', { name });
    }
  }
}
