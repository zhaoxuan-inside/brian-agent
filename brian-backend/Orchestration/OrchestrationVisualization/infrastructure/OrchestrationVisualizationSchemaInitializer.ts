export class OrchestrationVisualizationSchemaInitializer {
  async init(): Promise<void> {
    // 可视化模块不新增表，复用已有表：
    // orchestration_work, orchestration_task_agent, orchestration_agent_dag,
    // orchestration_agent_execution, orchestration_agent_dag_record
  }
}
