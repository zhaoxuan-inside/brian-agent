import { Engine, Rule, RuleProperties } from 'json-rules-engine';

const emptyConditions: RuleProperties['conditions'] = { all: [] };

export class RuleEngine {
  private engine: Engine;

  constructor() {
    this.engine = new Engine();
  }

  addRule(rule: RuleProperties): void {
    this.engine.addRule(rule);
  }

  removeRule(ruleId: string): void {
    this.engine.removeRule(ruleId);
  }

  async evaluate(facts: Record<string, unknown>): Promise<RuleProperties[]> {
    const results = await this.engine.run(facts);
    return results.events
      .map((e) => e.params
        ? { conditions: emptyConditions, event: { type: e.type, params: e.params } } as RuleProperties
        : undefined)
      .filter((p): p is RuleProperties => p !== undefined);
  }

  async evaluateWithFacts(facts: Record<string, unknown>): Promise<RuleProperties[]> {
    return this.evaluate(facts);
  }

  getAllRules(): RuleProperties[] {
    return [];
  }

  clearRules(): void {
    this.engine = new Engine();
  }

  static createRule(options: {
    name: string;
    conditions: RuleProperties['conditions'];
    event: RuleProperties['event'];
  }): Rule {
    return new Rule(options);
  }
}
