## 1. Preset and contract foundation

- [x] 1.1 Add preset types and registry validation.
- [x] 1.2 Add Codex, Claude Code, and OpenCode preset files.
- [x] 1.3 Extend scan contracts with detected-tool and folder-node types while retaining the flat candidate index.
- [x] 1.4 Add architecture tests proving the framework contains no concrete tool-id branches and accepts a synthetic fourth preset.

## 2. Discovery and scoped scanning

- [x] 2.1 Add metadata-only direct probe detection for hidden tool roots.
- [x] 2.2 Add preset-scoped scanning with containment, symlink, exclusion, size, depth, and count controls.
- [x] 2.3 Build pruned semantic category folder trees for the first version.
- [ ] 2.4 Separate optional generic candidates from the default home scan.

## 3. Inspector UI

- [x] 3.1 Add supported/detected tool cards and evidence/count summaries.
- [x] 3.2 Add tool-folder navigation, breadcrumbs, and non-empty category folders.
- [x] 3.3 Add folder file rows and reuse the current config detail/AI analysis panel.
- [ ] 3.4 Group global search results by tool and preserve current-tool search scope.
- [ ] 3.5 Add responsive detail behavior and empty/permission/partial-result states.

## 4. Verification

- [ ] 4.1 Add fixture tests for every initial preset and future-preset registration.
- [ ] 4.2 Add security tests for path escape, symlinks, sensitive exclusions, and inaccessible roots.
- [ ] 4.3 Add UI tests for discovery cards, folder navigation, breadcrumbs, search grouping, and detail reuse.
- [x] 4.4 Run typecheck, full tests, production build, and packaged macOS smoke test.
