# 原生模块预编译离线包

## 目录结构

```
prebuilt/
  {module}/
    {platform}-{arch}/
      node{abi}/
        {module}.node       # 原生模块二进制文件
```

## 支持模块

| 模块 | npm 包名 | 目标路径 (node_modules 中) |
|------|---------|---------------------------|
| better-sqlite3 | better-sqlite3 | better-sqlite3/build/Release/better_sqlite3.node |
| nodejieba | nodejieba | nodejieba/build/Release/nodejieba.node |
| lancedb | @lancedb/lancedb | @lancedb/lancedb/dist/lancedb.{triple}.node |
| isolated-vm | (vendor) | Base/SkillProvider/.../vendor/isolated-vm/out/isolated_vm.node |

## 如何为新平台/ABI 添加预编译二进制

### better-sqlite3
```bash
# 从 GitHub Releases 下载
# URL: https://github.com/WiseLibs/better-sqlite3/releases
# 文件名: better-sqlite3-v{version}-node-v{abi}-{platform}-{arch}.tar.gz
```

### nodejieba
```bash
# 从 GitHub Releases 下载
# URL: https://github.com/yanyiwu/nodejieba/releases
curl -L https://github.com/yanyiwu/nodejieba/releases/download/v3.5.8/nodejieba-v3.5.8-node-v{abi}-{platform}-{arch}-unknown.tar.gz | tar xz
mv Release/nodejieba.node prebuilt/nodejieba/{platform}-{arch}/node{abi}/
```

### lancedb
```bash
# 从 npm 下载平台特定包
npm pack @lancedb/lancedb-{platform}-{arch}-{libc}@0.15.0
tar xzf lancedb-lancedb-{platform}-{arch}-{libc}-0.15.0.tgz
mv package/*.node prebuilt/lancedb/{platform}-{arch}/node{abi}/
```

### isolated-vm
```bash
# 从 GitHub Releases 下载
# URL: https://github.com/laverdet/isolated-vm/releases
curl -L https://github.com/laverdet/isolated-vm/releases/download/v5.0.4/isolated-vm-v5.0.4-node-v{abi}-{platform}-{arch}.tar.gz | tar xz
mv out/isolated_vm.node prebuilt/isolated-vm/{platform}-{arch}/node{abi}/
```

## 当前覆盖状态

| 平台 | ABI | better-sqlite3 | nodejieba | lancedb | isolated-vm |
|------|-----|:---:|:---:|:---:|:---:|
| win32-x64 | 127 (Node v22) | ✓ | ✓ | ✓ | ✓ |
| linux-x64 | 127 | 待添加 | 待添加 | 待添加 | 待添加 |
| darwin-x64 | 127 | 待添加 | 待添加 | 待添加 | 待添加 |
| darwin-arm64 | 127 | 待添加 | 待添加 | 待添加 | 待添加 |

## 自动化

运行 `npm install` 时会自动触发 `postinstall` 脚本（`brian-backend/scripts/copy-prebuilt.js`），
将预编译二进制复制到 `node_modules` 对应位置。
