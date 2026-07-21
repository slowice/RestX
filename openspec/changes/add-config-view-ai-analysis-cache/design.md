## Context

RestX 当前将文件系统能力限制在 Electron 主进程，AI Inspector 只获得候选文件元数据。新的配置浏览与 AI 分析能力必须在不破坏该边界的前提下读取配置内容，并处理配置中常见的密钥、令牌和账号信息。项目已有 `window.restx` typed IPC、授权目录集合、`electron-store` 偏好存储和未实现的 OpenClaw Runtime 骨架。

本次实现面向可配置的 OpenAI-compatible 服务，而不是绑定单一厂商。用户提供 Base URL、模型名和 API Key；配置查看与缓存不依赖模型服务，可以独立降级。

## Goals / Non-Goals

**Goals:**

- 在主进程安全读取已授权、受大小限制的配置文件，并提供脱敏后的文本与结构化数据。
- 支持 JSON、YAML、TOML、INI 和 `.env`；解析失败时仍可展示脱敏文本和明确错误。
- 通过可配置的 OpenAI-compatible 服务生成结构化配置说明。
- 在页面中展示缓存状态、摘要、风险和建议。
- 仅当配置内容、模型配置或分析提示版本变化时再次请求模型。
- API Key 使用 Electron `safeStorage` 加密后再持久化，渲染进程永远不能读取密钥。

**Non-Goals:**

- 编辑、格式化、保存或自动修复配置文件。
- 把日志内容发送给模型。
- 支持流式输出、对话追问、多轮记忆或多 Provider 并行路由。
- 对任意编程语言配置文件执行代码或动态求值。
- 保证自动脱敏能够识别所有未知格式中的秘密；UI 必须持续提示用户核对发送内容。

## Decisions

### 1. 配置文件只在主进程读取

新增 `inspector:read-config` IPC，输入只有候选文件路径。IPC 先检查参数、授权根目录、真实路径、普通文件类型、扩展名和 512 KiB 大小上限，再调用配置解析器。渲染进程接收的只有脱敏文本、脱敏结构、格式、内容哈希和解析诊断。

选择该方案而不是让渲染进程读取文件，是为了保持现有安全边界并避免任意路径读取。符号链接继续拒绝，避免授权目录内的链接逃逸。

### 2. 同时提供文本视图与结构化树

解析器输出统一 `ConfigDocument`：`redactedText` 用于保留用户熟悉的配置布局，`data` 用于可折叠树浏览。JSON、YAML、TOML、INI、`.env` 使用专用纯数据解析器，绝不使用 `eval` 或加载 JS 模块。格式解析失败时 `data` 为 `null`，文本仍可浏览，并返回 `parseError`。

相比只展示结构化树，这能保留注释与原始布局；相比只展示源码，结构化树更适合理解嵌套配置。

### 3. 在读取后立即脱敏

敏感字段名称匹配 `apiKey`、`secret`、`token`、`password`、`authorization`、`privateKey`、`accessKey`、`clientSecret` 等常见变体，值统一替换为 `[REDACTED]`。同时对文本中的 Bearer token、常见密钥前缀和键值行做保守替换。原始内容只存在于一次主进程函数调用的局部内存中，不写入日志、IPC 响应或缓存。

AI 输入直接使用脱敏后的结构化数据或文本，而不是接受渲染进程回传内容，防止页面篡改绕过脱敏。

### 4. 使用单一 OpenAI-compatible Provider 接口

设置项包含 `baseUrl`、`model` 和可选的新 API Key。主进程规范化 HTTPS/HTTP URL，并请求 `<baseUrl>/chat/completions`。Provider 发送固定 system prompt 和版本化 user prompt，要求返回 JSON；响应在缓存前进行运行时校验。

API Key 通过 `safeStorage.encryptString()` 加密为 Base64 后保存。若当前操作系统无法提供安全存储，保存密钥操作失败并给出可理解错误，不降级为明文。设置读取 API 只返回 `apiKeyConfigured`。

保留 `AiProvider` 接口，后续接 OpenClaw Gateway 时无需修改页面与缓存协议。

### 5. 以分析输入指纹驱动缓存

缓存记录包含文件路径哈希、`sourceHash`、`analysisFingerprint`、结果、时间和模型名。`sourceHash` 基于原始文件字节生成，用于可靠检测注释或格式变化；`analysisFingerprint` 基于 `sourceHash + provider type + normalized baseUrl + model + promptVersion` 生成。

请求分析时先读取当前文件并计算指纹：命中则直接返回 `cacheStatus: hit`；不命中才调用模型并覆盖该路径记录。读取缓存时如果当前文件不可访问或内容变化，返回 `stale`，不展示为当前结果。手动“重新解析”使用 `force: true` 跳过缓存。

缓存只保存模型输出和指纹，不保存配置原文或脱敏副本。清除扫描历史与清除分析缓存分开，避免意外混淆数据范围。

### 6. Inspector 使用详情抽屉式工作区

点击配置候选后，在结果区域右侧/下方打开配置详情，包含“配置数据”和“AI 解析”两个页签。配置数据默认展示结构化树，并可切换脱敏文本；AI 页签优先读取有效缓存，再根据状态展示“开始解析”“重新解析”、加载、错误或结果。

首次请求模型前必须同时满足：用户已在设置中开启本地内容分析、Provider 配置完整、文件仍在授权目录中。扫描和配置浏览不依赖这三项，因此 AI 失败不会影响基础功能。

## Risks / Trade-offs

- **[脱敏存在漏报风险]** → 使用结构化字段与文本规则双层脱敏；明确标注发送的是脱敏数据；不提供自动批量分析。
- **[OpenAI-compatible 实现存在方言差异]** → 只依赖最小 `/chat/completions` JSON 协议，错误中展示 HTTP 状态与安全摘要，不记录响应正文或密钥。
- **[大型或复杂配置影响性能]** → 单文件限制 512 KiB，AI 输入再限制为 60,000 字符，超限时拒绝分析并解释原因。
- **[缓存可能因模型服务端变化而陈旧]** → 模型名、Base URL、提示版本进入指纹；提供手动重新解析与清除缓存。
- **[safeStorage 在部分 Linux 环境不可用]** → 不允许明文回退，用户需要修复系统密钥环或每次会话重新配置（首版只实现拒绝持久化）。
- **[结构化解析会改变键顺序或丢注释]** → 文本视图保留原布局，树视图仅用于浏览。

## Migration Plan

1. 扩展共享契约，保持现有扫描 API 向后兼容。
2. 新增配置读取、Provider、安全密钥和缓存服务；默认 Provider 未配置、AI 授权仍关闭。
3. 扩展 IPC/preload 后增加 Inspector 详情 UI 和设置 UI。
4. 老用户的偏好文件通过 `electron-store` 默认值自动补齐；不迁移现有扫描摘要。
5. 回滚时可移除新增 IPC/UI；独立的分析缓存与加密 Provider 文件可安全遗留或由设置页清除。

## Open Questions

- OpenClaw Gateway 适配器保留为后续 Provider，本次先交付 OpenAI-compatible 直连实现。
- 后续是否允许用户为单个敏感字段确认“取消脱敏”，不属于本次范围。
