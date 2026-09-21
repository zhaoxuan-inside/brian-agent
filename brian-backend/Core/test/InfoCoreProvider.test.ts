import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  LLMAccess,
  PromptsAccess,
  VectorDBAccess,
  GraphDBAccess,
  Operator,
  IdGenerator,
  CollectionSource,
  HandleResultType,
} from '@brian-agent/base';
import {
  InfoCoreAccess,
  InfoCoreContext,
  SaveInfoInput,
  SaveInfoOutput,
  PinInfoInput,
  PinInfoOutput,
  ProcessInfoInput,
  VectorInfoOutput,
  TagInfoOutput,
  SummaryInfoOutput,
  KeywordInfoOutput,
  GraphTagInput,
  GraphTagOutput,
  LastNInfoInput,
  LastNInfoOutput,
  GraphNInfoInput,
  GraphNInfoOutput,
  SimilarKInfoInput,
  SimilarKInfoOutput,
  KeywordKInfoInput,
  KeywordKInfoOutput,
  RelationKInfoInput,
  RelationKInfoOutput,
  GraphInfoInput,
  GraphInfoOutput,
  ContextInfoInput,
  ContextInfoOutput,
  SoInfoTagConfigInput,
  SoInfoTagConfigOutput,
  UpdateInfoTagConfigInput,
  UpdateInfoTagConfigOutput,
  SoInfoSummaryConfigInput,
  SoInfoSummaryConfigOutput,
  UpdateInfoSummaryConfigInput,
  UpdateInfoSummaryConfigOutput,
  SoInfoConfigInput,
  SoInfoConfigOutput,
  UpdateInfoConfigInput,
  UpdateInfoConfigOutput,
  SoInfoVectorConfigInput,
  SoInfoVectorConfigOutput,
  UpdateInfoVectorConfigInput,
  UpdateInfoVectorConfigOutput,
  SoInfoContextConfigInput,
  SoInfoContextConfigOutput,
  UpdateInfoContextConfigInput,
  UpdateInfoContextConfigOutput,
  DelInfoInput,
  DelInfoOutput,
  ExistInfoInput,
  ExistInfoOutput,
} from '../InfoCoreProvider';
import { ValidationError, NotFoundError } from '../shared/errors';

