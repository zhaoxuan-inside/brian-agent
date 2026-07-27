/**
 * @fileoverview SoulProvider 领域层类型定义。
 *
 * 依据 `SoulProvider-PRD.md` 定义 SoulContext、SoulData 及各功能的 Input / Output 类型。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

/**
 * Soul 上下文（SoulContext）。
 *
 * 继承 Context 基类，Soul 相关操作的执行上下文。
 */
export class SoulContext extends Context {}

/**
 * Soul 数据对象（SoulData）。
 *
 * 用于新增 Soul；更新时使用 Partial<SoulData> 仅传入待更新字段。
 * id / created / updated 为系统字段，由 Provider 维护，不通过 Data 对象传入。
 */
export interface SoulData {
  /** Soul 内容 */
  soul_content: string;
  /** Soul 功能摘要 */
  soul_brief: string;
  /** Soul 应用场景 */
  soul_usage: string;
  /** 是否启用，默认 true；资源级启用/禁用通过 updateSoul 修改该字段实现 */
  enable?: boolean;
}

/**
 * soul 表记录（含系统字段）。
 */
export interface SoulRecord extends SoulData {
  id: string;
  created: number;
  updated: number;
  enable: boolean;
}

// ---------------------------------------------------------------------------
// addSoul
// ---------------------------------------------------------------------------

/** addSoul 入参 */
export class AddSoulInput extends Input {
  /** Soul 数据 */
  data!: SoulData;
}

/** addSoul 出参 */
export class AddSoulOutput extends Output {
  /** 新增的 Soul ID */
  id = '';
}

// ---------------------------------------------------------------------------
// delSoul
// ---------------------------------------------------------------------------

/** delSoul 入参 */
export class DelSoulInput extends Input {
  /** 按 ID 删除（支持批量） */
  ids?: string[];
  /** 按条件删除 */
  conditions?: Condition[];
}

/** delSoul 出参 */
export class DelSoulOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// updateSoul
// ---------------------------------------------------------------------------

/** updateSoul 入参 */
export class UpdateSoulInput extends Input {
  /** 按 ID 更新 */
  id?: string;
  /** 按条件更新 */
  conditions?: Condition[];
  /** 待更新的字段 */
  data!: Partial<SoulData>;
}

/** updateSoul 出参 */
export class UpdateSoulOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// getSoul
// ---------------------------------------------------------------------------

/** getSoul 入参 */
export class GetSoulInput extends Input {
  /** 按 ID 获取 */
  id?: string;
  /** 按条件获取第一条 */
  conditions?: Condition[];
}

/** getSoul 出参 */
export class GetSoulOutput extends Output {
  /** Soul 信息，无匹配为 null */
  soul: SoulRecord | null = null;
}

// ---------------------------------------------------------------------------
// soSoul
// ---------------------------------------------------------------------------

/** soSoul 入参 */
export class SoSoulInput extends Input {
  /** 关键词搜索（匹配 soul_content、soul_brief） */
  keyword?: string;
  /** 条件过滤 */
  conditions?: Condition[];
  /** 排序规则 */
  order_by?: OrderBy[];
  /** 分页参数 */
  page?: Page;
}

/** soSoul 出参 */
export class SoSoulOutput extends Output {
  /** Soul 列表 */
  list: SoulRecord[] = [];
  /** 总数 */
  total = 0;
}

// ---------------------------------------------------------------------------
// enableSoul
// ---------------------------------------------------------------------------

/** enableSoul 入参 */
export class EnableSoulInput extends Input {
  /** 是否启用 */
  enable!: boolean;
}

/** enableSoul 出参 */
export class EnableSoulOutput extends Output {}

// ---------------------------------------------------------------------------
// closeSoul
// ---------------------------------------------------------------------------

/** closeSoul 入参 */
export class CloseSoulInput extends Input {}

/** closeSoul 出参 */
export class CloseSoulOutput extends Output {}

// ---------------------------------------------------------------------------
// recordSoulUsage
// ---------------------------------------------------------------------------

/** recordSoulUsage 入参 */
export class RecordSoulUsageInput extends Input {
  /** Soul ID */
  soul_id!: string;
}

/** recordSoulUsage 出参 */
export class RecordSoulUsageOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

/** soul 表名 */
export const SOUL_TABLE = 'soul';

/** soul_usage 表名 */
export const SOUL_USAGE_TABLE = 'soul_usage';

/** soul_config 配置表名 */
export const SOUL_CONFIG_TABLE = 'soul_config';

/**
 * SoulProvider 配置表默认配置项。
 *
 * PRD 4.3 节。
 */
export const SOUL_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: 'Soul 组件是否启用（enableSoul 读写）',
  },
] as const;
