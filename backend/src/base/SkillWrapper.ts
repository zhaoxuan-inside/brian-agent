import { z } from 'zod';

export const SkillSchemaFieldSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  description: z.string(),
  required: z.boolean().default(false),
  default: z.any().optional(),
});

export type SkillSchemaField = z.infer<typeof SkillSchemaFieldSchema>;

export const SkillConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  icon: z.string().optional(),
  inputSchema: z.array(SkillSchemaFieldSchema).default([]),
  outputSchema: z.array(SkillSchemaFieldSchema).default([]),
  promptTemplate: z.string().default(''),
  tools: z.array(z.string()).default([]),
  isInstalled: z.boolean().default(false),
  effectivenessScore: z.number().default(0),
  usageCount: z.number().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;

export const SkillExecuteRequestSchema = z.object({
  skillId: z.string(),
  inputs: z.record(z.string(), z.any()),
  context: z.record(z.string(), z.any()).optional(),
});

export type SkillExecuteRequest = z.infer<typeof SkillExecuteRequestSchema>;

export const SkillExecuteResponseSchema = z.object({
  success: z.boolean(),
  result: z.any().optional(),
  error: z.string().optional(),
  usageCount: z.number().optional(),
});

export type SkillExecuteResponse = z.infer<typeof SkillExecuteResponseSchema>;

export interface SkillWrapper {
  id: string;
  name: string;
  description: string;
  config: SkillConfig;

  execute(request: SkillExecuteRequest): Promise<SkillExecuteResponse>;
  validateInputs(inputs: Record<string, any>): { valid: boolean; errors: string[] };
  validateConfig(): Promise<{ success: boolean; message: string }>;
}

export abstract class BaseSkillWrapper implements SkillWrapper {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public config: SkillConfig
  ) {}

  abstract execute(request: SkillExecuteRequest): Promise<SkillExecuteResponse>;

  validateInputs(inputs: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const schema = this.config.inputSchema;

    for (const field of schema) {
      if (field.required && inputs[field.name] === undefined) {
        errors.push(`Missing required input: ${field.name}`);
      }

      if (inputs[field.name] !== undefined) {
        const actualType = Array.isArray(inputs[field.name]) ? 'array' : typeof inputs[field.name];
        if (field.type === 'array' && !Array.isArray(inputs[field.name])) {
          errors.push(`Input ${field.name} expected array, got ${actualType}`);
        } else if (field.type !== 'array' && actualType !== field.type) {
          errors.push(`Input ${field.name} expected ${field.type}, got ${actualType}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async validateConfig(): Promise<{ success: boolean; message: string }> {
    const result = SkillConfigSchema.safeParse(this.config);
    if (!result.success) {
      return { success: false, message: result.error.message };
    }
    return { success: true, message: 'Skill configuration is valid' };
  }

  protected applyDefaults(inputs: Record<string, any>): Record<string, any> {
    const result = { ...inputs };
    for (const field of this.config.inputSchema) {
      if (result[field.name] === undefined && field.default !== undefined) {
        result[field.name] = field.default;
      }
    }
    return result;
  }
}