/**
 * @fileoverview delegate 编排原语工具（OpenClaw 2.0 范式；Tools-PRD §6.3）。
 *
 * 子代理委派：Agent 用它把子任务 spawn 为 subagent lane 上的独立 run（不轮询，
 * 经 Report 事件流回传）；本工具立即返回受理回执，子 run 结果作为后续消息进入会话。
 */

import { z } from 'zod';
import { ValidationError } from '@brian-agent/base';
import { ToolResultStatus } from '../domain/types';
import type { ToolDef } from '../domain/types';

/** delegate 依赖：提交子 run 的入口（组合根注入 RunGatewayAccess.submitRun 适配） */
export interface DelegateDeps {
  submitRun(input: { session_key: string; lane_kind: string; queue_mode: string; user_message: string; agent_ref?: string }): Promise<void>;
}

/** delegate 工具（子任务在 subagent lane 执行，队尾 followup 语义） */
export function delegateTool(deps: DelegateDeps): ToolDef<{ task_content: string; agent_ref?: string }> {
  return {
    id: 'delegate',
    description:
      '把子任务委派给子代理（subagent lane 异步执行）。参数：task_content（子任务描述，必须自包含）；agent_ref（可选，指定既有 Agent）。',
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
      await deps.submitRun({
        session_key: ctx.session_key as string,
        lane_kind: 'subagent',
        queue_mode: 'followup',
        user_message: args.task_content,
        agent_ref: args.agent_ref,
      });
      return {
        status: ToolResultStatus.Ok,
        output: `子任务已受理（subagent lane 异步执行）：${args.task_content.slice(0, 120)}`,
      };
    },
  };
}
