# Block-Native SSE 流式推送架构方案

## 1. 方案选择

**采纳方案 A：后端 WriterAgent 作为 Block 生产者，LLM 决定 Block 类型。**

核心思路：WriterAgent 调用 LLM 时，在 prompt 中指示 LLM 直接输出 JSON 格式的 Block 数组。WriterAgent 解析 JSON 得到结构化 Block 列表，ChatService 通过 SSE 逐个发射 Block 事件。

**优势**：
- Block 类型由 LLM 根据内容语义自行判断，灵活且准确
- 后端各层无需感知 UI Block 概念，仅 WriterAgent 负责
- 前端零解析成本，直接消费结构化 Block 数据

## 2. 架构分层

```
┌─────────────────────────────────────────────┐
│  前端 Block-Native 渲染引擎                  │
│  消费 SSE 事件中的 block_id/block_type       │
├─────────────────────────────────────────────┤
│  ChatService 发射 Block 事件                 │
│  遍历 blocks[] 逐个发射 SSE event             │
├─────────────────────────────────────────────┤
│  AgentOrchestrationService                  │
│  synthesizeResults() 用 Block-native prompt  │
│  调用 LLM → 解析 JSON → 返回 Block[]         │
├─────────────────────────────────────────────┤
│  LLM 决定 Block 类型                        │
│  Prompt 中定义 6 种 Block 类型和 JSON 格式    │
└─────────────────────────────────────────────┘
```

## 3. 实现文件

| 文件 | 改动 | 说明 |
|------|------|------|
| `brian-backend/Agent/WriterAgent/domain/types.ts` | 新增 `Block`, `BlockMeta` 类型；`WriteOutput` 增加 `blocks` 字段 | PRD WriterAgent 类型定义 |
| `brian-backend/Agent/WriterAgent/application/WriterAgentService.ts` | `write()` prompt 改为 Block-native JSON 格式；新增 `parseBlocks()` | PRD WriterAgent 核心 |
| `brian-backend/Agent/WriterAgent/index.ts` | 导出 `Block`, `BlockMeta` 类型 | 对外暴露 |
| `backend/src/agent/writer/WriterAgent.ts` | 系统提示改为 Block-native 格式；`WriteResultOutput` 增加 `blocks`；新增 `parseBlocks()` | Legacy WriterAgent |
| `backend/src/application/AgentOrchestrationService.ts` | `OrchestrationResult` 增加 `blocks`；`synthesizeResults` 改为 Block-native prompt；新增 `parseBlocks()` | 编排层核心 |
| `backend/src/application/ChatService.ts` | `streamMessage()` phase 4 改为发射 Block 事件，携带 `block_id`/`block_type`/`block_action`/`block_meta` | SSE 发射 |

## 4. Block 类型定义

```typescript
interface Block {
  id: string;       // 后端生成 UUID
  type: 'text_paragraph' | 'heading' | 'code_block' | 'list_item' | 'artifact_preview' | 'error_fallback';
  content: string;
  meta?: {
    level?: number;       // heading 层级 (1-6)
    language?: string;    // code_block 语言
    streaming_status?: 'streaming' | 'completed';
  };
}
```

## 5. LLM Prompt 设计

WriterAgent 的系统提示指示 LLM 输出结构化 JSON：

```
你是信息汇总专家。输出格式：JSON 数组，每个元素是内容块。可用类型：
- "text_paragraph": 普通文本 {"type":"text_paragraph","content":"..."}
- "heading": 标题 {"type":"heading","content":"标题","meta":{"level":2}}
- "code_block": 代码 {"type":"code_block","content":"...","meta":{"language":"python"}}
- "list_item": 列表项 {"type":"list_item","content":"..."}
- "error_fallback": 错误 {"type":"error_fallback","content":"..."}
只返回 JSON 数组，不要其他文字。
```

## 6. SSE 数据流

```
event: loading
data: {"type":"loading"}

event: agent_thinking
data: {"type":"agent_thinking","agentId":"...","taskId":"...","output":"..."}

event: agent_created
data: {"type":"agent_created","agent":{"id":"...","type":"..."}}

event: agent_status
data: {"type":"agent_status","agentId":"...","status":"running"}

event: text  ← 每个 Block 一个 event
data: {"type":"text","text":"block content","block_id":"block-xxx","block_type":"heading","block_action":"insert","block_meta":{"level":2}}

event: agent_output
data: {"type":"agent_output","agentId":"...","output":"block content","block_id":"block-xxx","block_type":"heading"}

event: done
data: {"type":"done","fullText":"...","agentChain":[...],"blocks":[...],"agentStatus":{...}}
```

## 7. 容错设计

若 LLM 返回的不是有效 JSON 数组，`parseBlocks()` 降级为单 `text_paragraph` Block，内容为 LLM 原始输出。确保前端始终能渲染。

## 8. 设计原则

1. **LLM 决定 Block 类型**：仅 WriterAgent 调用 LLM 时指定 Block 格式，其他 Agent 无需改动
2. **后端容错**：JSON 解析失败时降级为 `text_paragraph` 包裹原始内容
3. **前端零解析**：SSE 事件直接携带 `block_id`/`block_type`，前端直接渲染
4. **向后兼容**：`blocks` 字段缺失时前端退化为传统文本渲染
