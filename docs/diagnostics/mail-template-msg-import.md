# MSG 表格变成逐行文字：开发记录

## 范围与事实

- 用户现象：导入 `.msg` 后，表格变为一行文字、空一行、再一行文字。
- 源码：`src/features/mail-template/main/message-import.ts`、`msg-outlook-html.ts`。本轮只修改邮件特性蓝区 main。
- 已发现的分支缺口：字符串 HTML 字段为空时旧代码不再读取二进制 HTML；没有 HTML、但有 compressedRtf 时，旧代码直接使用纯文本。
- 用户原始 MSG 未取得，尚不能确定实际命中了哪一条分支。
- 新行为：清理空字符后优先选择有效 HTML；只有 RTF 而无 HTML 时，以临时副本交给 Windows 经典 Outlook 读取 HTMLBody。原文件不修改、不显示、不保存、不发送。失败时明确报错，不静默退化为纯文本。
- 经典 Outlook 读取使用 OpenSharedItem / HTMLBody，仍需用户环境确认其邮件的恢复效果。
- 开发验证：合成 MSG（空字符串 HTML 字段、有效二进制 HTML、两行三格且含跨两列单元格）经真实 Electron 的文件选择→preload→main→编辑器→预览，均保留一张表、两行及 colspan=2。
- 图像检查：`#/mail-templates`，renderer 1224×755，滚动至正文；截图位于临时目录 `restx-msg-rich-functional-20261020/msg-table.png`，已查看，合成 HTML MSG 的显示为 PASS。RTF 恢复及用户实际邮件未标记通过。
- 未运行自动化测试或仓库质量检查。临时诊断日志在明确上库前检视时移除。

## 第 01 轮：表格在哪个正文分支丢失

- 状态：等待黄区分析
- 当前唯一问题：用户这封 MSG 的表格，是在正文来源选择/恢复时就缺失，还是在安全清理后才缺失？
- 用户操作：重启更新后的 RestX，重新导入同一封 MSG；记录操作时间和页面结果。若需要 RTF 恢复，请先确保 Windows 经典 Outlook 已配置且能正常打开原邮件。
- 调用链：importMessage → MsgReader → HTML 选择 / Outlook RTF 恢复 → importRichBody → 返回 renderer。
- 运行身份：源码标识为 `msg-rich-body-v2`。构建产物、安装文件、当前进程是否使用新代码只能根据本轮日志确认。
- 日志位置：用户主目录 `.restx/logs/mail-template-YYYY-MM-DD.jsonl`，仅查看本次操作时间附近的三条记录。
- `[mail-template-import][R01-01]`：implementation、hasHtml、hasRtf、sourceTables；不含正文或文件名。
- `[mail-template-import][R01-02]`：source 为 msg-html / outlook-rtf / plain-text；recovered 表示是否得到 HTML；sourceTables 是送入清理前的表格数。outlook-rtf 且 recovered=false 表示恢复失败，用户页面会显示原因。
- `[mail-template-import][R01-03]`：outputTables、outputRows、outputCells；这是返回编辑器前的结构计数，不等于视觉验收。
- 判定：标记缺失时无法确认新实现运行；来源是 plain-text 表示没有可恢复富文本；恢复失败则停在 Outlook 边界；sourceTables>0 而 outputTables=0 表示清理阶段丢失；outputTables>0 则解析输出仍有表格，后续需检查 renderer，不能凭此宣称用户问题已修复。
- 黄区 AI 仅检查本文件最下方“等待黄区分析”轮次和指定日志，不启动、构建、安装、点击、修改代码或替用户验收。找到首个断点后停止。

### 固定回复模板

严格只回复下面这些行，日志没有的值填写“未确认”。不得从源码或其他轮次补齐。最后一行“结论”后立即停止。

