#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const IMPORT_LINE = "import { Metrics } from '../../shared/base/Metrics';\nimport { Report } from '../../shared/base/Report';";
const IMPORT_RE = /from\s+'[^']*shared\/base\/(Metrics|Report)'/;

const SIG_RE =
  /(\w+)\(\s*(\w+)\s*:\s*([A-Za-z0-9_.]+(?:<[^>()]*>)?Input)\s*,\s*(\w+)\s*:\s*([A-Za-z0-9_.]+(?:<[^>()]*>)?Context)\s*,\s*(\w+)\s*:\s*([A-Za-z0-9_.]+(?:<[^>()]*>)?Output)(?=\s*,?\s*\))/g;

const CALL_RE = /((?:this\.|await this\.)?\w+\.\w+)\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(new\s+[\w.]+(?:<[^>()]*>)?\(\)|\w+)\s*(?=[,)])/g;
const CTX_NAME = /^(?:\w*?(?:context|ctx)|_?c)$/i;
const OUT_NAME = /^(?:\w*?output|_?o)$/i;

function hasMetricsInScope(fnBodyParams) {
  return true;
}

import ts from 'typescript';

function swapLiteralContextArgs(src) {
  const sf = ts.createSourceFile('x.ts', src, ts.ScriptTarget.Latest, true);
  const edits = [];
  const CTX_ARG = /^(?:\w+\.)?(?:new\s+[A-Za-z_$][\w$]*Context\s*\(\s*\)|[A-Za-z_$][\w$]*(?:[Cc]tx|ontext)|ctx)$/;
  const visit = (node) => {
    if (ts.isCallOrNewExpression(node) && node.arguments && node.arguments.length >= 3) {
      const a2 = node.arguments[1];
      const a3 = node.arguments[2];
      const t2 = a2.getText(sf).trim();
      if (CTX_ARG.test(t2) && !t2.includes('\n')) {
        edits.push({ start: a2.getStart(sf), end: a2.getEnd(), text: a3.getText(sf) });
        edits.push({ start: a3.getStart(sf), end: a3.getEnd(), text: a2.getText(sf) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  edits.sort((a, b) => b.start - a.start);
  
  let out = src;
  for (const e of edits) {
    if (out.slice(e.start, e.end) === e.text) continue;
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  return out;
}

function transform(src, file) {
  let changed = false;

  
  src = src.replace(SIG_RE, (m, name, inP, inT, ctxP, ctxT, outP, outT) => {
    changed = true;
    return `${name}(${inP}: ${inT}, ${outP}: ${outT}, ${ctxP}: ${ctxT}, metrics?: Metrics, report?: Report`;  });

  
  src = src.replace(CALL_RE, (m, head, a, b, c) => {
    if (!CTX_NAME.test(b)) return m;
    
    changed = true;
    return `${head}(${a}, ${c}, ${b}, metrics, report`;
  });

  
  const scanned = swapLiteralContextArgs(src);
  if (scanned !== src) { src = scanned; changed = true; }

  
  if (changed && !IMPORT_RE.test(src)) {
    const firstImport = src.match(/^import[^\n]*/m);
    if (firstImport) {
      let baseDir = path.dirname(file);
      let baseRoot;
      for (let d = baseDir, i = 0; i < 30; d = path.dirname(d), i++) {
        if (d === '.' || d === path.parse(d).root) break;
        if (fs.existsSync(path.join(d, 'shared', 'base'))) { baseRoot = d; break; }
      }
      const idx = firstImport.index;
      if (baseRoot) {
        const relPath = path.relative(path.dirname(file), path.join(baseRoot, 'shared', 'base')).replaceAll('\\', '/');
        src = src.slice(0, idx) +
          `import { Metrics } from '${relPath}/Metrics';\nimport { Report } from '${relPath}/Report';\n` +
          src.slice(idx);
      } else {
        src = src.slice(0, idx) +
          "import { Metrics, Report } from '@brian-agent/base';\n" +
          src.slice(idx);
      }
    }
  }
  return { src, changed };
}

function walk(p, files = []) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    if (/node_modules|dist/.test(p)) return files;
    for (const f of fs.readdirSync(p)) walk(path.join(p, f), files);
  } else if (/\.ts$/.test(p)) files.push(p);
  return files;
}

let total = 0;
for (const target of process.argv.slice(2)) {
  for (const file of walk(target)) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(process.cwd(), file);
    const { src: out, changed } = transform(src, rel);
    if (changed) {
      fs.writeFileSync(file, out);
      total++;
      console.log('modified:', rel);
    }
  }
}
console.log(`\n${total} files modified`);
