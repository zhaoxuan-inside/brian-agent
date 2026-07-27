import { LLMService } from '../core/llm';
import { InformationService } from '../core/information';
import { ToolService } from '../core/tools';
import { AgentLibrary } from './agentLibrary';
import { SkillManager } from '../core/skill/SkillManager';
import { v4 as uuidv4 } from 'uuid';
import type { WorkAgent, StrategyType } from '../shared/types';
import { generateSoulConfig } from './capability/soulConfig';
import { getWorkTemplate } from './capability/promptTemplate';
import { StrategyFactory } from '../strategy/ThinkingStrategy';

export class MetaAgent {
  private llm: LLMService;
  private information: InformationService;
  private _tools: ToolService;
  private library: AgentLibrary;
  private skillManager: SkillManager;

  constructor(
    llm: LLMService,
    information: InformationService,
    tools: ToolService,
    library: AgentLibrary,
    skillManager: SkillManager
  ) {
    this.llm = llm;
    this.information = information;
    this._tools = tools;
    this.library = library;
    this.skillManager = skillManager;
  }

  // ============================================================
  // Core
  // ============================================================

  receive(input: {
    type: 'user' | 'self_learn';
    content: string;
    conversationId?: string;
  }): { task: any } {
    // Build context from memory
    if (input.conversationId) {
      this.information.buildContext(input.content, input.conversationId);
    }

    return { task: { type: input.type, content: input.content } };
  }

  analyze(task: any): {
    intent: string;
    complexity: number;
    domain: string;
    requiredCapabilities: string[];
  } {
    const content = typeof task === 'string' ? task : (task.content || '');
    const lower = content.toLowerCase();

    // Intent detection
    let intent = 'general';
    if (/fix|debug|error|bug|issue|solve|resolve|troubleshoot/i.test(lower)) {
      intent = 'debugging';
    } else if (/code|program|develop|build|implement|function|class|api|endpoint/i.test(lower)) {
      intent = 'code_generation';
    } else if (/explain|describe|what is|how does|why/i.test(lower)) {
      intent = 'explanation';
    } else if (/analyze|review|audit|check|inspect|examine/i.test(lower)) {
      intent = 'analysis';
    } else if (/create|make|generate|write|design|build/i.test(lower)) {
      intent = 'creation';
    } else if (/search|find|look|locate|retrieve/i.test(lower)) {
      intent = 'search';
    } else if (/summarize|summary|brief|tldr/i.test(lower)) {
      intent = 'summarization';
    } else if (/translate|convert/i.test(lower)) {
      intent = 'transformation';
    } else if (/plan|organize|schedule|arrange/i.test(lower)) {
      intent = 'planning';
    }

    // Domain detection
    let domain = 'general';
    if (/frontend|react|vue|angular|html|css|javascript|typescript|ui|ux|component|browser/i.test(lower)) {
      domain = 'frontend';
    } else if (/backend|api|server|database|sql|nosql|rest|graphql|microservice|docker|kubernetes|deploy/i.test(lower)) {
      domain = 'backend';
    } else if (/data|analytics|machine learning|ai|model|training|pipeline|etl|statistics/i.test(lower)) {
      domain = 'data_science';
    } else if (/devops|infrastructure|cloud|aws|azure|gcp|terraform|ci|cd|monitoring/i.test(lower)) {
      domain = 'devops';
    } else if (/security|auth|encrypt|vulnerability|penetration|firewall|oauth/i.test(lower)) {
      domain = 'security';
    } else if (/mobile|android|ios|swift|kotlin|flutter|react native/i.test(lower)) {
      domain = 'mobile';
    }

    // Complexity estimation
    let complexity = 0.1;
    const wordCount = content.split(/\s+/).length;
    complexity += Math.min(wordCount / 200, 0.2);

    const complexityIndicators = [
      /multiple|several|many|various|complex|advanced|enterprise/i,
      /database|auth|security|scalability|performance|optimization/i,
      /integration|migration|refactor|architecture|system design/i,
      /real-time|streaming|distributed|microservice|kubernetes/i,
    ];
    for (const indicator of complexityIndicators) {
      if (indicator.test(lower)) complexity += 0.15;
    }
    complexity = Math.min(complexity, 1.0);

    // Required capabilities
    const requiredCapabilities: string[] = [];
    if (/code|program|develop|build|implement|function|api/i.test(lower)) {
      requiredCapabilities.push('code_generation');
    }
    if (/search|find|lookup|retrieve|fetch/i.test(lower)) {
      requiredCapabilities.push('search');
    }
    if (/analyze|review|evaluate|inspect|examine/i.test(lower)) {
      requiredCapabilities.push('analysis');
    }
    if (/write|content|article|blog|document|essay/i.test(lower)) {
      requiredCapabilities.push('content_writing');
    }
    if (/test|unit test|integration test|e2e|coverage/i.test(lower)) {
      requiredCapabilities.push('testing');
    }

    return { intent, complexity, domain, requiredCapabilities };
  }

