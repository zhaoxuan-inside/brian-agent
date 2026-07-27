import type {
  RelationDBAccess,
  MCPAccess,
  LLMAccess,
  PromptsAccess,
} from '@brian-agent/base';
import { AopProxy, type Logger } from '@brian-agent/base';
import { MCPCoreSchemaInitializer } from '../infrastructure/MCPCoreSchemaInitializer';
import { MCPCoreService } from '../application/MCPCoreService';
import {
  McpCoreContext,
  MatchMcpInput,
  MatchMcpOutput,
  OptMcpInput,
  OptMcpOutput,
  ConfigMcpCoreInput,
  ConfigMcpCoreOutput,
} from '../domain/types';

export class MCPCoreAccess {
  private readonly service: MCPCoreService;

  constructor(
    relationDb: RelationDBAccess,
    mcpAccess: MCPAccess,
    llmAccess: LLMAccess,
    promptsAccess: PromptsAccess,
    logger?: Logger,
  ) {
    new MCPCoreSchemaInitializer(relationDb).init();
    const rawService = new MCPCoreService(
      relationDb,
      mcpAccess,
      llmAccess,
      promptsAccess,
    );
    this.service = AopProxy.wrap(rawService, { logger });
  }

  async matchMCP(
    input: MatchMcpInput,
    context: McpCoreContext,
    output: MatchMcpOutput,
  ): Promise<boolean> {
    return this.service.matchMCP(input, context, output);
  }

  async optMCP(
    input: OptMcpInput,
    context: McpCoreContext,
    output: OptMcpOutput,
  ): Promise<boolean> {
    return this.service.optMCP(input, context, output);
  }

  async configMCPCore(
    input: ConfigMcpCoreInput,
    context: McpCoreContext,
    output: ConfigMcpCoreOutput,
  ): Promise<boolean> {
    return this.service.configMCPCore(input, context, output);
  }
}
