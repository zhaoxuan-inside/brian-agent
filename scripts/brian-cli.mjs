#!/usr/bin/env node
/**
 * brian — Brian-Agent 系统管理 CLI（跨平台统一实现，Linux / macOS / Windows）。
 *
 * bash 的 `brian` 与 Windows 的 `brian.cmd` 都是本脚本的薄壳。
 * 功能与原 bash 版对齐：start/stop/restart/status/logs/serve/dev/open/doctor/clean。
 * 依赖：仅 Node 内置模块 —— doctor/clean 在未安装依赖时也能运行。
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BACKEND_DIR = path.join(ROOT, 'brian-backend')
const FRONTEND_DIR = path.join(ROOT, 'brian-frontend')
const BACKEND_PORT = process.env.BRIAN_PORT || '8000'
const FRONTEND_PORT = '5173'
const IS_WIN = process.platform === 'win32'
const TMP = os.tmpdir()
const BACKEND_LOG = path.join(TMP, 'brian-backend.log')
const FRONTEND_LOG = path.join(TMP, 'brian-frontend.log')
const BACKEND_PID_FILE = path.join(TMP, 'brian-backend.pid')
const FRONTEND_PID_FILE = path.join(TMP, 'brian-frontend.pid')
const VERSION = readJsonSafe(path.join(ROOT, 'package.json'))?.version ?? '1.0.0'

// ── 输出工具 ──────────────────────────────────────────────────

const C = {
  blue: (s) => `\x1b[34m[brian]\x1b[0m ${s}`,
  ok: (s) => `       \x1b[32m✓\x1b[0m ${s}`,
  warn: (s) => `       \x1b[33m⚠\x1b[0m ${s}`,
  fail: (s) => `       \x1b[31m✗\x1b[0m ${s}`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
}
const log = (s) => console.log(C.blue(s))
const ok = (s) => console.log(C.ok(s))
const warn = (s) => console.log(C.warn(s))
const fail = (s) => console.log(C.fail(s))
const banner = () => {
  console.log(`\n  \x1b[1mBrian-Agent\x1b[0m  v${VERSION}`)
  console.log('  Intelligent Personal Assistant\n')
}

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

function expectedNode() {
  try { return fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim() || '22.x' } catch { return '22.x' }
}

// ── 进程与端口 ────────────────────────────────────────────────

function readPid(file) {
  try { return Number(fs.readFileSync(file, 'utf8').trim()) || 0 } catch { return 0 }
}

function pidAlive(pid) {
  if (!pid) return false
  if (IS_WIN) {
    const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { shell: true, encoding: 'utf8' })
    return String(r.stdout ?? '').includes(String(pid))
  }
  try { process.kill(pid, 0); return true } catch { return false }
}

/** 占用端口的 PID（lsof / netstat） */
function portPid(port) {
  try {
    if (IS_WIN) {
      const r = spawnSync('netstat', ['-ano'], { shell: true, encoding: 'utf8' })
      const line = String(r.stdout ?? '').split('\n')
        .find((l) => l.includes(`:${port} `) && l.toUpperCase().includes('LISTENING'))
      return Number(line?.trim().split(/\s+/).pop()) || 0
    }
    const r = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' })
    return Number(String(r.stdout ?? '').trim().split('\n')[0]) || 0
  } catch { return 0 }
}

function portAlive(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ port: Number(port), host: '127.0.0.1' })
    sock.once('connect', () => { sock.destroy(); resolve(true) })
    sock.once('error', () => resolve(false))
  })
}

function killPid(pid, { group = false } = {}) {
  if (!pid) return
  try {
    if (IS_WIN) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { shell: true })
      return
    }
    // detached 启动的子进程自成进程组，负值 PID 连组一起杀
    if (group) process.kill(-pid, 'SIGTERM')
    else process.kill(pid, 'SIGTERM')
  } catch { /* 进程已退出 */ }
  const deadline = Date.now() + 3000
  while (pidAlive(pid) && Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100)
  }
  try { if (group) process.kill(-pid, 'SIGKILL'); else process.kill(pid, 'SIGKILL') } catch { /* 已退出 */ }
}

