import fs from 'node:fs';
import path from 'node:path';

const allTables = JSON.parse(fs.readFileSync('/tmp/all_tables.json', 'utf8'));
const domains = JSON.parse(fs.readFileSync('/tmp/domain_specs.json', 'utf8'));

const tableMap = {};
for (const t of allTables) {
  tableMap[`${t.dbName}::${t.table}`] = t;
}

// Special tables not in SQLite (e.g. LanceDB)
const specialTables = {
  'vectordb/vector_record.lance::vector_record': {
    dbName: 'vectordb/vector_record.lance',
    table: 'vector_record',
    sql: `LanceDB Table: vector_record\nArrow Schema:\n- id: Utf8 (UUID PK)\n- content: Utf8\n- embedding: FixedSizeList<Float32>[1536]\n- user_id: Utf8 (Nullable)\n- metadata: Utf8 (JSON Nullable)\n- created: Int64\n- updated: Int64`,
    columns: [
      { name: 'id', type: 'TEXT (UUID)', notnull: 1, dflt_value: null, pk: 1, desc: '向量记录全局唯一主键 UUID' },
      { name: 'content', type: 'TEXT', notnull: 1, dflt_value: null, pk: 0, desc: '向量化源文本原文' },
      { name: 'embedding', type: 'Vector(Float32[1536])', notnull: 1, dflt_value: null, pk: 0, desc: '文本嵌入向量（维度由配置决定，默认 1536 维 Float32 稠密向量）' },
      { name: 'user_id', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0, desc: '归属用户或会话标识' },
      { name: 'metadata', type: 'TEXT (JSON)', notnull: 0, dflt_value: "'{}'", pk: 0, desc: '结构化元数据 JSON（包含 info_id, chunk_index, source_type 等）' },
      { name: 'created', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0, desc: '创建时间戳 (毫秒)' },
      { name: 'updated', type: 'INTEGER', notnull: 1, dflt_value: '0', pk: 0, desc: '更新时间戳 (毫秒)' }
    ],
    indexes: [
      { name: 'vector_ivf_pq_index', unique: false, columns: ['embedding'], desc: 'LanceDB 向量索引（IVF-PQ / 余弦相似度 Metric）' }
    ],
    foreignKeys: []
  }
};

function formatFieldDesc(tName, col) {
  const colName = col.name;
  if (col.desc) return col.desc;
  
  if (colName === 'id') return '唯一主键 (UUID)';
  if (colName === 'trace_id') return '全链路追踪 ID (UUID)，跨模块调用与日志审计唯一凭据';
  if (colName === 'created') return '创建时间戳 (毫秒 ms)';
  if (colName === 'updated') return '更新时间戳 (毫秒 ms)';
  if (colName === 'session_id') return '会话 ID，关联会话主记录';
  if (colName === 'session_key') return '运行时会话唯一键名（用于路由与并发隔离）';
  if (colName === 'work_id') return '工作流或单次问答轮次 ID (UUID)';
  if (colName === 'run_id') return 'Runtime Run 执行任务 ID (UUID)';
  if (colName === 'agent_id') return '智能体 ID，关联 agent_record.id';
  if (colName === 'title') return '展示标题或名称 (统一规范列)';
  if (colName === 'brief') return '简要描述 (统一规范列)';
  if (colName === 'content') return '正文内容 (统一规范列)';
  if (colName === 'url') return '网络端点地址或 URL (统一规范列)';
  if (colName === 'enable') return '启用状态 (1=启用, 0=禁用)';
  if (colName === 'config_key') return '配置项唯一键名 (Primary Key)';
  if (colName === 'config_value') return '配置项取值 (字符串序列化存储)';
  if (colName === 'value_type') return '配置值类型 (STRING/INT/FLOAT/BOOL/JSON)';
  if (colName === 'description') return '配置项功能描述与说明';
  if (colName === 'usage_date') return '用量统计日期 (YYYY-MM-DD)';
  if (colName === 'usage_count') return '统计周期内累计使用/调用次数';
  if (colName === 'input_tokens') return '输入 Token 消耗数';
  if (colName === 'output_tokens') return '输出 Token 生成数';
  if (colName === 'status') return '状态标识枚举';
  if (colName === 'gap' || colName === 'duration_ms' || colName === 'elapsed_ms') return '执行耗时 (毫秒 ms)';
  if (colName === 'prompt_template_id') return '提示词模板 ID，关联 prompt_template_record.id';
  if (colName === 'llm_id' || colName === 'llm_available_id') return 'LLM 模型 ID，关联 llm_available_record.id';
  if (colName === 'llm_provider_id') return 'LLM 供应商 ID，关联 llm_provider_record.id';
  if (colName === 'input') return '输入参数或 Prompt 正文';
  if (colName === 'output') return '输出结果或响应内容';
  if (colName === 'input_length') return '输入字符数统计';
  if (colName === 'output_length') return '输出字符数统计';
  if (colName === 'dialog') return '问答对话正文文本';
  if (colName === 'type') return '类型枚举标识';
  if (colName === 'role') return '消息发送角色 (system/user/assistant/tool)';
  if (colName === 'seq') return '会话内消息严格递增序号';
  if (colName === 'token_count') return '单条消息 Token 估算量';
  if (colName === 'part_type') return '消息片段类型 (text/think/tool_use/tool_result)';
  if (colName === 'part_order') return '消息内部片段排序次序 (0-indexed)';
  if (colName === 'execute_id') return '关联的工具执行记录 ID，指向 execute_record.id';
  if (colName === 'round') return '工作流或问答所属轮次号 (0, 1, 2...)';
  if (colName === 'dialog_id') return '关联的目标问答事实 ID，指向 dialog_record.id';
  if (colName === 'entity_type') return '用量实体类型枚举 (agent/soul/skill/mcp/prompt/llm_provider)';
  if (colName === 'entity_id') return '用量实体主键 ID';
  if (colName === 'usage_context') return '用量触发业务场景上下文描述';
  
  return '-';
}

