import { Input, Context, Output } from '../../shared/base';
import { DBWrapper } from '../../base/DBWrapper';
import { LLMService } from '../llm/LLMService';
import { SoulManager, SoulConfig } from './SoulManager';
import { logger } from '../../infrastructure/logger';

export class MatchSoulInput extends Input {
  agent_id: string;
  interact_id: string;
  constructor(data?: Partial<MatchSoulInput>) {
    super(data);
    this.agent_id = data?.agent_id || '';
    this.interact_id = data?.interact_id || '';
  }
}

export class MatchSoulOutput extends Output {
  soul_id?: string;
  constructor(data?: Partial<MatchSoulOutput>) {
    super(data);
    this.soul_id = data?.soul_id;
  }
}

export class OptimizeSoulInput extends Input {
  agent_id: string;
  interact_id: string;
  soul_id: string;
  constructor(data?: Partial<OptimizeSoulInput>) {
    super(data);
    this.agent_id = data?.agent_id || '';
    this.interact_id = data?.interact_id || '';
    this.soul_id = data?.soul_id || '';
  }
}

export class OptimizeSoulOutput extends Output {
  replaced: boolean;
  constructor(data?: Partial<OptimizeSoulOutput>) {
    super(data);
    this.replaced = data?.replaced || false;
  }
}

export class AgeSoulOutput extends Output {
  aged_count: number;
  constructor(data?: Partial<AgeSoulOutput>) {
    super(data);
    this.aged_count = data?.aged_count || 0;
  }
}

export class GetSoulRuleInput extends Input {
  conditions?: any;
  order_by?: string;
  page?: any;
  constructor(data?: Partial<GetSoulRuleInput>) {
    super(data);
    this.conditions = data?.conditions;
    this.order_by = data?.order_by;
    this.page = data?.page;
  }
}

export class GetSoulRuleOutput extends Output {
  rules: any[];
  constructor(data?: Partial<GetSoulRuleOutput>) {
    super(data);
    this.rules = data?.rules || [];
  }
}

export class UpdateSoulRuleInput extends Input {
  operations: Array<{ type: string; id?: string; data?: any }>;
  constructor(data?: Partial<UpdateSoulRuleInput>) {
    super(data);
    this.operations = data?.operations || [];
  }
}

export class UpdateSoulRuleOutput extends Output {
  constructor(data?: Partial<UpdateSoulRuleOutput>) {
    super(data);
  }
}

export class ConfigSoulCoreInput extends Input {
  regen_rate?: number;
  prompt_template_id?: string;
  constructor(data?: Partial<ConfigSoulCoreInput>) {
    super(data);
    this.regen_rate = data?.regen_rate;
    this.prompt_template_id = data?.prompt_template_id;
  }
}

export class ConfigSoulCoreOutput extends Output {
  constructor(data?: Partial<ConfigSoulCoreOutput>) {
    super(data);
  }
}

export class SoulCore {
  private readonly DEFAULT_REGEN_RATE = 75;

  constructor(
    private db: DBWrapper,
    private llmService: LLMService,
    private soulManager: SoulManager
  ) {}

