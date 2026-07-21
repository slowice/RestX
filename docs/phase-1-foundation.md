# RestX 第一阶段：桌面基座与 AI Inspector 首个闭环

**阶段目标**：在 1 周内交付一个可运行的 Electron + React 桌面应用。RestX 是独立项目，但选择性复用 MatrixAssistant_5106 已验证的技术底座；从第一天起面向 macOS 和 Windows。它具备可扩展的模块化框架，并让用户完成一次真实闭环：选择目录 → 只读扫描 → 在 AI Inspector 中看到配置文件与日志文件。

## 1. 阶段边界

### 本阶段要完成

- RestX 桌面应用基础框架（Electron + React + TypeScript）。
- 左侧导航、基础路由、首页、设置页与 AI Inspector 页。
- 内部 feature 模块注册机制；新增业务模块不应改动应用壳核心逻辑。
- Electron 主进程、preload、渲染进程之间的安全通信边界。
- 用户选择本地目录，并以只读方式扫描其中的文件。
- AI Inspector 显示识别到的候选配置文件和日志文件。
- 后台扫描任务状态、错误提示，以及最近一次扫描结果。
- 基础测试、构建与开发说明。
- macOS 与 Windows 的开发启动和打包配置；至少完成当前开发平台的实际验证，并在 CI 或本地脚本中完成另一平台的构建校验。

### 本阶段明确不做

- 不解析 Codex / Claude Code / Cursor 的具体配置语义。
- 不编辑、删除或移动用户文件。
- 不接入邮件、Excel 或外部业务插件。
- 不做真正的跨模块搜索；仅预留命令面板入口。
- 不做自动更新、遥测、登录或同步。

## 1.1 与 MatrixAssistant_5106 的复用策略

RestX **不是** MatrixAssistant 的 fork，也不复制其现有 AI 对话、OpenClaw、插件、渠道或自动化业务。它是独立仓库、独立产品和独立发布物。

优先复用以下经过验证的技术方案与小粒度通用代码：

| 复用层 | 采用内容 | RestX 中的用途 |
|---|---|---|
| 工程 | pnpm、Electron、React、TypeScript、Vite、Electron Builder 的版本组合和构建思路 | 建立稳定的跨平台开发与打包流程。 |
| 渲染层 | Tailwind、Radix/shadcn 风格组件、Zustand、Lucide、React Router | RestX 应用壳、侧栏、页面与基础状态。 |
| 安全边界 | 主进程 / preload / 渲染进程分层，IPC 白名单和 typed invoke 思路 | 安全地提供文件扫描、定位文件等本地能力。 |
| 共享契约 | `packages/ipc-contracts` 的类型契约组织方式 | RestX 维护自己的 `shared/contracts`，不直接耦合 MatrixAssistant workspace。 |
| 本地能力 | `electron-store`、文件工具、路径处理、日志组织方式 | 保存用户偏好、最近目录与扫描元数据。 |
| AI 运行时 | OpenClaw、Gateway 生命周期、能力路由与安全控制的架构 | RestX 的智能解释、诊断、自动化能力都通过这层接入，而不是直接散落在页面中调用模型。 |
| 质量 | ESLint、TypeScript、Vitest、Playwright、i18n 约束 | RestX 的质量门禁与双语能力。 |

以下内容不带入 RestX：MatrixAssistant 现有的聊天与会话业务、MCP 市场、Windows 专属 API、WeLink/WhatsApp/Word 集成、预构建插件链和发布脚本。RestX 会使用 OpenClaw 运行时，但只带入 AI 工作站所需的最小 Gateway／安全能力底座，避免把完整 MatrixAssistant 业务一起搬入。

如需要直接复制 MatrixAssistant 的源文件，必须先确认文件许可证、依赖链和跨平台适用性；优先复用架构模式和小粒度、无业务耦合的实现。

## 2. 验收标准

完成后，开发者应能够：

1. 执行一条开发命令启动 RestX。
2. 在左侧看到“首页、AI Inspector、实验室、设置”。
3. 在 AI Inspector 中选择任意目录。
4. 扫描结束后看到扫描状态、扫描时间、文件数量。
5. 看到候选“配置文件”和“日志文件”两个分组，并可查看每个文件的路径、大小、更新时间和命中规则。
6. 对无权限目录、空目录和读取失败展示可理解的错误，而不是应用崩溃。
7. 所有文件访问只发生在主进程；渲染进程不拥有 Node.js 能力。

## 3. 建议技术选型

