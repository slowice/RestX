## Context

KnowledgeLoader currently exists as a standalone TypeScript/Vite prototype with a cloud-node graph and local Markdown selection. It must become a RestX feature rather than a separate application. The revised product model starts with independent problem Markdown files and derives three organizing dimensions: one scene, multiple capabilities, and multiple knowledge labels.

RestX requires business functionality to remain inside an isolated feature capsule and requires all filesystem and system access to pass through namespaced main/preload APIs. Markdown content is user-authored local data and AI output is untrusted.

## Goals / Non-Goals

**Goals:**

- Make `~/.restx/knowledge/` the stable, recursively scanned knowledge root.
- Keep unclassified Markdown visible as pending work.
- Build a readable scene-to-capability-to-knowledge-to-problem graph.
- Let the active RestX AI Provider suggest labels while the user retains final control.
- Preserve user files through bounded reads, backups, conflict detection, and atomic writes.
- Match the existing RestX shell and visual language.

**Non-Goals:**

- Full Markdown editing, batch classification, file watching, databases, vector search, sync, or collaboration.
- Independent Markdown documents for scene, capability, or knowledge nodes.
- AI modification of Markdown body content.

## Decisions

### Use a full feature capsule

The feature owns its renderer, main, preload, shared contracts, styles, persistence, errors, and tests. Renderer receives only structured DTOs. Main owns directory creation, scanning, parsing, AI calls, writeback, backups, and system opening. Preload exposes fixed methods over namespaced channels.

### Keep Markdown as the source of truth

No index database is introduced. Each scan rebuilds virtual nodes from Markdown Frontmatter. A small versioned preference file may persist only graph display state; it never stores Markdown content or classification truth.

### Treat missing metadata as pending rather than invisible

Every bounded Markdown file is returned. Files without a complete valid classification appear in a pending area. Invalid YAML remains readable but cannot be overwritten automatically.

### Use controlled human-confirmed AI classification

The classifier receives one bounded problem and the current label vocabulary. It must return strict structured data containing one scene and non-empty capability and knowledge lists. Existing labels are matched case-insensitively and reused. New labels are visibly marked. No write occurs until the user confirms an editable form.

### Protect writeback with fingerprinting, backups, and atomic replacement

Classification suggestions include a source fingerprint. Apply requests fail if the file changed. Before writeback, the old file is copied into `.restx-backup/`, which is excluded from scanning. Managed YAML fields are updated through a YAML document model, preserving other metadata, comments, and body where possible. The final update uses a temporary sibling and atomic rename.

### Use a layered path rather than a free graph

The renderer arranges scene, capability, knowledge, and problem nodes in four columns. Thin curved SVG arrows show direction and branching. Pending problems remain separately visible. The layout follows RestX's light background, neutral borders, and green accent instead of carrying the standalone page shell into RestX.

## Risks / Trade-offs

- [Risk] Model output creates near-duplicate labels. → Mitigation: send the existing vocabulary, normalize matches, mark new labels, and require confirmation.
- [Risk] Frontmatter writeback damages user content. → Mitigation: reject invalid YAML, fingerprint content, back up first, preserve unknown fields, and replace atomically.
- [Risk] A large or hostile directory exhausts resources. → Mitigation: enforce extension, size, depth, file-count, regular-file, and no-symlink boundaries.
- [Risk] Relative paths change after manual archiving. → Mitigation: rebuild relationships from metadata; only ephemeral selection or display state resets.
- [Risk] Dense graphs become visually noisy. → Mitigation: layered columns, branch collapsing, bounded labels, horizontal overflow, and low-emphasis connections.
- [Risk] AI Provider is unavailable. → Mitigation: keep scanning and manual viewing functional and direct the user to RestX settings.

## Migration Plan

The standalone KnowledgeLoader workspace is not deleted during this change. Its useful visual concepts are reimplemented inside the RestX feature architecture; its Vite entry point, start scripts, and application bundle are not copied. Rollback removes the feature registrations and capsule. User Markdown and backups remain untouched.

## Open Questions

None for the first demo. Later iterations may add bulk organization, file watching, dedicated knowledge documents, search, or alternative graph views.
