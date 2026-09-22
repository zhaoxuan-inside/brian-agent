import { callLLMJson } from '@brian-agent/base';
import { Metrics, Report } from '@brian-agent/base';
import * as fs from 'fs';
import * as path from 'path';
import { RelationDBAccess, SelectDBInput, SelectDBOutput, SelectOneDBInput, SelectOneDBOutput, UpdateDBInput, UpdateDBOutput, CountDBInput, CountDBOutput, TransactionDBInput, TransactionDBOutput, Operator, DataObject, DBContext, IdGenerator, NotFoundError, ValidationError, ExecLLMInput, ExecLLMOutput, LLMContext, ExecPromptInput, ExecPromptOutput, PromptContext, SoPromptInput, SoPromptOutput, SoSoulOutput, AddSoulOutput, GetSoulInput, GetSoulOutput, SoulContext, PROMPT_IDS, getBuiltinTemplate, renderTemplate, InfoType, type Logger, type Condition } from '@brian-agent/base';
import type { GraphDBAccess, ChunkAccess, LLMAccess, PromptsAccess, SoulAccess } from '@brian-agent/base';
import type { AgentDefAccess } from '@brian-agent/runtime';
import { DeclareAgentInput, DeclareAgentOutput, SoAgentDefsInput, SoAgentDefsOutput, AgentDefContext, AgentMode, AgentDefStatus } from '@brian-agent/runtime';
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
  RunEvalOnceInput, RunEvalOnceOutput,
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
  UpdateFileContentInput, UpdateFileContentOutput,
  DeleteFileInput, DeleteFileOutput,
  DOCUMENT_READING_AGENT_NAME, DOCUMENT_READING_SOUL_BRIEF,
  DOCUMENT_READING_SOUL_CONTENT, DOCUMENT_READING_SOUL_USAGE,
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
  // ===== 修改后的字段：系统唯一的定时器 = 随机概率触发器 =====
  // 手动触发改为"立即完整执行一次"的单轮任务，不再安装 document/tag 等 per-mode 定时器；
  // 对话学习改为 Evolutor runEvalOnce 单轮闭环，不再依赖常驻评估调度（原 evalSchedule* 标记随之移除）。
  /** 唯一的系统定时器：按概率触发三类学习任务（RANDOM / ALL 启动时确保其运行） */
  private randomLearningTimer: ReturnType<typeof setInterval> | null = null;
  /** 三类单轮任务的防重入标志：同一时刻同模式只允许一轮完整执行 */
  private documentPassRunning = false;
  private conversationPassRunning = false;
  private tagMaintenanceRunning = false;
  /** 手动停止意图：进行中的单轮任务在单元边界（文件 / 建图-激活阶段）检查后提前结束 */
  private readonly cancelRequested = new Set<LearningTaskRecord['mode']>();

  /** 文档伴读声明式 Agent 定义 ID 缓存（ensureBuiltinDocumentAgent 落账后填充） */
  private documentAgentDefId = '';
  /** 文档伴读内置 Soul ID 缓存（ensureDocumentReadingSoul 落账后填充） */
  private documentAgentSoulId = '';

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
    /** 文档伴读内置 Soul 的读写入口（Base.SoulProvider；缺省则跳过内置 Agent 装配） */
    private readonly soulAccess?: SoulAccess,
    /** 文档伴读声明式 Agent 的注册/快照入口（Runtime.Agents；缺省则回退直连 LLM） */
    private readonly agentDefAccess?: AgentDefAccess,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // addLibrary
  // ─────────────────────────────────────────────────────────────────────────

  async addLibrary(input: AddLibraryInput, output: AddLibraryOutput, _context: SelfLearningContext, metrics?: Metrics, _report?: Report,
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

    const { fileCount } = await this.scanLibraryDirectory(libraryId, libraryPath, now, undefined, metrics);

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
   * @param skipExisting 传入时为增量模式：relative_path 或 file_path（绝对路径）已存在的条目跳过入库（保留原状态），其子目录仍会递归
   * @returns 扫描到的文件数与目录数
   */
  private async scanLibraryDirectory(
    libraryId: string,
    rootPath: string,
    now: number,
    skipExisting?: Set<string>,
    metrics?: Metrics,
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

        if (skipExisting && (skipExisting.has(relPath) || skipExisting.has(absPath))) {
          if (isDir) await walk(absPath, relPath);
          continue;
        }

        let fileSize = 0;
        if (isFile) {
          try {
            fileSize = fs.statSync(absPath).size;
          } catch (err) {
            fileSize = 0;
            metrics?.warn('SelfLearningService.scanLibraryDirectory 读取文件大小失败（按 0 记账）', {
              error: err instanceof Error ? err.message : String(err),
              library_id: libraryId,
              file_path: absPath,
            });
          }
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

  /**
   * 增量同步资料库目录：把磁盘上新增的文件/目录登记为 PENDING。
   * 已有记录保持原状态（COMPLETED 不重复学习），磁盘上已移除的记录不删除。
   */
  private async syncLibraryFiles(libraryId: string, rootPath: string, now: number): Promise<void> {
    if (!rootPath) return;
    const existing = await this.relationDb.select('self_learning_file', {
      conditions: [
        { field: 'library_id', operator: Operator.EQ, value: libraryId },
      ],
    });
    // 遗留数据可能没有 relative_path（空串），故同时按 file_path 绝对路径判重
    const knownPaths = new Set<string>();
    for (const r of existing) {
      const rel = String(r.relative_path ?? '');
      if (rel) knownPaths.add(rel);
      const abs = String(r.file_path ?? '');
      if (abs) knownPaths.add(abs);
    }
    await this.scanLibraryDirectory(libraryId, rootPath, now, knownPaths);
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

  async setLibraryEnabled(input: SetLibraryEnabledInput, output: SetLibraryEnabledOutput, _context: SelfLearningContext, metrics?: Metrics, _report?: Report,
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
        undefined,
        metrics,
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

  // ===== 修改后的方法（2026-09-21）：文档伴读专用 Agent + 专用 Prompt + 专用 Soul =====
  // 变更原因：此前直连 execLLM 且 Prompt 仅做简单解释，缺少独立人设与阅读伴读方法论；
  // 现改为经「文档伴读」声明式 Agent 取 system（身份 + 专用 Soul）与默认模型，
  // Prompt 走增强后的 builtin.document_query（含文档标题与伴读式回答要求）；
  // 配置项 document_query_prompt_template_id / document_query_llm_id 仍作为覆盖优先级最高项。
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

    // 1. 文档伴读专用 Agent 快照：system（身份 + Soul）+ 默认模型 + 温度
    const agent = await this.soDocumentReadingAgent(question);

    // 2. 渲染专用 Prompt（含文档标题与伴读式回答要求；未配置时用内置模板）
    const prompt = await this.renderPrompt(
      templateId,
      '文档阅读问答',
      {
        selection,
        context_before: contextBefore,
        context_after: contextAfter,
        question,
        document_title: input.document_title || '',
      },
      PROMPT_IDS.documentQuery,
    );

    // 3. 模型：配置 > Agent 快照 > 自动匹配
    let llmId = configuredLlmId || agent.llm_id;
    if (!llmId) llmId = await this.matchDocumentQueryLlm();
    if (!llmId) {
      output.result = '未配置文档阅读模型：请在「配置中心 > 应用配置 > 自学习 > 文档阅读 LLM」中选择模型';
      return true;
    }
    output.llm_id = llmId;

    // 4. 调用 LLM（system 注入专用 Soul / 身份）
    await this.execDocumentQueryLlm(llmId, prompt, agent.system, agent.temperature, output);
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 文档伴读专用 Agent / Soul 装配（ensureBuiltinDocumentAgent 等）
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 确保文档伴读专用资源就绪（幂等）：内置 Soul + 声明式 Agent。
   *
   * Agent 以 status=Disabled 声明：不参与主对话的 Agent 匹配（避免文档人设劫持普通问答），
   * 仅由 queryDocument 按 def_id 显式取快照。任一依赖缺失时静默跳过并返回空串。
   */
  async ensureBuiltinDocumentAgent(): Promise<string> {
    if (!this.soulAccess || !this.agentDefAccess) return '';
    if (this.documentAgentDefId) return this.documentAgentDefId;

    const soulId = await this.ensureDocumentReadingSoul();
    this.documentAgentSoulId = soulId;
    const declareInput = Object.assign(new DeclareAgentInput(), {
      name: DOCUMENT_READING_AGENT_NAME,
      mode: AgentMode.Subagent,
      agent_purpose: '文档伴读：基于资料库文档的选中内容与上下文，解释、举例并延伸讲解，帮助用户阅读理解',
      task_signature: '[document_reading] 解释文档选中内容并回答读者提问',
      prompt_template_id: PROMPT_IDS.documentReadingIdentity,
      model_id: '',
      soul_id: soulId,
      temperature: 0.3,
      status: AgentDefStatus.Disabled,
    });
    const declareOutput = new DeclareAgentOutput();
    await this.agentDefAccess.declareAgent(declareInput, declareOutput, new AgentDefContext());
    this.documentAgentDefId = declareOutput.def_id || '';
    this.logger?.debug?.('ensureBuiltinDocumentAgent done', { defId: this.documentAgentDefId, soulId });
    return this.documentAgentDefId;
  }

  /** 内置文档伴读 Soul 幂等 upsert（数据处理；返回 soul_id） */
  private async ensureDocumentReadingSoul(): Promise<string> {
    const soOut = new SoSoulOutput();
    await this.soulAccess!.soSoul(
      { conditions: [{ field: 'soul_brief', operator: Operator.EQ, value: DOCUMENT_READING_SOUL_BRIEF }] },
      soOut,
      new SoulContext(),
    );
    if (soOut.list.length > 0) return soOut.list[0].id;

    const addOut = new AddSoulOutput();
    await this.soulAccess!.addSoul(
      {
        data: {
          soul_brief: DOCUMENT_READING_SOUL_BRIEF,
          soul_content: DOCUMENT_READING_SOUL_CONTENT,
          soul_usage: DOCUMENT_READING_SOUL_USAGE,
        },
      },
      addOut,
      new SoulContext(),
    );
    return addOut.id;
  }

  /**
   * 文档伴读 Agent 配置解析（逻辑控制）：
   * - 模型 / 温度：读声明式 Agent 定义（按 name 解析，取 model_id / temperature）；
   * - system：由专用身份 Prompt（builtin 内置模板，内存渲染）+ 绑定 Soul 组装。
   *
   * 说明：内置 Prompt 播种在新版已收敛到 PromptProvider/DB 管理，DB 中可能没有
   * `builtin.document_reading_identity` 行，因此 system 直接取内置模板内存渲染，
   * 避免因缺模板导致快照失败；Agent 本身仍作为 Soul 绑定与模型/温度的配置载体。
   */
  private async soDocumentReadingAgent(_question: string): Promise<{ system: string; llm_id: string; temperature?: number }> {
    const system = await this.buildDocumentReadingSystem();
    if (!this.agentDefAccess) return { system, llm_id: '' };
    try {
      await this.ensureBuiltinDocumentAgent();
      const defsOut = new SoAgentDefsOutput();
      await this.agentDefAccess.soAgentDefs(Object.assign(new SoAgentDefsInput(), {}), defsOut, new AgentDefContext());
      const def = defsOut.defs.find((d) => d.name === DOCUMENT_READING_AGENT_NAME);
      return { system, llm_id: def?.model_id || '', temperature: def?.temperature };
    } catch (err: unknown) {
      this.logger?.warn?.(`文档伴读 Agent 配置解析失败，回退默认: ${err instanceof Error ? err.message : String(err)}`);
      return { system, llm_id: '' };
    }
  }

  /** 文档伴读 system 组装（数据处理）：专用身份模板 + 绑定 Soul 内存渲染 */
  private async buildDocumentReadingSystem(): Promise<string> {
    const soul = await this.soDocumentReadingSoulContent();
    const template = getBuiltinTemplate(PROMPT_IDS.documentReadingIdentity) || '';
    if (!template) return soul;
    return renderTemplate(template, {
      soul,
      task_directive: '阅读文档并回答读者关于选中内容的提问',
    });
  }

  /** 读取文档伴读绑定 Soul 的内容（逻辑控制；缺失返回空串） */
  private async soDocumentReadingSoulContent(): Promise<string> {
    if (!this.soulAccess) return '';
    try {
      const soulId = this.documentAgentSoulId || await this.ensureDocumentReadingSoul();
      if (!soulId) return '';
      const soulOut = new GetSoulOutput();
      await this.soulAccess.soSoulById(
        Object.assign(new GetSoulInput(), { id: soulId }),
        soulOut,
        new SoulContext(),
      );
      return soulOut.soul?.soul_content || '';
    } catch (err: unknown) {
      this.logger?.warn?.(`读取文档伴读 Soul 失败: ${err instanceof Error ? err.message : String(err)}`);
      return '';
    }
  }

  /** 文档问答模型自动匹配（逻辑控制；matchLLM 失败视为未配置） */
  private async matchDocumentQueryLlm(): Promise<string> {
    try {
      const matchOut = new MatchLLMOutput();
      await this.llmCore.matchLLM(
        Object.assign(new MatchLLMInput(), {
          agent_id: 'document_query',
          context_id: 'document_query',
          run_id: IdGenerator.generate(),
        }),
        matchOut,
        new LLMCoreContext(),
      );
      return matchOut.llm_id || '';
    } catch {
      return '';
    }
  }

  /** 文档问答 LLM 调用（数据处理；system 非空时注入专用 Soul） */
  private async execDocumentQueryLlm(
    llmId: string,
    prompt: string,
    system: string,
    temperature: number | undefined,
    output: QueryDocumentOutput,
  ): Promise<void> {
    try {
      const llmOut = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: llmId,
          prompt,
          ...(system ? { system } : {}),
          temperature: temperature ?? 0.3,
          max_tokens: 1024,
          caller: 'SelfLearningService.readDocument',
        }),
        llmOut,
        new LLMContext(),
      );
      output.result = llmOut.result || '';
    } catch (err: unknown) {
      output.result = `解释失败：${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /**
   * 渲染 Prompt：配置模板优先；未配置时优先用内置模板内存渲染（`builtinTemplateId`），
   * 再按标题查 DB；均缺失时 fail-loud。
   */
  private async renderPrompt(
    templateId: string | undefined,
    fallbackTitle: string,
    variables: Record<string, unknown>,
    builtinTemplateId?: string,
  ): Promise<string> {
    let id = templateId;
    if (!id && builtinTemplateId) {
      const builtin = getBuiltinTemplate(builtinTemplateId);
      if (builtin) return renderTemplate(builtin, variables);
    }
    if (!id) {
      const soOut = new SoPromptOutput();
      await this.promptsAccess.soPrompt(
        Object.assign(new SoPromptInput(), { keyword: fallbackTitle }),
        soOut,
        new PromptContext(),
      );
      const hit = soOut.list?.find((p) => p.enable !== false && (p.prompt_template_title?.includes(fallbackTitle) || p.prompt_template_brief?.includes(fallbackTitle)));
      if (hit) id = hit.id;
    }
    if (!id) {
      throw new ValidationError(`未找到匹配的 Prompt 模板: ${fallbackTitle}`);
    }
    const promptOut = new ExecPromptOutput();
    await this.promptsAccess.execPrompt(
      Object.assign(new ExecPromptInput(), { id, variables }),
      promptOut,
      new PromptContext(),
    );
    if (promptOut.prompt) return promptOut.prompt;
    throw new ValidationError(`Prompt 模板不可用或渲染为空: ${id}`);
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
  // updateFileContent（文档编辑：写回本地文件）
  // ─────────────────────────────────────────────────────────────────────────

  async updateFileContent(input: UpdateFileContentInput, output: UpdateFileContentOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const file = await this.soFileRecord(input.file_id);
    if (!file) {
      throw new NotFoundError('文档', input.file_id);
    }
    if (Number(file.is_directory) === 1) {
      throw new ValidationError('目录不可编辑');
    }
    const filePath = String(file.file_path ?? '');
    if (!filePath) {
      throw new ValidationError('文档路径为空，无法写回');
    }

    fs.writeFileSync(filePath, input.content ?? '', 'utf-8');
    const size = Buffer.byteLength(input.content ?? '', 'utf-8');
    const now = IdGenerator.now();
    // 内容变更 → 重置学习状态为 PENDING，使下一轮文档学习重新抽取知识点
    await this.relationDb.update('self_learning_file', [
      { field: 'file_size', value: size },
      { field: 'status', value: 'PENDING' },
      { field: 'error_message', value: null },
      { field: 'learned_at', value: null },
      { field: 'updated', value: now },
    ], [{ field: 'file_id', operator: Operator.EQ, value: input.file_id }]);

    output.file_name = String(file.file_name ?? '');
    output.content = input.content ?? '';
    output.size = size;
    this.logger?.debug?.('updateFileContent done', { fileId: input.file_id, size });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // deleteFile（文档删除：删除本地文件 + 级联清理索引与注释）
  // ─────────────────────────────────────────────────────────────────────────

  async deleteFile(input: DeleteFileInput, output: DeleteFileOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const file = await this.soFileRecord(input.file_id);
    if (!file) {
      throw new NotFoundError('文档', input.file_id);
    }
    if (Number(file.is_directory) === 1) {
      throw new ValidationError('目录不可删除');
    }

    // 删除本地文件；文件已不存在时视为成功（幂等）
    const filePath = String(file.file_path ?? '');
    if (filePath) {
      try {
        fs.unlinkSync(filePath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }

    const annRows = this.relationDb.queryRaw<{ c: number }>(
      'SELECT COUNT(*) AS "c" FROM "document_annotation" WHERE "file_id" = ?',
      [input.file_id],
    );
    output.deleted_annotations = Number(annRows[0]?.c ?? 0);

    const txInput = Object.assign(new TransactionDBInput(), {
      operations: [
        {
          type: 'DELETE',
          table: 'document_annotation',
          conditions: [{ field: 'file_id', operator: Operator.EQ, value: input.file_id }] as Condition[],
        },
        {
          type: 'DELETE',
          table: 'self_learning_file',
          conditions: [{ field: 'file_id', operator: Operator.EQ, value: input.file_id }] as Condition[],
        },
      ],
    });
    await this.relationDb.transactionDB(txInput, Object.assign(new TransactionDBOutput(), {}), new DBContext());
    this.logger?.debug?.('deleteFile done', { fileId: input.file_id, annotations: output.deleted_annotations });
    return true;
  }

  /** 按 file_id 读取文件索引行（数据处理；不存在返回 null） */
  private async soFileRecord(fileId: string): Promise<Record<string, unknown> | null> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'self_learning_file',
        conditions: [
          { field: 'file_id', operator: Operator.EQ, value: fileId },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, selOutput, new DBContext());
    return selOutput.row ?? null;
  }

  // ===== 修改后的 startLearning：手动触发 = 立即完整执行一次指定任务 =====
  // 原逻辑：手动触发会顺带安装 60s 文档定时器 / 30min Tag 定时器，并启动 Evolutor 常驻评估调度
  //（系统内实际存在 3+ 个定时器，手动触发≠一次完整执行）。
  // 新逻辑：手动触发对每个指定模式注册任务并完整执行一轮（同步跑完该轮，fire-and-forget 不阻塞 HTTP），
  // 任务列表 running→completed/failed 可观测；不再创建任何 per-mode 定时器。
  // 系统唯一定时器为随机概率触发器，仅在 mode 为 ALL / RANDOM 时确保其运行。
  async startLearning(input: StartLearningInput, _output: StartLearningOutput, _context: SelfLearningContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const learningRate = input.learning_rate ?? (config.learning_rate as number) ?? 5;
    const mode = input.learning_mode ?? 'ALL';

    if (!mode || mode === 'ALL' || mode.includes('DOCUMENT')) {
      const taskId = this.registerLearningTask('DOCUMENT', '从文档学习');
      void this.runDocumentLearningPass(input.library_id, learningRate)
        .then(() => this.finishLearningTask(taskId))
        .catch((err: unknown) => this.finishLearningTask(taskId, err instanceof Error ? err.message : String(err)));
    }
    if (mode === 'ALL' || mode.includes('CONVERSATION')) {
      const taskId = this.registerLearningTask('CONVERSATION', '从对话学习');
      void this.runConversationLearningPass()
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
            await this.runDocumentLearningPass(undefined, rate);
          }
        }
        if (Number(fresh.conversation_auto_enable) !== 0) {
          const rf = (fresh.conversation_random_factor as number) ?? 10;
          if (Math.floor(Math.random() * 101) < rf) {
            await this.runConversationLearningPass();
          }
        }
        if (Number(fresh.tag_auto_enable) !== 0) {
          const rf = (fresh.tag_random_factor as number) ?? 10;
          if (Math.floor(Math.random() * 101) < rf) {
            await this.startTagMaintenanceGuarded(fresh);
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

  // ===== 修改后的方法：文档学习单轮完整执行 =====
  // 原逻辑：每 60s 一个定时器 tick，每轮每库只处理 learning_rate 条 PENDING（学习慢、但会悬挂定时器）。
  // 新逻辑：一次调用即完整处理本轮——同步目录后分页循环，直到各启用库没有 PENDING 文件；
  // 不安装任何定时器；防重入 + stopLearning 取消意图（文件边界生效）。
  private async runDocumentLearningPass(
    libraryId: string | undefined,
    learningRate: number,
  ): Promise<void> {
    if (this.documentPassRunning) return;
    this.documentPassRunning = true;
    this.cancelRequested.delete('DOCUMENT');
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
        if (this.cancelRequested.has('DOCUMENT')) return;
        const lid = lib.library_id as string;
        const libRate = (lib.learning_rate as number) ?? learningRate;

        // 先增量同步目录：磁盘上新增的文件登记为 PENDING（已有记录保持原状态）
        await this.syncLibraryFiles(lid, String(lib.library_path ?? ''), IdGenerator.now());

        // 完整一轮：分页取 PENDING 直至取空（每页 libRate 条）
        for (;;) {
          if (this.cancelRequested.has('DOCUMENT')) return;
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
          if (!fileOut.rows.length) break;

          for (const file of fileOut.rows) {
            if (this.cancelRequested.has('DOCUMENT')) return;
            await this.handleDocumentLearning(file);
          }
          if (fileOut.rows.length < libRate) break;
        }
      }
    } catch (err: unknown) {
      this.logger?.error?.('Document learning pass error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.documentPassRunning = false;
      this.cancelRequested.delete('DOCUMENT');
    }
  }

  // ===== 修改后的方法：对话学习单轮完整执行 =====
  // 原逻辑：调用 Evolutor startEvalSchedule 启动常驻评估调度（worker + 1h schedule 定时器），
  // 任务"完成"仅代表调度器已挂上，并非一次完整评估闭环。
  // 新逻辑：调用 Evolutor runEvalOnce 立即执行一次完整评估闭环（扫描未评估 usage → 同步评估 → Agent 老化），
  // 返回即代表本轮闭环执行完毕；不依赖任何常驻 worker / 定时器。
  private async runConversationLearningPass(): Promise<void> {
    if (this.conversationPassRunning) return;
    this.conversationPassRunning = true;
    this.cancelRequested.delete('CONVERSATION');
    try {
      if (this.cancelRequested.has('CONVERSATION')) return;
      await this.evolutorAgent.runEvalOnce(
        Object.assign(new RunEvalOnceInput(), {}),
        Object.assign(new RunEvalOnceOutput(), {}),
        new EvolutorAgentContext(),
      );
    } catch (err: unknown) {
      this.logger?.error?.('Conversation learning pass error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.conversationPassRunning = false;
      this.cancelRequested.delete('CONVERSATION');
    }
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

  // ===== 修改后的方法：Tag 维护单轮完整执行 =====
  // 原逻辑：先安装 tagConnectionTimer / tagEstablishTimer 两个 30min 定时器，再顺带执行一次
  // 建立+激活（定时器悬挂在实例上，且 aging/orphan 已由 CronProvider 接管）。
  // 新逻辑：一次调用 = 一轮完整维护（连接建立 → 标签激活），跑完即止；不再创建任何定时器，
  // 周期化需求由唯一概率触发定时器（randomLearningTimer）承担。
  private async startTagMaintenance(config: Record<string, unknown>): Promise<void> {
    void config;
    await this.startTagConnectionEstablishment();
    if (this.cancelRequested.has('TAG_MAINTENANCE')) return;
    await this.startTagActivation();
  }

  // ===== clearTagTimers 已移除（保留作为参考）=====
  // private clearTagTimers(): void {
  //   if (this.tagConnectionTimer) { clearInterval(this.tagConnectionTimer); this.tagConnectionTimer = null; }
  //   if (this.tagEstablishTimer) { clearInterval(this.tagEstablishTimer); this.tagEstablishTimer = null; }
  //   if (this.tagAgingTimer) { clearInterval(this.tagAgingTimer); this.tagAgingTimer = null; }
  //   if (this.orphanTagTimer) { clearInterval(this.orphanTagTimer); this.orphanTagTimer = null; }
  // }

  // ─────────────────────────────────────────────────────────────────────────
  // stopLearning
  // ─────────────────────────────────────────────────────────────────────────

  // ===== 修改后的 stopLearning：系统唯一定时器 = 概率触发调度器 =====
  // 新语义：
  //  - ALL / RANDOM：停止概率触发调度器（唯一可"停止"的常驻定时器）；
  //  - 具体模式：登记取消意图，进行中的同模式单轮任务在单元边界（文件 / 建图-激活阶段）提前结束；
  //    未在执行时幂等无副作用（不存在需要清理的 per-mode 定时器）。
  // 兼容清理：对话学习已改为 runEvalOnce 单轮，不再依赖 Evolutor 常驻评估调度，
  // 仍保留一次幂等 stopEvalSchedule（best-effort）以清理历史版本可能残留的 worker。
  async stopLearning(input: StopLearningInput, _output: StopLearningOutput, _context: SelfLearningContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const mode = input.learning_mode ?? 'ALL';

    if (mode === 'ALL' || mode === 'RANDOM') {
      if (this.randomLearningTimer) {
        clearInterval(this.randomLearningTimer);
        this.randomLearningTimer = null;
      }
    }

    if (mode === 'ALL' || mode.includes('DOCUMENT')) {
      this.cancelRequested.add('DOCUMENT');
    }
    if (mode === 'ALL' || mode.includes('CONVERSATION')) {
      this.cancelRequested.add('CONVERSATION');
    }
    if (mode === 'ALL' || mode.includes('TAG_MAINTENANCE')) {
      this.cancelRequested.add('TAG_MAINTENANCE');
    }

    if (mode === 'ALL' || mode.includes('CONVERSATION')) {
      try {
        const stopInput = Object.assign(new StopEvalScheduleInput(), {});
        const stopOutput = Object.assign(new StopEvalScheduleOutput(), {});
        await this.evolutorAgent.stopEvalSchedule(stopInput, stopOutput, new EvolutorAgentContext());
      } catch (err) {
        /* best-effort：历史常驻调度残留清理，失败不影响停止语义 */
        metrics?.warn('SelfLearningService.stopLearning 历史常驻调度清理失败（不影响停止语义）', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
      caller: 'SelfLearningService.summarize',
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
  // 注：tagMaintenanceRunning 已上移到类字段区（与 documentPassRunning / conversationPassRunning 统一）
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

  /** 学习是否正在运行：概率触发调度器活动，或存在进行中的单轮任务（running 状态任务） */
  private isLearningRunning(): boolean {
    if (this.randomLearningTimer) return true;
    if (this.documentPassRunning || this.conversationPassRunning || this.tagMaintenanceRunning) return true;
    for (const t of this.learningTasks.values()) {
      if (t.status === LearningTaskStatus.Running) return true;
    }
    return false;
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
      .slice(0, limit);
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
