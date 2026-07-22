## Why

JSONL 历史浏览器目前只展示最近加载的一批原始记录，搜索也仅过滤这批数据。随着历史增长，用户无法按会话或工作区定位上下文，也很难通过曾经提出的问题快速找到一次报错；弱化的时间显示进一步增加了辨认成本。

## What Changes

- 由 AI 工具预置声明 JSONL 中的会话、工作区和摘要字段路径，使 Codex、Claude Code 及后续智能导入的工具共享同一套浏览框架。
- 在 AI 工具的“会话记录”列表层建立 `Workspace → Session` 文件夹层级；用户先进入工作区，再浏览属于该工作区的会话文件。
- 扫描时有限读取 session 文件头部，由 JSONL profile 声明式提取 workspace、session id、首个用户问题和开始时间，并在会话列表中展示。
- 将搜索从 renderer 文件名过滤升级为 workspace 范围的主进程跨文件记录搜索，支持通过用户问题或错误文本定位该工作区内任意 session，并明确展示搜索范围是否完整。
- 强化记录时间，列表同时显示完整本地日期时间和相对时间，以“问题摘要 + 时间”为主要辨认信息。
- 保留现有标签筛选、按需读取详情、尾部优先分页和文件更新检测行为。

## Capabilities

### New Capabilities

- `jsonl-history-navigation`: 声明式历史元数据提取、会话/工作区分组、跨记录搜索和可辨识时间展示。

### Modified Capabilities

无。

## Impact

- 影响 AI Inspector 特性的 JSONL shared contracts、预置 schema/validator、主进程 JSONL browser、renderer 记录浏览组件与样式。
- 扩展现有 JSONL DTO，并增加命名空间内的 workspace 搜索 IPC；不改变授权目录与文件安全校验。
- 内置 Codex 和 Claude Code JSON 预置增加声明式字段路径；用户预置保持向后兼容，新字段均为可选。
- 增加 parser/service 和 renderer 回归测试，不引入新依赖。
