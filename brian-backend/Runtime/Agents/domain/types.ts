/**
 * @fileoverview Agents 模块领域层类型定义（Runtime v2 · 阶段3 前置）。
 *
 * 依据 `docs/_3_BackendDesign/_07_Runtime/Agents/Agents-PRD.md`：
 * 声明式 Agent = 纯数据（prompt/model/tools/permissions/budget）；
 * 组件匹配确定性（exact → signature 相似度 → LLM 打分 → 构建，**无随机重建**）；
 * 快照组件（soul/skills/mcps）**按当前任务经 Core match 动态重解析**，
 * 不沿用历史 agent 记录的组件绑定（根治"通用问答 Agent 绑定编码研究 Soul"类错配）。
 */

import { Input, Context, Output } from '@brian-agent/base';

/**
 * AgentDef 上下文（AgentDefContext）。
 */
export class AgentDefContext extends Context {}

// ---------------------------------------------------------------------------
// 数据对象
// ---------------------------------------------------------------------------

/** 声明式 Agent 定义记录 */
export interface AgentDefRecord {
  id: string;
  name: string;
  mode: 'primary' | 'subagent' | 'all';
  /** 旧 agent 表引用（组件构建/老化复用既有资产；空串=纯声明） */
  agent_ref: string;
  /** 任务签名（`[domain] 前256字`，exact/相似匹配依据） */
  task_signature: string;
  /** 用途描述（LLM 打分展示；缺省取签名） */
  agent_purpose: string;
  /** 提示模板 ID（空串=builtin.identity 兜底） */
  prompt_template_id: string;
  /** 模型 ID（空串=快照时动态 matchLLM） */
  model_id: string;
  /** Soul ID（空串=快照时按任务动态 matchSoul；**不沿用 agent_soul 历史绑定**） */
  soul_id: string;
  /** 工具可见性（JSON：{skills?:string[], mcps?:string[]}，空=快照时动态 match） */
  tools_json: string;
  /** 采样温度 */
  temperature?: number;
  /** 默认预算 total */
  budget_total: number;
  /** 状态 */
  status: 'active' | 'disabled';
  created: number;
  updated: number;
}

/** 快照内解析出的可用工具条目（注入 system 工具清单段） */
export interface SnapshotToolEntry {
  kind: 'skill' | 'mcp';
  id: string;
  brief: string;
}

/** 会话级原子快照（Loop 执行所需；快照内不做随机） */
export interface AgentSnapshot {
  def_id: string;
  name: string;
  /** 系统提示（identity 段在前 + soul 段 + 任务/工具清单段） */
  system: string;
  /** LLM ID（快照内确定；空串交由 execLLMEvents 默认降级队列） */
  llm_id: string;
  temperature?: number;
  budget_total: number;
  /** 快照解析出的工具清单（注入 system；执行工具仍为 skill_exec/mcp_exec） */
  tools: SnapshotToolEntry[];
  /** 快照组件溯源（调试/投影用） */
  meta: { soul_id?: string; llm_id?: string; matched_by?: string };
}

// ---------------------------------------------------------------------------
// matchAgentDef
// ---------------------------------------------------------------------------

/** matchAgentDef 入参 */
export class MatchAgentDefInput extends Input {
  /** 任务内容（签名/相似度/构建依据） */
  task_content!: string;
  /** 任务领域（可选；进入签名 `[domain]` 段） */
  task_domain?: string;
  /** 交互 ID（组件 match / 构建透传） */
  interact_id?: string;
  /** 上下文 ID（组件 match 透传） */
  context_id?: string;
  /** 强制新建（跳过复用层） */
  force_new?: boolean;
}

/** matchAgentDef 出参 */
export class MatchAgentDefOutput extends Output {
  /** 命中的声明定义 ID */
  def_id!: string;
  /** 命中层：exact | signature | llm | built */
  matched_by!: 'exact' | 'signature' | 'llm' | 'built';
  /** 定义记录 */
  def!: AgentDefRecord;
}

// ---------------------------------------------------------------------------
// soAgentSnapshot
// ---------------------------------------------------------------------------

/** soAgentSnapshot 入参 */
export class SoAgentSnapshotInput extends Input {
  /** 定义 ID（matchAgentDef 输出） */
  def_id!: string;
  /** 当前任务内容（组件按此重解析） */
  task_content!: string;
  /** 任务领域（可选） */
  task_domain?: string;
  /** 交互 ID（组件 match 透传） */
  interact_id?: string;
  /** 上下文 ID */
  context_id?: string;
  /** 用户消息（任务指令段引用） */
  user_message?: string;
}

/** soAgentSnapshot 出参 */
export class SoAgentSnapshotOutput extends Output {
  /** 会话级原子快照 */
  snapshot!: AgentSnapshot;
}

// ---------------------------------------------------------------------------
// declareAgent / soAgentDefs / configAgentDef
// ---------------------------------------------------------------------------

/** declareAgent 入参（幂等 upsert by name） */
export class DeclareAgentInput extends Input {
  /** 唯一引用名 */
  name!: string;
  /** 模式 */
  mode!: 'primary' | 'subagent' | 'all';
  /** 旧 agent 表引用（可选） */
  agent_ref?: string;
  /** 任务签名（可选；声明型代理可空） */
  task_signature?: string;
  /** 用途描述（可选；LLM 打分展示） */
  agent_purpose?: string;
  /** 提示模板 ID（空串=builtin.identity） */
  prompt_template_id?: string;
  /** 模型 ID（空串=动态匹配） */
  model_id?: string;
  /** Soul ID（空串=按任务动态匹配） */
  soul_id?: string;
  /** 工具可见性 JSON */
  tools_json?: string;
  /** 采样温度 */
  temperature?: number;
  /** 默认预算 total */
  budget_total?: number;
  /** 状态 */
  status?: 'active' | 'disabled';
}

/** declareAgent 出参 */
export class DeclareAgentOutput extends Output {
  /** 定义 ID */
  def_id!: string;
}

/** soAgentDefs 入参 */
export class SoAgentDefsInput extends Input {}

/** soAgentDefs 出参 */
export class SoAgentDefsOutput extends Output {
  /** 定义列表 */
  defs: AgentDefRecord[] = [];
}

/** configAgentDef 入参 */
export class ConfigAgentDefInput extends Input {
  /** 签名相似度阈值（缺省 0.7） */
  match_similarity_threshold?: number;
}

/** configAgentDef 出参 */
export class ConfigAgentDefOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名
// ---------------------------------------------------------------------------

/** runtime_agent_def 表名 */
export const RUNTIME_AGENT_DEF_TABLE = 'runtime_agent_def';

/** runtime_agents_config 配置表名 */
export const RUNTIME_AGENTS_CONFIG_TABLE = 'runtime_agents_config';
