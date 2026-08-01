import { z } from 'zod';
import { Context, Output } from '../../shared/base';
import { DBWrapper } from '../../base/DBWrapper';
import { LLMService } from './LLMService';
import { logger } from '../../infrastructure/logger';
import { v4 as uuidv4 } from 'uuid';

export const MatchLLMInputSchema = z.object({
  traceId: z.string().optional(),
  agent_id: z.string(),
  interact_id: z.string(),
});
export type MatchLLMInput = z.infer<typeof MatchLLMInputSchema>;

export const MatchLLMContextSchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  workId: z.string().optional(),
  timestamp: z.number(),
});
export type MatchLLMContext = z.infer<typeof MatchLLMContextSchema>;

export const MatchLLMOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  llm_id: z.string().optional(),
});
export type MatchLLMOutput = z.infer<typeof MatchLLMOutputSchema>;

export const LimitLLMInputSchema = z.object({
  traceId: z.string().optional(),
  llm_provider_id: z.string(),
  quota_tokens_per_day: z.number().optional(),
  quota_tokens_per_week: z.number().optional(),
  quota_tokens_per_month: z.number().optional(),
  quota_calls_per_day: z.number().optional(),
  quota_calls_per_week: z.number().optional(),
  quota_calls_per_month: z.number().optional(),
});
export type LimitLLMInput = z.infer<typeof LimitLLMInputSchema>;

export const CheckLLMQuotaInputSchema = z.object({
  traceId: z.string().optional(),
  llm_provider_id: z.string(),
});
export type CheckLLMQuotaInput = z.infer<typeof CheckLLMQuotaInputSchema>;

export const CheckLLMQuotaOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  within_quota: z.boolean(),
});
export type CheckLLMQuotaOutput = z.infer<typeof CheckLLMQuotaOutputSchema>;

export const ConfigLLMCoreInputSchema = z.object({
  traceId: z.string().optional(),
  regen_rate: z.number().min(0).max(100).optional(),
  prompt_template_id: z.string().optional(),
});
export type ConfigLLMCoreInput = z.infer<typeof ConfigLLMCoreInputSchema>;

export const LLMCoreConfigSchema = z.object({
  id: z.string(),
  user_id: z.string().optional(),
  regen_rate: z.number().min(0).max(100).default(75),
  prompt_template_id: z.string().optional(),
  updated_at: z.number(),
});
export type LLMCoreConfig = z.infer<typeof LLMCoreConfigSchema>;

export const LLMProviderQuotaSchema = z.object({
  llm_provider_id: z.string(),
  quota_tokens_per_day: z.number().optional(),
  quota_tokens_per_week: z.number().optional(),
  quota_tokens_per_month: z.number().optional(),
  quota_calls_per_day: z.number().optional(),
  quota_calls_per_week: z.number().optional(),
  quota_calls_per_month: z.number().optional(),
  updated_at: z.number(),
});
export type LLMProviderQuota = z.infer<typeof LLMProviderQuotaSchema>;

export class LLMCore {
  constructor(private db: DBWrapper, private llmService: LLMService) {}

  async matchLLM(input: MatchLLMInput, context: MatchLLMContext, output: MatchLLMOutput): Promise<boolean> {
    try {
      logger.info('LLMCore', '[matchLLM] start', { agent_id: input.agent_id, interact_id: input.interact_id });

      const config = await this.db.get<{ regen_rate: number }>(
        `SELECT regen_rate FROM llm_core_config WHERE user_id = ?`,
        [context.userId || '']
      );
      const regenRate = config?.regen_rate ?? 75;

      const bound = await this.db.get<{ llm_id: string }>(
        `SELECT llm_id FROM agent_llm WHERE agent_id = ?`,
        [input.agent_id]
      );

      if (bound?.llm_id) {
        const roll = Math.random() * 100;
        logger.info('LLMCore', '[matchLLM] bound llm found', { llm_id: bound.llm_id, roll, regenRate });
        if (roll >= regenRate) {
          output.llm_id = bound.llm_id;
          output.success = true;
          return true;
        }
      }

      const models = await this.llmService.listModels();
      const activeModels = models.filter(m => m.status === 'active');

      if (activeModels.length === 0) {
        output.success = false;
        output.error = 'No active LLM models available';
        logger.error('LLMCore', '[matchLLM] no active models');
        return false;
      }

      if (activeModels.length === 1) {
        output.llm_id = activeModels[0].id;
        output.success = true;
        logger.info('LLMCore', '[matchLLM] single model selected', { llm_id: output.llm_id });
        return true;
      }

      const modelList = activeModels.map(m =>
        `- id: ${m.id}, name: ${m.name}, type: ${m.type}, contextWindow: ${m.defaultParameters.contextWindow}`
      ).join('\n');

      const recentMessages = await this.db.query<{ content: string; role: string }>(
        `SELECT content, role FROM info_raw WHERE interact_id = ? ORDER BY created_at DESC LIMIT 10`,
        [input.interact_id]
      );

      const workSummary = recentMessages.length > 0
        ? recentMessages.reverse().map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n')
        : 'No recent work context available.';

      const prompt = `You are an LLM selection engine. Based on the agent's current work context, recommend the best LLM model from the available options.

Available models:
${modelList}

Current work context:
${workSummary}

Choose the most suitable model and respond with ONLY the model id string. Do not include any other text.`;

      const response = await this.llmService.chatCompletion({
        model: activeModels[0].name,
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.3,
        maxTokens: 50,
      });

      const rawContent = response.choices?.[0]?.message?.content || '';
      const recommendedId = rawContent.trim();

      const found = activeModels.find(m => m.id === recommendedId || m.name === recommendedId);
      if (found) {
        output.llm_id = found.id;
        logger.info('LLMCore', '[matchLLM] LLM recommended', { llm_id: found.id });
      } else {
        output.llm_id = activeModels[0].id;
        logger.info('LLMCore', '[matchLLM] fallback to first active model', { llm_id: output.llm_id });
      }

      output.success = true;
      return true;
    } catch (e: any) {
      logger.error('LLMCore', '[matchLLM] error', { error: e.message });
      output.success = false;
      output.error = e.message || 'Failed to match LLM';
      return false;
    }
  }

