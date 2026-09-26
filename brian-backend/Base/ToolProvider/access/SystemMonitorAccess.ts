import { SystemMonitorService } from '../application/SystemMonitorService';
import type {
  SystemMonitorContext,
  SoCpuUsageInput, SoCpuUsageOutput,
  SoMemoryUsageInput, SoMemoryUsageOutput,
  SoDiskUsageInput, SoDiskUsageOutput,
  SoResourceInput, SoResourceOutput,
} from '../domain/SystemMonitorTypes';
import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';

export class SystemMonitorAccess {
  private readonly service: SystemMonitorService;

  

  constructor(diskPath?: string) {
    this.service = new SystemMonitorService(diskPath);
  }

  
  async soCpuUsage(_input: SoCpuUsageInput, output: SoCpuUsageOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.percent = this.service.getCpuUsagePercent();
    return true;
  }

  
  async soMemoryUsage(_input: SoMemoryUsageInput, output: SoMemoryUsageOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.percent = this.service.getMemoryUsagePercent();
    return true;
  }

  
  async soDiskUsage(input: SoDiskUsageInput, output: SoDiskUsageOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.percent = this.service.getDiskUsagePercent(input.path);
    return true;
  }

  
  async soResource(input: SoResourceInput, output: SoResourceOutput, _context: SystemMonitorContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.metrics = this.service.collect(input.path);
    return true;
  }
}
