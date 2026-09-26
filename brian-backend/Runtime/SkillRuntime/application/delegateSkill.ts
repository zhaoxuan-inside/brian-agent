import { z } from 'zod';
import { ValidationError } from '@brian-agent/base';
import { SkillResultStatus } from '../domain/types';
import type { SkillDef } from '../domain/types';

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

export function delegateSkill(deps: DelegateDeps): SkillDef<{ task_content: string; agent_ref?: string }> {
  return {
    id: 'skill_builtin-delegate',
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
        status: SkillResultStatus.Ok,
        output: `子任务已受理（run_id=${accepted.run_id}）：${args.task_content.slice(0, 120)}。结果将由系统在本次问答收口时统一汇总，请勿重复委派同一任务。`,
      };
    },
  };
}
