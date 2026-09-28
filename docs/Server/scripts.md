# Server / scripts

- 层：**Server**　模块：**scripts**
- 方法数：**7**（逻辑控制 1 · 数据处理 5 · 通用算法 1）

## 文件 `brian-backend/scripts/build-isolated-vm.js`

### 模块级函数

#### `log`

- **类型**：逻辑控制
- **说明**：写入/新增相关数据
- **签名**：`log(msg: unknown)`
- **位置**：brian-backend/scripts/build-isolated-vm.js:22
- **引用次数**：153

#### `fail`

- **类型**：数据处理
- **说明**：处理 失败
- **签名**：`fail(msg: unknown)`
- **位置**：brian-backend/scripts/build-isolated-vm.js:23
- **引用次数**：38

#### `resolveNodeGyp`

- **类型**：数据处理
- **说明**：获取：节点 / gyp（文件系统）
- **签名**：`resolveNodeGyp()`
- **位置**：brian-backend/scripts/build-isolated-vm.js:45
- **引用次数**：2

## 文件 `brian-backend/scripts/copy-prebuilt.js`

### 模块级函数

#### `copyIfNeeded`

- **类型**：数据处理
- **说明**：处理 复制 / needed（文件系统）
- **签名**：`copyIfNeeded(src: unknown, dest: unknown, label: unknown)`
- **位置**：brian-backend/scripts/copy-prebuilt.js:24
- **引用次数**：4

#### `resolvePrebuilt`

- **类型**：通用算法
- **说明**：获取：prebuilt（纯计算，无外部 IO）
- **签名**：`resolvePrebuilt(moduleName: unknown, fileName: unknown)`
- **位置**：brian-backend/scripts/copy-prebuilt.js:42
- **引用次数**：4

## 文件 `brian-backend/scripts/e2e-cdt-profile-snapshot.mjs`

### 模块级函数

#### `assert`

- **类型**：数据处理
- **说明**：处理 assert
- **签名**：`assert(cond: unknown, msg: unknown)`
- **位置**：brian-backend/scripts/e2e-cdt-profile-snapshot.mjs:26
- **引用次数**：8

## 文件 `brian-backend/scripts/fix-matching-prompts.mjs`

### 模块级函数

#### `apply`

- **类型**：数据处理
- **说明**：更新相关数据
- **签名**：`apply(templateId: unknown, brief: unknown, content: unknown, marker: unknown)`
- **位置**：brian-backend/scripts/fix-matching-prompts.mjs:100
- **引用次数**：9

