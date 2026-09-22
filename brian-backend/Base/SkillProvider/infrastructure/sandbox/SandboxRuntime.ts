/**
 * @fileoverview 沙箱运行时契约（Sandbox Runtime Contract）。
 *
 * 根源设计（decisions.md 2026-09-22）：LocalSandbox 的 python/bash 解释器是**部署前置条件**，
 * 不是运行时可缺省的资源。产品承诺三平台（win32/darwin/linux）部署，因此：
 * - **启动期一次性解析**：按平台规范名/标准安装点定位解释器并做版本校验，结果注入 LocalSandbox；
 * - **fail-fast，零降级**：解析或校验失败 → SkillService 构造失败 → 后端启动失败，
 *   绝不以「试一个不行换下一个凑合」的方式带病运行；错误信息给出该平台的确切修复指引；
 * - **候选序列 ≠ 兜底**：同一解释器在不同平台的规范名不同（win32 的 py -3 / python，
 *   POSIX 的 python3），或安装于标准路径（Git Bash）——候选序列是**定位唯一正确解释器**的
 *   查找顺序，且会拒绝已知不兼容的二进制（如 WSL bash shim 的 cwd/env 语义不同）；
 *   唯一正确解释器不存在时不存在任何"次级沙箱"，直接失败。
 *
 * 环境变量覆盖（部署旋钮）：BRIAN_SANDBOX_PYTHON / BRIAN_SANDBASH_BASH → 拼写为
 * BRIAN_SANDBOX_BASH，优先于一切自动定位，指向解释器绝对命令（含参数，如 `"C:\...\py.exe" -3`）。
 */

import { execSync } from 'child_process';

/** 解析后的沙箱运行时（可直接拼接脚本路径执行） */
export interface SandboxRuntime {
  /** Python 解释器命令前缀（如 `/usr/bin/python3` 或 `"C:\Program Files\Python312\python.exe" -3`） */
  python: string;
  /** Bash 解释器命令前缀（如 `/bin/bash` 或 `"C:\Program Files\Git\bin\bash.exe"`） */
  bash: string;
  /** 校验时读到的版本号（启动日志/诊断用） */
  pythonVersion: string;
  bashVersion: string;
}

/** 单个候选：命令前缀（含引号与参数）+ 是否来自 PATH（PATH 候选需 where/which 反查绝对路径做兼容性过滤） */
interface InterpreterCandidate {
  prefix: string;
  fromPath?: boolean;
}

/** 沙箱运行时不满足（fail-fast）：SkillService 构造失败，后端拒绝启动 */
export class SandboxRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxRuntimeError';
  }
}

/** 平台 Python 候选定位序列。BRIAN_SANDBOX_PYTHON 指定即唯一候选（部署旋钮，不落回自动定位） */
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

/** 平台 Bash 候选定位序列（win32 以 Git Bash 为部署前置；显式拒绝 WSL shim）。BRIAN_SANDBOX_BASH 指定即唯一候选 */
export function bashCandidates(platform: string, env: NodeJS.ProcessEnv): InterpreterCandidate[] {
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
      { prefix: 'bash', fromPath: true },
    ];
  }
  return [{ prefix: 'bash', fromPath: true }];
}

/** WSL bash shim 判定（纯函数；System32\bash.exe 走 WSL 语义，cwd/env 翻译与沙箱契约不兼容） */
export function isWslBashShim(absolutePath: string): boolean {
  const normalized = absolutePath.toLowerCase().replace(/\//g, '\\');
  return normalized.endsWith('\\windows\\system32\\bash.exe');
}

/** Windows LOCALAPPDATA 下的 Git Bash 用户级安装点（缺失返回空串由调用方过滤） */
function joinAppDataGitBash(env: NodeJS.ProcessEnv): string {
  const localAppData = env.LOCALAPPDATA?.trim();
  return localAppData ? `${localAppData}\\Programs\\Git\\bin\\bash.exe` : '';
}

/** 命令引用（含空格的绝对路径必须加引号） */
function quoteIfNeeded(cmd: string): string {
  return /\s/.test(cmd) ? `"${cmd}"` : cmd;
}

/**
 * 解析沙箱运行时（启动期调用一次；任何失败 fail-fast 抛 SandboxRuntimeError）。
 *
 * @param platform 目标平台（默认当前平台；测试注入）
 * @param env      环境变量（默认 process.env；测试注入）
 */
export function resolveSandboxRuntime(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): SandboxRuntime {
  const python = resolveInterpreter(pythonCandidates(platform, env), 'Python 3', platform);
  const bash = resolveInterpreter(bashCandidates(platform, env), 'Bash', platform);
  return {
    python: python.prefix,
    bash: bash.prefix,
    pythonVersion: python.version,
    bashVersion: bash.version,
  };
}

/** 校验单个候选（数据处理）：返回 null 表示该候选不可用（不存在/版本不符/已知不兼容） */
function validateCandidate(candidate: InterpreterCandidate, kind: 'Python 3' | 'Bash', platform: string): { prefix: string; version: string } | null {
  let absolutePath = '';
  if (candidate.fromPath) {
    absolutePath = locateOnPath(candidate.prefix.split(' ')[0], platform);
    if (platform === 'win32' && kind === 'Bash' && absolutePath && isWslBashShim(absolutePath)) {
      return null;
    }
  }
  try {
    const raw = execSync(`${candidate.prefix} --version 2>&1`, { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
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

/** 在 PATH 上定位可执行文件绝对路径（win32 用 where，POSIX 用 command -v） */
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

/** 按候选序列解析解释器（逻辑控制；全落空 fail-fast，错误含平台修复指引） */
function resolveInterpreter(candidates: InterpreterCandidate[], kind: 'Python 3' | 'Bash', platform: string): { prefix: string; version: string } {
  const details: string[] = [];
  for (const candidate of candidates) {
    const ok = validateCandidate(candidate, kind, platform);
    if (ok) {
      return ok;
    }
    details.push(candidate.prefix);
  }
  const guide = platform === 'win32' && kind === 'Bash'
    ? 'Windows 部署前置：安装 Git for Windows（含 bash），或设置 BRIAN_SANDBOX_BASH 指向 bash.exe 绝对路径。'
    : `请安装 ${kind} 并确保其在 PATH 中，或用 BRIAN_SANDBOX_${kind === 'Bash' ? 'BASH' : 'PYTHON'} 指定绝对命令。`;
  throw new SandboxRuntimeError(
    `沙箱运行时不满足：未找到可用的 ${kind} 解释器（已尝试：${details.join(' , ') || '无候选'}）。${guide} 沙箱为硬性部署契约，不做任何降级执行。`,
  );
}
