# CodeHub API 对接规范

## 1. 文档目的

本文档定义 RestX 代码检视模块接入 CodeHub 时必须满足的公开契约、数据归一化规则、安全边界和验收标准。

CodeHub 的真实域名、API 路径、企业证书、原始响应样例及专有字段映射属于黄区信息，不得回填到本蓝区文档、日志、测试快照或模型提示词。黄区实现只需将平台差异转换为本文规定的 RestX 公共类型。

当前首要目标是支持：

1. 用户粘贴 CodeHub MR 链接；
2. RestX 读取 MR 元数据和文件级 diff；
3. 用户预览变更范围后启动黄区 AI 检视；
4. 结果只在 RestX 中展示，不向 CodeHub 回写评论或状态。

自动列出“我的 CodeHub MR”不属于第一阶段必需能力，可在基础对接稳定后另行扩展。

## 2. 当前代码状态

| 能力 | 状态 | 代码位置 |
| --- | --- | --- |
| CodeHub 适配器注册 | 已完成，当前返回待配置错误 | `main/services/codehub-adapter.ts` |
| MR 来源统一契约 | 已完成 | `main/services/code-review-source.ts` |
| 检视输入/预览类型 | 已完成 | `shared/contracts/code-review.ts` |
| `PRIVATE-TOKEN` 加密保存 | 已完成 | `main/services/codehub-settings.ts` |
| renderer 读取 Token 明文 | 明确禁止 | renderer 只能获取 `privateTokenConfigured` |
| CodeHub 网络请求 | 待黄区实现 | 仅允许在 main 进程执行 |
| 黄区 MR 输入框 | 当前禁用 | API 接通并通过验收后启用 |

需要补充的核心入口为 `CodeHubAdapter`：

```ts
interface MergeRequestSourceAdapter {
  readonly id: 'gitcode' | 'codehub'
  readonly zone: 'blue' | 'yellow'
  matches(url: URL): boolean
  parseUrl(url: URL): MergeRequestLocator
  load(locator: MergeRequestLocator): Promise<LoadedReviewSource>
}
```

CodeHub 适配器必须始终声明：

```ts
readonly id = 'codehub'
readonly zone = 'yellow'
```

## 3. 黄区对接前需要确认的信息

以下信息应从 CodeHub 平台文档或平台维护方获取，并仅保存在黄区：

| 类别 | 必须确认的内容 |
| --- | --- |
| 部署信息 | Web 主机名、API Base URL、是否存在多套环境 |
| MR 链接 | MR Web URL 的固定格式，仓库命名空间是否允许多级路径 |
| 认证 | `PRIVATE-TOKEN` 请求头是否适用于全部只读接口、所需最小权限 |
| MR 详情 | 获取标题、状态、作者、源/目标分支、最新提交 SHA 的接口 |
| MR 变更 | 获取完整文件列表、文件状态、增删行数及 unified diff 的接口 |
| 分页 | 页码或游标规则、单页上限、是否在响应头返回总量 |
| 大文件 | 二进制、diff 截断、文件过大时的标识方式 |
| 错误语义 | 未认证、无权限、不存在、限流、服务异常对应的 HTTP 状态 |
| 网络环境 | 企业 CA、代理要求、DNS、请求超时和重试约束 |

最低权限必须是“读取仓库及 MR”。不得申请创建评论、合并 MR、修改仓库或管理成员等写权限。

## 4. CodeHub API 最小能力

第一阶段只要求两个逻辑接口。实际 HTTP 路径由黄区实现决定。

### 4.1 获取 MR 详情

输入：

- 仓库命名空间；
- 仓库名；
- MR 编号。

必须能够获得：

- MR 标题；
- MR 状态；
- 作者显示名或账号；
- 源分支；
- 目标分支；
- 最新 head SHA。

### 4.2 获取 MR 变更文件

必须返回完整文件集合，不能只读取第一页。每个文件至少需要：

- 新文件路径；
- 重命名前路径（如适用）；
- 状态：新增、修改、删除、重命名或未知；
- 新增行数；
- 删除行数；
- unified diff 文本；
- 是否为二进制文件；
- diff 是否因平台限制而截断或过大。

如果 CodeHub 将 MR 详情和变更文件放在同一个接口中，黄区客户端可以合并请求，但输出仍必须符合 RestX 的统一结构。

## 5. 请求规范

所有 CodeHub 请求必须满足：

