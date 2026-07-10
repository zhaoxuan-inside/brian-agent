# Brian-Agent 技术架构文档

> 实现设计哲学的技术蓝图 · Vue3 + Python 版本

---

## 一、系统架构总览

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Electron 桌面应用                                │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    主进程 (Main Process)                        │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │              Python Sidecar 进程 (FastAPI)               │  │   │
│  │  │                                                          │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │  │   │
│  │  │  │ Brian   │ │ Friend   │ │ Orchestr │ │ Memory      │  │  │   │
│  │  │  │ Agent   │ │ Agent    │ │ ator     │ │ System      │  │  │   │
│  │  │  └────┬────┘ └────┬────┘ └────┬──────┘ └──────┬──────┘  │  │   │
│  │  │       │           │           │               │         │  │   │
│  │  │       └───────────┼───────────┴───────────────┘         │  │   │
│  │  │                   ▼                                     │  │   │
│  │  │  ┌──────────────────────────────────────────────────┐   │  │   │
│  │  │  │              LLM Integration                      │   │  │   │
│  │  │  │  AuthGate │ LLMClient │ LangChain │ 多Provider  │   │  │   │
│  │  │  └──────────────────────────────────────────────────┘   │  │   │
│  │  │                   ▼                                     │  │   │
│  │  │  ┌──────────────────────────────────────────────────┐   │  │   │
│  │  │  │              Storage Layer                        │   │  │   │
│  │  │  │  SQLite │ KùzuDB │ LanceDB │ Python RuleEngine  │   │  │   │
│  │  │  └──────────────────────────────────────────────────┘   │  │   │
│  │  │                   ▼                                     │  │   │
│  │  │  ┌──────────────────────────────────────────────────┐   │  │   │
│  │  │  │              Host Control Module                  │   │  │   │
│  │  │  │  ShellExecutor │ CommandClassifier │ Rollback    │   │  │   │
│  │  │  └──────────────────────────────────────────────────┘   │  │   │
│  │  └──────────────────────────────────────────────────────────┘  │   │
│  │                                                          │      │   │
│  │                        WebSocket / HTTP                    │      │   │
│  └────────────────────────────────┬───────────────────────────┘      │   │
│                                   │                                 │   │
│                                   ▼                                 │   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    渲染进程 (Renderer Process)                  │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │                    Vue3 SPA 应用                          │  │   │
│  │  │                                                          │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │  │   │
│  │  │  │ Chat     │ │ Agent    │ │ Function │ │ Feedback    │  │  │   │
│  │  │  │ Interface│ │ Chain    │ │ Panel    │ │ System      │  │  │   │
│  │  │  │          │ │ View     │ │          │ │             │  │  │   │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │  │   │
│  │  └──────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计原则

| 原则 | 技术实现 |
|------|----------|
| **模块化架构** | 分层设计，模块间通过接口通信 |
| **内存共享** | 统一的Memory系统，Brian和Friend Agent共享访问 |
| **被动学习** | Friend Agent监听对话，提取用户偏好 |
| **主动学习** | 闲时随机学习模块，对历史对话进行回顾学习 |
| **记忆整理** | 神经元连接模型，自动建立/强化/断开记忆连接 |
| **隐私保护** | 本地存储优先，LLM调用需授权 |
| **实时可视化** | WebSocket推送Agent工作状态和输出流 |
| **自纠错** | Feedback模块收集评价，驱动策略调整 |
| **主机控制** | 三级授权机制，安全执行Shell命令 |
| **数据迁移** | 支持从OpenClaw/Hermes/OpenHuman导入数据 |

---

## 二、技术栈选型

### 2.1 前端技术栈（Vue3）

| 分类 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| 框架 | Vue | 3.4+ | 组合式API，响应式系统，性能优异 |
| 语言 | TypeScript | 5+ | 类型安全，智能提示，减少bug |
| 构建工具 | Vite | 6+ | 极速开发体验，原生ES模块支持 |
| 状态管理 | Pinia | 2.1+ | Vue官方状态管理，类型安全，轻量级 |
| 路由 | Vue Router | 4.3+ | 官方路由，支持嵌套路由和导航守卫 |
| 样式 | Tailwind CSS | 3+ | 原子化CSS，快速构建Apple风格UI |
| 图标 | Lucide Vue Next | 0.450+ | 统一线性风格，轻量级，可定制 |
| 实时通信 | WebSocket | - | 双向通信，实时推送Agent状态 |
| 代码高亮 | Prism.js | 1.29+ | 代码块语法高亮，支持多语言 |

### 2.2 后端技术栈（Python 3.12+）

| 分类 | 技术 | 版本 | 选型理由 |
|------|------|------|----------|
| 运行时 | Python | 3.12+ | 丰富的AI/ML库生态，成熟稳定 |
| Web框架 | FastAPI | 0.110+ | 高性能，异步支持，自动API文档 |
| WebSocket | WebSocket ASGI | - | 原生WebSocket支持，性能优异 |
| ORM | SQLAlchemy | 2.0+ | 成熟的ORM，支持多种数据库 |
| 图数据库 | KùzuDB | 0.14+ | 嵌入式C++图数据库，高性能，Python绑定 |
| 向量数据库 | LanceDB | 0.5+ | 嵌入式向量数据库，高性能，本地运行 |
| 时序数据库 | SQLite + Timescale | - | 轻量级，零配置，支持时序数据 |
| 规则引擎 | python-rule-engine | 4.1+ | 纯Python规则引擎，轻量级，易于集成 |
| LLM SDK | LangChain | 0.2+ | LLM抽象层，支持多Provider，工具调用 |
| 异步任务 | Celery | 5.3+ | 分布式任务队列，支持定时任务 |

