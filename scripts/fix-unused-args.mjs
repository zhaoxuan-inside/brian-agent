#!/usr/bin/env node

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const RENAMEABLE = new Set(['metrics', 'report', 'output', 'context', 'input', 'logger', 'body']);

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
  const visit = (node) => {
    if (
      (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isConstructorDeclaration(node)) &&
      node.parameters?.length &&
      node.body
    ) {
      
      const bodyText = node.body.getText(sf);
      for (const param of node.parameters) {
        if (!ts.isIdentifier(param.name)) continue;
        const pname = param.name.text;
        if (!RENAMEABLE.has(pname)) continue;
        
        if (param.modifiers?.length) continue;
        if (param.questionToken || param.type) {
          
          const re = new RegExp(`\\b${pname}\\b`);
          if (re.test(bodyText)) continue;
        } else continue;
        const start = param.getStart(sf);
        edits.push({ start, end: param.name.getEnd(), text: `_${pname}` });
        
        const jsdocs = ts.getJSDocCommentsAndTags(node);
        for (const d of jsdocs) {
          if (ts.isJSDoc(d) && d.comment) {
            const dText = d.getText(sf);
            if (dText.includes(`@param ${pname}`)) {
              const dStart = d.getStart(sf);
              const replaced = dText.replaceAll(`@param ${pname}`, `@param _${pname}`);
              edits.push({ start: dStart, end: d.getEnd(), text: replaced });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) return false;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  fs.writeFileSync(file, out);
  return true;
}

let n = 0;
for (const target of process.argv.slice(2)) {
  for (const file of walk(target)) {
    if (fixFile(file)) {
      n++;
      console.log('fixed:', path.relative(process.cwd(), file));
    }
  }
}
console.log(`${n} files updated`);
