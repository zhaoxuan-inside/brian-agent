import type { ChatMessage, LLMResponse } from '../../shared/types';

export type StrategyType = 'react' | 'plan-execute' | 'cot' | 'conditional-graph' | 'hybrid';

/**
 * Select the optimal strategy based on task characteristics.
 */
export function selectStrategy(task: {
  intent: string;
  complexity: number;
  domain: string;
}): StrategyType {
  // High complexity tasks benefit from plan-execute
  if (task.complexity >= 0.7) {
    return 'plan-execute';
  }

  // Medium complexity with reasoning-heavy tasks use CoT
  if (task.complexity >= 0.4 && task.complexity < 0.7) {
    const reasoningDomains = ['math', 'logic', 'science', 'analysis', 'reasoning', 'code'];
    if (reasoningDomains.some(d => task.domain.toLowerCase().includes(d) || task.intent.toLowerCase().includes(d))) {
      return 'cot';
    }
  }

  // Simple tasks use ReACT
  if (task.complexity < 0.3) {
    return 'react';
  }

  // Default: ReACT for most interactive tasks
  const actionIntents = ['creation', 'fix', 'execution', 'search', 'transformation'];
  if (actionIntents.includes(task.intent)) {
    return 'react';
  }

  const planningIntents = ['planning', 'analysis', 'explanation', 'comparison'];
  if (planningIntents.includes(task.intent)) {
    return 'cot';
  }

  return 'react';
}

/**
 * Execute a task using the ReACT (Reasoning + Acting) loop.
 * Max 5 iterations of Think → Act → Observe.
 */
