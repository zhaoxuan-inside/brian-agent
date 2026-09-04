/**
 * @fileoverview Agents 模块表结构初始化（Runtime v2 · 阶段3 前置）。
 *
 * 创建 runtime_agent_def（声明式定义）与 runtime_agents_config。
 */

import type { RelationDBAccess } from '@brian-agent/base';
import { RUNTIME_AGENT_DEF_TABLE, RUNTIME_AGENTS_CONFIG_TABLE } from '../domain/types';

/**
 * AgentsSchemaInitializer。
 */
export class AgentsSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  /** 创建所有 Agents 表（IF NOT EXISTS 语义，可安全重复调用） */
  async init(): Promise<void> {
    this.initDefTable();
    this.initConfigTable();
    this.ensurePurposeColumn();
  }

  /** 兼容迁移：agent_purpose 列（已存在时 SQLite 报错，静默视为成功） */
  private ensurePurposeColumn(): void {
    try {
      this.relationDb.executeRaw(
        `ALTER TABLE "${RUNTIME_AGENT_DEF_TABLE}" ADD COLUMN "agent_purpose" TEXT NOT NULL DEFAULT ''`,
      );
    } catch {
      /* 列已存在 */
    }
  }

  /** runtime_agent_def 表 */
  private initDefTable(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${RUNTIME_AGENT_DEF_TABLE}" (
        "id"                 TEXT    NOT NULL PRIMARY KEY,
        "created"            INTEGER NOT NULL,
        "updated"            INTEGER NOT NULL,
        "name"               TEXT    NOT NULL UNIQUE,
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

  /** runtime_agents_config 配置表 */
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
