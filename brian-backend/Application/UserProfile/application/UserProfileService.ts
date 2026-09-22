import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator, Operator, Direction, ValidationError, ExecLLMInput, ExecLLMOutput, LLMContext, ExecPromptInput, ExecPromptOutput, PromptContext, SoPromptInput, SoPromptOutput, JsonParser, type DataObject } from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import {
  LastNInfoInput, LastNInfoOutput, RelationKInfoInput, RelationKInfoOutput, InfoCoreContext,
  SoCitationEdgesInput, SoCitationEdgesOutput,
} from '@brian-agent/core';
import { MatchLLMInput, MatchLLMOutput, RecordLLMUsageInput, RecordLLMUsageOutput, LLMCoreContext } from '@brian-agent/core';
import type { WriterAgentAccess } from '@brian-agent/agent';
import {
  SaveUserProfileInput, SaveUserProfileOutput, GetUserProfileInput as WriterGetUserProfileInput,
  GetUserProfileOutput as WriterGetUserProfileOutput,
  WriterAgentContext,
} from '@brian-agent/agent';
import type { EvolutorAgentAccess } from '@brian-agent/agent';
import { GetEvaluationInput, GetEvaluationOutput } from '@brian-agent/agent';
import { EvolutorAgentContext } from '@brian-agent/agent';
import {
  USER_PROFILE_DIRECTION_TABLE, USER_PROFILE_RECORD_TABLE,
  USER_PROFILE_DIMENSION_DATA_TABLE, USER_PROFILE_CONFIG_TABLE,
  UserProfileContext,
  ConfigProfileDirectionInput, ConfigProfileDirectionOutput,
  DeleteProfileDirectionInput, DeleteProfileDirectionOutput,
  GetProfileDirectionInput, GetProfileDirectionOutput,
  GetUserProfileInput, GetUserProfileOutput,
  GenerateProfileInput, GenerateProfileOutput,
  SaveUserPreferenceInput, SaveUserPreferenceOutput,
  GetProfileHistoryInput, GetProfileHistoryOutput,
  GetProfileByVersionInput, GetProfileByVersionOutput,
  ResetUserProfileInput, ResetUserProfileOutput,
  ConfigUserProfileInput, ConfigUserProfileOutput,
} from '../domain/types';

export class UserProfileService {
  /** 自动生成画像的定时器 */
  private autoGenerateTimer: ReturnType<typeof setInterval> | null = null;

