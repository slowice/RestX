## Why

RestX currently has no dedicated place to save and repeatedly run personal AI prompts. Users need a lightweight, portable way to manage frequently used AI skills and execute them through the active RestX AI Provider without recreating prompts each time.

## What Changes

- Add a new “常用技能” feature page for listing, creating, editing, deleting, importing, and executing RestX AI Skills.
- Store each skill as a strictly validated `SKILL.md` under `~/.restx/skills/<skill-id>/`, with Markdown as the only source of truth.
- Import standard RestX `SKILL.md` files by copying them into the managed directory with a newly generated local ID.
- Execute a skill's fixed prompt as a one-shot text request through the currently active AI Provider.
- Display only the most recent in-memory execution result with copy support; do not persist execution history.
- Add a narrow, validated preload and IPC contract for skill management and execution.

## Capabilities

### New Capabilities

- `frequent-skills`: Manage portable RestX AI Skill files and execute their fixed prompts through the active AI Provider.

### Modified Capabilities

None.

## Impact

- Adds a new blue-zone feature capsule under `src/features/frequent-skills/` with renderer, shared, preload, main, and focused tests.
- Registers the feature in the renderer, preload, and main feature registries and composes its API into `RestXApi`.
- Adds feature-owned filesystem access under `~/.restx/skills` and reuses the public AI Provider execution contract.
- Adds no new runtime dependency and does not change existing public data formats or feature behavior.
