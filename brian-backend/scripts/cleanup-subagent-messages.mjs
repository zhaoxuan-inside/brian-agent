import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '..', 'data', 'brian.db');
const commit = process.argv.includes('--commit');

const db = new Database(dbPath, { timeout: 10_000 });
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');

const subRuns = db.prepare(
  `SELECT "id", "session_key", "lane", "status" FROM "runtime_run" WHERE "lane" = 'subagent'`,
).all();

let msgCount = 0;
let partCount = 0;
let infoCount = 0;
const detail = [];

for (const run of subRuns) {
  const messages = db.prepare(
    `SELECT "id", "session_id", "role", substr("content", 1, 60) AS preview FROM "runtime_message" WHERE "run_id" = ?`,
  ).all(run.id);
  for (const message of messages) {
    const parts = db.prepare(
      `SELECT COUNT(*) AS n FROM "runtime_message_part" WHERE "msg_id" = ?`,
    ).get(message.id);
    msgCount += 1;
    partCount += Number(parts?.n ?? 0);
    detail.push({
      run_id: run.id,
      session_id: message.session_id,
      role: message.role,
      preview: message.preview,
    });
    if (commit) {
      db.prepare(`DELETE FROM "runtime_message_part" WHERE "msg_id" = ?`).run(message.id);
      db.prepare(`DELETE FROM "runtime_message" WHERE "id" = ?`).run(message.id);
    }
  }
  
  const infoRows = db.prepare(
    `SELECT COUNT(*) AS n FROM "info_raw" WHERE "work_id" = ?`,
  ).get(run.id);
  infoCount += Number(infoRows?.n ?? 0);
  if (commit) {
    db.prepare(`DELETE FROM "info_raw" WHERE "work_id" = ?`).run(run.id);
  }
}

if (commit) {
  db.pragma('wal_checkpoint(FULL)');
}

console.log(`subagent run 总数：${subRuns.length}`);
console.log(`清理消息：${msgCount} 条（关联 Part：${partCount} 个，info_raw 残留：${infoCount} 行）`);
console.log(commit ? '已执行删除（--commit）' : 'dry-run：未删除（加 --commit 执行）');
for (const row of detail.slice(0, 20)) {
  console.log(`  [${row.role}] ${row.preview}…（run=${row.run_id}）`);
}
if (detail.length > 20) {
  console.log(`  …另有 ${detail.length - 20} 条`);
}

db.close();
