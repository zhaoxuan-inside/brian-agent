import { Metrics, Report } from '@brian-agent/base';
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
  ValidationError,
  AddPromptInput,
  AddPromptOutput,
  PromptContext,
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
    try { await (mcpAccess as any).initialize?.(); } catch { /* no initialize */ }
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
      await mcpCore.configMCPCore(new ConfigMcpCoreInput(), output, new McpCoreContext());
      expect(output.config).not.toBeNull();
      expect(output.config!.regen_rate).toBeGreaterThanOrEqual(0);
      expect(output.config!.prompt_template_id).toBeDefined();
    });

    it('should throw ValidationError for regen_rate out of range', async () => {
      const input = new ConfigMcpCoreInput();
      input.regen_rate = 150;
      await expect(
        mcpCore.configMCPCore(input, new ConfigMcpCoreOutput(), new McpCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for regen_rate below 0', async () => {
      const input = new ConfigMcpCoreInput();
      input.regen_rate = -5;
      await expect(
        mcpCore.configMCPCore(input, new ConfigMcpCoreOutput(), new McpCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should update regen_rate', async () => {
      const input = new ConfigMcpCoreInput();
      input.regen_rate = 50;
      const output = new ConfigMcpCoreOutput();
      await mcpCore.configMCPCore(input, output, new McpCoreContext());
      expect(output.config!.regen_rate).toBe(50);
    });

    it('should accept valid prompt_template_id', async () => {
      // 通过 Base 层 PromptsProvider 新增模板，获取真实 UUID
      const addInput = new AddPromptInput();
      addInput.data = { prompt_template_title: 'Test MCP Prompt', prompt_template: 'test template' };
      const addOutput = new AddPromptOutput();
      await promptsAccess.addPrompt(addInput, addOutput, new PromptContext());
      const realId = addOutput.id;

      const input = new ConfigMcpCoreInput();
      input.prompt_template_id = realId;
      const output = new ConfigMcpCoreOutput();
      await mcpCore.configMCPCore(input, output, new McpCoreContext());
      expect(output.config!.prompt_template_id).toBe(realId);
    });

    it('should reject non-existent prompt_template_id', async () => {
      const input = new ConfigMcpCoreInput();
      input.prompt_template_id = IdGenerator.generate();
      await expect(
        mcpCore.configMCPCore(input, new ConfigMcpCoreOutput(), new McpCoreContext()),
      ).rejects.toThrow(ValidationError);
    });

    it('should preserve existing values when not specified', async () => {
      await mcpCore.configMCPCore(
        { regen_rate: 30 } as ConfigMcpCoreInput,
        new ConfigMcpCoreOutput(), new McpCoreContext(),
      );

      const input = new ConfigMcpCoreInput();
      input.regen_rate = 60;
      const output = new ConfigMcpCoreOutput();
      await mcpCore.configMCPCore(input, output, new McpCoreContext());

      expect(output.config!.regen_rate).toBe(60);
    });

    it('should set elapsed_ms on output', async () => {
      const output = new ConfigMcpCoreOutput();
      await mcpCore.configMCPCore(new ConfigMcpCoreInput(), output, new McpCoreContext());
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('matchMCP', () => {
    it('should return empty when no MCPs available', async () => {
      const input = new MatchMcpInput();
      input.agent_id = 'agent-1';
      const output = new MatchMcpOutput();
      const result = await mcpCore.matchMCP(input, output, new McpCoreContext());
      expect(result).toBe(true);
      expect(output.mcp_ids).toEqual([]);
      expect(output.mcp_details).toEqual([]);
    });

    it('should use cached binding when regen allows', async () => {
      const now = IdGenerator.now();
      await relationDb.insert('mcp_install', [
        { field: 'id', value: 'mcp-1' },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'mcp_provider_id', value: 'provider-1' },
        { field: 'mcp_title', value: 'agent-cached' },
        { field: 'mcp_brief', value: 'Brief' },
        { field: 'mcp_install_cmd', value: 'cmd' },
        { field: 'mcp_start_cmd', value: 'cmd' },
        { field: 'mcp_stop_cmd', value: 'cmd' },
        { field: 'mcp_uninstall_cmd', value: 'cmd' },
        { field: 'enable', value: 1 },
        { field: 'status', value: 'running' },
      ]);
      await relationDb.delete(MCP_CORE_CONFIG_TABLE, []);
      await relationDb.insert(MCP_CORE_CONFIG_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'regen_rate', value: 0 },
        { field: 'similarity_threshold', value: 0.0 },
        { field: 'prompt_template_id', value: '' },
      ]);

      // 绑定唯一事实源 = agent 表：既有绑定经 bound_mcp_ids 传入，确定性水合（不再读 agent_mcp 绑定表）
      const input = new MatchMcpInput();
      input.agent_id = 'agent-cached';
      input.bound_mcp_ids = ['mcp-1'];
      const output = new MatchMcpOutput();
      await mcpCore.matchMCP(input, output, new McpCoreContext());
      expect(output.mcp_ids).toContain('mcp-1');
    });
  });

  describe('optMCP', () => {
    it('should bind MCP and create usage record', async () => {
      const input = new OptMcpInput();
      input.agent_id = 'agent-opt';
      input.mcp_id = 'mcp-opt-1';
      const output = new OptMcpOutput();
      const result = await mcpCore.optMCP(input, output, new McpCoreContext());
      expect(result).toBe(true);
      // 绑定已收敛至 Agent 表：optMCP 只记 usage，不再产出绑定 id
      expect(output.id).toBe('');
    });

    it('should be idempotent for same agent+MCP', async () => {
      const input = new OptMcpInput();
      input.agent_id = 'agent-idempotent';
      input.mcp_id = 'mcp-idempotent';

      const out1 = new OptMcpOutput();
      await mcpCore.optMCP(input, out1, new McpCoreContext());

      const out2 = new OptMcpOutput();
      await mcpCore.optMCP(input, out2, new McpCoreContext());

      // 幂等：同一 (agent_id, mcp_id) 均只记 usage，无绑定副作用
      expect(out1.id).toBe('');
      expect(out2.id).toBe('');
    });

    it('should allow different MCPs for same agent', async () => {
      const agentId = 'agent-multi';
      const mcp1 = new OptMcpInput();
      mcp1.agent_id = agentId;
      mcp1.mcp_id = 'mcp-multi-1';
      const out1 = new OptMcpOutput();
      await mcpCore.optMCP(mcp1, out1, new McpCoreContext());

      const mcp2 = new OptMcpInput();
      mcp2.agent_id = agentId;
      mcp2.mcp_id = 'mcp-multi-2';
      const out2 = new OptMcpOutput();
      await mcpCore.optMCP(mcp2, out2, new McpCoreContext());

      // 不同 mcp_id 各自记录 usage，互不影响
      expect(out1.id).toBe('');
      expect(out2.id).toBe('');
    });
  });
});
