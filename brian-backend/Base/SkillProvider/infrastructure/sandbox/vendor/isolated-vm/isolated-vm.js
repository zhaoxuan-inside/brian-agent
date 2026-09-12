/**
 * isolated-vm 跨平台入口文件。
 *
 * 自动检测当前平台（OS + CPU 架构 + Node.js ABI 版本），
 * 从 prebuilt/ 目录加载匹配的原生模块。
 *
 * 查找顺序：
 * 1. $BRIAN_NATIVE_DIR/{platform}-{arch}/isolated_vm.node（SEA 打包模式）
 * 2. prebuilt/{platform}-{arch}/node{abi}/isolated_vm.node
 * 3. prebuilt/{platform}-{arch}/isolated_vm.node
 * 4. out/isolated_vm.node（传统路径）
 *
 * 源码编译兜底（覆盖 Win / macOS / Linux 三平台）：
 * 当以上路径均无与当前平台（OS + arch + ABI）匹配的二进制时，自动调用
 * node-gyp 从本目录的全量 C++ 源码（src/ + binding.gyp）编译并缓存到
 * out/isolated_vm.node，随后加载。要求构建机具备 C/C++ 工具链
 * （Windows: VS Build Tools；macOS: Xcode CLT；Linux: gcc/clang + make）
 * 与 Python 3；首次编译需联网下载 Node 头文件，编译产物缓存后离线可用。
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const platform = process.platform;
const arch = process.arch;
const abi = process.versions.modules;
const baseDir = __dirname;
const fileName = 'isolated_vm.node';
const outBinary = path.join(baseDir, 'out', fileName);

const searchPaths = [
  path.join(baseDir, 'prebuilt', `${platform}-${arch}`, `node${abi}`, fileName),
  path.join(baseDir, 'prebuilt', `${platform}-${arch}`, fileName),
  outBinary,
];

// SEA 单文件打包模式：原生模块由 bootstrap 解压到 BRIAN_NATIVE_DIR，
// 优先从该目录加载（优先级最高）。
if (process.env.BRIAN_NATIVE_DIR) {
  searchPaths.unshift(path.join(process.env.BRIAN_NATIVE_DIR, `${platform}-${arch}`, fileName));
}

let loadedPath = null;
let lastError = null;

function tryLoad(p) {
  try {
    const mod = require(p);
    loadedPath = p;
    module.exports = mod.ivm;
    return true;
  } catch (e) {
    lastError = e;
    return false;
  }
}

for (const p of searchPaths) {
  if (fs.existsSync(p) && tryLoad(p)) break;
}

// ---------------------------------------------------------------------------
// 源码编译兜底：保证任意平台（win32 / darwin / linux，x64 / arm64）都有可用的
// isolated-vm 原生模块，不再存在"缺失降级"路径。
// ---------------------------------------------------------------------------
if (!loadedPath) {
  buildFromSource();
  if (fs.existsSync(outBinary) && !tryLoad(outBinary)) {
    /* 加载失败信息已记录到 lastError */
  }
}

if (!loadedPath) {
  const errMsg =
    `[isolated-vm] 当前平台 (${platform}-${arch}, ABI ${abi}) 原生模块不可用。\n` +
    `已查找以下路径（均未找到或加载失败）:\n` +
    searchPaths.map((p) => `  - ${p}`).join('\n') +
    `\n已尝试源码编译兜底（node-gyp rebuild）仍失败。` +
    (lastError ? `\n最后尝试加载的错误: ${lastError.message}` : '');
  throw new Error(errMsg);
}

/**
 * 从本目录源码编译原生模块（node-gyp rebuild --release），产物输出到 out/。
 *
 * 防并发：以 out/.building.lock 锁文件互斥（残留锁超过 30 分钟视为崩溃残留并清除）；
 * 进程内去重：编译结果缓存于 globalThis，避免模块加载失败重试时重复编译。
 */
