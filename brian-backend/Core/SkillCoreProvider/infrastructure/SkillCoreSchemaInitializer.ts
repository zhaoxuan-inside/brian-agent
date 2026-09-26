import type { RelationDBAccess } from '@brian-agent/base';
import {
  SKILL_CORE_CONFIG_TABLE,
    SKILL_OPT_RULE_TABLE,
  SKILL_USAGE_TABLE,
} from '../domain/types';

export class SkillCoreSchemaInitializer {

  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_CORE_CONFIG_TABLE}" (
        "id"                  TEXT    NOT NULL PRIMARY KEY,
        "created"             INTEGER NOT NULL,
        "updated"             INTEGER NOT NULL,
        "regen_rate"          INTEGER NOT NULL DEFAULT 75,
        "similarity_threshold" REAL   NOT NULL DEFAULT 0.7,
        "prompt_template_id"  TEXT,
        "score_threshold"     INTEGER NOT NULL DEFAULT 90,
        "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8
      )
    `);

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "match_cache_ttl_ms" INTEGER NOT NULL DEFAULT 600000`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "match_cache_capacity" INTEGER NOT NULL DEFAULT 500`);
    } catch {  }

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "score_threshold" INTEGER NOT NULL DEFAULT 90`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "vector_similarity_threshold" REAL NOT NULL DEFAULT 0.8`);
    } catch {  }

    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "github_token" TEXT NOT NULL DEFAULT ''`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "github_search_enabled" INTEGER NOT NULL DEFAULT 1`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${SKILL_CORE_CONFIG_TABLE}" ADD COLUMN "auto_generate_enabled" INTEGER NOT NULL DEFAULT 1`);
    } catch {  }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_OPT_RULE_TABLE}" (
        "id"              TEXT    NOT NULL PRIMARY KEY,
        "created"         INTEGER NOT NULL,
        "updated"         INTEGER NOT NULL,
        "days"            INTEGER NOT NULL,
        "min_usage_count" INTEGER NOT NULL
      )
    `);

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${SKILL_USAGE_TABLE}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "agent_id"    TEXT    NOT NULL,
        "skill_id"    TEXT    NOT NULL,
        "usage_date"  TEXT    NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 1
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${SKILL_USAGE_TABLE}_agent_skill" ON "${SKILL_USAGE_TABLE}" ("agent_id", "skill_id")`,
    );
  }
}