| 层 | 选择 | 原因 |
|---|---|---|
| 桌面框架 | Electron 39.x | 与 MatrixAssistant 版本线保持一致，适合本地文件、后台任务与系统集成。 |
| 前端 | React 19 + TypeScript + Vite 7 | 复用 MatrixAssistant 的成熟组合，类型边界清晰。 |
| 路由 | React Router | 模块路由与深链接清晰。 |
| 状态 | Zustand（或 React Context 起步） | 适合壳层状态和异步任务状态。 |
| UI | Tailwind CSS + Radix/shadcn 风格组件 | 与 MatrixAssistant 的 UI 基础保持一致；RestX 只维护当前需要的组件。 |
| 图标 | Lucide React | 统一、轻量、易替换。 |
| 本地存储 | electron-store | 与 MatrixAssistant 一致；第一阶段仅保存偏好与最近扫描目录。 |
| AI 运行时 | OpenClaw + 最小 Gateway 宿主 | 统一承接后续智能配置解释、日志摘要、诊断与自动化调用。 |
| 测试 | Vitest + React Testing Library + Playwright | 覆盖纯函数、组件、IPC 契约和双平台冒烟流程。 |

> 依赖的最终选择以项目脚手架兼容性为准；第一阶段应避免引入重型状态、ORM 或插件框架。

### 跨平台约束

- 所有路径操作使用 Node `path`，不拼接 `/` 或 `\\`。
- 不依赖 Finder、Explorer、注册表、PowerShell 或 macOS shell 的专属行为；“在文件管理器中显示”统一通过 Electron `shell.showItemInFolder` 实现。
- 配置／日志的默认发现规则在第二阶段按平台分别维护；第一阶段只扫描用户主动选择的目录。
- 打包采用 Electron Builder 的 macOS 与 Windows targets；代码签名、公证与 Windows 签名不属于第一周交付，但配置需预留。
- 至少在 macOS 实机完成开发与打包验证；Windows 在 CI 或 Windows 环境完成构建与基础启动验证。不能只以 TypeScript 通过来宣称跨平台可用。

## 4. 安全基线（不可省略）

- `contextIsolation: true`。
- `nodeIntegration: false`。
- `sandbox: true`（如个别 Electron 能力需要调整，必须说明原因）。
- preload 只暴露明确、最小的 `window.restx` API。
- IPC 使用白名单 channel；主进程验证所有参数类型与路径。
- 文件扫描默认只读；不提供任何写文件 IPC。
- 不记录原始文件内容、密钥或日志内容到分析日志。
- 只保存用户主动选择的目录和扫描元数据；设置页支持清除记录。

## 5. 目标信息架构

```text
RestX
├─ 首页                 /home
├─ AI Inspector         /ai-inspector
│  ├─ 扫描概览
│  ├─ 配置文件
│  └─ 日志文件
├─ 实验室               /lab
└─ 设置                 /settings
   ├─ 已授权目录
   └─ 数据与隐私
```

第一阶段的“实验室”仅显示占位说明：未来可在此试用尚未成为正式模块的工具。不要开始实现第二个业务模块。

## 5.1 AI 运行时基座

RestX 的 AI 能力必须走统一链路，不能让 React 页面各自请求模型：

```text
AI Inspector / 未来 Excel、邮件模块
             ↓
       RestX Capability API
             ↓
  Electron Main：权限、审计、任务编排
             ↓
   OpenClaw Gateway：模型 / 工具能力
             ↓
      本地或远程 AI 提供商
```

第一阶段只建立这条链路的**最小可运行骨架**：

- RestX 启动时可初始化、启动或连接 OpenClaw Gateway，并显示明确运行状态。
- 主进程拥有 Gateway 生命周期管理权；渲染进程只能读取状态或请求经授权的 capability。
- 定义 `ai.inspect` capability 的输入／输出契约，但本阶段不必把真实配置或日志文本送入模型。
- 将用户的“允许 AI 分析本地内容”作为显式设置，默认关闭；尚未授权时不初始化任何会读取本地扫描内容的 AI 调用。
- 运行时失败不能影响 AI Inspector 的文件扫描；扫描能力与 AI 能力必须可独立降级。

第二阶段将在 `ai.inspect` 上实现配置解释与日志摘要。这样第一阶段既有正确的 AI 基座，又不会为了演示而过早接入模型、密钥和敏感数据传输。

## 6. 模块化约定

每个左侧菜单对应一个 feature 模块。业务可以完全不同，但必须通过统一清单注册导航与路由。

