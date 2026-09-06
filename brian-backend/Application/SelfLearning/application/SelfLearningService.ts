import { callLLMJson } from '@brian-agent/base';
import { Metrics, Report } from '@brian-agent/base';
import * as fs from 'fs';
import * as path from 'path';
import { RelationDBAccess, SelectDBInput, SelectDBOutput, SelectOneDBInput, SelectOneDBOutput, UpdateDBInput, UpdateDBOutput, CountDBInput, CountDBOutput, TransactionDBInput, TransactionDBOutput, Operator, DataObject, DBContext, IdGenerator, NotFoundError, ValidationError, ExecLLMInput, ExecLLMOutput, LLMContext, ExecPromptInput, ExecPromptOutput, PromptContext, InfoType, PROMPT_IDS, getBuiltinTemplate, renderTemplate, type Logger, type Condition } from '@brian-agent/base';
import type { GraphDBAccess, ChunkAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import type {
  InfoCoreAccess, MQCoreAccess, LLMCoreAccess,
} from '@brian-agent/core';
import {
  MatchLLMInput, MatchLLMOutput, LLMCoreContext,
} from '@brian-agent/core';
import type {
  EvolutorAgentAccess, WriterAgentAccess,
} from '@brian-agent/agent';
import {
  SelectGraphInput, SelectGraphOutput,
  GetGraphNeighborsInput, GetGraphNeighborsOutput,
  ActivateGraphEdgeInput, ActivateGraphEdgeOutput,
  AgeGraphEdgeInput, AgeGraphEdgeOutput,
  GraphContext, GraphTarget, GraphDirection,
  ChunkTextInput, ChunkTextOutput, ChunkContext,
} from '@brian-agent/base';
import {
  GraphTagInput, GraphTagOutput,
  LastNInfoInput, LastNInfoOutput,
  InfoCoreContext,
} from '@brian-agent/core';
import {
  EvolutorAgentContext,
  StartEvalScheduleInput, StartEvalScheduleOutput,
  StopEvalScheduleInput, StopEvalScheduleOutput,
} from '@brian-agent/agent';
import {
  SelfLearningContext,
  AddLibraryInput, AddLibraryOutput,
  DeleteLibraryInput, DeleteLibraryOutput,
  SearchLibraryInput, SearchLibraryOutput,
  SetLibraryEnabledInput, SetLibraryEnabledOutput,
  GetLibraryFilesInput, GetLibraryFilesOutput,
  GetLibraryTreeInput, GetLibraryTreeOutput,
  type LibraryTreeNode,
  GetFileContentInput, GetFileContentOutput,
  QueryDocumentInput, QueryDocumentOutput,
  SaveAnnotationInput, SaveAnnotationOutput,
  GetFileAnnotationsInput, GetFileAnnotationsOutput,
  StartLearningInput, StartLearningOutput,
  StopLearningInput, StopLearningOutput,
  GetTagGraphInput, GetTagGraphOutput,
  GetTagRelatedInfoInput, GetTagRelatedInfoOutput,
  GetLearningProgressInput, GetLearningProgressOutput,
  GetLearningResultsInput, GetLearningResultsOutput,
  GetLearningStatsInput, GetLearningStatsOutput,
  LearningTaskRecord, LearningTaskStatus, ListLearningTasksInput, ListLearningTasksOutput,
  ConfigSelfLearningInput, ConfigSelfLearningOutput,
} from '../domain/types';

export class SelfLearningService {
  private documentLearningTimer: ReturnType<typeof setInterval> | null = null;
  private randomLearningTimer: ReturnType<typeof setInterval> | null = null;
  private evalScheduleRunning = false;
  private tagConnectionTimer: ReturnType<typeof setInterval> | null = null;
  private tagEstablishTimer: ReturnType<typeof setInterval> | null = null;
  private tagAgingTimer: ReturnType<typeof setInterval> | null = null;
  private orphanTagTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly mqCore: MQCoreAccess,
    private readonly llmCore: LLMCoreAccess,
    private readonly evolutorAgent: EvolutorAgentAccess,
    private readonly writerAgent: WriterAgentAccess,
    private readonly graphDBAccess: GraphDBAccess,
    private readonly chunkAccess: ChunkAccess,
    private readonly mqAccess: any,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly logger?: Logger,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // addLibrary
  // ─────────────────────────────────────────────────────────────────────────

  async addLibrary(input: AddLibraryInput, output: AddLibraryOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const libraryPath = path.resolve(input.library_path);
    fs.accessSync(libraryPath, fs.constants.R_OK);

    const stat = fs.statSync(libraryPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${libraryPath}`);
    }

    const now = IdGenerator.now();
    const libraryId = IdGenerator.generate();
    const libraryName = input.library_name || path.basename(libraryPath);

    await this.relationDb.insert('self_learning_library', [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'library_id', value: libraryId },
      { field: 'library_name', value: libraryName },
      { field: 'library_path', value: libraryPath },
      { field: 'enable_self_learning', value: input.enable_self_learning !== false ? 1 : 0 },
      { field: 'learning_rate', value: input.learning_rate ?? 5 },
    ]);

    const { fileCount } = await this.scanLibraryDirectory(libraryId, libraryPath, now);

    output.library_id = libraryId;
    output.file_count = fileCount;
    this.logger?.debug?.('addLibrary done', { libraryId, fileCount });
    return true;
  }

  /**
   * 递归扫描资料库目录，将子目录与文件（含层级结构）写入 self_learning_file 表。
   *
   * 目录记录：is_directory=1，file_size=0，status='PENDING'（不参与文档学习）。
   * 文件记录：is_directory=0，status='PENDING'，relative_path/parent_path 记录层级。
   *
   * @returns 扫描到的文件数与目录数
   */
  private async scanLibraryDirectory(
    libraryId: string,
    rootPath: string,
    now: number,
  ): Promise<{ fileCount: number; dirCount: number }> {
    let fileCount = 0;
    let dirCount = 0;

    const walk = async (dirAbsPath: string, parentRelPath: string): Promise<void> => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dirAbsPath, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const absPath = path.join(dirAbsPath, entry.name);
        const relPath = parentRelPath ? `${parentRelPath}${path.sep}${entry.name}` : entry.name;

        let isDir = false;
        let isFile = false;
        if (entry.isDirectory()) {
          isDir = true;
        } else if (entry.isFile()) {
          isFile = true;
        } else if (entry.isSymbolicLink()) {
          try {
            isDir = fs.statSync(absPath).isDirectory();
            isFile = !isDir && fs.statSync(absPath).isFile();
          } catch {
            continue;
          }
        }
        if (!isDir && !isFile) continue;

        let fileSize = 0;
        if (isFile) {
          try { fileSize = fs.statSync(absPath).size; } catch { fileSize = 0; }
        }

        await this.relationDb.insert('self_learning_file', [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'library_id', value: libraryId },
          { field: 'file_id', value: IdGenerator.generate() },
          { field: 'file_name', value: entry.name },
          { field: 'file_path', value: absPath },
          { field: 'relative_path', value: relPath },
          { field: 'parent_path', value: parentRelPath },
          { field: 'is_directory', value: isDir ? 1 : 0 },
          { field: 'file_size', value: fileSize },
          { field: 'status', value: 'PENDING' },
        ]);

        if (isDir) {
          dirCount++;
          await walk(absPath, relPath);
        } else {
          fileCount++;
        }
      }
    };

    await walk(rootPath, '');
    return { fileCount, dirCount };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // deleteLibrary
  // ─────────────────────────────────────────────────────────────────────────

  async deleteLibrary(input: DeleteLibraryInput, _output: DeleteLibraryOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const txInput = Object.assign(new TransactionDBInput(), {
      operations: [
        {
          type: 'DELETE',
          table: 'self_learning_file',
          conditions: [
            { field: 'library_id', operator: Operator.EQ, value: input.library_id },
          ] as Condition[],
        },
        {
          type: 'DELETE',
          table: 'self_learning_library',
          conditions: [
            { field: 'library_id', operator: Operator.EQ, value: input.library_id },
          ] as Condition[],
        },
      ],
    });
    await this.relationDb.transactionDB(txInput, Object.assign(new TransactionDBOutput(), {}), new DBContext());
    this.logger?.debug?.('deleteLibrary done', { libraryId: input.library_id });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // setLibraryEnabled
  // ─────────────────────────────────────────────────────────────────────────

  async setLibraryEnabled(input: SetLibraryEnabledInput, output: SetLibraryEnabledOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const libRow = await this.relationDb.selectOne('self_learning_library', [
      { field: 'library_id', operator: Operator.EQ, value: input.library_id },
    ]);
    if (!libRow) {
      throw new NotFoundError('资料库', input.library_id);
    }

    const now = IdGenerator.now();
    await this.relationDb.update(
      'self_learning_library',
      [
        { field: 'enable_self_learning', value: input.enabled ? 1 : 0 },
        { field: 'updated', value: now },
      ],
      [{ field: 'library_id', operator: Operator.EQ, value: input.library_id }],
    );

    // 启用时重新扫描目录，刷新文件与层级结构数据
    if (input.enabled) {
      await this.relationDb.delete('self_learning_file', [
        { field: 'library_id', operator: Operator.EQ, value: input.library_id },
      ]);
      const result = await this.scanLibraryDirectory(
        input.library_id,
        String(libRow.library_path ?? ''),
        now,
      );
      output.file_count = result.fileCount;
      output.directory_count = result.dirCount;
    }

    output.enabled = input.enabled;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soLibrary
  // ─────────────────────────────────────────────────────────────────────────

  async soLibrary(input: SearchLibraryInput, output: SearchLibraryOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conditions: Condition[] = [];
    if (input.keyword) {
      conditions.push({ field: 'library_name', operator: Operator.LIKE, value: `%${input.keyword}%` });
    }

    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;

    const countInput = Object.assign(new CountDBInput(), {
      table: 'self_learning_library',
      conditions,
    });
    const countOutput = Object.assign(new CountDBOutput(), {});
    await this.relationDb.countDB(countInput, countOutput, new DBContext());
    const total = countOutput.count;

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'self_learning_library',
        conditions,
        page: { current: pageCurrent, size: pageSize },
        order_by: [{ field: 'created', direction: 'DESC' }],
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, selOutput, new DBContext());

    // ===== 修改后的方法：单次 GROUP BY 查询替代 N+1 count =====
    const libraryIds = selOutput.rows.map(r => r.library_id as string);
    const statsMap = new Map<string, { total_files: number; learned_files: number }>();
    if (libraryIds.length > 0) {
      const placeholders = libraryIds.map(() => '?').join(',');
      const statsRows = this.relationDb.queryRaw<{ library_id: string; total_files: number; learned_files: number }>(
        `SELECT "library_id", COUNT(*) AS "total_files", SUM(CASE WHEN "status" = 'COMPLETED' THEN 1 ELSE 0 END) AS "learned_files" FROM "self_learning_file" WHERE "library_id" IN (${placeholders}) GROUP BY "library_id"`,
        libraryIds,
      );
      for (const s of statsRows) {
        statsMap.set(s.library_id, { total_files: s.total_files, learned_files: s.learned_files });
      }
    }

    const libraries: Array<Record<string, unknown>> = [];
    for (const row of selOutput.rows) {
      const libId = row.library_id as string;
      const stats = statsMap.get(libId) || { total_files: 0, learned_files: 0 };
      libraries.push({
        ...row,
        total_files: stats.total_files,
        learned_files: stats.learned_files,
      });
    }

    output.libraries = libraries;
    output.total = total;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soLibraryFiles
  // ─────────────────────────────────────────────────────────────────────────

  async soLibraryFiles(input: GetLibraryFilesInput, output: GetLibraryFilesOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const baseConds: string[] = ['"library_id" = ?'];
    const baseArgs: unknown[] = [input.library_id];
    if (input.status) {
      baseConds.push('"status" = ?');
      baseArgs.push(input.status);
    }
    if (input.keyword) {
      baseConds.push('"file_name" LIKE ?');
      baseArgs.push(`%${input.keyword}%`);
    }
    // directory 显式传入时才按目录过滤（旧调用不传 directory 时返回该库全部文件）
    if (input.directory !== undefined) {
      baseConds.push('"parent_path" = ?');
      baseArgs.push(input.directory);
    }

    // total：符合条件的总数（不含分页条件）
    const countRows = this.relationDb.queryRaw<{ c: number }>(
      `SELECT COUNT(*) AS "c" FROM "self_learning_file" WHERE ${baseConds.join(' AND ')}`,
      baseArgs,
    );
    output.total = Number(countRows[0]?.c ?? 0);

    const conds = [...baseConds];
    const args = [...baseArgs];
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 500);

    if (input.page_current !== undefined && input.page_size !== undefined) {
      // 旧 offset 分页（兼容既有调用与测试）
      const pageSize = input.page_size;
      const offset = (input.page_current - 1) * pageSize;
      // ===== 修改后：明确列名，排除 error_message 大字段 =====
      const fileColumns = '"id","created","updated","library_id","file_id","file_name","file_path","relative_path","parent_path","is_directory","file_size","status","learned_at"';
      const sql = `SELECT ${fileColumns} FROM "self_learning_file" WHERE ${conds.join(' AND ')} ORDER BY "created" ASC, "file_id" ASC LIMIT ${pageSize} OFFSET ${offset}`;
      output.files = this.relationDb.queryRaw<Record<string, unknown>>(sql, args);
      output.has_more = false;
      output.next_cursor = null;
      return true;
    }

    // 游标分页（id + page_size）：created ASC, file_id ASC，游标格式 created:file_id
    if (input.cursor) {
      const idx = input.cursor.indexOf(':');
      const cCreated = idx > 0 ? Number(input.cursor.slice(0, idx)) : NaN;
      const cId = idx > 0 ? input.cursor.slice(idx + 1) : '';
      if (!isNaN(cCreated)) {
        conds.push('("created" > ? OR ("created" = ? AND "file_id" > ?))');
        args.push(cCreated, cCreated, cId);
      }
    }
    // ===== 修改后：明确列名，排除 error_message 大字段 =====
    const fileColumns = '"id","created","updated","library_id","file_id","file_name","file_path","relative_path","parent_path","is_directory","file_size","status","learned_at"';
    const sql = `SELECT ${fileColumns} FROM "self_learning_file" WHERE ${conds.join(' AND ')} ORDER BY "created" ASC, "file_id" ASC LIMIT ${limit + 1}`;
    const rows = this.relationDb.queryRaw<Record<string, unknown>>(sql, args);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const last = pageRows[pageRows.length - 1];
    output.files = pageRows;
    output.has_more = hasMore;
    output.next_cursor = hasMore && last ? `${last.created}:${last.file_id}` : null;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soLibraryTree
  // ─────────────────────────────────────────────────────────────────────────

  async soLibraryTree(input: GetLibraryTreeInput, output: GetLibraryTreeOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    // ===== 修改后：添加 LIMIT 防止大库全量加载 =====
    const treeLimit = 5000;
    const rows = this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT "file_id", "file_name", "relative_path", "parent_path", "is_directory" FROM "self_learning_file" WHERE "library_id" = ? ORDER BY "is_directory" DESC, "file_name" ASC LIMIT ${treeLimit}`,
      [input.library_id],
    );

    const nodeMap = new Map<string, LibraryTreeNode>();
    for (const row of rows) {
      const relPath = String(row.relative_path ?? '');
      nodeMap.set(relPath, {
        file_id: String(row.file_id ?? ''),
        name: String(row.file_name ?? ''),
        relative_path: relPath,
        is_directory: Number(row.is_directory) === 1,
        children: [],
      });
    }

    const roots: LibraryTreeNode[] = [];
    for (const node of nodeMap.values()) {
      const parentRel = node.relative_path.includes('/')
        ? node.relative_path.slice(0, node.relative_path.lastIndexOf('/'))
        : '';
      const parent = parentRel ? nodeMap.get(parentRel) : undefined;
      if (parent && parent.is_directory) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortChildren = (nodes: LibraryTreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const n of nodes) sortChildren(n.children);
    };
    sortChildren(roots);

    output.tree = roots;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soFileContent
  // ─────────────────────────────────────────────────────────────────────────

  async soFileContent(input: GetFileContentInput, output: GetFileContentOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'self_learning_file',
        conditions: [
          { field: 'file_id', operator: Operator.EQ, value: input.file_id },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

    const file = selOutput.row;
    if (!file) {
      this.logger?.debug?.('soFileContent: file not found', { fileId: input.file_id });
      return false;
    }

    const filePath = file.file_path as string;
    const content = fs.readFileSync(filePath, 'utf-8');

    output.file_name = (file.file_name as string) || '';
    output.content = content;
    output.learned_at = file.learned_at as number | undefined;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // queryDocument（文档内容选中解释）
  // ─────────────────────────────────────────────────────────────────────────

  async queryDocument(input: QueryDocumentInput, output: QueryDocumentOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const selection = (input.selection || input.content || '').trim();
    if (!selection) {
      throw new ValidationError('selection is required');
    }
    const question = (input.question || '').trim();
    const contextBefore = input.context_before || '';
    const contextAfter = input.context_after || '';

    const config = await this.getConfig();
    const templateId = String(config.document_query_prompt_template_id ?? '');
    const configuredLlmId = String(config.document_query_llm_id ?? '');

    // 1. 渲染 Prompt（配置的模板，或内置默认）
    const prompt = await this.renderPrompt(
      templateId,
      PROMPT_IDS.documentQuery,
      {
        selection,
        context_before: contextBefore,
        context_after: contextAfter,
        question,
      },
    );

    // 2. 匹配 LLM（配置的模型，或自动匹配）
    let llmId = configuredLlmId;
    if (!llmId) {
      try {
        const matchOut = new MatchLLMOutput();
        await this.llmCore.matchLLM(
          Object.assign(new MatchLLMInput(), {
            agent_id: 'document_query',
            context_id: 'document_query',
            interact_id: IdGenerator.generate(),
          }),
          matchOut,
          new LLMCoreContext(),
        );
        llmId = matchOut.llm_id || '';
      } catch {
        llmId = '';
      }
    }
    if (!llmId) {
      output.result = '未配置文档阅读模型：请在「配置中心 > 应用配置 > 自学习 > 文档阅读 LLM」中选择模型';
      return true;
    }
    output.llm_id = llmId;

    // 3. 调用 LLM
    try {
      const llmOut = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: llmId,
          prompt,
          temperature: 0.3,
          max_tokens: 1024,
        }),
        llmOut,
        new LLMContext(),
      );
      output.result = llmOut.result || '';
    } catch (err: unknown) {
      output.result = `解释失败：${err instanceof Error ? err.message : String(err)}`;
    }
    return true;
  }

  private buildDefaultDocumentQueryPrompt(
    selection: string,
    contextBefore: string,
    contextAfter: string,
    question: string,
  ): string {
    const tpl = getBuiltinTemplate(PROMPT_IDS.documentQuery);
    return tpl
      ? renderTemplate(tpl, { selection, context_before: contextBefore, context_after: contextAfter, question })
      : '';
  }

  /** 渲染 Prompt：配置模板 → 内置模板 → 内存兜底 */
  private async renderPrompt(
    templateId: string | undefined,
    builtinId: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    const id = templateId || builtinId;
    try {
      const promptOut = new ExecPromptOutput();
      await this.promptsAccess.execPrompt(
        Object.assign(new ExecPromptInput(), { id, variables }),
        promptOut,
        new PromptContext(),
      );
      if (promptOut.prompt) return promptOut.prompt;
    } catch { /* use fallback */ }
    const tpl = getBuiltinTemplate(builtinId);
    return tpl ? renderTemplate(tpl, variables) : '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // saveAnnotation（保存文档咨询卡片）
  // ─────────────────────────────────────────────────────────────────────────

  async saveAnnotation(input: SaveAnnotationInput, output: SaveAnnotationOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const now = IdGenerator.now();
    const id = IdGenerator.generate();
    await this.relationDb.insert('document_annotation', [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'library_id', value: input.library_id || '' },
      { field: 'file_id', value: input.file_id },
      { field: 'selection_text', value: input.selection_text },
      { field: 'selection_start', value: input.selection_start },
      { field: 'selection_end', value: input.selection_end },
      { field: 'question', value: input.question },
      { field: 'result', value: input.result },
      { field: 'llm_id', value: input.llm_id || '' },
    ]);
    output.id = id;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soFileAnnotations（查询文件的咨询卡片）
  // ─────────────────────────────────────────────────────────────────────────

  async soFileAnnotations(input: GetFileAnnotationsInput, output: GetFileAnnotationsOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = this.relationDb.queryRaw<Record<string, unknown>>(
      `SELECT "id", "file_id", "selection_text", "selection_start", "selection_end", "question", "result", "llm_id", "created" FROM "document_annotation" WHERE "file_id" = ? ORDER BY "created" ASC`,
      [input.file_id],
    );
    output.annotations = rows;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // startLearning
  // ─────────────────────────────────────────────────────────────────────────

  async startLearning(input: StartLearningInput, _output: StartLearningOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const learningRate = input.learning_rate ?? (config.learning_rate as number) ?? 5;
    const interval = (config.learning_interval_ms as number) ?? 600000;
    const mode = input.learning_mode ?? 'ALL';

    // 手动触发任务化：注册任务 → 后台执行（fire-and-forget）→ 任务列表可见（running→completed/failed）
    if (!mode || mode === 'ALL' || mode.includes('DOCUMENT')) {
      const taskId = this.registerLearningTask('DOCUMENT', '从文档学习');
      void this.startDocumentLearning(input.library_id, learningRate, interval)
        .then(() => this.finishLearningTask(taskId))
        .catch((err: unknown) => this.finishLearningTask(taskId, err instanceof Error ? err.message : String(err)));
    }
    if (mode === 'ALL' || mode.includes('CONVERSATION')) {
      const taskId = this.registerLearningTask('CONVERSATION', '从对话学习');
      void this.startConversationLearning()
        .then(() => this.finishLearningTask(taskId))
        .catch((err: unknown) => this.finishLearningTask(taskId, err instanceof Error ? err.message : String(err)));
    }
    if (mode === 'ALL' || mode.includes('TAG_MAINTENANCE')) {
      const taskId = this.registerLearningTask('TAG_MAINTENANCE', 'Tag图维护');
      void this.startTagMaintenanceGuarded(config)
        .then(() => this.finishLearningTask(taskId))
        .catch((err: unknown) => this.finishLearningTask(taskId, err instanceof Error ? err.message : String(err)));
    }

    if (mode === 'ALL' || mode === 'RANDOM') {
      this.startRandomTriggerLearning(config);
    }

    return true;
  }

  private startRandomTriggerLearning(config: Record<string, unknown>): void {
    if (this.randomLearningTimer) {
      clearInterval(this.randomLearningTimer);
      this.randomLearningTimer = null;
    }

    const learningIntervalMs = (config.learning_interval_ms as number) ?? 600000;
    let tickRunning = false;

    const tick = async () => {
      if (tickRunning) return;
      tickRunning = true;
      try {
        const hasRecentActivity = await this.checkUserRecentActivity(5 * 60 * 1000);
        if (hasRecentActivity) return;

        // 每次 tick 读取最新配置，各模式独立按自己的随机因子与自动开关决定是否触发
        const fresh = await this.getConfig();
        const rate = (fresh.default_learning_rate as number) ?? 5;

        if (Number(fresh.document_auto_enable) !== 0) {
          const rf = (fresh.document_random_factor as number) ?? 10;
          if (Math.floor(Math.random() * 101) < rf) {
            await this.startDocumentLearning(undefined, rate, learningIntervalMs);
          }
        }
        if (Number(fresh.conversation_auto_enable) !== 0) {
          const rf = (fresh.conversation_random_factor as number) ?? 10;
          if (Math.floor(Math.random() * 101) < rf) {
            await this.startConversationLearning();
          }
        }
        if (Number(fresh.tag_auto_enable) !== 0) {
          const rf = (fresh.tag_random_factor as number) ?? 10;
          if (Math.floor(Math.random() * 101) < rf) {
            await this.startTagMaintenance(fresh);
          }
        }
      } catch (err: unknown) {
        this.logger?.error?.('Random trigger learning error', { error: err instanceof Error ? err.message : String(err) });
      } finally {
        tickRunning = false;
      }
    };

    tick();
    this.randomLearningTimer = setInterval(tick, learningIntervalMs);
  }

  private async checkUserRecentActivity(thresholdMs: number): Promise<boolean> {
    try {
      const threshold = Date.now() - thresholdMs;
      const countInput = Object.assign(new CountDBInput(), {
        table: 'info_raw',
        conditions: [
          { field: 'info_type', operator: Operator.EQ, value: InfoType.REQUEST },
          { field: 'created', operator: Operator.GE, value: threshold },
        ] as Condition[],
      });
      const countOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(countInput, countOutput, new DBContext());
      return countOutput.count > 0;
    } catch {
      return false;
    }
  }

  private async startDocumentLearning(
    libraryId: string | undefined,
    learningRate: number,
    _interval: number,
  ): Promise<void> {
    if (this.documentLearningTimer) {
      clearInterval(this.documentLearningTimer);
      this.documentLearningTimer = null;
    }

    let docTickRunning = false;
    const tick = async () => {
      if (docTickRunning) return;
      docTickRunning = true;
      try {
        const libraryConditions: Condition[] = [
          { field: 'enable_self_learning', operator: Operator.EQ, value: 1 },
        ];
        if (libraryId) {
          libraryConditions.push({ field: 'library_id', operator: Operator.EQ, value: libraryId });
        }

        const libSel = Object.assign(new SelectDBInput(), {
          query_param: { table: 'self_learning_library', conditions: libraryConditions },
        });
        const libOut = Object.assign(new SelectDBOutput(), {});
        await this.relationDb.selectDB(libSel, libOut, new DBContext());

        for (const lib of libOut.rows) {
          const lid = lib.library_id as string;
          const libRate = (lib.learning_rate as number) ?? learningRate;

          const fileConditions: Condition[] = [
            { field: 'library_id', operator: Operator.EQ, value: lid },
            { field: 'status', operator: Operator.EQ, value: 'PENDING' },
          ];
          const fileSel = Object.assign(new SelectDBInput(), {
            query_param: {
              table: 'self_learning_file',
              conditions: fileConditions,
              order_by: [{ field: 'created', direction: 'ASC' }],
              page: { current: 1, size: libRate },
            },
          });
          const fileOut = Object.assign(new SelectDBOutput(), {});
          await this.relationDb.selectDB(fileSel, fileOut, new DBContext());

          for (const file of fileOut.rows) {
            await this.handleDocumentLearning(file);
          }
        }
      } catch (err: unknown) {
        this.logger?.error?.('Document learning tick error', { error: err instanceof Error ? err.message : String(err) });
      } finally {
        docTickRunning = false;
      }
    };

    await tick();
    this.documentLearningTimer = setInterval(tick, 60000);
  }

  private async startConversationLearning(): Promise<void> {
    if (this.evalScheduleRunning) return;
    const scheduleInput = Object.assign(new StartEvalScheduleInput(), {});
    const scheduleOutput = Object.assign(new StartEvalScheduleOutput(), {});
    await this.evolutorAgent.startEvalSchedule(scheduleInput, scheduleOutput, new EvolutorAgentContext());
    this.evalScheduleRunning = true;
  }

  /** Tag 维护守护壳：防重入，维护异常不外溢 */
  private async startTagMaintenanceGuarded(config: Record<string, unknown>): Promise<void> {
    if (this.tagMaintenanceRunning) return;
    this.tagMaintenanceRunning = true;
    try {
      await this.startTagMaintenance(config);
    } catch (err: unknown) {
      this.logger?.error?.('Tag maintenance error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.tagMaintenanceRunning = false;
    }
  }

  private async startTagMaintenance(config: Record<string, unknown>): Promise<void> {
    const tagConnMs = (config.tag_connection_check_interval_ms as number) ?? 1800000;

    this.clearTagTimers();

    this.tagConnectionTimer = setInterval(() => {
      this.startTagConnectionEstablishment().catch((err) => {
        this.logger?.error?.('Tag connection establishment error', { error: err instanceof Error ? err.message : String(err) });
      });
    }, tagConnMs);

    this.tagEstablishTimer = setInterval(() => {
      this.startTagActivation().catch((err) => {
        this.logger?.error?.('Tag activation error', { error: err instanceof Error ? err.message : String(err) });
      });
    }, tagConnMs);

    // 标签老化与孤立标签检查已改为 CronProvider 定时调度（cron_task：tag_aging / orphan_tag_check），
    // 不再使用硬编码 24 小时间隔定时器。

    await this.startTagConnectionEstablishment();
    await this.startTagActivation();
  }

  private clearTagTimers(): void {
    if (this.tagConnectionTimer) { clearInterval(this.tagConnectionTimer); this.tagConnectionTimer = null; }
    if (this.tagEstablishTimer) { clearInterval(this.tagEstablishTimer); this.tagEstablishTimer = null; }
    if (this.tagAgingTimer) { clearInterval(this.tagAgingTimer); this.tagAgingTimer = null; }
    if (this.orphanTagTimer) { clearInterval(this.orphanTagTimer); this.orphanTagTimer = null; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // stopLearning
  // ─────────────────────────────────────────────────────────────────────────

  async stopLearning(input: StopLearningInput, _output: StopLearningOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const mode = input.learning_mode ?? 'ALL';

    if (mode === 'ALL' || mode.includes('DOCUMENT')) {
      if (this.documentLearningTimer) {
        clearInterval(this.documentLearningTimer);
        this.documentLearningTimer = null;
      }
    }

    if (mode === 'ALL' || mode === 'RANDOM') {
      if (this.randomLearningTimer) {
        clearInterval(this.randomLearningTimer);
        this.randomLearningTimer = null;
      }
    }

    if (mode === 'ALL' || mode.includes('CONVERSATION')) {
      if (this.evalScheduleRunning) {
        const stopInput = Object.assign(new StopEvalScheduleInput(), {});
        const stopOutput = Object.assign(new StopEvalScheduleOutput(), {});
        await this.evolutorAgent.stopEvalSchedule(stopInput, stopOutput, new EvolutorAgentContext());
        this.evalScheduleRunning = false;
      }
    }

    if (mode === 'ALL' || mode.includes('TAG_MAINTENANCE')) {
      this.clearTagTimers();
    }

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // handleDocumentLearning (private)
  // ─────────────────────────────────────────────────────────────────────────

  private async handleDocumentLearning(file: Record<string, unknown>): Promise<void> {
    const fileId = file.file_id as string;
    const fileName = file.file_name as string;
    const filePath = file.file_path as string;

    try {
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch (err: unknown) {
        await this.updateFileStatus(fileId, 'FAILED', `Cannot read file: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      await this.ensureSelfLearningSession();

      const config = await this.getConfig();
      const splitThreshold = (config.document_split_threshold as number) ?? 5000;
      const overlapRatio = (config.chunk_overlap_ratio as number) ?? 0.2;

      let chunks: string[];
      if (content.length > splitThreshold) {
        const chunkOutput = new ChunkTextOutput();
        await this.chunkAccess.chunkText(
          Object.assign(new ChunkTextInput(), {
            content,
            config: { windowSize: splitThreshold, overlapRatio },
          }),
          chunkOutput,
          new ChunkContext(),
        );
        chunks = chunkOutput.chunks.map(c => c.content);
      } else {
        chunks = [content];
      }

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed) continue;

        // LLM 抽取知识点（从文档学习）：产出 KNOWLEDGE 记录 → 学习页「知识」列表可见
        const extracted = await this.extractKnowledgeFromChunk(trimmed, fileName);
        for (const point of extracted) {
          await this.insertLearningResult('KNOWLEDGE', 'DOCUMENT', point.content, point.tags ?? null);
        }
        if (extracted.length === 0) {
          // LLM 抽取失败时兜底：将 chunk 原文记录为知识条目，保证触发有可见产出
          await this.insertLearningResult('KNOWLEDGE', 'DOCUMENT', trimmed.slice(0, 2000), null);
        }
      }

      await this.updateFileStatus(fileId, 'COMPLETED', null);
      await this.insertLearningResult('DOCUMENT', fileName, content, null);
      this.logger?.debug?.('handleDocumentLearning done', { fileId, fileName });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger?.error?.('handleDocumentLearning error', { fileId, error: errorMsg });
      await this.updateFileStatus(fileId, 'FAILED', errorMsg);
    }
  }

  private async ensureSelfLearningSession(): Promise<string> {
    const sessionId = 'self_learning_session';

    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'chat_session',
        conditions: [
          { field: 'session_id', operator: Operator.EQ, value: sessionId },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

    if (!selOutput.row) {
      const now = IdGenerator.now();
      await this.relationDb.insert('chat_session', [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'session_id', value: sessionId },
        { field: 'session_title', value: 'Self Learning' },
      ]);
    }

    return sessionId;
  }

  private splitByHeaders(content: string): string[] {
    const lines = content.split('\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ') || trimmed.startsWith('## ') || trimmed === '#' || trimmed === '##') {
        if (currentChunk.trim()) {
          chunks.push(currentChunk);
        }
        currentChunk = line + '\n';
      } else if (!trimmed.startsWith('#') && trimmed.match(/^#{1,2}\s/)) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk);
        }
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk);
    }
    return chunks;
  }

  private splitBySize(content: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.substring(i, i + chunkSize));
    }
    return chunks;
  }

  private async updateFileStatus(fileId: string, status: string, errorMessage: string | null): Promise<void> {
    const now = IdGenerator.now();
    const data: DataObject[] = [
      { field: 'updated', value: now },
      { field: 'status', value: status },
    ];
    if (status === 'COMPLETED') {
      data.push({ field: 'learned_at', value: now });
    }
    if (errorMessage !== null) {
      data.push({ field: 'error_message', value: errorMessage });
    }
    const updInput = Object.assign(new UpdateDBInput(), {
      table: 'self_learning_file',
      data,
      conditions: [
        { field: 'file_id', operator: Operator.EQ, value: fileId },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
  }

  /**
   * LLM 抽取文档 chunk 中的知识点（从文档学习的核心步骤）。
   * 返回 {content, tags?} 列表；LLM 失败或解析失败返回空数组（调用方兜底记录原文）。
   */
  private async extractKnowledgeFromChunk(chunk: string, fileName: string): Promise<Array<{ content: string; tags?: string[] | null }>> {
    if (!this.llmAccess) return [];
    const prompt = [
      '从以下文档片段中抽取 1-5 条知识点，输出 JSON 数组，每条形如 {"content": "知识点描述（60字内）", "tags": ["标签1", "标签2"]。',
      '只输出 JSON 数组，不要任何其他文本。',
      `来源文件：${fileName}`,
      '文档片段：',
      chunk.slice(0, 3000),
    ].join('\n');
    try {
      const parsed = await callLLMJson<Array<{ content?: string; tags?: string[] }>>(this.llmAccess, {
        prompt,
        llmId: '',
        parse: (text) => {
          try {
            const j = JSON.parse(text);
            return Array.isArray(j) ? j : null;
          } catch {
            return null;
          }
        },
        retries: 1,
      });
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((p) => p && typeof p.content === 'string' && p.content.trim())
        .map((p) => ({ content: p.content!.trim().slice(0, 300), tags: Array.isArray(p.tags) ? p.tags : null }));
    } catch {
      return [];
    }
  }

  private async insertLearningResult(
    type: string,
    source: string,
    content: string,
    tags: string[] | null,
  ): Promise<void> {
    const now = IdGenerator.now();
    const resultId = IdGenerator.generate();
    await this.relationDb.insert('self_learning_result', [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'result_id', value: resultId },
      { field: 'type', value: type },
      { field: 'source', value: source },
      { field: 'content', value: content },
      { field: 'summary', value: content.substring(0, 200) },
      { field: 'learned_at', value: now },
    ]);

    if (tags && tags.length > 0) {
      for (const tag of tags) {
        await this.relationDb.insert('self_learning_result_tag', [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'result_id', value: resultId },
          { field: 'tag', value: tag },
        ]);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // startTagConnectionEstablishment
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 标签图全量维护的分批让出：RelationDB(better-sqlite3) 与 TinyGraphDB(leveldb)
   * 均为同步驱动，逐标签建图/激活边是 O(标签数×邻居) 的纯 CPU 计算，
   * 不让出事件循环会冻结全部 HTTP 请求数分钟（页面表现为"切几个页面就卡死"）。
   */
  private static readonly TAG_MAINTENANCE_BATCH = 20;
  /** 标签维护重入守卫：启动 / 30min timer / 随机 tick 三路都可能触发全量计算，禁止叠加执行 */
  private tagMaintenanceRunning = false;
  /** 全局图统计缓存（60s TTL；避免每次统计全量扫描图数据库） */
  private graphStatsCache: { at: number; data: Record<string, unknown> } | null = null;
  private graphStatsComputing = false;

  private async yieldToEventLoop(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
  }

  async startTagConnectionEstablishment(): Promise<void> {
    if (this.tagMaintenanceRunning) return;
    this.tagMaintenanceRunning = true;
    try {
      const now = IdGenerator.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

      const selOutput = Object.assign(new SelectDBOutput(), {});
      await this.relationDb.selectDB(
        Object.assign(new SelectDBInput(), {
          query_param: {
            table: 'info_tag',
            conditions: [
              { field: 'created', operator: Operator.GE, value: twentyFourHoursAgo },
            ] as Condition[],
          },
        }),
        selOutput,
        new DBContext(),
      );

      let count = 0;
      for (const row of selOutput.rows) {
        const tagId = row.id as string;
        const tagName = row.tag as string;
        if (!tagId || !tagName) continue;
        try {
          const graphInput = Object.assign(new GraphTagInput(), { tag_id: tagId });
          const graphOutput = Object.assign(new GraphTagOutput(), {});
          await this.infoCore.graphTag(graphInput, graphOutput, new InfoCoreContext());
          count++;
        } catch {
          // skip failed graph tags
        }
        if (count % SelfLearningService.TAG_MAINTENANCE_BATCH === 0) {
          await this.yieldToEventLoop();
        }
      }

      if (count > 0) {
        await this.insertLearningResult('TAG_MAINTENANCE', 'TAG_MAINTENANCE', `Connected ${count} recent tags to graph`, null);
      }
    } catch (err: unknown) {
      this.logger?.error?.('startTagConnectionEstablishment error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.tagMaintenanceRunning = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // startTagActivation
  // ─────────────────────────────────────────────────────────────────────────

  async startTagActivation(): Promise<void> {
    if (this.tagMaintenanceRunning) return;
    this.tagMaintenanceRunning = true;
    try {
      const now = IdGenerator.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

      const selOutput = Object.assign(new SelectDBOutput(), {});
      await this.relationDb.selectDB(
        Object.assign(new SelectDBInput(), {
          query_param: {
            table: 'info_tag',
            conditions: [
              { field: 'created', operator: Operator.GE, value: twentyFourHoursAgo },
            ] as Condition[],
          },
        }),
        selOutput,
        new DBContext(),
      );

      const activeTags: Record<string, string> = {};
      for (const row of selOutput.rows) {
        const tagName = row.tag as string;
        if (tagName) activeTags[tagName] = row.id as string;
      }

      const graphSelOutput = Object.assign(new SelectGraphOutput(), {});
      await this.graphDBAccess.selectGraph(
        Object.assign(new SelectGraphInput(), {
          target: GraphTarget.NODE,
          node_type: 'Tag',
        }),
        graphSelOutput,
        new GraphContext(),
      );

      let activatedCount = 0;
      let scannedNodes = 0;
      for (const node of graphSelOutput.list) {
        if (!('node_type' in node)) continue;
        const content = (node as any).content as Record<string, unknown> | undefined;
        if (!content) continue;

        const neighbors = Object.assign(new GetGraphNeighborsOutput(), {});
        const neighborInput = Object.assign(new GetGraphNeighborsInput(), {
          node_id: node.id,
          direction: GraphDirection.OUT,
          edge_type: 'similarTo',
          only_active: false,
        });
        await this.graphDBAccess.soGraphNeighbors(neighborInput, neighbors, new GraphContext());

        for (const edgeRow of neighbors.list) {
          try {
            const edge = (edgeRow as any);
            const edgeId = edge.id as string | undefined;
            if (!edgeId) continue;
            await this.graphDBAccess.activateGraphEdge(
              Object.assign(new ActivateGraphEdgeInput(), {
                edge_id: edgeId,
                trigger_type: 'tag_maintenance',
              }),
              Object.assign(new ActivateGraphEdgeOutput(), {}),
              new GraphContext(),
            );
            activatedCount++;
          } catch {
            // skip
          }
        }
        scannedNodes++;
        if (scannedNodes % SelfLearningService.TAG_MAINTENANCE_BATCH === 0) {
          await this.yieldToEventLoop();
        }
      }

      if (activatedCount > 0) {
        await this.insertLearningResult('TAG_MAINTENANCE', 'TAG_MAINTENANCE', `Activated ${activatedCount} graph edges`, null);
      }
    } catch (err: unknown) {
      this.logger?.error?.('startTagActivation error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.tagMaintenanceRunning = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // startTagAging
  // ─────────────────────────────────────────────────────────────────────────

  async startTagAging(): Promise<void> {
    try {
      const ageInput = Object.assign(new AgeGraphEdgeInput(), {});
      const ageOutput = Object.assign(new AgeGraphEdgeOutput(), {});
      await this.graphDBAccess.ageGraphEdge(ageInput, ageOutput, new GraphContext());

      if (ageOutput.aged_count > 0) {
        await this.insertLearningResult('TAG_MAINTENANCE', 'TAG_MAINTENANCE', `Aged ${ageOutput.aged_count} graph edges`, null);
      }
    } catch (err: unknown) {
      this.logger?.error?.('startTagAging error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // startOrphanTagCheck
  // ─────────────────────────────────────────────────────────────────────────

  async startOrphanTagCheck(): Promise<void> {
    try {
      const graphSelOutput = Object.assign(new SelectGraphOutput(), {});
      await this.graphDBAccess.selectGraph(
        Object.assign(new SelectGraphInput(), {
          target: GraphTarget.NODE,
          node_type: 'Tag',
        }),
        graphSelOutput,
        new GraphContext(),
      );

      let orphanCount = 0;
      for (const node of graphSelOutput.list) {
        if (!('node_type' in node)) continue;
        const neighbors = Object.assign(new GetGraphNeighborsOutput(), {});
        const neighborInput = Object.assign(new GetGraphNeighborsInput(), {
          node_id: node.id,
          direction: GraphDirection.BOTH,
        });
        await this.graphDBAccess.soGraphNeighbors(neighborInput, neighbors, new GraphContext());

        if (neighbors.list.length === 0) {
          try {
            const content = (node as any).content as Record<string, unknown> | undefined;
            const tagName = content?.tag as string | undefined;
            if (tagName) {
              const graphTagInput = Object.assign(new GraphTagInput(), { tag_id: node.id });
              const graphTagOutput = Object.assign(new GraphTagOutput(), {});
              await this.infoCore.graphTag(graphTagInput, graphTagOutput, new InfoCoreContext());
              orphanCount++;
            }
          } catch {
            // skip
          }
        }
      }

      if (orphanCount > 0) {
        await this.insertLearningResult('TAG_MAINTENANCE', 'TAG_MAINTENANCE', `Reconnected ${orphanCount} orphan tags`, null);
      }
    } catch (err: unknown) {
      this.logger?.error?.('startOrphanTagCheck error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soTagGraph
  // ─────────────────────────────────────────────────────────────────────────

  async soTagGraph(input: GetTagGraphInput, output: GetTagGraphOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const graphSelOutput = Object.assign(new SelectGraphOutput(), {});
    await this.graphDBAccess.selectGraph(
      Object.assign(new SelectGraphInput(), {
        target: GraphTarget.NODE,
        node_type: 'Tag',
      }),
      graphSelOutput,
      new GraphContext(),
    );

    const onlyActive = input.only_active ?? true;
    const minWeight = input.min_weight ?? 0;
    const limit = input.limit ?? 500;

    const tagNodeMap = new Map<string, { tag_id: string; tag_name: string; info_count: number; created: number }>();
    const tagActivationMap = new Map<string, number>();
    const edgeList: Array<Record<string, unknown>> = [];
    const edgeKeySet = new Set<string>();

    for (const node of graphSelOutput.list) {
      if (!('node_type' in node)) continue;
      const nid = node.id;
      const content = (node as any).content as Record<string, unknown> | undefined;
      const tagName = (content?.tag as string) || (content?.tag_name as string) || '';

      let infoCount = 0;
      if (tagName) {
        infoCount = await this.relationDb.count('info_tag', [
          { field: 'tag', operator: Operator.EQ, value: tagName },
        ]);
      }

      const createdTime = (node.created as number) || 0;
      tagNodeMap.set(nid, {
        tag_id: nid,
        tag_name: tagName,
        info_count: infoCount,
        created: createdTime,
      });

      const neighbors = Object.assign(new GetGraphNeighborsOutput(), {});
      const neighborInput = Object.assign(new GetGraphNeighborsInput(), {
        node_id: nid,
        direction: GraphDirection.BOTH,
      });
      await this.graphDBAccess.soGraphNeighbors(neighborInput, neighbors, new GraphContext());

      for (const n of neighbors.list) {
        if (!('node_type' in n)) continue;
        const nEdge = (n as any);
        const edgeId = (nEdge.id as string) || (nEdge.edge_id as string) || '';
        const fromId = (nEdge.from_node_id as string) || '';
        const toId = (nEdge.to_node_id as string) || '';
        const edgeType = (nEdge.edge_type as string) || 'similarTo';
        const weight = (nEdge.weight as number) || 0;
        const similarity = (nEdge.similarity as number) || weight;
        const isActive = (nEdge.is_active as boolean) || (nEdge.is_active as number) === 1;
        const lastActivation = (nEdge.last_activation_time as number) || 0;

        const edgeKey = `${fromId}_${toId}_${edgeType}`;
        if (edgeKeySet.has(edgeKey)) continue;
        edgeKeySet.add(edgeKey);

        if (isActive || !onlyActive) {
          const activationCount = (nEdge.activation_count as number) || 0;
          tagActivationMap.set(
            fromId,
            (tagActivationMap.get(fromId) || 0) + activationCount,
          );
          tagActivationMap.set(
            toId,
            (tagActivationMap.get(toId) || 0) + activationCount,
          );
        }

        edgeList.push({
          edge_id: edgeId,
          from_tag_id: fromId,
          to_tag_id: toId,
          edge_type: edgeType,
          weight,
          similarity,
          is_active: isActive,
          last_activation_time: lastActivation,
        });
      }
    }

    const maxActivation = Math.max(1, ...Array.from(tagActivationMap.values(), (v) => v || 0));

    const nodes: Array<Record<string, unknown>> = [];
    for (const [nid, info] of tagNodeMap) {
      const activationCount = tagActivationMap.get(nid) || 0;
      const nodeSize = Math.round((0.3 + 0.7 * (Math.log(activationCount + 1) / Math.log(maxActivation + 1))) * 100) / 100;
      nodes.push({
        tag_id: nid,
        tag_name: info.tag_name,
        activation_count: activationCount,
        node_size: nodeSize,
        info_count: info.info_count,
        created: info.created,
      });
    }

    let filteredNodes = nodes;
    let filteredEdges = edgeList;

    if (onlyActive) {
      filteredEdges = edgeList.filter((e) => e.is_active === true);
      const activeTagIds = new Set<string>();
      for (const e of filteredEdges) {
        activeTagIds.add(e.from_tag_id as string);
        activeTagIds.add(e.to_tag_id as string);
      }
      filteredNodes = nodes.filter((n) => activeTagIds.has(n.tag_id as string));
    }

    if (minWeight > 0) {
      filteredEdges = filteredEdges.filter((e) => (e.weight as number) >= minWeight);
      const weightedTagIds = new Set<string>();
      for (const e of filteredEdges) {
        weightedTagIds.add(e.from_tag_id as string);
        weightedTagIds.add(e.to_tag_id as string);
      }
      filteredNodes = filteredNodes.filter((n) => weightedTagIds.has(n.tag_id as string));
    }

    let orphanCount = 0;
    for (const n of filteredNodes) {
      const hasEdge = filteredEdges.some(
        (e) => e.from_tag_id === n.tag_id || e.to_tag_id === n.tag_id,
      );
      if (!hasEdge) orphanCount++;
    }

    if (limit > 0 && filteredNodes.length > limit) {
      filteredNodes.sort((a, b) => (b.activation_count as number) - (a.activation_count as number));
      filteredNodes = filteredNodes.slice(0, limit);
      const limitedTagIds = new Set(filteredNodes.map((n) => n.tag_id as string));
      filteredEdges = filteredEdges.filter(
        (e) => limitedTagIds.has(e.from_tag_id as string) || limitedTagIds.has(e.to_tag_id as string),
      );
    }

    output.nodes = filteredNodes;
    output.edges = filteredEdges;
    output.metadata = {
      total_nodes: tagNodeMap.size,
      total_edges: edgeList.length,
      active_edges: edgeList.filter((e) => e.is_active === true).length,
      orphan_nodes: orphanCount,
    };
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soTagRelatedInfo
  // ─────────────────────────────────────────────────────────────────────────

  async soTagRelatedInfo(input: GetTagRelatedInfoInput, output: GetTagRelatedInfoOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;

    const tagRow = Object.assign(new SelectOneDBOutput(), {});
    const tagSel = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'info_tag',
        conditions: [
          { field: 'id', operator: Operator.EQ, value: input.tag_id },
        ] as Condition[],
      },
    });
    await this.relationDb.selectOneDB(tagSel, tagRow, new DBContext());

    let tagName: string | undefined;
    if (tagRow.row) {
      tagName = tagRow.row.tag as string | undefined;
    }

    const lastNInput = Object.assign(new LastNInfoInput(), {
      lastN: pageSize,
    });
    const lastNOutput = Object.assign(new LastNInfoOutput(), {});
    await this.infoCore.lastNInfo(lastNInput, lastNOutput, new InfoCoreContext());

    const infos: Array<Record<string, unknown>> = [];
    if (tagName) {
      const infoTagRows = Object.assign(new SelectDBOutput(), {});
      await this.relationDb.selectDB(
        Object.assign(new SelectDBInput(), {
          query_param: {
            table: 'info_tag',
            conditions: [
              { field: 'tag', operator: Operator.EQ, value: tagName },
            ] as Condition[],
            page: { current: pageCurrent, size: pageSize },
          },
        }),
        infoTagRows,
        new DBContext(),
      );

      for (const row of infoTagRows.rows) {
        const infoId = row.info_id as string;
        if (!infoId) continue;
        const summaryRow = Object.assign(new SelectOneDBOutput(), {});
        await this.relationDb.selectOneDB(
          Object.assign(new SelectOneDBInput(), {
            query_param: {
              table: 'info_summary',
              conditions: [
                { field: 'info_id', operator: Operator.EQ, value: infoId },
              ] as Condition[],
            },
          }),
          summaryRow,
          new DBContext(),
        );

        infos.push({
          info_id: infoId,
          tag: tagName,
          summary: summaryRow.row ? (summaryRow.row.summary as string) || '' : '',
          created: row.created,
        });
      }
    }

    const total = tagName
      ? await this.relationDb.count('info_tag', [
        { field: 'tag', operator: Operator.EQ, value: tagName },
      ])
      : 0;

    output.infos = infos;
    output.total = total;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soLearningProgress
  // ─────────────────────────────────────────────────────────────────────────

  async soLearningProgress(input: GetLearningProgressInput, output: GetLearningProgressOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const sourceCond = input.source
      ? [{ field: 'task_type', operator: Operator.EQ, value: input.source }] as Condition[]
      : [];
    const runningSel = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(
      Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'self_learning_task',
          conditions: [
            ...sourceCond,
            { field: 'status', operator: Operator.EQ, value: 'RUNNING' },
          ] as Condition[],
        },
      }),
      runningSel,
      new DBContext(),
    );
    output.current_task = runningSel.row;

    const pendingSel = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(
      Object.assign(new SelectDBInput(), {
        query_param: {
          table: 'self_learning_task',
          conditions: [
            ...sourceCond,
            { field: 'status', operator: Operator.EQ, value: 'PENDING' },
          ] as Condition[],
          order_by: [{ field: 'created', direction: 'ASC' }],
        },
      }),
      pendingSel,
      new DBContext(),
    );
    output.task_queue = pendingSel.rows;

    const builtinSel = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(
      Object.assign(new SelectDBInput(), {
        query_param: {
          table: 'self_learning_builtin_task',
        },
      }),
      builtinSel,
      new DBContext(),
    );
    output.builtin_tasks = builtinSel.rows;

    output.running = this.isLearningRunning();

    return true;
  }

  /** 手动学习是否正在运行（文档/对话评估/Tag 维护 Worker 处于活动状态，不含自动随机触发） */
  private isLearningRunning(): boolean {
    return !!(
      this.documentLearningTimer ||
      this.evalScheduleRunning ||
      this.tagConnectionTimer ||
      this.tagEstablishTimer ||
      this.tagAgingTimer ||
      this.orphanTagTimer
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soLearningResults
  // ─────────────────────────────────────────────────────────────────────────

  async soLearningResults(input: GetLearningResultsInput, output: GetLearningResultsOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conditions: Condition[] = [];
    if (input.type) {
      conditions.push({ field: 'type', operator: Operator.EQ, value: input.type });
    }
    if (input.source) {
      conditions.push({ field: 'source', operator: Operator.EQ, value: input.source });
    }

    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;

    const countInput = Object.assign(new CountDBInput(), {
      table: 'self_learning_result',
      conditions,
    });
    const countOutput = Object.assign(new CountDBOutput(), {});
    await this.relationDb.countDB(countInput, countOutput, new DBContext());

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'self_learning_result',
        conditions,
        page: { current: pageCurrent, size: pageSize },
        order_by: [{ field: 'learned_at', direction: 'DESC' }],
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, selOutput, new DBContext());

    const results: Array<Record<string, unknown>> = [];
    const resultIds = selOutput.rows.map(r => r.result_id as string).filter(Boolean);
    const tagMap = new Map<string, string[]>();
    if (resultIds.length > 0) {
      const placeholders = resultIds.map(() => '?').join(',');
      const tagRows = this.relationDb.queryRaw<{ result_id: string; tag: string }>(
        `SELECT "result_id", "tag" FROM "self_learning_result_tag" WHERE "result_id" IN (${placeholders})`,
        resultIds,
      );
      for (const tr of tagRows) {
        const list = tagMap.get(tr.result_id) || [];
        list.push(tr.tag);
        tagMap.set(tr.result_id, list);
      }
    }
    for (const row of selOutput.rows) {
      const resultId = row.result_id as string | undefined;
      const tags = resultId ? (tagMap.get(resultId) || []) : [];
      results.push({ ...row, tags });
    }

    output.results = results;
    output.total = countOutput.count;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // soLearningStats
  // ─────────────────────────────────────────────────────────────────────────

  /** 学习任务注册表（实例内存；手动触发的后台任务可视化） */
  private readonly learningTasks = new Map<string, LearningTaskRecord>();
  private learningTaskOrder: string[] = [];

  /** 注册学习任务（数据处理） */
  private registerLearningTask(mode: LearningTaskRecord['mode'], label: string): string {
    const taskId = IdGenerator.generate();
    this.learningTasks.set(taskId, {
      task_id: taskId, mode, label, status: LearningTaskStatus.Running, started_at: Date.now(),
    });
    this.learningTaskOrder.unshift(taskId);
    if (this.learningTaskOrder.length > 50) {
      for (const old of this.learningTaskOrder.splice(50)) this.learningTasks.delete(old);
    }
    return taskId;
  }

  /** 完成学习任务（数据处理；error 非空即失败） */
  private finishLearningTask(taskId: string, error?: string): void {
    const t = this.learningTasks.get(taskId);
    if (!t || t.status !== LearningTaskStatus.Running) return;
    t.status = error ? LearningTaskStatus.Failed : LearningTaskStatus.Completed;
    t.finished_at = Date.now();
    t.error = error;
  }

  /** 查询学习任务列表（逻辑控制；running 优先，其余按开始时间倒序） */
  async soLearningTasks(input: ListLearningTasksInput, output: ListLearningTasksOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const limit = input.limit ?? 20;
    const rank = (t: LearningTaskRecord) => (t.status === LearningTaskStatus.Running ? 0 : 1);
    output.tasks = this.learningTaskOrder
      .map((id) => this.learningTasks.get(id))
      .filter((t): t is LearningTaskRecord => !!t)
      .sort((a, b) => rank(a) - rank(b) || b.started_at - a.started_at)
      .slice(0, input.limit ?? 20);
    return true;
  }

  async soLearningStats(input: GetLearningStatsInput, output: GetLearningStatsOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const now = IdGenerator.now();
    const sourceConds = input.source
      ? [{ field: 'source', operator: Operator.EQ, value: input.source }] as Condition[]
      : [];

    const totalResults = await this.relationDb.count('self_learning_result', sourceConds);
    const totalKnowledgeCount = await this.relationDb.count('self_learning_result', [
      ...sourceConds,
      { field: 'type', operator: Operator.EQ, value: 'KNOWLEDGE' },
    ]);
    const totalInsightCount = await this.relationDb.count('self_learning_result', [
      ...sourceConds,
      { field: 'type', operator: Operator.EQ, value: 'INSIGHT' },
    ]);
    const thisWeekStart = now - 7 * 24 * 60 * 60 * 1000;
    const thisWeekLearningCount = await this.relationDb.count('self_learning_result', [
      ...sourceConds,
      { field: 'learned_at', operator: Operator.GE, value: thisWeekStart },
    ]);

    const totalFiles = await this.relationDb.count('self_learning_file');
    const completedFiles = await this.relationDb.count('self_learning_file', [
      { field: 'status', operator: Operator.EQ, value: 'COMPLETED' },
    ]);
    const failedFiles = await this.relationDb.count('self_learning_file', [
      { field: 'status', operator: Operator.EQ, value: 'FAILED' },
    ]);
    const pendingFiles = await this.relationDb.count('self_learning_file', [
      { field: 'status', operator: Operator.EQ, value: 'PENDING' },
    ]);
    const completionRate = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) / 100 : 0;

    const totalTagNodes = 0;
    const totalTagEdges = 0;
    const activeEdges = 0;
    const orphanTags = 0;
    const agedEdgesThisWeek = 0;
    const newEdgesThisWeek = 0;

    // 图统计读取（2026-09-06）：请求路径绝不执行 O(节点数) 扫描——
    // 60s TTL 内命中缓存；过期返回旧值并后台重算；无缓存返回零值并后台首算
    if (!input.source) {
      const cached = this.graphStatsCache;
      if (cached) {
        Object.assign(output.stats, cached.data);
      }
      if (!this.graphStatsComputing && (!cached || Date.now() - cached.at >= 60000)) {
        this.graphStatsComputing = true;
        void this.computeGraphStatsInBackground().finally(() => {
          this.graphStatsComputing = false;
        });
      }
    }

    // 学习趋势：近 365 天，用单条 GROUP BY 查询统计每日学习次数
    const trendDays = 365;
    const trendStart = now - trendDays * 24 * 60 * 60 * 1000;
    const trendRows = this.relationDb.queryRaw<{ date: string; count: number }>(
      sourceConds.length > 0
        ? 'SELECT strftime(\'%Y-%m-%d\', "learned_at" / 1000, \'unixepoch\') AS "date", COUNT(*) AS "count" FROM "self_learning_result" WHERE "learned_at" >= ? AND "source" = ? GROUP BY "date"'
        : 'SELECT strftime(\'%Y-%m-%d\', "learned_at" / 1000, \'unixepoch\') AS "date", COUNT(*) AS "count" FROM "self_learning_result" WHERE "learned_at" >= ? GROUP BY "date"',
      sourceConds.length > 0 ? [trendStart, input.source] : [trendStart],
    );
    const countMap = new Map<string, number>();
    for (const r of trendRows) {
      countMap.set(String(r.date), Number(r.count) || 0);
    }
    const trend: Array<Record<string, unknown>> = [];
    for (let day = trendDays - 1; day >= 0; day--) {
      const dayEnd = now - day * 24 * 60 * 60 * 1000;
      const dateStr = new Date(dayEnd).toISOString().split('T')[0];
      trend.push({ date: dateStr, count: countMap.get(dateStr) || 0 });
    }

    output.stats = {
      total_learning_count: totalResults,
      total_knowledge_count: totalKnowledgeCount,
      total_insight_count: totalInsightCount,
      this_week_learning_count: thisWeekLearningCount,
      document_learning: {
        total_files: totalFiles,
        learned_files: completedFiles,
        failed_files: failedFiles,
        pending_files: pendingFiles,
        completion_rate: completionRate,
      },
      tag_graph: {
        total_tags: totalTagNodes,
        total_edges: totalTagEdges,
        active_edges: activeEdges,
        orphan_tags: orphanTags,
        aged_edges_this_week: agedEdgesThisWeek,
        new_edges_this_week: newEdgesThisWeek,
      },
      learning_trend: trend,
    };
    // 图统计写入 60s TTL 缓存（仅全局统计含图数据；学习触发后的页面刷新直接命中缓存，不再全量扫描）
    if (!input.source) {
      this.graphStatsCache = { at: Date.now(), data: JSON.parse(JSON.stringify(output.stats)) };
    }
    return true;
  }


  /** 后台计算全局图统计（逻辑控制；批处理让出事件循环；写 60s TTL 缓存，请求路径不扫描） */
  /** 后台计算全局图统计（逻辑控制；批处理让出事件循环；写 60s TTL 缓存，请求路径不扫描） */
  private async computeGraphStatsInBackground(): Promise<void> {
    try {
      const graphNodes = Object.assign(new SelectGraphOutput(), {});
      await this.graphDBAccess.selectGraph(
        Object.assign(new SelectGraphInput(), {
          target: GraphTarget.NODE,
          node_type: 'Tag',
        }),
        graphNodes,
        new GraphContext(),
      );
      const totalTagNodes = graphNodes.list.length;
      let totalTagEdges = 0;
      let activeEdges = 0;
      let orphanTags = 0;
      let agedEdgesThisWeek = 0;
      let newEdgesThisWeek = 0;
      const thisWeekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const nodeNeighborMap = new Map<string, number>();
      let scanned = 0;
      for (const node of graphNodes.list) {
        if (!('node_type' in node)) continue;
        const neighbors = Object.assign(new GetGraphNeighborsOutput(), {});
        await this.graphDBAccess.soGraphNeighbors(
          Object.assign(new GetGraphNeighborsInput(), {
            node_id: node.id,
            direction: GraphDirection.BOTH,
          }),
          neighbors,
          new GraphContext(),
        );
        nodeNeighborMap.set(node.id, neighbors.list.length);
        scanned++;
        if (scanned % SelfLearningService.TAG_MAINTENANCE_BATCH === 0) {
          await this.yieldToEventLoop();
        }
      }
      orphanTags = Array.from(nodeNeighborMap.values()).filter((c) => c === 0).length;

      const graphEdges = Object.assign(new SelectGraphOutput(), {});
      await this.graphDBAccess.selectGraph(
        Object.assign(new SelectGraphInput(), { target: GraphTarget.EDGE }),
        graphEdges,
        new GraphContext(),
      );
      for (const edge of graphEdges.list) {
        if (!('edge_type' in edge)) continue;
        totalTagEdges++;
        const e = edge as unknown as { is_active?: unknown; last_aged_at?: unknown; created?: unknown };
        if (e.is_active === true || e.is_active === 1) activeEdges++;
        if (e.last_aged_at && Number(e.last_aged_at) >= thisWeekStart) agedEdgesThisWeek++;
        if (e.created && Number(e.created) >= thisWeekStart) newEdgesThisWeek++;
      }

      this.graphStatsCache = {
        at: Date.now(),
        data: {
          tag_graph: {
            total_tags: totalTagNodes,
            total_edges: totalTagEdges,
            active_edges: activeEdges,
            orphan_tags: orphanTags,
            aged_edges_this_week: agedEdgesThisWeek,
            new_edges_this_week: newEdgesThisWeek,
          },
        },
      };
      this.logger?.debug?.('computeGraphStatsInBackground done', {
        total_tags: totalTagNodes,
        total_edges: totalTagEdges,
      });
    } catch (err: unknown) {
      this.logger?.error?.('computeGraphStatsInBackground failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // configSelfLearning
  // ─────────────────────────────────────────────────────────────────────────

  async configSelfLearning(input: ConfigSelfLearningInput, output: ConfigSelfLearningOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'self_learning_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());

    const current = (selOutput.row ?? {}) as Record<string, unknown>;
    const configId = (current.id as string) || 'self_learning_config_default';

    const data: DataObject[] = [
      { field: 'id', value: configId },
      { field: 'updated', value: IdGenerator.now() },
    ];

    const fields: Array<keyof ConfigSelfLearningInput> = [
      'learning_mode', 'document_auto_enable', 'conversation_auto_enable', 'tag_auto_enable',
      'document_random_factor', 'conversation_random_factor', 'tag_random_factor',
      'random_factor', 'document_weight', 'conversation_weight',
      'tag_maintenance_weight', 'learning_interval_ms', 'default_learning_rate',
      'tag_connection_check_interval_ms', 'tag_aging_cron',
      'orphan_tag_check_cron', 'document_split_threshold', 'chunk_overlap_ratio',
      'document_query_prompt_template_id', 'document_query_llm_id',
    ];

    const booleanFields = new Set<string>(['document_auto_enable', 'conversation_auto_enable', 'tag_auto_enable']);
    for (const field of fields) {
      if (input[field] !== undefined) {
        const value = booleanFields.has(field) ? (input[field] ? 1 : 0) : input[field];
        data.push({ field, value });
      }
    }

    if (data.length > 2) {
      const now = IdGenerator.now();
      data.push({ field: 'created', value: current.created ?? now });
      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'self_learning_config',
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: configId },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, Object.assign(new UpdateDBOutput(), {}), new DBContext());
    }

    const refreshed = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(
      Object.assign(new SelectOneDBInput(), { query_param: { table: 'self_learning_config' } }),
      refreshed,
      new DBContext(),
    );
    output.config = (refreshed.row ?? {}) as Record<string, unknown>;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async getConfig(): Promise<Record<string, unknown>> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'self_learning_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());
    return (selOutput.row ?? {}) as Record<string, unknown>;
  }
}
