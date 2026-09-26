import { z } from 'zod';
import { ValidationError } from '@brian-agent/base';
import { SkillResultStatus } from '../domain/types';
import type { SkillDef, SkillExecutionContext } from '../domain/types';

export enum PlanStepStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
}

export interface PlanStep {
  
  step: string;
  
  status: PlanStepStatus;
}

const plans = new Map<string, PlanStep[]>();

export function preparePlanSteps(steps: Array<{ step: string; status?: string }>): PlanStep[] {
  const normalized = steps.map((s) => {
    const status = (s.status ?? PlanStepStatus.Pending) as PlanStepStatus;
    if (!Object.values(PlanStepStatus).includes(status)) {
      throw new ValidationError(`非法的 plan 步骤状态: ${s.status}`);
    }
    if (!s.step || !s.step.trim()) {
      throw new ValidationError('plan 步骤内容不能为空');
    }
    return { step: s.step.trim(), status };
  });
  const inProgress = normalized.filter((s) => s.status === PlanStepStatus.InProgress).length;
  if (inProgress > 1) {
    throw new ValidationError('plan 不变量违反：至多一个步骤处于 in_progress');
  }
  return normalized;
}

export function renderPlanText(steps: PlanStep[]): string {
  const mark = (s: PlanStepStatus) =>
    s === PlanStepStatus.Completed ? '[x]' : s === PlanStepStatus.InProgress ? '[~]' : '[ ]';
  return steps.map((s) => `${mark(s.status)} ${s.step}`).join('\n');
}

export function updatePlanSkill(): SkillDef<{ plan: Array<{ step: string; status?: string }> }> {
  return {
    id: 'skill_builtin-plan',
    description:
      '更新并展示当前任务的多步计划（过程性计划卡）。status 取值 pending/in_progress/completed；至多一个步骤为 in_progress。',
    parameters: z.object({
      plan: z.array(
        z.object({
          step: z.string(),
          status: z.string().optional(),
        }),
      ),
    }),
    async execute(args, ctx: SkillExecutionContext) {
      if (!ctx.run_id) {
        throw new ValidationError('update_plan 需要 run 上下文（run_id 为空）');
      }
      const steps = preparePlanSteps(args.plan);
      plans.set(ctx.run_id, steps);
      ctx.emitEvent?.('plan.updated', { steps });
      return { status: SkillResultStatus.Ok, output: `计划已更新（${steps.length} 步）：\n${renderPlanText(steps)}` };
    },
  };
}
