import type {
  RelationDBAccess,
  MCPAccess,
  LLMAccess,
  PromptsAccess,
  Condition,
  DataObject,
} from '@brian-agent/base';
import {
  Operator,
  IdGenerator,
  McpContext,
  SoMcpInput,
  SoMcpOutput,
  LLMContext,
  ExecLLMInput,
  ExecLLMOutput,
  PromptContext,
  GetPromptInput,
  GetPromptOutput,
  ExecPromptInput,
  ExecPromptOutput,
  McpInstallRecord,
} from '@brian-agent/base';
import { checkMatchCache, clearMatchCache, persistMatchBinding } from '../../shared/MatchCacheHelper';
import {
  McpCoreContext,
  McpCoreConfigRecord,
  MatchMcpInput,
  MatchMcpOutput,
  OptMcpInput,
  OptMcpOutput,
  ConfigMcpCoreInput,
  ConfigMcpCoreOutput,
  MCP_CORE_CONFIG_TABLE,
  AGENT_MCP_TABLE,
  AGENT_MCP_USAGE_TABLE,
  DEFAULT_REGENERATE_RATE,
} from '../domain/types';

export class MCPCoreService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly mcpAccess: MCPAccess,
    private readonly llmAccess: LLMAccess,
    private readonly promptsAccess: PromptsAccess,
  ) {}

  async matchMCP(
    input: MatchMcpInput,
    _context: McpCoreContext,
    output: MatchMcpOutput,
  ): Promise<boolean> {
    const config = await this.getConfig();
    const regenRate = config.regen_rate;

    const cacheResult = await checkMatchCache(
      this.relationDb, AGENT_MCP_TABLE, input.agent_id,
      regenRate, 'random', 'mcp_id',
    );
    if (cacheResult.hit && cacheResult.entries) {
      const mcpIds = cacheResult.entries.map(e => e.entity_id);
      output.mcp_ids = mcpIds;
      output.mcp_details = await this.getMcpDetails(mcpIds);
      return true;
    }

    const availableMcps = await this.getAvailableMcps();
    if (availableMcps.length === 0) {
      output.mcp_ids = [];
      output.mcp_details = [];
      return true;
    }

    const rankedIds = await this.rankMcpsWithLLM(
      availableMcps,
      input,
      config.prompt_template_id,
    );

    await clearMatchCache(this.relationDb, AGENT_MCP_TABLE, input.agent_id);
    for (const mcpId of rankedIds) {
      await persistMatchBinding(this.relationDb, AGENT_MCP_TABLE, input.agent_id, mcpId, 'mcp_id');
    }

    output.mcp_ids = rankedIds;
    output.mcp_details = rankedIds
      .map((id) => availableMcps.find((r) => r.id === id))
      .filter((r): r is McpInstallRecord => r != null);
    return true;
  }

  async optMCP(
    input: OptMcpInput,
    _context: McpCoreContext,
    output: OptMcpOutput,
  ): Promise<boolean> {
    const existing = await this.relationDb.selectOne(AGENT_MCP_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
      { field: 'mcp_id', operator: Operator.EQ, value: input.mcp_id },
    ]);

    if (!existing) {
      await persistMatchBinding(this.relationDb, AGENT_MCP_TABLE, input.agent_id, input.mcp_id, 'mcp_id');
    }

    const binding = await this.relationDb.selectOne(AGENT_MCP_TABLE, [
      { field: 'agent_id', operator: Operator.EQ, value: input.agent_id },
      { field: 'mcp_id', operator: Operator.EQ, value: input.mcp_id },
    ]);
    const agentMcpId = String(binding!.id);

    const now = IdGenerator.now();
    await this.relationDb.insert(AGENT_MCP_USAGE_TABLE, [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'agent_mcp_id', value: agentMcpId },
      { field: 'timestamp', value: now },
    ]);

    output.id = agentMcpId;
    return true;
  }

  async configMCPCore(
    input: ConfigMcpCoreInput,
    _context: McpCoreContext,
    output: ConfigMcpCoreOutput,
  ): Promise<boolean> {
    const existing = await this.getConfig();
    const now = IdGenerator.now();

    if (input.regen_rate !== undefined || input.prompt_template_id !== undefined) {
      const updateData: Array<{ field: string; value: unknown }> = [];
      if (input.regen_rate !== undefined) {
        updateData.push({ field: 'regen_rate', value: input.regen_rate });
      }
      if (input.prompt_template_id !== undefined) {
        updateData.push({ field: 'prompt_template_id', value: input.prompt_template_id || '' });
      }
      updateData.push({ field: 'updated', value: now });

      if (existing.id) {
        await this.relationDb.update(
          MCP_CORE_CONFIG_TABLE,
          updateData,
          [{ field: 'id', operator: Operator.EQ, value: existing.id }],
        );
      } else {
        await this.relationDb.insert(MCP_CORE_CONFIG_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: now },
          ...updateData,
        ]);
      }
    }

    output.config = await this.getConfig();
    return true;
  }

  private async getConfig(): Promise<McpCoreConfigRecord> {
    const rows = await this.relationDb.select(MCP_CORE_CONFIG_TABLE);
    if (rows.length > 0) {
      const r = rows[0];
      return {
        id: String(r.id),
        created: Number(r.created),
        updated: Number(r.updated),
        regen_rate: Number(r.regen_rate),
        prompt_template_id: String(r.prompt_template_id ?? ''),
      };
    }
    return {
      id: '',
      created: 0,
      updated: 0,
      regen_rate: DEFAULT_REGENERATE_RATE,
      prompt_template_id: '',
    };
  }

  private async getAvailableMcps(): Promise<McpInstallRecord[]> {
    const soInput = new SoMcpInput();
    const soOutput = new SoMcpOutput();
    await this.mcpAccess.soMcp(soInput, new McpContext(), soOutput);
    return soOutput.list;
  }

  private async getMcpDetails(ids: string[]): Promise<McpInstallRecord[]> {
    const soInput = new SoMcpInput();
    if (ids.length > 0) {
      soInput.conditions = [
        { field: 'id', operator: Operator.IN, value: ids },
      ];
    }
    const soOutput = new SoMcpOutput();
    await this.mcpAccess.soMcp(soInput, new McpContext(), soOutput);
    return soOutput.list;
  }

  private async rankMcpsWithLLM(
    mcps: McpInstallRecord[],
    input: MatchMcpInput,
    promptTemplateId: string,
  ): Promise<string[]> {
    const mcpDescriptions = mcps.map(
      (m, i) =>
        `"${m.id}": ${m.mcp_title}${m.mcp_brief ? ` - ${m.mcp_brief}` : ''}`,
    );

    let prompt: string;

    if (promptTemplateId) {
      const execPromptInput = new ExecPromptInput();
      execPromptInput.id = promptTemplateId;
      execPromptInput.variables = {
        agent_id: input.agent_id,
        context_id: input.context_id,
        interact_id: input.interact_id,
        available_mcps: mcpDescriptions.join('\n'),
      };
      const execPromptOutput = new ExecPromptOutput();
      await this.promptsAccess.execPrompt(
        execPromptInput,
        new PromptContext(),
        execPromptOutput,
      );
      prompt = execPromptOutput.prompt;
    } else {
      prompt = `You are an MCP tool recommender. Given the following agent and available MCP tools, rank the most relevant MCP tools for this agent's task. Return ONLY a JSON array of MCP IDs in order of relevance.\n\nAgent ID: ${input.agent_id}\n\nAvailable MCP tools:\n${mcpDescriptions.join('\n')}\n\nReturn JSON array of MCP IDs only.`;
    }

    const execInput = new ExecLLMInput();
    execInput.id = '';
    execInput.prompt = prompt;
    const execOutput = new ExecLLMOutput();
    await this.llmAccess.execLLM(
      execInput,
      new LLMContext(),
      execOutput,
    );

    return this.parseLLMRanking(execOutput.result, mcps);
  }

  private parseLLMRanking(
    result: string,
    mcps: McpInstallRecord[],
  ): string[] {
    try {
      const trimmed = result.trim();
      const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as unknown[];
        const rankedIds = parsed
          .filter((v): v is string => typeof v === 'string')
          .filter((id) => mcps.some((m) => m.id === id));
        return rankedIds;
      }
    } catch {
      // If parsing fails, return all MCP IDs
    }
    return mcps.map((m) => m.id);
  }
}
