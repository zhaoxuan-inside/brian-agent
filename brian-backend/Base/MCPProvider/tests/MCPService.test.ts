import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import {
  DBContext,
  CloseDBInput,
  CloseDBOutput,
} from '../../RelationDBProvider/domain/types';
import { MCPAccess } from '../access/MCPAccess';
import {
  McpContext,
  AddMcpProviderInput,
  AddMcpProviderOutput,
  DelMcpProviderInput,
  DelMcpProviderOutput,
  UpdateMcpProviderInput,
  UpdateMcpProviderOutput,
  SoMcpProviderInput,
  SoMcpProviderOutput,
  TestMcpProviderInput,
  TestMcpProviderOutput,
  ListMcpInput,
  ListMcpOutput,
  InstallMcpInput,
  InstallMcpOutput,
  StartMcpInput,
  StartMcpOutput,
  StopMcpInput,
  StopMcpOutput,
  UninstallMcpInput,
  UninstallMcpOutput,
  UpdateMcpInput,
  UpdateMcpOutput,
  GetMcpInput,
  GetMcpOutput,
  SoMcpInput,
  SoMcpOutput,
  ExecMcpInput,
  ExecMcpOutput,
  EnableMCPInput,
  EnableMCPOutput,
  MCP_PROVIDER_TABLE,
  MCP_CACHE_TABLE,
  MCP_INSTALL_TABLE,
  MCP_USAGE_TABLE,
  MCP_CONFIG_TABLE,
  MCP_DEFAULT_CONFIGS,
  MCP_DEFAULT_PROVIDERS,
} from '../domain/types';
import { Operator, Direction } from '../../shared/query';
import { ComponentDisabledError, ValidationError, NotFoundError } from '../../shared/errors';

const TEST_PKG_NAME = 'cowsay';
const TEST_INSTALL_CMD = `npm install --prefix ${os.tmpdir()} ${TEST_PKG_NAME}`;

let tmpDir: string;
let dbAccess: RelationDBAccess;
let mcpAccess: MCPAccess;

