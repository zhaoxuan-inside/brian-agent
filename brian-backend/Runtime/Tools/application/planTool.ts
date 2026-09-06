/**
 * @fileoverview update_plan 编排原语工具（OpenClaw 2.0 范式；Tools-PRD §6.4）。
 *
 * 过程性计划卡：Agent 用它向用户展示多步计划并维护进度。状态存内存（per run），
 * 每次调用经 emitEvent 发 `plan.updated` 业务事件（Report→StreamProvider）。
 * 不变量：至多一个 step 处于 in_progress（由 preparePlanSteps 校验，违反即拒绝）。
 */

import { z } from 'zod';
import { ValidationError } from '@brian-agent/base';
import { ToolResultStatus } from '../domain/types';
import type { ToolDef, ToolExecutionContext } from '../domain/types';

/** plan 步骤状态（有限值域） */
export enum PlanStepStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
}

/** 单步计划 */
export interface PlanStep {
  /** 步骤描述 */
  step: string;
  /** 状态 */
  status: PlanStepStatus;
}

/** run 级计划状态（进程内存；随 run 生命周期存续） */
const plans = new Map<string, PlanStep[]>();

/** 清空指定 run 的计划状态（run 结算后由 Loop 调用；测试隔离用） */
export function clearPlan(runId: string): void {
  plans.delete(runId);
}

/** 计划步骤校验与归一（数据处理；不变量：至多一个 in_progress） */
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

/** 渲染计划卡文本（数据处理；模型可读） */
export function renderPlanText(steps: PlanStep[]): string {
  const mark = (s: PlanStepStatus) =>
    s === PlanStepStatus.Completed ? '[x]' : s === PlanStepStatus.InProgress ? '[~]' : '[ ]';
  return steps.map((s) => `${mark(s.status)} ${s.step}`).join('\n');
}

/** update_plan 编排原语工具 */
export function updatePlanTool(): ToolDef<{ plan: Array<{ step: string; status?: string }> }> {
  return {
    id: 'update_plan',
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
    async execute(args, ctx: ToolExecutionContext) {
      if (!ctx.run_id) {
        throw new ValidationError('update_plan 需要 run 上下文（run_id 为空）');
      }
      const steps = preparePlanSteps(args.plan);
      plans.set(ctx.run_id, steps);
      ctx.emitEvent?.('plan.updated', { steps });
      return { status: ToolResultStatus.Ok, output: `计划已更新（${steps.length} 步）：\n${renderPlanText(steps)}` };
    },
  };
}
