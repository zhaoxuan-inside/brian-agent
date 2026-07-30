import {
  RelationDBAccess, InsertDBInput, InsertDBOutput,
  SelectDBInput, SelectDBOutput,
  SelectOneDBInput, SelectOneDBOutput,
  UpdateDBInput, UpdateDBOutput,
  Operator, DataObject, DBContext, IdGenerator,
  ValidationError, NotFoundError, type Logger, type Condition,
} from '@brian-agent/base';
import type {
  AgentBuilderAccess, PlannerAgentAccess, WriterAgentAccess, EvolutorAgentAccess,
} from '@brian-agent/agent';
import {
  BuildAgentInput, BuildAgentOutput,
  AgentBuilderContext,
  PlanInput, PlanOutput,
  ReplanInput, ReplanOutput,
  PlannerAgentContext,
  WriteInput, WriteOutput,
  WriterAgentContext,
  EvalWriterAgentInput, EvalWriterAgentOutput,
  EvalWorkAgentInput, EvalWorkAgentOutput,
  StartEvalScheduleInput, StartEvalScheduleOutput,
  EvolutorAgentContext,
} from '@brian-agent/agent';
import type { OrchestrationExecutionAccess } from '../../OrchestrationExecution/access/OrchestrationExecutionAccess';
import {
  OrchestrationExecutionContext,
  ExecSingleAgentInput, ExecSingleAgentOutput,
  BuildAgentDAGInput, BuildAgentDAGOutput,
  ExecDAGInput, ExecDAGOutput,
  type AgentDAG, type TaskDAG,
} from '../../OrchestrationExecution/domain/types';
import type { JSONNodeAccess } from '../../JSONNode/access/JSONNodeAccess';
import { ValidateJSONNodeInput, ValidateJSONNodeOutput, ExecJSONNodeInput, ExecJSONNodeOutput, JSONNodeContext } from '../../JSONNode/domain/types';
import {
  OrchestrationStrategyContext,
  StartOrchestrationInput, StartOrchestrationOutput,
  ExecuteSimpleStrategyInput, ExecuteSimpleStrategyOutput,
  ExecutePlanningStrategyInput, ExecutePlanningStrategyOutput,
  ExecutePostProcessingInput, ExecutePostProcessingOutput,
  AddOrchestrationStrategyInput, AddOrchestrationStrategyOutput,
  HandleDAGFailureInput, HandleDAGFailureOutput,
  GetOrchestrationStrategyInput, GetOrchestrationStrategyOutput,
  UpdateOrchestrationStrategyInput, UpdateOrchestrationStrategyOutput,
  ConfigOrchestrationStrategyInput, ConfigOrchestrationStrategyOutput,
} from '../domain/types';

export class OrchestrationStrategyService {
  constructor(
    private readonly relationDb: RelationDBAccess,
    private readonly agentBuilder: AgentBuilderAccess,
    private readonly plannerAgent: PlannerAgentAccess,
    private readonly writerAgent: WriterAgentAccess,
    private readonly evolutorAgent: EvolutorAgentAccess,
    private readonly orchestrationExecution: OrchestrationExecutionAccess,
    private readonly jsonNode: JSONNodeAccess,
    private readonly mqCore?: any,
    private readonly logger?: Logger,
  ) {}

