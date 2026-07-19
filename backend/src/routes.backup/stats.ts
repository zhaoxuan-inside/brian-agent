import { Router, Request, Response } from 'express';
import { LLMService } from '../core/llm';
import { ModelConfigService } from '../core/llm/modelConfig';
import { getDatabase } from '../infrastructure/database';
import { getConfig } from '../infrastructure/config';
import { TimeSeriesStorage } from '../core/storage/timeseries';

export function createStatsRoutes(llm: LLMService): Router {
  const router = Router();

  /**
   * GET /api/stats - System statistics
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const configService = new ModelConfigService();
      const config = configService.getConfig();

      // System stats
      const memoryUsage = process.memoryUsage();
      const uptime = process.uptime();

      const os = require('os');
      
      let cpuUsage = 0;
      try {
        const cpus = os.cpus();
        const totalIdle = cpus.reduce((sum: number, cpu: any) => sum + cpu.times.idle, 0);
        const totalTick = cpus.reduce((sum: number, cpu: any) => sum + (Object.values(cpu.times) as number[]).reduce((a: number, b: number) => a + b, 0), 0);
        cpuUsage = Math.round((1 - totalIdle / totalTick) * 10000) / 100;
      } catch {
        cpuUsage = 0;
      }

      const systemMemoryTotal = Math.round(os.totalmem() / 1024 / 1024);
      const systemMemoryFree = Math.round(os.freemem() / 1024 / 1024);
      const systemMemoryUsed = systemMemoryTotal - systemMemoryFree;
      const systemMemoryPercentage = Math.round(systemMemoryUsed / systemMemoryTotal * 10000) / 100;

      let diskUsage = { total: 0, used: 0, percentage: 0 };
      try {
        const fs = require('fs').promises;
        const homedir = require('os').homedir();
        const stats = await fs.statfs(homedir);
        const blockSize = stats.bsize;
        const totalBlocks = stats.blocks;
        const availableBlocks = stats.bavail;
        diskUsage.total = Math.round(totalBlocks * blockSize / 1024 / 1024);
        diskUsage.used = Math.round((totalBlocks - availableBlocks) * blockSize / 1024 / 1024);
        diskUsage.percentage = diskUsage.total > 0 ? Math.round(diskUsage.used / diskUsage.total * 10000) / 100 : 0;
      } catch {
        diskUsage = { total: 0, used: 0, percentage: 0 };
      }

      const systemStats = {
        uptime: Math.round(uptime),
        cpu: cpuUsage,
        memory: {
          total: systemMemoryTotal,
          used: systemMemoryUsed,
          percentage: systemMemoryPercentage,
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
          rss: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
        },
        disk: diskUsage,
        nodeVersion: process.version,
        platform: process.platform,
      };

      // Model stats
      const registeredModels = llm.registry.listAll();
      const modelStats = registeredModels.map(m => ({
        id: m.id,
        providerId: m.providerId,
        modelName: m.modelName,
        displayName: m.displayName,
        status: m.status,
        stats: m.stats,
        quota: {
          used: m.quota.used,
          daily: m.quota.daily,
          weekly: m.quota.weekly,
          monthly: m.quota.monthly,
        },
      }));

      // Token matrix (calendar format)
      const tokenYear = parseInt(_req.query.tokenYear as string) || new Date().getFullYear();
      const latencyYear = parseInt(_req.query.latencyYear as string) || new Date().getFullYear();
      
      const timeSeries = new TimeSeriesStorage();
      
      const generateCalendarMatrix = (year: number, isToken: boolean): Array<{ date: string; tokens: number; calls: number; avgLatency: number }> => {
        const matrix: Array<{ date: string; tokens: number; calls: number; avgLatency: number }> = [];
        for (let month = 0; month < 12; month++) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayStart = new Date(dateStr).getTime();
            const dayEnd = dayStart + 24 * 60 * 60 * 1000;
            
            let tokens = 0;
            let calls = 0;
            let avgLatency = 0;
            
            try {
              if (isToken) {
                tokens = timeSeries.aggregate('llm_tokens', 'sum', dayStart, dayEnd);
                calls = timeSeries.aggregate('llm_calls', 'count', dayStart, dayEnd);
              } else {
                avgLatency = timeSeries.aggregate('llm_latency', 'avg', dayStart, dayEnd);
              }
            } catch {
              // Ignore errors - no data means 0
            }
            
            matrix.push({
              date: dateStr,
              tokens: isToken ? tokens : 0,
              calls: isToken ? calls : 0,
              avgLatency: isToken ? 0 : avgLatency,
            });
          }
        }
        return matrix;
      };

      const tokenMatrix = generateCalendarMatrix(tokenYear, true);
      const latencyMatrix = generateCalendarMatrix(latencyYear, false);

      // Rate limits
      const totalTokens = registeredModels.reduce((sum, m) => sum + m.stats.totalTokens, 0);
      const totalCalls = registeredModels.reduce((sum, m) => sum + m.stats.totalCalls, 0);
      const avgLatency = registeredModels.length > 0
        ? Math.round(registeredModels.reduce((sum, m) => sum + m.stats.avgLatency, 0) / registeredModels.length)
        : 0;
      
      const rateLimits = {
        daily: config.rateLimits?.daily || 100000,
        weekly: config.rateLimits?.weekly || 500000,
        monthly: config.rateLimits?.monthly || 2000000,
        used: totalTokens,
        dailyRemaining: Math.max(0, (config.rateLimits?.daily || 100000) - totalTokens),
        weeklyRemaining: Math.max(0, (config.rateLimits?.weekly || 500000) - totalTokens),
        monthlyRemaining: Math.max(0, (config.rateLimits?.monthly || 2000000) - totalTokens),
      };

      // Storage status
      let memoryNodeCount = 0;
      let conversationCount = 0;
      try {
        const mnResult = db.prepare('SELECT COUNT(*) as count FROM memory_nodes').get() as any;
        memoryNodeCount = mnResult?.count || 0;
        const convResult = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as any;
        conversationCount = convResult?.count || 0;
      } catch {
        // Tables may not exist yet
      }

      const graphDbType = process.env.BRIAN_USE_SQLITE_GRAPH === 'true' ? 'SQLite' : 
                          process.env.BRIAN_USE_MEMORY_GRAPH === 'true' ? 'Memory' : 'TinyGraphDB';

      const storageStatus = {
        memoryNodes: memoryNodeCount,
        conversations: conversationCount,
        relationalDb: {
          type: 'SQLite',
          path: getConfig().dbPath,
          status: 'active',
        },
        vectorDb: {
          type: 'Local File System',
          path: getConfig().vectorDbPath,
          status: 'active',
        },
        graphDb: {
          type: graphDbType,
          path: getConfig().graphDbPath,
          status: 'active',
        },
      };

      res.json({
        system: systemStats,
        models: modelStats,
        tokenMatrix,
        latencyMatrix,
        rateLimits,
        storage: storageStatus,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'STATS_ERROR' });
    }
  });

  return router;
}