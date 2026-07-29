## 1. Provider data and request boundary

- [x] 1.1 Add validated custom-header contracts, storage migration defaults, and a Provider update API.
- [x] 1.2 Preserve RestX-managed headers across external Provider refreshes.
- [x] 1.3 Merge custom headers into OpenAI-compatible connection tests and normal request execution with override semantics.

## 2. Settings and IPC

- [x] 2.1 Add the namespaced IPC and preload API for updating Provider custom headers.
- [x] 2.2 Add editable request-header name/value rows to the Provider settings experience for manual and external Providers.

## 3. Validation and handoff

- [x] 3.1 Add focused behavior and regression tests for validation, persistence, refresh retention, and request-header overrides.
- [x] 3.2 Run the necessary automated checks and manually validate the Provider settings flow in the running application.
- [x] 3.3 Integrate the verified change into local main, commit, push, and clean the completed worktree and branch.
