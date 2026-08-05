/**
 * @fileoverview Brian-Agent Base 层 Provider 模块集合统一导出。
 *
 * 本包包含 9 个 Base 层 Provider 模块，均遵循 DDD 四层架构
 * （domain / application / infrastructure / access）：
 *
 * - RelationDBProvider：关系数据库操作（SQLite，基础模块）
 * - GraphDBProvider：图数据库操作（节点/边 CRUD、遍历、激活/老化）
 * - VectorDBProvider：向量数据库操作（存储、相似性搜索）
 * - LLMProvider：LLM 提供商与模型管理、推理调用
 * - MCPProvider：MCP 提供商与 MCP 管理、调用
 * - MQProvider：消息队列（发送、消费、确认、否认）
 * - PromptsProvider：Prompt 模板管理与渲染
 * - SkillProvider：Skill 管理与沙箱执行
 * - SoulProvider：Soul 数据管理
 * - LogProvider：日志管理（解耦日志和系统，提供 AOP 日志切面）
 * - CDTProvider：Chrome DevTools 协议管理（Chrome 启动/停止、CDP 通信）
 *
 * 使用方式：
 * ```typescript
 * import { RelationDBAccess, SoulAccess } from '@brian-agent/base';
 *
 * const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await relationDb.initialize();
 *
 * const soul = new SoulAccess(relationDb);
 * await soul.initialize();
 * ```
 */

// 共享内核
export * from './shared';

// RelationDBProvider（基础模块，其余 Provider 依赖它）
export * from './RelationDBProvider';

// GraphDBProvider
export * from './GraphDBProvider';

// VectorDBProvider
export * from './VectorDBProvider';

// LLMProvider
export * from './LLMProvider';

// MCPProvider
export * from './MCPProvider';

// MQProvider
export * from './MQProvider';

// PromptsProvider
export * from './PromptsProvider';

// SkillProvider
export * from './SkillProvider';

// SoulProvider
export * from './SoulProvider';

// LogProvider
export * from './LogProvider';

// CDTProvider
export * from './CDTProvider';

// BookmarkProvider
export * from './BookmarkProvider';
