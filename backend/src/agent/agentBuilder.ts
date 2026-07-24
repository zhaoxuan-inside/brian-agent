import { StorageService } from '../core/storage';
import { LLMService } from '../core/llm';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, CustomAgent } from '../shared/types';

export class AgentBuilder {
  private storage: StorageService;
  private llm: LLMService;

  constructor(storage: StorageService, llm: LLMService) {
    this.storage = storage;
    this.llm = llm;
  }

  async list(search?: string): Promise<CustomAgent[]> {
    const nodes = await this.storage.graph.getAllNodes();
    const agents: CustomAgent[] = [];

    for (const node of nodes) {
      try {
        const agent = JSON.parse(node.content) as CustomAgent;
        if (agent.id && agent.name) {
          const mcpIds = this.storage.sqlite.getAgentMcpIds(agent.id);
          if (mcpIds.length > 0) {
            agent.mcpIds = mcpIds;
          }
          agents.push(agent);
        }
      } catch {
        // Skip malformed
      }
    }

    if (search) {
      const lower = search.toLowerCase();
      return agents.filter(
        a =>
          a.name.toLowerCase().includes(lower) ||
          a.role.toLowerCase().includes(lower) ||
          a.description.toLowerCase().includes(lower)
      );
    }

    return agents;
  }

  async get(id: string): Promise<CustomAgent | undefined> {
    const node = await this.storage.graph.getNode(id);
    if (!node) return undefined;

    try {
      const agent = JSON.parse(node.content) as CustomAgent;
      const mcpIds = this.storage.sqlite.getAgentMcpIds(id);
      if (mcpIds.length > 0) {
        agent.mcpIds = mcpIds;
      }
      return agent;
    } catch {
      return undefined;
    }
  }

  /**
   * 查找指定 role 的系统内置 Agent（按 isSystem 标记 + role 匹配）。
   */
  async getSystemAgent(role: string): Promise<CustomAgent | undefined> {
    const all = await this.list();
    return all.find(a => a.isSystem && a.role === role);
  }

  async create(input: {
    name: string;
    role: string;
    description: string;
    strategy: any;
    llm: any;
    prompt: any;
    skillIds: string[];
    mcpIds: string[];
    soulId: string;
    workIds: string[];
    sources: any;
  }, isSystem: boolean = false): Promise<CustomAgent> {
    const now = new Date().toISOString();

    const agentBase: Omit<CustomAgent, 'id'> = {
      name: input.name,
      role: input.role,
      description: input.description,
      strategy: {
        type: input.strategy?.type || 'react',
        maxIterations: input.strategy?.maxIterations || 10,
        stopConditions: input.strategy?.stopConditions || [],
      },
      llm: {
        providerId: input.llm?.providerId || 'default',
        modelId: input.llm?.modelId || 'default',
        temperature: input.llm?.temperature ?? 0.5,
        maxTokens: input.llm?.maxTokens || 4096,
      },
      prompt: {
        system: input.prompt?.system || '',
        instruction: input.prompt?.instruction || '',
        variables: input.prompt?.variables || [],
      },
      skillIds: input.skillIds || [],
      mcpIds: input.mcpIds || [],
      soulId: input.soulId || '',
      workIds: input.workIds || [],
      sources: {
        knowledgeBase: input.sources?.knowledgeBase || [],
        webSearch: input.sources?.webSearch ?? false,
        searchEngine: input.sources?.searchEngine,
      },
      active: true,
      isSystem,
      createdAt: now,
      updatedAt: now,
    };

    const node = await this.storage.graph.createNode({
      type: 'concept',
      content: JSON.stringify({ ...agentBase, id: 'TEMP_ID' }),
      metadata: {
        agentType: 'custom',
        agentName: agentBase.name,
        role: agentBase.role,
        isSystem: isSystem ? 'true' : undefined,
      },
      salienceScore: 0.7,
      retrievalCount: 0,
      strength: 1.0,
      decayRate: 0.01,
    });

    const agent: CustomAgent = { ...agentBase, id: node.id };

    await this.storage.graph.updateNode(node.id, {
      content: JSON.stringify(agent),
    });

    for (const mcpId of input.mcpIds || []) {
      this.storage.sqlite.createAgentMcp(agent.id, mcpId);
    }

    return agent;
  }

