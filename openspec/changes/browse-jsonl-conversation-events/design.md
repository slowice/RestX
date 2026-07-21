# Design: Streaming JSONL event browser

## Goals

- Make Codex and Claude Code JSONL sessions visible as first-class RestX data.
- Display every loaded line without requiring RestX to understand its full schema.
- Add useful semantic tags while keeping vendor-specific logic out of the renderer and reader.
- Remain responsive for large append-only files and safe for malformed or sensitive content.

## 1. Product classification

JSONL is a storage format, not a semantic category. Presets assign each known file path to one of these folders:

```text
AI 工具
├── 配置
├── 指令
├── 会话记录       # Full event streams, rollout/session/project files
├── 活动历史       # Prompt/input history and session indexes
└── 运行日志       # Traditional operational .log files
```

This avoids calling every JSONL file a log. Candidate kinds become:

```ts
type CandidateKind =
  | 'config'
  | 'instruction'
  | 'conversation'
  | 'history'
  | 'log'

type CandidateViewer = 'config' | 'jsonl' | 'metadata'
```

The viewer type, rather than a filename extension or candidate kind, determines which detail component opens. This keeps the renderer generic and allows a future plain-text log viewer or SQLite metadata viewer.

## 2. Preset extension and code boundaries

Codex and Claude Code presets add JSONL match rules and declarative profiles:

```ts
type JsonlProfile = {
  id: string
  timestampPaths: string[]
  tagRules: Array<{
    path: string
    values?: Record<string, { label: string; tone: JsonlTagTone }>
    fallback?: 'raw-value' | 'ignore'
  }>
}

type AiToolMatchRule = {
  glob: string
  kind: CandidateKind
  label: string
  viewer: CandidateViewer
  jsonlProfileId?: string
}
```

Paths support a small validated expression subset such as `type`, `payload.type`, `payload.role`, `message.role`, and `message.content[*].type`. They are data paths, not JavaScript callbacks.

The generic implementation lives under:

```text
src/main/services/jsonl-browser/
├── reverse-line-reader.ts
├── jsonl-parser.ts
├── tag-extractor.ts
└── jsonl-browser-service.ts
```

Tool presets declare where JSONL files live and how values map to labels. The reader, IPC layer, contracts, and React components never branch on `codex` or `claude-code`.

## 3. Initial tag profiles

### Codex

Observed structural fields include top-level `type`, `payload.type`, `payload.role`, and nested `payload.content[*].type`.

Initial semantic mappings include:

| Raw values | UI tag |
|---|---|
| `user`, `user_message` | 用户 |
| `assistant`, `agent_message` | 助手 |
| `reasoning`, `agent_reasoning`, `summary_text` | 思考 |
| `function_call`, `custom_tool_call`, `tool_search_call` | 工具调用 |
| `function_call_output`, `custom_tool_call_output`, `tool_search_output` | 工具结果 |
| `web_search_call`, `web_search_end` | 网络搜索 |
| `task_started`, `task_complete`, `turn_aborted` | 任务状态 |
| `session_meta`, `turn_context`, `world_state`, `compacted` | 系统/上下文 |

### Claude Code

Observed structural fields include top-level `type`, `subtype`, `message.role`, and `message.content[*].type`.

Initial semantic mappings include:

| Raw values | UI tag |
|---|---|
| `user` | 用户 |
| `assistant` | 助手 |
| `system` | 系统 |
| `thinking` | 思考 |
| `text` | 文本 |
| `tool_use` | 工具调用 |
| `tool_result` | 工具结果 |
| `attachment`, `file-history-snapshot` | 附件/快照 |
| `turn_duration` | 性能 |

Unknown values are kept as bounded neutral tags rather than hiding the event. Duplicate tags are removed and each row displays at most four; remaining tags are available in the detail header.

## 4. Main-process paging API

JSONL content stays in the Electron main process until a bounded page or one selected entry is requested.

```ts
type JsonlPageRequest = {
  path: string
  cursor?: string
  direction?: 'older' | 'newer'
  limit?: number
}

type JsonlEventSummary = {
  offset: string
  byteLength: number
  rawPreview: string
  timestamp: string | null
  tags: JsonlTag[]
  parseStatus: 'valid' | 'invalid' | 'oversized'
}

type JsonlPage = {
  file: { path: string; sizeBytes: number; modifiedAt: string; snapshotId: string }
  entries: JsonlEventSummary[]
  olderCursor: string | null
  newerCursor: string | null
  changed: boolean
}

type JsonlEntryDetail = {
  offset: string
  raw: string
  formatted: string | null
  value: unknown | null
  tags: JsonlTag[]
  parseError: string | null
}
```

IPC endpoints:

- `inspector:read-jsonl-page`
- `inspector:read-jsonl-entry`

Both validate argument types, authorization, regular-file status, `.jsonl` extension, symlinks, cursor bounds, file snapshot, page limits, and individual-line limits.

## 5. Tail-first reverse reading

