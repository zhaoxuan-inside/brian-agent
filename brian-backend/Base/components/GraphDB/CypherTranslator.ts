/**
 * @fileoverview Cypher-to-SQL translator.
 *
 * Translates the Cypher query subset used by GraphDBService into SQL
 * for execution via better-sqlite3.
 *
 * Value handling: Cypher string values use \' escaping; SQL uses '' (double quote).
 * This translator parses Cypher values, unescapes them, and re-escapes for SQL.
 */

interface SqlTranslation {
  sql: string;
  detachDelete?: boolean;
}

export class CypherTranslator {
  private static readonly COLUMNS: Record<string, string[]> = {
    graph_node: ['id', 'created', 'updated', 'node_type', 'content'],
    graph_edge: [
      'id', 'created', 'updated', 'from_node_id', 'to_node_id',
      'edge_type', 'weight', 'properties', 'last_activation_time', 'is_active',
    ],
    graph_activation_event: [
      'id', 'created', 'updated', 'graph_edge_id', 'from_node_id',
      'to_node_id', 'activation_time', 'trigger_type',
    ],
    graph_edge_daily_activation: [
      'id', 'created', 'updated', 'graph_edge_id', 'stat_date', 'activation_count',
    ],
  };

  // -------------------------------------------------------------------------
  // Public entry
  // -------------------------------------------------------------------------

