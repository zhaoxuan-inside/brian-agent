import { z } from 'zod';
import { Context, Output } from '../../shared/base';
import { DBWrapper } from '../../base/DBWrapper';
import { LLMService } from '../llm/LLMService';
import { MCPManager } from './MCPManager';
import { logger } from '../../infrastructure/logger';
import { v4 as uuidv4 } from 'uuid';

export const MatchMCPInputSchema = z.object({
  traceId: z.string().optional(),
  agent_id: z.string(),
  interact_id: z.string(),
});
export type MatchMCPInput = z.infer<typeof MatchMCPInputSchema>;

export const MatchMCPOutputSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  mcp_ids: z.array(z.string()),
});
export type MatchMCPOutput = z.infer<typeof MatchMCPOutputSchema>;

export const OptimizeMCPInputSchema = z.object({
  traceId: z.string().optional(),
  agent_id: z.string(),
  interact_id: z.string(),
  mcp_id: z.string(),
});
export type OptimizeMCPInput = z.infer<typeof OptimizeMCPInputSchema>;

export const ConfigMCPCoreInputSchema = z.object({
  traceId: z.string().optional(),
  regen_rate: z.number().min(0).max(100).optional(),
});
export type ConfigMCPCoreInput = z.infer<typeof ConfigMCPCoreInputSchema>;

export const MCPCoreConfigSchema = z.object({
  id: z.string(),
  user_id: z.string().optional(),
  regen_rate: z.number().min(0).max(100).default(75),
  updated_at: z.number(),
});
export type MCPCoreConfig = z.infer<typeof MCPCoreConfigSchema>;

export class MCPCore {
  constructor(
    private db: DBWrapper,
    private llmService: LLMService,
    private mcpManager: MCPManager
  ) {}

  async matchMCP(input: MatchMCPInput, context: Context, output: MatchMCPOutput): Promise<boolean> {
    try {
      logger.info('MCPCore', '[matchMCP] start', { agent_id: input.agent_id, interact_id: input.interact_id });

      const config = await this.db.get<{ regen_rate: number }>(
        `SELECT regen_rate FROM mcp_core_config WHERE user_id = ?`,
        [context.userId || '']
      );
      const regenRate = config?.regen_rate ?? 75;

      const boundRows = await this.db.query<{ mcp_id: string }>(
        `SELECT mcp_id FROM agent_mcp WHERE agent_id = ?`,
        [input.agent_id]
      );

      if (boundRows.length > 0) {
        const roll = Math.random() * 100;
        logger.info('MCPCore', '[matchMCP] bound MCPs found', { mcp_ids: boundRows.map(r => r.mcp_id), roll, regenRate });
        if (roll >= regenRate) {
          output.mcp_ids = boundRows.map(r => r.mcp_id);
          output.success = true;
          return true;
        }
      }

      const allMCPs = await this.mcpManager.listMCPS();
      const enabledMCPs = allMCPs.filter(m => m.enabled);

      if (enabledMCPs.length === 0) {
        output.mcp_ids = [];
        output.success = true;
        logger.info('MCPCore', '[matchMCP] no enabled MCPs');
        return true;
      }

      const mcpList = enabledMCPs.map(m =>
        `- id: ${m.id}, name: ${m.name}, description: ${m.description}, category: ${m.category}`
      ).join('\n');

      let workSummary = '';
      try {
        const recentMessages = await this.db.query<{ content: string; role: string }>(
          `SELECT content, role FROM info_raw WHERE interact_id = ? ORDER BY created_at DESC LIMIT 10`,
          [input.interact_id]
        );
        if (recentMessages.length > 0) {
          workSummary = recentMessages.reverse().map(m => `${m.role}: ${m.content.slice(0, 200)}`).join('\n');
        }
      } catch {
        workSummary = 'Work context unavailable.';
      }

      const prompt = `You are an MCP (Model Context Protocol) selection engine. Based on the agent's current work context, recommend the best MCP tools from the available options.

Available MCPs:
${mcpList}

Current work context:
${workSummary}

Choose the most suitable MCP tool(s) for this task. Respond with ONLY the MCP id(s), one per line. If none are suitable, respond with an empty line. Do not include any other text.`;

      const models = await this.llmService.listModels();
      const activeModels = models.filter(m => m.status === 'active');

      if (activeModels.length === 0) {
        output.mcp_ids = enabledMCPs.map(m => m.id);
        output.success = true;
        logger.info('MCPCore', '[matchMCP] no LLM available, returning all enabled MCPs');
        return true;
      }

      const response = await this.llmService.chatCompletion({
        model: activeModels[0].name,
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.3,
        maxTokens: 200,
      });

      const rawContent = response.choices?.[0]?.message?.content || '';
      const recommendedIds = rawContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
          const found = enabledMCPs.find(m => m.id === line || m.name === line);
          return found?.id || null;
        })
        .filter((id): id is string => id !== null);

