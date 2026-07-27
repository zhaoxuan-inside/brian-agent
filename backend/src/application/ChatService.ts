import { z } from 'zod';
import { ChatMessage } from '../base/LLMWrapper';
import { InformationService, UserMessage } from '../core/information/InformationService';
import { LLMService } from '../core/llm/LLMService';
import { AgentOrchestrator } from '../strategy/AgentOrchestrator';
import { UserProfileService } from './UserProfileService';
import { ChatDagService, SessionDag, MessageDetail } from './ChatDagService';
import { AgentOrchestrationService } from './AgentOrchestrationService';
import { SelfLearningService } from './SelfLearningService';
import { ModelConfigService } from '../core/modelConfig/ModelConfigService';
import { getCancelRegistry } from './cancelRegistry';
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
    private modelConfigService: ModelConfigService,
    private chatDagService: ChatDagService,
    private agentOrchestration: AgentOrchestrationService,
    private selfLearningService: SelfLearningService
  ) {}

  /**
   * Verify at least one model is configured in "当前模型" (user_model_config).
   * Throws with a user-friendly message if none are available.
   */
  private async ensureModelsConfigured(): Promise<void> {
    const models = await this.modelConfigService.listConfigs();
    const active = models.filter(m => m.status === 'active');
    logger.info('ChatService', `[ensureModelsConfigured] Total model configs: ${models.length}, active: ${active.length}`);
    if (active.length === 0) {
      logger.warn('ChatService', '[ensureModelsConfigured] No active models — rejecting request');
      throw new Error('未配置可用模型，请先在"模型管理"页面添加模型');
    }
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

      // Record message references (user-controlled context) + schedule semantic summary
      if (request.selectedMessageIds?.length) {
        await this.chatDagService.recordReferences(sessionId, userMsgId, request.selectedMessageIds);
      }
      this.chatDagService.scheduleSummary(userMsgId, request.message);

      logger.info('ChatService', `[sendMessage] Building context...`);
      const context = await this.buildContext(request.userId, sessionId, request.selectedMessageIds, userMsgId);
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
      this.chatDagService.scheduleSummary(assistantMsgId, result.finalResult);
      this.scheduleEvaluation(result.finalResult, request.message);
      this.scheduleLearning(request.userId, sessionId);


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
      await this.ensureModelsConfigured();
      logger.info('ChatService', `[streamMessage] Model check passed`);

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

      // Record message references (user-controlled context) + schedule semantic summary
      if (request.selectedMessageIds?.length) {
        await this.chatDagService.recordReferences(sessionId, userMsgId, request.selectedMessageIds);
      }
      this.chatDagService.scheduleSummary(userMsgId, request.message);

      // ---- 2. 加载系统 Planner Agent 作为 Coordinator ----
      const plannerAgent = await this.agentOrchestration.getPlannerAgent();
      const coordinatorAgent = plannerAgent
        ? {
            id: plannerAgent.id,
            type: 'coordinator',
            name: plannerAgent.name,
            role: 'Planner',
            description: plannerAgent.description,
            status: 'idle',
            strategy: plannerAgent.strategy?.type || 'plan-execute',
            children: [] as string[],
            output: [] as { type: string; content: string }[],
            startTime: Date.now(),
            endTime: undefined as number | undefined,
          }
        : {
            id: `coordinator-${Date.now()}`,
            type: 'coordinator',
            name: '系统任务规划者',
            role: 'Planner',
            description: '任务分解与编排',
            status: 'idle',
            strategy: 'plan-execute',
            children: [] as string[],
            output: [] as { type: string; content: string }[],
            startTime: Date.now(),
            endTime: undefined as number | undefined,
          };

      logger.info('ChatService', `[streamMessage] Building context...`);
      const context = await this.buildContext(request.userId, sessionId, request.selectedMessageIds, userMsgId);
      logger.info('ChatService', `[streamMessage] Context built: ${context.length} messages`);

      // ── 系统编排: Planner 分解 → Worker 执行 → Synthesizer 合并（惰性执行）──
      const orchMessages: ChatMessage[] = [
        ...context,
        { role: 'user', content: request.message },
      ];

      const self = this;
      const selfExchangeId = exchangeId;

      return {
        [Symbol.asyncIterator]() {
          let fullText = '';
          let saved = false;
          let phase: 'loading' | 'progress' | 'agentEvents' | 'text' | 'done' = 'loading';
          let orchResult: Awaited<ReturnType<typeof self.agentOrchestration.orchestrate>> | null = null;
          let allOrchAgents: any[] = [];
          let subAgents: any[] = [];
          let agentEventLines: string[] = [];
          let evtIdx = 0;
          let textIdx = 0;
          const chunkSize = 30;
          let textContent = '';
          // Real-time event queue: onProgress pushes thinking JSON lines here
          const progressQueue: string[] = [];
          let queueResolve: (() => void) | null = null;

          function pushProgress(line: string) {
            progressQueue.push(line);
            if (queueResolve) { queueResolve(); queueResolve = null; }
          }

          function buildFinalData(result: Awaited<ReturnType<typeof self.agentOrchestration.orchestrate>>) {
            const cos = coordinatorAgent;
            cos.children = [];
            // Add coordinator thinking (Planner decomposition plan)
            const plannerThink = result.thinkingRecords.find(r => r.taskId === 'planner');
            if (plannerThink) {
              (cos as any).thinking = { systemPrompt: plannerThink.systemPrompt, instruction: plannerThink.instruction, fullOutput: plannerThink.output };
            }
            subAgents = result.subtaskResults.map((sr, i) => {
              const think = result.thinkingRecords.find(r => r.agentId === sr.agentId);
              return {
                id: sr.agentId,
                type: 'sub' as const,
                name: `Worker-${i + 1}: ${(think?.instruction || sr.taskId).slice(0, 40)}`,
                role: 'Worker',
                description: think?.instruction || `执行子任务: ${sr.taskId}`,
                status: 'completed' as const,
                startTime: think?.startTime || Date.now(),
                endTime: think?.endTime || Date.now(),
                strategy: sr.strategy || cos.strategy,
                llm: sr.llm || { providerId: '', modelId: '', temperature: 0.7, maxTokens: 4096 },
                skillIds: sr.skillIds || [],
                mcpIds: sr.mcpIds || [],
                soulId: sr.soulId || '',
                children: [] as string[],
                output: [{ type: 'stdout' as const, content: sr.output.slice(0, 500) }],
                thinking: think ? { systemPrompt: think.systemPrompt, instruction: think.instruction, fullOutput: sr.output } : undefined,
              };
            });
            cos.children = subAgents.map(a => a.id);
            cos.endTime = Date.now();
            allOrchAgents = [cos, ...subAgents];

            agentEventLines = [];
            for (const record of result.thinkingRecords) {
              agentEventLines.push(JSON.stringify({ type: 'agent_thinking', agentId: record.agentId, taskId: record.taskId, systemPrompt: record.systemPrompt, instruction: record.instruction, output: record.output.slice(0, 500) }));
            }
            for (const agent of allOrchAgents) {
              agentEventLines.push(JSON.stringify({ type: 'agent_created', agent }));
              agentEventLines.push(JSON.stringify({ type: 'agent_status', agentId: agent.id, status: 'running' }));
            }
            for (const sr of result.subtaskResults) {
              agentEventLines.push(JSON.stringify({ type: 'agent_output', agentId: sr.agentId, output: sr.output.slice(0, 500), outputType: 'stdout' }));
              agentEventLines.push(JSON.stringify({ type: 'agent_status', agentId: sr.agentId, status: 'completed', endTime: Date.now() }));
            }
            textContent = result.finalResult;
          }

          return {
            async next() {
              // Phase 1: loading — launch orchestration, return loading indicator
              if (phase === 'loading') {
                phase = 'progress';
                const abortCtrl = new AbortController();
                getCancelRegistry().set(selfExchangeId, abortCtrl);
                self.agentOrchestration.orchestrate(orchMessages, { userId: request.userId, sessionId }, {
                  onProgress: (record) => {
                    pushProgress(JSON.stringify({
                      type: 'agent_thinking',
                      agentId: record.agentId,
                      taskId: record.taskId,
                      systemPrompt: record.systemPrompt,
                      instruction: record.instruction,
                      output: record.output.slice(0, 500),
                      startTime: record.startTime,
                      endTime: record.endTime,
                    }));
                  }
                }, abortCtrl.signal).then(r => {
                    orchResult = r;
                    getCancelRegistry().delete(selfExchangeId);
                    logger.info('ChatService', `[streamMessage] Orchestration OK: ${r.subtaskResults.length} subtasks, duration=${Date.now() - startTime}ms`);
                    buildFinalData(r);
                    if (queueResolve) { queueResolve(); queueResolve = null; }
                  }).catch(e => {
                    if (e?.name === 'AbortError' || (e as Error)?.message?.includes('abort')) {
                      logger.info('ChatService', `[streamMessage] Orchestration cancelled, exchangeId=${selfExchangeId}`);
                      orchResult = { finalResult: '', subtaskResults: [], thinkingRecords: [], duration: 0 };
                    } else {
                      logger.error('ChatService', `[streamMessage] Orchestration error: ${(e as Error).message}`);
                      orchResult = { finalResult: '', subtaskResults: [], thinkingRecords: [], duration: 0 };
                    }
                    getCancelRegistry().delete(selfExchangeId);
                    buildFinalData(orchResult);
                    if (queueResolve) { queueResolve(); queueResolve = null; }
                  });
                return { done: false, value: JSON.stringify({ type: 'loading' }) + '\n' };
              }

              // Phase 2: progress — yield thinking events in real-time as workers complete
              if (phase === 'progress') {
                if (progressQueue.length > 0) {
                  return { done: false, value: progressQueue.shift()! + '\n' };
                }
                if (orchResult) {
                  phase = 'agentEvents';
                  // Fall through to agentEvents
                } else {
                  // Wait for next progress event or orchestration completion
                  await new Promise<void>(resolve => { queueResolve = resolve; });
                  if (progressQueue.length > 0) {
                    return { done: false, value: progressQueue.shift()! + '\n' };
                  }
                  if (orchResult) phase = 'agentEvents';
                  else return { done: false, value: '' }; // should not happen
                }
              }

              // Phase 3: agentEvents — emit agent_created / agent_status / final agent_thinking
              if (phase === 'agentEvents') {
                if (evtIdx < agentEventLines.length) {
                  return { done: false, value: agentEventLines[evtIdx++] + '\n' };
                }
                phase = 'text';
              }

              // Phase 4: text streaming
              if (phase === 'text') {
                if (textIdx < textContent.length) {
                  const chunk = textContent.slice(textIdx, textIdx + chunkSize);
                  textIdx += chunkSize;
                  fullText += chunk;
                  const textEvt = JSON.stringify({ type: 'text', text: chunk });
                  const outputEvt = JSON.stringify({ type: 'agent_output', agentId: coordinatorAgent.id, output: chunk, outputType: 'stdout' });
                  return { done: false, value: textEvt + '\n' + outputEvt + '\n' };
                }
                phase = 'done';
              }

              // Phase 5: done
              if (phase === 'done') {
                if (saved) return { done: true, value: undefined as any };
                saved = true;
                try {
                  await self.informationService.saveMessage({
                    userId: request.userId, sessionId, exchangeId: selfExchangeId,
                    msgId: assistantMsgId, role: 'assistant', content: fullText,
                    summary: fullText.slice(0, 100), tokens: self.countTokens(fullText),
                    metadata: request.metadata || {},
                    tags: self.extractKeywords(fullText),
                    isLearningMemory: false,
                    messageIndex: await self.getMessageIndex(sessionId, request.userId),
                    referenceCount: 0,
                  });
                  self.chatDagService.scheduleSummary(assistantMsgId, fullText);
                  self.scheduleEvaluation(fullText, request.message);
                  self.scheduleLearning(request.userId, sessionId);
                } catch (e: any) {
                  logger.info('ChatService', `[streamMessage] Save assistant failed: ${e.message || e}`);
                }
                try {
                  await self.informationService.saveAgentChain(sessionId, selfExchangeId, allOrchAgents);
                } catch (e: any) {
                  logger.info('ChatService', `[streamMessage] Save agent chain failed: ${e.message || e}`);
                }
                const doneEvt = JSON.stringify({
                  type: 'done', fullText, agentChain: allOrchAgents,
                  agentStatus: { agentId: coordinatorAgent.id, status: 'completed', endTime: Date.now() },
                });
                logger.info('ChatService', `[streamMessage] ====== END ====== duration=${Date.now() - startTime}ms`);
                return { done: false, value: doneEvt + '\n' };
              }

              return { done: true, value: undefined as any };
            },
            async return(value?: string) {
              if (!saved && fullText) {
                saved = true;
                try {
                  await self.informationService.saveMessage({
                    userId: request.userId, sessionId, exchangeId: selfExchangeId,
                    msgId: assistantMsgId, role: 'assistant', content: fullText,
                    summary: fullText.slice(0, 100), tokens: self.countTokens(fullText),
                    metadata: request.metadata || {},
                    tags: self.extractKeywords(fullText), isLearningMemory: false,
                    messageIndex: await self.getMessageIndex(sessionId, request.userId),
                    referenceCount: 0,
                  });
                  self.chatDagService.scheduleSummary(assistantMsgId, fullText);
                  self.scheduleEvaluation(fullText, request.message);
                  self.scheduleLearning(request.userId, sessionId);
                } catch { /* ignore */ }
                try { await self.informationService.saveAgentChain(sessionId, selfExchangeId, allOrchAgents); } catch { /* ignore */ }
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

  /**
   * 会话 DAG（消息级节点 + 顺序/引用边 + 引用计数），供 ChatMap 画布展示。
   */
  async getSessionDag(userId: string, sessionId: string): Promise<SessionDag> {
    return this.chatDagService.buildSessionDag(userId, sessionId);
  }

  /**
   * 消息详情（完整内容 + 双向引用摘要列表），供「查看详情」与引用徽标弹窗。
   */
  async getMessageDetail(msgId: string): Promise<MessageDetail | null> {
    return this.chatDagService.getMessageDetail(msgId);
  }

  async deleteSession(sessionId: string): Promise<void> {
    logger.info('ChatService', `[deleteSession] sessionId=${sessionId}`);
    await this.informationService.deleteSession(sessionId);
    logger.info('ChatService', `[deleteSession] done sessionId=${sessionId}`);
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

  /**
   * Build LLM context.
   * - With selectedMessageIds (user-controlled context via ChatMap checkboxes):
   *   ancestor closure of the selected messages (sequence + reference edges), chronological.
   *   Working memory is NOT mixed in, so the user's selection fully controls the context.
   * - Without selection: the latest 20 messages of working memory in chronological order.
   * The just-saved current user message (excludeMsgId) is excluded from working memory
   * because callers append it explicitly afterwards.
   */
  private async buildContext(userId: string, chatId: string, selectedMessageIds?: string[], excludeMsgId?: string): Promise<ChatMessage[]> {
    if (selectedMessageIds && selectedMessageIds.length > 0) {
      const context = await this.chatDagService.resolveAncestorContext(userId, chatId, selectedMessageIds);
      logger.info('ChatService', `[buildContext] ancestor closure: selected=${selectedMessageIds.length} -> context=${context.length} messages`);
      return context;
    }

    const workingMemory = await this.informationService.getWorkingMemory(userId, chatId, 20);
    const context: ChatMessage[] = workingMemory
      .filter(msg => msg.msgId !== excludeMsgId)
      .reverse() // getWorkingMemory returns newest-first; LLM context must be chronological
      .map(msg => ({ role: msg.role, content: msg.content }));
    logger.info('ChatService', `[buildContext] workingMemory: ${context.length} messages`);
    return context;
  }

  private buildSystemPrompt(userId: string): string {
    return `You are Brian, an AI assistant. Use the provided context to answer the user's question.`;
  }

  /**
   * 系统 Evaluator：评估 assistant 回复质量，回写 AgentLibrary（fire-and-forget）。
   * 影响对应 workAgent 的 reliability / strength，驱动自优化老化/强化。
   */
  private scheduleEvaluation(assistantContent: string, userMessage: string): void {
    if (!assistantContent) return;
    this.agentOrchestration.evaluateAndRecordFeedback(assistantContent, userMessage)
      .catch(e => logger.warn('ChatService', `[scheduleEvaluation] failed: ${(e as Error).message}`));
  }

  /**
   * 自学习：从对话中提取知识，写入 memory_nodes（fire-and-forget）。
   */
  private scheduleLearning(userId: string, sessionId: string): void {
    this.selfLearningService.learnFromChat(userId, sessionId)
      .then(count => logger.info('ChatService', `[scheduleLearning] extracted ${count} memories from chat ${sessionId}`))
      .catch(e => logger.warn('ChatService', `[scheduleLearning] failed: ${(e as Error).message}`));
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