## Why

RestX 当前多个页面使用 7px～10px 的用户信息文字，尤其 AI 历史记录中的问题摘要、路径和时间难以持续阅读。同时，历史浏览入口对已有文件定位能力的暴露不一致，用户看到来源路径后仍无法在所有场景直接找到该文件。

## What Changes

- 建立全应用固定的语义字号基线，并迁移平台与各特性 renderer 中承担信息传达的小字号文本。
- 重点优化 AI Inspector 历史列表、搜索结果和 JSONL 详情的文字层级及放大后的布局。
- 在所有展示真实历史来源文件的入口提供统一的“打开文件位置”操作。
- 复用现有受控 IPC 能力，补充文件存在性检查和可恢复的 renderer 错误反馈，不扩大文件访问授权范围。

## Capabilities

### New Capabilities

- `readable-renderer-typography`: 规定全应用用户信息文字的语义字号下限及关键页面可读性要求。
- `history-file-reveal`: 规定 AI 历史来源文件在各浏览入口中的受控定位行为和失败反馈。

### Modified Capabilities

无。仓库当前没有已同步的主规格；本次不追溯修改既有 change 目录中的历史规格。

## Impact

- `src/platform/renderer/`：新增稳定的语义字号变量并迁移平台 UI。
- `src/features/*/renderer/`：迁移各特性字号并做必要的局部布局适配。
- `src/features/ai-inspector/renderer/`：统一定位入口和错误反馈。
- `src/features/ai-inspector/main/`：收紧现有 `revealInFolder` 处理器的文件检查。
- 现有 shared/preload API、持久化数据和依赖保持不变，无破坏性变更。