### 2.3 Python vs Node.js对比分析

| 维度 | Python | Node.js | 结论 |
|------|--------|---------|------|
| **AI/ML生态** | 丰富（PyTorch, TensorFlow, LangChain） | 有限 | Python优势 |
| **图数据库** | KùzuDB原生支持 | 选择较少 | Python优势 |
| **向量数据库** | LanceDB, Milvus | LanceDB | 持平 |
| **WebSocket性能** | ASGI (Uvicorn) | Socket.IO | 持平 |
| **异步IO** | asyncio | Node.js原生 | 持平 |
| **进程管理** | 成熟稳定 | 稍逊 | Python优势 |
| **学习曲线** | 社区庞大，资源丰富 | 前端开发者熟悉 | Python更适合AI项目 |

**结论**：Python 3.12+ 完全可以替换Node.js，且在AI/ML领域有显著优势，没有性能和功能实现方面的问题。

### 2.4 嵌入式数据库组合方案

| 数据库类型 | 技术选型 | 内嵌性 | 低性能主机可行性 |
|-----------|----------|--------|-----------------|
| **GraphDB** | KùzuDB | ✅ 完全内嵌 | ✅ 内存占用<200MB，支持低配置 |
| **TimeDB** | SQLite + Timescale扩展 | ✅ 完全内嵌 | ✅ 内存占用<50MB |
| **VectorDB** | LanceDB | ✅ 完全内嵌 | ✅ 内存占用<100MB |
| **RuleEngine** | python-rule-engine | ✅ 纯Python | ✅ 内存占用<10MB |
| **关系型** | SQLite | ✅ 完全内嵌 | ✅ 内存占用<30MB |

**预估资源占用**（低性能主机，4GB RAM）：
- 总内存占用：<500MB
- CPU占用：<20%（空闲）
- 存储占用：<1GB（初始）

---

## 三、模块架构设计

### 3.1 模块划分

```
src/
├── backend/                    # Python后端服务
│   ├── main.py                 # 主入口（FastAPI）
│   ├── api/                    # REST API路由
│   │   ├── auth.py             # 认证接口
│   │   ├── memory.py           # 记忆管理接口
│   │   ├── config.py           # 配置接口
│   │   ├── history.py          # 历史会话接口
│   │   └── host_control.py     # 主机控制接口
│   ├── websocket/              # WebSocket服务
│   │   ├── connection.py       # 连接管理
│   │   └── handlers.py         # 消息处理器
│   ├── agent/                  # Agent核心逻辑
│   │   ├── brian_agent.py      # 主Agent
│   │   ├── friend_agent.py     # Friend Agent
│   │   ├── work_agent.py       # 工作Agent
│   │   ├── orchestrator.py     # Agent编排器
│   │   └── skills.py           # 技能系统
│   ├── memory/                 # 记忆系统
│   │   ├── sensory_memory.py   # 感觉记忆
│   │   ├── working_memory.py   # 工作记忆
│   │   ├── long_term_memory.py # 长期记忆
│   │   ├── consolidation.py    # 记忆巩固引擎
│   │   └── memory_organizer.py # 记忆整理引擎
│   ├── learning/               # 学习模块
│   │   ├── passive_learning.py # 被动学习
│   │   └── active_learning.py  # 主动学习（闲时随机学习）
│   ├── strategy/               # 策略引擎
│   │   ├── strategy_engine.py  # 策略管理器
│   │   └── strategies/         # 四种策略实现
│   ├── feedback/               # 反馈系统
│   │   ├── feedback_module.py  # 反馈收集
│   │   └── self_correction.py  # 自纠错逻辑
│   ├── llm/                    # LLM集成
│   │   ├── llm_client.py       # LLM客户端
│   │   └── auth_gate.py        # 授权网关
│   ├── storage/                # 数据存储
│   │   ├── relational_db.py    # SQLite关系型存储
│   │   ├── graph_db.py         # KùzuDB图存储
│   │   ├── vector_db.py        # LanceDB向量存储
│   │   ├── time_db.py          # 时序数据存储
│   │   └── rule_engine.py      # 规则引擎
│   ├── host_control/           # 主机控制
│   │   ├── shell_executor.py   # Shell命令执行器
│   │   ├── command_classifier.py # 命令分类器
│   │   ├── authorization.py    # 授权管理
│   │   └── rollback.py         # 回滚机制
│   └── migration/              # 数据迁移
│       ├── openclaw_migrator.py # OpenClaw迁移
│       ├── hermes_migrator.py  # Hermes迁移
│       └── openhuman_migrator.py # OpenHuman迁移
│
├── frontend/                   # Vue3前端应用
│   ├── src/
│   │   ├── App.vue             # 根组件
│   │   ├── main.ts             # 入口文件
│   │   ├── stores/             # Pinia状态管理
│   │   │   ├── theme.ts        # 明暗模式
│   │   │   ├── session.ts      # 会话状态
│   │   │   └── panel.ts        # 面板状态
│   │   ├── components/         # UI组件
│   │   │   ├── NeuralBackground.vue   # 神经网络背景
│   │   │   ├── Header.vue             # 右上角功能区
│   │   │   ├── FunctionPanel.vue      # 滑出面板
│   │   │   ├── ChatArea.vue           # 对话区域
│   │   │   ├── MessageBubble.vue      # 消息气泡
│   │   │   ├── RatingButtons.vue      # 评价按钮
│   │   │   ├── InputBox.vue           # 输入框
│   │   │   ├── AgentChainView.vue     # Agent链路可视化
│   │   │   ├── AgentNode.vue          # Agent节点
│   │   │   ├── AgentOutput.vue        # Agent输出流
│   │   │   ├── ContextMenu.vue        # 右键菜单
│   │   │   └── ReportModal.vue        # 上报弹窗
│   │   ├── composables/         # 自定义Composables
│   │   │   ├── useWebSocket.ts        # WebSocket连接
│   │   │   └── useKeyboard.ts         # 键盘事件
│   │   ├── types/               # TypeScript类型定义
│   │   │   └── index.ts               # 全局类型
│   │   └── styles/              # 全局样式
│   │       ├── globals.css            # 全局CSS
│   │       └── animations.css         # 动画样式
│   ├── index.html               # HTML模板
│   └── package.json             # 前端依赖
│
└── shared/                     # 前后端共享
    └── types/                  # 共享类型定义
        ├── agent.py             # Agent相关类型
        ├── memory.py            # 记忆相关类型
        ├── message.py           # 消息类型
        └── websocket.py         # WebSocket消息类型
```

