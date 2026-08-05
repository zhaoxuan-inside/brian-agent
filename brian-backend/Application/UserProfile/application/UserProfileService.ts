import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import {
  IdGenerator, Operator, Direction, ValidationError, DataObject as DataObjectType,
  ExecLLMInput, ExecLLMOutput, LLMContext,
  ExecPromptInput, ExecPromptOutput, PromptContext,
  NotFoundError,
  type DataObject,
} from '@brian-agent/base';
import type { InfoCoreAccess, LLMCoreAccess } from '@brian-agent/core';
import {
  LastNInfoInput, LastNInfoOutput, RelationKInfoInput, RelationKInfoOutput, InfoCoreContext,
} from '@brian-agent/core';
import {
  MatchLLMInput, MatchLLMOutput, CheckLLMQuotaInput, CheckLLMQuotaOutput,
  RecordLLMUsageInput, RecordLLMUsageOutput, LLMCoreContext,
} from '@brian-agent/core';
import type { WriterAgentAccess } from '@brian-agent/agent';
import {
  SaveUserProfileInput, SaveUserProfileOutput, GetUserProfileInput as WriterGetUserProfileInput,
  GetUserProfileOutput as WriterGetUserProfileOutput,
} from '@brian-agent/agent';
import type { EvolutorAgentAccess } from '@brian-agent/agent';
import type { GetEvaluationInput, GetEvaluationOutput } from '@brian-agent/agent';
import { EvolutorAgentContext } from '@brian-agent/agent';
import {
  USER_PROFILE_DIRECTION_TABLE, USER_PROFILE_RECORD_TABLE,
  USER_PROFILE_DIMENSION_DATA_TABLE, USER_PROFILE_CONFIG_TABLE,
  UserProfileContext,
  ConfigProfileDirectionInput, ConfigProfileDirectionOutput,
  GetProfileDirectionInput, GetProfileDirectionOutput,
  GetUserProfileInput, GetUserProfileOutput,
  GenerateProfileInput, GenerateProfileOutput,
  SaveUserPreferenceInput, SaveUserPreferenceOutput,
  GetProfileHistoryInput, GetProfileHistoryOutput,
  GetProfileByVersionInput, GetProfileByVersionOutput,
  ConfigUserProfileInput, ConfigUserProfileOutput,
} from '../domain/types';

