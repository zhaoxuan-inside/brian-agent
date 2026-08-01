import { LLMService } from '../core/llm';
import { ToolService } from '../core/tools';
import { v4 as uuidv4 } from 'uuid';
import type { GraphState, WorkAgent, ChatMessage } from '../shared/types';
import { createCheckpoint, restoreCheckpoint } from './infra/stateManager';
import { executeReACT, executePlanExecute, executeCoT } from './strategy';

export class GraphExecutor {
  private llm: LLMService;
  private tools: ToolService;

  constructor(llm: LLMService, tools: ToolService) {
    this.llm = llm;
    this.tools = tools;
  }

  // ============================================================
  // DSG (Directed Sub-Graph)
  // ============================================================

  createGraph(nodes: any[], edges: any[]): { nodes: any[]; edges: any[] } {
    return { nodes: [...nodes], edges: [...edges] };
  }

  addNode(graph: { nodes: any[]; edges: any[] }, node: any): void {
    graph.nodes.push(node);
  }

  addEdge(graph: { nodes: any[]; edges: any[] }, edge: any): void {
    graph.edges.push(edge);
  }

  addConditionalEdge(
    graph: { nodes: any[]; edges: any[] },
    from: string,
    conditions: { condition: (state: GraphState) => boolean; to: string }[]
  ): void {
    for (const c of conditions) {
      graph.edges.push({
        from,
        to: c.to,
        type: 'conditional',
        condition: c.condition,
      });
    }
  }

  topologicalSort(graph: { nodes: any[]; edges: any[] }): string[] {
    const nodeIds = new Set<string>(graph.nodes.map((n: any) => n.id));
    const inDegree: Map<string, number> = new Map();
    const adjacency: Map<string, string[]> = new Map();

    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }

    for (const edge of graph.edges) {
      if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        adjacency.get(edge.from)?.push(edge.to);
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const neighbor of adjacency.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (sorted.length !== nodeIds.size) {
      // Cycle detected
      return [];
    }

    return sorted;
  }

  detectCycle(graph: { nodes: any[]; edges: any[] }): string[][] | null {
    const sorted = this.topologicalSort(graph);
    if (sorted.length === graph.nodes.length) {
      return null; // No cycle
    }

    // Find cycles using DFS
    const nodeIds = new Set<string>(graph.nodes.map((n: any) => n.id));
    const adjacency: Map<string, string[]> = new Map();
    for (const id of nodeIds) {
      adjacency.set(id, []);
    }
    for (const edge of graph.edges) {
      if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
        adjacency.get(edge.from)?.push(edge.to);
      }
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack: string[] = [];

    function dfs(node: string): boolean {
      if (stack.includes(node)) {
        const cycleStart = stack.indexOf(node);
        cycles.push([...stack.slice(cycleStart), node]);
        return true;
      }
      if (visited.has(node)) return false;

      visited.add(node);
      stack.push(node);

      for (const neighbor of adjacency.get(node) || []) {
        if (dfs(neighbor)) return true;
      }

      stack.pop();
      return false;
    }

    for (const node of nodeIds) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles.length > 0 ? cycles : null;
  }

  // ============================================================
  // Pregel BSP (Bulk Synchronous Parallel)
  // ============================================================

  async fanOut(
    subTasks: { id: string; agent: WorkAgent }[]
  ): Promise<{ id: string; result: any }[]> {
    const results = await Promise.all(
      subTasks.map(async (task) => {
        try {
          const messages: ChatMessage[] = [
            {
              role: 'system',
              content: task.agent.prompt.system,
            },
            {
              role: 'user',
              content: task.agent.prompt.instruction,
            },
          ];
          const response = await this.llm.chat(messages);
          return { id: task.id, result: { content: response.content, usage: response.usage } };
        } catch (err: any) {
          return { id: task.id, result: { error: err.message } };
        }
      })
    );

    return results;
  }

  async barrier(): Promise<void> {
    // In BSP, barrier ensures all workers finish before reduce.
    // Since fanOut uses Promise.all, barrier is implicit.
    // This method exists for explicit checkpoint / logging purposes.
    return Promise.resolve();
  }

  reduce(results: { id: string; result: any }[]): any {
    const combined: Record<string, any> = {};
    for (const r of results) {
      combined[r.id] = r.result;
    }
    return combined;
  }

  // ============================================================
  // ReACT
  // ============================================================

  async executeReACT(
    task: string,
    agent: WorkAgent,
    _state: GraphState
  ): Promise<{ result: string; trace: any[] }> {
    const llmTools = this.tools.getToolsForLLM();

    // Build a wrapped LLM interface that includes agent context
    const wrappedLlm = {
      chat: async (messages: ChatMessage[], options?: any) => {
        const fullMessages: ChatMessage[] = [
          { role: 'system', content: agent.prompt.system },
          ...messages,
        ];
        const opts = { ...(options || {}), modelId: agent.llm?.modelId || agent.llm };
        return this.llm.chat(fullMessages, opts);
      },
    };

    return executeReACT(task, llmTools, wrappedLlm);
  }

