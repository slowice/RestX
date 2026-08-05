# Classic Outlook 邮件草稿启动设计

## 背景

邮件模板当前在 main 进程中调用 Electron `shell.openExternal()` 打开 `mailto:` URI。Windows 会把该 URI 交给系统默认协议处理器；当默认处理器是基于 Web 的新版 Outlook 时，打开草稿会失败。另一个已确认的问题是：直接使用 `execFile()` 启动经典 Outlook 会触发“参数无效”，因为这种进程启动方式与 Outlook 注册表命令所依赖的 Windows shell 行为不同。

本次变更只支持 Windows 经典 Outlook。macOS 和 Linux 暂不提供邮件草稿启动能力。

## 目标

- 绕过 Windows 默认 `mailto:` 协议处理器，直接找到并启动经典 Outlook。
- 提供 `findClassicOutlookPath()` 和 `openWithClassicOutlook()` 两个清晰、可独立测试的函数。
- 使用 `exec()` 执行与注册表格式一致的完整命令：`"OUTLOOK.EXE" -c IPM.Note /mailto "mailto:..."`。
- To、CC、BCC 中的多个收件人使用分号分隔。
- 找不到经典 Outlook、平台不受支持或启动失败时直接报错并记录脱敏日志，不做回退。

## 非目标

- 不支持新版 Outlook、Outlook Web 或其他默认邮件客户端。
- 不在 macOS 或 Linux 上保留 `shell.openExternal()` 回退。
- 不自动发送邮件。
- 不改变邮件模板数据结构、持久化格式或 IPC channel。
- 不记录邮件地址、主题、正文或完整 `mailto:` URI。

## 架构与模块边界

改动归属于 `src/features/mail-template/` 特性胶囊，不向 `src/platform/` 添加邮件专用逻辑。

### `main/mailto.ts`

`buildMailtoUri()` 继续承担 IPC 边界的草稿校验、URI 编码和长度限制。To、CC、BCC 的收件人列表统一以分号连接；编码后的 URI 仍满足现有长度上限。

### `main/classic-outlook.ts`

新增经典 Outlook 查找和启动能力：

- `findClassicOutlookPath()` 只在 Windows 上运行，按顺序检查注册表和常见安装目录，并且只返回经文件存在性验证的绝对 `OUTLOOK.EXE` 路径。
- `openWithClassicOutlook()` 接收已经构造并验证的 `mailto:` URI，查找 Outlook，安全地序列化完整命令字符串，再通过 `node:child_process.exec()` 交给 Windows shell。
- 依赖通过窄接口注入，使注册表输出、文件存在性、平台和进程启动可以在非 Windows 测试环境中覆盖。

### `main/mail-launch-logger.ts`

新增特性内部 JSONL 日志器，输出到 `~/.restx/logs/mail-template-YYYY-MM-DD.jsonl`。日志只包含时间、阶段、结果、错误代码、候选来源、已确认的 Outlook 路径和安全化错误摘要。

### `main/register.ts`

`openDraft` IPC handler 从 `shell.openExternal(buildMailtoUri(draft))` 改为：

1. 调用 `buildMailtoUri(draft)`；
2. 调用 `openWithClassicOutlook(uri)`；
3. 将可操作的错误消息返回 renderer。

`register.ts` 不自行查找路径或拼接命令。

### Renderer

成功提示改为“已在经典 Outlook 中打开草稿”，删除“系统默认邮件软件”的描述。现有“不会自动发送，打开 Outlook 后由用户确认”的交互边界保持不变。

## Outlook 路径发现

查找采用“注册表优先，常见目录兜底”。

### 注册表候选

查询当前用户和本机的 `Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\OUTLOOK.EXE`，并覆盖适用的 64 位与 32 位注册表视图。解析默认 `REG_SZ` 值后，必须验证：

- 路径是绝对路径；
- 文件名大小写不敏感地等于 `OUTLOOK.EXE`；
- 文件实际存在且是普通文件。

无效、缺失或无法读取的单个注册表候选不会中断查找，而是记录安全化诊断后继续。

### 安装目录候选

