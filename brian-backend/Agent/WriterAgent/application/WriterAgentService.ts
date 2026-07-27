import type { RelationDBAccess, LLMAccess, PromptsAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import type { InfoCoreAccess } from '@brian-agent/core';
import type { AgentBuilderAccess } from '../../AgentBuilder/access/AgentBuilderAccess';
import type { AgentLibraryAccess } from '../../AgentLibrary/access/AgentLibraryAccess';
import {
  WRITER_AGENT_CONFIG_TABLE, WRITER_AGENT_USER_PROFILE_TABLE,
  type WriterAgentConfigRecord, type WriterAgentUserProfileRecord,
  WriteInput, WriteOutput,
  SaveUserProfileInput, SaveUserProfileOutput,
  GetUserProfileInput, GetUserProfileOutput,
  ConfigWriterAgentInput, ConfigWriterAgentOutput,
} from '../domain/types';
import { BuildWriterAgentInput, BuildWriterAgentOutput } from '../../AgentBuilder/domain/types';
import { GetAgentInput, GetAgentOutput } from '../../AgentLibrary/domain/types';
import { RecordAgentUsageInput, RecordAgentUsageOutput } from '../../AgentLibrary/domain/types';

export class WriterAgentService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
    private readonly infoCore: InfoCoreAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly agentLibrary: AgentLibraryAccess,
  ) {}

  async write(input: WriteInput, _ctx: unknown, output: WriteOutput): Promise<boolean> {
    const buildOut = new BuildWriterAgentOutput();
    await this.agentBuilder.buildWriterAgent(new BuildWriterAgentInput(), {}, buildOut);
    const getOut = new GetAgentOutput();
    await this.agentLibrary.getAgent(Object.assign(new GetAgentInput(), { agent_id: buildOut.agent_id }), {}, getOut);

    let preferences = input.user_preferences;
    if (!preferences) {
      const profile = this.getProfile(input.user_query);
      if (profile) {
        preferences = { language: profile.language, style: profile.style, depth: profile.depth, format: profile.format };
      }
    }
    if (!preferences) {
      const config = this.getConfig();
      preferences = {
        language: config?.default_language ?? 'zh-CN',
        style: config?.default_style ?? 'clear',
        depth: config?.default_depth ?? 'medium',
        format: config?.default_format ?? 'MARKDOWN',
      };
    }

    const results = input.agent_results.map((r) => `[${r.agent_id}] ${r.task_content}: ${r.result}`).join('\n');
    const response = `Summary: ${input.user_query.slice(0, 100)}\n\nResults:\n${results}\n\nStyle: ${preferences.style}`;

    const recOut = new RecordAgentUsageOutput();
    await this.agentLibrary.recordAgentUsage(
      Object.assign(new RecordAgentUsageInput(), { agent_id: buildOut.agent_id, work_id: input.work_id, interact_id: input.interact_id }),
      {}, recOut,
    );

    output.response = response;
    output.response_format = preferences.format || 'MARKDOWN';
    output.token_usage = 0;
    return true;
  }

  async saveUserProfile(input: SaveUserProfileInput, _ctx: unknown, output: SaveUserProfileOutput): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.relationDb.queryRaw<WriterAgentUserProfileRecord>(
      `SELECT * FROM ${WRITER_AGENT_USER_PROFILE_TABLE} WHERE session_id = ?`, [input.session_id],
    );

    if (existing.length > 0) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (input.language !== undefined) { sets.push('language = ?'); vals.push(input.language); }
      if (input.style !== undefined) { sets.push('style = ?'); vals.push(input.style); }
      if (input.depth !== undefined) { sets.push('depth = ?'); vals.push(input.depth); }
      if (input.format !== undefined) { sets.push('format = ?'); vals.push(input.format); }
      if (input.additional_preferences !== undefined) { sets.push('additional_preferences = ?'); vals.push(input.additional_preferences); }
      if (sets.length > 0) {
        sets.push('updated = ?'); vals.push(now); vals.push(input.session_id);
        this.relationDb.executeRaw(`UPDATE ${WRITER_AGENT_USER_PROFILE_TABLE} SET ${sets.join(', ')} WHERE session_id = ?`, vals);
      }
    } else {
      this.relationDb.executeRaw(
        `INSERT INTO ${WRITER_AGENT_USER_PROFILE_TABLE} (id, created, updated, session_id, language, style, depth, format, additional_preferences) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [IdGenerator.uuid(), now, now, input.session_id, input.language ?? 'zh-CN', input.style ?? 'clear', input.depth ?? 'medium', input.format ?? 'MARKDOWN', input.additional_preferences ?? ''],
      );
    }
    return true;
  }

  async getUserProfile(input: GetUserProfileInput, _ctx: unknown, output: GetUserProfileOutput): Promise<boolean> {
    const profile = this.getProfile(input.session_id);
    if (profile) {
      output.user_profile = { language: profile.language, style: profile.style, depth: profile.depth, format: profile.format, additional_preferences: profile.additional_preferences };
    }
    return true;
  }

  async configWriterAgent(input: ConfigWriterAgentInput, _ctx: unknown, output: ConfigWriterAgentOutput): Promise<boolean> {
    let config = this.getConfig();
    if (!config) {
      const now = Math.floor(Date.now() / 1000);
      this.relationDb.executeRaw(
        `INSERT INTO ${WRITER_AGENT_CONFIG_TABLE} (id, created, updated, write_prompt_template_id, default_language, default_style, default_depth, default_format) VALUES (?, ?, ?, ?, 'zh-CN', 'clear', 'medium', 'MARKDOWN')`,
        [IdGenerator.uuid(), now, now, ''],
      );
      config = this.getConfig();
    }
    if (!config) { output.error = 'config init failed'; return false; }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.write_prompt_template_id !== undefined) { sets.push('write_prompt_template_id = ?'); vals.push(input.write_prompt_template_id); }
    if (input.default_language !== undefined) { sets.push('default_language = ?'); vals.push(input.default_language); }
    if (input.default_style !== undefined) { sets.push('default_style = ?'); vals.push(input.default_style); }
    if (input.default_depth !== undefined) { sets.push('default_depth = ?'); vals.push(input.default_depth); }
    if (input.default_format !== undefined) { sets.push('default_format = ?'); vals.push(input.default_format); }
    if (sets.length > 0) {
      sets.push('updated = ?'); vals.push(Math.floor(Date.now() / 1000)); vals.push(config.id);
      this.relationDb.executeRaw(`UPDATE ${WRITER_AGENT_CONFIG_TABLE} SET ${sets.join(', ')} WHERE id = ?`, vals);
    }
    output.config = this.getConfig();
    return true;
  }

  private getConfig(): WriterAgentConfigRecord | null {
    const rows = this.relationDb.queryRaw<WriterAgentConfigRecord>(
      `SELECT * FROM ${WRITER_AGENT_CONFIG_TABLE} LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  private getProfile(sessionId: string): WriterAgentUserProfileRecord | null {
    const rows = this.relationDb.queryRaw<WriterAgentUserProfileRecord>(
      `SELECT * FROM ${WRITER_AGENT_USER_PROFILE_TABLE} WHERE session_id = ?`, [sessionId],
    );
    return rows[0] ?? null;
  }
}
