/**
 * EmotionStateModule - Emotion state tracking and regulation.
 * Tracks the agent's emotional state, detects user emotions,
 * and provides emotion regulation strategies.
 */
export class EmotionStateModule {
  private currentEmotion: {
    primaryEmotion: string;
    intensity: number;
    mood: string;
    triggers: string[];
  };

  private emotionHistory: {
    emotion: string;
    intensity: number;
    timestamp: number;
    context: string;
  }[] = [];

  private emotionEffects: Record<string, { attentionFocus: string; creativity: string; patience: string }> = {
    happy: { attentionFocus: 'broad', creativity: 'high', patience: 'high' },
    neutral: { attentionFocus: 'balanced', creativity: 'moderate', patience: 'moderate' },
    frustrated: { attentionFocus: 'narrow', creativity: 'low', patience: 'low' },
    curious: { attentionFocus: 'targeted', creativity: 'high', patience: 'high' },
    confident: { attentionFocus: 'broad', creativity: 'high', patience: 'moderate' },
    uncertain: { attentionFocus: 'narrow', creativity: 'low', patience: 'high' },
    analytical: { attentionFocus: 'narrow', creativity: 'low', patience: 'high' },
    creative: { attentionFocus: 'broad', creativity: 'high', patience: 'moderate' },
    tired: { attentionFocus: 'narrow', creativity: 'low', patience: 'low' },
    excited: { attentionFocus: 'broad', creativity: 'high', patience: 'low' },
  };

  constructor() {
    this.currentEmotion = {
      primaryEmotion: 'neutral',
      intensity: 0.5,
      mood: 'balanced',
      triggers: [],
    };
  }

  getCurrentEmotion(): {
    primaryEmotion: string;
    intensity: number;
    mood: string;
    triggers: string[];
  } {
    return { ...this.currentEmotion, triggers: [...this.currentEmotion.triggers] };
  }

  updateEmotion(context: string, triggers: string[]): {
    primaryEmotion: string;
    intensity: number;
    mood: string;
  } {
    // Determine new emotion based on context and triggers
    const lower = context.toLowerCase();
    const triggerLower = triggers.join(' ').toLowerCase();

    let newEmotion = 'neutral';
    let newIntensity = 0.5;

    // Positive emotional triggers
    if (
      /success|achievement|completed|solved|fixed|working|great|excellent|amazing|perfect|wonderful|thank|appreciate|correct|good\s+job|well\s+done/i.test(lower + triggerLower)
    ) {
      newEmotion = 'happy';
      newIntensity = 0.7 + Math.random() * 0.3;
    }
    // Negative/error triggers
    else if (
      /error|fail|bug|crash|broken|issue|problem|wrong|incorrect|bad|terrible|awful|confusing|difficult|can't|cannot|doesn't\s+work/i.test(lower + triggerLower)
    ) {
      newEmotion = 'frustrated';
      newIntensity = 0.5 + Math.random() * 0.4;
    }
    // Learning/curiosity triggers
    else if (
      /learn|explore|discover|research|investigate|understand|curious|interesting|fascinating|new|novel/i.test(lower + triggerLower)
    ) {
      newEmotion = 'curious';
      newIntensity = 0.6 + Math.random() * 0.3;
    }
    // Analytical triggers
    else if (
      /analyze|review|inspect|examine|debug|test|validate|verify|check|audit|measure|benchmark|profile/i.test(lower + triggerLower)
    ) {
      newEmotion = 'analytical';
      newIntensity = 0.5 + Math.random() * 0.3;
    }
    // Creative triggers
    else if (
      /create|design|build|make|generate|write|draw|imagine|innovate|prototype|brainstorm/i.test(lower + triggerLower)
    ) {
      newEmotion = 'creative';
      newIntensity = 0.6 + Math.random() * 0.3;
    }
    // Uncertainty triggers
    else if (
      /not sure|maybe|perhaps|possibly|uncertain|unclear|ambiguous|confused|don't know|wonder|question/i.test(lower + triggerLower)
    ) {
      newEmotion = 'uncertain';
      newIntensity = 0.4 + Math.random() * 0.3;
    }

    // Smooth transition: blend current and new emotion
    const blendFactor = 0.3;
    const blendedIntensity = this.currentEmotion.intensity * (1 - blendFactor) + newIntensity * blendFactor;

    // Determine mood based on emotion and intensity
    let mood = 'balanced';
    if (blendedIntensity > 0.7) {
      if (['happy', 'excited', 'creative'].includes(newEmotion)) {
        mood = 'energized';
      } else if (['frustrated', 'angry'].includes(newEmotion)) {
        mood = 'tense';
      }
    } else if (blendedIntensity < 0.3) {
      mood = 'calm';
    }

    const previousEmotion = this.currentEmotion.primaryEmotion;

    this.currentEmotion = {
      primaryEmotion: newEmotion,
      intensity: Math.round(blendedIntensity * 100) / 100,
      mood,
      triggers: [...triggers],
    };

    if (previousEmotion !== newEmotion) {
      this.emotionHistory.push({
        emotion: newEmotion,
        intensity: blendedIntensity,
        timestamp: Date.now(),
        context,
      });
    }

    // Keep history bounded
    if (this.emotionHistory.length > 500) {
      this.emotionHistory = this.emotionHistory.slice(-500);
    }

    return {
      primaryEmotion: this.currentEmotion.primaryEmotion,
      intensity: this.currentEmotion.intensity,
      mood: this.currentEmotion.mood,
    };
  }