```text
轮次：第 01 轮
日志序列：R01-01=<有/无>，R01-02=<有/无>，R01-03=<有/无>
运行身份：implementation=<值/未确认>
正文来源：hasHtml=<值/未确认>，hasRtf=<值/未确认>，source=<值/未确认>，recovered=<值/未确认>
表格数量：sourceTables=<R01-02 值/未确认>，outputTables=<值/未确认>，outputRows=<值/未确认>，outputCells=<值/未确认>
首个有效错误或断点：<一行/无/未确认>
结论：<仅用本轮日志回答当前唯一问题>
```

### 黄区回报

待用户实际导入后提供。

### 蓝区结论

等待实际文件的运行证据。

---

## 第 02 轮：真实 XLSX → Outlook MSG → RestX 导入

- 状态：等待黄区分析
- 日期：2026-10-20。
- 承接说明：第 01 轮尚未收到黄区回报。用户补充要求必须使用 Excel 复制得到的 MSG 验证，并明确当前蓝区电脑无法完成验证，转交黄区。本轮替代第 01 轮的待执行操作；保留此前记录，黄区只分析本轮。
- 当前唯一问题：真实 XLSX 表格经 Outlook 保存为 MSG 后，RestX 导入链路的第一个表格结构丢失边界在哪里（或本次日志是否显示结构保留）？
- 蓝区修改：沿用第 01 轮的有效 HTML 选择、RTF 经经典 Outlook 读取 HTMLBody、失败明确报错及三个诊断点；本轮仅补充交接记录，没有新增修复。
- 验证限制：此前合成 MSG 只覆盖部分 HTML 读取分支，不替代本轮；真实 Excel 复制、Outlook 保存 MSG、RTF 恢复及最终页面效果均尚未验证。不得据此前 PASS 声称本问题已修复。

### 代码交接与运行身份

- 当前源码工作区：`E:\xwx1269487\RestX-msg-rich-import`。
- 分支：`codex/msg-rich-import`，基线 `4455d20`；以下修改尚未提交、未合入 main、未推送。只拉取 GitHub main 不会得到本次修复。
- 需要带到黄区的源码改动：
  - `src/features/mail-template/main/message-import.ts`
  - `src/features/mail-template/main/msg-outlook-html.ts`（新增）
  - `src/features/mail-template/main/mail-launch-logger.ts`
  - 本交接文档。
- 用户负责将这些修改带入黄区对应源码环境，并按黄区现有流程构建/启动。构建产物、安装文件和当前运行进程身份目前均未确认；不能以源码文件已存在推断运行代码已更新。
- 本轮复用源码中固定的 `R01-01`、`R01-02`、`R01-03` 标记，不存在 `R02-*` 标记。`R01-01` 的 `implementation=msg-rich-body-v2` 可证明命中新诊断路径，不证明完整安装路径或所有构建产物身份。

### 用户人工操作

1. 在黄区创建并保存真实 `.xlsx` 测试工作簿，仅用合成数据：A1:D1 合并为标题，A2:D2 为四列表头，A3:D5 为三行数据；设置可见的内外边框及表头底色。记录源表为 5 行、4 列布局，包含一个跨 4 列的标题单元格。
2. 用真实 Excel 打开该 XLSX，选择 A1:D5 并复制。在已配置的经典 Outlook 中新建邮件，将表格粘贴到正文，确认此时仍有行列、合并标题和边框。不要将表格以截图或附件方式插入，不要发送邮件。
3. 通过 Outlook 另存为 `.msg`，再打开保存的 MSG，确认表格结构仍在。记录实际邮件格式（HTML / RTF / 未确认），不要仅根据 `.msg` 扩展名判断。优先使用原故障操作使用的格式；若另测另一格式，单独记录时间和结果。
4. 启动包含上述改动的 RestX，通过邮件导入功能选择这个 MSG。记录导入时间、界面提示，以及编辑区和预览区的行列、合并标题、边框是否保留，是否仍出现逐行文字及空行。保留本地截图供人工对照。
5. 若出现 Outlook 配置、权限或文件打开错误，记录界面原始错误并停止本次链路；不要将环境失败算作表格解析失败。将操作结果告诉黄区 AI，再让其读取本轮日志。

