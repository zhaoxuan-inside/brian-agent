import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  USER_PROFILE_DIRECTION_TABLE,
  USER_PROFILE_RECORD_TABLE,
  USER_PROFILE_DIM_TABLE,
  USER_PROFILE_DIM_EVIDENCE_TABLE,
  USER_PROFILE_CONFIG_TABLE,
} from '../domain/types';

export class UserProfileSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.migrateLegacyTableNames();
    this.createTables();
    this.ensurePublicTraceId();
    this.migrateDirectionBusinessKey();
    await this.migrateDimensionEvidenceSplit();
    await this.seedDefaultConfig();
    await this.seedBuiltinDirections();
  }

  /** ADR-012: 旧表名集中改名（幂等，仅改名不补列，补列由 ensurePublicTraceId 统一处理） */
  private migrateLegacyTableNames(): void {
    try {
      this.relationDb.executeRaw(`ALTER TABLE "user_profile_dimension_data" RENAME TO "${USER_PROFILE_DIM_TABLE}"`);
    } catch { /* 旧表不存在或已改名 */ }
    try {
      this.relationDb.executeRaw(`ALTER TABLE "user_profile_dimension_data_record" RENAME TO "${USER_PROFILE_DIM_TABLE}"`);
    } catch { /* 中间态表名不存在或已改名 */ }
  }

  private createTables(): void {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${USER_PROFILE_DIRECTION_TABLE} (
        id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        trace_id TEXT NOT NULL DEFAULT '',
        direction_name TEXT NOT NULL,
        direction_description TEXT,
        weight INTEGER NOT NULL DEFAULT 0,
        enable INTEGER NOT NULL DEFAULT 1,
        prompt_template_id TEXT NOT NULL DEFAULT '',
        llm_temperature REAL NOT NULL DEFAULT 0.3,
        llm_max_tokens INTEGER NOT NULL DEFAULT 512,
        llm_id TEXT NOT NULL DEFAULT ''
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${USER_PROFILE_RECORD_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        trace_id TEXT NOT NULL DEFAULT '',
        session_id TEXT,
        version INTEGER NOT NULL,
        profile_summary TEXT,
        generated_at INTEGER NOT NULL,
        change_summary TEXT
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${USER_PROFILE_DIM_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        trace_id TEXT NOT NULL DEFAULT '',
        profile_record_id TEXT NOT NULL,
        direction_id TEXT NOT NULL,
        dimension_value TEXT,
        confidence REAL NOT NULL DEFAULT 0.0
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${USER_PROFILE_DIM_EVIDENCE_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        trace_id TEXT NOT NULL DEFAULT '',
        dim_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT '',
        evidence_json TEXT NOT NULL
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${USER_PROFILE_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        trace_id TEXT NOT NULL DEFAULT '',
        auto_generate_interval_ms INTEGER NOT NULL DEFAULT 86400000,
        profile_analysis_prompt_template_id TEXT NOT NULL DEFAULT '',
        max_conversation_sample_count INTEGER NOT NULL DEFAULT 500,
        profile_retention_versions INTEGER NOT NULL DEFAULT 20,
        min_confidence_threshold REAL NOT NULL DEFAULT 0.5
      )`,
    );
  }

  /** ADR-012 公共字段：存量表补齐 trace_id（建表已含，此处仅补历史库） */
  private ensurePublicTraceId(): void {
    const tables = [
      USER_PROFILE_DIRECTION_TABLE, USER_PROFILE_RECORD_TABLE,
      USER_PROFILE_DIM_TABLE, USER_PROFILE_DIM_EVIDENCE_TABLE, USER_PROFILE_CONFIG_TABLE,
    ];
    for (const table of tables) {
      this.addColumnIfMissing(table, 'trace_id', 'TEXT NOT NULL DEFAULT \'\'');
    }
  }

  /**
   * ADR-012：direction 去 direction_key 业务键，id 统一承接（幂等）。
   * direction_key 为 UNIQUE 列无法 DROP COLUMN，采用整表重建。
   */
  private migrateDirectionBusinessKey(): void {
    const cols = this.columnsOf(USER_PROFILE_DIRECTION_TABLE);
    if (!cols.includes('direction_key')) return;

    const targetCols = [
      'id', 'created', 'updated', 'trace_id', 'direction_name', 'direction_description',
      'weight', 'enable', 'prompt_template_id', 'llm_temperature', 'llm_max_tokens', 'llm_id',
    ];
    const present = targetCols.filter((c) => c === 'id' || cols.includes(c));
    const valueExprs = present.map((c) => (c === 'id' ? '"direction_key"' : `"${c}"`));
    const tmpTable = `${USER_PROFILE_DIRECTION_TABLE}_migrate`;

    this.relationDb.executeRaw(`DROP TABLE IF EXISTS "${tmpTable}"`);
    this.relationDb.executeRaw(
      `CREATE TABLE "${tmpTable}" (
        id TEXT PRIMARY KEY NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        trace_id TEXT NOT NULL DEFAULT '',
        direction_name TEXT NOT NULL,
        direction_description TEXT,
        weight INTEGER NOT NULL DEFAULT 0,
        enable INTEGER NOT NULL DEFAULT 1,
        prompt_template_id TEXT NOT NULL DEFAULT '',
        llm_temperature REAL NOT NULL DEFAULT 0.3,
        llm_max_tokens INTEGER NOT NULL DEFAULT 512,
        llm_id TEXT NOT NULL DEFAULT ''
      )`,
    );
    this.relationDb.executeRaw(
      `INSERT INTO "${tmpTable}" (${present.map((c) => `"${c}"`).join(', ')})
       SELECT ${valueExprs.join(', ')} FROM "${USER_PROFILE_DIRECTION_TABLE}"`,
    );
    this.relationDb.executeRaw(`DROP TABLE "${USER_PROFILE_DIRECTION_TABLE}"`);
    this.relationDb.executeRaw(`ALTER TABLE "${tmpTable}" RENAME TO "${USER_PROFILE_DIRECTION_TABLE}"`);
  }

  /**
   * ADR-012：dimension_data 拆分为 dim_record（维度行）+ dim_evidence_record（依据行），
   * direction_key 列改为 direction_id 引用 direction 表 id，evidence JSON 数组拆为逐条依据行（幂等）。
   */
  private async migrateDimensionEvidenceSplit(): Promise<void> {
    const cols = this.columnsOf(USER_PROFILE_DIM_TABLE);
    if (cols.includes('direction_key')) {
      try {
        this.relationDb.executeRaw(`ALTER TABLE "${USER_PROFILE_DIM_TABLE}" RENAME COLUMN "direction_key" TO "direction_id"`);
      } catch { /* 列不存在或已改名 */ }
    }

    const colsAfter = this.columnsOf(USER_PROFILE_DIM_TABLE);
    if (!colsAfter.includes('evidence')) return;

    const rows = this.relationDb.queryRaw<{ id: string; evidence: string; created: number }>(
      `SELECT "id", "evidence", "created" FROM "${USER_PROFILE_DIM_TABLE}"`,
      [],
    );
    for (const row of rows ?? []) {
      let items: unknown[] = [];
      try {
        const parsed = JSON.parse(String(row.evidence ?? '[]'));
        items = Array.isArray(parsed) ? parsed : [parsed];
      } catch { items = []; }
      const now = Number(row.created ?? IdGenerator.now());
      for (const item of items) {
        const obj = item !== null && typeof item === 'object' ? item as Record<string, unknown> : null;
        await this.relationDb.insert(USER_PROFILE_DIM_EVIDENCE_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'dim_id', value: String(row.id) },
          { field: 'source', value: obj ? String(obj.source ?? '') : '' },
          { field: 'evidence_json', value: JSON.stringify(item) },
        ]);
      }
    }
    this.relationDb.executeRaw(`ALTER TABLE "${USER_PROFILE_DIM_TABLE}" DROP COLUMN "evidence"`);
  }

  private async seedDefaultConfig(): Promise<void> {
    const configCount = await this.relationDb.count(USER_PROFILE_CONFIG_TABLE);
    if (configCount === 0) {
      const now = IdGenerator.now();
      await this.relationDb.insert(USER_PROFILE_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'auto_generate_interval_ms', value: 86400000 },
        { field: 'profile_analysis_prompt_template_id', value: '' },
        { field: 'max_conversation_sample_count', value: 500 },
        { field: 'profile_retention_versions', value: 20 },
        { field: 'min_confidence_threshold', value: 0.5 },
      ]);
    }
  }

  private async seedBuiltinDirections(): Promise<void> {
    const dirCount = await this.relationDb.count(USER_PROFILE_DIRECTION_TABLE);
    if (dirCount === 0) {
      const now = IdGenerator.now();
      const builtinDirections = [
        { key: 'language_preference', name: '语言偏好', description: '用户的语言偏好', weight: 20, enable: 1 },
        { key: 'reply_style', name: '回复风格', description: '用户偏好的回复风格', weight: 25, enable: 1 },
        { key: 'knowledge_interest', name: '知识兴趣', description: '用户的知识领域兴趣', weight: 30, enable: 1 },
        { key: 'interaction_habit', name: '交互习惯', description: '用户的交互行为习惯', weight: 15, enable: 1 },
        { key: 'feedback_sensitivity', name: '反馈敏感度', description: '用户对评估反馈的敏感度', weight: 10, enable: 1 },
      ];
      for (const d of builtinDirections) {
        await this.relationDb.insert(USER_PROFILE_DIRECTION_TABLE, [
          { field: 'id', value: d.key },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'direction_name', value: d.name },
          { field: 'direction_description', value: d.description },
          { field: 'weight', value: d.weight },
          { field: 'enable', value: d.enable },
        ]);
      }
    }
  }

  private columnsOf(table: string): string[] {
    try {
      const cols = this.relationDb.queryRaw<{ name: string }>(`PRAGMA table_info("${table}")`, []);
      return (cols ?? []).map((c) => c.name);
    } catch {
      return [];
    }
  }

  private addColumnIfMissing(table: string, column: string, ddl: string): void {
    if (!this.columnsOf(table).includes(column)) {
      try {
        this.relationDb.executeRaw(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${ddl}`);
      } catch { /* 并发或已存在 */ }
    }
  }
}
