import {
  RelationDBAccess, SelectOneDBInput, SelectOneDBOutput, DBContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  JsonParser,
  PROMPT_IDS, getBuiltinTemplate, renderTemplate,
  type PromptsAccess, type LLMAccess, type Logger,
} from '@brian-agent/base';

export interface SelectStrategyResult {
  strategy: string;
  complexity: number;
  reason: string;
  plan?: Array<{ step: number; description: string }>;
}

const DEFAULT_THRESHOLD = 50;
const DEFAULT_TEMPLATE_ID = PROMPT_IDS.strategySelector;

const COMPLEX_QUERY_RE = /然后|接着|并且|同时|分别|步骤|第一步|第二|再把|以及|分析|报告|生成|对比|发送|规划|总结|邮件|代码|compare|then |and then|step\s*\d|首先.{0,8}再/i;

function looksSimpleQuery(userQuery: string): boolean {
  const t = userQuery.trim();
  if (!t || t.length > 48) return false;
  if (t.includes('\n')) return false;
  return !COMPLEX_QUERY_RE.test(t);
}

export async function selectOrchestrationStrategy(
  relationDb: RelationDBAccess,
  promptsAccess: PromptsAccess,
  llmAccess: LLMAccess,
  userQuery: string,
  workContext?: Record<string, unknown>,
  logger?: Logger,
): Promise<SelectStrategyResult> {
  const selInput = Object.assign(new SelectOneDBInput(), {
    query_param: { table: 'orchestration_config' },
  });
  const selOutput = Object.assign(new SelectOneDBOutput(), {});
  await relationDb.selectOneDB(selInput, selOutput, new DBContext());
  const config = (selOutput.row ?? {}) as Record<string, unknown>;
  const threshold = (config.complexity_decompose_threshold as number) ?? DEFAULT_THRESHOLD;
  const templateId = (config.strategy_prompt_template_id as string) || DEFAULT_TEMPLATE_ID;
  const defaultStrategy = (config.default_strategy as string) === 'PLANNING' ? 'PLANNING' : 'SIMPLE';

  // ===== Planner 开关：enable_planner=0 时强制单 Agent（SIMPLE），不进行任务拆解 =====
  const enablePlanner = Number(config.enable_planner ?? 1) !== 0;
  if (!enablePlanner) {
    return { strategy: 'SIMPLE', complexity: 0, reason: 'planner_disabled' };
  }

  if (looksSimpleQuery(userQuery)) {
    return { strategy: defaultStrategy === 'PLANNING' ? 'SIMPLE' : defaultStrategy, complexity: 10, reason: 'heuristic_simple_query' };
  }

  if (!llmAccess) {
    logger?.error?.('selectOrchestrationStrategy: no LLM access, using default strategy', {});
    return { strategy: defaultStrategy, complexity: 0, reason: 'no_llm_available' };
  }

  const ctxStr = workContext
    ? `上下文参考:\n${JSON.stringify(workContext, null, 2)}\n`
    : '';

  let promptText: string;
  const variables = { task_content: userQuery, threshold, context_data: ctxStr };
  try {
    const promptInput = Object.assign(new ExecPromptInput(), {
      id: templateId,
      variables,
    });
    const promptOutput = new ExecPromptOutput();
    await promptsAccess.execPrompt(promptInput, promptOutput, new PromptContext());
    promptText = promptOutput.prompt;
    if (!promptText) {
      const tpl = getBuiltinTemplate(DEFAULT_TEMPLATE_ID);
      promptText = tpl ? renderTemplate(tpl, variables) : '';
    }
  } catch (err: unknown) {
    const tpl = getBuiltinTemplate(DEFAULT_TEMPLATE_ID);
    promptText = tpl ? renderTemplate(tpl, variables) : '';
    if (!promptText) {
      logger?.error?.('selectOrchestrationStrategy: prompt render failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { strategy: defaultStrategy, complexity: 0, reason: 'prompt_render_failed' };
    }
  }

  try {
    const llmInput = Object.assign(new ExecLLMInput(), {
      id: '',
      prompt: promptText,
      temperature: 0.1,
      max_tokens: 256,
    });
    const llmOutput = new ExecLLMOutput();
    await llmAccess.execLLM(llmInput, llmOutput, new LLMContext());

    const rawText = llmOutput.result;
    const parsed = JsonParser.parseObject(rawText);
    if (!parsed) {
      throw new Error('no json in response');
    }

    const complexity = Math.min(Math.max(Number(parsed.complexity ?? 0), 0), 100);
    const validStrategies = ['SIMPLE', 'PLANNING'];
    const strategy = validStrategies.includes(parsed.strategy as string)
      ? (parsed.strategy as string)
      : (complexity >= threshold ? 'PLANNING' : defaultStrategy);

    return {
      strategy,
      complexity,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'llm_analyzed',
      plan: (parsed.plan ?? parsed.steps ?? parsed.subtasks) as
        Array<{ step: number; description: string }> | undefined,
    };
  } catch (err: unknown) {
    logger?.error?.('selectOrchestrationStrategy: LLM failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { strategy: defaultStrategy, complexity: 0, reason: 'llm_failed_fallback' };
  }
}
