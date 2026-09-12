/**
 * @fileoverview Brian-Agent 便携目录包构建器（跨目标交叉打包）。
 *
 * 与 SEA 单文件方案（build.mjs）并行：产出"解压即用"的目录包，内含
 * Node 运行时 / 后端 bundle / 平台原生模块 / 前端静态资源 / Chrome for
 * Testing（CDT 用）/ 启动脚本。产物对最终用户零依赖（无需安装 Node）。
 *
 * 原生 .node 依赖来自仓库内置的 brian-backend/prebuilt（node127 = Node 22）
 * 与 npm registry 的 @node-rs/jieba 平台子包，因此本脚本可在任意一台
 * Linux / macOS / Windows 上交叉产出全部目标平台。
 *
 * 覆盖目标（与 prebuilt 目录一致）：
 *   linux-x64 / darwin-x64 / darwin-arm64 / win32-x64
 *
 * 用法：
 *   node packaging/pack.mjs                  # 全部 4 个目标 + linux .deb
 *   node packaging/pack.mjs linux-x64        # 仅指定目标
 *   node packaging/pack.mjs --skip-chromium  # 不内置 Chromium（体积 -150MB/目标）
 *   node packaging/pack.mjs --skip-frontend-build  # 复用已有前端 dist
 *
 * 已知限制：
 *   - darwin-x64（Intel Mac）上游 isolated-vm v5.0.4 不发布预编译二进制；便携包
 *     在该目标首次运行时由 vendored loader 自动从源码编译兜底（需 Xcode CLT，
 *     产物缓存后离线可用）；也可在 Intel Mac 上执行
 *     `node brian-backend/scripts/build-isolated-vm.js` 产出并提交入库。
 *   - macOS 目标未做公证，用户首次运行前需执行
 *     `xattr -dr com.apple.quarantine <包目录>`（README 中已说明）。
 */

import { build as esbuild } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist-pack');
const CACHE = path.join(__dirname, '.cache');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '1.0.0';

// 与 brian-backend/prebuilt（node127）一致的 Node 主版本，勿在非 22 环境构建
const NODE_VERSION = process.versions.node;
const NODE_MAJOR = parseInt(NODE_VERSION.split('.')[0], 10);
const NODE_ABI = process.versions.modules;
const PREBUILT_ABI = 'node127';

const CHROME_VERSION = process.env.CHROME_VERSION || '140.0.7339.80';

/** 从 origin remote 推断 owner/repo（默认 zhaoxuan-inside/brian-agent） */
function detectRepo() {
  try {
    const url = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8' }).trim();
    const m = url.match(/[/:]([^/]+\/[^/]+?)(\.git)?$/);
    if (m) return m[1];
  } catch { /* ignore */ }
  return 'zhaoxuan-inside/brian-agent';
}

// ---------------------------------------------------------------------------
// 目标平台定义
// ---------------------------------------------------------------------------

const TARGETS = {
  'linux-x64': { os: 'linux', arch: 'x64', napi: 'linux-x64-gnu', debArch: 'amd64', exeSuffix: '', archive: 'tar.gz' },
  'darwin-x64': { os: 'darwin', arch: 'x64', napi: 'darwin-x64', archive: 'tar.gz' },
  'darwin-arm64': { os: 'darwin', arch: 'arm64', napi: 'darwin-arm64', archive: 'tar.gz' },
  'win32-x64': { os: 'win32', arch: 'x64', napi: 'win32-x64-msvc', archive: 'zip' },
};

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const SKIP_CHROMIUM = args.includes('--skip-chromium');
const SKIP_FRONTEND_BUILD = args.includes('--skip-frontend-build');
const NO_SYSTEM_DATA = args.includes('--no-system-data');
const NO_NPM = args.includes('--no-npm');
// npm 包内引用的 GitHub 仓库（Release 资产下载地址），默认取 origin remote
const NPM_REPO = (args.includes('--repo') ? args[args.indexOf('--repo') + 1] : null) || detectRepo();
const onlyIdx = args.indexOf('--only');
const onlyTargets = onlyIdx >= 0 ? args[onlyIdx + 1].split(',') : null;

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function log(msg) { console.log(`[pack] ${msg}`); }
function warn(msg) { console.warn(`[pack] ⚠ ${msg}`); }
function die(msg) { console.error(`[pack] ✗ ${msg}`); process.exit(1); }

function run(cmd, opts = {}) {
  log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts });
}

