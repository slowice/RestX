# Provider 系统代理设计

## 背景

RestX 通过平台级 AI Provider 注册表统一管理手工 Provider 和自动导入的 Provider。当前 Provider 连接测试及各 AI 特性的实际请求使用 Node.js `fetch`，不会自动遵循操作系统代理配置，因此需要代理访问的 Google 等模型服务无法稳定使用。

本变更为每个 Provider 增加独立的“使用系统代理”配置。开启后，Provider 的连接测试和全部实际 AI 请求使用 Electron 原生网络栈，自动遵循操作系统代理、PAC、自动发现和代理认证；关闭后继续使用现有 Node.js 直连路径。

## 目标

- 所有 Provider 都能独立开启或关闭系统代理，包括手工 Provider和自动导入的 Provider。
- 连接测试与实际 AI 调用共享相同的网络选择逻辑。
- 现有 Provider 升级后保持直连，新建 Provider 也默认直连。
- 代理失败时给出可理解的网络错误，不静默绕过用户选择。
- 不泄露 API Key、代理凭据、PAC 内容或代理地址。

## 非目标

- 不允许用户在 RestX 内录入代理地址、用户名或密码。
- 不修改操作系统代理配置。
- 不为 GitCode、CodeHub 等非 AI Provider 网络请求增加代理开关。
- 不根据 Provider 名称或域名自动启用代理。

## 用户体验

每张 Provider 卡片显示“系统代理”开关。该开关不依赖 Provider 的凭据编辑权限，因此手工 Provider 和自动导入的 Provider 都可操作。

开关默认关闭。切换成功后立即更新卡片状态，后续请求使用新设置；已经发出的请求不受影响。切换失败时恢复原状态并显示错误。

开启后完全遵循操作系统代理解析结果。PAC 对目标 URL 返回 `DIRECT` 时允许直连；系统代理不可达时请求失败，不自动回退到 Node.js 直连。

## 架构

### Provider 契约与存储

在 AI Provider 公共状态、内部存储和已解析 Provider 中增加布尔字段 `useSystemProxy`。创建与完整编辑输入不接收该字段，代理偏好只通过独立窄接口修改。

注册表读取旧记录时把缺失字段解释为 `false`，无需一次性重写用户存储。新建 Provider 显式保存 `false`。自动刷新外部 Provider 时保留已有的 `useSystemProxy`；首次导入时使用 `false`。

代理选择不改变模型输入或输出语义，因此 `identityFingerprint` 和结果缓存键不包含该字段。

### 独立配置入口

新增窄接口 `setSystemProxy(id, enabled)`，而不是复用手工 Provider 的完整编辑接口。这样自动导入的 Provider 仍保持凭据和服务参数只读，同时允许 RestX 管理自己的网络路由偏好。

主进程 IPC 严格校验 Provider ID 和布尔值。Renderer 只获得公共布尔状态，不接触解析后的代理地址或认证信息。

### 统一请求上下文

Provider 注册表在执行指定 Provider 时构造主进程请求上下文：

- `provider`: 已解析的 Provider 元数据和凭据。
- `fetch`: 由 `useSystemProxy` 选择的请求函数。

关闭代理时使用现有 Node.js `fetch`。开启代理时使用 Electron `net.fetch`，由 Chromium 原生网络栈读取系统代理。

所有通过 Provider 注册表执行的连接测试、配置分析、智能导入、代码 Review 和知识分类等 AI 调用都使用该上下文中的请求函数。业务特性继续负责提示词、响应解析和业务错误，不自行判断代理设置。

## 数据流

1. 用户切换某张 Provider 卡片的系统代理开关。
2. Renderer 调用白名单 Provider IPC。
3. 主进程校验输入并持久化 `useSystemProxy`。
4. 后续 AI 调用通过注册表解析当前或指定 Provider。
5. 注册表根据 `useSystemProxy` 注入 Node.js `fetch` 或 Electron `net.fetch`。
6. 业务调用沿用现有超时、认证、协议和响应校验。

## 错误处理与安全

- Provider 不存在时返回现有 `NOT_FOUND` 类错误。
- 非布尔开关值在 IPC 边界拒绝。
- 系统代理连接失败沿用现有可理解的连接失败或超时提示。
- 不在错误消息、日志或遥测中记录 API Key、系统代理地址、PAC 内容或认证数据。
- 不静默改为直连，避免违背用户明确的网络路径选择。

## 兼容性

- 旧 Provider 缺少字段时等价于关闭，不改变升级前行为。
- Provider store 仍保持向后可读，无需迁移 API Key 或重新选择当前 Provider。
- 自动导入 Provider 刷新时保留用户的代理偏好。
- 公共 API 只增加字段和窄方法，不删除现有方法。

## 测试与验收

自动化测试覆盖：

- 旧记录默认关闭、新记录默认关闭，以及开关持久化。
- 自动导入 Provider 刷新后保留开关。
- IPC 输入校验和 preload 方法映射。
- 关闭时选择 Node.js `fetch`，开启时选择 Electron `net.fetch`。
- 连接测试和各 AI 业务调用使用注册表注入的请求函数。
- 设置页为所有 Provider 展示开关并正确处理成功与失败。
- 日志和错误不包含代理或凭据敏感信息。

完成实现后执行 `pnpm test`、`pnpm typecheck`、`pnpm build` 和 `git diff --check`。由于本变更涉及可见 UI，还需在隔离 renderer 环境进行视觉验收；同时启动应用验证主窗口、Provider 设置页和进程正常退出。打包及操作系统级代理实网验证不在默认范围内。
