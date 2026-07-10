import { Router, Request, Response } from 'express';
import { ModelConfigService, AppConfig } from '../services/modelConfig';

export function createConfigRoutes(configService: ModelConfigService): Router {
  const router = Router();

  // GET /api/config - get full config
  router.get('/', (_req: Request, res: Response) => {
    try {
      const cfg = configService.getConfig();
      res.json({ ok: true, data: cfg });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // PUT /api/config - save full config
  router.put('/', (req: Request, res: Response) => {
    try {
      const cfg = configService.saveConfig(req.body as AppConfig);
      res.json({ ok: true, data: cfg });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // PUT /api/config/provider/:id - update a provider
  router.put('/provider/:id', (req: Request, res: Response) => {
    try {
      const updated = configService.updateProvider(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Provider not found' });
      }
      res.json({ ok: true, data: updated });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // POST /api/config/verify/:providerId - test connection
  router.post('/verify/:providerId', async (req: Request, res: Response) => {
    try {
      const result = await configService.verifyProvider(req.params.providerId);
      res.json(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, message: msg });
    }
  });

  // POST /api/config/reset - reset to defaults
  router.post('/reset', (_req: Request, res: Response) => {
    try {
      const cfg = configService.resetToDefaults();
      res.json({ ok: true, data: cfg });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  // POST /api/config/migrate - migrate data directory
  router.post('/migrate', async (req: Request, res: Response) => {
    try {
      const { oldPath, newPath, type } = req.body
      if (!oldPath || !newPath) {
        return res.status(400).json({ ok: false, error: 'oldPath and newPath are required' })
      }
      // Validate paths to prevent directory traversal
      if (oldPath.includes('..') || newPath.includes('..')) {
        return res.status(400).json({ ok: false, error: 'Invalid path' })
      }
      // If old path exists, the caller handles the actual file move
      // For now, just acknowledge the migration request
      res.json({ ok: true, message: `Migration from ${oldPath} to ${newPath} acknowledged`, type })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      res.status(500).json({ ok: false, error: msg })
    }
  })

  // GET /api/config/quota/:providerId - fetch quota from provider
  router.get('/quota/:providerId', async (req: Request, res: Response) => {
    try {
      const quota = await configService.fetchQuota(req.params.providerId);
      res.json({ ok: true, quota });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}
