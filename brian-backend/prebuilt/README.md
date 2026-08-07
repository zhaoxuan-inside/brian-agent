# 原生模块预编译离线包

## 目录结构

```
prebuilt/
  {module}/
    {platform}-{arch}/
      node{abi}/
        {module}.node       # 原生模块二进制文件
```

## 自动化

运行 `npm install` 时自动触发 `postinstall` 脚本（`brian-backend/scripts/copy-prebuilt.js`），
将预编译二进制复制到 `node_modules` 对应位置。不需要任何手动操作。

## 覆盖状态

| 模块 | 版本 | win32-x64 | linux-x64 | darwin-x64 | darwin-arm64 |
|------|------|:---:|:---:|:---:|:---:|
| better-sqlite3 | 11.10.0 | ✓ | ✓ | ✓ | ✓ |
| nodejieba | 3.5.8 | ✓ | ✓ | ○ | ✓ |
| lancedb | 0.15.0 | ✓ | ✓ | ✓ | ✓ |
| isolated-vm | 5.0.4 | ✓ | ✓ | ○ | ✓ |

- ✓ 离线预编译包已就绪
- ○ 上游未发布该平台的 Node v22 (ABI 127) 预编译包；`npm install` 时将自动尝试 `node-gyp` 源码编译

## 如何添加新的平台/ABI 预编译包

### better-sqlite3
```bash
curl -L https://github.com/WiseLibs/better-sqlite3/releases/download/v11.10.0/better-sqlite3-v11.10.0-node-v{abi}-{platform}-{arch}.tar.gz | tar xz
cp build/Release/better_sqlite3.node prebuilt/better-sqlite3/{platform}-{arch}/node{abi}/
```

### nodejieba
```bash
# Linux: 使用 glibc 后缀
curl -L https://github.com/yanyiwu/nodejieba/releases/download/v3.5.8/nodejieba-v3.5.8-node-v{abi}-linux-x64-glibc.tar.gz | tar xz
# macOS / Windows: 使用 unknown 后缀
curl -L https://github.com/yanyiwu/nodejieba/releases/download/v3.5.8/nodejieba-v3.5.8-node-v{abi}-{platform}-{arch}-unknown.tar.gz | tar xz
cp Release/nodejieba.node prebuilt/nodejieba/{platform}-{arch}/node{abi}/
```

### lancedb
```bash
npm pack @lancedb/lancedb-{platform}-{arch}-{libc}@0.15.0
tar xzf lancedb-*.tgz
cp package/*.node prebuilt/lancedb/{platform}-{arch}/node{abi}/
```

### isolated-vm
```bash
curl -L https://github.com/laverdet/isolated-vm/releases/download/v5.0.4/isolated-vm-v5.0.4-node-v{abi}-{platform}-{arch}.tar.gz | tar xz
cp out/isolated_vm.node prebuilt/isolated-vm/{platform}-{arch}/node{abi}/
```
