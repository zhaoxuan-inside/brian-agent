/**
 * @fileoverview GraphDBProvider 应用服务层。
 *
 * 依赖 GraphDBComponent（基于 SQLite + CTE 的图数据库组件）操作图数据（节点、边、遍历），
 * 通过 Cypher 查询语言（经 CypherTranslator 翻译为 SQL）执行所有图数据 CRUD。
 * 依赖 RelationDBAccess（通过 ConfigService）管理 graphdb_config 配置表。
 *
 * 图数据（节点、边、激活事件、按天激活统计）均存储于 SQLite 图数据库：
 * - graph_node：Node Table，存储图节点
 * - graph_edge：Rel Table，存储节点间的关系（边），端点由关系连接隐式表达
 * - graph_activation_event：Node Table，存储边激活事件
 * - graph_edge_daily_activation：Node Table，按天聚合存储边激活次数
 *
 * 实现所有用例：addGraphNode / getGraphNode / updateGraphNode / delGraphNode /
 * addGraphEdge / getGraphEdge / updateGraphEdge / delGraphEdge / selectGraph /
 * getGraphNeighbors / activateGraphEdge / ageGraphEdge / visualizedGraph /
 * enableGraphDB / closeGraphDB。
 *
 * 所有方法返回 Promise<boolean>，true 表示执行完成；
 * 实际数据通过 output 参数（引用传递）回传。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { GraphDBComponent } from '../../components/GraphDB/GraphDBComponent';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../shared/id/IdGenerator';
import { Operator, Logic } from '../../shared/query';
import type { Condition, OrderBy, Page } from '../../shared/query';
import {
  GraphContext,
  GraphNodeData,
  GraphEdgeData,
  GraphNodeRecord,
  GraphEdgeRecord,
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
} from '../domain/types';

/** 一天对应的毫秒数 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GraphDBProvider 应用服务。
 *
 * GraphDBProvider 是图数据的唯一操作入口，上层不可直接操作数据库。
 * 图数据存储于原生图数据库（由 GraphDBComponent 管理），
 * 配置项存储于关系数据库配置表（由 RelationDBAccess + ConfigService 管理）。
 */
export class GraphDBService {
  /** 运行时内存中的启用状态，供各操作快速校验 */
  private enabled = true;

  /** 是否已执行 closeGraphDB（终态标记） */
  private closed = false;

  private readonly config: ConfigService;

  /**
   * @param graphDb GraphDB 组件实例（原生图数据库，用于图数据操作）
   * @param relationDb RelationDBProvider 接入层（仅用于配置表）
   */
  constructor(
    private readonly graphDb: GraphDBComponent,
    private readonly relationDb: RelationDBAccess,
  ) {
    this.config = new ConfigService(relationDb, GRAPHDB_CONFIG_TABLE);
  }

  // -------------------------------------------------------------------------
  // 初始化
  // -------------------------------------------------------------------------

  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   *
   * PRD 3.5.2 注：组件初始化时从 graphdb_config 读取 enabled 状态以恢复上次的可用状态。
   */
  async initialize(): Promise<void> {
    await this.config.initDefaults([...GRAPHDB_DEFAULT_CONFIGS]);
    this.enabled = await this.config.getBoolean('enabled', true);
  }

  /**
   * 校验组件是否启用，未启用时抛出 ComponentDisabledError。
   */
  private ensureEnabled(): void {
    if (this.closed) {
      throw new DatabaseError(
        '图数据库已关闭（closeGraphDB 为终态操作），需重新初始化组件',
      );
    }
    if (!this.enabled) {
      throw new ComponentDisabledError('GraphDB');
    }
  }

  // -------------------------------------------------------------------------
  // 工具方法
  // -------------------------------------------------------------------------

  /**
   * 转义 Cypher 字符串字面量，防止注入。
   *
   * 将反斜杠替换为 \\，单引号替换为 \'。
   *
   * @param str 原始字符串
   * @returns 转义后的字符串
   */
  private escape(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * 将值转换为 Cypher 字面量。
   *
   * 数字不加引号，布尔转为 true/false，字符串加引号并转义。
   *
   * @param value 原始值
   * @returns Cypher 字面量字符串
   */
  private cypherValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return `'${this.escape(String(value))}'`;
  }

  /**
   * 构建 Cypher IN 列表字面量。
   *
   * @param values 字符串值列表
   * @returns 形如 ['id1','id2'] 的 Cypher 列表
   */
  private buildInList(values: string[]): string {
    return `['${values.map((v) => this.escape(v)).join("','")}']`;
  }

  /**
   * 将单个 Condition 转换为 Cypher WHERE 子句片段。
   *
   * @param fieldRef 字段引用（如 n.id、e.edge_type）
   * @param cond 条件对象
   * @returns Cypher 条件表达式
   */
  private conditionToCypher(fieldRef: string, cond: Condition): string {
    const op = String(cond.operator);
    switch (op) {
      case Operator.EQ:
        return `${fieldRef} = ${this.cypherValue(cond.value)}`;
      case Operator.NE:
        return `${fieldRef} <> ${this.cypherValue(cond.value)}`;
      case Operator.GT:
        return `${fieldRef} > ${this.cypherValue(cond.value)}`;
      case Operator.LT:
        return `${fieldRef} < ${this.cypherValue(cond.value)}`;
      case Operator.GE:
        return `${fieldRef} >= ${this.cypherValue(cond.value)}`;
      case Operator.LE:
        return `${fieldRef} <= ${this.cypherValue(cond.value)}`;
      case Operator.LIKE:
        return `${fieldRef} =~ '.*${this.escape(String(cond.value))}.*'`;
      case Operator.IN: {
        const vals = (cond.value as unknown[]).map((v) =>
          this.cypherValue(v),
        );
        return `${fieldRef} IN [${vals.join(', ')}]`;
      }
      case Operator.NOT_IN: {
        const vals = (cond.value as unknown[]).map((v) =>
          this.cypherValue(v),
        );
        return `NOT ${fieldRef} IN [${vals.join(', ')}]`;
      }
      case Operator.IS_NULL:
        return `${fieldRef} IS NULL`;
      case Operator.IS_NOT_NULL:
        return `${fieldRef} IS NOT NULL`;
      case Operator.BETWEEN: {
        const range = cond.value as unknown[];
        return `${fieldRef} >= ${this.cypherValue(
          range[0],
        )} AND ${fieldRef} <= ${this.cypherValue(range[1])}`;
      }
      default:
        return `${fieldRef} = ${this.cypherValue(cond.value)}`;
    }
  }