  async limitLLM(input: LimitLLMInput, context: Context, output: Output): Promise<boolean> {
    try {
      logger.info('LLMCore', '[limitLLM] start', { llm_provider_id: input.llm_provider_id });

      const provider = await this.llmService.getModel(input.llm_provider_id);
      if (!provider) {
        output.success = false;
        output.error = `LLM provider not found: ${input.llm_provider_id}`;
        logger.error('LLMCore', '[limitLLM] provider not found', { llm_provider_id: input.llm_provider_id });
        return false;
      }

      const fields: string[] = ['llm_provider_id'];
      const values: any[] = [input.llm_provider_id];
      const conflictUpdates: string[] = [];

      const quotaFields: Array<{ key: keyof LimitLLMInput; column: string }> = [
        { key: 'quota_tokens_per_day', column: 'quota_tokens_per_day' },
        { key: 'quota_tokens_per_week', column: 'quota_tokens_per_week' },
        { key: 'quota_tokens_per_month', column: 'quota_tokens_per_month' },
        { key: 'quota_calls_per_day', column: 'quota_calls_per_day' },
        { key: 'quota_calls_per_week', column: 'quota_calls_per_week' },
        { key: 'quota_calls_per_month', column: 'quota_calls_per_month' },
      ];

      for (const { key, column } of quotaFields) {
        const value = input[key];
        if (value !== undefined && value !== null) {
          fields.push(column);
          values.push(value);
          conflictUpdates.push(`${column} = excluded.${column}`);
        }
      }

      const updatedAt = Date.now();
      fields.push('updated_at');
      values.push(updatedAt);
      conflictUpdates.push('updated_at = excluded.updated_at');

      const sql = `INSERT INTO llm_provider_quota (${fields.join(', ')})
        VALUES (${fields.map(() => '?').join(', ')})
        ON CONFLICT(llm_provider_id) DO UPDATE SET ${conflictUpdates.join(', ')}`;

      await this.db.run(sql, values);

      logger.info('LLMCore', '[limitLLM] quota updated', { llm_provider_id: input.llm_provider_id });
      output.success = true;
      return true;
    } catch (e: any) {
      logger.error('LLMCore', '[limitLLM] error', { error: e.message });
      output.success = false;
      output.error = e.message || 'Failed to limit LLM';
      return false;
    }
  }

