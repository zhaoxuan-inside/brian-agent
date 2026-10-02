'use strict';

const fs = require('fs');
const path = require('path');

const platform = process.platform;
const arch = process.arch;
const abi = process.versions.modules;
const repoRoot = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.resolve(repoRoot, '..');
const PREBUILT_DIR = path.join(repoRoot, 'prebuilt');
const NODE_MODULES = path.resolve(repoRoot, '..', 'node_modules');

const platformDir = `${platform}-${arch}`;
const abiDir = `node${abi}`;

/** 项目锁定的 Node 版本（.nvmrc），用于错误提示 */
function readExpectedNode() {
  try {
    return fs.readFileSync(path.join(PROJECT_ROOT, '.nvmrc'), 'utf8').trim();
  } catch {
    return '22.x';
  }
}

/** 当前平台下可用的 prebuilt ABI 目录列表（node127 = Node 22） */
function prebuiltAbis(moduleName) {
  try {
    return fs.readdirSync(path.join(PREBUILT_DIR, moduleName, platformDir)).sort();
  } catch {
    return [];
  }
}

// 启动守卫：当前 Node ABI 没有对应的预编译原生模块时立刻失败并给切换引导，
// 让环境问题在安装阶段（postinstall）暴露，而不是推迟到服务启动时 Fatal。
if (!prebuiltAbis('better-sqlite3').includes(abiDir)) {
  const available = prebuiltAbis('better-sqlite3');
  console.error('');
  console.error('[prebuilt] FATAL: 当前 Node 运行时与项目预编译原生模块不匹配，无法就位绑定文件。');
  console.error(`[prebuilt]   当前 Node : ${process.version} (ABI ${abi}) @ ${platformDir}`);
  console.error(`[prebuilt]   可用 ABI  : ${available.length ? available.join(', ') : '（该平台无预编译件）'}`);
  console.error(`[prebuilt]   项目要求  : Node ${readExpectedNode()}（见 .nvmrc）`);
  console.error('[prebuilt]   请切换 Node 版本后重新安装，例如：');
  console.error(`[prebuilt]     nvm install ${readExpectedNode()} && nvm use ${readExpectedNode()}`);
  console.error(`[prebuilt]     或 mise use node@${readExpectedNode()} / fnm use`);
  console.error('[prebuilt]     然后: npm install');
  console.error('');
  process.exit(1);
}

const LANCEDB_FILENAMES = {
  'win32-x64':   'lancedb.win32-x64-msvc.node',
  'linux-x64':   'lancedb.linux-x64-gnu.node',
  'linux-arm64': 'lancedb.linux-arm64-gnu.node',
  'darwin-x64':  'lancedb.darwin-x64.node',
  'darwin-arm64':'lancedb.darwin-arm64.node',
};

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

/**
 * 扫描包的所有实际安装位置（npm workspace 可能 hoist 到根，也可能装进子包 node_modules）。
 * 绑定必须放到 require 真正解析到的实体目录，只写根会在子包实体安装时失效。
 */
function packageInstallDirs(packagePath) {
  const dirs = [];
  const candidates = [
    NODE_MODULES,
    path.join(PROJECT_ROOT, 'shared', 'node_modules'),
    path.join(PROJECT_ROOT, 'brian-frontend', 'node_modules'),
    ...(() => {
      try {
        return fs.readdirSync(repoRoot)
          .filter((d) => fs.statSync(path.join(repoRoot, d)).isDirectory())
          .map((d) => path.join(repoRoot, d, 'node_modules'));
      } catch {
        return [];
      }
    })(),
  ];
  for (const dir of candidates) {
    const p = path.join(dir, packagePath);
    try {
      if (fs.statSync(p).isDirectory()) dirs.push(p);
    } catch { /* 未安装该包，跳过 */ }
  }
  return dirs;
}

let allOk = true;

{
  const src = resolvePrebuilt('better-sqlite3', 'better_sqlite3.node');
  const dirs = packageInstallDirs('better-sqlite3');
  if (dirs.length === 0) {
    console.error('[prebuilt] better-sqlite3: 未在任何 node_modules 中找到包安装位置（先运行 npm install）');
    allOk = false;
  }
  for (const dir of dirs) {
    if (!copyIfNeeded(src, path.join(dir, 'build', 'Release', 'better_sqlite3.node'), `better-sqlite3 @ ${path.relative(PROJECT_ROOT, dir)}`)) allOk = false;
  }
}

{
  const fileName = LANCEDB_FILENAMES[platformDir];
  if (!fileName) {
    console.error(`[prebuilt] lancedb: unsupported platform ${platformDir}`);
    allOk = false;
  } else {
    const src = resolvePrebuilt('lancedb', fileName);
    const dirs = packageInstallDirs(path.join('@lancedb', 'lancedb'));
    if (dirs.length === 0) {
      console.error('[prebuilt] lancedb: 未在任何 node_modules 中找到包安装位置（先运行 npm install）');
      allOk = false;
    }
    for (const dir of dirs) {
      if (!copyIfNeeded(src, path.join(dir, 'dist', fileName), `lancedb @ ${path.relative(PROJECT_ROOT, dir)}`)) allOk = false;
    }
  }
}

{
  const vendorDir = path.join(repoRoot, 'Base', 'SkillProvider', 'infrastructure', 'sandbox', 'vendor', 'isolated-vm');
  const src = resolvePrebuilt('isolated-vm', 'isolated_vm.node');
  const dest = path.join(vendorDir, 'out', 'isolated_vm.node');
  
  
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log('[prebuilt] isolated-vm: already exists in vendor out/');
  } else if (fs.existsSync(src)) {
    copyIfNeeded(src, dest, 'isolated-vm');
  }
}

if (!allOk) {
  console.error('');
  console.error('[prebuilt] FATAL: 部分原生模块缺少当前平台的预编译二进制。');
  console.error(`[prebuilt] Platform: ${platformDir} (ABI ${abi})`);
  console.error('[prebuilt] 服务将无法启动。请确认 Node 版本与 .nvmrc 一致后重新 npm install，');
  console.error('[prebuilt] 或为以下目录补充对应 ABI 的预编译件：');
  console.error(`[prebuilt]   ${PREBUILT_DIR}/`);
  console.error('');
  process.exit(1);
} else {
  console.log('[prebuilt] All native modules ready.');
}
