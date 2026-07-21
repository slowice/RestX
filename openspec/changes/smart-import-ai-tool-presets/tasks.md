## 1. Runtime preset registry

- [x] 1.1 Move built-in definitions to JSON data files.
- [x] 1.2 Add strict standalone preset validation and duplicate-id protection.
- [x] 1.3 Load JSON/YAML user presets from `~/.RestX/presets/` with isolated errors.
- [x] 1.4 Add atomic save, enable/disable, delete, and list operations.
- [x] 1.5 Feed the merged registry into discovery and JSONL profile lookup.

## 2. Smart generation

- [x] 2.1 Add bounded metadata-only inventory collection.
- [x] 2.2 Add the strict preset-generation prompt and compatible-provider call.
- [x] 2.3 Parse, normalize, and validate model output.
- [x] 2.4 Trial-scan drafts without persisting them.
- [x] 2.5 Add authorized IPC and preload contracts.

## 3. UI

- [x] 3.1 Add the Inspector “智能导入” entry point.
- [x] 3.2 Add information, metadata-consent, generation, preview, and confirmation states.
- [x] 3.3 Show generated rules, warnings, and trial matches.
- [x] 3.4 Add imported preset enable/disable and delete management.

## 4. Verification

- [x] 4.1 Test validation, unsafe output rejection, duplicate ids, and malformed files.
- [x] 4.2 Test inventory bounds and no-content behavior.
- [x] 4.3 Test provider prompt/response parsing and AI-call logs.
- [x] 4.4 Test UI generation, preview, confirmation, and error states.
- [x] 4.5 Run typecheck, tests, build, real scan, strict OpenSpec validation, and macOS package smoke test.
