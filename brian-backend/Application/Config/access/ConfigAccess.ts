/**
 * @fileoverview Config 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 ConfigSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 代理 Base 层资源管理（LLM/Soul/Skill/MCP/Prompt）到下层模块。
 */

import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { CronAccess } from '@brian-agent/base';

import type { LLMCoreAccess, InfoCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess } from '@brian-agent/core';
import type {
  WriterAgentAccess, EvolutorAgentAccess, AgentLibraryAccess,
  AgentBuilderAccess, AgentExecutionAccess, AgentStrategyAccess, AgentContextAccess,
  PlannerAgentAccess,
} from '@brian-agent/agent';

import type {
  LLMAccess, SoulAccess, SkillAccess, MCPAccess, PromptsAccess, LogAccess,
  MQAccess, GraphDBAccess, VectorDBAccess,
} from '@brian-agent/base';
import type {
  AddLLMProviderInput, AddLLMProviderOutput, UpdateLLMProviderInput, UpdateLLMProviderOutput,
  DelLLMProviderInput, DelLLMProviderOutput, SoLLMProviderInput, SoLLMProviderOutput,
  TestLLMProviderInput, TestLLMProviderOutput, ListLLMInput, ListLLMOutput,
  AddLLMInput, AddLLMOutput, UpdateLLMInput, UpdateLLMOutput,
  DelLLMInput, DelLLMOutput, SoLLMInput, SoLLMOutput, GetLLMInput, GetLLMOutput,
  LLMContext,
} from '@brian-agent/base';
import type {
  AddSoulInput, AddSoulOutput, UpdateSoulInput, UpdateSoulOutput,
  DelSoulInput, DelSoulOutput, SoSoulInput, SoSoulOutput, GetSoulInput, GetSoulOutput,
  SoulContext,
} from '@brian-agent/base';
import type {
  AddSkillInput, AddSkillOutput, UpdateSkillInput, UpdateSkillOutput,
  DelSkillInput, DelSkillOutput, SoSkillInput, SoSkillOutput, GetSkillInput, GetSkillOutput,
  ExecSkillInput, ExecSkillOutput,
  SkillContext,
} from '@brian-agent/base';
import type {
  AddMcpProviderInput, AddMcpProviderOutput, UpdateMcpProviderInput, UpdateMcpProviderOutput,
  DelMcpProviderInput, DelMcpProviderOutput, SoMcpProviderInput, SoMcpProviderOutput,
  TestMcpProviderInput, TestMcpProviderOutput, ListMcpInput, ListMcpOutput,
  InstallMcpInput, InstallMcpOutput, StartMcpInput, StartMcpOutput,
  StopMcpInput, StopMcpOutput, UninstallMcpInput, UninstallMcpOutput,
  UpdateMcpInput, UpdateMcpOutput, GetMcpInput, GetMcpOutput, SoMcpInput, SoMcpOutput,
  McpContext,
} from '@brian-agent/base';
import type {
  AddPromptInput, AddPromptOutput, UpdatePromptInput, UpdatePromptOutput,
  DelPromptInput, DelPromptOutput, SoPromptInput, SoPromptOutput, GetPromptInput, GetPromptOutput,
  PromptContext,
} from '@brian-agent/base';
import type {
  SoSoulRuleInput, SoSoulRuleOutput, UpdateSoulRuleInput, UpdateSoulRuleOutput,
  SoSkillRuleInput, SoSkillRuleOutput, UpdateSkillRuleInput, UpdateSkillRuleOutput,
  SoulCoreContext, SkillCoreContext,
} from '@brian-agent/core';

import { ConfigSchemaInitializer } from '../infrastructure/ConfigSchemaInitializer';
import { ConfigService } from '../application/ConfigService';
import {
  ConfigContext,
  UpdateLayerPrivilegeInput,
  UpdateLayerPrivilegeOutput,
  UpdateModulePrivilegeInput,
  UpdateModulePrivilegeOutput,
  GetConfigDetailInput,
  GetConfigDetailOutput,
  GetConfigItemInput,
  GetConfigItemOutput,
  UpdateConfigInput,
  UpdateConfigOutput,
  ConfigConfigInput,
  ConfigConfigOutput,
} from '../domain/types';

