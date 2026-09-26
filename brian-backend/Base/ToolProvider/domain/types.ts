export interface ToolCheckResult {
  
  valid: boolean;
  
  error: string;
}

export interface ToolTransformResult {
  
  valid: boolean;
  
  error: string;
  
  result: string;
}

export interface ToolRegexResult {
  
  valid: boolean;
  
  error: string;
  
  matched: boolean;
  
  matches: string[];
  
  count: number;
  
  groups?: Array<Record<string, string>>;
}

export interface CronFields {
  second: string;
  minute: string;
  hour: string;
  day: string;
  month: string;
  week: string;
}

export interface ToolCronCheckResult {
  valid: boolean;
  error: string;
  
  normalized: string;
}

export interface ToolCronGenerateResult {
  valid: boolean;
  error: string;
  
  expression: string;
}

export interface ToolCronParseResult {
  valid: boolean;
  error: string;
  fields: CronFields | null;
}

export interface ToolCronNextResult {
  valid: boolean;
  error: string;
  
  next_time: number | null;
}

export const TOOL_CONFIG_TABLE = 'tool_config';

import { Input } from '../../shared/base/Input';
import { Output } from '../../shared/base/Output';
import { Context } from '../../shared/base/Context';

export class ToolContext extends Context {}

export class GenerateIdInput extends Input {}
export class GenerateIdOutput extends Output { id = ''; }

export class GenerateIdsInput extends Input { count = 1; }
export class GenerateIdsOutput extends Output { ids: string[] = []; }

export class NowInput extends Input {}
export class NowOutput extends Output { ms = 0; }

export class TodayInput extends Input {}
export class TodayOutput extends Output { date = ''; }

export class JsonCheckInput extends Input { text = ''; }
export class JsonCheckOutput extends Output { result!: ToolCheckResult; }

export class JsonFormatInput extends Input { text = ''; indent = 2; }
export class JsonFormatOutput extends Output { result!: ToolTransformResult; }

export class JsonMinifyInput extends Input { text = ''; }
export class JsonMinifyOutput extends Output { result!: ToolTransformResult; }

export class XmlCheckInput extends Input { text = ''; }
export class XmlCheckOutput extends Output { result!: ToolCheckResult; }

export class XmlFormatInput extends Input { text = ''; indent = 2; }
export class XmlFormatOutput extends Output { result!: ToolTransformResult; }

export class XmlMinifyInput extends Input { text = ''; }
export class XmlMinifyOutput extends Output { result!: ToolTransformResult; }

export class RegexMatchInput extends Input { pattern = ''; text = ''; flags = ''; }
export class RegexMatchOutput extends Output { result!: ToolRegexResult; }

export class CronCheckInput extends Input { expr = ''; }
export class CronCheckOutput extends Output { result!: ToolCronCheckResult; }

export class CronGenerateInput extends Input { fields!: CronFields; }
export class CronGenerateOutput extends Output { result!: ToolCronGenerateResult; }

export class CronParseInput extends Input { expr = ''; }
export class CronParseOutput extends Output { result!: ToolCronParseResult; }

export class CronNextInput extends Input { expr = ''; from_ms?: number; }
export class CronNextOutput extends Output { result!: ToolCronNextResult; }
