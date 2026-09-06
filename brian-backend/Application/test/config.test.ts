import { Metrics, Report } from '@brian-agent/base';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RelationDBAccess, ValidationError, NotFoundError } from '@brian-agent/base';
import { ConfigService } from '../Config/application/ConfigService';
import { ConfigSchemaInitializer } from '../Config/infrastructure/ConfigSchemaInitializer';
import { ConfigContext, UpdateLayerPrivilegeInput, UpdateLayerPrivilegeOutput,
  UpdateModulePrivilegeInput, UpdateModulePrivilegeOutput, GetConfigDetailInput, GetConfigDetailOutput,
  GetConfigItemInput, GetConfigItemOutput, UpdateConfigInput, UpdateConfigOutput,
  ConfigConfigInput, ConfigConfigOutput,
  GetWorkConfigsInput, GetWorkConfigsOutput, UpdateWorkConfigInput, UpdateWorkConfigOutput,
  DeleteWorkConfigInput, DeleteWorkConfigOutput,
} from '../Config/domain/types';
import { setupRealTestEnvironment, cleanupTempDirs, type RealTestContext } from './real-test-helpers';

describe('ConfigService', () => {
  let db: RelationDBAccess;
  let llmAccess: any, soulAccess: any, skillAccess: any, mcpAccess: any, promptsAccess: any, logAccess: any;
  let mqAccess: any, graphDBAccess: any, vectorDBAccess: any;
  let llmCore: any, infoCore: any, mcpCore: any, skillCore: any, soulCore: any;
  let writerAgent: any, evolutorAgent: any, plannerAgent: any, agentLibrary: any, agentBuilder: any, agentExecution: any, agentStrategy: any, agentContext: any;
  let orchestrationEntry: any, orchestrationStrategy: any, orchestrationExecution: any, orchestrationVisualization: any, jsonNode: any;
  let chatAccess: any, selfLearningAccess: any, userProfileAccess: any, visualizationAccess: any;
  let logger: any;
  let service: ConfigService;
  let realCtx: RealTestContext;

  function ctx(): ConfigContext { return new ConfigContext(); }

  beforeEach(async () => {
    realCtx = await setupRealTestEnvironment();
    db = realCtx.relationDb;
    llmAccess = realCtx.llmAccess;
    soulAccess = realCtx.soulAccess;
    skillAccess = realCtx.skillAccess;
    mcpAccess = realCtx.mcpAccess;
    promptsAccess = realCtx.promptsAccess;
    logAccess = realCtx.logAccess;
    mqAccess = realCtx.mqAccess;
    graphDBAccess = realCtx.graphDBAccess;
    vectorDBAccess = realCtx.vectorDbAccess;
    llmCore = realCtx.llmCore;
    infoCore = realCtx.infoCore;
    mcpCore = realCtx.mcpCore;
    skillCore = realCtx.skillCore;
    soulCore = realCtx.soulCore;
    writerAgent = realCtx.writerAgent;
    evolutorAgent = realCtx.evolutorAgent;
    plannerAgent = realCtx.plannerAgent;
    agentLibrary = realCtx.agentLibrary;
    agentBuilder = realCtx.agentBuilder;
    agentExecution = realCtx.agentExecution;
    agentStrategy = realCtx.agentStrategy;
    agentContext = realCtx.agentContext;
    orchestrationEntry = realCtx.orchestrationEntry;
    orchestrationStrategy = realCtx.orchestrationStrategy;
    orchestrationExecution = realCtx.orchestrationExecution;
    orchestrationVisualization = realCtx.orchestrationVisualization;
    jsonNode = realCtx.jsonNode;
    logger = realCtx.logger;
    chatAccess = {
      configChat: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.config = {};
        return true;
      }),
    } as any;
    selfLearningAccess = {
      configSelfLearning: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.config = {};
        return true;
      }),
    } as any;
    userProfileAccess = {
      configUserProfile: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.config = {};
        return true;
      }),
    } as any;
    visualizationAccess = {
      configVisualization: vi.fn().mockImplementation(async (_i: any, o: any, _c: any, ) => {
        o.config = {};
        return true;
      }),
    } as any;
    new ConfigSchemaInitializer(db).init();
    service = new ConfigService(db, llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
      logAccess,
      mqAccess, graphDBAccess, vectorDBAccess,
      llmCore, infoCore, mcpCore, skillCore, soulCore,
      writerAgent, evolutorAgent, plannerAgent, agentLibrary, agentBuilder, agentExecution, agentStrategy, agentContext,
      orchestrationEntry, orchestrationStrategy, orchestrationExecution, orchestrationVisualization, jsonNode,
      chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess);
  });

  afterEach(() => {
    cleanupTempDirs();
    vi.restoreAllMocks();
  });

  // =====================================================================
  // updateLayerPrivilege
  // =====================================================================

  describe('updateLayerPrivilege', () => {
    it('TC-CFG-020: Set layer unreadable', async () => {
      const input = new UpdateLayerPrivilegeInput();
      input.layer = 'BASE';
      input.readable = false;
      const output = new UpdateLayerPrivilegeOutput();
      const result = await service.updateLayerPrivilege(input, output, ctx());
      expect(result).toBe(true);
      expect(output.privilege).toBeDefined();
      expect(output.privilege.layer).toBe('BASE');
      expect(output.privilege.readable).toBe(false);
    });

    it('TC-CFG-021: Set layer unwritable', async () => {
      const input = new UpdateLayerPrivilegeInput();
      input.layer = 'BASE';
      input.writable = false;
      const output = new UpdateLayerPrivilegeOutput();
      await service.updateLayerPrivilege(input, output, ctx());
      expect(output.privilege.writable).toBe(false);
    });

    it('TC-CFG-022: Both readable=false and writable=false', async () => {
      const input = new UpdateLayerPrivilegeInput();
      input.layer = 'CORE';
      input.readable = false;
      input.writable = false;
      const output = new UpdateLayerPrivilegeOutput();
      await service.updateLayerPrivilege(input, output, ctx());
      expect(output.privilege.readable).toBe(false);
      expect(output.privilege.writable).toBe(false);
    });

    it('TC-CFG-023: Restore readability', async () => {
      const disableInput = new UpdateLayerPrivilegeInput();
      disableInput.layer = 'CORE';
      disableInput.readable = false;
      await service.updateLayerPrivilege(disableInput, ctx(), new UpdateLayerPrivilegeOutput());

      const restoreInput = new UpdateLayerPrivilegeInput();
      restoreInput.layer = 'CORE';
      restoreInput.readable = true;
      const restoreOut = new UpdateLayerPrivilegeOutput();
      await service.updateLayerPrivilege(restoreInput, restoreOut, ctx());
      expect(restoreOut.privilege.readable).toBe(true);
    });

    it('TC-CFG-024: Invalid layer throws ValidationError', async () => {
      const input = new UpdateLayerPrivilegeInput();
      input.layer = 'INVALID';
      const output = new UpdateLayerPrivilegeOutput();
      await expect(service.updateLayerPrivilege(input, output, ctx())).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-025: Upsert same layer twice — second succeeds', async () => {
      const input1 = new UpdateLayerPrivilegeInput();
      input1.layer = 'AGENT';
      input1.readable = false;
      await service.updateLayerPrivilege(input1, ctx(), new UpdateLayerPrivilegeOutput());

      const input2 = new UpdateLayerPrivilegeInput();
      input2.layer = 'AGENT';
      input2.writable = false;
      const out2 = new UpdateLayerPrivilegeOutput();
      await service.updateLayerPrivilege(input2, out2, ctx());
      expect(out2.privilege.readable).toBe(false);
      expect(out2.privilege.writable).toBe(false);
    });

    it('TC-CFG-026: Partial update (only readable) — writable unchanged', async () => {
      const setupInput = new UpdateLayerPrivilegeInput();
      setupInput.layer = 'ORCHESTRATION';
      setupInput.writable = false;
      await service.updateLayerPrivilege(setupInput, ctx(), new UpdateLayerPrivilegeOutput());

      const input = new UpdateLayerPrivilegeInput();
      input.layer = 'ORCHESTRATION';
      input.readable = false;
      const output = new UpdateLayerPrivilegeOutput();
      await service.updateLayerPrivilege(input, output, ctx());
      expect(output.privilege.readable).toBe(false);
      expect(output.privilege.writable).toBe(false);
    });
  });

  // =====================================================================
  // updateModulePrivilege
  // =====================================================================

  describe('updateModulePrivilege', () => {
    it('TC-CFG-030: Set module unreadable', async () => {
      const input = new UpdateModulePrivilegeInput();
      input.module = 'test_mod_030';
      input.readable = false;
      const output = new UpdateModulePrivilegeOutput();
      const result = await service.updateModulePrivilege(input, output, ctx());
      expect(result).toBe(true);
      expect(output.privilege.module).toBe('test_mod_030');
      expect(output.privilege.readable).toBe(false);
    });

    it('TC-CFG-031: Set module unwritable', async () => {
      const input = new UpdateModulePrivilegeInput();
      input.module = 'test_mod_031';
      input.writable = false;
      const output = new UpdateModulePrivilegeOutput();
      await service.updateModulePrivilege(input, output, ctx());
      expect(output.privilege.writable).toBe(false);
    });

    it('TC-CFG-032: Layer restricts, module readable=true rejected', async () => {
      const layerInput = new UpdateLayerPrivilegeInput();
      layerInput.layer = 'APPLICATION';
      layerInput.readable = false;
      await service.updateLayerPrivilege(layerInput, ctx(), new UpdateLayerPrivilegeOutput());

      const modInput = new UpdateModulePrivilegeInput();
      modInput.module = 'test_mod_032';
      modInput.readable = true;
      const output = new UpdateModulePrivilegeOutput();
      await expect(service.updateModulePrivilege(modInput, output, ctx())).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-033: Layer restricts, module writable=true rejected', async () => {
      const layerInput = new UpdateLayerPrivilegeInput();
      layerInput.layer = 'APPLICATION';
      layerInput.writable = false;
      await service.updateLayerPrivilege(layerInput, ctx(), new UpdateLayerPrivilegeOutput());

      const modInput = new UpdateModulePrivilegeInput();
      modInput.module = 'test_mod_033';
      modInput.writable = true;
      const output = new UpdateModulePrivilegeOutput();
      await expect(service.updateModulePrivilege(modInput, output, ctx())).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-035: Upsert same module twice', async () => {
      const input1 = new UpdateModulePrivilegeInput();
      input1.module = 'test_mod_035';
      input1.readable = false;
      await service.updateModulePrivilege(input1, ctx(), new UpdateModulePrivilegeOutput());

      const input2 = new UpdateModulePrivilegeInput();
      input2.module = 'test_mod_035';
      input2.writable = false;
      const out2 = new UpdateModulePrivilegeOutput();
      await service.updateModulePrivilege(input2, out2, ctx());
      expect(out2.privilege.readable).toBe(false);
      expect(out2.privilege.writable).toBe(false);
    });

    it('TC-CFG-036: Unknown module — still allows pre-set', async () => {
      const input = new UpdateModulePrivilegeInput();
      input.module = 'unknown_module_036';
      input.readable = false;
      input.writable = false;
      const output = new UpdateModulePrivilegeOutput();
      const result = await service.updateModulePrivilege(input, output, ctx());
      expect(result).toBe(true);
      expect(output.privilege.module).toBe('unknown_module_036');
      expect(output.privilege.readable).toBe(false);
      expect(output.privilege.writable).toBe(false);
      expect(output.privilege.layer).toBe('APPLICATION');
    });
  });

  // =====================================================================
  // soConfigDetail
  // =====================================================================

  describe('soConfigDetail', () => {
    it('TC-CFG-060: Get full config detail returns layers→modules→categories→configs', async () => {
      const input = new GetConfigDetailInput();
      const output = new GetConfigDetailOutput();
      const result = await service.soConfigDetail(input, output, ctx());
      expect(result).toBe(true);
      expect(Array.isArray(output.layers)).toBe(true);

      const orchLayer = output.layers.find((l: any) => l.layer === 'ORCHESTRATION');
      expect(orchLayer).toBeDefined();
      expect(Array.isArray(orchLayer!.modules)).toBe(true);

      const mod = (orchLayer!.modules as any[]).find((m: any) => m.module === 'entry');
      expect(mod).toBeDefined();
      expect(Array.isArray(mod.categories)).toBe(true);

      const cat = (mod.categories as any[]).find((c: any) => c.category === 'basic');
      expect(cat).toBeDefined();
      expect(Array.isArray(cat.items)).toBe(true);
      expect(cat.items.length).toBe(6);

      const keys = cat.items.map((i: any) => i.config_key);
      expect(keys).toContain('orchestration.entry.complexity_decompose_threshold');
      expect(keys).toContain('orchestration.entry.default_strategy');
    });

    it('TC-CFG-061: Filter by layer', async () => {
      const input = new GetConfigDetailInput();
      input.layer = 'ORCHESTRATION';
      const output = new GetConfigDetailOutput();
      await service.soConfigDetail(input, output, ctx());

      expect(output.layers.length).toBe(1);
      expect((output.layers[0] as any).layer).toBe('ORCHESTRATION');
    });

    it('TC-CFG-062: Filter by module', async () => {
      const input = new GetConfigDetailInput();
      input.module = 'entry';
      const output = new GetConfigDetailOutput();
      await service.soConfigDetail(input, output, ctx());

      const orchLayer = output.layers.find((l: any) => l.layer === 'ORCHESTRATION');
      expect(orchLayer).toBeDefined();
      const mods = (orchLayer!.modules as any[]).filter((m: any) => m.module === 'entry');
      expect(mods.length).toBe(1);
    });

    it('TC-CFG-063: Filter by category', async () => {
      const input = new GetConfigDetailInput();
      input.category = 'basic';
      const output = new GetConfigDetailOutput();
      await service.soConfigDetail(input, output, ctx());

      const orchLayer = output.layers.find((l: any) => l.layer === 'ORCHESTRATION');
      expect(orchLayer).toBeDefined();
      const mod = (orchLayer!.modules as any[]).find((m: any) => m.module === 'entry');
      expect(mod).toBeDefined();
      const cat = (mod.categories as any[]).find((c: any) => c.category === 'basic');
      expect(cat).toBeDefined();
      expect(cat.items.length).toBe(6);
    });

    it('TC-CFG-064: Combined filter (layer + module)', async () => {
      const input = new GetConfigDetailInput();
      input.layer = 'ORCHESTRATION';
      input.module = 'entry';
      const output = new GetConfigDetailOutput();
      await service.soConfigDetail(input, output, ctx());

      expect(output.layers.length).toBe(1);
      const layer = output.layers[0] as any;
      expect(layer.layer).toBe('ORCHESTRATION');
      const mods = layer.modules as any[];
      expect(mods.every((m: any) => m.module === 'entry')).toBe(true);
    });

    it('TC-CFG-065: readable_only=true excludes unreadable config', async () => {
      const input = new GetConfigDetailInput();
      input.readable_only = true;
      const output = new GetConfigDetailOutput();
      await service.soConfigDetail(input, output, ctx());

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      const mod = appLayer ? (appLayer.modules as any[]).find((m: any) => m.module === 'self_learning') : null;
      const cat = mod ? (mod.categories as any[]).find((c: any) => c.category === 'weight') : null;
      const items = cat ? (cat.items as any[]) : [];
      expect(items.every((i: any) => i.config_key !== 'self_learning.conversation_weight')).toBe(true);
    });

    it('TC-CFG-066: readable_only=false returns all configs including unreadable', async () => {
      const input = new GetConfigDetailInput();
      input.readable_only = false;
      const output = new GetConfigDetailOutput();
      await service.soConfigDetail(input, output, ctx());

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      const mod = appLayer ? (appLayer.modules as any[]).find((m: any) => m.module === 'self_learning') : null;
      const cat = mod ? (mod.categories as any[]).find((c: any) => c.category === 'weight') : null;
      const items = cat ? (cat.items as any[]) : [];
      expect(items.some((i: any) => i.config_key === 'self_learning.conversation_weight')).toBe(true);
    });

    it('TC-CFG-067: Each config item contains current_value field', async () => {
      const input = new GetConfigDetailInput();
      const output = new GetConfigDetailOutput();
      await service.soConfigDetail(input, output, ctx());

      for (const layer of output.layers as any[]) {
        for (const mod of (layer.modules as any[])) {
          for (const cat of (mod.categories as any[])) {
            for (const item of (cat.items as any[])) {
              expect(item).toHaveProperty('current_value');
            }
          }
        }
      }
    });

    it('TC-CFG-068: 返回字段完整性', async () => {
      const input = new GetConfigDetailInput();
      const output = new GetConfigDetailOutput();
      await service.soConfigDetail(input, output, ctx());

      for (const layer of output.layers as any[]) {
        expect(layer).toHaveProperty('layer');
        expect(layer).toHaveProperty('modules');
        for (const mod of (layer.modules as any[])) {
          expect(mod).toHaveProperty('module');
          expect(mod).toHaveProperty('readable');
          expect(mod).toHaveProperty('writable');
          expect(mod).toHaveProperty('effective_readable');
          expect(mod).toHaveProperty('effective_writable');
          expect(mod).toHaveProperty('categories');
        }
      }
    });

    it('TC-CFG-070: config_description is returned in config detail', async () => {
      const input = new GetConfigDetailInput();
      const output = new GetConfigDetailOutput();
      await service.soConfigDetail(input, output, ctx());

      const orchLayer = output.layers.find((l: any) => l.layer === 'ORCHESTRATION');
      const mod = (orchLayer!.modules as any[]).find((m: any) => m.module === 'entry');
      const cat = (mod.categories as any[]).find((c: any) => c.category === 'basic');
      const item = (cat.items as any[]).find((i: any) => i.config_key === 'orchestration.entry.complexity_decompose_threshold');
      expect(item).toBeDefined();
      expect(item.config_description).toBe('任务复杂度超过此阈值时触发任务分解（选择 PLANNING 策略），否则走 SIMPLE；取值 0-100');
    });

    it('TC-CFG-069: Static registrations are always present', async () => {
      const freshDb = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
      await freshDb.initialize();
      new ConfigSchemaInitializer(freshDb).init();
      const freshService = new ConfigService(freshDb, llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
        logAccess,
        mqAccess, graphDBAccess, vectorDBAccess,
        llmCore, infoCore, mcpCore, skillCore, soulCore,
        writerAgent, evolutorAgent, plannerAgent, agentLibrary, agentBuilder, agentExecution, agentStrategy, agentContext,
        orchestrationEntry, orchestrationStrategy, orchestrationExecution, orchestrationVisualization, jsonNode,
        chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess);

      const input = new GetConfigDetailInput();
      const output = new GetConfigDetailOutput();
      await freshService.soConfigDetail(input, output, ctx());
      expect(output.layers.length).toBeGreaterThan(0);
    });
  });

  // =====================================================================
  // soConfigItem
  // =====================================================================

  describe('soConfigItem', () => {
    const itemKey = 'llm_core.regen_rate';

    it('TC-CFG-075: Get single config item returns config_item', async () => {
      const input = new GetConfigItemInput();
      input.config_key = itemKey;
      const output = new GetConfigItemOutput();
      const result = await service.soConfigItem(input, output, ctx());
      expect(result).toBe(true);
      expect(output.config_item.config_key).toBe(itemKey);
      expect(output.config_item.config_name).toBe('LLM 重新匹配概率（0-100）');
      expect(output.config_item.config_type).toBe('INT');
    });

    it('TC-CFG-076: Non-existent key throws NotFoundError', async () => {
      const input = new GetConfigItemInput();
      input.config_key = 'non.existent.076';
      const output = new GetConfigItemOutput();
      await expect(service.soConfigItem(input, output, ctx())).rejects.toThrow(NotFoundError);
    });

    it('TC-CFG-077: Unreadable item reports effective_readable=false', async () => {
      await service.updateLayerPrivilege(
        Object.assign(new UpdateLayerPrivilegeInput(), { layer: 'CORE', readable: false }),
        ctx(),
        new UpdateLayerPrivilegeOutput(),
      );

      const input = new GetConfigItemInput();
      input.config_key = itemKey;
      const output = new GetConfigItemOutput();
      const result = await service.soConfigItem(input, output, ctx());
      expect(result).toBe(true);
      expect(output.config_item.effective_readable).toBe(false);
    });
  });

  // =====================================================================
  // updateConfig
  // =====================================================================

  describe('updateConfig', () => {
    it('TC-CFG-085: BOOLEAN update succeeds', async () => {
      vi.spyOn(infoCore, 'updateInfoContextConfig').mockResolvedValue(true);
      const key = 'info_core.context_config.enable_snapshot_persistence';
      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = false;
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, output, ctx());
      expect(result).toBe(true);
      expect(infoCore.updateInfoContextConfig).toHaveBeenCalled();
    });

    it('TC-CFG-086: INT update succeeds', async () => {
      vi.spyOn(llmCore, 'configLLMCore').mockResolvedValue(true);
      const key = 'llm_core.regen_rate';
      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 42;
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, output, ctx());
      expect(result).toBe(true);
      expect(llmCore.configLLMCore).toHaveBeenCalled();
    });

    it('TC-CFG-088: STRING update succeeds', async () => {
      vi.spyOn(llmCore, 'configLLMCore').mockResolvedValue(true);
      const key = 'llm_core.prompt_template_id';
      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 'updated';
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, output, ctx());
      expect(result).toBe(true);
    });

    it('TC-CFG-089: ENUM valid value succeeds', async () => {
      vi.spyOn(orchestrationEntry, 'configOrchestrationEntry').mockResolvedValue(true);
      const key = 'orchestration.entry.default_strategy';
      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 'PLANNING';
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, output, ctx());
      expect(result).toBe(true);
      expect(orchestrationEntry.configOrchestrationEntry).toHaveBeenCalled();
    });

    it('TC-CFG-091: Non-existent key throws NotFoundError', async () => {
      const input = new UpdateConfigInput();
      input.config_key = 'non.existent.091';
      input.value = 123;
      const output = new UpdateConfigOutput();
      await expect(service.updateConfig(input, output, ctx())).rejects.toThrow(NotFoundError);
    });

    it('TC-CFG-092: Unwritable config throws error', async () => {
      await service.updateModulePrivilege(
        Object.assign(new UpdateModulePrivilegeInput(), { module: 'llm_core', writable: false }),
        ctx(),
        new UpdateModulePrivilegeOutput(),
      );

      const input = new UpdateConfigInput();
      input.config_key = 'llm_core.regen_rate';
      input.value = 99;
      const output = new UpdateConfigOutput();
      await expect(service.updateConfig(input, output, ctx())).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-093: INT type with string value throws ValidationError', async () => {
      const input = new UpdateConfigInput();
      input.config_key = 'llm_core.regen_rate';
      input.value = 'not_a_number';
      const output = new UpdateConfigOutput();
      await expect(service.updateConfig(input, output, ctx())).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-094: BOOLEAN type with string value throws ValidationError', async () => {
      const input = new UpdateConfigInput();
      input.config_key = 'info_core.context_config.enable_snapshot_persistence';
      input.value = 'true';
      const output = new UpdateConfigOutput();
      await expect(service.updateConfig(input, output, ctx())).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-096: chat. prefix routes to chatAccess.configChat', async () => {
      const key = 'chat.max_messages_per_session';
      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 500;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(chatAccess.configChat).toHaveBeenCalled();
    });

    it('TC-CFG-097: llm_core. prefix routes to llmCore.configLLMCore', async () => {
      vi.spyOn(llmCore, 'configLLMCore').mockResolvedValue(true);
      const key = 'llm_core.regen_rate';
      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 20;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(llmCore.configLLMCore).toHaveBeenCalled();
    });

    it('TC-CFG-097b: agent_library.regen_rate routes to configAgentLibrary and persists', async () => {
      const updInput = new UpdateConfigInput();
      updInput.config_key = 'agent_library.regen_rate';
      updInput.value = 50;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);

      const getInput = new GetConfigItemInput();
      getInput.config_key = 'agent_library.regen_rate';
      const getOutput = new GetConfigItemOutput();
      await service.soConfigItem(getInput, getOutput, ctx());
      expect(getOutput.config_item.config_name).toBe('Agent 重新评估概率（0-100）');
      expect((getOutput.config_item.current_value as any)?.regen_rate).toBe(50);
    });

    it('TC-CFG-097c: agent_library.regen_rate out-of-range value is rejected', async () => {
      const updInput = new UpdateConfigInput();
      updInput.config_key = 'agent_library.regen_rate';
      updInput.value = 150;
      await expect(service.updateConfig(updInput, ctx(), new UpdateConfigOutput()))
        .rejects.toThrow(ValidationError);
    });

    it('TC-CFG-098: writer_agent. prefix routes to writerAgent.configWriterAgent', async () => {
      vi.spyOn(writerAgent, 'configWriterAgent').mockResolvedValue(true);
      const key = 'writer_agent.default_style';
      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 'verbose';
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(writerAgent.configWriterAgent).toHaveBeenCalled();
    });

    it('TC-CFG-099: Base provider enabled routes to its enable method', async () => {
      const key = 'llm_provider.enabled';
      vi.spyOn(llmAccess, 'enableLLM').mockResolvedValue(true);
      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = false;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(llmAccess.enableLLM).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // configConfig
  // =====================================================================

  describe('configConfig', () => {
    it('TC-CFG-170: Set default_readable=false', async () => {
      const input = new ConfigConfigInput();
      input.default_readable = false;
      const output = new ConfigConfigOutput();
      const result = await service.configConfig(input, output, ctx());
      expect(result).toBe(true);
      expect(output.config.default_readable).toBe(false);
    });

    it('TC-CFG-171: Set default_writable=false', async () => {
      const input = new ConfigConfigInput();
      input.default_writable = false;
      const output = new ConfigConfigOutput();
      await service.configConfig(input, output, ctx());
      expect(output.config.default_writable).toBe(false);
    });

    it('TC-CFG-172: Get config (no params) returns current settings', async () => {
      const setupInput = new ConfigConfigInput();
      setupInput.default_readable = false;
      setupInput.default_writable = false;
      await service.configConfig(setupInput, ctx(), new ConfigConfigOutput());

      const input = new ConfigConfigInput();
      const output = new ConfigConfigOutput();
      await service.configConfig(input, output, ctx());
      expect(output.config).toBeDefined();
      expect(output.config.default_readable).toBe(false);
      expect(output.config.default_writable).toBe(false);
    });

    it('TC-CFG-173: Partial update only changes specified keys', async () => {
      const setupInput = new ConfigConfigInput();
      setupInput.default_readable = true;
      setupInput.default_writable = true;
      await service.configConfig(setupInput, ctx(), new ConfigConfigOutput());

      const input = new ConfigConfigInput();
      input.default_readable = false;
      const output = new ConfigConfigOutput();
      await service.configConfig(input, output, ctx());
      expect(output.config.default_readable).toBe(false);
      expect(output.config.default_writable).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // LLM Proxy Methods  TC-CFG-100 ~ TC-CFG-112
  // ═══════════════════════════════════════════════════════════

  describe('LLM proxy methods', () => {
    it('TC-CFG-100: addLLMProviderProxy delegates to addLLMProvider with params', async () => {
      const testInput = { data: { llm_provider_url: 'https://api.test.com', llm_provider_title: 'test-provider' } };
      const testCtx = ctx();
      const testOutput = {};
      const result = await (service as any).addLLMProviderProxy(testInput, testOutput, testCtx);
      expect(result).toBe(true);
      expect(testOutput.id).toBeDefined();
      expect(typeof testOutput.id).toBe('string');
    });
    it('TC-CFG-100-ERR: addLLMProviderProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'addLLMProvider').mockRejectedValue(new Error('provider error'));
      await expect((service as any).addLLMProviderProxy({}, ctx(), {})).rejects.toThrow('provider error');
    });
    it('TC-CFG-101: updateLLMProviderProxy delegates to updateLLMProvider with params', async () => {
      const testInput = { id: 'fake-provider-id', data: { llm_provider_title: 'updated-name' } };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'updateLLMProvider');
      await (service as any).updateLLMProviderProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-101-ERR: updateLLMProviderProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'updateLLMProvider').mockRejectedValue(new Error('update error'));
      await expect((service as any).updateLLMProviderProxy({}, ctx(), {})).rejects.toThrow('update error');
    });
    it('TC-CFG-102: delLLMProviderProxy delegates to delLLMProvider with params', async () => {
      const testInput = { ids: ['fake-provider-id'] };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'delLLMProvider');
      await (service as any).delLLMProviderProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-102-ERR: delLLMProviderProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'delLLMProvider').mockRejectedValue(new Error('delete error'));
      await expect((service as any).delLLMProviderProxy({}, ctx(), {})).rejects.toThrow('delete error');
    });
    it('TC-CFG-103: soLLMProviderProxy delegates to soLLMProvider with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'soLLMProvider');
      await (service as any).soLLMProviderProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-103-ERR: soLLMProviderProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'soLLMProvider').mockRejectedValue(new Error('SO error'));
      await expect((service as any).soLLMProviderProxy({}, ctx(), {})).rejects.toThrow('SO error');
    });
    it('TC-CFG-104: testLLMProviderProxy delegates to testLLMProvider with params', async () => {
      const testInput = { id: 'fake-provider-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'testLLMProvider');
      await (service as any).testLLMProviderProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-104-ERR: testLLMProviderProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'testLLMProvider').mockRejectedValue(new Error('test error'));
      await expect((service as any).testLLMProviderProxy({}, ctx(), {})).rejects.toThrow('test error');
    });
    it('TC-CFG-105: listLLMProxy delegates to listLLM with params', async () => {
      const testInput = { llm_provider_id: 'fake-provider-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'listLLM');
      await (service as any).listLLMProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-105-ERR: listLLMProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'listLLM').mockRejectedValue(new Error('list error'));
      await expect((service as any).listLLMProxy({}, ctx(), {})).rejects.toThrow('list error');
    });
    it('TC-CFG-106: addLLMProxy delegates to addLLM with params', async () => {
      const testInput = { data: { llm_provider_id: 'fake-provider-id', llm_title: 'gpt-4' } };
      const testCtx = ctx();
      const testOutput = {};
      const result = await (service as any).addLLMProxy(testInput, testOutput, testCtx);
      expect(result).toBe(true);
      expect(testOutput.id).toBeDefined();
      expect(typeof testOutput.id).toBe('string');
    });
    it('TC-CFG-106-ERR: addLLMProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'addLLM').mockRejectedValue(new Error('add LLM error'));
      await expect((service as any).addLLMProxy({}, ctx(), {})).rejects.toThrow('add LLM error');
    });
    it('TC-CFG-107: updateLLMProxy delegates to updateLLM with params', async () => {
      const testInput = { id: 'fake-llm-id', data: { llm_title: 'gpt-4-turbo' } };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'updateLLM');
      await (service as any).updateLLMProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-107-ERR: updateLLMProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'updateLLM').mockRejectedValue(new Error('update LLM error'));
      await expect((service as any).updateLLMProxy({}, ctx(), {})).rejects.toThrow('update LLM error');
    });
    it('TC-CFG-108: delLLMProxy delegates to delLLM with params', async () => {
      const testInput = { ids: ['fake-llm-id'] };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'delLLM');
      await (service as any).delLLMProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-108-ERR: delLLMProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'delLLM').mockRejectedValue(new Error('del LLM error'));
      await expect((service as any).delLLMProxy({}, ctx(), {})).rejects.toThrow('del LLM error');
    });
    it('TC-CFG-109: soLLMProxy delegates to soLLM with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'soLLM');
      await (service as any).soLLMProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-109-ERR: soLLMProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'soLLM').mockRejectedValue(new Error('SO LLM error'));
      await expect((service as any).soLLMProxy({}, ctx(), {})).rejects.toThrow('SO LLM error');
    });
    it('TC-CFG-110: getLLMProxy delegates to soLLMById with params', async () => {
      const testInput = { id: 'fake-llm-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'soLLMById');
      await (service as any).getLLMProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-110-ERR: getLLMProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'soLLMById').mockRejectedValue(new Error('get LLM error'));
      await expect((service as any).getLLMProxy({}, ctx(), {})).rejects.toThrow('get LLM error');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Soul Proxy Methods  TC-CFG-120 ~ TC-CFG-126
  // ═══════════════════════════════════════════════════════════

  describe('Soul proxy methods', () => {
    it('TC-CFG-120: addSoulProxy delegates to addSoul with params', async () => {
      const testInput = { data: { soul_content: 'test-soul content', soul_brief: 'brief', soul_usage: 'friendly' } };
      const testCtx = ctx();
      const testOutput = {};
      const result = await (service as any).addSoulProxy(testInput, testOutput, testCtx);
      expect(result).toBe(true);
      expect(testOutput.id).toBeDefined();
      expect(typeof testOutput.id).toBe('string');
    });
    it('TC-CFG-120-ERR: addSoulProxy propagates error', async () => {
      vi.spyOn(soulAccess, 'addSoul').mockRejectedValue(new Error('soul error'));
      await expect((service as any).addSoulProxy({}, ctx(), {})).rejects.toThrow('soul error');
    });
    it('TC-CFG-121: updateSoulProxy delegates to updateSoul with params', async () => {
      const testInput = { id: 'fake-soul-id', data: { soul_brief: 'updated-soul' } };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(soulAccess, 'updateSoul');
      await (service as any).updateSoulProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-121-ERR: updateSoulProxy propagates error', async () => {
      vi.spyOn(soulAccess, 'updateSoul').mockRejectedValue(new Error('update soul error'));
      await expect((service as any).updateSoulProxy({}, ctx(), {})).rejects.toThrow('update soul error');
    });
    it('TC-CFG-122: delSoulProxy delegates to delSoul with params', async () => {
      const testInput = { ids: ['fake-soul-id'] };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(soulAccess, 'delSoul');
      await (service as any).delSoulProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-122-ERR: delSoulProxy propagates error', async () => {
      vi.spyOn(soulAccess, 'delSoul').mockRejectedValue(new Error('del soul error'));
      await expect((service as any).delSoulProxy({}, ctx(), {})).rejects.toThrow('del soul error');
    });
    it('TC-CFG-123: soSoulProxy delegates to soSoul with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(soulAccess, 'soSoul');
      await (service as any).soSoulProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-123-ERR: soSoulProxy propagates error', async () => {
      vi.spyOn(soulAccess, 'soSoul').mockRejectedValue(new Error('SO soul error'));
      await expect((service as any).soSoulProxy({}, ctx(), {})).rejects.toThrow('SO soul error');
    });
    it('TC-CFG-124: getSoulProxy delegates to soSoulById with params', async () => {
      const testInput = { id: 'fake-soul-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(soulAccess, 'soSoulById');
      await (service as any).getSoulProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-124-ERR: getSoulProxy propagates error', async () => {
      vi.spyOn(soulAccess, 'soSoulById').mockRejectedValue(new Error('get soul error'));
      await expect((service as any).getSoulProxy({}, ctx(), {})).rejects.toThrow('get soul error');
    });
    it('TC-CFG-125: getSoulRuleProxy delegates to soulCore.soSoulRule with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(soulCore, 'soSoulRule');
      await (service as any).getSoulRuleProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-125-ERR: getSoulRuleProxy propagates error', async () => {
      vi.spyOn(soulCore, 'soSoulRule').mockRejectedValue(new Error('soSoulRule error'));
      await expect((service as any).getSoulRuleProxy({}, ctx(), {})).rejects.toThrow('soSoulRule error');
    });
    it('TC-CFG-126: updateSoulRuleProxy delegates to soulCore.updateSoulRule with params', async () => {
      const testInput = { operations: [{ type: 'INSERT', data: [{ fake_field: 'fake_value' }] }] };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(soulCore, 'updateSoulRule').mockResolvedValue(true);
      await (service as any).updateSoulRuleProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-126-ERR: updateSoulRuleProxy propagates error', async () => {
      vi.spyOn(soulCore, 'updateSoulRule').mockRejectedValue(new Error('updateSoulRule error'));
      await expect((service as any).updateSoulRuleProxy({}, ctx(), {})).rejects.toThrow('updateSoulRule error');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Skill Proxy Methods  TC-CFG-130 ~ TC-CFG-136
  // ═══════════════════════════════════════════════════════════

  describe('Skill proxy methods', () => {
    it('TC-CFG-130: addSkillProxy delegates to addSkill with params', async () => {
      const testInput = { data: { name: 'test-skill', skill_brief: 'test-skill', skill_md: 'do something' } };
      const testCtx = ctx();
      const testOutput = {};
      const result = await (service as any).addSkillProxy(testInput, testOutput, testCtx);
      expect(result).toBe(true);
      expect(testOutput.id).toBeDefined();
      expect(typeof testOutput.id).toBe('string');
    });
    it('TC-CFG-130-ERR: addSkillProxy propagates error', async () => {
      vi.spyOn(skillAccess, 'addSkill').mockRejectedValue(new Error('skill error'));
      await expect((service as any).addSkillProxy({}, ctx(), {})).rejects.toThrow('skill error');
    });
    it('TC-CFG-131: updateSkillProxy delegates to updateSkill with params', async () => {
      const testInput = { id: 'fake-skill-id', data: { skill_brief: 'updated-skill' } };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(skillAccess, 'updateSkill');
      await (service as any).updateSkillProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-131-ERR: updateSkillProxy propagates error', async () => {
      vi.spyOn(skillAccess, 'updateSkill').mockRejectedValue(new Error('update skill error'));
      await expect((service as any).updateSkillProxy({}, ctx(), {})).rejects.toThrow('update skill error');
    });
    it('TC-CFG-132: delSkillProxy delegates to delSkill with params', async () => {
      const testInput = { ids: ['fake-skill-id'] };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(skillAccess, 'delSkill');
      await (service as any).delSkillProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-132-ERR: delSkillProxy propagates error', async () => {
      vi.spyOn(skillAccess, 'delSkill').mockRejectedValue(new Error('del skill error'));
      await expect((service as any).delSkillProxy({}, ctx(), {})).rejects.toThrow('del skill error');
    });
    it('TC-CFG-133: soSkillProxy delegates to soSkill with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(skillAccess, 'soSkill');
      await (service as any).soSkillProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-133-ERR: soSkillProxy propagates error', async () => {
      vi.spyOn(skillAccess, 'soSkill').mockRejectedValue(new Error('SO skill error'));
      await expect((service as any).soSkillProxy({}, ctx(), {})).rejects.toThrow('SO skill error');
    });
    it('TC-CFG-134: getSkillProxy delegates to soSkillById with params', async () => {
      const testInput = { id: 'fake-skill-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(skillAccess, 'soSkillById');
      await (service as any).getSkillProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-134-ERR: getSkillProxy propagates error', async () => {
      vi.spyOn(skillAccess, 'soSkillById').mockRejectedValue(new Error('get skill error'));
      await expect((service as any).getSkillProxy({}, ctx(), {})).rejects.toThrow('get skill error');
    });
    it('TC-CFG-135: getSkillRuleProxy delegates to skillCore.soSkillRule with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(skillCore, 'soSkillRule');
      await (service as any).getSkillRuleProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-135-ERR: getSkillRuleProxy propagates error', async () => {
      vi.spyOn(skillCore, 'soSkillRule').mockRejectedValue(new Error('soSkillRule error'));
      await expect((service as any).getSkillRuleProxy({}, ctx(), {})).rejects.toThrow('soSkillRule error');
    });
    it('TC-CFG-136: updateSkillRuleProxy delegates to skillCore.updateSkillRule with params', async () => {
      const testInput = { operations: [{ type: 'INSERT', data: [{ fake_field: 'fake_value' }] }] };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(skillCore, 'updateSkillRule').mockResolvedValue(true);
      await (service as any).updateSkillRuleProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-136-ERR: updateSkillRuleProxy propagates error', async () => {
      vi.spyOn(skillCore, 'updateSkillRule').mockRejectedValue(new Error('updateSkillRule error'));
      await expect((service as any).updateSkillRuleProxy({}, ctx(), {})).rejects.toThrow('updateSkillRule error');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // MCP Proxy Methods  TC-CFG-140 ~ TC-CFG-153
  // ═══════════════════════════════════════════════════════════

  describe('MCP proxy methods', () => {
    it('TC-CFG-140: addMcpProviderProxy delegates to addMcpProvider with params', async () => {
      const testInput = { data: { mcp_provider_url: 'https://mcp.test.com', mcp_provider_title: 'test-mcp' } };
      const testCtx = ctx();
      const testOutput = {};
      const result = await (service as any).addMcpProviderProxy(testInput, testOutput, testCtx);
      expect(result).toBe(true);
      expect(testOutput.id).toBeDefined();
      expect(typeof testOutput.id).toBe('string');
    });
    it('TC-CFG-140-ERR: addMcpProviderProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'addMcpProvider').mockRejectedValue(new Error('mcp provider error'));
      await expect((service as any).addMcpProviderProxy({}, ctx(), {})).rejects.toThrow('mcp provider error');
    });
    it('TC-CFG-141: updateMcpProviderProxy delegates to updateMcpProvider with params', async () => {
      const testInput = { id: 'fake-mcp-provider-id', data: { mcp_provider_title: 'updated-mcp' } };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'updateMcpProvider');
      await (service as any).updateMcpProviderProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-141-ERR: updateMcpProviderProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'updateMcpProvider').mockRejectedValue(new Error('update mcp provider error'));
      await expect((service as any).updateMcpProviderProxy({}, ctx(), {})).rejects.toThrow('update mcp provider error');
    });
    it('TC-CFG-142: delMcpProviderProxy delegates to delMcpProvider with params', async () => {
      const testInput = { ids: ['fake-mcp-provider-id'] };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'delMcpProvider');
      await (service as any).delMcpProviderProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-142-ERR: delMcpProviderProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'delMcpProvider').mockRejectedValue(new Error('del mcp provider error'));
      await expect((service as any).delMcpProviderProxy({}, ctx(), {})).rejects.toThrow('del mcp provider error');
    });
    it('TC-CFG-143: soMcpProviderProxy delegates to soMcpProvider with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'soMcpProvider');
      await (service as any).soMcpProviderProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-143-ERR: soMcpProviderProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'soMcpProvider').mockRejectedValue(new Error('SO mcp provider error'));
      await expect((service as any).soMcpProviderProxy({}, ctx(), {})).rejects.toThrow('SO mcp provider error');
    });
    it('TC-CFG-144: testMcpProviderProxy delegates to testMcpProvider with params', async () => {
      const testInput = { id: 'fake-mcp-provider-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'testMcpProvider');
      await (service as any).testMcpProviderProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-144-ERR: testMcpProviderProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'testMcpProvider').mockRejectedValue(new Error('test mcp provider error'));
      await expect((service as any).testMcpProviderProxy({}, ctx(), {})).rejects.toThrow('test mcp provider error');
    });
    it('TC-CFG-145: listMcpProxy delegates to listMcp with params', async () => {
      const testInput = { mcp_provider_id: 'fake-mcp-provider-id', page: { page: 1, page_size: 20 } };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'listMcp');
      await (service as any).listMcpProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-145-ERR: listMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'listMcp').mockRejectedValue(new Error('list mcp error'));
      await expect((service as any).listMcpProxy({}, ctx(), {})).rejects.toThrow('list mcp error');
    });
    it('TC-CFG-146: installMcpProxy delegates to installMcp with params', async () => {
      const testInput = { mcp_provider_id: 'fake-provider-id', mcp_id: 'test-mcp-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'installMcp');
      await (service as any).installMcpProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-146-ERR: installMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'installMcp').mockRejectedValue(new Error('install mcp error'));
      await expect((service as any).installMcpProxy({}, ctx(), {})).rejects.toThrow('install mcp error');
    });
    it('TC-CFG-147: startMcpProxy delegates to startMcp with params', async () => {
      const testInput = { id: 'fake-mcp-install-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'startMcp');
      await (service as any).startMcpProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-147-ERR: startMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'startMcp').mockRejectedValue(new Error('start mcp error'));
      await expect((service as any).startMcpProxy({}, ctx(), {})).rejects.toThrow('start mcp error');
    });
    it('TC-CFG-148: stopMcpProxy delegates to stopMcp with params', async () => {
      const testInput = { id: 'fake-mcp-install-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'stopMcp');
      await (service as any).stopMcpProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-148-ERR: stopMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'stopMcp').mockRejectedValue(new Error('stop mcp error'));
      await expect((service as any).stopMcpProxy({}, ctx(), {})).rejects.toThrow('stop mcp error');
    });
    it('TC-CFG-149: uninstallMcpProxy delegates to uninstallMcp with params', async () => {
      const testInput = { id: 'fake-mcp-install-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'uninstallMcp');
      await (service as any).uninstallMcpProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-149-ERR: uninstallMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'uninstallMcp').mockRejectedValue(new Error('uninstall mcp error'));
      await expect((service as any).uninstallMcpProxy({}, ctx(), {})).rejects.toThrow('uninstall mcp error');
    });
    it('TC-CFG-150: updateMcpProxy delegates to updateMcp with params', async () => {
      const testInput = { id: 'fake-mcp-install-id', data: { mcp_title: 'updated-mcp' } };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'updateMcp');
      await (service as any).updateMcpProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-150-ERR: updateMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'updateMcp').mockRejectedValue(new Error('update mcp error'));
      await expect((service as any).updateMcpProxy({}, ctx(), {})).rejects.toThrow('update mcp error');
    });
    it('TC-CFG-151: getMcpProxy delegates to soMcpById with params', async () => {
      const testInput = { id: 'fake-mcp-install-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'soMcpById');
      await (service as any).getMcpProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-151-ERR: getMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'soMcpById').mockRejectedValue(new Error('get mcp error'));
      await expect((service as any).getMcpProxy({}, ctx(), {})).rejects.toThrow('get mcp error');
    });
    it('TC-CFG-152: soMcpProxy delegates to soMcp with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'soMcp');
      await (service as any).soMcpProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-152-ERR: soMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'soMcp').mockRejectedValue(new Error('SO mcp error'));
      await expect((service as any).soMcpProxy({}, ctx(), {})).rejects.toThrow('SO mcp error');
    });
    it('TC-CFG-153: lifecycle install then start validates sequential calls with params', async () => {
      const testInput1 = { mcp_provider_id: 'fake-provider-id', mcp_id: 'test-mcp-id' };
      const testInput2 = { id: 'fake-mcp-install-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy1 = vi.spyOn(mcpAccess, 'installMcp');
      const spy2 = vi.spyOn(mcpAccess, 'startMcp');
      await (service as any).installMcpProxy(testInput1, testOutput, testCtx);
      expect(spy1).toHaveBeenCalledWith(testInput1, testOutput, testCtx, undefined, undefined);
      await (service as any).startMcpProxy(testInput2, testOutput, testCtx);
      expect(spy2).toHaveBeenCalledWith(testInput2, testOutput, testCtx, undefined, undefined);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Prompt Proxy Methods  TC-CFG-160 ~ TC-CFG-164
  // ═══════════════════════════════════════════════════════════

  describe('Prompt proxy methods', () => {
    it('TC-CFG-160: addPromptProxy delegates to addPrompt with params', async () => {
      const testInput = { data: { prompt_template_title: 'test-prompt', prompt_template: 'Hello {{name}}' } };
      const testCtx = ctx();
      const testOutput = {};
      const result = await (service as any).addPromptProxy(testInput, testOutput, testCtx);
      expect(result).toBe(true);
      expect(testOutput.id).toBeDefined();
      expect(typeof testOutput.id).toBe('string');
    });
    it('TC-CFG-160-ERR: addPromptProxy propagates error', async () => {
      vi.spyOn(promptsAccess, 'addPrompt').mockRejectedValue(new Error('prompt error'));
      await expect((service as any).addPromptProxy({}, ctx(), {})).rejects.toThrow('prompt error');
    });
    it('TC-CFG-161: updatePromptProxy delegates to updatePrompt with params', async () => {
      const testInput = { id: 'fake-prompt-id', data: { prompt_template_title: 'updated-prompt' } };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(promptsAccess, 'updatePrompt');
      await (service as any).updatePromptProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-161-ERR: updatePromptProxy propagates error', async () => {
      vi.spyOn(promptsAccess, 'updatePrompt').mockRejectedValue(new Error('update prompt error'));
      await expect((service as any).updatePromptProxy({}, ctx(), {})).rejects.toThrow('update prompt error');
    });
    it('TC-CFG-162: delPromptProxy delegates to delPrompt with params', async () => {
      const testInput = { ids: ['fake-prompt-id'] };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(promptsAccess, 'delPrompt');
      await (service as any).delPromptProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-162-ERR: delPromptProxy propagates error', async () => {
      vi.spyOn(promptsAccess, 'delPrompt').mockRejectedValue(new Error('del prompt error'));
      await expect((service as any).delPromptProxy({}, ctx(), {})).rejects.toThrow('del prompt error');
    });
    it('TC-CFG-163: soPromptProxy delegates to soPrompt with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(promptsAccess, 'soPrompt');
      await (service as any).soPromptProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-163-ERR: soPromptProxy propagates error', async () => {
      vi.spyOn(promptsAccess, 'soPrompt').mockRejectedValue(new Error('SO prompt error'));
      await expect((service as any).soPromptProxy({}, ctx(), {})).rejects.toThrow('SO prompt error');
    });
    it('TC-CFG-164: getPromptProxy delegates to soPromptById with params', async () => {
      const testInput = { id: 'fake-prompt-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(promptsAccess, 'soPromptById');
      await (service as any).getPromptProxy(testInput, testOutput, testCtx);
      expect(spy).toHaveBeenCalledWith(testInput, testOutput, testCtx, undefined, undefined);
    });
    it('TC-CFG-164-ERR: getPromptProxy propagates error', async () => {
      vi.spyOn(promptsAccess, 'soPromptById').mockRejectedValue(new Error('get prompt error'));
      await expect((service as any).getPromptProxy({}, ctx(), {})).rejects.toThrow('get prompt error');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Cross-module constraints — endpoints not exposed by other modules
  // ═══════════════════════════════════════════════════════════

  describe('Cross-module constraints', () => {
    it('TC-CFG-180: Config is the sole config update entry point', async () => {
      vi.spyOn(llmCore, 'configLLMCore').mockResolvedValue(true);
      const key = 'llm_core.regen_rate';
      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 20;
      const updOut = new UpdateConfigOutput();
      const result = await service.updateConfig(updInput, updOut, ctx());
      expect(result).toBe(true);
      expect(llmCore.configLLMCore).toHaveBeenCalled();
    });

    it('TC-CFG-184: chat config updated via Config module', async () => {
      const key = 'chat.max_messages_per_session';
      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 500;
      const updOut = new UpdateConfigOutput();
      const result = await service.updateConfig(updInput, updOut, ctx());
      expect(result).toBe(true);
      expect(chatAccess.configChat).toHaveBeenCalled();
    });

    it('TC-CFG-181: self_learning. prefix routes to selfLearningAccess.configSelfLearning', async () => {
      const key = 'self_learning.default_learning_rate';
      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 10;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(selfLearningAccess.configSelfLearning).toHaveBeenCalled();
    });

    it('TC-CFG-182: user_profile. prefix routes to userProfileAccess.configUserProfile', async () => {
      const key = 'user_profile.max_conversation_sample_count';
      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 300;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(userProfileAccess.configUserProfile).toHaveBeenCalled();
    });

    it('TC-CFG-183: visualization. prefix routes to visualizationAccess.configVisualization', async () => {
      const key = 'visualization.max_nodes_per_graph';
      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 400;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(visualizationAccess.configVisualization).toHaveBeenCalled();
    });
  });

  // =====================================================================
  // Base provider config routing (mq_provider 等基础设施 Provider 读写)
  // =====================================================================

  describe('Base provider config routing', () => {
    it('writes and reads back mq_provider non-enabled param from mq_config', async () => {
      const updInput = new UpdateConfigInput();
      updInput.config_key = 'mq_provider.message_ttl';
      updInput.value = 1234;
      await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());

      const getInput = new GetConfigItemInput();
      getInput.config_key = 'mq_provider.message_ttl';
      const getOutput = new GetConfigItemOutput();
      await service.soConfigItem(getInput, getOutput, ctx());
      expect(getOutput.config_item.current_value).toBe(1234);
    });

    it('writes mq_provider.enabled via enableMQ', async () => {
      vi.spyOn(mqAccess, 'enableMQ').mockResolvedValue(true);
      const updInput = new UpdateConfigInput();
      updInput.config_key = 'mq_provider.enabled';
      updInput.value = false;
      await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(mqAccess.enableMQ).toHaveBeenCalled();
    });

    it('reads static default when mq_config has no entry', async () => {
      const getInput = new GetConfigItemInput();
      getInput.config_key = 'mq_provider.default_priority';
      const getOutput = new GetConfigItemOutput();
      await service.soConfigItem(getInput, getOutput, ctx());
      expect(getOutput.config_item.current_value).toBe(5);
    });
  });

  describe('soWork', () => {
    it('TC-CFG-WORK-001: lists orchestration strategies as work configs', async () => {
      const out = new GetWorkConfigsOutput();
      await service.soWork(new GetWorkConfigsInput(), out, ctx());
      expect(Array.isArray(out.works)).toBe(true);
      expect(out.works.length).toBeGreaterThan(0);
      expect(out.works[0]).toHaveProperty('id');
      expect(out.works[0]).toHaveProperty('name');
      expect(out.works[0]).toHaveProperty('steps');
      expect(out.works[0]).toHaveProperty('enabled');
    });

    it('TC-CFG-WORK-002: update then disable a work config', async () => {
      const list = new GetWorkConfigsOutput();
      await service.soWork(new GetWorkConfigsInput(), list, ctx());
      const target = list.works[0];
      await service.updateWork(
        Object.assign(new UpdateWorkConfigInput(), { id: target.id, name: 'Renamed Work', enabled: true }),
        new UpdateWorkConfigOutput(),
        ctx(),
      );
      await service.deleteWork(
        Object.assign(new DeleteWorkConfigInput(), { id: target.id }),
        new DeleteWorkConfigOutput(),
        ctx(),
      );
      const after = new GetWorkConfigsOutput();
      await service.soWork(new GetWorkConfigsInput(), after, ctx());
      const updated = after.works.find((w) => w.id === target.id);
      expect(updated?.name).toBe('Renamed Work');
      expect(updated?.enabled).toBe(false);
    });
  });
});
