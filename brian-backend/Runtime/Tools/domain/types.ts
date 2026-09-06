/**
 * @fileoverview Tools 模块领域层类型定义（Runtime v2 · 阶段2）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Tools/Tools-PRD.md` §2/§3：
 * 工具 = 代码 + zod schema（用户决策：新增依赖 zod）；编排原语工具化。
 * 校验/权限错误以**配对工具结果**回流模型（append-only 结构不变量），禁止静默吞错。
 */

import { Input, Context, Output } from '@brian-agent/base';
import type { z } from 'zod';

/**
 * Tool 上下文（ToolContext）。
 */
export class ToolContext extends Context {}

// ---------------------------------------------------------------------------
// 枚举（有限值域唯一注册点）
// ---------------------------------------------------------------------------

/** 工具执行结果状态（配对语义：每个 toolCall 必有 result） */
export enum ToolResultStatus {
  Ok = 'ok',
  /** 校验失败/执行失败（模型可读回流，不抛错） */
  Error = 'error',
  /** 权限拒绝（阶段3 权限门接入） */
  Denied = 'denied',
}

// ---------------------------------------------------------------------------
// 工具定义契约
// ---------------------------------------------------------------------------

/** 工具执行结果（配对语义：每个 toolCall 必有 result） */
export interface ToolResult {
  /** 结果状态 */
  status: ToolResultStatus;
  /** 结果文本（截断后；模型可见） */
  output: string;
  /** 执行耗时（毫秒） */
  elapsed_ms?: number;
}

/** 工具执行上下文（经 ToolContext 注入 run/会话定位与取消信号） */
export interface ToolExecutionContext {
  /** 引用 runtime_run.id */
  run_id?: string;
  /** 外部会话标识 */
  session_key?: string;
  /** 取消信号（真取消贯穿工具执行） */
  signal?: AbortSignal;
  /** 业务事件出口（工具经此上报业务事件，如 plan.updated；由 Loop 接 Report→StreamProvider） */
  emitEvent?: (type: string, payload: unknown) => void;
}

/**
 * 工具定义（zod schema 强类型）。
 */
export interface ToolDef<P> {
  /** 工具标识（唯一；内置 id 不可被覆盖） */
  id: string;
  /** 工具描述（模型据此决策） */
  description: string;
  /** 参数 zod schema（经 zodToJSONSchema 转换为 LLM function.parameters） */
  parameters: z.ZodType<P>;
  /** 结果截断上限（默认 8000 字符） */
  max_output?: number;
  /** 执行体 */
  execute(args: P, ctx: ToolExecutionContext): Promise<ToolResult>;
}

/** 去参数化的工具定义（registry 存储形态；execute 收 parsed unknown） */
export interface AnyToolDef {
  id: string;
  description: string;
  parameters: z.ZodType<unknown>;
  max_output?: number;
  execute(args: unknown, ctx: ToolExecutionContext): Promise<ToolResult>;
}

/** LLM 可见工具规格（soTools 输出；function 格式） */
export interface ToolSpecJson {
  id: string;
  description: string;
  /** JSON Schema（由 zodToJSONSchema 转换） */
  parameters: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// registerTool
// ---------------------------------------------------------------------------

/** registerTool 入参 */
export class RegisterToolInput extends Input {
  /** 工具定义 */
  def!: AnyToolDef;
}

/** registerTool 出参 */
export class RegisterToolOutput extends Output {}

// ---------------------------------------------------------------------------
// execTool
// ---------------------------------------------------------------------------

/** execTool 入参 */
export class ExecToolInput extends Input {
  /** 工具标识 */
  tool_id!: string;
  /** 原始参数（JSON 字符串；模型侧 arguments 原文） */
  raw_args!: string;
  /** 引用 runtime_run.id */
  run_id?: string;
  /** 外部会话标识 */
  session_key?: string;
  /** 取消信号 */
  signal?: AbortSignal;
  /** 业务事件出口（Loop 接 Report→StreamProvider） */
  emitEvent?: (type: string, payload: unknown) => void;
}

/** execTool 出参（配对结果） */
export class ExecToolOutput extends Output {
  /** 配对工具结果（ok/error/denied 均为模型可读回流，不抛错） */
  result!: ToolResult;
}

// ---------------------------------------------------------------------------
// soTools
// ---------------------------------------------------------------------------

/** soTools 入参 */
export class SoToolsInput extends Input {
  /** 可见工具 id 列表（空=全部已注册） */
  tool_ids?: string[];
}

/** soTools 出参 */
export class SoToolsOutput extends Output {
  /** LLM 可见工具规格 */
  specs: ToolSpecJson[] = [];
}

// ---------------------------------------------------------------------------
// registerBuiltinTools / configTool
// ---------------------------------------------------------------------------

/** registerBuiltinTools 入参（幂等；内置工具经注入的 Provider 执行） */
export class RegisterBuiltinToolsInput extends Input {
  /** 启用的内置工具（缺省全部：skill_exec/mcp_exec/cdt_browser/update_plan/delegate） */
  enabled?: string[];
}

/** registerBuiltinTools 出参 */
export class RegisterBuiltinToolsOutput extends Output {
  /** 成功注册的内置工具 id */
  registered: string[] = [];
}

/** configTool 入参 */
export class ConfigToolInput extends Input {
  /** 默认结果截断上限（字符） */
  default_max_output?: number;
}

/** configTool 出参 */
export class ConfigToolOutput extends Output {}
