import type { RelationDBAccess } from '../../RelationDBProvider';
import {
  USAGE_EVENT_TABLE,
  AGENT_USAGE_ORG_TABLE,
  SOUL_USAGE_ORG_TABLE,
  SKILL_USAGE_ORG_TABLE,
  MCP_USAGE_ORG_TABLE,
  PROMPT_USAGE_ORG_TABLE,
  LLM_USAGE_ORG_TABLE,
  LLM_PROVIDER_USAGE_ORG_TABLE,
} from '../domain/types';
import { IdGenerator } from '../../ToolProvider/IdGenerator';

/** 旧散落统计表 → TraceBase 统一 org 表(仅改名,数据保留) */
const LEGACY_RENAMES: Array<[string, string]> = [
  ['agent_usage_daily', AGENT_USAGE_ORG_TABLE],
  ['llm_usage', LLM_USAGE_ORG_TABLE],
  ['mcp_usage', MCP_USAGE_ORG_TABLE],
  ['skill_usage', SKILL_USAGE_ORG_TABLE],
  ['soul_usage', SOUL_USAGE_ORG_TABLE],
  ['prompt_template_usage', PROMPT_USAGE_ORG_TABLE],
];

/** 直接退役的旧统计表(语义已并入 usage_event_record / 日聚合);llm_core_usage 见 migrateLegacyLlmCoreUsage(迁完再删) */
const LEGACY_DROPS = [
  'agent_usage',
  'soul_core_usage',
  'skill_core_usage',
  'agent_mcp_usage',
];

export class TraceSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  init(): void {
    for (const [oldName, newName] of LEGACY_RENAMES) {
      try {
        this.relationDb.executeRaw(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
      } catch {
        /* 旧表不存在(全新库)或已改名,忽略 */
      }
    }

    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${USAGE_EVENT_TABLE}" (
        "id"           TEXT    NOT NULL PRIMARY KEY,
        "created"      INTEGER NOT NULL,
        "updated"      INTEGER NOT NULL,
        "trace_id"     TEXT    NOT NULL DEFAULT '',
        "entity_type"  TEXT    NOT NULL,
        "entity_id"    TEXT    NOT NULL,
        "agent_id"     TEXT    NOT NULL DEFAULT '',
        "work_id"      TEXT    NOT NULL DEFAULT '',
        "run_id"       TEXT    NOT NULL DEFAULT '',
        "session_id"   TEXT    NOT NULL DEFAULT '',
        "usage_context" TEXT   NOT NULL DEFAULT '',
        "input_tokens" INTEGER NOT NULL DEFAULT 0,
        "output_tokens" INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${USAGE_EVENT_TABLE}_entity" ON "${USAGE_EVENT_TABLE}" ("entity_type", "entity_id")`,
    );
    this.relationDb.executeRaw(
      `CREATE INDEX IF NOT EXISTS "idx_${USAGE_EVENT_TABLE}_created" ON "${USAGE_EVENT_TABLE}" ("created")`,
    );

    this.ensureUsageOrg(AGENT_USAGE_ORG_TABLE, 'agent_id');
    this.ensureUsageOrg(SOUL_USAGE_ORG_TABLE, 'soul_id');
    this.ensureUsageOrg(SKILL_USAGE_ORG_TABLE, 'skill_id');
    this.ensureUsageOrg(MCP_USAGE_ORG_TABLE, 'mcp_install_id');
    this.ensureUsageOrg(PROMPT_USAGE_ORG_TABLE, 'prompt_template_id');
    this.ensureLlmUsageOrg();
    this.ensureUsageOrg(LLM_PROVIDER_USAGE_ORG_TABLE, 'llm_provider_id');

    this.migrateLegacyAgentUsageEvents();
    this.migrateLegacyLlmCoreUsage();

