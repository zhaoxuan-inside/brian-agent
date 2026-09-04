/**
 * @fileoverview Tools 模块单元测试（Runtime v2 · 阶段2）。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { RelationDBAccess, SkillContext, ExecSkillInput, ExecSkillOutput } from '@brian-agent/base';
import { ToolAccess } from '../Tools/access/ToolAccess';
import {
  ToolContext,
  RegisterToolInput,
  RegisterToolOutput,
  ExecToolInput,
  ExecToolOutput,
  SoToolsInput,
  SoToolsOutput,
  RegisterBuiltinToolsInput,
  RegisterBuiltinToolsOutput,
} from '../Tools/domain/types';
import { zodToJSONSchema } from '../Tools/domain/zodToJsonSchema';
import { skillExecTool } from '../Tools/application/builtinTools';
import type { AnyToolDef } from '../Tools/domain/types';

describe('zodToJSONSchema', () => {
  it('object/string/number/boolean 应该转换正确（required 判定）', () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
      flag: z.boolean(),
      note: z.string().optional(),
    });
    const out = zodToJSONSchema(schema);
    expect(out).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'number' },
        flag: { type: 'boolean' },
        note: { type: 'string' },
      },
      required: ['name', 'count', 'flag'],
    });
  });

  it('enum/array/record 应该转换正确', () => {
    const schema = z.object({
      op: z.enum(['navigate', 'click']),
      tags: z.array(z.string()),
      meta: z.record(z.string()),
    });
    const out = zodToJSONSchema(schema) as {
      properties: Record<string, { type: string; enum?: string[]; items?: unknown; additionalProperties?: unknown }>;
    };
    expect(out.properties.op).toEqual({ type: 'string', enum: ['navigate', 'click'] });
    expect(out.properties.tags).toEqual({ type: 'array', items: { type: 'string' } });
    expect(out.properties.meta).toEqual({ type: 'object', additionalProperties: { type: 'string' } });
  });

  it('union/discriminatedUnion 应该转换 anyOf', () => {
    const schema = z.discriminatedUnion('operation', [
      z.object({ operation: z.literal('navigate'), url: z.string() }),
      z.object({ operation: z.literal('click'), selector: z.string() }),
    ]);
    const out = zodToJSONSchema(schema) as { anyOf: Array<Record<string, unknown>> };
    expect(out.anyOf).toHaveLength(2);
    expect(out.anyOf[0]).toMatchObject({ properties: { operation: { type: 'string', enum: ['navigate'] } } });
  });
});

describe('ToolService', () => {
  let relationDb: RelationDBAccess;
  let toolAccess: ToolAccess;
  let mockSkill: { execSkill: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    relationDb = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
    await relationDb.initialize();
    mockSkill = {
      execSkill: vi.fn(async (input: ExecSkillInput, output: ExecSkillOutput) => {
        output.result = `skill:${input.id} ok`;
        return true;
      }),
    };
    toolAccess = new ToolAccess(relationDb, { skillAccess: mockSkill as never });
    await toolAccess.initialize();
  });

  function makeDef(id: string): AnyToolDef {
    return {
      id,
      description: `工具 ${id}`,
      parameters: z.object({ x: z.number() }),
      execute: async (args: unknown) => ({
        status: 'ok',
        output: `ran ${id} with ${(args as { x: number }).x}`,
      }),
    };
  }

  it('registerTool/execTool 应该执行并返回配对结果', async () => {
    const reg = new RegisterToolInput();
    reg.def = makeDef('custom_a');
    await toolAccess.registerTool(reg, new RegisterToolOutput(), new ToolContext());
    const exec = new ExecToolInput();
    exec.tool_id = 'custom_a';
    exec.raw_args = '{"x":7}';
    const out = new ExecToolOutput();
    await toolAccess.execTool(exec, out, new ToolContext());
    expect(out.result).toEqual({ status: 'ok', output: 'ran custom_a with 7' });
  });

  it('非法参数应该回流模型反馈错误（不抛错）', async () => {
    const reg = new RegisterToolInput();
    reg.def = makeDef('custom_b');
    await toolAccess.registerTool(reg, new RegisterToolOutput(), new ToolContext());
    const exec = new ExecToolInput();
    exec.tool_id = 'custom_b';
    exec.raw_args = '{"x":"not-a-number"}';
    const out = new ExecToolOutput();
    await toolAccess.execTool(exec, out, new ToolContext());
    expect(out.result.status).toBe('error');
    expect(out.result.output).toContain('invalid arguments');
    // 非 JSON 也回流
    exec.raw_args = '{bad json';
    const out2 = new ExecToolOutput();
    await toolAccess.execTool(exec, out2, new ToolContext());
    expect(out2.result.status).toBe('error');
    expect(out2.result.output).toContain('invalid arguments');
  });

  it('execute 抛错应该归一为配对 error 结果', async () => {
    const reg = new RegisterToolInput();
    reg.def = {
      id: 'boom',
      description: '抛错工具',
      parameters: z.object({}),
      execute: async () => {
        throw new Error('kapow');
      },
    };
    await toolAccess.registerTool(reg, new RegisterToolOutput(), new ToolContext());
    const exec = new ExecToolInput();
    exec.tool_id = 'boom';
    exec.raw_args = '{}';
    const out = new ExecToolOutput();
    await toolAccess.execTool(exec, out, new ToolContext());
    expect(out.result.status).toBe('error');
    expect(out.result.output).toContain('kapow');
  });

  it('soTools 应该输出 JSON Schema 规格', async () => {
    const reg = new RegisterToolInput();
    reg.def = makeDef('spec_tool');
    await toolAccess.registerTool(reg, new RegisterToolOutput(), new ToolContext());
    const so = new SoToolsInput();
    const out = new SoToolsOutput();
    await toolAccess.soTools(so, out, new ToolContext());
    const spec = out.specs.find((s) => s.id === 'spec_tool');
    expect(spec).toBeDefined();
    expect(spec!.parameters).toMatchObject({ type: 'object', required: ['x'] });
  });

  it('未注册工具应该 fail-loud（NotFoundError）', async () => {
    const exec = new ExecToolInput();
    exec.tool_id = 'missing';
    exec.raw_args = '{}';
    await expect(toolAccess.execTool(exec, new ExecToolOutput(), new ToolContext()))
      .rejects.toMatchObject({ error_code: 'NOT_FOUND' });
  });

  it('registerBuiltinTools 应该注册 skill_exec 并经 Provider 执行', async () => {
    const reg = new RegisterBuiltinToolsInput();
    reg.enabled = ['skill_exec'];
    const regOut = new RegisterBuiltinToolsOutput();
    await toolAccess.registerBuiltinTools(reg, regOut, new ToolContext());
    expect(regOut.registered).toEqual(['skill_exec']);
    const exec = new ExecToolInput();
    exec.tool_id = 'skill_exec';
    exec.raw_args = '{"skill_id":"s1","params":{}}';
    const out = new ExecToolOutput();
    await toolAccess.execTool(exec, out, new ToolContext());
    expect(out.result.status).toBe('ok');
    expect(out.result.output).toBe('skill:s1 ok');
    expect(mockSkill.execSkill).toHaveBeenCalled();
  });

  it('内置工具 id 不可被覆盖', async () => {
    const reg = new RegisterBuiltinToolsInput();
    reg.enabled = ['skill_exec'];
    await toolAccess.registerBuiltinTools(reg, new RegisterBuiltinToolsOutput(), new ToolContext());
    const override = new RegisterToolInput();
    override.def = {
      ...skillExecTool({}),
      execute: async () => ({ status: 'ok', output: 'hijacked' }),
    };
    await expect(toolAccess.registerTool(override, new RegisterToolOutput(), new ToolContext()))
      .rejects.toMatchObject({ error_code: 'VALIDATION_ERROR' });
  });

  it('mcp_exec 未注入时应 fail-loud（配对 error 结果）', async () => {
    const reg = new RegisterBuiltinToolsInput();
    reg.enabled = ['mcp_exec'];
    await toolAccess.registerBuiltinTools(reg, new RegisterBuiltinToolsOutput(), new ToolContext());
    const exec = new ExecToolInput();
    exec.tool_id = 'mcp_exec';
    exec.raw_args = '{"mcp_id":"m1","params":{}}';
    const out = new ExecToolOutput();
    await toolAccess.execTool(exec, out, new ToolContext());
    expect(out.result.status).toBe('error');
    expect(out.result.output).toContain('MCP Provider 未注入');
  });
});
