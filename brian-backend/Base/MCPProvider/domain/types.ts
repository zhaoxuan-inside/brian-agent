/**
 * @fileoverview MCPProvider 领域层类型定义。
 *
 * 依据 `MCPProvider-PRD.md` 定义 McpContext、McpProviderData、McpData
 * 及各功能的 Input / Output 类型。
 */

import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

/**
 * MCP 上下文（McpContext）。
 */
export class McpContext extends Context {}

/**
 * MCP 提供商数据对象（McpProviderData）。
 *
 * 用于新增 MCP 提供商；更新时使用 Partial。
 */
export interface McpProviderData {
  /** MCP 提供商地址 */
  mcp_provider_url: string;
  /** MCP 提供商名称 */
  mcp_provider_title: string;
  /** MCP 提供商摘要 */
  mcp_provider_brief?: string;
  /** 是否启用，默认 true */
  enable?: boolean;
}

/**
 * MCP 数据对象（McpData）。
 *
 * 用于安装 MCP；更新时使用 Partial。
 */
export interface McpData {
  /** MCP 提供商 ID，关联 mcp_provider.id */
  mcp_provider_id: string;
  /** MCP 名称 */
  mcp_title: string;
  /** MCP 摘要 */
  mcp_brief?: string;
  /** MCP 安装命令 */
  mcp_install_cmd?: string;
  /** MCP 启动命令 */
  mcp_start_cmd?: string;
  /** MCP 停止命令 */
  mcp_stop_cmd?: string;
  /** MCP 卸载命令 */
  mcp_uninstall_cmd?: string;
  /** 是否启用，默认 true */
  enable?: boolean;
}

/** mcp_provider 表记录 */
export interface McpProviderRecord extends McpProviderData {
  id: string;
  created: number;
  updated: number;
  enable: boolean;
}

/** mcp_install 表记录 */
export interface McpInstallRecord extends McpData {
  id: string;
  created: number;
  updated: number;
  enable: boolean;
}

// ---------------------------------------------------------------------------
// MCP 提供商管理
// ---------------------------------------------------------------------------

/** addMcpProvider 入参 */
export class AddMcpProviderInput extends Input {
  data!: McpProviderData;
}
/** addMcpProvider 出参 */
export class AddMcpProviderOutput extends Output {
  id = '';
}

/** delMcpProvider 入参 */
export class DelMcpProviderInput extends Input {
  ids?: string[];
  conditions?: Condition[];
}
/** delMcpProvider 出参 */
export class DelMcpProviderOutput extends Output {
  affected_rows = 0;
}

/** updateMcpProvider 入参 */
export class UpdateMcpProviderInput extends Input {
  id!: string;
  data!: Partial<McpProviderData>;
}
/** updateMcpProvider 出参 */
export class UpdateMcpProviderOutput extends Output {}

/** soMcpProvider 入参 */
export class SoMcpProviderInput extends Input {
  keyword?: string;
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}
/** soMcpProvider 出参 */
export class SoMcpProviderOutput extends Output {
  list: McpProviderRecord[] = [];
  total = 0;
}

/** testMcpProvider 入参 */
export class TestMcpProviderInput extends Input {
  id!: string;
}
/** testMcpProvider 出参 */
export class TestMcpProviderOutput extends Output {
  connected = false;
  response_time_ms = 0;
}

/** listMcp 入参 */
export class ListMcpInput extends Input {
  mcp_provider_id!: string;
  page?: Page;
}
/** listMcp 出参 */
export class ListMcpOutput extends Output {
  list: Array<Record<string, unknown>> = [];
  total = 0;
}

// ---------------------------------------------------------------------------
// MCP 管理
// ---------------------------------------------------------------------------

/** installMcp 入参 */
export class InstallMcpInput extends Input {
  mcp_provider_id!: string;
  mcp_id!: string;
}
/** installMcp 出参 */
export class InstallMcpOutput extends Output {
  id = '';
}

