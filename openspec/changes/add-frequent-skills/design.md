## Context

RestX uses compile-time feature capsules with separate renderer, preload, main, and shared boundaries. It already has a platform AI Provider registry, but it has no agent runtime or reusable prompt manager. The new feature must therefore model a RestX AI Skill as a portable fixed prompt and execute it as a one-shot text request, without implying terminal, filesystem, or tool access.

The user selected Markdown files under `~/.restx/skills` as the durable store, strict RestX-format imports, full CRUD, the active AI Provider, and an in-memory latest-result view. The feature is blue-zone code and must not depend on another feature's internal implementation.

## Goals / Non-Goals

**Goals:**

- Provide a complete create, list, edit, recoverable-delete, strict-import, and execute flow.
- Keep `~/.restx/skills/<skill-id>/SKILL.md` as the only persistent source of truth.
- Preserve RestX process isolation with a narrow typed IPC and preload API.
- Execute the latest on-disk prompt through the currently active AI Provider and show the latest result.
- Validate all untrusted IPC and file input and prevent managed-root escapes.

**Non-Goals:**

- Codex Skill compatibility, shell commands, agent tools, project-file access, or multi-turn conversations.
- Execution history, scheduling, parameters, cancellation, parallel execution, sharing, or cloud sync.
- A database or `electron-store` index for skills.

## Decisions

### Independent feature capsule

Create `src/features/frequent-skills/` with `shared`, `main`, `preload`, `renderer`, and focused tests. Register only its public entry points in the platform registries and compose its API into `RestXApi`. This follows the current feature architecture and avoids coupling to AI Inspector's internal scanners.

Alternative considered: reuse AI Inspector discovery. Rejected because discovery is read-only and feature-private, while skill management has different ownership and write/security semantics.

### Markdown-only persistence

Each skill lives at `~/.restx/skills/<skill-id>/SKILL.md`. YAML Frontmatter contains `schemaVersion`, `id`, `name`, `description`, `createdAt`, and `updatedAt`; the Markdown body is the fixed prompt. List operations scan direct child directories, reject symlinks, parse files independently, sort valid skills by descending `updatedAt`, and return a stable invalid-file error without exposing absolute paths.

Writes use an adjacent temporary file with restrictive permissions followed by atomic rename. IDs are stable after creation and consist only of lowercase letters, digits, and hyphens. The store resolves every target from a validated ID and verifies it remains below the managed root.

Alternative considered: maintain an `electron-store` index. Rejected because it introduces two sources of truth and recovery rules without a demonstrated scale requirement.

### Strict import through the main-process file picker

The renderer invokes `importSkill()` without receiving or submitting an arbitrary path. The main process opens a single-file picker for `SKILL.md`, rejects symbolic links and oversized files, strictly parses the RestX schema, and writes a copy with a newly generated local ID and timestamps. The source file is never changed or removed; cancellation returns a non-error cancelled result.

Alternative considered: accept arbitrary Markdown and infer missing fields. Rejected because silent conversion hides malformed or incompatible skill definitions.

### Active-provider one-shot execution

`executeSkill(id)` re-reads and validates the latest file, then calls the public AI Provider registry's active-provider execution contract. The feature sends a stable, non-secret system instruction plus the Markdown body as the user message, uses the active provider's model and provider-aware fetch implementation, applies a bounded request timeout, and extracts a text response. It does not grant tools or operating-system capabilities.

Only one execution may be active feature-wide in the first version. The renderer disables execution controls while it is running and keeps the returned text, completion time, and selected skill only in component state. Navigating away or restarting clears it.

### Narrow IPC and normalized failures

Expose fixed `listSkills`, `createSkill`, `updateSkill`, `deleteSkill`, `importSkill`, and `executeSkill` methods. Every handler validates unknown inputs before filesystem or network work. Main-process failures map to feature-owned codes such as `INVALID_INPUT`, `SKILL_NOT_FOUND`, `INVALID_SKILL_FILE`, `PROVIDER_NOT_CONFIGURED`, `EXECUTION_IN_PROGRESS`, `EXECUTION_FAILED`, and `STORAGE_FAILED`; user-facing messages contain no credentials, prompt bodies, model responses, or absolute paths.

Deletion uses Electron's trash facility for the validated skill directory so the operation is recoverable where the operating system supports it.

### UI structure

The “常用技能” page uses a two-column desktop layout: a list on the left and the latest execution result on the right. Each row places edit, delete, and primary execute actions on its right edge. Header actions provide strict import and creation. Create/edit use a validated modal, deletion requires confirmation, result text can be copied, and a narrow viewport stacks the result below the list.

## Risks / Trade-offs

- [Externally edited files can be malformed] → Parse each file independently, report a stable invalid entry, and never overwrite it implicitly.
- [A prompt can send sensitive text to the configured provider] → Show the stored prompt before execution, require an explicit click, and never log prompt or response bodies.
- [Provider requests can hang or overlap] → Apply a bounded timeout and allow only one active execution in the feature.
- [Atomic rename semantics vary by platform] → Keep the temporary file adjacent to the target and clean it up on failure.
- [Trash support can fail] → Preserve the original directory and return a normalized deletion error.
- [Large skill collections require repeated scanning] → Accept direct-directory scanning for the initial scope; add indexing only after measured need.

## Migration Plan

No data migration is required. On first use, create `~/.restx/skills` with restrictive permissions. Rollback removes the feature registration and code while leaving user-created Markdown files intact. Functional verification uses an isolated `RESTX_SKILLS_ROOT` so real user skills are not modified.

## Open Questions

None. The product behavior and first-version exclusions were confirmed during design review.