  detectUserEmotion(userInput: string): {
    emotion: string;
    intensity: number;
    confidence: number;
  } {
    const lower = userInput.toLowerCase();

    const emotionKeywords: Record<string, string[]> = {
      happy: ['happy', 'glad', 'pleased', 'delighted', 'thrilled', 'excited', 'joyful', 'cheerful', 'satisfied', 'grateful'],
      sad: ['sad', 'unhappy', 'depressed', 'disappointed', 'upset', 'miserable', 'heartbroken', 'down', 'blue', 'gloomy'],
      angry: ['angry', 'mad', 'furious', 'frustrated', 'irritated', 'annoyed', 'outraged', 'pissed', 'enraged', 'livid'],
      confused: ['confused', 'puzzled', 'perplexed', 'baffled', 'lost', 'unclear', 'unsure', 'bewildered', 'disoriented'],
      anxious: ['anxious', 'worried', 'nervous', 'stressed', 'tense', 'uneasy', 'apprehensive', 'concerned', 'panicked'],
      curious: ['curious', 'interested', 'intrigued', 'fascinated', 'wondering', 'questioning', 'exploring'],
      grateful: ['thank', 'thanks', 'appreciate', 'grateful', 'thankful', 'blessed', 'indebted'],
      urgent: ['urgent', 'emergency', 'asap', 'immediately', 'right now', 'critical', 'rush', 'quickly', 'hurry'],
      neutral: ['okay', 'fine', 'alright', 'normal', 'standard', 'regular', 'typical', 'common'],
    };

    let bestEmotion = 'neutral';
    let bestScore = 0;
    let totalMatches = 0;

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      let score = 0;
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          score++;
          totalMatches++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestEmotion = emotion;
      }
    }

    const intensity = bestScore > 0
      ? Math.min(0.3 + bestScore * 0.2, 1.0)
      : 0.3;

    const confidence = totalMatches > 0
      ? Math.min(0.5 + totalMatches * 0.1, 0.95)
      : 0.3;

    return {
      emotion: bestEmotion,
      intensity: Math.round(intensity * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  getEmotionEffects(emotion: string): {
    attentionFocus: string;
    creativity: string;
    patience: string;
  } {
    return this.emotionEffects[emotion] || this.emotionEffects.neutral;
  }

  regulateEmotion(targetState: string): {
    action: string;
    expectedEffect: string;
  } {
    const current = this.currentEmotion.primaryEmotion;

    const regulationStrategies: Record<string, Record<string, { action: string; expectedEffect: string }>> = {
      frustrated: {
        calm: { action: 'Take a step back and review the approach systematically. Break down the problem into smaller parts.', expectedEffect: 'Reduces frustration by providing a clearer path forward' },
        analytical: { action: 'Focus on the specific error or issue. Analyze the root cause objectively.', expectedEffect: 'Channels frustration into productive problem-solving' },
        neutral: { action: 'Acknowledge the difficulty but maintain focus on the goal. Consider alternative approaches.', expectedEffect: 'Balances emotional response with rational thinking' },
      },
      anxious: {
        calm: { action: 'Prioritize and organize tasks. Focus on one thing at a time.', expectedEffect: 'Reduces overwhelm by creating structure' },
        confident: { action: 'Review past successes and similar problems you have solved.', expectedEffect: 'Builds confidence through positive reinforcement' },
      },
      confused: {
        curious: { action: 'Ask clarifying questions. Break down the unknown into smaller, explorable parts.', expectedEffect: 'Transforms confusion into productive inquiry' },
        analytical: { action: 'Gather more information systematically. Create a structured approach to understanding.', expectedEffect: 'Builds knowledge foundation to resolve confusion' },
      },
      neutral: {
        curious: { action: 'Explore new angles and perspectives on the current topic.', expectedEffect: 'Sparks engagement and deeper understanding' },
        creative: { action: 'Try a novel approach or unconventional solution.', expectedEffect: 'Encourages innovation and out-of-the-box thinking' },
      },
    };

    const strategies = regulationStrategies[current];
    if (strategies && strategies[targetState]) {
      return strategies[targetState];
    }

    // Default regulation
    return {
      action: `Shift focus from ${current} to ${targetState} by adjusting perspective and approach.`,
      expectedEffect: `Transition emotional state toward ${targetState}`,
    };
  }

  getEmotionHistory(): {
    emotion: string;
    intensity: number;
    timestamp: number;
    context: string;
  }[] {
    return [...this.emotionHistory];
  }
}