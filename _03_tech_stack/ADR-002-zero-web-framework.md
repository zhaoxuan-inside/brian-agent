# ADR-002 零 Web 框架(node:http 手写路由)

> 状态:accepted　日期:2026-09-26(反向登记;本次重构拆分其实现)

## 背景
项目定位"本地个人 Agent,离线分发",要求依赖面最小。

## 决策
HTTP 用 node:http,WebSocket 用 ws;路由在 dev-server.ts createServer() 手写分发(~125 条 /api/* 路由)。**本次重构(R3)将该巨型函数拆分为路由域模块,行为不变。**

## 备选方案
| 方案 | 未选原因 |
|---|---|
| Express/Koa/Fastify | 增加运行时依赖,违背零依赖定位 |

## 后果
- 正面:依赖面=ws+adm-zip;离线包最小。
- 负面:路由/中间件手写,dev-server.ts 曾膨胀至 5769 行(本次治理)。
