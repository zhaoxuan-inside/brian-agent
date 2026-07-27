/**
 * @fileoverview MCPProvider 应用服务层。
 *
 * 依赖 RelationDBAccess 操作关系数据库，依赖 ConfigService 管理 mcp_config 配置表。
 * 实现所有用例：提供商管理、MCP 管理、MCP 调用、可视化运维。
 */

import { execSync } from 'child_process';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ConfigService } from '../../shared/config/ConfigService';
import { ComponentDisabledError, ValidationError, NotFoundError } from '../../shared/errors';
import { IdGenerator } from '../../shared/id/IdGenerator';
import { Operator, Logic } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import {
  McpContext,
  McpProviderData,
  McpData,
  McpProviderRecord,
  McpInstallRecord,
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

/**
 * MCPProvider 应用服务。
 *
 * MCPProvider 是 MCP 的唯一操作入口，上层不可直接调用 MCP。
 */
export class MCPService {
  private enabled = true;
  private readonly config: ConfigService;
  private readonly runningMcps = new Set<string>();

  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, MCP_CONFIG_TABLE);
  }

  /** 初始化：写入默认配置、默认 MCP 市场提供商并恢复 enabled 状态 */
  async initialize(): Promise<void> {
    await this.config.initDefaults([...MCP_DEFAULT_CONFIGS]);
    this.enabled = await this.config.getBoolean('enabled', true);
    await this.seedDefaultProviders();
  }

  /** 写入默认 MCP 市场提供商（不覆盖已有记录） */
  private async seedDefaultProviders(): Promise<void> {
    for (const provider of MCP_DEFAULT_PROVIDERS) {
      const existing = await this.relationDb.count(MCP_PROVIDER_TABLE, [
        { field: 'mcp_provider_url', operator: Operator.EQ, value: provider.mcp_provider_url },
      ]);
      if (existing === 0) {
        await this.relationDb.insert(MCP_PROVIDER_TABLE, [
          { field: 'id', value: IdGenerator.generate() },
          { field: 'created', value: IdGenerator.now() },
          { field: 'updated', value: IdGenerator.now() },
          { field: 'mcp_provider_url', value: provider.mcp_provider_url },
          { field: 'mcp_provider_title', value: provider.mcp_provider_title },
          { field: 'mcp_provider_brief', value: provider.mcp_provider_brief },
          { field: 'enable', value: provider.enable ? 1 : 0 },
        ]);
      }
    }
  }

  /** 校验组件是否启用 */
  private ensureEnabled(): void {
    if (!this.enabled) {
      throw new ComponentDisabledError('MCP');
    }
  }

  /** 从 install_cmd 提取包名 */
  private extractPackageName(installCmd: string): string {
    // 支持 "npm install pkg" / "npm i pkg" / "npm install -g pkg" / "npm install --prefix /tmp pkg" 等
    const match = installCmd.match(/npm\s+(?:install|i)\s+(?:(?:-g|--prefix\s+\S+)\s+)?(.+)/);
    return match ? match[1].trim() : installCmd;
  }

  /** 根据 install_cmd 生成 start/stop/uninstall 命令 */
  private generateCommands(installCmd: string): {
    start: string;
    stop: string;
    uninstall: string;
  } {
    const pkg = this.extractPackageName(installCmd);
    return {
      start: `npx ${pkg}`,
      stop: `pkill -f ${pkg}`,
      uninstall: `npm uninstall ${pkg}`,
    };
  }

  /** upsert mcp_usage 当日使用次数 */
  private async upsertUsage(mcpInstallId: string): Promise<void> {
    const today = IdGenerator.today();
    const existing = await this.relationDb.selectOne(MCP_USAGE_TABLE, [
      { field: 'mcp_install_id', operator: Operator.EQ, value: mcpInstallId },
      { field: 'usage_date', operator: Operator.EQ, value: today },
    ]);
    if (existing) {
      await this.relationDb.update(
        MCP_USAGE_TABLE,
        [
          { field: 'usage_count', value: Number(existing.usage_count) + 1 },
          { field: 'updated', value: IdGenerator.now() },
        ],
        [
          { field: 'mcp_install_id', operator: Operator.EQ, value: mcpInstallId },
          { field: 'usage_date', operator: Operator.EQ, value: today },
        ],
      );
    } else {
      await this.relationDb.insert(MCP_USAGE_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: IdGenerator.now() },
        { field: 'updated', value: IdGenerator.now() },
        { field: 'mcp_install_id', value: mcpInstallId },
        { field: 'usage_date', value: today },
        { field: 'usage_count', value: 1 },
      ]);
    }
  }

  // -------------------------------------------------------------------------
  // MCP 提供商管理
  // -------------------------------------------------------------------------

  /** 新增 MCP 提供商（PRD 3.1.1） */
  async addMcpProvider(
    input: AddMcpProviderInput,
    _context: McpContext,
    output: AddMcpProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const d = input.data;
    const id = IdGenerator.generate();
    const now = IdGenerator.now();
    await this.relationDb.insert(MCP_PROVIDER_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'mcp_provider_url', value: d.mcp_provider_url },
      { field: 'mcp_provider_title', value: d.mcp_provider_title },
      { field: 'mcp_provider_brief', value: d.mcp_provider_brief ?? null },
      { field: 'enable', value: (d.enable ?? true) ? 1 : 0 },
    ]);
    output.id = id;
    return true;
  }

  /** 删除 MCP 提供商（PRD 3.1.2）- 级联清理 mcp_cache 和 mcp_install */
  async delMcpProvider(
    input: DelMcpProviderInput,
    _context: McpContext,
    output: DelMcpProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.ids && !input.conditions) {
      throw new ValidationError('ids 与 conditions 至少传一个');
    }
    const conditions: Condition[] = input.ids
      ? [{ field: 'id', operator: Operator.IN, value: input.ids }]
      : input.conditions!;

    // 先查出要删除的 provider ids，用于级联清理
    const providers = await this.relationDb.select(MCP_PROVIDER_TABLE, {
      conditions,
    });
    const providerIds = providers.map((p) => String(p.id));

    output.affected_rows = await this.relationDb.delete(
      MCP_PROVIDER_TABLE,
      conditions,
    );

    // 级联清理 mcp_cache 和 mcp_install
    if (providerIds.length > 0) {
      await this.relationDb.delete(MCP_CACHE_TABLE, [
        { field: 'mcp_provider_id', operator: Operator.IN, value: providerIds },
      ]);
      await this.relationDb.delete(MCP_INSTALL_TABLE, [
        { field: 'mcp_provider_id', operator: Operator.IN, value: providerIds },
      ]);
    }
    return true;
  }

  /** 更新 MCP 提供商（PRD 3.1.3） */
  async updateMcpProvider(
    input: UpdateMcpProviderInput,
    _context: McpContext,
    _output: UpdateMcpProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    const patch = input.data;
    if (patch.mcp_provider_url !== undefined) {
      data.push({ field: 'mcp_provider_url', value: patch.mcp_provider_url });
    }
    if (patch.mcp_provider_title !== undefined) {
      data.push({ field: 'mcp_provider_title', value: patch.mcp_provider_title });
    }
    if (patch.mcp_provider_brief !== undefined) {
      data.push({ field: 'mcp_provider_brief', value: patch.mcp_provider_brief });
    }
    if (patch.enable !== undefined) {
      data.push({ field: 'enable', value: patch.enable ? 1 : 0 });
    }
    await this.relationDb.update(
      MCP_PROVIDER_TABLE,
      data,
      [{ field: 'id', operator: Operator.EQ, value: input.id }],
    );
    return true;
  }

  /** 搜索 MCP 提供商（PRD 3.1.4） */
  async soMcpProvider(
    input: SoMcpProviderInput,
    _context: McpContext,
    output: SoMcpProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions: Condition[] = [];
    if (input.conditions) {
      conditions.push(...input.conditions);
    }
    if (input.keyword) {
      conditions.push({
        field: 'mcp_provider_title',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
      });
    }
    const rows = await this.relationDb.select(MCP_PROVIDER_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    output.list = rows as unknown as McpProviderRecord[];
    output.total = await this.relationDb.count(
      MCP_PROVIDER_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );
    return true;
  }

  /** 测试 MCP 提供商连接（PRD 3.1.5） */
  async testMcpProvider(
    input: TestMcpProviderInput,
    _context: McpContext,
    output: TestMcpProviderOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const provider = await this.relationDb.selectOne(MCP_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!provider) {
      throw new NotFoundError('MCP Provider', input.id);
    }
    const start = Date.now();
    try {
      // 使用 fetch 测试连通性
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      await fetch(String(provider.mcp_provider_url), {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      output.connected = true;
    } catch {
      output.connected = false;
    }
    output.response_time_ms = Date.now() - start;
    return true;
  }

  /** 获取 MCP 列表（PRD 3.1.6）- 优先从缓存读取，过期则调用提供商 API */
  async listMcp(
    input: ListMcpInput,
    _context: McpContext,
    output: ListMcpOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const cacheTtl = await this.config.getInt('cache_ttl', 86400);
    const now = IdGenerator.now();
    const cacheThreshold = now - cacheTtl * 1000;

    // 查询缓存记录
    const cached = await this.relationDb.select(MCP_CACHE_TABLE, {
      conditions: [
        { field: 'mcp_provider_id', operator: Operator.EQ, value: input.mcp_provider_id },
      ],
      order_by: [{ field: 'updated', direction: 'DESC' }],
    });

    // 判断缓存是否有效
    if (cached.length > 0 && Number(cached[0].updated) >= cacheThreshold) {
      output.list = cached;
      output.total = cached.length;
      return true;
    }

    // 缓存未命中，调用提供商 API 获取 MCP 列表
    const provider = await this.relationDb.selectOne(MCP_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.mcp_provider_id },
    ]);
    if (!provider) {
      throw new NotFoundError('MCP Provider', input.mcp_provider_id);
    }

    let mcpList: Array<{ title: string; brief: string; installCmd: string }> = [];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const resp = await fetch(`${String(provider.mcp_provider_url)}/mcps`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (resp.ok) {
        const data = (await resp.json()) as Array<{
          title?: string;
          brief?: string;
          install_cmd?: string;
        }>;
        mcpList = data.map((item) => ({
          title: item.title ?? 'unknown',
          brief: item.brief ?? '',
          installCmd: item.install_cmd ?? `npm install ${item.title}`,
        }));
      }
    } catch {
      // API 调用失败时返回空列表
    }

    // 将 MCP 信息写入 mcp_cache（先清除旧缓存）
    await this.relationDb.delete(MCP_CACHE_TABLE, [
      { field: 'mcp_provider_id', operator: Operator.EQ, value: input.mcp_provider_id },
    ]);
    for (const mcp of mcpList) {
      await this.relationDb.insert(MCP_CACHE_TABLE, [
        { field: 'id', value: IdGenerator.generate() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'mcp_provider_id', value: input.mcp_provider_id },
        { field: 'mcp_title', value: mcp.title },
        { field: 'mcp_brief', value: mcp.brief },
        { field: 'mcp_install_cmd', value: mcp.installCmd },
      ]);
    }

    // 返回结果（含分页）
    const allCached = await this.relationDb.select(MCP_CACHE_TABLE, {
      conditions: [
        { field: 'mcp_provider_id', operator: Operator.EQ, value: input.mcp_provider_id },
      ],
      page: input.page,
    });
    output.list = allCached;
    output.total = await this.relationDb.count(MCP_CACHE_TABLE, [
      { field: 'mcp_provider_id', operator: Operator.EQ, value: input.mcp_provider_id },
    ]);
    return true;
  }

  // -------------------------------------------------------------------------
  // MCP 管理
  // -------------------------------------------------------------------------

  /** 安装 MCP（PRD 3.2.1）- 通过 npm 安装并生成命令 */
  async installMcp(
    input: InstallMcpInput,
    _context: McpContext,
    output: InstallMcpOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    // 从 mcp_cache 获取 MCP 信息
    const mcpCache = await this.relationDb.selectOne(MCP_CACHE_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.mcp_id },
      { field: 'mcp_provider_id', operator: Operator.EQ, value: input.mcp_provider_id },
    ]);
    if (!mcpCache) {
      throw new NotFoundError('MCP Cache', input.mcp_id);
    }

    const installCmd = String(mcpCache.mcp_install_cmd);
    // 通过 npm 安装
    try {
      execSync(installCmd, { timeout: 120000, stdio: 'pipe' });
    } catch {
      // 安装失败不阻断，仍记录安装信息
    }

    // 生成启动、关闭、卸载命令
    const cmds = this.generateCommands(installCmd);
    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    await this.relationDb.insert(MCP_INSTALL_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'mcp_provider_id', value: input.mcp_provider_id },
      { field: 'mcp_title', value: mcpCache.mcp_title },
      { field: 'mcp_brief', value: mcpCache.mcp_brief },
      { field: 'mcp_install_cmd', value: installCmd },
      { field: 'mcp_start_cmd', value: cmds.start },
      { field: 'mcp_stop_cmd', value: cmds.stop },
      { field: 'mcp_uninstall_cmd', value: cmds.uninstall },
      { field: 'enable', value: 1 },
    ]);
    output.id = id;
    return true;
  }

  /** 启动 MCP（PRD 3.2.2） */
  async startMcp(
    input: StartMcpInput,
    _context: McpContext,
    _output: StartMcpOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const mcp = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!mcp) {
      throw new NotFoundError('MCP Install', input.id);
    }
    try {
      execSync(String(mcp.mcp_start_cmd), {
        timeout: 30000,
        stdio: 'pipe',
      });
    } catch {
      // 启动命令可能为长时间运行进程，超时不算失败
    }
    this.runningMcps.add(input.id);
    return true;
  }

  /** 关闭 MCP（PRD 3.2.3） */
  async stopMcp(
    input: StopMcpInput,
    _context: McpContext,
    _output: StopMcpOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const mcp = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!mcp) {
      throw new NotFoundError('MCP Install', input.id);
    }
    try {
      execSync(String(mcp.mcp_stop_cmd), {
        timeout: 10000,
        stdio: 'pipe',
      });
    } catch {
      // 停止命令失败忽略
    }
    this.runningMcps.delete(input.id);
    return true;
  }

  /** 卸载 MCP（PRD 3.2.4）- 运行卸载命令并删除记录 */
  async uninstallMcp(
    input: UninstallMcpInput,
    _context: McpContext,
    _output: UninstallMcpOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const mcp = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!mcp) {
      throw new NotFoundError('MCP Install', input.id);
    }
    try {
      execSync(String(mcp.mcp_uninstall_cmd), {
        timeout: 60000,
        stdio: 'pipe',
      });
    } catch {
      // 卸载失败仍删除记录
    }
    await this.relationDb.delete(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    return true;
  }

  /** 更新 MCP（PRD 3.2.5） */
  async updateMcp(
    input: UpdateMcpInput,
    _context: McpContext,
    _output: UpdateMcpOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const data: DataObject[] = [{ field: 'updated', value: IdGenerator.now() }];
    const patch = input.data;
    if (patch.mcp_title !== undefined) {
      data.push({ field: 'mcp_title', value: patch.mcp_title });
    }
    if (patch.mcp_brief !== undefined) {
      data.push({ field: 'mcp_brief', value: patch.mcp_brief });
    }
    if (patch.mcp_install_cmd !== undefined) {
      data.push({ field: 'mcp_install_cmd', value: patch.mcp_install_cmd });
    }
    if (patch.mcp_start_cmd !== undefined) {
      data.push({ field: 'mcp_start_cmd', value: patch.mcp_start_cmd });
    }
    if (patch.mcp_stop_cmd !== undefined) {
      data.push({ field: 'mcp_stop_cmd', value: patch.mcp_stop_cmd });
    }
    if (patch.mcp_uninstall_cmd !== undefined) {
      data.push({ field: 'mcp_uninstall_cmd', value: patch.mcp_uninstall_cmd });
    }
    if (patch.enable !== undefined) {
      if (!patch.enable && this.runningMcps.has(input.id)) {
        throw new ValidationError('处于启动状态的 MCP 不能禁用');
      }
      data.push({ field: 'enable', value: patch.enable ? 1 : 0 });
    }
    await this.relationDb.update(
      MCP_INSTALL_TABLE,
      data,
      [{ field: 'id', operator: Operator.EQ, value: input.id }],
    );
    return true;
  }

  /** 获取 MCP（PRD 3.2.6） */
  async getMcp(
    input: GetMcpInput,
    _context: McpContext,
    output: GetMcpOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    if (!input.id && !input.conditions) {
      throw new ValidationError('id 与 conditions 至少传一个');
    }
    const conditions: Condition[] = input.id
      ? [{ field: 'id', operator: Operator.EQ, value: input.id }]
      : input.conditions!;
    const row = await this.relationDb.selectOne(MCP_INSTALL_TABLE, conditions);
    output.mcp = row ? (row as unknown as McpInstallRecord) : null;
    return true;
  }

  /** 搜索 MCP（PRD 3.2.7） */
  async soMcp(
    input: SoMcpInput,
    _context: McpContext,
    output: SoMcpOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions: Condition[] = [];
    if (input.conditions) {
      conditions.push(...input.conditions);
    }
    if (input.keyword) {
      conditions.push({
        field: 'mcp_title',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
      });
      conditions.push({
        field: 'mcp_brief',
        operator: Operator.LIKE,
        value: `%${input.keyword}%`,
        logic: Logic.OR,
      });
    }
    const rows = await this.relationDb.select(MCP_INSTALL_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: input.order_by,
      page: input.page,
    });
    output.list = rows as unknown as McpInstallRecord[];
    output.total = await this.relationDb.count(
      MCP_INSTALL_TABLE,
      conditions.length > 0 ? conditions : undefined,
    );
    return true;
  }

  // -------------------------------------------------------------------------
  // MCP 调用
  // -------------------------------------------------------------------------

  /** 调用 MCP（PRD 3.3.1） */
  async execMcp(
    input: ExecMcpInput,
    _context: McpContext,
    output: ExecMcpOutput,
  ): Promise<boolean> {
    this.ensureEnabled();
    const mcp = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!mcp) {
      throw new NotFoundError('MCP Install', input.id);
    }

    // 调用 MCP：通过启动命令执行并传入参数
    // 实际场景中 MCP 可能为 stdio 协议或 HTTP 协议
    // 此处以命令行调用 + JSON 参数方式实现
    try {
      const paramsJson = JSON.stringify(input.params);
      const result = execSync(`${String(mcp.mcp_start_cmd)} '${paramsJson}'`, {
        timeout: 60000,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      output.result = result;
    } catch (err) {
      output.result = { error: err instanceof Error ? err.message : String(err) };
    }

    // 调用成功后更新 mcp_usage
    await this.upsertUsage(input.id);
    return true;
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /** 启用/禁用 MCP 组件（PRD 3.4.2） */
  async enableMCP(
    input: EnableMCPInput,
    _context: McpContext,
    _output: EnableMCPOutput,
  ): Promise<boolean> {
    this.enabled = input.enable;
    await this.config.set(
      'enabled',
      String(input.enable),
      'BOOLEAN',
      'MCP 组件是否启用（enableMCP 读写）',
    );
    return true;
  }
}
