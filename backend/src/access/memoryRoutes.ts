import express from 'express';
import { InformationService } from '../core/information/InformationService';
import { logger } from '../infrastructure/logger';

export function createMemoryRoutes(informationService: InformationService): express.Router {
  const router = express.Router();

  // Map backend MemoryNode (single or array) to frontend-compatible format
  function toMemoryItem(m: any): any {
    if (Array.isArray(m)) {
      return m.map(toMemoryItem);
    }
    return {
      ...m,
      role: m.role || m.source || 'system',
      summary: m.summary || (m.content ? m.content.slice(0, 100) : ''),
    };
  }

  // ============================================================
  // 记忆查询接口（只读，记忆由系统自动生成）
  // ============================================================
  router.get('/single/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info('MemoryRoutes', `[GET /single/:id] id=${id}`);
      const memory = await informationService.getMemory(id);
      if (!memory) {
        logger.warn('MemoryRoutes', `[GET /single/:id] memory not found: ${id}`);
        return res.status(404).json({ error: 'Memory not found' });
      }
      res.json(toMemoryItem(memory));
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /single/:id] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/stats/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      logger.info('MemoryRoutes', `[GET /stats/:userId] userId=${userId}`);
      const stats = await informationService.getMemoryStats(userId);
      logger.info('MemoryRoutes', `[GET /stats/:userId] returned stats`);
      res.json(stats);
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /stats/:userId] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/working/:userId/:chatId', async (req, res) => {
    try {
      const { userId, chatId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      logger.info('MemoryRoutes', `[GET /working] userId=${userId} chatId=${chatId} limit=${limit}`);
      const memory = await informationService.getWorkingMemory(userId, chatId, limit);
      logger.info('MemoryRoutes', `[GET /working] returned ${memory.length} items`);
      res.json(toMemoryItem(memory));
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /working] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/semantic/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const query = req.query.query as string;
      const limit = parseInt(req.query.limit as string) || 10;
      logger.info('MemoryRoutes', `[GET /semantic] userId=${userId} query=${query || 'none'} limit=${limit}`);
      const memory = await informationService.getSemanticMemory(userId, query, limit);
      res.json(toMemoryItem(memory));
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /semantic] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/episodic/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      logger.info('MemoryRoutes', `[GET /episodic] userId=${userId} limit=${limit}`);
      const memory = await informationService.getEpisodicMemory(userId, limit);
      res.json(toMemoryItem(memory));
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /episodic] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/procedural/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;
      logger.info('MemoryRoutes', `[GET /procedural] userId=${userId} limit=${limit}`);
      const memory = await informationService.getProceduralMemory(userId, limit);
      res.json(toMemoryItem(memory));
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /procedural] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/tag/:userId/:tag', async (req, res) => {
    try {
      const { userId, tag } = req.params;
      logger.info('MemoryRoutes', `[GET /tag] userId=${userId} tag=${tag}`);
      const memory = await informationService.getMemoryByTag(userId, tag);
      res.json(toMemoryItem(memory));
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /tag] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/ratio/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      logger.info('MemoryRoutes', `[GET /ratio] userId=${userId}`);
      const ratios = await informationService.getMemoryRatios(userId);
      res.json(ratios);
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /ratio] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/ratio/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const ratios = req.body;
      logger.info('MemoryRoutes', `[PUT /ratio] userId=${userId}`);
      await informationService.updateMemoryRatios(userId, ratios);
      res.json({ success: true });
    } catch (error) {
      logger.error('MemoryRoutes', `[PUT /ratio] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 按关键词搜索记忆
  router.get('/search/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const query = req.query.query as string;
      const type = req.query.type as any;
      const limit = parseInt(req.query.limit as string) || 20;
      const includeLearning = req.query.includeLearning === 'true';
      logger.info('MemoryRoutes', `[GET /search] userId=${userId} query=${query} type=${type || 'all'} limit=${limit} includeLearning=${includeLearning}`);
      const memories = await informationService.searchMemories(userId, query, type, limit, includeLearning);
      res.json(memories);
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /search] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ============================================================
  // 记忆聚合接口（放在 /:userId 之前，避免被匹配为 userId）
  // ============================================================

  router.get('/', async (_req, res) => {
    try {
      logger.info('MemoryRoutes', '[GET /] fetching all memory');
      const memories = await informationService.getAllMemory('default-user');
      logger.info('MemoryRoutes', `[GET /] returned ${memories.length} memories`);
      res.json({ memories: memories.map(toMemoryItem) });
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/tags', async (_req, res) => {
    try {
      logger.info('MemoryRoutes', '[GET /tags]');
      const memories = await informationService.getAllMemory('default-user');
      const tagSet = new Set<string>();
      for (const m of memories) {
        if (m.tags) {
          for (const t of m.tags) {
            tagSet.add(t);
          }
        }
      }
      logger.info('MemoryRoutes', `[GET /tags] returned ${tagSet.size} tags`);
      res.json({ tags: Array.from(tagSet) });
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /tags] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/groups', async (_req, res) => {
    try {
      logger.info('MemoryRoutes', '[GET /groups]');
      const memories = await informationService.getAllMemory('default-user');
      const groups: Record<string, unknown[]> = {};
      for (const m of memories) {
        const type = m.type || 'other';
        if (!groups[type]) groups[type] = [];
        groups[type].push(m);
      }
      logger.info('MemoryRoutes', `[GET /groups] returned ${Object.keys(groups).length} groups`);
      res.json({ groups });
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /groups] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/tag-graph', async (_req, res) => {
    try {
      logger.info('MemoryRoutes', '[GET /tag-graph]');
      const memories = await informationService.getAllMemory('default-user');
      const nodeMap = new Map<string, { id: string; name: string; weight: number; degree: number }>();
      const edgeSet = new Set<string>();
      const edges: { source: string; target: string; weight: number }[] = [];

      for (const m of memories) {
        if (!m.tags || m.tags.length < 1) continue;
        for (const t of m.tags) {
          if (!nodeMap.has(t)) {
            nodeMap.set(t, { id: t, name: t, weight: 0, degree: 0 });
          }
          nodeMap.get(t)!.weight += 1;
        }
        for (let i = 0; i < m.tags.length; i++) {
          for (let j = i + 1; j < m.tags.length; j++) {
            const key = [m.tags[i], m.tags[j]].sort().join('|');
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
              edges.push({ source: m.tags[i], target: m.tags[j], weight: 1 });
              nodeMap.get(m.tags[i])!.degree += 1;
              nodeMap.get(m.tags[j])!.degree += 1;
            }
          }
        }
      }
      logger.info('MemoryRoutes', `[GET /tag-graph] returned ${nodeMap.size} nodes, ${edges.length} edges`);
      res.json({ nodes: Array.from(nodeMap.values()), edges });
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /tag-graph] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // 获取用户所有记忆（放在最后，避免匹配其他路由）
  router.get('/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      logger.info('MemoryRoutes', `[GET /:userId] userId=${userId}`);
      const allMemory = await informationService.getAllMemory(userId);
      logger.info('MemoryRoutes', `[GET /:userId] returned ${allMemory.length} memories`);
      res.json(allMemory.map(toMemoryItem));
    } catch (error) {
      logger.error('MemoryRoutes', `[GET /:userId] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
