## ADDED Requirements

### Requirement: Classic Outlook is discovered deterministically
The system MUST support classic Outlook discovery only on Windows. It SHALL check current-user and machine `App Paths` registrations across applicable registry views before checking deterministic common Microsoft Office installation paths, and it MUST return only an absolute `OUTLOOK.EXE` path that resolves to an existing regular file.

#### Scenario: Registered classic Outlook is available
- **WHEN** a valid classic Outlook executable is present in a queried App Paths registration
- **THEN** the system returns that executable before evaluating common installation path fallbacks

#### Scenario: Registry candidates are unusable
- **WHEN** registry entries are missing, unreadable, malformed, or refer to a missing file
- **THEN** the system skips those entries and checks the validated common installation candidates

#### Scenario: Classic Outlook is not installed
- **WHEN** no registry or common installation candidate resolves to a valid `OUTLOOK.EXE` file
- **THEN** the system fails with an actionable classic-Outlook-not-found error and does not invoke a system mail protocol handler

### Requirement: Prepared drafts launch through the registered command shape
The system SHALL launch classic Outlook through `exec()` using the logical command `"<OUTLOOK.EXE>" -c IPM.Note /mailto "<mailto URI>"`. It MUST preserve the complete URI as one Outlook argument, MUST protect Windows shell metacharacters from reinterpretation, MUST NOT use `execFile()` for the Outlook process, and MUST NOT call Electron `shell.openExternal()` as a fallback.

#### Scenario: Windows shell accepts a valid draft launch
- **WHEN** the user opens a valid rendered draft and a validated classic Outlook executable is available
- **THEN** the system gives the Windows shell the complete Outlook command and returns without waiting for Outlook to exit

#### Scenario: Platform is unsupported
- **WHEN** a draft launch is requested on a non-Windows platform
- **THEN** the system reports that mail is currently supported only with Windows classic Outlook and does not start another mail client

#### Scenario: Outlook launch fails
- **WHEN** the Windows shell rejects or cannot execute the classic Outlook command
- **THEN** the system reports an actionable launch failure without attempting a protocol-handler fallback

### Requirement: Outlook launch diagnostics are redacted
The system SHALL write feature-owned discovery and launch diagnostic events beneath the RestX logs directory. Events MAY include timestamps, stages, outcomes, stable error codes, candidate sources, validated executable paths, and sanitized error categories, but MUST NOT include the `mailto:` URI, recipients, subject, or body.

#### Scenario: Discovery or launch fails
- **WHEN** classic Outlook discovery or launch produces an error
- **THEN** the system attempts to append a redacted diagnostic event while preserving the original user-facing error even if logging also fails

#### Scenario: Diagnostic log is inspected
- **WHEN** a mail launch log entry is serialized
- **THEN** it contains no rendered recipient address, subject text, body text, or complete mail URI
