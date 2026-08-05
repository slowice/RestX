## ADDED Requirements

### Requirement: Recipient groups use the classic Outlook separator
The system MUST serialize multiple To, CC, and BCC recipients with semicolons when constructing the bounded `mailto:` URI for classic Outlook. It SHALL preserve the existing structured recipient arrays and validation rules.

#### Scenario: Draft contains multiple recipient groups
- **WHEN** a valid rendered draft contains multiple To, CC, or BCC addresses
- **THEN** each recipient group in the generated URI represents its addresses as a semicolon-separated list

## MODIFIED Requirements

### Requirement: Generated email is validated before handoff
The system MUST validate that at least one To recipient exists, every rendered recipient is a syntactically valid email address, required rendered fields do not contain unresolved variables, and configured field limits are respected. It SHALL present validation issues without logging recipient or body content.

#### Scenario: Invalid recipient blocks handoff
- **WHEN** a rendered recipient is not a valid email address
- **THEN** the system identifies the affected recipient group and disables the handoff action

#### Scenario: Valid message enables handoff
- **WHEN** the per-send JSON is valid, all placeholders resolve, recipient addresses are valid, and size limits are satisfied
- **THEN** the system enables the action for opening the prepared email in Windows classic Outlook

### Requirement: Users review the result before sending
The system SHALL show the same rendered draft used for classic Outlook handoff and SHALL require an explicit user action to open it. The renderer MUST NOT send mail directly or request arbitrary external URLs. The main process MUST open only a validated `mailto:` URI through a discovered Windows classic Outlook executable and MUST NOT delegate the handoff to the system default mail protocol handler.

#### Scenario: Open a prepared email
- **WHEN** the user explicitly chooses to open a valid rendered draft on Windows and classic Outlook is installed
- **THEN** the main process validates the structured draft, constructs a bounded `mailto:` URI, and opens a classic Outlook compose window for final review and sending

#### Scenario: Classic Outlook is unavailable
- **WHEN** the platform is not Windows, classic Outlook cannot be found, or the launch command fails
- **THEN** the system reports an actionable failure without fallback while leaving the rendered recipients, subject, and body visible for manual use