  async buildAgent(taskFeatures: Record<string, unknown>): Promise<WorkAgent> {
    const llmConfig = this.selectLLM(taskFeatures);
    const skillIds = await this.selectSkills(taskFeatures);
    const mcpIds = this.selectMCP(taskFeatures);
    const prompt = await this.generatePrompt(taskFeatures, skillIds);
    const strategy = StrategyFactory.select({
      intent: (taskFeatures.intent as string) || 'general',
      complexity: (taskFeatures.complexity as number) || 0.3,
      domain: (taskFeatures.domain as string) || 'general',
    });

    const id = uuidv4();
    const now = Date.now();

    const agent: WorkAgent = {
      id,
      name: `agent-${now}`,
      taskFeatures,
      strategy: strategy as StrategyType,
      llm: llmConfig,
      prompt,
      skillIds,
      mcpIds,
      soulId: '',
      strength: 1.0,
      useCount: 0,
      lastUsedAt: now,
      feedbackHistory: [],
      reliability: 0.5,
      createdAt: now,
      updatedAt: now,
    };

    return agent;
  }

  async reuseAgent(taskFeatures: Record<string, unknown>): Promise<WorkAgent | null> {
    const similar = await this.library.findSimilar(taskFeatures);

    if (similar.length > 0) {
      const best = similar[0];
      // Update usage stats
      await this.library.strengthen(best.id);
      return best;
    }

    return null;
  }

  async submit(
    agent: WorkAgent,
    _task: any
  ): Promise<{ executionId: string }> {
    const executionId = uuidv4();

    // Store the agent if not already stored
    const existing = await this.library.get(agent.id);
    if (!existing) {
      await this.library.store(agent);
    }

    return { executionId };
  }

  async saveAgent(agent: WorkAgent): Promise<string> {
    const storedId = await this.library.store(agent);
    return storedId;
  }

  async getAgent(agentId: string): Promise<WorkAgent | undefined> {
    return await this.library.get(agentId);
  }

  // ============================================================
  // Agent Building
  // ============================================================

  private selectLLM(taskFeatures: Record<string, unknown>): {
    providerId: string;
    modelId: string;
    temperature: number;
    maxTokens: number;
  } {
    try {
      // Use the model registry to select best model
      const taskStr = JSON.stringify(taskFeatures);
      const selected = this.llm.registry.select({
        strategy: 'auto',
        task: taskStr,
      });

      return {
        providerId: selected.providerId,
        modelId: selected.modelName,
        temperature: selected.config.temperature,
        maxTokens: selected.config.maxTokens,
      };
    } catch {
      // Fallback defaults
      const allModels = this.llm.registry.listAll();
      if (allModels.length > 0) {
        const first = allModels[0];
        return {
          providerId: first.providerId,
          modelId: first.modelName,
          temperature: first.config.temperature,
          maxTokens: first.config.maxTokens,
        };
      }
    }

    // No models available — return empty config; LLMService will handle resolution or throw
    return {
      providerId: '',
      modelId: '',
      temperature: 0.5,
      maxTokens: 4096,
    };
  }

  private async selectSkills(taskFeatures: Record<string, unknown>): Promise<string[]> {
    const skillIds: string[] = [];
    const taskStr = JSON.stringify(taskFeatures).toLowerCase();

    // Map task features to skill categories for ID-based lookup
    const targetCategories: string[] = [];
    if (/code|program|develop|build|implement/i.test(taskStr)) {
      targetCategories.push('code_generation', 'code_review');
    }
    if (/debug|fix|error|bug|troubleshoot/i.test(taskStr)) {
      targetCategories.push('debugging', 'problem_solving');
    }
    if (/search|find|lookup|retrieve|fetch/i.test(taskStr)) {
      targetCategories.push('search', 'information_retrieval');
    }
    if (/analyze|review|audit|evaluate/i.test(taskStr)) {
      targetCategories.push('analysis', 'evaluation');
    }
    if (/write|content|article|blog|document/i.test(taskStr)) {
      targetCategories.push('content_writing');
    }
    if (/test|unit test|integration test/i.test(taskStr)) {
      targetCategories.push('testing');
    }
    if (/data|analytics|statistics|chart|graph/i.test(taskStr)) {
      targetCategories.push('data_analysis', 'visualization');
    }
    if (/translate|convert|transform/i.test(taskStr)) {
      targetCategories.push('translation', 'transformation');
    }
    if (/summarize|summary|brief|tl;dr/i.test(taskStr)) {
      targetCategories.push('summarization');
    }

    if (targetCategories.length === 0) {
      targetCategories.push('general_purpose');
    }

    // Look up actual skill IDs by category from the SkillManager
    try {
      const allSkills = await this.skillManager.listSkills();
      const targetSet = new Set(targetCategories);
      for (const skill of allSkills) {
        if (skill.isInstalled && targetSet.has(skill.category)) {
          skillIds.push(skill.id);
        }
      }
    } catch {
      // Fallback: if skill lookup fails, skip skill assignment
    }

    return skillIds;
  }

