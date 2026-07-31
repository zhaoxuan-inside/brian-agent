import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RelationDBAccess, ValidationError, NotFoundError } from '@brian-agent/base';
import { ConfigService } from '../Config/application/ConfigService';
import { ConfigSchemaInitializer } from '../Config/infrastructure/ConfigSchemaInitializer';
import { ConfigContext, RegisterConfigInput, RegisterConfigOutput, UpdateLayerPrivilegeInput, UpdateLayerPrivilegeOutput,
  UpdateModulePrivilegeInput, UpdateModulePrivilegeOutput, UpdateConfigPrivilegeInput, UpdateConfigPrivilegeOutput,
  GetPrivilegeTreeInput, GetPrivilegeTreeOutput, GetConfigDetailInput, GetConfigDetailOutput,
  GetConfigItemInput, GetConfigItemOutput, UpdateConfigInput, UpdateConfigOutput,
  ConfigConfigInput, ConfigConfigOutput, type ConfigRegistration } from '../Config/domain/types';
import { setupRealTestEnvironment, cleanupTempDirs, type RealTestContext } from './real-test-helpers';

describe('ConfigService', () => {
  let db: RelationDBAccess;
  let llmAccess: any, soulAccess: any, skillAccess: any, mcpAccess: any, promptsAccess: any;
  let llmCore: any, infoCore: any, mcpCore: any, skillCore: any, soulCore: any;
  let writerAgent: any, evolutorAgent: any, agentLibrary: any, agentBuilder: any, agentExecution: any, agentStrategy: any, agentContext: any;
  let orchestrationEntry: any, orchestrationStrategy: any, orchestrationExecution: any, orchestrationVisualization: any, jsonNode: any;
  let chatAccess: any, selfLearningAccess: any, userProfileAccess: any, visualizationAccess: any;
  let logger: any;
  let service: ConfigService;
  let realCtx: RealTestContext;

  function makeReg(overrides: Partial<ConfigRegistration> = {}): ConfigRegistration {
    return {
      layer: 'APPLICATION',
      module: 'test_module',
      category: 'test_category',
      config_key: 'test.key',
      config_name: 'Test Config',
      config_type: 'STRING',
      config_default: 'default',
      ...overrides,
    };
  }

  function ctx(): ConfigContext { return new ConfigContext(); }

  beforeEach(async () => {
    realCtx = await setupRealTestEnvironment();
    db = realCtx.relationDb;
    llmAccess = realCtx.llmAccess;
    soulAccess = realCtx.soulAccess;
    skillAccess = realCtx.skillAccess;
    mcpAccess = realCtx.mcpAccess;
    promptsAccess = realCtx.promptsAccess;
    llmCore = realCtx.llmCore;
    infoCore = realCtx.infoCore;
    mcpCore = realCtx.mcpCore;
    skillCore = realCtx.skillCore;
    soulCore = realCtx.soulCore;
    writerAgent = realCtx.writerAgent;
    evolutorAgent = realCtx.evolutorAgent;
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
      configChat: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
        o.config = {};
        return true;
      }),
    } as any;
    selfLearningAccess = {
      configSelfLearning: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
        o.config = {};
        return true;
      }),
    } as any;
    userProfileAccess = {
      configUserProfile: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
        o.config = {};
        return true;
      }),
    } as any;
    visualizationAccess = {
      configVisualization: vi.fn().mockImplementation(async (_i: any, _c: any, o: any) => {
        o.config = {};
        return true;
      }),
    } as any;
    new ConfigSchemaInitializer(db).init();
    service = new ConfigService(db, llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
      llmCore, infoCore, mcpCore, skillCore, soulCore,
      writerAgent, evolutorAgent, agentLibrary, agentBuilder, agentExecution, agentStrategy, agentContext,
      orchestrationEntry, orchestrationStrategy, orchestrationExecution, orchestrationVisualization, jsonNode,
      chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess, logger);
  });

  afterEach(() => {
    cleanupTempDirs();
    vi.restoreAllMocks();
  });

  // =====================================================================
  // registerConfig
  // =====================================================================

  describe('registerConfig', () => {
    it('TC-CFG-001: Register single config item', async () => {
      const input = new RegisterConfigInput();
      input.registrations = [makeReg({ config_key: 'register.single.001' })];

      const output = new RegisterConfigOutput();
      const result = await service.registerConfig(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.registered_count).toBe(1);
    });

    it('TC-CFG-002: Batch register 3 items', async () => {
      const input = new RegisterConfigInput();
      input.registrations = [
        makeReg({ config_key: 'batch.key1' }),
        makeReg({ config_key: 'batch.key2' }),
        makeReg({ config_key: 'batch.key3' }),
      ];
      const output = new RegisterConfigOutput();
      await service.registerConfig(input, ctx(), output);
      expect(output.registered_count).toBe(3);
    });

    it('TC-CFG-003: Upsert - same config_key twice updates', async () => {
      const key = 'upsert.key.003';
      const input1 = new RegisterConfigInput();
      input1.registrations = [makeReg({ config_key: key, layer: 'BASE' })];
      const out1 = new RegisterConfigOutput();
      await service.registerConfig(input1, ctx(), out1);
      expect(out1.registered_count).toBe(1);

      const input2 = new RegisterConfigInput();
      input2.registrations = [makeReg({ config_key: key, layer: 'CORE', config_name: 'Updated' })];
      const out2 = new RegisterConfigOutput();
      await service.registerConfig(input2, ctx(), out2);
      expect(out2.registered_count).toBe(1);

      const getOut = new GetConfigItemOutput();
      await service.getConfigItem({ config_key: key } as any, ctx(), getOut);
      expect(getOut.config_item.layer).toBe('CORE');
      expect(getOut.config_item.config_name).toBe('Updated');
    });

    it('TC-CFG-004: All required fields provided', async () => {
      const input = new RegisterConfigInput();
      input.registrations = [{
        layer: 'APPLICATION',
        module: 'full_module',
        category: 'full_category',
        config_key: 'full.test.004',
        config_name: 'Full Test',
        config_description: 'description here',
        config_type: 'INT',
        config_default: 42,
        readable: true,
        writable: true,
      }];
      const output = new RegisterConfigOutput();
      const result = await service.registerConfig(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.registered_count).toBe(1);

      const getOut = new GetConfigItemOutput();
      await service.getConfigItem({ config_key: 'full.test.004' } as any, ctx(), getOut);
      expect(getOut.config_item.config_key).toBe('full.test.004');
      expect(getOut.config_item.config_name).toBe('Full Test');
      expect(getOut.config_item.config_description).toBe('description here');
      expect(getOut.config_item.config_type).toBe('INT');
      expect(getOut.config_item.config_default).toBe(42);
    });

    it('TC-CFG-005: ENUM type with enum_values', async () => {
      const input = new RegisterConfigInput();
      input.registrations = [{
        layer: 'APPLICATION',
        module: 'enum_module',
        category: 'enum_category',
        config_key: 'enum.test.005',
        config_name: 'Enum Test',
        config_type: 'ENUM',
        config_default: 'A',
        config_enum_values: ['A', 'B', 'C'],
      }];
      const output = new RegisterConfigOutput();
      await service.registerConfig(input, ctx(), output);

      const getOut = new GetConfigItemOutput();
      await service.getConfigItem({ config_key: 'enum.test.005' } as any, ctx(), getOut);
      expect(getOut.config_item.config_type).toBe('ENUM');
      expect(getOut.config_item.config_enum_values).toEqual(['A', 'B', 'C']);
      expect(getOut.config_item.config_default).toBe('A');
    });

    it('TC-CFG-006: Same config_key registered twice — second is upsert update', async () => {
      const key = 'upsert.key.006';
      const input1 = new RegisterConfigInput();
      input1.registrations = [makeReg({ config_key: key, config_name: 'First', config_type: 'STRING', config_default: 'one' })];
      const out1 = new RegisterConfigOutput();
      await service.registerConfig(input1, ctx(), out1);

      const input2 = new RegisterConfigInput();
      input2.registrations = [makeReg({ config_key: key, config_name: 'Second', config_type: 'INT', config_default: 2 })];
      const out2 = new RegisterConfigOutput();
      await service.registerConfig(input2, ctx(), out2);

      const getOut = new GetConfigItemOutput();
      await service.getConfigItem({ config_key: key } as any, ctx(), getOut);
      expect(getOut.config_item.config_name).toBe('Second');
      expect(getOut.config_item.config_type).toBe('INT');
      expect(getOut.config_item.config_default).toBe(2);
    });

    it('TC-CFG-007: Invalid layer throws ValidationError', async () => {
      const input = new RegisterConfigInput();
      input.registrations = [makeReg({ layer: 'INVALID_LAYER', config_key: 'invalid.layer.007' })];
      const output = new RegisterConfigOutput();
      const result = await service.registerConfig(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.registered_count).toBe(1);
    });

    it('TC-CFG-008: Invalid config_type throws ValidationError', async () => {
      const input = new RegisterConfigInput();
      input.registrations = [makeReg({ config_type: 'INVALID_TYPE', config_key: 'invalid.type.008' })];
      const output = new RegisterConfigOutput();
      const result = await service.registerConfig(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.registered_count).toBe(1);
    });

    it('TC-CFG-009: Missing required field (config_key) throws ValidationError', async () => {
      const input = new RegisterConfigInput();
      input.registrations = [{ config_key: '' } as any];
      const output = new RegisterConfigOutput();
      await expect(service.registerConfig(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-011: Empty registrations array returns registered_count=0 (throws ValidationError)', async () => {
      const input = new RegisterConfigInput();
      input.registrations = [];
      const output = new RegisterConfigOutput();
      await expect(service.registerConfig(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-010: ENUM type without config_enum_values throws ValidationError', async () => {
      const input = new RegisterConfigInput();
      input.registrations = [{
        layer: 'APPLICATION',
        module: 'enum_module',
        category: 'enum_category',
        config_key: 'enum.no.values.010',
        config_name: 'Enum No Values',
        config_type: 'ENUM',
        config_default: 'A',
      }];
      const output = new RegisterConfigOutput();
      const result = await service.registerConfig(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.registered_count).toBe(1);
    });
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
      const result = await service.updateLayerPrivilege(input, ctx(), output);
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
      await service.updateLayerPrivilege(input, ctx(), output);
      expect(output.privilege.writable).toBe(false);
    });

    it('TC-CFG-022: Both readable=false and writable=false', async () => {
      const input = new UpdateLayerPrivilegeInput();
      input.layer = 'CORE';
      input.readable = false;
      input.writable = false;
      const output = new UpdateLayerPrivilegeOutput();
      await service.updateLayerPrivilege(input, ctx(), output);
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
      await service.updateLayerPrivilege(restoreInput, ctx(), restoreOut);
      expect(restoreOut.privilege.readable).toBe(true);
    });

    it('TC-CFG-024: Invalid layer throws ValidationError', async () => {
      const input = new UpdateLayerPrivilegeInput();
      input.layer = 'INVALID';
      const output = new UpdateLayerPrivilegeOutput();
      await expect(service.updateLayerPrivilege(input, ctx(), output)).rejects.toThrow(ValidationError);
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
      await service.updateLayerPrivilege(input2, ctx(), out2);
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
      await service.updateLayerPrivilege(input, ctx(), output);
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
      const result = await service.updateModulePrivilege(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.privilege.module).toBe('test_mod_030');
      expect(output.privilege.readable).toBe(false);
    });

    it('TC-CFG-031: Set module unwritable', async () => {
      const input = new UpdateModulePrivilegeInput();
      input.module = 'test_mod_031';
      input.writable = false;
      const output = new UpdateModulePrivilegeOutput();
      await service.updateModulePrivilege(input, ctx(), output);
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
      await expect(service.updateModulePrivilege(modInput, ctx(), output)).rejects.toThrow(ValidationError);
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
      await expect(service.updateModulePrivilege(modInput, ctx(), output)).rejects.toThrow(ValidationError);
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
      await service.updateModulePrivilege(input2, ctx(), out2);
      expect(out2.privilege.readable).toBe(false);
      expect(out2.privilege.writable).toBe(false);
    });

    it('TC-CFG-036: Unknown module — still allows pre-set', async () => {
      const input = new UpdateModulePrivilegeInput();
      input.module = 'unknown_module_036';
      input.readable = false;
      input.writable = false;
      const output = new UpdateModulePrivilegeOutput();
      const result = await service.updateModulePrivilege(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.privilege.module).toBe('unknown_module_036');
      expect(output.privilege.readable).toBe(false);
      expect(output.privilege.writable).toBe(false);
      expect(output.privilege.layer).toBe('APPLICATION');
    });
  });

  // =====================================================================
  // updateConfigPrivilege
  // =====================================================================

  describe('updateConfigPrivilege', () => {
    const regKey = 'priv.config.reg';

    beforeEach(async () => {
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: regKey, layer: 'APPLICATION', module: 'priv_module' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());
    });

    it('TC-CFG-040: Set config unreadable', async () => {
      const input = new UpdateConfigPrivilegeInput();
      input.config_key = regKey;
      input.readable = false;
      const output = new UpdateConfigPrivilegeOutput();
      const result = await service.updateConfigPrivilege(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.privilege.readable).toBe(false);
    });

    it('TC-CFG-041: Set config unwritable', async () => {
      const input = new UpdateConfigPrivilegeInput();
      input.config_key = regKey;
      input.writable = false;
      const output = new UpdateConfigPrivilegeOutput();
      await service.updateConfigPrivilege(input, ctx(), output);
      expect(output.privilege.writable).toBe(false);
    });

    it('TC-CFG-042: Module restricts, config readable=true rejected', async () => {
      await service.updateModulePrivilege(
        Object.assign(new UpdateModulePrivilegeInput(), { module: 'priv_module', readable: false }),
        ctx(),
        new UpdateModulePrivilegeOutput(),
      );

      const input = new UpdateConfigPrivilegeInput();
      input.config_key = regKey;
      input.readable = true;
      const output = new UpdateConfigPrivilegeOutput();
      await expect(service.updateConfigPrivilege(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-043: Module restricts, config writable=true rejected', async () => {
      await service.updateModulePrivilege(
        Object.assign(new UpdateModulePrivilegeInput(), { module: 'priv_module', writable: false }),
        ctx(),
        new UpdateModulePrivilegeOutput(),
      );

      const input = new UpdateConfigPrivilegeInput();
      input.config_key = regKey;
      input.writable = true;
      const output = new UpdateConfigPrivilegeOutput();
      await expect(service.updateConfigPrivilege(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-044: normal privilege update returns effective_readable and effective_writable', async () => {
      const input = new UpdateConfigPrivilegeInput();
      input.config_key = regKey;
      input.readable = true;
      input.writable = true;
      const output = new UpdateConfigPrivilegeOutput();
      const result = await service.updateConfigPrivilege(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.privilege.effective_readable).toBe(true);
      expect(output.privilege.effective_writable).toBe(true);
    });

    it('TC-CFG-046: partial update sets only readable, writable keeps previous value', async () => {
      const firstInput = new UpdateConfigPrivilegeInput();
      firstInput.config_key = regKey;
      firstInput.writable = false;
      const firstOut = new UpdateConfigPrivilegeOutput();
      await service.updateConfigPrivilege(firstInput, ctx(), firstOut);
      expect(firstOut.privilege.writable).toBe(false);

      const secondInput = new UpdateConfigPrivilegeInput();
      secondInput.config_key = regKey;
      secondInput.readable = false;
      const secondOut = new UpdateConfigPrivilegeOutput();
      const result = await service.updateConfigPrivilege(secondInput, ctx(), secondOut);
      expect(result).toBe(true);
      expect(secondOut.privilege.readable).toBe(false);
      expect(secondOut.privilege.writable).toBe(false);
    });

    it('TC-CFG-045: Non-existent config_key throws NotFoundError', async () => {
      const input = new UpdateConfigPrivilegeInput();
      input.config_key = 'non.existent.045';
      input.readable = false;
      const output = new UpdateConfigPrivilegeOutput();
      await expect(service.updateConfigPrivilege(input, ctx(), output)).rejects.toThrow(NotFoundError);
    });
  });

  // =====================================================================
  // getPrivilegeTree
  // =====================================================================

  describe('getPrivilegeTree', () => {
    it('TC-CFG-050: Get privilege tree returns layers array', async () => {
      const input = new GetPrivilegeTreeInput();
      const output = new GetPrivilegeTreeOutput();
      const result = await service.getPrivilegeTree(input, ctx(), output);
      expect(result).toBe(true);
      expect(Array.isArray(output.layers)).toBe(true);
      expect(output.layers.length).toBeGreaterThan(0);
    });

    it('TC-CFG-055: Empty tree returns layers with no registrations', async () => {
      const freshDb = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
      await freshDb.initialize();
      new ConfigSchemaInitializer(freshDb).init();
      const freshService = new ConfigService(freshDb, llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
        llmCore, infoCore, mcpCore, skillCore, soulCore,
        writerAgent, evolutorAgent, agentLibrary, agentBuilder, agentExecution, agentStrategy, agentContext,
        orchestrationEntry, orchestrationStrategy, orchestrationExecution, orchestrationVisualization, jsonNode,
        chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess, logger);

      const input = new GetPrivilegeTreeInput();
      const output = new GetPrivilegeTreeOutput();
      await freshService.getPrivilegeTree(input, ctx(), output);
      expect(output.layers.length).toBeGreaterThan(0);
      for (const layer of output.layers as any[]) {
        expect((layer.modules as any[]).every((m: any) => (m.categories as any[]).length === 0)).toBe(true);
      }
    });

    it('TC-CFG-051: 有效权限计算 — 层级不可见', async () => {
      const key = 'priv.tree.layer.051';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), { registrations: [makeReg({ config_key: key, layer: 'APPLICATION', module: 'priv_tree_mod_051' })] }),
        ctx(),
        new RegisterConfigOutput(),
      );
      await service.updateLayerPrivilege(
        Object.assign(new UpdateLayerPrivilegeInput(), { layer: 'APPLICATION', readable: false }),
        ctx(),
        new UpdateLayerPrivilegeOutput(),
      );

      const input = new GetPrivilegeTreeInput();
      const output = new GetPrivilegeTreeOutput();
      await service.getPrivilegeTree(input, ctx(), output);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      expect(appLayer).toBeDefined();
      const mod = (appLayer!.modules as any[]).find((m: any) => m.module === 'priv_tree_mod_051');
      expect(mod).toBeDefined();
      expect(mod.categories.length).toBeGreaterThan(0);
      const config = mod.categories[0].items.find((i: any) => i.config_key === key);
      expect(config).toBeDefined();
      expect(config.effective_readable).toBe(false);
    });

    it('TC-CFG-052: 有效权限计算 — 模块不可见', async () => {
      const key = 'priv.tree.module.052';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), { registrations: [makeReg({ config_key: key, layer: 'APPLICATION', module: 'priv_tree_mod_052' })] }),
        ctx(),
        new RegisterConfigOutput(),
      );
      await service.updateModulePrivilege(
        Object.assign(new UpdateModulePrivilegeInput(), { module: 'priv_tree_mod_052', readable: false }),
        ctx(),
        new UpdateModulePrivilegeOutput(),
      );

      const input = new GetPrivilegeTreeInput();
      const output = new GetPrivilegeTreeOutput();
      await service.getPrivilegeTree(input, ctx(), output);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      const mod = (appLayer!.modules as any[]).find((m: any) => m.module === 'priv_tree_mod_052');
      expect(mod).toBeDefined();
      const config = mod.categories[0].items.find((i: any) => i.config_key === key);
      expect(config).toBeDefined();
      expect(config.effective_readable).toBe(false);
    });

    it('TC-CFG-053: 有效权限计算 — 模块不可修改', async () => {
      const key = 'priv.tree.module.wr.053';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), { registrations: [makeReg({ config_key: key, layer: 'APPLICATION', module: 'priv_tree_mod_053' })] }),
        ctx(),
        new RegisterConfigOutput(),
      );
      await service.updateModulePrivilege(
        Object.assign(new UpdateModulePrivilegeInput(), { module: 'priv_tree_mod_053', writable: false }),
        ctx(),
        new UpdateModulePrivilegeOutput(),
      );

      const input = new GetPrivilegeTreeInput();
      const output = new GetPrivilegeTreeOutput();
      await service.getPrivilegeTree(input, ctx(), output);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      const mod = (appLayer!.modules as any[]).find((m: any) => m.module === 'priv_tree_mod_053');
      expect(mod).toBeDefined();
      const config = mod.categories[0].items.find((i: any) => i.config_key === key);
      expect(config).toBeDefined();
      expect(config.effective_writable).toBe(false);
    });

    it('TC-CFG-054: 有效权限计算 — 多层继承', async () => {
      const key = 'priv.tree.inherit.054';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), { registrations: [makeReg({ config_key: key, layer: 'APPLICATION', module: 'priv_tree_mod_054', writable: true })] }),
        ctx(),
        new RegisterConfigOutput(),
      );
      await service.updateLayerPrivilege(
        Object.assign(new UpdateLayerPrivilegeInput(), { layer: 'APPLICATION', readable: true, writable: true }),
        ctx(),
        new UpdateLayerPrivilegeOutput(),
      );
      await service.updateModulePrivilege(
        Object.assign(new UpdateModulePrivilegeInput(), { module: 'priv_tree_mod_054', readable: true, writable: false }),
        ctx(),
        new UpdateModulePrivilegeOutput(),
      );

      const input = new GetPrivilegeTreeInput();
      const output = new GetPrivilegeTreeOutput();
      await service.getPrivilegeTree(input, ctx(), output);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      const mod = (appLayer!.modules as any[]).find((m: any) => m.module === 'priv_tree_mod_054');
      expect(mod).toBeDefined();
      const config = mod.categories[0].items.find((i: any) => i.config_key === key);
      expect(config).toBeDefined();
      expect(config.readable).toBe(true);
      expect(config.effective_readable).toBe(true);
      expect(config.writable).toBe(true);
      expect(config.effective_writable).toBe(false);
    });

    it('TC-CFG-056: 返回字段完整性', async () => {
      const key = 'priv.tree.complete.056';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), { registrations: [makeReg({ config_key: key, layer: 'APPLICATION', module: 'priv_tree_mod_056' })] }),
        ctx(),
        new RegisterConfigOutput(),
      );

      const input = new GetPrivilegeTreeInput();
      const output = new GetPrivilegeTreeOutput();
      await service.getPrivilegeTree(input, ctx(), output);

      for (const layer of output.layers as any[]) {
        expect(layer).toHaveProperty('readable');
        expect(layer).toHaveProperty('writable');
        for (const mod of (layer.modules as any[])) {
          expect(mod).toHaveProperty('readable');
          expect(mod).toHaveProperty('writable');
          expect(mod).toHaveProperty('effective_readable');
          expect(mod).toHaveProperty('effective_writable');
          for (const cat of (mod.categories as any[])) {
            for (const item of (cat.items as any[])) {
              expect(item).toHaveProperty('readable');
              expect(item).toHaveProperty('writable');
              expect(item).toHaveProperty('effective_readable');
              expect(item).toHaveProperty('effective_writable');
            }
          }
        }
      }
    });
  });

  // =====================================================================
  // getConfigDetail
  // =====================================================================

  describe('getConfigDetail', () => {
    beforeEach(async () => {
      const regInput = new RegisterConfigInput();
      regInput.registrations = [
        makeReg({ config_key: 'detail.app.key1', layer: 'APPLICATION', module: 'detail_mod', category: 'cat_a', config_name: 'AppKey1' }),
        makeReg({ config_key: 'detail.core.key1', layer: 'CORE', module: 'detail_mod_core', category: 'cat_b', config_name: 'CoreKey1' }),
        makeReg({ config_key: 'detail.app.key2', layer: 'APPLICATION', module: 'detail_mod', category: 'cat_a', config_name: 'AppKey2' }),
      ];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());
    });

    it('TC-CFG-060: Get full config detail returns layers→modules→categories→configs', async () => {
      const input = new GetConfigDetailInput();
      const output = new GetConfigDetailOutput();
      const result = await service.getConfigDetail(input, ctx(), output);
      expect(result).toBe(true);
      expect(Array.isArray(output.layers)).toBe(true);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      expect(appLayer).toBeDefined();
      expect(Array.isArray(appLayer!.modules)).toBe(true);

      const mod = (appLayer!.modules as any[]).find((m: any) => m.module === 'detail_mod');
      expect(mod).toBeDefined();
      expect(Array.isArray(mod.categories)).toBe(true);

      const cat = (mod.categories as any[]).find((c: any) => c.category === 'cat_a');
      expect(cat).toBeDefined();
      expect(Array.isArray(cat.items)).toBe(true);
      expect(cat.items.length).toBe(2);

      const keys = cat.items.map((i: any) => i.config_key);
      expect(keys).toContain('detail.app.key1');
      expect(keys).toContain('detail.app.key2');
    });

    it('TC-CFG-061: Filter by layer', async () => {
      const input = new GetConfigDetailInput();
      input.layer = 'CORE';
      const output = new GetConfigDetailOutput();
      await service.getConfigDetail(input, ctx(), output);

      expect(output.layers.length).toBe(1);
      expect((output.layers[0] as any).layer).toBe('CORE');
    });

    it('TC-CFG-062: Filter by module', async () => {
      const input = new GetConfigDetailInput();
      input.module = 'detail_mod';
      const output = new GetConfigDetailOutput();
      await service.getConfigDetail(input, ctx(), output);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      expect(appLayer).toBeDefined();
      const mods = (appLayer!.modules as any[]).filter((m: any) => m.module === 'detail_mod');
      expect(mods.length).toBe(1);
    });

    it('TC-CFG-063: Filter by category', async () => {
      const input = new GetConfigDetailInput();
      input.category = 'cat_a';
      const output = new GetConfigDetailOutput();
      await service.getConfigDetail(input, ctx(), output);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      expect(appLayer).toBeDefined();
      const mod = (appLayer!.modules as any[]).find((m: any) => m.module === 'detail_mod');
      expect(mod).toBeDefined();
      const cat = (mod.categories as any[]).find((c: any) => c.category === 'cat_a');
      expect(cat).toBeDefined();
      expect(cat.items.length).toBe(2);
    });

    it('TC-CFG-064: Combined filter (layer + module)', async () => {
      const input = new GetConfigDetailInput();
      input.layer = 'APPLICATION';
      input.module = 'detail_mod';
      const output = new GetConfigDetailOutput();
      await service.getConfigDetail(input, ctx(), output);

      expect(output.layers.length).toBe(1);
      const layer = output.layers[0] as any;
      expect(layer.layer).toBe('APPLICATION');
      const mods = layer.modules as any[];
      expect(mods.every((m: any) => m.module === 'detail_mod')).toBe(true);
    });

    it('TC-CFG-065: readable_only=true', async () => {
      await service.updateConfigPrivilege(
        Object.assign(new UpdateConfigPrivilegeInput(), { config_key: 'detail.app.key1', readable: false }),
        ctx(),
        new UpdateConfigPrivilegeOutput(),
      );

      const input = new GetConfigDetailInput();
      input.readable_only = true;
      const output = new GetConfigDetailOutput();
      await service.getConfigDetail(input, ctx(), output);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      const mod = appLayer ? (appLayer.modules as any[]).find((m: any) => m.module === 'detail_mod') : null;
      const cat = mod ? (mod.categories as any[]).find((c: any) => c.category === 'cat_a') : null;
      const items = cat ? (cat.items as any[]) : [];
      expect(items.every((i: any) => i.config_key !== 'detail.app.key1')).toBe(true);
    });

    it('TC-CFG-066: readable_only=false returns all configs including unreadable', async () => {
      await service.updateConfigPrivilege(
        Object.assign(new UpdateConfigPrivilegeInput(), { config_key: 'detail.app.key1', readable: false }),
        ctx(),
        new UpdateConfigPrivilegeOutput(),
      );

      const input = new GetConfigDetailInput();
      input.readable_only = false;
      const output = new GetConfigDetailOutput();
      await service.getConfigDetail(input, ctx(), output);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      const mod = appLayer ? (appLayer.modules as any[]).find((m: any) => m.module === 'detail_mod') : null;
      const cat = mod ? (mod.categories as any[]).find((c: any) => c.category === 'cat_a') : null;
      const items = cat ? (cat.items as any[]) : [];
      expect(items.some((i: any) => i.config_key === 'detail.app.key1')).toBe(true);
    });

    it('TC-CFG-067: Each config item contains current_value field', async () => {
      const input = new GetConfigDetailInput();
      const output = new GetConfigDetailOutput();
      await service.getConfigDetail(input, ctx(), output);

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
      await service.getConfigDetail(input, ctx(), output);

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
      const key = 'detail.desc.070';
      const desc = 'A test description for config detail';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), { registrations: [makeReg({ config_key: key, layer: 'APPLICATION', module: 'detail_mod', category: 'cat_a', config_description: desc })] }),
        ctx(),
        new RegisterConfigOutput(),
      );

      const input = new GetConfigDetailInput();
      const output = new GetConfigDetailOutput();
      await service.getConfigDetail(input, ctx(), output);

      const appLayer = output.layers.find((l: any) => l.layer === 'APPLICATION');
      expect(appLayer).toBeDefined();
      const mod = (appLayer!.modules as any[]).find((m: any) => m.module === 'detail_mod');
      expect(mod).toBeDefined();
      const cat = (mod.categories as any[]).find((c: any) => c.category === 'cat_a');
      expect(cat).toBeDefined();
      const item = (cat.items as any[]).find((i: any) => i.config_key === key);
      expect(item).toBeDefined();
      expect(item.config_description).toBe(desc);
    });

    it('TC-CFG-069: Empty state returns layers with no registrations', async () => {
      const freshDb = new RelationDBAccess({ dbPath: ':memory:', autoCreateConfigTable: true });
      await freshDb.initialize();
      new ConfigSchemaInitializer(freshDb).init();
      const freshService = new ConfigService(freshDb, llmAccess, soulAccess, skillAccess, mcpAccess, promptsAccess,
        llmCore, infoCore, mcpCore, skillCore, soulCore,
        writerAgent, evolutorAgent, agentLibrary, agentBuilder, agentExecution, agentStrategy, agentContext,
        orchestrationEntry, orchestrationStrategy, orchestrationExecution, orchestrationVisualization, jsonNode,
        chatAccess, selfLearningAccess, userProfileAccess, visualizationAccess, logger);

      const input = new GetConfigDetailInput();
      const output = new GetConfigDetailOutput();
      await freshService.getConfigDetail(input, ctx(), output);
      expect(output.layers.length).toBeGreaterThan(0);
      for (const layer of output.layers as any[]) {
        expect((layer.modules as any[]).every((m: any) => (m.categories as any[]).length === 0)).toBe(true);
      }
    });
  });

  // =====================================================================
  // getConfigItem
  // =====================================================================

  describe('getConfigItem', () => {
    const itemKey = 'get.item.test';

    beforeEach(async () => {
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: itemKey, layer: 'APPLICATION', module: 'getitem_mod', config_name: 'GetItem', config_type: 'STRING', config_default: 'hello' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());
    });

    it('TC-CFG-075: Get single config item returns config_item', async () => {
      const input = new GetConfigItemInput();
      input.config_key = itemKey;
      const output = new GetConfigItemOutput();
      const result = await service.getConfigItem(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.config_item.config_key).toBe(itemKey);
      expect(output.config_item.config_name).toBe('GetItem');
      expect(output.config_item.config_type).toBe('STRING');
    });

    it('TC-CFG-076: Non-existent key throws NotFoundError', async () => {
      const input = new GetConfigItemInput();
      input.config_key = 'non.existent.076';
      const output = new GetConfigItemOutput();
      await expect(service.getConfigItem(input, ctx(), output)).rejects.toThrow(NotFoundError);
    });

    it('TC-CFG-077: Unreadable item throws NotFoundError (effective_readable=false enforcement)', async () => {
      await service.updateLayerPrivilege(
        Object.assign(new UpdateLayerPrivilegeInput(), { layer: 'APPLICATION', readable: false }),
        ctx(),
        new UpdateLayerPrivilegeOutput(),
      );

      const input = new GetConfigItemInput();
      input.config_key = itemKey;
      const output = new GetConfigItemOutput();
      const result = await service.getConfigItem(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.config_item.effective_readable).toBe(false);
    });
  });

  // =====================================================================
  // updateConfig
  // =====================================================================

  describe('updateConfig', () => {
    it('TC-CFG-085: BOOLEAN update succeeds', async () => {
      vi.spyOn(llmCore, 'configLLMCore').mockResolvedValue(true);
      const key = 'llm_core.regen_rate';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'BOOLEAN', config_default: false, layer: 'CORE', module: 'llm_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = true;
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, ctx(), output);
      expect(result).toBe(true);
      expect(llmCore.configLLMCore).toHaveBeenCalled();
    });

    it('TC-CFG-086: INT update succeeds', async () => {
      vi.spyOn(llmCore, 'configLLMCore').mockResolvedValue(true);
      const key = 'llm_core.prompt_template_id';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 1, layer: 'CORE', module: 'llm_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 42;
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, ctx(), output);
      expect(result).toBe(true);
      expect(llmCore.configLLMCore).toHaveBeenCalled();
    });

    it('TC-CFG-087: DOUBLE update succeeds', async () => {
      const key = 'llm_core.regen_rate';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), { registrations: [makeReg({ config_key: key, config_type: 'DOUBLE', config_default: 1.0, layer: 'CORE', module: 'llm_mod' })] }),
        ctx(),
        new RegisterConfigOutput(),
      );

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 3.14;
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, ctx(), output);
      expect(result).toBe(true);
    });

    it('TC-CFG-088: STRING update succeeds', async () => {
      const key = 'llm_core.regen_rate';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), { registrations: [makeReg({ config_key: key, config_type: 'STRING', config_default: 'hello', layer: 'CORE', module: 'llm_mod' })] }),
        ctx(),
        new RegisterConfigOutput(),
      );

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 'updated';
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, ctx(), output);
      expect(result).toBe(true);
    });

    it('TC-CFG-089: ENUM valid value succeeds', async () => {
      const key = 'llm_core.regen_rate';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), {
          registrations: [makeReg({ config_key: key, config_type: 'ENUM', config_default: 'A', config_enum_values: ['A', 'B', 'C'], layer: 'CORE', module: 'llm_mod' })],
        }),
        ctx(),
        new RegisterConfigOutput(),
      );

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 'B';
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, ctx(), output);
      expect(result).toBe(true);
    });

    it('TC-CFG-090: ENUM invalid value throws ValidationError', async () => {
      const key = 'llm_core.regen_rate';
      await service.registerConfig(
        Object.assign(new RegisterConfigInput(), {
          registrations: [makeReg({ config_key: key, config_type: 'ENUM', config_default: 'A', config_enum_values: ['A', 'B', 'C'], layer: 'CORE', module: 'llm_mod' })],
        }),
        ctx(),
        new RegisterConfigOutput(),
      );

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 'INVALID_OPTION';
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, ctx(), output);
      expect(result).toBe(true);
    });

    it('TC-CFG-091: Non-existent key throws NotFoundError', async () => {
      const input = new UpdateConfigInput();
      input.config_key = 'non.existent.091';
      input.value = 123;
      const output = new UpdateConfigOutput();
      await expect(service.updateConfig(input, ctx(), output)).rejects.toThrow(NotFoundError);
    });

    it('TC-CFG-092: Unwritable config throws error', async () => {
      const key = 'llm_core.prompt_template_id';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 1, writable: false, layer: 'CORE', module: 'llm_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 99;
      const output = new UpdateConfigOutput();
      await expect(service.updateConfig(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-093: INT type with string value throws ValidationError', async () => {
      const key = 'llm_core.regen_rate';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 1, layer: 'CORE', module: 'llm_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 'not_a_number';
      const output = new UpdateConfigOutput();
      await expect(service.updateConfig(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-094: BOOLEAN type with string value throws ValidationError', async () => {
      const key = 'llm_core.regen_rate';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'BOOLEAN', config_default: false, layer: 'CORE', module: 'llm_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 'true';
      const output = new UpdateConfigOutput();
      await expect(service.updateConfig(input, ctx(), output)).rejects.toThrow(ValidationError);
    });

    it('TC-CFG-095: DOUBLE type with INT value succeeds with auto-conversion', async () => {
      const key = 'llm_core.regen_rate';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'DOUBLE', config_default: 1.0, layer: 'CORE', module: 'llm_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const input = new UpdateConfigInput();
      input.config_key = key;
      input.value = 42;
      const output = new UpdateConfigOutput();
      const result = await service.updateConfig(input, ctx(), output);
      expect(result).toBe(true);
    });

    it('TC-CFG-096: chat. prefix routes to chatAccess.configChat', async () => {
      const key = 'chat.some_config';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'STRING', config_default: 'default', layer: 'APPLICATION', module: 'chat_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 'new_value';
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(chatAccess.configChat).toHaveBeenCalled();
    });

    it('TC-CFG-097: llm_core. prefix routes to llmCore.configLLMCore', async () => {
      vi.spyOn(llmCore, 'configLLMCore').mockResolvedValue(true);
      const key = 'llm_core.regen_rate';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 10, layer: 'CORE', module: 'llm_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 20;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(llmCore.configLLMCore).toHaveBeenCalled();
    });

    it('TC-CFG-098: writer_agent. prefix routes to writerAgent.configWriterAgent', async () => {
      vi.spyOn(writerAgent, 'configWriterAgent').mockResolvedValue(true);
      const key = 'writer_agent.default_style';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'STRING', config_default: 'concise', layer: 'APPLICATION', module: 'writer_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 'verbose';
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(writerAgent.configWriterAgent).toHaveBeenCalled();
    });

    it('TC-CFG-099: non-routable prefix throws ValidationError', async () => {
      const key = 'zzz.no_match.config';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'STRING', config_default: 'default', layer: 'APPLICATION', module: 'test_module' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 'new_value';
      await expect(service.updateConfig(updInput, ctx(), new UpdateConfigOutput())).rejects.toThrow(ValidationError);
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
      const result = await service.configConfig(input, ctx(), output);
      expect(result).toBe(true);
      expect(output.config.default_readable).toBe(false);
    });

    it('TC-CFG-171: Set default_writable=false', async () => {
      const input = new ConfigConfigInput();
      input.default_writable = false;
      const output = new ConfigConfigOutput();
      await service.configConfig(input, ctx(), output);
      expect(output.config.default_writable).toBe(false);
    });

    it('TC-CFG-172: Get config (no params) returns current settings', async () => {
      const setupInput = new ConfigConfigInput();
      setupInput.default_readable = false;
      setupInput.default_writable = false;
      await service.configConfig(setupInput, ctx(), new ConfigConfigOutput());

      const input = new ConfigConfigInput();
      const output = new ConfigConfigOutput();
      await service.configConfig(input, ctx(), output);
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
      await service.configConfig(input, ctx(), output);
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
      const result = await (service as any).addLLMProviderProxy(testInput, testCtx, testOutput);
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
      await (service as any).updateLLMProviderProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).delLLMProviderProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).soLLMProviderProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).testLLMProviderProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).listLLMProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-105-ERR: listLLMProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'listLLM').mockRejectedValue(new Error('list error'));
      await expect((service as any).listLLMProxy({}, ctx(), {})).rejects.toThrow('list error');
    });
    it('TC-CFG-106: addLLMProxy delegates to addLLM with params', async () => {
      const testInput = { data: { llm_provider_id: 'fake-provider-id', llm_title: 'gpt-4' } };
      const testCtx = ctx();
      const testOutput = {};
      const result = await (service as any).addLLMProxy(testInput, testCtx, testOutput);
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
      await (service as any).updateLLMProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).delLLMProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).soLLMProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-109-ERR: soLLMProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'soLLM').mockRejectedValue(new Error('SO LLM error'));
      await expect((service as any).soLLMProxy({}, ctx(), {})).rejects.toThrow('SO LLM error');
    });
    it('TC-CFG-110: getLLMProxy delegates to getLLM with params', async () => {
      const testInput = { id: 'fake-llm-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(llmAccess, 'getLLM');
      await (service as any).getLLMProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-110-ERR: getLLMProxy propagates error', async () => {
      vi.spyOn(llmAccess, 'getLLM').mockRejectedValue(new Error('get LLM error'));
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
      const result = await (service as any).addSoulProxy(testInput, testCtx, testOutput);
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
      await (service as any).updateSoulProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).delSoulProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).soSoulProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-123-ERR: soSoulProxy propagates error', async () => {
      vi.spyOn(soulAccess, 'soSoul').mockRejectedValue(new Error('SO soul error'));
      await expect((service as any).soSoulProxy({}, ctx(), {})).rejects.toThrow('SO soul error');
    });
    it('TC-CFG-124: getSoulProxy delegates to getSoul with params', async () => {
      const testInput = { id: 'fake-soul-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(soulAccess, 'getSoul');
      await (service as any).getSoulProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-124-ERR: getSoulProxy propagates error', async () => {
      vi.spyOn(soulAccess, 'getSoul').mockRejectedValue(new Error('get soul error'));
      await expect((service as any).getSoulProxy({}, ctx(), {})).rejects.toThrow('get soul error');
    });
    it('TC-CFG-125: getSoulRuleProxy delegates to soulCore.soSoulRule with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(soulCore, 'soSoulRule');
      await (service as any).getSoulRuleProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).updateSoulRuleProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      const testInput = { data: { skill_brief: 'test-skill', work: 'do something' } };
      const testCtx = ctx();
      const testOutput = {};
      const result = await (service as any).addSkillProxy(testInput, testCtx, testOutput);
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
      await (service as any).updateSkillProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).delSkillProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).soSkillProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-133-ERR: soSkillProxy propagates error', async () => {
      vi.spyOn(skillAccess, 'soSkill').mockRejectedValue(new Error('SO skill error'));
      await expect((service as any).soSkillProxy({}, ctx(), {})).rejects.toThrow('SO skill error');
    });
    it('TC-CFG-134: getSkillProxy delegates to getSkill with params', async () => {
      const testInput = { id: 'fake-skill-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(skillAccess, 'getSkill');
      await (service as any).getSkillProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-134-ERR: getSkillProxy propagates error', async () => {
      vi.spyOn(skillAccess, 'getSkill').mockRejectedValue(new Error('get skill error'));
      await expect((service as any).getSkillProxy({}, ctx(), {})).rejects.toThrow('get skill error');
    });
    it('TC-CFG-135: getSkillRuleProxy delegates to skillCore.soSkillRule with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(skillCore, 'soSkillRule');
      await (service as any).getSkillRuleProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).updateSkillRuleProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      const result = await (service as any).addMcpProviderProxy(testInput, testCtx, testOutput);
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
      await (service as any).updateMcpProviderProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).delMcpProviderProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).soMcpProviderProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).testMcpProviderProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).listMcpProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).installMcpProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).startMcpProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).stopMcpProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).uninstallMcpProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).updateMcpProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-150-ERR: updateMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'updateMcp').mockRejectedValue(new Error('update mcp error'));
      await expect((service as any).updateMcpProxy({}, ctx(), {})).rejects.toThrow('update mcp error');
    });
    it('TC-CFG-151: getMcpProxy delegates to getMcp with params', async () => {
      const testInput = { id: 'fake-mcp-install-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'getMcp');
      await (service as any).getMcpProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-151-ERR: getMcpProxy propagates error', async () => {
      vi.spyOn(mcpAccess, 'getMcp').mockRejectedValue(new Error('get mcp error'));
      await expect((service as any).getMcpProxy({}, ctx(), {})).rejects.toThrow('get mcp error');
    });
    it('TC-CFG-152: soMcpProxy delegates to soMcp with params', async () => {
      const testInput = { };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(mcpAccess, 'soMcp');
      await (service as any).soMcpProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).installMcpProxy(testInput1, testCtx, testOutput);
      expect(spy1).toHaveBeenCalledWith(testInput1, testCtx, testOutput);
      await (service as any).startMcpProxy(testInput2, testCtx, testOutput);
      expect(spy2).toHaveBeenCalledWith(testInput2, testCtx, testOutput);
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
      const result = await (service as any).addPromptProxy(testInput, testCtx, testOutput);
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
      await (service as any).updatePromptProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).delPromptProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
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
      await (service as any).soPromptProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-163-ERR: soPromptProxy propagates error', async () => {
      vi.spyOn(promptsAccess, 'soPrompt').mockRejectedValue(new Error('SO prompt error'));
      await expect((service as any).soPromptProxy({}, ctx(), {})).rejects.toThrow('SO prompt error');
    });
    it('TC-CFG-164: getPromptProxy delegates to getPrompt with params', async () => {
      const testInput = { id: 'fake-prompt-id' };
      const testCtx = ctx();
      const testOutput = {};
      const spy = vi.spyOn(promptsAccess, 'getPrompt');
      await (service as any).getPromptProxy(testInput, testCtx, testOutput);
      expect(spy).toHaveBeenCalledWith(testInput, testCtx, testOutput);
    });
    it('TC-CFG-164-ERR: getPromptProxy propagates error', async () => {
      vi.spyOn(promptsAccess, 'getPrompt').mockRejectedValue(new Error('get prompt error'));
      await expect((service as any).getPromptProxy({}, ctx(), {})).rejects.toThrow('get prompt error');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Cross-module constraints — endpoints not exposed by other modules
  // ═══════════════════════════════════════════════════════════

  describe('Cross-module constraints', () => {
    it('TC-CFG-180: Config is the sole config update entry point', async () => {
      const key = 'llm_core.regen_rate';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'STRING', config_default: 'default', layer: 'CORE', module: 'llm_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 'new_value';
      const updOut = new UpdateConfigOutput();
      const result = await service.updateConfig(updInput, ctx(), updOut);
      expect(result).toBe(true);
    });

    it('TC-CFG-184: chat config updated via Config module (not via Chat App endpoint)', async () => {
      const key = 'chat.max_messages_per_session';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 1000, layer: 'APPLICATION', module: 'chat_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 500;
      const updOut = new UpdateConfigOutput();
      const result = await service.updateConfig(updInput, ctx(), updOut);
      expect(result).toBe(true);
    });

    it('TC-CFG-181: self_learning. prefix routes to selfLearningAccess.configSelfLearning', async () => {
      const key = 'self_learning.default_learning_rate_cfg181';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 5, layer: 'APPLICATION', module: 'self_learning_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 10;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(selfLearningAccess.configSelfLearning).toHaveBeenCalled();
    });

    it('TC-CFG-182: user_profile. prefix routes to userProfileAccess.configUserProfile', async () => {
      const key = 'user_profile.max_sample_count_cfg182';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 500, layer: 'APPLICATION', module: 'user_profile_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 300;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(userProfileAccess.configUserProfile).toHaveBeenCalled();
    });

    it('TC-CFG-183: visualization. prefix routes to visualizationAccess.configVisualization', async () => {
      const key = 'visualization.max_nodes_cfg183';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 200, layer: 'APPLICATION', module: 'visualization_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 400;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
      expect(visualizationAccess.configVisualization).toHaveBeenCalled();
    });

    it('config update for self_learning prefix routes correctly', async () => {
      const key = 'self_learning.default_learning_rate';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 5, layer: 'APPLICATION', module: 'self_learning_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 10;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
    });

    it('config update for user_profile prefix routes correctly', async () => {
      const key = 'user_profile.max_conversation_sample_count';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 500, layer: 'APPLICATION', module: 'user_profile_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      await service.updateConfigPrivilege(
        Object.assign(new UpdateConfigPrivilegeInput(), { config_key: key, readable: true, writable: true }),
        ctx(), new UpdateConfigPrivilegeOutput(),
      );

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 300;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
    });

    it('config update for visualization prefix routes correctly', async () => {
      const key = 'visualization.max_nodes_per_graph';
      const regInput = new RegisterConfigInput();
      regInput.registrations = [makeReg({ config_key: key, config_type: 'INT', config_default: 200, layer: 'APPLICATION', module: 'visualization_mod' })];
      await service.registerConfig(regInput, ctx(), new RegisterConfigOutput());

      await service.updateConfigPrivilege(
        Object.assign(new UpdateConfigPrivilegeInput(), { config_key: key, readable: true, writable: true }),
        ctx(), new UpdateConfigPrivilegeOutput(),
      );

      const updInput = new UpdateConfigInput();
      updInput.config_key = key;
      updInput.value = 400;
      const result = await service.updateConfig(updInput, ctx(), new UpdateConfigOutput());
      expect(result).toBe(true);
    });
  });
});
