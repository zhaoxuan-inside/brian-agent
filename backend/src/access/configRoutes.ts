import express from 'express';
import { LLMService, LLMConfig } from '../core/llm/LLMService';
import { MCPManager } from '../core/mcp/MCPManager';
import { SoulManager, SoulConfig } from '../core/soul/SoulManager';
import { WorkManager, WorkConfig } from '../core/work/WorkManager';
import { ModelConfigService } from '../core/modelConfig/ModelConfigService';
import { ModelConfigService as LLMConfigService, ModelProvider } from '../core/llm/modelConfig';
import { logger } from '../infrastructure/logger';
import { getConfig, updateConfig } from '../infrastructure/config';

export function createConfigRoutes(
  llmService: LLMService,
  mcpManager: MCPManager,
  soulManager: SoulManager,
  workManager: WorkManager,
  modelConfigService: ModelConfigService
): express.Router {
  const router = express.Router();
  const llmConfigService = new LLMConfigService();

  // ── 默认配置 ──

  /**
   * GET /api/config/defaults — 获取速率限制默认配置（从配置服务读取）
   */
  router.get('/defaults', (_req, res) => {
    const appConfig = getConfig();
    const rl = appConfig.rateLimits;
    res.json({
      dailyTokens: rl.daily,
      weeklyTokens: rl.weekly,
      monthlyTokens: rl.monthly,
      dailyCalls: rl.dailyCalls,
      weeklyCalls: rl.weeklyCalls,
      monthlyCalls: rl.monthlyCalls,
    });
  });

  /**
   * PUT /api/config/defaults — 更新速率限制配置（用户自定义）
   */
  router.put('/defaults', (req, res) => {
    try {
      const { dailyTokens, weeklyTokens, monthlyTokens, dailyCalls, weeklyCalls, monthlyCalls } = req.body;
      const appConfig = getConfig();
      const rl = { ...appConfig.rateLimits };

      if (typeof dailyTokens === 'number' && dailyTokens > 0) rl.daily = dailyTokens;
      if (typeof weeklyTokens === 'number' && weeklyTokens > 0) rl.weekly = weeklyTokens;
      if (typeof monthlyTokens === 'number' && monthlyTokens > 0) rl.monthly = monthlyTokens;
      if (typeof dailyCalls === 'number' && dailyCalls > 0) rl.dailyCalls = dailyCalls;
      if (typeof weeklyCalls === 'number' && weeklyCalls > 0) rl.weeklyCalls = weeklyCalls;
      if (typeof monthlyCalls === 'number' && monthlyCalls > 0) rl.monthlyCalls = monthlyCalls;

      updateConfig({ rateLimits: rl });
      logger.info('Config', `Rate limits updated: ${JSON.stringify(rl)}`);
      res.json({
        dailyTokens: rl.daily,
        weeklyTokens: rl.weekly,
        monthlyTokens: rl.monthly,
        dailyCalls: rl.dailyCalls,
        weeklyCalls: rl.weeklyCalls,
        monthlyCalls: rl.monthlyCalls,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'CONFIG_ERROR' });
    }
  });

  // ── 提供商配置路由 ──

  /**
   * GET /api/config — 获取完整配置（含提供商列表，API Key 掩码）
   */
  router.get('/', (_req, res) => {
    try {
      const config = llmConfigService.getConfig();
      const masked = {
        ...config,
        providers: config.providers.map(p => ({
          ...p,
          apiKey: p.apiKey ? '••••••••' + p.apiKey.slice(-4) : '',
        })),
      };
      res.json(masked);
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'CONFIG_ERROR' });
    }
  });

  /**
   * PUT /api/config — 保存模型配置
   */
  router.put('/', (req, res) => {
    try {
      const data = req.body as Record<string, any>;
      const config = llmConfigService.getConfig();
      if (data.providers) {
        config.providers = data.providers;
      }
      if (data.selectedProviderId) config.selectedProviderId = data.selectedProviderId;
      if (data.selectedModelId) config.selectedModelId = data.selectedModelId;
      if (data.temperature !== undefined) config.temperature = data.temperature;
      if (data.maxTokens !== undefined) config.maxTokens = data.maxTokens;
      llmConfigService.saveConfig(config);
      res.json({ ok: true, data: config });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'SAVE_ERROR' });
    }
  });

  /**
   * POST /api/config/provider — 添加模型提供商
   */
  router.post('/provider', (req, res) => {
    try {
      const { id, name, type, baseUrl, apiKey, models } = req.body;

      if (!id || !name || !type) {
        res.status(400).json({ error: 'id, name, and type are required', code: 'VALIDATION_ERROR' });
        return;
      }

      const config = llmConfigService.getConfig();
      const existing = config.providers.find(p => p.id === id);
      if (existing) {
        res.status(409).json({ error: 'Provider with this ID already exists', code: 'DUPLICATE_PROVIDER' });
        return;
      }

      const newProvider: ModelProvider = {
        id,
        name,
        type,
        baseUrl: baseUrl || '',
        apiKey: apiKey || '',
        models: models || [],
        enabled: false, // 默认不启用，需用户手动配置后启用
      };

      config.providers.push(newProvider);
      llmConfigService.saveConfig(config);

      logger.info('Config', `Provider added: ${id}`);
      res.status(201).json({
        ...newProvider,
        apiKey: newProvider.apiKey ? '••••••••' + newProvider.apiKey.slice(-4) : '',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'PROVIDER_ERROR' });
    }
  });

  /**
   * PUT /api/config/provider/:id — 更新模型提供商
   */
  router.put('/provider/:id', (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Don't overwrite real API key with masked value
      if (typeof updates.apiKey === 'string' && updates.apiKey.startsWith('••••')) {
        delete updates.apiKey;
      }

      const updated = llmConfigService.updateProvider(id, updates);
      if (!updated) {
        res.status(404).json({ error: 'Provider not found', code: 'NOT_FOUND' });
        return;
      }

      logger.info('Config', `Provider updated: ${id}`);
      res.json({
        ...updated,
        apiKey: updated.apiKey ? '••••••••' + updated.apiKey.slice(-4) : '',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'PROVIDER_ERROR' });
    }
  });

  /**
   * POST /api/config/provider/:id/test — 测试提供商连接
   */
  router.post('/provider/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      const config = llmConfigService.getConfig();
      const provider = config.providers.find(p => p.id === id);
      if (!provider) {
        res.status(404).json({ error: 'Provider not found', code: 'NOT_FOUND' });
        return;
      }
      if (!provider.apiKey) {
        res.json({ success: false, message: 'API Key 未配置', latency: 0 });
        return;
      }

      const start = Date.now();
      const url = provider.baseUrl.replace(/\/+$/, '') + '/models';
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${provider.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      const latency = Date.now() - start;

      if (response.ok) {
        res.json({ success: true, message: '连接成功', latency });
      } else {
        res.json({ success: false, message: `HTTP ${response.status}: ${response.statusText}`, latency });
      }
    } catch (err: any) {
      res.json({ success: false, message: err.message, latency: 0 });
    }
  });

  /**
   * POST /api/config/verify/:providerId?model=xxx — 验证单个模型连接
   */
  router.post('/verify/:providerId', async (req, res) => {
    try {
      const { providerId } = req.params;
      const modelId = req.query.model as string;
      if (!modelId) {
        res.status(400).json({ ok: false, message: '缺少 model 参数' });
        return;
      }
      const config = llmConfigService.getConfig();
      const provider = config.providers.find(p => p.id === providerId);
      if (!provider) {
        res.status(404).json({ ok: false, message: 'Provider not found' });
        return;
      }
      if (!provider.apiKey) {
        res.json({ ok: false, message: 'API Key 未配置' });
        return;
      }
      const start = Date.now();
      const url = provider.baseUrl.replace(/\/+$/, '') + '/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const latency = Date.now() - start;
      if (response.ok) {
        res.json({ ok: true, message: '验证成功', latency });
      } else {
        const errText = await response.text().catch(() => '');
        let message = `HTTP ${response.status}`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error?.message) {
            message = errJson.error.message;
          } else if (errJson.message) {
            message = errJson.message;
          } else {
            message += ': ' + errText.slice(0, 500);
          }
        } catch {
          message += ': ' + errText.slice(0, 500);
        }
        res.json({ ok: false, message, latency });
      }
    } catch (err: any) {
      res.json({ ok: false, message: err.message, latency: 0 });
    }
  });

  /**
   * DELETE /api/config/provider/:id — 删除/重置模型提供商
   * 默认提供商重置为禁用+清空Key，自定义提供商从列表移除
   */
  router.delete('/provider/:id', (req, res) => {
    try {
      const { id } = req.params;
      const ok = llmConfigService.removeProvider(id);
      if (!ok) {
        res.status(404).json({ error: 'Provider not found', code: 'NOT_FOUND' });
        return;
      }
      logger.info('Config', `Provider removed/reset: ${id}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'PROVIDER_ERROR' });
    }
  });

  /**
   * POST /api/config/provider/:id/fetch-models — 调用提供商API获取最新模型列表
   * 后端根据 providerId 从DB读取 apiUrl/apiKey，调用提供商 /models 接口
   * 成功: 更新DB模型表，返回 { code: 200, msg: "获取成功", models? }
   * 失败: 不更新DB，返回 { code: 4xx/5xx, msg: "获取失败", content: "错误详情" }
   * 始终返回 HTTP 200，前端通过 JSON.code 字段判断
   */
  router.post('/provider/:id/fetch-models', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await llmConfigService.fetchModels(id);
      logger.info('Config', `Fetch models for ${id}: code=${result.code} msg=${result.msg}`);
      res.json(result);
    } catch (err: any) {
      logger.error('Config', `Fetch models failed for ${req.params.id}: ${err.message}`);
      res.json({ code: 500, msg: '获取失败', content: err.message });
    }
  });

  /**
   * GET /api/config/provider/:id/models — 获取指定提供商的模型列表（从DB读取）
   * 用于前端在"获取最新模型"成功后刷新模型列表
   */
  router.get('/provider/:id/models', (req, res) => {
    try {
      const { id } = req.params;
      const config = llmConfigService.getConfig();
      const provider = config.providers.find(p => p.id === id);
      if (!provider) {
        res.status(404).json({ error: 'Provider not found', code: 'NOT_FOUND' });
        return;
      }
      res.json({ models: provider.models || [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message, code: 'PROVIDER_ERROR' });
    }
  });

  router.get('/llm', async (req, res) => {
    try {
      const configs = await llmService.getAllConfigs();
      res.json(configs);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/llm', async (req, res) => {
    try {
      const config = req.body as LLMConfig;
      await llmService.addConfig(config);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/llm/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const config = req.body as LLMConfig;
      await llmService.updateConfig(id, config);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.delete('/llm/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await llmService.removeConfig(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/mcp', async (req, res) => {
    try {
      const mcps = await mcpManager.listMCPS();
      res.json(mcps);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/mcp/install', async (req, res) => {
    try {
      const { name, version, url, userId, description, category, author } = req.body;
      const result = await mcpManager.installMCP({
        userId: userId || '',
        name,
        description: description || '',
        category: category || 'general',
        icon: '',
        version: version || '1.0.0',
        author: author || 'unknown',
        functions: [],
        config: url ? { url } : {},
        isInstalled: true,
        enabled: true,
        effectivenessScore: 0,
        usageCount: 0,
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/mcp/uninstall/:name', async (req, res) => {
    try {
      const { name } = req.params;
      const mcps = await mcpManager.listMCPS();
      const mcp = mcps.find(m => m.name === name);
      if (mcp) {
        await mcpManager.uninstallMCP(mcp.id);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/mcp/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const mcp = await mcpManager.updateMCP(id, req.body);
      res.json(mcp);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/soul', async (req, res) => {
    try {
      const souls = await soulManager.listSouls();
      res.json(souls);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/soul', async (req, res) => {
    try {
      const config = req.body as SoulConfig;
      const soul = await soulManager.createSoul(config);
      res.json(soul);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/soul/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const config = req.body as Partial<SoulConfig>;
      const soul = await soulManager.updateSoul(id, config);
      res.json(soul);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.delete('/soul/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await soulManager.deleteSoul(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/work', async (req, res) => {
    try {
      const works = await workManager.listWorks();
      res.json(works);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/work', async (req, res) => {
    try {
      const config = req.body as WorkConfig;
      const work = await workManager.createWork(config);
      res.json(work);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.delete('/work/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await workManager.deleteWork(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/work/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const work = await workManager.updateWork(id, req.body);
      res.json(work);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ── 模型配置路由 ──

  /**
   * GET /api/config/model/defaults — 获取默认模型配置值（从配置服务读取）
   */
  router.get('/model/defaults', (_req, res) => {
    const appConfig = getConfig();
    const rl = appConfig.rateLimits;
    res.json({
      maxTokens: appConfig.llm.maxTokens,
      supportsVision: false,
      supportsTools: true,
      quotaTokensPerDay: rl.daily,
      quotaTokensPerWeek: rl.weekly,
      quotaTokensPerMonth: rl.monthly,
      quotaCallsPerDay: rl.dailyCalls,
      quotaCallsPerWeek: rl.weeklyCalls,
      quotaCallsPerMonth: rl.monthlyCalls,
      temperature: appConfig.llm.temperature,
      contextWindow: appConfig.llm.maxTokens,
    });
  });

  router.get('/model', async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      logger.info('ConfigRoutes', `[GET /model] userId=${userId || 'all'}`);
      const configs = await modelConfigService.listConfigs(userId);
      logger.info('ConfigRoutes', `[GET /model] returned ${configs.length} configs`);
      res.json(configs);
    } catch (error) {
      logger.error('ConfigRoutes', `[GET /model] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * POST /api/config/model/batch — 批量同步模型配置（仅接受 modelId 列表）
   * 接受: { providerId, modelIds: string[], userId? }
   * 对比该提供商已有配置：新增未存在的，移除未勾选的
   * 返回: { success: true, added: number, removed: number }
   */
  router.post('/model/batch', async (req, res) => {
    try {
      const { providerId, modelIds, userId } = req.body as {
        providerId: string;
        modelIds: string[];
        userId?: string;
      };

      if (!providerId || !Array.isArray(modelIds)) {
        logger.warn('ConfigRoutes', `[POST /model/batch] validation failed: missing providerId or modelIds`);
        res.status(400).json({ error: 'providerId and modelIds are required', code: 'VALIDATION_ERROR' });
        return;
      }

      logger.info('ConfigRoutes', `[POST /model/batch] providerId=${providerId} modelCount=${modelIds.length} userId=${userId || ''}`);

      const uid = userId || '';

      // 获取提供商的模型详情（用于填充 modelName, maxTokens 等字段）
      const llmConfig = llmConfigService.getConfig();
      const provider = llmConfig.providers.find(p => p.id === providerId);
      const providerModels = provider?.models || [];

      // 获取该提供商已有的用户模型配置
      const existingConfigs = await modelConfigService.listConfigsByProvider(providerId, uid);
      const existingModelIds = new Set(existingConfigs.map(c => c.modelId));
      const incomingModelIds = new Set(modelIds);

      let added = 0;
      let removed = 0;

      // 移除未勾选的模型
      for (const cfg of existingConfigs) {
        if (!incomingModelIds.has(cfg.modelId)) {
          await modelConfigService.deleteConfig(cfg.id);
          removed++;
        }
      }

      // 从配置服务读取速率限制默认值
      const appConfig = getConfig();
      const rl = appConfig.rateLimits;

      // 新增不存在的模型
      for (const modelId of modelIds) {
        if (!existingModelIds.has(modelId)) {
          const modelDetail = providerModels.find(m => m.id === modelId);
          await modelConfigService.createConfig({
            providerId,
            providerName: provider?.name || '',
            modelId,
            modelName: modelDetail?.name || modelId,
            userId: uid,
            maxTokens: modelDetail?.maxTokens ?? appConfig.llm.maxTokens,
            supportsVision: modelDetail?.supportsVision ?? false,
            supportsTools: modelDetail?.supportsTools ?? true,
            quotaTokensPerDay: rl.daily,
            quotaTokensPerWeek: rl.weekly,
            quotaTokensPerMonth: rl.monthly,
            quotaCallsPerDay: rl.dailyCalls,
            quotaCallsPerWeek: rl.weeklyCalls,
            quotaCallsPerMonth: rl.monthlyCalls,
            isDefault: false,
            status: 'active',
          });
          added++;
        }
      }

      logger.info('ConfigRoutes', `[POST /model/batch] done: added=${added} removed=${removed}`);
      llmService.invalidateModelCache();
      res.json({ success: true, added, removed });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * POST /api/config/model/:id/test — 测试模型连接
   * 接受 modelId，调用提供商发送简单测试请求
   * 返回: { success: boolean, message: string, latency: number }
   */
  router.post('/model/:id/test', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info('ConfigRoutes', `[POST /model/:id/test] id=${id}`);
      const modelConfig = await modelConfigService.getConfig(id);
      if (!modelConfig) {
        logger.warn('ConfigRoutes', `[POST /model/:id/test] model config not found: ${id}`);
        res.status(404).json({ success: false, message: '模型配置不存在', latency: 0 });
        return;
      }

      const llmConfig = llmConfigService.getConfig();
      const provider = llmConfig.providers.find(p => p.id === modelConfig.providerId);
      if (!provider) {
        logger.warn('ConfigRoutes', `[POST /model/:id/test] provider not found: ${modelConfig.providerId}`);
        res.status(404).json({ success: false, message: '提供商不存在', latency: 0 });
        return;
      }
      if (!provider.apiKey) {
        logger.warn('ConfigRoutes', `[POST /model/:id/test] API key not configured for provider: ${provider.id}`);
        res.json({ success: false, message: 'API Key 未配置', latency: 0 });
        return;
      }
      if (!provider.baseUrl) {
        logger.warn('ConfigRoutes', `[POST /model/:id/test] base URL not configured for provider: ${provider.id}`);
        res.json({ success: false, message: 'API 地址未配置', latency: 0 });
        return;
      }

      const start = Date.now();
      const url = provider.baseUrl.replace(/\/+$/, '') + '/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: modelConfig.modelId,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const latency = Date.now() - start;

      if (response.ok) {
        logger.info('ConfigRoutes', `[POST /model/:id/test] success: latency=${latency}ms`);
        res.json({ success: true, message: '连接成功', latency });
      } else {
        const text = await response.text().catch(() => '');
        logger.warn('ConfigRoutes', `[POST /model/:id/test] failed: HTTP ${response.status} latency=${latency}ms`);
        res.json({ success: false, message: `HTTP ${response.status}: ${response.statusText}${text ? ' - ' + text.slice(0, 200) : ''}`, latency });
      }
    } catch (err: any) {
      res.json({ success: false, message: err.message, latency: 0 });
    }
  });

  router.put('/model/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info('ConfigRoutes', `[PUT /model/:id] id=${id}`);
      const config = await modelConfigService.updateConfig(id, req.body);
      if (!config) {
        logger.warn('ConfigRoutes', `[PUT /model/:id] config not found: ${id}`);
        res.status(404).json({ error: '配置不存在' });
        return;
      }
      res.json(config);
    } catch (error) {
      logger.error('ConfigRoutes', `[PUT /model/:id] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/model/:id/default', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info('ConfigRoutes', `[PUT /model/:id/default] id=${id}`);
      await modelConfigService.setDefault(id);
      llmService.invalidateModelCache();
      const config = await modelConfigService.getConfig(id);
      res.json({ success: true, config });
    } catch (error) {
      logger.error('ConfigRoutes', `[PUT /model/:id/default] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.delete('/model/:id/default', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info('ConfigRoutes', `[DELETE /model/:id/default] id=${id}`);
      const config = await modelConfigService.unsetDefault(id);
      llmService.invalidateModelCache();
      if (!config) {
        logger.warn('ConfigRoutes', `[DELETE /model/:id/default] config not found: ${id}`);
        res.status(404).json({ error: '配置不存在' });
        return;
      }
      res.json({ success: true, config });
    } catch (error) {
      logger.error('ConfigRoutes', `[DELETE /model/:id/default] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.delete('/model/:id', async (req, res) => {
    try {
      const { id } = req.params;
      logger.info('ConfigRoutes', `[DELETE /model/:id] id=${id}`);
      await modelConfigService.deleteConfig(id);
      llmService.invalidateModelCache();
      res.json({ success: true });
    } catch (error) {
      logger.error('ConfigRoutes', `[DELETE /model/:id] error: ${(error as Error).message}`);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}