  translate(cypher: string): SqlTranslation {
    const t = cypher.trim();

    if (/^CREATE\s*\(/i.test(t)) {
      return this.translateCreateNode(t);
    }
    if (/\bMATCH\b.*\bCREATE\b/i.test(t)) {
      return this.translateMatchCreate(t);
    }
    if (/\bDETACH\s+DELETE\b/i.test(t)) {
      return this.translateMatchDelete(t, true);
    }
    if (/\bMATCH\b/i.test(t) && /\bDELETE\b/i.test(t)) {
      return this.translateMatchDelete(t, false);
    }
    if (/\bMATCH\b/i.test(t) && /\bSET\b/i.test(t)) {
      return this.translateMatchSet(t);
    }
    if (/^MATCH\b/i.test(t) && /\bRETURN\b/i.test(t)) {
      return this.translateMatchReturn(t);
    }

    throw new Error(`Unsupported Cypher: ${t.substring(0, 200)}`);
  }

  // -------------------------------------------------------------------------
  // 1. CREATE node
  // -------------------------------------------------------------------------

  private translateCreateNode(cypher: string): SqlTranslation {
    const label = this.extractLabel(cypher);
    const props = this.extractPropsMap(cypher);
    const colDefs = this.knownColumns(label);

    const columns: string[] = [];
    const values: string[] = [];

    if (colDefs) {
      for (const col of colDefs) {
        columns.push(`"${col}"`);
        values.push(this.sqlLiteral(props.get(col)));
      }
    } else {
      for (const [key, val] of props) {
        columns.push(`"${key}"`);
        values.push(this.sqlLiteral(val));
      }
    }

    return { sql: `INSERT INTO "${label}" (${columns.join(', ')}) VALUES (${values.join(', ')})` };
  }

  // -------------------------------------------------------------------------
  // 2. MATCH + CREATE relationship
  // -------------------------------------------------------------------------

  private translateMatchCreate(cypher: string): SqlTranslation {
    const createIdx = this.findKeyword(cypher, 'CREATE');
    if (createIdx === -1) {
      throw new Error(`Cannot find CREATE in: ${cypher.substring(0, 200)}`);
    }
    const createPart = cypher.substring(createIdx);

    const relMatch = createPart.match(/\[(\w+):(\w+)\s*\{/);
    if (!relMatch) {
      throw new Error(`Cannot parse relationship: ${createPart.substring(0, 200)}`);
    }
    const label = relMatch[2];
    const props = this.extractPropsMap(cypher);

    // Ensure from_node_id / to_node_id are set from MATCH node patterns
    if (!props.has('from_node_id') || !props.has('to_node_id')) {
      const allNodeProps = this.extractAllNodeProps(cypher);
      const fromProps = allNodeProps.get('from') ?? new Map();
      const toProps = allNodeProps.get('to') ?? new Map();

      if (!props.has('from_node_id') && fromProps.has('id')) {
        props.set('from_node_id', fromProps.get('id')!);
      }
      if (!props.has('to_node_id') && toProps.has('id')) {
        props.set('to_node_id', toProps.get('id')!);
      }
    }

    const colDefs = this.knownColumns(label);
    const columns: string[] = [];
    const values: string[] = [];

    if (colDefs) {
      for (const col of colDefs) {
        columns.push(`"${col}"`);
        values.push(this.sqlLiteral(props.get(col)));
      }
    } else {
      for (const [key, val] of props) {
        columns.push(`"${key}"`);
        values.push(this.sqlLiteral(val));
      }
    }

    return { sql: `INSERT INTO "${label}" (${columns.join(', ')}) VALUES (${values.join(', ')})` };
  }

  // -------------------------------------------------------------------------
  // 3. MATCH + RETURN
  // -------------------------------------------------------------------------

  private translateMatchReturn(cypher: string): SqlTranslation {
    const table = this.extractMainTable(cypher);
    const columns = this.knownColumns(table);

    const inlineWhere = this.extractInlineFilter(cypher);
    const whereClause = this.extractWhereClause(cypher);

    let where = '';
    if (inlineWhere && whereClause) {
      where = `WHERE ${inlineWhere} AND (${whereClause})`;
    } else if (inlineWhere) {
      where = `WHERE ${inlineWhere}`;
    } else if (whereClause) {
      where = `WHERE ${whereClause}`;
    }

    const returnClause = this.extractReturnClause(cypher);
    const select = this.translateReturn(returnClause, columns);

    const orderBy = this.extractOrderBy(cypher);
    const skipLimit = this.extractSkipLimit(cypher);

    return { sql: `SELECT ${select} FROM "${table}" ${where}${orderBy}${skipLimit}`.trim() };
  }

  // -------------------------------------------------------------------------
  // 4. MATCH + SET
  // -------------------------------------------------------------------------

  private translateMatchSet(cypher: string): SqlTranslation {
    const table = this.extractMainTable(cypher);

    const inlineWhere = this.extractInlineFilter(cypher);
    const whereClause = this.extractWhereClause(cypher);

    let where = '';
    if (inlineWhere && whereClause) {
      where = `WHERE ${inlineWhere} AND (${whereClause})`;
    } else if (inlineWhere) {
      where = `WHERE ${inlineWhere}`;
    } else if (whereClause) {
      where = `WHERE ${whereClause}`;
    }

    const setParts = this.extractSetClause(cypher);
    const setStr = setParts.map((p) => this.translateSetItem(p)).join(', ');

    return { sql: `UPDATE "${table}" SET ${setStr} ${where}`.trim() };
  }

  // -------------------------------------------------------------------------
  // 5. MATCH + DELETE
  // -------------------------------------------------------------------------

  private translateMatchDelete(cypher: string, detachDelete: boolean): SqlTranslation {
    const table = this.extractMainTable(cypher);

    const inlineWhere = this.extractInlineFilter(cypher);
    const whereClause = this.extractWhereClause(cypher);

    let where = '';
    if (inlineWhere && whereClause) {
      where = `WHERE ${inlineWhere} AND (${whereClause})`;
    } else if (inlineWhere) {
      where = `WHERE ${inlineWhere}`;
    } else if (whereClause) {
      where = `WHERE ${whereClause}`;
    }

    return { sql: `DELETE FROM "${table}" ${where}`.trim(), detachDelete };
  }

  // =========================================================================
  // Value handling: Cypher → SQL
  // =========================================================================

  /**
   * Convert a Cypher property value to a SQL literal.
   * String values: strip outer '', unescape \' → ', re-escape for SQL (' → '')
   * Numbers/booleans/null: pass through as-is.
   * undefined: return 'null'.
   */
  private sqlLiteral(val: string | undefined): string {
    if (val === undefined) return 'null';
    const trimmed = val.trim();
    if (trimmed === 'null' || trimmed === 'NULL') return 'null';
    if (trimmed === 'true') return '1';
    if (trimmed === 'false') return '0';

    // Number: digits, optional minus and dot
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;

    // String literal: starts and ends with '
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      const inner = trimmed.slice(1, -1);
      const unescaped = inner.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      const sqlEscaped = unescaped.replace(/'/g, "''");
      return `'${sqlEscaped}'`;
    }

    // Fallback: treat as string value
    const sqlEscaped = trimmed.replace(/'/g, "''");
    return `'${sqlEscaped}'`;
  }

  // =========================================================================
  // Property extraction (string-safe)
  // =========================================================================

  /** Extract properties as a Map from CREATE or MATCH ... CREATE */
  private extractPropsMap(cypher: string): Map<string, string> {
    const createIdx = Math.max(0, cypher.indexOf('CREATE'));
    const sub = cypher.substring(createIdx);

    // String-safe find of the opening { of properties
    const openBrace = this.strSafeIndexOf(sub, '{');
    if (openBrace === -1) return new Map();

    const closeBrace = this.findMatchingBrace(sub, openBrace);
    if (closeBrace === -1) return new Map();

    return this.parsePropsBlock(sub.substring(openBrace + 1, closeBrace));
  }

  /** Find first occurrence of char outside strings */
  private strSafeIndexOf(str: string, char: string): number {
    let inString = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inString) {
        if (ch === '\\') { i++; continue; }
        if (ch === "'") { inString = false; }
        continue;
      }
      if (ch === "'") { inString = true; continue; }
      if (ch === char) return i;
    }
    return -1;
  }

  /** Extract all (varName:Label {props}) node patterns, keyed by variable name */
  private extractAllNodeProps(cypher: string): Map<string, Map<string, string>> {
    const result = new Map<string, Map<string, string>>();
    let pos = 0;

    while (pos < cypher.length) {
      const start = cypher.indexOf('(', pos);
      if (start === -1) break;

      const colonIdx = cypher.indexOf(':', start);
      if (colonIdx === -1) { pos = start + 1; continue; }

      // Extract variable name and label
      const beforeColon = cypher.substring(start + 1, colonIdx).trim();
      const varMatch = beforeColon.match(/^(\w+)$/);
      // Also support (var:Label) without props
      const afterColon = cypher.substring(colonIdx + 1);
      const labelMatch = afterColon.match(/^(\w+)/);
      if (!labelMatch) { pos = start + 1; continue; }

      const varName = varMatch ? varMatch[1] : '';
      const labelEnd = colonIdx + 1 + labelMatch[0].length;

      // Check for {props} after the label (skip whitespace)
      let braceIdx = labelEnd;
      while (braceIdx < cypher.length && cypher[braceIdx] === ' ') braceIdx++;
      if (braceIdx < cypher.length && cypher[braceIdx] === '{') {
        const closeBrace = this.findMatchingDelimiter(cypher, braceIdx, '{', '}');
        if (closeBrace !== -1 && varName) {
          const propsStr = cypher.substring(braceIdx + 1, closeBrace);
          if (!result.has(varName)) {
            result.set(varName, this.parsePropsBlock(propsStr));
          }
          pos = closeBrace + 1;
          continue;
        }
      }

      pos = labelEnd;
    }

    return result;
  }

  /** Parse "key: value, key: value, ..." respecting string boundaries */
  private parsePropsBlock(propsStr: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!propsStr.trim()) return map;

    const entries = this.splitTopLevel(propsStr, ',');
    for (const entry of entries) {
      const colonIdx = entry.indexOf(':');
      if (colonIdx === -1) continue;
      const key = entry.substring(0, colonIdx).trim();
      const value = entry.substring(colonIdx + 1).trim();
      if (key) map.set(key, value);
    }
    return map;
  }

  /** Split by delimiter, respecting string and bracket boundaries */
  private splitTopLevel(str: string, delimiter: string): string[] {
    const parts: string[] = [];
    let start = 0;
    let depth = 0;
    let inString = false;

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (inString) {
        if (ch === '\\') { i++; continue; }
        if (ch === "'") { inString = false; }
        continue;
      }
      if (ch === "'") { inString = true; continue; }
      if (ch === '{' || ch === '[') { depth++; continue; }
      if (ch === '}' || ch === ']') { depth--; continue; }
      if (ch === delimiter && depth === 0) {
        const part = str.substring(start, i).trim();
        if (part.length > 0) parts.push(part);
        start = i + 1;
      }
    }
    const last = str.substring(start).trim();
    if (last.length > 0) parts.push(last);
    return parts;
  }

