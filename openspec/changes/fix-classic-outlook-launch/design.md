## Context

The mail-template feature currently validates a structured draft, builds a bounded `mailto:` URI, and calls Electron `shell.openExternal()`. On Windows this delegates to the default protocol handler, which can be the web-based new Outlook and fail to create the draft. Starting classic Outlook with `execFile()` is also incompatible with the shell command shape Outlook registers and produces an “invalid argument” error on the target execution machine.

The change remains inside the blue-zone `mail-template` feature capsule. The structured IPC contract, renderer preview, local template persistence, and user-controlled final Send action remain unchanged. Mail content is sensitive and must not enter diagnostic logs.

## Goals / Non-Goals

**Goals:**

- Find an installed classic `OUTLOOK.EXE` deterministically on Windows.
- Launch a prepared draft with `exec()` using the registered command shape.
- Use Outlook-compatible semicolon separators for every recipient group.
- Return actionable errors without falling back to another mail client.
- Record redacted discovery and launch diagnostics.

**Non-Goals:**

- Supporting new Outlook, Outlook Web, macOS, Linux, or another default mail client.
- Sending mail automatically or adding Outlook account authorization.
- Changing stored template data, IPC channels, message import, or preview behavior.
- Logging recipients, subject, body, or a complete `mailto:` URI.

## Decisions

### Keep discovery and launch inside the mail-template main boundary

Add a feature-owned `classic-outlook.ts` module exposing `findClassicOutlookPath()` and `openWithClassicOutlook()`. `register.ts` will only build the validated URI and call the launcher. A separate feature-owned logger will write JSONL events beneath the existing RestX logs directory.

This preserves feature isolation and keeps process access out of renderer and preload code. Moving Outlook logic into `src/platform/` was rejected because it is not a stable cross-feature capability.

### Discover Outlook from the registry before checking common paths

`findClassicOutlookPath()` will query user and machine `App Paths\\OUTLOOK.EXE` registrations across applicable 64-bit and 32-bit views. It will then check deterministic candidates beneath `ProgramFiles`, `ProgramFiles(x86)`, and `ProgramW6432`, including Click-to-Run `root\\OfficeXX` and traditional `OfficeXX` layouts.

Every result must be an absolute path whose basename is `OUTLOOK.EXE` and whose target is an existing regular file. Invalid candidates are skipped. Registry-only discovery was rejected because registrations can be damaged or absent; path-only discovery was rejected because it misses custom installations.

### Execute the complete Outlook command through the Windows shell

The logical command is fixed as:

```text
"<absolute OUTLOOK.EXE>" -c IPM.Note /mailto "<mailto URI>"
```

`openWithClassicOutlook()` will use `node:child_process.exec()`, not `execFile()`, so Windows applies the same shell semantics as Outlook's registered command. A dedicated serializer will protect quotes, percent expansion, and other command metacharacters while preserving the arguments Outlook receives. The serializer accepts only a validated executable path and a URI produced by `buildMailtoUri()`.

The IPC call will return after the shell accepts the launch instead of waiting for the Outlook application to close. Observable asynchronous launch failures will still be logged. `shell.openExternal()` and protocol-handler fallback are removed from this path.

### Use semicolons before URI encoding

`buildMailtoUri()` will join To recipients with `;` and will join CC and BCC values with `;` before query-value encoding. This keeps the structured `MailDraft` unchanged while producing recipient lists that classic Outlook parses consistently.

### Fail closed and log only redacted metadata

Non-Windows calls fail with `UNSUPPORTED_PLATFORM`; exhaustive discovery failure uses `OUTLOOK_NOT_FOUND`; launch failure uses `OUTLOOK_LAUNCH_FAILED`. All failures attempt to append a feature-owned event to `~/.restx/logs/mail-template-YYYY-MM-DD.jsonl`.

Events may contain timestamp, stage, result, error code, candidate source, validated executable path, and a sanitized error category. They must never contain the URI or rendered mail fields. Logging failures do not replace the original user-facing error.

## Risks / Trade-offs

- [Risk] Office installation layouts and registry views vary across Windows versions. → Mitigation: query both user and machine App Paths registrations, inspect both applicable views, and retain validated common-path fallbacks.
- [Risk] Shell command strings can expand or reinterpret URI characters. → Mitigation: centralize Windows command serialization, restrict inputs, and test encoded percent signs, quotes, ampersands, and spaces.
- [Risk] Returning before Outlook exits means a later failure cannot always be shown synchronously in the UI. → Mitigation: validate platform and executable before launch, surface immediate shell errors, and log later non-zero exits without blocking the renderer.
- [Risk] The successful Windows path cannot be exercised on the current macOS development machine. → Mitigation: unit-test all injected Windows boundaries, functionally verify the unsupported-platform path in real Electron, and require final Windows execution-machine acceptance.
- [Trade-off] The mail feature becomes Windows/classic-Outlook-specific. → This is intentional; predictable classic Outlook behavior is preferred over an unreliable cross-platform default-handler fallback.

## Migration Plan

No data migration is required. Deploy the main-process launcher, recipient serialization, logger, and renderer copy together. Existing saved templates continue to produce the same structured `MailDraft` values.

Rollback restores the previous `shell.openExternal()` handler and comma serialization; no persisted state requires reversal. The change must not be pushed until focused checks pass and the Windows execution-machine handoff is accepted when requested by the user.

## Open Questions

None. Platform scope, discovery fallback, failure behavior, command shape, separator rules, and logging boundaries were approved before implementation.