  private selectMCP(taskFeatures: Record<string, unknown>): string[] {
    const mcpIds: string[] = [];
    const taskStr = JSON.stringify(taskFeatures).toLowerCase();

    if (/file|filesystem|read|write|directory/i.test(taskStr)) {
      mcpIds.push('mcp-filesystem');
    }
    if (/github|git|repository|pr|pull request|issue/i.test(taskStr)) {
      mcpIds.push('mcp-github');
    }
    if (/database|sql|postgres|query|data/i.test(taskStr)) {
      mcpIds.push('mcp-postgres');
    }
    if (/search|web|internet|find|lookup/i.test(taskStr)) {
      mcpIds.push('mcp-brave-search');
    }
    if (/browser|web|scrape|screenshot/i.test(taskStr)) {
      mcpIds.push('mcp-puppeteer');
    }
    if (/fetch|http|url|web content/i.test(taskStr)) {
      mcpIds.push('mcp-fetch');
    }
    if (/memory|knowledge|remember|context/i.test(taskStr)) {
      mcpIds.push('mcp-memory');
    }

    return mcpIds;
  }

  private async generatePrompt(taskFeatures: Record<string, unknown>, skillIds: string[] = []): Promise<{
    system: string;
    instruction: string;
  }> {
    const taskType = (taskFeatures.intent as string) || 'general';
    const workTemplate = getWorkTemplate(taskType);

    const soul = this.configureSoul(taskFeatures);

    // Build system prompt
    const systemPromptParts: string[] = [];
    systemPromptParts.push(`You are an AI agent designed to handle "${taskType}" tasks. 请使用中文回复。`);
    systemPromptParts.push(`Style: ${soul.style}`);
    systemPromptParts.push(`Personality: ${soul.personality}`);
    systemPromptParts.push(`你可以使用可用的工具（如 web_fetch 访问互联网）来完成需要外部信息的任务。`);

    if (soul.contentRules && Array.isArray(soul.contentRules) && soul.contentRules.length > 0) {
      systemPromptParts.push('\nContent Guidelines:');
      for (const rule of soul.contentRules) {
        systemPromptParts.push(`- ${rule}`);
      }
    }

    if (soul.constraints && Array.isArray(soul.constraints) && soul.constraints.length > 0) {
      systemPromptParts.push('\nConstraints:');
      for (const constraint of soul.constraints) {
        systemPromptParts.push(`- ${constraint}`);
      }
    }

    // Look up skill names from IDs for the prompt
    if (skillIds.length > 0) {
      const skillNames: string[] = [];
      for (const id of skillIds) {
        try {
          const skill = await this.skillManager.getSkill(id);
          if (skill) {
            skillNames.push(skill.name);
          }
        } catch {
          // Skip skill if lookup fails
        }
      }
      if (skillNames.length > 0) {
        systemPromptParts.push(`\nCapabilities: ${skillNames.join(', ')}`);
      }
    }

    const system = systemPromptParts.join('\n');
    const instruction = workTemplate;

    return { system, instruction };
  }

  private configureSoul(taskFeatures: Record<string, unknown>): Record<string, unknown> {
    const purpose = (taskFeatures.intent as string) || (taskFeatures.domain as string) || 'general';
    const preference = (taskFeatures.preference as string) || '';

    const soulConfig = generateSoulConfig(purpose, preference);

    return {
      style: soulConfig.style,
      personality: soulConfig.personality,
      contentRules: soulConfig.contentRules,
      constraints: soulConfig.constraints,
      temperatureProfile: soulConfig.temperatureProfile,
    };
  }
}