  /** 是否正在执行自动生成（避免并发重入） */
  private autoGenerating = false;

  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly writerAgent: WriterAgentAccess,
    private readonly evolutorAgent: EvolutorAgentAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly llmCore: LLMCoreAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly logger?: { error?: (msg: string, meta?: Record<string, unknown>) => void },
  ) {}

  async configProfileDirection(input: ConfigProfileDirectionInput, _output: ConfigProfileDirectionOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    for (const dir of input.directions) {
      const existing = await this.relationDb.selectOne(USER_PROFILE_DIRECTION_TABLE, [
        { field: 'direction_key', operator: Operator.EQ, value: dir.direction_key },
      ]);
      const now = IdGenerator.now();
      if (existing) {
        const data: DataObject[] = [
          { field: 'direction_name', value: dir.direction_name },
          { field: 'direction_description', value: dir.direction_description ?? '' },
          { field: 'weight', value: dir.weight },
          { field: 'enable', value: dir.enable ? 1 : 0 },
          { field: 'prompt_template_id', value: dir.prompt_template_id ?? (existing.prompt_template_id as string) ?? '' },
          { field: 'llm_temperature', value: dir.llm_temperature ?? (existing.llm_temperature as number) ?? 0.3 },
          { field: 'llm_max_tokens', value: dir.llm_max_tokens ?? (existing.llm_max_tokens as number) ?? 512 },
          { field: 'llm_id', value: dir.llm_id ?? (existing.llm_id as string) ?? '' },
          { field: 'updated', value: now },
        ];
        await this.relationDb.update(USER_PROFILE_DIRECTION_TABLE, data, [
          { field: 'direction_key', operator: Operator.EQ, value: dir.direction_key },
        ]);
      } else {
        await this.relationDb.insert(USER_PROFILE_DIRECTION_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'direction_key', value: dir.direction_key },
          { field: 'direction_name', value: dir.direction_name },
          { field: 'direction_description', value: dir.direction_description ?? '' },
          { field: 'weight', value: dir.weight },
          { field: 'enable', value: dir.enable ? 1 : 0 },
          { field: 'prompt_template_id', value: dir.prompt_template_id ?? '' },
          { field: 'llm_temperature', value: dir.llm_temperature ?? 0.3 },
          { field: 'llm_max_tokens', value: dir.llm_max_tokens ?? 512 },
          { field: 'llm_id', value: dir.llm_id ?? '' },
        ]);
      }
    }
    return true;
  }

  async deleteProfileDirection(input: DeleteProfileDirectionInput, _output: DeleteProfileDirectionOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    await this.relationDb.delete(USER_PROFILE_DIRECTION_TABLE, [
      { field: 'direction_key', operator: Operator.EQ, value: input.direction_key },
    ]);
    return true;
  }

  async soProfileDirection(_input: GetProfileDirectionInput, output: GetProfileDirectionOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const rows = await this.queryTable(USER_PROFILE_DIRECTION_TABLE, [], [
      { field: 'weight', direction: Direction.DESC },
    ]);
    output.directions = rows;
    return true;
  }

  async soUserProfile(input: GetUserProfileInput, output: GetUserProfileOutput, _ctx: UserProfileContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const sessionId = input.session_id;
    output.session_id = sessionId;

    let writerPreferences: { language: string; style: string; depth: string; format: string; additional_preferences: string } | null = null;
    if (sessionId) {
      try {
        const wo = new WriterGetUserProfileOutput();
        await this.writerAgent.soUserProfile(
          Object.assign(new WriterGetUserProfileInput(), { session_id: sessionId }),
          wo,
          new WriterAgentContext(),
        );
        writerPreferences = wo.user_profile;
      } catch (err) {
        /* best-effort */
        metrics?.warn('UserProfileService.soUserProfile 读取 writer 偏好失败（best-effort，画像继续）', {
          error: err instanceof Error ? err.message : String(err),
          session_id: sessionId,
        });
      }
    }

    let latestRecord: Record<string, unknown> | null = null;
    try {
      const conditions = sessionId
        ? [{ field: 'session_id', operator: Operator.EQ, value: sessionId }]
        : [];
      const allConds = [...conditions];
      const recs = await this.relationDb.select(USER_PROFILE_RECORD_TABLE, {
        conditions: allConds,
        order_by: [{ field: 'version', direction: Direction.DESC }],
        page: { current: 1, size: 1 },
      });
      if (recs.length > 0) latestRecord = recs[0];
    } catch { /* best-effort */ }

    const enabledDirs = await this.queryTable(USER_PROFILE_DIRECTION_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ], [{ field: 'weight', direction: Direction.DESC }]);

    const dimensions: Record<string, unknown> = {};
    const now = IdGenerator.now();

    // 读取最低置信度阈值，与 soProfileByVersion 保持一致，过滤低置信度维度
    const profileConfig = await this.getConfig();
    const minConfidence = Number(profileConfig.min_confidence_threshold ?? 0.5);

    // 前一个已生成版本的维度数据，用于计算每个维度的稳定性（stable/drifting/emerging）
    const prevVersionDimensions = await this.loadPrevVersionDimensions(sessionId, latestRecord);

    // 最新版本已生成的 LLM 分析维度（与 generateProfile / soProfileByVersion 同一数据源）
    const storedDimensions = latestRecord
      ? await this.loadStoredDimensions(String(latestRecord.id))
      : {};

    for (const dir of enabledDirs) {
      const key = String(dir.direction_key);
      try {
        let result: { value: unknown; confidence: number; evidence: Array<Record<string, unknown>> };
        if (storedDimensions[key]) {
          // 优先使用已生成的 LLM 分析维度，保证与配置/版本详情一致
          result = storedDimensions[key];
        } else {
          // 未生成画像或该维度未被分析时，实时聚合作为初略画像
          result = await this.aggregateDimension(key, sessionId, writerPreferences, latestRecord, metrics);
        }
        if (result.confidence < minConfidence) continue;
        (result as Record<string, unknown>).stability = this.determineStability(key, result.value, prevVersionDimensions);
        (result as Record<string, unknown>).direction_key = key;
        (result as Record<string, unknown>).direction_name = String(dir.direction_name);
        dimensions[key] = result;
      } catch (err) {
        // skip failed dimensions
        metrics?.warn('UserProfileService.soUserProfile 维度实时聚合失败（跳过该维度）', {
          error: err instanceof Error ? err.message : String(err),
          direction_key: key,
        });
      }
    }

    let profileSummary = '';
    if (latestRecord?.profile_summary) {
      profileSummary = String(latestRecord.profile_summary);
    } else {
      profileSummary = this.buildFallbackSummary(dimensions, writerPreferences);
    }

    const trendRows = await this.queryTable(USER_PROFILE_RECORD_TABLE,
      sessionId
        ? [{ field: 'session_id', operator: Operator.EQ, value: sessionId }]
        : [],
      [{ field: 'version', direction: Direction.DESC }],
      undefined,
      20,
    );
    const evolutionTrend = trendRows.map((r) => ({
      version: Number(r.version),
      generated_at: Number(r.generated_at),
      profile_summary: String(r.profile_summary ?? ''),
      change_summary: String(r.change_summary ?? ''),
    }));

    output.profile_version = latestRecord ? Number(latestRecord.version) : 0;
    output.generated_at = latestRecord ? Number(latestRecord.generated_at) : now;
    output.dimensions = dimensions;
    output.profile_summary = profileSummary;
    output.evolution_trend = evolutionTrend;
    return true;
  }

  async generateProfile(input: GenerateProfileInput, output: GenerateProfileOutput, _ctx: UserProfileContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const sessionId = input.session_id;
    const config = await this.getConfig();

    let currentMaxVersion = 0;
    const maxRows = await this.relationDb.select(USER_PROFILE_RECORD_TABLE, {
      order_by: [{ field: 'version', direction: Direction.DESC }],
      page: { current: 1, size: 1 },
    });
    const maxRow = maxRows.length > 0 ? maxRows[0] : null;
    if (maxRow) {
      currentMaxVersion = Number(maxRow.version);
    }
    const newVersion = currentMaxVersion + 1;

    const maxSampleCount = Number(config.max_conversation_sample_count ?? 500);
    const lastNOut = new LastNInfoOutput();
    try {
      await this.infoCore.lastNInfo(
        Object.assign(new LastNInfoInput(), {
          session_id: sessionId,
          lastN: maxSampleCount,
        }),
        lastNOut,
        new InfoCoreContext(),
      );
    } catch { /* best-effort */ }

    const conversationText = (lastNOut.list ?? [])
      .map((r) => `${r.info_type}: ${r.info}`)
      .join('\n');

    const targetDirs = input.directions && input.directions.length > 0
      ? input.directions
      : null;

    const enabledDirs = await this.queryTable(USER_PROFILE_DIRECTION_TABLE, [
      { field: 'enable', operator: Operator.EQ, value: 1 },
    ], [{ field: 'weight', direction: Direction.DESC }]);

    const filteredDirs = targetDirs
      ? enabledDirs.filter((d) => targetDirs.includes(String(d.direction_key)))
      : enabledDirs;

    const dimensionData: Array<{ direction_key: string; value: string; evidence: string; confidence: number }> = [];

    for (const dir of filteredDirs) {
      const key = String(dir.direction_key);
      const name = String(dir.direction_name);
      try {
        const analysis = await this.analyzeDimensionWithLLM(
          key, name, conversationText, dir, config, metrics,
        );
        dimensionData.push({
          direction_key: key,
          value: JSON.stringify(analysis.value ?? null),
          evidence: JSON.stringify(analysis.evidence ?? []),
          confidence: analysis.confidence ?? 0,
        });
      } catch {
        dimensionData.push({
          direction_key: key,
          value: JSON.stringify(null),
          evidence: JSON.stringify([]),
          confidence: 0,
        });
      }
    }

    const summary = this.buildSummaryFromDimensions(dimensionData, enabledDirs);

    const now = IdGenerator.now();
    const recordId = IdGenerator.generate();
    await this.relationDb.insert(USER_PROFILE_RECORD_TABLE, [
      { field: 'id', value: recordId },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'session_id', value: sessionId ?? '' },
      { field: 'version', value: newVersion },
      { field: 'profile_summary', value: summary },
      { field: 'generated_at', value: now },
      { field: 'change_summary', value: newVersion === 1 ? 'Initial profile' : `Profile version ${newVersion}` },
    ]);

    for (const d of dimensionData) {
      await this.relationDb.insert(USER_PROFILE_DIMENSION_DATA_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'profile_record_id', value: recordId },
        { field: 'direction_key', value: d.direction_key },
        { field: 'dimension_value', value: d.value },
        { field: 'evidence', value: d.evidence },
        { field: 'confidence', value: d.confidence },
      ]);
    }

    if (sessionId) {
      try {
        const saveOut = new SaveUserProfileOutput();
        await this.writerAgent.saveUserProfile(
          Object.assign(new SaveUserProfileInput(), { session_id: sessionId }),
          saveOut,
          new WriterAgentContext(),
        );
      } catch (err) {
        /* best-effort */
        metrics?.warn('UserProfileService.generateProfile 写回 writer 画像失败（best-effort）', {
          error: err instanceof Error ? err.message : String(err),
          session_id: sessionId,
        });
      }
    }

    await this.cleanupOldVersions(Number(config.profile_retention_versions ?? 20), sessionId, metrics);

    const profile: Record<string, unknown> = {};
    for (const d of dimensionData) {
      let parsed: unknown = null;
      try { parsed = JSON.parse(d.value); } catch { parsed = d.value; }
      profile[d.direction_key] = { value: parsed, confidence: d.confidence };
    }

    output.profile = {
      version: newVersion,
      generated_at: now,
      session_id: sessionId,
      dimensions: profile,
      profile_summary: summary,
    };
    return true;
  }

  async saveUserPreference(input: SaveUserPreferenceInput, _output: SaveUserPreferenceOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.session_id) {
      throw new ValidationError('session_id is required');
    }

    if (input.additional_preferences && input.additional_preferences.length > 10000) {
      throw new ValidationError('additional_preferences exceeds maximum length of 10000 characters');
    }

    const VALID_STYLES = ['clear', 'concise', 'detailed', 'creative'];
    const VALID_DEPTHS = ['shallow', 'medium', 'deep'];
    const VALID_FORMATS = ['TEXT', 'MARKDOWN', 'JSON'];
    const VALID_LANGUAGES = ['zh-CN', 'en-US'];

    if (input.language && !VALID_LANGUAGES.includes(input.language)) {
      throw new ValidationError(`Invalid language "${input.language}". Valid values: ${VALID_LANGUAGES.join(', ')}`);
    }
    if (input.style && !VALID_STYLES.includes(input.style)) {
      throw new ValidationError(`Invalid style "${input.style}". Valid values: ${VALID_STYLES.join(', ')}`);
    }
    if (input.depth && !VALID_DEPTHS.includes(input.depth)) {
      throw new ValidationError(`Invalid depth "${input.depth}". Valid values: ${VALID_DEPTHS.join(', ')}`);
    }
    if (input.format && !VALID_FORMATS.includes(input.format)) {
      throw new ValidationError(`Invalid format "${input.format}". Valid values: ${VALID_FORMATS.join(', ')}`);
    }

    const saveOut = new SaveUserProfileOutput();
    await this.writerAgent.saveUserProfile(
      Object.assign(new SaveUserProfileInput(), {
        session_id: input.session_id,
        language: input.language,
        style: input.style,
        depth: input.depth,
        format: input.format,
        additional_preferences: input.additional_preferences,
      }),
      saveOut,
      new WriterAgentContext(),
    );
    return true;
  }

  async soProfileHistory(input: GetProfileHistoryInput, output: GetProfileHistoryOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const limit = input.limit ?? 20;
    const conditions = input.session_id
      ? [{ field: 'session_id', operator: Operator.EQ, value: input.session_id }]
      : [];
    const rows = await this.queryTable(
      USER_PROFILE_RECORD_TABLE,
      conditions,
      [{ field: 'version', direction: Direction.DESC }],
      limit,
    );
    output.history = rows.map((r) => ({
      id: r.id,
      version: Number(r.version),
      session_id: String(r.session_id ?? ''),
      generated_at: Number(r.generated_at),
      profile_summary: String(r.profile_summary ?? ''),
      change_summary: String(r.change_summary ?? ''),
    }));
    return true;
  }

  async soProfileByVersion(input: GetProfileByVersionInput, output: GetProfileByVersionOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conditions = input.session_id
      ? [
        { field: 'version', operator: Operator.EQ, value: input.version },
        { field: 'session_id', operator: Operator.EQ, value: input.session_id },
      ]
      : [{ field: 'version', operator: Operator.EQ, value: input.version }];

    const record = await this.relationDb.selectOne(USER_PROFILE_RECORD_TABLE, conditions);
    if (!record) {
      throw Object.assign(new Error(`Profile version ${input.version} not found`), { error_code: 'NOT_FOUND' });
    }

    const dimRows = await this.queryTable(USER_PROFILE_DIMENSION_DATA_TABLE, [
      { field: 'profile_record_id', operator: Operator.EQ, value: record.id },
    ]);

    const config = await this.getConfig();
    const minConfidence = Number(config.min_confidence_threshold ?? 0.5);

    const dirRows = await this.queryTable(USER_PROFILE_DIRECTION_TABLE, []);
    const dirNameMap: Record<string, string> = {};
    for (const d of dirRows) {
      dirNameMap[String(d.direction_key)] = String(d.direction_name);
    }

    const dimensions: Record<string, unknown> = {};
    for (const d of dimRows) {
      const key = String(d.direction_key);
      const confidence = Number(d.confidence);
      if (confidence < minConfidence) continue;
      let value: unknown = null;
      let evidence: unknown = [];
      try { value = JSON.parse(String(d.dimension_value ?? 'null')); } catch { value = d.dimension_value; }
      try { evidence = JSON.parse(String(d.evidence ?? '[]')); } catch { evidence = d.evidence; }
      dimensions[key] = {
        value,
        evidence,
        confidence,
        direction_key: key,
        direction_name: dirNameMap[key] || key,
      };
    }

    output.profile = {
      version: Number(record.version),
      generated_at: Number(record.generated_at),
      session_id: String(record.session_id ?? ''),
      dimensions,
      profile_summary: String(record.profile_summary ?? ''),
    };
    return true;
  }

  async resetUserProfile(input: ResetUserProfileInput, output: ResetUserProfileOutput, _ctx: UserProfileContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conditions = input.session_id
      ? [{ field: 'session_id', operator: Operator.EQ, value: input.session_id }]
      : [];

    const records = await this.queryTable(USER_PROFILE_RECORD_TABLE, conditions);
    const recordIds = records.map((r) => String(r.id));

    let deleted = 0;
    for (const recordId of recordIds) {
      await this.relationDb.delete(USER_PROFILE_DIMENSION_DATA_TABLE, [
        { field: 'profile_record_id', operator: Operator.EQ, value: recordId },
      ]);
      deleted += 1;
    }

    await this.relationDb.delete(USER_PROFILE_RECORD_TABLE, conditions);

    output.reset_count = deleted;
    return true;
  }

  async configUserProfile(input: ConfigUserProfileInput, output: ConfigUserProfileOutput, _ctx: UserProfileContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    let config = await this.getConfigRecord();
    const now = IdGenerator.now();

    if (!config) {
      await this.relationDb.insert(USER_PROFILE_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'auto_generate_interval_ms', value: 86400000 },
        { field: 'profile_analysis_prompt_template_id', value: '' },
        { field: 'max_conversation_sample_count', value: 500 },
        { field: 'profile_retention_versions', value: 20 },
        { field: 'min_confidence_threshold', value: 0.5 },
      ]);
      config = await this.getConfigRecord();
    }

    if (!config) throw new ValidationError('config init failed');

    const data: DataObject[] = [];
    if (input.auto_generate_interval_ms !== undefined) {
      if (input.auto_generate_interval_ms <= 0) throw new ValidationError('auto_generate_interval_ms must be positive');
      data.push({ field: 'auto_generate_interval_ms', value: input.auto_generate_interval_ms });
    }
    if (input.profile_analysis_prompt_template_id !== undefined) data.push({ field: 'profile_analysis_prompt_template_id', value: input.profile_analysis_prompt_template_id });
    if (input.max_conversation_sample_count !== undefined) {
      if (input.max_conversation_sample_count <= 0) throw new ValidationError('max_conversation_sample_count must be positive');
      data.push({ field: 'max_conversation_sample_count', value: input.max_conversation_sample_count });
    }
    if (input.profile_retention_versions !== undefined) {
      if (input.profile_retention_versions <= 0) throw new ValidationError('profile_retention_versions must be positive');
      data.push({ field: 'profile_retention_versions', value: input.profile_retention_versions });
    }
    if (input.min_confidence_threshold !== undefined) {
      if (input.min_confidence_threshold < 0 || input.min_confidence_threshold > 1) throw new ValidationError('min_confidence_threshold must be between 0 and 1');
      data.push({ field: 'min_confidence_threshold', value: input.min_confidence_threshold });
    }

    if (data.length > 0) {
      data.push({ field: 'updated', value: now });
      await this.relationDb.update(USER_PROFILE_CONFIG_TABLE, data, [
        { field: 'id', operator: Operator.EQ, value: String(config.id) },
      ]);
    }

    // 自动生成间隔变更时重新调度
    if (input.auto_generate_interval_ms !== undefined) {
      this.scheduleAutoGeneration(metrics);
    }

    output.config = await this.getConfig();
    return true;
  }

  // ---------------------------------------------------------------------------
  // 自动生成画像调度
  // ---------------------------------------------------------------------------

  /** 启动自动生成画像调度（按 auto_generate_interval_ms 间隔周期触发 generateProfile） */
  startAutoGeneration(): void {
    this.scheduleAutoGeneration();
  }

  /** 停止自动生成画像调度 */
  stopAutoGeneration(): void {
    if (this.autoGenerateTimer) {
      clearInterval(this.autoGenerateTimer);
      this.autoGenerateTimer = null;
    }
  }

  /** 读取配置中的 auto_generate_interval_ms 并（重新）调度 */
  private async scheduleAutoGeneration(metrics?: Metrics): Promise<void> {
    this.stopAutoGeneration();
    try {
      const config = await this.getConfig();
      const interval = Number(config.auto_generate_interval_ms ?? 86400000);
      if (interval <= 0) return;

      this.autoGenerateTimer = setInterval(() => {
        this.runAutoGeneration().catch((err: unknown) => {
          this.logger?.error?.('UserProfile auto generation error', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }, interval);
    } catch (err) {
      /* best-effort */
      metrics?.warn('UserProfileService.scheduleAutoGeneration 读取画像配置失败（跳过自动生成调度）', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** 执行一次自动生成（全局画像，无 session 过滤） */
  private async runAutoGeneration(): Promise<void> {
    if (this.autoGenerating) return;
    this.autoGenerating = true;
    try {
      await this.generateProfile(
        Object.assign(new GenerateProfileInput(), { session_id: undefined }),
        new GenerateProfileOutput(),
        new UserProfileContext(),
      );
    } finally {
      this.autoGenerating = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async queryTable(
    table: string,
    conditions: Array<{ field: string; operator: string; value?: unknown }>,
    orderBy?: Array<{ field: string; direction: string }>,
    limitRow?: number,
    offset?: number,
  ): Promise<Array<Record<string, unknown>>> {
    const rows: Array<Record<string, unknown>> = [];
    const conds = [...conditions];
    const sqlParts: string[] = [`SELECT * FROM "${table}"`];
    const params: unknown[] = [];

    if (conds.length > 0) {
      const whereClauses = conds.map((c, i) => {
        params.push(c.value);
        const op = this.sqlOp(String(c.operator));
        return `"${c.field}" ${op} ?${i + 1}`;
      });
      sqlParts.push('WHERE ' + whereClauses.join(' AND '));
    }

    if (orderBy && orderBy.length > 0) {
      const orders = orderBy.map((o) => `"${o.field}" ${o.direction}`);
      sqlParts.push('ORDER BY ' + orders.join(', '));
    }

    if (limitRow !== undefined) {
      sqlParts.push(`LIMIT ?${params.length + 1}`);
      params.push(limitRow);
    }

    if (offset !== undefined) {
      const paramIdx = params.length + 1;
      sqlParts.push(`OFFSET ?${paramIdx}`);
      params.push(offset);
    }

    const sql = sqlParts.join(' ');
    try {
      const result = this.relationDb.queryRaw(sql, params);
      rows.push(...result);
    } catch {
      // fallback to using select
      const { Operator: Op, Direction: Dir } = await import('@brian-agent/base');
      const mappedConditions = conditions.map((c) => ({
        field: c.field,
        operator: c.operator as typeof Op.EQ,
        value: c.value,
      }));
      const mappedOrderBy = orderBy?.map((o) => ({
        field: o.field,
        direction: o.direction as typeof Dir.ASC,
      }));
      const results = await this.relationDb.select(table, {
        conditions: mappedConditions,
        order_by: mappedOrderBy,
        page: limitRow !== undefined ? { current: 1, size: limitRow } : undefined,
      });
      rows.push(...results);
      return rows;
    }

    return rows;
  }

  private sqlOp(op: string): string {
    const map: Record<string, string> = {
      EQ: '=', NE: '!=', GT: '>', LT: '<', GE: '>=', LE: '<=',
      LIKE: 'LIKE', IS_NULL: 'IS NULL', IS_NOT_NULL: 'IS NOT NULL',
    };
    return map[op] ?? '=';
  }

  private async loadStoredDimensions(
    profileRecordId: string,
  ): Promise<Record<string, { value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }>> {
    const map: Record<string, { value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> = {};
    try {
      const dimRows = await this.queryTable(USER_PROFILE_DIMENSION_DATA_TABLE, [
        { field: 'profile_record_id', operator: Operator.EQ, value: profileRecordId },
      ]);
      for (const d of dimRows) {
        const key = String(d.direction_key);
        let value: unknown = null;
        let evidence: Array<Record<string, unknown>> = [];
        try { value = JSON.parse(String(d.dimension_value ?? 'null')); } catch { value = d.dimension_value; }
        try { evidence = JSON.parse(String(d.evidence ?? '[]')); } catch { evidence = d.evidence as Array<Record<string, unknown>>; }
        map[key] = { value, confidence: Number(d.confidence), evidence };
      }
    } catch { /* ignore */ }
    return map;
  }

  private async loadPrevVersionDimensions(
    sessionId: string | undefined,
    latestRecord: Record<string, unknown> | null,
  ): Promise<Record<string, string> | null> {
    if (!latestRecord) return null;
    try {
      const conditions = sessionId
        ? [{ field: 'session_id', operator: Operator.EQ, value: sessionId }]
        : [];
      const history = await this.queryTable(
        USER_PROFILE_RECORD_TABLE,
        conditions,
        [{ field: 'version', direction: Direction.DESC }],
        20,
      );
      const latestVersion = Number(latestRecord.version);
      const prevRecord = history.find((r) => Number(r.version) < latestVersion);
      if (!prevRecord) return null;
      const dimRows = await this.queryTable(USER_PROFILE_DIMENSION_DATA_TABLE, [
        { field: 'profile_record_id', operator: Operator.EQ, value: prevRecord.id },
      ]);
      const map: Record<string, string> = {};
      for (const d of dimRows) {
        map[String(d.direction_key)] = String(d.dimension_value);
      }
      return map;
    } catch {
      return null;
    }
  }

  private determineStability(
    key: string,
    currentValue: unknown,
    prevVersionDimensions: Record<string, string> | null,
  ): 'stable' | 'drifting' | 'emerging' {
    if (!prevVersionDimensions) return 'emerging';
    if (!(key in prevVersionDimensions)) return 'emerging';
    try {
      const prevValue = JSON.parse(prevVersionDimensions[key]);
      return JSON.stringify(prevValue) === JSON.stringify(currentValue) ? 'stable' : 'drifting';
    } catch {
      return 'drifting';
    }
  }

  private async aggregateDimension(
    key: string,
    sessionId: string | undefined,
    writerPreferences: {
      language: string; style: string; depth: string; format: string; additional_preferences: string;
    } | null,
    latestRecord: Record<string, unknown> | null,
    metrics?: Metrics,
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    switch (key) {
      case 'language_preference':
        return this.aggregateLanguagePreference(sessionId, writerPreferences, metrics);
      case 'reply_style':
        return this.aggregateReplyStyle(writerPreferences);
      case 'knowledge_interest':
        return this.aggregateKnowledgeInterest(sessionId, metrics);
      case 'interaction_habit':
        return this.aggregateInteractionHabit(sessionId, metrics);
      case 'feedback_sensitivity':
        return this.aggregateFeedbackSensitivity();
      default:
        return this.aggregateCustomDimension(key, latestRecord);
    }
  }

  private async aggregateCustomDimension(
    key: string,
    latestRecord: Record<string, unknown> | null,
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    if (!latestRecord?.id) {
      return { value: null, confidence: 0, evidence: [{ source: 'no_generated_data' }] };
    }

    try {
      const dimRows = await this.queryTable(USER_PROFILE_DIMENSION_DATA_TABLE, [
        { field: 'profile_record_id', operator: Operator.EQ, value: latestRecord.id },
        { field: 'direction_key', operator: Operator.EQ, value: key },
      ]);
      if (dimRows.length === 0) {
        return { value: null, confidence: 0, evidence: [{ source: 'no_generated_data' }] };
      }

      const d = dimRows[0];
      let value: unknown = null;
      let evidence: unknown = [];
      try { value = JSON.parse(String(d.dimension_value ?? 'null')); } catch { value = d.dimension_value; }
      try { evidence = JSON.parse(String(d.evidence ?? '[]')); } catch { evidence = d.evidence; }

      const fallbackEvidence = [{ source: 'generated_profile', version: latestRecord.version }];
      const evidenceList = Array.isArray(evidence) && evidence.length > 0
        ? (evidence as Array<Record<string, unknown>>)
        : fallbackEvidence;
      return {
        value,
        confidence: Number(d.confidence),
        evidence: evidenceList,
      };
    } catch {
      return { value: null, confidence: 0, evidence: [{ source: 'error' }] };
    }
  }

  private async aggregateLanguagePreference(
    sessionId: string | undefined,
    writerPreferences: {
      language: string; style: string; depth: string; format: string; additional_preferences: string;
    } | null,
    metrics?: Metrics,
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    const evidence: Array<Record<string, unknown>> = [];
    const value: unknown = writerPreferences?.language ?? 'zh-CN';

    if (writerPreferences?.language) {
      evidence.push({ source: 'writer_agent', type: 'explicit', value: writerPreferences.language });
    }

    if (sessionId) {
      try {
        const out = new LastNInfoOutput();
        await this.infoCore.lastNInfo(
          Object.assign(new LastNInfoInput(), { session_id: sessionId, lastN: 50 }),
          out,
          new InfoCoreContext(),
        );
        if (out.list?.length > 0) {
          const sample = out.list.slice(0, 5).map((r) => r.info).join(' ');
          evidence.push({ source: 'recent_messages', type: 'sample', sample });
        }
      } catch (err) {
        /* best-effort */
        metrics?.warn('UserProfileService.aggregateLanguagePreference 最近消息采样失败（仅用 writer 偏好兜底）', {
          error: err instanceof Error ? err.message : String(err),
          session_id: sessionId,
        });
      }
    }

    const confidence = writerPreferences?.language ? 0.9 : 0.3;
    return { value, confidence, evidence };
  }

  private async aggregateReplyStyle(
    writerPreferences: {
      language: string; style: string; depth: string; format: string; additional_preferences: string;
    } | null,
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    const evidence: Array<Record<string, unknown>> = [];
    const styleValue = {
      style: writerPreferences?.style ?? 'clear',
      depth: writerPreferences?.depth ?? 'medium',
      format: writerPreferences?.format ?? 'MARKDOWN',
    };

    if (writerPreferences) {
      evidence.push({ source: 'writer_agent', type: 'explicit', values: styleValue });
    }

    const confidence = writerPreferences ? 0.85 : 0.2;
    return { value: styleValue, confidence, evidence };
  }

  private async aggregateKnowledgeInterest(
    sessionId: string | undefined,
    metrics?: Metrics,
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    const evidence: Array<Record<string, unknown>> = [];
    let interests: string[] = [];
    let confidence = 0;

    if (sessionId) {
      try {
        const nOut = new LastNInfoOutput();
        await this.infoCore.lastNInfo(
          Object.assign(new LastNInfoInput(), { session_id: sessionId, lastN: 50 }),
          nOut,
          new InfoCoreContext(),
        );
        if (nOut.list?.length > 0) {
          const firstInfoId = nOut.list[0].info_id;
          if (firstInfoId) {
            const rOut = new RelationKInfoOutput();
            await this.infoCore.relationKInfo(
              Object.assign(new RelationKInfoInput(), { info_id: firstInfoId, topN: 10 }),
              rOut,
              new InfoCoreContext(),
            );
            evidence.push({ source: 'relation_k_info', count: rOut.list?.length ?? 0 });
          }
        }
      } catch (err) {
        /* best-effort */
        metrics?.warn('UserProfileService.aggregateKnowledgeInterest 关系召回查询失败（仅用标签统计兜底）', {
          error: err instanceof Error ? err.message : String(err),
          session_id: sessionId,
        });
      }
    }

    try {
      const tagRows = this.relationDb.queryRaw(
        `SELECT it.tag, COUNT(*) as cnt FROM info_tag it
         INNER JOIN info_raw ir ON it.info_id = ir.info_id
         ${sessionId ? "WHERE ir.session_id = ?" : ""}
         GROUP BY it.tag ORDER BY cnt DESC LIMIT 10`,
        sessionId ? [sessionId] : [],
      );
      interests = tagRows.map((r) => String(r.tag));
      if (interests.length > 0) {
        evidence.push({ source: 'tag_statistics', top_tags: interests });
        confidence = Math.min(0.8, interests.length * 0.08);
      }
    } catch { /* best-effort */ }

    return { value: interests, confidence, evidence };
  }

  private async aggregateInteractionHabit(
    sessionId: string | undefined,
    metrics?: Metrics,
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    const evidence: Array<Record<string, unknown>> = [];
    let messageCount = 0;
    let avgLength = 0;
    let citingFrequency = 0;

    if (sessionId) {
      try {
        const countRows = this.relationDb.queryRaw(
          `SELECT COUNT(*) as cnt, AVG(info_length) as avg_len FROM info_raw
           WHERE session_id = ? AND info_type = 'REQUEST'`,
          [sessionId],
        );
        if (countRows.length > 0) {
          messageCount = Number(countRows[0]?.cnt ?? 0);
          avgLength = Math.round(Number(countRows[0]?.avg_len ?? 0));
          evidence.push({ source: 'info_raw', message_count: messageCount, avg_message_length: avgLength });
        }
      } catch { /* best-effort */ }

      try {
        const citeOut = new SoCitationEdgesOutput();
        await this.infoCore.soCitationEdges(Object.assign(new SoCitationEdgesInput(), { session_id: sessionId }), citeOut, new InfoCoreContext());
        citingFrequency = citeOut.edges.length;
        evidence.push({ source: 'graph_citation', citing_count: citingFrequency });
      } catch (err) {
        /* best-effort */
        metrics?.warn('UserProfileService.aggregateInteractionHabit 引用边统计失败（citing_frequency 降级为 0）', {
          error: err instanceof Error ? err.message : String(err),
          session_id: sessionId,
        });
      }
    }

    const habitValue = { message_count: messageCount, avg_message_length: avgLength, citing_frequency: citingFrequency };
    const confidence = messageCount > 0 ? Math.min(0.9, messageCount * 0.01) : 0.1;
    return { value: habitValue, confidence, evidence };
  }

  private async aggregateFeedbackSensitivity(): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    const evidence: Array<Record<string, unknown>> = [];
    let evaluationCount = 0;
    let avgOverall = 0;

    try {
      const evalOut = new GetEvaluationOutput();
      const evalIn = Object.assign(new GetEvaluationInput(), {});
      await this.evolutorAgent.soEvaluation(evalIn, evalOut, new EvolutorAgentContext());
      const evaluations = evalOut.evaluations ?? [];
      evaluationCount = evaluations.length;
      if (evaluationCount > 0) {
        let sumOverall = 0;
        for (const e of evaluations) {
          let scores: Record<string, number> = {};
          try { scores = JSON.parse(String(e.scores ?? '{}')); } catch { /* ignore */ }
          sumOverall += scores.overall ?? 0;
        }
        avgOverall = Math.round((sumOverall / evaluationCount) * 100) / 100;
      }
      evidence.push({ source: 'evolutor_agent', evaluation_count: evaluationCount, avg_overall_score: avgOverall });
    } catch { /* best-effort */ }

    const sensitivityValue = { evaluation_count: evaluationCount, avg_overall_score: avgOverall };
    const confidence = evaluationCount > 0 ? Math.min(0.85, evaluationCount * 0.05) : 0.1;
    return { value: sensitivityValue, confidence, evidence };
  }

  private async getConfig(): Promise<Record<string, unknown>> {
    const row = await this.getConfigRecord();
    if (!row) {
      return {
        auto_generate_interval_ms: 86400000,
        profile_analysis_prompt_template_id: '',
        max_conversation_sample_count: 500,
        profile_retention_versions: 20,
        min_confidence_threshold: 0.5,
      };
    }
    return {
      auto_generate_interval_ms: Number(row.auto_generate_interval_ms ?? 86400000),
      profile_analysis_prompt_template_id: String(row.profile_analysis_prompt_template_id ?? ''),
      max_conversation_sample_count: Number(row.max_conversation_sample_count ?? 500),
      profile_retention_versions: Number(row.profile_retention_versions ?? 20),
      min_confidence_threshold: Number(row.min_confidence_threshold ?? 0.5),
    };
  }

  private async getConfigRecord(): Promise<Record<string, unknown> | null> {
    return this.relationDb.selectOne(USER_PROFILE_CONFIG_TABLE, []);
  }

  private buildFallbackSummary(
    dimensions: Record<string, unknown>,
    writerPreferences: {
      language: string; style: string; depth: string; format: string; additional_preferences: string;
    } | null,
  ): string {
    const parts: string[] = [];
    if (writerPreferences) {
      parts.push(`Language: ${writerPreferences.language}, Style: ${writerPreferences.style}`);
    }
    for (const [key, val] of Object.entries(dimensions)) {
      const v = val as { value?: unknown; confidence?: number } | undefined;
      if (v?.confidence && v.confidence > 0.5 && v.value !== null) {
        parts.push(`${key}: ${JSON.stringify(v.value).slice(0, 80)}`);
      }
    }
    return parts.join('; ') || 'Profile building...';
  }

  private async analyzeDimensionWithLLM(
    directionKey: string,
    directionName: string,
    conversationText: string,
    dirConfig: Record<string, unknown>,
    config: Record<string, unknown>,
    metrics?: Metrics,
  ): Promise<{ value: unknown; confidence: number; evidence: unknown[] }> {
    const templateId = String(dirConfig.prompt_template_id ?? config.profile_analysis_prompt_template_id ?? '');

    const prompt = await this.renderPrompt(
      templateId,
      '用户画像维度分析',
      {
        direction_key: directionKey,
        direction_name: directionName,
        conversation_sample: conversationText.slice(0, 4000),
      },
    );

    try {
      const dirLlmId = String(dirConfig.llm_id ?? '');
      let llmId: string;

      if (dirLlmId) {
        llmId = dirLlmId;
      } else {
        const matchOut = new MatchLLMOutput();
        await this.llmCore.matchLLM(
          Object.assign(new MatchLLMInput(), {
            agent_id: 'user_profile_generation',
            context_id: 'user_profile',
            run_id: IdGenerator.generate(),
          }),
          matchOut,
          new LLMCoreContext(),
        );
        llmId = matchOut.llm_id || '';
      }
      if (!llmId) {
        return { value: this.statisticalFallback(directionKey, conversationText), confidence: 0.2, evidence: [] };
      }

      const temperature = Number(dirConfig.llm_temperature ?? 0.3);
      const maxTokens = Number(dirConfig.llm_max_tokens ?? 512);

      const llmOut = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: llmId,
          prompt,
          temperature,
          max_tokens: maxTokens,
          caller: 'UserProfileService.analyzeDirection',
        }),
        llmOut,
        new LLMContext(),
      );

      try {
        const estimatedTokens = Math.ceil((prompt.length + (llmOut.result?.length ?? 0)) / 4);
        await this.llmCore.recordLLMUsage(
          Object.assign(new RecordLLMUsageInput(), {
            llm_provider_id: 'user_profile_generation',
            tokens_used: estimatedTokens,
            call_count: 1,
          }),
          new RecordLLMUsageOutput(),
          new LLMCoreContext(),
        );
      } catch (err) {
        /* best-effort usage recording */
        metrics?.warn('UserProfileService.analyzeDimensionWithLLM LLM 用量记录失败（跳过记账）', {
          error: err instanceof Error ? err.message : String(err),
          direction_key: directionKey,
        });
      }

      const resultText = llmOut.result || '';
      return this.parseLLMAnalysis(resultText);

    } catch {
      return { value: this.statisticalFallback(directionKey, conversationText), confidence: 0.1, evidence: [] };
    }
  }

  /** 渲染 Prompt：DB（prompt_template 表）模板；缺省按标题动态查找；缺失 fail-loud */
  private async renderPrompt(
    templateId: string | undefined,
    fallbackTitle: string,
    variables: Record<string, unknown>,
  ): Promise<string> {
    let id = templateId;
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

  private parseLLMAnalysis(response: string): { value: unknown; confidence: number; evidence: unknown[] } {
    const parsed = JsonParser.parseObject(response);
    if (parsed) {
      return {
        value: parsed.value ?? null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.3,
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      };
    }

    return { value: response.slice(0, 200), confidence: 0.2, evidence: [] };
  }

  private statisticalFallback(directionKey: string, conversationText: string): unknown {
    if (!conversationText) return null;

    switch (directionKey) {
      case 'interaction_habit': {
        const lines = conversationText.split('\n').filter(Boolean);
        const totalLen = lines.reduce((sum, l) => sum + l.length, 0);
        return {
          message_count: lines.length,
          avg_message_length: lines.length > 0 ? Math.round(totalLen / lines.length) : 0,
        };
      }
      case 'language_preference':
        return 'zh-CN';
      case 'reply_style':
        return { style: 'clear', depth: 'medium', format: 'MARKDOWN' };
      default:
        return null;
    }
  }

  private buildSummaryFromDimensions(
    dimData: Array<{ direction_key: string; value: string; confidence: number }>,
    enabledDirs: Array<Record<string, unknown>>,
  ): string {
    const parts: string[] = [];
    const dirNameMap: Record<string, string> = {};
    for (const d of enabledDirs) {
      dirNameMap[String(d.direction_key)] = String(d.direction_name);
    }

    for (const d of dimData) {
      if (d.confidence >= 0.3) {
        const name = dirNameMap[d.direction_key] || d.direction_key;
        let val: unknown = d.value;
        try { val = JSON.parse(d.value); } catch { /* use raw */ }
        const display = typeof val === 'object' ? JSON.stringify(val).slice(0, 60) : String(val).slice(0, 60);
        parts.push(`${name}: ${display}`);
      }
    }
    return parts.join('; ') || 'Profile generated';
  }

  private async cleanupOldVersions(
    retentionVersions: number,
    sessionId?: string,
    metrics?: Metrics,
  ): Promise<void> {
    try {
      const conditions = sessionId
        ? [{ field: 'session_id', operator: Operator.EQ, value: sessionId }]
        : [];

      const allRows = await this.queryTable(
        USER_PROFILE_RECORD_TABLE,
        conditions,
        [{ field: 'version', direction: Direction.DESC }],
      );

      if (allRows.length <= retentionVersions) return;

      const toDelete = allRows.slice(retentionVersions);
      for (const row of toDelete) {
        await this.relationDb.delete(USER_PROFILE_DIMENSION_DATA_TABLE, [
          { field: 'profile_record_id', operator: Operator.EQ, value: row.id },
        ]);
        await this.relationDb.delete(USER_PROFILE_RECORD_TABLE, [
          { field: 'id', operator: Operator.EQ, value: row.id },
        ]);
      }
    } catch (err) {
      /* best-effort */
      metrics?.warn('UserProfileService.cleanupOldVersions 历史版本清理失败（保留全部版本）', {
        error: err instanceof Error ? err.message : String(err),
        session_id: sessionId,
      });
    }
  }
}
