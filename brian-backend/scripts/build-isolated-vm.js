/**
 * @fileoverview isolated-vm 预编译二进制构建脚本。
 *
 * 用途：在当前平台（OS + CPU 架构 + Node ABI）上从 vendor 全量 C++ 源码编译
 * isolated-vm 原生模块，并把产物安装到两处：
 * 1. brian-backend/prebuilt/isolated-vm/{platform}-{arch}/node{abi}/isolated_vm.node
 *    （离线包目录，npm postinstall / SEA / 便携包从这里分发）
 * 2. sandbox/vendor/isolated-vm/prebuilt/{platform}-{arch}/node{abi}/isolated_vm.node
 *    （vendor 镜像目录，require('isolated-vm') 优先从这里加载）
 * 3. sandbox/vendor/isolated-vm/out/isolated_vm.node（传统兜底路径）
 *
 * 背景：上游 isolated-vm v5.0.4 Release 不再发布 darwin-x64 预编译包
 * （只有 darwin-arm64），Intel Mac 需在目标机上从源码编译。本脚本即该
 * 官方路径的仓库级封装——在 macOS x64 机器上执行后可将产物提交入库，
 * 使 darwin-x64 也获得离线预编译覆盖。
 *
 * 用法：
 *   node brian-backend/scripts/build-isolated-vm.js            # 构建并安装到全部三处
 *   node brian-backend/scripts/build-isolated-vm.js --check    # 仅检查当前平台二进制是否存在
 *
 * 要求：C/C++ 工具链（Win: VS Build Tools / Mac: Xcode CLT / Linux: gcc+make）
 * 与 Python 3；首次编译需联网下载 Node 头文件。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const vendorDir = path.join(
  repoRoot, 'Base', 'SkillProvider', 'infrastructure', 'sandbox', 'vendor', 'isolated-vm',
);
const prebuiltDir = path.join(repoRoot, 'prebuilt', 'isolated-vm');

const platform = process.platform;              // 'win32' | 'darwin' | 'linux'
const arch = process.arch;                      // 'x64' | 'arm64'
const abi = process.versions.modules;           // e.g. '127'
const platformDir = `${platform}-${arch}`;
const abiDir = `node${abi}`;
const fileName = 'isolated_vm.node';

const checkOnly = process.argv.includes('--check');

function log(msg) { console.log(`[build-isolated-vm] ${msg}`); }
function fail(msg) {
  console.error(`[build-isolated-vm] ERROR: ${msg}`);
  process.exit(1);
}

const destPaths = [
  path.join(prebuiltDir, platformDir, abiDir, fileName),
  path.join(vendorDir, 'prebuilt', platformDir, abiDir, fileName),
  path.join(vendorDir, 'out', fileName),
];

if (checkOnly) {
  const exists = destPaths.map((p) => ({ p, ok: fs.existsSync(p) }));
  for (const { p, ok } of exists) log(`${ok ? 'OK ' : 'MISSING'} ${p}`);
  process.exit(exists.every((x) => x.ok) ? 0 : 1);
}

if (fs.existsSync(destPaths[0])) {
  log(`${platformDir} (ABI ${abi}) 预编译二进制已存在: ${destPaths[0]}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 源码编译（node-gyp rebuild --release，与 vendored loader 的运行时兜底一致）
// ---------------------------------------------------------------------------

/**
 * 解析 node-gyp 入口（三级回退，与 vendored loader 的运行时兜底一致）：
 * 1. 仓库内 node_modules（require.resolve）
 * 2. 全局 PATH 上的 node-gyp
 * 3. npx --yes node-gyp（在线获取；Node 运行时自带 npm/npx）
 *
 * @returns {{ kind: 'path'|'npx', value: string } | null}
 */
function resolveNodeGyp() {
  try {
    return { kind: 'path', value: require.resolve('node-gyp/bin/node-gyp.js', { paths: [repoRoot, process.cwd()] }) };
  } catch { /* fallthrough */ }
  const which = platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(which, [platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp'], { encoding: 'utf8' });
  if (res.status === 0 && String(res.stdout).trim()) {
    return { kind: 'path', value: String(res.stdout).trim().split(/\r?\n/)[0] };
  }
  const npxName = platform === 'win32' ? 'npx.cmd' : 'npx';
  const npxPath = path.join(path.dirname(process.execPath), npxName);
  const npxBin = fs.existsSync(npxPath) ? npxPath : npxName;
  const probe = spawnSync(npxBin, ['--yes', 'node-gyp', '--version'], {
    encoding: 'utf8', timeout: 120 * 1000, shell: platform === 'win32',
  });
  if (probe.status === 0 && /node-gyp/i.test(String(probe.stdout))) {
    return { kind: 'npx', value: npxBin };
  }
  return null;
}

const gyp = resolveNodeGyp();
if (!gyp) fail('未找到 node-gyp（已尝试：仓库内 node_modules → 全局 PATH → npx 在线获取）。请先执行 npm install。');

log(`开始从源码编译 ${platformDir} (ABI ${abi})，首次约 1-5 分钟...`);
const gypArgs = gyp.kind === 'path'
  ? [gyp.value, 'rebuild', '--release', '-j', 'max']
  : ['--yes', 'node-gyp', 'rebuild', '--release', '-j', 'max'];
const gypBin = gyp.kind === 'path' ? process.execPath : gyp.value;
const res = spawnSync(
  gypBin,
  gypArgs,
  {
    cwd: vendorDir,
    stdio: 'inherit',
    timeout: 20 * 60 * 1000,
    shell: gyp.kind === 'npx' && platform === 'win32',
    env: { ...process.env, npm_config_loglevel: 'error' },
  },
);
if (res.error) fail(`编译启动失败: ${res.error.message}`);
if (res.status !== 0) {
  fail(`编译失败（exit=${res.status}）。请确认已安装 C/C++ 工具链与 Python 3。`);
}

const built = ['build/Release', 'build/Debug']
  .map((d) => path.join(vendorDir, ...d.split('/'), fileName))
  .find((p) => fs.existsSync(p));
if (!built) fail('编译完成但未找到产物 build/Release/isolated_vm.node');

for (const dest of destPaths) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(built, dest);
  log(`已安装: ${dest}`);
}
fs.rmSync(path.join(vendorDir, 'build'), { recursive: true, force: true });
log(`完成。${platformDir} (ABI ${abi}) 预编译二进制可提交入库，实现该平台离线覆盖。`);