const brianDbTables = allTables.filter(t => t.dbName === 'brian.db');
const logDbTables = allTables.filter(t => t.dbName === 'brian_log.db');
const graphDbTables = allTables.filter(t => t.dbName === 'graph.db');

let md = '';
md += '# _12_db_schema.md: 数据库全量架构与表结构规范手册\n\n';
md += '> **状态**: confirmed / maintained  \n';
md += '> **规范依据**: [ADR-003 本地三库](file://./_03_tech_stack/ADR-003-local-three-stores.md) · [ADR-010 消息三表重构](file://./_03_tech_stack/ADR-010-three-tables-dialog-execute-context.md) · [ADR-012 记录/组织二分存储模型与全量规范化](file://./_03_tech_stack/ADR-012-record-org-dichotomy-storage.md)  \n';
md += '> **目标定位**: 本项目（brian-agent）所有物理数据库、逻辑表结构、字段契约、索引约束与实体拓扑的**唯一事实源规范文档**。\n\n';
md += '---\n\n';

md += '## 目录\n\n';
md += '1. [第一章：存储架构与设计模型](#第一章存储架构与设计模型)\n';
md += '   - [1.1 多库分工与物理拓扑](#11-多库分工与物理拓扑)\n';
md += '   - [1.2 「记录/组织」二分存储模型](#12-记录组织二分存储模型)\n';
md += '   - [1.3 通用公共字段与命名规范](#13-通用公共字段与命名规范)\n';
md += '   - [1.4 幂等初始化与平滑迁移规范](#14-幂等初始化与平滑迁移规范)\n';
md += '2. [第二章：全库全景索引矩阵](#第二章全库全景索引矩阵)\n';
md += '   - [2.1 物理数据库分布概览](#21-物理数据库分布概览)\n';
md += '   - [2.2 全量数据表快速索引](#22-全量数据表快速索引)\n';
md += '3. [第三章：分领域表结构详细规范](#第三章分领域表结构详细规范)\n';
domains.forEach((d, idx) => {
  md += `   - [${d.name}](#domain-${d.id})\n`;
});
md += '4. [第四章：实体拓扑与关联关系图 (Mermaid)](#第四章实体拓扑与关联关系图-mermaid)\n';
md += '   - [4.1 问答、执行与上下文装配主链](#41-问答执行与上下文装配主链)\n';
md += '   - [4.2 Agent 与能力组件装配拓扑](#42-agent-与能力组件装配拓扑)\n';
md += '   - [4.3 TraceBase 全链路用量统计拓扑](#43-tracebase-全链路用量统计拓扑)\n';
md += '   - [4.4 知识图谱与向量索引拓扑](#44-知识图谱与向量索引拓扑)\n';
md += '5. [第五章：数据库运维与高可用机制](#第五章数据库运维与高可用机制)\n';
md += '   - [5.1 SQLite WAL Checkpoint 与并发写机制](#51-sqlite-wal-checkpoint-与并发写机制)\n';
md += '   - [5.2 零依赖 100% 本机冷备与恢复](#52-零依赖-100-本机冷备与恢复)\n';
md += '\n---\n\n';