    for (const legacy of LEGACY_DROPS) {
      try {
        this.relationDb.executeRaw(`DROP TABLE IF EXISTS "${legacy}"`);
      } catch {
        /* 容忍:不存在即跳过 */
      }
    }
  }

  /** 日聚合表:公共列 + 实体列 + usage_date + 计数;ON CONFLICT 依赖 (实体, usage_date) 唯一索引 */
  private ensureUsageOrg(table: string, idColumn: string): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${table}" (
        "id"          TEXT    NOT NULL PRIMARY KEY,
        "created"     INTEGER NOT NULL,
        "updated"     INTEGER NOT NULL,
        "trace_id"    TEXT    NOT NULL DEFAULT '',
        "${idColumn}" TEXT    NOT NULL,
        "usage_date"  TEXT    NOT NULL,
        "usage_count" INTEGER NOT NULL DEFAULT 0
      )
    `);
    try {
      this.relationDb.executeRaw(`ALTER TABLE "${table}" ADD COLUMN "trace_id" TEXT NOT NULL DEFAULT ''`);
    } catch { /* 列已存在 */ }
    this.ensureUniqueUsageIndex(table, [idColumn, 'usage_date']);
  }

  private ensureLlmUsageOrg(): void {
    this.relationDb.executeRaw(`
      CREATE TABLE IF NOT EXISTS "${LLM_USAGE_ORG_TABLE}" (
        "id"               TEXT    NOT NULL PRIMARY KEY,
        "created"          INTEGER NOT NULL,
        "updated"          INTEGER NOT NULL,
        "trace_id"         TEXT    NOT NULL DEFAULT '',
        "llm_available_id" TEXT    NOT NULL,
        "usage_date"       TEXT    NOT NULL,
        "usage_count"      INTEGER NOT NULL DEFAULT 0,
        "input_tokens"     INTEGER NOT NULL DEFAULT 0,
        "output_tokens"    INTEGER NOT NULL DEFAULT 0
      )
    `);
    this.ensureUniqueUsageIndex(LLM_USAGE_ORG_TABLE, ['llm_available_id', 'usage_date']);
  }

  /** llm_core_usage(配额流)迁入 usage_event_record 后退役;迁移失败则中止 DROP 保数据 */
  private migrateLegacyLlmCoreUsage(): void {
    let rows: Array<Record<string, unknown>> = [];
    try {
      rows = this.relationDb.queryRaw(
        'SELECT "created", "timestamp", "llm_provider_id", "tokens_used", "call_count" FROM "llm_core_usage"',
        [],
      ) ?? [];
    } catch {
      return;
    }
    for (const row of rows) {
      const created = Number(row.created ?? row.timestamp ?? IdGenerator.now());
      const providerId = String(row.llm_provider_id ?? '');
      if (!providerId) continue;
      const total = Number(row.tokens_used ?? 0);
      const calls = Math.max(1, Number(row.call_count ?? 1));
      const base = Math.floor(total / calls);
      for (let i = 0; i < calls; i++) {
        const tokens = i === 0 ? total - base * (calls - 1) : base;
        try {
          this.relationDb.executeRaw(
            `INSERT INTO "${USAGE_EVENT_TABLE}"
             ("id","created","updated","trace_id","entity_type","entity_id","agent_id","work_id","run_id","session_id","usage_context","input_tokens","output_tokens")
             VALUES (?, ?, ?, '', 'llm_provider', ?, '', '', '', '', 'llm_core.migrated', ?, 0)`,
            [IdGenerator.generate(), created, created, providerId, tokens],
          );
        } catch {
          return;
        }
      }
    }
    try {
      this.relationDb.executeRaw('DROP TABLE IF EXISTS "llm_core_usage"');
    } catch { /* 容忍 */ }
  }

  /** 唯一索引创建失败(历史重复行)时先按业务键去重保留最新行再重试 */
  private ensureUniqueUsageIndex(table: string, columns: string[]): void {
    const idxName = `uq_${table}_${columns.join('_')}`;
    const colList = columns.map((c) => `"${c}"`).join(', ');
    try {
      this.relationDb.executeRaw(`CREATE UNIQUE INDEX IF NOT EXISTS "${idxName}" ON "${table}" (${colList})`);
    } catch {
      this.relationDb.executeRaw(
        `DELETE FROM "${table}" WHERE "id" NOT IN (SELECT MAX("id") FROM "${table}" GROUP BY ${colList})`,
      );
      this.relationDb.executeRaw(`CREATE UNIQUE INDEX IF NOT EXISTS "${idxName}" ON "${table}" (${colList})`);
    }
  }

  /** 历史 agent_usage 事件迁移进 usage_event_record(幂等:源表存在才执行) */
  private migrateLegacyAgentUsageEvents(): void {
    try {
      this.relationDb.executeRaw(`
        INSERT INTO "${USAGE_EVENT_TABLE}"
          ("id", "created", "updated", "trace_id", "entity_type", "entity_id", "agent_id", "work_id", "run_id", "session_id", "usage_context", "input_tokens", "output_tokens")
        SELECT "id", "created", "updated", '', 'agent', "agent_id", "agent_id", "work_id", "run_id", '', COALESCE("usage_context", ''), 0, 0
        FROM "agent_usage"
      `);
    } catch {
      /* 源表不存在(已迁移或全新库),忽略 */
    }
  }
}
