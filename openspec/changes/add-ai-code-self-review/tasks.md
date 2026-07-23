## 1. Contracts and source adapters

- [x] 1.1 Add shared code-review types for zones, source previews, requests, findings, results, and settings
- [x] 1.2 Implement GitCode URL parsing, PAT-authenticated metadata/files requests, response limits, and error mapping
- [x] 1.3 Add the platform-neutral merge request adapter registry and CodeHub not-configured adapter
- [x] 1.4 Implement safe GitCode PAT storage with public settings and connection-test operations

## 2. Rule packs and review engine

- [x] 2.1 Add validated Skill-style Markdown rule-pack definitions for security, bugs, logging, tests, and consistency
- [x] 2.2 Implement diff line extraction, input budgeting, prompt construction, and strict finding validation
- [x] 2.3 Implement zone-enforced OpenAI-compatible code review calls without code-bearing request/response logs
- [x] 2.4 Add seven-day fingerprinted result caching with secure-storage encryption or memory-only fallback
- [x] 2.5 Implement the review orchestration service for source preview, cache lookup, model execution, and result aggregation

## 3. Electron integration

- [x] 3.1 Extend the typed preload API with source preview, review execution, GitCode settings, and cache operations
- [x] 3.2 Register validated IPC handlers that enforce adapter zones and credential boundaries in the main process
- [x] 3.3 Extend settings UI with GitCode PAT configuration and blue/yellow code-review service status

## 4. Code review interface

- [x] 4.1 Add the “代码自检” workspace module and route
- [x] 4.2 Build the source/zone panel with GitCode PR paste, CodeHub placeholder, requirements input, and loading states
- [x] 4.3 Build the change preview with MR state, branches, file statistics, exclusions, and estimated input size
- [x] 4.4 Build structured result summary, severity/category filters, findings, cache state, retry, and empty/error states
- [x] 4.5 Add responsive styling that distinguishes blue/yellow zones with text and icons as well as color

## 5. Verification

- [x] 5.1 Add unit tests for GitCode URL/response parsing, authentication errors, limits, and CodeHub placeholder behavior
- [x] 5.2 Add unit tests for Markdown rules, prompt/finding validation, zone rejection, and cache invalidation
- [x] 5.3 Add renderer tests for GitCode preview, review results, errors, and region switching
- [x] 5.4 Run typecheck, all tests, build, and a manual Electron UI smoke test

## 6. Visual alignment and application identity

- [x] 6.1 Align the code-review workspace with RestX light surfaces and green interaction tokens while preserving blue/yellow zone semantics
- [x] 6.2 Generate and integrate macOS and cross-platform application icon assets
- [x] 6.3 Set the application display name, window title, packager metadata, and development Dock icon
- [x] 6.4 Run typecheck, tests, build, icon checks, and browser visual QA

## 7. Modular dev integration

- [x] 7.1 Move code review contracts, services, rules, preload API, renderer UI, and styles into a standalone feature capsule
- [x] 7.2 Register namespaced main, preload, and renderer feature contributions without restoring legacy central directories
- [x] 7.3 Isolate blue/yellow provider storage and expose code-review settings through a public renderer entry and capability
- [x] 7.4 Adapt existing tests to the composed RestX API and pass feature-boundary, typecheck, test, and production build validation

## 8. Current-user Pull Request discovery

- [x] 8.1 Add shared contracts and preload IPC for local Git identity and current-user GitCode Pull Request summaries
- [x] 8.2 Implement safe global Git email discovery, GitCode identity matching, and authenticated open Pull Request listing
- [x] 8.3 Derive per-Pull Request passed, issues, stale, or unreviewed state from the encrypted seven-day cache and current head SHA
- [x] 8.4 Add the selectable Pull Request list, identity state, refresh action, manual-link fallback, and immediate review-status updates to the workbench
- [x] 8.5 Add adapter, cache, IPC, and renderer tests, then run typecheck, test, build, and diff validation

## 9. CodeHub source credential

- [x] 9.1 Add CodeHub PRIVATE-TOKEN contracts, encrypted feature-owned storage, validated IPC handlers, and preload methods
- [x] 9.2 Add CodeHub PRIVATE-TOKEN save, replace, configured-state, and removal controls beside the GitCode source settings
- [x] 9.3 Add storage, preload, and renderer tests, then run typecheck, test, build, and diff validation