### 黄区 AI 检查范围与判定

- 用户负责上述操作；黄区 AI 不构建、不安装、不启动、不点击、不修改代码、不代替用户验收。
- 只读取最后一个“等待黄区分析”轮次及用户指定导入时间附近的 `$HOME/.restx/logs/mail-template-YYYY-MM-DD.jsonl`。多个导入操作按时间分开，不能混用不同尝试的标记。
- 预期调用路径：真实 MSG → 文件选择 → preload → main `importMessage` → MsgReader → HTML 选择或 Outlook 恢复 → `importRichBody` → 返回编辑区及预览。
- 检查三个固定标记及 `importDetails`：
  - `[mail-template-import][R01-01]`：implementation、hasHtml、hasRtf、sourceTables。
  - `[mail-template-import][R01-02]`：source、recovered、sourceTables（清理前）。
  - `[mail-template-import][R01-03]`：outputTables、outputRows、outputCells（返回 renderer 前）。
- 缺少标记：新路径是否执行未确认；先报告缺失边界，不推断已运行新代码。
- `source=plain-text`：本次未选到可用富文本；不能从该结果断言 Excel 或 Outlook 必然丢失了表格。
- `source=outlook-rtf` 且 `recovered=false`：停止在 Outlook 恢复边界。
- R01-02 的 `sourceTables=0`：送入清理前已没有 table 结构；若用户确认保存的 MSG 内有表格，后续由蓝区分析正文读取/恢复分支。
- `sourceTables>0` 而 `outputTables=0`：表格在清理阶段丢失。
- `outputTables>0`：main 输出有表格；计数本身不能证明合并、边框及最终视觉正确。若用户页面仍错，后续由蓝区定位 renderer。
- 停止条件：找到首个有效断点，或确认日志中的输入/输出结构保留，即结束本轮分析。不要扩大到其他功能，不传原邮件、正文、工作簿内容或完整日志到蓝区。
- 用户的视觉反馈与运行日志分开：黄区回报仅填写日志直接证明的事实；用户另外回复页面结果或合成样本截图。日志无记录的值填“未确认”，不得用源码、历史结论或用户反馈填成运行日志证据。

### 黄区 AI 固定回复模板

只在聊天中输出下面这些行，不编辑本文档，不增加标题、说明或修复建议；最后一行“结论”后立即停止。

```text
轮次：第 02 轮
日志序列：R01-01=<有/无>，R01-02=<有/无>，R01-03=<有/无>
运行身份：implementation=<值/未确认>，运行路径及版本=<日志值/未确认>
正文来源：hasHtml=<值/未确认>，hasRtf=<值/未确认>，source=<值/未确认>，recovered=<值/未确认>
表格结构：sourceTables=<R01-02 值/未确认>，outputTables=<值/未确认>，outputRows=<值/未确认>，outputCells=<值/未确认>
结果：<仅描述日志可证明的结果/未确认>
首个有效错误或断点：<一行/无/未确认>
结论：<只回答本轮唯一问题，明确日志无法证明的边界>
```

### 黄区回报

待用户完成人工操作后，由黄区 AI 回报，蓝区追加。

### 蓝区结论

尚无本轮真实链路证据，修复效果待确认。

### 代码交接更新（2026-10-20）

- 用户已明确要求合入 main 并提交到 GitHub，本轮四个文件已整合至本地 main，随本条记录一并提交和推送。
- 上方“尚未合入 main”的描述为交接时的历史状态；黄区应在确认本次提交已同步后拉取最新 main，再执行本轮人工验证。
- 开发诊断标记保留供黄区取证；真实 XLSX → MSG → 导入验证仍待完成，本次提交不代表验证通过。
