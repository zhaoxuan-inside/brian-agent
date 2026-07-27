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
    vectorDb = new VectorDBAccess(relationDb, { vectorDbPath: path.join(tempDir, 'vector.db') });
    graphDb = new GraphDBAccess(relationDb, { dbPath: path.join(tempDir, 'graph.db') });
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
    input.interact_id = overrides?.interact_id ?? `interact-${IdGenerator.generate()}`;
    input.info_creator_id = overrides?.info_creator_id ?? 'user-1';
    input.info_creator_role = overrides?.info_creator_role ?? 'user';
    input.info = overrides?.info ?? '这是一条测试信息 This is a test information message for testing purposes';
    input.parent_info_ids = overrides?.parent_info_ids;
    return input;
  }

  // =========================================================================
  // Write Operations
  // =========================================================================

  describe('saveInfo', () => {
    it('should save raw info and return info_id', async () => {
      const input = makeSaveInput();
      const output = new SaveInfoOutput();

      await infoCore.saveInfo(input, new InfoCoreContext(), output);
      expect(output.info_id).toBeTruthy();
      expect(typeof output.info_id).toBe('string');
    });

    it('should throw ValidationError when info is empty', async () => {
      const input = makeSaveInput({ info: '' });

      await expect(
        infoCore.saveInfo(input, new InfoCoreContext(), new SaveInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when session_id is empty', async () => {
      const input = makeSaveInput({ session_id: '' });

      await expect(
        infoCore.saveInfo(input, new InfoCoreContext(), new SaveInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should create graph edges when parent_info_ids provided', async () => {
      const parentInput = makeSaveInput({ session_id: 'graph-session' });
      const parentOut = new SaveInfoOutput();
      await infoCore.saveInfo(parentInput, new InfoCoreContext(), parentOut);

      const childInput = makeSaveInput({
        session_id: 'graph-session',
        parent_info_ids: [parentOut.info_id],
      });
      const childOut = new SaveInfoOutput();
      await infoCore.saveInfo(childInput, new InfoCoreContext(), childOut);
      expect(childOut.info_id).toBeTruthy();
      expect(childOut.info_id).not.toBe(parentOut.info_id);
    });

    it('should handle empty work_id and interact_id', async () => {
      const input = makeSaveInput({ work_id: '', interact_id: '' });
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(input, new InfoCoreContext(), output);
      expect(output.info_id).toBeTruthy();
    });

    it('should handle empty info_creator_id and info_creator_role', async () => {
      const input = makeSaveInput({ info_creator_id: '', info_creator_role: '' });
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(input, new InfoCoreContext(), output);
      expect(output.info_id).toBeTruthy();
    });

    it('should set elapsed_ms on output', async () => {
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), new InfoCoreContext(), output);
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pinInfo', () => {
    it('should toggle pin status from 0 to 1', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), new InfoCoreContext(), saveOut);

      const input = new PinInfoInput();
      input.info_id = saveOut.info_id;
      await infoCore.pinInfo(input, new InfoCoreContext(), new PinInfoOutput());

      // Verify by checking lastNInfo result
      const lastNOut = new LastNInfoOutput();
      const lastNInput = new LastNInfoInput();
      lastNInput.info_id = saveOut.info_id;
      lastNInput.lastN = 1;
      await infoCore.lastNInfo(lastNInput, new InfoCoreContext(), lastNOut);
      expect(lastNOut.list[0].pin).toBe(1);
    });

    it('should toggle pin status from 1 to 0', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), new InfoCoreContext(), saveOut);

      const toggleOn = new PinInfoInput();
      toggleOn.info_id = saveOut.info_id;
      await infoCore.pinInfo(toggleOn, new InfoCoreContext(), new PinInfoOutput());

      const toggleOff = new PinInfoInput();
      toggleOff.info_id = saveOut.info_id;
      await infoCore.pinInfo(toggleOff, new InfoCoreContext(), new PinInfoOutput());

      const lastNOut = new LastNInfoOutput();
      const lastNInput = new LastNInfoInput();
      lastNInput.info_id = saveOut.info_id;
      lastNInput.lastN = 1;
      await infoCore.lastNInfo(lastNInput, new InfoCoreContext(), lastNOut);
      expect(lastNOut.list[0].pin).toBe(0);
    });

    it('should throw NotFoundError when info_id does not exist', async () => {
      const input = new PinInfoInput();
      input.info_id = 'nonexistent-info';

      await expect(
        infoCore.pinInfo(input, new InfoCoreContext(), new PinInfoOutput()),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when info_id is empty', async () => {
      const input = new PinInfoInput();
      input.info_id = '';

      await expect(
        infoCore.pinInfo(input, new InfoCoreContext(), new PinInfoOutput()),
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
        infoCore.vectorInfo(input, new InfoCoreContext(), new VectorInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when info does not exist', async () => {
      const input = new ProcessInfoInput();
      input.info_id = 'nonexistent';

      await expect(
        infoCore.vectorInfo(input, new InfoCoreContext(), new VectorInfoOutput()),
      ).rejects.toThrow(NotFoundError);
    });

    it('should return early when vector config is disabled', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), new InfoCoreContext(), saveOut);

      await infoCore.updateInfoVectorConfig(
        { enable: 0 } as UpdateInfoVectorConfigInput,
        new InfoCoreContext(),
        new UpdateInfoVectorConfigOutput(),
      );

      const input = new ProcessInfoInput();
      input.info_id = saveOut.info_id;
      const output = new VectorInfoOutput();
      const result = await infoCore.vectorInfo(input, new InfoCoreContext(), output);
      expect(result).toBe(true);
    });
  });

  describe('tagInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ProcessInfoInput();
      input.info_id = '';

      await expect(
        infoCore.tagInfo(input, new InfoCoreContext(), new TagInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return early when tag config is disabled', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), new InfoCoreContext(), saveOut);

      await infoCore.updateInfoTagConfig(
        { enable: 0 } as UpdateInfoTagConfigInput,
        new InfoCoreContext(),
        new UpdateInfoTagConfigOutput(),
      );

      const input = new ProcessInfoInput();
      input.info_id = saveOut.info_id;
      const output = new TagInfoOutput();
      const result = await infoCore.tagInfo(input, new InfoCoreContext(), output);
      expect(result).toBe(true);
    });
  });

  describe('summaryInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ProcessInfoInput();
      input.info_id = '';

      await expect(
        infoCore.summaryInfo(input, new InfoCoreContext(), new SummaryInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('keywordInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ProcessInfoInput();
      input.info_id = '';

      await expect(
        infoCore.keywordInfo(input, new InfoCoreContext(), new KeywordInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('graphTag', () => {
    it('should throw ValidationError when tag_id is empty', async () => {
      const input = new GraphTagInput();
      input.tag_id = '';

      await expect(
        infoCore.graphTag(input, new InfoCoreContext(), new GraphTagOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return early when tag config disabled', async () => {
      await infoCore.updateInfoTagConfig(
        { enable: 0 } as UpdateInfoTagConfigInput,
        new InfoCoreContext(),
        new UpdateInfoTagConfigOutput(),
      );

      const input = new GraphTagInput();
      input.tag_id = 'some-tag';
      const output = new GraphTagOutput();
      const result = await infoCore.graphTag(input, new InfoCoreContext(), output);
      expect(result).toBe(true);
    });

    it('should return early when tag not found', async () => {
      const input = new GraphTagInput();
      input.tag_id = 'nonexistent-tag-id';
      const output = new GraphTagOutput();
      const result = await infoCore.graphTag(input, new InfoCoreContext(), output);
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
        infoCore.lastNInfo(input, new InfoCoreContext(), new LastNInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when lastN is negative', async () => {
      const input = new LastNInfoInput();
      input.lastN = -1;

      await expect(
        infoCore.lastNInfo(input, new InfoCoreContext(), new LastNInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return recent N items', async () => {
      const sessionId = 'lastn-session';
      for (let i = 0; i < 5; i++) {
        const out = new SaveInfoOutput();
        await infoCore.saveInfo(makeSaveInput({ session_id: sessionId }), new InfoCoreContext(), out);
      }

      const input = new LastNInfoInput();
      input.session_id = sessionId;
      input.lastN = 3;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, new InfoCoreContext(), output);

      expect(output.list.length).toBe(3);
      expect(output.list[0]).toHaveProperty('info');
      expect(output.list[0]).toHaveProperty('info_id');
      expect(output.list[0]).toHaveProperty('session_id');
    });

    it('should filter by session_id', async () => {
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-a' }), new InfoCoreContext(), new SaveInfoOutput());
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-b' }), new InfoCoreContext(), new SaveInfoOutput());

      const input = new LastNInfoInput();
      input.session_id = 's-a';
      input.lastN = 10;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, new InfoCoreContext(), output);

      expect(output.list.length).toBe(1);
      expect(output.list[0].session_id).toBe('s-a');
    });

    it('should filter by work_id', async () => {
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-w', work_id: 'w-1' }), new InfoCoreContext(), new SaveInfoOutput());
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-w', work_id: 'w-2' }), new InfoCoreContext(), new SaveInfoOutput());

      const input = new LastNInfoInput();
      input.session_id = 's-w';
      input.work_id = 'w-1';
      input.lastN = 10;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, new InfoCoreContext(), output);

      expect(output.list.length).toBe(1);
      expect(output.list[0].work_id).toBe('w-1');
    });

    it('should filter by info_creator_id', async () => {
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-c', info_creator_id: 'creator-a' }), new InfoCoreContext(), new SaveInfoOutput());
      await infoCore.saveInfo(makeSaveInput({ session_id: 's-c', info_creator_id: 'creator-b' }), new InfoCoreContext(), new SaveInfoOutput());

      const input = new LastNInfoInput();
      input.session_id = 's-c';
      input.info_creator_id = 'creator-a';
      input.lastN = 10;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, new InfoCoreContext(), output);

      expect(output.list.length).toBe(1);
    });

    it('should filter by interact_id', async () => {
      const sid = 's-interact';
      await infoCore.saveInfo(makeSaveInput({ session_id: sid, interact_id: 'i-1' }), new InfoCoreContext(), new SaveInfoOutput());
      await infoCore.saveInfo(makeSaveInput({ session_id: sid, interact_id: 'i-2' }), new InfoCoreContext(), new SaveInfoOutput());

      const input = new LastNInfoInput();
      input.session_id = sid;
      input.interact_id = 'i-1';
      input.lastN = 10;
      const output = new LastNInfoOutput();
      await infoCore.lastNInfo(input, new InfoCoreContext(), output);

      expect(output.list.length).toBe(1);
    });
  });

  describe('graphNInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new GraphNInfoInput();
      input.info_id = '';
      input.lastN = 10;

      await expect(
        infoCore.graphNInfo(input, new InfoCoreContext(), new GraphNInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when lastN is 0', async () => {
      const input = new GraphNInfoInput();
      input.info_id = 'some-id';
      input.lastN = 0;

      await expect(
        infoCore.graphNInfo(input, new InfoCoreContext(), new GraphNInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return empty for unknown info_id', async () => {
      const input = new GraphNInfoInput();
      input.info_id = 'nonexistent-info';
      input.lastN = 5;
      const output = new GraphNInfoOutput();
      await infoCore.graphNInfo(input, new InfoCoreContext(), output);
      expect(output.list).toEqual([]);
    });
  });

  describe('similarKInfo', () => {
    it('should throw ValidationError when info is empty', async () => {
      const input = new SimilarKInfoInput();
      input.info = '';
      input.topK = 5;

      await expect(
        infoCore.similarKInfo(input, new InfoCoreContext(), new SimilarKInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when topK is 0', async () => {
      const input = new SimilarKInfoInput();
      input.info = 'some text';
      input.topK = 0;

      await expect(
        infoCore.similarKInfo(input, new InfoCoreContext(), new SimilarKInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return empty when vector config disabled', async () => {
      await infoCore.updateInfoVectorConfig(
        { enable: 0 } as UpdateInfoVectorConfigInput,
        new InfoCoreContext(),
        new UpdateInfoVectorConfigOutput(),
      );

      const input = new SimilarKInfoInput();
      input.info = 'test query';
      input.topK = 5;
      const output = new SimilarKInfoOutput();
      await infoCore.similarKInfo(input, new InfoCoreContext(), output);
      expect(output.list).toEqual([]);
    });
  });

  describe('keywordKInfo', () => {
    it('should throw ValidationError when info is empty', async () => {
      const input = new KeywordKInfoInput();
      input.info = '';

      await expect(
        infoCore.keywordKInfo(input, new InfoCoreContext(), new KeywordKInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return empty when no keyword matches', async () => {
      const input = new KeywordKInfoInput();
      input.info = 'zzzxyzzyx query that has no matches at all';
      const output = new KeywordKInfoOutput();
      await infoCore.keywordKInfo(input, new InfoCoreContext(), output);
      expect(output.list).toEqual([]);
    });
  });

  describe('relationKInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new RelationKInfoInput();
      input.info_id = '';
      input.topN = 5;

      await expect(
        infoCore.relationKInfo(input, new InfoCoreContext(), new RelationKInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when topN is 0', async () => {
      const input = new RelationKInfoInput();
      input.info_id = 'some-id';
      input.topN = 0;

      await expect(
        infoCore.relationKInfo(input, new InfoCoreContext(), new RelationKInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('graphInfo', () => {
    it('should throw ValidationError when session_id is empty', async () => {
      const input = new GraphInfoInput();
      input.session_id = '';

      await expect(
        infoCore.graphInfo(input, new InfoCoreContext(), new GraphInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return graph with nodes and edges', async () => {
      const sessionId = 'graphinfo-session';
      const pOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({ session_id: sessionId }), new InfoCoreContext(), pOut);

      const cOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput({
        session_id: sessionId,
        parent_info_ids: [pOut.info_id],
      }), new InfoCoreContext(), cOut);

      await new Promise((r) => setTimeout(r, 100));

      const input = new GraphInfoInput();
      input.session_id = sessionId;
      const output = new GraphInfoOutput();
      await infoCore.graphInfo(input, new InfoCoreContext(), output);

      expect(output.graph.nodes.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(output.graph.edges)).toBe(true);
    });

    it('should return empty graph for session with no info', async () => {
      const input = new GraphInfoInput();
      input.session_id = 'empty-session';
      const output = new GraphInfoOutput();
      await infoCore.graphInfo(input, new InfoCoreContext(), output);

      expect(output.graph.nodes).toEqual([]);
      expect(output.graph.edges).toEqual([]);
    });
  });

  describe('context', () => {
    it('should throw ValidationError when session_id is empty', async () => {
      const input = new ContextInfoInput();
      input.session_id = '';

      await expect(
        infoCore.context(input, new InfoCoreContext(), new ContextInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return context items for session', async () => {
      const sessionId = 'context-session';
      for (let i = 0; i < 3; i++) {
        const out = new SaveInfoOutput();
        await infoCore.saveInfo(makeSaveInput({ session_id: sessionId }), new InfoCoreContext(), out);
      }

      await new Promise((r) => setTimeout(r, 200));

      const input = new ContextInfoInput();
      input.session_id = sessionId;
      const output = new ContextInfoOutput();
      await infoCore.context(input, new InfoCoreContext(), output);

      expect(Array.isArray(output.list)).toBe(true);
      expect(output.list.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Config Operations
  // =========================================================================

  describe('soInfoTagConfig / updateInfoTagConfig', () => {
    it('should return default tag config', async () => {
      const output = new SoInfoTagConfigOutput();
      await infoCore.soInfoTagConfig(new SoInfoTagConfigInput(), new InfoCoreContext(), output);
      expect(output.config).not.toBeNull();
      expect(output.config!.tag_top_k).toBe(5);
    });

    it('should update tag config fields', async () => {
      const setInput = new UpdateInfoTagConfigInput();
      setInput.tag_top_k = 10;
      setInput.enable = 1;
      await infoCore.updateInfoTagConfig(setInput, new InfoCoreContext(), new UpdateInfoTagConfigOutput());

      const output = new SoInfoTagConfigOutput();
      await infoCore.soInfoTagConfig(new SoInfoTagConfigInput(), new InfoCoreContext(), output);
      expect(output.config!.tag_top_k).toBe(10);
      expect(output.config!.enable).toBe(1);
    });
  });

  describe('soInfoSummaryConfig / updateInfoSummaryConfig', () => {
    it('should return default summary config', async () => {
      const output = new SoInfoSummaryConfigOutput();
      await infoCore.soInfoSummaryConfig(new SoInfoSummaryConfigInput(), new InfoCoreContext(), output);
      expect(output.config).not.toBeNull();
      expect(output.config!.enable).toBe(1);
    });

    it('should update summary config', async () => {
      const setInput = new UpdateInfoSummaryConfigInput();
      setInput.enable = 0;
      await infoCore.updateInfoSummaryConfig(setInput, new InfoCoreContext(), new UpdateInfoSummaryConfigOutput());

      const output = new SoInfoSummaryConfigOutput();
      await infoCore.soInfoSummaryConfig(new SoInfoSummaryConfigInput(), new InfoCoreContext(), output);
      expect(output.config!.enable).toBe(0);
    });
  });

  describe('soInfoConfig / updateInfoConfig', () => {
    it('should return default info config', async () => {
      const output = new SoInfoConfigOutput();
      await infoCore.soInfoConfig(new SoInfoConfigInput(), new InfoCoreContext(), output);
      expect(output.config).not.toBeNull();
      expect(output.config!.alive_max_days).toBe(30);
    });

    it('should update alive_max_days', async () => {
      const setInput = new UpdateInfoConfigInput();
      setInput.alive_max_days = 14;
      await infoCore.updateInfoConfig(setInput, new InfoCoreContext(), new UpdateInfoConfigOutput());

      const output = new SoInfoConfigOutput();
      await infoCore.soInfoConfig(new SoInfoConfigInput(), new InfoCoreContext(), output);
      expect(output.config!.alive_max_days).toBe(14);
    });
  });

  describe('soInfoVectorConfig / updateInfoVectorConfig', () => {
    it('should return default vector config', async () => {
      const output = new SoInfoVectorConfigOutput();
      await infoCore.soInfoVectorConfig(new SoInfoVectorConfigInput(), new InfoCoreContext(), output);
      expect(output.config).not.toBeNull();
      expect(output.config!.dimension).toBe(1024);
    });

    it('should update vector config', async () => {
      const setInput = new UpdateInfoVectorConfigInput();
      setInput.enable = 0;
      await infoCore.updateInfoVectorConfig(setInput, new InfoCoreContext(), new UpdateInfoVectorConfigOutput());

      const output = new SoInfoVectorConfigOutput();
      await infoCore.soInfoVectorConfig(new SoInfoVectorConfigInput(), new InfoCoreContext(), output);
      expect(output.config!.enable).toBe(0);
    });
  });

  describe('soInfoContextConfig / updateInfoContextConfig', () => {
    it('should return default context config', async () => {
      const output = new SoInfoContextConfigOutput();
      await infoCore.soInfoContextConfig(new SoInfoContextConfigInput(), new InfoCoreContext(), output);
      expect(output.config).not.toBeNull();
      expect(output.config!.total).toBe(1000);
      expect(output.config!.base_timeline_count).toBe(500);
    });

    it('should update context config', async () => {
      const setInput = new UpdateInfoContextConfigInput();
      setInput.total = 500;
      setInput.base_timeline_count = 200;
      await infoCore.updateInfoContextConfig(setInput, new InfoCoreContext(), new UpdateInfoContextConfigOutput());

      const output = new SoInfoContextConfigOutput();
      await infoCore.soInfoContextConfig(new SoInfoContextConfigInput(), new InfoCoreContext(), output);
      expect(output.config!.total).toBe(500);
      expect(output.config!.base_timeline_count).toBe(200);
    });
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================

  describe('delInfo', () => {
    it('should return 0 when no expired info', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), new InfoCoreContext(), saveOut);

      const output = new DelInfoOutput();
      await infoCore.delInfo(new DelInfoInput(), new InfoCoreContext(), output);
      expect(output.deleted_count).toBe(0);
    });

    it('should not delete pinned info', async () => {
      const saveOut = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), new InfoCoreContext(), saveOut);

      const pinIn = new PinInfoInput();
      pinIn.info_id = saveOut.info_id;
      await infoCore.pinInfo(pinIn, new InfoCoreContext(), new PinInfoOutput());

      const output = new DelInfoOutput();
      await infoCore.delInfo(new DelInfoInput(), new InfoCoreContext(), output);
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
        infoCore.existVectorInfo(input, new InfoCoreContext(), new ExistInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return false for non-existent info_id', async () => {
      const input = new ExistInfoInput();
      input.info_id = 'nonexistent';
      const output = new ExistInfoOutput();
      await infoCore.existVectorInfo(input, new InfoCoreContext(), output);
      expect(output.exists).toBe(false);
    });
  });

  describe('existTagInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ExistInfoInput();
      input.info_id = '';

      await expect(
        infoCore.existTagInfo(input, new InfoCoreContext(), new ExistInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return false for non-existent info_id', async () => {
      const input = new ExistInfoInput();
      input.info_id = 'nonexistent';
      const output = new ExistInfoOutput();
      await infoCore.existTagInfo(input, new InfoCoreContext(), output);
      expect(output.exists).toBe(false);
    });
  });

  describe('existSummaryInfo', () => {
    it('should throw ValidationError when info_id is empty', async () => {
      const input = new ExistInfoInput();
      input.info_id = '';

      await expect(
        infoCore.existSummaryInfo(input, new InfoCoreContext(), new ExistInfoOutput()),
      ).rejects.toThrow(ValidationError);
    });

    it('should return false for non-existent info_id', async () => {
      const input = new ExistInfoInput();
      input.info_id = 'nonexistent';
      const output = new ExistInfoOutput();
      await infoCore.existSummaryInfo(input, new InfoCoreContext(), output);
      expect(output.exists).toBe(false);
    });
  });

  // =========================================================================
  // AOP Integration
  // =========================================================================

  describe('AOP integration', () => {
    it('should set elapsed_ms on saveInfo output', async () => {
      const output = new SaveInfoOutput();
      await infoCore.saveInfo(makeSaveInput(), new InfoCoreContext(), output);
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });

    it('should set elapsed_ms on config output', async () => {
      const output = new SoInfoConfigOutput();
      await infoCore.soInfoConfig(new SoInfoConfigInput(), new InfoCoreContext(), output);
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });
});
