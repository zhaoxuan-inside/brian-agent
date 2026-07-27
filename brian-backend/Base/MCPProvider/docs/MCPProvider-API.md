# MCPProvider API 文档

> 解耦 MCP 和系统，通过 Repository 设计模式为上层提供统一的 MCP 操作接口。
> MCP 管理分为两级：MCP 提供商（mcp_provider）-> MCP（mcp_cache / mcp_install）。

## 依赖

```typescript
import { RelationDBAccess } from '@brian-agent/base/RelationDBProvider';
import { MCPAccess } from '@brian-agent/base/MCPProvider';

const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
await relationDb.initialize();

const mcp = new MCPAccess(relationDb);
await mcp.initialize();
```

## MCP 提供商管理

### addMcpProvider - 新增 MCP 提供商
### delMcpProvider - 删除（级联清理 mcp_cache、mcp_install）
### updateMcpProvider - 更新（资源级启用/禁用通过修改 enable）
### soMcpProvider - 搜索（keyword 匹配 mcp_provider_title）
### testMcpProvider - 测试连接连通性
### listMcp - 获取 MCP 列表（优先缓存，过期调用提供商 API）

## MCP 管理

### installMcp - 安装（npm 安装 + 生成 start/stop/uninstall 命令）
```typescript
const output = new InstallMcpOutput();
await mcp.installMcp(
  { mcp_provider_id: 'provider-uuid', mcp_id: 'cache-uuid' },
  new McpContext(),
  output,
);
```

### startMcp / stopMcp / uninstallMcp - 启动/关闭/卸载
### updateMcp - 更新（资源级启用/禁用通过修改 enable）
### getMcp - 获取（按 ID 或条件）
### soMcp - 搜索（keyword 匹配 mcp_title、mcp_brief）

## MCP 调用

### execMcp - 调用 MCP
```typescript
const output = new ExecMcpOutput();
await mcp.execMcp(
  { id: 'install-uuid', params: { query: 'hello' } },
  new McpContext(),
  output,
);
console.log(output.result);
```

## 运维

### enableMCP - 启用/禁用组件

## 表结构

| 表名 | 说明 |
|------|------|
| mcp_provider | MCP 提供商 |
| mcp_cache | MCP 缓存（listMcp 获取后缓存） |
| mcp_install | 已安装的 MCP（含 start/stop/uninstall 命令） |
| mcp_usage | 使用统计（按天） |
| mcp_config | 配置表 |

## 默认配置

| config_key | config_value | value_type |
|------------|-------------|------------|
| enabled | true | BOOLEAN |
| cache_ttl | 86400 | INT |
