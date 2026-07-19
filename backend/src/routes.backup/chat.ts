import { Router, Request, Response } from 'express';
import { MetaAgent } from '../agent/metaAgent';
import { LLMService } from '../core/llm';
import { InformationService } from '../core/information';
import { LearningService } from '../core/learning';
import { v4 as uuidv4 } from 'uuid';
import { setupSSE, sendSSEEvent } from '../infrastructure/server';
import { logger } from '../infrastructure/logger';
import type { ChatMessage } from '../shared/types';

export function createChatRoutes(
  metaAgent: MetaAgent,
  llm: LLMService,
  information: InformationService,
  learning?: LearningService
): Router {
  const router = Router();

  /**
   * POST /api/chat - Non-streaming chat completion
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { message, conversationId, modelId, temperature, maxTokens } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
        return;
      }

      const cid = conversationId || uuidv4();

      // Analyze the task
      const task = metaAgent.receive({ type: 'user', content: message, conversationId: cid });
      const analysis = metaAgent.analyze(task.task);

      // Build context from memory
      const context = await information.buildContext(message, cid);

      // Store user message in working memory
      information.addToWorking(cid, { content: message, type: 'user_message', relevance: 1.0 });

      // Store user message to graph database (always store regardless of LLM result)
      await information.storeEpisodic(message, 'user');

      // Pass user message to learning service for passive learning
      learning?.onMessage({ role: 'user', content: message });

      // Build messages
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are Brian-Agent, an AI coding assistant. ${context ? `\nContext:\n${context}` : ''}`,
        },
        { role: 'user', content: message },
      ];

      // Call LLM
      const response = await llm.chat(messages, {
        modelId,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4096,
      });

      // Store assistant response in working memory
      information.addToWorking(cid, {
        content: response.content,
        type: 'assistant_message',
        relevance: 0.9,
      });

      // Store assistant response to graph database
      await information.storeEpisodic(response.content, 'assistant');

      // Pass assistant message to learning service for passive learning
      learning?.onMessage({ role: 'assistant', content: response.content });

      logger.info('Chat', `Non-streaming chat completed`, {
        conversationId: cid,
        intent: analysis.intent,
        tokens: response.usage.totalTokens,
      });

      res.json({
        conversationId: cid,
        message: {
          id: uuidv4(),
          role: 'assistant',
          content: response.content,
        },
        analysis,
        usage: response.usage,
        latencyMs: response.latencyMs,
      });
    } catch (err: any) {
      logger.error('Chat', `Chat error: ${err.message}`);
      res.status(500).json({ error: err.message || 'Internal server error', code: 'CHAT_ERROR' });
    }
  });

  /**
   * POST /api/chat/stream - SSE streaming chat completion
   */
  router.post('/stream', async (req: Request, res: Response) => {
    try {
      const { message, conversationId, modelId, temperature, maxTokens } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
        return;
      }

      const cid = conversationId || uuidv4();
      const messageId = uuidv4();

      setupSSE(req, res);

      // Send initial event
      sendSSEEvent(res, 'start', { conversationId: cid, messageId });

      // Analyze the task
      const task = metaAgent.receive({ type: 'user', content: message, conversationId: cid });
      const analysis = metaAgent.analyze(task.task);

      sendSSEEvent(res, 'analysis', analysis);

      // Build context
      const context = await information.buildContext(message, cid);
      information.addToWorking(cid, { content: message, type: 'user_message', relevance: 1.0 });

      // Build messages
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are Brian-Agent, an AI coding assistant. ${context ? `\nContext:\n${context}` : ''}`,
        },
        { role: 'user', content: message },
      ];

      // Stream response
      let fullContent = '';
      const stream = llm.chatStream(messages, {
        modelId,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4096,
      });

      let next = await stream.next();
      while (!next.done) {
        const delta = next.value as string;
        fullContent += delta;
        sendSSEEvent(res, 'text', { text: delta });
        next = await stream.next();
      }

      const response = next.value; // LLMResponse

      // Store response
      information.addToWorking(cid, {
        content: fullContent,
        type: 'assistant_message',
        relevance: 0.9,
      });

      await information.storeEpisodic(message, 'user');
      await information.storeEpisodic(fullContent, 'assistant');

      // Pass message to learning service for passive learning
      learning?.onMessage({ role: 'user', content: message });
      learning?.onMessage({ role: 'assistant', content: fullContent });

      sendSSEEvent(res, 'done', {
        messageId,
        conversationId: cid,
        fullText: fullContent,
        usage: response?.usage,
      });

      logger.info('Chat', `Stream chat completed`, {
        conversationId: cid,
        intent: analysis.intent,
        tokens: response?.usage?.totalTokens,
      });

      res.end();
    } catch (err: any) {
      logger.error('Chat', `Stream chat error: ${err.message}`);
      try {
        sendSSEEvent(res, 'error', { error: err.message });
      } catch {
        // Connection may already be closed
      }
      res.end();
    }
  });

  /**
   * GET /api/chat/chain/:messageId - Get agent chain for a message
   */
  router.get('/chain/:messageId', async (req: Request, res: Response) => {
    try {
      const { messageId } = req.params;

      if (!messageId) {
        res.status(400).json({ error: 'messageId is required', code: 'INVALID_PARAM' });
        return;
      }

      // Retrieve agent chain from storage
      const allNodes = await information['storage']?.graph?.getAllNodes?.() || [];
      const chainNodes = allNodes.filter((n: any) => {
        try {
          const data = JSON.parse(n.content || '{}');
          return data.messageId === messageId || data.rootAgentId === messageId;
        } catch {
          return false;
        }
      });

      res.json({
        messageId,
        chain: chainNodes.map((n: any) => {
          try {
            return JSON.parse(n.content);
          } catch {
            return { id: n.id, type: n.type };
          }
        }),
      });
    } catch (err: any) {
      logger.error('Chat', `Chain retrieval error: ${err.message}`);
      res.status(500).json({ error: err.message || 'Internal server error', code: 'CHAIN_ERROR' });
    }
  });

  return router;
}