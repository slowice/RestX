## ADDED Requirements

### Requirement: Users can edit rich mail content and tables
The system SHALL provide a structured rich-text body editor with undo, redo, bold, italic, underline, text color, background color, horizontal alignment, table insertion and deletion, row and column insertion and deletion, cell merge and split, cell border/background/alignment controls, and resizable table columns. Table commands MUST be disabled when the current selection cannot validly perform them.

#### Scenario: Create and modify a table
- **WHEN** the user inserts a table and selects one or more cells
- **THEN** the system lets the user modify its rows, columns, merged cells, widths, borders, background, and alignment without corrupting surrounding content

#### Scenario: Preserve editor history
- **WHEN** the user changes table structure or formatting and chooses undo or redo
- **THEN** the system restores the corresponding valid editor state

### Requirement: Excel tables paste with supported formatting
The system SHALL prefer the clipboard HTML representation of an Excel selection and SHALL preserve table structure, merged cells, borders, background color, font family, font size, font weight/style, text color, alignment, wrapping, and valid column widths through editing, preview, saving, and reload. It MUST remove formulas, scripts, event handlers, external resources, unsupported elements, and Office metadata before content enters template state.

#### Scenario: Paste a formatted Excel selection
- **WHEN** the user copies a formatted range from Excel containing merged cells and pastes it into the body editor
- **THEN** the system inserts an editable table that retains the supported structure and visible formatting

#### Scenario: Paste tabular text without HTML
- **WHEN** the clipboard has no usable HTML but its plain text contains tab-separated columns and newline-separated rows
- **THEN** the system inserts a basic editable table at the current selection and informs the user that basic conversion was used

#### Scenario: Reject unsafe clipboard markup
- **WHEN** clipboard HTML includes scripts, event attributes, remote resources, formulas, embedded objects, or unsupported markup
- **THEN** the system removes unsafe content while retaining safe table content and does not execute or load the removed content

#### Scenario: Preserve content on conversion failure
- **WHEN** clipboard table content cannot be safely parsed or converted
- **THEN** the system reports the failure and leaves the existing body unchanged

### Requirement: Rich template variables render as safe text
The system SHALL resolve `{{variable}}` and dotted-path placeholders in text nodes of rich body content, including table cells, using merged default and per-send JSON data. It MUST HTML-escape replacement values and MUST NOT treat placeholders in element names, attributes, URLs, or CSS as template expressions.

#### Scenario: Render a variable inside a table cell
- **WHEN** a table cell contains `{{project.owner}}` and merged JSON provides the value
- **THEN** the preview and Outlook draft display the value inside the cell without changing table structure or formatting

#### Scenario: Escape markup supplied as a value
- **WHEN** a placeholder value contains HTML-like text or a script fragment
- **THEN** the system displays it as inert text and does not create executable or structural markup

#### Scenario: Block an unresolved rich-body variable
- **WHEN** a rich-body text node contains a placeholder absent from defaults and per-send data
- **THEN** the preview identifies the missing variable, retains a visible marker, and disables Outlook handoff

### Requirement: Rich bodies are sanitized and previewed consistently
The system MUST enforce an explicit mail-safe HTML element, attribute, and CSS-property allowlist before paste insertion, persistence, preview, and main-process handoff. The preview SHALL render the same sanitized and variable-resolved HTML sent to Outlook and MUST NOT load remote images or provide active navigation from pasted content.

#### Scenario: Preview a valid formatted table
- **WHEN** all variables resolve and the rich body passes validation
- **THEN** the preview displays the same table structure and supported inline formatting prepared for Outlook

#### Scenario: Remove disallowed stored markup
- **WHEN** renderer or stored template input contains disallowed tags, attributes, URL-bearing content, or CSS
- **THEN** the system removes it before display or external handoff and reports a validation problem when safe conversion would lose required content

### Requirement: Stored templates migrate without losing plain-text bodies
The system SHALL store canonical sanitized HTML and a derived plain-text fallback in a version-2 feature-owned envelope. It SHALL migrate every valid version-1 plain-text body in memory by escaping markup and preserving line breaks, and SHALL persist the migrated record only after an explicit user save. It MUST NOT replace a recognized but invalid user envelope with seed templates.

#### Scenario: Load an existing version-1 template
- **WHEN** local storage contains a valid version-1 template with multiple lines and HTML-like characters in its body
- **THEN** the editor displays the same readable text and line structure without interpreting those characters as markup

#### Scenario: Save a migrated template
- **WHEN** the user explicitly saves a migrated version-1 template
- **THEN** the system writes a valid version-2 template containing sanitized HTML and its derived plain-text fallback

#### Scenario: Encounter invalid stored user data
- **WHEN** the loader recognizes a mail-template envelope but cannot safely migrate or validate its records
- **THEN** the system preserves the stored value, reports a recoverable load error, and does not overwrite it with examples

### Requirement: Users can copy the rendered rich body for recovery
The system SHALL let users copy the final rendered body with both `text/html` and `text/plain` clipboard representations while keeping the current preview and form state unchanged.

#### Scenario: Copy a rich table from preview
- **WHEN** the user chooses “复制富文本正文” for a valid rendered body
- **THEN** pasting into a rich-capable target retains supported table formatting while pasting into a plain-text target yields readable fallback text
