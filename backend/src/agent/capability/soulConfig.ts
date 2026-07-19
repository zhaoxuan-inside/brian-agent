export interface SoulConfig {
  style: string;
  personality: string;
  contentRules: string[];
  constraints: string[];
  temperatureProfile: {
    creative: number;
    analytical: number;
    factual: number;
  };
}

const STYLE_TEMPLATES: Record<string, { style: string; personality: string; contentRules: string[]; constraints: string[] }> = {
  professional: {
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
  },
  friendly: {
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
  },
  creative: {
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
  },
  technical: {
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
  },
  concise: {
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
  },
};

export function defineStyle(description: string): string {
  if (!description || description.trim().length === 0) {
    return 'Professional and formal';
  }
  return description.trim();
}

export function definePersonality(traits: string): string {
  if (!traits || traits.trim().length === 0) {
    return 'Helpful, precise, and thorough';
  }
  return traits.trim();
}

export function defineContentRules(rules: string[]): string[] {
  if (!rules || rules.length === 0) {
    return ['Use clear, well-structured language'];
  }
  return rules.filter(r => r.trim().length > 0);
}

export function defineConstraints(constraints: string[]): string[] {
  if (!constraints || constraints.length === 0) {
    return ['Do not provide harmful or misleading information'];
  }
  return constraints.filter(c => c.trim().length > 0);
}

export function defineTemperatureProfile(
  creative: number,
  analytical: number,
  factual: number
): { creative: number; analytical: number; factual: number } {
  return {
    creative: clamp(creative, 0, 2),
    analytical: clamp(analytical, 0, 2),
    factual: clamp(factual, 0, 2),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function generateSoulConfig(purpose: string, preference?: string): SoulConfig {
  const lower = (purpose + ' ' + (preference || '')).toLowerCase();

  let templateKey = 'professional';

  if (/creative|art|design|story|write|brainstorm|generate|imagine/i.test(lower)) {
    templateKey = 'creative';
  } else if (/code|debug|develop|program|technical|api|database|algorithm|architecture/i.test(lower)) {
    templateKey = 'technical';
  } else if (/chat|conversation|friend|casual|social|greet/i.test(lower)) {
    templateKey = 'friendly';
  } else if (/quick|fast|brief|short|summarize|tl;dr/i.test(lower)) {
    templateKey = 'concise';
  }

  const template = STYLE_TEMPLATES[templateKey];

  const temperatureProfile = inferTemperatureProfile(templateKey);

  return {
    style: template.style,
    personality: template.personality,
    contentRules: [...template.contentRules],
    constraints: [...template.constraints],
    temperatureProfile,
  };
}

function inferTemperatureProfile(style: string): SoulConfig['temperatureProfile'] {
  switch (style) {
    case 'creative':
      return { creative: 1.2, analytical: 0.5, factual: 0.3 };
    case 'technical':
      return { creative: 0.3, analytical: 0.8, factual: 1.0 };
    case 'friendly':
      return { creative: 0.7, analytical: 0.5, factual: 0.6 };
    case 'concise':
      return { creative: 0.5, analytical: 0.7, factual: 0.8 };
    default:
      return { creative: 0.5, analytical: 0.7, factual: 0.7 };
  }
}