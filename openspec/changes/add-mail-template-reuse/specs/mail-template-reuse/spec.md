## ADDED Requirements

### Requirement: Users can manage reusable email templates
The system SHALL let users create, edit, duplicate, and delete feature-owned email templates containing a name, To recipients, optional CC and BCC recipients, subject, plain-text body, and a default JSON object. The system SHALL persist valid templates locally and SHALL seed usable examples only when no valid template collection exists.

#### Scenario: Save a reusable template
- **WHEN** the user enters a valid template name, at least one recipient, subject, body, and valid default JSON object and chooses save
- **THEN** the system stores the template locally and makes it available for later selection

#### Scenario: Duplicate a template
- **WHEN** the user duplicates an existing template
- **THEN** the system creates a separately editable copy without changing the original

#### Scenario: Delete a template
- **WHEN** the user confirms deletion of a template
- **THEN** the system removes only that template and selects another available template or a new-template editor

### Requirement: Users can supply per-send JSON data
The system SHALL accept a JSON object for each reuse operation and SHALL recursively merge it over the selected template's default data, with per-send values taking precedence. The system MUST reject malformed JSON and JSON roots that are not objects without replacing the last stored template.

#### Scenario: Per-send values override defaults
- **WHEN** a template default contains `{"project":"默认项目","owner":{"name":"默认负责人"}}` and the user supplies `{"project":"RestX","owner":{"name":"小王"}}`
- **THEN** the rendered message uses `RestX` and `小王`

#### Scenario: Missing per-send values use defaults
- **WHEN** the per-send JSON omits a placeholder that is present in template defaults
- **THEN** the rendered message uses the corresponding default value

#### Scenario: Invalid JSON is entered
- **WHEN** the user enters malformed JSON or a non-object JSON root
- **THEN** the system displays an error and disables mail-client handoff

### Requirement: Template placeholders render consistently
The system SHALL replace `{{variable}}` placeholders in To, CC, BCC, subject, and body fields using the merged data object. It SHALL support dotted object paths and SHALL format string, number, and boolean values as text without executing template content as code.

#### Scenario: Render a complete message
- **WHEN** all placeholders have corresponding merged values
- **THEN** the preview displays fully rendered recipients, subject, and body with no remaining placeholder tokens

#### Scenario: A variable is unresolved
- **WHEN** a placeholder has no corresponding value in either defaults or per-send JSON
- **THEN** the preview retains and highlights the unresolved placeholder, lists the missing variable, and disables mail-client handoff

### Requirement: Generated email is validated before handoff
The system MUST validate that at least one To recipient exists, every rendered recipient is a syntactically valid email address, required rendered fields do not contain unresolved variables, and configured field limits are respected. It SHALL present validation issues without logging recipient or body content.

#### Scenario: Invalid recipient blocks handoff
- **WHEN** a rendered recipient is not a valid email address
- **THEN** the system identifies the affected recipient group and disables the handoff action

#### Scenario: Valid message enables handoff
- **WHEN** the per-send JSON is valid, all placeholders resolve, recipient addresses are valid, and size limits are satisfied
- **THEN** the system enables the action for opening the prepared email in the system mail client

### Requirement: Users review the result before sending
The system SHALL show the same rendered draft used for mail-client handoff and SHALL require an explicit user action to open it. The renderer MUST NOT send mail directly or request arbitrary external URLs.

#### Scenario: Open a prepared email
- **WHEN** the user explicitly chooses to open a valid rendered draft
- **THEN** the main process validates the structured draft, constructs a `mailto:` URI, and opens it through the system mail client for final review and sending

#### Scenario: External handoff fails
- **WHEN** the operating system cannot open the configured mail client
- **THEN** the system reports the failure while leaving the rendered recipients, subject, and body visible for manual use

### Requirement: Users can import Outlook message files as editable templates
The system SHALL let users select one local `.eml` or `.msg` Outlook message file and SHALL extract its To, CC, BCC, subject, and readable plain-text body into the template editor. Imported content MUST remain editable and MUST NOT be persisted until the user explicitly saves the template.

#### Scenario: Import a valid Outlook message
- **WHEN** the user selects a valid `.eml` or `.msg` email file within the configured size limit
- **THEN** the system opens an unsaved template populated with the extracted recipients, subject, and plain-text body and identifies the source format

#### Scenario: Convert HTML-only content to editable text
- **WHEN** an imported message contains HTML body content but no plain-text alternative
- **THEN** the system converts the readable HTML content to plain text without executing scripts or loading remote resources

#### Scenario: Review and parameterize imported content
- **WHEN** imported content is displayed in the template editor
- **THEN** the user can replace changing values with `{{variable}}` placeholders, configure defaults, preview the result, and explicitly save it as a new template

#### Scenario: Reject unsupported or unsafe input
- **WHEN** the selected file has an unsupported extension, exceeds the configured size limit, is malformed, or does not contain usable email content
- **THEN** the system reports an actionable error without storing or logging the file contents

#### Scenario: Cancel file selection
- **WHEN** the user cancels the system file picker
- **THEN** the current template and per-send data remain unchanged
