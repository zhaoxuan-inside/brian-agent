import { z } from 'zod';

export const MCPFunctionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    description: z.string(),
    required: z.boolean(),
    default: z.any().optional(),
  })),
});

export type MCPFunction = z.infer<typeof MCPFunctionSchema>;

export const MCPSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  icon: z.string(),
  version: z.string(),
  author: z.string(),
  functions: z.array(MCPFunctionSchema),
  config: z.record(z.string(), z.any()).optional(),
  installed: z.boolean().default(false),
});

export type MCP = z.infer<typeof MCPSchema>;

export const MCPExecuteRequestSchema = z.object({
  mcpId: z.string(),
  functionName: z.string(),
  arguments: z.record(z.string(), z.any()),
});

export type MCPExecuteRequest = z.infer<typeof MCPExecuteRequestSchema>;

export const MCPExecuteResponseSchema = z.object({
  success: z.boolean(),
  result: z.any().optional(),
  error: z.string().optional(),
});

export type MCPExecuteResponse = z.infer<typeof MCPExecuteResponseSchema>;

export interface MCPWrapper {
  id: string;
  name: string;
  description: string;
  category: string;
  functions: MCPFunction[];

  execute(request: MCPExecuteRequest): Promise<MCPExecuteResponse>;
  validateConfig(): Promise<{ success: boolean; message: string }>;
}

export abstract class BaseMCPWrapper implements MCPWrapper {
  constructor(
    public id: string,
    public name: string,
    public description: string,
    public category: string,
    public functions: MCPFunction[] = []
  ) {}

  abstract execute(request: MCPExecuteRequest): Promise<MCPExecuteResponse>;

  async validateConfig(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'MCP configuration is valid' };
  }

  protected validateArguments(
    functionName: string,
    arguments_: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const func = this.functions.find(f => f.name === functionName);
    if (!func) {
      return { valid: false, errors: [`Function ${functionName} not found`] };
    }

    const errors: string[] = [];
    for (const [paramName, paramDef] of Object.entries(func.parameters)) {
      if (paramDef.required && arguments_[paramName] === undefined) {
        errors.push(`Missing required parameter: ${paramName}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}