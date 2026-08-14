## Why

The current import path rejects every Markdown skill that does not already match RestX's exact Frontmatter schema, so users cannot import common Codex, Claude, or custom skills. Import should intelligently derive RestX metadata while guaranteeing that model analysis cannot change the skill's executable instructions.

## What Changes

- Accept bounded, non-binary Markdown skill files without requiring the source filename or Frontmatter to match RestX.
- Keep valid RestX skills on a direct, no-model import path.
- For other Markdown structures, ask the active AI Provider to return metadata only: name, description, and detected format.
- Preserve the source instructions as the managed skill prompt with only line-ending and surrounding-blank-line normalization; never accept prompt content from the model.
- Fall back to deterministic Frontmatter, heading, and filename metadata when AI is unavailable or returns an invalid result, so safe imports still complete.
- Return direct, AI, or fallback analysis information for clear renderer feedback.

## Capabilities

### New Capabilities

- `smart-skill-import`: Import heterogeneous Markdown skills through a semantics-preserving direct, AI-metadata, or deterministic-fallback pipeline.

### Modified Capabilities

None.

## Impact

- Changes the frequent-skills import result contract and renderer feedback.
- Adds a feature-local metadata analyzer that uses the public active-provider execution context.
- Extends feature-local validation for Markdown, binary detection, metadata extraction, and prompt preservation.
- Keeps the existing RestX Skill schema and all previously stored skills compatible; no migration or new dependency is required.