  private findMatchingBrace(str: string, openBrace: number): number {
    return this.findMatchingDelimiter(str, openBrace, '{', '}');
  }

  // -------------------------------------------------------------------------
  // Label / table extraction
  // -------------------------------------------------------------------------

  private extractLabel(cypher: string): string {
    const m = cypher.match(/:\s*(\w+)/);
    if (!m) throw new Error(`Cannot find label in: ${cypher.substring(0, 100)}`);
    return m[1];
  }

  private extractMainTable(cypher: string): string {
    // Edge pattern: -[var:Label] or -[var:Label {props}] or ()-[var:Label]-()
    // Must check edge pattern BEFORE node pattern, since edge Cypher also contains node patterns
    let m = cypher.match(/-\[\w*:(\w+)[\s\]\{]/);
    if (m) return m[1];

    // Node pattern: (var:Label)
    m = cypher.match(/\(\w*:(\w+)/);
    if (m) return m[1];

    throw new Error(`Cannot determine table from: ${cypher.substring(0, 100)}`);
  }

  private knownColumns(table: string): string[] | null {
    return CypherTranslator.COLUMNS[table] ?? null;
  }

  // -------------------------------------------------------------------------
  // Inline filter (MATCH pattern {props} → WHERE conditions)
  // -------------------------------------------------------------------------

  private extractInlineFilter(cypher: string): string | null {
    const parts: string[] = [];
    let pos = 0;

    while (pos < cypher.length) {
      // Find next pattern start: (var:Label or [var:Label
      const nodeStart = cypher.indexOf('(', pos);
      const edgeStart = cypher.indexOf('[', pos);

      let start = -1;
      let isEdge = false;
      if (nodeStart !== -1 && (edgeStart === -1 || nodeStart < edgeStart)) {
        start = nodeStart;
      } else if (edgeStart !== -1) {
        start = edgeStart;
        isEdge = true;
      } else {
        break;
      }

      if (isEdge) {
        // Edge pattern: [var:Label {props}]
        const colonIdx = cypher.indexOf(':', start);
        if (colonIdx === -1) { pos = start + 1; continue; }

        // Find the closing ] for this edge pattern
        const closeBracket = this.findMatchingDelimiter(cypher, start, '[', ']');
        if (closeBracket === -1) { pos = start + 1; continue; }

        // Look for {props} after the colon, but before the closing ]
        const afterColon = cypher.substring(colonIdx);
        const openBrace = this.strSafeIndexOf(afterColon, '{');
        if (openBrace === -1 || colonIdx + openBrace >= closeBracket) {
          pos = closeBracket + 1;
          continue;
        }
        const absOpen = colonIdx + openBrace;
        const closeBrace = this.findMatchingDelimiter(cypher, absOpen, '{', '}');
        if (closeBrace === -1) { pos = closeBracket + 1; continue; }
        const propsStr = cypher.substring(absOpen + 1, closeBrace);
        const props = this.parsePropsBlock(propsStr);
        for (const [key, value] of props) {
          parts.push(`"${key}" = ${this.sqlLiteral(value)}`);
        }
        pos = closeBracket + 1;
      } else {
        // Node pattern: (var:Label {props})
        const colonIdx = cypher.indexOf(':', start);
        if (colonIdx === -1) { pos = start + 1; continue; }

        const varMatch = cypher.substring(start + 1, colonIdx).trim();
        const varName = varMatch || '';

        // Find the closing ) for this node pattern
        const closeParen = this.findMatchingDelimiter(cypher, start, '(', ')');
        if (closeParen === -1) { pos = start + 1; continue; }

        // Look for {props} after the colon, but before the closing )
        const afterColon = cypher.substring(colonIdx);
        const openBrace = this.strSafeIndexOf(afterColon, '{');
        if (openBrace === -1 || colonIdx + openBrace >= closeParen) {
          pos = closeParen + 1;
          continue;
        }
        const absOpen = colonIdx + openBrace;
        const closeBrace = this.findMatchingDelimiter(cypher, absOpen, '{', '}');
        if (closeBrace === -1) { pos = closeParen + 1; continue; }
        const propsStr = cypher.substring(absOpen + 1, closeBrace);
        const props = this.parsePropsBlock(propsStr);
        for (const [key, value] of props) {
          const column = this.mapVarField(key, varName);
          parts.push(`"${column}" = ${this.sqlLiteral(value)}`);
        }
        pos = closeParen + 1;
      }
    }

    return parts.length > 0 ? parts.join(' AND ') : null;
  }

  // -------------------------------------------------------------------------
  // WHERE clause
  // -------------------------------------------------------------------------

  private extractWhereClause(cypher: string): string | null {
    const whereIdx = this.findKeyword(cypher, 'WHERE');
    if (whereIdx === -1) return null;

    const endIdx = this.findNextKeyword(cypher, whereIdx + 5, [
      'RETURN', 'DELETE', 'SET', 'DETACH', 'ORDER BY', 'SKIP', 'LIMIT',
    ]);
    const raw = cypher.substring(whereIdx + 5, endIdx).trim();
    if (!raw) return null;

    return this.translateWhere(raw);
  }

  private translateWhere(whereStr: string): string {
    let result = whereStr;

    // Convert special field references
    result = result.replace(/\bfrom\.id\b/g, 'from_node_id');
    result = result.replace(/\bto\.id\b/g, 'to_node_id');

    // Strip single-char variable prefixes (n.field → field)
    result = result.replace(/\b([a-z])\.(\w+)\b/gi, (_full, _prefix: string, field: string) => {
      if ((_prefix === 'from' || _prefix === 'to') && field === 'id') {
        return _full; // already handled
      }
      if (field === 'from' || field === 'to') {
        return _full; // don't strip from/from_node_id etc.
      }
      return field;
    });

    // Convert Cypher =~ regex to SQL LIKE
    // =~ '.*pattern.*' → LIKE '%pattern%'
    result = result.replace(/(\w+)\s+=~\s+'(?:\.\*)?(.+?)(?:\.\*)?'/g, (_m, field, pattern) => {
      return `${field} LIKE '%${pattern}%'`;
    });

    // Convert Cypher IN [...]  to SQL IN (...)
    result = this.convertInLists(result);

    return result;
  }

  /** Convert Cypher IN [list] to SQL IN (list) */
  private convertInLists(where: string): string {
    let result = '';
    let i = 0;
    let inString = false;

    while (i < where.length) {
      if (inString) {
        result += where[i];
        if (where[i] === '\\') { result += where[++i] ?? ''; i++; continue; }
        if (where[i] === "'") { inString = false; }
        i++;
        continue;
      }
      if (where[i] === "'") { inString = true; result += where[i]; i++; continue; }

      // IN [ ... ] → IN ( ... )
      if (/^IN\s+\[/i.test(where.substring(i))) {
        const inIdx = where.indexOf('[', i);
        result += where.substring(i, inIdx) + '(';
        i = inIdx + 1;

        const closeBracket = this.findMatchingDelimiter(where, inIdx, '[', ']');
        if (closeBracket === -1) {
          result += where.substring(i);
          break;
        }
        result += where.substring(i, closeBracket);
        result += ')';
        i = closeBracket + 1;
        continue;
      }

      result += where[i];
      i++;
    }

    return result;
  }

  private findMatchingDelimiter(str: string, start: number, open: string, close: string): number {
    let depth = 0;
    let inString = false;
    for (let i = start; i < str.length; i++) {
      const ch = str[i];
      if (inString) {
        if (ch === '\\') { i++; continue; }
        if (ch === "'") { inString = false; }
        continue;
      }
      if (ch === "'") { inString = true; continue; }
      if (ch === open) { depth++; }
      else if (ch === close) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  // -------------------------------------------------------------------------
  // RETURN clause
  // -------------------------------------------------------------------------

  private extractReturnClause(cypher: string): string {
    const retIdx = this.findKeyword(cypher, 'RETURN');
    if (retIdx === -1) return '';

    const endIdx = this.findNextKeyword(cypher, retIdx + 6, [
      'ORDER BY', 'SKIP', 'LIMIT',
    ]);
    return cypher.substring(retIdx + 6, endIdx).trim();
  }

  private translateReturn(returnClause: string, columns: string[] | null): string {
    const trimmed = returnClause.trim();

    // RETURN n or RETURN e → SELECT *
    if (/^\w+$/.test(trimmed)) {
      if (columns) return columns.map((c) => `"${c}"`).join(', ');
      return '*';
    }

    // RETURN count(n) AS cnt
    const countMatch = trimmed.match(/^count\(\w+\)\s+AS\s+(\w+)$/i);
    if (countMatch) return `COUNT(*) AS ${countMatch[1]}`;

    // Multi-part RETURN
    const parts = this.splitTopLevel(trimmed, ',');

    // If any part is a bare variable name (e, n), expand to all columns
    const hasBareVar = parts.some((p) => /^\w+$/.test(p.trim()));
    if (hasBareVar && columns) {
      // e, from.id AS from_node_id, to.id AS to_node_id
      // → all columns plus any mapped aliases
      const selectCols = [...columns];
      const selectedSet = new Set(columns);
      for (const p of parts) {
        const trimmed = p.trim();
        const asMatch = trimmed.match(/^(\w+\.)?(\w+)\s+AS\s+(\w+)$/i);
        if (asMatch) {
          const prefix = asMatch[1] ? asMatch[1].replace('.', '') : '';
          const field = asMatch[2];
          const mappedField = this.mapVarField(field, prefix);
          if (!selectedSet.has(mappedField)) {
            selectCols.push(mappedField);
            selectedSet.add(mappedField);
          }
        }
      }
      return selectCols.map((c) => `"${c}"`).join(', ');
    }

    // No bare variables: translate AS clauses
    return parts.map((p) => this.translateReturnItem(p.trim())).join(', ');
  }

  private translateReturnItem(item: string): string {
    const asMatch = item.match(/^(\w+\.)?(\w+)\s+AS\s+(\w+)$/i);
    if (asMatch) {
      const prefix = asMatch[1] ? asMatch[1].replace('.', '') : '';
      const field = asMatch[2];
      const alias = asMatch[3];
      const column = this.mapVarField(field, prefix);
      return `"${column}" AS "${alias}"`;
    }

    // Just a field reference
    const fieldMatch = item.match(/^(\w+\.)?(\w+)$/);
    if (fieldMatch) {
      const prefix = fieldMatch[1] ? fieldMatch[1].replace('.', '') : '';
      const field = fieldMatch[2];
      const column = this.mapVarField(field, prefix);
      return `"${column}"`;
    }

    return item;
  }

  private mapVarField(field: string, varName: string): string {
    if (field === 'id' && varName === 'from') return 'from_node_id';
    if (field === 'id' && varName === 'to') return 'to_node_id';
    return field;
  }

  // -------------------------------------------------------------------------
  // ORDER BY / SKIP / LIMIT
  // -------------------------------------------------------------------------

  private extractOrderBy(cypher: string): string {
    const idx = this.findKeyword(cypher, 'ORDER BY');
    if (idx === -1) return '';

    const endIdx = this.findNextKeyword(cypher, idx + 8, ['SKIP', 'LIMIT']);
    const raw = cypher.substring(idx + 8, endIdx).trim();
    if (!raw) return '';

    // Strip variable prefixes: n.field → field, e.field → field
    let translated = raw
      .replace(/\bfrom\.id\b/g, 'from_node_id')
      .replace(/\bto\.id\b/g, 'to_node_id')
      .replace(/\b[a-z]\.(\w+)\b/g, '$1');

    return ` ORDER BY ${translated}`;
  }

  private extractSkipLimit(cypher: string): string {
    const skipIdx = this.findKeyword(cypher, 'SKIP');
    const limitIdx = this.findKeyword(cypher, 'LIMIT');
    let result = '';

    if (limitIdx !== -1) {
      const m = cypher.substring(limitIdx).match(/^LIMIT\s+(\d+)/i);
      if (m) result += ` LIMIT ${m[1]}`;
    }
    if (skipIdx !== -1) {
      const m = cypher.substring(skipIdx).match(/^SKIP\s+(\d+)/i);
      if (m) result += ` OFFSET ${m[1]}`;
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // SET clause
  // -------------------------------------------------------------------------

  private extractSetClause(cypher: string): string[] {
    const setIdx = this.findKeyword(cypher, 'SET');
    if (setIdx === -1) return [];

    const endIdx = this.findNextKeyword(cypher, setIdx + 3, [
      'WHERE', 'RETURN', 'ORDER BY', 'SKIP', 'LIMIT',
    ]);
    const raw = cypher.substring(setIdx + 3, endIdx).trim();
    return this.splitTopLevel(raw, ',');
  }

  private translateSetItem(expr: string): string {
    let result = expr.trim();

    // Handle from.id / to.id
    result = result.replace(/\bfrom\.id\b/g, 'from_node_id');
    result = result.replace(/\bto\.id\b/g, 'to_node_id');

    // Strip single-char variable prefixes: n.field → field
    result = result.replace(/\b([a-z])\.(\w+)\b/g, (_full, _prefix: string, field: string) => {
      if (field === 'from' || field === 'to') return _full;
      if ((_prefix === 'from' || _prefix === 'to') && field === 'id') return _full;
      return field;
    });

    return result;
  }

  // -------------------------------------------------------------------------
  // String-safe keyword search
  // -------------------------------------------------------------------------

  private findKeyword(cypher: string, keyword: string): number {
    return this.strSafeSearch(cypher, new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i'));
  }

  private findNextKeyword(cypher: string, startPos: number, keywords: string[]): number {
    let earliest = cypher.length;
    for (const kw of keywords) {
      const idx = this.strSafeSearch(
        cypher.substring(startPos),
        new RegExp(`\\b${this.escapeRegex(kw)}\\b`, 'i'),
      );
      if (idx !== -1 && startPos + idx < earliest) {
        earliest = startPos + idx;
      }
    }
    return earliest;
  }

  /** Regex search that skips matches inside single-quoted strings */
  private strSafeSearch(str: string, regex: RegExp): number {
    // Replace string content with spaces (same length) to avoid false keyword matches
    const stripped = str.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, (m) =>
      "'" + ' '.repeat(m.length - 2) + "'");
    const m = regex.exec(stripped);
    return m ? m.index : -1;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
