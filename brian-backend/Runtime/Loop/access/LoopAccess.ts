import type { RelationDBAccess, Metrics, Report, Logger, LLMAccess } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import { AgentLoopService, type PermissionAudit } from '../application/AgentLoopService';
import type { SessionAccess } from '../../Session';
import type { SkillRuntimeAccess } from '../../SkillRuntime';

export interface PermissionGate {
  
  wait(input: { permission_id: string; tool_id?: string }): Promise<{ approved: boolean; autoApproved?: boolean }>;
}
import {
  ExecAgentLoopInput,
  ExecAgentLoopOutput,
  AbortLoopTurnInput,
  AbortLoopTurnOutput,
  ConfigLoopInput,
  ConfigLoopOutput,
  LoopContext,
  type LoopQueue,
} from '../domain/types';

export class LoopAccess {
  private readonly service: AgentLoopService;

  constructor(relationDb: RelationDBAccess, llm: LLMAccess, session: SessionAccess, skillRuntime: SkillRuntimeAccess, logger?: Logger, queue?: LoopQueue, permissionGate?: PermissionGate, permissionAudit?: PermissionAudit,
  ) {
    const rawService = new AgentLoopService(llm, session, skillRuntime, relationDb, logger, queue, permissionGate, permissionAudit);
    this.service = AopProxy.wrap(rawService, { logger }) as AgentLoopService;
  }

  
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  
  async execAgentLoop(input: ExecAgentLoopInput, output: ExecAgentLoopOutput, context: LoopContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.execAgentLoop(input, output, context, metrics, report);
  }

  
  async abortLoopTurn(input: AbortLoopTurnInput, output: AbortLoopTurnOutput, context: LoopContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.abortLoopTurn(input, output, context, metrics, report);
  }

  
  async configLoop(input: ConfigLoopInput, output: ConfigLoopOutput, context: LoopContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configLoop(input, output, context, metrics, report);
  }
}

export { LoopContext };
