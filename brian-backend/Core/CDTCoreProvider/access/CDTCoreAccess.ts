import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, CDTAccess } from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { CDTCoreSchemaInitializer } from '../infrastructure/CDTCoreSchemaInitializer';
import { CDTCoreService } from '../application/CDTCoreService';
import {
  CDTCoreContext,
  CDTCoreNavigateInput, CDTCoreNavigateOutput,
  CDTCoreTypeTextInput, CDTCoreTypeTextOutput,
  CDTCoreClickInput, CDTCoreClickOutput,
  CDTCoreScrollInput, CDTCoreScrollOutput,
  CDTCoreEvaluateInput, CDTCoreEvaluateOutput,
  CDTCoreLoginInput, CDTCoreLoginOutput,
  CDTCoreGetLoginStateInput, CDTCoreGetLoginStateOutput,
  CDTCoreGetCookiesInput, CDTCoreGetCookiesOutput,
  CDTCoreSaveSessionInput, CDTCoreSaveSessionOutput,
  CDTCoreRestoreSessionInput, CDTCoreRestoreSessionOutput,
} from '../domain/types';

export class CDTCoreAccess {
  private readonly service: CDTCoreService;

  constructor(
    relationDb: RelationDBAccess,
    cdtAccess: CDTAccess,
    logger?: Logger,
  ) {
    new CDTCoreSchemaInitializer(relationDb).init();
    const rawService = new CDTCoreService(relationDb, cdtAccess);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  async navigate(i: CDTCoreNavigateInput, o: CDTCoreNavigateOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.navigate(i, o, c, metrics, report);
  }

  async typeText(i: CDTCoreTypeTextInput, o: CDTCoreTypeTextOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.typeText(i, o, c, metrics, report);
  }

  async click(i: CDTCoreClickInput, o: CDTCoreClickOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.click(i, o, c, metrics, report);
  }

  async scroll(i: CDTCoreScrollInput, o: CDTCoreScrollOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.scroll(i, o, c, metrics, report);
  }

  async evaluate(i: CDTCoreEvaluateInput, o: CDTCoreEvaluateOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.evaluate(i, o, c, metrics, report);
  }

  async login(i: CDTCoreLoginInput, o: CDTCoreLoginOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.login(i, o, c, metrics, report);
  }

  async getLoginState(i: CDTCoreGetLoginStateInput, o: CDTCoreGetLoginStateOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.getLoginState(i, o, c, metrics, report);
  }

  async getCookies(i: CDTCoreGetCookiesInput, o: CDTCoreGetCookiesOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.getCookies(i, o, c, metrics, report);
  }

  async saveSession(i: CDTCoreSaveSessionInput, o: CDTCoreSaveSessionOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.saveSession(i, o, c, metrics, report);
  }

  async restoreSession(i: CDTCoreRestoreSessionInput, o: CDTCoreRestoreSessionOutput, c: CDTCoreContext, metrics?: Metrics, report?: Report) {
    return this.service.restoreSession(i, o, c, metrics, report);
  }
}
