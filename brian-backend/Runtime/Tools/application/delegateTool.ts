/**
 * @fileoverview delegate 编排原语工具（OpenClaw 2.0 范式；Tools-PRD §6.3）。
 *
 * 子代理委派：Agent 用它把子任务 spawn 为 subagent lane 上的独立 run。
 * 2026-09-23 委派收口改造（原 fire-and-forget 回执见 git 历史）：
 * - 回执携带 run_id（主 run 收口前 join 子 run，并把结果并入写作 Agent 的 agent_results）；
 * - 提交透传 parent_run_id / agent_ref（父子关系登记 + 指定 Agent 直选路由）；
 * - 回执明确告知"结果将统一汇总"，杜绝模型因收不到结果语义而重复委派。
 */

import { z } from 'zod';
import { ValidationError } from '@brian-agent/base';
import { ToolResultStatus } from '../domain/types';
import type { ToolDef } from '../domain/types';

/** delegate 依赖：提交子 run 的入口（组合根注入 RunGatewayAccess.submitRun 适配） */
export interface DelegateDeps {
  submitRun(input: {
    session_key: string;
    lane_kind: string;
    queue_mode: string;
    user_message: string;
    agent_ref?: string;
    parent_run_id?: string;
  }): Promise<{ run_id: string }>;
}

/** delegate 工具（子任务在 subagent lane 执行；结果由父 run 的写作 Agent 统一收口） */
export function delegateTool(deps: DelegateDeps): ToolDef<{ task_content: string; agent_ref?: string }> {
  return {
    id: 'delegate',
    description:
      '把子任务委派给子代理执行（一次问答可委派多个子任务，结果将统一汇总后回复）。参数：task_content（子任务描述，必须自包含）；agent_ref（可选，指定既有 Agent 执行）。注意：每个子任务只需委派一次，受理后无需等待或重复委派。',
    parameters: z.object({
      task_content: z.string().min(1),
      agent_ref: z.string().optional(),
    }),
    async execute(args, ctx) {
      if (!ctx.session_key) {
        throw new ValidationError('delegate 需要会话上下文（session_key 为空）');
      }
      if (!deps.submitRun) {
        throw new ValidationError('delegate 未接线（RunGateway 未注入）');
      }
      const accepted = await deps.submitRun({
        session_key: ctx.session_key as string,
        lane_kind: 'subagent',
        queue_mode: 'followup',
        user_message: args.task_content,
        agent_ref: args.agent_ref,
        parent_run_id: ctx.run_id,
      });
      return {
        status: ToolResultStatus.Ok,
        output: `子任务已受理（run_id=${accepted.run_id}）：${args.task_content.slice(0, 120)}。结果将由系统在本次问答收口时统一汇总，请勿重复委派同一任务。`,
      };
    },
  };
}
