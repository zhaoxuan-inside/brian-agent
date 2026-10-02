import type { RelationDBAccess } from '@brian-agent/base';
import {
  RUNTIME_AGENT_DEF_TABLE,
  AGENT_EXAMPLE_EMBEDDING_TABLE,
  RUNTIME_AGENTS_CONFIG_TABLE,
} from '../domain/types';

export class AgentsSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    // ADR-012 迁移:旧表改名(幂等,旧表不存在或已改名时忽略)
    try { this.relationDb.executeRaw(`ALTER TABLE "runtime_agent_def" RENAME TO "${RUNTIME_AGENT_DEF_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    this.initDefTable();
    this.initConfigTable();
    this.initExampleEmbeddingTable();
    this.ensurePurposeColumn();
  }

  private ensurePurposeColumn(): void {
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${RUNTIME_AGENT_DEF_TABLE}" ADD COLUMN "agent_purpose" TEXT NOT NULL DEFAULT ''`,
      );
    } catch {

    }
  }

  private initDefTable(): void {
    try { this.relationDb.executeRaw(`ALTER TABLE "${RUNTIME_AGENT_DEF_TABLE}" RENAME COLUMN "name" TO "title"`); } catch { /* 列已重命名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${RUNTIME_AGENT_DEF_TABLE}" RENAME COLUMN "agent_purpose" TO "brief"`); } catch { /* 已迁移或列不存在 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${RUNTIME_AGENT_DEF_TABLE}" ADD COLUMN "brief" TEXT NOT NULL DEFAULT ''`); } catch { /* 列已存在 */ }
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_AGENT_DEF_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "title"              TEXT    NOT NULL,
        "brief"              TEXT    NOT NULL DEFAULT '',
        "mode"               TEXT    NOT NULL DEFAULT 'primary',
        "agent_ref"          TEXT    NOT NULL DEFAULT '',
        "task_signature"     TEXT    NOT NULL DEFAULT '',
        "prompt_template_id" TEXT    NOT NULL DEFAULT '',
        "model_id"           TEXT    NOT NULL DEFAULT '',
        "soul_id"            TEXT    NOT NULL DEFAULT '',
        "tools_json"         TEXT    NOT NULL DEFAULT '',
        "temperature"        REAL,
        "budget_total"       INTEGER NOT NULL DEFAULT 60,
        "status"             TEXT    NOT NULL DEFAULT 'active'
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_AGENT_DEF_TABLE}_status" ON "${RUNTIME_AGENT_DEF_TABLE}" ("status")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${RUNTIME_AGENT_DEF_TABLE}_signature" ON "${RUNTIME_AGENT_DEF_TABLE}" ("task_signature")`,
    );
  }

  private initExampleEmbeddingTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_EXAMPLE_EMBEDDING_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "agent_id"     TEXT    NOT NULL,
        "example_text" TEXT    NOT NULL,
        "example_type" TEXT    NOT NULL DEFAULT 'positive',
        "model"        TEXT    NOT NULL,
        "dimension"    INTEGER NOT NULL,
        "content_hash" TEXT    NOT NULL,
        "embedding"    TEXT    NOT NULL,
        "trace_id"     TEXT    NOT NULL DEFAULT ''
      )
    `);
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${AGENT_EXAMPLE_EMBEDDING_TABLE}" ADD COLUMN "example_type" TEXT NOT NULL DEFAULT 'positive'`,
      );
    } catch { /* column exists */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${AGENT_EXAMPLE_EMBEDDING_TABLE}_agent_id" ON "${AGENT_EXAMPLE_EMBEDDING_TABLE}" ("agent_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${AGENT_EXAMPLE_EMBEDDING_TABLE}_agent_type" ON "${AGENT_EXAMPLE_EMBEDDING_TABLE}" ("agent_id", "example_type")`,
    );
  }

  private initConfigTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_AGENTS_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }
}
