import type { RelationDBAccess } from '@brian-agent/base';
import { RUNTIME_AGENT_DEF_TABLE, RUNTIME_AGENTS_CONFIG_TABLE } from '../domain/types';

export class AgentsSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.initDefTable();
    this.initConfigTable();
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
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_AGENT_DEF_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "name"               TEXT    NOT NULL,
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
