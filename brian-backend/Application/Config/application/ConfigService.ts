/**
 * @fileoverview Config 应用服务层。
 *
 * ConfigService 是系统级配置的统一入口，提供：
 * 1. 配置元数据注册管理
 * 2. 三层权限模型（Layer → Module → Category）
 * 3. 向下层模块代理所有配置操作
 * 4. Base 资源管理代理（LLM/Soul/Skill/MCP/Prompt）
 */

import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, CronAccess } from '@brian-agent/base';
import { IdGenerator } from '@brian-agent/base';
import { GetCronTaskInput, GetCronTaskOutput, CronContext, SetCronTaskInput, SetCronTaskOutput } from '@brian-agent/base';
import { Operator, ValidationError, NotFoundError } from '@brian-agent/base';
import type { DataObject } from '@brian-agent/base';
import type { Condition } from '@brian-agent/base';
import {
  ConfigService as BaseConfigService,
  LLM_CONFIG_TABLE,
  SOUL_CONFIG_TABLE,
  SKILL_CONFIG_TABLE,
  MCP_CONFIG_TABLE,
  PROMPTS_CONFIG_TABLE,
  MQ_CONFIG_TABLE,
  GRAPHDB_CONFIG_TABLE,
  VECTORDB_CONFIG_TABLE,
  RELATIONDB_CONFIG_TABLE,
  TOOL_CONFIG_TABLE,
  CDT_CONFIG_TABLE,
} from '@brian-agent/base';

import type { LLMCoreAccess, InfoCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess } from '@brian-agent/core';
import {
  ConfigLLMCoreOutput,
  ConfigMcpCoreOutput,
  ConfigSkillCoreOutput, SoSkillRuleOutput,
  ConfigSoulCoreOutput, SoSoulRuleOutput,
  SoInfoTagConfigOutput, SoInfoSummaryConfigOutput, SoInfoConfigOutput,
  SoInfoVectorConfigOutput, SoInfoContextConfigOutput,
} from '@brian-agent/core';
import type { ConfigLLMCoreInput, LLMCoreContext } from '@brian-agent/core';
import type { SoInfoTagConfigInput, SoInfoSummaryConfigInput, SoInfoConfigInput, SoInfoVectorConfigInput, SoInfoContextConfigInput, InfoCoreContext } from '@brian-agent/core';
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
  LimitLLMInput, LimitLLMOutput,
  UpdateInfoTagConfigInput, UpdateInfoTagConfigOutput,
  UpdateInfoSummaryConfigInput, UpdateInfoSummaryConfigOutput,
  UpdateInfoVectorConfigInput, UpdateInfoVectorConfigOutput,
  UpdateInfoContextConfigInput, UpdateInfoContextConfigOutput,
  UpdateInfoConfigInput, UpdateInfoConfigOutput,
} from '@brian-agent/core';

import type {
  WriterAgentAccess, EvolutorAgentAccess, AgentLibraryAccess,
  AgentBuilderAccess, AgentExecutionAccess, AgentStrategyAccess, AgentContextAccess,
  PlannerAgentAccess,
  ConfigPlannerAgentInput, ConfigPlannerAgentOutput, PlannerAgentContext,
  ConfigWriterAgentInput, ConfigWriterAgentOutput, WriterAgentContext,
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput, EvolutorAgentContext,
  ConfigAgentContextInput, ConfigAgentContextOutput, AgentContextContext,
  ConfigAgentLibraryInput, ConfigAgentLibraryOutput, AgentLibraryContext,
  ConfigAgentBuilderInput, ConfigAgentBuilderOutput, AgentBuilderContext,
  ConfigAgentExecutionInput, ConfigAgentExecutionOutput, AgentExecutionContext,
  ConfigAgentStrategyInput, ConfigAgentStrategyOutput, AgentStrategyContext,
} from '@brian-agent/agent';
import type {
  LLMAccess, SoulAccess, SkillAccess, MCPAccess, PromptsAccess, LogAccess,
  MQAccess, GraphDBAccess, VectorDBAccess,
} from '@brian-agent/base';
import type {
  ConfigLogInput, ConfigLogOutput, LogContext,
  EnableLLMInput, EnableLLMOutput,
  EnableSoulInput, EnableSoulOutput,
  EnableSkillInput, EnableSkillOutput,
  EnableMCPInput, EnableMCPOutput,
  EnablePromptsInput, EnablePromptsOutput,
  EnableMQInput, EnableMQOutput,
  EnableGraphDBInput, EnableGraphDBOutput,
  EnableVectorDBInput, EnableVectorDBOutput,
  EnableDBInput, EnableDBOutput,
  MQContext, GraphContext, VectorContext, DBContext,
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
import { PROMPT_SLOTS } from '@brian-agent/base';

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
  GetConfigHistoryInput,
  GetConfigHistoryOutput,
  CONFIG_LAYER_PRIVILEGE_TABLE,
  CONFIG_MODULE_PRIVILEGE_TABLE,
  CONFIG_CONFIG_TABLE,
  CONFIG_HISTORY_TABLE,
  VALID_LAYERS,
  type ConfigRegistration,
  type ConfigHistoryRecord,
} from '../domain/types';
import { ALL_CONFIG_REGISTRATIONS, LAYER_LABELS, MODULE_LABELS, CATEGORY_LABELS, MODULE_ENTITY_TYPES } from '../domain/configRegistrations';

// 同包跨模块依赖仅做类型引用（import type 编译期擦除，不产生运行时循环依赖）
import type { ChatAccess } from '../../Chat/access/ChatAccess';
import type { ConfigChatInput, ConfigChatOutput, ChatContext } from '../../Chat/domain/types';
import type { SelfLearningAccess } from '../../SelfLearning/access/SelfLearningAccess';
import type { ConfigSelfLearningInput, ConfigSelfLearningOutput, SelfLearningContext } from '../../SelfLearning/domain/types';
import type { UserProfileAccess } from '../../UserProfile/access/UserProfileAccess';
import type { ConfigUserProfileInput, ConfigUserProfileOutput, UserProfileContext } from '../../UserProfile/domain/types';
import type { VisualizationAccess } from '../../Visualization/access/VisualizationAccess';
import type { ConfigVisualizationInput, ConfigVisualizationOutput, VisualizationContext } from '../../Visualization/domain/types';

/** 分层配置值读取匹配结果（内部类型）：matched=false 表示本组不处理该配置键 */
interface ConfigValueMatch {
  matched: boolean;
  value: unknown;
}

/** 配置树构建工作上下文（内部类型）：权限映射 + 层/模块节点工作表 */
interface ConfigTreeContext {
  layerPrivMap: Map<string, Record<string, unknown>>;
  modulePrivMap: Map<string, Record<string, unknown>>;
  layerMap: Map<string, Record<string, unknown>>;
  moduleMap: Map<string, { module: Record<string, unknown>; layerName: string }>;
}

export class ConfigService {
  private readonly relationDb: RelationDBAccess;
  private readonly llmAccess: LLMAccess;
  private readonly soulAccess: SoulAccess;
  private readonly skillAccess: SkillAccess;
  private readonly mcpAccess: MCPAccess;
  private readonly promptsAccess: PromptsAccess;
  private readonly logAccess: LogAccess;
  private readonly mqAccess: MQAccess;
  private readonly graphDBAccess: GraphDBAccess;
  private readonly vectorDBAccess: VectorDBAccess;
  private readonly llmCore: LLMCoreAccess;
  private readonly infoCore: InfoCoreAccess;
  private readonly mcpCore: MCPCoreAccess;
  private readonly skillCore: SkillCoreAccess;
  private readonly soulCore: SoulCoreAccess;
  private readonly writerAgent: WriterAgentAccess;
  private readonly evolutorAgent: EvolutorAgentAccess;
  private readonly plannerAgent: PlannerAgentAccess;
  private readonly agentLibrary: AgentLibraryAccess;
  private readonly agentBuilder: AgentBuilderAccess;
  private readonly agentExecution: AgentExecutionAccess;
  private readonly agentStrategy: AgentStrategyAccess;
  private readonly agentContext: AgentContextAccess;
  private readonly chatAccess: ChatAccess;
  private readonly selfLearningAccess: SelfLearningAccess;
  private readonly userProfileAccess: UserProfileAccess;
  private readonly visualizationAccess: VisualizationAccess;
  private readonly cronAccess: CronAccess;

  /** 内存静态注册表：配置项元数据直接来自 configRegistrations 静态定义（不再写 config_registry 表） */
  private readonly registryMap: Map<string, ConfigRegistration> = new Map(
    ALL_CONFIG_REGISTRATIONS.map((r) => [r.config_key, r]),
  );

