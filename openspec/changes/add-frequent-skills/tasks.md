## 1. Public Contract and File Model

- [x] 1.1 Define frequent-skills DTOs, normalized errors, field limits, and fixed IPC channels in the feature shared boundary.
- [x] 1.2 Implement and unit-test strict RestX `SKILL.md` parsing and serialization, including schema, IDs, timestamps, size limits, and non-empty prompt validation.
- [x] 1.3 Implement and unit-test the managed skill store for direct-child scanning, stable ID generation, atomic create/update, safe lookup, and symlink/path-escape rejection.

## 2. Main, Preload, and Platform Integration

- [x] 2.1 Implement the feature service for list, create, update, recoverable delete, and strict file-picker import with safe normalized failures.
- [x] 2.2 Implement and unit-test one-shot active-provider execution, response extraction, timeout handling, latest-file reads, and the single-execution guard.
- [x] 2.3 Register validated main-process handlers, implement the narrow preload API, add the API to `RestXApi`, and register main/preload entries without exposing arbitrary channels or paths.

## 3. Renderer Experience

- [x] 3.1 Register the “常用技能” renderer feature and implement the responsive list/result layout with header create and import actions.
- [x] 3.2 Implement validated create/edit dialogs, delete confirmation, per-row right-side actions, loading/error states, and list refresh behavior.
- [x] 3.3 Implement the in-memory latest-result panel, feature-wide execution lock, and clipboard copy feedback without persisting result content.

## 4. Verification and Completion

- [x] 4.1 Run focused frequent-skills tests and the repository architecture/registry checks required by the touched boundaries; fix only affected failures and rerun affected checks.
- [x] 4.2 Run TypeScript type checking and build validation with proxy variables unset, keeping each command below five minutes.
- [x] 4.3 Start the real Electron application with an isolated `RESTX_SKILLS_ROOT` and functionally verify create, edit, strict import, execute, copy, cancel/confirm delete, responsive layout, and safe error states without touching user data.
- [x] 4.4 Update the OpenSpec checklist with verification evidence, confirm the worktree contains no unrelated files, and prepare the completed change for integration into local `main` without committing or pushing from the requirement worktree.

## Verification Evidence

- Focused tests: `pnpm vitest run tests/frequent-skills-domain.test.ts tests/frequent-skills-api.test.ts tests/frequent-skills-page.test.tsx tests/preload-api.test.ts tests/feature-boundaries.test.ts tests/feature-platform.test.tsx` — 6 files, 18 tests passed.
- Type safety: `pnpm typecheck` — passed after adding the new API methods to four complete `RestXApi` test fixtures.
- Production build: `pnpm build` — passed; main, preload, and renderer bundles include the frequent-skills feature.
- Real Electron: remote debugging port `9347`, isolated temporary `RESTX_SKILLS_ROOT` directories — create, edit, native-picker import success, import cancellation, responsive stacking, list refresh, normalized execution error, and confirmed trash deletion passed; both isolated roots were empty and removed afterward. The imported source file remained unchanged and the managed copy received a new local ID.
- Provider execution: the configured Provider received the real request and returned HTTP 429; the page displayed the normalized rate-limit message. Successful response rendering and clipboard copy passed in the focused renderer/service tests.
