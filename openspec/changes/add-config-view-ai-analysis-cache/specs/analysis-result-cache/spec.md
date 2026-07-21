## ADDED Requirements

### Requirement: Content-aware analysis cache
The system SHALL cache a successful AI result using a fingerprint of the source content, provider configuration, model and prompt version.

#### Scenario: Reuse unchanged analysis
- **WHEN** the same configuration content is requested with the same provider, model and prompt version
- **THEN** the system returns the cached result without calling the provider

#### Scenario: Invalidate after configuration update
- **WHEN** any byte of the source configuration changes
- **THEN** the previous result is treated as stale and the next analysis calls the provider

#### Scenario: Invalidate after analysis context update
- **WHEN** Base URL, model or prompt version changes
- **THEN** the previous result is not reused for a new analysis

### Requirement: Cache data minimization
The system MUST NOT persist original or redacted configuration content in the analysis cache.

#### Scenario: Persist a successful analysis
- **WHEN** an analysis result is written to cache
- **THEN** the record contains only path identity, fingerprints, model metadata, timestamps and model output

### Requirement: Cache controls
The system SHALL support forced re-analysis and explicit clearing of all analysis cache records.

#### Scenario: Force re-analysis
- **WHEN** the user selects re-analyze for an unchanged file
- **THEN** the system bypasses the valid cache and replaces it with the new successful result

#### Scenario: Clear analysis cache
- **WHEN** the user confirms clearing AI analysis cache in settings
- **THEN** all cached analysis results are removed without changing authorized-directory history or provider settings

### Requirement: Stale result handling
The system SHALL verify the current source fingerprint before presenting a cached result as current.

#### Scenario: Configuration changed before detail opens
- **WHEN** a cached analysis exists but the file now has different content
- **THEN** the AI tab marks the result unavailable or stale and offers a new analysis instead of presenting it as current
