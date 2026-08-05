## Why

The mail-template feature stores and edits the message body as plain text, so tables copied from Excel lose their structure and formatting and the current `mailto:` handoff cannot preserve an HTML table in Outlook. Users need an end-to-end rich-table workflow that remains editable in RestX and opens as a formatted draft in classic Outlook on Windows.

## What Changes

- Replace the plain-text body field with a rich-text editor that supports complete table creation and editing operations.
- Accept Excel clipboard HTML, preserve supported table structure and presentation, and safely fall back from tabular plain text when HTML is unavailable.
- Render template variables safely inside rich-text content and table cells while preventing values from altering markup or styles.
- Store sanitized HTML plus a generated plain-text fallback in a versioned mail-template envelope and migrate existing v1 plain-text templates without data loss.
- Preview the same sanitized rich body that will be handed to Outlook and provide rich-copy recovery when Outlook cannot be opened.
- Add a Windows-only classic Outlook adapter that creates and displays an unsent HTML draft through a fixed PowerShell/COM integration, preserving the user's default signature and never sending automatically.

## Capabilities

### New Capabilities

- `rich-mail-template-body`: Rich-text mail-body editing, Excel table paste, safe variable rendering, preview, persistence, and v1-to-v2 migration.
- `outlook-rich-draft-handoff`: Validated Windows classic Outlook HTML draft creation with signature preservation and explicit fallback behavior.

### Modified Capabilities

None. There are no synchronized main specs for the existing mail-template change; the new capability specs define the additive rich-body behavior.

## Impact

- Affects only `src/features/mail-template/` across renderer, shared contract/engine, preload API, and main-process handler boundaries.
- Changes the feature-owned local-storage envelope from v1 plain-text bodies to v2 rich bodies with a backward-compatible loader migration.
- Adds Tiptap rich-text/table extensions and an HTML sanitization dependency.
- Replaces the primary Windows handoff path from a plain-text `mailto:` URI to a fixed classic Outlook COM adapter while retaining plain-text content for recovery paths.
- Requires Windows classic Outlook for end-to-end rich-draft validation; editor, migration, rendering, and Electron UI behavior remain independently testable.
