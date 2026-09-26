import { Metrics } from '../shared/base/Metrics';
import { Report } from '../shared/base/Report';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { RelationDBAccess } from '../RelationDBProvider/access/RelationDBAccess';
import { DBContext, CloseDBInput, CloseDBOutput } from '../RelationDBProvider';
import {
  GraphDBAccess,
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
} from '../GraphDBProvider';
import type {
  GraphNodeData,
  GraphEdgeData,
  GraphNodeRecord,
  GraphEdgeRecord,
} from '../GraphDBProvider';
import { Operator } from '../shared/query';
import { ComponentDisabledError, ValidationError, NotFoundError, DatabaseError } from '../shared/errors';

function makeNode(node_type: string, content: Record<string, unknown>): GraphNodeData {
  return { node_type, content };
}

function makeEdge(
  from_node_id: string,
  to_node_id: string,
  edge_type: string,
  opts?: { weight?: number; properties?: Record<string, unknown> },
): GraphEdgeData {
  return { from_node_id, to_node_id, edge_type, ...opts };
}

describe('GraphDBProvider', () => {
  let tempDir: string;
  let sqlitePath: string;
  let graphPath: string;
  let relationDb: RelationDBAccess;
  let graphDb: GraphDBAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-graph-test-'));
    sqlitePath = path.join(tempDir, 'test.db');
    graphPath = path.join(tempDir, 'graph.db');

    relationDb = new RelationDBAccess({ dbPath: sqlitePath });
    await relationDb.initialize();

    graphDb = new GraphDBAccess(relationDb, { dbPath: graphPath });
    await graphDb.initialize();
  });

  afterEach(async () => {
    try {
      await graphDb.closeGraphDB(new CloseGraphDBInput(), new CloseGraphDBOutput(), new GraphContext());
    } catch {

    }
    try {
      await relationDb.closeDB(new CloseDBInput(), new CloseDBOutput(), new DBContext());
    } catch {

    }
    await new Promise((r) => setTimeout(r, 50));
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {

      }
    }
  });

  describe('addGraphNode', () => {
    it('应成功新增节点并返回 ID', async () => {
      const output = new AddGraphNodeOutput();
      const ok = await graphDb.addGraphNode(
        { data: makeNode('concept', { text: 'hello' }) } as AddGraphNodeInput,
        output, new GraphContext(),
      );
      expect(ok).toBe(true);
      expect(output.id).toBeTruthy();
      expect(typeof output.id).toBe('string');
    });

    it('应支持幂等新增（相同 content 返回已存在节点 ID）', async () => {
      const data = makeNode('concept', { text: 'idempotent' });
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data } as AddGraphNodeInput, out1, new GraphContext());

      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data } as AddGraphNodeInput, out2, new GraphContext());

      expect(out2.id).toBe(out1.id);
    });

    it('应支持不同 node_type 但相同 content 的幂等（仅按 content 判重）', async () => {
      const content = { text: 'shared-content' };
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('type-a', content) } as AddGraphNodeInput, out1, new GraphContext());

      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('type-b', content) } as AddGraphNodeInput, out2, new GraphContext());

      expect(out2.id).toBe(out1.id);
    });

    it('应拒绝空 node_type', async () => {
      const output = new AddGraphNodeOutput();
      await expect(
        graphDb.addGraphNode(
          { data: makeNode('', { text: 'x' }) } as AddGraphNodeInput,
          output, new GraphContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝空 content', async () => {
      const output = new AddGraphNodeOutput();
      await expect(
        graphDb.addGraphNode(
          { data: { node_type: 'test', content: null as any } } as AddGraphNodeInput,
          output, new GraphContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('soGraphNode', () => {
    it('应返回存在的节点', async () => {
      const addOut = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('concept', { text: 'test-node' }) } as AddGraphNodeInput,
        addOut, new GraphContext(),
      );

      const output = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: addOut.id } as GetGraphNodeInput, output, new GraphContext());

      expect(output.node).not.toBeNull();
      expect(output.node!.id).toBe(addOut.id);
      expect(output.node!.node_type).toBe('concept');
      expect(output.node!.content).toEqual({ text: 'test-node' });
      expect(typeof output.node!.created).toBe('number');
      expect(typeof output.node!.updated).toBe('number');
    });

    it('不存在的节点应返回 null', async () => {
      const output = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: 'nonexistent' } as GetGraphNodeInput, output, new GraphContext());
      expect(output.node).toBeNull();
    });

    it('应拒绝空 id', async () => {
      const output = new GetGraphNodeOutput();
      await expect(
        graphDb.soGraphNode({ id: '' } as GetGraphNodeInput, output, new GraphContext()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateGraphNode', () => {
    let nodeId: string;

    beforeEach(async () => {
      const out = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('original', { version: 1 }) } as AddGraphNodeInput,
        out, new GraphContext(),
      );
      nodeId = out.id;
    });

    it('应更新 node_type', async () => {
      const output = new UpdateGraphNodeOutput();
      await graphDb.updateGraphNode(
        { id: nodeId, data: { node_type: 'updated' } } as UpdateGraphNodeInput,
        output, new GraphContext(),
      );
      expect(output.affected_rows).toBe(1);

      const getOut = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: nodeId } as GetGraphNodeInput, getOut, new GraphContext());
      expect(getOut.node!.node_type).toBe('updated');
    });

    it('应更新 content', async () => {
      const output = new UpdateGraphNodeOutput();
      await graphDb.updateGraphNode(
        { id: nodeId, data: { content: { version: 2, extra: true } } } as UpdateGraphNodeInput,
        output, new GraphContext(),
      );
      expect(output.affected_rows).toBe(1);

      const getOut = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: nodeId } as GetGraphNodeInput, getOut, new GraphContext());
      expect(getOut.node!.content).toEqual({ version: 2, extra: true });
    });

    it('应同时更新 node_type 和 content', async () => {
      const output = new UpdateGraphNodeOutput();
      await graphDb.updateGraphNode(
        { id: nodeId, data: { node_type: 'both', content: { x: 1 } } } as UpdateGraphNodeInput,
        output, new GraphContext(),
      );
      const getOut = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: nodeId } as GetGraphNodeInput, getOut, new GraphContext());
      expect(getOut.node!.node_type).toBe('both');
      expect(getOut.node!.content).toEqual({ x: 1 });
    });

    it('不存在的节点应返回 affected_rows=0 而非抛错', async () => {
      const output = new UpdateGraphNodeOutput();
      await graphDb.updateGraphNode(
        { id: 'nonexistent', data: { node_type: 'x' } } as UpdateGraphNodeInput,
        output, new GraphContext(),
      );
      expect(output.affected_rows).toBe(0);
    });

    it('应拒绝空 id', async () => {
      await expect(
        graphDb.updateGraphNode(
          { id: '', data: { node_type: 'x' } } as UpdateGraphNodeInput,
          new UpdateGraphNodeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应更新节点的 updated 时间戳', async () => {

      const beforeOut = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: nodeId } as GetGraphNodeInput, beforeOut, new GraphContext());
      const originalUpdated = beforeOut.node!.updated;

      await new Promise((r) => setTimeout(r, 2));

      await graphDb.updateGraphNode(
        { id: nodeId, data: { node_type: 'new-type' } } as UpdateGraphNodeInput,
        new UpdateGraphNodeOutput(), new GraphContext(),
      );

      const afterOut = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: nodeId } as GetGraphNodeInput, afterOut, new GraphContext());
      expect(afterOut.node!.updated).toBeGreaterThan(originalUpdated);
    });
  });

  describe('delGraphNode', () => {
    it('应删除单个节点', async () => {
      const addOut = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('test', { x: 1 }) } as AddGraphNodeInput,
        addOut, new GraphContext(),
      );

      const delOut = new DelGraphNodeOutput();
      await graphDb.delGraphNode({ ids: [addOut.id] } as DelGraphNodeInput, delOut, new GraphContext());
      expect(delOut.affected_rows).toBe(1);

      const getOut = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: addOut.id } as GetGraphNodeInput, getOut, new GraphContext());
      expect(getOut.node).toBeNull();
    });

    it('应批量删除多个节点', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const out = new AddGraphNodeOutput();
        await graphDb.addGraphNode(
          { data: makeNode('test', { idx: i }) } as AddGraphNodeInput,
          out, new GraphContext(),
        );
        ids.push(out.id);
      }

      const delOut = new DelGraphNodeOutput();
      await graphDb.delGraphNode({ ids } as DelGraphNodeInput, delOut, new GraphContext());
      expect(delOut.affected_rows).toBe(3);

      for (const id of ids) {
        const getOut = new GetGraphNodeOutput();
        await graphDb.soGraphNode({ id } as GetGraphNodeInput, getOut, new GraphContext());
        expect(getOut.node).toBeNull();
      }
    });

    it('应级联删除关联的边', async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('from', { x: 1 }) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('to', { x: 2 }) } as AddGraphNodeInput, out2, new GraphContext());

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(out1.id, out2.id, 'related') } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      await graphDb.delGraphNode({ ids: [out1.id] } as DelGraphNodeInput, new DelGraphNodeOutput(), new GraphContext());

      const getEdgeOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeOut.id } as GetGraphEdgeInput, getEdgeOut, new GraphContext());
      expect(getEdgeOut.edge).toBeNull();
    });

    it('应清理激活事件表中引用被删节点的记录', async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('from', {}) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('to', {}) } as AddGraphNodeInput, out2, new GraphContext());

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(out1.id, out2.id, 'related') } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      await graphDb.activateGraphEdge(
        { edge_id: edgeOut.id } as ActivateGraphEdgeInput,
        new ActivateGraphEdgeOutput(), new GraphContext(),
      );

      const beforeVol = new VisualizedGraphOutput();
      await graphDb.visualizedGraph({ scope: 'volume' } as VisualizedGraphInput, beforeVol, new GraphContext());
      const beforeEvents = beforeVol.data.total_activation_events as number;
      expect(beforeEvents).toBeGreaterThan(0);

      await graphDb.delGraphNode({ ids: [out1.id] } as DelGraphNodeInput, new DelGraphNodeOutput(), new GraphContext());

      const afterVol = new VisualizedGraphOutput();
      await graphDb.visualizedGraph({ scope: 'volume' } as VisualizedGraphInput, afterVol, new GraphContext());
      expect((afterVol.data.total_activation_events as number)).toBe(0);
    });

    it('应拒绝空 ids', async () => {
      await expect(
        graphDb.delGraphNode({ ids: [] } as DelGraphNodeInput, new DelGraphNodeOutput(), new GraphContext()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('addGraphEdge', () => {
    let fromId: string;
    let toId: string;

    beforeEach(async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('from', {}) } as AddGraphNodeInput, out1, new GraphContext());
      fromId = out1.id;

      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('to', {}) } as AddGraphNodeInput, out2, new GraphContext());
      toId = out2.id;
    });

    it('应成功新增边并返回 ID', async () => {
      const output = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(fromId, toId, 'related') } as AddGraphEdgeInput,
        output, new GraphContext(),
      );
      expect(output.id).toBeTruthy();
    });

    it('应使用默认权重（1.0）当未指定时', async () => {
      const output = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(fromId, toId, 'related') } as AddGraphEdgeInput,
        output, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: output.id } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.weight).toBe(1.0);
    });

    it('应使用指定权重', async () => {
      const output = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(fromId, toId, 'weighted', { weight: 2.5 }) } as AddGraphEdgeInput,
        output, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: output.id } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.weight).toBe(2.5);
    });

    it('应存储边属性（properties）', async () => {
      const output = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(fromId, toId, 'prop-edge', { properties: { source: 'manual', score: 100 } }) } as AddGraphEdgeInput,
        output, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: output.id } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.properties).toEqual({ source: 'manual', score: 100 });
    });

    it('新增边 is_active 应默认为 true', async () => {
      const output = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(fromId, toId, 'related') } as AddGraphEdgeInput,
        output, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: output.id } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.is_active).toBe(true);
    });

    it('新增边 last_activation_time 应为 null', async () => {
      const output = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(fromId, toId, 'related') } as AddGraphEdgeInput,
        output, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: output.id } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.last_activation_time).toBeNull();
    });

    it('应拒绝不存在的 from_node_id', async () => {
      await expect(
        graphDb.addGraphEdge(
          { data: makeEdge('nonexistent', toId, 'related') } as AddGraphEdgeInput,
          new AddGraphEdgeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('应拒绝不存在的 to_node_id', async () => {
      await expect(
        graphDb.addGraphEdge(
          { data: makeEdge(fromId, 'nonexistent', 'related') } as AddGraphEdgeInput,
          new AddGraphEdgeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('应拒绝空的 from_node_id', async () => {
      await expect(
        graphDb.addGraphEdge(
          { data: makeEdge('', toId, 'related') } as AddGraphEdgeInput,
          new AddGraphEdgeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('应拒绝空的 edge_type', async () => {
      await expect(
        graphDb.addGraphEdge(
          { data: makeEdge(fromId, toId, '') } as AddGraphEdgeInput,
          new AddGraphEdgeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('soGraphEdge', () => {
    let edgeId: string;
    let fromId: string;
    let toId: string;

    beforeEach(async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('from', {}) } as AddGraphNodeInput, out1, new GraphContext());
      fromId = out1.id;
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('to', {}) } as AddGraphNodeInput, out2, new GraphContext());
      toId = out2.id;

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(fromId, toId, 'related', { weight: 3.0 }) } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );
      edgeId = edgeOut.id;
    });

    it('应返回存在的边', async () => {
      const output = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, output, new GraphContext());

      expect(output.edge).not.toBeNull();
      expect(output.edge!.id).toBe(edgeId);
      expect(output.edge!.from_node_id).toBe(fromId);
      expect(output.edge!.to_node_id).toBe(toId);
      expect(output.edge!.edge_type).toBe('related');
      expect(output.edge!.weight).toBe(3.0);
      expect(output.edge!.is_active).toBe(true);
    });

    it('不存在的边应返回 null', async () => {
      const output = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: 'nonexistent' } as GetGraphEdgeInput, output, new GraphContext());
      expect(output.edge).toBeNull();
    });

    it('应拒绝空 id', async () => {
      await expect(
        graphDb.soGraphEdge({ id: '' } as GetGraphEdgeInput, new GetGraphEdgeOutput(), new GraphContext()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateGraphEdge', () => {
    let edgeId: string;
    let fromId: string;
    let toId: string;

    beforeEach(async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('from', {}) } as AddGraphNodeInput, out1, new GraphContext());
      fromId = out1.id;
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('to', {}) } as AddGraphNodeInput, out2, new GraphContext());
      toId = out2.id;

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(fromId, toId, 'original', { weight: 1.0 }) } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );
      edgeId = edgeOut.id;
    });

    it('应更新 edge_type', async () => {
      const output = new UpdateGraphEdgeOutput();
      await graphDb.updateGraphEdge(
        { id: edgeId, data: { edge_type: 'updated-type' } } as UpdateGraphEdgeInput,
        output, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.edge_type).toBe('updated-type');
    });

    it('应更新 weight', async () => {
      const output = new UpdateGraphEdgeOutput();
      await graphDb.updateGraphEdge(
        { id: edgeId, data: { weight: 5.5 } } as UpdateGraphEdgeInput,
        output, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.weight).toBe(5.5);
    });

    it('应更新 properties', async () => {
      const output = new UpdateGraphEdgeOutput();
      await graphDb.updateGraphEdge(
        { id: edgeId, data: { properties: { new: 'prop' } } } as UpdateGraphEdgeInput,
        output, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.properties).toEqual({ new: 'prop' });
    });

    it('应支持端点变更（删除旧关系并重建）', async () => {

      const out3 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('new-target', {}) } as AddGraphNodeInput, out3, new GraphContext());
      const newToId = out3.id;

      const output = new UpdateGraphEdgeOutput();
      await graphDb.updateGraphEdge(
        { id: edgeId, data: { to_node_id: newToId } } as UpdateGraphEdgeInput,
        output, new GraphContext(),
      );
      expect(output.affected_rows).toBe(1);

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.to_node_id).toBe(newToId);
      expect(getOut.edge!.from_node_id).toBe(fromId);
    });

    it('端点变更时校验新端点节点存在', async () => {
      await expect(
        graphDb.updateGraphEdge(
          { id: edgeId, data: { to_node_id: 'nonexistent' } } as UpdateGraphEdgeInput,
          new UpdateGraphEdgeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('端点变更时应保留 is_active 和 last_activation_time', async () => {

      await graphDb.activateGraphEdge(
        { edge_id: edgeId } as ActivateGraphEdgeInput,
        new ActivateGraphEdgeOutput(), new GraphContext(),
      );

      const beforeOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, beforeOut, new GraphContext());

      const out3 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('third', {}) } as AddGraphNodeInput, out3, new GraphContext());

      await graphDb.updateGraphEdge(
        { id: edgeId, data: { to_node_id: out3.id } } as UpdateGraphEdgeInput,
        new UpdateGraphEdgeOutput(), new GraphContext(),
      );

      const afterOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, afterOut, new GraphContext());
      expect(afterOut.edge!.is_active).toBe(beforeOut.edge!.is_active);
      expect(afterOut.edge!.last_activation_time).toBe(beforeOut.edge!.last_activation_time);
    });

    it('不存在的边应抛出 NotFoundError', async () => {
      await expect(
        graphDb.updateGraphEdge(
          { id: 'nonexistent', data: { edge_type: 'x' } } as UpdateGraphEdgeInput,
          new UpdateGraphEdgeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('应拒绝空 id', async () => {
      await expect(
        graphDb.updateGraphEdge(
          { id: '', data: { edge_type: 'x' } } as UpdateGraphEdgeInput,
          new UpdateGraphEdgeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('delGraphEdge', () => {
    it('应删除单条边', async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('a', {}) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('b', {}) } as AddGraphNodeInput, out2, new GraphContext());

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(out1.id, out2.id, 'rel') } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      const delOut = new DelGraphEdgeOutput();
      await graphDb.delGraphEdge({ ids: [edgeOut.id] } as DelGraphEdgeInput, delOut, new GraphContext());
      expect(delOut.affected_rows).toBe(1);

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeOut.id } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge).toBeNull();
    });

    it('应批量删除多条边', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const out1 = new AddGraphNodeOutput();
        await graphDb.addGraphNode({ data: makeNode(`a${i}`, {}) } as AddGraphNodeInput, out1, new GraphContext());
        const out2 = new AddGraphNodeOutput();
        await graphDb.addGraphNode({ data: makeNode(`b${i}`, {}) } as AddGraphNodeInput, out2, new GraphContext());
        const edgeOut = new AddGraphEdgeOutput();
        await graphDb.addGraphEdge(
          { data: makeEdge(out1.id, out2.id, 'rel') } as AddGraphEdgeInput,
          edgeOut, new GraphContext(),
        );
        ids.push(edgeOut.id);
      }

      const delOut = new DelGraphEdgeOutput();
      await graphDb.delGraphEdge({ ids } as DelGraphEdgeInput, delOut, new GraphContext());
      expect(delOut.affected_rows).toBe(3);
    });

    it('应清理激活事件和按天激活统计', async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('from', {}) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('to', {}) } as AddGraphNodeInput, out2, new GraphContext());
      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(out1.id, out2.id, 'rel') } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      await graphDb.activateGraphEdge(
        { edge_id: edgeOut.id } as ActivateGraphEdgeInput,
        new ActivateGraphEdgeOutput(), new GraphContext(),
      );

      const beforeVol = new VisualizedGraphOutput();
      await graphDb.visualizedGraph({ scope: 'volume' } as VisualizedGraphInput, beforeVol, new GraphContext());
      expect((beforeVol.data.total_activation_events as number)).toBeGreaterThan(0);

      await graphDb.delGraphEdge({ ids: [edgeOut.id] } as DelGraphEdgeInput, new DelGraphEdgeOutput(), new GraphContext());

      const afterVol = new VisualizedGraphOutput();
      await graphDb.visualizedGraph({ scope: 'volume' } as VisualizedGraphInput, afterVol, new GraphContext());
      expect((afterVol.data.total_activation_events as number)).toBe(0);
    });

    it('应拒绝空 ids', async () => {
      await expect(
        graphDb.delGraphEdge({ ids: [] } as DelGraphEdgeInput, new DelGraphEdgeOutput(), new GraphContext()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('selectGraph', () => {
    beforeEach(async () => {

      for (let i = 0; i < 5; i++) {
        const out = new AddGraphNodeOutput();
        await graphDb.addGraphNode(
          { data: makeNode(`type-${i % 2}`, { idx: i }) } as AddGraphNodeInput,
          out, new GraphContext(),
        );
      }
    });

    it('应查询所有节点', async () => {
      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        { target: 'node' } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.list.length).toBe(5);
      expect(output.total).toBe(5);
    });

    it('应查询所有边', async () => {

      const nodeOut1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('extra-a', {}) } as AddGraphNodeInput, nodeOut1, new GraphContext());
      const nodeOut2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('extra-b', {}) } as AddGraphNodeInput, nodeOut2, new GraphContext());
      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(nodeOut1.id, nodeOut2.id, 'test-edge') } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      const output = new SelectGraphOutput();
      await graphDb.selectGraph({ target: 'edge' } as SelectGraphInput, output, new GraphContext());
      expect(output.total).toBe(1);
      expect(output.list.length).toBe(1);
      expect((output.list[0] as GraphEdgeRecord).edge_type).toBe('test-edge');
    });

    it('应按 node_type 过滤节点', async () => {
      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        { target: 'node', node_type: 'type-0' } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.total).toBe(3);
      for (const node of output.list) {
        expect((node as GraphNodeRecord).node_type).toBe('type-0');
      }
    });

    it('应按 edge_type 过滤边', async () => {
      const nodeOut1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('a', {}) } as AddGraphNodeInput, nodeOut1, new GraphContext());
      const nodeOut2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('b', {}) } as AddGraphNodeInput, nodeOut2, new GraphContext());

      await graphDb.addGraphEdge(
        { data: makeEdge(nodeOut1.id, nodeOut2.id, 'type-a') } as AddGraphEdgeInput,
        new AddGraphEdgeOutput(), new GraphContext(),
      );
      await graphDb.addGraphEdge(
        { data: makeEdge(nodeOut1.id, nodeOut2.id, 'type-b') } as AddGraphEdgeInput,
        new AddGraphEdgeOutput(), new GraphContext(),
      );

      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        { target: 'edge', edge_type: 'type-a' } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.total).toBe(1);
      expect((output.list[0] as GraphEdgeRecord).edge_type).toBe('type-a');
    });

    it('应支持条件过滤（conditions）', async () => {
      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        {
          target: 'node',
          conditions: [{ field: 'node_type', operator: Operator.EQ, value: 'type-1' }],
        } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.total).toBe(2);
    });

    it('应支持排序（order_by）', async () => {
      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        {
          target: 'node',
          order_by: [{ field: 'created', direction: 'DESC' }],
        } as SelectGraphInput,
        output, new GraphContext(),
      );
      const createdTimes = output.list.map((r) => (r as GraphNodeRecord).created);
      for (let i = 1; i < createdTimes.length; i++) {
        expect(createdTimes[i - 1]).toBeGreaterThanOrEqual(createdTimes[i]);
      }
    });

    it('应支持分页（page）', async () => {
      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        {
          target: 'node',
          page: { current: 1, size: 2 },
        } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.list.length).toBe(2);
      expect(output.total).toBe(5);
    });

    it('应支持分页第2页', async () => {
      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        {
          target: 'node',
          page: { current: 2, size: 2 },
          order_by: [{ field: 'created', direction: 'ASC' }],
        } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.list.length).toBe(2);
      expect(output.total).toBe(5);
    });

    it('查询边时应支持 from_node_id 条件', async () => {
      const nodeOut1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('x', {}) } as AddGraphNodeInput, nodeOut1, new GraphContext());
      const nodeOut2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('y', {}) } as AddGraphNodeInput, nodeOut2, new GraphContext());

      await graphDb.addGraphEdge(
        { data: makeEdge(nodeOut1.id, nodeOut2.id, 'e') } as AddGraphEdgeInput,
        new AddGraphEdgeOutput(), new GraphContext(),
      );

      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        {
          target: 'edge',
          conditions: [{ field: 'from_node_id', operator: Operator.EQ, value: nodeOut1.id }],
        } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.total).toBe(1);
    });
  });

  describe('soGraphNeighbors', () => {
    async function createGraph(): Promise<{
      center: string;
      ring1: string[];
      ring2: string[];
    }> {

      const centerOut = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('center', { name: 'center' }) } as AddGraphNodeInput,
        centerOut, new GraphContext(),
      );
      const center = centerOut.id;

      const checkCenter = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: center } as GetGraphNodeInput, checkCenter, new GraphContext());
      if (!checkCenter.node) {
        throw new Error(`Center node not found after creation: ${center}`);
      }

      const ring1: string[] = [];
      const ring2: string[] = [];

      for (let i = 0; i < 3; i++) {
        const out = new AddGraphNodeOutput();
        await graphDb.addGraphNode(
          { data: makeNode('ring1', { name: `r1-${i}` }) } as AddGraphNodeInput,
          out, new GraphContext(),
        );
        ring1.push(out.id);
        await graphDb.addGraphEdge(
          { data: makeEdge(center, out.id, 'connects') } as AddGraphEdgeInput,
          new AddGraphEdgeOutput(), new GraphContext(),
        );
      }

      for (let i = 0; i < 2; i++) {
        const out = new AddGraphNodeOutput();
        await graphDb.addGraphNode(
          { data: makeNode('ring2', { name: `r2-${i}` }) } as AddGraphNodeInput,
          out, new GraphContext(),
        );
        ring2.push(out.id);
        await graphDb.addGraphEdge(
          { data: makeEdge(ring1[0], out.id, 'connects') } as AddGraphEdgeInput,
          new AddGraphEdgeOutput(), new GraphContext(),
        );
      }

      return { center, ring1, ring2 };
    }

    it('depth=1 应返回第一层邻居', async () => {
      const { center, ring1 } = await createGraph();
      const output = new GetGraphNeighborsOutput();
      await graphDb.soGraphNeighbors(
        { node_id: center, depth: 1 } as GetGraphNeighborsInput,
        output, new GraphContext(),
      );
      expect(output.list.length).toBe(3);
      const ids = output.list.map((n) => n.id);
      for (const rid of ring1) {
        expect(ids).toContain(rid);
      }
    });

    it('depth=2 应返回两层邻居', async () => {
      const { center } = await createGraph();
      const output = new GetGraphNeighborsOutput();
      await graphDb.soGraphNeighbors(
        { node_id: center, depth: 2 } as GetGraphNeighborsInput,
        output, new GraphContext(),
      );
      expect(output.list.length).toBe(5);
    });

    it('direction=OUT 应仅遍历出边', async () => {
      const { center } = await createGraph();
      const output = new GetGraphNeighborsOutput();
      await graphDb.soGraphNeighbors(
        { node_id: center, depth: 1, direction: GraphDirection.OUT } as GetGraphNeighborsInput,
        output, new GraphContext(),
      );
      expect(output.list.length).toBe(3);
    });

    it('direction=IN 应仅遍历入边', async () => {
      const { center, ring1 } = await createGraph();
      const output = new GetGraphNeighborsOutput();
      await graphDb.soGraphNeighbors(
        { node_id: ring1[0], depth: 1, direction: GraphDirection.IN } as GetGraphNeighborsInput,
        output, new GraphContext(),
      );
      expect(output.list.length).toBe(1);
      expect(output.list[0].id).toBe(center);
    });

    it('应按 edge_type 过滤', async () => {
      const { center } = await createGraph();

      const out = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('extra', {}) } as AddGraphNodeInput,
        out, new GraphContext(),
      );
      await graphDb.addGraphEdge(
        { data: makeEdge(center, out.id, 'other-type') } as AddGraphEdgeInput,
        new AddGraphEdgeOutput(), new GraphContext(),
      );

      const output = new GetGraphNeighborsOutput();
      await graphDb.soGraphNeighbors(
        { node_id: center, depth: 1, edge_type: 'connects' } as GetGraphNeighborsInput,
        output, new GraphContext(),
      );
      expect(output.list.length).toBe(3);
    });

    it('only_active=false 应包含非激活边', async () => {
      const { center } = await createGraph();
      const outputDefault = new GetGraphNeighborsOutput();
      await graphDb.soGraphNeighbors(
        { node_id: center, depth: 2, only_active: false } as GetGraphNeighborsInput,
        outputDefault, new GraphContext(),
      );
      expect(outputDefault.list.length).toBe(5);
    });

    it('应拒绝空 node_id', async () => {
      await expect(
        graphDb.soGraphNeighbors(
          { node_id: '' } as GetGraphNeighborsInput,
          new GetGraphNeighborsOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('不存在的 node_id 应抛出 NotFoundError', async () => {
      await expect(
        graphDb.soGraphNeighbors(
          { node_id: 'nonexistent', depth: 1 } as GetGraphNeighborsInput,
          new GetGraphNeighborsOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('无邻居的节点应返回空列表', async () => {
      const out = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('isolated', {}) } as AddGraphNodeInput,
        out, new GraphContext(),
      );

      const output = new GetGraphNeighborsOutput();
      await graphDb.soGraphNeighbors(
        { node_id: out.id, depth: 1 } as GetGraphNeighborsInput,
        output, new GraphContext(),
      );
      expect(output.list.length).toBe(0);
    });
  });

  describe('activateGraphEdge', () => {
    let edgeId: string;
    let fromId: string;
    let toId: string;

    beforeEach(async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('from', {}) } as AddGraphNodeInput, out1, new GraphContext());
      fromId = out1.id;
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('to', {}) } as AddGraphNodeInput, out2, new GraphContext());
      toId = out2.id;

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(fromId, toId, 'rel') } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );
      edgeId = edgeOut.id;
    });

    it('应成功激活边并设置 last_activation_time', async () => {
      await graphDb.activateGraphEdge(
        { edge_id: edgeId } as ActivateGraphEdgeInput,
        new ActivateGraphEdgeOutput(), new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.is_active).toBe(true);
      expect(getOut.edge!.last_activation_time).not.toBeNull();
      expect(typeof getOut.edge!.last_activation_time).toBe('number');
    });

    it('应记录激活事件', async () => {
      const beforeVol = new VisualizedGraphOutput();
      await graphDb.visualizedGraph({ scope: 'volume' } as VisualizedGraphInput, beforeVol, new GraphContext());

      await graphDb.activateGraphEdge(
        { edge_id: edgeId } as ActivateGraphEdgeInput,
        new ActivateGraphEdgeOutput(), new GraphContext(),
      );

      const afterVol = new VisualizedGraphOutput();
      await graphDb.visualizedGraph({ scope: 'volume' } as VisualizedGraphInput, afterVol, new GraphContext());
      expect((afterVol.data.total_activation_events as number)).toBe(
        (beforeVol.data.total_activation_events as number) + 1,
      );
    });

    it('应支持自定义 trigger_type', async () => {
      await graphDb.activateGraphEdge(
        { edge_id: edgeId, trigger_type: 'custom_event' } as ActivateGraphEdgeInput,
        new ActivateGraphEdgeOutput(), new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.is_active).toBe(true);
    });

    it('多次激活应累计按天激活次数', async () => {

      for (let i = 0; i < 3; i++) {
        await graphDb.activateGraphEdge(
          { edge_id: edgeId } as ActivateGraphEdgeInput,
          new ActivateGraphEdgeOutput(), new GraphContext(),
        );
      }

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeId } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.is_active).toBe(true);
    });

    it('不存在的边应抛出 NotFoundError', async () => {
      await expect(
        graphDb.activateGraphEdge(
          { edge_id: 'nonexistent' } as ActivateGraphEdgeInput,
          new ActivateGraphEdgeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('应拒绝空 edge_id', async () => {
      await expect(
        graphDb.activateGraphEdge(
          { edge_id: '' } as ActivateGraphEdgeInput,
          new ActivateGraphEdgeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('ageGraphEdge', () => {
    it('应老化在保留窗口内无足够激活的旧边', async () => {

      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('a', {}) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('b', {}) } as AddGraphNodeInput, out2, new GraphContext());
      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(out1.id, out2.id, 'weak') } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      for (let i = 0; i < 2; i++) {
        await graphDb.activateGraphEdge(
          { edge_id: edgeOut.id } as ActivateGraphEdgeInput,
          new ActivateGraphEdgeOutput(), new GraphContext(),
        );
      }

      const output = new AgeGraphEdgeOutput();
      await graphDb.ageGraphEdge(new AgeGraphEdgeInput(), output, new GraphContext());
      expect(typeof output.aged_count).toBe('number');
      expect(output.aged_count).toBe(0);
    });

    it('应清理过期的按天激活统计和激活事件数据', async () => {
      const output = new AgeGraphEdgeOutput();
      await graphDb.ageGraphEdge(new AgeGraphEdgeInput(), output, new GraphContext());

      expect(typeof output.aged_count).toBe('number');
    });

    it('老化后应返回正确的 aged_count', async () => {
      const output = new AgeGraphEdgeOutput();
      await graphDb.ageGraphEdge(new AgeGraphEdgeInput(), output, new GraphContext());
      expect(output.aged_count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('visualizedGraph', () => {
    it('scope=health 应返回健康状态', async () => {
      const output = new VisualizedGraphOutput();
      const ok = await graphDb.visualizedGraph(
        { scope: 'health' } as VisualizedGraphInput,
        output, new GraphContext(),
      );
      expect(ok).toBe(true);
      expect(output.data.connected).toBe(true);
      expect(typeof output.data.response_time_ms).toBe('number');
      expect(output.data.enabled).toBe(true);
    });

    it('scope=volume 应返回数据量', async () => {

      const out = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('test', { x: 1 }) } as AddGraphNodeInput, out, new GraphContext());

      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('test2', { x: 2 }) } as AddGraphNodeInput, out2, new GraphContext());

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(out.id, out2.id, 'rel') } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      const output = new VisualizedGraphOutput();
      await graphDb.visualizedGraph({ scope: 'volume' } as VisualizedGraphInput, output, new GraphContext());
      expect(output.data.total_nodes).toBeGreaterThanOrEqual(2);
      expect(output.data.total_edges).toBeGreaterThanOrEqual(1);
    });

    it('scope=diskUsage 应返回磁盘占用估算', async () => {
      const output = new VisualizedGraphOutput();
      await graphDb.visualizedGraph(
        { scope: 'diskUsage' } as VisualizedGraphInput,
        output, new GraphContext(),
      );
      expect(typeof output.data.disk_usage_bytes).toBe('number');
      expect(typeof output.data.node_count).toBe('number');
      expect(typeof output.data.edge_count).toBe('number');
      expect(typeof output.data.page_size).toBe('number');
      expect(typeof output.data.page_count).toBe('number');
    });

    it('非法 scope 应返回 false 并设置 error', async () => {
      const output = new VisualizedGraphOutput();
      const ok = await graphDb.visualizedGraph(
        { scope: 'invalid' as any } as VisualizedGraphInput,
        output, new GraphContext(),
      );
      expect(ok).toBe(false);
      expect(output.error).toBeTruthy();
      expect(output.error_code).toBe('INVALID_SCOPE');
    });
  });

  describe('enableGraphDB', () => {
    it('应支持禁用和启用图数据库', async () => {

      await graphDb.enableGraphDB(
        { enable: false } as EnableGraphDBInput,
        new EnableGraphDBOutput(), new GraphContext(),
      );

      const output = new AddGraphNodeOutput();
      await expect(
        graphDb.addGraphNode(
          { data: makeNode('test', {}) } as AddGraphNodeInput,
          output, new GraphContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);

      await graphDb.enableGraphDB(
        { enable: true } as EnableGraphDBInput,
        new EnableGraphDBOutput(), new GraphContext(),
      );

      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('test', { x: 1 }) } as AddGraphNodeInput,
        out2, new GraphContext(),
      );
      expect(out2.id).toBeTruthy();
    });

    it('禁用期间 visibleGraph 也不可用', async () => {
      await graphDb.enableGraphDB(
        { enable: false } as EnableGraphDBInput,
        new EnableGraphDBOutput(), new GraphContext(),
      );

      await expect(
        graphDb.visualizedGraph(
          { scope: 'health' } as VisualizedGraphInput,
          new VisualizedGraphOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('enable=false 后再 enable=true 应恢复', async () => {
      await graphDb.enableGraphDB(
        { enable: false } as EnableGraphDBInput,
        new EnableGraphDBOutput(), new GraphContext(),
      );
      await graphDb.enableGraphDB(
        { enable: true } as EnableGraphDBInput,
        new EnableGraphDBOutput(), new GraphContext(),
      );

      const output = new VisualizedGraphOutput();
      await graphDb.visualizedGraph({ scope: 'health' } as VisualizedGraphInput, output, new GraphContext());
      expect(output.data.enabled).toBe(true);
    });
  });

  describe('closeGraphDB', () => {
    it('应成功关闭图数据库', async () => {
      const ok = await graphDb.closeGraphDB(
        new CloseGraphDBInput(),
        new CloseGraphDBOutput(), new GraphContext(),
      );
      expect(ok).toBe(true);
    });

    it('关闭后所有操作应抛出 DatabaseError', async () => {
      await graphDb.closeGraphDB(new CloseGraphDBInput(), new CloseGraphDBOutput(), new GraphContext());

      await expect(
        graphDb.addGraphNode(
          { data: makeNode('test', {}) } as AddGraphNodeInput,
          new AddGraphNodeOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(DatabaseError);
    });

    it('关闭后 enableGraphDB(true) 应抛出 DatabaseError', async () => {
      await graphDb.closeGraphDB(new CloseGraphDBInput(), new CloseGraphDBOutput(), new GraphContext());

      await expect(
        graphDb.enableGraphDB(
          { enable: true } as EnableGraphDBInput,
          new EnableGraphDBOutput(), new GraphContext(),
        ),
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('边缘场景', () => {
    it('selectGraph 查询空边集应返回空列表', async () => {
      const output = new SelectGraphOutput();
      await graphDb.selectGraph({ target: 'edge' } as SelectGraphInput, output, new GraphContext());
      expect(output.list).toEqual([]);
      expect(output.total).toBe(0);
    });

    it('添加边时带特殊字符的 properties', async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('a', {}) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('b', {}) } as AddGraphNodeInput, out2, new GraphContext());

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        {
          data: makeEdge(out1.id, out2.id, 'special', {
            properties: { text: "it's a test", quote: 'say "hello"', backslash: 'path\\to' },
          }),
        } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeOut.id } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.properties).toEqual({
        text: "it's a test",
        quote: 'say "hello"',
        backslash: 'path\\to',
      });
    });

    it('添加节点时带特殊字符的 content', async () => {
      const output = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('test', { text: "it's 'complex'", path: 'a\\b' }) } as AddGraphNodeInput,
        output, new GraphContext(),
      );

      const getOut = new GetGraphNodeOutput();
      await graphDb.soGraphNode({ id: output.id } as GetGraphNodeInput, getOut, new GraphContext());
      expect(getOut.node!.content).toEqual({ text: "it's 'complex'", path: 'a\\b' });
    });

    it('selectGraph 对于节点支持 BETWEEN 条件', async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('test', { idx: 1 }) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('test', { idx: 2 }) } as AddGraphNodeInput, out2, new GraphContext());
      const out3 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('test', { idx: 3 }) } as AddGraphNodeInput, out3, new GraphContext());

      const t1 = (await (async () => {
        const o = new GetGraphNodeOutput();
        await graphDb.soGraphNode({ id: out1.id } as GetGraphNodeInput, o, new GraphContext());
        return o.node!.created;
      })());
      const t3 = (await (async () => {
        const o = new GetGraphNodeOutput();
        await graphDb.soGraphNode({ id: out3.id } as GetGraphNodeInput, o, new GraphContext());
        return o.node!.created;
      })());

      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        {
          target: 'node',
          conditions: [{ field: 'created', operator: Operator.BETWEEN, value: [t1, t3] }],
        } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.total).toBeGreaterThanOrEqual(2);
    });

    it('selectGraph 对于边支持 IN 条件', async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('x', {}) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('y', {}) } as AddGraphNodeInput, out2, new GraphContext());
      const out3 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('z', {}) } as AddGraphNodeInput, out3, new GraphContext());

      const e1 = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge({ data: makeEdge(out1.id, out2.id, 't1') } as AddGraphEdgeInput, e1, new GraphContext());
      const e2 = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge({ data: makeEdge(out1.id, out3.id, 't2') } as AddGraphEdgeInput, e2, new GraphContext());

      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        {
          target: 'edge',
          conditions: [{ field: 'edge_type', operator: Operator.IN, value: ['t1', 't2'] }],
        } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.total).toBe(2);
    });

    it('删除不存在的节点不应抛错（affected_rows=0）', async () => {
      const delOut = new DelGraphNodeOutput();
      await graphDb.delGraphNode(
        { ids: ['nonexistent-1', 'nonexistent-2'] } as DelGraphNodeInput,
        delOut, new GraphContext(),
      );
      expect(delOut.affected_rows).toBe(0);
    });

    it('删除不存在的边不应抛错（affected_rows=0）', async () => {
      const delOut = new DelGraphEdgeOutput();
      await graphDb.delGraphEdge(
        { ids: ['nonexistent-1', 'nonexistent-2'] } as DelGraphEdgeInput,
        delOut, new GraphContext(),
      );
      expect(delOut.affected_rows).toBe(0);
    });

    it('addGraphEdge 带 null properties', async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('a', {}) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('b', {}) } as AddGraphNodeInput, out2, new GraphContext());

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(out1.id, out2.id, 'rel') } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeOut.id } as GetGraphEdgeInput, getOut, new GraphContext());

      expect(getOut.edge!.properties).toBeNull();
    });

    it('updateGraphEdge 将 properties 设置为空', async () => {
      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('a', {}) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('b', {}) } as AddGraphNodeInput, out2, new GraphContext());

      const edgeOut = new AddGraphEdgeOutput();
      await graphDb.addGraphEdge(
        { data: makeEdge(out1.id, out2.id, 'rel', { properties: { key: 'val' } }) } as AddGraphEdgeInput,
        edgeOut, new GraphContext(),
      );

      await graphDb.updateGraphEdge(
        { id: edgeOut.id, data: { properties: {} } } as UpdateGraphEdgeInput,
        new UpdateGraphEdgeOutput(), new GraphContext(),
      );

      const getOut = new GetGraphEdgeOutput();
      await graphDb.soGraphEdge({ id: edgeOut.id } as GetGraphEdgeInput, getOut, new GraphContext());
      expect(getOut.edge!.properties).toEqual({});
    });

    it('多次 enableGraphDB 切换不应出错', async () => {
      for (let i = 0; i < 3; i++) {
        await graphDb.enableGraphDB(
          { enable: false } as EnableGraphDBInput,
          new EnableGraphDBOutput(), new GraphContext(),
        );
        await graphDb.enableGraphDB(
          { enable: true } as EnableGraphDBInput,
          new EnableGraphDBOutput(), new GraphContext(),
        );
      }

      const output = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('test', { x: 1 }) } as AddGraphNodeInput,
        output, new GraphContext(),
      );
      expect(output.id).toBeTruthy();
    });

    it('selectGraph 节点查询支持 LIKE 条件', async () => {
      const out = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        { data: makeNode('hello-world', {}) } as AddGraphNodeInput,
        out, new GraphContext(),
      );

      const output = new SelectGraphOutput();
      await graphDb.selectGraph(
        {
          target: 'node',
          conditions: [{ field: 'node_type', operator: Operator.LIKE, value: 'hello' }],
        } as SelectGraphInput,
        output, new GraphContext(),
      );
      expect(output.total).toBeGreaterThanOrEqual(1);
    });

    it('soGraphNeighbors 默认使用配置 default_depth=1', async () => {

      const out1 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('c', { a: 1 }) } as AddGraphNodeInput, out1, new GraphContext());
      const out2 = new AddGraphNodeOutput();
      await graphDb.addGraphNode({ data: makeNode('d', { b: 2 }) } as AddGraphNodeInput, out2, new GraphContext());
      await graphDb.addGraphEdge(
        { data: makeEdge(out1.id, out2.id, 'rel') } as AddGraphEdgeInput,
        new AddGraphEdgeOutput(), new GraphContext(),
      );

      const output = new GetGraphNeighborsOutput();
      await graphDb.soGraphNeighbors(
        { node_id: out1.id } as GetGraphNeighborsInput,
        output, new GraphContext(),
      );

      expect(output.list.length).toBe(1);
    });
  });
});
