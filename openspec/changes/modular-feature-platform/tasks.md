## 1. Establish Architecture Guardrails

- [x] 1.1 Add platform feature identifiers, renderer/main/preload feature contracts, and typed definition helpers
- [x] 1.2 Add registry validation for duplicate ids/routes/channels, missing capabilities, and dependency cycles
- [x] 1.3 Add architecture tests or lint rules that reject direct cross-feature internal imports

## 2. Build the Renderer Feature Platform

- [x] 2.1 Add the renderer feature registry and generate sidebar navigation from registered feature declarations
- [x] 2.2 Generate routes from the same declarations using lazy loading, Suspense, and a feature-level error boundary
- [x] 2.3 Migrate Home and Lab into renderer-only feature capsules and verify the shell/router contain no feature-specific imports

## 3. Build Main and Preload Registration

- [x] 3.1 Add platform IPC lifecycle helpers with duplicate-channel detection and handler cleanup
- [x] 3.2 Add the main feature registry and move application-only IPC into platform registration
- [x] 3.3 Add the preload feature registry and typed API composition without exposing generic renderer-controlled IPC invocation

## 4. Migrate AI Inspector as a Full Vertical Feature

- [x] 4.1 Move AI Inspector contracts and IPC channel constants into `features/ai-inspector/shared`
- [x] 4.2 Move AI Inspector pages, components, state, and feature styles into `features/ai-inspector/renderer`
- [x] 4.3 Move scanning, config/JSONL reading, AI analysis/cache, logging, preset discovery/import, and authorization services into `features/ai-inspector/main`
- [x] 4.4 Move AI Inspector IPC handlers into its main registration entry and its allowlisted bridge methods into its preload entry
- [x] 4.5 Update imports and tests while preserving existing API behavior, persisted paths, cache formats, logs, and preset formats

## 5. Migrate Remaining Application Features

- [x] 5.1 Migrate Settings into its renderer feature capsule and express any required public capability dependency explicitly
- [x] 5.2 Reduce application state to platform-wide concerns and keep business state inside its owning feature
- [x] 5.3 Split global styling into platform theme/shell styles and feature-scoped CSS Modules or feature root styles
- [x] 5.4 Remove legacy `app/modules.ts`, centralized business IPC registrations, and the monolithic business API contract after compatibility checks pass

## 6. Verify Extensibility and Compatibility

- [x] 6.1 Add registry tests for add/remove navigation behavior, dependency validation, duplicate routes/channels, and feature error isolation
- [x] 6.2 Add an example/test proving a renderer-only menu feature can be added without editing Shell or Router code
- [x] 6.3 Run the full test suite, typecheck, production build, and package verification
- [x] 6.4 Perform smoke checks for configuration browsing, JSONL detail, AI analysis/cache, provider settings, smart preset import, and menu navigation
