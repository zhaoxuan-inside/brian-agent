import express from 'express';
import { LLMService } from '../core/llm/LLMService';
import { InformationService } from '../core/information/InformationService';
import { DBWrapper } from '../base/DBWrapper';

export function createAnalyticsRoutes(
  llmService: LLMService,
  informationService: InformationService,
  db: DBWrapper,
): express.Router {
  const router = express.Router();

  router.get('/token-usage', async (req, res) => {
    try {
      const stats = await llmService.getTokenStatsAsync();

      // Add avgLatency from call_history
      const latencyRows = await db.query<{ avg_latency: number }>(
        `SELECT AVG(latency_ms) as avg_latency FROM call_history WHERE success = 1`,
      );
      const avgLatency = latencyRows[0]?.avg_latency ?? 0;

      res.json({ ...stats, avgLatency: Math.round(avgLatency) });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/token-usage/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const stats = llmService.getUserTokenStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/memory-stats', async (req, res) => {
    try {
      const { userId } = req.query as { userId: string };
      const stats = await informationService.getMemoryStats(userId || '');
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/message-stats', async (req, res) => {
    try {
      const { userId, startDate, endDate } = req.query as {
        userId?: string;
        startDate?: string;
        endDate?: string;
      };
      const stats = await informationService.getMessageStats(userId, startDate, endDate);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/summary', async (req, res) => {
    try {
      const tokenStats = await llmService.getTokenStatsAsync();
      const memoryStats = await informationService.getMemoryStats('');

      // Memory node count
      const nodeCountRows = await db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM memory_nodes`,
      );
      const memoryNodeCount = nodeCountRows[0]?.cnt ?? 0;

      // Session count (distinct session_id from user_messages)
      const sessionRows = await db.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT session_id) as cnt FROM user_messages`,
      );
      const sessionCount = sessionRows[0]?.cnt ?? 0;

      res.json({
        tokenUsage: tokenStats,
        memoryStats,
        memoryNodeCount,
        sessionCount,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // --- New endpoints for monitor page ---

  // GET /ring - Today/week/month token usage ring chart data
  router.get('/ring', async (req, res) => {
    try {
      const now = Math.floor(Date.now() / 1000);

      const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const weekStart = now - 7 * 24 * 60 * 60;
      const monthStart = now - 30 * 24 * 60 * 60;

      const todayRows = await db.query<{ total: number }>(
        `SELECT COALESCE(SUM(tokens), 0) as total FROM call_history WHERE timestamp >= ? AND success = 1`,
        [todayStart],
      );
      const weekRows = await db.query<{ total: number }>(
        `SELECT COALESCE(SUM(tokens), 0) as total FROM call_history WHERE timestamp >= ? AND success = 1`,
        [weekStart],
      );
      const monthRows = await db.query<{ total: number }>(
        `SELECT COALESCE(SUM(tokens), 0) as total FROM call_history WHERE timestamp >= ? AND success = 1`,
        [monthStart],
      );

      // Default limits; can be overridden via config or env in the future
      const dailyLimit = 100000;
      const weeklyLimit = 500000;
      const monthlyLimit = 2000000;

      res.json({
        today: { used: todayRows[0]?.total ?? 0, limit: dailyLimit },
        week: { used: weekRows[0]?.total ?? 0, limit: weeklyLimit },
        month: { used: monthRows[0]?.total ?? 0, limit: monthlyLimit },
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // GET /contribution - Contribution matrix (GitHub-style heatmap)
  router.get('/contribution', async (req, res) => {
    try {
      const { year, modelId } = req.query as { year?: string; modelId?: string };

      const targetYear = year ? parseInt(year) : new Date().getFullYear();
      const yearStart = Math.floor(new Date(targetYear, 0, 1).getTime() / 1000);
      const yearEnd = Math.floor(new Date(targetYear + 1, 0, 1).getTime() / 1000);

      let sql = `SELECT DATE(timestamp, 'unixepoch') as date, SUM(tokens) as count
        FROM call_history
        WHERE timestamp >= ? AND timestamp < ? AND success = 1`;
      const params: (number | string)[] = [yearStart, yearEnd];

      if (modelId) {
        sql += ` AND model_id = ?`;
        params.push(modelId);
      }
      sql += ` GROUP BY date ORDER BY date ASC`;

      const rows = await db.query<{ date: string; count: number }>(sql, params);

      res.json(rows.map((r) => ({ date: r.date, count: r.count })));
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // GET /vector-db - Vector DB status
  router.get('/vector-db', async (req, res) => {
    try {
      const startTime = Date.now();

      const rows = await db.query<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM vector_embeddings`,
      );

      const latency = Date.now() - startTime;
      const hasData = (rows[0]?.cnt ?? 0) > 0;

      res.json({
        status: 'connected' as const,
        type: 'SQLite',
        latency,
      });
    } catch (error) {
      res.json({
        status: 'disconnected' as const,
        type: 'SQLite',
        latency: 0,
      });
    }
  });

  // GET /per-model - Per-model statistics
  router.get('/per-model', async (req, res) => {
    try {
      const rows = await db.query<{
        model_id: string;
        calls: number;
        tokens: number;
        avg_latency: number;
      }>(
        `SELECT model_id,
          COUNT(*) as calls,
          COALESCE(SUM(tokens), 0) as tokens,
          COALESCE(AVG(latency_ms), 0) as avg_latency
        FROM call_history
        WHERE success = 1
        GROUP BY model_id`,
      );

      const models = rows.map((r) => ({
        modelId: r.model_id,
        modelName: r.model_id,
        calls: r.calls,
        tokens: r.tokens,
        avgTTFT: Math.round(r.avg_latency),
      }));

      res.json({ models });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}