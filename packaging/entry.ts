/**
 * @fileoverview 打包入口（SEA 单文件 / 便携目录包共用）。
 *
 * 顺序至关重要：
 * 1. 便携目录包模式：先定位包根并配置数据目录 / 原生目录 / 前端静态文件
 * 2. 安装原生模块加载拦截（覆盖 Module._resolveFilename）
 * 3. 安装内置 Chromium（供 CDT 使用）
 * 4. 再加载后端入口（dev-server.ts 顶层会调用 main() 启动服务）
 *
 * 使用动态 import 确保原生模块拦截在任何 require 原生模块之前生效。
 */
import fs from 'node:fs';
import path from 'node:path';
import { installNativeLoader } from './setup-native';
import { installChromium } from './setup-chromium';

// 安全地访问 node:sea（非 SEA 环境返回 null）
function getSea(): { isSea(): boolean; getRawAsset(key: string): ArrayBuffer } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node:sea') as { isSea(): boolean; getRawAsset(key: string): ArrayBuffer };
  } catch {
    return null;
  }
}

/**
 * 捆绑的技能沙箱运行时：把 <runtimeRoot>/{bash,python} 注入 BRIAN_SANDBOX_*。
 * SandboxRuntime.ts 将这两个变量视为最高优先级候选，因此打包版内 bash/Python
 * 生来即用，无需宿主机安装 Git for Windows / Python。
 * 用户显式设置的 BRIAN_SANDBOX_* 永远优先（此处仅在变量未设置时注入）。
 */
function injectSandboxRuntimeEnv(runtimeRoot: string): void {
  const isWin = process.platform === 'win32';
  const bashExe = isWin
    ? path.join(runtimeRoot, 'bash', 'usr', 'bin', 'bash.exe')
    : path.join(runtimeRoot, 'bash', 'bin', 'bash');
  const pythonExe = isWin
    ? path.join(runtimeRoot, 'python', 'python.exe')
    : path.join(runtimeRoot, 'python', 'bin', 'python3');
  if (!process.env.BRIAN_SANDBOX_BASH && fs.existsSync(bashExe)) {
    process.env.BRIAN_SANDBOX_BASH = bashExe;
  }
  if (!process.env.BRIAN_SANDBOX_PYTHON && fs.existsSync(pythonExe)) {
    process.env.BRIAN_SANDBOX_PYTHON = pythonExe;
  }
}

/**
 * 便携目录包模式：定位包根并配置运行时资源。
 * 包根 = server/brian-server.cjs 的上上级目录；布局：
 *   <root>/{brian.sh|brian.cmd, bin/node, server/{brian-server.cjs, native/<plat>-<arch>/*.node},
 *           web/**, chrome/chrome.zip, runtime/{bash,python}, data/(首跑生成)}
 */
function setupPortable(): boolean {
  if (process.env.BRIAN_PORTABLE !== '1') return false;
  const entryPath = path.resolve(process.argv[1] || '.');
  const root = path.resolve(path.dirname(entryPath), '..');
  if (!fs.existsSync(path.join(root, 'server', 'portable.marker'))) return false;

  if (!process.env.BRIAN_DATA_DIR) {
    process.env.BRIAN_DATA_DIR = path.join(root, 'data');
  }
  if (!process.env.BRIAN_NATIVE_DIR) {
    process.env.BRIAN_NATIVE_DIR = path.join(root, 'server', 'native');
  }
  injectSandboxRuntimeEnv(path.join(root, 'runtime'));
  // 系统数据种子（通用目录数据：模型提供商列表 / MCP 提供商列表）
  const seedPath = path.join(root, 'server', 'seed', 'system-seed.json');
  if (fs.existsSync(seedPath)) {
    process.env.BRIAN_SEED_FILE = seedPath;
  }
  // 前端静态文件：从 web/ 目录构建 base64 映射（与 SEA asset 的 frontend.json 同构），
  // dev-server 的 serveFrontend 零改动复用
  const webDir = path.join(root, 'web');
  if (fs.existsSync(webDir)) {
    const files: Record<string, string> = {};
    const walk = (dir: string, prefix: string): void => {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        const rel = prefix + name;
        if (fs.statSync(p).isDirectory()) walk(p, rel + '/');
        else files[rel] = fs.readFileSync(p).toString('base64');
      }
    };
    walk(webDir, '');
    (globalThis as Record<string, unknown>).__BRIAN_FRONTEND__ = files;
  }
  return true;
}

/** SEA 模式：数据目录与内联前端资源 */
function setupSea(): void {
  const sea = getSea();
  if (!sea || typeof sea.isSea !== 'function' || !sea.isSea()) return;
  const exeDir = path.dirname(process.execPath);
  if (!process.env.BRIAN_DATA_DIR) {
    process.env.BRIAN_DATA_DIR = path.join(exeDir, 'data');
  }
  injectSandboxRuntimeEnv(path.join(exeDir, 'runtime'));
  try {
    const buf = sea.getRawAsset('frontend.json');
    const files = JSON.parse(Buffer.from(buf).toString('utf8')) as Record<string, string>;
    (globalThis as Record<string, unknown>).__BRIAN_FRONTEND__ = files;
  } catch {
    /* 未打包前端资源（纯后端模式） */
  }
}

const isPortable = setupPortable();
installNativeLoader();
installChromium();
if (!isPortable) setupSea();

// 动态加载后端入口（dev-server.ts 顶层 main() 自启动）
import('../brian-backend/dev-server');
