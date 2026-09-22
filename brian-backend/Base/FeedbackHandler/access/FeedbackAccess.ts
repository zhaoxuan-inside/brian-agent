import { Metrics, Report } from '../../shared';
import type { Logger } from '../../shared';
import { AopProxy } from '../../shared';
import type { RelationDBAccess } from '../../RelationDBProvider';
import { FeedbackSchemaInitializer } from '../infrastructure/FeedbackSchemaInitializer';
import { FeedbackService } from '../application/FeedbackService';
import {
  FeedbackContext,
  SubmitFeedbackInput, SubmitFeedbackOutput,
  SubmitAgentFeedbackInput, SubmitAgentFeedbackOutput,
  QueryFeedbackInput, QueryFeedbackOutput,
  AnalyzeFeedbackInput, AnalyzeFeedbackOutput,
  RecordProcessLogInput, RecordProcessLogOutput,
  QueryProcessLogsInput, QueryProcessLogsOutput,
  GetProcessLogDetailInput, GetProcessLogDetailOutput,
  DeleteFeedbackByRefsInput, DeleteFeedbackByRefsOutput,
  PurgeOrphanFeedbackInput, PurgeOrphanFeedbackOutput,
  GetFeedbackConfigInput, GetFeedbackConfigOutput,
  UpdateFeedbackConfigInput, UpdateFeedbackConfigOutput,
} from '../domain/types';

export class FeedbackAccess {
  private readonly service: FeedbackService;
  private readonly initPromise: Promise<void>;

  constructor(
    relationDb: RelationDBAccess,
    logger?: Logger,
  ) {
    const schemaInit = new FeedbackSchemaInitializer(relationDb);
    this.initPromise = Promise.resolve().then(() => { schemaInit.init(); });
    const raw = new FeedbackService(relationDb);
    this.service = AopProxy.wrap(raw, { logger });
  }

  async initialize(): Promise<void> { await this.initPromise; }

  async submitFeedback(
    i: SubmitFeedbackInput, o: SubmitFeedbackOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.submitFeedback(i, o, c, metrics, report);
  }

  async submitAgentFeedback(
    i: SubmitAgentFeedbackInput, o: SubmitAgentFeedbackOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.submitAgentFeedback(i, o, c, metrics, report);
  }

  async soFeedback(
    i: QueryFeedbackInput, o: QueryFeedbackOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.soFeedback(i, o, c, metrics, report);
  }

  async analyzeFeedback(
    i: AnalyzeFeedbackInput, o: AnalyzeFeedbackOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.analyzeFeedback(i, o, c, metrics, report);
  }

  async recordProcessLog(
    i: RecordProcessLogInput, o: RecordProcessLogOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.recordProcessLog(i, o, c, metrics, report);
  }

  async getProcessLogs(
    i: QueryProcessLogsInput, o: QueryProcessLogsOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getProcessLogs(i, o, c, metrics, report);
  }

  async getProcessLogDetail(
    i: GetProcessLogDetailInput, o: GetProcessLogDetailOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getProcessLogDetail(i, o, c, metrics, report);
  }

  async deleteFeedbackByRefs(
    i: DeleteFeedbackByRefsInput, o: DeleteFeedbackByRefsOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.deleteFeedbackByRefs(i, o, c, metrics, report);
  }

  async purgeOrphanFeedback(
    i: PurgeOrphanFeedbackInput, o: PurgeOrphanFeedbackOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.purgeOrphanFeedback(i, o, c, metrics, report);
  }

  async getFeedbackConfig(
    i: GetFeedbackConfigInput, o: GetFeedbackConfigOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.getFeedbackConfig(i, o, c, metrics, report);
  }

  async updateFeedbackConfig(
    i: UpdateFeedbackConfigInput, o: UpdateFeedbackConfigOutput, c: FeedbackContext,
    metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    await this.initPromise;
    return this.service.updateFeedbackConfig(i, o, c, metrics, report);
  }
}