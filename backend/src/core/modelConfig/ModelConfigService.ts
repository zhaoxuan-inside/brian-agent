import { getDatabase } from '../../infrastructure/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../infrastructure/logger';

export interface ModelConfig {
  id: string;
  userId: string;
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsTools: boolean;
  quotaTokensPerDay: number;
  quotaTokensPerWeek: number;
  quotaTokensPerMonth: number;
  quotaCallsPerDay: number;
  quotaCallsPerWeek: number;
  quotaCallsPerMonth: number;
  isDefault: boolean;
  status: 'active' | 'disabled' | 'error';
  createdAt: number;
  updatedAt: number;
  name: string;
  type: 'openai' | 'anthropic' | 'google';
  endpoint: string;
  apiKey: string;
  defaultParameters: { temperature: number; maxTokens: number; contextWindow: number };
  priority: number;
}

export const ModelParametersSchema = {} as unknown;
export const TestResultSchema = {} as unknown;
export type ModelParameters = Record<string, unknown>;
export type TestResult = { ok: boolean; message: string };

export class ModelConfigService {
  private db: ReturnType<typeof getDatabase>;

  constructor(_db?: unknown) {
    this.db = getDatabase();
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_model_config (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT '',
        provider_id TEXT NOT NULL,
        provider_name TEXT NOT NULL DEFAULT '',
        model_id TEXT NOT NULL,
        model_name TEXT NOT NULL DEFAULT '',
        max_tokens INTEGER NOT NULL DEFAULT 4096,
        supports_vision INTEGER NOT NULL DEFAULT 0,
        supports_tools INTEGER NOT NULL DEFAULT 0,
        quota_tokens_per_day INTEGER NOT NULL DEFAULT 100000,
        quota_tokens_per_week INTEGER NOT NULL DEFAULT 5000000,
        quota_tokens_per_month INTEGER NOT NULL DEFAULT 22000000,
        quota_calls_per_day INTEGER NOT NULL DEFAULT 1000,
        quota_calls_per_week INTEGER NOT NULL DEFAULT 5000,
        quota_calls_per_month INTEGER NOT NULL DEFAULT 22000,
        is_default INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      )
    `);
  }

  private rowToConfig(row: Record<string, unknown>): ModelConfig {
    return {
      id: String(row.id),
      userId: String(row.user_id || ''),
      providerId: String(row.provider_id || ''),
      providerName: String(row.provider_name || ''),
      modelId: String(row.model_id || ''),
      modelName: String(row.model_name || ''),
      maxTokens: Number(row.max_tokens || 4096),
      supportsVision: Boolean(row.supports_vision),
      supportsTools: Boolean(row.supports_tools),
      quotaTokensPerDay: Number(row.quota_tokens_per_day || 100000),
      quotaTokensPerWeek: Number(row.quota_tokens_per_week || 500000),
      quotaTokensPerMonth: Number(row.quota_tokens_per_month || 2000000),
      quotaCallsPerDay: Number(row.quota_calls_per_day || 1000),
      quotaCallsPerWeek: Number(row.quota_calls_per_week || 5000),
      quotaCallsPerMonth: Number(row.quota_calls_per_month || 20000),
      isDefault: Boolean(row.is_default),
      status: (row.status as 'active' | 'disabled' | 'error') || 'active',
      createdAt: Number(row.created_at || Date.now()),
      updatedAt: Number(row.updated_at || Date.now()),
      name: String(row.model_name || ''),
      type: 'openai',
      endpoint: String(row.endpoint || ''),
      apiKey: String(row.api_key || ''),
      defaultParameters: { temperature: 0.7, maxTokens: Number(row.max_tokens || 4096), contextWindow: Number(row.max_tokens || 4096) },
      priority: Number(row.priority || 0),
    };
  }

  async listConfigs(userId?: string): Promise<ModelConfig[]> {
    logger.info('ModelConfigService', `[listConfigs] userId=${userId || 'all'}`);
    let rows: Record<string, unknown>[];
    if (userId) {
      rows = this.db.prepare(
        'SELECT * FROM user_model_config WHERE user_id = ? ORDER BY provider_name, model_name'
      ).all(userId) as Record<string, unknown>[];
    } else {
      rows = this.db.prepare(
        'SELECT * FROM user_model_config ORDER BY provider_name, model_name'
      ).all() as Record<string, unknown>[];
    }
    logger.info('ModelConfigService', `[listConfigs] returned ${rows.length} configs`);
    return rows.map(r => this.rowToConfig(r));
  }

  async listConfigsByProvider(providerId: string, userId?: string): Promise<ModelConfig[]> {
    logger.info('ModelConfigService', `[listConfigsByProvider] providerId=${providerId} userId=${userId || 'all'}`);
    let rows: Record<string, unknown>[];
    if (userId) {
      rows = this.db.prepare(
        'SELECT * FROM user_model_config WHERE provider_id = ? AND user_id = ? ORDER BY model_name'
      ).all(providerId, userId) as Record<string, unknown>[];
    } else {
      rows = this.db.prepare(
        'SELECT * FROM user_model_config WHERE provider_id = ? ORDER BY model_name'
      ).all(providerId) as Record<string, unknown>[];
    }
    logger.info('ModelConfigService', `[listConfigsByProvider] returned ${rows.length} configs`);
    return rows.map(r => this.rowToConfig(r));
  }

  async createConfig(data: Record<string, unknown>): Promise<ModelConfig> {
    const id = uuidv4();
    const now = Date.now();
    logger.info('ModelConfigService', `[createConfig] providerId=${data.providerId} modelId=${data.modelId} modelName=${data.modelName}`);
    this.db.prepare(`
      INSERT INTO user_model_config (id, user_id, provider_id, provider_name, model_id, model_name, max_tokens, supports_vision, supports_tools, quota_tokens_per_day, quota_tokens_per_week, quota_tokens_per_month, quota_calls_per_day, quota_calls_per_week, quota_calls_per_month, is_default, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.userId || '', data.providerId, data.providerName, data.modelId, data.modelName,
      data.maxTokens, data.supportsVision ? 1 : 0, data.supportsTools ? 1 : 0,
      data.quotaTokensPerDay, data.quotaTokensPerWeek, data.quotaTokensPerMonth,
      data.quotaCallsPerDay, data.quotaCallsPerWeek, data.quotaCallsPerMonth,
      data.isDefault ? 1 : 0, data.status || 'active', now, now
    );
    return this.getConfig(id) as Promise<ModelConfig>;
  }

