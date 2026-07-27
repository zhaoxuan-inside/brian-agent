import type { SkillManager } from '../../core/skill/SkillManager';
import type { Tool } from '../../shared/types';

export interface ActInput {
  tool_type: 'Skill' | 'MCP';
  tool_id: string;
  tool_name: string;
  args: Record<string, unknown>;
}

export interface ActOutput {
  raw_result: string;
  success: boolean;
  error?: string;
  elapsed_ms?: number;
}

export async function execAct(
  input: ActInput,
  tools: Tool[],
  skillManager: SkillManager,
): Promise<ActOutput> {
  const start = Date.now();
  try {
    let raw_result: string;

    if (input.tool_type === 'Skill') {
      const result = await skillManager.executeSkill(input.tool_id, input.args);
      raw_result = typeof result === 'string' ? result : JSON.stringify(result);
    } else {
      const tool = tools.find(t => t.name === input.tool_name);
      if (!tool) {
        return {
          raw_result: `Tool "${input.tool_name}" not found. Available: ${tools.map(t => t.name).join(', ')}`,
          success: false,
          error: `Tool not found: ${input.tool_name}`,
          elapsed_ms: Date.now() - start,
        };
      }
      raw_result = await tool.execute(input.args);
    }

    return {
      raw_result,
      success: true,
      elapsed_ms: Date.now() - start,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      raw_result: `Tool execution error: ${message}`,
      success: false,
      error: message,
      elapsed_ms: Date.now() - start,
    };
  }
}
