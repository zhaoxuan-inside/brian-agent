import { Router, Request, Response } from 'express';
import { InformationService } from '../core/information';
import { logger } from '../infrastructure/logger';

export function createMemoryRoutes(information: InformationService): Router {
  const router = Router();

  /**
   * GET /api/memory - Retrieve memories
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const { query, maxResults, tag, start, end } = req.query;

      if (tag) {
        const memories = await information.retrieveByTag(tag as string);
        res.json({ memories, count: memories.length });
        return;
      }

      if (start && end) {
        const memories = await information.retrieveByTimeRange(
          Number(start),
          Number(end)
        );
        res.json({ memories, count: memories.length });
        return;
      }

      if (query) {
        const memories = await information.retrieve(
          query as string,
          maxResults ? Number(maxResults) : 10
        );
        res.json({ memories, count: memories.length });
        return;
      }

      // Return all memories
      const allNodes = await (information as any).storage?.graph?.getAllNodes?.() || [];
      const memories = allNodes
        .map((n: any) => {
          try {
            return JSON.parse(n.content || '{}');
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      res.json({ memories, count: memories.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MEMORY_ERROR' });
    }
  });

  /**
   * GET /api/memory/tags - Get all tags
   */
  router.get('/tags', async (_req: Request, res: Response) => {
    try {
      const nodeList = await (information as any).storage?.graph?.getAllNodes?.() || [];
      const tagSet = new Set<string>();

      for (const node of nodeList) {
        try {
          const item = JSON.parse(node.content || '{}');
          const tags = item.tags;
          if (tags) {
            for (const dim of ['domain', 'industry', 'concept', 'action'] as const) {
              if (tags[dim]) {
                for (const t of tags[dim]) {
                  tagSet.add(`${dim}:${t}`);
                }
              }
            }
          }
        } catch {
          // skip
        }
      }

      const tags = Array.from(tagSet).sort();
      res.json({ tags, count: tags.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'TAGS_ERROR' });
    }
  });

  /**
   * GET /api/memory/tag-graph - Get tag graph
   */
  router.get('/tag-graph', async (_req: Request, res: Response) => {
    try {
      const tagGraph = await information.buildTagGraph();
      res.json(tagGraph);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'TAG_GRAPH_ERROR' });
    }
  });

  /**
   * GET /api/memory/by-tag/:tag - Get memories by tag
   */
  router.get('/by-tag/:tag', async (req: Request, res: Response) => {
    try {
      const { tag } = req.params;
      const memories = await information.retrieveByTag(tag);
      res.json({ memories, count: memories.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MEMORY_ERROR' });
    }
  });

  /**
   * GET /api/memory/groups - Get memory groups
   */
  router.get('/groups', async (_req: Request, res: Response) => {
    try {
      const nodeList = await (information as any).storage?.graph?.getAllNodes?.() || [];
      const groups: Record<string, any[]> = {
        episodic: [],
        semantic: [],
        procedural: [],
      };

      for (const node of nodeList) {
        try {
          const item = JSON.parse(node.content || '{}');
          const type = item.type || node.metadata?.memoryType || 'unknown';
          if (groups[type]) {
            groups[type].push({ ...item, graphNodeId: node.id });
          }
        } catch {
          // skip
        }
      }

      res.json({
        groups,
        counts: {
          episodic: groups.episodic.length,
          semantic: groups.semantic.length,
          procedural: groups.procedural.length,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'GROUPS_ERROR' });
    }
  });

  /**
   * POST /api/memory/organize - Organize/consolidate memories
   */
  router.post('/organize', async (req: Request, res: Response) => {
    try {
      const { conversationId } = req.body;

      if (conversationId) {
        await information.consolidateWorking(conversationId);
      }

      await information.evolveTags();

      logger.info('Memory', 'Memories organized');
      res.json({ success: true, message: 'Memories organized successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'ORGANIZE_ERROR' });
    }
  });

  /**
   * DELETE /api/memory/:id - Delete a memory
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await (information as any).storage?.graph?.deleteNode?.(id);
      logger.info('Memory', `Memory deleted: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'DELETE_ERROR' });
    }
  });

  /**
   * POST /api/memory/pin/:id - Pin/unpin a memory
   */
  router.post('/pin/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { pinned } = req.body;

      if (pinned) {
        information.pinMemory(id);
      } else {
        information.unpinMemory(id);
      }

      logger.info('Memory', `Memory ${pinned ? 'pinned' : 'unpinned'}: ${id}`);
      res.json({ success: true, pinned });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'PIN_ERROR' });
    }
  });

  return router;
}