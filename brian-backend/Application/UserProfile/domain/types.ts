import { Input, Context, Output } from '@brian-agent/base';

export class UserProfileContext extends Context { session_id?: string; }

export class ConfigProfileDirectionInput extends Input { directions!: Array<{ direction_key: string; direction_name: string; direction_description?: string; weight: number; enable: boolean; }>; }
export class ConfigProfileDirectionOutput extends Output {}

export class GetProfileDirectionInput extends Input {}
export class GetProfileDirectionOutput extends Output { directions: Array<Record<string, unknown>> = []; }

export class GetUserProfileInput extends Input { session_id?: string; version?: number; }
export class GetUserProfileOutput extends Output { session_id?: string; profile_version = 0; generated_at = 0; dimensions: Record<string, unknown> = {}; profile_summary = ''; evolution_trend: Array<Record<string, unknown>> = []; }

export class GenerateProfileInput extends Input { session_id?: string; directions?: string[]; }
export class GenerateProfileOutput extends Output { profile: Record<string, unknown> = {}; }

export class SaveUserPreferenceInput extends Input { session_id!: string; language?: string; style?: string; depth?: string; format?: string; additional_preferences?: string; }
export class SaveUserPreferenceOutput extends Output {}

export class GetProfileHistoryInput extends Input { session_id?: string; limit?: number; }
export class GetProfileHistoryOutput extends Output { history: Array<Record<string, unknown>> = []; }

export class GetProfileByVersionInput extends Input { version!: number; session_id?: string; }
export class GetProfileByVersionOutput extends Output { profile: Record<string, unknown> = {}; }

export class ConfigUserProfileInput extends Input { auto_generate_interval_ms?: number; profile_analysis_prompt_template_id?: string; max_conversation_sample_count?: number; profile_retention_versions?: number; min_confidence_threshold?: number; }
export class ConfigUserProfileOutput extends Output { config: Record<string, unknown> = {}; }

export const USER_PROFILE_DIRECTION_TABLE = 'user_profile_direction';
export const USER_PROFILE_RECORD_TABLE = 'user_profile_record';
export const USER_PROFILE_DIMENSION_DATA_TABLE = 'user_profile_dimension_data';
export const USER_PROFILE_CONFIG_TABLE = 'user_profile_config';
