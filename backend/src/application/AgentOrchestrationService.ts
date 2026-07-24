import { ChatMessage } from '../base/LLMWrapper';
import { InformationService } from '../core/information/InformationService';
import { LLMService } from '../core/llm/LLMService';
import { ModelConfigService } from '../core/modelConfig/ModelConfigService';
import { AgentBuilder } from '../agent/agentBuilder';
import { AgentLibrary } from '../agent/agentLibrary';
import { MetaAgent } from '../agent/metaAgent';
import { GraphExecutor } from '../agent/executor';
import type { WorkAgent, CustomAgent, GraphState } from '../shared/types';
import { logger } from '../infrastructure/logger';

export interface TaskNode {
  id: string;
  description: string;
  dependencies: string[];
  requiredCapabilities?: string[];
}

export interface TaskDag {
  tasks: TaskNode[];
}

export interface OrchestrationContext {
  userId: string;
  sessionId: string;
  plannerAgentId?: string;
  evaluatorAgentId?: string;
}

export interface SubTaskResult {
  taskId: string;
  output: string;
  agentId: string;
  llm?: { providerId: string; modelId: string; temperature: number; maxTokens: number };
  strategy?: string;
  skillIds?: string[];
  mcpIds?: string[];
  soulId?: string;
}

export interface AgentThinkingRecord {
  agentId: string;
  taskId: string;
  systemPrompt: string;
  instruction: string;
  output: string;
  startTime: number;
  endTime: number;
}

export interface OrchestrationResult {
  finalResult: string;
  subtaskResults: SubTaskResult[];
  thinkingRecords: AgentThinkingRecord[];
  duration: number;
}

/**
 * AgentOrchestrationService —— application 层编排核心：
 * 1. 加载用户配置的 Planner CustomAgent → LLM 分解任务为 DAG
 * 2. 为每个子任务匹配/构建 WorkAgent → 图执行器底层先行执行
 * 3. 加载用户配置的 Evaluator CustomAgent → 评估每个工作Agent输出 → 回写 AgentLibrary
 */
export class AgentOrchestrationService {
  constructor(
    private informationService: InformationService,
    private llmService: LLMService,
    private modelConfigService: ModelConfigService,
    private agentBuilder: AgentBuilder,
    private agentLibrary: AgentLibrary,
    private metaAgent: MetaAgent,
    private graphExecutor: GraphExecutor
  ) {}

