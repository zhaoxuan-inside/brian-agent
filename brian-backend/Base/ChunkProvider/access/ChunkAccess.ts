import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import { ChunkService } from '../application/ChunkService';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';
import {
  ChunkContext,
  ChunkTextInput,
  ChunkTextOutput,
  ChunkFileInput,
  ChunkFileOutput,
} from '../domain/types';

export class ChunkAccess {
  private readonly service: ChunkService;

  constructor(logger?: Logger) {
    const rawService = new ChunkService();
    this.service = AopProxy.wrap(rawService, { logger });
  }

  async chunkText(input: ChunkTextInput, output: ChunkTextOutput, context: ChunkContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.chunkText(input, output, context, metrics, report);
  }

  async chunkFile(input: ChunkFileInput, output: ChunkFileOutput, context: ChunkContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.chunkFile(input, output, context, metrics, report);
  }
}
