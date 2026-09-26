import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import type { Logger } from '../../shared/aop/AopProxy';
import { CronSchemaInitializer } from '../infrastructure/CronSchemaInitializer';
import { CronService } from '../application/CronService';
import type { CronHandler } from '../application/CronService';
import {
  CronContext,
  ListCronTasksOutput,
  GetCronTaskInput,
  GetCronTaskOutput,
  SetCronTaskInput,
  SetCronTaskOutput,
  SetCronTaskEnabledInput,
  SetCronTaskEnabledOutput,
  TriggerCronTaskInput,
  TriggerCronTaskOutput,
  ListCronTaskRunsInput,
  ListCronTaskRunsOutput,
  ListCronTasksInput,
} from '../domain/types';

export class CronAccess {
  private readonly service: CronService;

  constructor(relationDb: RelationDBAccess, logger?: Logger) {
    new CronSchemaInitializer(relationDb).init();
    this.service = new CronService(relationDb, logger);
  }

  
  
  

  
  async registerTask(
    name: string,
    description: string | undefined,
    defaultCron: string,
    handler: CronHandler,
  ): Promise<void> {
    await this.service.registerTask({ name, description, defaultCron, handler });
  }

  
  start(): void {
    this.service.start();
  }

  
  stop(): void {
    this.service.stop();
  }

  
  
  

  async listCronTasks(_input: ListCronTasksInput, output: ListCronTasksOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.tasks = this.service.listTasks();
    return true;
  }

  async soCronTask(input: GetCronTaskInput, output: GetCronTaskOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.task = this.service.getTask(input.name);
    return true;
  }

  async setCronTask(input: SetCronTaskInput, output: SetCronTaskOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.task = this.service.setCron(input.name, input.cron);
    return true;
  }

  async setCronTaskEnabled(input: SetCronTaskEnabledInput, output: SetCronTaskEnabledOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.task = this.service.setEnabled(input.name, input.enabled);
    return true;
  }

  async triggerCronTask(input: TriggerCronTaskInput, output: TriggerCronTaskOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.run = await this.service.trigger(input.name);
    return true;
  }

  async listCronTaskRuns(input: ListCronTaskRunsInput, output: ListCronTaskRunsOutput, _context: CronContext, _metrics?: Metrics, _report?: Report): Promise<boolean> {
    output.runs = this.service.listRuns(input.name, input.limit ?? 50);
    return true;
  }
}
