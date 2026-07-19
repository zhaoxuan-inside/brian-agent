import { v4 as uuidv4 } from 'uuid';

const SENTIMENT_POSITIVE = [
  'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome', 'perfect',
  'brilliant', 'outstanding', 'superb', 'love', 'happy', 'good', 'nice', 'beautiful',
  'incredible', 'best', 'thanks', 'thank', 'helpful', 'appreciate', 'pleased',
];

const SENTIMENT_NEGATIVE = [
  'terrible', 'horrible', 'awful', 'bad', 'poor', 'worst', 'buggy', 'broken',
  'slow', 'crash', 'error', 'fail', 'issue', 'problem', 'wrong', 'frustrating',
  'annoying', 'irritating', 'confusing', 'difficult', 'hard', 'complicated',
  'useless', 'waste', 'hate', 'disappointed', 'sorry', 'unfortunately',
];

const SENTIMENT_FRUSTRATED = [
  'frustrating', 'annoying', 'irritating', 'confusing', 'difficult', 'hard',
  'complicated', 'complex', 'tedious', 'painful', 'stuck', 'cannot', 'can\'t',
  'won\'t', 'doesn\'t', 'not working', 'not work',
];

const SENTIMENT_EXCITED = [
  'exciting', 'innovative', 'groundbreaking', 'revolutionary', 'cutting-edge',
  'state-of-the-art', 'next-gen', 'modern', 'cool', 'interesting', 'fascinating',
  'wow', 'awesome', 'amazing', 'incredible',
];

const INTENT_PATTERNS: { pattern: RegExp; intent: string }[] = [
  { pattern: /how (do|can|to|does|should|would|will|is)/i, intent: 'how_to' },
  { pattern: /what (is|are|does|do|would|should|can|could|about)/i, intent: 'information' },
  { pattern: /why (is|are|does|do|would|should|can|could)/i, intent: 'explanation' },
  { pattern: /(generate|create|build|make|write|produce|develop|implement|construct|design)/i, intent: 'creation' },
  { pattern: /(fix|debug|solve|resolve|repair|correct|patch|troubleshoot)/i, intent: 'fix' },
  { pattern: /(explain|describe|elaborate|clarify|tell me about)/i, intent: 'explanation' },
  { pattern: /(analyze|examine|investigate|assess|evaluate|review|audit|inspect)/i, intent: 'analysis' },
  { pattern: /(compare|versus|vs\.?|difference between|contrast)/i, intent: 'comparison' },
  { pattern: /(translate|convert|transform|change.*to)/i, intent: 'transformation' },
  { pattern: /(summarize|summary|brief|tl;dr|recap|overview|outline)/i, intent: 'summarization' },
  { pattern: /(search|find|lookup|locate|discover|retrieve)/i, intent: 'search' },
  { pattern: /(execute|run|perform|do|execute|invoke)/i, intent: 'execution' },
  { pattern: /(plan|organize|schedule|arrange|coordinate|prepare)/i, intent: 'planning' },
  { pattern: /^(hello|hi|hey|greetings|good morning|good afternoon|good evening)/i, intent: 'greeting' },
];

const ENTITY_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g, type: 'proper_noun' },
  { pattern: /\bhttps?:\/\/[^\s]+/g, type: 'url' },
  { pattern: /\b[\w.-]+@[\w.-]+\.\w+\b/g, type: 'email' },
  { pattern: /\b\d{4}-\d{2}-\d{2}\b/g, type: 'date' },
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, type: 'ip' },
  { pattern: /\b[A-Za-z0-9._%+-]+\.(?:com|org|net|io|dev|app|co|ai|gov|edu)\b/g, type: 'domain' },
  { pattern: /\b(?:[\w-]+\.)?[\w-]+\.\w{2,}\b/g, type: 'file_path_or_namespace' },
];

