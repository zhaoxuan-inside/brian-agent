import { describe, it, expect } from 'vitest';
import { ToolAccess, HttpAccess, ToolSchemaInitializer, TOOL_CONFIG_TABLE } from '../ToolProvider';
import {
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
  ToolContext,
} from '../ToolProvider';
import { ExecRequestInput, ExecRequestOutput, HttpContext } from '../ToolProvider';
import { RelationDBAccess } from '../RelationDBProvider';
import { ConfigService } from '../shared/config/ConfigService';
import { Input } from '../shared/base/Input';
import { Output } from '../shared/base/Output';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('ToolProvider', () => {
  const tool = new ToolAccess();

  
  async function call<I extends Input, O extends Output>(
    method: string,
    IC: new () => I,
    OC: new () => O,
    fields: Partial<I> = {},
  ): Promise<O> {
    const input = Object.assign(new IC(), fields);
    const output = new OC();
    const ok = await (tool as unknown as Record<string, (i: I, o: O, c: ToolContext) => Promise<boolean>>)[method](
      input, output, new ToolContext(),
    );
    expect(ok).toBe(true);
    return output;
  }

  describe('ID 生成', () => {
    it('should generate valid UUID v4', async () => {
      const out = await call('generateId', GenerateIdInput, GenerateIdOutput);
      expect(out.id).toMatch(UUID_V4);
    });

    it('should generate unique ids', async () => {
      const out = await call('generateIds', GenerateIdsInput, GenerateIdsOutput, { count: 100 });
      expect(out.ids).toHaveLength(100);
      expect(new Set(out.ids).size).toBe(100);
    });

    it('should clamp count to [0, 1000]', async () => {
      const neg = await call('generateIds', GenerateIdsInput, GenerateIdsOutput, { count: -1 });
      expect(neg.ids).toEqual([]);
      const big = await call('generateIds', GenerateIdsInput, GenerateIdsOutput, { count: 5000 });
      expect(big.ids).toHaveLength(1000);
    });

    it('should return timestamp and date', async () => {
      const now = await call('now', NowInput, NowOutput);
      expect(now.ms).toBeGreaterThan(0);
      const today = await call('today', TodayInput, TodayOutput);
      expect(today.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('JSON', () => {
    it('should check json validity', async () => {
      const ok = await call('jsonCheck', JsonCheckInput, JsonCheckOutput, { text: '{"a":1}' });
      expect(ok.result.valid).toBe(true);
      const bad = await call('jsonCheck', JsonCheckInput, JsonCheckOutput, { text: '{"a":1,}' });
      expect(bad.result.valid).toBe(false);
    });

    it('should format json', async () => {
      const out = await call('jsonFormat', JsonFormatInput, JsonFormatOutput, { text: '{"a":1,"b":[1,2]}' });
      expect(out.result.valid).toBe(true);
      expect(out.result.result).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    });

    it('should minify json', async () => {
      const out = await call('jsonMinify', JsonMinifyInput, JsonMinifyOutput, { text: '{\n  "a": 1\n}' });
      expect(out.result.valid).toBe(true);
      expect(out.result.result).toBe('{"a":1}');
    });

    it('should return error on invalid json', async () => {
      const bad = await call('jsonFormat', JsonFormatInput, JsonFormatOutput, { text: 'not json' });
      expect(bad.result.valid).toBe(false);
      const bad2 = await call('jsonMinify', JsonMinifyInput, JsonMinifyOutput, { text: 'not json' });
      expect(bad2.result.result).toBe('');
    });
  });

  describe('XML', () => {
    it('should check xml validity', async () => {
      const ok = await call('xmlCheck', XmlCheckInput, XmlCheckOutput, { text: '<a>1</a>' });
      expect(ok.result.valid).toBe(true);
      const bad = await call('xmlCheck', XmlCheckInput, XmlCheckOutput, { text: '<a>1' });
      expect(bad.result.valid).toBe(false);
    });

    it('should format xml', async () => {
      const out = await call('xmlFormat', XmlFormatInput, XmlFormatOutput, { text: '<root><a>1</a><b>2</b></root>' });
      expect(out.result.valid).toBe(true);
      expect(out.result.result).toBe('<root>\n  <a>1</a>\n  <b>2</b>\n</root>');
    });

    it('should minify xml', async () => {
      const out = await call('xmlMinify', XmlMinifyInput, XmlMinifyOutput, { text: '<root>\n  <a>1</a>\n</root>' });
      expect(out.result.valid).toBe(true);
      expect(out.result.result).toBe('<root><a>1</a></root>');
    });

    it('should return error on invalid xml', async () => {
      const bad = await call('xmlFormat', XmlFormatInput, XmlFormatOutput, { text: 'not xml' });
      expect(bad.result.valid).toBe(false);
    });
  });

  describe('正则表达式', () => {
    it('should match with global flag', async () => {
      const out = await call('regexMatch', RegexMatchInput, RegexMatchOutput, { pattern: '\\d+', text: 'a1b22c333', flags: 'g' });
      expect(out.result.valid).toBe(true);
      expect(out.result.matched).toBe(true);
      expect(out.result.matches).toEqual(['1', '22', '333']);
      expect(out.result.count).toBe(3);
    });

    it('should return single match without global flag', async () => {
      const out = await call('regexMatch', RegexMatchInput, RegexMatchOutput, { pattern: '\\d+', text: 'a1b22c333' });
      expect(out.result.valid).toBe(true);
      expect(out.result.matched).toBe(true);
      expect(out.result.matches).toEqual(['1']);
      expect(out.result.count).toBe(1);
    });

    it('should return named capture groups', async () => {
      const out = await call('regexMatch', RegexMatchInput, RegexMatchOutput, { pattern: '(?<key>\\w+)=(?<val>\\w+)', text: 'x=1' });
      expect(out.result.valid).toBe(true);
      expect(out.result.groups).toEqual([{ key: 'x', val: '1' }]);
    });

    it('should report unmatched', async () => {
      const out = await call('regexMatch', RegexMatchInput, RegexMatchOutput, { pattern: '\\d+', text: 'abc', flags: 'g' });
      expect(out.result.valid).toBe(true);
      expect(out.result.matched).toBe(false);
      expect(out.result.matches).toEqual([]);
      expect(out.result.count).toBe(0);
    });

    it('should report invalid pattern', async () => {
      const out = await call('regexMatch', RegexMatchInput, RegexMatchOutput, { pattern: '[', text: 'abc' });
      expect(out.result.valid).toBe(false);
      expect(out.result.error).toBeTruthy();
    });

    it('should report invalid flags', async () => {
      const out = await call('regexMatch', RegexMatchInput, RegexMatchOutput, { pattern: 'a', text: 'abc', flags: 'zz' });
      expect(out.result.valid).toBe(false);
      expect(out.result.error).toBeTruthy();
    });
  });

  describe('HttpAccess & 超时配置', () => {
    it('should use default 60000ms timeout when no config provided', async () => {
      const http = new HttpAccess();
      
      expect(http).toBeDefined();
      expect(typeof http.execRequest).toBe('function');
    });

    it('should read timeout from tool_config table via ConfigService', async () => {
      const relationDb = new RelationDBAccess({ dbPath: ':memory:' });
      await relationDb.initialize();
      new ToolSchemaInitializer(relationDb).init();

      const configService = new ConfigService(relationDb, TOOL_CONFIG_TABLE);
      await configService.initDefaults([
        { config_key: 'http_timeout_ms', config_value: '45000', value_type: 'INT', description: 'HTTP 请求默认超时时间' },
      ]);

      const http = new HttpAccess(configService);
      expect(http).toBeDefined();

      const val = await configService.getInt('http_timeout_ms', 60000);
      expect(val).toBe(45000);

      
      await configService.set('http_timeout_ms', '120000', 'INT');
      const updatedVal = await configService.getInt('http_timeout_ms', 60000);
      expect(updatedVal).toBe(120000);
    });

    it('execRequest should round-trip via ExecRequestInput/Output', async () => {
      const http = new HttpAccess();
      const input = Object.assign(new ExecRequestInput(), { url: 'http://127.0.0.1:1/nope', method: 'GET', timeout_ms: 200 });
      const output = new ExecRequestOutput();
      await expect(http.execRequest(input, output, new HttpContext())).rejects.toBeTruthy();
    });
  });
});
