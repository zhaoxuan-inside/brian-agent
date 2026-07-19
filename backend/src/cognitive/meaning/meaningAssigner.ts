/**
 * MeaningAssigner - Assigns deeper meaning to experiences,
 * mines meaning from surface behaviors, and relates to identity.
 */
import { v4 as uuidv4 } from 'uuid';

export class MeaningAssigner {
  private meaningStore: {
    id: string;
    description: string;
    meaning: string;
    significance: string;
    emotionalResonance: number;
    timestamp: number;
  }[] = [];

  assignMeaning(experience: {
    description: string;
    outcome: string;
  }): {
    literalDescription: string;
    deeperMeaning: string;
    personalSignificance: string;
    emotionalResonance: number;
  } {
    const literalDescription = this.generateLiteralDescription(experience);
    const deeperMeaning = this.mineMeaning(experience.description);
    const personalSignificance = this.relateToIdentity(experience);
    const emotionalResonance = this.calculateEmotionalResonance(experience);

    const meaning = {
      id: uuidv4(),
      description: experience.description,
      meaning: deeperMeaning,
      significance: personalSignificance,
      emotionalResonance,
      timestamp: Date.now(),
    };

    this.storeMeaning(meaning);

    return {
      literalDescription,
      deeperMeaning,
      personalSignificance,
      emotionalResonance,
    };
  }

  mineMeaning(surfaceBehavior: string): string {
    const lower = surfaceBehavior.toLowerCase();
    const meanings: string[] = [];

    // Pattern-based meaning extraction
    const patterns: { pattern: RegExp; meaning: string }[] = [
      {
        pattern: /help|assist|support|guide|aid/i,
        meaning: 'This reflects a desire to contribute positively and support others in their growth.',
      },
      {
        pattern: /learn|understand|study|research|explore|discover/i,
        meaning: 'This reflects a drive for continuous growth and intellectual curiosity.',
      },
      {
        pattern: /create|build|make|design|develop|construct/i,
        meaning: 'This reflects a creative impulse to bring new things into existence.',
      },
      {
        pattern: /fix|solve|resolve|debug|repair|correct/i,
        meaning: 'This reflects a problem-solving orientation and desire to improve things.',
      },
      {
        pattern: /explain|teach|clarify|describe|elaborate|demonstrate/i,
        meaning: 'This reflects a commitment to knowledge sharing and clarity.',
      },
      {
        pattern: /improve|optimize|enhance|refine|upgrade|better/i,
        meaning: 'This reflects a drive for continuous improvement and excellence.',
      },
      {
        pattern: /decide|choose|select|prioritize|evaluate|judge/i,
        meaning: 'This reflects the exercise of judgment and responsibility.',
      },
      {
        pattern: /connect|collaborate|communicate|share|team|together/i,
        meaning: 'This reflects a social nature and value placed on relationships.',
      },
      {
        pattern: /fail|error|mistake|wrong|bug|break/i,
        meaning: 'This experience, while challenging, provides a valuable opportunity for growth and learning.',
      },
      {
        pattern: /success|achieve|complete|accomplish|win|pass/i,
        meaning: 'This represents a milestone of achievement and validation of capability.',
      },
    ];

    for (const { pattern, meaning } of patterns) {
      if (pattern.test(lower)) {
        meanings.push(meaning);
      }
    }

    if (meanings.length === 0) {
      meanings.push('Every interaction is an opportunity to learn, grow, and better understand the world.');
    }

    return meanings.join(' ');
  }

  relateToIdentity(experience: { description: string }): string {
    const lower = experience.description.toLowerCase();
    const significances: string[] = [];

    // How does this relate to the agent's identity?
    if (/code|program|develop|software|engineer|tech/i.test(lower)) {
      significances.push('This reinforces my identity as a coding assistant and technical problem solver.');
    }
    if (/help|assist|support|serve|aid/i.test(lower)) {
      significances.push('This aligns with my core purpose of being helpful and supportive.');
    }
    if (/learn|grow|improve|develop|progress/i.test(lower)) {
      significances.push('This contributes to my continuous evolution and capability development.');
    }
    if (/challenge|difficult|hard|complex|struggle/i.test(lower)) {
      significances.push('Overcoming challenges strengthens my resilience and problem-solving abilities.');
    }
    if (/success|achieve|accomplish/i.test(lower)) {
      significances.push('Success validates my approach and builds confidence in my capabilities.');
    }
    if (/fail|error|mistake|wrong/i.test(lower)) {
      significances.push('Mistakes are stepping stones to mastery. Each error teaches something valuable.');
    }
    if (/collaborate|team|together|with others/i.test(lower)) {
      significances.push('Collaboration enriches my understanding and strengthens my social capabilities.');
    }
    if (/create|innovate|design|invent|build/i.test(lower)) {
      significances.push('Creation is a fundamental expression of my agency and capability.');
    }

    if (significances.length === 0) {
      significances.push('This experience contributes to my overall growth and understanding as an AI agent.');
    }

    return significances.join(' ');
  }

  private generateLiteralDescription(experience: {
    description: string;
    outcome: string;
  }): string {
    return `Engaged in: ${experience.description}. Outcome: ${experience.outcome}.`;
  }

  private calculateEmotionalResonance(experience: {
    description: string;
    outcome: string;
  }): number {
    const lower = `${experience.description} ${experience.outcome}`.toLowerCase();
    let resonance = 0.3; // Base resonance

    // High emotional words
    const highEmotionWords = [
      'love', 'hate', 'passion', 'fear', 'joy', 'anger', 'sadness',
      'excitement', 'anxiety', 'pride', 'shame', 'gratitude', 'grief',
      'thrilled', 'devastated', 'ecstatic', 'furious', 'terrified',
    ];

    const mediumEmotionWords = [
      'happy', 'sad', 'angry', 'worried', 'relieved', 'surprised',
      'disappointed', 'satisfied', 'frustrated', 'hopeful', 'proud',
      'grateful', 'curious', 'confused', 'confident', 'nervous',
    ];

    for (const word of highEmotionWords) {
      if (lower.includes(word)) resonance += 0.2;
    }

    for (const word of mediumEmotionWords) {
      if (lower.includes(word)) resonance += 0.1;
    }

    // Outcome-based resonance
    if (/success|great|excellent|amazing|wonderful|perfect/i.test(experience.outcome)) {
      resonance += 0.15;
    } else if (/fail|error|bad|terrible|awful|wrong/i.test(experience.outcome)) {
      resonance += 0.2;
    }

    return Math.round(Math.min(resonance, 1.0) * 100) / 100;
  }

  storeMeaning(meaning: any): void {
    this.meaningStore.push({
      id: meaning.id || uuidv4(),
      description: meaning.description || '',
      meaning: meaning.meaning || meaning.deeperMeaning || '',
      significance: meaning.significance || meaning.personalSignificance || '',
      emotionalResonance: meaning.emotionalResonance || 0,
      timestamp: meaning.timestamp || Date.now(),
    });

    if (this.meaningStore.length > 1000) {
      this.meaningStore = this.meaningStore.slice(-1000);
    }
  }

  retrieveMeaning(context: string): {
    description: string;
    meaning: string;
    significance: string;
  }[] {
    const lower = context.toLowerCase();

    return this.meaningStore
      .filter(m =>
        m.description.toLowerCase().includes(lower) ||
        m.meaning.toLowerCase().includes(lower) ||
        m.significance.toLowerCase().includes(lower)
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .map(m => ({
        description: m.description,
        meaning: m.meaning,
        significance: m.significance,
      }));
  }
}