### 3.2 核心模块详细设计

#### 3.2.1 Agent编排引擎 (Orchestrator)

```python
class Orchestrator:
    def __init__(self, memory_system: MemorySystem):
        self.memory_system = memory_system
        self.agents: Dict[str, WorkAgent] = {}
    
    def create_task(self, request: TaskRequest) -> Task:
        pass
    
    def spawn_work_agent(self, parent_id: str, task: Task) -> WorkAgent:
        pass
    
    def track_agent_status(self, agent_id: str) -> Observable[AgentStatus]:
        pass
    
    def aggregate_output(self, agent_id: str) -> Observable[str]:
        pass
    
    def complete_task(self, task_id: str) -> None:
        pass
    
    def cancel_task(self, task_id: str) -> None:
        pass
```

#### 3.2.2 记忆系统 (Memory System)

**四层架构实现**：

```python
class SensoryMemory:
    def __init__(self):
        self.buffer: Dict[str, SensoryItem] = {}
        self.max_duration: int = 3000  # 3秒
    
    def add(self, item: RawInput) -> None:
        pass
    
    def filter_by_attention(self) -> List[WorkingMemoryItem]:
        pass
    
    def clear_expired(self) -> None:
        pass


class WorkingMemory:
    def __init__(self):
        self.items: List[WorkingMemoryItem] = []
        self.max_capacity: int = 7  # 7±2法则
    
    def add(self, item: WorkingMemoryItem) -> None:
        pass
    
    def retrieve(self, context: Context) -> List[WorkingMemoryItem]:
        pass
    
    def consolidate(self) -> List[LongTermMemoryItem]:
        pass
    
    def clear(self) -> None:
        pass


class LongTermMemory:
    def __init__(self, db: StorageManager):
        self.db = db
    
    def store(self, item: LongTermMemoryItem) -> None:
        pass
    
    def retrieve(self, query: MemoryQuery) -> List[MemoryItem]:
        pass
    
    def update(self, id: str, updates: Dict) -> None:
        pass
    
    def delete(self, id: str) -> None:
        pass
```

**记忆强度公式**：
```python
MemoryStrength = base_strength * \
                 (salience_weight * salience) * \
                 exp(-decay_rate * time_since_last_retrieved) * \
                 (1 + frequency_boost * retrieval_count) * \
                 (1 + emotion_weight * emotion_intensity)
```

#### 3.2.3 记忆整理引擎 (MemoryOrganizer)

**神经元连接模型**：

```python
class MemoryOrganizer:
    def __init__(self, graph_db: GraphDB):
        self.graph_db = graph_db
    
    def organize(self) -> None:
        self.build_connections()
        self.strengthen_connections()
        self.break_low_value_connections()
    
    def build_connections(self) -> None:
        memories = self.graph_db.get_all_nodes()
        for memory in memories:
            related_memories = self.find_related(memory)
            for related in related_memories:
                self.graph_db.add_edge(
                    source_id=memory.id,
                    target_id=related.id,
                    weight=self.calculate_connection_weight(memory, related),
                    label="related"
                )
    
    def strengthen_connections(self) -> None:
        edges = self.graph_db.get_all_edges()
        for edge in edges:
            new_weight = self.strengthen_edge(edge)
            self.graph_db.update_edge(edge.id, weight=new_weight)
    
    def break_low_value_connections(self, threshold: float = 0.1) -> None:
        edges = self.graph_db.get_edges_below_threshold(threshold)
        for edge in edges:
            self.graph_db.remove_edge(edge.id)
    
    def calculate_connection_weight(self, memory1: MemoryNode, memory2: MemoryNode) -> float:
        tag_overlap = self.calculate_tag_overlap(memory1, memory2)
        semantic_similarity = self.calculate_semantic_similarity(memory1, memory2)
        co_occurrence = self.calculate_co_occurrence(memory1, memory2)
        return (tag_overlap * 0.4) + (semantic_similarity * 0.3) + (co_occurrence * 0.3)
```