  async matchSoul(input: MatchSoulInput, context: Context, output: MatchSoulOutput): Promise<boolean> {
    try {
      const regenRate = await this.getRegenRate();

      const existingBinding = await this.db.get<{ soul_id: string }>(
        'SELECT soul_id FROM agent_soul WHERE agent_id = ?',
        [input.agent_id]
      );

      if (existingBinding) {
        const shouldRegen = Math.floor(Math.random() * 100) < regenRate;
        if (!shouldRegen) {
          output.soul_id = existingBinding.soul_id;
          logger.info('SoulCore', 'matchSoul: using existing binding', {
            agent_id: input.agent_id,
            soul_id: existingBinding.soul_id,
          });
          return true;
        }
      }

      const souls = await this.soulManager.listSouls();

      if (souls.length === 0) {
        logger.info('SoulCore', 'matchSoul: no souls available, auto-generating');

        const genPrompt = `You are a persona generator for an AI agent. Create a new persona (soul) with the following attributes. Respond with a JSON object containing:
- "name": a short descriptive name for the persona
- "personality": an array of objects with "trait", "value", and "weight" (0-1) fields (at least 3 traits)
- "tone": the communication style (e.g. "friendly", "professional", "casual")
- "knowledge_base": an array of knowledge domain strings (at least 2)
- "constraints": an array of behavioral constraint strings (at least 2)
- "example_responses": an array of 3 example responses this persona would give

Return ONLY valid JSON, nothing else.`;

        const response = await this.llmService.chatCompletion({
          model: '',
          messages: [
            { role: 'system', content: 'You generate AI agent personas. Return only valid JSON.' },
            { role: 'user', content: genPrompt },
          ],
          temperature: 0.7,
          maxTokens: 2048,
        });

        const content = response.choices[0]?.message?.content || '{}';
        const generated = JSON.parse(content);

        const newSoul = await this.soulManager.createSoul({
          userId: context.userId || 'system',
          name: generated.name || 'Auto-generated Soul',
          personality: generated.personality || [],
          tone: generated.tone || 'friendly',
          knowledgeBase: generated.knowledge_base || [],
          constraints: generated.constraints || [],
          exampleResponses: generated.example_responses || [],
          effectivenessScore: 0,
          usageCount: 0,
          isTemporary: false,
        });

        await this.db.run(
          `INSERT OR REPLACE INTO agent_soul (agent_id, soul_id, created_at) VALUES (?, ?, ?)`,
          [input.agent_id, newSoul.id, Date.now()]
        );

        output.soul_id = newSoul.id;
        logger.info('SoulCore', 'matchSoul: auto-generated soul', {
          agent_id: input.agent_id,
          soul_id: newSoul.id,
          soul_name: newSoul.name,
        });
        return true;
      }

      if (souls.length === 1) {
        output.soul_id = souls[0].id;
        logger.info('SoulCore', 'matchSoul: single soul available', {
          agent_id: input.agent_id,
          soul_id: souls[0].id,
        });
        return true;
      }

      const soulList = souls.map(s => ({
        id: s.id,
        name: s.name,
        tone: s.tone,
        personality: s.personality,
        constraints: s.constraints,
        effectiveness_score: s.effectivenessScore,
        usage_count: s.usageCount,
      }));

      const prompt = `You are a persona matcher for an AI agent. Given the following available souls (personas), select the single best matching soul_id for the agent's current work.

Available souls:
${JSON.stringify(soulList, null, 2)}

Select the most appropriate soul_id. Return ONLY the soul_id string, nothing else.
Example: "soul-id-1"`;

      const response = await this.llmService.chatCompletion({
        model: '',
        messages: [
          { role: 'system', content: 'You match AI agent personas. Return only a single soul_id string.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 256,
      });

      const content = response.choices[0]?.message?.content || '';
      const matchedId = content.replace(/["'\s]/g, '');

      const found = souls.find(s => s.id === matchedId);
      output.soul_id = found ? found.id : souls[0].id;

      logger.info('SoulCore', 'matchSoul: LLM selected soul', {
        agent_id: input.agent_id,
        soul_id: output.soul_id,
      });

      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SoulCore', 'matchSoul failed', { error: (error as Error).message });
      return false;
    }
  }

  async optimizeSoul(input: OptimizeSoulInput, context: Context, output: OptimizeSoulOutput): Promise<boolean> {
    try {
      const currentBinding = await this.db.get<{ soul_id: string }>(
        'SELECT soul_id FROM agent_soul WHERE agent_id = ?',
        [input.agent_id]
      );

      const soulAId = currentBinding?.soul_id;
      if (!soulAId) {
        await this.db.run(
          'INSERT INTO agent_soul (agent_id, soul_id, created_at) VALUES (?, ?, ?)',
          [input.agent_id, input.soul_id, Date.now()]
        );
        output.replaced = true;
        logger.info('SoulCore', 'optimizeSoul: no existing binding, set new', {
          agent_id: input.agent_id,
          soul_id: input.soul_id,
        });
        return true;
      }

      if (soulAId === input.soul_id) {
        logger.info('SoulCore', 'optimizeSoul: same soul, no change', {
          agent_id: input.agent_id,
          soul_id: input.soul_id,
        });
        return true;
      }

      const soulA = await this.soulManager.getSoul(soulAId);
      const soulB = await this.soulManager.getSoul(input.soul_id);

      if (!soulA || !soulB) {
        output.success = false;
        output.error = 'One or both souls not found';
        logger.error('SoulCore', 'optimizeSoul: soul not found', {
          soulA_id: soulAId,
          soulB_id: input.soul_id,
        });
        return false;
      }

      const promptTemplateId = await this.getPromptTemplateId();

      const comparisonPrompt = `You are evaluating two AI agent personas (souls) to determine which is better suited for an agent's work.

## Soul A (Current)
Name: ${soulA.name}
Tone: ${soulA.tone}
Personality: ${JSON.stringify(soulA.personality)}
Knowledge Base: ${JSON.stringify(soulA.knowledgeBase)}
Constraints: ${JSON.stringify(soulA.constraints)}
Example Responses: ${JSON.stringify(soulA.exampleResponses)}

## Soul B (New)
Name: ${soulB.name}
Tone: ${soulB.tone}
Personality: ${JSON.stringify(soulB.personality)}
Knowledge Base: ${JSON.stringify(soulB.knowledgeBase)}
Constraints: ${JSON.stringify(soulB.constraints)}
Example Responses: ${JSON.stringify(soulB.exampleResponses)}

Compare both souls critically. Consider which would provide a better, more engaging, and more appropriate agent experience.

Return ONLY a single character: "A" or "B" to indicate which soul is better. Nothing else.`;

      const response = await this.llmService.chatCompletion({
        model: '',
        messages: [
          { role: 'system', content: 'You compare AI agent personas. Return only "A" or "B".' },
          { role: 'user', content: comparisonPrompt },
        ],
        temperature: 0.2,
        maxTokens: 16,
      });

      const result = response.choices[0]?.message?.content?.trim().toUpperCase() || 'A';

      if (result.startsWith('B')) {
        await this.db.run(
          'UPDATE agent_soul SET soul_id = ?, created_at = ? WHERE agent_id = ?',
          [input.soul_id, Date.now(), input.agent_id]
        );
        output.replaced = true;
        logger.info('SoulCore', 'optimizeSoul: Soul B selected, replaced binding', {
          agent_id: input.agent_id,
          old_soul_id: soulAId,
          new_soul_id: input.soul_id,
        });
      } else {
        logger.info('SoulCore', 'optimizeSoul: Soul A retained', {
          agent_id: input.agent_id,
          soul_id: soulAId,
        });
      }

      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SoulCore', 'optimizeSoul failed', { error: (error as Error).message });
      return false;
    }
  }

  async ageSoul(input: Input, context: Context, output: AgeSoulOutput): Promise<boolean> {
    try {
      const rules = await this.db.query<{ id: string; days: number; min_usage_count: number }>(
        'SELECT id, days, min_usage_count FROM soul_opt_rule'
      );

      if (rules.length === 0) {
        logger.info('SoulCore', 'ageSoul: no aging rules configured');
        return true;
      }

      const now = Date.now();
      let agedCount = 0;

      for (const rule of rules) {
        const cutoffMs = now - (rule.days * 24 * 60 * 60 * 1000);
        const cutoff = Math.floor(cutoffMs / 1000);

        const soulsBelowThreshold = await this.db.query<any>(
          `SELECT s.id, s.name, COUNT(su.id) as recent_usage_count
           FROM souls s
           LEFT JOIN soul_usage su ON su.soul_id = s.id AND su.created_at >= ?
           WHERE s.is_temporary = 0
           GROUP BY s.id
           HAVING recent_usage_count < ?`,
          [cutoff, rule.min_usage_count]
        );

        for (const soul of soulsBelowThreshold) {
          await this.soulManager.deleteSoul(soul.id);
          agedCount++;
          logger.info('SoulCore', 'ageSoul: removed soul', {
            soul_id: soul.id,
            soul_name: soul.name,
            usage_count: soul.usage_count,
            rule_id: rule.id,
            rule_days: rule.days,
            rule_min_usage_count: rule.min_usage_count,
          });
        }
      }

      output.aged_count = agedCount;
      logger.info('SoulCore', 'ageSoul: completed', { aged_count: agedCount });
      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SoulCore', 'ageSoul failed', { error: (error as Error).message });
      return false;
    }
  }

  async getSoulRule(input: GetSoulRuleInput, context: Context, output: GetSoulRuleOutput): Promise<boolean> {
    try {
      let sql = 'SELECT id, days, min_usage_count FROM soul_opt_rule';
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
        const pageSize = input.page.page_size || 10;
        const pageNum = input.page.page_num || 1;
        const offset = (pageNum - 1) * pageSize;
        sql += ` LIMIT ${pageSize} OFFSET ${offset}`;
      }

      const rules = await this.db.query<any>(sql, params);
      output.rules = rules;

      logger.info('SoulCore', 'getSoulRule', { count: rules.length });
      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SoulCore', 'getSoulRule failed', { error: (error as Error).message });
      return false;
    }
  }

  async updateSoulRule(input: UpdateSoulRuleInput, context: Context, output: UpdateSoulRuleOutput): Promise<boolean> {
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
                'INSERT INTO soul_opt_rule (id, days, min_usage_count) VALUES (?, ?, ?)',
                [id, op.data.days, op.data.min_usage_count]
              );
              logger.info('SoulCore', 'updateSoulRule: INSERT', { id, days: op.data.days, min_usage_count: op.data.min_usage_count });
              break;
            }
            case 'UPDATE': {
              if (!op.id) throw new Error('UPDATE operation requires id');
              if (!op.data) throw new Error('UPDATE operation requires data');
              const existing = await tx.get<{ id: string }>(
                'SELECT id FROM soul_opt_rule WHERE id = ?',
                [op.id]
              );
              if (!existing) throw new Error(`soul_opt_rule not found: ${op.id}`);
              if (op.data.days <= 0) throw new Error('days must be greater than 0');
              if (op.data.min_usage_count < 0) throw new Error('min_usage_count must be >= 0');
              await tx.run(
                'UPDATE soul_opt_rule SET days = ?, min_usage_count = ? WHERE id = ?',
                [op.data.days, op.data.min_usage_count, op.id]
              );
              logger.info('SoulCore', 'updateSoulRule: UPDATE', { id: op.id, days: op.data.days, min_usage_count: op.data.min_usage_count });
              break;
            }
            case 'DELETE': {
              if (!op.id) throw new Error('DELETE operation requires id');
              await tx.run('DELETE FROM soul_opt_rule WHERE id = ?', [op.id]);
              logger.info('SoulCore', 'updateSoulRule: DELETE', { id: op.id });
              break;
            }
            default:
              throw new Error(`Unknown operation type: ${op.type}`);
          }
        }
      });

      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SoulCore', 'updateSoulRule failed', { error: (error as Error).message });
      return false;
    }
  }

  async configSoulCore(input: ConfigSoulCoreInput, context: Context, output: ConfigSoulCoreOutput): Promise<boolean> {
    try {
      const existing = await this.db.get<{ id: string }>('SELECT id FROM soul_core_config LIMIT 1');

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
            `UPDATE soul_core_config SET ${updates.join(', ')} WHERE id = ?`,
            [...params, existing.id]
          );
        }
      } else {
        const { v4: uuidv4 } = require('uuid');
        const id = uuidv4();
        await this.db.run(
          'INSERT INTO soul_core_config (id, regen_rate, prompt_template_id) VALUES (?, ?, ?)',
          [id, input.regen_rate ?? this.DEFAULT_REGEN_RATE, input.prompt_template_id || null]
        );
      }

      logger.info('SoulCore', 'configSoulCore', {
        regen_rate: input.regen_rate,
        prompt_template_id: input.prompt_template_id,
      });

      return true;
    } catch (error) {
      output.success = false;
      output.error = (error as Error).message;
      logger.error('SoulCore', 'configSoulCore failed', { error: (error as Error).message });
      return false;
    }
  }

  private async getRegenRate(): Promise<number> {
    const config = await this.db.get<{ regen_rate: number }>(
      'SELECT regen_rate FROM soul_core_config LIMIT 1'
    );
    return config?.regen_rate ?? this.DEFAULT_REGEN_RATE;
  }

  private async getPromptTemplateId(): Promise<string | undefined> {
    const config = await this.db.get<{ prompt_template_id: string }>(
      'SELECT prompt_template_id FROM soul_core_config LIMIT 1'
    );
    return config?.prompt_template_id || undefined;
  }
}
