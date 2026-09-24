/**
 * @fileoverview 内置工具定义（Runtime v2 · 阶段2，Tools-PRD §5）。
 *
 * - mcp_exec：经 `MCPAccess.execMcp`（Skill 一等化后 skill_exec 间接 gate 退役删除）
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

/** CDT getContent / evaluate 输出截断上限（与旧 AgentExecution.execCdtAction 语义一致） */
const CDT_CONTENT_MAX = 8000;

/** 内置工具 Provider 依赖 */
export interface SkillRuntimeDeps {
  skillAccess?: SkillAccess;
  mcpAccess?: MCPAccess;
  cdtCore?: CDTCoreAccess;
  /** 子代理委派入口（RunGatewayAccess.submitRun 适配；缺省 delegate 工具 fail-loud；
   *  2026-09-23 委派收口：透传 parent_run_id（父子登记），返回 run_id（回执引用 + 结果配对） */
  runGateway?: { submitRun(input: { session_key: string; lane_kind: string; queue_mode: string; user_message: string; agent_ref?: string; parent_run_id?: string }): Promise<{ run_id: string }> };
  /** ask_user 挂起等待入口（RunGatewayAccess.waitUserAnswer 适配；缺省 ask_user 工具 fail-loud） */
  askUserGate?: { waitAnswer(input: { ask_id: string; run_id: string; session_key: string }): Promise<{ answer: string; answered: boolean }> };
}

/** 组件范围兜底文案（数据处理） */
function scopeDeniedHint(scope: ComponentScope | undefined, kind: 'Skill' | 'MCP'): string {
  const bound = kind === 'Skill' ? scope?.skills ?? [] : scope?.mcps ?? [];
  if (!scope || !bound.length) {
    return `Agent 未绑定任何 ${kind}（须在 match 阶段完成组件绑定后才能执行）`;
  }
  return `${kind} 不在本运行的组件绑定范围内。可用 ${kind} id：${bound.join(', ')}`;
}

/** mcp_exec 工具 */
export function mcpExecTool(deps: SkillRuntimeDeps): SkillDef<{ mcp_id: string; tool_name?: string; params?: Record<string, unknown> }> {
  return {
    id: 'mcp_exec',
    description: '调用 MCP（Model Context Protocol）工具。参数：mcp_id、tool_name（多工具 MCP 时指定）、params。',
    parameters: z.object({
      mcp_id: z.string(),
      tool_name: z.string().optional(),
      params: z.record(z.unknown()).optional(),
    }),
    // ===== 修改后（2026-09-11）：选/执分离执行门——id 必须存在于本 run 的组件选择范围 =====
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

/** cdt_browser 工具（六操作 discriminated union） */
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

/** CDT 操作分派（逻辑控制；经 CDTCoreAccess 接入） */
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

/** navigate（数据处理） */
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

/** get_content（数据处理；evaluate body.innerText 截断） */
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

/** type_text（数据处理） */
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

/** click（数据处理） */
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

/** scroll（数据处理） */
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

/** evaluate（数据处理） */
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
function stringifySkillOutput(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  return JSON.stringify(result ?? '');
}
