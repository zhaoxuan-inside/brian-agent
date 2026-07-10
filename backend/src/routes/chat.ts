import { Router, Request, Response } from 'express';
import { callLLM } from '../services/llm';
import { orchestrateChat, storeAgentChain, getAgentChain } from '../services/agentOrchestrator';
import { logger } from '../services/logger';

export function createChatRoutes(): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ ok: false, error: '请提供有效的消息列表' });
      }

      for (const m of messages) {
        if (!m.role || !m.content) {
          return res.status(400).json({ ok: false, error: '每条消息需包含 role 和 content' });
        }
      }

      const result = await callLLM(messages);
      res.json({ ok: true, data: result });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Chat error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // SSE streaming endpoint with agent orchestration
  router.post('/stream', async (req: Request, res: Response) => {
    try {
      const { messages, messageId } = req.body;
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ ok: false, error: '请提供有效的消息列表' });
      }

      logger.request('CHAT', 'POST', '/api/chat/stream', { msgCount: messages.length, lastMsg: messages[messages.length - 1]?.content?.slice(0, 50) });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      try {
        const stream = orchestrateChat(messages);
        let fullText = '';
        let agentChain: any[] = [];

        for await (const event of stream) {
          if (event.type === 'text') {
            fullText += event.text || '';
          }
          if (event.type === 'done') {
            fullText = event.fullText || fullText;
            agentChain = event.agentChain || [];
            logger.agent('CHAT', 'Stream complete', { textLen: (event.fullText || '').length, agentCount: (event.agentChain || []).length });
          }

          res.write(`data: ${JSON.stringify(event)}\n\n`);

          // After done, store the chain
          if (event.type === 'done' && messageId) {
            storeAgentChain(messageId, agentChain);
          }
        }
      } catch (streamErr: unknown) {
        const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        logger.error('CHAT', 'Stream error', { error: msg });
        res.write(`data: ${JSON.stringify({ type: 'done', fullText: '', agentChain: [], error: msg })}\n\n`);
      }

      res.end();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Stream error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // GET agent chain for a message
  router.get('/chain/:messageId', (req: Request, res: Response) => {
    const { messageId } = req.params;
    const chain = getAgentChain(messageId);
    if (!chain) {
      return res.json({ ok: true, data: [] });
    }
    res.json({ ok: true, data: chain });
  });

  return router;
}
