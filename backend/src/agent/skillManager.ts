import { StorageService } from '../core/storage';
import { LLMService } from '../core/llm';

import type { ChatMessage, AgentSkill } from '../shared/types';

export class SkillManager {
  private storage: StorageService;
  private llm: LLMService;

  constructor(storage: StorageService, llm: LLMService) {
    this.storage = storage;
    this.llm = llm;
  }

  async list(search?: string, status?: string): Promise<AgentSkill[]> {
    const nodes = await this.storage.graph.getAllNodes();
    const skills: AgentSkill[] = [];

    for (const node of nodes) {
      try {
        const skill = JSON.parse(node.content) as AgentSkill;
        if (skill.id && skill.name) {
          skills.push(skill);
        }
      } catch {
        // Skip malformed
      }
    }

    let filtered = skills;

    if (search) {
      const lower = search.toLowerCase();
      filtered = filtered.filter(
        s =>
          s.name.toLowerCase().includes(lower) ||
          s.description.toLowerCase().includes(lower)
      );
    }

    if (status) {
      if (status === 'active') {
        filtered = filtered.filter(s => s.active);
      } else if (status === 'inactive') {
        filtered = filtered.filter(s => !s.active);
      }
    }

    return filtered;
  }

  async get(id: string): Promise<AgentSkill | undefined> {
    const node = await this.storage.graph.getNode(id);
    if (!node) return undefined;

    try {
      return JSON.parse(node.content) as AgentSkill;
    } catch {
      return undefined;
    }
  }

