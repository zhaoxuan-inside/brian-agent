import type { DBWrapper } from '../base/DBWrapper';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../infrastructure/logger';

export const BUILTIN_STRATEGIES = ['CoT', 'ReAct'] as const;
export type BuiltinStrategy = typeof BUILTIN_STRATEGIES[number];

const COT_FLOW = JSON.stringify({
  type: 'cot',
  steps: [
    { name: 'think', type: 'THINK' },
    { name: 'answer', type: 'ANSWER', condition: 'action = FINISH' },
  ],
});

const REACT_FLOW = JSON.stringify({
  type: 'react',
  steps: [
    { name: 'think', type: 'THINK' },
    { name: 'act', type: 'ACT', condition: 'action = CALL_TOOL' },
    { name: 'reflect', type: 'REFLECT', condition: 'action = CALL_TOOL' },
    { name: 'answer', type: 'ANSWER', condition: 'action = FINISH' },
  ],
});

export class StrategyConfigService {
  private db: DBWrapper;

  constructor(db: DBWrapper) {
    this.db = db;
  }

  async ensureBuiltinStrategies(): Promise<void> {
    await this.ensureStrategy('CoT', 'Chain of Thought —— 纯推理链策略，不调用外部工具，通过逐步思考推导结论', COT_FLOW);
    await this.ensureStrategy('ReAct', 'Reasoning + Acting —— 思考→行动→观察循环策略，适合需要工具交互的任务', REACT_FLOW);
    logger.info('STRATEGY', 'Built-in strategies (CoT, ReAct) ensured');
  }

  async isBuiltin(strategyName: string): Promise<boolean> {
    const row = await this.db.get<{ is_system: number }>(
      'SELECT is_system FROM agent_strategy_config WHERE strategy_name = ?',
      [strategyName],
    );
    return row ? row.is_system === 1 : false;
  }

  async guardModify(strategyName: string, operation: 'update' | 'delete'): Promise<void> {
    if (await this.isBuiltin(strategyName)) {
      throw new Error(`内置策略 "${strategyName}" 不可${operation === 'delete' ? '删除' : '修改'}`);
    }
  }

  async guardDelete(strategyName: string): Promise<void> {
    return this.guardModify(strategyName, 'delete');
  }

  async guardUpdate(strategyName: string): Promise<void> {
    return this.guardModify(strategyName, 'update');
  }

  private async ensureStrategy(
    name: string,
    brief: string,
    flow: string,
  ): Promise<void> {
    const existing = await this.db.get<{ id: string }>(
      'SELECT id FROM agent_strategy_config WHERE strategy_name = ? AND is_system = 1',
      [name],
    );

    if (existing) {
      // Ensure the flow definition is up-to-date
      await this.db.run(
        `UPDATE agent_strategy_config
         SET agent_strategy_brief = ?, agent_strategy_flow = ?, updated_at = strftime('%s', 'now')
         WHERE strategy_name = ? AND is_system = 1`,
        [brief, flow, name],
      );
      return;
    }

    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    await this.db.run(
      `INSERT INTO agent_strategy_config
       (id, strategy_name, agent_strategy_brief, agent_strategy_flow, max_steps,
        step_timeout_seconds, reuse_probability, retry_count, retry_interval_ms,
        llm_id, think_prompt_template_id, answer_prompt_template_id,
        is_system, enable, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      [
        id, name, brief, flow, 10, 180, 0.75, 3, '[30000,60000,120000]',
        '', '', '',
        now, now,
      ],
    );

    logger.info('STRATEGY', `Built-in strategy "${name}" created, id=${id}`);
  }
}