export class ConfigAccess {
  private readonly service: ConfigService;

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    soulAccess: SoulAccess,
    skillAccess: SkillAccess,
    mcpAccess: MCPAccess,
    promptsAccess: PromptsAccess,
    logAccess: LogAccess,
    mqAccess: MQAccess,
    graphDBAccess: GraphDBAccess,
    vectorDBAccess: VectorDBAccess,
    llmCore: LLMCoreAccess,
    infoCore: InfoCoreAccess,
    mcpCore: MCPCoreAccess,
    skillCore: SkillCoreAccess,
    soulCore: SoulCoreAccess,
    writerAgent: WriterAgentAccess,
    evolutorAgent: EvolutorAgentAccess,
    plannerAgent: PlannerAgentAccess,
    agentLibrary: AgentLibraryAccess,
    agentBuilder: AgentBuilderAccess,
    agentExecution: AgentExecutionAccess,
    agentStrategy: AgentStrategyAccess,
    agentContext: AgentContextAccess,
    chatAccess: any,
    selfLearningAccess: any,
    userProfileAccess: any,
    visualizationAccess: any,
    cronAccess: CronAccess,
    logger?: Logger,
  ) {
    new ConfigSchemaInitializer(relationDb).init();
    const rawService = new ConfigService(
      relationDb,
      llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
      logAccess,
      mqAccess, graphDBAccess, vectorDBAccess,
      llmCore, infoCore, mcpCore, skillCore, soulCore,
      writerAgent, evolutorAgent, plannerAgent, agentLibrary, agentBuilder,
      agentExecution, agentStrategy, agentContext,
      chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess,
      cronAccess,
    );
    this.service = AopProxy.wrap(rawService, { logger });
  }

  // -------------------------------------------------------------------------
  // Config management
  // -------------------------------------------------------------------------

  async updateLayerPrivilege(input: UpdateLayerPrivilegeInput, output: UpdateLayerPrivilegeOutput, context: ConfigContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateLayerPrivilege(input, output, context, metrics, report);
  }

  async updateModulePrivilege(input: UpdateModulePrivilegeInput, output: UpdateModulePrivilegeOutput, context: ConfigContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateModulePrivilege(input, output, context, metrics, report);
  }

  async soConfigDetail(input: GetConfigDetailInput, output: GetConfigDetailOutput, context: ConfigContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soConfigDetail(input, output, context, metrics, report);
  }

  async soConfigItem(input: GetConfigItemInput, output: GetConfigItemOutput, context: ConfigContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soConfigItem(input, output, context, metrics, report);
  }

  async updateConfig(input: UpdateConfigInput, output: UpdateConfigOutput, context: ConfigContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateConfig(input, output, context, metrics, report);
  }

  async configConfig(input: ConfigConfigInput, output: ConfigConfigOutput, context: ConfigContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configConfig(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // LLM management proxy
  // -------------------------------------------------------------------------

  async addLLMProvider(input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.addLLMProviderProxy(input, output, context, metrics, report);
  }

  async updateLLMProvider(input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateLLMProviderProxy(input, output, context, metrics, report);
  }

  async delLLMProvider(input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.delLLMProviderProxy(input, output, context, metrics, report);
  }

  async soLLMProvider(input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.soLLMProviderProxy(input, output, context, metrics, report);
  }

  async testLLMProvider(input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.testLLMProviderProxy(input, output, context, metrics, report);
  }

  async listLLM(input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.listLLMProxy(input, output, context, metrics, report);
  }

  async addLLM(input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.addLLMProxy(input, output, context, metrics, report);
  }

  async updateLLM(input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateLLMProxy(input, output, context, metrics, report);
  }

  async delLLM(input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.delLLMProxy(input, output, context, metrics, report);
  }

  async soLLM(input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.soLLMProxy(input, output, context, metrics, report);
  }

  async soLLMById(input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.getLLMProxy(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // Soul management proxy
  // -------------------------------------------------------------------------

  async addSoul(input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.addSoulProxy(input, output, context, metrics, report);
  }

  async updateSoul(input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateSoulProxy(input, output, context, metrics, report);
  }

  async delSoul(input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.delSoulProxy(input, output, context, metrics, report);
  }

  async soSoul(input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.soSoulProxy(input, output, context, metrics, report);
  }

  async soSoulById(input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.getSoulProxy(input, output, context, metrics, report);
  }

  async getSoulRule(input: SoSoulRuleInput, output: SoSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.getSoulRuleProxy(input, output, context, metrics, report);
  }

  async updateSoulRule(input: UpdateSoulRuleInput, output: UpdateSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateSoulRuleProxy(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // Skill management proxy
  // -------------------------------------------------------------------------

  async addSkill(input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.addSkillProxy(input, output, context, metrics, report);
  }

  async updateSkill(input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateSkillProxy(input, output, context, metrics, report);
  }

  async delSkill(input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.delSkillProxy(input, output, context, metrics, report);
  }

  async soSkill(input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.soSkillProxy(input, output, context, metrics, report);
  }

  async execSkill(input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.execSkillProxy(input, output, context, metrics, report);
  }

  async soSkillById(input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.getSkillProxy(input, output, context, metrics, report);
  }

  async getSkillRule(input: SoSkillRuleInput, output: SoSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.getSkillRuleProxy(input, output, context, metrics, report);
  }

  async updateSkillRule(input: UpdateSkillRuleInput, output: UpdateSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateSkillRuleProxy(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // MCP management proxy
  // -------------------------------------------------------------------------

  async addMcpProvider(input: AddMcpProviderInput, output: AddMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.addMcpProviderProxy(input, output, context, metrics, report);
  }

  async updateMcpProvider(input: UpdateMcpProviderInput, output: UpdateMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateMcpProviderProxy(input, output, context, metrics, report);
  }

  async delMcpProvider(input: DelMcpProviderInput, output: DelMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.delMcpProviderProxy(input, output, context, metrics, report);
  }

  async soMcpProvider(input: SoMcpProviderInput, output: SoMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.soMcpProviderProxy(input, output, context, metrics, report);
  }

  async testMcpProvider(input: TestMcpProviderInput, output: TestMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.testMcpProviderProxy(input, output, context, metrics, report);
  }

  async listMcp(input: ListMcpInput, output: ListMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.listMcpProxy(input, output, context, metrics, report);
  }

  async installMcp(input: InstallMcpInput, output: InstallMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.installMcpProxy(input, output, context, metrics, report);
  }

  async startMcp(input: StartMcpInput, output: StartMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.startMcpProxy(input, output, context, metrics, report);
  }

  async stopMcp(input: StopMcpInput, output: StopMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.stopMcpProxy(input, output, context, metrics, report);
  }

  async uninstallMcp(input: UninstallMcpInput, output: UninstallMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.uninstallMcpProxy(input, output, context, metrics, report);
  }

  async updateMcp(input: UpdateMcpInput, output: UpdateMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updateMcpProxy(input, output, context, metrics, report);
  }

  async soMcpById(input: GetMcpInput, output: GetMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.getMcpProxy(input, output, context, metrics, report);
  }

  async soMcp(input: SoMcpInput, output: SoMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.soMcpProxy(input, output, context, metrics, report);
  }

  // -------------------------------------------------------------------------
  // Prompt management proxy
  // -------------------------------------------------------------------------

  async addPrompt(input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.addPromptProxy(input, output, context, metrics, report);
  }

  async updatePrompt(input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.updatePromptProxy(input, output, context, metrics, report);
  }

  async delPrompt(input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.delPromptProxy(input, output, context, metrics, report);
  }

  async soPrompt(input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.soPromptProxy(input, output, context, metrics, report);
  }

  async soPromptById(input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.service.getPromptProxy(input, output, context, metrics, report);
  }
}
