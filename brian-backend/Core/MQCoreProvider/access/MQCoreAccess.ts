import { Metrics, Report } from '@brian-agent/base';
import type { MQAccess } from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { MQCoreService } from '../application/MQCoreService';
import {
  MQCoreContext,
  StartWorkerInput,
  StartWorkerOutput,
  StopWorkerInput,
  StopWorkerOutput,
  SoWorkerInput,
  SoWorkerOutput,
} from '../domain/types';

export class MQCoreAccess {
  private readonly service: MQCoreService;

  

  constructor(mqAccess: MQAccess, logger?: Logger) {
    const rawService = new MQCoreService(mqAccess);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  
  async startWorker(input: StartWorkerInput, output: StartWorkerOutput, context: MQCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.startWorker(input, output, context, metrics, report);
  }

  
  async stopWorker(input: StopWorkerInput, output: StopWorkerOutput, context: MQCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.stopWorker(input, output, context, metrics, report);
  }

  
  async soWorker(input: SoWorkerInput, output: SoWorkerOutput, context: MQCoreContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soWorker(input, output, context, metrics, report);
  }
}
