import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  RelationDBAccess,
  MCPAccess,
  LLMAccess,
  PromptsAccess,
  Operator,
  IdGenerator,
} from '@brian-agent/base';
import {
  MCPCoreAccess,
  McpCoreContext,
  MatchMcpInput,
  MatchMcpOutput,
  OptMcpInput,
  OptMcpOutput,
  ConfigMcpCoreInput,
  ConfigMcpCoreOutput,
  AGENT_MCP_TABLE,
  MCP_CORE_CONFIG_TABLE,
} from '../MCPCoreProvider';

describe('MCPCoreProvider', () => {
  let tempDir: string;
  let dbPath: string;
  let relationDb: RelationDBAccess;
  let mcpAccess: MCPAccess;
  let llmAccess: LLMAccess;
  let promptsAccess: PromptsAccess;
  let mcpCore: MCPCoreAccess;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-core-mcp-'));
    dbPath = path.join(tempDir, 'test.db');
    relationDb = new RelationDBAccess({ dbPath });
    await relationDb.initialize();
    mcpAccess = new MCPAccess(relationDb);
    await mcpAccess.initialize();
    llmAccess = new LLMAccess(relationDb);
    promptsAccess = new PromptsAccess(relationDb);
    await promptsAccess.initialize();
    mcpCore = new MCPCoreAccess(relationDb, mcpAccess, llmAccess, promptsAccess);
  });

  afterEach(async () => {
    try { await relationDb.closeDB(); } catch { /* ignore */ }
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('configMCPCore', () => {
    it('should return default config when no config set', async () => {
      const output = new ConfigMcpCoreOutput();
      await mcpCore.configMCPCore(new ConfigMcpCoreInput(), new McpCoreContext(), output);
      expect(output.config).not.toBeNull();
      expect(output.config!.regen_rate).toBeGreaterThanOrEqual(0);
      expect(output.config!.prompt_template_id).toBeDefined();
    });

    it('should update regen_rate', async () => {
      const input = new ConfigMcpCoreInput();
      input.regen_rate = 50;
      const output = new ConfigMcpCoreOutput();
      await mcpCore.configMCPCore(input, new McpCoreContext(), output);
      expect(output.config!.regen_rate).toBe(50);
    });

    it('should update prompt_template_id', async () => {
      const input = new ConfigMcpCoreInput();
      input.prompt_template_id = 'some-template';
      const output = new ConfigMcpCoreOutput();
      await mcpCore.configMCPCore(input, new McpCoreContext(), output);
      expect(output.config!.prompt_template_id).toBe('some-template');
    });

    it('should preserve existing values when not specified', async () => {
      await mcpCore.configMCPCore(
        { regen_rate: 30 } as ConfigMcpCoreInput,
        new McpCoreContext(),
        new ConfigMcpCoreOutput(),
      );

      const input = new ConfigMcpCoreInput();
      input.prompt_template_id = 'new-template';
      const output = new ConfigMcpCoreOutput();
      await mcpCore.configMCPCore(input, new McpCoreContext(), output);

      expect(output.config!.regen_rate).toBe(30);
      expect(output.config!.prompt_template_id).toBe('new-template');
    });

    it('should set elapsed_ms on output', async () => {
      const output = new ConfigMcpCoreOutput();
      await mcpCore.configMCPCore(new ConfigMcpCoreInput(), new McpCoreContext(), output);
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('matchMCP', () => {
    it('should return empty when no MCPs available', async () => {
      const input = new MatchMcpInput();
      input.agent_id = 'agent-1';
      const output = new MatchMcpOutput();
      const result = await mcpCore.matchMCP(input, new McpCoreContext(), output);
      expect(result).toBe(true);
      expect(output.mcp_ids).toEqual([]);
      expect(output.mcp_details).toEqual([]);
    });

    it('should use cached binding when regen allows', async () => {
      const now = IdGenerator.now();
      await relationDb.insert(AGENT_MCP_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'agent_id', value: 'agent-cached' },
        { field: 'mcp_id', value: 'mcp-1' },
      ]);
      await relationDb.delete(MCP_CORE_CONFIG_TABLE, []);
      await relationDb.insert(MCP_CORE_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'regen_rate', value: 0 },
        { field: 'prompt_template_id', value: '' },
      ]);

      const input = new MatchMcpInput();
      input.agent_id = 'agent-cached';
      const output = new MatchMcpOutput();
      await mcpCore.matchMCP(input, new McpCoreContext(), output);
      expect(output.mcp_ids).toContain('mcp-1');
    });
  });

  describe('optMCP', () => {
    it('should bind MCP and create usage record', async () => {
      const input = new OptMcpInput();
      input.agent_id = 'agent-opt';
      input.mcp_id = 'mcp-opt-1';
      const output = new OptMcpOutput();
      const result = await mcpCore.optMCP(input, new McpCoreContext(), output);
      expect(result).toBe(true);
      expect(output.id).toBeTruthy();
    });

    it('should be idempotent for same agent+MCP', async () => {
      const input = new OptMcpInput();
      input.agent_id = 'agent-idempotent';
      input.mcp_id = 'mcp-idempotent';

      const out1 = new OptMcpOutput();
      await mcpCore.optMCP(input, new McpCoreContext(), out1);

      const out2 = new OptMcpOutput();
      await mcpCore.optMCP(input, new McpCoreContext(), out2);

      expect(out1.id).toBe(out2.id);
    });

    it('should allow different MCPs for same agent', async () => {
      const agentId = 'agent-multi';
      const mcp1 = new OptMcpInput();
      mcp1.agent_id = agentId;
      mcp1.mcp_id = 'mcp-multi-1';
      const out1 = new OptMcpOutput();
      await mcpCore.optMCP(mcp1, new McpCoreContext(), out1);

      const mcp2 = new OptMcpInput();
      mcp2.agent_id = agentId;
      mcp2.mcp_id = 'mcp-multi-2';
      const out2 = new OptMcpOutput();
      await mcpCore.optMCP(mcp2, new McpCoreContext(), out2);

      expect(out1.id).not.toBe(out2.id);
    });
  });
});
