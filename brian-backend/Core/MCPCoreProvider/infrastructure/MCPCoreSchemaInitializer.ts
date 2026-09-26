import type { RelationDBAccess } from '@brian-agent/base';
import {
  MCP_CORE_CONFIG_TABLE,
  AGENT_MCP_USAGE_TABLE,
  DEFAULT_REGENERATE_RATE,
} from '../domain/types';

export class MCPCoreSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${MCP_CORE_CONFIG_TABLE}" (
        "id"                   TEXT    NOT NULL PRIMARY KEY,
        "created"              INTEGER NOT NULL,
        "updated"              INTEGER NOT NULL,
        "regen_rate"           INTEGER NOT NULL DEFAULT ${DEFAULT_REGENERATE_RATE},
        "similarity_threshold" REAL    NOT NULL DEFAULT 0.7,
        "prompt_template_id"   TEXT,
        "score_threshold"      INTEGER NOT NULL DEFAULT 90,
        "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8
      )
    `);

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${MCP_CORE_CONFIG_TABLE}" ADD COLUMN "match_cache_ttl_ms" INTEGER NOT NULL DEFAULT 600000`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${MCP_CORE_CONFIG_TABLE}" ADD COLUMN "match_cache_capacity" INTEGER NOT NULL DEFAULT 500`);
    } catch {  }

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${MCP_CORE_CONFIG_TABLE}" ADD COLUMN "score_threshold" INTEGER NOT NULL DEFAULT 90`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${MCP_CORE_CONFIG_TABLE}" ADD COLUMN "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8`);
    } catch {  }

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${MCP_CORE_CONFIG_TABLE}" ADD COLUMN "market_install_enabled" INTEGER NOT NULL DEFAULT 1`);
    } catch {  }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${AGENT_MCP_USAGE_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "agent_id"    TEXT    NOT NULL,
        "mcp_id"      TEXT    NOT NULL,
        "usage_date"  TEXT    NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.migrateLegacyUsageTable();
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${AGENT_MCP_USAGE_TABLE}_agent_mcp" ON "${AGENT_MCP_USAGE_TABLE}" ("agent_id", "mcp_id")`,
    );
  }

  private migrateLegacyUsageTable(): void {
    const cols = this.relationDb.queryRaw<{ name: string }>(
      `PRAGMA table_info("${AGENT_MCP_USAGE_TABLE}")`, [],
    );
    if ((cols ?? []).some((c) => c.name === 'agent_mcp_id')) {
      this.relationDb.executeRaw(`DROP TABLE "${AGENT_MCP_USAGE_TABLE}"`);
      this.relationDb.executeRaw(`
        CREATE TABLE "${AGENT_MCP_USAGE_TABLE}" (
          "id"          TEXT    NOT NULL PRIMARY KEY,
          "created"     INTEGER NOT NULL,
          "updated"     INTEGER NOT NULL,
          "agent_id"    TEXT    NOT NULL,
          "mcp_id"      TEXT    NOT NULL,
          "usage_date"  TEXT    NOT NULL,
          "usage_count" INTEGER NOT NULL DEFAULT 1
        )
      `);
    }
  }
}
