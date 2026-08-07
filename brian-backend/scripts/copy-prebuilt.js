/**
 * npm postinstall 脚本：将离线预编译原生模块复制到 node_modules 对应位置。
 *
 * 自动检测当前平台（OS + CPU 架构 + Node.js ABI 版本），
 * 从 brian-backend/prebuilt/ 目录复制预编译 .node 文件。
 *
 * 覆盖模块：
 * - better-sqlite3
 * - nodejieba
 * - @lancedb/lancedb
 * - isolated-vm (vendor)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 平台信息
// ---------------------------------------------------------------------------
const platform = process.platform;   // 'win32' | 'linux' | 'darwin'
const arch = process.arch;           // 'x64' | 'arm64'
const abi = process.versions.modules; // e.g. '127'
const repoRoot = path.resolve(__dirname, '..');
const PREBUILT_DIR = path.join(repoRoot, 'prebuilt');
const NODE_MODULES = path.resolve(repoRoot, '..', 'node_modules');

const platformDir = `${platform}-${arch}`;
const abiDir = `node${abi}`;

// ---------------------------------------------------------------------------
// lancedb 各平台文件名映射
// ---------------------------------------------------------------------------
const LANCEDB_FILENAMES = {
  'win32-x64':   'lancedb.win32-x64-msvc.node',
  'linux-x64':   'lancedb.linux-x64-gnu.node',
  'linux-arm64': 'lancedb.linux-arm64-gnu.node',
  'darwin-x64':  'lancedb.darwin-x64.node',
  'darwin-arm64':'lancedb.darwin-arm64.node',
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------
function copyIfNeeded(src, dest, label) {
  if (fs.existsSync(dest)) {
    console.log(`[prebuilt] ${label}: already exists at ${dest}`);
    return true;
  }
  if (!fs.existsSync(src)) {
    console.error(`[prebuilt] ${label}: MISSING prebuilt binary at ${src}`);
    return false;
  }
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  console.log(`[prebuilt] ${label}: copied ${src} -> ${dest}`);
  return true;
}

function resolvePrebuilt(moduleName, fileName) {
  return path.join(PREBUILT_DIR, moduleName, platformDir, abiDir, fileName);
}

// ---------------------------------------------------------------------------
// 各模块处理
// ---------------------------------------------------------------------------
let allOk = true;

// --- better-sqlite3 ---
{
  const src = resolvePrebuilt('better-sqlite3', 'better_sqlite3.node');
  const dest = path.join(NODE_MODULES, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  if (!copyIfNeeded(src, dest, 'better-sqlite3')) allOk = false;
}

// --- nodejieba ---
{
  const src = resolvePrebuilt('nodejieba', 'nodejieba.node');
  const dest = path.join(NODE_MODULES, 'nodejieba', 'build', 'Release', 'nodejieba.node');
  if (!copyIfNeeded(src, dest, 'nodejieba')) allOk = false;
}

// --- @lancedb/lancedb ---
// lancedb 优先从自身 dist/ 目录加载 .node 文件，
// 其次回退到平台特定 npm 包 require
{
  const fileName = LANCEDB_FILENAMES[platformDir];
  if (!fileName) {
    console.error(`[prebuilt] lancedb: unsupported platform ${platformDir}`);
    allOk = false;
  } else {
    const src = resolvePrebuilt('lancedb', fileName);
    const dest = path.join(NODE_MODULES, '@lancedb', 'lancedb', 'dist', fileName);
    if (!copyIfNeeded(src, dest, 'lancedb')) allOk = false;
  }
}

// --- isolated-vm (vendor, not in node_modules) ---
{
  const vendorDir = path.join(repoRoot, 'Base', 'SkillProvider', 'infrastructure', 'sandbox', 'vendor', 'isolated-vm');
  const src = resolvePrebuilt('isolated-vm', 'isolated_vm.node');
  const dest = path.join(vendorDir, 'out', 'isolated_vm.node');
  // isolated-vm 有自己的入口文件 isolated-vm.js 从 prebuilt/ 和 out/ 双重查找
  // 这里同时更新 out/ 以确保兼容
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log('[prebuilt] isolated-vm: already exists in vendor out/');
  } else if (fs.existsSync(src)) {
    copyIfNeeded(src, dest, 'isolated-vm');
  }
}

// ---------------------------------------------------------------------------
// 结果
// ---------------------------------------------------------------------------
if (!allOk) {
  console.error('');
  console.error('[prebuilt] WARNING: Some native modules are missing prebuilt binaries for this platform.');
  console.error(`[prebuilt] Platform: ${platformDir} (ABI ${abi})`);
  console.error('[prebuilt] The server may fail to start. Add the missing prebuilt binaries to:');
  console.error(`[prebuilt]   ${PREBUILT_DIR}/`);
  console.error('');
} else {
  console.log('[prebuilt] All native modules ready.');
}
