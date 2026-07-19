import { getDatabase } from '../../infrastructure/database';
import { generateId } from '../../infrastructure/uuid';

export interface ProviderConfigRow {
  id: string;
  provider_id: string;
  provider_name: string;
  type: string;
  base_url: string;
  api_key: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export interface ProviderModelRow {
  id: string;
  config_id: string;
  model_id: string;
  model_name: string;
  max_tokens: number;
  supports_vision: number;
  supports_tools: number;
  created_at: number;
  updated_at: number;
}

export interface UserModelRow {
  id: string;
  config_id: string;
  model_id: string;
  model_name: string;
  provider_name: string;
  quota_tokens_per_day: number;
  quota_tokens_per_week: number;
  quota_tokens_per_month: number;
  quota_calls_per_day: number;
  quota_calls_per_week: number;
  quota_calls_per_month: number;
  is_default: number;
  created_at: number;
  updated_at: number;
}

function now(): number {
  return Date.now();
}

// ── Provider Configs ──

export function upsertProviderConfig(
  providerId: string,
  name: string,
  type: string,
  baseUrl: string,
  apiKey: string,
  enabled: boolean,
): ProviderConfigRow {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM provider_configs WHERE provider_id = ?').get(providerId) as ProviderConfigRow | undefined;

  if (existing) {
    // Preserve existing API key if incoming value is masked
    const finalApiKey = (apiKey && !apiKey.startsWith('•')) ? apiKey : existing.api_key;
    db.prepare(`
      UPDATE provider_configs
      SET provider_name = ?, type = ?, base_url = ?, api_key = ?, enabled = ?, updated_at = ?
      WHERE provider_id = ?
    `).run(name, type, baseUrl, finalApiKey, enabled ? 1 : 0, now(), providerId);
    return { ...existing, provider_name: name, type, base_url: baseUrl, api_key: finalApiKey, enabled: enabled ? 1 : 0, updated_at: now() };
  }

  const id = generateId();
  const t = now();
  db.prepare(`
    INSERT INTO provider_configs (id, provider_id, provider_name, type, base_url, api_key, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, providerId, name, type, baseUrl, apiKey, enabled ? 1 : 0, t, t);
  return { id, provider_id: providerId, provider_name: name, type, base_url: baseUrl, api_key: apiKey, enabled: enabled ? 1 : 0, created_at: t, updated_at: t };
}

export function getProviderConfigs(): ProviderConfigRow[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_configs ORDER BY provider_name').all() as ProviderConfigRow[];
}

export function getProviderConfig(providerId: string): ProviderConfigRow | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_configs WHERE provider_id = ?').get(providerId) as ProviderConfigRow | undefined;
}

export function getProviderConfigById(id: string): ProviderConfigRow | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_configs WHERE id = ?').get(id) as ProviderConfigRow | undefined;
}

// ── Provider Models (from API) ──

export function syncProviderModels(
  configId: string,
  models: { id: string; name: string; maxTokens: number; supportsVision: boolean; supportsTools: boolean }[],
): { added: number; removed: number; updated: number } {
  const db = getDatabase();
  const t = now();
  let added = 0, removed = 0, updated = 0;

  const existing = db.prepare('SELECT * FROM provider_models WHERE config_id = ?').all(configId) as ProviderModelRow[];
  const existingMap = new Map(existing.map(m => [m.model_id, m]));
  const incomingIds = new Set(models.map(m => m.id));

  // Remove stale models
  for (const row of existing) {
    if (!incomingIds.has(row.model_id)) {
      db.prepare('DELETE FROM provider_models WHERE id = ?').run(row.id);
      removed++;
    }
  }

  // Add/update models
  for (const m of models) {
    const existing = existingMap.get(m.id);
    if (existing) {
      const needsUpdate =
        existing.model_name !== m.name ||
        existing.max_tokens !== m.maxTokens ||
        existing.supports_vision !== (m.supportsVision ? 1 : 0) ||
        existing.supports_tools !== (m.supportsTools ? 1 : 0);
      if (needsUpdate) {
        db.prepare(`
          UPDATE provider_models
          SET model_name = ?, max_tokens = ?, supports_vision = ?, supports_tools = ?, updated_at = ?
          WHERE id = ?
        `).run(m.name, m.maxTokens, m.supportsVision ? 1 : 0, m.supportsTools ? 1 : 0, t, existing.id);
        updated++;
      }
    } else {
      db.prepare(`
        INSERT INTO provider_models (id, config_id, model_id, model_name, max_tokens, supports_vision, supports_tools, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), configId, m.id, m.name, m.maxTokens, m.supportsVision ? 1 : 0, m.supportsTools ? 1 : 0, t, t);
      added++;
    }
  }

  return { added, removed, updated };
}