  async batchSaveConfigs(providerId: string, models: Array<Record<string, unknown>>, userId?: string): Promise<ModelConfig[]> {
    const uid = userId || '';
    const now = Date.now();
    logger.info('ModelConfigService', `[batchSaveConfigs] providerId=${providerId} userId=${uid} modelCount=${models.length}`);

    const existing = this.db.prepare(
      'SELECT id, model_id FROM user_model_config WHERE provider_id = ? AND user_id = ?'
    ).all(providerId, uid) as Array<{ id: string; model_id: string }>;

    const existingModelIds = new Set(existing.map(e => e.model_id));
    const incomingModelIds = new Set(models.map(m => String(m.modelId)));

    let removed = 0;
    for (const e of existing) {
      if (!incomingModelIds.has(e.model_id)) {
        this.db.prepare('DELETE FROM user_model_config WHERE id = ?').run(e.id);
        removed++;
      }
    }

    let added = 0;
    let updated = 0;
    const insertStmt = this.db.prepare(`
      INSERT INTO user_model_config (id, user_id, provider_id, provider_name, model_id, model_name, max_tokens, supports_vision, supports_tools, quota_tokens_per_day, quota_tokens_per_week, quota_tokens_per_month, quota_calls_per_day, quota_calls_per_week, quota_calls_per_month, is_default, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStmt = this.db.prepare(`
      UPDATE user_model_config SET model_name = ?, max_tokens = ?, supports_vision = ?, supports_tools = ?, quota_tokens_per_day = ?, quota_tokens_per_week = ?, quota_tokens_per_month = ?, quota_calls_per_day = ?, quota_calls_per_week = ?, quota_calls_per_month = ?, updated_at = ? WHERE id = ?
    `);

    const batch = this.db.transaction(() => {
      for (const m of models) {
        const modelId = String(m.modelId);
        const existingRow = existing.find(e => e.model_id === modelId);
        if (existingRow) {
          updateStmt.run(
            String(m.modelName), Number(m.maxTokens), m.supportsVision ? 1 : 0, m.supportsTools ? 1 : 0,
            Number(m.quotaTokensPerDay), Number(m.quotaTokensPerWeek), Number(m.quotaTokensPerMonth),
            Number(m.quotaCallsPerDay), Number(m.quotaCallsPerWeek), Number(m.quotaCallsPerMonth),
            now, existingRow.id
          );
          updated++;
        } else {
          const newId = uuidv4();
          insertStmt.run(
            newId, uid, providerId, '', modelId, String(m.modelName),
            Number(m.maxTokens), m.supportsVision ? 1 : 0, m.supportsTools ? 1 : 0,
            Number(m.quotaTokensPerDay), Number(m.quotaTokensPerWeek), Number(m.quotaTokensPerMonth),
            Number(m.quotaCallsPerDay), Number(m.quotaCallsPerWeek), Number(m.quotaCallsPerMonth),
            0, 'active', now, now
          );
          added++;
        }
      }
    });

    batch();

    logger.info('ModelConfigService', `[batchSaveConfigs] done: added=${added} updated=${updated} removed=${removed}`);
    return this.listConfigsByProvider(providerId, uid);
  }

  async getConfig(id: string): Promise<ModelConfig | undefined> {
    const row = this.db.prepare('SELECT * FROM user_model_config WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    const found = row ? this.rowToConfig(row) : undefined;
    logger.info('ModelConfigService', `[getConfig] id=${id} found=${!!found}`);
    return found;
  }

  async updateConfig(id: string, updates: Record<string, unknown>): Promise<ModelConfig | undefined> {
    const existing = await this.getConfig(id);
    if (!existing) {
      logger.warn('ModelConfigService', `[updateConfig] id=${id} not found`);
      return undefined;
    }

    logger.info('ModelConfigService', `[updateConfig] id=${id} keys=${Object.keys(updates).join(',')}`);

    const fields: string[] = [];
    const values: unknown[] = [];

    const mapping: Record<string, string> = {
      userId: 'user_id',
      providerId: 'provider_id',
      providerName: 'provider_name',
      modelId: 'model_id',
      modelName: 'model_name',
      maxTokens: 'max_tokens',
      supportsVision: 'supports_vision',
      supportsTools: 'supports_tools',
      quotaTokensPerDay: 'quota_tokens_per_day',
      quotaTokensPerWeek: 'quota_tokens_per_week',
      quotaTokensPerMonth: 'quota_tokens_per_month',
      quotaCallsPerDay: 'quota_calls_per_day',
      quotaCallsPerWeek: 'quota_calls_per_week',
      quotaCallsPerMonth: 'quota_calls_per_month',
      isDefault: 'is_default',
      status: 'status',
    };

    for (const [key, col] of Object.entries(mapping)) {
      if (key in updates) {
        fields.push(`${col} = ?`);
        let val = updates[key];
        if (typeof val === 'boolean') val = val ? 1 : 0;
        values.push(val);
      }
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(id);

    this.db.prepare(`UPDATE user_model_config SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.getConfig(id);
  }

  async deleteConfig(id: string): Promise<void> {
    logger.info('ModelConfigService', `[deleteConfig] id=${id}`);
    this.db.prepare('DELETE FROM user_model_config WHERE id = ?').run(id);
  }

  async deleteConfigsByProvider(providerId: string, userId?: string): Promise<number> {
    const uid = userId || '';
    const result = this.db.prepare(
      'DELETE FROM user_model_config WHERE provider_id = ? AND user_id = ?'
    ).run(providerId, uid);
    logger.info('ModelConfigService', `[deleteConfigsByProvider] providerId=${providerId} deleted=${result.changes}`);
    return result.changes;
  }

  async setDefault(id: string, userId?: string): Promise<void> {
    const uid = userId || '';
    logger.info('ModelConfigService', `[setDefault] id=${id} userId=${uid}`);

    this.db.prepare('UPDATE user_model_config SET is_default = 0 WHERE user_id = ?').run(uid);

    this.db.prepare(
      'UPDATE user_model_config SET is_default = 1, updated_at = ? WHERE id = ? AND user_id = ?'
    ).run(Date.now(), id, uid);
  }

  async unsetDefault(id: string): Promise<ModelConfig | undefined> {
    logger.info('ModelConfigService', `[unsetDefault] id=${id}`);
    this.db.prepare(
      'UPDATE user_model_config SET is_default = 0, updated_at = ? WHERE id = ?'
    ).run(Date.now(), id);
    return this.getConfig(id);
  }

  async getDefaultConfig(userId?: string): Promise<ModelConfig | undefined> {
    const uid = userId || '';
    const row = this.db.prepare(
      'SELECT * FROM user_model_config WHERE user_id = ? AND is_default = 1 LIMIT 1'
    ).get(uid) as Record<string, unknown> | undefined;
    const found = row ? this.rowToConfig(row) : undefined;
    logger.info('ModelConfigService', `[getDefaultConfig] userId=${uid} found=${!!found}${found ? ' modelId=' + found.modelId : ''}`);
    return found;
  }
}