  async startOrchestration(
    input: StartOrchestrationInput,
    context: OrchestrationStrategyContext,
    output: StartOrchestrationOutput,
  ): Promise<boolean> {
    let strategyDef: { jsonnode_definition: string } | null = null;
    try {
      const stratSelInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'orchestration_strategy',
          conditions: [
            { field: 'strategy_label', operator: Operator.EQ, value: input.strategy },
          ] as Condition[],
        },
      });
      const stratSelOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(stratSelInput, new DBContext(), stratSelOutput);
      const row = stratSelOutput.row as Record<string, unknown> | null;
      if (row?.jsonnode_definition) {
        strategyDef = { jsonnode_definition: row.jsonnode_definition as string };
      }
    } catch { /* fall back to direct execution */ }

    if (strategyDef) {
      try {
        const parsedDef = JSON.parse(strategyDef.jsonnode_definition);
        const execInput = Object.assign(new ExecJSONNodeInput(), {
          orchestration_id: input.work_id,
          jsonnode_definition: parsedDef,
          initial_data: {
            session_id: input.session_id,
            work_id: input.work_id,
            interact_id: input.interact_id,
            user_query: input.user_query,
            work_context: input.work_context ?? {},
          },
        });
        const execOutput = new ExecJSONNodeOutput();
        await this.jsonNode.execJSONNode(execInput, new JSONNodeContext(), execOutput);

        const finalResponse = (execOutput.shared_data.final_response as string) ?? '';
        output.final_response = finalResponse;
        if (finalResponse) {
          return true;
        }
        // fallback to direct execution if JSONNode produced empty final_response
      } catch (err: unknown) {
        this.logger?.error?.('startOrchestration: JSONNode execution failed, falling back', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let agentResults: Array<{ agent_id: string; task_content: string; result: string; trace_id: string }> = [];

    if (input.strategy === 'SIMPLE') {
      const simpleInput = Object.assign(new ExecuteSimpleStrategyInput(), {
        work_id: input.work_id,
        interact_id: input.interact_id,
        session_id: input.session_id,
        user_query: input.user_query,
        work_context: input.work_context,
      });
      const simpleOutput = new ExecuteSimpleStrategyOutput();
      await this.executeSimpleStrategy(simpleInput, context, simpleOutput);
      agentResults = simpleOutput.agent_results;
    } else if (input.strategy === 'PLANNING') {
      const planInput = Object.assign(new ExecutePlanningStrategyInput(), {
        work_id: input.work_id,
        interact_id: input.interact_id,
        session_id: input.session_id,
        user_query: input.user_query,
        work_context: input.work_context,
      });
      const planOutput = new ExecutePlanningStrategyOutput();
      await this.executePlanningStrategy(planInput, context, planOutput);
      agentResults = planOutput.agent_results;
    } else {
      return false;
    }

    const postInput = Object.assign(new ExecutePostProcessingInput(), {
      work_id: input.work_id,
      interact_id: input.interact_id,
      session_id: input.session_id,
      user_query: input.user_query,
      agent_results: agentResults,
    });
    const postOutput = new ExecutePostProcessingOutput();
    await this.executePostProcessing(postInput, context, postOutput);

    output.final_response = postOutput.final_response;
    return true;
  }

  async executeSimpleStrategy(
    input: ExecuteSimpleStrategyInput,
    context: OrchestrationStrategyContext,
    output: ExecuteSimpleStrategyOutput,
  ): Promise<boolean> {
    const executionId = IdGenerator.generate();
    const now = IdGenerator.now();

    const buildAgentInput = Object.assign(new BuildAgentInput(), {
      interact_id: input.interact_id,
      task_content: input.user_query,
      force_new: false,
    });
    const buildAgentOutput = new BuildAgentOutput();
    const buildSuccess = await this.agentBuilder.buildAgent(buildAgentInput, context as unknown as AgentBuilderContext, buildAgentOutput);
    if (!buildSuccess) {
      const updFailData: DataObject[] = [
        { field: 'status', value: 'FAILED' },
        { field: 'error_message', value: (buildAgentOutput as unknown as Record<string, unknown>).error as string ?? 'buildAgent failed' },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updFailInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_work',
        data: updFailData,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updFailInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      return false;
    }
    const agentId = buildAgentOutput.agent_id;

    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_strategy',
        conditions: [
          { field: 'strategy_label', operator: Operator.EQ, value: 'SIMPLE' },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
    const strategyId = ((selOutput.row?.strategy_id as string) ?? '');

    const execData: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'execution_id', value: executionId },
      { field: 'work_id', value: input.work_id },
      { field: 'strategy_id', value: strategyId },
      { field: 'plan_id', value: '' },
      { field: 'plan_retry_count', value: 0 },
      { field: 'execution_status', value: 'RUNNING' },
      { field: 'error_info', value: '' },
    ];
    const insExecInput = Object.assign(new InsertDBInput(), {
      table: 'orchestration_strategy_execution',
      data: execData,
    });
    await this.relationDb.insertDB(insExecInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

    const updData: DataObject[] = [
      { field: 'status', value: 'EXECUTING' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    const execSingleInput = Object.assign(new ExecSingleAgentInput(), {
      work_id: input.work_id,
      interact_id: input.interact_id,
      agent_id: agentId,
      task_content: input.user_query,
      work_context: input.work_context ? JSON.stringify(input.work_context) : undefined,
    });
    const execSingleOutput = new ExecSingleAgentOutput();
    const execSuccess = await this.orchestrationExecution.execSingleAgent(
      execSingleInput,
      context as unknown as OrchestrationExecutionContext,
      execSingleOutput,
    );
    if (!execSuccess) {
      const updFailData: DataObject[] = [
        { field: 'execution_status', value: 'FAILED' },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updFailInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_strategy_execution',
        data: updFailData,
        conditions: [
          { field: 'execution_id', operator: Operator.EQ, value: executionId },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updFailInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      const updWorkFailData: DataObject[] = [
        { field: 'status', value: 'FAILED' },
        { field: 'error_message', value: (execSingleOutput as unknown as Record<string, unknown>).error as string ?? 'execSingleAgent failed' },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updWorkFailInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_work',
        data: updWorkFailData,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updWorkFailInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      return false;
    }

    const updDoneData: DataObject[] = [
      { field: 'execution_status', value: 'COMPLETED' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updDoneInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_strategy_execution',
      data: updDoneData,
      conditions: [
        { field: 'execution_id', operator: Operator.EQ, value: executionId },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updDoneInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    output.agent_results = [{
      agent_id: agentId,
      task_content: input.user_query,
      result: execSingleOutput.answer,
      trace_id: execSingleOutput.trace_id,
    }];
    output.plan_id = '';
    return true;
  }

  async executePlanningStrategy(
    input: ExecutePlanningStrategyInput,
    context: OrchestrationStrategyContext,
    output: ExecutePlanningStrategyOutput,
  ): Promise<boolean> {
    const executionId = IdGenerator.generate();
    const now = IdGenerator.now();

    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_strategy',
        conditions: [
          { field: 'strategy_label', operator: Operator.EQ, value: 'PLANNING' },
        ] as Condition[],
      },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
    const strategyId = ((selOutput.row?.strategy_id as string) ?? '');

    const execData: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'execution_id', value: executionId },
      { field: 'work_id', value: input.work_id },
      { field: 'strategy_id', value: strategyId },
      { field: 'plan_id', value: '' },
      { field: 'plan_retry_count', value: 0 },
      { field: 'execution_status', value: 'RUNNING' },
      { field: 'error_info', value: '' },
    ];
    const insExecInput = Object.assign(new InsertDBInput(), {
      table: 'orchestration_strategy_execution',
      data: execData,
    });
    await this.relationDb.insertDB(insExecInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

    const updPlanData: DataObject[] = [
      { field: 'status', value: 'PLANNING' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updPlanInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updPlanData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updPlanInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    const planInput = Object.assign(new PlanInput(), {
      work_id: input.work_id,
      interact_id: input.interact_id,
      task_content: input.user_query,
    });
    const planOutput = new PlanOutput();
    const planSuccess = await this.plannerAgent.plan(planInput, context as unknown as PlannerAgentContext, planOutput);
    if (!planSuccess) {
      const updFailData: DataObject[] = [
        { field: 'execution_status', value: 'FAILED' },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updFailInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_strategy_execution',
        data: updFailData,
        conditions: [
          { field: 'execution_id', operator: Operator.EQ, value: executionId },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updFailInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      const updWorkFailData: DataObject[] = [
        { field: 'status', value: 'FAILED' },
        { field: 'error_message', value: (planOutput as unknown as Record<string, unknown>).error as string ?? 'plannerAgent.plan failed' },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updWorkFailInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_work',
        data: updWorkFailData,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updWorkFailInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      return false;
    }
    const planId = planOutput.plan_id;
    const taskDag = planOutput.task_dag as unknown as TaskDAG;

    const updTaskCountData: DataObject[] = [
      { field: 'task_count', value: taskDag.nodes.length },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updTaskCountInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updTaskCountData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updTaskCountInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    const updExecPlanData: DataObject[] = [
      { field: 'plan_id', value: planId },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updExecPlanInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_strategy_execution',
      data: updExecPlanData,
      conditions: [
        { field: 'execution_id', operator: Operator.EQ, value: executionId },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updExecPlanInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    const buildDagInput = Object.assign(new BuildAgentDAGInput(), {
      plan_id: planId,
      task_dag: taskDag,
      interact_id: input.interact_id,
    });
    const buildDagOutput = new BuildAgentDAGOutput();
    await this.orchestrationExecution.buildAgentDAG(
      buildDagInput,
      context as unknown as OrchestrationExecutionContext,
      buildDagOutput,
    );
    const agentDag = buildDagOutput.agent_dag;

    const updExecData: DataObject[] = [
      { field: 'status', value: 'EXECUTING' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updExecInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updExecData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updExecInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    const execDagInput = Object.assign(new ExecDAGInput(), {
      work_id: input.work_id,
      agent_dag: agentDag,
      work_context: input.work_context ? JSON.stringify(input.work_context) : undefined,
    });
    const execDagOutput = new ExecDAGOutput();
    try {
      await this.orchestrationExecution.execDAG(
        execDagInput,
        context as unknown as OrchestrationExecutionContext,
        execDagOutput,
      );
    } catch (_err: unknown) {
      const failedInfo = (_err as Record<string, unknown> | null) ?? {};
      const errMsg = String((failedInfo.reason as string) ?? (_err instanceof Error ? _err.message : String(_err)));
      const failedAgentId = (failedInfo.agent_id as string) ?? '';
      const failedTaskId = (failedInfo.task_id as string) ?? '';
      const completedResults = (failedInfo.completed_results as Array<{ agent_id: string; task_id: string }>) ?? [];

      const failureInput = Object.assign(new HandleDAGFailureInput(), {
        plan_id: planId,
        failed_task_id: failedTaskId,
        failure_reason: errMsg,
        completed_task_ids: completedResults.map((r) => r.task_id),
        work_id: input.work_id,
        interact_id: input.interact_id,
        agent_dag: agentDag as unknown as Record<string, unknown>,
      });
      const failureOutput = new HandleDAGFailureOutput();
      await this.handleDAGFailure(failureInput, context, failureOutput);

      if (failureOutput.action === 'FAIL') {
        const updFailData: DataObject[] = [
          { field: 'execution_status', value: 'FAILED' },
          { field: 'error_info', value: errMsg },
          { field: 'updated', value: IdGenerator.now() },
        ];
        const updFailInput = Object.assign(new UpdateDBInput(), {
          table: 'orchestration_strategy_execution',
          data: updFailData,
          conditions: [
            { field: 'execution_id', operator: Operator.EQ, value: executionId },
          ] as Condition[],
        });
        await this.relationDb.updateDB(updFailInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
        output.error = errMsg;
        return false;
      }

      if (failureOutput.action === 'REPLAN' && failureOutput.new_agent_dag) {
        const replanDagInput = Object.assign(new ExecDAGInput(), {
          work_id: input.work_id,
          agent_dag: failureOutput.new_agent_dag as unknown as AgentDAG,
          work_context: input.work_context ? JSON.stringify(input.work_context) : undefined,
        });
        const replanDagOutput = new ExecDAGOutput();
        await this.orchestrationExecution.execDAG(
          replanDagInput,
          context as unknown as OrchestrationExecutionContext,
          replanDagOutput,
        );
        Object.assign(execDagOutput, replanDagOutput);
      }
    }

    let completedCount = 0;
    for (const ar of execDagOutput.agent_results) {
      completedCount++;
      const updCountData: DataObject[] = [
        { field: 'completed_task_count', value: completedCount },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updCountInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_work',
        data: updCountData,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updCountInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
    }

    const updDoneData: DataObject[] = [
      { field: 'execution_status', value: 'COMPLETED' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updDoneInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_strategy_execution',
      data: updDoneData,
      conditions: [
        { field: 'execution_id', operator: Operator.EQ, value: executionId },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updDoneInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    output.agent_results = execDagOutput.agent_results.map((ar) => ({
      agent_id: ar.agent_id,
      task_content: '',
      result: ar.answer,
      trace_id: ar.trace_id,
    }));
    output.plan_id = planId;
    return true;
  }

  async executePostProcessing(
    input: ExecutePostProcessingInput,
    context: OrchestrationStrategyContext,
    output: ExecutePostProcessingOutput,
  ): Promise<boolean> {
    const updWriteData: DataObject[] = [
      { field: 'status', value: 'WRITING' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updWriteInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updWriteData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updWriteInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    const writeInput = Object.assign(new WriteInput(), {
      work_id: input.work_id,
      interact_id: input.interact_id,
      user_query: input.user_query,
      agent_results: input.agent_results,
    });
    const writeOutput = new WriteOutput();
    const writeSuccess = await this.writerAgent.write(writeInput, context as unknown as WriterAgentContext, writeOutput);
    if (!writeSuccess) {
      const updFailData: DataObject[] = [
        { field: 'status', value: 'FAILED' },
        { field: 'error_message', value: (writeOutput as unknown as Record<string, unknown>).error as string ?? 'WriterAgent failed' },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updFailInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_work',
        data: updFailData,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updFailInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      return false;
    }
    const finalResponse = writeOutput.response;
    const evalId = IdGenerator.generate();

    const writerAgentId = (writeOutput as unknown as Record<string, unknown>).agent_id as string ?? '';

    const updEvalData: DataObject[] = [
      { field: 'status', value: 'EVALUATING' },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updEvalInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updEvalData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updEvalInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    setImmediate(() => {
      const evalWriterInput = Object.assign(new EvalWriterAgentInput(), {
        agent_id: writerAgentId,
        work_id: input.work_id,
        interact_id: input.interact_id,
        user_query: input.user_query,
        final_response: finalResponse,
        agent_results: input.agent_results,
      });
      const evalWriterOutput = new EvalWriterAgentOutput();
      Promise.resolve(
        this.evolutorAgent.evalWriterAgent(
          evalWriterInput,
          context as unknown as EvolutorAgentContext,
          evalWriterOutput,
        ),
      ).catch((err: unknown) => {
        this.logger?.error?.('executePostProcessing: evalWriterAgent failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    setImmediate(() => {
      for (const agentResult of input.agent_results) {
        const evalWorkInput = Object.assign(new EvalWorkAgentInput(), {
          agent_id: agentResult.agent_id,
          work_id: input.work_id,
          interact_id: input.interact_id,
          task_content: agentResult.task_content,
          agent_output: agentResult.result,
          trace_id: agentResult.trace_id,
        });
        const evalWorkOutput = new EvalWorkAgentOutput();
        Promise.resolve(
          this.evolutorAgent.evalWorkAgent(
            evalWorkInput,
            context as unknown as EvolutorAgentContext,
            evalWorkOutput,
          ),
        ).catch((err: unknown) => {
          this.logger?.error?.('executePostProcessing: evalWorkAgent failed', {
            agent_id: agentResult.agent_id,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    });

    setImmediate(async () => {
      try {
        let shouldStart = true;
        if (this.mqCore) {
          try {
            const getWorkerInput = Object.assign({}, { identifier: 'eval_schedule' });
            const getWorkerOutput = Object.assign({}, { worker: null });
            await this.mqCore.getWorker(getWorkerInput, {}, getWorkerOutput);
            if (getWorkerOutput.worker) {
              shouldStart = false;
            }
          } catch { /* continue to start if check fails */ }
        }

        if (shouldStart) {
          const startEvalInput = Object.assign(new StartEvalScheduleInput(), {});
          const startEvalOutput = new StartEvalScheduleOutput();
          await this.evolutorAgent.startEvalSchedule(
            startEvalInput,
            context as unknown as EvolutorAgentContext,
            startEvalOutput,
          );
        }
      } catch (err: unknown) {
        this.logger?.error?.('executePostProcessing: startEvalSchedule failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    output.final_response = finalResponse;
    output.eval_id = evalId;
    return true;
  }

  async addStrategy(
    input: AddOrchestrationStrategyInput,
    _context: OrchestrationStrategyContext,
    output: AddOrchestrationStrategyOutput,
  ): Promise<boolean> {
    if (!input.strategy_label) {
      throw new ValidationError('strategy_label is required');
    }

    const existInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_strategy',
        conditions: [
          { field: 'strategy_label', operator: Operator.EQ, value: input.strategy_label },
        ] as Condition[],
      },
    });
    const existOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(existInput, new DBContext(), existOutput);
    if (existOutput.row) {
      throw new ValidationError(`Strategy label "${input.strategy_label}" already exists`);
    }

    let parsedDef: unknown;
    try {
      parsedDef = JSON.parse(input.jsonnode_definition);
    } catch {
      throw new ValidationError('jsonnode_definition must be valid JSON');
    }

    const validateInput = Object.assign(new ValidateJSONNodeInput(), {
      jsonnode_definition: parsedDef,
    });
    const validateOutput = new ValidateJSONNodeOutput();
    this.jsonNode.validate(validateInput, new JSONNodeContext(), validateOutput);
    if (!validateOutput.valid) {
      throw new ValidationError(`Invalid jsonnode_definition: ${validateOutput.errors.join('; ')}`);
    }

    const strategyId = IdGenerator.generate();
    const now = IdGenerator.now();
    const data: DataObject[] = [
      { field: 'id', value: IdGenerator.generate() },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'strategy_id', value: strategyId },
      { field: 'strategy_label', value: input.strategy_label },
      { field: 'strategy_description', value: input.strategy_description },
      { field: 'jsonnode_definition', value: input.jsonnode_definition },
      { field: 'enable', value: input.enable !== false ? 1 : 0 },
    ];
    const insInput = Object.assign(new InsertDBInput(), {
      table: 'orchestration_strategy',
      data,
    });
    await this.relationDb.insertDB(insInput, new DBContext(), Object.assign(new InsertDBOutput(), {}));

    output.strategy_id = strategyId;
    return true;
  }

  async handleDAGFailure(
    input: HandleDAGFailureInput,
    context: OrchestrationStrategyContext,
    output: HandleDAGFailureOutput,
  ): Promise<boolean> {
    const selWorkInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_work',
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      },
    });
    const selWorkOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selWorkInput, new DBContext(), selWorkOutput);

    const metadataStr = ((selWorkOutput.row?.metadata as string) ?? '{}');
    let metadata: Record<string, unknown> = {};
    try { metadata = JSON.parse(metadataStr); } catch { /* ignore */ }

    // ===== 新增：基于 metadata 的全局循环检测 & 全局 replan 计数保护 =====
    // 1) failure_history：记录每次失败的 {failed_task_id, failure_reason}，用于识别「同一任务相同原因反复失败」
    const history = Array.isArray(metadata.failure_history) ? (metadata.failure_history as Array<{ failed_task_id: string; failure_reason: string }>) : [];
    const loopDetected = history.some(
      (h) => h.failed_task_id === input.failed_task_id && h.failure_reason === input.failure_reason,
    );
    history.push({ failed_task_id: input.failed_task_id, failure_reason: input.failure_reason });
    metadata.failure_history = history;

    // 2) replan_total_count：整个 work 维度已触发的 replan 总次数（跨 plan 累加，防止多个 plan 绕开单 plan 上限）
    const totalReplan = Number(metadata.replan_total_count ?? 0);
    const MAX_GLOBAL_REPLAN = 5;

    metadata.failed_task_id = input.failed_task_id;
    metadata.failure_reason = input.failure_reason;

    if (loopDetected) {
      metadata.replan_abort_reason = 'LOOP_DETECTED';
      const updMetaData: DataObject[] = [
        { field: 'status', value: 'FAILED' },
        { field: 'error_message', value: `[Loop detected] 任务 ${input.failed_task_id} 反复以相同原因失败: ${input.failure_reason}` },
        { field: 'metadata', value: JSON.stringify(metadata) },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updMetaInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_work',
        data: updMetaData,
        conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }] as Condition[],
      });
      await this.relationDb.updateDB(updMetaInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      output.action = 'FAIL';
      output.max_retry_reached = true;
      return true;
    }

    if (totalReplan >= MAX_GLOBAL_REPLAN) {
      metadata.replan_abort_reason = 'MAX_GLOBAL_REPLAN_EXCEEDED';
      const updMetaData: DataObject[] = [
        { field: 'status', value: 'FAILED' },
        { field: 'error_message', value: `[Global guard] 触发 REPLAN 超过全局上限 (${MAX_GLOBAL_REPLAN})` },
        { field: 'metadata', value: JSON.stringify(metadata) },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updMetaInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_work',
        data: updMetaData,
        conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }] as Condition[],
      });
      await this.relationDb.updateDB(updMetaInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
      output.action = 'FAIL';
      output.max_retry_reached = true;
      return true;
    }
    // ===== 全局保护结束 =====

    const updMetaData0: DataObject[] = [
      { field: 'metadata', value: JSON.stringify(metadata) },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updMetaInput0 = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: updMetaData0,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updMetaInput0, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    const configSelInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'orchestration_config' },
    });
    const configSelOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(configSelInput, new DBContext(), configSelOutput);
    const config = (configSelOutput.row ?? {}) as Record<string, unknown>;
    const maxPlanRetries = (config.max_plan_retries as number) ?? 2;

    const execSelInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_strategy_execution',
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
          { field: 'plan_id', operator: Operator.EQ, value: input.plan_id },
        ] as Condition[],
      },
    });
    const execSelOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(execSelInput, new DBContext(), execSelOutput);
    const planRetryCount = (execSelOutput.row?.plan_retry_count as number) ?? 0;

    if (planRetryCount >= maxPlanRetries) {
      const updFailData: DataObject[] = [
        { field: 'status', value: 'FAILED' },
        { field: 'error_message', value: input.failure_reason },
        { field: 'updated', value: IdGenerator.now() },
      ];
      const updFailInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_work',
        data: updFailData,
        conditions: [
          { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updFailInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

      output.action = 'FAIL';
      output.max_retry_reached = true;
      return true;
    }

    const replanInput = Object.assign(new ReplanInput(), {
      plan_id: input.plan_id,
      failed_task_id: input.failed_task_id,
      failure_reason: input.failure_reason,
      completed_task_ids: input.completed_task_ids,
    });
    const replanOutput = new ReplanOutput();
    await this.plannerAgent.replan(replanInput, context as unknown as PlannerAgentContext, replanOutput);
    const newTaskDag = replanOutput.task_dag as unknown as TaskDAG;

    // replan 成功后推进全局计数器（仅在真正触发 PlannerAgent.replan 之后 +1，保证原有用例不受影响）
    const mdAfter = { ...metadata, replan_total_count: totalReplan + 1 };
    const mdAfterData: DataObject[] = [
      { field: 'metadata', value: JSON.stringify(mdAfter) },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const mdAfterInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_work',
      data: mdAfterData,
      conditions: [{ field: 'work_id', operator: Operator.EQ, value: input.work_id }] as Condition[],
    });
    await this.relationDb.updateDB(mdAfterInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    const newBuildDagInput = Object.assign(new BuildAgentDAGInput(), {
      plan_id: input.plan_id,
      task_dag: newTaskDag,
      interact_id: input.interact_id,
    });
    const newBuildDagOutput = new BuildAgentDAGOutput();
    await this.orchestrationExecution.buildAgentDAG(
      newBuildDagInput,
      context as unknown as OrchestrationExecutionContext,
      newBuildDagOutput,
    );

    const newRetryCount = planRetryCount + 1;
    const updRetryData: DataObject[] = [
      { field: 'plan_retry_count', value: newRetryCount },
      { field: 'updated', value: IdGenerator.now() },
    ];
    const updRetryInput = Object.assign(new UpdateDBInput(), {
      table: 'orchestration_strategy_execution',
      data: updRetryData,
      conditions: [
        { field: 'work_id', operator: Operator.EQ, value: input.work_id },
        { field: 'plan_id', operator: Operator.EQ, value: input.plan_id },
      ] as Condition[],
    });
    await this.relationDb.updateDB(updRetryInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));

    output.action = 'REPLAN';
    output.new_agent_dag = newBuildDagOutput.agent_dag as unknown as Record<string, unknown>;
    output.max_retry_reached = false;
    return true;
  }

  async getStrategy(
    input: GetOrchestrationStrategyInput,
    _context: OrchestrationStrategyContext,
    output: GetOrchestrationStrategyOutput,
  ): Promise<boolean> {
    if (input.strategy_id) {
      const selOneInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'orchestration_strategy',
          conditions: [
            { field: 'strategy_id', operator: Operator.EQ, value: input.strategy_id },
          ] as Condition[],
        },
      });
      const selOneOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(selOneInput, new DBContext(), selOneOutput);
      if (selOneOutput.row) {
        output.strategies = [selOneOutput.row];
      }
      return true;
    }

    const conditions: Condition[] = [];
    if (input.strategy_label) {
      conditions.push({ field: 'strategy_label', operator: Operator.EQ, value: input.strategy_label });
    }
    if (input.conditions) {
      for (const cond of input.conditions) {
        conditions.push({ field: cond.field, operator: cond.operator as Operator, value: cond.value });
      }
    }

    const selInput = Object.assign(new SelectDBInput(), {
      query_param: {
        table: 'orchestration_strategy',
        conditions,
        page: input.page,
      },
    });
    const selOutput = Object.assign(new SelectDBOutput(), {});
    await this.relationDb.selectDB(selInput, new DBContext(), selOutput);
    output.strategies = selOutput.rows;
    return true;
  }

  async updateStrategy(
    input: UpdateOrchestrationStrategyInput,
    _context: OrchestrationStrategyContext,
    output: UpdateOrchestrationStrategyOutput,
  ): Promise<boolean> {
    const existInput = Object.assign(new SelectOneDBInput(), {
      query_param: {
        table: 'orchestration_strategy',
        conditions: [
          { field: 'strategy_id', operator: Operator.EQ, value: input.strategy_id },
        ] as Condition[],
      },
    });
    const existOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(existInput, new DBContext(), existOutput);
    if (!existOutput.row) {
      throw new NotFoundError('OrchestrationStrategy', input.strategy_id);
    }

    const data: DataObject[] = [];
    data.push({ field: 'updated', value: IdGenerator.now() });

    if (input.strategy_label !== undefined) {
      data.push({ field: 'strategy_label', value: input.strategy_label });
    }
    if (input.strategy_description !== undefined) {
      data.push({ field: 'strategy_description', value: input.strategy_description });
    }
    if (input.jsonnode_definition !== undefined) {
      let parsedDef: unknown;
      try {
        parsedDef = JSON.parse(input.jsonnode_definition);
      } catch {
        throw new ValidationError('jsonnode_definition must be valid JSON');
      }
      const validateInput = Object.assign(new ValidateJSONNodeInput(), {
        jsonnode_definition: parsedDef,
      });
      const validateOutput = new ValidateJSONNodeOutput();
      this.jsonNode.validate(validateInput, new JSONNodeContext(), validateOutput);
      if (!validateOutput.valid) {
        throw new ValidationError(`Invalid jsonnode_definition: ${validateOutput.errors.join('; ')}`);
      }
      data.push({ field: 'jsonnode_definition', value: input.jsonnode_definition });
    }
    if (input.enable !== undefined) {
      data.push({ field: 'enable', value: input.enable ? 1 : 0 });
    }

    if (data.length > 1) {
      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_strategy',
        data,
        conditions: [
          { field: 'strategy_id', operator: Operator.EQ, value: input.strategy_id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
    }

    return true;
  }

  async configOrchestrationStrategy(
    input: ConfigOrchestrationStrategyInput,
    _context: OrchestrationStrategyContext,
    output: ConfigOrchestrationStrategyOutput,
  ): Promise<boolean> {
    const selInput = Object.assign(new SelectOneDBInput(), {
      query_param: { table: 'orchestration_config' },
    });
    const selOutput = Object.assign(new SelectOneDBOutput(), {});
    await this.relationDb.selectOneDB(selInput, new DBContext(), selOutput);
    const current = (selOutput.row ?? {}) as Record<string, unknown>;
    const id = (current.id as string) || 'orchestration_config_default';
    const data: DataObject[] = [{ field: 'id', value: id }, { field: 'updated', value: IdGenerator.now() }];

    if (input.default_strategy_id !== undefined) {
      const stratSelInput = Object.assign(new SelectOneDBInput(), {
        query_param: {
          table: 'orchestration_strategy',
          conditions: [
            { field: 'strategy_id', operator: Operator.EQ, value: input.default_strategy_id },
          ] as Condition[],
        },
      });
      const stratSelOutput = Object.assign(new SelectOneDBOutput(), {});
      await this.relationDb.selectOneDB(stratSelInput, new DBContext(), stratSelOutput);
      if (!stratSelOutput.row) {
        throw new NotFoundError('OrchestrationStrategy', input.default_strategy_id);
      }
      data.push({ field: 'default_strategy_id', value: input.default_strategy_id });
    }
    if (input.max_plan_retries !== undefined) {
      if (input.max_plan_retries < 0) {
        throw new ValidationError('max_plan_retries must be non-negative');
      }
      data.push({ field: 'max_plan_retries', value: input.max_plan_retries });
    }
    if (input.plan_prompt_template_id !== undefined) {
      data.push({ field: 'plan_prompt_template_id', value: input.plan_prompt_template_id });
    }

    if (data.length > 2) {
      const updInput = Object.assign(new UpdateDBInput(), {
        table: 'orchestration_config',
        data,
        conditions: [
          { field: 'id', operator: Operator.EQ, value: id },
        ] as Condition[],
      });
      await this.relationDb.updateDB(updInput, new DBContext(), Object.assign(new UpdateDBOutput(), {}));
    }

    output.config = current;
    return true;
  }
}
