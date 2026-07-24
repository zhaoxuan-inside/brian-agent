import { AgentBuilder } from '../agent/agentBuilder';
import type { CustomAgent } from '../shared/types';
import { logger } from '../infrastructure/logger';

/**
 * 系统内置 Agent 管理。
 * Planner 是 DAG 起点，Evaluator 是每个节点的切面评估 Agent。
 * 启动时自动创建（如不存在），用实际 graph node ID 存储，不可删除/编辑。
 */
export class SystemAgentService {
  private plannerId: string | null = null;
  private evaluatorId: string | null = null;

  constructor(private agentBuilder: AgentBuilder) {}

  async ensureSystemAgents(): Promise<{ planner: CustomAgent; evaluator: CustomAgent }> {
    const planner = await this.ensureSystemPlanner();
    const evaluator = await this.ensureSystemEvaluator();
    return { planner, evaluator };
  }

  private async ensureSystemPlanner(): Promise<CustomAgent> {
    let agent = await this.agentBuilder.getSystemAgent('planner');
    if (agent) {
      this.plannerId = agent.id;
      logger.info('SystemAgent', `[planner] found existing, id=${agent.id}`);
      return agent;
    }

    agent = await this.agentBuilder.create({
      name: '系统任务规划者',
      role: 'planner',
      description: 'DAG 起点——从编排框架获取上下文，逐步分解用户问题为不可拆分的子任务 DAG，为每个子任务选择或构建工作Agent。',
      strategy: { type: 'react', maxIterations: 10, stopConditions: [] },
      llm: { temperature: 0.3, maxTokens: 4096 },
      prompt: {
        system: `你是一个任务规划者。将用户的请求逐步分解为不可再拆分的子任务。每个子任务需要清晰的描述和依赖关系。以 JSON 数组格式返回，每个元素包含 id(string), description(string), dependencies(string[])。只输出 JSON 数组，不要输出其他内容。`,
        instruction: '请将上述对话中的用户请求分解为子任务 DAG。',
        variables: [],
      },
      skillIds: [],
      mcpIds: [],
      soulId: '',
      workIds: [],
      sources: { knowledgeBase: [], webSearch: false },
    }, true);

    this.plannerId = agent.id;
    logger.info('SystemAgent', `[planner] created, id=${agent.id}`);
    return agent;
  }

  private async ensureSystemEvaluator(): Promise<CustomAgent> {
    let agent = await this.agentBuilder.getSystemAgent('evaluator');
    if (agent) {
      this.evaluatorId = agent.id;
      logger.info('SystemAgent', `[evaluator] found existing, id=${agent.id}`);
      return agent;
    }

    agent = await this.agentBuilder.create({
      name: '系统评估Agent',
      role: 'evaluator',
      description: 'DAG 切面——评估每个工作Agent节点的输出质量，计算多维评分，回写 AgentLibrary 的可靠性与强度，驱动自优化老化/强化。',
      strategy: { type: 'react', maxIterations: 5, stopConditions: [] },
      llm: { temperature: 0.1, maxTokens: 256 },
      prompt: {
        system: `你是一个评估者。评估以下 Agent 输出质量，仅返回 0~1 的数字分数（如 0.72）。评估维度：相关性、准确性、完整性、一致性、帮助度。`,
        instruction: '评估输出质量。',
        variables: [],
      },
      skillIds: [],
      mcpIds: [],
      soulId: '',
      workIds: [],
      sources: { knowledgeBase: [], webSearch: false },
    }, true);

    this.evaluatorId = agent.id;
    logger.info('SystemAgent', `[evaluator] created, id=${agent.id}`);
    return agent;
  }

  getPlannerId(): string | null { return this.plannerId; }
  getEvaluatorId(): string | null { return this.evaluatorId; }
}