```http
Accept: application/json
PRIVATE-TOKEN: <从主进程安全存储读取的明文 Token>
```

- 仅允许 HTTPS。
- 仅允许请求配置白名单中的 CodeHub 主机。
- 禁止自动跟随到非白名单主机的重定向。
- 单次请求默认超时建议为 30 秒。
- Token 只能通过 `codeHubSettings.getSecret()` 在 main 进程内按需读取。
- Token 不得进入 URL、renderer、错误消息、日志、遥测、缓存或 AI 请求。
- 不得记录完整请求头或 CodeHub 原始响应正文。
- 不得为了兼容证书而关闭 TLS 校验；企业 CA 应通过受控配置接入。
- GET 请求可对网络错误或 `5xx` 做有限重试，认证失败、无权限和参数错误不得重试。

## 6. URL 识别与解析

### 6.1 `matches(url)`

必须同时校验：

- `url.protocol === 'https:'`；
- 主机名属于配置的 CodeHub 白名单；
- pathname 符合 CodeHub MR 链接规则；
- MR 编号是正整数。

禁止仅根据路径包含 `merge`、`pull` 等模糊关键字判断来源。

### 6.2 `parseUrl(url)`

输出必须归一化为：

```ts
type MergeRequestLocator = {
  platform: 'codehub'
  zone: 'yellow'
  owner: string
  repository: string
  number: number
  webUrl: string
}
```

约束：

- `owner` 表示仓库命名空间；多级组织路径必须采用一种稳定且可逆的编码方式。
- `repository` 不包含结尾的 `.git`。
- `webUrl` 使用平台规范的 HTTPS MR 页面地址。
- URL 解码失败、缺少仓库或编号时抛出 `INVALID_URL`。
- 解析器不得接受用户名、密码、非标准端口等未经配置的 URL 变体。

## 7. 响应归一化

`load(locator)` 最终返回 `LoadedReviewSource`：

```ts
type LoadedReviewSource = {
  preview: ReviewSourcePreview
  files: ChangedReviewFile[]
}
```

### 7.1 来源标识

`sourceId` 必须能区分 MR 的不同提交版本，推荐格式：

```text
codehub:<namespace>/<repository>#<mr-number>@<head-sha>
```

`headSha` 不得使用 MR 编号或更新时间替代。它参与七天检视缓存的版本判断；MR 新增提交后必须生成新的 `sourceId`。

### 7.2 文件映射

每个文件必须归一化为：

```ts
type ChangedReviewFile = {
  path: string
  oldPath?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unknown'
  additions: number
  deletions: number
  eligible: boolean
  exclusionReason?: string
  patchCharacters: number
  patch: string
  changedNewLines: Set<number>
}
```

规则：

- `path` 使用仓库相对路径，禁止绝对路径和 `..` 路径穿越。
- `renamed` 文件应同时填写 `oldPath`。
- `patch` 必须为 unified diff；不能使用完整文件内容冒充 diff。
- `changedNewLines` 使用公共函数 `parseChangedNewLines(patch)` 计算。
- 二进制文件、缺少 diff、平台标记过大或截断的文件必须设置 `eligible: false`。
- 被排除的文件必须清空 `patch`，避免误送给模型。
- 不可信的数字字段应归一化为非负有限数值。

### 7.3 规模限制

CodeHub 必须采用与检视引擎一致的保护上限：

- 最多 120 个变更文件；
- 单文件 diff 最多 45,000 字符；
- 所有可检视 diff 合计最多 220,000 字符。

超过文件总数或合计字符上限时抛出 `SOURCE_TOO_LARGE`。单个文件过大时可排除该文件，并在 `exclusionReason` 中给出不包含源码内容的原因。

如后续调整上限，应将上限抽取为代码来源公共常量，GitCode 与 CodeHub 不得各自形成不同的隐式标准。

## 8. 错误映射

黄区实现必须统一抛出 `ReviewSourceError`，不得将原始响应正文直接透传到 UI。

| 场景 | 错误码 |
| --- | --- |
| URL 无法识别或缺少参数 | `INVALID_URL` |
| 未配置 `PRIVATE-TOKEN` | `AUTHENTICATION_REQUIRED` |
| HTTP 401/403 | `AUTHENTICATION_FAILED` |
| HTTP 404 或无权查看目标 MR | `NOT_FOUND` |
| HTTP 429 | `RATE_LIMITED` |
| DNS、TLS、超时或网络不可达 | `CONNECTION_FAILED` |
| 其他非成功 HTTP 状态 | `REQUEST_FAILED` |
| JSON 或必需字段无法解析 | `INVALID_RESPONSE` |
| 文件或 diff 超过限制 | `SOURCE_TOO_LARGE` |
| 来源区域不是黄区 | `ZONE_MISMATCH` |

