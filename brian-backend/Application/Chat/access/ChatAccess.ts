/**
 * @fileoverview Chat Application 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化 chat_session / chat_config 表结构（ChatSchemaInitializer）；
 * 2. 封装 application 层 ChatService，提供统一签名方法入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面。
 */

import { Metrics, Report } from '@brian-agent/base';
import type { RelationDBAccess, StreamAccess, Logger } from '@brian-agent/base';
import { AopProxy } from '@brian-agent/base';
import type { ChatRuntimeV2Deps } from '../application/ChatService';
import type { InfoCoreAccess } from '@brian-agent/core';
import { ChatSchemaInitializer } from '../infrastructure/ChatSchemaInitializer';
import { ChatService } from '../application/ChatService';
import {
  ChatContext,
  CreateSessionInput, CreateSessionOutput,
  DeleteSessionInput, DeleteSessionOutput,
  PurgeOrphanSessionsInput, PurgeOrphanSessionsOutput,
  SearchSessionInput, SearchSessionOutput,
  GetSessionDetailInput, GetSessionDetailOutput,
  UpdateSessionTitleInput, UpdateSessionTitleOutput,
  CheckSessionOverflowInput, CheckSessionOverflowOutput,
  GetChatHistoryInput, GetChatHistoryOutput,
  SearchMessageInput, SearchMessageOutput,
  PinMessageInput, PinMessageOutput,
  GetMessageGraphInput, GetMessageGraphOutput,
  ConfigChatInput, ConfigChatOutput,
  OpenChatStreamInput, OpenChatStreamOutput,
  SSEEvent,
} from '../domain/types';

/**
 * Chat Application 接入层：系统最上层用户交互入口。
 *
 * 覆盖 SSE 问答流（Runtime v2 编排内核）、会话管理（创建/删除/搜索/详情/
 * 溢出检查/孤儿清理）、消息管理（历史/搜索/钉住/引用图）与模块配置。
 * 不直接调用 LLM/Skill/MCP，编排一律经 Runtime v2 提交。
 */
export class ChatAccess {
  private readonly service: ChatService;

  /**
   * @param relationDb 关系数据库接入层（表结构初始化与会话/配置元数据读写）
   * @param infoCore InfoCore 接入层（记忆数据读写、消息搜索、引用图）
   * @param logger 可选日志记录器
   * @param streamAccess 可选流推送接入层（SSE 事件持久化与端点投递）
   * @param runtime 可选 Runtime v2 依赖（网关 + 会话）；未装配时 openChatStream 抛错
   */
  constructor(
    relationDb: RelationDBAccess,
    infoCore: InfoCoreAccess,
    logger?: Logger,
    streamAccess?: StreamAccess,
    runtime?: ChatRuntimeV2Deps,
  ) {
    new ChatSchemaInitializer(relationDb).init();
    const raw = new ChatService(relationDb, infoCore, logger, streamAccess, runtime);
    this.service = AopProxy.wrap(raw, { logger });
  }

  /**
   * 创建新会话并写入 chat_session 表。
   *
   * session_id 由 IdGenerator 生成；session_title 缺省为「新会话」，
   * 首条消息提交时若仍为占位名，会自动截取消息前 50 字符覆盖（PRD §3.3.1.1）。
   *
   * @param input session_title（可选）：会话标题
   * @param output 回传 session_id、session_title、created（创建时间毫秒）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 创建完成返回 true
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.3.1
   */
  async createSession(i: CreateSessionInput, o: CreateSessionOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.createSession(i, o, c, metrics, report);
  }

  /**
   * 批量删除会话并级联清理全部关联数据。
   *
   * 逐会话清理：反馈记录（feedback_record / feedback_process_log，失败跳过）、
   * 记忆数据（经 InfoCore.delInfoBySession：info_raw 及派生表、上下文快照、
   * GraphDB 引用边）、chat_session 行、WriterAgent 写作偏好与思考过程数据
   * （stream_event、runtime_* 派生表）；单会话失败记日志跳过，不中断批次。
   *
   * @param input session_ids：要删除的会话 ID 列表，空数组抛 ValidationError
   * @param output 回传 deleted_count（实际删除的会话数）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 批次处理完成返回 true（含部分会话失败跳过场景）
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.3.2
   */
  async deleteSession(i: DeleteSessionInput, o: DeleteSessionOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.deleteSession(i, o, c, metrics, report);
  }

