/**
 * @fileoverview GraphDBProvider 领域层类型定义。
 *
 * 依据 `GraphDBProvider-PRD.md` 定义 GraphContext、GraphNodeData、GraphEdgeData
 * 及各功能的 Input / Output 类型。
 * 所有 Input 继承 {@link Input}，所有 Context 继承 {@link Context}，所有 Output 继承 {@link Output}。
 *
 * 公共查询对象（Condition / OrderBy / Page / DataObject）定义于 shared/query，此处不重复定义。
 */

import { Input, Context, Output } from '../../shared/base';
import { VisualScope } from '../../shared/query';
import type { Condition, OrderBy, Page } from '../../shared/query';

/**
 * 图上下文（GraphContext）。
 *
 * 继承 Context 基类，图数据相关操作的执行上下文。
 */
export class GraphContext extends Context {}

/**
 * 查询目标枚举。
 *
 * selectGraph 方法的 target 参数取值，指定查询节点或边。
 */
export enum GraphTarget {
  /** 查询节点 */
  NODE = 'node',
  /** 查询边 */
  EDGE = 'edge',
}

/**
 * 图遍历方向枚举。
 *
 * getGraphNeighbors 方法的 direction 参数取值，指定遍历方向。
 */
export enum GraphDirection {
  /** 出边（从当前节点出发的边） */
  OUT = 'OUT',
  /** 入边（指向当前节点的边） */
  IN = 'IN',
  /** 双向（出边 + 入边，默认） */
  BOTH = 'BOTH',
}

/**
 * 节点数据对象（GraphNodeData）。
 *
 * 用于新增节点；更新时使用 Partial<GraphNodeData> 仅传入待更新字段。
 * id / created / updated 为系统字段，由 Provider 维护，不通过 Data 对象传入。
 */
export interface GraphNodeData {
  /** 节点类型 */
  node_type: string;
  /** 节点内容（JSON 对象，存储时序列化为字符串） */
  content: Record<string, unknown>;
}

/**
 * 边数据对象（GraphEdgeData）。
 *
 * 用于新增边；更新时使用 Partial<GraphEdgeData> 仅传入待更新字段。
 * id / created / updated / last_activation_time / is_active 为系统字段，由 Provider 维护，
 * 不通过 Data 对象修改。
 *
 * from_node_id / to_node_id 仅在新增边时必填，用于指定关系端点。
 */
export interface GraphEdgeData {
  /** 起始节点 ID（仅新增时必填，用于指定关系端点） */
  from_node_id: string;
  /** 目标节点 ID（仅新增时必填，用于指定关系端点） */
  to_node_id: string;
  /** 边类型 */
  edge_type: string;
  /** 权重，未指定时取配置 default_weight（默认 1.0） */
  weight?: number;
  /** 边属性（JSON 对象，存储时序列化为字符串） */
  properties?: Record<string, unknown>;
}

/**
 * 图节点记录（GraphNodeRecord）。
 *
 * 从图数据库读取的节点完整记录（含系统字段）。
 */
export interface GraphNodeRecord {
  /** 节点 ID */
  id: string;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
  /** 节点类型 */
  node_type: string;
  /** 节点内容（已从 JSON 字符串反序列化） */
  content: Record<string, unknown>;
}

/**
 * 图边记录（GraphEdgeRecord）。
 *
 * 从图数据库读取的边完整记录（含系统字段与端点信息）。
 */