// Chapter 1
md += '## 第一章：存储架构与设计模型\n\n';
md += '### 1.1 多库分工与物理拓扑\n\n';
md += 'Brian Agent 坚持 **100% 数据归属本机** 的隐私安全架构，杜绝依赖外部数据库中间件（如 MySQL、PostgreSQL、Qdrant 等）。系统采用 **SQLite(WAL) + LanceDB + leangraph** 组合形态：\n\n';
md += '| 数据库文件路径 | 存储引擎 | 访问封装组件 | 架构职责 |\n';
md += '|---|---|---|---|\n';
md += '| `data/brian.db` | SQLite 3 (WAL 模式, Foreign Keys ON) | `RelationDBAccess` (Base/RelationDBProvider) | **业务主库**：承载问答事实、执行流水、Agent 定义、能力组件配置、上下文组织与 TraceBase 用量 |\n';
md += '| `data/brian_log.db` | SQLite 3 (WAL 模式) | `LogAccess` (Base/LogProvider) | **运行日志库**：物理隔离系统运行日志流水，防止高频日志 I/O 抢占主业务库锁 |\n';
md += '| `data/graph.db` | SQLite 3 (`leangraph` 驱动) | `GraphDBAccess` (Base/GraphDBProvider) | **图数据库**：存储知识图谱节点（`nodes`）、拓扑边（`edges`）及图激活衰减统计 |\n';
md += '| `data/vectordb/` | LanceDB (列式向量文件) | `VectorDBAccess` (Base/VectorDBProvider) | **向量数据库**：存储多维密集向量（`vector_record.lance`），支持余弦相似度极速近邻检索 |\n\n';

md += '### 1.2 「记录/组织」二分存储模型\n\n';
md += '依据 **ADR-012** 规范，全系统关系数据表严格划分为两类形态：\n\n';
md += '1. **记录数据 (`xxx_record`)**：\n';
md += '   - **语义**: 一行数据表达一个**独立事实、内容实体、历史流水或配置定义本身**。\n';
md += '   - **生命周期约束**: 删除该行即意味着丢失该业务事实本身（如问答事实 `dialog_record`、执行轨迹 `execute_record`、技能代码 `skill_record`）。\n';
md += '2. **组织数据 (`xxx_org`)**：\n';
md += '   - **语义**: 一行数据表达**多个实体 ID 间的关联关系、聚合统计、索引快照或时序投影**。\n';
md += '   - **生命周期约束**: 删除该行不影响被指向的目标记录本身，仅破坏索引或关联拓扑（如上下文映射 `context_org`、Agent 技能绑定 `agent_skill_org`、日聚合用量 `agent_usage_org`）。\n';
md += '3. **配置记录 (`xxx_config_record` / `xxx_config`)**：\n';
md += '   - **语义**: 遵循通用键值对 `(config_key, config_value, value_type, description, updated)` 统一结构，为各 Provider 提供运行时动态参数热更新。\n\n';

md += '### 1.3 通用公共字段与命名规范\n\n';
md += '全库数据表遵循以下统一的列命名与字段契约：\n\n';
md += '| 字段名 | 类型 | 约束 | 语义与业务约定 |\n';
md += '|---|---|---|---|\n';
md += '| `id` | `TEXT` | `PRIMARY KEY` | 实体全局唯一主键（UUID 字符串，由 `IdGenerator.generate()` 生成） |\n';
md += "| `trace_id` | `TEXT` | `NOT NULL DEFAULT ''` | **全链路追踪 ID**：串联前后端请求、SSE 推送、LLM 调用、Tool 执行与日志排查。定义/配置行置空 |\n";
md += '| `created` | `INTEGER` | `NOT NULL` | 创建时间毫秒时间戳（`IdGenerator.now()`，UNIX Epoch ms） |\n';
md += '| `updated` | `INTEGER` | `NOT NULL` | 最后更新时间毫秒时间戳（UNIX Epoch ms） |\n';
md += '| `title` | `TEXT` | 统一展示名 | 替代历史残留的 `name`、`xxx_name`、`xxx_title` |\n';
md += '| `brief` | `TEXT` | 统一简介 | 替代历史残留的 `description`、`summary`、`xxx_brief` |\n';
md += '| `content` | `TEXT` | 统一正文 | 替代历史残留的 `text`、`body`、`payload` |\n';
md += '| `url` | `TEXT` | 统一网络地址 | 替代历史残留的 `endpoint`、`base_url`、`link` |\n';
md += '| `<col>_length` | `INTEGER` | 长度统计列 | 配合大文本字段维护字数统计（如 `input_length`、`output_length`、`summary_length`） |\n\n';

