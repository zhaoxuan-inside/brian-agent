import { z } from 'zod';
import { ChatMessage } from '../base/LLMWrapper';
import { ThinkingStrategy, StrategyTypeSchema } from './ThinkingStrategy';
import { LLMService } from '../core/llm/LLMService';
import { logger } from '../infrastructure/logger';

export const AgentTypeSchema = z.enum(['planner', 'worker', 'synthesizer', 'evaluator']);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export const AgentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: AgentTypeSchema,
  strategy: StrategyTypeSchema,
  modelId: z.string().optional(),
  maxIterations: z.number().default(10),
  timeout: z.number().default(300000),
  qualityThreshold: z.number().default(0.7),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export interface QualityScore {
  overall: number;
  relevance: number;
  accuracy: number;
  completeness: number;
  coherence: number;
  helpfulness: number;
  dimensions: {
    name: string;
    score: number;
    weight: number;
    description: string;
  }[];
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  strategy: ThinkingStrategy;

  execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    result: string;
    thoughts: string[];
    actions: Record<string, any>[];
    metadata: Record<string, any>;
  }>;
}

export abstract class BaseAgent implements Agent {
  constructor(
    public id: string,
    public name: string,
    public type: AgentType,
    public strategy: ThinkingStrategy,
    protected llmService: LLMService
  ) {}

  abstract execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    result: string;
    thoughts: string[];
    actions: Record<string, any>[];
    metadata: Record<string, any>;
  }>;

  protected async generateResponse(messages: ChatMessage[], modelId?: string): Promise<string> {
    const response = await this.llmService.chatCompletion({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      maxTokens: 4096,
    }, modelId);

    return response.choices[0]?.message?.content || '';
  }
}

export class PlannerAgent extends BaseAgent {
  async execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    result: string;
    thoughts: string[];
    actions: Record<string, any>[];
    metadata: Record<string, any>;
  }> {
    const thoughts: string[] = [];
    const actions: Record<string, any>[] = [];

    const strategyResult = await this.strategy.execute(messages, context);
    thoughts.push(strategyResult.thought);

    if (strategyResult.action) {
      actions.push(strategyResult.action);
    }

    return {
      result: 'Plan generated',
      thoughts,
      actions,
      metadata: { agentType: 'planner', strategy: this.strategy.type },
    };
  }
}

export class WorkerAgent extends BaseAgent {
  async execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    result: string;
    thoughts: string[];
    actions: Record<string, any>[];
    metadata: Record<string, any>;
  }> {
    const thoughts: string[] = [];
    const actions: Record<string, any>[] = [];

    const strategyResult = await this.strategy.execute(messages, context);
    thoughts.push(strategyResult.thought);

    if (strategyResult.action) {
      actions.push(strategyResult.action);
    }

    const result = await this.generateResponse(messages, context.modelId);

    return {
      result,
      thoughts,
      actions,
      metadata: { agentType: 'worker', strategy: this.strategy.type },
    };
  }
}

export class SynthesizerAgent extends BaseAgent {
  async execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    result: string;
    thoughts: string[];
    actions: Record<string, any>[];
    metadata: Record<string, any>;
  }> {
    const thoughts: string[] = ['Synthesizing results from multiple agents'];
    const actions: Record<string, any>[] = [];

    const result = await this.generateResponse(messages, context.modelId);

    return {
      result,
      thoughts,
      actions,
      metadata: { agentType: 'synthesizer', strategy: this.strategy.type },
    };
  }
}

