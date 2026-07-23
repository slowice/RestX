## 1. Portable preset path contract

- [ ] 1.1 Add failing validator tests for `path`, `platforms`, supported variables, mutually exclusive relative/absolute declarations, and terminal-only wildcards.
- [ ] 1.2 Extend the shared preset types and validator while preserving all existing version-1 relative presets.
- [ ] 1.3 Add failing cross-platform path resolver tests for HOME, TEMP, UID, platform filters, terminal wildcard enumeration, symlink skipping, and result limits.
- [ ] 1.4 Implement the tool-scan-local portable path resolver with injected macOS and Windows environments.

## 2. Discovery and authorization integration

- [ ] 2.1 Add failing discovery tests proving external sources are scanned only after their tool is detected and resolved source roots are returned.
- [ ] 2.2 Refactor discovery to consume one or more resolved paths per probe/source without tool-specific branches.
- [ ] 2.3 Add failing IPC authorization tests for opening and searching an externally discovered JSONL file.
- [ ] 2.4 Authorize actual external source roots in the scan handler while retaining existing IPC path checks.

## 3. OpenClaw built-in preset

- [ ] 3.1 Add an OpenClaw fixture test containing safe configuration, workspace instructions, memory, session JSONL, macOS logs, Windows TEMP logs, and excluded credentials.
- [ ] 3.2 Create `openclaw.json` with fixed cross-platform path templates, classifications, exclusions, and conversation/log JSONL profiles.
- [ ] 3.3 Register OpenClaw in the built-in preset list and update preset inventory assertions.
- [ ] 3.4 Verify session workspace grouping, summary extraction, event labels, log-level labels, JSONL detail, and search behavior.

## 4. Functional and regression verification

- [ ] 4.1 Run focused validator, discovery, preset inventory, JSONL browser, and Inspector renderer tests.
- [ ] 4.2 Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`.
- [ ] 4.3 Start RestX with isolated runtime data and verify the OpenClaw card, folders, session browsing, search, Gateway log browsing, and normal exit on macOS.
- [ ] 4.4 Form a local checkpoint and complete independent automated validation, visual acceptance, and process smoke tasks before push.
