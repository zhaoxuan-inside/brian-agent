import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  MCP_PROVIDER_TABLE,
  MCP_CACHE_TABLE,
  MCP_INSTALL_TABLE,
  MCP_EMBEDDING_TABLE,
  MCP_EXAMPLE_EMBEDDING_TABLE,
  MCP_CONFIG_TABLE,
} from '../domain/types';

type TolerantDdl = { sql: string; ignoreReason: string };

type DdlEntry = string | TolerantDdl;

export class MCPSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  private readonly ddlStatements: readonly DdlEntry[] = [

    // ADR-012:组件定义表改名 + 去冗余列(幂等)
    { sql: `ALTER TABLE "mcp_provider" RENAME TO "${MCP_PROVIDER_TABLE}"`, ignoreReason: '旧表不存在或已改名' },
    { sql: `ALTER TABLE "mcp_install" RENAME TO "${MCP_INSTALL_TABLE}"`, ignoreReason: '旧表不存在或已改名' },
    { sql: `ALTER TABLE "${MCP_PROVIDER_TABLE}" DROP COLUMN "provider_code"`, ignoreReason: '列不存在' },
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" DROP COLUMN "status"`, ignoreReason: '列不存在' },

    `
      CREATE TABLE IF NOT EXISTS "${MCP_PROVIDER_TABLE}" (
        "id"                   TEXT    NOT NULL PRIMARY KEY,
        "created"              INTEGER NOT NULL,
        "updated"              INTEGER NOT NULL,
        "mcp_provider_url"     TEXT    NOT NULL,
        "mcp_provider_title"   TEXT    NOT NULL,
        "mcp_provider_brief"   TEXT,
        "enable"               INTEGER NOT NULL DEFAULT 1
      )
    `,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_PROVIDER_TABLE}_created" ON "${MCP_PROVIDER_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_PROVIDER_TABLE}_updated" ON "${MCP_PROVIDER_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_PROVIDER_TABLE}_title" ON "${MCP_PROVIDER_TABLE}" ("mcp_provider_title")`,

    `
      CREATE TABLE IF NOT EXISTS "${MCP_CACHE_TABLE}" (
        "id"                TEXT    NOT NULL PRIMARY KEY,
        "created"           INTEGER NOT NULL,
        "updated"           INTEGER NOT NULL,
        "mcp_provider_id"   TEXT    NOT NULL,
        "mcp_title"         TEXT    NOT NULL,
        "mcp_brief"         TEXT    NOT NULL,
        "mcp_install_cmd"   TEXT    NOT NULL,
        "test_params_sample" TEXT   DEFAULT ''
      )
    `,
    { sql: `ALTER TABLE "${MCP_CACHE_TABLE}" ADD COLUMN "test_params_sample" TEXT DEFAULT ''`, ignoreReason: '已存在 test_params_sample 列时忽略' },
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_created" ON "${MCP_CACHE_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_updated" ON "${MCP_CACHE_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_provider" ON "${MCP_CACHE_TABLE}" ("mcp_provider_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_title" ON "${MCP_CACHE_TABLE}" ("mcp_title")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_brief" ON "${MCP_CACHE_TABLE}" ("mcp_brief")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_CACHE_TABLE}_install_cmd" ON "${MCP_CACHE_TABLE}" ("mcp_install_cmd")`,

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
        "enable"              INTEGER NOT NULL DEFAULT 1
      )
    `,
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" ADD COLUMN "version" TEXT`, ignoreReason: '已存在 version 列时忽略' },
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" ADD COLUMN "transport_type" TEXT`, ignoreReason: '已存在 transport_type 列时忽略' },
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" ADD COLUMN "transport_config" TEXT`, ignoreReason: '已存在 transport_config 列时忽略' },
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'stopped'`, ignoreReason: '已存在 status 列时忽略' },
    { sql: `ALTER TABLE "${MCP_INSTALL_TABLE}" ADD COLUMN "test_params_sample" TEXT DEFAULT ''`, ignoreReason: '已存在 test_params_sample 列时忽略' },
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_created" ON "${MCP_INSTALL_TABLE}" ("created")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_updated" ON "${MCP_INSTALL_TABLE}" ("updated")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_provider" ON "${MCP_INSTALL_TABLE}" ("mcp_provider_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_title" ON "${MCP_INSTALL_TABLE}" ("mcp_title")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_brief" ON "${MCP_INSTALL_TABLE}" ("mcp_brief")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_install_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_install_cmd")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_start_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_start_cmd")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_stop_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_stop_cmd")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_INSTALL_TABLE}_uninstall_cmd" ON "${MCP_INSTALL_TABLE}" ("mcp_uninstall_cmd")`,

    `
      CREATE TABLE IF NOT EXISTS "${MCP_EMBEDDING_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "mcp_id"       TEXT    NOT NULL UNIQUE,
        "model"        TEXT    NOT NULL,
        "dimension"    INTEGER NOT NULL,
        "content_hash" TEXT    NOT NULL,
        "content"      TEXT    NOT NULL,
        "embedding"    TEXT    NOT NULL,
        "trace_id"     TEXT    NOT NULL DEFAULT ''
      )
    `,
    `CREATE UNIQUE INDEX IF NOT EXISTS "idx_${MCP_EMBEDDING_TABLE}_mcp_id" ON "${MCP_EMBEDDING_TABLE}" ("mcp_id")`,

    `
      CREATE TABLE IF NOT EXISTS "${MCP_EXAMPLE_EMBEDDING_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "mcp_id"       TEXT    NOT NULL,
        "example_text" TEXT    NOT NULL,
        "example_type" TEXT    NOT NULL DEFAULT 'positive',
        "model"        TEXT    NOT NULL,
        "dimension"    INTEGER NOT NULL,
        "content_hash" TEXT    NOT NULL,
        "embedding"    TEXT    NOT NULL,
        "trace_id"     TEXT    NOT NULL DEFAULT ''
      )
    `,
    { sql: `ALTER TABLE "${MCP_EXAMPLE_EMBEDDING_TABLE}" ADD COLUMN "example_type" TEXT NOT NULL DEFAULT 'positive'`, ignoreReason: '已存在 example_type 列时忽略' },
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_EXAMPLE_EMBEDDING_TABLE}_mcp_id" ON "${MCP_EXAMPLE_EMBEDDING_TABLE}" ("mcp_id")`,
    `CREATE INDEX IF NOT EXISTS "idx_${MCP_EXAMPLE_EMBEDDING_TABLE}_mcp_type" ON "${MCP_EXAMPLE_EMBEDDING_TABLE}" ("mcp_id", "example_type")`,

    // ADR-012: mcp_usage 表已由 TraceBase 的 usage_event_record / mcp_usage_org 取代，不再建表

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

  init(): void {
    for (const ddl of this.ddlStatements) {
      if (typeof ddl === 'string') {
        this.relationDb.executeRaw(ddl);
        continue;
      }
      try {
        this.relationDb.executeRaw(ddl.sql);
      } catch {  }
    }
  }
}
