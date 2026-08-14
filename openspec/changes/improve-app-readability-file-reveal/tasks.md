## 1. Typography Foundation

- [x] 1.1 Audit platform and feature renderer styles that use user-facing text below the approved semantic floors
- [x] 1.2 Add platform semantic typography variables and migrate platform navigation, headers, controls, notices, and shared states
- [x] 1.3 Migrate each feature renderer to the semantic typography floors and adjust only layouts directly affected by larger text

## 2. AI History Readability

- [x] 2.1 Update AI Inspector tool, folder, file, session, search, JSONL, configuration, and import typography
- [x] 2.2 Adjust AI Inspector list/detail layouts so enlarged text does not overlap, hide key actions, or create avoidable truncation

## 3. History File Reveal

- [x] 3.1 Add a reusable AI Inspector renderer reveal action with non-blocking error feedback
- [x] 3.2 Expose “打开文件位置” in file rows, session rows, Workspace search results, and the JSONL detail header, including compact detail layouts
- [x] 3.3 Strengthen the existing main handler with authorized-file existence validation while preserving the shared/preload contract

## 4. Verification

- [x] 4.1 Add or update focused renderer and main regression tests for reveal entry points, authorized paths, missing files, and retained history state
- [x] 4.2 Run affected TypeScript checks, focused tests, OpenSpec validation, and `git diff --check`
- [x] 4.3 Start real Electron on an isolated CDP port and visually inspect representative application pages plus AI history states
- [x] 4.4 Use an isolated history file to verify the operating system reveals and selects the source file, then record final PASS or FAIL
