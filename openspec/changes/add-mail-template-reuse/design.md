## Context

RestX has no email feature today. The requested first version prioritizes visible template reuse over mailbox integration: users need to save stable recipients, subject, body, and defaults, provide a small JSON object for the values that change, inspect the result, and continue in Outlook or another configured mail client. The repository requires each business feature to remain an isolated feature capsule and requires system access to pass through namespaced main/preload APIs.

## Goals / Non-Goals

**Goals:**

- Deliver a usable template library with create, edit, duplicate, delete, and automatic local persistence.
- Import previously sent Outlook `.eml` and `.msg` files into an editable, unsaved template draft.
- Merge template defaults with per-send JSON deterministically and render placeholders consistently across recipients, subject, and body.
- Make invalid JSON, unresolved variables, and malformed recipients obvious before mail-client handoff.
- Keep the generated email visible and editable before the user sends it.
- Preserve the feature boundary across renderer, shared, preload, and main processes.

**Non-Goals:**

- Microsoft account sign-in, Microsoft Graph, SMTP, or unattended sending.
- Reading Outlook mail, contacts, signatures, drafts, or delivery status.
- Attachments, rich-text editing, conditional template logic, or executable expressions.
- Importing attachments, inline images, signatures as structured components, or calendar/contact/task Outlook items.
- Shared/team template synchronization or server-side storage.

## Decisions

### Store template documents in feature-owned renderer storage

Templates are non-secret user-authored content and are needed only by this feature, so the first version will persist a versioned JSON envelope in `localStorage` under a feature-specific key. A defensive parser will fall back to seeded example templates if storage is absent or corrupt.

Alternatives considered:

- `electron-store` in main would add IPC and validation work to every edit without improving the first-version experience.
- Shared platform storage would violate feature ownership because no other feature needs this data.

### Keep rendering a pure shared operation

The feature will expose pure functions and types for parsing data, extracting placeholders, merging defaults, rendering fields, and collecting validation issues. Placeholder syntax is restricted to `{{variableName}}`, including dotted paths such as `{{customer.name}}`; arbitrary JavaScript and HTML execution are forbidden. Per-send JSON recursively overrides matching default object values, while arrays and scalar values replace defaults.

This allows deterministic unit testing and ensures the preview and mail-client handoff consume the same rendered draft.

### Use a three-pane reuse workflow

The renderer page will present a template list, a selected-template editor, and a reuse/preview workspace. Selecting a template immediately loads its saved defaults. Users can paste the per-send JSON, see merged values and validation results, then open the prepared draft.

Editing is explicit: changes are saved through a button rather than mutating the stored template on every keystroke. This makes experimentation with a template recoverable and keeps the stored list understandable.

### Hand off through a narrow main-process capability

The renderer will build a structured `MailDraft` and invoke a fixed feature API. The main handler will validate input bounds, recipient formats, and the generated `mailto:` scheme before calling Electron `shell.openExternal`. It will never accept an arbitrary URL or IPC channel from the renderer.

`mailto:` was chosen because it opens the user's configured Windows mail application without OAuth credentials and keeps the final Send action under user control. Outlook-specific Graph integration is intentionally deferred.

### Treat unresolved values as blocking

Malformed per-send JSON, non-object JSON roots, missing placeholders, invalid email addresses, and an empty recipient list prevent the Outlook action. The preview remains available and marks unresolved placeholders so users can correct their input.

### Parse Outlook files inside the feature main process

The renderer will invoke a fixed `importMessage` capability with no path argument. The main process will show a system picker limited to `.eml` and `.msg`, validate the selected file's canonical extension and size before reading it, and parse it locally. MSG attachment extraction is never invoked; EML MIME parts remain bounded by the whole-file limit. In both cases attachment bytes are discarded before the result is reduced to a small public DTO containing the source filename/format plus To, CC, BCC, subject, and plain-text body.

Parsing remains in `src/features/mail-template/main/`; raw bytes, HTML, attachment content, file paths, and sender metadata are not exposed to the renderer. HTML-only bodies are converted to text in main without DOM execution or remote resource loading. The imported DTO populates a new unsaved template so the user can review it, add placeholders/defaults, and explicitly save.

Alternatives considered:

- Renderer-side file parsing would expose raw local message data to a less privileged process and expand the renderer bundle.
- Supporting only `.eml` would exclude classic Outlook workflows that commonly produce `.msg` files.
- Outlook COM automation would be Windows-only, require installed classic Outlook, and conflict with the application's platform-neutral feature boundary.

## Risks / Trade-offs

- [Risk] `mailto:` support varies by operating system and mail client, and large bodies can exceed URI limits. → Mitigation: enforce conservative field/input bounds, show an actionable error if handoff fails, and keep the rendered content visible for manual copying.
- [Risk] Local storage can be cleared by the user or application data cleanup. → Mitigation: use a versioned envelope and avoid presenting it as synchronized or backed-up storage.
- [Risk] Email body formatting is plain text in the first version. → Mitigation: preserve line breaks and defer HTML/attachments to an authenticated Graph-based follow-up.
- [Risk] User-authored email content is sensitive. → Mitigation: keep it local, never log bodies or recipients, and do not expose it outside the feature except during the explicit mail-client handoff.
- [Risk] Email files are complex untrusted binary/MIME inputs. → Mitigation: restrict extensions and file size, parse only after explicit selection, disable attachment content, return a reduced DTO, and cover malformed inputs with tests.
- [Risk] Imported signatures or quoted conversation history may be mistaken for reusable body content. → Mitigation: import into an unsaved editor and require explicit review/save rather than automatically creating a stored template.

## Migration Plan

No existing data requires migration. Registering the feature adds a new menu entry and seeds local example templates only when the feature has no valid stored data. Rollback consists of removing the feature registrations and capsule; its namespaced local-storage entry can remain harmlessly or be deleted by the user.

## Open Questions

- Whether a later version should export/import RestX-native templates for backup.
- Whether Outlook Graph integration is needed for attachments, HTML fidelity, shared mailboxes, or direct sending after users validate this workflow.
