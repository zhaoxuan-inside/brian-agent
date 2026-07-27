import { Input, Context, Output } from '../../shared/base';
import { logger } from '../../infrastructure/logger';
import { AopProxy } from '../infra/aopProxy';
import { generateId } from '../AgentLibrary/agentTypes';
import type { LLMService } from '../../core/llm/LLMService';
import type { ChatCompletionRequest } from '../../base/LLMWrapper';
import { getDatabase } from '../../infrastructure/database';

const DB = getDatabase();
const MODULE = 'WriterAgent';

DB.exec(`CREATE TABLE IF NOT EXISTS writer_agent_config (
  id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
  write_prompt_template_id TEXT NOT NULL DEFAULT '',
  default_language TEXT NOT NULL DEFAULT 'zh-CN',
  default_style TEXT NOT NULL DEFAULT 'clear',
  default_depth TEXT NOT NULL DEFAULT 'medium',
  default_format TEXT NOT NULL DEFAULT 'MARKDOWN'
)`);

const WCONF = DB.prepare('SELECT * FROM writer_agent_config LIMIT 1').get() as Record<string, unknown> | undefined;
if (!WCONF) {
  const now = Date.now();
  DB.prepare('INSERT INTO writer_agent_config (id,created,updated) VALUES (?,?,?)').run(generateId(), now, now);
}

DB.exec(`CREATE TABLE IF NOT EXISTS writer_agent_user_profile (
  id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
  session_id TEXT NOT NULL UNIQUE, language TEXT NOT NULL DEFAULT 'zh-CN',
  style TEXT NOT NULL DEFAULT 'clear', depth TEXT NOT NULL DEFAULT 'medium',
  format TEXT NOT NULL DEFAULT 'MARKDOWN', additional_preferences TEXT
)`);

class WriteInput extends Input {
  work_id!: string; interact_id!: string; user_query!: string;
  agent_results!: { agent_id: string; task_content: string; result: string }[];
  user_preferences?: Record<string, string>;
  constructor(d: Partial<WriteInput>) { super(d); Object.assign(this, d); }
}
class WriteContext extends Context { }
class WriteOutput extends Output { response?: string; response_format?: string; token_usage?: number; elapsed_ms?: number; }

class SaveUserProfileInput extends Input {
  session_id!: string; language?: string; style?: string;
  depth?: string; format?: string; additional_preferences?: string;
  constructor(d: Partial<SaveUserProfileInput>) { super(d); Object.assign(this, d); }
}
class SaveUserProfileContext extends Context { }
class SaveUserProfileOutput extends Output { }

class GetUserProfileInput extends Input {
  session_id!: string;
  constructor(d: Partial<GetUserProfileInput>) { super(d); Object.assign(this, d); }
}
class GetUserProfileContext extends Context { }
class GetUserProfileOutput extends Output { user_profile?: Record<string, unknown>; }

class ConfigWriterAgentInput extends Input {
  write_prompt_template_id?: string; default_language?: string;
  default_style?: string; default_depth?: string; default_format?: string;
  constructor(d: Partial<ConfigWriterAgentInput>) { super(d); Object.assign(this, d); }
}
class ConfigWriterAgentContext extends Context { }
class ConfigWriterAgentOutput extends Output {
  write_prompt_template_id?: string; default_language?: string;
  default_style?: string; default_depth?: string; default_format?: string;
}

export { WriteInput, SaveUserProfileInput, GetUserProfileInput, ConfigWriterAgentInput };
export { WriteContext, SaveUserProfileContext, GetUserProfileContext, ConfigWriterAgentContext };
export { WriteOutput, SaveUserProfileOutput, GetUserProfileOutput, ConfigWriterAgentOutput };

export class WriterAgentService {
  constructor(private llmService?: LLMService) {}