// ── 环境守卫（与 bash 版 env_preflight 对齐） ─────────────────

function requireNode22() {
  const expected = expectedNode()
  const wantMajor = Number(expected.split('.')[0])
  const gotMajor = Number(process.versions.node.split('.')[0])
  const problems = []
  if (!commandExists('npm')) {
    problems.push(['npm 不可用', `请先安装 Node ${expected}（nvm/mise/fnm 均可）`])
    return { problems, expected }
  }
  if (gotMajor !== wantMajor) {
    problems.push([
      `Node 版本不符: v${process.versions.node}，项目要求 Node ${expected}（.nvmrc，prebuilt 仅含对应 ABI 的原生模块）`,
      `切换后重新安装依赖: nvm install ${expected} && nvm use ${expected} && npm install；或 mise use node@${expected} / fnm use`,
    ])
    if (commandExists('mise') && fs.existsSync(path.join(ROOT, 'mise.toml'))) {
      const userInstall = path.join(os.homedir(), '.local/share/mise/installs/node', expected)
      if (!fs.existsSync(userInstall)) {
        problems.push([`mise.toml 要求 Node ${expected}，但用户身份的 mise 未安装该版本（可能曾用 sudo 安装）`,
          `修复: sudo chown $USER:$USER mise.toml 2>/dev/null; mise install; exec zsh`])
      } else if (!isWritable(path.join(ROOT, 'mise.toml'))) {
        problems.push(['mise.toml 归 root 所有（曾用 sudo 创建）', 'sudo chown $USER:$USER mise.toml'])
      }
    }
  }
  return { problems, expected }
}

function isWritable(p) {
  try { fs.accessSync(p, fs.constants.W_OK); return true } catch { return false }
}

function commandExists(cmd) {
  const r = IS_WIN
    ? spawnSync('where', [cmd], { shell: true, encoding: 'utf8' })
    : spawnSync('which', [cmd], { encoding: 'utf8' })
  return r.status === 0
}

function betterSqlite3Loads() {
  // 在后端目录用当前 Node 实际加载，同时校验解析位置、绑定存在与 ABI 匹配
  const r = spawnSync(process.execPath, ['-e', "require('better-sqlite3')"], {
    cwd: BACKEND_DIR, encoding: 'utf8', shell: false,
  })
  return r.status === 0
}

function envPreflight() {
  const { problems } = requireNode22()
  if (problems.length) {
    for (const [msg, hint] of problems) { fail(msg); console.log(`       ${C.dim('→ ' + hint)}`) }
    process.exit(1)
  }
  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    fail('依赖未安装: 根 node_modules 不存在 —— 请先运行 npm install')
    process.exit(1)
  }
  if (!betterSqlite3Loads()) {
    fail('原生绑定不可用: better-sqlite3 加载失败（通常是绑定缺失/位置不对/Node 版本不符）')
    console.log(`       ${C.dim(`→ 切换到 Node ${expectedNode()} 后重装: rm -rf node_modules && npm install`)}`)
    console.log(`       ${C.dim('→ 自检: ./brian doctor')}`)
    process.exit(1)
  }
  const tsxBin = path.join(ROOT, 'node_modules', '.bin', IS_WIN ? 'tsx.cmd' : 'tsx')
  if (!fs.existsSync(tsxBin)) {
    warn('tsx 不可用（启动时会尝试 npx 在线临时安装）；如离线环境请先: npm install')
  }
}

// ── 启动 / 停止 ───────────────────────────────────────────────

function openLogFile(file) {
  return fs.openSync(file, 'a')
}

function spawnDetached(cmd, args, cwd, logFile, extraEnv = {}) {
  const out = openLogFile(logFile)
  const child = spawn(cmd, args, {
    cwd,
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, BRIAN_CDT_AUTO: process.env.BRIAN_CDT_AUTO || '0', ...extraEnv },
    shell: IS_WIN,
  })
  fs.closeSync(out)
  child.unref()
  return child.pid
}

