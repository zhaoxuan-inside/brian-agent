import type { RelationDBAccess } from '../../RelationDBProvider';
import {
  FEEDBACK_RECORD_TABLE,
  FEEDBACK_PROCESS_LOG_TABLE,
  FEEDBACK_CONFIG_TABLE,
} from '../domain/types';

export class FeedbackSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${FEEDBACK_RECORD_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        feedback_id TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL DEFAULT 'user',
        agent_id TEXT NOT NULL DEFAULT '',
        work_id TEXT NOT NULL DEFAULT '',
        run_id TEXT NOT NULL DEFAULT '',
        rating INTEGER NOT NULL DEFAULT 0,
        comment TEXT NOT NULL DEFAULT '',
        suggestions TEXT NOT NULL DEFAULT '[]',
        category TEXT NOT NULL DEFAULT '',
        metadata TEXT NOT NULL DEFAULT '{}'
      )`,
    );
    // ===== 2026-09-14 三级维度最终定名：原 interact_id 列废弃，存量库 RENAME 为 run_id（一次问答，= runtime_run.id） =====
    try { this.relationDb.executeRaw(`ALTER TABLE ${FEEDBACK_RECORD_TABLE} RENAME COLUMN interact_id TO run_id`); } catch { /* 已重命名或原列不存在 */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_feedback_record_created ON ${FEEDBACK_RECORD_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_feedback_record_source ON ${FEEDBACK_RECORD_TABLE}(source)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_feedback_record_agent_id ON ${FEEDBACK_RECORD_TABLE}(agent_id)`,
    );

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${FEEDBACK_PROCESS_LOG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        process_id TEXT NOT NULL UNIQUE,
        feedback_id TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL DEFAULT 'submitted',
        agent_id TEXT NOT NULL DEFAULT '',
        run_id TEXT NOT NULL DEFAULT '',
        work_id TEXT NOT NULL DEFAULT '',
        rating INTEGER NOT NULL DEFAULT 0,
        details TEXT NOT NULL DEFAULT '{}'
      )`,
    );
    try { this.relationDb.executeRaw(`ALTER TABLE ${FEEDBACK_PROCESS_LOG_TABLE} RENAME COLUMN interact_id TO run_id`); } catch { /* 已重命名或原列不存在 */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_feedback_process_log_created ON ${FEEDBACK_PROCESS_LOG_TABLE}(created)`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS idx_feedback_process_log_feedback_id ON ${FEEDBACK_PROCESS_LOG_TABLE}(feedback_id)`,
    );

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${FEEDBACK_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        disband_threshold INTEGER NOT NULL DEFAULT 30,
        enable_auto_disband INTEGER NOT NULL DEFAULT 1
      )`,
    );
    const existingConfig = this.relationDb.queryRaw<{ id: string }>(
      `SELECT id FROM ${FEEDBACK_CONFIG_TABLE} LIMIT 1`,
    );
    if (existingConfig.length === 0) {
      const now = Date.now();
      this.relationDb.executeRaw(
        `INSERT INTO ${FEEDBACK_CONFIG_TABLE} (id, created, updated, disband_threshold, enable_auto_disband) VALUES (?, ?, ?, 30, 1)`,
        [(Date.now() + Math.random()).toString(36), now, now],
      );
    }
  }
}