**整理触发时机**：
- 定时触发：每天凌晨2点自动整理
- 阈值触发：当未整理记忆数量超过100条时触发
- 手动触发：用户在记忆面板中点击"整理"按钮
- 闲时触发：当系统空闲超过30分钟时自动触发

#### 3.2.4 主动学习模块 (ActiveLearning)

```python
class ActiveLearning:
    def __init__(self, memory_system: MemorySystem, llm_client: LLMClient):
        self.memory_system = memory_system
        self.llm_client = llm_client
        self.is_active = False
    
    def start(self) -> None:
        self.is_active = True
        self.schedule_learning()
    
    def stop(self) -> None:
        self.is_active = False
    
    def schedule_learning(self) -> None:
        while self.is_active:
            if self.is_user_idle():
                self.perform_random_learning()
            time.sleep(60)  # 每分钟检查一次
    
    def is_user_idle(self, idle_threshold: int = 1800) -> bool:
        last_activity = self.get_last_activity_time()
        return (time.time() - last_activity) > idle_threshold
    
    def perform_random_learning(self) -> None:
        memories = self.memory_system.retrieve_random(count=5)
        for memory in memories:
            self.study_memory(memory)
    
    def study_memory(self, memory: MemoryItem) -> None:
        analysis = self.llm_client.analyze_memory(memory)
        new_insights = self.generate_insights(analysis)
        self.update_memory_with_insights(memory, new_insights)
```

**学习策略**：
- 随机选择5条历史记忆进行深度分析
- 使用LLM分析记忆的深层含义和关联
- 生成新的洞察和知识
- 更新记忆的标签和连接

#### 3.2.5 Friend Agent

```python
class FriendAgent:
    def __init__(self, memory_system: MemorySystem):
        self.memory_system = memory_system
        self.user_profile: UserProfile = UserProfile()
    
    def observe_conversation(self, message: Message) -> None:
        preferences = self.extract_preferences(message)
        self.update_user_profile(preferences)
    
    def extract_preferences(self, message: Message) -> List[UserPreference]:
        pass
    
    def update_user_profile(self, preferences: List[UserPreference]) -> None:
        pass
    
    def generate_response_style(self) -> ResponseStyle:
        pass
    
    def import_from_external(self, source: ExternalSource) -> None:
        pass
```

#### 3.2.6 主机控制模块 (HostControl)

**三级授权机制**：

```python
class ShellExecutor:
    def __init__(self, authorization: AuthorizationManager):
        self.authorization = authorization
    
    def execute(self, command: str, context: ExecutionContext) -> ExecutionResult:
        classification = self.classify_command(command)
        
        if classification == CommandRiskLevel.SAFE:
            return self._execute(command)
        
        elif classification == CommandRiskLevel.DANGEROUS:
            if self.authorization.is_authorized(command, context):
                return self._execute(command)
            else:
                return ExecutionResult(
                    success=False,
                    error="需要用户授权才能执行此命令"
                )
        
        elif classification == CommandRiskLevel.HIGH_RISK:
            rollback_plan = self.generate_rollback_plan(command)
            if self.authorization.is_authorized(command, context, rollback_plan):
                return self._execute_with_rollback(command, rollback_plan)
            else:
                return ExecutionResult(
                    success=False,
                    error="需要用户授权并确认恢复方案才能执行此命令",
                    rollback_plan=rollback_plan
                )
    
    def classify_command(self, command: str) -> CommandRiskLevel:
        pass
    
    def generate_rollback_plan(self, command: str) -> RollbackPlan:
        pass
```

**命令风险等级**：

| 等级 | 描述 | 示例 | 授权要求 |
|------|------|------|----------|
| **Safe** | 无危险操作，只读 | `ls`, `cat`, `echo`, `date` | 无需授权 |
| **Dangerous** | 有潜在风险，写操作 | `mkdir`, `touch`, `cp` | 需要授权 |
| **High Risk** | 高危操作，破坏性 | `rm`, `rm -rf`, `chmod`, `systemctl` | 需要授权+恢复方案 |

**一键全授权**：
```python
class AuthorizationManager:
    def __init__(self):
        self.granted_commands: Set[str] = set()
        self.global_authorization: bool = False
        self.authorization_scope: Optional[AuthorizationScope] = None
        self.authorization_expiry: Optional[int] = None
    
    def grant_global_authorization(self, scope: AuthorizationScope, duration: int = 3600) -> None:
        self.global_authorization = True
        self.authorization_scope = scope
        self.authorization_expiry = time.time() + duration
    
    def is_authorized(self, command: str, context: ExecutionContext, rollback_plan: Optional[RollbackPlan] = None) -> bool:
        if self.global_authorization and self._is_within_scope(command, context):
            return True
        if command in self.granted_commands:
            return True
        return False
```

**恢复方案机制**：
```python
class RollbackPlan:
    def __init__(self, command: str):
        self.original_state: Dict[str, Any] = {}
        self.rollback_commands: List[str] = []
        self.snapshot_path: Optional[str] = None
    
    def capture_state(self) -> None:
        pass
    
    def execute_rollback(self) -> None:
        pass
```

#### 3.2.7 数据迁移模块 (Migration)

