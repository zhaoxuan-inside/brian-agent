import { execFileSync, execSync } from 'child_process';
import { existsSync } from 'fs';

export interface SandboxRuntime {
  
  python: string;
  
  bash: string;
  
  pythonVersion: string;
  bashVersion: string;
}

interface InterpreterCandidate {
  prefix: string;
  fromPath?: boolean;
}

export class SandboxRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxRuntimeError';
  }
}

export function pythonCandidates(platform: string, env: NodeJS.ProcessEnv): InterpreterCandidate[] {
  const override = env.BRIAN_SANDBOX_PYTHON?.trim();
  if (override) {
    return [{ prefix: quoteIfNeeded(override) }];
  }
  if (platform === 'win32') {
    return [{ prefix: 'py -3' }, { prefix: 'python', fromPath: true }];
  }
  return [{ prefix: 'python3', fromPath: true }];
}

export function bashCandidates(platform: string, env: NodeJS.ProcessEnv, extra: InterpreterCandidate[] = []): InterpreterCandidate[] {
  const override = env.BRIAN_SANDBOX_BASH?.trim();
  if (override) {
    return [{ prefix: quoteIfNeeded(override) }];
  }
  if (platform === 'win32') {
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      joinAppDataGitBash(env),
    ].filter((p) => p.length > 0);
    return [
      ...gitBashPaths.map((p) => ({ prefix: quoteIfNeeded(p) })),
      // 固定安装点未命中时,由本机 git.exe / GitForWindows 注册表推导的候选
      // (Git 安装在自定义盘符/中文目录是常见部署形态,固定路径与 PATH 均覆盖不到)
      ...extra,
      { prefix: 'bash', fromPath: true },
    ];
  }
  return [{ prefix: 'bash', fromPath: true }];
}

/**
 * 由本机 git.exe 绝对路径推导 Git for Windows 的 bash.exe 候选(纯函数,无 I/O):
 * 沿祖先目录探测 <A>\bin\bash.exe 与 <A>\usr\bin\bash.exe,
 * 覆盖 cmd\、mingw64\bin\、usr\bin\ 等标准布局。
 */
