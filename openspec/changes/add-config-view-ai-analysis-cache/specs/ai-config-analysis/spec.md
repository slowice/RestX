## ADDED Requirements

### Requirement: Configurable AI provider
The system SHALL let the user configure an OpenAI-compatible Base URL, model and API Key without exposing the stored API Key to the renderer.

#### Scenario: Save valid provider settings
- **WHEN** the user saves a valid HTTP or HTTPS Base URL, non-empty model and API Key
- **THEN** the main process persists non-sensitive settings and stores the API Key using operating-system-backed encryption

#### Scenario: Read provider settings
- **WHEN** the renderer requests current provider settings
- **THEN** it receives the Base URL, model and whether a key is configured, but never receives the key value

#### Scenario: Secure storage is unavailable
- **WHEN** the operating system cannot provide Electron secure storage
- **THEN** the system refuses to persist the API Key and does not fall back to plaintext

### Requirement: Explicit local-content consent
The system MUST NOT send configuration data to an AI provider unless local-content analysis consent is enabled.

#### Scenario: Analysis without consent
- **WHEN** the user requests analysis while consent is disabled
- **THEN** the system rejects the request before making a network call and guides the user to settings

### Requirement: Server-side analysis orchestration
The system SHALL read, redact and send configuration data from the main process through a provider abstraction using a versioned prompt.

#### Scenario: Successful analysis
- **WHEN** consent is enabled, provider settings are complete and the model returns a valid response
- **THEN** the system returns a structured summary, detected tool, risks, sections and recommendations

#### Scenario: Provider failure
- **WHEN** the provider is unreachable, rejects authentication, times out or returns invalid structured output
- **THEN** the page shows a safe actionable error while configuration viewing and scanning remain usable

### Requirement: Analysis result presentation
The system SHALL display the AI result in the selected configuration detail and distinguish summary, risks, configuration explanations and recommendations.

#### Scenario: Display a completed result
- **WHEN** analysis completes or a valid cached result exists
- **THEN** the AI tab displays the model, analysis time, cache status and structured result sections

#### Scenario: Display unavailable state
- **WHEN** consent is disabled or provider settings are incomplete
- **THEN** the AI tab explains the missing prerequisite and links the user to settings
