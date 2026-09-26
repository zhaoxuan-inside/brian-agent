# ADR-006 Tool 领域概念移除,Skill 一等工具承接

> 状态:accepted　日期:2026-09-26(反向登记;commit 4185ce8 / bcd2479)

## 背景
Tool 与 Skill 双概念并存导致执行面分裂(Tool ⊕ Skill 合并需求)。

## 决策
- Skill 为唯一执行面:内置 5 系统技能(builtin-exec/browser/plan/delegate/ask-user)+ 用户技能(沙箱)+ MCP 包装为 mcp_exec 技能;
- Agent snapshot 中 tools[] 元素 kind: 'skill' | 'mcp';
- Base/ToolProvider 收窄为"内置纯函数工具原语单一事实源"(JSON/XML/Cron/Regex/ID/HTTP),经 /api/tool/* 暴露,由 Skill 体系调用。

## 备选方案
| 方案 | 未选原因 |
|---|---|
| 保留双概念 | 匹配、权限、观测三条链路重复实现 |

## 后果
- 正面:工具面单一;匹配四层瀑布复用。
- 负面:历史数据/文档中"Tool"一词残留,以 _09 词典 aliases 标注禁用。