export function getProviderModels(configId: string): ProviderModelRow[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM provider_models WHERE config_id = ? ORDER BY model_name').all(configId) as ProviderModelRow[];
}

// ── User Models (selected with quotas) ──

export interface UserModelInput {
  modelId: string;
  modelName: string;
  providerName: string;
  quotaTokensPerDay?: number;
  quotaTokensPerWeek?: number;
  quotaTokensPerMonth?: number;
  quotaCallsPerDay?: number;
  quotaCallsPerWeek?: number;
  quotaCallsPerMonth?: number;
  isDefault?: boolean;
}

export function saveUserModels(configId: string, models: UserModelInput[]): void {
  const db = getDatabase();
  const t = now();

  db.prepare('DELETE FROM user_models WHERE config_id = ?').run(configId);

  for (const m of models) {
    db.prepare(`
      INSERT INTO user_models (id, config_id, model_id, model_name, provider_name,
        quota_tokens_per_day, quota_tokens_per_week, quota_tokens_per_month,
        quota_calls_per_day, quota_calls_per_week, quota_calls_per_month,
        is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(), configId, m.modelId, m.modelName, m.providerName,
      m.quotaTokensPerDay ?? 100000,
      m.quotaTokensPerWeek ?? 5000000,
      m.quotaTokensPerMonth ?? 22000000,
      m.quotaCallsPerDay ?? 1000,
      m.quotaCallsPerWeek ?? 5000,
      m.quotaCallsPerMonth ?? 22000,
      m.isDefault ? 1 : 0, t, t,
    );
  }

  const hasDefault = db.prepare('SELECT COUNT(*) as c FROM user_models WHERE config_id = ? AND is_default = 1').get(configId) as { c: number };
  if (!hasDefault.c) {
    const first = db.prepare('SELECT id FROM user_models WHERE config_id = ? ORDER BY created_at DESC LIMIT 1').get(configId) as { id: string } | undefined;
    if (first) {
      db.prepare('UPDATE user_models SET is_default = 1 WHERE id = ?').run(first.id);
    }
  }
}

export function getUserModels(configId: string): UserModelRow[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM user_models WHERE config_id = ? ORDER BY created_at DESC').all(configId) as UserModelRow[];
}

export function getAllUserModels(): UserModelRow[] {
  const db = getDatabase();
  return db.prepare('SELECT * FROM user_models ORDER BY created_at DESC').all() as UserModelRow[];
}

export function deleteUserModel(configId: string, modelId: string): { ok: boolean; message: string } {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM user_models WHERE config_id = ? AND model_id = ?').get(configId, modelId) as UserModelRow | undefined;
  if (!row) return { ok: false, message: '模型不存在' };
  if (row.is_default) return { ok: false, message: '默认模型不允许删除，请先解除默认' };

  db.prepare('DELETE FROM user_models WHERE id = ?').run(row.id);
  return { ok: true, message: '已删除' };
}

export function setDefaultUserModel(configId: string, modelId: string): { ok: boolean; message: string } {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM user_models WHERE config_id = ? AND model_id = ?').get(configId, modelId) as UserModelRow | undefined;
  if (!row) return { ok: false, message: '模型不存在' };

  db.prepare('UPDATE user_models SET is_default = 0 WHERE config_id = ?').run(configId);
  db.prepare('UPDATE user_models SET is_default = 1 WHERE id = ?').run(row.id);
  return { ok: true, message: '已设为默认' };
}

export function unsetDefaultUserModel(configId: string): { ok: boolean; message: string } {
  const db = getDatabase();
  const defaultRow = db.prepare('SELECT * FROM user_models WHERE config_id = ? AND is_default = 1').get(configId) as UserModelRow | undefined;
  if (!defaultRow) return { ok: false, message: '没有默认模型' };

  db.prepare('UPDATE user_models SET is_default = 0 WHERE config_id = ?').run(configId);

  const first = db.prepare('SELECT id FROM user_models WHERE config_id = ? ORDER BY created_at DESC LIMIT 1').get(configId) as { id: string } | undefined;
  if (first) {
    db.prepare('UPDATE user_models SET is_default = 1 WHERE id = ?').run(first.id);
    return { ok: true, message: '默认模型已转移至下一个模型' };
  }
  return { ok: true, message: '默认模型已解除' };
}
