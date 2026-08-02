/**
 * @fileoverview Config 应用服务层。
 *
 * ConfigService 是系统级配置的统一入口，提供：
 * 1. 配置元数据注册管理
 * 2. 三层权限模型（Layer → Module → Category）
 * 3. 向下层模块代理所有配置操作
 * 4. Base 资源管理代理（LLM/Soul/Skill/MCP/Prompt）
 */

import type { RelationDBAccess, Logger, IdGenerator } from '@brian-agent/base';
import { Operator, ValidationError, NotFoundError } from '@brian-agent/base';
import type { DataObject, Condition } from '@brian-agent/base';

import type { LLMCoreAccess, InfoCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess } from '@brian-agent/core';
import {
  ConfigLLMCoreOutput,
  ConfigMcpCoreOutput,
  ConfigSkillCoreOutput, SoSkillRuleOutput,
  ConfigSoulCoreOutput, SoSoulRuleOutput,
  SoInfoTagConfigOutput, SoInfoSummaryConfigOutput, SoInfoConfigOutput,
  SoInfoVectorConfigOutput, SoInfoContextConfigOutput,
} from '@brian-agent/core';
import type {
  ConfigLLMCoreInput, LLMCoreContext,
  LimitLLMInput, LimitLLMOutput, CheckLLMQuotaInput, CheckLLMQuotaOutput,
} from '@brian-agent/core';
import type {
  UpdateInfoTagConfigInput, UpdateInfoTagConfigOutput,
  UpdateInfoSummaryConfigInput, UpdateInfoSummaryConfigOutput,
  UpdateInfoConfigInput, UpdateInfoConfigOutput,
  UpdateInfoVectorConfigInput, UpdateInfoVectorConfigOutput,
  UpdateInfoContextConfigInput, UpdateInfoContextConfigOutput,
  SoInfoTagConfigInput, SoInfoSummaryConfigInput,
  SoInfoConfigInput, SoInfoVectorConfigInput, SoInfoContextConfigInput,
  InfoCoreContext,
} from '@brian-agent/core';
import type {
  ConfigMcpCoreInput, McpCoreContext,
} from '@brian-agent/core';
import type {
  ConfigSkillCoreInput, SkillCoreContext,
  UpdateSkillRuleInput, UpdateSkillRuleOutput,
  SoSkillRuleInput,
} from '@brian-agent/core';
import type {
  ConfigSoulCoreInput, SoulCoreContext,
  UpdateSoulRuleInput, UpdateSoulRuleOutput,
  SoSoulRuleInput,
} from '@brian-agent/core';

import type {
  WriterAgentAccess, EvolutorAgentAccess, AgentLibraryAccess,
  AgentBuilderAccess, AgentExecutionAccess, AgentStrategyAccess, AgentContextAccess,
} from '@brian-agent/agent';
import type {
  ConfigWriterAgentInput, ConfigWriterAgentOutput, WriterAgentContext,
} from '@brian-agent/agent';
import type {
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput, EvolutorAgentContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentLibraryInput, ConfigAgentLibraryOutput, AgentLibraryContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentBuilderInput, ConfigAgentBuilderOutput, AgentBuilderContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentExecutionInput, ConfigAgentExecutionOutput, AgentExecutionContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentStrategyInput, ConfigAgentStrategyOutput, AgentStrategyContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentContextInput, ConfigAgentContextOutput, AgentContextContext,
} from '@brian-agent/agent';

import type {
  OrchestrationEntryAccess, OrchestrationStrategyAccess,
  OrchestrationExecutionAccess, OrchestrationVisualizationAccess, JSONNodeAccess,
} from '@brian-agent/orchestration';
import type {
  ConfigOrchestrationEntryInput, ConfigOrchestrationEntryOutput, OrchestrationEntryContext,
} from '@brian-agent/orchestration';
import type {
  ConfigOrchestrationStrategyInput, ConfigOrchestrationStrategyOutput, OrchestrationStrategyContext,
} from '@brian-agent/orchestration';
import type {
  ConfigOrchestrationExecutionInput, ConfigOrchestrationExecutionOutput, OrchestrationExecutionContext,
} from '@brian-agent/orchestration';
import type {
  ConfigOrchestrationVisualizationInput, ConfigOrchestrationVisualizationOutput, OrchestrationVisualizationContext,
} from '@brian-agent/orchestration';
import type {
  ConfigJSONNodeInput, ConfigJSONNodeOutput, JSONNodeContext,
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

import type { Input, Context, Output } from '@brian-agent/base';

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
  CONFIG_REGISTRY_TABLE,
  CONFIG_LAYER_PRIVILEGE_TABLE,
  CONFIG_MODULE_PRIVILEGE_TABLE,
  CONFIG_CONFIG_TABLE,
  VALID_LAYERS,
  type ConfigRegistration,
} from '../domain/types';
import { ALL_CONFIG_REGISTRATIONS, LAYER_LABELS, MODULE_LABELS, CATEGORY_LABELS, MODULE_ENTITY_TYPES } from '../domain/configRegistrations';

