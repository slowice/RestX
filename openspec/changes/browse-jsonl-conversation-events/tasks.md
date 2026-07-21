## 1. Contracts and presets

- [x] 1.1 Add conversation/history candidate kinds and viewer metadata.
- [x] 1.2 Add versioned declarative JSONL profile contracts and validation.
- [x] 1.3 Add Codex session/history rules and semantic tag profile.
- [x] 1.4 Add Claude Code project/history rules and semantic tag profile.
- [x] 1.5 Add a synthetic fourth-tool JSONL profile architecture test.

## 2. Main-process JSONL framework

- [x] 2.1 Implement bounded reverse complete-line reading with byte-offset cursors.
- [ ] 2.2 Implement older/newer paging, snapshot validation, and append/truncate detection.
- [x] 2.3 Implement independent JSON parsing, preview generation, timestamps, and malformed/oversized states.
- [x] 2.4 Implement declarative path evaluation, semantic tag mapping, unknown tags, and deduplication.
- [x] 2.5 Add authorized `read-jsonl-page` and `read-jsonl-entry` IPC/preload APIs.

## 3. Tool and folder UI

- [ ] 3.1 Add conversation and activity-history folders with sensitive-data badges.
- [ ] 3.2 Group Codex current/archived sessions and Claude project sessions by source/physical folder.
- [x] 3.3 Add JSONL file rows sorted by modification time with a “查看记录” action.

## 4. Event viewer UI

- [x] 4.1 Add tail-first event list with timestamps, tags, and monospaced raw previews.
- [x] 4.2 Add tag filters and loaded-page text search.
- [x] 4.3 Add selected-entry formatted JSON/raw tabs and explicit copy.
- [ ] 4.4 Add older/newer loading with scroll preservation and changed-file prompts.
- [x] 4.5 Add malformed, oversized, deleted, permission, empty-file, and loading states.

## 5. Verification

- [x] 5.1 Add bounded synthetic fixtures for Codex, Claude Code, malformed JSON, long lines, and UTF-8 boundaries.
- [ ] 5.2 Add cursor, page budget, append, truncation, symlink, authorization, and no-persistence tests.
- [ ] 5.3 Add UI tests for folder discovery, tags, row selection, formatting, filters, paging, and error isolation.
- [x] 5.4 Run typecheck, full tests, production build, packaged macOS smoke test, and OpenSpec strict validation.
