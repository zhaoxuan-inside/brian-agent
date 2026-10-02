import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  SelectGraphInput,
  SelectGraphOutput,
  AddGraphNodeInput,
  AddGraphNodeOutput,
  GraphTarget,
  GraphContext,
  EmbedLLMInput,
  EmbedLLMOutput,
} from '@brian-agent/base';
import { TraceSchemaInitializer } from '@brian-agent/base';
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
  BackfillMissingSummariesInput,
  BackfillMissingSummariesOutput,
  RebuildCooccurGraphInput,
  RebuildCooccurGraphOutput,
  CleanOrphanGraphNodesInput,
  CleanOrphanGraphNodesOutput,
  DelInfoByWorkInput,
  DelInfoByWorkOutput,
  DelInfoBySessionInput,
  DelInfoBySessionOutput,
  DIALOG_TABLE,
  DIALOG_EMBEDDING_TABLE,
  EXECUTE_TABLE,
  CONTEXT_TABLE,
  SaveDialogEmbeddingInput,
  SaveDialogEmbeddingOutput,
  MatchDialogTopicInput,
  MatchDialogTopicOutput,
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
    new TraceSchemaInitializer(relationDb).init();
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
    try { await relationDb.closeDB(); } catch {  }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {  }
  });

  function makeSaveInput(overrides?: Partial<SaveInfoInput>): SaveInfoInput {
    const input = new SaveInfoInput();
    input.session_id = overrides?.session_id ?? `session-${IdGenerator.generate()}`;
    input.work_id = overrides?.work_id ?? (overrides?.run_id ? overrides.run_id : `work-${IdGenerator.generate()}`);
    input.run_id = overrides?.run_id ?? `interact-${IdGenerator.generate()}`;
    input.info_creator_id = overrides?.info_creator_id ?? 'user-1';
    input.info_creator_role = overrides?.info_creator_role ?? 'user';
    input.info = overrides?.info ?? '这是一条测试信息 This is a test information message for testing purposes';
    input.info_type = overrides?.info_type;
    input.parent_info_ids = overrides?.parent_info_ids;
    input.summary = overrides?.summary;
    input.handle_result_type = overrides?.handle_result_type;
    return input;
  }

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

      const rows = await relationDb.select('info_summary_record', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: output.info_id }],
      });
      expect(rows.length).toBe(1);
      expect(rows[0].summary).toBe('这是预生成的摘要');
    });

    it('should not create summary when summary not provided', async () => {
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), output, new InfoCoreContext());

      const rows = await relationDb.select('info_summary_record', {
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
      await infoCore.saveInfo(makeSaveInput({ info: '短内容', info_type: 'RESPONSE' }), saveOut, new InfoCoreContext());

      const input = new ProcessInfoInput();
      input.info_id = saveOut.info_id;
      const output = new SummaryInfoOutput();
      await infoCore.summaryInfo(input, output, new InfoCoreContext());
      expect(output.summary_id).toBeTruthy();

      const rows = await relationDb.select('info_summary_record', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: saveOut.info_id }],
      });
      expect(rows.length).toBe(1);
      expect(rows[0].summary).toBe('短内容');
    });
  });

  describe('backfillMissingSummaries', () => {

    function makeStubLLMAccess(result: string | null, calls: Array<{ id: string }>): LLMAccess {
      return {
        execLLM: async (input: { id: string }, output: { result?: string }) => {
          calls.push({ id: String(input.id) });
          if (result === null) throw new Error('CONNECT_ERROR(stub)');
          output.result = result;
          return true;
        },
      } as unknown as LLMAccess;
    }

    it('仅对超阈值、无摘要的正常信息补生成摘要（短文本/错误/已老化清空的不补）', async () => {

      await relationDb.executeRaw('UPDATE "info_summary_config_record" SET "enable" = 0', []);

      const longOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ info: '长'.repeat(150) }), longOut, new InfoCoreContext());
      const shortOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ info: '短内容' }), shortOut, new InfoCoreContext());
      const errOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ info: '执行失败：参数非法', handle_result_type: HandleResultType.CALL_ERROR }), errOut, new InfoCoreContext());

      await relationDb.executeRaw(`UPDATE "${DIALOG_TABLE}" SET "dialog" = '' WHERE "id" = ?`, [longOut.info_id]);

      await relationDb.executeRaw('UPDATE "info_summary_config_record" SET "enable" = 1, "llm_id" = \'llm-stub-1\'', []);
      const calls: Array<{ id: string }> = [];
      const stubCore = new InfoCoreAccess(relationDb, makeStubLLMAccess('这是补生成的摘要', calls), promptsAccess, vectorDb, graphDb);

      const output = new BackfillMissingSummariesOutput();
      await stubCore.backfillMissingSummaries(new BackfillMissingSummariesInput(), output, new InfoCoreContext());

      expect(output.backfilled_count).toBe(0);
      expect(calls.length).toBe(0);
    });

    it('对缺失摘要的长文本信息补生成，且重复执行幂等', async () => {
      await relationDb.executeRaw('UPDATE "info_summary_config_record" SET "enable" = 0', []);

      const longOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ info: '这是一段需要生成摘要的长文本内容。'.repeat(10), info_type: 'RESPONSE' }), longOut, new InfoCoreContext());

      await relationDb.executeRaw('UPDATE "info_summary_config_record" SET "enable" = 1, "llm_id" = \'llm-stub-1\', "threshold" = 20', []);
      const calls: Array<{ id: string }> = [];
      const stubCore = new InfoCoreAccess(relationDb, makeStubLLMAccess('这是补生成的摘要', calls), promptsAccess, vectorDb, graphDb);

      const output = new BackfillMissingSummariesOutput();
      await stubCore.backfillMissingSummaries(new BackfillMissingSummariesInput(), output, new InfoCoreContext());
      expect(output.backfilled_count).toBe(1);
      expect(calls.length).toBe(1);
      expect(calls[0].id).toBe('llm-stub-1');

      const rows = await relationDb.select('info_summary_record', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: longOut.info_id }],
      });
      expect(rows.length).toBe(1);
      expect(rows[0].summary).toBe('这是补生成的摘要');

      const second = new BackfillMissingSummariesOutput();
      await stubCore.backfillMissingSummaries(new BackfillMissingSummariesInput(), second, new InfoCoreContext());
      expect(second.backfilled_count).toBe(0);
      expect(calls.length).toBe(1);
    });

    it('LLM 失败时降级返回 0 且重试一次，不阻塞流程', async () => {
      await relationDb.executeRaw('UPDATE "info_summary_config_record" SET "enable" = 0', []);

      const longOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ info: '另一段需要生成摘要的长文本内容。'.repeat(10), info_type: 'RESPONSE' }), longOut, new InfoCoreContext());

      await relationDb.executeRaw('UPDATE "info_summary_config_record" SET "enable" = 1, "llm_id" = \'llm-stub-1\', "threshold" = 20', []);
      const calls: Array<{ id: string }> = [];
      const stubCore = new InfoCoreAccess(relationDb, makeStubLLMAccess(null, calls), promptsAccess, vectorDb, graphDb);

      const output = new BackfillMissingSummariesOutput();
      await expect(
        stubCore.backfillMissingSummaries(new BackfillMissingSummariesInput(), output, new InfoCoreContext()),
      ).resolves.toBe(true);
      expect(output.backfilled_count).toBe(0);
      expect(calls.length).toBe(2);
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
    it('saveInfo 错误记录与非问答类型不落库（执行过程统一由事件处理器落 execute）', async () => {
      const sessionId = 's-conv-error';
      const workId = 'w-conv-error';
      const errOut = new SaveInfoOutput();
      await infoCore.saveInfo(
        makeSaveInput({ session_id: sessionId, work_id: workId, info: 'Skill 执行失败：参数非法', handle_result_type: HandleResultType.CALL_ERROR }),
        errOut, new InfoCoreContext(),
      );
      expect(errOut.info_id).toBe('');

      const actOut = new SaveInfoOutput();
      await infoCore.saveInfo(
        makeSaveInput({ session_id: sessionId, work_id: workId, info_type: 'ACT', info: '步骤产物' }),
        actOut, new InfoCoreContext(),
      );
      expect(actOut.info_id).toBe('');

      const dialogRows = await relationDb.select(DIALOG_TABLE, {
        conditions: [{ field: 'session_id', operator: Operator.EQ, value: sessionId }],
      });
      const execRows = await relationDb.select(EXECUTE_TABLE, {
        conditions: [{ field: 'session_id', operator: Operator.EQ, value: sessionId }],
      });
      expect(dialogRows.length).toBe(0);
      expect(execRows.length).toBe(0);
    });

    async function insertProcessorExecuteRow(overrides?: { id?: string; session_id?: string; work_id?: string; status?: string; component_type?: string; output?: string }): string {
      const rowId = overrides?.id ?? IdGenerator.generate();
      const now = IdGenerator.now();
      await relationDb.insert(EXECUTE_TABLE, [
        { field: 'id', value: rowId },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'session_id', value: overrides?.session_id ?? 's-proc' },
        { field: 'work_id', value: overrides?.work_id ?? 'w-proc' },
        { field: 'run_id', value: overrides?.work_id ?? 'w-proc' },
        { field: 'trace_id', value: '' },
        { field: 'agent_id', value: '' },
        { field: 'exec_no', value: 1 },
        { field: 'component_id', value: 'LLMService.execLLMEvents' },
        { field: 'component_type', value: overrides?.component_type ?? 'LLM' },
        { field: 'input', value: '' },
        { field: 'input_length', value: 0 },
        { field: 'output', value: overrides?.output ?? '' },
        { field: 'output_length', value: (overrides?.output ?? '').length },
        { field: 'gap', value: 12 },
        { field: 'status', value: overrides?.status ?? 'ok' },
      ]);
      return rowId;
    }

    it('lastNInfo 支持按 handle_result_type 过滤（基于 execute.status）', async () => {
      const sessionId = 's-hr';
      const workId = 'w-hr';
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, work_id: workId, info: '正常信息' }), new SaveInfoOutput(), new InfoCoreContext());
      const errRowId = await insertProcessorExecuteRow({ session_id: sessionId, work_id: workId, status: 'error' });

      const errInput = new LastNInfoInput();
      errInput.session_id = sessionId;
      errInput.lastN = 10;
      errInput.handle_result_type = HandleResultType.INTERNAL_ERROR;
      const errOut = new LastNInfoOutput();
      await infoCore.lastNInfo(errInput, errOut, new InfoCoreContext());
      expect(errOut.list.length).toBe(1);
      expect(errOut.list[0].info_id).toBe(errRowId);
    });

    it('graphInfo 执行节点错误标记基于 execute.status', async () => {
      const sessionId = 's-graph';
      await insertProcessorExecuteRow({ session_id: sessionId, work_id: 'w-graph', status: 'error' });

      const gInput = new GraphInfoInput();
      gInput.session_id = sessionId;
      const gOut = new GraphInfoOutput();
      await infoCore.graphInfo(gInput, gOut, new InfoCoreContext());

      const node = gOut.graph.nodes.find((n) => n.info_id && n.info_creator_role === 'SYSTEM');
      expect(node).toBeTruthy();
      expect(node?.handle_result_type).toBe(HandleResultType.CALL_ERROR);
    });

    it('rebuildCooccurGraph 清理错误信息派生的标签，且不建入「涌现」图', async () => {

      const okOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-rebuild', info: '正常信息' }), okOut, new InfoCoreContext());
      const errOut = new SaveInfoOutput();
      await infoCore.saveInfo(
        makeSaveInput({ session_id: 's-rebuild', info: '系统报错信息', handle_result_type: HandleResultType.INTERNAL_ERROR }),
        errOut, new InfoCoreContext(),
      );

      const now = IdGenerator.now();
      await relationDb.insert('info_tag_record', [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'info_id', value: okOut.info_id },
        { field: 'tag', value: '正常标签' },
      ]);
      await relationDb.insert('info_tag_record', [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'info_id', value: errOut.info_id },
        { field: 'tag', value: '报错标签' },
      ]);

      const rebuildOut = new RebuildCooccurGraphOutput();
      await infoCore.rebuildCooccurGraph(new RebuildCooccurGraphInput(), rebuildOut, new InfoCoreContext());
      expect(rebuildOut.purged_rows).toBeGreaterThanOrEqual(1);

      const errTagRows = await relationDb.select('info_tag_record', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: errOut.info_id }],
      });
      const okTagRows = await relationDb.select('info_tag_record', {
        conditions: [{ field: 'info_id', operator: Operator.EQ, value: okOut.info_id }],
      });
      expect(errTagRows.length).toBe(0);
      expect(okTagRows.length).toBe(1);

      const graphOut = new SelectGraphOutput();
      await graphDb.selectGraph(
        { target: GraphTarget.NODE, node_type: 'Tag' } as SelectGraphInput,
        graphOut, new GraphContext(),
      );
      const tagNames = (graphOut.list as Array<{ content?: Record<string, unknown> }>)
        .map((n) => String(n.content?.tag ?? ''));
      expect(tagNames).toContain('正常标签');
      expect(tagNames).not.toContain('报错标签');
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

      const pinIn = new PinInfoInput();
      pinIn.info_id = createdIds[0];
      await infoCore.pinInfo(pinIn, new PinInfoOutput(), new InfoCoreContext());

      const cfgIn = new UpdateInfoContextConfigInput();
      cfgIn.priority_order = 'PINNED,CITING';
      await infoCore.updateInfoContextConfig(cfgIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());

      try {

        const input = new ContextInfoInput();
        input.session_id = sessionId;
        input.work_id = `work-${sessionId}`;
        input.selected_msg_ids = [createdIds[2], createdIds[3]];
        const output = new ContextInfoOutput();
        await infoCore.context(input, output, new InfoCoreContext());

        const citingIds = output.categories?.citing.map((m) => m.info_id) ?? [];
        const pinnedIds = output.categories?.pinned.map((m) => m.info_id) ?? [];
        const timelineIds = output.categories?.timeline.map((m) => m.info_id) ?? [];

        expect(citingIds).toContain(createdIds[2]);
        expect(citingIds).toContain(createdIds[3]);
        expect(timelineIds.length).toBe(0);
        expect(pinnedIds).toContain(createdIds[0]);
        expect(output.sources_summary?.citing).toBe(2);
        expect(output.sources_summary?.pinned).toBe(1);
      } finally {

        const resetIn = new UpdateInfoContextConfigInput();
        resetIn.priority_order = 'PINNED,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM';
        await infoCore.updateInfoContextConfig(resetIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());
      }
    });

    it('RANDOM：会话内随机抽样不受 enable_cross_session 影响（false 时仅跳过全局兜底）', async () => {
      const sessionId = 'random-in-session';

      for (let i = 0; i < 30; i++) {
        await infoCore.saveInfo(
          makeSaveInput({ session_id: sessionId, info: `Session message ${i} with enough length to be meaningful.` }),
          new SaveInfoOutput(), new InfoCoreContext(),
        );
      }

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

        expect(randomIds.length).toBeGreaterThanOrEqual(1);
        const allCollectedIds = output.list.map((m) => m.info_id);

        for (const otherId of otherIds) {
          expect(allCollectedIds).not.toContain(otherId);
        }

        const currentRows = await relationDb.queryRaw<{ id: string }>(
          `SELECT id FROM "${DIALOG_TABLE}" WHERE session_id = ? ORDER BY created DESC LIMIT 1`,
          [sessionId],
        );
        const currentId = currentRows?.[0]?.id ?? '';
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

      expect(item.collection_source).toBe(CollectionSource.CURRENT);
      expect(item.source).toBe(CollectionSource.CURRENT);
    });

    it('should respect priority order when deduplicating messages in default mode', async () => {
      const sessionId = 'priority-test-session';
      const out = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, info: 'Pinned and Timeline Message' }), out, new InfoCoreContext());
      const msgId = out.info_id;

      const pinIn = new PinInfoInput();
      pinIn.info_id = msgId;
      await infoCore.pinInfo(pinIn, new PinInfoOutput(), new InfoCoreContext());

      const input = new ContextInfoInput();
      input.session_id = sessionId;
      input.work_id = `work-${sessionId}`;
      const output = new ContextInfoOutput();
      await infoCore.context(input, output, new InfoCoreContext());

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

      const cfgIn = new UpdateInfoContextConfigInput();
      cfgIn.priority_order = 'PINNED';
      await infoCore.updateInfoContextConfig(cfgIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());

      try {
        const input = new ContextInfoInput();
        input.session_id = sessionId;
        input.work_id = `work-${sessionId}`;
        const output = new ContextInfoOutput();
        await infoCore.context(input, output, new InfoCoreContext());

        expect(output.list.length).toBe(1);
        expect(output.categories?.timeline.length).toBe(0);
        expect(output.categories?.current.length).toBe(1);
      } finally {

        const resetIn = new UpdateInfoContextConfigInput();
        resetIn.priority_order = 'PINNED,CITING,TIMELINE,TAG_RELATIVE,SIMILARITY,KEYWORD,RANDOM';
        await infoCore.updateInfoContextConfig(resetIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());
      }
    });

    it('should support priority_order strategy identifiers like DEFAULT and STRICT_FOCUS', async () => {
      const sessionId = 'strat-priority-session';
      for (let i = 0; i < 3; i++) {
        const out = new SaveInfoOutput();
        await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, info: `Strat ${i}` }), out, new InfoCoreContext());
      }

      const cfgIn = new UpdateInfoContextConfigInput();
      cfgIn.priority_order = 'STRICT_FOCUS';
      await infoCore.updateInfoContextConfig(cfgIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());

      try {
        const input = new ContextInfoInput();
        input.session_id = sessionId;
        input.work_id = `work-${sessionId}`;
        const output = new ContextInfoOutput();
        await infoCore.context(input, output, new InfoCoreContext());

        expect(output.categories?.tag_relative.length).toBe(0);
        expect(output.categories?.similarity.length).toBe(0);
        expect(output.categories?.keyword.length).toBe(0);
        expect(output.categories?.random.length).toBe(0);
      } finally {
        const resetIn = new UpdateInfoContextConfigInput();
        resetIn.priority_order = 'DEFAULT';
        await infoCore.updateInfoContextConfig(resetIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());
      }
    });

    it('should recall historical context of selected messages as timeline candidates', async () => {
      const sessionId = 'recall-hist-ctx-session';
      const t1UserOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, work_id: 'work-1', info_type: 'REQUEST', info: 'Q1' }), t1UserOut, new InfoCoreContext());
      const t1BotOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, work_id: 'work-1', info_type: 'RESPONSE', info: 'A1' }), t1BotOut, new InfoCoreContext());

      const t2CtxOut = new ContextInfoOutput();
      const t2CtxIn = new ContextInfoInput();
      t2CtxIn.session_id = sessionId;
      t2CtxIn.work_id = 'work-2';
      await infoCore.context(t2CtxIn, t2CtxOut, new InfoCoreContext());

      const t2UserOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, work_id: 'work-2', info_type: 'REQUEST', info: 'Q2' }), t2UserOut, new InfoCoreContext());
      const t2BotOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, work_id: 'work-2', info_type: 'RESPONSE', info: 'A2' }), t2BotOut, new InfoCoreContext());

      const t3CtxIn = new ContextInfoInput();
      t3CtxIn.session_id = sessionId;
      t3CtxIn.work_id = 'work-3';
      t3CtxIn.selected_msg_ids = [t2BotOut.info_id];
      const t3CtxOut = new ContextInfoOutput();
      await infoCore.context(t3CtxIn, t3CtxOut, new InfoCoreContext());

      const citingIds = t3CtxOut.categories?.citing.map((m) => m.info_id) ?? [];
      const timelineIds = t3CtxOut.categories?.timeline.map((m) => m.info_id) ?? [];

      expect(citingIds).toContain(t2BotOut.info_id);
      expect(timelineIds.length).toBeGreaterThanOrEqual(1);
    });

    it('should respect enable_snapshot_persistence config when input.persist_snapshot is undefined', async () => {
      const sessionId = 'snapshot-cfg-session';
      const userOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, work_id: 'work-snap-0', info_type: 'REQUEST', info: 'Q0' }), userOut, new InfoCoreContext());

      const cfgIn = new UpdateInfoContextConfigInput();
      cfgIn.enable_snapshot_persistence = 0;
      await infoCore.updateInfoContextConfig(cfgIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());

      try {
        const inputDisabled = new ContextInfoInput();
        inputDisabled.session_id = sessionId;
        inputDisabled.work_id = 'work-snap-disabled';
        const outDisabled = new ContextInfoOutput();
        await infoCore.context(inputDisabled, outDisabled, new InfoCoreContext());

        const rowsDisabled = await relationDb.select(CONTEXT_TABLE, {
          conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'work-snap-disabled' }],
        });
        expect(rowsDisabled.length).toBe(0);

        cfgIn.enable_snapshot_persistence = 1;
        await infoCore.updateInfoContextConfig(cfgIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());

        const inputEnabled = new ContextInfoInput();
        inputEnabled.session_id = sessionId;
        inputEnabled.work_id = 'work-snap-enabled';
        const outEnabled = new ContextInfoOutput();
        await infoCore.context(inputEnabled, outEnabled, new InfoCoreContext());

        const rowsEnabled = await relationDb.select(CONTEXT_TABLE, {
          conditions: [{ field: 'work_id', operator: Operator.EQ, value: 'work-snap-enabled' }],
        });
        expect(rowsEnabled.length).toBeGreaterThan(0);
      } finally {
        const resetIn = new UpdateInfoContextConfigInput();
        resetIn.enable_snapshot_persistence = 1;
        await infoCore.updateInfoContextConfig(resetIn, new UpdateInfoContextConfigOutput(), new InfoCoreContext());
      }
    });

    it('should split storage across dialog and execute tables and cascade delete', async () => {
      const sessionId = 'three-table-test-session';
      const workId = 'three-table-work-1';

      const reqOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId, work_id: workId, info_type: 'REQUEST', info: 'User Question' }), reqOut, new InfoCoreContext());

      

      const now = IdGenerator.now();
      await relationDb.insert(EXECUTE_TABLE, [
        { field: 'id', value: 'exec-row-1' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'session_id', value: sessionId },
        { field: 'work_id', value: workId },
        { field: 'run_id', value: workId },
        { field: 'trace_id', value: '' },
        { field: 'agent_id', value: '' },
        { field: 'exec_no', value: 1 },
        { field: 'component_id', value: 'LLMService.execLLMEvents' },
        { field: 'component_type', value: 'LLM' },
        { field: 'input', value: '' },
        { field: 'input_length', value: 0 },
        { field: 'output', value: 'Agent Tool Call' },
        { field: 'output_length', value: 15 },
        { field: 'gap', value: 20 },
        { field: 'status', value: 'ok' },
      ]);

      const dialogRows = await relationDb.select(DIALOG_TABLE, {
        conditions: [{ field: 'session_id', operator: Operator.EQ, value: sessionId }],
      });
      expect(dialogRows.length).toBe(1);
      expect(dialogRows[0]['type']).toBe('REQUEST');
      expect(dialogRows[0]['dialog']).toBe('User Question');

      const execRows = await relationDb.select(EXECUTE_TABLE, {
        conditions: [{ field: 'session_id', operator: Operator.EQ, value: sessionId }],
      });
      expect(execRows.length).toBe(1);
      expect(execRows[0]['output']).toBe('Agent Tool Call');

      const delWorkIn = new DelInfoByWorkInput();
      delWorkIn.work_id = workId;
      await infoCore.delInfoByWork(delWorkIn, new DelInfoByWorkOutput(), new InfoCoreContext());

      const dialogAfterDel = await relationDb.select(DIALOG_TABLE, {
        conditions: [{ field: 'work_id', operator: Operator.EQ, value: workId }],
      });
      expect(dialogAfterDel.length).toBe(0);

      const execAfterDel = await relationDb.select(EXECUTE_TABLE, {
        conditions: [{ field: 'work_id', operator: Operator.EQ, value: workId }],
      });
      expect(execAfterDel.length).toBe(0);
    });
  });

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

  describe('cleanOrphanGraphNodes', () => {
    it('TC-INFO-ORPHAN-001: removes orphan Tag and keyword nodes having 0 message references, but keeps nodes with active references', async () => {
      // 1. Add Tag nodes to GraphDB
      const tagActiveOut = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        Object.assign(new AddGraphNodeInput(), {
          data: { node_type: 'Tag', content: { tag_name: 'ActiveTag', freq: 1 } },
        }),
        tagActiveOut,
        new GraphContext(),
      );
      const tagOrphanOut = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        Object.assign(new AddGraphNodeInput(), {
          data: { node_type: 'Tag', content: { tag_name: 'OrphanTag', freq: 1 } },
        }),
        tagOrphanOut,
        new GraphContext(),
      );

      // 2. Add keyword nodes to GraphDB
      const kwActiveOut = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        Object.assign(new AddGraphNodeInput(), {
          data: { node_type: 'keyword', content: { keyword: 'ActiveKeyword', freq: 1 } },
        }),
        kwActiveOut,
        new GraphContext(),
      );
      const kwOrphanOut = new AddGraphNodeOutput();
      await graphDb.addGraphNode(
        Object.assign(new AddGraphNodeInput(), {
          data: { node_type: 'keyword', content: { keyword: 'OrphanKeyword', freq: 1 } },
        }),
        kwOrphanOut,
        new GraphContext(),
      );

      // 3. In SQLite: only ActiveTag and ActiveKeyword are referenced by info-1
      relationDb.executeRaw(`INSERT INTO "${DIALOG_TABLE}" ("id", "created", "updated", "session_id", "work_id", "type", "dialog", "trace_id") VALUES ('info-1', 1700000000000, 1700000000000, 's-1', 'w-1', 'REQUEST', 'hello', '')`);
      relationDb.executeRaw(`INSERT INTO "info_tag_record" ("id", "created", "updated", "info_id", "tag") VALUES ('it-1', 1700000000000, 1700000000000, 'info-1', 'ActiveTag')`);
      relationDb.executeRaw(`INSERT INTO "info_keyword_org" ("info_id", "word") VALUES ('info-1', 'ActiveKeyword')`);

      // 4. Trigger cleanOrphanGraphNodes
      const cleanIn = new CleanOrphanGraphNodesInput();
      const cleanOut = new CleanOrphanGraphNodesOutput();
      const res = await (infoCore as any).cleanOrphanGraphNodes(cleanIn, cleanOut, new InfoCoreContext());

      expect(res).toBe(true);
      expect(cleanOut.deleted_node_count).toBe(2);
      expect(cleanOut.deleted_nodes).toContain('OrphanTag');
      expect(cleanOut.deleted_nodes).toContain('OrphanKeyword');

      // 5. Verify graph DB state
      const selTags = new SelectGraphOutput();
      await graphDb.selectGraph({ target: GraphTarget.NODE, node_type: 'Tag' } as any, selTags, new GraphContext());
      const tagNames = (selTags.list as any[]).map((n) => n.content?.tag_name || n.content?.tag);
      expect(tagNames).toContain('ActiveTag');
      expect(tagNames).not.toContain('OrphanTag');

      const selKeywords = new SelectGraphOutput();
      await graphDb.selectGraph({ target: GraphTarget.NODE, node_type: 'keyword' } as any, selKeywords, new GraphContext());
      const kwNames = (selKeywords.list as any[]).map((n) => n.content?.keyword || n.content?.word);
      expect(kwNames).toContain('ActiveKeyword');
      expect(kwNames).not.toContain('OrphanKeyword');
    });
  });

  describe('dialog embedding 轮次话题向量（chg-059）', () => {
    function makeDialogEmbedInput(sessionId: string, workId: string, text: string): SaveDialogEmbeddingInput {
      const input = new SaveDialogEmbeddingInput();
      input.session_id = sessionId;
      input.work_id = workId;
      input.text = text;
      return input;
    }

    function enableEmbeddingMock(mapping: Array<{ match: string; vector: number[] }>): void {
      vi.spyOn(llmAccess, 'soLLMById').mockImplementation(async (_i: unknown, o: { llm?: unknown }) => {
        o.llm = { id: 'llm-embed', llm_type: 'embedding' } as never;
        return true;
      });
      vi.spyOn(llmAccess, 'embedLLM').mockImplementation(async (input: EmbedLLMInput, output: EmbedLLMOutput) => {
        const text = String(input.input ?? '');
        const hit = mapping.find((m) => text.includes(m.match));
        output.embedding = hit ? hit.vector : [0, 0, 1];
        return true;
      });
    }

    async function enableVectorConfig(): Promise<void> {
      await infoCore.updateInfoVectorConfig(
        { llm_id: 'llm-embed', enable: 1 } as any,
        new UpdateInfoVectorConfigOutput(), new InfoCoreContext(),
      );
    }

    async function dialogEmbeddingRows(sessionId: string): Promise<Array<Record<string, unknown>>> {
      return relationDb.queryRaw<Record<string, unknown>>(
        `SELECT * FROM "${DIALOG_EMBEDDING_TABLE}" WHERE "session_id" = ? ORDER BY "created" ASC`,
        [sessionId],
      ) ?? [];
    }

    it('DDL 建表：dialog_embedding_record 含 id/created/updated/session_id/work_id/embedding/dimension 列', () => {
      const rows = relationDb.queryRaw<{ name: string }>(
        `SELECT "name" FROM pragma_table_info('${DIALOG_EMBEDDING_TABLE}') ORDER BY "cid"`,
      ) ?? [];
      const cols = rows.map((r) => r.name);
      for (const col of ['id', 'created', 'updated', 'session_id', 'work_id', 'embedding', 'dimension']) {
        expect(cols).toContain(col);
      }
    });

    it('未配置向量模型：saved=false reason=no_vector_model（优雅降级不报错）', async () => {
      const output = new SaveDialogEmbeddingOutput();
      const result = await infoCore.saveDialogEmbedding(
        makeDialogEmbedInput('sess-topic', 'work-1', '帮我推荐城市出行路线'),
        output, new InfoCoreContext(),
      );
      expect(result).toBe(true);
      expect(output.saved).toBe(false);
      expect(output.reason).toBe('no_vector_model');
      expect(await dialogEmbeddingRows('sess-topic')).toHaveLength(0);
    });

    it('入参缺失或空白文本：saved=false reason=invalid_input', async () => {
      const blank = new SaveDialogEmbeddingOutput();
      await infoCore.saveDialogEmbedding(makeDialogEmbedInput('sess-topic', 'work-1', '   '), blank, new InfoCoreContext());
      expect(blank.saved).toBe(false);
      expect(blank.reason).toBe('invalid_input');

      const noSession = new SaveDialogEmbeddingOutput();
      await infoCore.saveDialogEmbedding(makeDialogEmbedInput('', 'work-1', '文本'), noSession, new InfoCoreContext());
      expect(noSession.saved).toBe(false);
      expect(noSession.reason).toBe('invalid_input');
    });

    it('向量模型返回空向量：saved=false reason=empty_vector', async () => {
      enableEmbeddingMock([{ match: '', vector: [] }]);
      await enableVectorConfig();
      const output = new SaveDialogEmbeddingOutput();
      await infoCore.saveDialogEmbedding(makeDialogEmbedInput('sess-topic', 'work-1', '帮我推荐城市出行路线'), output, new InfoCoreContext());
      expect(output.saved).toBe(false);
      expect(output.reason).toBe('empty_vector');
    });

    it('保存成功且同 work_id 幂等 upsert：重复固化只保留一行并更新向量', async () => {
      enableEmbeddingMock([{ match: '出行', vector: [1, 0.2, 0] }]);
      await enableVectorConfig();

      const first = new SaveDialogEmbeddingOutput();
      await infoCore.saveDialogEmbedding(makeDialogEmbedInput('sess-topic', 'work-1', '帮我推荐城市出行路线'), first, new InfoCoreContext());
      expect(first.saved).toBe(true);
      expect(first.dimension).toBe(3);

      const again = new SaveDialogEmbeddingOutput();
      await infoCore.saveDialogEmbedding(makeDialogEmbedInput('sess-topic', 'work-1', '完全无关的另一段新文本'), again, new InfoCoreContext());
      expect(again.saved).toBe(true);

      const rows = await dialogEmbeddingRows('sess-topic');
      expect(rows).toHaveLength(1);
      expect(String(rows[0].work_id)).toBe('work-1');
      expect(Number(rows[0].dimension)).toBe(3);
      const vector = JSON.parse(String(rows[0].embedding)) as number[];
      expect(vector).toEqual([0, 0, 1]);
    });

    it('matchDialogTopic：cosine 最大相似度回填，维度不一致轮次跳过', async () => {
      enableEmbeddingMock([
        { match: '出行', vector: [1, 0, 0] },
        { match: '股票', vector: [0, 1, 0] },
      ]);
      await enableVectorConfig();

      const saved = new SaveDialogEmbeddingOutput();
      await infoCore.saveDialogEmbedding(makeDialogEmbedInput('sess-topic', 'work-1', '帮我推荐城市出行路线'), saved, new InfoCoreContext());
      expect(saved.saved).toBe(true);

      relationDb.executeRaw(`INSERT INTO "${DIALOG_EMBEDDING_TABLE}" ("id", "created", "updated", "session_id", "work_id", "embedding", "dimension") VALUES
        ('emb-wrong-dim', 1, 1, 'sess-topic', 'work-dim', '${JSON.stringify(new Array(768).fill(0))}', 768)`);

      const unrelated = new SaveDialogEmbeddingInput();
      unrelated.session_id = 'sess-topic';
      unrelated.work_id = 'work-2';
      unrelated.text = '股票行情走势分析';
      const unrelatedOut = new SaveDialogEmbeddingOutput();
      await infoCore.saveDialogEmbedding(unrelated, unrelatedOut, new InfoCoreContext());
      expect(unrelatedOut.saved).toBe(true);

      const output = new MatchDialogTopicOutput();
      const input = new MatchDialogTopicInput();
      input.session_id = 'sess-topic';
      input.query_text = '周末出行散步路线推荐';
      const result = await infoCore.matchDialogTopic(input, output, new InfoCoreContext());
      expect(result).toBe(true);
      expect(output.evaluated).toBe(true);
      expect(output.compared_rounds).toBe(2);
      expect(output.best_similarity).toBeGreaterThanOrEqual(70);
      expect(output.matched_work_id).toBe('work-1');

      const drift = new MatchDialogTopicOutput();
      const driftIn = new MatchDialogTopicInput();
      driftIn.session_id = 'sess-topic';
      driftIn.query_text = '量子计算机纠错编码基本原理';
      await infoCore.matchDialogTopic(driftIn, drift, new InfoCoreContext());
      expect(drift.best_similarity).toBeLessThan(70);
    });

    it('matchDialogTopic：无轮次向量或无向量模型 evaluated=false（调用方回退亲和逻辑）', async () => {
      const input = new MatchDialogTopicInput();
      input.session_id = 'sess-empty';
      input.query_text = '任意问题';
      const output = new MatchDialogTopicOutput();
      await infoCore.matchDialogTopic(input, output, new InfoCoreContext());
      expect(output.evaluated).toBe(false);
      expect(output.best_similarity).toBe(0);
    });
  });
});