export async function executeReACT(
  task: any,
  tools: any[],
  llm: any
): Promise<{ result: string; trace: any[] }> {
  const trace: any[] = [];
  const maxIterations = 5;
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a task execution agent using the ReACT (Reasoning + Acting) framework.
For each step, think about what to do, then take an action using available tools.
Format your response as:
Thought: <your reasoning>
Action: <tool_name>
Action Input: <json parameters>

After receiving the observation, continue thinking and acting until you have a final answer.
When you have the final answer, respond with:
Final Answer: <your answer>`,
    },
    {
      role: 'user',
      content: `Task: ${typeof task === 'string' ? task : JSON.stringify(task)}`,
    },
  ];

  // Build tool descriptions for the prompt
  const toolDescriptions = tools
    .map(
      (t: any) =>
        `- ${t.name}: ${t.description || 'No description'}. Input schema: ${JSON.stringify(t.inputSchema || {})}`
    )
    .join('\n');

  messages.push({
    role: 'system',
    content: `Available tools:\n${toolDescriptions}`,
  });

  for (let i = 0; i < maxIterations; i++) {
    let response: LLMResponse;
    try {
      response = await llm.chat(messages, { temperature: 0.3 });
    } catch (err: any) {
      trace.push({
        iteration: i,
        thought: `Error calling LLM: ${err.message}`,
        action: 'error',
        actionInput: {},
        observation: err.message,
      });
      return { result: `Error: ${err.message}`, trace };
    }

    const content = response.content;
    trace.push({ iteration: i, rawResponse: content });

    // Parse the response
    const thoughtMatch = content.match(/Thought:\s*(.+?)(?:\n|$)/is);
    const actionMatch = content.match(/Action:\s*(.+?)(?:\n|$)/i);
    const actionInputMatch = content.match(/Action Input:\s*([\s\S]*?)(?:\n\n|\n(?:Thought|Action|Observation|Final Answer):|$)/i);
    const finalAnswerMatch = content.match(/Final Answer:\s*([\s\S]*)/i);

    const thought = thoughtMatch ? thoughtMatch[1].trim() : content;
    const action = actionMatch ? actionMatch[1].trim() : null;
    const actionInputStr = actionInputMatch ? actionInputMatch[1].trim() : '{}';

    if (finalAnswerMatch) {
      trace.push({
        iteration: i,
        thought,
        action: 'final_answer',
        actionInput: {},
        observation: finalAnswerMatch[1].trim(),
      });
      return { result: finalAnswerMatch[1].trim(), trace };
    }

    if (!action) {
      // No action found, treat the whole response as final answer
      trace.push({
        iteration: i,
        thought,
        action: 'final_answer',
        actionInput: {},
        observation: content,
      });
      return { result: content, trace };
    }

    // Parse action input as JSON
    let actionInput: Record<string, unknown> = {};
    try {
      actionInput = JSON.parse(actionInputStr);
    } catch {
      // Try to parse as key-value pairs
      actionInput = { raw: actionInputStr };
    }

    // Execute the tool
    let observation: string;
    const tool = tools.find((t: any) => t.name === action);
    if (tool) {
      try {
        observation = await tool.execute(actionInput);
      } catch (err: any) {
        observation = `Error executing tool ${action}: ${err.message}`;
      }
    } else {
      observation = `Tool "${action}" not found. Available tools: ${tools.map((t: any) => t.name).join(', ')}`;
    }

    trace.push({
      iteration: i,
      thought,
      action,
      actionInput,
      observation,
    });

    // Add the observation as context for the next iteration
    messages.push({ role: 'assistant', content });
    messages.push({ role: 'user', content: `Observation: ${observation}` });
  }

  // Max iterations reached, ask for final answer
  try {
    messages.push({
      role: 'user',
      content: 'You have reached the maximum number of iterations. Please provide your final answer now.',
    });
    const finalResponse = await llm.chat(messages, { temperature: 0.3 });
    trace.push({ iteration: maxIterations, finalForced: true, rawResponse: finalResponse.content });
    return { result: finalResponse.content, trace };
  } catch {
    return {
      result: 'Maximum iterations reached without a final answer.',
      trace,
    };
  }
}

/**
 * Execute a task using the Plan-Execute strategy.
 * First generate a plan, then execute each step.
 */
export async function executePlanExecute(
  task: any,
  llm: any
): Promise<{ plan: any; result: string }> {
  const taskStr = typeof task === 'string' ? task : JSON.stringify(task);

  // Step 1: Generate a plan
  const planMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a planning agent. Given a task, break it down into a structured plan with clear steps.
Respond with a JSON object containing:
{
  "goal": "description of the overall goal",
  "steps": [
    {
      "id": "step_1",
      "description": "what to do in this step",
      "expectedOutput": "what this step should produce",
      "dependencies": ["step_id_if_any"]
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `Please create a plan for the following task:\n${taskStr}`,
    },
  ];

  let planResponse: LLMResponse;
  try {
    planResponse = await llm.chat(planMessages, { temperature: 0.3 });
  } catch (err: any) {
    return { plan: { error: err.message }, result: `Failed to generate plan: ${err.message}` };
  }

  let plan: any;
  try {
    // Try to extract JSON from the response
    const jsonMatch = planResponse.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      plan = JSON.parse(jsonMatch[0]);
    } else {
      plan = { raw: planResponse.content, steps: [] };
    }
  } catch {
    plan = { raw: planResponse.content, steps: [] };
  }

  // Step 2: Execute each step
  const steps = plan.steps || [];
  const results: string[] = [];

  for (const step of steps) {
    const executeMessages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are executing a step in a plan. Execute the step and provide the result.
Overall goal: ${plan.goal || 'Complete the task'}
Previous results: ${results.length > 0 ? results.join('\n') : 'None'}`,
      },
      {
        role: 'user',
        content: `Execute step: ${step.description}\nExpected output: ${step.expectedOutput || 'N/A'}`,
      },
    ];

    try {
      const stepResponse = await llm.chat(executeMessages, { temperature: 0.3 });
      results.push(`Step ${step.id}: ${stepResponse.content}`);
    } catch (err: any) {
      results.push(`Step ${step.id}: ERROR - ${err.message}`);
    }
  }

  const result = results.join('\n\n');
  return { plan, result };
}

/**
 * Execute a task using Chain of Thought reasoning.
 * Chain reasoning steps to arrive at a conclusion.
 */
