import { z } from 'zod';
import { ChatMessage } from '../base/LLMWrapper';
import { AgentOrchestrator, OrchestrationResult } from '../strategy/AgentOrchestrator';
import { LLMService } from '../core/llm/LLMService';

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['llm', 'skill', 'mcp', 'work']),
  toolId: z.string().optional(),
  parameters: z.record(z.string(), z.any()).default({}),
  dependencies: z.array(z.string()).default([]),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).default('pending'),
  result: z.string().optional(),
  error: z.string().optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const DAGNodeSchema = z.object({
  id: z.string(),
  task: TaskSchema,
  children: z.array(z.string()).default([]),
});

export type DAGNode = z.infer<typeof DAGNodeSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  userId: z.string(),
  chatId: z.string(),
  tasks: z.array(TaskSchema),
  dag: z.array(DAGNodeSchema),
  status: z.enum(['draft', 'executing', 'completed', 'failed']).default('draft'),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type Plan = z.infer<typeof PlanSchema>;

export class AgentPlan {
  constructor(
    private orchestrator: AgentOrchestrator,
    private llmService: LLMService
  ) {}

  async createPlan(userId: string, chatId: string, messages: ChatMessage[]): Promise<Plan> {
    const id = require('uuid').v4();
    const now = Date.now();

    const tasks: Task[] = [
      {
        id: require('uuid').v4(),
        name: 'Analyze Request',
        description: 'Analyze user request and determine intent',
        type: 'llm',
        parameters: {},
        dependencies: [],
        status: 'pending',
      },
      {
        id: require('uuid').v4(),
        name: 'Execute Task',
        description: 'Execute the main task',
        type: 'llm',
        parameters: {},
        dependencies: [],
        status: 'pending',
      },
      {
        id: require('uuid').v4(),
        name: 'Summarize Result',
        description: 'Summarize the final result',
        type: 'llm',
        parameters: {},
        dependencies: [],
        status: 'pending',
      },
    ];

    const dag: DAGNode[] = tasks.map((task, index) => ({
      id: task.id,
      task,
      children: index < tasks.length - 1 ? [tasks[index + 1].id] : [],
    }));

    return {
      id,
      userId,
      chatId,
      tasks,
      dag,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };
  }

  async executePlan(plan: Plan): Promise<{ plan: Plan; result: OrchestrationResult }> {
    plan.status = 'executing';
    plan.updatedAt = Date.now();

    const messages: ChatMessage[] = [
      { role: 'user', content: 'Execute the plan' },
    ];

    const result = await this.orchestrator.orchestrate(messages, { plan });

    plan.status = 'completed';
    plan.updatedAt = Date.now();
    plan.tasks.forEach(task => {
      task.status = 'completed';
    });

    return { plan, result };
  }

  async executeTask(plan: Plan, taskId: string): Promise<Task> {
    const task = plan.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.status = 'in_progress';

    try {
      const messages: ChatMessage[] = [
        { role: 'user', content: task.description },
      ];

      const result = await this.llmService.chatCompletion({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        maxTokens: 4096,
      });

      task.result = result.choices[0]?.message?.content || '';
      task.status = 'completed';
    } catch (error) {
      task.error = (error as Error).message;
      task.status = 'failed';
    }

    plan.updatedAt = Date.now();
    return task;
  }

  async validatePlan(plan: Plan): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (plan.tasks.length === 0) {
      errors.push('Plan must have at least one task');
    }

    const taskIds = new Set(plan.tasks.map(t => t.id));
    for (const task of plan.tasks) {
      for (const dep of task.dependencies) {
        if (!taskIds.has(dep)) {
          errors.push(`Task ${task.id} has unknown dependency ${dep}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  getTaskStatus(plan: Plan, taskId: string): Task['status'] {
    const task = plan.tasks.find(t => t.id === taskId);
    return task?.status || 'pending';
  }
}