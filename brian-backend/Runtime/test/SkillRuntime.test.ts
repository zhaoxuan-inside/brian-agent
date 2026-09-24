/**
 * @fileoverview Tools 模块单元测试（Runtime v2 · 阶段2）。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { RelationDBAccess, SkillContext, ExecSkillInput, ExecSkillOutput } from '@brian-agent/base';
import { SkillRuntimeAccess } from '../SkillRuntime/access/SkillRuntimeAccess';
import {
  SkillRuntimeContext,
  RegisterSkillInput,
  RegisterSkillOutput,
  ExecSkillInput,
  ExecSkillOutput,
  SoSkillsInput,
  SoSkillsOutput,
  RegisterBuiltinSkillsInput,
  RegisterBuiltinSkillsOutput,
  RegisterRunSkillsInput,
  RegisterSkillsOutput,
  ClearRunSkillsInput,
} from '../SkillRuntime/domain/types';
import { mcpExecTool } from '../SkillRuntime/application/mcpGate';
import { zodToJSONSchema } from '../SkillRuntime/domain/zodToJsonSchema';
import { execCommandSkill } from '../SkillRuntime/application/execCommandSkill';
import type { AnyToolDef } from '../SkillRuntime/domain/types';
import { mcpExecTool } from '../SkillRuntime/application/mcpGate';

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

describe('SkillRuntimeService', () => {
  describe('update_plan（编排原语）', () => {
    it('应该持久化计划并发出 plan.updated 事件；违反至多一个 in_progress 不变量时拒绝', async () => {
      const { updatePlanSkill } = await import('../SkillRuntime/application/updatePlanSkill');
      const tool = updatePlanSkill();
      const emitted: Array<{ type: string; payload: unknown }> = [];
      const ok = await tool.execute(
        { plan: [
          { step: '分析任务', status: 'completed' },
          { step: '执行查询', status: 'in_progress' },
          { step: '汇总答复' },
        ] },
        { run_id: 'run-plan-1', emitEvent: (type, payload) => emitted.push({ type, payload }) } as never,
      );
      expect(ok.status).toBe('ok');
      expect(emitted).toHaveLength(1);
      expect(emitted[0].type).toBe('plan.updated');
      const steps = (emitted[0].payload as { steps: Array<{ status: string }> }).steps;
      expect(steps.filter((s) => s.status === 'in_progress')).toHaveLength(1);

      await expect(
        tool.execute(
          { plan: [
            { step: 'A', status: 'in_progress' },
            { step: 'B', status: 'in_progress' },
          ] },
          { run_id: 'run-plan-1', emitEvent: () => undefined } as never,
        ),
      ).rejects.toThrow('至多一个');
    });
  });

  let relationDb: RelationDBAccess;
  let skillRuntimeAccess: SkillRuntimeAccess;
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
    skillRuntimeAccess = new SkillRuntimeAccess(relationDb, { skillAccess: mockSkill as never });
    await skillRuntimeAccess.initialize();
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

  it('registerTool/execSkill 应该执行并返回配对结果', async () => {
    const reg = new RegisterSkillInput();
    reg.def = makeDef('custom_a');
    await skillRuntimeAccess.registerSkill(reg, new RegisterSkillOutput(), new SkillRuntimeContext());
    const exec = new ExecSkillInput();
    exec.tool_id = 'custom_a';
    exec.raw_args = '{"x":7}';
    const out = new ExecSkillOutput();
    await skillRuntimeAccess.execSkill(exec, out, new SkillRuntimeContext());
    expect(out.result).toEqual({ status: 'ok', output: 'ran custom_a with 7' });
  });

  it('非法参数应该回流模型反馈错误（不抛错）', async () => {
    const reg = new RegisterSkillInput();
    reg.def = makeDef('custom_b');
    await skillRuntimeAccess.registerSkill(reg, new RegisterSkillOutput(), new SkillRuntimeContext());
    const exec = new ExecSkillInput();
    exec.tool_id = 'custom_b';
    exec.raw_args = '{"x":"not-a-number"}';
    const out = new ExecSkillOutput();
    await skillRuntimeAccess.execSkill(exec, out, new SkillRuntimeContext());
    expect(out.result.status).toBe('error');
    expect(out.result.output).toContain('invalid arguments');
    // 非 JSON 也回流
    exec.raw_args = '{bad json';
    const out2 = new ExecSkillOutput();
    await skillRuntimeAccess.execSkill(exec, out2, new SkillRuntimeContext());
    expect(out2.result.status).toBe('error');
    expect(out2.result.output).toContain('invalid arguments');
  });

  it('execute 抛错应该归一为配对 error 结果', async () => {
    const reg = new RegisterSkillInput();
    reg.def = {
      id: 'boom',
      description: '抛错工具',
      parameters: z.object({}),
      execute: async () => {
        throw new Error('kapow');
      },
    };
    await skillRuntimeAccess.registerSkill(reg, new RegisterSkillOutput(), new SkillRuntimeContext());
    const exec = new ExecSkillInput();
    exec.tool_id = 'boom';
    exec.raw_args = '{}';
    const out = new ExecSkillOutput();
    await skillRuntimeAccess.execSkill(exec, out, new SkillRuntimeContext());
    expect(out.result.status).toBe('error');
    expect(out.result.output).toContain('kapow');
  });

  it('soSkills 应该输出 JSON Schema 规格', async () => {
    const reg = new RegisterSkillInput();
    reg.def = makeDef('spec_tool');
    await skillRuntimeAccess.registerSkill(reg, new RegisterSkillOutput(), new SkillRuntimeContext());
    const so = new SoSkillsInput();
    const out = new SoSkillsOutput();
    await skillRuntimeAccess.soSkills(so, out, new SkillRuntimeContext());
    const spec = out.specs.find((s) => s.id === 'spec_tool');
    expect(spec).toBeDefined();
    expect(spec!.parameters).toMatchObject({ type: 'object', required: ['x'] });
  });

  it('未注册工具应该 fail-loud（NotFoundError）', async () => {
    const exec = new ExecSkillInput();
    exec.tool_id = 'missing';
    exec.raw_args = '{}';
    await expect(skillRuntimeAccess.execSkill(exec, new ExecSkillOutput(), new SkillRuntimeContext()))
      .rejects.toMatchObject({ error_code: 'NOT_FOUND' });
  });

  // ===== 2026-09-24 概念退役（Tool → Skill）：skill_exec 间接 gate 用例随概念删除 =====
  // 原三个用例（skill_exec 注册执行/无绑定拒绝/越界拒绝）验证的选/执分离语义已由
  // 绑定技能一等化（绑定即授权）与 mcp gate（独立保留）分别承接。
  it('registerBuiltinSkills 默认仅注册 mcp gate（系统技能走 run 级注册，不占全局表）', async () => {
    const regOut = new RegisterBuiltinSkillsOutput();
    await skillRuntimeAccess.registerBuiltinSkills(new RegisterBuiltinSkillsInput(), regOut, new SkillRuntimeContext());
    expect(regOut.registered).toEqual(['mcp_exec']);
  });

  it('内置工具 id 不可被覆盖', async () => {
    const reg = new RegisterBuiltinSkillsInput();
    reg.enabled = ['mcp_exec'];
    await skillRuntimeAccess.registerBuiltinSkills(reg, new RegisterBuiltinSkillsOutput(), new SkillRuntimeContext());
    const override = new RegisterSkillInput();
    override.def = {
      ...mcpExecTool({}),
      execute: async () => ({ status: 'ok', output: 'hijacked' }),
    };
    await expect(skillRuntimeAccess.registerSkill(override, new RegisterSkillOutput(), new SkillRuntimeContext()))
      .rejects.toMatchObject({ error_code: 'VALIDATION_ERROR' });
  });

  it('mcp_exec 未注入时应 fail-loud（配对 error 结果）', async () => {
    const reg = new RegisterBuiltinSkillsInput();
    reg.enabled = ['mcp_exec'];
    await skillRuntimeAccess.registerBuiltinSkills(reg, new RegisterBuiltinSkillsOutput(), new SkillRuntimeContext());
    const exec = new ExecSkillInput();
    exec.tool_id = 'mcp_exec';
    exec.raw_args = '{"mcp_id":"m1","params":{}}';
    const out = new ExecSkillOutput();
    await skillRuntimeAccess.execSkill(exec, out, new SkillRuntimeContext());
    expect(out.result.status).toBe('error');
    expect(out.result.output).toContain('MCP Provider 未注入');
  });
});

// ===== 2026-09-24 新增（Tool ⊕ Skill 合并回归）：Skill 一等工具 run 级注册 =====
describe('Skill 一等能力（run 级注册；Tools-PRD §14 → SkillRuntime）', () => {
  let relationDb: RelationDBAccess;
  let skillRuntimeAccess: SkillRuntimeAccess;
  let mockSkill: {
    soSkillById: ReturnType<typeof vi.fn>;
    execSkill: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    relationDb = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
    await relationDb.initialize();
    mockSkill = {
      soSkillById: vi.fn(async (input: { id: string }, output: { skill: unknown }) => {
        output.skill = { id: input.id, name: '磁盘巡检', skill_brief: '查询磁盘可用空间并汇总', skill_md: '# disk-checker\n\n当用户问磁盘时使用', enable: true };
        return true;
      }),
      execSkill: vi.fn(async (input: ExecSkillInput, output: ExecSkillOutput) => {
        output.result = `skill-run:${input.id}`;
        return true;
      }),
    };
    skillRuntimeAccess = new SkillRuntimeAccess(relationDb, { skillAccess: mockSkill as never });
    await skillRuntimeAccess.initialize();
    await skillRuntimeAccess.registerBuiltinSkills(new RegisterBuiltinSkillsInput(), new RegisterBuiltinSkillsOutput(), new SkillRuntimeContext());
  });

  it('registerRunSkills：绑定 Skill 转为一等工具（skill_<id>），soSkills 经 run_id 并入规格', async () => {
    const runId = 'run-merge-1';
    const reg = new RegisterRunSkillsInput();
    reg.run_id = runId;
    reg.skill_ids = ['11111111-2222-3333-4444-555555555555'];
    const regOut = new RegisterSkillsOutput();
    await skillRuntimeAccess.registerRunSkills(reg, regOut, new SkillRuntimeContext());
    // 2026-09-24 概念退役语义：run 级注册 = 系统内置技能（无依赖可装配的 exec/plan）∪ 绑定技能
    expect(regOut.registered).toContain('skill_11111111-2222-3333-4444-555555555555');
    expect(regOut.registered).toContain('skill_builtin-exec');
    expect(regOut.registered).toContain('skill_builtin-plan');

    // wire 规格合并：run 级工具与内置原语同表出现
    const soIn = new SoSkillsInput();
    soIn.run_id = runId;
    soIn.skill_ids = ['skill_builtin-exec', 'skill_11111111-2222-3333-4444-555555555555'];
    const soOut = new SoSkillsOutput();
    await skillRuntimeAccess.soSkills(soIn, soOut, new SkillRuntimeContext());
    const ids = soOut.specs.map((s) => s.id);
    expect(ids).toContain('skill_builtin-exec');
    expect(ids).toContain('skill_11111111-2222-3333-4444-555555555555');
    const skillSpec = soOut.specs.find((s) => s.id === 'skill_11111111-2222-3333-4444-555555555555');
    expect(skillSpec?.description).toContain('磁盘巡检');
    expect(skillSpec?.description).toContain('磁盘时使用');
  });

  it('run 级 Skill 工具 execSkill 直调（绑定即授权，免 skill_exec 间接 gate）', async () => {
    const runId = 'run-exec-skill';
    await skillRuntimeAccess.registerRunSkills(
      Object.assign(new RegisterRunSkillsInput(), { run_id: runId, skill_ids: ['s-1'] }),
      new RegisterSkillsOutput(),
      new SkillRuntimeContext(),
    );
    const exec = new ExecSkillInput();
    exec.tool_id = 'skill_s-1';
    exec.raw_args = '{"params":{"city":"北京"}}';
    exec.run_id = runId;
    const out = new ExecSkillOutput();
    await skillRuntimeAccess.execSkill(exec, out, new SkillRuntimeContext());
    expect(out.result.status).toBe('ok');
    expect(out.result.output).toContain('skill-run:s-1');
    expect(mockSkill.execSkill).toHaveBeenCalledTimes(1);
  });

  it('run 级工具不污染全局：clearRunSkills 后 execSkill 回 NotFound，未绑定的其他 run 不可见', async () => {
    const runId = 'run-clear';
    await skillRuntimeAccess.registerRunSkills(
      Object.assign(new RegisterRunSkillsInput(), { run_id: runId, skill_ids: ['s-2'] }),
      new RegisterSkillsOutput(),
      new SkillRuntimeContext(),
    );
    await skillRuntimeAccess.clearRunSkills(Object.assign(new ClearRunSkillsInput(), { run_id: runId }), new SkillRuntimeContext());
    const soIn = new SoSkillsInput();
    soIn.run_id = runId;
    soIn.skill_ids = ['skill_s-2'];
    const soOut = new SoSkillsOutput();
    await skillRuntimeAccess.soSkills(soIn, soOut, new SkillRuntimeContext());
    expect(soOut.specs.length).toBe(0);

    // execSkill 对未注册工具的既有语义：抛 NotFoundError（run 级清理后即回到未注册态）
    const exec = new ExecSkillInput();
    exec.tool_id = 'skill_s-2';
    exec.raw_args = '{}';
    exec.run_id = runId;
    await expect(skillRuntimeAccess.execSkill(exec, new ExecSkillOutput(), new SkillRuntimeContext())).rejects.toThrow('Tool 不存在');
  });
});

describe('execSkill（宿主命令执行）', () => {
  it('echo 命令返回真实 stdout 与 exit_code=0', async () => {
    const tool = execCommandSkill();
    const result = await tool.execute({ command: 'echo hello-exec', timeout_s: 10 }, new SkillRuntimeContext() as never);
    expect(result.status).toBe('ok');
    expect(result.output).toContain('hello-exec');
    expect(result.output).toContain('exit_code=0');
  });

  it('非零退出码如实上报（不伪装成功）', async () => {
    const tool = execCommandSkill();
    const result = await tool.execute({ command: 'exit 3', timeout_s: 10 }, new SkillRuntimeContext() as never);
    expect(result.output).toContain('exit_code=3');
  });

  it('超时强制终止并注明', async () => {
    const tool = execCommandSkill();
    const result = await tool.execute({ command: 'sleep 5', timeout_s: 1 }, new SkillRuntimeContext() as never);
    expect(result.output).toContain('超时终止');
  });
});
