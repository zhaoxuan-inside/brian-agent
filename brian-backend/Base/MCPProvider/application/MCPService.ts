/**
 * @fileoverview MCPProvider 应用服务层。
 *
 * 依赖 RelationDBAccess 操作关系数据库，依赖 ConfigService 管理 mcp_config 配置表。
 * 实现所有用例：提供商管理、MCP 管理、MCP 调用、可视化运维。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { ExecRequestInput, ExecRequestOutput, HttpContext } from '../../ToolProvider/domain/HttpTypes';
import { HttpAccess } from '../../ToolProvider/access/HttpAccess';
import { TOOL_CONFIG_TABLE } from '../../ToolProvider/domain/types';
import {
  StdioMcpClient,
  callToolOverHttp,
  callToolOverRest,
  type McpTransportConfig,
} from './McpTransport';
import { ConfigService } from '../../shared/config/ConfigService';
import { ComponentDisabledError, ValidationError, NotFoundError } from '../../shared/errors';
import { IdGenerator } from '../../ToolProvider/IdGenerator';
import { Operator, Logic } from '../../shared/query';
import type { Condition, DataObject } from '../../shared/query';
import { McpContext, McpProviderRecord, McpInstallRecord, AddMcpProviderInput, AddMcpProviderOutput, DelMcpProviderInput, DelMcpProviderOutput, UpdateMcpProviderInput, UpdateMcpProviderOutput, SoMcpProviderInput, SoMcpProviderOutput, TestMcpProviderInput, TestMcpProviderOutput, ListMcpInput, ListMcpOutput, InstallMcpInput, InstallMcpOutput, StartMcpInput, StartMcpOutput, StopMcpInput, StopMcpOutput, StartMcpsInput, StartMcpsOutput, RefreshMcpStatusInput, RefreshMcpStatusOutput, UninstallMcpInput, UninstallMcpOutput, UpdateMcpInput, UpdateMcpOutput, UpgradeMcpInput, UpgradeMcpOutput, GetMcpInput, GetMcpOutput, SoMcpInput, SoMcpOutput, ExecMcpInput, ExecMcpOutput, EnableMCPInput, EnableMCPOutput, GetMcpUsageInput, GetMcpUsageOutput, MCP_PROVIDER_TABLE, MCP_CACHE_TABLE, MCP_INSTALL_TABLE, MCP_USAGE_TABLE, MCP_CONFIG_TABLE } from '../domain/types';

/**
 * MCPProvider 应用服务。
 *
 * MCPProvider 是 MCP 的唯一操作入口，上层不可直接调用 MCP。
 */
export class MCPService {
  private enabled = true;
  private readonly config: ConfigService;
  private readonly runningMcps = new Map<string, StdioMcpClient>();
  private readonly http: HttpAccess;

