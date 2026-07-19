import express from 'express';
import { SelfLearningService } from '../application/SelfLearningService';
import { DocumentService } from '../application/DocumentService';
import { LearningService } from '../core/learning';

export function createLearningRoutes(
  learningService: SelfLearningService,
  documentService: DocumentService,
  learningServiceCore: LearningService
): express.Router {
  const router = express.Router();

  router.post('/chat/:chatId', async (req, res) => {
    try {
      const { chatId } = req.params;
      const { userId } = req.body;
      const result = await learningService.learnFromChat(userId, chatId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/document/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;
      const { userId } = req.body;
      const result = await learningService.learnFromDocument(userId, documentId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/upload', async (req, res) => {
    try {
      const { userId, name, content, type, tags } = req.body;
      const document = await documentService.uploadDocument(userId, name, content, type, tags);
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/documents/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const documents = await documentService.listDocuments(userId);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/document/:userId/:documentId', async (req, res) => {
    try {
      const { userId, documentId } = req.params;
      const document = await documentService.getDocument(userId, documentId);
      if (document) {
        res.json(document);
      } else {
        res.status(404).json({ error: 'Document not found' });
      }
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.delete('/document/:userId/:documentId', async (req, res) => {
    try {
      const { userId, documentId } = req.params;
      const success = await documentService.deleteDocument(userId, documentId);
      res.json({ success });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/search/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { query, limit } = req.query as { query?: string; limit?: string };
      const documents = await documentService.searchDocuments(userId, query || '', parseInt(limit || '10'));
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================================
  // 学习队列管理
  // ============================================================

  router.get('/queue', (_req, res) => {
    try {
      const queue = learningServiceCore.getQueue();
      res.json(queue);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/queue/stats', (_req, res) => {
    try {
      const stats = learningServiceCore.getQueueStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/queue/:id/priority', (req, res) => {
    try {
      const { id } = req.params;
      const { priority } = req.body;
      learningServiceCore.prioritize(id, priority);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/queue/:id/skip', (req, res) => {
    try {
      const { id } = req.params;
      learningServiceCore.skip(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/queue/batch-approve', (req, res) => {
    try {
      const { ids } = req.body as { ids: string[] };
      learningServiceCore.batchApprove(ids);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================================
  // 学习进度
  // ============================================================

  router.get('/progress', (_req, res) => {
    try {
      const progress = learningServiceCore.getLearningProgress();
      res.json(progress);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================================
  // 知识图谱
  // ============================================================

  router.get('/knowledge', (req, res) => {
    try {
      const { source } = req.query as { source?: string };
      const knowledge = learningServiceCore.getLearnedKnowledge(source ? { source } : undefined);
      res.json(knowledge);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================================
  // 洞察
  // ============================================================

  router.get('/insights', (req, res) => {
    try {
      const { limit } = req.query as { limit?: string };
      const insights = learningServiceCore.getRecentInsights(parseInt(limit || '10'));
      res.json(insights);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}