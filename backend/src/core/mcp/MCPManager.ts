import { z } from 'zod';
import { DBWrapper } from '../../base/DBWrapper';
import { MCP, MCPFunction, MCPExecuteRequest, MCPExecuteResponse } from '../../base/MCPWrapper';

export const MCPSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  icon: z.string(),
  version: z.string(),
  author: z.string(),
  functions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.record(z.string(), z.object({
      type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
      description: z.string(),
      required: z.boolean(),
      default: z.any().optional(),
    })),
  })),
  config: z.record(z.string(), z.any()).optional(),
  isInstalled: z.boolean().default(false),
  enabled: z.boolean().default(true),
  effectivenessScore: z.number().default(0),
  usageCount: z.number().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type MCPConfig = z.infer<typeof MCPSchema>;

export class MCPManager {
  private installedMCPs: Map<string, MCPConfig> = new Map();

  constructor(private db: DBWrapper) {}

  async init(): Promise<void> {
    await this.loadInstalledMCPs();
  }

  private async loadInstalledMCPs(): Promise<void> {
    const mcps = await this.db.query<MCPConfig>('SELECT * FROM mcps WHERE is_installed = true');
    for (const mcp of mcps) {
      this.installedMCPs.set(mcp.id, mcp);
    }
  }

  async listMCPS(userId?: string): Promise<MCPConfig[]> {
    if (userId) {
      return this.db.query<MCPConfig>('SELECT * FROM mcps WHERE user_id = ?', [userId]);
    }
    return this.db.query<MCPConfig>('SELECT * FROM mcps');
  }

  async getMCP(id: string): Promise<MCPConfig | undefined> {
    return this.db.get<MCPConfig>('SELECT * FROM mcps WHERE id = ?', [id]);
  }

  async installMCP(mcp: Omit<MCPConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<MCPConfig> {
    const id = require('uuid').v4();
    const now = Date.now();
    const config: MCPConfig = {
      ...mcp,
      id,
      isInstalled: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.run(`
      INSERT INTO mcps (id, user_id, name, description, category, icon, version, author, functions, config, is_installed, enabled, effectiveness_score, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      config.id,
      config.userId,
      config.name,
      config.description,
      config.category,
      config.icon,
      config.version,
      config.author,
      JSON.stringify(config.functions),
      JSON.stringify(config.config || {}),
      config.isInstalled ? 1 : 0,
      config.enabled ? 1 : 0,
      config.effectivenessScore,
      config.usageCount,
      config.createdAt,
      config.updatedAt,
    ]);

    this.installedMCPs.set(config.id, config);
    return config;
  }

  async uninstallMCP(id: string): Promise<void> {
    await this.db.run('UPDATE mcps SET is_installed = false WHERE id = ?', [id]);
    this.installedMCPs.delete(id);
  }

  async updateMCP(id: string, updates: Partial<MCPConfig>): Promise<MCPConfig | undefined> {
    const existing = await this.getMCP(id);
    if (!existing) return undefined;

    const now = Date.now();
    const updated: MCPConfig = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.db.run(`
      UPDATE mcps
      SET name = ?, description = ?, category = ?, icon = ?, version = ?, author = ?, functions = ?, config = ?, is_installed = ?, enabled = ?, effectiveness_score = ?, updated_at = ?
      WHERE id = ?
    `, [
      updated.name,
      updated.description,
      updated.category,
      updated.icon,
      updated.version,
      updated.author,
      JSON.stringify(updated.functions),
      JSON.stringify(updated.config || {}),
      updated.isInstalled ? 1 : 0,
      updated.enabled ? 1 : 0,
      updated.effectivenessScore,
      updated.updatedAt,
      id,
    ]);

    if (updated.isInstalled) {
      this.installedMCPs.set(id, updated);
    }

    return updated;
  }

  async execute(request: MCPExecuteRequest): Promise<MCPExecuteResponse> {
    const mcp = this.installedMCPs.get(request.mcpId);
    if (!mcp) {
      return { success: false, error: 'MCP not installed' };
    }

    const func = mcp.functions.find(f => f.name === request.functionName);
    if (!func) {
      return { success: false, error: `Function ${request.functionName} not found` };
    }

    await this.db.run(
      'UPDATE mcps SET usage_count = usage_count + 1 WHERE id = ?',
      [request.mcpId]
    );

    return { success: true, result: {} };
  }

  async getMarketplace(): Promise<MCPConfig[]> {
    return this.db.query<MCPConfig>('SELECT * FROM mcps WHERE is_installed = false');
  }
}