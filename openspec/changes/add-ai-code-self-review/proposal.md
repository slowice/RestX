## Why

使用 AI 生成代码的初级开发者需要在提交前获得可定位、可解释的质量反馈，同时蓝区与黄区代码必须按照各自网络和保密策略调用不同的模型服务。RestX 已具备本地目录授权、OpenAI-compatible Provider 和结构化分析基础，适合增加统一的代码自检工作台。

## What Changes

- 在侧边栏新增“代码自检”页面，支持蓝区和黄区两种明确的数据区域。
- 支持粘贴 GitCode Pull Request/Merge Request 链接并读取 PR 元数据、变更文件和 diff；同时保留本地 Git 仓库差异来源。
- 增加可插拔的远程代码源适配器，首版完整实现 GitCode，只为 CodeHub 提供稳定契约和待配置状态。
- 按安全、低级错误、日志、测试和仓库一致性生成结构化检视发现，结果只展示、不回写代码平台。
- 使用 Skill 风格的 Markdown 规则包承载内置和仓库规则，并限制仓库规则覆盖安全或网络策略。
- 蓝区与黄区使用独立 AI Provider 配置；黄区代码禁止降级或发送到蓝区 Provider。
- 将检视结果按输入指纹加密缓存七天，MR head SHA、模型、提示或规则变化后立即失效。
- 默认不执行 `git fetch`、仓库脚本、编译或测试，也不修改仓库内容。

## Capabilities

### New Capabilities

- `code-review-workbench`: 代码自检入口、来源选择、发送预览、进度和结构化结果展示。
- `merge-request-source-adapters`: GitCode MR/PR 读取能力与可扩展的 CodeHub 适配器契约。
- `review-rule-packs`: 基于 Markdown 的版本化检视规则包及安全合并策略。
- `zone-isolated-review`: 蓝区/黄区的来源识别、Provider 强制路由、凭据、日志和缓存隔离。

### Modified Capabilities

无。

## Impact

- 扩展 React 模块清单、路由、设置页和页面样式。
- 扩展 shared contracts、preload API 和 Electron IPC 白名单。
- 新增 GitCode 客户端、代码源适配器、规则加载器、检视编排、缓存和审计服务。
- 复用 `safeStorage` 保存 GitCode PAT 和区域 Provider 密钥，但不复用会记录请求/响应正文的现有 AI 调用日志。
- 首版继续使用现有 OpenAI-compatible `/chat/completions` 协议，不新增运行时依赖。
