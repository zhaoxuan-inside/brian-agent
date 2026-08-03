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

import type { RelationDBAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';

import type { LLMCoreAccess, InfoCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess } from '@brian-agent/core';
import type {
  WriterAgentAccess, EvolutorAgentAccess, AgentLibraryAccess,
  AgentBuilderAccess, AgentExecutionAccess, AgentStrategyAccess, AgentContextAccess,
} from '@brian-agent/agent';
import type {
  OrchestrationEntryAccess, OrchestrationStrategyAccess,
  OrchestrationExecutionAccess, OrchestrationVisualizationAccess, JSONNodeAccess,
} from '@brian-agent/orchestration';

import type {
  LLMAccess, SoulAccess, SkillAccess, MCPAccess, PromptsAccess,
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
  RegisterConfigInput,
  RegisterConfigOutput,
  UpdateLayerPrivilegeInput,
  UpdateLayerPrivilegeOutput,
  UpdateModulePrivilegeInput,
  UpdateModulePrivilegeOutput,
  UpdateConfigPrivilegeInput,
  UpdateConfigPrivilegeOutput,
  GetPrivilegeTreeInput,
  GetPrivilegeTreeOutput,
  GetConfigDetailInput,
  GetConfigDetailOutput,
  GetConfigItemInput,
  GetConfigItemOutput,
  UpdateConfigInput,
  UpdateConfigOutput,
  ConfigConfigInput,
  ConfigConfigOutput,
  CreateConfigItemInput,
  CreateConfigItemOutput,
  DeleteConfigItemInput,
  DeleteConfigItemOutput,
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
    llmCore: LLMCoreAccess,
    infoCore: InfoCoreAccess,
    mcpCore: MCPCoreAccess,
    skillCore: SkillCoreAccess,
    soulCore: SoulCoreAccess,
    writerAgent: WriterAgentAccess,
    evolutorAgent: EvolutorAgentAccess,
    agentLibrary: AgentLibraryAccess,
    agentBuilder: AgentBuilderAccess,
    agentExecution: AgentExecutionAccess,
    agentStrategy: AgentStrategyAccess,
    agentContext: AgentContextAccess,
    orchestrationEntry: OrchestrationEntryAccess,
    orchestrationStrategy: OrchestrationStrategyAccess,
    orchestrationExecution: OrchestrationExecutionAccess,
    orchestrationVisualization: OrchestrationVisualizationAccess,
    jsonNode: JSONNodeAccess,
    chatAccess: any,
    selfLearningAccess: any,
    userProfileAccess: any,
    visualizationAccess: any,
    logger?: Logger,
  ) {
    new ConfigSchemaInitializer(relationDb).init();
    const rawService = new ConfigService(
      relationDb,
      llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
      llmCore, infoCore, mcpCore, skillCore, soulCore,
      writerAgent, evolutorAgent, agentLibrary, agentBuilder,
      agentExecution, agentStrategy, agentContext,
      orchestrationEntry, orchestrationStrategy, orchestrationExecution,
      orchestrationVisualization, jsonNode,
      chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess,
    );
    this.service = AopProxy.wrap(rawService, { logger });
    rawService.initRegistrations().catch(() => {});
  }

  // -------------------------------------------------------------------------
  // Config management
  // -------------------------------------------------------------------------

  async registerConfig(
    input: RegisterConfigInput,
    context: ConfigContext,
    output: RegisterConfigOutput,
  ): Promise<boolean> {
    return this.service.registerConfig(input, context, output);
  }

  async updateLayerPrivilege(
    input: UpdateLayerPrivilegeInput,
    context: ConfigContext,
    output: UpdateLayerPrivilegeOutput,
  ): Promise<boolean> {
    return this.service.updateLayerPrivilege(input, context, output);
  }

  async updateModulePrivilege(
    input: UpdateModulePrivilegeInput,
    context: ConfigContext,
    output: UpdateModulePrivilegeOutput,
  ): Promise<boolean> {
    return this.service.updateModulePrivilege(input, context, output);
  }

  async updateConfigPrivilege(
    input: UpdateConfigPrivilegeInput,
    context: ConfigContext,
    output: UpdateConfigPrivilegeOutput,
  ): Promise<boolean> {
    return this.service.updateConfigPrivilege(input, context, output);
  }

  async getPrivilegeTree(
    input: GetPrivilegeTreeInput,
    context: ConfigContext,
    output: GetPrivilegeTreeOutput,
  ): Promise<boolean> {
    return this.service.getPrivilegeTree(input, context, output);
  }

  async getConfigDetail(
    input: GetConfigDetailInput,
    context: ConfigContext,
    output: GetConfigDetailOutput,
  ): Promise<boolean> {
    return this.service.getConfigDetail(input, context, output);
  }

  async getConfigItem(
    input: GetConfigItemInput,
    context: ConfigContext,
    output: GetConfigItemOutput,
  ): Promise<boolean> {
    return this.service.getConfigItem(input, context, output);
  }

  async updateConfig(
    input: UpdateConfigInput,
    context: ConfigContext,
    output: UpdateConfigOutput,
  ): Promise<boolean> {
    return this.service.updateConfig(input, context, output);
  }

  async configConfig(
    input: ConfigConfigInput,
    context: ConfigContext,
    output: ConfigConfigOutput,
  ): Promise<boolean> {
    return this.service.configConfig(input, context, output);
  }

  async createConfigItem(
    input: CreateConfigItemInput,
    context: ConfigContext,
    output: CreateConfigItemOutput,
  ): Promise<boolean> {
    return this.service.createConfigItem(input, context, output);
  }

  async deleteConfigItem(
    input: DeleteConfigItemInput,
    context: ConfigContext,
    output: DeleteConfigItemOutput,
  ): Promise<boolean> {
    return this.service.deleteConfigItem(input, context, output);
  }

  // -------------------------------------------------------------------------
  // LLM management proxy
  // -------------------------------------------------------------------------

  async addLLMProvider(input: AddLLMProviderInput, context: LLMContext, output: AddLLMProviderOutput): Promise<boolean> {
    return this.service.addLLMProviderProxy(input, context, output);
  }

  async updateLLMProvider(input: UpdateLLMProviderInput, context: LLMContext, output: UpdateLLMProviderOutput): Promise<boolean> {
    return this.service.updateLLMProviderProxy(input, context, output);
  }

  async delLLMProvider(input: DelLLMProviderInput, context: LLMContext, output: DelLLMProviderOutput): Promise<boolean> {
    return this.service.delLLMProviderProxy(input, context, output);
  }

  async soLLMProvider(input: SoLLMProviderInput, context: LLMContext, output: SoLLMProviderOutput): Promise<boolean> {
    return this.service.soLLMProviderProxy(input, context, output);
  }

  async testLLMProvider(input: TestLLMProviderInput, context: LLMContext, output: TestLLMProviderOutput): Promise<boolean> {
    return this.service.testLLMProviderProxy(input, context, output);
  }

  async listLLM(input: ListLLMInput, context: LLMContext, output: ListLLMOutput): Promise<boolean> {
    return this.service.listLLMProxy(input, context, output);
  }

  async addLLM(input: AddLLMInput, context: LLMContext, output: AddLLMOutput): Promise<boolean> {
    return this.service.addLLMProxy(input, context, output);
  }

  async updateLLM(input: UpdateLLMInput, context: LLMContext, output: UpdateLLMOutput): Promise<boolean> {
    return this.service.updateLLMProxy(input, context, output);
  }

  async delLLM(input: DelLLMInput, context: LLMContext, output: DelLLMOutput): Promise<boolean> {
    return this.service.delLLMProxy(input, context, output);
  }

  async soLLM(input: SoLLMInput, context: LLMContext, output: SoLLMOutput): Promise<boolean> {
    return this.service.soLLMProxy(input, context, output);
  }

  async getLLM(input: GetLLMInput, context: LLMContext, output: GetLLMOutput): Promise<boolean> {
    return this.service.getLLMProxy(input, context, output);
  }

  // -------------------------------------------------------------------------
  // Soul management proxy
  // -------------------------------------------------------------------------

  async addSoul(input: AddSoulInput, context: SoulContext, output: AddSoulOutput): Promise<boolean> {
    return this.service.addSoulProxy(input, context, output);
  }

  async updateSoul(input: UpdateSoulInput, context: SoulContext, output: UpdateSoulOutput): Promise<boolean> {
    return this.service.updateSoulProxy(input, context, output);
  }

  async delSoul(input: DelSoulInput, context: SoulContext, output: DelSoulOutput): Promise<boolean> {
    return this.service.delSoulProxy(input, context, output);
  }

  async soSoul(input: SoSoulInput, context: SoulContext, output: SoSoulOutput): Promise<boolean> {
    return this.service.soSoulProxy(input, context, output);
  }

  async getSoul(input: GetSoulInput, context: SoulContext, output: GetSoulOutput): Promise<boolean> {
    return this.service.getSoulProxy(input, context, output);
  }

  async getSoulRule(input: SoSoulRuleInput, context: SoulCoreContext, output: SoSoulRuleOutput): Promise<boolean> {
    return this.service.getSoulRuleProxy(input, context, output);
  }

  async updateSoulRule(input: UpdateSoulRuleInput, context: SoulCoreContext, output: UpdateSoulRuleOutput): Promise<boolean> {
    return this.service.updateSoulRuleProxy(input, context, output);
  }

  // -------------------------------------------------------------------------
  // Skill management proxy
  // -------------------------------------------------------------------------

  async addSkill(input: AddSkillInput, context: SkillContext, output: AddSkillOutput): Promise<boolean> {
    return this.service.addSkillProxy(input, context, output);
  }

  async updateSkill(input: UpdateSkillInput, context: SkillContext, output: UpdateSkillOutput): Promise<boolean> {
    return this.service.updateSkillProxy(input, context, output);
  }

  async delSkill(input: DelSkillInput, context: SkillContext, output: DelSkillOutput): Promise<boolean> {
    return this.service.delSkillProxy(input, context, output);
  }

  async soSkill(input: SoSkillInput, context: SkillContext, output: SoSkillOutput): Promise<boolean> {
    return this.service.soSkillProxy(input, context, output);
  }

  async execSkill(input: ExecSkillInput, context: SkillContext, output: ExecSkillOutput): Promise<boolean> {
    return this.service.execSkillProxy(input, context, output);
  }

  async getSkill(input: GetSkillInput, context: SkillContext, output: GetSkillOutput): Promise<boolean> {
    return this.service.getSkillProxy(input, context, output);
  }

  async getSkillRule(input: SoSkillRuleInput, context: SkillCoreContext, output: SoSkillRuleOutput): Promise<boolean> {
    return this.service.getSkillRuleProxy(input, context, output);
  }

  async updateSkillRule(input: UpdateSkillRuleInput, context: SkillCoreContext, output: UpdateSkillRuleOutput): Promise<boolean> {
    return this.service.updateSkillRuleProxy(input, context, output);
  }

  // -------------------------------------------------------------------------
  // MCP management proxy
  // -------------------------------------------------------------------------

  async addMcpProvider(input: AddMcpProviderInput, context: McpContext, output: AddMcpProviderOutput): Promise<boolean> {
    return this.service.addMcpProviderProxy(input, context, output);
  }

  async updateMcpProvider(input: UpdateMcpProviderInput, context: McpContext, output: UpdateMcpProviderOutput): Promise<boolean> {
    return this.service.updateMcpProviderProxy(input, context, output);
  }

  async delMcpProvider(input: DelMcpProviderInput, context: McpContext, output: DelMcpProviderOutput): Promise<boolean> {
    return this.service.delMcpProviderProxy(input, context, output);
  }

  async soMcpProvider(input: SoMcpProviderInput, context: McpContext, output: SoMcpProviderOutput): Promise<boolean> {
    return this.service.soMcpProviderProxy(input, context, output);
  }

  async testMcpProvider(input: TestMcpProviderInput, context: McpContext, output: TestMcpProviderOutput): Promise<boolean> {
    return this.service.testMcpProviderProxy(input, context, output);
  }

  async listMcp(input: ListMcpInput, context: McpContext, output: ListMcpOutput): Promise<boolean> {
    return this.service.listMcpProxy(input, context, output);
  }

  async installMcp(input: InstallMcpInput, context: McpContext, output: InstallMcpOutput): Promise<boolean> {
    return this.service.installMcpProxy(input, context, output);
  }

  async startMcp(input: StartMcpInput, context: McpContext, output: StartMcpOutput): Promise<boolean> {
    return this.service.startMcpProxy(input, context, output);
  }

  async stopMcp(input: StopMcpInput, context: McpContext, output: StopMcpOutput): Promise<boolean> {
    return this.service.stopMcpProxy(input, context, output);
  }

  async uninstallMcp(input: UninstallMcpInput, context: McpContext, output: UninstallMcpOutput): Promise<boolean> {
    return this.service.uninstallMcpProxy(input, context, output);
  }

  async updateMcp(input: UpdateMcpInput, context: McpContext, output: UpdateMcpOutput): Promise<boolean> {
    return this.service.updateMcpProxy(input, context, output);
  }

  async getMcp(input: GetMcpInput, context: McpContext, output: GetMcpOutput): Promise<boolean> {
    return this.service.getMcpProxy(input, context, output);
  }

  async soMcp(input: SoMcpInput, context: McpContext, output: SoMcpOutput): Promise<boolean> {
    return this.service.soMcpProxy(input, context, output);
  }

  // -------------------------------------------------------------------------
  // Prompt management proxy
  // -------------------------------------------------------------------------

  async addPrompt(input: AddPromptInput, context: PromptContext, output: AddPromptOutput): Promise<boolean> {
    return this.service.addPromptProxy(input, context, output);
  }

  async updatePrompt(input: UpdatePromptInput, context: PromptContext, output: UpdatePromptOutput): Promise<boolean> {
    return this.service.updatePromptProxy(input, context, output);
  }

  async delPrompt(input: DelPromptInput, context: PromptContext, output: DelPromptOutput): Promise<boolean> {
    return this.service.delPromptProxy(input, context, output);
  }

  async soPrompt(input: SoPromptInput, context: PromptContext, output: SoPromptOutput): Promise<boolean> {
    return this.service.soPromptProxy(input, context, output);
  }

  async getPrompt(input: GetPromptInput, context: PromptContext, output: GetPromptOutput): Promise<boolean> {
    return this.service.getPromptProxy(input, context, output);
  }
}
