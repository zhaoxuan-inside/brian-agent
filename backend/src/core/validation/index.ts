import { LLMService } from '../llm';
import type { ChatMessage } from '../../shared/types';

interface ScoreBreakdown {
  accuracy: number;
  completeness: number;
  relevance: number;
  depth: number;
  clarity: number;
}

interface ScoreResult {
  totalScore: number;
  breakdown: ScoreBreakdown;
  feedback: string;
  suggestions: string[];
  needsRetry: boolean;
}

type MemoryPolicy = 'always' | 'auto_high_score' | 'user_approved';

export class ValidationService {
  private llm: LLMService;
  private threshold: number;
  private maxRetries: number;
  private policy: MemoryPolicy;

  constructor(llm: LLMService, threshold: number = 70) {
    this.llm = llm;
    this.threshold = threshold;
    this.maxRetries = 3;
    this.policy = 'auto_high_score';
  }

  // ============================================================
  // Scoring Worker
  // ============================================================

  async scoreAnswer(
    question: string,
    answer: string,
    context?: string
  ): Promise<ScoreResult> {
    const prompt = this.buildScoringPrompt(question, answer, context);

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are an expert answer evaluator. You score answers on 5 dimensions. Always respond with valid JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.1 });
      const parsed = this.parseScoreResponse(response.content);

      const breakdown: ScoreBreakdown = {
        accuracy: parsed.accuracy || 0,
        completeness: parsed.completeness || 0,
        relevance: parsed.relevance || 0,
        depth: parsed.depth || 0,
        clarity: parsed.clarity || 0,
      };

      const totalScore = breakdown.accuracy + breakdown.completeness +
        breakdown.relevance + breakdown.depth + breakdown.clarity;

      const needsRetry = totalScore < this.threshold;

      return {
        totalScore,
        breakdown,
        feedback: parsed.feedback || '',
        suggestions: parsed.suggestions || [],
        needsRetry,
      };
    } catch {
      // Fallback: use heuristic scoring
      return this.heuristicScore(question, answer);
    }
  }

  async validateAndImprove(
    question: string,
    initialAnswer: string,
    context?: string
  ): Promise<{ finalAnswer: string; score: number; retryCount: number }> {
    let currentAnswer = initialAnswer;
    let retryCount = 0;

    while (retryCount < this.maxRetries) {
      const scoreResult = await this.scoreAnswer(question, currentAnswer, context);

      if (!scoreResult.needsRetry) {
        return {
          finalAnswer: currentAnswer,
          score: scoreResult.totalScore,
          retryCount,
        };
      }

      // Generate improved answer
      currentAnswer = await this.generateImprovedAnswer(
        question,
        currentAnswer,
        scoreResult,
        context
      );
      retryCount++;
    }

    // Final score after max retries
    const finalScore = await this.scoreAnswer(question, currentAnswer, context);

    return {
      finalAnswer: currentAnswer,
      score: finalScore.totalScore,
      retryCount,
    };
  }

  async generateImprovedAnswer(
    question: string,
    currentAnswer: string,
    scoreResult: ScoreResult,
    context?: string
  ): Promise<string> {
    const improvementPrompt = `You are improving an answer based on quality feedback.

ORIGINAL QUESTION:
${question}

${context ? `CONTEXT:\n${context}\n` : ''}

CURRENT ANSWER:
${currentAnswer}

QUALITY SCORE: ${scoreResult.totalScore}/100

DIMENSION SCORES:
- Accuracy: ${scoreResult.breakdown.accuracy}/20
- Completeness: ${scoreResult.breakdown.completeness}/20
- Relevance: ${scoreResult.breakdown.relevance}/20
- Depth: ${scoreResult.breakdown.depth}/20
- Clarity: ${scoreResult.breakdown.clarity}/20

FEEDBACK:
${scoreResult.feedback}

SUGGESTIONS FOR IMPROVEMENT:
${scoreResult.suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Please provide an improved version of the answer that addresses the feedback above.
Focus especially on the lowest-scoring dimensions.
Provide ONLY the improved answer, no additional commentary.`;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are an expert answer improver. Your task is to improve answers based on quality feedback. Provide only the improved answer.',
      },
      {
        role: 'user',
        content: improvementPrompt,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.3 });
      return response.content.trim();
    } catch {
      // If LLM call fails, return the original answer
      return currentAnswer;
    }
  }

  getThreshold(): number {
    return this.threshold;
  }

  // ============================================================
  // Memory Gatekeeper
  // ============================================================

  async shouldWriteToMemory(
    question: string,
    answer: string,
    context?: string,
    userApproved: boolean = false
  ): Promise<boolean> {
    switch (this.policy) {
      case 'always':
        return true;

      case 'auto_high_score': {
        const score = await this.scoreAnswer(question, answer, context);
        return score.totalScore >= this.threshold;
      }

      case 'user_approved':
        return userApproved;

      default:
        return false;
    }
  }

  setPolicy(policy: MemoryPolicy): void {
    this.policy = policy;
  }

  getPolicy(): string {
    return this.policy;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private buildScoringPrompt(question: string, answer: string, context?: string): string {
    return `Evaluate the following answer on a scale of 0-20 for each of the 5 dimensions below.
Respond with a JSON object containing the scores and feedback.

QUESTION:
${question}

${context ? `CONTEXT:\n${context}\n` : ''}

ANSWER:
${answer}

Evaluate on these dimensions (each 0-20):
1. accuracy - How factually correct is the answer?
2. completeness - Does it cover all aspects of the question?
3. relevance - How relevant is the answer to the question?
4. depth - How deep/insightful is the analysis?
5. clarity - How clear and well-structured is the answer?

Respond with ONLY a JSON object in this exact format:
{
  "accuracy": <number 0-20>,
  "completeness": <number 0-20>,
  "relevance": <number 0-20>,
  "depth": <number 0-20>,
  "clarity": <number 0-20>,
  "feedback": "<brief overall feedback, 1-2 sentences>",
  "suggestions": ["<suggestion 1>", "<suggestion 2>"]
}

Do not include any text outside the JSON object.`;
  }

  private parseScoreResponse(content: string): {
    accuracy?: number;
    completeness?: number;
    relevance?: number;
    depth?: number;
    clarity?: number;
    feedback?: string;
    suggestions?: string[];
  } {
    try {
      // Try to extract JSON from the response
      let jsonStr = content.trim();

      // Remove markdown code fences if present
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*\n/, '').replace(/\n```\s*$/, '');
      }

      return JSON.parse(jsonStr);
    } catch {
      // Try to extract JSON using regex
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          // Fall through to default
        }
      }

      return {};
    }
  }

  private heuristicScore(question: string, answer: string): ScoreResult {
    let accuracy = 10;
    let completeness = 10;
    let relevance = 10;
    let depth = 10;
    let clarity = 10;

    // Heuristic: answer length
    if (answer.length < 10) {
      completeness = 2;
      depth = 2;
      clarity = 5;
    } else if (answer.length < 50) {
      completeness = 8;
      depth = 8;
    } else if (answer.length > 500) {
      depth = 16;
      completeness = 16;
      clarity = 14;
    }

    // Heuristic: contains key terms from question
    const questionWords = new Set(
      question.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );
    const answerLower = answer.toLowerCase();
    let matchedWords = 0;
    for (const w of questionWords) {
      if (answerLower.includes(w)) matchedWords++;
    }
    if (questionWords.size > 0) {
      relevance = Math.min(20, Math.round((matchedWords / questionWords.size) * 20));
    }

    // Heuristic: structure
    if (answer.includes('\n')) {
      clarity += 3;
    }
    if (answer.match(/^[a-z]\)/im) || answer.match(/^\d+\./m)) {
      clarity += 3;
      depth += 2;
    }

    // Heuristic: code blocks or examples
    if (answer.includes('```') || answer.includes('`')) {
      depth += 3;
      accuracy += 2;
    }

    const breakdown: ScoreBreakdown = {
      accuracy: Math.min(20, Math.max(0, accuracy)),
      completeness: Math.min(20, Math.max(0, completeness)),
      relevance: Math.min(20, Math.max(0, relevance)),
      depth: Math.min(20, Math.max(0, depth)),
      clarity: Math.min(20, Math.max(0, clarity)),
    };

    const totalScore = breakdown.accuracy + breakdown.completeness +
      breakdown.relevance + breakdown.depth + breakdown.clarity;

    const suggestions: string[] = [];
    if (breakdown.completeness < 12) suggestions.push('Provide more comprehensive coverage of the topic.');
    if (breakdown.relevance < 12) suggestions.push('Ensure the answer directly addresses the question asked.');
    if (breakdown.depth < 12) suggestions.push('Add more detailed analysis, examples, or technical depth.');
    if (breakdown.clarity < 12) suggestions.push('Improve structure with clear sections, bullet points, or numbered lists.');

    return {
      totalScore,
      breakdown,
      feedback: `Heuristic evaluation: ${totalScore}/100`,
      suggestions,
      needsRetry: totalScore < this.threshold,
    };
  }
}