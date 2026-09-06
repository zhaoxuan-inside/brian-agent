import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationError, NotFoundError } from '@brian-agent/base';
import { FeedbackService } from '../Feedback/application/FeedbackService';
import { FeedbackSchemaInitializer } from '../Feedback/infrastructure/FeedbackSchemaInitializer';
import {
  FeedbackContext,
  SubmitFeedbackInput, SubmitFeedbackOutput,
  GetFeedbackInput, GetFeedbackOutput,
  ListFeedbackInput, ListFeedbackOutput,
  GetFeedbackStatsInput, GetFeedbackStatsOutput,
  UpdateFeedbackStatusInput, UpdateFeedbackStatusOutput,
} from '../Feedback/domain/types';
import { setupRealTestEnvironment, cleanupTempDirs } from './real-test-helpers';
import type { RealTestContext } from './real-test-helpers';

function ctx(): FeedbackContext { return new FeedbackContext(); }

describe('FeedbackService', () => {
  let testCtx: RealTestContext;
  let service: FeedbackService;

  beforeEach(async () => {
    testCtx = await setupRealTestEnvironment();
    await new FeedbackSchemaInitializer(testCtx.relationDb).init();
    service = new FeedbackService(testCtx.relationDb);
  });

  afterEach(() => {
    cleanupTempDirs();
  });

  it('TC-FB-001: submit rating persists and returns id', async () => {
    const output = new SubmitFeedbackOutput();
    const ok = await service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: 'm1', type: 'rating', score: 4, comment: 'good' }),
      output,
      ctx(),
    );
    expect(ok).toBe(true);
    expect(output.feedback?.id).toBeTruthy();
    expect(output.feedback?.score).toBe(4);
    expect(output.feedback?.type).toBe('rating');
    expect(output.feedback?.status).toBe('pending');
  });

  it('TC-FB-002: like/dislike do not require score', async () => {
    const likeOut = new SubmitFeedbackOutput();
    await service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: 'm2', type: 'like' }),
      likeOut,
      ctx(),
    );
    expect(likeOut.feedback?.score).toBe(1);

    const dislikeOut = new SubmitFeedbackOutput();
    await service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: 'm3', type: 'dislike' }),
      dislikeOut,
      ctx(),
    );
    expect(dislikeOut.feedback?.score).toBe(0);
  });

  it('TC-FB-003: invalid type or rating score is rejected', async () => {
    await expect(service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: 'm4', type: 'unknown' }),
      new SubmitFeedbackOutput(),
      ctx(),
    )).rejects.toBeInstanceOf(ValidationError);

    await expect(service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: 'm4', type: 'rating', score: 9 }),
      new SubmitFeedbackOutput(),
      ctx(),
    )).rejects.toBeInstanceOf(ValidationError);

    await expect(service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: '', type: 'like' }),
      new SubmitFeedbackOutput(),
      ctx(),
    )).rejects.toBeInstanceOf(ValidationError);
  });

  it('TC-FB-004: resubmit same msg_id+type updates existing row', async () => {
    await service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: 'm5', type: 'rating', score: 2 }),
      new SubmitFeedbackOutput(),
      ctx(),
    );
    const updated = new SubmitFeedbackOutput();
    await service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: 'm5', type: 'rating', score: 5 }),
      updated,
      ctx(),
    );
    expect(updated.feedback?.score).toBe(5);

    const list = new ListFeedbackOutput();
    await service.soFeedback(Object.assign(new ListFeedbackInput(), { msg_id: 'm5' }), list, ctx());
    expect(list.total).toBe(1);
  });

  it('TC-FB-005: list/get/stats/status form a closed loop', async () => {
    await service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: 'm6', type: 'rating', score: 5, session_id: 's1' }),
      new SubmitFeedbackOutput(),
      ctx(),
    );
    await service.submitFeedback(
      Object.assign(new SubmitFeedbackInput(), { msg_id: 'm7', type: 'like', session_id: 's1' }),
      new SubmitFeedbackOutput(),
      ctx(),
    );

    const list = new ListFeedbackOutput();
    await service.soFeedback(Object.assign(new ListFeedbackInput(), { session_id: 's1' }), list, ctx());
    expect(list.total).toBe(2);
    expect(list.feedbacks).toHaveLength(2);

    const detail = new GetFeedbackOutput();
    await service.soFeedbackById(Object.assign(new GetFeedbackInput(), { id: list.feedbacks[0].id }), detail, ctx());
    expect(detail.feedback?.id).toBe(list.feedbacks[0].id);

    const stats = new GetFeedbackStatsOutput();
    await service.soFeedbackStats(new GetFeedbackStatsInput(), stats, ctx());
    expect(stats.total).toBe(2);
    expect(stats.like_count).toBe(1);
    expect(stats.rating_count).toBe(1);
    expect(stats.avg_rating).toBe(5);
    expect(stats.pending_count).toBe(2);

    const statusOut = new UpdateFeedbackStatusOutput();
    await service.updateFeedbackStatus(
      Object.assign(new UpdateFeedbackStatusInput(), { id: list.feedbacks[0].id, status: 'processed' }),
      statusOut,
      ctx(),
    );
    expect(statusOut.feedback?.status).toBe('processed');
  });

  it('TC-FB-006: missing id throws NotFoundError', async () => {
    await expect(service.soFeedbackById(
      Object.assign(new GetFeedbackInput(), { id: 'missing' }),
      new GetFeedbackOutput(),
      ctx(),
    )).rejects.toBeInstanceOf(NotFoundError);
  });
});
