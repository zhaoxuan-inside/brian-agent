/**
 * 一次性配置迁移脚本：将 trusted_tools 中的旧 Tool ID 迁移为新系统内置 Skill ID。
 * （2026-09-24 Tool 概念退役，完全由 Skill 承接）。
 *
 * 映射关系：
 *   exec        -> skill_builtin-exec
 *   cdt_browser -> skill_builtin-browser
 *   update_plan -> skill_builtin-plan
 *   delegate    -> skill_builtin-delegate
 *   ask_user    -> skill_builtin-ask-user
 *
 * 用法：node scripts/migrate-system-skills.mjs
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', 'data', 'brian.db');

const MAPPING = {
  exec: 'skill_builtin-exec',
  cdt_browser: 'skill_builtin-browser',
  update_plan: 'skill_builtin-plan',
  delegate: 'skill_builtin-delegate',
  ask_user: 'skill_builtin-ask-user',
};

const db = new Database(dbPath, { timeout: 10_000 });
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');

const row = db.prepare(
  `SELECT config_value FROM runtime_runs_config WHERE config_key = 'trusted_tools'`,
).get();

if (!row) {
  console.log('[skip] 未找到 trusted_tools 配置项');
  db.close();
  process.exit(0);
}

try {
  const current = JSON.parse(String(row.config_value || '[]'));
  const next = [...new Set(current.map((id) => MAPPING[id] || id))];
  const nextJson = JSON.stringify(next);

  if (nextJson !== row.config_value) {
    db.prepare(
      `UPDATE runtime_runs_config SET config_value = ?, updated = ? WHERE config_key = 'trusted_tools'`,
    ).run(nextJson, Date.now());
    console.log(`[migrated] trusted_tools 更新为:`, nextJson);
  } else {
    console.log(`[skip] trusted_tools 已是最新格式:`, nextJson);
  }
} catch (err) {
  console.error('[error] 解析 trusted_tools 失败:', err);
}

db.pragma('wal_checkpoint(FULL)');
db.close();
