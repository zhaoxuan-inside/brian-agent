import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  AGENT_TABLE, AGENT_USAGE_TABLE, AGENT_USAGE_DAILY_TABLE, AGENT_OPT_RULE_TABLE, AGENT_LIBRARY_CONFIG_TABLE,
} from '../domain/types';

export class AgentLibrarySchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        agent_id TEXT NOT NULL UNIQUE, agent_name TEXT NOT NULL, agent_purpose TEXT DEFAULT '', agent_type TEXT NOT NULL,
        strategy_id TEXT NOT NULL, soul_id TEXT NOT NULL,
        skill_ids_json TEXT NOT NULL DEFAULT '[]', mcp_ids_json TEXT NOT NULL DEFAULT '[]',
        prompt_template_id TEXT NOT NULL DEFAULT '',
        task_signature TEXT NOT NULL, usage_count INTEGER NOT NULL DEFAULT 0,
        eval_score INTEGER NOT NULL DEFAULT 50, enable INTEGER NOT NULL DEFAULT 1
      )`,
    );
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} ADD COLUMN agent_purpose TEXT DEFAULT ''`);
    } catch { /* column already exists */ }
    // 绑定唯一事实源列（2026-09-05：Agent↔Soul/Skill/MCP/Prompt 绑定从 Core agent_* 表收敛至 agent 表）
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} ADD COLUMN skill_ids_json TEXT NOT NULL DEFAULT '[]'`);
    } catch { /* column already exists */ }
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} ADD COLUMN mcp_ids_json TEXT NOT NULL DEFAULT '[]'`);
    } catch { /* column already exists */ }
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} ADD COLUMN prompt_template_id TEXT NOT NULL DEFAULT ''`);
    } catch { /* column already exists */ }
    // LLM 绑定只保留在 LLMProvider 的 agent_llm，agent 表不再存储 llm_id（旧库删除遗留列）
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_TABLE} DROP COLUMN llm_id`);
    } catch { /* column 不存在或 SQLite 版本不支持 DROP COLUMN */ }
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_created ON ${AGENT_TABLE}(created)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_updated ON ${AGENT_TABLE}(updated)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_type ON ${AGENT_TABLE}(agent_type)`);

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_USAGE_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        agent_id TEXT NOT NULL, work_id TEXT NOT NULL, interact_id TEXT NOT NULL,
        usage_context TEXT
      )`,
    );
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_usage_created ON ${AGENT_USAGE_TABLE}(created)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_usage_agent ON ${AGENT_USAGE_TABLE}(agent_id)`);

    // 按日统计表：agent_id + usage_date(YYYY-MM-DD) 粒度，供老化按日期窗口统计
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_USAGE_DAILY_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        agent_id TEXT NOT NULL, usage_date TEXT NOT NULL, usage_count INTEGER NOT NULL DEFAULT 0,
        UNIQUE(agent_id, usage_date)
      )`,
    );
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_usage_daily_date ON ${AGENT_USAGE_DAILY_TABLE}(usage_date)`);
    this.relationDb.executeRaw(`CREATE INDEX IF NOT EXISTS idx_agent_usage_daily_agent ON ${AGENT_USAGE_DAILY_TABLE}(agent_id)`);
    await this.backfillDailyUsage();

    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${AGENT_OPT_RULE_TABLE} (
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
        max_agent_count INTEGER NOT NULL DEFAULT 100
      )`,
    );
    try {
      this.relationDb.executeRaw(`ALTER TABLE ${AGENT_LIBRARY_CONFIG_TABLE} ADD COLUMN regen_rate INTEGER NOT NULL DEFAULT 75`);
    } catch { /* column already exists */ }

    await this.insertDefaultConfig();
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

  /**
   * 从 agent_usage 明细表按 (agent_id, 本地日期) 聚合回填 agent_usage_daily。
   * 幂等：仅当按日统计表为空时执行一次（recordAgentUsage 会持续维护该表）。
   */
  private async backfillDailyUsage(): Promise<void> {
    const dailyCount = await this.relationDb.count(AGENT_USAGE_DAILY_TABLE);
    if (dailyCount > 0) return;

    const rows = this.relationDb.queryRaw<{ agent_id: string; created: number; updated: number }>(
      `SELECT "agent_id", "created", "updated" FROM ${AGENT_USAGE_TABLE}`, [],
    );
    const map = new Map<string, { agent_id: string; usage_date: string; created: number; updated: number; count: number }>();
    for (const r of rows) {
      const usageDate = IdGenerator.dateOf(Number(r.created));
      const key = `${r.agent_id}|${usageDate}`;
      const cur = map.get(key);
      if (cur) {
        cur.count += 1;
        cur.updated = Math.max(cur.updated, Number(r.updated));
      } else {
        map.set(key, {
          agent_id: r.agent_id,
          usage_date: usageDate,
          created: Number(r.created),
          updated: Number(r.updated),
          count: 1,
        });
      }
    }
    for (const v of map.values()) {
      await this.relationDb.insert(AGENT_USAGE_DAILY_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: v.created },
        { field: 'updated', value: v.updated },
        { field: 'agent_id', value: v.agent_id },
        { field: 'usage_date', value: v.usage_date },
        { field: 'usage_count', value: v.count },
      ]);
    }
  }
}
