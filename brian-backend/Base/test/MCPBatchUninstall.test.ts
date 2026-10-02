import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MCPAccess, MCP_INSTALL_TABLE, McpContext, UninstallMcpsInput, UninstallMcpsOutput } from '../MCPProvider';
import { RelationDBAccess, CloseDBInput, CloseDBOutput, DBContext } from '../RelationDBProvider';
import { Operator } from '../shared/query';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('MCPProvider - batch uninstall', () => {
  let tmpDir: string;
  let dbAccess: RelationDBAccess;
  let mcpAccess: MCPAccess;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brian-test-mcp-batch-'));
    const testDbPath = path.join(tmpDir, 'test.db');
    dbAccess = new RelationDBAccess({ dbPath: testDbPath });
    await dbAccess.initialize();
    mcpAccess = new MCPAccess(dbAccess);
  });

  afterAll(async () => {
    if (dbAccess) {
      try {
        await dbAccess.closeDB(new CloseDBInput(), new CloseDBOutput(), new DBContext());
      } catch {}
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('should batch uninstall multiple MCPs and remove records from database', async () => {
    const id1 = 'mcp-batch-test-1';
    const id2 = 'mcp-batch-test-2';
    const now = Date.now();

    await dbAccess.insert(MCP_INSTALL_TABLE, [
      { field: 'id', value: id1 },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'mcp_provider_id', value: 'modelscope' },
      { field: 'mcp_title', value: 'Test Tool 1' },
      { field: 'mcp_brief', value: 'Brief 1' },
      { field: 'mcp_install_cmd', value: 'echo 1' },
      { field: 'mcp_start_cmd', value: 'echo 1' },
      { field: 'mcp_stop_cmd', value: 'echo 1' },
      { field: 'mcp_uninstall_cmd', value: 'echo 1' },
      { field: 'status', value: 'stopped' },
      { field: 'enable', value: 1 },
    ]);

    await dbAccess.insert(MCP_INSTALL_TABLE, [
      { field: 'id', value: id2 },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'mcp_provider_id', value: 'github' },
      { field: 'mcp_title', value: 'Test Tool 2' },
      { field: 'mcp_brief', value: 'Brief 2' },
      { field: 'mcp_install_cmd', value: 'echo 2' },
      { field: 'mcp_start_cmd', value: 'echo 2' },
      { field: 'mcp_stop_cmd', value: 'echo 2' },
      { field: 'mcp_uninstall_cmd', value: 'echo 2' },
      { field: 'status', value: 'stopped' },
      { field: 'enable', value: 1 },
    ]);

    const input = Object.assign(new UninstallMcpsInput(), { ids: [id1, id2, 'non-existent-id'] });
    const output = new UninstallMcpsOutput();
    const ok = await mcpAccess.uninstallMcps(input, output, new McpContext());

    expect(ok).toBe(true);
    expect(output.uninstalled_count).toBe(2);

    const row1 = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: id1 }]);
    const row2 = await dbAccess.selectOne(MCP_INSTALL_TABLE, [{ field: 'id', operator: Operator.EQ, value: id2 }]);
    expect(row1).toBeNull();
    expect(row2).toBeNull();
  });
});
