## Why

RestX 目前只能从用户选择目录下的相对路径发现 AI 工具，无法完整识别把状态、会话和日志分散在用户目录与操作系统临时目录中的 OpenClaw。新增跨平台路径模板和 OpenClaw 内置预置，可让用户在 macOS 与 Windows 上统一浏览 OpenClaw 的配置、指令、会话和 Gateway 日志。

## What Changes

- 扩展声明式 AI 工具预置，使探针和文件来源可使用 `${HOME}`、`${TEMP}`、`${UID}` 路径模板、末级目录通配符和平台过滤。
- 保持现有相对路径预置兼容；路径模板解析能力仅属于工具扫描特性，不进入平台公共层。
- 新增 OpenClaw 内置 JSON 预置，检测默认状态目录并归类配置、Workspace 指令与记忆、Agent 会话和 Gateway 日志。
- 将 OpenClaw 会话与结构化 Gateway 日志交给现有 JSONL 浏览器，提供时间、摘要、workspace 和事件标签。
- 让由预置解析出的外部来源加入本次工具扫描的受控路径授权，以支持详情浏览与搜索。
- 排除凭据、认证配置、密钥、数据库、缓存和符号链接。

## Capabilities

### New Capabilities

- `portable-preset-paths`: 声明式 AI 工具预置可跨平台解析固定路径模板和受限的末级目录通配符。
- `openclaw-tool-discovery`: RestX 可发现并浏览 OpenClaw 的配置、指令、会话和结构化日志。

### Modified Capabilities

无。

## Impact

- 影响工具扫描特性的预置契约、预置校验、路径解析、发现流程、路径授权和内置预置清单。
- 新增 OpenClaw JSONL profile 与回归测试。
- 不修改其他特性、平台公共 API、Provider 数据格式或现有 Codex、Claude Code、OpenCode 预置行为。
- 不新增运行时依赖。