async function downloadTo(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    log(`缓存命中: ${path.basename(dest)}`);
    return dest;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  log(`下载: ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  log(`完成: ${(buf.length / 1024 / 1024).toFixed(1)} MB → ${path.basename(dest)}`);
  return dest;
}

/** 解压 tar.gz 中单个文件到指定输出（流式单文件抽取） */
function extractTarSingle(tarball, member, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const r = spawnSync('tar', ['-xzf', tarball, '-O', member], { maxBuffer: 1024 * 1024 * 128 });
  if (r.status !== 0 || !r.stdout || r.stdout.length === 0) {
    throw new Error(`tar 抽取失败: ${member} @ ${tarball}: ${r.stderr?.toString()}`);
  }
  fs.writeFileSync(dest, r.stdout);
}

// ---------------------------------------------------------------------------
// 前端构建
// ---------------------------------------------------------------------------
function buildFrontend() {
  if (SKIP_FRONTEND_BUILD && fs.existsSync(path.join(ROOT, 'brian-frontend', 'dist', 'index.html'))) {
    log('跳过前端构建（复用已有 dist）');
    return;
  }
  run('npm run build:frontend');
}

// ---------------------------------------------------------------------------
// 后端 bundle（平台无关，构建一次）
// ---------------------------------------------------------------------------
function jiebaDictPlugin() {
  return {
    name: 'jieba-dict',
    setup(build) {
      build.onResolve({ filter: /^@node-rs\/jieba\/dict$/ }, () => ({
        path: 'jieba-dict-virtual',
        namespace: 'jieba-dict',
      }));
      build.onLoad({ filter: /.*/, namespace: 'jieba-dict' }, async () => {
        const dict = await fs.promises.readFile(path.join(ROOT, 'node_modules', '@node-rs', 'jieba', 'dict.txt'));
        const idf = await fs.promises.readFile(path.join(ROOT, 'node_modules', '@node-rs', 'jieba', 'idf.txt'));
        return {
          contents: [
            `module.exports.dict = Buffer.from(${JSON.stringify(dict.toString('base64'))}, 'base64');`,
            `module.exports.idf = Buffer.from(${JSON.stringify(idf.toString('base64'))}, 'base64');`,
          ].join('\n'),
          loader: 'js',
        };
      });
    },
  };
}

async function buildBundle() {
  const outfile = path.join(OUT, 'brian-server.cjs');
  log('esbuild 打包后端...');
  await esbuild({
    entryPoints: [path.join(__dirname, 'entry.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile,
    plugins: [jiebaDictPlugin()],
    external: [
      '*.node',
      '@node-rs/jieba-linux-*', '@node-rs/jieba-darwin-*', '@node-rs/jieba-win32-*',
      '@node-rs/jieba-android-*', '@node-rs/jieba-freebsd-*',
      '@lancedb/lancedb-linux-*', '@lancedb/lancedb-darwin-*', '@lancedb/lancedb-win32-*',
      '@lancedb/lancedb-android-*', '@lancedb/lancedb-freebsd-*',
    ],
    logLevel: 'warning',
  });
  log(`bundle 完成: ${outfile}`);
  return outfile;
}

// ---------------------------------------------------------------------------
// 原生模块解析（按目标平台）
// ---------------------------------------------------------------------------
const PREBUILT = path.join(ROOT, 'brian-backend', 'prebuilt');

/** 从 npm registry 拉取 @node-rs/jieba 平台子包并抽取 .node（带缓存） */
async function fetchJiebaNative(napiSuffix) {
  const version = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules', '@node-rs', 'jieba', 'package.json'), 'utf8'),
  ).version;
  const pkgName = `@node-rs/jieba-${napiSuffix}`;
  const tgz = path.join(CACHE, `jieba-${napiSuffix}-${version}.tgz`);
  const dest = path.join(CACHE, `jieba.${napiSuffix}.node`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;
  await downloadTo(`https://registry.npmjs.org/${pkgName}/-/${pkgName.split('/')[1]}-${version}.tgz`, tgz);
  extractTarSingle(tgz, `package/jieba.${napiSuffix}.node`, dest);
  return dest;
}

/** 解析某目标平台的 4 个原生 .node（缺失返回 null 并告警） */
async function resolveNatives(targetKey) {
  const t = TARGETS[targetKey];
  const natives = {};

  const sqlite = path.join(PREBUILT, 'better-sqlite3', `${t.os}-${t.arch}`, PREBUILT_ABI, 'better_sqlite3.node');
  natives['better_sqlite3.node'] = fs.existsSync(sqlite) ? sqlite : null;

  // lancedb 文件名与 copy-prebuilt.js 的映射一致
  const lanceNames = {
    'win32-x64': 'lancedb.win32-x64-msvc.node',
    'linux-x64': 'lancedb.linux-x64-gnu.node',
    'linux-arm64': 'lancedb.linux-arm64-gnu.node',
    'darwin-x64': 'lancedb.darwin-x64.node',
    'darwin-arm64': 'lancedb.darwin-arm64.node',
  };
  const lance = path.join(PREBUILT, 'lancedb', `${t.os}-${t.arch}`, PREBUILT_ABI, lanceNames[`${t.os}-${t.arch}`]);
  natives['lancedb.node'] = fs.existsSync(lance) ? lance : null;

  // jieba：linux 取本地 node_modules，其余从 npm registry
  if (t.os === 'linux') {
    const local = path.join(ROOT, 'node_modules', `@node-rs/jieba-${t.napi}`, `jieba.${t.napi}.node`);
    natives['jieba.node'] = fs.existsSync(local) ? local : await fetchJiebaNative(t.napi);
  } else {
    natives['jieba.node'] = await fetchJiebaNative(t.napi);
  }

  // isolated-vm：仓库内置；目标平台 = 本机且缺二进制时先尝试源码构建补齐
  //（上游 v5.0.4 不发布 darwin-x64 预编译包，其余平台二进制均已入库）
  const ivm = path.join(PREBUILT, 'isolated-vm', `${t.os}-${t.arch}`, PREBUILT_ABI, 'isolated_vm.node');
  if (!fs.existsSync(ivm) && `${t.os}-${t.arch}` === `${process.platform}-${process.arch}` && process.versions.modules === PREBUILT_ABI) {
    try {
      execSync('node brian-backend/scripts/build-isolated-vm.js', { cwd: ROOT, stdio: 'inherit' });
    } catch (e) {
      warn(`isolated-vm: 本机源码构建失败（${e.message}），目标 ${targetKey} 将依赖运行时编译兜底`);
    }
  }
  natives['isolated_vm.node'] = fs.existsSync(ivm) ? ivm : null;

  for (const [k, p] of Object.entries(natives)) {
    if (!p) warn(`${targetKey}: 缺少原生模块 ${k}（对应能力将降级或不可用）`);
  }
  return natives;
}

// ---------------------------------------------------------------------------
// Node 运行时 / Chromium 下载
// ---------------------------------------------------------------------------
async function fetchNodeBinary(targetKey) {
  const t = TARGETS[targetKey];
  // nodejs.org 发行目录命名：Windows 是 win-x64（非 win32-x64）
  const distOs = t.os === 'win32' ? 'win' : t.os;
  const dirName = `node-v${NODE_VERSION}-${distOs}-${t.arch}`;
  const cacheDir = path.join(CACHE, dirName);
  const exeName = t.os === 'win32' ? 'node.exe' : 'node';
  const dest = path.join(cacheDir, exeName);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return dest;

  fs.mkdirSync(cacheDir, { recursive: true });
  if (t.os === 'win32') {
    const zipPath = await downloadTo(
      `https://nodejs.org/dist/v${NODE_VERSION}/${dirName}.zip`,
      path.join(CACHE, `${dirName}.zip`),
    );
    const zip = new AdmZip(zipPath);
    const entry = zip.getEntry(`${dirName}/node.exe`);
    if (!entry) throw new Error(`node.exe 未在 zip 中找到: ${dirName}`);
    fs.writeFileSync(dest, zip.readFile(entry));
  } else {
    const tarball = await downloadTo(
      `https://nodejs.org/dist/v${NODE_VERSION}/${dirName}.tar.gz`,
      path.join(CACHE, `${dirName}.tar.gz`),
    );
    extractTarSingle(tarball, `${dirName}/bin/node`, dest);
  }
  fs.chmodSync(dest, 0o755);
  return dest;
}

function chromePlatformDir(t) {
  if (t.os === 'darwin') return t.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  if (t.os === 'win32') return 'win64';
  return 'linux64';
}

async function fetchChromium(targetKey) {
  if (SKIP_CHROMIUM) return null;
  const t = TARGETS[targetKey];
  const dir = chromePlatformDir(t);
  const zipPath = path.join(CACHE, `chrome-${dir}-${CHROME_VERSION}.zip`);
  try {
    return await downloadTo(
      `https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/${dir}/chrome-${dir}.zip`,
      zipPath,
    );
  } catch (e) {
    warn(`Chromium 下载失败（${targetKey}）: ${e.message}，该包 CDT 将回退系统 Chrome`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 启动脚本与 README
// ---------------------------------------------------------------------------
function brianShTemplate() {
  // 用数组拼接避免 JS 模板字符串与 shell ${} 的转义冲突
  const L = [
    '#!/usr/bin/env bash',
    '# ============================================================================',
    '# brian — Brian-Agent 便携包管理命令',
    '#',
    '# 用法:',
    '#   ./brian.sh serve    # 前台启动（Ctrl+C 停止）',
    '#   ./brian.sh start    # 后台启动',
    '#   ./brian.sh stop     # 停止',
    '#   ./brian.sh restart  # 重启',
    '#   ./brian.sh status   # 运行状态',
    '#   ./brian.sh logs     # 跟踪日志',
    '#   ./brian.sh open     # 浏览器打开 http://127.0.0.1:8000',
    '#',
    '# 环境变量: BRIAN_PORT(默认 8000) BRIAN_HOST(默认 127.0.0.1) BRIAN_DATA_DIR',
    '# 兼容符号链接调用（如 .deb 安装后的 /usr/bin/brian）与 macOS（无 readlink -f）。',
    '# ============================================================================',
    'set -e',
    '# 解析脚本真实路径（逐层解析符号链接，兼容 Linux/macOS）',
    'SOURCE="${BASH_SOURCE[0]:-$0}"',
    'while [ -L "$SOURCE" ]; do',
    '  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"',
    '  SOURCE="$(readlink "$SOURCE")"',
    '  case "$SOURCE" in /*) ;; *) SOURCE="$DIR/$SOURCE" ;; esac',
    'done',
    'ROOT="$(cd -P "$(dirname "$SOURCE")" && pwd)"',
    'NODE="$ROOT/bin/node"',
    'SERVER="$ROOT/server/brian-server.cjs"',
    'export BRIAN_PORTABLE=1',
    'export BRIAN_DATA_DIR="${BRIAN_DATA_DIR:-$HOME/.brian-agent}"',
    'export BRIAN_NATIVE_DIR="$ROOT/server/native"',
    'export BRIAN_PORT="${BRIAN_PORT:-8000}"',
    'export BRIAN_HOST="${BRIAN_HOST:-127.0.0.1}"',
    'RUN="$ROOT/run"; LOG="$ROOT/logs/server.log"; PID="$RUN/server.pid"',
    'mkdir -p "$RUN" "$ROOT/logs" "$BRIAN_DATA_DIR"',
    '',
    'is_running() { [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; }',
    '',
    'case "${1:-serve}" in',
    '  serve)',
    '    exec "$NODE" "$SERVER"',
    '    ;;',
    '  start)',
    '    if is_running; then echo "[brian] 已在运行 (PID $(cat "$PID"))"; exit 0; fi',
    '    nohup "$NODE" "$SERVER" >>"$LOG" 2>&1 &',
    '    echo $! > "$PID"',
    '    sleep 1',
    '    if is_running; then echo "[brian] 已启动 (PID $(cat "$PID")) → http://$BRIAN_HOST:$BRIAN_PORT"',
    '    else echo "[brian] 启动失败，查看日志: tail -f $LOG"; exit 1; fi',
    '    ;;',
    '  stop)',
    '    if is_running; then kill "$(cat "$PID")" 2>/dev/null || true; rm -f "$PID"; echo "[brian] 已停止"',
    '    else rm -f "$PID"; echo "[brian] 未在运行"; fi',
    '    ;;',
    '  restart)',
    '    "$0" stop || true; sleep 1; "$0" start',
    '    ;;',
    '  status)',
    '    if is_running; then echo "[brian] 运行中 (PID $(cat "$PID")) → http://$BRIAN_HOST:$BRIAN_PORT"',
    '    else echo "[brian] 未在运行"; exit 1; fi',
    '    ;;',
    '  logs)',
    '    tail -n 200 -f "$LOG"',
    '    ;;',
    '  open)',
    '    URL="http://$BRIAN_HOST:$BRIAN_PORT"',
    '    if command -v xdg-open >/dev/null; then xdg-open "$URL"',
    '    elif command -v open >/dev/null; then open "$URL"',
    '    else echo "$URL"; fi',
    '    ;;',
    '  *)',
    '    echo "用法: $0 {serve|start|stop|restart|status|logs|open}"; exit 1',
    '    ;;',
    'esac',
  ];
  return L.join('\n') + '\n';
}

function brianCmdTemplate() {
  return [
    '@echo off',
    'rem ============================================================',
    'rem brian - Brian-Agent 便携包管理命令 (Windows)',
    'rem 用法: brian.cmd serve | start | stop | status | open',
    'rem ============================================================',
    'setlocal enabledelayedexpansion',
    'set "ROOT=%~dp0"',
    'set "ROOT=%ROOT:~0,-1%"',
    'set "NODE=%ROOT%\\bin\\node.exe"',
    'set "SERVER=%ROOT%\\server\\brian-server.cjs"',
    'set "BRIAN_PORTABLE=1"',
    'if not defined BRIAN_PORT set "BRIAN_PORT=8000"',
    'if not defined BRIAN_HOST set "BRIAN_HOST=127.0.0.1"',
    'set "BRIAN_DATA_DIR=%APPDATA%\\brian-agent"',
    'set "BRIAN_NATIVE_DIR=%ROOT%\\server\\native"',
    'if not exist "%ROOT%\\run" mkdir "%ROOT%\\run"',
    'if not exist "%ROOT%\\logs" mkdir "%ROOT%\\logs"',
    'if not exist "%BRIAN_DATA_DIR%" mkdir "%BRIAN_DATA_DIR%"',
    'set "LOG=%ROOT%\\logs\\server.log"',
    'set "PIDFILE=%ROOT%\\run\\server.pid"',
    '',
    'if /i "%1"=="serve" goto serve',
    'if /i "%1"=="start" goto start',
    'if /i "%1"=="stop" goto stop',
    'if /i "%1"=="status" goto status',
    'if /i "%1"=="" goto serve',
    'if /i "%1"=="open" goto open',
    'echo 用法: brian.cmd {serve^|start^|stop^|status^|open}',
    'exit /b 1',
    '',
    ':serve',
    '"%NODE%" "%SERVER%"',
    'goto :eof',
    '',
    ':start',
    'if exist "%PIDFILE%" (',
    '  echo [brian] 已在运行 (PID ',
    '  type "%PIDFILE%"',
    '  echo )',
    '  exit /b 0',
    ')',
    'powershell -NoProfile -Command "$p = Start-Process -FilePath \'%NODE%\' -ArgumentList \'%SERVER%\' -WorkingDirectory \'%ROOT%\' -WindowStyle Hidden -PassThru -RedirectStandardOutput \'%LOG%\' -RedirectStandardError \'%ROOT%\\logs\\server.err.log\'; Set-Content -Path \'%PIDFILE%\' -Value $p.Id" ',
    'timeout /t 2 /nobreak >nul',
    'if exist "%PIDFILE%" (',
    '  echo [brian] 已启动 → http://%BRIAN_HOST%:%BRIAN_PORT% （日志: %LOG%）',
    ') else (',
    '  echo [brian] 启动失败，查看 %LOG%',
    '  exit /b 1',
    ')',
    'goto :eof',
    '',
    ':stop',
    'if exist "%PIDFILE%" (',
    '  set /p PID=<"%PIDFILE%"',
    '  taskkill /PID !PID! /T /F >nul 2>&1',
    '  del "%PIDFILE%"',
    '  echo [brian] 已停止',
    ') else (',
    '  echo [brian] 未在运行',
    ')',
    'goto :eof',
    '',
    ':status',
    'if exist "%PIDFILE%" (',
    '  set /p PID=<"%PIDFILE%"',
    '  tasklist /FI "PID eq !PID!" | find "!PID!" >nul && (echo [brian] 运行中 (PID !PID!) → http://%BRIAN_HOST%:%BRIAN_PORT%) || (echo [brian] 未在运行)',
    ') else (',
    '  echo [brian] 未在运行',
    ')',
    'goto :eof',
    '',
    ':open',
    'start "" "http://%BRIAN_HOST%:%BRIAN_PORT%"',
    'goto :eof',
  ].join('\r\n') + '\r\n';
}

function readmeTemplate(targetKey) {
  const t = TARGETS[targetKey];
  const win = t.os === 'win32';
  const lines = [
    `Brian-Agent v${VERSION} — ${targetKey} 便携包`,
    '============================================================',
    '',
    '自包含发行包：内置 Node.js 运行时、全部原生依赖与前端资源，',
    '无需安装任何依赖即可运行。',
    '',
    win ? '快速开始（Windows）:' : '快速开始:',
    win
      ? '  1. 双击运行 brian.cmd（或命令行执行 brian.cmd start）'
      : '  1. chmod +x brian.sh bin/node && ./brian.sh start',
    '  2. 浏览器打开 http://127.0.0.1:8000',
    win ? '  停止: brian.cmd stop    日志: logs\\server.log' : '  停止: ./brian.sh stop   日志: ./brian.sh logs',
    '',
    '目录说明:',
    '  bin/        内置 Node.js v' + NODE_VERSION + ' 运行时',
    '  server/     后端服务（brian-server.cjs）与平台原生模块（native/）',
    '  web/        前端页面（由后端同端口服务）',
    '  chrome/     Chrome for Testing（浏览器自动化 CDT 用，首次运行解压）',
    '  (数据)      运行数据默认 ~/.brian-agent（Windows %APPDATA%\\brian-agent），BRIAN_DATA_DIR 可指到任意位置（如 $PWD/data 便携用）',
    '',
    '配置（环境变量）:',
    '  BRIAN_PORT=8000     服务端口',
    '  BRIAN_HOST=127.0.0.1  监听地址（对外服务改为 0.0.0.0）',
    '  BRIAN_DATA_DIR      数据目录（默认 ~/.brian-agent，Windows %APPDATA%\\brian-agent）',
    '',
    'Linux systemd（可选，.deb 安装后同样适用）:',
    '  sudo cp systemd/brian-agent.service /etc/systemd/system/',
    '  sudo systemctl daemon-reload && sudo systemctl enable --now brian-agent',
    '',
  ];
  if (t.os === 'darwin') {
    lines.push(
      'macOS 注意:',
      '  首次运行前如被 Gatekeeper 拦截，执行:',
      '    xattr -dr com.apple.quarantine <包目录>',
      ...(targetKey === 'darwin-x64' ? [
        '  Intel 包说明: 仓库未内置 isolated-vm 预编译二进制，',
        '  .js Skill 沙箱在此包中降级禁用（其余功能完整）。',
      ] : []),
      '',
    );
  }
  if (win) {
    lines.push(
      'Windows 注意:',
      '  首次运行如被 SmartScreen 拦截，选择「仍要运行」即可。',
      '  端口占用检查: netstat -ano | findstr :8000',
      '',
    );
  }
  return lines.join('\n') + '\n';
}

const SYSTEMD_UNIT = `# Brian-Agent systemd 服务单元（可选）
# 安装: sudo cp brian-agent.service /etc/systemd/system/ && sudo systemctl enable --now brian-agent
[Unit]
Description=Brian-Agent intelligent assistant
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/brian-agent
ExecStart=/opt/brian-agent/bin/node /opt/brian-agent/server/brian-server.cjs
Environment=BRIAN_PORTABLE=1
Environment=BRIAN_DATA_DIR=/var/lib/brian-agent
Environment=BRIAN_NATIVE_DIR=/opt/brian-agent/server/native
Environment=BRIAN_PORT=8000
Environment=BRIAN_HOST=127.0.0.1
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

// ---------------------------------------------------------------------------
// 组装单个目标
// ---------------------------------------------------------------------------
async function packTarget(targetKey, bundlePath, seedPath) {
  const t = TARGETS[targetKey];
  const name = `brian-agent-${targetKey}`;
  const pkg = path.join(OUT, name);
  log(`===== 组装 ${targetKey} → ${path.relative(ROOT, pkg)}`);

  fs.rmSync(pkg, { recursive: true, force: true });
  fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(pkg, 'server', 'native', `${t.os}-${t.arch}`), { recursive: true });

  // 1) Node 运行时
  const nodeBin = await fetchNodeBinary(targetKey);
  fs.copyFileSync(nodeBin, path.join(pkg, 'bin', t.os === 'win32' ? 'node.exe' : 'node'));
  if (t.os !== 'win32') fs.chmodSync(path.join(pkg, 'bin', 'node'), 0o755);

  // 2) 后端 bundle + 便携标记 + package.json 存根
  //    存根是给 better-sqlite3 内部的 bindings() 定位模块根用的：
  //    bindings 从 bundle 所在目录向上找 package.json，找不到会直接抛错
  //    （发生在 require 解析之前，原生加载钩子无法拦截）。
  fs.mkdirSync(path.join(pkg, 'server'), { recursive: true });
  fs.copyFileSync(bundlePath, path.join(pkg, 'server', 'brian-server.cjs'));
  fs.writeFileSync(path.join(pkg, 'server', 'portable.marker'), JSON.stringify({ version: VERSION, target: targetKey, nodeABI: NODE_ABI }));
  fs.writeFileSync(path.join(pkg, 'server', 'package.json'), JSON.stringify({
    name: 'brian-server', version: VERSION, private: true, main: 'brian-server.cjs',
  }, null, 2) + '\n');

  // 3) 原生模块
  //    - native/<plat>-<arch>/：统一目录，加载钩子（chatStreamEvents 同款 Module._resolveFilename 重定向）
  //      与 vendored isolated-vm.js 的 BRIAN_NATIVE_DIR 查找都从这里取；
  //    - build/Release/：better-sqlite3 的 bindings() 默认查找路径（模块根 = server/）。
  const natives = await resolveNatives(targetKey);
  const nativeDir = path.join(pkg, 'server', 'native', `${t.os}-${t.arch}`);
  for (const [fileName, src] of Object.entries(natives)) {
    if (!src) continue;
    fs.copyFileSync(src, path.join(nativeDir, fileName));
  }
  if (natives['better_sqlite3.node']) {
    fs.mkdirSync(path.join(pkg, 'server', 'build', 'Release'), { recursive: true });
    fs.copyFileSync(natives['better_sqlite3.node'], path.join(pkg, 'server', 'build', 'Release', 'better_sqlite3.node'));
  }

  // 4) 前端静态资源
  const webDist = path.join(ROOT, 'brian-frontend', 'dist');
  if (!fs.existsSync(path.join(webDist, 'index.html'))) die('前端 dist 不存在，先执行 npm run build:frontend');
  fs.cpSync(webDist, path.join(pkg, 'web'), { recursive: true });

  // 5) 系统数据种子
  if (seedPath) {
    fs.mkdirSync(path.join(pkg, 'server', 'seed'), { recursive: true });
    fs.copyFileSync(seedPath, path.join(pkg, 'server', 'seed', 'system-seed.json'));
  }

  // 6) Chromium
  const chromeZip = await fetchChromium(targetKey);
  if (chromeZip) {
    fs.mkdirSync(path.join(pkg, 'chrome'), { recursive: true });
    fs.copyFileSync(chromeZip, path.join(pkg, 'chrome', 'chrome.zip'));
  }

  // 7) systemd 单元（非 Windows）
  if (t.os !== 'win32') {
    fs.mkdirSync(path.join(pkg, 'systemd'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'systemd', 'brian-agent.service'), SYSTEMD_UNIT);
  }

  // 8) 启动器与 README
  if (t.os === 'win32') {
    fs.writeFileSync(path.join(pkg, 'brian.cmd'), brianCmdTemplate());
  } else {
    fs.writeFileSync(path.join(pkg, 'brian.sh'), brianShTemplate());
    fs.chmodSync(path.join(pkg, 'brian.sh'), 0o755);
  }
  fs.writeFileSync(path.join(pkg, 'README.txt'), readmeTemplate(targetKey));

  // 9) 归档
  fs.mkdirSync(OUT, { recursive: true });
  if (t.archive === 'tar.gz') {
    const out = path.join(OUT, `${name}.tar.gz`);
    run(`tar -czf "${out}" -C "${OUT}" "${name}"`);
    log(`归档: ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
  } else {
    const out = path.join(OUT, `${name}.zip`);
    const zip = new AdmZip();
    zip.addLocalFolder(pkg, name);
    zip.writeZip(out);
    log(`归档: ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB)`);
  }
  return pkg;
}

// ---------------------------------------------------------------------------
// Linux .deb
// ---------------------------------------------------------------------------
function buildDeb(linuxPkg) {
  if (!fs.existsSync('/usr/bin/dpkg-deb') && spawnSync('dpkg-deb', ['--version']).status !== 0) {
    warn('dpkg-deb 不可用，跳过 .deb 构建（可使用 tar.gz 包）');
    return null;
  }
  const staging = path.join(OUT, 'deb-staging');
  fs.rmSync(staging, { recursive: true, force: true });
  const opt = path.join(staging, 'opt', 'brian-agent');
  fs.mkdirSync(path.join(staging, 'DEBIAN'), { recursive: true });
  fs.cpSync(linuxPkg, opt, { recursive: true });

  // /usr/bin/brian 符号链接
  fs.mkdirSync(path.join(staging, 'usr', 'bin'), { recursive: true });
  fs.symlinkSync('/opt/brian-agent/brian.sh', path.join(staging, 'usr', 'bin', 'brian'));

  // 目录大小（KB）
  let size = 0;
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) walk(p);
      else size += st.size;
    }
  };
  walk(staging);

  fs.writeFileSync(path.join(staging, 'DEBIAN', 'control'), [
    'Package: brian-agent',
    `Version: ${VERSION}`,
    'Section: web',
    'Priority: optional',
    'Architecture: amd64',
    `Installed-Size: ${Math.ceil(size / 1024)}`,
    'Depends: libc6 (>= 2.28)',
    'Maintainer: Brian-Agent Team <brian@brian-agent.local>',
    'Description: Brian-Agent 智能个人助手（自包含便携服务）',
    ' 内置 Node.js 运行时与全部原生依赖，安装后通过 brian 命令管理，',
    ' Web 界面默认 http://127.0.0.1:8000，数据位于 /opt/brian-agent/data。',
  ].join('\n') + '\n');

  fs.writeFileSync(path.join(staging, 'DEBIAN', 'postinst'), [
    '#!/bin/sh',
    'set -e',
    'chmod +x /opt/brian-agent/brian.sh /opt/brian-agent/bin/node 2>/dev/null || true',
    'mkdir -p /var/lib/brian-agent && chmod 755 /var/lib/brian-agent',
    'echo "brian-agent 已安装。运行: sudo systemctl enable --now brian-agent（需先复制 service 文件）"',
    'echo "或直接执行: /opt/brian-agent/brian.sh start   界面: http://127.0.0.1:8000"',
    'exit 0',
  ].join('\n') + '\n');
  fs.chmodSync(path.join(staging, 'DEBIAN', 'postinst'), 0o755);

  fs.writeFileSync(path.join(staging, 'DEBIAN', 'prerm'), [
    '#!/bin/sh',
    'set -e',
    '/opt/brian-agent/brian.sh stop >/dev/null 2>&1 || true',
    'exit 0',
  ].join('\n') + '\n');
  fs.chmodSync(path.join(staging, 'DEBIAN', 'prerm'), 0o755);

  const debPath = path.join(OUT, `brian-agent_${VERSION}_amd64.deb`);
  run(`dpkg-deb --build --root-owner-group "${staging}" "${debPath}"`);
  fs.rmSync(staging, { recursive: true, force: true });
  log(`deb: ${debPath} (${(fs.statSync(debPath).size / 1024 / 1024).toFixed(1)} MB)`);
  return debPath;
}

