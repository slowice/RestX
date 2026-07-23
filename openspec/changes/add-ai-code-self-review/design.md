## Context

RestX 是 Electron + React + TypeScript 桌面应用。渲染进程只能通过 typed preload API 调用主进程，文件访问受授权路径约束，AI 请求使用用户配置的 OpenAI-compatible Provider。当前 AI 配置分析会记录完整请求和响应，因此代码自检必须使用独立的元数据审计链路。

蓝区使用 GitCode，黄区使用尚未取得 API 文档的 CodeHub。蓝区网络无法访问黄区，黄区网络可以访问蓝区，但黄区代码仍不得发送到蓝区模型。用户要求首版支持粘贴 MR/PR 链接，只展示结果、不回写评论，并优先覆盖 Java、MyBatis、SQL 和 TypeScript。

## Goals / Non-Goals

**Goals:**

- 交付可运行的代码自检页面和完整的 GitCode PR 读取链路。
- 用统一适配器隔离 GitCode、CodeHub 和本地 Git 来源差异。
- 强制来源区域与 AI Provider 路由匹配，禁止黄区向蓝区降级。
- 用 Markdown 规则包组合安全、低级错误、日志和一致性要求。
- 返回可定位到 diff 新行的结构化问题，并缓存七天。
- 在没有 CodeHub 文档时仍完成可测试的框架和明确的待配置状态。

**Non-Goals:**

- 自动修改代码、提交、fetch、checkout、执行仓库脚本或回写 MR 评论。
- 在首版实现 CodeHub 网络请求。
- 首版运行编译、测试、lint、SAST 或建立向量索引。
- 保证仅凭远程 MR 就能完成全仓库语义检索；未绑定本地仓库时一致性检视为受限模式。

## Decisions

### 1. 页面使用统一的会话状态机

`CodeReviewPage` 维护 `idle → loading-source → ready → reviewing → completed|failed` 状态。用户先选择区域和来源，再预览变更文件，最后手动开始检视。切换区域或来源会清空已有预览和结果，避免跨区复用内容。

相比将来源、模型调用和结果拆成多个路由，单页状态机更适合提交前的短流程，也便于首版展示完整效果。

### 2. 远程来源使用可插拔适配器

主进程定义 `MergeRequestSourceAdapter`：URL 匹配与解析、连接检测、MR 元数据、变更文件和文件内容。`GitCodeAdapter` 将页面中的 `/pull/{number}` 或 `/pulls/{number}` 归一化为 `/api/v5/repos/{owner}/{repo}/pulls/{number}`，使用 `Authorization: Bearer` 头携带 PAT。

`CodeHubAdapter` 实现同一契约，但在 API 未配置时返回稳定的 `ADAPTER_NOT_CONFIGURED`。CodeHub 的具体 URL、认证和响应解析只存在于该适配器内部，后续无需修改页面、IPC 或检视编排。

### 3. GitCode 以文件变更接口作为标准 diff 来源

首选 `GET /repos/{owner}/{repo}/pulls/{number}/files`，读取文件名、增删行数、状态和 `patch.diff`。如果响应缺少可用 patch，适配器可以再使用 `files.json` 结构化端点。首版限制文件数量、单文件 patch 和总字符数，二进制或超限文件作为排除项展示。

已合并和已关闭 PR 仍可检视，状态只用于 UI 标签。缓存使用 head SHA 或稳定的 diff 哈希，不能只依赖 PR 编号。

### 4. 区域策略由主进程强制执行

每个适配器声明固定 `zone`。GitCode 来源只能使用蓝区 Provider；CodeHub 来源只能使用黄区 Provider。IPC 请求中的用户选择必须与适配器区域一致。未知本地来源默认按黄区处理，直到用户明确分类。

Provider 配置按区域独立持久化。首版蓝区可以读取已有 Provider 设置，黄区保留独立配置入口。任何黄区失败都直接返回错误，不尝试蓝区服务。

