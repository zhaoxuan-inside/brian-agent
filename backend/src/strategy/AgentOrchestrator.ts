import { z } from 'zod';
import { ChatMessage } from '../base/LLMWrapper';
import { Agent, AgentConfig, AgentFactory } from './Agent';
import { LLMService } from '../core/llm/LLMService';
import { logger } from '../infrastructure/logger';

export const OrchestrationResultSchema = z.object({
  finalResult: z.string(),
  agentResults: z.array(z.object({
    agentId: z.string(),
    agentType: z.string(),
    result: z.string(),
    thoughts: z.array(z.string()),
    actions: z.array(z.record(z.string(), z.any())),
    duration: z.number(),
  })),
  duration: z.number(),
  metadata: z.record(z.string(), z.any()),
});

export type OrchestrationResult = z.infer<typeof OrchestrationResultSchema>;

export class AgentOrchestrator {
  private agents: Map<string, Agent> = new Map();

  constructor(private llmService: LLMService) {}

  registerAgent(config: AgentConfig): void {
    const agent = AgentFactory.create(config, this.llmService);
    this.agents.set(config.id, agent);
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  async orchestrate(messages: ChatMessage[], context: Record<string, any>): Promise<OrchestrationResult> {
    const start = Date.now();
    const agentResults: OrchestrationResult['agentResults'] = [];
    const orgContext = { ...context, strategy: context.strategy || 'default' };

    logger.info('AgentOrchestrator', `[orchestrate] starting with ${messages.length} messages, userId=${context.userId}, chatId=${context.chatId}, registeredAgents=${this.agents.size}`);

    const plannerAgent = this.agents.get('planner');
    if (plannerAgent) {
      logger.info('AgentOrchestrator', `[orchestrate] executing planner agent...`);
      const plannerStart = Date.now();
      const plannerResult = await plannerAgent.execute(messages, orgContext);
      agentResults.push({
        agentId: plannerAgent.id,
        agentType: plannerAgent.type,
        result: plannerResult.result,
        thoughts: plannerResult.thoughts,
        actions: plannerResult.actions,
        duration: Date.now() - plannerStart,
      });
      logger.info('AgentOrchestrator', `[orchestrate] planner completed in ${Date.now() - plannerStart}ms, resultLen=${plannerResult.result.length}, thoughts=${plannerResult.thoughts.length}`);
    } else {
      logger.info('AgentOrchestrator', `[orchestrate] no planner agent registered`);
    }

    const workerAgent = this.agents.get('worker');
    if (workerAgent) {
      logger.info('AgentOrchestrator', `[orchestrate] executing worker agent...`);
      const workerStart = Date.now();
      const workerResult = await workerAgent.execute(messages, orgContext);
      agentResults.push({
        agentId: workerAgent.id,
        agentType: workerAgent.type,
        result: workerResult.result,
        thoughts: workerResult.thoughts,
        actions: workerResult.actions,
        duration: Date.now() - workerStart,
      });
      logger.info('AgentOrchestrator', `[orchestrate] worker completed in ${Date.now() - workerStart}ms, resultLen=${workerResult.result.length}`);
    } else {
      logger.info('AgentOrchestrator', `[orchestrate] no worker agent registered`);
    }

    const synthesizerAgent = this.agents.get('synthesizer');
    let finalResult: string;
    if (synthesizerAgent) {
      logger.info('AgentOrchestrator', `[orchestrate] executing synthesizer agent...`);
      const synthStart = Date.now();
      const synthResult = await synthesizerAgent.execute(messages, { ...orgContext, agentResults });
      finalResult = synthResult.result;
      logger.info('AgentOrchestrator', `[orchestrate] synthesizer completed in ${Date.now() - synthStart}ms, resultLen=${finalResult.length}`);
    } else {
      finalResult = agentResults[agentResults.length - 1]?.result || 'No result';
    }

    const evaluatorAgent = this.agents.get('evaluator');
    if (evaluatorAgent) {
      logger.info('AgentOrchestrator', `[orchestrate] executing evaluator agent...`);
      const evaluatorStart = Date.now();
      const evaluatorResult = await evaluatorAgent.execute(messages, { ...orgContext, agentResults });
      agentResults.push({
        agentId: evaluatorAgent.id,
        agentType: evaluatorAgent.type,
        result: evaluatorResult.result,
        thoughts: evaluatorResult.thoughts,
        actions: evaluatorResult.actions,
        duration: Date.now() - evaluatorStart,
      });
      logger.info('AgentOrchestrator', `[orchestrate] evaluator completed in ${Date.now() - evaluatorStart}ms`);
    } else {
      logger.info('AgentOrchestrator', `[orchestrate] no evaluator agent registered`);
    }

    const totalDuration = Date.now() - start;
    logger.info('AgentOrchestrator', `[orchestrate] completed in ${totalDuration}ms, agentCount=${agentResults.length}, finalResultLen=${finalResult.length}`);

    return {
      finalResult,
      agentResults,
      duration: totalDuration,
      metadata: {
        agentCount: agentResults.length,
        strategy: orgContext.strategy,
      },
    };
  }

  async executeSingleAgent(agentId: string, messages: ChatMessage[], context: Record<string, any>): Promise<OrchestrationResult> {
    const start = Date.now();
    const agent = this.agents.get(agentId);

    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const agentStart = Date.now();
    const agentResult = await agent.execute(messages, context);

    return {
      finalResult: agentResult.result,
      agentResults: [{
        agentId: agent.id,
        agentType: agent.type,
        result: agentResult.result,
        thoughts: agentResult.thoughts,
        actions: agentResult.actions,
        duration: Date.now() - agentStart,
      }],
      duration: Date.now() - start,
      metadata: { agentId },
    };
  }

  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      strategy: agent.strategy.type,
      modelId: undefined,
      maxIterations: 10,
      timeout: 300000,
      qualityThreshold: 0.7,
    }));
  }
}