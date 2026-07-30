import {
  SelectOneDBInput, SelectOneDBOutput, DBContext, type Logger,
} from '@brian-agent/base';

export interface SelectStrategyResult {
  strategy: string;
  complexity: number;
  reason: string;
}

export async function selectOrchestrationStrategy(
  relationDb: { selectOneDB: (input: SelectOneDBInput, context: DBContext, output: SelectOneDBOutput) => Promise<boolean> },
  userQuery: string,
  workContext?: Record<string, unknown>,
  llmAccess?: { execLLM: (input: Record<string, unknown>) => Promise<Record<string, unknown>> },
  promptsAccess?: { execPrompt: (input: Record<string, unknown>) => Promise<Record<string, unknown>> },
  logger?: Logger,
): Promise<SelectStrategyResult> {
  const selInput = Object.assign(new SelectOneDBInput(), {
    query_param: { table: 'orchestration_config' },
  });
  const selOutput = Object.assign(new SelectOneDBOutput(), {});
  await relationDb.selectOneDB(selInput, new DBContext(), selOutput);

  const config = (selOutput.row ?? {}) as Record<string, unknown>;
  const threshold = (config.complexity_decompose_threshold as number) ?? 50;
  const promptTemplateId = config.strategy_prompt_template_id as string | undefined;

  if (promptTemplateId && promptsAccess && llmAccess) {
    try {
      const promptResult = await promptsAccess.execPrompt(Object.assign({}, {
        prompt_template_id: promptTemplateId,
        variables: { user_query: userQuery, work_context: workContext ? JSON.stringify(workContext) : '' },
      }));
      const promptText = promptResult?.result ?? promptResult?.rendered_prompt ?? JSON.stringify(userQuery);
      const llmResult = await llmAccess.execLLM(Object.assign({}, { prompt: promptText }));
      const rawText = (llmResult?.text ?? llmResult?.content ?? llmResult?.result ?? '') as string;
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.complexity !== undefined && parsed.strategy) {
          const llmComplexity = Math.min(Math.max(Number(parsed.complexity), 0), 100);
          const validStrategies = ['SIMPLE', 'PLANNING'];
          return {
            strategy: validStrategies.includes(parsed.strategy) ? parsed.strategy : (llmComplexity >= threshold ? 'PLANNING' : 'SIMPLE'),
            complexity: llmComplexity,
            reason: parsed.reason ?? 'llm_based',
          };
        }
      }
    } catch (err: unknown) {
      logger?.error?.('selectOrchestrationStrategy: LLM path failed, falling back to rule-based', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const queryLen = userQuery.length;
  const questionCount = userQuery.split(/[?？]/).length - 1;
  const stepKeywords = /步骤|首先|然后|接着|最后|第一步|第二步|第三步|step|first|second|third|finally/i;
  const hasStepKeywords = stepKeywords.test(userQuery);
  const complexity = Math.min(queryLen / 2 + questionCount * 10 + (hasStepKeywords ? 30 : 0), 100);

  if (complexity >= threshold) {
    return { strategy: 'PLANNING', complexity, reason: 'rule_based: complexity above threshold' };
  }
  return { strategy: 'SIMPLE', complexity, reason: 'rule_based: complexity below threshold' };
}