md += '### 1.4 幂等初始化与平滑迁移规范\n\n';
md += '- 所有模块在 DDD 基础设施层均实现独立的 `*SchemaInitializer`（如 `InfoCoreSchemaInitializer`、`LLMSchemaInitializer`、`TraceSchemaInitializer` 等）。\n';
md += '- 系统在 `dev-server.ts` 启动时按依赖拓扑自动执行 `init()`。\n';
md += '- 迁移语句全部包含幂等容错机制：`ALTER TABLE ... RENAME TO` 与 `ALTER TABLE ... ADD COLUMN` 均通过 `try/catch` 忽略已存在或已迁移状态，确保全新初始化与历史存量平滑升级均能 100% 成功。\n\n';

md += '---\n\n';

// Chapter 2
md += '## 第二章：全库全景索引矩阵\n\n';
md += '### 2.1 物理数据库分布概览\n\n';
md += '| 数据库标识 | 物理路径 | 表数量 | 存储范式 | 核心承载模块 |\n';
md += '|---|---|---|---|---|\n';
md += `| 业务主库 | \`data/brian.db\` | ${brianDbTables.length} | 关系型 (WAL) | InfoCore, Runtime, Agent, Capabilities, TraceBase, Config |\n`;
md += `| 日志专库 | \`data/brian_log.db\` | ${logDbTables.length} | 关系型 (WAL) | LogProvider, TraceBase 日志沉淀 |\n`;
md += `| 图数据库 | \`data/graph.db\` | ${graphDbTables.length} | 图拓扑 + 关系表 | GraphDBProvider, LeanGraph 节点/边及激活事件 |\n`;
md += '| 向量专库 | `data/vectordb/vector_record.lance` | 1 | 列式 Arrow 向量 | VectorDBProvider, InfoCore 向量检索 |\n\n';

md += '### 2.2 全量数据表快速索引\n\n';
md += '| 序号 | 领域模块 | 数据表名 (`Table Name`) | 物理所属库 | 存储分类 | 核心职责说明 |\n';
md += '|---|---|---|---|---|---|\n';

let globalIdx = 1;
domains.forEach(d => {
  d.tables.forEach(t => {
    let typeLabel = '记录表 (Record)';
    if (t.type === 'org') typeLabel = '组织表 (Org)';
    else if (t.type === 'config') typeLabel = '配置表 (Config)';
    else if (t.type === 'virtual_fts5') typeLabel = '全文虚表 (FTS5)';
    else if (t.type === 'leangraph_node' || t.type === 'leangraph_edge') typeLabel = '图拓扑表 (Graph)';
    else if (t.type === 'lancedb_vector') typeLabel = '列式向量表 (Vector)';
    else if (t.type === 'legacy') typeLabel = '兼容保留表 (Legacy)';

    md += `| ${globalIdx++} | ${d.name.split(' ')[0]} | [\`${t.name}\`](#table-${t.name.replace(/_/g, '-')}) | \`${t.db}\` | ${typeLabel} | ${t.desc} |\n`;
  });
});

md += '\n---\n\n';

// Chapter 3
md += '## 第三章：分领域表结构详细规范\n\n';

