## ADDED Requirements

### Requirement: Authorized configuration reading
The system SHALL read configuration content only in the Electron main process and only for a regular, non-symbolic-link file contained by a directory the user explicitly authorized.

#### Scenario: Read an authorized configuration
- **WHEN** the user opens a supported configuration candidate inside an authorized directory
- **THEN** the system returns a configuration document without granting the renderer direct filesystem access

#### Scenario: Reject an unauthorized path
- **WHEN** the renderer requests a file outside every authorized directory
- **THEN** the system rejects the request without reading or returning file content

#### Scenario: Reject an oversized file
- **WHEN** a configuration file is larger than the configured 512 KiB viewing limit
- **THEN** the system rejects the read with a human-readable size-limit error

### Requirement: Safe configuration parsing
The system SHALL parse JSON, YAML, TOML, INI and `.env` files as inert data without executing file content.

#### Scenario: Parse a supported structured file
- **WHEN** an authorized supported configuration contains valid syntax
- **THEN** the system returns both structured data and a redacted text representation

#### Scenario: Fall back after syntax failure
- **WHEN** an authorized configuration contains invalid syntax
- **THEN** the system returns redacted text, a null structured value and a parse diagnostic without crashing the scan or page

### Requirement: Sensitive value redaction
The system MUST redact recognized credentials and secrets before configuration content crosses IPC or is sent to an AI provider.

#### Scenario: Redact a sensitive structured field
- **WHEN** parsed configuration contains a key such as `apiKey`, `token`, `password` or `clientSecret`
- **THEN** the value exposed to the renderer and AI provider is `[REDACTED]`

#### Scenario: Preserve non-sensitive values
- **WHEN** parsed configuration contains ordinary settings such as model name, timeout or feature flags
- **THEN** those values remain visible in the configuration detail

### Requirement: Configuration detail presentation
The system SHALL let users open a configuration candidate and browse its metadata, structured values and redacted text.

#### Scenario: Open configuration details
- **WHEN** the user selects a configuration row
- **THEN** the page displays a detail workspace with data and AI analysis tabs

#### Scenario: Browse nested values
- **WHEN** structured configuration contains objects or arrays
- **THEN** the page renders their hierarchy with readable keys, scalar values and nesting
