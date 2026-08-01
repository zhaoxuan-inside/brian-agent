import express from 'express';
import { ChatService } from '../application/ChatService';
import { InformationService } from '../core/information/InformationService';
import { logger } from '../infrastructure/logger';

export function createGatewayRoutes(chatService: ChatService, _informationService: InformationService): express.Router {
  const router = express.Router();

  router.post('/message', async (req, res) => {
    try {
      const { userId, message, chatId, selectedMessageIds } = req.body;
      logger.info('GatewayRoutes', `[POST /message] userId=${userId} chatId=${chatId || 'new'} msgLen=${message?.length || 0} selectedMsgCount=${selectedMessageIds?.length || 0}`);
      const response = await chatService.sendMessage({
        userId,
        message,
        chatId,
        selectedMessageIds,
      });
      logger.info('GatewayRoutes', `[POST /message] responded: sessionId=${response.sessionId} exchangeId=${response.exchangeId}`);
      res.json(response);
    } catch (error) {
      logger.error('GatewayRoutes', `[POST /message] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/health', (req, res) => {
    logger.info('GatewayRoutes', '[GET /health]');
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  return router;
}