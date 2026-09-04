# Session · 会话与消息/Part 模型

> 父文档：`docs/_3_BackendDesign/_07_Runtime/Runtime-PRD.md` §4/§11。

## 1. 设计目标

1. **消息中心**：会话、消息、Part 三级模型是循环唯一的状态载体；循环控制状态（终止判定、待执行工具）从 Part 派生（OpenCode 模式）。
2. **Part 结构化**：思考过程（reasoning）、回复（text）、工具调用（tool）、排队注入（steering）、子任务（subtask）全部为消息内 Part；每个 toolCall Part 必有配对 result（append-only 结构不变量）。
3. **每会话忙锁**：`RunStateService.ensureRunState` 保证每会话同时只有一个活动 run；获取失败即入队（lane 语义见 `Runs/Runs-PRD.md`）。
4. **5 参签名 + ≤40 行**：公开方法一律 `Boolean method(XxxInput, XxxOutput, XxxContext, XxxMetrics, XxxReport)`；逻辑控制（`handleXxx`）与数据处理（`prepareXxx/soXxx`）拆分。

## 2. 表设计（3 表）

```sql
CREATE TABLE runtime_session (
  id TEXT PRIMARY KEY, created TEXT, updated TEXT,
  session_key TEXT UNIQUE,           -- 外部会话标识
  title TEXT, agent_def_id TEXT,     -- 引用 runtime_agent_def.id
  status TEXT,                       -- active | archived
  last_seq INTEGER                   -- 事件流游标
);

CREATE TABLE runtime_message (
  id TEXT PRIMARY KEY, created TEXT, updated TEXT,
  session_id TEXT,                   -- 引用 runtime_session.id
  run_id TEXT,                       -- 引用 runtime_run.id（user 消息为空）
  role TEXT,                         -- user | assistant
  seq INTEGER,                       -- 会话内消息序号（严格递增）
  token_usage INTEGER
);

CREATE TABLE runtime_message_part (
  id TEXT PRIMARY KEY, created TEXT, updated TEXT,
  message_id TEXT,                   -- 引用 runtime_message.id
  run_id TEXT,
  part_type TEXT,                    -- reasoning | text | tool | steering | subtask
  part_order INTEGER,
  content TEXT,
  tool_id TEXT,                      -- part_type=tool 时的工具标识（工具名）
  input_json TEXT, output_json TEXT, -- tool Part 约定：input_json={tool_call_id, arguments}（阶段2 落地）；仅存食材，成品经事件流
  status TEXT,                       -- pending | running | completed | error | aborted
  block_type TEXT, block_meta TEXT,  -- 块流式输出（heading/code_block/…）
  token_count INTEGER, elapsed_ms INTEGER
);

CREATE TABLE runtime_session_config ( -- 配置表（config_key 主键，与其他 Provider config 表形状一致）
  config_key TEXT PRIMARY KEY, config_value TEXT, value_type TEXT, description TEXT, updated INTEGER
);
```

## 3. 领域类型（均继承 `Base/shared/base/`）

```typescript
export class AddSessionInput extends Input { session_key!: string; title?: string; }
export class AddSessionOutput extends Output { session_id!: string; }
export class AddMessageInput extends Input { session_id!: string; run_id?: string; role!: 'user'|'assistant'; content!: string; }
export class AddMessageOutput extends Output { message_id!: string; seq!: number; }
export class AddPartInput extends Input { message_id!: string; run_id?: string; part_type!: PartType; content?: string; tool_id?: string; input_json?: string; block_type?: string; block_meta?: string; }
export class AddPartOutput extends Output { part_id!: string; part_order!: number; }
export class UpdatePartInput extends Input { part_id!: string; status?: PartStatus; content_patch?: string; output_json?: string; token_count?: number; }
export class UpdatePartOutput extends Output {}
export class SoMessagesInput extends Input { session_id!: string; limit?: number; before_seq?: number; }
export class SoMessagesOutput extends Output { messages!: MessageWithParts[]; }
export class EnsureRunStateInput extends Input { session_key!: string; run_id!: string; }
export class SoRunStateOutput extends Output { acquired!: boolean; active_run_id?: string; }
export class ReleaseRunStateInput extends Input { session_key!: string; run_id!: string; }
export class ConfigSessionInput extends Input { max_context_items?: number; }
```

## 4. 公开方法（5 参签名）

| 方法 | 签名要点 | 拆分（≤40 行） |
|------|---------|---------------|
| `addSession` | 建会话（幂等：session_key 已存在返回既有 id） | `handleAddSession` + `prepareSessionRecord` |
| `addMessage` | 建消息（seq = last_seq+1） | `handleAddMessage` + `prepareMessageRecord` |
| `addPart` | 建 Part | `handleAddPart` + `preparePartRecord` |
| `updatePart` | 更新 Part 状态/内容（status 机：pending→running→completed/error/aborted；`content_patch` 为 delta 追加语义） | `handleUpdatePart` + `preparePartPatch` |
| `appendPartContent` | 追加 Part 内容（updatePart 的 delta 委托入口；阶段1 落地补充） | 委托 `updatePart` |
| `soMessages` | 查询消息（含 Parts，seq 倒序分页） | `handleSoMessages` + `soMessageRows` + `soPartRows` |
| `ensureRunState` | 会话忙锁获取（忙则 `acquired=false` 返回活动 run） | `handleEnsureRunState` + `soActiveRun` |
| `releaseRunState` | 忙锁释放（幂等） | `handleReleaseRunState` |
| `configSession` | 模块配置 | `handleConfigSession` |

## 5. 内部流程要点

1. **Part 状态机**：`tool` Part 经 `pending→running→completed/error/aborted`；`aborted` 必带类型化 abort 原因（写入 `output_json`），规范化失败消息保证下游重放不错读（OpenClaw turn-interruption 模式）。
2. **配对不变量**：`tool` Part 的 `status∈{completed,error,aborted}` 才视为配对完成；未配对 Part 在会话恢复时自动标记 `aborted('superseded')`。
3. **模型消息派生**：`prepareModelMessages`（Loop 模块调用）从 `soMessages` 结果派生 LLM 请求消息：user 消息 + assistant 的 text/reasoning（对 provider 支持 reasoning 时）+ tool Part 的 `input_json/output_json`（严格角色交替，tool 结果仅可连排在 assistant tool_calls 之后）。
4. **忙锁实现**：实例内 `Map<session_key, run_id>`（2026-09-04 修复⑥：由模块级改为**实例字段**，与 EventBus 一致，同进程多实例互不干扰）+ SQLite `runtime_run.status` 双重校验（阶段4 接入）；无外部依赖。seq 缓存同为实例字段（DB last_seq 为持久事实源）。

## 6. 与旧模型的关系

| 旧 | 新 |
|----|----|
| `orchestration_work` 状态字段（CREATE→PLANNING→…） | `runtime_run.status` + `runtime_event` 事件流（无中心状态机，状态由事件投影） |
| `agent_execution_trace.iterations_json` | `runtime_message_part`（reasoning/tool Part） |
| `InfoCore.lastNInfo` 轻量 trace ref | 不再需要（Part 直查） |
| PromptRebuilder 按需重渲染 | Part 直存食材（`input_json/output_json`） |

## 7. 验收

- 单测：幂等 addSession；seq 严格递增；Part 配对不变量；忙锁并发获取互斥。
- 集成：会话恢复（未配对 tool Part 自动 aborted）；soMessages 派生模型消息角色交替合法。
