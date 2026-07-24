## Why

RestX 目前可以处理多个独立任务，但缺少把日常问题沉淀为系统知识的本地工作流。用户已经用零散 Markdown 记录具体问题，需要从这些原始记录中逐步归纳场景、能力和知识，而不是被迫预先维护复杂目录或额外文档。

## What Changes

- Add a standalone “知识图谱” feature and navigation entry.
- Recursively scan Markdown problems from `~/.restx/knowledge/`.
- Treat Markdown without valid classification Frontmatter as pending organization.
- Aggregate confirmed `scene`, `capability`, and `knowledge` labels into virtual layered graph nodes.
- Let the user request AI classification for one problem, review/edit the suggestion, and explicitly confirm before writing.
- Reuse RestX's active AI Provider and existing security boundary.
- Back up and atomically update only managed Frontmatter fields while preserving the Markdown body.
- Preview Markdown locally and open it with the system default application.

## Capabilities

### New Capabilities

- `local-knowledge-map`: Build a local layered knowledge graph from Markdown problem records and their confirmed classification metadata.
- `assisted-problem-classification`: Suggest controlled scene, capability, and knowledge labels through the active RestX AI Provider, with explicit human confirmation before file mutation.

### Modified Capabilities

None.

## Impact

- Adds a new blue-zone feature capsule under `src/features/knowledge-map/`.
- Registers the feature through the renderer, main, and preload feature registries and extends the composed `RestXApi` type.
- Adds bounded local filesystem access scoped to `~/.restx/knowledge/`.
- Reuses the platform AI Provider registry without adding credentials or a new provider configuration.
- Adds feature-owned tests and no database or new runtime dependency.