domains.forEach((d, dIdx) => {
  md += `<a id="domain-${d.id}"></a>\n\n`;
  md += `### ${d.name}\n\n`;
  md += `> **领域概述**: ${d.desc}\n\n`;

  d.tables.forEach(tInfo => {
    const key = `${tInfo.db}::${tInfo.name}`;
    const tData = tableMap[key] || specialTables[key] || tableMap[`brian.db::${tInfo.name}`] || tableMap[`brian_log.db::${tInfo.name}`] || tableMap[`graph.db::${tInfo.name}`];

    md += `<a id="table-${tInfo.name.replace(/_/g, '-')}"></a>\n\n`;
    md += `#### 3.${dIdx + 1}.${tInfo.name} (\`${tInfo.name}\`)\n\n`;
    md += `- **所属数据库**: \`${tInfo.db}\`\n`;
    md += `- **二分分类**: \`${tInfo.type}\`\n`;
    md += `- **业务职责**: ${tInfo.desc}\n\n`;

    if (!tData) {
      md += `*注：该表为逻辑定义或动态表，由系统启动时根据配置加载。*\n\n`;
      return;
    }

    // Columns table
    md += `**字段定义列表**:\n\n`;
    md += `| 列名 | 数据类型 | 允许为空 | 默认值 | 主键 | 业务含义与约束说明 |\n`;
    md += `|---|---|---|---|---|---|\n`;
    tData.columns.forEach(col => {
      const isPk = col.pk > 0 ? '✅ PK' : '-';
      const isNullable = col.notnull === 0 ? 'NULL' : '**NOT NULL**';
      const dflt = col.dflt_value !== null ? `\`${col.dflt_value}\`` : '-';
      const desc = formatFieldDesc(tInfo.name, col);
      md += `| \`${col.name}\` | \`${col.type || 'ANY'}\` | ${isNullable} | ${dflt} | ${isPk} | ${desc} |\n`;
    });
    md += '\n';

    // Indexes table
    if (tData.indexes && tData.indexes.length > 0) {
      md += `**索引定义列表**:\n\n`;
      md += `| 索引名称 | 唯一性 | 包含字段 | 优化场景与作用 |\n`;
      md += `|---|---|---|---|\n`;
      tData.indexes.forEach(idx => {
        const uq = idx.unique ? '✅ UNIQUE' : '普通索引';
        const cols = idx.columns.map(c => `\`${c}\``).join(', ');
        const idxDesc = idx.desc || `加速基于 ${cols} 的条件过滤与范围检索`;
        md += `| \`${idx.name}\` | ${uq} | ${cols} | ${idxDesc} |\n`;
      });
      md += '\n';
    }

    // Foreign Keys
    if (tData.foreignKeys && tData.foreignKeys.length > 0) {
      md += `**外键与关联约束**:\n\n`;
      md += `| 关联本表字段 | 目标数据表 | 目标字段 | 级联操作 |\n`;
      md += `|---|---|---|---|\n`;
      tData.foreignKeys.forEach(fk => {
        md += `| \`${fk.from}\` | \`${fk.table}\` | \`${fk.to}\` | ON DELETE ${fk.on_delete} |\n`;
      });
      md += '\n';
    }

    // DDL block
    if (tData.sql) {
      md += `<details>\n<summary><b>查看 DDL 创建语句</b></summary>\n\n\`\`\`sql\n${tData.sql}\n\`\`\`\n\n</details>\n\n`;
    }
  });

  md += '---\n\n';
});

// Chapter 4
md += '## 第四章：实体拓扑与关联关系图 (Mermaid)\n\n';

md += '### 4.1 问答、执行与上下文装配主链\n\n';
md += '展示用户请求、执行步骤流水、上下文装配映射与 LLM 调用计量的核心数据关系：\n\n';
md += '```mermaid\nerDiagram\n';
md += '    dialog_record ||--o{ context_org : "被作为上下文装配"\n';
md += '    dialog_record ||--o{ execute_record : "同 work_id 执行流水"\n';
md += '    dialog_record ||--o{ info_summary_record : "1:1 生成长文摘要"\n';
md += '    execute_record ||--o{ runtime_message_part_record : "通过 execute_id 关联工具执行"\n';
md += '    runtime_run_record ||--o{ run_round_org : "组织每轮执行步骤"\n';
md += '    run_round_org ||--o| llm_call_record : "关联单次模型调用"\n';
md += '    llm_call_record ||--|| llm_call_detail_record : "1:1 存储调用原文"\n';
md += '    llm_call_record }o--|| llm_available_record : "使用可用模型"\n';
md += '    llm_available_record }o--|| llm_provider_record : "归属供应商"\n';
md += '```\n\n';

md += '### 4.2 Agent 与能力组件装配拓扑\n\n';
md += '展示 Agent 定义与其动态绑定的 Skill、Soul、MCP 及策略的组织关系：\n\n';
md += '```mermaid\nerDiagram\n';
md += '    agent_record ||--o{ agent_skill_org : "绑定技能"\n';
md += '    agent_record ||--o{ agent_soul_org : "绑定人设心智"\n';
md += '    agent_record ||--o{ agent_mcp_org : "绑定 MCP 服务"\n';
md += '    agent_record ||--o{ agent_strategy_record : "配置编排策略"\n';
md += '    agent_record ||--o{ agent_evaluation_record : "Evolutor 评估记录"\n';
md += '    agent_record ||--o{ agent_execution_trace_record : "记录执行轨迹"\n';
md += '    agent_skill_org }o--|| skill_record : "引用技能事实"\n';
md += '    agent_soul_org }o--|| soul_record : "引用人设事实"\n';
md += '    agent_mcp_org }o--|| mcp_install_record : "引用安装实例"\n';
md += '```\n\n';

