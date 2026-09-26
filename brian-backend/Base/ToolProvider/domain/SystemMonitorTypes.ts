export interface SystemResourceMetrics {
  
  cpu: number;
  
  memory: number;
  
  disk: number;
}

import { Input } from '../../shared/base/Input';
import { Output } from '../../shared/base/Output';
import { Context } from '../../shared/base/Context';

export class SystemMonitorContext extends Context {}

export class SoCpuUsageInput extends Input {}
export class SoCpuUsageOutput extends Output { percent = 0; }

export class SoMemoryUsageInput extends Input {}
export class SoMemoryUsageOutput extends Output { percent = 0; }

export class SoDiskUsageInput extends Input { path?: string; }
export class SoDiskUsageOutput extends Output { percent = 0; }

export class SoResourceInput extends Input { path?: string; }
export class SoResourceOutput extends Output { metrics!: SystemResourceMetrics; }
