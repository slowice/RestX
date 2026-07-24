# RestX 知识图谱特性设计

## 目标

把独立 KnowledgeLoader 原型迁入 RestX，形成可独立注册、禁用和删除的蓝区特性。特性从 `~/.restx/knowledge/` 中的零散 Markdown 问题出发，通过人工确认的 AI 分类，逐步聚合出场景、能力和知识三类虚拟节点，并用分层路径图展示系统关系。

## 已确认范围

- 知识根目录固定为 `~/.restx/knowledge/`，首次使用时自动创建。
- 递归扫描子目录；隐藏目录、`.restx-backup` 和符号链接不参与扫描。
- 没有有效分类 Frontmatter 的 Markdown 作为“待整理”问题显示。
- 每篇问题只有一个主要场景，可以关联多个能力和知识。
- AI 优先复用已有标签；新标签必须经过用户确认。
- AI 分类按单篇触发，用户确认后才写回 Markdown。
- Markdown 在 RestX 中只读预览，并可交给系统默认应用打开。
- 第一版进入页面时扫描，并提供手动刷新；不持续监听文件系统。
- 复用 RestX 当前激活的 AI Provider，不保存独立凭据。
- 写回前自动备份，只修改受控 Frontmatter，不修改 Markdown 正文。
- 图谱采用“场景 → 能力 → 知识 → 问题”的四列分层路径布局。
- 样式遵循 RestX 白底、浅灰边界和绿色强调色，连线使用清晰但低干扰的细曲线箭头。

## 特性边界

特性位于 `src/features/knowledge-map/`：

```text
knowledge-map/
├── shared/
│   ├── contracts.ts
│   ├── channels.ts
│   └── api.ts
├── main/
│   ├── register.ts
│   └── services/
│       ├── knowledge-scanner.ts
│       ├── markdown-parser.ts
│       ├── knowledge-catalog.ts
│       ├── knowledge-classifier.ts
│       ├── markdown-writer.ts
│       └── knowledge-preferences.ts
├── preload/
│   └── api.ts
└── renderer/
    ├── feature.tsx
    ├── KnowledgeMapPage.tsx
    ├── knowledge-map.css
    └── components/
```

Renderer 只处理结构化 DTO，不读取真实文件路径。main 负责目录创建、扫描、解析、AI 调用、备份、原子写入与系统打开。preload 仅暴露固定方法，不提供通用 channel 或任意路径调用。

特性通过 renderer、main、preload 注册表接入，并在 `RestXApi` 中组合公开类型。Shell、Router 和其他特性不包含知识图谱专用判断。

## Markdown 数据模型

已整理问题使用：

```yaml
---
type: problem
scene: 知识管理器开发
capability:
  - Electron 文件系统集成
  - 知识建模
knowledge:
  - IPC 安全边界
  - YAML Frontmatter
---
```

规则：

- `scene` 是一个非空字符串。
- `capability` 与 `knowledge` 是非空字符串数组。
- 标签去除首尾空白并按不区分大小写匹配，复用已有显示名称。
- 不写入机器 UUID；运行时使用相对知识根目录的规范路径作为受控问题 ID。
- 未知 Frontmatter 字段、注释、字段顺序与正文尽可能保留。

问题状态：

- `pending`：无 Frontmatter，或缺少完整分类字段。
- `organized`：分类字段完整有效。
- `invalid`：YAML 无法解析或受控字段类型错误；允许只读查看，但禁止自动覆盖。
- `unavailable`：文件在扫描后被删除、移动或失去读取权限；提示刷新。

场景、能力和知识在第一版都是由问题标签聚合出的虚拟节点，不创建额外 Markdown。

## 扫描与安全边界

每次扫描重新构建目录快照与标签词表：

- 自动创建知识根目录。
- 只读取 `.md` 和 `.markdown` 常规文件。
- 不跟随符号链接。
- 排除隐藏目录和 `.restx-backup`。
- 设置单文件大小、目录深度和总文件数量上限，越界文件进入跳过摘要。
- IPC 不返回绝对路径，错误消息不包含 Markdown 正文。
- renderer 后续操作只提交当前快照中的问题 ID；main 再次解析并验证其仍位于知识根目录。

