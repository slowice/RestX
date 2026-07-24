## 1. Domain and filesystem boundary

- [x] 1.1 Define knowledge problem, label catalog, graph, classification suggestion, writeback, and error contracts.
- [x] 1.2 Implement bounded recursive scanning and Markdown/Frontmatter parsing for `~/.restx/knowledge/`.
- [x] 1.3 Implement deterministic virtual scene, capability, knowledge, and problem graph aggregation.
- [x] 1.4 Keep first-demo display state in renderer memory without persisting Markdown content.

## 2. AI classification and safe mutation

- [x] 2.1 Implement active-provider classification with strict structured-output validation and existing-label normalization.
- [x] 2.2 Implement fingerprint conflict detection, backup exclusion, YAML document merging, and atomic writeback.
- [x] 2.3 Implement bounded system opening for a problem from the current scan snapshot.

## 3. Electron integration

- [x] 3.1 Add namespaced channels, main handlers, preload contribution, and the composed application API.
- [x] 3.2 Register the feature in main and preload without exposing arbitrary paths or channels.
- [x] 3.3 Add boundary tests for invalid IDs, stale snapshots, fixed channels, and reduced renderer DTOs.

## 4. Knowledge map experience

- [x] 4.1 Register the “知识图谱” menu and `/knowledge` route through the renderer feature registry.
- [x] 4.2 Build the RestX-styled layered graph, pending area, scan summary, refresh, empty state, and problem detail preview.
- [x] 4.3 Build single-problem AI organization with existing/new label indicators, editable confirmation, and explicit writeback.
- [x] 4.4 Add user-visible states for invalid YAML, missing Provider, model failure, file conflict, write failure, and stale files.

## 5. Lean tests and final verification

- [x] 5.1 Add focused domain tests for scan boundaries, parsing states, aggregation, classification normalization, and safe writeback.
- [x] 5.2 Add page behavior tests for pending selection, AI confirmation, writeback refresh, and failure states.
- [x] 5.3 Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- [x] 5.4 Start RestX and functionally verify menu, scan, preview, graph refresh, and empty state; verify AI confirmation, backup, and writeback with feature boundary tests without sending user data.
- [x] 5.5 Complete applicable automatic, visual, and process-smoke verification serially because delegated background tasks are unavailable in this session.
