# OpenClaw 工具发现设计

## 目标

在 RestX“工具扫描”特性中新增 OpenClaw 内置预置，使 macOS 与 Windows 用户能够发现并浏览 OpenClaw 的配置、Workspace 指令与记忆、Agent 会话和 Gateway 日志。

## 已确认决策

- 可插拔边界位于特性之间。OpenClaw 的成熟固定路径属于工具扫描特性的领域规则，应保存在声明式预置中，不需要抽象到 `src/platform/`。
- 预置允许声明固定绝对路径和操作系统路径模板，不把扫描范围限定为用户目录。
- 第一版覆盖 OpenClaw 默认路径，不解析 `openclaw.json` 中任意自定义的 `logging.file` 或自定义 workspace 路径。
- 支持 macOS 与 Windows；Linux 不作为本次验收目标，但不通过平台判断主动破坏其默认目录。

## 方案

扩展现有预置契约，为 probe 和 source 增加可选的 `path` 与 `platforms`：

- `path` 支持 `${HOME}`、`${TEMP}`、`${UID}`。
- `path` 只允许最后一个路径段使用 `*`，用于匹配 `openclaw-*` 等官方用户隔离目录。
- `platforms` 使用 Node 平台名；本次使用 `darwin` 与 `win32`。
- 现有 `relativePath` 继续相对于用户选择的扫描根目录解析；`path` 与 `relativePath` 必须且只能出现一个。
- 解析与通配符枚举保留在 `src/features/ai-inspector/` 内，不进入 platform。

OpenClaw 预置直接声明：

- `${HOME}/.openclaw` 状态目录与 `openclaw.json` 探针。
- `${HOME}/.openclaw` 下的配置、Workspace 指令、记忆和 `agents/*/sessions/*.jsonl`。
- macOS `/tmp/openclaw`、`${TEMP}/openclaw*` 与 `${HOME}/Library/Logs/openclaw`。
- Windows `${TEMP}/openclaw*`。

## 数据展示

OpenClaw transcript 的首行是 `type: "session"`，后续包含 `message`、`custom_message`、`custom`、`compaction` 和 `branch_summary`。JSONL profile 从 `timestamp` 提取时间、从 session header 的 `cwd` 提取 workspace、从 `message.content[*].text` 等字段提取摘要，并按 `message.role`、content type 与 entry type 标注用户、助手、工具结果、压缩等事件。

Gateway `.log` 是逐行 JSON。日志也使用 JSONL 浏览器，按时间、级别、子系统与 message 字段展示，而不是仅显示文件元数据。

## 路径授权与错误处理

- 发现流程返回实际解析出的来源根目录。
- 只有在 OpenClaw 探针命中后，外部来源才参与扫描并被加入本次工具扫描的路径授权。
- 外部目录不存在时安静跳过；无权限、符号链接或读取失败时进入现有 skipped 列表。
- 通配符只枚举父目录的一级子项，设置匹配数量上限并复用全局文件数量、深度与大小限制。
- 不读取或展示 `credentials/**`、`auth-profiles.json`、`secrets.json`、数据库、缓存或其他认证数据。

## 兼容性

- Codex、Claude Code、OpenCode 和用户预置继续使用 `relativePath`，无需迁移。
- 预置版本仍为 1；新增字段是向后兼容的可选字段。
- 候选文件、文件夹分组与 JSONL renderer 的公开契约保持不变。

## 验收标准

1. macOS fixture 能从 HOME 状态目录和 `/tmp` 风格日志目录发现 OpenClaw。
2. Windows 路径解析测试能从 TEMP 风格目录发现 OpenClaw 日志，不依赖 POSIX 分隔符。
3. OpenClaw 配置、指令、会话和日志进入正确分类。
4. 会话按 workspace 分类，日志和会话可打开、逐行浏览、搜索和查看格式化 JSON。
5. 凭据和认证文件不会出现在候选列表中。
6. 现有三个内置预置及用户预置测试保持通过。
