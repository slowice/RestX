# Design: Preset-driven AI tool discovery and folder browser

## Goals

- Make supported AI tools visible immediately after scanning a user directory.
- Avoid the noisy flat list produced by generic recursive scanning.
- Make adding another AI tool a small preset-only change.
- Preserve RestX's read-only main-process security boundary and existing config detail flow.

## 1. Preset code location

Preset production code will live here:

```text
src/main/presets/ai-tools/
├── types.ts
├── codex.ts
├── claude-code.ts
├── opencode.ts
└── index.ts
```

`index.ts` is the only registry. To add a tool later, create one preset file and add one export/registry entry; the detector, scanner, IPC, and UI must not require tool-specific branches.

The implementation is split into a stable framework and replaceable preset data:

```text
src/main/services/ai-tool-discovery/     # Stable framework; knows no tool ids
├── detector.ts                          # Evaluates probes
├── scoped-scanner.ts                    # Applies source/pattern/exclusion rules
├── folder-tree.ts                       # Builds generic folder/category nodes
└── preset-validator.ts                  # Rejects unsafe or ambiguous presets

src/main/presets/ai-tools/               # Replaceable tool definitions
├── types.ts
├── codex.ts
├── claude-code.ts
├── opencode.ts
└── index.ts
```

Dependency direction is one-way: the framework depends only on the `AiToolPreset` contract; individual presets contain data and never import scanner, IPC, cache, or UI code. The renderer consumes `DetectedAiTool` and `ToolFolderNode` contracts and never imports the preset registry.

Conceptual preset contract:

```ts
type AiToolPreset = {
  id: string
  displayName: string
  version: number
  probes: Array<{
    relativePath: string
    entryType: 'file' | 'directory'
  }>
  sources: Array<{
    relativePath: string
    label: string
    patterns: Array<{
      glob: string
      kind: 'config' | 'instruction' | 'log'
    }>
    excludes?: string[]
    maxDepth: number
  }>
}
```

Paths are relative to the user directory selected for scanning. This keeps preset data portable across macOS, Linux, and Windows user profiles and prevents a preset from escaping the authorized root.

Presets are intentionally declarative. A preset may describe probes, sources, match patterns, exclusions, labels, and limits, but may not provide arbitrary callbacks. This keeps detection auditable and prevents a future preset from executing code or bypassing path authorization. If a genuinely new discovery mechanism is needed later, it must be added as a generic framework capability and exposed through the shared contract rather than embedded in one tool preset.

The registry validates unique ids, supported schema versions, relative paths, bounded limits, non-overlapping source ids, and safe glob patterns at startup. One invalid third-party/future preset is skipped with a diagnostic and must not break detection of other tools.

## 2. Initial preset boundaries

### Codex

- Detection: `.codex/` directory.
- Configuration: `.codex/config.toml` and safe user-authored configuration files.
- Instructions: `.codex/AGENTS.md`.
- Logs: text log files below known `.codex/log` or `.codex/logs` paths when present.
- Excluded by default: `auth.json`, SQLite files, caches, session JSONL, shell snapshots, attachments, and temporary files.

### Claude Code

- Detection: `.claude/` directory or `.claude.json` file.
- Configuration: `.claude/settings.json`, `.claude/settings.local.json`, and `.claude.json`.
- Instructions: `.claude/CLAUDE.md` and other explicitly declared user instruction files.
- Logs: known text logs in `.claude` log/debug locations.
- Excluded by default: credentials, project transcripts, telemetry, file history, backups, caches, and lock files.

### OpenCode

- Detection: `.config/opencode/`, `.local/share/opencode/`, or `.opencode/`.
- Configuration: `opencode.json`, `opencode.jsonc`, `tui.json`, and `tui.jsonc` under `.config/opencode`.
- Extensions/instructions: explicitly matched files below `.opencode/` or `.config/opencode`.
- Logs: `.local/share/opencode/log/**/*.log`.
- Excluded by default: `auth.json`, databases, WAL/SHM files, project/session storage, caches, and plugin packages unless later requested.

OpenCode officially uses `~/.config/opencode` for global configuration and `~/.local/share/opencode/log` for logs. Claude Code officially uses `~/.claude` for user scope. Codex uses `~/.codex/config.toml` by default. Presets should remain versioned because vendors can change these locations.

## 3. Two-stage scan

### Stage A: direct discovery

For every registered preset, resolve each probe beneath the authorized scan root and call `lstat`. A matching file or directory marks the tool as detected and becomes visible evidence in the UI. This stage does not recurse and does not read content.

Known hidden paths are allowed only because they are exact preset probes. The current blanket rule that ignores directories beginning with `.` remains in place for generic scanning.

### Stage B: scoped candidate collection

Only for detected tools, resolve the preset's sources and walk them with the preset's small depth and file limits. Match explicit patterns, reject symlinks, enforce path containment, and collect metadata. Empty directories and unmatched files do not enter the result tree.

