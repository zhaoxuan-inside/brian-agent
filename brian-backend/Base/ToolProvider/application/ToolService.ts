import { IdGenerator } from '../IdGenerator';
import { JsonParser } from '../JsonParser';
import { XmlParser } from '../XmlParser';
import {
  checkCron,
  generateCron,
  parseCron,
  nextRunTime,
} from '../CronUtils';
import type {
  ToolCheckResult,
  ToolTransformResult,
  ToolRegexResult,
  CronFields,
  ToolCronCheckResult,
  ToolCronGenerateResult,
  ToolCronParseResult,
  ToolCronNextResult,
} from '../domain/types';

export class ToolService {
  
  
  

  
  generateId(): string {
    return IdGenerator.generate();
  }

  
  generateIds(count: number): string[] {
    const n = Math.max(0, Math.min(Math.trunc(count) || 0, 1000));
    return Array.from({ length: n }, () => IdGenerator.generate());
  }

  
  now(): number {
    return IdGenerator.now();
  }

  
  today(): string {
    return IdGenerator.today();
  }

  
  
  

  
  jsonCheck(text: string): ToolCheckResult {
    return JsonParser.check(text);
  }

  
  jsonFormat(text: string, indent = 2): ToolTransformResult {
    const result = JsonParser.format(text, indent);
    if (result === null) {
      return { valid: false, error: 'JSON 解析失败', result: '' };
    }
    return { valid: true, error: '', result };
  }

  
  jsonMinify(text: string): ToolTransformResult {
    const result = JsonParser.minify(text);
    if (result === null) {
      return { valid: false, error: 'JSON 解析失败', result: '' };
    }
    return { valid: true, error: '', result };
  }

  
  
  

  
  xmlCheck(text: string): ToolCheckResult {
    return XmlParser.check(text);
  }

  
  xmlFormat(text: string, indent = 2): ToolTransformResult {
    const result = XmlParser.format(text, indent);
    if (result === null) {
      return { valid: false, error: 'XML 解析失败', result: '' };
    }
    return { valid: true, error: '', result };
  }

  
  xmlMinify(text: string): ToolTransformResult {
    const result = XmlParser.minify(text);
    if (result === null) {
      return { valid: false, error: 'XML 解析失败', result: '' };
    }
    return { valid: true, error: '', result };
  }

  
  
  

  

  regexMatch(pattern: string, text: string, flags = ''): ToolRegexResult {
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
        matched: false,
        matches: [],
        count: 0,
      };
    }

    try {
      if (re.global) {
        const matches = text.match(re) || [];
        return {
          valid: true,
          error: '',
          matched: matches.length > 0,
          matches,
          count: matches.length,
        };
      }

      const m = text.match(re);
      return {
        valid: true,
        error: '',
        matched: m !== null,
        matches: m ? [m[0]] : [],
        count: m ? 1 : 0,
        groups: m?.groups ? [m.groups] : undefined,
      };
    } catch (e) {
      return {
        valid: false,
        error: e instanceof Error ? e.message : String(e),
        matched: false,
        matches: [],
        count: 0,
      };
    }
  }

  
  
  

  
  cronCheck(expr: string): ToolCronCheckResult {
    const r = checkCron(expr);
    return { valid: r.valid, error: r.error, normalized: r.normalized };
  }

  
  cronGenerate(fields: CronFields): ToolCronGenerateResult {
    try {
      const expression = generateCron(fields);
      return { valid: true, error: '', expression };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e), expression: '' };
    }
  }

  
  cronParse(expr: string): ToolCronParseResult {
    try {
      const fields = parseCron(expr);
      return { valid: true, error: '', fields };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e), fields: null };
    }
  }

  
  cronNext(expr: string, fromMs?: number): ToolCronNextResult {
    try {
      const next = nextRunTime(expr, fromMs);
      return { valid: true, error: '', next_time: next };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e), next_time: null };
    }
  }
}
