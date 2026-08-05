/**
 * @fileoverview Brian-Agent Core 层模块集合统一导出。
 *
 * Core 层在 Base 层 Provider 之上构建业务逻辑能力，包含 10 个模块：
 *
 * - StorageProvider：统一存储抽象（图/向量/时序存储）
 * - MQCoreProvider：消息队列 Worker 消费
 * - LLMCoreProvider：LLM 提供商选择与配额管理
 * - MCPCoreProvider：MCP 工具匹配与自动绑定
 * - SkillCoreProvider：Skill 匹配、优化与老化
 * - SoulCoreProvider：Soul 匹配、优化与老化
 * - ThinkingStrategyCoreProvider：思考策略匹配与执行
 * - InfoCoreProvider：信息生命周期管理（存/处理/搜索/老化）
 * - LearningCoreProvider：双模学习（主动/被动）+ 反馈子系统
 * - CognitiveCoreProvider：认知系统（自我意识/动机/反思/意义建构）
 * - CDTCoreProvider：浏览器拟人化操作、登录与会话管理
 *
 * 使用方式：
 * ```typescript
 * import { LLMCoreAccess, InfoCoreAccess } from '@brian-agent/core';
 *
 * const llmCore = new LLMCoreAccess(relationDb, llmAccess, promptsAccess);
 * await llmCore.initialize();
 *
 * const infoCore = new InfoCoreAccess(relationDb, llmAccess, promptsAccess, vectorDbAccess, graphDbAccess);
 * await infoCore.initialize();
 * ```
 */

export * from './shared';

// MQCoreProvider
export * from './MQCoreProvider';

// LLMCoreProvider
export * from './LLMCoreProvider';

// MCPCoreProvider
export * from './MCPCoreProvider';

// SkillCoreProvider
export * from './SkillCoreProvider';

// SoulCoreProvider
export * from './SoulCoreProvider';

// InfoCoreProvider
export * from './InfoCoreProvider';

// CDTCoreProvider
export * from './CDTCoreProvider';
