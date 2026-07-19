import express from 'express';
import { z } from 'zod';
import { DBWrapper } from '../base/DBWrapper';

const FeedbackInputSchema = z.object({
  userId: z.string(),
  messageId: z.string(),
  conversationId: z.string().optional(),
  rating: z.enum(['positive', 'negative', 'neutral']),
  comment: z.string().optional(),
  tags: z.array(z.string()).optional(),
  errorInfo: z.string().optional(),
  logTraceId: z.string().optional(),
});

export function createFeedbackRoutes(db: DBWrapper): express.Router {
  const router = express.Router();

  router.post('/', async (req, res) => {
    try {
      const input = FeedbackInputSchema.parse(req.body);
      const id = `fb:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const now = Math.floor(Date.now() / 1000);

      const ratingMap: Record<string, string> = {
        positive: 'good',
        negative: 'bad',
        neutral: 'neutral',
      };

      await db.run(
        `INSERT INTO feedback (id, message_id, conversation_id, user_id, rating, reason, error_info, log_trace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.messageId,
          input.conversationId || '',
          input.userId,
          ratingMap[input.rating] || 'neutral',
          input.comment || null,
          input.errorInfo || null,
          input.logTraceId || null,
          now,
          now,
        ]
      );

      res.json({ success: true, id });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const { userId, messageId, status } = req.query as {
        userId?: string;
        messageId?: string;
        status?: string;
      };

      let sql = 'SELECT * FROM feedback WHERE 1=1';
      const params: any[] = [];

      if (userId) {
        sql += ' AND user_id = ?';
        params.push(userId);
      }
      if (messageId) {
        sql += ' AND message_id = ?';
        params.push(messageId);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }

      sql += ' ORDER BY created_at DESC LIMIT 100';

      const rows = await db.query<any>(sql, params);
      const feedbacks = rows.map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        messageId: r.message_id,
        conversationId: r.conversation_id,
        rating: r.rating === 'good' ? 'positive' : r.rating === 'bad' ? 'negative' : 'neutral',
        comment: r.reason,
        status: r.status,
        createdAt: r.created_at,
      }));

      res.json(feedbacks);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/stats', async (req, res) => {
    try {
      const rows = await db.query<any>(
        'SELECT rating, COUNT(*) as count FROM feedback GROUP BY rating'
      );

      const stats: Record<string, number> = { total: 0, positive: 0, negative: 0, neutral: 0 };
      for (const row of rows) {
        stats.total += row.count;
        if (row.rating === 'good') stats.positive = row.count;
        if (row.rating === 'bad') stats.negative = row.count;
        if (row.rating === 'neutral') stats.neutral = row.count;
      }

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const row = await db.get<any>('SELECT * FROM feedback WHERE id = ?', [req.params.id]);
      if (!row) {
        res.status(404).json({ error: 'Feedback not found' });
        return;
      }

      res.json({
        id: row.id,
        userId: row.user_id,
        messageId: row.message_id,
        conversationId: row.conversation_id,
        rating: row.rating === 'good' ? 'positive' : row.rating === 'bad' ? 'negative' : 'neutral',
        comment: row.reason,
        status: row.status,
        createdAt: row.created_at,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/:id/status', async (req, res) => {
    try {
      const { status } = req.body as { status: string };
      if (!['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      await db.run(
        'UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?',
        [status, Math.floor(Date.now() / 1000), req.params.id]
      );

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}