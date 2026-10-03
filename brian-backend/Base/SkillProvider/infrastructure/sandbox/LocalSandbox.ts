import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, delimiter } from 'path';
import { IdGenerator } from '../../../ToolProvider/IdGenerator';
import type { SandboxRuntime } from './SandboxRuntime';

export interface LocalSandboxResult {
  stdout: string;
}

/**
 * 由 bash 前缀推导其 bin 目录（捆绑运行时的 coreutils 所在）。
 * 裸命令名（宿主机 PATH bash）返回空——交由宿主机自身环境解析。
 */
function bashBinDirFromPrefix(prefix: string): string {
  const p = prefix.trim().replace(/^"|"$/g, '');
  if (!/bash(\.exe)?$/i.test(p) || !/[\\/]/.test(p)) return '';
  return dirname(p);
}

export class LocalSandbox {
  private readonly runtime: SandboxRuntime;
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;

  constructor(runtime: SandboxRuntime, timeoutMs = 15000, maxBufferBytes = 1024 * 1024) {
    this.runtime = runtime;
    this.timeoutMs = timeoutMs;
    this.maxBufferBytes = maxBufferBytes;
  }

  execute(
    code: string,
    type: 'py' | 'sh',
    params: Record<string, unknown>,
  ): LocalSandboxResult {
    const workDir = join(tmpdir(), `skill-sandbox-${IdGenerator.generate()}`);
    mkdirSync(workDir, { recursive: true });

    try {
      const ext = type === 'py' ? 'py' : 'sh';
      const scriptPath = join(workDir, `script.${ext}`);
      writeFileSync(scriptPath, code, 'utf-8');

      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) {
        env[`SKILL_PARAM_${k.toUpperCase()}`] = String(v);
      }

      const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env };
      if (type === 'sh') {
        // sh 技能依赖 GNU coreutils（uname/grep/sed/awk…），与捆绑 bash.exe 同目录；
        // 仅在沙箱子进程 PATH 前置该目录（服务进程全局 PATH 不动——usr/bin 中的
        // find/sort/link 等会遮蔽 Windows 同名命令，全局前置会破坏其他功能）
        const binDir = bashBinDirFromPrefix(this.runtime.bash);
        if (binDir && existsSync(binDir)) {
          childEnv.PATH = `${binDir}${delimiter}${childEnv.PATH ?? ''}`;
        }
      }

      const cmd = type === 'py'
        ? `${this.runtime.python} "${scriptPath}" 2>&1`
        : `${this.runtime.bash} "${scriptPath}" 2>&1`;

      let stdout = '';
      try {
        stdout = execSync(cmd, {
          cwd: workDir,
          timeout: this.timeoutMs,
          encoding: 'utf-8',
          maxBuffer: this.maxBufferBytes,
          env: childEnv,
        });
      } catch (e) {

        stdout = (e as { stdout?: string }).stdout ?? '';
        if (!stdout.trim()) {
          const err = e as { code?: string | number; stderr?: string; signal?: string; killed?: boolean; message?: string };

          if (err.killed || err.signal || String(err.code ?? '').includes('TIMEOUT') || /timed out/i.test(String(err.message ?? ''))) {
            stdout = `执行超时（${this.timeoutMs}ms）`;
          } else {
            stdout = err.stderr ?? String(err.message ?? '');
          }
        }
      }

      return { stdout: stdout.trim() };
    } finally {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {

      }
    }
  }
}