  async write(input: WriteInput, _context: WriteContext, output: WriteOutput): Promise<boolean> {
    logger.info(MODULE, '[write] start', { work_id: input.work_id, query: input.user_query?.substring(0, 100) });
    const startTime = Date.now();
    const profile = this.loadProfile(input);

    const resultsText = (input.agent_results || []).map(r =>
      `### ${r.task_content}\n${r.result}`
    ).join('\n\n') || 'No results available.';

    if (this.llmService) {
      try {
        const stylePrompts: Record<string, string> = {
          clear: 'Write clearly and straightforwardly.',
          concise: 'Be concise and to the point.',
          detailed: 'Provide detailed and thorough explanations.',
          creative: 'Write creatively with engaging language.',
        };

        const request: ChatCompletionRequest = {
          model: '',
          messages: [
            {
              role: 'system',
              content: `You are a writer agent that produces final responses. Language: ${profile.language}. Style: ${profile.style}. Depth: ${profile.depth}. Format: ${profile.format}. ${stylePrompts[profile.style] || ''} Respond in ${profile.language === 'zh-CN' ? 'Chinese' : 'the user\'s language'}.`
            },
            {
              role: 'user',
              content: `User question: ${input.user_query}\n\nAgent results:\n${resultsText}\n\nGenerate a well-formatted final response.`
            },
          ],
          temperature: 0.5,
          maxTokens: 4096,
        };
        const resp = await this.llmService.chatCompletion(request);
        output.response = resp.choices?.[0]?.message?.content || resultsText;
        output.token_usage = resp.usage?.totalTokens || 0;
      } catch (e) {
        logger.warn(MODULE, '[write] LLM failed, using fallback', { error: (e as Error).message });
        output.response = this.buildFallbackResponse(input, resultsText);
        output.token_usage = 0;
      }
    } else {
      output.response = this.buildFallbackResponse(input, resultsText);
      output.token_usage = 0;
    }

    output.response_format = profile.format || 'MARKDOWN';
    output.elapsed_ms = Date.now() - startTime;
    logger.info(MODULE, '[write] done', { elapsed_ms: output.elapsed_ms });
    return true;
  }

