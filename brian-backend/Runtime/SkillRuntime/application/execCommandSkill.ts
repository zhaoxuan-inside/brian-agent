/**
 * @fileoverview exec 宿主命令执行原语工具（OpenClaw 2.0 对齐；Tools-PRD §6.5）。
 *
 * 背景（事故 trace 95b8e237）：Agent 面对"查磁盘"类宿主任务时，唯一可得原语是
 * cdt_browser（浏览器沙箱 JS evaluate，拿不到宿主数据）——Skill/MCP 通道产出技能后
 * 也需要一个可运行脚本的宿主底座。exec 补齐该原语。
 *
 * 安全边界：
 * - 不进信任表（trusted_tools 无 exec 默认项）：每次执行必定经 Loop 权限门询问，用户
 *   确权后可选择 remember 写入信任表；
 * - 超时强杀 + AbortSignal 贯通（外部取消立即销毁子进程）；
 * - 输出截断沿用 cdt_browser 的 8000 字惯例；stdin 关闭防止交互挂死。
 */

import { spawn } from 'child_process';
import { z } from 'zod';
import { SkillResultStatus } from '../domain/types';
import type { SkillDef, SkillExecutionContext } from '../domain/types';

/** 输出截断上限（与 CDT_CONTENT_MAX 惯例一致） */
const EXEC_OUTPUT_MAX = 8000;

/** 默认超时（秒） */
const EXEC_TIMEOUT_DEFAULT_S = 60;

/** 执行结果组装（数据处理）：stdout/stderr 合并，截断到上限 */
function formatExecResult(result: { stdout: string; stderr: string; code: number | null; timedOut: boolean }): string {
  const head = `exit_code=${result.code ?? 'null'}${result.timedOut ? '（超时终止）' : ''}`;
  const body = `${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}`;
  const clipped = body.length > EXEC_OUTPUT_MAX ? `${body.slice(0, EXEC_OUTPUT_MAX)}\n…（截断，全长 ${body.length} 字符）` : body;
  return `${head}\n${clipped}`;
}

/** exec 工具（宿主命令执行；无组件依赖，权限门由 Loop 统一承担） */
export function execCommandSkill(): SkillDef<{ command: string; timeout_s?: number }> {
  return {
    id: 'skill_builtin-exec',
    description:
      '在宿主机执行系统命令并返回真实输出（如查询磁盘、进程、网络状态）。参数：command（单条命令，禁止交互式命令）；timeout_s（可选，超时秒数，默认 60）。注意：首次执行需用户在权限卡上确认。',
    parameters: z.object({
      command: z.string().min(1),
      timeout_s: z.number().int().positive().optional(),
    }),
    async execute(args, ctx: SkillExecutionContext) {
      const timeoutMs = (args.timeout_s ?? EXEC_TIMEOUT_DEFAULT_S) * 1000;
      const child = spawn(args.command, [], {
        shell: true,
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs);
        const onAbort = () => child.kill('SIGKILL');
        ctx.signal?.addEventListener('abort', onAbort, { once: true });
        child.stdout.on('data', (chunk: Buffer) => { stdout += String(chunk); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += String(chunk); });
        child.on('error', (err: Error) => {
          clearTimeout(timer);
          ctx.signal?.removeEventListener('abort', onAbort);
          resolve({ status: SkillResultStatus.Ok, output: `command_spawn_failed: ${err.message}` });
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          ctx.signal?.removeEventListener('abort', onAbort);
          resolve({
            status: SkillResultStatus.Ok,
            output: formatExecResult({ stdout, stderr, code, timedOut }),
          });
        });
      });
    },
  };
}
