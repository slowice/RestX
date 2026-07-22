## 1. Contracts and presets

- [x] 1.1 Extend JSONL profile contracts and validator with optional session, workspace, and summary paths.
- [x] 1.2 Extend JSONL page request/summary/response contracts for bounded cross-record search and identity metadata.
- [x] 1.3 Declare known identity and content paths in Codex and Claude Code presets and update smart-import guidance.

## 2. Main-process parsing and search

- [x] 2.1 Extract session, workspace, and readable content summaries through generic profile paths.
- [x] 2.2 Add newest-first bounded full-line search beyond the loaded page with scan/truncation metadata.
- [x] 2.3 Validate search input at the IPC boundary while preserving authorization, snapshot, file-type, and symlink checks.

## 3. History navigation UI

- [x] 3.1 Add explicit search submission, loading, result-scope feedback, clear/reset behavior, and search-result tag filtering.
- [x] 3.2 Add time-stream, session, and workspace modes with group counts, latest time, unknown groups, and collapsible headers.
- [x] 3.3 Prioritize readable question/content previews and strengthen full local and relative time presentation.

## 4. Verification

- [x] 4.1 Add service tests for metadata extraction, older-record search, limits, malformed lines, and backward compatibility.
- [x] 4.2 Add renderer tests for search, grouping, reset, content preview, and strong time display.
- [x] 4.3 Run OpenSpec validation, test, typecheck, build, and git diff checks.

## 5. Corrected workspace-first navigation

- [x] 5.1 Add bounded, preset-driven session-file summary extraction to conversation candidates.
- [x] 5.2 Build workspace child folders under the conversation category, including an unknown-workspace fallback.
- [x] 5.3 Add a namespaced, authorized multi-file workspace search contract, service, preload API, and IPC validation.
- [x] 5.4 Extend the list-page navigation and breadcrumb to browse workspace folders and session summary rows.
- [x] 5.5 Add workspace-scoped search results that open the matching session with its query, and simplify single-file detail to a time stream.
- [x] 5.6 Add discovery, search, renderer, security, and regression tests for the corrected hierarchy.
- [x] 5.7 Run OpenSpec validation, test, typecheck, build, and git diff checks.
