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

/**
 * MCPProvider 表结构初始化器。
 */
export class MCPSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  /** 创建所有 MCPProvider 表（IF NOT EXISTS） */
  init(): void {
    // mcp_provider 表（PRD 4.1）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MCP_PROVIDER_TABLE}" (
        "id"                   TEXT    NOT NULL PRIMARY KEY,
        "created"              INTEGER NOT NULL,
        "updated"              INTEGER NOT NULL,
        "mcp_provider_url"     TEXT    NOT NULL,
        "mcp_provider_title"   TEXT    NOT NULL,
        "mcp_provider_brief"   TEXT,
        "enable"               INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_PROVIDER_TABLE}_created" ON "${MCP_PROVIDER_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_PROVIDER_TABLE}_updated" ON "${MCP_PROVIDER_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_PROVIDER_TABLE}_title" ON "${MCP_PROVIDER_TABLE}" ("mcp_provider_title")`,
    );

    // mcp_cache 表（PRD 4.2）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MCP_CACHE_TABLE}" (
        "id"                TEXT    NOT NULL PRIMARY KEY,
        "created"           INTEGER NOT NULL,
        "updated"           INTEGER NOT NULL,
        "mcp_provider_id"   TEXT    NOT NULL,
        "mcp_title"         TEXT    NOT NULL,
        "mcp_brief"         TEXT    NOT NULL,
        "mcp_install_cmd"   TEXT    NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_created" ON "${MCP_CACHE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_updated" ON "${MCP_CACHE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_provider" ON "${MCP_CACHE_TABLE}" ("mcp_provider_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_title" ON "${MCP_CACHE_TABLE}" ("mcp_title")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_brief" ON "${MCP_CACHE_TABLE}" ("mcp_brief")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_install_cmd" ON "${MCP_CACHE_TABLE}" ("mcp_install_cmd")`,
    );

    // mcp_install 表（PRD 4.3）
    this.relationDb.executeRaw(`
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
        "enable"              INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_created" ON "${MCP_INSTALL_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_updated" ON "${MCP_INSTALL_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_provider" ON "${MCP_INSTALL_TABLE}" ("mcp_provider_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_title" ON "${MCP_INSTALL_TABLE}" ("mcp_title")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_brief" ON "${MCP_INSTALL_TABLE}" ("mcp_brief")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_install_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_install_cmd")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_start_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_start_cmd")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_stop_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_stop_cmd")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_uninstall_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_uninstall_cmd")`,
    );

    // mcp_usage 表（PRD 4.4）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MCP_USAGE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "mcp_install_id"  TEXT    NOT NULL,
        "usage_date"      TEXT    NOT NULL,
        "usage_count"     INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_USAGE_TABLE}_created" ON "${MCP_USAGE_TABLE}" ("created")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_USAGE_TABLE}_updated" ON "${MCP_USAGE_TABLE}" ("updated")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_USAGE_TABLE}_install" ON "${MCP_USAGE_TABLE}" ("mcp_install_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_USAGE_TABLE}_date" ON "${MCP_USAGE_TABLE}" ("usage_date")`,
    );

    // mcp_config 配置表（PRD 4.5）
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MCP_CONFIG_TABLE}" (
        "config_key"   TEXT    NOT NULL PRIMARY KEY,
        "config_value" TEXT    NOT NULL,
        "value_type"   TEXT    NOT NULL,
        "description"  TEXT,
        "updated"      INTEGER NOT NULL
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${MCP_CONFIG_TABLE}_updated" ON "${MCP_CONFIG_TABLE}" ("updated")`,
    );
  }
}