第一版不建立数据库，不持久化 Markdown 内容或 AI 响应。`~/.restx/config/knowledge-map.json` 只保存版本化界面偏好，例如折叠的虚拟节点和最后使用的筛选条件。

## AI 分类流程

1. 用户选择一个 `pending` 问题并点击“AI 整理”。
2. main 重新读取该文件，计算内容指纹，并取得当前标签词表。
3. 通过 RestX 当前激活的 AI Provider 请求严格 JSON：一个场景、一个以上能力、一个以上知识。
4. main 对模型输出做结构、长度、数量和字符校验，并把匹配已有词表的标签规范成已有显示名称。
5. renderer 显示可编辑确认界面，明确区分“复用已有”和“新建标签”。
6. 用户确认后提交标签与原内容指纹。
7. main 再次验证文件未变化；若已变化则拒绝写回并要求重新整理。
8. main 保存旧版本到 `.restx-backup/`，通过同目录临时文件与原子替换更新 Frontmatter。
9. 完成后重新扫描，问题从待整理区进入图谱。

AI 不生成或改写正文。没有可用 Provider、输出不合法、网络失败和文件冲突都只返回可操作错误，不修改文件。

## 用户界面

菜单名称为“知识图谱”，路由为 `/knowledge`。页面包含：

- 顶部：知识目录摘要、刷新、打开知识目录。
- 主区域：四列分层路径图。
- 待整理区：未分类问题，显示数量并支持选择。
- 详情区：问题状态、标签、Markdown 只读预览、系统打开、AI 整理。
- 整理对话框：AI 建议、已有/新增标记、可编辑标签和确认写回。

图谱的箭头从场景指向能力、知识和问题。实现时使用可缩放 SVG 曲线路径与清晰箭头标记，并通过实际 RestX 页面视觉验收保证背景对比和连线可见性。小窗口允许图谱区域水平滚动，不压缩节点文字。

空目录显示引导页并提供“打开知识目录”；扫描失败、无 Provider、无效 YAML、AI 失败、文件冲突和写入失败分别显示明确状态，其他问题仍可使用。

## 测试与验证

精简自动化测试覆盖：

- 递归扫描、隐藏目录/备份/符号链接排除和读取边界。
- 无 Frontmatter、有效分类、无效 YAML 与标签规范化。
- 聚合出的场景、能力、知识和问题关系。
- AI 严格输出校验、已有标签复用和不可用 Provider。
- 文件变化冲突、备份、正文保留与原子写回。
- 固定 IPC channel、路径 ID 校验和系统打开边界。
- 页面加载、待整理选择、AI 建议确认和整理后图谱更新。

集中实现完成后运行 `pnpm test`、`pnpm typecheck`、`pnpm build` 和 `git diff --check`，再启动 RestX 验证菜单、扫描、预览、AI 建议、确认写回与图谱更新。UI 改动需要独立视觉验收，Electron 变更需要进程冒烟。

## 验收标准

1. RestX 左侧出现“知识图谱”，其他特性行为不变。
2. 首次进入自动创建并扫描 `~/.restx/knowledge/`。
3. 无 Frontmatter 的 Markdown 出现在待整理区。
4. 有效 Frontmatter 自动聚合成四列分层路径。
5. 单篇 AI 整理优先复用已有标签，并在确认前不改文件。
6. 确认后保留正文和未知元数据，生成备份并更新图谱。
7. 无效 YAML、AI 失败和文件冲突不会损坏原文件。
8. Markdown 可以只读预览并通过系统默认应用打开。
9. 背景、控件、字体、边界和状态色与 RestX 整体风格一致，箭头清晰可见。

## 非目标

- 完整 Markdown 编辑器。
- 批量 AI 自动整理。
- 持续文件监听。
- SQLite、全文搜索或向量数据库。
- 独立的场景、能力、知识 Markdown。
- 跨设备同步、团队协作或云端知识库。
