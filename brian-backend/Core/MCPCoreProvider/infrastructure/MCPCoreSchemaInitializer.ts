import type { RelationDBAccess } from '@brian-agent/base';
import {
  MCP_CORE_CONFIG_TABLE,
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
      this.relationDb.executeRaw(`ALTER TABLE "${MCP_CORE_CONFIG_TABLE}" ADD COLUMN "similarity_threshold" REAL NOT NULL DEFAULT 0.7`);
    } catch { /* 列已存在 */ }

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${MCP_CORE_CONFIG_TABLE}" ADD COLUMN "market_install_enabled" INTEGER NOT NULL DEFAULT 1`);
    } catch {  }

    // ADR-012: agent_mcp_usage 已退役(统一入 TraceBase usage_event_record / mcp_usage_org),不再建表;
    // 存量库由 TraceSchemaInitializer.LEGACY_DROPS 负责 DROP,此处兜底保证不再重建
    this.relationDb.executeRaw(`DROP TABLE IF EXISTS "agent_mcp_usage"`);
  }
}