用户消息可以包含 HTTP 状态码，但不得包含 Token、源码片段、原始响应正文、内部实现堆栈或黄区服务细节。

## 9. 推荐实现边界

蓝区保留平台无关契约，黄区只提供最小实现：

```text
蓝区
├── MergeRequestSourceAdapter
├── MergeRequestLocator
├── LoadedReviewSource
├── ReviewSourceError
└── CodeHubAdapter 的公共装配边界

黄区
├── CodeHub 主机和 API 路径
├── PRIVATE-TOKEN 请求客户端
├── 原始响应类型
├── 原始响应到公共契约的字段映射
└── 企业 CA 或内部网络配置
```

推荐让 `CodeHubAdapter` 依赖一个窄接口，而不是在蓝区直接出现专有 API：

```ts
interface CodeHubApiClient {
  matches(url: URL): boolean
  parseUrl(url: URL): MergeRequestLocator
  load(locator: MergeRequestLocator): Promise<LoadedReviewSource>
}
```

黄区通过依赖注入或受控装配提供该接口实现。蓝区不得导入、重新导出或记录黄区内部类型。

## 10. 接入改动清单

1. 在黄区实现 CodeHub API 客户端和原始响应映射。
2. 为 `CodeHubAdapter` 注入配置主机、API 客户端和 `codeHubSettings.getSecret()`。
3. 在 `CodeReviewService` 的组合入口中注册已配置的 CodeHub 适配器。
4. API 验收通过后启用 `CodeReviewPage.tsx` 的黄区 MR URL 输入框。
5. 保持 `preview` 和 `run` 的 `zone: 'yellow'` 校验，不得允许降级到蓝区 Provider。
6. 不修改 renderer/preload 的 Token 契约；renderer 仍只能知道是否已配置。
7. 如增加“测试连接”，新增独立只读 IPC，并只返回成功状态、账号标识和安全错误消息。
8. 如增加“我的 CodeHub MR”，应新增 CodeHub 专用列表契约，不得复用带 GitCode 命名的类型和 IPC。

## 11. 测试与验收

黄区至少需要覆盖以下自动化测试：

- 接受规范 CodeHub MR URL，拒绝其他主机、HTTP、畸形路径和非法编号；
- `PRIVATE-TOKEN` 放在正确请求头，且测试输出中不出现明文；
- MR 详情和多页文件列表正确归一化；
- 新增、修改、删除、重命名、二进制、空 diff 和截断 diff 正确分类；
- `changedNewLines` 与 unified diff 新文件行号一致；
- 401、403、404、429、超时、TLS 失败、无效 JSON 和字段缺失映射到稳定错误码；
- 文件数、单文件和总字符上限生效；
- 目标区域不是 `yellow` 时拒绝加载和发送；
- 预览阶段不调用 AI，只有用户点击开始检视后才发送合格 diff；
- CodeHub 源码只发送给黄区 Provider；
- 检视过程不向 CodeHub 发起 POST、PUT、PATCH 或 DELETE；
- 日志、缓存和 UI 中不出现 Token 或原始敏感响应。

手工验收流程：

1. 在设置页保存 `PRIVATE-TOKEN`，确认界面只显示“已配置”；
2. 粘贴一个有权限的 MR，确认标题、分支、文件数和增删行统计；
3. 确认二进制或过大文件显示为已排除；
4. 启动检视，确认使用黄区 AI Provider；
5. 给 MR 增加提交后重新打开，确认 `sourceId` 和缓存状态发生变化；
6. 移除 Token 后再次访问，确认返回未配置提示；
7. 检查 CodeHub 审计记录，确认全过程没有写操作。

## 12. 对接完成定义

只有同时满足以下条件，CodeHub API 才视为完成接入：

- MR URL、详情和完整 diff 能稳定读取；
- 所有数据已转换为 RestX 公共契约；
- 黄区网络、模型和源码边界没有被绕过；
- Token 不离开 main 进程且未进入日志；
- 只使用 CodeHub 只读接口；
- 自动化测试和手工验收全部通过；
- 蓝区仓库中不包含 CodeHub 内部域名、原始样本或可推导专有实现的信息。
