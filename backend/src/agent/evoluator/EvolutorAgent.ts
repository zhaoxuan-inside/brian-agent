import type { LLMService } from '../../core/llm';
import { logger } from '../../infrastructure/logger';

export interface EvaluateResultInput {
  user_query: string;
  agent_response: string;
  work_id: string;
  session_id: string;
}

export interface EvaluateResultOutput {
  overall_score: number;
  relevance_score: number;
  accuracy_score: number;
  completeness_score: number;
  coherence_score: number;
  helpfulness_score: number;
  improvement_suggestions: string[];
  evolutor_desc: string;
  elapsed_ms?: number;
}

interface EvalDimension {
  score: number;
  reason: string;
}

interface LLMEvalResult {
  relevance: EvalDimension;
  accuracy: EvalDimension;
  completeness: EvalDimension;
  coherence: EvalDimension;
  helpfulness: EvalDimension;
  overall_score: number;
  overall_comment: string;
  improvement_suggestions: string[];
}

const EVALUATOR_SYSTEM_PROMPT = `You are a quality evaluator for AI agent responses. Evaluate the response across 5 dimensions.

Evaluation criteria:
1. relevance (相关性): Does the answer directly address the user's question? 0-100
2. accuracy (准确性): Are facts, data, and code correct? 0-100
3. completeness (完整性): Does the answer cover all aspects of the question? 0-100
4. coherence (连贯性): Is the logical structure clear and well-organized? 0-100
5. helpfulness (有用性): How practically useful is this answer? 0-100

Respond with JSON:
{
  "relevance": { "score": 0-100, "reason": "..." },
  "accuracy": { "score": 0-100, "reason": "..." },
  "completeness": { "score": 0-100, "reason": "..." },
  "coherence": { "score": 0-100, "reason": "..." },
  "helpfulness": { "score": 0-100, "reason": "..." },
  "overall_score": 0-100,
  "overall_comment": "...",
  "improvement_suggestions": ["..."]
}`;

export class EvolutorAgent {
  private llmService: LLMService;

  constructor(llmService: LLMService) {
    this.llmService = llmService;
  }

  async evaluateResult(input: EvaluateResultInput): Promise<EvaluateResultOutput> {
    const start = Date.now();

    try {
      const messages = [
        { role: 'system' as const, content: EVALUATOR_SYSTEM_PROMPT },
        {
          role: 'user' as const,
          content: `User Query:\n${input.user_query}\n\nAgent Response:\n${input.agent_response}`,
        },
      ];

      const response = await this.llmService.chat(messages, { temperature: 0.1 });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const evalResult = JSON.parse(jsonMatch[0]) as LLMEvalResult;

        const weightedAvg =
          (evalResult.relevance.score +
            evalResult.accuracy.score +
            evalResult.completeness.score +
            evalResult.coherence.score +
            evalResult.helpfulness.score) /
          5;

        const overall = Math.abs(evalResult.overall_score - weightedAvg) > 15
          ? weightedAvg
          : evalResult.overall_score;

        return {
          overall_score: this.clamp(overall, 0, 100),
          relevance_score: this.clamp(evalResult.relevance.score, 0, 100),
          accuracy_score: this.clamp(evalResult.accuracy.score, 0, 100),
          completeness_score: this.clamp(evalResult.completeness.score, 0, 100),
          coherence_score: this.clamp(evalResult.coherence.score, 0, 100),
          helpfulness_score: this.clamp(evalResult.helpfulness.score, 0, 100),
          improvement_suggestions: evalResult.improvement_suggestions || [],
          evolutor_desc: response.content,
          elapsed_ms: Date.now() - start,
        };
      }

      return this.heuristicEvaluate(input, start);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('EVOLUTOR', `evaluateResult LLM failed, using heuristic: ${msg}`);
      return this.heuristicEvaluate(input, start);
    }
  }

  private heuristicEvaluate(
    input: EvaluateResultInput,
    start: number,
  ): EvaluateResultOutput {
    const response = input.agent_response;
    let score = 50;

    if (response.length > 100) score += 10;
    if (response.length > 500) score += 5;
    if (!/抱歉|无法|错误|失败|sorry|error|fail/i.test(response)) score += 10;
    if (/```|#+\s|[-*]\s|\d+\./.test(response)) score += 10;
    if (response.length > 50 && /。|；|？|！/.test(response)) score += 5;
    score = Math.min(score, 80);

    return {
      overall_score: score,
      relevance_score: score,
      accuracy_score: score - 5,
      completeness_score: score,
      coherence_score: score + 5,
      helpfulness_score: score,
      improvement_suggestions: score < 60 ? ['建议优化回答结构，增加代码示例和分点说明'] : [],
      evolutor_desc: `Heuristic evaluation (LLM unavailable). Score: ${score}/100`,
      elapsed_ms: Date.now() - start,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
