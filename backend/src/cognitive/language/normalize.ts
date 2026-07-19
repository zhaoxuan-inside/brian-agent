/**
 * LanguageNormalizer - Language normalization pipeline.
 * Detects language, standardizes text, removes redundancy,
 * extracts semantics, sentiment, entities, and temporal features.
 */
export class LanguageNormalizer {
  async normalize(text: string): Promise<{
    originalText: string;
    normalizedText: string;
    language: string;
    semanticRepresentation: {
      subject: string;
      predicate: string;
      object: string;
      modifiers: { type: string; value: string; strength: number }[];
    };
    sentiment: {
      polarity: string;
      intensity: number;
      sentimentWords: string[];
      negation: boolean;
    };
    entities: { name: string; type: string }[];
    temporalFeatures: {
      tense: string;
      aspect: string;
      temporalMarker?: string;
    };
    confidence: number;
  }> {
    const langResult = this.detectLanguage(text);
    const standardized = this.standardize(text);
    const deduped = this.removeRedundancy(standardized);
    const semantics = this.extractSemantics(deduped);
    const sentiment = this.annotateSentiment(deduped);
    const entities = this.extractEntities(deduped);
    const temporal = this.extractTemporalFeatures(deduped);

    // Confidence based on text length and language detection confidence
    const confidence = Math.min(
      langResult.confidence * 0.5 +
      (Math.min(text.length / 100, 1) * 0.3) +
      0.2,
      1.0
    );

    return {
      originalText: text,
      normalizedText: deduped,
      language: langResult.language,
      semanticRepresentation: semantics,
      sentiment,
      entities,
      temporalFeatures: temporal,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  private detectLanguage(text: string): { language: string; confidence: number } {
    // Check for CJK characters (Chinese, Japanese, Korean)
    let cjkCount = 0;
    let latinCount = 0;
    let totalChars = 0;

    for (const char of text) {
      const code = char.charCodeAt(0);
      totalChars++;

      // CJK Unified Ideographs, Hiragana, Katakana, Hangul
      if (
        (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified
        (code >= 0x3400 && code <= 0x4DBF) || // CJK Ext A
        (code >= 0x3040 && code <= 0x309F) || // Hiragana
        (code >= 0x30A0 && code <= 0x30FF) || // Katakana
        (code >= 0xAC00 && code <= 0xD7AF)    // Hangul
      ) {
        cjkCount++;
      } else if (
        (code >= 0x0041 && code <= 0x005A) || // A-Z
        (code >= 0x0061 && code <= 0x007A)    // a-z
      ) {
        latinCount++;
      }
    }

    if (totalChars === 0) {
      return { language: 'unknown', confidence: 0 };
    }

    const cjkRatio = cjkCount / totalChars;
    const latinRatio = latinCount / totalChars;

    if (cjkRatio > 0.3) {
      // Further distinguish Chinese from Japanese
      let hiraganaCount = 0;
      let hangulCount = 0;
      for (const char of text) {
        const code = char.charCodeAt(0);
        if (code >= 0x3040 && code <= 0x309F) hiraganaCount++;
        if (code >= 0xAC00 && code <= 0xD7AF) hangulCount++;
      }

      if (hiraganaCount > 0 && hiraganaCount / totalChars > 0.05) {
        return { language: 'ja', confidence: Math.min(cjkRatio, 0.95) };
      }
      if (hangulCount > 0 && hangulCount / totalChars > 0.05) {
        return { language: 'ko', confidence: Math.min(cjkRatio, 0.95) };
      }
      return { language: 'zh', confidence: Math.min(cjkRatio, 0.95) };
    }

    if (latinRatio > 0.5) {
      return { language: 'en', confidence: Math.min(latinRatio, 0.95) };
    }

    return { language: 'unknown', confidence: 0.3 };
  }

  private standardize(text: string): string {
    let result = text;

    // Full-width to half-width conversion
    result = result.replace(/[\uFF01-\uFF5E]/g, (ch) => {
      const code = ch.charCodeAt(0) - 0xFEE0;
      return String.fromCharCode(code);
    });

    // Full-width space to half-width
    result = result.replace(/\u3000/g, ' ');

    // Normalize whitespace: collapse multiple spaces, trim
    result = result.replace(/[\s\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]+/g, ' ').trim();

    // Normalize newlines: max 2 consecutive newlines
    result = result.replace(/\n{3,}/g, '\n\n');

    // Normalize Unicode: NFC normalization
    result = result.normalize('NFC');

    // Remove zero-width characters
    result = result.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

    // Lowercase for English portions (but preserve case for CJK which doesn't have case)
    // We lowercase only ASCII characters
    result = result.replace(/[A-Z]+/g, (match) => {
      // Don't lowercase acronyms that are all caps in CJK context
      return match.toLowerCase();
    });

    return result;
  }

  private removeRedundancy(text: string): string {
    let result = text;

    // Detect repeated words (e.g., "the the", "is is")
    result = result.replace(/\b(\w+)\s+\1\b/g, '$1');

    // Detect repeated CJK characters
    result = result.replace(/([\u4E00-\u9FFF])\1{2,}/g, '$1$1');

    // Remove excessive degree modifiers
    const degreeModifiers = [
      'very very', 'really really', 'extremely extremely',
      'absolutely absolutely', 'totally totally',
    ];
    for (const mod of degreeModifiers) {
      result = result.replace(new RegExp(`\\b${mod.replace(/\s+/g, '\\s+')}\\b`, 'gi'), mod.split(' ')[0]);
    }

    // Remove redundant punctuation
    result = result.replace(/!{3,}/g, '!!');
    result = result.replace(/\?{3,}/g, '??');
    result = result.replace(/\.{4,}/g, '...');

    return result;
  }

  private extractSemantics(text: string): {
    subject: string;
    predicate: string;
    object: string;
    modifiers: { type: string; value: string; strength: number }[];
  } {
    // Simple SVO extraction using NLP patterns
    let subject = '';
    let predicate = '';
    let object = '';
    const modifiers: { type: string; value: string; strength: number }[] = [];

    // Pattern 1: "I/You/We/They/He/She/It VERB ..."
    const pronounPattern = /\b(I|you|we|they|he|she|it|this|that)\s+(\w+(?:\s+\w+){0,3})\s+(.+?)(?:[.!?]|$)/i;
    const pronounMatch = text.match(pronounPattern);
    if (pronounMatch) {
      subject = pronounMatch[1];
      predicate = pronounMatch[2];
      object = pronounMatch[3].trim();
    }

    // Pattern 2: "SUBJECT is/are/was/were OBJECT"
    const copulaPattern = /\b(\w+(?:\s+\w+){0,3})\s+(is|are|was|were|seems|appears|became)\s+(.+?)(?:[.!?]|$)/i;
    const copulaMatch = text.match(copulaPattern);
    if (copulaMatch && !subject) {
      subject = copulaMatch[1].trim();
      predicate = copulaMatch[2].trim();
      object = copulaMatch[3].trim();
    }

    // Pattern 3: "SUBJECT VERB OBJECT" (with common verbs)
    const svoPattern = /\b(\w+(?:\s+\w+){0,4})\s+(create|make|build|write|read|send|get|find|use|need|want|like|love|hate|know|think|believe|say|tell|ask|give|take|put|set|run|start|stop|help|show|learn|teach)\s+(.+?)(?:[.!?]|$)/i;
    const svoMatch = text.match(svoPattern);
    if (svoMatch && !subject) {
      subject = svoMatch[1].trim();
      predicate = svoMatch[2].trim();
      object = svoMatch[3].trim();
    }

    // Pattern 4: Chinese SVO: "SUBJECT VERB OBJECT"
    if (!subject) {
      const cnPattern = /([\u4E00-\u9FFF]{1,8})(是|做|写|读|发|找|用|需要|想要|喜欢|知道|认为|说|告诉|问|给|拿|放|设置|运行|开始|停止|帮助|显示|学习|教)([\u4E00-\u9FFF\w]+)/;
      const cnMatch = text.match(cnPattern);
      if (cnMatch) {
        subject = cnMatch[1];
        predicate = cnMatch[2];
        object = cnMatch[3];
      }
    }

    // Extract modifiers (adjectives, adverbs)
    const modifierPatterns = [
      { regex: /\b(very|quite|rather|somewhat|extremely|highly|really|pretty)\s+(\w+)/gi, type: 'adverb' },
      { regex: /\b(\w+ly)\s+(\w+)/gi, type: 'adverb' },
      { regex: /\b(\w+)\s+(and|or|but|however|therefore|moreover|furthermore|nevertheless)\b/gi, type: 'conjunction' },
    ];

    for (const pattern of modifierPatterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        const value = match[0];
        const strength = match[1].length > 6 ? 0.8 : 0.5;
        if (!modifiers.find(m => m.value === value)) {
          modifiers.push({ type: pattern.type, value, strength });
        }
      }
      pattern.regex.lastIndex = 0;
    }

    // Extract degree modifiers
    const degreeWords = ['very', 'extremely', 'highly', 'quite', 'really', 'absolutely', 'totally', 'completely'];
    for (const dw of degreeWords) {
      const re = new RegExp(`\\b${dw}\\b`, 'gi');
      if (re.test(text)) {
        modifiers.push({ type: 'degree', value: dw, strength: 0.7 });
      }
    }

    return { subject, predicate, object, modifiers };
  }

  private annotateSentiment(text: string): {
    polarity: string;
    intensity: number;
    sentimentWords: string[];
    negation: boolean;
  } {
    const lower = text.toLowerCase();

    // Positive words
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
      'perfect', 'brilliant', 'outstanding', 'superb', 'love', 'happy', 'nice',
      'beautiful', 'incredible', 'best', 'helpful', 'thank', 'thanks', 'appreciate',
      'correct', 'right', 'awesome', 'cool', 'impressive', 'magnificent', 'splendid',
      'terrific', 'exceptional', 'remarkable', 'phenomenal', 'stellar',
    ];

    // Negative words
    const negativeWords = [
      'bad', 'terrible', 'horrible', 'awful', 'poor', 'worst', 'buggy', 'broken',
      'slow', 'crash', 'error', 'fail', 'issue', 'problem', 'wrong', 'ugly',
      'useless', 'stupid', 'hate', 'dislike', 'annoying', 'frustrating', 'irritating',
      'confusing', 'difficult', 'hard', 'complicated', 'complex', 'painful',
      'tedious', 'boring', 'ugly', 'disgusting', 'dreadful', 'dismal', 'lousy',
    ];

    // Neutral words
    const neutralWords = [
      'okay', 'fine', 'average', 'normal', 'standard', 'regular', 'typical',
      'common', 'usual', 'ordinary', 'neutral', 'moderate', 'acceptable',
    ];

    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    const sentimentWords: string[] = [];

    // Detect negation
    const negationPatterns = [
      /\b(not|no|never|neither|nor|don't|doesn't|didn't|won't|can't|cannot|shouldn't|wouldn't|couldn't|isn't|aren't|wasn't|weren't|hasn't|haven't|hadn't)\b/i,
    ];
    let negation = false;
    for (const pattern of negationPatterns) {
      if (pattern.test(text)) {
        negation = true;
        break;
      }
    }

    for (const word of positiveWords) {
      const re = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lower.match(re);
      if (matches) {
        positiveCount += matches.length;
        for (const m of matches) {
          sentimentWords.push(m);
        }
      }
    }

    for (const word of negativeWords) {
      const re = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lower.match(re);
      if (matches) {
        negativeCount += matches.length;
        for (const m of matches) {
          sentimentWords.push(m);
        }
      }
    }

    for (const word of neutralWords) {
      const re = new RegExp(`\\b${word}\\b`, 'gi');
      const matches = lower.match(re);
      if (matches) {
        neutralCount += matches.length;
      }
    }

    // If negation is detected, flip polarity
    if (negation) {
      const temp = positiveCount;
      positiveCount = negativeCount;
      negativeCount = temp;
    }

    let polarity: string;
    let intensity: number;

    const totalSentiment = positiveCount + negativeCount + neutralCount;
    if (totalSentiment === 0) {
      polarity = 'neutral';
      intensity = 0;
    } else {
      const netScore = positiveCount - negativeCount;
      intensity = Math.min(Math.abs(netScore) / Math.max(totalSentiment, 1) * 2, 1.0);

      if (netScore > 0) {
        polarity = 'positive';
      } else if (netScore < 0) {
        polarity = 'negative';
      } else {
        polarity = 'neutral';
      }
    }

    return {
      polarity,
      intensity: Math.round(intensity * 100) / 100,
      sentimentWords: [...new Set(sentimentWords)],
      negation,
    };
  }

  private extractEntities(text: string): { name: string; type: string }[] {
    const entities: { name: string; type: string }[] = [];
    const seen = new Set<string>();

    // Person names (simple pattern: capitalized words not at sentence start)
    const personPattern = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
    let match;
    while ((match = personPattern.exec(text)) !== null) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        entities.push({ name: match[0], type: 'person' });
      }
    }

    // Organization patterns
    const orgPattern = /\b(?:Google|Apple|Microsoft|Amazon|Facebook|Meta|Tesla|OpenAI|Anthropic|DeepMind|GitHub|GitLab|Bitbucket|Stack\s*Overflow|npm|PyPI|Docker|Kubernetes|AWS|Azure|GCP)\b/g;
    while ((match = orgPattern.exec(text)) !== null) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        entities.push({ name: match[0], type: 'organization' });
      }
    }

    // Technology/product names
    const techPattern = /\b(?:React|Vue|Angular|Svelte|Next\.js|Nuxt|Node\.js|Express|FastAPI|Django|Flask|Spring|Rails|Laravel|TypeScript|JavaScript|Python|Rust|Go|Java|Kotlin|Swift|PostgreSQL|MySQL|MongoDB|Redis|GraphQL|REST|gRPC|Docker|Kubernetes|Terraform)\b/g;
    while ((match = techPattern.exec(text)) !== null) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        entities.push({ name: match[0], type: 'technology' });
      }
    }

    // Location patterns
    const locationPattern = /\b(?:in|at|from|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g;
    while ((match = locationPattern.exec(text)) !== null) {
      const name = match[1];
      if (!seen.has(name) && !/^(?:The|This|That|It|He|She|They|We|You|I|A|An|In|At|On|By|To|For|With)$/.test(name)) {
        seen.add(name);
        entities.push({ name, type: 'location' });
      }
    }

    // Date/time patterns
    const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi;
    while ((match = datePattern.exec(text)) !== null) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        entities.push({ name: match[0], type: 'date' });
      }
    }

    // URL patterns
    const urlPattern = /\bhttps?:\/\/[^\s]+/g;
    while ((match = urlPattern.exec(text)) !== null) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        entities.push({ name: match[0], type: 'url' });
      }
    }

    // Email patterns
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    while ((match = emailPattern.exec(text)) !== null) {
      if (!seen.has(match[0])) {
        seen.add(match[0]);
        entities.push({ name: match[0], type: 'email' });
      }
    }

    return entities;
  }

  private extractTemporalFeatures(text: string): {
    tense: string;
    aspect: string;
    temporalMarker?: string;
  } {
    const lower = text.toLowerCase();

    // Past tense markers
    const pastPatterns = [
      /\b(was|were|did|had|been|gone|done|made|took|gave|came|went|saw|said|told|asked|knew|thought|felt|found|got|put|set|ran|started|stopped|helped|showed|learned|taught|wrote|read|sent|used|needed|wanted|liked|loved|hated|created|built|made)\b/i,
      /\b\w+(ed)\b/i,
      /\b(yesterday|ago|last\s+(?:week|month|year|night|time)|previously|formerly|earlier|before|in\s+the\s+past)\b/i,
    ];

    // Present tense markers
    const presentPatterns = [
      /\b(am|is|are|do|does|have|has|go|goes|come|comes|see|sees|say|says|tell|tells|ask|asks|know|knows|think|thinks|feel|feels|find|finds|get|gets|put|puts|set|sets|run|runs|start|starts|stop|stops|help|helps|show|shows|learn|learns|teach|teaches|write|writes|read|reads|send|sends|use|uses|need|needs|want|wants|like|likes|love|loves|hate|hates|create|creates|build|builds|make|makes)\b/i,
      /\b(now|currently|presently|at\s+the\s+moment|right\s+now|today|this\s+(?:week|month|year))\b/i,
    ];

    // Future tense markers
    const futurePatterns = [
      /\b(will|shall|going\s+to|gonna|would|could|should|might|may|can|must|ought\s+to)\s+\w+/i,
      /\b(tomorrow|next\s+(?:week|month|year|time)|soon|later|eventually|in\s+the\s+future|someday|upcoming|planned)\b/i,
    ];

    let pastScore = 0;
    let presentScore = 0;
    let futureScore = 0;

    for (const pattern of pastPatterns) {
      if (pattern.test(text)) pastScore++;
    }
    for (const pattern of presentPatterns) {
      if (pattern.test(text)) presentScore++;
    }
    for (const pattern of futurePatterns) {
      if (pattern.test(text)) futureScore++;
    }

    let tense = 'present';
    let aspect = 'simple';
    let temporalMarker: string | undefined;

    if (pastScore > presentScore && pastScore >= futureScore) {
      tense = 'past';
    } else if (futureScore > presentScore && futureScore > pastScore) {
      tense = 'future';
    }

    // Detect aspect
    if (/\b(?:have|has|had)\s+(?:been\s+)?\w+(?:ing|ed)\b/i.test(lower)) {
      aspect = 'perfect';
    } else if (/\b(?:am|is|are|was|were)\s+\w+ing\b/i.test(lower)) {
      aspect = 'progressive';
    }

    // Detect temporal markers
    const markerPatterns = [
      { regex: /\b(yesterday)\b/i, marker: 'yesterday' },
      { regex: /\b(today)\b/i, marker: 'today' },
      { regex: /\b(tomorrow)\b/i, marker: 'tomorrow' },
      { regex: /\b(now|currently|right now)\b/i, marker: 'now' },
      { regex: /\b(ago|previously|earlier)\b/i, marker: 'past_reference' },
      { regex: /\b(later|soon|eventually)\b/i, marker: 'future_reference' },
      { regex: /\b(last\s+\w+)\b/i, marker: 'last_period' },
      { regex: /\b(next\s+\w+)\b/i, marker: 'next_period' },
    ];

    for (const { regex, marker } of markerPatterns) {
      const m = text.match(regex);
      if (m) {
        temporalMarker = m[1] || marker;
        break;
      }
    }

    return { tense, aspect, temporalMarker };
  }
}