export function deriveBashCandidatesFromGitPaths(gitPaths: string[]): string[] {
  const out: string[] = [];
  const push = (p: string) => { if (p && !out.includes(p)) out.push(p); };
  for (const gitPath of gitPaths) {
    const normalized = gitPath.replace(/\//g, '\\');
    if (!/\\git\.exe$/i.test(normalized)) continue;
    let dir = normalized.replace(/\\[^\\]+$/, '');
    for (let depth = 0; depth < 5 && dir.includes('\\'); depth++) {
      push(`${dir}\\bin\\bash.exe`);
      push(`${dir}\\usr\\bin\\bash.exe`);
      dir = dir.replace(/\\[^\\]+$/, '');
    }
  }
  return out;
}

/**
 * Windows 动态发现 bash(固定路径之外的兜底):
 * 1) 纯 JS 扫描 PATH 上的 git.exe(避免 where 的控制台编码问题,中文目录安全);
 * 2) 由 git.exe 位置推导 bash 并以 existsSync 预筛;
 * 3) 一无所获时再读 GitForWindows 注册表(PowerShell 强制 UTF-8 输出,防中文路径乱码)。
 */
export function discoverWindowsBashExtras(env: NodeJS.ProcessEnv): InterpreterCandidate[] {
  const candidates: string[] = [];
  const pushIfMissing = (p: string) => { if (p && existsSync(p) && !candidates.includes(p)) candidates.push(p); };

  for (const gitPath of findOnPathFs('git', env)) {
    for (const bashPath of deriveBashCandidatesFromGitPaths([gitPath])) pushIfMissing(bashPath);
  }
  if (candidates.length === 0) {
    for (const installRoot of readGitForWindowsInstallPaths()) {
      pushIfMissing(`${installRoot}\\bin\\bash.exe`);
      pushIfMissing(`${installRoot}\\usr\\bin\\bash.exe`);
    }
  }
  return candidates.map((p) => ({ prefix: quoteIfNeeded(p) }));
}

/** 纯 JS 的 PATH 可执行文件搜索(返回全部命中,不经控制台,中文路径安全) */
function findOnPathFs(name: string, env: NodeJS.ProcessEnv): string[] {
  const hits: string[] = [];
  const pathVar = env.PATH ?? env.Path ?? '';
  const pathExt = (env.PATHEXT ?? '.exe').split(';').map((e) => e.trim()).filter(Boolean);
  for (const rawDir of pathVar.split(';')) {
    const dir = rawDir.trim().replace(/^"|"$/g, '');
    if (!dir) continue;
    for (const ext of pathExt) {
      const candidate = `${dir.replace(/[\\/]+$/, '')}\\${name}${ext}`;
      try {
        if (existsSync(candidate)) { hits.push(candidate); break; }
      } catch { /* 无效目录 */ }
    }
  }
  return hits;
}

/** GitForWindows 注册表 InstallPath(HKLM/HKCU);PowerShell 输出强制 UTF-8,中文安装路径安全 */
function readGitForWindowsInstallPaths(): string[] {
  const out: string[] = [];
  for (const hive of ['HKLM', 'HKCU']) {
    try {
      const raw = execSync(
        `powershell.exe -NoProfile -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; (Get-ItemProperty '${hive}:\\SOFTWARE\\GitForWindows' -ErrorAction Stop).InstallPath"`,
        { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      );
      const value = String(raw).trim().split('\n')[0]?.trim() ?? '';
      if (/^[a-zA-Z]:\\/.test(value) && !value.includes('\uFFFD')) out.push(value.replace(/[\\/]+$/, ''));
    } catch { /* 键不存在或读取失败 */ }
  }
  return out;
}

export function isWslBashShim(absolutePath: string): boolean {
  const normalized = absolutePath.toLowerCase().replace(/\//g, '\\');
  return normalized.endsWith('\\windows\\system32\\bash.exe');
}

function joinAppDataGitBash(env: NodeJS.ProcessEnv): string {
  const localAppData = env.LOCALAPPDATA?.trim();
  return localAppData ? `${localAppData}\\Programs\\Git\\bin\\bash.exe` : '';
}

function quoteIfNeeded(cmd: string): string {
  return /\s/.test(cmd) ? `"${cmd}"` : cmd;
}

export function resolveSandboxRuntime(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): SandboxRuntime {
  const python = resolveInterpreter(pythonCandidates(platform, env), 'Python 3', platform);
  const bashExtras = platform === 'win32' ? discoverWindowsBashExtras(env) : [];
  const bash = resolveInterpreter(bashCandidates(platform, env, bashExtras), 'Bash', platform);
  return {
    python: python.prefix,
    bash: bash.prefix,
    pythonVersion: python.version,
    bashVersion: bash.version,
  };
}

function validateCandidate(candidate: InterpreterCandidate, kind: 'Python 3' | 'Bash', platform: string): { prefix: string; version: string } | null {
  let absolutePath = '';
  if (candidate.fromPath) {
    absolutePath = locateOnPath(candidate.prefix.split(' ')[0], platform);
    if (platform === 'win32' && kind === 'Bash' && absolutePath && isWslBashShim(absolutePath)) {
      return null;
    }
  }
  try {
    const [file, args] = splitCommandPrefix(candidate.prefix, '--version');
    const raw = execFileSync(file, args, { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const version = String(raw).trim().split('\n')[0] ?? '';
    if (kind === 'Python 3' && !/^Python 3\.\d+/.test(version)) {
      return null;
    }
    if (kind === 'Bash' && !/bash/i.test(version)) {
      return null;
    }
    return { prefix: candidate.prefix, version };
  } catch {
    return null;
  }
}

/**
 * 将候选前缀拆分为 [程序, 参数] 供 execFileSync 使用(不经 cmd.exe,规避引号/空格解析坑——
 * 如 "py -3" 与含空格安装路径在 cmd 下无法执行):
 * 带引号且引号内含路径分隔符 → 引号内为程序文件,其后按空白切参;
 * 其余(裸命令或"命令 + 参数") → 按空白切分,首个 token 为程序。
 */
function splitCommandPrefix(prefix: string, extraArg: string): [string, string[]] {
  const trimmed = prefix.trim();
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    if (end > 0) {
      const program = trimmed.slice(1, end);
      if (/[\\/]/.test(program)) {
        const args = trimmed.slice(end + 1).trim().split(/\s+/).filter(Boolean);
        return [program, [...args, extraArg]];
      }
    }
  }
  const tokens = trimmed.replace(/"/g, '').split(/\s+/).filter(Boolean);
  return [tokens[0] ?? trimmed, [...tokens.slice(1), extraArg]];
}

function locateOnPath(name: string, platform: string): string {
  try {
    const raw = platform === 'win32'
      ? execSync(`where ${name} 2>nul`, { encoding: 'utf-8', timeout: 5000, shell: 'cmd.exe' })
      : execSync(`command -v ${name} 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 });
    return String(raw).trim().split('\n')[0] ?? '';
  } catch {
    return '';
  }
}

function resolveInterpreter(candidates: InterpreterCandidate[], kind: 'Python 3' | 'Bash', platform: string): { prefix: string; version: string } {
  const details: string[] = [];
  for (const candidate of candidates) {
    const ok = validateCandidate(candidate, kind, platform);
    if (ok) {
      return ok;
    }
    details.push(candidate.prefix);
  }
  const packagedHint = process.env.BRIAN_PORTABLE === '1'
    ? '打包发行版应自带 runtime/ 沙箱运行时（bash 与 Python），若缺失说明包不完整，请重新下载安装完整包。'
    : '';
  const guide = platform === 'win32' && kind === 'Bash'
    ? 'Windows 部署前置：安装 Git for Windows（含 bash），或设置 BRIAN_SANDBOX_BASH 指向 bash.exe 绝对路径。'
    : `请安装 ${kind} 并确保其在 PATH 中，或用 BRIAN_SANDBOX_${kind === 'Bash' ? 'BASH' : 'PYTHON'} 指定绝对命令。`;
  throw new SandboxRuntimeError(
    `沙箱运行时不满足：未找到可用的 ${kind} 解释器（已尝试：${details.join(' , ') || '无候选'}）。${guide} ${packagedHint} 沙箱为硬性部署契约，不做任何降级执行。`,
  );
}