Conversation files are append-only and users normally want the latest records first. Opening a file therefore reads the last page, not the entire file:

1. Start at the current file size.
2. Read bounded blocks backwards until 100 complete lines or the 2 MiB page budget is reached.
3. Return entries in chronological order with the earliest byte offset as `olderCursor`.
4. Loading older events repeats from that cursor and prepends the page without losing scroll position.
5. If the file appends, expose a “有新记录” action using the prior snapshot size as `newerCursor`.

Byte offsets are serialized as decimal strings and treated as opaque renderer cursors. The main process parses and bounds-checks them. No full-file line index or content cache is required.

Default limits:

- 100 events per page, hard maximum 200.
- 2 MiB combined read budget per page.
- 1 MiB maximum for one full entry detail.
- 800 Unicode characters for a row preview.
- A line beyond the detail limit remains listed with an `超长记录` tag and truncated raw detail.

These limits are independent of total file size, so a 34 MiB session can open immediately.

## 6. Parsing and malformed lines

Each complete line is parsed independently with `JSON.parse`; no evaluation or schema-specific deserialization occurs.

- Valid object/array/primitive JSON remains displayable.
- Empty lines are skipped but retain cursor correctness.
- Invalid JSON gets an `解析失败` tag and raw-only detail.
- One invalid or oversized line does not fail the page.
- UTF-8 decoding uses replacement reporting; files with NUL bytes are rejected as non-text.
- Formatted output uses `JSON.stringify(value, null, 2)` and is rendered as text, never HTML.

## 7. Event viewer UI

Clicking a JSONL candidate opens `JsonlDetail` in the existing Inspector detail area.

```text
┌──────────────── JSONL 事件 ────────────────────────────────┐
│ session.jsonl · 34 MB · 有新记录                           │
│ [全部] [用户] [助手] [思考] [工具调用] [工具结果]   搜索   │
├────────────────────────────────────────────────────────────┤
│ 17:42:10 [用户]       {"timestamp":"…","type":"…"…}  │
│ 17:42:18 [思考]       {"timestamp":"…","payload":{…}}  │
│ 17:42:20 [工具调用]   {"timestamp":"…","payload":{…}}  │
│ 17:42:21 [工具结果]   {"timestamp":"…","payload":{…}}  │
│                 [加载更早记录]                             │
├──────────────── 选中记录 ──────────────────────────────────┤
│ [工具调用] [assistant]                         offset …     │
│ {                                                          │
│   "type": "response_item",                                │
│   "payload": { ... }                                      │
│ }                                                          │
└────────────────────────────────────────────────────────────┘
```

List behavior:

- Each row shows timestamp when available, up to four tags, and a one-line monospaced raw JSON preview.
- Rows are keyboard selectable and preserve the original order.
- Tag filters operate on loaded pages; text search is explicitly labeled “搜索已加载记录”.
- Selecting a row requests only that entry's full bounded detail and shows pretty JSON.
- Detail offers “格式化 JSON” and “原始行” tabs plus an explicit copy action.
- Loading older events preserves current scroll position.
- A changed/truncated file displays a non-destructive refresh prompt instead of silently mixing snapshots.

Folder/file behavior:

- Codex shows separate source groups such as “当前会话” and “已归档会话”.
- Claude Code groups project sessions beneath their preset source/physical project folder.
- Files sort by modification time descending; UUID filenames retain their relative path and metadata.

## 8. Privacy and security

Conversation JSONL may contain prompts, model reasoning, tool arguments/results, source code, file paths, environment details, and secrets.

- The viewer is local-only and never invokes the configured AI provider automatically.
- Raw lines and parsed values are never persisted to `localStorage`, analysis cache, or RestX AI call logs.
- The UI marks conversation/history folders as sensitive local data.
- Opening a JSONL file is an explicit user action.
- Renderer output uses normal text nodes and `<pre>`, never `dangerouslySetInnerHTML`.
- Copying an event is explicit; there is no bulk export in this change.
- Credentials such as `auth.json` remain excluded even if a future vendor stores them as JSONL.

## 9. File changes and errors

- Append-only growth: keep loaded entries and offer “加载新记录”.
- Truncation/rotation: invalidate cursors and ask the user to refresh.
- Deleted/moved file: keep the file row metadata and show a clear not-found state.
- Permission loss: show a permission error without affecting other sessions.
- Snapshot identity uses resolved path, size, and high-resolution modification time; it does not hash the entire large file.

## 10. Implementation sequence

1. Extend preset and candidate contracts with viewer/category/profile data.
2. Add Codex and Claude Code JSONL rules and profile validation.
3. Implement and test reverse line paging with byte cursors and limits.
4. Implement independent parsing, timestamp extraction, and declarative tagging.
5. Add typed IPC/preload APIs for page and entry reads.
6. Add conversation/history folders and grouped JSONL candidates to Inspector.
7. Build `JsonlDetail` list, tag filters, formatted/raw detail, paging, and changed-file states.
8. Verify against synthetic fixtures plus bounded structural fixtures representing both vendor formats.
