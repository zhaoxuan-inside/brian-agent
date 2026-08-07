/**
 * @fileoverview MCPProvider 接入层。
 *
 * 作为 MCP 的唯一操作入口，封装 application 层 Service，
 * 通过 AOP 代理注入日志记录与耗时统计切面。
 */

import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { MCPSchemaInitializer } from '../infrastructure/MCPSchemaInitializer';
import { MCPService } from '../application/MCPService';
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
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

/**
 * MCPProvider 接入层。
 *
 * 用法示例：
 * ```typescript
 * const mcpAccess = new MCPAccess(relationDb);
 * ```
 */
export class MCPAccess {
  private readonly service: MCPService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new MCPSchemaInitializer(relationDb).init();
    const rawService = new MCPService(relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  // --- 提供商管理 ---
  async addMcpProvider(i: AddMcpProviderInput, c: McpContext, o: AddMcpProviderOutput) {
    return this.service.addMcpProvider(i, c, o);
  }
  async delMcpProvider(i: DelMcpProviderInput, c: McpContext, o: DelMcpProviderOutput) {
    return this.service.delMcpProvider(i, c, o);
  }
  async updateMcpProvider(i: UpdateMcpProviderInput, c: McpContext, o: UpdateMcpProviderOutput) {
    return this.service.updateMcpProvider(i, c, o);
  }
  async soMcpProvider(i: SoMcpProviderInput, c: McpContext, o: SoMcpProviderOutput) {
    return this.service.soMcpProvider(i, c, o);
  }
  async testMcpProvider(i: TestMcpProviderInput, c: McpContext, o: TestMcpProviderOutput) {
    return this.service.testMcpProvider(i, c, o);
  }
  async listMcp(i: ListMcpInput, c: McpContext, o: ListMcpOutput) {
    return this.service.listMcp(i, c, o);
  }

  // --- MCP 管理 ---
  async installMcp(i: InstallMcpInput, c: McpContext, o: InstallMcpOutput) {
    return this.service.installMcp(i, c, o);
  }
  async startMcp(i: StartMcpInput, c: McpContext, o: StartMcpOutput) {
    return this.service.startMcp(i, c, o);
  }
  async stopMcp(i: StopMcpInput, c: McpContext, o: StopMcpOutput) {
    return this.service.stopMcp(i, c, o);
  }
  async uninstallMcp(i: UninstallMcpInput, c: McpContext, o: UninstallMcpOutput) {
    return this.service.uninstallMcp(i, c, o);
  }
  async updateMcp(i: UpdateMcpInput, c: McpContext, o: UpdateMcpOutput) {
    return this.service.updateMcp(i, c, o);
  }
  async getMcp(i: GetMcpInput, c: McpContext, o: GetMcpOutput) {
    return this.service.getMcp(i, c, o);
  }
  async soMcp(i: SoMcpInput, c: McpContext, o: SoMcpOutput) {
    return this.service.soMcp(i, c, o);
  }

  // --- MCP 调用 ---
  async execMcp(i: ExecMcpInput, c: McpContext, o: ExecMcpOutput) {
    return this.service.execMcp(i, c, o);
  }

  // --- 可视化与运维 ---
  async enableMCP(i: EnableMCPInput, c: McpContext, o: EnableMCPOutput) {
    return this.service.enableMCP(i, c, o);
  }
}