describe('InfoCoreProvider', () => {
  let tempDir: string;
  let dbPath: string;
  let relationDb: RelationDBAccess;
  let llmAccess: LLMAccess;
  let promptsAccess: PromptsAccess;
  let vectorDb: VectorDBAccess;
  let graphDb: GraphDBAccess;
  let infoCore: InfoCoreAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-info-'));
    dbPath = path.join(tempDir, 'test.db');
    relationDb = new RelationDBAccess({ dbPath });
    await relationDb.initialize();
    llmAccess = new LLMAccess(relationDb);
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    vectorDb = new VectorDBAccess(relationDb, { lancePath: path.join(tempDir, 'vectordb') });
    await vectorDb.initialize(8);
    graphDb = new GraphDBAccess(relationDb, { dbPath: path.join(tempDir, 'graph.db') });
    await graphDb.initialize();
    infoCore = new InfoCoreAccess(relationDb, llmAccess, promptsAccess, vectorDb, graphDb);
    await infoCore.initialize();
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function makeSaveInput(overrides?: Partial<SaveInfoInput>): SaveInfoInput {
    const input = new SaveInfoInput();
    input.session_id = overrides?.session_id ?? `session-${IdGenerator.generate()}`;
    input.work_id = overrides?.work_id ?? `work-${IdGenerator.generate()}`;
    input.run_id = overrides?.run_id ?? `interact-${IdGenerator.generate()}`;
    input.info_creator_id = overrides?.info_creator_id ?? 'user-1';
    input.info_creator_role = overrides?.info_creator_role ?? 'user';
    input.info = overrides?.info ?? '这是一条测试信息 This is a test information message for testing purposes';
    input.parent_info_ids = overrides?.parent_info_ids;
    input.summary = overrides?.summary;
    input.handle_result_type = overrides?.handle_result_type;
    return input;
  }

  // =========================================================================
  // Write Operations
  // =========================================================================

  describe('saveInfo', () => {
    it('should save raw info and return info_id', async () => {
      const input = makeSaveInput();
      const output = new SaveInfoOutput();

      await infoCore.saveInfo(input, output, new InfoCoreContext());
      expect(output.info_id).toBeTruthy();
      expect(typeof output.info_id).toBe('string');
    });

    it('should throw ValidationError when info is empty', async () => {
      const input = makeSaveInput({ info: '' });

      await expect(
        infoCore.saveInfo(input, new SaveInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when session_id is empty', async () => {
      const input = makeSaveInput({ session_id: '' });

      await expect(
        infoCore.saveInfo(input, new SaveInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should create graph edges when parent_info_ids provided', async () => {
      const parentInput = makeSaveInput({ session_id: 'graph-session' });
      const parentOut = new SaveInfoOutput();
      await infoCore.saveInfo(parentInput, parentOut, new InfoCoreContext());

      const childInput = makeSaveInput({
        session_id: 'graph-session',
        parent_info_ids: [parentOut.info_id],
      });
      const childOut = new SaveInfoOutput();
      await infoCore.saveInfo(childInput, childOut, new InfoCoreContext());
      expect(childOut.info_id).toBeTruthy();
      expect(childOut.info_id).not.toBe(parentOut.info_id);
    });

    it('should reject empty work_id but allow empty run_id', async () => {
      const input = makeSaveInput({ work_id: '' });
      await expect(
        infoCore.saveInfo(input, new SaveInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);

      const okInput = makeSaveInput({ run_id: '' });
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(okInput, output, new InfoCoreContext());
      expect(output.info_id).toBeTruthy();
    });

    it('should handle empty info_creator_id and info_creator_role', async () => {
      const input = makeSaveInput({ info_creator_id: '', info_creator_role: '' });
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(input, output, new InfoCoreContext());
      expect(output.info_id).toBeTruthy();
    });

    it('should set elapsed_ms on output', async () => {
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), output, new InfoCoreContext());
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('should persist summary when provided', async () => {
      const input = makeSaveInput({ summary: '这是预生成的摘要' });
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(input, output, new InfoCoreContext());

      const rows = await relationDb.select('info_summary', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: output.info_id }],
      });
      expect(rows.length).toBe(1);
      expect(rows[0].summary).toBe('这是预生成的摘要');
    });

    it('should not create summary when summary not provided', async () => {
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), output, new InfoCoreContext());

      const rows = await relationDb.select('info_summary', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: output.info_id }],
      });
      expect(rows.length).toBe(0);
    });
  });

  describe('pinInfo', () => {
    it('should toggle pin status from 0 to 1', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), saveOut, new InfoCoreContext());

      const input = new PinInfoInput();
      input.info_id = saveOut.info_id;
      await infoCore.pinInfo(input, new PinInfoOutput(), new InfoCoreContext());

      // Verify by checking lastNInfo result
      const lastNOut = new LastNInfoOutput();
      const lastNInput = new LastNInfoInput();
      lastNInput.info_id = saveOut.info_id;
      lastNInput.lastN = 1;
      await infoCore.lastNInfo(lastNInput, lastNOut, new InfoCoreContext());
      expect(lastNOut.list[0].pin).toBe(1);
    });

    it('should toggle pin status from 1 to 0', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), saveOut, new InfoCoreContext());

      const toggleOn = new PinInfoInput();
      toggleOn.info_id = saveOut.info_id;
      await infoCore.pinInfo(toggleOn, new PinInfoOutput(), new InfoCoreContext());

      const toggleOff = new PinInfoInput();
      toggleOff.info_id = saveOut.info_id;
      await infoCore.pinInfo(toggleOff, new PinInfoOutput(), new InfoCoreContext());

      const lastNOut = new LastNInfoOutput();
      const lastNInput = new LastNInfoInput();
      lastNInput.info_id = saveOut.info_id;
      lastNInput.lastN = 1;
      await infoCore.lastNInfo(lastNInput, lastNOut, new InfoCoreContext());
      expect(lastNOut.list[0].pin).toBe(0);
    });

    it('should throw NotFoundError when info_id does not exist', async () => {
      const input = new PinInfoInput();
      input.info_id = 'nonexistent-info';

      await expect(
        infoCore.pinInfo(input, new PinInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when info_id is empty', async () => {
      const input = new PinInfoInput();
      input.info_id = '';

      await expect(
        infoCore.pinInfo(input, new PinInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // Process Operations
  // =========================================================================

  describe('vectorInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ProcessInfoInput();
      input.info_id = '';

      await expect(
        infoCore.vectorInfo(input, new VectorInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when info does not exist', async () => {
      const input = new ProcessInfoInput();
      input.info_id = 'nonexistent';

      await expect(
        infoCore.vectorInfo(input, new VectorInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(NotFoundError);
    });

    it('should return early when vector config is disabled', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), saveOut, new InfoCoreContext());

      await infoCore.updateInfoVectorConfig(
        { enable: 0 } as UpdateInfoVectorConfigInput,
        new UpdateInfoVectorConfigOutput(), new InfoCoreContext(),
      );

      const input = new ProcessInfoInput();
      input.info_id = saveOut.info_id;
      const output = new VectorInfoOutput();
      const result = await infoCore.vectorInfo(input, output, new InfoCoreContext());
      expect(result).toBe(true);
    });
  });

  describe('tagInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ProcessInfoInput();
      input.info_id = '';

      await expect(
        infoCore.tagInfo(input, new TagInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return early when tag config is disabled', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), saveOut, new InfoCoreContext());

      await infoCore.updateInfoTagConfig(
        { enable: 0 } as UpdateInfoTagConfigInput,
        new UpdateInfoTagConfigOutput(), new InfoCoreContext(),
      );

      const input = new ProcessInfoInput();
      input.info_id = saveOut.info_id;
      const output = new TagInfoOutput();
      const result = await infoCore.tagInfo(input, output, new InfoCoreContext());
      expect(result).toBe(true);
    });
  });

  describe('summaryInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ProcessInfoInput();
      input.info_id = '';

      await expect(
        infoCore.summaryInfo(input, new SummaryInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should use raw info as summary when content within threshold', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ info: '短内容' }), saveOut, new InfoCoreContext());

      const input = new ProcessInfoInput();
      input.info_id = saveOut.info_id;
      const output = new SummaryInfoOutput();
      await infoCore.summaryInfo(input, output, new InfoCoreContext());
      expect(output.summary_id).toBeTruthy();

      const rows = await relationDb.select('info_summary', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: saveOut.info_id }],
      });
      expect(rows.length).toBe(1);
      expect(rows[0].summary).toBe('短内容');
    });
  });

  describe('keywordInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ProcessInfoInput();
      input.info_id = '';

      await expect(
        infoCore.keywordInfo(input, new KeywordInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('handle_result_type（错误信息隔离）', () => {
    it('saveInfo 错误信息落库 handle_result_type，且摘要为原文', async () => {
      const input = makeSaveInput({
        info: 'Skill 执行失败：参数非法',
        handle_result_type: HandleResultType.CALL_ERROR,
        summary: '不应被采用的人工摘要',
      });
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(input, output, new InfoCoreContext());

      const rows = await relationDb.select('info_raw', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: output.info_id }],
      });
      expect(rows.length).toBe(1);
      expect(rows[0].handle_result_type).toBe(HandleResultType.CALL_ERROR);

      // 错误信息摘要直接用原文，忽略传入的人工摘要
      const summaryRows = await relationDb.select('info_summary', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: output.info_id }],
      });
      expect(summaryRows.length).toBe(1);
      expect(summaryRows[0].summary).toBe('Skill 执行失败：参数非法');
    });

    it('错误信息不参与自学习：vectorInfo/tagInfo/keywordInfo 均不落库', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(
        makeSaveInput({ info: '网络连接超时 ECONNREFUSED', handle_result_type: HandleResultType.INTERNAL_ERROR }),
        saveOut, new InfoCoreContext(),
      );

      const input = new ProcessInfoInput();
      input.info_id = saveOut.info_id;

      await infoCore.vectorInfo(input, new VectorInfoOutput(), new InfoCoreContext());
      await infoCore.tagInfo(input, new TagInfoOutput(), new InfoCoreContext());
      await infoCore.keywordInfo(input, new KeywordInfoOutput(), new InfoCoreContext());

      const vectorRows = await relationDb.select('info_vector', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: saveOut.info_id }],
      });
      const tagRows = await relationDb.select('info_tag', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: saveOut.info_id }],
      });
      const keywordRows = await relationDb.select('info_keyword', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: saveOut.info_id }],
      });

      expect(vectorRows.length).toBe(0);
      expect(tagRows.length).toBe(0);
      expect(keywordRows.length).toBe(0);
    });

    it('lastNInfo 支持按 handle_result_type 过滤', async () => {
      const a = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-hr', info: '正常信息' }), a, new InfoCoreContext());
      const b = new SaveInfoOutput();
      await infoCore.saveInfo(
        makeSaveInput({ session_id: 's-hr', info: '错误信息', handle_result_type: HandleResultType.INTERNAL_ERROR }),
        b, new InfoCoreContext(),
      );

      const errInput = new LastNInfoInput();
      errInput.session_id = 's-hr';
      errInput.lastN = 10;
      errInput.handle_result_type = HandleResultType.INTERNAL_ERROR;
      const errOut = new LastNInfoOutput();
      await infoCore.lastNInfo(errInput, errOut, new InfoCoreContext());
      expect(errOut.list.length).toBe(1);
      expect(errOut.list[0].info_id).toBe(b.info_id);
    });

    it('graphInfo 节点携带 handle_result_type', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(
        makeSaveInput({ session_id: 's-graph', info: '错误信息', handle_result_type: HandleResultType.CALL_ERROR }),
        saveOut, new InfoCoreContext(),
      );

      const gInput = new GraphInfoInput();
      gInput.session_id = 's-graph';
      const gOut = new GraphInfoOutput();
      await infoCore.graphInfo(gInput, gOut, new InfoCoreContext());

      const node = gOut.graph.nodes.find((n) => n.info_id === saveOut.info_id);
      expect(node).toBeTruthy();
      expect(node?.handle_result_type).toBe(HandleResultType.CALL_ERROR);
    });
  });

  describe('graphTag', () => {
    it('should throw ValidationError when tag_id is empty', async () => {
      const input = new GraphTagInput();
      input.tag_id = '';

      await expect(
        infoCore.graphTag(input, new GraphTagOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return early when tag config disabled', async () => {
      await infoCore.updateInfoTagConfig(
        { enable: 0 } as UpdateInfoTagConfigInput,
        new UpdateInfoTagConfigOutput(), new InfoCoreContext(),
      );

      const input = new GraphTagInput();
      input.tag_id = 'some-tag';
      const output = new GraphTagOutput();
      const result = await infoCore.graphTag(input, output, new InfoCoreContext());
      expect(result).toBe(true);
    });

    it('should return early when tag not found', async () => {
      const input = new GraphTagInput();
      input.tag_id = 'nonexistent-tag-id';
      const output = new GraphTagOutput();
      const result = await infoCore.graphTag(input, output, new InfoCoreContext());
      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // Search Operations
  // =========================================================================

  describe('lastNInfo', () => {
    it('should throw ValidationError when lastN is 0', async () => {
      const input = new LastNInfoInput();
      input.lastN = 0;

      await expect(
        infoCore.lastNInfo(input, new LastNInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when lastN is negative', async () => {
      const input = new LastNInfoInput();
      input.lastN = -1;

      await expect(
        infoCore.lastNInfo(input, new LastNInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return recent N items', async () => {
      const sessionId = 'lastn-session';
      for (let i = 0; i < 5; i++) {
        const out = new SaveInfoOutput();
        await infoCore.saveInfo(makeSaveInput({ session_id: sessionId }), out, new InfoCoreContext());
      }

      const input = new LastNInfoInput();
      input.session_id = sessionId;
      input.lastN = 3;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, output, new InfoCoreContext());

      expect(output.list.length).toBe(3);
      expect(output.list[0]).toHaveProperty('info');
      expect(output.list[0]).toHaveProperty('info_id');
      expect(output.list[0]).toHaveProperty('session_id');
    });

    it('should filter by session_id', async () => {
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-a' }), new SaveInfoOutput(), new InfoCoreContext());
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-b' }), new SaveInfoOutput(), new InfoCoreContext());

      const input = new LastNInfoInput();
      input.session_id = 's-a';
      input.lastN = 10;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, output, new InfoCoreContext());

      expect(output.list.length).toBe(1);
      expect(output.list[0].session_id).toBe('s-a');
    });

    it('should filter by work_id', async () => {
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-w', work_id: 'w-1' }), new SaveInfoOutput(), new InfoCoreContext());
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-w', work_id: 'w-2' }), new SaveInfoOutput(), new InfoCoreContext());

      const input = new LastNInfoInput();
      input.session_id = 's-w';
      input.work_id = 'w-1';
      input.lastN = 10;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, output, new InfoCoreContext());

      expect(output.list.length).toBe(1);
      expect(output.list[0].work_id).toBe('w-1');
    });

    it('should filter by info_creator_id', async () => {
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-c', info_creator_id: 'creator-a' }), new SaveInfoOutput(), new InfoCoreContext());
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-c', info_creator_id: 'creator-b' }), new SaveInfoOutput(), new InfoCoreContext());

      const input = new LastNInfoInput();
      input.session_id = 's-c';
      input.info_creator_id = 'creator-a';
      input.lastN = 10;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, output, new InfoCoreContext());

      expect(output.list.length).toBe(1);
    });

    it('should filter by run_id', async () => {
      const sid = 's-interact';
      await infoCore.saveInfo(makeSaveInput({ session_id: sid, run_id: 'i-1' }), new SaveInfoOutput(), new InfoCoreContext());
      await infoCore.saveInfo(makeSaveInput({ session_id: sid, run_id: 'i-2' }), new SaveInfoOutput(), new InfoCoreContext());

      const input = new LastNInfoInput();
      input.session_id = sid;
      input.run_id = 'i-1';
      input.lastN = 10;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, output, new InfoCoreContext());

      expect(output.list.length).toBe(1);
    });
  });

  describe('graphNInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new GraphNInfoInput();
      input.info_id = '';
      input.lastN = 10;

      await expect(
        infoCore.graphNInfo(input, new GraphNInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when lastN is 0', async () => {
      const input = new GraphNInfoInput();
      input.info_id = 'some-id';
      input.lastN = 0;

      await expect(
        infoCore.graphNInfo(input, new GraphNInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return empty for unknown info_id', async () => {
      const input = new GraphNInfoInput();
      input.info_id = 'nonexistent-info';
      input.lastN = 5;
      const output = new GraphNInfoOutput();
      await infoCore.graphNInfo(input, output, new InfoCoreContext());
      expect(output.list).toEqual([]);
    });
  });

  describe('similarKInfo', () => {
    it('should throw ValidationError when info is empty', async () => {
      const input = new SimilarKInfoInput();
      input.info = '';
      input.topK = 5;

      await expect(
        infoCore.similarKInfo(input, new SimilarKInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when topK is 0', async () => {
      const input = new SimilarKInfoInput();
      input.info = 'some text';
      input.topK = 0;

      await expect(
        infoCore.similarKInfo(input, new SimilarKInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return empty when vector config disabled', async () => {
      await infoCore.updateInfoVectorConfig(
        { enable: 0 } as UpdateInfoVectorConfigInput,
        new UpdateInfoVectorConfigOutput(), new InfoCoreContext(),
      );

      const input = new SimilarKInfoInput();
      input.info = 'test query';
      input.topK = 5;
      const output = new SimilarKInfoOutput();
      await infoCore.similarKInfo(input, output, new InfoCoreContext());
      expect(output.list).toEqual([]);
    });
  });

  describe('keywordKInfo', () => {
    it('should throw ValidationError when info is empty', async () => {
      const input = new KeywordKInfoInput();
      input.info = '';

      await expect(
        infoCore.keywordKInfo(input, new KeywordKInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return empty when no keyword matches', async () => {
      const input = new KeywordKInfoInput();
      input.info = 'zzzxyzzyx query that has no matches at all';
      const output = new KeywordKInfoOutput();
      await infoCore.keywordKInfo(input, output, new InfoCoreContext());
      expect(output.list).toEqual([]);
    });
  });

  describe('relationKInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new RelationKInfoInput();
      input.info_id = '';
      input.topN = 5;

      await expect(
        infoCore.relationKInfo(input, new RelationKInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when topN is 0', async () => {
      const input = new RelationKInfoInput();
      input.info_id = 'some-id';
      input.topN = 0;

      await expect(
        infoCore.relationKInfo(input, new RelationKInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('graphInfo', () => {
    it('should throw ValidationError when session_id is empty', async () => {
      const input = new GraphInfoInput();
      input.session_id = '';

      await expect(
        infoCore.graphInfo(input, new GraphInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return graph with nodes and edges', async () => {
      const sessionId = 'graphinfo-session';
      const pOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId }), pOut, new InfoCoreContext());

      const cOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({
        session_id: sessionId,
        parent_info_ids: [pOut.info_id],
      }), cOut, new InfoCoreContext());

      await new Promise((r) => setTimeout(r, 100));

      const input = new GraphInfoInput();
      input.session_id = sessionId;
      const output = new GraphInfoOutput();
      await infoCore.graphInfo(input, output, new InfoCoreContext());

      expect(output.graph.nodes.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(output.graph.edges)).toBe(true);
    });

    it('should return empty graph for session with no info', async () => {
      const input = new GraphInfoInput();
      input.session_id = 'empty-session';
      const output = new GraphInfoOutput();
      await infoCore.graphInfo(input, output, new InfoCoreContext());

      expect(output.graph.nodes).toEqual([]);
      expect(output.graph.edges).toEqual([]);
    });
  });

  describe('context', () => {
    it('should throw ValidationError when session_id is empty', async () => {
      const input = new ContextInfoInput();
      input.session_id = '';

      await expect(
        infoCore.context(input, new ContextInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return context items for session', async () => {
      const sessionId = 'context-session';
      for (let i = 0; i < 3; i++) {
        const out = new SaveInfoOutput();
        await infoCore.saveInfo(makeSaveInput({ session_id: sessionId }), out, new InfoCoreContext());
      }

      await new Promise((r) => setTimeout(r, 200));

      const input = new ContextInfoInput();
      input.session_id = sessionId;
      input.work_id = `work-${sessionId}`;
      const output = new ContextInfoOutput();
      await infoCore.context(input, output, new InfoCoreContext());

      expect(Array.isArray(output.list)).toBe(true);
      expect(output.list.length).toBeGreaterThanOrEqual(1);
      expect(output.categories).toBeDefined();
      expect(output.sources_summary).toBeDefined();
      expect(output.list[0].source).toBeDefined();
    });

    it('should replace timeline with selected messages when selected_msg_ids is provided', async () => {
      const sessionId = 'selected-context-session';
      const createdIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const out = new SaveInfoOutput();
        await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, info: `Message ${i}` }), out, new InfoCoreContext());
        createdIds.push(out.info_id);
      }

      // Pin message 0
      const pinIn = new PinInfoInput();
      pinIn.info_id = createdIds[0];
      await infoCore.pinInfo(pinIn, new PinInfoOutput(), new InfoCoreContext());

      // 仅保留 PINNED 与 CITING，关闭其它弱相关维度，隔离随机/时间线/向量等干扰
      const cfgIn = new UpdateInfoContextConfigInput();
      cfgIn.priority_order = 'PINNED,CITING';
      await infoCore.updateInfoContextConfig(cfgIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());

      try {
        // Select message 2 and 3（复选消息应替换时间线，而非与之并存）
        const input = new ContextInfoInput();
        input.session_id = sessionId;
        input.work_id = `work-${sessionId}`;
        input.selected_msg_ids = [createdIds[2], createdIds[3]];
        const output = new ContextInfoOutput();
        await infoCore.context(input, output, new InfoCoreContext());

        const citingIds = output.categories?.citing.map((m) => m.info_id) ?? [];
        const pinnedIds = output.categories?.pinned.map((m) => m.info_id) ?? [];
        const timelineIds = output.categories?.timeline.map((m) => m.info_id) ?? [];

        // 复选消息替换时间线：复选消息进入 CITING，时间线不再采集
        expect(citingIds).toContain(createdIds[2]);
        expect(citingIds).toContain(createdIds[3]);
        expect(timelineIds.length).toBe(0);
        expect(pinnedIds).toContain(createdIds[0]);
        expect(output.sources_summary?.citing).toBe(2);
        expect(output.sources_summary?.pinned).toBe(1);
      } finally {
        // 恢复默认优先级顺序，避免影响后续用例
        const resetIn = new UpdateInfoContextConfigInput();
        resetIn.priority_order = 'PINNED,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM';
        await infoCore.updateInfoContextConfig(resetIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());
      }
    });

    it('RANDOM：会话内随机抽样不受 enable_cross_session 影响（false 时仅跳过全局兜底）', async () => {
      const sessionId = 'random-in-session';
      // 2026-09-15 口径：基础上下文×5%，randLimit= floor(基础×5%)，需 ≥20 条基础上下文才有随机配额（8/tiny 不够）
      for (let i = 0; i < 30; i++) {
        await infoCore.saveInfo(
          makeSaveInput({ session_id: sessionId, info: `Session message ${i} with enough length to be meaningful.` }),
          new SaveInfoOutput(), new InfoCoreContext(),
        );
      }
      // 其它会话的消息（仅 enable_cross_session=true 时才可能被随机兜底捞到）
      const otherIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        const out = new SaveInfoOutput();
        await infoCore.saveInfo(
          makeSaveInput({ session_id: 'other-random-session', info: `Other session message ${i} also long enough.` }),
          out, new InfoCoreContext(),
        );
        otherIds.push(out.info_id);
      }

      await new Promise((r) => setTimeout(r, 200));

      // 仅保留 RANDOM 维度，彻底隔离时间线/钉住
      const cfgIn = new UpdateInfoContextConfigInput();
      cfgIn.priority_order = 'RANDOM';
      await infoCore.updateInfoContextConfig(cfgIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());

      try {
        const input = new ContextInfoInput();
        input.session_id = sessionId;
        input.work_id = `work-${sessionId}`;
        input.enable_cross_session = false;
        input.info = 'Session message 3 about meaningful stuff?';
        const output = new ContextInfoOutput();
        await infoCore.context(input, output, new InfoCoreContext());

        const randomIds = (output.categories?.random ?? []).map((m) => m.info_id);
        // 会话内随机照常生效（PRD 步骤 524 主句：会话内随机抽样不受 cross_session 开关约束）
        expect(randomIds.length).toBeGreaterThanOrEqual(1);
        const allCollectedIds = output.list.map((m) => m.info_id);
        // 不应出现其它会话的消息（全局兜底已随 enable_cross_session=false 跳过）
        for (const otherId of otherIds) {
          expect(allCollectedIds).not.toContain(otherId);
        }
        // 当前消息不进入 RANDOM（2026-09-15：先剔除再核算名额，限额不被当前消息占用）
        const currentRows = await relationDb.queryRaw<{ info_id: string }>(
          `SELECT info_id FROM info_raw WHERE session_id = ? ORDER BY created DESC LIMIT 1`,
          [sessionId],
        );
        const currentId = currentRows?.[0]?.info_id ?? '';
        if (currentId) {
          expect(randomIds).not.toContain(currentId);
        }
      } finally {
        const resetIn = new UpdateInfoContextConfigInput();
        resetIn.priority_order = 'PINNED,CITING,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM';
        await infoCore.updateInfoContextConfig(resetIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());
      }
    });

    it('should populate complete message object data structure', async () => {
      const sessionId = 'struct-test-session';
      const out = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, info: 'Hello World' }), out, new InfoCoreContext());

      const input = new ContextInfoInput();
      input.session_id = sessionId;
      input.work_id = `work-${sessionId}`;
      const output = new ContextInfoOutput();
      await infoCore.context(input, output, new InfoCoreContext());

      expect(output.list.length).toBeGreaterThanOrEqual(1);
      const item = output.list[0];
      expect(item.info_id).toBeTruthy();
      expect(item.id).toBeTruthy();
      expect(item.info).toBe('Hello World');
      expect(item.content).toBe('Hello World');
      expect(typeof item.summary).toBe('string');
      expect(typeof item.summary_length).toBe('number');
      expect(item.info_length).toBe(11);
      expect(item.content_length).toBe(11);
      expect(item.info_type).toBeTruthy();
      // 单条消息即时间线中最新的消息，按新语义从时间线拆出为当前消息 (CURRENT)
      expect(item.collection_source).toBe(CollectionSource.CURRENT);
      expect(item.source).toBe(CollectionSource.CURRENT);
    });

    it('should respect priority order when deduplicating messages in default mode', async () => {
      const sessionId = 'priority-test-session';
      const out = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, info: 'Pinned and Timeline Message' }), out, new InfoCoreContext());
      const msgId = out.info_id;

      // Pin the message
      const pinIn = new PinInfoInput();
      pinIn.info_id = msgId;
      await infoCore.pinInfo(pinIn, new PinInfoOutput(), new InfoCoreContext());

      const input = new ContextInfoInput();
      input.session_id = sessionId;
      input.work_id = `work-${sessionId}`;
      const output = new ContextInfoOutput();
      await infoCore.context(input, output, new InfoCoreContext());

      // Even though the message is in timeline and pinned, priority PINNED > TIMELINE should preserve it as PINNED
      const found = output.list.find((m) => m.info_id === msgId);
      expect(found).toBeDefined();
      expect(found?.collection_source).toBe(CollectionSource.PINNED);
      expect(found?.source).toBe(CollectionSource.PINNED);
    });

    it('should only collect dimensions listed in priority_order', async () => {
      const sessionId = 'subset-priority-session';
      for (let i = 0; i < 3; i++) {
        const out = new SaveInfoOutput();
        await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, info: `Subset ${i}` }), out, new InfoCoreContext());
      }

      // 仅保留 PINNED，排除 TIMELINE 等其它维度
      const cfgIn = new UpdateInfoContextConfigInput();
      cfgIn.priority_order = 'PINNED';
      await infoCore.updateInfoContextConfig(cfgIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());

      try {
        const input = new ContextInfoInput();
        input.session_id = sessionId;
        input.work_id = `work-${sessionId}`;
        const output = new ContextInfoOutput();
        await infoCore.context(input, output, new InfoCoreContext());

        // 未钉住任何消息，且 TIMELINE 维度被关闭，故不采集任何时间线/维度消息；
        // 但最新一条消息会作为当前消息 (CURRENT) 被单独拆出，不参与维度采集。
        expect(output.list.length).toBe(1);
        expect(output.categories?.timeline.length).toBe(0);
        expect(output.categories?.current.length).toBe(1);
      } finally {
        // 恢复默认优先级顺序，避免影响后续用例
        const resetIn = new UpdateInfoContextConfigInput();
        resetIn.priority_order = 'PINNED,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM';
        await infoCore.updateInfoContextConfig(resetIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());
      }
    });
  });

  // =========================================================================
  // Config Operations
  // =========================================================================

  describe('soInfoTagConfig / updateInfoTagConfig', () => {
    it('should return default tag config', async () => {
      const output = new SoInfoTagConfigOutput();
      await infoCore.soInfoTagConfig(new SoInfoTagConfigInput(), output, new InfoCoreContext());
      expect(output.config).not.toBeNull();
      expect(output.config!.tag_top_k).toBe(5);
    });

    it('should update tag config fields', async () => {
      const setInput = new UpdateInfoTagConfigInput();
      setInput.tag_top_k = 10;
      setInput.enable = 1;
      await infoCore.updateInfoTagConfig(setInput, new UpdateInfoTagConfigOutput(), new InfoCoreContext());

      const output = new SoInfoTagConfigOutput();
      await infoCore.soInfoTagConfig(new SoInfoTagConfigInput(), output, new InfoCoreContext());
      expect(output.config!.tag_top_k).toBe(10);
      expect(output.config!.enable).toBe(1);
    });

    it('should reject invalid tag_top_k (<=0 or non-integer)', async () => {
      const setInput = new UpdateInfoTagConfigInput();
      setInput.tag_top_k = 0;
      await expect(infoCore.updateInfoTagConfig(setInput, new UpdateInfoTagConfigOutput(), new InfoCoreContext()))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('soInfoSummaryConfig / updateInfoSummaryConfig', () => {
    it('should return default summary config', async () => {
      const output = new SoInfoSummaryConfigOutput();
      await infoCore.soInfoSummaryConfig(new SoInfoSummaryConfigInput(), output, new InfoCoreContext());
      expect(output.config).not.toBeNull();
      expect(output.config!.enable).toBe(1);
    });

    it('should update summary config', async () => {
      const setInput = new UpdateInfoSummaryConfigInput();
      setInput.enable = 0;
      await infoCore.updateInfoSummaryConfig(setInput, new UpdateInfoSummaryConfigOutput(), new InfoCoreContext());

      const output = new SoInfoSummaryConfigOutput();
      await infoCore.soInfoSummaryConfig(new SoInfoSummaryConfigInput(), output, new InfoCoreContext());
      expect(output.config!.enable).toBe(0);
    });
  });

  describe('soInfoConfig / updateInfoConfig', () => {
    it('should return default info config', async () => {
      const output = new SoInfoConfigOutput();
      await infoCore.soInfoConfig(new SoInfoConfigInput(), output, new InfoCoreContext());
      expect(output.config).not.toBeNull();
      expect(output.config!.alive_max_days).toBe(30);
    });

    it('should update alive_max_days', async () => {
      const setInput = new UpdateInfoConfigInput();
      setInput.alive_max_days = 14;
      await infoCore.updateInfoConfig(setInput, new UpdateInfoConfigOutput(), new InfoCoreContext());

      const output = new SoInfoConfigOutput();
      await infoCore.soInfoConfig(new SoInfoConfigInput(), output, new InfoCoreContext());
      expect(output.config!.alive_max_days).toBe(14);
    });

    it('should reject invalid alive_max_days (<=0 or non-integer)', async () => {
      const setInput = new UpdateInfoConfigInput();
      setInput.alive_max_days = -1;
      await expect(infoCore.updateInfoConfig(setInput, new UpdateInfoConfigOutput(), new InfoCoreContext()))
        .rejects.toThrow(ValidationError);
      setInput.alive_max_days = 0;
      await expect(infoCore.updateInfoConfig(setInput, new UpdateInfoConfigOutput(), new InfoCoreContext()))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('soInfoVectorConfig / updateInfoVectorConfig', () => {
    it('should return default vector config', async () => {
      const output = new SoInfoVectorConfigOutput();
      await infoCore.soInfoVectorConfig(new SoInfoVectorConfigInput(), output, new InfoCoreContext());
      expect(output.config).not.toBeNull();
      expect(output.config!.dimension).toBe(1536);
    });

    it('should update vector config', async () => {
      const setInput = new UpdateInfoVectorConfigInput();
      setInput.enable = 0;
      await infoCore.updateInfoVectorConfig(setInput, new UpdateInfoVectorConfigOutput(), new InfoCoreContext());

      const output = new SoInfoVectorConfigOutput();
      await infoCore.soInfoVectorConfig(new SoInfoVectorConfigInput(), output, new InfoCoreContext());
      expect(output.config!.enable).toBe(0);
    });
  });

  describe('soInfoContextConfig / updateInfoContextConfig', () => {
    it('should return default context config', async () => {
      const output = new SoInfoContextConfigOutput();
      await infoCore.soInfoContextConfig(new SoInfoContextConfigInput(), output, new InfoCoreContext());
      expect(output.config).not.toBeNull();
      expect(output.config!.total).toBe(1000);
      expect(output.config!.base_timeline_count).toBe(500);
    });

    it('should update context config', async () => {
      const setInput = new UpdateInfoContextConfigInput();
      setInput.total = 500;
      setInput.base_timeline_count = 200;
      await infoCore.updateInfoContextConfig(setInput, new UpdateInfoContextConfigOutput(), new InfoCoreContext());

      const output = new SoInfoContextConfigOutput();
      await infoCore.soInfoContextConfig(new SoInfoContextConfigInput(), output, new InfoCoreContext());
      expect(output.config!.total).toBe(500);
      expect(output.config!.base_timeline_count).toBe(200);
    });

    it('should reject invalid counts (negative or non-integer)', async () => {
      const setInput = new UpdateInfoContextConfigInput();
      setInput.base_timeline_count = -1;
      await expect(infoCore.updateInfoContextConfig(setInput, new UpdateInfoContextConfigOutput(), new InfoCoreContext()))
        .rejects.toThrow(ValidationError);
    });

    it('should reject invalid total (<=0 or non-integer)', async () => {
      const setInput = new UpdateInfoContextConfigInput();
      setInput.total = 0;
      await expect(infoCore.updateInfoContextConfig(setInput, new UpdateInfoContextConfigOutput(), new InfoCoreContext()))
        .rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================

  describe('delInfo', () => {
    it('should return 0 when no expired info', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), saveOut, new InfoCoreContext());

      const output = new DelInfoOutput();
      await infoCore.delInfo(new DelInfoInput(), output, new InfoCoreContext());
      expect(output.deleted_count).toBe(0);
    });

    it('should not delete pinned info', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), saveOut, new InfoCoreContext());

      const pinIn = new PinInfoInput();
      pinIn.info_id = saveOut.info_id;
      await infoCore.pinInfo(pinIn, new PinInfoOutput(), new InfoCoreContext());

      const output = new DelInfoOutput();
      await infoCore.delInfo(new DelInfoInput(), output, new InfoCoreContext());
      expect(output.deleted_count).toBe(0);
    });
  });

  // =========================================================================
  // Assist — Exist Checks
  // =========================================================================

  describe('existVectorInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ExistInfoInput();
      input.info_id = '';

      await expect(
        infoCore.existVectorInfo(input, new ExistInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return false for non-existent info_id', async () => {
      const input = new ExistInfoInput();
      input.info_id = 'nonexistent';
      const output = new ExistInfoOutput();
      await infoCore.existVectorInfo(input, output, new InfoCoreContext());
      expect(output.exists).toBe(false);
    });
  });

  describe('existTagInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ExistInfoInput();
      input.info_id = '';

      await expect(
        infoCore.existTagInfo(input, new ExistInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return false for non-existent info_id', async () => {
      const input = new ExistInfoInput();
      input.info_id = 'nonexistent';
      const output = new ExistInfoOutput();
      await infoCore.existTagInfo(input, output, new InfoCoreContext());
      expect(output.exists).toBe(false);
    });
  });

  describe('existSummaryInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ExistInfoInput();
      input.info_id = '';

      await expect(
        infoCore.existSummaryInfo(input, new ExistInfoOutput(), new InfoCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return false for non-existent info_id', async () => {
      const input = new ExistInfoInput();
      input.info_id = 'nonexistent';
      const output = new ExistInfoOutput();
      await infoCore.existSummaryInfo(input, output, new InfoCoreContext());
      expect(output.exists).toBe(false);
    });
  });

  // =========================================================================
  // AOP Integration
  // =========================================================================

  describe('AOP integration', () => {
    it('should set elapsed_ms on saveInfo output', async () => {
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), output, new InfoCoreContext());
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('should set elapsed_ms on config output', async () => {
      const output = new SoInfoConfigOutput();
      await infoCore.soInfoConfig(new SoInfoConfigInput(), output, new InfoCoreContext());
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
