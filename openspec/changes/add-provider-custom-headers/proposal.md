## Why

部分 OpenAI-compatible 服务、网关和企业代理需要 Provider 专属的额外请求头。当前 RestX 只能发送固定的认证和 JSON 头，用户无法为手工 Provider 或 Claude Code 自动发现的 Provider 提供这些兼容性配置。

## What Changes

- 为每个 AI Provider 增加可编辑的自定义请求头配置，并以明文持久化。
- 设置页提供可增删的“名称 / 值”请求头编辑行，适用于手工和 Claude Code 自动发现的 Provider。
- 在所有 AI 请求与 Provider 连接测试中，将自定义头覆盖默认的同名 `Authorization`、`Content-Type` 或其他头。
- 外部 Provider 刷新时保留由 RestX 管理的自定义请求头。

## Capabilities

### New Capabilities

- `provider-custom-headers`: Provider 级请求头配置、编辑、持久化与统一请求合并。

### Modified Capabilities

无。

## Impact

- 修改 `src/platform/ai-provider/` 的 Provider 契约、存储、执行上下文与 OpenAI-compatible 客户端。
- 修改设置页 Provider 编辑体验，以及对应 preload、IPC 白名单 API。
- 修改 AI Inspector、Code Review、知识图谱等依赖 Provider 请求上下文的调用点与相关测试。
