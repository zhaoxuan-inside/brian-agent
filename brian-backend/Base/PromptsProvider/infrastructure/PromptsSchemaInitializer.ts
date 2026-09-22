/**
 * @fileoverview PromptsProvider 表结构初始化。
 *
 * 创建 prompt_template、prompt_template_usage、prompts_config 三张表。
 * DDL 通过 RelationDBAccess.executeRaw 执行，依赖 RelationDBProvider 的底层数据库。
 *
 * 表结构依据 `PromptsProvider-PRD.md` 第 4 节。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import {
  PROMPT_TEMPLATE_TABLE,
  PROMPT_TEMPLATE_USAGE_TABLE,
  PROMPTS_CONFIG_TABLE,
} from '../domain/types';

/**
 * PromptsProvider 表结构初始化器。
 *
 * 在 PromptsAccess 初始化时调用，确保所有表存在。
 */
export class PromptsSchemaInitializer {
  /**
   * @param relationDb RelationDBProvider 接入层实例
   */
  constructor(private readonly relationDb: RelationDBAccess) {}

  // ===== 修改后的方法（全量 UUID 校验与表结构初始化） =====
  /**
   * 创建所有 PromptsProvider 表并迁移历史非 UUID 主键为标准 UUID。
   */
  init(): void {
    this.createTables();
    this.migrateLegacyNonUuidTemplates();
  }

  /** 创建表结构与索引（数据处理） */
  private createTables(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${PROMPT_TEMPLATE_TABLE}" (
        "id"                    TEXT    NOT NULL PRIMARY KEY,
        "created"               INTEGER NOT NULL,
        "updated"               INTEGER NOT NULL,
        "prompt_template_title" TEXT    NOT NULL,
        "prompt_template_brief" TEXT,
        "prompt_template"       TEXT    NOT NULL,
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
      `CREATE INDEX IF NOT EXISTS "idx_${PROMPT_TEMPLATE_TABLE}_prompt_template_title" ON "${PROMPT_TEMPLATE_TABLE}" ("prompt_template_title")`,
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

  /** 迁移存量非 UUID 模板为标准 UUID（数据处理） */
  private migrateLegacyNonUuidTemplates(): void {
    try {
      const rows = this.relationDb.queryRaw<{ id: string; prompt_template_title: string }>(
        `SELECT "id", "prompt_template_title" FROM "${PROMPT_TEMPLATE_TABLE}"`,
        [],
      );
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const row of rows ?? []) {
        if (!row.id || uuidRegex.test(row.id)) continue;
        const existing = this.relationDb.queryRaw<{ id: string }>(
          `SELECT "id" FROM "${PROMPT_TEMPLATE_TABLE}" WHERE "prompt_template_title" = ? AND "id" != ? LIMIT 1`,
          [row.prompt_template_title, row.id],
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
      /* best effort */
    }
  }

  /** 级联更新关联表的 prompt_template_id 引用（数据处理） */
  private rebindPromptId(oldId: string, newId: string): void {
    const tables = ['agent', 'runtime_agent_def', 'prompt_template_usage', 'user_profile_direction'];
    for (const table of tables) {
      try {
        this.relationDb.executeRaw(`UPDATE "${table}" SET "prompt_template_id" = ? WHERE "prompt_template_id" = ?`, [newId, oldId]);
      } catch {
        /* best effort */
      }
    }
  }

  /** 补列迁移（数据处理；列已存在则跳过） */
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
