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
        "prompt_template_id"   TEXT
      )
    `);

    // agent_mcp 绑定表停止创建（绑定唯一事实源为 Agent 模块 agent 表 mcp_ids_json；旧库残留表不再读写）

    // agent_mcp_usage 表（评估依据；键为 (agent_id, mcp_id)，与绑定解耦。
    // 旧键 agent_mcp_id 引用已废弃的绑定表，检测到旧结构时重建，usage 历史重置）
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

  /** 旧结构（agent_mcp_id 键）检测 → 重建为新结构 */
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