  async checkLLMQuota(input: CheckLLMQuotaInput, context: Context, output: CheckLLMQuotaOutput): Promise<boolean> {
    try {
      logger.info('LLMCore', '[checkLLMQuota] start', { llm_provider_id: input.llm_provider_id });

      const quota = await this.db.get<LLMProviderQuota>(
        `SELECT * FROM llm_provider_quota WHERE llm_provider_id = ?`,
        [input.llm_provider_id]
      );

      if (!quota) {
        output.within_quota = true;
        output.success = true;
        logger.info('LLMCore', '[checkLLMQuota] no quota config, allowing');
        return true;
      }

      const now = new Date();
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dayStartTs = Math.floor(dayStart.getTime() / 1000);

      const getWeekStart = (d: Date): Date => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        date.setDate(diff);
        date.setHours(0, 0, 0, 0);
        return date;
      };
      const weekStartTs = Math.floor(getWeekStart(now).getTime() / 1000);

      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthStartTs = Math.floor(monthStart.getTime() / 1000);

      const [dayStats, weekStats, monthStats] = await Promise.all([
        this.db.get<{ total_tokens: number; total_calls: number }>(
          `SELECT COALESCE(SUM(tokens), 0) as total_tokens, COUNT(*) as total_calls
           FROM call_history WHERE provider_id = ? AND success = 1 AND timestamp >= ?`,
          [input.llm_provider_id, dayStartTs]
        ),
        this.db.get<{ total_tokens: number; total_calls: number }>(
          `SELECT COALESCE(SUM(tokens), 0) as total_tokens, COUNT(*) as total_calls
           FROM call_history WHERE provider_id = ? AND success = 1 AND timestamp >= ?`,
          [input.llm_provider_id, weekStartTs]
        ),
        this.db.get<{ total_tokens: number; total_calls: number }>(
          `SELECT COALESCE(SUM(tokens), 0) as total_tokens, COUNT(*) as total_calls
           FROM call_history WHERE provider_id = ? AND success = 1 AND timestamp >= ?`,
          [input.llm_provider_id, monthStartTs]
        ),
      ]);

      const dayTokens = dayStats?.total_tokens || 0;
      const weekTokens = weekStats?.total_tokens || 0;
      const monthTokens = monthStats?.total_tokens || 0;
      const dayCalls = dayStats?.total_calls || 0;
      const weekCalls = weekStats?.total_calls || 0;
      const monthCalls = monthStats?.total_calls || 0;

      const checks: boolean[] = [];

      if (quota.quota_tokens_per_day !== undefined) {
        checks.push(dayTokens <= quota.quota_tokens_per_day);
      }
      if (quota.quota_tokens_per_week !== undefined) {
        checks.push(weekTokens <= quota.quota_tokens_per_week);
      }
      if (quota.quota_tokens_per_month !== undefined) {
        checks.push(monthTokens <= quota.quota_tokens_per_month);
      }
      if (quota.quota_calls_per_day !== undefined) {
        checks.push(dayCalls <= quota.quota_calls_per_day);
      }
      if (quota.quota_calls_per_week !== undefined) {
        checks.push(weekCalls <= quota.quota_calls_per_week);
      }
      if (quota.quota_calls_per_month !== undefined) {
        checks.push(monthCalls <= quota.quota_calls_per_month);
      }

      output.within_quota = checks.length === 0 || checks.every(c => c === true);
      output.success = true;

      logger.info('LLMCore', '[checkLLMQuota] result', {
        within_quota: output.within_quota,
        dayTokens, weekTokens, monthTokens,
        dayCalls, weekCalls, monthCalls,
      });

      return true;
    } catch (e: any) {
      logger.error('LLMCore', '[checkLLMQuota] error', { error: e.message });
      output.success = false;
      output.error = e.message || 'Failed to check LLM quota';
      output.within_quota = false;
      return false;
    }
  }

  async configLLMCore(input: ConfigLLMCoreInput, context: Context, output: Output): Promise<boolean> {
    try {
      logger.info('LLMCore', '[configLLMCore] start', { input });

      if (input.regen_rate !== undefined && (input.regen_rate < 0 || input.regen_rate > 100)) {
        output.success = false;
        output.error = 'regen_rate must be between 0 and 100';
        return false;
      }

      if (input.prompt_template_id !== undefined) {
        const template = await this.db.get<{ id: string }>(
          `SELECT id FROM prompt_templates WHERE id = ?`,
          [input.prompt_template_id]
        );
        if (!template) {
          output.success = false;
          output.error = `Prompt template not found: ${input.prompt_template_id}`;
          return false;
        }
      }

      const updatedAt = Date.now();
      const userId = context.userId || '';

      const existing = await this.db.get<{ id: string }>(
        `SELECT id FROM llm_core_config WHERE user_id = ?`,
        [userId]
      );

      if (existing) {
        const setClauses: string[] = ['updated_at = ?'];
        const values: any[] = [updatedAt];

        if (input.regen_rate !== undefined) {
          setClauses.push('regen_rate = ?');
          values.push(input.regen_rate);
        }
        if (input.prompt_template_id !== undefined) {
          setClauses.push('prompt_template_id = ?');
          values.push(input.prompt_template_id);
        }

        values.push(userId);
        await this.db.run(
          `UPDATE llm_core_config SET ${setClauses.join(', ')} WHERE user_id = ?`,
          values
        );
      } else {
        const id = uuidv4();
        await this.db.run(
          `INSERT INTO llm_core_config (id, user_id, regen_rate, prompt_template_id, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            id,
            userId,
            input.regen_rate ?? 75,
            input.prompt_template_id || null,
            updatedAt,
          ]
        );
      }

      logger.info('LLMCore', '[configLLMCore] config updated', { userId });
      output.success = true;
      return true;
    } catch (e: any) {
      logger.error('LLMCore', '[configLLMCore] error', { error: e.message });
      output.success = false;
      output.error = e.message || 'Failed to configure LLM core';
      return false;
    }
  }
}