// ---------------------------------------------------------------------------
// npm 全局分发包生成（dist-pack/npm/，可直接 npm publish）
// ---------------------------------------------------------------------------
function genNpmPackage() {
  const src = path.join(__dirname, 'npm');
  const out = path.join(OUT, 'npm');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const name of ['package.json', 'cli.js', 'install.js', 'README.md']) {
    let text = fs.readFileSync(path.join(src, name), 'utf8');
    text = text
      .replaceAll('__BRIAN_VERSION__', VERSION)
      .replaceAll('__BRIAN_REPO__', NPM_REPO);
    fs.writeFileSync(path.join(out, name), text);
  }
  log(`npm 包已生成: ${out}（发布: cd dist-pack/npm && npm publish；需先创建 GitHub Release v${VERSION} 并上传 4 个平台压缩包）`);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main() {
  if (NODE_MAJOR !== 22 || NODE_ABI !== '127') {
    die(`请在 Node 22 (ABI 127) 环境构建：当前 ${NODE_VERSION} (ABI ${NODE_ABI})。prebuilt 原生二进制为 node127。`);
  }
  const targets = onlyTargets
    ? (onlyTargets.every((t) => TARGETS[t]) ? onlyTargets : die(`未知目标: ${onlyTargets.join(',')}（可选: ${Object.keys(TARGETS).join(', ')}）`))
    : Object.keys(TARGETS);

  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(CACHE, { recursive: true });

  buildFrontend();

  // 系统数据种子（通用目录数据：模型提供商列表 / MCP 提供商列表）
  let seedPath = null;
  if (!NO_SYSTEM_DATA) {
    seedPath = path.join(OUT, 'system-seed.json');
    run(`node packaging/export-system-data.mjs --out "${seedPath}"`);
    if (!fs.existsSync(seedPath)) {
      warn('系统数据导出未产生文件（构建机库不存在或为空），包内将不含种子');
      seedPath = null;
    }
  }

  const bundlePath = await buildBundle();

  let linuxPkg = null;
  for (const targetKey of targets) {
    const pkg = await packTarget(targetKey, bundlePath, seedPath);
    if (targetKey === 'linux-x64') linuxPkg = pkg;
  }

  if (linuxPkg && !onlyTargets) {
    buildDeb(linuxPkg);
  } else if (linuxPkg && onlyTargets) {
    log('指定了 --only，跳过 .deb 构建');
  }

  // npm 全局分发包（bin brian；postinstall 按 Release 下载平台产物）
  if (!NO_NPM) {
    genNpmPackage();
  }

  log('✅ 全部完成。产物位于 dist-pack/：');
  for (const f of fs.readdirSync(OUT)) {
    const st = fs.statSync(path.join(OUT, f));
    if (st.isFile()) log(`  ${f} (${(st.size / 1024 / 1024).toFixed(1)} MB)`);
  }
}

main().catch((err) => {
  console.error('[pack] 失败:', err);
  process.exit(1);
});
