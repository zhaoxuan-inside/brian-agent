import { describe, it, expect } from 'vitest';
import {
  buildSemanticsPrompt,
  parseSemanticsJson,
  clampComponentSemantics,
  resolveComponentSemantics,
  createSemanticsTaskFn,
  type SemanticsSourceContext,
} from '@brian-agent/base';
import { validateSemanticsCompliance } from '@brian-agent/shared';

const VALID_SEM = {
  title: '电商订单追踪',
  brief: '接收用户提供的订单号或手机号，查询并输出快递轨迹与签收状态，提供物流追踪功能。',
  positive_examples: ['帮我查一下SF12345到哪了', '包裹为什么卡在转运中心'],
  negative_examples: ['修改淘宝收货地址', '给卖家写催发货邮件'],
};

describe('buildSemanticsPrompt (统一生成 Prompt 契约)', () => {
  it('包含组件类型、标准条目与 JSON 格式说明', () => {
    const source: SemanticsSourceContext = { kind: 'mcp', title: 'GitHub 工具集', brief: '仓库管理' };
    const prompt = buildSemanticsPrompt(source);
    expect(prompt).toContain('MCP 工具集');
    expect(prompt).toContain('positive_examples');
    expect(prompt).toContain('negative_examples');
    expect(prompt).toContain('GitHub 工具集');
  });

  it('空字段行被过滤不产生空行噪声', () => {
    const prompt = buildSemanticsPrompt({ kind: 'soul' });
    expect(prompt).not.toContain('undefined');
    expect(prompt).not.toContain('null');
  });
});

describe('parseSemanticsJson (容错解析)', () => {
  it('解析纯 JSON 输出', () => {
    const parsed = parseSemanticsJson(JSON.stringify(VALID_SEM));
    expect(parsed?.title).toBe('电商订单追踪');
    expect(parsed?.positive_examples).toHaveLength(2);
  });

  it('容忍 ```json 包裹与前后噪声', () => {
    const wrapped = `前置说明\n\`\`\`json\n${JSON.stringify(VALID_SEM)}\n\`\`\`\n后置文本`;
    expect(parseSemanticsJson(wrapped)?.title).toBe('电商订单追踪');
  });

  it('非法输出返回 null', () => {
    expect(parseSemanticsJson('')).toBeNull();
    expect(parseSemanticsJson('没有 JSON')).toBeNull();
    expect(parseSemanticsJson('{"positive": 1}')).toBeNull();
  });
});

describe('clampComponentSemantics (规则强制收敛)', () => {
  it('标题剥离无意义后缀并截断至 10 字', () => {
    const clamped = clampComponentSemantics({ title: '智能数据分析助手Agent', brief: '' });
    expect(clamped.title).toBe('智能数据分析');
    expect(clamped.title.length).toBeLessThanOrEqual(10);
  });

  it('标题缺失时从描述派生', () => {
    const clamped = clampComponentSemantics({ title: '', brief: '物流轨迹查询与签收状态跟踪，输出结构化结果' });
    expect(clamped.title.length).toBeGreaterThan(0);
    expect(clamped.title.length).toBeLessThanOrEqual(10);
  });

  it('描述截断至 40 字', () => {
    const clamped = clampComponentSemantics({ title: '标题', brief: '长'.repeat(80) });
    expect(clamped.brief.length).toBeLessThanOrEqual(40);
  });

  it('范例裁剪：超 15 字剔除、去重、最多 5 条', () => {
    const clamped = clampComponentSemantics({
      title: '标题',
      brief: '描述',
      positive_examples: ['短范例', ...Array(8).fill('x'.repeat(16)), '短范例', '另一条'],
    });
    expect(clamped.positive_examples).toEqual(['短范例', '另一条']);
  });
});

describe('validateSemanticsCompliance (合规校验)', () => {
  it('完全合规返回空问题列表', () => {
    const sem = {
      ...VALID_SEM,
      positive_examples: ['查询快递到哪了', '包裹卡在转运', '修改收货地址吗'],
      negative_examples: ['修改淘宝收货地址', '给卖家写催发货邮件', '帮我算退货运费'],
    };
    expect(validateSemanticsCompliance(sem)).toHaveLength(0);
  });

  it('名称过短/范例超长均产出问题', () => {
    const issues = validateSemanticsCompliance({ title: '短', brief: '太短', positive_examples: ['a'.repeat(20)] });
    expect(issues.some((i) => i.field === 'title')).toBe(true);
    expect(issues.some((i) => i.field === 'brief')).toBe(true);
    expect(issues.some((i) => i.field === 'positive_examples')).toBe(true);
  });
});

describe('resolveComponentSemantics (终值裁决编排)', () => {
  const goodFn = async () => ({ ...VALID_SEM });
  const failFn = async () => null;

  it('LLM 成功且无用户值：全量采用生成结果', async () => {
    const result = await resolveComponentSemantics({ kind: 'skill', source: { kind: 'skill', brief: '仓库管理' }, semanticsFn: goodFn });
    expect(result.generated).toBe(true);
    expect(result.title).toBe('电商订单追踪');
  });

  it('用户显式值优先于生成值且不被 clamp 改写', async () => {
    const result = await resolveComponentSemantics({
      kind: 'skill',
      source: { kind: 'skill' },
      provided: { title: '自定义Agent', brief: '用户自定义描述内容，超过三十字符以满足描述的最短长度合规要求' },
      semanticsFn: goodFn,
    });
    expect(result.title).toBe('自定义Agent');
    expect(result.generated).toBe(true);
    expect(result.positive_examples).toHaveLength(2);
  });

  it('用户超长描述保留原文（合规提示由前端校验器负责）', async () => {
    const result = await resolveComponentSemantics({
      kind: 'soul',
      source: { kind: 'soul' },
      provided: { brief: '长'.repeat(60) },
    });
    expect(result.brief).toBe('长'.repeat(60));
  });

  it('LLM 失败时回退用户值且 generated=false', async () => {
    const result = await resolveComponentSemantics({
      kind: 'agent',
      source: { kind: 'agent' },
      provided: { title: '订单追踪' },
      semanticsFn: failFn,
    });
    expect(result.generated).toBe(false);
    expect(result.title).toBe('订单追踪');
    expect(result.positive_examples).toHaveLength(0);
  });

  it('未注入 semanticsFn 且无用户值：返回空语义', async () => {
    const result = await resolveComponentSemantics({ kind: 'prompt', source: { kind: 'prompt' } });
    expect(result.generated).toBe(false);
    expect(result.title).toBe('');
  });
});

describe('createSemanticsTaskFn (LLM 任务工厂)', () => {
  it('execLLM 成功且输出合法 JSON 时返回语义', async () => {
    const fn = createSemanticsTaskFn({
      execLLM: async (_i, output: { result?: string }) => {
        output.result = JSON.stringify(VALID_SEM);
        return true;
      },
    });
    const sem = await fn({ kind: 'mcp' });
    expect(sem?.title).toBe('电商订单追踪');
  });

  it('execLLM 失败或输出非法返回 null', async () => {
    const fail = createSemanticsTaskFn({ execLLM: async () => false });
    expect(await fail({ kind: 'mcp' })).toBeNull();
    const garbage = createSemanticsTaskFn({
      execLLM: async (_i, output: { result?: string }) => {
        output.result = '不是 JSON';
        return true;
      },
    });
    expect(await garbage({ kind: 'mcp' })).toBeNull();
  });
});
