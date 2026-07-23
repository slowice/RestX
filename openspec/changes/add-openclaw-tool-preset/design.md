## Context

工具扫描目前把所有 probe 和 source 的 `relativePath` 解析在用户选择的扫描根目录内。这适用于 Codex、Claude Code 和 OpenCode，但 OpenClaw 的默认状态、会话和日志跨越 `${HOME}/.openclaw`、macOS `/tmp/openclaw`、操作系统临时目录，以及 macOS launchd 日志目录。外部来源被发现后还必须进入该特性的路径授权，否则 renderer 能看到候选文件却不能打开或搜索。

用户确认工具路径是成熟产品的领域规则，可以直接写入该工具的内置 JSON 预置；可插拔要求适用于特性边界，不要求抹去特性内部的固定规范。

## Goals / Non-Goals

**Goals:**

- 在不修改现有相对路径语义的前提下，支持跨平台固定路径模板、平台过滤和末级目录通配符。
- 用单个 OpenClaw 内置预置覆盖 macOS 与 Windows 的默认状态、会话和日志位置。
- 复用现有文件分类、workspace 会话分组、JSONL 分页、搜索和详情能力。
- 保持路径解析、授权和 OpenClaw 规则封装在工具扫描特性内。

**Non-Goals:**

- 不解析任意 `logging.file`、`agents.defaults.workspace` 或 `OPENCLAW_STATE_DIR` 自定义值。
- 不读取 OpenClaw SQLite 会话状态。
- 不新增独立 OpenClaw 页面、平台 API 或第三方依赖。
- 不迁移或重写现有内置及用户预置。

## Decisions

### 1. 预置路径使用模板字符串

probe 和 source 增加可选 `path` 与 `platforms`。`path` 支持 `${HOME}`、`${TEMP}`、`${UID}`；只允许最后一个路径段包含 `*`。现有 `relativePath` 保留，且每一项必须在 `path` 与 `relativePath` 中二选一。

这比新增 OpenClaw 专用 TypeScript resolver 更符合声明式预置风格，也比把通用逻辑放进 platform 更符合特性所有权。直接允许任意层级 glob 虽然更灵活，但会扩大遍历范围并让上限难以预测，因此不采用。

### 2. 平台过滤由预置声明

`platforms` 使用 `NodeJS.Platform` 值。未声明时在所有平台生效；声明后不匹配当前平台的 probe/source 不参与解析。OpenClaw 预置可同时表达 macOS `/tmp`、launchd 日志和 Windows `%TEMP%`，无需在发现服务中按工具 id 分支。

### 3. 路径解析器是工具扫描内部模块

新增一个专注于模板展开、平台过滤、末级 glob 枚举和 realpath 去重的模块。发现服务只消费解析后的绝对根目录。该模块接受可注入的 `homeDirectory`、`tempDirectory`、`uid` 和 `platform`，使 Windows/macOS 行为可在任意开发机测试。

### 4. 外部来源按实际解析根目录授权

发现结果携带已命中来源的绝对根目录。main handler 在返回扫描结果前将这些目录加入 `authorizedPaths`。只有已命中工具的来源才能获得授权，且后续详情、JSONL 分页和搜索仍经过现有 IPC 校验。

### 5. OpenClaw 会话和日志复用 JSONL 浏览器

会话 profile 解析 transcript header 的 `cwd`、`id`、`timestamp`，并从 message content 提取问题摘要；标签覆盖 session、message role、toolResult、compaction 和 branch summary。

日志 profile 解析常见时间、message、level 和 subsystem 字段。`.log` 文件虽然扩展名不是 `.jsonl`，但 viewer 显式设为 `jsonl`，因此使用逐行列表、搜索与格式化详情。

## Risks / Trade-offs

- [固定路径无法覆盖用户自定义状态、workspace 或日志位置] → 第一版明确只覆盖官方默认规范，后续可新增配置值驱动的路径来源。
- [末级通配符可能在临时目录匹配多个历史 OpenClaw 目录] → 只枚举一级、去重、跳过符号链接，并继续受全局文件数和深度上限约束。
- [`${UID}` 在 Windows 不可用] → OpenClaw Windows 来源使用 `openclaw*` 末级通配符，不依赖 UID 替换。
- [外部来源扩大读取边界] → 授权限制在实际命中的来源根目录，IPC 继续执行现有授权检查。
- [OpenClaw transcript 字段随版本演进] → profile 同时声明多个时间、摘要和标签候选路径，未知事件按原始 type 展示。

## Migration Plan

这是向后兼容的预置 schema 扩展。发布后现有预置继续使用 `relativePath`；新增 OpenClaw 预置自动进入内置清单。回滚时移除 OpenClaw 清单项和新增路径字段处理即可，不涉及用户数据迁移。

## Open Questions

无。用户已确认采用固定路径/环境模板方案，第一版覆盖 macOS 与 Windows 默认位置。
