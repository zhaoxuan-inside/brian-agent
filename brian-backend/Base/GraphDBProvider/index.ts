/**
 * @fileoverview GraphDBProvider 模块统一导出。
 *
 * 对外暴露：
 * - access 层：GraphDBAccess（接入层，方法调用入口）
 * - domain 层：各 Input / Output / Context 类型、枚举、数据对象（供调用方构造参数）
 * - infrastructure 层：GraphDBSchemaInitializer（供高级用法直接使用）
 */

// access 层
export { GraphDBAccess } from './access/GraphDBAccess';

// domain 层类型
export {
  GraphContext,
  GraphTarget,
  GraphDirection,
  AddGraphNodeInput,
  AddGraphNodeOutput,
  GetGraphNodeInput,
  GetGraphNodeOutput,
  UpdateGraphNodeInput,
  UpdateGraphNodeOutput,
  DelGraphNodeInput,
  DelGraphNodeOutput,
  AddGraphEdgeInput,
  AddGraphEdgeOutput,
  GetGraphEdgeInput,
  GetGraphEdgeOutput,
  UpdateGraphEdgeInput,
  UpdateGraphEdgeOutput,
  DelGraphEdgeInput,
  DelGraphEdgeOutput,
  SelectGraphInput,
  SelectGraphOutput,
  GetGraphNeighborsInput,
  GetGraphNeighborsOutput,
  ActivateGraphEdgeInput,
  ActivateGraphEdgeOutput,
  AgeGraphEdgeInput,
  AgeGraphEdgeOutput,
  VisualizedGraphInput,
  VisualizedGraphOutput,
  EnableGraphDBInput,
  EnableGraphDBOutput,
  CloseGraphDBInput,
  CloseGraphDBOutput,
  GRAPH_NODE_TABLE,
  GRAPH_EDGE_TABLE,
  GRAPH_ACTIVATION_EVENT_TABLE,
  GRAPH_EDGE_DAILY_ACTIVATION_TABLE,
  GRAPHDB_CONFIG_TABLE,
  GRAPHDB_DEFAULT_CONFIGS,
} from './domain/types';

export type {
  GraphNodeData,
  GraphEdgeData,
  GraphNodeRecord,
  GraphEdgeRecord,
} from './domain/types';

// infrastructure 层
export { GraphDBSchemaInitializer } from './infrastructure/GraphDBSchemaInitializer';

// GraphDB 组件
export { GraphDBComponent } from '../components/GraphDB/GraphDBComponent';
export type { GraphDBComponentOptions } from '../components/GraphDB/GraphDBComponent';
