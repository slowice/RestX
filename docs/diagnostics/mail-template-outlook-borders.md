# Outlook 表格边框开发记录

- 目标：预览中的默认表格边框在 Outlook 草稿中保留，同时尊重自定义边框及显式无边框。
- 静态原因：renderer CSS 提供默认单元格边框，旧版 Outlook 正文直接使用 bodyHtml，没有这些页面样式。
- 修改：mail-template/main/outlook-body.ts 在生成 Outlook 正文时前置默认内联样式，源内联样式随后覆盖；不改写存储中的正文。
- 开发状态：未提交。上一项邮件图片/表格导入修改独立保留。
- 本地功能尝试：真实 Electron 粘贴含默认边框、红色双线及无边框的合成表格，并点击打开 Outlook。本机 Outlook 2016 停在首次配置向导，创建草稿超时，不能据此确认 Outlook 渲染。临时向导已关闭。
- 临时日志与本记录按 blue-yellow-development-loop 在明确上库前检视时清理或标记完成。

## 第 01 轮：确认内联边框正文已进入 Outlook

- 状态：等待黄区分析
- 当前唯一问题：当前运行的 RestX 是否已经使用包含内联边框的正文成功创建 Outlook 草稿？
- 用户操作：重启更新后的 RestX；复制原来出现问题的表格；点击“在 Outlook 中打开”；观察边框并记录这次操作时间。无需发送邮件。
- 预期路径：renderer → mailTemplates.openDraft → serializeDraft → prepareOutlookBody → PowerShell → Outlook HTMLBody。
- 运行身份：源码包含 inline-table-borders-v1；构建产物、安装文件及当前进程是否已更新须看本轮运行日志，不能从源码推定。
- 日志：用户主目录下 `.restx/logs/mail-template-YYYY-MM-DD.jsonl`，仅检查这次操作时间附近。
- `[mail-template][R01-01]`：正文已准备好；implementation 应为 inline-table-borders-v1；tables/cells 是数量；cellsWithBorder 应等于 cells。该数值包含显式 border:none，不代表所有单元格都要显示边框。
- `[mail-template][R01-02]`：Outlook 草稿创建返回成功，不等同于肉眼边框验收通过。
- `[mail-template][R01-03]`：草稿创建失败，检查同条记录中的非敏感错误分类。
- 判定：准备标记缺失时不能确认新实现运行；有准备标记但没有成功标记时定位打开草稿边界；准备和成功均存在说明新正文已进入创建流程，实际边框效果仍以用户观察为准。
- 黄区 AI 只读取本文件最下方“等待黄区分析”轮次和指定日志，不启动、构建、安装、点击或修改代码；返回证据后停止，下一步由蓝区决定。

### 固定回复模板

只回复以下行，缺失证据填“未确认”，不以源码或推断补齐；“结论”是最后一行。

```text
轮次：第 01 轮
日志序列：R01-01=<有/无>，R01-02=<有/无>，R01-03=<有/无>
运行身份：implementation=<日志值/未确认>
表格数量：tables=<值/未确认>，cells=<值/未确认>，cellsWithBorder=<值/未确认>
结果：<成功/失败/未到达>
首个有效错误或断点：<一行/无/未确认>
结论：<仅据本轮日志回答当前唯一问题>
```

### 黄区回报

待用户操作后提供。

### 蓝区结论

待运行证据。