md += '### 4.3 TraceBase 全链路用量统计拓扑\n\n';
md += '展示全量组件调用事件如何汇聚至 `usage_event_record` 并日聚合为各类 `*_usage_org`：\n\n';
md += '```mermaid\nflowchart TD\n';
md += '    subgraph CallEvents [业务调用与 Token 计量]\n';
md += '        E1["Agent 执行"]\n';
md += '        E2["LLM 模型调用"]\n';
md += '        E3["Skill 技能执行"]\n';
md += '        E4["MCP 工具调用"]\n';
md += '        E5["Prompt 模板渲染"]\n';
md += '    end\n\n';
md += '    CallEvents -->|TraceService.recordUsage| UER[("usage_event_record (统一事件流水)")]\n\n';
md += '    subgraph DailyAggr [日聚合组织表 (*_usage_org)]\n';
md += '        UER -->|日聚合| AUO[("agent_usage_org")]\n';
md += '        UER -->|日聚合| LUO[("llm_usage_org")]\n';
md += '        UER -->|日聚合| SUO[("skill_usage_org")]\n';
md += '        UER -->|日聚合| MUO[("mcp_usage_org")]\n';
md += '        UER -->|日聚合| PUO[("prompt_template_usage_org")]\n';
md += '        UER -->|日聚合| LPUO[("llm_provider_usage_org")]\n';
md += '    end\n';
md += '```\n\n';

md += '### 4.4 知识图谱与向量索引拓扑\n\n';
md += '展示 LeanGraph 图拓扑、向量库与记忆问答实体的交叉索引关系：\n\n';
md += '```mermaid\nerDiagram\n';
md += '    nodes ||--o{ edges : "source_id / target_id"\n';
md += '    graph_node ||--o{ graph_edge : "from_node_id / to_node_id"\n';
md += '    graph_edge ||--o{ graph_activation_event : "触发激活流水"\n';
md += '    graph_edge ||--o{ graph_edge_daily_activation : "日激活频次聚合"\n';
md += '    dialog_record ||--o{ info_vector_record : "文本块向量 (SQLite 索引)"\n';
md += '    dialog_record ||--o{ vector_record : "高维向量数据 (LanceDB)"\n';
md += '    dialog_record ||--o{ info_tag_record : "关联标签"\n';
md += '    info_tag_record ||--o{ info_tag_vector_record : "标签向量"\n';
md += '```\n\n';

md += '---\n\n';

// Chapter 5
md += '## 第五章：数据库运维与高可用机制\n\n';
md += '### 5.1 SQLite WAL Checkpoint 与并发写机制\n\n';
md += '1. **WAL 模式与外键约束**：\n';
md += '   - 所有 SQLite 实例在启动时强制开启 `PRAGMA journal_mode = WAL;` 与 `PRAGMA foreign_keys = ON;`。\n';
md += '   - 读写互不阻塞：读事务不阻塞写，写事务不阻塞读，极大提升单机并发读取吞吐。\n';
md += '2. **启动与定时 Checkpoint**：\n';
md += "   - 系统每次在 `buildContext` 启动阶段执行 `walCheckpoint('TRUNCATE')`，将 WAL 缓存文件刷回主库并截断 WAL 文件，防止 WAL 无限膨胀。\n";
md += '3. **物理日志库隔离**：\n';
md += '   - 日志库 `brian_log.db` 独立存放高频日志与 Trace 事件，彻底隔绝日志写入对业务主库 `brian.db` 的事务锁影响。\n\n';

md += '### 5.2 零依赖 100% 本机冷备与恢复\n\n';
md += '1. **整库物理冷备**：\n';
md += '   - 备份命令：直接拷贝 `data/` 目录（包含 `brian.db`、`brian_log.db`、`graph.db` 与 `vectordb/`）。\n';
md += '   - 恢复命令：停止进程后覆盖还原 `data/` 目录即可恢复全部会话、记忆与模型配置，无需任何复杂的 SQL 导入导出或外部服务依赖。\n';
md += '2. **数据完整性校验**：\n';
md += '   - 运行阶段各 Provider 均维护 Schema 幂等检查与版本校验，保证数据升级零丢失、结构可自愈。\n\n';

fs.writeFileSync('_12_db_schema.md', md, 'utf8');
console.log('_12_db_schema.md generated successfully. Size:', md.length, 'bytes');
