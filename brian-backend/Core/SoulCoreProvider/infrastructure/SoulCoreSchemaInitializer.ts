import type { RelationDBAccess } from '@brian-agent/base';
import {
  SOUL_CORE_CONFIG_TABLE,
  SOUL_OPT_RULE_TABLE,
  SOUL_CORE_USAGE_TABLE,
} from '../domain/types';

export class SoulCoreSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_CORE_CONFIG_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "regen_rate"          INTEGER NOT NULL DEFAULT 75,
        "similarity_threshold" REAL   NOT NULL DEFAULT 0.7,
        "prompt_template_id"  TEXT,
        "llm_id"              TEXT,
        "score_threshold"     INTEGER NOT NULL DEFAULT 90,
        "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8
      )
    `);

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SOUL_CORE_CONFIG_TABLE}" ADD COLUMN "match_cache_ttl_ms" INTEGER NOT NULL DEFAULT 600000`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SOUL_CORE_CONFIG_TABLE}" ADD COLUMN "match_cache_capacity" INTEGER NOT NULL DEFAULT 500`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SOUL_CORE_CONFIG_TABLE}" ADD COLUMN "llm_id" TEXT`);
    } catch {

    }

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SOUL_CORE_CONFIG_TABLE}" ADD COLUMN "score_threshold" INTEGER NOT NULL DEFAULT 90`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SOUL_CORE_CONFIG_TABLE}" ADD COLUMN "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8`);
    } catch {

    }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_OPT_RULE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "days"            INTEGER NOT NULL,
        "min_usage_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_CORE_USAGE_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "agent_id"    TEXT    NOT NULL,
        "soul_id"     TEXT    NOT NULL,
        "usage_date"  TEXT    NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.migrateLegacyUsageTable();
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SOUL_CORE_USAGE_TABLE}_agent_soul" ON "${SOUL_CORE_USAGE_TABLE}" ("agent_id", "soul_id")`,
    );
  }

  private migrateLegacyUsageTable(): void {
    const cols = this.relationDb.queryRaw<{ name: string }>(
      `PRAGMA table_info("${SOUL_CORE_USAGE_TABLE}")`, [],
    );
    if ((cols ?? []).some((c) => c.name === 'agent_soul_id')) {
      this.relationDb.executeRaw(`DROP TABLE "${SOUL_CORE_USAGE_TABLE}"`);
      this.relationDb.executeRaw(`
        CREATE TABLE "${SOUL_CORE_USAGE_TABLE}" (
          "id"          TEXT    NOT NULL PRIMARY KEY,
          "created"     INTEGER NOT NULL,
          "updated"     INTEGER NOT NULL,
          "agent_id"    TEXT    NOT NULL,
          "soul_id"     TEXT    NOT NULL,
          "usage_date"  TEXT    NOT NULL,
          "usage_count" INTEGER NOT NULL DEFAULT 1
        )
      `);
    }
  }
}
