/**
 * @fileoverview LLM 提供商多态策略接口与类型定义。
 *
 * 遵循策略模式（Strategy Pattern），将不同模型提供商（OpenAI、Google、Anthropic、Ollama 等）
 * 在请求路径、鉴权头部、消息体转换以及响应解析上的差异封装为独立策略。
 */

import type {
  LLMProviderRecord,
  LLMAvailableRecord,
  ExecLLMInput,
  ExecLLMEventsInput,
  EmbedLLMInput,
} from '../../domain/types';

/** HTTP 请求配置对象 */
export interface HttpRequestOptions {
  /** 目标请求 URL（含 query 参数） */
  url: string;
  /** HTTP 请求方法（GET、POST 等） */
  method: string;
  /** HTTP 请求头 */
  headers: Record<string, string>;
  /** 请求体（若有） */
  body?: string;
}

/** 解析后的单个模型项 */
export interface ParsedModelItem {
  /** 模型标识符（如 'gpt-4o'、'gemini-1.5-pro'） */
  modelId: string;
  /** 模型显示名称 */
  displayName?: string;
  /** 模型简要描述 */
  description?: string;
  /** 最大 Token 上限 */
  maxTokens?: number;
  /** 原始返回对象 */
  raw: Record<string, unknown>;
}

/** 对话补全响应解析结果 */
export interface ParsedChatResult {
  /** 模型输出文本内容 */
  content: string;
  /** 输入消耗 Token 数 */
  inputTokens: number;
  /** 输出生成 Token 数 */
  outputTokens: number;
}

/** 向量化响应解析结果 */
export interface ParsedEmbedResult {
  /** 向量数据 */
  embedding: number[];
  /** 输入消耗 Token 数 */
  inputTokens: number;
}

/**
 * LLM 提供商策略接口。
 */
export interface ILLMProviderStrategy {
  /** 策略唯一标识名称（如 'openai', 'google', 'anthropic', 'ollama'） */
  readonly name: string;

  /**
   * 判断当前策略是否匹配指定的 LLM 提供商记录。
   *
   * @param provider LLM 提供商记录
   */
  supports(provider: LLMProviderRecord): boolean;

  /**
   * 构造连通性测试请求。
   *
   * @param provider LLM 提供商记录
   */
  buildTestRequest(provider: LLMProviderRecord): HttpRequestOptions;

  /**
   * 构造获取可用模型列表请求。
   *
   * @param provider LLM 提供商记录
   */
  buildListModelsRequest(provider: LLMProviderRecord): HttpRequestOptions;

  /**
   * 解析模型列表 API 响应。
   *
   * @param json 已反序列化的响应 JSON（若解析失败则为空对象）
   * @param rawText 原始响应文本
   */
  parseListModelsResponse(json: unknown, rawText: string): ParsedModelItem[];

  /**
   * 构造对话推理（Chat Completion / Messages）请求。
   *
   * @param provider LLM 提供商记录
   * @param model 可用模型记录
   * @param input 对话入参
   */
  buildChatRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: ExecLLMInput,
  ): HttpRequestOptions;

  /**
   * 解析对话推理响应。
   *
   * @param json 已反序列化的响应 JSON
   * @param rawText 原始响应文本
   */
  parseChatResponse(json: unknown, rawText: string): ParsedChatResult;

  /**
   * 构造原生消息 + 原生工具调用（execLLMEvents）请求。
   *
   * Runtime v2 · 阶段 0（Loop-PRD §4）：面向 OpenAI 兼容 wire 格式，
   * tools 经 JSON Schema 直传；本阶段不做 Anthropic/Google 原生格式转换
   * （与既有流式路径边界一致）。
   *
   * @param provider LLM 提供商记录
   * @param model 可用模型记录
   * @param input execLLMEvents 入参
   */
  buildChatEventsRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: ExecLLMEventsInput,
  ): HttpRequestOptions;

  /**
   * 构造向量化（Embedding）请求。
   *
   * @param provider LLM 提供商记录
   * @param model 可用模型记录
   * @param input 向量化入参
   */
  buildEmbedRequest(
    provider: LLMProviderRecord,
    model: LLMAvailableRecord,
    input: EmbedLLMInput,
  ): HttpRequestOptions;

  /**
   * 解析向量化响应。
   *
   * @param json 已反序列化的响应 JSON
   * @param rawText 原始响应文本
   */
  parseEmbedResponse(json: unknown, rawText: string): ParsedEmbedResult;
}
