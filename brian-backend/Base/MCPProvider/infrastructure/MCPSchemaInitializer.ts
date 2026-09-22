/**
 * @fileoverview MCPProvider 表结构初始化。
 *
 * 创建 mcp_provider、mcp_cache、mcp_install、mcp_usage、mcp_config 五张表。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  MCP_PROVIDER_TABLE,
  MCP_CACHE_TABLE,
  MCP_INSTALL_TABLE,
  MCP_USAGE_TABLE,
  MCP_CONFIG_TABLE,
} from '../domain/types';

/** 幂等容忍 DDL 条目：执行失败进入 catch 忽略，ignoreReason 说明预期冲突场景 */
type TolerantDdl = { sql: string; ignoreReason: string };

/** DDL 数据表条目：字符串 = 直接执行（失败即抛出）；TolerantDdl = try/catch 幂等容忍 */
type DdlEntry = string | TolerantDdl;

/**
 * MCPProvider 表结构初始化器。
 */
export class MCPSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  // ===== DDL 数据表（纯声明，数组顺序即执行顺序；IF NOT EXISTS 保证幂等）=====
  private readonly ddlStatements: readonly DdlEntry[] = [
    // mcp_provider 表（PRD 4.1）
    `
      CREATE TABLE IF NOT EXISTS "${MCP_PROVIDER_TABLE}" (
        "id"                   TEXT    NOT NULL PRIMARY KEY,
        "created"              INTEGER NOT NULL,
        "updated"              INTEGER NOT NULL,
        "provider_code"        TEXT,
        "mcp_provider_url"     TEXT    NOT NULL,
        "mcp_provider_title"   TEXT    NOT NULL,
        "mcp_provider_brief"   TEXT,
        "enable"               INTEGER NOT NULL DEFAULT 1
      )
    `,
    { sql: `ALTER TABLE "${MCP_PROVIDER_TABLE}" ADD COLUMN "provider_code" TEXT`, ignoreReason: '已存在 provider_code 列时忽略' },
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_PROVIDER_TABLE}_created" ON "${MCP_PROVIDER_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_PROVIDER_TABLE}_updated" ON "${MCP_PROVIDER_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_PROVIDER_TABLE}_title" ON "${MCP_PROVIDER_TABLE}" ("mcp_provider_title")`,

    // mcp_cache 表（PRD 4.2）
    `
      CREATE TABLE IF NOT EXISTS "${MCP_CACHE_TABLE}" (
        "id"                TEXT    NOT NULL PRIMARY KEY,
        "created"           INTEGER NOT NULL,
        "updated"           INTEGER NOT NULL,
        "mcp_provider_id"   TEXT    NOT NULL,
        "mcp_title"         TEXT    NOT NULL,
        "mcp_brief"         TEXT    NOT NULL,
        "mcp_install_cmd"   TEXT    NOT NULL
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_created" ON "${MCP_CACHE_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_updated" ON "${MCP_CACHE_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_provider" ON "${MCP_CACHE_TABLE}" ("mcp_provider_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_title" ON "${MCP_CACHE_TABLE}" ("mcp_title")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_brief" ON "${MCP_CACHE_TABLE}" ("mcp_brief")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_install_cmd" ON "${MCP_CACHE_TABLE}" ("mcp_install_cmd")`,

    // mcp_install 表（PRD 4.3）
    `
      CREATE TABLE IF NOT EXISTS "${MCP_INSTALL_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "mcp_provider_id"     TEXT    NOT NULL,
        "mcp_title"           TEXT    NOT NULL,
        "mcp_brief"           TEXT    NOT NULL,
        "mcp_install_cmd"     TEXT    NOT NULL,
        "mcp_start_cmd"       TEXT    NOT NULL,
        "mcp_stop_cmd"        TEXT    NOT NULL,
        "mcp_uninstall_cmd"   TEXT    NOT NULL,
        "version"             TEXT,
        "transport_type"      TEXT,
        "transport_config"    TEXT,
        "status"              TEXT    NOT NULL DEFAULT 'stopped',
        "enable"              INTEGER NOT NULL DEFAULT 1
      )
    `,
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" ADD COLUMN "version" TEXT`, ignoreReason: '已存在 version 列时忽略' },
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" ADD COLUMN "transport_type" TEXT`, ignoreReason: '已存在 transport_type 列时忽略' },
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" ADD COLUMN "transport_config" TEXT`, ignoreReason: '已存在 transport_config 列时忽略' },
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'stopped'`, ignoreReason: '已存在 status 列时忽略' },
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_created" ON "${MCP_INSTALL_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_updated" ON "${MCP_INSTALL_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_provider" ON "${MCP_INSTALL_TABLE}" ("mcp_provider_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_title" ON "${MCP_INSTALL_TABLE}" ("mcp_title")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_brief" ON "${MCP_INSTALL_TABLE}" ("mcp_brief")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_install_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_install_cmd")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_start_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_start_cmd")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_stop_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_stop_cmd")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_uninstall_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_uninstall_cmd")`,

    // mcp_usage 表（PRD 4.4）
    `
      CREATE TABLE IF NOT EXISTS "${MCP_USAGE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "mcp_install_id"  TEXT    NOT NULL,
        "usage_date"      TEXT    NOT NULL,
        "usage_count"     INTEGER NOT NULL DEFAULT 0
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_USAGE_TABLE}_created" ON "${MCP_USAGE_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_USAGE_TABLE}_updated" ON "${MCP_USAGE_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_USAGE_TABLE}_install" ON "${MCP_USAGE_TABLE}" ("mcp_install_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_USAGE_TABLE}_date" ON "${MCP_USAGE_TABLE}" ("usage_date")`,

    // mcp_config 配置表（PRD 4.5）
    `
      CREATE TABLE IF NOT EXISTS "${MCP_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CONFIG_TABLE}_updated" ON "${MCP_CONFIG_TABLE}" ("updated")`,
  ];

  /**
   * 创建所有 MCPProvider 表（IF NOT EXISTS）。
   */
  init(): void {
    for (const ddl of this.ddlStatements) {
      if (typeof ddl === 'string') {
        this.relationDb.executeRaw(ddl);
        continue;
      }
      try {
        this.relationDb.executeRaw(ddl.sql);
      } catch { /* 幂等容忍：忽略原因见该条目 ignoreReason */ }
    }
  }
}
