/**
 * @fileoverview 系统数据（通用数据）导出器：从构建机数据库抽取"应随包分发"
 * 的目录类数据，生成 system-seed.json，打包后由后端在首次运行时导入。
 *
 * 分类原则（个人数据 / 系统数据严格区分）：
 *   - 系统数据（SYSTEM，随包分发）：
 *     · llm_provider  模型提供商目录 —— 剔除指向本机(127.0.0.1/localhost)的行，
 *       api_key 字段一律置空（API Key 属个人数据）；
 *     · mcp_provider  MCP 提供商目录 —— 全量（纯目录，无敏感字段）。
 *   - 个人数据（PERSONAL，不打包）：
 *     api_key、llm_available（个人选配的模型）、mcp_install（个人安装的实例）、
 *     会话/消息/记忆/向量库/图谱/画像/Agent/Skill 实体、各类 usage 与 trace、日志。
 *
 * 用法:
 *   node packaging/export-system-data.mjs [--db <sqlite路径>] [--out <json路径>]
 * 默认 --db brian-backend/data/brian.db --out dist-pack/system-seed.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const DB_PATH = argValue('--db', path.join(ROOT, 'brian-backend', 'data', 'brian.db'));
const OUT_PATH = argValue('--out', path.join(ROOT, 'dist-pack', 'system-seed.json'));

/** 本机地址（个人环境专属，不入目录） */
const LOCAL_HOST_RE = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])/i;

/** 敏感字段清洗表：无论行级规则如何，命中的字段一律置空
 *  注：API Key 存于 llm_provider_key_record（个人数据），不在 SYSTEM_TABLES 内，天然不导出 */
const SANITIZE_FIELDS = {};

/** 行级过滤规则：返回 false 剔除该行 */
const ROW_FILTERS = {
  llm_provider_record: (row) => !LOCAL_HOST_RE.test(String(row.llm_provider_url || '')),
};

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`[seed-export] 构建机数据库不存在: ${DB_PATH}`);
    console.error('[seed-export] 跳过系统数据导出（包内将不含 system-seed.json，属正常的新装语义）');
    process.exit(2);
  }

  const db = new Database(DB_PATH, { readonly: true });

  // 分类表清单：维护在此处即可扩展（ADR-012 命名：*_record）
  // 注意：llm_provider_key_record（API Key）属个人数据，绝不加入此清单
  const SYSTEM_TABLES = ['llm_provider_record', 'mcp_provider_record'];

  const tables = [];
  for (const table of SYSTEM_TABLES) {
    let rows;
    try {
      rows = db.prepare(`SELECT * FROM ${table}`).all();
    } catch (e) {
      console.warn(`[seed-export] ⚠ 表 ${table} 读取失败（${e.message}），跳过`);
      continue;
    }

    const before = rows.length;
    const sanitize = SANITIZE_FIELDS[table] || [];
    const filter = ROW_FILTERS[table];

    let cleaned = rows.filter((row) => (filter ? filter(row) : true));
    for (const row of cleaned) {
      for (const field of sanitize) {
        if (field in row) row[field] = '';
      }
    }

    // 排序保证产物可复现
    cleaned = cleaned.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const removed = before - cleaned.length;
    console.log(`[seed-export] ${table}: ${cleaned.length} 行` +
      (removed ? `（剔除 ${removed} 行个人/本地数据）` : '') +
      (sanitize.length ? `，已清洗字段: ${sanitize.join(', ')}` : ''));

    tables.push({ table, rows: cleaned });
  }
  db.close();

  const seed = {
    kind: 'brian-system-seed',
    version: 1,
    exportedAt: Date.now(),
    tables,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(seed, null, 2));
  const total = tables.reduce((s, t) => s + t.rows.length, 0);
  console.log(`[seed-export] ✅ 系统数据已导出: ${OUT_PATH}（${tables.length} 表 / ${total} 行）`);
}

main();
