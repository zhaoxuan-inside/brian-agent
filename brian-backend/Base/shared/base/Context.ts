/**
 * @fileoverview Context 基类定义。所有 Provider 的 Context 对象都必须继承此基类。
 *
 * 遵循 `_00_DevStandardization.md` 规范：所有 Context 都继承 Context 基类。
 * Context 表示方法执行时的运行环境上下文，与 Input（输入参数）和 Output（返回内容）分离。
 */

/**
 * Context 基类。
 *
 * 承载方法执行所需的运行环境信息，例如调用方身份、是否启用切面等。
 * 子类可在继承基础上扩展自身特有的上下文字段。
 *
 * 用法示例：
 * ```typescript
 * class SkillContext extends Context {
 *   sandbox_id?: string;
 * }
 * ```
 */
export class Context {
  /** 调用方标识，用于权限校验与日志追踪 */
  caller?: string;

  // ===== 问答业务维度（2026-09-14）：与 trace_id 可观测体系相互独立 =====
  // session_id（会话）→ run_id（一次问答，= runtime_run.id）→ work_id（一次 Agent/Tool 执行）
  // 三级维度随 Context 传播，LLMProvider 落账时统一读取，调用方无需逐层透传入参。

  /** 业务维度：会话标识（chat session_key） */
  session_id?: string;

  /** 业务维度：一次问答标识（= runtime_run.id） */
  run_id?: string;

  /** 业务维度：一次 Agent/Tool 执行标识（执行框架在执行前生成，Agent 私有） */
  work_id?: string;

  /** 是否启用 AOP 切面（日志记录、耗时统计），默认 true */
  enable_aop?: boolean;

  /** 请求开始时间戳（毫秒），由 AOP 层自动填充 */
  request_started_at?: number;
}
