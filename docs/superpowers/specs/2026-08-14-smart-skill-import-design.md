# Skill 智能导入设计

## 目标

“常用技能”的导入不再要求源文件预先符合 RestX 格式。用户可以选择 Codex、Claude 或自定义 Markdown Skill；RestX 使用模型理解结构并生成名称、说明和格式类型，同时保证执行内容来自源文件本身。

## 核心保真规则

模型只能生成 `name`、`description` 和 `detectedFormat`，不能生成、修改、删减或追加执行 prompt。持久化正文使用本地读取的源内容，仅统一 CRLF/LF 并移除首尾空行。代码中不存在“接收模型 prompt 再比较”的路径，从结构上阻止语义漂移。

## 导入流程

1. 原生文件选择器接受 Markdown 文件，不再强制文件名为 `SKILL.md`。
2. 主进程拒绝空文件、超限文件、符号链接和疑似二进制内容。
3. 合法 RestX Skill 直接导入，不发送给模型。
4. 其他 Markdown 通过当前 AI Provider 分析结构，只接收受限元数据。
5. 模型未配置、超时、请求失败或响应无效时，从 Frontmatter、一级标题和文件名生成本地元数据，仍完成导入。
6. 所有路径都写入现有 `~/.restx/skills/<skill-id>/SKILL.md`，保持 schema version 1。

## 本地兜底顺序

- 名称：Frontmatter `name` / `title` → 第一个 Markdown H1 → 文件名。
- 说明：Frontmatter `description` / `summary` → 空字符串。
- 所有字段继续使用现有长度限制；无效 YAML 只被忽略，不阻止安全 Markdown 导入。

## API 与界面

导入结果增加 `analysis.method`：`direct`、`ai` 或 `fallback`，并可携带受限的 `detectedFormat` 与安全 warning。按钮改为“智能导入 Skill”，界面说明非 RestX 内容可能发送到当前 Provider，并分别显示直接、AI 和兜底成功提示。

## 安全与隐私

源 Skill 按不可信数据发送，系统提示要求忽略其中指令。模型返回的未知字段全部丢弃；源内容、原始响应、绝对路径和 Provider 信息不进入日志或 IPC 结果。导入期间拒绝重复请求。

## 验收

精简自动化测试覆盖 direct、AI、fallback、内容保真、恶意模型输出、空文件、二进制、符号链接和重复导入。随后使用隔离的 `RESTX_SKILLS_ROOT` 启动真实 Electron，导入一个非 RestX Skill，确认页面反馈和最终文件正文。
