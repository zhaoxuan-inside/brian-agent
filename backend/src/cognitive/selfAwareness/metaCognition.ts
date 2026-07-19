/**
 * MetaCognitionModule - Self-monitoring and reflection on cognitive processes.
 * Tracks task execution, evaluates confidence, detects errors and biases.
 */
export class MetaCognitionModule {
  private monitors: Map<string, {
    task: string;
    steps: { step: string; duration: number; outcome: string }[];
    startTime: number;
    active: boolean;
  }> = new Map();

  private cognitiveLoadHistory: { timestamp: number; load: number }[] = [];

  startMonitor(task: string): string {
    const monitorId = `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.monitors.set(monitorId, {
      task,
      steps: [],
      startTime: Date.now(),
      active: true,
    });
    return monitorId;
  }

  recordStep(monitorId: string, step: string, duration: number, outcome: string): void {
    const monitor = this.monitors.get(monitorId);
    if (!monitor || !monitor.active) return;

    monitor.steps.push({ step, duration, outcome });
  }

  evaluateConfidence(): number {
    const allMonitors = Array.from(this.monitors.values());
    if (allMonitors.length === 0) return 0.5;

    let totalConfidence = 0;
    let monitorCount = 0;

    for (const monitor of allMonitors) {
      if (monitor.steps.length === 0) continue;

      const successSteps = monitor.steps.filter(s => s.outcome === 'success').length;
      const totalSteps = monitor.steps.length;
      const successRate = successSteps / totalSteps;

      // Duration-based confidence: consistent durations indicate competence
      const durations = monitor.steps.map(s => s.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance = durations.reduce((sum, d) => sum + (d - avgDuration) ** 2, 0) / durations.length;
      const stdDev = Math.sqrt(variance);
      const consistencyScore = avgDuration > 0 ? Math.max(0, 1 - stdDev / avgDuration) : 0.5;

      const confidence = 0.7 * successRate + 0.3 * consistencyScore;
      totalConfidence += confidence;
      monitorCount++;
    }

    return monitorCount > 0
      ? Math.round((totalConfidence / monitorCount) * 100) / 100
      : 0.5;
  }

  detectErrors(output: string): { hasErrors: boolean; errors: string[] } {
    const errors: string[] = [];

    // Error indicators in output
    const errorPatterns = [
      { pattern: /\b(?:Error|Exception|TypeError|ReferenceError|SyntaxError|RangeError)\b[: ].*/gi, label: 'Error message in output' },
      { pattern: /undefined\s+is\s+not\s+a\s+(?:function|object)/gi, label: 'JavaScript type error' },
      { pattern: /cannot\s+(?:read|find|access|call|invoke)\s+\w+/gi, label: 'Access error' },
      { pattern: /\b(?:null|undefined|NaN|Infinity)\b(?!.*(?:expected|intentional))/gi, label: 'Null/undefined value' },
      { pattern: /(?:failed|failure|unsuccessful|aborted|timed?\s*out)/gi, label: 'Operation failure' },
      { pattern: /(?:404|500|502|503|403|401)\s*(?:error|status)?/gi, label: 'HTTP error status' },
      { pattern: /(?:permission\s*denied|access\s*denied|unauthorized|forbidden)/gi, label: 'Permission error' },
      { pattern: /(?:stack\s*trace|traceback|backtrace)/gi, label: 'Stack trace in output' },
      { pattern: /\[object\s+Object\]/gi, label: 'ToString on object' },
      { pattern: /(?:circular|cyclic)\s+(?:reference|dependency)/gi, label: 'Circular reference' },
    ];

    for (const { pattern, label } of errorPatterns) {
      if (pattern.test(output)) {
        errors.push(label);
      }
    }

    // Check for incomplete output
    const incompletePatterns = [
      /\b(?:TODO|FIXME|HACK|XXX|WORKAROUND)\b/gi,
      /\.\.\.$/,
      /\(incomplete\)/i,
      /wip/i,
    ];

    for (const pattern of incompletePatterns) {
      if (pattern.test(output)) {
        errors.push('Output appears incomplete');
        break;
      }
    }

    return { hasErrors: errors.length > 0, errors };
  }

  detectBiases(reasoning: string): { hasBiases: boolean; biases: string[] } {
    const biases: string[] = [];
    const lower = reasoning.toLowerCase();

    // Confirmation bias: seeking evidence that confirms existing beliefs
    const confirmationPatterns = [
      /\b(?:as\s+I\s+expected|as\s+expected|proves\s+my\s+point|confirms\s+what\s+I)\b/i,
      /\b(?:this\s+clearly\s+shows|obviously|without\s+a\s+doubt|undoubtedly)\b/i,
    ];
    for (const p of confirmationPatterns) {
      if (p.test(lower)) {
        biases.push('confirmation_bias');
        break;
      }
    }

    // Anchoring bias: relying too heavily on first piece of information
    if (/\b(?:first|initial|originally|starting\s+from|based\s+on\s+the\s+first)\b/i.test(lower) &&
        /\b(?:therefore|thus|consequently|so|hence)\b/i.test(lower)) {
      biases.push('anchoring_bias');
    }

    // Overconfidence bias
    if (/\b(?:I\s+am\s+(?:100%|absolutely|completely|certainly)\s+sure|guaranteed|certain|definitely)\b/i.test(lower)) {
      biases.push('overconfidence_bias');
    }

    // Recency bias: overemphasizing recent events
    if (/\b(?:recently|just\s+now|latest|most\s+recent|the\s+last\s+time)\b/i.test(lower) &&
        /\b(?:always|never|every\s+time|typically|usually)\b/i.test(lower)) {
      biases.push('recency_bias');
    }

    // Availability bias: overestimating importance of easily recalled info
    if (/\b(?:everyone\s+knows|it's\s+common\s+knowledge|obviously|clearly|everybody|nobody)\b/i.test(lower)) {
      biases.push('availability_bias');
    }

    // Framing bias: being influenced by how info is presented
    if (/\b(?:90%|95%|99%|most|majority|minority|few)\b/i.test(lower) &&
        /\b(?:fail|succeed|work|break|good|bad|better|worse)\b/i.test(lower)) {
      biases.push('framing_bias');
    }

    // Self-serving bias: attributing success to self and failure to external
    if (/\b(?:I\s+did|my\s+approach|my\s+method|my\s+solution)\b/i.test(lower) &&
        /\b(?:failed|error|mistake|bug|issue|problem)\b/i.test(lower) &&
        /\b(?:because\s+of|due\s+to|owing\s+to)\b/i.test(lower)) {
      biases.push('self_serving_bias');
    }

    return { hasBiases: biases.length > 0, biases };
  }

  suggestCorrection(errors: string[]): string[] {
    const corrections: string[] = [];

    const correctionMap: Record<string, string> = {
      'Error message in output': 'Check exception handling. Wrap error-prone code in try-catch and provide meaningful error messages.',
      'JavaScript type error': 'Add type checking before accessing properties. Use optional chaining (?.) and nullish coalescing (??).',
      'Access error': 'Verify that the target object exists before accessing it. Add null/undefined checks.',
      'Null/undefined value': 'Add default values and null checks. Consider using TypeScript strict mode.',
      'Operation failure': 'Add retry logic with exponential backoff. Implement circuit breaker pattern for external calls.',
      'HTTP error status': 'Add proper HTTP error handling. Check API endpoint availability and rate limits.',
      'Permission error': 'Verify access permissions and API keys. Ensure proper authentication and authorization.',
      'Stack trace in output': 'Remove stack traces from user-facing output. Log them separately for debugging.',
      'ToString on object': 'Use JSON.stringify() for serializing objects. Implement proper toString() methods.',
      'Circular reference': 'Use a replacer function with JSON.stringify. Use WeakMap for tracking visited objects.',
      'Output appears incomplete': 'Ensure the response is complete. Check for truncation or early termination.',
    };

    for (const error of errors) {
      const correction = correctionMap[error] || `Review and fix: ${error}`;
      corrections.push(correction);
    }

    return corrections;
  }

  getCognitiveLoad(): number {
    const now = Date.now();
    const activeMonitors = Array.from(this.monitors.values()).filter(m => m.active);
    const totalSteps = activeMonitors.reduce((sum, m) => sum + m.steps.length, 0);

    // Base load from active monitors
    let load = activeMonitors.length * 0.1;

    // Additional load from steps
    load += totalSteps * 0.02;

    // Cap at 1.0
    load = Math.min(load, 1.0);

    // Record history
    this.cognitiveLoadHistory.push({ timestamp: now, load });
    if (this.cognitiveLoadHistory.length > 100) {
      this.cognitiveLoadHistory = this.cognitiveLoadHistory.slice(-100);
    }

    return Math.round(load * 100) / 100;
  }

  endMonitor(monitorId: string): {
    steps: { step: string; duration: number; outcome: string }[];
    confidence: number;
    errors: string[];
    corrections: string[];
  } {
    const monitor = this.monitors.get(monitorId);
    if (!monitor) {
      return { steps: [], confidence: 0, errors: [], corrections: [] };
    }

    monitor.active = false;

    const steps = [...monitor.steps];
    const confidence = this.evaluateConfidence();

    const allOutcomes = steps.map(s => s.outcome).join(' ');
    const errorResult = this.detectErrors(allOutcomes);
    const corrections = this.suggestCorrection(errorResult.errors);

    return { steps, confidence, errors: errorResult.errors, corrections };
  }
}