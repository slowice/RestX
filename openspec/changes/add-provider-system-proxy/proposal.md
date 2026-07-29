## Why

RestX 的 AI Provider 请求目前使用 Node.js 网络栈，不会自动遵循操作系统代理配置，导致 Google 等需要代理访问的模型服务无法正常连接。Provider 需要独立、可持久化的系统代理选择，并保证连接测试与真实 AI 调用使用同一网络路径。

## What Changes

- 为所有手工和自动导入的 AI Provider 增加独立的“使用系统代理”配置，默认关闭。
- 在 Provider 设置卡片上提供系统代理开关，并允许只读外部 Provider 修改该 RestX 网络偏好。
- 开启时使用 Electron 原生网络栈遵循操作系统代理、PAC 和代理认证；关闭时保留现有直连行为。
- 让 Provider 连接测试和所有 AI 特性的模型请求共享同一代理感知请求上下文。
- 兼容缺少新字段的旧 Provider 记录，并在外部 Provider 刷新时保留用户选择。

## Capabilities

### New Capabilities

- `provider-system-proxy`: Provider 级系统代理偏好、统一网络路由、兼容性和错误行为。

### Modified Capabilities

无。

## Impact

- 修改 `src/platform/ai-provider/` 的 shared 契约、main 注册表、请求上下文和连接测试。
- 修改平台 IPC、preload 白名单 API 以及 Settings Provider 卡片。
- 调整通过 Provider capability 发起模型调用的 AI 特性，使其使用注册表注入的请求函数。
- 增加 Provider 注册表、网络选择、IPC/preload 和 Settings UI 回归测试。
- 不增加第三方运行时依赖，不修改操作系统代理配置，也不改变非 AI Provider 的网络请求。
