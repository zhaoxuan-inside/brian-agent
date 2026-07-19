import express from 'express';
import { InformationService } from '../core/information/InformationService';
import { AgentOrchestrator } from '../strategy/AgentOrchestrator';

export function createVisualRoutes(informationService: InformationService, orchestrator: AgentOrchestrator): express.Router {
  const router = express.Router();

  router.get('/memory-graph/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const graph = await informationService.getMemoryGraph(userId);
      res.json(graph);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/chat-flow/:chatId', async (req, res) => {
    try {
      const { chatId } = req.params;
      const { userId } = req.query as { userId: string };
      const messages = await informationService.getMessagesByChat(chatId, userId);
      
      const flow = messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.createdAt,
        metadata: msg.metadata,
      }));
      
      res.json({ chatId, flow });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/agent-status', async (req, res) => {
    try {
      const agents = orchestrator.listAgents();
      res.json({ agents, timestamp: Date.now() });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}