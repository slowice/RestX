# AI tool discovery specification

## ADDED Requirements

### Requirement: RestX discovers supported AI tools from presets

RestX SHALL evaluate every registered AI tool preset against the authorized scan root and return whether that tool was detected together with the matching path evidence.

#### Scenario: Codex is detected from its hidden user directory

- **WHEN** the selected user directory contains a `.codex` directory
- **THEN** the scan result marks the Codex preset as detected
- **AND** the evidence identifies the `.codex` path
- **AND** RestX does not need to execute a Codex binary

#### Scenario: Supported tool is not present

- **WHEN** none of a preset's probes exist below the selected directory
- **THEN** the scan result marks that preset as not detected
- **AND** the UI can still show it as a supported but undiscovered tool

### Requirement: Initial presets are data-driven

RestX SHALL ship presets for Codex, Claude Code, and OpenCode through one shared preset contract and registry.

#### Scenario: A developer adds another preset

- **WHEN** a developer creates a valid preset and registers it
- **THEN** discovery and grouped rendering can consume it without tool-specific scanner or UI branches

#### Scenario: A synthetic fourth tool is registered

- **WHEN** a test registers a valid synthetic preset with paths not used by the initial three tools
- **THEN** the generic detector returns the synthetic tool and its candidates
- **AND** no detector, IPC, or renderer source code needs a tool-specific change

### Requirement: Presets are declarative and isolated

RestX SHALL restrict tool presets to a versioned data contract and SHALL keep the discovery framework, IPC layer, and renderer independent of concrete tool ids.

#### Scenario: Preset attempts to provide executable behavior

- **WHEN** a preset contains unsupported callbacks or unsafe absolute paths
- **THEN** registry validation rejects that preset
- **AND** other valid presets remain available

### Requirement: Discovery remains metadata-only and contained

RestX SHALL inspect only file type and metadata during detection, reject symbolic links, and reject resolved probe/source paths that escape the authorized root.

#### Scenario: A probe is a symbolic link outside the selected directory

- **WHEN** a preset probe resolves to a symbolic link
- **THEN** RestX does not detect or traverse it
- **AND** records an explainable skipped entry

### Requirement: Sensitive and high-volume data is excluded by default

RestX SHALL exclude preset-declared credential, database, session, telemetry, cache, and temporary paths from default candidate results.

#### Scenario: Tool directory contains auth and session files

- **WHEN** a detected tool root includes matching-looking auth or session files
- **THEN** those files do not appear as normal configuration or log candidates