async function waitPort(port, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portAlive(port)) return true
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000)
  }
  return false
}

function killByPort(port) {
  const pid = portPid(port)
  if (pid && pid !== process.pid) killPid(pid)
}

function serviceAlive(pidFile, port) {
  const pid = readPid(pidFile)
  return Boolean(pid && pidAlive(pid)) || Boolean(portPid(port))
}

async function startService(name) {
  const isBackend = name === 'backend'
  const pidFile = isBackend ? BACKEND_PID_FILE : FRONTEND_PID_FILE
  const logFile = isBackend ? BACKEND_LOG : FRONTEND_LOG
  const port = isBackend ? BACKEND_PORT : FRONTEND_PORT
  if (serviceAlive(pidFile, port)) {
    ok(`${name} 已运行 (端口 ${port}, PID ${readPid(pidFile) || portPid(port)})`)
    return true
  }
  killByPort(port)
  await sleep(500)

  log(`启动 ${name}...`)
  if (isBackend && !fs.existsSync(BACKEND_DIR)) { fail(`后端目录不存在: ${BACKEND_DIR}`); process.exit(1) }
  const pid = isBackend
    ? spawnDetached('npx', ['tsx', 'dev-server.ts'], BACKEND_DIR, logFile)
    : spawnDetached('npx', ['vite', '--host', '0.0.0.0'], FRONTEND_DIR, logFile)
  fs.writeFileSync(pidFile, String(pid))

  const ready = await waitPort(port)
  if (!ready) {
    fail(`${name} 进程启动失败，查看日志: node scripts/brian-cli.mjs logs ${name}（或 ./brian logs ${name}）`)
    return false
  }
  ok(`${name} 就绪 (端口 ${port}, PID ${pid})`)
  return true
}

function stopService(name) {
  const isBackend = name === 'backend'
  const pidFile = isBackend ? BACKEND_PID_FILE : FRONTEND_PID_FILE
  const port = isBackend ? BACKEND_PORT : FRONTEND_PORT
  const pid = readPid(pidFile)
  if (!pid && !portPid(port)) { ok(`${name} 未运行`); return }
  log(`停止 ${name} (PID ${pid || portPid(port)})...`)
  if (pid) killPid(pid, { group: !IS_WIN })
  killByPort(port)
  try { fs.unlinkSync(pidFile) } catch { /* 不存在 */ }
  ok(`${name} 已停止`)
}

async function showStatus() {
  for (const [name, pidFile, port, url] of [
    ['后端', BACKEND_PID_FILE, BACKEND_PORT, `http://127.0.0.1:${BACKEND_PORT}`],
    ['前端', FRONTEND_PID_FILE, FRONTEND_PORT, `http://127.0.0.1:${FRONTEND_PORT}`],
  ]) {
    const alive = serviceAlive(pidFile, port)
    const pid = readPid(pidFile) || portPid(port)
    console.log(`  ${name.padEnd(4)} ${alive ? `\x1b[32m运行中\x1b[0m PID ${pid}  ${url}` : C.dim('未运行  端口 ' + port + ' 空闲')}`)
  }
}

// ── logs / open ───────────────────────────────────────────────

function tailFile(file, posRef) {
  try {
    const size = fs.statSync(file).size
    if (size < posRef.pos) posRef.pos = 0 // 日志被清理/轮转
    if (size === posRef.pos) return
    const fd = fs.openSync(file, 'r')
    const buf = Buffer.alloc(size - posRef.pos)
    fs.readSync(fd, buf, 0, buf.length, posRef.pos)
    fs.closeSync(fd)
    posRef.pos = size
    process.stdout.write(buf.toString('utf8'))
  } catch { /* 文件尚未创建，继续等待 */ }
}

function followLogs(name) {
  const file = name === 'frontend' ? FRONTEND_LOG : BACKEND_LOG
  console.log(C.dim(`跟踪 ${file}（Ctrl+C 退出）`))
  const posRef = { pos: 0 }
  tailFile(file, posRef)
  setInterval(() => tailFile(file, posRef), 1000)
}

function openBrowser() {
  const url = `http://127.0.0.1:${FRONTEND_PORT}`
  const [cmd, args] = IS_WIN ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]]
  try { spawn(cmd, args, { detached: true, stdio: 'ignore', shell: IS_WIN }).unref(); ok(`浏览器打开 ${url}`) }
  catch { warn(`请手动打开 ${url}`) }
}

