/**
 * E2E：登录态种子 → 真实 Chrome 启动链路验证。
 *
 * 场景：
 * 1. 伪造本机 Chrome 源 profile（Network/Cookies + Local Storage/leveldb）
 * 2. 写入 profile_snapshot_source 配置 → startCDT
 * 3. 断言：Chrome 启动成功、登录态文件已复制进产品 profile、标记已写入、CDP 可用
 * 4. stopCDT → 再 startCDT → 断言标记未变（同源不重复播种）
 */

process.env.CDT_TEST = '1';

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RelationDBAccess, CDTAccess, ConfigService } from '@brian-agent/base';

const root = mkdtempSync(join(tmpdir(), 'brian-cdt-e2e-'));
const dbPath = join(root, 'brian.db');
const dataDir = join(root, 'data');
const sourceProfile = join(root, 'fake-chrome-profile');
mkdirSync(dataDir, { recursive: true });
mkdirSync(join(sourceProfile, 'Network'), { recursive: true });
mkdirSync(join(sourceProfile, 'Local Storage', 'leveldb'), { recursive: true });
writeFileSync(join(sourceProfile, 'Network', 'Cookies'), 'e2e-cookie-db');
writeFileSync(join(sourceProfile, 'Local Storage', 'leveldb', '000003.log'), 'e2e-ls');

const relationDb = new RelationDBAccess({ dbPath });
await relationDb.initialize();

const cdt = new CDTAccess(relationDb, dataDir);
await cdt.initialize();

const ctx = {};
const assert = (cond, msg) => { if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; } else { console.log(`PASS: ${msg}`); } };

// 写播种源配置（直接操作 cdt_config，模拟配置页 PUT /config 的落表结果）
const cfg = new ConfigService(relationDb, 'cdt_config');
await cfg.set('profile_snapshot_source', sourceProfile, 'STRING');

// 第一次启动
const out1 = { endpoint: '', port: 0, pid: 0 };
const ok1 = await cdt.startCDT({}, out1, ctx);
assert(ok1, `startCDT#1 成功（endpoint=${out1.endpoint}）`);
assert(existsSync(join(dataDir, 'cdt-profile', 'Default', 'Network', 'Cookies')), 'Cookies 已复制进产品 profile(Default/)');
assert(existsSync(join(dataDir, 'cdt-profile', 'Default', 'Local Storage', 'leveldb', '000003.log')), 'Local Storage 已复制');
const marker1 = readFileSync(join(dataDir, 'cdt-profile', '.cdt-profile-seeded'), 'utf-8');
assert(marker1 === sourceProfile, '播种标记记录源路径');

// CDP 探活 + 验证浏览器真实可用
const status = { running: false, pid: 0, port: 0 };
await cdt.isCDTRunning({}, status, ctx);
assert(status.running, 'CDP 端点探活成功');

// 停止 → 再次启动（同源，不应重复播种；标记保持）
await cdt.stopCDT({}, {}, ctx);
writeFileSync(join(dataDir, 'cdt-profile', 'Default', 'Network', 'Cookies'), 'product-side-cookie');
const out2 = { endpoint: '', port: 0, pid: 0 };
const ok2 = await cdt.startCDT({}, out2, ctx);
assert(ok2, 'startCDT#2 成功');
const after = readFileSync(join(dataDir, 'cdt-profile', 'Default', 'Network', 'Cookies'), 'utf-8');
assert(after === 'product-side-cookie', '同源二次启动不覆盖产品侧登录态（种子只播一次）');

await cdt.stopCDT({}, {}, ctx);
// 兜底清理：stopCDT 杀 launcher 后 re-exec 的浏览器可能残留（既有行为，见 CDTService.freeDebugPort）
try { execSync(`pkill -KILL -f "user-data-dir=${root}" 2>/dev/null || true`, { timeout: 3000 }); } catch { /* 进程已退出 */ }
rmSync(root, { recursive: true, force: true });
console.log(process.exitCode ? 'E2E FAILED' : 'E2E ALL PASS');
process.exit(process.exitCode || 0);