  /**
   * 根据 Condition 列表构建 Cypher WHERE 子句。
   *
   * 对于边查询（prefix='e'），将 from_node_id / to_node_id 映射为 from.id / to.id。
   *
   * @param prefix 变量前缀（n 或 e）
   * @param conditions 条件列表
   * @returns WHERE 子句（含 WHERE 关键字），无条件时返回空字符串
   */
  private buildWhere(prefix: string, conditions: Condition[]): string {
    if (conditions.length === 0) {
      return '';
    }
    const parts: string[] = [];
    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      let fieldRef: string;
      if (prefix === 'e' && cond.field === 'from_node_id') {
        fieldRef = 'from.id';
      } else if (prefix === 'e' && cond.field === 'to_node_id') {
        fieldRef = 'to.id';
      } else {
        fieldRef = `${prefix}.${cond.field}`;
      }
      const clause = this.conditionToCypher(fieldRef, cond);
      if (i > 0) {
        parts.push(cond.logic === Logic.OR ? ' OR ' : ' AND ');
      }
      parts.push(clause);
    }
    return ` WHERE ${parts.join('')}`;
  }

  /**
   * 构建 Cypher ORDER BY 子句。
   *
   * @param prefix 变量前缀
   * @param order_by 排序字段列表
   * @returns ORDER BY 子句，无排序返回空字符串
   */
  private buildOrderBy(
    prefix: string,
    order_by: OrderBy[] | undefined,
  ): string {
    if (!order_by || order_by.length === 0) {
      return '';
    }
    const parts = order_by.map((o) => {
      const dir = o.direction === 'DESC' ? 'DESC' : 'ASC';
      return `${prefix}.${o.field} ${dir}`;
    });
    return ` ORDER BY ${parts.join(', ')}`;
  }

  /**
   * 构建 Cypher SKIP / LIMIT 子句（分页）。
   *
   * @param page 分页参数
   * @returns SKIP / LIMIT 子句，无分页返回空字符串
   */
  private buildSkipLimit(page: Page | undefined): string {
    if (!page) {
      return '';
    }
    const skip = (page.current - 1) * page.size;
    return ` SKIP ${skip} LIMIT ${page.size}`;
  }

  /**
   * 将 Cypher 结果行转换为 GraphNodeRecord。
   *
   * 支持 RETURN n（row.n 为节点属性对象）和 RETURN n.id AS id 等两种返回形式。
   * content 字段从 JSON 字符串反序列化。
   *
   * @param row Cypher 结果行
   * @returns 节点记录
   */
  private toNodeRecord(row: Record<string, unknown>): GraphNodeRecord {
    const n =
      (row.n as Record<string, unknown> | undefined) ?? row;
    let content: Record<string, unknown> = {};
    try {
      content = JSON.parse(String(n.content)) as Record<string, unknown>;
    } catch {
      content = {};
    }
    return {
      id: String(n.id),
      created: Number(n.created),
      updated: Number(n.updated),
      node_type: String(n.node_type),
      content,
    };
  }

  /**
   * 将 Cypher 结果行转换为 GraphEdgeRecord。
   *
   * 支持 RETURN e, from.id AS from_node_id, to.id AS to_node_id 形式：
   * row.e 为边属性对象，row.from_node_id / row.to_node_id 为端点 ID。
   * properties 字段从 JSON 字符串反序列化，is_active 从 INTEGER 转为 boolean。
   *
   * @param row Cypher 结果行
   * @returns 边记录
   */
  private toEdgeRecord(row: Record<string, unknown>): GraphEdgeRecord {
    const e =
      (row.e as Record<string, unknown> | undefined) ?? row;
    let properties: Record<string, unknown> | null = null;
    if (e.properties !== null && e.properties !== undefined) {
      try {
        properties = JSON.parse(String(e.properties)) as Record<
          string,
          unknown
        >;
      } catch {
        properties = null;
      }
    }
    return {
      id: String(e.id),
      created: Number(e.created),
      updated: Number(e.updated),
      from_node_id: String(row.from_node_id ?? e.from_node_id),
      to_node_id: String(row.to_node_id ?? e.to_node_id),
      edge_type: String(e.edge_type),
      weight: Number(e.weight),
      properties,
      last_activation_time:
        e.last_activation_time === null ||
        e.last_activation_time === undefined
          ? null
          : Number(e.last_activation_time),
      is_active: Number(e.is_active) === 1,
    };
  }

  // -------------------------------------------------------------------------
  // 节点管理
  // -------------------------------------------------------------------------

  /**
   * 新增节点（addGraphNode）。
   *
   * PRD 3.1.1 条：幂等新增--校验是否已存在 content 相同的节点，若存在则直接返回其 id。
   *
   * @param input 入参（data 节点数据）
   * @param context 执行上下文
   * @param output 出参（id 节点 ID）
   */
  async addGraphNode(
    input: AddGraphNodeInput,
    _context: GraphContext,
    output: AddGraphNodeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.node_type) {
      throw new ValidationError('node_type 不能为空');
    }
    if (!data.content || typeof data.content !== 'object') {
      throw new ValidationError('content 不能为空且必须为对象');
    }

    const contentStr = JSON.stringify(data.content);
    const contentEsc = this.escape(contentStr);
    const nodeTypeEsc = this.escape(data.node_type);

    // 幂等校验：是否已存在 content 相同的节点
    const existing = await this.graphDb.queryOne(
      `MATCH (n:${GRAPH_NODE_TABLE} {content: '${contentEsc}'}) RETURN n.id AS id`,
    );
    if (existing) {
      output.id = String(existing.id);
      return true;
    }

    const id = IdGenerator.generate();
    const now = IdGenerator.now();
    await this.graphDb.execute(
      `CREATE (n:${GRAPH_NODE_TABLE} {id: '${this.escape(
        id,
      )}', created: ${now}, updated: ${now}, node_type: '${nodeTypeEsc}', content: '${contentEsc}'})`,
    );
    output.id = id;
    return true;
  }

  /**
   * 获取节点（getGraphNode）。
   *
   * PRD 3.1.2 条：按 ID 获取节点完整信息，不存在返回 null。
   *
   * @param input 入参（id 节点 ID）
   * @param context 执行上下文
   * @param output 出参（node 节点信息）
   */
  async getGraphNode(
    input: GetGraphNodeInput,
    _context: GraphContext,
    output: GetGraphNodeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const row = await this.graphDb.queryOne(
      `MATCH (n:${GRAPH_NODE_TABLE} {id: '${this.escape(
        input.id,
      )}'}) RETURN n`,
    );
    output.node = row ? this.toNodeRecord(row) : null;
    return true;
  }

  /**
   * 更新节点（updateGraphNode）。
   *
   * PRD 3.1.3 条：更新指定节点的属性（node_type、content），同步更新 updated 时间戳。
   * 系统字段（id、created、updated）不可通过本方法修改。
   *
   * @param input 入参（id 节点 ID，data 待更新字段）
   * @param context 执行上下文
   * @param output 出参（affected_rows 影响行数）
   */
  async updateGraphNode(
    input: UpdateGraphNodeInput,
    _context: GraphContext,
    output: UpdateGraphNodeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const idEsc = this.escape(input.id);

    // 校验节点是否存在
    const existing = await this.graphDb.queryOne(
      `MATCH (n:${GRAPH_NODE_TABLE} {id: '${idEsc}'}) RETURN n.id AS id`,
    );
    if (!existing) {
      output.affected_rows = 0;
      return true;
    }

    const patch = input.data;
    const now = IdGenerator.now();
    const sets: string[] = [`n.updated = ${now}`];
    if (patch.node_type !== undefined) {
      sets.push(`n.node_type = '${this.escape(patch.node_type)}'`);
    }
    if (patch.content !== undefined) {
      sets.push(
        `n.content = '${this.escape(JSON.stringify(patch.content))}'`,
      );
    }

    await this.graphDb.execute(
      `MATCH (n:${GRAPH_NODE_TABLE} {id: '${idEsc}'}) SET ${sets.join(', ')}`,
    );
    output.affected_rows = 1;
    return true;
  }

  /**
   * 删除节点（delGraphNode）。
   *
   * PRD 3.1.4 条：按 ID 批量删除节点，级联删除关联的边（DETACH DELETE），
   * 并清理激活事件表与按天激活统计表。
   *
   * 处理流程：
   * 1. 查询与待删除节点关联的边（from 或 to 命中），收集边 ID；
   * 2. 清理按天激活统计表中归属于这些边的记录；
   * 3. 清理激活事件表中引用待删除节点的记录（from_node_id 或 to_node_id 命中）；
   * 4. 删除节点（DETACH DELETE 自动级联删除关联的边）；
   *
   * @param input 入参（ids 节点 ID 列表）
   * @param context 执行上下文
   * @param output 出参（affected_rows 影响行数）
   */
  async delGraphNode(
    input: DelGraphNodeInput,
    _context: GraphContext,
    output: DelGraphNodeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids || input.ids.length === 0) {
      throw new ValidationError('ids 不能为空');
    }

    const ids = input.ids;
    const idsList = this.buildInList(ids);

    // 1. 查询关联的边，收集边 ID
    const edges = await this.graphDb.queryAll(
      `MATCH (from:graph_node)-[e:graph_edge]->(to:graph_node) ` +
        `WHERE from.id IN ${idsList} OR to.id IN ${idsList} ` +
        `RETURN e.id AS id`,
    );
    const edgeIds = edges.map((e) => String(e.id));

    // 2. 清理按天激活统计表中归属于被级联删除边的记录
    if (edgeIds.length > 0) {
      const edgeIdsList = this.buildInList(edgeIds);
      await this.graphDb.execute(
        `MATCH (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE}) WHERE d.graph_edge_id IN ${edgeIdsList} DELETE d`,
      );
    }

    // 3. 清理激活事件表中引用待删除节点的记录
    await this.graphDb.execute(
      `MATCH (e:${GRAPH_ACTIVATION_EVENT_TABLE}) WHERE e.from_node_id IN ${idsList} OR e.to_node_id IN ${idsList} DELETE e`,
    );

    // 4. 删除节点（DETACH DELETE 自动级联删除关联的边）
    const countRow = await this.graphDb.queryOne(
      `MATCH (n:${GRAPH_NODE_TABLE}) WHERE n.id IN ${idsList} RETURN count(n) AS cnt`,
    );
    await this.graphDb.execute(
      `MATCH (n:${GRAPH_NODE_TABLE}) WHERE n.id IN ${idsList} DETACH DELETE n`,
    );
    output.affected_rows = Number(countRow?.cnt ?? 0);
    return true;
  }

  // -------------------------------------------------------------------------
  // 边管理
  // -------------------------------------------------------------------------

  /**
   * 新增边（addGraphEdge）。
   *
   * PRD 3.2.1 条：在两个节点之间建立关系。
   *
   * 处理流程：
   * 1. 校验起始节点和目标节点是否存在，不存在则失败；
   * 2. 生成边唯一 id；
   * 3. 写入 edge_type、weight（未指定时取配置 default_weight）、properties；
   * 4. 初始化系统字段：is_active 为 true，last_activation_time 为空；
   *
   * @param input 入参（data 边数据）
   * @param context 执行上下文
   * @param output 出参（id 边 ID）
   */
  async addGraphEdge(
    input: AddGraphEdgeInput,
    _context: GraphContext,
    output: AddGraphEdgeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data = input.data;
    if (!data.from_node_id) {
      throw new ValidationError('from_node_id 不能为空');
    }
    if (!data.to_node_id) {
      throw new ValidationError('to_node_id 不能为空');
    }
    if (!data.edge_type) {
      throw new ValidationError('edge_type 不能为空');
    }

    const fromIdEsc = this.escape(data.from_node_id);
    const toIdEsc = this.escape(data.to_node_id);

    // 校验起始节点和目标节点是否存在
    const fromNode = await this.graphDb.queryOne(
      `MATCH (n:${GRAPH_NODE_TABLE} {id: '${fromIdEsc}'}) RETURN n.id AS id`,
    );
    if (!fromNode) {
      throw new NotFoundError('GraphNode', data.from_node_id);
    }
    const toNode = await this.graphDb.queryOne(
      `MATCH (n:${GRAPH_NODE_TABLE} {id: '${toIdEsc}'}) RETURN n.id AS id`,
    );
    if (!toNode) {
      throw new NotFoundError('GraphNode', data.to_node_id);
    }

    // 读取默认权重
    const weight =
      data.weight ?? (await this.config.getDouble('default_weight', 1.0));

    const id = IdGenerator.generate();
    const now = IdGenerator.now();
    const propsStr = data.properties ? JSON.stringify(data.properties) : '';

    await this.graphDb.execute(
      `MATCH (from:graph_node {id: '${fromIdEsc}'}), (to:graph_node {id: '${toIdEsc}'}) ` +
        `CREATE (from)-[e:${GRAPH_EDGE_TABLE} {id: '${this.escape(
          id,
        )}', created: ${now}, updated: ${now}, ` +
        `edge_type: '${this.escape(data.edge_type)}', weight: ${weight}, ` +
        `properties: '${this.escape(
          propsStr,
        )}', last_activation_time: null, is_active: 1}]->(to)`,
    );
    output.id = id;
    return true;
  }

  /**
   * 获取边（getGraphEdge）。
   *
   * PRD 3.2.2 条：按 ID 获取边完整信息，不存在返回 null。
   *
   * @param input 入参（id 边 ID）
   * @param context 执行上下文
   * @param output 出参（edge 边信息）
   */
  async getGraphEdge(
    input: GetGraphEdgeInput,
    _context: GraphContext,
    output: GetGraphEdgeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const row = await this.graphDb.queryOne(
      `MATCH (from:graph_node)-[e:${GRAPH_EDGE_TABLE} {id: '${this.escape(
        input.id,
      )}'}]->(to:graph_node) ` +
        `RETURN e, from.id AS from_node_id, to.id AS to_node_id`,
    );
    output.edge = row ? this.toEdgeRecord(row) : null;
    return true;
  }

  /**
   * 更新边（updateGraphEdge）。
   *
   * PRD 3.2.3 条：更新指定边的属性（edge_type、weight、properties）。
   * 若 from_node_id 或 to_node_id 变更，由于关系端点不可直接修改（原生图数据库语义），
   * 需先删除旧关系再基于新端点重建。
   *
   * 注：last_activation_time、is_active 由激活 / 老化机制维护，不可通过本方法直接修改。
   *
   * @param input 入参（id 边 ID，data 待更新字段）
   * @param context 执行上下文
   * @param output 出参（affected_rows 影响行数）
   */
  async updateGraphEdge(
    input: UpdateGraphEdgeInput,
    _context: GraphContext,
    output: UpdateGraphEdgeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const idEsc = this.escape(input.id);

    // 校验边是否存在
    const existing = await this.graphDb.queryOne(
      `MATCH (from:graph_node)-[e:${GRAPH_EDGE_TABLE} {id: '${idEsc}'}]->(to:graph_node) ` +
        `RETURN e, from.id AS from_node_id, to.id AS to_node_id`,
    );
    if (!existing) {
      throw new NotFoundError('GraphEdge', input.id);
    }

    const patch = input.data;
    const endpointChanged =
      patch.from_node_id !== undefined || patch.to_node_id !== undefined;

    if (endpointChanged) {
      // 端点变更：先删旧关系，再基于新端点重建
      const oldEdge = this.toEdgeRecord(existing);
      const newFromId = patch.from_node_id ?? oldEdge.from_node_id;
      const newToId = patch.to_node_id ?? oldEdge.to_node_id;

      // 校验新端点节点存在
      const fromNode = await this.graphDb.queryOne(
        `MATCH (n:graph_node {id: '${this.escape(
          newFromId,
        )}'}) RETURN n.id AS id`,
      );
      if (!fromNode) {
        throw new NotFoundError('GraphNode', newFromId);
      }
      const toNode = await this.graphDb.queryOne(
        `MATCH (n:graph_node {id: '${this.escape(
          newToId,
        )}'}) RETURN n.id AS id`,
      );
      if (!toNode) {
        throw new NotFoundError('GraphNode', newToId);
      }

      // 删除旧关系
      await this.graphDb.execute(
        `MATCH ()-[e:graph_edge {id: '${idEsc}'}]->() DELETE e`,
      );

      // 基于新端点重建
      const now = IdGenerator.now();
      const edgeType = patch.edge_type ?? oldEdge.edge_type;
      const weight = patch.weight ?? oldEdge.weight;
      const props =
        patch.properties !== undefined
          ? patch.properties
          : oldEdge.properties;
      const propsStr = props ? JSON.stringify(props) : '';
      const lastActTime =
        oldEdge.last_activation_time !== null
          ? String(oldEdge.last_activation_time)
          : 'null';

      await this.graphDb.execute(
        `MATCH (from:graph_node {id: '${this.escape(
          newFromId,
        )}'}), (to:graph_node {id: '${this.escape(newToId)}'}) ` +
          `CREATE (from)-[e:graph_edge {id: '${idEsc}', created: ${
            oldEdge.created
          }, updated: ${now}, ` +
          `edge_type: '${this.escape(edgeType)}', weight: ${weight}, ` +
          `properties: '${this.escape(
            propsStr,
          )}', last_activation_time: ${lastActTime}, is_active: ${
            oldEdge.is_active ? 1 : 0
          }}]->(to)`,
      );
      output.affected_rows = 1;
    } else {
      // 仅更新属性（端点不变）
      const now = IdGenerator.now();
      const sets: string[] = [`e.updated = ${now}`];
      if (patch.edge_type !== undefined) {
        sets.push(`e.edge_type = '${this.escape(patch.edge_type)}'`);
      }
      if (patch.weight !== undefined) {
        sets.push(`e.weight = ${patch.weight}`);
      }
      if (patch.properties !== undefined) {
        sets.push(
          `e.properties = '${this.escape(JSON.stringify(patch.properties))}'`,
        );
      }

      await this.graphDb.execute(
        `MATCH ()-[e:graph_edge {id: '${idEsc}'}]->() SET ${sets.join(', ')}`,
      );
      output.affected_rows = 1;
    }
    return true;
  }

  /**
   * 删除边（delGraphEdge）。
   *
   * PRD 3.2.4 条：按 ID 批量删除边，并清理关联的激活事件记录与按天激活统计记录。
   *
   * @param input 入参（ids 边 ID 列表）
   * @param context 执行上下文
   * @param output 出参（affected_rows 影响行数）
   */
  async delGraphEdge(
    input: DelGraphEdgeInput,
    _context: GraphContext,
    output: DelGraphEdgeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids || input.ids.length === 0) {
      throw new ValidationError('ids 不能为空');
    }

    const ids = input.ids;
    const idsList = this.buildInList(ids);

    // 清理按天激活统计表中归属于这些边的记录
    await this.graphDb.execute(
      `MATCH (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE}) WHERE d.graph_edge_id IN ${idsList} DELETE d`,
    );

    // 清理激活事件表中 graph_edge_id 命中该边列表的记录
    await this.graphDb.execute(
      `MATCH (e:${GRAPH_ACTIVATION_EVENT_TABLE}) WHERE e.graph_edge_id IN ${idsList} DELETE e`,
    );

    // 删除边（统计后删除）
    const countRow = await this.graphDb.queryOne(
      `MATCH ()-[e:graph_edge]->() WHERE e.id IN ${idsList} RETURN count(e) AS cnt`,
    );
    await this.graphDb.execute(
      `MATCH ()-[e:graph_edge]->() WHERE e.id IN ${idsList} DELETE e`,
    );
    output.affected_rows = Number(countRow?.cnt ?? 0);
    return true;
  }

  // -------------------------------------------------------------------------
  // 复合权重计算
  // -------------------------------------------------------------------------

  /**
   * 计算边的复合权重，整合静态相似度与动态活跃度。
   *
   * 公式（三层）：
   *   1. A_vw = Σ[c_i / (α·d_i + 1)] + β·ln(1 + Σc_i)  — 动态活跃度
   *   2. W(e) = similarity × log₂(2 + A_vw)               — 单边权重
   *   3. 调用方可继续乘以 hopDecay 完成路径权重聚合
   *
   * 入参：
   *   edgeId — 要计算权重的边 ID
   *   hopDistance — 从起点到该边的跳数 (1 = 直接邻居)
   *
   * 返回：
   *   复合权重值（含跳衰减因子）
   */
  async computeEdgeCompositeWeight(edgeId: string, hopDistance: number = 1): Promise<number> {
    this.ensureEnabled();
    const edgeIdEsc = this.escape(edgeId);

    const edge = await this.graphDb.queryOne(
      `MATCH (from:graph_node)-[e:graph_edge {id: '${edgeIdEsc}'}]->(to:graph_node) ` +
        'RETURN e.weight as weight, e.properties as props',
    );
    if (!edge) return 0;

    const staticWeight = Number(edge.weight) || 0;
    const propsStr = edge.props != null ? String(edge.props) : null;
    let props: Record<string, unknown> = {};
    if (propsStr) {
      try { props = JSON.parse(propsStr); } catch { /* ignore */ }
    }

    // 提取静态相似度
    const similarity = typeof props.similarity === 'number' ? props.similarity : staticWeight;

    // 读取权重参数
    const decaySlope = await this.config.getDouble('decay_slope', 0.06);
    const totalBonus = await this.config.getDouble('total_bonus', 0.4);
    const retentionDays = await this.config.getInt('retention_days', 60);

    // 读取每日激活计数
    const nowMs = IdGenerator.now();
    const windowStartDate = (() => {
      const d = new Date(nowMs);
      d.setDate(d.getDate() - retentionDays);
      return d.toISOString().slice(0, 10);
    })();

    const dailyRows = await this.graphDb.queryAll(
      `MATCH (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE}) ` +
        `WHERE d.graph_edge_id = '${edgeIdEsc}' AND d.stat_date >= '${this.escape(windowStartDate)}' ` +
        'RETURN d.stat_date AS stat_date, d.activation_count AS cnt',
    );

    // 计算 A_vw
    let weightedSum = 0;    // Σ[c_i / (α·d_i + 1)]
    let totalCount = 0;     // Σ c_i
    for (const row of dailyRows) {
      const c_i = Number(row.cnt) || 0;
      const statDate = String(row.stat_date);
      const d_i = Math.max(0, Math.floor(
        (nowMs - new Date(statDate + 'T00:00:00Z').getTime()) / 86400000,
      ));
      weightedSum += c_i / (decaySlope * d_i + 1);
      totalCount += c_i;
    }

    // 从 actMap 补充（兼容旧存储格式）
    const actMap = props.actMap as Record<string, number> | undefined;
    if (actMap && typeof actMap === 'object') {
      for (const [dateStr, count] of Object.entries(actMap)) {
        if (!dailyRows.some(r => String(r.stat_date) === dateStr)) {
          const c_i = Number(count) || 0;
          const d_i = Math.max(0, Math.floor(
            (nowMs - new Date(dateStr + 'T00:00:00Z').getTime()) / 86400000,
          ));
          if (d_i < retentionDays) {
            weightedSum += c_i / (decaySlope * d_i + 1);
            totalCount += c_i;
          }
        }
      }
    }

    // A_vw = weightedSum + totalBonus * ln(1 + totalCount)
    const aVw = weightedSum + totalBonus * Math.log(1 + totalCount);

    // W(e) = similarity × log₂(2 + A_vw)
    const baseWeight = similarity * Math.log2(2 + aVw);

    // 跳衰减
    const hopDecay = await this.config.getDouble('hop_decay_factor', 0.8);
    const hopMultiplier = Math.pow(hopDecay, hopDistance - 1);

    return baseWeight * hopMultiplier;
  }

  // -------------------------------------------------------------------------
  // 图查询
  // -------------------------------------------------------------------------

  /**
   * 查询图数据（selectGraph）。
   *
   * PRD 3.3.1 条：查询节点或边，支持按类型过滤、条件过滤、排序、分页。
   *
   * @param input 入参（target 查询目标，node_type/edge_type 类型过滤，conditions/order_by/page）
   * @param context 执行上下文
   * @param output 出参（list 结果列表，total 总数）
   */
  async selectGraph(
    input: SelectGraphInput,
    _context: GraphContext,
    output: SelectGraphOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const target = String(input.target);
    const isNode = target === GraphTarget.NODE;

    if (isNode) {
      // 节点查询
      const conditions: Condition[] = [];
      if (input.node_type) {
        conditions.push({
          field: 'node_type',
          operator: Operator.EQ,
          value: input.node_type,
        });
      }
      if (input.conditions) {
        conditions.push(...input.conditions);
      }

      const where = this.buildWhere('n', conditions);
      const orderBy = this.buildOrderBy('n', input.order_by);
      const skipLimit = this.buildSkipLimit(input.page);

      const rows = await this.graphDb.queryAll(
        `MATCH (n:${GRAPH_NODE_TABLE})${where} RETURN n${orderBy}${skipLimit}`,
      );
      const countRow = await this.graphDb.queryOne(
        `MATCH (n:${GRAPH_NODE_TABLE})${where} RETURN count(n) AS cnt`,
      );
      output.list = rows.map((r) => this.toNodeRecord(r));
      output.total = Number(countRow?.cnt ?? 0);
    } else {
      // 边查询
      const conditions: Condition[] = [];
      if (input.edge_type) {
        conditions.push({
          field: 'edge_type',
          operator: Operator.EQ,
          value: input.edge_type,
        });
      }
      if (input.conditions) {
        conditions.push(...input.conditions);
      }

      const where = this.buildWhere('e', conditions);
      const orderBy = this.buildOrderBy('e', input.order_by);
      const skipLimit = this.buildSkipLimit(input.page);

      const rows = await this.graphDb.queryAll(
        `MATCH (from:graph_node)-[e:${GRAPH_EDGE_TABLE}]->(to:graph_node)${where} ` +
          `RETURN e, from.id AS from_node_id, to.id AS to_node_id${orderBy}${skipLimit}`,
      );
      // 计数查询需绑定 from / to 变量，以支持 from_node_id / to_node_id 条件
      const countRow = await this.graphDb.queryOne(
        `MATCH (from:graph_node)-[e:${GRAPH_EDGE_TABLE}]->(to:graph_node)${where} RETURN count(e) AS cnt`,
      );
      output.list = rows.map((r) => this.toEdgeRecord(r));
      output.total = Number(countRow?.cnt ?? 0);
    }
    return true;
  }

  /**
   * 获取邻居节点（getGraphNeighbors）。
   *
   * PRD 3.3.2 条：从指定节点开始多跳遍历，返回 depth 范围内的所有邻居节点。
   *
   * 通过迭代 Cypher 查询实现多跳遍历：
   * 1. 从 node_id 开始，作为初始 frontier；
   * 2. 对每一深度层级（1 到 max_depth）：
   *    - 根据 direction 查询与当前 frontier 匹配的边；
   *    - 应用 edge_type 过滤、is_active 过滤；
   *    - 收集邻居节点 ID（对向端点）；
   * 3. 返回所有唯一邻居节点（不含起始节点）。
   *
   * @param input 入参（node_id 起始节点，depth 深度，edge_type 边类型过滤，direction 方向，only_active 仅激活边）
   * @param context 执行上下文
   * @param output 出参（list 邻居节点列表）
   */
  async getGraphNeighbors(
    input: GetGraphNeighborsInput,
    _context: GraphContext,
    output: GetGraphNeighborsOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.node_id) {
      throw new ValidationError('node_id 不能为空');
    }

    // 读取默认参数
    const maxDepth =
      input.depth ?? (await this.config.getInt('default_depth', 1));
    const onlyActive =
      input.only_active ??
      (await this.config.getBoolean('default_only_active', true));
    const direction = String(input.direction ?? GraphDirection.BOTH);

    // 校验起始节点存在
    const startNode = await this.graphDb.queryOne(
      `MATCH (n:graph_node {id: '${this.escape(
        input.node_id,
      )}'}) RETURN n.id AS id`,
    );
    if (!startNode) {
      throw new NotFoundError('GraphNode', input.node_id);
    }

    // 迭代遍历
    const visited = new Set<string>([input.node_id]);
    let frontier = [input.node_id];

    for (let depth = 0; depth < maxDepth; depth++) {
      if (frontier.length === 0) {
        break;
      }

      const frontierList = this.buildInList(frontier);
      const whereParts: string[] = [];

      // 方向条件
      if (direction === GraphDirection.OUT) {
        whereParts.push(`from.id IN ${frontierList}`);
      } else if (direction === GraphDirection.IN) {
        whereParts.push(`to.id IN ${frontierList}`);
      } else {
        whereParts.push(
          `(from.id IN ${frontierList} OR to.id IN ${frontierList})`,
        );
      }

      // 边类型过滤
      if (input.edge_type) {
        whereParts.push(
          `e.edge_type = '${this.escape(input.edge_type)}'`,
        );
      }

      // 仅激活边过滤
      if (onlyActive) {
        whereParts.push(`e.is_active = 1`);
      }

      const edges = await this.graphDb.queryAll(
        `MATCH (from:graph_node)-[e:graph_edge]->(to:graph_node) ` +
          `WHERE ${whereParts.join(' AND ')} ` +
          `RETURN from.id AS from_id, to.id AS to_id`,
      );

      // 收集邻居节点 ID
      const nextFrontier: string[] = [];
      for (const edge of edges) {
        const fromId = String(edge.from_id);
        const toId = String(edge.to_id);
        if (direction === GraphDirection.OUT) {
          // 出边：邻居是 to_node_id
          if (!visited.has(toId)) {
            nextFrontier.push(toId);
          }
        } else if (direction === GraphDirection.IN) {
          // 入边：邻居是 from_node_id
          if (!visited.has(fromId)) {
            nextFrontier.push(fromId);
          }
        } else {
          // BOTH：取对向端点
          if (frontier.includes(fromId) && !visited.has(toId)) {
            nextFrontier.push(toId);
          }
          if (frontier.includes(toId) && !visited.has(fromId)) {
            nextFrontier.push(fromId);
          }
        }
      }

      // 更新 visited 与 frontier
      const newFrontier: string[] = [];
      for (const id of nextFrontier) {
        if (!visited.has(id)) {
          visited.add(id);
          newFrontier.push(id);
        }
      }
      frontier = newFrontier;
    }

    // 查询所有邻居节点的完整信息
    visited.delete(input.node_id);
    const neighborIds = Array.from(visited);
    if (neighborIds.length === 0) {
      output.list = [];
      return true;
    }

    const neighborIdsList = this.buildInList(neighborIds);
    const rows = await this.graphDb.queryAll(
      `MATCH (n:graph_node) WHERE n.id IN ${neighborIdsList} RETURN n`,
    );
    output.list = rows.map((r) => this.toNodeRecord(r));
    return true;
  }

  // -------------------------------------------------------------------------
  // 边生命周期
  // -------------------------------------------------------------------------

  /**
   * 激活边（activateGraphEdge）。
   *
   * PRD 3.4.1 条：记录激活事件并按天累计激活次数，用于边的权重维护与老化判定。
   *
   * 处理流程：
   * 1. 校验指定边是否存在，不存在则失败；
   * 2. 若 trigger_type 未指定，从配置表读取 default_trigger_type（默认 user_query）；
   * 3. 查询该边的起始节点 ID 和目标节点 ID；
   * 4. 在激活事件表中记录本次激活事件；
   * 5. 在按天激活统计表中递增当日计数（upsert）；
   * 6. 更新边的 last_activation_time 与 is_active；
   *
   * @param input 入参（edge_id 边 ID，trigger_type 触发类型）
   * @param context 执行上下文
   * @param output 出参
   */
  async activateGraphEdge(
    input: ActivateGraphEdgeInput,
    _context: GraphContext,
    _output: ActivateGraphEdgeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.edge_id) {
      throw new ValidationError('edge_id 不能为空');
    }

    const edgeIdEsc = this.escape(input.edge_id);

    // 校验边是否存在
    const edge = await this.graphDb.queryOne(
      `MATCH (from:graph_node)-[e:graph_edge {id: '${edgeIdEsc}'}]->(to:graph_node) ` +
        `RETURN e, from.id AS from_node_id, to.id AS to_node_id`,
    );
    if (!edge) {
      throw new NotFoundError('GraphEdge', input.edge_id);
    }

    // 读取默认触发类型
    const triggerType =
      input.trigger_type ??
      (await this.config.getString('default_trigger_type', 'user_query')) ??
      'user_query';

    const now = IdGenerator.now();
    const today = IdGenerator.today();
    const fromId = String(edge.from_node_id);
    const toId = String(edge.to_node_id);

    // 记录激活事件
    const eventId = IdGenerator.generate();
    await this.graphDb.execute(
      `CREATE (e:${GRAPH_ACTIVATION_EVENT_TABLE} {id: '${this.escape(
        eventId,
      )}', created: ${now}, updated: ${now}, ` +
        `graph_edge_id: '${edgeIdEsc}', from_node_id: '${this.escape(
          fromId,
        )}', to_node_id: '${this.escape(toId)}', ` +
        `activation_time: ${now}, trigger_type: '${this.escape(
          triggerType,
        )}'})`,
    );

    // 按天激活统计 upsert（先查询是否存在，存在则递增，不存在则新建）
    const existing = await this.graphDb.queryOne(
      `MATCH (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE} {graph_edge_id: '${edgeIdEsc}', stat_date: '${this.escape(
        today,
      )}'}) RETURN d.activation_count AS cnt`,
    );
    if (existing) {
      await this.graphDb.execute(
        `MATCH (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE} {graph_edge_id: '${edgeIdEsc}', stat_date: '${this.escape(
          today,
        )}'}) ` +
          `SET d.activation_count = d.activation_count + 1, d.updated = ${now}`,
      );
    } else {
      const statId = IdGenerator.generate();
      await this.graphDb.execute(
        `CREATE (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE} {id: '${this.escape(
          statId,
        )}', created: ${now}, updated: ${now}, ` +
          `graph_edge_id: '${edgeIdEsc}', stat_date: '${this.escape(
            today,
          )}', activation_count: 1})`,
      );
    }

    // 更新边的 last_activation_time 与 is_active
    await this.graphDb.execute(
      `MATCH ()-[e:graph_edge {id: '${edgeIdEsc}'}]->() ` +
        `SET e.last_activation_time = ${now}, e.is_active = 1, e.updated = ${now}`,
    );
    return true;
  }

  /**
   * 老化边（ageGraphEdge）。
   *
   * PRD 3.4.2 条：基于保留窗口内的激活数量老化边，将近期不活跃的边标记为非激活状态，
   * 并清理过期激活数据。
   *
   * 处理流程：
   * 1. 从配置表读取老化参数：retention_days（保留天数）、min_activation_count（最小激活次数阈值）；
   * 2. 扫描所有激活状态的边（is_active = true）；
   * 3. 对每条边按保留窗口判定是否需要老化：
   *    - 统计该边在最近 retention_days 天内的激活总数；
   *    - 若边创建时间距今已超过 retention_days（已度过完整保留窗口的观察期），
   *      且窗口内激活总数小于 min_activation_count，则老化；
   * 4. 对符合条件的边标记为非激活状态（is_active 置为 false）；
   * 5. 清理过期激活数据；
   * 6. 老化的边数量通过 output 参数返回；
   *
   * @param input 入参（无额外参数）
   * @param context 执行上下文
   * @param output 出参（aged_count 老化的边数量）
   */
  async ageGraphEdge(
    _input: AgeGraphEdgeInput,
    _context: GraphContext,
    output: AgeGraphEdgeOutput,
  ): Promise<boolean> {
    this.ensureEnabled();

    // 1. 读取老化参数
    const retentionDays = await this.config.getInt('retention_days', 30);
    const minActivationCount = await this.config.getInt(
      'min_activation_count',
      5,
    );

    const now = IdGenerator.now();
    const windowStartMs = now - retentionDays * ONE_DAY_MS;
    const windowStartDate = this.formatDate(new Date(windowStartMs));

    // 2. 扫描所有激活状态的边
    const activeEdges = await this.graphDb.queryAll(
      `MATCH ()-[e:graph_edge]->() WHERE e.is_active = 1 ` +
        `RETURN e.id AS id, e.created AS created`,
    );

    // 3. 批量查询窗口内各边的激活总数
    const dailyRecords = await this.graphDb.queryAll(
      `MATCH (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE}) ` +
        `WHERE d.stat_date >= '${this.escape(
          windowStartDate,
        )}' RETURN d.graph_edge_id AS graph_edge_id, d.activation_count AS cnt`,
    );
    const activationMap = new Map<string, number>();
    for (const row of dailyRecords) {
      const edgeId = String(row.graph_edge_id);
      activationMap.set(
        edgeId,
        (activationMap.get(edgeId) ?? 0) + Number(row.cnt),
      );
    }

    // 4. 判定需要老化的边
    const toDeactivate: string[] = [];
    for (const edge of activeEdges) {
      const created = Number(edge.created);
      // 仅当边已度过完整保留窗口的观察期时才参与老化
      if (created <= windowStartMs) {
        const total = activationMap.get(String(edge.id)) ?? 0;
        if (total < minActivationCount) {
          toDeactivate.push(String(edge.id));
        }
      }
    }

    // 5. 批量标记为非激活状态
    if (toDeactivate.length > 0) {
      const idsList = this.buildInList(toDeactivate);
      await this.graphDb.execute(
        `MATCH ()-[e:graph_edge]->() WHERE e.id IN ${idsList} ` +
          `SET e.is_active = 0, e.updated = ${now}`,
      );
    }

    // 6. 清理过期激活数据
    await this.graphDb.execute(
      `MATCH (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE}) WHERE d.stat_date < '${this.escape(
        windowStartDate,
      )}' DELETE d`,
    );
    await this.graphDb.execute(
      `MATCH (e:${GRAPH_ACTIVATION_EVENT_TABLE}) WHERE e.activation_time < ${windowStartMs} DELETE e`,
    );

    output.aged_count = toDeactivate.length;
    return true;
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /**
   * 可视化数据（visualizedGraph）。
   *
   * PRD 3.5.1 条：根据 scope 获取图数据库的可视化信息。
   * - health：连接状态、响应时间、启用状态；
   * - volume：节点数、边数、激活事件数；
   * - diskUsage：磁盘占用（基于文件大小获取）；
   *
   * @param input 入参（scope 可视化范围）
   * @param context 执行上下文
   * @param output 出参（data 可视化数据）
   */
  async visualizedGraph(
    input: VisualizedGraphInput,
    _context: GraphContext,
    output: VisualizedGraphOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const scope = String(input.scope);

    if (scope === 'health') {
      const start = Date.now();
      await this.graphDb.queryOne(
        `MATCH (n:graph_node) RETURN n.id AS id LIMIT 1`,
      );
      output.data = {
        connected: true,
        response_time_ms: Date.now() - start,
        enabled: this.enabled,
      };
    } else if (scope === 'volume') {
      const nodeRow = await this.graphDb.queryOne(
        `MATCH (n:graph_node) RETURN count(n) AS cnt`,
      );
      const edgeRow = await this.graphDb.queryOne(
        `MATCH ()-[e:graph_edge]->() RETURN count(e) AS cnt`,
      );
      const eventRow = await this.graphDb.queryOne(
        `MATCH (e:graph_activation_event) RETURN count(e) AS cnt`,
      );
      output.data = {
        total_nodes: Number(nodeRow?.cnt ?? 0),
        total_edges: Number(edgeRow?.cnt ?? 0),
        total_activation_events: Number(eventRow?.cnt ?? 0),
      };
    } else if (scope === 'diskUsage') {
      const diskBytes = this.graphDb.getDiskUsage();
      const nodeRow = await this.graphDb.queryOne(
        `MATCH (n:graph_node) RETURN count(n) AS cnt`,
      );
      const edgeRow = await this.graphDb.queryOne(
        `MATCH ()-[e:graph_edge]->() RETURN count(e) AS cnt`,
      );
      output.data = {
        disk_usage_bytes: diskBytes,
        page_size: 4096,
        page_count: Math.ceil(diskBytes / 4096),
        node_count: Number(nodeRow?.cnt ?? 0),
        edge_count: Number(edgeRow?.cnt ?? 0),
      };
    } else {
      output.error = `未知的可视化范围: ${scope}`;
      output.error_code = 'INVALID_SCOPE';
      return false;
    }
    return true;
  }

  /**
   * 启用/禁用图数据库（enableGraphDB）。
   *
   * PRD 3.5.2 条：运行时控制图数据库的可用状态。
   * - 禁用时关闭图数据库连接，释放资源，将 enabled 持久化为 false；
   * - 启用时重新打开图数据库连接，恢复可用状态，将 enabled 持久化为 true；
   * 状态同步持久化到 graphdb_config，组件初始化时恢复。
   * 禁用期间所有图数据操作将返回失败。
   *
   * 注：closeGraphDB 为终态操作，执行后不可通过本方法恢复，需重新初始化组件。
   *
   * @param input 入参（enable 是否启用）
   * @param context 执行上下文
   * @param output 出参
   */
  async enableGraphDB(
    input: EnableGraphDBInput,
    _context: GraphContext,
    _output: EnableGraphDBOutput,
  ): Promise<boolean> {
    if (this.closed) {
      throw new DatabaseError(
        '图数据库已关闭（closeGraphDB 为终态操作），需重新初始化组件',
      );
    }
    this.enabled = input.enable;
    if (input.enable) {
      this.graphDb.open();
    } else {
      this.graphDb.disconnect();
    }
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      '图数据库是否启用（enableGraphDB 读写）',
    );
    return true;
  }

  /**
   * 关闭图数据库连接（closeGraphDB）。
   *
   * PRD 3.5.3 条：系统关闭时的终态释放，执行后不可通过 enableGraphDB 恢复，
   * 需重新初始化组件。
   *
   * 关闭原生图数据库连接，释放资源，并标记终态。
   *
   * @param input 入参
   * @param context 执行上下文
   * @param output 出参
   */
  async closeGraphDB(
    _input: CloseGraphDBInput,
    _context: GraphContext,
    _output: CloseGraphDBOutput,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;
    // 关闭原生图数据库连接
    this.graphDb.close();
    return true;
  }

  // -------------------------------------------------------------------------
  // 私有工具
  // -------------------------------------------------------------------------

  /**
   * 将 Date 格式化为 YYYY-MM-DD 字符串。
   *
   * @param date 日期对象
   * @returns 日期字符串，如 "2026-07-25"
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
