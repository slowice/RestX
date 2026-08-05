## Why

Windows currently delegates generated `mailto:` URIs to the system default handler, which can select the web-based new Outlook and fail to create the draft. RestX needs a deterministic handoff to installed classic Outlook using the same command shape registered by Outlook itself.

## What Changes

- Replace the mail-template feature's system protocol handoff with direct discovery and launch of classic Outlook on Windows.
- Add registry-first classic Outlook discovery with validated common-install-path fallbacks.
- Launch Outlook through `exec()` with the full `"OUTLOOK.EXE" -c IPM.Note /mailto "mailto:..."` command instead of `execFile()` or Electron `shell.openExternal()`.
- Separate multiple To, CC, and BCC recipients with semicolons in the generated mail URI.
- Fail without fallback on unsupported platforms or when classic Outlook is unavailable, and write redacted feature-owned diagnostic logs.
- Update user-facing handoff messages to refer specifically to classic Outlook.

## Capabilities

### New Capabilities

- `classic-outlook-launch`: Discover, validate, and safely launch classic Outlook from the mail-template main process with redacted diagnostics.

### Modified Capabilities

- `mail-template-reuse`: Change prepared-email handoff from the system mail client to Windows classic Outlook and require semicolon-separated recipient lists.

## Impact

- Affects `src/features/mail-template/main/`, the mail-template renderer handoff messaging, and focused mail-template tests.
- Preserves the existing structured draft IPC contract, template storage format, preview flow, and user-controlled final Send action.
- Removes the mail-template feature's runtime dependency on Electron `shell.openExternal()` for draft handoff.
- Adds no third-party runtime dependency and introduces no network access or Outlook account authorization.
