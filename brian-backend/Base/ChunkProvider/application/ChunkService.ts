import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { ValidationError } from '../../shared/errors';
import {
  ChunkContext,
  ChunkResult,
  ChunkConfig,
  ChunkTextInput,
  ChunkTextOutput,
  ChunkFileInput,
  ChunkFileOutput,
  DEFAULT_WINDOW_SIZE,
  DEFAULT_OVERLAP_RATIO,
} from '../domain/types';

export class ChunkService {

  
  static readonly defaults: ChunkConfig = {
    windowSize: DEFAULT_WINDOW_SIZE,
    overlapRatio: DEFAULT_OVERLAP_RATIO,
  };

  

  async chunkText(input: ChunkTextInput, output: ChunkTextOutput, _context: ChunkContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.content) {
      throw new ValidationError('content 不能为空');
    }
    const config = this.mergeConfig(input.config);
    output.chunks = this.slidingWindow(input.content, config);
    return true;
  }

  

  async chunkFile(input: ChunkFileInput, output: ChunkFileOutput, _context: ChunkContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.filePath) {
      throw new ValidationError('filePath 不能为空');
    }
    const config = this.mergeConfig(input.config);

    const bufferMaxLines = Math.ceil(config.windowSize / 30) + 100;
    let buffer = '';
    let lineCount = 0;
    const chunks: ChunkResult[] = [];

    const stream = createReadStream(input.filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      buffer += line + '\n';
      lineCount++;

      
      if (lineCount >= bufferMaxLines) {
        const partial = this.slidingWindow(buffer, config, 0, true);
        
        if (partial.length > 1) {
          for (let i = 0; i < partial.length - 1; i++) {
            partial[i].index = chunks.length;
            chunks.push(partial[i]);
          }
          buffer = partial[partial.length - 1].content;
          lineCount = buffer.split('\n').length;
        } else {
          buffer = buffer.slice(-config.windowSize * 2);
          lineCount = buffer.split('\n').length;
        }
      }
    }
    rl.close();

    
    if (buffer.trim()) {
      const remaining = this.slidingWindow(buffer, config, 0);
      for (const c of remaining) {
        c.index = chunks.length;
        chunks.push(c);
      }
    }

    output.chunks = chunks;
    return true;
  }

  
  
  

  

  private slidingWindow(
    text: string,
    config: ChunkConfig,
    baseIdx = 0,
    keepLast = false,
  ): ChunkResult[] {
    const { windowSize, overlapRatio } = config;
    const step = Math.max(1, Math.floor(windowSize * (1 - overlapRatio)));
    const results: ChunkResult[] = [];

    let start = 0;
    let idx = baseIdx;

    while (start < text.length) {
      const end = start + windowSize;
      const content = text.substring(start, end).trim();

      if (content || !keepLast || start + windowSize >= text.length) {
        if (content) {
          results.push({
            index: idx++,
            content,
            startOffset: start,
            endOffset: Math.min(end, text.length),
          });
        }
      }

      if (end >= text.length) break;
      start += step;
    }

    return results;
  }

  
  
  

  private mergeConfig(partial?: ChunkConfig): ChunkConfig {
    const c: ChunkConfig = partial ?? ChunkService.defaults;
    return {
      windowSize: c.windowSize ?? ChunkService.defaults.windowSize,
      overlapRatio: c.overlapRatio ?? ChunkService.defaults.overlapRatio,
    };
  }
}
