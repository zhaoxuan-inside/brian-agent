# ADR-001 运行时锁定 Node 22(ES2022 / ABI127)

> 状态:accepted　日期:2026-09-26(反向登记)

## 背景
prebuilt 离线分发按 `{module}/{platform}-{arch}/node{abi}/` 组织二进制矩阵;运行时版本决定 ABI。

## 决策
Node 22(.nvmrc)为目标运行时;TS target ES2022;原生模块按 ABI127 预编译。

## 备选方案
| 方案 | 未选原因 |
|---|---|
| Node 20 | ABI115 矩阵需另铺,无收益 |

## 后果
- 正面:二进制矩阵单一;isolated-vm 上游缺失平台有 vendored 编译兜底链。
- 负面:升级 Node 必须同步重铺 prebuilt 与 ABI 目录。