**支持从其他Agent导入数据**：

```python
class Migrator:
    def __init__(self, memory_system: MemorySystem):
        self.memory_system = memory_system
    
    def migrate_from_openclaw(self, source_path: str) -> MigrationResult:
        pass
    
    def migrate_from_hermes(self, source_path: str) -> MigrationResult:
        pass
    
    def migrate_from_openhuman(self, source_path: str) -> MigrationResult:
        pass


class OpenClawMigrator(Migrator):
    def _parse_openclaw_data(self, data: Dict) -> List[MemoryItem]:
        pass
    
    def _map_conversation(self, conversation: Dict) -> Conversation:
        pass
    
    def _map_preferences(self, preferences: Dict) -> UserProfile:
        pass


class HermesMigrator(Migrator):
    def _parse_hermes_data(self, data: Dict) -> List[MemoryItem]:
        pass


class OpenHumanMigrator(Migrator):
    def _parse_openhuman_data(self, data: Dict) -> List[MemoryItem]:
        pass
```

---

## 四、实时通信架构

### 4.1 WebSocket消息协议

```python
class WebSocketMessage:
    type: str
    payload: Dict[str, Any]
    timestamp: int


class MessageType(Enum):
    AGENT_CREATED = "agent_created"
    AGENT_STATUS_CHANGE = "agent_status_change"
    AGENT_OUTPUT = "agent_output"
    AGENT_COMPLETE = "agent_complete"
    MESSAGE_RECEIVED = "message_received"
    MESSAGE_RESPONSE = "message_response"
    FEEDBACK_SUBMITTED = "feedback_submitted"
    ERROR = "error"
```

### 4.2 Python + Electron集成方案

```
Electron Main Process
    │
    ├── 启动Python Sidecar进程 (Uvicorn/FastAPI)
    │   ├── 端口：localhost:8000
    │   ├── 通信：HTTP + WebSocket
    │   └── 生命周期：跟随Electron启动/停止
    │
    ├── IPC通信 (主进程 ↔ 渲染进程)
    │   ├── 进程状态通知
    │   ├── 配置更新
    │   └── 系统事件
    │
    └── 渲染进程 (Vue3 SPA)
        ├── HTTP请求 → localhost:8000/api/
        └── WebSocket → localhost:8000/ws/
```

**进程管理**：
```python
# Electron主进程中启动Python
const { spawn } = require('child_process');

const pythonProcess = spawn('python', ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000']);

pythonProcess.on('close', (code) => {
    console.log(`Python进程退出，代码: ${code}`);
});

// 优雅关闭
app.on('quit', () => {
    pythonProcess.kill();
});
```

---

## 五、数据存储方案

### 5.1 数据库设计

#### 5.1.1 SQLite表结构

**记忆图谱节点表**：
```sql
CREATE TABLE memory_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('memory', 'tag', 'concept', 'entity')),
  content TEXT NOT NULL,
  metadata JSON,
  salience_score REAL DEFAULT 0.5,
  emotional_tag TEXT,
  retrieval_count INTEGER DEFAULT 0,
  last_retrieved INTEGER,
  strength REAL DEFAULT 0.5,
  decay_rate REAL DEFAULT 0.05,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**时序数据表**：
```sql
CREATE TABLE time_series_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  timestamp INTEGER NOT NULL,
  tags JSON
);

CREATE INDEX idx_time_series_timestamp ON time_series_data(timestamp);
CREATE INDEX idx_time_series_metric ON time_series_data(metric);
```

#### 5.1.2 KùzuDB图结构

```python
# 创建节点表
graph_db.create_node_table(
    name="memory",
    schema={
        "id": "STRING",
        "content": "STRING",
        "type": "STRING",
        "salience": "DOUBLE",
        "strength": "DOUBLE"
    },
    primary_key="id"
)

# 创建边表
graph_db.create_rel_table(
    name="related_to",
    schema={
        "weight": "DOUBLE",
        "activation_count": "INT64",
        "direction": "STRING"
    }
)
```

#### 5.1.3 LanceDB向量存储

```python
import lancedb

db = lancedb.connect("./data/vectors")

schema = {
    "id": "str",
    "embedding": "list[float]",
    "content": "str",
    "memory_type": "str",
    "timestamp": "int",
    "tags": "list[str]"
}

table = db.create_table("memories", schema=schema)
```

### 5.2 本地文件存储

```
~/.brian-agent/
├── data/
│   ├── brian.db              # SQLite数据库文件
│   ├── graph/                # KùzuDB图数据目录
│   │   └── (KùzuDB文件)
│   ├── vectors/              # LanceDB向量数据目录
│   │   └── memories.lance
│   └── config/
│       ├── settings.json     # 用户配置
│       └── api-keys.json     # API密钥（加密存储）
├── library/                  # 图书馆本地资料路径
│   └── (用户配置的文件夹)
├── imports/                  # 导入的外部数据
│   ├── openclaw/             # OpenClaw导入数据
│   ├── hermes/               # Hermes导入数据
│   └── openhuman/            # OpenHuman导入数据
└── backups/                  # 备份目录
    └── (自动备份文件)
```

---

## 六、隐私保护架构

### 6.1 数据流动边界

```
用户数据
    │
    ▼