  /** Base 层 Provider 模块名 → 对应配置表名映射（config_key 前缀 `模块.key`） */
  private static readonly BASE_PROVIDER_CONFIG_TABLES: Record<string, string> = {
    llm_provider: LLM_CONFIG_TABLE,
    soul_provider: SOUL_CONFIG_TABLE,
    skill_provider: SKILL_CONFIG_TABLE,
    mcp_provider: MCP_CONFIG_TABLE,
    prompts_provider: PROMPTS_CONFIG_TABLE,
    mq_provider: MQ_CONFIG_TABLE,
    graphdb_provider: GRAPHDB_CONFIG_TABLE,
    vectordb_provider: VECTORDB_CONFIG_TABLE,
    relationdb_provider: RELATIONDB_CONFIG_TABLE,
    tool_provider: TOOL_CONFIG_TABLE,
    cdt_provider: CDT_CONFIG_TABLE,
  };

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
    chatAccess: ChatAccess,
    selfLearningAccess: SelfLearningAccess,
    userProfileAccess: UserProfileAccess,
    visualizationAccess: VisualizationAccess,
    cronAccess: CronAccess,
  ) {
    this.relationDb = relationDb;
    this.llmAccess = llmAccess;
    this.soulAccess = soulAccess;
    this.skillAccess = skillAccess;
    this.mcpAccess = mcpAccess;
    this.promptsAccess = promptsAccess;
    this.logAccess = logAccess;
    this.mqAccess = mqAccess;
    this.graphDBAccess = graphDBAccess;
    this.vectorDBAccess = vectorDBAccess;
    this.llmCore = llmCore;
    this.infoCore = infoCore;
    this.mcpCore = mcpCore;
    this.skillCore = skillCore;
    this.soulCore = soulCore;
    this.writerAgent = writerAgent;
    this.evolutorAgent = evolutorAgent;
    this.plannerAgent = plannerAgent;
    this.agentLibrary = agentLibrary;
    this.agentBuilder = agentBuilder;
    this.agentExecution = agentExecution;
    this.agentStrategy = agentStrategy;
    this.agentContext = agentContext;
    this.chatAccess = chatAccess;
    this.selfLearningAccess = selfLearningAccess;
    this.userProfileAccess = userProfileAccess;
    this.visualizationAccess = visualizationAccess;
    this.cronAccess = cronAccess;
  }

  // =========================================================================
  // updateLayerPrivilege
  // =========================================================================

  async updateLayerPrivilege(input: UpdateLayerPrivilegeInput, output: UpdateLayerPrivilegeOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.layer || !(VALID_LAYERS as readonly string[]).includes(input.layer)) {
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

  async updateModulePrivilege(input: UpdateModulePrivilegeInput, output: UpdateModulePrivilegeOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report,
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
  // soConfigDetail
  // =========================================================================

  // ===== 修改后的方法（2026-09-22 方法长度拆分批次1）：124 行单方法拆为
  // 「准备上下文 → 构建层/模块结构 → 填充配置项」三段编排 + 纯数据加工子方法
  //（原始单方法已删除，等价结构见 git 历史）。
  /** 配置树查询（逻辑控制；5 参公开边界；三段编排 + 纯数据加工子方法） */
  async soConfigDetail(input: GetConfigDetailInput, output: GetConfigDetailOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const treeCtx = await this.prepareTreeContext();
    await this.buildTreeStructure(input, treeCtx);
    await this.fillTreeItems(input, treeCtx);
    output.layers = Array.from(treeCtx.layerMap.values());
    return true;
  }

  /** 准备配置树构建上下文（数据处理）：读取层/模块权限并建立工作表 */
  private async prepareTreeContext(): Promise<ConfigTreeContext> {
    const layerRows = await this.relationDb.select(CONFIG_LAYER_PRIVILEGE_TABLE);
    const moduleRows = await this.relationDb.select(CONFIG_MODULE_PRIVILEGE_TABLE);
    return {
      layerPrivMap: new Map<string, Record<string, unknown>>(layerRows.map((r) => [r.layer as string, r])),
      modulePrivMap: new Map<string, Record<string, unknown>>(moduleRows.map((r) => [r.module as string, r])),
      layerMap: new Map<string, Record<string, unknown>>(),
      moduleMap: new Map<string, { module: Record<string, unknown>; layerName: string }>(),
    };
  }

  /** 构建层/模块节点结构（逻辑控制；按 layer/module 过滤遍历静态注册表） */
  private async buildTreeStructure(input: GetConfigDetailInput, treeCtx: ConfigTreeContext): Promise<void> {
    for (const reg of ALL_CONFIG_REGISTRATIONS) {
      const layerName = reg.layer;
      if (input.layer && input.layer !== layerName) continue;
      this.ensureLayerNode(layerName, treeCtx);
      if (input.module && input.module !== reg.module) continue;
      this.ensureModuleNode(reg, treeCtx);
    }
  }

  /** 确保层节点存在（数据处理；缺省可读可写） */
  private ensureLayerNode(layerName: string, treeCtx: ConfigTreeContext): void {
    if (treeCtx.layerMap.has(layerName)) {
      return;
    }
    const lr = treeCtx.layerPrivMap.get(layerName);
    const layerInfo = LAYER_LABELS[layerName];
    treeCtx.layerMap.set(layerName, {
      layer: layerName,
      label: layerInfo?.label ?? layerName,
      desc: layerInfo?.desc ?? '',
      readable: lr ? (lr.readable as number) === 1 : true,
      writable: lr ? (lr.writable as number) === 1 : true,
      modules: [] as Array<Record<string, unknown>>,
    });
  }

  /** 确保模块节点存在（数据处理；以「层.模块」为键，避免不同层同名模块被合并） */
  private ensureModuleNode(reg: ConfigRegistration, treeCtx: ConfigTreeContext): void {
    const moduleKey = `${reg.layer}.${reg.module}`;
    if (treeCtx.moduleMap.has(moduleKey)) {
      return;
    }
    const mr = treeCtx.modulePrivMap.get(reg.module);
    const layerNode = treeCtx.layerMap.get(reg.layer);
    const layerReadable = layerNode ? (layerNode.readable as boolean) : true;
    const layerWritable = layerNode ? (layerNode.writable as boolean) : true;
    const modReadable = mr ? (mr.readable as number) === 1 : true;
    const modWritable = mr ? (mr.writable as number) === 1 : true;
    const modNode = {
      module: reg.module,
      label: (MODULE_LABELS[reg.module]?.label) ?? reg.module,
      desc: (MODULE_LABELS[reg.module]?.desc) ?? '',
      readable: modReadable,
      writable: modWritable,
      effective_readable: layerReadable && modReadable,
      effective_writable: layerWritable && modWritable,
      entity_types: (MODULE_ENTITY_TYPES[reg.module]) ?? [],
      categories: [] as Array<Record<string, unknown>>,
    };
    treeCtx.moduleMap.set(moduleKey, { module: modNode, layerName: reg.layer });
    if (layerNode) {
      (layerNode.modules as Array<Record<string, unknown>>).push(modNode);
    }
  }

  /** 填充配置项（逻辑控制；按 layer/module/category/readable 过滤后逐项追加） */
  private async fillTreeItems(input: GetConfigDetailInput, treeCtx: ConfigTreeContext): Promise<void> {
    for (const reg of ALL_CONFIG_REGISTRATIONS) {
      if (input.layer && input.layer !== reg.layer) continue;
      if (input.module && input.module !== reg.module) continue;
      if (input.category && input.category !== reg.category) continue;
      const modEntry = treeCtx.moduleMap.get(`${reg.layer}.${reg.module}`);
      if (!modEntry) continue;
      await this.appendConfigItem(reg, input, treeCtx, modEntry.module);
    }
  }

  /** 追加单个配置项（逻辑控制；生效权限计算 + 类目节点归属 + 当前值读取） */
  private async appendConfigItem(
    reg: ConfigRegistration,
    input: GetConfigDetailInput,
    treeCtx: ConfigTreeContext,
    modNode: Record<string, unknown>,
  ): Promise<void> {
    const layerNode = treeCtx.layerMap.get(reg.layer);
    const layerReadable = layerNode ? (layerNode.readable as boolean) : true;
    const layerWritable = layerNode ? (layerNode.writable as boolean) : true;
    const configReadable = reg.readable !== false;
    const configWritable = reg.writable !== false;
    const effectiveReadable = layerReadable && (modNode.readable as boolean) && configReadable;
    const effectiveWritable = layerWritable && (modNode.writable as boolean) && configWritable;
    if (input.readable_only && !effectiveReadable) return;

    const catNode = this.ensureCategoryNode(modNode, reg.category);
    const currentValue = await this.soCurrentConfigValue(reg.config_key);
    (catNode.items as Array<Record<string, unknown>>).push(this.toConfigItemRecord(reg, currentValue, effectiveReadable, effectiveWritable));
  }

  /** 确保类目节点存在（数据处理） */
  private ensureCategoryNode(modNode: Record<string, unknown>, category: string): Record<string, unknown> {
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
    return catNode;
  }

  /** 读取配置当前值（数据处理；读取失败回退 null，不中断树构建） */
  private async soCurrentConfigValue(configKey: string): Promise<unknown> {
    try {
      return await this.getCurrentValue(configKey);
    } catch {
      return null;
    }
  }

  /** 配置项记录组装（数据处理） */
  private toConfigItemRecord(
    reg: ConfigRegistration,
    currentValue: unknown,
    effectiveReadable: boolean,
    effectiveWritable: boolean,
  ): Record<string, unknown> {
    return {
      config_key: reg.config_key,
      config_name: reg.config_name,
      config_description: reg.config_description,
      config_type: reg.config_type,
      config_default: reg.config_default ?? null,
      config_enum_values: reg.config_enum_values ?? null,
      readable: reg.readable !== false,
      writable: reg.writable !== false,
      effective_readable: effectiveReadable,
      effective_writable: effectiveWritable,
      current_value: currentValue,
    };
  }

  // =========================================================================
  // soConfigItem
  // =========================================================================

  async soConfigItem(input: GetConfigItemInput, output: GetConfigItemOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.config_key) {
      throw new ValidationError('config_key 不能为空');
    }

    const reg = this.registryMap.get(input.config_key);
    if (!reg) {
      throw new NotFoundError('config_key', input.config_key);
    }

    const layer = reg.layer;
    const module = reg.module;

    const layerPriv = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);
    const modulePriv = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: module },
    ]);

    const registryLike = {
      readable: reg.readable !== false ? 1 : 0,
      writable: reg.writable !== false ? 1 : 0,
    };
    const effectiveReadable = this.computeEffectiveReadable(registryLike, layerPriv, modulePriv);
    const effectiveWritable = this.computeEffectiveWritable(registryLike, layerPriv, modulePriv);

    let currentValue: unknown = null;
    try {
      currentValue = await this.getCurrentValue(input.config_key);
    } catch {
      currentValue = null;
    }

    output.config_item = {
      config_key: reg.config_key,
      config_name: reg.config_name,
      config_description: reg.config_description,
      config_type: reg.config_type,
      config_default: reg.config_default ?? null,
      config_enum_values: reg.config_enum_values ?? null,
      layer,
      module,
      category: reg.category,
      readable: reg.readable !== false,
      writable: reg.writable !== false,
      effective_readable: effectiveReadable,
      effective_writable: effectiveWritable,
      current_value: currentValue,
    };
    return true;
  }

  // =========================================================================
  // updateConfig
  // =========================================================================

  // ===== 修改后的方法（2026-09-22 配置变更历史）：路由写入成功后记录 old→new 变更历史
  // （原实现无历史记录，原始代码已注释保留于方法上方说明）。
  // 原代码：
  //   this.validateValueType(input.value, reg.config_type);
  //   await this.routeUpdateConfig(input.config_key, input.value);
  //   return true;
  // now：路由前先取当前值（getCurrentValue 读取各模块配置真值），写入成功后落 config_history；
  // 历史落库失败不阻断配置写入（best-effort + metrics 可见，权限审计同款容忍语义）。
  async updateConfig(input: UpdateConfigInput, _output: UpdateConfigOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    if (!input.config_key) {
      throw new ValidationError('config_key 不能为空');
    }
    if (input.value === undefined) {
      throw new ValidationError('value 不能为空');
    }

    const reg = this.registryMap.get(input.config_key);
    if (!reg) {
      throw new NotFoundError('config_key', input.config_key);
    }

    const layer = reg.layer;
    const module = reg.module;

    const layerPriv = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);
    const modulePriv = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: module },
    ]);

    const registryLike = {
      readable: reg.readable !== false ? 1 : 0,
      writable: reg.writable !== false ? 1 : 0,
    };
    const effectiveWritable = this.computeEffectiveWritable(registryLike, layerPriv, modulePriv);
    if (!effectiveWritable) {
      throw new ValidationError(`配置项 ${input.config_key} 不可写`);
    }

    this.validateValueType(input.value, reg.config_type);

    const oldValue = await this.getCurrentValue(input.config_key);
    await this.routeUpdateConfig(input.config_key, input.value);
    await this.recordConfigHistory(input.config_key, oldValue, input.value, _metrics);

    return true;
  }

  // =========================================================================
  // soConfigHistory（配置变更历史查询）
  // =========================================================================

  /** 查询配置变更历史（逻辑控制；config_key 缺省查全局；change_time 降序；5 参公开边界） */
  async soConfigHistory(input: GetConfigHistoryInput, output: GetConfigHistoryOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report,
  ): Promise<boolean> {
    const conditions: Condition[] = [];
    if (input.config_key) {
      conditions.push({ field: 'config_key', operator: Operator.EQ, value: input.config_key });
    }
    if (input.start_time !== undefined) {
      conditions.push({ field: 'change_time', operator: Operator.GE, value: input.start_time });
    }
    if (input.end_time !== undefined) {
      conditions.push({ field: 'change_time', operator: Operator.LE, value: input.end_time });
    }
    const rows = await this.relationDb.select(CONFIG_HISTORY_TABLE, {
      conditions,
      order_by: [{ field: 'change_time', direction: 'DESC' }],
      page: { current: 1, size: input.limit && input.limit > 0 ? input.limit : 100 },
    });
    output.records = rows.map((row) => this.toHistoryRecord(row));
    return true;
  }

  /** 历史行 → 记录（数据处理；old/new 值经 JSON 反序列化还原） */
  private toHistoryRecord(row: Record<string, unknown>): ConfigHistoryRecord {
    return {
      id: String(row.id ?? ''),
      config_key: String(row.config_key ?? ''),
      old_value: this.parseHistoryValue(row.old_value),
      new_value: this.parseHistoryValue(row.new_value),
      change_time: Number(row.change_time ?? 0),
      operator: String(row.operator ?? ''),
    };
  }

  /** 历史值反序列化（数据处理；非 JSON 原文返回） */
  private parseHistoryValue(raw: unknown): unknown {
    if (raw === null || raw === undefined) {
      return null;
    }
    try {
      return JSON.parse(String(raw));
    } catch {
      return raw;
    }
  }

  /** 记录配置变更历史（逻辑控制；best-effort：失败不阻断配置写入，经 metrics 可见） */
  private async recordConfigHistory(configKey: string, oldValue: unknown, newValue: unknown, metrics?: Metrics): Promise<void> {
    try {
      const now = Date.now();
      await this.relationDb.insert(CONFIG_HISTORY_TABLE, [
        { field: 'id', value: this.generateId() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'config_key', value: configKey },
        { field: 'old_value', value: JSON.stringify(oldValue ?? null) },
        { field: 'new_value', value: JSON.stringify(newValue ?? null) },
        { field: 'change_time', value: now },
        { field: 'operator', value: 'user' },
      ]);
    } catch (err) {
      metrics?.warn?.('配置变更历史记录失败（不阻断配置写入）', {
        config_key: configKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // =========================================================================
  // configConfig (self-config)
  // =========================================================================

  async configConfig(input: ConfigConfigInput, output: ConfigConfigOutput, _context: ConfigContext, _metrics?: Metrics, _report?: Report,
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

  /**
   * 匹配 Base 层 Provider 模块名（config_key 前缀 `模块.key`）。
   * 命中返回模块名，否则返回 null。
   */
  private matchBaseProviderModule(configKey: string): string | null {
    const dot = configKey.indexOf('.');
    if (dot <= 0) return null;
    const module = configKey.slice(0, dot);
    return module in ConfigService.BASE_PROVIDER_CONFIG_TABLES ? module : null;
  }

  /**
   * 读取 Base 层 Provider 的配置项真实值。
   *
   * 直接读各 Provider 的 xxx_config 表（key 不带模块前缀），
   * 未写入时回退到静态定义中的 config_default。
   */
  private async readBaseProviderConfig(configKey: string, module: string): Promise<unknown> {
    const table = ConfigService.BASE_PROVIDER_CONFIG_TABLES[module];
    const key = configKey.slice(module.length + 1);
    const reg = this.registryMap.get(configKey);
    const type = (reg?.config_type ?? 'STRING').toUpperCase();
    const def = reg?.config_default;
    const svc = new BaseConfigService(this.relationDb, table);

    switch (type) {
      case 'BOOLEAN':
        return svc.getBoolean(key, def === true || def === 'true' || def === 1);
      case 'INT':
      case 'INTEGER':
        return svc.getInt(key, typeof def === 'number' ? def : 0);
      case 'DOUBLE':
      case 'FLOAT':
      case 'NUMBER':
        return svc.getDouble(key, typeof def === 'number' ? def : 0);
      default: {
        const raw = await svc.getString(key, def !== null && def !== undefined ? String(def) : undefined);
        return raw !== undefined ? raw : (def ?? null);
      }
    }
  }

  // ===== 修改后的方法（2026-09-22 方法长度拆分批次1）：163 行前缀 if/else 链按层拆分为
  // 「路由 → 分组读取」结构（原始单方法已删除，等价结构见 git 历史）：
  //   顺序保持不变：base provider → log → info_core → core(llm/mcp/skill/soul)
  //   → agent 层(planner/writer/evolutor/agent_*) → application 层(chat/self_learning/
  //   user_profile/visualization) → registry 默认值兜底。
  //   每组方法返回 ConfigValueMatch（matched=false 表示未命中，继续下一组）。
  /** 配置值读取结果（内部）：matched=false 表示本组不处理该配置键 */
  private static readonly NOT_MATCHED: ConfigValueMatch = { matched: false, value: null };

  private static matched(value: unknown): ConfigValueMatch {
    return { matched: true, value };
  }

  /** 读取配置当前值（逻辑控制；层间路由；写入历史时的 old 值来源） */
  private async getCurrentValue(configKey: string): Promise<unknown> {
    const baseModule = this.matchBaseProviderModule(configKey);
    if (baseModule) {
      return this.readBaseProviderConfig(configKey, baseModule);
    }
    const layered = await this.readLayeredConfigValue(configKey);
    if (layered.matched) {
      return layered.value;
    }
    const reg = this.registryMap.get(configKey);
    if (reg && reg.config_default !== undefined) {
      return reg.config_default;
    }
    return null;
  }

  /** 分层路由（逻辑控制）：log → info_core → core → agent → application，命中即返回 */
  private async readLayeredConfigValue(configKey: string): Promise<ConfigValueMatch> {
    const logValue = await this.readLogProviderValue(configKey);
    if (logValue.matched) return logValue;
    const infoValue = await this.readInfoCoreValue(configKey);
    if (infoValue.matched) return infoValue;
    const coreValue = await this.readCoreProviderValue(configKey);
    if (coreValue.matched) return coreValue;
    const agentValue = await this.readAgentLayerValue(configKey);
    if (agentValue.matched) return agentValue;
    return this.readApplicationLayerValue(configKey);
  }

  /** log_provider 配置读取（数据处理；configLog 出参按字段名提取） */
  private async readLogProviderValue(configKey: string): Promise<ConfigValueMatch> {
    if (!configKey.startsWith('log_provider.')) {
      return ConfigService.NOT_MATCHED;
    }
    const out = {} as ConfigLogOutput;
    await this.logAccess.configLog({} as ConfigLogInput, out, {} as LogContext);
    const cfg = (out.config ?? {}) as Record<string, unknown>;
    const field = configKey.split('.').pop() ?? '';
    return ConfigService.matched(field ? (cfg[field] ?? null) : null);
  }

  /** info_core 配置读取（数据处理；tag/summary/vector/context/config 五段） */
  private async readInfoCoreValue(configKey: string): Promise<ConfigValueMatch> {
    if (!configKey.startsWith('info_core.')) {
      return ConfigService.NOT_MATCHED;
    }
    if (configKey.startsWith('info_core.tag_config.')) {
      const out = new SoInfoTagConfigOutput();
      await this.infoCore.soInfoTagConfig({} as SoInfoTagConfigInput, out, {} as InfoCoreContext);
      return ConfigService.matched(this.extractConfigValue(out, 'tag_config', configKey));
    }
    if (configKey.startsWith('info_core.summary_config.')) {
      const out = new SoInfoSummaryConfigOutput();
      await this.infoCore.soInfoSummaryConfig({} as SoInfoSummaryConfigInput, out, {} as InfoCoreContext);
      return ConfigService.matched(this.extractConfigValue(out, 'summary_config', configKey));
    }
    if (configKey.startsWith('info_core.vector_config.')) {
      const out = new SoInfoVectorConfigOutput();
      await this.infoCore.soInfoVectorConfig({} as SoInfoVectorConfigInput, out, {} as InfoCoreContext);
      return ConfigService.matched(this.extractConfigValue(out, 'vector_config', configKey));
    }
    if (configKey.startsWith('info_core.context_config.')) {
      const out = new SoInfoContextConfigOutput();
      await this.infoCore.soInfoContextConfig({} as SoInfoContextConfigInput, out, {} as InfoCoreContext);
      return ConfigService.matched(this.extractConfigValue(out, 'context_config', configKey));
    }
    const out = new SoInfoConfigOutput();
    await this.infoCore.soInfoConfig({} as SoInfoConfigInput, out, {} as InfoCoreContext);
    return ConfigService.matched(this.extractConfigValue(out, 'config', configKey));
  }

  /** core 层路由（逻辑控制）：llm/mcp → skill → soul */
  private async readCoreProviderValue(configKey: string): Promise<ConfigValueMatch> {
    const llmMcp = await this.readLlmMcpCoreValue(configKey);
    if (llmMcp.matched) return llmMcp;
    const skill = await this.readSkillCoreValue(configKey);
    if (skill.matched) return skill;
    return this.readSoulCoreValue(configKey);
  }

  /** llm_core / mcp_core 配置读取（数据处理） */
  private async readLlmMcpCoreValue(configKey: string): Promise<ConfigValueMatch> {
    if (configKey.startsWith('llm_core.')) {
      const out = new ConfigLLMCoreOutput();
      await this.llmCore.configLLMCore({} as ConfigLLMCoreInput, out, {} as LLMCoreContext);
      return ConfigService.matched(this.extractConfigValue(out, 'llm_core', configKey));
    }
    if (configKey.startsWith('mcp_core.')) {
      const out = new ConfigMcpCoreOutput();
      await this.mcpCore.configMCPCore({} as ConfigMcpCoreInput, out, {} as McpCoreContext);
      return ConfigService.matched(this.extractConfigValue(out, 'mcp_core', configKey));
    }
    return ConfigService.NOT_MATCHED;
  }

  /** skill_core 配置读取（数据处理；opt_rule 走规则清单首条字段提取） */
  private async readSkillCoreValue(configKey: string): Promise<ConfigValueMatch> {
    const simple = configKey.startsWith('skill_core.regen_rate')
      || configKey.startsWith('skill_core.similarity_threshold')
      || configKey.startsWith(PROMPT_SLOTS.SKILL_MATCH);
    if (simple) {
      const out = new ConfigSkillCoreOutput();
      await this.skillCore.configSkillCore({} as ConfigSkillCoreInput, out, {} as SkillCoreContext);
      return ConfigService.matched(this.extractConfigValue(out, 'skill_core', configKey));
    }
    if (configKey.startsWith('skill_core.opt_rule')) {
      const out = new SoSkillRuleOutput();
      await this.skillCore.soSkillRule({} as SoSkillRuleInput, out, {} as SkillCoreContext);
      return ConfigService.matched(this.extractOptRuleField(configKey, 'skill_core.opt_rule.', out));
    }
    return ConfigService.NOT_MATCHED;
  }

  /** soul_core 配置读取（数据处理；opt_rule 走规则清单首条字段提取） */
  private async readSoulCoreValue(configKey: string): Promise<ConfigValueMatch> {
    const simple = configKey.startsWith('soul_core.regen_rate')
      || configKey.startsWith('soul_core.similarity_threshold')
      || configKey.startsWith(PROMPT_SLOTS.SOUL_MATCH)
      || configKey.startsWith('soul_core.llm_id');
    if (simple) {
      const out = new ConfigSoulCoreOutput();
      await this.soulCore.configSoulCore({} as ConfigSoulCoreInput, out, {} as SoulCoreContext);
      return ConfigService.matched(this.extractConfigValue(out, 'soul_core', configKey));
    }
    if (configKey.startsWith('soul_core.opt_rule')) {
      const out = new SoSoulRuleOutput();
      await this.soulCore.soSoulRule({} as SoSoulRuleInput, out, {} as SoulCoreContext);
      return ConfigService.matched(this.extractOptRuleField(configKey, 'soul_core.opt_rule.', out));
    }
    return ConfigService.NOT_MATCHED;
  }

  /** opt_rule 首条规则字段提取（数据处理；skill/soul 共用） */
  private extractOptRuleField(configKey: string, prefix: string, out: { list?: unknown[] }): unknown {
    const first = (out.list ?? [])[0];
    if (!first) return null;
    const key = configKey.slice(prefix.length);
    return (first as unknown as Record<string, unknown>)[key] ?? null;
  }

  /** agent 层路由（逻辑控制）：工作 Agent → 框架组件 */
  private async readAgentLayerValue(configKey: string): Promise<ConfigValueMatch> {
    const workAgent = await this.readWorkAgentValue(configKey);
    if (workAgent.matched) return workAgent;
    return this.readAgentFrameworkValue(configKey);
  }

  /** planner/writer/evolutor Agent 配置读取（数据处理；统一走 getConfigFromAccess） */
  private async readWorkAgentValue(configKey: string): Promise<ConfigValueMatch> {
    if (configKey.startsWith('planner_agent.')) {
      return ConfigService.matched(await this.getConfigFromAccess(
        configKey, 'planner_agent',
        (i: ConfigPlannerAgentInput, c: PlannerAgentContext, o: ConfigPlannerAgentOutput) => this.plannerAgent.configPlannerAgent(i, o, c),
      ));
    }
    if (configKey.startsWith('writer_agent.')) {
      return ConfigService.matched(await this.getConfigFromAccess(
        configKey, 'writer_agent',
        (i: ConfigWriterAgentInput, c: WriterAgentContext, o: ConfigWriterAgentOutput) => this.writerAgent.configWriterAgent(i, o, c),
      ));
    }
    if (configKey.startsWith('evolutor_agent.')) {
      return ConfigService.matched(await this.getConfigFromAccess(
        configKey, 'evolutor_agent',
        (i: ConfigEvolutorAgentInput, c: EvolutorAgentContext, o: ConfigEvolutorAgentOutput) => this.evolutorAgent.configEvolutorAgent(i, o, c),
      ));
    }
    return ConfigService.NOT_MATCHED;
  }

  /** agent_context/library/builder/execution/strategy 配置读取（数据处理） */
  private async readAgentFrameworkValue(configKey: string): Promise<ConfigValueMatch> {
    if (configKey.startsWith('agent_context.')) {
      const out = {} as AgentContextContext;
      await this.agentContext.configAgentContext({} as ConfigAgentContextInput, {} as ConfigAgentContextOutput, out);
      const field = configKey.split('.').pop() ?? '';
      return ConfigService.matched(field ? ((out as unknown as Record<string, unknown>)[field] ?? null) : null);
    }
    if (configKey.startsWith('agent_library.')) {
      return ConfigService.matched(await this.getConfigFromAccess(
        configKey, 'agent_library',
        (i: ConfigAgentLibraryInput, c: AgentLibraryContext, o: ConfigAgentLibraryOutput) => this.agentLibrary.configAgentLibrary(i, o, c),
      ));
    }
    if (configKey.startsWith('agent_builder.')) {
      return ConfigService.matched(await this.getConfigFromAccess(
        configKey, 'agent_builder',
        (i: ConfigAgentBuilderInput, c: AgentBuilderContext, o: ConfigAgentBuilderOutput) => this.agentBuilder.configAgentBuilder(i, o, c),
      ));
    }
    if (configKey.startsWith('agent_execution.')) {
      return ConfigService.matched(await this.getConfigFromAccess(
        configKey, 'agent_execution',
        (i: ConfigAgentExecutionInput, c: AgentExecutionContext, o: ConfigAgentExecutionOutput) => this.agentExecution.configAgentExecution(i, o, c),
      ));
    }
    if (configKey.startsWith('agent_strategy.')) {
      return ConfigService.matched(await this.getConfigFromAccess(
        configKey, 'agent_strategy',
        (i: ConfigAgentStrategyInput, c: AgentStrategyContext, o: ConfigAgentStrategyOutput) => this.agentStrategy.configAgentStrategy(i, o, c),
      ));
    }
    return ConfigService.NOT_MATCHED;
  }

  /** application 层路由（逻辑控制）：chat/self_learning/user_profile/visualization */
  private async readApplicationLayerValue(configKey: string): Promise<ConfigValueMatch> {
    if (configKey.startsWith('chat.')) {
      return ConfigService.matched(await this.getConfigFromAccess(
        configKey, 'chat',
        (i: ConfigChatInput, c: ChatContext, o: ConfigChatOutput) => this.chatAccess.configChat(i, o, c),
      ));
    }
    if (configKey.startsWith('self_learning.')) {
      return ConfigService.matched(await this.readSelfLearningValue(configKey));
    }
    if (configKey.startsWith('user_profile.')) {
      return ConfigService.matched(await this.getConfigFromAccess(
        configKey, 'user_profile',
        (i: ConfigUserProfileInput, c: UserProfileContext, o: ConfigUserProfileOutput) => this.userProfileAccess.configUserProfile(i, o, c),
      ));
    }
    if (configKey.startsWith('visualization.')) {
      return ConfigService.matched(await this.readVisualizationValue(configKey));
    }
    return ConfigService.NOT_MATCHED;
  }

  /** self_learning 配置读取（数据处理；定时任务 cron 由 CronProvider 统一管理，与定时任务展示页面同一时间源） */
  private async readSelfLearningValue(configKey: string): Promise<unknown> {
    if (configKey === 'self_learning.tag_aging_cron' || configKey === 'self_learning.orphan_tag_check_cron') {
      const taskName = configKey === 'self_learning.tag_aging_cron' ? 'tag_aging' : 'orphan_tag_check';
      const out = new GetCronTaskOutput();
      await this.cronAccess.soCronTask(Object.assign(new GetCronTaskInput(), { name: taskName }), out, new CronContext());
      return out.task ? out.task.cron : null;
    }
    return this.getConfigFromAccess(
      configKey, 'self_learning',
      (i: ConfigSelfLearningInput, c: SelfLearningContext, o: ConfigSelfLearningOutput) => this.selfLearningAccess.configSelfLearning(i, o, c),
    );
  }

  /** visualization 配置读取（数据处理） */
  private async readVisualizationValue(configKey: string): Promise<unknown> {
    const out = {} as VisualizationContext;
    await this.visualizationAccess.configVisualization({} as ConfigVisualizationInput, {} as ConfigVisualizationOutput, out);
    const cfg = ((out as unknown as Record<string, unknown>).config ?? {}) as Record<string, unknown>;
    if (configKey.startsWith('visualization.max_nodes_per_graph')) return cfg.max_nodes_per_graph ?? null;
    if (configKey.startsWith('visualization.default_message_summary_length')) return cfg.default_message_summary_length ?? null;
    if (configKey.startsWith('visualization.resolve_content_by_default')) return cfg.resolve_content_by_default === 1;
    return null;
  }

  private extractConfigValue(out: unknown, _prefix: string, _configKey: string): unknown {
    if (out && typeof out === 'object') {
      if ('config' in out && out.config !== undefined) return out.config;
      if ('value' in out) return out.value;
      return out;
    }
    return null;
  }

  private async getConfigFromAccess<I extends object, C extends object, O extends object>(
    _configKey: string,
    _prefix: string,
    fn: (input: I, context: C, output: O) => Promise<boolean>,
  ): Promise<unknown> {
    const out = {} as O;
    await fn({} as I, {} as C, out);
    return this.extractConfigValue(out, _prefix, _configKey);
  }

  // =========================================================================
  // routeUpdateConfig - routes update to correct lower-layer method
  // =========================================================================

  /**
   * 写入 Base 层 Provider 的配置项。
   *
   * - `enabled` 走 Provider 的 enableXxx 方法，保证运行时内存状态同步；
   * - 其余参数直接写各 Provider 的 xxx_config 表（这些参数均为运行时实时读取，写表即时生效）。
   */
  private async writeBaseProviderConfig(configKey: string, module: string, value: unknown): Promise<void> {
    const key = configKey.slice(module.length + 1);
    if (key === 'enabled') {
      await this.setProviderEnabled(module, value as boolean);
      return;
    }

    // 向量数据库距离度量变更需同步运行时组件（有向量数据时 applyMetric 抛错，阻止写入）
    if (module === 'vectordb_provider' && key === 'default_distance_metric') {
      await this.vectorDBAccess.applyMetric(value as string);
    }

    const table = ConfigService.BASE_PROVIDER_CONFIG_TABLES[module];
    const reg = this.registryMap.get(configKey);
    const type = (reg?.config_type ?? 'STRING').toUpperCase();
    const valueType =
      type.startsWith('BOOLEAN') ? 'BOOLEAN'
      : type.startsWith('INT') ? 'INT'
      : type.startsWith('DOUBLE') || type.startsWith('FLOAT') || type.startsWith('NUMBER') ? 'DOUBLE'
      : 'STRING';
    const svc = new BaseConfigService(this.relationDb, table);
    await svc.set(key, value, valueType);
  }

  /**
   * 调用对应 Provider 的 enable 方法切换组件启用状态。
   */
  private async setProviderEnabled(module: string, enable: boolean): Promise<void> {
    switch (module) {
      case 'llm_provider':
        await this.llmAccess.enableLLM({ enable } as EnableLLMInput, {} as EnableLLMOutput, {} as LLMContext);
        return;
      case 'soul_provider':
        await this.soulAccess.enableSoul({ enable } as EnableSoulInput, {} as EnableSoulOutput, {} as SoulContext);
        return;
      case 'skill_provider':
        await this.skillAccess.enableSkill({ enable } as EnableSkillInput, {} as EnableSkillOutput, {} as SkillContext);
        return;
      case 'mcp_provider':
        await this.mcpAccess.enableMCP({ enable } as EnableMCPInput, {} as EnableMCPOutput, {} as McpContext);
        return;
      case 'prompts_provider':
        await this.promptsAccess.enablePrompts({ enable } as EnablePromptsInput, {} as EnablePromptsOutput, {} as PromptContext);
        return;
      case 'mq_provider':
        await this.mqAccess.enableMQ({ enable } as EnableMQInput, {} as EnableMQOutput, {} as MQContext);
        return;
      case 'graphdb_provider':
        await this.graphDBAccess.enableGraphDB({ enable } as EnableGraphDBInput, {} as EnableGraphDBOutput, {} as GraphContext);
        return;
      case 'vectordb_provider':
        await this.vectorDBAccess.enableVectorDB({ enable } as EnableVectorDBInput, {} as EnableVectorDBOutput, {} as VectorContext);
        return;
      case 'relationdb_provider':
        await this.relationDb.enableDB({ enable } as EnableDBInput, {} as EnableDBOutput, {} as DBContext);
        return;
      default:
        throw new ValidationError(`未知 Base Provider 模块 ${module}`);
    }
  }

  /** 配置写入路由表：按匹配顺序分发到对应分组的写入处理器 */
  private readonly updateConfigRoutes: Array<[
    (prefix: string) => boolean,
    (prefix: string, value: unknown) => Promise<void>,
  ]> = [
    [(prefix) => prefix.startsWith('log_provider.'), (prefix, value) => this.writeLogProviderConfig(prefix, value)],
    [(prefix) => prefix.startsWith('llm_core.regen_rate') || prefix.startsWith('llm_core.similarity_threshold') || prefix.startsWith(PROMPT_SLOTS.LLM_MATCH), (prefix, value) => this.writeLLMCoreConfig(prefix, value)],
    [(prefix) => prefix.startsWith('llm_core.quota_'), (prefix, value) => this.writeLLMCoreQuotaConfig(prefix, value)],
    [(prefix) => prefix.startsWith('mcp_core.'), (prefix, value) => this.writeMCPCoreConfig(prefix, value)],
    [(prefix) => prefix.startsWith('skill_core.regen_rate') || prefix.startsWith('skill_core.similarity_threshold') || prefix.startsWith(PROMPT_SLOTS.SKILL_MATCH), (prefix, value) => this.writeSkillCoreConfig(prefix, value)],
    [(prefix) => prefix.startsWith('skill_core.opt_rule'), (prefix, value) => this.writeSkillOptRuleConfig(prefix, value)],
    [(prefix) => prefix.startsWith('soul_core.regen_rate') || prefix.startsWith('soul_core.similarity_threshold') || prefix.startsWith(PROMPT_SLOTS.SOUL_MATCH) || prefix.startsWith('soul_core.llm_id'), (prefix, value) => this.writeSoulCoreConfig(prefix, value)],
    [(prefix) => prefix.startsWith('soul_core.opt_rule'), (prefix, value) => this.writeSoulOptRuleConfig(prefix, value)],
    [(prefix) => prefix.startsWith('info_core.tag_config.'), (prefix, value) => this.writeInfoTagConfigConfig(prefix, value)],
    [(prefix) => prefix.startsWith('info_core.summary_config.'), (prefix, value) => this.writeInfoSummaryConfigConfig(prefix, value)],
    [(prefix) => prefix.startsWith('info_core.vector_config.'), (prefix, value) => this.writeInfoVectorConfigConfig(prefix, value)],
    [(prefix) => prefix.startsWith('info_core.context_config.'), (prefix, value) => this.writeInfoContextConfigConfig(prefix, value)],
    [(prefix) => prefix.startsWith('info_core.config.'), (prefix, value) => this.writeInfoCoreConfigConfig(prefix, value)],
    [(prefix) => prefix.startsWith('planner_agent.'), (prefix, value) => this.writePlannerAgentConfig(prefix, value)],
    [(prefix) => prefix.startsWith('writer_agent.'), (prefix, value) => this.writeWriterAgentConfig(prefix, value)],
    [(prefix) => prefix.startsWith('evolutor_agent.'), (prefix, value) => this.writeEvolutorAgentConfig(prefix, value)],
    [(prefix) => prefix.startsWith('agent_context.'), (prefix, value) => this.writeAgentContextConfig(prefix, value)],
    [(prefix) => prefix.startsWith('agent_library.'), (prefix, value) => this.writeAgentLibraryConfig(prefix, value)],
    [(prefix) => prefix.startsWith('agent_builder.'), (prefix, value) => this.writeAgentBuilderConfig(prefix, value)],
    [(prefix) => prefix.startsWith('agent_execution.'), (prefix, value) => this.writeAgentExecutionConfig(prefix, value)],
    [(prefix) => prefix.startsWith('agent_strategy.'), (prefix, value) => this.writeAgentStrategyConfig(prefix, value)],
    [(prefix) => prefix.startsWith('chat.'), (prefix, value) => this.writeChatConfig(prefix, value)],
    [(prefix) => prefix.startsWith('self_learning.'), (prefix, value) => this.writeSelfLearningConfig(prefix, value)],
    [(prefix) => prefix.startsWith('user_profile.'), (prefix, value) => this.writeUserProfileConfig(prefix, value)],
    [(prefix) => prefix.startsWith('visualization.'), (prefix, value) => this.writeVisualizationConfig(prefix, value)],
  ];

  /**
   * 配置写入路由：仅做前缀匹配与分发，字段映射在各 writeXxxConfig 处理器内。
   *
   * @param configKey 配置键
   * @param value 配置值
   * @throws ValidationError 当配置键未命中任何路由
   */
  private async routeUpdateConfig(configKey: string, value: unknown): Promise<void> {
    const baseModule = this.matchBaseProviderModule(configKey);
    if (baseModule) {
      await this.writeBaseProviderConfig(configKey, baseModule, value);
      return;
    }
    for (const [match, handle] of this.updateConfigRoutes) {
      if (match(configKey)) {
        await handle(configKey, value);
        return;
      }
    }
    throw new ValidationError(`配置项 ${configKey} 未实现修改路由`);
  }

  /**
   * 写入 `log_provider.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeLogProviderConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigLogInput;
      if (prefix.startsWith('log_provider.enabled')) input.enabled = value as boolean;
      else if (prefix.startsWith('log_provider.default_level')) input.default_level = value as string;
      else if (prefix.startsWith('log_provider.min_level')) input.min_level = value as string;
      else if (prefix.startsWith('log_provider.retention_days')) input.retention_days = value as number;
      else if (prefix.startsWith('log_provider.max_log_count')) input.max_log_count = value as number;
      const output = {} as ConfigLogOutput;
      await this.logAccess.configLog(input, output, {} as LogContext);
      return;
  }

  /**
   * 写入 `llm_core.regen_rate*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeLLMCoreConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigLLMCoreInput;
      if (prefix.startsWith('llm_core.regen_rate')) input.regen_rate = value as number;
      if (prefix.startsWith('llm_core.similarity_threshold')) input.similarity_threshold = value as number;
      if (prefix.startsWith(PROMPT_SLOTS.LLM_MATCH)) input.prompt_template_id = value as string;
      // 注意：此处第 3 参为 Context 位置（历史入参顺序如此，保持运行时行为不变）
      const output = {} as LLMCoreContext;
      await this.llmCore.configLLMCore(input, {} as ConfigLLMCoreOutput, output);
      return;
  }

  /**
   * 写入 `llm_core.quota_*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeLLMCoreQuotaConfig(prefix: string, value: unknown): Promise<void> {
      // 坑位警告：limitLLM 要求 llm_provider_id，此处历史传入 config_key/value 与真实入参不符（运行时行为保持原样，修复需改运行时代码，另行处理）
      const input = { config_key: prefix, value } as unknown as LimitLLMInput;
      const output = {} as LLMCoreContext;
      await this.llmCore.limitLLM(input, {} as LimitLLMOutput, output);
      return;
  }

  /**
   * 写入 `mcp_core.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeMCPCoreConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigMcpCoreInput;
      if (prefix.startsWith('mcp_core.regen_rate')) input.regen_rate = value as number;
      if (prefix.startsWith('mcp_core.similarity_threshold')) input.similarity_threshold = value as number;
      if (prefix.startsWith(PROMPT_SLOTS.MCP_MATCH)) input.prompt_template_id = value as string;
      const output = {} as McpCoreContext;
      await this.mcpCore.configMCPCore(input, {} as ConfigMcpCoreOutput, output);
      return;
  }

  /**
   * 写入 `skill_core.regen_rate*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeSkillCoreConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigSkillCoreInput;
      if (prefix.startsWith('skill_core.regen_rate')) input.regen_rate = value as number;
      if (prefix.startsWith('skill_core.similarity_threshold')) input.similarity_threshold = value as number;
      if (prefix.startsWith(PROMPT_SLOTS.SKILL_MATCH)) input.prompt_template_id = value as string;
      const output = {} as SkillCoreContext;
      await this.skillCore.configSkillCore(input, {} as ConfigSkillCoreOutput, output);
      return;
  }

  /**
   * 写入 `skill_core.opt_rule*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeSkillOptRuleConfig(prefix: string, value: unknown): Promise<void> {
      const key = prefix.split('skill_core.opt_rule.')[1];
      if (key) {
        const existing = await this.relationDb.selectOne('skill_opt_rule', []);
        const now = Date.now();
        if (existing) {
          await this.relationDb.update('skill_opt_rule', [
            { field: key, value: Number(value) },
            { field: 'updated', value: now },
          ], [{ field: 'id', operator: Operator.EQ, value: existing.id as string }]);
        } else {
          const { v4: uuidv4 } = await import('uuid');
          await this.relationDb.insert('skill_opt_rule', [
            { field: 'id', value: uuidv4() },
            { field: 'created', value: now },
            { field: 'updated', value: now },
            { field: 'days', value: key === 'days' ? Number(value) : 30 },
            { field: 'min_usage_count', value: key === 'min_usage_count' ? Number(value) : 5 },
          ]);
        }
      }
      return;
  }

  /**
   * 写入 `soul_core.regen_rate*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeSoulCoreConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigSoulCoreInput;
      if (prefix.startsWith('soul_core.regen_rate')) input.regen_rate = value as number;
      if (prefix.startsWith('soul_core.similarity_threshold')) input.similarity_threshold = value as number;
      if (prefix.startsWith(PROMPT_SLOTS.SOUL_MATCH)) input.prompt_template_id = value as string;
      if (prefix.startsWith('soul_core.llm_id')) input.llm_id = value as string;
      const output = {} as SoulCoreContext;
      await this.soulCore.configSoulCore(input, {} as ConfigSoulCoreOutput, output);
      return;
  }

  /**
   * 写入 `soul_core.opt_rule*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeSoulOptRuleConfig(prefix: string, value: unknown): Promise<void> {
      const key = prefix.split('soul_core.opt_rule.')[1];
      if (key) {
        const existing = await this.relationDb.selectOne('soul_opt_rule', []);
        const now = Date.now();
        if (existing) {
          await this.relationDb.update('soul_opt_rule', [
            { field: key, value: Number(value) },
            { field: 'updated', value: now },
          ], [{ field: 'id', operator: Operator.EQ, value: existing.id as string }]);
        } else {
          const { v4: uuidv4 } = await import('uuid');
          await this.relationDb.insert('soul_opt_rule', [
            { field: 'id', value: uuidv4() },
            { field: 'created', value: now },
            { field: 'updated', value: now },
            { field: 'days', value: key === 'days' ? Number(value) : 30 },
            { field: 'min_usage_count', value: key === 'min_usage_count' ? Number(value) : 5 },
          ]);
        }
      }
      return;
  }

  /**
   * 写入 `info_core.tag_config.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeInfoTagConfigConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as UpdateInfoTagConfigInput;
      if (prefix.startsWith('info_core.tag_config.llm_id')) input.llm_id = value as string;
      else if (prefix.startsWith(PROMPT_SLOTS.INFO_TAG)) input.prompt_template_id = value as string;
      else if (prefix.startsWith('info_core.tag_config.tag_top_k')) input.tag_top_k = Number(value);
      else if (prefix.startsWith('info_core.tag_config.enable')) input.enable = value ? 1 : 0;
      const output = {} as InfoCoreContext;
      await this.infoCore.updateInfoTagConfig(input, {} as UpdateInfoTagConfigOutput, output);
      return;
  }

  /**
   * 写入 `info_core.summary_config.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeInfoSummaryConfigConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as UpdateInfoSummaryConfigInput;
      if (prefix.startsWith('info_core.summary_config.llm_id')) input.llm_id = value as string;
      else if (prefix.startsWith(PROMPT_SLOTS.INFO_SUMMARY)) input.prompt_template_id = value as string;
      else if (prefix.startsWith('info_core.summary_config.enable')) input.enable = value ? 1 : 0;
      else if (prefix.startsWith('info_core.summary_config.threshold')) input.threshold = Number(value);
      else if (prefix.startsWith('info_core.summary_config.info_types')) input.info_types = value as string;
      const output = {} as InfoCoreContext;
      await this.infoCore.updateInfoSummaryConfig(input, {} as UpdateInfoSummaryConfigOutput, output);
      return;
  }

  /**
   * 写入 `info_core.vector_config.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeInfoVectorConfigConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as UpdateInfoVectorConfigInput;
      if (prefix.startsWith('info_core.vector_config.llm_id')) input.llm_id = value as string;
      else if (prefix.startsWith('info_core.vector_config.dimension')) input.dimension = Number(value);
      else if (prefix.startsWith('info_core.vector_config.enable')) input.enable = value ? 1 : 0;
      const output = {} as InfoCoreContext;
      await this.infoCore.updateInfoVectorConfig(input, {} as UpdateInfoVectorConfigOutput, output);
      return;
  }

  /**
   * 写入 `info_core.context_config.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeInfoContextConfigConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as UpdateInfoContextConfigInput;
      if (prefix.startsWith('info_core.context_config.base_timeline_count')) input.base_timeline_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.base_tag_relative_count')) input.base_tag_relative_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.base_similarity_count')) input.base_similarity_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.base_keyword_count')) input.base_keyword_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.base_random_count')) input.base_random_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.random_max_percent')) input.random_max_percent = Number(value);
      else if (prefix.startsWith('info_core.context_config.total')) input.total = Number(value);
      else if (prefix.startsWith('info_core.context_config.enable_snapshot_persistence')) input.enable_snapshot_persistence = value ? 1 : 0;
      else if (prefix.startsWith('info_core.context_config.priority_order')) input.priority_order = String(value);
      const output = {} as InfoCoreContext;
      await this.infoCore.updateInfoContextConfig(input, {} as UpdateInfoContextConfigOutput, output);
      return;
  }

  /**
   * 写入 `info_core.config.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeInfoCoreConfigConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as UpdateInfoConfigInput;
      if (prefix.startsWith('info_core.config.alive_max_days')) input.alive_max_days = Number(value);
      const output = {} as InfoCoreContext;
      await this.infoCore.updateInfoConfig(input, {} as UpdateInfoConfigOutput, output);
      return;
  }

  /**
   * 写入 `planner_agent.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writePlannerAgentConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigPlannerAgentInput;
      if (prefix.startsWith('planner_agent.complexity_decompose_threshold')) input.complexity_decompose_threshold = value as number;
      else if (prefix.startsWith(PROMPT_SLOTS.PLAN)) input.plan_prompt_template_id = value as string;
      else if (prefix.startsWith('planner_agent.max_subtask_count')) input.max_subtask_count = value as number;
      else if (prefix.startsWith('planner_agent.llm_id')) input.llm_id = value as string;
      const output = {} as PlannerAgentContext;
      await this.plannerAgent.configPlannerAgent(input, {} as ConfigPlannerAgentOutput, output);
      return;
  }

  /**
   * 写入 `writer_agent.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeWriterAgentConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigWriterAgentInput;
      if (prefix.startsWith(PROMPT_SLOTS.WRITE)) input.write_prompt_template_id = value as string;
      else if (prefix.startsWith('writer_agent.llm_id')) input.llm_id = value as string;
      else if (prefix.startsWith('writer_agent.default_language')) input.default_language = value as string;
      else if (prefix.startsWith('writer_agent.default_style')) input.default_style = value as string;
      else if (prefix.startsWith('writer_agent.default_depth')) input.default_depth = value as string;
      else if (prefix.startsWith('writer_agent.default_format')) input.default_format = value as string;
      const output = {} as WriterAgentContext;
      await this.writerAgent.configWriterAgent(input, {} as ConfigWriterAgentOutput, output);
      return;
  }

  /**
   * 写入 `evolutor_agent.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeEvolutorAgentConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigEvolutorAgentInput;
      if (prefix.startsWith(PROMPT_SLOTS.EVAL_WORK)) input.eval_work_prompt_template_id = value as string;
      else if (prefix.startsWith(PROMPT_SLOTS.EVAL_WRITE)) input.eval_write_prompt_template_id = value as string;
      else if (prefix.startsWith('evolutor_agent.optimize_threshold')) input.optimize_threshold = value as number;
      else if (prefix.startsWith('evolutor_agent.eval_frequency_threshold')) input.eval_frequency_threshold = value as number;
      else if (prefix.startsWith('evolutor_agent.eval_schedule_interval_ms')) input.eval_schedule_interval_ms = value as number;
      else if (prefix.startsWith('evolutor_agent.eval_batch_size')) input.eval_batch_size = value as number;
      else if (prefix.startsWith('evolutor_agent.llm_id')) input.llm_id = value as string;
      const output = {} as EvolutorAgentContext;
      await this.evolutorAgent.configEvolutorAgent(input, {} as ConfigEvolutorAgentOutput, output);
      return;
  }

  /**
   * 写入 `agent_context.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeAgentContextConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigAgentContextInput;
      if (prefix.startsWith('agent_context.max_context_items')) input.max_context_items = value as number;
      else if (prefix.startsWith('agent_context.enable_snapshot_persistence')) input.enable_snapshot_persistence = value as boolean;
      const output = {} as AgentContextContext;
      await this.agentContext.configAgentContext(input, {} as ConfigAgentContextOutput, output);
      return;
  }

  /**
   * 写入 `agent_library.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeAgentLibraryConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigAgentLibraryInput;
      if (prefix.startsWith('agent_library.regen_rate')) input.regen_rate = value as number;
      else if (prefix.startsWith('agent_library.similarity_threshold')) input.similarity_threshold = value as number;
      else if (prefix.startsWith(PROMPT_SLOTS.AGENT_MATCH)) input.prompt_template_id = value as string;
      else if (prefix.startsWith('agent_library.max_agent_count')) input.max_agent_count = value as number;
      const output = {} as AgentLibraryContext;
      await this.agentLibrary.configAgentLibrary(input, {} as ConfigAgentLibraryOutput, output);
      return;
  }

  /**
   * 写入 `agent_builder.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeAgentBuilderConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigAgentBuilderInput;
      if (prefix.startsWith(PROMPT_SLOTS.TASK_ANALYSIS)) input.task_analysis_prompt_template_id = value as string;
      else if (prefix.startsWith('agent_builder.auto_optimize')) input.auto_optimize = value as boolean;
      const output = {} as AgentBuilderContext;
      await this.agentBuilder.configAgentBuilder(input, {} as ConfigAgentBuilderOutput, output);
      return;
  }

  /**
   * 写入 `agent_execution.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeAgentExecutionConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigAgentExecutionInput;
      if (prefix.startsWith(PROMPT_SLOTS.THINK)) input.think_prompt_template_id = value as string;
      else if (prefix.startsWith(PROMPT_SLOTS.REFLECT)) input.reflect_prompt_template_id = value as string;
      else if (prefix.startsWith(PROMPT_SLOTS.ANSWER)) input.answer_prompt_template_id = value as string;
      else if (prefix.startsWith('agent_execution.default_max_iterations')) input.default_max_iterations = value as number;
      else if (prefix.startsWith('agent_execution.async_worker_interval')) input.async_worker_interval = value as number;
      const output = {} as AgentExecutionContext;
      await this.agentExecution.configAgentExecution(input, {} as ConfigAgentExecutionOutput, output);
      return;
  }

  /**
   * 写入 `agent_strategy.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeAgentStrategyConfig(prefix: string, value: unknown): Promise<void> {
      // 坑位警告：configAgentStrategy 入参为 default_strategy_id/match_prompt_template_id，此处历史传入 config_key/value 为结构兼容但语义不匹配（运行时行为保持原样，修复需改运行时代码，另行处理）
      const input = { config_key: prefix, value } as ConfigAgentStrategyInput;
      const output = {} as AgentStrategyContext;
      await this.agentStrategy.configAgentStrategy(input, {} as ConfigAgentStrategyOutput, output);
      return;
  }

  /**
   * 写入 `orchestration.entry*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  /**
   * 写入 `orchestration.strategy*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  /**
   * 写入 `orchestration.execution*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  /**
   * 写入 `orchestration.visualization*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  /**
   * 写入 `orchestration.jsonnode*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  /**
   * 写入 `chat.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeChatConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigChatInput;
      if (prefix.startsWith('chat.max_messages_per_session')) input.max_messages_per_session = Number(value);
      else if (prefix.startsWith('chat.sse_heartbeat_interval_ms')) input.sse_heartbeat_interval_ms = Number(value);
      else if (prefix.startsWith('chat.default_history_lastN')) input.default_history_lastN = Number(value);
      const output = {} as ChatContext;
      await this.chatAccess.configChat(input, {} as ConfigChatOutput, output);
      return;
  }

  /**
   * 写入 `self_learning.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeSelfLearningConfig(prefix: string, value: unknown): Promise<void> {
      // 定时任务 cron 写入 CronProvider（与定时任务展示页面同一时间源）
      if (prefix === 'self_learning.tag_aging_cron' || prefix === 'self_learning.orphan_tag_check_cron') {
        const taskName = prefix === 'self_learning.tag_aging_cron' ? 'tag_aging' : 'orphan_tag_check';
        await this.cronAccess.setCronTask(Object.assign(new SetCronTaskInput(), { name: taskName, cron: value as string }), new SetCronTaskOutput(), new CronContext());
        return;
      }
      const input = {} as ConfigSelfLearningInput;
      if (prefix.startsWith('self_learning.random_factor')) input.random_factor = Number(value);
      else if (prefix.startsWith('self_learning.document_weight')) input.document_weight = Number(value);
      else if (prefix.startsWith('self_learning.conversation_weight')) input.conversation_weight = Number(value);
      else if (prefix.startsWith('self_learning.tag_maintenance_weight')) input.tag_maintenance_weight = Number(value);
      else if (prefix.startsWith('self_learning.learning_interval_ms')) input.learning_interval_ms = Number(value);
      else if (prefix.startsWith('self_learning.default_learning_rate')) input.default_learning_rate = Number(value);
      else if (prefix.startsWith('self_learning.tag_connection_check_interval_ms')) input.tag_connection_check_interval_ms = Number(value);
      else if (prefix.startsWith('self_learning.tag_aging_cron')) input.tag_aging_cron = value as string;
      else if (prefix.startsWith('self_learning.orphan_tag_check_cron')) input.orphan_tag_check_cron = value as string;
      else if (prefix.startsWith('self_learning.document_split_threshold')) input.document_split_threshold = Number(value);
      else if (prefix.startsWith('self_learning.chunk_overlap_ratio')) input.chunk_overlap_ratio = Number(value);
      else if (prefix.startsWith(PROMPT_SLOTS.DOCUMENT_QUERY)) input.document_query_prompt_template_id = value as string;
      else if (prefix.startsWith('self_learning.document_query_llm_id')) input.document_query_llm_id = value as string;
      const output = {} as SelfLearningContext;
      await this.selfLearningAccess.configSelfLearning(input, {} as ConfigSelfLearningOutput, output);
      return;
  }

  /**
   * 写入 `user_profile.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeUserProfileConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigUserProfileInput;
      if (prefix.startsWith('user_profile.auto_generate_interval_ms')) input.auto_generate_interval_ms = Number(value);
      else if (prefix.startsWith(PROMPT_SLOTS.PROFILE_ANALYSIS)) input.profile_analysis_prompt_template_id = value as string;
      else if (prefix.startsWith('user_profile.max_conversation_sample_count')) input.max_conversation_sample_count = Number(value);
      else if (prefix.startsWith('user_profile.profile_retention_versions')) input.profile_retention_versions = Number(value);
      else if (prefix.startsWith('user_profile.min_confidence_threshold')) input.min_confidence_threshold = Number(value);
      const output = {} as UserProfileContext;
      await this.userProfileAccess.configUserProfile(input, {} as ConfigUserProfileOutput, output);
      return;
  }

  /**
   * 写入 `visualization.*` 配置分组（由 routeUpdateConfig 路由表调用）。
   *
   * @param prefix 配置键
   * @param value 配置值
   */
  private async writeVisualizationConfig(prefix: string, value: unknown): Promise<void> {
      const input = {} as ConfigVisualizationInput;
      if (prefix.startsWith('visualization.max_nodes_per_graph')) input.max_nodes_per_graph = value as number;
      else if (prefix.startsWith('visualization.default_message_summary_length')) input.default_message_summary_length = value as number;
      else if (prefix.startsWith('visualization.resolve_content_by_default')) input.resolve_content_by_default = value as boolean;
      const output = {} as VisualizationContext;
      await this.visualizationAccess.configVisualization(input, {} as ConfigVisualizationOutput, output);
      return;
  }


  // =========================================================================
  // LLM Proxy methods
  // =========================================================================

  async addLLMProviderProxy(input: AddLLMProviderInput, output: AddLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.addLLMProvider(input, output, context, metrics, report);
  }

  async updateLLMProviderProxy(input: UpdateLLMProviderInput, output: UpdateLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.updateLLMProvider(input, output, context, metrics, report);
  }

  async delLLMProviderProxy(input: DelLLMProviderInput, output: DelLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.delLLMProvider(input, output, context, metrics, report);
  }

  async soLLMProviderProxy(input: SoLLMProviderInput, output: SoLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.soLLMProvider(input, output, context, metrics, report);
  }

  async testLLMProviderProxy(input: TestLLMProviderInput, output: TestLLMProviderOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.testLLMProvider(input, output, context, metrics, report);
  }

  async listLLMProxy(input: ListLLMInput, output: ListLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.listLLM(input, output, context, metrics, report);
  }

  async addLLMProxy(input: AddLLMInput, output: AddLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.addLLM(input, output, context, metrics, report);
  }

  async updateLLMProxy(input: UpdateLLMInput, output: UpdateLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.updateLLM(input, output, context, metrics, report);
  }

  async delLLMProxy(input: DelLLMInput, output: DelLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.delLLM(input, output, context, metrics, report);
  }

  async soLLMProxy(input: SoLLMInput, output: SoLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.soLLM(input, output, context, metrics, report);
  }

  async getLLMProxy(input: GetLLMInput, output: GetLLMOutput, context: LLMContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.llmAccess.soLLMById(input, output, context, metrics, report);
  }

  // =========================================================================
  // Soul Proxy methods
  // =========================================================================

  async addSoulProxy(input: AddSoulInput, output: AddSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.soulAccess.addSoul(input, output, context, metrics, report);
  }

  async updateSoulProxy(input: UpdateSoulInput, output: UpdateSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.soulAccess.updateSoul(input, output, context, metrics, report);
  }

  async delSoulProxy(input: DelSoulInput, output: DelSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.soulAccess.delSoul(input, output, context, metrics, report);
  }

  async soSoulProxy(input: SoSoulInput, output: SoSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.soulAccess.soSoul(input, output, context, metrics, report);
  }

  async getSoulProxy(input: GetSoulInput, output: GetSoulOutput, context: SoulContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.soulAccess.soSoulById(input, output, context, metrics, report);
  }

  async getSoulRuleProxy(input: SoSoulRuleInput, output: SoSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.soulCore.soSoulRule(input, output, context, metrics, report);
  }

  async updateSoulRuleProxy(input: UpdateSoulRuleInput, output: UpdateSoulRuleOutput, context: SoulCoreContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.soulCore.updateSoulRule(input, output, context, metrics, report);
  }

  // =========================================================================
  // Skill Proxy methods
  // =========================================================================

  async addSkillProxy(input: AddSkillInput, output: AddSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.skillAccess.addSkill(input, output, context, metrics, report);
  }

  async updateSkillProxy(input: UpdateSkillInput, output: UpdateSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.skillAccess.updateSkill(input, output, context, metrics, report);
  }

  async delSkillProxy(input: DelSkillInput, output: DelSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.skillAccess.delSkill(input, output, context, metrics, report);
  }

  async soSkillProxy(input: SoSkillInput, output: SoSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.skillAccess.soSkill(input, output, context, metrics, report);
  }

  async execSkillProxy(input: ExecSkillInput, output: ExecSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.skillAccess.execSkill(input, output, context, metrics, report);
  }

  async getSkillProxy(input: GetSkillInput, output: GetSkillOutput, context: SkillContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.skillAccess.soSkillById(input, output, context, metrics, report);
  }

  async getSkillRuleProxy(input: SoSkillRuleInput, output: SoSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.skillCore.soSkillRule(input, output, context, metrics, report);
  }

  async updateSkillRuleProxy(input: UpdateSkillRuleInput, output: UpdateSkillRuleOutput, context: SkillCoreContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.skillCore.updateSkillRule(input, output, context, metrics, report);
  }

  // =========================================================================
  // MCP Proxy methods
  // =========================================================================

  async addMcpProviderProxy(input: AddMcpProviderInput, output: AddMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.addMcpProvider(input, output, context, metrics, report);
  }

  async updateMcpProviderProxy(input: UpdateMcpProviderInput, output: UpdateMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.updateMcpProvider(input, output, context, metrics, report);
  }

  async delMcpProviderProxy(input: DelMcpProviderInput, output: DelMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.delMcpProvider(input, output, context, metrics, report);
  }

  async soMcpProviderProxy(input: SoMcpProviderInput, output: SoMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.soMcpProvider(input, output, context, metrics, report);
  }

  async testMcpProviderProxy(input: TestMcpProviderInput, output: TestMcpProviderOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.testMcpProvider(input, output, context, metrics, report);
  }

  async listMcpProxy(input: ListMcpInput, output: ListMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.listMcp(input, output, context, metrics, report);
  }

  async installMcpProxy(input: InstallMcpInput, output: InstallMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.installMcp(input, output, context, metrics, report);
  }

  async startMcpProxy(input: StartMcpInput, output: StartMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.startMcp(input, output, context, metrics, report);
  }

  async stopMcpProxy(input: StopMcpInput, output: StopMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.stopMcp(input, output, context, metrics, report);
  }

  async uninstallMcpProxy(input: UninstallMcpInput, output: UninstallMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.uninstallMcp(input, output, context, metrics, report);
  }

  async updateMcpProxy(input: UpdateMcpInput, output: UpdateMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.updateMcp(input, output, context, metrics, report);
  }

  async getMcpProxy(input: GetMcpInput, output: GetMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.soMcpById(input, output, context, metrics, report);
  }

  async soMcpProxy(input: SoMcpInput, output: SoMcpOutput, context: McpContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.mcpAccess.soMcp(input, output, context, metrics, report);
  }

  // =========================================================================
  // Prompt Proxy methods
  // =========================================================================

  async addPromptProxy(input: AddPromptInput, output: AddPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.promptsAccess.addPrompt(input, output, context, metrics, report);
  }

  async updatePromptProxy(input: UpdatePromptInput, output: UpdatePromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.promptsAccess.updatePrompt(input, output, context, metrics, report);
  }

  async delPromptProxy(input: DelPromptInput, output: DelPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.promptsAccess.delPrompt(input, output, context, metrics, report);
  }

  async soPromptProxy(input: SoPromptInput, output: SoPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.promptsAccess.soPrompt(input, output, context, metrics, report);
  }

  async getPromptProxy(input: GetPromptInput, output: GetPromptOutput, context: PromptContext, metrics?: Metrics, report?: Report): Promise<boolean> {
    return this.promptsAccess.soPromptById(input, output, context, metrics, report);
  }
}
