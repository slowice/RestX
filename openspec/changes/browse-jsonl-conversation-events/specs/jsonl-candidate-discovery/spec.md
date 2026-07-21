# JSONL candidate discovery specification

## ADDED Requirements

### Requirement: Known JSONL data is classified by meaning

RestX SHALL use tool presets to classify known JSONL paths as conversation, history, or index data rather than treating every `.jsonl` file as an operational log.

#### Scenario: Codex session file is found

- **WHEN** a detected Codex directory contains a JSONL file under `sessions` or `archived_sessions`
- **THEN** RestX includes it in the Codex conversation folder
- **AND** assigns the JSONL viewer and Codex tag profile

#### Scenario: Claude Code project session is found

- **WHEN** a detected Claude Code directory contains a JSONL file below `projects`
- **THEN** RestX includes it in the Claude Code conversation folder
- **AND** preserves its project-relative physical grouping

#### Scenario: Activity history is found

- **WHEN** a known `history.jsonl` or session index file exists
- **THEN** RestX shows it under activity history rather than conversation or operational logs

### Requirement: JSONL rules remain declarative

RestX SHALL express file classification, viewer selection, timestamp paths, and event-tag paths through validated preset data without tool-specific branches in the reader, IPC layer, or renderer.

#### Scenario: Another AI tool adds JSONL sessions

- **WHEN** a future preset registers a valid JSONL profile and matching source rule
- **THEN** its files use the same paging and detail UI without modifying the JSONL framework

### Requirement: Sensitive non-session data remains excluded

RestX SHALL continue excluding credential files, databases, telemetry, caches, and temporary files unless a dedicated safe viewer explicitly supports them.

#### Scenario: Auth file is near session files

- **WHEN** a preset source includes conversation JSONL and an authentication file
- **THEN** only the declared JSONL session files appear in conversation/history folders
