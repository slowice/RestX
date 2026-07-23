## Why

RestX 当前由配置解析和代码 Review 分别保存模型服务配置，并在 Review 中额外拆成蓝区、黄区两套互斥配置，导致用户重复维护且特性之间无法共享当前 Provider。模型服务实际只由 Base URL、API Key 和模型 ID 决定，因此需要统一成平台级 Provider 能力，并安全复用 Claude Code 中会动态刷新的凭据。

## What Changes

- 新增平台级 AI Provider 注册表，统一管理手工 Provider、当前 Provider 和模型调用凭据。
- 设置页支持新增、编辑、删除、测试和切换多个 Provider；所有 AI 特性共享同一个当前 Provider。
- 程序启动时自动发现 Claude Code 的 OpenAI-compatible Provider，缺少模型 ID 时使用 `GLM5.1`。
- Claude Code Provider 保存外部配置引用而不复制动态 API Key，并通过凭据指纹、文件变更检查和一次认证失败重试跟随刷新。
- 将配置解析和代码 Review 从各自的 Provider 存储迁移到统一注册表，并迁移、去重已有配置。
- **BREAKING** 删除 AI Provider 上的蓝区/黄区维度；区域仍可用于代码来源和数据访问控制，但不再决定模型配置。

## Capabilities

### New Capabilities

- `unified-ai-provider`: 多 Provider 管理、全局切换、Claude Code 自动发现、动态凭据刷新和跨特性模型调用契约。

### Modified Capabilities

无。

## Impact

- 新增 `src/platform/ai-provider/` 下的 shared、main 与 preload 平台能力。
- 修改 platform 注册和 preload 暴露方式，以及设置页 Provider 管理界面。
- 修改 `ai-inspector` 和 `code-review` 的 main 服务、IPC 契约及缓存指纹来源。
- 读取 `~/.claude/settings.json`，但不向 renderer、日志或缓存暴露 API Key。
- 迁移现有 `ai-provider`、`code-review-provider-blue` 和 `code-review-provider-yellow` 本地存储。
