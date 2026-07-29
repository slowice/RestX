## Context

RestX 通过 `src/platform/ai-provider/` 的统一注册表向 AI Inspector、Code Review、知识分类和未来 AI 特性提供 Provider。当前已解析 Provider 只包含服务参数和凭据，各业务回调内部默认调用 Node.js `fetch`。该网络栈不会自动遵循操作系统代理，因此需要代理访问的模型服务无法正常工作；如果只修改连接测试，则还会产生测试成功但真实调用失败的不一致。

Electron 的 `net.fetch` 使用 Chromium 原生网络栈，能够自动处理操作系统代理、WPAD、PAC、HTTPS 隧道和常见代理认证。该能力只在 main 进程使用，符合现有 Provider 凭据边界。

## Goals / Non-Goals

**Goals:**

- 为每个 Provider 独立持久化系统代理偏好。
- 让手工和自动导入 Provider 都能配置 RestX 网络路由。
- 保证连接测试与真实 AI 请求使用同一网络选择。
- 保持旧配置、新配置、外部刷新和结果缓存兼容。
- 不向 renderer 或日志暴露代理与凭据信息。

**Non-Goals:**

- 不在 RestX 中提供自定义代理地址或代理凭据表单。
- 不修改操作系统代理设置。
- 不改变 GitCode、CodeHub 或其他非 AI Provider 网络请求。
- 不执行打包或真实外网代理验收，除非用户另行要求。

## Decisions

### 在 Provider 上保存 `useSystemProxy`

在公共状态、内部存储和 main 进程已解析 Provider 中增加布尔字段。旧记录缺失时读取为 `false`，新建和首次导入时显式使用 `false`。外部 Provider 刷新通过合并已有网络偏好避免覆盖用户选择。

代理偏好不进入 `identityFingerprint`。它只改变传输路径，不改变 Provider、模型或提示词语义；把它纳入缓存身份会产生无意义的缓存失效。

替代方案是按 Google 等来源硬编码代理，但这无法扩展到未来 Provider，也违反统一 Provider 架构。

### 使用独立的代理偏好更新接口

新增 `setSystemProxy(id, enabled)` 平台 API 和白名单 IPC。该接口只允许更新网络布尔值，并严格校验 Provider ID 与布尔类型。

不复用手工 Provider 的完整 `update`，因为自动导入 Provider 的服务参数和凭据必须继续只读，而网络路由是 RestX 自己拥有的配置。

### 注册表注入请求函数

注册表执行回调从单独的 `ResolvedAiProvider` 扩展为 main 进程请求上下文，包含已解析 Provider 和与其配置匹配的 `fetch` 函数。连接测试和所有 AI 特性必须使用该上下文中的函数。

关闭代理时注入现有 Node.js `fetch`；开启时注入 Electron `net.fetch`。请求超时、HTTP 状态、响应结构和业务错误映射继续由现有调用层负责。

这比让每个特性读取 `useSystemProxy` 更可靠，因为网络选择集中在平台边界，未来特性不需要重复实现代理判断。也不采用修改全局 Electron Session 代理的方案，因为全局切换会影响不同 Provider 的并发请求。

### 完全服从系统代理结果

开启后不解析或改写 PAC 结果，也不自行回退直连。`net.fetch` 负责遵循系统返回的 `PROXY` 或 `DIRECT` 决策及认证流程。代理连接失败沿用现有归一化连接错误。

不自行使用 Node 代理 Agent，因为那需要重复实现 PAC、认证和跨平台系统代理解析，且容易偏离操作系统实际行为。

### Provider 卡片直接展示开关

每张 Provider 卡片都显示开关，自动导入 Provider 也可操作。开关成功后刷新公共 Provider 状态；失败时保留原值并显示现有 Settings 错误提示。开关在请求进行或设置更新时禁用，避免重复提交。

## Risks / Trade-offs

- [Electron `net.fetch` 与 Node.js `fetch` 存在少量响应属性差异] → 现有 AI 调用只依赖标准状态、Headers 和响应体能力；用契约测试覆盖两种注入路径。
- [某个业务特性遗漏使用注入的请求函数] → 调整平台执行回调签名，使现有调用点在 TypeScript 编译时必须显式接收并传递请求函数。
- [系统代理配置错误导致模型不可达] → 返回明确连接失败，不静默绕过用户选择；用户可关闭 Provider 开关恢复直连。
- [外部 Provider 刷新覆盖代理偏好] → 构建刷新后的记录时从已有记录继承 `useSystemProxy`。
- [代理配置进入诊断信息] → 不解析或记录代理详情，保留现有脱敏日志结构并增加回归断言。

## Migration Plan

1. 以可选兼容字段读取现有 Provider store，缺失时解释为 `false`。
2. 发布 shared 契约、注册表存储和窄 IPC/preload API。
3. 将连接测试及全部 AI 调用迁移到注册表注入的请求函数。
4. 在 Settings Provider 卡片展示开关。
5. 通过自动化、视觉和进程冒烟验证后整合到本地 `main`。

回滚时旧版本会忽略新增的布尔字段；Provider 服务参数、API Key 和当前选择无需迁移或恢复。

## Open Questions

无。默认值、适用 Provider 范围、失败行为和缓存语义均已确定。
