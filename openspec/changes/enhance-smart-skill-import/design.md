## Context

Frequent Skills currently treats import as strict validation: a source must be named `SKILL.md` and contain RestX's exact six-field Frontmatter before it can be copied. This rejects the external skill formats users actually want to bring into RestX. The feature already owns the native picker, managed storage, active-provider access, and renderer feedback, so the enhancement remains entirely inside the frequent-skills capsule.

The core invariant is semantic preservation: the AI may classify and describe the source, but it must never author executable prompt content. Existing managed RestX Skills and schema version 1 remain unchanged.

## Goals / Non-Goals

**Goals:**

- Import safe Markdown files from heterogeneous skill formats without requiring RestX Frontmatter or an exact filename.
- Use the active AI Provider to infer bounded display metadata only.
- Preserve all source instructions as the executable prompt, allowing only CRLF-to-LF and surrounding-blank-line normalization.
- Complete a safe import through deterministic metadata fallback when AI is unavailable or invalid.
- Tell the renderer whether import used direct, AI, or fallback analysis.

**Non-Goals:**

- Rewriting, summarizing, repairing, optimizing, or appending source instructions.
- Executing the imported skill during import or granting the analyzer tools or filesystem access.
- Persisting a new schema version, source file path, model response, or analysis history.
- Supporting binary documents or non-Markdown formats.

## Decisions

### Three-path import pipeline

After file-boundary validation, first attempt the existing strict RestX parser. Valid RestX files use the current direct copy behavior and never send content to AI. Other Markdown files are normalized as source prompt content and passed to a feature-local metadata analyzer. If analysis cannot produce valid metadata for any reason, local extraction completes the import.

This retains the cheap, deterministic path for native files and removes Provider availability as an import blocker. A model-only conversion was rejected because it would make all imports slower and unavailable during Provider failures.

### Model output cannot contain executable content

The analyzer receives the source inside a JSON user payload and a stable system instruction that treats it as untrusted data. Its response schema contains only `name`, `description`, and `detectedFormat`. The parser ignores every other model field and validates all accepted strings against existing limits. The prompt passed to `SkillStore.create` comes only from the locally read source.

This is stronger than asking the model to rewrite a full RestX file and comparing text afterward: no model-generated prompt value exists in the code path.

### Deterministic metadata fallback

Local extraction reads permissive YAML Frontmatter without treating it as trusted RestX metadata. It chooses the first bounded text from `name` or `title`, then the first Markdown H1, then the selected filename without its extension. Description uses bounded `description` or `summary` text and otherwise remains empty. Invalid YAML is ignored rather than blocking import.

AI failures, missing Provider configuration, timeouts, HTTP failures, invalid JSON, and out-of-bounds metadata all produce a fallback result with a safe warning. Empty, oversized, symbolic-link, or binary-like sources remain hard failures because there is no safe executable Markdown prompt to preserve.

### Existing schema, extended API result

Managed output remains schema version 1 with the existing fields and storage path. `FrequentSkillImportResult` gains an `analysis` object with `method: direct | ai | fallback`, optional bounded `detectedFormat`, and optional safe warning. No source path, source content, Provider details, or raw model response crosses IPC.

### Import-specific concurrency and feedback

The service rejects overlapping imports, while the renderer already disables the import action during its request. The button becomes “智能导入 Skill” and shows reading, analyzing, and saving progress at a user-meaningful level where feasible. Completion notices distinguish direct, AI, and fallback outcomes and explain that non-RestX source content may be sent to the active Provider for metadata analysis.

## Risks / Trade-offs

- [Skill files can contain sensitive instructions] → State the Provider disclosure in the UI, skip AI for native RestX files, and never log source or response content.
- [Prompt injection can manipulate metadata] → Treat source as untrusted JSON data, accept only three bounded strings, and keep the prompt on a separate local-only data path.
- [Metadata can still be inaccurate] → Preserve editability and identify AI/fallback outcomes in the completion notice.
- [Whitespace normalization can affect whitespace-sensitive text] → Limit normalization to CRLF-to-LF and surrounding blank lines, and test the exact invariant.
- [Fallback can create generic names] → Prefer existing metadata and H1 before filename, then let the user edit display fields.

## Migration Plan

No migration is required. Existing stored skills remain valid and direct imports retain their current behavior. Rollback restores strict import behavior without modifying any previously imported skill files.

## Open Questions

None. Semantic preservation, fallback behavior, UI feedback, and scope were approved before artifact creation.