When the selected root is a user home, generic recursive scanning is disabled by default. The user can explicitly choose “扫描其他候选” if they need the old behavior. For a project directory, generic scanning can remain available as a separate result group.

## 4. Result model

`ScanResult` will be extended, not replaced immediately:

```ts
type DetectedAiTool = {
  id: string
  displayName: string
  status: 'detected' | 'not-detected'
  evidence: Array<{ path: string; entryType: 'file' | 'directory' }>
  counts: { config: number; instruction: number; log: number }
  folders: ToolFolderNode[]
}

type ToolFolderNode = {
  id: string
  name: string
  path: string | null
  role: 'tool' | 'category' | 'physical'
  counts: { config: number; instruction: number; log: number }
  children: ToolFolderNode[]
  files: ScanCandidate[]
}
```

The existing flat `candidates` array remains temporarily as a derived index for search and backward compatibility. Each candidate gains `toolId`, `sourceId`, and `relativePath`. A later migration may remove the legacy array after all consumers use `tools`.

The tree is semantic first and physical second:

```text
AI 工具
├── Codex
│   ├── 配置
│   ├── 指令
│   └── 日志
├── Claude Code
│   ├── 配置
│   ├── 指令
│   └── 日志
└── OpenCode
    ├── 配置
    ├── 扩展/指令
    └── 日志
```

If matched files are nested, their physical folders appear below the category. Empty categories are hidden.

## 5. Inspector interaction

The completed-scan state becomes a folder browser:

```text
┌────────────────────────────────────────────────────────────┐
│ 已检测到 3 个 AI 工具                                      │
│ [Codex ✓  2配置] [Claude Code ✓  3配置] [OpenCode ✓ 2配置] │
├────────────────────────────────────────────────────────────┤
│ AI 工具 / Codex / 配置                     [搜索当前工具]   │
├───────────────────────────────┬────────────────────────────┤
│ 📁 配置                 2     │                            │
│ 📁 指令                 1     │  点击文件后复用现有         │
│ 📁 日志                 4     │  配置详情 / AI 解析面板     │
│                               │                            │
└───────────────────────────────┴────────────────────────────┘
```

- Top cards show all supported presets. Detected tools are prominent; undetected tools are muted and say “未发现”.
- Clicking a tool card opens its virtual tool folder.
- Clicking a folder navigates into it and updates breadcrumbs.
- Clicking a config/instruction file reuses `ConfigDetail`; logs remain metadata-only until log browsing is implemented.
- Search defaults to the current tool. A “全部工具” scope groups hits by tool and folder instead of flattening them.
- The UI says “已检测到本地数据” rather than claiming executable-level installation.
- On narrow windows, the existing detail panel becomes an overlay; folder navigation remains the main pane.

## 6. Security and noise controls

- Discovery reads only entry metadata.
- Exact preset roots may bypass the hidden-directory ignore rule; arbitrary hidden directories may not.
- Every resolved path must remain inside the authorized scan root after `realpath`.
- Symlinks are skipped consistently.
- Credentials, databases, sessions, telemetry, caches, and temporary files are excluded by default even when their extensions look like config/log files.
- Preset-specific limits prevent a large session or plugin directory from exhausting the global file cap.
- Config content is still opened only on click and goes through the existing size limit, parsing, and redaction pipeline.

## 7. Trade-offs

- A leftover tool directory can produce a detected result after the binary is removed. This is why the product language reports local evidence rather than executable installation.
- Presets need maintenance as vendors change paths. Keeping them isolated and covered by fixture tests makes that maintenance cheap.
- Disabling broad generic scan for a user home may omit unknown tools, but it is the key choice that removes noise. The explicit fallback preserves discoverability.
- Project-local tool directories are intentionally deferred. They should later be discovered from selected project roots, not by recursively searching an entire home directory.

## 8. Extension contract

Adding a supported tool must follow this path:

1. Add `src/main/presets/ai-tools/<tool-id>.ts` implementing `AiToolPreset`.
2. Register it in `src/main/presets/ai-tools/index.ts`.
3. Add filesystem fixtures that represent present, absent, inaccessible, and sensitive-file cases.
4. Do not edit detector, scoped scanner, folder-tree builder, shared IPC handlers, or Inspector rendering code.

CI will include an architecture test that loads a synthetic fourth preset and verifies that it is discovered and rendered into the same generic result contract. This is the proof that the feature remains extensible rather than only supporting the initial three tools.

## 9. Implementation sequence

1. Add preset types, the three preset files, fixtures, and registry validation tests.
2. Add direct tool detection and scoped candidate scanning tests.
3. Extend shared contracts while preserving the current flat candidate index.
4. Build the semantic/pruned folder tree.
5. Replace the Inspector flat list with tool cards, breadcrumbs, and folder navigation.
6. Reuse the current config detail and AI cache flow from folder file rows.
7. Add home-directory performance, permission, symlink, exclusion, and empty-state tests.