  saveUserProfile(input: SaveUserProfileInput, _context: SaveUserProfileContext, _output: SaveUserProfileOutput): boolean {
    logger.info(MODULE, '[saveUserProfile] start', { session_id: input.session_id });
    if (!input.session_id) return false;
    const existing = DB.prepare('SELECT id FROM writer_agent_user_profile WHERE session_id = ?').get(input.session_id) as Record<string, unknown> | undefined;
    if (existing) {
      const now = Date.now();
      const sets: string[] = ['updated = ?'];
      const params: unknown[] = [now];
      if (input.language !== undefined) { sets.push('language = ?'); params.push(input.language); }
      if (input.style !== undefined) { sets.push('style = ?'); params.push(input.style); }
      if (input.depth !== undefined) { sets.push('depth = ?'); params.push(input.depth); }
      if (input.format !== undefined) { sets.push('format = ?'); params.push(input.format); }
      if (input.additional_preferences !== undefined) { sets.push('additional_preferences = ?'); params.push(input.additional_preferences); }
      params.push(input.session_id);
      DB.prepare(`UPDATE writer_agent_user_profile SET ${sets.join(',')} WHERE session_id = ?`).run(...params);
    } else {
      const id = generateId();
      const now = Date.now();
      DB.prepare(`INSERT INTO writer_agent_user_profile (id,created,updated,session_id,language,style,depth,format,additional_preferences)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
        id, now, now, input.session_id, input.language || 'zh-CN', input.style || 'clear',
        input.depth || 'medium', input.format || 'MARKDOWN', input.additional_preferences || null
      );
    }
    logger.info(MODULE, '[saveUserProfile] done');
    return true;
  }

  getUserProfile(input: GetUserProfileInput, _context: GetUserProfileContext, output: GetUserProfileOutput): boolean {
    const row = DB.prepare('SELECT * FROM writer_agent_user_profile WHERE session_id = ?').get(input.session_id) as Record<string, unknown> | undefined;
    if (!row) {
      output.user_profile = { language: 'zh-CN', style: 'clear', depth: 'medium', format: 'MARKDOWN' };
    } else {
      output.user_profile = {
        session_id: row.session_id, language: row.language || 'zh-CN',
        style: row.style || 'clear', depth: row.depth || 'medium',
        format: row.format || 'MARKDOWN', additional_preferences: row.additional_preferences,
      };
    }
    return true;
  }

  configWriterAgent(input: ConfigWriterAgentInput, _context: ConfigWriterAgentContext, output: ConfigWriterAgentOutput): boolean {
    logger.info(MODULE, '[configWriterAgent] start');
    const now = Date.now();
    const sets: string[] = ['updated = ?'];
    const params: unknown[] = [now];
    const VALID_STYLES = ['clear', 'concise', 'detailed', 'creative'];
    const VALID_DEPTHS = ['shallow', 'medium', 'deep'];
    const VALID_FORMATS = ['TEXT', 'MARKDOWN', 'JSON'];

    if (input.write_prompt_template_id !== undefined) { sets.push('write_prompt_template_id = ?'); params.push(input.write_prompt_template_id); }
    if (input.default_language !== undefined) { sets.push('default_language = ?'); params.push(input.default_language); }
    if (input.default_style !== undefined) {
      if (!VALID_STYLES.includes(input.default_style)) return false;
      sets.push('default_style = ?'); params.push(input.default_style);
    }
    if (input.default_depth !== undefined) {
      if (!VALID_DEPTHS.includes(input.default_depth)) return false;
      sets.push('default_depth = ?'); params.push(input.default_depth);
    }
    if (input.default_format !== undefined) {
      if (!VALID_FORMATS.includes(input.default_format)) return false;
      sets.push('default_format = ?'); params.push(input.default_format);
    }
    DB.prepare(`UPDATE writer_agent_config SET ${sets.join(',')}`).run(...params);
    const config = DB.prepare('SELECT * FROM writer_agent_config LIMIT 1').get() as Record<string, unknown>;
    output.write_prompt_template_id = config.write_prompt_template_id as string;
    output.default_language = config.default_language as string;
    output.default_style = config.default_style as string;
    output.default_depth = config.default_depth as string;
    output.default_format = config.default_format as string;
    logger.info(MODULE, '[configWriterAgent] done');
    return true;
  }

  private loadProfile(input: WriteInput): Record<string, string> {
    if (input.user_preferences && Object.keys(input.user_preferences).length > 0) {
      return {
        language: input.user_preferences.language || 'zh-CN',
        style: input.user_preferences.style || 'clear',
        depth: input.user_preferences.depth || 'medium',
        format: input.user_preferences.format || 'MARKDOWN',
      };
    }
    const config = DB.prepare('SELECT * FROM writer_agent_config LIMIT 1').get() as Record<string, unknown>;
    return {
      language: (config?.default_language as string) || 'zh-CN',
      style: (config?.default_style as string) || 'clear',
      depth: (config?.default_depth as string) || 'medium',
      format: (config?.default_format as string) || 'MARKDOWN',
    };
  }

  private buildFallbackResponse(input: WriteInput, resultsText: string): string {
    const parts: string[] = [];
    parts.push(`## ${input.user_query || 'Response'}\n`);
    if (input.agent_results && input.agent_results.length > 0) {
      for (const r of input.agent_results) {
        parts.push(`### ${r.task_content}\n${r.result}\n`);
      }
    } else {
      parts.push(resultsText);
    }
    parts.push('---\n*Generated by WriterAgent*');
    return parts.join('\n');
  }
}

export function createWriterAgentService(llmService?: LLMService): WriterAgentService {
  const raw = new WriterAgentService(llmService);
  return AopProxy(raw, { logger: { info: (m: string, msg: string) => logger.info(m, msg) } });
}
