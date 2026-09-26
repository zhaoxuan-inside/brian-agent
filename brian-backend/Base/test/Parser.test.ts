import { describe, it, expect } from 'vitest';
import { JsonParser, XmlParser } from '../ToolProvider';

describe('JsonParser', () => {
  describe('stripCodeFence', () => {
    it('should strip json code fence', () => {
      expect(JsonParser.stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it('should strip plain code fence', () => {
      expect(JsonParser.stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it('should return unchanged when no fence', () => {
      expect(JsonParser.stripCodeFence('{"a":1}')).toBe('{"a":1}');
    });
  });

  describe('parse', () => {
    it('should parse plain object', () => {
      expect(JsonParser.parse('{"a":1}')).toEqual({ a: 1 });
    });

    it('should parse object wrapped in code fence', () => {
      expect(JsonParser.parse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    });

    it('should parse object with surrounding text', () => {
      const result = JsonParser.parse('好的，结果如下：\n{"name":"brian","age":3}\n希望有帮助');
      expect(result).toEqual({ name: 'brian', age: 3 });
    });

    it('should parse array with code fence', () => {
      expect(JsonParser.parse('```\n[1,2,3]\n```')).toEqual([1, 2, 3]);
    });

    it('should return null on invalid input', () => {
      expect(JsonParser.parse('not json at all')).toBeNull();
      expect(JsonParser.parse('')).toBeNull();
    });
  });

  describe('parseObject / parseArray', () => {
    it('should distinguish object and array', () => {
      expect(JsonParser.parseObject('{"a":1}')).toEqual({ a: 1 });
      expect(JsonParser.parseObject('[1,2]')).toBeNull();
      expect(JsonParser.parseArray('[1,2]')).toEqual([1, 2]);
      expect(JsonParser.parseArray('{"a":1}')).toBeNull();
    });
  });

  describe('extractObject / extractArray', () => {
    it('should extract first object substring', () => {
      expect(JsonParser.extractObject('前缀 {"a":1} 后缀')).toBe('{"a":1}');
      expect(JsonParser.extractArray('前缀 [1,2] 后缀')).toBe('[1,2]');
      expect(JsonParser.extractObject('no object')).toBeNull();
    });
  });

  describe('check / format / minify', () => {
    it('should check valid json', () => {
      expect(JsonParser.check('{"a":1}').valid).toBe(true);
      expect(JsonParser.check('{"a":1}').error).toBe('');
      expect(JsonParser.check('{"a":1,}').valid).toBe(false);
      expect(JsonParser.check('not json').valid).toBe(false);
    });

    it('should format json with indent', () => {
      expect(JsonParser.format('{"a":1,"b":[1,2]}')).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}');
    });

    it('should minify json', () => {
      expect(JsonParser.minify('{\n  "a": 1\n}')).toBe('{"a":1}');
    });

    it('should return null on invalid input', () => {
      expect(JsonParser.format('not json')).toBeNull();
      expect(JsonParser.minify('')).toBeNull();
    });
  });
});

describe('XmlParser', () => {
  describe('parse', () => {
    it('should parse nested elements', () => {
      const node = XmlParser.parse('<root><a>1</a><b>2</b></root>');
      expect(node).not.toBeNull();
      expect(node!.tag).toBe('root');
      expect(node!.children.map((c) => c.tag)).toEqual(['a', 'b']);
      expect(node!.children[0].text).toBe('1');
    });

    it('should parse attributes', () => {
      const node = XmlParser.parse('<person name="brian" age="3" />');
      expect(node!.tag).toBe('person');
      expect(node!.attributes).toEqual({ name: 'brian', age: '3' });
    });

    it('should parse self-closing element', () => {
      const node = XmlParser.parse('<br/>');
      expect(node!.tag).toBe('br');
      expect(node!.children).toEqual([]);
    });

    it('should parse CDATA', () => {
      const node = XmlParser.parse('<msg><![CDATA[<raw>text</raw>]]></msg>');
      expect(node!.text).toBe('<raw>text</raw>');
    });

    it('should ignore comments and declaration', () => {
      const node = XmlParser.parse('<?xml version="1.0"?>\n<!-- note -->\n<root>hi</root>');
      expect(node!.tag).toBe('root');
      expect(node!.text).toBe('hi');
    });

    it('should decode entities', () => {
      const node = XmlParser.parse('<a>&lt;tag&gt; &amp; &#34;q&#34;</a>');
      expect(node!.text).toBe('<tag> & "q"');
    });

    it('should return null on invalid input', () => {
      expect(XmlParser.parse('')).toBeNull();
      expect(XmlParser.parse('plain text')).toBeNull();
    });
  });

  describe('extract / extractAll', () => {
    it('should extract first tag content', () => {
      expect(XmlParser.extract('<result>42</result>', 'result')).toBe('42');
    });

    it('should extract all matching tag content', () => {
      expect(XmlParser.extractAll('<i>1</i><i>2</i><i>3</i>', 'i')).toEqual(['1', '2', '3']);
    });

    it('should return null / empty on missing tag', () => {
      expect(XmlParser.extract('<a>1</a>', 'b')).toBeNull();
      expect(XmlParser.extractAll('<a>1</a>', 'b')).toEqual([]);
    });
  });

  describe('toObject', () => {
    it('should convert to plain object', () => {
      const obj = XmlParser.toObject('<user name="b"><name>brian</name><age>3</age></user>');
      expect(obj).toEqual({
        '@name': 'b',
        name: { '#text': 'brian' },
        age: { '#text': '3' },
      });
    });

    it('should return null on invalid input', () => {
      expect(XmlParser.toObject('')).toBeNull();
    });
  });

  describe('check / format / minify', () => {
    it('should check valid xml', () => {
      expect(XmlParser.check('<a>1</a>').valid).toBe(true);
      expect(XmlParser.check('<a>1</a>').error).toBe('');
      expect(XmlParser.check('<a>1').valid).toBe(false);
      expect(XmlParser.check('plain text').valid).toBe(false);
    });

    it('should format xml with indent', () => {
      const out = XmlParser.format('<root><a>1</a><b>2</b></root>');
      expect(out).toBe('<root>\n  <a>1</a>\n  <b>2</b>\n</root>');
    });

    it('should minify xml', () => {
      expect(XmlParser.minify('<root>\n  <a>1</a>\n</root>')).toBe('<root><a>1</a></root>');
    });

    it('should round-trip attributes and entities', () => {
      const out = XmlParser.format('<person name="b" age="3"><tag>a &lt; b</tag></person>');
      expect(out).toBe('<person name="b" age="3">\n  <tag>a &lt; b</tag>\n</person>');
    });

    it('should return null on invalid input', () => {
      expect(XmlParser.format('not xml')).toBeNull();
      expect(XmlParser.minify('')).toBeNull();
    });
  });
});
