import express from 'express';
import { ChatService, ChatMessageRequestSchema } from '../application/ChatService';
import { getCancelRegistry } from '../application/cancelRegistry';
import { logger } from '../infrastructure/logger';

export function createChatRoutes(chatService: ChatService): express.Router {
  const router = express.Router();

  // Cancel endpoint
  router.post('/cancel/:exchangeId', (req, res) => {
    const { exchangeId } = req.params;
    const ctrl = getCancelRegistry().get(exchangeId);
    if (ctrl) {
      ctrl.abort();
      getCancelRegistry().delete(exchangeId);
      logger.info('ChatRoutes', `[POST /cancel] aborted exchangeId=${exchangeId}`);
      res.json({ success: true, message: '任务已取消' });
    } else {
      res.status(404).json({ success: false, message: '未找到运行中的任务' });
    }
  });

  router.post('/send', async (req, res) => {
    try {
      const parsed = ChatMessageRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        logger.warn('ChatRoutes', `[POST /send] validation failed: ${JSON.stringify(parsed.error.issues)}`);
        res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
        return;
      }
      logger.info('ChatRoutes', `[POST /send] userId=${parsed.data.userId} sessionId=${parsed.data.sessionId || 'new'} msgLen=${parsed.data.message.length}`);
      const response = await chatService.sendMessage(parsed.data);
      logger.info('ChatRoutes', `[POST /send] responded: sessionId=${response.sessionId} exchangeId=${response.exchangeId} contentLen=${response.content.length}`);
      res.json(response);
    } catch (error) {
      logger.error('ChatRoutes', `[POST /send] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/stream', async (req, res) => {
    let headersSent = false;
    try {
      const parsed = ChatMessageRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        logger.warn('ChatRoutes', `[POST /stream] validation failed: ${JSON.stringify(parsed.error.issues)}`);
        res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
        return;
      }
      logger.info('ChatRoutes', `[POST /stream] userId=${parsed.data.userId} msgLen=${parsed.data.message.length}`);
      const stream = await chatService.streamMessage(parsed.data);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      headersSent = true;

      for await (const chunk of stream) {
        const lines = chunk.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            res.write(`data: ${line}\n\n`);
          }
        }
      }

      res.end();
      logger.info('ChatRoutes', `[POST /stream] stream ended`);
    } catch (error) {
      const errMsg = (error as Error).message;
      logger.error('ChatRoutes', `[POST /stream] error: ${errMsg}`);
      if (headersSent) {
        // Headers already sent, write error as SSE event
        try {
          res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
          res.end();
        } catch {
          // Connection may already be closed
        }
      } else {
        res.status(500).json({ error: errMsg });
      }
    }
  });

  router.get('/history/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { userId, page, pageSize } = req.query as { userId: string; page?: string; pageSize?: string };

      if (!userId) {
        logger.warn('ChatRoutes', `[GET /history] missing userId`);
        res.status(400).json({ error: 'userId query parameter is required' });
        return;
      }

      const pageNum = page ? parseInt(page, 10) : 1;
      const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 100;

      if (isNaN(pageNum) || pageNum < 1) {
        res.status(400).json({ error: 'page must be a positive integer' });
        return;
      }
      if (isNaN(pageSizeNum) || pageSizeNum < 1) {
        res.status(400).json({ error: 'pageSize must be a positive integer' });
        return;
      }

      logger.info('ChatRoutes', `[GET /history] sessionId=${sessionId} userId=${userId} page=${pageNum} pageSize=${pageSizeNum}`);
      const result = await chatService.getChatHistory(userId, sessionId, pageNum, pageSizeNum);
      logger.info('ChatRoutes', `[GET /history] returned ${result.messages.length} messages, total=${result.pagination.total}`);
      res.json(result);
    } catch (error) {
      logger.error('ChatRoutes', `[GET /history] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/list', async (req, res) => {
    try {
      const { userId } = req.query as { userId: string };

      if (!userId) {
        logger.warn('ChatRoutes', `[GET /list] missing userId`);
        res.status(400).json({ error: 'userId query parameter is required' });
        return;
      }

      logger.info('ChatRoutes', `[GET /list] userId=${userId}`);
      const chats = await chatService.listChats(userId);
      logger.info('ChatRoutes', `[GET /list] returned ${chats.length} chats`);
      res.json(chats);
    } catch (error) {
      logger.error('ChatRoutes', `[GET /list] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/dag/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { userId } = req.query as { userId: string };

      if (!userId) {
        logger.warn('ChatRoutes', `[GET /dag] missing userId`);
        res.status(400).json({ error: 'userId query parameter is required' });
        return;
      }

      logger.info('ChatRoutes', `[GET /dag] sessionId=${sessionId} userId=${userId}`);
      const dag = await chatService.getSessionDag(userId, sessionId);
      logger.info('ChatRoutes', `[GET /dag] returned ${dag.nodes.length} nodes, ${dag.edges.length} edges`);
      res.json(dag);
    } catch (error) {
      logger.error('ChatRoutes', `[GET /dag] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/message/:msgId', async (req, res) => {
    try {
      const { msgId } = req.params;
      logger.info('ChatRoutes', `[GET /message] msgId=${msgId}`);
      const detail = await chatService.getMessageDetail(msgId);
      if (!detail) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }
      res.json(detail);
    } catch (error) {
      logger.error('ChatRoutes', `[GET /message] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/exchanges/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { userId } = req.query as { userId: string };

      if (!userId) {
        logger.warn('ChatRoutes', `[GET /exchanges] missing userId`);
        res.status(400).json({ error: 'userId query parameter is required' });
        return;
      }

      logger.info('ChatRoutes', `[GET /exchanges] sessionId=${sessionId} userId=${userId}`);
      const exchanges = await chatService.getExchanges(userId, sessionId);
      logger.info('ChatRoutes', `[GET /exchanges] returned ${exchanges.length} exchanges`);
      res.json({ exchanges });
    } catch (error) {
      logger.error('ChatRoutes', `[GET /exchanges] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/search', async (req, res) => {
    try {
      const { userId, q, limit } = req.query as { userId: string; q: string; limit?: string };

      if (!userId) {
        logger.warn('ChatRoutes', `[GET /search] missing userId`);
        res.status(400).json({ error: 'userId query parameter is required' });
        return;
      }
      if (!q) {
        logger.warn('ChatRoutes', `[GET /search] missing query`);
        res.status(400).json({ error: 'q query parameter is required' });
        return;
      }

      const limitNum = limit ? parseInt(limit, 10) : 20;
      logger.info('ChatRoutes', `[GET /search] userId=${userId} q="${q}" limit=${limitNum}`);
      const results = await chatService.searchMessages(userId, q, limitNum);
      logger.info('ChatRoutes', `[GET /search] found ${results.length} results`);
      res.json({ messages: results });
    } catch (error) {
      logger.error('ChatRoutes', `[GET /search] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/agent-chain/:exchangeId', async (req, res) => {
    try {
      const { exchangeId } = req.params;
      logger.info('ChatRoutes', `[GET /agent-chain] exchangeId=${exchangeId}`);
      const chain = await chatService.getAgentChainByExchangeId(exchangeId);
      if (!chain || chain.length === 0) {
        res.status(404).json({ error: 'Agent chain not found' });
        return;
      }
      res.json({ agentChain: chain });
    } catch (error) {
      logger.error('ChatRoutes', `[GET /agent-chain] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}