  /**
   * 清理孤儿会话记忆：info_raw 中 session_id 已不存在于 chat_session 的残留记录。
   *
   * 以 chat_session 为唯一存活集合求差集；dry_run=true 仅统计不删除；
   * 实际清理复用 deleteSession 的级联逻辑，保证与单次会话删除行为一致。
   * 供服务启动与每日定时任务调用，不对外暴露 HTTP 端点。
   *
   * @param input dry_run（可选）：仅扫描统计不执行删除
   * @param output 回传 purged_count 与 purged_session_ids（dry_run 下为识别结果）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 清理完成返回 true
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.3.2.1
   */
  async purgeOrphanSessions(i: PurgeOrphanSessionsInput, o: PurgeOrphanSessionsOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.purgeOrphanSessions(i, o, c, metrics, report);
  }

  /**
   * 检索会话列表：关键词/时间范围过滤 → 分页查询 → 批量聚合统计 → 摘要映射。
   *
   * 关键词同时匹配会话标题与消息内容，过滤无命中短路返回空页；
   * 问答次数/标签/token/消息数/最后消息均为批量聚合（消除逐会话 N+1），
   * 单项查询失败按口径降级（统计 0、标签空）不阻断；排序默认 updated DESC。
   *
   * @param input keyword、start_time/end_time（毫秒）、order_by、page_current/page_size 均可选
   * @param output 回传 sessions（含聚合统计的会话摘要列表）与 total（过滤后总数）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 检索完成返回 true（含空结果）
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.3.3
   */
  async soSession(i: SearchSessionInput, o: SearchSessionOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSession(i, o, c, metrics, report);
  }

  /**
   * 查询单个会话详情（含消息数量统计）。
   *
   * 会话不存在抛 NotFoundError；消息计数失败降级为 0，不阻断查询。
   *
   * @param input session_id：会话 ID
   * @param output 回传 session（会话行全量字段 + message_count）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 查询完成返回 true
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.3.4
   */
  async soSessionDetail(i: GetSessionDetailInput, o: GetSessionDetailOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soSessionDetail(i, o, c, metrics, report);
  }

  /**
   * 更新会话标题（手动修改通道；自动生成规则见 PRD §3.3.1.1）。
   *
   * session_id 缺失或标题空白抛 ValidationError；标题先 trim 再落库并刷新
   * updated；会话不存在（影响行数为 0）抛 NotFoundError。
   *
   * @param input session_id 与 session_title（均必填）
   * @param output 无业务回传字段
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 更新成功返回 true
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.3.5
   */
  async updateSessionTitle(i: UpdateSessionTitleInput, o: UpdateSessionTitleOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateSessionTitle(i, o, c, metrics, report);
  }

  /**
   * 检查会话消息数量是否超出上限。
   *
   * 上限读 chat_config.max_messages_per_session（缺省 1000），消息数统计自
   * info_raw；两类查询失败分别降级为默认上限与 0 条，不抛错。
   * openChatStream 在提交问答前自动调用，溢出时拒绝新消息。
   *
   * @param input session_id：会话 ID
   * @param output 回传 is_overflowed、message_count、max_messages
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 判定完成返回 true
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.3.6
   */
  async checkSessionOverflow(i: CheckSessionOverflowInput, o: CheckSessionOverflowOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.checkSessionOverflow(i, o, c, metrics, report);
  }

  /**
   * 查询会话/工作维度的消息历史，并附每条消息的引用与被引用关联。
   *
   * lastN 缺省读 chat_config.default_history_lastN（缺省 50）；lastNInfo 取数后
   * 支持内存分页；引用边批量查询（soCitationEdges）失败降级为无引用关联。
   * 中间过程消息（THINK/SKILL/MCP/ACT）不在此返回，由思考过程接口承载。
   *
   * @param input session_id/work_id/run_id 过滤可选；lastN、page_current/page_size 可选
   * @param output 回传 messages（含 pin、citing/cited 计数与关联 ID 列表）与 total（取回总条数）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 查询完成返回 true
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.4.1
   */
  async soChatHistory(i: GetChatHistoryInput, o: GetChatHistoryOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soChatHistory(i, o, c, metrics, report);
  }