  // ============================================================
  // Plan-Execute
  // ============================================================

  async executePlanExecute(
    task: string,
    agent: WorkAgent,
    _state: GraphState
  ): Promise<{ plan: any; result: string }> {
    const wrappedLlm = {
      chat: async (messages: ChatMessage[], options?: any) => {
        const fullMessages: ChatMessage[] = [
          { role: 'system', content: agent.prompt.system },
          ...messages,
        ];
        const opts = { ...(options || {}), modelId: agent.llm?.modelId || agent.llm };
        return this.llm.chat(fullMessages, opts);
      },
    };

    return executePlanExecute(task, wrappedLlm);
  }

  // ============================================================
  // Conditional Graph
  // ============================================================

  evaluateCondition(
    state: GraphState,
    condition: (state: GraphState) => boolean
  ): boolean {
    try {
      return condition(state);
    } catch {
      return false;
    }
  }

  route(state: GraphState, edges: any[]): string | null {
    for (const edge of edges) {
      if (edge.type === 'conditional' && edge.condition) {
        if (this.evaluateCondition(state, edge.condition)) {
          return edge.to;
        }
      }
    }
    return null;
  }

  // ============================================================
  // Sub-Agent
  // ============================================================

  spawnSubAgent(parentId: string, task: any): WorkAgent {
    const subAgent: WorkAgent = {
      id: uuidv4(),
      name: `sub-${parentId}-${Date.now()}`,
      taskFeatures: { parentId, task },
      strategy: 'react',
      llm: { providerId: '', modelId: '', temperature: 0.3, maxTokens: 2048 },
      prompt: {
        system: `You are a sub-agent spawned by agent ${parentId}. Complete the assigned task efficiently.`,
        instruction: typeof task === 'string' ? task : JSON.stringify(task),
      },
      skillIds: [],
      mcpIds: [],
      soulId: '',
      strength: 1.0,
      useCount: 0,
      lastUsedAt: Date.now(),
      feedbackHistory: [],
      reliability: 0.5,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return subAgent;
  }

  aggregateResults(subAgentIds: string[]): any {
    return { subAgentIds, count: subAgentIds.length };
  }

  // ============================================================
  // Checkpoint
  // ============================================================

  createCheckpoint(state: GraphState, label: string): string {
    return createCheckpoint(state, label);
  }

  restoreCheckpoint(state: GraphState, checkpointId: string): GraphState {
    return restoreCheckpoint(state, checkpointId);
  }

  // ============================================================
  // Reflector
  // ============================================================

  async reflect(
    output: string,
    context: string
  ): Promise<{
    qualityScore: number;
    shouldRetry: boolean;
    shouldSwitchStrategy: boolean;
    feedback: string;
  }> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a quality evaluator. Assess the quality of the following output.
Consider: correctness, completeness, clarity, relevance, and usefulness.

Respond with JSON:
{
  "qualityScore": number (0-1),
  "shouldRetry": boolean,
  "shouldSwitchStrategy": boolean,
  "feedback": "string explaining the assessment"
}`,
      },
      {
        role: 'user',
        content: `Context: ${context}\n\nOutput to evaluate:\n${output}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.1 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          qualityScore: parsed.qualityScore ?? 0.5,
          shouldRetry: parsed.shouldRetry ?? false,
          shouldSwitchStrategy: parsed.shouldSwitchStrategy ?? false,
          feedback: parsed.feedback || 'No feedback provided',
        };
      }
    } catch {
      // LLM evaluation failed, use heuristic
    }

    // Heuristic quality assessment
    let qualityScore = 0.5;
    if (output && output.length > 50) qualityScore += 0.1;
    if (output && output.length > 200) qualityScore += 0.1;
    if (output && !/error|fail|sorry|unable|cannot/i.test(output)) qualityScore += 0.1;
    if (output && /\n/.test(output)) qualityScore += 0.1; // Structured output
    qualityScore = Math.min(qualityScore, 1.0);

    return {
      qualityScore,
      shouldRetry: qualityScore < 0.5,
      shouldSwitchStrategy: qualityScore < 0.3,
      feedback: `Heuristic quality score: ${qualityScore}`,
    };
  }

  shouldRetry(
    score: number,
    maxIterations: number,
    currentIteration: number
  ): boolean {
    return score < 0.5 && currentIteration < maxIterations;
  }

  // ============================================================
  // Strategy Fusion
  // ============================================================

  analyzeTask(task: string): {
    features: Record<string, unknown>;
    recommendedStrategy: string;
    alternatives: string[];
  } {
    const lower = task.toLowerCase();
    const features: Record<string, unknown> = {};

    // Detect task features
    features.hasCode = /code|program|function|class|api|algorithm/i.test(lower);
    features.needsSearch = /search|find|lookup|retrieve|fetch/i.test(lower);
    features.isCreative = /creative|write|design|generate|brainstorm/i.test(lower);
    features.isAnalytical = /analyze|review|audit|evaluate|compare/i.test(lower);
    features.isDebugging = /debug|fix|error|bug|issue|solve|troubleshoot/i.test(lower);
    features.complexity = this.estimateComplexity(task);

    let recommendedStrategy = 'react';
    const alternatives: string[] = [];

    if (features.complexity as number >= 0.7) {
      recommendedStrategy = 'plan-execute';
      alternatives.push('react', 'hybrid');
    } else if (features.isAnalytical) {
      recommendedStrategy = 'cot';
      alternatives.push('react', 'plan-execute');
    } else if (features.isDebugging) {
      recommendedStrategy = 'react';
      alternatives.push('plan-execute');
    } else {
      recommendedStrategy = 'react';
      alternatives.push('cot', 'plan-execute');
    }

    return { features, recommendedStrategy, alternatives };
  }

  private estimateComplexity(task: string): number {
    let complexity = 0.1;
    const words = task.split(/\s+/).length;
    complexity += Math.min(words / 100, 0.2);

    const complexityIndicators = [
      /multiple|several|many|various|complex|advanced|enterprise/i,
      /database|auth|security|scalability|performance|optimization/i,
      /integration|migration|refactor|architecture|system design/i,
      /real-time|streaming|distributed|microservice|kubernetes/i,
    ];

    for (const indicator of complexityIndicators) {
      if (indicator.test(task)) {
        complexity += 0.15;
      }
    }

    return Math.min(complexity, 1.0);
  }

  composeStrategies(strategies: string[]): {
    primary: string;
    fallback: string;
    switchCondition: string;
  } {
    return {
      primary: strategies[0] || 'react',
      fallback: strategies[1] || 'plan-execute',
      switchCondition: 'quality_score < 0.3',
    };
  }

  switchStrategy(current: string, _reason: string): string {
    const strategyMap: Record<string, string> = {
      'react': 'plan-execute',
      'plan-execute': 'cot',
      'cot': 'react',
      'hybrid': 'plan-execute',
    };
    return strategyMap[current] || 'react';
  }

  // ============================================================
  // Main Execution
  // ============================================================

  async execute(
    taskGraph: { nodes: any[]; edges: any[] },
    state: GraphState,
    callbacks?: {
      onAgentOutput?: (agentId: string, output: string) => void;
      onAgentStatus?: (agentId: string, status: string) => void;
      onAgentInput?: (agentId: string, input: { systemPrompt: string; instruction: string }) => void;
    },
    signal?: AbortSignal,
  ): Promise<GraphState> {
    // 1. Topological sort the graph
    const sorted = this.topologicalSort(taskGraph);
    if (sorted.length === 0) {
      const cycles = this.detectCycle(taskGraph);
      state.errors.push({
        message: `Circular dependency detected in task graph: ${JSON.stringify(cycles)}`,
      });
      state.finalOutput = 'Error: Circular dependency detected in task graph.';
      return state;
    }

    // 2. Build dependency mapping
    const nodeMap = new Map<string, any>();
    for (const node of taskGraph.nodes) {
      nodeMap.set(node.id, node);
    }

    const depsMap = new Map<string, string[]>();
    const revDepsMap = new Map<string, string[]>();
    for (const node of taskGraph.nodes) {
      depsMap.set(node.id, node.dependencies || []);
      revDepsMap.set(node.id, []);
    }
    for (const edge of taskGraph.edges) {
      const rev = revDepsMap.get(edge.to) || [];
      rev.push(edge.from);
      revDepsMap.set(edge.to, rev);
    }

    const completed = new Set<string>();
    const nodeResults = new Map<string, any>();

    // 3. Execute nodes in topological order, with parallel execution where possible
    let iteration = 0;
    while (completed.size < sorted.length && iteration < state.maxIterations) {
      // Create checkpoint before each iteration
      this.createCheckpoint(state, `iteration_${iteration}`);

      // Find nodes whose dependencies are all completed
      const readyNodes = sorted.filter(id => {
        if (completed.has(id)) return false;
        const deps = depsMap.get(id) || [];
        return deps.every(d => completed.has(d));
      });

      if (readyNodes.length === 0 && completed.size < sorted.length) {
        // Deadlock: some nodes can't be executed because their dependencies aren't completing
        state.errors.push({
          message: 'Execution deadlock: some tasks cannot be completed due to unresolved dependencies',
        });
        break;
      }

      // Execute ready nodes in parallel
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const results = await Promise.all(
        readyNodes.map(async (nodeId) => {
          const node = nodeMap.get(nodeId);
          if (!node) return { nodeId, result: null, error: 'Node not found' };

          callbacks?.onAgentStatus?.(nodeId, 'running');

          try {
            const agent = node.agent as WorkAgent;
            const strategy = agent.strategy || state.currentStrategy;

            let result: any;
            let trace: any[] = [];

            const taskDescription = node.description || node.agent?.prompt?.instruction || 'Execute the task';

            callbacks?.onAgentInput?.(nodeId, {
              systemPrompt: agent.prompt?.system || '',
              instruction: taskDescription,
            });

            switch (strategy) {
              case 'plan-execute': {
                const planResult = await this.executePlanExecute(taskDescription, agent, state);
                result = planResult.result;
                trace = [{ strategy: 'plan-execute', plan: planResult.plan }];
                break;
              }
              case 'cot': {
                const cotResult = await executeCoT(taskDescription, {
                  chat: async (msgs: ChatMessage[], opts?: any) => {
                    const fullMessages: ChatMessage[] = [
                      { role: 'system', content: agent.prompt.system },
                      ...msgs,
                    ];
                    const mergedOpts = { ...(opts || {}), modelId: agent.llm?.modelId || agent.llm };
                    return this.llm.chat(fullMessages, mergedOpts);
                  },
                });
                result = cotResult;
                trace = [{ strategy: 'cot' }];
                break;
              }
              case 'react':
              default: {
                const reactResult = await this.executeReACT(taskDescription, agent, state);
                result = reactResult.result;
                trace = reactResult.trace;
                break;
              }
            }

            // After execution, run Reflector to check quality
            const reflection = await this.reflect(
              typeof result === 'string' ? result : JSON.stringify(result),
              taskDescription
            );

            state.trace.push({
              step: `node_${nodeId}_completed`,
              timestamp: Date.now(),
              data: { nodeId, strategy, reflection },
            });

            // If quality is low, retry with different strategy
            if (reflection.shouldRetry && iteration < state.maxIterations - 1) {
              const newStrategy = this.switchStrategy(strategy, reflection.feedback);
              state.trace.push({
                step: `node_${nodeId}_strategy_switch`,
                timestamp: Date.now(),
                data: { from: strategy, to: newStrategy, reason: reflection.feedback },
              });

              let retryResult: any;
              switch (newStrategy) {
                case 'plan-execute': {
                  const planResult = await this.executePlanExecute(taskDescription, agent, state);
                  retryResult = planResult.result;
                  trace.push({ strategy: 'plan-execute', retry: true });
                  break;
                }
                case 'cot': {
                  retryResult = await executeCoT(taskDescription, {
                    chat: async (msgs: ChatMessage[], opts?: any) => {
                      const fullMessages: ChatMessage[] = [
                        { role: 'system', content: agent.prompt.system },
                        ...msgs,
                      ];
                      const mergedOpts = { ...(opts || {}), modelId: agent.llm?.modelId || agent.llm };
                      return this.llm.chat(fullMessages, mergedOpts);
                    },
                  });
                  trace.push({ strategy: 'cot', retry: true });
                  break;
                }
                default: {
                  const reactResult = await this.executeReACT(taskDescription, agent, state);
                  retryResult = reactResult.result;
                  trace = [...trace, ...reactResult.trace];
                  break;
                }
              }
              result = retryResult;
            }

            callbacks?.onAgentOutput?.(nodeId, typeof result === 'string' ? result : JSON.stringify(result));
            callbacks?.onAgentStatus?.(nodeId, 'completed');

            return { nodeId, result, trace };
          } catch (err: any) {
            state.errors.push({
              message: `Node ${nodeId} failed: ${err.message}`,
              stack: err.stack,
            });
            callbacks?.onAgentStatus?.(nodeId, 'failed');
            return { nodeId, result: null, error: err.message };
          }
        })
      );

      // Process results
      for (const r of results) {
        completed.add(r.nodeId);
        nodeResults.set(r.nodeId, r.result);
        state.subTaskResults.set(r.nodeId, r.result);

        if (r.trace) {
          state.trace.push(...r.trace);
        }
      }

      iteration++;
      state.iterationCount = iteration;
    }

    // 4. Compile final output
    const finalOutputParts: string[] = [];
    for (const [nodeId, result] of nodeResults.entries()) {
      if (result) {
        finalOutputParts.push(`[${nodeId}]: ${typeof result === 'string' ? result : JSON.stringify(result)}`);
      }
    }

    state.finalOutput = finalOutputParts.join('\n\n');
    state.qualityScore = nodeResults.size > 0 ? 0.7 : 0;

    return state;
  }
}