/**
 * EmpathyEngine - Detects user emotions, infers emotional causes,
 * generates empathetic responses, and adjusts behavior accordingly.
 */
export class EmpathyEngine {
  private emotionalMemory: {
    emotion: string;
    cause: string;
    response: string;
    timestamp: number;
  }[] = [];

  detectEmotion(userInput: string): {
    emotion: string;
    intensity: number;
    confidence: number;
  } {
    const lower = userInput.toLowerCase();

    const emotionKeywords: Record<string, { words: string[]; intensity: number }> = {
      frustrated: {
        words: ['frustrated', 'frustrating', 'annoying', 'irritating', 'stuck', 'can\'t', 'cannot', 'won\'t work', 'not working', 'broken', 'useless', 'why won\'t', 'doesn\'t work', 'driving me crazy', 'pulling my hair'],
        intensity: 0.7,
      },
      confused: {
        words: ['confused', 'confusing', 'don\'t understand', 'not clear', 'unclear', 'what does', 'how does', 'i don\'t get', 'makes no sense', 'puzzled', 'baffled', 'lost'],
        intensity: 0.5,
      },
      anxious: {
        words: ['worried', 'anxious', 'nervous', 'stressed', 'concerned', 'scared', 'afraid', 'panic', 'urgent', 'asap', 'emergency', 'right now', 'immediately'],
        intensity: 0.8,
      },
      angry: {
        words: ['angry', 'mad', 'furious', 'pissed', 'outraged', 'ridiculous', 'unacceptable', 'terrible', 'awful', 'horrible', 'worst', 'stupid', 'idiotic'],
        intensity: 0.9,
      },
      sad: {
        words: ['sad', 'disappointed', 'upset', 'unhappy', 'depressed', 'let down', 'wish', 'unfortunately', 'regret', 'sorry', 'unfortunate'],
        intensity: 0.6,
      },
      happy: {
        words: ['happy', 'glad', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome', 'love', 'thank', 'appreciate', 'perfect', 'worked', 'solved'],
        intensity: 0.7,
      },
      excited: {
        words: ['excited', 'thrilled', 'can\'t wait', 'looking forward', 'eager', 'enthusiastic', 'pumped', 'stoked', 'awesome', 'incredible', 'amazing'],
        intensity: 0.8,
      },
      grateful: {
        words: ['thank you', 'thanks', 'appreciate', 'grateful', 'thankful', 'helped', 'helpful', 'saved me', 'lifesaver'],
        intensity: 0.6,
      },
      neutral: {
        words: ['okay', 'fine', 'alright', 'normal', 'standard', 'regular', 'typical', 'common', 'usual', 'ordinary'],
        intensity: 0.3,
      },
    };

    let bestEmotion = 'neutral';
    let bestScore = 0;
    let maxIntensity = 0.3;

    for (const [emotion, config] of Object.entries(emotionKeywords)) {
      let score = 0;
      for (const word of config.words) {
        if (lower.includes(word)) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestEmotion = emotion;
        maxIntensity = config.intensity;
      }
    }

    const intensity = bestScore > 0
      ? Math.min(maxIntensity + bestScore * 0.05, 1.0)
      : 0.3;

    const confidence = bestScore > 0
      ? Math.min(0.5 + bestScore * 0.1, 0.95)
      : 0.3;

    return {
      emotion: bestEmotion,
      intensity: Math.round(intensity * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  inferEmotionCause(emotion: string, context: string): string {
    const lower = context.toLowerCase();

    const causePatterns: Record<string, string[]> = {
      frustrated: [
        'repeated failures', 'unexpected errors', 'lack of progress',
        'unclear documentation', 'complex setup', 'dependency issues',
        'tool limitations', 'time wasted',
      ],
      confused: [
        'unclear instructions', 'ambiguous requirements', 'contradictory information',
        'missing context', 'new or unfamiliar concepts', 'complex terminology',
        'insufficient examples',
      ],
      anxious: [
        'looming deadlines', 'high stakes', 'uncertainty about approach',
        'lack of experience', 'perfectionism', 'fear of mistakes',
      ],
      angry: [
        'unfair treatment', 'broken promises', 'repeated issues',
        'lack of respect', 'wasted effort', 'incompetence',
      ],
      sad: [
        'disappointment in results', 'unmet expectations', 'loss of opportunity',
        'rejection', 'failure', 'missed goals',
      ],
      happy: [
        'successful outcome', 'problem solved', 'positive feedback',
        'progress made', 'helpful interaction', 'achievement unlocked',
      ],
      excited: [
        'new opportunity', 'interesting challenge', 'innovative solution',
        'upcoming feature', 'positive change', 'discovery',
      ],
    };

    const patterns = causePatterns[emotion] || ['general context'];
    for (const pattern of patterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return `The ${emotion} emotion appears to be caused by: ${pattern}`;
      }
    }

    // Context-based inference
    if (/error|bug|fail|crash/i.test(lower)) {
      return `The ${emotion} emotion appears to be caused by technical issues or errors.`;
    }
    if (/deadline|urgent|time|date/i.test(lower)) {
      return `The ${emotion} emotion appears to be related to time pressure or deadlines.`;
    }
    if (/help|support|guide|tutorial|documentation/i.test(lower)) {
      return `The ${emotion} emotion appears to be related to needing help or guidance.`;
    }

    return `The ${emotion} emotion appears to be caused by the current context.`;
  }

  generateEmpatheticResponse(userEmotion: {
    emotion: string;
    intensity: number;
  }): string {
    const responses: Record<string, string[]> = {
      frustrated: [
        'I understand this is frustrating. Let me take a different approach to help resolve this.',
        'I can see why this would be frustrating. Let\'s break this down step by step.',
        'I hear your frustration. Let me try to find a simpler solution for you.',
      ],
      confused: [
        'I understand that may be confusing. Let me explain more clearly.',
        'Let me clarify that for you - I\'ll break it down into simpler parts.',
        'I can see why that might be unclear. Let me provide a clearer explanation.',
      ],
      anxious: [
        'I understand you\'re concerned. Let me help you work through this systematically.',
        'I hear your urgency. Let\'s focus on the most critical aspects first.',
        'I know this can be stressful. Let me provide a clear plan to address your concerns.',
      ],
      angry: [
        'I understand your frustration. Let me focus on resolving the actual issue.',
        'I hear you. Let me address the core problem directly.',
        'I can see this has been difficult. Let me help you find a concrete solution.',
      ],
      sad: [
        'I understand that\'s disappointing. Let me help you find a better approach.',
        'I hear you. Let me see if there\'s a way to improve the situation.',
        'I understand this isn\'t what you hoped for. Let me help you move forward.',
      ],
      happy: [
        'That\'s great to hear! I\'m glad things are working well.',
        'Excellent! I\'m happy to see the positive outcome.',
        'Wonderful! Let me know how else I can help.',
      ],
      excited: [
        'That sounds exciting! Let me help you make the most of this.',
        'I share your enthusiasm! Let\'s dive into this together.',
        'Great energy! Let me support you in making this happen.',
      ],
      grateful: [
        'You\'re welcome! I\'m glad I could help.',
        'Happy to help! That\'s what I\'m here for.',
        'I appreciate your kind words! Let me know if you need anything else.',
      ],
      neutral: [
        'I understand. Let me help you with that.',
        'Got it. Let me work on this for you.',
        'Understood. Let me assist you with this.',
      ],
    };

    const options = responses[userEmotion.emotion] || responses.neutral;
    const idx = Math.floor(Math.random() * options.length);
    const baseResponse = options[idx];

    // Adjust based on intensity
    if (userEmotion.intensity > 0.8) {
      return baseResponse + ' I want to make sure we address this thoroughly.';
    }

    return baseResponse;
  }

  adjustBehavior(emotion: string): {
    tone: string;
    pace: string;
    verbosity: string;
  } {
    const behaviorMap: Record<string, { tone: string; pace: string; verbosity: string }> = {
      frustrated: { tone: 'calm and supportive', pace: 'deliberate', verbosity: 'concise' },
      confused: { tone: 'patient and clear', pace: 'slow', verbosity: 'detailed' },
      anxious: { tone: 'reassuring and structured', pace: 'steady', verbosity: 'focused' },
      angry: { tone: 'neutral and professional', pace: 'measured', verbosity: 'direct' },
      sad: { tone: 'empathetic and encouraging', pace: 'gentle', verbosity: 'supportive' },
      happy: { tone: 'positive and engaging', pace: 'normal', verbosity: 'expansive' },
      excited: { tone: 'enthusiastic and energetic', pace: 'brisk', verbosity: 'dynamic' },
      grateful: { tone: 'warm and appreciative', pace: 'normal', verbosity: 'friendly' },
      neutral: { tone: 'balanced and professional', pace: 'normal', verbosity: 'standard' },
    };

    return behaviorMap[emotion] || behaviorMap.neutral;
  }

  storeEmotionalEvent(event: {
    emotion: string;
    cause: string;
    response: string;
  }): void {
    this.emotionalMemory.push({
      ...event,
      timestamp: Date.now(),
    });

    if (this.emotionalMemory.length > 500) {
      this.emotionalMemory = this.emotionalMemory.slice(-500);
    }
  }

  retrieveEmotionalMemory(context: string): {
    emotion: string;
    cause: string;
    response: string;
    timestamp: number;
  }[] {
    const lower = context.toLowerCase();

    return this.emotionalMemory
      .filter(mem =>
        mem.emotion.toLowerCase().includes(lower) ||
        mem.cause.toLowerCase().includes(lower) ||
        mem.response.toLowerCase().includes(lower)
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}