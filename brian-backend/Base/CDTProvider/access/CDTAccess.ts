/**
 * @fileoverview CDTProvider 接入层。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { CDTSchemaInitializer } from '../infrastructure/CDTSchemaInitializer';
import { CDTService } from '../application/CDTService';
import {
  CDTContext,
  StartCDTInput,
  StartCDTOutput,
  StopCDTInput,
  StopCDTOutput,
  GetCDTEndpointInput,
  GetCDTEndpointOutput,
  ExecCDPInput,
  ExecCDPOutput,
  IsCDTRunningInput,
  IsCDTRunningOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

export class CDTAccess {
  private readonly service: CDTService;

  constructor(relationDb: RelationDBAccess, dataDir: string = '', logger?: Logger) {
    new CDTSchemaInitializer(relationDb).init();
    const rawService = new CDTService(relationDb, dataDir);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  async startCDT(i: StartCDTInput, c: CDTContext, o: StartCDTOutput) {
    return this.service.startCDT(i, c, o);
  }

  async stopCDT(i: StopCDTInput, c: CDTContext, o: StopCDTOutput) {
    return this.service.stopCDT(i, c, o);
  }

  async getCDTEndpoint(i: GetCDTEndpointInput, c: CDTContext, o: GetCDTEndpointOutput) {
    return this.service.getCDTEndpoint(i, c, o);
  }

  async execCDP(i: ExecCDPInput, c: CDTContext, o: ExecCDPOutput) {
    return this.service.execCDP(i, c, o);
  }

  async isCDTRunning(i: IsCDTRunningInput, c: CDTContext, o: IsCDTRunningOutput) {
    return this.service.isCDTRunning(i, c, o);
  }

  // ---- CDT Screencast + 输入转发 ----
  async startScreencast(maxWidth = 1920, maxHeight = 1080, quality = 80): Promise<boolean> {
    return this.service.startScreencast(maxWidth, maxHeight, quality);
  }

  getLatestFrame(): string {
    return this.service.getLatestFrame();
  }

  getLatestFrameDimensions(): { width: number; height: number } {
    return this.service.getLatestFrameDimensions();
  }

  async sendMouseEvent(type: string, x: number, y: number, button = 'left', clickCount = 1, deltaX = 0, deltaY = 0, buttons = 0,
    ctrl = false, alt = false, shift = false, meta = false,
  ) {
    return this.service.sendMouseEvent(type, x, y, button, clickCount, deltaX, deltaY, buttons, ctrl, alt, shift, meta);
  }

  async sendKeyEvent(type: string, text = '', key = '', ctrl = false, alt = false, shift = false, meta = false) {
    return this.service.sendKeyEvent(type, text, key, ctrl, alt, shift, meta);
  }

  async sendKeyBatch(events: Array<{ type: string; text?: string; key?: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }>) {
    return this.service.sendKeyBatch(events);
  }

  async insertText(text: string) {
    return this.service.insertText(text);
  }

  async injectAntiDetection(env?: import('../domain/types').CDTEnv) {
    return this.service.injectAntiDetection(env);
  }
}
