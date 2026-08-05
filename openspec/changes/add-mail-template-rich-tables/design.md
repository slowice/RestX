## Context

The mail-template feature is an isolated feature capsule whose renderer currently edits `body: string` in a textarea, stores a version-1 JSON envelope in `localStorage`, renders placeholders as plain text, and hands a validated draft to main for a `mailto:` launch. A `mailto:` URI has no interoperable HTML-body contract, while Excel exposes its useful table representation through the clipboard's `text/html` flavor. The approved target is Windows classic Outlook, including preservation of Excel table structure, merged cells, borders, colors, fonts, alignment, and widths.

The implementation must keep untrusted clipboard/template HTML within a strict allowlist, preserve the current explicit Save and final-review workflow, remain inside `src/features/mail-template/`, and never automate Send. The macOS development environment can exercise the editor and Electron renderer but cannot provide end-to-end evidence for Windows Outlook COM.

## Goals / Non-Goals

**Goals:**

- Provide a reliable rich-text editor with complete table creation and editing controls.
- Preserve the approved subset of Excel table formatting from paste through RestX preview and a classic Outlook draft.
- Keep `{{variable}}` placeholders safe and usable in paragraphs and table cells.
- Migrate existing plain-text templates without losing content or overwriting recoverable user data.
- Create and display an unsent classic Outlook HTML draft through a narrow, validated main-process capability.
- Preserve the user's default Outlook signature and provide an explicit rich-copy recovery path.

**Non-Goals:**

- New Outlook, macOS Outlook, web Outlook, Graph API, SMTP, or unattended sending.
- Excel formulas, scripts, macros, external images, remote stylesheets, embedded objects, charts, or Office-specific executable content.
- Pixel-perfect support for every Excel/Word proprietary style or every Outlook rendering quirk.
- Attachments, inline images, conditional template logic, team synchronization, or a general-purpose platform rich-text service.

## Decisions

### Use Tiptap as a feature-owned structured rich-text editor

The renderer will replace only the body textarea with a `RichMailEditor` built from Tiptap/ProseMirror and feature-local extensions. It will expose undo/redo, bold, italic, underline, text/background color, alignment, table insertion/removal, row/column insertion/removal, cell merge/split, cell styling, and resizable columns. Toolbar controls will derive their enabled and active states from the editor selection.

Tiptap is preferred over custom `contenteditable` behavior because ProseMirror already owns selection mapping, history, table-node invariants, and keyboard behavior. A separate spreadsheet-like block editor was rejected because it prevents natural paragraph/table interleaving and makes pasted mail content harder to edit.

### Normalize Excel clipboard content before it enters editor state

A feature-local paste transformer will prefer `text/html`, locate the clipboard fragment, and recognize tabular content. It will discard scripts, event handlers, formula/Office metadata, external resources, and unsupported tags before parsing. Supported Excel presentation will be materialized as inline styles on table, row, and cell nodes: borders, background, font family/size/weight/style, text color, horizontal/vertical alignment, wrapping, and valid pixel/point widths. `rowspan` and `colspan` will be retained within bounded values.

When HTML is unavailable but `text/plain` contains tab/newline-delimited data, the transformer will create a basic table. Unsafe or unparseable content will not replace existing editor content. General rich text pasted from non-Excel sources follows the same final HTML allowlist but does not receive Excel-specific style expansion.

### Store canonical sanitized HTML with derived plain text

`MailTemplate` and `MailDraft` will carry `bodyHtml` and `bodyText`. `bodyHtml` is the canonical editable and previewable representation; `bodyText` is derived at save/render time for validation, accessibility, recovery, and non-rich fallbacks. The storage envelope will advance to version 2.

The loader will convert a valid v1 `body` by HTML-escaping it and preserving line breaks as paragraphs/breaks. Migration occurs in memory and is persisted only on the user's next explicit Save. A recognized but invalid v2/v1 envelope will return a recoverable load error rather than silently replacing user content with seed templates. Seed templates will be authored in v2 format.

### Render placeholders only in text nodes

Placeholder discovery and substitution will parse sanitized HTML and operate only on text-node content, never tag names, attributes, URLs, or CSS. Replacement values are inserted as text and HTML-escaped. This supports placeholders inside table cells without allowing a JSON value to introduce markup. The same merged data produces both `bodyHtml` and `bodyText`; missing placeholders remain visible, are highlighted in the preview, and block Outlook handoff.

