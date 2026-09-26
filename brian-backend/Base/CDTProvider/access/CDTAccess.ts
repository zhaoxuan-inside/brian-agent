import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
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
    const rawService = new CDTService(relationDb, dataDir, logger);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  async startCDT(i: StartCDTInput, o: StartCDTOutput, c: CDTContext, metrics?: Metrics, report?: Report) {
    return this.service.startCDT(i, o, c, metrics, report);
  }

  async stopCDT(i: StopCDTInput, o: StopCDTOutput, c: CDTContext, metrics?: Metrics, report?: Report) {
    return this.service.stopCDT(i, o, c, metrics, report);
  }

  async soCDTEndpoint(i: GetCDTEndpointInput, o: GetCDTEndpointOutput, c: CDTContext, metrics?: Metrics, report?: Report) {
    return this.service.soCDTEndpoint(i, o, c, metrics, report);
  }

  async execCDP(i: ExecCDPInput, o: ExecCDPOutput, c: CDTContext, metrics?: Metrics, report?: Report) {
    return this.service.execCDP(i, o, c, metrics, report);
  }

  async isCDTRunning(i: IsCDTRunningInput, o: IsCDTRunningOutput, c: CDTContext, metrics?: Metrics, report?: Report) {
    return this.service.isCDTRunning(i, o, c, metrics, report);
  }

  
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
