import type { RelationDBAccess } from '@brian-agent/base';
import { RUNTIME_RUN_TABLE, RUNTIME_RUNS_CONFIG_TABLE, RUN_ROUND_ORG_TABLE } from '../domain/types';

export class RunsSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    // ADR-012 迁移:旧表改名(幂等,旧表不存在或已改名时忽略)
    try { this.relationDb.executeRaw(`ALTER TABLE "runtime_run" RENAME TO "${RUNTIME_RUN_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_RUN_TABLE}" (
        "id"            TEXT    NOT NULL PRIMARY KEY,
        "created"       INTEGER NOT NULL,
        "updated"       INTEGER NOT NULL,
        "session_key"   TEXT    NOT NULL,
        "session_id"    TEXT    NOT NULL DEFAULT '',
        "agent_def_id"  TEXT    NOT NULL DEFAULT '',
        "lane"          TEXT    NOT NULL DEFAULT 'session',
        "status"        TEXT    NOT NULL DEFAULT 'accepted',
        "stop_reason"   TEXT    NOT NULL DEFAULT '',
        "queue_mode"    TEXT    NOT NULL DEFAULT '',
        "budget_total"  INTEGER NOT NULL DEFAULT 60,
        "budget_used"   INTEGER NOT NULL DEFAULT 0,
        "accepted_at"   INTEGER NOT NULL DEFAULT 0,
        "started_at"    INTEGER,
        "settled_at"    INTEGER,
        "trace_id"      TEXT    NOT NULL DEFAULT ''
      )
    `);

    try { this.relationDb.executeRaw(`ALTER TABLE "${RUNTIME_RUN_TABLE}" ADD COLUMN "trace_id" TEXT NOT NULL DEFAULT ''`); } catch {  }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_session" ON "${RUNTIME_RUN_TABLE}" ("session_key", "created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_RUN_TABLE}_status" ON "${RUNTIME_RUN_TABLE}" ("status")`,
    );

    // ADR-012:run_round_org(组织数据)——每轮 LLM 调用与助手消息的 id 关联,思考全景唯一事实源
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUN_ROUND_ORG_TABLE}" (
        "id"                   TEXT    NOT NULL PRIMARY KEY,
        "created"              INTEGER NOT NULL,
        "updated"              INTEGER NOT NULL,
        "trace_id"             TEXT    NOT NULL DEFAULT '',
        "run_id"               TEXT    NOT NULL,
        "round"                INTEGER NOT NULL,
        "llm_call_id"          TEXT    NOT NULL DEFAULT '',
        "assistant_message_id" TEXT    NOT NULL DEFAULT '',
        "stop_reason"          TEXT    NOT NULL DEFAULT ''
      )
    `);
    this.relationDb.executeRaw(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_${RUN_ROUND_ORG_TABLE}_run_round" ON "${RUN_ROUND_ORG_TABLE}" ("run_id", "round")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUN_ROUND_ORG_TABLE}_run" ON "${RUN_ROUND_ORG_TABLE}" ("run_id")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_RUNS_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
