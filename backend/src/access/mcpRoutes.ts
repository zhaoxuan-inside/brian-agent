import express from 'express';
import { ToolService } from '../core/tools';
import { MCPManager } from '../core/mcp/MCPManager';
import { logger } from '../infrastructure/logger';
import { createToggleHandler } from './toggleHandler';

export function createMCPRoutes(toolService: ToolService, mcpManager: MCPManager): express.Router {
  const router = express.Router();

  router.get('/market', async (req, res) => {
    try {
      const { search, category } = req.query;
      const packages = await toolService.getMcpMarket(
        search as string | undefined,
        category as string | undefined
      );
      res.json({ packages, count: packages.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_MARKET_ERROR' });
    }
  });

  router.post('/market/sync', async (_req, res) => {
    try {
      await toolService.syncMcpMarket();
      logger.info('MCP', 'MCP marketplace synced');
      res.json({ success: true, message: 'Marketplace synced' });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_SYNC_ERROR' });
    }
  });

  router.get('/market/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const pkg = await toolService.getMcpDetail(id);
      if (!pkg) {
        res.status(404).json({ error: 'MCP package not found', code: 'NOT_FOUND' });
        return;
      }
      res.json(pkg);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_DETAIL_ERROR' });
    }
  });

  router.post('/market/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const pkg = await toolService.getMcpDetail(id);
      if (!pkg) {
        res.status(404).json({ error: 'MCP package not found', code: 'NOT_FOUND' });
        return;
      }
      const result = await toolService.installMcp(pkg.packageName, pkg.displayName, undefined, pkg.repository);
      if (result.success) {
        logger.info('MCP', `MCP installed: ${pkg.packageName}`);
        res.status(201).json(result);
      } else {
        logger.error('MCP', `MCP install failed: ${pkg.packageName}, error: ${result.error}`);
        res.status(500).json({ error: result.error || 'Installation failed', code: 'MCP_INSTALL_ERROR' });
      }
    } catch (err: any) {
      logger.error('MCP', `MCP install error: ${err.message}`);
      res.status(500).json({ error: err.message, code: 'MCP_INSTALL_ERROR' });
    }
  });

  router.delete('/market/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await toolService.uninstallMcp(id);
      logger.info('MCP', `MCP uninstalled: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_UNINSTALL_ERROR' });
    }
  });

  router.get('/installed', (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const result = toolService.listMcpInstalled(page, pageSize);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MCP_INSTALLED_ERROR' });
    }
  });

  router.post('/:id/toggle', createToggleHandler(
    (id) => mcpManager.getMCP(id),
    (id, data) => mcpManager.updateMCP(id, data),
    'MCP',
    'MCP_TOGGLE_ERROR',
  ));

  // ── MCP Market management ──

  router.get('/markets', (_req, res) => {
    try {
      const markets = toolService.listMarkets();
      res.json({ markets, count: markets.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MARKET_LIST_ERROR' });
    }
  });

  router.post('/markets', (req, res) => {
    try {
      const { name, url, description } = req.body;
      if (!name || !url) {
        res.status(400).json({ error: 'name and url are required', code: 'VALIDATION_ERROR' });
        return;
      }
      const market = toolService.addMarket(name, url, description || '');
      res.status(201).json(market);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MARKET_CREATE_ERROR' });
    }
  });

  router.delete('/markets/:id', (req, res) => {
    try {
      const { id } = req.params;
      toolService.deleteMarket(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'MARKET_DELETE_ERROR' });
    }
  });

  // ── Hot MCP ──

  router.get('/hot', async (_req, res) => {
    try {
      const hotMcps = await toolService.fetchHotMcps();
      res.json({ code: 200, msg: '获取成功', data: hotMcps });
    } catch (err: any) {
      res.json({ code: 500, msg: '获取失败', content: err.message });
    }
  });

  // ── Market MCP list (paginated) ──

  router.get('/market/:marketId/mcps', async (req, res) => {
    try {
      const { marketId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const search = req.query.search as string | undefined;
      const result = await toolService.getMarketMcps(marketId, page, pageSize, search);
      res.json({ code: 200, msg: '获取成功', data: result });
    } catch (err: any) {
      res.json({ code: 500, msg: '获取失败', content: err.message });
    }
  });

  // ── Install MCP from market ──

  router.post('/market/:marketId/install', async (req, res) => {
    try {
      const { marketId } = req.params;
      const { packageName, displayName, repository } = req.body;
      if (!packageName) {
        res.json({ code: 400, msg: '参数错误', content: 'packageName is required' });
        return;
      }
      const result = await toolService.installMcpFromMarket(marketId, packageName, displayName, repository);
      res.json(result);
    } catch (err: any) {
      res.json({ code: 500, msg: '安装失败', content: err.message });
    }
  });

  return router;
}