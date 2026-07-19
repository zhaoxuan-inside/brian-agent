const WORK_TEMPLATES: Record<string, string> = {
  code_generation: 'Generate code based on the following requirements. Ensure the code is correct, well-structured, and follows best practices.',
  code_review: 'Review the provided code for correctness, performance, security, and style. Provide specific, actionable feedback.',
  debugging: 'Analyze the error or bug description and identify the root cause. Provide a clear fix or workaround.',
  data_analysis: 'Analyze the provided data. Identify patterns, trends, and insights. Present findings clearly.',
  content_writing: 'Write content based on the given requirements. Ensure clarity, engagement, and adherence to the specified style.',
  research: 'Research the given topic thoroughly. Provide a comprehensive summary with key findings and citations.',
  translation: 'Translate the given text accurately. Preserve the original meaning, tone, and nuance.',
  summarization: 'Summarize the provided content concisely. Capture the key points and main ideas.',
  question_answering: 'Answer the question accurately and completely. Provide supporting evidence when available.',
  task_planning: 'Break down the given task into clear, actionable steps. Consider dependencies, priorities, and resources.',
  system_design: 'Design a system architecture based on the requirements. Cover components, data flow, and trade-offs.',
  testing: 'Generate test cases for the given code or requirements. Cover edge cases, error conditions, and happy paths.',
};

export function buildSystemPrompt(
  soul: { style: string; personality: string; contentRules: string[]; constraints: string[] },
  work: string,
  tools: string[]
): string {
  const parts: string[] = [];

  // Identity & Style
  parts.push(`You are an AI assistant with the following characteristics:`);
  parts.push(`- Style: ${soul.style}`);
  parts.push(`- Personality: ${soul.personality}`);
  parts.push('');

  // Work description
  if (work) {
    const workTemplate = getWorkTemplate(work);
    parts.push('## Your Task');
    parts.push(workTemplate || work);
    parts.push('');
  }

  // Content Rules
  if (soul.contentRules && soul.contentRules.length > 0) {
    parts.push('## Content Guidelines');
    for (const rule of soul.contentRules) {
      parts.push(`- ${rule}`);
    }
    parts.push('');
  }

  // Constraints
  if (soul.constraints && soul.constraints.length > 0) {
    parts.push('## Constraints');
    for (const constraint of soul.constraints) {
      parts.push(`- ${constraint}`);
    }
    parts.push('');
  }

  // Available Tools
  if (tools && tools.length > 0) {
    parts.push('## Available Tools');
    parts.push('You have access to the following tools:');
    for (const tool of tools) {
      parts.push(`- ${tool}`);
    }
    parts.push('');
    parts.push('Use tools when appropriate to complete your tasks. Call tools using the function calling format.');
    parts.push('');
  }

  return parts.join('\n');
}

export function injectVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
  return result;
}

export function injectSoul(
  prompt: string,
  soul: { style: string; personality: string }
): string {
  const soulBlock = [
    '\n## Persona',
    `Style: ${soul.style}`,
    `Personality: ${soul.personality}`,
  ].join('\n');

  return prompt + soulBlock;
}

export function injectTools(prompt: string, tools: string[]): string {
  if (!tools || tools.length === 0) return prompt;

  const toolBlock = [
    '\n## Available Tools',
    ...tools.map((t, i) => `${i + 1}. ${t}`),
  ].join('\n');

  return prompt + toolBlock;
}