export async function executeCoT(
  task: any,
  llm: any
): Promise<string> {
  const taskStr = typeof task === 'string' ? task : JSON.stringify(task);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a reasoning agent. Use Chain of Thought (CoT) reasoning to solve problems.
Think step by step, breaking down the problem into logical reasoning steps.
For each step, explain your reasoning clearly.
After your chain of thought, provide a final answer clearly marked as "Final Answer:".

Format:
Step 1: <your reasoning>
Step 2: <your reasoning>
...
Final Answer: <your conclusion>`,
    },
    {
      role: 'user',
      content: `Please solve the following using Chain of Thought reasoning:\n${taskStr}`,
    },
  ];

  let response: LLMResponse;
  try {
    response = await llm.chat(messages, { temperature: 0.2 });
  } catch (err: any) {
    return `Error during CoT reasoning: ${err.message}`;
  }

  // Extract the final answer
  const finalAnswerMatch = response.content.match(/Final Answer:\s*([\s\S]*)/i);
  if (finalAnswerMatch) {
    return finalAnswerMatch[1].trim();
  }

  // If no explicit final answer, return the full reasoning
  return response.content;
}

/**
 * Conditional Graph execution: route through a predefined graph of nodes
 * based on dynamic conditions evaluated at runtime.
 */
export interface ConditionalGraphNode {
  id: string;
  execute: (state: GraphState, llm: any) => Promise<GraphState>;
}

export interface ConditionalGraphEdge {
  from: string;
  to: string;
  condition?: (state: GraphState) => boolean;
}

export interface GraphState {
  input: string;
  results: Record<string, any>;
  iterationCount: number;
  qualityScore: number;
  finalOutput: string;
  errors: string[];
  trace: { nodeId: string; action: string; timestamp: number }[];
}

export async function executeConditionalGraph(
  state: GraphState,
  nodes: Map<string, ConditionalGraphNode>,
  edges: ConditionalGraphEdge[],
  llm: any,
  maxIterations: number = 10
): Promise<GraphState> {
  let currentNodeId = findEntryNode(nodes, edges);
  if (!currentNodeId) {
    state.errors.push('No entry node found in conditional graph');
    return state;
  }

  while (state.iterationCount < maxIterations) {
    const node = nodes.get(currentNodeId);
    if (!node) {
      state.errors.push(`Node ${currentNodeId} not found`);
      break;
    }

    state.trace.push({
      nodeId: currentNodeId,
      action: 'execute',
      timestamp: Date.now(),
    });

    try {
      state = await node.execute(state, llm);
    } catch (err: any) {
      state.errors.push(`Error executing node ${currentNodeId}: ${err.message}`);
      state.trace.push({
        nodeId: currentNodeId,
        action: 'error',
        timestamp: Date.now(),
      });
    }

    state.iterationCount++;

    const nextNodeId = findNextNode(currentNodeId, edges, state);
    if (!nextNodeId) break;
    currentNodeId = nextNodeId;
  }

  return state;
}

function findEntryNode(
  nodes: Map<string, ConditionalGraphNode>,
  edges: ConditionalGraphEdge[]
): string | null {
  const hasIncoming = new Set<string>();
  for (const edge of edges) {
    hasIncoming.add(edge.to);
  }
  for (const nodeId of nodes.keys()) {
    if (!hasIncoming.has(nodeId)) return nodeId;
  }
  const first = nodes.keys().next().value;
  return first || null;
}

function findNextNode(
  currentNodeId: string,
  edges: ConditionalGraphEdge[],
  state: GraphState
): string | null {
  const candidates = edges.filter(e => e.from === currentNodeId);

  for (const edge of candidates) {
    if (edge.condition) {
      if (edge.condition(state)) return edge.to;
    }
  }

  const unconditional = candidates.find(e => !e.condition);
  return unconditional ? unconditional.to : null;
}

/**
 * Hybrid strategy: combines multiple strategies dynamically.
 * Uses ReACT for simple sub-tasks, Plan-Execute for complex ones,
 * and CoT for reasoning-heavy segments.
 */
export async function executeHybrid(
  task: any,
  tools: any[],
  llm: any
): Promise<{ result: string; strategyUsed: StrategyType; trace: any[] }> {
  const taskStr = typeof task === 'string' ? task : JSON.stringify(task);

  // Step 1: Analyze the task to determine the best strategy
  const analysisMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `Analyze the given task and determine the best execution strategy.
Respond with a JSON object:
{
  "strategy": "react" | "plan-execute" | "cot",
  "reasoning": "why this strategy is appropriate",
  "subTasks": ["list of sub-tasks if decomposition is needed"]
}`,
    },
    {
      role: 'user',
      content: `Analyze this task:\n${taskStr}`,
    },
  ];

  let analysis: any = { strategy: 'react', reasoning: '', subTasks: [] };
  try {
    const analysisResponse = await llm.chat(analysisMessages, { temperature: 0.2 });
    const jsonMatch = analysisResponse.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      analysis = JSON.parse(jsonMatch[0]);
    }
  } catch {
    analysis = { strategy: 'react', reasoning: 'Default fallback', subTasks: [] };
  }

  const chosenStrategy = analysis.strategy as StrategyType;
  const trace: any[] = [{ phase: 'analysis', analysis }];

  // Step 2: Execute with the chosen strategy
  switch (chosenStrategy) {
    case 'plan-execute': {
      const planResult = await executePlanExecute(task, llm);
      trace.push({ phase: 'execution', plan: planResult.plan });
      return { result: planResult.result, strategyUsed: 'plan-execute', trace };
    }
    case 'cot': {
      const cotResult = await executeCoT(task, llm);
      trace.push({ phase: 'execution', type: 'cot' });
      return { result: cotResult, strategyUsed: 'cot', trace };
    }
    case 'react':
    default: {
      const reactResult = await executeReACT(task, tools, llm);
      trace.push({ phase: 'execution', reactTrace: reactResult.trace });
      return { result: reactResult.result, strategyUsed: 'react', trace };
    }
  }
}