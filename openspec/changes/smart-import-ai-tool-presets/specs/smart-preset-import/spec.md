# Smart preset import specification

## ADDED Requirements

### Requirement: Presets are runtime declarative data

RestX SHALL merge bundled JSON presets with valid enabled JSON/YAML presets stored in the user preset directory and SHALL NOT execute content from a preset.

#### Scenario: Imported tool survives restart

- **WHEN** a user confirms a valid generated preset
- **THEN** RestX saves it under `~/.RestX/presets/`
- **AND** subsequent scans load it without rebuilding the application

### Requirement: Smart discovery is metadata-only

RestX SHALL generate a bounded relative-path inventory and SHALL NOT read or send configuration, log, conversation, or credential contents during smart import.

#### Scenario: User requests smart import

- **WHEN** the user explicitly consents to send directory metadata
- **THEN** the model receives only tool hints and bounded path metadata
- **AND** the request is recorded in the AI-call log without an API key

### Requirement: Model output is untrusted

RestX SHALL parse model output as data, strictly validate it, trial-scan it, and require user confirmation before persistence.

#### Scenario: Model returns an unsafe source

- **WHEN** a source contains an absolute path, parent traversal, callback, or unsupported viewer
- **THEN** RestX rejects the draft
- **AND** no preset file is written

### Requirement: Imported presets are manageable

RestX SHALL list imported presets and allow the user to disable, re-enable, or delete them without affecting bundled presets.

#### Scenario: User disables an imported preset

- **WHEN** the user disables a valid imported preset
- **THEN** subsequent scans omit that preset
- **AND** its definition remains available for re-enabling or deletion
