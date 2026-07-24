## 1. Domain and filesystem boundary

- [ ] 1.1 Define knowledge problem, label catalog, graph, classification suggestion, writeback, and error contracts.
- [ ] 1.2 Implement bounded recursive scanning and Markdown/Frontmatter parsing for `~/.restx/knowledge/`.
- [ ] 1.3 Implement deterministic virtual scene, capability, knowledge, and problem graph aggregation.
- [ ] 1.4 Implement feature-owned display preference persistence without storing Markdown content.

## 2. AI classification and safe mutation

- [ ] 2.1 Implement active-provider classification with strict structured-output validation and existing-label normalization.
- [ ] 2.2 Implement fingerprint conflict detection, backup exclusion, YAML document merging, and atomic writeback.
- [ ] 2.3 Implement bounded system opening for a problem from the current scan snapshot.

## 3. Electron integration

- [ ] 3.1 Add namespaced channels, main handlers, preload contribution, and the composed application API.
- [ ] 3.2 Register the feature in main and preload without exposing arbitrary paths or channels.
- [ ] 3.3 Add boundary tests for invalid IDs, stale snapshots, fixed channels, and reduced renderer DTOs.

## 4. Knowledge map experience

- [ ] 4.1 Register the “知识图谱” menu and `/knowledge` route through the renderer feature registry.
- [ ] 4.2 Build the RestX-styled layered graph, pending area, scan summary, refresh, empty state, and problem detail preview.
- [ ] 4.3 Build single-problem AI organization with existing/new label indicators, editable confirmation, and explicit writeback.
- [ ] 4.4 Add user-visible states for invalid YAML, missing Provider, model failure, file conflict, write failure, and stale files.

## 5. Lean tests and final verification

- [ ] 5.1 Add focused domain tests for scan boundaries, parsing states, aggregation, classification normalization, and safe writeback.
- [ ] 5.2 Add page behavior tests for pending selection, AI confirmation, writeback refresh, and failure states.
- [ ] 5.3 Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- [ ] 5.4 Start RestX and functionally verify the menu, scan, preview, AI suggestion, confirmation, backup, writeback, and graph refresh.
- [ ] 5.5 Complete independent applicable automatic, visual, and process-smoke verification before push.