```ts
export type RestXModule = {
  id: string
  name: string
  route: string
  icon: string
  group: "primary" | "system" | "experimental"
  status: "stable" | "experimental"
  component: React.ComponentType
}
```

初始模块：`home`、`ai-inspector`、`lab`、`settings`。

约束：

- feature 不得直接引用其他 feature 的内部组件或状态。
- feature 调用本地能力必须经由对应的 `api.ts` / `window.restx`。
- 跨模块跳转使用路由和显式参数，不共享隐式全局业务状态。
- 当前只做“内部模块化”，不承诺第三方插件兼容性。

## 7. 建议目录结构

```text
RestX/
├─ docs/
├─ src/
│  ├─ main/
│  │  ├─ index.ts
│  │  ├─ ipc/
│  │  │  └─ inspector.ts
│  │  └─ services/
│  │     ├─ file-scanner.ts
│  │     └─ openclaw-runtime.ts
│  ├─ preload/
│  │  └─ index.ts
│  ├─ renderer/
│  │  ├─ app/
│  │  │  ├─ shell/
│  │  │  ├─ navigation/
│  │  │  └─ modules.ts
│  │  ├─ features/
│  │  │  ├─ home/
│  │  │  ├─ ai-inspector/
│  │  │  ├─ lab/
│  │  │  └─ settings/
│  │  ├─ shared/
│  │  │  ├─ ui/
│  │  │  ├─ types/
│  │  │  └─ utils/
│  │  └─ main.tsx
│  └─ shared/
│     └─ contracts/
│        ├─ inspector.ts
│        └─ ai-capability.ts
├─ tests/
├─ build/
│  └─ entitlements.mac.plist
├─ electron-builder.yml
└─ package.json
```

## 8. AI Inspector：第一个可用闭环

### 用户流程

1. 用户打开 **AI Inspector**。
2. 点击“选择要检查的文件夹”。
3. 系统弹出原生目录选择器。
4. 用户确认后，主进程开始只读扫描。
5. 页面显示扫描中状态，可看到当前阶段。
6. 扫描完成后，显示总文件数与分类结果。
7. 用户点击某条结果，可复制路径或在系统文件管理器中定位文件。

### 第一版识别规则

识别是“候选文件”，不要在 UI 中承诺它们一定属于某一个 AI 工具。

| 分类 | 文件名 / 扩展名规则 |
|---|---|
| 配置候选 | `*.json`、`*.yaml`、`*.yml`、`*.toml`、`*.ini`、`.env`、`config.*`、`settings.*` |
| 日志候选 | `*.log`、`*.out`、`*.err`、文件名含 `log`、`logs/` 目录下的文本文件 |
| 忽略 | `node_modules`、`.git`、构建产物、单文件超设定上限、隐藏系统目录（除非用户主动选择） |

### 扫描结果契约

```ts
export type ScanCandidate = {
  path: string
  name: string
  kind: "config" | "log"
  matchedBy: string
  sizeBytes: number
  modifiedAt: string
}

export type ScanResult = {
  rootPath: string
  startedAt: string
  completedAt: string
  scannedFileCount: number
  candidates: ScanCandidate[]
  skipped: { path: string; reason: string }[]
}
```

## 9. IPC API（第一版）

preload 只暴露以下接口：

```ts
window.restx = {
  inspector: {
    chooseDirectory(): Promise<string | null>,
    scanDirectory(path: string): Promise<ScanResult>,
    revealInFolder(path: string): Promise<void>,
  },
  app: {
    getVersion(): Promise<string>,
  },
}
```

`scanDirectory` 的输入必须在主进程进行规范化、存在性检查和异常处理。未来如加入扫描进度，再将其扩展为任务 ID + 订阅事件，不要让渲染进程自行遍历文件系统。

另外增加只读的运行时状态 API：

```ts
window.restx.ai = {
  getRuntimeStatus(): Promise<"stopped" | "starting" | "ready" | "error">,
}
```

真实的 AI 请求 API 不在第一阶段暴露，避免在权限、脱敏与审计机制未完成前向模型发送本地内容。

## 10. 一周拆分

### Day 1：工程与跨平台应用壳

- 以 MatrixAssistant 的 Electron 39 + React 19 + Vite 7 + TypeScript 组合初始化独立项目。
- 引入 MatrixAssistant 对应版本线的 OpenClaw 依赖，建立独立的 RestX Gateway 配置和运行目录；不得复用 MatrixAssistant 的用户数据目录。
- 建立 lint、format、typecheck、test、build 脚本。
- 配置安全 BrowserWindow。
- 配置 Electron Builder 的 macOS 与 Windows targets；确认目录、产物名与应用标识均为 RestX。
- 完成侧栏、路由、首页和设置页骨架。

