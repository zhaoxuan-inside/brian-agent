import { LLMService } from '../core/llm';
import { InformationService } from '../core/information';
import type { ChatMessage, LLMResponse } from '../shared/types';
import { StrategyFactory } from '../strategy/ThinkingStrategy';

export class TaskPlanner {
  private llm: LLMService;
  private information: InformationService;

  constructor(llm: LLMService, information: InformationService) {
    this.llm = llm;
    this.information = information;
  }

  /**
   * Plan a complete task graph from a user message.
   */
  async plan(
    userMessage: string,
    memoryContext: any
  ): Promise<{
    nodes: { id: string; description: string; agentType: string; dependencies: string[] }[];
    edges: { from: string; to: string }[];
  }> {
    // Step 1: Analyze intent
    const intent = await this.analyzeIntent(userMessage);

    // Step 2: Decompose into sub-tasks
    const subTasks = this.decompose(intent);

    // Step 3: Build task graph
    const taskGraph = this.buildTaskGraph(subTasks);

    return taskGraph;
  }

  /**
   * Analyze the user's intent using LLM.
   */
  async analyzeIntent(userMessage: string): Promise<{
    intent: string;
    confidence: number;
    entities: string[];
  }> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an intent analyzer. Analyze the user's message and extract:
1. The primary intent (what the user wants to accomplish)
2. Confidence level (0-1)
3. Key entities mentioned

Respond as JSON:
{
  "intent": "string",
  "confidence": number,
  "entities": ["string"]
}`,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.1 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          intent: parsed.intent || 'general',
          confidence: parsed.confidence || 0.5,
          entities: parsed.entities || [],
        };
      }
    } catch {
      // LLM call failed, fall back to basic analysis
    }

    // Fallback: basic intent detection
    const lower = userMessage.toLowerCase();
    let intent = 'general';
    let confidence = 0.3;
    const entities: string[] = [];

    if (/code|program|develop|build|implement|function|class|api|endpoint/i.test(lower)) {
      intent = 'code_generation';
      confidence = 0.6;
    } else if (/fix|debug|error|bug|issue|solve|resolve|troubleshoot/i.test(lower)) {
      intent = 'debugging';
      confidence = 0.6;
    } else if (/explain|describe|what is|how does|why/i.test(lower)) {
      intent = 'explanation';
      confidence = 0.5;
    } else if (/analyze|review|audit|check|inspect|examine/i.test(lower)) {
      intent = 'analysis';
      confidence = 0.5;
    } else if (/create|make|generate|write|design|build/i.test(lower)) {
      intent = 'creation';
      confidence = 0.5;
    } else if (/search|find|look|locate|retrieve/i.test(lower)) {
      intent = 'search';
      confidence = 0.5;
    } else if (/summarize|summary|brief|tldr|recap/i.test(lower)) {
      intent = 'summarization';
      confidence = 0.6;
    } else if (/translate|convert/i.test(lower)) {
      intent = 'transformation';
      confidence = 0.5;
    }

    // Extract simple entities
    const urlMatch = userMessage.match(/https?:\/\/[^\s]+/g);
    if (urlMatch) entities.push(...urlMatch);

    const properNounMatch = userMessage.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (properNounMatch) entities.push(...properNounMatch);

    return { intent, confidence, entities };
  }

  /**
   * Decompose a high-level intent into sub-tasks using LLM.
   */
  decompose(intent: {
    intent: string;
    entities: string[];
  }): { id: string; description: string; agentType: string; dependencies: string[] }[] {
    const subTasks: { id: string; description: string; agentType: string; dependencies: string[] }[] = [];

    const intentLower = intent.intent.toLowerCase();

    // Pattern-based decomposition for common intent types
    if (intentLower.includes('code_generation') || intentLower.includes('creation')) {
      subTasks.push(
        { id: 'task_1', description: 'Analyze requirements and plan the implementation', agentType: 'generator', dependencies: [] },
        { id: 'task_2', description: 'Research relevant patterns and best practices', agentType: 'searcher', dependencies: [] },
        { id: 'task_3', description: 'Generate the code implementation', agentType: 'generator', dependencies: ['task_1', 'task_2'] },
        { id: 'task_4', description: 'Review the generated code for quality and correctness', agentType: 'custom', dependencies: ['task_3'] },
      );
    } else if (intentLower.includes('debugging') || intentLower.includes('fix')) {
      subTasks.push(
        { id: 'task_1', description: 'Analyze the error or bug description', agentType: 'custom', dependencies: [] },
        { id: 'task_2', description: 'Search for similar issues and solutions', agentType: 'searcher', dependencies: [] },
        { id: 'task_3', description: 'Identify the root cause', agentType: 'custom', dependencies: ['task_1', 'task_2'] },
        { id: 'task_4', description: 'Propose and implement a fix', agentType: 'generator', dependencies: ['task_3'] },
        { id: 'task_5', description: 'Verify the fix resolves the issue', agentType: 'custom', dependencies: ['task_4'] },
      );
    } else if (intentLower.includes('analysis') || intentLower.includes('review')) {
      subTasks.push(
        { id: 'task_1', description: 'Gather relevant information and context', agentType: 'searcher', dependencies: [] },
        { id: 'task_2', description: 'Analyze the gathered information', agentType: 'custom', dependencies: ['task_1'] },
        { id: 'task_3', description: 'Generate findings and recommendations', agentType: 'generator', dependencies: ['task_2'] },
      );
    } else if (intentLower.includes('search')) {
      subTasks.push(
        { id: 'task_1', description: 'Execute the search query', agentType: 'searcher', dependencies: [] },
        { id: 'task_2', description: 'Filter and rank the results', agentType: 'custom', dependencies: ['task_1'] },
        { id: 'task_3', description: 'Summarize the findings', agentType: 'generator', dependencies: ['task_2'] },
      );
    } else {
      // General task decomposition
      subTasks.push(
        { id: 'task_1', description: 'Understand the request and gather context', agentType: 'custom', dependencies: [] },
        { id: 'task_2', description: 'Execute the primary task', agentType: 'generator', dependencies: ['task_1'] },
        { id: 'task_3', description: 'Review and refine the output', agentType: 'custom', dependencies: ['task_2'] },
      );
    }

    return subTasks;
  }

  /**
   * Build a task graph from sub-tasks, creating edges based on dependencies.
   */
  buildTaskGraph(subTasks: {
    id: string;
    description: string;
    agentType: string;
    dependencies: string[];
  }[]): {
    nodes: { id: string; description: string; agentType: string; dependencies: string[] }[];
    edges: { from: string; to: string }[];
  } {
    const edges: { from: string; to: string }[] = [];

    for (const task of subTasks) {
      for (const depId of task.dependencies) {
        edges.push({ from: depId, to: task.id });
      }
    }

    // Identify independent tasks (no dependencies) that can run in parallel
    const independent = subTasks.filter(t => t.dependencies.length === 0);
    const dependent = subTasks.filter(t => t.dependencies.length > 0);

    return {
      nodes: subTasks,
      edges,
    };
  }

  /**
   * Assign agents to sub-tasks based on agent type and capabilities.
   */
  assignAgents(
    subTasks: { id: string; description: string; agentType: string; dependencies: string[] }[],
    availableAgents: any[]
  ): { taskId: string; agentId: string }[] {
    const assignments: { taskId: string; agentId: string }[] = [];

    for (const task of subTasks) {
      // Find matching agent by type
      const matchingAgent = availableAgents.find(
        (a: any) => {
          if (a.agentType) return a.agentType === task.agentType;
          if (a.role) return a.role.toLowerCase() === task.agentType.toLowerCase();
          return false;
        }
      );

      if (matchingAgent) {
        assignments.push({ taskId: task.id, agentId: matchingAgent.id });
      } else if (availableAgents.length > 0) {
        // Use the first available agent as fallback
        assignments.push({ taskId: task.id, agentId: availableAgents[0].id });
      }
    }

    return assignments;
  }

  /**
   * Estimate the complexity of sub-tasks (0-1 scale).
   */
  estimateComplexity(
    subTasks: { id: string; description: string; agentType: string; dependencies: string[] }[]
  ): number {
    if (subTasks.length === 0) return 0;

    let complexityScore = 0;

    // More sub-tasks = higher complexity
    complexityScore += Math.min(subTasks.length / 10, 0.4);

    // More dependencies = higher complexity
    const totalDeps = subTasks.reduce((sum, t) => sum + t.dependencies.length, 0);
    complexityScore += Math.min(totalDeps / (subTasks.length * 2), 0.3);

    // Agent type complexity
    const complexTypes = ['generator', 'custom', 'coordinator'];
    const complexCount = subTasks.filter(t => complexTypes.includes(t.agentType)).length;
    complexityScore += Math.min(complexCount / subTasks.length, 0.3);

    return Math.min(complexityScore, 1.0);
  }

  /**
   * Select the best execution strategy based on complexity and intent.
   */
  selectStrategy(complexity: number, intent: string): string {
    return StrategyFactory.select({ intent, complexity });
  }
}