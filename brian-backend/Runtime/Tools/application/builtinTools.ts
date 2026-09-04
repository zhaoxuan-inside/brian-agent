/**
 * @fileoverview 内置工具定义（Runtime v2 · 阶段2，Tools-PRD §5）。
 *
 * - skill_exec / mcp_exec：经 `SkillAccess.execSkill` / `MCPAccess.execMcp`
 *   （接入点唯一性，DevStandards §8）；
 * - cdt_browser：经 Core `CDTCoreAccess` 六操作（navigate/getContent/typeText/
 *   click/scroll/evaluate）；getContent = evaluate(document.body.innerText)
 *   截断 8000 字符（与旧 AgentExecution.execCdtAction 语义一致）。
 * - Provider 未注入时 execute fail-loud（ValidationError），不以空能力静默注册。
 *
 * 每个方法 ≤40 行（Runtime-PRD §7）。
 */

import { z } from 'zod';
import {
  ValidationError,
} from '@brian-agent/base';
import type { SkillAccess, MCPAccess } from '@brian-agent/base';
import {
  ExecSkillInput,
  ExecSkillOutput,
  SkillContext,
  ExecMcpInput,
  ExecMcpOutput,
  McpContext,
} from '@brian-agent/base';
import type { CDTCoreAccess } from '@brian-agent/core';
import {
  CDTCoreNavigateInput,
  CDTCoreNavigateOutput,
  CDTCoreTypeTextInput,
  CDTCoreTypeTextOutput,
  CDTCoreClickInput,
  CDTCoreClickOutput,
  CDTCoreScrollInput,
  CDTCoreScrollOutput,
  CDTCoreEvaluateInput,
  CDTCoreEvaluateOutput,
  CDTCoreContext,
} from '@brian-agent/core';
import type { ToolDef, ToolExecutionContext } from '../domain/types';

/** CDT getContent 截断上限（与旧实现一致） */
const CDT_CONTENT_MAX = 8000;

/** 内置工具 Provider 依赖 */
export interface BuiltinToolDeps {
  skillAccess?: SkillAccess;
  mcpAccess?: MCPAccess;
  cdtCore?: CDTCoreAccess;
}

/** skill_exec 工具 */
export function skillExecTool(deps: BuiltinToolDeps): ToolDef<{ skill_id: string; params?: Record<string, unknown> }> {
  return {
    id: 'skill_exec',
    description: '执行已配置的 Skill（技能）。参数：skill_id（技能 ID）、params（技能参数对象）。',
    parameters: z.object({
      skill_id: z.string(),
      params: z.record(z.unknown()).optional(),
    }),
    max_output: CDT_CONTENT_MAX,
    async execute(args, _ctx: ToolExecutionContext) {
      if (!deps.skillAccess) {
        throw new ValidationError('Skill Provider 未注入（skillAccess 为空）');
      }
      const input = Object.assign(new ExecSkillInput(), { id: args.skill_id, params: args.params ?? {} });
      const output = new ExecSkillOutput();
      const ok = await deps.skillAccess.execSkill(input, output, new SkillContext());
      if (!ok) {
        throw new ValidationError(output.error || 'Skill 执行失败');
      }
      return { status: 'ok', output: stringifyToolOutput(output.result) };
    },
  };
}

/** mcp_exec 工具 */
export function mcpExecTool(deps: BuiltinToolDeps): ToolDef<{ mcp_id: string; tool_name?: string; params?: Record<string, unknown> }> {
  return {
    id: 'mcp_exec',
    description: '调用 MCP（Model Context Protocol）工具。参数：mcp_id、tool_name（多工具 MCP 时指定）、params。',
    parameters: z.object({
      mcp_id: z.string(),
      tool_name: z.string().optional(),
      params: z.record(z.unknown()).optional(),
    }),
    max_output: CDT_CONTENT_MAX,
    async execute(args, _ctx: ToolExecutionContext) {
      if (!deps.mcpAccess) {
        throw new ValidationError('MCP Provider 未注入（mcpAccess 为空）');
      }
      const input = Object.assign(new ExecMcpInput(), {
        id: args.mcp_id,
        tool_name: args.tool_name,
        params: args.params ?? {},
      });
      const output = new ExecMcpOutput();
      const ok = await deps.mcpAccess.execMcp(input, output, new McpContext());
      if (!ok) {
        throw new ValidationError(output.error || 'MCP 执行失败');
      }
      return { status: 'ok', output: stringifyToolOutput(output.result) };
    },
  };
}

/** cdt_browser 工具（六操作 discriminated union） */
export function cdtBrowserTool(deps: BuiltinToolDeps): ToolDef<{ operation: string; url?: string; selector?: string; text?: string; pixels?: number; to_bottom?: boolean; expression?: string; wait_for_load?: boolean }> {
  return {
    id: 'cdt_browser',
    description: 'CDT 浏览器操作。operation: navigate(url) / get_content() / type_text(selector,text) / click(selector) / scroll(pixels,to_bottom) / evaluate(expression)。',
    parameters: z.object({
      operation: z.enum(['navigate', 'get_content', 'type_text', 'click', 'scroll', 'evaluate']),
      url: z.string().optional(),
      selector: z.string().optional(),
      text: z.string().optional(),
      pixels: z.number().optional(),
      to_bottom: z.boolean().optional(),
      expression: z.string().optional(),
      wait_for_load: z.boolean().optional(),
    }),
    max_output: CDT_CONTENT_MAX,
    async execute(args, _ctx: ToolExecutionContext) {
      if (!deps.cdtCore) {
        throw new ValidationError('CDT Provider 未注入（cdtCore 为空）');
      }
      return execCdtOperation(deps.cdtCore, args);
    },
  };
}

