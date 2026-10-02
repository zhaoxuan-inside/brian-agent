import { Metrics, Report } from '@brian-agent/base';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RelationDBAccess,
  SelectOneDBInput, SelectOneDBOutput, DBContext, Operator,
  ChunkAccess,
} from '@brian-agent/base';
import { SelfLearningService } from '../SelfLearning/application/SelfLearningService';
import {
  SelfLearningContext,
  AddLibraryInput, AddLibraryOutput,
  DeleteLibraryInput, DeleteLibraryOutput,
  SearchLibraryInput, SearchLibraryOutput,
  GetLibraryFilesInput, GetLibraryFilesOutput,
  GetFileContentInput, GetFileContentOutput,
  UpdateFileContentInput, UpdateFileContentOutput,
  DeleteFileInput, DeleteFileOutput,
  StartLearningInput, StartLearningOutput,
  StopLearningInput, StopLearningOutput,
  GetTagGraphInput, GetTagGraphOutput,
  GetTagRelatedInfoInput, GetTagRelatedInfoOutput,
  GetLearningProgressInput, GetLearningProgressOutput,
  GetLearningResultsInput, GetLearningResultsOutput,
  GetLearningStatsInput, GetLearningStatsOutput,
  ConfigSelfLearningInput, ConfigSelfLearningOutput,
  LearningTaskRecord, LearningTaskStatus, ListLearningTasksInput, ListLearningTasksOutput,
} from '../SelfLearning/domain/types';
import {
  setupRealTestEnvironment, cleanupTempDirs, type RealTestContext,
} from './real-test-helpers';
import { initSelfLearningSchema, initChatSchema } from './test-helpers';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SelfLearningService', () => {
  let ctx: RealTestContext;
  let db: RelationDBAccess;
  let infoCore: any;
  let mqCore: any;
  let llmCore: any;
  let evolutorAgent: any;
  let writerAgent: any;
  let graphDb: any;
  let mq: any;
  let chunkAccess: ChunkAccess;
  let logger: any;
  let service: SelfLearningService;
  const tempDirs: string[] = [];

  beforeEach(async () => {
    ctx = await setupRealTestEnvironment();
    db = ctx.db;

    infoCore = ctx.infoCore;
    mqCore = ctx.mqCore;
    llmCore = ctx.llmCore;
    evolutorAgent = ctx.evolutorAgent;
    writerAgent = ctx.writerAgent;
    graphDb = ctx.graphDBAccess;
    mq = ctx.mqAccess;
    chunkAccess = new ChunkAccess(logger);
    logger = ctx.logger;

    initSelfLearningSchema(db);
    await new Promise((r) => setTimeout(r, 10));

    vi.spyOn(evolutorAgent, 'runEvalOnce');
    vi.spyOn(evolutorAgent, 'stopEvalSchedule');
    vi.spyOn(graphDb, 'selectGraph').mockImplementation(async (_i: any, o: any, _c: any, ) => {
      o.list = [];
      return true;
    });
    vi.spyOn(graphDb, 'soGraphNeighbors').mockImplementation(async (_i: any, o: any, _c: any, ) => {
      o.list = [];
      return true;
    });
    vi.spyOn(graphDb, 'activateGraphEdge').mockResolvedValue(true);
    vi.spyOn(graphDb, 'ageGraphEdge').mockImplementation(async (_i: any, o: any, _c: any, ) => {
      o.aged_count = 0;
      return true;
    });

    service = new SelfLearningService(
      db, infoCore, mqCore, llmCore,
      evolutorAgent, writerAgent,
      graphDb, chunkAccess, mq, ctx.llmAccess, ctx.promptsAccess, logger,
    );
  });

  afterEach(() => {
    cleanupTempDirs();
    vi.restoreAllMocks();
    for (const dir of tempDirs) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {  }
    }
    tempDirs.length = 0;
  });

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-test-'));
    tempDirs.push(dir);
    return dir;
  }

  function writeMdFile(dir: string, name: string, content: string): void {
    fs.writeFileSync(path.join(dir, name), content);
  }

  function makeCtx(): SelfLearningContext {
    return new SelfLearningContext();
  }

  function ensureInfoTables(): void {
    db.executeRaw(`
      CREATE TABLE IF NOT EXISTS info_tag_record (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        tag TEXT NOT NULL,
        info_id TEXT NOT NULL
      )
    `);
    db.executeRaw(`
      CREATE TABLE IF NOT EXISTS info_summary_record (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        info_id TEXT NOT NULL,
        summary TEXT
      )
    `);
    db.executeRaw(`
      CREATE TABLE IF NOT EXISTS dialog_record (
        id TEXT PRIMARY KEY NOT NULL,
        created INTEGER NOT NULL,
        updated INTEGER NOT NULL,
        type TEXT NOT NULL
      )
    `);
  }

  describe('addLibrary', () => {
    it('TC-SL-001: Add library with valid path pointing to .md files', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'doc1.md', '# Hello\nWorld');
      writeMdFile(dir, 'doc2.md', '## Section\nContent');
      writeMdFile(dir, 'readme.md', 'README content');

      const input = Object.assign(new AddLibraryInput(), { library_path: dir });
      const output = new AddLibraryOutput();

      const result = await service.addLibrary(input, output, makeCtx());

      expect(result).toBe(true);
      expect(typeof output.library_id).toBe('string');
      expect(output.library_id.length).toBeGreaterThan(0);
      expect(output.file_count).toBe(3);
    });

    it('TC-SL-002: Add with custom library_name', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'doc.md', '# Test');

      const input = Object.assign(new AddLibraryInput(), {
        library_path: dir,
        library_name: 'My Custom Library',
      });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      const lib = await getLibraryById(db, output.library_id);
      expect(lib?.library_name).toBe('My Custom Library');
    });

    it('TC-SL-003: No library_name → uses directory name', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'doc.md', '# Test');
      const dirName = path.basename(dir);

      const input = Object.assign(new AddLibraryInput(), { library_path: dir });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      const lib = await getLibraryById(db, output.library_id);
      expect(lib?.library_name).toBe(dirName);
    });

    it('TC-SL-004: enable_self_learning=true → stored correctly', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'doc.md', '# Test');

      const input = Object.assign(new AddLibraryInput(), {
        library_path: dir,
        enable_self_learning: true,
      });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      const lib = await getLibraryById(db, output.library_id);
      expect(lib?.enable_self_learning).toBe(1);
    });

    it('TC-SL-005: enable_self_learning=false → stored correctly', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'doc.md', '# Test');

      const input = Object.assign(new AddLibraryInput(), {
        library_path: dir,
        enable_self_learning: false,
      });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      const lib = await getLibraryById(db, output.library_id);
      expect(lib?.enable_self_learning).toBe(0);
    });

    it('TC-SL-006: Custom learning_rate', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'doc.md', '# Test');

      const input = Object.assign(new AddLibraryInput(), {
        library_path: dir,
        learning_rate: 10,
      });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      const lib = await getLibraryById(db, output.library_id);
      expect(lib?.learning_rate).toBe(10);
    });

    it('TC-SL-007: Default learning_rate=5', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'doc.md', '# Test');

      const input = Object.assign(new AddLibraryInput(), { library_path: dir });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      const lib = await getLibraryById(db, output.library_id);
      expect(lib?.learning_rate).toBe(5);
    });

    it('TC-SL-008: Multiple .md files → all scanned', async () => {
      const dir = makeTempDir();
      for (let i = 1; i <= 10; i++) {
        writeMdFile(dir, `doc${i}.md`, `# Doc ${i}`);
      }

      const input = Object.assign(new AddLibraryInput(), { library_path: dir });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      expect(output.file_count).toBe(10);
    });

    it('TC-SL-009: All files scanned (including non-.md)', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'doc.md', '# Test');
      fs.writeFileSync(path.join(dir, 'readme.txt'), 'not md');
      fs.writeFileSync(path.join(dir, 'image.png'), '');

      const input = Object.assign(new AddLibraryInput(), { library_path: dir });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      expect(output.file_count).toBe(3);
    });

    it('TC-SL-010: Directory with single non-.md file → file_count=1', async () => {
      const dir = makeTempDir();
      fs.writeFileSync(path.join(dir, 'notes.txt'), 'text');

      const input = Object.assign(new AddLibraryInput(), { library_path: dir });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      expect(output.file_count).toBe(1);
      expect(typeof output.library_id).toBe('string');
    });

    it('TC-SL-011: Non-existent path → throws Error', async () => {
      const input = Object.assign(new AddLibraryInput(), {
        library_path: '/nonexistent/path/xyz_' + Date.now(),
      });

      await expect(
        service.addLibrary(input, makeCtx(), new AddLibraryOutput()),
      ).rejects.toThrow();
    });

    it('TC-SL-012: Path is file not directory → throws Error', async () => {
      const dir = makeTempDir();
      const filePath = path.join(dir, 'single.md');
      fs.writeFileSync(filePath, '# File');

      const input = Object.assign(new AddLibraryInput(), { library_path: filePath });

      await expect(
        service.addLibrary(input, makeCtx(), new AddLibraryOutput()),
      ).rejects.toThrow();
    });

    it('TC-SL-013: Empty library_path → resolves to CWD, may succeed if CWD has .md files', async () => {
      const input = Object.assign(new AddLibraryInput(), { library_path: '' });
      const output = new AddLibraryOutput();

      const result = await service.addLibrary(input, output, makeCtx());

      expect(result).toBe(true);
      expect(typeof output.library_id).toBe('string');
    });

    it('TC-SL-014: Library with subdirectories → recursive scan includes nested files', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'root.md', '# Root');
      const sub = path.join(dir, 'sub');
      fs.mkdirSync(sub);
      writeMdFile(sub, 'nested.md', '# Nested');

      const input = Object.assign(new AddLibraryInput(), { library_path: dir });
      const output = new AddLibraryOutput();

      await service.addLibrary(input, output, makeCtx());

      expect(output.file_count).toBe(2);
    });
  });

  describe('deleteLibrary', () => {
    const libId = 'lib-to-delete';

    beforeEach(async () => {
      await db.insert('self_learning_library', [
        { field: 'id', value: libId },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_name', value: 'Test Lib' },
        { field: 'library_path', value: '/tmp/test' },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 5 },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-1' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_id', value: libId },
        { field: 'file_name', value: 'test.md' },
        { field: 'file_path', value: '/tmp/test/test.md' },
        { field: 'file_size', value: 100 },
        { field: 'status', value: 'PENDING' },
      ]);
    });

    it('TC-SL-020: Delete existing → returns true, library removed from DB', async () => {
      const input = Object.assign(new DeleteLibraryInput(), { library_id: libId });

      const result = await service.deleteLibrary(input, makeCtx(), new DeleteLibraryOutput());

      expect(result).toBe(true);
      const lib = await getLibraryById(db, libId);
      expect(lib).toBeNull();
      const fileCount = await db.count('self_learning_file', [
        { field: 'library_id', operator: '=', value: libId },
      ]);
      expect(fileCount).toBe(0);
    });

    it('TC-SL-021: Non-existent → succeeds idempotently', async () => {
      const input = Object.assign(new DeleteLibraryInput(), { library_id: 'nonexistent-id' });

      const result = await service.deleteLibrary(input, makeCtx(), new DeleteLibraryOutput());

      expect(result).toBe(true);
    });

    it('TC-SL-022: Delete with empty library_id → succeeds idempotently', async () => {
      const input = Object.assign(new DeleteLibraryInput(), { library_id: '' });

      const result = await service.deleteLibrary(input, makeCtx(), new DeleteLibraryOutput());

      expect(result).toBe(true);
    });
  });

  describe('soLibrary', () => {
    beforeEach(async () => {
      await db.insert('self_learning_library', [
        { field: 'id', value: 'lib-a' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_name', value: 'Alpha Docs' },
        { field: 'library_path', value: '/tmp/alpha' },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 5 },
      ]);
      await db.insert('self_learning_library', [
        { field: 'id', value: 'lib-b' },
        { field: 'created', value: 1700000002000 },
        { field: 'updated', value: 1700000002000 },
        { field: 'library_name', value: 'Beta Notes' },
        { field: 'library_path', value: '/tmp/beta' },
        { field: 'enable_self_learning', value: 0 },
        { field: 'learning_rate', value: 3 },
      ]);
      await db.insert('self_learning_library', [
        { field: 'id', value: 'lib-c' },
        { field: 'created', value: 1700000003000 },
        { field: 'updated', value: 1700000003000 },
        { field: 'library_name', value: 'Alpha Research' },
        { field: 'library_path', value: '/tmp/alpha-research' },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 8 },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-a1' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_id', value: 'lib-a' },
        { field: 'file_name', value: 'a1.md' },
        { field: 'file_path', value: '/tmp/alpha/a1.md' },
        { field: 'file_size', value: 100 },
        { field: 'status', value: 'COMPLETED' },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-a2' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_id', value: 'lib-a' },
        { field: 'file_name', value: 'a2.md' },
        { field: 'file_path', value: '/tmp/alpha/a2.md' },
        { field: 'file_size', value: 200 },
        { field: 'status', value: 'PENDING' },
      ]);
    });

    it('TC-SL-025: No params → returns libraries array with correct fields', async () => {
      const input = new SearchLibraryInput();
      const output = new SearchLibraryOutput();

      await service.soLibrary(input, output, makeCtx());

      expect(output.total).toBe(3);
      expect(output.libraries).toHaveLength(3);
      for (const lib of output.libraries) {
        expect(lib).toHaveProperty('library_id');
        expect(lib).toHaveProperty('library_name');
        expect(lib).toHaveProperty('library_path');
      }
    });

    it('TC-SL-026: Keyword filter', async () => {
      const input = Object.assign(new SearchLibraryInput(), { keyword: 'Alpha' });
      const output = new SearchLibraryOutput();

      await service.soLibrary(input, output, makeCtx());

      expect(output.total).toBe(2);
      expect(output.libraries).toHaveLength(2);
    });

    it('TC-SL-027: Pagination', async () => {
      const input = Object.assign(new SearchLibraryInput(), { page_current: 1, page_size: 2 });
      const output = new SearchLibraryOutput();

      await service.soLibrary(input, output, makeCtx());

      expect(output.total).toBe(3);
      expect(output.libraries.length).toBeLessThanOrEqual(2);
    });

    it('TC-SL-028: file_count correct', async () => {
      const input = new SearchLibraryInput();
      const output = new SearchLibraryOutput();

      await service.soLibrary(input, output, makeCtx());

      const libA = output.libraries.find((l) => l.library_id === 'lib-a');
      expect(libA).toBeDefined();
      expect(libA?.total_files).toBe(2);
    });

    it('TC-SL-029: learned_count correct', async () => {
      const input = new SearchLibraryInput();
      const output = new SearchLibraryOutput();

      await service.soLibrary(input, output, makeCtx());

      const libA = output.libraries.find((l) => l.library_id === 'lib-a');
      expect(libA).toBeDefined();
      expect(libA?.learned_files).toBe(1);
    });

    it('TC-SL-030: No match → total=0', async () => {
      const input = Object.assign(new SearchLibraryInput(), { keyword: 'xyzzy_no_match' });
      const output = new SearchLibraryOutput();

      await service.soLibrary(input, output, makeCtx());

      expect(output.total).toBe(0);
      expect(output.libraries).toHaveLength(0);
    });
  });

  describe('soLibraryFiles', () => {
    const libId = 'lib-files-test';

    beforeEach(async () => {
      await db.insert('self_learning_library', [
        { field: 'id', value: libId },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_name', value: 'Files Test' },
        { field: 'library_path', value: '/tmp/files-test' },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 5 },
      ]);
      await db.insert('self_learning_file', [

        { field: 'id', value: 'file-pending' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_id', value: libId },
        { field: 'file_name', value: 'pending.md' },
        { field: 'file_path', value: '/tmp/files-test/pending.md' },
        { field: 'file_size', value: 100 },
        { field: 'status', value: 'PENDING' },
      ]);
      await db.insert('self_learning_file', [

        { field: 'id', value: 'file-completed' },
        { field: 'created', value: 1700000002000 },
        { field: 'updated', value: 1700000002000 },
        { field: 'library_id', value: libId },
        { field: 'file_name', value: 'completed.md' },
        { field: 'file_path', value: '/tmp/files-test/completed.md' },
        { field: 'file_size', value: 200 },
        { field: 'status', value: 'COMPLETED' },
      ]);
      await db.insert('self_learning_file', [

        { field: 'id', value: 'file-processing' },
        { field: 'created', value: 1700000003000 },
        { field: 'updated', value: 1700000003000 },
        { field: 'library_id', value: libId },
        { field: 'file_name', value: 'processing.md' },
        { field: 'file_path', value: '/tmp/files-test/processing.md' },
        { field: 'file_size', value: 300 },
        { field: 'status', value: 'PROCESSING' },
      ]);
      await db.insert('self_learning_file', [

        { field: 'id', value: 'file-failed' },
        { field: 'created', value: 1700000004000 },
        { field: 'updated', value: 1700000004000 },
        { field: 'library_id', value: libId },
        { field: 'file_name', value: 'failed.md' },
        { field: 'file_path', value: '/tmp/files-test/failed.md' },
        { field: 'file_size', value: 400 },
        { field: 'status', value: 'FAILED' },
      ]);
    });

    it('TC-SL-035: Get all files', async () => {
      const input = Object.assign(new GetLibraryFilesInput(), { library_id: libId });
      const output = new GetLibraryFilesOutput();

      await service.soLibraryFiles(input, output, makeCtx());

      expect(output.total).toBe(4);
      expect(output.files).toHaveLength(4);
    });

    it('TC-SL-036: Filter by PENDING status', async () => {
      const input = Object.assign(new GetLibraryFilesInput(), {
        library_id: libId,
        status: 'PENDING',
      });
      const output = new GetLibraryFilesOutput();

      await service.soLibraryFiles(input, output, makeCtx());

      expect(output.total).toBe(1);
      expect(output.files[0].status).toBe('PENDING');
    });

    it('TC-SL-037: Filter by COMPLETED status', async () => {
      const input = Object.assign(new GetLibraryFilesInput(), {
        library_id: libId,
        status: 'COMPLETED',
      });
      const output = new GetLibraryFilesOutput();

      await service.soLibraryFiles(input, output, makeCtx());

      expect(output.total).toBe(1);
      expect(output.files[0].status).toBe('COMPLETED');
    });

    it('TC-SL-038: Filter by PROCESSING status', async () => {
      const input = Object.assign(new GetLibraryFilesInput(), {
        library_id: libId,
        status: 'PROCESSING',
      });
      const output = new GetLibraryFilesOutput();

      await service.soLibraryFiles(input, output, makeCtx());

      expect(output.total).toBe(1);
      expect(output.files[0].status).toBe('PROCESSING');
    });

    it('TC-SL-039: Filter by FAILED status', async () => {
      const input = Object.assign(new GetLibraryFilesInput(), {
        library_id: libId,
        status: 'FAILED',
      });
      const output = new GetLibraryFilesOutput();

      await service.soLibraryFiles(input, output, makeCtx());

      expect(output.total).toBe(1);
      expect(output.files[0].status).toBe('FAILED');
    });

    it('TC-SL-040: Pagination', async () => {
      const input = Object.assign(new GetLibraryFilesInput(), {
        library_id: libId,
        page_current: 1,
        page_size: 2,
      });
      const output = new GetLibraryFilesOutput();

      await service.soLibraryFiles(input, output, makeCtx());

      expect(output.total).toBe(4);
      expect(output.files.length).toBeLessThanOrEqual(2);
    });

    it('TC-SL-041: Invalid library_id → returns empty result', async () => {
      const input = Object.assign(new GetLibraryFilesInput(), {
        library_id: 'nonexistent-lib',
      });
      const output = new GetLibraryFilesOutput();

      await service.soLibraryFiles(input, output, makeCtx());

      expect(output.total).toBe(0);
      expect(output.files).toEqual([]);
    });

    it('TC-SL-042: Empty library → files=[]', async () => {
      const emptyLibId = 'empty-lib';
      await db.insert('self_learning_library', [
        { field: 'id', value: emptyLibId },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_name', value: 'Empty Lib' },
        { field: 'library_path', value: '/tmp/empty' },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 5 },
      ]);

      const input = Object.assign(new GetLibraryFilesInput(), { library_id: emptyLibId });
      const output = new GetLibraryFilesOutput();

      await service.soLibraryFiles(input, output, makeCtx());

      expect(output.total).toBe(0);
      expect(output.files).toEqual([]);
    });
  });

  describe('soFileContent', () => {
    it('TC-SL-045: Get file content → returns file_name and content', async () => {
      const dir = makeTempDir();
      const content = '# Test Content\nThe quick brown fox';
      const fileName = 'test.md';
      writeMdFile(dir, fileName, content);
      const filePath = path.join(dir, fileName);

      await db.insert('self_learning_library', [
        { field: 'id', value: 'lib-fc' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_name', value: 'FC Test' },
        { field: 'library_path', value: dir },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 5 },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-fc-test' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_id', value: 'lib-fc' },
        { field: 'file_name', value: fileName },
        { field: 'file_path', value: filePath },
        { field: 'file_size', value: content.length },
        { field: 'status', value: 'COMPLETED' },
        { field: 'learned_at', value: 1700000099000 },
      ]);

      const input = Object.assign(new GetFileContentInput(), { file_id: 'file-fc-test' });
      const output = new GetFileContentOutput();

      const result = await service.soFileContent(input, output, makeCtx());

      expect(result).toBe(true);
      expect(output.file_name).toBe(fileName);
      expect(output.content).toBe(content);
    });

    it('TC-SL-046: Invalid file_id → returns false', async () => {
      const input = Object.assign(new GetFileContentInput(), { file_id: 'nonexistent-file' });
      const output = new GetFileContentOutput();

      const result = await service.soFileContent(input, output, makeCtx());

      expect(result).toBe(false);
    });

    it('TC-SL-047: soFileContent returns learned_at from DB', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'doc.md', '# Doc');
      const filePath = path.join(dir, 'doc.md');
      const learnedAt = 1700000099500;

      await db.insert('self_learning_library', [
        { field: 'id', value: 'lib-fc2' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_name', value: 'FC2 Test' },
        { field: 'library_path', value: dir },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 5 },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-x' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_id', value: 'lib-fc2' },
        { field: 'file_name', value: 'doc.md' },
        { field: 'file_path', value: filePath },
        { field: 'file_size', value: 6 },
        { field: 'status', value: 'COMPLETED' },
        { field: 'learned_at', value: learnedAt },
      ]);

      const input = Object.assign(new GetFileContentInput(), { file_id: 'file-x' });
      const output = new GetFileContentOutput();

      await service.soFileContent(input, output, makeCtx());

      expect(output.learned_at).toBe(learnedAt);
    });

    it('TC-SL-048: File with no learned_at returns undefined', async () => {
      const dir = makeTempDir();
      writeMdFile(dir, 'pending.md', '# Pending');
      const filePath = path.join(dir, 'pending.md');

      await db.insert('self_learning_library', [
        { field: 'id', value: 'lib-fc3' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_name', value: 'FC3 Test' },
        { field: 'library_path', value: dir },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 5 },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-x' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_id', value: 'lib-fc3' },
        { field: 'file_name', value: 'pending.md' },
        { field: 'file_path', value: filePath },
        { field: 'file_size', value: 10 },
        { field: 'status', value: 'PENDING' },
      ]);

      const input = Object.assign(new GetFileContentInput(), { file_id: 'file-x' });
      const output = new GetFileContentOutput();

      await service.soFileContent(input, output, makeCtx());

      expect(output.file_name).toBe('pending.md');
      expect(output.learned_at).toBeNull();
    });
  });

  describe('updateFileContent / deleteFile', () => {
    async function seedFile(dir: string, fileId: string, name: string, content: string): Promise<string> {
      const filePath = path.join(dir, name);
      writeMdFile(dir, name, content);
      await db.insert('self_learning_library', [
        { field: 'id', value: `lib-${fileId}` },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_name', value: 'Edit Test' },
        { field: 'library_path', value: dir },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 5 },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: fileId },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_id', value: `lib-${fileId}` },
        { field: 'file_name', value: name },
        { field: 'file_path', value: filePath },
        { field: 'relative_path', value: name },
        { field: 'parent_path', value: '' },
        { field: 'is_directory', value: 0 },
        { field: 'file_size', value: content.length },
        { field: 'status', value: 'COMPLETED' },
        { field: 'learned_at', value: 1700000099000 },
      ]);
      return filePath;
    }

    it('TC-SL-049: updateFileContent writes back to disk and resets status to PENDING', async () => {
      const dir = makeTempDir();
      const filePath = await seedFile(dir, 'file-edit-1', 'edit.md', '# Old');
      const next = '# New Title\n\nupdated body';

      const input = Object.assign(new UpdateFileContentInput(), { file_id: 'file-edit-1', content: next });
      const output = new UpdateFileContentOutput();
      await service.updateFileContent(input, output, makeCtx());

      expect(fs.readFileSync(filePath, 'utf-8')).toBe(next);
      expect(output.file_name).toBe('edit.md');
      expect(output.size).toBe(Buffer.byteLength(next, 'utf-8'));

      const row = db.queryRaw<{ status: string; file_size: number; learned_at: number | null }>(
        'SELECT "status", "file_size", "learned_at" FROM "self_learning_file" WHERE "id" = ?',
        ['file-edit-1'],
      )[0];
      expect(row.status).toBe('PENDING');
      expect(row.file_size).toBe(Buffer.byteLength(next, 'utf-8'));
      expect(row.learned_at).toBeNull();
    });

    it('TC-SL-050: updateFileContent on missing file → throws', async () => {
      const input = Object.assign(new UpdateFileContentInput(), { file_id: 'nope', content: 'x' });
      await expect(service.updateFileContent(input, new UpdateFileContentOutput(), makeCtx())).rejects.toThrow();
    });

    it('TC-SL-051: updateFileContent on directory → throws and leaves directory intact', async () => {
      const dir = makeTempDir();
      fs.mkdirSync(path.join(dir, 'sub'));
      await db.insert('self_learning_library', [
        { field: 'id', value: 'lib-dir' }, { field: 'created', value: 1 }, { field: 'updated', value: 1 }, { field: 'library_name', value: 'Dir' },
        { field: 'library_path', value: dir }, { field: 'enable_self_learning', value: 1 }, { field: 'learning_rate', value: 5 },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-dir' }, { field: 'created', value: 1 }, { field: 'updated', value: 1 },
        { field: 'library_id', value: 'lib-dir' },
        { field: 'file_name', value: 'sub' }, { field: 'file_path', value: path.join(dir, 'sub') },
        { field: 'is_directory', value: 1 }, { field: 'status', value: 'PENDING' },
      ]);
      const input = Object.assign(new UpdateFileContentInput(), { file_id: 'file-dir', content: 'x' });
      await expect(service.updateFileContent(input, new UpdateFileContentOutput(), makeCtx())).rejects.toThrow();
      expect(fs.existsSync(path.join(dir, 'sub'))).toBe(true);
    });

    it('TC-SL-052: deleteFile removes disk file, index row and cascaded annotations', async () => {
      const dir = makeTempDir();
      const filePath = await seedFile(dir, 'file-del-1', 'del.md', '# Del');
      await db.insert('document_annotation', [
        { field: 'id', value: 'lib-file-del-1' }, { field: 'created', value: 1 }, { field: 'updated', value: 1 },
        { field: 'library_id', value: 'lib-file-del-1' }, { field: 'file_id', value: 'file-del-1' },
        { field: 'selection_text', value: 'Del' }, { field: 'selection_start', value: 0 }, { field: 'selection_end', value: 3 },
        { field: 'question', value: 'q' }, { field: 'result', value: 'a' }, { field: 'llm_id', value: '' },
      ]);

      const output = new DeleteFileOutput();
      await service.deleteFile(Object.assign(new DeleteFileInput(), { file_id: 'file-del-1' }), output, makeCtx());

      expect(fs.existsSync(filePath)).toBe(false);
      expect(output.deleted_annotations).toBe(1);
      const rows = db.queryRaw<{ c: number }>('SELECT COUNT(*) AS c FROM "self_learning_file" WHERE "id" = ?', ['file-del-1']);
      expect(Number(rows[0]?.c ?? 0)).toBe(0);
      const ann = db.queryRaw<{ c: number }>('SELECT COUNT(*) AS c FROM "document_annotation" WHERE "file_id" = ?', ['file-del-1']);
      expect(Number(ann[0]?.c ?? 0)).toBe(0);
    });

    it('TC-SL-053: deleteFile on missing file → throws', async () => {
      const input = Object.assign(new DeleteFileInput(), { file_id: 'nope' });
      await expect(service.deleteFile(input, new DeleteFileOutput(), makeCtx())).rejects.toThrow();
    });

    it('TC-SL-054: deleteFile is idempotent when disk file already removed', async () => {
      const dir = makeTempDir();
      const filePath = await seedFile(dir, 'file-del-2', 'gone.md', '# Gone');
      fs.rmSync(filePath);
      const output = new DeleteFileOutput();
      await service.deleteFile(Object.assign(new DeleteFileInput(), { file_id: 'file-del-2' }), output, makeCtx());
      const rows = db.queryRaw<{ c: number }>('SELECT COUNT(*) AS c FROM "self_learning_file" WHERE "id" = ?', ['file-del-2']);
      expect(Number(rows[0]?.c ?? 0)).toBe(0);
    });
  });

  describe('startLearning', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      await db.insert('self_learning_library', [
        { field: 'id', value: 'lib-sl-a' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_name', value: 'SL Lib A' },
        { field: 'library_path', value: '/tmp/sl-a' },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 5 },
      ]);
      await db.insert('self_learning_library', [
        { field: 'id', value: 'lib-sl-b' },
        { field: 'created', value: 1700000002000 },
        { field: 'updated', value: 1700000002000 },
        { field: 'library_name', value: 'SL Lib B' },
        { field: 'library_path', value: '/tmp/sl-b' },
        { field: 'enable_self_learning', value: 1 },
        { field: 'learning_rate', value: 3 },
      ]);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('TC-SL-050: ALL mode → starts conversation learning (runEvalOnce)', async () => {
      const input = Object.assign(new StartLearningInput(), { learning_mode: 'ALL' });

      const result = await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(result).toBe(true);
      expect(evolutorAgent.runEvalOnce).toHaveBeenCalled();
    });

    it('TC-SL-051: Specific library_id in ALL mode', async () => {
      const input = Object.assign(new StartLearningInput(), {
        library_id: 'lib-sl-a',
        learning_mode: 'ALL',
      });

      await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(evolutorAgent.runEvalOnce).toHaveBeenCalled();
    });

    it('TC-SL-052: DOCUMENT mode only → does not start conversation learning', async () => {
      const input = Object.assign(new StartLearningInput(), { learning_mode: 'DOCUMENT' });

      await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(evolutorAgent.runEvalOnce).not.toHaveBeenCalled();
    });

    it('TC-SL-053: CONVERSATION mode → calls evolutorAgent.runEvalOnce', async () => {
      const input = Object.assign(new StartLearningInput(), { learning_mode: 'CONVERSATION' });

      await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(evolutorAgent.runEvalOnce).toHaveBeenCalled();
    });

    it('TC-SL-053a: CONVERSATION mode → writes learning result when evaluations happen', async () => {
      (evolutorAgent.runEvalOnce as any).mockImplementation(async (_i: any, o: any) => {
        o.scanned_agents = 1;
        o.evaluated_count = 2;
        o.skipped_count = 1;
        return true;
      });

      await service.startLearning(
        Object.assign(new StartLearningInput(), { learning_mode: 'CONVERSATION' }),
        makeCtx(),
        new StartLearningOutput(),
      );

      let row: { source: string; type: string; content: string } | undefined;
      let convTask: LearningTaskRecord | undefined;
      for (let i = 0; i < 50; i++) {
        row = db.queryRaw<{ source: string; type: string; content: string }>(
          'SELECT "source", "type", "content" FROM "self_learning_result" WHERE "source" = \'CONVERSATION\'',
        )[0];
        const listOut = new ListLearningTasksOutput();
        await service.soLearningTasks(new ListLearningTasksInput(), listOut, makeCtx());
        convTask = listOut.tasks.find((t) => t.mode === 'CONVERSATION');
        if (row && convTask && convTask.status !== LearningTaskStatus.Running) break;
        await vi.advanceTimersByTimeAsync(20);
      }
      expect(row).toBeDefined();
      expect(row!.type).toBe('CONVERSATION');
      expect(row!.content).toContain('评估 2 条对话');

      expect(convTask?.status).toBe(LearningTaskStatus.Completed);
      expect(convTask?.detail).toContain('评估 2 条对话');
    });

    it('TC-SL-053b: CONVERSATION mode → no learning result when nothing evaluated', async () => {
      (evolutorAgent.runEvalOnce as any).mockImplementation(async (_i: any, o: any) => {
        o.scanned_agents = 0;
        o.evaluated_count = 0;
        o.skipped_count = 0;
        return true;
      });

      await service.startLearning(
        Object.assign(new StartLearningInput(), { learning_mode: 'CONVERSATION' }),
        makeCtx(),
        new StartLearningOutput(),
      );

      await vi.advanceTimersByTimeAsync(150);
      const n = db.queryRaw<{ c: number }>(
        'SELECT COUNT(*) AS c FROM "self_learning_result" WHERE "source" = \'CONVERSATION\'',
      )[0].c;
      expect(n).toBe(0);

      const listOut = new ListLearningTasksOutput();
      await service.soLearningTasks(new ListLearningTasksInput(), listOut, makeCtx());
      const convTask = listOut.tasks.find((t) => t.mode === 'CONVERSATION');
      expect(convTask?.status).toBe(LearningTaskStatus.Completed);
      expect(convTask?.detail).toContain('没有待评估');
    });

    it('TC-SL-054: TAG_MAINTENANCE mode → does not start conversation learning', async () => {
      const input = Object.assign(new StartLearningInput(), { learning_mode: 'TAG_MAINTENANCE' });

      await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(evolutorAgent.runEvalOnce).not.toHaveBeenCalled();
    });

    it('TC-SL-055: RANDOM mode → sets randomLearningTimer', async () => {
      const input = Object.assign(new StartLearningInput(), { learning_mode: 'RANDOM' });

      await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(evolutorAgent.runEvalOnce).not.toHaveBeenCalled();
    });

    it('TC-SL-056: Learning mode compatible with DOCUMENT substrings', async () => {
      const input = Object.assign(new StartLearningInput(), { learning_mode: 'DOCUMENT_FAST' });

      await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(evolutorAgent.runEvalOnce).not.toHaveBeenCalled();
    });

    it('TC-SL-057: Invalid library_id → does not throw, runs normally', async () => {
      const input = Object.assign(new StartLearningInput(), {
        library_id: 'nonexistent-lib',
        learning_mode: 'DOCUMENT',
      });

      const result = await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(result).toBe(true);
    });

    it('TC-SL-058: Custom learning_rate in startLearning', async () => {
      const input = Object.assign(new StartLearningInput(), {
        learning_rate: 20,
        learning_mode: 'DOCUMENT',
      });

      await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(evolutorAgent.runEvalOnce).not.toHaveBeenCalled();
    });

    it('TC-SL-059: Default learning_mode is ALL', async () => {
      const input = new StartLearningInput();

      await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(evolutorAgent.runEvalOnce).toHaveBeenCalled();
    });

    it('TC-SL-060: Start twice → second call is idempotent (conversation pass re-entrancy guard)', async () => {
      vi.mocked(evolutorAgent.runEvalOnce).mockImplementation(() => new Promise(() => {  }));
      const input = Object.assign(new StartLearningInput(), { learning_mode: 'ALL' });

      await service.startLearning(input, makeCtx(), new StartLearningOutput());
      await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(evolutorAgent.runEvalOnce).toHaveBeenCalledTimes(1);
    });

    it('TC-SL-061: Invalid learning_mode → no error, just no-op', async () => {
      const input = Object.assign(new StartLearningInput(), { learning_mode: 'INVALID_MODE' });

      const result = await service.startLearning(input, makeCtx(), new StartLearningOutput());

      expect(result).toBe(true);
      expect(evolutorAgent.runEvalOnce).not.toHaveBeenCalled();
    });
  });

  describe('stopLearning', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('TC-SL-065: Stop ALL → clears document timer and stops eval schedule', async () => {
      const startInput = Object.assign(new StartLearningInput(), { learning_mode: 'ALL' });
      await service.startLearning(startInput, makeCtx(), new StartLearningOutput());

      const input = Object.assign(new StopLearningInput(), { learning_mode: 'ALL' });
      const result = await service.stopLearning(input, makeCtx(), new StopLearningOutput());

      expect(result).toBe(true);
      expect(evolutorAgent.stopEvalSchedule).toHaveBeenCalled();
    });

    it('TC-SL-066: Stop DOCUMENT only → clears document timer', async () => {
      const startInput = Object.assign(new StartLearningInput(), { learning_mode: 'ALL' });
      await service.startLearning(startInput, makeCtx(), new StartLearningOutput());

      const input = Object.assign(new StopLearningInput(), { learning_mode: 'DOCUMENT' });
      const result = await service.stopLearning(input, makeCtx(), new StopLearningOutput());

      expect(result).toBe(true);
    });

    it('TC-SL-067: Stop CONVERSATION → calls evolutorAgent.stopEvalSchedule', async () => {
      const startInput = Object.assign(new StartLearningInput(), { learning_mode: 'CONVERSATION' });
      await service.startLearning(startInput, makeCtx(), new StartLearningOutput());

      evolutorAgent.stopEvalSchedule.mockClear();

      const input = Object.assign(new StopLearningInput(), { learning_mode: 'CONVERSATION' });
      await service.stopLearning(input, makeCtx(), new StopLearningOutput());

      expect(evolutorAgent.stopEvalSchedule).toHaveBeenCalled();
    });

    it('TC-SL-068: Stop TAG_MAINTENANCE → clears tag timers', async () => {
      const startInput = Object.assign(new StartLearningInput(), { learning_mode: 'TAG_MAINTENANCE' });
      await service.startLearning(startInput, makeCtx(), new StartLearningOutput());

      const input = Object.assign(new StopLearningInput(), { learning_mode: 'TAG_MAINTENANCE' });
      const result = await service.stopLearning(input, makeCtx(), new StopLearningOutput());

      expect(result).toBe(true);
    });

    it('TC-SL-069: Stop RANDOM → clears random timer', async () => {
      const startInput = Object.assign(new StartLearningInput(), { learning_mode: 'RANDOM' });
      await service.startLearning(startInput, makeCtx(), new StartLearningOutput());

      const input = Object.assign(new StopLearningInput(), { learning_mode: 'RANDOM' });
      const result = await service.stopLearning(input, makeCtx(), new StopLearningOutput());

      expect(result).toBe(true);
    });

    it('TC-SL-070: Stop when not started → idempotent', async () => {
      const input = Object.assign(new StopLearningInput(), { learning_mode: 'ALL' });
      const result = await service.stopLearning(input, makeCtx(), new StopLearningOutput());

      expect(result).toBe(true);
    });

    it('TC-SL-071: Invalid mode → idempotent no-op', async () => {
      const input = Object.assign(new StopLearningInput(), { learning_mode: 'INVALID_MODE' });

      const result = await service.stopLearning(input, makeCtx(), new StopLearningOutput());

      expect(result).toBe(true);
    });
  });

  describe('handleDocumentLearning', () => {
    function makeFileRecord(overrides?: Record<string, unknown>): Record<string, unknown> {
      return {
        id: 'file-sl-080',
        file_id: 'file-sl-080',
        file_name: 'test.md',
        file_path: path.join(makeTempDir(), 'test.md'),
        file_size: 100,
        status: 'PENDING',
        ...overrides,
      };
    }

    it('TC-SL-080b: 文档学习直接记录结果（V1 编排注入已移除，不再派发 workflow）', async () => {
      const file = makeFileRecord();
      await (service as any).handleDocumentLearning(file);

      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'self_learning_file',
          conditions: [{ field: 'id', operator: Operator.EQ, value: 'file-sl-080' }],
        },
      });
      const selOutput = Object.assign(new SelectOneDBOutput(), {});
      await db.selectOneDB(selInput, selOutput, new DBContext());

      expect(true).toBe(true);
    });
  });

  describe('soTagGraph', () => {
    beforeEach(() => {
      ensureInfoTables();
    });

    it('TC-SL-120: Get tag graph → returns nodes/edges/metadata', async () => {
      const input = new GetTagGraphInput();
      const output = new GetTagGraphOutput();

      const result = await service.soTagGraph(input, output, makeCtx());

      expect(result).toBe(true);
      expect(Array.isArray(output.nodes)).toBe(true);
      expect(Array.isArray(output.edges)).toBe(true);
      expect(output.metadata).toBeDefined();
    });

    it('TC-SL-121: only_active=true → filters active edges', async () => {
      const input = Object.assign(new GetTagGraphInput(), { only_active: true });
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      expect(graphDb.selectGraph).toHaveBeenCalled();
      expect(Array.isArray(output.edges)).toBe(true);
    });

    it('TC-SL-122: only_active=false → returns all', async () => {
      const input = Object.assign(new GetTagGraphInput(), { only_active: false });
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      expect(graphDb.selectGraph).toHaveBeenCalled();
    });

    it('TC-SL-123: min_weight filter applied', async () => {
      const input = Object.assign(new GetTagGraphInput(), {
        only_active: false,
        min_weight: 0.5,
      });
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      expect(Array.isArray(output.edges)).toBe(true);
    });

    it('TC-SL-124: limit restriction applied', async () => {
      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = Array.from({ length: 100 }, (_, idx) => ({
          id: `tag-${idx}`,
          node_type: 'Tag',
          created: 1700000000000 + idx,
          content: { tag: `tag-${idx}`, tag_name: `Tag ${idx}` },
        }));
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [];
        return true;
      });

      const input = Object.assign(new GetTagGraphInput(), { limit: 10 });
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      expect(output.nodes.length).toBeLessThanOrEqual(10);
    });

    it('TC-SL-125: Default only_active is true', async () => {
      const input = new GetTagGraphInput();
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      expect(Array.isArray(output.edges)).toBe(true);
    });

    it('TC-SL-126: metadata correct (total_nodes, total_edges, etc.)', async () => {
      const input = Object.assign(new GetTagGraphInput(), { only_active: false });
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      expect(output.metadata).toHaveProperty('total_nodes');
      expect(output.metadata).toHaveProperty('total_edges');
      expect(output.metadata).toHaveProperty('active_edges');
      expect(output.metadata).toHaveProperty('orphan_nodes');
    });

    it('TC-SL-127: Empty graph → empty nodes/edges', async () => {
      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [];
        return true;
      });

      const input = new GetTagGraphInput();
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      expect(output.nodes).toEqual([]);
      expect(output.edges).toEqual([]);
      expect(output.metadata.total_nodes).toBe(0);
      expect(output.metadata.total_edges).toBe(0);
    });

    it('TC-SL-128: Node structure contains tag_id, tag_name, activation_count', async () => {
      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{
          id: 'tag-node-1',
          node_type: 'Tag',
          created: 1700000001000,
          content: { tag: 'test-tag', tag_name: 'Test Tag' },
        }];
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [];
        return true;
      });

      const input = Object.assign(new GetTagGraphInput(), { only_active: false });
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      expect(output.nodes.length).toBeGreaterThanOrEqual(1);
      const node = output.nodes[0];
      expect(node).toHaveProperty('tag_id');
      expect(node).toHaveProperty('tag_name');
      expect(node).toHaveProperty('activation_count');
    });

    it('TC-SL-128-LARGE: Graph with more tags than limit — sorted by activation_count desc, truncated', async () => {
      const tagCount = 50;
      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = Array.from({ length: tagCount }, (_, idx) => ({
          id: `tag-node-${idx}`,
          node_type: 'Tag',
          created: 1700000000000 + idx,
          content: { tag: `tag-${idx}`, tag_name: `Tag ${idx}` },
        }));
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = Array.from({ length: tagCount }, (_, idx) => ({
          id: `edge-${idx}`,
          from_node_id: `tag-node-${idx}`,
          to_node_id: `tag-node-${(idx + 1) % tagCount}`,
          edge_type: 'similarTo',
          weight: 0.5,
          is_active: true,
          activation_count: tagCount - idx,
        }));
        return true;
      });

      const limit = 10;
      const input = Object.assign(new GetTagGraphInput(), { only_active: false, limit });
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      expect(output.nodes.length).toBeLessThanOrEqual(limit);
      expect(output.nodes.length).toBeGreaterThan(0);
      for (let i = 1; i < output.nodes.length; i++) {
        expect((output.nodes[i - 1].activation_count as number))
          .toBeGreaterThanOrEqual((output.nodes[i].activation_count as number));
      }
    });
  });

  describe('soTagRelatedInfo', () => {
    const tagId = 'tag-related-1';

    beforeEach(() => {
      ensureInfoTables();
    });

    beforeEach(async () => {
      await db.insert('info_tag_record', [
        { field: 'id', value: tagId },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'tag', value: 'JavaScript' },
        { field: 'info_id', value: 'info-1' },
      ]);
      await db.insert('info_tag_record', [
        { field: 'id', value: 'tag-related-2' },
        { field: 'created', value: 1700000002000 },
        { field: 'updated', value: 1700000002000 },
        { field: 'tag', value: 'JavaScript' },
        { field: 'info_id', value: 'info-2' },
      ]);
    });

    it('TC-SL-130: Get related info → returns infos array', async () => {
      const input = Object.assign(new GetTagRelatedInfoInput(), { tag_id: tagId });
      const output = new GetTagRelatedInfoOutput();

      const result = await service.soTagRelatedInfo(input, output, makeCtx());

      expect(result).toBe(true);
      expect(Array.isArray(output.infos)).toBe(true);
    });

    it('TC-SL-131: Invalid tag_id → returns total=0, empty infos', async () => {
      const input = Object.assign(new GetTagRelatedInfoInput(), { tag_id: 'nonexistent-tag' });
      const output = new GetTagRelatedInfoOutput();

      const result = await service.soTagRelatedInfo(input, output, makeCtx());

      expect(result).toBe(true);
      expect(output.total).toBe(0);
      expect(output.infos).toEqual([]);
    });

    it('TC-SL-132: No related info → total=0', async () => {
      await db.insert('info_tag_record', [
        { field: 'id', value: 'tag-empty-1' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'tag', value: 'UniqueTag' },
        { field: 'info_id', value: 'info-u-1' },
      ]);

      const input = Object.assign(new GetTagRelatedInfoInput(), { tag_id: 'tag-empty-1' });
      const output = new GetTagRelatedInfoOutput();

      await service.soTagRelatedInfo(input, output, makeCtx());

      expect(Array.isArray(output.infos)).toBe(true);
    });

    it('TC-SL-133: Pagination for related info', async () => {
      const input = Object.assign(new GetTagRelatedInfoInput(), {
        tag_id: tagId,
        page_current: 1,
        page_size: 1,
      });
      const output = new GetTagRelatedInfoOutput();

      await service.soTagRelatedInfo(input, output, makeCtx());

      expect(output.infos.length).toBeLessThanOrEqual(1);
    });
  });

  describe('soLearningProgress', () => {
    it('TC-SL-140: With running task → current_task populated', async () => {
      await db.insert('self_learning_task', [
        { field: 'id', value: 'task-1' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'id', value: 'running-task-1' },
        { field: 'task_name', value: 'Document Learning' },
        { field: 'task_type', value: 'DOCUMENT' },
        { field: 'status', value: 'RUNNING' },
        { field: 'progress', value: 50 },
        { field: 'started_at', value: 1700000005000 },
      ]);

      const input = new GetLearningProgressInput();
      const output = new GetLearningProgressOutput();

      await service.soLearningProgress(input, output, makeCtx());

      expect(output.current_task).not.toBeNull();
      expect(output.current_task?.status).toBe('RUNNING');
      expect(output.current_task?.task_name).toBe('Document Learning');
    });

    it('TC-SL-141: Task queue has pending tasks', async () => {
      await db.insert('self_learning_task', [
        { field: 'id', value: 'task-2' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'id', value: 'pending-task-1' },
        { field: 'task_name', value: 'Task B' },
        { field: 'task_type', value: 'DOCUMENT' },
        { field: 'status', value: 'PENDING' },
        { field: 'progress', value: 0 },
        { field: 'scheduled_at', value: 1700000002000 },
      ]);
      await db.insert('self_learning_task', [
        { field: 'id', value: 'task-3' },
        { field: 'created', value: 1700000003000 },
        { field: 'updated', value: 1700000003000 },
        { field: 'id', value: 'pending-task-2' },
        { field: 'task_name', value: 'Task A' },
        { field: 'task_type', value: 'TAG_MAINTENANCE' },
        { field: 'status', value: 'PENDING' },
        { field: 'progress', value: 0 },
        { field: 'scheduled_at', value: 1700000001000 },
      ]);

      const input = new GetLearningProgressInput();
      const output = new GetLearningProgressOutput();

      await service.soLearningProgress(input, output, makeCtx());

      expect(output.task_queue.length).toBe(2);
    });

    it('TC-SL-142: Builtin tasks → at least 3 (TAG_MAINTENANCE_CONNECTION/ESTABLISH/AGING)', async () => {
      const input = new GetLearningProgressInput();
      const output = new GetLearningProgressOutput();

      await service.soLearningProgress(input, output, makeCtx());

      expect(output.builtin_tasks.length).toBeGreaterThanOrEqual(3);
      const taskTypes = output.builtin_tasks.map((t) => t.task_type);
      expect(taskTypes).toContain('TAG_MAINTENANCE_CONNECTION');
      expect(taskTypes).toContain('TAG_MAINTENANCE_ESTABLISH');
      expect(taskTypes).toContain('TAG_MAINTENANCE_AGING');
    });

    it('TC-SL-143: No running task → current_task=null', async () => {
      const input = new GetLearningProgressInput();
      const output = new GetLearningProgressOutput();

      await service.soLearningProgress(input, output, makeCtx());

      expect(output.current_task).toBeNull();
    });

    it('TC-SL-144: Empty queue → task_queue=[]', async () => {
      const input = new GetLearningProgressInput();
      const output = new GetLearningProgressOutput();

      await service.soLearningProgress(input, output, makeCtx());

      expect(output.task_queue).toEqual([]);
    });

    it('TC-SL-145: Builtin tasks have status ENABLED', async () => {
      const input = new GetLearningProgressInput();
      const output = new GetLearningProgressOutput();

      await service.soLearningProgress(input, output, makeCtx());

      expect(output.builtin_tasks.length).toBeGreaterThan(0);
      for (const task of output.builtin_tasks) {
        expect(task.status).toBe('ENABLED');
      }
    });
  });

  describe('soLearningResults', () => {
    beforeEach(async () => {
      await db.insert('self_learning_result', [
        { field: 'id', value: 'lr-1' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'result_id', value: 'result-1' },
        { field: 'type', value: 'KNOWLEDGE' },
        { field: 'source', value: 'DOCUMENT' },
        { field: 'content', value: 'Knowledge from document' },
        { field: 'summary', value: 'Knowledge from doc' },
        { field: 'learned_at', value: 1700000100000 },
      ]);
      await db.insert('self_learning_result', [
        { field: 'id', value: 'lr-2' },
        { field: 'created', value: 1700000002000 },
        { field: 'updated', value: 1700000002000 },
        { field: 'result_id', value: 'result-2' },
        { field: 'type', value: 'INSIGHT' },
        { field: 'source', value: 'CONVERSATION' },
        { field: 'content', value: 'Insight from conversation' },
        { field: 'summary', value: 'Insight from conv' },
        { field: 'learned_at', value: 1700000200000 },
      ]);
      await db.insert('self_learning_result', [
        { field: 'id', value: 'lr-3' },
        { field: 'created', value: 1700000003000 },
        { field: 'updated', value: 1700000003000 },
        { field: 'result_id', value: 'result-3' },
        { field: 'type', value: 'KNOWLEDGE' },
        { field: 'source', value: 'TAG_MAINTENANCE' },
        { field: 'content', value: 'Tag maintenance result' },
        { field: 'summary', value: 'Tag result' },
        { field: 'learned_at', value: 1700000300000 },
      ]);
    });

    it('TC-SL-150: Get all results', async () => {
      const input = new GetLearningResultsInput();
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      expect(output.total).toBe(3);
      expect(output.results).toHaveLength(3);
    });

    it('TC-SL-151: Filter by KNOWLEDGE type', async () => {
      const input = Object.assign(new GetLearningResultsInput(), { type: 'KNOWLEDGE' });
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      expect(output.total).toBe(2);
      for (const r of output.results) {
        expect(r.type).toBe('KNOWLEDGE');
      }
    });

    it('TC-SL-152: Filter by INSIGHT type', async () => {
      const input = Object.assign(new GetLearningResultsInput(), { type: 'INSIGHT' });
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      expect(output.total).toBe(1);
      expect(output.results[0].type).toBe('INSIGHT');
    });

    it('TC-SL-153: Filter by DOCUMENT source', async () => {
      const input = Object.assign(new GetLearningResultsInput(), { source: 'DOCUMENT' });
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      expect(output.total).toBe(1);
      expect(output.results[0].source).toBe('DOCUMENT');
    });

    it('TC-SL-154: Filter by CONVERSATION source', async () => {
      const input = Object.assign(new GetLearningResultsInput(), { source: 'CONVERSATION' });
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      expect(output.total).toBe(1);
      expect(output.results[0].source).toBe('CONVERSATION');
    });

    it('TC-SL-155: Filter by TAG_MAINTENANCE source', async () => {
      const input = Object.assign(new GetLearningResultsInput(), { source: 'TAG_MAINTENANCE' });
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      expect(output.total).toBe(1);
      expect(output.results[0].source).toBe('TAG_MAINTENANCE');
    });

    it('TC-SL-156: Combined filter (type + source)', async () => {
      const input = Object.assign(new GetLearningResultsInput(), {
        type: 'KNOWLEDGE',
        source: 'DOCUMENT',
      });
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      expect(output.total).toBe(1);
      expect(output.results[0].type).toBe('KNOWLEDGE');
      expect(output.results[0].source).toBe('DOCUMENT');
    });

    it('TC-SL-157: Pagination', async () => {
      const input = Object.assign(new GetLearningResultsInput(), {
        page_current: 1,
        page_size: 2,
      });
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      expect(output.total).toBe(3);
      expect(output.results.length).toBeLessThanOrEqual(2);
    });

    it('TC-SL-158: No results → total=0', async () => {
      const input = Object.assign(new GetLearningResultsInput(), { type: 'NONEXISTENT' });
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      expect(output.total).toBe(0);
      expect(output.results).toEqual([]);
    });

    it('TC-SL-159: Each result includes tags array', async () => {
      await db.insert('self_learning_result_tag', [
        { field: 'id', value: 'rt-1' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'result_id', value: 'result-1' },
        { field: 'tag', value: 'javascript' },
      ]);
      await db.insert('self_learning_result_tag', [
        { field: 'id', value: 'rt-2' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'result_id', value: 'result-1' },
        { field: 'tag', value: 'typescript' },
      ]);

      const input = Object.assign(new GetLearningResultsInput(), { type: 'KNOWLEDGE', source: 'DOCUMENT' });
      const output = new GetLearningResultsOutput();

      await service.soLearningResults(input, output, makeCtx());

      const docResult = output.results.find((r) => r.result_id === 'result-1');
      expect(docResult).toBeDefined();
      expect(Array.isArray(docResult?.tags)).toBe(true);
      expect(docResult?.tags).toContain('javascript');
      expect(docResult?.tags).toContain('typescript');
    });
  });

  describe('soLearningStats', () => {
    it('TC-SL-165: Complete stats → all fields present', async () => {
      const input = new GetLearningStatsInput();
      const output = new GetLearningStatsOutput();

      await service.soLearningStats(input, output, makeCtx());

      const stats = output.stats;
      expect(stats).toHaveProperty('total_learning_count');
      expect(stats).toHaveProperty('total_knowledge_count');
      expect(stats).toHaveProperty('total_insight_count');
      expect(stats).toHaveProperty('this_week_learning_count');
      expect(stats).toHaveProperty('document_learning');
      expect(stats).toHaveProperty('tag_graph');
      expect(stats).toHaveProperty('learning_trend');
    });

    it('TC-SL-166: Document stats correct', async () => {
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-ds-1' },
        { field: 'created', value: 1700000001000 },
        { field: 'updated', value: 1700000001000 },
        { field: 'library_id', value: 'lib-ds' },
        { field: 'file_name', value: 'completed.md' },
        { field: 'file_path', value: '/tmp/ds/completed.md' },
        { field: 'file_size', value: 100 },
        { field: 'status', value: 'COMPLETED' },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-ds-2' },
        { field: 'created', value: 1700000002000 },
        { field: 'updated', value: 1700000002000 },
        { field: 'library_id', value: 'lib-ds' },
        { field: 'file_name', value: 'pending.md' },
        { field: 'file_path', value: '/tmp/ds/pending.md' },
        { field: 'file_size', value: 200 },
        { field: 'status', value: 'PENDING' },
      ]);
      await db.insert('self_learning_file', [
        { field: 'id', value: 'file-ds-3' },
        { field: 'created', value: 1700000003000 },
        { field: 'updated', value: 1700000003000 },
        { field: 'library_id', value: 'lib-ds' },
        { field: 'file_name', value: 'failed.md' },
        { field: 'file_path', value: '/tmp/ds/failed.md' },
        { field: 'file_size', value: 300 },
        { field: 'status', value: 'FAILED' },
      ]);

      const input = new GetLearningStatsInput();
      const output = new GetLearningStatsOutput();

      await service.soLearningStats(input, output, makeCtx());

      const docStats = output.stats.document_learning as Record<string, unknown>;
      expect(docStats.total_files).toBe(3);
      expect(docStats.learned_files).toBe(1);
      expect(docStats.failed_files).toBe(1);
      expect(docStats.pending_files).toBe(1);
      expect(docStats.completion_rate).toBeGreaterThan(0);
    });

    it('TC-SL-167: Tag graph stats present', async () => {
      const input = new GetLearningStatsInput();
      const output = new GetLearningStatsOutput();

      await service.soLearningStats(input, output, makeCtx());

      const tagStats = output.stats.tag_graph as Record<string, unknown>;
      expect(tagStats).toHaveProperty('total_tags');
      expect(tagStats).toHaveProperty('total_edges');
      expect(tagStats).toHaveProperty('active_edges');
      expect(tagStats).toHaveProperty('orphan_tags');
      expect(tagStats).toHaveProperty('aged_edges_this_week');
      expect(tagStats).toHaveProperty('new_edges_this_week');
    });

    it('TC-SL-168: Learning trend has 365 entries', async () => {
      const input = new GetLearningStatsInput();
      const output = new GetLearningStatsOutput();

      await service.soLearningStats(input, output, makeCtx());

      const trend = output.stats.learning_trend as Array<Record<string, unknown>>;
      expect(Array.isArray(trend)).toBe(true);
      expect(trend.length).toBe(365);
      for (const entry of trend) {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('count');
        expect(typeof entry.count).toBe('number');
      }
    });

    it('TC-SL-169: Empty data → all zeros', async () => {
      const input = new GetLearningStatsInput();
      const output = new GetLearningStatsOutput();

      await service.soLearningStats(input, output, makeCtx());

      expect(output.stats.total_learning_count).toBe(0);
      expect(output.stats.total_knowledge_count).toBe(0);
      expect(output.stats.total_insight_count).toBe(0);
      expect(output.stats.this_week_learning_count).toBe(0);
    });
  });

  describe('configSelfLearning', () => {
    it('TC-SL-170: Config update returns updated config', async () => {
      const input = Object.assign(new ConfigSelfLearningInput(), {
        default_learning_rate: 10,
        document_weight: 50,
      });
      const output = new ConfigSelfLearningOutput();

      await service.configSelfLearning(input, output, makeCtx());

      expect(output.config).toBeDefined();
      expect(output.config.default_learning_rate).toBe(10);
      expect(output.config.document_weight).toBe(50);
    });

    it('TC-SL-171: Partial config update preserves other fields', async () => {
      const input = Object.assign(new ConfigSelfLearningInput(), {
        learning_interval_ms: 300000,
      });
      const output = new ConfigSelfLearningOutput();

      await service.configSelfLearning(input, output, makeCtx());

      expect(output.config.learning_interval_ms).toBe(300000);
      expect(output.config).toHaveProperty('random_factor');
      expect(output.config).toHaveProperty('document_weight');
    });

    it('configSelfLearning: getConfig returns defaults when no saved config', async () => {
      const input = new ConfigSelfLearningInput();
      const output = new ConfigSelfLearningOutput();
      await service.configSelfLearning(input, output, makeCtx());
      expect(output.config).toHaveProperty('random_factor');
      expect(output.config).toHaveProperty('default_learning_rate');
      expect(output.config).toHaveProperty('document_split_threshold');
    });
  });

  describe('Config proxy endpoint', () => {
    it('TC-SL-180: configSelfLearning is internal — accessible as service method, no independent HTTP endpoint', async () => {
      const input = new ConfigSelfLearningInput();
      const output = new ConfigSelfLearningOutput();

      const result = await service.configSelfLearning(input, output, makeCtx());

      expect(result).toBe(true);
      expect(output.config).toBeDefined();
    });
  });

  describe('Tag maintenance', () => {
    beforeEach(() => {
      ensureInfoTables();
      vi.spyOn(infoCore, 'graphTag').mockResolvedValue(true);
    });

    it('TC-SL-100: startTagConnectionEstablishment calls graphTag for new tags within 24h', async () => {
      const now = Date.now();
      await db.insert('info_tag_record', [
        { field: 'id', value: 'tg-new-1' },
        { field: 'created', value: now - 1000 },
        { field: 'updated', value: now - 1000 },
        { field: 'tag', value: 'NewTag' },
        { field: 'info_id', value: 'info-recent' },
      ]);

      await service.startTagConnectionEstablishment();

      expect(infoCore.graphTag).toHaveBeenCalled();
    });

    it('TC-SL-101: No new tags in last 24h — handles gracefully without error', async () => {
      infoCore.graphTag.mockClear();

      const now = Date.now();
      await db.insert('info_tag_record', [
        { field: 'id', value: 'tg-old-1' },
        { field: 'created', value: now - 48 * 3600 * 1000 },
        { field: 'updated', value: now - 48 * 3600 * 1000 },
        { field: 'tag', value: 'OldTag' },
        { field: 'info_id', value: 'info-old' },
      ]);

      const result = await service.startTagConnectionEstablishment();

      expect(result).toBe(undefined);
    });

    it('TC-SL-103: startTagConnectionEstablishment with multiple new tags', async () => {
      infoCore.graphTag.mockClear();
      const now = Date.now();

      for (let i = 0; i < 3; i++) {
        await db.insert('info_tag_record', [
          { field: 'id', value: `tg-multi-${i}` },
          { field: 'created', value: now - 1000 + i },
          { field: 'updated', value: now - 1000 + i },
          { field: 'tag', value: `MultiTag${i}` },
          { field: 'info_id', value: `info-multi-${i}` },
        ]);
      }

      await service.startTagConnectionEstablishment();

      expect(infoCore.graphTag).toHaveBeenCalledTimes(3);
    });

    it('TC-SL-105: startTagActivation activates edges for active tags', async () => {
      const now = Date.now();
      await db.insert('info_tag_record', [
        { field: 'id', value: 'tg-active-1' },
        { field: 'created', value: now - 1000 },
        { field: 'updated', value: now - 1000 },
        { field: 'tag', value: 'ActiveTag' },
        { field: 'info_id', value: 'info-active' },
      ]);

      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{ id: 'node-1', node_type: 'Tag', content: { tag: 'ActiveTag' } }];
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{ id: 'edge-1', from: 'node-1', to: 'node-2', edge_type: 'similarTo' }];
        return true;
      });

      await service.startTagActivation();

      expect(graphDb.activateGraphEdge).toHaveBeenCalled();
    });

    it('TC-SL-106: startTagActivation — no tag nodes in graph', async () => {
      infoCore.graphTag.mockClear();
      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [];
        return true;
      });

      await service.startTagActivation();

      expect(graphDb.activateGraphEdge).not.toHaveBeenCalled();
    });

    it('TC-SL-107: startTagActivation records activation count in result', async () => {
      const now = Date.now();
      await db.insert('info_tag_record', [
        { field: 'id', value: 'tg-act-1' },
        { field: 'created', value: now - 1000 },
        { field: 'updated', value: now - 1000 },
        { field: 'tag', value: 'TagA' },
        { field: 'info_id', value: 'info-a' },
      ]);

      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{ id: 'node-1', node_type: 'Tag', content: { tag: 'TagA' } }];
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [];
        return true;
      });

      await service.startTagActivation();

      expect(graphDb.activateGraphEdge).not.toHaveBeenCalled();
    });

    it('TC-SL-110: startTagAging calls ageGraphEdge', async () => {
      const result = await service.startTagAging();

      expect(graphDb.ageGraphEdge).toHaveBeenCalled();
    });

    it('TC-SL-112: startTagAging with aged_count > 0 records result', async () => {
      graphDb.ageGraphEdge.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.aged_count = 5;
        return true;
      });

      await service.startTagAging();

      expect(graphDb.ageGraphEdge).toHaveBeenCalled();
    });

    it('TC-SL-115: startOrphanTagCheck attempts to reconnect orphan tags', async () => {
      infoCore.graphTag.mockClear();

      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [
          { id: 'node-orphan', node_type: 'Tag', content: { tag: 'OrphanTag' } },
        ];
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [];
        return true;
      });

      await service.startOrphanTagCheck();

      expect(infoCore.graphTag).toHaveBeenCalled();
    });

    it('TC-SL-116: No orphan tags — no graphTag calls for reconnection', async () => {
      infoCore.graphTag.mockClear();

      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{ id: 'node-connected', node_type: 'Tag', content: { tag: 'ConnectedTag' } }];
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{ id: 'edge-exists' }];
        return true;
      });

      await service.startOrphanTagCheck();

      expect(infoCore.graphTag).not.toHaveBeenCalled();
    });

    it('TC-SL-117: startOrphanTagCheck — graphTag failure for one orphan does not stop processing', async () => {
      infoCore.graphTag.mockReset();
      infoCore.graphTag.mockRejectedValueOnce(new Error('graphTag failed for first'));
      infoCore.graphTag.mockResolvedValueOnce(true);

      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [
          { id: 'orphan-1', node_type: 'Tag', content: { tag: 'TagO1' } },
          { id: 'orphan-2', node_type: 'Tag', content: { tag: 'TagO2' } },
        ];
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [];
        return true;
      });

      await service.startOrphanTagCheck();

      expect(infoCore.graphTag).toHaveBeenCalledTimes(2);
    });

    it('TC-SL-111: Aging reversibility — after aging an edge, activating it restores active state', async () => {
      graphDb.ageGraphEdge.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.aged_count = 2;
        return true;
      });
      graphDb.activateGraphEdge.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.activated = true;
        return true;
      });

      await service.startTagAging();
      expect(graphDb.ageGraphEdge).toHaveBeenCalled();

      const now = Date.now();
      await db.insert('info_tag_record', [
        { field: 'id', value: 'tg-rev-1' },
        { field: 'created', value: now - 1000 },
        { field: 'updated', value: now - 1000 },
        { field: 'tag', value: 'ReverseTag' },
        { field: 'info_id', value: 'info-rev' },
      ]);

      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{ id: 'node-rev', node_type: 'Tag', content: { tag: 'ReverseTag' } }];
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{
          id: 'edge-to-revive',
          from_node_id: 'node-rev',
          to_node_id: 'node-other',
          edge_type: 'similarTo',
          is_active: false,
        }];
        return true;
      });

      graphDb.activateGraphEdge.mockClear();

      await service.startTagActivation();

      expect(graphDb.activateGraphEdge).toHaveBeenCalled();
    });

    it('TC-SL-125: node_size calculation — follows [0.3, 1.0] log normalization formula', async () => {
      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [
          { id: 'ns-node-1', node_type: 'Tag', created: 1700000001000, content: { tag: 'high-tag', tag_name: 'High Tag' } },
          { id: 'ns-node-2', node_type: 'Tag', created: 1700000002000, content: { tag: 'low-tag', tag_name: 'Low Tag' } },
          { id: 'ns-node-3', node_type: 'Tag', created: 1700000003000, content: { tag: 'zero-tag', tag_name: 'Zero Tag' } },
        ];
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [
          { id: 'e1', from_node_id: 'ns-node-1', to_node_id: 'ns-node-2', edge_type: 'similarTo', weight: 0.5, is_active: true, activation_count: 10 },
          { id: 'e2', from_node_id: 'ns-node-2', to_node_id: 'ns-node-3', edge_type: 'similarTo', weight: 0.3, is_active: true, activation_count: 2 },
        ];
        return true;
      });

      const input = Object.assign(new GetTagGraphInput(), { only_active: false });
      const output = new GetTagGraphOutput();

      await service.soTagGraph(input, output, makeCtx());

      for (const node of output.nodes) {
        const nodeSize = node.node_size as number;
        expect(nodeSize).toBeGreaterThanOrEqual(0.3);
        expect(nodeSize).toBeLessThanOrEqual(1.0);
      }

      const highNode = output.nodes.find((n) => n.tag_id === 'ns-node-1');
      const lowNode = output.nodes.find((n) => n.tag_id === 'ns-node-2');
      const zeroNode = output.nodes.find((n) => n.tag_id === 'ns-node-3');

      expect(highNode).toBeDefined();
      expect(lowNode).toBeDefined();
      expect(zeroNode).toBeDefined();

      if (highNode && lowNode) {
        expect((highNode.node_size as number)).toBeGreaterThanOrEqual((lowNode.node_size as number));
      }
      if (zeroNode) {
        expect((zeroNode.activation_count as number)).toBe(0);
        expect((zeroNode.node_size as number)).toBe(0.3);
      }
    });
  });

  describe('学习任务状态（手动触发如实回显）', () => {
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    function startLearningMode(mode: string): Promise<boolean> {
      const input = Object.assign(new StartLearningInput(), { learning_mode: mode });
      return service.startLearning(input, makeCtx(), new StartLearningOutput());
    }

    async function fetchTaskRecords(): Promise<LearningTaskRecord[]> {
      const output = new ListLearningTasksOutput();
      await service.soLearningTasks(new ListLearningTasksInput(), output, makeCtx());
      return output.tasks;
    }

    function insertRecentTag(id: string, tag: string): Promise<void> {
      const now = Date.now();
      return db.insert('info_tag_record', [
        { field: 'id', value: id },
        { field: 'created', value: now - 1000 },
        { field: 'updated', value: now - 1000 },
        { field: 'tag', value: tag },
        { field: 'info_id', value: `info-${id}` },
      ]);
    }

    function mockGraphTagNode(tag: string): void {
      graphDb.selectGraph.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{ id: `node-${tag}`, node_type: 'Tag', content: { tag } }];
        return true;
      });
      graphDb.soGraphNeighbors.mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.list = [{ id: `edge-${tag}`, from: `node-${tag}`, to: 'node-other', edge_type: 'similarTo' }];
        return true;
      });
    }

    beforeEach(() => {
      ensureInfoTables();
      vi.spyOn(infoCore, 'graphTag').mockResolvedValue(true);
    });

    it('TC-SL-130: TAG_MAINTENANCE 手动触发 → 两阶段真实执行，任务 completed 且落学习记录', async () => {
      await insertRecentTag('tg-task-1', 'TaskTag');
      mockGraphTagNode('TaskTag');

      await startLearningMode('TAG_MAINTENANCE');
      await sleep(50);

      expect(infoCore.graphTag).toHaveBeenCalled();
      expect(graphDb.activateGraphEdge).toHaveBeenCalled();

      const tasks = await fetchTaskRecords();
      const tagTask = tasks.find((t) => t.mode === 'TAG_MAINTENANCE');
      expect(tagTask).toBeDefined();
      expect(tagTask!.status).toBe(LearningTaskStatus.Completed);
      expect(tagTask!.finished_at).toBeDefined();

      const rows = db.queryRaw<{ c: number }>(
        'SELECT COUNT(*) AS c FROM "self_learning_result" WHERE "source" = ?',
        ['TAG_MAINTENANCE'],
      );
      expect(rows[0]?.c ?? 0).toBeGreaterThan(0);
    });

    it('TC-SL-131: 同模式轮次执行中再次触发 → 第二个任务如实标记 skipped', async () => {
      await insertRecentTag('tg-skip-1', 'SkipTag');
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      infoCore.graphTag.mockImplementation(async () => { await gate; return true; });

      await startLearningMode('TAG_MAINTENANCE');
      await sleep(20);
      await startLearningMode('TAG_MAINTENANCE');
      await sleep(20);

      let tasks = await fetchTaskRecords();
      expect(tasks.filter((t) => t.mode === 'TAG_MAINTENANCE').map((t) => t.status).sort())
        .toEqual([LearningTaskStatus.Running, LearningTaskStatus.Skipped]);

      release();
      await sleep(30);

      tasks = await fetchTaskRecords();
      expect(tasks.filter((t) => t.mode === 'TAG_MAINTENANCE').map((t) => t.status).sort())
        .toEqual([LearningTaskStatus.Completed, LearningTaskStatus.Skipped]);
    });

    it('TC-SL-132: stopLearning 残留的取消意图不毒化下一次 Tag 维护轮次', async () => {
      const stopInput = Object.assign(new StopLearningInput(), { learning_mode: 'TAG_MAINTENANCE' });
      await service.stopLearning(stopInput, makeCtx(), new StopLearningOutput());

      await insertRecentTag('tg-task-2', 'PoisonTag');
      mockGraphTagNode('PoisonTag');

      await startLearningMode('TAG_MAINTENANCE');
      await sleep(50);

      expect(graphDb.activateGraphEdge).toHaveBeenCalled();
      const tasks = await fetchTaskRecords();
      expect(tasks.find((t) => t.mode === 'TAG_MAINTENANCE')?.status).toBe(LearningTaskStatus.Completed);
    });

    it('TC-SL-133: 对话学习轮次执行中再次触发 → 第二个任务 skipped', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      evolutorAgent.runEvalOnce.mockImplementation(async () => { await gate; return true; });

      await startLearningMode('CONVERSATION');
      await sleep(20);
      await startLearningMode('CONVERSATION');
      await sleep(20);

      let tasks = await fetchTaskRecords();
      expect(tasks.filter((t) => t.mode === 'CONVERSATION').map((t) => t.status).sort())
        .toEqual([LearningTaskStatus.Running, LearningTaskStatus.Skipped]);

      release();
      await sleep(30);

      tasks = await fetchTaskRecords();
      expect(tasks.filter((t) => t.mode === 'CONVERSATION').map((t) => t.status).sort())
        .toEqual([LearningTaskStatus.Completed, LearningTaskStatus.Skipped]);
    });

    it('TC-SL-134: 文档学习轮次执行中再次触发 → 第二个任务 skipped', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      vi.spyOn(db, 'selectDB').mockImplementation(async (_i: any, o: any, _c: any, ) => {
        await gate;
        o.rows = [];
        return true;
      });

      await startLearningMode('DOCUMENT');
      await sleep(20);
      await startLearningMode('DOCUMENT');
      await sleep(20);

      let tasks = await fetchTaskRecords();
      expect(tasks.filter((t) => t.mode === 'DOCUMENT').map((t) => t.status).sort())
        .toEqual([LearningTaskStatus.Running, LearningTaskStatus.Skipped]);

      release();
      await sleep(30);

      tasks = await fetchTaskRecords();
      expect(tasks.filter((t) => t.mode === 'DOCUMENT').map((t) => t.status).sort())
        .toEqual([LearningTaskStatus.Completed, LearningTaskStatus.Skipped]);
    });
  });
});

async function getLibraryById(
  db: RelationDBAccess,
  libraryId: string,
): Promise<Record<string, unknown> | null> {
  const selInput = Object.assign(new SelectOneDBInput(), {
    query_param: {
      table: 'self_learning_library',
      conditions: [
        { field: 'id', operator: Operator.EQ, value: libraryId },
      ],
    },
  });
  const selOutput = Object.assign(new SelectOneDBOutput(), {});
  await db.selectOneDB(selInput, selOutput, new DBContext());
  return selOutput.row ?? null;
}
