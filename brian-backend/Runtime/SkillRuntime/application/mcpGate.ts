import { z } from 'zod';
import {
  ValidationError,
} from '@brian-agent/base';
import type { SkillAccess, MCPAccess } from '@brian-agent/base';
import {
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
import type { SkillDef, SkillExecutionContext, SkillResult, ComponentScope } from '../domain/types';
import { SkillResultStatus } from '../domain/types';

const CDT_CONTENT_MAX = 8000;

export interface SkillRuntimeDeps {
  skillAccess?: SkillAccess;
  mcpAccess?: MCPAccess;
  cdtCore?: CDTCoreAccess;
  

  runGateway?: { submitRun(input: { session_key: string; lane_kind: string; queue_mode: string; user_message: string; agent_ref?: string; parent_run_id?: string }): Promise<{ run_id: string }> };
  
  askUserGate?: { waitAnswer(input: { ask_id: string; run_id: string; session_key: string }): Promise<{ answer: string; answered: boolean }> };
}

function scopeDeniedHint(scope: ComponentScope | undefined, kind: 'Skill' | 'MCP'): string {
  const bound = kind === 'Skill' ? scope?.skills ?? [] : scope?.mcps ?? [];
  if (!scope || !bound.length) {
    return `Agent 未绑定任何 ${kind}（须在 match 阶段完成组件绑定后才能执行）`;
  }
  return `${kind} 不在本运行的组件绑定范围内。可用 ${kind} id：${bound.join(', ')}`;
}

export function mcpExecTool(deps: SkillRuntimeDeps): SkillDef<{ mcp_id: string; tool_name?: string; params?: Record<string, unknown> }> {
  return {
    id: 'mcp_exec',
    description: '调用 MCP（Model Context Protocol）工具。参数：mcp_id、tool_name（多工具 MCP 时指定）、params。',
    parameters: z.object({
      mcp_id: z.string(),
      tool_name: z.string().optional(),
      params: z.record(z.unknown()).optional(),
    }),
    
    async execute(args, _ctx: SkillExecutionContext) {
      if (!deps.mcpAccess) {
        throw new ValidationError('MCP Provider 未注入（mcpAccess 为空）');
      }
      if (!_ctx.component_scope?.mcps.length) {
        throw new ValidationError(scopeDeniedHint(_ctx.component_scope, 'MCP'));
      }
      if (!_ctx.component_scope.mcps.includes(args.mcp_id)) {
        throw new ValidationError(scopeDeniedHint(_ctx.component_scope, 'MCP'));
      }
      const input = Object.assign(new ExecMcpInput(), {
        id: args.mcp_id,
        tool_name: args.tool_name,
        params: args.params ?? {},
      });
      const output = new ExecMcpOutput();
      const ok = await deps.mcpAccess.execMcp(input, output, new McpContext(), _ctx.metrics, _ctx.report);
      if (!ok) {
        throw new ValidationError(output.error || 'MCP 执行失败');
      }
      return { status: SkillResultStatus.Ok, output: stringifySkillOutput(output.result) };
    },
  };
}

export function browserSkill(deps: SkillRuntimeDeps): SkillDef<{ operation: string; url?: string; selector?: string; text?: string; pixels?: number; to_bottom?: boolean; expression?: string; wait_for_load?: boolean }> {
  return {
    id: 'skill_builtin-browser',
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
    async execute(args, _ctx: SkillExecutionContext) {
      if (!deps.cdtCore) {
        throw new ValidationError('CDT Provider 未注入（cdtCore 为空）');
      }
      return execCdtOperation(deps.cdtCore, args, _ctx.metrics, _ctx.report);
    },
  };
}

async function execCdtOperation(
  cdt: CDTCoreAccess,
  args: { operation: string; url?: string; selector?: string; text?: string; pixels?: number; to_bottom?: boolean; expression?: string; wait_for_load?: boolean },
  metrics?: import('@brian-agent/base').Metrics,
  report?: import('@brian-agent/base').Report,
): Promise<SkillResult> {
  const op = args.operation.trim().toLowerCase();
  switch (op) {
    case 'navigate':
      return cdtNavigate(cdt, args, metrics, report);
    case 'get_content':
      return cdtGetContent(cdt, metrics, report);
    case 'type_text':
      return cdtTypeText(cdt, args, metrics, report);
    case 'click':
      return cdtClick(cdt, args, metrics, report);
    case 'scroll':
      return cdtScroll(cdt, args, metrics, report);
    case 'evaluate':
      return cdtEvaluate(cdt, args, metrics, report);
    default:
      throw new ValidationError(`CDT 不支持的操作: ${op}`);
  }
}

async function cdtNavigate(cdt: CDTCoreAccess, args: { url?: string; wait_for_load?: boolean }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult> {
  if (!args.url) {
    throw new ValidationError('CDT navigate 需要 url 参数');
  }
  const output = new CDTCoreNavigateOutput();
  const ok = await cdt.navigate(
    Object.assign(new CDTCoreNavigateInput(), { url: args.url, waitForLoad: args.wait_for_load !== false }),
    output,
    new CDTCoreContext(),
    metrics,
    report,
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT navigate 执行失败');
  }
  return { status: SkillResultStatus.Ok, output: `已打开页面：${args.url}` };
}

async function cdtGetContent(cdt: CDTCoreAccess, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult> {
  const output = new CDTCoreEvaluateOutput();
  const ok = await cdt.evaluate(
    Object.assign(new CDTCoreEvaluateInput(), { expression: 'document.body ? document.body.innerText : ""' }),
    output,
    new CDTCoreContext(),
    metrics,
    report,
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT get_content 执行失败');
  }
  return { status: SkillResultStatus.Ok, output: extractCdpText(output.result).slice(0, CDT_CONTENT_MAX) };
}

async function cdtTypeText(cdt: CDTCoreAccess, args: { selector?: string; text?: string }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult> {
  if (!args.selector || args.text === undefined) {
    throw new ValidationError('CDT type_text 需要 selector 与 text 参数');
  }
  const output = new CDTCoreTypeTextOutput();
  const ok = await cdt.typeText(
    Object.assign(new CDTCoreTypeTextInput(), { selector: args.selector, text: args.text }),
    output,
    new CDTCoreContext(),
    metrics,
    report,
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT type_text 执行失败');
  }
  return { status: SkillResultStatus.Ok, output: `已在 ${args.selector} 输入文本` };
}

async function cdtClick(cdt: CDTCoreAccess, args: { selector?: string }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult> {
  if (!args.selector) {
    throw new ValidationError('CDT click 需要 selector 参数');
  }
  const output = new CDTCoreClickOutput();
  const ok = await cdt.click(
    Object.assign(new CDTCoreClickInput(), { selector: args.selector }),
    output,
    new CDTCoreContext(),
    metrics,
    report,
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT click 执行失败');
  }
  return { status: SkillResultStatus.Ok, output: `已点击 ${args.selector}` };
}

async function cdtScroll(cdt: CDTCoreAccess, args: { pixels?: number; to_bottom?: boolean }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult> {
  const output = new CDTCoreScrollOutput();
  const ok = await cdt.scroll(
    Object.assign(new CDTCoreScrollInput(), { pixels: args.pixels, toBottom: args.to_bottom }),
    output,
    new CDTCoreContext(),
    metrics,
    report,
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT scroll 执行失败');
  }
  return { status: SkillResultStatus.Ok, output: args.to_bottom ? '已滚动到页面底部' : `已滚动 ${args.pixels ?? 0} 像素` };
}

async function cdtEvaluate(cdt: CDTCoreAccess, args: { expression?: string }, metrics?: import('@brian-agent/base').Metrics, report?: import('@brian-agent/base').Report): Promise<SkillResult> {
  if (!args.expression) {
    throw new ValidationError('CDT evaluate 需要 expression 参数');
  }
  const output = new CDTCoreEvaluateOutput();
  const ok = await cdt.evaluate(
    Object.assign(new CDTCoreEvaluateInput(), { expression: args.expression }),
    output,
    new CDTCoreContext(),
    metrics,
    report,
  );
  if (!ok) {
    throw new ValidationError(output.error || 'CDT evaluate 执行失败');
  }
  return { status: SkillResultStatus.Ok, output: extractCdpText(output.result).slice(0, CDT_CONTENT_MAX) };
}

function extractCdpText(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  if (result && typeof result === 'object' && 'value' in (result as Record<string, unknown>)) {
    return String((result as Record<string, unknown>).value ?? '');
  }
  return JSON.stringify(result ?? '');
}

function stringifySkillOutput(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  return JSON.stringify(result ?? '');
}