**完成标准**：macOS 可启动开发环境；四个导航项可切换；OpenClaw Runtime 状态可显示且失败可见；macOS 生产构建成功；Windows 构建配置经静态检查通过。

### Day 2：模块注册与设计基础

- 实现 `RestXModule` 清单与自动导航／路由注册。
- 建立页面容器、空状态、加载态、错误态、按钮、卡片等最少通用组件。
- 确定浅色 / 深色主题之一，另一套可留到后续阶段。

**完成标准**：添加一个示例模块时，不需要修改侧栏组件。

### Day 3：安全 IPC 与目录授权

- 实现 preload API 和主进程 IPC 白名单。
- 实现原生目录选择器。
- 在设置页展示最近授权目录，并可清除本地记录。
- 为 IPC 参数校验和错误映射补充测试。

**完成标准**：渲染进程不使用 Node API，目录选择可正常工作。

### Day 3.5：OpenClaw 最小运行时

- 实现 Gateway 的启动、停止、状态订阅与失败恢复边界。
- 让 RestX 使用独立配置目录、独立日志目录和独立端口策略，避免影响 MatrixAssistant 或用户已有 OpenClaw 实例。
- 定义 `ai.inspect` capability 契约，以及“允许分析本地内容”的关闭态。
- 在设置页展示 Runtime 状态和数据授权说明。

**完成标准**：无模型配置或 Gateway 不可用时，RestX 仍能正常启动并完成文件扫描；运行时错误可在界面与主进程日志中追踪。

### Day 4：只读扫描器

- 实现可取消或至少可限制深度的递归文件扫描。
- 加入忽略目录、文件数量上限、文件大小上限、错误收集。
- 实现候选配置／日志的文件名规则。
- 输出共享的 `ScanResult`。

**完成标准**：对真实开发目录扫描不阻塞界面，错误和跳过项可追踪。

### Day 5：AI Inspector 界面与闭环

- 完成首次使用空状态、选择目录、扫描中、扫描结果、错误状态。
- 按配置／日志分类展示候选文件。
- 支持复制路径和在 Finder / Explorer 中显示。
- 首页显示最近一次扫描摘要。

**完成标准**：从启动应用到查看真实扫描结果的完整演示可在 1 分钟内完成。

### Day 6：质量与跨平台验收

- 补充扫描规则、异常路径和 UI 状态测试。
- 在 macOS 实机检查路径与 Finder 定位行为。
- 在 Windows 环境或 CI 检查构建与基础启动；若阶段内无 Windows 环境，记录为明确风险，不得标记为“已验证”。
- 使用空目录、权限受限目录、包含大量文件目录进行手动测试。
- 检查安全配置与开发者工具中无敏感数据泄漏。

### Day 7：收尾与下一阶段接口

- 写 README：启动方式、架构、已知限制。
- 固化模块约定和 IPC 契约。
- 建立下一阶段 backlog：工具适配器、配置解析、日志索引。
- 录制或编写 2 分钟演示流程。

## 11. 第一阶段完成时不应妥协的质量项

- 文件扫描永远不写入用户选择的目录。
- 不能因为某个文件无权限或损坏而中断整次扫描。
- 每一项扫描结果都能说明“为何被识别”。
- UI 不展示绝对路径之外的文件内容，避免第一周就引入敏感信息泄露问题。
- 所有 API 都有 TypeScript 契约，不在组件中散落 `ipcRenderer` 调用。

## 12. 进入第二阶段的门槛

以下全部满足后，再开始解析具体 AI 工具配置：

- [ ] AI Inspector 已可稳定扫描并展示结果。
- [ ] 目录选择、错误处理、结果缓存均已验证。
- [ ] 模块注册机制已被至少 4 个内部页面使用。
- [ ] 安全窗口配置与 preload API 已完成审查。
- [ ] OpenClaw Runtime 可独立启动／停止，且不读取或改写 MatrixAssistant 的运行数据。
- [ ] 本地内容的 AI 分析默认关闭，授权语义和 `ai.inspect` 契约已固定。
- [ ] 有至少一份真实目录的人工验收记录。
- [ ] macOS 已完成真实运行验证，Windows 的构建／启动验证状态有明确记录。
- [ ] 已列出 Codex、Claude Code、Cursor 的适配器输入／输出契约。
