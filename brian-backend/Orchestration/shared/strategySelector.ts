import {
  SelectOneDBInput, SelectOneDBOutput, DBContext, type Logger,
} from '@brian-agent/base';

export interface SelectStrategyResult {
  strategy: string;
  complexity: number;
  reason: string;
  /** LLM 直接输出的任务分解计划（Hermes 风格） */
  plan?: Array<{ step: number; description: string }>;
}

/**
 * 编排策略选择器。
 *
 * 始终通过 LLM 分析任务特征来决定使用 SIMPLE 还是 PLANNING 策略，
 * 不依赖硬编码规则。LLM 对任务"复杂度"的内化理解比字符计数更准确。
 *
 * 若未配置 strategy_prompt_template_id，使用内置默认 Prompt。
 */
export async function selectOrchestrationStrategy(
  relationDb: { selectOneDB: (input: SelectOneDBInput, context: DBContext, output: SelectOneDBOutput) => Promise<boolean> },
  userQuery: string,
  workContext?: Record<string, unknown>,
  llmAccess?: { execLLM: (input: Record<string, unknown>) => Promise<Record<string, unknown>> },
  promptsAccess?: { execPrompt: (input: Record<string, unknown>) => Promise<Record<string, unknown>> },
  logger?: Logger,
): Promise<SelectStrategyResult> {
  if (!llmAccess) {
    logger?.error?.('selectOrchestrationStrategy: no LLM access, using SIMPLE', {});
    return { strategy: 'SIMPLE', complexity: 0, reason: 'no_llm_available' };
  }

  // 读取配置
  const selInput = Object.assign(new SelectOneDBInput(), {
    query_param: { table: 'orchestration_config' },
  });
  const selOutput = Object.assign(new SelectOneDBOutput(), {});
  await relationDb.selectOneDB(selInput, new DBContext(), selOutput);
  const config = (selOutput.row ?? {}) as Record<string, unknown>;
  const threshold = (config.complexity_decompose_threshold as number) ?? 50;
  const promptTemplateId = config.strategy_prompt_template_id as string | undefined;

  // 构建 Prompt
  const promptText = await buildPrompt(
    promptTemplateId,
    userQuery,
    workContext,
    threshold,
    promptsAccess,
    logger,
  );

  // 调用 LLM 分析
  try {
    const llmResult = await llmAccess.execLLM(Object.assign({}, { prompt: promptText }));
    const rawText = (llmResult?.text ?? llmResult?.content ?? llmResult?.result ?? '') as string;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('no json in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const complexity = Math.min(Math.max(Number(parsed.complexity ?? 0), 0), 100);
    const validStrategies = ['SIMPLE', 'PLANNING'];
    const strategy = validStrategies.includes(parsed.strategy)
      ? parsed.strategy
      : (complexity >= threshold ? 'PLANNING' : 'SIMPLE');

    return {
      strategy,
      complexity,
      reason: parsed.reason ?? 'llm_analyzed',
      plan: parsed.plan ?? parsed.steps ?? parsed.subtasks,
    };
  } catch (err: unknown) {
    logger?.error?.('selectOrchestrationStrategy: LLM failed, falling back to threshold', {
      error: err instanceof Error ? err.message : String(err),
    });
    // 最终兜底：纯阈值判断
    return {
      strategy: 'SIMPLE',
      complexity: 0,
      reason: 'llm_failed_fallback',
    };
  }
}

/**
 * 构建发给 LLM 的策略选择 Prompt。
 *
 * 有模板时用模板渲染；无模板时用内置默认 Prompt（Hermes 风格：
 * 让模型直接输出复杂度、策略、以及计划步骤）。
 */
async function buildPrompt(
  templateId: string | undefined,
  userQuery: string,
  workContext: Record<string, unknown> | undefined,
  threshold: number,
  promptsAccess?: { execPrompt: (input: Record<string, unknown>) => Promise<Record<string, unknown>> },
  logger?: Logger,
): Promise<string> {
  if (templateId && promptsAccess) {
    try {
      const result = await promptsAccess.execPrompt(Object.assign({}, {
        prompt_template_id: templateId,
        variables: { user_query: userQuery, work_context: workContext ? JSON.stringify(workContext) : '', threshold },
      }));
      const rendered = (result?.result ?? result?.rendered_prompt ?? '') as string;
      if (rendered) return rendered;
    } catch (err: unknown) {
      logger?.error?.('buildPrompt: template render failed, using default', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 内置默认 Prompt（Hermes 风格）
  const ctxStr = workContext
    ? `上下文参考:\n${JSON.stringify(workContext, null, 2)}\n`
    : '';

  return [
    '你是一个任务复杂度分析器。请分析以下用户任务，输出 JSON：',
    '',
    '{',
    '  "complexity": <0-100 的整数>',
    '  "strategy": "SIMPLE" | "PLANNING"',
    '  "reason": "<简短说明>"',
    '  "plan": [{"step": 1, "description": "第一步做什么"}, ...]',
    '}',
    '',
    `策略选择阈值: complexity >= ${threshold} → PLANNING（需要分解为多步），否则 SIMPLE（单 Agent 直行）`,
    '',
    '判断要点:',
    '- 简单问答、单一任务 → SIMPLE',
    '- 需要多步骤分析、对比、分阶段执行 → PLANNING',
    '- plan 字段仅在 PLANNING 时填写，列出分解后的子任务步骤',
    '',
    `${ctxStr}用户任务: ${userQuery}`,
    '',
    '只输出 JSON，不要额外文字。',
  ].join('\n');
}