  async update(id: string, updates: Record<string, unknown>): Promise<CustomAgent> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Agent ${id} not found`);
    }

    const merged: CustomAgent = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    } as CustomAgent;

    await this.storage.graph.updateNode(id, {
      content: JSON.stringify(merged),
    });

    if (updates.mcpIds !== undefined) {
      this.storage.sqlite.deleteAllAgentMcps(id);
      for (const mcpId of (updates.mcpIds as string[]) || []) {
        this.storage.sqlite.createAgentMcp(id, mcpId);
      }
    }

    return merged;
  }

  async delete(id: string): Promise<void> {
    try {
      await this.storage.graph.deleteNode(id);
    } catch {
      // Node not found by ID, continue to search by content
    }
    
    const nodes = await this.storage.graph.getAllNodes();
    for (const node of nodes) {
      try {
        const content = JSON.parse(node.content) as CustomAgent;
        if (content.id === id) {
          await this.storage.graph.deleteNode(node.id);
          return;
        }
      } catch {
        // Skip malformed nodes
      }
    }
  }

  async toggle(id: string): Promise<CustomAgent> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Agent ${id} not found`);
    }

    const updated: CustomAgent = {
      ...existing,
      active: !existing.active,
      updatedAt: new Date().toISOString(),
    };

    await this.storage.graph.updateNode(id, {
      content: JSON.stringify(updated),
    });

    return updated;
  }

  /**
   * Get available models from the LLM registry.
   */
  getAvailableModels(): {
    providers: {
      id: string;
      name: string;
      models: { id: string; name: string }[];
    }[];
  } {
    const registeredModels = this.llm.registry.listAll();

    const providerMap = new Map<
      string,
      { id: string; name: string; models: { id: string; name: string }[] }
    >();

    for (const model of registeredModels) {
      if (!providerMap.has(model.providerId)) {
        providerMap.set(model.providerId, {
          id: model.providerId,
          name: model.providerId,
          models: [],
        });
      }

      providerMap.get(model.providerId)!.models.push({
        id: model.id,
        name: model.displayName || model.modelName,
      });
    }

    return { providers: Array.from(providerMap.values()) };
  }

  /**
   * Generate a system prompt using LLM based on purpose and constraints.
   */
  async generatePrompt(
    purpose: string,
    constraints?: string
  ): Promise<{
    system: string;
    instruction: string;
    variables: { name: string; description: string; required: boolean }[];
  }> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a prompt engineer. Generate a high-quality system prompt and instruction for an AI agent.

Given the agent's purpose and optional constraints, create:
1. A system prompt that defines the agent's role, behavior, and capabilities
2. A task instruction template with variable placeholders like {{variable_name}}

Respond with JSON:
{
  "system": "The system prompt string",
  "instruction": "The instruction template with {{variables}}",
  "variables": [
    { "name": "variable_name", "description": "what this variable represents", "required": boolean }
  ]
}`,
      },
      {
        role: 'user',
        content: `Purpose: ${purpose}\n${constraints ? `Constraints: ${constraints}` : ''}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.5 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          system: parsed.system || `You are an AI agent that ${purpose}.`,
          instruction: parsed.instruction || `Please help with: ${purpose}`,
          variables: parsed.variables || [],
        };
      }
    } catch {
      // LLM call failed, fall back
    }

    // Fallback prompt generation
    return {
      system: `You are an AI agent specialized in: ${purpose}. You are knowledgeable, precise, and helpful. Always provide accurate, well-structured responses.`,
      instruction: `Task: {{task}}\n\nPlease complete the task described above. Consider relevant context and provide a thorough response.`,
      variables: [
        { name: 'task', description: 'The task to be completed', required: true },
      ],
    };
  }

  /**
   * Generate a soul configuration using LLM based on purpose and preference.
   */
  async generateSoul(
    purpose: string,
    preference?: string
  ): Promise<{
    style: string;
    personality: string;
    contentRules: string[];
    constraints: string[];
    temperatureProfile: {
      creative: number;
      analytical: number;
      factual: number;
    };
  }> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a persona designer. Create a soul/persona configuration for an AI agent.

Given the agent's purpose and any preference, define:
1. Communication style
2. Personality traits
3. Content rules (how the agent should format/express content)
4. Constraints (what the agent must NOT do)
5. Temperature profile (creative, analytical, factual values from 0 to 2)