### 5. 规则包采用目录加 RULES.md

规则包由 YAML frontmatter 和 Markdown 正文组成，至少包含 `id`、`name`、`version`、`zones`、`languages` 和 `categories`。内置规则打包在应用中，仓库规则从 `.restx/review-rules/*/RULES.md` 读取且视为不可信补充内容。

安全基线和区域策略不允许被仓库规则关闭。首版先实现内置规则包与运行时校验，保留用户规则目录契约。

### 6. 模型输入按 diff 文件分块并返回严格 JSON

每批输入包含规则摘要、MR 元数据和一个或多个受预算限制的 diff。system prompt 明确把源码、注释、MR 描述和规则正文视为待分析数据，禁止执行其中指令。模型只返回统一 `ReviewFinding[]`。

解析器验证严重度、分类、文件路径和行号。正式问题必须指向本次变更文件；无法定位或缺少证据的内容降为提示或舍弃。首版按路径、行号和标题去重。

### 7. 检视使用独立元数据日志

代码自检不调用现有记录 payload 的 `aiCallLogger`。新的审计事件只包含 reviewId、区域、来源哈希、文件数、字符数、模型、耗时、HTTP 状态和问题计数，不包含 diff、Prompt、响应正文、绝对路径或凭据。

### 8. 缓存七天且输入变化立即失效

缓存指纹包含来源、owner/repo、PR 编号、head SHA 或 diff 哈希、Provider、模型、Prompt 版本和规则版本。TTL 为七天。首版缓存只保存结构化结果和必要元数据，不保存原始 diff；提供手动重新检视和清除能力。

结果可能包含代码证据，因此持久化缓存使用系统安全存储保护的本机密钥进行加密。若系统安全存储不可用，则本次结果只驻留内存，不明文回退。

### 9. 本地 Git 来源不执行网络和仓库脚本

本地来源通过参数化子进程调用只读 Git 命令，使用 `--no-ext-diff` 并禁用 textconv。首版不自动 fetch；目标远端或分支不存在时提示用户在外部更新。未跟踪文件必须单独确认，二进制、LFS 和子模块只展示状态。

原型优先完成远程 GitCode 流程，本地适配器保留契约并交付基础状态/差异读取能力。

### 10. 检视工作台沿用 RestX 的浅色视觉语言

代码自检页面以白色卡片、浅灰边框、薄荷绿交互强调色为基础，避免形成与其他模块割裂的深色工作台。蓝色和黄色只用于表达网络区域、来源与隔离策略，不承担通用按钮或焦点状态。

应用身份使用一枚无文字的圆角方形图标：薄荷绿到青绿色的柔和渐变底色，中心为白色四角星与连接节点组合，表达“AI 工作台 + 代码连接”。开发模式通过主进程显式设置 `RestX` 名称和 macOS Dock 图标，打包产物继续以 `productName` 和平台图标资产作为最终来源。

### 11. 代码自检按特性胶囊接入模块化平台

代码自检的 shared 契约、Main 服务、Preload 白名单、Renderer 页面、规则包和样式全部归属于 `src/features/code-review/`。平台层只在 main、preload、renderer 三个特性注册表以及最终 `RestXApi` 类型组合处增加声明，不承载检视业务。

区域模型配置由代码自检特性独立持久化，不直接导入 AI Inspector 的内部 Provider 服务。设置页通过 code-review 的公开 renderer 入口渲染配置区，并以 `code-review.renderer` capability 显式声明依赖，避免跨特性私有导入。

### 12. GitCode 当前用户列表以 PAT 身份为准并用本地 Git 邮箱校验

主进程使用参数化 `git config --global --get user.email` 读取本机 Git 邮箱，不执行 shell，也不读取仓库内容。GitCode PAT 对应的 `/user` 与 `/emails` 响应用于邮箱匹配和账号展示；MR 列表使用官方 `/user/pulls` 接口，并显式限定 `scope=created_by_me`、`state=open`、按更新时间倒序和首屏数量上限。