export class EvaluatorAgent extends BaseAgent {
  async execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    result: string;
    thoughts: string[];
    actions: Record<string, any>[];
    metadata: Record<string, any>;
  }> {
    const thoughts: string[] = ['Evaluating the quality of the response'];
    const actions: Record<string, any>[] = [];

    logger.info('EvaluatorAgent', 'Starting evaluation', {
      agentId: this.id,
      messageCount: messages.length,
      hasAgentResults: !!context.agentResults,
    });

    logger.debug('EvaluatorAgent', 'Input messages for evaluation', {
      agentId: this.id,
      messages: messages.map(m => ({
        role: m.role,
        contentLength: m.content?.length || 0,
        contentPreview: (m.content || '').substring(0, 100),
      })),
    });

    const strategyResult = await this.strategy.execute(messages, context);
    thoughts.push(strategyResult.thought);

    logger.debug('EvaluatorAgent', 'Strategy execution result', {
      agentId: this.id,
      thought: strategyResult.thought,
      hasAction: !!strategyResult.action,
    });

    const qualityScore = this.calculateQualityScore(messages, context);

    const threshold = context.qualityThreshold || 0.7;
    const passed = qualityScore.overall >= threshold;

    logger.debug('EvaluatorAgent', 'Threshold comparison', {
      agentId: this.id,
      overallScore: qualityScore.overall,
      threshold,
      passed,
      margin: qualityScore.overall - threshold,
    });

    logger.info('EvaluatorAgent', 'Evaluation complete', {
      agentId: this.id,
      overallScore: qualityScore.overall,
      dimensions: qualityScore.dimensions,
      passedThreshold: passed,
    });

    return {
      result: 'Evaluation complete',
      thoughts,
      actions,
      metadata: {
        agentType: 'evaluator',
        strategy: this.strategy.type,
        qualityScore: qualityScore.overall,
        qualityDetails: qualityScore,
      },
    };
  }

  private calculateQualityScore(messages: ChatMessage[], _context: Record<string, any>): QualityScore {
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');

    logger.debug('EvaluatorAgent', 'Extracted messages for scoring', {
      agentId: this.id,
      hasUserMessage: !!lastUserMessage,
      hasAssistantMessage: !!lastAssistantMessage,
      userMessageLength: lastUserMessage?.content?.length || 0,
      assistantMessageLength: lastAssistantMessage?.content?.length || 0,
    });

    const dimensions: QualityScore['dimensions'] = [
      {
        name: 'relevance',
        score: this.scoreRelevance(lastUserMessage?.content || '', lastAssistantMessage?.content || ''),
        weight: 0.25,
        description: '回答与用户问题的相关性',
      },
      {
        name: 'accuracy',
        score: this.scoreAccuracy(lastAssistantMessage?.content || ''),
        weight: 0.25,
        description: '回答内容的准确性和事实性',
      },
      {
        name: 'completeness',
        score: this.scoreCompleteness(lastAssistantMessage?.content || ''),
        weight: 0.20,
        description: '回答的完整性和详尽程度',
      },
      {
        name: 'coherence',
        score: this.scoreCoherence(lastAssistantMessage?.content || ''),
        weight: 0.15,
        description: '回答的逻辑性和连贯性',
      },
      {
        name: 'helpfulness',
        score: this.scoreHelpfulness(lastAssistantMessage?.content || ''),
        weight: 0.15,
        description: '回答对用户的实际帮助程度',
      },
    ];

    logger.debug('EvaluatorAgent', 'Dimension scores calculated', {
      agentId: this.id,
      dimensions: dimensions.map(d => ({
        name: d.name,
        score: d.score,
        weight: d.weight,
        weighted: d.score * d.weight,
      })),
    });

    // 逐步计算加权总分，便于追踪
    let overall = 0;
    const calculationSteps: string[] = [];
    for (const d of dimensions) {
      const weighted = d.score * d.weight;
      overall += weighted;
      calculationSteps.push(`${d.name}: ${d.score.toFixed(4)} × ${d.weight} = ${weighted.toFixed(4)} → 累计: ${overall.toFixed(4)}`);
    }

    logger.debug('EvaluatorAgent', 'Weighted sum calculation steps', {
      agentId: this.id,
      steps: calculationSteps,
      finalOverall: overall,
    });

    logger.info('EvaluatorAgent', 'Final quality score calculated', {
      agentId: this.id,
      overallScore: overall,
      dimensionBreakdown: dimensions.map(d => `${d.name}: ${d.score.toFixed(2)} (weight: ${d.weight})`).join(', '),
    });

    return {
      overall,
      relevance: dimensions[0].score,
      accuracy: dimensions[1].score,
      completeness: dimensions[2].score,
      coherence: dimensions[3].score,
      helpfulness: dimensions[4].score,
      dimensions,
    };
  }

  private scoreRelevance(userQuery: string, response: string): number {
    if (!userQuery || !response) {
      logger.debug('EvaluatorAgent', 'Relevance score: skipped (empty input)', { userQuery: !!userQuery, response: !!response });
      return 0;
    }

    const queryWords = new Set(userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const responseWords = new Set(response.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    const matchedWords: string[] = [];
    let matchCount = 0;
    for (const word of queryWords) {
      if (responseWords.has(word)) {
        matchCount++;
        matchedWords.push(word);
      }
    }

    const rawScore = queryWords.size > 0 ? matchCount / queryWords.size : 0.5;
    const adjustedScore = rawScore + 0.2;
    const finalScore = Math.min(1, Math.max(0.3, adjustedScore));

    logger.debug('EvaluatorAgent', 'Relevance score detail', {
      queryWordCount: queryWords.size,
      responseWordCount: responseWords.size,
      matchCount,
      matchedWords,
      rawScore,
      adjustment: '+0.2',
      adjustedScore,
      clampRange: '[0.3, 1.0]',
      finalScore,
    });

    return finalScore;
  }

  private scoreAccuracy(response: string): number {
    if (!response) {
      logger.debug('EvaluatorAgent', 'Accuracy score: skipped (empty response)');
      return 0;
    }

    const hasHedges = /(maybe|perhaps|possibly|might|could be|i think|i guess)/i.test(response);
    const hasCitations = /\[\d+\]|source|reference|according to/i.test(response);
    const hasStructure = /\d+\.|\n- |\n\* /.test(response);

    const adjustments: string[] = [];
    let score = 0.6;
    adjustments.push(`base: 0.60`);
    if (hasHedges) { score -= 0.1; adjustments.push('hedges: -0.10'); }
    if (hasCitations) { score += 0.15; adjustments.push('citations: +0.15'); }
    if (hasStructure) { score += 0.1; adjustments.push('structure: +0.10'); }

    const finalScore = Math.min(1, Math.max(0.3, score));

    logger.debug('EvaluatorAgent', 'Accuracy score detail', {
      hasHedges,
      hasCitations,
      hasStructure,
      adjustments,
      rawScore: score,
      clampRange: '[0.3, 1.0]',
      finalScore,
    });

    return finalScore;
  }

  private scoreCompleteness(response: string): number {
    if (!response) {
      logger.debug('EvaluatorAgent', 'Completeness score: skipped (empty response)');
      return 0;
    }

    const length = response.length;
    const sentenceCount = response.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const paragraphCount = response.split(/\n\n+/).filter(p => p.trim().length > 0).length;

    const adjustments: string[] = [`base: 0.50`];
    let score = 0.5;
    if (length > 200) { score += 0.1; adjustments.push('length>200: +0.10'); }
    if (length > 500) { score += 0.1; adjustments.push('length>500: +0.10'); }
    if (sentenceCount >= 3) { score += 0.1; adjustments.push('sentences>=3: +0.10'); }
    if (paragraphCount >= 2) { score += 0.1; adjustments.push('paragraphs>=2: +0.10'); }

    const finalScore = Math.min(1, Math.max(0.3, score));

    logger.debug('EvaluatorAgent', 'Completeness score detail', {
      responseLength: length,
      sentenceCount,
      paragraphCount,
      adjustments,
      rawScore: score,
      clampRange: '[0.3, 1.0]',
      finalScore,
    });

    return finalScore;
  }

  private scoreCoherence(response: string): number {
    if (!response) {
      logger.debug('EvaluatorAgent', 'Coherence score: skipped (empty response)');
      return 0;
    }

    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const hasFlow = sentences.length >= 2;
    const hasTransition = /(however|therefore|in addition|moreover|furthermore|first|second|finally)/i.test(response);

    const adjustments: string[] = [`base: 0.50`];
    let score = 0.5;
    if (hasFlow) { score += 0.2; adjustments.push('flow: +0.20'); }
    if (hasTransition) { score += 0.15; adjustments.push('transition: +0.15'); }

    const finalScore = Math.min(1, Math.max(0.3, score));

    logger.debug('EvaluatorAgent', 'Coherence score detail', {
      sentenceCount: sentences.length,
      hasFlow,
      hasTransition,
      adjustments,
      rawScore: score,
      clampRange: '[0.3, 1.0]',
      finalScore,
    });

    return finalScore;
  }

  private scoreHelpfulness(response: string): number {
    if (!response) {
      logger.debug('EvaluatorAgent', 'Helpfulness score: skipped (empty response)');
      return 0;
    }

    const hasActionable = /(you can|try|should|recommend|suggest|step|guide|how to)/i.test(response);
    const hasExamples = /(for example|e\.g\.|such as|like)/i.test(response);
    const hasConclusion = /(in conclusion|to summarize|overall|therefore)/i.test(response);

    const adjustments: string[] = [`base: 0.50`];
    let score = 0.5;
    if (hasActionable) { score += 0.2; adjustments.push('actionable: +0.20'); }
    if (hasExamples) { score += 0.15; adjustments.push('examples: +0.15'); }
    if (hasConclusion) { score += 0.1; adjustments.push('conclusion: +0.10'); }

    const finalScore = Math.min(1, Math.max(0.3, score));

    logger.debug('EvaluatorAgent', 'Helpfulness score detail', {
      hasActionable,
      hasExamples,
      hasConclusion,
      adjustments,
      rawScore: score,
      clampRange: '[0.3, 1.0]',
      finalScore,
    });

    return finalScore;
  }
}

export class AgentFactory {
  static create(config: AgentConfig, llmService: LLMService): Agent {
    const llmAdapter = {
      chat: async (messages: ChatMessage[], options?: Record<string, any>) => {
        const response = await llmService.chatCompletion({
          model: config.modelId || 'gpt-4o',
          messages,
          temperature: options?.temperature ?? 0.3,
          maxTokens: options?.maxTokens ?? 4096,
        }, config.modelId);
        return { content: response.choices[0]?.message?.content || '' };
      },
    };

    const { StrategyFactory } = require('./ThinkingStrategy');
    const strategy = StrategyFactory.create(config.strategy, llmAdapter);

    switch (config.type) {
      case 'planner':
        return new PlannerAgent(config.id, config.name, 'planner', strategy, llmService);
      case 'worker':
        return new WorkerAgent(config.id, config.name, 'worker', strategy, llmService);
      case 'synthesizer':
        return new SynthesizerAgent(config.id, config.name, 'synthesizer', strategy, llmService);
      case 'evaluator':
        return new EvaluatorAgent(config.id, config.name, 'evaluator', strategy, llmService);
      default:
        return new WorkerAgent(config.id, config.name, 'worker', strategy, llmService);
    }
  }
}