export function parseInput(rawInput: string): {
  type: string;
  content: string;
  metadata: Record<string, unknown>;
} {
  if (!rawInput || rawInput.trim().length === 0) {
    return {
      type: 'empty',
      content: '',
      metadata: { timestamp: Date.now(), wordCount: 0, charCount: 0 },
    };
  }

  const trimmed = rawInput.trim();
  const wordCount = trimmed.split(/\s+/).length;
  const charCount = trimmed.length;

  // Detect input type
  let type = 'text';
  if (/^\{[\s\S]*\}$/.test(trimmed) || /^\[[\s\S]*\]$/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      type = 'json';
    } catch {
      // Not valid JSON
    }
  }
  if (/```[\s\S]*```/.test(trimmed)) {
    type = 'code';
  }
  if (/^\//.test(trimmed)) {
    type = 'command';
  }
  if (wordCount === 1 && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    type = 'keyword';
  }

  const metadata: Record<string, unknown> = {
    timestamp: Date.now(),
    wordCount,
    charCount,
    hasCode: /```[\s\S]*```/.test(trimmed),
    hasUrl: /https?:\/\/[^\s]+/.test(trimmed),
    lineCount: trimmed.split('\n').length,
  };

  return { type, content: trimmed, metadata };
}

export function validateInput(input: { type: string; content: string }): {
  valid: boolean;
  error?: string;
} {
  if (!input || !input.content) {
    return { valid: false, error: 'Input content is required' };
  }

  if (typeof input.content !== 'string') {
    return { valid: false, error: 'Input content must be a string' };
  }

  const trimmed = input.content.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Input content cannot be empty' };
  }

  if (trimmed.length > 100000) {
    return { valid: false, error: 'Input content exceeds maximum length of 100,000 characters' };
  }

  // Check for obviously malicious injection patterns
  const injectionPatterns = [
    /<script[\s>]/i,
    /javascript:\s*/i,
    /on\w+\s*=\s*["']/i,
    /UNION\s+SELECT/i,
    /\bDROP\s+TABLE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bINSERT\s+INTO\b/i,
    /<\s*iframe/i,
    /<\s*embed/i,
    /<\s*object/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Input contains potentially unsafe content' };
    }
  }

  return { valid: true };
}

export function preprocess(input: { type: string; content: string }): {
  type: string;
  content: string;
  tokens: string[];
} {
  const trimmed = input.content.trim();

  // Normalize whitespace
  let normalized = trimmed.replace(/\s+/g, ' ');

  // Remove excessive newlines
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  // Tokenize
  const tokens = tokenize(normalized);

  return {
    type: input.type,
    content: normalized,
    tokens,
  };
}

function tokenize(text: string): string[] {
  // Split on word boundaries, preserving punctuation
  const tokens: string[] = [];
  const regex = /\w+|[^\w\s]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[0].toLowerCase());
  }

  return tokens;
}

export function extractContext(input: string): {
  intent: string;
  entities: string[];
  sentiment: string;
} {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // Intent detection
  let intent = 'general';
  for (const { pattern, intent: i } of INTENT_PATTERNS) {
    if (pattern.test(lower)) {
      intent = i;
      break;
    }
  }

  // Entity extraction
  const entities: string[] = [];
  const seen = new Set<string>();
  for (const { pattern, type } of ENTITY_PATTERNS) {
    const matches = trimmed.match(pattern);
    if (matches) {
      for (const m of matches) {
        if (!seen.has(m)) {
          seen.add(m);
          entities.push(m);
        }
      }
    }
  }

  // Sentiment detection
  let sentiment = 'neutral';
  const scores: Record<string, number> = {
    positive: 0,
    negative: 0,
    frustrated: 0,
    excited: 0,
  };

  for (const word of SENTIMENT_POSITIVE) {
    if (lower.includes(word)) scores.positive++;
  }
  for (const word of SENTIMENT_NEGATIVE) {
    if (lower.includes(word)) scores.negative++;
  }
  for (const word of SENTIMENT_FRUSTRATED) {
    if (lower.includes(word)) scores.frustrated++;
  }
  for (const word of SENTIMENT_EXCITED) {
    if (lower.includes(word)) scores.excited++;
  }

  // Determine dominant sentiment
  let maxScore = 0;
  let dominantSentiment = 'neutral';
  for (const [key, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      dominantSentiment = key;
    }
  }

  if (maxScore > 0) {
    if (scores.frustrated > 0 && scores.negative > 0) {
      sentiment = 'frustrated';
    } else if (scores.excited > 0 && scores.positive > 0) {
      sentiment = 'excited';
    } else if (scores.positive > scores.negative + scores.frustrated) {
      sentiment = 'positive';
    } else if (scores.negative > scores.positive + scores.excited) {
      sentiment = 'negative';
    }
  }

  return { intent, entities, sentiment };
}