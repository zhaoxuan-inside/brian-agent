#!/usr/bin/env node
// 聚合测试运行器：逐个工作区执行 vitest，任一失败不中断后续工作区，
// 最后汇总并按聚合结果退出（替代 "&&" 链——链式调用会在首个失败处短路，掩盖后续工作区的结果）。
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
