import { z } from 'zod';
import { DBWrapper } from '../../base/DBWrapper';
import { SchemaFieldSchema } from '../skill/SkillManager';

export const WorkflowStepSchema = z.object({
  id: z.string(),
  type: z.enum(['llm', 'skill', 'mcp', 'work']),
  toolId: z.string(),
  parameters: z.record(z.string(), z.any()),
  condition: z.string().optional(),
  nextStepId: z.string().optional(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkConfigSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  workflow: z.array(WorkflowStepSchema),
  inputs: z.array(SchemaFieldSchema),
  outputs: z.array(SchemaFieldSchema),
  effectivenessScore: z.number().default(0),
  usageCount: z.number().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type WorkConfig = z.infer<typeof WorkConfigSchema>;

export interface WorkExecutionResult {
  success: boolean;
  result: Record<string, any>;
  stepsExecuted: number;
  error?: string;
  stepResults: Record<string, any>;
}

export interface WorkExecutionContext {
  executeLLM: (toolId: string, parameters: Record<string, any>, inputs: Record<string, any>) => Promise<Record<string, any>>;
  executeSkill: (toolId: string, parameters: Record<string, any>, inputs: Record<string, any>) => Promise<Record<string, any>>;
  executeMCP: (toolId: string, parameters: Record<string, any>, inputs: Record<string, any>) => Promise<Record<string, any>>;
  executeWork: (toolId: string, parameters: Record<string, any>, inputs: Record<string, any>) => Promise<Record<string, any>>;
}

export class WorkManager {
  private works: Map<string, WorkConfig> = new Map();

  constructor(private db: DBWrapper) {}

  async init(): Promise<void> {
    await this.loadWorks();
  }

  private async loadWorks(): Promise<void> {
    const rows = await this.db.query<any>('SELECT * FROM works');
    for (const row of rows) {
      const config = this.mapRowToWorkConfig(row);
      this.works.set(config.id, config);
    }
  }

  async listWorks(userId?: string): Promise<WorkConfig[]> {
    if (userId) {
      const rows = await this.db.query<any>('SELECT * FROM works WHERE user_id = ?', [userId]);
      return rows.map((r: any) => this.mapRowToWorkConfig(r));
    }
    const rows = await this.db.query<any>('SELECT * FROM works');
    return rows.map((r: any) => this.mapRowToWorkConfig(r));
  }

  async getWork(id: string): Promise<WorkConfig | undefined> {
    const row = await this.db.get<any>('SELECT * FROM works WHERE id = ?', [id]);
    if (!row) return undefined;
    return this.mapRowToWorkConfig(row);
  }

  async createWork(work: Omit<WorkConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<WorkConfig> {
    const id = this.generateId();
    const now = Date.now();
    const config: WorkConfig = {
      ...work,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.run(`
      INSERT INTO works (id, user_id, name, description, category, workflow, inputs, outputs, effectiveness_score, usage_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      config.id,
      config.userId,
      config.name,
      config.description,
      config.category,
      JSON.stringify(config.workflow),
      JSON.stringify(config.inputs),
      JSON.stringify(config.outputs),
      config.effectivenessScore,
      config.usageCount,
      config.createdAt,
      config.updatedAt,
    ]);

    this.works.set(config.id, config);
    return config;
  }

  async updateWork(id: string, updates: Partial<WorkConfig>): Promise<WorkConfig | undefined> {
    const existing = await this.getWork(id);
    if (!existing) return undefined;

    const now = Date.now();
    const updated: WorkConfig = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    await this.db.run(`
      UPDATE works
      SET name = ?, description = ?, category = ?, workflow = ?, inputs = ?, outputs = ?, effectiveness_score = ?, updated_at = ?
      WHERE id = ?
    `, [
      updated.name,
      updated.description,
      updated.category,
      JSON.stringify(updated.workflow),
      JSON.stringify(updated.inputs),
      JSON.stringify(updated.outputs),
      updated.effectivenessScore,
      updated.updatedAt,
      id,
    ]);

    this.works.set(id, updated);
    return updated;
  }

  async deleteWork(id: string): Promise<void> {
    await this.db.run('DELETE FROM works WHERE id = ?', [id]);
    this.works.delete(id);
  }

  async executeWork(
    id: string,
    inputs: Record<string, any>,
    context: WorkExecutionContext
  ): Promise<WorkExecutionResult> {
    const work = await this.getWork(id);
    if (!work) {
      return { success: false, result: {}, stepsExecuted: 0, error: 'Work not found', stepResults: {} };
    }

    const stepResults: Record<string, any> = {};
    let currentInputs = { ...inputs };
    let stepsExecuted = 0;

    const stepMap = new Map<string, WorkflowStep>();
    for (const step of work.workflow) {
      stepMap.set(step.id, step);
    }

    const entrySteps = this.findEntrySteps(work.workflow);
    let currentSteps = entrySteps;

    try {
      while (currentSteps.length > 0) {
        const nextSteps: WorkflowStep[] = [];

        for (const step of currentSteps) {
          if (step.condition && !this.evaluateCondition(step.condition, currentInputs, stepResults)) {
            continue;
          }

          const mergedParams = this.mergeParameters(step.parameters, currentInputs, stepResults);

          let result: Record<string, any>;
          switch (step.type) {
            case 'llm':
              result = await context.executeLLM(step.toolId, mergedParams, currentInputs);
              break;
            case 'skill':
              result = await context.executeSkill(step.toolId, mergedParams, currentInputs);
              break;
            case 'mcp':
              result = await context.executeMCP(step.toolId, mergedParams, currentInputs);
              break;
            case 'work':
              result = await context.executeWork(step.toolId, mergedParams, currentInputs);
              break;
            default:
              result = {};
          }

          stepResults[step.id] = result;
          currentInputs = { ...currentInputs, ...result };
          stepsExecuted++;

          if (step.nextStepId) {
            const nextStep = stepMap.get(step.nextStepId);
            if (nextStep) {
              nextSteps.push(nextStep);
            }
          }
        }

        currentSteps = nextSteps;
      }

      await this.db.run(
        'UPDATE works SET usage_count = usage_count + 1, effectiveness_score = ? WHERE id = ?',
        [this.updateEffectivenessScore(work, stepsExecuted === work.workflow.length), id]
      );

      return {
        success: true,
        result: currentInputs,
        stepsExecuted,
        stepResults,
      };
    } catch (error) {
      return {
        success: false,
        result: currentInputs,
        stepsExecuted,
        error: (error as Error).message,
        stepResults,
      };
    }
  }

  createTemporaryWork(work: Omit<WorkConfig, 'id' | 'createdAt' | 'updatedAt'>): WorkConfig {
    const id = this.generateId();
    const now = Date.now();
    return {
      ...work,
      id,
      createdAt: now,
      updatedAt: now,
    };
  }

  private findEntrySteps(workflow: WorkflowStep[]): WorkflowStep[] {
    const referencedIds = new Set<string>();
    for (const step of workflow) {
      if (step.nextStepId) {
        referencedIds.add(step.nextStepId);
      }
    }

    return workflow.filter(step => !referencedIds.has(step.id));
  }

  private evaluateCondition(
    condition: string,
    inputs: Record<string, any>,
    stepResults: Record<string, any>
  ): boolean {
    try {
      const context = { inputs, stepResults };
      const fn = new Function('context', `with(context) { return ${condition}; }`);
      return Boolean(fn(context));
    } catch {
      return true;
    }
  }

  private mergeParameters(
    parameters: Record<string, any>,
    inputs: Record<string, any>,
    stepResults: Record<string, any>
  ): Record<string, any> {
    const merged: Record<string, any> = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const varName = value.slice(2, -2).trim();
        merged[key] = inputs[varName] ?? stepResults[varName] ?? value;
      } else {
        merged[key] = value;
      }
    }
    return merged;
  }

  private updateEffectivenessScore(work: WorkConfig, allStepsExecuted: boolean): number {
    const baseIncrement = allStepsExecuted ? 0.02 : 0.005;
    return Math.min(1, work.effectivenessScore + baseIncrement);
  }

  private mapRowToWorkConfig(row: any): WorkConfig {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description || '',
      category: row.category || '',
      workflow: typeof row.workflow === 'string' ? JSON.parse(row.workflow) : row.workflow,
      inputs: typeof row.inputs === 'string' ? JSON.parse(row.inputs) : row.inputs,
      outputs: typeof row.outputs === 'string' ? JSON.parse(row.outputs) : row.outputs,
      effectivenessScore: row.effectiveness_score,
      usageCount: row.usage_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private generateId(): string {
    return `work:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  }
}