  async create(input: {
    mode: 'user' | 'manual';
    name: string;
    description: string;
    userInput?: string;
    userOutput?: string;
    userProcess?: string;
    manualContent?: string;
  }): Promise<AgentSkill> {
    const now = new Date().toISOString();

    let normalizedSpec: AgentSkill['normalizedSpec'] = undefined;
    if (input.mode === 'user' && input.userInput && input.userOutput && input.userProcess) {
      normalizedSpec = this.normalize(input.userInput, input.userOutput, input.userProcess);
    }

    const skillBase: Omit<AgentSkill, 'id'> = {
      name: input.name,
      description: input.description,
      mode: input.mode,
      userInput: input.userInput,
      userOutput: input.userOutput,
      userProcess: input.userProcess,
      normalizedSpec,
      manualContent: input.manualContent,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    const node = await this.storage.graph.createNode({
      type: 'concept',
      content: JSON.stringify({ ...skillBase, id: 'TEMP_ID' }),
      metadata: {
        skillType: 'agent_skill',
        skillName: skillBase.name,
        mode: skillBase.mode,
      },
      salienceScore: 0.7,
      retrievalCount: 0,
      strength: 1.0,
      decayRate: 0.01,
    });

    const skill: AgentSkill = { ...skillBase, id: node.id };

    await this.storage.graph.updateNode(node.id, {
      content: JSON.stringify(skill),
    });

    return skill;
  }

  async update(id: string, updates: Record<string, unknown>): Promise<AgentSkill> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Skill ${id} not found`);
    }

    const updated: AgentSkill = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    } as AgentSkill;

    await this.storage.graph.updateNode(id, {
      content: JSON.stringify(updated),
    });

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Skill ${id} not found`);
    }
    await this.storage.graph.deleteNode(id);
  }

  async toggle(id: string): Promise<AgentSkill> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Skill ${id} not found`);
    }

    const updated: AgentSkill = {
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
   * Normalize user-provided skill description into structured format using LLM.
   */
  normalize(
    userInput: string,
    userOutput: string,
    userProcess: string
  ): {
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    process: string;
    constraints: string[];
    examples: { input: string; output: string }[];
  } {
    // Generate JSON Schema for input/output from user descriptions
    const inputSchema = this.generateSchema(userInput, 'input');
    const outputSchema = this.generateSchema(userOutput, 'output');

    // Extract constraints and examples from the process description
    const constraints = this.extractConstraints(userProcess);
    const examples = this.extractExamples(userInput, userOutput);

    return {
      input: inputSchema,
      output: outputSchema,
      process: userProcess.trim(),
      constraints,
      examples,
    };
  }

  private generateSchema(description: string, _type: 'input' | 'output'): Record<string, unknown> {
    // Generate a JSON Schema based on the description
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {},
      required: [],
    };

    const properties = schema.properties as Record<string, unknown>;

    // Extract potential fields from the description
    const fieldPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*[：:]\s*(.+?)(?=[,;，\n]|$)/g;
    let match: RegExpExecArray | null;

    while ((match = fieldPattern.exec(description)) !== null) {
      const fieldName = match[1].trim();
      const fieldDesc = match[2].trim();

      let fieldType = 'string';
      if (/number|integer|count|amount|size|length/i.test(fieldDesc)) {
        fieldType = 'number';
      } else if (/boolean|true|false|yes|no|flag/i.test(fieldDesc)) {
        fieldType = 'boolean';
      } else if (/array|list|items|collection/i.test(fieldDesc)) {
        fieldType = 'array';
      } else if (/object|json|map|dictionary/i.test(fieldDesc)) {
        fieldType = 'object';
      }

      properties[fieldName] = {
        type: fieldType,
        description: fieldDesc,
      };

      // Assume all detected fields are required
      (schema.required as string[]).push(fieldName);
    }

    return schema;
  }

  private extractConstraints(process: string): string[] {
    const constraints: string[] = [];
    const lines = process.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (/must|should|required|constraint|restriction|limit|do not|don't|never|always|ensure/i.test(trimmed)) {
        constraints.push(trimmed);
      }
    }

    if (constraints.length === 0) {
      constraints.push('Follow the specified process accurately');
    }

    return constraints;
  }

  private extractExamples(
    input: string,
    output: string
  ): { input: string; output: string }[] {
    // Generate a default example from the input/output descriptions
    return [
      {
        input: `Example: ${input.substring(0, 200)}`,
        output: `Expected: ${output.substring(0, 200)}`,
      },
    ];
  }

  /**
   * Preview the normalized spec for a user-defined skill.
   */
  preview(input: {
    userInput: string;
    userOutput: string;
    userProcess: string;
  }): {
    normalizedSpec: {
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      process: string;
      constraints: string[];
      examples: { input: string; output: string }[];
    };
  } {
    const normalizedSpec = this.normalize(
      input.userInput,
      input.userOutput,
      input.userProcess
    );

    return { normalizedSpec };
  }

  /**
   * Review a manual skill content using LLM to score on 4 dimensions.
   */
  async review(manualContent: string): Promise<{
    score: number;
    breakdown: {
      completeness: number;
      clarity: number;
      executability: number;
      safety: number;
    };
    summary: string;
    suggestions: string[];
  }> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are a skill content reviewer. Evaluate the provided skill content on 4 dimensions:

1. Completeness (0-1): How complete is the skill description? Does it cover all necessary aspects?
2. Clarity (0-1): How clear and well-structured is the content?
3. Executability (0-1): How actionable and executable is the skill? Can an agent follow it?
4. Safety (0-1): Does the skill include appropriate safety considerations and constraints?

Respond with JSON:
{
  "score": number (overall score 0-1),
  "breakdown": {
    "completeness": number,
    "clarity": number,
    "executability": number,
    "safety": number
  },
  "summary": "string summarizing the review",
  "suggestions": ["string array of improvement suggestions"]
}`,
      },
      {
        role: 'user',
        content: `Please review this skill content:\n\n${manualContent}`,
      },
    ];

    try {
      const response = await this.llm.chat(messages, { temperature: 0.2 });
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          score: parsed.score ?? 0.5,
          breakdown: {
            completeness: parsed.breakdown?.completeness ?? 0.5,
            clarity: parsed.breakdown?.clarity ?? 0.5,
            executability: parsed.breakdown?.executability ?? 0.5,
            safety: parsed.breakdown?.safety ?? 0.5,
          },
          summary: parsed.summary || 'No summary provided',
          suggestions: parsed.suggestions || [],
        };
      }
    } catch {
      // LLM call failed, use heuristic
    }

    // Heuristic fallback
    const wordCount = manualContent.split(/\s+/).length;
    const completeness = Math.min(wordCount / 200, 1.0);
    const clarity = manualContent.includes('\n') ? 0.7 : 0.5;
    const executability = /step|action|execute|do|perform|run|call/i.test(manualContent) ? 0.7 : 0.4;
    const safety = /safety|security|constraint|limit|do not|must not|never/i.test(manualContent) ? 0.7 : 0.4;

    const score = (completeness + clarity + executability + safety) / 4;

    return {
      score,
      breakdown: { completeness, clarity, executability, safety },
      summary: `Heuristic review: ${wordCount} words, ${manualContent.split('\n').length} lines`,
      suggestions: [
        wordCount < 50 ? 'Add more detail to the skill description' : '',
        !manualContent.includes('\n') ? 'Use line breaks to structure the content' : '',
        !/step|action/i.test(manualContent) ? 'Add clear actionable steps' : '',
      ].filter(Boolean),
    };
  }

  /**
   * Validate a skill name for uniqueness and format.
   */
  async validateName(name: string): Promise<boolean> {
    if (!name || name.trim().length === 0) return false;
    if (name.trim().length < 2) return false;
    if (name.trim().length > 100) return false;

    // Check for uniqueness
    const existing = await this.list();
    const lower = name.trim().toLowerCase();
    const duplicate = existing.find(s => s.name.toLowerCase() === lower);
    if (duplicate) return false;

    // Check for valid characters
    if (!/^[a-zA-Z0-9_\-\s\u4e00-\u9fff]+$/.test(name.trim())) return false;

    return true;
  }
}