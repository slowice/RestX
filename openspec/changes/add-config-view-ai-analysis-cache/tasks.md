## 1. Contracts and parsing foundation

- [x] 1.1 Extend shared contracts for configuration documents, provider settings, AI results and cache states.
- [x] 1.2 Add YAML and TOML parser dependencies using the workspace pnpm policy.
- [x] 1.3 Write failing tests for supported formats, invalid syntax, size limits and sensitive-value redaction.
- [x] 1.4 Implement the inert configuration reader/parser/redactor until the parsing tests pass.

## 2. Provider and secure settings

- [x] 2.1 Write failing tests for Provider URL validation, request construction, response validation and safe error mapping.
- [x] 2.2 Implement the OpenAI-compatible Provider abstraction and versioned structured prompt.
- [x] 2.3 Implement Provider settings persistence with `safeStorage`, exposing only `apiKeyConfigured` to the renderer.
- [x] 2.4 Extend runtime status to reflect incomplete, ready and error Provider configuration.

## 3. Content-aware cache and orchestration

- [x] 3.1 Write failing tests for cache hit, source-content invalidation, model/prompt invalidation, force refresh and cache clearing.
- [x] 3.2 Implement the analysis cache without storing original or redacted configuration content.
- [x] 3.3 Implement main-process analysis orchestration with authorization, consent, redaction, input limit and cache lookup.

## 4. IPC and renderer integration

- [x] 4.1 Extend authorized-path helpers, IPC handlers and preload APIs for config reading, Provider settings, analysis and cache controls.
- [x] 4.2 Add a configuration detail workspace with metadata, structured tree and redacted-text views.
- [x] 4.3 Add AI analysis states and result presentation for summary, sections, risks, recommendations and cache status.
- [x] 4.4 Add Provider configuration, consent and cache controls to Settings without rendering or logging the API Key.
- [x] 4.5 Update the ChatGPT-style visual system for detail panels, trees, analysis cards and responsive layouts.

## 5. Verification and documentation

- [x] 5.1 Add component/contract coverage for configuration detail and AI prerequisite states.
- [x] 5.2 Run typecheck, unit tests and production build; fix all regressions.
- [x] 5.3 Perform local visual and interaction checks for config browsing, cached analysis and settings flows.
- [x] 5.4 Update README with Provider setup, privacy behavior, cache invalidation and demo steps.
- [x] 5.5 Validate the OpenSpec change and record completed tasks.
