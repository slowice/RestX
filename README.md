# RestX

RestX 是一个基于 Electron 的 AI 个人工作站。用户主动授权目录后，应用在主进程中进行只读扫描；AI Inspector 可以浏览脱敏后的配置数据，并通过用户配置的 AI 服务解释配置用途、风险与改进建议。

## 已实现

- Electron 39 + React 19 + TypeScript + Vite 应用基座
- 首页、AI Inspector、实验室、设置四个独立特性胶囊
- 由统一特性清单生成的导航与懒加载路由，单个特性异常不会影响其他菜单
- 原生目录选择器与带授权校验的 IPC 白名单
- 只读取文件名、路径、大小和更新时间的异步目录扫描器
- 预置驱动识别 Codex、Claude Code 和 OpenCode，并按工具/配置/指令/会话/历史/日志文件夹浏览
- 配置/日志候选分组、规则说明、路径复制与系统文件管理器定位
- JSON、YAML、TOML、INI、`.env` 配置解析，以及树形/脱敏文本浏览
- Codex/Claude Code JSONL 会话浏览：从文件尾部分页、思考/工具调用等语义标签、单条 JSON 格式化
- AI 工具智能导入：根据受限目录元数据生成预置、安全校验、试扫描、预览后确认启用
- 可配置的 OpenAI-compatible Base URL、模型和 API Key
- 结构化 AI 配置解析结果：摘要、工具识别、配置项说明、风险和建议
- 基于配置内容、模型和提示版本的分析缓存，配置更新后自动失效
- 扫描深度、文件数量、单文件大小限制及逐项错误收集
- 最近目录、最近扫描摘要与隐私设置

## 本地启动

环境要求：Node.js 22+、pnpm。

```bash
pnpm install
pnpm dev
```

## 验证与构建

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm dist:mac
pnpm dist:win
```

`dist:win` 需要 Windows 环境或具备对应打包依赖的 CI。当前阶段不包含代码签名、公证和自动更新。

## 安全设计

- BrowserWindow 使用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`。
- 渲染进程只使用 `window.restx` 中的最小 API，不可直接访问 Node.js。
- 扫描、配置读取和文件定位只允许访问用户通过系统选择器授权的目录。
- 通用扫描器跳过符号链接、隐藏目录、依赖目录和构建产物；已知 AI 工具隐藏目录仅按安全预置读取。
- 配置内容只在主进程读取，单文件上限 512 KiB；没有写入、删除或移动文件的 IPC。
- 常见 API Key、Token、密码、Secret、Authorization 等字段在跨 IPC 或发送模型前脱敏。
- API Key 使用 Electron `safeStorage` 加密，渲染页面只能知道密钥是否已配置。
- AI 本地内容授权默认关闭；只有用户在单个配置中点击“开始 AI 解析”才会发起请求。
- 分析缓存只保存内容指纹和模型输出，不保存配置原文或脱敏副本。
- JSONL 会话只在用户点击后本地按需读取，不发送给 AI 服务，不写入缓存或调用日志。
- 智能导入只在用户单次明确同意后发送相对路径、类型、大小和修改时间；不读取文件内容，并跳过凭据、密钥等敏感路径。

## 配置 AI 服务

1. 打开“设置 → AI 服务”。
2. 填写 OpenAI-compatible Base URL，例如 `https://api.openai.com/v1` 或本地服务的 `/v1` 地址。
3. 填写模型名和 API Key，点击“保存 AI 服务”。
4. 开启“允许 AI 分析本地配置”。

RestX 调用 `<Base URL>/chat/completions`。修改 Base URL、模型、配置内容或内置提示版本都会让旧缓存自动失效；也可以在设置中清除全部解析缓存。

### AI 调用日志

RestX 会自动创建 `~/.restx/logs`，并按本地日期写入 `ai-calls-YYYY-MM-DD.jsonl`。日志时间包含本地时区偏移（例如中国标准时间为 `+08:00`）。日志包含：

- 请求地址、模型、脱敏后的请求头和请求体
- HTTP 状态、调用耗时与模型原始响应
- 连接失败或超时的安全错误信息

日志不会记录 API Key，配置中的常见凭据字段会先替换为 `[REDACTED]`。由于模型输入和输出仍可能包含业务信息，请按敏感数据管理该目录。

## AI 工具识别预置

AI Inspector 使用“通用发现框架 + 声明式工具预置”。扫描用户目录时先检测预置隐藏目录，再只收集该工具预置范围内的配置、指令、会话、历史和日志文件。

预置定义位于 `src/features/ai-inspector/main/presets/ai-tools/`：

- `types.ts`：统一预置契约，包括 JSONL 标签 profile。
- `definitions/*.json`：Codex、Claude Code、OpenCode 的内置声明式预置。
- `validator.ts`：预置结构、路径、glob、JSONL profile 和敏感目标校验。
- `index.ts`：唯一注册表。

用户预置位于 `~/.restx/config/presets/`，支持 `.json`、`.yaml` 和 `.yml`。智能导入会生成 JSON；手工编辑的 YAML 使用同一契约。单个损坏预置会在管理页面显示错误，不会阻断其他预置。

RestX 自有数据统一放在 `~/.restx/`：配置和加密凭据位于 `config/`，分析与代码检视缓存位于 `cache/`，日志位于 `logs/`，Electron 运行数据位于 `runtime/`。首次启动新版本时会自动迁移旧目录，目标文件已存在时不会覆盖旧副本。

通用框架位于 `src/features/ai-inspector/main/services/ai-tool-discovery.ts`，不包含具体工具 id 判断。新预置无需修改扫描器、IPC 或页面组件。

## 特性模块开发

左侧菜单、路由、主进程能力和 preload API 已按特性隔离。新增或删除菜单的入口、目录规范和依赖规则见 [特性模块开发指南](docs/feature-architecture.md)。

## Demo 流程

1. 运行 `pnpm dev`。
2. 打开侧栏的“AI Inspector”。
3. 选择用户目录，或点击“扫描最近目录”。
4. 查看 Codex、Claude Code、OpenCode 的检测状态，并进入已检测工具。
5. 打开“配置”“指令”“会话记录”“活动历史”或“日志”文件夹。JSONL 文件点击“浏览记录”可查看逐行标签和格式化 JSON。
6. 要接入新工具时点击“智能导入”，填写工具名和可选线索，确认元数据授权，预览试扫描结果后保存。
7. 配置并授权 AI 服务后，打开“AI 解析”页签生成配置说明。
8. 再次打开未修改的配置时会直接使用缓存；修改配置后页面会提示重新解析。
9. 复制候选路径或点击“定位”在 Finder / Explorer 中显示。

第一阶段基础边界见 [docs/phase-1-foundation.md](docs/phase-1-foundation.md)，本次特性平台设计见 [OpenSpec design](openspec/changes/modular-feature-platform/design.md)。
