# ADR-003 本地三库:SQLite(WAL) + LanceDB + leangraph

> 状态:accepted　日期:2026-09-26(反向登记)

## 背景
记忆/图谱/向量需在本机持久化,不允许外部服务。

## 决策
- 业务主库 data/brian.db、日志库 brian_log.db、图库 graph.db(均 SQLite WAL,由 RelationDBProvider 统一访问,insertDB/selectDB…);
- 向量 data/vectordb/(LanceDB,VectorDBProvider addVector/soVector);
- 图 leangraph(GraphDBProvider)。
全部外部组件经 Base/components 薄封装(Adapter),业务代码不直接 import 驱动。

## 备选方案
| 方案 | 未选原因 |
|---|---|
| PostgreSQL/MySQL/Qdrant | 需独立服务,破坏单机离线定位 |

## 后果
- 正面:数据 100% 本机;备份=拷文件。
- 负面:单机容量上限;并发写受 SQLite WAL 约束。
