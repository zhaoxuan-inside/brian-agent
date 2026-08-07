# 预编译原生模块存放目录

## 目录结构

```
prebuilt/
  {platform}-{arch}/         # 平台标识
    node{abi}/               # Node.js ABI 版本
      isolated_vm.node       # 原生模块二进制
```

其中：
- `platform`: `win32` | `linux` | `darwin`
- `arch`: `x64` | `arm64`
- `abi`: Node.js `process.versions.modules` 的值（如 `127`=Node v22.x）

## 如何为其他平台添加预编译二进制

### 方法 1：从 GitHub Releases 下载
```bash
# isolated-vm v5.0.4
# URL: https://github.com/laverdet/isolated-vm/releases/download/v5.0.4/
# 文件名: isolated-vm-v5.0.4-node-v{abi}-{platform}-{arch}.tar.gz

# 例如 Linux x64 Node v22:
curl -L https://github.com/laverdet/isolated-vm/releases/download/v5.0.4/isolated-vm-v5.0.4-node-v127-linux-x64.tar.gz | tar xz
mv out/isolated_vm.node prebuilt/linux-x64/node127/
```

### 方法 2：在目标平台上编译
```bash
cd vendor/isolated-vm
npm install    # 会自动运行 node-gyp rebuild
cp out/isolated_vm.node prebuilt/$(node -e "console.log(process.platform+'-'+process.arch)")/node$(node -e "console.log(process.versions.modules)")/
```

## 当前覆盖的平台

| 平台 | ABI | 状态 |
|------|-----|------|
| win32-x64 | 127 (Node v22) | 已就绪 |
| linux-x64 | 127 | 待添加 |
| darwin-x64 | 127 | 待添加 |
| darwin-arm64 | 127 | 待添加 |