### Apply the same allowlist at renderer and main trust boundaries

The renderer sanitizes on paste, editor update, preview, and persistence. Main independently validates and sanitizes the structured draft before any external handoff because renderer data is untrusted IPC input. Allowed elements are limited to mail-safe text structure and tables. Allowed CSS properties are an explicit subset; URL-bearing content, style blocks, classes, IDs, forms, media, SVG, embedded content, comments, event attributes, and Office metadata are removed.

The preview renders only the final sanitized fragment inside a feature-owned container. It does not load remote images or make pasted links navigable. A shared sanitizer/configuration module will keep the renderer and main policies aligned; tests will assert equivalent results in both environments.

### Use a static PowerShell adapter for Windows classic Outlook

The existing preload API remains namespaced but its structured draft contract gains rich-body fields. On Windows, main will validate the draft, write its JSON/HTML payload to a private temporary directory, and spawn `powershell.exe` with `shell: false` and a fixed script path. User content will never be interpolated into a command or script. The script will instantiate `Outlook.Application`, create a mail item, call `Display()` to allow Outlook to initialize the default signature, then prefix the sanitized template HTML to the existing `HTMLBody`, assign recipients/subject, and leave the compose window open. It will never call `Send()` or save mailbox content.

The adapter will have a bounded timeout, capture only sanitized categorical diagnostics, release COM objects, and remove the temporary directory in success and failure paths. Non-Windows systems, unavailable COM, missing classic Outlook, or PowerShell policy failures return actionable error codes. The application will not silently claim success through plain-text `mailto:`.

### Provide explicit recovery without weakening success semantics

The preview will expose “复制富文本正文”. It writes both `text/html` and `text/plain` clipboard flavors so a user can manually paste into Outlook. If COM handoff fails, the preview and data remain unchanged and the UI points to this recovery action. The existing `mailto:` builder may remain for plain-text compatibility code, but it is not the success path for a draft containing rich content or tables.

## Risks / Trade-offs

- [Risk] Excel clipboard HTML differs across Excel versions and locales. → Keep conversion table-focused, normalize only an explicit property set, bound complex spans/sizes, and test representative Windows Excel fragments plus tab-delimited fallback.
- [Risk] Classic Outlook's Word rendering engine may adjust unsupported CSS. → Emit conservative table markup with inline styles and validate representative merged cells, widths, borders, colors, fonts, and alignment in Windows acceptance testing.
- [Risk] A rich editor and sanitizer increase bundle size. → Load the mail-template page lazily as it is today and include extensions only for approved controls.
- [Risk] Dual HTML/plain-text fields can drift. → Treat sanitized HTML as canonical and regenerate text instead of accepting independently edited text.
- [Risk] COM or PowerShell may be disabled by enterprise policy. → Return a specific failure, retain preview state, and provide dual-flavor rich clipboard copy without claiming Outlook handoff succeeded.
- [Risk] Calling `Display()` before setting the body can briefly show an empty draft or race signature initialization. → Keep Outlook interaction inside one adapter, preserve the body observed after display, and cover ordering through adapter-level tests plus Windows manual validation.
- [Risk] v1 local storage may contain unexpected data. → Use a non-destructive parser, migrate only validated v1 records, and never overwrite an unrecognized envelope automatically.

## Migration Plan

1. Add v2 rich-body contracts and a pure v1-to-v2 loader migration while retaining the old storage key for discovery.
2. Introduce sanitizer, rich renderer, Excel transformer, and editor UI behind the existing mail-template route.
3. Change preview and variable rendering to consume canonical sanitized HTML and derived text.
4. Add the Outlook adapter and update the namespaced IPC handler after shared validation is in place.
5. Validate migration and editor behavior before exercising the external draft action.

Rollback removes the rich editor/adapter and restores v1 code. Because a saved v2 envelope cannot be read by old code, rollback must first export or transform v2 templates back to escaped plain text; implementation will keep a pure v2-to-text conversion available for that recovery. No automatic destructive downgrade will run.

## Open Questions

No product decisions remain open. Actual classic Outlook rendering and default-signature ordering require one Windows acceptance pass because they cannot be verified in the current macOS development environment.
