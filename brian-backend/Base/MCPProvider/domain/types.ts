import { Input, Context, Output } from '../../shared/base';
import type { Condition, OrderBy, Page } from '../../shared/query';

export class McpContext extends Context {}

export interface McpProviderData {
  
  provider_code?: string;
  
  mcp_provider_url: string;
  
  mcp_provider_title: string;
  
  mcp_provider_brief?: string;
  
  enable?: boolean;
}

export interface McpData {
  
  mcp_provider_id: string;
  
  mcp_title: string;
  
  mcp_brief?: string;
  
  mcp_install_cmd?: string;
  
  mcp_start_cmd?: string;
  
  mcp_stop_cmd?: string;
  
  mcp_uninstall_cmd?: string;
  
  version?: string;
  
  status?: string;
  
  enable?: boolean;
  
  transport_type?: string;
  
  transport_config?: string;
}

export interface McpProviderRecord extends McpProviderData {
  id: string;
  created: number;
  updated: number;
  enable: boolean;
}

export interface McpInstallRecord extends McpData {
  id: string;
  created: number;
  updated: number;
  version: string;
  status: string;
  enable: boolean;
}

export class AddMcpProviderInput extends Input {
  data!: McpProviderData;
}

export class AddMcpProviderOutput extends Output {
  id = '';
}

export class DelMcpProviderInput extends Input {
  ids?: string[];
  conditions?: Condition[];
}

export class DelMcpProviderOutput extends Output {
  affected_rows = 0;
}

export class UpdateMcpProviderInput extends Input {
  id!: string;
  data!: Partial<McpProviderData>;
}

export class UpdateMcpProviderOutput extends Output {}

export class SoMcpProviderInput extends Input {
  keyword?: string;
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}

export class SoMcpProviderOutput extends Output {
  list: McpProviderRecord[] = [];
  total = 0;
}

export class TestMcpProviderInput extends Input {
  id!: string;
}

export class TestMcpProviderOutput extends Output {
  connected = false;
  response_time_ms = 0;
}

export class ListMcpInput extends Input {
  mcp_provider_id!: string;
  page?: Page;
}

export class ListMcpOutput extends Output {
  list: Array<Record<string, unknown>> = [];
  total = 0;
}

export class InstallMcpInput extends Input {
  mcp_provider_id!: string;
  mcp_id!: string;
}

export class InstallMcpOutput extends Output {
  id = '';
}

export class StartMcpInput extends Input {
  id!: string;
}

export class StartMcpOutput extends Output {}

export class StopMcpInput extends Input {
  id!: string;
}

export class StopMcpOutput extends Output {}

export class StartMcpsInput extends Input {
  ids!: string[];
}

export class StartMcpsOutput extends Output {
  started_count = 0;
}

export class RefreshMcpStatusInput extends Input {}

export class RefreshMcpStatusOutput extends Output {
  removed = 0;
  running = 0;
  stopped = 0;
  total = 0;
}

export class UninstallMcpInput extends Input {
  id!: string;
}

export class UninstallMcpOutput extends Output {}

export class UpdateMcpInput extends Input {
  id!: string;
  data!: Partial<McpData>;
}

export class UpdateMcpOutput extends Output {}

export class UpgradeMcpInput extends Input {
  id!: string;
}

export class UpgradeMcpOutput extends Output {
  version = '';
}

export class GetMcpInput extends Input {
  id?: string;
  conditions?: Condition[];
}

export class GetMcpOutput extends Output {
  mcp: McpInstallRecord | null = null;
}

export class SoMcpInput extends Input {
  keyword?: string;
  conditions?: Condition[];
  order_by?: OrderBy[];
  page?: Page;
}

export class SoMcpOutput extends Output {
  list: McpInstallRecord[] = [];
  total = 0;
}

export class ExecMcpInput extends Input {
  id!: string;
  
  tool_name?: string;
  params!: Record<string, unknown>;
}

export class ExecMcpOutput extends Output {
  result: unknown = null;
  
  raw_response = '';
}

export class EnableMCPInput extends Input {
  enable!: boolean;
}

export class EnableMCPOutput extends Output {}

export class GetMcpUsageInput extends Input {
  mcp_install_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface McpUsageRecord {
  mcp_install_id: string;
  mcp_title: string;
  usage_date: string;
  usage_count: number;
}

export class GetMcpUsageOutput extends Output {
  list: McpUsageRecord[] = [];
  total = 0;
}

export const MCP_PROVIDER_TABLE = 'mcp_provider';
export const MCP_CACHE_TABLE = 'mcp_cache';
export const MCP_INSTALL_TABLE = 'mcp_install';
export const MCP_USAGE_TABLE = 'mcp_usage';
export const MCP_CONFIG_TABLE = 'mcp_config';
