## Context

The knowledge map derives scene, capability, and knowledge nodes from classification fields in Markdown Frontmatter. The renderer currently receives a scan result and can classify one problem through AI, while the main process already protects single-file writes with a source fingerprint, backup, and atomic replacement. Direct graph editing can affect several Markdown files, so the change must preserve Markdown as the only source of truth and extend the existing file-safety boundary without exposing paths or generic IPC.

## Goals / Non-Goals

**Goals:**

- Provide one explicit editing session for several problem and label changes.
- Preview the graph derived from the in-memory draft before persistence.
- Support semantic problem removal and global semantic label removal without deleting files.
- Preflight every affected file before any replacement and compensate if a later replacement fails.
- Keep all implementation inside the knowledge-map feature capsule.

**Non-Goals:**

- Editing Markdown bodies, deleting files, renaming labels, or storing orphan labels.
- Adding a database, graph file, autosave, persistent draft, or undo history.
- Providing database-grade atomicity across multiple files.

## Decisions

### Keep Markdown Frontmatter as the only persisted graph model

Scene, capability, and knowledge nodes remain virtual aggregations. A new label only exists when a problem draft references it; a label disappears after its final reference is removed. This avoids a second source of truth and preserves compatibility with external Markdown editing. An independent JSON graph was rejected because synchronization and migration costs do not serve the requested workflow.

### Model editing as a renderer-owned full-session draft

The page snapshots current problem classifications and fingerprints when editing starts. Pure feature-local domain functions apply per-problem changes, apply global label removal, compute changed problems, and rebuild the preview graph. Cancel discards the draft. This keeps incomplete intermediate states out of main and enables a single save action. Reusing the existing one-problem classification dialog was rejected because it fragments multi-problem editing and cannot provide session-wide cancel.

### Persist complete changed-problem outcomes through one bounded IPC call

The renderer sends only changed problem IDs, their original fingerprints, and either complete replacement labels or a classification-clear operation. Main rejects duplicate IDs, excessive batches, invalid labels, stale IDs, invalid Frontmatter, missing files, and fingerprint conflicts before it creates replacements. Absolute paths and Markdown bodies never cross IPC.

### Use preflight, backups, atomic per-file replacement, and compensating rollback

After preflight, main renders every updated document in memory, creates backups and same-directory temporary files, then renames each temporary file over its target. If a rename fails, main restores already-replaced targets from the batch backups and reports whether rollback completed. This is not a cross-file atomic transaction, but it gives deterministic conflict rejection and a recoverable failure path using existing backup conventions.

### Clear only RestX-managed classification fields

Semantic problem removal deletes `type`, `scene`, `capability`, and `knowledge` while preserving unknown Frontmatter fields and the body. If no Frontmatter fields remain, the empty block is removed. Global label removal deletes only the matching normalized value; affected problems may become pending while retaining other controlled values.

### Use selection-driven editing in the existing inspector area

In editing mode, selecting an organized or pending problem opens one scene selector and multi-value capability and knowledge controls. Selecting a virtual label node opens an impact summary and global-delete action. The graph updates from the draft immediately. Header actions become cancel and save; unsafe refresh or route exit requires discard confirmation.

Functional verification uses a main-process-only `RESTX_KNOWLEDGE_ROOT` override that is honored only when `NODE_ENV` is `development`. This keeps write verification in a temporary knowledge root while production launches continue to use the fixed RestX storage layout and renderer never controls a path.

## Risks / Trade-offs

- [A process crash during a multi-file replacement can leave a partially applied batch] → Keep durable per-file backups and temporary-file naming that supports manual recovery; never claim database transaction semantics.
- [Global label removal can affect many problems] → Bound batch size, show affected count, require confirmation, and submit only changed problems.
- [External editors can change files during an editing session] → Compare every original fingerprint during one preflight and reject the full batch before replacements.
- [A rollback can itself fail] → Report incomplete rollback distinctly and point users to preserved backups without exposing absolute paths in IPC.
- [Incomplete draft classifications can make nodes move while editing] → Keep pending problems visible and make the graph a deliberate live preview of the saved outcome.

## Migration Plan

No data migration is required. Existing Frontmatter remains valid and the new API is additive. Rollback consists of removing the editing UI and batch API; saved Markdown remains compatible with the previous scanner and classifier.

## Open Questions

None. The interaction semantics, persistence model, and failure behavior were approved before implementation.