// ── doctor ────────────────────────────────────────────────────

async function doctor() {
  banner()
  log('环境与依赖自检')
  let problems = 0
  const mark = (good, msg) => { good ? ok(msg) : (fail(msg), problems++) }

  console.log('')
  console.log('  \x1b[1m基础环境\x1b[0m')
  const expected = expectedNode()
  for (const c of ['node', 'npm', 'npx']) mark(commandExists(c), `${c}: 可用`)
  const { problems: nodeProblems } = requireNode22()
  if (nodeProblems.length === 0) ok(`Node 版本: v${process.versions.node}（符合要求 Node ${expected}）`)
  else for (const [msg, hint] of nodeProblems) { fail(msg); console.log(`       ${C.dim('→ ' + hint)}`); problems++ }

  console.log('')
  console.log('  \x1b[1m项目目录\x1b[0m')
  mark(fs.existsSync(BACKEND_DIR), `后端目录存在: ${BACKEND_DIR}`)
  mark(fs.existsSync(FRONTEND_DIR), `前端目录存在: ${FRONTEND_DIR}`)
  mark(fs.existsSync(path.join(ROOT, 'node_modules')), '根 node_modules 存在')
  if (!fs.existsSync(path.join(ROOT, 'data'))) warn('数据目录缺失，首次启动会自动生成')

  console.log('')
  console.log('  \x1b[1m端口占用\x1b[0m')
  for (const [name, port] of [['后端端口', BACKEND_PORT], ['前端端口', FRONTEND_PORT]]) {
    const alive = await portAlive(port)
    ok(alive ? `${name} ${port} 正在服务（已运行）` : `${name} ${port} 空闲`)
  }

  console.log('')
  console.log('  \x1b[1m原生依赖 (prebuilt)\x1b[0m')
  const platformDir = `${process.platform}-${process.arch}`
  for (const m of ['better-sqlite3', 'isolated-vm', 'lancedb']) {
    mark(fs.existsSync(path.join(ROOT, 'brian-backend', 'prebuilt', m)), `prebuilt/${m} 存在`)
  }
  const abiDir = `node${process.versions.modules}`
  const hasAbi = fs.existsSync(path.join(ROOT, 'brian-backend', 'prebuilt', 'better-sqlite3', platformDir, abiDir))
  if (betterSqlite3Loads()) ok(`better-sqlite3 绑定已就位且可加载（ABI ${process.versions.modules}）`)
  else if (hasAbi) { warn('prebuilt 含当前 ABI 但绑定未拷贝 → 运行 npm install（postinstall 自动拷贝）'); problems++ }
  else { fail(`better-sqlite3 缺少 ABI ${process.versions.modules} 的预编译件（平台目录: ${platformDir}）→ 切换 Node ${expected} 后 npm install`); problems++ }

  console.log('')
  if (problems > 0) warn('环境未就绪，按上方提示处理后重试')
  else ok('环境全部就绪')
}

// ── clean ─────────────────────────────────────────────────────

