import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { FeedbackSchemaInitializer } from '../infrastructure/FeedbackSchemaInitializer';
import { FeedbackService } from '../application/FeedbackService';
import {
  FeedbackContext,
  SubmitFeedbackInput, SubmitFeedbackOutput,
  GetFeedbackInput, GetFeedbackOutput,
  ListFeedbackInput, ListFeedbackOutput,
  GetFeedbackStatsInput, GetFeedbackStatsOutput,
  UpdateFeedbackStatusInput, UpdateFeedbackStatusOutput,
} from '../domain/types';

export class FeedbackAccess {
  private readonly service: FeedbackService;
  private readonly initPromise: Promise<void>;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    this.initPromise = new FeedbackSchemaInitializer(relationDb).init();
    const raw = new FeedbackService(relationDb, logger);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> {
    await this.initPromise;
  }

  async submitFeedback(i: SubmitFeedbackInput, o: SubmitFeedbackOutput, c: FeedbackContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.submitFeedback(i, o, c, metrics, report);
  }

  async soFeedbackById(i: GetFeedbackInput, o: GetFeedbackOutput, c: FeedbackContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soFeedbackById(i, o, c, metrics, report);
  }

  async soFeedback(i: ListFeedbackInput, o: ListFeedbackOutput, c: FeedbackContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soFeedback(i, o, c, metrics, report);
  }

  async soFeedbackStats(i: GetFeedbackStatsInput, o: GetFeedbackStatsOutput, c: FeedbackContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soFeedbackStats(i, o, c, metrics, report);
  }

  async updateFeedbackStatus(i: UpdateFeedbackStatusInput, o: UpdateFeedbackStatusOutput, c: FeedbackContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.updateFeedbackStatus(i, o, c, metrics, report);
  }
}
