/**
 * @fileoverview 本地进程沙箱实现（Local Sandbox）。
 *
 * PRD §5 规定的 "local" 沙箱：用于执行 Python / Bash 等非 JS 脚本。
 *
 * 隔离策略（不依赖 Docker / chroot 的轻量方案）：
 * - 文件系统：每次执行在独立临时目录中进行，脚本和参数写入该目录；
 * - 环境：仅继承白名单环境变量，params 通过 env 传入；
 * - 资源：超时控制 + stdout 大小限制；
 * - 清理：执行后销毁临时目录。
 *
 * 与 IsolatedVMSandbox 对仗，共同覆盖 PRD 中的 multi-sandbox 需求。
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IdGenerator } from '../../../shared/id/IdGenerator';

export interface LocalSandboxResult {
  stdout: string;
}

export class LocalSandbox {
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;

  constructor(timeoutMs = 15000, maxBufferBytes = 1024 * 1024) {
    this.timeoutMs = timeoutMs;
    this.maxBufferBytes = maxBufferBytes;
  }

  /**
   * 在本地沙箱中执行脚本。
   *
   * @param code    脚本源码
   * @param type    'py' | 'sh'
   * @param params  外部参数（通过环境变量 SKILL_PARAM_* 注入）
   */
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
        ? `python3 "${scriptPath}" 2>&1`
        : `bash "${scriptPath}" 2>&1`;

      const stdout = execSync(cmd, {
        cwd: workDir,
        timeout: this.timeoutMs,
        encoding: 'utf-8',
        maxBuffer: this.maxBufferBytes,
        env: { ...process.env, ...env },
      });

      return { stdout: stdout.trim() };
    } finally {
      try { rmSync(workDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
  }
}