function clean(all) {
  let n = 0
  for (const f of [BACKEND_LOG, FRONTEND_LOG, BACKEND_PID_FILE, FRONTEND_PID_FILE]) {
    try { fs.unlinkSync(f); n++ } catch { /* 不存在 */ }
  }
  ok(`已清理 ${n} 个日志/PID 文件`)
  if (!all) return

  log('深度清理（--all）：node_modules / 构建产物 / 就位的原生绑定')
  const targets = [
    'node_modules',
    'shared/node_modules', 'shared/dist',
    'brian-frontend/node_modules', 'brian-frontend/dist',
    'brian-backend/Base/node_modules', 'brian-backend/Base/dist',
    'brian-backend/Core/node_modules', 'brian-backend/Core/dist',
    'brian-backend/Agent/node_modules', 'brian-backend/Agent/dist',
    'brian-backend/Runtime/node_modules', 'brian-backend/Runtime/dist',
    'brian-backend/Application/node_modules', 'brian-backend/Application/dist',
    'brian-backend/Base/SkillProvider/infrastructure/sandbox/vendor/isolated-vm/out',
  ]
  for (const t of targets) {
    const p = path.join(ROOT, t)
    if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); ok(`已移除 ${t}`) }
  }
  warn('数据目录未动（brian-backend/data，含对话与配置）；如需彻底重置请手动删除')
  ok('深度清理完成 → 从头验证: npm install && ./brian doctor && ./brian start')
}

// ── serve / dev（前台） ────────────────────────────────────────

function runForeground(cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, BRIAN_CDT_AUTO: process.env.BRIAN_CDT_AUTO || '0' }, shell: IS_WIN })
  const stop = () => { try { killPid(child.pid, { group: !IS_WIN }) } catch { /* 退出中 */ } }
  process.on('SIGINT', () => { stop(); process.exit(0) })
  process.on('SIGTERM', () => { stop(); process.exit(0) })
  child.on('exit', (code) => process.exit(code ?? 0))
}

function usage() {
  console.log(`
用法: brian <command> [service] [flags]

命令:
  start [backend|frontend|all]  后台启动服务（默认 all）
  stop [backend|frontend|all]   停止服务（默认 all）
  restart [backend|frontend|all] 重启服务
  status                        查看运行状态
  logs [backend|frontend]       跟踪日志（默认 backend）
  serve                         前台启动后端服务（Ctrl+C 停止）
  dev                           前台启动全栈开发模式
  open                          在默认浏览器打开前端页面
  doctor                        环境与依赖自检
  clean [--all]                 清理日志与 PID；--all 深度清理依赖与构建产物

全局参数: -h/--help  -v/--version
`)
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

// ── 命令调度 ──────────────────────────────────────────────────

const [, , cmd = 'status', svc = 'all'] = process.argv
const arg = (svc === 'all' || svc === 'backend' || svc === 'frontend') ? svc : 'all'

async function main() {
  if (cmd === '-h' || cmd === '--help' || cmd === 'help') { usage(); return }
  if (cmd === '-v' || cmd === '--version' || cmd === 'version') { console.log(`Brian-Agent v${VERSION}`); return }

  switch (cmd) {
    case 'start':
      banner()
      envPreflight()
      if (arg === 'backend') await startService('backend')
      else if (arg === 'frontend') await startService('frontend')
      else { await startService('backend'); console.log(''); await startService('frontend') }
      break
    case 'stop':
      if (arg === 'backend') stopService('backend')
      else if (arg === 'frontend') stopService('frontend')
      else { stopService('backend'); stopService('frontend') }
      break
    case 'restart':
      if (arg === 'backend') { stopService('backend'); await sleep(1000); banner(); envPreflight(); await startService('backend') }
      else if (arg === 'frontend') { stopService('frontend'); await sleep(1000); await startService('frontend') }
      else { stopService('backend'); stopService('frontend'); await sleep(1000); banner(); envPreflight(); await startService('backend'); console.log(''); await startService('frontend') }
      break
    case 'status': await showStatus(); break
    case 'logs': followLogs(arg === 'frontend' ? 'frontend' : 'backend'); break
    case 'serve': envPreflight(); runForeground('npx', ['tsx', 'dev-server.ts'], BACKEND_DIR); break
    case 'dev': envPreflight(); runForeground('npx', ['vite', '--host', '0.0.0.0'], FRONTEND_DIR); break
    case 'open': openBrowser(); break
    case 'doctor': await doctor(); break
    case 'clean': clean(svc === '--all'); break
    default: usage(); break
  }
}

main().catch((e) => { fail(String(e?.message ?? e)); process.exit(1) })