export interface GraphEdgeRecord {
  /** 边 ID */
  id: string;
  /** 创建时间（毫秒时间戳） */
  created: number;
  /** 最后更新时间（毫秒时间戳） */
  updated: number;
  /** 起始节点 ID */
  from_node_id: string;
  /** 目标节点 ID */
  to_node_id: string;
  /** 边类型 */
  edge_type: string;
  /** 权重 */
  weight: number;
  /** 边属性（已从 JSON 字符串反序列化，无属性为 null） */
  properties: Record<string, unknown> | null;
  /** 最后激活时间（毫秒时间戳，未激活为 null） */
  last_activation_time: number | null;
  /** 是否激活 */
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// addGraphNode
// ---------------------------------------------------------------------------

/** addGraphNode 入参 */
export class AddGraphNodeInput extends Input {
  /** 节点数据 */
  data!: GraphNodeData;
}

/** addGraphNode 出参 */
export class AddGraphNodeOutput extends Output {
  /** 节点 ID（幂等新增时返回已存在节点的 ID） */
  id = '';
}

// ---------------------------------------------------------------------------
// getGraphNode
// ---------------------------------------------------------------------------

/** getGraphNode 入参 */
export class GetGraphNodeInput extends Input {
  /** 节点 ID */
  id!: string;
}

/** getGraphNode 出参 */
export class GetGraphNodeOutput extends Output {
  /** 节点信息，无匹配为 null */
  node: GraphNodeRecord | null = null;
}

// ---------------------------------------------------------------------------
// updateGraphNode
// ---------------------------------------------------------------------------

/** updateGraphNode 入参 */
export class UpdateGraphNodeInput extends Input {
  /** 节点 ID */
  id!: string;
  /** 待更新的字段（node_type、content，系统字段不可更新） */
  data!: Partial<GraphNodeData>;
}

/** updateGraphNode 出参 */
export class UpdateGraphNodeOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// delGraphNode
// ---------------------------------------------------------------------------

/** delGraphNode 入参 */
export class DelGraphNodeInput extends Input {
  /** 节点 ID 列表（支持批量） */
  ids!: string[];
}

/** delGraphNode 出参 */
export class DelGraphNodeOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// addGraphEdge
// ---------------------------------------------------------------------------

/** addGraphEdge 入参 */
export class AddGraphEdgeInput extends Input {
  /** 边数据 */
  data!: GraphEdgeData;
}

/** addGraphEdge 出参 */
export class AddGraphEdgeOutput extends Output {
  /** 新增的边 ID */
  id = '';
}

// ---------------------------------------------------------------------------
// getGraphEdge
// ---------------------------------------------------------------------------

/** getGraphEdge 入参 */
export class GetGraphEdgeInput extends Input {
  /** 边 ID */
  id!: string;
}

/** getGraphEdge 出参 */
export class GetGraphEdgeOutput extends Output {
  /** 边信息，无匹配为 null */
  edge: GraphEdgeRecord | null = null;
}

// ---------------------------------------------------------------------------
// updateGraphEdge
// ---------------------------------------------------------------------------

/** updateGraphEdge 入参 */
export class UpdateGraphEdgeInput extends Input {
  /** 边 ID */
  id!: string;
  /** 待更新的字段 */
  data!: Partial<GraphEdgeData>;
}

/** updateGraphEdge 出参 */
export class UpdateGraphEdgeOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// delGraphEdge
// ---------------------------------------------------------------------------

/** delGraphEdge 入参 */
export class DelGraphEdgeInput extends Input {
  /** 边 ID 列表（支持批量） */
  ids!: string[];
}

/** delGraphEdge 出参 */
export class DelGraphEdgeOutput extends Output {
  /** 影响行数 */
  affected_rows = 0;
}

// ---------------------------------------------------------------------------
// selectGraph
// ---------------------------------------------------------------------------

/** selectGraph 入参 */
export class SelectGraphInput extends Input {
  /** 查询目标：node / edge */
  target!: GraphTarget | string;
  /** 按节点类型过滤（target=node 时生效） */
  node_type?: string;
  /** 按边类型过滤（target=edge 时生效） */
  edge_type?: string;
  /** 查询条件，作用于目标对象的属性字段 */
  conditions?: Condition[];
  /** 排序字段列表 */
  order_by?: OrderBy[];
  /** 分页参数，不指定则不分页 */
  page?: Page;
}

/** selectGraph 出参 */
export class SelectGraphOutput extends Output {
  /** 查询结果列表（节点或边） */
  list: Array<GraphNodeRecord | GraphEdgeRecord> = [];
  /** 总记录数 */
  total = 0;
}

// ---------------------------------------------------------------------------
// getGraphNeighbors
// ---------------------------------------------------------------------------

/** getGraphNeighbors 入参 */
export class GetGraphNeighborsInput extends Input {
  /** 起始节点 ID */
  node_id!: string;
  /** 遍历深度，默认取配置 default_depth（默认 1） */
  depth?: number;
  /** 按边类型过滤 */
  edge_type?: string;
  /** 遍历方向：OUT / IN / BOTH（默认 BOTH） */
  direction?: GraphDirection | string;
  /** 是否仅遍历激活状态的边，默认取配置 default_only_active（默认 true） */
  only_active?: boolean;
}

/** getGraphNeighbors 出参 */
export class GetGraphNeighborsOutput extends Output {
  /** 邻居节点列表（不含起始节点） */
  list: GraphNodeRecord[] = [];
}

// ---------------------------------------------------------------------------
// activateGraphEdge
// ---------------------------------------------------------------------------

/** activateGraphEdge 入参 */
export class ActivateGraphEdgeInput extends Input {
  /** 边 ID */
  edge_id!: string;
  /** 触发类型，未指定时取配置 default_trigger_type（默认 user_query） */
  trigger_type?: string;
}

/** activateGraphEdge 出参 */
export class ActivateGraphEdgeOutput extends Output {}

// ---------------------------------------------------------------------------
// ageGraphEdge
// ---------------------------------------------------------------------------

/** ageGraphEdge 入参（无额外参数，老化阈值从配置表读取） */
export class AgeGraphEdgeInput extends Input {}

/** ageGraphEdge 出参 */
export class AgeGraphEdgeOutput extends Output {
  /** 老化的边数量 */
  aged_count = 0;
}

// ---------------------------------------------------------------------------
// visualizedGraph
// ---------------------------------------------------------------------------

/** visualizedGraph 入参 */
export class VisualizedGraphInput extends Input {
  /** 可视化范围：health / volume / diskUsage */
  scope!: VisualScope | string;
}

/** visualizedGraph 出参 */
export class VisualizedGraphOutput extends Output {
  /** 可视化数据 */
  data: Record<string, unknown> = {};
}

// ---------------------------------------------------------------------------
// enableGraphDB
// ---------------------------------------------------------------------------

/** enableGraphDB 入参 */
export class EnableGraphDBInput extends Input {
  /** 是否启用 */
  enable!: boolean;
}

/** enableGraphDB 出参 */
export class EnableGraphDBOutput extends Output {}

// ---------------------------------------------------------------------------
// closeGraphDB
// ---------------------------------------------------------------------------

/** closeGraphDB 入参（无额外参数） */
export class CloseGraphDBInput extends Input {}

/** closeGraphDB 出参 */
export class CloseGraphDBOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

/** 图节点表名 */
export const GRAPH_NODE_TABLE = 'graph_node';

/** 图边表名 */
export const GRAPH_ACTIVATION_EVENT_TABLE = 'graph_activation_event';

/** 图边表名 */
export const GRAPH_EDGE_TABLE = 'graph_edge';

/** 按天激活统计表名 */
export const GRAPH_EDGE_DAILY_ACTIVATION_TABLE = 'graph_edge_daily_activation';

/** GraphDBProvider 配置表名（存储于关系数据库） */
export const GRAPHDB_CONFIG_TABLE = 'graphdb_config';

/**
 * GraphDBProvider 配置表默认配置项。
 *
 * PRD 4.5 节。
 */
export const GRAPHDB_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: '图数据库是否启用（enableGraphDB 读写）',
  },
  {
    config_key: 'retention_days',
    config_value: '30',
    value_type: 'INT',
    description: '激活统计保留天数（老化观察窗口）',
  },
  {
    config_key: 'min_activation_count',
    config_value: '5',
    value_type: 'INT',
    description: '窗口内最小激活次数阈值',
  },
  {
    config_key: 'default_trigger_type',
    config_value: 'user_query',
    value_type: 'STRING',
    description: '默认触发类型',
  },
  {
    config_key: 'default_weight',
    config_value: '1.0',
    value_type: 'DOUBLE',
    description: '默认边权重',
  },
  {
    config_key: 'default_depth',
    config_value: '1',
    value_type: 'INT',
    description: '默认遍历深度',
  },
  {
    config_key: 'default_only_active',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: '默认仅遍历激活边',
  },
  {
    config_key: 'decay_slope',
    config_value: '0.06',
    value_type: 'DOUBLE',
    description: '逆比例衰减系数 α（A_vw 公式第一项，控制 recency 衰减速度）',
  },
  {
    config_key: 'total_bonus',
    config_value: '0.4',
    value_type: 'DOUBLE',
    description: '对数补偿系数 β（A_vw 公式第二项，对长期低频边的补偿）',
  },
  {
    config_key: 'hop_decay_factor',
    config_value: '0.8',
    value_type: 'DOUBLE',
    description: '跳衰减因子 γ（每多 1 跳权重乘以 γ）',
  },
  {
    config_key: 'fan_out_threshold',
    config_value: '500',
    value_type: 'INT',
    description: '扇出阈值 θ（节点出度超过此值触发熔断截断）',
  },
] as const;
