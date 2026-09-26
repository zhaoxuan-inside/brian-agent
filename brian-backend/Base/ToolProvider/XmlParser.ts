export interface XmlNode {
  
  tag: string;
  
  attributes: Record<string, string>;
  
  text: string;
  
  children: XmlNode[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class XmlTokenizer {
  private readonly src: string;
  private pos = 0;

  constructor(src: string) {
    this.src = src;
  }

  private peek(offset = 0): string {
    return this.src[this.pos + offset] ?? '';
  }

  private eof(): boolean {
    return this.pos >= this.src.length;
  }

  private skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.src[this.pos])) {
      this.pos += 1;
    }
  }

  
  private skipProlog(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.src.startsWith('<?', this.pos)) {
        const end = this.src.indexOf('?>', this.pos);
        this.pos = end === -1 ? this.src.length : end + 2;
      } else if (this.src.startsWith('<!--', this.pos)) {
        const end = this.src.indexOf('-->', this.pos);
        this.pos = end === -1 ? this.src.length : end + 3;
      } else {
        return;
      }
    }
  }

  
  private readName(): string {
    let name = '';
    while (!this.eof() && /[a-zA-Z0-9_.:-]/.test(this.src[this.pos])) {
      name += this.src[this.pos];
      this.pos += 1;
    }
    return name;
  }

  
  private parseAttributes(): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (;;) {
      this.skipWhitespace();
      const c = this.peek();
      if (c === '/' || c === '>' || c === '?' || this.eof()) {
        break;
      }
      const name = this.readName();
      if (!name) {
        this.pos += 1;
        continue;
      }
      this.skipWhitespace();
      if (this.peek() === '=') {
        this.pos += 1;
        this.skipWhitespace();
        const quote = this.peek();
        if (quote === '"' || quote === "'") {
          this.pos += 1;
          let value = '';
          while (!this.eof() && this.peek() !== quote) {
            value += this.src[this.pos];
            this.pos += 1;
          }
          this.pos += 1;
          attrs[name] = XmlParser.decodeEntities(value);
        } else {
          
          let value = '';
          while (!this.eof() && !/[\s/>]/.test(this.src[this.pos])) {
            value += this.src[this.pos];
            this.pos += 1;
          }
          attrs[name] = XmlParser.decodeEntities(value);
        }
      } else {
        attrs[name] = '';
      }
    }
    return attrs;
  }

  
  parseElement(): XmlNode {
    this.skipProlog();
    this.skipWhitespace();
    if (this.peek() !== '<') {
      throw new Error('expected "<"');
    }
    this.pos += 1;

    const tag = this.readName();
    if (!tag) {
      throw new Error('invalid tag name');
    }
    const attributes = this.parseAttributes();

    this.skipWhitespace();
    
    if (this.peek() === '/') {
      this.pos += 2;
      return { tag, attributes, text: '', children: [] };
    }
    if (this.peek() !== '>') {
      throw new Error('expected ">"');
    }
    this.pos += 1;

    const node: XmlNode = { tag, attributes, text: '', children: [] };
    let text = '';

    for (;;) {
      if (this.eof()) {
        throw new Error(`unclosed tag <${tag}>`);
      }
      
      if (this.src.startsWith('</', this.pos)) {
        this.pos += 2;
        this.readName();
        this.skipWhitespace();
        if (this.peek() === '>') {
          this.pos += 1;
        }
        node.text = XmlParser.decodeEntities(text.trim());
        return node;
      }
      
      if (this.src.startsWith('<!--', this.pos)) {
        const end = this.src.indexOf('-->', this.pos);
        this.pos = end === -1 ? this.src.length : end + 3;
        continue;
      }
      
      if (this.src.startsWith('<![CDATA[', this.pos)) {
        const end = this.src.indexOf(']]>', this.pos);
        const content = end === -1
          ? this.src.slice(this.pos + 9)
          : this.src.slice(this.pos + 9, end);
        text += content;
        this.pos = end === -1 ? this.src.length : end + 3;
        continue;
      }
      
      if (this.src[this.pos] === '<') {
        if (text.trim()) {
          node.text = XmlParser.decodeEntities(text.trim());
        }
        node.children.push(this.parseElement());
        text = '';
        continue;
      }
      text += this.src[this.pos];
      this.pos += 1;
    }
  }
}

