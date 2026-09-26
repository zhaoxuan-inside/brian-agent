export class JsonParser {
  

  static stripCodeFence(text: string): string {
    if (!text) return text;
    let t = text.trim();
    t = t.replace(/^```[a-zA-Z]*\s*\n?/, '');
    t = t.replace(/\n?```\s*$/, '');
    return t.trim();
  }

  

  static parse(text: string): unknown | null {
    if (!text) return null;
    const cleaned = JsonParser.stripCodeFence(text);

    const direct = JsonParser.tryParse(cleaned);
    if (direct !== null) return direct;

    const objStr = JsonParser.extractObject(cleaned);
    if (objStr !== null) {
      const obj = JsonParser.tryParse(objStr);
      if (obj !== null) return obj;
    }

    const arrStr = JsonParser.extractArray(cleaned);
    if (arrStr !== null) {
      const arr = JsonParser.tryParse(arrStr);
      if (arr !== null) return arr;
    }

    return null;
  }

  

  static parseObject(text: string): Record<string, unknown> | null {
    const value = JsonParser.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  }

  

  static parseArray(text: string): unknown[] | null {
    const value = JsonParser.parse(text);
    if (Array.isArray(value)) {
      return value;
    }
    return null;
  }

  

  static extractObject(text: string): string | null {
    if (!text) return null;
    const match = text.match(/\{[\s\S]*\}/);
    return match ? match[0] : null;
  }

  

  static extractArray(text: string): string | null {
    if (!text) return null;
    const match = text.match(/\[[\s\S]*\]/);
    return match ? match[0] : null;
  }

  

  static check(text: string): { valid: boolean; error: string } {
    try {
      JSON.parse(text);
      return { valid: true, error: '' };
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  

  static format(text: string, indent = 2): string | null {
    const value = JsonParser.parse(text);
    if (value === null) return null;
    try {
      return JSON.stringify(value, null, indent);
    } catch {
      return null;
    }
  }

  

  static minify(text: string): string | null {
    const value = JsonParser.parse(text);
    if (value === null) return null;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  

  private static tryParse(text: string): unknown | null {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
