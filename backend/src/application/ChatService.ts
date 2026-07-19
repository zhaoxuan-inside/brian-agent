import { z } from 'zod';
import { ChatMessage, ChatCompletionRequest } from '../base/LLMWrapper';
import { InformationService, UserMessage } from '../core/information/InformationService';
import { LLMService } from '../core/llm/LLMService';
import { AgentOrchestrator } from '../strategy/AgentOrchestrator';
import { UserProfileService } from './UserProfileService';
import { MetaAgent } from '../agent/metaAgent';
import { GraphExecutor } from '../agent/executor';
import type { WorkAgent, AgentStatus } from '../shared/types';
import { ModelConfigService } from '../core/modelConfig/ModelConfigService';
import type { ModelConfig } from '../core/modelConfig/ModelConfigService';
import { logger } from '../infrastructure/logger';

function generateUUIDv7(): string {
  const timestamp = Date.now().toString(16).padStart(12, '0');
  const random = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${random.slice(0, 3)}-${random.slice(3, 7)}-${random.slice(7, 19)}`;
}

export const ChatMessageRequestSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  message: z.string().min(1, 'Message is required'),
  sessionId: z.string().optional(),
  chatId: z.string().optional(),
  exchangeId: z.string().optional(),
  selectedMessageIds: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type ChatMessageRequest = z.infer<typeof ChatMessageRequestSchema>;

export const ChatMessageResponseSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  sessionId: z.string(),
  exchangeId: z.string(),
  msgId: z.string(),
  userId: z.string(),
  content: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type ChatMessageResponse = z.infer<typeof ChatMessageResponseSchema>;

export interface ChatHistoryResponse {
  messages: UserMessage[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export class ChatService {
  constructor(
    private informationService: InformationService,
    private llmService: LLMService,
    private orchestrator: AgentOrchestrator,
    private userProfileService: UserProfileService,
    private metaAgent: MetaAgent,
    private graphExecutor: GraphExecutor,
    private modelConfigService: ModelConfigService
  ) {}

  /**
   * Verify at least one model is configured in "当前模型" (user_model_config).
   * Throws with a user-friendly message if none are available.
   */
  private async ensureModelsConfigured(): Promise<ModelConfig[]> {
    const models = await this.modelConfigService.listConfigs();
    const active = models.filter(m => m.status === 'active');
    logger.info('ChatService', `[ensureModelsConfigured] Total model configs: ${models.length}, active: ${active.length}`);
    if (active.length === 0) {
      logger.warn('ChatService', '[ensureModelsConfigured] No active models — rejecting request');
      throw new Error('未配置可用模型，请先在"模型管理"页面添加模型');
    }
    return active;
  }

  /**
   * Select the effective model for this message.
   * If the agent already has a modelId that exists in "当前模型", reuse it.
   * Otherwise fall back to the default model (is_default=true), or the first active model.
   */
  private async resolveChatModel(
    activeModels: ModelConfig[],
    agentLlm?: { providerId?: string; modelId?: string } | null
  ): Promise<ModelConfig> {
    if (agentLlm?.modelId) {
      const own = activeModels.find(m =>
        m.modelId === agentLlm.modelId &&
        (!agentLlm.providerId || m.providerId === agentLlm.providerId)
      );
      if (own) {
        logger.info('ChatService', `[resolveChatModel] Reusing agent model: provider=${own.providerId} model=${own.modelId}`);
        return own;
      }
      logger.info('ChatService', `[resolveChatModel] Agent model "${agentLlm.modelId}" not in active models, falling back to default`);
    }
    const defaultModel = activeModels.find(m => m.isDefault) || activeModels[0];
    logger.info('ChatService', `[resolveChatModel] Using model: provider=${defaultModel.providerId} model=${defaultModel.modelId} id=${defaultModel.id}`);
    return defaultModel;
  }

  async sendMessage(request: ChatMessageRequest): Promise<ChatMessageResponse> {
    const startTime = Date.now();
    const sessionId = request.sessionId || request.chatId || generateUUIDv7();
    const exchangeId = request.exchangeId || generateUUIDv7();
    const userMsgId = generateUUIDv7();
    const assistantMsgId = generateUUIDv7();

    logger.info('ChatService', `[sendMessage] ====== START ====== userId=${request.userId} sessionId=${sessionId} exchangeId=${exchangeId}`);
    logger.info('ChatService', `[sendMessage] userMsgId=${userMsgId} assistantMsgId=${assistantMsgId} msgLen=${request.message.length}`);
    logger.info('ChatService', `[sendMessage] selectedMessageIds=${request.selectedMessageIds?.length || 0} hasSession=${!!request.sessionId}`);

    try {
      // ---- 0. Ensure at least one model is configured ----
      logger.info('ChatService', `[sendMessage] Checking model availability...`);
      await this.ensureModelsConfigured();
      logger.info('ChatService', `[sendMessage] Model check passed`);

      logger.info('ChatService', `[sendMessage] Building user message...`);
      const userMessage: Omit<UserMessage, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: request.userId,
        sessionId,
        exchangeId,
        msgId: userMsgId,
        role: 'user',
        content: request.message,
        summary: request.message.slice(0, 100),
        tokens: this.countTokens(request.message),
        metadata: { ...(request.metadata || {}), ...(request.selectedMessageIds?.length ? { selectedMessageIds: request.selectedMessageIds } : {}) },
        tags: this.extractKeywords(request.message),
        isLearningMemory: false,
        messageIndex: await this.getMessageIndex(sessionId, request.userId),
        referenceCount: 0,
      };
      logger.info('ChatService', `[sendMessage] User message built: messageIndex=${userMessage.messageIndex} tags=${userMessage.tags.length}`);

      logger.info('ChatService', `[sendMessage] Saving user message to database...`);
      await this.informationService.saveMessage(userMessage);
      logger.info('ChatService', `[sendMessage] User message saved successfully: msgId=${userMsgId}`);

      logger.info('ChatService', `[sendMessage] Building context...`);
      const context = await this.buildContext(request.userId, sessionId, request.selectedMessageIds);
      logger.info('ChatService', `[sendMessage] Context built: ${context.length} messages (selected=${request.selectedMessageIds?.length || 0}, working=${context.length - (request.selectedMessageIds?.length || 0)})`);

      const agentMessages: ChatMessage[] = [
        { role: 'system', content: this.buildSystemPrompt(request.userId) },
        ...context,
        { role: 'user', content: request.message },
      ];
      logger.info('ChatService', `[sendMessage] Total agent messages: ${agentMessages.length}`);

      logger.info('ChatService', `[sendMessage] Starting orchestration...`);
      const result = await this.orchestrator.orchestrate(agentMessages, {
        userId: request.userId,
        chatId: sessionId,
        selectedMessageIds: request.selectedMessageIds,
      });
      logger.info('ChatService', `[sendMessage] Orchestration completed in ${result.duration}ms, agentCount=${result.agentResults.length}, resultLen=${result.finalResult.length}`);

      logger.info('ChatService', `[sendMessage] Building assistant message...`);
      const assistantMessage: Omit<UserMessage, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: request.userId,
        sessionId,
        exchangeId,
        msgId: assistantMsgId,
        role: 'assistant',
        content: result.finalResult,
        summary: result.finalResult.slice(0, 100),
        tokens: this.countTokens(result.finalResult),
        metadata: {
          agentResults: result.agentResults,
          duration: result.duration,
        },
        tags: this.extractKeywords(result.finalResult),
        isLearningMemory: false,
        messageIndex: await this.getMessageIndex(sessionId, request.userId),
        referenceCount: 0,
      };
      logger.info('ChatService', `[sendMessage] Assistant message built: messageIndex=${assistantMessage.messageIndex} tags=${assistantMessage.tags.length}`);

      logger.info('ChatService', `[sendMessage] Saving assistant message to database...`);
      await this.informationService.saveMessage(assistantMessage);
      logger.info('ChatService', `[sendMessage] Assistant message saved successfully: msgId=${assistantMsgId}`);

      logger.info('ChatService', `[sendMessage] Triggering profile analysis...`);
      await this.userProfileService.analyzeFromMessage(request.userId, request.message, result.finalResult);
      logger.info('ChatService', `[sendMessage] Profile analysis queued`);

      const totalDuration = Date.now() - startTime;
      logger.info('ChatService', `[sendMessage] ====== END ====== Total duration=${totalDuration}ms sessionId=${sessionId} exchangeId=${exchangeId}`);

      return {
        id: assistantMsgId,
        chatId: sessionId,
        sessionId,
        exchangeId,
        msgId: assistantMsgId,
        userId: request.userId,
        content: result.finalResult,
        role: 'assistant',
        timestamp: Date.now(),
        metadata: { agentResults: result.agentResults },
      };
    } catch (e: any) {
      const errorDuration = Date.now() - startTime;
      logger.info('ChatService', `[sendMessage] ====== ERROR ====== Total duration=${errorDuration}ms sessionId=${sessionId} exchangeId=${exchangeId}`);
      logger.info('ChatService', `[sendMessage] Error: ${e.message || e}`);
      logger.info('ChatService', `[sendMessage] Error stack: ${e.stack || 'no stack'}`);
      throw e;
    }
  }

  async streamMessage(request: ChatMessageRequest): Promise<AsyncIterable<string>> {
    const startTime = Date.now();
    const sessionId = request.sessionId || request.chatId || generateUUIDv7();
    const exchangeId = request.exchangeId || generateUUIDv7();
    const userMsgId = generateUUIDv7();
    const assistantMsgId = generateUUIDv7();

    logger.info('ChatService', `[streamMessage] ====== START ====== userId=${request.userId} sessionId=${sessionId} exchangeId=${exchangeId}`);
    logger.info('ChatService', `[streamMessage] userMsgId=${userMsgId} assistantMsgId=${assistantMsgId} msgLen=${request.message.length}`);

    try {
      // ---- 0. Ensure at least one model is configured in user_model_config ----
      logger.info('ChatService', `[streamMessage] Checking model availability...`);
      const activeModels = await this.ensureModelsConfigured();
      logger.info('ChatService', `[streamMessage] Model check passed: ${activeModels.length} active model(s)`);

      logger.info('ChatService', `[streamMessage] Building user message...`);
      const userMessage: Omit<UserMessage, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: request.userId,
        sessionId,
        exchangeId,
        msgId: userMsgId,
        role: 'user',
        content: request.message,
        summary: request.message.slice(0, 100),
        tokens: this.countTokens(request.message),
        metadata: { ...(request.metadata || {}), ...(request.selectedMessageIds?.length ? { selectedMessageIds: request.selectedMessageIds } : {}) },
        tags: this.extractKeywords(request.message),
        isLearningMemory: false,
        messageIndex: await this.getMessageIndex(sessionId, request.userId),
        referenceCount: 0,
      };
      logger.info('ChatService', `[streamMessage] User message built: messageIndex=${userMessage.messageIndex} tags=${userMessage.tags.length}`);

      logger.info('ChatService', `[streamMessage] Saving user message to database...`);
      await this.informationService.saveMessage(userMessage);
      logger.info('ChatService', `[streamMessage] User message saved successfully: msgId=${userMsgId}`);

      // ---- 2. MetaAgent: analyze & build work agent ----
      let workAgent: WorkAgent;
      let agentChainForFrontend: Array<any> = [];
      try {
        const analysis = this.metaAgent.analyze({ type: 'user', content: request.message });
        logger.info('ChatService', `[streamMessage] MetaAgent analysis: intent=${analysis.intent} complexity=${analysis.complexity} domain=${analysis.domain}`);

        const reused = await this.metaAgent.reuseAgent(analysis);
        if (reused) {
          workAgent = reused;
          logger.info('ChatService', `[streamMessage] Reused agent: id=${workAgent.id} name=${workAgent.name} strategy=${workAgent.strategy}`);
        } else {
          workAgent = await this.metaAgent.buildAgent(analysis);
          logger.info('ChatService', `[streamMessage] Built new agent: id=${workAgent.id} name=${workAgent.name} strategy=${workAgent.strategy}`);
        }
        await this.metaAgent.saveAgent(workAgent);
        agentChainForFrontend = this.buildAgentChainEvents(workAgent);
      } catch (e: any) {
        logger.info('ChatService', `[streamMessage] MetaAgent failed, falling back to direct LLM: ${e.message || e}`);
        // Fallback: synthetic agent for frontend compatibility
        workAgent = {
          id: `fallback-${Date.now()}`,
          name: 'direct-llm',
          taskFeatures: {},
          strategy: 'react' as any,
          llm: { providerId: 'default', modelId: 'gpt-4o', temperature: 0.7, maxTokens: 4096 },
          prompt: { system: this.buildSystemPrompt(request.userId), instruction: request.message },
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
        agentChainForFrontend = this.buildAgentChainEvents(workAgent);
      }

      // ---- 2.5 Resolve the effective model from "当前模型" ----
      const selectedModel = await this.resolveChatModel(activeModels, workAgent.llm);
      workAgent.llm = {
        providerId: selectedModel.providerId || 'unknown',
        modelId: selectedModel.modelId || selectedModel.name || 'unknown',
        temperature: workAgent.llm?.temperature ?? selectedModel.defaultParameters?.temperature ?? 0.7,
        maxTokens: workAgent.llm?.maxTokens ?? selectedModel.defaultParameters?.maxTokens ?? 4096,
      };
      logger.info('ChatService', `[streamMessage] Selected model: id=${selectedModel.id} provider=${selectedModel.providerId} model=${selectedModel.modelId}`);

      logger.info('ChatService', `[streamMessage] Building context...`);
      const context = await this.buildContext(request.userId, sessionId, request.selectedMessageIds);
      logger.info('ChatService', `[streamMessage] Context built: ${context.length} messages`);

      const messages: ChatMessage[] = [
        { role: 'system', content: `${this.buildSystemPrompt(request.userId)}\n\n${workAgent.prompt.system}` },
        ...context,
        { role: 'user', content: workAgent.prompt.instruction || request.message },
      ];
      logger.info('ChatService', `[streamMessage] Total messages: ${messages.length}, starting stream...`);

      const setupDuration = Date.now() - startTime;
      logger.info('ChatService', `[streamMessage] Setup completed in ${setupDuration}ms, starting LLM stream`);

      const rawStream = this.llmService.streamChatCompletion({
        model: workAgent.llm?.modelId || 'gpt-4o',
        messages,
        temperature: workAgent.llm?.temperature ?? 0.7,
        maxTokens: workAgent.llm?.maxTokens ?? 4096,
      }, selectedModel.id);

      // ---- 3. Wrap LLM stream as SSE event JSON strings ----
      const self = this;
      const selfExchangeId = exchangeId;
      return {
        [Symbol.asyncIterator]() {
          const iterator = rawStream[Symbol.asyncIterator]();
          let fullText = '';
          let saved = false;
          let preEventsSent = false;

          return {
            async next() {
              // Emit agent_created + agent_status(running) before first text chunk
              if (!preEventsSent) {
                preEventsSent = true;
                const agentCreatedEvt = JSON.stringify({
                  type: 'agent_created',
                  agent: agentChainForFrontend[0],
                });
                const agentStatusEvt = JSON.stringify({
                  type: 'agent_status',
                  agentId: workAgent.id,
                  status: 'running',
                });
                return { done: false, value: agentCreatedEvt + '\n' + agentStatusEvt + '\n' };
              }

              const result = await iterator.next();
              if (result.done) {
                if (saved) {
                  // Already emitted done event, signal real end
                  return { done: true, value: undefined as any };
                }
                saved = true;
                try {
                  await self.informationService.saveMessage({
                      userId: request.userId,
                      sessionId,
                      exchangeId: selfExchangeId,
                      msgId: assistantMsgId,
                      role: 'assistant',
                      content: fullText,
                      summary: fullText.slice(0, 100),
                      tokens: self.countTokens(fullText),
                      metadata: request.metadata || {},
                      tags: self.extractKeywords(fullText),
                      isLearningMemory: false,
                      messageIndex: await self.getMessageIndex(sessionId, request.userId),
                      referenceCount: 0,
                    });
                  } catch (e: any) {
                    logger.info('ChatService', `[streamMessage] Save assistant failed: ${e.message || e}`);
                  }
                  // Persist agent chain for future retrieval
                  try {
                    await self.informationService.saveAgentChain(sessionId, selfExchangeId, agentChainForFrontend);
                  } catch (e: any) {
                    logger.info('ChatService', `[streamMessage] Save agent chain failed: ${e.message || e}`);
                  }
                // done event with agentChain + fullText
                const doneEvt = JSON.stringify({
                  type: 'done',
                  fullText,
                  agentChain: agentChainForFrontend,
                  agentStatus: { agentId: workAgent.id, status: 'completed', endTime: Date.now() },
                });
                logger.info('ChatService', `[streamMessage] ====== END ====== duration=${Date.now() - startTime}ms`);
                return { done: false, value: doneEvt + '\n' };
              }
              fullText += result.value;
              // text event + agent_output event
              const textEvt = JSON.stringify({ type: 'text', text: result.value });
              const outputEvt = JSON.stringify({ type: 'agent_output', agentId: workAgent.id, output: result.value, outputType: 'stdout' });
              return { done: false, value: textEvt + '\n' + outputEvt + '\n' };
            },
            async return(value?: string) {
              if (!saved) {
                saved = true;
                try {
                  if (fullText) {
                    await self.informationService.saveMessage({
                      userId: request.userId,
                      sessionId,
                      exchangeId: selfExchangeId,
                      msgId: assistantMsgId,
                      role: 'assistant',
                      content: fullText,
                      summary: fullText.slice(0, 100),
                      tokens: self.countTokens(fullText),
                      metadata: request.metadata || {},
                      tags: self.extractKeywords(fullText),
                      isLearningMemory: false,
                      messageIndex: await self.getMessageIndex(sessionId, request.userId),
                      referenceCount: 0,
                    });
                  }
                } catch { /* ignore */ }
                try {
                  await self.informationService.saveAgentChain(sessionId, selfExchangeId, agentChainForFrontend);
                } catch { /* ignore */ }
              }
              if (iterator.return) {
                return iterator.return(value);
              }
              return { done: true as const, value };
            },
          };
        },
      };
    } catch (e: any) {
      const errorDuration = Date.now() - startTime;
      logger.info('ChatService', `[streamMessage] ====== ERROR ====== Total duration=${errorDuration}ms sessionId=${sessionId} exchangeId=${exchangeId}`);
      logger.info('ChatService', `[streamMessage] Error: ${e.message || e}`);
      logger.info('ChatService', `[streamMessage] Error stack: ${e.stack || 'no stack'}`);
      throw e;
    }
  }

  async getChatHistory(
    userId: string,
    sessionId: string,
    page: number = 1,
    pageSize: number = 100
  ): Promise<ChatHistoryResponse> {
    logger.info('ChatService', `[getChatHistory] userId=${userId} sessionId=${sessionId} page=${page} pageSize=${pageSize}`);

    const allMessages = await this.informationService.getMessagesByChat(sessionId, userId);

    const total = allMessages.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);

    const startIndex = total - safePage * pageSize;
    const endIndex = total - (safePage - 1) * pageSize;

    // Keep chronological (ascending) order: page 1 = the last `pageSize` messages,
    // page 2 = the previous `pageSize` older messages, etc. (standard chat pagination)
    const paginatedMessages = allMessages
      .slice(Math.max(0, startIndex), Math.max(0, endIndex));

    logger.info('ChatService', `[getChatHistory] total=${total} totalPages=${totalPages} safePage=${safePage} returned=${paginatedMessages.length}`);

    return {
      messages: paginatedMessages,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
    };
  }

  async listChats(userId: string): Promise<{ sessionId: string; lastMessage: string; lastTime: number }[]> {
    logger.info('ChatService', `[listChats] userId=${userId}`);
    const messages = await this.informationService.getAllMessagesByUser(userId);

    const chatMap = new Map<string, { lastMessage: string; lastTime: number }>();
    for (const msg of messages) {
      if (!chatMap.has(msg.sessionId) || msg.createdAt > chatMap.get(msg.sessionId)!.lastTime) {
        chatMap.set(msg.sessionId, {
          lastMessage: msg.content.slice(0, 100),
          lastTime: msg.createdAt,
        });
      }
    }

    const result = Array.from(chatMap.entries()).map(([sessionId, info]) => ({
      sessionId,
      ...info,
    }));
    logger.info('ChatService', `[listChats] totalMessages=${messages.length} chatCount=${result.length}`);
    return result;
  }

  async getExchanges(userId: string, sessionId: string): Promise<{
    exchangeId: string;
    userMessage: { msgId: string; content: string; summary: string; referenceCount: number; createdAt: number } | null;
    assistantMessage: { msgId: string; content: string; summary: string; referenceCount: number; createdAt: number } | null;
    messageCount: number;
    firstMessageAt: number;
    lastMessageAt: number;
    referencedExchangeIds: string[];
  }[]> {
    logger.info('ChatService', `[getExchanges] userId=${userId} sessionId=${sessionId}`);
    const exchanges = await this.informationService.getExchangesBySession(sessionId, userId);

    // Collect all selectedMessageIds to resolve in batch
    const allSelectedMsgIds: string[] = [];
    for (const ex of exchanges) {
      if (ex.userMessage?.metadata && typeof ex.userMessage.metadata === 'object') {
        const meta = ex.userMessage.metadata as Record<string, any>;
        if (meta.selectedMessageIds && Array.isArray(meta.selectedMessageIds)) {
          allSelectedMsgIds.push(...meta.selectedMessageIds);
        }
      }
    }

    const msgIdToExchangeId = allSelectedMsgIds.length > 0
      ? await this.informationService.getExchangeIdsByMsgIds(allSelectedMsgIds)
      : new Map<string, string>();

    return exchanges.map(ex => {
      let referencedExchangeIds: string[] = [];
      if (ex.userMessage?.metadata && typeof ex.userMessage.metadata === 'object') {
        const meta = ex.userMessage.metadata as Record<string, any>;
        if (meta.selectedMessageIds && Array.isArray(meta.selectedMessageIds)) {
          referencedExchangeIds = meta.selectedMessageIds
            .map((mid: string) => msgIdToExchangeId.get(mid))
            .filter((eid: string | undefined): eid is string => !!eid);
        }
      }
      return {
        exchangeId: ex.exchangeId,
        userMessage: ex.userMessage ? {
          msgId: ex.userMessage.msgId,
          content: ex.userMessage.content,
          summary: ex.userMessage.summary,
          referenceCount: ex.userMessage.referenceCount,
          createdAt: ex.userMessage.createdAt,
        } : null,
        assistantMessage: ex.assistantMessage ? {
          msgId: ex.assistantMessage.msgId,
          content: ex.assistantMessage.content,
          summary: ex.assistantMessage.summary,
          referenceCount: ex.assistantMessage.referenceCount,
          createdAt: ex.assistantMessage.createdAt,
        } : null,
        messageCount: ex.messageCount,
        firstMessageAt: ex.firstMessageAt,
        lastMessageAt: ex.lastMessageAt,
        referencedExchangeIds,
      };
    });
  }

  async searchMessages(userId: string, query: string, limit: number = 20): Promise<{
    id: string;
    msgId: string;
    sessionId: string;
    exchangeId: string;
    role: string;
    content: string;
    summary: string;
    createdAt: number;
  }[]> {
    logger.info('ChatService', `[searchMessages] userId=${userId} query="${query}" limit=${limit}`);
    const results = await this.informationService.searchMessages(userId, query, limit);
    return results.map(msg => ({
      id: msg.id,
      msgId: msg.msgId,
      sessionId: msg.sessionId,
      exchangeId: msg.exchangeId,
      role: msg.role,
      content: msg.content,
      summary: msg.summary,
      createdAt: msg.createdAt,
    }));
  }

  async getAgentChainByExchangeId(exchangeId: string): Promise<any[] | null> {
    logger.info('ChatService', `[getAgentChainByExchangeId] exchangeId=${exchangeId}`);
    return this.informationService.getAgentChain(exchangeId);
  }

  private buildAgentChainEvents(workAgent: WorkAgent): Array<{
    id: string; type: string; name: string;
    role: string; description: string;
    status: string; strategy?: string;
    skillIds?: string[]; mcpIds?: string[];
    startTime?: number; endTime?: number;
    outputs?: { type: string; content: string }[];
    children?: string[];
  }> {
    return [{
      id: workAgent.id,
      type: 'coordinator',
      name: workAgent.name || `Agent-${workAgent.id.slice(0, 8)}`,
      role: 'Coordinator',
      description: workAgent.prompt?.instruction || 'Coordinates task execution',
      status: 'idle',
      strategy: workAgent.strategy || 'react',
      skillIds: workAgent.skillIds || [],
      mcpIds: workAgent.mcpIds || [],
      startTime: Date.now(),
      endTime: undefined,
      outputs: [],
      children: [],
    }];
  }

  private async buildContext(userId: string, chatId: string, selectedMessageIds?: string[]): Promise<ChatMessage[]> {
    const context: ChatMessage[] = [];

    if (selectedMessageIds && selectedMessageIds.length > 0) {
      logger.info('ChatService', `[buildContext] fetching ${selectedMessageIds.length} selected messages`);
      const selectedMessages = await this.informationService.getSelectedMessages(userId, selectedMessageIds);
      for (const msg of selectedMessages) {
        context.push({ role: msg.role, content: msg.content });
      }
      logger.info('ChatService', `[buildContext] selected messages retrieved: ${selectedMessages.length}`);
    }

    const workingMemory = await this.informationService.getWorkingMemory(userId, chatId, 20);
    for (const msg of workingMemory) {
      context.push({ role: msg.role, content: msg.content });
    }
    logger.info('ChatService', `[buildContext] workingMemory: ${workingMemory.length} messages, total context: ${context.length}`);

    return context;
  }

  private buildSystemPrompt(userId: string): string {
    return `You are Brian, an AI assistant. Use the provided context to answer the user's question.`;
  }

  private async getMessageIndex(chatId: string, userId: string): Promise<number> {
    const messages = await this.informationService.getMessagesByChat(chatId, userId);
    return messages.length;
  }

  private countTokens(text: string): number {
    return Math.floor(text.length / 4);
  }

  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().match(/[a-zA-Z]+/g) || [];
    return words.slice(0, 20);
  }
}