┌──────────────────────────────┐
│      本地存储区域             │
│  (用户设备，无需授权)          │
│                              │
│  ┌────────────────────────┐  │
│  │ 对话历史               │  │
│  │ 用户偏好               │  │
│  │ 记忆图谱               │  │
│  │ 图书馆文件             │  │
│  └────────────────────────┘  │
└──────────────┬───────────────┘
               │ 需要用户授权
               ▼
┌──────────────────────────────┐
│      远程处理区域             │
│  (LLM调用，需明确授权)        │
│                              │
│  ┌────────────────────────┐  │
│  │ LLM API调用            │  │
│  │ 向量嵌入计算           │  │
│  │ 语义分析               │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### 6.2 授权网关

```python
class AuthGate:
    def __init__(self):
        self.user_consent: Dict[str, ConsentState] = {}
    
    def check_consent(self, user_id: str, data_type: DataType) -> bool:
        pass
    
    def request_consent(self, user_id: str, data_type: DataType) -> bool:
        pass
    
    def store_consent(self, user_id: str, data_type: DataType, granted: bool) -> None:
        pass
    
    def validate_and_forward(self, request: LLMRequest) -> LLMResponse:
        pass
```

---

## 七、部署方案

### 7.1 开发环境

```bash
# 安装Python依赖
cd backend
pip install -r requirements.txt

# 启动Python后端
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# 安装前端依赖
cd frontend
npm install

# 启动前端开发服务器
npm run dev

# 访问地址
http://localhost:5173
```

### 7.2 桌面应用 (Electron)

```
┌─────────────────────────────────────┐
│         Electron App                │
│                                     │
│  ┌─────────────┐  ┌─────────────┐  │
│  │   Vue3 UI   │  │  Python     │  │
│  │   (Renderer │  │  Sidecar    │  │
│  │    Process) │  │  (FastAPI)  │  │
│  └──────┬──────┘  └──────┬──────┘  │
│         │                │         │
│         └────────────────┘         │
│                │                   │
│                ▼                   │
│         SQLite + KùzuDB + LanceDB  │
│         (本地文件)                  │
│                                     │
└─────────────────────────────────────┘
```

### 7.3 打包与部署对比分析

#### 7.3.1 Python vs Node.js打包方案对比

| 维度 | Python + Electron | Node.js + Electron |
|------|-------------------|---------------------|
| **打包复杂度** | 高（需额外打包Python为可执行文件） | 低（Node.js天然运行在Electron内） |
| **产物体积** | 大（~200MB+ Python运行时） | 小（~80MB+） |
| **跨平台兼容性** | 需要分别打包各平台版本 | 一次打包，多平台分发 |
| **启动速度** | 慢（需启动Python进程） | 快（直接在Electron内运行） |
| **依赖管理** | 复杂（C扩展库如KùzuDB需特殊处理） | 简单（npm生态成熟） |
| **构建工具** | PyInstaller / Nuitka | electron-builder / electron-packager |
| **调试难度** | 高（两个进程，调试复杂） | 低（单一进程） |
| **热更新** | 困难（Python进程需重启） | 容易（HMR支持） |

#### 7.3.2 Python sidecar打包方案

**方案：PyInstaller打包 + Electron spawn**

```bash
# 步骤1：将Python后端打包为独立可执行文件
cd backend
pyinstaller --onefile --windowed --name brian-backend main.py

# 步骤2：构建前端
cd frontend
npm run build

# 步骤3：配置Electron打包
# electron-builder配置中包含backend/dist/brian-backend

# 步骤4：打包Electron应用
cd electron
npm run make
```

**Electron资源目录结构**：
```
Brian-Agent.app/
├── Contents/
│   ├── MacOS/
│   │   └── Brian-Agent          # Electron主程序
│   └── Resources/
│       ├── app.asar             # 前端Vue3应用
│       └── backend/             # Python后端可执行文件
│           ├── brian-backend    # PyInstaller打包产物
│           └── data/            # 数据库目录（运行时创建）
```

**Electron主进程启动Python**：
```javascript
const { spawn } = require('child_process');
const path = require('path');

function startPythonBackend() {
    const backendPath = path.join(__dirname, 'backend', 'brian-backend');
    return spawn(backendPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PORT: '8000' }
    });
}

const pythonProcess = startPythonBackend();

pythonProcess.stdout.on('data', (data) => {
    console.log(`Python输出: ${data}`);
});

pythonProcess.stderr.on('data', (data) => {
    console.error(`Python错误: ${data}`);
});

pythonProcess.on('close', (code) => {
    console.log(`Python进程退出，代码: ${code}`);
});

app.on('quit', () => {
    pythonProcess.kill();
});
```

#### 7.3.3 Node.js打包方案（参考Hermes模式）

**Hermes打包模式特点**：
- 前后端都运行在Electron的Node.js环境中
- 前端构建为静态资源，打包进app.asar
- 后端作为Node.js模块，直接在Electron主进程中运行
- 无需额外进程，通信更简单

**方案：前后端一体化打包**

```bash
# 步骤1：构建前端
cd frontend
npm run build

# 步骤2：复制前端产物到Electron资源目录
cp -r frontend/dist electron/resources/app/

# 步骤3：复制后端代码到Electron资源目录
cp -r backend electron/resources/app/

# 步骤4：打包Electron应用
cd electron
npm run make
```

