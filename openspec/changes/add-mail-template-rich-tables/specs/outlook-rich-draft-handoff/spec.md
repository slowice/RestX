## ADDED Requirements

### Requirement: Windows classic Outlook opens the rendered HTML draft
On Windows, the system SHALL use a fixed main-process PowerShell/COM adapter to create a classic Outlook mail item from a validated structured draft, display it for user review, and set recipients, subject, and sanitized HTML body. It MUST NOT send the item automatically.

#### Scenario: Open a valid rich draft
- **WHEN** the user explicitly opens a valid draft on Windows with classic Outlook available
- **THEN** Outlook displays an unsent editable message whose recipients, subject, table structure, and supported formatting match the RestX preview

#### Scenario: User retains final control
- **WHEN** RestX finishes creating the Outlook item
- **THEN** the compose window remains open for review and RestX has not invoked Send or unattended Save

### Requirement: The Outlook handoff preserves the default signature
The system SHALL allow classic Outlook to initialize the user's default signature and SHALL insert the rendered template body before that signature without exposing signature or mailbox contents to the renderer or logs.

#### Scenario: Open a draft with a configured signature
- **WHEN** classic Outlook initializes a default signature for a newly displayed mail item
- **THEN** the resulting HTML body contains the rendered template content followed by the existing signature

#### Scenario: Open a draft without a configured signature
- **WHEN** Outlook provides no default signature content
- **THEN** the resulting HTML body contains the rendered template content without adding an artificial signature placeholder

### Requirement: External draft input is bounded and injection-safe
The main process MUST independently validate recipients, subject, HTML/body limits, and the HTML allowlist before invoking Outlook. It SHALL pass user-authored content through private temporary files to a fixed script and spawn PowerShell without a command shell; it MUST NOT interpolate user content into executable commands or log message content.

#### Scenario: Draft contains command-like or HTML-like text
- **WHEN** recipients, subject, variables, or body text contain quotes, shell metacharacters, or markup-like text within allowed field rules
- **THEN** the content is treated only as draft data and cannot alter the PowerShell command or sanitized HTML structure

#### Scenario: Main receives invalid renderer input
- **WHEN** IPC input exceeds bounds, contains an invalid recipient, unresolved placeholder, or violates the HTML policy
- **THEN** main rejects the handoff before starting PowerShell or Outlook

#### Scenario: Temporary payload cleanup
- **WHEN** Outlook handoff succeeds, fails, or times out
- **THEN** the system removes the temporary payload directory and retains no logged recipients, subject, body, or signature content

### Requirement: Outlook failures are explicit and recoverable
The system SHALL report actionable failures for unsupported operating systems, missing classic Outlook, COM initialization failure, PowerShell policy denial, and bounded timeout. It MUST keep the editor and preview unchanged and MUST NOT silently downgrade a rich draft to a plain-text success.

#### Scenario: Classic Outlook is unavailable
- **WHEN** the user requests handoff but classic Outlook COM cannot be created
- **THEN** RestX reports that classic Outlook is unavailable and directs the user to copy the rich body manually

#### Scenario: PowerShell is blocked
- **WHEN** system policy prevents the fixed adapter from running
- **THEN** RestX reports the policy-related failure without exposing command output that contains message content

#### Scenario: Handoff is requested outside Windows
- **WHEN** the user requests rich-draft handoff on a non-Windows system
- **THEN** RestX explains that automatic rich-draft opening requires Windows classic Outlook and keeps the rich-copy recovery available