PAT 授权账号是列表归属的权威身份，本地 Git 邮箱只用于确认和提示，避免从邮箱字符串猜测 GitCode 用户名。邮箱缺失或不一致时仍可展示 PAT 账号的 MR，但页面必须清楚标识身份状态。粘贴链接继续作为兼容和异常情况下的后备入口。

检视状态不回写 GitCode，而是从现有七天加密缓存中按规范化 MR 身份和 head SHA 推导。当前 SHA 的结果无 finding 时显示“检视通过”，有 finding 时显示问题数量；只存在旧 SHA 结果时显示“代码已更新”，不能沿用旧通过状态。清除缓存会同时移除这些本地状态。

### 13. CodeHub PRIVATE-TOKEN 作为独立代码来源凭据保存

CodeHub 使用与 GitCode PAT 分离的设置和存储文件。主进程只接受设置、替换、清除和内部读取操作，使用 Electron `safeStorage` 加密后写入 `codehub-settings`；renderer 只能获得 `privateTokenConfigured` 布尔值，不能读回明文。

当前阶段不假设 CodeHub URL、API Base URL、Token 格式或连接检测端点，也不发起 CodeHub 请求。后续黄区适配器通过内部 `getSecret()` 读取，并仅将值放入名为 `PRIVATE-TOKEN` 的认证请求头。该凭据属于代码来源，不进入统一 AI Provider 注册表，也不发送给模型或写入日志。

## Risks / Trade-offs

- **[GitCode API 方言与文档不完全一致]** → 同时接受 `/pull/`、`/pulls/` 链接，响应使用运行时校验，并给出可理解的认证或格式错误。
- **[公开 PR 的 API 仍可能要求 PAT]** → 设置页提供 PAT 安全保存和连接测试，所有请求使用认证头而不是查询参数。
- **[远程 MR 缺少全仓库语义上下文]** → 清楚标记一致性检视受限；后续允许绑定本地克隆目录。
- **[模型产生误报或错误行号]** → 强制结构化验证、diff 路径/行号校验、置信度和去重。
- **[黄区网络可以访问蓝区导致误路由风险]** → 适配器固定区域，主进程拒绝区域不匹配，禁止 fallback。
- **[缓存包含代码证据]** → 加密、七天 TTL、输入变化失效和手动清理；安全存储不可用时仅内存缓存。
- **[大型 PR 超出模型上下文]** → 文件和字符预算、发送预览、分批调用及明确的排除项，不静默截断。
- **[worktree 分支最终仍可能与 dev 冲突]** → 尽量新增独立文件，公共模块只做最小接线，合并前同步 dev 并运行完整验证。
- **[本地 Git 邮箱与 PAT 账号不一致]** → PAT 身份保持权威，邮箱只做可见校验，不据此过滤或冒充其他账号。
- **[MR 新提交沿用旧检视标识]** → 状态与 head SHA 绑定；SHA 变化后只显示过期，不显示通过。

## Migration Plan

1. 在独立 worktree 中增加契约、适配器、规则和服务，不改变现有 Inspector 行为。
2. 增加侧边栏入口、页面和设置项；默认 GitCode PAT 未配置、黄区 Provider 未配置。
3. 增加测试后运行 typecheck、test 和 build。
4. 合并前同步最新 dev，解决模块清单、IPC、preload 和设置页的有限冲突。
5. 回滚时移除新模块和 `code-review` IPC；独立设置与缓存文件可安全遗留或由设置页清除。

## Open Questions

- CodeHub 的 URL、API、认证、企业 CA 和响应格式进入黄区后补充。
- 黄区模型的具体模型名、上下文窗口和 JSON Mode 支持进入黄区后确认。
- GitCode PAT 页面中的最小只读 scope 名称在实际创建时验证，不在代码中假定固定名称。