export class ConfigService {
  private readonly relationDb: RelationDBAccess;
  private readonly llmAccess: LLMAccess;
  private readonly soulAccess: SoulAccess;
  private readonly skillAccess: SkillAccess;
  private readonly mcpAccess: MCPAccess;
  private readonly promptsAccess: PromptsAccess;
  private readonly llmCore: LLMCoreAccess;
  private readonly infoCore: InfoCoreAccess;
  private readonly mcpCore: MCPCoreAccess;
  private readonly skillCore: SkillCoreAccess;
  private readonly soulCore: SoulCoreAccess;
  private readonly writerAgent: WriterAgentAccess;
  private readonly evolutorAgent: EvolutorAgentAccess;
  private readonly agentLibrary: AgentLibraryAccess;
  private readonly agentBuilder: AgentBuilderAccess;
  private readonly agentExecution: AgentExecutionAccess;
  private readonly agentStrategy: AgentStrategyAccess;
  private readonly agentContext: AgentContextAccess;
  private readonly orchestrationEntry: OrchestrationEntryAccess;
  private readonly orchestrationStrategy: OrchestrationStrategyAccess;
  private readonly orchestrationExecution: OrchestrationExecutionAccess;
  private readonly orchestrationVisualization: OrchestrationVisualizationAccess;
  private readonly jsonNode: JSONNodeAccess;
  private readonly chatAccess: any;
  private readonly selfLearningAccess: any;
  private readonly userProfileAccess: any;
  private readonly visualizationAccess: any;

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
  ) {
    this.relationDb = relationDb;
    this.llmAccess = llmAccess;
    this.soulAccess = soulAccess;
    this.skillAccess = skillAccess;
    this.mcpAccess = mcpAccess;
    this.promptsAccess = promptsAccess;
    this.llmCore = llmCore;
    this.infoCore = infoCore;
    this.mcpCore = mcpCore;
    this.skillCore = skillCore;
    this.soulCore = soulCore;
    this.writerAgent = writerAgent;
    this.evolutorAgent = evolutorAgent;
    this.agentLibrary = agentLibrary;
    this.agentBuilder = agentBuilder;
    this.agentExecution = agentExecution;
    this.agentStrategy = agentStrategy;
    this.agentContext = agentContext;
    this.orchestrationEntry = orchestrationEntry;
    this.orchestrationStrategy = orchestrationStrategy;
    this.orchestrationExecution = orchestrationExecution;
    this.orchestrationVisualization = orchestrationVisualization;
    this.jsonNode = jsonNode;
    this.chatAccess = chatAccess;
    this.selfLearningAccess = selfLearningAccess;
    this.userProfileAccess = userProfileAccess;
    this.visualizationAccess = visualizationAccess;
  }

  // =========================================================================
  // initRegistrations - auto-register all known module configs
  // =========================================================================

  async initRegistrations(): Promise<number> {
    const existing = await this.relationDb.count(CONFIG_REGISTRY_TABLE, []);
    if (existing > 0) {
      return existing;
    }
    const input = new RegisterConfigInput();
    input.registrations = ALL_CONFIG_REGISTRATIONS;
    const output = new RegisterConfigOutput();
    await this.registerConfig(input, new ConfigContext(), output);
    return output.registered_count;
  }

  // =========================================================================
  // registerConfig
  // =========================================================================

  async registerConfig(
    input: RegisterConfigInput,
    _context: ConfigContext,
    output: RegisterConfigOutput,
  ): Promise<boolean> {
    if (!input.registrations || input.registrations.length === 0) {
      throw new ValidationError('registrations 不能为空');
    }

    let count = 0;
    for (const reg of input.registrations) {
      if (!reg.config_key || !reg.layer || !reg.module || !reg.category || !reg.config_type) {
        throw new ValidationError(`注册项缺少必填字段: ${JSON.stringify(reg)}`);
      }

      const existing = await this.relationDb.selectOne(CONFIG_REGISTRY_TABLE, [
        { field: 'config_key', operator: Operator.EQ, value: reg.config_key },
      ]);

      const now = Date.now();
      if (existing) {
        await this.relationDb.update(CONFIG_REGISTRY_TABLE, [
          { field: 'updated', value: now },
          { field: 'layer', value: reg.layer },
          { field: 'module', value: reg.module },
          { field: 'category', value: reg.category },
          { field: 'config_name', value: reg.config_name },
          { field: 'config_description', value: reg.config_description ?? null },
          { field: 'config_type', value: reg.config_type },
          { field: 'config_default', value: reg.config_default !== undefined ? JSON.stringify(reg.config_default) : null },
          { field: 'config_enum_values', value: reg.config_enum_values ? JSON.stringify(reg.config_enum_values) : null },
          { field: 'readable', value: reg.readable !== false ? 1 : 0 },
          { field: 'writable', value: reg.writable !== false ? 1 : 0 },
        ], [{ field: 'config_key', operator: Operator.EQ, value: reg.config_key }]);
      } else {
        const id = this.generateId();
        await this.relationDb.insert(CONFIG_REGISTRY_TABLE, [
          { field: 'id', value: id },
          { field: 'created', value: now },
          { field: 'updated', value: now },
          { field: 'config_key', value: reg.config_key },
          { field: 'layer', value: reg.layer },
          { field: 'module', value: reg.module },
          { field: 'category', value: reg.category },
          { field: 'config_name', value: reg.config_name },
          { field: 'config_description', value: reg.config_description ?? null },
          { field: 'config_type', value: reg.config_type },
          { field: 'config_default', value: reg.config_default !== undefined ? JSON.stringify(reg.config_default) : null },
          { field: 'config_enum_values', value: reg.config_enum_values ? JSON.stringify(reg.config_enum_values) : null },
          { field: 'readable', value: reg.readable !== false ? 1 : 0 },
          { field: 'writable', value: reg.writable !== false ? 1 : 0 },
        ]);
      }

      await this.ensureLayerPrivilege(reg.layer);
      await this.ensureModulePrivilege(reg.module, reg.layer);
      count++;
    }

    output.registered_count = count;
    return true;
  }

  // =========================================================================
  // updateLayerPrivilege
  // =========================================================================

  async updateLayerPrivilege(
    input: UpdateLayerPrivilegeInput,
    _context: ConfigContext,
    output: UpdateLayerPrivilegeOutput,
  ): Promise<boolean> {
    if (!input.layer || !VALID_LAYERS.includes(input.layer as any)) {
      throw new ValidationError(`layer 必须是 ${VALID_LAYERS.join('/')} 之一`);
    }

    const now = Date.now();
    const existing = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: input.layer },
    ]);

    const data: DataObject[] = [{ field: 'updated', value: now }];
    if (input.readable !== undefined) data.push({ field: 'readable', value: input.readable ? 1 : 0 });
    if (input.writable !== undefined) data.push({ field: 'writable', value: input.writable ? 1 : 0 });

    if (existing) {
      await this.relationDb.update(CONFIG_LAYER_PRIVILEGE_TABLE, data, [
        { field: 'layer', operator: Operator.EQ, value: input.layer },
      ]);
    } else {
      const id = this.generateId();
      await this.relationDb.insert(CONFIG_LAYER_PRIVILEGE_TABLE, [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'layer', value: input.layer },
        { field: 'readable', value: input.readable !== false ? 1 : 0 },
        { field: 'writable', value: input.writable !== false ? 1 : 0 },
      ]);
    }

    const record = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: input.layer },
    ]);
    output.privilege = record ? this.rowToRecord(record) : {};
    return true;
  }

  // =========================================================================
  // updateModulePrivilege
  // =========================================================================

  async updateModulePrivilege(
    input: UpdateModulePrivilegeInput,
    _context: ConfigContext,
    output: UpdateModulePrivilegeOutput,
  ): Promise<boolean> {
    if (!input.module) {
      throw new ValidationError('module 不能为空');
    }

    const existing = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: input.module },
    ]);

    const layer = existing ? (existing.layer as string) : 'APPLICATION';

    const layerPriv = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);

    const now = Date.now();
    const data: DataObject[] = [{ field: 'updated', value: now }];

    if (input.readable !== undefined) {
      if (input.readable && layerPriv) {
        const layerReadable = (layerPriv.readable as number) === 1;
        if (!layerReadable) {
          throw new ValidationError(`无法启用模块 ${input.module} 的可读性：其所属层 ${layer} 的可读性为 false`);
        }
      }
      data.push({ field: 'readable', value: input.readable ? 1 : 0 });
    }

    if (input.writable !== undefined) {
      if (input.writable && layerPriv) {
        const layerWritable = (layerPriv.writable as number) === 1;
        if (!layerWritable) {
          throw new ValidationError(`无法启用模块 ${input.module} 的可写性：其所属层 ${layer} 的可写性为 false`);
        }
      }
      data.push({ field: 'writable', value: input.writable ? 1 : 0 });
    }

    if (existing) {
      await this.relationDb.update(CONFIG_MODULE_PRIVILEGE_TABLE, data, [
        { field: 'module', operator: Operator.EQ, value: input.module },
      ]);
    } else {
      const id = this.generateId();
      await this.relationDb.insert(CONFIG_MODULE_PRIVILEGE_TABLE, [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'module', value: input.module },
        { field: 'layer', value: layer },
        { field: 'readable', value: input.readable !== false ? 1 : 0 },
        { field: 'writable', value: input.writable !== false ? 1 : 0 },
      ]);
    }

    const record = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: input.module },
    ]);
    output.privilege = record ? this.buildModulePrivilegeWithEffective(record, layerPriv) : {};
    return true;
  }

  // =========================================================================
  // updateConfigPrivilege
  // =========================================================================

  async updateConfigPrivilege(
    input: UpdateConfigPrivilegeInput,
    _context: ConfigContext,
    output: UpdateConfigPrivilegeOutput,
  ): Promise<boolean> {
    if (!input.config_key) {
      throw new ValidationError('config_key 不能为空');
    }

    const registry = await this.relationDb.selectOne(CONFIG_REGISTRY_TABLE, [
      { field: 'config_key', operator: Operator.EQ, value: input.config_key },
    ]);
    if (!registry) {
      throw new NotFoundError('config_key', input.config_key);
    }

    const layer = registry.layer as string;
    const module = registry.module as string;

    const layerPriv = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);
    const modulePriv = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: module },
    ]);

    const now = Date.now();
    const data: DataObject[] = [{ field: 'updated', value: now }];

    if (input.readable !== undefined) {
      if (input.readable) {
        const layerEffective = layerPriv ? (layerPriv.readable as number) === 1 : true;
        const moduleEffective = modulePriv ? (modulePriv.readable as number) === 1 : true;
        if (!layerEffective || !moduleEffective) {
          throw new ValidationError(`无法启用配置 ${input.config_key} 的可读性：父级权限不足`);
        }
      }
      data.push({ field: 'readable', value: input.readable ? 1 : 0 });
    }

    if (input.writable !== undefined) {
      if (input.writable) {
        const layerEffective = layerPriv ? (layerPriv.writable as number) === 1 : true;
        const moduleEffective = modulePriv ? (modulePriv.writable as number) === 1 : true;
        if (!layerEffective || !moduleEffective) {
          throw new ValidationError(`无法启用配置 ${input.config_key} 的可写性：父级权限不足`);
        }
      }
      data.push({ field: 'writable', value: input.writable ? 1 : 0 });
    }

    await this.relationDb.update(CONFIG_REGISTRY_TABLE, data, [
      { field: 'config_key', operator: Operator.EQ, value: input.config_key },
    ]);

    const updated = await this.relationDb.selectOne(CONFIG_REGISTRY_TABLE, [
      { field: 'config_key', operator: Operator.EQ, value: input.config_key },
    ]);
    const effectiveReadable = this.computeEffectiveReadable(updated, layerPriv, modulePriv);
    const effectiveWritable = this.computeEffectiveWritable(updated, layerPriv, modulePriv);
    output.privilege = {
      ...this.rowToRecord(updated || {}),
      effective_readable: effectiveReadable,
      effective_writable: effectiveWritable,
    };
    return true;
  }

  // =========================================================================
  // getPrivilegeTree
  // =========================================================================

  async getPrivilegeTree(
    _input: GetPrivilegeTreeInput,
    _context: ConfigContext,
    output: GetPrivilegeTreeOutput,
  ): Promise<boolean> {
    const layerRows = await this.relationDb.select(CONFIG_LAYER_PRIVILEGE_TABLE);
    const moduleRows = await this.relationDb.select(CONFIG_MODULE_PRIVILEGE_TABLE);
    const registryRows = await this.relationDb.select(CONFIG_REGISTRY_TABLE);

    const layerMap = new Map<string, Record<string, unknown>>();
    for (const lr of layerRows) {
      const layerName = lr.layer as string;
      layerMap.set(layerName, {
        layer: layerName,
        readable: (lr.readable as number) === 1,
        writable: (lr.writable as number) === 1,
        modules: [] as Array<Record<string, unknown>>,
      });
    }

    const moduleMap = new Map<string, { module: Record<string, unknown>; layerName: string }>();
    for (const mr of moduleRows) {
      const moduleName = mr.module as string;
      const layerName = mr.layer as string;
      const layerNode = layerMap.get(layerName);
      const layerReadable = layerNode ? (layerNode.readable as boolean) : true;
      const layerWritable = layerNode ? (layerNode.writable as boolean) : true;
      const modNode = {
        module: moduleName,
        readable: (mr.readable as number) === 1,
        writable: (mr.writable as number) === 1,
        effective_readable: layerReadable && ((mr.readable as number) === 1),
        effective_writable: layerWritable && ((mr.writable as number) === 1),
        categories: [] as Array<Record<string, unknown>>,
      };
      moduleMap.set(moduleName, { module: modNode, layerName });
      if (layerNode) {
        (layerNode.modules as Array<Record<string, unknown>>).push(modNode);
      }
    }

    for (const rr of registryRows) {
      const moduleName = rr.module as string;
      const layerName = rr.layer as string;
      const category = rr.category as string;

      const layerNode = layerMap.get(layerName);
      const layerReadable = layerNode ? (layerNode.readable as boolean) : true;
      const layerWritable = layerNode ? (layerNode.writable as boolean) : true;

      const modEntry = moduleMap.get(moduleName);
      if (!modEntry) continue;
      const modNode = modEntry.module;
      const modReadable = modNode.readable as boolean;
      const modWritable = modNode.writable as boolean;

      const catList = modNode.categories as Array<Record<string, unknown>>;
      let catNode = catList.find((c) => c.category === category);
      if (!catNode) {
        catNode = { category, items: [] as Array<Record<string, unknown>> };
        catList.push(catNode);
      }

      const configReadable = (rr.readable as number) === 1;
      const configWritable = (rr.writable as number) === 1;

      (catNode.items as Array<Record<string, unknown>>).push({
        config_key: rr.config_key,
        config_name: rr.config_name,
        config_type: rr.config_type,
        readable: configReadable,
        writable: configWritable,
        effective_readable: layerReadable && modReadable && configReadable,
        effective_writable: layerWritable && modWritable && configWritable,
      });
    }

    output.layers = Array.from(layerMap.values());
    return true;
  }

  // =========================================================================
  // getConfigDetail
  // =========================================================================

  async getConfigDetail(
    input: GetConfigDetailInput,
    _context: ConfigContext,
    output: GetConfigDetailOutput,
  ): Promise<boolean> {
    const layerRows = await this.relationDb.select(CONFIG_LAYER_PRIVILEGE_TABLE);
    const moduleRows = await this.relationDb.select(CONFIG_MODULE_PRIVILEGE_TABLE);
    const registryRows = await this.relationDb.select(CONFIG_REGISTRY_TABLE);

    const layerMap = new Map<string, Record<string, unknown>>();
    for (const lr of layerRows) {
      const layerName = lr.layer as string;
      if (input.layer && input.layer !== layerName) continue;
      const layerInfo = LAYER_LABELS[layerName];
      layerMap.set(layerName, {
        layer: layerName,
        label: layerInfo?.label ?? layerName,
        desc: layerInfo?.desc ?? '',
        readable: (lr.readable as number) === 1,
        writable: (lr.writable as number) === 1,
        modules: [] as Array<Record<string, unknown>>,
      });
    }

    const moduleMap = new Map<string, { module: Record<string, unknown>; layerName: string }>();
    for (const mr of moduleRows) {
      const moduleName = mr.module as string;
      const layerName = mr.layer as string;
      if (input.layer && input.layer !== layerName) continue;
      if (input.module && input.module !== moduleName) continue;
      const layerNode = layerMap.get(layerName);
      const layerReadable = layerNode ? (layerNode.readable as boolean) : true;
      const layerWritable = layerNode ? (layerNode.writable as boolean) : true;
      const modNode = {
        module: moduleName,
        label: (MODULE_LABELS[moduleName]?.label) ?? moduleName,
        desc: (MODULE_LABELS[moduleName]?.desc) ?? '',
        readable: (mr.readable as number) === 1,
        writable: (mr.writable as number) === 1,
        effective_readable: layerReadable && ((mr.readable as number) === 1),
        effective_writable: layerWritable && ((mr.writable as number) === 1),
        entity_types: (MODULE_ENTITY_TYPES[moduleName]) ?? [],
        categories: [] as Array<Record<string, unknown>>,
      };
      moduleMap.set(moduleName, { module: modNode, layerName });
      if (layerNode) {
        (layerNode.modules as Array<Record<string, unknown>>).push(modNode);
      }
    }

    for (const rr of registryRows) {
      const moduleName = rr.module as string;
      const layerName = rr.layer as string;
      const category = rr.category as string;
      if (input.layer && input.layer !== layerName) continue;
      if (input.module && input.module !== moduleName) continue;
      if (input.category && input.category !== category) continue;

      const modEntry = moduleMap.get(moduleName);
      if (!modEntry) continue;
      const modNode = modEntry.module;
      const modReadable = modNode.readable as boolean;
      const modWritable = modNode.writable as boolean;
      const layerNode = layerMap.get(layerName);
      const layerReadable = layerNode ? (layerNode.readable as boolean) : true;
      const layerWritable = layerNode ? (layerNode.writable as boolean) : true;

      const configReadable = (rr.readable as number) === 1;
      const configWritable = (rr.writable as number) === 1;

      const effectiveReadable = layerReadable && modReadable && configReadable;
      const effectiveWritable = layerWritable && modWritable && configWritable;

      if (input.readable_only && !effectiveReadable) continue;

      const catList = modNode.categories as Array<Record<string, unknown>>;
      let catNode = catList.find((c) => c.category === category);
      if (!catNode) {
        const catInfo = CATEGORY_LABELS[category];
        catNode = {
          category,
          label: catInfo?.label ?? category,
          desc: catInfo?.desc ?? '',
          items: [] as Array<Record<string, unknown>>,
        };
        catList.push(catNode);
      }

      let currentValue: unknown = null;
      try {
        currentValue = await this.getCurrentValue(rr.config_key as string);
      } catch {
        currentValue = null;
      }

      (catNode.items as Array<Record<string, unknown>>).push({
        config_key: rr.config_key,
        config_name: rr.config_name,
        config_description: rr.config_description,
        config_type: rr.config_type,
        config_default: rr.config_default ? this.tryParse(rr.config_default as string) : null,
        config_enum_values: rr.config_enum_values ? this.tryParse(rr.config_enum_values as string) : null,
        readable: configReadable,
        writable: configWritable,
        effective_readable: effectiveReadable,
        effective_writable: effectiveWritable,
        current_value: currentValue,
      });
    }

    output.layers = Array.from(layerMap.values());
    return true;
  }

  // =========================================================================
  // getConfigItem
  // =========================================================================

  async getConfigItem(
    input: GetConfigItemInput,
    _context: ConfigContext,
    output: GetConfigItemOutput,
  ): Promise<boolean> {
    if (!input.config_key) {
      throw new ValidationError('config_key 不能为空');
    }

    const registry = await this.relationDb.selectOne(CONFIG_REGISTRY_TABLE, [
      { field: 'config_key', operator: Operator.EQ, value: input.config_key },
    ]);
    if (!registry) {
      throw new NotFoundError('config_key', input.config_key);
    }

    const layer = registry.layer as string;
    const module = registry.module as string;

    const layerPriv = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);
    const modulePriv = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: module },
    ]);

    const effectiveReadable = this.computeEffectiveReadable(registry, layerPriv, modulePriv);
    const effectiveWritable = this.computeEffectiveWritable(registry, layerPriv, modulePriv);

    let currentValue: unknown = null;
    try {
      currentValue = await this.getCurrentValue(input.config_key);
    } catch {
      currentValue = null;
    }

    output.config_item = {
      config_key: registry.config_key,
      config_name: registry.config_name,
      config_description: registry.config_description,
      config_type: registry.config_type,
      config_default: registry.config_default ? this.tryParse(registry.config_default as string) : null,
      config_enum_values: registry.config_enum_values ? this.tryParse(registry.config_enum_values as string) : null,
      layer,
      module,
      category: registry.category,
      readable: (registry.readable as number) === 1,
      writable: (registry.writable as number) === 1,
      effective_readable: effectiveReadable,
      effective_writable: effectiveWritable,
      current_value: currentValue,
    };
    return true;
  }

  // =========================================================================
  // createConfigItem
  // =========================================================================

  async createConfigItem(
    input: CreateConfigItemInput,
    _context: ConfigContext,
    output: CreateConfigItemOutput,
  ): Promise<boolean> {
    if (!input.layer || !VALID_LAYERS.includes(input.layer as any)) {
      throw new ValidationError(`layer 必须是 ${VALID_LAYERS.join('/')} 之一`);
    }
    if (!input.module || !input.category || !input.config_key || !input.config_type) {
      throw new ValidationError('module/category/config_key/config_type 不能为空');
    }

    const existing = await this.relationDb.selectOne(CONFIG_REGISTRY_TABLE, [
      { field: 'config_key', operator: Operator.EQ, value: input.config_key },
    ]);
    if (existing) {
      throw new ValidationError(`config_key '${input.config_key}' 已存在`);
    }

    const now = Date.now();
    const id = this.generateId();
    await this.relationDb.insert(CONFIG_REGISTRY_TABLE, [
      { field: 'id', value: id },
      { field: 'created', value: now },
      { field: 'updated', value: now },
      { field: 'config_key', value: input.config_key },
      { field: 'layer', value: input.layer },
      { field: 'module', value: input.module },
      { field: 'category', value: input.category },
      { field: 'config_name', value: input.config_name },
      { field: 'config_description', value: input.config_description ?? null },
      { field: 'config_type', value: input.config_type },
      { field: 'config_default', value: input.config_default !== undefined ? JSON.stringify(input.config_default) : null },
      { field: 'config_enum_values', value: input.config_enum_values ? JSON.stringify(input.config_enum_values) : null },
      { field: 'readable', value: 1 },
      { field: 'writable', value: 1 },
    ]);

    await this.ensureLayerPrivilege(input.layer);
    await this.ensureModulePrivilege(input.module, input.layer);

    output.config_item = {
      config_key: input.config_key,
      config_name: input.config_name,
      config_description: input.config_description,
      config_type: input.config_type,
      config_default: input.config_default,
      config_enum_values: input.config_enum_values ?? null,
      layer: input.layer,
      module: input.module,
      category: input.category,
      readable: true,
      writable: true,
      effective_readable: true,
      effective_writable: true,
      current_value: null,
    };
    return true;
  }

  // =========================================================================
  // deleteConfigItem
  // =========================================================================

  async deleteConfigItem(
    input: DeleteConfigItemInput,
    _context: ConfigContext,
    output: DeleteConfigItemOutput,
  ): Promise<boolean> {
    if (!input.config_key) {
      throw new ValidationError('config_key 不能为空');
    }

    const existing = await this.relationDb.selectOne(CONFIG_REGISTRY_TABLE, [
      { field: 'config_key', operator: Operator.EQ, value: input.config_key },
    ]);
    if (!existing) {
      throw new NotFoundError('config_key', input.config_key);
    }

    await this.relationDb.delete(CONFIG_REGISTRY_TABLE, [
      { field: 'config_key', operator: Operator.EQ, value: input.config_key },
    ]);
    return true;
  }

  // =========================================================================
  // updateConfig
  // =========================================================================

  async updateConfig(
    input: UpdateConfigInput,
    _context: ConfigContext,
    output: UpdateConfigOutput,
  ): Promise<boolean> {
    if (!input.config_key) {
      throw new ValidationError('config_key 不能为空');
    }
    if (input.value === undefined) {
      throw new ValidationError('value 不能为空');
    }

    const registry = await this.relationDb.selectOne(CONFIG_REGISTRY_TABLE, [
      { field: 'config_key', operator: Operator.EQ, value: input.config_key },
    ]);
    if (!registry) {
      throw new NotFoundError('config_key', input.config_key);
    }

    const layer = registry.layer as string;
    const module = registry.module as string;

    const layerPriv = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);
    const modulePriv = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: module },
    ]);

    const effectiveWritable = this.computeEffectiveWritable(registry, layerPriv, modulePriv);
    if (!effectiveWritable) {
      throw new ValidationError(`配置项 ${input.config_key} 不可写`);
    }

    const configType = registry.config_type as string;
    this.validateValueType(input.value, configType);

    await this.routeUpdateConfig(input.config_key, input.value);

    return true;
  }

  // =========================================================================
  // configConfig (self-config)
  // =========================================================================

  async configConfig(
    input: ConfigConfigInput,
    _context: ConfigContext,
    output: ConfigConfigOutput,
  ): Promise<boolean> {
    const existing = await this.relationDb.selectOne(CONFIG_CONFIG_TABLE, []);
    const now = Date.now();

    const data: DataObject[] = [{ field: 'updated', value: now }];
    if (input.default_readable !== undefined) {
      data.push({ field: 'default_readable', value: input.default_readable ? 1 : 0 });
    }
    if (input.default_writable !== undefined) {
      data.push({ field: 'default_writable', value: input.default_writable ? 1 : 0 });
    }

    if (existing) {
      await this.relationDb.update(CONFIG_CONFIG_TABLE, data, [
        { field: 'id', operator: Operator.EQ, value: existing.id },
      ]);
    } else {
      const id = this.generateId();
      await this.relationDb.insert(CONFIG_CONFIG_TABLE, [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'default_readable', value: input.default_readable !== false ? 1 : 0 },
        { field: 'default_writable', value: input.default_writable !== false ? 1 : 0 },
      ]);
    }

    const record = await this.relationDb.selectOne(CONFIG_CONFIG_TABLE, []);
    output.config = record ? this.rowToRecord(record) : {};
    return true;
  }

  // =========================================================================
  // Helper methods
  // =========================================================================

  private generateId(): string {
    const { IdGenerator } = require('@brian-agent/base');
    return IdGenerator.generate();
  }

  private rowToRecord(row: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === 'readable' || key === 'writable' || key === 'default_readable' || key === 'default_writable') {
        result[key] = value === 1;
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private tryParse(val: string | null | undefined): unknown {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  private computeEffectiveReadable(
    registry: Record<string, unknown> | null,
    layerPriv: Record<string, unknown> | null,
    modulePriv: Record<string, unknown> | null,
  ): boolean {
    const layerReadable = layerPriv ? (layerPriv.readable as number) === 1 : true;
    const modReadable = modulePriv ? (modulePriv.readable as number) === 1 : true;
    const configReadable = registry ? (registry.readable as number) === 1 : true;
    return layerReadable && modReadable && configReadable;
  }

  private computeEffectiveWritable(
    registry: Record<string, unknown> | null,
    layerPriv: Record<string, unknown> | null,
    modulePriv: Record<string, unknown> | null,
  ): boolean {
    const layerWritable = layerPriv ? (layerPriv.writable as number) === 1 : true;
    const modWritable = modulePriv ? (modulePriv.writable as number) === 1 : true;
    const configWritable = registry ? (registry.writable as number) === 1 : true;
    return layerWritable && modWritable && configWritable;
  }

  private buildModulePrivilegeWithEffective(
    modRecord: Record<string, unknown>,
    layerPriv: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const layerReadable = layerPriv ? (layerPriv.readable as number) === 1 : true;
    const layerWritable = layerPriv ? (layerPriv.writable as number) === 1 : true;
    const modReadable = (modRecord.readable as number) === 1;
    const modWritable = (modRecord.writable as number) === 1;
    return {
      ...this.rowToRecord(modRecord),
      effective_readable: layerReadable && modReadable,
      effective_writable: layerWritable && modWritable,
    };
  }

  private async ensureLayerPrivilege(layer: string): Promise<void> {
    const existing = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);
    if (!existing) {
      const now = Date.now();
      await this.relationDb.insert(CONFIG_LAYER_PRIVILEGE_TABLE, [
        { field: 'id', value: this.generateId() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'layer', value: layer },
        { field: 'readable', value: 1 },
        { field: 'writable', value: 1 },
      ]);
    }
  }

  private async ensureModulePrivilege(module: string, layer: string): Promise<void> {
    const existing = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: module },
    ]);
    if (!existing) {
      const now = Date.now();
      await this.relationDb.insert(CONFIG_MODULE_PRIVILEGE_TABLE, [
        { field: 'id', value: this.generateId() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'module', value: module },
        { field: 'layer', value: layer },
        { field: 'readable', value: 1 },
        { field: 'writable', value: 1 },
      ]);
    }
  }

  private validateValueType(value: unknown, configType: string): void {
    switch (configType.toUpperCase()) {
      case 'STRING':
        if (typeof value !== 'string') throw new ValidationError(`期望 STRING 类型，实际为 ${typeof value}`);
        break;
      case 'INT':
      case 'INTEGER':
        if (typeof value !== 'number' || !Number.isInteger(value)) throw new ValidationError(`期望 INT 类型，实际为 ${typeof value}`);
        break;
      case 'DOUBLE':
      case 'FLOAT':
      case 'NUMBER':
        if (typeof value !== 'number') throw new ValidationError(`期望 NUMBER 类型，实际为 ${typeof value}`);
        break;
      case 'BOOLEAN':
      case 'BOOL':
        if (typeof value !== 'boolean') throw new ValidationError(`期望 BOOLEAN 类型，实际为 ${typeof value}`);
        break;
      case 'JSON':
      case 'OBJECT':
        if (typeof value !== 'object' || value === null) throw new ValidationError(`期望 OBJECT 类型，实际为 ${typeof value}`);
        break;
      case 'ARRAY':
        if (!Array.isArray(value)) throw new ValidationError(`期望 ARRAY 类型，实际为 ${typeof value}`);
        break;
      default:
        break;
    }
  }

  // =========================================================================
  // getCurrentValue - fetches current config value from lower layer
  // =========================================================================

  private async getCurrentValue(configKey: string): Promise<unknown> {
    if (configKey.startsWith('info_core.tag_config.')) {
      const out = new SoInfoTagConfigOutput();
      await this.infoCore.soInfoTagConfig({} as SoInfoTagConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'tag_config', configKey);
    }
    if (configKey.startsWith('info_core.summary_config.')) {
      const out = new SoInfoSummaryConfigOutput();
      await this.infoCore.soInfoSummaryConfig({} as SoInfoSummaryConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'summary_config', configKey);
    }
    if (configKey.startsWith('info_core.vector_config.')) {
      const out = new SoInfoVectorConfigOutput();
      await this.infoCore.soInfoVectorConfig({} as SoInfoVectorConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'vector_config', configKey);
    }
    if (configKey.startsWith('info_core.context_config.')) {
      const out = new SoInfoContextConfigOutput();
      await this.infoCore.soInfoContextConfig({} as SoInfoContextConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'context_config', configKey);
    }
    if (configKey.startsWith('info_core.config.')) {
      const out = new SoInfoConfigOutput();
      await this.infoCore.soInfoConfig({} as SoInfoConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'config', configKey);
    }
    if (configKey.startsWith('llm_core.')) {
      const out = new ConfigLLMCoreOutput();
      await this.llmCore.configLLMCore({} as ConfigLLMCoreInput, {} as LLMCoreContext, out);
      return this.extractConfigValue(out, 'llm_core', configKey);
    }
    if (configKey.startsWith('mcp_core.')) {
      const out = new ConfigMcpCoreOutput();
      await this.mcpCore.configMCPCore({} as ConfigMcpCoreInput, {} as McpCoreContext, out);
      return this.extractConfigValue(out, 'mcp_core', configKey);
    }
    if (configKey.startsWith('skill_core.regen_rate') || configKey.startsWith('skill_core.prompt_template_id')) {
      const out = new ConfigSkillCoreOutput();
      await this.skillCore.configSkillCore({} as ConfigSkillCoreInput, {} as SkillCoreContext, out);
      return this.extractConfigValue(out, 'skill_core', configKey);
    }
    if (configKey.startsWith('skill_core.opt_rule')) {
      const out = new SoSkillRuleOutput();
      await this.skillCore.soSkillRule({} as SoSkillRuleInput, {} as SkillCoreContext, out);
      return (out as any).rule ?? out;
    }
    if (configKey.startsWith('soul_core.regen_rate') || configKey.startsWith('soul_core.prompt_template_id')) {
      const out = new ConfigSoulCoreOutput();
      await this.soulCore.configSoulCore({} as ConfigSoulCoreInput, {} as SoulCoreContext, out);
      return this.extractConfigValue(out, 'soul_core', configKey);
    }
    if (configKey.startsWith('soul_core.opt_rule')) {
      const out = new SoSoulRuleOutput();
      await this.soulCore.soSoulRule({} as SoSoulRuleInput, {} as SoulCoreContext, out);
      return (out as any).rule ?? out;
    }
    if (configKey.startsWith('writer_agent.')) {
      return this.getConfigFromAccess(
        configKey, 'writer_agent',
        (i: any, c: any, o: any) => this.writerAgent.configWriterAgent(i, c, o),
      );
    }
    if (configKey.startsWith('evolutor_agent.')) {
      return this.getConfigFromAccess(
        configKey, 'evolutor_agent',
        (i: any, c: any, o: any) => this.evolutorAgent.configEvolutorAgent(i, c, o),
      );
    }
    if (configKey.startsWith('agent_context.')) {
      return this.getConfigFromAccess(
        configKey, 'agent_context',
        (i: any, c: any, o: any) => this.agentContext.configAgentContext(i, c, o),
      );
    }
    if (configKey.startsWith('agent_library.')) {
      return this.getConfigFromAccess(
        configKey, 'agent_library',
        (i: any, c: any, o: any) => this.agentLibrary.configAgentLibrary(i, c, o),
      );
    }
    if (configKey.startsWith('agent_builder.')) {
      return this.getConfigFromAccess(
        configKey, 'agent_builder',
        (i: any, c: any, o: any) => this.agentBuilder.configAgentBuilder(i, c, o),
      );
    }
    if (configKey.startsWith('agent_execution.')) {
      return this.getConfigFromAccess(
        configKey, 'agent_execution',
        (i: any, c: any, o: any) => this.agentExecution.configAgentExecution(i, c, o),
      );
    }
    if (configKey.startsWith('agent_strategy.')) {
      return this.getConfigFromAccess(
        configKey, 'agent_strategy',
        (i: any, c: any, o: any) => this.agentStrategy.configAgentStrategy(i, c, o),
      );
    }
    if (configKey.startsWith('orchestration.visualization')) {
      return this.getConfigFromAccess(
        configKey, 'orchestration_visualization',
        (i: any, c: any, o: any) => this.orchestrationVisualization.configOrchestrationVisualization(i, c, o),
      );
    }
    if (configKey.startsWith('orchestration.execution')) {
      return this.getConfigFromAccess(
        configKey, 'orchestration_execution',
        (i: any, c: any, o: any) => this.orchestrationExecution.configOrchestrationExecution(i, c, o),
      );
    }
    if (configKey.startsWith('orchestration.strategy')) {
      return this.getConfigFromAccess(
        configKey, 'orchestration_strategy',
        (i: any, c: any, o: any) => this.orchestrationStrategy.configOrchestrationStrategy(i, c, o),
      );
    }
    if (configKey.startsWith('orchestration.entry')) {
      return this.getConfigFromAccess(
        configKey, 'orchestration_entry',
        (i: any, c: any, o: any) => this.orchestrationEntry.configOrchestrationEntry(i, c, o),
      );
    }
    if (configKey.startsWith('orchestration.jsonnode')) {
      return this.getConfigFromAccess(
        configKey, 'orchestration_jsonnode',
        (i: any, c: any, o: any) => this.jsonNode.configJSONNode(i, c, o),
      );
    }
    if (configKey.startsWith('chat.')) {
      return this.getConfigFromAccess(
        configKey, 'chat',
        (i: any, c: any, o: any) => this.chatAccess.configChat(i, c, o),
      );
    }
    if (configKey.startsWith('self_learning.')) {
      return this.getConfigFromAccess(
        configKey, 'self_learning',
        (i: any, c: any, o: any) => this.selfLearningAccess.configSelfLearning(i, c, o),
      );
    }
    if (configKey.startsWith('user_profile.')) {
      return this.getConfigFromAccess(
        configKey, 'user_profile',
        (i: any, c: any, o: any) => this.userProfileAccess.configUserProfile(i, c, o),
      );
    }
    if (configKey.startsWith('visualization.')) {
      return this.getConfigFromAccess(
        configKey, 'visualization',
        (i: any, c: any, o: any) => this.visualizationAccess.configVisualization(i, c, o),
      );
    }

    const row = await this.relationDb.selectOne(CONFIG_REGISTRY_TABLE, [
      { field: 'config_key', operator: Operator.EQ, value: configKey },
    ]);
    if (row && row.config_value) {
      return this.tryParse(row.config_value as string);
    }

    return null;
  }

  private extractConfigValue(out: any, _prefix: string, _configKey: string): unknown {
    if (out && typeof out === 'object') {
      if ('config' in out && out.config !== undefined) return out.config;
      if ('value' in out) return out.value;
      return out;
    }
    return null;
  }

  private async getConfigFromAccess(
    _configKey: string,
    _prefix: string,
    fn: (input: any, context: any, output: any) => Promise<boolean>,
  ): Promise<unknown> {
    const out: any = {};
    await fn({}, {}, out);
    return this.extractConfigValue(out, _prefix, _configKey);
  }

  // =========================================================================
  // routeUpdateConfig - routes update to correct lower-layer method
  // =========================================================================

  private async routeUpdateConfig(configKey: string, value: unknown): Promise<void> {
    const prefix = configKey;

    if (prefix.startsWith('llm_core.regen_rate') || prefix.startsWith('llm_core.prompt_template_id')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.llmCore.configLLMCore(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('llm_core.quota_')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.llmCore.limitLLM(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('mcp_core.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.mcpCore.configMCPCore(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('skill_core.regen_rate') || prefix.startsWith('skill_core.prompt_template_id')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.skillCore.configSkillCore(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('skill_core.opt_rule')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.skillCore.updateSkillRule(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('soul_core.regen_rate') || prefix.startsWith('soul_core.prompt_template_id')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.soulCore.configSoulCore(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('soul_core.opt_rule')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.soulCore.updateSoulRule(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('info_core.tag_config.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.infoCore.updateInfoTagConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('info_core.summary_config.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.infoCore.updateInfoSummaryConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('info_core.vector_config.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.infoCore.updateInfoVectorConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('info_core.context_config.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.infoCore.updateInfoContextConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('info_core.config.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.infoCore.updateInfoConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('writer_agent.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.writerAgent.configWriterAgent(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('evolutor_agent.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.evolutorAgent.configEvolutorAgent(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_context.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.agentContext.configAgentContext(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_library.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.agentLibrary.configAgentLibrary(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_builder.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.agentBuilder.configAgentBuilder(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_execution.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.agentExecution.configAgentExecution(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_strategy.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.agentStrategy.configAgentStrategy(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.entry')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.orchestrationEntry.configOrchestrationEntry(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.strategy')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.orchestrationStrategy.configOrchestrationStrategy(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.execution')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.orchestrationExecution.configOrchestrationExecution(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.visualization')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.orchestrationVisualization.configOrchestrationVisualization(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.jsonnode')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.jsonNode.configJSONNode(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('chat.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.chatAccess.configChat(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('self_learning.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.selfLearningAccess.configSelfLearning(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('user_profile.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.userProfileAccess.configUserProfile(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('visualization.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.visualizationAccess.configVisualization(input, {} as any, output);
      return;
    }

    const now = Date.now();
    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    await this.relationDb.update(CONFIG_REGISTRY_TABLE, [
      { field: 'updated', value: now },
      { field: 'config_value', value: valueStr },
    ], [{ field: 'config_key', operator: Operator.EQ, value: configKey }]);
  }

  // =========================================================================
  // LLM Proxy methods
  // =========================================================================

  async addLLMProviderProxy(input: AddLLMProviderInput, context: LLMContext, output: AddLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.addLLMProvider(input, context, output);
  }

  async updateLLMProviderProxy(input: UpdateLLMProviderInput, context: LLMContext, output: UpdateLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.updateLLMProvider(input, context, output);
  }

  async delLLMProviderProxy(input: DelLLMProviderInput, context: LLMContext, output: DelLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.delLLMProvider(input, context, output);
  }

  async soLLMProviderProxy(input: SoLLMProviderInput, context: LLMContext, output: SoLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.soLLMProvider(input, context, output);
  }

  async testLLMProviderProxy(input: TestLLMProviderInput, context: LLMContext, output: TestLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.testLLMProvider(input, context, output);
  }

  async listLLMProxy(input: ListLLMInput, context: LLMContext, output: ListLLMOutput): Promise<boolean> {
    return this.llmAccess.listLLM(input, context, output);
  }

  async addLLMProxy(input: AddLLMInput, context: LLMContext, output: AddLLMOutput): Promise<boolean> {
    return this.llmAccess.addLLM(input, context, output);
  }

  async updateLLMProxy(input: UpdateLLMInput, context: LLMContext, output: UpdateLLMOutput): Promise<boolean> {
    return this.llmAccess.updateLLM(input, context, output);
  }

  async delLLMProxy(input: DelLLMInput, context: LLMContext, output: DelLLMOutput): Promise<boolean> {
    return this.llmAccess.delLLM(input, context, output);
  }

  async soLLMProxy(input: SoLLMInput, context: LLMContext, output: SoLLMOutput): Promise<boolean> {
    return this.llmAccess.soLLM(input, context, output);
  }

  async getLLMProxy(input: GetLLMInput, context: LLMContext, output: GetLLMOutput): Promise<boolean> {
    return this.llmAccess.getLLM(input, context, output);
  }

  // =========================================================================
  // Soul Proxy methods
  // =========================================================================

  async addSoulProxy(input: AddSoulInput, context: SoulContext, output: AddSoulOutput): Promise<boolean> {
    return this.soulAccess.addSoul(input, context, output);
  }

  async updateSoulProxy(input: UpdateSoulInput, context: SoulContext, output: UpdateSoulOutput): Promise<boolean> {
    return this.soulAccess.updateSoul(input, context, output);
  }

  async delSoulProxy(input: DelSoulInput, context: SoulContext, output: DelSoulOutput): Promise<boolean> {
    return this.soulAccess.delSoul(input, context, output);
  }

  async soSoulProxy(input: SoSoulInput, context: SoulContext, output: SoSoulOutput): Promise<boolean> {
    return this.soulAccess.soSoul(input, context, output);
  }

  async getSoulProxy(input: GetSoulInput, context: SoulContext, output: GetSoulOutput): Promise<boolean> {
    return this.soulAccess.getSoul(input, context, output);
  }

  async getSoulRuleProxy(input: SoSoulRuleInput, context: SoulCoreContext, output: SoSoulRuleOutput): Promise<boolean> {
    return this.soulCore.soSoulRule(input, context, output);
  }

  async updateSoulRuleProxy(input: UpdateSoulRuleInput, context: SoulCoreContext, output: UpdateSoulRuleOutput): Promise<boolean> {
    return this.soulCore.updateSoulRule(input, context, output);
  }

  // =========================================================================
  // Skill Proxy methods
  // =========================================================================

  async addSkillProxy(input: AddSkillInput, context: SkillContext, output: AddSkillOutput): Promise<boolean> {
    return this.skillAccess.addSkill(input, context, output);
  }

  async updateSkillProxy(input: UpdateSkillInput, context: SkillContext, output: UpdateSkillOutput): Promise<boolean> {
    return this.skillAccess.updateSkill(input, context, output);
  }

  async delSkillProxy(input: DelSkillInput, context: SkillContext, output: DelSkillOutput): Promise<boolean> {
    return this.skillAccess.delSkill(input, context, output);
  }

  async soSkillProxy(input: SoSkillInput, context: SkillContext, output: SoSkillOutput): Promise<boolean> {
    return this.skillAccess.soSkill(input, context, output);
  }

  async getSkillProxy(input: GetSkillInput, context: SkillContext, output: GetSkillOutput): Promise<boolean> {
    return this.skillAccess.getSkill(input, context, output);
  }

  async getSkillRuleProxy(input: SoSkillRuleInput, context: SkillCoreContext, output: SoSkillRuleOutput): Promise<boolean> {
    return this.skillCore.soSkillRule(input, context, output);
  }

  async updateSkillRuleProxy(input: UpdateSkillRuleInput, context: SkillCoreContext, output: UpdateSkillRuleOutput): Promise<boolean> {
    return this.skillCore.updateSkillRule(input, context, output);
  }

  // =========================================================================
  // MCP Proxy methods
  // =========================================================================

  async addMcpProviderProxy(input: AddMcpProviderInput, context: McpContext, output: AddMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.addMcpProvider(input, context, output);
  }

  async updateMcpProviderProxy(input: UpdateMcpProviderInput, context: McpContext, output: UpdateMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.updateMcpProvider(input, context, output);
  }

  async delMcpProviderProxy(input: DelMcpProviderInput, context: McpContext, output: DelMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.delMcpProvider(input, context, output);
  }

  async soMcpProviderProxy(input: SoMcpProviderInput, context: McpContext, output: SoMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.soMcpProvider(input, context, output);
  }

  async testMcpProviderProxy(input: TestMcpProviderInput, context: McpContext, output: TestMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.testMcpProvider(input, context, output);
  }

  async listMcpProxy(input: ListMcpInput, context: McpContext, output: ListMcpOutput): Promise<boolean> {
    return this.mcpAccess.listMcp(input, context, output);
  }

  async installMcpProxy(input: InstallMcpInput, context: McpContext, output: InstallMcpOutput): Promise<boolean> {
    return this.mcpAccess.installMcp(input, context, output);
  }

  async startMcpProxy(input: StartMcpInput, context: McpContext, output: StartMcpOutput): Promise<boolean> {
    return this.mcpAccess.startMcp(input, context, output);
  }

  async stopMcpProxy(input: StopMcpInput, context: McpContext, output: StopMcpOutput): Promise<boolean> {
    return this.mcpAccess.stopMcp(input, context, output);
  }

  async uninstallMcpProxy(input: UninstallMcpInput, context: McpContext, output: UninstallMcpOutput): Promise<boolean> {
    return this.mcpAccess.uninstallMcp(input, context, output);
  }

  async updateMcpProxy(input: UpdateMcpInput, context: McpContext, output: UpdateMcpOutput): Promise<boolean> {
    return this.mcpAccess.updateMcp(input, context, output);
  }

  async getMcpProxy(input: GetMcpInput, context: McpContext, output: GetMcpOutput): Promise<boolean> {
    return this.mcpAccess.getMcp(input, context, output);
  }

  async soMcpProxy(input: SoMcpInput, context: McpContext, output: SoMcpOutput): Promise<boolean> {
    return this.mcpAccess.soMcp(input, context, output);
  }

  // =========================================================================
  // Prompt Proxy methods
  // =========================================================================

  async addPromptProxy(input: AddPromptInput, context: PromptContext, output: AddPromptOutput): Promise<boolean> {
    return this.promptsAccess.addPrompt(input, context, output);
  }

  async updatePromptProxy(input: UpdatePromptInput, context: PromptContext, output: UpdatePromptOutput): Promise<boolean> {
    return this.promptsAccess.updatePrompt(input, context, output);
  }

  async delPromptProxy(input: DelPromptInput, context: PromptContext, output: DelPromptOutput): Promise<boolean> {
    return this.promptsAccess.delPrompt(input, context, output);
  }

  async soPromptProxy(input: SoPromptInput, context: PromptContext, output: SoPromptOutput): Promise<boolean> {
    return this.promptsAccess.soPrompt(input, context, output);
  }

  async getPromptProxy(input: GetPromptInput, context: PromptContext, output: GetPromptOutput): Promise<boolean> {
    return this.promptsAccess.getPrompt(input, context, output);
  }
}
