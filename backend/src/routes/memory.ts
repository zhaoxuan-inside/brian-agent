import { Router, Request, Response } from 'express';
import { memorySystem } from '../memory/memorySystem';

export function createMemoryRoutes(): Router {
  const router = Router();

  // Get all memories
  router.get('/', (_req: Request, res: Response) => {
    try {
      const memories = memorySystem.getAllMemories();
      const formatted = memories.map((m: any) => ({
        id: m.id,
        content: m.content,
        summary: m.summary || m.content.slice(0, 60),
        type: m.type || 'episodic',
        tags: m.tags || [],
        role: m.role || 'user',
        strength: m.strength,
        salienceScore: m.salienceScore,
        retrievalCount: m.retrievalCount,
        lastRetrieved: m.lastRetrieved,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));
      res.json({ ok: true, data: formatted });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Memory fetch error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Get all tags
  router.get('/tags', (_req: Request, res: Response) => {
    try {
      const tags = memorySystem.getAllTags();
      res.json({ ok: true, data: tags });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Tags fetch error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Get tag graph (nodes + edges for visualization)
  router.get('/tag-graph', (_req: Request, res: Response) => {
    try {
      const graph = memorySystem.getTagGraph();
      res.json({ ok: true, data: graph });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Tag graph error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Get memories by tag
  router.get('/by-tag/:tag', (req: Request, res: Response) => {
    try {
      const { tag } = req.params;
      const memories = memorySystem.getMemoriesByTag(tag);
      const formatted = memories.map((m: any) => ({
        id: m.id,
        content: m.content,
        summary: m.summary || m.content.slice(0, 60),
        type: m.type || 'episodic',
        tags: m.tags || [],
        role: m.role || 'user',
        strength: m.strength,
        salienceScore: m.salienceScore,
        retrievalCount: m.retrievalCount,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));
      res.json({ ok: true, data: formatted });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Memories by tag error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // Get memory groups (by tag) renamed to 标签组
  router.get('/groups', (_req: Request, res: Response) => {
    try {
      const tags = memorySystem.getAllTags();
      const graph = memorySystem.getTagGraph();
      const nodeDegreeMap = new Map(graph.nodes.map(n => [n.name, n.degree]));

      const groups = tags
        .map((tag) => ({
          name: tag,
          count: memorySystem.getMemoriesByTag(tag).length,
          degree: nodeDegreeMap.get(tag) || 0,
        }))
        .sort((a, b) => b.degree - a.degree);

      res.json({ ok: true, data: groups });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Groups fetch error:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}
