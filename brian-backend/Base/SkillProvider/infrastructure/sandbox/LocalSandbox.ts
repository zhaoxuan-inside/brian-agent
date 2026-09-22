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
import { IdGenerator } from '../../../ToolProvider/IdGenerator';
import type { SandboxRuntime } from './SandboxRuntime';

export interface LocalSandboxResult {
  stdout: string;
}

export class LocalSandbox {
  private readonly runtime: SandboxRuntime;
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;

  // ===== 修改后（2026-09-22 沙箱运行时契约）：解释器由启动期 resolveSandboxRuntime 解析注入，
  // 执行路径零平台分支。原实现硬编码 `python3`/`bash`（Windows 上无 python3 命令名、bash 依赖
  // WSL/Git Bash，属隐式环境假设），已删除（原始代码见 git 历史）。
  constructor(runtime: SandboxRuntime, timeoutMs = 15000, maxBufferBytes = 1024 * 1024) {
    this.runtime = runtime;
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
        // 脚本退出码非 0（如业务校验失败）时仍返回其 stdout，保留脚本打印的错误信息
        stdout = (e as { stdout?: string }).stdout ?? '';
        if (!stdout.trim()) {
          const err = e as { code?: string | number; stderr?: string; signal?: string; killed?: boolean; message?: string };
          // ===== 修改后（2026-09-22）：超时判定按 Node 语义（execSync 超时 → killed=true 且
          // signal=SIGTERM/SIGKILL）。原实现只匹配 err.code 含 'TIMEOUT'（Windows 侧重写法），
          // POSIX 上超时恒落 err.stderr/message，PRD 承诺的明确超时文案从未生效。
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
        /* 清理临时目录失败（权限/占用）不影响执行结果，交由系统临时目录策略回收 */
      }
    }
  }
}
