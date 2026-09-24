/**
 * @fileoverview Tools 模块领域层类型定义（Runtime v2 · 阶段2）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Tools/Tools-PRD.md` §2/§3：
 * 工具 = 代码 + zod schema（用户决策：新增依赖 zod）；编排原语工具化。
 * 校验/权限错误以**配对工具结果**回流模型（append-only 结构不变量），禁止静默吞错。
 */

import { Input, Context, Output } from '@brian-agent/base';
import type { Metrics, Report } from '@brian-agent/base';
import type { z } from 'zod';

/**
 * Tool 上下文（SkillRuntimeContext）。
 */
export class SkillRuntimeContext extends Context {}

// ---------------------------------------------------------------------------
// 枚举（有限值域唯一注册点）
// ---------------------------------------------------------------------------

/** 工具执行结果状态（配对语义：每个 toolCall 必有 result） */
export enum SkillResultStatus {
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
export interface SkillResult {
  /** 结果状态 */
  status: SkillResultStatus;
  /** 结果文本（截断后；模型可见） */
  output: string;
  /** 执行耗时（毫秒） */
  elapsed_ms?: number;
}

/** 组件选择范围（match 阶段选定；选/执分离：执行只允许调用范围内已绑定的 id） */
export interface ComponentScope {
  /** match 阶段选定的 Skill id 清单 */
  skills: string[];
  /** match 阶段选定的 MCP id 清单 */
  mcps: string[];
}

/** 工具执行上下文（经 SkillRuntimeContext 注入 run/会话定位与取消信号） */
export interface SkillExecutionContext {
  /** 引用 runtime_run.id */
  run_id?: string;
  /** 外部会话标识 */
  session_key?: string;
  /** 取消信号（真取消贯穿工具执行） */
  signal?: AbortSignal;
  /** 业务事件出口（工具经此上报业务事件，如 plan.updated；由 Loop 接 Report→StreamProvider） */
  emitEvent?: (type: string, payload: unknown) => void;
  /** 组件选择范围（本 run 选定的 Skill/MCP id；缺省=未绑定任何组件，skill_exec/mcp_exec 拒执行） */
  component_scope?: ComponentScope;
  /** 问答全流程衡量对象（用于耗时统计与日志追踪） */
  metrics?: Metrics;
  /** 问答全流程上报对象 */
  report?: Report;
}

/**
 * 工具定义（zod schema 强类型）。
 */
export interface SkillDef<P> {
  /** 工具标识（唯一；内置 id 不可被覆盖） */
  id: string;
  /** 工具描述（模型据此决策） */
  description: string;
  /** 参数 zod schema（经 zodToJSONSchema 转换为 LLM function.parameters） */
  parameters: z.ZodType<P>;
  /** 结果截断上限（默认 8000 字符） */
  max_output?: number;
  /** 执行体 */
  execute(args: P, ctx: SkillExecutionContext): Promise<SkillResult>;
}

/** 去参数化的工具定义（registry 存储形态；execute 收 parsed unknown） */
export interface AnySkillDef {
  id: string;
  description: string;
  parameters: z.ZodType<unknown>;
  max_output?: number;
  execute(args: unknown, ctx: SkillExecutionContext): Promise<SkillResult>;
}

/** LLM 可见工具规格（soSkills 输出；function 格式） */
export interface SkillSpecJson {
  id: string;
  description: string;
  /** JSON Schema（由 zodToJSONSchema 转换） */
  parameters: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// registerSkill
// ---------------------------------------------------------------------------

/** registerSkill 入参 */
export class RegisterSkillInput extends Input {
  /** 工具定义 */
  def!: AnySkillDef;
}

/** registerSkill 出参 */
export class RegisterSkillOutput extends Output {}

// ---------------------------------------------------------------------------
// execSkill
// ---------------------------------------------------------------------------

/** execSkill 入参 */
export class ExecSkillInput extends Input {
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
  /** 组件选择范围（本 run 选定的 Skill/MCP id；执行门依据） */
  component_scope?: ComponentScope;
}

/** execSkill 出参（配对结果） */
export class ExecSkillOutput extends Output {
  /** 配对工具结果（ok/error/denied 均为模型可读回流，不抛错） */
  result!: SkillResult;
}

// ---------------------------------------------------------------------------
// soSkills
// ---------------------------------------------------------------------------

/** soSkills 入参 */
export class SoSkillsInput extends Input {
  /** 可见技能 id 列表（空=全部已注册；2026-09-24 概念退役更名） */
  skill_ids?: string[];
  /** 运行标识（run 级 Skill 一等工具规格合并依据；2026-09-24 Tool ⊕ Skill 合并） */
  run_id?: string;
}

/** soSkills 出参 */
export class SoSkillsOutput extends Output {
  /** LLM 可见工具规格 */
  specs: SkillSpecJson[] = [];
}

// ---------------------------------------------------------------------------
// registerBuiltinSkills / configTool
// ---------------------------------------------------------------------------

/** registerBuiltinSkills 入参（幂等；内置工具经注入的 Provider 执行） */
// ===== 2026-09-24 新增（Tool ⊕ Skill 合并）：run 级 Skill 一等工具注册 =====
/** registerRunSkills 入参（绑定的 Skill 直接转为一等工具进了 wire 工具清单） */
export class RegisterRunSkillsInput extends Input {
  /** 引用 runtime_run.id（run 作用域注册，Loop 结束清理） */
  run_id!: string;
  /** 本次 run 绑定的 Skill id（agent.skill_ids_json 就地执行匹配） */
  skill_ids: string[] = [];
}

/** registerRunSkills 出参 */
export class RegisterSkillsOutput extends Output {
  /** 注册成功的工具 id 列表（= skill_<id>） */
  registered: string[] = [];
}

/** clearRunSkills 入参（Loop settle 调用） */
export class ClearRunSkillsInput extends Input {
  run_id!: string;
}

export class RegisterBuiltinSkillsInput extends Input {
  /** 启用的内置工具（缺省全部：skill_exec/mcp_exec/cdt_browser/update_plan/delegate/ask_user） */
  enabled?: string[];
}

/** registerBuiltinSkills 出参 */
export class RegisterBuiltinSkillsOutput extends Output {
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