/** startMcp 入参 */
export class StartMcpInput extends Input {
  id!: string;
}
/** startMcp 出参 */
export class StartMcpOutput extends Output {}

/** stopMcp 入参 */
export class StopMcpInput extends Input {
  id!: string;
}
/** stopMcp 出参 */
export class StopMcpOutput extends Output {}

/** uninstallMcp 入参 */
export class UninstallMcpInput extends Input {
  id!: string;
}
/** uninstallMcp 出参 */
export class UninstallMcpOutput extends Output {}

/** updateMcp 入参 */
export class UpdateMcpInput extends Input {
  id!: string;
  data!: Partial<McpData>;
}
/** updateMcp 出参 */
export class UpdateMcpOutput extends Output {}

/** getMcp 入参 */
export class GetMcpInput extends Input {
  id?: string;
  conditions?: Condition[];
}
/** getMcp 出参 */
export class GetMcpOutput extends Output {
  mcp: McpInstallRecord | null = null;
}

/** soMcp 入参 */
export class SoMcpInput extends Input {
  keyword?: string;
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}
/** soMcp 出参 */
export class SoMcpOutput extends Output {
  list: McpInstallRecord[] = [];
  total = 0;
}

// ---------------------------------------------------------------------------
// MCP 调用
// ---------------------------------------------------------------------------

/** execMcp 入参 */
export class ExecMcpInput extends Input {
  id!: string;
  params!: Record<string, unknown>;
}
/** execMcp 出参 */
export class ExecMcpOutput extends Output {
  result: unknown = null;
}

// ---------------------------------------------------------------------------
// 可视化与运维
// ---------------------------------------------------------------------------

/** enableMCP 入参 */
export class EnableMCPInput extends Input {
  enable!: boolean;
}
/** enableMCP 出参 */
export class EnableMCPOutput extends Output {}

// ---------------------------------------------------------------------------
// 表名与默认配置
// ---------------------------------------------------------------------------

export const MCP_PROVIDER_TABLE = 'mcp_provider';
export const MCP_CACHE_TABLE = 'mcp_cache';
export const MCP_INSTALL_TABLE = 'mcp_install';
export const MCP_USAGE_TABLE = 'mcp_usage';
export const MCP_CONFIG_TABLE = 'mcp_config';

/** MCPProvider 默认配置项（PRD 4.5） */
export const MCP_DEFAULT_CONFIGS = [
  {
    config_key: 'enabled',
    config_value: 'true',
    value_type: 'BOOLEAN',
    description: 'MCP 组件是否启用（enableMCP 读写）',
  },
  {
    config_key: 'cache_ttl',
    config_value: '86400',
    value_type: 'INT',
    description: 'MCP 列表缓存有效期（秒，默认 1 天）',
  },
] as const;

/** 默认 MCP 市场提供商列表 */
export const MCP_DEFAULT_PROVIDERS: Array<{
  mcp_provider_url: string;
  mcp_provider_title: string;
  mcp_provider_brief: string;
  enable: boolean;
}> = [
  {
    mcp_provider_url: 'https://dashscope.aliyuncs.com',
    mcp_provider_title: '阿里云百炼',
    mcp_provider_brief: '阿里云 AI 平台的 MCP 服务市场',
    enable: true,
  },
  {
    mcp_provider_url: 'https://modelscope.cn',
    mcp_provider_title: 'ModelScope',
    mcp_provider_brief: '魔搭社区 MCP 广场，社区贡献的优质 MCP 服务器',
    enable: true,
  },
  {
    mcp_provider_url: 'https://api.smithery.ai',
    mcp_provider_title: 'Smithery',
    mcp_provider_brief: '全球 MCP 注册中心，自动 OAuth，支持 HTTP/SSE 连接',
    enable: true,
  },
  {
    mcp_provider_url: 'https://registry.npmjs.org',
    mcp_provider_title: 'GitHub',
    mcp_provider_brief: 'npm 生态的 MCP 服务器，通过 npx/uvx stdio 运行',
    enable: true,
  },
];