      output.mcp_ids = recommendedIds.length > 0 ? recommendedIds : enabledMCPs.map(m => m.id);
      output.success = true;

      logger.info('MCPCore', '[matchMCP] MCPs selected', { mcp_ids: output.mcp_ids });
      return true;
    } catch (e: any) {
      logger.error('MCPCore', '[matchMCP] error', { error: e.message });
      output.success = false;
      output.error = e.message || 'Failed to match MCP';
      output.mcp_ids = [];
      return false;
    }
  }

  async optimizeMCP(input: OptimizeMCPInput, context: Context, output: Output): Promise<boolean> {
    try {
      logger.info('MCPCore', '[optimizeMCP] start', { agent_id: input.agent_id, mcp_id: input.mcp_id });

      const existing = await this.db.get<{ agent_id: string; mcp_id: string }>(
        `SELECT agent_id, mcp_id FROM agent_mcp WHERE agent_id = ? AND mcp_id = ?`,
        [input.agent_id, input.mcp_id]
      );

      if (existing) {
        logger.info('MCPCore', '[optimizeMCP] binding already exists');
        output.success = true;
        return true;
      }

      const mcp = await this.mcpManager.getMCP(input.mcp_id);
      if (!mcp) {
        output.success = false;
        output.error = `MCP not found: ${input.mcp_id}`;
        logger.error('MCPCore', '[optimizeMCP] MCP not found', { mcp_id: input.mcp_id });
        return false;
      }

      await this.db.run(
        `INSERT OR IGNORE INTO agent_mcp (agent_id, mcp_id) VALUES (?, ?)`,
        [input.agent_id, input.mcp_id]
      );

      logger.info('MCPCore', '[optimizeMCP] binding created', { agent_id: input.agent_id, mcp_id: input.mcp_id });
      output.success = true;
      return true;
    } catch (e: any) {
      logger.error('MCPCore', '[optimizeMCP] error', { error: e.message });
      output.success = false;
      output.error = e.message || 'Failed to optimize MCP';
      return false;
    }
  }

  async configMCPCore(input: ConfigMCPCoreInput, context: Context, output: Output): Promise<boolean> {
    try {
      logger.info('MCPCore', '[configMCPCore] start', { input });

      if (input.regen_rate !== undefined && (input.regen_rate < 0 || input.regen_rate > 100)) {
        output.success = false;
        output.error = 'regen_rate must be between 0 and 100';
        return false;
      }

      const updatedAt = Date.now();
      const userId = context.userId || '';

      const existing = await this.db.get<{ id: string }>(
        `SELECT id FROM mcp_core_config WHERE user_id = ?`,
        [userId]
      );

      if (existing) {
        const setClauses: string[] = ['updated_at = ?'];
        const values: any[] = [updatedAt];

        if (input.regen_rate !== undefined) {
          setClauses.push('regen_rate = ?');
          values.push(input.regen_rate);
        }

        values.push(userId);
        await this.db.run(
          `UPDATE mcp_core_config SET ${setClauses.join(', ')} WHERE user_id = ?`,
          values
        );
      } else {
        const id = uuidv4();
        await this.db.run(
          `INSERT INTO mcp_core_config (id, user_id, regen_rate, updated_at)
           VALUES (?, ?, ?, ?)`,
          [id, userId, input.regen_rate ?? 75, updatedAt]
        );
      }

      logger.info('MCPCore', '[configMCPCore] config updated', { userId });
      output.success = true;
      return true;
    } catch (e: any) {
      logger.error('MCPCore', '[configMCPCore] error', { error: e.message });
      output.success = false;
      output.error = e.message || 'Failed to configure MCP core';
      return false;
    }
  }
}