function buildFromSource() {
  // 进程内去重：同一进程内只编译一次（require 失败不会被缓存，会重复进入本文件）
  if (globalThis.__BRIAN_IVM_BUILD_DONE__) return;
  globalThis.__BRIAN_IVM_BUILD_DONE__ = true;

  const lockFile = path.join(baseDir, 'out', '.building.lock');
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  if (fs.existsSync(lockFile)) {
    const age = Date.now() - fs.statSync(lockFile).mtimeMs;
    if (age < 30 * 60 * 1000) {
      throw new Error('[isolated-vm] 检测到正在进行的源码编译（out/.building.lock），请稍后重试');
    }
    fs.unlinkSync(lockFile); // 崩溃残留锁
  }
  fs.writeFileSync(lockFile, String(process.pid));
  try {
    const gyp = resolveNodeGyp();
    if (!gyp) {
      throw new Error(
        '未找到 node-gyp（已尝试：仓库内 node_modules → 全局 PATH → npx 在线获取）。' +
        '请先执行 npm install，安装 C/C++ 工具链，或向 prebuilt/ 目录放入当前平台二进制。',
      );
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[isolated-vm] 未找到 ${platform}-${arch} (ABI ${abi}) 预编译二进制，` +
      `开始从源码编译（首次约 1-5 分钟，产物缓存到 out/isolated_vm.node）...`,
    );
    // gyp.kind === 'path'：直接 node <gyp.js>；'npx'：经 npx 在线获取后执行（便携包自带
    // Node 运行时必有 npx，保证无 node_modules 的发行形态也能完成源码编译兜底）
    const res = gyp.kind === 'path'
      ? spawnSync(
          process.execPath,
          [gyp.value, 'rebuild', '--release', '-j', 'max'],
          {
            cwd: baseDir,
            stdio: 'pipe',
            encoding: 'utf8',
            timeout: 15 * 60 * 1000,
            env: { ...process.env, npm_config_loglevel: 'error' },
          },
        )
      : spawnSync(
          gyp.value, // 'npx'（win32 为 npx.cmd）
          ['--yes', 'node-gyp', 'rebuild', '--release', '-j', 'max'],
          {
            cwd: baseDir,
            stdio: 'pipe',
            encoding: 'utf8',
            timeout: 15 * 60 * 1000,
            shell: platform === 'win32',
            env: { ...process.env, npm_config_loglevel: 'error' },
          },
        );
    if (res.error) {
      throw new Error(`源码编译启动失败: ${res.error.message}`);
    }
    if (res.status !== 0) {
      const tail = String(res.stderr || res.stdout || '').split('\n').slice(-15).join('\n');
      throw new Error(`源码编译失败（exit=${res.status}）。请确认已安装 C/C++ 工具链与 Python 3。\n日志尾部:\n${tail}`);
    }
    // node-gyp 产物位于 build/Release/（或 build/Debug/），拷贝到 out/ 供加载路径检索
    const built = ['build/Release', 'build/Debug']
      .map((d) => path.join(baseDir, ...d.split('/'), fileName))
      .find((p) => fs.existsSync(p));
    if (!built) {
      throw new Error('源码编译完成但未找到产物 build/Release/isolated_vm.node');
    }
    fs.mkdirSync(path.dirname(outBinary), { recursive: true });
    fs.copyFileSync(built, outBinary);
    // eslint-disable-next-line no-console
    console.warn('[isolated-vm] 源码编译完成，原生模块已缓存到 out/isolated_vm.node');
  } finally {
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
  }
}

/**
 * 解析 node-gyp 入口（三级回退，保证任意发行形态可用）：
 * 1. 仓库内 node_modules（require.resolve）
 * 2. 全局 PATH 上的 node-gyp
 * 3. npx --yes node-gyp（在线获取；Node 运行时自带 npm/npx）
 */
function resolveNodeGyp() {
  try {
    return { kind: 'path', value: require.resolve('node-gyp/bin/node-gyp.js', { paths: [baseDir, process.cwd()] }) };
  } catch { /* fallthrough */ }
  // 兜底：全局安装的 node-gyp（PATH 上）
  const which = platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(which, [platform === 'win32' ? 'node-gyp.cmd' : 'node-gyp'], { encoding: 'utf8' });
  if (res.status === 0 && String(res.stdout).trim()) {
    return { kind: 'path', value: String(res.stdout).trim().split(/\r?\n/)[0] };
  }
  // 最终兜底：npx 在线获取（便携包自带 Node → 必有 npm/npx；需网络，node-gyp 会缓存到 npm 缓存目录）
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
