/** 编排节点 / Agent 类型的展示文案。内联思考轨迹与详情弹窗共用，避免两套翻译。 */

export const PIPELINE_NODE_LABEL: Record<string, string> = {
  PLAN_WORK: '拆解任务',
  BUILD_AGENT_DAG: '编排执行图',
  BUILD_WORK_AGENT: '准备执行 Agent',
  EXEC_AGENT: '执行任务',
  EXEC_DAG: '执行任务',
  BUILD_WORK_CONTEXT: '整理上下文',
  SAVE_USER_INPUT: '保存提问',
  WRITE_RESULT: '整理回复',
  SAVE_RESPONSE: '保存回复',
  EVAL_RESULT: '评估结果',
  HANDLE_ERROR: '错误处理',
  CONDITION: '条件判断',
}

/** 对用户无信息增量的编排步骤，默认不出现在对话内联轨迹里 */
export const HIDDEN_PIPELINE_NODES = new Set([
  'SAVE_USER_INPUT',
  'SAVE_RESPONSE',
  'CONDITION',
  'BUILD_AGENT_DAG',
  'BUILD_WORK_AGENT',
  'EVAL_RESULT',
])

export function pipelineNodeLabel(nodeType: string): string {
  return PIPELINE_NODE_LABEL[nodeType] || nodeType
}

export function agentTypeLabel(type?: string): string {
  switch ((type || 'WORKER').toUpperCase()) {
    case 'PLANNER': return '规划'
    case 'WRITER': return '整理回复'
    case 'EVOLUTOR': return '评估'
    case 'INTENT': return '理解需求'
    default: return '执行'
  }
}
