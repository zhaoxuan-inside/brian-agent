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
| isolated-vm | 5.0.4 | ✓ | ✓ | ○* | ✓ |

- ✓ 离线预编译包已就绪
- ○ 上游未发布该平台的 Node v22 (ABI 127) 预编译包
- ○* isolated-vm darwin-x64：**上游从未发布过该平台的 Node v22 (ABI 127) 预编译包**——已核查上游全部 Release（v4.6.0 → v6.0.2），darwin-x64 预编译仅存在于 v4.6.0/v4.7.2 且 ABI 为 93/108/115（Node 16/18/19），与本仓库 .nvmrc（Node 22.22.1，ABI 127）物理不兼容（isolated-vm 为 V8 直接绑定、非 N-API，ABI 不可混用），**降级使用旧版预编译不可行**。v5.0.4 源码官方支持 darwin-x64（binding.gyp MACOSX_DEPLOYMENT_TARGET=10.12，mac-x64 上 `npm install isolated-vm` 即为源码编译官方路径）。沙箱保障链：运行时由 vendored loader（`sandbox/vendor/isolated-vm/isolated-vm.js`）自动从源码编译兜底（node-gyp 三级解析：仓库 node_modules → 全局 PATH → `npx --yes node-gyp` 在线获取，便携包自带 Node 运行时必有 npx；需 C/C++ 工具链与 Python 3，产物缓存到 `vendor/isolated-vm/out/`）；维护者可在 Intel Mac 上执行 `node brian-backend/scripts/build-isolated-vm.js` 一键产出并提交入库，实现该平台离线覆盖。Win / macOS(arm64) / Linux 三平台沙箱始终由离线预编译直接保障

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
