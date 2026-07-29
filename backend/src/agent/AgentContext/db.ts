import type { AgentDatabase } from '../infra/dbTypes';
import { getDatabase } from '../../infrastructure/database';
import { v4 as uuidv4 } from 'uuid';

export type ContextSource = 'pinned' | 'timeline' | 'tag_relative' | 'similarity' | 'keyword' | 'random';

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

function generateId(): string {
  return uuidv4();
}

function ensureSchema(db: AgentDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_context (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    context_id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    agent_id TEXT,
    work_id TEXT,
    trace_id TEXT,
    context_total_count INTEGER NOT NULL DEFAULT 0,
    context_sources_summary TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_agent_context_context_id ON agent_context(context_id);
  CREATE INDEX IF NOT EXISTS idx_agent_context_session_id ON agent_context(session_id);
  CREATE INDEX IF NOT EXISTS idx_agent_context_agent_id ON agent_context(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_context_work_id ON agent_context(work_id);
  CREATE INDEX IF NOT EXISTS idx_agent_context_trace_id ON agent_context(trace_id);
  CREATE INDEX IF NOT EXISTS idx_agent_context_created ON agent_context(created);
  CREATE INDEX IF NOT EXISTS idx_agent_context_updated ON agent_context(updated);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_context_agent_work ON agent_context(agent_id, work_id) WHERE agent_id IS NOT NULL AND work_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS agent_context_item (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    context_id TEXT NOT NULL,
    info_id TEXT NOT NULL,
    source TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_agent_context_item_context_id ON agent_context_item(context_id);
  CREATE INDEX IF NOT EXISTS idx_agent_context_item_source ON agent_context_item(source);
  CREATE INDEX IF NOT EXISTS idx_agent_context_item_created ON agent_context_item(created);
  CREATE INDEX IF NOT EXISTS idx_agent_context_item_updated ON agent_context_item(updated);

  CREATE TABLE IF NOT EXISTS agent_context_config (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    max_context_items INTEGER NOT NULL DEFAULT 200,
    enable_snapshot_persistence INTEGER NOT NULL DEFAULT 1
  );`);

  const row = db.prepare('SELECT * FROM agent_context_config LIMIT 1').get() as Record<string, unknown> | undefined;
  if (!row) {
    const id = generateId();
    const now = Date.now();
    db.prepare('INSERT INTO agent_context_config (id, created, updated, max_context_items, enable_snapshot_persistence) VALUES (?, ?, ?, ?, ?)')
      .run(id, now, now, 200, 1);
  }
}

export interface AgentContextRow {
  id: string;
  created: number;
  updated: number;
  context_id: string;
  session_id: string;
  agent_id: string | null;
  work_id: string | null;
  trace_id: string | null;
  context_total_count: number;
  context_sources_summary: string;
}

export interface AgentContextItemRow {
  id: string;
  created: number;
  updated: number;
  context_id: string;
  info_id: string;
  source: string;
}

export interface AgentContextConfigRow {
  id: string;
  created: number;
  updated: number;
  max_context_items: number;
  enable_snapshot_persistence: number;
}

export interface SourcesSummary {
  pinned: number;
  timeline: number;
  tag_relative: number;
  similarity: number;
  keyword: number;
  random: number;
}

export const EMPTY_SOURCES_SUMMARY: SourcesSummary = {
  pinned: 0,
  timeline: 0,
  tag_relative: 0,
  similarity: 0,
  keyword: 0,
  random: 0,
};

export function insertAgentContext(params: {
  context_id: string;
  session_id: string;
  agent_id?: string;
  work_id?: string;
  trace_id?: string;
  context_total_count: number;
  context_sources_summary: SourcesSummary;
}): string {
  const id = generateId();
  const now = Date.now();
  DB().prepare(`INSERT INTO agent_context (id, created, updated, context_id, session_id, agent_id, work_id, trace_id, context_total_count, context_sources_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, now, now, params.context_id, params.session_id,
    params.agent_id || null, params.work_id || null, params.trace_id || null,
    params.context_total_count, JSON.stringify(params.context_sources_summary)
  );
  return params.context_id;
}

export function insertAgentContextItems(items: { context_id: string; info_id: string; source: string }[]): void {
  if (items.length === 0) return;
  const now = Date.now();
  const stmt = DB().prepare(`INSERT INTO agent_context_item (id, created, updated, context_id, info_id, source)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for (const item of items) {
    const id = generateId();
    stmt.run(id, now, now, item.context_id, item.info_id, item.source);
  }
}

export function getAgentContextByTraceId(traceId: string): AgentContextRow | undefined {
  return DB().prepare('SELECT * FROM agent_context WHERE trace_id = ?').get(traceId) as AgentContextRow | undefined;
}

export function getAgentContextByAgentAndWork(agentId: string, workId: string): AgentContextRow | undefined {
  return DB().prepare('SELECT * FROM agent_context WHERE agent_id = ? AND work_id = ?').get(agentId, workId) as AgentContextRow | undefined;
}

export function getAgentContextByContextId(contextId: string): AgentContextRow | undefined {
  return DB().prepare('SELECT * FROM agent_context WHERE context_id = ?').get(contextId) as AgentContextRow | undefined;
}

export function listAgentContextItems(contextId: string, sources?: string[]): AgentContextItemRow[] {
  let sql = 'SELECT * FROM agent_context_item WHERE context_id = ?';
  const params: unknown[] = [contextId];
  if (sources && sources.length > 0) {
    const placeholders = sources.map(() => '?').join(',');
    sql += ` AND source IN (${placeholders})`;
    params.push(...sources);
  }
  sql += ' ORDER BY created ASC';
  return DB().prepare(sql).all(...params) as AgentContextItemRow[];
}

export function getAgentContextConfig(): AgentContextConfigRow {
  return DB().prepare('SELECT * FROM agent_context_config LIMIT 1').get() as AgentContextConfigRow;
}

export function updateAgentContextConfig(updates: Partial<{
  max_context_items: number;
  enable_snapshot_persistence: number;
}>): boolean {
  const now = Date.now();
  const setClauses: string[] = ['updated = ?'];
  const params: unknown[] = [now];
  if (updates.max_context_items !== undefined) { setClauses.push('max_context_items = ?'); params.push(updates.max_context_items); }
  if (updates.enable_snapshot_persistence !== undefined) { setClauses.push('enable_snapshot_persistence = ?'); params.push(updates.enable_snapshot_persistence); }
  DB().prepare(`UPDATE agent_context_config SET ${setClauses.join(', ')}`).run(...params);
  return true;
}

export function parseSourcesSummary(row: AgentContextRow | undefined): SourcesSummary {
  if (!row) return EMPTY_SOURCES_SUMMARY;
  try {
    return JSON.parse(row.context_sources_summary) as SourcesSummary;
  } catch {
    return EMPTY_SOURCES_SUMMARY;
  }
}
