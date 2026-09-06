import type http from 'node:http';
import { NotFoundError, ValidationError } from '@brian-agent/base';
import type { HttpRouteRequest, RouteContext, RouteHandler } from '../types';
import { sendJson } from '../response';
import {
  FeedbackContext,
  SubmitFeedbackInput,
  SubmitFeedbackOutput,
  GetFeedbackInput,
  GetFeedbackOutput,
  ListFeedbackInput,
  ListFeedbackOutput,
  GetFeedbackStatsInput,
  GetFeedbackStatsOutput,
  UpdateFeedbackStatusInput,
  UpdateFeedbackStatusOutput,
} from '../../Application/Feedback/domain/types';

export const tryHandleFeedbackRoutes: RouteHandler = async (
  ctx: RouteContext,
  req: HttpRouteRequest,
  res: http.ServerResponse,
): Promise<boolean> => {
  const { method, pathname, params, body } = req;

  if (method === 'POST' && pathname === '/api/feedback') {
    try {
      const b = (body || {}) as Record<string, unknown>;
      const out = new SubmitFeedbackOutput();
      await ctx.feedbackAccess.submitFeedback(
        Object.assign(new SubmitFeedbackInput(), {
          msg_id: String(b.msg_id || b.messageId || ''),
          type: String(b.type || 'rating'),
          score: b.score !== undefined ? Number(b.score) : (b.rating !== undefined ? Number(b.rating) : undefined),
          comment: b.comment ? String(b.comment) : undefined,
          work_id: b.work_id ? String(b.work_id) : undefined,
          session_id: b.session_id ? String(b.session_id) : undefined,
        }),
        out,
        new FeedbackContext(),
      );
      sendJson(res, 200, { success: true, feedback: out.feedback });
    } catch (e: unknown) {
      const status = e instanceof ValidationError ? 400 : 500;
      sendJson(res, status, { error: e instanceof Error ? e.message : '提交反馈失败' });
    }
    return true;
  }

  if (method === 'GET' && pathname === '/api/feedback/list') {
    const out = new ListFeedbackOutput();
    await ctx.feedbackAccess.soFeedback(
      Object.assign(new ListFeedbackInput(), {
        status: params.get('status') || undefined,
        type: params.get('type') || undefined,
        msg_id: params.get('msg_id') || undefined,
        session_id: params.get('session_id') || undefined,
        page: params.get('page') ? Number(params.get('page')) : undefined,
        pageSize: params.get('pageSize') ? Number(params.get('pageSize')) : undefined,
      }),
      out,
      new FeedbackContext(),
    );
    sendJson(res, 200, { feedbacks: out.feedbacks, total: out.total });
    return true;
  }

  if (method === 'GET' && pathname === '/api/feedback/stats') {
    const out = new GetFeedbackStatsOutput();
    await ctx.feedbackAccess.soFeedbackStats(
      Object.assign(new GetFeedbackStatsInput(), {
        start_time: params.get('start') ? Number(params.get('start')) : undefined,
        end_time: params.get('end') ? Number(params.get('end')) : undefined,
      }),
      out,
      new FeedbackContext(),
    );
    sendJson(res, 200, out);
    return true;
  }

  if (method === 'GET' && pathname.startsWith('/api/feedback/') && pathname !== '/api/feedback/list' && pathname !== '/api/feedback/stats') {
    const id = pathname.split('/api/feedback/')[1];
    try {
      const out = new GetFeedbackOutput();
      await ctx.feedbackAccess.soFeedbackById(
        Object.assign(new GetFeedbackInput(), { id }),
        out,
        new FeedbackContext(),
      );
      sendJson(res, 200, { feedback: out.feedback });
    } catch (e: unknown) {
      const status = e instanceof NotFoundError ? 404 : (e instanceof ValidationError ? 400 : 500);
      sendJson(res, status, { error: e instanceof Error ? e.message : '查询反馈失败' });
    }
    return true;
  }

  if (method === 'PUT' && pathname.startsWith('/api/feedback/') && pathname.endsWith('/status')) {
    const id = pathname.split('/api/feedback/')[1].replace(/\/status$/, '');
    try {
      const out = new UpdateFeedbackStatusOutput();
      await ctx.feedbackAccess.updateFeedbackStatus(
        Object.assign(new UpdateFeedbackStatusInput(), {
          id,
          status: String((body as Record<string, unknown>).status || ''),
        }),
        out,
        new FeedbackContext(),
      );
      sendJson(res, 200, { feedback: out.feedback });
    } catch (e: unknown) {
      const status = e instanceof NotFoundError ? 404 : (e instanceof ValidationError ? 400 : 500);
      sendJson(res, status, { error: e instanceof Error ? e.message : '更新反馈状态失败' });
    }
    return true;
  }

  return false;
};
