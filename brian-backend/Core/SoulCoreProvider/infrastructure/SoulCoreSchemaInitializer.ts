import type { RelationDBAccess } from '@brian-agent/base';
import {
  SOUL_CORE_CONFIG_TABLE,
  SOUL_OPT_RULE_TABLE,
} from '../domain/types';

export class SoulCoreSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    // ADR-012:老化规则表改名(幂等)
    try { this.relationDb.executeRaw(`ALTER TABLE "soul_opt_rule" RENAME TO "${SOUL_OPT_RULE_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }

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
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SOUL_CORE_CONFIG_TABLE}" ADD COLUMN "similarity_threshold" REAL NOT NULL DEFAULT 0.7`);
    } catch { /* 列已存在 */ }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SOUL_OPT_RULE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "days"            INTEGER NOT NULL,
        "min_usage_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    // ADR-012:soul_core_usage 已退役,用量统一入 TraceBase(usage_event_record / soul_usage_org)
  }
}
