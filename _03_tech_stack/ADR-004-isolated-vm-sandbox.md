# ADR-004 isolated-vm 技能沙箱

> 状态:accepted　日期:2026-09-26(反向登记)

## 背景
用户技能代码需在服务进程内安全执行,拒绝 Node vm 的弱隔离。

## 决策
Base/SkillProvider/infrastructure/sandbox/IsolatedVMSandbox 以 isolated-vm(V8 隔离堆)执行技能;宿主仅暴露受控原语;异常 fail-fast(d8fd300)。

## 备选方案
| 方案 | 未选原因 |
|---|---|
| node:vm | 同进程共享堆,隔离不足 |
| worker_threads | 共享宿主权限面,隔离语义弱 |

## 后果
- 正面:真隔离;用户技能可安全上架市场。
- 负面:darwin-x64 无上游 ABI127 预编译,需 vendored 源码编译兜底;CPU 密集受限。
