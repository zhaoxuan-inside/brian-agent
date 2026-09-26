'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const vendorDir = path.join(
  repoRoot, 'Base', 'SkillProvider', 'infrastructure', 'sandbox', 'vendor', 'isolated-vm',
);
const prebuiltDir = path.join(repoRoot, 'prebuilt', 'isolated-vm');

const platform = process.platform;
const arch = process.arch;
const abi = process.versions.modules;
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

function resolveNodeGyp() {
  try {
    return { kind: 'path', value: require.resolve('node-gyp/bin/node-gyp.js', { paths: [repoRoot, process.cwd()] }) };
  } catch {  }
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
