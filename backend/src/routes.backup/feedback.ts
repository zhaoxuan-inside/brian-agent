import { Router, Request, Response } from 'express';
import { FeedbackService } from '../core/feedback';
import { logger } from '../infrastructure/logger';

export function createFeedbackRoutes(feedback: FeedbackService): Router {
  const router = Router();

  /**
   * POST /api/feedback - Submit feedback
   */
  router.post('/', (req: Request, res: Response) => {
    try {
      const { messageId, conversationId, userId, rating, reason, errorInfo, includeContext, logTraceId } = req.body;

      if (!messageId || !conversationId || !userId || !rating) {
        res.status(400).json({
          error: 'messageId, conversationId, userId, and rating are required',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const validRatings = ['good', 'neutral', 'bad'];
      if (!validRatings.includes(rating)) {
        res.status(400).json({
          error: `Rating must be one of: ${validRatings.join(', ')}`,
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const result = feedback.submitFeedback({
        messageId,
        conversationId,
        userId,
        rating,
        reason,
        errorInfo,
        includeContext: includeContext ?? true,
        logTraceId,
      });

      logger.info('Feedback', `Feedback submitted: ${result.id} (${rating})`);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'FEEDBACK_CREATE_ERROR' });
    }
  });

  /**
   * GET /api/feedback/list - List feedback with filters
   */
  router.get('/list', (req: Request, res: Response) => {
    try {
      const { status, rating, start, end } = req.query;
      const filters: any = {};

      if (status) filters.status = status;
      if (rating) filters.rating = rating;
      if (start) filters.start = Number(start);
      if (end) filters.end = Number(end);

      const feedbacks = feedback.listFeedback(filters);
      res.json({ feedbacks, count: feedbacks.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'FEEDBACK_LIST_ERROR' });
    }
  });

  /**
   * GET /api/feedback/stats - Get feedback statistics
   */
  router.get('/stats', (req: Request, res: Response) => {
    try {
      const { start, end } = req.query;
      const timeRange = (start && end)
        ? { start: Number(start), end: Number(end) }
        : undefined;

      const analysis = feedback.analyze();
      const distribution = feedback.getRatingDistribution(timeRange);
      const trend = feedback.getTrend(timeRange);

      res.json({
        analysis,
        distribution,
        trend,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'FEEDBACK_STATS_ERROR' });
    }
  });

  /**
   * GET /api/feedback/:id - Get feedback by ID
   */
  router.get('/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const fb = feedback.getFeedback(id);
      if (!fb) {
        res.status(404).json({ error: 'Feedback not found', code: 'NOT_FOUND' });
        return;
      }
      res.json(fb);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'FEEDBACK_GET_ERROR' });
    }
  });

  /**
   * PUT /api/feedback/:id/status - Update feedback status
   */
  router.put('/:id/status', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const validStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          error: `Status must be one of: ${validStatuses.join(', ')}`,
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      feedback.updateStatus(id, status);
      logger.info('Feedback', `Feedback status updated: ${id} -> ${status}`);
      res.json({ success: true, status });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'FEEDBACK_UPDATE_ERROR' });
    }
  });

  return router;
}