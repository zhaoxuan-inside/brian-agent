import { Input, Context, Output } from '../../shared/base';

export interface ChunkResult {
  
  index: number;
  
  content: string;
  
  startOffset?: number;
  
  endOffset?: number;
}

export interface ChunkConfig {
  
  windowSize: number;
  
  overlapRatio: number;
}

export class ChunkContext extends Context {}

export class ChunkTextInput extends Input {
  
  content!: string;
  
  config?: ChunkConfig;
}

export class ChunkTextOutput extends Output {
  
  chunks: ChunkResult[] = [];
}

export class ChunkFileInput extends Input {
  
  filePath!: string;
  
  config?: ChunkConfig;
}

export class ChunkFileOutput extends Output {
  
  chunks: ChunkResult[] = [];
}

export const DEFAULT_WINDOW_SIZE = 500;

export const DEFAULT_OVERLAP_RATIO = 0.2;
