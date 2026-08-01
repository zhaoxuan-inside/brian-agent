import type { AgentDatabase } from '../infra/dbTypes';
import { Input, Context, Output } from '../../shared/base';
import { NotFoundError } from '../../shared/errors';
import { logger } from '../../infrastructure/logger';
import { AopProxy } from '../infra/aopProxy';
import { generateId } from '../AgentLibrary/agentTypes';
import type { AgentLibraryService } from '../AgentLibrary/AgentLibrary';
import { MatchStrategyInput, MatchStrategyContext, MatchStrategyOutput } from '../AgentStrategy/AgentStrategy';
import { AddAgentInput, AddAgentContext, AddAgentOutput, MatchAgentInput, MatchAgentContext, MatchAgentOutput, RecordAgentUsageInput, RecordAgentUsageContext, RecordAgentUsageOutput, GetAgentInput, GetAgentContext, GetAgentOutput, UpdateAgentInput, UpdateAgentContext, UpdateAgentOutput } from '../AgentLibrary/AgentLibrary';
import type { AgentTypeEnum } from '../AgentLibrary/agentTypes';
import type { AgentStrategyService } from '../AgentStrategy/AgentStrategy';
import type { LLMService } from '../../core/llm/LLMService';

const MODULE = 'AgentBuilder';

