import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import {
  PROMPT_TEMPLATE_TABLE,
  PROMPT_TEMPLATE_EMBEDDING_TABLE,
  PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE,
  PROMPT_TEMPLATE_USAGE_TABLE,
  PROMPTS_CONFIG_TABLE,
} from '../domain/types';

export class PromptsSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    // ADR-012:组件定义表改名 + 列规范化(幂等)——必须先于 createTables,
    // 否则旧库上 CREATE INDEX ("title") 会因列仍是 prompt_template_title 而崩溃
    try { this.relationDb.executeRaw(`ALTER TABLE "prompt_template" RENAME TO "${PROMPT_TEMPLATE_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${PROMPT_TEMPLATE_TABLE}" RENAME COLUMN "prompt_template_title" TO "title"`); } catch { /* 列已重命名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${PROMPT_TEMPLATE_TABLE}" RENAME COLUMN "prompt_template_brief" TO "brief"`); } catch { /* 列已重命名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "${PROMPT_TEMPLATE_TABLE}" RENAME COLUMN "prompt_template" TO "content"`); } catch { /* 列已重命名 */ }

    this.createTables();
    this.migrateLegacyNonUuidTemplates();
  }

  private createTables(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${PROMPT_TEMPLATE_TABLE}" (
        "id"                    TEXT    NOT NULL PRIMARY KEY,
        "created"               INTEGER NOT NULL,
        "updated"               INTEGER NOT NULL,
        "title"                 TEXT    NOT NULL,
        "brief"                 TEXT,
        "content"               TEXT    NOT NULL,
        "is_system"             INTEGER NOT NULL DEFAULT 0,
        "seed_hash"             TEXT,
        "enable"                INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.addColumnIfMissing('is_system', 'INTEGER NOT NULL DEFAULT 0');
    this.addColumnIfMissing('seed_hash', 'TEXT');
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_TABLE}_created" ON "${PROMPT_TEMPLATE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_TABLE}_updated" ON "${PROMPT_TEMPLATE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_TABLE}_title" ON "${PROMPT_TEMPLATE_TABLE}" ("title")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${PROMPT_TEMPLATE_EMBEDDING_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "prompt_template_id" TEXT    NOT NULL UNIQUE,
        "model"              TEXT    NOT NULL,
        "dimension"          INTEGER NOT NULL,
        "content_hash"       TEXT    NOT NULL,
        "content"            TEXT    NOT NULL,
        "embedding"          TEXT    NOT NULL,
        "trace_id"           TEXT    NOT NULL DEFAULT ''
      )
    `);
    this.relationDb.executeRaw(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_EMBEDDING_TABLE}_id" ON "${PROMPT_TEMPLATE_EMBEDDING_TABLE}" ("prompt_template_id")
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "prompt_template_id" TEXT    NOT NULL,
        "example_text"       TEXT    NOT NULL,
        "example_type"       TEXT    NOT NULL DEFAULT 'positive',
        "model"              TEXT    NOT NULL,
        "dimension"          INTEGER NOT NULL,
        "content_hash"       TEXT    NOT NULL,
        "embedding"          TEXT    NOT NULL,
        "trace_id"           TEXT    NOT NULL DEFAULT ''
      )
    `);
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE}" ADD COLUMN "example_type" TEXT NOT NULL DEFAULT 'positive'`,
      );
    } catch { /* column exists */ }
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE}_id" ON "${PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE}" ("prompt_template_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE}_type" ON "${PROMPT_TEMPLATE_EXAMPLE_EMBEDDING_TABLE}" ("prompt_template_id", "example_type")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${PROMPT_TEMPLATE_USAGE_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "prompt_template_id" TEXT    NOT NULL,
        "usage_date"         TEXT    NOT NULL,
        "usage_count"        INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_USAGE_TABLE}_prompt_template_id" ON "${PROMPT_TEMPLATE_USAGE_TABLE}" ("prompt_template_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_USAGE_TABLE}_usage_date" ON "${PROMPT_TEMPLATE_USAGE_TABLE}" ("usage_date")`,
    );

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${PROMPTS_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
  }

  private migrateLegacyNonUuidTemplates(): void {
    try {
      const rows = this.relationDb.queryRaw<{ id: string; title: string }>(
        `SELECT "id", "title" FROM "${PROMPT_TEMPLATE_TABLE}"`,
        [],
      );
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const row of rows ?? []) {
        if (!row.id || uuidRegex.test(row.id)) continue;
        const existing = this.relationDb.queryRaw<{ id: string }>(
          `SELECT "id" FROM "${PROMPT_TEMPLATE_TABLE}" WHERE "title" = ? AND "id" != ? LIMIT 1`,
          [row.title, row.id],
        );
        if (existing?.[0]?.id && uuidRegex.test(existing[0].id)) {
          this.rebindPromptId(row.id, existing[0].id);
          this.relationDb.executeRaw(`DELETE FROM "${PROMPT_TEMPLATE_TABLE}" WHERE "id" = ?`, [row.id]);
        } else {
          const newId = IdGenerator.generate();
          this.relationDb.executeRaw(`UPDATE "${PROMPT_TEMPLATE_TABLE}" SET "id" = ? WHERE "id" = ?`, [newId, row.id]);
          this.rebindPromptId(row.id, newId);
        }
      }
    } catch {

    }
  }

  private rebindPromptId(oldId: string, newId: string): void {
    // prompt_template_usage_org 为 TraceBase 日聚合表(ADR-012 改名),新旧名都尝试以覆盖迁移中间态
    // ADR-012 后 agent/runtime_agent_def 已改名 agent_record/runtime_agent_def_record——旧名 UPDATE 恒抛错被吞，
    // 导致 PromptCatalog 换 id 后 agent_record/runtime_agent_def_record 上的绑定全部悬挂（脏数据源头，chg-067 修复）
    const tables = ['agent_record', 'runtime_agent_def_record', 'prompt_template_usage', 'prompt_template_usage_org', 'user_profile_direction_record'];
    for (const table of tables) {
      try {
        this.relationDb.executeRaw(`UPDATE "${table}" SET "prompt_template_id" = ? WHERE "prompt_template_id" = ?`, [newId, oldId]);
      } catch {

      }
    }
  }

  private addColumnIfMissing(column: string, ddl: string): void {
    const cols = this.relationDb.queryRaw<{ name: string }>(
      `PRAGMA table_info("${PROMPT_TEMPLATE_TABLE}")`,
      [],
    );
    if (!cols?.some((c) => c.name === column)) {
      this.relationDb.executeRaw(`ALTER TABLE "${PROMPT_TEMPLATE_TABLE}" ADD COLUMN "${column}" ${ddl}`);
    }
  }
}
