import type { AgentDatabase } from '../infra/dbTypes';
import { getDatabase } from '../../infrastructure/database';
import { generateId, type AgentTypeEnum } from './agentTypes';

let _db: AgentDatabase | null = null;

export function setDatabase(db: AgentDatabase): void {
  _db = db;
}

function getDB(): AgentDatabase {
  if (_db) return _db;
  _db = getDatabase() as unknown as AgentDatabase;
  return _db;
}

function DB(): AgentDatabase {
  const db = getDB();
  ensureSchema(db);
  return db;
}

function ensureSchema(db: AgentDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS agent (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    agent_id TEXT NOT NULL UNIQUE,
    agent_name TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    strategy_id TEXT NOT NULL DEFAULT '',
    llm_id TEXT NOT NULL DEFAULT '',
    soul_id TEXT NOT NULL DEFAULT '',
    task_signature TEXT NOT NULL DEFAULT '',
    usage_count INTEGER NOT NULL DEFAULT 0,
    eval_score INTEGER NOT NULL DEFAULT 50,
    enable INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_agent_agent_type ON agent(agent_type);
  CREATE INDEX IF NOT EXISTS idx_agent_created ON agent(created);
  CREATE INDEX IF NOT EXISTS idx_agent_updated ON agent(updated);

  CREATE TABLE IF NOT EXISTS agent_usage (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    agent_id TEXT NOT NULL,
    work_id TEXT NOT NULL DEFAULT '',
    interact_id TEXT NOT NULL DEFAULT '',
    usage_context TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_agent_usage_agent_id ON agent_usage(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_usage_created ON agent_usage(created);

  CREATE TABLE IF NOT EXISTS agent_opt_rule (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    days INTEGER NOT NULL DEFAULT 30,
    min_usage_count INTEGER NOT NULL DEFAULT 0,
    min_eval_score INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_agent_opt_rule_days ON agent_opt_rule(days);

  CREATE TABLE IF NOT EXISTS agent_library_config (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    prompt_template_id TEXT NOT NULL DEFAULT '',
    similarity_threshold REAL NOT NULL DEFAULT 0.7,
    max_agent_count INTEGER NOT NULL DEFAULT 100
  );`);

  const row = db.prepare('SELECT * FROM agent_library_config LIMIT 1').get() as Record<string, unknown> | undefined;
  if (!row) {
    const id = generateId();
    const now = Date.now();
    db.prepare('INSERT INTO agent_library_config (id, created, updated, prompt_template_id, similarity_threshold, max_agent_count) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, now, now, '', 0.7, 100);
  }
}

export interface AgentRow {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  agent_name: string;
  agent_type: string;
  strategy_id: string;
  llm_id: string;
  soul_id: string;
  task_signature: string;
  usage_count: number;
  eval_score: number;
  enable: number;
}

export interface AgentUsageRow {
  id: string;
  created: number;
  updated: number;
  agent_id: string;
  work_id: string;
  interact_id: string;
  usage_context: string | null;
}

export interface AgentOptRuleRow {
  id: string;
  created: number;
  updated: number;
  days: number;
  min_usage_count: number;
  min_eval_score: number;
}

export interface AgentLibraryConfigRow {
  id: string;
  created: number;
  updated: number;
  prompt_template_id: string;
  similarity_threshold: number;
  max_agent_count: number;
}

export function addAgent(params: {
  agent_id: string;
  agent_type: AgentTypeEnum;
  strategy_id: string;
  llm_id: string;
  soul_id: string;
  task_signature: string;
  agent_name: string;
}): string {
  const id = generateId();
  const now = Date.now();
  DB().prepare(`INSERT INTO agent (id, created, updated, agent_id, agent_name, agent_type, strategy_id, llm_id, soul_id, task_signature)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, now, now, params.agent_id, params.agent_name, params.agent_type,
    params.strategy_id, params.llm_id, params.soul_id, params.task_signature
  );
  return params.agent_id;
}

export function getAgentByAgentId(agentId: string): AgentRow | undefined {
  return DB().prepare('SELECT * FROM agent WHERE agent_id = ?').get(agentId) as AgentRow | undefined;
}

export function getAgentById(id: string): AgentRow | undefined {
  return DB().prepare('SELECT * FROM agent WHERE id = ?').get(id) as AgentRow | undefined;
}

export function getAgentByIdOrAgentId(identifier: string): AgentRow | undefined {
  return DB().prepare('SELECT * FROM agent WHERE agent_id = ? OR id = ?').get(identifier, identifier) as AgentRow | undefined;
}

export function listAgents(filters?: {
  agent_type?: AgentTypeEnum;
  enable?: boolean;
  conditions?: string;
  order_by?: string;
  page_num?: number;
  page_size?: number;
}): AgentRow[] {
  let sql = 'SELECT * FROM agent WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.agent_type) {
    sql += ' AND agent_type = ?';
    params.push(filters.agent_type);
  }
  if (filters?.enable !== undefined) {
    sql += ' AND enable = ?';
    params.push(filters.enable ? 1 : 0);
  }

  if (filters?.order_by) {
    sql += ` ORDER BY ${filters.order_by}`;
  } else {
    sql += ' ORDER BY created DESC';
  }

  if (filters?.page_num && filters?.page_size) {
    const offset = (filters.page_num - 1) * filters.page_size;
    sql += ' LIMIT ? OFFSET ?';
    params.push(filters.page_size, offset);
  }

  return DB().prepare(sql).all(...params) as AgentRow[];
}

export function updateAgent(
  agentId: string,
  updates: Partial<Pick<AgentRow, 'agent_name' | 'task_signature' | 'eval_score' | 'enable' | 'strategy_id' | 'llm_id' | 'soul_id' | 'usage_count'>>
): boolean {
  const existing = getAgentByAgentId(agentId);
  if (!existing) return false;

  const now = Date.now();
  const setClauses: string[] = ['updated = ?'];
  const params: unknown[] = [now];

  if (updates.agent_name !== undefined) { setClauses.push('agent_name = ?'); params.push(updates.agent_name); }
  if (updates.task_signature !== undefined) { setClauses.push('task_signature = ?'); params.push(updates.task_signature); }
  if (updates.eval_score !== undefined) { setClauses.push('eval_score = ?'); params.push(updates.eval_score); }
  if (updates.enable !== undefined) { setClauses.push('enable = ?'); params.push(updates.enable); }
  if (updates.strategy_id !== undefined) { setClauses.push('strategy_id = ?'); params.push(updates.strategy_id); }
  if (updates.llm_id !== undefined) { setClauses.push('llm_id = ?'); params.push(updates.llm_id); }
  if (updates.soul_id !== undefined) { setClauses.push('soul_id = ?'); params.push(updates.soul_id); }
  if (updates.usage_count !== undefined) { setClauses.push('usage_count = ?'); params.push(updates.usage_count); }

  params.push(agentId);
  DB().prepare(`UPDATE agent SET ${setClauses.join(', ')} WHERE agent_id = ?`).run(...params);
  return true;
}

export function recordAgentUsage(params: {
  agent_id: string;
  work_id: string;
  interact_id: string;
  usage_context?: string;
}): void {
  const id = generateId();
  const now = Date.now();
  DB().prepare(`INSERT INTO agent_usage (id, created, updated, agent_id, work_id, interact_id, usage_context)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, now, now, params.agent_id, params.work_id, params.interact_id, params.usage_context || null
  );
  DB().prepare('UPDATE agent SET usage_count = usage_count + 1, updated = ? WHERE agent_id = ?').run(now, params.agent_id);
}

export function getAgentUsageCount(agentId: string, days: number): number {
  const cutoff = Date.now() - days * 86400 * 1000;
  const row = DB().prepare('SELECT COUNT(*) as cnt FROM agent_usage WHERE agent_id = ? AND created >= ?').get(agentId, cutoff) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export function listAgentOptRules(): AgentOptRuleRow[] {
  return DB().prepare('SELECT * FROM agent_opt_rule ORDER BY days ASC').all() as AgentOptRuleRow[];
}

export function insertAgentOptRule(data: { days: number; min_usage_count: number; min_eval_score: number }): string {
  const id = generateId();
  const now = Date.now();
  DB().prepare(`INSERT INTO agent_opt_rule (id, created, updated, days, min_usage_count, min_eval_score)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, now, now, data.days, data.min_usage_count, data.min_eval_score);
  return id;
}

export function updateAgentOptRule(id: string, data: { days?: number; min_usage_count?: number; min_eval_score?: number }): boolean {
  const existing = DB().prepare('SELECT * FROM agent_opt_rule WHERE id = ?').get(id) as AgentOptRuleRow | undefined;
  if (!existing) return false;
  const now = Date.now();
  const setClauses: string[] = ['updated = ?'];
  const params: unknown[] = [now];
  if (data.days !== undefined) { setClauses.push('days = ?'); params.push(data.days); }
  if (data.min_usage_count !== undefined) { setClauses.push('min_usage_count = ?'); params.push(data.min_usage_count); }
  if (data.min_eval_score !== undefined) { setClauses.push('min_eval_score = ?'); params.push(data.min_eval_score); }
  params.push(id);
  DB().prepare(`UPDATE agent_opt_rule SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
  return true;
}

export function deleteAgentOptRule(id: string): boolean {
  DB().prepare('DELETE FROM agent_opt_rule WHERE id = ?').run(id);
  return true;
}

export function getAgentLibraryConfig(): AgentLibraryConfigRow {
  return DB().prepare('SELECT * FROM agent_library_config LIMIT 1').get() as AgentLibraryConfigRow;
}

export function updateAgentLibraryConfig(updates: Partial<{
  prompt_template_id: string;
  similarity_threshold: number;
  max_agent_count: number;
}>): boolean {
  const now = Date.now();
  const setClauses: string[] = ['updated = ?'];
  const params: unknown[] = [now];
  if (updates.prompt_template_id !== undefined) { setClauses.push('prompt_template_id = ?'); params.push(updates.prompt_template_id); }
  if (updates.similarity_threshold !== undefined) { setClauses.push('similarity_threshold = ?'); params.push(updates.similarity_threshold); }
  if (updates.max_agent_count !== undefined) { setClauses.push('max_agent_count = ?'); params.push(updates.max_agent_count); }
  DB().prepare(`UPDATE agent_library_config SET ${setClauses.join(', ')}`).run(...params);
  return true;
}

export function disableAgents(agentIds: string[]): number {
  if (agentIds.length === 0) return 0;
  const now = Date.now();
  const placeholders = agentIds.map(() => '?').join(',');
  const result = DB().prepare(`UPDATE agent SET enable = 0, updated = ? WHERE agent_id IN (${placeholders})`).run(now, ...agentIds);
  return result.changes;
}