  async orchestrate(
    messages: ChatMessage[],
    context: OrchestrationContext,
    callbacks?: { onProgress?: (record: AgentThinkingRecord) => void },
    signal?: AbortSignal,
  ): Promise<OrchestrationResult> {
    const start = Date.now();
    const thinkingRecords: AgentThinkingRecord[] = [];

    // ── 1. Planner：解析用户问题 → 任务 DAG ──
    let taskDag = await this.tryDecompose(messages, context.plannerAgentId, signal);
    logger.info('AgentOrchestration', `[planner] decomposed into ${taskDag.tasks.length} subtasks`);

    // Planner thinking record
    const planner = await this.agentBuilder.getSystemAgent('planner');
    const plannerRecord: AgentThinkingRecord = {
      agentId: planner?.id || 'planner',
      taskId: 'planner',
      systemPrompt: '你是一个任务规划者。将用户的请求逐步分解为不可再拆分的子任务。每个子任务需要清晰的描述和依赖关系。以 JSON 数组格式返回，每个元素包含 id(string), description(string), dependencies(string[])。只输出 JSON 数组，不要输出其他内容。',
      instruction: messages[messages.length - 1]?.content || '',
      output: JSON.stringify(taskDag.tasks.map(t => ({ id: t.id, description: t.description, dependencies: t.dependencies }))),
      startTime: start,
      endTime: Date.now(),
    };
    thinkingRecords.push(plannerRecord);
    callbacks?.onProgress?.(plannerRecord);

    // 无 Planner 或分解失败 → 视为单任务，直接交给工作Agent 处理
    if (!taskDag || taskDag.tasks.length === 0) {
      taskDag = { tasks: [{ id: 'root', description: '处理用户消息' + (messages[messages.length - 1]?.content ? ': ' + messages[messages.length - 1].content.slice(0, 50) : ''), dependencies: [] }] };
    }

    // ── 2. Worker：为每个子任务构建 WorkAgent → 图执行 ──
    const state: GraphState = {
      userMessage: messages[messages.length - 1]?.content || '',
      taskPlan: taskDag.tasks.map(t => ({
        id: t.id, description: t.description,
        agentType: 'worker', dependencies: t.dependencies,
      })),
      subTaskResults: new Map(),
      memoryContext: [],
      iterationCount: 0,
      maxIterations: 10,
      currentStrategy: 'react',
      qualityScore: 0.7,
      qualityThreshold: 0.7,
      finalOutput: '',
      errors: [],
      trace: [],
      checkpoints: new Map(),
    };

    const agents = new Map<string, WorkAgent>();
    // Resolve user's default model from user_model_config
    let defaultModel: { configId: string; modelId: string } | null = null;
    try {
      defaultModel = await this.resolveDefaultModel();
    } catch { /* fall through */ }

    for (const task of taskDag.tasks) {
      const workAgent = await this.metaAgent.buildAgent({
        intent: 'general',
        complexity: 0.5,
        domain: 'general',
        requiredCapabilities: task.requiredCapabilities ?? [],
      });
      // Override with user's selected default model
      if (defaultModel?.modelId) {
        workAgent.llm.modelId = defaultModel.modelId;
      }
      agents.set(task.id, workAgent);
    }

    // 构建 GraphExecutor 需要的图格式：nodes + edges
    const taskGraph = {
      nodes: taskDag.tasks.map(t => ({
        id: t.id,
        task: t,
        agent: agents.get(t.id),
        description: t.description,
        dependencies: t.dependencies,
      })),
      edges: taskDag.tasks.flatMap(t =>
        t.dependencies.map(dep => ({ from: dep, to: t.id }))
      ),
    };

    const graphResult = await this.graphExecutor.execute(taskGraph, state, {
      onAgentInput: (agentId, input) => {
        const record: AgentThinkingRecord = {
          agentId,
          taskId: agentId,
          systemPrompt: input.systemPrompt,
          instruction: input.instruction,
          output: '',
          startTime: Date.now(),
          endTime: 0,
        };
        thinkingRecords.push(record);
        callbacks?.onProgress?.(record);
        logger.info('AgentOrchestration', `[think] agentId=${agentId} started`);
      },
      onAgentOutput: (agentId, output) => {
        const record = thinkingRecords.find(r => r.agentId === agentId);
        if (record) {
          record.output = output;
          record.endTime = Date.now();
          callbacks?.onProgress?.(record);
        }
      },
    }, signal);

    // 收集子任务结果
    const subtaskResults: SubTaskResult[] = [];
    for (const task of taskDag.tasks) {
      const agent = agents.get(task.id);
      const output = typeof state.subTaskResults.get(task.id) === 'string'
        ? state.subTaskResults.get(task.id) as string
        : JSON.stringify(state.subTaskResults.get(task.id));
      if (agent) {
        subtaskResults.push({ taskId: task.id, output, agentId: agent.id,
          llm: agent.llm ? { providerId: agent.llm.providerId, modelId: agent.llm.modelId, temperature: agent.llm.temperature, maxTokens: agent.llm.maxTokens } : undefined,
          strategy: agent.strategy,
          skillIds: agent.skillIds,
          mcpIds: agent.mcpIds,
          soulId: agent.soulId,
        });
      }
    }

    logger.info('AgentOrchestration', `[workers] ${subtaskResults.length} subtasks completed`);

    // ── 3. Evaluator：评估每个工作Agent 输出 → 回写 AgentLibrary ──
    const evaluator = context.evaluatorAgentId
      ? await this.agentBuilder.get(context.evaluatorAgentId)
      : await this.agentBuilder.getSystemAgent('evaluator');
    if (evaluator) {
      for (const sr of subtaskResults) {
          try {
            const score = await this.evaluateWithAgent(evaluator, sr.output, messages);
            await this.agentLibrary.recordFeedback(sr.agentId, score);
            logger.info('AgentOrchestration', `[evaluator] agentId=${sr.agentId} score=${score.toFixed(2)}`);
          } catch (e) {
            logger.warn('AgentOrchestration', `[evaluator] failed for ${sr.agentId}: ${(e as Error).message}`);
          }
        }
      }

    // ── 4. Synthesizer：合并结果 ──
    const finalResult = subtaskResults.length === 1
      ? subtaskResults[0].output
      : subtaskResults.length > 1
        ? await this.synthesizeResults(subtaskResults, messages, signal)
        : graphResult.finalOutput || 'No result';

    const duration = Date.now() - start;
    logger.info('AgentOrchestration', `completed: ${subtaskResults.length} subtasks, duration=${duration}ms`);

    return { finalResult, subtaskResults, thinkingRecords, duration };
  }

