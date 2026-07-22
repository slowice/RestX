## ADDED Requirements

### Requirement: Feature-owned navigation and routing
The system SHALL derive sidebar navigation items and renderer routes from the same typed renderer feature declarations, without requiring feature-specific edits to the application shell or router implementation.

#### Scenario: Add a renderer feature
- **WHEN** a developer creates a valid renderer feature and adds it to the renderer feature registry
- **THEN** the feature's navigation item and route become available in the application without edits to the shell or router implementation

#### Scenario: Remove a renderer feature
- **WHEN** a developer removes a feature from the renderer feature registry and deletes its directory
- **THEN** its navigation item and route are absent without leaving shell or router references to the feature

### Requirement: Feature capsule ownership
The system SHALL allow each feature to own its renderer code and, when needed, its main-process code, preload bridge, shared contracts, styles, state, services, and tests under one feature directory.

#### Scenario: Full-stack feature layout
- **WHEN** a feature requires renderer and privileged main-process behavior
- **THEN** its UI, IPC contracts, preload methods, main handlers, services, and tests can be located and maintained within that feature's directory

#### Scenario: Renderer-only feature layout
- **WHEN** a feature only renders a local page
- **THEN** the feature can omit main, preload, and shared directories and register only its renderer declaration

### Requirement: Platform layer scope
The platform layer SHALL contain only application lifecycle, feature registration, security-boundary adapters, error isolation, and stable utilities used by most features.

#### Scenario: Feature-specific service placement
- **WHEN** a service such as JSONL parsing, AI analysis, file scanning, or tool preset management is used by one feature
- **THEN** that service remains inside the owning feature rather than being placed in the platform layer

### Requirement: Explicit feature dependencies
The system SHALL prevent features from importing another feature's internal renderer or main implementation and SHALL represent permitted inter-feature collaboration through explicit public capability contracts.

#### Scenario: Missing required capability
- **WHEN** a feature declares a required capability that is not registered
- **THEN** the dependent feature is not activated and the application reports a diagnostic message without breaking unrelated features

#### Scenario: Circular dependency
- **WHEN** registered feature declarations contain a circular capability dependency
- **THEN** validation fails before those features are activated and identifies the dependency cycle

### Requirement: Process-specific feature registration
The system SHALL maintain separate typed registration points for renderer declarations, main-process handlers, and preload API contributions.

#### Scenario: Register a UI-only feature
- **WHEN** a feature has no privileged operations
- **THEN** it can be registered without adding a main-process handler or preload API contribution

#### Scenario: Register a privileged feature
- **WHEN** a feature requires privileged operations
- **THEN** its main and preload registrations use the same stable feature identifier and expose only explicitly declared methods

### Requirement: Namespaced and allowlisted IPC
Each feature SHALL own namespaced IPC channel constants, register handlers through the platform IPC lifecycle, and expose only allowlisted preload methods rather than a renderer-controlled generic IPC invocation method.

#### Scenario: Duplicate channel registration
- **WHEN** two handlers attempt to register the same IPC channel
- **THEN** registration fails with a diagnostic that identifies the duplicate channel

#### Scenario: Renderer invokes a feature operation
- **WHEN** renderer code invokes an exposed feature API method
- **THEN** preload maps it to a fixed namespaced channel whose main handler belongs to that feature

### Requirement: Feature failure isolation
The renderer SHALL lazy-load feature pages and wrap each feature route in a feature-level loading state and error boundary.

#### Scenario: Feature page fails to load or render
- **WHEN** one feature throws during lazy loading or rendering
- **THEN** the application shows a local failure state for that feature while the shell and other feature routes remain usable

### Requirement: Feature-local state and styles
Business state and feature-specific styles SHALL remain scoped to the owning feature, while only application-wide state and theme/shell styles remain in the platform layer.

#### Scenario: AI Inspector state changes
- **WHEN** scan selection or analysis state changes inside AI Inspector
- **THEN** unrelated feature components do not subscribe to or re-render from that business state through a global application context

#### Scenario: Feature stylesheet is removed
- **WHEN** a feature and its scoped stylesheet are deleted
- **THEN** unrelated feature presentation remains unchanged because it does not depend on selectors owned by the deleted feature

### Requirement: Existing behavior compatibility
The modularization SHALL preserve the current user-visible behavior and persisted data formats for configuration browsing, JSONL browsing, AI analysis/cache, provider settings, and smart preset import.

#### Scenario: Use existing AI Inspector workflows after migration
- **WHEN** a user performs a previously supported AI Inspector workflow after the modularization
- **THEN** the workflow produces equivalent visible results and continues to use existing persisted settings, cache, log, and preset locations

### Requirement: Architectural validation
The project SHALL automatically validate feature identifiers, route uniqueness, dependency validity, IPC channel uniqueness, and forbidden cross-feature internal imports.

#### Scenario: Run the project verification suite
- **WHEN** a developer runs the prescribed test and type-check commands
- **THEN** invalid feature registrations or architecture-boundary violations fail verification with actionable diagnostics
