import { z } from 'zod';
import { ChatMessage } from '../base/LLMWrapper';

export const StrategyTypeSchema = z.enum(['react', 'plan-execute', 'cot', 'reflexion']);
export type StrategyType = z.infer<typeof StrategyTypeSchema>;

export interface ThinkingStrategy {
  type: StrategyType;
  execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    thought: string;
    action?: { type: string; payload: any };
    response?: string;
  }>;
}

export interface StrategyContext {
  tools?: { name: string; description: string; parameters: Record<string, any> }[];
  previousResults?: { thought: string; action?: { type: string; payload: any }; response?: string }[];
  previousErrors?: string[];
  maxIterations?: number;
}

export abstract class BaseStrategy implements ThinkingStrategy {
  constructor(
    public type: StrategyType,
    protected llm?: { chat: (messages: ChatMessage[], options?: Record<string, any>) => Promise<{ content: string }> }
  ) {}

  abstract execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    thought: string;
    action?: { type: string; payload: any };
    response?: string;
  }>;

  protected async callLLM(messages: ChatMessage[], fallbackThought: string, fallbackMessage: string): Promise<{
    thought: string;
    action?: { type: string; payload: any };
    response?: string;
  }> {
    if (!this.llm) {
      return {
        thought: fallbackThought,
        action: { type: 'analyze', payload: { messages } },
      };
    }

    try {
      const response = await this.llm.chat(messages, { temperature: 0.3 });
      const content = response.content;

      const thoughtMatch = content.match(/Thought:\s*(.+?)(?:\n|$)/is);
      const actionMatch = content.match(/Action:\s*(.+?)(?:\n|$)/i);
      const responseMatch = content.match(/Response:\s*([\s\S]*)/i);

      return {
        thought: thoughtMatch ? thoughtMatch[1].trim() : content,
        action: actionMatch ? { type: actionMatch[1].trim(), payload: {} } : undefined,
        response: responseMatch ? responseMatch[1].trim() : undefined,
      };
    } catch {
      return {
        thought: fallbackMessage,
        action: { type: 'analyze', payload: { messages } },
      };
    }
  }

  protected formatMessages(messages: ChatMessage[]): string {
    return messages.map(m => `${m.role}: ${m.content}`).join('\n');
  }
}

export class ReACTStrategy extends BaseStrategy {
  constructor(llm?: { chat: (messages: ChatMessage[], options?: Record<string, any>) => Promise<{ content: string }> }) {
    super('react', llm);
  }

  async execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    thought: string;
    action?: { type: string; payload: any };
    response?: string;
  }> {
    const tools = context.tools || [];
    const toolDescriptions = tools.map((t: any) =>
      `- ${t.name}: ${t.description || 'No description'}. Parameters: ${JSON.stringify(t.parameters || {})}`
    ).join('\n');

    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are a ReACT (Reasoning + Acting) agent. Think step by step and decide what to do.

Available tools:
${toolDescriptions || 'None'}

Format your response exactly as:
Thought: [your reasoning about what to do]
Action: [tool_name with parameters]
OR if you have a final answer:
Thought: [your reasoning]
Response: [your final answer]`,
    };

    return this.callLLM(
      [systemMessage, ...messages],
      'Analyzing the request and determining the best course of action',
      'Failed to execute ReACT strategy'
    );
  }
}

export class PlanExecuteStrategy extends BaseStrategy {
  constructor(llm?: { chat: (messages: ChatMessage[], options?: Record<string, any>) => Promise<{ content: string }> }) {
    super('plan-execute', llm);
  }

  async execute(messages: ChatMessage[], _context: Record<string, any>): Promise<{
    thought: string;
    action?: { type: string; payload: any };
    response?: string;
  }> {
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are a Plan-Execute agent. First create a plan, then execute it.

Format your response as:
Thought: [your planning analysis]
Plan: [step-by-step plan]
OR if you need to execute:
Action: [action_name] with parameters [parameters]`,
    };

    return this.callLLM(
      [systemMessage, ...messages],
      'Breaking down the task into steps and creating an execution plan',
      'Failed to execute Plan-Execute strategy'
    );
  }
}

export class CoTStrategy extends BaseStrategy {
  constructor(llm?: { chat: (messages: ChatMessage[], options?: Record<string, any>) => Promise<{ content: string }> }) {
    super('cot', llm);
  }

  async execute(messages: ChatMessage[], _context: Record<string, any>): Promise<{
    thought: string;
    action?: { type: string; payload: any };
    response?: string;
  }> {
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are a Chain of Thought (CoT) reasoning agent. Think through the problem step by step.

Format your response as:
Thought: Step 1: [first reasoning step]
Thought: Step 2: [next reasoning step]
...
Response: [your final conclusion]`,
    };

    return this.callLLM(
      [systemMessage, ...messages],
      'Thinking through the problem step by step using chain of thought reasoning',
      'Failed to execute CoT strategy'
    );
  }
}

export class ReflexionStrategy extends BaseStrategy {
  constructor(llm?: { chat: (messages: ChatMessage[], options?: Record<string, any>) => Promise<{ content: string }> }) {
    super('reflexion', llm);
  }

  async execute(messages: ChatMessage[], context: Record<string, any>): Promise<{
    thought: string;
    action?: { type: string; payload: any };
    response?: string;
  }> {
    const previousResults = context.previousResults || [];
    const previousErrors = context.previousErrors || [];

    const reflectionContext = previousResults.length > 0
      ? `Previous results:\n${previousResults.map((r: any) => `- ${r.thought}`).join('\n')}`
      : 'No previous results';

    const errorContext = previousErrors.length > 0
      ? `Previous errors:\n${previousErrors.map((e: string) => `- ${e}`).join('\n')}`
      : '';

    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are a Reflexion agent. Analyze previous actions and outcomes to improve the approach.

${reflectionContext}
${errorContext}

Format your response as:
Thought: [your reflection on what worked and what didn't]
Action: [improved approach] or
Response: [your conclusion if no further action is needed]`,
    };

    return this.callLLM(
      [systemMessage, ...messages],
      'Reflecting on previous actions and outcomes to improve the approach',
      'Failed to execute Reflexion strategy'
    );
  }
}

export class StrategyFactory {
  static create(
    type: StrategyType,
    llm?: { chat: (messages: ChatMessage[], options?: Record<string, any>) => Promise<{ content: string }> }
  ): ThinkingStrategy {
    switch (type) {
      case 'react':
        return new ReACTStrategy(llm);
      case 'plan-execute':
        return new PlanExecuteStrategy(llm);
      case 'cot':
        return new CoTStrategy(llm);
      case 'reflexion':
        return new ReflexionStrategy(llm);
      default:
        return new CoTStrategy(llm);
    }
  }

  /**
   * Select the optimal strategy type based on task characteristics.
   * CoT is the default strategy for all unrecognized/ambiguous tasks.
   */
  static select(task: {
    intent: string;
    complexity: number;
    domain?: string;
  }): StrategyType {
    if (task.complexity >= 0.7) {
      return 'plan-execute';
    }

    if (task.complexity >= 0.4 && task.complexity < 0.7) {
      const reasoningIntents = ['analysis', 'explanation', 'comparison', 'summarization', 'planning'];
      if (reasoningIntents.includes(task.intent) || (task.domain && /math|logic|science|reasoning|code/i.test(task.domain))) {
        return 'cot';
      }
    }

    const actionIntents = ['debugging', 'code_generation', 'creation', 'search', 'transformation'];
    if (actionIntents.includes(task.intent)) {
      return 'react';
    }

    return 'cot';
  }
}