  /**
   * 获取系统 Planner Agent（用于前端 Agent 调度链身份展示）。
   */
  async getPlannerAgent(): Promise<CustomAgent | undefined> {
    return this.agentBuilder.getSystemAgent('planner');
  }

  /**
   * 公开方法：尝试用系统 Planner 分解用户请求为任务 DAG。
   * 供 ChatService.streamMessage 等调用，将任务计划注入 LLM prompt。
   */
  async tryDecompose(messages: ChatMessage[], plannerAgentId?: string, signal?: AbortSignal): Promise<TaskDag> {
    const planner = plannerAgentId
      ? await this.agentBuilder.get(plannerAgentId)
      : await this.agentBuilder.getSystemAgent('planner');
    if (!planner) return { tasks: [] };
    return this.decomposeWithPlanner(planner, messages, signal);
  }

  /**
   * 公开方法：评估 assistant 回复质量并回写 AgentLibrary（供 ChatService 调用）。
   */
  async evaluateAndRecordFeedback(assistantContent: string, userMessage: string): Promise<number> {
    const evaluator = await this.agentBuilder.getSystemAgent('evaluator');
    const messages: ChatMessage[] = [
      { role: 'user', content: userMessage.slice(0, 500) },
    ];

    const score = evaluator
      ? await this.evaluateWithAgent(evaluator, assistantContent, messages)
      : this.heuristicScore(assistantContent);

    // 回写 AgentLibrary：评分影响所有 active 的 workAgent
    try {
      const agents = await this.agentLibrary.getAllActive();
      if (agents.length > 0) {
        for (const agent of agents) {
          await this.agentLibrary.recordFeedback(agent.id, score);
        }
        logger.info('AgentOrchestration', `[evaluate] score=${score.toFixed(2)} → ${agents.length} active agents`);
      }
    } catch { /* library empty on fresh install */ }

    return score;
  }