  constructor(private readonly relationDb: RelationDBAccess) {
    this.config = new ConfigService(relationDb, MCP_CONFIG_TABLE);
    this.http = new HttpAccess(new ConfigService(relationDb, TOOL_CONFIG_TABLE));
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

  /** 获取 MCP 的通信方式（默认 stdio） */
  private getTransportType(mcp: Record<string, unknown>): string {
    return String(mcp.transport_type || 'stdio');
  }

  /** 解析 transport_config（JSON 字符串） */
  private parseTransportConfig(mcp: Record<string, unknown>): McpTransportConfig {
    const raw = String(mcp.transport_config || '');
    if (!raw) return {};
    try {
      return JSON.parse(raw) as McpTransportConfig;
    } catch {
      return {};
    }
  }

  /** 解析 stdio 启动命令（优先 transport_config.command/args，回退到 mcp_start_cmd 拆分） */
  private resolveStdioCommand(mcp: Record<string, unknown>): { command: string; args: string[] } {
    const cfg = this.parseTransportConfig(mcp);
    if (cfg.command) {
      return { command: cfg.command, args: cfg.args || [] };
    }
    const parts = String(mcp.mcp_start_cmd || '').split(/\s+/).filter(Boolean);
    return { command: parts[0] || '', args: parts.slice(1) };
  }

  /**
   * 通过 npm list -g 同步 mcp_install 表的安装状态：
   * 对通过 npm 安装的记录，若全局已不再存在对应 npm 包，则移除该记录；
   * 若仍存在，则同步更新其版本号。
   * 返回移除的记录数。
   */
  async syncInstallStatus(): Promise<number> {
    let globalPkgs = new Map<string, string>();
    const parse = (raw: string): Map<string, string> => {
      try {
        const json = JSON.parse(raw) as { dependencies?: Record<string, { version?: string }> };
        const map = new Map<string, string>();
        for (const [name, info] of Object.entries(json.dependencies ?? {})) {
          map.set(name, String(info?.version ?? ''));
        }
        return map;
      } catch {
        return new Map<string, string>();
      }
    };
    try {
      const { stdout } = await execAsync('npm list -g --depth=0 --json', {
        timeout: 20000,
        encoding: 'utf-8',
      });
      globalPkgs = parse(stdout);
    } catch (e) {
      // npm list 存在缺失依赖时返回非零退出码，但 JSON 仍输出在 stdout
      globalPkgs = parse(String((e as { stdout?: string }).stdout ?? ''));
    }

    const records = await this.relationDb.select(MCP_INSTALL_TABLE, {});
    let removed = 0;
    for (const r of records) {
      const installCmd = String(r.mcp_install_cmd ?? '');
      if (!installCmd.startsWith('npm install') && !installCmd.startsWith('npm i ')) continue;
      // 仅校验全局安装（npm list -g 只能反映全局包），--prefix 等本地安装跳过
      if (!/\s(-g|--global)(\s|$)/.test(installCmd)) continue;
      const pkg = this.extractPackageName(installCmd);
      if (!pkg) continue;
      if (!globalPkgs.has(pkg)) {
        await this.relationDb.delete(MCP_INSTALL_TABLE, [
          { field: 'id', operator: Operator.EQ, value: String(r.id) },
        ]);
        removed++;
      } else {
        const version = globalPkgs.get(pkg) ?? '';
        if (version && String(r.version ?? '') !== version) {
          await this.relationDb.update(MCP_INSTALL_TABLE, [
            { field: 'version', value: version },
            { field: 'updated', value: IdGenerator.now() },
          ], [
            { field: 'id', operator: Operator.EQ, value: String(r.id) },
          ]);
        }
      }
    }
    return removed;
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
  async addMcpProvider(input: AddMcpProviderInput, output: AddMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const d = input.data;
    const id = IdGenerator.generate();
    const now = IdGenerator.now();
    await this.relationDb.insert(MCP_PROVIDER_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'provider_code', value: d.provider_code ?? null },
      { field: 'mcp_provider_url', value: d.mcp_provider_url },
      { field: 'mcp_provider_title', value: d.mcp_provider_title },
      { field: 'mcp_provider_brief', value: d.mcp_provider_brief ?? null },
      { field: 'enable', value: (d.enable ?? true) ? 1 : 0 },
    ]);
    output.id = id;
    return true;
  }

