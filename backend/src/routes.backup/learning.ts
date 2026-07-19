import express, { Router } from 'express';
import { LearningService } from '../core/learning';
import { logger } from '../infrastructure/logger';

export function createLearningRoutes(learning: LearningService): Router {
  const router = express.Router();

  router.get('/queue', (_req, res) => {
    const queue = learning.getQueue();
    const stats = learning.getQueueStats();
    res.json({ queue, stats });
  });

  router.get('/queue/stats', (_req, res) => {
    const stats = learning.getQueueStats();
    res.json(stats);
  });

  router.put('/queue/:id/priority', (req, res) => {
    const { id } = req.params;
    const { priority } = req.body;
    if (typeof priority !== 'number') {
      return res.status(400).json({ error: 'Priority must be a number' });
    }
    learning.prioritize(id, priority);
    res.json({ success: true, id });
  });

  router.put('/queue/:id/skip', (req, res) => {
    const { id } = req.params;
    learning.skip(id);
    res.json({ success: true, id });
  });

  router.post('/queue/batch-approve', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: 'ids must be an array' });
    }
    learning.batchApprove(ids);
    res.json({ success: true, count: ids.length });
  });

  router.get('/batches', (_req, res) => {
    const batches = learning.batch();
    res.json({ batches, count: batches.length });
  });

  router.post('/plans', (req, res) => {
    const { batchId } = req.body;
    if (!batchId) {
      return res.status(400).json({ error: 'batchId is required' });
    }
    try {
      const plan = learning.createPlan(batchId);
      res.status(201).json(plan);
    } catch (error) {
      logger.error('Learning', `Failed to create plan: ${(error as Error).message}`);
      res.status(404).json({ error: (error as Error).message });
    }
  });

  router.get('/plans/:id/next-phase', (req, res) => {
    const { id } = req.params;
    const phase = learning.getNextPhase(id);
    if (!phase) {
      return res.status(404).json({ error: 'No pending phase found' });
    }
    res.json(phase);
  });

  router.post('/plans/:id/complete-phase', (req, res) => {
    const { id } = req.params;
    const { phase } = req.body;
    if (typeof phase !== 'number') {
      return res.status(400).json({ error: 'phase must be a number' });
    }
    learning.completePhase(id, phase);
    res.json({ success: true });
  });

  router.get('/progress', (_req, res) => {
    const progress = learning.getLearningProgress();
    res.json(progress);
  });

  router.get('/knowledge', (req, res) => {
    const { source } = req.query;
    const filters = source ? { source: String(source) } : undefined;
    const knowledge = learning.getLearnedKnowledge(filters);
    res.json({ knowledge, count: knowledge.length });
  });

  router.get('/knowledge/graph', (_req, res) => {
    const graph = learning.getKnowledgeGraph();
    res.json(graph);
  });

  router.get('/insights', (req, res) => {
    const { limit } = req.query;
    const limitNum = limit ? parseInt(String(limit), 10) : 10;
    const insights = learning.getRecentInsights(limitNum);
    res.json({ insights, count: insights.length });
  });

  router.get('/is-idle', (_req, res) => {
    const isIdle = learning.isIdle();
    res.json({ isIdle });
  });

  router.post('/schedule', (req, res) => {
    const { intervalMs } = req.body;
    learning.schedule(intervalMs || 300000);
    res.json({ success: true, intervalMs: intervalMs || 300000 });
  });

  router.get('/starvation', (_req, res) => {
    const isStarvation = learning.isStarvation();
    res.json({ isStarvation });
  });

  router.post('/rebalance', (_req, res) => {
    learning.rebalance();
    res.json({ success: true });
  });

  return router;
}