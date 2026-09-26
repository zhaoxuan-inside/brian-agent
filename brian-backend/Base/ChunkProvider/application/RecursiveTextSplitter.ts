export interface RecursiveSplitOptions {
  
  chunkSize?: number;
  
  chunkOverlap?: number;
  
  separators?: string[];
  
  lengthFunction?: (text: string) => number;
  
  keepSeparator?: boolean;
}

export const DEFAULT_SEPARATORS: string[] = [
  '\n\n',
  '\r\n\r\n',
  '\n',
  '\r\n',
  '。',
  '！',
  '？',
  '；',
  '…',
  '. ',
  '! ',
  '? ',
  '; ',
  '，',
  '、',
  ', ',
  '：',
  ': ',
  ' ',
  '\t',
  '',
];

export class RecursiveTextSplitter {
  static readonly DEFAULT_SEPARATORS: string[] = DEFAULT_SEPARATORS;

  
  static readonly charLength = (text: string): number => [...text].length;

  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private readonly separators: string[];
  private readonly lengthFunction: (text: string) => number;
  private readonly keepSeparator: boolean;

  constructor(options: RecursiveSplitOptions = {}) {
    const chunkSize = options.chunkSize ?? 512;
    const chunkOverlap = options.chunkOverlap ?? 64;
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
      throw new Error(`chunkSize 必须为正整数，当前值：${chunkSize}`);
    }
    if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0 || chunkOverlap >= chunkSize) {
      throw new Error(`chunkOverlap 必须满足 0 <= chunkOverlap < chunkSize，当前值：${chunkOverlap}`);
    }
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.separators = options.separators && options.separators.length > 0
      ? options.separators
      : [...DEFAULT_SEPARATORS];
    this.lengthFunction = options.lengthFunction ?? RecursiveTextSplitter.charLength;
    this.keepSeparator = options.keepSeparator ?? true;
  }

  
  static splitText(text: string, options: RecursiveSplitOptions = {}): string[] {
    return new RecursiveTextSplitter(options).splitText(text);
  }

  
  splitText(text: string): string[] {
    if (text == null || text.length === 0) return [];
    return this.splitTextRecursive(text, this.separators);
  }

  
  
  

  private splitTextRecursive(text: string, separators: string[]): string[] {
    const finalChunks: string[] = [];

    
    let separator: string = separators[separators.length - 1];
    let newSeparators: string[] = [];
    for (let i = 0; i < separators.length; i++) {
      const candidate = separators[i];
      if (candidate === '') {
        separator = candidate;
        break;
      }
      if (text.includes(candidate)) {
        separator = candidate;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }

    const splits = this.splitWithSeparator(text, separator);
    const goodSplits: string[] = [];
    const mergedSeparator = this.keepSeparator ? '' : separator;

    for (const s of splits) {
      if (this.lengthFunction(s) < this.chunkSize) {
        goodSplits.push(s);
      } else {
        if (goodSplits.length > 0) {
          finalChunks.push(...this.mergeSplits(goodSplits, mergedSeparator));
          goodSplits.length = 0;
        }
        if (newSeparators.length === 0) {
          
          finalChunks.push(s);
        } else {
          finalChunks.push(...this.splitTextRecursive(s, newSeparators));
        }
      }
    }

    if (goodSplits.length > 0) {
      finalChunks.push(...this.mergeSplits(goodSplits, mergedSeparator));
    }

    return finalChunks;
  }

  
  private splitWithSeparator(text: string, separator: string): string[] {
    if (separator === '') {
      
      return [...text];
    }
    if (!this.keepSeparator) {
      return text.split(separator);
    }
    const parts = text.split(separator);
    if (parts.length <= 1) return parts;
    const result: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const withSep = i < parts.length - 1 ? part + separator : part;
      result.push(withSep);
    }
    return result;
  }

  
  
  

  private mergeSplits(splits: string[], separator: string): string[] {
    const separatorLen = this.lengthFunction(separator);
    const docs: string[] = [];
    let currentDoc: string[] = [];
    let total = 0;

    for (const d of splits) {
      const len = this.lengthFunction(d);
      const pending = total + len + (currentDoc.length > 0 ? separatorLen : 0);

      if (pending > this.chunkSize) {
        if (currentDoc.length > 0) {
          const doc = this.joinDocs(currentDoc, separator);
          if (doc !== null) docs.push(doc);

          
          while (
            total > this.chunkOverlap ||
            (total + len + separatorLen > this.chunkSize && total > 0)
          ) {
            total -= this.lengthFunction(currentDoc[0]) + (currentDoc.length > 1 ? separatorLen : 0);
            currentDoc = currentDoc.slice(1);
          }
        }
      }

      currentDoc.push(d);
      total += len + (currentDoc.length > 1 ? separatorLen : 0);
    }

    const doc = this.joinDocs(currentDoc, separator);
    if (doc !== null) docs.push(doc);
    return docs;
  }

  private joinDocs(docs: string[], separator: string): string | null {
    const text = docs.join(separator).trim();
    return text === '' ? null : text;
  }
}
