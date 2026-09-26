import { execSync } from 'child_process';

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
  const bash = resolveInterpreter(bashCandidates(platform, env), 'Bash', platform);
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
  const guide = platform === 'win32' && kind === 'Bash'
    ? 'Windows 部署前置：安装 Git for Windows（含 bash），或设置 BRIAN_SANDBOX_BASH 指向 bash.exe 绝对路径。'
    : `请安装 ${kind} 并确保其在 PATH 中，或用 BRIAN_SANDBOX_${kind === 'Bash' ? 'BASH' : 'PYTHON'} 指定绝对命令。`;
  throw new SandboxRuntimeError(
    `沙箱运行时不满足：未找到可用的 ${kind} 解释器（已尝试：${details.join(' , ') || '无候选'}）。${guide} 沙箱为硬性部署契约，不做任何降级执行。`,
  );
}
