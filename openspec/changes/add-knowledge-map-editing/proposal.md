## Why

The knowledge map currently exposes useful relationships but only supports classification through the per-problem AI flow. Users need a direct, reversible editing mode to correct several relationships together and safely persist the confirmed graph back to Markdown.

## What Changes

- Add an explicit knowledge-map editing mode with session-wide draft, cancel, and save actions.
- Let users update one problem's scene, capability, and knowledge associations by reusing or creating labels.
- Let users semantically remove a problem from the organized graph without deleting its Markdown file.
- Let users globally remove scene, capability, and knowledge labels from every referencing problem after impact confirmation.
- Add bounded batch persistence with full preflight conflict detection, per-file backups, atomic file replacement, and compensating rollback.
- Rebuild the authoritative graph from disk after a successful save while preserving drafts after a failed save.

## Capabilities

### New Capabilities

- `knowledge-map-editing`: Covers draft-based graph editing, semantic deletion, batch persistence, conflict handling, and editing-mode safeguards.

### Modified Capabilities

None. The repository does not yet contain synchronized main specs for the existing knowledge-map change, so this change introduces a focused capability rather than naming a nonexistent main capability.

## Impact

- Extends the knowledge-map shared contracts, fixed IPC channels, preload API, main service, Markdown writer, renderer page, graph component, and feature-local styles.
- Adds focused domain, API, writer, and renderer tests for draft editing and safe batch writes.
- Does not add dependencies, a database, an independent graph file, arbitrary renderer file access, or cross-feature imports.
