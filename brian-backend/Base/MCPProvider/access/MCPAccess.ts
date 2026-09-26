import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
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
  StartMcpsInput,
  StartMcpsOutput,
  RefreshMcpStatusInput,
  RefreshMcpStatusOutput,
  UninstallMcpInput,
  UninstallMcpOutput,
  UpdateMcpInput,
  UpdateMcpOutput,
  UpgradeMcpInput,
  UpgradeMcpOutput,
  GetMcpInput,
  GetMcpOutput,
  SoMcpInput,
  SoMcpOutput,
  ExecMcpInput,
  ExecMcpOutput,
  EnableMCPInput,
  EnableMCPOutput,
  GetMcpUsageInput,
  GetMcpUsageOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

export class MCPAccess {
  private readonly service: MCPService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new MCPSchemaInitializer(relationDb).init();
    const rawService = new MCPService(relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  
  async syncInstallStatus(): Promise<number> {
    return this.service.syncInstallStatus();
  }

  
  async stopAllMcp(): Promise<number> {
    return this.service.stopAllMcp();
  }

  
  async addMcpProvider(i: AddMcpProviderInput, o: AddMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.addMcpProvider(i, o, c, metrics, report);
  }
  async delMcpProvider(i: DelMcpProviderInput, o: DelMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.delMcpProvider(i, o, c, metrics, report);
  }
  async updateMcpProvider(i: UpdateMcpProviderInput, o: UpdateMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.updateMcpProvider(i, o, c, metrics, report);
  }
  async soMcpProvider(i: SoMcpProviderInput, o: SoMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.soMcpProvider(i, o, c, metrics, report);
  }
  async testMcpProvider(i: TestMcpProviderInput, o: TestMcpProviderOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.testMcpProvider(i, o, c, metrics, report);
  }
  async listMcp(i: ListMcpInput, o: ListMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.listMcp(i, o, c, metrics, report);
  }

  
  async installMcp(i: InstallMcpInput, o: InstallMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.installMcp(i, o, c, metrics, report);
  }
  async startMcp(i: StartMcpInput, o: StartMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.startMcp(i, o, c, metrics, report);
  }
  async stopMcp(i: StopMcpInput, o: StopMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.stopMcp(i, o, c, metrics, report);
  }
  async startMcps(i: StartMcpsInput, o: StartMcpsOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.startMcps(i, o, c, metrics, report);
  }
  async refreshMcpStatus(i: RefreshMcpStatusInput, o: RefreshMcpStatusOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.refreshMcpStatus(i, o, c, metrics, report);
  }
  async uninstallMcp(i: UninstallMcpInput, o: UninstallMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.uninstallMcp(i, o, c, metrics, report);
  }
  async updateMcp(i: UpdateMcpInput, o: UpdateMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.updateMcp(i, o, c, metrics, report);
  }
  async upgradeMcp(i: UpgradeMcpInput, o: UpgradeMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.upgradeMcp(i, o, c, metrics, report);
  }
  async soMcpById(i: GetMcpInput, o: GetMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.soMcpById(i, o, c, metrics, report);
  }
  async soMcp(i: SoMcpInput, o: SoMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.soMcp(i, o, c, metrics, report);
  }

  
  async execMcp(i: ExecMcpInput, o: ExecMcpOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.execMcp(i, o, c, metrics, report);
  }

  
  async enableMCP(i: EnableMCPInput, o: EnableMCPOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.enableMCP(i, o, c, metrics, report);
  }
  async soMcpUsage(i: GetMcpUsageInput, o: GetMcpUsageOutput, c: McpContext, metrics?: Metrics, report?: Report) {
    return this.service.soMcpUsage(i, o, c, metrics, report);
  }
}
