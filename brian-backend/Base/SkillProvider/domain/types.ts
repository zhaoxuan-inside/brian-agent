/**
 * @fileoverview SkillProvider 领域层类型定义。
 *
 * 依据 `SkillProvider-PRD.md` 定义 SkillContext、SkillData 及各功能的 Input / Output 类型。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 */

import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

/**
 * Skill 上下文（SkillContext）。
 *
 * 继承 Context 基类，Skill 相关操作的执行上下文。
 */
export class SkillContext extends Context {}

/**
 * Skill 数据对象（SkillData）。
 *
 * 用于新增 Skill；更新时使用 Partial<SkillData> 仅传入待更新字段。
 * id / created / updated 为系统字段，由 Provider 维护，不通过 Data 对象传入。
 *
 * Skill 由五部分组成：
 * - skill_brief：元数据，表明应用场景（必需）；
 * - work：操作指南，指明如何完成指定应用场景的工作（必需）；
 * - scripts：脚本存放路径（可选）；
 * - references：深度参考资料存放路径（可选）；
 * - assets：静态资源存放路径（可选）。
 */
export interface SkillData {
  /** Skill 元数据（应用场景） */
  skill_brief: string;
  /** Skill 操作指南 */
  work: string;
  /** 脚本存放路径 */
  scripts?: string;
  /** 深度参考资料存放路径 */
  references?: string;
  /** 静态资源存放路径 */
  assets?: string;
  /** 是否启用，默认 true；资源级启用/禁用通过 updateSkill 修改该字段实现 */
  enable?: boolean;
}

/**
 * skill 表记录（含系统字段）。
 */
export interface SkillRecord extends SkillData {
  /** 数据唯一标识（UUID） */
  id: string;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
  /** 是否启用 */
  enable: boolean;
}

// ---------------------------------------------------------------------------
// addSkill
// ---------------------------------------------------------------------------

/** addSkill 入参 */
export class AddSkillInput extends Input {
  /** Skill 数据 */
  data!: SkillData;
}

/** addSkill 出参 */
export class AddSkillOutput extends Output {
  /** 新增的 Skill ID */
  id = '';
}

// ---------------------------------------------------------------------------
// getSkill
// ---------------------------------------------------------------------------

/** getSkill 入参 */
export class GetSkillInput extends Input {
  /** 按 ID 获取 */
  id?: string;
  /** 按条件获取第一条 */
  conditions?: Condition[];
}

/** getSkill 出参 */
export class GetSkillOutput extends Output {
  /** Skill 信息，无匹配为 null */
  skill: SkillRecord | null = null;
}

// ---------------------------------------------------------------------------
// updateSkill
// ---------------------------------------------------------------------------

/** updateSkill 入参 */
export class UpdateSkillInput extends Input {
  /** 按 ID 更新 */
  id?: string;
  /** 按条件更新 */
  conditions?: Condition[];
  /** 待更新的字段 */
  data!: Partial<SkillData>;
}

/** updateSkill 出参 */
export class UpdateSkillOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// delSkill
// ---------------------------------------------------------------------------

/** delSkill 入参 */
export class DelSkillInput extends Input {
  /** 按 ID 删除（支持批量） */
  ids?: string[];
  /** 按条件删除 */
  conditions?: Condition[];
}

/** delSkill 出参 */
export class DelSkillOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// soSkill
// ---------------------------------------------------------------------------

/** soSkill 入参 */
export class SoSkillInput extends Input {
  /** 关键词搜索（匹配 skill_brief） */
  keyword?: string;
  /** 条件过滤 */
  conditions?: Condition[];
  /** 排序规则 */
  order_by?: OrderBy[];
  /** 分页参数 */
  page?: Page;
}

/** soSkill 出参 */
export class SoSkillOutput extends Output {
  /** Skill 列表 */
  list: SkillRecord[] = [];
  /** 总数 */
  total = 0;
}

// ---------------------------------------------------------------------------
// execSkill
// ---------------------------------------------------------------------------

/** execSkill 入参 */
export class ExecSkillInput extends Input {
  /** Skill ID */
  id!: string;
  /** Skill 执行所需的参数（JSON） */
  params!: Record<string, unknown>;
}

/** execSkill 出参 */
export class ExecSkillOutput extends Output {
  /** 执行结果 */
  result: unknown = null;
}

// ---------------------------------------------------------------------------
// enableSkill
// ---------------------------------------------------------------------------

/** enableSkill 入参 */
export class EnableSkillInput extends Input {
  /** 是否启用 */
  enable!: boolean;
}

/** enableSkill 出参 */
export class EnableSkillOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

/** skill 表名 */
export const SKILL_TABLE = 'skill';

/** skill_usage 表名 */
export const SKILL_USAGE_TABLE = 'skill_usage';

/** skill_config 配置表名 */
export const SKILL_CONFIG_TABLE = 'skill_config';

/**
 * SkillProvider 配置表默认配置项。
 *
 * PRD 4.3 节。
 */
export const SKILL_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: 'Skill 组件是否启用（enableSkill 读写）',
  },
] as const;
