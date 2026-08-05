/**
 * @fileoverview CDTCoreProvider 接入层。
 */

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

  async navigate(i: CDTCoreNavigateInput, c: CDTCoreContext, o: CDTCoreNavigateOutput) {
    return this.service.navigate(i, c, o);
  }

  async typeText(i: CDTCoreTypeTextInput, c: CDTCoreContext, o: CDTCoreTypeTextOutput) {
    return this.service.typeText(i, c, o);
  }

  async click(i: CDTCoreClickInput, c: CDTCoreContext, o: CDTCoreClickOutput) {
    return this.service.click(i, c, o);
  }

  async scroll(i: CDTCoreScrollInput, c: CDTCoreContext, o: CDTCoreScrollOutput) {
    return this.service.scroll(i, c, o);
  }

  async evaluate(i: CDTCoreEvaluateInput, c: CDTCoreContext, o: CDTCoreEvaluateOutput) {
    return this.service.evaluate(i, c, o);
  }

  async login(i: CDTCoreLoginInput, c: CDTCoreContext, o: CDTCoreLoginOutput) {
    return this.service.login(i, c, o);
  }

  async getLoginState(i: CDTCoreGetLoginStateInput, c: CDTCoreContext, o: CDTCoreGetLoginStateOutput) {
    return this.service.getLoginState(i, c, o);
  }

  async getCookies(i: CDTCoreGetCookiesInput, c: CDTCoreContext, o: CDTCoreGetCookiesOutput) {
    return this.service.getCookies(i, c, o);
  }

  async saveSession(i: CDTCoreSaveSessionInput, c: CDTCoreContext, o: CDTCoreSaveSessionOutput) {
    return this.service.saveSession(i, c, o);
  }

  async restoreSession(i: CDTCoreRestoreSessionInput, c: CDTCoreContext, o: CDTCoreRestoreSessionOutput) {
    return this.service.restoreSession(i, c, o);
  }
}
