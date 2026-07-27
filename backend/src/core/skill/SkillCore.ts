import { Input, Context, Output } from '../../shared/base';
import { DBWrapper } from '../../base/DBWrapper';
import { LLMService } from '../llm/LLMService';
import { SkillManager, SkillConfig } from './SkillManager';
import { logger } from '../../infrastructure/logger';

export class MatchSkillInput extends Input {
  agent_id: string;
  interact_id: string;
  constructor(data?: Partial<MatchSkillInput>) {
    super(data);
    this.agent_id = data?.agent_id || '';
    this.interact_id = data?.interact_id || '';
  }
}

export class MatchSkillOutput extends Output {
  skill_ids: string[];
  constructor(data?: Partial<MatchSkillOutput>) {
    super(data);
    this.skill_ids = data?.skill_ids || [];
  }
}

export class OptimizeSkillInput extends Input {
  agent_id: string;
  interact_id: string;
  skill_id: string;
  constructor(data?: Partial<OptimizeSkillInput>) {
    super(data);
    this.agent_id = data?.agent_id || '';
    this.interact_id = data?.interact_id || '';
    this.skill_id = data?.skill_id || '';
  }
}

export class OptimizeSkillOutput extends Output {
  constructor(data?: Partial<OptimizeSkillOutput>) {
    super(data);
  }
}

export class AgeSkillOutput extends Output {
  aged_count: number;
  constructor(data?: Partial<AgeSkillOutput>) {
    super(data);
    this.aged_count = data?.aged_count || 0;
  }
}

export class GetSkillRuleInput extends Input {
  conditions?: any;
  order_by?: string;
  page?: { page_size: number; page_num: number };
  constructor(data?: Partial<GetSkillRuleInput>) {
    super(data);
    this.conditions = data?.conditions;
    this.order_by = data?.order_by;
    this.page = data?.page;
  }
}

export class GetSkillRuleOutput extends Output {
  rules: Array<{ id: string; days: number; min_usage_count: number }>;
  constructor(data?: Partial<GetSkillRuleOutput>) {
    super(data);
    this.rules = data?.rules || [];
  }
}

export class UpdateSkillRuleInput extends Input {
  operations: Array<{ type: 'INSERT' | 'UPDATE' | 'DELETE'; id?: string; data?: { days: number; min_usage_count: number } }>;
  constructor(data?: Partial<UpdateSkillRuleInput>) {
    super(data);
    this.operations = data?.operations || [];
  }
}

export class UpdateSkillRuleOutput extends Output {
  constructor(data?: Partial<UpdateSkillRuleOutput>) {
    super(data);
  }
}

export class ConfigSkillCoreInput extends Input {
  regen_rate?: number;
  prompt_template_id?: string;
  constructor(data?: Partial<ConfigSkillCoreInput>) {
    super(data);
    this.regen_rate = data?.regen_rate;
    this.prompt_template_id = data?.prompt_template_id;
  }
}

export class ConfigSkillCoreOutput extends Output {
  constructor(data?: Partial<ConfigSkillCoreOutput>) {
    super(data);
  }
}

export class SkillCore {
  private readonly DEFAULT_REGEN_RATE = 75;

  constructor(
    private db: DBWrapper,
    private llmService: LLMService,
    private skillManager: SkillManager
  ) {}

