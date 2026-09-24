/**
 * @fileoverview ask_user 编排原语工具（OpenCode question 范式；Tools-PRD §5）。
 *
 * 澄清/确认：Agent 用它向用户提问并挂起等待（Deferred），答复经 HTTP 恢复为
 * **下一条 user 消息**（非状态机分支；Runs-PRD §4 映射表）。挂起前经 emitEvent
 * 发 `permission.asked`（复用权限卡事件通道，payload 携带 question/kind），
 * 应答后发 `permission.answered`。超时归一为未应答（错误结果回流，模型可自行收尾）。
 */

import { z } from 'zod';
import { IdGenerator, ValidationError } from '@brian-agent/base';
import { SkillResultStatus } from '../domain/types';
import type { SkillDef, SkillExecutionContext } from '../domain/types';

/** ask_user 依赖：挂起等待用户答复（组合根注入 RunGatewayAccess.waitUserAnswer 适配） */
export interface AskUserDeps {
  waitAnswer(input: { ask_id: string; run_id: string; session_key: string }): Promise<{ answer: string; answered: boolean }>;
}

/** ask_user 工具（Deferred 挂起；答复经 answerUserAsk 恢复为下一条 user 消息） */
export function askUserSkill(deps: AskUserDeps): SkillDef<{ question: string; kind?: string }> {
  return {
    id: 'skill_builtin-ask-user',
    description:
      '向用户提问并等待答复（澄清/确认）。参数：question（问题文本，必须具体可答）；kind（可选，clarify=澄清 / confirm=确认）。' +
      '用户答复将作为你的下一条用户消息出现。',
    parameters: z.object({
      question: z.string().min(1),
      kind: z.enum(['clarify', 'confirm']).optional(),
    }),
    async execute(args, ctx: SkillExecutionContext) {
      if (!ctx.run_id || !ctx.session_key) {
        throw new ValidationError('ask_user 需要 run 上下文（run_id/session_key 为空）');
      }
      if (!deps.waitAnswer) {
        throw new ValidationError('ask_user 未接线（RunGateway 未注入）');
      }
      return executeAskUser(deps, args, ctx);
    },
  };
}

/** 执行提问挂起（逻辑控制）：permission.asked → Deferred 等待 → permission.answered */
async function executeAskUser(
  deps: AskUserDeps,
  args: { question: string; kind?: string },
  ctx: SkillExecutionContext,
): Promise<{ status: SkillResultStatus; output: string }> {
  const askId = IdGenerator.generate();
  ctx.emitEvent?.('permission.asked', {
    permission_id: askId,
    tool_id: 'skill_builtin-ask-user',
    kind: args.kind ?? 'clarify',
    input: args.question,
    run_id: ctx.run_id,
  });
  const result = await deps.waitAnswer({ ask_id: askId, run_id: ctx.run_id as string, session_key: ctx.session_key as string });
  ctx.emitEvent?.('permission.answered', {
    permission_id: askId,
    tool_id: 'skill_builtin-ask-user',
    answered: result.answered,
    run_id: ctx.run_id,
  });
  if (!result.answered || !result.answer.trim()) {
    return { status: SkillResultStatus.Error, output: '用户未及时答复（等待超时）。请基于已有信息继续推进，或稍后再次询问。' };
  }
  return { status: SkillResultStatus.Ok, output: '用户已在对话框答复，见你的下一条用户消息。' };
}