/** CDT 操作分派（逻辑控制） */
async function execCdtOperation(
  cdt: CDTCoreAccess,
  args: { operation: string; url?: string; selector?: string; text?: string; pixels?: number; to_bottom?: boolean; expression?: string; wait_for_load?: boolean },
): Promise<{ status: 'ok'; output: string }> {
  const op = args.operation.trim().toLowerCase();
  switch (op) {
    case 'navigate':
      return cdtNavigate(cdt, args);
    case 'get_content':
      return cdtGetContent(cdt);
    case 'type_text':
      return cdtTypeText(cdt, args);
    case 'click':
      return cdtClick(cdt, args);
    case 'scroll':
      return cdtScroll(cdt, args);
    case 'evaluate':
      return cdtEvaluate(cdt, args);
    default:
      throw new ValidationError(`CDT 不支持的操作: ${op}`);
  }
}

/** navigate（数据处理） */
async function cdtNavigate(cdt: CDTCoreAccess, args: { url?: string; wait_for_load?: boolean }): Promise<{ status: 'ok'; output: string }> {
  if (!args.url) {
    throw new ValidationError('CDT navigate 需要 url 参数');
  }
  const output = new CDTCoreNavigateOutput();
  const ok = await cdt.navigate(
    Object.assign(new CDTCoreNavigateInput(), { url: args.url, waitForLoad: args.wait_for_load !== false }),
    output,
    new CDTCoreContext(),
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT navigate 执行失败');
  }
  return { status: 'ok', output: `已打开页面：${args.url}` };
}

/** get_content（数据处理；evaluate body.innerText 截断） */
async function cdtGetContent(cdt: CDTCoreAccess): Promise<{ status: 'ok'; output: string }> {
  const output = new CDTCoreEvaluateOutput();
  const ok = await cdt.evaluate(
    Object.assign(new CDTCoreEvaluateInput(), { expression: 'document.body ? document.body.innerText : ""' }),
    output,
    new CDTCoreContext(),
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT get_content 执行失败');
  }
  return { status: 'ok', output: extractCdpText(output.result).slice(0, CDT_CONTENT_MAX) };
}

/** type_text（数据处理） */
async function cdtTypeText(cdt: CDTCoreAccess, args: { selector?: string; text?: string }): Promise<{ status: 'ok'; output: string }> {
  if (!args.selector || args.text === undefined) {
    throw new ValidationError('CDT type_text 需要 selector 与 text 参数');
  }
  const output = new CDTCoreTypeTextOutput();
  const ok = await cdt.typeText(
    Object.assign(new CDTCoreTypeTextInput(), { selector: args.selector, text: args.text }),
    output,
    new CDTCoreContext(),
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT type_text 执行失败');
  }
  return { status: 'ok', output: `已在 ${args.selector} 输入文本` };
}

/** click（数据处理） */
async function cdtClick(cdt: CDTCoreAccess, args: { selector?: string }): Promise<{ status: 'ok'; output: string }> {
  if (!args.selector) {
    throw new ValidationError('CDT click 需要 selector 参数');
  }
  const output = new CDTCoreClickOutput();
  const ok = await cdt.click(
    Object.assign(new CDTCoreClickInput(), { selector: args.selector }),
    output,
    new CDTCoreContext(),
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT click 执行失败');
  }
  return { status: 'ok', output: `已点击 ${args.selector}` };
}

/** scroll（数据处理） */
async function cdtScroll(cdt: CDTCoreAccess, args: { pixels?: number; to_bottom?: boolean }): Promise<{ status: 'ok'; output: string }> {
  const output = new CDTCoreScrollOutput();
  const ok = await cdt.scroll(
    Object.assign(new CDTCoreScrollInput(), { pixels: args.pixels, toBottom: args.to_bottom }),
    output,
    new CDTCoreContext(),
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT scroll 执行失败');
  }
  return { status: 'ok', output: args.to_bottom ? '已滚动到页面底部' : `已滚动 ${args.pixels ?? 0} 像素` };
}

/** evaluate（数据处理） */
async function cdtEvaluate(cdt: CDTCoreAccess, args: { expression?: string }): Promise<{ status: 'ok'; output: string }> {
  if (!args.expression) {
    throw new ValidationError('CDT evaluate 需要 expression 参数');
  }
  const output = new CDTCoreEvaluateOutput();
  const ok = await cdt.evaluate(
    Object.assign(new CDTCoreEvaluateInput(), { expression: args.expression }),
    output,
    new CDTCoreContext(),
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT evaluate 执行失败');
  }
  return { status: 'ok', output: extractCdpText(output.result).slice(0, CDT_CONTENT_MAX) };
}

/** CDP evaluate 结果文本提取（数据处理） */
function extractCdpText(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  if (result && typeof result === 'object' && 'value' in (result as Record<string, unknown>)) {
    return String((result as Record<string, unknown>).value ?? '');
  }
  return JSON.stringify(result ?? '');
}

/** 工具输出字符串化（数据处理） */
function stringifyToolOutput(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  return JSON.stringify(result ?? '');
}
