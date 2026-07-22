## ADDED Requirements

### Requirement: Preset-driven history identity extraction
The system SHALL allow each JSONL profile to declaratively provide ordered paths for session identity, workspace identity, and human-readable content, and SHALL expose the first usable value for each field in event summaries without tool-specific parser branches.

#### Scenario: Known Codex history record is summarized
- **WHEN** a Codex history row contains a session id, timestamp, and user text on paths declared by the Codex profile
- **THEN** its summary contains that session id, normalized timestamp, and user text preview

#### Scenario: Metadata is absent
- **WHEN** none of a profile's optional identity paths resolve to usable text
- **THEN** the event remains browsable with null identity fields and a raw JSON fallback preview

#### Scenario: Existing user preset has no identity paths
- **WHEN** RestX loads a valid version 1 user preset created before this change
- **THEN** the preset remains valid and its JSONL records remain browsable

### Requirement: Conversation list is organized by workspace and session
The system SHALL organize conversation candidates on the file-list page as `workspace → session`, SHALL show session count and latest activity for each workspace, and SHALL place sessions without workspace metadata into an explicit unknown workspace.

#### Scenario: User opens conversation records
- **WHEN** detected conversation files belong to multiple workspaces
- **THEN** the conversation category first displays distinct workspace folders instead of a flat JSONL file list

#### Scenario: User enters a workspace
- **WHEN** the user opens one workspace folder
- **THEN** the page lists only that workspace's session files using first user question, full time, session id, and file name as locating information

#### Scenario: Session workspace is unavailable
- **WHEN** a conversation file has no extractable workspace in the bounded header scan
- **THEN** it appears under an “unknown workspace” folder instead of disappearing

### Requirement: Search covers all sessions in the selected workspace
The system SHALL execute a submitted workspace query in the main process across complete JSONL lines from every session file in the selected workspace, SHALL return newest matches up to shared bounded safety limits, and SHALL report scanned files, records, bytes, and whether results are truncated.

#### Scenario: Error text exists in another session
- **WHEN** the user searches inside a workspace and matching error text is present in any session file in that workspace
- **THEN** the result identifies the matching session, question or content, and time without requiring the user to open files one by one

#### Scenario: Search reaches a safety limit
- **WHEN** a search reaches its file, result, record, or byte limit before exhausting the workspace
- **THEN** the UI states that the result set is partial and reports the scanned scope

#### Scenario: User clears search
- **WHEN** the user clears an active search
- **THEN** the page restores the selected workspace's session file list

### Requirement: Record time and user content are visually identifiable
The workspace session list and search results SHALL prioritize extracted human-readable user content and SHALL render valid timestamps as full local date and time with seconds plus a relative-time cue.

#### Scenario: User identifies a prior question
- **WHEN** a record has extracted user content and a valid timestamp
- **THEN** the row visibly presents the question preview and full local occurrence time as primary identification information

#### Scenario: Timestamp is unavailable
- **WHEN** a record has no parseable timestamp
- **THEN** the row uses its stable file offset as a fallback and remains selectable

### Requirement: JSONL search retains the existing security boundary
The system MUST apply the existing authorized-path, regular-file, non-symlink, `.jsonl`, profile, request-size, file-count, and per-record safety checks to every file in workspace search requests, and MUST keep scan summaries and search local without writing history content or query text to logs or indexes.

#### Scenario: Renderer submits an invalid query
- **WHEN** a JSONL request contains an empty, oversized, or invalid query value
- **THEN** the main process rejects it before searching the file

#### Scenario: Authorized local search succeeds
- **WHEN** a valid query targets an authorized regular JSONL file
- **THEN** matching summaries are returned without external model calls or persistent search copies
