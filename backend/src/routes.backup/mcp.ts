import { Router, Request, Response } from 'express';
import { ToolService } from '../core/tools';
import { logger } from '../infrastructure/logger';

export function createMCPRoutes(tools: ToolService): Router {
  const router = Router();

  /**
   * GET /api/mcp/market - Get MCP marketplace
   */
  router.get('/market', async (req: Request, res: Response) => {
    try {
      const { search, category } = req.query;
      const packages = await tools.getMcpMarket(
        search as string | undefined,
        category as string | undefined
      );
      res.json({ packages, count: packages.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_MARKET_ERROR' });
    }
  });

  /**
   * POST /api/mcp/market/sync - Sync MCP marketplace
   */
  router.post('/market/sync', async (_req: Request, res: Response) => {
    try {
      await tools.syncMcpMarket();
      logger.info('MCP', 'MCP marketplace synced');
      res.json({ success: true, message: 'Marketplace synced' });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_SYNC_ERROR' });
    }
  });

  /**
   * GET /api/mcp/market/:id - Get MCP package detail
   */
  router.get('/market/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const pkg = await tools.getMcpDetail(id);
      if (!pkg) {
        res.status(404).json({ error: 'MCP package not found', code: 'NOT_FOUND' });
        return;
      }
      res.json(pkg);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_DETAIL_ERROR' });
    }
  });

  /**
   * POST /api/mcp/market/:id - Install an MCP package
   */
  router.post('/market/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const pkg = await tools.getMcpDetail(id);
      if (!pkg) {
        res.status(404).json({ error: 'MCP package not found', code: 'NOT_FOUND' });
        return;
      }

      const result = await tools.installMcp(pkg.packageName, pkg.displayName, undefined, pkg.repository);
      logger.info('MCP', `MCP installed: ${pkg.packageName}`);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_INSTALL_ERROR' });
    }
  });

  /**
   * DELETE /api/mcp/market/:id - Uninstall an MCP package
   */
  router.delete('/market/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await tools.uninstallMcp(id);
      logger.info('MCP', `MCP uninstalled: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_UNINSTALL_ERROR' });
    }
  });

  /**
   * GET /api/mcp/installed - Get installed MCP packages
   */
  router.get('/installed', (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const result = tools.listMcpInstalled(page, pageSize);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_INSTALLED_ERROR' });
    }
  });

  return router;
}