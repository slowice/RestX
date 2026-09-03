# 邮件模板动态数据行开发交接

## 当前目标

让邮件模板中的一行示例表格绑定 JSON 数组，并在最终预览、富文本复制和经典 Outlook 草稿中按数组项数量展开。外部 Skill 只负责生成 JSON；RestX 不采集业务数据。

## 开发状态

- 分支：`codex/mail-template-dynamic-rows`
- 基线：`3d87c6c feat: support multiline tasks and resizable columns`
- 当前阶段：蓝区 worktree 实现与真实 Electron 聚焦验证
- 当前提交：无。本需求 worktree 中禁止提交和推送，确认后才整合到本地 `main`。

关键文件：

- `src/features/mail-template/renderer/RichMailEditor.tsx`
- `src/features/mail-template/renderer/dynamic-rows.ts`
- `src/features/mail-template/renderer/MailTemplatePage.tsx`
- `src/features/mail-template/renderer/mail-template.css`
- `src/features/mail-template/renderer/template-storage.ts`
- `src/features/mail-template/shared/rich-body.ts`
- `src/features/mail-template/shared/template-engine.ts`

## 预期调用路径

1. 编辑器把当前 `tableRow` 的数组路径和别名保存为 `data-repeat-path`、`data-repeat-alias`。
2. 模板态清洗和 v2 本地存储保留这两个受控属性；普通粘贴不能注入绑定属性。
3. 页面合并默认 JSON 与本次 JSON，调用 `expandDynamicRows`。
4. 动态行渲染器检查绑定、数组成员、缺失字段和 `rowspan`，克隆示例行并只替换文本节点。
5. 最终邮件清洗移除全部 `data-repeat-*`，再交给既有普通变量渲染。
6. 同一个 `rendered.draft` 驱动预览、富文本剪贴板和 Outlook IPC。

## 诊断标记

- `[mail-template:dynamic-rows][00] editor-updated / editor-synchronized / binding-updated`：编辑器内容、外部同步和行绑定 transaction，只记录长度及绑定是否存在，不记录正文。
- `[mail-template:dynamic-rows][01] render-start`：页面开始解析动态行，只记录绑定数和顶层数据键数量。
- `[mail-template:dynamic-rows][02] binding-resolved`：每个绑定的解析结论，只记录路径、状态和数组项数量。
- `[mail-template:dynamic-rows][03] render-complete`：最终生成行数、错误数和提示数。
- `[mail-template:dynamic-rows][04] handoff-ready`：没有阻断错误，准备复制或调用 Outlook；只记录动作和计数。

日志不得增加 JSON 内容、邮件正文、收件人、标题或 Skill 原始输出。

## 已确认事实

- 旧模板没有绑定属性时仍走原普通变量渲染路径。
- 一张表最多一个动态行；不同表可绑定不同数组。
- 动态行允许 `colspan`，拒绝单元格 `rowspan > 1`。
- 空数组删除示例行并产生非阻断提示。
- 最终邮件态 sanitizer 不允许 `data-repeat-*`。
- 真实 Electron 中，实际点击粘贴后的表格行只产生一次正文点击，不再额外触发工具栏“撤销”。根因是旧实现用 `<label>` 包住整个富文本编辑器，浏览器会把正文点击转发给其中第一个按钮；正文现改为 `role="group"` 容器。
- `items` 三个对象生成三行，连同固定表头共四行；最终预览没有内部绑定属性。
- 空数组保留固定表头、删除示例行，显示 `items 没有数据。`，Outlook 按钮保持可用。
- 非数组、非对象成员和缺少行字段分别显示精确阻断错误。
- 两张表绑定不同数组时分别得到 2 行和 3 行数据；`colspan=2` 保留；同表两个绑定会阻断。
- “复制数据示例”生成邮件级变量和一项 `items` 对象；富文本剪贴板内容含生成数据且不含 `data-repeat-*`。
- v2 内存存储往返保留绑定属性，旧模板不产生绑定属性。
- 动态行包含真实 `rowspan=2` 时，绑定操作直接拒绝。

## 已完成的运行证据

在本 worktree 的真实 Electron renderer（CDP `9337`）进入 `#/mail-templates`，使用未保存的临时模板状态完成：

1. 实际点击示例行并绑定 `items`。
2. 三对象、空数组、非数组、非对象成员和缺字段分支。
3. 动态行 `rowspan` 拒绝、多个表独立展开、同表重复绑定拒绝和 `colspan` 保留。
4. JSON 示例剪贴板和最终富文本剪贴板。
5. v2 临时内存存储往返与旧模板兼容。

图像验收：

- `/private/tmp/restx-dynamic-row-binding-final.png`：编辑专注模式、动态行轮廓及外置标签，`PASS`。
- `/private/tmp/restx-dynamic-rows-three-items.png`：预览专注模式、三个生成数据行、Outlook 可打开状态，`PASS`。

## 剩余环境证据

macOS 开发环境没有调用 Windows 经典 Outlook。Windows 验收只需确认同一份最终草稿能打开且表格显示正常；渲染与内部属性清理已经在 Electron 预览及富文本剪贴板路径确认。

需要图像验收时只接受真实 Electron renderer 的 CDP 截图；普通浏览器页面不作为结论。

## 黄区检查边界

黄区 AI 只运行应用、操作上述单一路径并检查 DevTools 标记和当前 renderer 身份。不要修改源码、模板存储结构、Outlook IPC 或测试文件；不要粘贴完整邮件、完整 JSON 或完整日志。若 `[01]` 后缺少 `[02]`，报告首个 renderer 错误后停止；若有 `[03]` 且页面错误与计数不符，只报告对应路径的状态和页面结果；若复制或 Outlook 按钮可用但没有 `[04]`，报告动作名称后停止。

## 固定回复模板

仅回复：`[01-04] 出现情况；运行路径/版本；操作成功或失败；首个有效错误；基于标记的一句结论。`
