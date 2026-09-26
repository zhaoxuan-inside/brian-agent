import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IdGenerator } from '../../../ToolProvider/IdGenerator';
import type { SandboxRuntime } from './SandboxRuntime';

export interface LocalSandboxResult {
  stdout: string;
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
          env: { ...process.env, ...env },
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
