## 1. Platform storage foundation

- [x] 1.1 Add the platform-owned `~/.restx` layout helpers for config, cache, logs, presets, and runtime paths
- [x] 1.2 Implement idempotent case normalization and non-overwriting migration from `~/.RestX` and legacy Electron userData
- [x] 1.3 Set Electron userData to `~/.restx/runtime` and delay application feature loading until migration completes

## 2. Persistent writers

- [x] 2.1 Route preferences, AI Provider records, GitCode PAT, and CodeHub PRIVATE-TOKEN stores to `~/.restx/config`
- [x] 2.2 Route analysis and code-review stores to `~/.restx/cache`
- [x] 2.3 Route AI and review logs to `~/.restx/logs` and user presets to `~/.restx/config/presets`

## 3. Verification

- [x] 3.1 Add path, migration, storage-area, startup-order, and regression tests for the new layout
- [x] 3.2 Run typecheck, all tests, production build, OpenSpec status, and diff validation
