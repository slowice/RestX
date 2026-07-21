# Change: Browse JSONL conversation events

## Why

Codex and Claude Code store much of their useful conversation history as append-only JSONL event streams instead of traditional `.log` files. RestX currently excludes these files, so the Inspector reports zero logs even though rich session, reasoning, tool-call, and activity data exists.

These files are a core RestX use case, but they cannot be handled like normal configuration files. On the current machine there are 81 session JSONL files totaling about 121 MiB; the largest is about 34 MiB and 19 files exceed 1 MiB. RestX therefore needs bounded line-based paging rather than reading an entire file into memory or sending it across IPC.

## What Changes

- Extend AI tool presets to classify known JSONL paths as conversation sessions, activity history, or indexes.
- Add a generic, main-process JSONL reader with tail-first byte-offset pagination.
- Show JSONL files in the existing tool/folder browser instead of excluding them.
- Add a JSONL event viewer that displays one raw JSON string preview per row.
- Allow each row to open a formatted JSON detail view.
- Extract event tags such as user, assistant, thinking, tool call, tool result, search, system, and error through declarative preset profiles.
- Handle malformed or oversized individual lines without preventing the rest of the file from loading.
- Detect files that grow, rotate, truncate, move, or become inaccessible while open.

## Initial Tool Coverage

| Tool | Conversation files | Activity/index files |
|---|---|---|
| Codex | `.codex/sessions/**/*.jsonl`, `.codex/archived_sessions/**/*.jsonl` | `.codex/history.jsonl`, `.codex/session_index.jsonl` |
| Claude Code | `.claude/projects/**/*.jsonl` | `.claude/history.jsonl` |

Not every JSONL file is a full chat transcript. Session/rollout and project JSONL files contain conversation events; `history.jsonl` is generally input/activity history; `session_index.jsonl` is metadata. RestX will preserve these distinctions in folder names and badges.

## Impact

- Affected presets: Codex and Claude Code source rules, new declarative JSONL tag profiles.
- Affected contracts: candidate viewer type, JSONL page/entry/tag contracts, new `conversation` and `history` candidate kinds.
- Affected main process: bounded reverse reader, line parser, tag extractor, JSONL IPC handlers.
- Affected renderer: conversation/history folders, JSONL file rows, event list and formatted detail panel.
- Existing config reader and AI configuration analysis remain unchanged.

## Non-Goals

- Editing, replaying, deleting, or repairing session files.
- Automatically sending conversation records to an AI provider.
- Interpreting SQLite databases such as Codex `logs_2.sqlite` in this change.
- Reconstructing a polished chat transcript by merging every vendor event into synthetic messages.
- Guaranteeing stable vendor schemas; unknown events remain visible with their raw type as a neutral tag.