  async matchSkill(input: MatchSkillInput, context: Context, output: MatchSkillOutput): Promise<boolean> {
    try {
      const regenRate = await this.getRegenRate();

      const existingBinding = await this.db.get<{ skill_id: string }>(
        'SELECT skill_id FROM agent_skill WHERE agent_id = ?',
        [input.agent_id]
      );

      if (existingBinding) {
        const shouldRegen = Math.floor(Math.random() * 100) < regenRate;
        if (!shouldRegen) {
          output.skill_ids = [existingBinding.skill_id];
          logger.info('SkillCore', 'matchSkill: using existing binding', {
            agent_id: input.agent_id,
            skill_id: existingBinding.skill_id,
          });
          return true;
        }
      }

      const skills = await this.skillManager.listSkills();
      const enabledSkills = skills.filter(s => s.enabled);

      if (enabledSkills.length === 0) {
        logger.info('SkillCore', 'matchSkill: no skills available');
        output.skill_ids = [];
        return true;
      }

      if (enabledSkills.length === 1) {
        output.skill_ids = [enabledSkills[0].id];
        logger.info('SkillCore', 'matchSkill: single skill available', {
          agent_id: input.agent_id,
          skill_id: enabledSkills[0].id,
        });
        return true;
      }

      const skillList = enabledSkills.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        effectiveness_score: s.effectivenessScore,
        usage_count: s.usageCount,
      }));

      const prompt = `You are a skill selector for an AI agent. Given the following available skills, select the best matching skill_ids for the agent's current work.

Available skills:
${JSON.stringify(skillList, null, 2)}

Select the most appropriate skill_ids. Return ONLY a JSON array of skill_id strings, nothing else.
Example: ["skill-id-1", "skill-id-2"]`;

      const response = await this.llmService.chatCompletion({
        model: '',
        messages: [
          { role: 'system', content: 'You select skills for AI agents. Return only a JSON array of skill_id strings.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 1024,
      });

      const content = response.choices[0]?.message?.content || '[]';
      const selectedIds = JSON.parse(content) as string[];

      const validIds = selectedIds.filter((id: string) => enabledSkills.some(s => s.id === id));
      output.skill_ids = validIds;

      logger.info('SkillCore', 'matchSkill: LLM selected skills', {
        agent_id: input.agent_id,
        skill_ids: validIds,
      });

      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SkillCore', 'matchSkill failed', { error: (error as Error).message });
      return false;
    }
  }

  async optimizeSkill(input: OptimizeSkillInput, context: Context, output: OptimizeSkillOutput): Promise<boolean> {
    try {
      const existingBindings = await this.db.query<{ skill_id: string }>(
        'SELECT skill_id FROM agent_skill WHERE agent_id = ?',
        [input.agent_id]
      );

      const existingSkillIds = existingBindings.map(b => b.skill_id);

      if (existingSkillIds.includes(input.skill_id)) {
        logger.info('SkillCore', 'optimizeSkill: skill already bound', {
          agent_id: input.agent_id,
          skill_id: input.skill_id,
        });
        return true;
      }

      await this.db.run(
        `INSERT OR REPLACE INTO agent_skill (agent_id, skill_id, created_at)
         VALUES (?, ?, ?)`,
        [input.agent_id, input.skill_id, Date.now()]
      );

      logger.info('SkillCore', 'optimizeSkill: skill bound', {
        agent_id: input.agent_id,
        skill_id: input.skill_id,
      });

      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SkillCore', 'optimizeSkill failed', { error: (error as Error).message });
      return false;
    }
  }

  async ageSkill(input: Input, context: Context, output: AgeSkillOutput): Promise<boolean> {
    try {
      const rules = await this.db.query<{ id: string; days: number; min_usage_count: number }>(
        'SELECT id, days, min_usage_count FROM skill_opt_rule'
      );

      if (rules.length === 0) {
        logger.info('SkillCore', 'ageSkill: no aging rules configured');
        return true;
      }

      const now = Date.now();
      let agedCount = 0;

      for (const rule of rules) {
        const cutoffMs = now - (rule.days * 24 * 60 * 60 * 1000);
        const cutoff = Math.floor(cutoffMs / 1000);

        const skillsBelowThreshold = await this.db.query<any>(
          `SELECT s.id, s.name, COUNT(su.id) as recent_usage_count
           FROM skills s
           LEFT JOIN skill_usage su ON su.skill_id = s.id AND su.created_at >= ?
           WHERE s.enabled = 1
           GROUP BY s.id
           HAVING recent_usage_count < ?`,
          [cutoff, rule.min_usage_count]
        );

        for (const skill of skillsBelowThreshold) {
          await this.skillManager.updateSkill(skill.id, { enabled: false } as Partial<SkillConfig>);
          agedCount++;
          logger.info('SkillCore', 'ageSkill: disabled skill', {
            skill_id: skill.id,
            skill_name: skill.name,
            usage_count: skill.recent_usage_count,
            rule_id: rule.id,
            rule_days: rule.days,
            rule_min_usage_count: rule.min_usage_count,
          });
        }
      }

      output.aged_count = agedCount;
      logger.info('SkillCore', 'ageSkill: completed', { aged_count: agedCount });
      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SkillCore', 'ageSkill failed', { error: (error as Error).message });
      return false;
    }
  }

  async getSkillRule(input: GetSkillRuleInput, context: Context, output: GetSkillRuleOutput): Promise<boolean> {
    try {
      let sql = 'SELECT id, days, min_usage_count FROM skill_opt_rule';
      const params: any[] = [];

      if (input.conditions) {
        const clauses: string[] = [];
        for (const [key, value] of Object.entries(input.conditions)) {
          clauses.push(`${key} = ?`);
          params.push(value);
        }
        if (clauses.length > 0) {
          sql += ' WHERE ' + clauses.join(' AND ');
        }
      }

      if (input.order_by) {
        sql += ` ORDER BY ${input.order_by}`;
      }

      if (input.page) {
        const offset = (input.page.page_num - 1) * input.page.page_size;
        sql += ` LIMIT ${input.page.page_size} OFFSET ${offset}`;
      }

      const rules = await this.db.query<{ id: string; days: number; min_usage_count: number }>(sql, params);
      output.rules = rules.map(r => ({
        id: r.id,
        days: r.days,
        min_usage_count: r.min_usage_count,
      }));

      logger.info('SkillCore', 'getSkillRule', { count: rules.length });
      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SkillCore', 'getSkillRule failed', { error: (error as Error).message });
      return false;
    }
  }

  async updateSkillRule(input: UpdateSkillRuleInput, context: Context, output: UpdateSkillRuleOutput): Promise<boolean> {
    try {
      await this.db.transaction(async (tx) => {
        for (const op of input.operations) {
          switch (op.type) {
            case 'INSERT': {
              if (!op.data) throw new Error('INSERT operation requires data');
              if (op.data.days <= 0) throw new Error('days must be greater than 0');
              if (op.data.min_usage_count < 0) throw new Error('min_usage_count must be >= 0');
              const { v4: uuidv4 } = require('uuid');
              const id = uuidv4();
              await tx.run(
                'INSERT INTO skill_opt_rule (id, days, min_usage_count) VALUES (?, ?, ?)',
                [id, op.data.days, op.data.min_usage_count]
              );
              logger.info('SkillCore', 'updateSkillRule: INSERT', { id, days: op.data.days, min_usage_count: op.data.min_usage_count });
              break;
            }
            case 'UPDATE': {
              if (!op.id) throw new Error('UPDATE operation requires id');
              if (!op.data) throw new Error('UPDATE operation requires data');
              const existing = await tx.get<{ id: string }>(
                'SELECT id FROM skill_opt_rule WHERE id = ?',
                [op.id]
              );
              if (!existing) throw new Error(`skill_opt_rule not found: ${op.id}`);
              if (op.data.days <= 0) throw new Error('days must be greater than 0');
              if (op.data.min_usage_count < 0) throw new Error('min_usage_count must be >= 0');
              await tx.run(
                'UPDATE skill_opt_rule SET days = ?, min_usage_count = ? WHERE id = ?',
                [op.data.days, op.data.min_usage_count, op.id]
              );
              logger.info('SkillCore', 'updateSkillRule: UPDATE', { id: op.id, days: op.data.days, min_usage_count: op.data.min_usage_count });
              break;
            }
            case 'DELETE': {
              if (!op.id) throw new Error('DELETE operation requires id');
              await tx.run('DELETE FROM skill_opt_rule WHERE id = ?', [op.id]);
              logger.info('SkillCore', 'updateSkillRule: DELETE', { id: op.id });
              break;
            }
            default:
              throw new Error(`Unknown operation type: ${(op as any).type}`);
          }
        }
      });

      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SkillCore', 'updateSkillRule failed', { error: (error as Error).message });
      return false;
    }
  }

  async configSkillCore(input: ConfigSkillCoreInput, context: Context, output: ConfigSkillCoreOutput): Promise<boolean> {
    try {
      const existing = await this.db.get<{ id: string }>('SELECT id FROM skill_core_config LIMIT 1');

      if (existing) {
        const updates: string[] = [];
        const params: any[] = [];

        if (input.regen_rate !== undefined) {
          updates.push('regen_rate = ?');
          params.push(input.regen_rate);
        }
        if (input.prompt_template_id !== undefined) {
          updates.push('prompt_template_id = ?');
          params.push(input.prompt_template_id);
        }

        if (updates.length > 0) {
          await this.db.run(
            `UPDATE skill_core_config SET ${updates.join(', ')} WHERE id = ?`,
            [...params, existing.id]
          );
        }
      } else {
        const { v4: uuidv4 } = require('uuid');
        const id = uuidv4();
        await this.db.run(
          'INSERT INTO skill_core_config (id, regen_rate, prompt_template_id) VALUES (?, ?, ?)',
          [id, input.regen_rate ?? this.DEFAULT_REGEN_RATE, input.prompt_template_id || null]
        );
      }

      logger.info('SkillCore', 'configSkillCore', {
        regen_rate: input.regen_rate,
        prompt_template_id: input.prompt_template_id,
      });

      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SkillCore', 'configSkillCore failed', { error: (error as Error).message });
      return false;
    }
  }

  private async getRegenRate(): Promise<number> {
    const config = await this.db.get<{ regen_rate: number }>(
      'SELECT regen_rate FROM skill_core_config LIMIT 1'
    );
    return config?.regen_rate ?? this.DEFAULT_REGEN_RATE;
  }
}