export class UserProfileService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly writerAgent: WriterAgentAccess,
    private readonly evolutorAgent: EvolutorAgentAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly llmCore: LLMCoreAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  async configProfileDirection(
    input: ConfigProfileDirectionInput,
    _ctx: UserProfileContext,
    _output: ConfigProfileDirectionOutput,
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
        ]);
      }
    }
    return true;
  }

  async getProfileDirection(
    _input: GetProfileDirectionInput,
    _ctx: UserProfileContext,
    output: GetProfileDirectionOutput,
  ): Promise<boolean> {
    const rows = await this.queryTable(USER_PROFILE_DIRECTION_TABLE, [], [
      { field: 'weight', direction: Direction.DESC },
    ]);
    output.directions = rows;
    return true;
  }

  async getUserProfile(
    input: GetUserProfileInput,
    _ctx: UserProfileContext,
    output: GetUserProfileOutput,
  ): Promise<boolean> {
    const sessionId = input.session_id;
    output.session_id = sessionId;

    let writerPreferences: { language: string; style: string; depth: string; format: string; additional_preferences: string } | null = null;
    if (sessionId) {
      try {
        const wo = new WriterGetUserProfileOutput();
        await this.writerAgent.getUserProfile(
          Object.assign(new WriterGetUserProfileInput(), { session_id: sessionId }),
          new (await this.writerCtx())(),
          wo,
        );
        writerPreferences = wo.user_profile;
      } catch { /* best-effort */ }
    }

    let latestRecord: Record<string, unknown> | null = null;
    try {
      const conditions = sessionId
        ? [{ field: 'session_id', operator: Operator.EQ, value: sessionId }]
        : [];
      const allConds = [...conditions];
      const recs = await this.relationDb.select(USER_PROFILE_RECORD_TABLE, {
        conditions: allConds as any,
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

    for (const dir of enabledDirs) {
      const key = String(dir.direction_key);
      try {
        const result = await this.aggregateDimension(key, sessionId, writerPreferences);
        dimensions[key] = result;
      } catch {
        dimensions[key] = { value: null, confidence: 0, evidence: [] };
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

  async generateProfile(
    input: GenerateProfileInput,
    _ctx: UserProfileContext,
    output: GenerateProfileOutput,
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
        new InfoCoreContext(),
        lastNOut,
      );
    } catch { /* best-effort */ }

    const conversationText = (lastNOut.list ?? [])
      .map((r) => `${r.info_creator_role}: ${r.info}`)
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
          key, name, conversationText, config,
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
          new (await this.writerCtx())(),
          saveOut,
        );
      } catch { /* best-effort */ }
    }

    await this.cleanupOldVersions(Number(config.profile_retention_versions ?? 20), sessionId);

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

  async saveUserPreference(
    input: SaveUserPreferenceInput,
    _ctx: UserProfileContext,
    _output: SaveUserPreferenceOutput,
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
      new (await this.writerCtx())(),
      saveOut,
    );
    return true;
  }

  async getProfileHistory(
    input: GetProfileHistoryInput,
    _ctx: UserProfileContext,
    output: GetProfileHistoryOutput,
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

  async getProfileByVersion(
    input: GetProfileByVersionInput,
    _ctx: UserProfileContext,
    output: GetProfileByVersionOutput,
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

    const dimensions: Record<string, unknown> = {};
    for (const d of dimRows) {
      const key = String(d.direction_key);
      let value: unknown = null;
      let evidence: unknown = [];
      try { value = JSON.parse(String(d.dimension_value ?? 'null')); } catch { value = d.dimension_value; }
      try { evidence = JSON.parse(String(d.evidence ?? '[]')); } catch { evidence = d.evidence; }
      dimensions[key] = {
        value,
        evidence,
        confidence: Number(d.confidence),
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

  async configUserProfile(
    input: ConfigUserProfileInput,
    _ctx: UserProfileContext,
    output: ConfigUserProfileOutput,
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
    if (input.auto_generate_interval_ms !== undefined) data.push({ field: 'auto_generate_interval_ms', value: input.auto_generate_interval_ms });
    if (input.profile_analysis_prompt_template_id !== undefined) data.push({ field: 'profile_analysis_prompt_template_id', value: input.profile_analysis_prompt_template_id });
    if (input.max_conversation_sample_count !== undefined) data.push({ field: 'max_conversation_sample_count', value: input.max_conversation_sample_count });
    if (input.profile_retention_versions !== undefined) data.push({ field: 'profile_retention_versions', value: input.profile_retention_versions });
    if (input.min_confidence_threshold !== undefined) data.push({ field: 'min_confidence_threshold', value: input.min_confidence_threshold });

    if (data.length > 0) {
      data.push({ field: 'updated', value: now });
      await this.relationDb.update(USER_PROFILE_CONFIG_TABLE, data, [
        { field: 'id', operator: Operator.EQ, value: String(config.id) },
      ]);
    }

    output.config = await this.getConfig();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async writerCtx(): Promise<new () => any> {
    const { WriterAgentContext } = await import('@brian-agent/agent');
    return WriterAgentContext;
  }

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
        conditions: mappedConditions as any,
        order_by: mappedOrderBy as any,
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

  private async aggregateDimension(
    key: string,
    sessionId: string | undefined,
    writerPreferences: {
      language: string; style: string; depth: string; format: string; additional_preferences: string;
    } | null,
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    switch (key) {
      case 'language_preference':
        return this.aggregateLanguagePreference(sessionId, writerPreferences);
      case 'reply_style':
        return this.aggregateReplyStyle(writerPreferences);
      case 'knowledge_interest':
        return this.aggregateKnowledgeInterest(sessionId);
      case 'interaction_habit':
        return this.aggregateInteractionHabit(sessionId);
      case 'feedback_sensitivity':
        return this.aggregateFeedbackSensitivity();
      default:
        return { value: null, confidence: 0, evidence: [] };
    }
  }

  private async aggregateLanguagePreference(
    sessionId: string | undefined,
    writerPreferences: {
      language: string; style: string; depth: string; format: string; additional_preferences: string;
    } | null,
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    const evidence: Array<Record<string, unknown>> = [];
    let value: unknown = writerPreferences?.language ?? 'zh-CN';

    if (writerPreferences?.language) {
      evidence.push({ source: 'writer_agent', type: 'explicit', value: writerPreferences.language });
    }

    if (sessionId) {
      try {
        const out = new LastNInfoOutput();
        await this.infoCore.lastNInfo(
          Object.assign(new LastNInfoInput(), { session_id: sessionId, lastN: 50 }),
          new InfoCoreContext(),
          out,
        );
        if (out.list?.length > 0) {
          const sample = out.list.slice(0, 5).map((r) => r.info).join(' ');
          evidence.push({ source: 'recent_messages', type: 'sample', sample });
        }
      } catch { /* best-effort */ }
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
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    const evidence: Array<Record<string, unknown>> = [];
    let interests: string[] = [];
    let confidence = 0;

    if (sessionId) {
      try {
        const nOut = new LastNInfoOutput();
        await this.infoCore.lastNInfo(
          Object.assign(new LastNInfoInput(), { session_id: sessionId, lastN: 50 }),
          new InfoCoreContext(),
          nOut,
        );
        if (nOut.list?.length > 0) {
          const firstInfoId = nOut.list[0].info_id;
          if (firstInfoId) {
            const rOut = new RelationKInfoOutput();
            await this.infoCore.relationKInfo(
              Object.assign(new RelationKInfoInput(), { info_id: firstInfoId, topN: 10 }),
              new InfoCoreContext(),
              rOut,
            );
            evidence.push({ source: 'relation_k_info', count: rOut.list?.length ?? 0 });
          }
        }
      } catch { /* best-effort */ }
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
  ): Promise<{ value: unknown; confidence: number; evidence: Array<Record<string, unknown>> }> {
    const evidence: Array<Record<string, unknown>> = [];
    let messageCount = 0;
    let avgLength = 0;
    let citingFrequency = 0;

    if (sessionId) {
      try {
        const countRows = this.relationDb.queryRaw(
          `SELECT COUNT(*) as cnt, AVG(info_length) as avg_len FROM info_raw
           WHERE session_id = ? AND info_creator_role = 'USER'`,
          [sessionId],
        );
        if (countRows.length > 0) {
          messageCount = Number(countRows[0]?.cnt ?? 0);
          avgLength = Math.round(Number(countRows[0]?.avg_len ?? 0));
          evidence.push({ source: 'info_raw', message_count: messageCount, avg_message_length: avgLength });
        }
      } catch { /* best-effort */ }

      try {
        const citeRows = this.relationDb.queryRaw(
          `SELECT COUNT(*) as cnt FROM info_graph ig
           INNER JOIN info_raw ir ON ig.info_id = ir.info_id
           WHERE ir.session_id = ?`,
          [sessionId],
        );
        citingFrequency = Number(citeRows[0]?.cnt ?? 0);
        evidence.push({ source: 'info_graph', citing_count: citingFrequency });
      } catch { /* best-effort */ }
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
      const evalOut = new (await this.getEvalOutputClass())();
      const evalIn = Object.assign(new (await this.getEvalInputClass())(), {});
      await this.evolutorAgent.getEvaluation(evalIn, new EvolutorAgentContext(), evalOut);
      const evaluations = (evalOut as any).evaluations ?? [];
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
    config: Record<string, unknown>,
  ): Promise<{ value: unknown; confidence: number; evidence: unknown[] }> {
    const templateId = String(config.profile_analysis_prompt_template_id ?? '');

    let prompt: string;
    if (templateId) {
      try {
        const promptOut = new ExecPromptOutput();
        await this.promptsAccess.execPrompt(
          Object.assign(new ExecPromptInput(), {
            id: templateId,
            variables: {
              direction_key: directionKey,
              direction_name: directionName,
              conversation_sample: conversationText.slice(0, 4000),
            },
          }),
          new PromptContext(),
          promptOut,
        );
        prompt = promptOut.prompt || this.buildDefaultAnalysisPrompt(directionKey, directionName, conversationText);
      } catch {
        prompt = this.buildDefaultAnalysisPrompt(directionKey, directionName, conversationText);
      }
    } else {
      prompt = this.buildDefaultAnalysisPrompt(directionKey, directionName, conversationText);
    }

    try {
      const matchOut = new MatchLLMOutput();
      await this.llmCore.matchLLM(
        Object.assign(new MatchLLMInput(), {
          agent_id: 'user_profile_generation',
          context_id: 'user_profile',
          interact_id: IdGenerator.generate(),
        }),
        new LLMCoreContext(),
        matchOut,
      );

      const llmId = matchOut.llm_id;
      if (!llmId) {
        return { value: this.statisticalFallback(directionKey, conversationText), confidence: 0.2, evidence: [] };
      }

      const llmProviderId = (matchOut.llm as Record<string, unknown> | null)?.llm_provider_id as string | undefined;
      if (llmProviderId) {
        try {
          const quotaOut = new CheckLLMQuotaOutput();
          await this.llmCore.checkLLMQuota(
            Object.assign(new CheckLLMQuotaInput(), { llm_provider_id: llmProviderId }),
            new LLMCoreContext(),
            quotaOut,
          );
          if (quotaOut.quota.daily.available <= 0) {
            return { value: this.statisticalFallback(directionKey, conversationText), confidence: 0.2, evidence: [{ source: 'quota_exhausted' }] };
          }
        } catch {
          /* best-effort: proceed even if quota check fails */
        }
      }

      const llmOut = new ExecLLMOutput();
      await this.llmAccess.execLLM(
        Object.assign(new ExecLLMInput(), {
          id: llmId,
          params: { prompt, temperature: 0.3, max_tokens: 512 },
        }),
        new LLMContext(),
        llmOut,
      );

      if (llmProviderId) {
        try {
          const estimatedTokens = Math.ceil((prompt.length + (llmOut.result?.length ?? 0)) / 4);
          await this.llmCore.recordLLMUsage(
            Object.assign(new RecordLLMUsageInput(), {
              llm_provider_id: llmProviderId,
              tokens_used: estimatedTokens,
              call_count: 1,
            }),
            new LLMCoreContext(),
            new RecordLLMUsageOutput(),
          );
        } catch {
          /* best-effort usage recording */
        }
      }

      const resultText = llmOut.result || '';
      return this.parseLLMAnalysis(resultText);

    } catch {
      return { value: this.statisticalFallback(directionKey, conversationText), confidence: 0.1, evidence: [] };
    }
  }

  private buildDefaultAnalysisPrompt(
    directionKey: string,
    directionName: string,
    conversationText: string,
  ): string {
    const truncated = conversationText.slice(0, 4000);
    return `Analyze the user's "${directionName}" (${directionKey}) based on these conversations:

${truncated || 'No conversation data available.'}

Return a JSON object with:
{
  "value": <the analyzed value - can be string, number, object, or array>,
  "confidence": <number 0-1>,
  "evidence": <array of evidence strings from the conversations>
}

Return ONLY valid JSON, no other text.`;
  }

  private parseLLMAnalysis(response: string): { value: unknown; confidence: number; evidence: unknown[] } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          value: parsed.value ?? null,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.3,
          evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
        };
      }
    } catch { /* fall through */ }

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
    } catch { /* best-effort */ }
  }

  private async getEvalInputClass(): Promise<new () => any> {
    const { GetEvaluationInput } = await import('@brian-agent/agent');
    return GetEvaluationInput;
  }

  private async getEvalOutputClass(): Promise<new () => any> {
    const { GetEvaluationOutput } = await import('@brian-agent/agent');
    return GetEvaluationOutput;
  }
}