  /** 删除 MCP 提供商（PRD 3.1.2）- 级联清理 mcp_cache 和 mcp_install */
  async delMcpProvider(input: DelMcpProviderInput, output: DelMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
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
  async updateMcpProvider(input: UpdateMcpProviderInput, _output: UpdateMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
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
  async soMcpProvider(input: SoMcpProviderInput, output: SoMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
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
  async testMcpProvider(input: TestMcpProviderInput, output: TestMcpProviderOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
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
      await this.http.execRequest(Object.assign(new ExecRequestInput(), { url: String(provider.mcp_provider_url), method: 'GET', timeout_ms: 10000 }), new ExecRequestOutput(), new HttpContext());
      output.connected = true;
    } catch {
      output.connected = false;
    }
    output.response_time_ms = Date.now() - start;
    return true;
  }

  /** 获取 MCP 列表（PRD 3.1.6）- 优先从缓存读取，过期则调用提供商 API */
  async listMcp(input: ListMcpInput, output: ListMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report,
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
      const providerCode = String((provider as Record<string, unknown>).provider_code || '');
      // ===== 2026-09-23：github provider = npm registry 市场（原 /mcps 端点对 npmjs 是 404，
      // 市场层拉不到任何清单——真机取证 [2026-09-22s]）。清单 = 官方 @modelcontextprotocol/server-github
      // 置顶 + 'github mcp' 搜索合并（去重，上限 30 条）=====
      if (providerCode === 'github') {
        mcpList = await this.fetchNpmMarketList();
      } else {
        const respHttpInput = Object.assign(new ExecRequestInput(), { url: `${String(provider.mcp_provider_url)}/mcps`, timeout_ms: 30000 });
        const respHttpOutput = new ExecRequestOutput();
        await this.http.execRequest(respHttpInput, respHttpOutput, new HttpContext());
        const resp = respHttpOutput.response;
        if (resp.ok) {
          const data = JSON.parse(resp.bodyText) as Array<{
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
      }
    } catch (err) {
      // API 调用失败时返回空列表
      metrics?.warn('MCPService.listMcp 拉取提供商 MCP 列表失败，降级返回空列表', {
        error: err instanceof Error ? err.message : String(err),
        mcp_provider_id: input.mcp_provider_id,
      });
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

  /** GET JSON（数据处理；失败返回 null） */
  private async fetchJson<T>(url: string): Promise<T | null> {
    const input = Object.assign(new ExecRequestInput(), { url, method: 'GET', timeout_ms: 30000 });
    const output = new ExecRequestOutput();
    try {
      await this.http.execRequest(input, output, new HttpContext());
    } catch {
      return null;
    }
    if (!output.response?.ok) return null;
    try {
      return JSON.parse(output.response.bodyText) as T;
    } catch {
      return null;
    }
  }

  /** npm registry 市场清单（数据处理）：官方 GitHub MCP 置顶 + 'github mcp' 搜索合并（去重，上限 30 条） */
  private async fetchNpmMarketList(): Promise<Array<{ title: string; brief: string; installCmd: string }>> {
    const list: Array<{ title: string; brief: string; installCmd: string }> = [];
    const official = await this.fetchJson<{ name?: string; description?: string }>(
      'https://registry.npmjs.org/@modelcontextprotocol/server-github',
    );
    if (official?.name) {
      list.push({ title: official.name, brief: official.description ?? 'MCP server for using the GitHub API', installCmd: `npm install -g ${official.name}` });
    }
    const search = await this.fetchJson<{ objects?: Array<{ package?: { name?: string; description?: string } }> }>(
      'https://registry.npmjs.org/-/v1/search?text=github%20mcp&size=25',
    );
    const seen = new Set(list.map((l) => l.title));
    for (const obj of search?.objects ?? []) {
      const pkg = obj.package;
      if (!pkg?.name || seen.has(pkg.name)) continue;
      seen.add(pkg.name);
      list.push({ title: pkg.name, brief: pkg.description ?? '', installCmd: `npm install -g ${pkg.name}` });
      if (list.length >= 30) break;
    }
    return list;
  }

  /** 安装 MCP（PRD 3.2.1）- 通过 npm 安装并生成命令 */
  async installMcp(input: InstallMcpInput, output: InstallMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report,
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

    // 校验：同一 provider + title 不允许重复安装
    const existing = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'mcp_provider_id', operator: Operator.EQ, value: input.mcp_provider_id },
      { field: 'mcp_title', operator: Operator.EQ, value: String(mcpCache.mcp_title) },
    ]);
    if (existing) {
      throw new ValidationError(`MCP 已安装：${mcpCache.mcp_title}`);
    }

    // 通过 npm 安装
    try {
      execSync(installCmd, { timeout: 120000, stdio: 'pipe' });
    } catch (err) {
      // 安装失败不阻断，仍记录安装信息
      metrics?.warn('MCPService.installMcp npm 安装命令执行失败，仍记录安装信息', {
        error: err instanceof Error ? err.message : String(err),
        mcp_id: input.mcp_id,
        install_cmd: installCmd,
      });
    }

    // 生成启动、关闭、卸载命令
    const cmds = this.generateCommands(installCmd);
    const id = IdGenerator.generate();
    const now = IdGenerator.now();

    // 根据市场 provider_code 决定通信方式（transport_type / transport_config）
    const provider = await this.relationDb.selectOne(MCP_PROVIDER_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.mcp_provider_id },
    ]);
    const providerCode = provider ? String((provider as Record<string, unknown>).provider_code || '') : '';
    const { transportType, transportConfig } = this.resolveTransport(providerCode, cmds.start);

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
      { field: 'transport_type', value: transportType },
      { field: 'transport_config', value: transportConfig },
      { field: 'status', value: 'stopped' },
      { field: 'enable', value: 1 },
    ]);
    output.id = id;
    // 安装完成后同步一次安装状态（通过 npm list -g 校验是否真实安装成功，并同步版本号）
    await this.syncInstallStatus();
    return true;
  }

  /** 根据市场 provider_code 解析通信方式与配置 */
  private resolveTransport(providerCode: string, startCmd: string): { transportType: string; transportConfig: string } {
    let transportType = 'stdio';
    let transportConfig: McpTransportConfig = {};
    if (providerCode === 'modelscope') {
      transportType = 'streamable-http';
    } else if (providerCode === 'smithery') {
      transportType = 'http-sse';
    } else if (providerCode === 'aliyun_bailian') {
      transportType = 'rest';
    } else {
      // github / 默认：stdio，command/args 由 startCmd 拆分
      const parts = startCmd.split(/\s+/).filter(Boolean);
      transportType = 'stdio';
      transportConfig = { command: parts[0] || '', args: parts.slice(1) };
    }
    return { transportType, transportConfig: JSON.stringify(transportConfig) };
  }

  /** 启动 MCP（PRD 3.2.2）- 后台启动进程并跟踪 */
  async startMcp(input: StartMcpInput, _output: StartMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const mcp = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!mcp) {
      throw new NotFoundError('MCP Install', input.id);
    }
    const transportType = this.getTransportType(mcp);
    // 仅 stdio 传输需要启动本地进程；http/rest 为远程服务，无需本地进程
    if (transportType === 'stdio') {
      this.killRunningMcp(input.id);
      const { command, args } = this.resolveStdioCommand(mcp);
      if (!command) {
        throw new ValidationError(`MCP ${mcp.mcp_title} 缺少启动命令`);
      }
      const client = new StdioMcpClient();
      try {
        client.spawn(command, args);
      } catch (err) {
        // 启动失败不阻断
        metrics?.warn('MCPService.startMcp stdio 进程启动失败（调用时将按未运行报错）', {
          error: err instanceof Error ? err.message : String(err),
          mcp_id: input.id,
          command,
        });
      }
      this.runningMcps.set(input.id, client);
      // 异步完成 MCP 握手（不阻塞启动返回）
      client.initialize().catch(() => { /* 握手失败忽略，调用时再报错 */ });
    }
    await this.relationDb.update(MCP_INSTALL_TABLE, [
      { field: 'status', value: 'running' },
      { field: 'updated', value: IdGenerator.now() },
    ], [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    return true;
  }

  /** 关闭 MCP（PRD 3.2.3） */
  async stopMcp(input: StopMcpInput, _output: StopMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const mcp = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!mcp) {
      throw new NotFoundError('MCP Install', input.id);
    }
    this.killRunningMcp(input.id);
    if (String(mcp.mcp_stop_cmd || '')) {
      try {
        execSync(String(mcp.mcp_stop_cmd), {
          timeout: 10000,
          stdio: 'pipe',
        });
      } catch (err) {
        // 停止命令失败忽略
        metrics?.warn('MCPService.stopMcp 停止命令执行失败（进程可能需人工确认回收）', {
          error: err instanceof Error ? err.message : String(err),
          mcp_id: input.id,
        });
      }
    }
    await this.relationDb.update(MCP_INSTALL_TABLE, [
      { field: 'status', value: 'stopped' },
      { field: 'updated', value: IdGenerator.now() },
    ], [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    return true;
  }

  /** 终止指定 MCP 的托管进程 */
  private killRunningMcp(id: string): void {
    const client = this.runningMcps.get(id);
    if (client) {
      client.kill();
    }
    this.runningMcps.delete(id);
  }

  /** 实时判断 MCP 进程是否真实存活（探测 PID，而非依赖数据库 status 字段） */
  private isMcpRunning(id: string, transportType?: string): boolean {
    // http/rest 为远程服务，无本地进程，视为「可用」（调用时按 enable 校验）
    if (transportType && transportType !== 'stdio') return true;
    const client = this.runningMcps.get(id);
    return client ? client.isAlive() : false;
  }

  /** 停止所有运行中的 MCP（后端关闭时调用），并将状态重置为 stopped，返回停止数量 */
  async stopAllMcp(): Promise<number> {
    const count = this.runningMcps.size;
    for (const id of Array.from(this.runningMcps.keys())) {
      this.killRunningMcp(id);
    }
    this.runningMcps.clear();
    // 重置所有 status=running 的记录为 stopped（含崩溃遗留）
    const running = await this.relationDb.select(MCP_INSTALL_TABLE, {
      conditions: [{ field: 'status', operator: Operator.EQ, value: 'running' }],
    });
    for (const r of running) {
      await this.relationDb.update(MCP_INSTALL_TABLE, [
        { field: 'status', value: 'stopped' },
        { field: 'updated', value: IdGenerator.now() },
      ], [
        { field: 'id', operator: Operator.EQ, value: String(r.id) },
      ]);
    }
    return count;
  }

  /** 批量启动多个 MCP */
  async startMcps(input: StartMcpsInput, output: StartMcpsOutput, context: McpContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    for (const id of input.ids ?? []) {
      const startIn = Object.assign(new StartMcpInput(), { id });
      await this.startMcp(startIn, new StartMcpOutput(), context, metrics, report);
      output.started_count++;
    }
    return true;
  }

  /** 刷新运行状态：检查被托管进程是否仍存活，若已退出则重置为 stopped */
  private async refreshRunningStatus(): Promise<void> {
    for (const id of Array.from(this.runningMcps.keys())) {
      const client = this.runningMcps.get(id);
      if (!client || !client.isAlive()) {
        this.runningMcps.delete(id);
        await this.relationDb.update(MCP_INSTALL_TABLE, [
          { field: 'status', value: 'stopped' },
          { field: 'updated', value: IdGenerator.now() },
        ], [
          { field: 'id', operator: Operator.EQ, value: id },
        ]);
      }
    }
  }

  /** 刷新本机所有已安装 MCP 的安装状态与运行状态 */
  async refreshMcpStatus(_input: RefreshMcpStatusInput, output: RefreshMcpStatusOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    // 1. 同步 npm 安装状态（清理已卸载、更新版本号）
    output.removed = await this.syncInstallStatus();
    // 2. 刷新运行状态（清理已退出的进程）
    await this.refreshRunningStatus();
    // 3. 统计
    const records = await this.relationDb.select(MCP_INSTALL_TABLE, {});
    output.total = records.length;
    let runningCount = 0;
    for (const r of records) {
      const transportType = String(r.transport_type || 'stdio');
      if (this.isMcpRunning(String(r.id), transportType)) runningCount++;
    }
    output.running = runningCount;
    output.stopped = records.length - runningCount;
    return true;
  }

  /** 卸载 MCP（PRD 3.2.4）- 运行卸载命令并删除记录 */
  async uninstallMcp(input: UninstallMcpInput, _output: UninstallMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const mcp = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!mcp) {
      throw new NotFoundError('MCP Install', input.id);
    }
    // 先终止运行中的进程
    this.killRunningMcp(input.id);
    try {
      execSync(String(mcp.mcp_uninstall_cmd), {
        timeout: 60000,
        stdio: 'pipe',
      });
    } catch (err) {
      // 卸载失败仍删除记录
      metrics?.warn('MCPService.uninstallMcp 卸载命令执行失败，仍删除安装记录（包可能残留）', {
        error: err instanceof Error ? err.message : String(err),
        mcp_id: input.id,
      });
    }
    await this.relationDb.delete(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    return true;
  }

  /** 更新 MCP（PRD 3.2.5） */
  async updateMcp(input: UpdateMcpInput, _output: UpdateMcpOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
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
    if (patch.transport_type !== undefined) {
      data.push({ field: 'transport_type', value: patch.transport_type });
    }
    if (patch.transport_config !== undefined) {
      data.push({ field: 'transport_config', value: patch.transport_config });
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

  /** 升级 MCP（PRD 3.2.5）- 重新执行 npm 安装命令更新到最新版本 */
  async upgradeMcp(input: UpgradeMcpInput, output: UpgradeMcpOutput, _context: McpContext, metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const mcp = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!mcp) {
      throw new NotFoundError('MCP Install', input.id);
    }
    const installCmd = String(mcp.mcp_install_cmd);
    if (!installCmd.startsWith('npm install') && !installCmd.startsWith('npm i ')) {
      throw new ValidationError('仅 npm 安装的 MCP 支持更新');
    }
    try {
      execSync(installCmd, { timeout: 120000, stdio: 'pipe' });
    } catch (err) {
      // 更新失败不阻断
      metrics?.warn('MCPService.upgradeMcp 重新安装命令执行失败，保持原版本', {
        error: err instanceof Error ? err.message : String(err),
        mcp_id: input.id,
      });
    }
    await this.syncInstallStatus();
    const updated = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    output.version = updated ? String(updated.version ?? '') : '';
    return true;
  }

  /** 获取 MCP（PRD 3.2.6） */
  async soMcpById(input: GetMcpInput, output: GetMcpOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
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
  async soMcp(input: SoMcpInput, output: SoMcpOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
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
    // 用实时进程状态覆盖数据库中的 status 字段（避免进程崩溃后 DB 状态残留为 running）
    for (const row of rows) {
      const transportType = String(row.transport_type || 'stdio');
      row.status = this.isMcpRunning(String(row.id), transportType) ? 'running' : 'stopped';
    }
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
  async execMcp(input: ExecMcpInput, output: ExecMcpOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const mcp = await this.relationDb.selectOne(MCP_INSTALL_TABLE, [
      { field: 'id', operator: Operator.EQ, value: input.id },
    ]);
    if (!mcp) {
      throw new NotFoundError('MCP Install', input.id);
    }

    // 调用前同时校验启用/禁用 与 启动/停止 状态
    if (Number(mcp.enable) !== 1) {
      throw new ValidationError(`MCP ${mcp.mcp_title} 已禁用，无法调用`);
    }
    const transportType = this.getTransportType(mcp);
    // 仅 stdio 传输依赖本地进程运行；http/rest 为远程服务，仅校验 enable
    if (transportType === 'stdio' && !this.isMcpRunning(input.id, 'stdio')) {
      throw new ValidationError(`MCP ${mcp.mcp_title} 未启动，请先启动后再调用`);
    }

    const toolName = input.tool_name || '';
    const args = input.params || {};
    const config = this.parseTransportConfig(mcp);

    let success = false;
    try {
      if (transportType === 'stdio') {
        const client = this.runningMcps.get(input.id);
        if (!client || !client.isAlive()) {
          throw new ValidationError(`MCP ${mcp.mcp_title} 未启动，请先启动后再调用`);
        }
        output.result = await client.callTool(toolName, args);
      } else if (transportType === 'rest') {
        const { result, raw } = await callToolOverRest(config, toolName, args);
        output.result = result;
        output.raw_response = raw;
      } else {
        // streamable-http / http-sse
        const { result, raw } = await callToolOverHttp(config, toolName, args);
        output.result = result;
        output.raw_response = raw;
      }
      success = true;
    } catch (err) {
      output.result = { error: err instanceof Error ? err.message : String(err) };
    }

    // 仅调用成功时更新 mcp_usage
    if (success) {
      await this.upsertUsage(input.id);
    }
    return true;
  }

  // -------------------------------------------------------------------------
  // 可视化与运维
  // -------------------------------------------------------------------------

  /** 启用/禁用 MCP 组件（PRD 3.4.2） */
  async enableMCP(input: EnableMCPInput, _output: EnableMCPOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
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

  /** 获取 MCP 调用统计（PRD 3.4.2） */
  async soMcpUsage(input: GetMcpUsageInput, output: GetMcpUsageOutput, _context: McpContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    this.ensureEnabled();
    const conditions: Condition[] = [];
    if (input.mcp_install_id) {
      conditions.push({ field: 'mcp_install_id', operator: Operator.EQ, value: input.mcp_install_id });
    }
    if (input.start_date) {
      conditions.push({ field: 'usage_date', operator: Operator.GE, value: input.start_date });
    }
    if (input.end_date) {
      conditions.push({ field: 'usage_date', operator: Operator.LE, value: input.end_date });
    }

    const rows = await this.relationDb.select(MCP_USAGE_TABLE, {
      conditions: conditions.length > 0 ? conditions : undefined,
      order_by: [{ field: 'usage_date', direction: 'DESC' }],
    });

    // 关联 mcp_install 表获取 mcp_title
    const installs = await this.relationDb.select(MCP_INSTALL_TABLE, {});
    const titleMap = new Map<string, string>();
    for (const r of installs) {
      titleMap.set(String(r.id), String(r.mcp_title ?? ''));
    }

    let total = 0;
    output.list = rows.map((r) => {
      const count = Number(r.usage_count ?? 0);
      total += count;
      return {
        mcp_install_id: String(r.mcp_install_id ?? ''),
        mcp_title: titleMap.get(String(r.mcp_install_id ?? '')) ?? '',
        usage_date: String(r.usage_date ?? ''),
        usage_count: count,
      };
    });
    output.total = total;
    return true;
  }
}
