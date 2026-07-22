## Context

AI Inspector 的 JSONL viewer 已具备安全的尾部分页、标签提取和单行详情读取，但摘要只有 `rawPreview`、标签和时间。renderer 的搜索只对内存中的最近 100 条做字符串过滤，既无法命中旧记录，也无法形成会话或工作区导航。

RestX 已采用本地声明式 AI 工具预置。该能力必须继续属于 `ai-inspector` 特性胶囊和蓝区；主进程负责文件访问与解析，renderer 只消费窄 DTO，platform 不吸收业务逻辑。

## Goals / Non-Goals

**Goals:**

- 从不同工具的 JSONL 结构中统一提取 session、workspace 和可读摘要。
- 在会话记录列表页提供 `Workspace → Session` 两级导航。
- 在一个 workspace 内跨多个 session 文件搜索，并让用户知道搜索是否完整。
- 将完整本地时间作为一级信息，同时保留标签、原始 JSON 和按需详情。
- 对现有预置和用户预置向后兼容。

**Non-Goals:**

- 本次不建立跨多个 JSONL 文件的全局持久化搜索数据库。
- 不使用模型给历史自动分类，也不把历史内容发送到外部服务。
- 不推断预置未声明的工具专有字段，不改变 JSONL 原文件。

## Decisions

### 1. 由 profile 声明可定位字段

在 `JsonlProfile` 增加可选的 `sessionPaths`、`workspacePaths` 和 `summaryPaths`。解析器按顺序取第一个可转成非空文本的值，支持现有 `[*]` 路径语法。`JsonlEventSummary` 增加 `sessionId`、`workspace` 和 `contentPreview`。

选择声明式路径而不是按 `profileId` 写条件分支，是为了让内置预置、用户 JSON 预置和智能导入预置走相同框架。字段均可选；旧预置继续得到 `null` 元数据并正常浏览。

### 2. 扫描阶段建立轻量会话摘要，不建立持久索引

发现 `conversation` JSONL 候选后，主进程按 profile 读取每个文件头部的有限字节和有限行数，提取首个 workspace、session id、时间以及首个带“用户”标签的内容摘要。摘要写入本次 `ScanResult` 的 candidate DTO，不另行落盘。

这种方式让列表页可在不打开详情的情况下分组，同时避免完整解析所有会话。相比从 Claude 的编码目录名或 Codex 的日期路径猜 workspace，读取 profile 声明字段对工具版本和用户预置更通用。

### 3. Workspace 文件夹由 discovery 统一生成

`conversation` 分类节点的 `children` 按候选摘要中的 workspace 生成物理文件夹；无法提取的会话进入“未知工作区”。renderer 使用现有文件夹浏览范式增加一层导航，不为 Codex 或 Claude Code添加条件分支。

进入 workspace 后，列表按最近活动时间展示 session 摘要，以首个用户问题、完整时间、session id 和文件名辨认会话。

### 4. 增加受控的 workspace 跨文件搜索

新增 AI Inspector 自有的 `search-jsonl-workspace` IPC。renderer 只能提交当前扫描结果中 workspace 文件夹包含的 `{path, profileId}` 白名单，main 对每条路径再次执行授权、普通文件、非符号链接和 `.jsonl` 校验。

主进程按文件最近修改时间从新到旧扫描，应用跨文件共享的文件数、字节数、记录数和结果数预算，返回带文件身份的命中摘要与扫描范围。查询不落盘；清空查询恢复 session 文件列表。

单文件详情仍复用 `read-jsonl-page` 的搜索，用于从 workspace 命中进入某个具体 session 后继续查看该文件内的所有匹配记录。

### 5. 单文件详情保留时间流，不承担 Workspace 导航

`JsonlPageRequest` 增加可选 `query`，`JsonlPage` 增加可选搜索状态。无 query 时保持现有尾部分页；有 query 时，主进程从文件尾部向前分块扫描完整行，返回最近的最多 200 个匹配项。

搜索匹配完整单行文本而不是 800 字符摘要，因此可找到嵌套深处的问题或错误。为避免异常大文件长期占用主进程，单次搜索限制扫描字节数和记录数，并在命中上限或扫描上限时返回 `truncated=true`、扫描条数和扫描字节数。renderer 明确显示范围，不把部分结果伪装成完整结果。

相比新增一个可任意检索路径的 channel，复用现有已授权路径、profile、快照和 `.jsonl` 校验可保持 IPC 面最小。相比预先构建持久索引，按需反向扫描没有缓存迁移、隐私副本或索引失效问题，适合第一版。

单文件详情继续展示消息时间流、标签筛选和完整文件搜索，但移除会话/工作区分类切换，避免让用户误以为 workspace 导航发生在文件内部。

### 6. 以内容摘要和完整时间替代原始 JSON 作为列表主信息

列表优先展示 `contentPreview`，无可用摘要时回退到 `rawPreview`。时间采用用户本地时区的完整年月日与秒，并显示短相对时间；session/workspace 作为次级定位信息，原始 offset 只在无时间时兜底。

## Risks / Trade-offs

- [工具版本改变 JSONL 字段] → 路径为有序候选并保留 raw fallback；新增工具只更新 JSON 预置和 schema 校验测试。
- [扫描大量 session 变慢] → 每个文件只读头部有限字节/行，使用有限并发；失败仅进入未知工作区，不阻断工具扫描。
- [Workspace 跨文件搜索耗时] → 共享文件/字节/记录/结果预算、显式 loading 和 `truncated` 提示；不在输入时自动触发。
- [一条记录不携带 session/workspace] → 显式进入未知分组，不跨行猜测或错误归类；可在后续预置版本扩充路径。
- [搜索内容涉及隐私] → 全程本地主进程按需读取，不写搜索索引、不记录查询词、不调用 AI 服务。

## Migration Plan

1. 先扩展可选 contracts 和 validator，再更新内置预置。
2. 扩展 discovery 的会话摘要与 workspace 文件夹构建。
3. 增加跨文件搜索 service、IPC 参数校验和 renderer workspace 导航。
4. 回滚时可移除新 UI 与可选字段；JSON 预置中的新增字段需要同步移除以通过旧 validator。

## Open Questions

无。跨工具、跨 workspace 的全局持久化索引仍不在本次范围内。