**Electron资源目录结构**：
```
Brian-Agent.app/
├── Contents/
│   ├── MacOS/
│   │   └── Brian-Agent          # Electron主程序
│   └── Resources/
│       └── app/                  # 前后端一体化
│           ├── index.html        # 前端入口
│           ├── js/               # 前端JS
│           ├── css/              # 前端CSS
│           └── backend/          # 后端Node.js代码
│               ├── main.js       # 后端入口
│               ├── agent/        # Agent模块
│               ├── memory/       # 记忆系统
│               └── data/         # 数据库目录
```

**Electron主进程启动后端**：
```javascript
const path = require('path');
const { app } = require('electron');

async function startBackend() {
    const backendPath = path.join(__dirname, 'backend', 'main.js');
    require(backendPath);
}

app.whenReady().then(() => {
    startBackend();
    createWindow();
});
```

#### 7.3.4 方案对比结论

| 维度 | Python + Electron | Node.js + Electron | 推荐度 |
|------|-------------------|---------------------|--------|
| **打包复杂度** | 高 | 低 | ⭐ Node.js |
| **产物体积** | 大 (~250MB) | 小 (~100MB) | ⭐ Node.js |
| **启动速度** | 慢 (~2-3秒) | 快 (~0.5-1秒) | ⭐ Node.js |
| **AI/ML生态** | 丰富 | 有限 | ⭐ Python |
| **图数据库支持** | KùzuDB原生 | 选择较少 | ⭐ Python |
| **开发体验** | 复杂（双进程） | 简单（单进程） | ⭐ Node.js |
| **热更新** | 困难 | 容易 | ⭐ Node.js |
| **部署维护** | 复杂 | 简单 | ⭐ Node.js |

**关键风险点**（Python方案）：

1. **PyInstaller兼容性问题**：
   - KùzuDB、LanceDB等C扩展库可能无法被PyInstaller正确打包
   - 需要验证每个依赖库的打包兼容性
   - 可能需要自定义打包脚本

2. **跨平台打包**：
   - 需要在Mac、Windows、Linux分别构建
   - 每个平台的Python环境和依赖可能不同
   - 需要CI/CD流水线支持

3. **启动性能**：
   - 每次启动需要先启动Python进程
   - 用户感知延迟增加
   - 需要优化启动流程

#### 7.3.5 推荐方案

**方案A：纯Node.js方案（推荐）**

如果项目对AI/ML功能要求不是特别高，或者可以通过外部API调用实现，建议使用纯Node.js方案：

- **优点**：打包简单、体积小、启动快、开发体验好
- **缺点**：AI/ML库生态不如Python丰富

**方案B：Python sidecar方案（备选）**

如果必须使用Python的AI/ML库，建议采用Python sidecar方案，但需要先做验证：

```bash
# 验证步骤：创建最小化demo
mkdir python-packaging-test
cd python-packaging-test

# 创建简单的FastAPI应用
cat > main.py << 'EOF'
from fastapi import FastAPI
import kuzu

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello from Python!"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
EOF

# 安装依赖
pip install fastapi uvicorn kuzu

# 尝试打包
pyinstaller --onefile main.py

# 测试打包产物
./dist/main

# 如果成功，说明Python方案可行
# 如果失败，需要调试PyInstaller配置
```

**方案C：混合方案（折中）**

- 核心逻辑用Node.js实现（记忆系统、Agent编排、主机控制）
- AI/ML功能通过调用外部Python脚本实现
- 打包时将Python脚本打包为可执行文件

---

### 7.4 安装包体积预估

| 组件 | Python方案体积 | Node.js方案体积 |
|------|---------------|-----------------|
| Electron基础 | ~80MB | ~80MB |
| 前端Vue3应用 | ~10MB | ~10MB |
| 后端运行时 | ~150MB (Python) | ~10MB (Node.js) |
| 数据库组件 | ~50MB | ~50MB |
| **总计** | **~290MB** | **~150MB** |

### 7.5 首次启动流程

```
用户双击应用 → Electron启动 → 启动后端服务 → 加载前端页面 → 连接WebSocket → 显示欢迎界面
    │                  │               │                   │                 │
    ▼                  ▼               ▼                   ▼                 ▼
  解压资源          创建窗口        初始化数据库        渲染UI           建立通信
```

**首次启动优化**：
- 预加载常用模型和配置
- 异步初始化数据库
- 显示加载动画，提升用户体验

**Electron打包**：
```bash
# 构建前端
cd frontend
npm run build

# 打包Electron应用
cd electron
npm run make
```

---

## 八、实现顺序

### 8.1 第一阶段：Memory系统实现

| 优先级 | 模块 | 交付物 | 时间估计 |
|--------|------|--------|----------|
| P0 | 感觉记忆 | SensoryMemory | 1周 |
| P0 | 工作记忆 | WorkingMemory | 1周 |
| P0 | 长期记忆 | LongTermMemory + SQLite | 2周 |
| P0 | 记忆图谱 | KùzuDB集成 | 2周 |
| P1 | 向量检索 | LanceDB集成 | 1周 |
| P1 | 记忆整理引擎 | MemoryOrganizer（神经元连接模型） | 2周 |

### 8.2 第二阶段：Agent实现