describe('MCPProvider MCPService', () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-mcp-'));
    dbAccess = new RelationDBAccess({ dbPath: path.join(tmpDir, 'test.db') });
    await dbAccess.initialize();
    mcpAccess = new MCPAccess(dbAccess);
    await mcpAccess.initialize();
  });

  afterAll(async () => {
    if (dbAccess) {
      try {
        await dbAccess.closeDB(new CloseDBInput(), new DBContext(), new CloseDBOutput());
      } catch { /* close regardless */ }
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function ctx() {
    return new McpContext();
  }

  // ===========================================================================
  // 3.1 MCP 提供商管理
  // ===========================================================================

  describe('addMcpProvider (PRD 3.1.1)', () => {
    it('should add a provider and return id via output', async () => {
      const input = new AddMcpProviderInput();
      input.data = { mcp_provider_url: 'https://registry.modelcontextprotocol.io', mcp_provider_title: 'MCP Registry', mcp_provider_brief: 'Official MCP registry' };
      const output = new AddMcpProviderOutput();
      const ok = await mcpAccess.addMcpProvider(input, ctx(), output);
      expect(ok).toBe(true);
      expect(output.id).toBeTruthy();
      expect(output.id.length).toBeGreaterThan(0);
    });

    it('should default enable to true', async () => {
      const input = new AddMcpProviderInput();
      input.data = { mcp_provider_url: 'https://example.com/mcp', mcp_provider_title: 'Test Provider' };
      const output = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(input, ctx(), output);

      const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [
        { field: 'id', operator: Operator.EQ, value: output.id },
      ]);
      expect(row).toBeTruthy();
      expect(row!.enable).toBe(1);
    });

    it('should allow explicit enable=false', async () => {
      const input = new AddMcpProviderInput();
      input.data = { mcp_provider_url: 'https://example.com/mcp2', mcp_provider_title: 'Disabled Provider', enable: false };
      const output = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(input, ctx(), output);

      const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [
        { field: 'id', operator: Operator.EQ, value: output.id },
      ]);
      expect(row).toBeTruthy();
      expect(row!.enable).toBe(0);
    });

    it('should set created and updated timestamps', async () => {
      const input = new AddMcpProviderInput();
      input.data = { mcp_provider_url: 'https://example.com/mcp3', mcp_provider_title: 'Timestamp Provider' };
      const output = new AddMcpProviderOutput();
      const before = Date.now();
      await mcpAccess.addMcpProvider(input, ctx(), output);

      const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [
        { field: 'id', operator: Operator.EQ, value: output.id },
      ]);
      expect(typeof row!.created).toBe('number');
      expect(typeof row!.updated).toBe('number');
      expect(row!.created).toBeGreaterThanOrEqual(before);
      expect(row!.created).toBeLessThanOrEqual(Date.now());
    });

    it('should store optional brief as null when not provided', async () => {
      const input = new AddMcpProviderInput();
      input.data = { mcp_provider_url: 'https://example.com/mcp4', mcp_provider_title: 'No Brief Provider' };
      const output = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(input, ctx(), output);

      const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [
        { field: 'id', operator: Operator.EQ, value: output.id },
      ]);
      expect(row!.mcp_provider_brief).toBeNull();
    });
  });

  describe('delMcpProvider (PRD 3.1.2)', () => {
    it('should delete by single id', async () => {
      const addInput = new AddMcpProviderInput();
      addInput.data = { mcp_provider_url: 'https://del1.example.com', mcp_provider_title: 'Del Provider 1' };
      const addOutput = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(addInput, ctx(), addOutput);

      const delInput = new DelMcpProviderInput();
      delInput.ids = [addOutput.id];
      const delOutput = new DelMcpProviderOutput();
      const ok = await mcpAccess.delMcpProvider(delInput, ctx(), delOutput);
      expect(ok).toBe(true);
      expect(delOutput.affected_rows).toBe(1);

      const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [
        { field: 'id', operator: Operator.EQ, value: addOutput.id },
      ]);
      expect(row).toBeNull();
    });

    it('should delete by multiple ids (batch)', async () => {
      const addOutput1 = new AddMcpProviderOutput();
      const addOutput2 = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(
        Object.assign(new AddMcpProviderInput(), { data: { mcp_provider_url: 'https://batch1.example.com', mcp_provider_title: 'Batch 1' } }),
        ctx(), addOutput1);
      await mcpAccess.addMcpProvider(
        Object.assign(new AddMcpProviderInput(), { data: { mcp_provider_url: 'https://batch2.example.com', mcp_provider_title: 'Batch 2' } }),
        ctx(), addOutput2);

      const delInput = new DelMcpProviderInput();
      delInput.ids = [addOutput1.id, addOutput2.id];
      const delOutput = new DelMcpProviderOutput();
      await mcpAccess.delMcpProvider(delInput, ctx(), delOutput);
      expect(delOutput.affected_rows).toBe(2);
    });

    it('should delete by conditions', async () => {
      const addInput = new AddMcpProviderInput();
      addInput.data = { mcp_provider_url: 'https://cond.example.com', mcp_provider_title: 'Condition Provider' };
      const addOutput = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(addInput, ctx(), addOutput);

      const delInput = new DelMcpProviderInput();
      delInput.conditions = [{ field: 'mcp_provider_title', operator: Operator.EQ, value: 'Condition Provider' }];
      const delOutput = new DelMcpProviderOutput();
      await mcpAccess.delMcpProvider(delInput, ctx(), delOutput);
      expect(delOutput.affected_rows).toBe(1);
    });

    it('should cascade delete cache and install records', async () => {
      const addInput = new AddMcpProviderInput();
      addInput.data = { mcp_provider_url: 'https://cascade.example.com', mcp_provider_title: 'Cascade Provider' };
      const addOutput = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(addInput, ctx(), addOutput);

      // seed a cache entry and an install entry linked to this provider
      await dbAccess.insert(MCP_CACHE_TABLE, [
        { field: 'id', value: 'cache-1' },
        { field: 'created', value: Date.now() },
        { field: 'updated', value: Date.now() },
        { field: 'mcp_provider_id', value: addOutput.id },
        { field: 'mcp_title', value: 'Test MCP' },
        { field: 'mcp_brief', value: 'desc' },
        { field: 'mcp_install_cmd', value: 'echo test' },
      ]);
      await dbAccess.insert(MCP_INSTALL_TABLE, [
        { field: 'id', value: 'install-1' },
        { field: 'created', value: Date.now() },
        { field: 'updated', value: Date.now() },
        { field: 'mcp_provider_id', value: addOutput.id },
        { field: 'mcp_title', value: 'Test MCP' },
        { field: 'mcp_brief', value: 'desc' },
        { field: 'mcp_install_cmd', value: 'echo test' },
        { field: 'mcp_start_cmd', value: 'echo start' },
        { field: 'mcp_stop_cmd', value: 'echo stop' },
        { field: 'mcp_uninstall_cmd', value: 'echo uninstall' },
        { field: 'enable', value: 1 },
      ]);

      const delInput = new DelMcpProviderInput();
      delInput.ids = [addOutput.id];
      const delOutput = new DelMcpProviderOutput();
      await mcpAccess.delMcpProvider(delInput, ctx(), delOutput);

      const cacheRow = await dbAccess.selectOne(MCP_CACHE_TABLE, [{ field: 'id', operator: Operator.EQ, value: 'cache-1' }]);
      expect(cacheRow).toBeNull();
      const installRow = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: 'install-1' }]);
      expect(installRow).toBeNull();
    });

    it('should throw ValidationError when neither ids nor conditions provided', async () => {
      const delInput = new DelMcpProviderInput();
      const delOutput = new DelMcpProviderOutput();
      await expect(
        mcpAccess.delMcpProvider(delInput, ctx(), delOutput),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateMcpProvider (PRD 3.1.3)', () => {
    let providerId: string;

    beforeAll(async () => {
      const input = new AddMcpProviderInput();
      input.data = { mcp_provider_url: 'https://update.example.com', mcp_provider_title: 'Original Title', mcp_provider_brief: 'original brief' };
      const output = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(input, ctx(), output);
      providerId = output.id;
    });

    it('should update title and url', async () => {
      const input = new UpdateMcpProviderInput();
      input.id = providerId;
      input.data = { mcp_provider_title: 'Updated Title', mcp_provider_url: 'https://updated.example.com' };
      const output = new UpdateMcpProviderOutput();
      const ok = await mcpAccess.updateMcpProvider(input, ctx(), output);
      expect(ok).toBe(true);

      const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [{ field: 'id', operator: Operator.EQ, value: providerId }]);
      expect(row!.mcp_provider_title).toBe('Updated Title');
      expect(row!.mcp_provider_url).toBe('https://updated.example.com');
    });

    it('should update enable status', async () => {
      const input = new UpdateMcpProviderInput();
      input.id = providerId;
      input.data = { enable: false };
      await mcpAccess.updateMcpProvider(input, ctx(), new UpdateMcpProviderOutput());

      const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [{ field: 'id', operator: Operator.EQ, value: providerId }]);
      expect(row!.enable).toBe(0);
    });

    it('should update updated timestamp', async () => {
      const before = Date.now();
      const input = new UpdateMcpProviderInput();
      input.id = providerId;
      input.data = { mcp_provider_title: 'Timestamp Updated' };
      await mcpAccess.updateMcpProvider(input, ctx(), new UpdateMcpProviderOutput());

      const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [{ field: 'id', operator: Operator.EQ, value: providerId }]);
      expect(row!.updated).toBeGreaterThanOrEqual(before);
    });

    it('should update brief', async () => {
      const input = new UpdateMcpProviderInput();
      input.id = providerId;
      input.data = { mcp_provider_brief: 'new brief' };
      await mcpAccess.updateMcpProvider(input, ctx(), new UpdateMcpProviderOutput());

      const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [{ field: 'id', operator: Operator.EQ, value: providerId }]);
      expect(row!.mcp_provider_brief).toBe('new brief');
    });
  });

  describe('soMcpProvider (PRD 3.1.4)', () => {
    beforeAll(async () => {
      const titles = ['Alpha Provider', 'Beta Provider', 'Alpha Beta Combined'];
      for (const title of titles) {
        const input = new AddMcpProviderInput();
        input.data = { mcp_provider_url: `https://${title.toLowerCase().replace(/\s/g, '-')}.example.com`, mcp_provider_title: title };
        await mcpAccess.addMcpProvider(input, ctx(), new AddMcpProviderOutput());
      }
    });

    it('should search by keyword matching title', async () => {
      const input = new SoMcpProviderInput();
      input.keyword = 'Alpha';
      const output = new SoMcpProviderOutput();
      const ok = await mcpAccess.soMcpProvider(input, ctx(), output);
      expect(ok).toBe(true);
      expect(output.list.length).toBeGreaterThanOrEqual(2);
      for (const p of output.list) {
        expect(p.mcp_provider_title).toMatch(/Alpha/i);
      }
    });

    it('should filter by conditions', async () => {
      const input = new SoMcpProviderInput();
      input.conditions = [{ field: 'mcp_provider_title', operator: Operator.EQ, value: 'Beta Provider' }];
      const output = new SoMcpProviderOutput();
      await mcpAccess.soMcpProvider(input, ctx(), output);
      expect(output.list.length).toBe(1);
      expect(output.list[0].mcp_provider_title).toBe('Beta Provider');
    });

    it('should paginate results', async () => {
      const input = new SoMcpProviderInput();
      input.page = { current: 1, size: 1 };
      const output = new SoMcpProviderOutput();
      await mcpAccess.soMcpProvider(input, ctx(), output);
      expect(output.list.length).toBeLessThanOrEqual(1);
      expect(output.total).toBeGreaterThanOrEqual(3);
    });

    it('should sort results', async () => {
      const input = new SoMcpProviderInput();
      input.order_by = [{ field: 'mcp_provider_title', direction: Direction.ASC }];
      const output = new SoMcpProviderOutput();
      await mcpAccess.soMcpProvider(input, ctx(), output);
      for (let i = 1; i < output.list.length; i++) {
        expect(output.list[i - 1].mcp_provider_title <= output.list[i].mcp_provider_title).toBe(true);
      }
    });

    it('should return empty list for non-matching keyword', async () => {
      const input = new SoMcpProviderInput();
      input.keyword = 'ZzzNonExistent';
      const output = new SoMcpProviderOutput();
      await mcpAccess.soMcpProvider(input, ctx(), output);
      expect(output.list.length).toBe(0);
      expect(output.total).toBe(0);
    });
  });

  describe('testMcpProvider (PRD 3.1.5)', () => {
    it('should test connectivity to a real URL', async () => {
      const addInput = new AddMcpProviderInput();
      addInput.data = { mcp_provider_url: 'https://www.google.com', mcp_provider_title: 'Google Test' };
      const addOutput = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(addInput, ctx(), addOutput);

      const input = new TestMcpProviderInput();
      input.id = addOutput.id;
      const output = new TestMcpProviderOutput();
      const ok = await mcpAccess.testMcpProvider(input, ctx(), output);
      expect(ok).toBe(true);
      expect(typeof output.connected).toBe('boolean');
      expect(typeof output.response_time_ms).toBe('number');
      expect(output.response_time_ms).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should throw NotFoundError for non-existent provider', async () => {
      const input = new TestMcpProviderInput();
      input.id = 'non-existent-id-ffffffff';
      const output = new TestMcpProviderOutput();
      await expect(
        mcpAccess.testMcpProvider(input, ctx(), output),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('listMcp (PRD 3.1.6)', () => {
    let providerId: string;

    beforeAll(async () => {
      const addInput = new AddMcpProviderInput();
      addInput.data = { mcp_provider_url: 'https://registry.modelcontextprotocol.io', mcp_provider_title: 'ListMcp Provider' };
      const addOutput = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(addInput, ctx(), addOutput);
      providerId = addOutput.id;
    });

    it('should handle cache miss and attempt API call', async () => {
      const input = new ListMcpInput();
      input.mcp_provider_id = providerId;
      const output = new ListMcpOutput();
      const ok = await mcpAccess.listMcp(input, ctx(), output);
      expect(ok).toBe(true);
      expect(Array.isArray(output.list)).toBe(true);
      expect(typeof output.total).toBe('number');
    }, 45000);

    it('should return cached results on second call (within TTL)', async () => {
      const input = new ListMcpInput();
      input.mcp_provider_id = providerId;
      const output = new ListMcpOutput();
      const ok = await mcpAccess.listMcp(input, ctx(), output);
      expect(ok).toBe(true);

      // second call - should use cache
      const output2 = new ListMcpOutput();
      await mcpAccess.listMcp(input, ctx(), output2);
      expect(output2.total).toBe(output.total);
    }, 30000);

    it('should support pagination', async () => {
      const input = new ListMcpInput();
      input.mcp_provider_id = providerId;
      input.page = { current: 1, size: 10 };
      const output = new ListMcpOutput();
      await mcpAccess.listMcp(input, ctx(), output);
      expect(output.list.length).toBeLessThanOrEqual(10);
    });

    it('should throw NotFoundError for non-existent provider', async () => {
      const input = new ListMcpInput();
      input.mcp_provider_id = 'non-existent-id-eeeeeeee';
      const output = new ListMcpOutput();
      await expect(
        mcpAccess.listMcp(input, ctx(), output),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ===========================================================================
  // 3.2 MCP 管理
  // ===========================================================================

  describe('installMcp (PRD 3.2.1)', () => {
    let providerId: string;
    let cacheId: string;

    beforeAll(async () => {
      const addInput = new AddMcpProviderInput();
      addInput.data = { mcp_provider_url: 'https://install.example.com', mcp_provider_title: 'Install Provider' };
      const addOutput = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(addInput, ctx(), addOutput);
      providerId = addOutput.id;

      // seed cache entry with real npm install command
      await dbAccess.insert(MCP_CACHE_TABLE, [
        { field: 'id', value: 'cache-install-test' },
        { field: 'created', value: Date.now() },
        { field: 'updated', value: Date.now() },
        { field: 'mcp_provider_id', value: providerId },
        { field: 'mcp_title', value: TEST_PKG_NAME },
        { field: 'mcp_brief', value: 'Configurable talking cow' },
        { field: 'mcp_install_cmd', value: TEST_INSTALL_CMD },
      ]);
      cacheId = 'cache-install-test';
    });

    it('should install MCP and create install record', async () => {
      const input = new InstallMcpInput();
      input.mcp_provider_id = providerId;
      input.mcp_id = cacheId;
      const output = new InstallMcpOutput();
      const ok = await mcpAccess.installMcp(input, ctx(), output);
      expect(ok).toBe(true);
      expect(output.id).toBeTruthy();

      const row = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: output.id }]);
      expect(row).toBeTruthy();
      expect(row!.mcp_title).toBe(TEST_PKG_NAME);
      expect(row!.mcp_provider_id).toBe(providerId);
    });

    it('should generate start/stop/uninstall commands', async () => {
      const input = new InstallMcpInput();
      input.mcp_provider_id = providerId;
      input.mcp_id = cacheId;
      const output = new InstallMcpOutput();
      await mcpAccess.installMcp(input, ctx(), output);

      const row = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: output.id }]);
      expect(row!.mcp_start_cmd).toBe(`npx ${TEST_PKG_NAME}`);
      expect(row!.mcp_stop_cmd).toBe(`pkill -f ${TEST_PKG_NAME}`);
      expect(row!.mcp_uninstall_cmd).toBe(`npm uninstall ${TEST_PKG_NAME}`);
    });

    it('should default enable to true', async () => {
      const input = new InstallMcpInput();
      input.mcp_provider_id = providerId;
      input.mcp_id = cacheId;
      const output = new InstallMcpOutput();
      await mcpAccess.installMcp(input, ctx(), output);

      const row = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: output.id }]);
      expect(row!.enable).toBe(1);
    });

    it('should set created and updated timestamps on install record', async () => {
      const input = new InstallMcpInput();
      input.mcp_provider_id = providerId;
      input.mcp_id = cacheId;
      const output = new InstallMcpOutput();
      const before = Date.now();
      await mcpAccess.installMcp(input, ctx(), output);

      const row = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: output.id }]);
      expect(typeof row!.created).toBe('number');
      expect(row!.created).toBeGreaterThanOrEqual(before);
    });

    it('should throw NotFoundError for non-existent cache entry', async () => {
      const input = new InstallMcpInput();
      input.mcp_provider_id = providerId;
      input.mcp_id = 'non-existent-cache-id';
      const output = new InstallMcpOutput();
      await expect(
        mcpAccess.installMcp(input, ctx(), output),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('startMcp, stopMcp, uninstallMcp (PRD 3.2.2 - 3.2.4)', () => {
    let installId: string;

    beforeAll(async () => {
      // seed an install record so we can test start/stop/uninstall without network
      await dbAccess.insert(MCP_INSTALL_TABLE, [
        { field: 'id', value: 'install-lifecycle-test' },
        { field: 'created', value: Date.now() },
        { field: 'updated', value: Date.now() },
        { field: 'mcp_provider_id', value: 'fake-provider' },
        { field: 'mcp_title', value: TEST_PKG_NAME },
        { field: 'mcp_brief', value: 'test mcp' },
        { field: 'mcp_install_cmd', value: 'echo installed' },
        { field: 'mcp_start_cmd', value: `npx ${TEST_PKG_NAME} hello` },
        { field: 'mcp_stop_cmd', value: `pkill -f ${TEST_PKG_NAME}` },
        { field: 'mcp_uninstall_cmd', value: 'echo uninstalled' },
        { field: 'enable', value: 1 },
      ]);
      installId = 'install-lifecycle-test';
    });

    it('should start MCP (PRD 3.2.2)', async () => {
      const input = new StartMcpInput();
      input.id = installId;
      const output = new StartMcpOutput();
      const ok = await mcpAccess.startMcp(input, ctx(), output);
      expect(ok).toBe(true);
    });

    it('should throw NotFoundError when starting non-existent MCP', async () => {
      const input = new StartMcpInput();
      input.id = 'non-existent-install-id';
      await expect(
        mcpAccess.startMcp(input, ctx(), new StartMcpOutput()),
      ).rejects.toThrow(NotFoundError);
    });

    it('should stop MCP (PRD 3.2.3)', async () => {
      const input = new StopMcpInput();
      input.id = installId;
      const output = new StopMcpOutput();
      const ok = await mcpAccess.stopMcp(input, ctx(), output);
      expect(ok).toBe(true);
    });

    it('should throw NotFoundError when stopping non-existent MCP', async () => {
      const input = new StopMcpInput();
      input.id = 'non-existent-install-id';
      await expect(
        mcpAccess.stopMcp(input, ctx(), new StopMcpOutput()),
      ).rejects.toThrow(NotFoundError);
    });

    it('should uninstall MCP and delete install record (PRD 3.2.4)', async () => {
      const input = new UninstallMcpInput();
      input.id = installId;
      const output = new UninstallMcpOutput();
      const ok = await mcpAccess.uninstallMcp(input, ctx(), output);
      expect(ok).toBe(true);

      const row = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: installId }]);
      expect(row).toBeNull();
    });

    it('should throw NotFoundError when uninstalling non-existent MCP', async () => {
      const input = new UninstallMcpInput();
      input.id = 'non-existent-install-id';
      await expect(
        mcpAccess.uninstallMcp(input, ctx(), new UninstallMcpOutput()),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateMcp (PRD 3.2.5)', () => {
    let installId: string;

    beforeAll(async () => {
      await dbAccess.insert(MCP_INSTALL_TABLE, [
        { field: 'id', value: 'install-update-test' },
        { field: 'created', value: Date.now() },
        { field: 'updated', value: Date.now() },
        { field: 'mcp_provider_id', value: 'fake-provider' },
        { field: 'mcp_title', value: 'Old Title' },
        { field: 'mcp_brief', value: 'old brief' },
        { field: 'mcp_install_cmd', value: 'echo old' },
        { field: 'mcp_start_cmd', value: 'echo start' },
        { field: 'mcp_stop_cmd', value: 'echo stop' },
        { field: 'mcp_uninstall_cmd', value: 'echo uninstall' },
        { field: 'enable', value: 1 },
      ]);
      installId = 'install-update-test';
    });

    it('should update title and brief', async () => {
      const input = new UpdateMcpInput();
      input.id = installId;
      input.data = { mcp_title: 'New Title', mcp_brief: 'new brief' };
      const ok = await mcpAccess.updateMcp(input, ctx(), new UpdateMcpOutput());
      expect(ok).toBe(true);

      const row = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: installId }]);
      expect(row!.mcp_title).toBe('New Title');
      expect(row!.mcp_brief).toBe('new brief');
    });

    it('should update command fields', async () => {
      const input = new UpdateMcpInput();
      input.id = installId;
      input.data = { mcp_install_cmd: 'echo new-install', mcp_start_cmd: 'echo new-start' };
      await mcpAccess.updateMcp(input, ctx(), new UpdateMcpOutput());

      const row = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: installId }]);
      expect(row!.mcp_install_cmd).toBe('echo new-install');
      expect(row!.mcp_start_cmd).toBe('echo new-start');
    });

    it('should update enable status', async () => {
      const input = new UpdateMcpInput();
      input.id = installId;
      input.data = { enable: false };
      await mcpAccess.updateMcp(input, ctx(), new UpdateMcpOutput());

      const row = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: installId }]);
      expect(row!.enable).toBe(0);
    });

    it('should update updated timestamp on change', async () => {
      const before = Date.now();
      const input = new UpdateMcpInput();
      input.id = installId;
      input.data = { mcp_title: 'After Timestamp' };
      await mcpAccess.updateMcp(input, ctx(), new UpdateMcpOutput());

      const row = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: installId }]);
      expect(row!.updated).toBeGreaterThanOrEqual(before);
    });

    it('should prevent disabling a running MCP (PRD 3.2.5 constraint)', async () => {
      // seed a new install record
      const newInstallId = 'install-running-test';
      await dbAccess.insert(MCP_INSTALL_TABLE, [
        { field: 'id', value: newInstallId },
        { field: 'created', value: Date.now() },
        { field: 'updated', value: Date.now() },
        { field: 'mcp_provider_id', value: 'fake-provider' },
        { field: 'mcp_title', value: 'Running MCP' },
        { field: 'mcp_brief', value: 'running' },
        { field: 'mcp_install_cmd', value: 'echo running' },
        { field: 'mcp_start_cmd', value: 'echo started' },
        { field: 'mcp_stop_cmd', value: 'echo stopped' },
        { field: 'mcp_uninstall_cmd', value: 'echo uninstall' },
        { field: 'enable', value: 1 },
      ]);

      // start it to mark as running
      await mcpAccess.startMcp(
        Object.assign(new StartMcpInput(), { id: newInstallId }),
        ctx(),
        new StartMcpOutput(),
      );

      // try to disable — should throw
      const updateInput = new UpdateMcpInput();
      updateInput.id = newInstallId;
      updateInput.data = { enable: false };
      await expect(
        mcpAccess.updateMcp(updateInput, ctx(), new UpdateMcpOutput()),
      ).rejects.toThrow(ValidationError);

      // stop it first, then disable should work
      await mcpAccess.stopMcp(
        Object.assign(new StopMcpInput(), { id: newInstallId }),
        ctx(),
        new StopMcpOutput(),
      );

      const ok = await mcpAccess.updateMcp(updateInput, ctx(), new UpdateMcpOutput());
      expect(ok).toBe(true);
    });
  });

  describe('getMcp (PRD 3.2.6)', () => {
    let installId: string;

    beforeAll(async () => {
      await dbAccess.insert(MCP_INSTALL_TABLE, [
        { field: 'id', value: 'install-get-test' },
        { field: 'created', value: Date.now() },
        { field: 'updated', value: Date.now() },
        { field: 'mcp_provider_id', value: 'fake-provider' },
        { field: 'mcp_title', value: 'Get Me MCP' },
        { field: 'mcp_brief', value: 'MCP for getMcp testing' },
        { field: 'mcp_install_cmd', value: 'echo get' },
        { field: 'mcp_start_cmd', value: 'echo start' },
        { field: 'mcp_stop_cmd', value: 'echo stop' },
        { field: 'mcp_uninstall_cmd', value: 'echo uninstall' },
        { field: 'enable', value: 1 },
      ]);
      installId = 'install-get-test';
    });

    it('should get by id', async () => {
      const input = new GetMcpInput();
      input.id = installId;
      const output = new GetMcpOutput();
      const ok = await mcpAccess.getMcp(input, ctx(), output);
      expect(ok).toBe(true);
      expect(output.mcp).not.toBeNull();
      expect(output.mcp!.id).toBe(installId);
      expect(output.mcp!.mcp_title).toBe('Get Me MCP');
    });

    it('should get by conditions', async () => {
      const input = new GetMcpInput();
      input.conditions = [{ field: 'mcp_title', operator: Operator.EQ, value: 'Get Me MCP' }];
      const output = new GetMcpOutput();
      await mcpAccess.getMcp(input, ctx(), output);
      expect(output.mcp).not.toBeNull();
      expect(output.mcp!.id).toBe(installId);
    });

    it('should return null for non-existent id', async () => {
      const input = new GetMcpInput();
      input.id = 'non-existent-install-id';
      const output = new GetMcpOutput();
      await mcpAccess.getMcp(input, ctx(), output);
      expect(output.mcp).toBeNull();
    });

    it('should throw ValidationError when neither id nor conditions provided', async () => {
      const input = new GetMcpInput();
      const output = new GetMcpOutput();
      await expect(
        mcpAccess.getMcp(input, ctx(), output),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('soMcp (PRD 3.2.7)', () => {
    beforeAll(async () => {
      const entries = [
        { title: 'SearchAlpha', brief: 'Alpha brief description' },
        { title: 'SearchBeta', brief: 'Beta brief description' },
        { title: 'AlphaBeta', brief: 'Combined alpha beta' },
      ];
      for (const e of entries) {
        await dbAccess.insert(MCP_INSTALL_TABLE, [
          { field: 'id', value: `install-so-${e.title}` },
          { field: 'created', value: Date.now() },
          { field: 'updated', value: Date.now() },
          { field: 'mcp_provider_id', value: 'fake-provider' },
          { field: 'mcp_title', value: e.title },
          { field: 'mcp_brief', value: e.brief },
          { field: 'mcp_install_cmd', value: 'echo test' },
          { field: 'mcp_start_cmd', value: 'echo start' },
          { field: 'mcp_stop_cmd', value: 'echo stop' },
          { field: 'mcp_uninstall_cmd', value: 'echo uninstall' },
          { field: 'enable', value: 1 },
        ]);
      }
    });

    it('should search by keyword matching title', async () => {
      const input = new SoMcpInput();
      input.keyword = 'Alpha';
      const output = new SoMcpOutput();
      await mcpAccess.soMcp(input, ctx(), output);
      expect(output.list.length).toBeGreaterThanOrEqual(2);
      for (const m of output.list) {
        const match = m.mcp_title.includes('Alpha') || m.mcp_brief.includes('Alpha');
        expect(match).toBe(true);
      }
    });

    it('should search by keyword matching brief', async () => {
      const input = new SoMcpInput();
      input.keyword = 'brief description';
      const output = new SoMcpOutput();
      await mcpAccess.soMcp(input, ctx(), output);
      expect(output.list.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by conditions', async () => {
      const input = new SoMcpInput();
      input.conditions = [{ field: 'mcp_title', operator: Operator.EQ, value: 'SearchBeta' }];
      const output = new SoMcpOutput();
      await mcpAccess.soMcp(input, ctx(), output);
      expect(output.list.length).toBe(1);
      expect(output.list[0].mcp_title).toBe('SearchBeta');
    });

    it('should paginate and count total', async () => {
      const input = new SoMcpInput();
      input.page = { current: 1, size: 1 };
      const output = new SoMcpOutput();
      await mcpAccess.soMcp(input, ctx(), output);
      expect(output.list.length).toBeLessThanOrEqual(1);
      expect(output.total).toBeGreaterThanOrEqual(3);
    });

    it('should sort results', async () => {
      const input = new SoMcpInput();
      input.order_by = [{ field: 'mcp_title', direction: Direction.DESC }];
      const output = new SoMcpOutput();
      await mcpAccess.soMcp(input, ctx(), output);
      for (let i = 1; i < output.list.length; i++) {
        expect(output.list[i - 1].mcp_title >= output.list[i].mcp_title).toBe(true);
      }
    });

    it('should return empty list for non-matching keyword', async () => {
      const input = new SoMcpInput();
      input.keyword = 'ZzzNonExistentMCP';
      const output = new SoMcpOutput();
      await mcpAccess.soMcp(input, ctx(), output);
      expect(output.list.length).toBe(0);
      expect(output.total).toBe(0);
    });
  });

  // ===========================================================================
  // 3.3 MCP 调用
  // ===========================================================================

  describe('execMcp (PRD 3.3.1)', () => {
    let installId: string;

    beforeAll(async () => {
      await dbAccess.insert(MCP_INSTALL_TABLE, [
        { field: 'id', value: 'install-exec-test' },
        { field: 'created', value: Date.now() },
        { field: 'updated', value: Date.now() },
        { field: 'mcp_provider_id', value: 'fake-provider' },
        { field: 'mcp_title', value: 'Exec MCP' },
        { field: 'mcp_brief', value: 'MCP for exec testing' },
        { field: 'mcp_install_cmd', value: 'echo exec' },
        { field: 'mcp_start_cmd', value: 'echo' },
        { field: 'mcp_stop_cmd', value: 'echo stop' },
        { field: 'mcp_uninstall_cmd', value: 'echo uninstall' },
        { field: 'enable', value: 1 },
      ]);
      installId = 'install-exec-test';
    });

    it('should execute MCP and return result', async () => {
      const input = new ExecMcpInput();
      input.id = installId;
      input.params = { test: 'hello' };
      const output = new ExecMcpOutput();
      const ok = await mcpAccess.execMcp(input, ctx(), output);
      expect(ok).toBe(true);
      expect(output.result).toBeDefined();
    });

    it('should increment usage count after successful call', async () => {
      const input = new ExecMcpInput();
      input.id = installId;
      input.params = { action: 'test' };
      const output = new ExecMcpOutput();
      await mcpAccess.execMcp(input, ctx(), output);

      const today = new Date().toISOString().slice(0, 10);
      const usageRow = await dbAccess.selectOne(MCP_USAGE_TABLE, [
        { field: 'mcp_install_id', operator: Operator.EQ, value: installId },
        { field: 'usage_date', operator: Operator.EQ, value: today },
      ]);
      expect(usageRow).toBeTruthy();
      expect(usageRow!.usage_count).toBeGreaterThanOrEqual(1);
    });

    it('should accumulate usage count on multiple calls', async () => {
      const input = new ExecMcpInput();
      input.id = installId;
      input.params = { action: 'test2' };
      await mcpAccess.execMcp(input, ctx(), new ExecMcpOutput());
      await mcpAccess.execMcp(input, ctx(), new ExecMcpOutput());

      const today = new Date().toISOString().slice(0, 10);
      const usageRow = await dbAccess.selectOne(MCP_USAGE_TABLE, [
        { field: 'mcp_install_id', operator: Operator.EQ, value: installId },
        { field: 'usage_date', operator: Operator.EQ, value: today },
      ]);
      expect(usageRow!.usage_count).toBeGreaterThanOrEqual(3);
    });

    it('should throw NotFoundError for non-existent install', async () => {
      const input = new ExecMcpInput();
      input.id = 'non-existent-install-id';
      input.params = {};
      await expect(
        mcpAccess.execMcp(input, ctx(), new ExecMcpOutput()),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ===========================================================================
  // 3.4 可视化与运维
  // ===========================================================================

  describe('enableMCP (PRD 3.4.2)', () => {
    let installId: string;

    beforeAll(async () => {
      await dbAccess.insert(MCP_INSTALL_TABLE, [
        { field: 'id', value: 'install-enable-test' },
        { field: 'created', value: Date.now() },
        { field: 'updated', value: Date.now() },
        { field: 'mcp_provider_id', value: 'fake-provider' },
        { field: 'mcp_title', value: 'Enable Test MCP' },
        { field: 'mcp_brief', value: 'test' },
        { field: 'mcp_install_cmd', value: 'echo test' },
        { field: 'mcp_start_cmd', value: 'echo start' },
        { field: 'mcp_stop_cmd', value: 'echo stop' },
        { field: 'mcp_uninstall_cmd', value: 'echo uninstall' },
        { field: 'enable', value: 1 },
      ]);
      installId = 'install-enable-test';
    });

    it('should disable MCP component', async () => {
      const input = new EnableMCPInput();
      input.enable = false;
      const ok = await mcpAccess.enableMCP(input, ctx(), new EnableMCPOutput());
      expect(ok).toBe(true);
    });

    it('should reject operations when disabled', async () => {
      const addInput = new AddMcpProviderInput();
      addInput.data = { mcp_provider_url: 'https://disabled.example.com', mcp_provider_title: 'Should Fail' };
      await expect(
        mcpAccess.addMcpProvider(addInput, ctx(), new AddMcpProviderOutput()),
      ).rejects.toThrow(ComponentDisabledError);
    });

    it('should persist enabled state to config table', async () => {
      const row = await dbAccess.selectOne(MCP_CONFIG_TABLE, [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);
      expect(row).toBeTruthy();
      expect(String(row!.config_value)).toBe('false');
    });

    it('should re-enable MCP component', async () => {
      const input = new EnableMCPInput();
      input.enable = true;
      const ok = await mcpAccess.enableMCP(input, ctx(), new EnableMCPOutput());
      expect(ok).toBe(true);

      const row = await dbAccess.selectOne(MCP_CONFIG_TABLE, [
        { field: 'config_key', operator: Operator.EQ, value: 'enabled' },
      ]);
      expect(String(row!.config_value)).toBe('true');
    });

    it('should allow operations after re-enable', async () => {
      const addInput = new AddMcpProviderInput();
      addInput.data = { mcp_provider_url: 'https://reenabled.example.com', mcp_provider_title: 'Re-enabled Provider' };
      const output = new AddMcpProviderOutput();
      const ok = await mcpAccess.addMcpProvider(addInput, ctx(), output);
      expect(ok).toBe(true);
      expect(output.id).toBeTruthy();
    });
  });

  // ===========================================================================
  // Additional edge cases & integration tests
  // ===========================================================================

  describe('config defaults (PRD 4.5)', () => {
    it('should have enabled and cache_ttl default configs', async () => {
      for (const cfg of MCP_DEFAULT_CONFIGS) {
        const row = await dbAccess.selectOne(MCP_CONFIG_TABLE, [
          { field: 'config_key', operator: Operator.EQ, value: cfg.config_key },
        ]);
        expect(row).toBeTruthy();
        expect(String(row!.config_value)).toBe(cfg.config_value);
        expect(String(row!.value_type)).toBe(cfg.value_type);
      }
    });
  });

  describe('table schema (PRD 4)', () => {
    it('should have mcp_provider table with all required columns', async () => {
      const data = dbAccess.queryRaw<{ name: string }>('PRAGMA table_info(\'mcp_provider\')');
      const names = data.map((c) => c.name);
      expect(names).toContain('id');
      expect(names).toContain('created');
      expect(names).toContain('updated');
      expect(names).toContain('mcp_provider_url');
      expect(names).toContain('mcp_provider_title');
      expect(names).toContain('mcp_provider_brief');
      expect(names).toContain('enable');
    });

    it('should have mcp_cache table with all required columns', async () => {
      const data = dbAccess.queryRaw<{ name: string }>('PRAGMA table_info(\'mcp_cache\')');
      const names = data.map((c) => c.name);
      expect(names).toContain('id');
      expect(names).toContain('created');
      expect(names).toContain('updated');
      expect(names).toContain('mcp_provider_id');
      expect(names).toContain('mcp_title');
      expect(names).toContain('mcp_brief');
      expect(names).toContain('mcp_install_cmd');
    });

    it('should have mcp_install table with all required columns', async () => {
      const data = dbAccess.queryRaw<{ name: string }>('PRAGMA table_info(\'mcp_install\')');
      const names = data.map((c) => c.name);
      expect(names).toContain('id');
      expect(names).toContain('created');
      expect(names).toContain('updated');
      expect(names).toContain('mcp_provider_id');
      expect(names).toContain('mcp_title');
      expect(names).toContain('mcp_brief');
      expect(names).toContain('mcp_install_cmd');
      expect(names).toContain('mcp_start_cmd');
      expect(names).toContain('mcp_stop_cmd');
      expect(names).toContain('mcp_uninstall_cmd');
      expect(names).toContain('enable');
    });

    it('should have mcp_usage table with all required columns', async () => {
      const data = dbAccess.queryRaw<{ name: string }>('PRAGMA table_info(\'mcp_usage\')');
      const names = data.map((c) => c.name);
      expect(names).toContain('id');
      expect(names).toContain('created');
      expect(names).toContain('updated');
      expect(names).toContain('mcp_install_id');
      expect(names).toContain('usage_date');
      expect(names).toContain('usage_count');
    });

    it('should have mcp_config table with all required columns', async () => {
      const data = dbAccess.queryRaw<{ name: string }>('PRAGMA table_info(\'mcp_config\')');
      const names = data.map((c) => c.name);
      expect(names).toContain('config_key');
      expect(names).toContain('config_value');
      expect(names).toContain('value_type');
      expect(names).toContain('description');
      expect(names).toContain('updated');
    });
  });

  describe('AOP proxy wrapping (DevStandardization 4)', () => {
    it('should have AOP elapsed_ms on output after method call', async () => {
      const addInput = new AddMcpProviderInput();
      addInput.data = { mcp_provider_url: 'https://aop.example.com', mcp_provider_title: 'AOP Test' };
      const output = new AddMcpProviderOutput();
      await mcpAccess.addMcpProvider(addInput, ctx(), output);
      expect(output.elapsed_ms).toBeDefined();
      expect(typeof output.elapsed_ms).toBe('number');
      expect(output.elapsed_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('default MCP market providers', () => {
    it('should seed all default MCP market providers', async () => {
      for (const p of MCP_DEFAULT_PROVIDERS) {
        const row = await dbAccess.selectOne(MCP_PROVIDER_TABLE, [
          { field: 'mcp_provider_url', operator: Operator.EQ, value: p.mcp_provider_url },
        ]);
        expect(row).toBeTruthy();
        expect(row!.mcp_provider_title).toBe(p.mcp_provider_title);
        expect(row!.enable).toBe(1);
      }
    });
  });
});