  /**
   * Planner CustomAgent → LLM 驱动的任务分解。
   * Prompt: 「将以下问题逐步分解为不可拆分的子任务，以 JSON 数组返回每个任务的 id/description/dependencies。」
   */
  private async decomposeWithPlanner(planner: CustomAgent, messages: ChatMessage[], signal?: AbortSignal): Promise<TaskDag> {
    const model = await this.resolveDefaultModel();
    if (!model) return { tasks: [] };

    try {
      const prompt = [
          { role: 'system' as const, content: `你是一个任务规划者。将用户的请求逐步分解为不可再拆分的子任务。每个子任务需要清晰的描述和依赖关系。以 JSON 数组格式返回，每个元素包含 id(string), description(string), dependencies(string[])。请用中文描述子任务。只输出 JSON 数组，不要输出其他内容。` },
        ...messages,
        { role: 'user' as const, content: '请将上述对话中的用户请求分解为子任务 DAG（JSON 数组格式）。' },
      ];

      const response = await this.llmService.chatCompletion({
        model: model.modelId,
        messages: prompt,
        temperature: planner.llm?.temperature ?? 0.3,
        maxTokens: planner.llm?.maxTokens ?? 4096,
      }, model.configId, signal);

      const text = response.choices?.[0]?.message?.content;
      if (text) {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return {
              tasks: parsed.map((t: any) => ({
                id: String(t.id || `task-${Math.random().toString(36).slice(2)}`),
                description: String(t.description || ''),
                dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
              })),
            };
          }
        }
      }
    } catch (e) {
      logger.warn('AgentOrchestration', `[decomposeWithPlanner] failed: ${(e as Error).message}`);
    }
    return { tasks: [] };
  }

  /**
   * Evaluator CustomAgent → LLM 驱动的多维评分（0~1）。
   * 失败时退化为启发式评分（启发式评估：长度/结构/关键词匹配）。
   */
  private async evaluateWithAgent(
    evaluator: CustomAgent,
    output: string,
    context: ChatMessage[]
  ): Promise<number> {
    const model = await this.resolveDefaultModel();
    if (!model) return this.heuristicScore(output);

    try {
      const prompt = [
        { role: 'system' as const, content: `你是一个评估者。评估以下 Agent 输出质量，仅返回 0~1 的数字分数（如 0.72）。评估维度：相关性、准确性、完整性、一致性、帮助度。` },
        { role: 'user' as const, content: `上下文: ${JSON.stringify(context.map(m => m.content.slice(0, 200)))}\n\n待评估输出: ${output.slice(0, 2000)}` },
      ];
      const response = await this.llmService.chatCompletion({
        model: model.modelId,
        messages: prompt,
        temperature: evaluator.llm?.temperature ?? 0.1,
        maxTokens: 10,
      }, model.configId);
      const text = response.choices?.[0]?.message?.content;
      if (text) {
        const match = text.match(/[\d.]+/);
        if (match) return Math.max(0, Math.min(1, parseFloat(match[0])));
      }
    } catch (e) {
      logger.warn('AgentOrchestration', `[evaluateWithAgent] LLM failed: ${(e as Error).message}`);
    }
    return this.heuristicScore(output);
  }

  private heuristicScore(output: string): number {
    if (!output || output.length < 10) return 0.2;
    const hasStructure = /[：:]/g.test(output) || output.includes('\n');
    const lengthScore = Math.min(output.length / 500, 1);
    return Math.round((0.3 + (hasStructure ? 0.3 : 0) + lengthScore * 0.4) * 100) / 100;
  }

  private async synthesizeResults(
    results: SubTaskResult[],
    context: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<string> {
    const model = await this.resolveDefaultModel();
    if (!model) return results.map(r => r.output).join('\n\n');

    try {
      const response = await this.llmService.chatCompletion({
        model: model.modelId,
        messages: [
          { role: 'system', content: '你是一个综合者。合并以下子任务结果，生成连贯的最终回答。请使用中文回复。' },
          ...context,
          { role: 'user', content: `子任务结果:\n${results.map((r, i) => `[${i}] ${r.output.slice(0, 500)}`).join('\n\n')}\n\n请综合为最终回答。` },
        ],
        temperature: 0.5,
        maxTokens: 4096,
      }, model.configId, signal);
      return response.choices?.[0]?.message?.content || results.map(r => r.output).join('\n\n');
    } catch {
      return results.map(r => r.output).join('\n\n');
    }
  }

  private async resolveDefaultModel(): Promise<{ configId: string; modelId: string } | null> {
    try {
      const models = await this.modelConfigService.listConfigs();
      const active = models.filter(m => m.status === 'active');
      const dm = active.find(m => m.isDefault) || active[0];
      return dm ? { configId: dm.id, modelId: dm.modelId } : null;
    } catch { return null; }
  }
}