export class XmlParser {
  
  private static readonly ENTITIES: Record<string, string> = {
    '&lt;': '<',
    '&gt;': '>',
    '&amp;': '&',
    '&quot;': '"',
    '&apos;': "'",
    '&#34;': '"',
    '&#39;': "'",
  };

  
  static decodeEntities(text: string): string {
    if (!text) return text;
    return text.replace(/&(lt|gt|amp|quot|apos|#34|#39);/g, (m, _key: string) => {
      return XmlParser.ENTITIES[m] ?? m;
    });
  }

  
  private static encodeEntities(text: string): string {
    if (!text) return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  

  static parse(text: string): XmlNode | null {
    if (!text) return null;
    try {
      const tokenizer = new XmlTokenizer(text);
      return tokenizer.parseElement();
    } catch {
      return null;
    }
  }

  

  static toObject(text: string): Record<string, unknown> | null {
    const node = XmlParser.parse(text);
    if (!node) return null;
    return XmlParser.nodeToObject(node);
  }

  

  static extract(text: string, tag: string): string | null {
    if (!text || !tag) return null;
    const re = new RegExp(
      `<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)</${escapeRegExp(tag)}>`,
      'i',
    );
    const match = text.match(re);
    return match ? XmlParser.decodeEntities(match[1]) : null;
  }

  

  static extractAll(text: string, tag: string): string[] {
    if (!text || !tag) return [];
    const re = new RegExp(
      `<${escapeRegExp(tag)}\\b[^>]*>([\\s\\S]*?)</${escapeRegExp(tag)}>`,
      'gi',
    );
    const out: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      out.push(XmlParser.decodeEntities(match[1]));
    }
    return out;
  }

  

  static check(text: string): { valid: boolean; error: string } {
    const node = XmlParser.parse(text);
    if (node) {
      return { valid: true, error: '' };
    }
    return { valid: false, error: 'XML 解析失败' };
  }

  

  static format(text: string, indent = 2): string | null {
    const node = XmlParser.parse(text);
    if (!node) return null;
    return XmlParser.serializeNode(node, indent, 0);
  }

  

  static minify(text: string): string | null {
    const node = XmlParser.parse(text);
    if (!node) return null;
    return XmlParser.serializeNode(node, null, 0);
  }

  

  private static serializeNode(node: XmlNode, indent: number | null, level: number): string {
    const nl = indent === null ? '' : '\n';
    const pad = indent === null ? '' : ' '.repeat(indent * level);
    const childPad = indent === null ? '' : ' '.repeat(indent * (level + 1));

    const attrs = Object.entries(node.attributes)
      .map(([k, v]) => (v ? ` ${k}="${XmlParser.encodeEntities(v)}"` : ` ${k}`))
      .join('');

    const hasChildren = node.children.length > 0;
    const hasText = node.text.length > 0;

    
    if (!hasChildren && !hasText) {
      return `${pad}<${node.tag}${attrs}/>`;
    }

    
    if (!hasChildren) {
      return `${pad}<${node.tag}${attrs}>${XmlParser.encodeEntities(node.text)}</${node.tag}>`;
    }

    const open = `${pad}<${node.tag}${attrs}>`;
    const close = `${pad}</${node.tag}>`;

    const parts: string[] = [];
    if (hasText) {
      parts.push(`${childPad}${XmlParser.encodeEntities(node.text)}`);
    }
    for (const child of node.children) {
      parts.push(XmlParser.serializeNode(child, indent, level + 1));
    }

    return `${open}${nl}${parts.join(nl)}${nl}${close}`;
  }

  
  private static nodeToObject(node: XmlNode): Record<string, unknown> {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.attributes)) {
      obj[`@${key}`] = value;
    }

    const childTags = new Set(node.children.map((c) => c.tag));
    for (const tag of childTags) {
      const items = node.children.filter((c) => c.tag === tag);
      const values = items.map((c) => XmlParser.nodeToObject(c));
      obj[tag] = values.length === 1 ? values[0] : values;
    }

    const text = node.text;
    if (text) {
      if (node.children.length === 0 && Object.keys(node.attributes).length === 0) {
        return { '#text': text };
      }
      obj['#text'] = text;
    }
    return obj;
  }
}
