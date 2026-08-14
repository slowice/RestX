## 1. Import Contract and Source Boundary

- [x] 1.1 Extend the import result with direct, AI, and fallback analysis metadata while keeping managed Skill schema version 1 compatible.
- [x] 1.2 Implement bounded Markdown source validation, binary-like detection, prompt normalization, and deterministic Frontmatter/H1/filename metadata extraction.

## 2. Intelligent Import Pipeline

- [x] 2.1 Implement and test a feature-local AI metadata analyzer whose request treats source as untrusted data and whose accepted response cannot contain executable prompt content.
- [x] 2.2 Refactor import into direct, AI, and deterministic-fallback paths; accept any Markdown filename, preserve source instructions, and reject overlapping imports.

## 3. Renderer Feedback

- [x] 3.1 Rename and explain the smart-import action, expose useful progress, and render distinct direct, AI-format, and fallback completion notices without sensitive details.

## 4. Verification and Integration Readiness

- [x] 4.1 Add lean regression coverage for direct import, AI metadata-only import, prompt preservation, malicious or invalid AI output, fallback behavior, unsafe sources, duplicate requests, and renderer feedback.
- [x] 4.2 Run focused tests plus affected feature-boundary checks, then run proxy-free typecheck and build with each command limited to five minutes.
- [x] 4.3 Start real Electron with an isolated `RESTX_SKILLS_ROOT`; import a non-RestX Skill, verify the completion notice and persisted prompt, then clean the temporary data.
- [x] 4.4 Record verification evidence and confirm the worktree contains only this completed requirement before integration into local `main` without committing or pushing from the worktree.
