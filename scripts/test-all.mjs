#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const WORKSPACES = ['base', 'core', 'runtime', 'agent', 'application'];
const results = [];

for (const ws of WORKSPACES) {
  process.stdout.write(`\n=== test: @brian-agent/${ws} ===\n`);
  const res = spawnSync('npm', ['run', 'test', '--workspace', `@brian-agent/${ws}`], {
    stdio: 'inherit',
  });
  results.push({ ws, code: res.status ?? -1 });
}

const failed = results.filter((r) => r.code !== 0);
console.log(`\n=== 测试汇总：${results.length - failed.length}/${results.length} 个工作区通过 ===`);
for (const r of results) {
  console.log(`  ${r.code === 0 ? 'PASS' : 'FAIL'}  @brian-agent/${r.ws}`);
}
process.exit(failed.length > 0 ? 1 : 0);