  /**
   * 按关键词搜索消息（可限定会话范围），附消息摘要并分页返回。
   *
   * keyword 空白抛 ValidationError；候选集来自 InfoCore.keywordKInfo，
   * 指定 session_id 后在结果中二次过滤；单条摘要查询失败降级为空串。
   *
   * @param input keyword（必填）；session_id、page_current/page_size 可选
   * @param output 回传 messages（info_id/类型/角色/内容/summary/created/session_id）与 total
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 搜索完成返回 true（含空结果）
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.4.2
   */
  async soMessage(i: SearchMessageInput, o: SearchMessageOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMessage(i, o, c, metrics, report);
  }

  /**
   * 切换消息钉住状态（钉住 ↔ 取消钉住）。
   *
   * 先读当前 pin 状态（读取失败按未置顶处理），经 InfoCore.pinInfo 切换；
   * info_id 缺失抛 ValidationError；切换失败时 output.pin 保持原状态。
   *
   * @param input info_id：消息 ID
   * @param output 回传 pin（切换后的钉住状态）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 切换成功返回 true，失败返回 false
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.4.3
   */
  async pinMessage(i: PinMessageInput, o: PinMessageOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.pinMessage(i, o, c, metrics, report);
  }

  /**
   * 获取会话内消息的引用关系图结构（节点 + 引用边），供 ChatMap 可视化。
   *
   * session_id 缺失抛 ValidationError；数据来自 InfoCore.graphInfo，直接透传。
   *
   * @param input session_id：会话 ID
   * @param output 回传 graph_structure（nodes/edges）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 查询完成返回 true
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.4.4
   */
  async soMessageGraph(i: GetMessageGraphInput, o: GetMessageGraphOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soMessageGraph(i, o, c, metrics, report);
  }

  /**
   * 建立一次问答流式交互：校验后经 Runtime v2 编排内核提交问答并等待结算，
   * 全部 SSE 事件（Connected/Loading/Done/error.occurred 等）经 onEvent 实时
   * 回调并累积到 output.events；业务消息另经 Report→StreamProvider 推送到
   * input.stream_endpoint_id 指定的 SSE 端点。
   *
   * 会话不存在抛 NotFoundError；msg_content 为空、Runtime v2 未装配抛
   * ValidationError；会话消息超限推送 error.occurred（error_code=OVERFLOW），
   * run 结算超时（5 分钟）推送 error.occurred（error_code=RUN_TIMEOUT）。
   * 首条消息自动生成会话标题（占位名截取前 50 字符）；结算后将 runtime 消息
   * 同步到 info_raw 供历史查询（用户消息在提交时即时落库）。
   *
   * @param input 关键字段 session_id、msg_content（均必填）；stream_endpoint_id 指定 SSE 推送端点
   * @param output 回传 events（本次交互累积的全部 SSE 事件）
   * @param context 会话上下文（selected_msg_ids 等），供编排上下文构建使用
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms 并承载 trace_id
   * @param report 上报对象（SSE 通道），业务事件经 Report→StreamProvider 推送
   * @param onEvent 可选事件回调，每个 SSE 事件产生时实时触发
   * @returns 交互流程完成返回 true；业务失败通过 error.occurred 事件表达
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.1
   */
  async openChatStream(
    i: OpenChatStreamInput, o: OpenChatStreamOutput, c: ChatContext,
    metrics?: Metrics, report?: Report,
    onEvent?: (event: SSEEvent) => void,
  ): Promise<boolean> {
    return this.service.openChatStream(i, o, c, metrics, report, onEvent);
  }

  /**
   * 更新 Chat 模块配置（对内方法，由 Config Application 代理调用，无独立 HTTP 端点）。
   *
   * 可配置项：max_messages_per_session、sse_heartbeat_interval_ms、
   * default_history_lastN；仅更新传入字段，值必须为正数否则抛 ValidationError；
   * 返回合并后的完整配置快照。
   *
   * @param input 三个配置项均可选，仅传入字段参与校验与更新
   * @param output 回传 config（当前生效的完整配置）
   * @param context 会话上下文（当前未使用，保留统一签名）
   * @param metrics 衡量对象（耗时/日志），由 AOP 自动填充 elapsed_ms
   * @param report 上报对象（SSE 通道），无流会话时静默降级
   * @returns 配置完成返回 true
   * @see docs/_3_BackendDesign/_05_Application/Chat/Chat-PRD.md §3.7
   */
  async configChat(i: ConfigChatInput, o: ConfigChatOutput, c: ChatContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.configChat(i, o, c, metrics, report);
  }
}
