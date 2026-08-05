## 1. Rich Body Foundation

- [x] 1.1 Add the approved Tiptap/table and HTML-sanitization dependencies using the repository's proxy-free pnpm workflow.
- [x] 1.2 Upgrade shared mail-template contracts and validation to canonical sanitized `bodyHtml` plus derived `bodyText`, including bounded IPC input.
- [x] 1.3 Implement the version-2 storage envelope, non-destructive v1 migration, v2 seed data, and recoverable invalid-storage reporting.
- [x] 1.4 Implement safe rich-body placeholder discovery/substitution in text nodes and deterministic HTML-to-text derivation.

## 2. Rich Editor and Excel Paste

- [x] 2.1 Build the feature-owned Tiptap editor with approved inline formatting, history, alignment, and complete table commands.
- [x] 2.2 Implement resizable columns and cell border, background, and alignment controls with valid selection-state handling.
- [x] 2.3 Implement bounded Excel clipboard HTML normalization for structure, merged cells, supported inline formatting, and removal of unsafe or Office-specific content.
- [x] 2.4 Implement tab/newline-delimited plain-text fallback conversion and non-destructive paste error notices.
- [x] 2.5 Integrate the rich editor into template create/import/select/save/duplicate/delete flows without changing the feature's explicit-save behavior.

## 3. Preview and Recovery

- [x] 3.1 Replace the plain-text preview with isolated rendering of the final sanitized HTML and safe unresolved-variable highlighting.
- [x] 3.2 Add dual-flavor `text/html` and `text/plain` rich-body copy with success/error feedback.
- [x] 3.3 Update imported `.eml`/`.msg` content to enter the rich editor safely while retaining readable plain-text fallback behavior.

## 4. Classic Outlook Handoff

- [x] 4.1 Implement the fixed Windows PowerShell/COM adapter with private temporary payloads, `shell: false`, bounded execution, categorical errors, and guaranteed cleanup.
- [x] 4.2 Create and display the unsent classic Outlook item, initialize and preserve the default signature, and place the rendered body before it without invoking Send or unattended Save.
- [x] 4.3 Update the namespaced main/preload handoff so main independently validates/sanitizes rich drafts and non-Windows or COM failures point to rich-copy recovery without silent plain-text success.

## 5. Focused Verification

- [x] 5.1 Add lean regression tests for v1 migration, invalid-storage preservation, sanitizer boundaries, text-node placeholder escaping, Excel HTML/table fallback conversion, and rich-draft validation.
- [x] 5.2 Add adapter tests for fixed process arguments, content isolation from commands/logs, timeout/error mapping, signature/body ordering contract, and temporary-file cleanup.
- [x] 5.3 Run the affected mail-template tests and TypeScript checks with proxy variables unset, fixing only failures caused by this change.
- [x] 5.4 Start the real Electron application and functionally verify table insertion/editing, representative Excel paste, save/reload, variable preview, and dual-flavor copy; capture findings without writing real user mail data.
- [ ] 5.5 Perform a Windows classic Outlook acceptance pass for formatted/merged tables, widths, signature preservation, editable compose state, and confirmation that no automatic send occurs.

## 6. Integration

- [x] 6.1 Review the worktree diff for feature-boundary, security, unrelated-file, generated-artifact, and OpenSpec task consistency issues.
- [ ] 6.2 Integrate the completed worktree changes into local `main`, run only conflict-affected checks if needed, create the final local commit, and remove the merged feature worktree and branch without pushing unless explicitly requested.
