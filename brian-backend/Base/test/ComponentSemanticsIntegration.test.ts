import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { SoulSchemaInitializer } from '../SoulProvider/infrastructure/SoulSchemaInitializer';
import { MCPSchemaInitializer } from '../MCPProvider/infrastructure/MCPSchemaInitializer';
import { SoulService } from '../SoulProvider/application/SoulService';
import { SoulContext, AddSoulInput, AddSoulOutput, UpdateSoulInput, UpdateSoulOutput } from '../SoulProvider/domain/types';
import { generateMockParamsFromSchema } from '../MCPProvider/application/McpTransport';
import { Operator } from '../shared/query';

const FIXED_SEMANTICS = {
  title: '电商订单追踪',
  brief: '接收订单号或手机号，输出快递轨迹与签收状态，提供物流追踪功能。',
  positive_examples: ['查一下SF123到哪了', '包裹卡在转运'],
  negative_examples: ['修改收货地址', '写催发货邮件'],
};

const mockEmbedFn = async (text: string): Promise<number[]> => [text.length, 1, 0];
const mockSemanticsFn = async () => ({ ...FIXED_SEMANTICS });

describe('R7 语义生成落库链路 (SoulService + 范例表)', () => {
  let tempDir: string;
  let sqlitePath: string;
  let relationDb: RelationDBAccess;
  let soulService: SoulService;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-semantics-test-'));
    sqlitePath = path.join(tempDir, 'test.db');
    relationDb = new RelationDBAccess({ dbPath: sqlitePath });
    await relationDb.initialize();
    new SoulSchemaInitializer(relationDb).init();
    new MCPSchemaInitializer(relationDb).init();
    soulService = new SoulService(relationDb);
    soulService.setEmbedFn(mockEmbedFn);
    soulService.setSemanticsFn(mockSemanticsFn);
  });

  afterEach(() => {
    try { relationDb.close(); } catch { /* 容错 */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* 容错 */ }
  });

  it('addSoul 自动生成 title/brief 并落正负范例', async () => {
    const input = Object.assign(new AddSoulInput(), {
      data: { soul_content: '你是严苛的代码审查员', soul_brief: '', soul_usage: '代码审查' },
    });
    const output = new AddSoulOutput();
    await soulService.addSoul(input, output, new SoulContext());
    expect(output.id).toBeTruthy();

    const row = await relationDb.selectOne('soul_record', [{ field: 'id', operator: Operator.EQ, value: output.id }]);
    expect(String(row?.title ?? '')).toBe(FIXED_SEMANTICS.title);
    expect(String(row?.brief ?? '')).toBe(FIXED_SEMANTICS.brief);

    const examples = await relationDb.select('soul_example_embedding_record', {
      conditions: [{ field: 'soul_id', operator: Operator.EQ, value: output.id }],
    });
    const pos = examples.filter((r) => r.example_type === 'positive');
    const neg = examples.filter((r) => r.example_type === 'negative');
    expect(pos).toHaveLength(2);
    expect(neg).toHaveLength(2);
  });

  it('updateSoul 提供新范例时全量替换', async () => {
    const addIn = Object.assign(new AddSoulInput(), {
      data: { soul_content: '内容', soul_brief: '旧描述需要超过三十个字符才能满足最短合规要求检查', soul_usage: '' },
    });
    const addOut = new AddSoulOutput();
    await soulService.addSoul(addIn, addOut, new SoulContext());

    const updIn = Object.assign(new UpdateSoulInput(), {
      id: addOut.id,
      data: { positive_examples: ['新范例一', '新范例二'], negative_examples: [] },
    });
    const updOut = new UpdateSoulOutput();
    await soulService.updateSoul(updIn, updOut, new SoulContext());

    const examples = await relationDb.select('soul_example_embedding_record', {
      conditions: [{ field: 'soul_id', operator: Operator.EQ, value: addOut.id }],
    });
    const posTexts = examples.filter((r) => r.example_type === 'positive').map((r) => String(r.example_text));
    expect(posTexts).toEqual(['新范例一', '新范例二']);
    expect(examples.filter((r) => r.example_type === 'negative')).toHaveLength(0);
  });
});

describe('generateMockParamsFromSchema (MCP 入参样例)', () => {
  it('required 字段按类型/enum/默认值合成', () => {
    const sample = generateMockParamsFromSchema({
      type: 'object',
      required: ['owner', 'repo', 'count', 'active', 'state'],
      properties: {
        owner: { type: 'string', description: '仓库所有者' },
        repo: { type: 'string' },
        count: { type: 'integer', description: '每页数量' },
        active: { type: 'boolean' },
        state: { type: 'string', enum: ['open', 'closed'] },
        url: { type: 'string' },
        labels: { type: 'array' },
      },
    });
    expect(sample.owner).toBe('hardstone');
    expect(sample.repo).toBe('brian-agent');
    expect(sample.count).toBe(1);
    expect(sample.active).toBe(true);
    expect(sample.state).toBe('open');
    expect(sample.url).toBe('https://example.com');
    expect(sample.labels).toEqual([]);
  });

  it('空 schema 或非对象返回空对象', () => {
    expect(generateMockParamsFromSchema(null)).toEqual({});
    expect(generateMockParamsFromSchema({})).toEqual({});
  });
});
