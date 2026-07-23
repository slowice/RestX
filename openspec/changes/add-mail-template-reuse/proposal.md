## Why

Repeated business emails require users to copy recipients, subjects, and body content by hand, then find and replace the few values that change each time. A reusable local template workflow will reduce this repetitive work while keeping the final email visible for review before the user sends it.

## What Changes

- Add a standalone “邮件模板” feature and navigation entry.
- Let users create, edit, duplicate, and delete reusable email templates containing To, CC, BCC, subject, body, and default JSON data.
- Let users import previously sent Outlook `.eml` and `.msg` files into the template editor before reviewing and saving them.
- Render `{{variable}}` placeholders from the template defaults merged with per-send JSON, with per-send values taking precedence.
- Provide immediate validation for malformed JSON, missing variables, and invalid recipient addresses.
- Show the fully rendered email in a preview and open the prepared message in the system mail client for final review and sending.
- Persist templates locally without introducing Outlook account authorization or unattended sending.

## Capabilities

### New Capabilities

- `mail-template-reuse`: Manage local email templates, merge per-send JSON data, validate rendered messages, preview results, and hand them to the system mail client.

### Modified Capabilities

None.

## Impact

- Adds a new blue-zone renderer feature under `src/features/mail-template/` plus its scoped tests.
- Registers the feature through the renderer feature registry; the shell and router remain feature-agnostic.
- Uses local browser storage for template persistence and Electron's existing external-link handling for the `mailto:` handoff.
- Adds a main-process-only email file parser dependency for bounded local `.eml` and `.msg` parsing; no credentials or network access are introduced.
