## 1. Classic Outlook launch boundary

- [x] 1.1 Add a feature-owned redacted mail launch JSONL logger using the existing RestX logs directory.
- [x] 1.2 Implement `findClassicOutlookPath()` with Windows-only registry-first discovery, deterministic common Office path fallbacks, candidate validation, and stable errors.
- [x] 1.3 Implement safe full-command serialization and `openWithClassicOutlook()` using `exec()` without waiting for Outlook to exit or falling back to a protocol handler.

## 2. Mail-template integration

- [x] 2.1 Change To, CC, and BCC URI serialization to use semicolon-separated recipient lists while retaining current validation and bounds.
- [x] 2.2 Route the mail-template `openDraft` IPC handler through the classic Outlook launcher and remove its `shell.openExternal()` dependency.
- [x] 2.3 Update renderer success and failure-facing copy to describe Windows classic Outlook without changing the preview or final-send boundary.

## 3. Focused verification

- [x] 3.1 Add focused tests for registry and path precedence, executable validation, unsupported and not-found errors, exact `exec()` command structure, shell metacharacter preservation, non-blocking launch behavior, and log redaction.
- [x] 3.2 Update mailto, IPC-boundary, and renderer tests for semicolon-separated recipients and classic Outlook messaging.
- [x] 3.3 Run the focused mail-template tests, applicable TypeScript checks, `git diff --check`, and strict OpenSpec validation; fix only affected failures.
- [x] 3.4 Start real Electron on macOS and verify the unsupported-platform error and redacted log without invoking another mail client.
- [x] 3.5 Verify on the Windows execution machine that classic Outlook—not new Outlook—opens the draft with correct To, CC, BCC, subject, and body, and that missing Outlook produces an error plus a redacted log.
