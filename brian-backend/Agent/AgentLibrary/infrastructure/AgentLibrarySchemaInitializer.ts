import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  AGENT_TABLE, AGENT_EMBEDDING_TABLE, AGENT_OPT_RULE_TABLE, AGENT_LIBRARY_CONFIG_TABLE,
} from '../domain/types';

export class AgentLibrarySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    // ADR-012:agent→agent_record(id 统一承接业务键) + opt_rule 改名(幂等)
    try { this.relationDb.executeRaw(`ALTER TABLE "agent" RENAME TO "${AGENT_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    try { this.relationDb.executeRaw(`ALTER TABLE "agent_opt_rule" RENAME TO "${AGENT_OPT_RULE_TABLE}"`); } catch { /* 旧表不存在或已改名 */ }
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        title TEXT NOT NULL, brief TEXT DEFAULT '', type TEXT NOT NULL,
        strategy_id TEXT NOT NULL, soul_id TEXT NOT NULL, llm_id TEXT NOT NULL DEFAULT '',
        skill_ids_json TEXT NOT NULL DEFAULT '[]', mcp_ids_json TEXT NOT NULL DEFAULT '[]',
        prompt_template_id TEXT NOT NULL DEFAULT '',
        task_signature TEXT NOT NULL,
        eval_score INTEGER NOT NULL DEFAULT 50, enable INTEGER NOT NULL DEFAULT 1
      )`,
    );
    this.migrateLegacyAgentColumns();

    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} ADD COLUMN skill_ids_json TEXT NOT NULL DEFAULT '[]'`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} ADD COLUMN mcp_ids_json TEXT NOT NULL DEFAULT '[]'`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} ADD COLUMN prompt_template_id TEXT NOT NULL DEFAULT ''`);
    } catch {  }
    try { this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} ADD COLUMN brief TEXT DEFAULT ''`); } catch {  }

    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} ADD COLUMN created_by TEXT NOT NULL DEFAULT 'user'`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_LIBRARY_CONFIG_TABLE} ADD COLUMN match_score_threshold INTEGER NOT NULL DEFAULT 70`);
    } catch {  }

    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_created ON ${AGENT_TABLE}(created)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_updated ON ${AGENT_TABLE}(updated)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_type ON ${AGENT_TABLE}(type)`);

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_EMBEDDING_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        agent_id TEXT NOT NULL UNIQUE, model TEXT NOT NULL, dimension INTEGER NOT NULL,
        content_hash TEXT NOT NULL, content TEXT NOT NULL, embedding TEXT NOT NULL,
        trace_id TEXT NOT NULL DEFAULT ''
      )`,
    );
    this.relationDb.executeRaw(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_embedding_agent_id ON ${AGENT_EMBEDDING_TABLE}(agent_id)`);

    // 用量统计(ADR-012)统一归 TraceBase(usage_event_record + agent_usage_org),此处不再建旧统计表

    this.relationDb.executeRaw(      `CREATE TABLE IF NOT EXISTS ${AGENT_OPT_RULE_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        days INTEGER NOT NULL DEFAULT 30, min_usage_count INTEGER NOT NULL,
        min_eval_score INTEGER NOT NULL
      )`,
    );
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_opt_rule_created ON ${AGENT_OPT_RULE_TABLE}(created)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_opt_rule_days ON ${AGENT_OPT_RULE_TABLE}(days)`);

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_LIBRARY_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        prompt_template_id TEXT NOT NULL, similarity_threshold REAL NOT NULL DEFAULT 0.7,
        regen_rate INTEGER NOT NULL DEFAULT 75,
        match_score_threshold INTEGER NOT NULL DEFAULT 70,
        max_agent_count INTEGER NOT NULL DEFAULT 100,
        match_bm25_threshold INTEGER NOT NULL DEFAULT 50,
        match_vector_threshold INTEGER NOT NULL DEFAULT 50,
        match_max_tokens INTEGER NOT NULL DEFAULT 512,
        match_enable_thinking INTEGER NOT NULL DEFAULT 0
      )`,
    );
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_LIBRARY_CONFIG_TABLE} ADD COLUMN regen_rate INTEGER NOT NULL DEFAULT 75`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_LIBRARY_CONFIG_TABLE} ADD COLUMN match_bm25_threshold INTEGER NOT NULL DEFAULT 50`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_LIBRARY_CONFIG_TABLE} ADD COLUMN match_vector_threshold INTEGER NOT NULL DEFAULT 50`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_LIBRARY_CONFIG_TABLE} ADD COLUMN match_max_tokens INTEGER NOT NULL DEFAULT 512`);
    } catch {  }
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_LIBRARY_CONFIG_TABLE} ADD COLUMN match_enable_thinking INTEGER NOT NULL DEFAULT 0`);
    } catch {  }

    await this.insertDefaultConfig();
  }

  /**
   * ADR-012 存量迁移(每步幂等,列/表不存在即跳过):
   * 1) 列规范化 agent_name→title, agent_purpose→brief, agent_type→type;
   * 2) id 统一承接业务键:UPDATE id = agent_id 后 DROP agent_id;
   * 3) 去 usage_count(用量唯一归 TraceBase);
   * 4) +llm_id 并从 agent_llm 迁移后退役 agent_llm。
   */
  private migrateLegacyAgentColumns(): void {
    try { this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} RENAME COLUMN "agent_name" TO "title"`); } catch {  }
    try { this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} RENAME COLUMN "agent_purpose" TO "brief"`); } catch {  }
    try { this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} RENAME COLUMN "agent_type" TO "type"`); } catch {  }

    try {
      const cols = this.relationDb.queryRaw<{ name: string }>(`PRAGMA table_info("${AGENT_TABLE}")`, []);
      if ((cols ?? []).some((c) => c.name === 'agent_id')) {
        // 业务键升格为主键 id(历史 agent_id 值唯一,外部引用自动对齐)
        this.relationDb.executeRaw(`UPDATE "${AGENT_TABLE}" SET "id" = "agent_id" WHERE "id" != "agent_id"`);
        this.relationDb.executeRaw(`DROP INDEX IF EXISTS "idx_agent_type"`);
        // UNIQUE NOT NULL 列无法 DROP——整表重建去掉 agent_id
        this.relationDb.rebuildTableWithoutColumn(AGENT_TABLE, 'agent_id');
      }
    } catch {  }

    try { this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} DROP COLUMN "usage_count"`); } catch {  }

    try {
      const cols = this.relationDb.queryRaw<{ name: string }>(`PRAGMA table_info("${AGENT_TABLE}")`, []);
      if (!(cols ?? []).some((c) => c.name === 'llm_id')) {
        this.relationDb.executeRaw(`ALTER TABLE "${AGENT_TABLE}" ADD COLUMN "llm_id" TEXT NOT NULL DEFAULT ''`);
      }
      this.relationDb.executeRaw(`
        UPDATE "${AGENT_TABLE}" SET "llm_id" = (
          SELECT "llm_id" FROM "agent_llm" WHERE "agent_llm"."agent_id" = "${AGENT_TABLE}"."id" LIMIT 1
        )
        WHERE COALESCE("llm_id", '') = '' AND EXISTS (SELECT 1 FROM "agent_llm" WHERE "agent_llm"."agent_id" = "${AGENT_TABLE}"."id")
      `);
      this.relationDb.executeRaw(`DROP TABLE IF EXISTS "agent_llm"`);
    } catch {  }

    // 存量库 llm_id 可能是 NOT NULL 无 DEFAULT(旧版结构):INSERT 省略该列时约束失败。
    // SQLite 无法原地修改列定义——备份原值后整表重建,再以 DEFAULT '' 补回。
    try {
      const col = (this.relationDb.queryRaw<{ name: string; notnull: number; dflt_value: string | null }>(`PRAGMA table_info("${AGENT_TABLE}")`, []) ?? [])
        .find((c) => c.name === 'llm_id');
      if (col && col.notnull === 1 && col.dflt_value === null) {
        this.relationDb.executeRaw(`CREATE TABLE "${AGENT_TABLE}__llm_bak" AS SELECT "id", "llm_id" FROM "${AGENT_TABLE}"`);
        if (this.relationDb.rebuildTableWithoutColumn(AGENT_TABLE, 'llm_id')) {
          this.relationDb.executeRaw(`ALTER TABLE "${AGENT_TABLE}" ADD COLUMN "llm_id" TEXT NOT NULL DEFAULT ''`);
          this.relationDb.executeRaw(`
            UPDATE "${AGENT_TABLE}" SET "llm_id" = (
              SELECT "llm_id" FROM "${AGENT_TABLE}__llm_bak" WHERE "${AGENT_TABLE}__llm_bak"."id" = "${AGENT_TABLE}"."id"
            )
            WHERE EXISTS (SELECT 1 FROM "${AGENT_TABLE}__llm_bak" WHERE "${AGENT_TABLE}__llm_bak"."id" = "${AGENT_TABLE}"."id")
          `);
        }
        this.relationDb.executeRaw(`DROP TABLE IF EXISTS "${AGENT_TABLE}__llm_bak"`);
      }
    } catch { /* 已合规或重建失败(保留旧表,写入方以显式值兜底) */ }
  }

  private async insertDefaultConfig(): Promise<void> {
    const count = await this.relationDb.count(AGENT_LIBRARY_CONFIG_TABLE);
    if (count > 0) return;
    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_LIBRARY_CONFIG_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'prompt_template_id', value: '' },
      { field: 'similarity_threshold', value: 0.7 },
      { field: 'regen_rate', value: 75 },
      { field: 'max_agent_count', value: 100 },
    ]);
  }
}