| 优先级 | 模块 | 交付物 | 时间估计 |
|--------|------|--------|----------|
| P0 | Brian Agent核心 | Identity, GoalManager, DriveEngine | 2周 |
| P0 | Friend Agent | 用户画像, 被动学习, 偏好提取 | 2周 |
| P0 | Skill系统 | 技能注册、执行、管理 | 2周 |
| P1 | MCP集成 | MCP工具调用框架 | 1周 |
| P1 | LLM对接 | LLMClient, AuthGate, 多Provider支持 | 2周 |
| P1 | 策略引擎 | 四种策略实现, 策略选择 | 2周 |
| P1 | 主动学习 | ActiveLearning（闲时随机学习） | 1周 |

### 8.3 第三阶段：Agent编排

| 优先级 | 模块 | 交付物 | 时间估计 |
|--------|------|--------|----------|
| P0 | Orchestrator | 任务分解, Agent派生, 状态追踪 | 2周 |
| P0 | Work Agent | 工作Agent实现, 输出流聚合 | 2周 |
| P1 | WebSocket通信 | 消息协议, 实时推送, 断线重连 | 1周 |

### 8.4 第四阶段：语言学处理

| 优先级 | 模块 | 交付物 | 时间估计 |
|--------|------|--------|----------|
| P1 | 语言规范化 | 错误纠正, 冗余去除, 语义提取 | 2周 |
| P1 | 语义角色标注 | 提取实体、关系、意图 | 2周 |
| P1 | 情感分析 | 情感识别, 情绪强度计算 | 1周 |

### 8.5 第五阶段：CLI和前端实现

| 优先级 | 模块 | 交付物 | 时间估计 |
|--------|------|--------|----------|
| P0 | CLI工具 | 命令行交互, 基本操作 | 1周 |
| P0 | 核心对话界面 | ChatArea, MessageBubble, InputBox | 2周 |
| P0 | Agent链路可视化 | AgentChainView, AgentNode, AgentOutput | 2周 |
| P1 | 功能面板 | Header, FunctionPanel, 记忆/图书馆/历史/设置 | 2周 |
| P1 | 评价与上报系统 | RatingButtons, ContextMenu, ReportModal | 1周 |
| P1 | 动画与交互 | 页面加载, 输入框动画, 面板切换 | 1周 |
| P2 | Electron打包 | 桌面应用构建, 安装包生成 | 1周 |

---

## 九、关键技术挑战与解决方案

### 9.1 Python + Electron集成

| 挑战 | 解决方案 |
|------|----------|
| 进程通信 | localhost HTTP/WebSocket，避免IPC复杂性 |
| 进程生命周期 | Electron主进程管理Python进程的启动/停止 |
| 跨平台兼容性 | 使用Python虚拟环境，确保依赖一致 |
| 性能 | 异步处理，避免阻塞主线程 |

### 9.2 嵌入式数据库组合

| 挑战 | 解决方案 |
|------|----------|
| 资源占用 | 选择轻量级嵌入式方案，预估<500MB内存 |
| 数据一致性 | 统一事务管理，定期同步 |
| 查询性能 | 索引优化，缓存策略 |
| 备份恢复 | 定期自动备份，支持手动恢复 |

### 9.3 主机控制安全

| 挑战 | 解决方案 |
|------|----------|
| 命令分类 | 基于AST解析，而非简单关键词匹配 |
| 权限管理 | 三级授权机制，支持一键全授权 |
| 操作回滚 | 执行前捕获状态，生成恢复方案 |
| 沙箱隔离 | 限制命令执行范围，禁止访问敏感目录 |

### 9.4 记忆整理引擎

| 挑战 | 解决方案 |
|------|----------|
| 连接建立 | 基于标签重叠、语义相似度、共现频率计算权重 |
| 连接强化 | Hebbian学习规则，频繁激活的连接增强 |
| 连接断开 | 低权重连接自动移除，阈值可配置 |
| 性能优化 | 增量更新，批量处理，定时执行 |

---

## 十、总结

### 10.1 架构特点

1. **Vue3 + Python技术栈**：前端Vue3生态，后端Python AI生态，发挥各自优势
2. **嵌入式数据库组合**：SQLite + KùzuDB + LanceDB + RuleEngine，零外部依赖
3. **本地优先部署**：Electron桌面应用，数据存储在本地设备
4. **实时通信**：WebSocket推送，支持多Agent输出流实时展示
5. **记忆整理**：神经元连接模型，自动建立/强化/断开记忆连接
6. **主动学习**：闲时随机学习模块，对历史对话进行深度分析
7. **主机控制**：三级授权机制，安全执行Shell命令
8. **数据迁移**：支持从OpenClaw/Hermes/OpenHuman导入数据

### 10.2 技术选型核心理由

- **Vue3**：组合式API，响应式系统，生态成熟，适合复杂UI
- **Python 3.12+**：丰富的AI/ML库生态，图数据库支持好
- **KùzuDB**：嵌入式图数据库，高性能，适合记忆图谱
- **LanceDB**：嵌入式向量数据库，语义检索能力
- **FastAPI**：高性能异步框架，自动API文档
- **Electron**：跨平台桌面应用，本地运行

### 10.3 下一步行动

1. 确认技术架构方案
2. 开始第一阶段：Memory系统实现
3. 优先实现SQLite + KùzuDB组合
4. 同步开发记忆整理引擎

---

> *技术架构版本: v2.0*  
> *最后更新: 2026-07-10*  
> *遵循原则: Vue3 + Python · 嵌入式数据库 · 本地优先 · 主动学习*