注册表未命中时，基于 `ProgramFiles`、`ProgramFiles(x86)` 和 `ProgramW6432` 等 Windows 环境目录检查常见 Microsoft Office 安装位置，包括 Click-to-Run 的 `root\\OfficeXX` 和传统 `OfficeXX` 目录。候选顺序保持确定，重复路径去重，每个候选都执行与注册表结果相同的文件验证。

所有候选失败后抛出“未找到经典 Outlook，请确认已安装桌面版 Outlook”，不调用系统协议处理器。

## 命令构造与进程生命周期

逻辑命令固定为：

```text
"<OUTLOOK.EXE绝对路径>" -c IPM.Note /mailto "<mailto URI>"
```

实现使用 `exec()`，不使用 `execFile()`。命令构造器只接受已验证的 Outlook 路径和由 `buildMailtoUri()` 生成的 URI，并针对 Windows shell 对双引号、百分号及其他元字符进行保真转义，防止环境变量展开、参数截断或命令注入。最终 Outlook 接收到的参数必须与上面的注册表命令格式一致。

IPC 不等待 Outlook 应用退出。Windows shell 成功接收启动请求后即可返回；进程的异步错误或非零退出继续写入日志。路径不存在等可在调用前判定的问题必须同步报错。

## 错误处理与日志

错误分为以下稳定类别：

- `UNSUPPORTED_PLATFORM`：非 Windows 平台；用户消息为“邮件功能当前仅支持 Windows 经典 Outlook”。
- `OUTLOOK_NOT_FOUND`：全部候选均无有效可执行文件；用户消息为“未找到经典 Outlook，请确认已安装桌面版 Outlook”。
- `OUTLOOK_LAUNCH_FAILED`：Windows shell 无法接受或执行启动命令；用户消息为“无法启动经典 Outlook，请查看日志后重试”。

日志写入失败不得掩盖原始启动错误。任何日志事件都不得包含 URI、收件人、标题或正文；底层错误消息在写入前移除可能出现的命令和邮件内容。

## 数据流

```text
MailTemplatePage
  -> mailTemplates.openDraft(draft)
  -> IPC openDraft
  -> buildMailtoUri(draft)
  -> openWithClassicOutlook(uri)
  -> findClassicOutlookPath()
       -> registry candidates
       -> common install candidates
  -> build safe full command
  -> exec(command)
  -> Classic Outlook compose window
```

## 测试策略

自动化测试只覆盖关键边界和具体回归：

- `buildMailtoUri()` 验证 To、CC、BCC 多收件人使用分号，现有非法输入和长度限制继续成立。
- `findClassicOutlookPath()` 验证注册表优先级、32/64 位候选、目录兜底、无效文件跳过、全部失败报错和日志事件。
- `openWithClassicOutlook()` 验证非 Windows 拒绝、调用 `exec()`、固定 `-c IPM.Note /mailto` 参数结构、shell 元字符保真处理、IPC 不等待 Outlook 退出以及日志脱敏。
- `register.ts` 的静态或行为测试确认不再导入或调用 `shell.openExternal()`。
- renderer 测试确认成功和失败提示使用经典 Outlook 语义。

本地功能验证在真实 macOS Electron 中执行不受支持路径：点击“在 Outlook 中打开”后，页面必须显示仅支持 Windows 经典 Outlook，且日志不得包含邮件内容。

Windows 成功路径必须在用户的 Windows 执行机人工验收：

- 打开经典 Outlook 新邮件窗口，而不是新版 Outlook；
- To、CC、BCC 多个地址均正确拆分；
- 标题和正文正确；
- 未安装经典 Outlook 时页面报错且存在脱敏日志。

## 验收标准

- Windows 上不再经过默认 `mailto:` 协议处理器。
- Outlook 启动命令使用 `exec()`，且最终参数格式为 `"OUTLOOK.EXE" -c IPM.Note /mailto "mailto:..."`。
- 多收件人统一以分号传递给 Outlook。
- 非 Windows 和找不到经典 Outlook 时不回退并返回明确错误。
- 所有失败路径均尝试写入日志，日志不泄露邮件内容。
- 现有邮件模板保存、渲染、导入和手动发送确认流程不受影响。
