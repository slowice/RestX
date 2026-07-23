## 1. Template domain

- [x] 1.1 Define feature-owned template, draft, storage, and mail handoff contracts with bounded validation rules.
- [x] 1.2 Implement and unit-test JSON merging, placeholder extraction/rendering, recipient parsing, and rendered-draft validation.
- [x] 1.3 Implement and unit-test versioned local template persistence with safe seeded examples and corrupt-data recovery.

## 2. Outlook handoff boundary

- [x] 2.1 Add a namespaced main/preload capability that accepts only a validated structured mail draft and opens a bounded `mailto:` URI.
- [x] 2.2 Register the capability in main, preload, and the composed application API, with tests covering fixed-channel exposure and invalid input rejection.

## 3. Template reuse experience

- [x] 3.1 Build the mail-template feature page with template selection, create, edit, duplicate, delete, explicit save, and local persistence.
- [x] 3.2 Add per-send JSON input, default merging, validation feedback, rendered recipient/subject/body preview, and explicit mail-client handoff.
- [x] 3.3 Add responsive feature-owned styling and register the new navigation route without feature-specific shell or router logic.

## 4. Verification

- [x] 4.1 Add page behavior tests for template reuse, default fallback, per-send overrides, invalid JSON, unresolved variables, and CRUD flows.
- [x] 4.2 Run the complete test suite, typecheck, production build, and `git diff --check`, then document the manual verification path.

## 5. Outlook file import contracts and parsing

- [x] 5.1 Extend the feature API and namespaced IPC contract with a bounded, reduced imported-message DTO and no renderer-provided path.
- [x] 5.2 Implement local `.eml` and `.msg` selection and parsing with extension/size checks, attachment exclusion, HTML-to-text fallback, and actionable errors.
- [x] 5.3 Add parser and IPC tests for valid EML, normalized recipients, malformed input, cancellation, and invalid file boundaries.

## 6. Import-to-template experience

- [x] 6.1 Add an “导入 Outlook 邮件” action that loads parsed content into a new unsaved template without changing stored templates.
- [x] 6.2 Show import status/source format, preserve the current editor on cancellation/failure, and guide users to add placeholders before saving.
- [x] 6.3 Add page tests for successful import, explicit save, cancellation, and import failure behavior.

## 7. Import verification

- [x] 7.1 Run the complete test suite, typecheck, production build, and `git diff --check` with the import workflow included.
