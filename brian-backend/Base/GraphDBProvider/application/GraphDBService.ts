import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { GraphDBComponent } from '../../components/GraphDB/GraphDBComponent';
import { ConfigService } from '../../shared/config/ConfigService';
import {
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator, Logic } from '../../shared/query';
import type { Condition, OrderBy, Page } from '../../shared/query';
import { GraphContext, GraphNodeRecord, GraphEdgeRecord, GraphTarget, GraphDirection, AddGraphNodeInput, AddGraphNodeOutput, GetGraphNodeInput, GetGraphNodeOutput, UpdateGraphNodeInput, UpdateGraphNodeOutput, DelGraphNodeInput, DelGraphNodeOutput, AddGraphEdgeInput, AddGraphEdgeOutput, GetGraphEdgeInput, GetGraphEdgeOutput, UpdateGraphEdgeInput, UpdateGraphEdgeOutput, DelGraphEdgeInput, DelGraphEdgeOutput, SelectGraphInput, SelectGraphOutput, GetGraphNeighborsInput, GetGraphNeighborsOutput, ActivateGraphEdgeInput, ActivateGraphEdgeOutput, AgeGraphEdgeInput, AgeGraphEdgeOutput, VisualizedGraphInput, VisualizedGraphOutput, EnableGraphDBInput, EnableGraphDBOutput, CloseGraphDBInput, CloseGraphDBOutput, GRAPH_NODE_TABLE, GRAPH_EDGE_TABLE, GRAPH_ACTIVATION_EVENT_TABLE, GRAPH_EDGE_DAILY_ACTIVATION_TABLE, GRAPHDB_CONFIG_TABLE } from '../domain/types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class GraphDBService {

  private enabled = true;

  private closed = false;

  private readonly config: ConfigService;

  constructor(
    private readonly graphDb: GraphDBComponent,
    private readonly relationDb: RelationDBAccess,
  ) {
    this.config = new ConfigService(relationDb, GRAPHDB_CONFIG_TABLE);
  }

  async initialize(): Promise<void> {
    await this.config.initDefaults([
      { config_key: 'enabled', config_value: 'true', value_type: 'BOOLEAN', description: '图数据库是否启用（enableGraphDB 读写）' },
      { config_key: 'retention_days', config_value: '30', value_type: 'INT', description: '激活统计保留天数（老化观察窗口）' },
      { config_key: 'min_activation_count', config_value: '5', value_type: 'INT', description: '窗口内最小激活次数阈值' },
      { config_key: 'default_trigger_type', config_value: 'user_query', value_type: 'STRING', description: '默认触发类型' },
      { config_key: 'default_weight', config_value: '1.0', value_type: 'DOUBLE', description: '默认边权重' },
      { config_key: 'default_depth', config_value: '1', value_type: 'INT', description: '默认遍历深度' },
      { config_key: 'default_only_active', config_value: 'true', value_type: 'BOOLEAN', description: '默认仅遍历激活边' },
      { config_key: 'decay_slope', config_value: '0.06', value_type: 'DOUBLE', description: '逆比例衰减斜率 (α)' },
      { config_key: 'total_bonus', config_value: '0.4', value_type: 'DOUBLE', description: '对数累计补偿 (β)' },
      { config_key: 'hop_decay_factor', config_value: '0.8', value_type: 'DOUBLE', description: '跳衰减因子 (γ)' },
      { config_key: 'fan_out_threshold', config_value: '500', value_type: 'INT', description: '扇出熔断阈值 (θ)' },
    ]);
    this.enabled = await this.config.getBoolean('enabled', true);
  }

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

  private escape(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

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

  private buildInList(values: string[]): string {
    return `['${values.map((v) => this.escape(v)).join("','")}']`;
  }

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

  private buildSkipLimit(page: Page | undefined): string {
    if (!page) {
      return '';
    }
    const skip = (page.current - 1) * page.size;
    return ` SKIP ${skip} LIMIT ${page.size}`;
  }

  private toNodeRecord(row: Record<string, unknown>): GraphNodeRecord {
    const n =
      (row.n as Record<string, unknown> | undefined) ?? row;
    let content: Record<string, unknown> = {};
    const rawContent = n.content;
    if (rawContent !== null && rawContent !== undefined) {
      if (typeof rawContent === 'string') {
        try {
          content = JSON.parse(rawContent);
        } catch {

        }
      } else if (typeof rawContent === 'object') {
        content = rawContent as Record<string, unknown>;
      }
    }
    return {
      id: String(n.id),
      created: Number(n.created),
      updated: Number(n.updated),
      node_type: String(n.node_type),
      content,
    };
  }

  private toEdgeRecord(row: Record<string, unknown>): GraphEdgeRecord {
    const e =
      (row.e as Record<string, unknown> | undefined) ?? row;
    let properties: Record<string, unknown> | null = null;
    const rawProps = e.properties;
    if (rawProps !== null && rawProps !== undefined) {
      if (typeof rawProps === 'string') {
        try {
          properties = JSON.parse(rawProps) as Record<string, unknown>;
        } catch {

        }
      } else if (typeof rawProps === 'object') {
        properties = rawProps as Record<string, unknown>;
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

  async addGraphNode(input: AddGraphNodeInput, output: AddGraphNodeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
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

  async soGraphNode(input: GetGraphNodeInput, output: GetGraphNodeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
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

  async updateGraphNode(input: UpdateGraphNodeInput, output: UpdateGraphNodeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const idEsc = this.escape(input.id);

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

  async delGraphNode(input: DelGraphNodeInput, output: DelGraphNodeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids || input.ids.length === 0) {
      throw new ValidationError('ids 不能为空');
    }

    const ids = input.ids;
    const idsList = this.buildInList(ids);

    const edges = await this.graphDb.queryAll(
      `MATCH (from:graph_node)-[e:graph_edge]->(to:graph_node) ` +
        `WHERE from.id IN ${idsList} OR to.id IN ${idsList} ` +
        `RETURN e.id AS id`,
    );
    const edgeIds = edges.map((e) => String(e.id));

    if (edgeIds.length > 0) {
      const edgeIdsList = this.buildInList(edgeIds);
      await this.graphDb.execute(
        `MATCH (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE}) WHERE d.graph_edge_id IN ${edgeIdsList} DELETE d`,
      );
    }

    await this.graphDb.execute(
      `MATCH (e:${GRAPH_ACTIVATION_EVENT_TABLE}) WHERE e.from_node_id IN ${idsList} OR e.to_node_id IN ${idsList} DELETE e`,
    );

    const countRow = await this.graphDb.queryOne(
      `MATCH (n:${GRAPH_NODE_TABLE}) WHERE n.id IN ${idsList} RETURN count(n) AS cnt`,
    );
    await this.graphDb.execute(
      `MATCH (n:${GRAPH_NODE_TABLE}) WHERE n.id IN ${idsList} DETACH DELETE n`,
    );
    output.affected_rows = Number(countRow?.cnt ?? 0);
    return true;
  }

  async addGraphEdge(input: AddGraphEdgeInput, output: AddGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
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

    const weight =
      data.weight ?? (await this.config.getDouble('default_weight', 1.0));

    const id = IdGenerator.generate();
    const now = IdGenerator.now();
    const propsPart = data.properties
      ? `properties: '${this.escape(JSON.stringify(data.properties))}', `
      : '';

    await this.graphDb.execute(
      `MATCH (from:graph_node {id: '${fromIdEsc}'}), (to:graph_node {id: '${toIdEsc}'}) ` +
        `CREATE (from)-[e:${GRAPH_EDGE_TABLE} {id: '${this.escape(
          id,
        )}', created: ${now}, updated: ${now}, ` +
        `edge_type: '${this.escape(data.edge_type)}', weight: ${weight}, ` +
        `${propsPart}last_activation_time: null, is_active: 1}]->(to)`,
    );
    output.id = id;
    return true;
  }

  async soGraphEdge(input: GetGraphEdgeInput, output: GetGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
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

  async updateGraphEdge(input: UpdateGraphEdgeInput, output: UpdateGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id) {
      throw new ValidationError('id 不能为空');
    }

    const idEsc = this.escape(input.id);

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

      const oldEdge = this.toEdgeRecord(existing);
      const newFromId = patch.from_node_id ?? oldEdge.from_node_id;
      const newToId = patch.to_node_id ?? oldEdge.to_node_id;

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

      await this.graphDb.execute(
        `MATCH ()-[e:graph_edge {id: '${idEsc}'}]->() DELETE e`,
      );

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

  async delGraphEdge(input: DelGraphEdgeInput, output: DelGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids || input.ids.length === 0) {
      throw new ValidationError('ids 不能为空');
    }

    const ids = input.ids;
    const idsList = this.buildInList(ids);

    await this.graphDb.execute(
      `MATCH (d:${GRAPH_EDGE_DAILY_ACTIVATION_TABLE}) WHERE d.graph_edge_id IN ${idsList} DELETE d`,
    );

    await this.graphDb.execute(
      `MATCH (e:${GRAPH_ACTIVATION_EVENT_TABLE}) WHERE e.graph_edge_id IN ${idsList} DELETE e`,
    );

    const countRow = await this.graphDb.queryOne(
      `MATCH ()-[e:graph_edge]->() WHERE e.id IN ${idsList} RETURN count(e) AS cnt`,
    );
    await this.graphDb.execute(
      `MATCH ()-[e:graph_edge]->() WHERE e.id IN ${idsList} DELETE e`,
    );
    output.affected_rows = Number(countRow?.cnt ?? 0);
    return true;
  }

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
      try {
        props = JSON.parse(propsStr);
      } catch {

      }
    }

    const similarity = typeof props.similarity === 'number' ? props.similarity : staticWeight;

    const decaySlope = await this.config.getDouble('decay_slope', 0.06);
    const totalBonus = await this.config.getDouble('total_bonus', 0.4);
    const retentionDays = await this.config.getInt('retention_days', 30);

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

    let weightedSum = 0;
    let totalCount = 0;
    for (const row of dailyRows) {
      const c_i = Number(row.cnt) || 0;
      const statDate = String(row.stat_date);
      const d_i = Math.max(0, Math.floor(
        (nowMs - new Date(statDate + 'T00:00:00Z').getTime()) / 86400000,
      ));
      weightedSum += c_i / (decaySlope * d_i + 1);
      totalCount += c_i;
    }

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

    const aVw = weightedSum + totalBonus * Math.log(1 + totalCount);

    const baseWeight = similarity * Math.log2(2 + aVw);

    const hopDecay = await this.config.getDouble('hop_decay_factor', 0.8);
    const hopMultiplier = Math.pow(hopDecay, hopDistance - 1);

    return baseWeight * hopMultiplier;
  }

  async selectGraph(input: SelectGraphInput, output: SelectGraphOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const target = String(input.target);
    const isNode = target === GraphTarget.NODE;

    if (isNode) {

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

      const countRow = await this.graphDb.queryOne(
        `MATCH (from:graph_node)-[e:${GRAPH_EDGE_TABLE}]->(to:graph_node)${where} RETURN count(e) AS cnt`,
      );
      output.list = rows.map((r) => this.toEdgeRecord(r));
      output.total = Number(countRow?.cnt ?? 0);
    }
    return true;
  }

  async soGraphNeighbors(input: GetGraphNeighborsInput, output: GetGraphNeighborsOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.node_id) {
      throw new ValidationError('node_id 不能为空');
    }

    const maxDepth =
      input.depth ?? (await this.config.getInt('default_depth', 1));
    const onlyActive =
      input.only_active ??
      (await this.config.getBoolean('default_only_active', true));
    const direction = String(input.direction ?? GraphDirection.BOTH);
    const fanOutThreshold = await this.config.getInt('fan_out_threshold', 500);

    const startNode = await this.graphDb.queryOne(
      `MATCH (n:graph_node {id: '${this.escape(
        input.node_id,
      )}'}) RETURN n.id AS id`,
    );
    if (!startNode) {
      throw new NotFoundError('GraphNode', input.node_id);
    }

    const dir = direction === GraphDirection.OUT ? 'OUT'
      : direction === GraphDirection.IN ? 'IN'
      : 'BOTH';
    const neighborIds = await this.graphDb.queryNeighborsByCTE({
      startNodeId: input.node_id,
      maxDepth,
      direction: dir,
      edgeType: input.edge_type,
      onlyActive,
      fanOutThreshold,
    });

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

  async activateGraphEdge(input: ActivateGraphEdgeInput, _output: ActivateGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.edge_id) {
      throw new ValidationError('edge_id 不能为空');
    }

    const edgeIdEsc = this.escape(input.edge_id);

    const edge = await this.graphDb.queryOne(
      `MATCH (from:graph_node)-[e:graph_edge {id: '${edgeIdEsc}'}]->(to:graph_node) ` +
        `RETURN e, from.id AS from_node_id, to.id AS to_node_id`,
    );
    if (!edge) {
      throw new NotFoundError('GraphEdge', input.edge_id);
    }

    const triggerType =
      input.trigger_type ??
      (await this.config.getString('default_trigger_type', 'user_query')) ??
      'user_query';

    const now = IdGenerator.now();
    const today = IdGenerator.today();
    const fromId = String(edge.from_node_id);
    const toId = String(edge.to_node_id);

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

    await this.graphDb.execute(
      `MATCH ()-[e:graph_edge {id: '${edgeIdEsc}'}]->() ` +
        `SET e.last_activation_time = ${now}, e.is_active = 1, e.updated = ${now}`,
    );
    return true;
  }

  async ageGraphEdge(_input: AgeGraphEdgeInput, output: AgeGraphEdgeOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();

    const retentionDays = await this.config.getInt('retention_days', 30);
    const minActivationCount = await this.config.getInt(
      'min_activation_count',
      5,
    );

    const now = IdGenerator.now();
    const windowStartMs = now - retentionDays * ONE_DAY_MS;
    const _d = new Date(windowStartMs);
    const windowStartDate = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`;

    const activeEdges = await this.graphDb.queryAll(
      `MATCH ()-[e:graph_edge]->() WHERE e.is_active = 1 ` +
        `RETURN e.id AS id, e.created AS created`,
    );

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

    const toDeactivate: string[] = [];
    for (const edge of activeEdges) {
      const created = Number(edge.created);

      if (created <= windowStartMs) {
        const total = activationMap.get(String(edge.id)) ?? 0;
        if (total < minActivationCount) {
          toDeactivate.push(String(edge.id));
        }
      }
    }

    if (toDeactivate.length > 0) {
      const idsList = this.buildInList(toDeactivate);
      await this.graphDb.execute(
        `MATCH ()-[e:graph_edge]->() WHERE e.id IN ${idsList} ` +
          `SET e.is_active = 0, e.updated = ${now}`,
      );
    }

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

  async visualizedGraph(input: VisualizedGraphInput, output: VisualizedGraphOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
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

  async enableGraphDB(input: EnableGraphDBInput, _output: EnableGraphDBOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
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

  async closeGraphDB(_input: CloseGraphDBInput, _output: CloseGraphDBOutput, _context: GraphContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.enabled = false;
    this.closed = true;

    this.graphDb.close();
    return true;
  }

}