Respond with JSON:
{
  "style": "string describing communication style",
  "personality": "string describing personality",
  "contentRules": ["rule1", "rule2"],
  "constraints": ["constraint1", "constraint2"],
  "temperatureProfile": { "creative": 0.5, "analytical": 0.7, "factual": 0.7 }
}`,
      },
      {
        role: 'user',
        content: `Purpose: ${purpose}\n${preference ? `Preferred style: ${preference}` : ''}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.7 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          style: parsed.style || 'Professional and formal',
          personality: parsed.personality || 'Helpful, precise, and thorough',
          contentRules: parsed.contentRules || ['Use clear, well-structured language'],
          constraints: parsed.constraints || ['Do not provide harmful or misleading information'],
          temperatureProfile: {
            creative: parsed.temperatureProfile?.creative ?? 0.5,
            analytical: parsed.temperatureProfile?.analytical ?? 0.7,
            factual: parsed.temperatureProfile?.factual ?? 0.7,
          },
        };
      }
    } catch {
      // Fall back
    }

    // Fallback soul generation
    const lower = (purpose + ' ' + (preference || '')).toLowerCase();
    let style = 'Professional and formal';
    let personality = 'Helpful, precise, and thorough';
    let tempProfile = { creative: 0.5, analytical: 0.7, factual: 0.7 };

    if (/creative|art|design|story|write/i.test(lower)) {
      style = 'Creative and imaginative';
      personality = 'Innovative, expressive, and bold';
      tempProfile = { creative: 1.2, analytical: 0.5, factual: 0.3 };
    } else if (/code|debug|develop|program|technical/i.test(lower)) {
      style = 'Technical and precise';
      personality = 'Analytical, detail-oriented, and systematic';
      tempProfile = { creative: 0.3, analytical: 0.8, factual: 1.0 };
    } else if (/chat|friendly|casual/i.test(lower)) {
      style = 'Friendly and approachable';
      personality = 'Warm, empathetic, and conversational';
      tempProfile = { creative: 0.7, analytical: 0.5, factual: 0.6 };
    }

    return {
      style,
      personality,
      contentRules: [
        'Use clear, well-structured language',
        'Provide evidence-based responses',
        'Maintain a consistent tone',
      ],
      constraints: [
        'Do not provide harmful or misleading information',
        'Do not speculate without evidence',
        'Acknowledge limitations of your knowledge',
      ],
      temperatureProfile: tempProfile,
    };
  }

  /**
   * Suggest skills matching the agent's purpose using LLM.
   */
  async suggestSkills(
    purpose: string,
    description?: string
  ): Promise<{ skillId: string; name: string; reason: string }[]> {
    // Get existing skills from storage
    const nodes = await this.storage.graph.getAllNodes();
    const existingSkills: { id: string; name: string; description: string }[] = [];

    for (const node of nodes) {
      try {
        const skill = JSON.parse(node.content);
        if (skill.id && skill.name && skill.mode) {
          existingSkills.push({
            id: skill.id,
            name: skill.name,
            description: skill.description || '',
          });
        }
      } catch {
        // Skip
      }
    }

    if (existingSkills.length === 0) {
      return [];
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a skill matching assistant. Given an agent's purpose and a list of available skills, suggest the most relevant skills.

Respond with JSON array:
[
  { "skillId": "id_of_skill", "name": "skill_name", "reason": "why this skill is relevant" }
]`,
      },
      {
        role: 'user',
        content: `Agent purpose: ${purpose}\nDescription: ${description || ''}\n\nAvailable skills:\n${existingSkills.map(s => `- ${s.id}: ${s.name} - ${s.description}`).join('\n')}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.3 });
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall back
    }

    // Fallback: simple keyword matching
    const lower = (purpose + ' ' + (description || '')).toLowerCase();
    return existingSkills
      .filter(s => {
        const skillLower = (s.name + ' ' + s.description).toLowerCase();
        const words = lower.split(/\s+/);
        return words.some(w => w.length > 3 && skillLower.includes(w));
      })
      .slice(0, 5)
      .map(s => ({
        skillId: s.id,
        name: s.name,
        reason: `Matches keywords in agent purpose`,
      }));
  }

  /**
   * Suggest MCP packages matching the agent's purpose using LLM.
   */
  async suggestMcps(
    purpose: string,
    description?: string
  ): Promise<{ mcpId: string; packageName: string; reason: string }[]> {
    // Common MCP packages by domain
    const mcpPackages: { mcpId: string; packageName: string; keywords: string[] }[] = [
      { mcpId: 'mcp-filesystem', packageName: '@modelcontextprotocol/server-filesystem', keywords: ['file', 'filesystem', 'read', 'write', 'directory'] },
      { mcpId: 'mcp-github', packageName: '@modelcontextprotocol/server-github', keywords: ['github', 'git', 'repository', 'pr', 'pull request', 'issue'] },
      { mcpId: 'mcp-postgres', packageName: '@modelcontextprotocol/server-postgres', keywords: ['database', 'sql', 'postgres', 'query', 'data'] },
      { mcpId: 'mcp-brave-search', packageName: '@modelcontextprotocol/server-brave-search', keywords: ['search', 'web', 'internet', 'find', 'lookup'] },
      { mcpId: 'mcp-memory', packageName: '@modelcontextprotocol/server-memory', keywords: ['memory', 'knowledge', 'graph', 'remember', 'context'] },
      { mcpId: 'mcp-puppeteer', packageName: '@modelcontextprotocol/server-puppeteer', keywords: ['browser', 'web', 'scrape', 'screenshot', 'automation'] },
      { mcpId: 'mcp-fetch', packageName: '@modelcontextprotocol/server-fetch', keywords: ['fetch', 'http', 'url', 'web', 'content', 'api'] },
      { mcpId: 'mcp-sequential-thinking', packageName: '@modelcontextprotocol/server-sequential-thinking', keywords: ['thinking', 'reasoning', 'problem', 'solve', 'analysis'] },
    ];

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an MCP (Model Context Protocol) package recommender. Given an agent's purpose, suggest the most relevant MCP packages from the available list.

Respond with JSON array:
[
  { "mcpId": "id", "packageName": "name", "reason": "why this package is relevant" }
]`,
      },
      {
        role: 'user',
        content: `Agent purpose: ${purpose}\nDescription: ${description || ''}\n\nAvailable MCP packages:\n${mcpPackages.map(p => `- ${p.mcpId}: ${p.packageName} (${p.keywords.join(', ')})`).join('\n')}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.3 });
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall back
    }

    // Fallback: keyword matching
    const lower = (purpose + ' ' + (description || '')).toLowerCase();
    return mcpPackages
      .filter(p => p.keywords.some(kw => lower.includes(kw)))
      .slice(0, 3)
      .map(p => ({
        mcpId: p.mcpId,
        packageName: p.packageName,
        reason: `Matches keywords: ${p.keywords.filter(kw => lower.includes(kw)).join(', ')}`,
      }));
  }

  /**
   * Validate an agent configuration.
   */
  validateAgent(agent: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!agent.name || agent.name.trim().length === 0) {
      errors.push('Agent name is required');
    }

    if (!agent.role || agent.role.trim().length === 0) {
      errors.push('Agent role is required');
    }

    if (!agent.description || agent.description.trim().length === 0) {
      errors.push('Agent description is required');
    }

    if (agent.strategy) {
      const validStrategies = ['react', 'plan-execute', 'cot', 'conditional-graph', 'hybrid'];
      if (agent.strategy.type && !validStrategies.includes(agent.strategy.type)) {
        errors.push(`Invalid strategy type: ${agent.strategy.type}. Must be one of: ${validStrategies.join(', ')}`);
      }
    }

    if (agent.llm) {
      if (agent.llm.temperature !== undefined && (agent.llm.temperature < 0 || agent.llm.temperature > 2)) {
        errors.push('Temperature must be between 0 and 2');
      }
      if (agent.llm.maxTokens !== undefined && agent.llm.maxTokens < 1) {
        errors.push('maxTokens must be at least 1');
      }
    }

    if (agent.prompt) {
      if (!agent.prompt.system || agent.prompt.system.trim().length === 0) {
        errors.push('System prompt is required');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Suggest soul configurations matching the agent's purpose using LLM.
   */
  async suggestSouls(
    purpose: string,
    description?: string
  ): Promise<{ soulId: string; name: string; reason: string }[]> {
    const nodes = await this.storage.graph.getAllNodes();
    const existingSouls: { id: string; name: string; description: string }[] = [];

    for (const node of nodes) {
      try {
        const soul = JSON.parse(node.content);
        if (soul.id && soul.name && soul.style) {
          existingSouls.push({
            id: soul.id,
            name: soul.name,
            description: soul.description || soul.personality || '',
          });
        }
      } catch {
        // Skip
      }
    }

    if (existingSouls.length === 0) {
      return [];
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a soul matching assistant. Given an agent's purpose and a list of available souls, suggest the most relevant souls.

Respond with JSON array:
[
  { "soulId": "id_of_soul", "name": "soul_name", "reason": "why this soul is relevant" }
]`,
      },
      {
        role: 'user',
        content: `Agent purpose: ${purpose}\nDescription: ${description || ''}\n\nAvailable souls:\n${existingSouls.map(s => `- ${s.id}: ${s.name} - ${s.description}`).join('\n')}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.3 });
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall back
    }

    const lower = (purpose + ' ' + (description || '')).toLowerCase();
    return existingSouls
      .filter(s => {
        const soulLower = (s.name + ' ' + s.description).toLowerCase();
        const words = lower.split(/\s+/);
        return words.some(w => w.length > 3 && soulLower.includes(w));
      })
      .slice(0, 3)
      .map(s => ({
        soulId: s.id,
        name: s.name,
        reason: `Matches keywords in agent purpose`,
      }));
  }

  /**
   * Suggest work configurations matching the agent's purpose using LLM.
   */
  async suggestWorks(
    purpose: string,
    description?: string
  ): Promise<{ workId: string; name: string; reason: string }[]> {
    const nodes = await this.storage.graph.getAllNodes();
    const existingWorks: { id: string; name: string; description: string }[] = [];

    for (const node of nodes) {
      try {
        const work = JSON.parse(node.content);
        if (work.id && work.name && work.type === 'work') {
          existingWorks.push({
            id: work.id,
            name: work.name,
            description: work.description || '',
          });
        }
      } catch {
        // Skip
      }
    }

    if (existingWorks.length === 0) {
      return [];
    }

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a work matching assistant. Given an agent's purpose and a list of available works, suggest the most relevant works.

Respond with JSON array:
[
  { "workId": "id_of_work", "name": "work_name", "reason": "why this work is relevant" }
]`,
      },
      {
        role: 'user',
        content: `Agent purpose: ${purpose}\nDescription: ${description || ''}\n\nAvailable works:\n${existingWorks.map(w => `- ${w.id}: ${w.name} - ${w.description}`).join('\n')}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.3 });
      const jsonMatch = response.content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fall back
    }

    const lower = (purpose + ' ' + (description || '')).toLowerCase();
    return existingWorks
      .filter(w => {
        const workLower = (w.name + ' ' + w.description).toLowerCase();
        const words = lower.split(/\s+/);
        return words.some(word => word.length > 3 && workLower.includes(word));
      })
      .slice(0, 5)
      .map(w => ({
        workId: w.id,
        name: w.name,
        reason: `Matches keywords in agent purpose`,
      }));
  }

  /**
   * Get MCP details associated with an agent from the agent_mcp table.
   */
  getMcpsForAgent(agentId: string): any[] {
    return this.storage.sqlite.getAgentMcpDetails(agentId);
  }

  /**
   * Get Skill details associated with an agent from the graph DB.
   */
  async getSkillsForAgent(agentId: string): Promise<any[]> {
    const agent = await this.get(agentId);
    if (!agent || !agent.skillIds?.length) return [];

    const skills: any[] = [];
    for (const skillId of agent.skillIds) {
      try {
        const node = await this.storage.graph.getNode(skillId);
        if (node) {
          const skill = JSON.parse(node.content);
          if (skill.id && skill.name) {
            skills.push({ id: skill.id, name: skill.name, description: skill.description || '' });
          }
        }
      } catch { /* skip malformed */ }
    }
    return skills;
  }

  /**
   * Get Soul details associated with an agent from the graph DB.
   */
  async getSoulForAgent(agentId: string): Promise<any | null> {
    const agent = await this.get(agentId);
    if (!agent || !agent.soulId) return null;

    try {
      const node = await this.storage.graph.getNode(agent.soulId);
      if (node) {
        const soul = JSON.parse(node.content);
        if (soul.id && soul.name) {
          return { id: soul.id, name: soul.name, description: soul.description || '' };
        }
      }
    } catch { /* skip */ }
    return null;
  }

  /**
   * Get Work details associated with an agent from the graph DB.
   */
  async getWorksForAgent(agentId: string): Promise<any[]> {
    const agent = await this.get(agentId);
    if (!agent || !agent.workIds?.length) return [];

    const works: any[] = [];
    for (const workId of agent.workIds) {
      try {
        const node = await this.storage.graph.getNode(workId);
        if (node) {
          const work = JSON.parse(node.content);
          if (work.id && work.name) {
            works.push({ id: work.id, name: work.name, description: work.description || '' });
          }
        }
      } catch { /* skip malformed */ }
    }
    return works;
  }

  /**
   * Clone an existing agent.
   */
  async clone(id: string): Promise<CustomAgent> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Agent ${id} not found`);
    }

    const clonedBase: Omit<CustomAgent, 'id'> = {
      ...existing,
      name: `${existing.name} (Copy)`,
      active: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const node = await this.storage.graph.createNode({
      type: 'concept',
      content: JSON.stringify({ ...clonedBase, id: 'TEMP_ID' }),
      metadata: {
        agentType: 'custom',
        agentName: clonedBase.name,
        role: clonedBase.role,
      },
      salienceScore: 0.7,
      retrievalCount: 0,
      strength: 1.0,
      decayRate: 0.01,
    });

    const cloned: CustomAgent = { ...clonedBase, id: node.id };

    await this.storage.graph.updateNode(node.id, {
      content: JSON.stringify(cloned),
    });

    return cloned;
  }
}