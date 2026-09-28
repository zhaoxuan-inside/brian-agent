#!/usr/bin/env node

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

function walk(p, files = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    if (/node_modules|dist|test|prebuilt|\/data\/|logs/.test(p)) return files;
    for (const f of fs.readdirSync(p)) walk(path.join(p, f), files);
  } else if (/\.ts$/.test(p)) files.push(p);
  return files;
}

function fixFile(file) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const clause = stmt.importClause;
    const specs = [];
    if (clause.name) specs.push({ node: clause.name, name: clause.name.text });
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) {
        specs.push({ node: el.name, name: el.name.text });
      }
    }
    if (!specs.length) continue;
    
    const restStart = stmt.getStart(sf);
    const rest = src.slice(0, restStart) + src.slice(stmt.getEnd());
    const unused = specs.filter((s) => {
      const re = new RegExp(`\\b${s.name}\\b`);
      return !re.test(rest);
    });
    if (!unused.length) continue;
    const kept = specs.filter((s) => !unused.includes(s));
    if (!kept.length) {
      
      let end = stmt.getEnd();
      while (end < src.length && (src[end] === '\n' || src[end] === ' ' || src[end] === '\r')) end++;
      edits.push({ start: stmt.getStart(sf), end, text: '' });
    } else {
      
      const nb = clause.namedBindings;
      if (ts.isNamedImports(nb)) {
        const keepEls = nb.elements.filter((el) => !unused.some((u) => u.node === el.name));
        const text = keepEls.map((el) => el.getText(sf)).join(', ');
        edits.push({ start: nb.getStart(sf), end: nb.getEnd(), text: `{ ${text} }` });
        if (clause.name) {
          
          if (unused.some((u) => u.node === clause.name)) {
            const comma = src.indexOf(',', clause.name.getEnd());
            if (comma > -1 && comma < nb.getStart(sf)) {
              edits.push({ start: clause.name.getStart(sf), end: comma + 1, text: '' });
            }
          }
        }
      }
    }
  }
  if (!edits.length) return false;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  fs.writeFileSync(file, out);
  return true;
}

let n = 0;
for (const target of process.argv.slice(2)) {
  for (const file of walk(target)) if (fixFile(file)) n++;
}
console.log(`${n} files cleaned`);
