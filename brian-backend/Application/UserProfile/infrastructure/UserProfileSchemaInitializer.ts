import type { RelationDBAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import {
  USER_PROFILE_DIRECTION_TABLE,
  USER_PROFILE_RECORD_TABLE,
  USER_PROFILE_DIMENSION_DATA_TABLE,
  USER_PROFILE_CONFIG_TABLE,
} from '../domain/types';

export class UserProfileSchemaInitializer {
  constructor(private readonly relationDb: RelationDBAccess) {}

  async init(): Promise<void> {
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${USER_PROFILE_DIRECTION_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        direction_key TEXT UNIQUE NOT NULL,
        direction_name TEXT NOT NULL,
        direction_description TEXT,
        weight INTEGER NOT NULL DEFAULT 0,
        enable INTEGER NOT NULL DEFAULT 1
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${USER_PROFILE_RECORD_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        session_id TEXT,
        version INTEGER NOT NULL,
        profile_summary TEXT,
        generated_at INTEGER NOT NULL,
        change_summary TEXT
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${USER_PROFILE_DIMENSION_DATA_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        profile_record_id TEXT NOT NULL,
        direction_key TEXT NOT NULL,
        dimension_value TEXT,
        evidence TEXT,
        confidence REAL NOT NULL DEFAULT 0.0
      )`,
    );
    this.relationDb.executeRaw(
      `CREATE TABLE IF NOT EXISTS ${USER_PROFILE_CONFIG_TABLE} (
        id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        auto_generate_interval_ms INTEGER NOT NULL DEFAULT 86400000,
        profile_analysis_prompt_template_id TEXT NOT NULL DEFAULT '',
        max_conversation_sample_count INTEGER NOT NULL DEFAULT 500,
        profile_retention_versions INTEGER NOT NULL DEFAULT 20,
        min_confidence_threshold REAL NOT NULL DEFAULT 0.5
      )`,
    );

    const configCount = await this.relationDb.count(USER_PROFILE_CONFIG_TABLE);
    if (configCount === 0) {
      const now = IdGenerator.now();
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
    }

    const dirCount = await this.relationDb.count(USER_PROFILE_DIRECTION_TABLE);
    if (dirCount === 0) {
      const now = IdGenerator.now();
      const builtinDirections = [
        { direction_key: 'language_preference', direction_name: '语言偏好', direction_description: '用户的语言偏好', weight: 20, enable: 1 },
        { direction_key: 'reply_style', direction_name: '回复风格', direction_description: '用户偏好的回复风格', weight: 25, enable: 1 },
        { direction_key: 'knowledge_interest', direction_name: '知识兴趣', direction_description: '用户的知识领域兴趣', weight: 30, enable: 1 },
        { direction_key: 'interaction_habit', direction_name: '交互习惯', direction_description: '用户的交互行为习惯', weight: 15, enable: 1 },
        { direction_key: 'feedback_sensitivity', direction_name: '反馈敏感度', direction_description: '用户对评估反馈的敏感度', weight: 10, enable: 1 },
      ];
      for (const d of builtinDirections) {
        await this.relationDb.insert(USER_PROFILE_DIRECTION_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'direction_key', value: d.direction_key },
          { field: 'direction_name', value: d.direction_name },
          { field: 'direction_description', value: d.direction_description },
          { field: 'weight', value: d.weight },
          { field: 'enable', value: d.enable },
        ]);
      }
    }
  }
}
