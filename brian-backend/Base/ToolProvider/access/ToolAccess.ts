import { ToolService } from '../application/ToolService';
import type {
  ToolContext,
  GenerateIdInput, GenerateIdOutput,
  GenerateIdsInput, GenerateIdsOutput,
  NowInput, NowOutput,
  TodayInput, TodayOutput,
  JsonCheckInput, JsonCheckOutput,
  JsonFormatInput, JsonFormatOutput,
  JsonMinifyInput, JsonMinifyOutput,
  XmlCheckInput, XmlCheckOutput,
  XmlFormatInput, XmlFormatOutput,
  XmlMinifyInput, XmlMinifyOutput,
  RegexMatchInput, RegexMatchOutput,
  CronCheckInput, CronCheckOutput,
  CronGenerateInput, CronGenerateOutput,
  CronParseInput, CronParseOutput,
  CronNextInput, CronNextOutput,
} from '../domain/types';
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';

export class ToolAccess {
  private readonly service = new ToolService();

  
  async generateId(_input: GenerateIdInput, output: GenerateIdOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.id = this.service.generateId();
    return true;
  }

  
  async generateIds(input: GenerateIdsInput, output: GenerateIdsOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.ids = this.service.generateIds(input.count);
    return true;
  }

  
  async now(_input: NowInput, output: NowOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.ms = this.service.now();
    return true;
  }

  
  async today(_input: TodayInput, output: TodayOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.date = this.service.today();
    return true;
  }

  
  async jsonCheck(input: JsonCheckInput, output: JsonCheckOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.jsonCheck(input.text);
    return true;
  }

  
  async jsonFormat(input: JsonFormatInput, output: JsonFormatOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.jsonFormat(input.text, input.indent);
    return true;
  }

  
  async jsonMinify(input: JsonMinifyInput, output: JsonMinifyOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.jsonMinify(input.text);
    return true;
  }

  
  async xmlCheck(input: XmlCheckInput, output: XmlCheckOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.xmlCheck(input.text);
    return true;
  }

  
  async xmlFormat(input: XmlFormatInput, output: XmlFormatOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.xmlFormat(input.text, input.indent);
    return true;
  }

  
  async xmlMinify(input: XmlMinifyInput, output: XmlMinifyOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.xmlMinify(input.text);
    return true;
  }

  
  async regexMatch(input: RegexMatchInput, output: RegexMatchOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.regexMatch(input.pattern, input.text, input.flags);
    return true;
  }

  
  async cronCheck(input: CronCheckInput, output: CronCheckOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.cronCheck(input.expr);
    return true;
  }

  
  async cronGenerate(input: CronGenerateInput, output: CronGenerateOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.cronGenerate(input.fields);
    return true;
  }

  
  async cronParse(input: CronParseInput, output: CronParseOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.cronParse(input.expr);
    return true;
  }

  
  async cronNext(input: CronNextInput, output: CronNextOutput, _context: ToolContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.result = this.service.cronNext(input.expr, input.from_ms);
    return true;
  }
}