function ensureTable(db: AgentDatabase): void {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_builder_config (
    id TEXT PRIMARY KEY, created INTEGER NOT NULL, updated INTEGER NOT NULL,
    task_analysis_prompt_template_id TEXT NOT NULL DEFAULT '',
    default_strategy_id TEXT NOT NULL DEFAULT '',
    auto_optimize INTEGER NOT NULL DEFAULT 1
  )`);

  const brow = db.prepare('SELECT * FROM agent_builder_config LIMIT 1').get() as Record<string, unknown> | undefined;
  if (!brow) {
    const now = Date.now();
    db.prepare('INSERT INTO agent_builder_config (id,created,updated,auto_optimize) VALUES (?,?,?,1)').run(generateId(), now, now);
  }
}

class BuildAgentInput extends Input {
  interact_id!: string;
  task_content!: string;
  task_complexity?: number;
  task_domain?: string;
  force_new?: boolean;
  constructor(d: Partial<BuildAgentInput>) { super(d); Object.assign(this, d); }
}
class BuildAgentContext extends Context { }
class BuildAgentOutput extends Output { agent_id?: string; }

class OptimizeAgentInput extends Input {
  agent_id!: string;
  interact_id!: string;
  usage_feedback?: string;
  constructor(d: Partial<OptimizeAgentInput>) { super(d); Object.assign(this, d); }
}
class OptimizeAgentContext extends Context { }
class OptimizeAgentOutput extends Output { optimized?: boolean; changes?: { component: string; from: string; to: string }[]; }

class BuildPlannerAgentInput extends Input { force_new?: boolean; constructor(d: Partial<BuildPlannerAgentInput>) { super(d); Object.assign(this, d); } }
class BuildPlannerAgentContext extends Context { }
class BuildPlannerAgentOutput extends Output { agent_id?: string; }

class BuildWriterAgentInput extends Input { force_new?: boolean; constructor(d: Partial<BuildWriterAgentInput>) { super(d); Object.assign(this, d); } }
class BuildWriterAgentContext extends Context { }
class BuildWriterAgentOutput extends Output { agent_id?: string; }

class BuildEvolutorAgentInput extends Input { force_new?: boolean; constructor(d: Partial<BuildEvolutorAgentInput>) { super(d); Object.assign(this, d); } }
class BuildEvolutorAgentContext extends Context { }
class BuildEvolutorAgentOutput extends Output { agent_id?: string; }

class ConfigAgentBuilderInput extends Input {
  task_analysis_prompt_template_id?: string;
  default_strategy_id?: string;
  auto_optimize?: boolean;
  constructor(d: Partial<ConfigAgentBuilderInput>) { super(d); Object.assign(this, d); }
}
class ConfigAgentBuilderContext extends Context { }
class ConfigAgentBuilderOutput extends Output {
  task_analysis_prompt_template_id?: string;
  default_strategy_id?: string;
  auto_optimize?: boolean;
}

export { BuildAgentInput, OptimizeAgentInput, BuildPlannerAgentInput, BuildWriterAgentInput, BuildEvolutorAgentInput, ConfigAgentBuilderInput };
export { BuildAgentContext, OptimizeAgentContext, BuildPlannerAgentContext, BuildWriterAgentContext, BuildEvolutorAgentContext, ConfigAgentBuilderContext };
export { BuildAgentOutput, OptimizeAgentOutput, BuildPlannerAgentOutput, BuildWriterAgentOutput, BuildEvolutorAgentOutput, ConfigAgentBuilderOutput };

export class AgentBuilderService {
  private db: AgentDatabase;

  constructor(
    db: AgentDatabase,
    private libraryService: AgentLibraryService,
    private strategyService: AgentStrategyService,
    private llmService?: LLMService,
  ) {
    this.db = db;
    ensureTable(db);
  }

  buildAgent(input: BuildAgentInput, context: BuildAgentContext, output: BuildAgentOutput): boolean {
    logger.info(MODULE, '[buildAgent] start', { task: input.task_content?.substring(0, 100), force_new: input.force_new });

    const complexity = input.task_complexity ?? this.estimateComplexity(input.task_content);
    const domain = input.task_domain ?? this.estimateDomain(input.task_content);
    const signature = `[${domain}] ${input.task_content.substring(0, 256)}`;

    if (input.force_new !== true) {
      const matchOut = new MatchAgentOutput();
      this.libraryService.matchAgent(
        new MatchAgentInput({ task_signature: signature, agent_type: 'WORKER' }),
        new MatchAgentContext({ sessionId: context.sessionId, workId: context.workId }),
        matchOut
      );
      if (matchOut.agent_id) {
        output.agent_id = matchOut.agent_id;
        this.libraryService.recordAgentUsage(
          new RecordAgentUsageInput({ agent_id: matchOut.agent_id, work_id: context.workId || '', interact_id: input.interact_id }),
          new RecordAgentUsageContext({ sessionId: context.sessionId, workId: context.workId }),
          new RecordAgentUsageOutput()
        );
        logger.info(MODULE, '[buildAgent] reused existing', { agent_id: matchOut.agent_id });
        return true;
      }
    }

    const stratOut = new MatchStrategyOutput();
    this.strategyService.matchStrategy(
      new MatchStrategyInput({ task_content: input.task_content, task_complexity: complexity, task_domain: domain }),
      new MatchStrategyContext({ sessionId: context.sessionId, workId: context.workId }),
      stratOut
    );

    const agentId = generateId();
    const addOut = new AddAgentOutput();
    this.libraryService.addAgent(
      new AddAgentInput({
        agent_id: agentId, agent_type: 'WORKER',
        strategy_id: stratOut.strategy_id || '',
        llm_id: '', soul_id: '',
        task_signature: signature,
        agent_name: `Agent-${agentId.substring(0, 8)}`,
      }),
      new AddAgentContext({ sessionId: context.sessionId, workId: context.workId }),
      addOut
    );

    output.agent_id = addOut.agent_id || agentId;
    logger.info(MODULE, '[buildAgent] created new', { agent_id: output.agent_id, strategy_id: stratOut.strategy_id });
    return true;
  }

  optimizeAgent(input: OptimizeAgentInput, _context: OptimizeAgentContext, output: OptimizeAgentOutput): boolean {
    logger.info(MODULE, '[optimizeAgent] start', { agent_id: input.agent_id });
    const getOut = new GetAgentOutput();
    this.libraryService.getAgent(
      new GetAgentInput({ agent_id: input.agent_id }),
      new GetAgentContext(),
      getOut
    );
    if (!getOut.agents || getOut.agents.length === 0) {
      throw new NotFoundError(`Agent ${input.agent_id} not found`);
    }

    const current = getOut.agents[0];
    const changes: { component: string; from: string; to: string }[] = [];

    const sig = current.task_signature || '';
    const complexity = this.estimateComplexity(sig);
    const domain = this.estimateDomain(sig);

    const stratOut = new MatchStrategyOutput();
    this.strategyService.matchStrategy(
      new MatchStrategyInput({ task_content: sig, task_complexity: complexity, task_domain: domain }),
      new MatchStrategyContext(),
      stratOut
    );

    if (stratOut.strategy_id && stratOut.strategy_id !== current.strategy_id) {
      changes.push({ component: 'strategy', from: current.strategy_id, to: stratOut.strategy_id });
      this.libraryService.updateAgent(
        new UpdateAgentInput({ agent_id: input.agent_id, strategy_id: stratOut.strategy_id }),
        new UpdateAgentContext(),
        new UpdateAgentOutput()
      );
    }

    output.optimized = changes.length > 0;
    output.changes = changes;
    logger.info(MODULE, '[optimizeAgent] done', { optimized: output.optimized, changes: output.changes.length });
    return true;
  }

  buildPlannerAgent(input: BuildPlannerAgentInput, context: BuildPlannerAgentContext, output: BuildPlannerAgentOutput): boolean {
    logger.info(MODULE, '[buildPlannerAgent] start');
    return this.buildSystemAgent('PLANNER', 'PlannerAgent', 'plan-and-solve', 'planner', input.force_new, context, output);
  }

  buildWriterAgent(input: BuildWriterAgentInput, context: BuildWriterAgentContext, output: BuildWriterAgentOutput): boolean {
    logger.info(MODULE, '[buildWriterAgent] start');
    return this.buildSystemAgent('WRITER', 'WriterAgent', 'cot', 'writer', input.force_new, context, output);
  }

  buildEvolutorAgent(input: BuildEvolutorAgentInput, context: BuildEvolutorAgentContext, output: BuildEvolutorAgentOutput): boolean {
    logger.info(MODULE, '[buildEvolutorAgent] start');
    return this.buildSystemAgent('EVOLUTOR', 'EvolutorAgent', 'react', 'evolutor', input.force_new, context, output);
  }

  configAgentBuilder(input: ConfigAgentBuilderInput, _context: ConfigAgentBuilderContext, output: ConfigAgentBuilderOutput): boolean {
    logger.info(MODULE, '[configAgentBuilder] start');
    const now = Date.now();
    const sets: string[] = ['updated = ?'];
    const params: unknown[] = [now];
    if (input.task_analysis_prompt_template_id !== undefined) { sets.push('task_analysis_prompt_template_id = ?'); params.push(input.task_analysis_prompt_template_id); }
    if (input.default_strategy_id !== undefined) { sets.push('default_strategy_id = ?'); params.push(input.default_strategy_id); }
    if (input.auto_optimize !== undefined) { sets.push('auto_optimize = ?'); params.push(input.auto_optimize ? 1 : 0); }
    this.db.prepare(`UPDATE agent_builder_config SET ${sets.join(',')}`).run(...params);
    const config = this.db.prepare('SELECT * FROM agent_builder_config LIMIT 1').get() as Record<string, unknown>;
    output.task_analysis_prompt_template_id = config.task_analysis_prompt_template_id as string;
    output.default_strategy_id = config.default_strategy_id as string;
    output.auto_optimize = Boolean(config.auto_optimize);
    logger.info(MODULE, '[configAgentBuilder] done');
    return true;
  }

  private buildSystemAgent(
    agentType: AgentTypeEnum, name: string, strategy: string, signature: string,
    forceNew: boolean | undefined, context: Context, output: Output & { agent_id?: string }
  ): boolean {
    if (forceNew !== true) {
      const getOut = new GetAgentOutput();
      this.libraryService.getAgent(
        new GetAgentInput({ agent_type: agentType }),
        new GetAgentContext({ sessionId: context.sessionId }),
        getOut
      );
      if (getOut.agents && getOut.agents.length > 0) {
        output.agent_id = getOut.agents[0].agent_id;
        return true;
      }
    }

    const agentId = generateId();
    const addOut = new AddAgentOutput();
    this.libraryService.addAgent(
      new AddAgentInput({
        agent_id: agentId, agent_type: agentType,
        strategy_id: strategy, llm_id: '', soul_id: '',
        task_signature: signature, agent_name: name,
      }),
      new AddAgentContext({ sessionId: context.sessionId }),
      addOut
    );
    output.agent_id = addOut.agent_id || agentId;
    return true;
  }

  private estimateComplexity(content: string): number {
    const len = content.length;
    if (len < 50) return Math.min(len, 49);
    if (len < 200) return 30 + (len - 50) * 0.13;
    if (len < 1000) return 50 + (len - 200) * 0.05;
    return Math.min(100, 90 + (len - 1000) * 0.01);
  }

  private estimateDomain(content: string): string {
    const lower = content.toLowerCase();
    if (/frontend|react|vue|angular|html|css|ui\b|component/i.test(lower)) return 'frontend';
    if (/backend|api|server|database|sql|rest|graphql|microservice/i.test(lower)) return 'backend';
    if (/data|analytics|machine learning|ai|model|training/i.test(lower)) return 'data_science';
    if (/devops|infrastructure|cloud|aws|azure|docker|deploy/i.test(lower)) return 'devops';
    if (/security|auth|encrypt|vulnerability|oauth/i.test(lower)) return 'security';
    return 'general';
  }
}

export function createAgentBuilderService(
  db: AgentDatabase,
  libraryService: AgentLibraryService,
  strategyService: AgentStrategyService,
  llmService?: LLMService,
): AgentBuilderService {
  return AopProxy(new AgentBuilderService(db, libraryService, strategyService, llmService));
}
