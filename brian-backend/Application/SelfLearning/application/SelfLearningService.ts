import * as fs from 'fs';
import * as path from 'path';
import {
  RelationDBAccess, SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  DeleteDBInput, DeleteDBOutput,
  InsertDBInput, InsertDBOutput,
  CountDBInput, CountDBOutput,
  TransactionDBInput, TransactionDBOutput,
  Operator, DataObject, DBContext, IdGenerator,
  type Logger, type Condition,
} from '@brian-agent/base';
import type { GraphDBAccess } from '@brian-agent/base';
import type {
  InfoCoreAccess, MQCoreAccess, LLMCoreAccess,
} from '@brian-agent/core';
import type {
  EvolutorAgentAccess, WriterAgentAccess,
} from '@brian-agent/agent';
import type {
  OrchestrationEntryAccess,
} from '@brian-agent/orchestration';
import {
  SelectGraphInput, SelectGraphOutput,
  GetGraphNeighborsInput, GetGraphNeighborsOutput,
  ActivateGraphEdgeInput, ActivateGraphEdgeOutput,
  AgeGraphEdgeInput, AgeGraphEdgeOutput,
  GraphContext, GraphTarget, GraphDirection,
} from '@brian-agent/base';
import {
  SaveInfoInput, SaveInfoOutput,
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
  OrchestrationEntryContext,
  ReceiveWorkAsyncInput, ReceiveWorkAsyncOutput,
} from '@brian-agent/orchestration';
import {
  SelfLearningContext,
  AddLibraryInput, AddLibraryOutput,
  DeleteLibraryInput, DeleteLibraryOutput,
  SearchLibraryInput, SearchLibraryOutput,
  GetLibraryFilesInput, GetLibraryFilesOutput,
  GetFileContentInput, GetFileContentOutput,
  StartLearningInput, StartLearningOutput,
  StopLearningInput, StopLearningOutput,
  GetTagGraphInput, GetTagGraphOutput,
  GetTagRelatedInfoInput, GetTagRelatedInfoOutput,
  GetLearningProgressInput, GetLearningProgressOutput,
  GetLearningResultsInput, GetLearningResultsOutput,
  GetLearningStatsInput, GetLearningStatsOutput,
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
    private readonly orchestrationEntry: OrchestrationEntryAccess,
    private readonly graphDBAccess: GraphDBAccess,
    private readonly mqAccess: any,
    private readonly logger?: Logger,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // addLibrary
  // ─────────────────────────────────────────────────────────────────────────

  async addLibrary(
    input: AddLibraryInput,
    _context: SelfLearningContext,
    output: AddLibraryOutput,
  ): Promise<boolean> {
    const libraryPath = path.resolve(input.library_path);
    fs.accessSync(libraryPath, fs.constants.R_OK);

    const stat = fs.statSync(libraryPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${libraryPath}`);
    }

    const entries = fs.readdirSync(libraryPath);
    const mdFiles = entries.filter((f) => f.endsWith('.md'));

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

    for (const fileName of mdFiles) {
      const filePath = path.join(libraryPath, fileName);
      let fileSize = 0;
      try {
        fileSize = fs.statSync(filePath).size;
      } catch {
        fileSize = 0;
      }
      await this.relationDb.insert('self_learning_file', [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'library_id', value: libraryId },
        { field: 'file_id', value: IdGenerator.generate() },
        { field: 'file_name', value: fileName },
        { field: 'file_path', value: filePath },
        { field: 'file_size', value: fileSize },
        { field: 'status', value: 'PENDING' },
      ]);
    }

    output.library_id = libraryId;
    output.file_count = mdFiles.length;
    this.logger?.debug?.('addLibrary done', { libraryId, fileCount: mdFiles.length });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // deleteLibrary
  // ─────────────────────────────────────────────────────────────────────────

  async deleteLibrary(
    input: DeleteLibraryInput,
    _context: SelfLearningContext,
    _output: DeleteLibraryOutput,
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
    await this.relationDb.transactionDB(txInput, new DBContext(), Object.assign(new TransactionDBOutput(), {}));
    this.logger?.debug?.('deleteLibrary done', { libraryId: input.library_id });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // searchLibrary
  // ─────────────────────────────────────────────────────────────────────────

  async searchLibrary(
    input: SearchLibraryInput,
    _context: SelfLearningContext,
    output: SearchLibraryOutput,
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
    await this.relationDb.countDB(countInput, new DBContext(), countOutput);
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
    await this.relationDb.selectDB(selInput, new DBContext(), selOutput);

    const libraries: Array<Record<string, unknown>> = [];
    for (const row of selOutput.rows) {
      const libId = row.library_id as string;
      const totalFiles = await this.relationDb.count('self_learning_file', [
        { field: 'library_id', operator: Operator.EQ, value: libId },
      ]);
      const learnedFiles = await this.relationDb.count('self_learning_file', [
        { field: 'library_id', operator: Operator.EQ, value: libId },
        { field: 'status', operator: Operator.EQ, value: 'COMPLETED' },
      ]);
      libraries.push({
        ...row,
        total_files: totalFiles,
        learned_files: learnedFiles,
      });
    }

    output.libraries = libraries;
    output.total = total;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getLibraryFiles
  // ─────────────────────────────────────────────────────────────────────────

  async getLibraryFiles(
    input: GetLibraryFilesInput,
    _context: SelfLearningContext,
    output: GetLibraryFilesOutput,
  ): Promise<boolean> {
    const conditions: Condition[] = [
      { field: 'library_id', operator: Operator.EQ, value: input.library_id },
    ];
    if (input.status) {
      conditions.push({ field: 'status', operator: Operator.EQ, value: input.status });
    }

    const pageCurrent = input.page_current ?? 1;
    const pageSize = input.page_size ?? 20;

    const countInput = Object.assign(new CountDBInput(), {
      table: 'self_learning_file',
      conditions,
    });
    const countOutput = Object.assign(new CountDBOutput(), {});
    await this.relationDb.countDB(countInput, new DBContext(), countOutput);

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'self_learning_file',
        conditions,
        page: { current: pageCurrent, size: pageSize },
        order_by: [{ field: 'created', direction: 'ASC' }],
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, new DBContext(), selOutput);

    output.files = selOutput.rows;
    output.total = countOutput.count;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getFileContent
  // ─────────────────────────────────────────────────────────────────────────

  async getFileContent(
    input: GetFileContentInput,
    _context: SelfLearningContext,
    output: GetFileContentOutput,
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
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    const file = selOutput.row;
    if (!file) {
      this.logger?.debug?.('getFileContent: file not found', { fileId: input.file_id });
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
  // startLearning
  // ─────────────────────────────────────────────────────────────────────────

  async startLearning(
    input: StartLearningInput,
    _context: SelfLearningContext,
    _output: StartLearningOutput,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const learningRate = input.learning_rate ?? (config.learning_rate as number) ?? 5;
    const interval = (config.learning_interval_ms as number) ?? 600000;
    const mode = input.learning_mode ?? 'ALL';

    if (!mode || mode === 'ALL' || mode.includes('DOCUMENT')) {
      await this.startDocumentLearning(input.library_id, learningRate, interval);
    }

    if (mode === 'ALL' || mode.includes('CONVERSATION')) {
      await this.startConversationLearning();
    }

    if (mode === 'ALL' || mode.includes('TAG_MAINTENANCE')) {
      await this.startTagMaintenance(config);
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

    const tick = async () => {
      try {
        const hasRecentActivity = await this.checkUserRecentActivity(5 * 60 * 1000);
        if (hasRecentActivity) return;

        const randomFactor = (config.random_factor as number) ?? 10;
        const documentWeight = (config.document_weight as number) ?? 40;
        const conversationWeight = (config.conversation_weight as number) ?? 30;
        const tagMaintenanceWeight = (config.tag_maintenance_weight as number) ?? 30;

        const rand = Math.floor(Math.random() * 101);
        if (rand >= randomFactor) return;

        const totalWeight = documentWeight + conversationWeight + tagMaintenanceWeight;
        if (totalWeight <= 0) return;

        const selection = Math.random() * totalWeight;
        if (selection < documentWeight) {
          await this.startDocumentLearning(undefined, (config.default_learning_rate as number) ?? 5, learningIntervalMs);
        } else if (selection < documentWeight + conversationWeight) {
          await this.startConversationLearning();
        } else {
          await this.startTagMaintenance(config);
        }
      } catch (err: unknown) {
        this.logger?.error?.('Random trigger learning error', { error: err instanceof Error ? err.message : String(err) });
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
          { field: 'info_creator_role', operator: Operator.EQ, value: 'REQUEST' },
          { field: 'created', operator: Operator.GE, value: threshold },
        ] as Condition[],
      });
      const countOutput = Object.assign(new CountDBOutput(), {});
      await this.relationDb.countDB(countInput, new DBContext(), countOutput);
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

    const tick = async () => {
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
        await this.relationDb.selectDB(libSel, new DBContext(), libOut);

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
          await this.relationDb.selectDB(fileSel, new DBContext(), fileOut);

          for (const file of fileOut.rows) {
            await this.handleDocumentLearning(file);
          }
        }
      } catch (err: unknown) {
        this.logger?.error?.('Document learning tick error', { error: err instanceof Error ? err.message : String(err) });
      }
    };

    await tick();
    this.documentLearningTimer = setInterval(tick, 60000);
  }

  private async startConversationLearning(): Promise<void> {
    if (this.evalScheduleRunning) return;
    const scheduleInput = Object.assign(new StartEvalScheduleInput(), {});
    const scheduleOutput = Object.assign(new StartEvalScheduleOutput(), {});
    await this.evolutorAgent.startEvalSchedule(scheduleInput, new EvolutorAgentContext(), scheduleOutput);
    this.evalScheduleRunning = true;
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

    const twentyFourHrs = 24 * 60 * 60 * 1000;
    this.tagAgingTimer = setInterval(() => {
      this.startTagAging().catch((err) => {
        this.logger?.error?.('Tag aging error', { error: err instanceof Error ? err.message : String(err) });
      });
    }, twentyFourHrs);

    this.orphanTagTimer = setInterval(() => {
      this.startOrphanTagCheck().catch((err) => {
        this.logger?.error?.('Orphan tag check error', { error: err instanceof Error ? err.message : String(err) });
      });
    }, twentyFourHrs);

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

  async stopLearning(
    input: StopLearningInput,
    _context: SelfLearningContext,
    _output: StopLearningOutput,
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
        await this.evolutorAgent.stopEvalSchedule(stopInput, new EvolutorAgentContext(), stopOutput);
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
    const now = IdGenerator.now();

    try {
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch (err: unknown) {
        await this.updateFileStatus(fileId, 'FAILED', `Cannot read file: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      const sessionId = await this.ensureSelfLearningSession();

      const config = await this.getConfig();
      const splitThreshold = (config.document_split_threshold as number) ?? 5000;

      let chunks: string[];
      if (content.length > splitThreshold) {
        chunks = this.splitByHeaders(content);
        if (chunks.length <= 1) {
          chunks = this.splitBySize(content, splitThreshold);
        }
      } else {
        chunks = [content];
      }

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed) continue;

        const strategy = trimmed.length >= splitThreshold ? 'PLANNING' : 'SIMPLE';

        const recvInput = Object.assign(new ReceiveWorkAsyncInput(), {
          session_id: sessionId,
          user_input: trimmed,
          orchestration_strategy: strategy,
        });
        const recvOutput = Object.assign(new ReceiveWorkAsyncOutput(), {});
        await this.orchestrationEntry.receiveWorkAsync(recvInput, new OrchestrationEntryContext(), recvOutput);

        const saveInput = Object.assign(new SaveInfoInput(), {
          session_id: sessionId,
          work_id: recvOutput.work_id || '',
          interact_id: '',
          info_creator_id: 'self_learning',
          info_creator_role: 'system',
          info: trimmed,
        });
        const saveOutput = Object.assign(new SaveInfoOutput(), {});
        await this.infoCore.saveInfo(saveInput, new InfoCoreContext(), saveOutput);
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
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    if (!selOutput.row) {
      const now = IdGenerator.now();
      await this.relationDb.insert('chat_session', [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'session_id', value: sessionId },
        { field: 'session_name', value: 'Self Learning' },
        { field: 'is_active', value: 1 },
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
    await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
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

  async startTagConnectionEstablishment(): Promise<void> {
    try {
      const now = IdGenerator.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

      const selInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'info_tag',
          conditions: [
            { field: 'created', operator: Operator.GE, value: twentyFourHoursAgo },
          ] as Condition[],
        },
      });
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
        new DBContext(),
        selOutput,
      );

      let count = 0;
      for (const row of selOutput.rows) {
        const tagId = row.id as string;
        const tagName = row.tag as string;
        if (!tagId || !tagName) continue;
        try {
          const graphInput = Object.assign(new GraphTagInput(), { tag_id: tagId });
          const graphOutput = Object.assign(new GraphTagOutput(), {});
          await this.infoCore.graphTag(graphInput, new InfoCoreContext(), graphOutput);
          count++;
        } catch {
          // skip failed graph tags
        }
      }

      if (count > 0) {
        await this.insertLearningResult('TAG_MAINTENANCE', 'connection', `Connected ${count} recent tags to graph`, null);
      }
    } catch (err: unknown) {
      this.logger?.error?.('startTagConnectionEstablishment error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // startTagActivation
  // ─────────────────────────────────────────────────────────────────────────

  async startTagActivation(): Promise<void> {
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
        new DBContext(),
        selOutput,
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
        new GraphContext(),
        graphSelOutput,
      );

      let activatedCount = 0;
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
        await this.graphDBAccess.getGraphNeighbors(neighborInput, new GraphContext(), neighbors);

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
              new GraphContext(),
              Object.assign(new ActivateGraphEdgeOutput(), {}),
            );
            activatedCount++;
          } catch {
            // skip
          }
        }
      }

      if (activatedCount > 0) {
        await this.insertLearningResult('TAG_MAINTENANCE', 'activation', `Activated ${activatedCount} graph edges`, null);
      }
    } catch (err: unknown) {
      this.logger?.error?.('startTagActivation error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // startTagAging
  // ─────────────────────────────────────────────────────────────────────────

  async startTagAging(): Promise<void> {
    try {
      const ageInput = Object.assign(new AgeGraphEdgeInput(), {});
      const ageOutput = Object.assign(new AgeGraphEdgeOutput(), {});
      await this.graphDBAccess.ageGraphEdge(ageInput, new GraphContext(), ageOutput);

      if (ageOutput.aged_count > 0) {
        await this.insertLearningResult('TAG_MAINTENANCE', 'aging', `Aged ${ageOutput.aged_count} graph edges`, null);
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
        new GraphContext(),
        graphSelOutput,
      );

      let orphanCount = 0;
      for (const node of graphSelOutput.list) {
        if (!('node_type' in node)) continue;
        const neighbors = Object.assign(new GetGraphNeighborsOutput(), {});
        const neighborInput = Object.assign(new GetGraphNeighborsInput(), {
          node_id: node.id,
          direction: GraphDirection.BOTH,
        });
        await this.graphDBAccess.getGraphNeighbors(neighborInput, new GraphContext(), neighbors);

        if (neighbors.list.length === 0) {
          try {
            const content = (node as any).content as Record<string, unknown> | undefined;
            const tagName = content?.tag as string | undefined;
            if (tagName) {
              const graphTagInput = Object.assign(new GraphTagInput(), { tag_id: node.id });
              const graphTagOutput = Object.assign(new GraphTagOutput(), {});
              await this.infoCore.graphTag(graphTagInput, new InfoCoreContext(), graphTagOutput);
              orphanCount++;
            }
          } catch {
            // skip
          }
        }
      }

      if (orphanCount > 0) {
        await this.insertLearningResult('TAG_MAINTENANCE', 'orphan', `Reconnected ${orphanCount} orphan tags`, null);
      }
    } catch (err: unknown) {
      this.logger?.error?.('startOrphanTagCheck error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getTagGraph
  // ─────────────────────────────────────────────────────────────────────────

  async getTagGraph(
    input: GetTagGraphInput,
    _context: SelfLearningContext,
    output: GetTagGraphOutput,
  ): Promise<boolean> {
    const graphSelOutput = Object.assign(new SelectGraphOutput(), {});
    await this.graphDBAccess.selectGraph(
      Object.assign(new SelectGraphInput(), {
        target: GraphTarget.NODE,
        node_type: 'Tag',
      }),
      new GraphContext(),
      graphSelOutput,
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
      await this.graphDBAccess.getGraphNeighbors(neighborInput, new GraphContext(), neighbors);

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
  // getTagRelatedInfo
  // ─────────────────────────────────────────────────────────────────────────

  async getTagRelatedInfo(
    input: GetTagRelatedInfoInput,
    _context: SelfLearningContext,
    output: GetTagRelatedInfoOutput,
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
    await this.relationDb.selectOneDB(tagSel, new DBContext(), tagRow);

    let tagName: string | undefined;
    if (tagRow.row) {
      tagName = tagRow.row.tag as string | undefined;
    }

    const lastNInput = Object.assign(new LastNInfoInput(), {
      lastN: pageSize,
    });
    const lastNOutput = Object.assign(new LastNInfoOutput(), {});
    await this.infoCore.lastNInfo(lastNInput, new InfoCoreContext(), lastNOutput);

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
        new DBContext(),
        infoTagRows,
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
          new DBContext(),
          summaryRow,
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
  // getLearningProgress
  // ─────────────────────────────────────────────────────────────────────────

  async getLearningProgress(
    _input: GetLearningProgressInput,
    _context: SelfLearningContext,
    output: GetLearningProgressOutput,
  ): Promise<boolean> {
    const runningSel = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(
      Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'self_learning_task',
          conditions: [
            { field: 'status', operator: Operator.EQ, value: 'RUNNING' },
          ] as Condition[],
        },
      }),
      new DBContext(),
      runningSel,
    );
    output.current_task = runningSel.row;

    const pendingSel = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(
      Object.assign(new SelectDBInput(), {
        query_param: {
          table: 'self_learning_task',
          conditions: [
            { field: 'status', operator: Operator.EQ, value: 'PENDING' },
          ] as Condition[],
          order_by: [{ field: 'created', direction: 'ASC' }],
        },
      }),
      new DBContext(),
      pendingSel,
    );
    output.task_queue = pendingSel.rows;

    const builtinSel = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(
      Object.assign(new SelectDBInput(), {
        query_param: {
          table: 'self_learning_builtin_task',
        },
      }),
      new DBContext(),
      builtinSel,
    );
    output.builtin_tasks = builtinSel.rows;

    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getLearningResults
  // ─────────────────────────────────────────────────────────────────────────

  async getLearningResults(
    input: GetLearningResultsInput,
    _context: SelfLearningContext,
    output: GetLearningResultsOutput,
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
    await this.relationDb.countDB(countInput, new DBContext(), countOutput);

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'self_learning_result',
        conditions,
        page: { current: pageCurrent, size: pageSize },
        order_by: [{ field: 'learned_at', direction: 'DESC' }],
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, new DBContext(), selOutput);

    const results: Array<Record<string, unknown>> = [];
    for (const row of selOutput.rows) {
      const resultId = row.result_id as string | undefined;
      const tags: string[] = [];
      if (resultId) {
        const tagRows = Object.assign(new SelectDBOutput(), {});
        await this.relationDb.selectDB(
          Object.assign(new SelectDBInput(), {
            query_param: {
              table: 'self_learning_result_tag',
              conditions: [
                { field: 'result_id', operator: Operator.EQ, value: resultId },
              ] as Condition[],
            },
          }),
          new DBContext(),
          tagRows,
        );
        for (const tr of tagRows.rows) {
          if (tr.tag) tags.push(tr.tag as string);
        }
      }
      results.push({ ...row, tags });
    }

    output.results = results;
    output.total = countOutput.count;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // getLearningStats
  // ─────────────────────────────────────────────────────────────────────────

  async getLearningStats(
    _input: GetLearningStatsInput,
    _context: SelfLearningContext,
    output: GetLearningStatsOutput,
  ): Promise<boolean> {
    const now = IdGenerator.now();

    const totalResults = await this.relationDb.count('self_learning_result');
    const totalKnowledgeCount = await this.relationDb.count('self_learning_result', [
      { field: 'type', operator: Operator.EQ, value: 'KNOWLEDGE' },
    ]);
    const totalInsightCount = await this.relationDb.count('self_learning_result', [
      { field: 'type', operator: Operator.EQ, value: 'INSIGHT' },
    ]);
    const thisWeekStart = now - 7 * 24 * 60 * 60 * 1000;
    const thisWeekLearningCount = await this.relationDb.count('self_learning_result', [
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

    let totalTagNodes = 0;
    let totalTagEdges = 0;
    let activeEdges = 0;
    let orphanTags = 0;
    let agedEdgesThisWeek = 0;
    let newEdgesThisWeek = 0;

    try {
      const graphNodes = Object.assign(new SelectGraphOutput(), {});
      await this.graphDBAccess.selectGraph(
        Object.assign(new SelectGraphInput(), {
          target: GraphTarget.NODE,
          node_type: 'Tag',
        }),
        new GraphContext(),
        graphNodes,
      );
      totalTagNodes = graphNodes.list.length;

      const nodeNeighborMap = new Map<string, number>();
      for (const node of graphNodes.list) {
        if (!('node_type' in node)) continue;
        const neighbors = Object.assign(new GetGraphNeighborsOutput(), {});
        await this.graphDBAccess.getGraphNeighbors(
          Object.assign(new GetGraphNeighborsInput(), {
            node_id: node.id,
            direction: GraphDirection.BOTH,
          }),
          new GraphContext(),
          neighbors,
        );
        nodeNeighborMap.set(node.id, neighbors.list.length);
      }
      orphanTags = Array.from(nodeNeighborMap.values()).filter((c) => c === 0).length;

      const graphEdges = Object.assign(new SelectGraphOutput(), {});
      await this.graphDBAccess.selectGraph(
        Object.assign(new SelectGraphInput(), {
          target: GraphTarget.EDGE,
        }),
        new GraphContext(),
        graphEdges,
      );
      totalTagEdges = graphEdges.list.length;

      for (const edge of graphEdges.list) {
        if (!('node_type' in edge)) continue;
        const e = (edge as any);
        if (e.is_active === true || e.is_active === 1) {
          activeEdges++;
        }
        if (e.last_aged_at && (e.last_aged_at as number) >= thisWeekStart) {
          agedEdgesThisWeek++;
        }
        if (e.created && (e.created as number) >= thisWeekStart) {
          newEdgesThisWeek++;
        }
      }
    } catch {
      /* graph DB might not have Tag nodes yet */
    }

    const trend: Array<Record<string, unknown>> = [];
    for (let day = 6; day >= 0; day--) {
      const dayStart = now - (day + 1) * 24 * 60 * 60 * 1000;
      const dayEnd = now - day * 24 * 60 * 60 * 1000;
      const count = await this.relationDb.count('self_learning_result', [
        { field: 'learned_at', operator: Operator.GE, value: dayStart },
        { field: 'learned_at', operator: Operator.LT, value: dayEnd },
      ]);
      trend.push({
        date: new Date(dayEnd).toISOString().split('T')[0],
        count,
      });
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
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // configSelfLearning
  // ─────────────────────────────────────────────────────────────────────────

  async configSelfLearning(
    input: ConfigSelfLearningInput,
    _context: SelfLearningContext,
    output: ConfigSelfLearningOutput,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'self_learning_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);

    const current = (selOutput.row ?? {}) as Record<string, unknown>;
    const configId = (current.id as string) || 'self_learning_config_default';

    const data: DataObject[] = [
      { field: 'id', value: configId },
      { field: 'updated', value: IdGenerator.now() },
    ];

    const fields: Array<keyof ConfigSelfLearningInput> = [
      'random_factor', 'document_weight', 'conversation_weight',
      'tag_maintenance_weight', 'learning_interval_ms', 'default_learning_rate',
      'tag_connection_check_interval_ms', 'tag_aging_cron',
      'orphan_tag_check_cron', 'document_split_threshold',
    ];

    for (const field of fields) {
      if (input[field] !== undefined) {
        data.push({ field, value: input[field] });
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
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
    }

    const refreshed = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(
      Object.assign(new SelectOneDBInput(), { query_param: { table: 'self_learning_config' } }),
      new DBContext(),
      refreshed,
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
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
    return (selOutput.row ?? {}) as Record<string, unknown>;
  }
}