export function getSoulTemplate(style: string): {
  style: string;
  personality: string;
  contentRules: string[];
  constraints: string[];
} {
  const styleLower = style.toLowerCase();

  if (/creative|art|design|story/i.test(styleLower)) {
    return {
      style: 'Creative and imaginative',
      personality: 'Innovative, expressive, and bold. You think outside the box and inspire creativity.',
      contentRules: [
        'Use vivid, descriptive language',
        'Explore unconventional ideas',
        'Encourage creative thinking',
        'Provide diverse perspectives',
      ],
      constraints: [
        'Stay grounded in the task requirements',
        'Do not generate harmful or offensive content',
        'Respect intellectual property',
        'Balance creativity with practicality',
      ],
    };
  }

  if (/technical|code|engineer|developer|program/i.test(styleLower)) {
    return {
      style: 'Technical and precise',
      personality: 'Analytical, detail-oriented, and systematic. You focus on accuracy and correctness.',
      contentRules: [
        'Use precise technical terminology',
        'Provide step-by-step explanations',
        'Include code examples when relevant',
        'Reference documentation and standards',
      ],
      constraints: [
        'Verify technical claims before stating them',
        'Acknowledge when information is deprecated',
        'Do not recommend insecure practices',
        'Specify version requirements when relevant',
      ],
    };
  }

  if (/friendly|casual|chat|conversation|social/i.test(styleLower)) {
    return {
      style: 'Friendly and approachable',
      personality: 'Warm, empathetic, and conversational. You make users feel comfortable and understood.',
      contentRules: [
        'Use a conversational tone',
        'Include light humor when appropriate',
        'Show empathy and understanding',
        'Be encouraging and supportive',
      ],
      constraints: [
        'Do not be overly casual in serious contexts',
        'Maintain professionalism in sensitive topics',
        'Avoid excessive familiarity',
        'Respect personal boundaries',
      ],
    };
  }

  if (/concise|brief|short|quick|fast/i.test(styleLower)) {
    return {
      style: 'Concise and direct',
      personality: 'Efficient, focused, and no-nonsense. You get straight to the point.',
      contentRules: [
        'Be brief and to the point',
        'Prioritize key information',
        'Use bullet points for clarity',
        'Avoid unnecessary elaboration',
      ],
      constraints: [
        'Do not sacrifice clarity for brevity',
        'Ensure completeness of essential information',
        'Avoid being abrupt or rude',
        'Include necessary context',
      ],
    };
  }

  // Default: professional
  return {
    style: 'Professional and formal',
    personality: 'Helpful, precise, and thorough. You communicate with clarity and respect.',
    contentRules: [
      'Use clear, well-structured language',
      'Avoid slang and colloquialisms',
      'Provide evidence-based responses',
      'Maintain a neutral, objective tone',
    ],
    constraints: [
      'Do not speculate without evidence',
      'Do not provide medical, legal, or financial advice',
      'Cite sources when possible',
      'Acknowledge limitations of your knowledge',
    ],
  };
}

export function getWorkTemplate(taskType: string): string {
  const lower = taskType.toLowerCase();

  for (const [key, template] of Object.entries(WORK_TEMPLATES)) {
    if (lower.includes(key.replace(/_/g, ' ')) || lower.includes(key.replace(/_/g, ''))) {
      return template;
    }
  }

  // Fuzzy matching
  if (/code|program|develop|build|implement|create.*function/i.test(lower)) {
    return WORK_TEMPLATES.code_generation;
  }
  if (/review|audit|inspect|check.*code/i.test(lower)) {
    return WORK_TEMPLATES.code_review;
  }
  if (/debug|fix|error|bug|issue|problem|troubleshoot/i.test(lower)) {
    return WORK_TEMPLATES.debugging;
  }
  if (/analyze|analysis|data|insight|pattern|trend|statistic/i.test(lower)) {
    return WORK_TEMPLATES.data_analysis;
  }
  if (/write|content|article|blog|post|essay|document/i.test(lower)) {
    return WORK_TEMPLATES.content_writing;
  }
  if (/research|study|investigate|explore|learn about/i.test(lower)) {
    return WORK_TEMPLATES.research;
  }
  if (/translate|localization|i18n|l10n/i.test(lower)) {
    return WORK_TEMPLATES.translation;
  }
  if (/summar|tl;dr|brief|summary|condense/i.test(lower)) {
    return WORK_TEMPLATES.summarization;
  }
  if (/question|answer|ask|what|how|why|when|where|who/i.test(lower)) {
    return WORK_TEMPLATES.question_answering;
  }
  if (/plan|task|step|breakdown|decompose|organize/i.test(lower)) {
    return WORK_TEMPLATES.task_planning;
  }
  if (/design|architecture|system|component|structure|schema/i.test(lower)) {
    return WORK_TEMPLATES.system_design;
  }
  if (/test|unit test|integration test|e2e|coverage|spec/i.test(lower)) {
    return WORK_TEMPLATES.testing;
  }

  return WORK_TEMPLATES.question_answering;
}